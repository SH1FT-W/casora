// Checkup 10/2026 (Prod): Nach dem Neuladen stand die Pulse-Kachel (und andere, deren Aktiv-Zustand
// Casora-Module braucht) aktiv gefärbt, aber hinten – die Reihe sortierte vor dem Laden der Module und
// zog erst nach SORT_DELAY_MS plus Ruhezeit nach. Erwartet: in der Ladephase (≤ 10 s) und nach
// casora-local-loaded gleich nachsortieren; danach wie bisher über _updateSort.
//   node dev/unit/checkup_reihe_ladephase.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const listeners = new Map();
const win = {
  addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
  removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
  matchMedia: () => ({ matches: false }), innerWidth: 1440,
};
let RowClass = null, now = 100000;
const timers = [];
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({ overflowX: 'auto' }), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
  Date: { now: () => now },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass && listeners.get('casora-local-loaded')?.size, 'Listener auf casora-local-loaded');

const mk = () => {
  const row = Object.create(RowClass.prototype);
  Object.assign(row, { _sortEnabled: true, _sortTimer: null, _initialized: true, isConnected: true, _builtAt: now,
    _wrappers: [{}, {}, {}], _config: { cards: [{}, {}, {}] }, _activeSet: new Set([0]), _activationOrder: [0] });
  row.active = new Set([0]);
  row._isActive = (i) => row.active.has(i);
  row.applied = 0; row._applyOrder = () => { row.applied++; };
  row.scheduled = 0; row._updateSort = () => { row.scheduled++; };
  return row;
};

// Ladephase: Kachel 2 wird aktiv (Module da) → sofort einsortiert, ohne Wartezeit.
const a = mk();
a.active.add(2);
a._settleSort();
assert.equal(a.applied, 1, 'gleich umsortiert');
assert.deepEqual(a._activationOrder, [0, 2], 'aktive vorn');
a._settleSort();
assert.equal(a.applied, 1, 'ohne Änderung nichts');

// Nach der Ladephase: wie bisher über _updateSort (Bediensperre).
const b = mk();
b._builtAt = now - 11000; b.active.add(1);
b._settleSort();
assert.equal(b.applied, 0); assert.equal(b.scheduled, 1, 'später über _updateSort');

// casora-local-loaded stößt alle Reihen an (nach den Neuzeichnungen).
const c = mk(); c.active.add(1);
win._casoraSmartRows = new Set([c]);
listeners.get('casora-local-loaded').forEach((fn) => fn());
timers.sort((x, y) => x.at - y.at).splice(0).forEach((t) => { now = Math.max(now, t.at); t.fn(); });
assert.equal(c.applied, 1, 'nach casora-local-loaded einsortiert');
console.log('ok reihe_ladephase');
