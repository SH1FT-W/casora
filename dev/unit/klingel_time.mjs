// Doorbell time-check lifecycle without HA, images, real timers or garbage collection.
// @deckt: custom_components/casora/scripts/local/24-klingel.js#KL.timeCheck
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/24-klingel.js', import.meta.url), 'utf8');
function setup() {
  const intervals = new Map(), refs = [];
  let serial = 0, draws = 0, kicks = 0, failKick = false;
  let output = { value: 'ring', needed: true };
  const document = { visibilityState: 'visible', querySelector: () => null, addEventListener() {} };
  // Explicit dereference control tests ownership deterministically, not GC timing.
  class Ref {
    constructor(card) { this.target = card; refs.push(this); }
    deref() { return this.target; }
  }
  const context = { document, console, Date, WeakRef: Ref,
    setInterval(fn, delay) { assert.equal(delay, 10000); intervals.set(++serial, fn); return serial; },
    clearInterval(id) { assert.ok(intervals.delete(id), 'clear the registered interval'); },
    casoraKick(card) {
      kicks++;
      if (failKick) throw new Error('injected render failure');
      register(card); // Only the real render confirms the displayed value.
    } };
  context.window = context;
  vm.runInNewContext(source, context);
  const KL = context._casoraKlingel;
  const card = { isConnected: true, getClientRects: () => [{}] };
  const draw = (target) => { assert.equal(target, card); draws++; return output; };
  const register = (target = card) => KL.timeCheck(target, draw, output.value, output.needed);
  return { KL, card, document, refs, intervals, register,
    tick() { for (const fn of [...intervals.values()]) fn(); },
    output(value, needed = true) { output = { value, needed }; },
    fail(value) { failKick = value; },
    get draws() { return draws; }, get kicks() { return kicks; } };
}

test('unchanged output does not redraw or multiply timers', () => {
  const h = setup(); h.register(); h.register(); h.tick(); h.tick();
  assert.equal(h.intervals.size, 1);
  assert.equal(h.draws, 2);
  assert.equal(h.kicks, 0);
});

test('hidden page skips draws and catches up when visible', () => {
  const h = setup(); h.register(); h.document.visibilityState = 'hidden';
  h.output('aged ring'); h.tick();
  assert.equal(h.draws, 0); assert.equal(h.kicks, 0);
  h.document.visibilityState = 'visible'; h.tick();
  assert.equal(h.kicks, 1);
  h.tick(); assert.equal(h.kicks, 1, 'confirmed output stays quiet');
});

test('disconnection clears the interval even on a hidden page', () => {
  const h = setup(); h.register(); h.document.visibilityState = 'hidden';
  h.card.isConnected = false; h.tick();
  assert.equal(h.intervals.size, 0); assert.equal(h.card._klTime, null);
  assert.equal(h.draws, 0); assert.equal(h.kicks, 0);
});

test('expired ring redraws camera fallback once and stops', () => {
  const h = setup(); h.register(); h.output('camera ready', false); h.tick();
  assert.equal(h.kicks, 1); assert.equal(h.intervals.size, 0);
  assert.equal(h.card._klTime, null);
  h.tick(); assert.equal(h.kicks, 1);
});

test('unchanged output with no remaining time work clears the timer', () => {
  const h = setup(); h.register(); h.output('ring', false); h.tick();
  assert.equal(h.kicks, 0); assert.equal(h.intervals.size, 0);
  assert.equal(h.card._klTime, null);
});

test('failed final-transition kick retries until a render confirms fallback', () => {
  const h = setup(); h.register(); h.output('camera ready', false); h.fail(true);
  h.tick(); h.tick();
  assert.equal(h.kicks, 2); assert.equal(h.intervals.size, 1);
  h.fail(false); h.tick();
  assert.equal(h.kicks, 3); assert.equal(h.intervals.size, 0);
  assert.equal(h.card._klTime, null);
});

test('throwing draw surfaces once, cleans up, and permits later registration', () => {
  const h = setup();
  h.KL.timeCheck(h.card, () => { throw new Error('injected draw failure'); }, 'ring', true);
  assert.throws(() => h.tick(), /injected draw failure/);
  assert.equal(h.intervals.size, 0); assert.equal(h.card._klTime, null);
  h.tick(); h.register(); h.tick();
  assert.equal(h.intervals.size, 1); assert.equal(h.draws, 1);
});

test('timer dereferences its weak owner and stops when that owner is gone', () => {
  const h = setup(); h.register();
  assert.equal(h.refs.length, 1); assert.equal(h.refs[0].target, h.card);
  h.refs[0].target = undefined; h.tick();
  assert.equal(h.intervals.size, 0); assert.equal(h.draws, 0);
  assert.equal(h.kicks, 0);
});
