// @deckt: custom_components/casora/scripts/local/38-search.js#open,close
// Room search (38-search.js): opening the sheet adds resize/scroll listeners to visualViewport and close() removes
// them. An open while the sheet is already open added a second pair and forgot the first, which then stayed for
// the page's life. Expected: at most one pair at any time, none after close.
//   node dev/unit/search_viewport_listener.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/38-search.js', import.meta.url), 'utf8');
// A small element stand-in: enough for the sheet to be built, shown and removed.
const mk = (tag) => {
  const e = {
    localName: tag, children: [], get firstChild() { return this.children[0] || null; }, style: { setProperty() {} }, dataset: {}, attrs: {}, isConnected: false, value: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; if (this.isConnected) c.isConnected = true; return c; },
    insertBefore(c) { return this.appendChild(c); }, insertAdjacentHTML() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], focus() {}, blur() {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    remove() { const mark = (n) => { n.isConnected = false; n.children.forEach(mark); }; mark(this); }, closest: () => null,
  };
  return e;
};
const body = mk('body'); body.isConnected = true;
body.appendChild = function (c) { this.children.push(c); const mark = (n) => { n.isConnected = true; n.children.forEach(mark); }; mark(c); return c; };
// Like the browser: a listener is in or out, removing one that is not in does nothing.
const vv = { height: 800, width: 400, offsetTop: 0, on: { resize: new Set(), scroll: new Set() },
  get n() { return { resize: this.on.resize.size, scroll: this.on.scroll.size }; },
  addEventListener(t, fn) { this.on[t].add(fn); }, removeEventListener(t, fn) { this.on[t].delete(fn); } };
const hass = { states: {}, entities: {}, devices: {}, areas: {}, user: { id: 'u1', is_admin: true }, locale: { language: 'de' } };
const box = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener() {}, getElementById: () => null, createElement: mk,
    body, head: mk('head'), activeElement: null, documentElement: { style: { setProperty() {} }, scrollTop: 0 } },
  addEventListener() {}, visualViewport: vv, innerHeight: 800, innerWidth: 400, scrollY: 0, history: { pushState() {} }, location: { pathname: '/qa-haus-mobile/home' },
  CustomEvent: class {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: () => 0,
  customElements: { get: () => null }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
};
box.window = box;
vm.createContext(box);
vm.runInContext(src, box);
const S = box._casoraSearch;
const cfg = { views: [{ path: 'home', title: 'Home', cards: [] }] };

assert.equal(S.open({ config: cfg }), true, 'the sheet opens');
assert.ok(S.isOpen());
assert.deepEqual({ ...vv.n }, { resize: 1, scroll: 1 }, 'one pair while open');
S.open({ config: cfg });
assert.deepEqual({ ...vv.n }, { resize: 1, scroll: 1 }, 'opened again while open: still one pair');
S.close();
assert.deepEqual({ ...vv.n }, { resize: 0, scroll: 0 }, 'closed: none left');
S.open({ config: cfg });
S.close();
assert.deepEqual({ ...vv.n }, { resize: 0, scroll: 0 }, 'open and close again: none left');
console.log('search_viewport_listener: ok');
