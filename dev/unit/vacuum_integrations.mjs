// Robot vacuums beyond Roborock: Dreame (HACS) and Ecovacs (HA core) fill the popup from their own
// translation_keys; durations follow the unit the sensor states (Dreame minutes, Ecovacs seconds).
// Asked in issue #33 (a Dreame popup showed little). Keys from the integrations' sources (21.10.2026).
//   node dev/unit/vacuum_integrations.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'block: ' + a); return src.slice(i, j); };

const hass = { devices: { robot: { id: 'robot' } }, entities: {}, states: {} };
const reg = (domain, key, unit, state) => {
  const id = `${domain}.example_robot_${key}`;
  hass.entities[id] = { entity_id: id, device_id: 'robot', translation_key: key };
  hass.states[id] = { entity_id: id, state, attributes: unit ? { unit_of_measurement: unit } : {} };
  return id;
};
const window = {};
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null) };
new Function('window', 'document', read('custom_components/casora/scripts/local/00-finden.js'))(window, globalThis.document);
const geraete = read('custom_components/casora/scripts/local/02-geraete.js');
const str = (states, e) => { const s = e && states[e] && states[e].state; return !s || ['unknown', 'unavailable', 'none', 'off'].includes(s) ? null : s; };
const num = (states, e) => { const v = e && states[e] ? parseFloat(states[e].state) : NaN; return Number.isFinite(v) ? v : null; };
window._casoraLaundry = { util: { str, num, DIM: {} } };
new Function('window', 'document', cut(geraete, '// ── Saugroboter (casora_vacuum', '// ── Benachrichtigungen'))(window, globalThis.document);
const V = window._casoraVac;

const vac = { entity_id: 'vacuum.example_robot', state: 'docked', attributes: {} };
hass.entities['vacuum.example_robot'] = { entity_id: 'vacuum.example_robot', device_id: 'robot' };
hass.states['vacuum.example_robot'] = vac;

// ── Dreame ───────────────────────────────────────────────────────────────────────
const d = {
  progress: reg('sensor', 'cleaning_progress', '%', '40'),
  area: reg('sensor', 'cleaned_area', 'm²', '12'),
  time: reg('sensor', 'cleaning_time', 'min', '25'),
  dnd: reg('switch', 'dnd', null, 'on'),
  dndStart: reg('time', 'dnd_start', null, '22:00:00'),
  dndEnd: reg('time', 'dnd_end', null, '08:00:00'),
  dryLeft: reg('sensor', 'drying_left', 'min', '90'),
  cleanMode: reg('select', 'cleaning_mode', null, 'sweeping_and_mopping'),
  mopInt: reg('select', 'water_volume', null, 'medium'),
  mopMode: reg('select', 'mop_pad_humidity', null, 'moist'),
  emptyMode: reg('select', 'auto_empty_mode', null, 'standard'),
  lastEnd: reg('sensor', 'cleaning_history', null, '2026-10-20T10:00:00+00:00'),
  total: reg('sensor', 'cleaning_count', 'x', '120'),
  totalTime: reg('sensor', 'total_cleaning_time', 'min', '6000'),
  totalArea: reg('sensor', 'total_cleaned_area', 'm²', '3000'),
};
// Settings that only look like actions stay out.
reg('switch', 'auto_drying', null, 'on');
reg('switch', 'auto_dust_collecting', null, 'on');
reg('switch', 'self_clean', null, 'on');
const parts = {
  main: reg('sensor', 'main_brush_time_left', 'h', '250'), mainR: reg('button', 'reset_main_brush', null, 'unknown'),
  sens: reg('sensor', 'sensor_dirty_time_left', 'h', '0.2'), sensR: reg('button', 'reset_sensor', null, 'unknown'),
  pad: reg('sensor', 'mop_pad_time_left', 'h', '40'),
  // Same name as Xiaomi's seconds and Dreame's percent: never read as a part.
  pct: reg('sensor', 'main_brush_left', '%', '80'),
};
let c = V.resolve(vac, {}, hass.states, hass);
for (const [k, id] of Object.entries(d)) assert.equal(c[k], id, 'Dreame ' + k);
assert.equal(c.drying, null, 'auto drying is a setting, not "dry now"');
assert.equal(c.empty, null, 'auto dust collecting is a setting');
assert.equal(c.wash, null, 'self clean is a setting');
const P = Object.fromEntries(c.parts.map((p) => [p[1], p]));
assert.equal(P['Hauptbürste'][0], parts.main);
assert.equal(P['Hauptbürste'][4], parts.mainR, 'Dreame reset button');
assert.equal(P['Sensoren reinigen'][0], parts.sens, 'Dreame sensor_dirty_time_left');
assert.equal(P['Sensoren reinigen'][4], parts.sensR);
assert.equal(P['Mopp-Pad'][0], parts.pad);
assert.ok(!c.parts.some((p) => p[0] === parts.pct), 'percent sensor not taken as hours');
// Due part (0.2 h < 0.5 h) shows under care.
assert.ok(V.todo(c, hass.states).some((t) => t.label === 'Sensoren reinigen'), 'due part');

// ── Units ────────────────────────────────────────────────────────────────────────
const SEC = { s: 1, min: 60, h: 3600, d: 86400 };
assert.ok(/var numIn = function \(states, e, want\)/.test(geraete), 'unit helper');
for (const [read_, want] of [["mins = numIn(states, c.time, 'min')", 'time'], ["var dl = numIn(states, c.dryLeft, 'h')", 'drying'],
  ["var tt = numIn(states, c.totalTime, 'h')", 'total time'], ["var h = numIn(states, p[0], 'h')", 'parts']]) {
  assert.ok(geraete.includes(read_), 'reads ' + want + ' in its unit');
}
const numIn = new Function('U', cut(geraete, '  var SEC = { s: 1', '  /* Verschleißteile:') + 'return numIn;')({ num });
const S = (state, unit) => ({ x: { state, attributes: unit ? { unit_of_measurement: unit } : {} } });
assert.equal(numIn(S('90', 'min'), 'x', 'h'), 1.5, 'Dreame drying 90 min = 1.5 h');
assert.equal(numIn(S('1500', 's'), 'x', 'min'), 25, 'Ecovacs 1500 s = 25 min');
assert.equal(numIn(S('2', 'h'), 'x', 'min'), 120);
assert.equal(numIn(S('7', null), 'x', 'min'), 7, 'no unit: as before');
assert.equal(numIn(S('unknown', 'min'), 'x', 'min'), null);
void SEC;

// ── Ecovacs ──────────────────────────────────────────────────────────────────────
hass.entities = { 'vacuum.example_robot': { entity_id: 'vacuum.example_robot', device_id: 'robot' } };
hass.states = { 'vacuum.example_robot': vac };
const e = {
  area: reg('sensor', 'stats_area', 'm²', '20'), time: reg('sensor', 'stats_time', 's', '1800'),
  cleanMode: reg('select', 'work_mode', null, 'vacuum_and_mop'), mopInt: reg('select', 'water_amount', null, 'high'),
  emptyMode: reg('select', 'auto_empty', null, 'smart'), lock: reg('switch', 'child_lock', null, 'off'),
  total: reg('sensor', 'total_stats_cleanings', null, '55'), totalTime: reg('sensor', 'total_stats_time', 's', '360000'),
  totalArea: reg('sensor', 'total_stats_area', 'm²', '2400'),
};
c = V.resolve(vac, {}, hass.states, hass);
for (const [k, id] of Object.entries(e)) assert.equal(c[k], id, 'Ecovacs ' + k);
assert.equal(numIn(hass.states, e.time, 'min'), 30, 'Ecovacs cleaning time in minutes');

// Option words: Casora's, with an English phrase each.
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact;
for (const w of ['Saugen & wischen', 'Erst saugen, dann wischen', 'Leicht feucht', 'Feucht', 'Nass', 'Häufig', 'Selten', 'Sehr hoch', 'Mopp-Pad']) {
  assert.ok(geraete.includes(`'${w}'`), 'label in the code: ' + w);
  assert.ok(en[w], 'English phrase: ' + w);
}
console.log('ok vacuum_integrations');
