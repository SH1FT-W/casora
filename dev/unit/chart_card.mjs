// Chart card (community card #50, 27-chart.js) without HA: kind of a sensor, value with unit, series from the
// Studio fields, shape (automatic / line / bars) and chart config per range incl. the year, statistics mapping
// (recorder/statistics_during_period, hour / day / month), loading and empty states, range and shape switch,
// Studio fields. All devices and names made up.  node dev/unit/chart_card.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = process.env.TZ || 'Europe/Berlin';
globalThis.window = globalThis;
const clicks = [];
globalThis.document = { querySelector: () => null, addEventListener: (type, fn) => { if (type === 'click') clicks.push(fn); } };
globalThis.addEventListener = () => {};
window.casoraLocale = () => 'de-DE';
window.casoraTr = (s) => s;
const kicked = [];
window.casoraKick = (el) => kicked.push(el);
const shown = [];
window._hpPlantShow = (key) => { shown.push(key); return true; };
window._hpPlantCfg = {};
window._hpPlantMeta = {};
window._hpChartInit = (key) => { shown.push('init:' + key); };
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('27-chart.js');
const M = window._casoraChartCard;
assert.ok(M, 'module loaded');

// A home server like System Monitor (no device class on the CPU sensor), a temperature, an energy counter, a text sensor.
const states = {}, entities = {};
const add = (id, state, attrs, reg) => {
  states[id] = { entity_id: id, state, attributes: Object.assign({ friendly_name: id.split('.')[1].replace(/_/g, ' ') }, attrs || {}) };
  entities[id] = Object.assign({ entity_id: id, platform: 'systemmonitor' }, reg || {});
};
add('sensor.heimserver_cpu', '23', { state_class: 'measurement', unit_of_measurement: '%' }, { translation_key: 'processor_use' });
add('sensor.heimserver_ram', '61.4', { state_class: 'measurement', unit_of_measurement: '%' }, { translation_key: 'memory_use_percent' });
add('sensor.heimserver_temp', '48.5', { state_class: 'measurement', unit_of_measurement: '°C', device_class: 'temperature' });
add('sensor.zaehler_energie', '1234.567', { state_class: 'total_increasing', unit_of_measurement: 'kWh', device_class: 'energy' });
add('sensor.heimserver_start', '2026-10-20T06:00:00+00:00', { device_class: 'timestamp' });
add('sensor.heimserver_weg', 'unavailable', { state_class: 'measurement', unit_of_measurement: '%' });
add('sensor.pumpe_strom', '0.004', { state_class: 'measurement', unit_of_measurement: 'A', device_class: 'current' });
add('sensor.luft_ppm', '42', { unit_of_measurement: 'ppm' });
let calls = [];
let answer = null;
const hass = { states, entities, callWS: (msg) => { calls.push(msg); return answer ? Promise.resolve(answer) : Promise.reject(new Error('no')); } };
const CPU = 'sensor.heimserver_cpu';

// Kind and value.
assert.equal(M.kind(states[CPU]), 'measurement');
assert.equal(M.kind(states['sensor.zaehler_energie']), 'total');
assert.equal(M.kind(states['sensor.heimserver_start']), null, 'a timestamp is no chart');
assert.equal(M.kind(null), null);
assert.equal(M.kind({ state: '42', attributes: { unit_of_measurement: 'ppm' } }), 'measurement', 'number with unit, no state class');
assert.equal(M.value(states[CPU], hass), '23 %');
assert.equal(M.value(states['sensor.heimserver_ram'], hass), '61,4 %', 'one decimal below 100, German comma');
assert.equal(M.value(states['sensor.zaehler_energie'], hass), '1.235 kWh', 'no decimals from 100 on, thousands separator');
assert.equal(M.value(states['sensor.heimserver_weg'], hass), 'Nicht verfügbar');
assert.equal(M.value({ entity_id: 'sensor.x', state: 'unknown', attributes: {} }, hass), 'Unbekannt');
assert.equal(M.value(null, hass), 'Nicht verfügbar');
assert.equal(M.value(states['sensor.heimserver_start'], hass), '2026-10-20T06:00:00+00:00', 'text stays text');
// Small values keep up to three decimals when the state has them: "0.004 A" must not read "0 A".
assert.equal(M.value(states['sensor.pumpe_strom'], hass), '0,004 A');
assert.equal(M.fmt(hass, 'sensor.pumpe_strom', 0.0043), '0,004 A', 'derived value of a small sensor');
assert.equal(M.fmt(hass, 'sensor.pumpe_strom', 0.5), '0,5 A', 'from 0.1 on two decimals at most');
assert.equal(M.fmt(hass, 'sensor.zaehler_energie', 0.05), '0,05 kWh', 'three decimals only when the state has them');
console.log('ok kind/value');

// Series: main first, entity_2…4 with label and colour, duplicates and missing entities dropped, default colour steps.
let S = M.series(states[CPU], {}, hass);
assert.deepEqual(S, [{ entity: CPU, name: 'heimserver cpu', color: 'c1', unit: '%' }]);
S = M.series(states[CPU], { entity_2: 'sensor.heimserver_ram', label_2: 'RAM', color_2: 'var(--casora-color-green, #30D158)',
  entity_3: 'sensor.fehlt', entity_4: CPU, chart_color: '#4A7DBA' }, hass);
assert.deepEqual(S.map((s) => [s.entity, s.name, s.color]), [[CPU, 'heimserver cpu', '#4A7DBA'], ['sensor.heimserver_ram', 'RAM', 'var(--casora-color-green, #30D158)']]);
assert.ok(M.sameUnit(S));
const mixed = M.series(states[CPU], { entity_2: 'sensor.heimserver_temp', entity_3: 'sensor.heimserver_ram' }, hass);
assert.deepEqual(mixed.map((s) => s.color), ['c1', 'c2', 'c3'], 'colour steps by position');
assert.ok(!M.sameUnit(mixed));
assert.equal(M.tone('c2'), 'var(--casora-chart-c2, #C8743A)');
assert.equal(M.tone('#123456'), '#123456');
console.log('ok series');

// Shape: automatic = bars for counters (total / total_increasing), a line for readings.
assert.equal(M.autoShape('total'), 'bar');
assert.equal(M.autoShape('measurement'), 'line');
assert.equal(M.autoShape(null), 'line');
// Chart config: line 24 h live from the history, 7/30 d daily statistics, the year monthly means; same unit = one chart.
let c = M.chartCfg(S, '24h', 'measurement');
assert.equal(c.type, 'custom:casora-chart');
assert.deepEqual([c.kind, c.span, c.source, c.bucket, c.readout, c.switch, c.plate], ['line', '24h', 'history', '15min', 'hero', false, true]);
assert.deepEqual(c.series.map((s) => s.entity), [CPU, 'sensor.heimserver_ram']);
c = M.chartCfg(S, '7d', 'measurement');
assert.deepEqual([c.kind, c.source, c.bucket, c.period], ['line', 'stats', '6h', undefined]);
c = M.chartCfg(S, '30d', 'measurement');
assert.deepEqual([c.source, c.bucket], ['stats', '1d']);
c = M.chartCfg(S, '1y', 'measurement');
assert.deepEqual([c.kind, c.span, c.source, c.period, c.bucket], ['line', '1y', 'stats', 'month', '30d'], 'year: monthly means as a line');
c = M.chartCfg(mixed, '24h', 'measurement');
assert.equal(c.switch, undefined, 'different units: the chart switches between the series');
// Bars need buckets: hour for 24 h, day for 7/30 days, month for the year – counters as consumption (change),
// readings as means (24 h from the history so the current hour is in, else statistics).
const E = M.series(states['sensor.zaehler_energie'], {}, hass);
for (const [sp, per] of [['24h', 'hour'], ['7d', 'day'], ['30d', 'day'], ['1y', 'month']]) {
  c = M.chartCfg(E, sp, 'total');
  assert.deepEqual([c.kind, c.source, c.period, c.bucket], ['bar', 'change', per, undefined], 'counter ' + sp + ': bars per ' + per);
  c = M.chartCfg(S, sp, 'measurement', 'bar');
  assert.deepEqual([c.kind, c.source, c.period, c.switch], ['bar', sp === '24h' ? 'history' : 'stats', per, false], 'readings as bars ' + sp);
  assert.equal(c.series.length, 2, 'several series stay side by side');
}
c = M.chartCfg(E, '7d', 'total', 'line');
assert.deepEqual([c.kind, c.source, c.bucket], ['line', 'stats', '6h'], 'counter forced to a line');
c = M.chartCfg(mixed, '7d', 'measurement', 'bar');
assert.equal(c.switch, undefined, 'bars with different units: the switch, one series at a time');
assert.equal(M.key(CPU, '7d'), 'casora_chart:' + CPU + '|7d');
assert.equal(M.key(CPU, '7d', 'bar'), 'casora_chart:' + CPU + '|7d|bar');
console.log('ok chart config');

// Statistics mapping: hourly min/max/mean → lowest with time, highest with time, average of the means.
const now = new Date(2026, 9, 24, 14, 10).getTime();
const H = 36e5, h0 = new Date(2026, 9, 24, 0).getTime();
let s = M.summarize([
  { start: h0 - 2 * H, mean: 20, min: 10, max: 30 },
  { start: h0 + 3 * H, mean: 60, min: 40, max: 95 },
  { start: new Date(h0 + 12 * H).toISOString(), mean: 25, min: 4, max: 50 },
], 'measurement', '24h', now);
assert.deepEqual([s.empty, s.n, s.mean, s.min, s.max], [false, 3, 35, { v: 4, t: h0 + 12 * H }, { v: 95, t: h0 + 3 * H }]);
s = M.summarize([{ start: h0, mean: null, min: null, max: null }], 'measurement', '24h', now);
assert.equal(s.empty, true, 'buckets without values are empty');
assert.equal(M.summarize([], 'measurement', '7d', now).empty, true);
// Counter: change per day → today, sum of the range, average per whole day.
const D = 864e5;
s = M.summarize([{ start: h0 - 3 * D, change: 10 }, { start: h0 - 2 * D, change: 12 }, { start: h0 - D, change: 8 }, { start: h0, change: 3.5 }], 'total', '7d', now);
assert.deepEqual([s.empty, s.sum, s.today, s.perDay], [false, 33.5, 3.5, 10]);
s = M.summarize([{ start: h0 - 2 * H, change: 1 }, { start: h0 + 5 * H, change: 2 }, { start: h0 + 13 * H, change: 0.5 }], 'total', '24h', now);
assert.deepEqual([s.sum, s.today, s.perDay], [3.5, 2.5, null], 'hourly: today from midnight, no per-day average');
assert.equal(s.min, undefined);
// Year: monthly rows → this month, the sum, the average per whole month (no per-day figure).
const m0 = new Date(2026, 9, 1).getTime(), mo = (k) => new Date(2026, 9 - k, 1).getTime();
s = M.summarize([{ start: mo(2), change: 100 }, { start: mo(1), change: 120 }, { start: m0, change: 30 }], 'total', '1y', now);
assert.deepEqual([s.sum, s.today, s.perDay, s.perMonth], [250, 30, null, 110], 'year counter: this month 30, Ø per whole month 110');
s = M.summarize([{ start: mo(1), mean: 20, min: 5, max: 40 }, { start: m0, mean: 30, min: 10, max: 50 }], 'measurement', '1y', now);
assert.deepEqual([s.n, s.mean, s.min, s.max], [2, 25, { v: 5, t: mo(1) }, { v: 50, t: m0 }], 'year readings: min/max/mean over the months');
console.log('ok statistics mapping');

// Fetch once per range: null while loading, the element is kicked when the answer is in, cached afterwards.
const el = { isConnected: true };
answer = { [CPU]: [{ start: h0, mean: 20, min: 10, max: 30 }, { start: h0 + H, mean: 40, min: 20, max: 70 }] };
assert.equal(M.stats(hass, CPU, '24h', el), null, 'loading');
assert.equal(calls.length, 1);
assert.deepEqual([calls[0].type, calls[0].period, calls[0].types, calls[0].statistic_ids], ['recorder/statistics_during_period', 'hour', ['mean', 'min', 'max'], [CPU]]);
assert.ok(Math.abs(Date.parse(calls[0].start_time) - (Date.now() - D)) < 5000, 'hours: exactly 24 h back');
assert.equal(calls[0].units, undefined, 'a percentage without device class sends no units');
assert.equal(M.stats(hass, CPU, '24h', el), null, 'still loading, no second request');
assert.equal(calls.length, 1);
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(kicked, [el], 'the waiting part is redrawn once');
let d = M.stats(hass, CPU, '24h', el);
assert.deepEqual([d.n, d.mean, d.min.v, d.max.v], [2, 30, 10, 70]);
assert.equal(calls.length, 1, 'cached');
calls = [];
assert.equal(M.stats(hass, CPU, '7d', el), null);
assert.deepEqual([calls[0].period, calls[0].types], ['day', ['mean', 'min', 'max']], 'days for 7 d');
// Day buckets start at local midnight: the range does too, so the first day is a whole one.
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
assert.equal(calls[0].start_time, new Date(dayStart(Date.now() - 7 * D)).toISOString(), 'days: from the day start 7 days back');
calls = [];
assert.equal(M.stats(hass, 'sensor.zaehler_energie', '30d', el), null);
assert.deepEqual([calls[0].period, calls[0].types], ['day', ['change']], 'counter: change per day');
assert.equal(calls[0].start_time, new Date(dayStart(Date.now() - 30 * D)).toISOString());
assert.deepEqual(calls[0].units, { energy: 'kWh' }, 'the display unit goes along: Wh stored, kWh shown');
// Year: monthly rows for a counter and a reading (read again in the popup parts below).
const mNow0 = new Date(), mS = (k) => new Date(mNow0.getFullYear(), mNow0.getMonth() - k, 1).getTime();
answer = { 'sensor.zaehler_energie': [{ start: mS(2), change: 100 }, { start: mS(1), change: 120 }, { start: mS(0), change: 30 }],
  [CPU]: [{ start: mS(1), mean: 20, min: 5, max: 40 }, { start: mS(0), mean: 30, min: 10, max: 50 }] };
calls = [];
assert.equal(M.stats(hass, 'sensor.zaehler_energie', '1y', el), null);
assert.deepEqual([calls[0].period, calls[0].types], ['month', ['change']], 'year: change per month');
assert.equal(calls[0].start_time, new Date(mNow0.getFullYear(), mNow0.getMonth() - 11, 1).toISOString(), 'year: from the 1st eleven months back (12 months with this one)');
calls = [];
assert.equal(M.stats(hass, CPU, '1y', el), null);
assert.deepEqual([calls[0].period, calls[0].types], ['month', ['mean', 'min', 'max']], 'year readings: monthly mean/min/max');
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual([M.stats(hass, 'sensor.zaehler_energie', '1y', el).sum, M.stats(hass, CPU, '1y', el).mean], [250, 25]);
// Units only for HA's statistics unit classes and their valid units (recorder UNIT_SCHEMA).
assert.deepEqual(M.units(states['sensor.heimserver_temp']), { temperature: '°C' });
assert.deepEqual(M.units(states['sensor.pumpe_strom']), { electric_current: 'A' });
assert.deepEqual(M.units({ attributes: { device_class: 'power', unit_of_measurement: 'W' } }), { power: 'W' });
assert.equal(M.units({ attributes: { device_class: 'energy', unit_of_measurement: 'Punkte' } }), null, 'unknown unit: none, the request must not fail');
assert.equal(M.units({ attributes: { device_class: 'battery', unit_of_measurement: '%' } }), null, 'battery is no statistics unit class');
assert.equal(M.units(states[CPU]), null);
assert.equal(M.units(null), null);
answer = null;
calls = [];
assert.equal(M.stats(hass, 'sensor.heimserver_ram', '24h', el), null);
await new Promise((r) => setTimeout(r, 0));
d = M.stats(hass, 'sensor.heimserver_ram', '24h', el);
assert.deepEqual([d.empty, d.error], [true, true], 'request failed: empty with error');
// A hiccup after a good answer keeps the numbers: the error row shows only when nothing was ever loaded.
const realNow = Date.now;
Date.now = () => realNow() + 2 * 300000;
try {
  calls = [];
  d = M.stats(hass, CPU, '24h', el);
  assert.deepEqual([d.n, d.error, calls.length], [2, undefined, 1], 'refresh due: old data returned, new request sent');
  await new Promise((r) => setTimeout(r, 0));
  d = M.stats(hass, CPU, '24h', el);
  assert.deepEqual([d.n, d.mean, d.error], [2, 30, undefined], 'failed refresh: the old statistics stay');
} finally { Date.now = realNow; }
assert.equal(M.stats({ states }, CPU, '24h', el), null, 'no connection: nothing');
console.log('ok fetch');

// Popup parts with a UI stub: hero reads the chart, segments carry the range, statistics rows, loading/empty.
window._casoraUI = {
  hero: (o) => JSON.stringify({ hero: o }),
  group: (rows, label) => JSON.stringify({ rows, label }),
  segments: (items) => '<div class="hui-seg">' + items.map((it) => '<div class="hui-sg' + (it.active ? ' on' : '') + '">' + it.label + '</div>').join('') + '</div>',
};
const C = { id: CPU, kind: 'measurement', series: S };
answer = { [CPU]: [{ start: h0, mean: 20, min: 10, max: 30 }] };
let hero = JSON.parse(M.sec('hero', C, states, hass, el)).hero;
assert.deepEqual([hero.value, hero.read, hero.center], ['23 %', CPU, true]);
assert.match(hero.sub, /^Ø 30 % · 24 Std\.$/, 'average of the loaded range in the status line');
let range = M.sec('range', C, states, hass, el);
assert.equal((range.match(/data-casora-cspan="/g) || []).length, 4, 'four ranges incl. the year');
assert.match(range, /data-casora-cspan="sensor\.heimserver_cpu\|24h" class="hui-sg on">24 Std\./);
assert.match(range, /data-casora-cspan="sensor\.heimserver_cpu\|7d" class="hui-sg">7 Tage/);
assert.match(range, /data-casora-cspan="sensor\.heimserver_cpu\|1y" class="hui-sg">Jahr/);
// Shape switch beside the ranges: a reading starts as a line, a counter as bars (automatic).
assert.equal((range.match(/data-casora-cshape="/g) || []).length, 2);
assert.match(range, /data-casora-cshape="sensor\.heimserver_cpu\|line" class="hui-sg on">Linie/);
assert.match(range, /data-casora-cshape="sensor\.heimserver_cpu\|bar" class="hui-sg">Balken/);
M.setDefaults('sensor.zaehler_energie', {}, 'total');
range = M.sec('range', { id: 'sensor.zaehler_energie', kind: 'total', series: [] }, states, hass, el);
assert.match(range, /data-casora-cshape="sensor\.zaehler_energie\|bar" class="hui-sg on">Balken/, 'counter: bars active');
range = M.sec('range', { id: 'sensor.heimserver_start', kind: null, series: [] }, states, hass, el);
assert.equal((range.match(/data-casora-cshape="/g) || []).length, 0, 'no chart, no shape switch');
let st = JSON.parse(M.sec('stats', C, states, hass, el));
assert.equal(st.label, 'Letzte 24 Std.');
assert.deepEqual(st.rows.map((r) => [r.label, r.value]), [['Höchster Wert', '70 %'], ['Tiefster Wert', '10 %'], ['Durchschnitt', '30 %']]);
assert.match(st.rows[0].sub, /^\d\d:\d\d$|^Gestern \d\d:\d\d$/, 'time of the hour bucket');
st = JSON.parse(M.sec('stats', C, states, hass, el));
// 7 d not loaded yet → loading row; failed → empty row.
kicked.length = 0;
M.setSpan(CPU, '7d');
assert.deepEqual(shown, ['casora_chart:' + CPU + '|7d|line'], 'the chart in the popup switches to 7 d (automatic shape: line)');
assert.ok(kicked.includes(el), 'parts redraw after the switch');
assert.equal(M.span(CPU), '7d');
hero = JSON.parse(M.sec('hero', C, states, hass, el)).hero;
assert.equal(hero.sub, 'Ø 30 % · 7 Tage', '7 d was fetched above: its average');
st = JSON.parse(M.sec('stats', C, states, hass, el));
assert.deepEqual([st.label, st.rows.length], ['Letzte 7 Tage', 3]);
// 30 d not loaded yet → loading row, no average in the status line.
M.setSpan(CPU, '30d');
hero = JSON.parse(M.sec('hero', C, states, hass, el)).hero;
assert.equal(hero.sub, null, 'nothing loaded for 30 d yet: no average');
st = JSON.parse(M.sec('stats', C, states, hass, el));
assert.deepEqual([st.label, st.rows[0].label], ['Letzte 30 Tage', 'Wird geladen …']);
M.setSpan(CPU, '7d');
const noNum = JSON.parse(M.sec('stats', { id: 'sensor.heimserver_start', kind: null, series: [] }, states, hass, el));
assert.equal(noNum.rows[0].label, 'Kein Zahlenwert');
const ramC = { id: 'sensor.heimserver_ram', kind: 'measurement', series: [] };
st = JSON.parse(M.sec('stats', ramC, states, hass, el));
assert.equal(st.rows[0].label, 'Statistik nicht abrufbar');
// Empty statistics: the hint about hourly collection only for sensors HA actually records (state class).
for (const [id, sub] of [['sensor.pumpe_strom', 'Home Assistant sammelt sie stündlich.'], ['sensor.luft_ppm', 'Dieser Sensor hat keine Statistik.']]) {
  answer = { [id]: [] };
  const EC0 = { id, kind: 'measurement', series: [] };
  M.sec('stats', EC0, states, hass, el);
  await new Promise((r) => setTimeout(r, 0));
  st = JSON.parse(M.sec('stats', EC0, states, hass, el));
  assert.deepEqual([st.rows[0].label, st.rows[0].sub], ['Noch keine Statistik', sub], id);
}
// Counter rows.
const EC = { id: 'sensor.zaehler_energie', kind: 'total', series: E };
M.setSpan('sensor.zaehler_energie', '7d');
answer = { 'sensor.zaehler_energie': [{ start: h0 - D, change: 8 }, { start: h0, change: 3.5 }] };
M.sec('stats', EC, states, hass, el);
await new Promise((r) => setTimeout(r, 0));
st = JSON.parse(M.sec('stats', EC, states, hass, el));
assert.deepEqual(st.rows.map((r) => [r.label, r.value]), [['Heute', '3,5 kWh'], ['Letzte 7 Tage', '11,5 kWh'], ['Ø pro Tag', '8,0 kWh']]);
hero = JSON.parse(M.sec('hero', EC, states, hass, el)).hero;
assert.equal(hero.sub, 'Heute 3,5 kWh');
// Year with a counter (fetched above): this month, the sum of 12 months, Ø per month; month names on the reading rows.
M.setSpan('sensor.zaehler_energie', '1y');
st = JSON.parse(M.sec('stats', EC, states, hass, el));
assert.deepEqual(st.rows.map((r) => [r.label, r.value]), [['Dieser Monat', '30,0 kWh'], ['Letzte 12 Monate', '250 kWh'], ['Ø pro Monat', '110 kWh']]);
hero = JSON.parse(M.sec('hero', EC, states, hass, el)).hero;
assert.equal(hero.sub, 'Dieser Monat 30,0 kWh');
M.setSpan(CPU, '1y');
st = JSON.parse(M.sec('stats', C, states, hass, el));
assert.equal(st.label, 'Letzte 12 Monate');
assert.deepEqual(st.rows.map((r) => [r.label, r.value, r.sub]), [['Höchster Wert', '50 %', 'Dieser Monat'],
  ['Tiefster Wert', '5 %', new Date(mS(1)).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })], ['Durchschnitt', '25 %', undefined]]);
hero = JSON.parse(M.sec('hero', C, states, hass, el)).hero;
assert.equal(hero.sub, 'Ø 25 % · Jahr');
M.setSpan(CPU, '7d');
// Lines (several series): one row per sensor with its colour and the current value.
const lines = JSON.parse(M.sec('series', C, states, hass, el));
assert.deepEqual(lines.rows.map((r) => [r.entity, r.label, r.iconTone, r.value]), [[CPU, 'heimserver cpu', '#4A7DBA', '23 %'], ['sensor.heimserver_ram', 'RAM', 'var(--casora-color-green, #30D158)', '61,4 %']]);
assert.equal(lines.label, 'Linien');
// Unavailable main sensor: value word, warning tone, no crash.
hero = JSON.parse(M.sec('hero', { id: 'sensor.heimserver_weg', kind: 'measurement', series: [] }, states, hass, el)).hero;
assert.deepEqual([hero.value, hero.valueTone], ['Nicht verfügbar', 'warn']);
assert.equal(M.sec('hero', { id: 'sensor.gibt_es_nicht', kind: 'measurement', series: [] }, states, hass, el).length > 0, true, 'missing entity renders');
console.log('ok popup parts');

// Segment tap: the document listener reads the range and switches.
const node = { attrs: { 'data-casora-cspan': CPU + '|30d' }, getAttribute(k) { return this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; } };
let prevented = false;
clicks.forEach((fn) => fn({ composedPath: () => [node], preventDefault: () => { prevented = true; }, stopPropagation: () => {} }));
assert.ok(prevented);
assert.equal(M.span(CPU), '30d');
assert.equal(shown[shown.length - 1], 'casora_chart:' + CPU + '|30d|line');
M.setSpan(CPU, 'nope');
assert.equal(M.span(CPU), '30d', 'unknown range ignored');
// Shape tap: remembered per sensor for the session, the chart swaps to the bar config of the current range.
const node2 = { attrs: { 'data-casora-cshape': CPU + '|bar' }, getAttribute(k) { return this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; } };
kicked.length = 0;
clicks.forEach((fn) => fn({ composedPath: () => [node2], preventDefault: () => {}, stopPropagation: () => {} }));
assert.equal(M.shape(CPU), 'bar');
assert.equal(shown[shown.length - 1], 'casora_chart:' + CPU + '|30d|bar');
assert.ok(kicked.includes(el), 'segments redraw after the shape switch');
assert.match(M.sec('range', C, states, hass, el), /cshape="sensor\.heimserver_cpu\|bar" class="hui-sg on"/);
M.setSpan(CPU, '7d');
assert.equal(shown[shown.length - 1], 'casora_chart:' + CPU + '|7d|bar', 'range switch keeps the chosen shape');
M.setShape(CPU, 'nope');
assert.equal(M.shape(CPU), 'bar', 'unknown shape ignored');
assert.equal(M.shape('sensor.heimserver_ram'), 'line', 'other sensors untouched');
M.setShape(CPU, 'line');
M.setSpan(CPU, '30d');
console.log('ok range tap');

// Popup layout with the soft kit stub: chart configs for all ranges registered, chart slot static, lines only with 2+.
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => o, bare: () => ({}) };
shown.length = 0;
let lay = M.popup(states[CPU], states, hass, { entity_2: 'sensor.heimserver_ram' });
assert.deepEqual(lay.top, ['hero', 'range', 'chart']);
assert.deepEqual([lay.left, lay.right], [['series'], ['stats']]);
assert.ok(/hp-chart-slot/.test(lay.fields.chart.card.custom_fields.c), 'slot for the chart');
const keys = [];
['24h', '7d', '30d', '1y'].forEach((sp) => ['line', 'bar'].forEach((sh) => keys.push('casora_chart:' + CPU + '|' + sp + '|' + sh)));
assert.deepEqual(Object.keys(window._hpPlantCfg).sort(), keys.sort(), 'one config per range and shape');
assert.equal(window._hpPlantCfg['casora_chart:' + CPU + '|7d|line'].series.length, 2);
assert.deepEqual([window._hpPlantCfg['casora_chart:' + CPU + '|1y|bar'].kind, window._hpPlantCfg['casora_chart:' + CPU + '|1y|bar'].period], ['bar', 'month']);
assert.deepEqual(shown, ['init:casora_chart:' + CPU + '|30d|line'], 'the remembered range is mounted with the automatic shape');
assert.deepEqual(lay.fields.hero.card.watch, [CPU, 'sensor.heimserver_ram']);
// Studio defaults: "Range when opening" and "Display" apply to a sensor without a session choice; a choice made
// in the popup wins for the session.
shown.length = 0;
M.popup(states['sensor.heimserver_temp'], states, hass, { chart_span: '7d', chart_kind: 'bar' });
assert.deepEqual([M.span('sensor.heimserver_temp'), M.shape('sensor.heimserver_temp')], ['7d', 'bar']);
assert.deepEqual(shown, ['init:casora_chart:sensor.heimserver_temp|7d|bar'], 'Studio defaults mount the first chart');
M.popup(states['sensor.zaehler_energie'], states, hass, { chart_span: '1y' });
assert.deepEqual([M.span('sensor.zaehler_energie'), M.shape('sensor.zaehler_energie')], ['1y', 'bar'], 'year on opening, counter → bars');
M.popup(states['sensor.zaehler_energie'], states, hass, { chart_kind: 'line', chart_span: 'nope' });
assert.deepEqual([M.span('sensor.zaehler_energie'), M.shape('sensor.zaehler_energie')], ['1y', 'line'], 'unknown range → 24 h… but the session choice (year) stays; line forced');
M.setShape('sensor.zaehler_energie', 'bar');
M.popup(states['sensor.zaehler_energie'], states, hass, { chart_kind: 'line' });
assert.equal(M.shape('sensor.zaehler_energie'), 'bar', 'the popup choice wins over the Studio default');
M.popup(states[CPU], states, hass, { chart_span: '1y' });
assert.equal(M.span(CPU), '30d', 'range chosen in the popup wins over the Studio default');
lay = M.popup(states[CPU], states, hass, {});
assert.deepEqual(lay.left, [], 'one sensor: one column');
assert.equal(lay.fields.series, undefined);
lay = M.popup(states['sensor.heimserver_start'], states, hass, {});
assert.equal(lay.fields.chart, undefined, 'no chart for a text sensor');
assert.deepEqual(M.popup({ entity_id: 'sensor.fehlt' }, states, hass, {}), { type: 'vertical-stack', cards: [] });
for (const lang of ['en', 'es']) {
  const ph = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/' + lang + '.json', import.meta.url), 'utf8')).exact;
  for (const t of ['Noch keine Statistik', 'Statistik nicht abrufbar', 'Home Assistant sammelt sie stündlich.', 'Dieser Sensor hat keine Statistik.',
    'Jahr', 'Letzte 12 Monate', 'Linie', 'Balken', 'Dieser Monat', 'Ø pro Monat', 'Ø pro Stunde', 'letzte 12 Monate'])
    assert.ok(ph[t], lang + ' phrase missing for: ' + t);
}
// Studio fields of the chart tile: display (automatic / line / bars) and the range when opening, with translations.
{
  const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url), 'utf8');
  const w = {};
  new Function('window', src.slice(0, src.indexOf('window.casoraCommunityType')))(w);
  const t = w.CASORA_TILE_TYPES.find((x) => x.id === 'casora_chart');
  assert.ok(t, 'casora_chart in the Studio');
  const f = (k) => t.fields.find((x) => x.key === k);
  assert.deepEqual([f('chart_kind').type, f('chart_kind').options, f('chart_kind').label], ['select', ['', 'line', 'bar'], 'Display']);
  assert.deepEqual(f('chart_kind').optionLabels, { '': 'Automatic', line: 'Line', bar: 'Bars' });
  assert.deepEqual([f('chart_span').type, f('chart_span').options, f('chart_span').label], ['select', ['', '7d', '30d', '1y'], 'Range when opening']);
  assert.deepEqual(f('chart_span').optionLabels, { '': '24 hours', '7d': '7 days', '30d': '30 days', '1y': 'Year' });
  const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8')).casora_chart.variables;
  assert.ok('chart_kind' in tpl && 'chart_span' in tpl, 'template variables declared');
  for (const lang of ['de', 'es']) {
    const tr = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/panel/' + lang + '.json', import.meta.url), 'utf8')).exact;
    for (const k of ['Display', 'Line', 'Bars', 'Range when opening', '24 hours', '7 days', '30 days', 'Year', f('chart_kind').hint, f('chart_span').hint])
      assert.ok(tr[k], lang + ' Studio text missing for: ' + k);
  }
}
console.log('chart_card: ok');
