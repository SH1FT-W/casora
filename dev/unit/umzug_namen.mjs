// Umzug Hemma → Casora: Namen der neuen Dashboards.
//   node dev/unit/umzug_namen.mjs
// Entscheidung 03.10.2026: Das erste umgezogene Dashboard heißt „Mein Zuhause“. Ist der Name
// vergeben, behält das neue den Namen der Quelle ohne „Hemma“/„(alt)“-Zusätze („Hemma 1 (Test)“ →
// „Test“, „Ferienhaus“ → „Ferienhaus“). Erst wenn auch der vergeben ist, eine Nummer – nie „(importiert 2)“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
window.casoraI18n = { t: (x) => (x === 'My Home' ? 'Mein Zuhause' : x) };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
const { sourceName, proposeTitle } = window.casoraUmzug;

const H = 'Mein Zuhause';
const cases = [
  ['Hemma 1 (Test)', 'Test'],
  ['Mein Zuhause (Hemma 2)', 'Mein Zuhause'],
  ['Ferienhaus', 'Ferienhaus'],
  ['Mein Hemma (alt)', H],
  ['Hemma', H],
  ['Hemma 2', H],
  ['', H],
  ['Hemma Ferienhaus', 'Ferienhaus'],
  ['Ferienhaus [Hemma]', 'Ferienhaus'],
  ['Zuhaus – Hemma', 'Zuhaus'],
];
cases.forEach(([inp, want]) => assert.equal(sourceName(inp, H), want, inp));

// Panel-Attrappe: Titel in der Seitenleiste.
// Quellen unter ihrer Adresse (QP), alles andere (auch ein zweites „Ferienhaus“) unter eigener.
const pathOf = (titles, i) => (titles.indexOf(titles[i]) === i && QP[titles[i]]) || 'casora-' + i;
const panel = (titles) => ({ _dashList: titles.map((title, i) => ({ title, url_path: pathOf(titles, i) })),
  _hass: { panels: Object.fromEntries(titles.map((title, i) => [pathOf(titles, i), { title }])) } });
const QP = { 'Mein Zuhause (Hemma 2)': 'hemma-zuhause', 'Mein Hemma (alt)': 'mein-hemma', 'Hemma 1 (Test)': 'hemma-eins', Ferienhaus: 'ferienhaus' };
const q = (title) => ({ title, url_path: QP[title] });
const quellen = ['Mein Zuhause (Hemma 2)', 'Mein Hemma (alt)', 'Hemma 1 (Test)', 'Ferienhaus'];
assert.equal(proposeTitle(panel(quellen), q('Hemma 1 (Test)')), H, 'das erste heißt „Mein Zuhause“');
assert.equal(proposeTitle(panel([...quellen, H]), q('Hemma 1 (Test)')), 'Test');
// Der eigene Titel der Quelle zählt nicht als vergeben – „Ferienhaus“ bleibt „Ferienhaus“.
assert.equal(proposeTitle(panel([...quellen, H]), q('Ferienhaus')), 'Ferienhaus');
// Schon einmal umgezogen (ein Casora-Dashboard heißt „Ferienhaus“): dann mit Nummer.
assert.equal(proposeTitle(panel([...quellen, H, 'Ferienhaus']), q('Ferienhaus')), 'Ferienhaus 2');
// Ein zweites Casora-Dashboard gleichen Namens: erst dann eine Nummer.
assert.equal(proposeTitle(panel([...quellen, H, 'Test']), q('Hemma 1 (Test)')), 'Test 2');
assert.equal(proposeTitle(panel([...quellen, H]), q('Mein Hemma (alt)')), H + ' 2', 'Kurzname auch vergeben → Nummer');
assert.ok(!/importiert|imported/.test(proposeTitle(panel([...quellen, H, 'Test', 'Test 2']), q('Hemma 1 (Test)'))));
console.log('ok umzug_namen');
