// Energy badge on Home: the house sensor, else the sum of the rooms (#44).
//   node dev/unit/house_power.mjs
// - A "total" sensor of a device, in an area or named after one ("Wohnzimmer Gesamtleistung") is
//   never the house sensor; "Hausverbrauch" and the grid/meter rules stay. The Studio
//   (casoraBasis.housePower) and the dashboard (window._casoraHousePower, 01-basis.js) pick the same.
// - Without a house sensor Home gets the rooms' sensors as energy_entities (setup and fillBadges),
//   only the rooms on the dashboard, energy_exclude left out.
// - Existing dashboards: a Home sensor only the old rule picked becomes the house sensor or the
//   sum (fixHomePower), only exactly the old rule's pick on an unmarked Home; a phase meter, a
//   sensor outside the rooms, a room's only sensor or any choice stays. fillHomeEnergy keeps
//   Casora's sum in step with the rooms, never a list the user edited (homeEnergyEdit).
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
const { fillRoomEnergy, fillHomeEnergy, fixHomePower, homeEnergyEdit } = new Function(panel.slice(from, panel.indexOf('\nfunction deriveEnergyRooms(', from))
  + '\nreturn { fillRoomEnergy, fillHomeEnergy, fixHomePower, homeEnergyEdit };')();
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
  assert.equal(home.casora_energy_auto, 'house', 'picked by the Studio: marked, the fix leaves it alone');
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

// 7. fillHomeEnergy: while the list is Casora's (marker 2) it follows the rooms, adds and removes;
//    excluded ones (Home or room) stay out; a list the user edited (marker false) stays.
{
  const { h } = house();
  const r = [{ name: 'Home', path: 'home', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.pumpe_total_power'],
    energy_exclude: ['sensor.stehlampe_power'], casora_energy_auto: 2 } },
  { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
  { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.deepEqual(r[0].variables.energy_entities, ['sensor.fernseher_power', 'sensor.kuhlschrank_power'], 'pump not in a room: out');
  assert.equal(fillHomeEnergy(h, r), 0, 'nothing new');
  // Excluded in the room: out of Home too.
  r[1].variables.energy_exclude = ['sensor.fernseher_power'];
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.deepEqual(r[0].variables.energy_entities, ['sensor.kuhlschrank_power']);
  // Room deleted, no room measures: no sum left.
  r.splice(2, 1);
  r[1].variables.show_energy = false;
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.equal(r[0].variables.energy_entities, undefined);
  assert.equal(r[0].variables.casora_energy_auto, 2, 'stays automatic, comes back with a measuring room');
  r[1].variables.show_energy = true;
  r[1].variables.energy_exclude = [];
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.deepEqual(r[0].variables.energy_entities, ['sensor.fernseher_power'], 'back, the exclude on Home still out');
  // Edited by the user: never touched again.
  const u = [{ name: 'Home', path: 'home', variables: { energy_entities: ['sensor.fernseher_power'], casora_energy_auto: 2 } },
    { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  homeEnergyEdit(u[0].variables, 'energy_entities', ['sensor.fernseher_power']);
  assert.equal(u[0].variables.casora_energy_auto, false);
  assert.equal(fillHomeEnergy(h, u), 0, 'hand-made list stays');
  assert.deepEqual(u[0].variables.energy_entities, ['sensor.fernseher_power']);
}

// 8. A house meter in a dashboard room never counts twice: a phase meter's total is the house
//    sensor (Studio and dashboard), never a summand; a room's only sensor that the old rule put on
//    Home stays there (it may be the house meter).
{
  const { h, ent, dev } = house();
  dev('d_3em', 'ke', 'Messklemme');
  ent('sensor.klemme_total_power', { dev: 'd_3em', name: 'Klemme Total power', state: '700' });
  ent('sensor.klemme_phase_a_power', { dev: 'd_3em', name: 'Klemme Phase A power', state: '200' });
  same(h, 'sensor.klemme_total_power', 'phase meter is the house');
  const p = B.plan(h, ['Wohnzimmer', 'Küche', 'Keller'], Object.assign({}, B.DEFAULTS));
  const home = B.tilesOf(p, h).vars[p.rooms[0].name];
  assert.equal(home.energy_power_entity, 'sensor.klemme_total_power');
  assert.equal(home.energy_entities, undefined);
  assert.deepEqual(B.homeSumIds(h, [{ energy_power_entity: 'sensor.klemme_total_power' }, { energy_entities: ['sensor.fernseher_power'] }]),
    ['sensor.fernseher_power'], 'phase meter is no summand');
  // Single phase clamp (no phase sensors) as the Keller room's only sensor, picked by the old rule.
  const s = house();
  s.dev('d_em', 'ke', 'Messklemme');
  s.ent('sensor.klemme_total_power', { dev: 'd_em', name: 'Klemme Total power', state: '700' });
  delete s.h.states['sensor.wohnzimmer_gesamtleistung'];
  delete s.h.states['sensor.pumpe_total_power'];
  assert.equal(B.oldHouseTotal(s.h), 'sensor.klemme_total_power');
  const r = [{ name: 'Home', path: 'home', variables: { energy_power_entity: 'sensor.klemme_total_power' } },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power'] } },
    { name: 'Keller', path: 'keller', variables: { energy_power_entity: 'sensor.klemme_total_power' } }];
  assert.equal(fixHomePower(s.h, r), false, 'a room\'s only sensor: no sum that counts it twice');
  assert.equal(r[0].variables.energy_power_entity, 'sensor.klemme_total_power');
}

// 8b. Single phase meter without phase sensors (Shelly EM style): nothing to switch on the device plus
//     returned energy, voltage with power factor, or a meter model. Its total is the house sensor and
//     never a summand of the sum on Home. A plug named "Total" (it has a switch) stays a consumer.
{
  const extra = (h, eid, dc, name) => {
    h.entities[eid] = { entity_id: eid, device_id: h.entities['sensor.klemme_total_power'] ? 'd_em' : null, area_id: null, platform: 'zha' };
    h.states[eid] = { entity_id: eid, state: '1', attributes: { device_class: dc, friendly_name: name } };
  };
  const clamp = () => {
    const s = house();
    s.dev('d_em', 'ke', 'Messklemme');
    s.ent('sensor.klemme_total_power', { dev: 'd_em', name: 'Klemme Total power', state: '700' });
    return s;
  };
  const rooms = ['Wohnzimmer', 'Küche', 'Keller'];
  const check = (s, msg) => {
    same(s.h, 'sensor.klemme_total_power', msg + ': house sensor');
    const p = B.plan(s.h, rooms, Object.assign({}, B.DEFAULTS));
    const home = B.tilesOf(p, s.h).vars[p.rooms[0].name];
    assert.equal(home.energy_power_entity, 'sensor.klemme_total_power', msg + ': on Home');
    assert.deepEqual(B.homeSumIds(s.h, [{ energy_power_entity: 'sensor.klemme_total_power' }, { energy_entities: ['sensor.fernseher_power'] }]),
      ['sensor.fernseher_power'], msg + ': no summand');
  };
  let s = clamp();
  extra(s.h, 'sensor.klemme_energy_returned', 'energy', 'Klemme Energy returned');
  check(s, 'returned energy');
  s = clamp();
  extra(s.h, 'sensor.klemme_voltage', 'voltage', 'Klemme Voltage');
  extra(s.h, 'sensor.klemme_power_factor', 'power_factor', 'Klemme Power factor');
  check(s, 'voltage + power factor');
  s = clamp();
  s.h.devices.d_em.model = 'Shelly EM';
  check(s, 'meter model');
  const kp = B.plan(s.h, rooms, Object.assign({}, B.DEFAULTS));
  const keller = B.tilesOf(kp, s.h).vars['Keller'];
  assert.ok(keller, 'Keller room vars');
  assert.notEqual(keller.energy_power_entity, 'sensor.klemme_total_power', 'meter is not the Keller room\'s own power');
  assert.ok(!(keller.energy_entities || []).includes('sensor.klemme_total_power'), 'meter is no Keller summand');
  // The same sensors on a plug (switch on the device): a consumer, no house sensor, a summand.
  s = clamp();
  extra(s.h, 'sensor.klemme_voltage', 'voltage', 'Klemme Voltage');
  extra(s.h, 'sensor.klemme_power_factor', 'power_factor', 'Klemme Power factor');
  extra(s.h, 'switch.klemme', 'outlet', 'Klemme');
  s.h.devices.d_em.model = 'Smart Plug';
  delete s.h.states['sensor.wohnzimmer_gesamtleistung'];
  delete s.h.states['sensor.pumpe_total_power'];
  same(s.h, null, 'plug named Total');
  assert.deepEqual(B.homeSumIds(s.h, [{ energy_power_entity: 'sensor.klemme_total_power' }]), ['sensor.klemme_total_power'], 'plug is a summand');
}

// 9. A choice is never overwritten: only exactly the old rule's pick on an unmarked Home.
{
  const { h, ent } = house();
  ent('sensor.kueche_gesamt', { name: 'Küche Gesamt', state: '90' });
  const rooms = (id, extra) => [{ name: 'Home', path: 'home', variables: Object.assign({ energy_power_entity: id }, extra || {}) },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
    { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  assert.equal(B.oldHouseTotal(h), 'sensor.wohnzimmer_gesamtleistung');
  assert.equal(fixHomePower(h, rooms('sensor.kueche_gesamt')), false, 'not the old pick: chosen by someone');
  assert.equal(fixHomePower(h, rooms('sensor.wohnzimmer_gesamtleistung', { casora_energy_auto: false })), false, 'edited by the user');
  assert.equal(fixHomePower(h, rooms('sensor.wohnzimmer_gesamtleistung', { casora_energy_auto: 'house' })), false, 'picked by the Studio');
  const r = rooms('sensor.wohnzimmer_gesamtleistung');
  homeEnergyEdit(r[0].variables, 'energy_power_entity', 'sensor.wohnzimmer_gesamtleistung');
  assert.equal(fixHomePower(h, r), false, 'entered in the Studio');
  assert.equal(fixHomePower(h, rooms('sensor.wohnzimmer_gesamtleistung')), true, 'the old pick, unmarked: fixed');
}

// 10. A house sensor entered over the automatic sum replaces it; over a hand-made list it does not.
{
  const V = { energy_entities: ['sensor.fernseher_power'], casora_energy_auto: 2 };
  homeEnergyEdit(V, 'energy_power_entity', 'sensor.hausverbrauch');
  V.energy_power_entity = 'sensor.hausverbrauch';
  assert.equal(V.energy_entities, undefined, 'automatic sum gone: preview and dashboard show the sensor');
  assert.equal(V.casora_energy_auto, false);
  const W = { energy_entities: ['sensor.fernseher_power'], casora_energy_auto: false };
  homeEnergyEdit(W, 'energy_power_entity', 'sensor.hausverbrauch');
  assert.deepEqual(W.energy_entities, ['sensor.fernseher_power'], 'hand-made list stays');
  const X = { energy_entities: ['sensor.fernseher_power'], casora_energy_auto: 2 };
  homeEnergyEdit(X, 'energy_title', 'Strom');
  assert.equal(X.casora_energy_auto, 2, 'other fields: still automatic');
}

// 11. Westerloer (#44): a PV statistics integration's peak/period values are no house consumption; the meter's
//     entity ID writes "stromzahler" without umlaut. Casora's own pick of such a value is picked again; clearing
//     the house sensor in the Studio gives the rooms' sum instead of hiding the badge.
{
  const { h, ent, dev } = house();
  delete h.states['sensor.wohnzimmer_gesamtleistung'];
  delete h.states['sensor.pumpe_total_power'];
  dev('d_pv', null, 'PV-Anlage');
  ent('sensor.pv_netzbezugs_spitze_heute', { dev: 'd_pv', name: 'Netzbezugs-Spitze heute', state: '1700' });
  ent('sensor.pv_grundlast', { dev: 'd_pv', name: 'Grundlast', state: '300' });
  ent('sensor.pv_uberschuss_letzte_stunde', { dev: 'd_pv', name: 'Überschuss letzte Stunde', state: '-100' });
  same(h, null, 'peak and period values are not the house');
  dev('d_ir', null, 'Tasmota');
  ent('sensor.stromzahler_emh_power_curr', { dev: 'd_ir', name: 'Wirkleistung (W)', state: '424' });
  // An SMA inverter's "Grid power" is its output, never the house; neither is anything named solar/PV.
  dev('d_sma', null, 'STP 8000TL-20');
  ent('sensor.stp_8000tl_20_grid_power', { dev: 'd_sma', name: 'STP 8000TL-20 Grid power', state: '2400' });
  h.entities['sensor.stp_8000tl_20_grid_power'].platform = 'sma';
  ent('sensor.solar_netzleistung', { name: 'Solar Netzleistung', state: '2400' });
  const meter = h.states['sensor.stromzahler_emh_power_curr'];
  delete h.states['sensor.stromzahler_emh_power_curr'];
  same(h, null, 'inverter output is not the house');
  h.states['sensor.stromzahler_emh_power_curr'] = meter;
  same(h, 'sensor.stromzahler_emh_power_curr', 'meter without umlaut in the entity ID');
  assert.equal(B.housePowerOk(h, 'sensor.pv_netzbezugs_spitze_heute'), false);
  // Casora picked the peak (marker "house"): picked again on the next Studio load.
  const rooms = () => [{ name: 'Home', path: 'home', variables: { energy_power_entity: 'sensor.pv_netzbezugs_spitze_heute', casora_energy_auto: 'house' } },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
    { name: 'Küche', path: 'kuche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  let r = rooms();
  assert.equal(fixHomePower(h, r), true);
  assert.equal(r[0].variables.energy_power_entity, 'sensor.stromzahler_emh_power_curr', 'own pick replaced by the meter');
  // Without the meter: the rooms' sum.
  delete h.states['sensor.stromzahler_emh_power_curr'];
  r = rooms();
  assert.equal(fixHomePower(h, r), true);
  assert.equal(r[0].variables.energy_power_entity, undefined);
  assert.deepEqual(sorted(r[0].variables.energy_entities), sorted(['sensor.fernseher_power', 'sensor.stehlampe_power', 'sensor.kuhlschrank_power']));
  // The user's own choice of the same peak stays.
  r = rooms(); r[0].variables.casora_energy_auto = false;
  assert.equal(fixHomePower(h, r), false);
  // Clearing the house sensor in the Studio: marker 2, the sum follows the rooms.
  r = rooms(); r[0].variables.casora_energy_auto = false;
  homeEnergyEdit(r[0].variables, 'energy_power_entity', undefined);
  delete r[0].variables.energy_power_entity;
  assert.equal(r[0].variables.casora_energy_auto, 2, 'cleared: Casora sums again');
  assert.equal(fillHomeEnergy(h, r), 1);
  assert.equal(r[0].variables.energy_entities.length, 3, 'sum of the rooms after clearing');
  // A hand-made list stays the user's.
  r = rooms(); r[0].variables.casora_energy_auto = false; r[0].variables.energy_entities = ['sensor.fernseher_power'];
  homeEnergyEdit(r[0].variables, 'energy_power_entity', undefined);
  assert.equal(r[0].variables.casora_energy_auto, false, 'own list: stays the user\'s');
}

console.log('house_power: ok');
