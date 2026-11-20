// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecDetCfg,casoraSecDetectors,casoraSecDetHouse,casoraSecCount,casoraSecurityLevel custom_components/casora/scripts/local/49-security-detectors.js custom_components/casora/panel/casora-panel-personal.js
// Issue #220: since #209 a weather station's rain sensor (binary_sensor, device_class moisture) counted as a water
// detector and showed as a security problem. Expected: weather/rain sensors are no leak detectors (real leak sensors
// still count), smoke and water have a switch each (the old common switch security.detectors still decides for both
// while the new keys are unset), and single detectors can be left out (security.detectors_exclude).
//   node dev/unit/sicherheit_melder_wetter.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
new Function(read('custom_components/casora/scripts/local/49-security-detectors.js'))();
const D = window._casoraSecDet;

const st = (state, dc, name) => ({ state, attributes: { device_class: dc, friendly_name: name || 'x' } });
const S0 = {
  'binary_sensor.rauch_kueche': st('off', 'smoke', 'Rauchmelder Küche'),
  'binary_sensor.leck_bad': st('off', 'moisture', 'Wassermelder Bad'),
  // Weather station: the rain sensor reports „wet“ while it rains.
  'binary_sensor.ws_regen': st('on', 'moisture', 'Wetterstation Regen'),
  'sensor.ws_wind': st('3', 'wind_speed', 'Wetterstation Wind'),
  // Other kinds of weather sensors, each with one hint only.
  'binary_sensor.gauge_state': st('on', 'moisture', 'Gauge'),
  'binary_sensor.eco_1': st('on', 'moisture', 'Sensor 1'),
  'binary_sensor.tk_rain': st('on', 'moisture', 'Station'),
  'binary_sensor.wx_wet': st('on', 'moisture', 'Wet'),
  'sensor.wx_wet_wind': st('2', 'wind_speed', 'Wind'),
  'binary_sensor.garden_wet': st('on', 'moisture', 'Wet'),
  'sensor.garden_temp': st('8', 'temperature', 'Temp'),
  // Real leak sensors that must keep counting: outdoors without air readings, and an Ecowitt leak sensor.
  'binary_sensor.pool_leak': st('off', 'moisture', 'Pool'),
  'binary_sensor.eco_leak': st('off', 'moisture', 'Leak 2'),
  'person.a': { state: 'home', attributes: {} },
};
const entities = {
  'binary_sensor.rauch_kueche': { area_id: 'kueche' },
  'binary_sensor.leck_bad': { device_id: 'aqara', area_id: 'bad' },
  'binary_sensor.ws_regen': { device_id: 'ws' }, 'sensor.ws_wind': { device_id: 'ws' },
  'binary_sensor.gauge_state': { device_id: 'gauge' },
  'binary_sensor.eco_1': { device_id: 'eco', platform: 'ecowitt' },
  'binary_sensor.tk_rain': { device_id: 'tk', translation_key: 'rain' },
  'binary_sensor.wx_wet': { device_id: 'wx' }, 'sensor.wx_wet_wind': { device_id: 'wx' },
  'binary_sensor.garden_wet': { device_id: 'gd' }, 'sensor.garden_temp': { device_id: 'gd' },
  'binary_sensor.pool_leak': { device_id: 'pool' },
  'binary_sensor.eco_leak': { device_id: 'eco2', platform: 'ecowitt' },
};
const devices = {
  aqara: { name: 'Water leak sensor', manufacturer: 'Aqara', model: 'SJCGQ11LM' },
  ws: { name: 'Gartenstation', manufacturer: 'Generic', model: 'X1' },
  gauge: { name: 'Gauge', manufacturer: 'Netatmo', model: 'Smart Rain Gauge' },
  eco: { name: 'GW2000', manufacturer: 'Generic', model: 'GW2000' },
  tk: { name: 'Hub', manufacturer: 'Generic', model: 'H1' },
  wx: { name: 'Hub 2', manufacturer: 'Generic', model: 'H2' },
  gd: { name: 'Hub 3', manufacturer: 'Generic', model: 'H3', area_id: 'garten' },
  pool: { name: 'Hub 4', manufacturer: 'Generic', model: 'H4', area_id: 'garten' },
  eco2: { name: 'WH55', manufacturer: 'Ecowitt', model: 'WH55' },
};
const hassOf = (S) => ({ states: S, entities, devices,
  areas: { kueche: { name: 'Küche' }, bad: { name: 'Bad' }, garten: { name: 'Garten' } } });
const set = (sec) => { window.CASORA_SETTINGS = sec === undefined ? {} : { security: sec }; };
const count = (S, v) => window.casoraSecCount(S, hassOf(S), v, null, null);
const home = { place: 'home' };

// ── Weather sensors are no leak detectors; real leak sensors in the same house still count ──
set(undefined);
let d = window.casoraSecDetectors(hassOf(S0), home, null, null);
assert.deepEqual(d.safety.sort(), ['binary_sensor.eco_leak', 'binary_sensor.leck_bad', 'binary_sensor.pool_leak', 'binary_sensor.rauch_kueche'],
  'rain sensors (entity words, device words, weather integration, translation_key, wind on the device, outdoor + air) left out');
assert.ok(!window.casoraSecDetHouse(hassOf(S0)).ids.includes('binary_sensor.ws_regen'), 'not offered as a found detector either');
let r = count(S0, home);
assert.equal(r.danger, 0, 'rain is no water alarm'); assert.equal(r.level, 'ok'); assert.equal(r.detectors, 4);
// The leak sensor next to it still alarms.
let S = { ...S0, 'binary_sensor.leck_bad': st('on', 'moisture', 'Wassermelder Bad') };
r = count(S, home);
assert.equal(r.danger, 1); assert.equal(r.level, 'alarm');
assert.equal(window.casoraSecuritySummary(r, { summary: 'short' }).text, 'Wasser · Bad');

// ── Old saved key: security.detectors: false keeps both off; the new keys win once set ──
set({ detectors: false });
let c = window.casoraSecDetCfg();
assert.equal(c.smoke, false); assert.equal(c.water, false); assert.equal(c.detectors, false);
set({ detectors: false, water_detectors: true });
c = window.casoraSecDetCfg();
assert.equal(c.smoke, false); assert.equal(c.water, true);
set(undefined);
c = window.casoraSecDetCfg();
assert.deepEqual(c, { detectors: true, smoke: true, water: true, motion: false, exclude: [] }, 'defaults');

// ── Water switch off: no water row or count, smoke still counts ──
set({ water_detectors: false });
S = { ...S0, 'binary_sensor.leck_bad': st('on', 'moisture'), 'binary_sensor.rauch_kueche': st('on', 'smoke') };
r = count(S, home);
assert.equal(r.danger, 1, 'smoke only'); assert.deepEqual(r.dangerWords.map((w) => w.kind), ['smoke']);
assert.equal(D.show(S, hassOf(S), null, home, 'home', 'water'), false, 'no water sub-badge');
assert.equal(D.show(S, hassOf(S), null, home, 'home', 'smoke'), true, 'smoke sub-badge stays');
assert.equal(window.casoraSecurityLevel(hassOf(S), ['binary_sensor.leck_bad']), 'ok', 'own water entry: no alarm level');
set({ smoke_detectors: false });
r = count(S, home);
assert.deepEqual(r.dangerWords.map((w) => w.kind), ['water'], 'smoke off, water on');

// ── Excluded detector: never counts (house, room, own entry, popup) ──
set({ detectors_exclude: ['binary_sensor.leck_bad'] });
S = { ...S0, 'binary_sensor.leck_bad': st('on', 'moisture') };
r = count(S, home);
assert.equal(r.danger, 0); assert.equal(r.level, 'ok');
r = count(S, { place: 'room', room_name: 'Bad', security_entity_1: 'binary_sensor.leck_bad' });
assert.equal(r.danger, 0, 'not as the room\'s own entry either');
assert.equal(window.casoraSecurityLevel(hassOf(S), ['binary_sensor.leck_bad']), 'ok');
assert.ok(!D.list(hassOf(S), home, 'home', null, 'water').ids.includes('binary_sensor.leck_bad'), 'not in the popup');

// ── Studio: two switches, the old key read as their default, a list of detectors left out ──
const pers = read('custom_components/casora/panel/casora-panel-personal.js');
assert.ok(pers.includes('const detOn = (k) => (typeof sec[k] === "boolean" ? sec[k] : sec.detectors !== false);'), 'old key as default');
assert.ok(/\["smoke_detectors", "Smoke detectors"[\s\S]{0,200}\["water_detectors", "Water detectors"/.test(pers), 'two switches');
assert.ok(pers.includes('s.security.detectors_exclude = Array.isArray(s.security.detectors_exclude)'), 'list normalised');
assert.ok(/row\(det, i \? "" : "Not counted"/.test(pers), 'list under Detectors');
// The draft logic of the switches: run it on a copy of the saved section.
const body = pers.match(/const DET_KEYS = [\s\S]*?\n        \};\n/)[0];
const run = (sec, k, v) => { new Function('sec', 'k', 'v', body + 'detSet(k, v);')(sec, k, v); return sec; };
assert.deepEqual(run({ detectors: false }, 'water_detectors', true), { smoke_detectors: false }, 'old off: smoke stays off, water on');
assert.deepEqual(run({}, 'water_detectors', false), { water_detectors: false }, 'only off is stored');
assert.deepEqual(run({ water_detectors: false }, 'water_detectors', true), {}, 'back to default');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Smoke detectors'], 'Rauchmelder'); assert.equal(de['Water detectors'], 'Wassermelder');
assert.equal(de['Not counted'], 'Zählt nicht');
console.log('ok sicherheit_melder_wetter');
