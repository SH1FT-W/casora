// A room without tiles shows the hint "Noch keine Geräte – im Studio hinzufügen" (Weich). The visibility sweep of
// casora-smart-row hid the whole row 500 ms after every state change because no tile wrapper was visible, and the
// next change showed it again: the hint flickered. Expected: a shown hint keeps the row visible; without a shown
// hint (other designs) an empty row still collapses as before.
//   node dev/unit/empty_room_hint_sweep.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
let timers = [];
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1440 };
const sandbox = {
  window: win,
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {},
  getComputedStyle: (el) => ({ display: el._display || 'block', columnGap: '8px', overflowX: 'auto' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'casora-smart-row defined');

const mk = (hint) => {
  const row = Object.create(RowClass.prototype);
  Object.assign(row, { _initialized: true, _sortEnabled: true, _scrollMode: false, _config: { cards: [] },
    _cards: [], _wrappers: [], _hiddenState: [], _reported: new Set(), _animHiding: new Set(), _animShowing: new Set(),
    _container: {}, style: { display: '' }, _emptyHint: hint });
  return row;
};
// Simulates one state change: show pass, then every timer (retries and the 500 ms sweep).
const update = (row) => {
  timers = [];
  row._updateWrapperVisibility();
  while (timers.length) timers.shift().fn();
};

const shown = mk({ isConnected: true, _display: 'flex' });
for (let i = 0; i < 5; i++) {
  update(shown);
  assert.equal(shown.style.display, '', `empty room with a shown hint stays visible after update ${i + 1}`);
}

const off = mk({ isConnected: true, _display: 'none' });
update(off);
assert.equal(off.style.display, 'none', 'design without the hint: an empty row collapses as before');

const none = mk(null);
update(none);
assert.equal(none.style.display, 'none', 'no hint at all: an empty row collapses as before');

console.log('empty_room_hint_sweep: ok');
