// u08-04 (review 26.11.2026): the weather popup's wheel said 19° (the weather service, 18.9) and the chart right under
// it „19,7 °C Jetzt“ (an outdoor module found by casoraDevice.outdoor). Owner: every „now“ from one source – the outdoor
// sensor when there is one, else the weather service (wheel, chart, room header); an own sensor chosen in the Studio
// still wins (#115). Invented entities.
//   node dev/unit/weather_now_one_source.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#weatherNow,weatherChart
// @deckt: dashboards/casora/button_card_templates.json#casora_weather
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();
const D = window.casoraDevice;

const W = 'weather.qa_station';
const house = (outdoor, own) => {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  h.states[W] = { entity_id: W, state: 'cloudy', attributes: { temperature: 18.9, temperature_unit: '°C', apparent_temperature: 17.5 } };
  h.entities[W] = { entity_id: W };
  if (outdoor != null) {
    h.states['sensor.qa_aussen_temperatur'] = { entity_id: 'sensor.qa_aussen_temperatur', state: String(outdoor),
      attributes: { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Außen Temperatur' } };
    h.entities['sensor.qa_aussen_temperatur'] = { entity_id: 'sensor.qa_aussen_temperatur' };
  }
  if (own != null) {
    h.states['sensor.qa_eigen'] = { entity_id: 'sensor.qa_eigen', state: String(own), attributes: { device_class: 'temperature', unit_of_measurement: '°C' } };
    h.entities['sensor.qa_eigen'] = { entity_id: 'sensor.qa_eigen' };
  }
  return h;
};

// 1. The source.
{
  let h = house(19.7);
  assert.equal(D.weatherNow(h, W, {}).entity, 'sensor.qa_aussen_temperatur', 'outdoor sensor is now');
  assert.equal(D.weatherNow(h, W, {}).value, 19.7);
  h = house(null);
  assert.deepEqual(D.weatherNow(h, W, {}), { entity: W, attribute: 'temperature', value: 18.9, unit: '°C' }, 'without one: the service');
  h = house('unavailable');
  assert.equal(D.weatherNow(h, W, {}).value, 18.9, 'an outdoor sensor without a reading: the service');
  h = house(19.7, 21.2);
  assert.equal(D.weatherNow(h, W, { temp: 'sensor.qa_eigen' }).value, 21.2, 'own sensor wins (#115)');
}

// 2. The chart draws the same „now“, also beside the felt curve (before: the service's attribute there).
{
  const h = house(19.7);
  const out = D.outdoor(h, 'temperature');
  assert.equal(out, 'sensor.qa_aussen_temperatur');
  const c = D.weatherChart(h, W, out, {});
  assert.equal(c.series[0].entity, 'sensor.qa_aussen_temperatur', 'temperature curve = outdoor sensor beside the felt one');
  assert.equal(c.series[0].attribute, undefined);
  assert.equal(c.series[1].attribute, 'apparent_temperature', 'felt curve stays');
  const c2 = D.weatherChart(house(null), W, null, {});
  assert.deepEqual([c2.series[0].entity, c2.series[0].attribute], [W, 'temperature'], 'no outdoor sensor: the service');
}

// 3. The room header (casora_weather name, hero) shows the same number as the wheel.
{
  const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
  const src = T.casora_weather.name.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const h = house(19.7);
  const html = new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(
    window, h.states, h, { hero_mode: true, show_icon: false }, h.states[W], {});
  assert.match(String(html), /20°/, 'header: the outdoor sensor rounded (19,7 → 20°)');
  assert.doesNotMatch(String(html), /19°/, 'not the service\'s 18,9');
  // The popup's wheel takes its „now“ from the same function.
  const pop = T.casora_weather.tap_action.casora_popup.content;
  assert.match(pop, /const _wxNow = window\.casoraDevice && window\.casoraDevice\.weatherNow \? window\.casoraDevice\.weatherNow\(hass, id, \{ temp: tsId \|\| '' \}\) : null;/);
  assert.match(pop, /const curT = _wxNow \? _wxNow\.value :/);
}
console.log('weather_now_one_source: ok');
