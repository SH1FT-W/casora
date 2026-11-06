// Tile row (smart-row) „no_filter“ tiles: _patchHaCardsDeep walks the tile's shadow roots to switch off hover
// filters on every ha-card. It also walked into HA's leaf elements (ha-card, ha-ripple, ha-icon, ha-state-icon,
// ha-svg-icon), whose shadow roots never hold an ha-card, and waited 40 frames in each for one – three times per
// tile (0, 400, 1200 ms). Measured on the phone dashboard of the test house: ~250 000 calls, ~145 ms main thread
// while loading. Expected: the same ha-cards are patched, the leaf elements are not walked and wait for nothing.
//   node dev/unit/kachelreihe_patch_blaetter.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let frames = [];
let RowClass = null;
const sandbox = {
  window: { addEventListener() {}, removeEventListener() {} },
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({ overflowX: 'auto' }),
  requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
  setTimeout: () => 0, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'class defined');

// A tiny DOM: el(name, shadowChildren) – shadowChildren are the elements inside its shadow root (flat, in order).
const el = (name, kids) => {
  const props = {};
  const e = { localName: name, style: { setProperty: (k, v) => { props[k] = v; } }, props, shadowRoot: null };
  if (kids) {
    e.shadowRoot = { querySelectorAll: (sel) => (sel === '*' ? kids : kids.filter((k) => k.localName === sel)) };
  }
  return e;
};
const icon = () => el('ha-state-icon', [el('ha-icon', [el('ha-svg-icon', [])])]);
// A button-card tile with its own ha-card, ripple and icons, and a nested card that renders an ha-card too.
const ownCard = el('ha-card', []);
const nestedCard = el('ha-card', []);
const nested = el('hui-tile-card', [nestedCard, el('ha-ripple', []), icon()]);
const tile = el('button-card', [ownCard, el('ha-ripple', []), icon(), icon(), nested]);

const row = Object.create(RowClass.prototype);
let calls = 0;
const orig = RowClass.prototype._patchHaCardsDeep;
row._patchHaCardsDeep = function (r, a) { calls++; return orig.call(this, r, a); };
row._patchHaCardsDeep(tile);
let n = 0;
while (frames.length && n < 1000) { const f = frames; frames = []; f.forEach((x) => x()); n++; }

for (const c of [ownCard, nestedCard]) {
  assert.equal(c.props.filter, 'none', 'ha-card hover filter off');
  assert.equal(c.props['--casora-card-hover-filter'], 'none', 'ha-card hover token off');
}
// tile + nested card only; before: 14 calls right away plus 40 retry frames for each of the 12 leaf shadow roots.
assert.equal(calls, 2, `only the tile and the nested card are walked (got ${calls})`);
assert.equal(n, 0, `nothing waits for frames (got ${n} frames)`);

// A card that has not rendered its ha-card yet still waits for it (the retry stays for real cards).
const late = el('button-card', []);
calls = 0;
row._patchHaCardsDeep(late);
assert.equal(frames.length, 1, 'a card without ha-card yet retries on the next frame');
frames = [];
console.log('ok kachelreihe_patch_blaetter');
