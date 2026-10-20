// A room with a thermostat but no temperature, humidity or air quality sensor has no Climate badge on the dashboard
// (casora_badge_climate_group shows only with a sensor) - the Studio preview (_miniModel) showed one anyway, so the
// phone preview differed from the real phone. Found by r44 with the radiator thermostat in the test house's garage
// (dev/casora_mock/hubs.py).
//   node dev/unit/preview_climate_thermostat_only.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const start = src.indexOf('\n  _miniModel(room, opts) {');
assert.ok(start > 0, '_miniModel found');
const end = src.indexOf('\n  }\n', start);
const body = src.slice(start, end + 4).replace('_miniModel(room, opts) {', 'function _miniModel(room, opts) {');
const stubs = 'const numText = (n, d) => Number(n).toFixed(d); const trLabel = (s) => s; '
  + 'const wattText = (w) => w + " W"; const studioIcon = (s) => s;';
globalThis.window = globalThis;
const miniModel = new Function(stubs + body + '\nreturn _miniModel;')();
const states = {
  'climate.heizkoerper': { state: 'heat', attributes: { current_temperature: 19.5, hvac_action: 'idle', friendly_name: 'Heizkörper' } },
  'sensor.temperatur': { state: '20.4', attributes: { device_class: 'temperature', friendly_name: 'Temperatur' } },
};
const ctx = { _hass: { states, config: { unit_system: { temperature: '°C' } } }, _sceneCatalog: () => [] };
const ids = (V, opts) => miniModel.call(ctx, { variables: V }, opts).map((b) => String(b.id).split(':')[0]);

assert.ok(!ids({ climate_entity_1: 'climate.heizkoerper' }).includes('climate'), 'thermostat only: no Climate badge');
assert.ok(!ids({ climate_entity_1: 'climate.heizkoerper' }, { phone: true }).includes('climate'), 'phone preview the same');
assert.ok(ids({ climate_entity_1: 'climate.heizkoerper', temp_sensor_1: 'sensor.temperatur' }).includes('climate'), 'with a sensor: badge');
assert.ok(ids({ temp_sensor_1: 'sensor.temperatur' }).includes('climate'), 'sensor alone: badge');

// The dashboard's rule this mirrors.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const display = JSON.stringify(T.casora_badge_climate_group.styles);
assert.ok(display.includes('variables.temp_sensor || variables.humidity_sensor || variables.quality_sensor'),
  'casora_badge_climate_group shows only with a sensor');
console.log('preview_climate_thermostat_only: ok');
