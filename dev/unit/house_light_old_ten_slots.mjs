// Setups before 26.11.9 gave Home's light badge the house's HA light group AND its lights in the slots (light_entity_1…10,
// the first ten when there were more). Picked lights win over the group in the popup (#80): rooms past the tenth were
// missing from the house light popup (r505), lights added later never joined. Today's setup writes the group alone
// (unit haus_licht_ohne_gruppe). The Studio empties such slots on load (fixHomeLightSlots, the group stays, marker
// light_slots_checked) when they are exactly what the old setup wrote: all units (ten or fewer, order aside) or the
// first ten in order (more). A list the user picked, an unknown group, a marked badge: untouched.
// The old setup is the real casora-panel-basis.js with the group's line from before put back. Regress r506.
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
const NOW = 'if (g) h.light_group_entity = g;';
assert.ok(basisSrc.includes(NOW), 'the group line in badgesOf');
// The setup before 26.11.8 (group plus the first ten lights) and today's.
new Function(basisSrc.replace(NOW, 'if (g) { h.light_group_entity = g; put(h, "light_entity_", lightsAll, 10); }'))();
const OLD = window.casoraBasis;
delete window.casoraBasis; // the file loads once per page
new Function(basisSrc)();
const B = window.casoraBasis;
assert.notEqual(OLD, B);

const panelSrc = read('custom_components/casora/panel/casora-panel.js');
const mig = panelSrc.match(/const LIGHT_SLOTS = [\s\S]*?\nfunction fixHomeLightSlots[\s\S]*?\n}\n/);
assert.ok(mig, 'fixHomeLightSlots in casora-panel.js');
const { fixHomeLightSlots, fillHomeLights, homeLightsEdit } = new Function('window', 'isHomeRoom', mig[0] + '\nreturn { fixHomeLightSlots, fillHomeLights, homeLightsEdit };')(window, isHomeRoom);
const load = panelSrc.slice(panelSrc.indexOf('const litHome = '), panelSrc.indexOf('const litHome = ') + 700);
assert.ok(/this\._clean = this\._print\(\);[\s\S]*const litHome = /.test(panelSrc) && /_mirrorToPair\(k, undefined, \[litHome\]\)/.test(load) && /this\._markDirty\(\);/.test(load)
  && !/_save\(/.test(load), 'load: after _clean, phone row mirrored, shown as unsaved (_markDirty), nothing saved');
assert.ok(/const litHome = [^\n]*!locked/.test(panelSrc) && /const locked = !!lock && new RegExp\(lock\)\.test\(url_path/.test(panelSrc), 'load: not on a dashboard locked against saving');

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

const fixed = (hh, r) => !!fixHomeLightSlots(hh, r);

// ── 1. Old prefix pattern (11 units: group + first ten in order): emptied, group stays, marked ────────
const h = house();
const old = setup(h, OLD);
const H0 = old[0].variables;
assert.equal(H0.light_group_entity, 'light.demo_alle', 'old setup: the group');
assert.equal(listed(H0).length, 10, 'old setup: ten slots beside the group (the bug)');
assert.deepEqual(listed(setup(h, B)[0].variables), [], 'today\'s setup: the group alone');
{
  const r = copy(old);
  assert.equal(fixHomeLightSlots(h, r), r[0], 'old pattern: fixed, returns Home');
  assert.deepEqual(listed(r[0].variables), [], 'slots emptied');
  assert.equal(r[0].variables.light_group_entity, 'light.demo_alle', 'group stays');
  assert.equal(r[0].variables.light_slots_checked, true, 'marked');
  assert.equal(r[0].variables.light_rooms_auto, undefined, 'no rooms marker');
  assert.deepEqual(r.slice(1), old.slice(1), 'rooms untouched');
  const now = copy(r[0].variables); delete now.light_slots_checked;
  assert.deepEqual(now, copy(setup(h, B)[0].variables), 'Home now as today\'s setup makes it (marker aside)');
  assert.equal(fixed(h, r), false, 'once');
  assert.equal(fillHomeLights(h, r), false, 'the no-group migration leaves it alone afterwards');
}
{
  const hb = house([10, 10, 0, 10]);
  const r = setup(hb, OLD);
  assert.equal(listed(r[0].variables).length, 10);
  assert.equal(fixed(hb, r), true, '30 lights: fixed');
}
console.log('ok prefix pattern: emptied, group stays, marked');

// ── 2. Old full list (ten or fewer units, order aside): emptied ─────────────────────────────────────
{
  const h8 = house([3, 2, 0, 2]); // seven lamps + Bad's group = eight units
  const r = setup(h8, OLD);
  assert.equal(listed(r[0].variables).length, 8, 'old setup: all eight units listed');
  assert.deepEqual(listed(setup(h8, B)[0].variables), [], 'today\'s setup: the group alone');
  const rev = copy(r); const L = listed(rev[0].variables).reverse(); L.forEach((id, i) => { rev[0].variables['light_entity_' + (i + 1)] = id; });
  assert.equal(fixed(h8, r), true, 'eight units: fixed');
  assert.deepEqual(listed(r[0].variables), []);
  assert.equal(fixed(h8, rev), true, 'eight units in another order: fixed (all of them, order aside)');
  const h10 = house([3, 3, 0, 3]); // ten units
  const r10 = setup(h10, OLD);
  assert.equal(listed(r10[0].variables).length, 10);
  assert.equal(fixed(h10, r10), true, 'ten units: fixed');
  // One room with twelve lamps: its badge holds ten, so do Home's slots – all units the dashboard lists.
  const hs = house([12, 0, 0, 0]);
  ['light.demo_bad_alle', 'light.demo_bad_1', 'light.demo_bad_2'].forEach((id) => delete hs.states[id]);
  hs.states['light.demo_alle'].attributes.entity_id = Object.keys(hs.states).filter((id) => /demo_r0_/.test(id));
  assert.equal(fixed(hs, setup(hs, OLD)), true, 'one room with twelve lamps: fixed');
}
console.log('ok full list: emptied');

// ── 3. Lists the user picked stay ──────────────────────────────────────────────────────────────────
const user = (fn, base = old) => { const r = copy(base); fn(r[0].variables); return r; };
const h8 = house([3, 2, 0, 2]), old8 = setup(h8, OLD);
for (const [label, hh, base, fn] of [
  ['prefix in another order', h, old, (V) => { const a = V.light_entity_1; V.light_entity_1 = V.light_entity_2; V.light_entity_2 = a; }],
  ['prefix minus one', h, old, (V) => { delete V.light_entity_10; }],
  ['a gap', h, old, (V) => { delete V.light_entity_4; }],
  ['the eleventh instead of the tenth', h, old, (V) => { V.light_entity_10 = 'light.demo_r3_4'; }],
  ['a lamp from nowhere', h, old, (V) => { V.light_entity_10 = 'light.demo_fremd'; }],
  ['badge switched off', h, old, (V) => { V.show_lights = false; }],
  ['no group (the user cleared it)', h, old, (V) => { delete V.light_group_entity; }],
  ['marked', h, old, (V) => { V.light_slots_checked = true; }],
  ['full list minus one', h8, old8, (V) => { delete V.light_entity_8; }],
  ['full list with one twice', h8, old8, (V) => { V.light_entity_8 = V.light_entity_1; }],
  ['full list plus one', h8, old8, (V) => { V.light_entity_9 = 'light.demo_fremd'; }],
  ['a single lamp', h8, old8, (V) => { for (let i = 2; i <= 10; i++) delete V['light_entity_' + i]; }],
]) {
  const r = user(fn, base); const before = copy(r);
  assert.equal(fixed(hh, r), false, label + ': untouched');
  assert.deepEqual(r, before, label + ': nothing changed');
}
{
  const hx = house();
  hx.states['light.demo_alle'].attributes.entity_id = hx.states['light.demo_alle'].attributes.entity_id.filter((id) => id !== 'light.demo_r0_1');
  assert.equal(fixed(hx, copy(old)), false, 'slot outside the group: untouched');
  const hu = house(); delete hu.states['light.demo_alle'];
  assert.equal(fixed(hu, copy(old)), false, 'group HA does not report: untouched');
  const he = house(); he.states['light.demo_alle'].attributes = {};
  assert.equal(fixed(he, copy(old)), false, 'group without members: untouched');
  const r = copy(old); const [x] = r.splice(1, 1); r.push(x);
  assert.equal(fixed(h, r), false, 'rooms reordered (prefix no longer the setup\'s): untouched');
}
{
  const hn = house([3, 3, 0, 4], { group: false });
  const r = setup(hn, OLD);
  assert.equal(r[0].variables.light_group_entity, undefined);
  assert.equal(fixed(hn, r), false, 'no group: untouched');
}
console.log('ok user lists stay');

// ── 4. The way out: the user's pick on Home marks the slots, the fix never comes back ──────────────
{
  const r = copy(old);
  assert.equal(fixed(h, r), true);
  // The user lists lamps again (Studio editor → homeLightsEdit), even exactly the old ones.
  const V = r[0].variables; delete V.light_slots_checked;
  listed(H0).forEach((id, i) => { homeLightsEdit(V, 'light_entity_' + (i + 1), id); V['light_entity_' + (i + 1)] = id; });
  assert.equal(V.light_slots_checked, true, 'a picked light marks the slots');
  assert.equal(fixed(h, r), false, 'the user\'s list stays, also when it is the old one');
  const g = { light_group_entity: 'light.demo_alle' };
  homeLightsEdit(g, 'light_group_entity', 'light.demo_alle');
  assert.equal(g.light_slots_checked, undefined, 'picking the group alone does not mark');
  // A version from before the fix (old slots, no marker) gets the fix offered again – once, then it is marked.
  const restored = copy(old);
  assert.equal(fixed(h, restored), true, 'restored version: fixed again');
  assert.equal(fixed(h, restored), false, 'and only once');
}
console.log('ok marker: user pick stays, restored version once');
