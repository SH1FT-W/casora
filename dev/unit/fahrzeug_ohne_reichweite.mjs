// Car popup without a range sensor.  node dev/unit/fahrzeug_ohne_reichweite.mjs
// Found in the gate for 26.11.2 (r99): an electric car with battery level, lock and doors but no range showed
// „Keine Daten“ in the middle of the wheel while the ring and the head line showed „Akku 64 %“.
// Expected: like the tile, the fill level is the wheel's sentence; it is then neither a fact nor repeated in the
// head's status line. With a range everything stays as before. All ids made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'car block not found');
const block = src.slice(a, b + 6);

function load(entities) {
  const window = { _casoraUI: { stage: (type, o) => o, line: (first, rest) => [first].concat(rest || []) } };
  const document = { querySelector: () => ({ hass: { entities } }) };
  new Function('window', 'document', block)(window, document);
  return window._casoraCar;
}
const reg = (ids) => Object.fromEntries(ids.map((id) => [id, { entity_id: id, device_id: 'car', translation_key: null, platform: 'x' }]));
const st = (pairs) => Object.fromEntries(pairs.map(([id, s, attrs]) => [id, { entity_id: id, state: s, attributes: attrs || {} }]));

// EV without range: battery, lock, doors, windows.
{
  const ids = ['sensor.qa_limo_state_of_charge', 'binary_sensor.qa_limo_doors_locked', 'binary_sensor.qa_limo_doors', 'binary_sensor.qa_limo_windows'];
  const C = load(reg(ids));
  const S = st([['sensor.qa_limo_state_of_charge', '64', { unit_of_measurement: '%' }], ['binary_sensor.qa_limo_doors_locked', 'off'],
    ['binary_sensor.qa_limo_doors', 'off'], ['binary_sensor.qa_limo_windows', 'off']]);
  const o = C.sec('stage', null, S, {});
  assert.equal(o.text, 'Akku 64 %', 'the fill level instead of „Keine Daten“');
  assert.equal(o.progress, 0.64);
  assert.ok(!o.facts.some((f) => f.label === 'Akku'), 'not again as a fact');
  assert.deepEqual(C.sec('line', null, S, {}), ['Verriegelt'], 'head line without the fill level');
}
// With a range: unchanged (range as the sentence, fill level as fact and in the line).
{
  const ids = ['sensor.qa_limo_state_of_charge', 'sensor.qa_limo_remaining_range_total', 'binary_sensor.qa_limo_doors_locked'];
  const C = load(reg(ids));
  const S = st([['sensor.qa_limo_state_of_charge', '64', { unit_of_measurement: '%' }], ['sensor.qa_limo_remaining_range_total', '312', { unit_of_measurement: 'km' }],
    ['binary_sensor.qa_limo_doors_locked', 'off']]);
  const o = C.sec('stage', null, S, {});
  assert.equal(o.text, 'Reichweite 312 km');
  assert.ok(o.facts.some((f) => f.label === 'Akku' && f.value === '64 %'));
  assert.deepEqual(C.sec('line', null, S, {}), ['Verriegelt', 'Akku 64 %']);
}
// Nothing at all: still „Keine Daten“.
{
  const C = load(reg(['sensor.qa_limo_mileage', 'sensor.qa_limo_state_of_charge']));
  const o = C.sec('stage', null, st([['sensor.qa_limo_mileage', 'unknown'], ['sensor.qa_limo_state_of_charge', 'unavailable']]), {});
  assert.equal(o.text, 'Keine Daten');
}
console.log('fahrzeug_ohne_reichweite: ok');
