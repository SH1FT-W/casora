// Checkup 10/2026: casora-chart – Ticks ab 2 h liefen über die Zeitumstellung in festen ms weiter
// und standen danach um eine Stunde versetzt (1/7/13/19 Uhr statt 0/6/12/18). Erwartet: lokal gezählt,
// eine im Frühjahr fehlende Uhrzeit (2 Uhr) entfällt.
//   node dev/unit/checkup_scripts_chart_zeitumstellung.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', src)(win, undefined);
const C = win.casoraChart;
const hours = (ticks) => ticks.map((x) => new Date(x.t).getHours());
const seen = new Set();

for (const [name, s0] of [['Herbst (25.10.2026)', new Date(2026, 9, 24, 22, 10).getTime()], ['Frühjahr (29.03.2026)', new Date(2026, 2, 28, 22, 10).getTime()]]) {
  for (const [t0, t1] of [10, 15, 30, 37].map((h) => [s0, s0 + h * 36e5])) {
    const tk = C.xTicks(t0, t1, 600);
    const hs = hours(tk);
    // Schritt in lokalen Stunden: kleinster Abstand (im Frühjahr fällt 2 Uhr aus)
    const sh = Math.min(...hs.slice(1).map((h, i) => ((h - hs[i] + 24) % 24) || 24));
    if (sh < 2) continue;
    seen.add(sh);
    assert.ok(hours(tk).every((h) => h % sh === 0), name + ' ' + sh + ' h: ' + hours(tk));
    tk.forEach((x) => assert.equal(x.day, new Date(x.t).getHours() === 0 && sh >= 6, name + ' Tagesmarke'));
    assert.ok(tk.every((x, i) => i === 0 || x.t > tk[i - 1].t), name + ' aufsteigend');
    assert.ok(tk[0].t >= t0 && tk.at(-1).t < t1, name + ' im Bereich');
  }
}
assert.ok(seen.size >= 4, 'Schritte ab 2 h geprüft: ' + [...seen]);
// Unter 2 h und ganze Tage wie bisher.
{
  const t0 = new Date(2026, 9, 25, 0, 10).getTime(), t1 = new Date(2026, 9, 25, 5, 10).getTime();
  const tk = C.xTicks(t0, t1, 600);
  assert.ok(tk.every((x) => new Date(x.t).getMinutes() % 15 === 0), 'Viertelstunden');
  const d0 = new Date(2026, 9, 20, 9).getTime(), d1 = new Date(2026, 9, 30, 9).getTime();
  const dk = C.xTicks(d0, d1, 600);
  assert.ok(dk.every((x) => x.day && new Date(x.t).getHours() === 0), 'Tage um Mitternacht');
  assert.equal(new Date(dk[0].t).getDate(), 21, 'erster Tag nach dem Start');
}
// Herbst: Fenster beginnt in der ersten 02:00-Stunde (MESZ) – die zweite 02:00 (MEZ) bleibt als Tick.
{
  const t0 = Date.parse('2026-10-25T02:10:00+02:00'), t1 = Date.parse('2026-10-25T06:00:00+01:00');
  const tk = C.xTicks(t0, t1, 240).map((x) => new Date(x.t).toISOString());
  assert.deepEqual(tk, ['2026-10-25T01:00:00.000Z', '2026-10-25T03:00:00.000Z'], 'zweite 02:00 im Herbst: ' + tk);
}
console.log('ok chart_zeitumstellung');
