// Checkup 10/2026 (Prod): Optionale Geräte-Felder im Kachel-Editor (Aquarium: Licht, Status-Sensor,
// Lecksensor, Akku …) ließen sich nicht mehr leeren – Leertippen stellt den Wert bewusst wieder her.
// Erwartet: _combo mit opts.clearable zeigt bei Wert ein „×“, das commit("") auslöst; die optionalen
// Gerätefelder nutzen es, die Haupt-Entität nicht; abhängige Felder (when) zeichnen nach.
//   node dev/unit/checkup_feld_leeren.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('  _combo(value, list, placeholder, onChange, opts) {');
const b = src.indexOf('\n  _entityList(domains, classes) {', a);
const combo = src.slice(a, b);
assert.ok(/if \(opts && opts\.clearable\)/.test(combo), '_combo kennt clearable');
assert.ok(/x\.onclick = \(ev\) => \{[^}]*commit\(""\)/.test(combo), '× leert über commit("")');
assert.ok(/if \(wrap\._paintX\) wrap\._paintX\(\);/.test(combo), 'commit aktualisiert das ×');
assert.equal((src.match(/clearable: true/g) || []).length, 5, 'fünf optionale Geräte-Auswahlen');
const ent = src.indexOf('const entCombo = this._combo(tile.entity');
assert.ok(ent > 0 && !src.slice(ent, ent + 400).includes('clearable'), 'Haupt-Entität ohne ×');
assert.ok(src.includes('shownSig() !== shown0'), 'abhängige Felder zeichnen nach');
assert.ok(!/\\0[0-9a-f]{3}/i.test(src.slice(src.indexOf('.combo > .combo-x'), src.indexOf('.combo > .combo-x') + 1500)), 'kein Oktal-Escape im CSS');
console.log('ok feld_leeren');
