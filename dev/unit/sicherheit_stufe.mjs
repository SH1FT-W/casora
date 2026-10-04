// Farbsystem Sicherheit (03.10.2026): window.casoraSecurityLevel (00-finden.js) liefert je
// Gerät/Gruppe die Stufe ok (Weich: Grün) / warn (Orange) / alarm (Rot); die große
// Sicherheit-Badge nimmt den schlimmsten Zustand. Gemeldet: alle Symbolkreise rot, auch sichere.
//   node dev/unit/sicherheit_stufe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/00-finden.js'))();

const lvl = window.casoraSecurityLevel;
function house(over = {}) {
  const st = {
    'lock.haustuer': ['locked'],
    'lock.keller': ['locked'],
    'alarm_control_panel.alarm': ['armed_home'],
    'camera.flur': ['idle'],
    'binary_sensor.haustuer': ['off', { device_class: 'door', friendly_name: 'Haustür' }],
    'binary_sensor.fenster_bad': ['off', { device_class: 'window', friendly_name: 'Fenster Bad' }],
    'binary_sensor.balkon': ['off', { device_class: 'door', friendly_name: 'Balkontür' }],
    'binary_sensor.balkon_kippsensor': ['off', { device_class: 'window', friendly_name: 'Balkontür Kippsensor' }],
    'binary_sensor.bewegung': ['off', { device_class: 'motion', friendly_name: 'Bewegung Flur' }],
    'person.a': ['home'],
    ...over,
  };
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, [state, attrs = {}]] of Object.entries(st)) h.states[id] = { entity_id: id, state, attributes: attrs };
  return h;
}
const ALL = ['lock.haustuer', 'lock.keller', 'alarm_control_panel.alarm', 'camera.flur',
  'binary_sensor.haustuer', 'binary_sensor.fenster_bad', 'binary_sensor.balkon', 'binary_sensor.balkon_kippsensor',
  'binary_sensor.bewegung'];

// Alles sicher → ok (Weich: Grün)
assert.equal(lvl(house(), ALL), 'ok');
assert.equal(lvl(house(), ['lock.haustuer']), 'ok');
assert.equal(lvl(house(), ['alarm_control_panel.alarm']), 'ok');
assert.equal(lvl(house(), ['camera.flur']), 'ok');
assert.equal(lvl(house(), []), 'ok');

// Hinweis (Orange): entriegelt, offen, gekippt, Alarm unscharf, Kamera offline
assert.equal(lvl(house({ 'lock.keller': ['unlocked'] }), ['lock.haustuer', 'lock.keller']), 'warn');
assert.equal(lvl(house({ 'binary_sensor.fenster_bad': ['on', { device_class: 'window' }] }), ['binary_sensor.fenster_bad']), 'warn');
assert.equal(lvl(house({ 'binary_sensor.balkon_kippsensor': ['on', { device_class: 'window', friendly_name: 'Balkontür Kippsensor' }] }),
  ['binary_sensor.balkon', 'binary_sensor.balkon_kippsensor']), 'warn');
assert.equal(lvl(house({ 'alarm_control_panel.alarm': ['disarmed'] }), ['alarm_control_panel.alarm']), 'warn');
assert.equal(lvl(house({ 'camera.flur': ['unavailable'] }), ['camera.flur']), 'warn');
// Bewegung bei Anwesenheit ist kein Hinweis
assert.equal(lvl(house({ 'binary_sensor.bewegung': ['on', { device_class: 'motion' }] }), ['binary_sensor.bewegung']), 'ok');

// Gefahr (Rot): Alarm ausgelöst, Schloss klemmt, offen/entriegelt bei Abwesenheit
assert.equal(lvl(house({ 'alarm_control_panel.alarm': ['triggered'] }), ALL), 'alarm');
assert.equal(lvl(house({ 'lock.keller': ['jammed'] }), ['lock.keller']), 'alarm');
const away = { 'person.a': ['not_home'] };
assert.equal(window.casoraSecurityAway(house(away)), true);
assert.equal(window.casoraSecurityAway(house({ 'person.a': ['unknown'] })), false, 'unbekannt zählt nicht als weg');
assert.equal(window.casoraSecurityAway(house({ 'alarm_control_panel.alarm': ['armed_away'] })), true);
assert.equal(lvl(house({ ...away, 'binary_sensor.haustuer': ['on', { device_class: 'door' }] }), ['binary_sensor.haustuer']), 'alarm');
assert.equal(lvl(house({ ...away, 'lock.keller': ['unlocked'] }), ['lock.keller']), 'alarm');
// Gekippt bleibt auch bei Abwesenheit ein Hinweis
assert.equal(lvl(house({ ...away, 'binary_sensor.balkon_kippsensor': ['on', { device_class: 'window', friendly_name: 'Balkontür Kippsensor' }] }),
  ['binary_sensor.balkon', 'binary_sensor.balkon_kippsensor']), 'warn');

// Schlimmster Zustand gewinnt (gemischt wie gemeldet: Schloss offen, Fenster offen, Kamera offline, Alarm scharf)
const mixed = house({ 'lock.keller': ['unlocked'], 'binary_sensor.fenster_bad': ['on', { device_class: 'window' }], 'camera.flur': ['unavailable'] });
assert.equal(lvl(mixed, ALL), 'warn');
assert.equal(lvl(mixed, ['alarm_control_panel.alarm']), 'ok');

// Gruppen-Helfer zählt über seine Mitglieder
const g = house({ 'binary_sensor.fenster_bad': ['on', { device_class: 'window' }],
  'binary_sensor.fenster_beispiel': ['on', { entity_id: ['binary_sensor.fenster_bad'] }] });
assert.equal(lvl(g, ['binary_sensor.fenster_beispiel']), 'warn');

console.log('sicherheit_stufe: ok');
