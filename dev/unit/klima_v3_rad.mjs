// Climate popup v3 (maintainer 01.11.2026, casora_climate_popup): the wheel follows the tapped badge –
//  temperature: a level ring over a room range (cold → warm) with value and word; humidity: 0–100 % with the comfort
//  band 40–60 marked; air quality: the score in its traffic light with the deciding reading in the middle. The Verlauf
//  stands under the wheel (left), for air quality every reading of the room as a curve with the switch; the status line
//  names the other readings, never the stage's value. Invented entities.   node dev/unit/klima_v3_rad.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const body = T.casora_climate_popup.tap_action.casora_popup.content.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
const S = (state, dc, unit) => ({ state: String(state), attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: 'Büro ' + dc } });
const states = {
  'sensor.qa_temp': S(21.4, 'temperature', '°C'), 'sensor.qa_hum': S(48, 'humidity', '%'), 'sensor.qa_aq': { state: 'good', attributes: {} },
  'sensor.qa_co2': S(1200, 'carbon_dioxide', 'ppm'), 'sensor.qa_pm25': S(4, 'pm25', 'µg/m³'), 'sensor.qa_pm10': S(6, 'pm10', 'µg/m³'),
};
const seen = [];
const UI = { soft: () => true, v3: () => true, esc: String,
  stage: (t, o) => { seen.push([t, o]); return '<stage ' + t + '>'; }, line: (m, r) => m + (r.length ? ' · ' + r.join(' · ') : ''),
  hero: () => '<hero>', group: (rows, l) => l + ':' + rows.map((r) => r.entity).join(','), label: (t) => '<l>' + t, legend: () => '', more: () => '', note: () => '' };
const win = { _casoraUI: UI, casoraLocale: () => 'de-DE', _casoraHH: { layout: (o) => o } };
// The comfort words of the badges (01-basis.js), loaded as they are.
{ const b = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/01-basis.js', 'utf8');
  const a = b.indexOf('window.casoraComfortLevel = function'), e = b.indexOf('window.casoraComfortColor = function');
  const w = b.indexOf('window.casoraComfortWord = function'), we = b.indexOf('\n};', w) + 3;
  new Function('window', b.slice(a, e) + b.slice(w, we))(win); }
const vars = { entity_temp: 'sensor.qa_temp', entity_humidity: 'sensor.qa_hum', entity_quality: 'sensor.qa_aq',
  sensors: ['sensor.qa_co2', 'sensor.qa_pm25', 'sensor.qa_pm10'], room_name: 'Büro' };
const run = (id) => { seen.length = 0; const ent = { entity_id: id, ...states[id] };
  const out = new Function('entity', 'states', 'hass', 'variables', 'window', body)(ent, states, { language: 'de' }, vars, win);
  return { out, st: seen[seen.length - 1] }; };

// Temperature badge: level ring with heat, the word under the value; the line names humidity and air quality.
let r = run('sensor.qa_temp');
assert.equal(r.st[0], 'chart'); assert.equal(r.st[1].unit, '°'); assert.equal(r.st[1].trend, 'Angenehm');
assert.ok(r.st[1].ring.heat && r.st[1].ring.min <= 21.4 && r.st[1].ring.max >= 21.4, 'a room range around the value');
assert.match(r.out.fields.hero, /^48 % Luftfeuchtigkeit · /); assert.ok(!/21,4/.test(r.out.fields.hero), 'line never repeats the stage value');
assert.equal(r.out.stage, 'stage'); assert.equal(r.out.quick, 'metric', 'the Verlauf under the wheel'); assert.deepEqual(r.out.right, ['read']);
assert.ok(!/sensor\.qa_temp/.test(r.out.fields.read), 'the stage value is not in the list again');

// Humidity badge: 0–100 with the comfort band marked.
r = run('sensor.qa_hum');
assert.equal(r.st[0], 'chart'); assert.equal(r.st[1].value, '48'); assert.equal(r.st[1].unit, '%'); assert.equal(r.st[1].trend, 'Gut', 'the humidity badge\'s word');
assert.deepEqual(r.st[1].ring.marks, [40, 60]); assert.equal(r.st[1].ring.min, 0); assert.equal(r.st[1].ring.max, 100);
assert.match(r.out.fields.hero, /^21,4 °C/);

// Air quality badge: the score fills the ring in its light; CO₂ 1200 (moderate) decides – in the middle; every reading a curve.
r = run('sensor.qa_aq');
assert.equal(r.st[0], 'status'); assert.equal(r.st[1].text, 'Mäßig'); assert.equal(r.st[1].tone, 'warn');
assert.equal(r.st[1].value, '1.200'); assert.equal(r.st[1].unit, 'ppm'); assert.equal(r.st[1].facts[0].label, 'CO₂');
const g = r.out.fields.metric.card.custom_fields.chart.card;
assert.deepEqual(g.series.map((x) => x.entity), ['sensor.qa_co2', 'sensor.qa_pm25', 'sensor.qa_pm10'], 'every reading as a curve');
assert.equal(g.selected, 'sensor.qa_co2', 'the deciding reading first');
assert.match(r.out.fields.hero, /^21,4 °C · 48 % Luftfeuchtigkeit$/);
// eCO2 of a VOC sensor (VOC device class, ppm) counts as CO₂: 400 ppm is no „Sehr schlecht“; two CO₂ sensors one curve.
states['sensor.qa_voc_eco2'] = S(400, 'volatile_organic_compounds_parts', 'ppm');
states['sensor.qa_co2'] = S(500, 'carbon_dioxide', 'ppm');
vars.sensors = ['sensor.qa_co2', 'sensor.qa_pm25', 'sensor.qa_pm10', 'sensor.qa_voc_eco2'];
r = run('sensor.qa_aq');
assert.equal(r.st[1].text, 'Ausgezeichnet');
assert.deepEqual(r.out.fields.metric.card.custom_fields.chart.card.series.map((x) => x.name), ['CO₂', 'PM2.5', 'PM10'], 'one curve per reading');
// The badge counts eCO2 the same way (its word must match the wheel's).
const badge = JSON.stringify(T.casora_badge_air_quality);
assert.ok(badge.indexOf("id.includes('kohlendioxid')) ? [1000, 1500, 2000]") > -1 && badge.indexOf("id.includes('kohlendioxid')) ? [1000, 1500, 2000]") < badge.indexOf("id.includes('voc')"), 'badge: CO₂ by name before VOC');
// Four curves: the chart's switch takes two rows (casora-chart.js).
assert.match(fs.readFileSync(ROOT + 'custom_components/casora/scripts/casora-chart.js', 'utf8'), /series\.length > 3 \? 'sw g2'/);
console.log('klima_v3_rad: ok');
