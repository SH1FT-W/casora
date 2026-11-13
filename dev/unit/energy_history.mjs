// @deckt: custom_components/casora/scripts/local/48-energie-verlauf.js#devices,house,plan,aggregate,sorted,series,shares,average,view,load,fmt,sec custom_components/casora/scripts/casora-chart.js#_stack
// Consumption per device (energy popup › „Verbrauch je Gerät“): buckets of today / this week / this month, sums per
// device from HA's long-term statistics (included_in_stat counted once), top devices + „Sonstige“ (at most four
// series), shares adding up to 100, the average over whole buckets, highlighting one device, one cached request for
// all devices per range, and the row in the energy popup only with devices that have statistics.
import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const src = read('custom_components/casora/scripts/local/48-energie-verlauf.js');
new Function(src)();
const EV = window._casoraEnergyHistory;
const H = 36e5;

assert.equal(EV.range(), 'week', 'the page opens on the week (owner, 13.11.2026)');

// ── Buckets ──────────────────────────────────────────────────────────────
const now = new Date(2026, 10, 13, 14, 30).getTime(); // Friday 13 Nov 2026, 14:30
const day = EV.plan('day', now, 1);
assert.equal(day.per, 'hour');
assert.equal(day.starts.length, 24);
assert.equal(day.starts[0], new Date(2026, 10, 13).getTime());
assert.equal(day.cur, 14, 'the running hour is 14:00');
const week = EV.plan('week', now, 1);
assert.equal(week.per, 'day');
assert.equal(week.starts.length, 7);
assert.equal(new Date(week.starts[0]).getDay(), 1, 'week starts on Monday');
assert.equal(new Date(week.starts[0]).getDate(), 9);
assert.equal(week.cur, 4, 'Friday is the fifth day');
assert.equal(new Date(EV.plan('week', now, 0).starts[0]).getDate(), 8, 'first day Sunday');
const month = EV.plan('month', now, 1);
assert.equal(month.starts.length, 30, 'November has 30 days');
assert.equal(month.cur, 12);
assert.equal(EV.plan('month', new Date(2026, 1, 3).getTime(), 1).starts.length, 28);
// Clock change (Berlin, 25 Oct 2026): the day has 25 hours, 29 Mar 2026: 23.
assert.equal(EV.plan('day', new Date(2026, 9, 25, 12).getTime(), 1).starts.length, 25);
assert.equal(EV.plan('day', new Date(2026, 2, 29, 12).getTime(), 1).starts.length, 23);
assert.equal(EV.plan('nonsense', now, 1).range, 'day', 'unknown range: the day');

// ── Devices from the energy settings ─────────────────────────────────────
const hass = {
  states: {
    'sensor.washer_energy': { state: '10', attributes: { friendly_name: 'Washer Energy', unit_of_measurement: 'kWh' } },
    'sensor.grid_import': { state: '1', attributes: {} },
    'sensor.old_energy': { state: '1', attributes: {} },
  },
  entities: { 'sensor.old_energy': { disabled_by: 'user' } },
};
const prefs = {
  energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_import', flow_from: [{ stat_energy_from: 'sensor.legacy_grid' }] }],
  device_consumption: [
    { stat_consumption: 'sensor.washer_energy' },
    { stat_consumption: 'sensor.grid_import' },
    { stat_consumption: 'sensor.legacy_grid' },
    { stat_consumption: 'sensor.old_energy' },
    { stat_consumption: 'sensor.washer_energy', name: 'twice' },
    { stat_consumption: 'casora:external_meter', name: 'Heat pump' },
    { stat_consumption: 'sensor.plug_energy', name: 'Plug', included_in_stat: 'sensor.strip_energy' },
  ],
};
const devs = EV.devices(hass, prefs);
assert.deepEqual(devs.map((d) => d.id), ['sensor.washer_energy', 'casora:external_meter', 'sensor.plug_energy'],
  'no source meters, no disabled meter, no duplicate; external statistics stay');
assert.equal(devs[0].name, 'Washer', 'name without the energy word');
assert.equal(devs[1].name, 'Heat pump', 'name from the settings');
assert.equal(devs[2].parent, null, 'a parent that is not listed is no parent');
assert.deepEqual(EV.devices(hass, { device_consumption: [] }), []);
assert.deepEqual(EV.devices(hass, null), []);

// ── Sums ──────────────────────────────────────────────────────────────────
const at = (h) => new Date(2026, 10, 13, h).getTime();
const rows = {
  a: [{ start: at(0), change: 1 }, { start: at(1), change: 2 }, { start: new Date(at(2)).toISOString(), change: 0.5 }],
  b: [{ start: at(0), change: 0.5 }, { start: at(1), change: -3 }, { start: at(12), change: 1 }],
  c: [{ start: at(0) - H, change: 9 }, { start: day.end, change: 9 }],
  strip: [{ start: at(0), change: 2 }, { start: at(1), change: 1 }],
  plug: [{ start: at(0), change: 0.5 }, { start: at(1), change: 3 }],
};
const D = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'strip', name: 'Strip' }, { id: 'plug', name: 'Plug', parent: 'strip' }];
const ag = EV.aggregate(rows, D, day);
const by = Object.fromEntries(ag.devs.map((d) => [d.id, d]));
assert.equal(by.a.sum, 3.5, 'ISO and ms starts');
assert.equal(by.b.vals[1], 0, 'a negative change is no consumption');
assert.equal(by.b.sum, 1.5);
assert.equal(by.c.sum, null, 'rows outside the day are not counted');
assert.deepEqual(by.strip.vals.slice(0, 2), [1.5, 0], 'the parent keeps what its included device leaves (never below 0)');
assert.equal(by.plug.sum, 3.5);
assert.equal(ag.totals[0], 1 + 0.5 + 1.5 + 0.5, 'hour 0 total');
assert.equal(ag.totals[3], null, 'hour without values');
assert.equal(ag.total, 3.5 + 1.5 + 1.5 + 3.5);
assert.equal(ag.has, true);
assert.equal(EV.aggregate({}, D, day).has, false);

const mk = (sums) => ({ devs: sums.map((s, i) => ({ id: 'd' + i, name: 'D' + i, sum: s, vals: [s, null] })), totals: [], plan: day });

// ── The house and „Nicht erfasst“ (owner, 13.11.2026) ─────────────────────
assert.deepEqual(EV.house({ energy_sources: [
  { type: 'grid', stat_energy_from: 'g_in', stat_energy_to: 'g_out' },
  { type: 'solar', stat_energy_from: 'pv' },
  { type: 'battery', stat_energy_from: 'bat_out', stat_energy_to: 'bat_in' },
  { type: 'gas', stat_energy_from: 'gas' }] }), { plus: ['g_in', 'pv', 'bat_out'], minus: ['g_out', 'bat_in'] },
  'grid in − out + solar + battery out − in (HA\'s signs), gas is no electricity');
assert.deepEqual(EV.house({ energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 't1' }, { stat_energy_from: 't2' }], flow_to: [{ stat_energy_to: 'x' }] }] }),
  { plus: ['t1', 't2'], minus: ['x'] }, 'legacy grid format with two tariffs');
assert.equal(EV.house({ energy_sources: [{ type: 'solar', stat_energy_from: 'pv' }] }), null, 'no grid import: no house');
assert.equal(EV.house({ energy_sources: [{ type: 'grid', stat_energy_from: 'g' }, { type: 'battery', stat_energy_from: 'b' }] }), null,
  'a battery without its charge meter: the house would be short');
assert.equal(EV.house(null), null);
{
  const hRows = { a: [{ start: at(0), change: 1 }, { start: at(1), change: 2 }], g_in: [{ start: at(0), change: 2 }, { start: at(1), change: 1 }],
    g_out: [{ start: at(1), change: 0.5 }], pv: [{ start: at(1), change: 1 }] };
  const hA = EV.aggregate(hRows, [{ id: 'a', name: 'A' }], day, { plus: ['g_in', 'pv'], minus: ['g_out'] });
  assert.deepEqual(hA.house.vals.slice(0, 3), [2, 2, null], 'house per hour: 2; 1 − 0,5 + 1 = 1,5 but the device read 2; no row: none');
  assert.deepEqual(hA.untracked.vals.slice(0, 2), [1, 0], 'untracked = house − devices');
  assert.equal(hA.untracked.sum, 1);
  const hV = EV.view(hA, null);
  assert.equal(hV.total, 4, 'the big number is the house, never below the devices');
  assert.equal(hV.series[hV.series.length - 1].name, 'Nicht erfasst');
  assert.equal(hV.series[hV.series.length - 1].color, 'untracked');
  const ur = hV.rows[hV.rows.length - 1];
  assert.equal(ur.id, EV.UNTRACKED, '„Nicht erfasst“ is the last row');
  assert.equal(hV.rows.reduce((s2, r) => s2 + (r.pct || 0), 0), 100, 'shares of the house add up to 100');
  assert.equal(EV.view(hA, EV.UNTRACKED).total, 1, 'it can be highlighted like a device');
  assert.equal(EV.aggregate(hRows, [{ id: 'a', name: 'A' }], day, null).house, null, 'without the house as before');
  // More devices: three device series + „Nicht erfasst“, never five.
  const many = { devs: mk([5, 4, 3, 2, 1]).devs, totals: [], plan: day, house: { vals: [20, null], sum: 20 },
    untracked: { id: EV.UNTRACKED, name: 'Nicht erfasst', vals: [5, null], sum: 5 } };
  assert.deepEqual(EV.view(many, null).series.map((x) => x.name), ['D0', 'D1', 'Sonstige', 'Nicht erfasst']);
}
// Devices reading more than the house meter (owner, 13.11.2026): per bucket the house is the larger of its meter and the
// devices' sum, so the big number, the Ø line and the shares never fall below the devices.
{
  const gRows = { a: [{ start: at(0), change: 3 }, { start: at(1), change: 1 }, { start: at(2), change: 0.5 }],
    b: [{ start: at(0), change: 1 }], g_in: [{ start: at(0), change: 2 }, { start: at(1), change: 2 }] };
  const gA = EV.aggregate(gRows, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], day, { plus: ['g_in'], minus: [] });
  assert.deepEqual(gA.house.vals.slice(0, 4), [4, 2, 0.5, null], 'house = max(meter, devices); no meter row: the devices');
  assert.deepEqual(gA.untracked.vals.slice(0, 4), [0, 1, 0, null], 'untracked = house − devices');
  assert.equal(gA.house.sum, 6.5);
  const gV = EV.view(gA, null);
  assert.equal(gV.total, 6.5, 'the big number never below the devices');
  assert.ok(gV.total >= gA.total, 'house ≥ Σ devices');
  assert.equal(gV.avg, EV.average(gA.house.vals, day));
  assert.ok(gV.avg <= Math.max(...gA.house.vals.filter((v) => v != null)), 'Ø not below every bar');
  const byId = Object.fromEntries(gV.rows.map((r) => [r.id, r]));
  assert.equal(byId.a.pct + byId.b.pct + byId[EV.UNTRACKED].pct, 100);
  assert.ok(byId.a.raw <= 1 && byId.a.raw === 4.5 / 6.5, 'shares of the larger house');
  // Without any house meter row: as before (no house, no „Nicht erfasst“).
  assert.equal(EV.aggregate({ a: gRows.a }, [{ id: 'a', name: 'A' }], day, { plus: ['g_in'], minus: [] }).house, null);
}

// ── Top N and „Sonstige“ ─────────────────────────────────────────────────
let S = EV.series(mk([1, 5, 3]), 4);
assert.deepEqual(S.series.map((s) => s.name), ['D1', 'D2', 'D0'], 'up to four: every device, largest first');
assert.deepEqual(S.series.map((s) => s.color), ['c1', 'c2', 'c3']);
S = EV.series(mk([1, 5, 3, 2]), 4);
assert.equal(S.series.length, 4, 'four devices: four series, no „Sonstige“');
assert.equal(S.series[3].color, 'c4');
S = EV.series(mk([1, 5, 3, 2, 4, 0.5]), 4);
assert.deepEqual(S.series.map((s) => s.name), ['D1', 'D4', 'D2', 'Sonstige'], 'more: the largest three and „Sonstige“');
assert.equal(S.series[3].color, 'other');
assert.equal(S.series[3].sum, 2 + 1 + 0.5);
assert.deepEqual(S.series[3].vals, [3.5, null], '„Sonstige“ sums its devices per bucket');
assert.equal(S.ofId.d5, 3);
S = EV.series(mk([1, 5, 3, 2, 4]), 4);
assert.deepEqual(S.series.map((s) => s.name), ['D1', 'D4', 'D2', 'D3', 'D0'].slice(0, 3).concat(['Sonstige']));
S = EV.series(mk([1, 5, null, 2, 4]), 4);
assert.deepEqual(S.series.map((s) => s.name), ['D1', 'D4', 'D3', 'D0'], 'a device without values is no series');
S = EV.series({ devs: [...mk([5, 4, 3]).devs, { id: 'x', name: 'X', sum: 1, vals: [1, null] }, { id: 'y', name: 'Y', sum: 0.5, vals: [0.5, null] }] }, 4);
assert.equal(S.series[3].name, 'Sonstige');

// ── Shares and average ───────────────────────────────────────────────────
assert.deepEqual(EV.shares([1, 1, 1]), [34, 33, 33], 'whole percentages adding up to 100');
assert.deepEqual(EV.shares([2, 1, 1]), [50, 25, 25]);
assert.deepEqual(EV.shares([0, 0]), [0, 0]);
assert.equal(EV.shares([1000, 1, 1]).reduce((a, x) => a + x, 0), 100);
assert.equal(EV.average([2, null, 4, 9], { cur: 3 }), 3, 'whole buckets before the running one, gaps left out');
assert.equal(EV.average([5], { cur: 0 }), null, 'only the running bucket: no average');
assert.equal(EV.average([1, 2], { cur: 5 }), 1.5);

// ── The view: highlighting one device ────────────────────────────────────
const V = EV.view(ag, null);
assert.equal(V.focus, null);
assert.equal(V.total, ag.total);
assert.equal(V.rows[0].id, 'a', 'rows by sum');
assert.equal(V.rows.filter((r) => r.pct != null).reduce((s, r) => s + r.pct, 0), 100);
assert.equal(V.rows.find((r) => r.id === 'c').pct, null, 'no values: no share');
assert.equal(V.series.length, 4, 'four devices with values: four series');
const F = EV.view(ag, 'b');
assert.equal(F.focus, 'b');
assert.equal(F.total, 1.5, 'the highlighted device\'s sum');
assert.equal(F.series.length, 1, 'alone in the chart');
assert.deepEqual(F.series[0].vals, by.b.vals);
assert.equal(F.rows.find((r) => r.id === 'b').selected, true);
assert.equal(F.avg, EV.average(by.b.vals, day));
assert.equal(EV.view(ag, 'c').focus, null, 'a device without values cannot be highlighted');
// Toggle: a second tap shows all again.
EV.toggle('b'); assert.equal(EV.focus(), 'b'); EV.toggle('b'); assert.equal(EV.focus(), null);
EV.setRange('week'); assert.equal(EV.range(), 'week'); EV.setRange('year'); assert.equal(EV.range(), 'week'); EV.setRange('day');

// ── Format ───────────────────────────────────────────────────────────────
assert.deepEqual(EV.fmt(0.42), { n: '420', u: 'Wh' }, 'under 1 kWh in Wh');
assert.deepEqual(EV.fmt(null), { n: '—', u: '' });
assert.equal(EV.fmt(12.34).u, 'kWh');

// ── Loading: one request for all devices per range, cached, not on every state ──
let calls = [];
const h2 = {
  states: { 'sensor.washer_energy': { state: '1', attributes: { friendly_name: 'Washer Energy' } } }, entities: {},
  locale: { language: 'de', first_weekday: 'monday' },
  callWS: (m) => { calls.push(m); return Promise.resolve({ 'sensor.washer_energy': [{ start: new Date().setHours(0, 0, 0, 0), change: 1.2 }] }); },
};
window.casoraEnergyPrefs = () => ({ energy_sources: [], device_consumption: [{ stat_consumption: 'sensor.washer_energy' }] });
assert.equal(EV.load(h2, 'day'), 'wait');
assert.equal(EV.load(h2, 'day'), 'wait', 'second ask while busy: no second request');
assert.equal(calls.length, 1);
assert.equal(calls[0].type, 'recorder/statistics_during_period');
assert.deepEqual(calls[0].statistic_ids, ['sensor.washer_energy']);
assert.equal(calls[0].period, 'hour');
assert.deepEqual(calls[0].types, ['change']);
assert.deepEqual(calls[0].units, { energy: 'kWh' });
await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setImmediate(r));
const got = EV.load(h2, 'day');
assert.equal(got.total, 1.2);
assert.equal(calls.length, 1, 'cached');
EV.load(h2, 'month');
assert.equal(calls.length, 2);
assert.equal(calls[1].period, 'day');
// With the house in the settings its meters ride in the same request.
window.casoraEnergyPrefs = () => ({ energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in', stat_energy_to: 'sensor.grid_out' }],
  device_consumption: [{ stat_consumption: 'sensor.washer_energy' }] });
EV.load(h2, 'week');
assert.deepEqual(calls[2].statistic_ids, ['sensor.washer_energy', 'sensor.grid_in', 'sensor.grid_out'], 'one request: devices and house');

// ── Entry row: only with devices that have statistics ────────────────────
window._casoraUI = { group: (rows, label) => label + ':' + rows.map((r) => r.label + '|' + r.sub + '|' + r.page).join(',') };
assert.equal(EV.sec('entry', null, h2.states, h2, null), 'Verlauf:Verbrauch je Gerät|1 Gerät|energy-history');
const h3 = Object.assign({}, h2, { states: {}, callWS: () => Promise.resolve({}) });
window.casoraEnergyPrefs = () => ({ energy_sources: [], device_consumption: [{ stat_consumption: 'sensor.other' }] });
EV.load(h3, 'day');
await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setImmediate(r));
assert.equal(EV.sec('entry', null, {}, h3, null), '', 'no statistics: no row');
window.casoraEnergyPrefs = () => ({ energy_sources: [], device_consumption: [] });
assert.equal(EV.sec('entry', null, {}, h3, null), '', 'no devices: no row');

// ── Wiring ───────────────────────────────────────────────────────────────
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'48-energie-verlauf'"), 'module in MODULES');
const mehr = read('custom_components/casora/scripts/local/05-weich-mehr.js');
assert.ok(/_casoraEnergyHistory\.sec\("entry"/.test(mehr) && /right: \['use', 'top', 'hist'\]/.test(mehr), 'row in the house energy popup');
const chart = read('custom_components/casora/scripts/casora-chart.js');
assert.ok(/c\.kind === 'stack'\) return this\._stack\(box, W\)/.test(chart), 'casora-chart draws stacks');
// „Nicht erfasst“'s legend dot as a ring (owner, 13.11.2026): visible on a dark popup too, still the palest.
assert.ok(/dot: s\.color === 'untracked' \? 'ring'/.test(src) && /x\.dot === 'ring' \? 'background:var\(--cgrid\);box-shadow:inset/.test(chart), 'untracked legend dot is a ring');
assert.ok(!/#[0-9A-Fa-f]{6}/.test(src.replace(/var\(--[^)]*\)/g, '')), 'colours only from theme variables');
assert.ok(/eyebrow: T\('Energie'\)/.test(src) && /eyebrow: T\('Energie'\)/.test(mehr), 'energy pages carry „Energie“ in the language, not the tile name');
console.log('energy_history: ok');
