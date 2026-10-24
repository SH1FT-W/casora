// First use of every Community card against the test house (dev/casora_mock, via dev/casora_mock/haus.py):
// with the card added under Community, (a) adding the tile suggests the test device as a sure match
// (_tileCandidates) and (b) "What should go on the dashboard?" (_uxDevices) offers the device as that card.
// Issue #25: the new pet card did not find its device although the test house had one. A new Community card
// without a test device in TEST_DEVICES fails here: add a made-up device to dev/casora_mock and list it.
//   node dev/unit/community_first_use.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

// Community card → made-up devices (dev/casora_mock keys) the card has to find.
const TEST_DEVICES = {
  casora_pet: ['testhund_tracker'], // haustier.py: the tracker carries the device_tracker, the pet hangs behind it
  casora_frigate: ['frigate_testhof'], // frigate.py
  casora_reolink_doorbell: ['testklingel'], // klingel.py
  casora_chart: ['testserver'], // testserver.py: System-Monitor-like CPU load, memory, temperature
  casora_velair: ['testklimaanlage'], // velair.py: air conditioner planned by Velair (zone sensors under the platform velair)
};

const hass = testhaus();
const { P, I } = await loadPanel();
const community = I.TILE_TYPES.filter((t) => t.community && !t.community.retired);
// Mower and coffee machine are regular cards now (first use: maeher_erstnutzer.mjs, coffee_first_use.mjs).
assert.ok(community.length >= 3, 'community cards loaded');
const unknown = community.filter((t) => !TEST_DEVICES[t.id]).map((t) => t.id);
assert.deepEqual(unknown, [], 'Community card without a test device – add one to dev/casora_mock and to TEST_DEVICES');
window.casoraCommunityOn = new Set(community.map((t) => t.id));

const R = hass.entities, D = hass.devices;
const devOf = (eid) => ((R[eid] || {}).device_id || '').replace(/^dev_/, '');
const rooms = [{ path: 'home', name: 'Home', tiles: [], variables: {} }]
  .concat(Object.values(hass.areas).map((a) => ({ path: a.area_id, name: a.name, area: a.area_id, tiles: [], variables: {} })));
const panel = (ri) => {
  const p = Object.create(P);
  p._hass = hass;
  p._state = { compact: { rooms } };
  p._room = ri;
  return p;
};
const roomOfDev = (key) => {
  const aid = (D['dev_' + key] || {}).area_id;
  const i = aid ? rooms.findIndex((r) => r.area === aid) : -1;
  return i > 0 ? i : 0;
};

const offered = panel(0)._uxDevices();
const fails = [];
community.forEach((t) => {
  assert.ok(!t.onlyIf || t.onlyIf(hass), t.id + ' is offered with the card added');
  TEST_DEVICES[t.id].forEach((key) => {
    assert.ok(D['dev_' + key], `${t.id}: test device ${key} exists in the test house`);
    const ri = roomOfDev(key);
    const cands = P._tileCandidates.call(panel(ri), t, rooms[ri]);
    const c = cands.find((x) => devOf(x.id) === key);
    if (!c) fails.push(`${t.id}: adding the tile does not suggest ${key} (${cands.slice(0, 3).map((x) => x.id).join(', ') || 'nothing'})`);
    else if (!c.sure) fails.push(`${t.id}: ${key} suggested, but not as a sure match (${c.id})`);
    const o = offered.find((x) => devOf(x.entity) === key && x.type === t.id);
    if (!o) {
      const other = offered.filter((x) => devOf(x.entity) === key).map((x) => x.entity + ' as ' + x.type);
      fails.push(`${t.id}: "What should go on the dashboard?" does not offer ${key} as this card (${other.join(', ') || 'not at all'})`);
    }
  });
});
assert.deepEqual(fails, [], 'first use of the Community cards:\n  ' + fails.join('\n  '));
console.log(`community_first_use: ok (${community.map((t) => t.id).join(', ')})`);
