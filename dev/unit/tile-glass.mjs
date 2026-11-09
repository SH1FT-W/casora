// Tile glass: a switch's day becomes a filled shape, a reading becomes a short chip.
//   node dev/unit/tile-glass.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const win = {};
const box = { window: win, console };
vm.createContext(box);
vm.runInContext(read('../../custom_components/casora/scripts/local/44-tile-glass.js'), box);
const G = win._casoraTileGlass;
assert.ok(G, 'module loads');
assert.equal(G._booted, undefined, 'does not mount without a document');

assert.equal(G.sample('on'), 1);
assert.equal(G.sample('off'), 0);
assert.equal(G.sample('22.5'), 22.5);
assert.equal(G.sample('unavailable'), 0);

const start = 0, end = 100;
const pts = G.shape([
  { t: -10, v: 0 },
  { t: 25, v: 1 },
  { t: 75, v: 0 },
], start, end);
assert.equal(pts[0].v, 0, 'starts off');
assert.ok(pts.some((p) => p.t === 0.25 && p.v === 1), 'rises when the switch turns on');
assert.equal(pts[pts.length - 1].v, 0, 'ends off');

const d = G.area(pts, 100, 48);
assert.ok(d.startsWith('M'), 'area is a path');
assert.ok(d.endsWith('Z'), 'area is closed');
assert.ok(!G.line(pts, 100, 48).endsWith('Z'), 'the line is not a filled block');

assert.equal(G.chip({ state: '39.3', attributes: { unit_of_measurement: '°C' } }), '39.3°C');
assert.equal(G.chip({ state: 'unavailable', attributes: {} }), '');

assert.ok(read('../../custom_components/casora/scripts/casora-local.js').includes("'44-tile-glass'"), 'module in MODULES');
assert.ok(read('../../custom_components/casora/panel/casora-panel.js').includes('history_bg'), 'studio setting');
