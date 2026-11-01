// Popup label (final review 01.11.2026): the label above the title names a room only when every member of a group lies
// in it; a group over several rooms (blinds of five rooms, the house's locks, the windows) says „Zuhause“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cm = core.match(/  var HOUSE_POPUP = [^\n]*\n  function roomLabelOf\(src\) \{[\s\S]*?\n  \}\n/);
assert.ok(cm, 'roomLabelOf in casora-core.js');
const ROOM = { 'cover.wz_l': 'Wohnzimmer', 'cover.wz_r': 'Wohnzimmer', 'cover.bad': 'Bad', 'lock.flur': 'Flur', 'cover.group_wz': 'Wohnzimmer',
  'cover.all': 'Wohnzimmer', 'lock.flur2': 'Flur' };
globalThis.window = { _casoraRoomOf: (id) => ROOM[id] || null };
globalThis.document = { querySelector: () => null };
const roomLabelOf = new Function(cm[0] + ' return roomLabelOf;')();
const st = (id, a) => ({ entity_id: id, state: 'open', attributes: a || {} });
const h = { states: {}, entities: { 'lock.haus': { area_id: 'eingang' } }, devices: {}, areas: { eingang: { name: 'Eingang' } } };
['cover.wz_l', 'cover.wz_r', 'cover.bad', 'lock.flur', 'lock.flur2', 'lock.haus', 'lock.ohne'].forEach((id) => { h.states[id] = st(id); });
h.states['cover.all'] = st('cover.all', { entity_id: ['cover.wz_l', 'cover.wz_r', 'cover.bad'] });
h.states['cover.group_wz'] = st('cover.group_wz', { entity_id: ['cover.wz_l', 'cover.wz_r'] });
const lab = (tpl, ent, variables) => roomLabelOf({ _config: { template: tpl, variables: variables || {} }, _stateObj: h.states[ent], _hass: h });

assert.equal(lab('casora_popup_cover', 'cover.all'), 'Zuhause', 'blinds of several rooms: Zuhause (not the tile\'s room)');
assert.equal(lab('casora_popup_cover', 'cover.group_wz'), 'Wohnzimmer', 'all members in one room: that room');
assert.equal(lab('casora_popup_lock', 'lock.flur', { locks: ['lock.flur', 'lock.haus'] }), 'Zuhause', 'locks: Flur and the HA area Eingang');
assert.equal(lab('casora_popup_lock', 'lock.flur', { locks: ['lock.flur', 'lock.ohne'] }), 'Zuhause', 'a member without a room is not in Flur');
assert.equal(lab('casora_popup_lock', 'lock.flur', { locks: ['lock.flur', 'lock.flur2'] }), 'Flur', 'both locks in Flur');
// Evaluated variables (button-card keeps [[[ … ]]] results apart).
assert.equal(roomLabelOf({ _config: { template: 'casora_popup_lock', variables: { locks: '[[[ return [] ]]]' } }, _evaluatedVariables: { locks: ['lock.flur', 'lock.haus'] },
  _stateObj: h.states['lock.flur'], _hass: h }), 'Zuhause', 'evaluated variables count');
// House popups (contacts …): Zuhause over several rooms, still no label for one thing.
h.states['binary_sensor.fenster'] = st('binary_sensor.fenster', { entity_id: ['cover.wz_l', 'cover.bad'] });
assert.equal(lab('casora_popup_contacts', 'binary_sensor.fenster'), 'Zuhause', 'windows of several rooms: Zuhause');
assert.equal(lab('casora_popup_contacts', 'lock.flur'), '', 'house popup of one thing: no label');
assert.equal(lab('casora_cover', 'cover.wz_l'), 'Wohnzimmer', 'a single device: its room');
console.log('popup_label_rooms: ok');
