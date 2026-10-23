// One table per device kind: the 3D printer's Studio fields (find.print) name fields of the card's own table
// (casoraDevice.printerFields), the washer/dryer fields (find.laundry) the card's source fields
// (casoraLaundryFind.SOURCES); no file keeps a second key list. "Is this a printer?" and "is this camera a map?"
// are one rule each (casoraDevice.isPrinter, notSurveillance). All entities invented.
//   node dev/unit/printer_studio_fields.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, createElement: () => ({ style: {} }), addEventListener() {}, head: { appendChild() {} } };
new Function(read('scripts/local/00-finder.js'))();
const CD = window.casoraDevice, LF = window.casoraLaundryFind;
assert.ok(CD && CD.printerFields && CD.isPrinter && CD.notSurveillance, 'casoraDevice printer/camera rules');

// ── Every Studio field names a field of the shared tables ────────────────────
const types = read('panel/casora-panel-types.js');
const print = [...types.matchAll(/find: \{ print: "([A-Za-z]+)" \}/g)].map((m) => m[1]);
assert.ok(print.length >= 15, 'printer fields use find.print: ' + print.length);
print.forEach((n) => assert.ok(CD.printerFields[n], 'printer table knows ' + n));
const laundry = [...types.matchAll(/find: \{ laundry: "([A-Za-z]+)" \}/g)].map((m) => m[1]);
assert.deepEqual(laundry, ['progress', 'remaining'], 'laundry fields use find.laundry');
laundry.forEach((n) => assert.ok(LF.sources.some((s) => s.fields[n]), 'a laundry source has ' + n));
// No second copy of the keys.
assert.doesNotMatch(types, /print_status|keys: \["stage"|cycle_progress|sensor_remaining_program_time/, 'no printer/laundry keys in the Studio types');
assert.doesNotMatch(read('scripts/local/02-devices.js'), /var FIND = \{|'print_status'/, 'no printer table in 02-devices.js');
assert.doesNotMatch(read('panel/casora-panel-assist.js'), /print_status|"stage"|casora_dishwasher", keys|_map\|karte/, "assistant has no own printer/dishwasher keys or map rule");
assert.doesNotMatch(read('panel/casora-panel.js'), /"print_status"|"print_progress"|"sensor_operation_state"/, 'panel has no own printer/dishwasher keys');

// ── Printer and camera rules ──────────────────────────────────────────────────
const hass = { devices: {}, entities: {}, states: {} };
const reg = (dev, id, key) => {
  hass.devices[dev] = hass.devices[dev] || { id: dev, name: dev };
  hass.entities[id] = { entity_id: id, device_id: dev, translation_key: key };
  hass.states[id] = { entity_id: id, state: 'x', attributes: {} };
  return id;
};
reg('pr', 'sensor.example_pr_status', 'print_status');
const prCam = reg('pr', 'camera.example_pr_cam', 'camera');
reg('st', 'sensor.example_st_stage', 'stage');
reg('sw', 'switch.example_sw_stage', 'stage');
reg('vac', 'vacuum.example_robot', null);
const vacCam = reg('vac', 'camera.example_robot_live', null);
const door = reg('door', 'camera.example_door', null);
const map2 = reg('nomap', 'camera.example_robot_map_2', null);
const karte = reg('nomap', 'camera.example_wohnungskarte', null);
assert.ok(CD.isPrinter(hass, 'pr') && CD.isPrinter(hass, prCam), 'print status: printer (device or entity)');
assert.ok(CD.isPrinter(hass, 'st'), 'stage sensor: printer');
assert.ok(!CD.isPrinter(hass, 'sw'), 'a switch with key stage is no printer');
assert.ok(!CD.isPrinter(hass, 'vac') && !CD.isPrinter(hass, 'nope'), 'robot / unknown: no printer');
assert.deepEqual(CD.printerKeys, ['print_status', 'stage'], 'printer keys from the table');
assert.ok(CD.notSurveillance(hass, prCam, true) && !CD.notSurveillance(hass, prCam, false), 'printer camera: out of auto lists only');
assert.ok(CD.notSurveillance(hass, vacCam, false), 'robot camera: never surveillance');
assert.ok(CD.notSurveillance(hass, map2, false) && CD.notSurveillance(hass, karte, false), 'maps by name (_map_2, …karte)');
assert.ok(!CD.notSurveillance(hass, door, true), 'door camera stays');
['robby_map', 'erdgeschoss_karte', 'maps', 'karten_eg', 'wohnungskarte', 'karte_2'].forEach((x) => assert.ok(CD.isMapName(x), 'map: ' + x));
['roadmap', 'haustuer', 'mapping_cam', 'karteikarten_box'].forEach((x) => assert.ok(!CD.isMapName(x), 'no map: ' + x));
// The Cameras tile asks the same rule.
const cams = window._casoraCams({}, null, hass);
assert.deepEqual(cams, [door], 'cameras tile: only the door camera');
assert.deepEqual(window._casoraCams({ cameras: [prCam, map2, door] }, null, hass), [prCam, door], 'chosen: printer stays, map goes');

// ── Studio lookups as casora-panel-types.js found() does them ───────────────
// Laundry: the source's field (WashData cycle_progress, Home Connect program_finish_time).
const wh = { devices: { wd: { id: 'wd', name: 'W' } }, entities: {}, states: {} };
const wreg = (id, key, platform, state = 'x', attributes = {}) => {
  wh.entities[id] = { entity_id: id, device_id: 'wd', translation_key: key, platform };
  wh.states[id] = { entity_id: id, state, attributes };
};
wreg('sensor.example_wd_state', 'washer_state', 'ha_washdata', 'running', { icon: 'mdi:washing-machine' });
wreg('sensor.example_wd_pct', 'cycle_progress', 'ha_washdata', '40');
wreg('sensor.example_wd_left', 'time_remaining', 'ha_washdata', '30');
const c = LF.forEntity(wh, 'sensor.example_wd_state');
assert.deepEqual([c.f.progress, c.f.remaining], ['sensor.example_wd_pct', 'sensor.example_wd_left'], 'WashData fields');
console.log('ok printer_studio_fields');
