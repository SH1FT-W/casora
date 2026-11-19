// @deckt: custom_components/casora/scripts/local/50-smart-meter.js custom_components/casora/scripts/local/00-finder.js#casoraSmartMeterFind
// Smart meter (community card, card request 208): which sensors the card takes (daily counters of electricity and gas,
// their costs, standing charge and total – not rates, yesterday's, the supplier's second cost or running totals), the
// tile's text, and the totals of a day, a week and a month from the long-term statistics of daily counters (a day = its
// last state, a standing charge counts every day, a running meter counts its change, today from the sensors).
//   node dev/unit/smart_meter.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
window.casoraLocale = () => 'en-GB';
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
new Function(read('custom_components/casora/scripts/local/48-energie-verlauf.js'))();
new Function(read('custom_components/casora/scripts/local/50-smart-meter.js'))();
const F = window.casoraSmartMeterFind, SM = window._casoraSmartMeter;

// ── Finding the sensors ──────────────────────────────────────────────────
const sensor = (name, dc, unit, sc, state = '1') => ({ state, attributes: { friendly_name: name, device_class: dc, unit_of_measurement: unit, ...(sc ? { state_class: sc } : {}) } });
const house = (platform, list) => {
  const states = {}, entities = {};
  Object.entries(list).forEach(([id, s]) => { states[id] = s; entities[id] = { entity_id: id, platform }; });
  return { states, entities, devices: {} };
};
// Like the issue's meter (names made up): daily counters plus the supplier's cost and the unit rate as decoys.
const glow = house('hildebrand_glow', {
  'sensor.meter_a_1': sensor('Meter Electricity Consumption', 'energy', 'kWh', 'total_increasing', '4.1'),
  'sensor.meter_a_2': sensor('Meter Electricity Daily Cost', 'monetary', 'GBP', 'total', '1.20'),
  'sensor.meter_a_3': sensor('Meter Electricity Cost (API)', 'monetary', 'GBP', 'total', '1.35'),
  'sensor.meter_a_4': sensor('Meter Gas Consumption', 'energy', 'kWh', 'total_increasing', '9.8'),
  'sensor.meter_a_5': sensor('Meter Gas Daily Cost', 'monetary', 'GBP', 'total', '0.61'),
  'sensor.meter_a_6': sensor('Meter Gas Cost (API)', 'monetary', 'GBP', 'total', '0.70'),
  'sensor.meter_a_7': sensor('Meter Total Daily Energy Cost', 'monetary', 'GBP', 'total', '2.65'),
  'sensor.meter_a_8': sensor('Meter Daily Standing Charges', 'monetary', 'GBP', 'total', '0.84'),
  'sensor.meter_a_9': sensor('Meter Electricity Unit Rate', 'monetary', 'GBP/kWh', 'measurement', '0.245'),
  'sensor.meter_a_10': sensor('Meter Electricity Consumption Yesterday', 'energy', 'kWh', 'total', '7'),
  'sensor.meter_a_11': sensor('Meter Electricity Power', 'power', 'W', 'measurement', '300'),
  'sensor.meter_a_12': sensor('Meter Gas Cost Without Class', 'monetary', 'GBP', null, '1'),
});
let all = F.all(glow);
assert.equal(all.length, 1, 'one meter');
let mt = all[0];
assert.equal(mt.elecUse, 'sensor.meter_a_1');
assert.equal(mt.elecCost, 'sensor.meter_a_2', 'the daily cost, not the supplier cost without a day word');
assert.equal(mt.gasUse, 'sensor.meter_a_4');
assert.equal(mt.gasCost, 'sensor.meter_a_5');
assert.equal(mt.total, 'sensor.meter_a_7');
assert.equal(mt.standing, 'sensor.meter_a_8');
assert.equal(mt.anchor, 'sensor.meter_a_7', 'the tile sits on the total cost');
assert.equal(F.kind(glow, 'sensor.meter_a_9'), null, 'a rate (GBP/kWh) is no counter');
assert.equal(F.kind(glow, 'sensor.meter_a_10'), null, "yesterday's is no counter of today");
assert.equal(F.kind(glow, 'sensor.meter_a_12'), null, 'without a state_class there are no statistics');
assert.equal(F.of(glow, 'sensor.meter_a_5'), mt);
assert.equal(F.field(glow, 'sensor.meter_a_7', 'gas_cost_entity'), 'sensor.meter_a_5', 'Studio hint for a field');
assert.ok(F.present(glow));

// Octopus Energy-like names: today's accumulative counters; its standing charge is a rate (the day cost holds it);
// the running total and gas in m³ beside kWh are not taken.
const oct = house('octopus_energy', {
  'sensor.oe_1': sensor('Electricity Current Accumulative Consumption', 'energy', 'kWh', 'total', '3'),
  'sensor.oe_2': sensor('Electricity Current Accumulative Cost', 'monetary', 'GBP', 'total', '1'),
  'sensor.oe_3': sensor('Electricity Current Total Consumption', 'energy', 'kWh', 'total_increasing', '4500'),
  'sensor.oe_4': sensor('Electricity Current Standing Charge', 'monetary', 'GBP', 'total', '0.5'),
  'sensor.oe_5': sensor('Gas Current Accumulative Consumption', 'gas', 'm³', 'total', '1'),
  'sensor.oe_6': sensor('Gas Current Accumulative Consumption (kWh)', 'energy', 'kWh', 'total', '11'),
  'sensor.oe_7': sensor('Gas Previous Accumulative Cost', 'monetary', 'GBP', 'total', '1'),
  'sensor.oe_8': sensor('Electricity Export Current Accumulative Consumption', 'energy', 'kWh', 'total', '1'),
});
mt = F.all(oct)[0];
assert.equal(mt.elecUse, 'sensor.oe_1', 'not the running total');
assert.equal(mt.elecCost, 'sensor.oe_2');
assert.equal(mt.standing, null, "Octopus: the day cost holds the standing charge");
assert.equal(mt.gasUse, 'sensor.oe_6', 'gas in kWh before m³');
assert.equal(mt.gasCost, null, "yesterday's gas cost is not today's");

// German names on a template sensor; a plain plug energy meter is no smart meter.
const de = house('template', {
  'sensor.t1': sensor('Stromverbrauch heute', 'energy', 'kWh', 'total_increasing'),
  'sensor.t2': sensor('Gaskosten heute', 'monetary', 'EUR', 'total'),
});
mt = F.all(de)[0];
assert.equal(mt.elecUse, 'sensor.t1');
assert.equal(mt.gasCost, 'sensor.t2');
assert.equal(F.all(house('shelly', { 'sensor.p': sensor('Plug Energy', 'energy', 'kWh', 'total_increasing') })).length, 0);
assert.equal(F.all(house('shelly', { 'sensor.p': sensor('Strom Zähler', 'energy', 'kWh', 'total_increasing') })).length, 0,
  'an electricity meter without a cost or a day word is not offered');

// ── The card's model and the tile ─────────────────────────────────────────
let m = SM.model(glow, 'sensor.meter_a_7', {});
assert.deepEqual(m.ids.length, 6);
assert.equal(m.cur, 'GBP');
// A Studio field wins; a field naming a missing sensor leaves the slot empty.
assert.equal(SM.model(glow, 'sensor.meter_a_7', { elec_cost_entity: 'sensor.meter_a_3' }).slots.elecCost, 'sensor.meter_a_3');
assert.equal(SM.model(glow, 'sensor.meter_a_7', { gas_cost_entity: 'sensor.gone' }).slots.gasCost, null);
const st = glow.states['sensor.meter_a_7'];
st.entity_id = 'sensor.meter_a_7';
assert.equal(SM.tileState(st, glow, {}), 'Strom £1.20 · Gas £0.61');
assert.equal(SM.tileShort(st, glow, {}), 'heute £2.65', 'electricity + gas + standing charge');
assert.equal(SM.tileState(st, glow, { tile_value: 'usage' }), 'Strom 4.1 kWh · Gas 9.8 kWh');
assert.equal(SM.tileShort(st, glow, { tile_value: 'usage' }), 'heute 13.9 kWh');
const dead = JSON.parse(JSON.stringify(glow));
Object.values(dead.states).forEach((s) => { s.state = 'unavailable'; });
const ds = Object.assign({ entity_id: 'sensor.meter_a_7' }, dead.states['sensor.meter_a_7']);
assert.equal(SM.tileState(ds, dead, {}), 'Nicht verfügbar');
assert.equal(SM.tileShort(ds, dead, {}), '');
assert.equal(SM.money(1.2, 'EUR').replace(/\s/g, ' '), '€1.20');
assert.equal(SM.money(1.2, 'Kr'), '1.20 Kr', 'a unit that is no ISO code after the number');
assert.equal(SM.symbol('GBP'), '£');
assert.equal(SM.kwh(1500, 'Wh'), 1.5);

// ── Week and month from the statistics ────────────────────────────────────
const now = new Date(2026, 10, 19, 14, 30).getTime(); // Thursday 19 Nov 2026, 14:30
const day = (d) => new Date(2026, 10, d).getTime();
const week = window._casoraEnergyHistory.plan('week', now, 1); // Mon 16 … Sun 22, today index 3
assert.equal(week.cur, 3);
// Daily counters: a day's row carries the day's last state (resets at midnight); change is the rise (0 on the
// constant standing charge). Today's row is ignored – today comes from the sensors.
const rows = {
  'sensor.meter_a_1': [{ start: day(16), state: 8, change: 8 }, { start: day(17), state: 6, change: 6 }, { start: day(18), state: 9, change: 9 }, { start: day(19), state: 3, change: 3 }],
  'sensor.meter_a_2': [{ start: day(16), state: 2, change: 2 }, { start: day(17), state: 1.5, change: 1.5 }, { start: day(18), state: 2.2, change: 2.2 }],
  'sensor.meter_a_8': [{ start: day(16), state: 0.84, change: 0 }, { start: day(17), state: 0.84, change: 0 }, { start: day(18), state: 0.84, change: 0 }],
  // gas: a running meter (never resets) – its change counts.
  'sensor.meter_a_4': [{ start: day(16), state: 1000, change: 10 }, { start: day(17), state: 1012, change: 12 }, { start: day(18), state: 1020, change: 8 }, { start: day(19), state: 1025, change: 5 }],
};
assert.equal(SM.mode(rows['sensor.meter_a_1']), 'daily');
assert.equal(SM.mode(rows['sensor.meter_a_8']), 'daily', 'a constant standing charge is a daily counter');
assert.equal(SM.mode(rows['sensor.meter_a_4']), 'total');
assert.equal(SM.mode([{ state: 5, change: 5 }, { state: 7, change: 7 }]), 'daily', 'two rising days are still a daily counter');
const live = SM.live(glow, m);
let agg = SM.aggregate(rows, m, week, live);
assert.deepEqual(agg.vals['sensor.meter_a_1'], undefined);
assert.deepEqual(agg.vals.elecUse, [8, 6, 9, 4.1, null, null, null], 'past days from the state, today live');
assert.deepEqual(agg.vals.standing, [0.84, 0.84, 0.84, 0.84, null, null, null], 'the standing charge every day');
assert.deepEqual(agg.vals.gasUse, [10, 12, 8, 5, null, null, null], 'running meter: change, also today');
assert.equal(+agg.sums.elecUse.toFixed(2), 27.1);
assert.equal(+agg.sums.elecCost.toFixed(2), 6.9);
assert.equal(+agg.sums.standing.toFixed(2), 3.36);
assert.ok(agg.has);
let v = SM.view(agg, m, 'cost');
assert.deepEqual(v.series.map((s) => s.key), ['elecCost', 'gasCost', 'standing']);
assert.equal(v.unit, '£');
// elec 6.9 + gas (today only: 0.61) + standing 3.36
assert.equal(+v.total.toFixed(2), 10.87);
assert.equal(+v.avg.toFixed(3), +((2.84 + 2.34 + 3.04) / 3).toFixed(3), 'average over the whole days before today');
v = SM.view(agg, m, 'use');
assert.deepEqual(v.series.map((s) => s.key), ['elecUse', 'gasUse']);
assert.equal(+v.total.toFixed(2), 27.1 + 35);

// Month: same rows, the buckets of November; days without a row stay empty.
const month = window._casoraEnergyHistory.plan('month', now, 1);
agg = SM.aggregate(rows, m, month, live);
assert.equal(agg.vals.elecUse.length, 30);
assert.equal(agg.vals.elecUse[0], null);
assert.equal(agg.vals.elecUse[18], 4.1);
assert.equal(+agg.sums.elecUse.toFixed(2), 27.1);

// Day: hours from the change per hour (a fall at midnight is no use); the totals are today's values themselves.
const dplan = window._casoraEnergyHistory.plan('day', now, 1);
const hour = (h) => new Date(2026, 10, 19, h).getTime();
agg = SM.aggregate({ 'sensor.meter_a_1': [{ start: hour(0), change: -9 }, { start: hour(7), change: 0.8 }, { start: hour(8), change: 0.5 }] }, m, dplan, live);
assert.equal(agg.vals.elecUse[0], 0);
assert.equal(agg.vals.elecUse[7], 0.8);
assert.equal(agg.sums.elecUse, 4.1);
assert.equal(agg.sums.standing, 0.84);
v = SM.view(agg, m, 'cost');
assert.ok(!v.series.some((s) => s.key === 'standing'), 'the standing charge has no hours');
assert.equal(+v.total.toFixed(2), 2.65, "today's cost includes the standing charge");

// Only a total cost sensor: it is the cost.
const only = house('hildebrand_glow', { 'sensor.x': sensor('Total Daily Energy Cost', 'monetary', 'GBP', 'total', '3') });
const mo = SM.model(only, 'sensor.x', {});
assert.deepEqual(SM.view(SM.aggregate({}, mo, week, SM.live(only, mo)), mo, 'cost').series.map((s) => s.key), ['total']);

// ── Wiring: module loaded, templates, Studio type ─────────────────────────
assert.match(read('custom_components/casora/scripts/casora-local.js'), /'50-smart-meter'/);
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
assert.deepEqual(tpl.casora_smart_meter.template, ['casora_entity', 'casora_popup_smart_meter']);
assert.equal(tpl.casora_popup_smart_meter.tap_action.casora_popup.variant, 'v3');
const built = JSON.parse(read('custom_components/casora/panel/casora-templates.json'));
assert.ok((built.templates || built).casora_smart_meter, 'templates built');
const types = read('custom_components/casora/panel/casora-panel-types.js');
assert.match(types, /id: "casora_smart_meter", label: "Smart meter"/);
assert.match(read('custom_components/casora/panel/casora-panel.js'), /casora_smart_meter: \{ anchors:/);
console.log('smart_meter: ok');
