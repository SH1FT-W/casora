// Prüfrunde d01-02: the Studio preview drew some tiles unlike the dashboard. The unlocked lock had a teal circle
// (dashboard: --casora-lock-unlocked-color, orange in Weich), an "on" switch was a dark cut-out (dashboard, solid
// style: accent track with a white knob), and the weather was the outline cloud (Weich: the filled file).
//   node dev/unit/vorschau_schloss_wetter.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#weatherSrc,WEATHER_SVG,LOCK_UNLOCKED_TINT
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));

// 1. Weather: same file as the dashboard, filled when the design asks for it.
const a = src.indexOf('const WEATHER_SVG = {');
const b = src.indexOf('// Fallback glyph per tile kind');
assert.ok(a > 0 && b > a, 'weather block found');
const W = new Function(src.slice(a, b) + '\nreturn { weatherSrc: typeof weatherSrc === "function" ? weatherSrc : null, WEATHER_SVG };')();
assert.ok(W.weatherSrc, 'weatherSrc exists');
assert.equal(W.weatherSrc('cloudy', true), '/casora_assets/weather/cloudy-fill.svg', 'Weich: filled cloud');
assert.equal(W.weatherSrc('cloudy', false), '/casora_assets/weather/cloudy.svg', 'other designs: outline');
assert.equal(W.weatherSrc('windy', true), '/casora_assets/weather/wind.svg', 'no filled wind file: outline');
// The dashboard's list of filled files is the preview's list.
const dashFill = /const _hasFill = \[([^\]]*)\]/.exec(JSON.stringify(T));
assert.ok(dashFill, 'dashboard fill list found');
for (const f of dashFill[1].match(/[a-z-]+/g)) {
  const cond = Object.keys(W.WEATHER_SVG).find((k) => W.WEATHER_SVG[k] === f);
  if (cond) assert.equal(W.weatherSrc(cond, true), '/casora_assets/weather/' + f + '-fill.svg', f + ': filled like the dashboard');
}
for (const call of src.matchAll(/(\w+)\.src = (.*)weather/g)) {
  assert.ok(/wsrc \|\| iconUrl\("weather"\)/.test(call[0] + src.slice(call.index, call.index + 80)), 'preview weather img uses weatherSrc: ' + call[0]);
}

// 2. Lock: the dashboard's unlocked color.
const tint = /const LOCK_UNLOCKED_TINT = "([^"]+)"/.exec(src);
assert.ok(tint, 'LOCK_UNLOCKED_TINT exists');
assert.ok(JSON.stringify(T.casora_lock).includes('"--casora-icon-color-current":"' + tint[1] + '"'),
  'preview lock circle = dashboard unlocked color (' + tint[1] + ')');
assert.ok(/isLock && (active && )?isUnlocked \? LOCK_UNLOCKED_TINT/.test(src), 'unlocked lock gets the tint');

// 3. Switch on, solid style: accent track and white knob, like the dashboard's toggle.
const onFill = /'var\(--casora-toggle-on-fill, var\(--casora-lps-switch-on, #B67A50\)\)'/.test(JSON.stringify(T));
assert.ok(onFill, 'dashboard solid on-track found');
assert.ok(/\.card\.map\.soft \.mtile\.on \.mtgl rect \{ fill:var\(--casora-toggle-on-fill, var\(--casora-lps-switch-on, #B67A50\)\); mask:none; \}/.test(src),
  'preview: accent track');
assert.ok(/\.card\.map\.soft \.mtile\.on \.mtgl circle \{ fill:#fff; \}/.test(src), 'preview: white knob');
assert.ok(/mask="url\(#' \+ mid \+ '\)"\/><circle cx="32" cy="13" r="9" fill="none"\/>/.test(src), 'on switch carries a knob to fill');
console.log('vorschau_schloss_wetter: ok');
