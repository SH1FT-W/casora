// Issue 119 (26.11.9): „Tap on badges“ (Studio › Controls › Tiles, variable badge_tap). „Open popup“ (default, as
// before): a tap on the light badge opens its popup or sub-row, holding a lamp chip switches it. „Switch the light“:
// a tap switches (the lamp, or the badge's lamps), holding opens the popup. Only the light badge and its lamp chips,
// desktop and phone. All devices invented.   node dev/unit/badge_tap_mode.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (tpl, ctx) => new Function('entity', 'states', 'hass', 'variables', body(tpl))(ctx.entity, ctx.states, ctx.hass, ctx.variables);

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
let mode = false;
window.casoraBadgeTapToggle = () => mode;
window.casoraPopupAction = () => 'fire-dom-event';

// ── lamp chip (casora_badge_light) ──────────────────────────────────────────────
const lamp = { entity_id: 'light.desk_lamp', state: 'off', attributes: {} };
const states = { 'light.desk_lamp': lamp, 'light.shelf': { state: 'on', attributes: {} }, 'light.porch': { state: 'off', attributes: {} },
  'light.living': { state: 'off', attributes: { entity_id: ['light.desk_lamp', 'light.shelf'] } } };
const chip = T.casora_badge_light;
const c = { entity: lamp, states, hass: { states }, variables: {} };
mode = false;
assert.equal(run(chip.tap_action.action, c), 'fire-dom-event', 'default: a tap opens the popup');
assert.equal(run(chip.hold_action.action, c), 'call-service', 'default: holding switches');
mode = true;
assert.equal(run(chip.tap_action.action, c), 'call-service', 'switch: a tap switches');
assert.equal(run(chip.hold_action.action, c), 'fire-dom-event', 'switch: holding opens the popup');
for (const a of [chip.tap_action, chip.hold_action]) {
  assert.equal(a.service, 'casora.light_smart_toggle');
  assert.equal(run(a.service_data.light_entity, c), 'light.desk_lamp');
}
assert.equal(run(chip.hold_action.entity, c), 'light.desk_lamp', 'the popup knows its lamp when held');
assert.equal(chip.hold_action.haptic, 'medium');
mode = true; window.casoraPopupAction = () => 'more-info';
assert.equal(run(chip.hold_action.action, c), 'more-info', 'without Casora popups holding opens HA\'s dialog');
window.casoraPopupAction = () => 'fire-dom-event';

// ── collective badge „Beleuchtung“ (casora_badge_light_group) ──────────────────
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraLightScope = function');
new Function(basis.slice(b0, basis.indexOf('window.casoraRoomTempOf = function', b0)))();
window._casoraHouseLights = () => ({ rooms: [], ids: [], subs: [] });
const sel = { entity_id: 'input_select.casora_expanded_row', state: 'none' };
const call = (vars, st = states) => window.casoraLightBadgeCall(sel, st, { states: st }, vars);
assert.deepEqual(call({ entity_1: 'light.desk_lamp', entity_2: 'light.porch' }),
  { service: 'light.turn_on', data: { entity_id: ['light.desk_lamp', 'light.porch'] } }, 'all off: all on');
assert.deepEqual(call({ entity_1: 'light.shelf', entity_2: 'light.porch' }),
  { service: 'light.turn_off', data: { entity_id: ['light.shelf', 'light.porch'] } }, 'one on: all off');
assert.deepEqual(call({ light_group_entity: 'light.living' }),
  { service: 'casora.light_smart_toggle', data: { light_entity: 'light.living' } }, 'its HA group alone: smart toggle');
assert.equal(call({ light_group_entity: 'light.living', entity_1: 'light.porch' }).service, 'light.turn_on', 'picked lamps win over the group');
assert.equal(call({}), null, 'nothing to switch');
assert.deepEqual(window.casoraLightBadgeCall(lamp, states, { states }, {}),
  { service: 'casora.light_smart_toggle', data: { light_entity: 'light.desk_lamp' } }, 'a lamp chip switches its lamp');

const grp = T.casora_badge_light_group;
const g = { entity: sel, states: { ...states, 'input_select.casora_expanded_row': { state: 'none' } }, hass: { states }, variables: { entity_1: 'light.shelf' } };
mode = false;
assert.equal(run(grp.tap_action.service, g), 'input_select.select_option', 'default: a tap opens the sub-row');
assert.deepEqual(run(grp.tap_action.service_data, g), { entity_id: 'input_select.casora_expanded_row', option: 'lights' });
mode = true;
assert.equal(run(grp.tap_action.service, g), 'light.turn_off', 'switch: a tap switches the badge\'s lamps');
assert.deepEqual(run(grp.tap_action.service_data, g), { entity_id: ['light.shelf'] });
assert.ok(/casoraPopupAction\(\) === 'fire-dom-event' \? 'fire-dom-event' : 'none'/.test(grp.hold_action.action), 'holding still opens the popup');

// Issue 119, second round (owner, „Variante 1“): with lamps of its own in the sub-row the collective badge opens that
// row on a tap in the switch mode too (else the single lamps were out of reach); switching them all stays in the
// popup („Alle an/aus“). Only a badge without a row of lamps (one lamp) switches on a tap.
const withRow = (variables, st = g.states) => ({ ...g, states: st, hass: { states: st }, variables });
for (const [name, vars] of [['two picked lamps', { entity_1: 'light.shelf', entity_2: 'light.porch' }],
  ['its HA group alone', { light_group_entity: 'light.living' }], ['a group as its only slot', { entity_1: 'light.living' }]]) {
  for (const m of [false, true]) {
    mode = m;
    assert.equal(run(grp.tap_action.service, withRow(vars)), 'input_select.select_option', name + (m ? ', switch' : ', default') + ': a tap opens the sub-row');
    assert.deepEqual(run(grp.tap_action.service_data, withRow(vars)), { entity_id: 'input_select.casora_expanded_row', option: 'lights' }, name);
  }
}
mode = true;
assert.equal(run(grp.tap_action.service, withRow({ entity_1: 'light.porch' })), 'light.turn_on', 'one lamp, no row: a tap switches it');
{
  // Home without an HA group (light_rooms_auto): the sub-row lists the rooms' groups or lamps (_casoraHouseLights().subs).
  const keep = window._casoraHouseLights;
  window._casoraHouseLights = () => ({ rooms: [], ids: ['light.desk_lamp', 'light.porch'], subs: ['light.desk_lamp', 'light.porch'] });
  assert.equal(run(grp.tap_action.service, withRow({ light_rooms_auto: true })), 'input_select.select_option', 'house rooms: a tap opens the row');
  window._casoraHouseLights = () => ({ rooms: [], ids: ['light.porch'], subs: ['light.porch'] });
  assert.equal(run(grp.tap_action.service, withRow({ light_rooms_auto: true })), 'light.turn_on', 'house with one lamp: a tap switches');
  window._casoraHouseLights = keep;
}

// ── phone: Home light badge and the room page's light badge ────────────────────
const phoneHome = T.casora_mobile_filter_badges.custom_fields.badges.card.cards[2];
assert.equal(phoneHome.template, 'casora_badge_light_group');
const phoneRoom = T.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards
  .find((x) => x.template === 'casora_badge_light_group');
// Their tap_action is a template of the row card (button-card evaluates a nested card's config with the outer card's
// variables): Home sees casora_mobile_filter_badges' light_entity_1 …, the room page the desktop room's in casora_rv.
const homeCtx = (lights) => ({ ...g, entity: { entity_id: 'input_select.casora_mobile_filter' }, variables: { ...lights, casora_hv: null } });
const roomCtx = (lights) => ({ ...g, entity: null, variables: { casora_rv: lights } });
for (const [name, card, ctx] of [['phone Home', phoneHome, homeCtx], ['phone room', phoneRoom, roomCtx]]) {
  mode = false;
  assert.equal(run(card.tap_action.action, ctx({ light_entity_1: 'light.shelf' })), 'fire-dom-event', name + ': default opens the popup or row');
  assert.equal(run(card.tap_action.action, ctx({ light_entity_1: 'light.shelf', light_entity_2: 'light.porch' })), 'fire-dom-event', name + ': default');
  mode = true;
  assert.equal(run(card.tap_action.action, ctx({ light_entity_1: 'light.shelf' })), 'call-service', name + ': switch mode, one lamp: a tap switches');
  // With lamps of its own (two picked, or a group) the switch mode keeps the default tap (Home: the light popup with
  // the lamps, room page: the sub-row of lamps, casora_phone_row), never a service call.
  for (const lights of [{ light_entity_1: 'light.shelf', light_entity_2: 'light.porch' }, { light_group_entity: 'light.living' }, { light_entity_1: 'light.living' }]) {
    assert.equal(run(card.tap_action.action, ctx(lights)), 'fire-dom-event', name + ': lamps of its own open as by default ' + JSON.stringify(lights));
  }
}
// The badge's own service and data (evaluated with its own variables) agree with the row card's question.
mode = true;
assert.equal(run(grp.tap_action.service, withRow({ entity_1: 'light.shelf' })), 'light.turn_off');
{
  // The Home badge without an HA group (desktop overview room with light_rooms_auto, casora_hv): the house's rooms.
  const keep = window._casoraHouseLights;
  window._casoraHouseLights = () => ({ rooms: [], ids: ['light.desk_lamp', 'light.porch'], subs: ['light.desk_lamp', 'light.porch'] });
  assert.equal(run(phoneHome.tap_action.action, { ...homeCtx({}), variables: { casora_hv: { light_rooms_auto: true } } }), 'fire-dom-event', 'phone Home, house rooms: popup');
  window._casoraHouseLights = keep;
}
assert.equal(phoneRoom.tap_action.casora_phone_row, 'lights', 'the phone room badge keeps its row event');
assert.ok(read('tools/phone_room_badges.py').includes('casoraLightBadgeTapFrom(states, hass, _rv,'), 'derivation writes it');

// ── setting: declared on the room card and the phone shell, read by casora-core ──
assert.ok('badge_tap' in T.casora_room.variables, 'casora_room declares badge_tap (Studio writes every room)');
assert.ok('badge_tap' in T.casora_mobile_bg.variables, 'casora_mobile_bg declares badge_tap (Studio mirrors it to the phone)');
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  const start = core.indexOf('(function () {\n  if (window._casoraHoldWatch) return;');
  const block = core.slice(start, core.indexOf('})();\n', start) + 6);
  const w = { addEventListener: () => {} };
  let config = null;
  const root = { isConnected: true, get lovelace() { return { config }; } };
  const doc = { querySelector: (s) => (s === 'hui-root' ? root : null), querySelectorAll: () => [] };
  new Function('window', 'document', 'setTimeout', 'location', block)(w, doc, () => {}, { pathname: '/casora/home' });
  assert.equal(w._casoraBadgeTap, 'popup', 'default popup');
  const view = (vars) => ({ path: 'home', cards: [{ type: 'custom:button-card', template: 'casora_room', variables: vars }] });
  assert.equal(w._casoraBadgeTapOf({ views: [view({ badge_tap: 'toggle' })] }), 'toggle', 'desktop: room card');
  assert.equal(w._casoraBadgeTapOf({ views: [view({ badge_tap: 'x' })] }), 'popup', 'unknown = popup');
  const phone = { views: [{ path: 'home', cards: [{ type: 'custom:layout-card', cards: [
    { type: 'custom:button-card', template: 'casora_mobile_bg', variables: { badge_tap: 'toggle' } }] }] }] };
  assert.equal(w._casoraBadgeTapOf(phone), 'toggle', 'phone: casora_mobile_bg');
  assert.equal(w.casoraBadgeTapToggle(), false, 'no dashboard config yet');
  config = { views: [view({ badge_tap: 'toggle' })] };
  assert.equal(w.casoraBadgeTapToggle(), true, 'reads the open dashboard');
}
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(/key: "badge_tap", sub: "hold", label: "Tap on badges", type: "select", auto: true, scope: "dashboard",\s*options: \["", "toggle"\]/.test(panel), 'Studio field next to Hold on tiles');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json'));
const flat = JSON.stringify(de);
assert.ok(flat.includes('"Tap on badges":"Tippen auf Badges"') && flat.includes('"Switch the light":"Licht schalten"'), 'German labels');
console.log('ok badge_tap_mode');
