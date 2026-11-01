// Weather dial (final review 01.11.2026): a fixed scale −10 … 35 °C (14 … 95 °F) coloured by the absolute temperature,
// not the day's range coloured blue → red (10 °C looked hot on a day from 8 to 11). The day's low and high are a band
// with „T 8°“ / „H 11°“ at their places; values outside the scale sit at its ends.
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
// The dial: a fixed scale, the band and its labels, the knob where „now“ is.
assert.match(core, /if \(ring\.temp\) \{/, 'dialSvg draws the temperature ring');
assert.match(core, /class="hui-dl-tag /, 'band labels at their places');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const w = tpl.casora_weather.tap_action.casora_popup.content;
assert.match(w, /_fU \? \[14, 95\] : \[-10, 35\]/, 'weather: fixed scale −10 … 35 °C / 14 … 95 °F');
assert.match(w, /temp: _fU \? 'F' : 'C'/, 'weather: temperature ring');
assert.match(w, /bandLabels: _band3 \? \['T ' \+ r0\(_lo3\) \+ '°', 'H ' \+ r0\(_hi3\) \+ '°'\]/, 'weather: T/H at the band');
assert.ok(!/heat: true, dot: true/.test(w), 'weather: no longer the day range coloured blue → red');
// The ‹ rebuild draws the same wheel (one function for both).
assert.match(w, /window\._hwRender\[key\]\.stage = \(\) => stage3Of\(\)\.html/, 'weather: ‹ redraws with the same scale');
console.log('weather_dial_scale: ok');
