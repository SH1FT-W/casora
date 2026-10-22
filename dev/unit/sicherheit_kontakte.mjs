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

// 2b. Title and width: a windows-only group says „Fenster“; one group spans the full width.
for (const k of ['casora_popup_contacts', 'casora_badge_security']) {
  const title = fn(T[k].tap_action.casora_popup.title);
  assert.equal(title(states, ent('binary_sensor.windows_room_a'), {}, hass, {}), 'Fenster', k + ': windows only');
  assert.equal(title(states, ent('binary_sensor.door_a'), {}, hass, {}), 'Türen & Fenster', k + ': whole house');
}
let stdOpts = null;
window._casoraStd = (ui, o) => { stdOpts = o; return ui; };
contacts(states, ent('binary_sensor.windows_room_a'), {}, hass, {});
assert.deepEqual(stdOpts.full, ['grp1'], 'one group: full width');
contacts(states, ent('binary_sensor.door_a'), {}, hass, {});
assert.equal(stdOpts.full, undefined, 'doors and windows: two columns as before');

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

// 4. Follow-up #39: on a tablet/desktop (casora_room) the security badge on Home stayed hidden without
// entries of its own; casoraHasSec only looked at entries. Now the card says where it sits: on the
// home view the house's doors and windows are enough, in a room still only its entries.
const finden = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finden.js', import.meta.url), 'utf8');
const sandbox = { CASORA_SETTINGS: { notify: { contact_merged: { 'binary_sensor.door_a': ['binary_sensor.door_a', 'binary_sensor.win_b'] } } } };
new Function('window', 'document', 'customElements', finden)(sandbox, { querySelector: () => null },
  { whenDefined: () => new Promise(() => {}), get: () => null });
const houseHass = { states: { 'binary_sensor.door_a': st('off', 'door'), 'binary_sensor.win_a': st('off', 'window'),
  'binary_sensor.win_b': st('off', 'window') }, entities: {}, devices: {}, areas: {} };
assert.deepEqual(sandbox.casoraHouseContacts(houseHass), ['binary_sensor.door_a', 'binary_sensor.win_a'],
  'house contacts: doors and windows, merged sensor left out');

const cw = { addEventListener: () => {} };
const cut = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
new Function('window', 'document', cut('(function () {\n  var hassUser', '})();\n'))(cw, { querySelector: () => null });
let onHome = true;
cw.casoraOnHomeView = () => onHome;
cw.casoraHouseContacts = (h) => sandbox.casoraHouseContacts(h);
const card = { hass: houseHass };
const room = { show_security: true };
assert.equal(cw.casoraHasSec(room, { id: 'a' }, card), true, 'Home: the house is enough');
assert.equal(cw.casoraHasSec(room, { id: 'a' }), false, 'without the card as before');
onHome = false;
assert.equal(cw.casoraHasSec(room, { id: 'a' }, card), false, 'a room without entries: no badge');
onHome = true;
const hidden = { ...room, casora_entity_users: { 'binary_sensor.door_a': ['b'], 'binary_sensor.win_a': ['b'] } };
assert.equal(cw.casoraHasSec(hidden, { id: 'a' }, card), false, 'Who sees this: hidden contacts do not count');
assert.equal(cw.casoraHasSec({ show_security: true }, { id: 'a' }, { hass: { ...houseHass, states: {} } }), false, 'no contacts: no badge');
// Every check in casora_room hands over its card.
const roomTpl = JSON.stringify(T.casora_room);
assert.ok(!roomTpl.includes('casoraHasSec(variables,user)') && roomTpl.includes('casoraHasSec(variables,user,this)'),
  'casora_room: casoraHasSec gets the card');
// A tap on Home without entries lists the house's doors and windows (wide: instead of an empty row,
// phone: instead of a filter with nothing in it); with entries everything stays as before.
assert.equal(cw.casoraSecContactsTap({ place: 'home' }, { id: 'a' }), true, 'Home, no entries: list');
assert.equal(cw.casoraSecContactsTap({ place: 'home', locks: ['lock.front'] }, { id: 'a' }), false, 'Home with a lock: row as before');
assert.equal(cw.casoraSecContactsTap({ place: 'room' }, { id: 'a' }), false, 'room: as before');
assert.equal(cw.casoraSecContactsTap({}, { id: 'a' }, card), true, 'desktop: home view from the card');
onHome = false;
assert.equal(cw.casoraSecContactsTap({}, { id: 'a' }, card), false, 'desktop: other view');
onHome = true;
const tap = T.casora_badge_security_group.tap_action;
const evalTap = (src, vars) => new Function('states', 'entity', 'user', 'hass', 'variables', body(src)).call(card, states, null, { id: 'a' }, hass, vars);
window.casoraSecContactsTap = cw.casoraSecContactsTap;
window.casoraSeesEntity = cw.casoraSeesEntity;
assert.equal(evalTap(tap.action, { place: 'home' }), 'fire-dom-event');
assert.equal(evalTap(tap.casora_contacts_open, { place: 'home' }), true);
assert.equal(evalTap(tap.action, { place: 'home', entities: ['binary_sensor.door_a'] }), 'call-service', 'with entries: the row');
assert.equal(evalTap(tap.casora_contacts_open, { place: 'room' }), false);
assert.ok(core.includes('if (d.casora_contacts_open === true) return;'), 'phone filter steps aside');
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
assert.ok(basis.includes("{ type: 'custom:button-card', template: 'casora_popup_contacts' }"), 'opens the contacts popup of the house');
// Studio: the preview counts the house on Home and says so in the badge editor.
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.ok(panel.includes('secEntities.concat(house)') && panel.includes('window.casoraHouseContacts(this._hass).filter(sees)'),
  'Studio preview counts the house on Home');
assert.ok(panel.includes('"On the home page every door and window in the house counts automatically ("'), 'Studio editor hint');
console.log('ok sicherheit_kontakte');
