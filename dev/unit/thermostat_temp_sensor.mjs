// Thermostat tile with a "Temperature sensor" (issue #32): the room temperature stands in front of the state,
// "21,3° · Heizt auf 24,5°", as the aquarium tile shows it. Reported: the sensor set in the Studio did not
// appear on the tile (only in the popup). Without a sensor, or with an unusable one, the line stays as it was.
//   node dev/unit/thermostat_temp_sensor.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/06-kalender.js');
const window = { casoraNum: (n, a, b) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: a, maximumFractionDigits: b }) };
new Function('window', src.slice(src.indexOf('// ── Thermostat aktiv?'), src.indexOf('// ── Glocke')))(window);
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = T.casora_thermostat.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = (entity, variables = {}, states = {}) =>
  new Function('states', 'entity', 'user', 'hass', 'variables', 'html', 'window', body)(states, entity, {}, {}, variables, undefined, window);

const trv = { entity_id: 'climate.example_trv', state: 'heat',
  attributes: { hvac_action: 'heating', current_temperature: 18.2, temperature: 24.5 } };
const S = { 'sensor.example_room': { state: '21.34', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } } };
const V = { temp_sensor: 'sensor.example_room' };

assert.equal(tile(trv, V, S), '21,3° · Heizt auf 24,5°', 'sensor in front');
assert.equal(tile(trv, {}, S), 'Heizt auf 24,5°', 'no sensor: as before');
assert.equal(tile({ ...trv, state: 'off' }, V, S), '21,3° · Aus');
assert.equal(tile({ ...trv, attributes: { ...trv.attributes, hvac_action: 'idle', current_temperature: 24.5 } }, V, S),
  '21,3° · Ziel 24,5°', 'at the target');
assert.equal(tile({ ...trv, state: 'unavailable' }, V, S), 'Nicht verfügbar', 'unavailable stays short');
assert.equal(tile(trv, V, { 'sensor.example_room': { state: 'unavailable', attributes: { device_class: 'temperature' } } }),
  'Heizt auf 24,5°', 'sensor unavailable: no number');
assert.equal(tile(trv, V, { 'sensor.example_room': { state: '55', attributes: { unit_of_measurement: '%' } } }),
  'Heizt auf 24,5°', 'not a temperature: ignored');
assert.equal(tile(trv, V, { 'sensor.example_room': { state: '21', attributes: { unit_of_measurement: '°F' } } }),
  '21° · Heizt auf 24,5°', 'a ° unit counts without device class');
assert.equal(tile(trv, { temp_sensor: 'sensor.gone' }, S), 'Heizt auf 24,5°', 'missing sensor');

// Studio preview: same order, English words, German through the panel patterns.
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(/case "thermostat": \{[\s\S]{0,600}V\.temp_sensor[\s\S]{0,600}return room \+ \(mode === "cool" \? "Cooling to " : "Heating to "\)/.test(panel),
  'preview shows the sensor too');
const pats = JSON.parse(read('custom_components/casora/translations/panel/de.json')).patterns.map(([re, rep]) => [new RegExp(re), rep]);
const de = (s) => { for (const [re, rep] of pats) { const m = s.match(re); if (m) return rep.replace(/\{(\d+)\}/g, (_, i) => m[+i]); } return s; };
assert.equal(de('21.3° · Heating to 24.5°'), '21.3° · Heizt auf 24.5°');
assert.equal(de('21.3° · Off'), '21.3° · Aus');
assert.equal(de('Heating to 24.5°'), 'Heizt auf 24.5°', 'without a sensor as before');

console.log('ok thermostat_temp_sensor');
