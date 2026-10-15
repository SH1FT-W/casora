// Checkup 10/2026: Raum-Overlay (filter-overlay) – die Anmeldung am Filter (F.onChange) wird beim
// Aushängen abgemeldet und beim Wiedereinhängen erneuert; ausgehängt baut set hass nichts auf;
// die Scrollbalken-Regel in document.head gibt es nur einmal, egal wie viele Overlays/Neuaufbauten.
//   node dev/unit/checkup_scripts_filter_overlay.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let Cls = null;
const byId = new Map();
const headKids = [];
const el = () => ({
  style: { setProperty() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {},
  classList: { add() {}, remove() {}, toggle() {} },
});
const head = el();
head.appendChild = (x) => { headKids.push(x); if (x.id) byId.set(x.id, x); };
const subs = new Set();
const win = {
  addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  _casoraFilter: { onChange: (fn) => { subs.add(fn); return () => subs.delete(fn); }, apply: (v) => v },
};
const sb = {
  window: win,
  document: {
    getElementById: (id) => byId.get(id) || null, createElement: el, head, body: el(), documentElement: el(),
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  },
  customElements: { get: () => null, define: (n, c) => { Cls = c; } },
  HTMLElement: class {}, ShadowRoot: class {}, getComputedStyle: () => ({}), requestAnimationFrame: () => 0,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
  MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
new Function(...Object.keys(sb), src)(...Object.values(sb));
assert.ok(Cls, 'Klasse definiert');

const make = () => {
  const o = new Cls();
  o.style = {};
  let on = false;
  Object.defineProperty(o, 'isConnected', { get: () => on });
  o._setConnected = (v) => { on = v; };
  o._config = { filter_category: 'raum_test' };
  o._inits = 0;
  o._init = function () { this._inits++; };
  return o;
};
const hass = (f) => ({ states: { 'input_select.casora_mobile_filter': { state: f } } });

// Anmeldung: eingehängt eine, ausgehängt keine, wieder eingehängt wieder eine.
{
  const o = make();
  o._setConnected(true);
  o.hass = hass('all');
  assert.equal(subs.size, 1, 'eingehängt angemeldet');
  o.hass = hass('all');
  assert.equal(subs.size, 1, 'nicht doppelt');
  o._setConnected(false);
  o.disconnectedCallback();
  assert.equal(subs.size, 0, 'beim Aushängen abgemeldet');
  assert.equal(o._filterOff, null);
  // Ausgehängt: keine neue Anmeldung, kein Aufbau, auch wenn der Raum gewählt wird.
  o._inits = 0;
  o.hass = hass('raum_test');
  assert.equal(subs.size, 0, 'ausgehängt keine Anmeldung');
  assert.equal(o._inits, 0, 'ausgehängt kein _init');
  o._setConnected(true);
  o.connectedCallback();
  assert.equal(subs.size, 1, 'wieder eingehängt: neu angemeldet');
  assert.ok(o._inits >= 1, 'wieder eingehängt: Aufbau nachgeholt');
  o._setConnected(false);
  o.disconnectedCallback();
  assert.equal(subs.size, 0);
}
console.log('ok Filter-Anmeldung');

// _init: während loadCardHelpers ausgehängt → kein _buildOverlay.
{
  const o = new Cls();
  let on = true;
  Object.defineProperty(o, 'isConnected', { get: () => on });
  let built = 0;
  o._buildOverlay = () => { built++; };
  let res;
  win.loadCardHelpers = () => new Promise((r) => { res = r; });
  const p = o._init();
  on = false;
  res({});
  await p;
  assert.equal(built, 0, 'ausgehängt: nichts angehängt');
  assert.equal(o._initialized, false);
  assert.equal(o._initializing, false);
}
console.log('ok _init ausgehängt');

// Scrollbalken-Regel in document.head nur einmal.
{
  const styles = () => headKids.filter((x) => x.id === 'casora-fo-body-scroll').length;
  for (let i = 0; i < 3; i++) {
    const o = new Cls();
    o._discoverElements = () => {};
    o._container = null;
    try { o._buildOverlay(); } catch (_) { /* Rest des Aufbaus braucht echtes DOM */ }
    assert.equal(styles(), 1, 'Overlay ' + (i + 1) + ': eine Regel');
  }
}
console.log('ok Scrollbalken-Regel');
