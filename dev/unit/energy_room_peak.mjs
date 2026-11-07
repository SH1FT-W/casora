// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#peakOf,peakShare,peakIds,roomPeak,stage3
// Room energy popup without a house value (owner, 07.11.2026: the ring instead of the big number): the ring is the
// room's power now against its peak of the last 24 hours (HA's 5-minute statistics, max in W). A room adding up devices:
// the peak is the highest 5-minute sum of their maxima. The value stays („124 W“), under it „Spitze 24 Std.: 310 W“ (wrapping only after the colon);
// never above 100 % (the peak is at least the value now); an empty ring while the peak loads; without statistics the
// plate with „Jetzt“ as before; the house share (energy_room_share.mjs) wins when the house is known.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
let timers = [];
globalThis.setTimeout = (fn) => { timers.push(fn); return 0; };
const flush = () => { const t = timers; timers = []; t.forEach((f) => f()); };
// The real power sum (casora-core) for the parts.
const at = core.indexOf('window._casoraPowerSum) return;');
const start = core.lastIndexOf('(function () {', at), end = core.indexOf('})();', at) + 5;
new Function(core.slice(start, end))();
new Function(src)();
const E = window._casoraSoftEnergy;
for (const f of ['peakOf', 'peakShare', 'peakIds', 'roomPeak']) assert.equal(typeof E[f], 'function', 'E.' + f + ' missing');

// Pure: the peak from the statistics.
const R = (t, max) => ({ start: t, end: t + 3e5, max });
assert.equal(E.peakOf({ 'sensor.a': [R(0, 40), R(3e5, 310), R(6e5, 12)] }, ['sensor.a']), 310, 'one sensor: its 24 h max');
assert.equal(E.peakOf({ 'sensor.a': [R(0, 100), R(3e5, 20)], 'sensor.b': [R(0, 50), R(3e5, 200)] }, ['sensor.a', 'sensor.b']), 220,
  'two devices: the highest 5-minute sum (20 + 200), not the sum of their peaks (300)');
assert.equal(E.peakOf({ 'sensor.a': [R(0, 100)], 'sensor.b': [R('1970-01-01T00:00:00Z', 50)] }, ['sensor.a', 'sensor.b']), 150, 'ISO and ms starts line up');
assert.equal(E.peakOf({ 'sensor.a': [R(0, -30), R(3e5, 10)] }, ['sensor.a']), 10, 'a negative max counts as 0 W');
assert.equal(E.peakOf({}, ['sensor.a']), null, 'no statistics: no peak');
assert.equal(E.peakOf({ 'sensor.a': [R(0, null)] }, ['sensor.a']), null, 'empty rows: no peak');
assert.equal(E.peakOf(null, ['sensor.a']), null);

// Pure: the share of the peak.
assert.deepEqual(E.peakShare(124, 310), { room: 124, peak: 310, pct: 40 }, '124 of 310 W: 40 %');
assert.deepEqual(E.peakShare(400, 310), { room: 400, peak: 400, pct: 100 }, 'above the stored peak: the peak is now, 100 %, never more');
assert.deepEqual(E.peakShare(0, 310), { room: 0, peak: 310, pct: 0 }, 'nothing drawn: empty ring');
assert.equal(E.peakShare(0, 0), null, 'never drawn anything and nothing now: no scale (plate)');
assert.equal(E.peakShare(null, 310), null, 'no value now: no ring');
assert.equal(E.peakShare(-50, 310), null, 'feeding in: no ring');
assert.equal(E.peakShare(100, null), null, 'no peak: no ring');

// The sensors asked for: the room's own sensor, else the parts with a power value (not the ones behind a plug).
const P = (v, u = 'W') => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'power', state_class: 'measurement' } });
assert.deepEqual(E.peakIds({ home: 'sensor.room' }, {}), ['sensor.room']);
const parts = { energy_entities: ['sensor.a', 'sensor.b', 'sensor.c', 'sensor.d'], energy_parent: { 'sensor.c': 'sensor.a' } };
assert.deepEqual(E.peakIds({ sum: parts }, { 'sensor.a': P(100), 'sensor.b': { state: 'unavailable', attributes: { unit_of_measurement: 'W' } },
  'sensor.c': P(20), 'sensor.d': { state: '5', attributes: { unit_of_measurement: 'kWh', device_class: 'energy' } } }), ['sensor.a', 'sensor.b'],
'parts: with a power value or offline; a device behind a plug and an energy meter stay out');

// The fetch: once per room and 5 minutes, W asked for, the stage kicked when it comes.
let asked = [], answer = null, fail = false;
const hass = { states: {}, callWS: (m) => { asked.push(m); return fail ? Promise.reject(new Error('x')) : Promise.resolve(answer); } };
const kicked = [];
window.casoraKick = (el) => kicked.push(el);
answer = { 'sensor.k1': [R(0, 300)], 'sensor.k2': [R(0, 10)] };
const el = {};
assert.equal(E.roomPeak(['sensor.k2', 'sensor.k1'], hass, el), 'wait', 'first call: waits');
assert.equal(E.roomPeak(['sensor.k1', 'sensor.k2'], hass, el), 'wait', 'second call while out: no second request');
assert.equal(asked.length, 1);
const m = asked[0];
assert.equal(m.type, 'recorder/statistics_during_period');
assert.equal(m.period, '5minute');
assert.deepEqual(m.types, ['max']);
assert.deepEqual(m.units, { power: 'W' }, 'kW sensors come as W');
assert.ok(Math.abs(Date.now() - 864e5 - Date.parse(m.start_time)) < 5000, 'the last 24 hours');
await new Promise((r) => setImmediate(r));
assert.deepEqual(kicked, [el], 'the stage is drawn again once');
assert.equal(E.roomPeak(['sensor.k1', 'sensor.k2'], hass, el), 310, 'then the peak, from the cache');
assert.equal(asked.length, 1);
fail = true;
assert.equal(E.roomPeak(['sensor.none'], hass, null), 'wait');
await new Promise((r) => setImmediate(r));
assert.equal(E.roomPeak(['sensor.none'], hass, null), null, 'request failed: no peak (plate)');
fail = false;
assert.equal(E.roomPeak([], hass, null), null, 'no sensors: no peak');
assert.equal(E.roomPeak(['sensor.k1'], { states: {} }, null), null, 'no connection: no peak');

// The stage: a dial with the peak, the plate without statistics.
const calls = [];
window._casoraUI = {
  stage: (t, o) => { calls.push({ t, o }); return '<stage ' + calls.length + '>'; },
  dialPct: (v, mn, mx) => Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)),
};
window.casoraEnergyHouse = () => null; // no house value (as with HA's energy settings without a grid power sensor)
// The line keeps „24 Std.“ and the value together (non-breaking spaces), it wraps only after the colon.
const NB = (t) => t.replace(/ (?=24|Std|W$|kW$)/g, '\u00a0');
const node = (txt) => ({ textContent: txt, hasAttribute: () => false });
const fakeSelf = () => {
  const nodes = { n: node(''), u: node(''), w: node(''), trend: node(''), dl: { painted: [] } };
  return { nodes, shadowRoot: { querySelector: (q) => (q === '.hui-st-n' ? nodes.n : q === '.hui-st-u' ? nodes.u
    : q === '.hui-stage .hui-dl .hui-st-w' ? nodes.w : q === '.hui-st-trend' ? nodes.trend : q === '.hui-stage .hui-dl' ? nodes.dl : null) } };
};
window._casoraUI.dialPaint = (e, pct) => e.painted.push(pct);
const C = { room: true, sum: { energy_entities: ['sensor.s1', 'sensor.s2'] } };
answer = { 'sensor.s1': [R(0, 200), R(3e5, 100)], 'sensor.s2': [R(0, 110), R(3e5, 5)] };
hass.states = { 'sensor.s1': P(100), 'sensor.s2': P(24) };
const self = fakeSelf();
E.stage3(C, hass.states, hass, self);
let o = calls.at(-1).o;
assert.equal(calls.at(-1).t, 'chart', 'S6 stage');
assert.ok(o.ring, 'while the peak loads: already the dial (no jump from plate to ring)');
assert.equal(o.trend, 'Jetzt');
flush();
assert.equal(self.nodes.dl.painted.at(-1), 0, 'empty ring while it loads');
await new Promise((r) => setImmediate(r));
const out = E.stage3(C, hass.states, hass, self);
flush();
assert.equal(self.nodes.n.textContent, '124', 'value stays the power now');
assert.equal(self.nodes.u.textContent, 'W');
assert.equal(self.nodes.w.textContent, NB('Spitze 24 Std.: 310 W'), 'the line names the scale');
assert.ok(Math.abs(self.nodes.dl.painted.at(-1) - 124 / 310 * 100) < 0.01, 'ring 124 of 310 W');
// Live: the room draws more than its peak – 100 %, the peak line follows.
hass.states = { 'sensor.s1': P(1.2, 'kW'), 'sensor.s2': P(24) };
assert.equal(E.stage3(C, hass.states, hass, self), out, 'no redraw while the popup is open');
flush();
assert.equal(self.nodes.dl.painted.at(-1), 100, 'never above 100 %');
assert.equal(self.nodes.w.textContent, NB('Spitze 24 Std.: 1,2 kW'));
// A fresh stage with the peak known: the ring is passed in the room's W.
E.stage3(C, { 'sensor.s1': P(100), 'sensor.s2': P(24) }, hass, fakeSelf());
o = calls.at(-1).o;
assert.deepEqual(o.ring, { min: 0, max: 310, value: 124 }, 'ring 0 … peak, filled with the room');
assert.equal(o.trend, NB('Spitze 24 Std.: 310 W'));
// No statistics for the room: the plate with „Jetzt“ as before.
const C2 = { room: true, home: 'sensor.nostats' };
answer = {};
E.stage3(C2, { 'sensor.nostats': P(50) }, hass, fakeSelf());
await new Promise((r) => setImmediate(r));
E.stage3(C2, { 'sensor.nostats': P(50) }, hass, fakeSelf());
o = calls.at(-1).o;
assert.ok(!o.ring && o.trend === 'Jetzt', 'no statistics: plate with „Jetzt“');
// Not a room (a device's power): plate, no request.
const n0 = asked.length;
E.stage3({ home: 'sensor.dev' }, { 'sensor.dev': P(50) }, hass, fakeSelf());
assert.ok(!calls.at(-1).o.ring && asked.length === n0, 'not a room: plate, nothing asked');
// The house known: its share wins, no peak asked.
window.casoraEnergyHouse = () => ({ ids: ['sensor.grid'], grid: ['sensor.grid'], solar: [], battery: [] });
E.stage3({ room: true, home: 'sensor.r9' }, { 'sensor.r9': P(100), 'sensor.grid': P(400) }, hass, fakeSelf());
assert.equal(calls.at(-1).o.trend, '25 % vom Haus', 'house share first');
assert.equal(asked.length, n0, 'no peak asked when the house is known');

// Every language has the line; the pattern matches the non-breaking line.
for (const l of ['en', 'fr', 'es', 'it', 'nl', 'pt', 'pl']) {
  const j = JSON.parse(fs.readFileSync(new URL(`../../custom_components/casora/translations/dashboard/phrases/${l}.json`, import.meta.url), 'utf8'));
  const p = Object.values(j).flat().find((x) => Array.isArray(x) && /^\^Spitze/.test(String(x[0])));
  assert.ok(p, `phrase „Spitze 24 Std.: …“ in ${l}.json`);
  const m = new RegExp(p[0]).exec(NB('Spitze 24 Std.: 2,9 kW'));
  assert.ok(m && m[1] === NB('2,9 kW'), `${l}: the pattern reads the line`);
  assert.ok(/\{1\}/.test(p[1]) && /24\u00a0/.test(p[1]), `${l}: value kept, „24 h“ not broken`);
}
console.log('energy_room_peak: ok');
process.exit(0);
