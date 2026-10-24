// The coffee machine is a regular device card (formerly a community card): without anything added under Community,
// every made-up coffee machine of the test house (dev/casora_mock/coffee.py) is found on first use –
//   (a) "Add a tile" → Coffee machine suggests it as a sure match (_tileCandidates; nothing chosen = it is picked),
//   (b) "What should go on the dashboard?" (_uxDevices) offers it as a coffee tile, its power switch not again as a switch,
//   (c) the setup assistant (casoraAssist.suggest) proposes a coffee tile for it, like for a dishwasher.
// A grinder on a plug is no coffee machine (name rule of the generic plug fallback).
//   node dev/unit/coffee_first_use.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

// Made-up machines (dev/casora_mock keys) → anchor entity the tile should get.
const MACHINES = {
  testbarista: 'sensor.testbarista_operation_state', // Home Connect (core)
  morgenbohne: 'switch.morgenbohne_power', // De'Longhi BT: status sensor is diagnostic, the power switch carries the tile
  bohnenwerk: 'sensor.bohnenwerk_status', // power-curve integration
  kaffeeinsel: 'sensor.kaffeeinsel_operation_state', // homeconnect_ws
  espressobar: 'switch.espressobar_steckdose', // generic plug on a device named like a coffee machine
};

const hass = testhaus();
const { P, I } = await loadPanel();
window.casoraCommunityOn = new Set();
const type = I.TILE_TYPES.find((t) => t.id === 'casora_coffee');
assert.ok(type, 'coffee tile type');
assert.equal(type.community, undefined, 'a regular card, not a community card');
assert.ok(!type.onlyIf || type.onlyIf(hass), 'offered without adding anything under Community');

const R = hass.entities, D = hass.devices;
const devOf = (eid) => ((R[eid] || {}).device_id || '').replace(/^dev_/, '');
const rooms = [{ path: 'home', name: 'Home', tiles: [], variables: {} }]
  .concat(Object.values(hass.areas).map((a) => ({ path: a.area_id, name: a.name, area: a.area_id, tiles: [], variables: {} })));
const panel = () => {
  const p = Object.create(P);
  p._hass = hass;
  p._state = { compact: { rooms } };
  p._room = 0;
  return p;
};

const fails = [];
const cands = P._tileCandidates.call(panel(), type, rooms[0]);
const offered = panel()._uxDevices();
const types = I.TILE_TYPES.filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(hass)));
const sugg = window.casoraAssist.suggest(hass, rooms.map((r) => ({ name: r.name, path: r.path, tiles: [] })), types);
Object.entries(MACHINES).forEach(([key, anchor]) => {
  assert.ok(D['dev_' + key], `test device ${key} exists in the test house`);
  const c = cands.find((x) => devOf(x.id) === key);
  if (!c) fails.push(`add tile: ${key} not suggested (${cands.map((x) => x.id).join(', ')})`);
  else {
    if (!c.sure) fails.push(`add tile: ${key} not a sure match`);
    if (c.id !== anchor) fails.push(`add tile: ${key} on ${c.id}, expected ${anchor}`);
  }
  const o = offered.filter((x) => devOf(x.entity) === key);
  if (!o.some((x) => x.type === 'casora_coffee' && x.entity === anchor)) fails.push(`device list: ${key} not offered as coffee machine (${o.map((x) => x.entity + ' as ' + x.type).join(', ') || 'not at all'})`);
  if (o.some((x) => x.type === 'casora_switch')) fails.push(`device list: ${key} also offered as a switch`);
  const s = sugg.find((x) => devOf(x.entity) === key);
  if (!s || s.type !== 'casora_coffee' || s.entity !== anchor) fails.push(`assistant: ${key} → ${s ? s.entity + ' as ' + s.type : 'nothing'}`);
});
// Sure matches only: every suggestion is a coffee machine of the list (no plug, thermometer or select of another device).
cands.forEach((x) => { if (!MACHINES[devOf(x.id)]) fails.push(`add tile: ${x.id} suggested, no coffee machine`); });
assert.ok(D.dev_kaffeemuehle, 'test grinder exists');
if (cands.some((x) => devOf(x.id) === 'kaffeemuehle') || offered.some((x) => devOf(x.entity) === 'kaffeemuehle' && x.type === 'casora_coffee'))
  fails.push('the grinder on a plug is taken for a coffee machine');
assert.deepEqual(fails, [], 'first use of the coffee card:\n  ' + fails.join('\n  '));
console.log(`coffee_first_use: ok (${Object.keys(MACHINES).join(', ')})`);
