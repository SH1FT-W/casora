// casora-chart reading under the pointer (owner, 06./07.11.2026: „the charts stutter a bit“ while reading a value).
//   1. The same point again writes nothing: a pointer moves a few px per event, a point lies every ~3 px – every move
//      rewrote the readout, the popup's number and the hair line (measured: 456 moves → 3193 paints, 1988 after).
//   2. A redraw (a new value from the history stream, a resize) continues a reading in progress at the same place: it
//      fell back to „Jetzt“ and dropped the hair line until the pointer moved again (r594 in the browser).
//   node dev/unit/chart_hover.mjs
// @deckt: custom_components/casora/scripts/casora-chart.js#_bind,_draw
import fs from 'node:fs';
import assert from 'node:assert/strict';

let Chart = null;
const win = { casoraLocale: () => 'de', casoraTr: (s) => s, casoraEsc: (s) => String(s) };
new Function('window', 'customElements', 'HTMLElement', 'document', fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8'))(
  win, { get: () => null, define: (n, c) => { Chart = c; } }, class {}, {});
assert.ok(Chart, 'casora-chart class defined');
const P = Chart.prototype;

// A plot 300 px wide with 100 points (one every 3 px), at x = 0 on the page.
const svg = () => {
  const on = {};
  return { on, addEventListener: (t, f) => { on[t] = f; }, setAttribute() {}, removeAttribute() {}, matches: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 150 }) };
};
const me = { _w: 300, _near: (x) => Math.round(x / 3) };
const shown = [];
const show = (i) => shown.push(i), hide = () => shown.push('off');
const move = (s, x) => s.on.pointermove({ pointerType: 'mouse', clientX: x, clientY: 50 });

// 1. Same point: one write.
let s1 = svg();
P._bind.call(me, s1, 100, show, hide);
move(s1, 30); move(s1, 31); move(s1, 31.4); move(s1, 33);
assert.deepEqual(shown, [10, 11], 'a move within the same point writes nothing');

// 2. Redraw while reading: _draw hands the reading over (_pt → _pt0), the new plot shows the same point at once.
me._pt0 = me._pt; me._pt = null;
shown.length = 0;
const s2 = svg();
P._bind.call(me, s2, 100, show, hide);
assert.deepEqual(shown, [11], 'after a redraw the reading continues where the pointer is');
// Letting go ends it; the next redraw starts without a reading.
s2.on.pointerleave({ pointerType: 'mouse' });
assert.equal(me._pt, null, 'letting go forgets the reading');
me._pt0 = me._pt; me._pt = null; shown.length = 0;
P._bind.call(me, svg(), 100, show, hide);
assert.deepEqual(shown, [], 'no reading after letting go');

// Keyboard: the index carries over.
const s3 = svg();
P._bind.call(me, s3, 100, show, hide);
s3.on.keydown({ key: 'End', preventDefault() {}, stopPropagation() {} });
me._pt0 = me._pt; me._pt = null; shown.length = 0;
P._bind.call(me, svg(), 80, show, hide);
assert.deepEqual(shown, [79], 'keyboard reading continues, clamped to the new plot');
console.log('chart_hover: ok');
