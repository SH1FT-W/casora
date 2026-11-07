// Owner, 06.11.2026: the hero weather line read „H 9° · T 0° · 0 % Regen“ – a rain chance of 0 says nothing.
// The line shows the rain chance only above 0.
//   node dev/unit/weather_hero_rain_zero.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_weather
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_weather.name;
const at = src.indexOf('% Regen</span>');
assert.ok(at > 0, 'hero rain chance found');
const line = src.slice(src.lastIndexOf('\n', at), at);
// Run the guard of that line with 0, 30 and no value.
const guard = line.match(/if \(([^)]*(?:\([^)]*\))?[^)]*)\) parts\.push/);
assert.ok(guard, 'rain chance is pushed under a condition');
const shows = (pp) => new Function('pp', 'return ' + guard[1])(pp);
assert.equal(shows(0), false, '0 % Regen stays out');
assert.equal(shows(null), false, 'no forecast value stays out');
assert.equal(shows(30), true, '30 % Regen shows');
console.log('ok weather_hero_rain_zero');
