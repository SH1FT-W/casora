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
const finden = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
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
// The phone room pages sit in the home view: they must not count the house (tools/phone_room_badges.py).
assert.ok(!JSON.stringify(T.casora_mobile_sensor_chips).includes('user,this)'), 'phone room page: no house count');
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

// 5. Follow-up #39: with a camera in the security badge on Home, a tap opened the row, and the row had
// only „Kamera“: the house's doors and windows were counted but nowhere listed. Now they get a sub-badge
// each („Türen“, „Fenster“) as long as the badge lists no doors or windows itself.
const sb = { CASORA_SETTINGS: { notify: { contact_merged: { 'binary_sensor.win_c_combo': ['binary_sensor.win_c', 'binary_sensor.win_c_tilt'] } } } };
new Function('window', 'document', 'customElements', finden)(sb, { querySelector: () => null },
  { whenDefined: () => new Promise(() => {}), get: () => null });
const hs = { states: {
  'binary_sensor.door_a': st('off', 'door'), 'binary_sensor.garage': st('off', 'garage_door'),
  'binary_sensor.win_a': st('on', 'window'), 'binary_sensor.win_c': st('off', 'window'),
  'binary_sensor.win_c_combo': st('on', 'window', { tilt: true }), 'binary_sensor.win_c_tilt': st('on', 'window'),
  'binary_sensor.win_d': st('off', 'window'), 'binary_sensor.motion': st('on', 'motion'), 'binary_sensor.doors_group': st('off', 'door', { entity_id: ['binary_sensor.door_a'] }),
}, entities: {}, devices: {}, areas: {} };
const of = (v, kind, where) => sb.casoraHouseContactsOf(hs, v, kind, { id: 'a' }, where);
assert.deepEqual(of({ security_cameras: ['camera.a'] }, 'door', 'home'), ['binary_sensor.door_a', 'binary_sensor.garage'], 'Home with a camera: doors');
assert.deepEqual(of({}, 'window', 'home'), ['binary_sensor.win_a', 'binary_sensor.win_c_combo', 'binary_sensor.win_d'], 'windows, merged sensor as its combined one');
assert.deepEqual(of({}, 'door', null), [], 'no place: nothing');
assert.deepEqual(of({ place: 'room' }, 'door', 'home'), [], 'place room wins');
let homeView = true;
sb.casoraOnHomeView = () => homeView;
assert.equal(of({}, 'door', {}).length, 2, 'card on the home view');
homeView = false;
assert.deepEqual(of({}, 'door', {}), [], 'card in a room');
assert.deepEqual(of({ security_entity_2: 'binary_sensor.doors_group' }, 'door', 'home'), [], 'own doors: no twin');
assert.deepEqual(of({ security_entity_4: 'binary_sensor.win_a' }, 'window', 'home'), [], 'one own window: no twin');
assert.equal(of({ security_entity_1: 'alarm_control_panel.home', security_entity_4: 'binary_sensor.motion' }, 'door', 'home').length, 2,
  'alarm or motion in a slot: still the house');
sb.casoraSeesEntity = cw.casoraSeesEntity;
assert.deepEqual(of({ casora_entity_users: { 'binary_sensor.garage': ['b'] } }, 'door', 'home'), ['binary_sensor.door_a'], 'Who sees this');
delete sb.casoraSeesEntity;

// One state for the list: open while one is open, tilted only when every open one is tilted.
const one = (ids, kind) => sb.casoraContactsEntity(hs, null, { contacts: ids, contacts_kind: kind, label: 'x' });
assert.equal(sb.casoraContactsEntity(hs, 'E', {}), 'E', 'no list: the entity as before');
assert.equal(one(['binary_sensor.door_a', 'binary_sensor.garage'], 'door').state, 'off');
assert.equal(one(['binary_sensor.win_a', 'binary_sensor.win_c_combo'], 'window').state, 'on');
assert.equal(one(['binary_sensor.win_a', 'binary_sensor.win_c_combo'], 'window').attributes.tilt, false, 'one open, one tilted: open');
assert.equal(one(['binary_sensor.win_c_combo'], 'window').attributes.tilt, true, 'only tilted');
assert.equal(one(['binary_sensor.gone'], 'door').state, 'unavailable');
assert.deepEqual(one(['binary_sensor.win_a'], 'window').attributes.entity_id, ['binary_sensor.win_a'], 'shaped like a group');

// The badge reads that state: title, word, shown at all.
const B = T.casora_badge_contact_group;
window.casoraContactsEntity = sb.casoraContactsEntity;
window.casoraIconUrl = (n) => n;
const bv = (ids, kind, label) => ({ contacts: ids, contacts_kind: kind, label, enabled: true });
const winVars = bv(['binary_sensor.win_d', 'binary_sensor.win_a', 'binary_sensor.win_c_combo'], 'window', 'Fenster');
const first = { entity_id: 'binary_sensor.win_d', ...hs.states['binary_sensor.win_d'] };
const bname = fn(B.name)(hs.states, first, {}, hs, winVars);
assert.ok(bname.includes('>Fenster<') && bname.includes('>Geöffnet<'), 'Fenster · Geöffnet (one open, not the first only)');
const dname = fn(B.name)(hs.states, { entity_id: 'binary_sensor.door_a', ...hs.states['binary_sensor.door_a'] }, {}, hs,
  bv(['binary_sensor.door_a', 'binary_sensor.garage'], 'door', 'Türen'));
assert.ok(dname.includes('>Türen<') && dname.includes('>Geschlossen<'), 'Türen · Geschlossen');
assert.ok(fn(B.extra_styles)(hs.states, first, {}, hs, winVars).includes("url('window-open')"), 'window glyph, open');
const shown = B.styles.card.find((x) => x.display).display;
assert.equal(fn(shown)(hs.states, first, {}, hs, winVars), 'inline-grid', 'shown');
assert.equal(fn(shown)(hs.states, undefined, {}, hs, bv([], 'door', 'Türen')), 'none', 'empty list: hidden');

// Its popup: only these contacts, titled by kind, never the first contact's own page.
const P = T.casora_popup_contacts.tap_action.casora_popup;
assert.equal(fn(P.route)(hs.states, first, {}, hs, winVars), '', 'list: no single page');
assert.equal(fn(P.title)(hs.states, first, {}, hs, winVars), 'Fenster');
assert.equal(fn(P.title)(hs.states, first, {}, hs, { ...winVars, contacts_kind: 'door' }), 'Türen');
rows.length = 0;
window._casoraStd = (ui) => ui;
window.casoraContacts = () => ({ groups: [{ label: 'Türen', members: ['binary_sensor.door_a', 'binary_sensor.garage'] },
  { label: 'Fenster', members: ['binary_sensor.win_a', 'binary_sensor.win_c'] }], sub: { 'binary_sensor.win_c': 'binary_sensor.win_c_combo' }, excl: [] });
fn(P.content)(hs.states, first, {}, hs, winVars);
assert.deepEqual(rows.sort(), ['binary_sensor.win_a', 'binary_sensor.win_c_combo'], 'popup: the windows only');

// Where they sit: the security row on Home (wide and phone) and the inline row; phone room pages never.
const autoOf = (cards) => cards.filter((c) => JSON.stringify(c).includes('casoraHouseContactsOf'));
const bs = autoOf(T.casora_room.custom_fields.badges_security.card.cards);
assert.deepEqual(bs.map((c) => [c.variables.contacts_kind, c.variables.label]), [['door', 'Türen'], ['window', 'Fenster']], 'wide row');
assert.ok(bs.every((c) => c.variables.contacts.includes(",user,this)")), 'wide row: the card says where it sits');
const inl = autoOf(T.casora_room.custom_fields.badges.card.cards);
assert.ok(inl.length === 2 && inl.every((c) => c.variables.inline === true && c.variables.enabled.includes('show_security_inline')), 'inline row');
const ph = autoOf(T.casora_mobile_sensor_chips.custom_fields.security_row.card.cards);
assert.ok(ph.length === 2 && ph.every((c) => c.variables.contacts.includes(",user,'home')")), 'phone Home row');
const phRooms = autoOf([...T.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards,
  ...T.casora_mobile_sensor_chips.custom_fields.room_sub_security.card.cards]);
assert.ok(phRooms.length === 4 && phRooms.every((c) => c.variables.contacts.includes(",user)")), 'phone room pages: no place, no house');
console.log('ok sicherheit_kontakte');
