// Detail round #16: the general device popup's state rows – no row without a value („Unbekannt“), a problem reading
// („Wassertank leer“, Home Connect's off/present/confirmed events) says „OK“ or its word, not „An/Aus“ or „present“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-standard-medien.js', import.meta.url), 'utf8');
const a = src.indexOf("add('vals', '[[[ ");
const b = src.indexOf(" ]]]'", a);
assert.ok(a > 0 && b > a, 'vals section');
// The template as button-card evaluates it.
const code = new Function('sib', 'return ' + src.slice(a + "add('vals', ".length, b + 5).replace('JSON.stringify(sib)', 'JSON.stringify(sib)'))(
  ['sensor.tank', 'sensor.tray', 'sensor.desc', 'sensor.progress', 'binary_sensor.fern', 'sensor.state']);
const body = code.replace(/^\[\[\[|\]\]\]$/g, '');
const st = (id, state, a) => ({ entity_id: id, state, attributes: a });
const EV = { device_class: 'enum', options: ['confirmed', 'off', 'present'] };
const states = {
  'sensor.tank': st('sensor.tank', 'off', { ...EV, friendly_name: 'Wassertank leer' }),
  'sensor.tray': st('sensor.tray', 'confirmed', { ...EV, friendly_name: 'Tropfschale voll' }),
  'sensor.desc': st('sensor.desc', 'present', { ...EV, friendly_name: 'Entkalken in 10 Tassen' }),
  'sensor.progress': st('sensor.progress', 'unknown', { friendly_name: 'Programmfortschritt' }),
  'binary_sensor.fern': st('binary_sensor.fern', 'on', { friendly_name: 'Fernstart' }),
  'sensor.state': st('sensor.state', 'on', { friendly_name: 'Bohnenbehälter leer' }),
};
let rows = null;
const window = { _casoraUI: { section: (k, r) => { rows = r; return 'x'; } }, _casoraNiceState: (h, s) => (s.state === 'on' ? 'An' : s.state === 'off' ? 'Aus' : s.state) };
new Function('window', 'states', 'hass', body)(window, states, { entities: {} });
const v = Object.fromEntries(rows.map((r) => [r.label, r.value]));
assert.deepEqual(v, { 'Wassertank leer': 'OK', 'Tropfschale voll': 'Bestätigt', 'Entkalken in 10 Tassen': 'Ja', Fernstart: 'An', 'Bohnenbehälter leer': 'Leer' }, JSON.stringify(v));
// Detail round #17 (ventilation coach): a room open long keeps one line – since when and the values.
assert.ok(src.includes("replace(/^Fenster offen\\s+/, '')") && src.includes("sub: x.status === 'lange' ? sb.join(' · ') : sb"), 'ventilation: one line for „Lange offen“');
console.log('device_rows_words: ok');
