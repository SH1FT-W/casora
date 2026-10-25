// #64 (lights): Home without an HA light group covering the house (light_rooms_auto, 26.10.59). The badge
// "Beleuchtung · 1 An" counted the rooms' lights and its tap set casora_expanded_row to "lights", but the sub-row
// badges_lights of casora_room only showed for light_entity_1 / light_group_entity – with light_rooms_auto alone it
// stayed display:none, so the tap opened nothing (desktop and tablet). Now the sub-row follows the badge's own rule.
// Also checks that every group badge of the room header shows its sub-row under the same condition as the badge.
//   node dev/unit/home_light_subrow.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.window = globalThis;

const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (s, ctx) => (typeof s === 'string' && s.trim().startsWith('[[[')
  ? new Function('variables', 'states', 'hass', 'user', 'entity', body(s)).call(ctx.self || {}, ctx.variables, ctx.states, ctx.hass, ctx.user, null)
  : s);
const styleOf = (list, prop) => (list.find((x) => prop in x) || {})[prop];

// A house with two rooms; one lamp is on.
const states = {
  'input_select.casora_expanded_row': { state: 'lights', attributes: {} },
  'input_boolean.casora_mobile_navigation': { state: 'off', attributes: {} },
  'light.kitchen': { state: 'on', attributes: { friendly_name: 'Kitchen' } },
  'light.bath': { state: 'off', attributes: { friendly_name: 'Bath' } },
};
const hass = { states, user: { id: 'u', is_admin: true } };
const rooms = [{ name: 'Kitchen', vars: { light_entity_1: 'light.kitchen' } }, { name: 'Bath', vars: { light_entity_1: 'light.bath' } }];
new Function(read('custom_components/casora/scripts/local/01-basis.js').match(/window\._casoraHouseLightsOf = function[\s\S]*?\n};\n/)[0])();
window._casoraHouseLights = (h) => window._casoraHouseLightsOf(rooms, h.states);

const room = T.casora_room;
const variables = { light_rooms_auto: true };
const ctx = { variables, states, hass, user: hass.user };

// The badge counts the rooms' lights.
const badgeCard = room.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_light_group');
assert.equal(run(badgeCard.variables.enabled, ctx), true, 'Home light badge shown');
const grp = T.casora_badge_light_group;
const name = run(grp.name, { variables: Object.assign({}, variables, { title: null }), states, hass, user: hass.user });
assert.match(name, /1 An/, 'badge says "1 An"');

// Its sub-badges exist …
const subs = room.custom_fields.badges_lights.card.cards.filter((c) => run(c.variables.enabled, ctx));
assert.equal(subs.length, 2, 'one sub-badge per room');

// … and the expanded sub-row is visible.
const st = room.styles.custom_fields.badges_lights;
assert.equal(run(styleOf(st, 'display'), ctx), 'block', 'sub-row displayed');
assert.notEqual(String(run(styleOf(st, 'max-height'), ctx)), '0', 'sub-row not collapsed');
assert.notEqual(Number(run(styleOf(st, 'opacity'), ctx)), 0, 'sub-row not transparent');
assert.equal(run(styleOf(st, 'visibility'), ctx), 'visible');

// Without lights at all, the row stays hidden.
assert.equal(run(styleOf(st, 'display'), { variables: {}, states, hass, user: hass.user }), 'none');

// Same rule for every group badge: where the badge shows (enabled true), its sub-row is not display:none.
const pairs = { casora_badge_light_group: 'badges_lights', casora_badge_climate_group: 'badges_climate',
  casora_badge_media_group: 'badges_media', casora_badge_presence_group: 'badges_presence' };
const samples = [
  { light_rooms_auto: true }, { light_entity_1: 'light.kitchen' }, { light_group_entity: 'light.kitchen' },
  { climate_entity_1: 'climate.x' }, { temp_sensor_1: 'sensor.t' }, { humidity_sensor: 'sensor.h' },
  { media_player_1: 'media_player.a' }, { presence_entity_1: 'person.a', presence_entity_2: 'person.b' },
];
for (const [tpl, field] of Object.entries(pairs)) {
  const card = room.custom_fields.badges.card.cards.find((c) => c.template === tpl);
  for (const v of samples) {
    const c = { variables: v, states, hass, user: hass.user };
    if (!run(card.variables.enabled, c)) continue;
    assert.equal(run(styleOf(room.styles.custom_fields[field], 'display'), c), 'block', `${field} for ${JSON.stringify(v)}`);
  }
}
console.log('home_light_subrow: ok');
