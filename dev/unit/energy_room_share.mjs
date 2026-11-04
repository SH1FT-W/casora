// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#houseShare,houseIds,stage3,build
// Room energy popup (owner decision 04.11.2026, variant B): the stage is a dial whose ring is the room's share of the
// house's consumption now („155 W“, „18 % vom Haus“). The house is HA's energy settings (casoraEnergyHouse). Without a
// house value the plate stays as before; the ring follows room and house live (UI.dialPaint, no redraw); never above
// 100 %; the house popup keeps its flow stage.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
let timers = [];
globalThis.setTimeout = (fn) => { timers.push(fn); return 0; };
const flush = () => { const t = timers; timers = []; t.forEach((f) => f()); };
new Function(src)();
const E = window._casoraSoftEnergy;
assert.equal(typeof E.houseShare, 'function', 'E.houseShare missing');

const P = (v, u = 'W') => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'power' } });
// The house from HA's energy settings (00-finder.js casoraEnergyHouse): grid + solar.
let prefs = true;
window.casoraEnergyHouse = (h) => (prefs && h ? { ids: ['sensor.qa_grid', 'sensor.qa_pv'], grid: ['sensor.qa_grid'], solar: ['sensor.qa_pv'], battery: [] } : null);
const hass = { states: {} };
const S = (o) => { hass.states = o; return o; };

// Pure share.
const C = { home: 'sensor.qa_room', room: true };
let st = S({ 'sensor.qa_room': P(155), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
let sh = E.houseShare(C, st, hass, 155);
assert.deepEqual(sh, { room: 155, house: 860, pct: 18 }, 'room 155 W of a house of 860 W: 18 %');
st = S({ 'sensor.qa_room': P(1.2, 'kW'), 'sensor.qa_grid': P(1.5, 'kW'), 'sensor.qa_pv': P(500) });
assert.equal(E.houseShare(C, st, hass, 1200).pct, 60, 'kW and W mixed: 1,2 kW of 2 kW');
st = S({ 'sensor.qa_room': P(900), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
assert.deepEqual(E.houseShare(C, st, hass, 900), { room: 860, house: 860, pct: 100 }, 'room above the house: clamped to 100 %');
st = S({ 'sensor.qa_room': P(100), 'sensor.qa_grid': P(400), 'sensor.qa_pv': { state: 'unavailable', attributes: { unit_of_measurement: 'W' } } });
assert.equal(E.houseShare(C, st, hass, 100).pct, 25, 'a sleeping inverter counts as 0 W');
st = S({ 'sensor.qa_room': P(100), 'sensor.qa_grid': { state: 'unavailable', attributes: {} }, 'sensor.qa_pv': P(300) });
assert.equal(E.houseShare(C, st, hass, 100), null, 'grid without a value: no house, no ring');
assert.equal(E.houseShare(C, st, hass, null), null, 'room without a value: no ring');
st = S({ 'sensor.qa_room': P(100), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
assert.equal(E.houseShare(C, st, hass, -300), null, 'a room feeding in: no ring');
assert.equal(E.houseShare({ home: 'sensor.qa_room' }, st, hass, 100), null, 'not a room (house or device popup): no ring');
assert.equal(E.houseShare({ home: 'sensor.qa_grid', room: true }, st, hass, 560), null, 'the room\'s own sensor is the house\'s grid meter: no ring');
prefs = false;
assert.equal(E.houseShare(C, st, hass, 100), null, 'no energy settings: no ring');
prefs = true;

// The stage: a dial with the share, else the plate.
const calls = [];
window._casoraUI = {
  // Like the real dial, every build differs (its SVG filter gets a new id).
  stage: (t, o) => { calls.push({ t, o }); return '<stage ' + calls.length + '>'; },
  dialPct: (v, mn, mx) => Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)),
};
const node = (txt) => ({ textContent: txt, hasAttribute: () => false });
const fakeSelf = () => {
  const nodes = { n: node('155'), u: node('W'), w: node('18 % vom Haus'), trend: node('Jetzt'), dl: { painted: [] } };
  return { nodes, shadowRoot: { querySelector: (q) => (q === '.hui-st-n' ? nodes.n : q === '.hui-st-u' ? nodes.u
    : q === '.hui-stage .hui-dl .hui-st-w' ? nodes.w : q === '.hui-st-trend' ? nodes.trend : q === '.hui-stage .hui-dl' ? nodes.dl : null) } };
};
window._casoraUI.dialPaint = (el, pct) => el.painted.push(pct);
const self = fakeSelf();
st = S({ 'sensor.qa_room': P(155), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
const out1 = E.stage3(C, st, hass, self);
let o = calls.at(-1).o;
assert.equal(calls.at(-1).t, 'chart', 'S6 stage');
assert.deepEqual([o.value, o.unit, o.trend], ['155', 'W', '18 % vom Haus'], 'value stays „155 W“, the sub line says the share');
assert.deepEqual(o.ring, { min: 0, max: 860, value: 155 }, 'ring 0 … house, filled with the room');
const html1 = JSON.stringify(o);
flush();

// Live: the room and the house change – the stage's HTML stays, the ring and the line follow.
st = S({ 'sensor.qa_room': P(430), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
assert.equal(E.stage3(C, st, hass, self), out1, 'no redraw while the popup is open: the same HTML (the chart under the wheel stays)');
assert.equal(JSON.stringify(calls.at(-1).o), html1);
flush();
assert.equal(self.nodes.n.textContent, '430', 'number follows');
assert.equal(self.nodes.w.textContent, '50 % vom Haus', 'share line follows');
assert.equal(self.nodes.dl.painted.at(-1), 50, 'ring painted to 50 %');
st = S({ 'sensor.qa_room': P(430), 'sensor.qa_grid': P(1420), 'sensor.qa_pv': P(300) });
E.stage3(C, st, hass, self); flush();
assert.equal(self.nodes.w.textContent, '25 % vom Haus', 'the house rises: the share falls');
assert.equal(self.nodes.dl.painted.at(-1), 25, 'ring follows the house');
st = S({ 'sensor.qa_room': P(2000), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) });
E.stage3(C, st, hass, self); flush();
assert.equal(self.nodes.dl.painted.at(-1), 100, 'never above 100 %');
assert.equal(self.nodes.w.textContent, '100 % vom Haus');

// The house value goes: the plate as before (drawn anew once), „Jetzt“ under the number.
st = S({ 'sensor.qa_room': P(155), 'sensor.qa_grid': { state: 'unavailable', attributes: {} }, 'sensor.qa_pv': P(300) });
E.stage3(C, st, hass, self);
o = calls.at(-1).o;
assert.ok(!o.ring, 'no house value: no ring (plate)');
assert.equal(o.trend, 'Jetzt');
// Without energy settings from the start: plate.
prefs = false;
E.stage3(C, S({ 'sensor.qa_room': P(155) }), hass, fakeSelf());
assert.ok(!calls.at(-1).o.ring && calls.at(-1).o.trend === 'Jetzt', 'no energy settings: plate with „Jetzt“');
prefs = true;
// Not a room (a device's or the house's power without a flow): plate.
E.stage3({ home: 'sensor.qa_room' }, S({ 'sensor.qa_room': P(155), 'sensor.qa_grid': P(560), 'sensor.qa_pv': P(300) }), hass, fakeSelf());
assert.ok(!calls.at(-1).o.ring, 'not a room: plate');

// Build: a room (sensor with an area, or the sum of its devices) is marked and its stage watches the house's sensors;
// the house popup is never a room.
assert.ok(/if \(!house && !fs && \(ctx\.powerId \|\| parts\)\) C\.room = true;/.test(src), 'room marked in E.build');
assert.ok(/C\.room \? E\.houseIds\(ctx\.hass\) : \[\]/.test(src), 'stage watches the house sensors (w3)');
assert.deepEqual(E.houseIds(hass), ['sensor.qa_grid', 'sensor.qa_pv']);
assert.ok(/ring: memo\.sh \? \{ min: 0, max: memo\.sh\.house, value: memo\.sh\.room \} : null/.test(src), 'stage passes the ring');
// The dial reads the ring's own value (r6.value) when the shown value is in another unit („1,2 kW“).
assert.ok(/dialPct\(r6\.value != null \? r6\.value : parseFloat/.test(core), 'casora-core S6 dial: r6.value');
// English.
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const pat = Object.values(en).find((v) => Array.isArray(v) && v.some((p) => p[0] === '^(\\d+) % vom Haus$'));
assert.ok(pat, 'phrase „{n} % vom Haus“ in en.json');
console.log('energy_room_share: ok');
process.exit(0);
