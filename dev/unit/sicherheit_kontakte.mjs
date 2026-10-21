// #39: A single door/window badge opened „Türen & Fenster“ of the whole house instead of that contact;
// a group badge (doors or windows of a room) listed the whole house too; the security badge on Home
// counted no doors or windows unless entered by hand. Expected: one contact → its own page (route),
// a group → only its members, Home → every door and window of the house.
//   node dev/unit/sicherheit_kontakte.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const fn = (src) => new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(src));

const st = (state, dc, extra) => ({ state, attributes: { device_class: dc, friendly_name: 'x', ...extra } });
const states = {
  'binary_sensor.door_a': st('on', 'door'), 'binary_sensor.win_a': st('off', 'window'),
  'binary_sensor.win_b': st('on', 'window'),
  'binary_sensor.windows_room_a': st('on', 'window', { entity_id: ['binary_sensor.win_a'] }),
  'alarm_control_panel.home': st('disarmed'),
};
const hass = { states, entities: {}, devices: {}, areas: {} };
const ent = (id) => ({ entity_id: id, ...states[id] });
globalThis.window = globalThis;
window.casoraContacts = () => ({ groups: [{ label: 'Türen', members: ['binary_sensor.door_a'] },
  { label: 'Fenster', members: ['binary_sensor.win_a', 'binary_sensor.win_b'] }], sub: {}, excl: [] });

// 1. route: a single contact opens its own page, a group or an alarm keeps the popup.
for (const k of ['casora_badge_security', 'casora_popup_contacts']) {
  const route = fn(T[k].tap_action.casora_popup.route);
  assert.equal(route(states, ent('binary_sensor.win_a'), {}, hass, {}), 'binary_sensor.win_a', k + ': one window → its page');
  assert.equal(route(states, ent('binary_sensor.windows_room_a'), {}, hass, {}), '', k + ': group → list');
  assert.equal(route(states, ent('alarm_control_panel.home'), {}, hass, {}), '', k + ': alarm → popup');
}
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(core.includes("if (window.casoraRoute(data.route)) return;"), 'casoraPopup.open follows route');

// 2. A group badge lists only its members; without a group the whole house as before.
const rows = [];
window._casoraUI = { hero: () => '', group: (r) => { rows.push(...r.map((x) => x.entity)); return ''; }, esc: String, tokens: {} };
window._casoraStd = (ui) => ui;
const contacts = fn(T.casora_popup_contacts.tap_action.casora_popup.content);
contacts(states, ent('binary_sensor.windows_room_a'), {}, hass, {});
assert.deepEqual(rows, ['binary_sensor.win_a'], 'group badge: only its member');
rows.length = 0;
contacts(states, ent('binary_sensor.door_a'), {}, hass, {});
assert.deepEqual(rows.sort(), ['binary_sensor.door_a', 'binary_sensor.win_a', 'binary_sensor.win_b'], 'no group: the whole house');

// 3. Home counts every door and window; a room only what it lists.
let seen = null;
window.casoraSecuritySummary = (sec) => { seen = sec; return { text: '', parts: [] }; };
window.casoraSecurityMode = () => 'short';
window._casoraSoft = () => true;
const name = fn(T.casora_badge_security_group.name);
try { name.call({}, states, null, {}, hass, { place: 'home' }); } catch (e) { /* rendering after the count */ }
assert.equal(seen && seen.doors, 1, 'Home: open door counted');
assert.equal(seen && seen.windows, 1, 'Home: open window counted');
seen = null;
try { name.call({}, states, null, {}, hass, { place: 'room', entities: [] }); } catch (e) { /* idem */ }
assert.equal(seen && seen.doors + seen.windows, 0, 'room without entries: nothing counted');
console.log('ok sicherheit_kontakte');
