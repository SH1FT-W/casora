// The Community window stays inside the Studio beside HA's sidebar (Prüfrunde u02-02).   node dev/unit/community_breite.mjs
// At 1440 px with the sidebar open the dialog was sized and centred on the whole browser window (x = 220) and HA's
// sidebar (to x = 256) cut off its left edge. Now it is measured on the panel and centred inside it.
// @deckt: casora-panel-community.js#studioArea,_comCatalog
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-community.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const C = mod.exports;
assert.equal(typeof C.studioArea, 'function', 'studioArea');

const a = C.studioArea({ left: 256, width: 1184 }, 1440);
assert.deepEqual(a, { room: 1184, left: 256, right: 0 }, 'desktop with the sidebar');
// The dialog: two columns (room < 1500), min(1000, room - 48), centred in the panel → starts right of the sidebar.
const w = Math.min(1000, a.room - 48);
assert.ok(a.left + (a.room - w) / 2 >= 256 + 24, 'left edge inside the Studio');
assert.deepEqual(C.studioArea({ left: 0, width: 0 }, 1440), { room: 1440, left: 0, right: 0 }, 'not drawn yet: the window');
assert.deepEqual(C.studioArea({ left: 0, width: 390 }, 390), { room: 390, left: 0, right: 0 }, 'phone unchanged');

// Wiring: the catalog uses it and pads the pane by the sidebar.
assert.match(src, /const area = studioArea\(this\.getBoundingClientRect \? this\.getBoundingClientRect\(\) : null, W\.innerWidth\);/);
assert.match(src, /pane\.style\.paddingLeft = \(area\.left \+ 24\) \+ "px"/);
assert.doesNotMatch(src, /const room = pw > 300 \? pw : W\.innerWidth;/, 'no longer the browser window');
console.log('community_breite: ok');
