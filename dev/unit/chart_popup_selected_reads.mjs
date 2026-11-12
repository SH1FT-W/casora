// #178: a chart tile with several sensors of different units (CPU %, temperature °C) shows the chart's own switch in
// the popup. With a sensor other than the first picked, scrubbing moved the time in the popup's number but kept the
// first sensor's value: the chart hands over only the picked series' reading, and the number listens to the first
// sensor alone. The popup's chart config now names that number (read_as) when it has the switch, so the picked
// series reads along. Same unit (no switch, all curves in one chart): the number keeps the first sensor's value.
//   node dev/unit/chart_popup_selected_reads.mjs
// @deckt: custom_components/casora/scripts/local/27-chart.js#chartCfg
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// 27-chart.js: the popup's chart config.
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.addEventListener = () => {};
window.casoraLocale = () => 'de-DE';
window.casoraTr = (s) => s;
new Function(rd('custom_components/casora/scripts/local/27-chart.js'))();
const M = window._casoraChartCard;
assert.ok(M, 'module loaded');

const cpu = { entity: 'sensor.qa_cpu', name: 'CPU', color: 'c1', unit: '%' };
const temp = { entity: 'sensor.qa_temp', name: 'Temp', color: 'c2', unit: '°C' };
const ram = { entity: 'sensor.qa_ram', name: 'RAM', color: 'c3', unit: '%' };

// casora-chart's _hero, as the chart calls it while scrubbing (readout 'hero', not in its own head).
let Chart = null;
new Function('window', 'customElements', 'HTMLElement', 'document', rd('custom_components/casora/scripts/casora-chart.js'))(
  { casoraLocale: () => 'de', casoraTr: (s) => s, casoraEsc: (s) => String(s) }, { get: () => null, define: (n, c) => { Chart = c; } }, class {}, {});
const node = (attrs) => ({
  isConnected: true, textContent: 'orig', innerHTML: 'orig', _a: Object.assign({}, attrs), nextElementSibling: null,
  getAttribute(k) { return k in this._a ? this._a[k] : null; }, hasAttribute(k) { return k in this._a; },
  setAttribute(k, v) { this._a[k] = v; }, removeAttribute(k) { delete this._a[k]; },
});
const scrub = (cfg, vals) => {
  const num = node({ 'data-casora-read': cpu.entity, 'data-casora-read-bare': '' }), when = node({ 'data-casora-read-when': '' });
  Chart.prototype._hero.call({ _c: cfg, _tg: [num, when], _touched: [] }, vals, 'Mi, 22:54 Uhr');
  return { num: num.textContent, when: when.textContent };
};

for (const shape of ['line', 'bar', 'heat']) {
  // Different units: the switch; Temp picked, so the chart hands over Temp's reading only.
  const cfg = M.chartCfg([cpu, temp], '24h', 'measurement', shape);
  const r = scrub(cfg, [{ entity: temp.entity, text: '59 °C', num: '59' }]);
  assert.equal(r.when, 'Mi, 22:54 Uhr', shape + ': the time reads along');
  assert.equal(r.num, '59', shape + ': the number shows the picked sensor, not the first one');
}
// Same unit, line: no switch, every curve in one chart; the number keeps the first sensor's value.
{
  const cfg = M.chartCfg([cpu, ram], '24h', 'measurement', 'line');
  assert.equal(cfg.switch, false, 'same unit: no switch');
  const r = scrub(cfg, [{ entity: cpu.entity, text: '6 %', num: '6' }, { entity: ram.entity, text: '40 %', num: '40' }]);
  assert.equal(r.num, '6', 'same unit: the first sensor\'s value, not all of them');
}
// One sensor: unchanged.
assert.equal(M.chartCfg([cpu], '24h', 'measurement', 'line').read_as, undefined, 'one sensor: no read_as');
console.log('chart_popup_selected_reads ok');
