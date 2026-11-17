// Tempo (16.11.2026): a tile row asked every card "hidden?" with getComputedStyle while it also wrote wrapper styles
// (and opened a hidden wrapper to probe it), so the browser recalculated styles once per card – the biggest cost of a
// room switch on the phone. _hiddenFlags answers like _isCardHidden for every card, all reads after all writes.
//   node dev/unit/kachelreihe_ein_stilabgleich.mjs
// @deckt: custom_components/casora/scripts/smart-row.js#_hiddenFlags,_isCardHidden,_updateWrapperVisibility,_isActive
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 393 };
let RowClass = null;
// Style log: every wrapper write and every computed-style read, in order.
const log = [];
const style = (init = {}) => new Proxy({ ...init }, { set(o, k, v) { if (o[k] !== v) log.push('w'); o[k] = v; return true; } });
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  // A card is computed display:none when its CSS says so (cssNone) and its wrapper is not display:none (else the
  // browser reports none for everything inside – what _isCardHidden opens the wrapper for).
  getComputedStyle: (el) => { log.push('r'); return { display: el.cssNone && el._wrap.style.display !== 'none' ? 'none' : 'block', overflowX: 'auto' }; },
  setTimeout: () => 0, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
};
new Function(...Object.keys(sandbox), read('custom_components/casora/scripts/smart-row.js'))(...Object.values(sandbox));
assert.ok(RowClass, 'row class defined');

const mk = (specs) => {
  const row = Object.create(RowClass.prototype);
  row._wrappers = []; row._cards = [];
  for (const s of specs) {
    const w = { dataset: s.off ? { off: '1' } : {}, style: style({ display: s.wrapHidden ? 'none' : '' }) };
    const c = s.none ? null : { hidden: !!s.hidden, style: style({ display: s.inline ? 'none' : '' }), cssNone: !!s.cssNone, _wrap: w };
    row._wrappers.push(w); row._cards.push(c);
  }
  return row;
};
const specs = [
  {}, { cssNone: true }, { wrapHidden: true }, { wrapHidden: true, cssNone: true }, { off: true }, { hidden: true },
  { inline: true }, { none: true }, { wrapHidden: true, cssNone: true }, {},
];

// Same answers as asking card by card.
const a = mk(specs), b = mk(specs);
const one = a._cards.map((c, i) => a._isCardHidden(c, a._wrappers[i]));
const all = b._hiddenFlags();
assert.deepEqual(all, one, 'same answer as _isCardHidden for every card');
assert.deepEqual(one, [false, true, false, true, true, true, true, false, true, false]);
// Hidden wrappers stay hidden afterwards.
assert.deepEqual(b._wrappers.map((w) => w.style.display), specs.map((s) => (s.wrapHidden ? 'none' : '')), 'wrappers restored');

// Card by card: a read after a write for every hidden wrapper; all at once: the reads come in one block.
log.length = 0; a._cards.forEach((c, i) => a._isCardHidden(c, a._wrappers[i]));
const blocks = (l) => l.join('').split(/w+/).filter(Boolean).length;
assert.ok(blocks(log) > 1, 'card by card: reads interleaved with writes (' + log.join('') + ')');
log.length = 0; b._hiddenFlags();
assert.equal(blocks(log), 1, 'one block of reads, no write in between (' + log.join('') + ')');
assert.equal(log.filter((x) => x === 'r').length, 6, 'only cards that need it are read');

// _isActive takes the answer from the caller and does not ask again.
const c = mk([{ cssNone: true }]);
c._heldClosed = () => false;
log.length = 0;
assert.equal(c._isActive(0, true), false, 'hidden card is not active');
assert.equal(log.length, 0, 'no computed style read when the caller knows');

console.log('ok kachelreihe_ein_stilabgleich');
