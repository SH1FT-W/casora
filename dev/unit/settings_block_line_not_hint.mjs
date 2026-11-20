// #217: a settings block showed the same sentence twice, once as the line under its title (plain) and once as
// the hint under its only switch ("Swipe between rooms").  node dev/unit/settings_block_line_not_hint.mjs
// No block's plain line may equal a field hint of the Studio, in the source or in any translation; the search
// still finds the swipe block by its everyday words.
// @deckt: casora-panel-settings.js#NEU, casora-panel.js#SECTIONS
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, dir), 'utf8');
const src = read('panel/casora-panel-settings.js');
const win = {};
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, appendChild() {} }), getElementById: () => null };
new Function('window', 'document', 'customElements', 'localStorage', src)(win, doc, { whenDefined: () => ({ then() {} }), get: () => null }, { getItem: () => null });
const blocks = win.casoraSettingsMap.tiles.flatMap((tl) => tl.blocks);
assert.ok(blocks.length > 20, 'blocks found: ' + blocks.length);

// Every hint of a field in the Studio (string literal after "hint:").
const panel = read('panel/casora-panel.js');
const hints = new Set();
for (const m of panel.matchAll(/\bhint:\s*"((?:[^"\\]|\\.)*)"/g)) hints.add(JSON.parse('"' + m[1] + '"'));
assert.ok(hints.size > 50, 'hints found: ' + hints.size);
const swipeHint = (panel.match(/key: "swipe_rooms"[^}]*?hint:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
assert.ok(swipeHint && hints.has(swipeHint), 'hint of swipe_rooms');

blocks.forEach((b) => assert.ok(!hints.has(b.plain), 'block ' + b.k + ': the line under the title repeats a field hint: ' + b.plain));

// The same in every language: both texts are translated and stay different.
const swipe = blocks.find((b) => b.k === 'swipe');
assert.ok(swipe && swipe.plain.length < swipeHint.length, 'swipe block: a short line, the full sentence is the hint');
const langs = fs.readdirSync(new URL('translations/panel/', dir)).filter((f) => f.endsWith('.json') && f !== 'en.json');
assert.ok(langs.length >= 8, 'languages: ' + langs.length);
langs.forEach((f) => {
  const t = JSON.parse(read('translations/panel/' + f)).exact;
  const tr = (s) => t[s] || s;
  const byHint = new Map([...hints].map((h) => [tr(h), h]));
  blocks.forEach((b) => assert.ok(!byHint.has(tr(b.plain)), f + ', block ' + b.k + ': line equals a hint: ' + tr(b.plain)));
  assert.ok(t[swipe.plain] && t[swipe.plain] !== swipe.plain, f + ': swipe line translated');
  assert.ok(t[swipeHint] && t[swipeHint] !== swipeHint, f + ': swipe hint translated');
});

// Search words: the block is found for "swipe" and "wischen".
['swipe', 'wischen'].forEach((w) => assert.ok(String(swipe.kw).split(/\s+/).includes(w), 'search word ' + w));
console.log('settings_block_line_not_hint: ok (' + blocks.length + ' blocks, ' + hints.size + ' hints, ' + langs.length + ' languages)');
