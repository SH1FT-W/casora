// #80: the light badge on the phone's start page. With lights picked in the badge itself (its slots), the phone
// shows exactly those (light popup, like the desktop's row of the badge's lights); without a selection (only an HA
// group, or the rooms' lights) it keeps filtering the start page by rooms.
//   node dev/unit/light_badge_phone_selection.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const a = basis.indexOf('/* #80: does a light badge'), b = basis.indexOf('/* The same from the open dashboard', a);
assert.ok(a > 0 && b > a, 'casoraLightBadgeOwn missing in 01-basis.js');
new Function(basis.slice(a, b))();
const own = window.casoraLightBadgeOwn;

assert.equal(own({ entity_1: 'light.lamp_a', entity_2: 'light.lamp_b' }), true, 'two picked lights');
assert.equal(own({ entity_1: 'light.room_group' }), true, 'one picked slot (a group too) is a selection');
assert.equal(own({ entity_3: 'light.lamp_c' }), true, 'any slot counts');
assert.equal(own({ light_group_entity: 'light.house' }), false, 'only an HA group: rooms as before');
assert.equal(own({ entity_1: 'light.lamp_a', light_rooms_auto: true }), false, 'house from the rooms');
assert.equal(own({}), false, 'nothing picked');
assert.equal(own(null), false);
assert.equal(own({ entity_1: 'switch.plug' }), false, 'not a light');
// The filter runs in casora_mobile_filter_badges, whose variables name the slots light_entity_N (found on the test HA).
assert.equal(own({ light_entity_1: 'light.lamp_a', light_group_entity: 'light.house' }), true, 'parent card variables');
assert.equal(own({ light_entity_1: 'light.lamp_a', light_rooms_auto: true }), false, 'parent: house from the rooms');

// The phone's badge (casora_mobile_filter_badges): no filter (null → the popup opens) only with a selection and popups on.
const tpl = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const card = tpl.casora_mobile_filter_badges.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_light_group');
assert.ok(card, 'light badge on the phone start page missing');
const src = String(card.tap_action.casora_filter).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (variables, cur, popups = true) => {
  window.casoraPopupAction = () => (popups ? 'fire-dom-event' : 'more-info');
  const states = { 'input_select.casora_mobile_filter': { state: cur } };
  return new Function('states', 'variables', src)(states, variables);
};
assert.equal(run({ entity_1: 'light.lamp_a', entity_2: 'light.lamp_b' }, 'all'), null, 'selection → popup, no filter');
assert.equal(run({ light_entity_1: 'light.lamp_a', light_group_entity: 'light.house' }, 'all'), null, 'phone row variables → popup');
assert.equal(run({ entity_1: 'light.lamp_a' }, 'all', false), 'lights', 'without Casora popups the filter stays');
assert.equal(run({ light_group_entity: 'light.house' }, 'all'), 'lights', 'group only → room filter');
assert.equal(run({ light_group_entity: 'light.house' }, 'lights'), 'all', 'second tap leaves the filter');
assert.equal(run({ entity_1: 'light.lamp_a', light_rooms_auto: true }, 'all'), 'lights', 'house from rooms → room filter');
// The popup handler (casora-core.js) opens the popup for a null filter; the desktop's badge keeps its row.
assert.ok(rd('custom_components/casora/scripts/casora-core.js').includes('ev.detail.casora_filter !== undefined && ev.detail.casora_filter !== null) return;'),
  'popup handler must open on a null filter');
assert.equal(tpl.casora_badge_light_group.tap_action.service_data.entity_id, 'input_select.casora_expanded_row', 'desktop row unchanged');
console.log('light_badge_phone_selection: ok');
