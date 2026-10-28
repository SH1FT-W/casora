// #91: the battery's charge level in the energy flow and on the energy popup's hero, also when the tile has no
// SoC field (05-weich-mehr.js E.flowSources, 00-finder.js casoraEnergyBatterySoc).
//   node dev/unit/energy_battery_soc.mjs
// Expected: the SoC sensor found for a tile battery field, for charge/discharge sensors (also named
// "…_charging_power" with the SoC as "…_level"), never a health or limit sensor; a SoC field of the tile stays
// first; the hero's sub line says "Akku N %". All IDs made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
new Function(src('05-weich-mehr.js'))();
const E = window._casoraSoftEnergy;

const st = (v, unit, dc) => ({ state: String(v), attributes: { unit_of_measurement: unit, device_class: dc } });
const states = {
  'sensor.haus_power': st(442, 'W', 'power'), 'sensor.pv_power': st(526, 'W', 'power'),
  // A tile battery field (positive while charging) with its SoC by id stem, next to a health sensor.
  'sensor.speicher_power': st(74, 'W', 'power'), 'sensor.speicher_ladestand': st(5, '%', 'battery'),
  'sensor.speicher_health': st(98, '%', null),
  // Anker-like charge/discharge sensors without a separator before the power word.
  'sensor.box_aufladeleistung': st(74, 'W', 'power'), 'sensor.box_entladeleistung': st(0, 'W', 'power'),
  'sensor.box_ladestand': st(37, '%', 'battery'), 'sensor.box_soc_minimum': st(5, '%', null),
  // Inverter template sensors: charging/discharging power, SoC as "battery_level", plus health and max SoC.
  'sensor.battery_charging_power': st(0, 'W', 'power'), 'sensor.battery_discharging_power': st(310, 'W', 'power'),
  'sensor.battery_level': st(81, '%', 'battery'), 'sensor.battery_state_of_health': st(99, '%', null),
  'sensor.battery_max_soc': st(100, '%', null),
  'sensor.tile_soc': st(55, '%', 'battery'),
};
const hass = { states, entities: {} };
const ids = Object.keys(states);
for (const id of ids) hass.entities[id] = { entity_id: id };

// The finder itself.
const soc = (id) => window.casoraEnergyBatterySoc(hass, id);
assert.equal(soc('sensor.speicher_power'), 'sensor.speicher_ladestand', 'tile battery: SoC by stem, not health');
assert.equal(soc('sensor.box_aufladeleistung'), 'sensor.box_ladestand', 'charge sensor: SoC, not the minimum');
assert.equal(soc('sensor.box_entladeleistung'), 'sensor.box_ladestand', 'discharge sensor: the same SoC');
assert.equal(soc('sensor.battery_charging_power'), 'sensor.battery_level', 'charging power: without the direction word');
assert.equal(soc('sensor.battery_discharging_power'), 'sensor.battery_level');
assert.equal(soc('sensor.pv_power'), null, 'solar has no SoC');

// The flow: tile battery field (entity_battery_power) without entity_battery_soc.
const C0 = { home: 'sensor.haus_power', solar: 'sensor.pv_power' };
let F = E.flowSources({ ...C0, battery: 'sensor.speicher_power' }, hass, states, false);
assert.deepEqual([F.batTile, F.soc], ['sensor.speicher_power', 'sensor.speicher_ladestand'], 'tile field: SoC found');
assert.ok(E.flowSources.ids(F).includes('sensor.speicher_ladestand'), 'the SoC sensor is watched');
let v = E.flowValues(F, states);
assert.deepEqual([v.chg, v.soc], [74, 5]);
let m = E.flowE1Model(v);
assert.deepEqual([m.nodes.battery.soc, m.nodes.battery.w, m.nodes.battery.label], [5, 74, 'Akku lädt'], 'circle: 5 % over 74 W');
// Charge/discharge sensors (auto-detected Anker or the tile's fields).
F = E.flowSources({ ...C0, charge: 'sensor.box_aufladeleistung', discharge: 'sensor.box_entladeleistung' }, hass, states, false);
assert.equal(F.soc, 'sensor.box_ladestand', 'charge/discharge: SoC found');
F = E.flowSources({ ...C0, charge: 'sensor.battery_charging_power', discharge: 'sensor.battery_discharging_power' }, hass, states, false);
assert.equal(F.soc, 'sensor.battery_level', 'inverter: battery_level');
// The tile's SoC field stays first.
F = E.flowSources({ ...C0, battery: 'sensor.speicher_power', soc: 'sensor.tile_soc' }, hass, states, false);
assert.equal(F.soc, 'sensor.tile_soc', 'SoC field first');
// Without a battery: no SoC and no battery circle.
F = E.flowSources(C0, hass, states, false);
assert.ok(!F.soc && !F.has.battery, 'no battery, no SoC');

// The hero's sub line.
window._casoraUI = { hero: (o) => JSON.stringify(o), esc: (s) => String(s) };
const hero = (fs) => JSON.parse(E.sec('hero', { home: 'sensor.haus_power', solar: 'sensor.pv_power', flowSrc: fs }, states, hass));
const fsBat = E.flowSources({ ...C0, battery: 'sensor.speicher_power' }, hass, states, false);
assert.equal(hero(fsBat).sub, 'Akku 5 %', 'hero: Akku 5 %');
assert.equal(hero(E.flowSources(C0, hass, states, false)).sub, null, 'no battery: no SoC on the hero');
states['sensor.speicher_ladestand'] = st('unavailable', '%', 'battery');
assert.equal(hero(fsBat).sub, null, 'SoC without a value: nothing');

console.log('energy_battery_soc: ok');
