// Prüfrunde d03-04: the air quality badge opened the climate popup with an empty grey wheel „Unbekannt“ while
// temperature and humidity were there – the quality sensor reported none of the known words (unknown). §4.7: never an
// empty stage. Expected: without a rated air quality the wheel falls back to temperature (then humidity); a working
// quality sensor keeps the air quality wheel. Invented entities.   node dev/unit/klima_luft_unbekannt.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_climate_popup
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const body = T.casora_climate_popup.tap_action.casora_popup.content.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
const S = (state, dc, unit) => ({ state: String(state), attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: 'Wohnzimmer ' + dc } });
const seen = [];
const UI = { soft: () => true, v3: () => true, esc: String,
  stage: (t, o) => { seen.push([t, o]); return '<stage ' + t + '>'; }, line: (m, r) => m + (r.length ? ' · ' + r.join(' · ') : ''),
  hero: () => '<hero>', group: (rows, l) => l + ':' + rows.map((r) => r.entity).join(','), label: (t) => '<l>' + t, legend: () => '', more: () => '', note: () => '' };
const win = { _casoraUI: UI, casoraLocale: () => 'de-DE', _casoraHH: { layout: (o) => o } };
const vars = { entity_temp: 'sensor.qa_temp', entity_humidity: 'sensor.qa_hum', entity_quality: 'sensor.qa_aq', sensors: [], room_name: 'Wohnzimmer' };
const run = (aq) => {
  const states = { 'sensor.qa_temp': S(23.3, 'temperature', '°C'), 'sensor.qa_hum': S(43, 'humidity', '%'), 'sensor.qa_aq': { state: aq, attributes: {} } };
  seen.length = 0;
  new Function('entity', 'states', 'hass', 'variables', 'window', body)({ entity_id: 'sensor.qa_aq', ...states['sensor.qa_aq'] }, states, { language: 'de' }, vars, win);
  return seen[seen.length - 1];
};
for (const aq of ['unknown', 'unavailable', '17']) {
  const st = run(aq);
  assert.ok(!(st[0] === 'status' && st[1].text === 'Unbekannt'), aq + ': no empty „Unbekannt“ wheel');
  assert.equal(st[0], 'chart', aq + ': temperature instead');
  assert.equal(st[1].unit, '°');
}
const ok = run('good');
assert.equal(ok[0], 'status', 'a rated air quality keeps its wheel');
assert.equal(ok[1].text, 'Gut');
console.log('klima_luft_unbekannt: ok');
