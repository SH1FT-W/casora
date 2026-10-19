// Issue #28: the weather popup took the dew point of the outdoor station as temperature (same device class,
// sorted first). Derived values (dew point, feels like, heat index, wind chill, min/max) only count when nothing
// else is there.  node dev/unit/aussen_temperatur.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finden.js', import.meta.url), 'utf8'))();
const D = window.casoraDevice;

const hass = (list) => {
  const h = { states: {}, entities: {}, devices: {}, areas: { g: { area_id: 'g', name: 'Garten' } } };
  list.forEach(([id, v, extra]) => {
    h.states[id] = { entity_id: id, state: v, attributes: { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: id } };
    h.entities[id] = Object.assign({ entity_id: id }, extra || {});
  });
  return h;
};
// By name: the dew point sorts before the temperature.
assert.equal(D.outdoor(hass([['sensor.outdoor_dew_point', '6.9'], ['sensor.outdoor_temperature', '20']]), 'temperature'), 'sensor.outdoor_temperature');
// Feels like, heat index, wind chill, daily min/max.
assert.equal(D.outdoor(hass([['sensor.outdoor_apparent_temperature', '18'], ['sensor.outdoor_feels_like', '18'],
  ['sensor.outdoor_heat_index', '21'], ['sensor.outdoor_wind_chill', '19'], ['sensor.outdoor_max_temperature', '24'],
  ['sensor.outdoor_temperature', '20']]), 'temperature'), 'sensor.outdoor_temperature');
// Spanish names in an outdoor area: punto de rocío vs. temperatura.
assert.equal(D.outdoor(hass([['sensor.estacion_punto_de_rocio', '6.9', { area_id: 'g' }], ['sensor.estacion_temperatura', '20', { area_id: 'g' }]]), 'temperature'), 'sensor.estacion_temperatura');
// Only by translation key (names neutral).
assert.equal(D.outdoor(hass([['sensor.outdoor_a', '6.9', { translation_key: 'dew_point' }], ['sensor.outdoor_b', '20']]), 'temperature'), 'sensor.outdoor_b');
// "exterior" counts as outdoor.
assert.equal(D.outdoor(hass([['sensor.temperatura_exterior', '20']]), 'temperature'), 'sensor.temperatura_exterior');
// Only a derived sensor: better than nothing.
assert.equal(D.outdoor(hass([['sensor.outdoor_dew_point', '6.9']]), 'temperature'), 'sensor.outdoor_dew_point');
console.log('aussen_temperatur: ok');
