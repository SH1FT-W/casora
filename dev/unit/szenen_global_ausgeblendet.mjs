// @deckt: dashboards/casora/button_card_templates.json#casora_scene_core
// Scenes hidden in the Studio (Einstellungen › Haus & Geräte › Szenen, CASORA_SETTINGS.scenes.exclude) are offered
// nowhere: the phone's room page listed them, only the phone bar left them out (Prüfrunde u04-01).
//   node dev/unit/szenen_global_ausgeblendet.mjs
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
const states = { 'scene.beispiel_abend': scene(['light.sofa']), 'scene.film': scene(['light.sofa']), 'light.sofa': { state: 'off', attributes: {} } };
const hass = { areas: { wohnzimmer: { name: 'Wohnzimmer' } }, devices: {}, states,
  entities: { 'scene.beispiel_abend': { area_id: 'wohnzimmer' }, 'scene.film': { area_id: 'wohnzimmer' }, 'light.sofa': { area_id: 'wohnzimmer' } } };
const list = (vars) => [...SC.list(states, hass, vars)].sort();

assert.deepEqual(list({ room: 'Wohnzimmer' }), ['scene.beispiel_abend', 'scene.film'], 'nothing hidden: both');
window.CASORA_SETTINGS = { scenes: { exclude: ['scene.beispiel_abend'] } };
assert.deepEqual(list({ room: 'Wohnzimmer' }), ['scene.film'], 'hidden in the Studio: not on the room page');
assert.deepEqual(list({ scenes: ['scene.beispiel_abend', 'scene.film'] }), ['scene.film'], 'not even when a tile names it');
assert.deepEqual(list({ room: 'Wohnzimmer', scene_exclude: ['scene.film'] }), [], 'the tile\'s own list still counts');
console.log('szenen_global_ausgeblendet: ok');
