// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraLightScope custom_components/casora/panel/casora-panel.js#houseTileLightsEdit custom_components/casora/panel/casora-panel-types.js#casoraStudioHouseLights custom_components/casora/panel/casora-panel-popups.js#_cpOpen,_cpClose
// #206: a lamp renamed in HA before renames were followed stayed in a room's light badge under its old ID. The user
// added the renamed lamp to the house light tile's "Popup lights"; the tile on Home did not count it („1 an“ with two
// lamps on) while the Studio's popup preview listed it. Three causes:
//  - the house tile with a list of its own and "Group by room" took the rooms' badge lamps instead of its list;
//  - a house tile from the setup (light_rooms_auto) never reads its list, and editing the list left that marker;
//  - the Studio's popup preview had no dashboard to read the rooms from and listed the tile's own lamps.
//   node dev/unit/house_light_tile_own_list.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.addEventListener = () => {};

const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraRoomNames = function');
new Function(basis.slice(b0, basis.indexOf('window._casoraStreamOk = function', b0)))();

// A made-up house without HA light groups: three rooms, the living room's badge still lists the lamp's old ID.
const h = { states: {}, entities: {}, devices: {}, areas: { wz: { area_id: 'wz', name: 'Wohnzimmer' }, ke: { area_id: 'ke', name: 'Keller' } } };
const S = h.states;
const lamp = (id, on, area) => {
  S[id] = { entity_id: id, state: on ? 'on' : 'off', attributes: { friendly_name: id.split('.')[1] } };
  h.entities[id] = { entity_id: id, area_id: area || null, device_id: null };
};
lamp('light.demo_wz_new', true, 'wz'); lamp('light.demo_wz_2', false, 'wz');
lamp('light.demo_ku_1', true); lamp('light.demo_ku_2', false); lamp('light.demo_bad_1', false);
lamp('light.demo_keller', false, 'ke'); lamp('light.demo_lose', false);
const studioRooms = [
  { name: 'Home', path: 'home', variables: { light_rooms_auto: true } },
  { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { light_entity_1: 'light.demo_wz_old', light_entity_2: 'light.demo_wz_2' } },
  { name: 'Küche', path: 'kueche', variables: { light_entity_1: 'light.demo_ku_1', light_entity_2: 'light.demo_ku_2' } },
  { name: 'Bad', path: 'bad', variables: { light_entity_1: 'light.demo_bad_1' } },
];
const cfg = { views: studioRooms.map((r) => ({ title: r.name, path: r.path, cards: [{ type: 'custom:button-card', template: 'casora_room', name: r.name, variables: r.variables }] })) };
const dash = (c) => { window._casoraLovelaceCfg = () => c; delete window._casoraHouseLightsC; delete window._casoraHomeLightC; delete window._casoraRoomOfCfg; };
const ROOMS5 = ['light.demo_wz_new', 'light.demo_wz_2', 'light.demo_ku_1', 'light.demo_ku_2', 'light.demo_bad_1'];
const tileEnt = S['light.demo_ku_1'];
const popupVars = { group_rooms: true, initial_filter: -1, popup_group: null, room_name: null };
const tally = (v) => window.casoraLightTally(tileEnt, S, h, v);
const roomsOf = (v) => (window._casoraLightScope(tileEnt, S, h, v).rooms || []).map((r) => r.name + ':' + r.lights.join(','));

// (a) The user's own list (no light_rooms_auto): the rooms' lamps plus the listed lamps no room holds.
dash(cfg);
{
  const v = { ...popupVars, house: true, lights: ROOMS5 };
  assert.deepEqual(tally(v), { kind: 'lamps', tot: 5, on: 2 }, 'tile counts the listed lamp no room badge holds (was 4 lamps, 1 on)');
  assert.equal(window.casoraLightTallyText(tally(v)), '2 an');
  // The dashboard popup (lpc_init reads the same scope): the lamp stands in the room of its HA area.
  assert.deepEqual(roomsOf(v), ['Wohnzimmer:light.demo_wz_2,light.demo_wz_new', 'Küche:light.demo_ku_1,light.demo_ku_2', 'Bad:light.demo_bad_1'], 'popup: under its room');
  const sc = window._casoraLightScope(tileEnt, S, h, v);
  assert.deepEqual(sc.lightIds.slice().sort(), ROOMS5.slice().sort(), 'popup lists what the tile counts, each lamp once');
  // A dead ID never counts; an area without a room is a room of that name; a lamp without an area a room of its own.
  const w = { ...popupVars, house: true, lights: ROOMS5.concat('light.demo_wz_old', 'light.demo_keller', 'light.demo_lose', 'light.demo_wz_new') };
  assert.equal(tally(w).tot, 7, 'dead ID out, no lamp twice');
  assert.deepEqual(roomsOf(w).slice(3), ['Keller:light.demo_keller', 'demo_lose:light.demo_lose']);
  // The rooms stay: a lamp of a room that the list leaves out still counts (the house follows the rooms).
  assert.equal(tally({ ...popupVars, house: true, lights: ['light.demo_wz_new', 'light.demo_ku_1'] }).tot, 5);
  // "Group by room" off: the list as it is, as before.
  assert.equal(tally({ ...popupVars, group_rooms: false, house: true, lights: ROOMS5 }).tot, 5);
}
console.log('ok house tile with its own list: listed lamps beside the rooms\'');

// (b) The setup's tile (light_rooms_auto): follows the rooms, its list is not read – unchanged.
{
  const v = { ...popupVars, house: true, light_rooms_auto: true, lights: ROOMS5 };
  assert.deepEqual(tally(v), { kind: 'lamps', tot: 4, on: 1 }, 'setup tile: the rooms\' lamps only');
  assert.deepEqual(roomsOf(v), ['Wohnzimmer:light.demo_wz_2', 'Küche:light.demo_ku_1,light.demo_ku_2', 'Bad:light.demo_bad_1']);
}
console.log('ok setup tile follows the rooms');

// (c) Studio: editing "Popup lights" on a house tile makes the list the user's (marker gone) – in the draft, saved
// with the next save like every edit.
const panel = read('custom_components/casora/panel/casora-panel.js');
{
  const m = panel.match(/function houseTileLightsEdit\(V, key, items\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'houseTileLightsEdit');
  const edit = new Function(m[0] + 'return houseTileLightsEdit;')();
  const V = { house: true, light_rooms_auto: true, lights: ROOMS5 };
  edit(V, 'lights', ROOMS5);
  assert.equal('light_rooms_auto' in V, false, 'edited list: marker gone');
  assert.equal(tally({ ...popupVars, ...V }).tot, 5, 'the dashboard then counts the listed lamp');
  const E = { house: true, light_rooms_auto: true };
  edit(E, 'lights', []);
  assert.equal(E.light_rooms_auto, true, 'emptied list: follows the rooms');
  const R = { light_rooms_auto: true, lights: ['light.demo_wz_2'] };
  edit(R, 'lights', R.lights);
  assert.equal(R.light_rooms_auto, true, 'not a house tile: untouched');
  const O = { house: true, light_rooms_auto: true };
  edit(O, 'popup_group', ['x']);
  assert.equal(O.light_rooms_auto, true, 'another field: untouched');
  assert.ok(/tile\.variables\[f\.key\] = items; \}\n\s*else if \(tile\.variables\) delete tile\.variables\[f\.key\];\n\s*houseTileLightsEdit\(tile\.variables, f\.key, items\);/.test(panel),
    'the tile form\'s list field calls it');
}
console.log('ok Studio: an edited list is the user\'s');

// (d) Studio popup preview: no dashboard config there – the rooms being edited stand in while the preview is open,
// so preview tile and preview popup say what the dashboard says.
{
  const isHomeRoom = (room, rooms) => !!room && (room.path === 'home' || (Array.isArray(rooms) && rooms[0] === room && !rooms.some((r) => r && r.path === 'home')));
  window.__casoraPanelInternals = { TILE_TYPES: [{ id: 'light', template: 'casora_light' }], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom };
  new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
  const types = read('custom_components/casora/panel/casora-panel-types.js');
  const t0 = types.indexOf('  const studioHouse = '), t1 = types.indexOf('  window.casoraTileState = ');
  assert.ok(t0 > -1 && t1 > t0, 'house readers in casora-panel-types.js');
  const variants = [{ ...popupVars, house: true, lights: ROOMS5 }, { ...popupVars, house: true, light_rooms_auto: true, lights: ROOMS5 }];
  const onDash = variants.map((v) => [tally(v), roomsOf(v)]);
  dash(null); // the Studio: no dashboard
  const real = window._casoraHouseLights, realHome = window._casoraHomeLightVars;
  new Function(types.slice(t0, t1))();
  assert.equal(typeof (window.casoraStudioHouseLights || {}).on, 'function', 'casoraStudioHouseLights');
  let open = true;
  window.casoraStudioHouseLights.on(() => (open ? studioRooms : null));
  variants.forEach((v, i) => assert.deepEqual([tally(v), roomsOf(v)], onDash[i], 'preview popup = dashboard (variant ' + i + ')'));
  // Home is no room of the house, as on the dashboard (its first view).
  assert.equal(window._casoraHouseLights(h).rooms.length, 3);
  // A preview that went away without off(): the readers answer as before.
  open = false;
  assert.deepEqual(window._casoraHouseLights(h), real(h));
  window.casoraStudioHouseLights.off();
  assert.equal(window._casoraHouseLights, real, 'restored');
  assert.equal(window._casoraHomeLightVars, realHome, 'restored');
  const pop = read('custom_components/casora/panel/casora-panel-popups.js');
  const o0 = pop.indexOf('P._cpOpen = async function'), c0 = pop.indexOf('P._cpClose = function');
  assert.ok(o0 > -1 && c0 > o0);
  const openSrc = pop.slice(o0, c0);
  assert.ok(openSrc.indexOf('casoraStudioHouseLights.on(') > -1 && openSrc.indexOf('casoraStudioHouseLights.on(') < openSrc.indexOf('this._cpConfig(target)'),
    'the preview swaps the readers before it builds the popup');
  assert.ok(pop.slice(c0, c0 + 1200).includes('casoraStudioHouseLights.off()'), 'and gives them back when it closes');
}
console.log('ok Studio popup preview reads the rooms being edited');
console.log('house_light_tile_own_list: ok');
