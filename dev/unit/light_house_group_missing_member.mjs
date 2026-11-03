// Setup (badgesOf, 02.11.2026): an HA group holding exactly the ticked lights stands alone for the house (Home's light
// badge). A member HA does not know (a lamp removed from HA, still listed in the group) made the group look like it
// held more than the ticked lights: Home got the group plus the lights in the slots, or – more than ten – followed the
// rooms (gate 03.11.2026, phone_preview_twin with the private test house). A missing member is no foreign lamp.
//   node dev/unit/light_house_group_missing_member.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

const hass = testhaus({ publicOnly: true });
await loadPanel();
const B = window.casoraBasis;
const areas = Object.values(hass.areas).map((a) => a.name);
const lightsOf = (plan) => {
  const out = [];
  plan.rooms.slice(1).forEach((r) => r.items.filter((x) => x.on && x.type === 'light').forEach((x) => out.push(...(x.group || [x.entity]))));
  return B.topUnits(hass, out);
};
const ticked = lightsOf(B.plan(hass, areas, Object.assign({}, B.DEFAULTS)));
assert.ok(ticked.length > 1, 'public test house has lights in rooms: ' + ticked.length);
for (const [tag, extra] of [['exact', []], ['plus a member missing in HA', ['light.qa_removed_lamp']]]) {
  hass.states['light.qa_house_all'] = { entity_id: 'light.qa_house_all', state: 'off', attributes: { friendly_name: 'Alle Lichter', entity_id: ticked.concat(extra) } };
  const plan = B.plan(hass, areas, Object.assign({}, B.DEFAULTS));
  const { vars } = B.tilesOf(plan, hass);
  const v = vars[plan.rooms[0].name] || {};
  assert.equal(v.light_group_entity, 'light.qa_house_all', tag + ': Home follows the HA group');
  assert.ok(!v.light_entity_1 && v.light_rooms_auto !== true, tag + ': the group alone (no slots, not the rooms): ' + JSON.stringify(v.light_entity_1));
}
delete hass.states['light.qa_house_all'];
console.log('ok light_house_group_missing_member');
