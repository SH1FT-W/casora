// #227: a chart that fetches nothing (given points, a stack, no series yet) never noted when it was last drawn, so
// its hass setter rebuilt the whole chart on every state change in the house: one layout per state change on a Home
// with a chart tile, all day. It is drawn once and looked at again after five minutes, like a chart with fetched data.
//   node dev/unit/chart_no_redraw_per_hass.mjs
// @deckt: custom_components/casora/scripts/casora-chart.js#_load,casora-chart
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
let Chart = null;
const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', 'HTMLElement', src)(win, { get: () => null, define: (n, c) => { Chart = c; } }, class {});
assert.ok(Chart, 'casora-chart defined');

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const mk = (c) => {
  const el = Object.create(Chart.prototype);
  el.draws = 0; el._draw = function () { this.draws++; };
  el.toggleAttribute = () => {}; el.isConnected = true;
  el._c = Object.assign({ kind: 'line', span: '24h', source: 'auto', series: [] }, c);
  return el;
};
const hass = () => ({ themes: { darkMode: true }, connection: {}, states: {} });

for (const [name, cfg] of [['given points', { points: [[1, 2], [2, 3]] }], ['stack', { stack: [{ points: [] }] }], ['no series', {}]]) {
  const el = mk(cfg);
  el.hass = hass();
  assert.equal(el.draws, 1, name + ': drawn with the first hass');
  for (let i = 0; i < 20; i++) { now += 200; el.hass = hass(); }
  assert.equal(el.draws, 1, name + ': further state changes do not redraw (' + el.draws + ' draws)');
  now += 5 * 60000 + 1000;
  el.hass = hass();
  assert.equal(el.draws, 2, name + ': looked at again after five minutes');
}
Date.now = realNow;
console.log('OK chart_no_redraw_per_hass');
