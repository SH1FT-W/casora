// Bell (casora-core.js vacSide): the robot vacuum's status, progress and last cleaning end come from the card's
// field table (casoraDevice.vacuumFields in 00-finder.js) – through the popup module when it is loaded, the table
// directly when it is not. Only sensors the table does not know (no translation_key, e.g. MQTT) go by entity id.
//   node dev/unit/vacuum_bell_fields.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, createElement: () => ({ style: {} }), addEventListener() {}, head: { appendChild() {} } };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
assert.ok(window.casoraDevice && window.casoraDevice.vacuumFields, 'finder loaded');

const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  function vacSide(hass, id) {');
assert.ok(a > 0, 'vacSide found');
const b = core.indexOf('\n  }\n', a);
const vacSide = new Function(core.slice(a, b + 4) + '\nreturn vacSide;')();

const ISO = '2026-10-20T09:30:00+00:00';
const st = (id, state) => ({ entity_id: id, state, attributes: {} });
const ent = (device_id, translation_key) => ({ device_id, translation_key });

// Dreame-like robot: progress and history on the robot, status on its station (a sibling device).
const dreame = {
  devices: {
    d_robot: { id: 'd_robot', name: 'Robby', manufacturer: 'Dreametech', area_id: 'flur' },
    d_dock: { id: 'd_dock', name: 'Robby Station', manufacturer: 'Dreametech', area_id: 'flur' },
  },
  entities: {
    'vacuum.robby': ent('d_robot', null),
    'sensor.robby_fortgang': ent('d_robot', 'cleaning_progress'),
    'sensor.robby_verlauf': ent('d_robot', 'cleaning_history'),
    'sensor.station_zustand': ent('d_dock', 'status'),
  },
  states: {
    'vacuum.robby': st('vacuum.robby', 'docked'),
    'sensor.robby_fortgang': st('sensor.robby_fortgang', '40'),
    'sensor.robby_verlauf': st('sensor.robby_verlauf', ISO),
    'sensor.station_zustand': st('sensor.station_zustand', 'washing_the_mop'),
  },
};

// Without the popup module: the table directly (the station's status was out of reach before).
delete window._casoraVac;
assert.deepEqual(vacSide(dreame, 'vacuum.robby'),
  { status: 'sensor.station_zustand', progress: 'sensor.robby_fortgang', lastEnd: 'sensor.robby_verlauf' },
  'no popup module: casoraDevice.vacuumFields on robot and station');

// With the popup module: its answer, the table is not asked again.
window._casoraVac = { resolve: () => ({ status: 'sensor.a', progress: 'sensor.b', lastEnd: 'sensor.c' }) };
assert.deepEqual(vacSide(dreame, 'vacuum.robby'), { status: 'sensor.a', progress: 'sensor.b', lastEnd: 'sensor.c' },
  'popup module first');
delete window._casoraVac;

// MQTT robot without translation_keys: by entity id, as before.
const mqtt = {
  devices: { d_m: { id: 'd_m', name: 'Valetudo', manufacturer: 'Valetudo' } },
  entities: { 'vacuum.valetudo': ent('d_m', null), 'sensor.valetudo_status': ent('d_m', null),
    'sensor.valetudo_progress': ent('d_m', null), 'sensor.valetudo_last_clean_end': ent('d_m', null) },
  states: {
    'vacuum.valetudo': st('vacuum.valetudo', 'docked'),
    'sensor.valetudo_status': st('sensor.valetudo_status', 'charging'),
    'sensor.valetudo_progress': st('sensor.valetudo_progress', '100'),
    'sensor.valetudo_last_clean_end': st('sensor.valetudo_last_clean_end', ISO),
  },
};
assert.deepEqual(vacSide(mqtt, 'vacuum.valetudo'),
  { status: 'sensor.valetudo_status', progress: 'sensor.valetudo_progress', lastEnd: 'sensor.valetudo_last_clean_end' },
  'sensors without a key: by entity id');

// Without the finder at all: the name rule still answers.
const CD = window.casoraDevice;
delete window.casoraDevice;
assert.equal(vacSide(mqtt, 'vacuum.valetudo').progress, 'sensor.valetudo_progress', 'no finder: by entity id');
window.casoraDevice = CD;

console.log('vacuum_bell_fields: ok');
