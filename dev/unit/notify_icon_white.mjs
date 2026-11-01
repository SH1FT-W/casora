// Notification list (owner, 01.11.2026, „B: alle weiß“): every symbol on a coloured circle is white with at least 3 : 1;
// green and orange are filled a step darker for it, yellow (light) keeps its dark symbol (white would need too much).
// Kacheln and popups keep inkOn unchanged – only the list's rows go through notifyTone.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  function notifyTone(tone, ink) {');
const b = core.indexOf('  window._casoraNotifyTone = notifyTone;');
assert.ok(a > 0 && b > a, 'notifyTone in casora-core.js');
const notifyTone = new Function('inkOn', core.slice(a, b) + '\nreturn notifyTone;')(null);
// The colour as a browser resolves it: the token's fallback, mixed with black.
const rgbOf = (f) => {
  const deep = /^var\(--casora-color-\w+-deep, (.+)\)$/.exec(f);
  if (deep) return rgbOf(deep[1]);
  const mix = /^color-mix\(in srgb, (.+) (\d+)%, black\)$/.exec(f);
  if (mix) return rgbOf(mix[1]).map((c) => c * Number(mix[2]) / 100);
  const h = /#([0-9a-f]{6})/i.exec(f);
  return [0, 2, 4].map((i) => parseInt(h[1].substr(i, 2), 16));
};
const lum = (rgb) => { const g = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * g(rgb[0]) + 0.7152 * g(rgb[1]) + 0.0722 * g(rgb[2]); };
const white = (f) => 1.05 / (lum(rgbOf(f)) + 0.05);
// Like inkOn: white where it has 3 : 1, else the dark glyph.
const ink = (f) => (white(f) >= 3 ? 'var(--casora-soft-glyph, #fff)' : 'var(--casora-soft-glyph-dark, rgba(46,34,20,.88))');
const tones = {
  green: 'var(--casora-color-green, #6AAE78)', orange: 'var(--casora-color-orange, #DE8A4E)', blue: 'var(--casora-color-blue, #5B8FC9)',
  teal: 'var(--casora-color-teal, #4E9E95)', red: 'var(--casora-color-red, #D35A4E)', yellow: 'var(--casora-color-yellow, #FFCC00)',
};
for (const k of ['green', 'orange', 'blue', 'teal', 'red']) {
  const t = notifyTone(tones[k], ink);
  assert.ok(white(t) >= 3, k + ': white ≥ 3 : 1 (' + white(t).toFixed(2) + ' on ' + t + ')');
}
assert.equal(notifyTone(tones.blue, ink), tones.blue, 'blue keeps its fill (white already 3 : 1)');
// Owner, 01.11.2026 (picture B): clearly darker – the Casora theme's deep shades, else 75 % with black.
assert.equal(notifyTone(tones.green, ink), 'var(--casora-color-green-deep, color-mix(in srgb, var(--casora-color-green, #6AAE78) 75%, black))', 'green clearly darker');
assert.equal(notifyTone(tones.orange, ink), 'var(--casora-color-orange-deep, color-mix(in srgb, var(--casora-color-orange, #DE8A4E) 75%, black))', 'orange clearly darker');
assert.equal(notifyTone('var(--casora-tone-energy)', (f) => (/color-mix/.test(f) ? 'var(--casora-soft-glyph)' : 'var(--casora-soft-glyph-dark)')).slice(0, 30), 'var(--casora-color-green-deep,', 'tone tokens too');
const theme = fs.readFileSync(new URL('../../custom_components/casora/theme_weich.yaml', import.meta.url), 'utf8');
assert.match(theme, /casora-color-green-deep: "#4F8F5D"/, 'Casora theme: deep green');
assert.match(theme, /casora-color-orange-deep: "#B96A33"/, 'Casora theme: deep orange');
for (const hx of ['#4F8F5D', '#B96A33']) assert.ok(white(hx) >= 3, hx + ': white ≥ 3 : 1 (' + white(hx).toFixed(2) + ')');
assert.equal(notifyTone(tones.yellow, ink), tones.yellow, 'yellow (light) keeps the dark symbol');
assert.equal(notifyTone('var(--casora-color-yellow, #E8B04A)', ink), 'var(--casora-color-yellow, #E8B04A)', 'theme yellow too (white would reach 3 : 1 at 75 %)');
// Only the notification rows use it.
assert.match(core, /iconTone: window\._casoraNotifyTone \? window\._casoraNotifyTone\(toneOf\(r\)\)/, 'notification rows');
assert.equal((core.match(/_casoraNotifyTone\(/g) || []).length, 1, 'nowhere else but the list');
// inkOn reads a mixed colour (color(srgb …)) instead of falling back to the token's own hex.
assert.match(core, /color\\\(srgb/, 'inkOn parses color(srgb …)');
console.log('notify_icon_white: ok');
