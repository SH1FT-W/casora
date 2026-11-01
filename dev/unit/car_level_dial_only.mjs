// Owner, 01.11.2026: in the v3 car popup range and tank/battery level stand in the dial only – the list below no
// longer repeats them (no „Tankstand“/„Ladestand“ row, the low-level warning without the number). „Tanken“ stays.
// All ids made up.   node dev/unit/car_level_dial_only.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
const block = src.slice(a, b + 6);

function load(entities, tanken) {
  const window = { _casoraUI: { stage: (type, o) => o, line: (first, rest) => [first].concat(rest || []),
    group: (rows, label) => ({ label, rows }) }, _casoraTank: tanken };
  const document = { querySelector: () => ({ hass: { entities } }) };
  new Function('window', 'document', block)(window, document);
  return window._casoraCar;
}
const reg = (ids) => Object.fromEntries(ids.map((id) => [id, { entity_id: id, device_id: 'car', translation_key: null, platform: 'x' }]));
const st = (pairs) => Object.fromEntries(pairs.map(([id, s, attrs]) => [id, { entity_id: id, state: s, attributes: attrs || {} }]));
const ids = ['sensor.qa_kombi_state_of_charge', 'sensor.qa_kombi_remaining_range_total', 'binary_sensor.qa_kombi_doors_locked'];
const S = st([['sensor.qa_kombi_state_of_charge', '12', { unit_of_measurement: '%' }], ['sensor.qa_kombi_remaining_range_total', '48', { unit_of_measurement: 'km' }],
  ['binary_sensor.qa_kombi_doors_locked', 'off']]);

const C = load(reg(ids));
const o = C.sec('stage', null, S, {});
assert.equal(o.text, 'Reichweite 48 km', 'the dial says the range');
assert.equal(o.progress, 0.12, 'and fills with the level');
assert.equal(C.sec('tank_s', null, S, {}), '', 'no level row in the list');
const z = C.sec('state_s3', null, S, {});
const low = z.rows.find((r) => /fast leer/.test(r.label));
assert.ok(low && low.value == null, 'the warning stays, without the number');
assert.equal(C.sec('state_s', null, S, {}).rows.find((r) => /fast leer/.test(r.label)).value, '12 %', 'before v3 unchanged');

// „Tanken“ keeps its row in the section.
const pop = src.slice(a, b);
assert.ok(/var itT = tank\(\) && tank\(\)\.item \? tank\(\)\.item\(p, states\) : null;\n      if \(itT\) rowsT\.push\(itT\);/.test(pop), 'Tanken row kept');
console.log('car_level_dial_only: ok');
