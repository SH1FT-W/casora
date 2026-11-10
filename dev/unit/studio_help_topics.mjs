// Studio help (test 2): E20 short answers to everyday tasks in the Studio (Help › "How do I …?" and the search finds
// them by "Abfall", "Foto" …), not only the guide on GitHub; E18 after dragging tiles with Smart Sort on, the toast
// offers "Keep my order".
//   node dev/unit/studio_help_topics.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const win = {};
const MEHR = read('panel/casora-panel-b-mehr.js');
new Function('window', MEHR)(win);
const M = win.__casoraStudioMehr;
const H = M.HELP_TOPICS;
assert.ok(Array.isArray(H) && H.length >= 6, 'help topics');

// Every "Show me" leads to an action of the search.
const actions = new Set([...MEHR.matchAll(/\bA\("([a-z]+)",/g)].map((m) => m[1]));
H.forEach((h) => assert.ok(!h.go || actions.has(h.go), 'action for ' + h.id + ': ' + h.go));

// The search finds them by the words people type.
const items = H.map((h) => ({ id: h.id, label: h.title, words: h.words }));
const top = (q) => (M.searchRank(items, q, 3)[0] || {}).id;
assert.equal(top('Abfall'), 'waste');
assert.equal(top('Müll'), 'waste');
assert.equal(top('Foto'), 'photo');
assert.equal(top('hochladen'), 'photo');
assert.equal(top('reihenfolge'), 'order');
assert.ok(/HELP_TOPICS\.forEach\(\(h\) => A\("help-" \+ h\.id/.test(MEHR), 'topics in the search');

// Help menu: "How do I …?" before the GitHub guide.
const PANEL = read('panel/casora-panel.js');
const hm = PANEL.slice(PANEL.indexOf('_helpMenu(anchor) {'), PANEL.indexOf('_wireRowScroll(row) {'));
assert.ok(hm.indexOf('id: "howto"') > 0 && hm.indexOf('id: "howto"') < hm.indexOf('id: "docs"'), 'howto first');
assert.ok(/if \(id === "howto"\) return this\._helpTopics\(\);/.test(hm));

// Every text in every Studio language.
for (const l of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const T = JSON.parse(read(`translations/panel/${l}.json`)).exact;
  ['How do I …?', 'Show me', 'Keep my order', 'Help'].concat(H.flatMap((h) => [h.title, h.text]))
    .forEach((k) => assert.ok(T[k], l + ': ' + k));
}

// E18
const PLUS = read('panel/casora-panel-b-plus.js');
assert.ok(/action: smart \? \{ label: tr\("Keep my order"\), run: \(\) => this\._bSmartOff\(\) \} : undo/.test(PLUS), 'Keep my order');
console.log('ok help topics');
