// Lamps that come to Home Assistant after the setup also go on the Lights badge (Studio, 19.10.2026): the badge
// lists the room's lights (light_entity_1…10) as "Start fresh" found them, and a lamp added later through
// "What should go on the dashboard?" or the Device Assistant got a tile, but never showed on the badge.
// Uses the test house (dev/casora_mock): the dimmer channel "Wandlicht Garten" comes later.
//   node dev/unit/light_badge_later.mjs
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

const full = testhaus({ publicOnly: true });
const { P, I } = await loadPanel();
const B = window.casoraBasis;
const NEW = 'light.wandlicht_garten';

// The house at setup time: without the second dimmer channel.
const before = JSON.parse(JSON.stringify(full));
delete before.states[NEW];
delete before.entities[NEW];

const fresh = () => {
  const plan = B.plan(before, ['Garage', 'Garten'], Object.assign({}, B.DEFAULTS));
  const { tiles, vars } = B.tilesOf(plan, before);
  const rooms = [{ name: 'Home', path: 'home', tiles: tiles.Home, variables: Object.assign({}, vars.Home) }]
    .concat(['Garage', 'Garten'].map((n) => ({ name: n, path: n.toLowerCase(), tiles: tiles[n],
      variables: Object.assign({ area: n.toLowerCase() }, vars[n]) })));
  return rooms;
};
const listed = (V) => Array.from({ length: 10 }, (_, i) => V['light_entity_' + (i + 1)]).filter(Boolean);

const panel = (rooms, ri) => {
  const p = Object.create(P);
  p._hass = full;
  p._state = { compact: { rooms } };
  p._room = ri;
  p.classList = { contains: () => false };
  p.shadowRoot = { querySelector: () => null, getElementById: () => null };
  p._markDirty = () => {};
  p._renderForm = () => {};
  p._renderTabs = () => {};
  p._roomLabel = (r) => r.name;
  return p;
};

// ── "What should go on the dashboard?" ──────────────────────────────────────
{
  const rooms = fresh();
  const wg = rooms[2];
  assert.deepEqual(listed(wg.variables), ['light.palmenleuchte'], 'badge at setup: the Hue lamp');
  const homeBefore = listed(rooms[0].variables);
  assert.ok(homeBefore.length && !homeBefore.includes(NEW), 'house badge lists the lights of the setup');
  const p = panel(rooms, 2);
  const c = p._uxDevices().find((x) => x.entity === NEW);
  assert.ok(c && c.fresh && c.type === 'light', 'new lamp offered in the device list');
  await p._uxAddDevice(c);
  assert.ok(wg.tiles.some((t) => t.entity === NEW), 'tile added');
  assert.deepEqual(listed(wg.variables), ['light.palmenleuchte', NEW], 'new lamp on the room\'s Lights badge');
  assert.ok(listed(rooms[0].variables).includes(NEW), 'and on the house badge of the overview');
  // Twice is once.
  await p._uxAddDevice(c);
  assert.equal(listed(wg.variables).filter((x) => x === NEW).length, 1, 'listed once');
  console.log('ok device list: new lamp on the Lights badge');
}

// ── What stays: badge switched off, badge following an HA light group, full list ──
{
  const rooms = fresh();
  const wg = rooms[2];
  wg.variables.show_lights = false;
  await panel(rooms, 2)._uxAddDevice(panel(rooms, 2)._uxDevices().find((x) => x.entity === NEW));
  assert.deepEqual(listed(wg.variables), ['light.palmenleuchte'], 'switched-off badge untouched');

  const r2 = fresh();
  Object.keys(r2[2].variables).filter((k) => /^light_entity_/.test(k)).forEach((k) => delete r2[2].variables[k]);
  r2[2].variables.light_group_entity = 'light.some_group';
  await panel(r2, 2)._uxAddDevice(panel(r2, 2)._uxDevices().find((x) => x.entity === NEW));
  assert.deepEqual(listed(r2[2].variables), [], 'a badge that follows an HA group stays with the group');

  const r3 = fresh();
  for (let i = 1; i <= 10; i++) r3[2].variables['light_entity_' + i] = 'light.x' + i;
  await panel(r3, 2)._uxAddDevice(panel(r3, 2)._uxDevices().find((x) => x.entity === NEW));
  assert.ok(!listed(r3[2].variables).includes(NEW), 'full list stays');
  console.log('ok device list: switched off, group and full badge stay');
}

// ── Device Assistant: the same rule (casoraBasis.addLight) ───────────────────
{
  assert.equal(typeof B.addLight, 'function', 'casoraBasis.addLight');
  const rooms = fresh();
  const changed = B.addLight(full, rooms, rooms[2], NEW);
  assert.deepEqual(listed(rooms[2].variables), ['light.palmenleuchte', NEW]);
  assert.ok(changed.includes(rooms[2]));
  const src = (await import('node:fs')).readFileSync(new URL('../../custom_components/casora/panel/casora-panel-assist.js', import.meta.url), 'utf8');
  assert.ok(/addLight\(/.test(src), 'the Device Assistant adds new lamps to the badge, too');
  console.log('ok assistant: same rule');
}
console.log('light_badge_later: ok');
