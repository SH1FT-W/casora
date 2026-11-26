// README, guide and website say what the code offers (Prüfrunde 26.11.2026, the docs were left behind by hand):
//  w06-01 every design the Studio offers is named, not „three designs“;
//  w06-02 the screensaver is mentioned at all;
//  w06-03 the guide's settings table has one row per settings tile and says how many there are;
//  w06-07 README, guide and website list the same, complete set of community cards;
//  w06-09 the guide's action table lists every registered action.
//   node dev/unit/docs_match_code.mjs
// @deckt: README.md, docs/guide.md, docs/index.html, docs/ADVANCED.md
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const README = read('README.md'), GUIDE = read('docs/guide.md'), SITE = read('docs/index.html'), ADV = read('docs/ADVANCED.md');
const PANEL = read('custom_components/casora/panel/casora-panel.js');
const TYPES = read('custom_components/casora/panel/casora-panel-types.js');
const SET = read('custom_components/casora/panel/casora-panel-settings.js');
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// w06-01: designs
const themes = PANEL.slice(PANEL.indexOf('const CASORA_THEMES = ['), PANEL.indexOf('const CASORA_FAMILY'));
const designs = [...themes.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
assert.ok(designs.length >= 7, 'designs read: ' + designs);
for (const [name, doc] of [['README', README], ['guide', GUIDE], ['website', SITE], ['ADVANCED', ADV]]) {
  designs.forEach((d) => assert.ok(doc.includes(d), name + ' names the design ' + d));
  assert.doesNotMatch(doc, /\b(Three designs|All three|Drei Designs|Alle drei Designs)\b/, name + ': not „three designs“');
}

// w06-02: screensaver
for (const [name, doc] of [['README', README], ['guide', GUIDE], ['website', SITE]]) assert.match(doc, /screensaver/i, name + ' mentions the screensaver');
const kinds = /optionLabels: \{ "": "One after the other", ([^}]+)\}/.exec(PANEL);
const kindLabels = [...kinds[1].matchAll(/: "([^"]+)"/g)].map((m) => m[1]);
kindLabels.forEach((k) => assert.ok(new RegExp('\\b' + k + '\\b').test(GUIDE.slice(GUIDE.indexOf('## Screensaver'))), 'guide: screensaver ' + k));

// w06-03: the settings table
const top = SET.slice(SET.indexOf('{ id: "look"'), SET.indexOf('const NEU_START'));
const tiles = [...top.matchAll(/\{ id: "[a-z]+", label: "([^"]+)"/g)].map((m) => m[1]);
assert.ok(GUIDE.includes('a search and ' + NUM[tiles.length] + ' tiles'), 'guide: „' + NUM[tiles.length] + ' tiles“');
tiles.forEach((t) => assert.ok(GUIDE.includes('| **' + t + '** |'), 'guide: a row for ' + t));
// Home & devices: its blocks in the row (no „Advanced“ there, the tile folds its blocks instead).
const house = /\{ id: "house"[\s\S]*?\] \},/.exec(top)[0];
const houseRow = GUIDE.split('\n').find((l) => l.startsWith('| **Home & devices** |'));
[...house.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]).forEach((b) => assert.ok(houseRow.toLowerCase().includes(b.toLowerCase()), 'Home & devices row: ' + b));
assert.doesNotMatch(houseRow, /Advanced/, 'Home & devices has no Advanced part');
assert.doesNotMatch(GUIDE.split('\n').find((l) => l.startsWith('| **Bell & messages** |')), /batteries/, 'batteries are under Home & devices');

// w06-07: community cards
const community = TYPES.split('\n  { id: "').filter((c) => c.includes('\n    community: {') && !/retired: true/.test(c))
  .map((c) => /label: "([^"]+)"/.exec(c)[1]);
assert.ok(community.length >= 11, 'community types read: ' + community);
const cardsLine = (doc, re) => { const m = re.exec(doc); assert.ok(m, 'community list found'); return m[1].toLowerCase(); };
const lists = {
  README: cardsLine(README, /\*\*Community cards\*\* \(([^)]+\)?[^)]*)\)/),
  guide: cardsLine(GUIDE, /\*\*Available now:\*\* ([^\n]+?)\. The robot/),
  website: cardsLine(SITE, /Community cards \(([^)]+\)?[^)]*)\) wait/),
};
for (const [name, list] of Object.entries(lists)) community.forEach((c) => assert.ok(list.includes(c.toLowerCase()), name + ' lists ' + c));

// w06-09: actions
const services = [...read('custom_components/casora/services.yaml').matchAll(/^([a-z_]+):$/gm)].map((m) => m[1]);
const actions = GUIDE.slice(GUIDE.indexOf('## Actions'));
services.forEach((s) => assert.ok(actions.includes('`casora.' + s + '`'), 'action table: casora.' + s));

console.log('ok docs match code');
