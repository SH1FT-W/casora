// Owner, 06.11.2026 (Test-HA, comparison picture): a flat temperature Verlauf labelled its axis „21 / 21,0 / 21,0“ and
// drew a drop of a few hundredths of a degree from top to bottom. Every temperature Verlauf now shows at least 1 degree
// (°C or °F) unless its config sets y.span itself; other units keep their scale.
//   node dev/unit/chart_temp_min_span.mjs
// @deckt: custom_components/casora/scripts/casora-chart.js#minSpan
import fs from 'node:fs';
import assert from 'node:assert/strict';

const win = { casoraLocale: () => 'de', casoraTr: (s) => s };
new Function('window', 'customElements', fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8'))(win, undefined);
const C = win.casoraChart;
assert.equal(typeof C.minSpan, 'function', 'C.minSpan');
assert.equal(C.minSpan({}, '°C'), 1, '°C: at least 1 degree');
assert.equal(C.minSpan({}, '°F'), 1, '°F too');
assert.equal(C.minSpan({ span: 2 }, '°C'), 2, 'an own y.span wins (water temperature 2 °C)');
assert.equal(C.minSpan({}, '%'), 0, 'humidity keeps its scale');
assert.equal(C.minSpan({}, 'W'), 0);
assert.equal(C.minSpan({}, ''), 0);
// The scale uses it (not only y.span).
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
assert.ok(/C\.minSpan\(y, this\._unit\(s0\)\)/.test(src), 'line scale reads C.minSpan');
console.log('chart_temp_min_span: ok');
