// Popup v3 „Bühne“ (docs/handbuch/popup-richtlinien-v3.md, popup-rework-v3-auftrag.md §3.5), static, without HA:
//   node dev/unit/popup_v3.mjs
//  1. The pieces exist: UI.stage (all 8 types), UI.quick, the frame switch variant 'v3' and its host selector.
//  2. Every migrated popup (MIGRIERT below) sets variant 'v3' in every casora_popup of its templates (tap and hold)
//     and calls UI.stage exactly as often as listed in its module region.
//  3. UI.quick never gets a dangerous item; the piece itself shows at most 4 tiles.
//  4. Charts in migrated regions (richtlinien §7): no hex colour in a _hpChartCfg call, heights only 120/140/160.
//  5. No own stage plate (radius 32 + soft-row-fill) in migrated regions – the stage comes from UI.stage.
//  6. popup_v3_offen.json lists every popup that is not migrated yet, with a reason (a ratchet: a popup leaves
//     the list only into MIGRIERT; empty = done). Each popup is either migrated or open, never both.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const LOCAL = 'custom_components/casora/scripts/local/';
const core = rd('custom_components/casora/scripts/casora-core.js');
const OFFEN = JSON.parse(rd('dev/unit/popup_v3_offen.json'));

// Migrated popups: templates, module file and the region of the module that builds it (from/to markers), the
// number of UI.stage calls in that region.
const MIGRIERT = [
  { popup: 'Licht (Raum, Haus, Leuchte aus der Gruppe)', vorlagen: ['casora_popup_light'], file: '03-popups.js',
    from: 'var S = window._casoraLightSoft = { els: {} };', to: null, stages: 1 },
  { popup: 'Jalousien (Raum/Gruppe)', vorlagen: ['casora_popup_cover'], file: null, stages: 1 },
  // S2 while it can be set; off without heating / unavailable keep S2 greyed, a group falls back to S7 (no shared
  // target) – three branches, in tap and hold.
  { popup: 'Thermostat', vorlagen: ['casora_thermostat'], file: null, stages: 6 },
  { popup: 'Jalousie (einzeln)', vorlagen: ['casora_cover'], file: null, stages: 1 },
  { popup: 'Schalter', vorlagen: ['casora_switch'], file: null, stages: 1 },
  { popup: 'Lüfter', vorlagen: ['casora_fan'], file: null, stages: 1 },
  { popup: 'Luftbefeuchter', vorlagen: ['casora_humidifier'], file: '19-befeuchter.js', from: '  H.v3 = function () {', to: null, stages: 2 },
  { popup: 'Gerät allgemein', vorlagen: ['casora_entity_actions'], file: '05-standard-medien.js',
    from: 'window._casoraEntityPopup = function', to: '// ── Media popup', stages: 1 },
  { popup: 'Medien-Player', vorlagen: ['casora_media'], file: null, stages: 1 },
  { popup: 'Now Playing (Kachel/Chip)', vorlagen: ['casora_now_playing_primary', 'casora_now_playing_chip'], file: null, stages: 2 },
  { popup: 'Medien-Badge', vorlagen: ['casora_popup_media'], file: '32-media-badge.js', from: '  B.stage = function', to: '  B.sec = function', stages: 2 },
  // casora_appliance (older generic appliance tile, own template body) keeps variant B for now.
  { popup: 'Waschmaschine/Trockner', vorlagen: ['casora_popup_laundry'], file: '02-devices.js', from: '  var L = window._casoraLaundry = ', to: '  var D = window._casoraDish = ', stages: 1 },
  { popup: 'Geschirrspüler', vorlagen: ['casora_popup_dishwasher'], file: '02-devices.js', from: '  var D = window._casoraDish = ', to: '  var P = window._casoraPrint = ', stages: 1 },
  { popup: '3D-Drucker', vorlagen: ['casora_popup_3d_printer'], file: '02-devices.js', from: '  var P = window._casoraPrint = ', to: '  var V = window._casoraVac = ', stages: 1 },
  { popup: 'Mähroboter', vorlagen: ['casora_popup_lawn_mower'], file: '16-maeher.js', from: '  M.popup = function', to: null, stages: 1 },
  { popup: 'E-Bike', vorlagen: ['casora_popup_ebike'], file: '03-popups.js', from: '  var B = window._casoraBike = {};', to: '// ── Update-Popup', stages: 1 },
  { popup: 'Saugroboter', vorlagen: ['casora_vacuum'], file: '02-devices.js', from: '  var V = window._casoraVac = ', to: '// ── Notifications: line wrapping', stages: 1 },
];

// 1. Pieces.
assert.ok(/\bstage: stage\b/.test(core) && /\bquick: quick\b/.test(core), 'window._casoraUI.stage/quick missing (casora-core.js)');
const types = core.match(/var STAGE_TYPES = \{([^}]*)\}/);
assert.ok(types, 'STAGE_TYPES missing');
for (const [k, s] of [['slider', 'S1'], ['value', 'S2'], ['position', 'S3'], ['progress', 'S4'], ['image', 'S5'], ['chart', 'S6'], ['status', 'S7'], ['content', 'S8']]) {
  assert.ok(new RegExp('\\b' + k + ": '" + s + "'").test(types[1]), `UI.stage type ${k} (${s}) missing`);
}
assert.ok(core.includes(':host([soft][data-casora-pv="b"]), :host([soft][data-casora-pv="v3"])'), 'v3 host does not share the variant B tokens');
assert.ok(/:host\(\[soft\]\[data-casora-pv="v3"\]\) \.header-ring \{ display: none/.test(core), 'v3 header still shows the symbol tile');
for (const tok of ['stage-radius', 'stage-pad', 'stage-gap', 'value-fs', 'value-fs-big', 'quick-h', 'quick-radius', 'head-title-fs']) {
  assert.ok(core.includes('--casora-v3-' + tok + ':'), `v3 token --casora-v3-${tok} missing`);
}
assert.ok(/this\.setAttribute\('data-casora-pv', String\(pv\)\)/.test(core), 'frame switch (data-casora-pv from cfg.variant) missing');
assert.ok(/data-casora-stage="' \+ code \+ '"/.test(core), 'stage plate is not marked data-casora-stage');
// Layout helpers know stage and quick.
for (const f of ['02-devices.js', '05-weich-mehr.js']) {
  assert.ok(/\[o\.stage, o\.quick\]/.test(rd(LOCAL + f)), `${f}: layout without the stage/quick fields`);
}

// 3. Quick: never dangerous; the piece caps at 4 (3 + „Alle (n)“).
assert.ok(/!x\.danger/.test(core) && /list\.length > 4[\s\S]{0,120}slice\(0, 3\)/.test(core), 'UI.quick: danger filter or the 4-tile cap missing');
const MODS = fs.readdirSync(new URL(LOCAL, ROOT)).filter((f) => f.endsWith('.js'));
const SRC = Object.fromEntries(MODS.map((f) => [f, rd(LOCAL + f)]));
const tplSrc = (name) => JSON.stringify(T[name] || '');
const quickCalls = (s) => {
  const out = [];
  const re = /\.quick\(/g;
  let m;
  while ((m = re.exec(s))) out.push(s.slice(m.index, m.index + 600));
  return out;
};
for (const [k, s] of Object.entries(SRC).concat(Object.keys(T).map((n) => ['tpl:' + n, tplSrc(n)]))) {
  for (const c of quickCalls(s)) {
    const call = c.slice(0, c.indexOf(');') > 0 ? c.indexOf(');') : c.length);
    assert.ok(!/danger\s*:\s*true/.test(call), `${k}: UI.quick with a dangerous item`);
  }
}

const strings = (x, out = []) => {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => strings(y, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => strings(y, out));
  return out;
};
// 2., 4., 5. Migrated popups.
const popupsOf = (t, out = []) => {
  if (!t || typeof t !== 'object') return out;
  if (Array.isArray(t)) { t.forEach((x) => popupsOf(x, out)); return out; }
  for (const [k, v] of Object.entries(t)) {
    if (k === 'casora_popup' && v && typeof v === 'object') out.push(v);
    else popupsOf(v, out);
  }
  return out;
};
const region = (m) => {
  // Popups built in the template itself (casora_popup content): the region is that template.
  if (!m.file) return m.vorlagen.map((n) => strings(T[n]).join('\n')).join('\n');
  const s = SRC[m.file];
  assert.ok(s, `${m.popup}: module ${m.file} missing`);
  const a = s.indexOf(m.from), b = m.to ? s.indexOf(m.to, a + 1) : s.length;
  assert.ok(a > -1 && b > a, `${m.popup}: region markers not found in ${m.file}`);
  return s.slice(a, b);
};
for (const m of MIGRIERT) {
  for (const n of m.vorlagen) {
    assert.ok(T[n], `${m.popup}: template ${n} missing`);
    const pops = popupsOf(T[n]);
    if (m.variantInModule) continue;
    assert.ok(pops.length, `${m.popup}: ${n} has no casora_popup`);
    pops.forEach((p) => assert.equal(p.variant, 'v3', `${m.popup}: ${n} casora_popup without variant 'v3'`));
  }
  const r = region(m);
  if (m.variantInModule) assert.ok(/variant: 'v3'/.test(r), `${m.popup}: casoraPopup.open without variant 'v3'`);
  const n = (r.match(/\.stage\('/g) || []).length;
  assert.equal(n, m.stages, `${m.popup}: UI.stage called ${n}× in its region (listed ${m.stages})`);
  for (const c of r.match(/_hpChartCfg\([^;]*\)/g) || []) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${m.popup}: hex colour in ${c}`);
    const h = c.match(/,\s*(\d+)\s*(?:,[^,]*)?\)$/);
    if (h) assert.ok([120, 140, 160].includes(Number(h[1])), `${m.popup}: chart height ${h[1]} (120/140/160)`);
  }
  assert.ok(!/radius:\s*32px[^"'`]{0,200}soft-row-fill|soft-row-fill[^"'`]{0,200}radius:\s*32px/.test(r), `${m.popup}: own stage plate instead of UI.stage`);
}

// 6. Open list.
const mig = new Set(MIGRIERT.map((m) => m.popup));
const seen = new Set();
for (const o of OFFEN) {
  assert.ok(o.popup && o.grund, 'popup_v3_offen.json: entry without popup or reason');
  assert.ok(!mig.has(o.popup), `${o.popup}: migrated and still open`);
  assert.ok(!seen.has(o.popup), `${o.popup}: twice in popup_v3_offen.json`);
  seen.add(o.popup);
  for (const n of o.vorlagen || []) assert.ok(T[n], `${o.popup}: template ${n} missing`);
}
// The auftrag's tables (§5) list 54 popups: none may drop out of both lists.
assert.equal(MIGRIERT.length + OFFEN.length, 54, 'popup_v3: migrated + open must cover all 54 popups of the auftrag (§5)');
console.log(`popup_v3: ok (${MIGRIERT.length} migrated, ${OFFEN.length} open)`);
