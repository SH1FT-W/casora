// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet 09.10.2026: Der weiche Schatten hervorgehobener (aktiver, weißer) Zeilen in Popups endete
// rechts und unten als harte, eckige graue Fläche (Fußbodenheizung „Heizkörper Bad · Heizt auf …“,
// ebenso Schloss, Jalousien, Segmente in Thermostat/Luftreiniger). Ursache: button-card gibt jedem
// custom_field die Klasse „ellipsis“ (overflow:hidden), dazu schneidet ha-card ab.
// Prüft in Theme „Casora“ (Desktop 1440 Chromium, Handy 393 WebKit, hell und dunkel): bei jeder aktiven
// Zeile / jedem aktiven Segment im Popup schneidet kein Vorfahr mit overflow hidden/clip den sichtbaren
// Teil des box-shadow ab (Versatz + Ausdehnung + ¾ Unschärfe; die Popup-Fläche selbst ausgenommen).
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';

process.env.CASORA_THEME = 'Casora';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

const ACT = '.hui-srow.hui-act, .hui-sg.on, .lps-row.on, .fb-sel, .lkbar';
const MEASURE = (ACT) => {
  const pop = window.casoraPopup && window.casoraPopup.surface;
  if (!pop) return null;
  const FR = pop.getBoundingClientRect();
  const up = (e) => { const p = e.assignedSlot || e.parentNode || e.host || null; return p && p.nodeType === 11 ? p.host : p; };
  const els = [];
  (function walk(n) { for (const ch of (n.children || [])) { if (ch.matches && ch.matches(ACT)) els.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } })(pop.shadowRoot || pop);
  const SH = /(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)?\s*(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?/i;
  const out = { n: 0, cut: [] };
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const bs = getComputedStyle(e).boxShadow;
    if (!bs || bs === 'none') continue;
    const ext = { l: 0, t: 0, r: 0, b: 0 };
    for (const part of bs.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const m = part.match(SH); if (!m) continue;
      const a = (m[1] || '').match(/rgba?\(([^)]+)\)/); const al = a ? Number(a[1].split(/[ ,/]+/).filter(Boolean)[3] ?? 1) : 1;
      if (al < 0.04) continue;
      const x = +m[2], y = +m[3], bl = +(m[4] || 0) * 0.75, sp = +(m[5] || 0);
      ext.l = Math.max(ext.l, bl + sp - x); ext.r = Math.max(ext.r, bl + sp + x);
      ext.t = Math.max(ext.t, bl + sp - y); ext.b = Math.max(ext.b, bl + sp + y);
    }
    if (Math.max(ext.l, ext.t, ext.r, ext.b) < 3) continue;
    out.n++;
    for (let p = up(e), k = 0; p && p !== pop && k < 80; p = up(p), k++) {
      if (p.nodeType !== 1) continue;
      const s = getComputedStyle(p);
      if (!/hidden|clip/.test(s.overflowX + s.overflowY)) continue;
      const q = p.getBoundingClientRect();
      if (q.width * q.height > FR.width * FR.height * 0.8) continue;   // Popup-Fläche
      const hx = /hidden|clip/.test(s.overflowX), hy = /hidden|clip/.test(s.overflowY);
      const over = { l: hx ? q.left - (r.left - ext.l) : 0, r: hx ? (r.right + ext.r) - q.right : 0,
        t: hy ? q.top - (r.top - ext.t) : 0, b: hy ? (r.bottom + ext.b) - q.bottom : 0 };
      const sides = Object.entries(over).filter(([k2, v]) => ext[k2] >= 3 && v > 2);
      if (sides.length) out.cut.push((e.innerText || e.className).replace(/\s+/g, ' ').slice(0, 40) + ' – '
        + sides.map(([k2, v]) => k2 + Math.round(v)).join(' ') + ' durch ' + p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + '.' + String(p.className).split(' ')[0]);
    }
  }
  return out;
};

const VIEWS = [
  { name: 'Desktop', url: dash.url, view: (dash.config.views[0] || {}).path || '0', o: { width: 1440, height: 900 } },
  { name: 'Handy', url: (dash.phone || dash).url, view: ((dash.phone || dash).config.views[0] || {}).path || '0', o: { width: 393, height: 852, mobile: true, safari: true, scale: 3 } },
];
let total = 0;
for (const dark of [false, true]) for (const V of VIEWS) {
  const tag = V.name + (dark ? ' dunkel' : ' hell');
  const { page, browser } = await open({ ...V.o, dark, theme: 'Casora' });
  await dashboard(page, V.url + '/' + V.view, 3);
  // Je Popup-Art ein Gerät; aktiv machen (nur im Browser), damit aktive Zeilen/Segmente da sind.
  const pick = await page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states;
    const ids = Object.keys(st);
    const first = (re, f = () => true) => ids.find((i) => re.test(i) && f(st[i]));
    const valves = ids.filter((i) => /^climate\./.test(i) && !(st[i].attributes.entity_id || st[i].attributes.member_entities));
    return {
      fbh: first(/^climate\./, (s) => !!(s.attributes.entity_id || s.attributes.member_entities)) || valves[0],
      valves, covers: ids.filter((i) => /^cover\./.test(i)), lock: first(/^lock\./), fan: first(/^fan\./),
      lights: ids.filter((i) => /^light\./.test(i)).slice(0, 6), media: first(/^media_player\./),
    };
  });
  const patch = {};
  for (const v of pick.valves) patch[v] = { state: 'heat', attributes: { hvac_action: 'heating', temperature: 22 } };
  for (const c of pick.covers) patch[c] = { state: 'open', attributes: { current_position: 100 } };
  for (const l of pick.lights) patch[l] = { state: 'on', attributes: { brightness: 200 } };
  if (pick.lock) patch[pick.lock] = { state: 'unlocked' };
  if (pick.fan) patch[pick.fan] = { state: 'on', attributes: { percentage: 50 } };
  if (pick.media) patch[pick.media] = { state: 'playing' };
  await fakeStates(page, patch, { sticky: true });
  const cases = [
    ['Fußbodenheizung', pick.fbh, { type: 'custom:button-card', template: ['casora_thermostat', 'casora_popup_fbh'], entity: pick.fbh, name: 'FBH', variables: {} }],
    ['Thermostat', pick.valves[0], null], ['Jalousie', pick.covers[0], null], ['Schloss', pick.lock, null],
    ['Luftreiniger', pick.fan, null], ['Licht', pick.lights[0], null], ['Medien', pick.media, null],
  ];
  for (const [label, id, cfg] of cases) {
    if (!id) { console.log(`  info   ${tag}: kein Gerät für ${label}`); continue; }
    const ok = await page.evaluate(([id, cfg]) => new Promise((res) => {
      if (window.casoraPopup) window.casoraPopup.close();
      setTimeout(() => window._casoraNotifyOpenViaCard(id, res, cfg || undefined), 400);
    }), [id, cfg]).catch(() => false);
    await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; const r = s && s.getBoundingClientRect(); return r && r.height > 100; }, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const m = await page.evaluate(MEASURE, ACT).catch(() => null);
    if (!ok || !m) { console.log(`  info   ${tag}: ${label} öffnet nicht`); continue; }
    if (!m.n) { console.log(`  info   ${tag}: ${label} ohne aktive Zeile mit Schatten`); continue; }
    total += m.n;
    await check(`${tag}: ${label} – Schatten aktiver Zeilen nicht abgeschnitten (${m.n})`, !m.cut.length, m.cut);
  }
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
  await browser.close();
}
await need('aktive Zeilen mit Schatten gemessen', total > 0);
await finish();
