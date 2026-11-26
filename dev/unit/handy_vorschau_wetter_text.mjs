// Studio phone preview (Prüfrunde u01-07): the weather read "Teilweise Bewölkt" (every word capitalised) while the
// dashboard shows HA's word "Teilweise bewölkt". The JS already capitalises the first letter; the CSS must not
// capitalise each word on top.
//   node dev/unit/handy_vorschau_wetter_text.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#mp-wcond
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const rules = [...src.matchAll(/[^{}]*\.mp-wcond[^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
assert.ok(rules.length, '.mp-wcond rules');
for (const r of rules) assert.ok(!/text-transform\s*:\s*capitalize/.test(r), 'no word-wise capitalisation: ' + r.trim());
assert.ok(/c\.textContent = cond \? cond\.charAt\(0\)\.toUpperCase\(\)/.test(src), 'first letter capitalised in JS');
console.log('ok handy_vorschau_wetter_text');
