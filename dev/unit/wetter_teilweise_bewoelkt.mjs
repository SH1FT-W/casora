// Prüfrunde d03-08: the same weather had two words on one screen – „Teilweise bewölkt“ on the home page's weather
// (Casora's tile, as HA says it) and „Teils bewölkt“ in the weather popup right under it. One word everywhere:
// „Teilweise bewölkt“ (tile, popup, screensaver sample).
//   node dev/unit/wetter_teilweise_bewoelkt.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_weather custom_components/casora/scripts/local/46-screensaver.js#S.sample
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sources = ['dashboards/casora/button_card_templates.json', 'custom_components/casora/scripts/local/46-screensaver.js'];
for (const p of sources) assert.ok(!read(p).includes('Teils bewölkt'), p + ': „Teils bewölkt“ left');
const tpl = read('dashboards/casora/button_card_templates.json');
const words = [...tpl.matchAll(/partlycloudy'?:\s*\[?\s*'([^']*bewölkt)'/g)].map((m) => m[1]);
assert.ok(words.length >= 3, 'weather words found: ' + words.length);
assert.deepEqual([...new Set(words)], ['Teilweise bewölkt'], 'one word for partlycloudy');
console.log('wetter_teilweise_bewoelkt: ok');
