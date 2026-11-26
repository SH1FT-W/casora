// Test round 26.11.2026 (d04-14): the Studio's bell settings drew filled squares with a white symbol, the screensaver's
// „Take turns“ list pale circles with a coloured symbol. Decision: the bell's symbols like the rest of the settings.
// The bell's rows (.row .rowicon, fields with a glyph) are now a pale circle in the row's colour with the symbol in
// that colour; switched off grey on a faint circle, like a left-out screensaver.
//   node dev/unit/bell_settings_icons.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_flowRow,rowicon custom_components/casora/panel/casora-panel-settings.js#cs-saver-ic
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const P = read('custom_components/casora/panel/casora-panel.js');
const rule = (sel) => {
  const i = P.indexOf(sel.endsWith(';') ? sel : sel + ' {');
  return i < 0 ? '' : P.slice(i, P.indexOf('}', i));
};
const ic = rule('.row .rowicon { --sicon:32px;');
assert.ok(ic, 'bell row symbol rule');
assert.match(ic, /border-radius:50%/, 'a circle like .cs-saver-ic');
assert.match(ic, /background-color:color-mix\(in srgb, var\(--sc, var\(--ink\)\) 18%, transparent\)/, 'pale circle in the row colour (18 % like the saver)');
assert.match(rule('.row .rowicon::after'), /background-color:var\(--sc, var\(--ink\)\)/, 'symbol in the row colour, not white');
const off = rule(':host .row:has(.sw[aria-checked="false"]) > label .rowicon::after');
assert.match(off, /var\(--ink-3/, 'off: grey symbol');
assert.match(rule(':host .row:has(.sw[aria-checked="false"]) > label .rowicon'), /var\(--wash-faint/, 'off: faint circle');
// The screensaver list this follows.
const S = read('custom_components/casora/panel/casora-panel-settings.js');
assert.match(S, /\.cs-saver-ic\{[^}]*border-radius:50%/);
assert.match(S, /\.cs-saver-row\[aria-pressed=\\"true\\"\] \.cs-saver-ic\{color:var\(--cs-tone\);background:color-mix\(in srgb, var\(--cs-tone\) 18%, transparent\);\}/);
// The bell's fields are the rows that carry a glyph.
assert.match(P, /key: "notify_safety", sub: "safety", glyph: "exclamation"/);
assert.match(P, /gi\.className = "sicon rowicon";/);
console.log('bell_settings_icons: ok');
