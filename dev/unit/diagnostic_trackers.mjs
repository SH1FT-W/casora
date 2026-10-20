// Issue #25: HA 2026.10 marks every device_tracker diagnostic (BaseTrackerEntity). The Studio left config/diagnostic
// entities out of its device lists, so the pet tile's "Pet" field stayed empty, a new pet tile found no tracker and
// "What should go on the dashboard?" offered no pet. For device_trackers the category says nothing: they are offered
// again (pet field, person badge field, new tile, device list, AI helper) and a tap opens their device page again
// (casoraRoute); other config/diagnostic entities (identify button, router LED switch or light) stay out where they
// did before and still open the measure page.
//   node dev/unit/diagnostic_trackers.mjs
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
assert.equal(typeof I.listCategory, 'function', 'shared helper exported');

// Minimal DOM for the AI helper row.
const mk = (tag) => {
  const el = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, textContent: '', className: '',
    appendChild(c) { el.children.push(c); return c; }, setAttribute: noop, addEventListener: noop };
  return el;
};
globalThis.document = { createElement: mk, querySelector: () => null, addEventListener: noop, removeEventListener: noop };

// ── A made-up house on HA 2026.10: every tracker is diagnostic ───────────────
const st = (id, state, attributes) => ({ entity_id: id, state, attributes: { friendly_name: id, ...attributes } });
const A = 'device_tracker.tracker_aaaa', B = 'device_tracker.tracker_bbbb';
const PHONE = 'device_tracker.phone_one', LAPTOP = 'device_tracker.laptop_two';
const LIGHT = 'light.hall', LED = 'light.router_status_led', IDENT = 'button.hall_sensor_identify', PING = 'button.hall_sensor_ping';
const LEDSW = 'switch.router_led', PLUG = 'switch.desk_plug', BATT = 'sensor.tracker_aaaa_battery', PERSON = 'person.alex';
const reg = (id, o) => ({ entity_id: id, ...o });
const entities = {
  [A]: reg(A, { device_id: 'hwA', platform: 'tractive', entity_category: 'diagnostic' }),
  [B]: reg(B, { device_id: 'hwB', platform: 'tractive', entity_category: 'diagnostic' }),
  [PHONE]: reg(PHONE, { device_id: 'phone', platform: 'mobile_app', entity_category: 'diagnostic' }),
  [LAPTOP]: reg(LAPTOP, { device_id: 'laptop', platform: 'router_x', entity_category: 'diagnostic' }),
  [BATT]: reg(BATT, { device_id: 'hwA', platform: 'tractive', entity_category: 'diagnostic' }),
  [LIGHT]: reg(LIGHT, { device_id: 'lamp', platform: 'hue' }),
  [LED]: reg(LED, { device_id: 'router', platform: 'router_x', entity_category: 'config' }),
  [LEDSW]: reg(LEDSW, { device_id: 'router', platform: 'router_x', entity_category: 'config' }),
  [PLUG]: reg(PLUG, { device_id: 'plug', platform: 'shelly' }),
  [IDENT]: reg(IDENT, { device_id: 'sensor', platform: 'zha', entity_category: 'config' }),
  [PING]: reg(PING, { device_id: 'sensor', platform: 'zha', entity_category: 'diagnostic' }),
  [PERSON]: reg(PERSON, { platform: 'person' }),
};
const devices = {
  hwA: { id: 'hwA', name: 'Tracker AAAA', manufacturer: 'Tractive GmbH' }, petA: { id: 'petA', name: 'Pet A', via_device_id: 'hwA' },
  hwB: { id: 'hwB', name: 'Tracker BBBB', manufacturer: 'Tractive GmbH' }, petB: { id: 'petB', name: 'Pet B', via_device_id: 'hwB' },
  phone: { id: 'phone', name: 'Phone One' }, laptop: { id: 'laptop', name: 'Laptop Two' }, router: { id: 'router', name: 'Router' },
  lamp: { id: 'lamp', name: 'Hall lamp' }, plug: { id: 'plug', name: 'Desk plug' }, sensor: { id: 'sensor', name: 'Hall sensor' },
};
const states = {
  [A]: st(A, 'home', { friendly_name: 'Tracker AAAA', source_type: 'gps' }),
  [B]: st(B, 'not_home', { friendly_name: 'Tracker BBBB', source_type: 'gps' }),
  [PHONE]: st(PHONE, 'home', { friendly_name: 'Phone One', source_type: 'gps' }),
  [LAPTOP]: st(LAPTOP, 'home', { friendly_name: 'Laptop Two', source_type: 'router' }),
  [BATT]: st(BATT, '80', { friendly_name: 'Tracker AAAA Battery', device_class: 'battery', unit_of_measurement: '%' }),
  [LIGHT]: st(LIGHT, 'on', { friendly_name: 'Hall' }),
  [LED]: st(LED, 'on', { friendly_name: 'Router status LED' }),
  [LEDSW]: st(LEDSW, 'on', { friendly_name: 'Router LED' }),
  [PLUG]: st(PLUG, 'off', { friendly_name: 'Desk plug' }),
  [IDENT]: st(IDENT, 'unknown', { friendly_name: 'Hall sensor Identify' }),
  [PING]: st(PING, 'unknown', { friendly_name: 'Hall sensor Ping' }),
  [PERSON]: st(PERSON, 'home', { friendly_name: 'Alex' }),
  'ai_task.helper': st('ai_task.helper', 'unknown', {}),
};
const hass = { states, entities, devices, areas: {}, language: 'en' };
window.casoraCommunityOn = new Set(['casora_pet']);
const room = { path: 'living', name: 'Living', tiles: [], variables: {} };
const panel = () => {
  const p = Object.create(P);
  p._hass = hass;
  p._state = { compact: { rooms: [{ path: 'home', name: 'Home', tiles: [], variables: {} }, room] } };
  p._room = 1;
  return p;
};
const pet = I.TILE_TYPES.find((t) => t.id === 'casora_pet');
const light = I.TILE_TYPES.find((t) => t.id === 'light');
assert.ok(pet && light, 'tile types');

// ── The helper ───────────────────────────────────────────────────────────────
{
  assert.equal(I.listCategory(A, entities[A]), null, 'a diagnostic tracker has no list category');
  assert.equal(I.listCategory(IDENT, entities[IDENT]), 'config', 'config button');
  assert.equal(I.listCategory(PING, entities[PING]), 'diagnostic', 'diagnostic button');
  assert.equal(I.listCategory(LIGHT, entities[LIGHT]), null, 'no category');
  assert.equal(I.listCategory(LIGHT, undefined), null, 'not in the registry');
  console.log('ok diagnostic trackers: helper');
}

// ── Entity fields: pet field and person badge field ──────────────────────────
{
  const p = panel();
  const all = P._rankedEntityList.call(p, pet.domains, pet.classes, room, '');
  assert.deepEqual([...all].sort(), [A, B, LAPTOP, PHONE].sort(), 'pet field: every tracker before the pet filter');
  // The inspector's pet filter (entOptions): only the Tractive trackers.
  assert.deepEqual(all.filter((e) => I.isPetTracker(hass, e)), [A, B], 'pet field lists both pets');
  const people = P._rankedEntityList.call(p, ['person', 'device_tracker'], null, room, '');
  assert.ok([PERSON, A, PHONE, LAPTOP].every((e) => people.includes(e)), 'person badge field lists people and trackers');
  // Other config/diagnostic entities still stay out; sensors and the current choice still stay in.
  assert.deepEqual(P._rankedEntityList.call(p, ['light'], null, room, ''), [LIGHT], 'router LED light stays out');
  assert.deepEqual(P._rankedEntityList.call(p, ['switch'], null, room, ''), [PLUG], 'config switch stays out');
  assert.deepEqual(P._rankedEntityList.call(p, ['button'], null, room, ''), [], 'identify and ping buttons stay out');
  assert.ok(P._rankedEntityList.call(p, ['button'], null, room, IDENT).includes(IDENT), 'the current choice stays');
  assert.ok(P._rankedEntityList.call(p, ['sensor'], null, room, '').includes(BATT), 'diagnostic sensor stays (battery)');
  console.log('ok diagnostic trackers: entity fields');
}

// ── New tile: the pet tile finds its trackers ────────────────────────────────
{
  const p = panel();
  const c = P._tileCandidates.call(p, pet, room);
  assert.deepEqual(c.map((x) => x.id), [A, B], 'both Tractive trackers, no phone');
  assert.ok(c[0].sure, 'a sure hit');
  assert.deepEqual(c.map((x) => x.name), ['Pet A', 'Pet B'], 'named like the pet');
  assert.deepEqual(P._tileCandidates.call(p, light, room).map((x) => x.id), [LIGHT], 'router LED is no light to suggest');
  console.log('ok diagnostic trackers: new tile');
}

// ── "What should go on the dashboard?" ───────────────────────────────────────
{
  const p = panel();
  const list = p._uxDevices();
  const of = (id) => list.find((x) => x.entity === id) || null;
  assert.deepEqual([A, B].map((id) => of(id) && [of(id).type, of(id).name]), [['casora_pet', 'Pet A'], ['casora_pet', 'Pet B']],
    'both pets offered as pet trackers');
  assert.equal(of(PHONE), null, 'a phone is no pet');
  assert.ok(of(LIGHT) && of(PLUG), 'plain devices offered');
  assert.deepEqual([LED, LEDSW, IDENT, PING].filter(of), [], 'config/diagnostic light, switch and buttons stay out');
  console.log('ok diagnostic trackers: device list');
}

// ── "Complete with AI": the trackers are candidates for the pet tile ─────────
{
  const p = panel();
  let sent = null;
  p._hass = { ...hass, callWS: async (msg) => { sent = msg; return { response: { data: {} } }; } };
  const body = mk('div');
  // A tile without a device: the AI looks for the main entity among the type's domains.
  window.casoraTileExtras(p, { type: { ...pet, domains: ['device_tracker', 'button'] }, tile: { entity: '', name: '' }, body });
  const btn = body.children[0].children[1];
  assert.equal(btn.tagName, 'BUTTON');
  await btn.onclick();
  const text = sent && sent.sequence[0].data.instructions;
  assert.ok(text, 'asked the AI');
  const cands = text.split('Kandidaten (entity_id')[1].split('\n').slice(1).map((l) => l.split(' | ')[0]);
  assert.ok([A, B, PHONE, LAPTOP].every((e) => cands.includes(e)), 'every tracker is a candidate');
  assert.ok(cands.includes(IDENT), 'config button as before');
  assert.ok(!cands.includes(PING), 'diagnostic button stays out');
  console.log('ok diagnostic trackers: AI helper');
}

// ── Tapping a tracker (phone row in the person popup): device page, not measure page ──
{
  globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: noop };
  new Function(read('custom_components/casora/scripts/local/18-ziele.js'))();
  const Z = window._casoraZiele;
  let opened = null;
  Z.openMeasure = () => { opened = 'measure'; return true; };
  Z.openDevice = () => { opened = 'device'; return true; };
  const route = (id) => { opened = null; window.casoraRoute(id, {}); return opened; };
  assert.equal(route(PHONE), 'device', 'diagnostic phone tracker opens its device page');
  assert.equal(route(A), 'device', 'diagnostic pet tracker opens its device page');
  assert.equal(route(IDENT), 'measure', 'config button keeps the measure page');
  assert.equal(route(PING), 'measure', 'diagnostic button keeps the measure page');
  assert.equal(route(BATT), 'measure', 'sensor keeps the measure page');
  console.log('ok diagnostic trackers: tap');
}
