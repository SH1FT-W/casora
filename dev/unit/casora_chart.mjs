// casora-chart (1.2): Skala, Zusammenfassen, Zeitachse, Tagesbalken, Wochentage, Farben – ohne DOM.
//   TZ=Europe/Berlin node dev/unit/casora_chart.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.TZ = process.env.TZ || 'Europe/Berlin';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', src)(win, undefined);
const C = win.casoraChart;
assert.ok(C, 'window.casoraChart vorhanden');
const H = 36e5, DAY = 864e5;


// Skala: schöne Schritte, 0 bei min0, flache Linie (früher Endlosschleife), kein „-0“.
{
  let s = C.nice(19.8, 22.6, 2);
  assert.deepEqual(s.ticks, [18, 20, 22, 24]);
  s = C.nice(205, 2310, 2, true);
  assert.equal(s.lo, 0); assert.deepEqual(s.ticks, [0, 2000, 4000]);
  s = C.nice(21.399999999999995, 21.4, 2);
  assert.ok(s.ticks.length >= 2 && s.ticks.length < 10, 'flache Linie: wenige Ticks ' + s.ticks);
  assert.ok(s.lo <= 21.4 && s.hi >= 21.4);
  s = C.nice(0, 0, 2, true);
  assert.equal(s.lo, 0, 'flach bei 0 mit min0 bleibt ab 0');
  s = C.nice(-0.3, 0.2, 2);
  assert.ok(s.ticks.every((v) => !Object.is(v, -0)), 'kein -0 in ' + s.ticks);
  assert.equal(C.nf(-0.04, 1), '0,0');
  assert.equal(C.nf(1234.5, 1), '1.234,5');
}
console.log('ok Skala');

// Zusammenfassen: Mittel je Fenster, leere Fenster tragen den letzten Wert, letzter Punkt endet „jetzt“.
{
  const t0 = Date.UTC(2026, 9, 8, 10), pts = [[t0 - H, 10], [t0 + 5 * 6e4, 20], [t0 + 20 * 6e4, 30], [t0 + 95 * 6e4, 40]];
  const b = C.bucket(pts, t0, t0 + 2 * H, 30 * 6e4);
  assert.deepEqual(b.map((p) => p[1]), [25, 30, 30, 40]);
  assert.equal(b[0][0], t0 + 15 * 6e4, 'Fenstermitte');
  assert.equal(b[b.length - 1][0], t0 + 2 * H, 'endet jetzt');
  assert.deepEqual(C.bucket(pts, t0, t0 + H, 30 * 6e4, 'max').map((p) => p[1]), [30, 30]);
  assert.deepEqual(C.bucket([], t0, t0 + H, 6e5), []);
  // Vorwert allein: Linie über den ganzen Zeitraum
  assert.equal(C.bucket([[t0 - 5 * H, 7]], t0, t0 + H, 30 * 6e4).length, 2);
}
console.log('ok Zusammenfassen');

// Tagesbalken: lokale Mitternacht, letzter Tag = heute, Zeitumstellung 25.10.2026 (25-Stunden-Tag).
{
  const now = new Date(2026, 9, 27, 14, 10).getTime();
  const d = C.days(now, 7);
  assert.equal(d.length, 7);
  assert.equal(d[6], new Date(2026, 9, 27).getTime());
  d.forEach((t) => { const x = new Date(t); assert.equal(x.getHours() + x.getMinutes(), 0, 'Mitternacht'); });
  const i = d.indexOf(new Date(2026, 9, 25).getTime());
  assert.equal(d[i + 1] - d[i], 25 * H, '25.10. hat 25 Stunden');
}
console.log('ok Tage');

// Zeitachse: Abstand ≥ 64 px, ganze Stunden; 48 h → Wochentage um Mitternacht; 30 T → Tagesdatum.
{
  const now = new Date(2026, 9, 8, 14, 10).getTime();
  let k = C.xTicks(now - 4 * H, now, 300);
  assert.ok(k.length >= 2 && k.length <= 5, '4 h: ' + k.length);
  k.forEach((x) => assert.equal(new Date(x.t).getMinutes(), 0));
  k = C.xTicks(now - 48 * H, now, 600);
  assert.ok(k.some((x) => x.day), '48 h: Tageswechsel als Wochentag');
  k = C.xTicks(now - 30 * DAY, now, 320);
  assert.ok(k.length >= 2 && k.length <= 6 && k.every((x) => x.day), '30 T: ' + k.length);
}
console.log('ok Zeitachse');

// Deutsche Wochentage und Ablesetexte (früher „Thu“ aus format: 'ddd').
{
  const thu = new Date(2026, 9, 8, 20, 15).getTime();
  assert.equal(C.wd(thu), 'Do');
  assert.equal(C.dayLong(new Date(2026, 9, 5).getTime()), 'Montag, 5. Oktober');
  assert.equal(C.when(thu, thu + H), 'Heute, 20:15 Uhr');
  assert.equal(C.when(thu - DAY, thu), 'Mi, 20:15 Uhr');
  assert.equal(C.dm(thu), '8.10.');
  win.casoraLocale = () => 'en';
  assert.equal(C.wd(thu), 'Thu');
  assert.equal(C.when(thu - DAY, thu, true), 'Wed, 08:15 PM');
  win.casoraLocale = () => 'de';
}
console.log('ok Wochentage');

// Pfade: monotone Kurve ohne Überschwingen bei flachen Stücken, Treppe für Stufenwerte.
{
  assert.equal(C.mono([]), '');
  assert.equal(C.mono([[0, 1], [10, 2]]), 'M0,1L10,2');
  const d = C.mono([[0, 10], [10, 10], [20, 0]]);
  assert.ok(/^M0,10C/.test(d) && !/NaN/.test(d), d);
  assert.equal(C.stepPath([[0, 5], [10, 2]]), 'M0.0,5.0H10.0V2.0');
}
console.log('ok Pfade');

// Farben: iOS-Töne der Aufrufer → vier geprüfte Stufen (Übergabe), Grau → Text 3.
{
  assert.equal(C.color('#FF9F0A'), 'var(--cc2)');
  assert.equal(C.color('#0A84FF'), 'var(--cc1)');
  assert.equal(C.color('#30D158'), 'var(--cc3)');
  assert.equal(C.color('#FFD600'), 'var(--cc4)');
  assert.equal(C.color('#8E8E93'), 'var(--cink3)');
  assert.equal(C.color('accent'), 'var(--cacc)');
  assert.equal(C.color('var(--x)'), 'var(--x)');
  assert.equal(C.ms('15min'), 15 * 6e4); assert.equal(C.ms('2h'), 2 * H); assert.equal(C.ms('7d'), 7 * DAY);
}
console.log('ok Farben');

// Größe: ausgeliefert gzip-komprimiert ≤ 12 KB (apexcharts-card: ~500 KB), unkomprimiert ≤ 36 KB.
{
  const zlib = await import('node:zlib');
  const raw = Buffer.byteLength(src), gz = zlib.gzipSync(src).length;
  assert.ok(raw <= 36 * 1024, 'casora-chart.js ' + raw + ' Bytes > 36 KB');
  assert.ok(gz <= 12 * 1024, 'casora-chart.js gzip ' + gz + ' Bytes > 12 KB');
}
console.log('ok Größe');
