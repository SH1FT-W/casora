// Scenes popup v3 (prod test 01.11.2026, 08-weich-szenen.js + casora_popup_scenes):
//  - every scene shows its own symbol: the Studio's (scene_icons), then HA's (entity registry, then the state), else
//    mdi:palette-outline – not one palette for all when there are symbols;
//  - the head has a label: the room, else „Zuhause“, above the title „Szenen“.
//   node dev/unit/szenen_v3.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const hass = { entities: { 'scene.abend': { icon: 'mdi:weather-sunset' }, 'scene.morgen': {} } };
const win = { customIcons: { hue: {} } };
const box = { window: win, document: { querySelector: (s) => (s === 'home-assistant' ? { hass } : null) }, console };
vm.createContext(box);
vm.runInContext(fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/08-weich-szenen.js', 'utf8'), box);
const Z = win._casoraScenesSoft;
const states = {
  'scene.abend': { attributes: { icon: 'mdi:palette' } },
  'scene.morgen': { attributes: { icon: 'mdi:weather-sunny' } },
  'scene.kino': { attributes: { icon: 'hue:scene-relax' } },
  'scene.party': { attributes: { icon: 'fa:zzz' } },
  'scene.leer': { attributes: {} },
};
const ic = (id, V) => JSON.parse(JSON.stringify(Z.iconOf(id, states, V || {})));
assert.deepEqual(ic('scene.abend'), { icon: 'mdi:weather-sunset' }, 'registry before the state');
assert.deepEqual(ic('scene.morgen'), { icon: 'mdi:weather-sunny' }, 'the state\'s icon');
assert.deepEqual(ic('scene.kino'), { icon: 'hue:scene-relax' }, 'an installed icon set without an MDI match');
states['scene.nacht'] = { attributes: { icon: 'ios:moon-stars' } }; states['scene.tv'] = { attributes: { icon: 'ios:appletv-fill' } };
assert.deepEqual(ic('scene.nacht'), { icon: 'mdi:weather-night' }, 'another set mapped to MDI by name');
assert.deepEqual(ic('scene.tv'), { icon: 'mdi:television' });
assert.deepEqual(ic('scene.party'), { icon: 'mdi:palette-outline' }, 'unknown set: the calm default');
assert.deepEqual(ic('scene.leer'), { icon: 'mdi:palette-outline' }, 'no symbol: the calm default');
assert.deepEqual(ic('scene.leer', { icons: { 'scene.leer': 'mdi:sofa' } }), { icon: 'mdi:sofa' }, 'the Studio\'s choice first');
assert.deepEqual(ic('scene.leer', { icons: { 'scene.leer': '/local/x.svg' } }), { url: '/local/x.svg' }, 'a picture as a mask');
assert.deepEqual(ic('scene.leer', { icons: { 'scene.leer': 'javascript:alert(1)' } }), { icon: 'mdi:palette-outline' }, 'nothing else');
// Studio icons: the tile's own first, then the dashboard's scene row.
win._casoraLovelaceCfg = () => ({ button_card_templates: { casora_scene_row: { variables: { scene_icons: { 'scene.a': 'mdi:a', 'scene.b': 'mdi:b' } } } } });
assert.deepEqual(JSON.parse(JSON.stringify(Z.studioIcons({ scene_icons: { 'scene.a': 'mdi:own' } }))), { 'scene.a': 'mdi:own', 'scene.b': 'mdi:b' });

// The stage draws each tile with its own symbol.
win._casoraSC = { activeList: () => [] };
win._casoraUI = { stage: (t, o) => o.html, more: () => '' };
const html = Z.v3sec('stage', { ids: ['scene.abend', 'scene.morgen', 'scene.leer'], icons: {} }, states);
assert.match(html, /icon="mdi:weather-sunset"[\s\S]*icon="mdi:weather-sunny"[\s\S]*icon="mdi:palette-outline"/);

// Head: label room / „Zuhause“, title „Szenen“.
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const body = T.casora_popup_scenes.tap_action.casora_popup.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
const w2 = { _casoraSoft: () => true, casoraPopup: {}, _casoraScenesSoft: { popup: () => ({}), v3: () => true } };
const head = (room) => new Function('entity', 'variables', 'states', 'hass', 'window', body)(null, { room_name: room }, {}, null, w2);
assert.equal(head('Wohnzimmer').eyebrow, 'Wohnzimmer'); assert.equal(head('Wohnzimmer').title, 'Szenen');
assert.equal(head('Home').eyebrow, 'Zuhause'); assert.equal(head('Home').title, 'Szenen');
console.log('ok szenen_v3');
