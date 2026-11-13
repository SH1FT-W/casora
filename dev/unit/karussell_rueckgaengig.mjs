// #149: Split a carousel in the Studio with the phone preview showing, then Ctrl+Z: the carousel did not
// come back. Drawing the phone preview (_phoneState) brings the phone half in step with the rooms; that
// change was recorded as an undo step of its own, so Ctrl+Z landed on the half-synced state and the next
// preview synced it again - undo stayed stuck. Expected: Ctrl+Z goes back to the carousel, a second one
// back to the separate tiles.  node dev/unit/karussell_rueckgaengig.mjs
// @deckt: casora-panel.js#_phoneState,_markDirty,_undo,_carouselSplit,_carouselJoin
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
let Panel = null;
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: (n, c) => { if (n === 'casora-panel') Panel = c; }, whenDefined: () => new Promise(noop) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.requestAnimationFrame = noop;
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
new Function(fix(fs.readFileSync(new URL('casora-panel.js', dir), 'utf8')))();
console.info = log;
const I = window.__casoraPanelInternals;
assert.ok(Panel && I, 'panel class missing');

const tile = (tpl, e) => ({ type: 'custom:button-card', template: tpl, entity: e, name: e });
const desk = [tile('casora_light', 'light.a'), tile('casora_cover', 'cover.b'), tile('casora_media', 'media_player.c')];
const pair = {
  safe: true,
  desktop: null,
  mobile: { compact: { rooms: [{ name: 'Wohnzimmer', tiles: [] }] }, chrome: {}, scaffold: {} },
  link: { links: [{ room: 0, section: 0 }] },
};
const state = { surface: 'desktop', compact: { rooms: [{ name: 'Wohnzimmer', path: 'wz', tiles: desk }] }, scaffold: {}, extras: {}, chrome: {} };
pair.desktop = state;

// A panel without DOM: the real history methods, the preview reduced to what it does with the state.
const p = Object.create(Panel.prototype);
const saveBtn = { classList: { toggle: noop }, disabled: false };
Object.assign(p, {
  _state: state, _pair: pair, _room: 0, _sel: null, _tileKeys: new WeakMap(), _tileSeq: 0, _draftOff: true,
  $: (id) => (id === 'save' ? saveBtn : null),
  _status: noop, _log: noop, _renderTabs: noop, _renderForm: noop, _rebuildPreview: noop, _scenesOn: () => false,
  // Phone preview showing: every redraw reads the phone half (as _phoneMap does).
  _syncPreview() { this._markDirty(); this._phoneState(); },
});
// The preview redraws more than once after a change (rebuild in the next frame, live updates).
const redraw = () => { p._syncPreview(); p._syncPreview(); };
Object.assign(p, {
});
p._phoneState();
p._clean = p._print();
p._resetUndo(false);
const tilesNow = () => state.compact.rooms[0].tiles;
const carousels = () => tilesNow().filter(I.isCarouselCard).length;

// Combine all three into a carousel (what _carouselJoin does after the dialog), preview redraws.
const car = I.markCarousel({ type: I.CAROUSEL_CARD, cards: desk.slice() }, 'n');
state.compact.rooms[0].tiles = [car];
p._markDirty();
redraw();
assert.equal(carousels(), 1);
// Split it via the real method, preview redraws.
p._carouselSplit(state.compact.rooms[0], car);
redraw();
assert.equal(carousels(), 0, 'split');
assert.equal(tilesNow().length, 3);

// Ctrl+Z: the carousel is back, and stays back after the preview redrew.
p._undo();
redraw();
assert.equal(carousels(), 1, 'Ctrl+Z after "Split carousel" brings the carousel back');
assert.equal(tilesNow()[0].cards.length, 3);
// Ctrl+Z again: the separate tiles from before "Combine".
p._undo();
redraw();
assert.equal(carousels(), 0, 'second Ctrl+Z undoes "Combine into carousel"');
assert.deepEqual(tilesNow().map((t) => t.entity), ['light.a', 'cover.b', 'media_player.c']);
assert.equal((p._undoStack || []).length, 0, 'no extra history steps from the phone preview');

// A change not yet recorded is never folded away by the preview: it stays its own step.
state.compact.rooms[0].tiles.pop();
p._phoneState();
p._markDirty();
assert.equal(p._undoStack.length, 1, 'pending edit recorded');
p._undo();
assert.equal(tilesNow().length, 3, 'pending edit undone');
console.log('ok karussell_rueckgaengig');
