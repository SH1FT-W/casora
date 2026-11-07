// Weather dial: coloured by the absolute temperature (final review 01.11.2026: the day's range coloured blue → red made
// 10 °C look hot on a day from 8 to 11). Owner decision 01.11.2026: the ring runs from today's low (bottom left) to
// today's high (bottom right) with „T 8°“ / „H 11°“ at its ends, the knob where „now“ is; the fixed scale −10 … 35 °C
// only without a forecast.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  var TEMP_STOPS = ');
const b = core.indexOf('  window._casoraTempColor = tempColor;');
assert.ok(a > 0 && b > a, 'tempColor in casora-core.js');
const tempColor = new Function(core.slice(a, b) + '\nreturn tempColor;')();
const has = (c, tok) => String(c).includes(tok);
// Cold is blue, mild green, warm orange, hot red – by the temperature itself.
assert.ok(has(tempColor(-15), '--casora-color-blue'), 'below the scale: the coldest blue');
assert.ok(has(tempColor(0), '--casora-color-blue') && !has(tempColor(0), 'orange'), '0 °C blue');
const t10 = tempColor(10);
assert.ok(has(t10, '--casora-color-teal') && !has(t10, 'orange') && !has(t10, 'red'), '10 °C is cool, never orange/red: ' + t10);
assert.ok(has(tempColor(17), '--casora-color-green'), '17 °C green (neutral)');
assert.ok(!has(tempColor(20), 'orange') && !has(tempColor(20), 'red'), '20 °C not warm yet');
assert.ok(has(tempColor(26), '--casora-color-orange'), '26 °C orange');
assert.ok(has(tempColor(28), 'orange') && has(tempColor(28), 'red'), '28 °C between orange and red');
assert.ok(has(tempColor(32), '--casora-color-red') && has(tempColor(32), 'black'), '≥ 30 °C towards dark red');
assert.ok(has(tempColor(40), 'black'), 'above the scale: the hottest');
// The range: tempRange(low, high, now, fahrenheit) in casora-core.js.
const c = core.indexOf('  function tempRange(');
const d = core.indexOf('  window._casoraTempRange = tempRange;');
assert.ok(c > 0 && d > c, 'tempRange in casora-core.js');
const tempRange = new Function(core.slice(c, d) + '\nreturn tempRange;')();
const pct = (r, v) => (v - r.min) / (r.max - r.min) * 100;
let r = tempRange(5, 15, 10, false);
assert.deepEqual([r.min, r.max], [5, 15], 'the ring is the day: low … high, not −10 … 35: ' + JSON.stringify(r));
assert.deepEqual([r.lo, r.hi, r.band], [5, 15, [5, 15]], 'low and high as the labels at the ends');
assert.equal(pct(r, 10), 50, 'the knob half way between low and high');
assert.equal(pct(r, 5), 0, 'at the low: the ring\'s start');
assert.equal(pct(r, 15), 100, 'at the high: the ring\'s end');
r = tempRange(5, 15, 18, false);
assert.deepEqual([r.min, r.max, r.hi], [5, 18, 18], 'now above the forecast widens the day');
r = tempRange(5, 15, 2, false);
assert.deepEqual([r.min, r.max, r.lo], [2, 15, 2], 'now below the forecast widens the day');
r = tempRange(15, 5, 10, false);
assert.deepEqual([r.min, r.max], [5, 15], 'low and high swapped by the source');
// A narrow day (owner 07.11.2026): the scale keeps its smallest range, the band fills the whole ring –
// no grey stubs at the ends – and the labels keep the real low and high.
r = tempRange(2, 5, 3, false);
assert.ok(r.max - r.min >= 4, 'narrow day: the smallest range holds: ' + JSON.stringify(r));
assert.deepEqual(r.band, [r.min, r.max], 'the band fills the whole ring: ' + JSON.stringify(r));
assert.deepEqual([r.lo, r.hi], [2, 5], 'the labels keep the real low and high');
r = tempRange(10, 10, 10, false);
assert.ok(r.max - r.min >= 4 && pct(r, 10) === 50 && r.lo === 10 && r.hi === 10, 'low == high: a small range around now: ' + JSON.stringify(r));
r = tempRange(50, 52, 51, true);
assert.ok(r.max - r.min >= 7, '°F: a wider smallest range');
r = tempRange(null, null, 12, false);
assert.deepEqual([r.min, r.max, r.band], [-10, 35, null], 'no forecast: the fixed scale −10 … 35 °C');
r = tempRange(undefined, 60, 50, true);
assert.deepEqual([r.min, r.max, r.band], [14, 95, null], 'no forecast (°F): 14 … 95');
// The dial draws the temperature ring; the weather passes the day's range and T/H as the ring's ends.
assert.match(core, /if \(ring\.temp\) \{/, 'dialSvg draws the temperature ring');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const w = tpl.casora_weather.tap_action.casora_popup.content;
assert.match(w, /window\._casoraTempRange\(d0 \? d0\.templow : null, d0 \? d0\.temperature : null, curT, _fU\)/, 'weather: the day\'s range');
assert.match(w, /\{ min: _rg3\.min, max: _rg3\.max, temp: _fU \? 'F' : 'C'/, 'weather: the ring spans the day');
assert.match(w, /ends: ends3 \}/, 'weather: T/H at the ring\'s ends');
assert.ok(!/\[14, 95\] : \[-10, 35\]/.test(w), 'weather: no longer the fixed scale with forecast');
// The ‹ rebuild draws the same wheel (one function for both).
assert.match(w, /window\._hwRender\[key\]\.stage = \(\) => stage3Of\(\)\.html/, 'weather: ‹ redraws with the same scale');
console.log('weather_dial_scale: ok');
