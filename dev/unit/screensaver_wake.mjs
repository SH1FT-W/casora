// @deckt: custom_components/casora/scripts/local/46-screensaver.js#wakeEntity,wakeScreen,wakePhase,wakeMsg,screenSwitch,nightSpot,nightHtml,wake,wakeNow,_wakeSync,vars
// Wake on presence (46-screensaver.js): a binary_sensor picked in the Studio (casora_screensaver_wake) ends the
// screensaver when it turns on. By day Home shows, at night (22–5) only a dimmed clock. One subscribe_entities
// subscription for that sensor, none while nothing is picked or on a phone; the outside API is
// window.casoraScreensaver.wake(reason).
//   node dev/unit/screensaver_wake.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SRC = read('custom_components/casora/scripts/local/46-screensaver.js');
let clock = Date.parse('2026-11-22T14:00:00');
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}

// A small page: one dashboard (hui-root), a hass with a connection that records subscriptions.
const boot = ({ search = '?casora_saver=1', tablet = false, vars = {} } = {}) => {
  const subs = [], calls = [], pushed = [], timers = [];
  const el = () => {
    const e = { style: {}, children: [], attrs: {}, isConnected: true, innerHTML: '', removed: false,
      appendChild(c) { e.children.push(c); return c; }, addEventListener() {}, setAttribute(k, v) { e.attrs[k] = v; },
      remove() { e.removed = true; }, querySelector: () => null, querySelectorAll: () => [], getRootNode: () => doc, firstElementChild: null };
    return e;
  };
  const conn = {
    subscribeMessage(cb, msg) {
      const s = { cb, msg, closed: false };
      subs.push(s);
      return Promise.resolve(() => { s.closed = true; });
    },
  };
  const hass = { states: { 'binary_sensor.hall_motion': { state: 'off', attributes: {} }, 'switch.tab_screen': { state: 'off', attributes: {} } },
    entities: { 'switch.tab_screen': { platform: 'fully_kiosk', translation_key: 'screen_on' } }, devices: {}, locale: { time_format: '24' }, themes: {},
    connection: conn, callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); } };
  const cfg = { views: [{ path: 'home', cards: [{ variables: Object.assign({ casora_screensaver_kind: 'wort' }, vars) }] }, { path: 'kitchen', cards: [] }] };
  const rootEl = { isConnected: true, lovelace: { editMode: false, config: cfg } };
  const doc = { nodeType: 9, hidden: false, body: el(), head: el(), getElementById: () => null, createElement: el, addEventListener() {},
    querySelector: (t) => (t === 'hui-root' ? rootEl : t === 'home-assistant' ? { hass } : null), querySelectorAll: () => [] };
  const loc = { search, pathname: '/casora-dash/kitchen' };
  const win = { matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() {}, casoraIsWallTablet: () => tablet };
  win.document = doc;
  const box = { window: win, document: doc, console, Intl, Date: FakeDate, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array, Promise,
    setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval() {}, setTimeout: () => 0, clearTimeout() {}, location: loc,
    history: { pushState: (s, t, u) => { pushed.push(u); loc.pathname = u; } }, CustomEvent: class { constructor(type) { this.type = type; } } };
  vm.createContext(box);
  vm.runInContext(SRC, box);
  const loop = timers[timers.length - 1];
  return { S: win._casoraSaver, win, cfg, hass, subs, calls, pushed, loop, loc };
};
const tick = () => new Promise((ok) => setImmediate(ok));

// Pure pieces.
{
  const { S } = boot({ search: '?casora_saver=0' });
  assert.equal(S.wakeEntity({}), '', 'nothing picked: off');
  assert.equal(S.wakeEntity({ casora_screensaver_wake: 'binary_sensor.hall_motion' }), 'binary_sensor.hall_motion');
  assert.equal(S.wakeEntity({ casora_screensaver_wake: 'light.hall' }), '', 'only binary sensors');
  assert.equal(S.wakeScreen({}), true, 'screen on by default');
  assert.equal(S.wakeScreen({ casora_screensaver_wake_screen: false }), false);
  assert.deepEqual([4, 5, 10, 11, 16, 17, 21, 22, 23, 0].map(S.wakePhase),
    ['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night', 'night']);
  const id = 'binary_sensor.hall_motion';
  assert.equal(S.wakeMsg({ a: { [id]: { s: 'off', a: {} } } }, id), 'off', 'first message: the current state');
  assert.equal(S.wakeMsg({ c: { [id]: { '+': { s: 'on', lc: 1 } } } }, id), 'on', 'a change');
  assert.equal(S.wakeMsg({ c: { [id]: { '+': { a: { x: 1 } } } } }, id), null, 'attributes only: no state');
  assert.equal(S.wakeMsg({ r: [id] }, id), 'unavailable');
  assert.equal(S.wakeMsg({ c: { 'binary_sensor.other': { '+': { s: 'on' } } } }, id), null);
  // Fully Kiosk's screen switch: the only one; with several the one in the sensor's area; none = leave it.
  const ent = (area, extra) => Object.assign({ platform: 'fully_kiosk', translation_key: 'screen_on', area_id: area }, extra);
  const st = { 'switch.a_screen': { state: 'off' }, 'switch.b_screen': { state: 'off' }, [id]: { state: 'off' } };
  assert.equal(S.screenSwitch({ entities: { 'switch.a_screen': ent('hall') }, states: st }, id), 'switch.a_screen');
  assert.equal(S.screenSwitch({ entities: { 'switch.a_screen': ent('hall'), 'switch.b_screen': ent('kitchen'), [id]: { area_id: 'kitchen' } }, states: st }, id), 'switch.b_screen');
  assert.equal(S.screenSwitch({ entities: { 'switch.a_screen': ent('hall'), 'switch.b_screen': ent('kitchen') }, states: st }, id), null, 'several, none in the room: none');
  assert.equal(S.screenSwitch({ entities: { 'switch.a_screen': { platform: 'other' } }, states: st }, id), null, 'not Fully Kiosk');
  assert.equal(S.screenSwitch(null, id), null);
  // The night clock: the time only, dim; it moves every ten minutes, not between.
  const t0 = Date.parse('2026-11-22T23:00:00');
  const h = S.nightHtml(new Date(t0 + 7 * 60000), { locale: { time_format: '24' } });
  assert.match(h, />23:07</);
  assert.match(h, /opacity:\.3/);
  assert.deepEqual(S.nightSpot(t0), S.nightSpot(t0 + 9 * 60000), 'stands still within ten minutes');
  assert.notDeepEqual(S.nightSpot(t0), S.nightSpot(t0 + 10 * 60000), 'moves after ten');
  assert.equal(S.vars({ views: [{ cards: [{ variables: { casora_screensaver_wake: id, casora_screensaver_wake_screen: false } }] }] }).casora_screensaver_wake_screen, false);
}

// Nothing picked: no subscription at all (idle cost zero).
{
  const p = boot();
  p.loop(); p.loop();
  assert.equal(p.subs.length, 0, 'no pick, no subscription');
  assert.equal(typeof p.win.casoraScreensaver.wake, 'function', 'outside API');
  assert.equal(p.win.casoraScreensaver.wake('doorbell'), false, 'nothing on show');
}

// A phone (not a wall tablet, no ?casora_saver=1): never subscribes.
{
  const p = boot({ search: '', tablet: false, vars: { casora_screensaver_wake: 'binary_sensor.hall_motion' } });
  p.loop();
  assert.equal(p.subs.length, 0, 'phone: no subscription');
}

// A wall tablet with a pick: one subscription for that entity only; by day the saver ends and Home shows.
{
  const p = boot({ search: '', tablet: true, vars: { casora_screensaver_wake: 'binary_sensor.hall_motion' } });
  p.loop(); p.loop();
  await tick();
  assert.equal(p.subs.length, 1, 'exactly one subscription, also after more ticks');
  assert.deepEqual(JSON.parse(JSON.stringify(p.subs[0].msg)), { type: 'subscribe_entities', entity_ids: ['binary_sensor.hall_motion'] });
  const fire = (s) => p.subs[0].cb(s === 'a' ? { a: { 'binary_sensor.hall_motion': { s: 'on' } } } : { c: { 'binary_sensor.hall_motion': { '+': { s } } } });
  // The first message is the current state: on already, nothing wakes.
  p.S.show(p.cfg);
  fire('a');
  assert.equal(p.S.shown(), true, 'the current state wakes nothing');
  fire('off');
  fire('on');
  assert.equal(p.S.shown(), false, 'off → on ends the screensaver');
  assert.deepEqual([...p.pushed], ['/casora-dash/home'], 'and goes to Home');
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [['switch', 'turn_on', { entity_id: 'switch.tab_screen' }]], 'Fully Kiosk screen on');
  assert.equal(p.S._lastWake.reason, 'presence');
  // The sensor stays on: no new edge, nothing happens.
  fire('on');
  assert.equal(p.pushed.length, 1, 'on → on is no new wake');
  // Night: a dimmed clock instead of the dashboard.
  clock = Date.parse('2026-11-22T23:30:00');
  fire('off');
  fire('on');
  assert.equal(p.S.shown(), true, 'at night the night clock shows');
  p.loop();
  assert.equal(p.S.shown(), true, 'stays through the idle loop (no screensaver time needed)');
  fire('off'); fire('on');
  assert.equal(p.S.shown(), true, 'a second wake keeps the night clock');
  assert.equal(p.win.casoraScreensaver.wake('doorbell'), true, 'the outside wake ends it');
  assert.equal(p.S.shown(), false);
  // The pick goes: the subscription ends, nothing new.
  p.cfg.views[0].cards[0].variables.casora_screensaver_wake = '';
  p.loop();
  assert.equal(p.subs[0].closed, true, 'unsubscribed');
  assert.equal(p.subs.length, 1);
}

// The screen switch is left alone when the Studio switch is off.
{
  clock = Date.parse('2026-11-22T09:00:00');
  const p = boot({ search: '', tablet: true, vars: { casora_screensaver_wake: 'binary_sensor.hall_motion', casora_screensaver_wake_screen: false } });
  p.loop();
  await tick();
  p.S.show(p.cfg);
  p.subs[0].cb({ a: { 'binary_sensor.hall_motion': { s: 'off' } } });
  p.subs[0].cb({ c: { 'binary_sensor.hall_motion': { '+': { s: 'on' } } } });
  assert.equal(p.S.shown(), false, 'morning: woken');
  assert.equal(p.calls.length, 0, 'screen switch untouched');
}
console.log('screensaver_wake: ok');
