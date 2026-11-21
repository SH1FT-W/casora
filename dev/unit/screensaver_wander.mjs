// @deckt: custom_components/casora/scripts/local/46-screensaver.js#mount,driftStep,wanders,vars
// Screensaver wander against burn-in (#230, 46-screensaver.js): the step of a few pixels must never come in the call
// that changes the clock's digits (it stepped every 20 s from :00, so every minute change moved the whole layout), and
// the Studio switch casora_screensaver_wander turns it off (default on).
//   node dev/unit/screensaver_wander.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
let clock = Date.parse('2026-11-22T10:00:00');
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}
const timers = [];
const doc = { getElementById: () => ({}), querySelector: () => null, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, document: doc, console, Intl, Date: FakeDate, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array,
  setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval() {}, location: { search: '?casora_saver=0', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;

// A host whose content is one element that keeps its custom properties (a repaint makes a new element).
const makeHost = () => {
  const h = { isConnected: true, firstElementChild: null, getRootNode() { return doc; }, _html: '' };
  Object.defineProperty(h, 'innerHTML', { get() { return h._html; }, set(v) {
    h._html = v;
    const props = {};
    h.firstElementChild = v ? { props, style: { setProperty(k, x) { props[k] = x; }, removeProperty(k) { delete props[k]; } } } : null;
  } });
  return h;
};
const digits = (h) => (h._html.match(/class="cs-time">([^<]*)</) || [])[1];
const offset = (h) => { const p = (h.firstElementChild || {}).props || {}; return (p['--cs-dx'] || '') + '|' + (p['--cs-dy'] || ''); };
const ctx = (vars) => () => ({ hass: { locale: { time_format: '24' }, states: {}, themes: {} }, vars: vars || {}, sun: null, wx: null, rooms: [] });

// Runs the mount's own timer at the given gaps and reports, per call, whether the digits and the offset changed.
const run = (start, gaps, vars) => {
  clock = start;
  const host = makeHost(), n0 = timers.length;
  const live = S.mount(host, 'himmel', { drift: () => S.wanders(vars || {}), every: 5000, context: ctx(vars) });
  const tick = timers[n0];
  let d = digits(host), o = offset(host), both = 0, steps = 0, minutes = 0;
  for (const g of gaps) {
    clock += g;
    tick();
    const d2 = digits(host), o2 = offset(host);
    if (d2 !== d) minutes++;
    if (o2 !== o) steps++;
    if (d2 !== d && o2 !== o) both++;
    d = d2; o = o2;
  }
  live.destroy();
  return { both, steps, minutes, last: o };
};

// The tablet's five-second timer, started at every phase of the minute: one hour each.
for (let phase = 0; phase < 60000; phase += 250) {
  const r = run(Date.parse('2026-11-22T10:00:00') + phase, Array(720).fill(5000));
  assert.equal(r.minutes, 60, 'the digits change once a minute');
  assert.equal(r.both, 0, 'phase ' + phase + ' ms: no step in the call that changes the digits');
  assert.ok(r.steps >= 170, 'it still wanders: about three steps a minute (' + r.steps + ')');
}
// A throttled or stalled timer (gaps up to 70 s) may skip a step's moment, but still never moves with the digits.
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gaps = Array.from({ length: 4000 }, () => 500 + Math.floor(rnd() * 70000));
  const r = run(Date.parse('2026-11-22T10:00:03'), gaps);
  assert.ok(r.minutes > 1000 && r.steps > 300, 'digits and steps both happened');
  assert.equal(r.both, 0, 'irregular timer: no step in the call that changes the digits');
}
// The step's moments are :10, :30 and :50, and the four-second glide (the stylesheet's transition) ends before :00.
assert.match(S.CSS, /\.cs-in\{[^}]*transition:transform 4s/, 'the glide takes four seconds');
for (let s = 0; s < 60; s++) {
  const a = S.driftStep(Date.parse('2026-11-22T10:00:00') + s * 1000 - 1), b = S.driftStep(Date.parse('2026-11-22T10:00:00') + s * 1000);
  assert.equal(a !== b, [10, 30, 50].includes(s), 'second ' + s);
}
// A step is seen at the latest one timer period after its moment, then glides: 50 s + 5 s + 4 s is before the minute ends.
assert.ok((S.DRIFT_AT + 2 * S.DRIFT_EVERY) % 60000 + 5000 + 4000 < 60000 && 60000 % S.DRIFT_EVERY === 0);

// The Studio switch: on by default, off only when stored as false; the dashboard's settings carry it.
assert.deepEqual([S.wanders({}), S.wanders(null), S.wanders({ casora_screensaver_wander: true }), S.wanders({ casora_screensaver_wander: false }), S.wanders({ casora_screensaver_wander: 'false' })],
  [true, true, true, false, false]);
assert.equal(S.vars({ views: [{ cards: [{ variables: { casora_screensaver_wander: false } }] }] }).casora_screensaver_wander, false, 'read from the hero card');
{
  const off = run(Date.parse('2026-11-22T10:00:00'), Array(240).fill(5000), { casora_screensaver_wander: false });
  assert.equal(off.steps, 0, 'switched off: nothing moves');
  assert.equal(off.last, '|', 'switched off: no offset at all');
}
// Switched off while the screensaver is up: the offset goes away.
{
  clock = Date.parse('2026-11-22T10:00:00');
  const vars = {}, host = makeHost(), n0 = timers.length;
  const live = S.mount(host, 'himmel', { drift: () => S.wanders(vars), every: 5000, context: ctx(vars) });
  assert.notEqual(offset(host), '|', 'on: an offset');
  vars.casora_screensaver_wander = false;
  clock += 5000; timers[n0]();
  assert.equal(offset(host), '|', 'off: back in place');
  live.destroy();
}
console.log('ok screensaver_wander');
