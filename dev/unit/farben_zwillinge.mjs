// Doppelte Farben im Casora-Look (Vergleich 06.10., #f8).  node dev/unit/farben_zwillinge.mjs
// Unter „Casora“ und „Casora Nebel“ sehen Bernstein, Eis und Gold aus wie Orange, Blau und Gelb – dort
// nicht mehr zur Wahl. Ein schon gespeicherter Wert bleibt sichtbar und angehakt; unter Hemma 1/2 alles wie bisher.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const from = src.indexOf('const CASORA_ACCENTS = [');
const to = src.indexOf('const colorLabel = ', from);
assert.ok(from > 0 && to > from);
const mk = new Function('CASORA_THEME', 'getComputedStyle', 'document',
  src.slice(from, to) + '\nreturn { CASORA_ACCENTS, accentsShown, accentLabel, setTheme: (t) => { ACCENT_THEME = t; } };');
let purple = '';
const P = mk('Casora', () => ({ getPropertyValue: (n) => (n === '--casora-color-purple' ? purple : '') }), { documentElement: {} });
const keys = (l) => l.map((a) => a.key);
const ALL = keys(P.CASORA_ACCENTS);

P.setTheme('Casora');
let k = keys(P.accentsShown());
assert.ok(!k.includes('amber') && !k.includes('ice') && !k.includes('gold'), 'Casora: Zwillinge weg');
assert.ok(k.includes('orange') && k.includes('blue') && k.includes('yellow') && k.includes('violet'));
assert.equal(k.length, ALL.length - 3);
P.setTheme('Casora Nebel');
assert.equal(keys(P.accentsShown()).length, ALL.length - 3, 'Nebel ebenso');
// Gespeichert: bleibt in der Liste
const gold = P.CASORA_ACCENTS.find((a) => a.key === 'gold').id;
k = keys(P.accentsShown(gold));
assert.ok(k.includes('gold') && !k.includes('amber'), 'gespeicherter Zwilling bleibt wählbar');
// Hemma: alles wie bisher (ohne Casora-Lila)
for (const t of ['Hemma 2', 'Hemma', '']) {
  P.setTheme(t);
  assert.deepEqual(keys(P.accentsShown()), ALL.filter((x) => x !== 'violet'), 'unter ' + (t || 'ohne Theme') + ' unverändert');
}
// Name passt zur gemalten Farbe (Nutzertest 7): „Dunkelrot“, wenn das Theme purple rot färbt –
// auch unter einem fremden Theme-Namen; sonst „Lila“ (Purple) wie bisher.
const pur = P.CASORA_ACCENTS.find((a) => a.key === 'purple');
P.setTheme('Casora'); purple = '#A9473D';
assert.equal(P.accentLabel(pur), 'Dark red');
P.setTheme('Mein Casora'); purple = '#A9473D';
assert.equal(P.accentLabel(pur), 'Dark red', 'eigene Kopie des Casora-Looks');
assert.ok(keys(P.accentsShown()).includes('violet'), 'dann auch Lila (violet) zur Wahl');
P.setTheme('Hemma 2'); purple = '#9333ea';
assert.equal(P.accentLabel(pur), 'Purple');
P.setTheme('Hemma 2'); purple = '';
assert.equal(P.accentLabel(pur), 'Purple', 'ohne Theme-Wert: Rückfallfarbe ist lila');
console.log('ok farben_zwillinge');
