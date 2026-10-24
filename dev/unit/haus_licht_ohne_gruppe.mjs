// Home's lights without an HA light group covering the house (24.10.2026): "Start fresh" listed the first ten
// lights on the Home badge (light_entity_1…10), the rest went missing, the house popup had no room bar and its
// main switch turned everything off without asking, the "Beleuchtung" tile on Home opened a flat list. Now the
// badge and the tile carry light_rooms_auto: the dashboard derives the house list live from the rooms' light badges
// (window._casoraHouseLights, same rule as casoraBasis.houseLights in the Studio), the popup builds its room bar
// from them, the main switch asks "Alle N Lichter im Haus ausschalten?". With an HA group nothing changes.
// Existing dashboards: the Studio switches a Home badge that holds exactly Casora's ten-slot pick; a user's list stays.
//   node dev/unit/haus_licht_ohne_gruppe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const P = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
assert.ok(JSON.stringify(P.casora_badge_light_group).includes('light_rooms_auto'), 'built templates carry the marker');

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.innerWidth = 1200;
globalThis.addEventListener = () => {};
window.casoraIconUrl = (n) => '/casora_assets/icons/' + n + '.svg';

// Real code: setup plan (Studio), room lookup + house list (dashboard), soft light popup, light popup (LPC).
const isHomeRoom = (room, rooms) => !!room && (room.path === 'home' || (Array.isArray(rooms) && rooms[0] === room && !rooms.some((r) => r && r.path === 'home')));
window.__casoraPanelInternals = { TILE_TYPES: [{ id: 'light', template: 'casora_light' }], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraRoomNames = function');
new Function(basis.slice(b0, basis.indexOf('window._casoraStreamOk = function', b0)))();
const pop = read('custom_components/casora/scripts/local/03-popups.js');
const p0 = pop.lastIndexOf('(function () {', pop.indexOf('if (window._casoraLightSoft) return;'));
new Function(pop.slice(p0, pop.indexOf('\n})();', p0) + 6))();
const LS = window._casoraLightSoft;
let softCfg = null;
const cards0 = LS.cards;
LS.cards = (cfg, ...rest) => { softCfg = cfg; return cards0(cfg, ...rest); };
new Function('entity', 'states', 'hass', 'variables', T.casora_popup_light.custom_fields.lpc_init.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(null, {}, null, {});
// Studio: the migration of existing dashboards (module functions of casora-panel.js).
const panelSrc = read('custom_components/casora/panel/casora-panel.js');
const mig = panelSrc.match(/const LIGHT_SLOTS = [\s\S]*?\nfunction homeLightsEdit[\s\S]*?\n}\n/);
assert.ok(mig, 'fillHomeLights in casora-panel.js');
const { fillHomeLights, homeLightsEdit } = new Function('window', 'isHomeRoom', mig[0] + '\nreturn { fillHomeLights, homeLightsEdit };')(window, isHomeRoom);

const js = (s) => String(s).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (expr, variables, h, entity) => new Function('variables', 'hass', 'states', 'entity', 'user', js(expr))(variables, h, h.states, entity || null, null);

// A made-up house: four areas, twelve lights, Bad's two behind one HA group (the room's lights), no group over the house.
function house({ houseGroup = false } = {}) {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['wz', 'Wohnzimmer'], ['ku', 'Küche'], ['bad', 'Bad'], ['flur', 'Flur']]) h.areas[id] = { area_id: id, name };
  const light = (id, area, name, on, members) => {
    h.entities[id] = { entity_id: id, device_id: null, area_id: area, platform: members ? 'group' : 'template' };
    h.states[id] = { entity_id: id, state: on ? 'on' : 'off', attributes: { friendly_name: name, supported_color_modes: ['brightness'], brightness: on ? 128 : null, ...(members ? { entity_id: members } : {}) } };
  };
  ['Decke', 'Leselampe', 'Vitrine'].forEach((n, i) => light('light.demo_wz_' + (i + 1), 'wz', n, i === 0));
  ['Spots', 'Theke', 'Dunstabzug'].forEach((n, i) => light('light.demo_ku_' + (i + 1), 'ku', n, i < 2));
  ['Spiegel', 'Decke'].forEach((n, i) => light('light.demo_bad_' + (i + 1), 'bad', n, false));
  light('light.demo_bad_alle', 'bad', 'Bad', false, ['light.demo_bad_1', 'light.demo_bad_2']);
  ['Garderobe', 'Treppe', 'Nische', 'Keller'].forEach((n, i) => light('light.demo_flur_' + (i + 1), 'flur', n, i === 3));
  if (houseGroup) light('light.demo_alle', null, 'Alle Lampen', true, Object.keys(h.states).filter((id) => id !== 'light.demo_bad_1' && id !== 'light.demo_bad_2'));
  return h;
}
const AREAS = ['Wohnzimmer', 'Küche', 'Bad', 'Flur'];
const ALL = ['light.demo_wz_1', 'light.demo_wz_2', 'light.demo_wz_3', 'light.demo_ku_1', 'light.demo_ku_2', 'light.demo_ku_3',
  'light.demo_bad_1', 'light.demo_bad_2', 'light.demo_flur_1', 'light.demo_flur_2', 'light.demo_flur_3', 'light.demo_flur_4'];
const same = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
const listed = (V) => Array.from({ length: 10 }, (_, i) => V['light_entity_' + (i + 1)]).filter(Boolean);

// Setup → Studio rooms and the dashboard config they become.
function setup(h) {
  const p = B.plan(h, AREAS, { ...B.DEFAULTS });
  const { tiles, vars } = B.tilesOf(p, h);
  const rooms = [{ name: 'Home', path: 'home', tiles: tiles.Home, variables: { ...vars.Home } }]
    .concat(AREAS.map((n) => ({ name: n, path: n.toLowerCase(), tiles: tiles[n], variables: { ...vars[n] } })));
  const cfg = { views: rooms.map((r) => ({ title: r.name, path: r.path,
    cards: [{ type: 'custom:button-card', template: 'casora_room', name: r.name, variables: r.variables }, ...r.tiles] })) };
  return { rooms, cfg, tile: rooms[0].tiles.find((t) => t.template === 'casora_light') };
}
const useDash = (cfg) => { window._casoraLovelaceCfg = () => cfg; delete window._casoraHouseLightsC; delete window._casoraRoomOfCfg; };

// ── 1. Without a group: marker instead of slots, with a group: as before ────────────────────────
const h = house();
const { rooms, cfg, tile } = setup(h);
const H = rooms[0].variables;
assert.equal(H.light_rooms_auto, true, 'Home badge follows the rooms');
assert.deepEqual(listed(H), [], 'no ten slots on Home');
assert.equal(H.light_group_entity, undefined, 'no group');
assert.ok(tile && tile.variables.house === true && tile.variables.light_rooms_auto === true, 'house tile marked');
assert.equal(tile.entity, 'light.demo_wz_1', 'house tile: first light as before');
same(tile.variables.lights, ALL.filter((id) => !/demo_bad_\d/.test(id)).concat('light.demo_bad_alle')); // the setup's units (Bad as its group)
assert.deepEqual(listed(rooms[3].variables), ['light.demo_bad_alle'], 'Bad: its group is the room badge');

const hg = house({ houseGroup: true });
const withGroup = setup(hg);
assert.equal(withGroup.rooms[0].variables.light_group_entity, 'light.demo_alle', 'with a group: the group');
assert.equal(listed(withGroup.rooms[0].variables).length, 10, 'with a group: ten slots as before');
assert.equal(withGroup.rooms[0].variables.light_rooms_auto, undefined, 'with a group: no marker');
assert.equal(withGroup.tile.entity, 'light.demo_alle', 'with a group: the tile is the group');
assert.equal(withGroup.tile.variables.light_rooms_auto, undefined);
console.log('ok setup: marker without a group, group as before');

// ── 2. The house list: Studio and dashboard agree, every light, rooms with their group or lamps ──
const studioList = B.houseLights(h, rooms.slice(1));
same(studioList.ids, ALL);
assert.deepEqual(studioList.rooms.map((r) => [r.name, r.rid, r.lights.length]),
  [['Wohnzimmer', null, 3], ['Küche', null, 3], ['Bad', 'light.demo_bad_alle', 2], ['Flur', null, 4]], 'rooms: group where the room has one');
assert.equal(studioList.subs.length, 11, 'sub-badges: Bad as its group, the others per lamp');
useDash(cfg);
const dashList = window._casoraHouseLights(h);
assert.deepEqual(dashList, studioList, 'dashboard derives the same list from the config');
// A badge switched off in a room does not count; a lamp that comes later counts.
const r2 = JSON.parse(JSON.stringify(rooms));
r2[2].variables.show_lights = false;
r2[4].variables.light_entity_5 = 'light.demo_flur_neu';
h.states['light.demo_flur_neu'] = { entity_id: 'light.demo_flur_neu', state: 'on', attributes: {} };
const l2 = B.houseLights(h, r2.slice(1));
assert.ok(!l2.ids.includes('light.demo_ku_1') && l2.ids.includes('light.demo_flur_neu'), 'switched-off room out, new lamp in');
assert.deepEqual(window._casoraHouseLightsOf(r2.slice(1).map((r) => ({ name: r.name, vars: r.variables })), h.states), l2);
delete h.states['light.demo_flur_neu'];
// A room with several slots, one of them a group (Bad: its group plus a lamp of the hall): the group counts as its
// members, a lamp listed in two rooms once – the badge counted the group as one lamp and the hall lamp twice.
{
  const r3 = JSON.parse(JSON.stringify(rooms));
  r3[3].variables.light_entity_2 = 'light.demo_flur_1';
  const l3 = B.houseLights(h, r3.slice(1));
  same(l3.ids, ALL);
  const bad = l3.rooms.find((r) => r.name === 'Bad');
  assert.deepEqual([bad.rid, bad.lights], [null, ['light.demo_bad_1', 'light.demo_bad_2', 'light.demo_flur_1']], 'Bad: members instead of the group');
  assert.ok(!l3.ids.includes('light.demo_bad_alle'), 'the group itself is no lamp');
  assert.ok(l3.subs.includes('light.demo_bad_alle') && !l3.subs.includes('light.demo_bad_1'), 'sub-badge row keeps the group as one entry');
  assert.deepEqual(window._casoraHouseLightsOf(r3.slice(1).map((r) => ({ name: r.name, vars: r.variables })), h.states), l3, 'dashboard agrees');
}
// Phone: one view without room cards – the desktop rooms come from the server (casoraPhoneRoom.rooms).
useDash({ views: [{ cards: [{ type: 'custom:button-card', template: 'casora_mobile_header', name: 'Zuhause' }] }] });
window.casoraPhoneRoom = { rooms: () => rooms.slice(1).map((r) => ({ name: r.name, vars: r.variables })) };
same(window._casoraHouseLights(h).ids, ALL);
delete window.casoraPhoneRoom;
useDash(cfg);
console.log('ok house list: ' + ALL.length + ' lights from ' + studioList.rooms.length + ' rooms');

// ── 3. The badge counts all of them; the room's badge entry passes the marker ───────────────────
const bg = T.casora_badge_light_group;
const autoVars = { enabled: true, light_rooms_auto: true };
assert.match(run(bg.name, autoVars, h), /4 An/, 'badge counts the rooms\' lights (4 of 12 on)');
const style = (k) => bg.styles.card.find((d) => k in d)[k];
assert.equal(run(style('display'), autoVars, h), 'inline-grid', 'badge visible with the marker alone');
assert.equal(run(style('--casora-badge-tone'), autoVars, h), 'initial', 'icon lit');
assert.match(run(bg.extra_styles, autoVars, h), /display:inline-block/);
assert.equal(run(style('display'), { enabled: true }, h), 'none', 'without anything: hidden as before');
assert.match(run(bg.name, { enabled: true, entity_1: 'light.demo_wz_1', entity_2: 'light.demo_wz_2' }, h), /1 An/, 'slots as before');
const entry = T.casora_room.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_light_group');
assert.equal(run(entry.variables.enabled, { light_rooms_auto: true }, h), true, 'room badge row: on with the marker');
assert.equal(run(entry.variables.light_rooms_auto, { light_rooms_auto: true }, h), true);
assert.equal(run(entry.variables.enabled, {}, h), false);
// Sub-badge row: one per room group, else per lamp.
const sub = T.casora_room.custom_fields.badges_lights.card.cards;
assert.equal(run(sub[0].entity, { light_rooms_auto: true }, h), 'light.demo_wz_1');
assert.equal(run(sub[6].entity, { light_rooms_auto: true }, h), 'light.demo_bad_alle', 'Bad as its group');
assert.equal(run(sub[9].entity, { light_rooms_auto: true }, h), 'light.demo_flur_3', 'ten slots: the eleventh entry (Flur 4) has none');
assert.equal(run(sub[9].variables.enabled, { light_rooms_auto: true }, h), true);
assert.equal(run(sub[0].variables.enabled, { light_rooms_auto: true, show_lights: false }, h), false, 'badge switched off: no sub-badges');
assert.equal(run(sub[0].entity, { light_entity_1: 'light.demo_ku_3' }, h), 'light.demo_ku_3', 'slots as before');
// Phone badge row: the marker from the card or from the server's Home variables.
const mentry = T.casora_mobile_filter_badges.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_light_group');
assert.equal(run(mentry.variables.light_rooms_auto, { casora_hv: { light_rooms_auto: true } }, h), true);
assert.equal(run(mentry.variables.light_rooms_auto, { light_rooms_auto: true }, h), true);
assert.equal(run(mentry.variables.light_rooms_auto, {}, h), false);
// House tile: counts the rooms' lights live.
assert.equal(run(T.casora_light.state_display, { house: true, light_rooms_auto: true, lights: ['light.demo_wz_1'] }, h, h.states['light.demo_wz_1']), '4 An');
console.log('ok badge: counts every light, tile too');

// ── 4. The house popup: room bar from the rooms, main switch asks, rooms without a group switch their lamps ──
const calls = [];
const dialogs = [];
let answer = false;
const hass = { ...h, callService: (d, s, data, target) => calls.push([d, s, target ? target.entity_id : data.entity_id]) };
window.casoraAsk = (w) => { dialogs.push(w); return Promise.resolve(answer); };
const popup = (entity, vars) => { softCfg = null; window._casoraLF = {}; window._casoraLPC(entity, hass.states, hass, vars); return softCfg; };
const badgeVars = { ...T.casora_popup_light.variables, ...bg.variables, enabled: true, light_rooms_auto: true };
const sel = { entity_id: 'input_select.casora_expanded_row', state: 'none', attributes: {} };
const cfgB = popup(sel, badgeVars);
assert.ok(cfgB && cfgB.rooms, 'badge popup: rooms');
assert.deepEqual(cfgB.rooms.map((r) => [r.name, r.rid]), [['Wohnzimmer', null], ['Küche', null], ['Bad', 'light.demo_bad_alle'], ['Flur', null]], 'room bar from the rooms');
same(cfgB.rooms.flatMap((r) => r.lights), ALL);
assert.equal(window._casoraLPC(sel, hass.states, hass, badgeVars, 'header').title, 'Beleuchtung');
// Tile popup the same; one with an HA group keeps the group's rooms (areas).
const cfgT = popup(hass.states[tile.entity], { ...T.casora_popup_light.variables, ...tile.variables });
assert.deepEqual(cfgT.rooms.map((r) => r.name), AREAS, 'tile popup: the same room bar');
const hassG = { ...hg, callService: () => {} };
softCfg = null; window._casoraLF = {};
window._casoraLPC(hassG.states['light.demo_alle'], hassG.states, hassG, { ...T.casora_popup_light.variables, ...withGroup.tile.variables });
assert.equal(softCfg.rooms, null, 'with a flat house group: no room bar, as before');
// A house tile whose entity is the first room's group (Bad first): the list reaches beyond that group – the rooms.
const cfgR = popup(hass.states['light.demo_bad_alle'], { ...T.casora_popup_light.variables, house: true, lights: tile.variables.lights });
assert.deepEqual(cfgR.rooms.map((r) => r.name), AREAS, 'house tile on a room group: room bar from the rooms');
// A room's own tile on its group (no house marker) keeps its flat room list.
const cfgRoom = popup(hass.states['light.demo_bad_alle'], { ...T.casora_popup_light.variables });
assert.equal(cfgRoom.rooms, null, 'room group tile: no room bar');
// Main switch: the house asks, counts the lights that are on, switches exactly those.
LS.render(cfgB, 'hero', hass.states, hass, null);
const hs = LS.headFor(cfgB, hass);
assert.ok(hs && hs.disabled, 'house: only off, with a question');
same(hs.entities, ALL);
hs.toggle(true); await new Promise((r) => setTimeout(r, 5));
assert.equal(dialogs.length, 1, 'asks');
assert.equal(dialogs[0].title, 'Alle 4 Lichter im Haus ausschalten?', dialogs[0].title);
assert.equal(calls.length, 0, 'cancel switches nothing');
answer = true;
hs.toggle(true); await new Promise((r) => setTimeout(r, 5));
assert.deepEqual(calls, [['light', 'turn_off', ['light.demo_wz_1', 'light.demo_ku_1', 'light.demo_ku_2', 'light.demo_flur_4']]], JSON.stringify(calls));
// A room without a group in the bar: its lamps switch together.
calls.length = 0;
window._casoraLF[cfgB.gid] = 3;
const hr = LS.headFor(cfgB, hass);
assert.deepEqual(hr.entities, ['light.demo_flur_1', 'light.demo_flur_2', 'light.demo_flur_3', 'light.demo_flur_4']);
hr.toggle(false);
assert.deepEqual(calls, [['light', 'turn_on', hr.entities]], 'room without group: all its lamps on');
window._casoraLF[cfgB.gid] = -1;
const body = LS.render(cfgB, 'body', hass.states, hass, null);
assert.ok(body.includes('&quot;ids&quot;:[&quot;light.demo_wz_1&quot;') && body.includes('&quot;id&quot;:&quot;light.demo_bad_alle&quot;'), 'rows: lamps for a room without group, the group for Bad');
console.log('ok popup: room bar, question, rooms without a group');

// ── 5. Existing dashboards: Casora's pick is switched on load, a user's list stays ─────────────
const casoras = () => { const r = JSON.parse(JSON.stringify(rooms)); const V = r[0].variables; delete V.light_rooms_auto;
  // What "Start fresh" listed until now: the rooms' lights, ten slots, in room order.
  const slots = B.topUnits(h, r.slice(1).flatMap((x) => listed(x.variables))).slice(0, 10);
  slots.forEach((id, i) => { V['light_entity_' + (i + 1)] = id; }); return r; };
{
  const r = casoras();
  assert.equal(listed(r[0].variables).length, 10);
  assert.equal(fillHomeLights(h, r), true, 'Casora\'s ten slots: switched');
  assert.equal(r[0].variables.light_rooms_auto, true);
  assert.deepEqual(listed(r[0].variables), [], 'slots gone');
  assert.equal(fillHomeLights(h, r), false, 'once');
}
{
  const order = casoras(); // a reordered list still counts as Casora's (sets)
  const O = order[0].variables, first = O.light_entity_1; O.light_entity_1 = O.light_entity_10; O.light_entity_10 = first;
  assert.equal(fillHomeLights(h, order), true, 'order aside');
  const u = casoras(); delete u[0].variables.light_entity_10;
  assert.equal(fillHomeLights(h, u), false, 'a light taken out: the user\'s list stays');
  assert.equal(u[0].variables.light_rooms_auto, undefined);
  const f = casoras(); f[0].variables.light_entity_10 = 'light.demo_fremd';
  assert.equal(fillHomeLights(h, f), false, 'a light from nowhere: stays');
  const g = JSON.parse(JSON.stringify(withGroup.rooms));
  assert.equal(fillHomeLights(hg, g), false, 'with an HA group: untouched');
  assert.equal(g[0].variables.light_group_entity, 'light.demo_alle');
  const off = casoras(); off[0].variables.show_lights = false;
  assert.equal(fillHomeLights(h, off), false, 'badge switched off: untouched');
  const marked = casoras(); marked[0].variables.light_rooms_auto = false;
  assert.equal(fillHomeLights(h, marked), false, 'marker false (user): untouched');
}
// The user picks on Home: theirs; clearing the last entry: follows the rooms again.
{
  const V = { light_rooms_auto: true };
  homeLightsEdit(V, 'light_group_entity', 'light.demo_alle'); V.light_group_entity = 'light.demo_alle';
  assert.equal(V.light_rooms_auto, undefined, 'group chosen: marker gone');
  delete V.light_group_entity; homeLightsEdit(V, 'light_group_entity', undefined);
  assert.equal(V.light_rooms_auto, true, 'cleared: follows the rooms again');
  V.light_entity_1 = 'light.demo_wz_1'; homeLightsEdit(V, 'light_entity_1', 'light.demo_wz_1');
  assert.equal(V.light_rooms_auto, undefined);
  homeLightsEdit(V, 'temp_sensor_1', undefined);
  assert.equal(V.light_rooms_auto, undefined, 'other fields do not touch it');
}
// The why line under Home's light group field.
const why = B.homeLightsWhy(h, rooms);
assert.ok(why && why.n === 12 && why.m === 4 && /\{n\} lights in \{m\} rooms/.test(why.text), JSON.stringify(why));
assert.equal(B.homeLightsWhy(hg, withGroup.rooms), null, 'with a group: no why line');
// A lamp that comes later goes to its room, not to Home's (empty) slots.
const later = JSON.parse(JSON.stringify(rooms));
h.states['light.demo_ku_4'] = { entity_id: 'light.demo_ku_4', state: 'off', attributes: {} };
B.addLight(h, later, later[2], 'light.demo_ku_4');
assert.equal(later[2].variables.light_entity_4, 'light.demo_ku_4');
assert.deepEqual(listed(later[0].variables), [], 'Home keeps no slots');
assert.ok(B.houseLights(h, later.slice(1)).ids.includes('light.demo_ku_4'), 'and lists it through the room');
delete h.states['light.demo_ku_4'];
// fillBadges on an empty Home: the marker counts as "lights set".
{
  const t = { name: 'Home', home: true, vars: { light_rooms_auto: true } };
  B.fillBadges(h, [t]);
  assert.deepEqual(listed(t.vars), [], 'marker keeps fillBadges from adding slots');
}
console.log('ok migration: Casora\'s pick switched, user lists stay, why line');
console.log('haus_licht_ohne_gruppe: ok');
