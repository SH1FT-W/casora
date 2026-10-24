// Weather warning colour: the bell's row was red for every warning in the Soft look (colour from the
// icon), the tile yellow for „Minor“; an extreme warning counted as none on the tile („Extrem“ instead of
// NINA's „Extreme“). Expected: the bell row carries the tile's colour per level (casoraWarnHue).
//   node dev/unit/wetterwarnung_farbe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
// The tile's expressions read window.casoraWarnings (01-basis.js, #55) – load the normaliser along with the hue.
globalThis.window = {};
new Function('window', basis.match(/  window\.casoraWarnHue = function \(sev\) \{[\s\S]*?\n  \};\n/)[0])(window);
new Function('window', basis.match(/  window\.casoraWarnings = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/)[0])(window);

let tileColour = null;
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(walk);
  for (const [k, v] of Object.entries(o)) {
    if (k === '--casora-icon-color-current' && typeof v === 'string' && v.includes('casoraWarnings')) tileColour = v;
    else walk(v);
  }
})(T.casora_weather_warning);
assert.ok(tileColour, 'tile colour expression');
const tile = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', tileColour.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
for (const sev of ['Minor', 'Moderate', 'Severe', 'Extreme']) {
  const states = { 'binary_sensor.w': { state: 'on', attributes: { severity: sev } } };
  assert.equal(window.casoraWarnHue(sev), tile(states, { entity_id: 'binary_sensor.w' }, {}, {}, {}), 'same colour for ' + sev);
}
assert.ok(!JSON.stringify(T.casora_weather_warning).includes("'Extrem'"), 'tile knows NINA’s „Extreme“');
assert.ok(basis.includes('hue: window.casoraWarnHue(w.severity),'), 'bell row carries the level colour');
assert.ok(core.includes('if (r.hue) return r.hue;'), 'Soft tone takes the row’s own colour');
console.log('ok wetterwarnung_farbe');
