// @zustand: arbeit
// @parallel: ui
// Neues Studio (B): Alles aus der früheren Seitenleiste bleibt über die Werkzeugleiste erreichbar.
// Expected: one button "Einstellungen" (variant B, 26.10.62b5: no "Dashboard" menu) opens the settings by topic; a topic
// opens this dashboard's sections (Wetter) in the inspector and the pages for all dashboards (KI, also via the search);
// the title menu (dashboard name) switches dashboards and holds rename, icon, delete (UX-03), "…" does not; Rewind is
// the clock next to undo; the room menu switches and moves rooms and opens "Räume ordnen"; "…" › Hilfe no longer offers
// the previous Studio. Nothing is saved.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const menu = () => H(() => window.__pierce('.combo-menu .combo-opt').filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
const close = () => H(() => window.__panel()._bClose());

// Settings by topic (variant B): no "Dashboard" button any more, one "Einstellungen".
const noDash = await H(() => !window.__panel().shadowRoot.querySelector('.btool[data-b=dash]'));
await check('kein eigener Dashboard-Knopf mehr', noDash);
await page.locator('.btool[data-b=home]').click();
await page.waitForTimeout(1200);
const topics = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.cs-hubtile b')].map((b) => b.textContent.trim()));
await check('Einstellungen: sechs Themen', ['Aussehen', 'Meldungen', 'Haus & Geräte', 'Wetter & Klima', 'Bedienung', 'Extras'].every((x) => topics.includes(x)), topics);
await page.locator('.cs-hubtile', { hasText: 'Wetter & Klima' }).click();
await page.waitForTimeout(1000);
const wrow = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.frow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
await check('Thema Wetter & Klima: Wetter (nur dieses Dashboard) und Außenwerte', wrow.some((t) => /^Wetter.*Nur dieses Dashboard/.test(t)) && wrow.some((t) => /^Außenwerte & Strompreis/.test(t)), wrow);
await page.locator('.frow').filter({ has: page.locator('b', { hasText: /^Wetter$/ }) }).first().click();
await page.waitForTimeout(1200);
const w = await H(() => { const p = window.__panel(); return { open: p.classList.contains('binsp'), sel: p._sel && p._sel.key, cs: !!p._csOpen }; });
await check('Wetter öffnet im Inspektor', w.open && w.sel === 'Weather' && !w.cs, w);
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

// Settings: the search finds the page "KI" (all dashboards).
const hl = await H(() => window.__panel().shadowRoot.querySelector('.btool[data-b=home] .blabel').textContent.trim());
await check('Knopf heißt „Einstellungen“', hl === 'Einstellungen', hl);
await page.locator('.btool[data-b=home]').click();
await page.waitForTimeout(1200);
await page.locator('.cs-hubsearch input').fill('KI');
await page.waitForTimeout(400);
await page.locator('.frow').filter({ has: page.locator('b', { hasText: /^KI$/ }) }).first().click();
await page.waitForTimeout(2500);
const k = await H(() => { const p = window.__panel(); const i = p.shadowRoot.querySelector('.inspector');
  return { cs: !!p._csOpen, page: p._csPage, wide: i.getBoundingClientRect().width, map: !!p.shadowRoot.querySelector('.card.map'),
    back: !!p.shadowRoot.querySelector('.cs-hubback') }; });
await check('KI öffnet als breite Seite über der Vorschau, mit „‹ Zurück“', k.cs && k.page === 'ai' && k.wide > 500 && k.map && k.back, k);
await close();
await page.waitForTimeout(600);

// Raummenü: wechseln und verschieben
const r0 = await H(() => { const p = window.__panel(); p._room = 1; p._renderTabs(); p._renderForm();
  return p._state.compact.rooms.map((r) => r.path); });
await page.locator('.btool[data-b=rooms]').click();
await page.waitForTimeout(600);
const rm = await menu();
// P-V3 (1.3): das Raummenü zeigt nur die Räume (und „Räume ordnen“); Nach vorne/hinten stehen im eigenen ⋯ neben dem Raumnamen.
await check('Raummenü: Räume und „Räume ordnen“, ohne Raumaktionen', !rm.some((t) => /Nach hinten|Move later|Umbenennen/.test(t)) && rm.some((t) => /Räume ordnen/.test(t)), rm);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('.btool[data-b=roomact]').first().click();
await page.waitForTimeout(600);
const ra = await menu();
await check('Raum-⋯: Nach vorne / Nach hinten', ra.some((t) => /Nach vorne|Move earlier/.test(t)) && ra.some((t) => /Nach hinten|Move later/.test(t)), ra);
await page.locator('.combo-opt', { hasText: /Nach hinten|Move later/ }).first().click();
await page.waitForTimeout(1000);
const r1 = await H(() => { const p = window.__panel(); return { paths: p._state.compact.rooms.map((r) => r.path), room: p._room }; });
await check('Nach hinten verschiebt den Raum', r1.paths[2] === r0[1] && r1.room === 2, { vorher: r0.slice(0, 4), nachher: r1 });
const lab = await H(() => window.__panel().shadowRoot.querySelector('.btool[data-b=rooms] .blabel').textContent.trim());
const nm = await H(() => { const p = window.__panel(); return p._roomLabel(p._state.compact.rooms[p._room]); });
await check('Raum-Knopf nennt den offenen Raum', lab === nm, { lab, nm });

// The previous Studio is gone (26.10.62b5): no entry under "…" › Hilfe, an old choice in this browser does not count.
await page.locator('#more').click();
await page.waitForTimeout(500);
await page.locator('.combo-opt', { hasText: /Hilfe …|Help…/ }).first().click();
await page.waitForTimeout(600);
const help = await menu();
await check('Hilfe ohne „Bisheriges Studio öffnen“', help.length > 0 && !help.some((t) => /Bisheriges Studio|previous Studio/.test(t)), help);
await page.keyboard.press('Escape');
const old = await H(() => { localStorage.setItem('casora.studio.b', '0'); return window.__panel()._bOn(); });
await check('früher gewähltes „bisheriges Studio“ zählt nicht mehr', old === true, old);
await finish();
