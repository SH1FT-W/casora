// Energiefluss als Balken im Weich-Design (1.2.1, window._casoraSoftEnergy.flowModel in 05-weich-mehr.js).
//   node dev/unit/energiefluss_balken.mjs
// Erwartet: „Woher“ teilt den Hausverbrauch auf Solar, Akku und Netz auf, „Wohin Solar“ die Solarleistung
// auf Haus, Akku und Einspeisung; die Prozente sichtbarer Anteile ergeben zusammen genau 100; Solar aus
// zeigt keinen Solar-Balken, nur den Hinweis; ohne Akku keine Akku-Anteile; 0 oder unbekannt ruhig.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const M = window._casoraSoftEnergy.flowModel;
assert.equal(typeof M, 'function', 'flowModel fehlt');

const on = (side) => side.filter((p) => p.on);
const sum = (side) => on(side).reduce((s, p) => s + p.pct, 0);
const pick = (side) => Object.fromEntries(on(side).map((p) => [p.k, [Math.round(p.w), p.pct]]));
const AK = { akku: true, lade: true };

// Mittag: Solar 1840 W, Akku lädt 640 W, Einspeisung 680 W, Haus 520 W.
let m = M({ solar: 1840, chg: 640, dis: 0, outp: 520, grid: 0, exp: 680, home: 520, soc: 62, ...AK });
assert.deepEqual(pick(m.from), { solar: [520, 100] });
assert.deepEqual(pick(m.to), { haus: [520, 28], akku: [640, 35], exp: [680, 37] });
assert.equal(sum(m.to), 100);
assert.equal(m.akkuSub, 'Akku lädt');
assert.ok(m.solarOn && !m.toEmpty && !m.fromEmpty);

// Abend: kein Solar, Akku entlädt 380 W, Netz 230 W.
m = M({ solar: 0, chg: 0, dis: 380, outp: 380, grid: 230, exp: 0, home: 610, soc: 41, ...AK });
assert.deepEqual(pick(m.from), { akku: [380, 62], netz: [230, 38] });
assert.equal(on(m.to).length, 0, 'Solar aus: kein Solar-Balken');
assert.equal(m.solarOn, false);
assert.equal(m.toEmpty, 'Solar liefert gerade nichts');
assert.equal(m.akkuSub, 'Akku entlädt');

// Drei Anteile mit Rundung: Summe bleibt 100 (33,3 + 33,3 + 33,3).
m = M({ solar: 300, chg: 0, dis: 300, grid: 300, exp: 0, home: 900, ...AK });
assert.deepEqual(on(m.from).map((p) => p.k), ['solar', 'akku', 'netz']);
assert.equal(sum(m.from), 100);
for (const t of [[1, 1, 1], [7, 13, 980], [333, 333, 334], [50, 25, 25], [6, 6, 1000]]) {
  const r = M({ solar: t[0] + 1000, chg: 1000, dis: t[1], grid: t[2], exp: 0, home: t[0] + t[1] + t[2], ...AK });
  if (on(r.from).length) assert.equal(sum(r.from), 100, 'Summe Woher ' + t);
  if (on(r.to).length) assert.equal(sum(r.to), 100, 'Summe Wohin ' + t);
}

// Kein Akku: keine Akku-Anteile, Kopf ohne Akku; Solar und Netz teilen sich das Haus.
m = M({ solar: 400, chg: null, dis: null, outp: null, grid: 200, exp: null, home: 600, soc: null, akku: false, lade: false });
assert.equal(m.akku, false);
assert.deepEqual(pick(m.from), { solar: [400, 67], netz: [200, 33] });
assert.deepEqual(pick(m.to), { haus: [400, 100] });

// Nur Netz (Solar 0, kein Akku).
m = M({ solar: 0, grid: 450, home: 450, akku: false, lade: false });
assert.deepEqual(pick(m.from), { netz: [450, 100] });
assert.equal(m.toEmpty, 'Solar liefert gerade nichts');

// Einspeisung ohne Akku: Netz zählt nicht als Quelle, Überschuss geht ins Netz.
m = M({ solar: 1000, grid: 0, exp: 700, home: 300, akku: false, lade: false });
assert.deepEqual(pick(m.from), { solar: [300, 100] });
assert.deepEqual(pick(m.to), { haus: [300, 30], exp: [700, 70] });

// Akku ohne Lade-/Entladesensor: nur „Akku“ mit Stand.
m = M({ solar: 0, grid: 300, home: 300, soc: 80, akku: true, lade: false });
assert.equal(m.akkuSub, 'Akku');

// Akku bereit (weder lädt noch entlädt).
m = M({ solar: 0, chg: 2, dis: 0, grid: 300, home: 300, soc: 80, ...AK });
assert.equal(m.akkuSub, 'Akku bereit');
assert.deepEqual(pick(m.from), { netz: [300, 100] });

// Alles 0: ruhige Hinweise, keine Balken.
m = M({ solar: 0, chg: 0, dis: 0, grid: 0, exp: 0, home: 0, soc: 50, ...AK });
assert.equal(on(m.from).length + on(m.to).length, 0);
assert.equal(m.fromEmpty, 'Kein Verbrauch');
assert.equal(m.toEmpty, 'Solar liefert gerade nichts');

// Unbekannt (Sensoren melden nichts): keine Anteile, „Noch keine Werte“.
m = M({ solar: null, chg: null, dis: null, outp: null, grid: null, exp: null, home: null, soc: null, ...AK });
assert.equal(on(m.from).length + on(m.to).length, 0);
assert.equal(m.fromEmpty, 'Noch keine Werte');
assert.equal(m.solarOn, false);

// Netzsensor negativ (Saldo beim Einspeisen) zählt nicht als Bezug.
m = M({ solar: 900, grid: -400, exp: null, home: 500, akku: false, lade: false });
assert.deepEqual(pick(m.from), { solar: [500, 100] });

// Solar läuft, aber Haus braucht nichts davon: keine erfundene Aufteilung.
m = M({ solar: 60, chg: 0, dis: 0, grid: 500, exp: 0, home: 500, ...AK });
assert.deepEqual(pick(m.from), { netz: [500, 100] });
assert.equal(m.toEmpty, 'Noch keine Aufteilung');

console.log('energiefluss_balken: ok');
