// DP-20 (10.10.2026): Rezept-Wochenplan zeigte „HEUTE/SO/MO“ auch auf Englisch.
// Erwartet: Wochentag in der HA-Sprache (de unverändert „SO“, en „SUN“), „Heute“ über casoraTr.
//   node dev/unit/rezept_wochentage_sprache.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const pick = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = pick(/  var DAYS = \['So'[^\n]*\n/) + pick(/  var dayUp = function \(d\) \{[\s\S]*?\n  \};\n/) + pick(/  var todayUp = [^\n]*\n/);
const make = (loc, tr) => new Function('window', code + 'return { dayUp, todayUp };')({ casoraLocale: () => loc, casoraTr: tr });
const sun = new Date(2026, 9, 4), mon = new Date(2026, 9, 5);
const de = make('de-DE', null), en = make('en', (t) => ({ Heute: 'Today' }[t] || t));
assert.equal(de.dayUp(sun), 'SO'); assert.equal(de.dayUp(mon), 'MO'); assert.equal(de.todayUp(), 'HEUTE');
assert.equal(en.dayUp(sun), 'SUN'); assert.equal(en.dayUp(mon), 'MON'); assert.equal(en.todayUp(), 'TODAY');
// Keine fest deutschen Versalien mehr im Rezept-Plan.
assert.ok(!/'HEUTE'|DAYS\[[^\]]+\]\.toUpperCase\(\)/.test(src), 'feste deutsche Versalien');
console.log('ok rezept_wochentage_sprache');
