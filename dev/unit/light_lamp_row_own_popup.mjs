// A lamp tapped in a room's light popup opened the room's group popup again instead of its own (owner, 01.11.2026).
// The lamp popup comes from the light template, whose popup part sets group_rooms: true. _casoraLightScope then climbed
// from the lamp to the smallest group holding it whose first member is a group – meant for a room group inside a
// house group of rooms. A room group whose first member is a sub-group (ceiling spots) and the lamps beside it
// matched, so every other lamp of that room opened the whole room. A single lamp never climbs; a room group still
// climbs to its house.
//   node dev/unit/light_lamp_row_own_popup.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const b0 = basis.indexOf('window._casoraLightScope = function');
new Function(basis.slice(b0, basis.indexOf('window.casoraRoomTempOf = function', b0)))();
window._casoraHouseLights = () => ({ rooms: [], ids: [], subs: [] });

const lamp = (id) => ({ entity_id: id, state: 'off', attributes: {} });
const grp = (id, m) => ({ entity_id: id, state: 'on', attributes: { entity_id: m } });
const S = {
  'light.den_spot_1': lamp('light.den_spot_1'), 'light.den_spot_2': lamp('light.den_spot_2'),
  'light.den_strip': lamp('light.den_strip'), 'light.den_desk': lamp('light.den_desk'),
  'light.den_spots': grp('light.den_spots', ['light.den_spot_1', 'light.den_spot_2']),
  // The room: its first member is the spots group, then two lamps.
  'light.den': grp('light.den', ['light.den_spots', 'light.den_strip', 'light.den_desk']),
  'light.hall_lamp': lamp('light.hall_lamp'), 'light.hall_lamp_2': lamp('light.hall_lamp_2'),
  'light.hall': grp('light.hall', ['light.hall_lamp', 'light.hall_lamp_2']),
  'light.home': grp('light.home', ['light.den', 'light.hall']),
};
// The variables the lamp popup sees: the light template's own and casora_popup_light's (group_rooms: true).
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const V = Object.assign({}, T.casora_popup_light.variables, T.casora_light.variables);
assert.equal(V.group_rooms, true, 'the lamp popup carries group_rooms');
const scope = (id) => window._casoraLightScope(S[id], S, null, V);

for (const id of ['light.den_strip', 'light.den_desk', 'light.den_spot_1', 'light.hall_lamp']) {
  const sc = scope(id);
  assert.equal(sc.groupId, id, id + ': the popup stands for the lamp, not its room');
  assert.deepEqual(sc.lightIds, [id], id + ': only this lamp');
  assert.equal(sc.autoIdx, -1, id + ': no room preselected');
  assert.equal(sc.rooms, null, id + ': no rooms');
}
// A room group still opens its house with the room preselected.
const room = scope('light.hall');
assert.equal(room.groupId, 'light.home', 'room group climbs to the house');
assert.equal(room.autoIdx, 1, 'the room is preselected');
// The tally of a lamp tile counts the lamp alone.
assert.deepEqual(window.casoraLightTally(S['light.den_strip'], S, null, V), { kind: 'lamps', tot: 1, on: 0 });
console.log('ok light_lamp_row_own_popup');
