// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraLaundryFind, custom_components/casora/scripts/local/02-devices.js#_casoraLaundry
// Issue 162: an LG ThinQ washer (HA core lg_thinq) showed no progress. HA gives washers and dryers no "running"
// sensor (sensor.py WASHER_SENSORS: cycle_count, current_state, total, relative_to_start_wm, relative_to_stop_wm,
// remain), so run time over run time plus time left never had a value. The cycle's total time (minutes) and the
// time left (timestamp) say the same.
//   node dev/unit/lg_washer_progress_162.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const block = (start, from = src) => {
  const a = from.indexOf(start);
  const b = from.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(from.slice(a, b + 6))();
};
block('(function () {\n  if (window.casoraLaundryFind) return;', finder);
block('(function () {\n  if (window._casoraLaundry) return;');
const LF = window.casoraLaundryFind;
const L = window._casoraLaundry;

// UI stub: the stage hands back what it was given.
window._casoraUI = { stage: (kind, o) => o, hero: (o) => o, esc: (t) => String(t) };

const hass = { entities: {}, devices: { lg: { id: 'lg', name: 'x', model: 'F4', area_id: null, config_entries: ['e'] } }, states: {}, areas: {} };
const ent = (eid, key, state, attributes = {}) => {
  hass.entities[eid] = { entity_id: eid, device_id: 'lg', platform: 'lg_thinq', translation_key: key, entity_category: null };
  hass.states[eid] = { entity_id: eid, state, attributes, last_changed: new Date().toISOString() };
};
const inMin = (m) => new Date(Date.now() + m * 60000).toISOString();
// The washer as HA core creates it (names misleading on purpose: only the keys count).
ent('binary_sensor.a0', 'remote_control_enabled', 'on');
ent('sensor.a1', 'cycle_count', '21');
ent('sensor.a2', 'current_state', 'spinning', { device_class: 'enum' });
ent('sensor.a3', 'relative_to_stop_wm', 'unknown', { device_class: 'timestamp' });
ent('sensor.a4', 'remain', inMin(9), { device_class: 'timestamp' });
ent('sensor.a5', 'total', '45', { device_class: 'duration', unit_of_measurement: 'min' });

const found = LF.forEntity(hass, 'sensor.a2');
assert.deepEqual([found.source, found.role, found.f.remaining, found.f.total, found.f.elapsed],
  ['lg_thinq', 'washer', 'sensor.a4', 'sensor.a5', null]);

const S = hass.states;
const c = L.resolve(S['sensor.a2'], {}, S, hass);
let st = L.inner('stage', c, S);
// 9 of 45 minutes left: 80 percent done.
assert.ok(st.progress != null && Math.abs(st.progress - 0.8) < 0.01, 'progress from total and time left: ' + st.progress);
assert.ok(/80 %/.test(st.word || ''), 'percent in the word: ' + st.word);
assert.equal(st.unit, 'Min. übrig');

// More left than the total (the machine added time, the total is stale): no made-up percent.
st = L.inner('stage', c, { ...S, 'sensor.a4': { state: inMin(60), attributes: { device_class: 'timestamp' } } });
assert.equal(st.progress, null);
// Time left already over, or no total: nothing to compute.
st = L.inner('stage', c, { ...S, 'sensor.a4': { state: inMin(-5), attributes: { device_class: 'timestamp' } } });
assert.equal(st.progress, null);
st = L.inner('stage', c, { ...S, 'sensor.a5': { state: 'unknown', attributes: { device_class: 'duration', unit_of_measurement: 'min' } } });
assert.equal(st.progress, null);
// At rest: no progress.
st = L.inner('stage', c, { ...S, 'sensor.a2': { state: 'power_off', attributes: {} } });
assert.equal(st.progress, null);

console.log('ok lg_washer_progress_162');
