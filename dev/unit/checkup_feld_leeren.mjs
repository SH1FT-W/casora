// Checkup 10/2026 (prod): optional device fields in the tile editor (aquarium: light, status sensor,
// leak sensor, battery …) could not be cleared any more – typing nothing restores the value on purpose.
// Expected: _combo with opts.clearable shows a "×" when set, which calls commit(""); the optional
// device fields use it, the main entity does not; dependent fields (when) redraw.
//   node dev/unit/checkup_feld_leeren.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('  _combo(value, list, placeholder, onChange, opts) {');
const b = src.indexOf('\n  _entityList(domains, classes) {', a);
const combo = src.slice(a, b);
assert.ok(/if \(opts && opts\.clearable\)/.test(combo), '_combo knows clearable');
assert.ok(/x\.onclick = \(ev\) => \{[^}]*commit\(""\)/.test(combo), '× clears via commit("")');
assert.ok(/if \(wrap\._paintX\) wrap\._paintX\(\);/.test(combo), 'commit updates the ×');
// Six since own badges (#53): their device field is optional too (switch to template). Seven with the own
// badge popup's "History of" (#60).
assert.equal((src.match(/clearable: true/g) || []).length, 7, 'seven optional device pickers');
const ent = src.indexOf('const entCombo = this._combo(tile.entity');
assert.ok(ent > 0 && !src.slice(ent, ent + 400).includes('clearable'), 'main entity without ×');
assert.ok(src.includes('shownSig() !== shown0'), 'dependent fields redraw');
assert.ok(!/\\0[0-9a-f]{3}/i.test(src.slice(src.indexOf('.combo > .combo-x'), src.indexOf('.combo > .combo-x') + 1500)), 'no octal escape in the CSS');
console.log('ok feld_leeren');
