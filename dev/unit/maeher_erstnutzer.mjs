// First use of the robot lawn mower as a regular device card (no longer a Community card, 26.10): against the test
// house (dev/casora_mock/maeher.py: Gardena-, Husqvarna- and Landroid-like mowers), without adding anything under
// Community, (a) the tile type is offered, (b) adding the tile without choosing suggests a mower as a sure match
// (_tileCandidates), (c) "What should go on the dashboard?" (_uxDevices) offers every mower as this card, and
// (d) the device assistant suggests each mower as casora_lawn_mower, not as buttons or switches of the device.
//   node dev/unit/maeher_erstnutzer.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

const hass = testhaus({ publicOnly: true });
const { P, I } = await loadPanel();
window.casoraCommunityOn = new Set();
const MOWERS = ['lawn_mower.testmaeher_lawn_mower', 'lawn_mower.rasenpilot', 'lawn_mower.grasfuchs'];
MOWERS.forEach((id) => assert.ok(hass.states[id], 'test house has ' + id));

const type = I.TILE_TYPES.find((t) => t.id === 'casora_lawn_mower');
assert.ok(type, 'tile type exists');
assert.ok(!type.community, 'not a Community card');
assert.ok(!type.onlyIf || type.onlyIf(hass), 'offered without adding anything');

const rooms = [{ path: 'home', name: 'Home', tiles: [], variables: {} }]
  .concat(Object.values(hass.areas).map((a) => ({ path: a.area_id, name: a.name, area: a.area_id, tiles: [], variables: {} })));
const p = Object.create(P);
p._hass = hass;
p._state = { compact: { rooms } };
p._room = 0;

const cands = P._tileCandidates.call(p, type, rooms[0]);
MOWERS.forEach((id) => {
  const c = cands.find((x) => x.id === id);
  assert.ok(c, 'adding the tile suggests ' + id + ' (got ' + cands.map((x) => x.id).join(', ') + ')');
  assert.ok(c.sure, id + ' as a sure match');
});
assert.ok(cands.every((x) => x.id.startsWith('lawn_mower.')), 'only mowers: ' + cands.map((x) => x.id));

const offered = p._uxDevices();
MOWERS.forEach((id) => {
  const o = offered.find((x) => x.entity === id);
  assert.ok(o, '"What should go on the dashboard?" offers ' + id);
  assert.equal(o.type, 'casora_lawn_mower', id + ' as the mower card');
});
// The mower's own buttons/switches (park, schedule, work areas) are part of the card, not extra tiles.
const R = hass.entities;
const devs = new Set(MOWERS.map((id) => (R[id] || {}).device_id));
const extra = offered.filter((x) => devs.has((R[x.entity] || {}).device_id) && x.type !== 'casora_lawn_mower');
assert.deepEqual(extra.map((x) => x.entity + ' as ' + x.type), [], 'no separate tiles for the mower devices');

const sugg = window.casoraAssist.suggest(hass, rooms.map((r) => ({ name: r.name, tiles: [] })), I.TILE_TYPES.filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(hass))));
MOWERS.forEach((id) => {
  const s = sugg.find((x) => x.entity === id);
  assert.ok(s, 'assistant suggests ' + id);
  assert.equal(s.type, 'casora_lawn_mower');
});
console.log('maeher_erstnutzer: ok (' + MOWERS.length + ' mowers, regular card)');
