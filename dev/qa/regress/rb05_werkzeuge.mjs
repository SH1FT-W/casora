// @zustand: arbeit
// @parallel: ui
// Neues Studio (B): Alles aus der früheren Seitenleiste bleibt über die Werkzeugleiste erreichbar.
// Erwartet: Dashboard-Menü öffnet Bedienung (Verweis „Design (für alle Dashboards)“), Wetter, Uhrzeit, Benachrichtigungen und
// Szenen; das Titelmenü (Dashboard-Name) wechselt Dashboards und enthält Umbenennen, Symbol,
// Löschen (UX-03), „…“ diese nicht mehr; Zeitreise als Uhr neben Rückgängig; Einstellungen-Menü alle Einstellungsseiten
// und Updates; das Raummenü wechselt Räume, verschiebt sie und öffnet „Räume ordnen“;
// „…“ › Hilfe › „Bisheriges Studio öffnen“ und „…“ › „Neues Studio öffnen“ schalten hin und zurück. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const menu = () => H(() => window.__pierce('.combo-menu .combo-opt').filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
const close = () => H(() => window.__panel()._bClose());

// Dashboard-Menü
await page.locator('.btool[data-b=dash]').click();
await page.waitForTimeout(600);
const dm = await menu();
await check('Dashboard-Menü: Bedienung, Wetter, Uhrzeit, Benachrichtigungen, Szenen, Verweis aufs Design',
  ['Bedienung', 'Design (für alle Dashboards)', 'Wetter', 'Uhrzeit', 'Benachrichtigungen', 'Szenen'].every((x) => dm.some((t) => t.replace(/^✓/, '').indexOf(x) === 0)), dm);
await page.locator('.combo-opt', { hasText: 'Wetter' }).first().click();
await page.waitForTimeout(1200);
const w = await H(() => { const p = window.__panel(); return { open: p.classList.contains('binsp'), sel: p._sel && p._sel.key }; });
await check('Wetter öffnet im Inspektor', w.open && w.sel === 'Weather', w);
await close();

// Titelmenü: Dashboards und alles zu diesem Dashboard
await page.locator('#roomtitle').click();
await page.waitForTimeout(600);
const tm = await menu();
await check('Titelmenü: Dashboard erstellen, Umbenennen, Symbol, Löschen',
  ['Dashboard erstellen', 'Umbenennen', 'Symbol', 'Löschen'].every((x) => tm.some((t) => t.replace(/^✓/, '').indexOf(x) === 0)), tm);
// Zeitreise hat seit 06.10.2026 einen festen Platz: die Uhr neben Rückgängig (nicht mehr im Titelmenü).
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('#brewind').click();
await page.waitForTimeout(2000);
const z = await H(() => { const p = window.__panel(); return { cv: !!p._cvOpen, open: p.classList.contains('binsp') }; });
await check('Zeitreise öffnet als Seite', z.cv && z.open, z);
await close();
await page.waitForTimeout(600);

// „…“: keine Dashboard-Einträge mehr
await page.locator('#more').click();
await page.waitForTimeout(500);
const mm = await menu();
await check('„…“ ohne Umbenennen/Löschen (stehen im Titelmenü)', !mm.some((t) => /^✓?(Umbenennen|Löschen)/.test(t)), mm);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// Einstellungen-Menü (für alle Dashboards)
const hl = await H(() => window.__panel().shadowRoot.querySelector('.btool[data-b=home] .blabel').textContent.trim());
await check('Knopf heißt „Einstellungen“', hl === 'Einstellungen', hl);
await page.locator('.btool[data-b=home]').click();
await page.waitForTimeout(600);
const hm = await menu();
await check('Zuhause-Menü: alle Einstellungsseiten und Updates',
  ['Design', 'Haus & Geräte', 'Glocke & Meldungen', 'Neue Dashboards', 'KI', 'Außenwerte & Strompreis', 'Lüften', 'Updates'].every((x) => hm.some((t) => t.replace(/^✓/, '').indexOf(x) === 0)), hm);
await page.locator('.combo-opt', { hasText: 'KI' }).first().click();
await page.waitForTimeout(2500);
const k = await H(() => { const p = window.__panel(); const i = p.shadowRoot.querySelector('.inspector');
  return { cs: !!p._csOpen, page: p._csPage, wide: i.getBoundingClientRect().width, map: !!p.shadowRoot.querySelector('.card.map') }; });
await check('KI öffnet als breite Seite über der Vorschau', k.cs && k.page === 'ai' && k.wide > 500 && k.map, k);
await close();
await page.waitForTimeout(600);

// Raummenü: wechseln und verschieben
const r0 = await H(() => { const p = window.__panel(); p._room = 1; p._renderTabs(); p._renderForm();
  return p._state.compact.rooms.map((r) => r.path); });
await page.locator('.btool[data-b=rooms]').click();
await page.waitForTimeout(600);
const rm = await menu();
await check('Raummenü: Nach vorne / Nach hinten / Räume ordnen', rm.some((t) => /Nach hinten|Move later/.test(t)) && rm.some((t) => /Räume ordnen/.test(t)), rm);
await page.locator('.combo-opt', { hasText: /Nach hinten|Move later/ }).first().click();
await page.waitForTimeout(1000);
const r1 = await H(() => { const p = window.__panel(); return { paths: p._state.compact.rooms.map((r) => r.path), room: p._room }; });
await check('Nach hinten verschiebt den Raum', r1.paths[2] === r0[1] && r1.room === 2, { vorher: r0.slice(0, 4), nachher: r1 });
const lab = await H(() => window.__panel().shadowRoot.querySelector('.btool[data-b=rooms] .blabel').textContent.trim());
const nm = await H(() => { const p = window.__panel(); return p._roomLabel(p._state.compact.rooms[p._room]); });
await check('Raum-Knopf nennt den offenen Raum', lab === nm, { lab, nm });

// Umschalten: altes Studio und zurück
// V-08: im neuen Studio unter „…“ › Hilfe „Bisheriges Studio öffnen“, zurück über „…“ › „Neues Studio öffnen“.
await page.locator('#more').click();
await page.waitForTimeout(500);
await page.locator('.combo-opt', { hasText: /Hilfe …|Help…/ }).first().click();
await page.waitForTimeout(600);
await page.locator('.combo-opt', { hasText: /Bisheriges Studio|previous Studio/ }).first().click();
await page.waitForTimeout(1500);
const a = await H(() => { const p = window.__panel(); const r = p.shadowRoot;
  return { b: p.classList.contains('bmode'), side: !!(r.querySelector('.sidelist') && r.querySelector('.sidelist').getClientRects().length),
    key: localStorage.getItem('casora.studio.b') }; });
await check('„Bisheriges Studio öffnen“ → bisheriges Studio mit Seitenleiste', !a.b && a.side && a.key === '0', a);
await page.locator('#more').click();
await page.waitForTimeout(500);
await page.locator('.combo-opt', { hasText: /Neues Studio öffnen|Open the new Studio/ }).first().click();
await page.waitForTimeout(1500);
const b = await H(() => window.__panel().classList.contains('bmode'));
await check('„Neues Studio“ wieder an', b);
await finish();
