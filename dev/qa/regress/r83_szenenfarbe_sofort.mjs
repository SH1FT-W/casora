// @zustand: arbeit
// @parallel: allein   (speichert das Dashboard zweimal und stellt es am Ende wieder her)
// Gemeldet (08.10.2026): Szenenfarbe im Studio geändert und gespeichert – am Handy kam die neue Farbe an,
// auf Desktop/Tablet nicht (dort trug nur eine laufende Szene ihre Farbe). Erwartet ohne Neuladen:
// Desktop 1440 (Szene läuft: Szenen-Badge und Unter-Badge), Tablet 1024 (Szene läuft nicht: Unter-Badge),
// Handy 393 (Szenen-Blatt, Szenen-Chip); „Gelb (Standard)“ setzt sie überall zurück. Ein veralteter
// scene_colors-Rest an einer Kachel zählt nicht und wird beim Speichern entfernt.
// „Läuft“ nur im Browser (isActive für diese Szene) – in HA wird nichts geschaltet.
import { open, studio, casoraDashboard, dashboard, check, need, finish, atFinish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => JSON.stringify(d.config || {}).includes('casora_badge_scene'));
await need('Casora-Dashboard mit Szenen-Badge und Handy-Gegenstück', dash && dash.phone);
const W = (pg, ms) => pg.waitForTimeout(ms);
const BLUE = 'var(--casora-color-blue, #0088FF)';

const cfgOf = async (url) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: url }); } finally { c.close(); } };
const orig = { [dash.url]: await cfgOf(dash.url), [dash.phone.url]: await cfgOf(dash.phone.url) };
// Ausgangsstand zurück, auch wenn der Test abbricht.
atFinish(async () => {
  const c = await ws();
  try { for (const [u, cfg] of Object.entries(orig)) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); }
});

// Szene: die erste Unter-Badge der Szenen-Badge (die Leiste baut sie zur Laufzeit).
let SCENE = null;
{
  const o = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
  await dashboard(o.page, dash.url);
  SCENE = await o.page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_scene') && /^scene\./.test((x._config || {}).entity || ''));
    return b ? b._config.entity : null; });
  await o.browser.close();
}
await need('Szene in der Szenen-Badge', SCENE);

// Veralteter Rest wie aus älteren Ständen/Umzug: eigene scene_colors (rot) an einer Karte der Startseite.
{
  const cfg = JSON.parse(JSON.stringify(orig[dash.url]));
  let card = null; (function walk(o) { if (card || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
    if (o.type === 'custom:button-card' && o.template && ![].concat(o.template).includes('casora_room')) { card = o; return; }
    Object.keys(o).forEach((k) => walk(o[k])); })(cfg.views[0].cards);
  await need('Kachel auf der Startseite', card);
  card.variables = { ...(card.variables || {}), scene_colors: { [SCENE]: 'var(--casora-color-red, #FF4245)' } };
  const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); } finally { c.close(); }
}

// Diese Szene läuft – nur im Browser.
const running = async (o) => { await o.context.addInitScript((id) => {
  let sc; Object.defineProperty(window, '_casoraSC', { configurable: true, get: () => sc, set: (v) => {
    sc = v; if (v && v.isActive && !v.__qa) { const f = v.isActive; v.isActive = function (x, s) { return x === id ? true : f.call(this, x, s); }; v.__qa = 1; } } });
}, SCENE); return o; };

// Gemessene Farben je Ansicht (CSS-Werte, wie gesetzt).
const deskColors = (pg) => pg.evaluate((id) => {
  const val = (b) => { const c = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return c ? c.style.getPropertyValue('--casora-badge-icon-color').trim() : null; };
  const bs = window.__pierce('button-card');
  const sub = bs.find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_scene') && (b._config || {}).entity === id);
  const grp = bs.find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_scene_group'));
  return { badge: val(sub), gruppe: val(grp) };
}, SCENE);
// Handy: Szenen-Blatt (Kachelton) und Szenen-Chip (Szenenleiste/-Popup, chipHtml der laufenden Szene).
const phoneColors = (pg) => pg.evaluate((id) => {
  const nav = window.__pierce('casora-mobile-nav')[0], SC = window._casoraSC;
  const hass = document.querySelector('home-assistant').hass;
  const chip = SC && SC.chipHtml ? SC.chipHtml(id, hass.states, {}) : '';
  const m = /color:([^;"]*)/.exec(chip.slice(chip.indexOf('<ha-icon')));
  return { leiste: m ? m[1] : null, blatt: nav && nav._sceneTone ? nav._sceneTone(id, '') : null };
}, SCENE);
const has = (v, c) => !!v && String(v).includes(c);
const until = async (pg, fn, ok, ms = 10000) => { let v; for (const t0 = Date.now(); Date.now() - t0 < ms; await W(pg, 400)) { v = await fn(pg); if (ok(v)) break; } return v; };

const STUDIO = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
const DESK = await running(await open({ width: 1440, height: 900, theme: 'Casora', dark: false }));
// Tablet ohne laufende Szene (so wie im Bericht): die Unter-Badge zeigt die Farbe trotzdem.
const TAB = await open({ width: 1024, height: 768, touch: true, theme: 'Casora', dark: false });
const PHONE = await running(await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false }));
for (const o of [DESK, TAB]) await dashboard(o.page, dash.url);
await dashboard(PHONE.page, dash.phone.url, 3);
usePage(STUDIO.page);
await studio(STUDIO.page, dash.url);

const d0 = await deskColors(DESK.page);
await need('Unter-Badge der Szene am Desktop', d0.badge != null, d0);

// Farbe im Studio wählen (echter Farbknopf der Szene) und mit ⌘S sichern.
const pick = async (label) => {
  const pg = STUDIO.page;
  await pg.evaluate(() => { const p = window.__panel(); p._bLeavePages && p._bLeavePages(); p._sel = { group: 'rooms', key: 'Scenes', label: 'Scenes' }; p._group = 'rooms'; p._bOpen = true; p._renderForm(); });
  await W(pg, 1200);
  const xy = await pg.evaluate((id) => { const e = window.__pierce('.scenecolor .scpick').find((x) => x.closest('.scenecolor').dataset.id === id && x.getClientRects().length);
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, SCENE);
  if (!xy) return false;
  await pg.mouse.click(xy[0], xy[1]);
  await W(pg, 700);
  const opt = await pg.evaluate((re) => { const e = window.__pierce('.combo-menu .combo-opt').find((x) => x.getClientRects().length && new RegExp(re).test(((x.querySelector('.lbl') || x).textContent || '').replace('✓', '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, label);
  if (!opt) return false;
  await pg.mouse.click(opt[0], opt[1]);
  await W(pg, 600);
  await pg.evaluate(() => { const p = window.__panel(); p._bClose && p._bClose(); document.activeElement && document.activeElement.blur(); });
  await W(pg, 400);
  await pg.keyboard.press('Meta+s');
  return pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
};

await check('Dashboard hört auf lovelace_updated (Neuzeichnen nach dem Speichern)', await TAB.page.evaluate(() => window._casoraSceneWatch === true && typeof window._casoraSceneRepaint === 'function'));

// 1) Blau wählen, speichern → überall ohne Neuladen.
await check('Studio: Blau gewählt und gesichert', await pick('^(Blau|Blue)$'));
const want = (c) => ({ d: (v) => has(v.badge, c) && has(v.gruppe, c), t: (v) => has(v.badge, c), p: (v) => has(v.leiste, c) && has(v.blatt, c) });
let d = await until(DESK.page, deskColors, want('--casora-color-blue').d);
await check('Desktop ohne Neuladen: Badge und Unter-Badge blau', want('--casora-color-blue').d(d), d);
let t = await until(TAB.page, deskColors, want('--casora-color-blue').t);
await check('Tablet ohne Neuladen: Unter-Badge der (nicht laufenden) Szene blau', want('--casora-color-blue').t(t), t);
let p = await until(PHONE.page, phoneColors, want('--casora-color-blue').p);
await check('Handy ohne Neuladen: Szenenleiste und Szenen-Blatt blau', want('--casora-color-blue').p(p), p);

// Gespeichert: zentral in der Vorlage, keine Kopie mehr an Karten.
const stale = []; (function walk(o, at) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach((x) => walk(x, at));
  if (o.variables && typeof o.variables === 'object' && 'scene_colors' in o.variables && ![].concat(o.template || []).includes('casora_room')) stale.push([].concat(o.template || o.type || '?').join(','));
  Object.keys(o).forEach((k) => walk(o[k], at)); })((await cfgOf(dash.url)).views || []);
await check('Studio räumt veraltete scene_colors an Karten weg (zentral nur in der Vorlage)', !stale.length, stale);

// Nach Neuladen dasselbe.
for (const o of [DESK, TAB]) await dashboard(o.page, dash.url);
await dashboard(PHONE.page, dash.phone.url, 3);
d = await until(DESK.page, deskColors, want('--casora-color-blue').d);
await check('Desktop nach Neuladen blau', want('--casora-color-blue').d(d), d);
p = await until(PHONE.page, phoneColors, want('--casora-color-blue').p);
await check('Handy nach Neuladen blau', want('--casora-color-blue').p(p), p);

// 2) Zurück auf Standard → überall wieder ohne Blau.
await check('Studio: „Gelb (Standard)“ gesichert', await pick('^(Gelb \\(Standard\\)|Yellow \\(default\\))$'));
const none = { d: (v) => v.badge != null && !has(v.badge, '--casora-color-blue') && !has(v.badge, '--casora-color-red') && !has(v.gruppe, '--casora-color-blue'), p: (v) => v.leiste != null && !has(v.leiste, '--casora-color-blue') && !has(v.blatt, '--casora-color-blue') };
d = await until(DESK.page, deskColors, none.d);
await check('Desktop: zurückgesetzt ohne Neuladen', none.d(d), d);
t = await until(TAB.page, deskColors, none.d);
await check('Tablet: zurückgesetzt ohne Neuladen', none.d(t), t);
p = await until(PHONE.page, phoneColors, none.p);
await check('Handy: zurückgesetzt ohne Neuladen', none.p(p), p);
console.log('  info   Szene ' + SCENE + ' – ' + BLUE);
await finish();
