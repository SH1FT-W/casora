// #243: the Scenes badge on the phone's Home. On the phone the Home scenes sit behind the Scenes button of the
// bar; the badge row of the phone's start page (casora_mobile_filter_badges) had no Scenes badge. New Studio switch
// "Also show on the phone" (show_scenes_phone on the overview room, next to show_scenes), off by default: off = the
// phone's Home row as before, on = the Scenes badge there too (list as on the desktop's Home badge, a tap opens the
// scenes page room_scenes). Rooms stay as they were: the phone room page keeps its own scenes area, no badge.
//   node dev/unit/phone_home_scenes_badge.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_mobile_filter_badges, custom_components/casora/panel/casora-panel.js#_miniModel,PHONE_FILTERS,phoneRoomBadgeVars, custom_components/casora/panel/casora-panel-addons.js#__casoraSceneMode, custom_components/casora/phone_badges.py#home_badges
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const nav = read('custom_components/casora/scripts/local/04-navigation.js');
const panel = read('custom_components/casora/panel/casora-panel.js');
const addons = read('custom_components/casora/panel/casora-panel-addons.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, querySelector() { return null; } };
globalThis.customElements = { get() { return null; }, whenDefined() { return { then() {} }; } };
const block = (src, start, end) => {
  const at = src.indexOf(start);
  assert.ok(at >= 0, 'not found: ' + start);
  return src.slice(at, src.indexOf(end, at) + end.length);
};
new Function(block(core, '// Casora Studio „Wer sieht das?“', '\n})();\n'))();
new Function(block(nav, '// ── Gemeinsame Szenenliste', '\n})();\n'))();
assert.equal(typeof window.casoraSeen, 'function');
assert.equal(typeof window.casoraNavScenes, 'function');

const hass = { states: {
  'scene.example_a': { state: '2026-11-01T10:00:00Z', attributes: { friendly_name: 'Alpha' } },
  'scene.example_b': { state: '2026-11-01T10:00:00Z', attributes: { friendly_name: 'Beta' } },
  'scene.example_c': { state: '2026-11-01T10:00:00Z', attributes: { friendly_name: 'Gamma' } },
  'input_select.casora_mobile_filter': { state: 'all' },
}, entities: {} };
const run = (expr, variables, user = { id: 'u1' }, states = hass.states) => {
  const body = String(expr).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  return new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body)(
    states, undefined, user, { ...hass, states }, variables, undefined);
};

// ── The phone's Home row ─────────────────────────────────────────────────────────────────────────────
const row = T.casora_mobile_filter_badges.custom_fields.badges.card.cards;
const sc = row.filter((c) => c.template === 'casora_badge_scene_group');
assert.equal(sc.length, 1, 'one Scenes badge in the phone row');
const c = sc[0];
const shown = (hv, user) => run(c.variables.enabled, { casora_hv: hv }, user);
// Off (default): as before, never.
assert.equal(shown(null), false, 'older server / no desktop: no badge');
assert.equal(shown({}), false, 'nothing set: no badge');
assert.equal(shown({ show_scenes: true }), false, 'Home badge on, switch off: no badge on the phone (as before)');
assert.equal(shown({ show_scenes_phone: true }), false, 'switch alone (scenes as menu or off): no badge');
// On.
const on = { show_scenes: true, show_scenes_phone: true };
assert.equal(shown(on), true, 'switch on: badge on the phone');
assert.equal(shown({ ...on, casora_badge_users: { scenes: ['u2'] } }), false, '"Who sees this?": u1 does not');
assert.equal(shown({ ...on, casora_badge_users: { scenes: ['u2'] } }, { id: 'u2' }), true, 'u2 does');
assert.equal(shown({ ...on, scene_exclude: ['scene.example_a', 'scene.example_b', 'scene.example_c'] }), false,
  'all scenes hidden: no badge (like the desktop)');
// Same list as the desktop's Home badge: navigation scenes without the hidden ones, scene_order first.
assert.deepEqual(run(c.variables.scene_entities, { casora_hv: { ...on, scene_exclude: ['scene.example_b'],
  scene_order: ['scene.example_c'] } }), ['scene.example_c', 'scene.example_a'], 'list: excluded out, order first');
assert.deepEqual(run(c.variables.scene_entities, { casora_hv: null }), ['scene.example_a', 'scene.example_b', 'scene.example_c'],
  'no overview room: all scenes by name');
assert.equal(run(c.variables.title, { casora_hv: { scenes_title: 'Moods' } }), 'Moods', 'own badge name');
// A tap opens the scenes page of the phone and closes it again; it never touches the desktop's expanded row.
assert.equal(c.tap_action.action, 'fire-dom-event');
const tap = (cur) => run(c.tap_action.casora_filter, {}, undefined, { ...hass.states, 'input_select.casora_mobile_filter': { state: cur } });
assert.equal(tap('all'), 'room_scenes');
assert.equal(tap('room_scenes'), 'all');
assert.equal(c.entity, 'input_select.casora_mobile_filter');
assert.equal(c.variables.row_entity, 'input_select.casora_mobile_filter', 'not the desktop row (casora_expanded_row)');

// ── Rooms unchanged ──────────────────────────────────────────────────────────────────────────────────
// Desktop room header: still only show_scenes + its own scene_entities.
const roomCards = [];
(function walk(o) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') { if (o.template === 'casora_badge_scene_group') roomCards.push(o); Object.values(o).forEach(walk); }
})(T.casora_room);
assert.equal(roomCards.length, 1);
assert.ok(!JSON.stringify(roomCards[0]).includes('show_scenes_phone'), 'room header does not read the phone switch');
assert.ok(!JSON.stringify(T.casora_mobile_sensor_chips).includes('casora_badge_scene_group'), 'phone room page: no scenes badge');
// Phone room page: scenes have their own area there, the badge stays off whatever the switch says.
const prbv = new Function('PHONE_ROOM_OVERRIDE', 'phoneRoomLegacyVars',
  block(panel, 'function phoneRoomBadgeVars(desk, chip, name) {', '\n}\n') + '\nreturn phoneRoomBadgeVars;')([], () => ({}));
assert.equal(prbv({ show_scenes: true, show_scenes_phone: true }, null, 'Küche').show_scenes, false, 'phone room: no scenes badge');

// ── Studio ───────────────────────────────────────────────────────────────────────────────────────────
// Preview (miniphone): the Home row passes "scenes" and _miniModel draws it only with the switch.
const PF = new Function(/^const PHONE_FILTERS = [^;]*;/m.exec(panel)[0] + '\nreturn PHONE_FILTERS;')();
assert.ok(PF.includes('scenes'), 'phone preview row lets the Scenes badge through');
assert.ok(panel.includes('if (V.show_scenes === true && (!forPhone || V.show_scenes_phone === true)) {'),
  'preview: desktop as before, phone only with show_scenes_phone');
// Switch in the Scenes section, only when scenes show as a badge, on Home (rooms[0], next to show_scenes),
// as a draft (_markDirty, no save), off by default.
const sw = block(addons, '// #243: on the phone the Home scenes', '\n    return r;');
assert.ok(/mode === "badge" && \(\(this\._state && this\._state\.compact && this\._state\.compact\.rooms\) \|\| \[\]\)\[0\]/.test(sw), 'only in badge mode, on rooms[0]');
assert.ok(sw.includes('"Also show on the phone"'), 'label');
assert.ok(/this\._boolSwitch\(home\.variables\.show_scenes_phone === true, false,/.test(sw), 'off by default');
assert.ok(sw.includes('this._markDirty();') && !/_save\(|_csSave\(/.test(sw), 'a draft: marks dirty, never saves');
assert.ok(sw.includes('delete home.variables.show_scenes_phone'), 'off is stored by absence');
// Translations in every Studio language.
for (const l of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const ex = JSON.parse(read(`custom_components/casora/translations/panel/${l}.json`)).exact;
  assert.ok(ex['Also show on the phone'], l + ': label');
  assert.ok(ex['The Scenes badge then also stands in the badge row of Home on the phone. The Scenes button at the bottom stays.'], l + ': hint');
}

console.log('ok phone_home_scenes_badge');
