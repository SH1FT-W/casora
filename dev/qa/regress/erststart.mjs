// @deckt: custom_components/casora/panel/casora-panel-welcome.js custom_components/casora/panel/casora-panel-assist.js custom_components/casora/panel/casora-panel-umzug.js
// Regression: Erststart ohne Startseite (casora-panel.js _welcomeScreen/_afterWelcome/_firstRun).
// @parallel: allein   (legt im Zustand frisch qa-start an – andere Tests sähen sonst ein Casora-Dashboard)
//  1. Ganz neu (kein Casora-Dashboard, Begrüßung nie gesehen): „Willkommen bei Casora“ mit
//     Funktionsliste und „Los geht’s“. Mit Hemma (Zustand „frisch“) führt „Los geht’s“ direkt in den
//     Einrichtungsassistenten: Look → Schrift → Effekte → „Vorhandenes Dashboard gefunden“
//     (Bestehendes Dashboard übernehmen … Neu beginnen; Umzug und Zurück). Keine Startseite dazwischen.
//  2. Nichts zum Mitnehmen (im Browser nachgestellt: keine Hemma-/YAML-Kandidaten): „Los geht’s“
//     führt ohne Assistent direkt zu „Räume wählen“ (neues Dashboard), Zurück zur Begrüßung.
//     Schon begrüßt: gleich „Räume wählen“ bzw. mit Hemma gleich der Assistent.
//  3. Mit Casora-Dashboard (wiederkehrend): gleich das Studio. ⋯-Menü mit „Einrichtungsassistent …“,
//     ohne „Startseite …“ (auch nicht im Dashboard-Wechsler); der Assistent schließt zurück ins
//     Studio. Hilfe → „Einführung in Casora“ zeigt die Begrüßung, „Los geht’s“ schließt sie.
// Schreibt nichts in HA – bis auf eins: fehlt ein Casora-Dashboard (Zustand „frisch“), legt der
// Test vorab über den echten Anlege-Weg des Panels „qa-start“ (+ -mobile) an und löscht es am Ende
// wieder. Aufruf (Docker-Test-HA, Port 8124):
//   CASORA_LOCAL=1 CASORA_TOKENS=… node dev/qa/regress/erststart.mjs [breite] [safari]
import { open, ready, PIERCE } from '../../e2e/harness.mjs';
import { ws } from '../ws.mjs';

const WIDTH = Number(process.argv[2] || 1440);
const SAFARI = process.argv[3] === 'safari';
const SHOTS = process.env.CASORA_SHOTS || '';
const fails = [];
const check = (ok, what, extra) => { console.log((ok ? '  ok   ' : '  FEHLT ') + what + (extra ? '  ' + extra : '')); if (!ok) fails.push(what); };

const size = { width: WIDTH, height: WIDTH <= 500 ? 844 : WIDTH <= 1100 ? 1366 : 900, mobile: WIDTH <= 500, safari: SAFARI };
const { browser, context, page, errors } = await open(size);
const H = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${WIDTH}${SAFARI ? '-webkit' : ''}.png` }); };
const flow = () => H(() => {
  const p = window.__panel();
  return { mode: p._flowMode || null, title: window.__pierce('.flowin .ftitle')[0]?.textContent || '',
    lede: window.__pierce('.flowin .flede')[0]?.textContent || '',
    feats: window.__pierce('.flowin .ffeat b').map((b) => b.textContent),
    foot: [...(p._fx?.foot?.querySelectorAll('button') || [])].map((b) => b.textContent),
    nav: window.__pierce('.flowbar .fnav').map((b) => b.getAttribute('aria-label')),
    start: window.__pierce('.startcard, .startlinks').length,
    welcomeSheet: !!document.querySelector('[data-casora-welcome]') };
});
// Nichts in HA schreiben: schreibende WS-Aufrufe (speichern, anlegen, Dienste …) abweisen.
const blockWrites = () => H(() => {
  const c = document.querySelector('home-assistant').hass.connection;
  if (c.__qaBlocked) return;
  c.__qaBlocked = true;
  const o = c.sendMessagePromise.bind(c);
  c.sendMessagePromise = (m) => (/(save|create|update|delete|\/set$|call_service|execute_script)/.test(m && m.type)
    ? Promise.reject(new Error('qa: blockiert ' + m.type)) : o(m));
});
const waitTitle = (re, t = 20000) => page.waitForFunction((src) => new RegExp(src).test(window.__pierce('.flowin .ftitle')[0]?.textContent || ''), re.source, { timeout: t });
const tap = (sel) => H((s) => { const e = window.__pierce(s)[0]; if (!e) return false; e.click(); return true; }, sel);
const back = () => tap('.flowbar .fnav');
const foot = (re) => H((src) => { const b = [...(window.__panel()._fx?.foot?.querySelectorAll('button') || [])].find((x) => new RegExp(src).test(x.textContent)); if (!b) return false; b.click(); return true; }, re.source);
const reached = async (re, what, t) => { let ok = true; try { await waitTitle(re, t); } catch (e) { ok = false; } check(ok, what, (await flow()).title); return ok; };
const WELCOME = /^Willkommen bei Casora$/;
const LOOK = /Design|Look/;
const ROOMS = /Räume wählen/;
const FOUND = /^Vorhandene(s)? Dashboards? gefunden$/;

// Hilfs-Dashboard „qa-start“: nur anlegen, wenn es kein Casora-Dashboard gibt; am Ende löschen.
const FIX = 'qa-start';
let madeFix = false;
const dropFix = async () => {
  const c = await ws();
  try {
    for (const d of await c.cmd({ type: 'lovelace/dashboards/list' }))
      if (d.url_path === FIX || d.url_path === FIX + '-mobile') await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  } finally { c.close(); }
};
await dropFix(); // Rest eines abgebrochenen Laufs
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && Array.isArray(p._dashList) && (p._state || p._flowMode); });
if (!(await H(() => window.__panel()._dashList.length))) {
  console.log(`(kein Casora-Dashboard – lege „${FIX}“ über den Anlege-Weg an, wird am Ende gelöscht)`);
  await H(async (u) => {
    const p = window.__panel();
    const areas = (await p._hass.callWS({ type: 'config/area_registry/list' })) || [];
    await p._create(u, 'QA Start', areas.slice(0, 2).map((a) => a.name));
  }, FIX);
  madeFix = true;
  await page.waitForFunction((u) => (window.__panel()._dashList || []).some((d) => d.url_path === u), FIX, { timeout: 30000 });
}
process.on('exit', () => { if (madeFix) console.log(`(Hilfs-Dashboard ${FIX} gelöscht)`); });

try { // … finally: Hilfs-Dashboard wieder löschen (Block bewusst nicht eingerückt)

await blockWrites();
const paths = await H(async () => (await window.__panel()._hass.callWS({ type: 'lovelace/dashboards/list' })).filter((d) => d.mode === 'storage').map((d) => d.url_path));
// Welcher Browser-Zustand gerade gilt, steht in sessionStorage (überlebt das Neuladen):
//   qa-casora  – Casora-Dashboards zählen (sonst gelten alle als „kein Casora“ = Erststart)
//   qa-welcome – Begrüßung gilt als gesehen
//   qa-none    – keine Hemma-/YAML-Kandidaten (nichts zum Mitnehmen)
await context.addInitScript((p) => {
  const has = (k) => !!sessionStorage.getItem(k);
  if (!has('qa-casora')) localStorage.setItem('casora_panel_not_casora_v1', JSON.stringify(p));
  if (!has('qa-welcome')) localStorage.removeItem('casora.welcomed');
  // Seit 01.10.2026 entscheidet der Merker im HA (Casora-Einstellungen), nicht der Browser.
  // Schreiben ist im Test gesperrt – „schon begrüßt“ daher hier wie die HA-Antwort nachstellen.
  if (has('qa-welcome')) customElements.whenDefined('casora-panel').then(() => {
    customElements.get('casora-panel').prototype._welcomeDue = async () => false;
  });
  if (has('qa-none')) customElements.whenDefined('casora-panel').then(() => {
    const P = customElements.get('casora-panel').prototype;
    P._casoraMoveCandidates = async () => [];
    P._setupExisting = async () => ({ moves: [], yaml: [], preview: '' });
  });
}, paths);
const setFlags = (f) => H((f) => { for (const [k, v] of Object.entries(f)) { if (v) sessionStorage.setItem(k, '1'); else sessionStorage.removeItem(k); } }, f);
const reload = async (until) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: PIERCE });
  await page.waitForFunction(until || (() => { const p = window.__panel && window.__panel(); return p && p._flowMode; }), null, { timeout: 45000 });
  await blockWrites();
  await page.waitForTimeout(1500);
};
// Auf diesem HA schon begrüßt (Merker in den Casora-Einstellungen): dann kommt nach dem Laden
// keine Begrüßung – sie wird wie beim Erststart direkt aufgerufen.
const welcomedOnHa = await H(async () => !!(((await window.__panel()._hass.callWS({ type: 'casora/settings/get' })).settings || {}).welcome));
const toWelcome = async () => {
  let f = await flow();
  if (!WELCOME.test(f.title) && welcomedOnHa) {
    console.log('  (Begrüßung auf diesem HA schon gesehen – direkt aufgerufen)');
    await H(() => { const p = window.__panel(); p._exitFlow(false); p._welcomeScreen(); });
    await page.waitForTimeout(1200);
    f = await flow();
  }
  return f;
};

// ── 1. Neu, mit Hemma → Assistent ────────────────────────────────────────────────────────
console.log(`\n== Erststart mit Hemma (${WIDTH}px${SAFARI ? ', WebKit' : ''})`);
await setFlags({ 'qa-casora': 0, 'qa-welcome': 0, 'qa-none': 0 });
await reload();
let f = await toWelcome();
const moves = await H(async () => (await window.__panel()._casoraMoveCandidates()).map((m) => m.title || m.url_path));
console.log(`  (Hemma gefunden: ${moves.join(', ') || '–'})`);
check(moves.length > 0, 'Zustand frisch: Hemma-Dashboards vorhanden');
check(WELCOME.test(f.title), 'Neu: zuerst „Willkommen bei Casora“', f.title);
check(/Dashboard-Studio für Home Assistant/.test(f.lede), 'Willkommen: ein Satz, was Casora ist', f.lede);
check(f.feats.length === 3 && f.feats.includes('Raum für Raum'), 'Willkommen: drei Zeilen', f.feats.join(' | '));
await page.waitForTimeout(1500);
f = await flow();
check(f.feats.includes('Hemma mitnehmen') && f.feats.length === 3, 'Hemma-Zeile statt Bildschirm-Zeile, weil Hemma gefunden', f.feats.join(' | '));
check(await H(() => { const b = window.__panel().shadowRoot.getElementById('brand'); return !b || getComputedStyle(b).visibility === 'hidden' || getComputedStyle(b).display === 'none'; }),
  'Willkommen: kein zweites „Casora“ in der Kopfzeile');
check(f.foot.join('|') === 'Los geht’s', 'Knopf „Los geht’s“', f.foot.join('|'));
check(!f.start && !f.welcomeSheet, 'keine Startseiten-Karten, kein zweites Willkommen-Blatt');
await snap('willkommen');
await foot(/Los geht/);
await reached(LOOK, '„Los geht’s“ → Assistent (Look)', 30000);
f = await flow();
check(!f.start, 'keine Startseite zwischen Begrüßung und Assistent');
check(await H(() => !!localStorage.getItem('casora.welcomed')), 'Begrüßung gemerkt (casora.welcomed)');
check(f.nav.length === 1, 'Look: Zurück-Knopf', f.nav.join(','));
await snap('assistent-look');
await back();
await reached(WELCOME, 'Look: Zurück → Begrüßung');
await foot(/Los geht/);
await reached(LOOK, 'wieder „Los geht’s“ → Look', 30000);
const found = () => H(() => window.__pierce('.foundcard').map((c) => ({ k: c.dataset.k, on: c.getAttribute('aria-checked') === 'true',
  text: c.querySelector('.thememeta').textContent.replace(/\s+/g, ' ').trim() })));
let stepsOk = true;
for (const re of [LOOK, /Schrift|Font/, /Flüssig|Smooth/]) {
  try { await waitTitle(re); } catch (e) { check(false, 'Assistent-Schritt ' + re.source, (await flow()).title); stepsOk = false; break; }
  await page.waitForTimeout(500);
  await foot(/^Weiter$/);
}
if (stepsOk && await reached(FOUND, 'nach den Effekten „Vorhandenes Dashboard gefunden“', 30000)) {
  await page.waitForTimeout(1500);
  const fs = await found();
  const ks = fs.map((c) => c.k);
  check(ks[0] === 'move' && ks[ks.length - 1] === 'new', 'Wahl „Bestehendes Dashboard übernehmen“ … „Neu beginnen“', ks.join(','));
  const mv = fs.find((c) => c.k === 'move') || {};
  check(/^Bestehendes Dashboard übernehmen/.test(mv.text || '') && mv.on, '„Bestehendes Dashboard übernehmen (z. B. Hemma)“ vorgewählt', mv.text);
  check(moves.every((t) => (mv.text || '').includes(t)), 'gefundene Hemma-Dashboards mit Namen', mv.text);
  await page.waitForTimeout(2000);
  await snap('assistent-gefunden');
  await foot(/^Weiter$/);
  await reached(/umziehen|Umzug/, 'Bestehendes Dashboard übernehmen → Umzug');
  await back();
  await reached(FOUND, 'Umzug: Zurück → Wahl');
  await H(() => window.__pierce('.foundcard[data-k="new"]')[0].click());
  await foot(/^Weiter$/);
  await reached(ROOMS, 'Neu beginnen → Räume wählen');
}

// ── 2. Nichts zum Mitnehmen → Räume ─────────────────────────────────────────────────────
console.log('\n== Erststart ohne Hemma/YAML');
await setFlags({ 'qa-none': 1, 'qa-welcome': 0 });
await reload();
f = await toWelcome();
check(WELCOME.test(f.title), 'Neu: „Willkommen bei Casora“', f.title);
await page.waitForTimeout(1500);
check(!(await flow()).feats.includes('Hemma mitnehmen'), 'keine Hemma-Zeile ohne Hemma');
await foot(/Los geht/);
if (await reached(ROOMS, '„Los geht’s“ → gleich „Räume wählen“ (kein Assistent)', 30000)) {
  f = await flow();
  check(!f.start, 'keine Startseite');
  check(f.nav.length === 1, 'Räume: Zurück-Knopf', f.nav.join(','));
  await page.waitForTimeout(1200);
  await snap('ohne-hemma-raeume');
  await back();
  await reached(WELCOME, 'Räume: Zurück → Begrüßung');
}
// Schon begrüßt, weiter ohne Dashboard: gleich „Räume wählen“ ohne Zurück.
await setFlags({ 'qa-welcome': 1 });
await H(() => localStorage.setItem('casora.welcomed', '1'));
await reload();
await reached(ROOMS, 'schon begrüßt, nichts gefunden: gleich „Räume wählen“', 30000);
check(!(await flow()).nav.length, 'ohne Dashboard kein Zurück/Schließen', (await flow()).nav.join(','));
// Schon begrüßt, mit Hemma: gleich der Assistent.
await setFlags({ 'qa-none': 0 });
await reload();
await reached(LOOK, 'schon begrüßt, Hemma gefunden: gleich der Assistent (Look)', 30000);

// ── 3. Wiederkehrend mit Casora-Dashboard → Studio ──────────────────────────────────────
console.log('\n== Mit Casora-Dashboard');
await setFlags({ 'qa-casora': 1 });
await H(() => localStorage.removeItem('casora_panel_not_casora_v1'));
let studioUp = true;
await reload(() => { const p = window.__panel && window.__panel(); return p && p._state && !p._flowMode; }).catch(() => { studioUp = false; });
await page.waitForTimeout(1500);
check(studioUp && !(await flow()).mode, 'wiederkehrend: gleich das Studio', studioUp ? '' : (await flow()).title);
if (!studioUp) {
  await H(async () => { const p = window.__panel(); const d = p._dashList[0]; if (d) { p._setDash(d.url_path); await p._load(); } });
  await page.waitForFunction(() => { const p = window.__panel(); return p._state && !p._flowMode; }, null, { timeout: 30000 }).catch(() => {});
}
await snap('studio');
const menu = async (open) => {
  await H(open);
  await page.waitForTimeout(600);
  return H(() => window.__pierce('.combo-menu').map((m) => m.textContent).join(' '));
};
// Menüpunkt antippen wie mit der Maus (die Einträge reagieren auf mousedown).
const pick = (re) => H((src) => { const it = window.__pierce('.combo-menu .combo-opt').find((x) => new RegExp(src).test(x.textContent));
  if (!it) return false; it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true; }, re.source);
const more = await menu(() => window.__panel().$('more').click());
check(/Einrichtungsassistent …/.test(more), '⋯-Menü: „Einrichtungsassistent …“', more.slice(0, 160));
check(!/Startseite/.test(more), '⋯-Menü: kein „Startseite …“');
check(/Hilfe/.test(more), '⋯-Menü: Hilfe');
await snap('menue');
// Menüpunkt wirklich antippen.
check(await pick(/Einrichtungsassistent/), '⋯-Menü: „Einrichtungsassistent …“ antippbar');
if (await reached(LOOK, 'Einrichtungsassistent … → Look')) {
  f = await flow();
  check(f.nav.length === 1 && /Schließen|Close/.test(f.nav[0]), 'Assistent aus dem Menü: Schließen statt Zurück', f.nav.join(','));
  await back();
  await page.waitForFunction(() => { const p = window.__panel(); return p._state && !p._flowMode; }, null, { timeout: 20000 }).catch(() => {});
  check(!(await flow()).mode, 'Schließen → zurück ins Studio');
}
const sw = await H(() => window.__panel()._dashSwitchItems(true).map((x) => x.id));
check(!sw.includes('startpage') && sw.includes('newdash'), 'Dashboard-Wechsler: kein „Startseite …“, „Dashboard erstellen …“ bleibt', sw.join(','));
// Hilfe → Einführung in Casora.
const help = await menu(() => window.__panel()._helpMenu(window.__panel().$('more')));
check(/Einführung in Casora/.test(help), 'Hilfe: „Einführung in Casora“', help.slice(0, 120));
check(await pick(/Einführung in Casora/), 'Hilfe: „Einführung in Casora“ antippbar');
if (await reached(WELCOME, 'Einführung in Casora → Begrüßung')) {
  f = await flow();
  check(f.mode === 'sheet' && !f.welcomeSheet, 'Einführung als Blatt über dem Studio', f.mode);
  await page.waitForTimeout(1200);
  await snap('einfuehrung');
  await foot(/Los geht/);
  await page.waitForFunction(() => { const p = window.__panel(); return p._state && !p._flowMode; }, null, { timeout: 20000 }).catch(() => {});
  check(!(await flow()).mode && await H(() => !!window.__panel()._state), '„Los geht’s“ schließt die Einführung, Studio bleibt');
}

// WebKit: HAs Vorschau-Rahmen melden beim schnellen Neuladen „Importing a module script failed“
// (Seitenmodul-Abbruch im Rahmen, nicht Casora) – dort ausgenommen.
const errs = errors.filter((e) => !/addEventListener|404|Failed to load resource|qa: blockiert/.test(e)
  && !(SAFARI && /Error loading page .*Importing a module script failed/.test(e))
  // Chrome: Wechselt das Netz des Macs (ERR_NETWORK_CHANGED), lädt HA eigene Seitenteile nicht (08.10.2026).
  && !/Error loading page .*Failed to fetch dynamically imported module/.test(e));
check(!errs.length, 'keine Browser-Fehler', errs.slice(0, 3).join(' | '));

} catch (e) {
  check(false, 'Abbruch: ' + String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close().catch(() => {});
  if (madeFix) await dropFix().catch((e) => console.log('Hilfs-Dashboard nicht gelöscht: ' + e.message));
}
console.log(fails.length ? `\nFEHLER: ${fails.length}` : '\nAlles ok');
process.exit(fails.length ? 1 : 0);
