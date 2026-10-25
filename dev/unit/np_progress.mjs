// Now-playing progress (25.10.2026): reported "⏮ restarts the same song, the bar keeps the old position".
//   node dev/unit/np_progress.mjs
// Checks without a browser: (1) window._casoraNPPos (casora-core.js, block casora-np-progress) derives the
// position from the latest media_position + media_position_updated_at - forward, restart of the same
// title, seek backwards, paused, no duration; (2) after ⏮/⏭ (_casoraNPSkipMark) the bar restarts from 0
// until HA reports a new position or timestamp, at most 5 s; (3) the soft list (09-weich-wiedergabe.js)
// draws its bars from that helper; (4) the _casoraNP memo signature includes position and duration;
// (5) ⏮/⏭ glyphs (09 paths, casora-icons.js, 05 override) have their drawn shape centred in the 24-unit box.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const a = core.indexOf('// casora-np-progress:start'), b = core.indexOf('// casora-np-progress:end');
assert.ok(a > 0 && b > a, 'block casora-np-progress missing');
const events = [];
const w = { dispatchEvent: (e) => events.push(e) };
w.window = w;
new Function('window', 'CustomEvent', core.slice(a, b))(w, class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } });
const P = w._casoraNPPos;
assert.equal(typeof P, 'function');
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 0.01, msg + ': ' + x + ' vs ' + y);

const T0 = Date.parse('2026-10-25T12:00:00Z');
const E = 'media_player.qa';
// Forward: 60 % reported 10 s ago, playing → 190 s.
let r = P({ entity: E, pos: 180, dur: 300, posAt: new Date(T0 - 10000).toISOString(), playing: true }, T0);
near(r.pos, 190, 'forward'); near(r.frac, 190 / 300, 'forward frac');
// Restart of the same title: position 0, new timestamp → 0 at once (no memory of 190).
r = P({ entity: E, pos: 0, dur: 300, posAt: T0, playing: true }, T0);
near(r.pos, 0, 'restart same title');
r = P({ entity: E, pos: 0, dur: 300, posAt: T0, playing: true }, T0 + 1000);
near(r.pos, 1, 'restart then runs on');
// Seek backwards: 30 s reported now.
near(P({ entity: E, pos: 30, dur: 300, posAt: T0, playing: true }, T0 + 500).pos, 30.5, 'seek backwards');
// Paused: the position stands, no matter how old the timestamp.
near(P({ entity: E, pos: 120, dur: 300, posAt: T0 - 60000, playing: false }, T0).pos, 120, 'paused');
// No duration: position yes, fraction NaN (no bar).
r = P({ entity: E, pos: 12, dur: undefined, posAt: T0, playing: true }, T0 + 2000);
near(r.pos, 14, 'no duration pos'); assert.ok(Number.isNaN(r.frac), 'no duration → frac NaN');
assert.ok(Number.isNaN(P({ entity: E, pos: 12, dur: 0, posAt: T0, playing: false }, T0).frac), 'duration 0 → frac NaN');
// No position at all → null; browser clock behind HA → never before the reported position; clamp to duration.
assert.equal(P({ entity: E, pos: null, dur: 300, posAt: T0, playing: true }, T0), null);
assert.equal(P({ entity: E, pos: undefined, dur: 300, posAt: T0, playing: true }, T0), null);
near(P({ entity: E, pos: 50, dur: 300, posAt: T0 + 3000, playing: true }, T0).pos, 50, 'clock skew');
near(P({ entity: E, pos: 290, dur: 300, posAt: T0 - 60000, playing: true }, T0).pos, 300, 'clamped to duration');
// ISO string and ms timestamps give the same result.
near(P({ entity: E, pos: 10, dur: 300, posAt: new Date(T0).toISOString(), playing: true }, T0 + 4000).pos,
  P({ entity: E, pos: 10, dur: 300, posAt: T0, playing: true }, T0 + 4000).pos, 'ISO = ms');

// ⏮/⏭: optimistic restart from 0, kept while HA reports nothing new.
const realNow = Date.now;
let fake = T0;
Date.now = () => fake;
const states = { [E]: { attributes: { media_position: 180, media_position_updated_at: new Date(T0 - 2000).toISOString() } } };
w._casoraNPSkipMark(E, states);
assert.equal(events.at(-1).type, 'casora-np-skip');
const stale = { entity: E, pos: 180, dur: 300, posAt: states[E].attributes.media_position_updated_at, playing: true };
r = P(stale, T0 + 1500);
assert.ok(r.skip, 'skip active'); near(r.pos, 1.5, 'optimistic restart runs from 0');
near(P({ ...stale, playing: false }, T0 + 1500).pos, 0, 'optimistic restart while paused stays at 0');
near(P({ entity: 'media_player.other', pos: 100, dur: 300, posAt: T0, playing: false }, T0 + 100).pos, 100, 'other player untouched');
// HA reports (new position, possibly with the same timestamp - players that send only on change) → HA wins.
r = P({ ...stale, pos: 2 }, T0 + 2500);
assert.ok(!r.skip, 'reported → no skip'); near(r.pos, 2 + 4.5, 'HA value after report');
assert.ok(!(E in w._casoraNPSkips), 'skip dropped after report');
// New timestamp alone also counts as a report.
w._casoraNPSkipMark(E, states);
assert.ok(!P({ ...stale, posAt: T0 + 100 }, T0 + 200).skip, 'new timestamp → reported');
// HA silent: after 5 s the bar falls back to HA's value.
w._casoraNPSkipMark(E, states);
assert.ok(P(stale, T0 + 4900).skip, 'still optimistic at 4.9 s');
r = P(stale, T0 + 5200);
assert.ok(!r.skip, 'expired after 5 s'); near(r.pos, 180 + 7.2, 'HA value after expiry');
Date.now = realNow;

// (3) Soft list: pct() goes through the helper (stub records the call).
const win = { addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
const ctx = vm.createContext({ window: win, document: {}, setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame() {}, CustomEvent: class {}, console });
win.window = win;
const soft = fs.readFileSync(new URL('local/09-weich-wiedergabe.js', root), 'utf8');
vm.runInContext(soft, ctx);
assert.ok(/function pct\(r\)[\s\S]{0,400}_casoraNPPos/.test(soft), '09 pct() uses _casoraNPPos');
assert.ok(/if \(r\.bar && bar\) bar\.style\.width = pct\(r\)/.test(soft), '09 progress() also updates paused bars');
assert.ok(/_casoraNPSkipMark\(r\.live/.test(soft), '09 skip() marks the optimistic restart');

// (4) Memo signature of _casoraNP carries position and duration (restart without a new timestamp).
const memo = core.slice(core.indexOf('window._casoraNP = function (states, V)'), core.indexOf('window._casoraNP._casoraCore = true'));
assert.ok(/a\.media_position \?\? ''/.test(memo) && /a\.media_duration \?\? ''/.test(memo), '_casoraNP signature lacks position/duration');

// (5) Glyph ink centred: sample every segment (M/L/Q, absolute) and compare the ink box centre with 12.
function inkBox(d, sx = 1, tx = 0) {
  const nums = (s) => s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const [, c, args] of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const n = nums(args);
    if (c === 'M' || c === 'L') for (let i = 0; i < n.length; i += 2) { cx = n[i]; cy = n[i + 1]; add(cx, cy); }
    if (c === 'Q') for (let i = 0; i < n.length; i += 4) {
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const u = 1 - t;
        add(u * u * cx + 2 * u * t * n[i] + t * t * n[i + 2], u * u * cy + 2 * u * t * n[i + 1] + t * t * n[i + 3]);
      }
      cx = n[i + 2]; cy = n[i + 3];
    }
  }
  return { cx: ((x0 + x1) / 2 + tx) * sx, cy: (y0 + y1) / 2 };
}
const NPsoft = soft.match(/P\.next = '([^']+)'/)[1], PPsoft = soft.match(/P\.prev = '([^']+)'/)[1];
for (const [n, d] of [['09 next', NPsoft], ['09 prev', PPsoft]]) {
  const c = inkBox(d);
  assert.ok(Math.abs(c.cx - 12) < 0.02 && Math.abs(c.cy - 12) < 0.05, n + ' ink centre ' + JSON.stringify(c));
}
const icons = fs.readFileSync(new URL('casora-icons.js', root), 'utf8');
const media05 = fs.readFileSync(new URL('local/05-standard-medien.js', root), 'utf8');
const fromUri = (src, re) => {
  const svg = decodeURIComponent(src.match(re)[1]);
  const [, s, tx, ty] = svg.match(/scale\(([\d.]+)\) translate\((-?[\d.]+) (-?[\d.]+)\)/).map(Number);
  const d = svg.match(/ d="([^"]+)"/)[1];
  const c = inkBox(d, s, tx);
  return { cx: c.cx, cy: (c.cy + ty) * s };
};
for (const [n, src, re] of [
  ['icons skip_next', icons, /'skip_next': 'data:image\/svg\+xml,([^']+)'/],
  ['icons skip_previous', icons, /'skip_previous': 'data:image\/svg\+xml,([^']+)'/],
  ['05 FWD', media05, /var FWD = 'data:image\/svg\+xml,([^']+)'/],
  ['05 BWD', media05, /var BWD = 'data:image\/svg\+xml,([^']+)'/],
]) {
  const c = fromUri(src, re);
  assert.ok(Math.abs(c.cx - 12) < 0.02 && Math.abs(c.cy - 12) < 0.1, n + ' ink centre ' + JSON.stringify(c));
}
console.log('np_progress: ok');
