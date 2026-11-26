// u07-01: speaker popup opened while paused, then play – the ring stayed in the pause colour from the second open on.
// open() set _ringSo = null, so the first state message after opening (pause → play) did not count as a change, and
// ringOff() still read the old tile. Expected: open() remembers the tile's state, the next state repaints the ring.
//   node dev/unit/ring_state_open.mjs
// @deckt: casora-core.js#CasoraPopupHass,CasoraPopup
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');

// The two lines of open() that take the tile as the ring's source.
const o0 = core.indexOf('      if (this._src) { this._ringSrc = this._src;');
const o1 = core.indexOf('\n', core.indexOf('else if (data && data.__casoraRingSrc)', o0));
assert.ok(o0 > 0 && o1 > o0, 'open(): ring source lines found');
const openRing = new Function('data', core.slice(o0, o1));

// The hass setter of casora-popup-hass, run with stand-ins.
const c0 = core.indexOf('  class CasoraPopupHass extends HTMLElement {');
const c1 = core.indexOf("  customElements.define('casora-popup-hass'", c0);
assert.ok(c0 > 0 && c1 > c0, 'CasoraPopupHass found');
const body = core.slice(c0, c1).replace('class CasoraPopupHass extends HTMLElement {', 'return class {');
let tileOff = true; // the tile has not redrawn yet: it still reads „paused“
const Cls = new Function('refreshLive', 'ringOff', '_liveHosts', 'setTimeout', 'clearTimeout', 'window', body)(
  () => {}, () => tileOff, new Set(), () => 0, () => {}, {});

function run(viaBack) {
  const paused = { entity_id: 'media_player.x', state: 'paused' };
  const tile = { _stateObj: paused };
  let paints = 0;
  const pop = {
    _src: viaBack ? null : tile, _ringStOff: true,
    hasAttribute: (n) => n === 'open', _paintSoft() { paints++; },
  };
  openRing.call(pop, viaBack ? { __casoraRingSrc: tile } : {});
  assert.equal(pop._ringSrc, tile, 'ring source is the tile');
  const el = new Cls();
  el.getRootNode = () => ({ host: pop });
  // First message after opening: the player plays again (new state object), the tile is not redrawn yet.
  el.hass = { states: { 'media_player.x': { entity_id: 'media_player.x', state: 'playing' } } };
  assert.ok(paints > 0, (viaBack ? 'back: ' : '') + 'a state change right after opening repaints the ring');
  // The same state again (no change): no repaint.
  const before = paints;
  const same = el._hass.states;
  el.hass = { states: same };
  assert.equal(paints, before, 'same state: no repaint');
}
run(false);
run(true);
console.log('ok ring_state_open');
