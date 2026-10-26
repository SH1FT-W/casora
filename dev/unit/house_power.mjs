// Energy badge on Home: the house sensor, else the sum of the rooms (#44).
//   node dev/unit/house_power.mjs
// - A "total" sensor of a device, in an area or named after one ("Wohnzimmer Gesamtleistung") is
//   never the house sensor; "Hausverbrauch" and the grid/meter rules stay. The Studio
//   (casoraBasis.housePower) and the dashboard (window._casoraHousePower, 01-basis.js) pick the same.
// - Without a house sensor Home gets the rooms' sensors as energy_entities (setup and fillBadges),
//   only the rooms on the dashboard, energy_exclude left out.
// - HA's energy settings (energy/get_prefs) come first: the grid power sensor alone is Home's sensor, with solar and
//   battery the three are Home's list and their sum is the house (prefsHomePower switches what Casora chose).
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
// HA's energy settings (00-finder.js) and the sum the badge uses (casora-core.js _casoraPowerSum).
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();
const core = src('custom_components/casora/scripts/casora-core.js');
const c0 = core.indexOf('if (window._casoraPowerSum) return;');
new Function(core.slice(core.lastIndexOf('(function () {', c0), core.indexOf('})();', c0) + 5))();
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const panel = src('custom_components/casora/panel/casora-panel.js');
const from = panel.indexOf('const ENERGY_VAR = ');
const { fillRoomEnergy, fillHomeEnergy, fixHomePower, prefsHomePower, homeEnergyEdit } = new Function(panel.slice(from, panel.indexOf('\nfunction deriveEnergyRooms(', from))
  + '\nreturn { fillRoomEnergy, fillHomeEnergy, fixHomePower, prefsHomePower, homeEnergyEdit };')();
const basis = src('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraHousePowerIds = function');
new Function(basis.slice(b0, basis.indexOf('\nwindow._casoraRoomNames', b0)))();
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

// 12. HA's energy settings come before the names (#44). The grid alone: Home's sensor in the Studio and on the
//     dashboard; with solar and battery the three are a list whose sum is the house (HA's signs: grid import,
//     battery discharge and solar positive).
const prefsLoad = async (h, prefs) => {
  h.callWS = async () => { if (prefs instanceof Error) throw prefs; return prefs; };
  await window.casoraEnergyPrefs.load(h, true);
};
const notFound = Object.assign(new Error('No prefs'), { code: 'not_found' });
const homeOf = (h) => { const p = planOf(h); return B.tilesOf(p, h).vars[p.rooms[0].name]; };
const sumOf = (h, ids) => window._casoraPowerSum({ energy_entities: ids }, h.states).sum;
function solarHouse() {
  const s = house();
  s.dev('d_m', null, 'Lesekopf');
  s.ent('sensor.zaehler_wirkleistung', { dev: 'd_m', name: 'Wirkleistung', state: '-300' });
  // HA's own template sensors for an inverted or a two sensor power_config.
  s.ent('sensor.energy_grid_power', { name: 'Grid power', state: '-300' });
  s.ent('sensor.wechselrichter_ac_power', { name: 'Wechselrichter AC power', state: '2.4' });
  s.h.states['sensor.wechselrichter_ac_power'].attributes.unit_of_measurement = 'kW';
  s.ent('sensor.energy_battery_power', { name: 'Battery power', state: '-500' });
  s.ent('sensor.hausverbrauch', { name: 'Hausverbrauch', state: '1600' });
  return s;
}
const GRID_ONLY = { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.bezug', stat_energy_to: null,
  power_config: { stat_rate: 'sensor.zaehler_wirkleistung' }, stat_rate: 'sensor.zaehler_wirkleistung', cost_adjustment_day: 0 }] };
const FULL = { energy_sources: [
  { type: 'grid', stat_energy_from: 'sensor.bezug', stat_energy_to: 'sensor.einspeisung',
    power_config: { stat_rate_inverted: 'sensor.zaehler_wirkleistung' }, stat_rate: 'sensor.energy_grid_power', cost_adjustment_day: 0 },
  { type: 'solar', stat_energy_from: 'sensor.pv_ertrag', stat_rate: 'sensor.wechselrichter_ac_power', config_entry_solar_forecast: null },
  { type: 'battery', stat_energy_from: 'sensor.akku_aus', stat_energy_to: 'sensor.akku_ein',
    power_config: { stat_rate_from: 'sensor.akku_entladen', stat_rate_to: 'sensor.akku_laden' }, stat_rate: 'sensor.energy_battery_power' }] };
const FULL_IDS = ['sensor.energy_grid_power', 'sensor.wechselrichter_ac_power', 'sensor.energy_battery_power'];
{
  const { h } = solarHouse();
  await prefsLoad(h, GRID_ONLY);
  let home = homeOf(h);
  assert.equal(home.energy_power_entity, 'sensor.zaehler_wirkleistung', 'grid alone: Home\'s sensor, before "Hausverbrauch"');
  assert.equal(home.energy_entities, undefined);
  assert.equal(home.casora_energy_auto, 'prefs');
  assert.equal(dashPick(h), 'sensor.zaehler_wirkleistung', 'dashboard: the same sensor');
  // Grid, solar (kW) and battery: the list, its sum is the house.
  await prefsLoad(h, FULL);
  home = homeOf(h);
  assert.equal(home.energy_power_entity, undefined);
  assert.deepEqual(home.energy_entities, FULL_IDS);
  assert.equal(home.casora_energy_auto, 'prefs');
  assert.equal(sumOf(h, home.energy_entities), 1600, '-300 + 2400 - 500 = the house');
  current = h; delete window._casoraHPGuess;
  assert.deepEqual(window._casoraHousePowerIds(), FULL_IDS, 'dashboard: the same list');
  assert.equal(window._casoraHousePower(), null, 'a sum is no single sensor');
  // fillBadges (blank start): the settings' list stays, no rooms' sum over it.
  const t = [{ name: 'Home', home: true, vars: {} }, { name: 'Wohnzimmer', vars: {} }, { name: 'Küche', vars: {} }];
  B.fillBadges(h, t);
  assert.deepEqual(t[0].vars.energy_entities, FULL_IDS);
  assert.equal(t[0].vars.casora_energy_auto, 'prefs');
  // Legacy grid format (flow_from, power: [{ stat_rate }]) works the same.
  await prefsLoad(h, { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.bezug' }], flow_to: [],
    power: [{ stat_rate: 'sensor.zaehler_wirkleistung' }], cost_adjustment_day: 0 }] });
  assert.equal(homeOf(h).energy_power_entity, 'sensor.zaehler_wirkleistung', 'legacy format');
  // Incomplete settings are no house: solar without a power sensor (the sum would miss it), no grid power, or the
  // grid sensor missing in HA. Then the names decide as before.
  for (const [msg, prefs] of [
    ['solar without power', { energy_sources: [GRID_ONLY.energy_sources[0], { type: 'solar', stat_energy_from: 'sensor.pv_ertrag' }] }],
    ['no grid power', { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.bezug' }, FULL.energy_sources[1]] }],
    ['grid sensor gone', { energy_sources: [{ type: 'grid', stat_rate: 'sensor.weg' }] }]]) {
    await prefsLoad(h, prefs);
    assert.equal(B.prefsHouse(h), null, msg);
    assert.equal(homeOf(h).energy_power_entity, 'sensor.hausverbrauch', msg + ': names decide');
    assert.equal(dashPick(h), 'sensor.hausverbrauch', msg + ': dashboard too');
  }
  // An inverter that is unavailable at night still counts as the settings' solar sensor.
  await prefsLoad(h, FULL);
  h.states['sensor.wechselrichter_ac_power'].state = 'unavailable';
  assert.deepEqual(B.prefsHouse(h).ids, FULL_IDS, 'unavailable at night: still the house list');
  h.states['sensor.wechselrichter_ac_power'].state = '2.4';
  // No energy settings at all (HA answers not_found): the name rules, unchanged.
  await prefsLoad(h, notFound);
  assert.equal(B.prefsHouse(h), null);
  same(h, 'sensor.hausverbrauch', 'no settings');
  assert.equal(homeOf(h).casora_energy_auto, 'house');
}

// 13. Existing dashboards: what Casora chose follows the settings, a user's choice never.
{
  const { h } = solarHouse();
  delete h.states['sensor.hausverbrauch'];
  await prefsLoad(h, FULL);
  const rooms = (V) => [{ name: 'Home', path: 'home', variables: V },
    { name: 'Wohnzimmer', path: 'wohnzimmer', variables: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'] } },
    { name: 'Küche', path: 'kueche', variables: { energy_entities: ['sensor.kuhlschrank_power'] } }];
  // Casora's rooms' sum (2), its house pick ("house"), the old rule's unmarked pick: switched.
  for (const V of [{ energy_entities: ROOM_IDS.slice(), casora_energy_auto: 2 },
    { energy_power_entity: 'sensor.zaehler_wirkleistung', casora_energy_auto: 'house' },
    { energy_power_entity: 'sensor.wohnzimmer_gesamtleistung' }]) {
    const r = rooms(V);
    assert.equal(prefsHomePower(h, r), true, JSON.stringify(V));
    assert.deepEqual(r[0].variables.energy_entities, FULL_IDS);
    assert.equal(r[0].variables.energy_power_entity, undefined);
    assert.equal(r[0].variables.casora_energy_auto, 'prefs');
    assert.equal(prefsHomePower(h, r), false, 'runs once');
    assert.equal(fillHomeEnergy(h, r), 0, 'no rooms\' sum over the settings');
    assert.equal(fixHomePower(h, r), false, 'the old fix leaves it alone');
  }
  // #44 stalakerob 24.10.: a Home badge just switched on (nothing set, no marker) gets the settings too;
  // one that already has a cost/usage field of the user's does not.
  {
    const r = rooms({});
    assert.equal(prefsHomePower(h, r), true, 'empty Home badge: filled from the settings');
    assert.deepEqual(r[0].variables.energy_entities, FULL_IDS);
    assert.equal(r[0].variables.casora_energy_auto, 'prefs');
    const u = rooms({ energy_cost_today: 'sensor.kosten_heute' });
    assert.equal(prefsHomePower(h, u), false, 'the user already set a field: untouched');
  }
  // The user's choice stays: marker false, an unmarked sensor that is not the old pick, energy switched off.
  for (const V of [{ energy_power_entity: 'sensor.kuhlschrank_power', casora_energy_auto: false },
    { energy_entities: ['sensor.fernseher_power'], casora_energy_auto: false },
    { energy_power_entity: 'sensor.kuhlschrank_power' },
    { energy_entities: ROOM_IDS.slice(), casora_energy_auto: 2, show_energy: false },
    // The user cleared the house sensor and chose the rooms' sum (review 23.10.2026).
    { energy_entities: ROOM_IDS.slice(), casora_energy_auto: 2, casora_energy_rooms: true }]) {
    const r = rooms(Object.assign({}, V));
    assert.equal(prefsHomePower(h, r), false, JSON.stringify(V));
    assert.deepEqual(r[0].variables, V);
  }
  // Settings changed (battery removed): the list follows; without any power in them, back to the name rules, else
  // the rooms' sum.
  let r = rooms({ energy_entities: FULL_IDS.slice(), casora_energy_auto: 'prefs' });
  await prefsLoad(h, { energy_sources: FULL.energy_sources.slice(0, 2) });
  assert.equal(prefsHomePower(h, r), true);
  assert.deepEqual(r[0].variables.energy_entities, FULL_IDS.slice(0, 2));
  await prefsLoad(h, { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.bezug' }] });
  assert.equal(prefsHomePower(h, r), true);
  assert.equal(r[0].variables.energy_power_entity, 'sensor.energy_grid_power', 'name rules: "Grid power"');
  assert.equal(r[0].variables.energy_entities, undefined);
  assert.equal(r[0].variables.casora_energy_auto, 'house');
  const grid = h.states['sensor.energy_grid_power'];
  delete h.states['sensor.energy_grid_power'];
  r = rooms({ energy_entities: FULL_IDS.slice(), casora_energy_auto: 'prefs' });
  assert.equal(prefsHomePower(h, r), true);
  assert.equal(r[0].variables.casora_energy_auto, 2);
  assert.deepEqual(sorted(r[0].variables.energy_entities), sorted(ROOM_IDS), 'rooms\' sum again');
  h.states['sensor.energy_grid_power'] = grid;
  // Settings that only lack a sensor for now (not loaded yet in HA): the list stays.
  const r2 = rooms({ energy_entities: FULL_IDS.slice(), casora_energy_auto: 'prefs' });
  await prefsLoad(h, FULL);
  const bat = h.states['sensor.energy_battery_power'];
  delete h.states['sensor.energy_battery_power'];
  assert.equal(prefsHomePower(h, r2), false);
  assert.deepEqual(r2[0].variables.energy_entities, FULL_IDS);
  h.states['sensor.energy_battery_power'] = bat;
  // The user edits the list: theirs from now on.
  homeEnergyEdit(r2[0].variables, 'energy_entities', FULL_IDS.slice(0, 1));
  assert.equal(r2[0].variables.casora_energy_auto, false);
  assert.equal(prefsHomePower(h, r2), false);
  // The user clears the settings' grid sensor: the rooms' sum, the grid sensor does not come back.
  await prefsLoad(h, GRID_ONLY);
  const r3 = rooms({ energy_power_entity: 'sensor.zaehler_wirkleistung', casora_energy_auto: 'prefs' });
  homeEnergyEdit(r3[0].variables, 'energy_power_entity', undefined);
  delete r3[0].variables.energy_power_entity;
  assert.equal(r3[0].variables.casora_energy_auto, 2);
  assert.equal(fillHomeEnergy(h, r3), 1);
  assert.equal(prefsHomePower(h, r3), false, 'cleared by the user: stays off');
  assert.deepEqual(sorted(r3[0].variables.energy_entities), sorted(ROOM_IDS));
  // A house sensor entered over the settings' list replaces the list.
  const W = { energy_entities: FULL_IDS.slice(), casora_energy_auto: 'prefs' };
  homeEnergyEdit(W, 'energy_power_entity', 'sensor.kuhlschrank_power');
  assert.equal(W.energy_entities, undefined);
  assert.equal(W.casora_energy_auto, false);
  await prefsLoad(h, notFound);
}

// 14. Home popup (Weich, 05-weich-mehr.js) over the settings' list at night: the sleeping inverter is 0 W, not
//     "1 Gerät ohne Wert", in the hero and in "Woher kommt der Strom"; a room's device without a value still counts.
{
  const { h } = solarHouse();
  await prefsLoad(h, FULL);
  current = h;
  const groups = [];
  window._casoraUI = { more: () => '', label: (t) => '[' + t + ']', group: (rows) => { groups.push(rows); return 'G'; },
    hero: (o) => 'H:' + o.value + '|' + (o.sub || '') };
  window.addEventListener = window.addEventListener || (() => {});
  new Function(src('custom_components/casora/scripts/local/05-weich-mehr.js'))();
  const E = window._casoraSoftEnergy;
  // The hero card's code, as the popup builds it (the sources must be known before the hero).
  const heroOf = (ids) => {
    const out = E.build({ hass: h, states: h.states, variables: { power_entities: ids }, powerId: null });
    const code = JSON.stringify(out).match(/\[\[\[\\n(return window\._casoraSoftEnergy \? window\._casoraSoftEnergy\.sec\(\\"hero\\".*?)\\n\]\]\]/);
    assert.ok(code, 'hero card found');
    return new Function('states', 'hass', JSON.parse('"' + code[1] + '"'))(h.states, h);
  };
  h.states['sensor.wechselrichter_ac_power'].state = 'unavailable';
  h.states['sensor.energy_grid_power'].state = '400';
  h.states['sensor.energy_battery_power'].state = '300';
  assert.equal(heroOf(FULL_IDS), 'H:700 W|', 'night: grid + battery, no device without a value');
  const C = { sum: { energy_entities: FULL_IDS }, sources: window.casoraEnergySources(h, FULL_IDS) };
  E.sec('sources', C, h.states, h);
  const solarRow = groups.pop().find((r) => r.entity === 'sensor.wechselrichter_ac_power');
  assert.equal(solarRow.value, '0 W', 'sources: solar asleep');
  assert.equal(solarRow.sub, null, 'sources: not "Nicht erreichbar"');
  // The grid is never asleep; a room's list without the settings keeps "ohne Wert".
  h.states['sensor.energy_grid_power'].state = 'unavailable';
  assert.match(heroOf(FULL_IDS), /1 Gerät ohne Wert/, 'grid without a value still counts');
  h.states['sensor.fernseher_power'].state = 'unavailable';
  assert.match(heroOf(['sensor.fernseher_power', 'sensor.stehlampe_power']), /1 Gerät ohne Wert/, 'room list: as before');
  current = null;
}

// 14. #44: with "individual devices" in HA's energy settings the popup lists exactly those (casoraEnergyConsumers), by
//     power: stat_rate, else the power sensor on the consumption entity's device, else today's energy; the settings'
//     name wins; wallbox and inverter power sensors (MPPT1, BDC rated) never appear. The battery row shows the charge
//     level from a percent sensor sharing the power sensor's id stem. Without entries: the automatic top list as before.
{
  const { h, dev, ent } = solarHouse();
  dev('d_wm', 'ku', 'Waschmaschine');
  ent('sensor.waschmaschine_leistung', { dev: 'd_wm', name: 'Waschmaschine Leistung', state: '1.2' });
  h.states['sensor.waschmaschine_leistung'].attributes.unit_of_measurement = 'kW';
  const kwh = (eid, d, name, state, unit = 'kWh') => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: null, platform: d ? 'zha' : 'template' };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: 'energy', unit_of_measurement: unit, friendly_name: name, state_class: 'total_increasing' } };
  };
  kwh('sensor.waschmaschine_energie', 'd_wm', 'Waschmaschine Energie', '812.4');
  kwh('sensor.fernseher_energie', 'd_tv', 'Fernseher Energie', '120.0');
  kwh('sensor.ofen_energie_heute', null, 'Ofen Energie heute', '1.8');
  kwh('sensor.pumpe_energie', null, 'Pumpe Energie', '3200', 'Wh');
  // Distractors: wallbox and inverter strings, large power sensors but not "individual devices".
  dev('d_wb', 'ke', 'Wallbox');
  ent('sensor.wallbox_bdc_rated_power', { dev: 'd_wb', name: 'BDC rated power', state: '8000' });
  ent('sensor.wallbox_vehicle_auxiliary', { dev: 'd_wb', name: 'Vehicle Auxiliary', state: '400' });
  ent('sensor.wechselrichter_mppt1_power', { name: 'MPPT1 Power', state: '1300' });
  ent('sensor.wechselrichter_mppt2_power', { name: 'MPPT2 Power', state: '1100' });
  // The battery's percent sensor, with the power sensor's id stem (no device); a state-of-health sensor is no SoC.
  h.states['sensor.energy_battery_soh'] = { entity_id: 'sensor.energy_battery_soh', state: '97', attributes: { unit_of_measurement: '%', friendly_name: 'Battery health' } };
  h.states['sensor.energy_battery_soc'] = { entity_id: 'sensor.energy_battery_soc', state: '78.4', attributes: { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Battery SoC' } };
  const DEVICES = [
    { stat_consumption: 'sensor.waschmaschine_energie' },                                  // power from the device
    { stat_consumption: 'sensor.fernseher_energie', stat_rate: 'sensor.fernseher_power' }, // power named in HA
    { stat_consumption: 'sensor.ofen_energie_heute', name: 'Backofen' },                   // today's kWh, own name
    { stat_consumption: 'sensor.pumpe_energie' },                                           // meter in Wh only
    { stat_consumption: 'sensor.pv_ertrag' },                                               // a source's meter: never
    { stat_consumption: 'sensor.esstisch_energie' },                                        // #44: disabled in HA (no state)
  ];
  await prefsLoad(h, { ...FULL, device_consumption: DEVICES });
  current = h;
  const L = window.casoraEnergyConsumers(h);
  assert.deepEqual(L.map((x) => [x.id, x.power, x.name]), [
    ['sensor.waschmaschine_energie', 'sensor.waschmaschine_leistung', 'Waschmaschine'],
    ['sensor.fernseher_energie', 'sensor.fernseher_power', 'Fernseher'],
    ['sensor.ofen_energie_heute', null, 'Backofen'],
    ['sensor.pumpe_energie', null, 'Pumpe'],
  ], 'consumers: exactly the settings\' devices, by power, without the sources');
  assert.equal(L[0].w, 1200, 'kW → W');
  assert.deepEqual([L[2].kwh, L[2].daily, L[3].kwh, L[3].daily], [1.8, true, 3.2, false], 'energy: today vs. a meter');
  assert.deepEqual(window.casoraEnergyConsumers.ids(L), ['sensor.waschmaschine_leistung', 'sensor.fernseher_power', 'sensor.ofen_energie_heute', 'sensor.pumpe_energie']);
  assert.equal(window.casoraEnergyBatterySoc(h, 'sensor.energy_battery_power'), 'sensor.energy_battery_soc', 'SoC by id stem, not the health sensor');
  assert.equal(window.casoraEnergyBatterySoc(h, 'sensor.zaehler_wirkleistung'), null, 'the meter has no SoC');

  // The popup: the "sources" card renders the settings' sources with the charge level, then the consumers.
  const groups = [], labels = [];
  window._casoraUI = { more: () => '', label: (t) => { labels.push(t); return '[' + t + ']'; }, group: (rows) => { groups.push(rows); return 'G'; },
    hero: (o) => 'H:' + o.value + '|' + (o.sub || '') };
  window.addEventListener = window.addEventListener || (() => {});
  const E = window._casoraSoftEnergy;
  const cardOf = (out, part) => {
    const code = JSON.stringify(out).match(new RegExp('\\[\\[\\[\\\\n(return window\\._casoraSoftEnergy \\? window\\._casoraSoftEnergy\\.sec\\(\\\\"' + part + '\\\\".*?)\\\\n\\]\\]\\]'));
    assert.ok(code, part + ' card found');
    return JSON.parse('"' + code[1] + '"');
  };
  const out = E.build({ hass: h, states: h.states, variables: { power_entities: FULL_IDS }, powerId: null });
  // #62: with solar and a battery the popup draws the energy flow; the sources card then lists only the consumers
  // (the sources are the flow's circles). The rows' texts are checked on the card without the flow (srcCode).
  assert.match(JSON.stringify(out), /_casoraSoftEnergy\.flow\(/, 'the energy flow card is there');
  const srcFlow = cardOf(out, 'sources');
  assert.match(srcFlow, /"flowOn":true/, 'the sources card knows the flow');
  const srcCode = srcFlow.replace('"flowOn":true', '"flowOn":false');
  assert.match(srcCode, /"auto":\{"ha":true\}/, 'the sources card lists HA\'s devices');
  const watch = JSON.stringify(out);
  assert.match(watch, /sensor\.energy_battery_soc/, 'the charge level sensor is watched');
  assert.match(watch, /sensor\.waschmaschine_leistung/, 'the devices\' power sensors are watched');
  // The consumers' HTML is built before the sources' label: find the groups by content.
  const run = (code) => {
    groups.length = 0; labels.length = 0;
    new Function('states', 'hass', code)(h.states, h);
    const s = groups.find((g) => g.some((r) => r.entity === 'sensor.energy_battery_power'));
    return { s, c: groups.find((g) => g !== s) };
  };
  let R = run(srcFlow);
  assert.deepEqual(labels, ['Verbraucher'], 'with the flow: no second list of the sources');
  R = run(srcCode);
  assert.deepEqual(labels.sort(), ['Verbraucher', 'Woher kommt der Strom'], 'titles: no "Top 5"');
  const batt = R.s.find((r) => r.entity === 'sensor.energy_battery_power');
  assert.equal(batt.sub, 'Lädt · 78 %', 'battery row: charging with the charge level');
  assert.deepEqual(R.c.map((r) => [r.label, r.value, r.sub]), [
    ['Waschmaschine', '1,2 kW', '75 % des aktuellen Verbrauchs'],
    ['Fernseher', '60 W', '4 % des aktuellen Verbrauchs'],
    ['Backofen', '1,8 kWh', 'heute'],
    ['Pumpe', '3,2 kWh', null],
  ], 'consumer rows');
  assert.ok(!JSON.stringify(R.c).match(/mppt|bdc|auxiliary/i), 'no wallbox or inverter sensors');
  // Battery discharging, SoC alone when the battery rests.
  h.states['sensor.energy_battery_power'].state = '300';
  assert.equal(run(srcCode).s.find((r) => r.entity === 'sensor.energy_battery_power').sub, 'Entlädt · 78 %');
  h.states['sensor.energy_battery_power'].state = '0';
  assert.equal(run(srcCode).s.find((r) => r.entity === 'sensor.energy_battery_power').sub, '78 %');
  // A device whose power sensor is unreachable says so and goes last.
  h.states['sensor.fernseher_power'].state = 'unavailable';
  R = run(srcCode);
  const tv = R.c.find((r) => r.label === 'Fernseher');
  assert.deepEqual([tv.value, tv.sub, R.c.indexOf(tv)], [null, 'Nicht erreichbar', 3], 'unreachable power sensor');
  h.states['sensor.fernseher_power'].state = '60';
  // A house sensor (no list) with the settings' devices: the same list in the "auto" card.
  const out2 = E.build({ hass: h, states: h.states, variables: {}, powerId: 'sensor.hausverbrauch' });
  run(cardOf(out2, 'auto'));
  assert.deepEqual(labels, ['Verbraucher']);
  assert.equal(groups[0][0].label, 'Waschmaschine');
  // The sub-badge popup "Zuhause" (20-energie-fokus.js) uses the same list; peers() finds the battery's charge level.
  new Function(src('custom_components/casora/scripts/local/20-energie-fokus.js'))();
  const F = window._casoraEnergyFocus;
  const P = F.peers(h, {});
  assert.equal(P.battery.soc, 'sensor.energy_battery_soc', 'peers: SoC from the settings\' battery');
  assert.equal(F.peers(h, { energy_entity_1: 'sensor.energy_battery_soh', energy_popup_focus_1: 'battery' }).battery.soc,
    'sensor.energy_battery_soh', 'a sub-badge wins');
  // Without "individual devices": the automatic top list, as before (the distractors show up there).
  const ca = core.indexOf('// 07.10.2026: Größte Verbraucher');
  new Function(core.slice(ca, core.indexOf('// ── Performance mode', ca)))();
  await prefsLoad(h, FULL);
  assert.equal(window.casoraEnergyConsumers(h), null, 'no entries: null');
  const out3 = E.build({ hass: h, states: h.states, variables: { power_entities: FULL_IDS }, powerId: null });
  R = run(cardOf(out3, 'sources'));
  assert.ok(labels.indexOf('Top 5 Verbraucher') > -1, 'without entries: the automatic list');
  assert.ok(R.c.some((r) => r.entity === 'sensor.wallbox_bdc_rated_power'), 'automatic list: as before');
  current = null;
}

console.log('house_power: ok');
