// User test, 07.11.2026: a thermostat without a sensor on its tile, in a room whose header lists a temperature sensor.
// Tile and dial read the room's sensor („Jetzt 21,4 °C“, casoraRoomTempOf, review 2 E09), the Verlauf under the dial
// drew the thermostat's own current_temperature („21,0 °C Jetzt“); on a dashboard without that room header the dial
// read 21,0 too. Now the Verlauf (and the tile's sparkline) draws the reading the dial shows (casoraThermoHistoryOf):
// the tile's sensor, else the room's one sensor, else current_temperature.
//   node dev/unit/thermostat_chart_room_sensor.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window.casoraRoomTempOf = function');
const basisPart = basis.slice(b0, basis.indexOf('window.casoraPopupTitle = function', b0));
const pop = rd('custom_components/casora/scripts/local/03-popups.js');
const a = pop.indexOf('  window._casoraThermoChart = function');
const chartHelper = pop.slice(a, pop.indexOf('  F.v3 = function', a));
const c0 = pop.indexOf('  F.curTemp = function');
const curTemp = pop.slice(c0, pop.indexOf('  F.heating = function', c0));

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const ok = (s) => s && s.state !== 'unavailable' && s.state !== 'unknown';
const mkWindow = (cfg) => {
  const made = [];
  const window = {
    _casoraLovelaceCfg: () => cfg,
    _casoraHH: { on: () => true, chart: (title) => '<div class="hp-ct">' + title + '</div><div class="hp-chart-slot"></div>' },
    _hpChartCfg: (eid, label, span, color, height) => { const c = { span, height, series: [{ entity: eid, name: label, color }] }; made.push(c); return c; },
    _hpChartTitle: () => 'Temperatur · 24 Std.', _hpChartInit: () => {},
  };
  new Function('window', basisPart)(window);
  new Function('window', 'num', 'TU', 'plate', chartHelper)(window, num, () => '°C', '');
  const F = {};
  new Function('window', 'F', 'num', 'ok', curTemp)(window, F, num, ok);
  return { window, made, F };
};

const trv = { entity_id: 'climate.example_bath', state: 'off', attributes: { current_temperature: 21.0, temperature: 20, hvac_modes: ['off', 'heat', 'auto'] } };
const S = {
  [trv.entity_id]: trv,
  'sensor.example_bath_temp': { state: '21.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.example_bath_temp_2': { state: '22.0', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.example_tile_temp': { state: '19.8', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
};
const dash = (sensors) => ({ views: [
  { cards: [{ template: 'casora_room', variables: { climate_entity_1: 'climate.other' } }] },
  { cards: [{ template: 'casora_room', variables: Object.assign({ climate_entity_1: trv.entity_id }, ...sensors.map((s, i) => ({ ['temp_sensor_' + (i + 1)]: s }))) }] },
] });

// The reported case: the room's one sensor – dial and Verlauf read the same.
{
  const { window, made, F } = mkWindow(dash(['sensor.example_bath_temp']));
  assert.equal(F.curTemp({ id: trv.entity_id, temp: null }, S), 21.4, 'dial: the room sensor');
  window._casoraThermoChart(trv.entity_id, false, S);
  assert.equal(made[0].series[0].entity, 'sensor.example_bath_temp', 'Verlauf: the room sensor, not current_temperature');
  assert.equal(made[0].series[0].attribute, undefined);
  assert.deepEqual(window.casoraThermoHistoryOf(trv.entity_id, null, S), { entity: 'sensor.example_bath_temp', attribute: null });
}
// The tile's own sensor wins in both.
{
  const { window, made, F } = mkWindow(dash(['sensor.example_bath_temp']));
  assert.equal(F.curTemp({ id: trv.entity_id, temp: 'sensor.example_tile_temp' }, S), 19.8);
  window._casoraThermoChart(trv.entity_id, 'sensor.example_tile_temp', S);
  assert.equal(made[0].series[0].entity, 'sensor.example_tile_temp');
}
// No room reading (a dashboard without that room, the phone gallery): both the thermostat's own.
{
  const { window, made, F } = mkWindow({ views: [{ cards: [] }] });
  assert.equal(F.curTemp({ id: trv.entity_id, temp: null }, S), 21.0);
  window._casoraThermoChart(trv.entity_id, false, S);
  assert.deepEqual([made[0].series[0].entity, made[0].series[0].attribute], [trv.entity_id, 'current_temperature']);
}
// Several room sensors: the dial shows their mean, no single history draws it – the thermostat's own.
{
  const { window, made } = mkWindow(dash(['sensor.example_bath_temp', 'sensor.example_bath_temp_2']));
  assert.equal(window.casoraRoomTempOf(trv.entity_id, S), 21.7);
  window._casoraThermoChart(trv.entity_id, false, S);
  assert.equal(made[0].series[0].entity, trv.entity_id);
}
// The tile's sparkline follows the same rule.
{
  const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
  const card = T.casora_thermostat.custom_fields.spark.card;
  const js = (s) => String(s).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
  const { window } = mkWindow(dash(['sensor.example_bath_temp']));
  const run = (expr, variables) => new Function('window', 'variables', 'entity', 'states', js(expr))(window, variables, trv, S);
  assert.equal(run(card.entity, { sparkline: true }), 'sensor.example_bath_temp', 'sparkline: the room sensor');
  assert.equal(run(card.attribute, { sparkline: true }), '');
  assert.equal(run(card.entity, { sparkline: true, temp_sensor: 'sensor.example_tile_temp' }), 'sensor.example_tile_temp');
  assert.equal(run(card.entity, { sparkline: false }), '');
}
console.log('thermostat_chart_room_sensor: ok');
