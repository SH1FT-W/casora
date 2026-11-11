// #174: a key set, the test query fine, and still no „Ladesäulen“ row in the car popup. Two causes:
//   1. the row came only for a pure electric car (a level of charge and no fuel level): a plug-in hybrid, or a car
//      whose charge sensor sleeps (unavailable), had none;
//   2. whether a key is set was asked once per page load: entered while the dashboard stayed open (wall tablet, the
//      app), it counted only after a reload.
// All ids made up.   node dev/unit/charging_row_when.mjs
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraCar, custom_components/casora/scripts/local/45-charging.js#check
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/03-popups.js');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const block = src.slice(a, src.indexOf('\n})();', a) + 6);

const ROW = { icon: 'mdi:ev-station', label: 'Ladesäulen' };
function car(ids) {
  const entities = Object.fromEntries(ids.map((id) => [id, { entity_id: id, device_id: 'car', translation_key: null, platform: 'x' }]));
  const window = { _casoraUI: { stage: (t, o) => o, line: (f, r) => [f].concat(r || []), group: (rows, label) => ({ label, rows }) },
    _casoraCharge: { item: () => ROW } };
  new Function('window', 'document', block)(window, { querySelector: () => ({ hass: { entities } }) });
  return window._casoraCar;
}
const st = (pairs) => Object.fromEntries(pairs.map(([id, s, u]) => [id, { entity_id: id, state: s, attributes: u ? { unit_of_measurement: u } : {} }]));
const rows = (C, S) => { const g = C.sec('tank_s', null, S, {}); return g && g.rows ? g.rows.map((r) => r.label) : []; };

const EV = ['sensor.qa_stromer_state_of_charge', 'sensor.qa_stromer_remaining_range_total'];
assert.deepEqual(rows(car(EV), st([[EV[0], '64', '%'], [EV[1], '310', 'km']])), ['Ladesäulen'], 'electric car: the row');

const PHEV = ['sensor.qa_hybrid_state_of_charge', 'sensor.qa_hybrid_fuel_level', 'sensor.qa_hybrid_remaining_range_total'];
assert.deepEqual(rows(car(PHEV), st([[PHEV[0], '40', '%'], [PHEV[1], '70', '%'], [PHEV[2], '520', 'km']])), ['Ladesäulen'],
  'plug-in hybrid: the row too');
assert.deepEqual(rows(car(EV), st([[EV[0], 'unavailable', '%'], [EV[1], 'unavailable', 'km']])), ['Ladesäulen'],
  'charge sensor asleep: the row stays');

const ICE = ['sensor.qa_benziner_fuel_level', 'sensor.qa_benziner_remaining_range_total'];
assert.deepEqual(rows(car(ICE), st([[ICE[0], '55', '%'], [ICE[1], '600', 'km']])), [], 'no battery: no charger row');
// The old way with a name prefix (variables.car): C.id builds sensor.<prefix>_akku even when there is none, so a
// diesel got the row (gate e2e t12: prefix and finder disagreed). Only a sensor that exists counts.
const PRE = st([['sensor.qa_diesel_tankfullstand', '55', '%']]);
assert.equal(car([]).read('qa_diesel', PRE).plug, false, 'prefix, no charge sensor: no battery');
assert.equal(car([]).read('qa_diesel', { ...PRE, ...st([['sensor.qa_diesel_akku', 'unavailable', '%']]) }).plug, true,
  'prefix, charge sensor asleep: a battery');

// 2. The key: asked again (at most once a minute) while none is set.
const charging = read('custom_components/casora/scripts/local/45-charging.js');
let answer = false, calls = 0, now = 1e6;
const hass = { callWS: () => { calls++; return { then: (ok) => ok({ ready: answer }) }; } };
const w = { navigator: {}, casoraEsc: null };
const D = { querySelector: () => ({ hass }) };
new Function('window', 'document', 'Date', charging)(w, D, { now: () => now });
const X = w._casoraCharge;
assert.equal(X.item('car', {}), null, 'no key: no row');
assert.equal(calls, 1);
X.item('car', {});
assert.equal(calls, 1, 'not asked again within the minute');
answer = true;
now += 61000;
X.item('car', {});   // asks; the answer arrives with the next draw
assert.equal(calls, 2, 'asked again after a minute');
assert.equal(X.item('car', {}).label, 'Ladesäulen', 'the key entered meanwhile counts without a reload');
assert.equal(calls, 2, 'with a key no more asking');
console.log('charging_row_when: ok');
