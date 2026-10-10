// Adresse eines neuen Dashboards (Umzug, Import, Assistent) aus dem Titel:
// Umlaute ausschreiben wie bei Raum-Adressen. Umzug-Prüfung 10.10.2026 (umzug-09):
// „Sonderfälle“ wurde zu /sonderf-lle.   node dev/unit/dashboard_adresse_umlaut.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const translitSrc = one(/^const translit = [\s\S]*?;\n/m);
const slugSrc = one(/^const slug = .*$/m);
const flow = one(/  _flowPath\(title, fallback, suffix\) \{[\s\S]*?\n  \}\n/);
const { translit, slug, flowPath } = new Function(translitSrc + slugSrc +
  '\nconst o = { _freePath: (p) => p,' + flow.replace(/^  _flowPath/, ' _flowPath') + '};' +
  '\nreturn { translit, slug, flowPath: (t, f, s) => o._flowPath(t, f, s) };')();

assert.equal(flowPath('Sonderfälle', 'casora', 'casora'), 'sonderfaelle-casora');
assert.equal(flowPath('Mein Zuhause (Hemma 2)', 'casora', 'casora'), 'mein-zuhause-hemma-2');
assert.equal(flowPath('Größe Übersicht', 'casora', 'casora'), 'groesse-uebersicht');
assert.equal(flowPath('Café', 'x', 'y'), 'cafe-y');
assert.equal(flowPath('', 'casora-imported', 'imported'), 'casora-imported');
assert.equal(flowPath('???', 'casora-imported', 'imported'), 'casora-imported');
// Raum-Adressen unverändert
assert.equal(slug('Küche'), 'kueche');
assert.equal(slug(''), 'room');
assert.equal(slug(' Bad / WC '), 'bad-wc');
console.log('PASS dashboard_adresse_umlaut');
