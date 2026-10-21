// Phone start page: the badge row follows the desktop's "hidden" and "Who sees this?" switches.
//   node dev/unit/phone_start_badges.mjs
// Reported: the energy badge hidden in the Studio stayed visible on the phone (desktop hid it). The
// row (casora_mobile_filter_badges) had enabled: true on every badge and the Studio's copy at save
// time reached no phone card. Now it reads the desktop's overview room at runtime
// (casoraPhoneRoom.home, WS casora/phone_room_badges → home). Also: "Who sees this?" of the energy
// badge was ignored everywhere, because _casoraEnergyOn stood in for casoraSeen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; } };
globalThis.location = { pathname: '/qa-haus-mobile/home' };
const block = (start, end) => {
  const at = core.indexOf(start);
  assert.ok(at >= 0, 'not found: ' + start);
  return core.slice(at, core.indexOf(end, at) + end.length);
};
new Function(block('// Casora Studio „Wer sieht das?“', '\n})();\n'))();
new Function(block('window._casoraEnergyOn = function (V, user) {', '\n  };'))();
new Function(block('// Raum-Badges am Handy wie im Raum-Kopf am Desktop/Tablet', '\n})();\n'))();
assert.equal(typeof window.casoraSeen, 'function');
assert.equal(typeof window.casoraPhoneRoom.home, 'function');

// Template JS with the real parameters, as button-card calls it.
const run = (expr, variables, user) => {
  const body = String(expr).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  return new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body)(
    { 'input_select.casora_mobile_filter': { state: 'all' } }, undefined, user, {}, variables, undefined);
};

const tpl = T.casora_mobile_filter_badges;
const BID = { casora_badge_security_group: 'security', casora_badge_climate_group: 'climate',
  casora_badge_light_group: 'lights', casora_badge_presence_group: 'people',
  casora_badge_energy_group: 'energy', casora_badge_media_group: 'media' };
const cards = tpl.custom_fields.badges.card.cards;
assert.deepEqual(cards.map((c) => BID[c.template]).sort(), Object.values(BID).sort(), 'six badges');
const shown = (hv, user) => Object.fromEntries(cards.map((c) => [BID[c.template], run(c.variables.enabled, { casora_hv: hv }, user)]));
const all = (v) => Object.fromEntries(Object.values(BID).map((b) => [b, v]));

// No answer from the server (older server, no desktop dashboard): as before.
assert.deepEqual(shown(null, { id: 'u1' }), all(true), 'without overview room every badge stays');
assert.deepEqual(shown({}, { id: 'u1' }), all(true), 'nothing hidden');
// Hidden on the desktop → hidden on the phone, each badge on its own switch.
for (const b of Object.values(BID)) {
  assert.deepEqual(shown({ ['show_' + b]: false }, { id: 'u1' }), { ...all(true), [b]: false }, 'hidden: ' + b);
}
// "Who sees this?"
const users = { casora_badge_users: { energy: ['u2'], media: ['u1'] } };
assert.deepEqual(shown(users, { id: 'u1' }), { ...all(true), energy: false }, 'u1 does not see energy');
assert.deepEqual(shown(users, { id: 'u2' }), { ...all(true), media: false }, 'u2 does not see media');

// casora_hv comes from casoraPhoneRoom.home() and reads the filter helper (redraw on bump()).
assert.ok(/states\['input_select\.casora_mobile_filter'\]/.test(tpl.variables.casora_hv), 'casora_hv reads the filter helper');
assert.equal(run(tpl.variables.casora_hv, {}), null, 'nothing loaded yet');
window.casoraPhoneRoom.prime({}, { show_energy: false });
assert.deepEqual(run(tpl.variables.casora_hv, {}), { show_energy: false }, 'overview room after the answer');

// Energy gate: "Who sees this?" counts (desktop room header, phone room page, energy sub-rows).
const V = { energy_power_entity: 'sensor.example_power', casora_badge_users: { energy: ['u2'] } };
assert.equal(window._casoraEnergyOn(V, { id: 'u1' }), false, 'u1 does not see the energy badge');
assert.equal(window._casoraEnergyOn(V, { id: 'u2' }), true, 'u2 does');
assert.equal(window._casoraEnergyOn({ energy_power_entity: 'sensor.example_power' }, { id: 'u1' }), true, 'no list: everyone');
assert.equal(window._casoraEnergyOn({ ...V, show_energy: false }, { id: 'u2' }), false, 'hidden stays hidden');
const json = JSON.stringify(T);
assert.ok(!/_casoraEnergyOn\((variables|_rv)\)/.test(json), 'every template passes the user');

console.log('ok phone_start_badges');
