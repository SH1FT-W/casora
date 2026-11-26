// Test round 26.11.2026 (d02-06): the Studio's phone preview showed a thermostat tile with the thermostat's own
// reading („21,7° · Aus“), the dashboard with the room's sensor („23,3° · Aus“, casoraRoomTempOf). The preview has no
// dashboard config to read the room headers from; now it hands in the rooms (the desktop rooms for the phone), Home last.
//   node dev/unit/studio_thermostat_raumtemp.mjs
// @deckt: custom_components/casora/panel/casora-panel-types.js#casoraWithStudioRooms custom_components/casora/panel/casora-panel.js#tileStateWord custom_components/casora/scripts/local/01-basis.js#casoraRoomTempIds,casoraRoomTempOf
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-basis.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;

const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.DOMParser = class { parseFromString(t) { return { body: { textContent: t.replace(/<[^>]+>/g, ''), querySelectorAll: () => [] } }; } };
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window.casoraRoomTempOf = function');
new Function(basis.slice(b0, basis.indexOf('window.casoraThermoHistoryOf = function', b0)))();
// The Studio has no dashboard config of its own.
window._casoraLovelaceCfg = () => null;

const st = (id, state, a) => ({ entity_id: id, state, attributes: { friendly_name: id, ...a } });
const states = {
  'climate.example_living': st('climate.example_living', 'off', { current_temperature: 21.7, hvac_modes: ['off', 'heat'] }),
  'sensor.example_living_temp': st('sensor.example_living_temp', '23.3', { device_class: 'temperature', unit_of_measurement: '°C' }),
  'sensor.example_house_temp': st('sensor.example_house_temp', '22.0', { device_class: 'temperature', unit_of_measurement: '°C' }),
};
const hass = { states, entities: {}, devices: {}, areas: {}, language: 'de', locale: { language: 'de' }, formatEntityState: (s) => s.state };
const desk = [
  { path: 'home', name: 'Home', variables: { climate_entity_1: 'climate.example_living', temp_sensor_1: 'sensor.example_house_temp' } },
  { path: 'wohnzimmer', name: 'Wohnzimmer', variables: { climate_entity_1: 'climate.example_living', temp_sensor_1: 'sensor.example_living_temp' } },
];
const phone = [{ name: 'Favorites', variables: {} }, { name: 'Wohnzimmer', variables: {} }];
const temp = (rooms) => window.casoraWithStudioRooms(rooms, () => window.casoraRoomTempOf('climate.example_living', states));

assert.equal(typeof window.casoraWithStudioRooms, 'function', 'the Studio hands its rooms to the room temperature');
assert.equal(temp(desk), 23.3, 'the room sensor, not the overview\'s');
assert.equal(temp(phone), null, 'no room lists it: none (the tile reads the thermostat\'s own)');
assert.equal(window._casoraRoomTempSource, undefined, 'the Studio stand-in is removed again');
assert.equal(window.casoraRoomTempOf('climate.example_living', states), null, 'outside the preview: the dashboard\'s own rooms');

// The phone preview's tile text (template or tileStateWord) runs with the desktop rooms.
const panel = read('custom_components/casora/panel/casora-panel.js');
const at = panel.indexOf('el.querySelector(".mstate").textContent =');
const call = panel.slice(panel.lastIndexOf('const tempRooms', at), panel.indexOf('tileStateWord(kind, tile, ent', at));
assert.match(call, /_pair[^\n]*desktop[^\n]*rooms/, 'the desktop rooms of the pair');
assert.match(call, /casoraWithStudioRooms[^\n]*\(tempRooms/, 'both the template text and tileStateWord inside');
console.log('ok preview thermostat: the room temperature as on the dashboard');
