// Energy badge on Home: the house sensor, else the sum of the rooms (#44).
//   node dev/unit/house_power.mjs
// - A "total" sensor of a device, in an area or named after one ("Wohnzimmer Gesamtleistung") is
//   never the house sensor; "Hausverbrauch" and the grid/meter rules stay. The Studio
//   (casoraBasis.housePower) and the dashboard (window._casoraHousePower, 01-basis.js) pick the same.
// - Without a house sensor Home gets the rooms' sensors as energy_entities (setup and fillBadges),
//   only the rooms on the dashboard, energy_exclude left out.
// - Existing dashboards: a Home sensor only the old rule picked becomes the house sensor or the
//   sum (fixHomePower); a three phase meter or a sensor outside the rooms stays. fillHomeEnergy
//   adds new room sensors, never removes.
// All IDs made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';

let current = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' && current ? { hass: current } : null) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.location = { pathname: '/casora/home' };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const panel = src('custom_components/casora/panel/casora-panel.js');
const from = panel.indexOf('const ENERGY_VAR = ');
const { fillRoomEnergy, fillHomeEnergy, fixHomePower } = new Function(panel.slice(from, panel.indexOf('\nfunction deriveEnergyRooms(', from))
  + '\nreturn { fillRoomEnergy, fillHomeEnergy, fixHomePower };')();
const basis = src('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraHousePower = function');
new Function(basis.slice(b0, basis.indexOf('\n};', b0) + 3))();
const B = window.casoraBasis;
const dashPick = (h) => { current = h; delete window._casoraHPGuess; return window._casoraHousePower(); };
const same = (h, want, msg) => {
  assert.equal(B.housePower(h), want, msg + ' (Studio)');
  assert.equal(dashPick(h), want, msg + ' (dashboard)');
};

function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['wz', 'Wohnzimmer'], ['ku', 'Küche'], ['ke', 'Keller']]) h.areas[id] = { area_id: id, name };
  const dev = (id, area, name) => { h.devices[id] = { id, area_id: area, name }; };
  const ent = (eid, { dev: d = null, area = null, name, state = '0' } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform: d ? 'zha' : 'template' };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: 'power', unit_of_measurement: 'W', friendly_name: name || eid } };
  };
  // A helper without area, named after the living room (the 2 W from the report).
  ent('sensor.wohnzimmer_gesamtleistung', { name: 'Wohnzimmer Gesamtleistung', state: '2' });
  // Basement (not a room on the dashboard): a pump whose plug reports its total power.
  dev('d_pu', 'ke', 'Pumpe');
  ent('sensor.pumpe_total_power', { dev: 'd_pu', name: 'Pumpe Total power', state: '40' });
  // Living room: TV and lamp. Kitchen: fridge.
  dev('d_tv', 'wz', 'Fernseher'); dev('d_la', 'wz', 'Stehlampe'); dev('d_fr', 'ku', 'Kühlschrank');
  ent('sensor.fernseher_power', { dev: 'd_tv', name: 'Fernseher', state: '60' });
  ent('sensor.stehlampe_power', { dev: 'd_la', name: 'Stehlampe', state: '5' });
  ent('sensor.kuhlschrank_power', { dev: 'd_fr', name: 'Kühlschrank', state: '80' });
  return { h, dev, ent };
}
const ROOMS = ['Wohnzimmer', 'Küche'];
const planOf = (h) => B.plan(h, ROOMS, Object.assign({}, B.DEFAULTS));
const sorted = (a) => a.slice().sort();
const ROOM_IDS = ['sensor.fernseher_power', 'sensor.stehlampe_power', 'sensor.kuhlschrank_power'];

// 1. No house sensor: neither the room-named helper nor the plug's total; Home sums the rooms.
{
  const { h } = house();
  same(h, null, 'room and device totals are not the house');
  const p = planOf(h);
  assert.equal(p.housePower, null);
  const home = B.tilesOf(p, h).vars[p.rooms[0].name];
  assert.equal(home.energy_power_entity, undefined);
  assert.deepEqual(sorted(home.energy_entities), sorted(ROOM_IDS), 'Home: the rooms on the dashboard, not the basement');
  assert.equal(home.casora_energy_auto, 2);
}

// 2. A total without device, area or room name is the house; "Hausverbrauch" at a device too.
{
  const { h, ent, dev } = house();
  ent('sensor.total_consumption', { name: 'Total consumption', state: '500' });
  same(h, 'sensor.total_consumption', 'helper total');
  dev('d_meter', 'ke', 'Zähler');
  ent('sensor.hausverbrauch', { dev: 'd_meter', name: 'Hausverbrauch', state: '480' });
  same(h, 'sensor.hausverbrauch', 'Hausverbrauch first, also at a device');
  const home = B.tilesOf(planOf(h), h).vars.Home;
  assert.equal(home.energy_power_entity, 'sensor.hausverbrauch');
  assert.equal(home.energy_entities, undefined);
}

// 3. Grid meter at a device stays the last resort; an area named "Haus" names no room.
{
  const { h, ent, dev } = house();
  h.areas.ha = { area_id: 'ha', name: 'Haus' };
  ent('sensor.haus_gesamt', { name: 'Haus Gesamt', state: '450' });
  same(h, 'sensor.haus_gesamt', '"Haus" is the house');
  delete h.states['sensor.haus_gesamt'];
  dev('d_grid', 'ke', 'Netz');
  ent('sensor.netzbezug_power', { dev: 'd_grid', name: 'Netzbezug', state: '300' });
  same(h, 'sensor.netzbezug_power', 'grid meter');
}

// 4. fillBadges (blank start, migration): Home sums only the rooms it is filled with.
{
  const { h } = house();
  const t = [{ name: 'Home', home: true, vars: {} }, { name: 'Wohnzimmer', vars: {} }, { name: 'Küche', vars: {} }];
  B.fillBadges(h, t);
  assert.deepEqual(sorted(t[0].vars.energy_entities), sorted(t[1].vars.energy_entities.concat(t[2].vars.energy_entities)),
    'Home = rooms, no basement pump');
  assert.deepEqual(sorted(t[0].vars.energy_entities), sorted(ROOM_IDS));
  assert.equal(t[0].vars.casora_energy_auto, 2);
  // Rooms without any power sensor: no sum of other areas on Home.
  const t2 = [{ name: 'Home', home: true, vars: {} }, { name: 'Wohnzimmer', vars: { show_energy: false } }];
  const got = B.fillBadges(h, t2);
  assert.equal(t2[0].vars.energy_entities, undefined, 'no sum without measuring rooms');
  assert.equal(t2[0].vars.casora_energy_auto, undefined);
  assert.ok(!got[0].includes('energy'));
}

// 5. Existing dashboard with the room-named total on Home: one save fixes it.
{
  const { h, ent } = house();
  const rooms = () => [{ name: 'Home', path: 'home', variables: { energy_power_entity: 'sensor.wohnzimmer_gesamtleistung' } },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
    { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'], energy_exclude: [] } }];
  const r = rooms();
  fillRoomEnergy(h, r);
  assert.equal(fillHomeEnergy(h, r), 0, 'no sum marker yet');
  assert.equal(fixHomePower(h, r), true);
  assert.equal(r[0].variables.energy_power_entity, undefined);
  assert.deepEqual(sorted(r[0].variables.energy_entities), sorted(ROOM_IDS));
  assert.equal(r[0].variables.casora_energy_auto, 2);
  assert.equal(fixHomePower(h, r), false, 'runs once');
  // With a house sensor it takes that one instead.
  ent('sensor.total_consumption', { name: 'Total consumption', state: '500' });
  const r2 = rooms();
  assert.equal(fixHomePower(h, r2), true);
  assert.equal(r2[0].variables.energy_power_entity, 'sensor.total_consumption');
  assert.equal(r2[0].variables.energy_entities, undefined);
  assert.equal(fillHomeEnergy(h, r2), 0, 'house sensor: no sum');
  // Picked again by hand afterwards: stays.
  r2[0].variables.energy_power_entity = 'sensor.wohnzimmer_gesamtleistung';
  assert.equal(fixHomePower(h, r2), false, 'hand pick after the fix stays');
}

// 6. What stays: a three phase meter's total, a sensor outside the dashboard's rooms, a room
//    device without "total", Home switched off.
{
  const { h, ent, dev } = house();
  dev('d_3em', 'wz', 'Stromzähler Beispiel 3EM');
  ent('sensor.em_beispiel_total_power', { dev: 'd_3em', name: 'EM Beispiel Total power', state: '700' });
  ent('sensor.em_beispiel_phase_a_power', { dev: 'd_3em', name: 'EM Beispiel Phase A power', state: '200' });
  const home = (id) => [{ name: 'Home', path: 'home', variables: { energy_power_entity: id } },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: {} }, { name: 'Küche', path: 'kueche', variables: {} }];
  for (const id of ['sensor.em_beispiel_total_power', 'sensor.pumpe_total_power', 'sensor.fernseher_power']) {
    const r = home(id);
    assert.equal(fixHomePower(h, r), false, id);
    assert.equal(r[0].variables.energy_power_entity, id);
  }
  const off = home('sensor.wohnzimmer_gesamtleistung');
  off[0].variables.show_energy = false;
  assert.equal(fixHomePower(h, off), false, 'switched off stays off');
}

// 7. fillHomeEnergy: the sum gains new room sensors, keeps hand-added ones, leaves excluded out.
{
  const { h } = house();
  const r = [{ name: 'Home', path: 'home', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.pumpe_total_power'],
    energy_exclude: ['sensor.stehlampe_power'], casora_energy_auto: 2 } },
  { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
  { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.deepEqual(r[0].variables.energy_entities, ['sensor.fernseher_power', 'sensor.pumpe_total_power', 'sensor.kuhlschrank_power']);
  assert.equal(fillHomeEnergy(h, r), 0, 'nothing new');
  r[0].variables.casora_energy_auto = false;
  r[2].variables.energy_entities.push('sensor.neu_power');
  assert.equal(fillHomeEnergy(h, r), 0, 'hand-made list stays');
}

console.log('house_power: ok');
