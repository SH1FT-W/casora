// @deckt: custom_components/casora/scripts/local/48-energie-verlauf.js#sources,flows,flowRows,load,sec custom_components/casora/scripts/local/05-weich-mehr.js#build
// Issue #210: the house's energy popup shows, beside the power now, the kWh of the house, grid import, export and
// solar production over today / this week / this month, with the same range switch and the same statistics request
// as „Verbrauch je Gerät“. Only the rows the energy settings have; nothing without statistics.
import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const src = read('custom_components/casora/scripts/local/48-energie-verlauf.js');
new Function(src)();
const EV = window._casoraEnergyHistory;
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setImmediate(r)); };

// ── Meters from the settings ─────────────────────────────────────────────
const full = { energy_sources: [
  { type: 'grid', stat_energy_from: 'sensor.g_in', stat_energy_to: 'sensor.g_out' },
  { type: 'solar', stat_energy_from: 'sensor.pv1' }, { type: 'solar', stat_energy_from: 'sensor.pv2' },
  { type: 'gas', stat_energy_from: 'sensor.gas' }] };
assert.deepEqual(EV.sources(full), { house: { plus: ['sensor.g_in', 'sensor.pv1', 'sensor.pv2'], minus: ['sensor.g_out'] },
  imp: ['sensor.g_in'], exp: ['sensor.g_out'], solar: ['sensor.pv1', 'sensor.pv2'] }, 'grid in/out, every solar, the house; gas is no electricity');
assert.deepEqual(EV.sources({ energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 't1' }, { stat_energy_from: 't2' }], flow_to: [] }] }),
  { house: { plus: ['t1', 't2'], minus: [] }, imp: ['t1', 't2'], exp: [], solar: [] }, 'legacy grid with two tariffs, no export');
const solarOnly = EV.sources({ energy_sources: [{ type: 'solar', stat_energy_from: 'pv' }] });
assert.deepEqual(solarOnly, { house: null, imp: [], exp: [], solar: ['pv'] }, 'solar without a grid meter: no house');
assert.equal(EV.sources({ energy_sources: [{ type: 'gas', stat_energy_from: 'gas' }] }), null, 'no grid, no solar: nothing');
assert.equal(EV.sources(null), null);
assert.equal(EV.sources({}), null);

// ── Sums over the range ──────────────────────────────────────────────────
const now = new Date(2026, 10, 18, 15, 10).getTime(); // Wednesday 18 Nov 2026
Date.now = () => now; // Rendering and cache use the same clock as the fixtures.
const week = EV.plan('week', now, 1);
const d = (n) => new Date(2026, 10, n).getTime();
const rows = {
  'sensor.g_in': [{ start: d(16), change: 5 }, { start: d(17), change: 4 }, { start: d(18), change: 1.5 }, { start: d(15), change: 99 }],
  'sensor.g_out': [{ start: d(16), change: 2 }, { start: d(17), change: -7 }],
  'sensor.pv1': [{ start: d(16), change: 6 }, { start: new Date(d(17)).toISOString(), change: 3 }],
  'sensor.pv2': [{ start: d(18), change: 0.5 }, { start: d(18), change: null }],
};
const S = EV.sources(full);
const agg = EV.aggregate(rows, [], week, S.house);
const F = EV.flows(rows, S, week, agg);
assert.equal(F.imp, 10.5, 'import: this week only (Sunday before is last week)');
assert.equal(F.exp, 2, 'a negative change (meter reset) counts as 0');
assert.equal(F.solar, 9.5, 'every solar source, ISO and ms starts, a null change left out');
assert.equal(F.house, (5 - 2 + 6) + (4 + 3) + (1.5 + 0.5), 'house = import − export + solar per day');
assert.equal(F.house, agg.house.sum, 'the same house as the page „Verbrauch je Gerät“');
assert.equal(F.any, true);
// With devices reading more than the house that day the house follows them, as on the device page.
const dev = { 'sensor.washer': [{ start: d(18), change: 4 }] };
const agg2 = EV.aggregate(Object.assign({}, rows, dev), [{ id: 'sensor.washer', name: 'Washer' }], week, S.house);
assert.equal(EV.flows(rows, S, week, agg2).house, 9 + 7 + 4, 'never below the devices');
const none = EV.flows({}, S, week, EV.aggregate({}, [], week, S.house));
assert.deepEqual(none, { house: null, imp: null, exp: null, solar: null, any: false }, 'no statistics: nothing');
const day = EV.plan('day', now, 1), month = EV.plan('month', now, 1);
const hr = { 'sensor.g_in': [{ start: new Date(2026, 10, 18, 0).getTime(), change: 0.25 }, { start: new Date(2026, 10, 18, 14).getTime(), change: 0.5 }] };
assert.equal(EV.flows(hr, S, day, null).imp, 0.75, 'day: the hours of today');
assert.equal(EV.flows(rows, S, month, null).imp, 10.5 + 99, 'month: from the first');

// ── Rows ─────────────────────────────────────────────────────────────────
const R = EV.flowRows(F, S);
assert.deepEqual(R.map((r) => r.label), ['Hausverbrauch', 'Netzbezug', 'Einspeisung', 'Solarerzeugung']);
assert.deepEqual(R.map((r) => r.value.replace(/\u00a0/g, ' ')), ['18,0 kWh', '10,5 kWh', '2,0 kWh', '9,5 kWh'], 'values with a protected space');
assert.ok(R.every((r) => /^var\(--casora-/.test(r.iconTone) && /^mdi:/.test(r.icon)), 'tones from theme variables');
assert.deepEqual(EV.flowRows(null, S).map((r) => r.value), ['…', '…', '…', '…'], 'loading: the rows keep their place');
assert.deepEqual(EV.flowRows({ house: 0.4, imp: null }, { house: {}, imp: ['x'], exp: [], solar: [] }).map((r) => r.label + ' ' + r.value.replace(/\u00a0/g, ' ')),
  ['Hausverbrauch 400 Wh', 'Netzbezug —'], 'under 1 kWh in Wh; a meter without values „—“; no export or solar meter: no row');
assert.deepEqual(EV.flowRows({ solar: 3 }, solarOnly).map((r) => r.label), ['Solarerzeugung'], 'solar alone');

// ── Loading: sources ride in the device request; without devices too ────────
window.casoraChart = { nf: (v, dd) => v.toFixed(dd).replace('.', ','), hm: () => '15:00', uhr: (x) => x + ' Uhr', monLong: () => 'November' };
window.casoraEnergyPrefs = () => full;
const calls = [];
const hass = { states: {}, entities: {}, locale: { language: 'de', first_weekday: 'monday' },
  callWS: (m) => { calls.push(m); return Promise.resolve(rows); } };
const groups = [];
window._casoraUI = {
  esc: (x) => String(x),
  group: (list, label) => { groups.push({ list, label }); return '[' + label + ':' + list.map((r) => r.label + '=' + (r.value || '')).join(',') + ']'; },
  segments: (items) => items.map((i) => '<div class="hui-sg' + (i.active ? ' on' : '') + '">' + i.label + '</div>').join(''),
};
EV.setRange('week');
let html = EV.sec('flows', null, {}, hass, null);
assert.ok(html.indexOf('Hausverbrauch=…') > -1, 'loading rows');
assert.equal(calls.length, 1);
assert.deepEqual(calls[0].statistic_ids, ['sensor.g_in', 'sensor.pv1', 'sensor.pv2', 'sensor.g_out'], 'one request: house, grid and solar meters, each once');
assert.equal(calls[0].period, 'day');
await tick();
html = EV.sec('flows', null, {}, hass, null);
assert.ok(html.indexOf('[Energie · Diese Woche:') === 0, 'heading names the range: ' + html);
assert.ok(html.indexOf('Netzbezug=') > -1 && html.indexOf('Solarerzeugung=') > -1 && html.indexOf('Einspeisung=') > -1);
assert.ok(/data-casora-evr="day" class="hui-sg"/.test(html) && /data-casora-evr="week" class="hui-sg on"/.test(html)
  && /data-casora-evr="month"/.test(html), 'segment Tag / Woche / Monat on the shared range');
assert.equal(calls.length, 1, 'cached, not on every state');
// Switching the range asks for that range once; the device page reads the same answer.
EV.setRange('month');
EV.sec('flows', null, {}, hass, null);
assert.equal(calls.length, 2);
assert.equal(new Date(calls[1].start_time).getDate(), 1, 'month: from the first');
await tick();
assert.ok(EV.sec('flows', null, {}, hass, null).indexOf('Energie · November') > -1, 'month heading');
// No statistics at all: no section; no grid and no solar: none either.
const empty = { states: {}, entities: {}, locale: hass.locale, callWS: () => Promise.resolve({}) };
window.casoraEnergyPrefs = () => ({ energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.other_in' }] });
EV.sec('flows', null, {}, empty, null);
await tick();
assert.equal(EV.sec('flows', null, {}, empty, null), '', 'no statistics: no section');
window.casoraEnergyPrefs = () => ({ energy_sources: [] });
assert.equal(EV.sec('flows', null, {}, empty, null), '', 'no sources: no section');
// An error shows once instead of the rows.
const bad = { states: {}, entities: {}, locale: hass.locale, callWS: () => Promise.reject(new Error('x')) };
window.casoraEnergyPrefs = () => ({ energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.pv_err' }] });
EV.sec('flows', null, {}, bad, null);
await tick();
assert.ok(EV.sec('flows', null, {}, bad, null).indexOf('Statistik nicht abrufbar') > -1, 'error row');
// The device page still needs devices: the sources alone give no „Verbrauch je Gerät“ row.
window.casoraEnergyPrefs = () => full;
assert.equal(EV.sec('entry', null, {}, hass, null), '', 'no devices: no device row');

// ── Wiring ───────────────────────────────────────────────────────────────
const mehr = read('custom_components/casora/scripts/local/05-weich-mehr.js');
assert.ok(/_casoraEnergyHistory\.sec\("flows"/.test(mehr), 'section in the house energy popup');
assert.ok(/right: \['hist', 'use', 'top', 'flows'\]/.test(mehr) && /narrowOrder: \['stage', 'quick', 'top', 'use', 'flows', 'hist'\]/.test(mehr),
  'right column after „Verlauf“ (balance moves it under the stage, r457); on the phone before it');
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact;
['Hausverbrauch', 'Netzbezug', 'Einspeisung', 'Solarerzeugung', 'Energie', 'Statistik nicht abrufbar', 'Diese Woche'].forEach((k) => assert.ok(en[k], 'en: ' + k));
console.log('energy_flows: ok');
