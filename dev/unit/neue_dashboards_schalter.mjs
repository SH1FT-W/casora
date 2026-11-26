// @deckt: custom_components/casora/panel/casora-panel-personal.js#swRow,basis,umzug
// Settings › Updates & setup › New dashboards (Prüfrunde u04-09): „Status LEDs“ and „Favorites on Home“ had a
// checkbox with a word behind it on the left („Leave out“, „Fill automatically“), every other settings page has the
// switch on the right, and „Leave out“ on meant the LEDs were off. Now standard switch rows, the LED row positive.
//   node dev/unit/neue_dashboards_schalter.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-personal.js', import.meta.url), 'utf8');
assert.doesNotMatch(src, /\btog\(/, 'no checkbox-with-a-word rows left');
assert.match(src, /const swRow = \(list, title, on, onChange, sub\) => \{\s*const r = self\._flowRow\(list, \{ title, sub \}\);\s*if \(typeof self\._boolSwitch === "function"\) r\.row\.appendChild\(self\._boolSwitch\(/,
  'the standard row: title left, the Studio\'s switch on the right');

// The LED row says what „on“ does: LEDs are added. skip_leds keeps its stored meaning.
const led = src.match(/swRow\(g, "Add status LEDs", ([^,]+), \(v\) => \{ ([^}]+) \}/);
assert.ok(led, 'the LED row is a positive switch');
const on = (B) => new Function('B', 'return ' + led[1])(B);
assert.equal(on({}), false, 'by default LEDs are left out: off');
assert.equal(on({ skip_leds: true }), false);
assert.equal(on({ skip_leds: false }), true);
const set = (v) => { const B = {}; new Function('B', 'v', led[2])(B, v); return B.skip_leds; };
assert.equal(set(true), false, 'on: LEDs are added');
assert.equal(set(false), true, 'off: left out');
assert.match(src, /swRow\(g, "Favorites on Home", B\.favorites !== false/);
console.log('neue_dashboards_schalter: ok');
