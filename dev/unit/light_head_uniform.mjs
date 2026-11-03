// One head for every light popup (owner, 03.11.2026): label = the room („Zuhause“ for the house), title = „Beleuchtung“;
// a lamp's page: label = its room, title = the lamp without it. The room comes from the dashboard (the room whose light
// badge holds the light: its group, a row, or a lamp in a row's group). Regress r516 checks the popups themselves.
//   node dev/unit/light_head_uniform.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.addEventListener = () => {};
const p0 = pop.lastIndexOf('(function () {', pop.indexOf('if (window._casoraLightSoft) return;'));
new Function(pop.slice(p0, pop.indexOf('\n})();', p0) + 6))();
const S = window._casoraLightSoft;

const st = (name, members) => ({ state: 'off', attributes: Object.assign({ friendly_name: name }, members ? { entity_id: members } : {}) });
const states = {
  'light.qa_room': st('Wohnzimmer', ['light.qa_strip', 'light.qa_spots']),
  'light.qa_strip': st('TV-Backlight Wohnzimmer'),
  'light.qa_spots': st('Spots Wohnzimmer', ['light.qa_spot_1', 'light.qa_spot_2']),
  'light.qa_spot_1': st('Deckenspot Wohnzimmer 1'),
  'light.qa_spot_2': st('Deckenspot Wohnzimmer 2'),
  'light.qa_alone': st('Werklampe'),
};
const hass = { states };
window._casoraHouseLights = () => ({ rooms: [{ name: 'Wohnzimmer', rid: 'light.qa_room', lights: ['light.qa_strip', 'light.qa_spots'] }] });

// placeOf: the room group itself, a row, a lamp inside a row's group; none.
assert.deepEqual(S.placeOf('light.qa_room', hass), { name: 'Wohnzimmer', rid: 'light.qa_room', rows: ['light.qa_strip', 'light.qa_spots'] });
assert.equal(S.placeOf('light.qa_strip', hass).name, 'Wohnzimmer');
assert.equal(S.placeOf('light.qa_spot_2', hass).name, 'Wohnzimmer', 'a lamp inside the room\'s spots group');
assert.deepEqual(S.placeOf('light.qa_spot_2', hass).rows, ['light.qa_strip', 'light.qa_spots'], 'its page lists the room\'s rows');
assert.equal(S.placeOf('light.qa_alone', hass), null);

// headOf for every kind of page.
const rooms = [{ name: 'Wohnzimmer', rid: 'light.qa_room', lights: ['light.qa_strip', 'light.qa_spots'] }];
assert.deepEqual(S.headOf({ rooms, init: -1 }, states), { eyebrow: 'Zuhause', title: 'Beleuchtung' }, 'house');
assert.deepEqual(S.headOf({ rooms, init: 0 }, states), { eyebrow: 'Wohnzimmer', title: 'Beleuchtung' }, 'house with the room chosen');
// A room of one lamp chosen up front (a room badge climbing to its house): that lamp's page (finding 3, 03.11.2026).
assert.deepEqual(S.headOf({ rooms: [{ name: 'Wohnzimmer', rid: 'light.qa_room', lights: ['light.qa_strip'] }], init: 0 }, states),
  { eyebrow: 'Wohnzimmer', title: 'TV-Backlight' }, 'room of one lamp: the lamp');
assert.deepEqual(S.headOf({ rooms: [{ name: 'Wohnzimmer', rid: 'light.qa_room', lights: ['light.qa_spots'] }], init: 0 }, states),
  { eyebrow: 'Wohnzimmer', title: 'Beleuchtung' }, 'room of one group with lamps: the room');
assert.deepEqual(S.headOf({ flat: { house: true, lights: ['light.qa_strip'] } }, states), { eyebrow: 'Zuhause', title: 'Beleuchtung' }, 'flat house');
assert.deepEqual(S.headOf({ flat: { name: 'Wohnzimmer', label: 'Wohnzimmer', lights: ['light.qa_strip', 'light.qa_spot_1'] } }, states),
  { eyebrow: 'Wohnzimmer', title: 'Beleuchtung' }, 'room');
assert.deepEqual(S.headOf({ flat: { lamp: true, label: 'Wohnzimmer', lights: ['light.qa_strip'] } }, states),
  { eyebrow: 'Wohnzimmer', title: 'TV-Backlight' }, 'lamp: its room, its name without it');
assert.deepEqual(S.headOf({ flat: { lamp: true, label: 'Wohnzimmer', lights: ['light.qa_spots'] } }, states),
  { eyebrow: 'Wohnzimmer', title: 'Spots' }, 'a group standing as one light is named like a lamp');
assert.deepEqual(S.headOf({ flat: { lamp: true, label: '', lights: ['light.qa_alone'] } }, states),
  { eyebrow: 'Zuhause', title: 'Werklampe' }, 'a lamp in no room: the house');
assert.equal(S.headOf({ flat: { lamp: true, label: 'Wohnzimmer', lights: ['light.qa_strip'] } }, states, 'Mein Licht').title, 'Mein Licht', 'own popup title wins');

// The template hands the head over unchanged (head_fixed) in every popup config of the light templates.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const [k, a] of [['casora_popup_light', 'tap_action'], ['casora_popup_light', 'hold_action'], ['casora_light', 'tap_action']]) {
  const cp = T[k][a].casora_popup;
  assert.ok(/_hdr\.fixed/.test(cp.head_fixed) && /_hdr\.eyebrow/.test(cp.eyebrow), k + ' ' + a + ': eyebrow and head_fixed');
}
assert.ok(/_LS\.headOf\(_softCfg, states, _rnOwn\)/.test(T.casora_popup_light.custom_fields.lpc_init), 'LPC header uses headOf');
// A room's or the house's view is always „Beleuchtung“: an own title (room_name) never repeats the room (review 03.11.2026).
assert.equal(S.headOf({ flat: { name: 'Wohnzimmer', label: 'Wohnzimmer', lights: ['light.qa_strip', 'light.qa_spot_1'] } }, states, 'Wohnzimmer').title, 'Beleuchtung', 'room view ignores an own title');
assert.equal(S.headOf({ flat: { house: true, lights: ['light.qa_strip'] } }, states, 'Home').title, 'Beleuchtung', 'house view ignores an own title');
console.log('ok light_head_uniform');
