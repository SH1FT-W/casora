#!/usr/bin/env node
// Prüfmatrix abbilden (Feinschliff 1.3, Phase 0): zu jeder Zeile aus matrix.json (dev/qa/matrix-inventar.mjs)
// ein Bild im Theme „Casora“ und die Maschinen-Messungen dazu (messung.jsonl).
//
//   CASORA_URL=http://localhost:<port> node dev/qa/matrix-bilder.mjs --matrix <ordner> --haus arbeit|demo
//       [--gruppe popups,kacheln,handy,studio,umzug] [--geraete desktop,tablet,handy] [--nur <regex auf zeile_id>]
//       [--dash <url>] [--handy-dash <url>] [--neu]   (--neu: schon abgebildete Zeilen nicht überspringen)
//       [--nochmal <regex>]  nicht abbildbare Zeilen, deren Grund passt, erneut versuchen
//   … --vorbereiten   legt im Test-HA ein Hilfs-Dashboard „qa-matrix“ an mit je einer Kachel für jede Vorlage,
//                     die in den echten Dashboards dieses Hauses fehlt (Karte aus einem anderen Dashboard des
//                     Hauses, sonst mit einer passenden Entität erzeugt). Nur im Wegwerf-HA verwenden.
//
// Je Zeile: Fläche öffnen (Vorlage suchen bzw. antippen, Overlay/Menü öffnen, Studio-Station/-Seite/-Ablauf/
// -Rückfrage herstellen), Zustand herstellen (an/aus/nicht verfügbar/lange Namen über untergeschobene Zustände
// nur im Browser, hover/gedrückt mit der Maus), Bild als Ausschnitt speichern und messen:
//  - popup-raender (abgeschnitten, Textüberlauf, Überlappung, Schatten, Trefferfläche) – Messfunktion aus
//    dev/qa/popup-raender.mjs, bei offenem Popup;
//  - ausrichtung (Mitte, Fluchten, Abstände, Radien) – Messfunktion aus dev/qa/ausrichtung.mjs, im Studio auf
//    dem Panel, sonst auf der Fläche (Popup/Kachel) als Wurzel;
//  - Textüberlauf (scrollWidth > clientWidth ohne Ellipsis) und Trefferfläche < 40 px (Tablet/Handy) auf jeder Fläche.
// Konsolenfehler je Zeile werden mitgeschrieben (und als Fund in funde.jsonl, je Text einmal).
// Ergebnis: <matrix>/messung.jsonl (eine Zeile je Matrix-Zeile, auch „nicht abbildbar“ mit Grund), Bilder unter
// <matrix>/<bild>. Bricht nicht ab: jede Zeile bekommt ein Ergebnis.
import fs from 'node:fs';
import path from 'node:path';
import { tokens, ws } from './ws.mjs';

const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
process.env.CASORA_THEME = 'Casora';
await tokens();
const H = await import('../e2e/harness.mjs');

const MDIR = arg('matrix');
const HAUS = arg('haus');
if (!MDIR || !HAUS) { console.error('--matrix <ordner> und --haus arbeit|demo nötig'); process.exit(2); }
const SPRACHE = HAUS === 'demo' ? 'en' : 'de';
const QA = new URL('./', import.meta.url).pathname;

// ── Messfunktionen der vorhandenen Werkzeuge (Quelltext übernehmen, nicht kopieren) ──
const grab = (file, start) => {
  const s = fs.readFileSync(QA + file, 'utf8');
  const i = s.indexOf(start); if (i < 0) throw new Error(start + ' fehlt in ' + file);
  const j = s.indexOf('\n};\n', i);
  return s.slice(i + start.length, j + 2).trim();
};
const M_POPUP = grab('popup-raender.mjs', 'const MEASURE = ');
const M_AUSR = grab('ausrichtung.mjs', 'const MEASURE = ');

// ── Dashboards und Ort jeder Vorlage ──────────────────────────────────────
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
const cfgOf = async (u) => { try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } catch (e) { return null; } };
const isCas = (cfg) => cfg && /casora_room|casora_mobile/.test(JSON.stringify(cfg.views || []));
let DESK = arg('dash'), PHONE = arg('handy-dash');
const cfgs = {};
for (const d of list.filter((x) => x.mode === 'storage' && !/^(dashboard-hemma|qa-matrix)/.test(x.url_path))) cfgs[d.url_path] = await cfgOf(d.url_path);
if (!DESK) DESK = ['qa-arbeit', 'home-dashboard'].find((u) => cfgs[u]) || Object.keys(cfgs).find((u) => !/-mobile$/.test(u) && isCas(cfgs[u]));
if (!PHONE) PHONE = cfgs[DESK + '-mobile'] ? DESK + '-mobile' : DESK;
const states = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));

const tplsOfView = (v) => { const out = new Set(); (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') {
  if (o.template) [].concat(o.template).forEach((t) => out.add(t)); Object.values(o).forEach(w); } })(v); return out; };

if (flag('vorbereiten')) {
  await vorbereiten();
  c.close(); process.exit(0);
}
async function vorbereiten() {
  const flaechen = JSON.parse(fs.readFileSync(path.join(MDIR, 'flaechen.json'), 'utf8'));
  const want = flaechen.filter((f) => f.vorlage && /^(kachel|badge|badge-gruppe|kopf|handy-vorlage)$/.test(f.familie)).map((f) => f.vorlage);
  const have = new Set([...tplsOfView(cfgs[DESK].views), ...tplsOfView((cfgs[PHONE] || {}).views || [])]);
  const missing = want.filter((t) => !have.has(t));
  // Kartenbeispiele aus allen Dashboards des Hauses (auch Hemma-Fixture/Importe), deren Entitäten es gibt.
  const all = {};
  for (const d of list.filter((x) => x.mode === 'storage' || x.mode === 'yaml')) { const cf = cfgs[d.url_path] || await cfgOf(d.url_path); if (cf) all[d.url_path] = cf; }
  const examples = {};
  const ok = (card) => { const ids = JSON.stringify(card).match(/"[a-z_]+\.[a-z0-9_]+"/g) || [];
    return ids.map((x) => x.slice(1, -1)).filter((x) => /^(light|switch|sensor|binary_sensor|climate|cover|lock|media_player|fan|camera|vacuum|update|person|calendar|weather|alarm_control_panel|scene|humidifier|device_tracker|input_\w+|todo|select|number|event|image)\./.test(x)).every((x) => states[x]); };
  for (const cf of Object.values(all)) (function w(o) { if (Array.isArray(o)) return o.forEach(w); if (!o || typeof o !== 'object') return;
    if (o.type === 'custom:button-card' && o.template) { const t = [].concat(o.template).slice(-1)[0]; if (!examples[t] && ok(o)) examples[t] = o; }
    Object.values(o).forEach(w); })(cf.views || []);
  const first = (re, pred = () => true) => Object.keys(states).find((id) => re.test(id) && pred(states[id]));
  const dc = (d) => (s) => s.attributes && s.attributes.device_class === d;
  const GUESS = {
    casora_alarm: () => first(/^alarm_control_panel\./), casora_fan: () => first(/^fan\./), casora_humidifier: () => first(/^humidifier\./),
    casora_switch: () => first(/^switch\./), casora_motion: () => first(/^binary_sensor\./, dc('motion')) || first(/^binary_sensor\..*(motion|bewegung)/),
    casora_presence: () => first(/^person\./), casora_badge_presence: () => first(/^person\./), casora_badge_presence_group: () => first(/^person\./),
    casora_calendar: () => first(/^calendar\./), casora_battery: () => first(/^sensor\./, dc('battery')), casora_pulse: () => first(/^sensor\./, dc('battery')),
    casora_updates: () => first(/^update\./), casora_scenes: () => first(/^scene\./), casora_badge_scene: () => first(/^scene\./),
    casora_game: () => first(/^media_player\./), casora_badge_media_player: () => first(/^media_player\./), casora_badge_activity: () => first(/^media_player\./),
    casora_badge_media_group: () => first(/^media_player\./), casora_doorbell: () => first(/^camera\./), casora_cameras: () => first(/^camera\./),
    casora_custom: () => first(/^sensor\./, dc('temperature')), casora_entity_actions: () => first(/^light\./), casora_badge_cover: () => first(/^cover\./),
    casora_badge_energy: () => first(/^sensor\./, dc('power')), casora_badge_energy_group: () => first(/^sensor\./, dc('power')),
    casora_badge_temp: () => first(/^sensor\./, dc('temperature')), casora_badge_humidity: () => first(/^sensor\./, dc('humidity')),
    casora_badge_air_quality: () => first(/^sensor\./, (s) => /pm25|co2|carbon_dioxide|aqi/.test((s.attributes || {}).device_class || '')),
    casora_badge_light: () => first(/^light\./), casora_badge_light_group: () => first(/^light\./), casora_badge_lock_group: () => first(/^lock\./),
    casora_badge_security: () => first(/^lock\./), casora_badge_contact_group: () => first(/^binary_sensor\./, dc('door')) || first(/^binary_sensor\./, dc('window')),
    casora_appliance: () => first(/^sensor\..*(wasch|spuel|washer|dish)/), casora_energy: () => first(/^sensor\./, dc('power')),
    casora_plant: () => first(/^(plant|sensor)\..*(pflanze|plant)/), casora_weather_warning: () => first(/^sensor\..*(warn)/) || first(/^weather\./),
    casora_trash: () => first(/^(sensor|calendar)\..*(abfall|muell|waste|trash)/), casora_vent: () => first(/^sensor\..*(lueft|vent)/),
    casora_solar_tip: () => first(/^sensor\./, dc('power')), casora_now_playing: () => first(/^media_player\./),
  };
  const cards = []; const report = [];
  for (const t of missing) {
    if (/^casora_mobile_|^casora_(notifications|settings|assist)_button$|^casora_room$/.test(t)) { report.push(t + ': nur im Handy-/Kopfbereich, kein Beispiel nötig'); continue; }
    if (examples[t]) { cards.push(JSON.parse(JSON.stringify(examples[t]))); report.push(t + ': Beispiel aus Dashboard übernommen'); continue; }
    const e = GUESS[t] ? GUESS[t]() : null;
    if (e || ohneEnt(t)) { cards.push({ type: 'custom:button-card', template: t, ...(e ? { entity: e } : {}), name: t.replace(/^casora_/, '').replace(/_/g, ' ') }); report.push(t + ': erzeugt' + (e ? ' mit ' + e.split('.')[0] + '.…' : ' ohne Entität')); }
    else report.push(t + ': KEINE passende Entität – nicht abbildbar');
  }
  const base = cfgs[DESK];
  const room = base.views.find((v, i) => i > 0 && (v.cards || []).some((x) => x.template === 'casora_room')) || base.views[0];
  const view = JSON.parse(JSON.stringify(room));
  view.path = 'matrix'; view.title = 'matrix';
  view.cards = (view.cards || []).filter((x) => x.template === 'casora_room').map((x) => ({ ...x, name: 'Matrix' }));
  view.cards.push({ type: 'custom:casora-smart-row', cards });
  const cfg = { ...JSON.parse(JSON.stringify(base)), views: [view] };
  if (!list.some((d) => d.url_path === 'qa-matrix')) await c.cmd({ type: 'lovelace/dashboards/create', url_path: 'qa-matrix', title: 'qa-matrix', mode: 'storage', show_in_sidebar: false, require_admin: false });
  await c.cmd({ type: 'lovelace/config/save', url_path: 'qa-matrix', config: cfg });
  fs.writeFileSync(path.join(MDIR, `daten/vorbereitet_${HAUS}.txt`), report.join('\n') + '\n');
  console.log(`qa-matrix (${HAUS}): ${cards.length} Karten für ${missing.length} fehlende Vorlagen`);
  console.log(report.map((r) => '  ' + r).join('\n'));
}
function ohneEnt(t) { return /^casora_(scene_row|recipe|football|solar_tip|time|weather|now_playing\w*|menu_icon|cameras|updates|battery|pulse)$/.test(t); }

// Ort je Vorlage: Desktop-Ansicht, Handy (Startseite) – Matrix-Dashboard als Ersatz.
const MATRIX_DASH = list.some((d) => d.url_path === 'qa-matrix') ? 'qa-matrix' : null;
const deskViews = (cfgs[DESK].views || []).map((v, i) => ({ path: v.path || String(i), tpl: tplsOfView(v) }));
const phoneViews = ((cfgs[PHONE] || {}).views || []).map((v, i) => ({ path: v.path || String(i), tpl: tplsOfView(v) }));
const matrixTpl = MATRIX_DASH ? tplsOfView((await cfgOf('qa-matrix')).views) : new Set();
c.close();

// ── Matrix lesen, Fortsetzen ──────────────────────────────────────────────
const MATRIX = JSON.parse(fs.readFileSync(path.join(MDIR, 'matrix.json'), 'utf8'));
const FL = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(MDIR, 'flaechen.json'), 'utf8')).map((f) => [f.id, f]));
const GRUPPEN = arg('gruppe', 'popups,kacheln,handy,studio,umzug').split(',');
const GERAETE = arg('geraete', 'desktop,tablet,handy').split(',');
const NUR = arg('nur') ? new RegExp(arg('nur')) : null;
const MESS = path.join(MDIR, 'messung.jsonl');
const FUNDE = path.join(MDIR, 'funde.jsonl');
const done = new Set();
// --nochmal <regex>: Zeilen, deren letzter Grund passt, noch einmal versuchen (z. B. nach einer Verbesserung).
const NOCHMAL = arg('nochmal') ? new RegExp(arg('nochmal')) : null;
if (fs.existsSync(MESS) && !flag('neu')) for (const l of fs.readFileSync(MESS, 'utf8').split('\n')) { try { const j = JSON.parse(l);
  if (j.status === 'ok' || (j.status === 'nicht_abbildbar' && !(NOCHMAL && NOCHMAL.test(j.grund || '')))) done.add(j.zeile_id); else done.delete(j.zeile_id); } catch (e) { /* leer */ } }
const fundSeen = new Set();
if (fs.existsSync(FUNDE)) for (const l of fs.readFileSync(FUNDE, 'utf8').split('\n')) { try { fundSeen.add(JSON.parse(l).ist); } catch (e) { /* leer */ } }
let fundN = fundSeen.size;
const writeMess = (o) => fs.appendFileSync(MESS, JSON.stringify(o) + '\n');
const ERR_ALLOW = /addEventListener|ResizeObserver loop|favicon|service.?worker|Subscription not found/i;
function fund(row, text) {
  const t = String(text).slice(0, 300);
  const key = t.replace(/\d+/g, '#').replace(/@ .*$/, '');
  if (fundSeen.has(key)) return; fundSeen.add(key); fundN++;
  fs.appendFileSync(FUNDE, JSON.stringify({ id: 'inv-' + String(fundN).padStart(2, '0'), flaeche: row.flaeche, zustand: row.zustand, geraet: row.geraet, schema: row.schema,
    sprache: row.sprache, art: 'fehler', schwere: 'mittel', ist: key, soll: '0 Fehler in der Browser-Konsole', bild: row.bild, status: 'offen', test: '–', text: t }) + '\n');
}

const VIEWS = {
  desktop: { width: 1440, height: 900, scale: 1 },
  tablet: { width: 1024, height: 768, safari: true, touch: true, scale: 1 },
  handy: { width: 393, height: 852, mobile: true, safari: true, scale: 2 },
};
const rows = MATRIX.zeilen.filter((z) => z.haus === HAUS && GRUPPEN.includes(z.gruppe) && GERAETE.includes(z.geraet) && !done.has(z.zeile_id) && (!NUR || NUR.test(z.zeile_id)));
console.log(`${HAUS}: ${rows.length} Zeilen offen (${done.size} schon fertig), Desktop ${DESK}, Handy ${PHONE}, Matrix-Dashboard ${MATRIX_DASH || '–'}`);

// ── Browser-Helfer ───────────────────────────────────────────────────────
const sleep = (pg, ms) => pg.waitForTimeout(ms);
async function goView(pg, url) {
  // Noch auf derselben Seite und Helfer da? (Escape/Popup-Verlauf kann die Seite wechseln oder neu laden.)
  if (pg.__at === url) {
    const same = await pg.evaluate((u) => location.pathname === u && typeof window.__pierce === 'function', url).catch(() => false);
    if (same) return true;
  }
  try {
    await H.ready(pg, url, "() => window.__pierce('button-card').length >= 2", 60000);
    await pg.waitForFunction(() => !!window._casoraLocalLoaded, null, { timeout: 20000 }).catch(() => {});
    await sleep(pg, 1800);
    pg.__at = url; return true;
  } catch (e) { pg.__at = null; return false; }
}
const FIND = (tpl) => { const all = window.__pierce('button-card');
  for (let i = 0; i < all.length; i++) { const b = all[i]; const t = [].concat((b._config || {}).template || []); const r = b.getBoundingClientRect();
    if (t[t.length - 1] === tpl || (t.includes(tpl) && !t.some((x) => /^casora_/.test(x) && x !== tpl && x !== 'casora_entity' && x !== 'casora_default' && !/^casora_popup_/.test(x)))) if (r.width > 4 && r.height > 4) return i; }
  return -1; };
async function locate(pg, row, tpl) {
  // Kandidaten-Seiten: Handy → Handy-Startseite, sonst Desktop-Ansichten; Ersatz: qa-matrix.
  const cands = [];
  if (row.geraet === 'handy') { for (const v of phoneViews) if (v.tpl.has(tpl)) cands.push('/' + PHONE + '/' + v.path); }
  else for (const v of deskViews) if (v.tpl.has(tpl)) cands.push('/' + DESK + '/' + v.path);
  if (!cands.length) {
    // Dynamisch gerenderte Vorlagen (Badges in der Raumkarte): Startseite und erste Räume probieren.
    if (row.geraet === 'handy') cands.push('/' + PHONE + '/' + (phoneViews[0] || { path: 'home' }).path);
    else for (const v of deskViews.slice(0, 4)) cands.push('/' + DESK + '/' + v.path);
  }
  if (MATRIX_DASH && matrixTpl.has(tpl)) cands.push('/qa-matrix/matrix');
  // Merken je Browser: wo die Vorlage zuletzt stand bzw. dass sie fehlt (Zeilen derselben Fläche folgen aufeinander).
  pg.__loc = pg.__loc || {};
  const known = pg.__loc[tpl];
  if (known === null) return null;
  const order = known ? [known, ...cands.filter((u) => u !== known)] : cands;
  let loadFail = false;
  for (const u of order) {
    if (!(await goView(pg, u)) && !(await goView(pg, u))) { loadFail = true; continue; }
    let i = await pg.evaluate(FIND, tpl).catch(() => -1);
    // Unter-Badges erscheinen erst nach Antippen ihres Sammel-Badges (wie popup-raender.mjs).
    if (i < 0 && /^casora_badge_(?!.*_group$)/.test(tpl)) {
      const groups = await pg.evaluate(() => window.__pierce('button-card').map((b, i) => ({ i, t: [].concat((b._config || {}).template || []), w: b.getBoundingClientRect().width }))
        .filter((x) => x.w > 0 && x.t.some((t) => /^casora_badge_\w+_group$/.test(t))).map((x) => x.i)).catch(() => []);
      for (const gi of groups) {
        const b = await box(pg, gi); if (!b) continue;
        await sleep(pg, 250);
        if (row.geraet === 'desktop') await pg.mouse.click(b.x + b.w / 2, b.y + b.h / 2); else await pg.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
        await sleep(pg, 1200);
        if (await popupOpen(pg)) { await closeAll(pg); continue; }
        i = await pg.evaluate(FIND, tpl).catch(() => -1);
        if (i >= 0) { pg.__dirty = true; break; }
      }
    }
    if (i >= 0) { pg.__loc[tpl] = u; return { i, url: u }; }
  }
  // Nur sicher fehlende Vorlagen merken – lud eine Seite nicht (Last), beim nächsten Mal neu suchen.
  if (!loadFail) pg.__loc[tpl] = null;
  return null;
}
const box = (pg, i) => pg.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect(); const c = b._config || {}; return { x: r.x, y: r.y, w: r.width, h: r.height, e: c.entity || '' }; }, i);
const clipOf = (r, v, pad = 14) => { const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  return { x, y, width: Math.max(4, Math.min(v.width, r.x + r.w + pad) - x), height: Math.max(4, Math.min(v.height, r.y + r.h + pad) - y) }; };
async function popupOpen(pg) {
  return pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) || window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog, ha-voice-command-dialog').some((d) => { const r = d.getBoundingClientRect(); return r.width > 80 && r.height > 80; })).catch(() => false);
}
async function closeAll(pg) {
  for (let i = 0; i < 3 && await popupOpen(pg); i++) {
    await pg.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); }).catch(() => {});
    await pg.keyboard.press('Escape').catch(() => {}); await sleep(pg, 450);
  }
}
async function settle(pg, fn, ms = 6000) {
  let last = '', since = Date.now();
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(pg, 150)) {
    const k = await pg.evaluate(fn).catch(() => '');
    if (k !== last) { last = k; since = Date.now(); } else if (Date.now() - since > 700) break;
  }
}
const POPSIG = () => { const s = window.casoraPopup && window.casoraPopup.surface; const c = s && s.querySelector('.content');
  return c ? c.scrollHeight + ':' + c.scrollWidth + ':' + Math.round(s.getBoundingClientRect().height) : String(document.querySelectorAll('*').length); };
// Zustände nur im Browser unterschieben (wie dev/qa/regress/lib.mjs fakeStates, sticky).
async function fake(pg, patch) {
  await pg.evaluate((p) => {
    const ha = document.querySelector('home-assistant');
    const apply = (st) => { const out = { ...st }; for (const [id, v] of Object.entries(p)) {
      const old = out[id] || { entity_id: id, attributes: {}, context: { id: 'qa' } };
      out[id] = { ...old, state: v.state, attributes: { ...old.attributes, ...(v.attributes || {}) }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() }; } return out; };
    const orig = ha.__qaOrigUpdateHass || ha._updateHass; ha.__qaOrigUpdateHass = orig;
    window.__qaPatch = Object.assign(window.__qaPatch || {}, p);
    ha._updateHass = function (obj) { return orig.call(this, obj && obj.states ? { ...obj, states: (() => { const o = { ...obj.states };
      for (const [id, v] of Object.entries(window.__qaPatch)) { const old = o[id] || { entity_id: id, attributes: {}, context: { id: 'qa' } }; o[id] = { ...old, state: v.state, attributes: { ...old.attributes, ...(v.attributes || {}) } }; } return o; })() } : obj); };
    ha._updateHass({ states: apply(ha.hass.states) });
  }, patch).catch(() => {});
  await sleep(pg, 1300);
}
const realState = (pg, id) => pg.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return s ? { state: s.state, attributes: s.attributes } : null; }, id).catch(() => null);
const STATE_FOR = (dom, z, cur) => {
  if (z === 'nicht_verfuegbar') return 'unavailable';
  const on = { light: 'on', switch: 'on', fan: 'on', cover: 'open', lock: 'unlocked', media_player: 'playing', climate: 'heat', humidifier: 'on', vacuum: 'cleaning', input_boolean: 'on', scene: cur, binary_sensor: 'on', alarm_control_panel: 'armed_away' };
  const off = { light: 'off', switch: 'off', fan: 'off', cover: 'closed', lock: 'locked', media_player: 'off', climate: 'off', humidifier: 'off', vacuum: 'docked', input_boolean: 'off', scene: cur, binary_sensor: 'off', alarm_control_panel: 'disarmed' };
  return (z === 'an' ? on : off)[dom] || cur;
};
const LANG = 'Sehr langer Gerätename zum Prüfen von Umbrüchen und Kürzungen im Wohnzimmer';
async function setZustand(pg, row, entity) {
  if (!['an', 'aus', 'nicht_verfuegbar', 'lange_namen'].includes(row.zustand)) return { ok: true };
  if (!entity) return row.zustand === 'lange_namen' ? { ok: true } : { ok: false, grund: 'Fläche ohne eigene Entität – Zustand nicht herstellbar' };
  const cur = await realState(pg, entity);
  if (!cur) return { ok: false, grund: 'Entität fehlt im Haus' };
  if (row.zustand === 'lange_namen') await fake(pg, { [entity]: { state: cur.state, attributes: { friendly_name: LANG } } });
  else await fake(pg, { [entity]: { state: STATE_FOR(entity.split('.')[0], row.zustand, cur.state) } });
  return { ok: true, vorher: cur, entity };
}
async function resetZustand(pg, z) {
  if (!z || !z.entity) return;
  await pg.evaluate(() => { window.__qaPatch = {}; }).catch(() => {});
  await fake(pg, { [z.entity]: { state: z.vorher.state, attributes: z.vorher.attributes } });
  await pg.evaluate((id) => { delete window.__qaPatch[id]; }, z.entity).catch(() => {});
}
// Allgemeine Messung auf einer Fläche: Textüberlauf + kleine Trefferflächen; root = Element oder Liste von Elementen.
const M_GENERAL = ({ touch, sel }) => {
  const roots = sel === 'panel' ? [window.__panel()] : sel === 'popup' ? [window.casoraPopup && window.casoraPopup.surface].filter(Boolean)
    : sel === 'card' ? [window.__qaCard] : window.__pierce(sel);
  const out = { ueberlauf: [], treffer: [] };
  const vis = (e, r) => r.width > 1 && r.height > 1 && (!e.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  const lab = (e) => ((e.getAttribute && (e.getAttribute('aria-label') || e.getAttribute('title'))) || e.textContent || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  const seen = new Set();
  const walk = (n) => { for (const e of n.children || []) { if (seen.has(e)) continue; seen.add(e);
    const r = e.getBoundingClientRect();
    if (vis(e, r) && r.bottom > 0 && r.top < innerHeight) {
      const s = getComputedStyle(e);
      const own = [...e.childNodes].some((x) => x.nodeType === 3 && x.data.trim());
      if (own && /hidden|clip/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis' && !(parseInt(s.webkitLineClamp) > 0))
        out.ueberlauf.push({ label: lab(e), sw: e.scrollWidth, cw: e.clientWidth });
      if (touch && (/^(BUTTON|A|HA-ICON-BUTTON|HA-SWITCH|INPUT|SELECT)$/.test(e.tagName) || /^(button|switch|tab|menuitem|checkbox|radio)$/.test(e.getAttribute('role') || ''))
        && (r.width < 40 || r.height < 40) && !(e.tagName === 'INPUT' && /checkbox|radio/.test(e.type))) out.treffer.push({ label: lab(e), w: Math.round(r.width), h: Math.round(r.height) });
    }
    if (e.shadowRoot && !/^(HA-CHART-BASE|HUI-MAP-CARD)$/.test(e.tagName)) walk(e.shadowRoot); walk(e); } };
  for (const r of roots) if (r) { walk(r.shadowRoot || r); if (r.shadowRoot) walk(r); }
  out.ueberlauf = out.ueberlauf.slice(0, 25); out.treffer = out.treffer.slice(0, 25);
  return out;
};
async function measure(pg, row, kind) {
  const touch = row.geraet !== 'desktop';
  const m = {};
  if (kind === 'popup') m.popup = await pg.evaluate(`(${M_POPUP})(${JSON.stringify({ phone: row.geraet === 'handy' })})`).catch((e) => ({ error: String(e).slice(0, 200) }));
  // ausrichtung: im Studio das Panel, sonst Fläche als Wurzel (Popup-Fläche bzw. Kachel).
  const swap = kind === 'studio' ? '' : kind === 'popup' ? 'const __s = window.casoraPopup && window.casoraPopup.surface; window.__panel = () => (__s ? { shadowRoot: __s.shadowRoot || __s } : null);'
    : 'window.__panel = () => (window.__qaCard ? { shadowRoot: window.__qaCard.shadowRoot || window.__qaCard } : null);';
  if (kind !== 'seite') {
    m.ausrichtung = await pg.evaluate(`(() => { const __p = window.__panel; ${swap} try { const r = (${M_AUSR})(); return r.err ? r : { n: r.finds.length, finds: r.finds.slice(0, 20).map((f) => ({ kind: f.kind, msg: f.msg, label: f.label, path: f.path.slice(-120) })) }; } finally { window.__panel = __p; } })()`).catch((e) => ({ err: String(e).slice(0, 200) }));
  }
  m.allgemein = await pg.evaluate(M_GENERAL, { touch, sel: kind === 'studio' ? 'panel' : kind === 'popup' ? 'popup' : kind === 'seite' ? 'button-card' : 'card' }).catch((e) => ({ error: String(e).slice(0, 200) }));
  return m;
}
const zaehle = (m) => {
  const p = m.popup || {};
  return { abgeschnitten: (p.cut || []).length, text: (p.text || []).length + ((m.allgemein || {}).ueberlauf || []).length, ueberlappung: (p.overlap || []).length,
    schatten: (p.shadow || []).length, treffer: Math.max((p.small || []).length, ((m.allgemein || {}).treffer || []).length), ausrichtung: (m.ausrichtung || {}).n || 0 };
};

// ── Studio (Wege wie dev/qa/ausrichtung.mjs) ───────────────────────────────
const PJS = (pg, src, a) => pg.evaluate(([src, a]) => new Function('p', 'arg', src)(window.__panel(), a), [src, a]);
async function ptap(pg, sel, re) {
  const pt = await pg.evaluate(([sel, src]) => {
    const p = window.__panel(); const out = [];
    (function walk(r) { r.querySelectorAll(sel).forEach((e) => out.push(e)); r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot && /^CASORA-/.test(e.tagName)) walk(e.shadowRoot); }); })(p.shadowRoot);
    const rx = src ? new RegExp(src, 'i') : null;
    const e = out.find((x) => { const r = x.getBoundingClientRect(); if (!r.width || !r.height) return false;
      return !rx || rx.test((x.textContent || '') + ' ' + (x.title || '') + ' ' + (x.getAttribute('aria-label') || '')); });
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [sel, re ? re.source : null]).catch(() => null);
  if (!pt) return false;
  await pg.mouse.click(pt.x, pt.y); await sleep(pg, 700); return true;
}
const insp = async (pg) => { await PJS(pg, 'if (p.classList.contains("bmode") && !p._bOpen) { p._bOpen = true; p._renderForm(); }'); await sleep(pg, 500); };
const T = (de, en) => (SPRACHE === 'de' ? de : en);
const STATIONS = {
  'Start (Raum, Inspektor)': async (pg) => { await insp(pg); return true; },
  'Inspektor zu': async (pg) => { await PJS(pg, 'p._bClose && p._bClose()'); return true; },
  'Dashboard-Menü (Titel)': (pg) => ptap(pg, '#roomtitle, #bigtitle, #navtitle'),
  'Raum-Menü': async (pg) => (await ptap(pg, '.btool.broom, #rooms .tab.on .caret')) || ptap(pg, '.bbar button', /Räume|Rooms/),
  'Kachel hinzufügen (Auswahl)': async (pg) => (await ptap(pg, '.btool.uxplus')) || ptap(pg, '.mtile.ghost'),
  'Kachel-Editor': (pg) => ptap(pg, '.mtile:not(.ghost):not(.missingdev)'),
  'Badge-Editor': (pg) => ptap(pg, '.pbadge:not(.ghost)', /Beleuchtung|Klima|Sicherheit|Lighting|Climate|Security/),
  'Szenen-Badge': (pg) => ptap(pg, '.pbadge', /Szenen|Scenes/),
  'Dashboard-Bereich': async (pg) => (await ptap(pg, '.btool', /^\s*Dashboard/)) || ptap(pg, '.bbar button', /Dashboard/),
  'Ansehen als': (pg) => ptap(pg, '.uxas'),
  'Ausgeblendet': (pg) => ptap(pg, '.bhid'),
  '⋯-Menü': (pg) => ptap(pg, '#more'),
  'Suche (⌘K)': async (pg) => { await pg.keyboard.press('Meta+k'); await sleep(pg, 400);
    if (!(await PJS(pg, 'return !!p.shadowRoot.querySelector(".msearch")'))) await ptap(pg, '#msearch, .msearchbtn, [title^="Such"], [title^="Search"]');
    await pg.keyboard.type(T('Licht', 'Light')); await sleep(pg, 500); return PJS(pg, 'return !!p.shadowRoot.querySelector(".msearch")'); },
  Einstellungen: async (pg) => (await ptap(pg, '.btool', /Einstellungen|Settings/)) || ptap(pg, '.bbar button', /Einstellungen|Settings/),
  Zeitreise: async (pg) => { if (!(await ptap(pg, '#brewind'))) return false; await sleep(pg, 1200); return true; },
  'Vorschau Handy': (pg) => ptap(pg, '.segopt', /Handy|Mobil|Phone|Mobile/),
  Assistent: async (pg) => { if (!(await ptap(pg, '#more'))) return false; return ptap(pg, '[role=menuitem], .combo-opt', /Einrichtungsassistent|Setup Assistant|Setup wizard/); },
  'Assistent Schritt 2': async (pg) => { if (!(await STATIONS.Assistent(pg))) return false; await sleep(pg, 1500);
    const w = pg.getByRole('button', { name: /^(Weiter|Next)$/ }).filter({ visible: true }).first();
    if (!(await w.isVisible().catch(() => false))) return false; await w.click(); await sleep(pg, 1200); return true; },
  'Inspektor: Kacheln': async (pg) => { await insp(pg); return ptap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*(Kacheln|Tiles)/); },
  'Inspektor: Badges': async (pg) => { await insp(pg); return ptap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*Badges/); },
  'Inspektor: Popups': async (pg) => { await insp(pg); return ptap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*Popups/); },
};
async function studioSettle(pg) {
  let last = '', since = Date.now();
  for (const t0 = Date.now(); Date.now() - t0 < 8000; await sleep(pg, 125)) {
    const k = await pg.evaluate(() => { const p = window.__panel && window.__panel(); const root = p && p.shadowRoot; if (!root) return 'x';
      const anim = (root.getAnimations ? root.getAnimations() : []).filter((a) => a.playState === 'running' && !(a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity)).length;
      const pos = [...root.querySelectorAll('button, .pbadge, .mtile')].slice(0, 400).map((e) => { const r = e.getBoundingClientRect(); return r.width ? Math.round(r.left) + ',' + Math.round(r.top) : ''; }).join(';');
      return anim + '|' + pos; }).catch(() => 'x');
    if (k !== last) { last = k; since = Date.now(); } else if (k.startsWith('0|') && Date.now() - since >= 500) return;
  }
}
async function studioOpen(pg) {
  if (pg.__studio) return true;
  try {
    await H.ready(pg, '/casora-studio', () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && (p._state || p._flowMode)); });
    await PJS(pg, 'p._setDash(arg); p._remember(arg); return p._load();', DESK);
    await pg.waitForFunction(() => { const p = window.__panel(); return p._state && p._state.compact && p._state.compact.rooms; }, null, { timeout: 30000 });
    await sleep(pg, 3000); pg.__studio = true; pg.__at = null; return true;
  } catch (e) { pg.__studio = false; return false; }
}
async function studioReset(pg) {
  for (let i = 0; i < 3; i++) { await pg.keyboard.press('Escape').catch(() => {}); await sleep(pg, 150); }
  await PJS(pg, `try { p._openCombo && p._openCombo(); } catch (e) {}
    try { if (p._flowMode) p._exitFlow(false); } catch (e) {}
    try { if (p._csOpen && p._csClose) p._csClose(); } catch (e) {}
    try { if (p._cuOpen && p._cuClose) p._cuClose(); } catch (e) {}
    try { if (p._cvOpen && p._cvClose) p._cvClose(); } catch (e) {}
    try { p._bToastHide && p._bToastHide(); } catch (e) {}
    return !!p._state && p._dashUrl === arg;`, DESK).then((ok) => { if (!ok) pg.__studio = false; }).catch(() => { pg.__studio = false; });
  await sleep(pg, 350);
}
async function studioRow(pg, row, f) {
  if (!(await studioOpen(pg))) return { status: 'fehler', grund: 'Studio lädt nicht' };
  await studioReset(pg);
  if (!pg.__studio && !(await studioOpen(pg))) return { status: 'fehler', grund: 'Studio lädt nicht' };
  let ok = false, grund = '';
  try {
    if (f.aktion === 'station') { const fn = STATIONS[f.ziel]; ok = fn ? await fn(pg) : false; if (!ok) grund = 'Station nicht erreichbar (Knopf fehlt in diesem Haus/Gerät)'; }
    else if (f.aktion === 'seite') { await PJS(pg, 'p._bOpen = true; return p._csOpenPage(arg);', f.ziel); await sleep(pg, 1200); ok = true; }
    else if (f.aktion === 'js') { await PJS(pg, f.ziel.startsWith('p.') && !/;/.test(f.ziel) ? 'return ' + f.ziel : f.ziel); await sleep(pg, 1200); ok = true; }
    else if (f.aktion === 'ask') {
      await PJS(pg, 'window.__qaAsk = p._ask(arg);', { title: f.titel || '…', message: f.text || undefined, value: f.eingabe ? '' : undefined, confirmLabel: 'OK' });
      await sleep(pg, 700); ok = true;
    } else if (f.aktion === 'ablauf') {
      const r = await PJS(pg, `if (typeof p[arg] !== 'function') return 'keine Methode'; try { const x = p[arg](); if (x && x.catch) x.catch(() => {}); } catch (e) { return 'Fehler: ' + e.message; } return '';`, f.ziel);
      await sleep(pg, 1800);
      const open = await PJS(pg, 'return !!p._flowMode || !!(p.shadowRoot.querySelector(".flow, .fx, .sheet.flow"))').catch(() => false);
      ok = !r && open; if (!ok) grund = r || 'Ablauf öffnet ohne Vorbedingung nicht (braucht Daten/Argumente aus dem vorigen Schritt)';
    }
  } catch (e) { grund = 'Fehler: ' + String(e.message).slice(0, 160); }
  if (!ok) return { status: 'nicht_abbildbar', grund };
  await studioSettle(pg);
  await pg.addScriptTag({ content: H.PIERCE }).catch(() => {});
  return { status: 'ok', kind: 'studio', shot: null };
}

// ── Overlays / Seiten ─────────────────────────────────────────────────────
async function clickTpl(pg, tpl, touch) {
  const i = await pg.evaluate(FIND, tpl).catch(() => -1); if (i < 0) return false;
  const b = await box(pg, i); if (!b) return false;
  if (touch) await pg.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2); else await pg.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await sleep(pg, 1200); return true;
}
async function overlayRow(pg, row, f, V) {
  const touch = row.geraet !== 'desktop';
  const home = row.geraet === 'handy' ? '/' + PHONE + '/' + (phoneViews[0] || { path: 'home' }).path : '/' + DESK + '/' + (deskViews[0] || { path: 'home' }).path;
  if (!(await goView(pg, home))) return { status: 'fehler', grund: 'Dashboard lädt nicht' };
  const navTap = async (n) => { const pt = await pg.evaluate((n) => { const b = window.__pierce('.hmn-btn').filter((x) => x.getBoundingClientRect().width > 0).sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)[n];
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, n).catch(() => null);
    if (!pt) return false; await pg.touchscreen.tap(pt.x, pt.y); await sleep(pg, 1300); return true; };
  const elBox = (sel) => pg.evaluate((sel) => { const e = window.__pierce(sel).find((x) => x.getBoundingClientRect().width > 0); if (!e) return null; window.__qaCard = e; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel).catch(() => null);
  let clip = null, kind = 'seite';
  switch (f.aktion) {
    case 'navbar': {
      const sel = row.geraet === 'handy' ? 'casora-mobile-nav' : 'casora-nav-bar';
      const b = await elBox(sel); if (!b) return { status: 'nicht_abbildbar', grund: sel + ' fehlt' };
      if (row.zustand === 'hover') { const pt = await pg.evaluate(() => { const n = window.__pierce('casora-nav-bar')[0]; const r = [...n.shadowRoot.querySelectorAll('button.route:not(.active)')][1]; if (!r) return null; const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
        if (pt) { await pg.mouse.move(pt.x, pt.y); await sleep(pg, 400); } }
      if (row.zustand === 'gedrueckt') { const pt = await pg.evaluate(() => { const r = window.__pierce('.hmn-btn').filter((x) => x.getBoundingClientRect().width > 0).sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)[1]; if (!r) return null; const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
        if (pt) { await pg.mouse.move(pt.x, pt.y); await pg.mouse.down(); await sleep(pg, 220); pg.__up = true; } }
      clip = clipOf(b, V, 16); kind = 'card'; break;
    }
    case 'raeume': case 'szenen': {
      if (f.aktion === 'szenen' && row.geraet !== 'handy') {
        const pt = await pg.evaluate(() => { const n = window.__pierce('casora-nav-bar')[0]; const b = n && [...n.shadowRoot.querySelectorAll('button, [role=button]')].find((x) => /Szenen|Scenes/.test(x.textContent) && x.getBoundingClientRect().width > 0);
          if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).catch(() => null);
        if (!pt) return { status: 'nicht_abbildbar', grund: 'Raumleiste ohne Szenen-Knopf' };
        if (touch) await pg.touchscreen.tap(pt.x, pt.y); else await pg.mouse.click(pt.x, pt.y);
        await sleep(pg, 1200); kind = 'seite'; break;
      }
      if (row.geraet === 'handy') { if (!(await navTap(f.aktion === 'raeume' ? 1 : 2))) return { status: 'nicht_abbildbar', grund: 'Handy-Leiste: Taste fehlt' }; }
      else { const pt = await pg.evaluate(() => { const n = window.__pierce('casora-nav-bar')[0]; const b = n && n.shadowRoot.querySelector('.more-r'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
        if (!pt) return { status: 'nicht_abbildbar', grund: 'Raumleiste ohne Mehr-Knopf (alle Räume passen)' };
        await pg.mouse.click(pt.x, pt.y); await sleep(pg, 1200); }
      if (row.zustand === 'lange_namen') return { status: 'nicht_abbildbar', grund: 'Raumnamen kommen aus der Dashboard-Konfiguration, nicht aus Zuständen – nur im Stresshaus (lange Namen) abbildbar' };
      kind = 'seite'; break;
    }
    case 'glocke': if (!(await clickTpl(pg, 'casora_notifications_button', touch))) return { status: 'nicht_abbildbar', grund: 'Glocke fehlt' }; kind = 'seite'; break;
    case 'mehr': if (!(await clickTpl(pg, 'casora_settings_button', touch))) return { status: 'nicht_abbildbar', grund: '⋯-Knopf fehlt' }; kind = 'seite'; break;
    case 'assist': if (!(await clickTpl(pg, 'casora_assist_button', touch))) return { status: 'nicht_abbildbar', grund: 'Assist-Knopf fehlt' }; await sleep(pg, 800); kind = (await popupOpen(pg)) ? 'popup' : 'seite'; break;
    case 'welle': {
      const mp = await pg.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((x) => /^media_player\./.test(x)).slice(0, 1));
      if (!mp.length) return { status: 'nicht_abbildbar', grund: 'kein media_player im Haus' };
      await fake(pg, { [mp[0]]: { state: 'playing', attributes: { media_title: 'Testtitel', media_artist: 'Testkünstler' } } }); pg.__dirty = true;
      let pt = null;
      for (let t0 = Date.now(); !pt && Date.now() - t0 < 10000; await sleep(pg, 400)) pt = await pg.evaluate(() => { const h = window.__pierce('button-card[data-casora-welle]').find((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top < 140);
        if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).catch(() => null);
      if (!pt) return { status: 'nicht_abbildbar', grund: 'Welle erscheint nicht (kein casora_now_playing mit Welle auf der Startseite)' };
      await pg.mouse.click(pt.x, pt.y); await sleep(pg, 1300);
      if (!(await pg.evaluate(() => window.__pierce('.casora-welle-menu').some((m) => m.getBoundingClientRect().width > 0)).catch(() => false))) return { status: 'nicht_abbildbar', grund: 'Welle-Menü öffnet nicht' };
      pg.__dirty = true; kind = 'seite'; break;
    }
    case 'rueckfrage': {
      const r = await pg.evaluate(() => { const ids = Object.keys(document.querySelector('home-assistant').hass.states).filter((x) => /^light\./.test(x)); if (!ids.length || !window.casoraConfirmSpec) return false;
        window.__casoraConfirmIds = [ids[0]]; window.__qaConf = window.casoraConfirmSpec({ domain: 'light', service: 'toggle', target: { entity_id: ids[0] } }); return true; });
      if (!r) return { status: 'nicht_abbildbar', grund: 'casoraConfirmSpec/Licht fehlt' };
      await sleep(pg, 1200); pg.__dirty = true; kind = (await popupOpen(pg)) ? 'popup' : 'seite'; break;
    }
    case 'raumseite': {
      if (row.geraet === 'handy') {
        const k = await pg.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar); return n ? (n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k) && k !== 'room_scenes')[0] || null) : null; }).catch(() => null);
        if (!k) return { status: 'nicht_abbildbar', grund: 'kein Raum am Handy' };
        await pg.evaluate((k) => window._casoraFilter && window._casoraFilter.set(k), k); await sleep(pg, 3000); pg.__dirty = true;
      } else if (!(await goView(pg, '/' + DESK + '/' + (deskViews[1] || deskViews[0]).path))) return { status: 'fehler', grund: 'Raum-Ansicht lädt nicht' };
      if (row.zustand === 'lange_namen') return { status: 'nicht_abbildbar', grund: 'Raumname aus der Konfiguration – nur im Stresshaus' };
      kind = 'seite'; break;
    }
    case 'seite': kind = 'seite'; break;
    default: return { status: 'nicht_abbildbar', grund: 'unbekannte Aktion ' + f.aktion };
  }
  return { status: 'ok', kind, clip };
}

// ── Kacheln/Badges/Kopf (Vorlage) und Popups ──────────────────────────────
async function tplRow(pg, row, f, V) {
  const tpl = f.vorlage;
  const loc = await locate(pg, row, tpl);
  if (!loc) return { status: 'nicht_abbildbar', grund: `Vorlage ${tpl} in Haus ${HAUS} (${row.geraet}) nicht gefunden – auch nicht im Matrix-Dashboard` };
  let b = await box(pg, loc.i);
  const z = await setZustand(pg, row, f.entitaet ? b.e : null);
  if (!z.ok) return { status: 'nicht_abbildbar', grund: z.grund };
  pg.__zust = z;
  // Lange Namen: steht der Name fest in der Karte (name:), zusätzlich dort verlängern (nur im Browser).
  if (row.zustand === 'lange_namen') {
    const had = await pg.evaluate(([i, n]) => { const c = window.__pierce('button-card')[i]; if (!c || !c._config || !c._config.name || !c.setConfig) return false;
      try { c.setConfig({ ...c._config, name: n }); return true; } catch (e) { return false; } }, [loc.i, LANG]).catch(() => false);
    if (had) { pg.__dirty = true; await sleep(pg, 600); }
    if (!z.entity && !had) return { status: 'nicht_abbildbar', grund: 'kein Name zum Verlängern (weder Entität noch name:)' };
  }
  if (z.entity) { pg.__dirty = true; b = await box(pg, loc.i); await sleep(pg, 300); }
  await pg.evaluate((i) => { window.__qaCard = window.__pierce('button-card')[i]; }, loc.i);
  if (f.familie === 'popup') {
    const touch = row.geraet !== 'desktop';
    // Erst antippen, wenn die Kachel ruhig steht (nach dem Schließen des vorigen Popups); zweiter Versuch
    // auf dem Namen (unten links) – die Mitte trifft bei manchen Kacheln einen Schalter.
    let opened = false;
    for (const [fx, fy, wait] of [[0.5, 0.5, 5000], [0.22, 0.82, 4000]]) {
      await sleep(pg, 450);
      const bb = (await box(pg, loc.i)) || b;
      if (touch) await pg.touchscreen.tap(bb.x + bb.w * fx, bb.y + bb.h * fy); else await pg.mouse.click(bb.x + bb.w * fx, bb.y + bb.h * fy);
      for (let t0 = Date.now(); Date.now() - t0 < wait; await sleep(pg, 200)) if (await popupOpen(pg)) { opened = true; break; }
      if (opened) break;
    }
    if (!opened) return { status: 'nicht_abbildbar', grund: 'Antippen öffnet kein Popup (schaltet, klappt Unter-Badges auf oder Gerät fehlt)' };
    await settle(pg, POPSIG); await sleep(pg, 400);
    const r = await pg.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; let e = s;
      if (!e) e = window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog').find((d) => d.getBoundingClientRect().width > 80);
      if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, kind: s ? 'casora' : e.tagName.toLowerCase() }; });
    return { status: 'ok', kind: 'popup', clip: row.geraet === 'handy' || !r ? null : clipOf(r, V, 28), popupArt: r && r.kind };
  }
  if (row.zustand === 'hover') { await pg.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await sleep(pg, 450); }
  if (row.zustand === 'gedrueckt') { await pg.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await pg.mouse.down(); await sleep(pg, 200); pg.__up = true; }
  return { status: 'ok', kind: 'card', clip: clipOf(b, V, 16) };
}

// ── Lauf ──────────────────────────────────────────────────────────────────
const ORDER = ['popups', 'kacheln', 'handy', 'studio', 'umzug'];
const combos = new Map();
for (const z of rows) { const k = [ORDER.indexOf(z.gruppe), z.gruppe, z.geraet, z.schema].join('|'); if (!combos.has(k)) combos.set(k, []); combos.get(k).push(z); }
const keys = [...combos.keys()].sort();
const stamp = Date.now(); let nOk = 0, nNa = 0, nErr = 0;
for (const k of keys) {
  const [, gruppe, geraet, schema] = k.split('|');
  const V = VIEWS[geraet];
  const list_ = combos.get(k);
  console.log(`▶ ${HAUS} ${gruppe} ${geraet} ${schema}: ${list_.length} Zeilen`);
  let o = null;
  const openB = async () => {
    if (o) await o.browser.close().catch(() => {});
    o = await H.open({ ...V, dark: schema === 'dunkel', locale: SPRACHE === 'de' ? 'de-DE' : 'en-US', studio: 'b', args: ['--hide-scrollbars'] });
    await o.context.addInitScript((l) => { window.CASORA_QA_NO_WELLE_AUTO = true; localStorage.setItem('selectedLanguage', JSON.stringify(l)); }, SPRACHE);
    // Nur abbilden, nichts schalten: Dienstaufrufe (call_service) und Speichern im Browser abfangen und mit
    // „ok“ beantworten – das Test-HA bleibt für alle Zeilen im selben Zustand.
    await o.context.addInitScript(() => {
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        send(d) {
          // Ausnahme: reine UI-Helfer (input_select.casora_expanded_row u. Ä.: Sammel-Badges aufklappen) wie in alles.mjs.
          if (typeof d === 'string' && /"type":"(call_service|lovelace\/config\/save|frontend\/set_user_data|casora\/settings\/(set|save))"/.test(d)
            && !/"domain":"input_(select|boolean|number|text)"[^}]*"casora_|"entity_id":"input_(select|boolean|number|text)\.casora_/.test(d)) {
            try { const m = JSON.parse(d); setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: m.id, type: 'result', success: true, result: { context: { id: 'qa' } } }) })), 0); return; } catch (e) { /* normal */ }
          }
          return super.send(d);
        }
      };
    });
  };
  await openB();
  // Zeilen nach Ort sortieren (gleiche Fläche nacheinander), Studio zuletzt egal.
  list_.sort((a, b) => a.flaeche.localeCompare(b.flaeche) || a.zustand.localeCompare(b.zustand));
  let streak = 0;
  for (const row of list_) {
    const f = FL[row.flaeche];
    const pg = o.page;
    const e0 = o.errors.length;
    const t0 = Date.now();
    let res;
    try {
      if (/^studio/.test(f.familie)) res = await studioRow(pg, row, f);
      else if (f.familie === 'overlay') res = await overlayRow(pg, row, f, V);
      else res = await tplRow(pg, row, f, V);
    } catch (e) { res = { status: 'fehler', grund: String(e.message || e).slice(0, 200) }; }
    const out = { zeile_id: row.zeile_id, flaeche: row.flaeche, zustand: row.zustand, geraet: row.geraet, schema: row.schema, sprache: row.sprache, haus: HAUS, gruppe: row.gruppe, status: res.status };
    if (res.status === 'ok') {
      const file = path.join(MDIR, row.bild);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        await pg.addScriptTag({ content: H.PIERCE }).catch(() => {});
        const m = await measure(pg, row, res.kind);
        await pg.screenshot({ path: file, ...(res.clip ? { clip: res.clip } : {}) });
        out.bild = row.bild; out.messung = m; out.zahlen = zaehle(m); if (res.popupArt) out.popup_art = res.popupArt;
        nOk++;
      } catch (e) { out.status = 'fehler'; out.grund = 'Bild/Messung: ' + String(e.message).slice(0, 160); nErr++; }
    } else { out.grund = res.grund; if (res.status === 'nicht_abbildbar') nNa++; else nErr++; }
    if (o.errors.pending && o.errors.pending.size) await Promise.all([...o.errors.pending]).catch(() => {});
    const errs = o.errors.slice(e0).filter((x) => !ERR_ALLOW.test(x));
    if (errs.length) { out.konsole = errs.slice(0, 5); for (const x of errs) fund(row, x); }
    out.ms = Date.now() - t0;
    writeMess(out);
    // Aufräumen: Maus los, Popups zu, untergeschobene Zustände zurück.
    if (pg.__up) { await pg.mouse.move(2, 2).catch(() => {}); await pg.mouse.up().catch(() => {}); pg.__up = false; }
    else await pg.mouse.move(2, 2).catch(() => {});
    if (!/^studio/.test(f.familie)) await closeAll(pg);
    if (pg.__zust && pg.__zust.entity) { await resetZustand(pg, pg.__zust); }
    pg.__zust = null;
    if (pg.__dirty) { pg.__at = null; pg.__dirty = false; }
    streak = out.status === 'fehler' ? streak + 1 : 0;
    if (streak >= 4) { console.log('  4 Fehler in Folge – Browser neu'); await openB(); streak = 0; }
    process.stdout.write(out.status === 'ok' ? '.' : out.status === 'nicht_abbildbar' ? '–' : 'x');
  }
  process.stdout.write('\n');
  await o.browser.close().catch(() => {});
}
console.log(`fertig ${HAUS}: ${nOk} Bilder, ${nNa} nicht abbildbar, ${nErr} Fehler (${Math.round((Date.now() - stamp) / 1000)} s)`);
