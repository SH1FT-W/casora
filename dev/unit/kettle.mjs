// Kettle card (#87, casoraKettleFind in 00-finder.js, 37-kettle.js): the finder takes a Xiaomi-BLE-like kettle
// (model YM-K1501, temperature + power) and a kettle named as such with target and keep warm, never a plain thermometer;
// tile word, and the popup's rows only for the entities the kettle has.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const LOCAL = new URL('../../custom_components/casora/scripts/local/', import.meta.url).pathname;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub() });
const win = {};
const box = { window: win, document: stub(), setTimeout, console, getComputedStyle: () => ({}) };
vm.createContext(box);
for (const f of ['00-finder.js', '37-kettle.js']) vm.runInContext(fs.readFileSync(LOCAL + f, 'utf8'), box);
const K = win._casoraKettle, F = win.casoraKettleFind;

const st = (state, a) => ({ state, attributes: a || {}, last_changed: new Date(Date.now() - 120000).toISOString() });
const hass = {
  config: { unit_system: { temperature: '°C' } },
  states: {
    'sensor.ble_temperature': st('92', { device_class: 'temperature', unit_of_measurement: '°C' }),
    'binary_sensor.ble_power': st('on', { device_class: 'power' }),
    'sensor.plus_temperature': st('64', { device_class: 'temperature', unit_of_measurement: '°C' }),
    'binary_sensor.plus_power': st('off', { device_class: 'power' }),
    'number.plus_target': st('80', { min: 40, max: 100, step: 5, unit_of_measurement: '°C' }),
    'switch.plus_keep_warm': st('on', { friendly_name: 'Plus Warmhalten' }),
    'sensor.room_temperature': st('21', { device_class: 'temperature', unit_of_measurement: '°C' }),
  },
  entities: {
    'sensor.ble_temperature': { device_id: 'd1' }, 'binary_sensor.ble_power': { device_id: 'd1' },
    'sensor.plus_temperature': { device_id: 'd2' }, 'binary_sensor.plus_power': { device_id: 'd2' },
    'number.plus_target': { device_id: 'd2' }, 'switch.plus_keep_warm': { device_id: 'd2' },
    'sensor.room_temperature': { device_id: 'd3' },
  },
  devices: { d1: { name: 'Smart Kettle', model: 'YM-K1501' }, d2: { name: 'Wasserkocher', model: 'X' }, d3: { name: 'Thermometer', model: 'T1' } },
  areas: {},
};
const all = F.all(hass);
assert.deepEqual([...all.map((k) => k.anchor)], ['sensor.ble_temperature', 'sensor.plus_temperature'], 'kettles only, no thermometer');
assert.equal(all[0].power, 'binary_sensor.ble_power');
assert.equal(all[1].target, 'number.plus_target');
assert.equal(all[1].warm, 'switch.plus_keep_warm');
assert.equal(F.of(hass, 'binary_sensor.ble_power').anchor, 'sensor.ble_temperature');

assert.equal(K.tileState(Object.assign({ entity_id: 'sensor.ble_temperature' }, hass.states['sensor.ble_temperature']), hass, {}), '92° · Heizt');
assert.equal(K.tileState(Object.assign({ entity_id: 'sensor.plus_temperature' }, hass.states['sensor.plus_temperature']), hass, {}), '64° · Warmhalten');

// The popup (until popup v3): HA's rows for the kettle's own entities and the temperature history.
let p = JSON.parse(JSON.stringify(K.popup({ entity_id: 'sensor.ble_temperature' }, hass, {})));
assert.deepEqual(p.cards[0], { type: 'entities', entities: ['sensor.ble_temperature', 'binary_sensor.ble_power'] }, 'BLE kettle: shows only');
assert.deepEqual(p.cards[1].entities, ['sensor.ble_temperature'], 'temperature history');
p = JSON.parse(JSON.stringify(K.popup({ entity_id: 'sensor.plus_temperature' }, hass, {})));
assert.deepEqual(p.cards[0].entities, ['sensor.plus_temperature', 'binary_sensor.plus_power', 'number.plus_target', 'switch.plus_keep_warm'], 'target and keep warm');
assert.equal(K.model(hass, 'sensor.plus_temperature', {}).goal.value, 80, 'target from the number');
// °F: the ring scale and the word follow the unit.
hass.states['sensor.ble_temperature'] = st('190', { device_class: 'temperature', unit_of_measurement: '°F' });
hass.states['binary_sensor.ble_power'] = st('off', { device_class: 'power' });
hass.entities = Object.assign({}, hass.entities);
assert.equal(K.word(K.model(hass, 'sensor.ble_temperature', {})), 'Heiß', '190 °F is hot');
console.log('ok kettle');
