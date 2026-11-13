// @deckt: custom_components/casora/scripts/smart-row.js#_updateWrapperVisibility
// A row whose tiles are all hidden (e.g. empty favorites on the phone) is collapsed by the visibility sweep. The
// show pass on every state change set the row back to display '' and the sweep hid it again 500 ms later, so the
// row (and the grid gap of its outer row) flashed in and pushed everything below down by 8 px for half a second on
// every sensor update (same report as Hemma #87). Expected: the show pass leaves a collapsed row collapsed while
// none of its tiles is visible, and shows it at once when a tile becomes visible.
//   node dev/unit/empty_row_no_flash.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
let timers = [];
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1440 };
const sandbox = {
  window: win,
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class { dispatchEvent(ev) { (this._events = this._events || []).push(ev.type); return true; } },
  getComputedStyle: (el) => ({ display: el._display || (el.style && el.style.display) || 'block', columnGap: '8px', overflowX: 'auto' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'casora-smart-row defined');

const mkCard = (hidden) => ({ hidden: false, style: { display: hidden ? 'none' : '' }, _config: { type: 'custom:button-card' } });
const mk = (cards) => {
  const row = Object.create(RowClass.prototype);
  const wrappers = cards.map((card) => ({ style: { display: '' }, dataset: {}, firstElementChild: card, offsetHeight: 62, offsetWidth: 180 }));
  Object.assign(row, { _initialized: true, _sortEnabled: true, _scrollMode: false,
    _config: { cards: cards.map(() => ({ type: 'custom:button-card' })) },
    _cards: cards, _wrappers: wrappers, _hiddenState: [], _reported: new Set(), _animHiding: new Set(), _animShowing: new Set(),
    _container: {}, style: { display: '' }, _emptyHint: null });
  return row;
};
const runAll = () => { while (timers.length) timers.shift().fn(); };
// The show pass of one state change, before the retries and the 500 ms sweep run.
const showPass = (row) => { timers = []; row._updateWrapperVisibility(); };

// Empty row (no tiles at all, e.g. favorites without favorites).
const empty = mk([]);
showPass(empty); runAll();
assert.equal(empty.style.display, 'none', 'empty row collapses after the first sweep');
assert.deepEqual(empty._events, ['card-visibility-changed'], 'collapsing tells the outer row once');
for (let i = 0; i < 3; i++) {
  showPass(empty);
  assert.equal(empty.style.display, 'none', `empty row stays collapsed in the show pass of update ${i + 1}`);
  runAll();
  assert.equal(empty.style.display, 'none', `empty row stays collapsed after update ${i + 1}`);
}
assert.equal(empty._events.length, 1, 'no further notice while nothing changes');

// Row whose tiles are all hidden (show_when: active, all inactive).
const cards = [mkCard(true), mkCard(true)];
const hidden = mk(cards);
showPass(hidden); runAll();
assert.equal(hidden.style.display, 'none', 'row with only hidden tiles collapses after the sweep');
showPass(hidden);
assert.equal(hidden.style.display, 'none', 'row with only hidden tiles stays collapsed in the show pass');
runAll();

// A tile turns visible: the row appears in the show pass, without waiting for the sweep.
cards[1].style.display = '';
showPass(hidden);
assert.equal(hidden.style.display, '', 'row appears as soon as a tile is visible');
assert.equal(hidden._wrappers[1].style.display, '', 'the visible tile is shown');
runAll();
assert.equal(hidden.style.display, '', 'row stays visible after the sweep');

console.log('empty_row_no_flash: ok');
