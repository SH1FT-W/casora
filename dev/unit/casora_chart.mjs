// casora-chart (1.2): scale, bucketing, time axis, day bars, weekdays, colours – without a DOM.
//   TZ=Europe/Berlin node dev/unit/casora_chart.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.TZ = process.env.TZ || 'Europe/Berlin';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', src)(win, undefined);
const C = win.casoraChart;
assert.ok(C, 'window.casoraChart present');
const H = 36e5, DAY = 864e5;


// Scale: nice steps, 0 with min0, a flat line (used to loop forever), no "-0".
{
  let s = C.nice(19.8, 22.6, 2);
  assert.deepEqual(s.ticks, [18, 20, 22, 24]);
  s = C.nice(205, 2310, 2, true);
  assert.equal(s.lo, 0); assert.deepEqual(s.ticks, [0, 2000, 4000]);
  s = C.nice(21.399999999999995, 21.4, 2);
  assert.ok(s.ticks.length >= 2 && s.ticks.length < 10, 'flat line: few ticks ' + s.ticks);
  assert.ok(s.lo <= 21.4 && s.hi >= 21.4);
  s = C.nice(0, 0, 2, true);
  assert.equal(s.lo, 0, 'flat at 0 with min0 starts at 0');
  s = C.nice(-0.3, 0.2, 2);
  assert.ok(s.ticks.every((v) => !Object.is(v, -0)), 'no -0 in ' + s.ticks);
  assert.equal(C.nf(-0.04, 1), '0,0');
  assert.equal(C.nf(1234.5, 1), '1.234,5');
}
console.log('ok scale');

// Bucketing: mean per window, empty windows carry the last value, the last point ends "now".
{
  const t0 = Date.UTC(2026, 9, 8, 10), pts = [[t0 - H, 10], [t0 + 5 * 6e4, 20], [t0 + 20 * 6e4, 30], [t0 + 95 * 6e4, 40]];
  const b = C.bucket(pts, t0, t0 + 2 * H, 30 * 6e4);
  assert.deepEqual(b.map((p) => p[1]), [25, 30, 30, 40]);
  assert.equal(b[0][0], t0 + 15 * 6e4, 'window middle');
  assert.equal(b[b.length - 1][0], t0 + 2 * H, 'ends now');
  assert.deepEqual(C.bucket(pts, t0, t0 + H, 30 * 6e4, 'max').map((p) => p[1]), [30, 30]);
  assert.deepEqual(C.bucket([], t0, t0 + H, 6e5), []);
  // Only an earlier value: a line over the whole range
  assert.equal(C.bucket([[t0 - 5 * H, 7]], t0, t0 + H, 30 * 6e4).length, 2);
}
console.log('ok bucketing');

// Live end: the last point is the current state (soil moisture 77 % after watering, 6 h stats mean ~49 %).
{
  const t0 = Date.UTC(2026, 9, 18, 0), t1 = t0 + 12 * H;
  const b = C.live(C.bucket([[t0 + H, 40], [t0 + 7 * H, 39], [t0 + 11 * H, 49]], t0, t1, 6 * H), t1, 77);
  assert.deepEqual(b[b.length - 1], [t1, 77]);
  assert.equal(b[0][1], 40, 'earlier windows unchanged');
  assert.deepEqual(C.live([[t1, 5]], t1, NaN), [[t1, 5]], 'no live value: mean stays');
  assert.deepEqual(C.live([], t1, 77), [], 'no history: nothing invented');
}
console.log('ok live end');

// Day bars: local midnight, the last day = today, clock change 25.10.2026 (25-hour day).
{
  const now = new Date(2026, 9, 27, 14, 10).getTime();
  const d = C.days(now, 7);
  assert.equal(d.length, 7);
  assert.equal(d[6], new Date(2026, 9, 27).getTime());
  d.forEach((t) => { const x = new Date(t); assert.equal(x.getHours() + x.getMinutes(), 0, 'midnight'); });
  const i = d.indexOf(new Date(2026, 9, 25).getTime());
  // Days follow local midnights: 25 h on 25.10. in Europe/Berlin, 24 h in a zone without DST (TZ=UTC).
  const dst = new Date(2026, 9, 26).getTime() - new Date(2026, 9, 25).getTime();
  if (process.env.TZ === 'Europe/Berlin') assert.equal(dst, 25 * H, 'Europe/Berlin: 25.10. has 25 hours');
  assert.equal(d[i + 1] - d[i], dst, '25.10. lasts as long as the local day');
}
console.log('ok days');

// Bucket starts for bars: whole hours (24 h), days, months (12, the last = this month); '1y' = 365 days.
{
  const now = new Date(2026, 9, 24, 14, 10).getTime();
  let s = C.starts(now, 'hour', 24);
  assert.equal(s.length, 24);
  assert.equal(s[23], new Date(2026, 9, 24, 14).getTime(), 'last bucket = the current hour');
  assert.equal(s[0], new Date(2026, 9, 23, 15).getTime());
  s = C.starts(now, 'month', 12);
  assert.equal(s.length, 12);
  assert.equal(s[11], new Date(2026, 9, 1).getTime(), 'last = 1 October');
  assert.equal(s[0], new Date(2025, 10, 1).getTime(), 'first = 1 November last year');
  assert.deepEqual(C.starts(now, 'day', 7), C.days(now, 7));
  assert.equal(C.ms('1y'), 365 * DAY);
  assert.equal(C.mon(new Date(2026, 9, 1).getTime()), 'Okt');
  assert.equal(C.monLong(new Date(2026, 9, 1).getTime()), 'Oktober 2026');
  // Year axis: month starts, thinned so labels keep ≥ 72 px.
  let k = C.xTicks(now - 365 * DAY, now, 800);
  assert.ok(k.length >= 10 && k.length <= 12 && k.every((x) => x.mon && new Date(x.t).getDate() === 1), 'year wide: ' + k.length);
  k = C.xTicks(now - 365 * DAY, now, 300);
  assert.ok(k.length >= 3 && k.length <= 6 && k.every((x) => x.mon), 'year narrow: ' + k.length);
}
console.log('ok bucket starts');

// Time axis: ≥ 64 px apart, whole hours; 48 h → weekdays at midnight; 30 d → the date.
{
  const now = new Date(2026, 9, 8, 14, 10).getTime();
  let k = C.xTicks(now - 4 * H, now, 300);
  assert.ok(k.length >= 2 && k.length <= 5, '4 h: ' + k.length);
  k.forEach((x) => assert.equal(new Date(x.t).getMinutes(), 0));
  k = C.xTicks(now - 48 * H, now, 600);
  assert.ok(k.some((x) => x.day), '48 h: day change as a weekday');
  k = C.xTicks(now - 30 * DAY, now, 320);
  assert.ok(k.length >= 2 && k.length <= 6 && k.every((x) => x.day), '30 T: ' + k.length);
}
console.log('ok time axis');

// German weekdays and reading texts (used to be "Thu" from format: 'ddd').
{
  const thu = new Date(2026, 9, 8, 20, 15).getTime();
  assert.equal(C.wd(thu), 'Do');
  assert.equal(C.dayLong(new Date(2026, 9, 5).getTime()), 'Montag, 5. Oktober');
  assert.equal(C.when(thu, thu + H), 'Heute, 20:15 Uhr');
  assert.equal(C.when(thu - DAY, thu), 'Mi, 20:15 Uhr');
  assert.equal(C.dm(thu), '8.10.');
  win.casoraLocale = () => 'en';
  assert.equal(C.wd(thu), 'Thu');
  assert.equal(C.when(thu - DAY, thu, true), 'Wed, 8:15 PM');
  win.casoraLocale = () => 'de';
}
console.log('ok weekdays');

// Paths: monotone curve without overshoot on flat parts, steps for stepped values.
{
  assert.equal(C.mono([]), '');
  assert.equal(C.mono([[0, 1], [10, 2]]), 'M0,1L10,2');
  const d = C.mono([[0, 10], [10, 10], [20, 0]]);
  assert.ok(/^M0,10C/.test(d) && !/NaN/.test(d), d);
  assert.equal(C.stepPath([[0, 5], [10, 2]]), 'M0.0,5.0H10.0V2.0');
}
console.log('ok paths');

// Colours: the callers' iOS tones → four checked steps (handover), grey → text 3.
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
console.log('ok colours');

// Series switch buttons on a phone (#58): in a popup the button-card cancels the touchend, so no click follows –
// the finger lifted in place selects; a moved finger (scrolling) does not; the click echo after a touch is dropped.
{
  const on = {}, b = { addEventListener: (t, f) => { on[t] = f; } };
  let n = 0;
  C.onTap(b, () => n++);
  const ev = (k, x, y) => ({ [k]: [{ clientX: x, clientY: y }], cancelable: true, stopPropagation() {}, preventDefault() { this.dp = true; } });
  on.touchstart(ev('touches', 10, 10));
  const e1 = ev('changedTouches', 14, 12);
  on.touchend(e1);
  assert.equal(n, 1, 'finger tap selects');
  assert.ok(e1.dp, 'touchend cancelled: no ghost click');
  on.click(ev('x', 0, 0));
  assert.equal(n, 1, 'click echo dropped');
  on.touchstart(ev('touches', 10, 10));
  on.touchend(ev('changedTouches', 10, 60));
  assert.equal(n, 1, 'a moved finger is scrolling');
  on.touchend(ev('changedTouches', 10, 10));
  assert.equal(n, 1, 'touchend without a start is no tap');
  const on2 = {};
  let m = 0;
  C.onTap({ addEventListener: (t, f) => { on2[t] = f; } }, () => m++);
  on2.click(ev('x', 0, 0));
  assert.equal(m, 1, 'mouse click selects');
  win._casoraSuppressDismiss = 0;
}
console.log('ok tap');

// Size: served gzipped ≤ 17.5 KB (apexcharts-card: ~500 KB), uncompressed ≤ 56 KB
// (until 26.10.31: 12 KB / 36 KB; until 26.10.59: 12.5 KB / 37 KB – bars per hour/day/month with up to four series
// side by side, the year range and month ticks (chart card #50) took ~5 KB; until the weather pick #56: 13.5 KB / 42 KB –
// several attribute curves of one entity; up to 43 KB before the chart plate got its shadow, 28.10.2026; 14 KB / 44 KB until the heatmap, issue 100: grid, scale and
// hourly rasterisation across clock changes took ~3.3 KB gzip / ~11.5 KB).
{
  const zlib = await import('node:zlib');
  // The shared casora-esc block (HTML escaping, same in every standalone file) does not count against the budget.
  const own = src.replace(/\/\/ casora-esc:begin[\s\S]*?\/\/ casora-esc:end\n?/, '');
  const raw = Buffer.byteLength(own), gz = zlib.gzipSync(own).length;
  assert.ok(raw <= 56 * 1024, 'casora-chart.js ' + raw + ' Bytes > 56 KB');
  assert.ok(gz <= 17.5 * 1024, 'casora-chart.js gzip ' + gz + ' Bytes > 17,5 KB');
}
console.log('ok size');
