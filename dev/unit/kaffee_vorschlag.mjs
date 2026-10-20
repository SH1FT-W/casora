// A new coffee tile suggests only coffee machines: the anchors of casora-panel-b-ux.js coffeeAnchors (Home Connect,
// De'Longhi, Jura …, and the power-curve integrations delonghi/krups found by their keys learning + last_program).
// Before, any sensor, switch or select was a candidate (555 in the test house) and "Which device should the tile show?"
// offered temperature sensors and plugs. Without a coffee machine there is nothing to suggest.
//   node dev/unit/kaffee_vorschlag.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};

// ── Load the real panel class, then the device list module ───────────────────
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
assert.ok(Panel, 'panel class');
// The device list ("What should go on the dashboard?") extends the panel once it is defined.
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-b-ux.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;
assert.equal(typeof P._uxDevices, 'function', 'device list loaded');
const I = window.__casoraPanelInternals;

// Minimal DOM for the AI helper row.
const mk = (tag) => {
  const el = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, textContent: '', className: '',
    appendChild(c) { el.children.push(c); return c; }, setAttribute: noop, addEventListener: noop };
  return el;
};
globalThis.document = { createElement: mk, querySelector: () => null, addEventListener: noop, removeEventListener: noop };

// ── A made-up house on HA 2026.10: every tracker is diagnostic ───────────────

// ── A made-up house: two power-curve machines, a Home Connect coffee machine and a washer, plus noise ──
const st = (id, state, attributes) => ({ entity_id: id, state, attributes: { friendly_name: id, ...attributes } });
const reg = (id, device_id, platform, translation_key, extra) => ({ entity_id: id, device_id, platform, translation_key, ...extra });
const entities = {}, states = {};
const add = (id, state, dev, platform, key, attrs, extra) => {
  entities[id] = reg(id, dev, platform, key, extra);
  states[id] = st(id, state, attrs || {});
};
// De'Longhi (own integration): status sensor, learning progress, last program.
add('sensor.machine_one_status', 'ready', 'dl', 'delonghi', 'status');
add('sensor.machine_one_learning', '80', 'dl', 'delonghi', 'learning', {}, { entity_category: 'diagnostic' });
add('sensor.machine_one_last_program', 'Espresso', 'dl', 'delonghi', 'last_program');
// Krups (same integration family, other domain): no power switch, no counters.
add('sensor.machine_two_status', 'off', 'kr', 'krups', 'status');
add('sensor.machine_two_learning', '0', 'kr', 'krups', 'learning', {}, { entity_category: 'diagnostic' });
add('sensor.machine_two_last_program', 'unknown', 'kr', 'krups', 'last_program');
// Home Connect coffee machine and washer: same integration, only the coffee keys make the coffee machine.
add('sensor.machine_three_operation_state', 'ready', 'hc', 'home_connect', 'operation_state');
add('sensor.machine_three_bean_amount', 'normal', 'hc', 'home_connect', 'bean_amount');
add('switch.machine_three_power', 'on', 'hc', 'home_connect', 'power');
add('sensor.washer_operation_state', 'ready', 'wash', 'home_connect', 'operation_state');
add('switch.washer_power', 'on', 'wash', 'home_connect', 'power');
// Noise that used to be suggested: thermometers, plugs, selects.
for (let i = 0; i < 40; i++) add(`sensor.room_${i}_temperature`, '21', 'th' + i, 'zha', null, { device_class: 'temperature' });
for (let i = 0; i < 10; i++) add(`switch.plug_${i}`, 'off', 'plug' + i, 'shelly', null);
add('select.mode', 'auto', 'thermo', 'tado', 'mode', { options: ['auto', 'manual'] });
const devices = { dl: { id: 'dl', name: 'Machine One' }, kr: { id: 'kr', name: 'Machine Two' }, hc: { id: 'hc', name: 'Machine Three' },
  wash: { id: 'wash', name: 'Washer' } };
Object.keys(entities).forEach((id) => { const d = entities[id].device_id; if (!devices[d]) devices[d] = { id: d, name: d }; });
const hass = { states, entities, devices, areas: {}, language: 'en' };
window.casoraCommunityOn = new Set(['casora_coffee']);
const room = { path: 'kitchen', name: 'Kitchen', tiles: [], variables: {} };
const panel = (h) => {
  const p = Object.create(P);
  p._hass = h;
  p._state = { compact: { rooms: [{ path: 'home', name: 'Home', tiles: [], variables: {} }, room] } };
  p._room = 1;
  return p;
};
const coffee = I.TILE_TYPES.find((t) => t.id === 'casora_coffee');
assert.ok(coffee, 'coffee tile type');

// ── Suggestions: the three coffee machines, nothing else ─────────────────────
{
  assert.equal(typeof window.__casoraCoffeeAnchors, 'function', 'coffee anchors shared with the panel');
  const c = P._tileCandidates.call(panel(hass), coffee, room);
  assert.deepEqual(c.map((x) => x.id).sort(),
    ['sensor.machine_one_status', 'sensor.machine_three_operation_state', 'sensor.machine_two_status'],
    'De\'Longhi, Krups and the Home Connect coffee machine, no washer, thermometer or plug');
  assert.ok(c.every((x) => x.sure), 'a found coffee machine is a sure match');
  console.log('ok coffee suggestions: only coffee machines');
}

// ── No coffee machine: nothing to suggest (the tile is added without a device) ──
{
  const noCoffee = { ...hass, states: {}, entities: {} };
  Object.keys(states).filter((id) => !/machine_/.test(id)).forEach((id) => {
    noCoffee.states[id] = states[id];
    noCoffee.entities[id] = entities[id];
  });
  assert.deepEqual(P._tileCandidates.call(panel(noCoffee), coffee, room), [], 'no coffee machine, no suggestion');
  console.log('ok coffee suggestions: none without a coffee machine');
}
console.log('ok kaffee_vorschlag');
