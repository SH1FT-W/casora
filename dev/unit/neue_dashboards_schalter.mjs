// Settings › Updates & setup › New dashboards: „Status LEDs“ and „Favorites on Home“ had their switch on the left
// under the title with a text of its own („Weglassen“, „Automatisch füllen“). Now a normal settings row: meaning in
// the title, the switch on the right (Prüfrunde d04-04).   node dev/unit/neue_dashboards_schalter.mjs
// @deckt: casora-panel-personal.js#_casoraPersonal
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const src = read('panel/casora-panel-personal.js');
assert.ok(!/tog\(B\.skip_leds/.test(src) && !/tog\(B\.favorites/.test(src), 'no checkbox with its own text');
const a = src.indexOf('const swRow = (title, sub, on, set) => {');
assert.ok(a > 0, 'row with the settings switch');
const swRowSrc = src.slice(a, src.indexOf('\n        };\n', a) + 11);
// Run it: title + sub in the row, the switch appended after the text (right), its value written back.
const rows = [];
const self = {
  _flowRow: (_g, o) => { const row = { kids: [], appendChild(x) { this.kids.push(x); } }; rows.push({ o, row }); return { row }; },
  _boolSwitch: (on, def, onChange, label) => ({ on, def, onChange, label }),
};
const swRow = new Function('self', 'g', 'window', swRowSrc + ' return swRow;')(self, {}, {});
const B = {};
swRow('Leave out status LEDs', 'Router, access point and camera lights', true, (v) => { B.skip_leds = v; });
assert.equal(rows[0].o.title, 'Leave out status LEDs');
const sw = rows[0].row.kids[0];
assert.equal(sw.on, true);
sw.onChange(false); assert.equal(B.skip_leds, false);
sw.onChange(undefined); assert.equal(B.skip_leds, true, 'back to the default');
assert.match(src, /swRow\("Leave out status LEDs", [^\n]*B\.skip_leds !== false/);
assert.match(src, /swRow\("Fill Favorites on Home automatically", [^\n]*B\.favorites !== false/);
const de = JSON.parse(read('translations/panel/de.json')).exact;
assert.equal(de['Leave out status LEDs'], 'Status-LEDs weglassen');
assert.equal(de['Fill Favorites on Home automatically'], 'Favoriten auf „Zuhause“ automatisch füllen');
console.log('neue_dashboards_schalter: ok');
