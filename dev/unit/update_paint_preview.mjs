// Update status K.paint (03-popups.js) paints the search's state into every update card of the open popup. With only
// the Studio's popup preview on screen (casoraPopup.shown = preview, no dashboard popup open) the Studio's room
// preview can show update cards too – those are found in the HA tree, as before 2829b746. With the dashboard popup
// open only that popup is searched; each card is painted once.
//   node dev/unit/update_paint_preview.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('  var deep = function (root, out) {');
const b = src.indexOf('  // Antippen: eigene Erfassung', a);
assert.ok(a > 0 && b > a, 'deep/K.paint found');
const block = src.slice(a, b);

// Bare DOM: a node with classes, children and an optional shadow root; querySelectorAll matches by class only.
const node = (cls, kids = [], shadow = null) => ({ cls: new Set(cls ? cls.split(' ') : []), kids, shadowRoot: shadow, innerHTML: '',
  classList: { contains(c) { return this.n.cls.has(c); }, toggle() {} } });
const root = (kids) => ({ kids });
const all = (r) => { const out = []; (function w(n) { (n.kids || []).forEach((k) => { out.push(k); w(k); }); })(r); return out; };
const fix = (n) => { n.classList.n = n; (n.kids || []).forEach(fix); if (n.shadowRoot) n.shadowRoot.kids.forEach(fix); return n; };
const qsa = (r) => (sel) => all(r).filter((n) => sel === '*' || (sel.includes('.huc') && n.cls && n.cls.has('huc')));
const mk = (r) => { r.querySelectorAll = qsa(r); all(r).forEach((n) => { if (n.shadowRoot) mk(n.shadowRoot); }); return r; };

const roomCard = fix(node('huc'));            // update card in the Studio's room preview (HA tree)
const previewCard = fix(node('huc'));         // update card inside the preview popup
const dashCard = fix(node('huc'));            // update card inside the dashboard popup
const preview = fix(node('', [], root([previewCard])));
const dash = fix(node('', [], root([dashCard])));
const studio = fix(node('', [], root([roomCard, preview])));
const haRoot = root([studio]);
mk(haRoot); mk(preview.shadowRoot); mk(dash.shadowRoot);
[preview, dash].forEach((p) => { p.querySelectorAll = () => []; });

let n = 0;
const run = (P) => {
  const K = { status: () => [], busy: false };
  const window = { casoraPopup: P };
  const document = { querySelector: () => ({ shadowRoot: haRoot }) };
  new Function('window', 'document', 'K', 'inner', 'tr', 'v3StatusHtml', block)(window, document, K, () => 'run' + (++n), (x) => x, () => '');
  [roomCard, previewCard, dashCard].forEach((c) => { c.innerHTML = ''; });
  K.paint();
  return { room: roomCard.innerHTML, preview: previewCard.innerHTML, dash: dashCard.innerHTML };
};

// Only the preview on screen: its own cards and the room preview's, each once.
let r = run({ shown: preview, preview, element: dash });
assert.ok(r.preview, 'preview popup card painted');
assert.ok(r.room, 'room preview card in the HA tree painted');
assert.equal(r.dash, '', 'dashboard popup (closed, not in the tree) untouched');
const before = n; run({ shown: preview, preview, element: dash }); assert.equal(n - before, 2, 'each card painted once');

// Dashboard popup open (it is shown even with a preview registered): only that popup.
r = run({ shown: dash, preview, element: dash });
assert.ok(r.dash, 'dashboard popup card painted');
assert.equal(r.room, '', 'HA tree not searched with the dashboard popup open');
assert.equal(r.preview, '');

// Nothing made yet: the HA tree, as before.
r = run({ shown: null, preview: null, element: null });
assert.ok(r.room && r.preview, 'no popup: HA tree searched');
console.log('ok update_paint_preview');
