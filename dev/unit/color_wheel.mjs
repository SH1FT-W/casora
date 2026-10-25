// Light popup, variant B (25.10.2026): the rainbow circle first in the color row opens a color wheel page.
// Checks the wheel geometry (red right, clockwise like HA, saturation from the centre), the hue of a light
// from rgb_color (some integrations report hs_color [0, 0]), and the color row of casora_light: rainbow
// circle with data-casora-wheel, seven preset colors (no pink), ring on the matching preset or the rainbow.
//   node dev/unit/color_wheel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const R = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: () => {} };
new Function(R('custom_components/casora/scripts/local/33-color-wheel.js'))();
const CW = window._casoraColorWheel;

assert.deepEqual(CW.hsAt(1, 0), [0, 100], 'right edge = red, full');
assert.deepEqual(CW.hsAt(0, 1), [90, 100], 'clockwise: below = 90°');
assert.deepEqual(CW.hsAt(-0.5, 0), [180, 50], 'left half way = cyan, 50 %');
assert.deepEqual(CW.hsAt(3, 0), [0, 100], 'outside the wheel = edge');
const p = CW.posOf([180, 100]);
assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y - 50) < 1e-9, 'cyan at the left edge');
assert.deepEqual(CW.hsOf({ hs_color: [0, 0], rgb_color: [255, 128, 0] }), [30, 100], 'hue from rgb_color, not hs [0,0]');
assert.deepEqual(CW.hsOf({ hs_color: [200, 40] }), [200, 40], 'hs_color without rgb');
assert.equal(CW.hsOf({}), null);

const tpl = JSON.parse(R('custom_components/casora/panel/casora-templates.json')).templates.casora_light.tap_action.casora_popup.content;
assert.ok(tpl.includes('data-casora-wheel=') && tpl.includes('hl-rb'), 'rainbow circle in the color row');
assert.ok(!tpl.includes("'#FF2D55', 340"), 'pink gave way to the rainbow circle');
assert.ok(tpl.includes('window._casoraColorWheel.hsOf(a)'), 'ring follows the hue from hsOf');
assert.ok(R('custom_components/casora/scripts/casora-local.js').includes("'33-color-wheel'"), 'module loaded');
console.log('ok color_wheel');
