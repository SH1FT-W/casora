// @deckt: custom_components/casora/scripts/local/46-screensaver.js#cameras,cameraChoices,pickNext,has custom_components/casora/scripts/local/00-finder.js#notSurveillance
// Screensaver „Cameras“ (owner 13.11.2026): by default („Automatic“) only cameras with a real picture take part;
// robot vacuum maps and 3D printer cameras stay out, by the Cameras tile's rule (casoraDevice.notSurveillance), no
// list of its own. The Studio's list offers every camera; picking one by hand (a printer too) keeps it. Without a
// real camera the kind has nothing to show (sky; skipped in the alternation). All entities invented.
//   node dev/unit/screensaver_cameras.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, createElement: () => ({ style: {} }), addEventListener() {}, head: { appendChild() {} } };
globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { search: '', pathname: '/' };
new Function(read('scripts/local/00-finder.js'))();
new Function(read('scripts/local/46-screensaver.js'))();
const S = window._casoraSaver;
const J = (x) => JSON.parse(JSON.stringify(x));

const hass = { devices: {}, entities: {}, states: {} };
const add = (dev, id, name, key, extra) => {
  if (dev) hass.devices[dev] = hass.devices[dev] || { id: dev, name: dev };
  hass.entities[id] = { entity_id: id, device_id: dev, translation_key: key || null, ...(extra || {}) };
  hass.states[id] = { entity_id: id, state: 'idle', attributes: { friendly_name: name, entity_picture: '/api/camera_proxy/' + id + '?token=x' } };
  return id;
};
const door = add('door', 'camera.example_door', 'Door');
const yard = add('yard', 'camera.example_yard', 'Yard');
// A robot vacuum with a map camera on its device (Valetudo-like, no "map" in the id) …
add('robot', 'vacuum.example_robot', 'Robot');
const robotCam = add('robot', 'camera.example_robot_view', 'Robot view');
// … a map camera on its own (Map Extractor-like, only its name says map) …
const mapCam = add(null, 'camera.example_floor_karte', 'Floor map');
// … and a 3D printer (Bambu-like keys) with its camera.
add('printer', 'sensor.example_printer_status', 'Printer status', 'print_status');
const printerCam = add('printer', 'camera.example_printer_cam', 'Printer camera', 'camera');
// A diagnostic camera is no camera to look at either (as on the Cameras tile).
const diag = add('door', 'camera.example_door_debug', 'Door debug', null, { entity_category: 'diagnostic' });

// Automatic: the real cameras only (before 13.11.2026: every camera, the maps and the printer as dark tiles).
const ids = (list) => J(list.map((c) => c.id));
assert.deepEqual(ids(S.cameras(hass)), [door, yard], 'automatic: no maps, no printer camera');
assert.deepEqual(ids(S.cameras(hass, [])), [door, yard], 'empty pick = automatic');
assert.deepEqual(ids(S.cameras(hass, ['camera.gone'])), [door, yard], 'picked one gone: automatic');
// A pick by hand is kept, a printer camera too (the owner chose it).
assert.deepEqual(ids(S.cameras(hass, [printerCam, door])), [printerCam, door], 'picked: as picked, printer included');
assert.deepEqual(ids(S.cameras(hass, [mapCam])), [mapCam], 'picked: even a map');

// The Studio's list: every camera, each with whether „Automatic“ takes it and why not.
assert.deepEqual(J(S.cameraChoices(hass).map((c) => [c.id, c.auto, c.why])), [
  [door, true, ''], [mapCam, false, 'map'], [printerCam, false, 'printer'], [robotCam, false, 'map'], [yard, true, ''],
], 'choices: all cameras, maps and printer marked');
assert.ok(!S.cameraChoices(hass).some((c) => c.id === diag), 'a diagnostic camera is not offered');

// pickNext: one rule for the Studio's lists (none picked = automatic).
const all = [door, mapCam, printerCam, robotCam, yard], auto = [door, yard];
assert.deepEqual(S.pickNext([], all, auto, printerCam), [door, printerCam, yard], 'from automatic: add the printer');
assert.deepEqual(S.pickNext([], all, auto, door), [yard], 'from automatic: leave one out');
assert.deepEqual(S.pickNext([door, printerCam, yard], all, auto, printerCam), [], 'back to what automatic takes: automatic');
assert.deepEqual(S.pickNext([door], all, auto, door), [], 'the last one out: automatic');
// The lists without an automatic set of their own (what alternates, calendars): automatic = all, as before.
assert.deepEqual(S.pickNext([], ['a', 'b', 'c'], null, 'b'), ['a', 'c']);
assert.deepEqual(S.pickNext(['a', 'c'], ['a', 'b', 'c'], null, 'b'), [], 'all picked again = all');
assert.deepEqual(S.pickNext(['c'], ['a', 'b', 'c'], null, 'a'), ['a', 'c'], 'kept in list order');

// Only maps and a printer: the kind has nothing to show (the sky; skipped in the alternation).
const only = { devices: {}, entities: {}, states: {} };
Object.assign(only.devices, hass.devices);
[robotCam, mapCam, printerCam, 'vacuum.example_robot', 'sensor.example_printer_status'].forEach((id) => {
  only.entities[id] = hass.entities[id]; only.states[id] = hass.states[id];
});
assert.equal(S.cameras(only).length, 0, 'no real camera: none');
assert.equal(S.has('kameras', { hass: only, vars: {} }), false, 'no real camera: nothing to show');
assert.equal(S.has('kameras', { hass: only, vars: { casora_screensaver_cameras: [printerCam] } }), true, 'the printer picked by hand: shown');
assert.ok(!J(S.pool({}, (id) => S.has(id, { hass: only, vars: {} }))).includes('kameras'), 'alternation skips it');
const now = new Date(2026, 10, 13, 12, 0);
const h = S.html('kameras', S.context({ hass: only, now, vars: {}, kind: 'kameras', sun: { rise: new Date(2026, 10, 13, 7, 30), set: new Date(2026, 10, 13, 16, 40) }, rooms: [] }));
assert.ok(/data-kind="himmel"/.test(h), 'on its own: the sky');
console.log('screensaver_cameras: ok');
