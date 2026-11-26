// Home's light badge and rooms only some people see (Prüfrunde u10-03): a room set to "admin only" left the child's
// room bar, but Home's light badge still listed it as a sub-badge ("Büro · Aus") and counted its lamps. The house's
// lights skip rooms the viewer does not see (casoraSeesRoute, the room bar's rule); everyone else's count stays.
//   node dev/unit/haus_licht_raum_sichtbarkeit.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraHouseLightsOf
import fs from 'node:fs';
import assert from 'node:assert/strict';

const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = basis.indexOf('window._casoraHouseLightsOf = function');
assert.ok(a > 0, '_casoraHouseLightsOf');
const window = {};
new Function('window', basis.slice(a, basis.indexOf('\n};', a) + 3))(window);

const S = { 'light.qa_office': { state: 'on' }, 'light.qa_kitchen': { state: 'off' } };
const rooms = [
  { name: 'Büro', vars: { light_entity_1: 'light.qa_office', casora_users: ['admin-id'] } },
  { name: 'Küche', vars: { light_entity_1: 'light.qa_kitchen' } },
];
let viewer = 'child-id';
window.casoraSeesRoute = (route) => !route || route.users.indexOf(viewer) > -1;

let h = window._casoraHouseLightsOf(rooms, S);
assert.deepEqual(h.rooms.map((r) => r.name), ['Küche'], 'child: the office is not in the house lights');
assert.deepEqual(h.ids, ['light.qa_kitchen']);
assert.deepEqual(h.subs, ['light.qa_kitchen'], 'no sub-badge for the hidden room');

viewer = 'admin-id';
h = window._casoraHouseLightsOf(rooms, S);
assert.deepEqual(h.rooms.map((r) => r.name), ['Büro', 'Küche'], 'admin: both rooms');

// Without the dashboard's rule (Studio): every room, as before.
delete window.casoraSeesRoute;
assert.equal(window._casoraHouseLightsOf(rooms, S).rooms.length, 2, 'no viewer known: every room');
console.log('ok haus_licht_raum_sichtbarkeit');
