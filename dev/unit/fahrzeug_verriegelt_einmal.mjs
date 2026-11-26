// Prüfrunde d03-02: the v3 car popup said „Verriegelt“ three times – head line, „Schloss Verriegelt“ in the wheel and
// „Alles zu und verriegelt“ in the list. §3/§16: the state is said once, in the head's status line. Expected: the head
// line carries the lock (with or without a vehicle picture), the wheel has no lock fact, the list says „Alles zu“.
// A warning (unlocked, a door open) still shows in the head and in the list. All ids made up.
//   node dev/unit/fahrzeug_verriegelt_einmal.mjs
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraCar
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
const block = src.slice(a, b + 6);
const ids = ['sensor.qa_auto_fuel_level', 'sensor.qa_auto_remaining_range_total', 'binary_sensor.qa_auto_doors_locked'];
const entities = Object.fromEntries(ids.map((id) => [id, { entity_id: id, device_id: 'car', translation_key: null, platform: 'x' }]));
const window = { _casoraUI: { stage: (type, o) => o, line: (first, rest) => [first].concat(rest || []), group: (rows, label) => ({ label, rows }) } };
new Function('window', 'document', block)(window, { querySelector: () => ({ hass: { entities } }) });
const C = window._casoraCar;
// binary_sensor lock: off = locked.
const S = (locked) => Object.fromEntries([['sensor.qa_auto_fuel_level', '19', { unit_of_measurement: '%' }],
  ['sensor.qa_auto_remaining_range_total', '140', { unit_of_measurement: 'km' }],
  ['binary_sensor.qa_auto_doors_locked', locked]].map(([id, s, at]) => [id, { entity_id: id, state: s, attributes: at || {} }]));

const st = C.sec('stage', null, S('off'), { img: 'none' });
assert.ok(!st.facts.some((f) => f.label === 'Schloss'), 'wheel: no lock fact — ' + JSON.stringify(st.facts));
const line = C.sec('line', null, S('off'), { img: 'none' });
assert.ok(Array.isArray(line) && line[0] === 'Verriegelt', 'head line carries the lock — ' + JSON.stringify(line));
assert.ok(!line.some((x) => /19|Tank/.test(String(x))), 'without a picture the head does not repeat the wheel\'s fill level');
const z = C.sec('state_s3', null, S('off'), {});
assert.equal(z.rows[0].label, 'Alles zu', 'list: „Alles zu“, the lock stands above');
// Unlocked: head says so, the list keeps its warning row.
const l2 = C.sec('line', null, S('on'), { img: 'none' });
assert.equal(l2[0], 'Nicht verriegelt');
assert.ok(C.sec('state_s3', null, S('on'), {}).rows.some((r) => r.label === 'Nicht verriegelt'), 'warning row stays');
// The v3 layout always asks for the head line.
assert.ok(/fields: fc, top: v3C \? \['line'\] : undefined/.test(src), 'line in the head with and without a picture');
console.log('fahrzeug_verriegelt_einmal: ok');
