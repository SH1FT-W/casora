// #227: a fridge tile without an entity looks for the first fridge of the house. It did that through the card's hass,
// and button-card notes every state a template reads through it as "watched": the tile watched every entity of the
// house (2358 of 2559 in the test house) and was redrawn, with a re-check of its row, on every state change anywhere.
// The search now reads Home Assistant's own hass; the fridge found is read through the card's hass as before.
//   node dev/unit/fridge_watch_list.mjs
// @deckt: custom_components/casora/scripts/local/30-fridge.js#_casoraFridge
import fs from 'node:fs';
import assert from 'node:assert/strict';

const entities = {}, states = {}, devices = {};
const add = (id, state, { key = null, platform = 'casora_mock', dev = 'd', attrs = {} } = {}) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: key, entity_category: null };
  states[id] = { entity_id: id, state: String(state), attributes: attrs, last_changed: new Date().toISOString() };
  if (!devices[dev]) devices[dev] = { id: dev, name: 'Device ' + dev };
};
const T = { device_class: 'temperature', unit_of_measurement: '°C' };
const lh = { platform: 'liebherr', dev: 'lh' };
add('sensor.combi_top_zone', 7, { ...lh, key: 'top_zone', attrs: T });
add('sensor.combi_bottom_zone', -18, { ...lh, key: 'bottom_zone', attrs: T });
add('number.combi_setpoint_top_zone', 5, { ...lh, key: 'setpoint_temperature_top_zone', attrs: T });
add('switch.combi_night_mode', 'off', { ...lh, key: 'night_mode' });
// The rest of the house: 300 entities of other devices.
for (let i = 0; i < 100; i++) {
  add('sensor.plug_' + i + '_power', i, { dev: 'p' + i, attrs: { device_class: 'power', unit_of_measurement: 'W' } });
  add('switch.plug_' + i, 'on', { dev: 'p' + i });
  add('sensor.room_' + i + '_temperature', 21, { dev: 'r' + i, attrs: T });
}
const house = { states, entities, devices, areas: {} };

globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass: house } : null) };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
new Function(src('30-fridge.js'))();
const K = window._casoraFridge;
assert.ok(K && K.find, 'modules loaded');

// The card's hass, as button-card hands it to a template: every state read is noted.
const watched = new Set();
const cardHass = Object.assign({}, house, { states: new Proxy({}, {
  get: (t, k) => { if (typeof k === 'string' && k.includes('.')) watched.add(k); return states[k]; },
  has: (t, k) => k in states, ownKeys: () => Object.keys(states),
  getOwnPropertyDescriptor: (t, k) => ({ value: states[k], enumerable: true, configurable: true }) }) });

const c = K.find(cardHass, null, {});
assert.ok(c && c.source === 'liebherr', 'the first fridge of the house is found');
assert.deepEqual(c.zones.map((z) => z.temp), ['sensor.combi_top_zone', 'sensor.combi_bottom_zone']);
const foreign = [...watched].filter((id) => entities[id].device_id !== 'lh');
assert.equal(foreign.length, 0, 'the tile watches no entity of another device (' + foreign.length + ' of ' + (Object.keys(states).length - 4) + ', e.g. ' + foreign.slice(0, 3).join(', ') + ')');
assert.ok(watched.has('sensor.combi_top_zone'), 'it watches the fridge it found');

// Without Home Assistant's element (unit tests, early load) the search uses the hass it was given.
globalThis.document = { querySelector: () => null };
assert.ok(K.find(cardHass, null, {}), 'still found without the house hass');
console.log('OK fridge_watch_list');
