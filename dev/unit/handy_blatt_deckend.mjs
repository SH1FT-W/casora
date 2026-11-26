// @deckt: custom_components/casora/panel/casora-panel-b.js#css,custom_components/casora/panel/casora-panel-b-plus.js#css
// The Studio's sheet on the phone (settings, content) and its bottom bar are opaque in light too (Prüfrunde u03-10):
// light used --bar-solid at 96 %, and „Zuhause“, „Sicherheit“ of the preview showed through behind the settings.
//   node dev/unit/handy_blatt_deckend.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + p, import.meta.url), 'utf8');
const b = read('casora-panel-b.js'), plus = read('casora-panel-b-plus.js'), panel = read('casora-panel.js');

// The phone's rules for the sheet and the bar hold in both modes, with the opaque pane.
assert.match(b, /:host\(\.bmode\.phone\) \.inspector \{ background:var\(--pane-solid/, 'the sheet: the opaque pane, light and dark');
assert.match(plus, /:host\(\.bmode\.phone\) \.bbar \{ background:var\(--pane-solid/, 'the bar: the opaque pane, light and dark');
assert.doesNotMatch(b + plus, /:host\(\.bmode\.phone:not\(\.is-light\)\) \.(inspector|bbar) \{ background/, 'not for dark only');

// And that pane is opaque in the phone's light mode (no alpha below 1).
const light = panel.slice(panel.indexOf(':host(.phone.is-light) {'));
const solid = (light.match(/--pane-solid:var\(--casora-studio-phone-pane-solid, ([^;]+)\);/) || [])[1];
assert.ok(solid, 'phone light defines --pane-solid');
assert.doesNotMatch(solid, /rgba\([^)]*,\s*0?\.\d+\)/, 'opaque: ' + solid);
console.log('handy_blatt_deckend: ok');
