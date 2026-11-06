// The 3D printer popup's head said „Bereit“ (the job stage sensor the tile is bound to, idle) over a stage saying
// „Fehlgeschlagen“ (the print status). The popup names the print status as its head entity (casora_popup.head_entity),
// so head and stage speak for the same entity and state.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  getElementById: () => null, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
const root = new URL('../../', import.meta.url);
const src = (p) => fs.readFileSync(new URL('custom_components/casora/scripts/local/' + p, root), 'utf8');
try { new Function(src('02-devices.js'))(); } catch (e) { /* the rest needs a DOM – the printer exists before */ }
const P = window._casoraPrint;
assert.ok(P, 'printer helper loaded');
assert.equal(typeof P.headEntity, 'function', 'the printer names its head entity');

const st = (s) => ({ state: s, attributes: {} });
const states = { 'sensor.p_stage': st('idle'), 'sensor.p_status': st('failed') };
const hass = { states, entities: {} };
window.casoraDevice = { deviceOf: () => 'dev1', map: () => ({ stage: 'sensor.p_stage', status: 'sensor.p_status' }), companionPlug: () => null,
  printerFields: {}, printerKeys: [] };
const ent = { entity_id: 'sensor.p_stage' };
assert.equal(P.headEntity(ent, {}, states, hass), 'sensor.p_status', 'head = the print status the stage shows');
assert.equal(P.state(P.resolve(ent, {}, states, hass), states)[0], 'Fehlgeschlagen', 'the stage word comes from that entity');
// Without a print status the head stays on the tile's entity.
window.casoraDevice.map = () => ({ stage: 'sensor.p_stage' });
assert.equal(P.headEntity(ent, {}, states, hass), null, 'no status: the tile entity');

// The popup template passes it on.
const tpl = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
for (const k of ['tap_action', 'icon_tap_action']) {
  assert.match(String(tpl.casora_popup_3d_printer[k].casora_popup.head_entity || ''), /_casoraPrint\.headEntity\(/, k + ': head_entity');
}
console.log('printer_head_entity: ok');
// All checked. 02-devices.js keeps polling for window.casoraPopup (250 ms, up to 60 s), which this test never
// defines; without an explicit exit node idles until that interval gives up.
process.exit(0);
