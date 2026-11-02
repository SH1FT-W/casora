// Setups before 26.11.8 gave Home's light badge the house's HA light group AND the first ten lights
// (light_entity_1…10). Picked lights win over the group in the popup (#80), so rooms past the tenth were missing
// from the house light popup; 26.11.8 fixed the setup only (unit haus_licht_ohne_gruppe, regress r505). The Studio
// now empties those ten slots on load (fixHomeLightSlots, the group stays) when they are exactly the old setup's
// pick; a list the user picked (other lamps, fewer, another order), ten or fewer lights, no group: untouched.
// The old setup is the real casora-panel-basis.js with the 26.11.8 guard taken out. Regress r506.
//   node dev/unit/house_light_old_ten_slots.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.addEventListener = () => {};

const isHomeRoom = (room, rooms) => !!room && (room.path === 'home' || (Array.isArray(rooms) && rooms[0] === room && !rooms.some((r) => r && r.path === 'home')));
window.__casoraPanelInternals = { TILE_TYPES: [{ id: 'light', template: 'casora_light' }], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom };
const basisSrc = read('custom_components/casora/panel/casora-panel-basis.js');
const GUARD = 'if (lightsAll.length <= 10) put(h, "light_entity_", lightsAll, 10);';
assert.ok(basisSrc.includes(GUARD), 'the 26.11.8 guard in badgesOf');
// The setup before 26.11.8 (the guard out) and today's.
new Function(basisSrc.replace(GUARD, 'put(h, "light_entity_", lightsAll, 10);'))();
const OLD = window.casoraBasis;
delete window.casoraBasis; // the file loads once per page
new Function(basisSrc)();
const B = window.casoraBasis;
assert.notEqual(OLD, B);

const panelSrc = read('custom_components/casora/panel/casora-panel.js');
const mig = panelSrc.match(/const LIGHT_SLOTS = [\s\S]*?\nfunction fixHomeLightSlots[\s\S]*?\n}\n/);
assert.ok(mig, 'fixHomeLightSlots in casora-panel.js');
const { fixHomeLightSlots, fillHomeLights } = new Function('window', 'isHomeRoom', mig[0] + '\nreturn { fixHomeLightSlots, fillHomeLights };')(window, isHomeRoom);
assert.ok(/fixHomeLightSlots\(this\._hass, this\._state\.compact\.rooms\)\) \{\s*this\._log\([^\n]*\);\s*this\._markDirty\(\);/.test(panelSrc),
  'load: the fix shows as unsaved (_markDirty), nothing is saved');

// A made-up house: four areas, lights per room, Bad's two behind one HA group, an HA group over the house.
const AREAS = ['Wohnzimmer', 'Küche', 'Bad', 'Flur'];
function house(perRoom = [3, 3, 0, 4], { group = true } = {}) {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  const light = (id, area, name, members) => {
    h.entities[id] = { entity_id: id, device_id: null, area_id: area, platform: members ? 'group' : 'template' };
    h.states[id] = { entity_id: id, state: 'off', attributes: { friendly_name: name, supported_color_modes: ['brightness'], ...(members ? { entity_id: members } : {}) } };
  };
  AREAS.forEach((n, a) => { h.areas['a' + a] = { area_id: 'a' + a, name: n }; });
  AREAS.forEach((n, a) => { for (let i = 1; i <= perRoom[a]; i++) light(`light.demo_r${a}_${i}`, 'a' + a, `${n} Lampe ${i}`); });
  light('light.demo_bad_1', 'a2', 'Spiegel'); light('light.demo_bad_2', 'a2', 'Decke');
  light('light.demo_bad_alle', 'a2', 'Bad', ['light.demo_bad_1', 'light.demo_bad_2']);
  if (group) light('light.demo_alle', null, 'Alle Lampen', Object.keys(h.states).filter((id) => !/demo_bad_\d/.test(id)));
  return h;
}
const listed = (V) => Array.from({ length: 10 }, (_, i) => V['light_entity_' + (i + 1)]).filter(Boolean);
// Setup → Studio rooms (Home first), with the given basis.
function setup(h, basis) {
  const p = basis.plan(h, AREAS, { ...basis.DEFAULTS });
  const { tiles, vars } = basis.tilesOf(p, h);
  return [{ name: 'Home', path: 'home', tiles: tiles.Home, variables: { ...vars.Home } }]
    .concat(AREAS.map((n) => ({ name: n, path: n.toLowerCase(), tiles: tiles[n], variables: { ...vars[n] } })));
}
const copy = (x) => JSON.parse(JSON.stringify(x));

// ── 1. The old pattern (11 lights, group + first ten) is recognised and emptied, the group stays ──
const h = house();
const old = setup(h, OLD);
const H0 = old[0].variables;
assert.equal(H0.light_group_entity, 'light.demo_alle', 'old setup: the group');
assert.equal(listed(H0).length, 10, 'old setup: ten slots beside the group (the bug)');
assert.deepEqual(listed(setup(h, B)[0].variables), [], 'today\'s setup: the group alone');
{
  const r = copy(old);
  assert.equal(fixHomeLightSlots(h, r), true, 'old pattern: fixed');
  assert.deepEqual(listed(r[0].variables), [], 'slots emptied');
  assert.equal(r[0].variables.light_group_entity, 'light.demo_alle', 'group stays');
  assert.equal(r[0].variables.light_rooms_auto, undefined, 'no rooms marker');
  assert.deepEqual(r.slice(1), old.slice(1), 'rooms untouched');
  assert.deepEqual(copy(r[0].variables), copy(setup(h, B)[0].variables), 'Home now as today\'s setup makes it');
  assert.equal(fixHomeLightSlots(h, r), false, 'once');
  assert.equal(fillHomeLights(h, r), false, 'the no-group migration leaves it alone afterwards');
}
// Many lights (30): the same.
{
  const hb = house([10, 10, 0, 10]);
  const r = setup(hb, OLD);
  assert.equal(listed(r[0].variables).length, 10);
  assert.equal(fixHomeLightSlots(hb, r), true, '30 lights: fixed');
  assert.deepEqual(listed(r[0].variables), []);
}
// One room with more than ten lights (its badge holds ten): the group's units say "more than ten".
{
  const hs = house([12, 0, 0, 0]);
  delete hs.states['light.demo_bad_alle']; delete hs.states['light.demo_bad_1']; delete hs.states['light.demo_bad_2'];
  hs.states['light.demo_alle'].attributes.entity_id = Object.keys(hs.states).filter((id) => /demo_r0_/.test(id));
  const r = setup(hs, OLD);
  assert.equal(listed(r[0].variables).length, 10);
  assert.equal(fixHomeLightSlots(hs, r), true, 'one room with twelve lights: fixed');
}
console.log('ok old pattern: emptied, group stays');

// ── 2. Lists the user picked stay ──────────────────────────────────────────────────────────────
const user = (fn) => { const r = copy(old); fn(r[0].variables); const before = copy(r); return { r, before }; };
for (const [label, fn] of [
  ['another order', (V) => { const a = V.light_entity_1; V.light_entity_1 = V.light_entity_2; V.light_entity_2 = a; }],
  ['fewer than ten', (V) => { delete V.light_entity_10; }],
  ['a gap', (V) => { delete V.light_entity_4; }],
  ['the eleventh instead of the tenth', (V) => { V.light_entity_10 = 'light.demo_r3_4'; }],
  ['a lamp from nowhere', (V) => { V.light_entity_10 = 'light.demo_fremd'; }],
  ['badge switched off', (V) => { V.show_lights = false; }],
  ['no group (the user cleared it)', (V) => { delete V.light_group_entity; }],
]) {
  const { r, before } = user(fn);
  assert.equal(fixHomeLightSlots(h, r), false, label + ': untouched');
  assert.deepEqual(r, before, label + ': nothing changed');
}
// A slot outside the group (the group does not hold it).
{
  const hx = house();
  hx.states['light.demo_alle'].attributes.entity_id = hx.states['light.demo_alle'].attributes.entity_id.filter((id) => id !== 'light.demo_r0_1');
  const r = copy(old);
  assert.equal(fixHomeLightSlots(hx, r), false, 'slot outside the group: untouched');
}
// The group HA does not know (removed): untouched.
{
  const hx = house(); delete hx.states['light.demo_alle'];
  assert.equal(fixHomeLightSlots(hx, copy(old)), false, 'unknown group: untouched');
}
// Rooms reordered after the setup: the list no longer is the setup's order – stays (conservative).
{
  const r = copy(old); const [x] = r.splice(1, 1); r.push(x);
  assert.equal(fixHomeLightSlots(h, r), false, 'rooms reordered: untouched');
}
console.log('ok user lists stay');

// ── 3. Ten or fewer lights, or no group: the old setup was right, untouched ─────────────────────
{
  const h10 = house([3, 3, 0, 3]); // nine lamps + Bad's group = ten units
  const r = setup(h10, OLD);
  assert.equal(listed(r[0].variables).length, 10, 'ten units: ten slots');
  const before = copy(r);
  assert.equal(fixHomeLightSlots(h10, r), false, 'ten units: untouched');
  assert.deepEqual(r, before);
  const h9 = house([3, 3, 0, 2]);
  const r9 = setup(h9, OLD);
  assert.equal(listed(r9[0].variables).length, 9);
  assert.equal(fixHomeLightSlots(h9, r9), false, 'nine units: untouched');
}
{
  const hn = house([3, 3, 0, 4], { group: false });
  const r = setup(hn, OLD);
  assert.equal(r[0].variables.light_group_entity, undefined);
  const before = copy(r);
  assert.equal(fixHomeLightSlots(hn, r), false, 'no group: untouched');
  assert.deepEqual(r, before);
}
console.log('ok ten or fewer / no group: untouched');
