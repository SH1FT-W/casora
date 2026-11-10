// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#bucketSums,peakOf,percentile,niceScale,scaleOf,peakShare,peakIds,roomScale,stage3
// Room energy popup without a house value (owner, 07.11.2026: the ring instead of the big number, and the ring learns
// the room's usual range – one spike must not leave it empty): the ring's full scale is the 95th percentile of the room's
// hourly maxima over 30 days (HA's long-term statistics, in W; devices summed per hour), rounded up to a nice step
// („Üblich bis 500 W“). Fewer than 3 days of hours: the 24 h peak from the 5-minute statistics („Spitze 24 Std.: …“).
// Above the scale the ring is full, never more; the scale is not redrawn live and fetched at most once an hour; an
// empty ring while it loads; without statistics the plate with „Jetzt“; the house share (energy_room_share.mjs) wins.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
let timers = [];
globalThis.setTimeout = (fn) => { timers.push(fn); return 0; };
const flush = () => { const t = timers; timers = []; t.forEach((f) => f()); };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
// The real power sum (casora-core) for the parts.
const at = core.indexOf('window._casoraPowerSum) return;');
const start = core.lastIndexOf('(function () {', at), end = core.indexOf('})();', at) + 5;
new Function(core.slice(start, end))();
new Function(src)();
const E = window._casoraSoftEnergy;
for (const f of ['bucketSums', 'peakOf', 'percentile', 'niceScale', 'scaleOf', 'peakShare', 'peakIds', 'roomScale'])
  assert.equal(typeof E[f], 'function', 'E.' + f + ' missing');

const R = (t, max) => ({ start: t, end: t + 3e5, max });
const H = 36e5;
// Hourly rows: n hours with the given maxima (cycled).
const hours = (n, f) => Array.from({ length: n }, (_, i) => R(i * H, f(i)));

// Pure: sums per bucket, peak.
assert.deepEqual(E.bucketSums({ 'sensor.a': [R(0, 100), R(3e5, 20)], 'sensor.b': [R(0, 50), R(3e5, 200)] }, ['sensor.a', 'sensor.b']), [150, 220]);
assert.equal(E.peakOf({ 'sensor.a': [R(0, 40), R(3e5, 310), R(6e5, 12)] }, ['sensor.a']), 310, 'one sensor: its max');
assert.equal(E.peakOf({ 'sensor.a': [R(0, 100), R(3e5, 20)], 'sensor.b': [R(0, 50), R(3e5, 200)] }, ['sensor.a', 'sensor.b']), 220,
  'two devices: the highest sum per bucket (20 + 200), not the sum of their peaks (300)');
assert.equal(E.peakOf({ 'sensor.a': [R(0, 100)], 'sensor.b': [R('1970-01-01T00:00:00Z', 50)] }, ['sensor.a', 'sensor.b']), 150, 'ISO and ms starts line up');
assert.equal(E.peakOf({ 'sensor.a': [R(0, -30), R(3e5, 10)] }, ['sensor.a']), 10, 'a negative max counts as 0 W');
assert.equal(E.peakOf({}, ['sensor.a']), null, 'no statistics: no peak');
assert.equal(E.peakOf({ 'sensor.a': [R(0, null)] }, ['sensor.a']), null, 'empty rows: no peak');
assert.equal(E.peakOf(null, ['sensor.a']), null);

// Pure: percentile (nearest rank).
const ramp = Array.from({ length: 100 }, (_, i) => i + 1);
assert.equal(E.percentile(ramp, 95), 95, '1 … 100: 95th is 95');
assert.equal(E.percentile([5, 1, 3], 95), 5);
assert.equal(E.percentile([7], 95), 7);
assert.equal(E.percentile([], 95), null);

// Pure: nice steps.
for (const [v, s] of [[0, 10], [3, 10], [11, 15], [95, 100], [100, 100], [101, 150], [151, 200], [201, 250], [260, 300], [310, 400],
  [420, 500], [501, 750], [760, 1000], [1001, 1500], [1600, 2000], [2100, 2500], [2600, 3000], [3100, 4000], [4100, 5000], [5100, 7500], [8000, 10000]])
  assert.equal(E.niceScale(v), s, `nice step for ${v} W: ${s}`);

// The scale: 30 days of hours, rare spikes ignored.
const ids = ['sensor.a'];
// 30 days at up to 430 W, ten one-hour spikes of 3,1 kW (1,4 % of the hours): usual up to 500 W.
const month = { 'sensor.a': hours(720, (i) => (i % 72 === 0 ? 3100 : 100 + (i % 12) * 30)) };
assert.deepEqual(E.scaleOf(month, null, ids), { max: 500, kind: 'usual' }, 'spikes ignored: 95th of 430 W → 500 W');
// Two devices: their maxima summed per hour.
const two = { 'sensor.a': hours(100, () => 200), 'sensor.b': hours(100, () => 90) };
assert.deepEqual(E.scaleOf(two, null, ['sensor.a', 'sensor.b']), { max: 300, kind: 'usual' }, '200 + 90 W per hour → 300 W');
// Fewer than 3 days of hours: the 24 h peak.
const short = { 'sensor.a': hours(71, () => 200) };
assert.deepEqual(E.scaleOf(short, { 'sensor.a': [R(0, 2900), R(3e5, 50)] }, ids), { max: 2900, kind: 'peak' }, '71 hours: fallback to the 24 h peak');
assert.deepEqual(E.scaleOf({ 'sensor.a': hours(72, () => 200) }, null, ids), { max: 200, kind: 'usual' }, '72 hours are enough');
assert.equal(E.scaleOf({}, {}, ids), null, 'no statistics: no scale');
assert.deepEqual(E.scaleOf({ 'sensor.a': hours(100, () => 0) }, { 'sensor.a': [R(0, 40)] }, ids), { max: 40, kind: 'peak' },
  'a room that never drew anything in 30 days: the 24 h peak');

// Pure: value against the scale.
assert.deepEqual(E.peakShare(124, { max: 500, kind: 'usual' }), { room: 124, max: 500, pct: 25 }, '124 of 500 W: 25 %');
assert.deepEqual(E.peakShare(900, { max: 500, kind: 'usual' }), { room: 900, max: 500, pct: 100 }, 'above the usual range: full, the scale stays');
assert.deepEqual(E.peakShare(400, { max: 310, kind: 'peak' }), { room: 400, max: 400, pct: 100 }, 'above the 24 h peak: the peak is now');
assert.deepEqual(E.peakShare(0, { max: 500, kind: 'usual' }), { room: 0, max: 500, pct: 0 }, 'nothing drawn: empty ring');
assert.equal(E.peakShare(0, { max: 0, kind: 'peak' }), null, 'no scale at all: plate');
assert.equal(E.peakShare(null, { max: 500, kind: 'usual' }), null, 'no value now: no ring');
assert.equal(E.peakShare(-50, { max: 500, kind: 'usual' }), null, 'feeding in: no ring');
assert.equal(E.peakShare(100, null), null, 'no scale: no ring');

// The sensors asked for: the room's own sensor, else the parts with a power value (not the ones behind a plug).
const P = (v, u = 'W') => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'power', state_class: 'measurement' } });
assert.deepEqual(E.peakIds({ home: 'sensor.room' }, {}), ['sensor.room']);
const parts = { energy_entities: ['sensor.a', 'sensor.b', 'sensor.c', 'sensor.d'], energy_parent: { 'sensor.c': 'sensor.a' } };
assert.deepEqual(E.peakIds({ sum: parts }, { 'sensor.a': P(100), 'sensor.b': { state: 'unavailable', attributes: { unit_of_measurement: 'W' } },
  'sensor.c': P(20), 'sensor.d': { state: '5', attributes: { unit_of_measurement: 'kWh', device_class: 'energy' } } }), ['sensor.a', 'sensor.b'],
'parts: with a power value or offline; a device behind a plug and an energy meter stay out');

// The fetch: hourly 30 days in W; the 5-minute day only when there are too few hours; once an hour per room.
let asked = [], answers = {}, fail = false;
const hass = { states: {}, callWS: (m) => { asked.push(m); return fail ? Promise.reject(new Error('x')) : Promise.resolve(answers[m.period] || {}); } };
const kicked = [];
window.casoraKick = (el) => kicked.push(el);
answers = { hour: month };
const el = {};
assert.equal(E.roomScale(['sensor.a'], hass, el), 'wait', 'first call: waits');
assert.equal(E.roomScale(['sensor.a'], hass, el), 'wait', 'second call while out: no second request');
assert.equal(asked.length, 1);
let m = asked[0];
assert.equal(m.type, 'recorder/statistics_during_period');
assert.equal(m.period, 'hour');
assert.deepEqual(m.types, ['max']);
assert.deepEqual(m.units, { power: 'W' }, 'kW sensors come as W');
assert.ok(Math.abs(Date.now() - 30 * 864e5 - Date.parse(m.start_time)) < 5000, 'the last 30 days');
await settle();
assert.equal(asked.length, 1, 'enough hours: no 5-minute request');
assert.deepEqual(kicked, [el], 'the stage is drawn again once');
assert.deepEqual(E.roomScale(['sensor.a'], hass, el), { max: 500, kind: 'usual' }, 'then the scale, from the cache');
assert.equal(asked.length, 1, 'cached for the hour');
assert.ok(/Math\.floor\(Date\.now\(\) \/ 36e5\)/.test(src), 'refetched at most once an hour');
// Too few hours: the 5-minute day as well.
answers = { hour: short, '5minute': { 'sensor.f': [R(0, 2900)] } };
asked = [];
E.roomScale(['sensor.f'], hass, null);
await settle();
assert.deepEqual(asked.map((x) => x.period), ['hour', '5minute']);
assert.ok(Math.abs(Date.now() - 864e5 - Date.parse(asked[1].start_time)) < 5000, 'the 5-minute request: the last 24 hours');
assert.deepEqual(E.roomScale(['sensor.f'], hass, null), { max: 2900, kind: 'peak' });
fail = true;
assert.equal(E.roomScale(['sensor.none'], hass, null), 'wait');
await settle();
assert.equal(E.roomScale(['sensor.none'], hass, null), null, 'request failed: no scale (plate)');
fail = false;
assert.equal(E.roomScale([], hass, null), null, 'no sensors: no scale');
assert.equal(E.roomScale(['sensor.a'], { states: {} }, null), null, 'no connection: no scale');

// The stage: a dial with the usual range, the plate without statistics.
const calls = [];
window._casoraUI = {
  stage: (t, o) => { calls.push({ t, o }); return '<stage ' + calls.length + '>'; },
  dialPct: (v, mn, mx) => Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)),
};
window.casoraEnergyHouse = () => null; // no house value (HA's energy settings without a grid power sensor)
// The line keeps the value together (non-breaking spaces).
const NB = (t) => t.replace(/ (?=24|Std|W$|kW$)|(?<=bis) /g, '\u00a0');
const node = (txt) => ({ textContent: txt, hasAttribute: () => false });
const fakeSelf = () => {
  const nodes = { n: node(''), u: node(''), w: node(''), trend: node(''), dl: { painted: [] } };
  return { nodes, shadowRoot: { querySelector: (q) => (q === '.hui-st-n' ? nodes.n : q === '.hui-st-u' ? nodes.u
    : q === '.hui-stage .hui-dl .hui-st-w' ? nodes.w : q === '.hui-st-trend' ? nodes.trend : q === '.hui-stage .hui-dl' ? nodes.dl : null) } };
};
window._casoraUI.dialPaint = (e, pct) => e.painted.push(pct);
const C = { room: true, sum: { energy_entities: ['sensor.s1', 'sensor.s2'] } };
answers = { hour: { 'sensor.s1': hours(720, (i) => (i % 72 === 0 ? 3100 : 300)), 'sensor.s2': hours(720, () => 120) } };
hass.states = { 'sensor.s1': P(100), 'sensor.s2': P(24) };
const self = fakeSelf();
E.stage3(C, hass.states, hass, self);
let o = calls.at(-1).o;
assert.equal(calls.at(-1).t, 'chart', 'S6 stage');
assert.ok(o.ring, 'while the scale loads: already the dial (no jump from plate to ring)');
assert.equal(o.trend, 'Jetzt');
flush();
assert.equal(self.nodes.dl.painted.at(-1), 0, 'empty ring while it loads');
await settle();
const out = E.stage3(C, hass.states, hass, self);
flush();
assert.equal(self.nodes.n.textContent, '124', 'value stays the power now');
assert.equal(self.nodes.u.textContent, 'W');
assert.equal(self.nodes.w.textContent, NB('Üblich bis 500 W'), 'the line names the usual range (420 W per hour → 500 W, spikes ignored)');
assert.ok(Math.abs(self.nodes.dl.painted.at(-1) - 124 / 500 * 100) < 0.01, 'ring 124 of 500 W');
// Live: the room draws more than usual – full, the scale and the line stay.
hass.states = { 'sensor.s1': P(1.2, 'kW'), 'sensor.s2': P(24) };
assert.equal(E.stage3(C, hass.states, hass, self), out, 'no redraw while the popup is open');
flush();
assert.equal(self.nodes.dl.painted.at(-1), 100, 'never above 100 %');
assert.equal(self.nodes.w.textContent, NB('Üblich bis 500 W'), 'the scale is not redrawn live');
// A fresh stage with the scale known: the ring is passed in the room's W.
E.stage3(C, { 'sensor.s1': P(100), 'sensor.s2': P(24) }, hass, fakeSelf());
o = calls.at(-1).o;
assert.deepEqual(o.ring, { min: 0, max: 500, value: 124 }, 'ring 0 … usual range, filled with the room');
// Fallback room (a new sensor): „Spitze 24 Std.“ with the peak, which follows a higher value now.
const C3 = { room: true, home: 'sensor.new' };
answers = { hour: { 'sensor.new': hours(10, () => 100) }, '5minute': { 'sensor.new': [R(0, 310)] } };
const s3 = fakeSelf();
E.stage3(C3, { 'sensor.new': P(124) }, hass, s3);
await settle();
E.stage3(C3, { 'sensor.new': P(124) }, hass, s3); flush();
assert.equal(s3.nodes.w.textContent, NB('Spitze 24 Std.: 310 W'), 'fallback line');
assert.ok(Math.abs(s3.nodes.dl.painted.at(-1) - 124 / 310 * 100) < 0.01);
E.stage3(C3, { 'sensor.new': P(1200) }, hass, s3); flush();
assert.equal(s3.nodes.dl.painted.at(-1), 100);
assert.equal(s3.nodes.w.textContent, NB('Spitze 24 Std.: 1,2 kW'));
// No statistics for the room: the plate with „Jetzt“ as before.
const C2 = { room: true, home: 'sensor.nostats' };
answers = {};
E.stage3(C2, { 'sensor.nostats': P(50) }, hass, fakeSelf());
await settle();
E.stage3(C2, { 'sensor.nostats': P(50) }, hass, fakeSelf());
o = calls.at(-1).o;
assert.ok(!o.ring && o.trend === 'Jetzt', 'no statistics: plate with „Jetzt“');
// Not a room (a device's power): plate, no request.
const n0 = asked.length;
E.stage3({ home: 'sensor.dev' }, { 'sensor.dev': P(50) }, hass, fakeSelf());
assert.ok(!calls.at(-1).o.ring && asked.length === n0, 'not a room: plate, nothing asked');
// The house known: its share wins, nothing asked.
window.casoraEnergyHouse = () => ({ ids: ['sensor.grid'], grid: ['sensor.grid'], solar: [], battery: [] });
E.stage3({ room: true, home: 'sensor.r9' }, { 'sensor.r9': P(100), 'sensor.grid': P(400) }, hass, fakeSelf());
assert.equal(calls.at(-1).o.trend, '25 % vom Haus', 'house share first');
assert.equal(asked.length, n0, 'no scale asked when the house is known');

// Every language has both lines; the patterns match the non-breaking lines.
for (const l of ['en', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'nb']) {
  const j = JSON.parse(fs.readFileSync(new URL(`../../custom_components/casora/translations/dashboard/phrases/${l}.json`, import.meta.url), 'utf8'));
  const all = Object.values(j).flat().filter((x) => Array.isArray(x));
  for (const [key, line, val] of [['^Spitze\\s24', 'Spitze 24 Std.: 2,9 kW', '2,9 kW'], ['^Üblich\\sbis','Üblich bis 500 W', '500 W']]) {
    const p = all.find((x) => String(x[0]).startsWith(key));
    assert.ok(p, `phrase „${line}“ in ${l}.json`);
    const mm = new RegExp(p[0]).exec(NB(line));
    assert.ok(mm && mm[1] === NB(val), `${l}: the pattern reads „${line}“`);
    assert.ok(/\{1\}/.test(p[1]), `${l}: value kept`);
  }
}
console.log('energy_room_peak: ok');
process.exit(0);
