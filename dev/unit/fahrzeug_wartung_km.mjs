// Issue #15: Bei vag_connect heißt der km-Sensor „…_nachste_inspektion“ (service_km, 26800 km).
// Die Datums-Rolle griff ihn über die Endung, toDate() machte daraus das Jahr 26800
// („Nächste Inspektion 01.01.26800“). Erwartet: Datums-Rollen nehmen nur Datum/Resttage
// (…_inspektionsdatum, …_olwechseldatum), der km-Wert landet in inspektionsdistanz,
// toDate() verwirft Strecken.   node dev/unit/fahrzeug_wartung_km.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
const block = src.slice(a, b + 6);

const P = 'garage_auto';
// [id, translation_key, state, attributes]
const rows = [
  ['sensor.' + P + '_reichweite', 'range_km', '620', { unit_of_measurement: 'km', device_class: 'distance' }],
  ['sensor.' + P + '_tankstand', 'fuel_level', '55', { unit_of_measurement: '%' }],
  ['sensor.' + P + '_kilometerstand', 'mileage', '41000', { unit_of_measurement: 'km', device_class: 'distance' }],
  ['sensor.' + P + '_nachste_inspektion', 'service_km', '26800', { unit_of_measurement: 'km', device_class: 'distance' }],
  ['sensor.' + P + '_inspektionsdatum', 'service_due_at', '2028-09-02', { device_class: 'date' }],
  ['sensor.' + P + '_inspektion_in', 'service_due_in_days', '693', { unit_of_measurement: 'd' }],
  ['sensor.' + P + '_nachster_olwechsel', 'oil_service_km', '26800', { unit_of_measurement: 'km', device_class: 'distance' }],
  ['sensor.' + P + '_olwechseldatum', 'oil_service_at', '2028-09-02', { device_class: 'date' }],
  ['sensor.' + P + '_olwechsel_in', 'oil_service_due_in_days', '693', { unit_of_measurement: 'd' }],
];

function setup(withKeys) {
  const entities = {}, states = {};
  rows.forEach(([id, tk, s, attrs]) => {
    entities[id] = { entity_id: id, device_id: 'car', translation_key: withKeys ? tk : null, platform: 'vag_connect' };
    states[id] = { entity_id: id, state: s, attributes: attrs };
  });
  const window = {};
  const document = { querySelector: () => ({ hass: { entities, states } }) };
  new Function('window', 'document', block)(window, document);
  return { C: window._casoraCar, states };
}

for (const withKeys of [true, false]) {
  const { C, states } = setup(withKeys);
  const M = C.map('sensor.' + P + '_tankstand');
  const tag = withKeys ? 'mit translation_key' : 'nur Endungen';
  assert.notEqual(M.nachste_inspektion, 'sensor.' + P + '_nachste_inspektion', tag + ': km-Sensor ist kein Inspektionsdatum');
  assert.notEqual(M.nachster_olwechsel, 'sensor.' + P + '_nachster_olwechsel', tag + ': km-Sensor ist kein Ölwechseldatum');
  assert.ok(['sensor.' + P + '_inspektionsdatum', 'sensor.' + P + '_inspektion_in'].includes(M.nachste_inspektion), tag + ': ' + M.nachste_inspektion);
  assert.ok(['sensor.' + P + '_olwechseldatum', 'sensor.' + P + '_olwechsel_in'].includes(M.nachster_olwechsel), tag + ': ' + M.nachster_olwechsel);
  const r = C.read('sensor.' + P + '_tankstand', states);
  const d = C.toDate(r.insp);
  assert.ok(d && d.getFullYear() >= 2026 && d.getFullYear() < 2100, tag + ': Inspektion als echtes Datum, nicht ' + d);
  const o = C.toDate(r.oilDate);
  assert.ok(o && o.getFullYear() < 2100, tag + ': Ölwechsel als echtes Datum');
  if (withKeys) assert.equal(r.inspKm, 26800, 'service_km landet in inspektionsdistanz');
}
// toDate() verwirft Strecken direkt.
{
  const { C, states } = setup(true);
  assert.equal(C.toDate(states['sensor.' + P + '_nachste_inspektion']), null);
  assert.equal(C.toDate({ state: '26800', attributes: { unit_of_measurement: 'mi' } }), null);
  assert.ok(C.toDate({ state: '2028-09-02', attributes: { device_class: 'date' } }));
}
console.log('fahrzeug_wartung_km: ok');
