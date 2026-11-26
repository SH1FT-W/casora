// Hints that name a place in the Studio (Prüfrunde 26.11.2026): they pointed at places that no longer exist.
//  w06-05 the tile's Hold hint said „Controls › Tiles“; the place is Settings › Tapping & tablet › Hold and sort tiles.
//  w06-06 „Nicht mehr fragen“ on the Hemma move said „switch it back on under Personal“; the switch is under
//         Settings › Updates & setup › Advanced › Hemma dashboards.
//  w06-04 the guide said „Settings › Extras › AI“; the tile is Settings › AI.
// Every „Settings › …“ path in these texts has to be made of tiles and blocks the settings page really has.
//   node dev/unit/studio_path_hints.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js, custom_components/casora/panel/casora-panel-umzug.js, docs/guide.md
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SET = read('custom_components/casora/panel/casora-panel-settings.js');
const top = SET.slice(SET.indexOf('{ id: "look"'), SET.indexOf('const NEU_START'));
const tiles = new Set([...top.matchAll(/\{ id: "[a-z]+", label: "([^"]+)"/g)].map((m) => m[1]));
const blocks = new Set([...top.matchAll(/\btitle: "([^"]+)"/g)].map((m) => m[1]));
// Sub-headings inside a block (the AI block's „Automatic runs“, „Which AI“).
const subs = new Set(['Automatic runs', 'Which AI']);
assert.ok(tiles.has('Tapping & tablet') && blocks.has('Hold and sort tiles'), 'settings structure read');

function checkPath(path, where) {
  const seg = path.split(/\s*›\s*/).map((s) => s.trim().replace(/[.,;:)]+$/, ''));
  assert.equal(seg[0], 'Settings', where + ': starts at Settings');
  assert.ok(tiles.has(seg[1]), where + ': „' + seg[1] + '“ is a settings tile');
  seg.slice(2).filter((s) => s !== 'Advanced').forEach((s) => assert.ok(blocks.has(s) || subs.has(s), where + ': „' + s + '“ is a block'));
}

const MEHR = read('custom_components/casora/panel/casora-panel-b-mehr.js');
const hold = /tr\("What holding this tile does\. Same as dashboard follows ([^"]+)\."\)/.exec(MEHR);
assert.ok(hold, 'hold hint');
checkPath(hold[1], 'hold hint');

const UMZ = read('custom_components/casora/panel/casora-panel-umzug.js');
const off = /"Casora won't look for Hemma dashboards anymore – switch it back on under ([^"]+)\."/.exec(UMZ);
assert.ok(off, 'Hemma hint');
checkPath(off[1], 'Hemma hint');

// Both texts in every Studio language, the old keys gone.
for (const l of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const T = JSON.parse(read(`custom_components/casora/translations/panel/${l}.json`)).exact;
  [hold[0].slice(4, -2), off[0].slice(1, -1)].forEach((k) => assert.ok(T[k], l + ': ' + k));
  assert.ok(!Object.keys(T).some((k) => /Controls › Tiles|back on under Personal\./.test(k)), l + ': old keys removed');
}

// The guide: every „Settings › …“ path is a real one.
const GUIDE = read('docs/guide.md');
const paths = [...GUIDE.matchAll(/Settings((?: › [A-Z][A-Za-z&]*(?: (?:[a-z&][A-Za-z&]*|[A-Z]{2,}))*)+)/g)].map((m) => 'Settings' + m[1]);
assert.ok(paths.length > 3, 'paths in the guide');
paths.forEach((p) => checkPath(p, 'guide „' + p + '“'));

console.log('ok studio path hints');
