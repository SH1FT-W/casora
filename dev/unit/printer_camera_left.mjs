// Owner request (01.11.2026): in the two-column 3D printer popup (v3) the camera image sits in the left column right
// under the dial, its AI button directly below, and the right column holds no camera section. The phone reads
// dial → camera → AI → lists. Without a camera the layout stays as before. Covers the generic H.layout option
// (underStage) and the printer popup that uses it.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  getElementById: () => null, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
try { new Function(src('02-devices.js'))(); } catch (e) { /* the rest needs a DOM – H and the printer exist before */ }
const H = window._casoraHH, P = window._casoraPrint;
assert.ok(H && H.layout && P && P.popup, 'layout helper and printer popup loaded');

// Stubs for the parts that need a browser: Soft + v3 on, the shared UI blocks, the camera AI module.
H.on = () => true;
window._casoraDish = Object.assign(window._casoraDish || {}, { v3: () => true });
window._casoraUI = Object.assign(window._casoraUI || {}, { settings: () => '<div>set</div>', empty: () => '<div>off</div>' });
window._casoraCamAi = { inline: () => '<div>ai</div>' };
window._casoraLaundry.fetch = () => {};

const keysOf = (card) => {
  const g = ((card.styles || {}).grid || []).find((x) => x['grid-template-areas']);
  return g ? g['grid-template-areas'].replace(/"/g, '').split(/\s+/).filter(Boolean) : [];
};

// H.layout: underStage keeps the named fields under the stage (after the Verlauf), the rest goes right.
const f = { stage: '[[[ return "s"; ]]]', chart: '<div>c</div>', cam: { card: { type: 'picture-entity' } }, camai: '<div>ai</div>',
  list: '[[[ return "l"; ]]]', more: { card: { type: 'custom:button-card' } } };
const hl = H.layout({ entity: 'sensor.x', watch: [], fields: f, top: [], stage: 'stage', left: ['list'], right: ['cam', 'camai', 'more'],
  underStage: ['cam', 'camai'] });
assert.deepEqual(keysOf(hl.custom_fields.left.card), ['stage', 'chart', 'cam', 'camai'], 'H.layout: left = stage, Verlauf, camera, AI');
assert.deepEqual(keysOf(hl.custom_fields.right.card), ['list'], 'H.layout: right = lists only');
// A missing camera leaves the layout as without underStage.
const nf = Object.assign({}, f); delete nf.cam; delete nf.camai;
const hn = H.layout({ entity: 'sensor.x', watch: [], fields: nf, top: [], stage: 'stage', left: ['list'], right: ['cam', 'camai', 'more'], underStage: ['cam', 'camai'] });
assert.deepEqual(keysOf(hn.custom_fields.left.card), ['stage', 'chart'], 'H.layout: no camera, left unchanged');

// The printer popup (printing, with a camera).
const st = (s, a) => ({ state: s, attributes: a || {} });
const V = { entity_state: 'sensor.p_stage', entity_progress: 'sensor.p_progress', entity_camera: 'camera.p_cam',
  entity_task_name: 'sensor.p_task', btn_pause: 'button.p_pause', btn_stop: 'button.p_stop', entity_light: 'light.p_light' };
const states = { 'sensor.p_stage': st('printing'), 'sensor.p_progress': st('53'), 'sensor.p_task': st('Job'),
  'camera.p_cam': st('idle', { entity_picture: '/api/camera_proxy/camera.p_cam?token=x' }), 'button.p_pause': st('unknown'),
  'button.p_stop': st('unknown'), 'light.p_light': st('on') };
const ent = { entity_id: 'sensor.p_stage' };
const pop = P.popup(ent, V, states, { states });
const left = keysOf(pop.custom_fields.left.card), right = keysOf(pop.custom_fields.right.card);
assert.deepEqual(left, ['stage', 'cam', 'camai'], 'printer v3: left = dial, camera, AI button');
assert.ok(!right.some((k) => /^cam/.test(k)), 'printer v3: no camera section on the right (' + right.join(',') + ')');
assert.ok(right.includes('ctrl') && right.includes('job'), 'printer v3: control and print stay on the right');
assert.ok(!/#cam \{ margin-top: 0/.test(pop.custom_fields.left.card.extra_styles), 'printer v3: camera keeps the section gap under the dial');
assert.equal(pop.custom_fields.left.card.custom_fields.cam.card.type, 'picture-entity', 'printer v3: live picture under the dial');
// Phone: one grid column, left before right → dial, camera, AI, then the lists.
assert.deepEqual(keysOf(pop).filter((k) => k !== 'more'), ['left', 'right'], 'printer v3: phone reads left before right');

// Without a camera the popup keeps its former layout: only the dial on the left.
const V2 = Object.assign({}, V); delete V2.entity_camera;
const pop2 = P.popup(ent, V2, states, { states });
assert.deepEqual(keysOf(pop2.custom_fields.left.card), ['stage'], 'printer v3 without camera: left = dial only');
console.log('printer_camera_left: ok');
process.exit(0);
