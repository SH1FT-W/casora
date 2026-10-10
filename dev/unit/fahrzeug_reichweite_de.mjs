// Issue #16: Die Reichweiten-Rolle traf über die Endung „reichweite“ auch „…_adblue_reichweite“
// und „…_elektrische_reichweite“ (deutsche IDs); welche gewann, hing an der Reihenfolge in
// hass.entities. Erwartet: beim Verbrenner immer die echte Reichweite, unabhängig von der
// Reihenfolge; beim E-Auto bleibt die elektrische Reichweite.   node dev/unit/fahrzeug_reichweite_de.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
const block = src.slice(a, b + 6);

function load(list) {
  const entities = Object.fromEntries(list.map(([id, tk]) => [id, { entity_id: id, device_id: 'car', translation_key: tk || null }]));
  const window = {};
  const document = { querySelector: () => ({ hass: { entities, states: {} } }) };
  new Function('window', 'document', block)(window, document);
  return window._casoraCar;
}
const P = 'garage_auto';
const diesel = [
  ['sensor.' + P + '_adblue_reichweite', 'adblue_range_km'],
  ['sensor.' + P + '_elektrische_reichweite', 'electric_range_km'],
  ['sensor.' + P + '_reichweite', 'range_km'],
  ['sensor.' + P + '_tankstand', 'fuel_level'],
  ['sensor.' + P + '_kilometerstand', 'mileage'],
];
for (const keys of [true, false]) {
  for (const order of [diesel, diesel.slice().reverse()]) {
    const list = order.map(([id, tk]) => [id, keys ? tk : null]);
    const M = load(list).map(null);
    assert.equal(M.reichweite_kombiniert, 'sensor.' + P + '_reichweite', (keys ? 'mit' : 'ohne') + ' translation_key: ' + M.reichweite_kombiniert);
    assert.equal(M.scr_reichweite, 'sensor.' + P + '_adblue_reichweite');
  }
}
// E-Auto: nur elektrische Reichweite und Akku – sie bleibt die Reichweite.
{
  const M = load([['sensor.' + P + '_elektrische_reichweite'], ['sensor.' + P + '_akkustand'], ['sensor.' + P + '_kilometerstand']]).map(null);
  assert.equal(M.reichweite_kombiniert, 'sensor.' + P + '_elektrische_reichweite');
}
// Englische IDs wie bisher.
{
  const M = load([['sensor.x_adblue_range'], ['sensor.x_electric_range'], ['sensor.x_range_combined'], ['sensor.x_fuel_level']]).map(null);
  assert.equal(M.reichweite_kombiniert, 'sensor.x_range_combined');
}
console.log('fahrzeug_reichweite_de: ok');
