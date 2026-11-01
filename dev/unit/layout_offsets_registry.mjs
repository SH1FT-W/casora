// layout-offsets.js measured the room header on every pass (ResizeObserver, resize, 250 ms polling while
// loading) and walked the whole page (every shadow root, querySelectorAll('*')) each time to find the
// header, the tile rows and the nav bar: about half of all full walks while a desktop dashboard loads.
// Expected: tile rows and nav bars come from their registries (window._casoraSmartRows /
// window._casoraNavBars), the header is walked for once and reused while it stays connected and visible.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/layout-offsets.js', import.meta.url), 'utf8');

let walks = 0;
const box = { width: 800, height: 200, top: 100, bottom: 300, left: 0, right: 800 };
const style = { display: 'block', visibility: 'visible', marginTop: '0', marginBottom: '0', fontSize: '20px', getPropertyValue: () => '' };
const container = { isConnected: true, getBoundingClientRect: () => box, getRootNode: () => null };
const badge = { id: 'badges_media', localName: 'div', shadowRoot: null, closest: (s) => (s === '#container' ? container : null) };
const row = { localName: 'casora-smart-row', isConnected: true, _scrollMode: false, _wrappers: [], getBoundingClientRect: () => box,
  parentElement: null };
const listeners = {};
const frames = [];
const document = {
  documentElement: { style: { setProperty() {} } },
  body: null,
  readyState: 'complete',
  querySelector: () => null,
  querySelectorAll: (sel) => { if (sel === '*') { walks++; return [badge, row]; } return []; },
  addEventListener() {},
};
const window = {
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  _casoraSmartRows: new Set([row]),
  _casoraNavBars: new Set(),
};
const ctx = vm.createContext({
  window, document, getComputedStyle: () => style, requestAnimationFrame: (f) => frames.push(f),
  setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} },
  Promise, Infinity, Math, parseFloat, isNaN,
});
vm.runInContext(src, ctx);

async function pass() {
  listeners.resize.forEach((f) => f());
  while (frames.length) frames.shift()();
  await new Promise((r) => setImmediate(r)); // the one-walk memo lasts until the next microtask
}
await pass();
const first = walks;
assert.ok(first >= 1, 'the header is found by one walk');
for (let i = 0; i < 5; i++) await pass();
assert.equal(walks, first, `no further walks while the header stays (walks: ${first} → ${walks})`);

// Header gone (other view): it is looked for again.
container.isConnected = false;
await pass();
assert.ok(walks > first, 'a disconnected header is looked for again');
console.log('ok layout_offsets_registry');
