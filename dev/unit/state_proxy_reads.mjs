// Whole-house scans through button-card's state proxy (lag report after 26.10.60b2), without HA.
// button-card hands its templates a states proxy that subscribes the card to every entity read through it (the card
// then redraws whenever one of them changes, and every further read searches that list). securityAway, the
// door/window list (casoraContacts) and the e-bike scan read every state: the security, lock and contact badges and
// the e-bike tile were subscribed to the whole house (4700 entities on a real one) and redrew on every change.
// Expected: those helpers read only what they show through the caller's states, compute the house scan once per
// states object of HA's root element, and still see a change (away, new contact) once HA replaced its states.
//   node dev/unit/state_proxy_reads.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
let ROOT = null;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass: ROOT } : null) };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
const pop = src('03-popups.js');
const a = pop.indexOf('(function () {\n  if (window._casoraBike) return;');
const b = pop.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'e-bike block found');
new Function(pop.slice(a, b + 6))();
window.CASORA_SETTINGS = {};

// A made-up house: doors/windows, persons, an alarm, a bike and many unrelated sensors.
const st = (id, state, attrs) => ({ entity_id: id, state, attributes: { friendly_name: id, ...attrs } });
const states = {}, entities = {}, devices = { bike1: { id: 'bike1', name: 'Rad' } };
const add = (id, state, attrs, e) => { states[id] = st(id, state, attrs); entities[id] = { entity_id: id, platform: 'x', ...e }; };
add('binary_sensor.door_a', 'off', { device_class: 'door' });
add('binary_sensor.win_a', 'off', { device_class: 'window' });
add('binary_sensor.motion_a', 'off', { device_class: 'motion' });
add('person.a', 'home', {});
add('alarm_control_panel.home', 'disarmed', {});
add('sensor.rad_km', '120', { unit_of_measurement: 'km' }, { device_id: 'bike1', platform: 'bosch_ebike', translation_key: 'odometer' });
add('binary_sensor.rad_theft_reported', 'off', {}, { device_id: 'bike1', platform: 'bosch_ebike' });
for (let i = 0; i < 500; i++) add('sensor.other_' + i, String(i), { unit_of_measurement: 'W' });
ROOT = { states, entities, devices, areas: {} };

// button-card's proxy: reading an entity id subscribes; `in`, keys and descriptors do not.
const card = () => {
  const seen = new Set();
  const px = new Proxy({}, {
    get: (t, n) => { if (typeof n === 'string' && n.includes('.')) seen.add(n); return ROOT.states[n]; },
    has: (t, n) => !!ROOT.states[n], ownKeys: () => Object.keys(ROOT.states),
    getOwnPropertyDescriptor: (t, n) => ({ value: ROOT.states[n], enumerable: true, configurable: true }),
  });
  return { hass: { ...ROOT, states: px }, seen };
};

// 1. securityAway reads only alarm panels and persons, and still follows a change of HA's states.
{
  const c = card();
  assert.equal(window.casoraSecurityAway(c.hass), false);
  assert.deepEqual([...c.seen].sort(), ['alarm_control_panel.home', 'person.a'], 'only alarm panels and persons read');
  const c2 = card();
  window.casoraSecurityAway(c2.hass);
  assert.deepEqual([...c2.seen].sort(), ['alarm_control_panel.home', 'person.a'], 'a second card subscribes to them too (memo hit)');
  ROOT = { ...ROOT, states: { ...ROOT.states, 'person.a': st('person.a', 'not_home', {}) } };
  assert.equal(window.casoraSecurityAway(c.hass), true, 'away once HA replaced its states (same proxy, as in button-card)');
  ROOT = { ...ROOT, states: { ...ROOT.states, 'person.a': st('person.a', 'home', {}) } };
  assert.equal(window.casoraSecurityAway(c.hass), false, 'home again');
}

// 2. The door/window list: no state read through the proxy, computed once per states object, same answer.
{
  const c = card();
  const cc = window.casoraContacts(c.hass);
  assert.equal(c.seen.size, 0, 'the house scan reads the plain states, not the card\'s proxy (' + c.seen.size + ')');
  assert.deepEqual(cc.groups.map((g) => g.members), [['binary_sensor.door_a'], ['binary_sensor.win_a']], 'doors and windows found');
  assert.equal(window.casoraContacts(card().hass), cc, 'same states object: computed once for every card');
  const doors = card();
  assert.deepEqual(window.casoraHouseContactsOf(doors.hass, {}, 'door', null, 'home'), ['binary_sensor.door_a']);
  assert.ok(doors.seen.size <= 2 && !doors.seen.has('sensor.other_1') && !doors.seen.has('binary_sensor.motion_a'),
    'the home badge subscribes only to the house\'s doors/windows: ' + [...doors.seen].join(','));
  ROOT = { ...ROOT, states: { ...ROOT.states, 'binary_sensor.door_b': st('binary_sensor.door_b', 'on', { device_class: 'door' }) } };
  assert.deepEqual(window.casoraHouseContactsOf(card().hass, {}, 'door', null, 'home'), ['binary_sensor.door_a', 'binary_sensor.door_b'],
    'a new door shows once HA replaced its states');
  const one = card();
  const e = window.casoraContactsEntity(one.hass, null, { contacts: ['binary_sensor.door_b'], contacts_kind: 'door' });
  assert.equal(e.state, 'on');
  assert.ok(one.seen.has('binary_sensor.door_b') && !one.seen.has('sensor.other_1'), 'the contact badge subscribes to its members');
  // Another house (a hass with its own registry, e.g. a preview): its own states, not HA's.
  const other = { states: { 'binary_sensor.x': st('binary_sensor.x', 'off', { device_class: 'window' }) }, entities: {}, devices: {} };
  assert.deepEqual(window.casoraContacts(other).groups[1].members, ['binary_sensor.x'], 'other registry: scanned on its own');
}

// 3. Security level of a badge: its own entities, no walk over the house.
{
  const c = card();
  window.casoraSecurityLevel(c.hass, ['binary_sensor.door_a', 'binary_sensor.motion_a']);
  assert.ok(!c.seen.has('sensor.other_1'), 'security level reads no unrelated entity');
}

// 4. The e-bike tile: only the bike's entities.
{
  const c = card();
  const F = window._casoraBike.find(c.hass.states, 'sensor.rad_km');
  assert.equal(F.bike && F.bike.dev, 'bike1', 'bike found');
  assert.ok(!c.seen.has('sensor.other_1') && c.seen.size <= 2, 'e-bike scan reads only the bike: ' + [...c.seen].join(','));
}
console.log('ok state_proxy_reads');
