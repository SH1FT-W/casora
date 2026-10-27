// Owner (27.10.2026): the solar popup read „heute 0 kWh“ and „Solaranteil 0 %“ with 0,02 kWh of solar in the morning
// (sensor.…_heute 0.02 kWh). Under 1 kWh Casora now writes Wh; a share above 0 that rounds to 0 is „< 1 %“.
//   node dev/unit/energy_today_format.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/20-energie-fokus.js', import.meta.url), 'utf8');
const a = src.indexOf('  var LANG = function'), b = src.indexOf('  var money = function', a);
assert.ok(a > 0 && b > a, 'formatters missing');
const num = (S, id) => { const v = parseFloat((S[id] || {}).state); return isFinite(v) ? v : null; };
const unit = (S, id) => ((S[id] || {}).attributes || {}).unit_of_measurement;
const f = new Function('num', 'unit', src.slice(a, b) + '\nreturn { kwh: kwh, pct: pct };')(num, unit);
const S = { 's.a': { state: '0.02', attributes: { unit_of_measurement: 'kWh' } }, 's.b': { state: '3.4', attributes: { unit_of_measurement: 'kWh' } },
  's.c': { state: '850', attributes: { unit_of_measurement: 'Wh' } }, 's.d': { state: '0', attributes: { unit_of_measurement: 'kWh' } } };
const hass = { locale: { language: 'de' } };
assert.equal(f.kwh(S, 's.a', hass), '20 Wh', '0,02 kWh → 20 Wh');
assert.equal(f.kwh(S, 's.b', hass), '3,4 kWh');
assert.equal(f.kwh(S, 's.c', hass), '850 Wh', 'Wh sensor under 1 kWh');
assert.equal(f.kwh(S, 's.d', hass), '0 kWh', 'nothing yet');
assert.equal(f.pct(0.02, 4.02), '< 1 %');
assert.equal(f.pct(0, 4), '0 %');
assert.equal(f.pct(1, 4), '25 %');
console.log('energy_today_format: ok');
