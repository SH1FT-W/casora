// Completeness of the setup suggestions against the test house (dev/casora_mock, via dev/casora_mock/haus.py):
// every light, cover, thermostat and lock with an area turns up in casoraAssist.suggest in the room of its area,
// and "Start fresh" (casoraBasis.plan) puts it in that room, or it has a named reason in REASONS below.
// Lamps behind a hub went missing from 1.0.3 to 26.10.41 because the test house had none and no test checked
// that nothing is missing. A new exception has to be added to REASONS on purpose, with its rule.
//   node dev/unit/setup_completeness.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

const hass = testhaus();
const { I } = await loadPanel();
const A = window.casoraAssist, B = window.casoraBasis;
assert.ok(A && B, 'assistant and basis loaded');

const R = hass.entities, D = hass.devices, S = hass.states;
const areaName = (eid) => {
  const e = R[eid] || {};
  const aid = e.area_id || (D[e.device_id] || {}).area_id;
  return aid && hass.areas[aid] ? hass.areas[aid].name : null;
};
const DOMAINS = ['light', 'cover', 'climate', 'lock'];
const inScope = Object.keys(R).filter((eid) => DOMAINS.includes(eid.split('.')[0]) && S[eid] && areaName(eid)).sort();

// Named reasons why a device is not suggested on its own. Each has a rule; nothing is excused by name.
const types = I.TILE_TYPES.filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(hass)));
const rooms = [{ name: 'Home', path: 'home', tiles: [] }]
  .concat(Object.values(hass.areas).map((a) => ({ name: a.name, tiles: [] })));
const sugg = A.suggest(hass, rooms, types);
const OWN_TILE = new Set(['casora_3d_printer', 'casora_dishwasher', 'casora_washer', 'casora_dryer']);
const REASONS = [
  { id: 'hidden', why: 'hidden in Home Assistant', test: (eid) => !!R[eid].hidden },
  { id: 'category', why: 'config or diagnostic entity (status LED of a router or camera, settings)', test: (eid) => !!R[eid].entity_category },
  // Group helpers and Hue rooms have no device: "Start fresh" places them by their area (checked below).
  { id: 'no_device', why: 'no device (group helper), placed by "Start fresh" through its area',
    test: (eid) => !R[eid].device_id && /^(light|cover)\./.test(eid) },
  // The chamber light of a 3D printer and the like belong to the device's own tile.
  { id: 'part_of_device', why: 'part of a device with its own tile (printer chamber light …)',
    test: (eid) => sugg.some((x) => x.device === R[eid].device_id && OWN_TILE.has(x.type)) },
];

const missing = [], wrongRoom = [], excused = new Map();
inScope.forEach((eid) => {
  const hit = sugg.find((x) => x.entity === eid);
  if (hit) { if (hit.room !== areaName(eid)) wrongRoom.push(`${eid}: ${hit.room} instead of ${areaName(eid)}`); return; }
  const r = REASONS.find((x) => x.test(eid));
  if (r) { excused.set(eid, r.id); return; }
  missing.push(`${eid} (area ${areaName(eid)}, device ${R[eid].device_id || '-'})`);
});
assert.deepEqual(missing, [], 'not suggested and no reason in REASONS:\n  ' + missing.join('\n  '));
assert.deepEqual(wrongRoom, [], 'suggested in the wrong room:\n  ' + wrongRoom.join('\n  '));

// The made-up hub lamps and the thermostat behind the coordinator are always part of it (hubs.py).
const HUB = {
  'light.werkbanklampe': 'Garage', 'light.palmenleuchte': 'Garten', 'light.deckenlicht_garage': 'Garage',
  'light.werkbank_spots': 'Garage', 'light.wandlicht_garten': 'Garten', 'climate.heizkoerper_garage': 'Garage',
};
Object.entries(HUB).forEach(([eid, room]) => {
  const hit = sugg.find((x) => x.entity === eid);
  assert.ok(hit, eid + ' suggested');
  assert.equal(hit.room, room, eid + ' in its room');
});

// "Start fresh": the plan with all rooms holds every light/cover/thermostat/lock in its room, also within a group tile
// (group: ids) or through a light group helper that replaced its members.
const plan = B.plan(hass, Object.values(hass.areas).map((a) => a.name), Object.assign({}, B.DEFAULTS));
const membersOf = (id) => [].concat(((S[id] || {}).attributes || {}).entity_id || []);
const holds = (item, eid, seen = new Set()) => {
  const ids = [].concat(item.group || [], item.entity || []);
  const deep = (id) => id === eid || (!seen.has(id) && (seen.add(id), membersOf(id).some(deep)));
  return ids.some(deep);
};
// The status LED rule of "Start fresh" (setting "Leave out status LEDs") only applies there.
const LED = /(^|_)status_led$/;
const planMissing = [];
inScope.filter((eid) => !excused.has(eid) || excused.get(eid) === 'no_device').forEach((eid) => {
  const room = plan.rooms.find((r) => r.name === areaName(eid));
  if (room && room.items.some((x) => holds(x, eid))) return;
  if (excused.get(eid) === 'no_device' && !membersOf(eid).length) return;
  if (LED.test(eid.split('.')[1]) && /^light\./.test(eid)) return;
  planMissing.push(`${eid} (area ${areaName(eid)})`);
});
assert.deepEqual(planMissing, [], '"Start fresh" leaves out:\n  ' + planMissing.join('\n  '));
Object.entries(HUB).forEach(([eid, room]) => {
  assert.ok(plan.rooms.find((r) => r.name === room).items.some((x) => holds(x, eid)), eid + ' in "Start fresh" for ' + room);
});

const counts = {};
excused.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
console.log(`setup_completeness: ok (${inScope.length} with an area${hass._fixture ? '' : ', made-up devices only'}; `
  + `reasons: ${REASONS.map((r) => r.id + ' ' + (counts[r.id] || 0)).join(', ')})`);
