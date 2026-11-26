// Studio settings › Fuel / Charging, search radius (Prüfrunde u08-08): a radius outside the range is kept in range, and
// leaving the field shows the kept value and a note instead of the typed „50 km“ that was never saved.
//   node dev/unit/settings_radius.mjs
// @deckt: custom_components/casora/panel/casora-panel-settings.js#radiusOf,radiusField
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const src = read('panel/casora-panel-settings.js');
const win = {};
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, appendChild() {} }), getElementById: () => null };
new Function('window', 'document', 'customElements', 'localStorage', src)(win, doc, { whenDefined: () => ({ then() {} }), get: () => null }, { getItem: () => null });
const R = win.casoraSettingsMap && win.casoraSettingsMap.radiusOf;
assert.equal(typeof R, 'function', 'radiusOf');

assert.deepEqual(R('50', 25), { v: 25, note: 'At most {n} km' }, 'fuel: 50 km → 25 with a note');
assert.deepEqual(R('12,5', 25), { v: 12.5, note: null }, 'in range, comma');
assert.deepEqual(R('0.4', 25), { v: 1, note: 'At least {n} km' });
assert.deepEqual(R('50', 50), { v: 50, note: null }, 'charging allows 50');
assert.deepEqual(R('80', 50), { v: 50, note: 'At most {n} km' });
assert.equal(R('', 25), null, 'nothing typed: the draft keeps its value');
assert.equal(R('abc', 25), null);

// Both radius fields go through the same field logic (typing and leaving the field), no clamp of their own.
assert.equal((src.match(/radiusField\(this, rin, rr\.row, /g) || []).length, 2, 'fuel and charging radius use radiusField');
assert.ok(/rin\.onchange = \(\) => \{[\s\S]{0,200}rin\.value = String\(r\.v\)/.test(src), 'leaving the field writes the kept value back');
assert.ok(!/Math\.min\(25, Math\.round/.test(src), 'no silent clamp left');

// The notes are translated.
const de = JSON.parse(read('translations/panel/de.json')).exact;
assert.equal(de['At most {n} km'], 'Höchstens {n} km');
assert.equal(de['At least {n} km'], 'Mindestens {n} km');
console.log('settings_radius: ok');
