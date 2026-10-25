// Issue #57: a room added in the Studio showed only its own badges on the desktop, none of the built-in ones, and on
// the phone no badges at all.
//   1. Studio (fillNewRoomBadges): a new room gets its HA area's devices like a new dashboard (casoraBasis.fillBadges);
//      on load once more for a room still without any badge device (marker casora_badges_auto). Rooms with devices,
//      marked rooms, Home and switched-off badges stay as they are.
//   2. Phone (casoraPhoneRoom.merge): own badges alone make the room page's badge row show (_any).
//   3. Templates: the badge row of casora_room and of the phone room page carries the built-in badges and the own
//      badges' card after them, so standard + own badges show together on both.
//   node dev/unit/new_room_badges.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.location = { pathname: '/qa-haus-mobile/home' };

// ── 1. Studio: fill a new room from its area ─────────────────────────────────
const isHomeRoom = (room, rooms) => !!room && (room.path === 'home' || (Array.isArray(rooms) && rooms[0] === room && !rooms.some((r) => r && r.path === 'home')));
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
assert.ok(window.casoraBasis && window.casoraBasis.fillBadges, 'casoraBasis.fillBadges');

const panel = read('custom_components/casora/panel/casora-panel.js');
const src = panel.match(/const ROOM_BADGE_VAR = [\s\S]*?\nfunction fillNewRoomBadges\([\s\S]*?\n}\n/);
assert.ok(src, 'fillNewRoomBadges in casora-panel.js');
const emptyVal = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const { fillNewRoomBadges } = new Function('window', 'isHomeRoom', 'emptyVal', src[0] + '\nreturn { fillNewRoomBadges };')(window, isHomeRoom, emptyVal);
// _addRoom and the load both use it.
assert.match(panel, /async _addRoom\(\) \{[\s\S]*?fillNewRoomBadges\(this\._hass, rooms, \[fresh\]\)[\s\S]*?\n  \}\n/, '_addRoom fills the new room');
assert.match(panel, /fillNewRoomBadges\(this\._hass, this\._state\.compact\.rooms\)/, 'load fills rooms still without devices');

// A made-up house: area "Garten" with two lights, a thermostat with a temperature sensor and a door contact.
function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: { garten: { area_id: 'garten', name: 'Garten' }, bad: { area_id: 'bad', name: 'Bad' } } };
  const ent = (id, area, attrs, state = 'off') => {
    h.entities[id] = { entity_id: id, device_id: null, area_id: area, platform: 'template' };
    h.states[id] = { entity_id: id, state, attributes: { friendly_name: id.split('.')[1], ...attrs } };
  };
  ent('light.demo_garten_1', 'garten', { supported_color_modes: ['brightness'] });
  ent('light.demo_garten_2', 'garten', { supported_color_modes: ['brightness'] }, 'on');
  ent('sensor.demo_garten_temp', 'garten', { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' }, '18');
  ent('light.demo_bad_1', 'bad', { supported_color_modes: ['brightness'] });
  return h;
}
const lightsOf = (V) => Object.keys(V).filter((k) => /^light_entity_\d+$/.test(k)).map((k) => V[k]).sort();
{
  const h = house();
  const home = { name: 'Home', path: 'home', variables: {} };
  const fresh = { name: 'Garten', path: 'garten', variables: { image: 'garden-demo' } };
  const rooms = [home, fresh];
  const got = fillNewRoomBadges(h, rooms, [fresh]);
  assert.deepEqual(got, [fresh], 'the new room is filled');
  assert.deepEqual(lightsOf(fresh.variables), ['light.demo_garten_1', 'light.demo_garten_2'], 'its area\'s lights on the Lights badge');
  assert.equal(fresh.variables.temp_sensor_1, 'sensor.demo_garten_temp', 'its temperature on the Climate badge');
  assert.equal(fresh.variables.casora_badges_auto, true, 'marked as filled');
  assert.deepEqual(Object.keys(home.variables), [], 'Home untouched');

  // Emptied by the user afterwards: never filled again.
  Object.keys(fresh.variables).filter((k) => /^(light_entity_|temp_sensor_)/.test(k)).forEach((k) => delete fresh.variables[k]);
  assert.deepEqual(fillNewRoomBadges(h, rooms), [], 'a marked room stays as the user left it');
}
{
  // The state #57 left behind: saved with only an own badge – filled on load.
  const h = house();
  const own = { name: 'Garten', path: 'garten', variables: { custom_badges: [{ entity: 'light.demo_bad_1' }], casora_ui_managed: true } };
  const set = { name: 'Bad', path: 'bad', variables: { light_entity_1: 'light.demo_bad_1' } };
  const rooms = [{ name: 'Home', path: 'home', variables: {} }, own, set];
  const got = fillNewRoomBadges(h, rooms);
  assert.deepEqual(got, [own], 'only the room without devices');
  assert.deepEqual(lightsOf(own.variables), ['light.demo_garten_1', 'light.demo_garten_2']);
  assert.deepEqual(own.variables.custom_badges, [{ entity: 'light.demo_bad_1' }], 'own badges stay');
  assert.deepEqual(set.variables, { light_entity_1: 'light.demo_bad_1' }, 'a room with devices stays as it is');
}
{
  // Switched-off badges stay off, a room without an area of its name stays empty and unmarked.
  const h = house();
  const off = { name: 'Garten', path: 'garten', variables: { show_lights: false } };
  const none = { name: 'Dachboden', path: 'dachboden', variables: {} };
  fillNewRoomBadges(h, [{ name: 'Home', path: 'home', variables: {} }, off, none]);
  assert.deepEqual(lightsOf(off.variables), [], 'show_lights false: no lights');
  assert.equal(off.variables.temp_sensor_1, 'sensor.demo_garten_temp', 'the other badges still filled');
  assert.deepEqual(none.variables, {}, 'no area: nothing, no marker (filled once one appears)');
}

// ── 2. Phone: own badges alone show the room page's badge row ────────────────
const core = read('custom_components/casora/scripts/casora-core.js');
const energyAt = core.indexOf('window._casoraEnergyOn = function (V) {');
new Function(core.slice(energyAt, core.indexOf('\n  };', energyAt) + 4))();
const coreAt = core.indexOf('// Raum-Badges am Handy wie im Raum-Kopf am Desktop/Tablet');
const coreEnd = core.indexOf('\n})();\n', core.indexOf('window.casoraPhoneRoom = {', coreAt)) + 6;
new Function(core.slice(coreAt, coreEnd))();
const PR = window.casoraPhoneRoom;
assert.equal(PR.merge({}, null, 'Garten')._any, false, 'no badges: no row');
assert.equal(PR.merge({ custom_badges: [{ entity: 'light.demo_bad_1' }] }, null, 'Garten')._any, true, 'device badge alone: row shows');
assert.equal(PR.merge({ custom_badges: [{ template: "{{ 'x' }}" }] }, null, 'Garten')._any, true, 'template badge alone: row shows');
assert.equal(PR.merge({ custom_badges: [{}, { entity: '' }, { template: '  ' }, null] }, null, 'Garten')._any, false, 'empty entries do not count');
assert.equal(PR.merge({ light_entity_1: 'light.demo_bad_1', custom_badges: [{ entity: 'light.demo_bad_1' }] }, null, 'Garten')._any, true);

const C = T.casora_mobile_sensor_chips, R = T.casora_room;
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const disp = C.styles.custom_fields.rooms_row.find((x) => 'display' in x).display;
const rowDisplay = (rv) => new Function('variables', 'states', 'hass', 'user', body(disp))(
  { casora_rv: rv }, { 'input_select.casora_mobile_filter': { state: 'room_garten' } }, {}, null);
assert.equal(rowDisplay(PR.merge({ custom_badges: [{ entity: 'light.demo_bad_1' }] }, null, 'Garten')), 'block', 'phone row shown for own badges only');
assert.equal(rowDisplay(PR.merge({}, null, 'Garten')), 'none');

// ── 3. Composition: built-in badges first, the own badges' card last (desktop and phone) ──
const desk = R.custom_fields.badges.card.cards;
const phone = C.custom_fields.rooms_row.card.cards;
for (const [where, cards, place] of [['desktop', desk, 'room'], ['phone', phone, 'phone']]) {
  const at = cards.findIndex((c) => c.type === 'custom:casora-custom-badges');
  assert.ok(at > 0, where + ': own badges card in the badge row');
  assert.equal(cards[at].place, place, where + ': place');
  assert.ok(cards.slice(0, at).some((c) => c.template === 'casora_badge_light_group'), where + ': Lights badge before the own badges');
  assert.ok(cards.slice(0, at).some((c) => c.template === 'casora_badge_climate_group'), where + ': Climate badge before the own badges');
  assert.ok(cards.slice(at + 1).every((c) => /^casora_badge_(motion|base)$/.test(c.template || '')), where + ': nothing built-in after the own badges but the phone\'s motion extra');
}
// The own badges' list on the phone comes from the desktop room's variables (casora_rv), as for the built-in ones.
const pc = phone.find((c) => c.type === 'custom:casora-custom-badges');
const list = new Function('variables', 'user', body(pc.badges))({ casora_rv: { custom_badges: [{ entity: 'light.demo_bad_1' }] } }, null);
assert.deepEqual(list, [{ entity: 'light.demo_bad_1' }]);
console.log('new_room_badges ok');
