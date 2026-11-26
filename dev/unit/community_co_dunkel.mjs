// The CO detector's dark tile shot was taken mid-animation and showed half the tile smeared (Prüfrunde u02-13).
// Until it is taken again the tile uses the light image in dark mode (darkShots: "popup"); the dark popup stays.
//   node dev/unit/community_co_dunkel.mjs
// @deckt: casora-panel-community.js#shots, casora-panel-types.js#casora_co
import fs from 'node:fs';
import assert from 'node:assert/strict';

const P = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, P), 'utf8');
const mod = { exports: {} };
new Function('module', 'window', read('panel/casora-panel-community.js'))(mod, {});
const C = mod.exports;

const types = read('panel/casora-panel-types.js');
const seg = types.slice(types.indexOf('{ id: "casora_co",'), types.indexOf('\n  { id: "', types.indexOf('{ id: "casora_co",') + 5));
const ds = /darkShots: (true|"popup")/.exec(seg);
assert.ok(ds, 'casora_co has dark shots');
const co = { id: 'casora_co', community: { desc: 'x', darkShots: JSON.parse(ds[1]) } };
const dark = C.shots(co, true);
assert.equal(dark.tile, '/casora_assets/community/casora_co.webp', 'dark mode: the clean light tile');
assert.equal(dark.popup, '/casora_assets/community/casora_co-popup-dark.webp', 'the dark popup stays');
assert.ok(fs.existsSync(new URL('assets/community/casora_co-popup-dark.webp', P)));
assert.ok(!fs.existsSync(new URL('assets/community/casora_co-dark.webp', P)), 'the smeared image is not shipped');
assert.deepEqual(C.shots({ id: 'x', community: { darkShots: true } }, true).tile, '/casora_assets/community/x-dark.webp', 'others unchanged');
console.log('community_co_dunkel: ok');
