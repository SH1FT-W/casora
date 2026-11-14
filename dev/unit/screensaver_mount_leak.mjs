// @deckt: custom_components/casora/scripts/local/46-screensaver.js#mount
// Screensaver mount (46-screensaver.js): a preview the Studio drew again leaves its old box behind. Its timer and its
// repaint listener must go with it (the Studio never calls destroy), and destroy twice must not take another mount's
// listener with it.
//   node dev/unit/screensaver_mount_leak.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const timers = new Map();
let nextId = 1;
const doc = { getElementById: () => ({}), querySelector: () => null, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
const win = { matchMedia: () => ({ matches: false }) };
const box = {
  window: win, document: doc, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array,
  setInterval: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
  clearInterval: (id) => { timers.delete(id); },
  location: { search: '?casora_saver=0', pathname: '/' },
};
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
const host = () => ({ isConnected: true, innerHTML: '', firstElementChild: null, getRootNode() { return doc; } });
// Repaint listeners are seen through the data path: a forecast that arrives calls every listener once.
let calls = 0, fc = 0;
const ctx = () => { calls++; return { now: new Date('2026-11-14T10:00:00'), vars: {} }; };
const hass = { connection: { subscribeMessage: (cb) => { cb({ forecast: [] }); return Promise.resolve(() => {}); } } };
const listeners = () => { const c0 = calls; S._data.at = {}; S.forecast(hass, 'weather.x' + (fc++), 'daily'); return calls - c0; };

// A box that left the page stops at its next tick: no timer, no listener left.
const a = host();
const before = listeners();
const live = S.mount(a, 'wort', { context: ctx });
assert.equal(timers.size, 1, 'one timer while shown');
assert.equal(listeners(), before + 1, 'one repaint listener while shown');
a.isConnected = false;
for (const fn of [...timers.values()]) fn();
assert.equal(timers.size, 0, 'detached box: its timer is gone');
assert.equal(listeners(), before, 'detached box: its listener is gone');
live.destroy();
assert.equal(listeners(), before, 'destroy after that changes nothing');

// destroy twice keeps the other mounts' listeners.
const b = S.mount(host(), 'wort', { context: ctx });
const c = S.mount(host(), 'wort', { context: ctx });
b.destroy();
b.destroy();
assert.equal(listeners(), before + 1, 'the second destroy leaves the other mount alone');
c.destroy();
assert.equal(listeners(), before);
assert.equal(timers.size, 0);

// A box not yet in the page (mounted before it is inserted) keeps running until it has been shown.
const d = host();
d.isConnected = false;
const dl = S.mount(d, 'wort', { context: ctx });
for (const fn of [...timers.values()]) fn();
assert.equal(timers.size, 1, 'not inserted yet: keeps its timer');
d.isConnected = true;
for (const fn of [...timers.values()]) fn();
d.isConnected = false;
for (const fn of [...timers.values()]) fn();
assert.equal(timers.size, 0, 'shown, then removed: stops');
dl.destroy();
console.log('screensaver_mount_leak: ok');
