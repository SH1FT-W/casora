// B-JS-08: Kachelreihe (smart-row) – der resize-Listener am window und der ResizeObserver werden beim
// Aushängen abgemeldet und beim Wiedereinhängen neu angemeldet (sonst hält window alte Reihen fest).
//   node dev/unit/kachelreihe_abmelden.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const listeners = new Map();
const win = {
  addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
  removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
};
let RowClass = null;
const observed = [];
class RO { constructor(fn) { this.fn = fn; this.on = new Set(); observed.push(this); } observe(x) { this.on.add(x); } disconnect() { this.on.clear(); } }
win.ResizeObserver = RO;
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({ overflowX: 'auto' }), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: () => 0, clearTimeout() {}, ResizeObserver: RO,
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'Klasse definiert');
const row = Object.create(RowClass.prototype);
row.addEventListener = () => {};
row.shadowRoot = { getElementById: () => null };
row._casoraEdges = () => {};
const before = listeners.get('resize')?.size || 0;
row._casoraMouseScroll();
assert.equal(listeners.get('resize').size, before + 1, 'angemeldet');
row.disconnectedCallback();
assert.equal(listeners.get('resize').size, before, 'abgemeldet');
assert.equal(observed.at(-1).on.size, 0, 'ResizeObserver getrennt');
row._casoraMouseScroll();
assert.equal(listeners.get('resize').size, before + 1, 'wieder eingehängt: neu angemeldet');
assert.ok(observed.at(-1).on.has(row), 'wieder beobachtet');
console.log('ok kachelreihe_abmelden');
