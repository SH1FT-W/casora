// A phone held sideways is no wall tablet: no screensaver, no return to Home (owner decision 13.11.2026).
// Before, both asked "(hover: none) and (pointer: coarse) and (min-width: 600px)", which an iPhone sideways
// (852×393) meets.   node dev/unit/handy_quer_kein_tablet.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraWallTabletOf,casoraIsWallTablet custom_components/casora/scripts/local/46-screensaver.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const m = core.match(/\n\/\/ Wall tablet or not[\s\S]*?\n\}\)\(\);\n/);
assert.ok(m, 'wall tablet block in casora-core.js');
const window = { matchMedia: () => ({ matches: true }), innerWidth: 852, screen: { width: 852, height: 393 } };
new Function('window', m[0])(window);
const of = window.casoraWallTabletOf;

// [name, viewport width, screen width, screen height, touch, wall tablet?]
const DEVICES = [
  ['iPhone 16 Pro upright', 393, 393, 852, true, false],
  ['iPhone 16 Pro sideways', 852, 852, 393, true, false],
  ['iPhone 16 Pro Max sideways', 956, 956, 440, true, false],
  ['Pixel 9 sideways', 923, 923, 412, true, false],
  ['Galaxy S24 Ultra sideways', 915, 915, 412, true, false],
  ['iPad Air sideways', 1180, 1180, 820, true, true],
  ['iPad Air upright', 820, 820, 1180, true, true],
  ['iPad mini upright', 744, 744, 1133, true, true],
  ['Fire HD 8 sideways', 853, 853, 533, true, true],
  ['Lenovo Tab M8 upright', 600, 600, 962, true, true],
  ['Galaxy Tab S9 sideways', 1280, 1280, 800, true, true],
  ['Tablet in split view (narrow window)', 500, 1180, 820, true, false],
  ['Laptop', 1440, 1440, 900, false, false],
];
for (const [name, vw, sw, sh, touch, want] of DEVICES) {
  assert.equal(of({ vw, sw, sh, touch }), want, name);
}
// Runtime: the window's own values (here an iPhone sideways with a touch screen).
assert.equal(window.casoraIsWallTablet(), false, 'iPhone sideways at runtime: no wall tablet');

// Both wall-tablet features ask it, not the width alone.
const idleAt = core.indexOf('// Return to Home after a spell');
const idle = core.slice(idleAt, idleAt + 4000);
assert.ok(/casoraIsWallTablet\(\)/.test(idle) && !/min-width: 600px/.test(idle), 'return to Home asks casoraIsWallTablet');
const saver = read('custom_components/casora/scripts/local/46-screensaver.js');
assert.ok(/casoraIsWallTablet\(\)/.test(saver) && !/min-width: 600px/.test(saver), 'screensaver asks casoraIsWallTablet');
console.log('ok – phone sideways is no wall tablet');
