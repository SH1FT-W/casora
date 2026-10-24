// Chart card (community card #50, 27-chart.js) without HA: kind of a sensor, value with unit, series from the
// Studio fields, chart config per range, statistics mapping (recorder/statistics_during_period), loading and empty
// states, range switch. All devices and names made up.  node dev/unit/chart_card.mjs
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

// Chart config: 24 h live from the history, 7/30 d statistics, counter alone as bars, same unit = one chart.
let c = M.chartCfg(S, '24h', 'measurement');
assert.equal(c.type, 'custom:casora-chart');
assert.deepEqual([c.kind, c.span, c.source, c.bucket, c.readout, c.switch, c.plate], ['line', '24h', 'history', '15min', 'hero', false, true]);
assert.deepEqual(c.series.map((s) => s.entity), [CPU, 'sensor.heimserver_ram']);
c = M.chartCfg(S, '7d', 'measurement');
assert.deepEqual([c.source, c.bucket], ['stats', '6h']);
c = M.chartCfg(S, '30d', 'measurement');
assert.deepEqual([c.source, c.bucket], ['stats', '1d']);
c = M.chartCfg(mixed, '24h', 'measurement');
assert.equal(c.switch, undefined, 'different units: the chart switches between the series');
const E = M.series(states['sensor.zaehler_energie'], {}, hass);
c = M.chartCfg(E, '7d', 'total');
assert.deepEqual([c.kind, c.source], ['bar', 'change'], 'one counter over days: bars per day');
c = M.chartCfg(E, '24h', 'total');
assert.deepEqual([c.kind, c.source], ['line', 'history'], 'counter over 24 h: the line');
assert.equal(M.key(CPU, '7d'), 'casora_chart:' + CPU + '|7d');
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
console.log('ok statistics mapping');

// Fetch once per range: null while loading, the element is kicked when the answer is in, cached afterwards.
const el = { isConnected: true };
answer = { [CPU]: [{ start: h0, mean: 20, min: 10, max: 30 }, { start: h0 + H, mean: 40, min: 20, max: 70 }] };
assert.equal(M.stats(hass, CPU, '24h', el), null, 'loading');
assert.equal(calls.length, 1);
assert.deepEqual([calls[0].type, calls[0].period, calls[0].types, calls[0].statistic_ids], ['recorder/statistics_during_period', 'hour', ['mean', 'min', 'max'], [CPU]]);
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
calls = [];
assert.equal(M.stats(hass, 'sensor.zaehler_energie', '30d', el), null);
assert.deepEqual([calls[0].period, calls[0].types], ['day', ['change']], 'counter: change per day');
answer = null;
calls = [];
assert.equal(M.stats(hass, 'sensor.heimserver_ram', '24h', el), null);
await new Promise((r) => setTimeout(r, 0));
d = M.stats(hass, 'sensor.heimserver_ram', '24h', el);
assert.deepEqual([d.empty, d.error], [true, true], 'request failed: empty with error');
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
const range = M.sec('range', C, states, hass, el);
assert.equal((range.match(/data-casora-cspan="/g) || []).length, 3);
assert.match(range, /data-casora-cspan="sensor\.heimserver_cpu\|24h" class="hui-sg on">24 Std\./);
assert.match(range, /data-casora-cspan="sensor\.heimserver_cpu\|7d" class="hui-sg">7 Tage/);
let st = JSON.parse(M.sec('stats', C, states, hass, el));
assert.equal(st.label, 'Letzte 24 Std.');
assert.deepEqual(st.rows.map((r) => [r.label, r.value]), [['Höchster Wert', '70 %'], ['Tiefster Wert', '10 %'], ['Durchschnitt', '30 %']]);
assert.match(st.rows[0].sub, /^\d\d:\d\d$|^Gestern \d\d:\d\d$/, 'time of the hour bucket');
st = JSON.parse(M.sec('stats', C, states, hass, el));
// 7 d not loaded yet → loading row; failed → empty row.
kicked.length = 0;
M.setSpan(CPU, '7d');
assert.deepEqual(shown, ['casora_chart:' + CPU + '|7d'], 'the chart in the popup switches to 7 d');
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
assert.equal(shown[shown.length - 1], 'casora_chart:' + CPU + '|30d');
M.setSpan(CPU, 'nope');
assert.equal(M.span(CPU), '30d', 'unknown range ignored');
console.log('ok range tap');

// Popup layout with the soft kit stub: chart configs for all ranges registered, chart slot static, lines only with 2+.
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => o, bare: () => ({}) };
shown.length = 0;
let lay = M.popup(states[CPU], states, hass, { entity_2: 'sensor.heimserver_ram' });
assert.deepEqual(lay.top, ['hero', 'range', 'chart']);
assert.deepEqual([lay.left, lay.right], [['series'], ['stats']]);
assert.ok(/hp-chart-slot/.test(lay.fields.chart.card.custom_fields.c), 'slot for the chart');
assert.deepEqual(Object.keys(window._hpPlantCfg).sort(), ['24h', '30d', '7d'].map((sp) => 'casora_chart:' + CPU + '|' + sp).sort());
assert.equal(window._hpPlantCfg['casora_chart:' + CPU + '|7d'].series.length, 2);
assert.deepEqual(shown, ['init:casora_chart:' + CPU + '|30d'], 'the remembered range is mounted');
assert.deepEqual(lay.fields.hero.card.watch, [CPU, 'sensor.heimserver_ram']);
lay = M.popup(states[CPU], states, hass, {});
assert.deepEqual(lay.left, [], 'one sensor: one column');
assert.equal(lay.fields.series, undefined);
lay = M.popup(states['sensor.heimserver_start'], states, hass, {});
assert.equal(lay.fields.chart, undefined, 'no chart for a text sensor');
assert.deepEqual(M.popup({ entity_id: 'sensor.fehlt' }, states, hass, {}), { type: 'vertical-stack', cards: [] });
console.log('chart_card: ok');
