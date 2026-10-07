// Doppelte Farben im Casora-Look (Vergleich 06.10., #f8).  node dev/unit/farben_zwillinge.mjs
// Unter „Casora“ und „Casora Nebel“ sehen Bernstein, Eis und Gold aus wie Orange, Blau und Gelb – dort
// nicht mehr zur Wahl. Ein schon gespeicherter Wert bleibt sichtbar und angehakt; unter Hemma 1/2 alles wie bisher.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const from = src.indexOf('const CASORA_ACCENTS = [');
const to = src.indexOf('const swatchOf = ', from);
assert.ok(from > 0 && to > from);
const mk = new Function('CASORA_THEME', 'getComputedStyle', 'document',
  src.slice(from, to) + '\nreturn { CASORA_ACCENTS, accentsShown, setTheme: (t) => { ACCENT_THEME = t; } };');
const P = mk('Casora', () => ({ getPropertyValue: () => '' }), { documentElement: {} });
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
console.log('ok farben_zwillinge');
