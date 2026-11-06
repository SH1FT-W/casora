// Owner, 06.11.2026: the lock rows in the locks popup show the room below the name, as the door and window rows do.
// Inside a room's own popup the room is not repeated.
//   node dev/unit/lock_rows_room.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_lock
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const content = T.casora_popup_lock.tap_action.casora_popup.content;
const a = content.indexOf("add('locks', `[[["), b = content.indexOf(']]]`', a);
assert.ok(a > 0 && b > a, 'locks section found');
const inner = (room) => content.slice(a + "add('locks', `[[[".length, b)
  .replace('${_ids}', JSON.stringify(['lock.front', 'lock.flat']))
  .replace('${_batt}', '{}').replace('${_door}', '{}')
  .replace(/\$\{JSON\.stringify\(String\(variables\?\.room_name \|\| ''\)\)\}/, JSON.stringify(room));
const hass = {
  states: { 'lock.front': { state: 'locked', attributes: { friendly_name: 'Haustür' } },
    'lock.flat': { state: 'locked', attributes: { friendly_name: 'Wohnungstür' } } },
  entities: { 'lock.front': { device_id: 'd1' }, 'lock.flat': { area_id: 'hall' } },
  devices: { d1: { area_id: 'entry', name: 'Haustür' } },
  areas: { entry: { name: 'Eingang' }, hall: { name: 'Flur' } },
};
const window = { _casoraUI: { group: (rows) => rows, v3: () => true } };
const run = (room) => new Function('window', 'hass', 'states', 'variables', inner(room))(window, hass, hass.states, {});
const subs = (rows) => rows.map((r) => [r.label, [].concat(r.sub || []).join(' · ')]);
assert.deepEqual(subs(run('')), [['Haustür', 'Eingang'], ['Wohnungstür', 'Flur']], 'room below each lock (device or entity area)');
assert.deepEqual(subs(run('Flur')), [['Haustür', 'Eingang'], ['Wohnungstür', '']], 'not repeated in that room\'s popup');
console.log('ok lock_rows_room');
