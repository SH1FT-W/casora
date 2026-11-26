// Prüfrunde d01-05: the Studio search showed "Change the look – Settings › Design", but the settings tile is called
// "Look & feel" (de "Aussehen"); "Design" is only a block inside it. Expected: every path "Settings › tile › block"
// in the search names a tile and a block that exist in the settings table (casora-panel-settings.js, NEU).
//   node dev/unit/studio_suche_wege.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js#_mSearchItems custom_components/casora/panel/casora-panel-settings.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + p, import.meta.url), 'utf8');
const mehr = read('casora-panel-b-mehr.js');
const set = read('casora-panel-settings.js');

// Tiles of NEU: `{ id: "...", label: "...", ...` followed by their blocks' titles up to the next tile.
const neu = set.slice(set.indexOf('const NEU = ['));
const tiles = new Map();
const re = /\{ id: "([a-z]+)", label: "([^"]+)"/g;
const starts = [];
let m;
while ((m = re.exec(neu))) starts.push({ at: m.index, label: m[2] });
assert.ok(starts.length >= 6, 'settings tiles found: ' + starts.length);
starts.forEach((t, i) => {
  const part = neu.slice(t.at, i + 1 < starts.length ? starts[i + 1].at : neu.indexOf('\n  ];'));
  tiles.set(t.label, new Set([...part.matchAll(/title: "([^"]+)"/g)].map((x) => x[1])));
});

const ways = [...mehr.matchAll(/way\("Settings", "([^"]+)"(?:, "([^"]+)")?\)/g)];
assert.ok(ways.length >= 4, 'search paths into the settings found: ' + ways.length);
for (const [, tile, block] of ways) {
  assert.ok(tiles.has(tile), `"Settings › ${tile}": no settings tile of that name (${[...tiles.keys()].join(', ')})`);
  if (block) assert.ok(tiles.get(tile).has(block), `"Settings › ${tile} › ${block}": no block of that name in the tile`);
}
console.log('studio_suche_wege: ok (' + ways.length + ' paths)');
