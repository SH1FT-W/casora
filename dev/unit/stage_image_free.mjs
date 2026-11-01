// Popup v3 image stage (S5: camera, doorbell, Frigate, game picture): the picture stands free – no stage plate
// (background, padding, plate radius) around it; the picture keeps its own rounded corners (popup row radius).
// Other stage types keep the plate. Static, without HA:  node dev/unit/stage_image_free.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const cam = rd('custom_components/casora/scripts/local/07-weich-spezial.js');

const m = core.match(/var STAGE_CSS = ([\s\S]*?);\n/);
assert.ok(m, 'STAGE_CSS missing');
const css = m[1];
const rule = (sel) => { const r = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return r ? r[1] : null; };

// The base plate is still there for the other stage types.
const base = rule("'.hui-stage");
assert.ok(base && /soft-row-fill/.test(base) && /padding:var\(--casora-v3-stage-pad/.test(base), 'base stage plate missing');
// S5 drops it.
const s5 = rule('.hui-stage.s5');
assert.ok(s5, 'S5 stage: no rule that drops the plate');
assert.match(s5, /background:\s*none/, 'S5 stage keeps the plate background');
assert.match(s5, /padding:\s*0/, 'S5 stage keeps the plate padding');
// The picture keeps its own rounding, no longer concentric to a plate.
const img = rule('.hui-st-img');
assert.ok(img, '.hui-st-img rule missing');
assert.match(img, /border-radius:\s*var\(--casora-popup-row-radius/, 'S5 picture not rounded with the popup row radius');
assert.doesNotMatch(img, /stage-pad/, 'S5 picture still rounded concentric to the stage plate');
assert.match(img, /overflow:\s*hidden/, 'S5 picture does not clip to its corners');
// Camera live picture in the stage: same radius, not the plate's inner radius.
const camRule = cam.match(/\.hui-st-img \.cam-stream-mount \{([^}]*)\}/);
assert.ok(camRule, 'camera stage picture rule missing');
assert.doesNotMatch(camRule[1], /stage-pad/, 'camera picture still rounded concentric to the stage plate');
assert.match(camRule[1], /--casora-popup-row-radius/, 'camera picture not rounded with the popup row radius');
console.log('stage_image_free: ok');

// Big view (o.zoom): the picture is a key „Vergrößern“, the minimize key „Verkleinern“ (fullscreen-exit) sits inside
// and only shows in the big view; the camera popup asks for it.
assert.match(css, /\.hui-st-zx\{display:none;\}/, 'minimize key not hidden outside the big view');
assert.match(css, /\.hui-st-img\.big\{position:fixed;inset:0;[^}]*background:rgb\(0,0,0\)/, 'big view without the dark full-screen backdrop');
assert.match(css, /\.hui-st-img\.big \.hui-st-zx\{display:flex;/, 'minimize key does not show in the big view');
const b0 = core.indexOf("} else if (code === 'S5') {");
const body = core.slice(b0, core.indexOf("} else if (code === 'S6') {", b0));
assert.match(body, /o\.zoom \? ' data-casora-zoom="" role="button" tabindex="0" aria-label="' \+ esc\(T_\('Vergrößern'\)\)/, 'zoomable picture is not a key „Vergrößern“');
assert.match(body, /class="hui-st-zx" role="button" tabindex="0" aria-label="' \+ esc\(T_\('Verkleinern'\)\) \+ '"><ha-icon icon="mdi:fullscreen-exit">/, 'minimize key „Verkleinern“ missing');
// Big view: top layer (nothing moved, the live view keeps running), Esc, back gesture, swipe down; only with a picture.
const zoom = core.slice(core.indexOf('var stageZoom = function'), core.indexOf('(function zoomListen()'));
assert.match(zoom, /showPopover\(\)/, 'big view not in the top layer');
assert.match(zoom, /if \(on && !zoomHasPic\(z\)\) return;/, 'big view also for the offline placeholder');
assert.match(zoom, /history\.pushState/, 'back gesture would close the popup instead of the big view');
assert.match(zoom, /'Escape'/, 'Esc does not close the big view');
assert.match(zoom, /clientY - y0 > 80/, 'swipe down does not close the big view');
assert.doesNotMatch(zoom, /appendChild|insertBefore/, 'big view moves the picture (the live stream would restart)');
const tpl = JSON.parse(rd('custom_components/casora/panel/casora-templates.json')).templates.casora_popup_camera;
assert.ok(/stage\('image', \{ html: streamHtml, zoom: true,/.test(JSON.stringify(tpl)), 'camera popup does not ask for the big view');
for (const l of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ph = JSON.parse(rd(`custom_components/casora/translations/dashboard/phrases/${l}.json`));
  assert.ok(ph['Vergrößern'] && ph['Verkleinern'], `phrases ${l}: Vergrößern/Verkleinern missing`);
}
console.log('stage_image_free (big view): ok');
