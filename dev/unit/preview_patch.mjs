// Studio preview: live state changes patch the card on screen instead of swapping it.
//   node dev/unit/preview_patch.mjs
// Reported: the nav bar and tiles of the Studio preview flickered on a real house – every light or
// sensor change (and the clock each minute) swapped in a whole new preview. Expected: same shape →
// only the changed texts/attributes are written; other shape → null (the caller swaps as before);
// classes and styles change token by token, so what the Studio added at runtime stays.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const m = src.match(/\/\/ <preview-patch>[\s\S]*?\/\/ <\/preview-patch>/);
assert.ok(m, 'preview-patch block in casora-panel.js');
const { previewDiff, previewPatch } = new Function(m[0] + '\nreturn { previewDiff, previewPatch };')();

// Minimal DOM: elements with attributes, class list and children; text nodes.
const T = (v) => ({ nodeType: 3, nodeValue: v });
function E(tag, attrs, kids) {
  const a = new Map(Object.entries(attrs || {}));
  const el = {
    nodeType: 1, tagName: tag.toUpperCase(), childNodes: kids || [],
    getAttributeNames: () => [...a.keys()], getAttribute: (n) => (a.has(n) ? a.get(n) : null),
    setAttribute: (n, v) => { el.writes++; a.set(n, String(v)); }, removeAttribute: (n) => { el.writes++; a.delete(n); },
    writes: 0,
  };
  el.classList = {
    add: (c) => { const s = new Set((el.getAttribute('class') || '').split(/\s+/).filter(Boolean)); s.add(c); a.set('class', [...s].join(' ')); },
    remove: (c) => { const s = new Set((el.getAttribute('class') || '').split(/\s+/).filter(Boolean)); s.delete(c); a.set('class', [...s].join(' ')); },
  };
  return el;
}
const build = (time, cls, n) => E('div', { class: 'card' }, [
  E('span', { class: 'mini-time' }, [T(time)]),
  E('div', { class: 'mini-tiles' }, Array.from({ length: n }, (_, i) => E('div', { class: i === 0 ? cls : 'mtile', 'data-mk': 't:' + i }, [T('Tile ' + i)]))),
]);

// Same shape: clock text and one tile's class change.
const a = build('19:44', 'mtile', 3), b = build('19:45', 'mtile on', 3);
const ops = previewDiff(a, b);
assert.ok(Array.isArray(ops), 'same shape gives ops');
assert.equal(ops.length, 2, 'two changes: clock, tile class');
assert.deepEqual(previewDiff(a, build('19:44', 'mtile', 3)), [], 'identical builds: nothing to do');

// Other shape: a tile more, or another element → null.
assert.equal(previewDiff(a, build('19:44', 'mtile', 4)), null, 'tile added: swap');
const c = build('19:44', 'mtile', 3); c.childNodes[0] = E('b', { class: 'mini-time' }, [T('19:44')]);
assert.equal(previewDiff(a, c), null, 'other element: swap');

// Patch the card on screen: it carries runtime extras (hover class, a placeholder appended to the row).
const live = build('19:44', 'mtile', 3);
live.childNodes[1].childNodes[0].classList.add('bhover');
live.childNodes[1].childNodes.push(E('div', { class: 'mtile ghost bghost' }, [T('Hidden')]));
assert.equal(previewPatch(live, ops), true, 'patch applied');
assert.equal(live.childNodes[0].childNodes[0].nodeValue, '19:45', 'clock text patched in place');
const cls = live.childNodes[1].childNodes[0].getAttribute('class').split(' ').sort().join(' ');
assert.equal(cls, 'bhover mtile on', 'class changed token by token, runtime class kept');
assert.equal(live.childNodes[1].childNodes.length, 4, 'placeholder at the end of the row stays');

// Plain attributes are set/removed.
const d1 = E('div', { title: 'Light', 'data-x': '1' }, []), d2 = E('div', { title: 'Light on' }, []);
const lv = E('div', { title: 'Licht', 'data-x': '1' }, []);
assert.equal(previewPatch(lv, previewDiff(d1, d2)), true);
assert.equal(lv.getAttribute('title'), 'Light on');
assert.equal(lv.getAttribute('data-x'), null, 'attribute gone in the new build is removed');

// Target missing on screen (the card changed shape meanwhile): nothing is touched.
const gone = build('19:44', 'mtile', 3);
gone.childNodes[1].childNodes = [];
const before = gone.childNodes[0].childNodes[0].nodeValue;
assert.equal(previewPatch(gone, ops), false, 'missing target: no patch');
assert.equal(gone.childNodes[0].childNodes[0].nodeValue, before, 'no partial patch');

// The preview only patches on live state changes, never after a Studio edit.
assert.ok(/this\._mapLiveSwap = true;\s*this\._swapMap\(mount, room\);/.test(src), '_liveRefresh marks its swap as live');
assert.ok(/if \(canKeep && live && html !== this\._mapHtml && this\._mapGen/.test(src), '_swapMap patches only live swaps');
console.log('ok preview_patch');
