// Luftbefeuchter-Popup (1.5, 19-befeuchter.js) ohne HA: Entitäten am selben Gerät, Zustand, Zielfeuchte-Felder,
// Bedien-Dienste und Status-Zeilen. Alle Geräte und Namen erfunden.
//   node dev/unit/befeuchter.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/19-befeuchter.js', import.meta.url), 'utf8'))();
const H = window._casoraHumid;
assert.ok(H, 'Modul geladen');

const entities = {}, states = {};
const add = (id, state, attributes = {}, key = null, dev = 'd_b') => {
  entities[id] = { entity_id: id, platform: 'nebelmaschine', translation_key: key, device_id: dev };
  states[id] = { entity_id: id, state, attributes };
};
const ID = 'humidifier.nebelchen';
const base = { humidity: 50, current_humidity: 41, min_humidity: 30, max_humidity: 80, mode: 'normal', available_modes: ['normal', 'sleep', 'baby'], action: 'humidifying' };
add(ID, 'on', base);
add('sensor.nebelchen_humidity', '42', { device_class: 'humidity', unit_of_measurement: '%' });
add('sensor.nebelchen_water_level', '12', { unit_of_measurement: '%' }, 'water_level');
add('sensor.nebelchen_power', '23.4', { unit_of_measurement: 'W', device_class: 'power' });
add('sensor.fremd_humidity', '60', { device_class: 'humidity', unit_of_measurement: '%' }, null, 'd_x');
const hass = { states, entities, devices: { d_b: { id: 'd_b', area_id: 'a_k' } }, areas: { a_k: { name: 'Kinderzimmer' } } };

// Entitäten am Gerät, fremde Geräte bleiben draußen
const c = H.find(hass, ID);
assert.equal(c.humidity, 'sensor.nebelchen_humidity');
assert.equal(c.water, 'sensor.nebelchen_water_level');
assert.equal(c.power, 'sensor.nebelchen_power');
assert.equal(c.waterLow, null);

// Zustand
let s = H.status(c, states, hass);
assert.equal(s.label, 'Befeuchtet'); assert.equal(s.on, true); assert.equal(s.current, 41, 'Ist-Wert aus dem Attribut');
assert.equal(s.target, 50); assert.deepEqual(s.modes, ['normal', 'sleep', 'baby']);
states[ID] = { entity_id: ID, state: 'on', attributes: Object.assign({}, base, { current_humidity: undefined, action: 'idle' }) };
s = H.status(c, states, hass);
assert.equal(s.current, 42, 'ohne Attribut: Feuchtesensor am Gerät'); assert.equal(s.label, 'Bereit');
states[ID] = { entity_id: ID, state: 'off', attributes: base };
s = H.status(c, states, hass);
assert.equal(s.label, 'Aus'); assert.equal(s.mode, null);
states[ID] = { entity_id: ID, state: 'unavailable', attributes: {} };
assert.equal(H.status(c, states, hass).label, 'Nicht verfügbar');

// Zielfeuchte-Felder
assert.deepEqual(H.steps(30, 80, 50), [40, 45, 50, 55, 60]);
assert.deepEqual(H.steps(30, 80, 52), [40, 45, 50, 52, 55, 60], 'krummes Ziel kommt dazu');
assert.deepEqual(H.steps(60, 90, 70), [60, 70, 80, 90], 'Bereich ohne 40–60: gleichmäßig');
assert.deepEqual(H.steps(null, null, null), [40, 45, 50, 55, 60]);
assert.equal(H.modeLabel(hass, null, 'sleep'), 'Schlaf');
assert.equal(H.modeLabel(hass, null, 'turbo_max'), 'Turbo_max');

// Bereiche
window._casoraUI = {
  hero: (o) => '<hero>' + (o.label || '') + '|' + o.value + '|' + (o.sub || '') + '</hero>',
  segments: (items, label) => '<seg ' + label + '>' + items.map((i) => (i.active ? '*' : '') + i.label + '>' + i.svc.service + (i.svc.data ? JSON.stringify(i.svc.data) : '')).join(';') + '</seg>',
  group: (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '')).join(';') + '</group>',
};
states[ID] = { entity_id: ID, state: 'on', attributes: base };
assert.equal(H.sec('hero', c, states, hass), '<hero>Kinderzimmer|Normal|Ziel 50 %</hero>');
const ctrl = H.sec('ctrl', c, states, hass);
assert.ok(ctrl.includes('<seg Betrieb>Aus>turn_off;*An>turn_on</seg>'), ctrl);
assert.ok(ctrl.includes('*Normal>set_mode{"mode":"normal"};Schlaf>set_mode{"mode":"sleep"}'), ctrl);
assert.ok(ctrl.includes('*50 %>set_humidity{"humidity":50}'), ctrl);
const info = H.sec('info', c, states, hass);
assert.equal(info, '<group Status>Luftfeuchte=41 %;Zielfeuchte=50 %;Wassertank=12 %;Leistung=23 W</group>');
assert.ok(/Weitere Einstellungen/.test(H.sec('set', c, states, hass)));
states[ID] = { entity_id: ID, state: 'unavailable', attributes: {} };
assert.equal(H.sec('ctrl', c, states, hass), '', 'nicht verfügbar: keine Tasten');
// Wassertank als Binärsensor (leer = an)
add('binary_sensor.nebelchen_water_tank_empty', 'on', { device_class: 'problem' }, 'water_tank_empty');
delete entities['sensor.nebelchen_water_level'];
const c2 = H.find(hass, ID);
states[ID] = { entity_id: ID, state: 'on', attributes: base };
assert.ok(/Wassertank=Leer/.test(H.sec('info', c2, states, hass)));
console.log('befeuchter: ok');
