// Medien-Popup: Apps umbrechen und Reihen füllen (window._casoraApps.order in 05-standard-medien.js).
// Laufende App zuerst, Rest per First-Fit-Decreasing über die gemessenen Breiten.
//   node dev/unit/apps_anordnung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(src('scripts/local/05-standard-medien.js'))();
const order = window._casoraApps && window._casoraApps.order;
assert.ok(order, '_casoraApps.order fehlt');

const width = (row, w, gap) => row.reduce((s, i) => s + w[i], 0) + gap * (row.length - 1);

// 1) Laufende App steht vorn, auch wenn sie schmal ist.
{
  const w = [60, 120, 90, 150, 80, 110];
  const rows = order(w, 300, 10, 4);
  assert.equal(rows[0][0], 4, 'laufende App zuerst');
  // Jede Reihe passt, jeder Chip genau einmal.
  rows.forEach((r) => assert.ok(width(r, w, 10) <= 300.5, 'Reihe zu breit: ' + r));
  assert.deepEqual(rows.flat().slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
}

// 2) FFD: größte zuerst, Lücken werden mit kleineren gefüllt.
{
  const w = [100, 100, 100, 200, 200, 200];
  const rows = order(w, 310, 10, -1);
  assert.deepEqual(rows, [[3, 0], [4, 1], [5, 2]], 'je Reihe ein großer + ein kleiner');
}

// 3) Ohne FFD bräuchte die Original-Reihenfolge mehr Reihen.
{
  const w = [150, 150, 140, 60, 60, 60, 60];
  const cap = 300, gap = 0;
  let naive = 1, fill = 0;
  w.forEach((x) => { if (fill + x > cap) { naive++; fill = x; } else fill += x; });
  const rows = order(w, cap, gap, -1);
  assert.ok(rows.length <= naive, 'FFD nie schlechter als Original');
  assert.equal(rows.length, 3);
  rows.forEach((r) => assert.ok(width(r, w, gap) <= cap + 0.5));
}

// 4) Gleich breite Chips behalten ihre Reihenfolge; zu breiter Chip bekommt eigene Reihe.
{
  const w = [50, 50, 50, 500];
  const rows = order(w, 200, 5, 1);
  assert.deepEqual(rows, [[1, 0, 2], [3]]);
}

// 5) Kein laufender Index / leere Liste.
assert.deepEqual(order([], 300, 7, -1), []);
assert.deepEqual(order([80], 300, 7, null), [[0]]);
assert.deepEqual(order([80, 90], 300, 7, 0), [[0, 1]]);

console.log('apps_anordnung: ok');
process.exit(0); // 05-standard-medien.js startet Intervalle
