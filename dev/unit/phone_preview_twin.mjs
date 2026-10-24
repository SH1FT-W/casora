// Studio phone preview: a phone tile opens the tile of its own room (gate 23.10.2026, rb18).
// Without an HA light group for all lamps, "Start fresh" gives Home a "Lights" tile on the first room's light
// (casoraBasis groupTile: entity = first lamp, list in variables.lights). That room's own light tile has the
// same kind + entity (tileTwinKey). _wideTwinOf took the first hit from the top, so the room's light tile in
// the phone preview pointed to Home: tapping it jumped to Home and opened the wrong tile, and the room's tile
// counted as hidden. Expected: the section's own room first, other rooms only when it has no twin.
// With the private fixture (gate) it also checks the test house: Home gets an HA light group, which the
// checks of the house light popup need (r69, r73, r174).
//   node dev/unit/phone_preview_twin.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

const hass = testhaus({ publicOnly: true });
const { P, I } = await loadPanel();
const B = window.casoraBasis;
const clone = (x) => JSON.parse(JSON.stringify(x));

// "Start fresh" with the lamps behind hubs (Garage, Garten), no HA light group in the public house.
const plan = B.plan(hass, ['Garage', 'Garten'], Object.assign({}, B.DEFAULTS));
const { tiles } = B.tilesOf(plan, hass);
const rooms = [{ name: 'Home', path: 'home', tiles: tiles.Home }]
  .concat(['Garage', 'Garten'].map((n) => ({ name: n, path: n.toLowerCase(), tiles: tiles[n] })));
const isLight = (t) => [].concat(t.template || []).includes('casora_light');
const homeLight = rooms[0].tiles.find(isLight);
const garageLight = rooms[1].tiles.find((t) => isLight(t) && I.tileTwinKey(t) === I.tileTwinKey(homeLight || {}));
assert.ok(homeLight && (homeLight.variables || {}).lights, 'precondition: Home has a Lights tile with a list (no HA group)');
assert.ok(garageLight, 'precondition: Garage has a light tile with the same kind + entity as Home\'s Lights tile');
assert.notEqual(garageLight, homeLight);

// Phone layout as the Studio pairs it: favorites (overview) first, then one section per room.
const sections = [{ name: 'Favorites', variables: { favorites: true }, tiles: clone(rooms[0].tiles) }]
  .concat(rooms.slice(1).map((r) => ({ name: r.name, tiles: clone(r.tiles) })));
const dstate = { compact: { rooms } };
const mstate = { compact: { rooms: sections } };
const link = I.linkPair(dstate, mstate);
assert.deepEqual(link.links.map((l) => l.section), [0, 1, 2], 'every room linked to its section');

const panel = (state, pair) => { const p = Object.create(P); p._state = state; p._pair = pair; return p; };
const wide = panel(dstate, { desktop: dstate, mobile: mstate, link });
const twinIn = (p, si, pred) => { const sec = p === wide ? sections[si] : p._state.compact.rooms[si];
  return p._wideTwinOf(sec.tiles.find(pred), sec); };
const sameKey = (t) => isLight(t) && I.tileTwinKey(t) === I.tileTwinKey(homeLight);

// Garage section: its light tile is Garage's, not Home's.
let tw = twinIn(wide, 1, sameKey);
assert.equal(tw.roomIndex, 1, 'Garage light in the phone preview opens Garage');
assert.equal(tw.tile, garageLight);
// Home section: still Home's Lights tile.
tw = twinIn(wide, 0, sameKey);
assert.equal(tw.roomIndex, 0);
assert.equal(tw.tile, homeLight);
// A tile its own room lacks (moved on the wide side): the first room that has it, as before.
const moved = clone(rooms[1]);
const wide2 = (() => { const d = { compact: { rooms: [rooms[0], { ...moved, tiles: moved.tiles.filter((t) => !sameKey(t)) }, rooms[2]] } };
  return panel(d, { desktop: d, mobile: mstate, link }); })();
tw = wide2._wideTwinOf(sections[1].tiles.find(sameKey), sections[1]);
assert.equal(tw.roomIndex, 0, 'no twin in its own room: falls back to the first room with it');
// Without a section (older callers): first hit from the top.
assert.equal(wide._wideTwinOf(sections[1].tiles.find(sameKey)).roomIndex, 0);
// Phone-only tile: nothing to open.
assert.equal(wide._wideTwinOf({ template: 'casora_light', entity: 'light.only_on_the_phone' }, sections[1]), null);
// Editing the phone layout itself: the section is the room.
const mob = panel({ surface: 'mobile', compact: { rooms: sections } }, null);
tw = mob._wideTwinOf(sections[1].tiles.find(sameKey), sections[1]);
assert.equal(tw.roomIndex, 1, 'phone layout: own section');
// The phone preview passes the section it paints.
const src = (await import('node:fs')).readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.match(src, /this\._wideTwinOf\(tile, sec\)/, 'tileRow passes its section');
console.log('ok phone preview: tile of its own room');

// Test house of the gate (private fixture): every lamp of the house is in one HA light group of room groups, so
// "Start fresh" gives Home that group (badge and Lights tile). The hub lamps (dev/casora_mock/hubs.py) once stood
// outside it; the checks of the house light popup (r69, r73, r174, r270) need it.
const full = testhaus();
if (full._fixture) {
  const S = full.states;
  const grp = (id) => Array.isArray(((S[id] || {}).attributes || {}).entity_id);
  const areas = Object.values(full.areas).map((a) => a.name);
  const fresh = B.plan(full, areas, Object.assign({}, B.DEFAULTS));
  const { tiles: ft, vars } = B.tilesOf(fresh, full);
  const home = fresh.rooms[0].name;
  const g = vars[home] && vars[home].light_group_entity;
  assert.ok(g, 'test house: Home badge follows an HA light group');
  assert.ok(S[g].attributes.entity_id.every(grp), 'test house: the house group holds room groups only');
  const lt = (ft[home] || []).find(isLight);
  assert.ok(lt && lt.entity === g && !(lt.variables || {}).lights, 'test house: Home Lights tile on the HA group, not a list');
  // The hub lamps themselves stay in their rooms (r307): the hub groups are not placed instead of them.
  for (const [room, n] of [['Garage', 3], ['Garten', 2]]) {
    const items = ((fresh.rooms.find((r) => r.name === room) || {}).items || []).filter((x) => x.type === 'light' && x.on);
    const ids = [].concat(...items.map((x) => x.group || [x.entity]));
    assert.equal(ids.filter((id) => !grp(id)).length, n, 'test house: ' + room + ' keeps its ' + n + ' lamps');
  }
  console.log('ok test house: Home has an HA light group of room groups');
} else console.log('skip test house (no private fixture)');
console.log('phone_preview_twin: ok');
