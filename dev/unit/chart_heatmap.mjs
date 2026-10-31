// casora-chart heatmap (issue 100): rows of local days × 24 hours (the year: months × days), gaps, the running
// hour, clock changes and the time zone – without a DOM.
//   TZ=Europe/Berlin node dev/unit/chart_heatmap.mjs   (the gate also runs it with TZ=UTC)
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.TZ = process.env.TZ || 'Europe/Berlin';
const BERLIN = process.env.TZ === 'Europe/Berlin';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', src)(win, undefined);
const C = win.casoraChart;
const H = 36e5, DAY = 864e5;
const hour = (y, m, d, h) => new Date(y, m, d, h).getTime();
// Hourly statistics from..to (bucket starts), value = f(t).
const hours = (from, to, f) => { const out = []; for (let t = from; t < to; t += H) out.push([t, f(t)]); return out; };

// Plan per range: 24 h = yesterday and today, 7/30 days by the hour, the year as months × days.
{
  assert.deepEqual(C.heatPlan(DAY), { per: 'hour', n: 2 });
  assert.deepEqual(C.heatPlan(7 * DAY), { per: 'hour', n: 7 });
  assert.deepEqual(C.heatPlan(30 * DAY), { per: 'hour', n: 30 });
  assert.deepEqual(C.heatPlan(365 * DAY), { per: 'day', n: 12 });
  const now = hour(2026, 9, 29, 15) + 10 * 6e4;
  assert.equal(C.heatStarts(now, 'hour', 7)[0], hour(2026, 9, 23, 0), 'first row = local midnight six days back');
  assert.equal(C.heatStarts(now, 'day', 12)[0], new Date(2025, 10, 1).getTime(), 'year: November last year … October');
}
console.log('ok plan');

// A week of hours: 7 rows × 24 columns, the running hour and the future are not drawn, a missing hour is a gap.
{
  const now = hour(2026, 9, 29, 15) + 10 * 6e4;
  const pts = hours(hour(2026, 9, 23, 0), hour(2026, 9, 29, 15), (t) => 50 + new Date(t).getHours() / 10)
    .filter((p) => p[0] !== hour(2026, 9, 27, 9));
  const G = C.heat(pts, now, 'hour', 7, 'mean');
  assert.equal(G.rows.length, 7);
  assert.equal(G.cols, 24);
  G.rows.forEach((r) => assert.equal(r.cells.length, 24));
  assert.equal(G.rows[0].t, hour(2026, 9, 23, 0));
  assert.equal(G.rows[6].t, hour(2026, 9, 29, 0), 'last row = today');
  const today = G.rows[6].cells;
  assert.deepEqual(today[14], { t: hour(2026, 9, 29, 14), v: 51.4 }, '14:00 has its value');
  assert.equal(today[15], null, 'the running hour (no statistics yet) is not drawn');
  assert.ok(today.slice(16).every((x) => x === null), 'later hours are not drawn');
  assert.deepEqual(G.rows[4].cells[9], { t: hour(2026, 9, 27, 9), v: null }, 'a passed hour without a value is a gap');
  assert.equal(G.lo, 50);
  assert.equal(G.hi, 52.3);
  // Every value is drawn once; the 25-hour 25.10. lies in this week (Berlin: its two 02:00 buckets share a cell).
  const drawn = G.rows.reduce((a, r) => a + r.cells.filter((x) => x && x.v != null).length, 0);
  assert.equal(drawn, G.count);
  assert.equal(drawn, pts.length - (BERLIN ? 1 : 0), 'every bucket lands in a cell (the doubled 02:00 shares one)');
  // A value that arrived for the running hour (raw history) is drawn.
  const G2 = C.heat(pts.concat([[hour(2026, 9, 29, 15) + 60000, 60]]), now, 'hour', 7, 'mean');
  assert.deepEqual(G2.rows[6].cells[15], { t: hour(2026, 9, 29, 15), v: 60 });
  // Points before the first row or after today are ignored.
  const G3 = C.heat([[hour(2026, 9, 20, 5), 999], [hour(2026, 9, 30, 5), 999]], now, 'hour', 7, 'mean');
  assert.equal(G3.count, 0);
  assert.equal(G3.lo, null);
}
console.log('ok week');

// Time zone: statistics come as UTC instants; the cell is the local hour of that instant.
{
  const now = Date.parse('2026-10-29T14:30:00Z');
  const t = Date.parse('2026-10-28T23:00:00Z');
  const G = C.heat([[t, 7]], now, 'hour', 2, 'mean');
  const d = new Date(t), row = d.getDate() === 29 ? 1 : 0;
  // Half-hour zones (India): the UTC hour falls into the local hour it starts in; the cell keeps the local hour start.
  assert.equal(G.rows[row].cells[d.getHours()].v, 7);
  assert.equal(new Date(G.rows[row].cells[d.getHours()].t).getMinutes(), 0);
  if (BERLIN) assert.deepEqual([row, d.getHours()], [1, 0], 'Europe/Berlin: 23:00 UTC = 00:00 on 29.10.');
  else if (process.env.TZ === 'UTC') assert.deepEqual([row, d.getHours()], [0, 23], 'UTC: the last hour of 28.10.');
}
console.log('ok time zone');

// Clock changes (Europe/Berlin): 25.10.2026 has 25 hours – both 02:00 buckets share column 2 (mean, or the sum for
// consumption); 29.03.2026 has 23 – there is no 02:00 cell.
if (BERLIN) {
  let now = hour(2026, 9, 26, 12);
  const a = Date.parse('2026-10-25T00:00:00Z'), b = Date.parse('2026-10-25T01:00:00Z');  // 02:00 CEST, 02:00 CET
  assert.equal(new Date(a).getHours(), 2); assert.equal(new Date(b).getHours(), 2);
  let G = C.heat([[a, 10], [b, 20]], now, 'hour', 2, 'mean');
  assert.equal(G.rows[0].cells[2].v, 15, 'autumn: mean of both 02:00 hours');
  G = C.heat([[a, 10], [b, 20]], now, 'hour', 2, 'sum');
  assert.equal(G.rows[0].cells[2].v, 30, 'autumn: consumption of both 02:00 hours adds up');
  const day = hours(hour(2026, 9, 25, 0), hour(2026, 9, 26, 0), () => 1);
  assert.equal(day.length, 25, '25 hourly buckets on 25.10.');
  G = C.heat(day, now, 'hour', 2, 'sum');
  assert.equal(G.rows[0].cells.filter((x) => x && x.v != null).length, 24, '24 columns hold the 25 hours');
  assert.equal(G.rows[0].cells.reduce((s, x) => s + (x ? x.v : 0), 0), 25, 'no consumption lost');
  now = hour(2026, 2, 30, 12);
  G = C.heat(hours(hour(2026, 2, 29, 0), hour(2026, 2, 30, 0), () => 1), now, 'hour', 2, 'mean');
  assert.equal(G.rows[0].cells[2], null, 'spring: no 02:00 on 29.03.');
  assert.equal(G.rows[0].cells.filter((x) => x && x.v != null).length, 23);
}
console.log('ok clock change');

// Raw history (sensor without statistics): several changes in an hour average, a quiet hour keeps the last state.
{
  const now = hour(2026, 9, 29, 4) + 6e5;
  const pts = [[hour(2026, 9, 27, 23) + 6e5, 3], [hour(2026, 9, 28, 1) + 6e5, 10], [hour(2026, 9, 28, 1) + 9e5, 20], [hour(2026, 9, 28, 3), 5]];
  const G = C.heat(pts, now, 'hour', 2, 'mean', true);
  const r = G.rows[0].cells;
  assert.deepEqual([r[0].v, r[1].v, r[2].v, r[3].v, r[4].v, r[23].v], [3, 15, 15, 5, 5, 5], 'carried from before the first row, then on');
  assert.equal(G.rows[1].cells[3].v, 5);
  assert.equal(G.rows[1].cells[4], null, 'the running hour stays open');
  const G2 = C.heat(pts, now, 'hour', 2, 'mean', false);
  assert.equal(G2.rows[0].cells[0].v, null, 'without carry a quiet hour is a gap');
}
console.log('ok history');

// The year: months × days from daily statistics; days a month does not have are not drawn.
{
  const now = new Date(2026, 9, 29, 15).getTime();
  const pts = [];
  for (let t = new Date(2025, 10, 1).getTime(); t < new Date(2026, 9, 29).getTime(); t = new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate() + 1).getTime()) {
    pts.push([t, new Date(t).getDate()]);
  }
  const G = C.heat(pts, now, 'day', 12, 'mean');
  assert.equal(G.rows.length, 12);
  assert.equal(G.cols, 31);
  assert.equal(G.rows[0].t, new Date(2025, 10, 1).getTime(), 'first row November 2025');
  const feb = G.rows[3].cells;
  assert.equal(new Date(G.rows[3].t).getMonth(), 1);
  assert.deepEqual([feb[27].v, feb[28], feb[29], feb[30]], [28, null, null, null], 'February 2026 has 28 days');
  assert.equal(G.rows[0].cells[30], null, 'November has 30 days');
  const oct = G.rows[11].cells;
  assert.equal(oct[27].v, 28);
  assert.equal(oct[28], null, 'today is still running');
  assert.equal(oct[30], null);
  assert.deepEqual([G.lo, G.hi], [1, 31]);
}
console.log('ok year');

// Colour share: lowest = 0, highest = 1, a flat grid in the middle.
{
  assert.equal(C.heatShare(5, 5, 10), 0);
  assert.equal(C.heatShare(10, 5, 10), 1);
  assert.equal(C.heatShare(7.5, 5, 10), 0.5);
  assert.equal(C.heatShare(3, 3, 3), 0.5);
  assert.equal(C.heatShare(12, 5, 10), 1);
}
console.log('ok colour share');
console.log('chart_heatmap: ok');
