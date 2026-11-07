// User test, 07.11.2026: on Home the light badge said „Beleuchtung 1 an“ (popup „1 von 10 Lampen an“, 7 rooms) and the
// house tile right below „Beleuchtung 3 an“ (popup „3 von 16 Lampen an“, 10 rooms with a utility room and the hub
// groups). The house has an HA group over everything that also holds lamps in no room of the dashboard (a hub's
// group, a group in no area): the Studio put that group with the rooms listed beside it on the badge (badgesOf: a
// larger group only beside the ticked rooms), but the tile on the bare group (groupTile). Now the house tile is the
// badge (window._casoraHomeLightVars): the same lamps, the same count, the same rooms in the popup – in the Studio's
// preview too.
//   node dev/unit/house_light_tile_follows_badge.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.innerWidth = 1200;
globalThis.addEventListener = () => {};

const isHomeRoom = (room, rooms) => !!room && (room.path === 'home' || (Array.isArray(rooms) && rooms[0] === room && !rooms.some((r) => r && r.path === 'home')));
window.__casoraPanelInternals = { TILE_TYPES: [{ id: 'light', template: 'casora_light' }], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraRoomNames = function');
new Function(basis.slice(b0, basis.indexOf('window._casoraStreamOk = function', b0)))();

// A made-up house: four areas with a room group each, a hub's group whose lamps sit in no area, a group in no area
// whose lamp HA does not know, and one HA group over all of them.
const h = { states: {}, entities: {}, devices: {}, areas: {} };
const AREAS = { wz: 'Wohnzimmer', ku: 'Küche', bad: 'Bad', flur: 'Flur' };
for (const [id, name] of Object.entries(AREAS)) h.areas[id] = { area_id: id, name };
const light = (id, area, name, on, members) => {
  h.entities[id] = { entity_id: id, device_id: null, area_id: area, platform: members ? 'group' : 'template' };
  h.states[id] = { entity_id: id, state: on ? 'on' : 'off', attributes: { friendly_name: name, supported_color_modes: ['brightness'], ...(members ? { entity_id: members } : {}) } };
};
const rooms = {};
for (const a of Object.keys(AREAS)) {
  const lamps = [1, 2].map((i) => 'light.demo_' + a + '_' + i);
  lamps.forEach((id, i) => light(id, a, AREAS[a] + ' ' + (i + 1), a === 'ku' && i === 0));
  light('light.demo_' + a, null, AREAS[a], false, lamps);
  rooms[a] = lamps;
}
light('light.demo_hub_1', null, 'Werkbank', true);
light('light.demo_hub_2', null, 'Spots', true);
light('light.demo_hub', null, 'Hub-Lampen', true, ['light.demo_hub_1', 'light.demo_hub_2']);
light('light.demo_hwr', null, 'Hauswirtschaftsraum', false, ['light.demo_hwr_strip']);
light('light.demo_alle', null, 'Beleuchtung', true, Object.keys(AREAS).map((a) => 'light.demo_' + a).concat('light.demo_hub', 'light.demo_hwr'));
for (const k of Object.keys(h.states)) h.states[k].attributes.brightness = h.states[k].state === 'on' ? 128 : null;

// Setup: Studio plan → rooms, Home badge, tiles (the real code).
const NAMES = Object.values(AREAS);
const p = B.plan(h, NAMES, { ...B.DEFAULTS });
const { tiles, vars } = B.tilesOf(p, h);
const sr = [{ name: 'Home', path: 'home', tiles: tiles.Home, variables: { ...vars.Home } }]
  .concat(NAMES.map((n) => ({ name: n, path: n.toLowerCase(), tiles: tiles[n], variables: { ...vars[n] } })));
const cfg = { views: sr.map((r) => ({ title: r.name, path: r.path, cards: [{ type: 'custom:button-card', template: 'casora_room', name: r.name, variables: r.variables }, ...r.tiles] })) };
window._casoraLovelaceCfg = () => cfg;
const H = sr[0].variables;
const tile = sr[0].tiles.find((t) => [].concat(t.template).includes('casora_light'));
// The reported setup: the larger group with the rooms beside it on the badge, the tile on the bare group.
assert.equal(H.light_group_entity, 'light.demo_alle', 'Home badge: the house group');
assert.ok(H.light_entity_1, 'Home badge: the rooms listed beside it');
assert.ok(tile && tile.entity === 'light.demo_alle' && tile.variables.house === true, 'house tile on the group');

// The badge as casora_room hands it over (casora_badge_light_group: entity_N), the tile with its popup's defaults.
const badgeVars = { group_rooms: true, lights: [], popup_group: null, light_group_entity: H.light_group_entity, light_rooms_auto: H.light_rooms_auto === true };
for (let i = 1; i <= 10; i++) badgeVars['entity_' + i] = H['light_entity_' + i] || null;
const tileVars = { group_rooms: true, lights: [], popup_group: null, ...tile.variables };
const S = h.states;
const badge = window.casoraLightTally(null, S, h, badgeVars);
const tl = window.casoraLightTally(S[tile.entity], S, h, tileVars);
assert.deepEqual(badge, { kind: 'lamps', tot: 8, on: 1 }, 'badge: the four rooms\' eight lamps, the kitchen lamp on');
assert.deepEqual(tl, badge, 'house tile counts what the badge counts (was 3 of 11 – the hub\'s lamps, the utility room)');
const ids = (e, v) => window._casoraLightTallyIds(e, S, h, v).slice().sort();
assert.deepEqual(ids(S[tile.entity], tileVars), ids(null, badgeVars), 'the same lamps');
// The popup: the same rooms (lpc_init reads _casoraLightScope with the opener's variables).
const roomsOf = (e, v) => (window._casoraLightScope(e, S, h, v).rooms || []).map((r) => r.name + ':' + r.lights.length);
assert.deepEqual(roomsOf(S[tile.entity], tileVars), roomsOf(null, badgeVars), 'the same rooms in the popup');
assert.equal(roomsOf(null, badgeVars).length, 4);
// The popup the badge opened carries the resolved rooms (house_rooms): it stays as it is.
const opened = window._casoraLightScope(null, S, h, badgeVars).variables;
assert.deepEqual(roomsOf(S[opened.popup_group], { group_rooms: true, ...opened }), roomsOf(null, badgeVars), 'popup of the badge unchanged');
console.log('ok house tile = Home badge (group with rooms beside it)');

// Exact group on Home (no rooms beside it): tile and badge already agreed, still do.
{
  const V = { light_group_entity: 'light.demo_alle' };
  window._casoraLovelaceCfg = () => ({ views: [{ cards: [{ template: 'casora_room', variables: V }] }, { cards: [] }] });
  delete window._casoraHomeLightC;
  const bv = { group_rooms: true, lights: [], popup_group: null, light_group_entity: 'light.demo_alle' };
  assert.deepEqual(window.casoraLightTally(S['light.demo_alle'], S, h, tileVars), window.casoraLightTally(null, S, h, bv), 'group alone');
  assert.equal(window.casoraLightTally(null, S, h, bv).tot, 11);
}
// A badge switched off or no Home header: the tile keeps its own group.
{
  window._casoraLovelaceCfg = () => ({ views: [{ cards: [{ template: 'casora_room', variables: { ...H, show_lights: false } }] }, { cards: [] }] });
  delete window._casoraHomeLightC;
  assert.equal(window.casoraLightTally(S['light.demo_alle'], S, h, tileVars).tot, 11, 'badge off: the tile\'s own group');
  window._casoraLovelaceCfg = () => null;
  delete window._casoraHomeLightC;
  assert.equal(window.casoraLightTally(S['light.demo_alle'], S, h, tileVars).tot, 11, 'no dashboard: the tile\'s own group');
}
// On the phone: Home's variables from the server (casoraPhoneRoom.home).
{
  window._casoraLovelaceCfg = () => ({ views: [{ cards: [] }] });
  delete window._casoraHomeLightC;
  window.casoraPhoneRoom = { home: () => H, rooms: () => sr.slice(1).map((r) => ({ name: r.name, vars: r.variables })) };
  assert.deepEqual(window.casoraLightTally(S['light.demo_alle'], S, h, tileVars), badge, 'phone: the same count');
  delete window.casoraPhoneRoom;
}
// Studio preview (casora-panel-types.js withHouseLights): Home's variables being edited.
{
  const src = read('custom_components/casora/panel/casora-panel-types.js');
  const m = src.match(/const withHouseLights = [\s\S]*?\n  };\n/);
  assert.ok(m, 'withHouseLights');
  window._casoraLovelaceCfg = () => null;
  delete window._casoraHomeLightC;
  const withHouseLights = new Function(m[0] + 'return withHouseLights;')();
  const t = withHouseLights(sr, () => window.casoraLightTally(S['light.demo_alle'], S, h, tileVars));
  assert.deepEqual(t, badge, 'Studio preview: the same count');
  assert.equal(typeof window._casoraHomeLightVars, 'function', 'restored after the preview');
}
// button-card hands templates its variables as a proxy that evaluates each one on read; the tile's own
// active_override calls _casoraLightScope again, so reading every variable (Object.assign) is a loop
// („Detected a loop while evaluating variable active_override“, gate 07.11.2026, r316): the tile showed an error card.
{
  window._casoraLovelaceCfg = () => cfg;
  delete window._casoraHomeLightC;
  const own = { ...tileVars, light_rooms_auto: true, lights: [tile.entity], active_override: null };
  const proxied = new Proxy(own, { get: (o, k) => { if (k === 'active_override') throw new Error('loop: active_override'); return o[k]; },
    getOwnPropertyDescriptor: (o, k) => Object.getOwnPropertyDescriptor(o, k) });
  assert.deepEqual(window.casoraLightTally(S[tile.entity], S, h, proxied), badge, 'proxied variables: no other variable read');
  // The popup carries on with the scope's variables (lpc_init: variables = _sc.variables): the opener's own keys
  // must still be there, read when asked (r316: the tile's popup lost its house switch and rooms).
  const sv = window._casoraLightScope(S[tile.entity], S, h, new Proxy({ ...own, popup_title: 'Beleuchtung', house_switch: true },
    { get: (o, k) => { if (k === 'active_override') throw new Error('loop: active_override'); return o[k]; } })).variables;
  assert.equal(sv.popup_title, 'Beleuchtung', 'the opener\'s other variables stay readable');
  assert.equal(sv.house_switch, true);
  assert.equal(sv.light_group_entity, H.light_group_entity, 'the badge\'s variables win');
  assert.notDeepEqual(sv.lights, [tile.entity], 'the tile\'s own list is replaced by the rooms\' lamps');
  sv.popup_title = 'X';
  assert.equal(sv.popup_title, 'X', 'the popup can still set a variable');
}
console.log('house_light_tile_follows_badge: ok');
