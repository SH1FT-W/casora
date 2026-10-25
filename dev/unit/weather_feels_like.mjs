// Issue #56: felt temperature as a second curve in the weather popup's temperature chart, and the further values of
// the weather source ("Wetter & Warnungen": sensors by translation_key on the weather device; HA's standard weather
// attributes). Without such sources the chart keeps its one curve and the popup gets no extra rows. The Studio picks
// which curves go into the chart (up to four, one chart per unit) and which extra rows show (weatherChoice).
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

// 5. The template uses the helpers: one chart per unit group, rows inserted after their neighbour; the Studio's lists
//    reach the popup on desktop (casora_room) and phone (casora_mobile_weather, declared so the Studio mirrors them).
{
  const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
  const c = tpl.casora_weather.tap_action.casora_popup.content;
  assert.ok(c.includes('casoraDevice.weatherChart(hass, id,'), 'popup asks weatherChart');
  assert.ok(c.includes('casoraDevice.weatherChoice(variables)'), 'popup reads the Studio choice');
  assert.ok(c.includes('_cc.switch = false'), 'curves of one unit at once, with legend');
  assert.ok(c.includes('_wxG.map((g) => [g.key, g.label])'), 'one switch button per unit');
  assert.ok(c.includes('casoraDevice.weatherRows(hass, id, _wxOpt)'), 'popup asks weatherRows');
  assert.ok(!c.includes("r.key === 'feels' && !_wxOpt.showFeels"), 'the felt row follows the row list, not the curve');
  assert.equal(tpl.casora_weather.variables.weather_extras, true);
  assert.equal(tpl.casora_weather.variables.weather_chart, null);
  for (const [name, at] of [['casora_room', ['temperature', 'weather']], ['casora_mobile_weather', ['weather']]]) {
    const t = tpl[name];
    for (const k of ['weather_chart', 'weather_extras', 'weather_feels', 'weather_feels_sensor']) {
      assert.ok(Object.prototype.hasOwnProperty.call(t.variables, k), name + ' declares ' + k);
    }
    for (const f of at) {
      const v = t.custom_fields[f].card.variables;
      assert.equal(v.weather_chart, '[[[ return variables.weather_chart || null; ]]]', name + '/' + f + ' passes the curves');
      assert.ok(/return variables\.weather_extras == null/.test(v.weather_extras) && !/!== false/.test(v.weather_extras),
        name + '/' + f + ' passes the row list as it is, not as on/off');
    }
  }
}

// 6. Studio choice and migration of the older on/off settings.
{
  const ALL = ['feels', 'dew_point', 'gust', 'cloud', 'rain_chance', 'rain_chance_today', 'precipitation', 'solar', 'uv'];
  assert.deepEqual(D.weatherChoice({}), { chart: ['temperature', 'feels'], rows: ALL }, 'defaults: temperature + felt, all rows');
  assert.deepEqual(D.weatherChoice({ weather_feels: true, weather_extras: true }), { chart: ['temperature', 'feels'], rows: ALL });
  assert.deepEqual(D.weatherChoice({ weather_extras: false }).rows, [], 'old extras off: no rows');
  assert.deepEqual(D.weatherChoice({ weather_extras: 'false' }).rows, []);
  const off = D.weatherChoice({ weather_feels: false });
  assert.deepEqual(off.chart, ['temperature'], 'old felt off: temperature alone');
  assert.deepEqual(off.rows, ALL.filter((k) => k !== 'feels'), 'old felt off: no felt row either');
  assert.deepEqual(D.weatherChoice({ weather_feels: false, weather_chart: ['temperature', 'dew_point'] }).chart, ['temperature', 'dew_point'],
    'a chosen list wins over the old switch');
  assert.deepEqual(D.weatherChoice({ weather_chart: ['dew_point', 'bogus', 'dew_point'], weather_extras: ['gust', 'nope'] }),
    { chart: ['dew_point'], rows: ['gust'] }, 'unknown and repeated keys dropped');
  assert.deepEqual(D.weatherChoice({ weather_chart: [] }).chart, ['temperature', 'feels'], 'empty list: default');
  assert.equal(D.weatherChoice({ weather_chart: ['temperature', 'feels', 'dew_point', 'humidity', 'wind'] }).chart.length, 4, 'at most four');
  assert.equal(D.weatherMaxCurves, 4);
}

// 7. Chosen curves: same unit together (legend), other units in their own chart behind the switch, sensors first.
{
  const h = house({
    attrs: { apparent_temperature: 9, dew_point: 6.2, humidity: 70, wind_speed: 18, wind_gust_speed: 41, wind_speed_unit: 'km/h', cloud_coverage: 75 },
    sensors: [
      ['sensor.station_temperatur', '11.4', 'temperature', '°C'],
      ['sensor.station_gefuehlt', '8.6', 'apparent_temperature', '°C'],
      ['sensor.station_taupunkt', '6.2', 'dew_point', '°C'],
      ['sensor.station_boen', '41', 'wind_gust', 'km/h'],
      ['sensor.station_solar', '180', 'solar', 'W/m²'],
    ],
  });
  h.states['sensor.outdoor'] = { entity_id: 'sensor.outdoor', state: '12', attributes: { unit_of_measurement: '°C' } };
  const opt = D.weatherOptions(h, W);
  assert.deepEqual(opt.curves, ['temperature', 'feels', 'dew_point', 'humidity', 'wind', 'gust', 'cloud', 'solar'], 'what the source offers');
  assert.deepEqual(opt.rows, ['feels', 'dew_point', 'gust', 'cloud', 'solar']);
  // Temperature, felt and dew point: one chart, three curves, the dew point from its sensor (statistics).
  let c = D.weatherChart(h, W, 'sensor.outdoor', { curves: ['temperature', 'feels', 'dew_point'] });
  assert.equal(c.groups.length, 1);
  assert.deepEqual(c.series.map((s) => [s.entity, s.name, s.color]), [
    ['sensor.station_temperatur', 'Temperatur', '#FF9F0A'], ['sensor.station_gefuehlt', 'Gefühlt', 'c1'], ['sensor.station_taupunkt', 'Taupunkt', 'c3']]);
  assert.equal(c.groups[0].unit, '°C');
  assert.equal(c.groups[0].title, 'Außentemperatur');
  // Different units: temperature alone (the outdoor sensor, as before), humidity, wind with gusts.
  c = D.weatherChart(h, W, 'sensor.outdoor', { curves: ['temperature', 'humidity', 'wind', 'gust'] });
  assert.deepEqual(c.groups.map((g) => [g.unit, g.label, g.series.map((s) => s.entity + (s.attribute ? '#' + s.attribute : ''))]), [
    ['°C', 'Temperatur', ['sensor.outdoor']],
    ['%', 'Luftfeuchtigkeit', [W + '#humidity']],
    ['km/h', 'Wind', [W + '#wind_speed', 'sensor.station_boen']]]);
  assert.equal(new Set(c.groups.map((g) => g.key)).size, 3, 'every chart has its own key');
  assert.equal(c.groups[1].key, W + '#humidity');
  assert.deepEqual(c.groups[2].series.map((s) => s.color), ['c1', 'c3']);
  assert.equal(c.groups[2].title, 'Wind · Windböen');
  // Without the temperature: the first chosen unit is the first chart; a value the source lacks is left out.
  c = D.weatherChart(h, W, 'sensor.outdoor', { curves: ['solar', 'precipitation'] });
  assert.deepEqual(c.groups.map((g) => [g.key, g.label]), [['sensor.station_solar', 'Sonneneinstrahlung']]);
  assert.equal(c.series[0].color, 'c4');
  // At most four curves, in the fixed order.
  c = D.weatherChart(h, W, null, { curves: ['solar', 'cloud', 'gust', 'wind', 'humidity', 'dew_point', 'feels', 'temperature'] });
  assert.deepEqual([].concat(...c.groups.map((g) => g.curves)), ['temperature', 'feels', 'dew_point', 'humidity']);
}

// 8. Attributes only (e.g. met.no): several curves from one weather entity, each its own attribute history.
{
  const h = house({ attrs: { apparent_temperature: 8.4, dew_point: 6.1, cloud_coverage: 75 } });
  const c = D.weatherChart(h, W, null, { curves: ['temperature', 'feels', 'dew_point', 'cloud'] });
  assert.deepEqual(c.groups.map((g) => g.series.map((s) => s.attribute)), [['temperature', 'apparent_temperature', 'dew_point'], ['cloud_coverage']]);
  assert.ok(c.groups[0].series.every((s) => s.entity === W && s.unit === '°C'));
  assert.equal(c.groups[0].key, W);
  assert.equal(c.groups[1].key, W + '#cloud_coverage');
  assert.deepEqual(c.groups[1].series[0].unit, '%');
}

// 9. Chosen rows: only those, in the popup's order; none at all with an empty list.
{
  const h = house({ attrs: { apparent_temperature: 8.4, dew_point: 6.1, wind_gust_speed: 40, cloud_coverage: 75 } });
  assert.deepEqual(D.weatherRows(h, W, { rows: ['cloud', 'dew_point'] }).map((r) => r.key), ['dew_point', 'cloud']);
  assert.deepEqual(D.weatherRows(h, W, { rows: [] }), []);
  assert.equal(D.weatherRows(h, W, { rows: null }).length, 4, 'no list: all');
  assert.deepEqual(D.weatherRows(h, W, { rows: D.weatherChoice({ weather_feels: false }).rows }).map((r) => r.key), ['dew_point', 'gust', 'cloud']);
}

// 10. Studio: both lists as chip pickers of what the source offers, no on/off switch for them any more.
{
  const p = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
  assert.ok(/key: "weather_chart", label: "In the chart", type: "weatherpick", pick: "curves"/.test(p));
  assert.ok(/key: "weather_extras", label: "Extra values", type: "weatherpick", pick: "rows"/.test(p));
  assert.ok(!/key: "weather_feels", label/.test(p), 'old felt switch gone');
  assert.ok(/f\.type === "weatherpick"/.test(p) && /_optionChips\(/.test(p));
  const keys = (s) => JSON.parse(s.replace(/'/g, '"'));
  const pc = keys(/const WEATHER_CURVES = (\[[^\]]+\])/.exec(p)[1]);
  const pr = keys(/const WEATHER_ROWS = (\[[^\]]+\])/.exec(p)[1]);
  const f = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
  assert.deepEqual(pc, keys(/var WX_CURVES = (\[[^\]]+\])/.exec(f)[1]), 'Studio and dashboard know the same curves');
  assert.deepEqual(pr, keys(/var WX_ROWS = (\[[^\]]+\])/.exec(f)[1]), 'Studio and dashboard know the same rows');
}
console.log('weather_feels_like: ok');
