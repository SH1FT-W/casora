// casoraPopup.shown (casora-core.js): the popup on screen for modules that fill its content. The dashboard's popup
// while it is open, else the Studio's preview while it is in the tree, else the dashboard's element as before
// (null before any popup was made). `element` always stays the dashboard's.
//   node dev/unit/popup_shown.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = src.indexOf('  var _el = null;');
const b = src.indexOf("\n  window.addEventListener('ll-custom'", a);
assert.ok(a > 0 && b > a, 'popup block found');
const block = src.slice(a, b);
assert.ok(block.includes('window.casoraPopup = {') && block.includes('get shown()'), 'block holds casoraPopup with shown');

// A bare casora-popup: open() sets the open attribute, close() takes it away.
const fakePopup = () => {
  const attrs = new Set();
  return { attrs, isConnected: true, parentNode: null,
    hasAttribute: (k) => attrs.has(k), open() { attrs.add('open'); }, close() { attrs.delete('open'); } };
};
const make = () => {
  const host = { appendChild(c) { c.parentNode = host; } };
  const window = {};
  const document = { createElement: () => fakePopup(), querySelector: () => null };
  new Function('window', 'document', 'popupHost', 'flagOn', block)(window, document, () => host, () => true);
  return window.casoraPopup;
};

// Nothing made yet.
let P = make();
assert.equal(P.shown, null, 'no popup, no preview → null');

// 1. Dashboard popup open → element.
P.open({});
assert.ok(P.element && P.element.hasAttribute('open'));
assert.equal(P.shown, P.element, 'dashboard popup open → element');

// 2. Only the preview: no dashboard popup made → preview; dashboard popup made but closed → preview.
P = make();
const pv = fakePopup();
P.setPreview(pv);
assert.equal(P.preview, pv);
assert.equal(P.shown, pv, 'only the preview registered → preview');
P.open({}); P.close();
assert.equal(P.element.hasAttribute('open'), false);
assert.equal(P.shown, pv, 'dashboard popup closed, preview shown → preview');

// 3. Preview registered and the dashboard popup open → element (the dashboard popup wins).
P.open({});
assert.equal(P.shown, P.element, 'preview registered and dashboard popup open → element');
assert.notEqual(P.shown, pv);
P.close();

// 4. Preview taken out of the tree (isConnected false) → the dashboard element as before, null if none was made.
pv.isConnected = false;
assert.equal(P.shown, P.element, 'preview disconnected → element');
const P2 = make();
const pv2 = fakePopup(); pv2.isConnected = false;
P2.setPreview(pv2);
assert.equal(P2.shown, null, 'preview disconnected, no dashboard popup made → null');

// Unregistering returns to the old behaviour.
P.setPreview(null);
assert.equal(P.preview, null);
assert.equal(P.shown, P.element, 'preview removed → element');
console.log('ok popup_shown');
