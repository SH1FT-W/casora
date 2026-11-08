// Issue #142: a scene assigned to the living room also showed on the page of any other room holding one of the devices
// it switches. A scene with an area of its own shows only there; a scene without one still follows its devices.
//   node dev/unit/scene_own_area.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = T.casora_scene_core.variables.casora_scene_core_guard.value.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
globalThis.sessionStorage = globalThis.localStorage;
const window = globalThis.window = globalThis;
globalThis.document = globalThis.document || { querySelector: () => null, addEventListener: () => {} };
globalThis.addEventListener = globalThis.addEventListener || (() => {});
new Function('hass', 'states', 'variables', body)({}, {}, {});
const SC = window._casoraSC;

const scene = (targets) => ({ state: '2026-11-08T07:00:00+00:00', attributes: { entity_id: targets } });
const states = {
  'scene.tv': scene(['light.sofa', 'light.boiler_room']),
  'scene.free': scene(['light.boiler_room']),
  'scene.elsewhere': scene(['light.sofa']),
  'light.sofa': { state: 'off', attributes: {} },
  'light.boiler_room': { state: 'off', attributes: {} },
};
const hass = {
  areas: { wohnzimmer: { name: 'Wohnzimmer' }, wartung: { name: 'Wartung' } },
  devices: {},
  entities: {
    'scene.tv': { area_id: 'wohnzimmer' },
    'scene.free': {},
    'scene.elsewhere': {},
    'light.sofa': { area_id: 'wohnzimmer' },
    'light.boiler_room': { area_id: 'wartung' },
  },
  states,
};
const list = (room) => [...SC.list(states, hass, { room })].sort();

assert.deepEqual(list('Wartung'), ['scene.free'], 'a scene assigned elsewhere stays out, one without an area follows its device');
assert.deepEqual(list('Wohnzimmer'), ['scene.elsewhere', 'scene.tv'], 'its own room shows it');

// #142 follow-up: a room without an area of that name only guesses one from its tiles. A catch-all room ("Wartung") with
// one tile from the living room is not the living room; a renamed room whose tiles mostly sit in one area still is.
const guess = { ...states, 'sensor.dsl': { state: '1', attributes: {} }, 'sensor.a': { state: '1', attributes: {} }, 'sensor.b': { state: '1', attributes: {} } };
const hg = { ...hass, states: guess, entities: { ...hass.entities, 'sensor.dsl': { area_id: 'wohnzimmer' }, 'sensor.a': {}, 'sensor.b': { area_id: 'wartung' }, 'light.lounge': { area_id: 'wohnzimmer' } } };
const inRoom = (room_entities) => [...SC.list(guess, hg, { room: 'Sammelraum', room_entities })].sort();
assert.ok(!inRoom(['sensor.dsl', 'sensor.a', 'sensor.b']).includes('scene.tv'), 'one tile of three in the living room does not make it the living room');
assert.ok(!inRoom(['sensor.dsl', 'sensor.b']).includes('scene.tv'), 'a tie between areas guesses nothing');
assert.ok(inRoom(['sensor.dsl', 'light.sofa', 'sensor.a']).includes('scene.tv'), 'most tiles in the living room: a renamed living room shows its scene');
assert.ok(inRoom(['sensor.dsl']).includes('scene.tv'), 'a single tile is all of the room');
console.log('scene_own_area: ok');
