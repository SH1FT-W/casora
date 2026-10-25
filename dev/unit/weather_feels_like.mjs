// Issue #56: felt temperature as a second curve in the weather popup's temperature chart, and the further values of
// the weather source ("Wetter & Warnungen": sensors by translation_key on the weather device; HA's standard weather
// attributes). Without such sources the chart keeps its one curve and the popup gets no extra rows.
//   node dev/unit/weather_feels_like.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();
const D = window.casoraDevice;

const W = 'weather.station';
const house = ({ attrs = {}, sensors = [], dev = 'd1' } = {}) => {
  const h = { states: {}, entities: {}, devices: { d1: { id: 'd1' }, d2: { id: 'd2' } }, areas: {} };
  h.states[W] = { entity_id: W, state: 'cloudy', attributes: Object.assign({ temperature: 11, temperature_unit: '°C', humidity: 70 }, attrs) };
  h.entities[W] = { entity_id: W, device_id: 'd1' };
  sensors.forEach(([id, v, key, unit, d]) => {
    h.states[id] = { entity_id: id, state: v, attributes: { unit_of_measurement: unit || '' } };
    h.entities[id] = { entity_id: id, device_id: d || dev, translation_key: key };
  });
  return h;
};

// 1. Nothing extra: the chart is the outdoor sensor alone, no rows.
{
  const h = house();
  assert.equal(D.weatherSources(h, W).feels, undefined, 'no felt source');
  const c = D.weatherChart(h, W, 'sensor.outdoor', {});
  assert.deepEqual(c.series.map((s) => s.entity), ['sensor.outdoor'], 'one curve');
  assert.equal(c.feels, false);
  assert.equal(D.weatherChart(h, W, null, {}), null, 'no outdoor sensor, no felt value: no chart (as before)');
  assert.deepEqual(D.weatherRows(h, W, {}), [], 'no extra rows');
}

// 2. HA standard attribute apparent_temperature: second curve from the weather entity's attribute history.
{
  const h = house({ attrs: { apparent_temperature: 8.4, dew_point: 6.1, wind_gust_speed: 40, wind_speed_unit: 'km/h', cloud_coverage: 75 } });
  const s = D.weatherSources(h, W);
  assert.deepEqual(s.feels, { entity: W, attribute: 'apparent_temperature', value: 8.4, unit: '°C' });
  // The measured curve comes from the same source (the entity's temperature attribute), not an outdoor sensor elsewhere.
  const c = D.weatherChart(h, W, 'sensor.outdoor', {});
  assert.equal(c.key, W);
  assert.deepEqual(c.series, [
    { name: 'Temperatur', color: '#FF9F0A', entity: W, attribute: 'temperature', unit: '°C' },
    { entity: W, name: 'Gefühlt', color: 'c1', attribute: 'apparent_temperature', unit: '°C' }]);
  assert.equal(c.feels, true);
  assert.deepEqual(D.weatherChart(h, W, null, {}).series, c.series, 'same without an outdoor sensor');
  // Studio "Felt temperature" off: the outdoor sensor alone, as before.
  assert.deepEqual(D.weatherChart(h, W, 'sensor.outdoor', { showFeels: false }).series.map((x) => x.entity), ['sensor.outdoor']);
  const rows = D.weatherRows(h, W, {});
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.value, r.after, r.first]), [
    ['feels', 'Gefühlt', '8 °C', null, true],
    ['dew_point', 'Taupunkt', '6 °C', 'Luftfeuchtigkeit', false],
    ['gust', 'Windböen', '40 km/h', 'Wind', false],
    ['cloud', 'Bewölkung', '75 %', null, false]]);
  assert.ok(rows.every((r) => r.entity === undefined), 'attribute rows do not open a sensor');
}

// 3. "Wetter & Warnungen": sensors on the weather device by translation_key; the felt sensor wins over the attribute
//    (statistics), the device's temperature sensor is the measured curve when there is no outdoor sensor.
{
  const h = house({
    attrs: { apparent_temperature: 9, dew_point: 6.2, wind_gust_speed: 41, wind_speed_unit: 'km/h' },
    sensors: [
      ['sensor.station_temperatur', '11.4', 'temperature', '°C'],
      ['sensor.station_gefuehlt', '8.6', 'apparent_temperature', '°C'],
      ['sensor.station_taupunkt', '6.2', 'dew_point', '°C'],
      ['sensor.station_boen', '41', 'wind_gust', 'km/h'],
      ['sensor.station_bewoelkung', '75', 'cloud_cover', '%'],
      ['sensor.station_regen', '0.4', 'precipitation', 'mm/h'],
      ['sensor.station_regen_chance', '35', 'precipitation_probability', '%'],
      ['sensor.station_regen_heute', '60', 'precipitation_probability_today', '%'],
      ['sensor.station_solar', '180', 'solar', 'W/m²'],
      ['sensor.station_quelle', 'dwd', 'source', ''],
      // Another device's felt temperature never counts.
      ['sensor.other_feels', '2', 'apparent_temperature', '°C', 'd2'],
    ],
  });
  const s = D.weatherSources(h, W);
  assert.equal(s.feels.entity, 'sensor.station_gefuehlt');
  assert.equal(s.feels.attribute, undefined);
  assert.equal(s.dew_point.attribute, 'dew_point', 'display values: the chosen entity\'s attribute first');
  const c = D.weatherChart(h, W, 'sensor.outdoor', {});
  assert.deepEqual(c.series.map((x) => [x.entity, x.attribute, x.name]), [
    ['sensor.station_temperatur', undefined, 'Temperatur'], ['sensor.station_gefuehlt', undefined, 'Gefühlt']]);
  // Without a felt value the outdoor sensor stays the curve; without one the station's temperature sensor.
  assert.deepEqual(D.weatherChart(h, W, 'sensor.outdoor', { showFeels: false }).series.map((x) => x.entity), ['sensor.outdoor']);
  assert.deepEqual(D.weatherChart(h, W, null, { showFeels: false }).series.map((x) => x.entity), ['sensor.station_temperatur']);
  const rows = D.weatherRows(h, W, {});
  assert.deepEqual(rows.map((r) => r.label), ['Gefühlt', 'Taupunkt', 'Windböen', 'Bewölkung', 'Regenwahrscheinlichkeit',
    'Regen heute', 'Niederschlag', 'Sonneneinstrahlung']);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.feels.value, '9 °C');
  assert.equal(by.feels.entity, 'sensor.station_gefuehlt', 'sensor row opens the sensor');
  assert.equal(by.cloud.value, '75 %');
  assert.equal(by.precipitation.value, '0,4 mm/h');
  assert.equal(by.rain_chance.value, '35 %');
  assert.equal(by.rain_chance_today.value, '60 %');
  assert.equal(by.solar.value, '180 W/m²');
  assert.equal(rows.length, 8);
  // A chosen felt sensor (Studio) wins while it has a number; an unknown one falls back.
  h.states['sensor.mine'] = { entity_id: 'sensor.mine', state: '7.5', attributes: { unit_of_measurement: '°C' } };
  assert.equal(D.weatherSources(h, W, { feels: 'sensor.mine' }).feels.entity, 'sensor.mine');
  h.states['sensor.mine'].state = 'unavailable';
  assert.equal(D.weatherSources(h, W, { feels: 'sensor.mine' }).feels.entity, 'sensor.station_gefuehlt');
}

// 4. Broken values: unknown/unavailable sensors and non-numeric attributes give no row, no NaN.
{
  const h = house({ attrs: { apparent_temperature: 'n/a', dew_point: null },
    sensors: [['sensor.station_boen', 'unavailable', 'wind_gust', 'km/h'], ['sensor.station_uv', '3', 'uv_index', '']] });
  const rows = D.weatherRows(h, W, {});
  assert.deepEqual(rows.map((r) => [r.key, r.value]), [['uv', '3']], 'only the UV sensor (entity has no uv_index)');
  assert.equal(D.weatherChart(h, W, 'sensor.outdoor', {}).series.length, 1);
  // A weather entity without a device: attributes only, nothing thrown.
  const h2 = house({ attrs: { apparent_temperature: 5 } });
  delete h2.entities[W];
  assert.equal(D.weatherSources(h2, W).feels.attribute, 'apparent_temperature');
  assert.deepEqual(D.weatherSources({ states: {} }, 'weather.gone'), {});
}

// 5. The template uses the helpers: chart series replaced only with a felt curve, rows inserted after their neighbour.
{
  const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
  const c = tpl.casora_weather.tap_action.casora_popup.content;
  assert.ok(c.includes('casoraDevice.weatherChart(hass, id,'), 'popup asks weatherChart');
  assert.ok(c.includes('_cc.switch = false'), 'both curves at once, with legend');
  assert.ok(c.includes('casoraDevice.weatherRows(hass, id, _wxOpt)'), 'popup asks weatherRows');
  assert.equal(tpl.casora_weather.variables.weather_extras, true);
  assert.equal(tpl.casora_weather.variables.weather_feels, true);
  const room = JSON.stringify(tpl.casora_room);
  assert.equal((room.match(/"weather_feels_sensor"/g) || []).length, 2, 'room hero and weather card pass the Studio settings');
}
console.log('weather_feels_like: ok');
