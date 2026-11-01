// Issue #103: the climate popup's status line under „Klima“ repeated the humidity next to the temperature's wheel
// („62 % Luftfeuchtigkeit“, also in the readings on the right) and showed a bare „21,2 °C“ next to the humidity's.
// Owner: every view shows the same words, no numbers – temperature word, humidity word in lower case after „ · “,
// the air quality phrase as it is; a missing reading leaves its word out. Invented entities.
//   node dev/unit/climate_head_words.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const body = T.casora_climate_popup.tap_action.casora_popup.content.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
const S = (state, dc, unit) => ({ state: String(state), attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: 'Studio ' + dc } });
let line = null;
const UI = { soft: () => true, v3: () => true, esc: String, stage: (t) => '<stage ' + t + '>',
  line: (m, r) => { line = [m].concat(r); return line.filter(Boolean).join(' · '); },
  hero: () => '<hero>', group: (rows, l) => l, label: (t) => t, legend: () => '', more: () => '', note: () => '' };
const win = { _casoraUI: UI, casoraLocale: () => 'de-DE', _casoraHH: { layout: (o) => o } };
{ const b = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/01-basis.js', 'utf8');
  const a = b.indexOf('window.casoraComfortLevel = function'), e = b.indexOf('window.casoraComfortColor = function');
  const w = b.indexOf('window.casoraComfortWord = function'), we = b.indexOf('\n};', w) + 3;
  new Function('window', b.slice(a, e) + b.slice(w, we))(win); }
const run = (states, vars, id) => { line = null;
  const out = new Function('entity', 'states', 'hass', 'variables', 'window', body)({ entity_id: id, ...states[id] }, states, { language: 'de' }, vars, win);
  return out.fields.hero; };

// Temperature and humidity only (the reported room): both views the same words.
let st = { 'sensor.qa_t': S(21.2, 'temperature', '°C'), 'sensor.qa_h': S(62, 'humidity', '%') };
let v = { entity_temp: 'sensor.qa_t', entity_humidity: 'sensor.qa_h', room_name: 'Studio' };
assert.equal(run(st, v, 'sensor.qa_t'), 'Angenehm · etwas feucht', 'temperature view');
assert.equal(run(st, v, 'sensor.qa_h'), 'Angenehm · etwas feucht', 'humidity view: the temperature word, no „21,2 °C“');
assert.deepEqual(line, ['Angenehm', 'etwas feucht'], 'the temperature word leads, the humidity word follows in lower case');

// With air quality: its phrase stays as it is, after the comfort words; the same in the air quality view.
st = { ...st, 'sensor.qa_h': S(50, 'humidity', '%'), 'sensor.qa_aq': { state: 'excellent', attributes: {} }, 'sensor.qa_co2': S(450, 'carbon_dioxide', 'ppm') };
v = { ...v, entity_quality: 'sensor.qa_aq', sensors: ['sensor.qa_co2'] };
for (const id of ['sensor.qa_t', 'sensor.qa_h', 'sensor.qa_aq'])
  assert.equal(run(st, v, id), 'Angenehm · gut · Luftqualität ist hervorragend', id);

// Missing humidity: only the temperature word; missing temperature: the humidity word leads (capitalised).
assert.equal(run({ 'sensor.qa_t': S(17.5, 'temperature', '°C') }, { entity_temp: 'sensor.qa_t' }, 'sensor.qa_t'), 'Kühl');
assert.equal(run({ 'sensor.qa_h': S(25, 'humidity', '%') }, { entity_humidity: 'sensor.qa_h' }, 'sensor.qa_h'), 'Sehr trocken');
// Fahrenheit: the word from the converted reading.
assert.equal(run({ 'sensor.qa_t': S(80, 'temperature', '°F'), 'sensor.qa_h': S(35, 'humidity', '%') },
  { entity_temp: 'sensor.qa_t', entity_humidity: 'sensor.qa_h' }, 'sensor.qa_t'), 'Heiß · etwas trocken');

// Every language translates the lower-case humidity words (the line translates each part on its own).
const dir = ROOT + 'custom_components/casora/translations/dashboard/phrases/';
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'de.json')) {
  const ex = JSON.parse(fs.readFileSync(dir + f, 'utf8')).exact;
  for (const w of ['gut', 'etwas trocken', 'etwas feucht', 'sehr trocken', 'sehr feucht'])
    assert.ok(ex[w], `${f}: „${w}“`);
}
console.log('climate_head_words: ok');
