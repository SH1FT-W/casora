// Dishwasher fields from the shared source table (00-finder.js casoraLaundryFind, `dish` per source), after #48:
// the dishwasher kept its own key lists and missed what the washer already knew. Home Connect Local (homeconnect_ws)
// and Home Connect Alt (ekutner, entity_id ends) by platform,
// card variables first, key before the German name, Miele (door by device class), roles (laundry lists stay
// without dishwashers) and the Studio fields (find.dish) naming only fields the table knows.
// All entities invented.   node dev/unit/dishwasher_sources.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/', import.meta.url);
const src = fs.readFileSync(new URL('scripts/local/02-devices.js', dir), 'utf8');
const finder = fs.readFileSync(new URL('scripts/local/00-finder.js', dir), 'utf8');
const types = fs.readFileSync(new URL('panel/casora-panel-types.js', dir), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const block = (from, start) => {
  const a = from.indexOf(start);
  const b = from.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(from.slice(a, b + 6))();
};
block(finder, '(function () {\n  if (window.casoraLaundryFind) return;');
block(src, '(function () {\n  if (window._casoraLaundry) return;');
block(src, '(function () {\n  if (window._casoraDish || !window._casoraLaundry) return;');
const LF = globalThis.casoraLaundryFind;
const D = globalThis._casoraDish;

// [domain, id suffix, translation_key, attributes]
const house = (dev, platform, list, state = {}) => {
  const reg = {}, st = {};
  list.forEach(([dom, sfx, key, attrs]) => {
    const id = dom + '.' + dev + '_' + sfx;
    reg[id] = { entity_id: id, device_id: dev, platform, translation_key: key };
    st[id] = { state: state[sfx] || 'off', attributes: attrs || {} };
  });
  return { entities: reg, states: st, devices: { [dev]: { name: dev } } };
};
const merge = (...hs) => hs.reduce((a, h) => ({ entities: { ...a.entities, ...h.entities }, states: { ...a.states, ...h.states },
  devices: { ...a.devices, ...h.devices } }), { entities: {}, states: {}, devices: {} });
const resolve = (h, st, V = {}) => D.resolve({ entity_id: st }, V, h.states, h);

// ── 1) Source homeconnect_ws (HACS Home Connect Local, sensor_* keys) by platform, English ids: keys only ──
const alt = house('alt', 'homeconnect_ws', [
  ['sensor', 'state', 'sensor_operation_state'], ['sensor', 'program', 'sensor_active_program'],
  ['select', 'choice', 'select_program', { options: ['Dishcare.Dishwasher.Program.Eco50'] }], ['sensor', 'phase', 'sensor_program_phase'],
  ['sensor', 'pct', 'sensor_program_progress'], ['sensor', 'left', 'sensor_remaining_program_time'],
  ['sensor', 'energy_fc', 'sensor_energy_forecast'], ['sensor', 'water_fc', 'sensor_water_forecast'],
  ['sensor', 'salt', 'sensor_salt'], ['sensor', 'rinse', 'sensor_rinse_aid'], ['binary_sensor', 'door', 'binary_sensor_door_state'],
  ['binary_sensor', 'online', 'connection'], ['select', 'remote', 'select_remote_control_level'], ['number', 'delay', 'number_start_in'],
  ['switch', 'power', 'switch_power_state'], ['switch', 'extra', 'switch_extra_dry'], ['switch', 'silence', 'switch_silence_on_demand'],
  ['button', 'go', 'button_start_program'], ['button', 'abort', 'button_abort_program'],
  ['binary_sensor', 'aqua', 'binary_sensor_aqua_stop'], ['binary_sensor', 'filter', 'binary_sensor_checkfiltersystem'],
], { salt: 'nearly_empty', aqua: 'on' });
let c = resolve(alt, 'sensor.alt_state');
const want = { program: 'sensor.alt_program', sel: 'select.alt_choice', phase: 'sensor.alt_phase', progress: 'sensor.alt_pct',
  remaining: 'sensor.alt_left', energyEst: 'sensor.alt_energy_fc', waterEst: 'sensor.alt_water_fc', salt: 'sensor.alt_salt',
  rinse: 'sensor.alt_rinse', door: 'binary_sensor.alt_door', conn: 'binary_sensor.alt_online', remote: 'select.alt_remote',
  startIn: 'number.alt_delay', power_sw: 'switch.alt_power', filterCheck: 'binary_sensor.alt_filter', start: 'button.alt_go',
  stop: 'button.alt_abort' };
Object.entries(want).forEach(([k, v]) => assert.equal(c[k], v, 'WS: ' + k));
assert.deepEqual(c.opts.map((o) => o[0]), ['switch.alt_extra', 'switch.alt_silence'], 'Alt: option switches');
assert.deepEqual(c.probs.map((p) => p[0]), ['binary_sensor.alt_aqua'], 'Alt: problem sensors');
assert.equal(c.light, null, 'Alt: missing field stays empty');
assert.deepEqual(D.todo(c, alt.states).map((t) => t[0]), ['AquaStop ausgelöst', 'Salz nachfüllen'], 'Alt: todo from the found sensors');
assert.equal(LF.dish(alt, 'sensor.alt_state').source, 'homeconnect_ws', 'WS: source by platform');
console.log('ok Home Connect Local');

// ── 1b) Home Connect Alt (ekutner/home-connect-hass): generic keys, entity_ids <domain>.<haid>_<Home Connect key> ──
{
  const ha = 'siemens_sn658x06te_68a40e000000';
  const E = (dom, key, tk, state, attrs) => [dom + '.' + ha + '_' + key, tk, state, attrs || {}];
  const list = [
    E('sensor', 'bsh_common_status_operationstate', 'statuses', 'BSH.Common.EnumType.OperationState.Run'),
    E('sensor', 'active_program', 'programs', 'Dishcare.Dishwasher.Program.Eco50', { icon: 'mdi:dishwasher' }),
    E('select', 'programs', 'programs', 'Dishcare.Dishwasher.Program.Eco50', { options: ['Dishcare.Dishwasher.Program.Eco50'], icon: 'mdi:dishwasher' }),
    E('sensor', 'bsh_common_option_programprogress', 'options', '40', { unit_of_measurement: '%' }),
    E('sensor', 'bsh_common_option_remainingprogramtime', 'options', '2026-10-23T12:00:00+00:00', { device_class: 'timestamp' }),
    E('sensor', 'bsh_common_option_energyforecast', 'options', '60', { unit_of_measurement: '%' }),
    E('binary_sensor', 'bsh_common_status_doorstate', null, 'off', { device_class: 'door' }),
    E('binary_sensor', 'connected', null, 'on', { device_class: 'connectivity' }),
    E('switch', 'bsh_common_setting_powerstate', null, 'on'),
    E('switch', 'dishcare_dishwasher_option_extradry', null, 'off'),
    E('switch', 'dishcare_dishwasher_option_halfload', null, 'off'),
    E('button', 'start_pause', 'pause_program', 'unknown'), E('button', 'stop', 'stop_program', 'unknown'),
  ];
  const h = { entities: {}, states: {}, devices: { ek: { name: 'Geschirrspüler' } } };
  list.forEach(([id, tk, state, attrs]) => {
    h.entities[id] = { entity_id: id, device_id: 'ek', platform: 'home_connect_alt', translation_key: tk };
    h.states[id] = { state, attributes: attrs };
  });
  const st = 'sensor.' + ha + '_bsh_common_status_operationstate';
  const cl = LF.classify(h, 'ek', ['dishwasher']);
  assert.equal(cl && cl.role, 'dishwasher', 'Alt: role by the program icon');
  assert.equal(cl.source, 'home_connect_alt');
  assert.equal(cl.state, st, 'Alt: state by the entity_id end');
  const c2 = resolve(h, st);
  const w2 = { program: 'sensor.' + ha + '_active_program', sel: 'select.' + ha + '_programs',
    progress: 'sensor.' + ha + '_bsh_common_option_programprogress', remaining: 'sensor.' + ha + '_bsh_common_option_remainingprogramtime',
    energyEst: 'sensor.' + ha + '_bsh_common_option_energyforecast', door: 'binary_sensor.' + ha + '_bsh_common_status_doorstate',
    conn: 'binary_sensor.' + ha + '_connected', power_sw: 'switch.' + ha + '_bsh_common_setting_powerstate',
    start: 'button.' + ha + '_start_pause', stop: 'button.' + ha + '_stop' };
  Object.entries(w2).forEach(([k, v]) => assert.equal(c2[k], v, 'Alt: ' + k));
  assert.deepEqual(c2.opts.map((o) => o[0]), ['switch.' + ha + '_dishcare_dishwasher_option_extradry',
    'switch.' + ha + '_dishcare_dishwasher_option_halfload'], 'Alt: option switches');
  assert.equal(globalThis._casoraLaundry.state(h.states, st)[0], 'Läuft', 'Alt: Home Connect key as state');
  // The same entity_id ends on another platform are not Home Connect Alt's.
  const other = JSON.parse(JSON.stringify(h));
  Object.values(other.entities).forEach((e) => { e.platform = 'template'; });
  assert.equal(LF.classify(other, 'ek', ['dishwasher']), null, 'entity_id ends only on home_connect_alt');
  console.log('ok Home Connect Alt');
}

// ── 2) Card variables win ──
c = resolve(alt, 'sensor.alt_state', { entity_program: 'sensor.mine', entity_door: 'sensor.my_door', btn_stop: 'button.my_stop',
  sw_extra_dry: 'switch.my_extra', appliance_remaining: 'sensor.my_left' });
assert.equal(c.program, 'sensor.mine');
assert.equal(c.door, 'sensor.my_door');
assert.equal(c.stop, 'button.my_stop');
assert.equal(c.remaining, 'sensor.my_left');
assert.equal(c.opts[0][0], 'switch.my_extra');
console.log('ok variables first');

// ── 3) German entity-id suffix only as a last resort ──
const old = house('old', 'homeconnect_ws', [
  ['sensor', 'betriebszustand', null], ['sensor', 'salz', null], ['sensor', 'klarspuler', null],
  ['sensor', 'neu_salz_key', 'sensor_salt'],
]);
c = resolve(old, 'sensor.old_betriebszustand');
assert.equal(c.salt, 'sensor.old_neu_salz_key', 'key before name');
assert.equal(c.rinse, 'sensor.old_klarspuler', 'name when no key');
console.log('ok name last');

// ── 4) Miele from HA core: program, phase, remaining, door by device class, start/stop buttons ──
const miele = house('mi', 'miele', [
  ['sensor', 'status', 'status'], ['sensor', 'prog', 'program_id'], ['sensor', 'phase', 'program_phase'],
  ['sensor', 'left', 'remaining_time', { unit_of_measurement: 'min' }], ['sensor', 'begin', 'start', { device_class: 'timestamp' }],
  ['sensor', 'salt', 'salt_level', { unit_of_measurement: '%' }], ['binary_sensor', 'door', null, { device_class: 'door' }],
  ['button', 'go', 'start'], ['button', 'halt', 'stop'],
]);
c = resolve(miele, 'sensor.mi_status');
assert.equal(c.program, 'sensor.mi_prog');
assert.equal(c.phase, 'sensor.mi_phase');
assert.equal(c.remaining, 'sensor.mi_left');
assert.equal(c.door, 'binary_sensor.mi_door', 'door by device class');
assert.equal(c.start, 'button.mi_go', 'the start button, not the start-time sensor');
assert.equal(c.stop, 'button.mi_halt');
assert.equal(c.salt, null, 'percent salt level does not fit the card');
console.log('ok Miele');

// ── 5) Roles: dishwashers only when asked for ──
const P = 'dishcare_dishwasher_program_';
const core = house('hc', 'home_connect', [['sensor', 'state', 'operation_state'], ['sensor', 'pct', 'program_progress'],
  ['select', 'prog', 'active_program', { options: [P + 'eco_50'] }]]);
const washer = house('wm', 'home_connect', [['sensor', 'state', 'operation_state'], ['sensor', 'pct', 'program_progress'],
  ['select', 'prog', 'active_program', { options: ['laundry_care_washer_program_cotton'] }]]);
const h = merge(core, washer, miele, alt);
assert.equal(LF.classify(h, 'hc'), null, 'laundry default: no dishwasher');
assert.equal(LF.classify(h, 'hc', ['dishwasher']).role, 'dishwasher', 'Home Connect core dishwasher');
assert.equal(LF.classify(h, 'mi', ['dishwasher']).role, 'dishwasher', 'Miele dishwasher');
assert.equal(LF.classify(h, 'alt', ['dishwasher']).role, 'dishwasher', 'Home Connect Alt dishwasher');
assert.deepEqual(LF.all(h).map((x) => x.device), ['wm'], 'all(): laundry only');
assert.deepEqual(LF.all(h, 'dishwasher').map((x) => x.device).sort(), ['alt', 'hc', 'mi'], 'all(dishwasher)');
console.log('ok roles');

// ── 6) Studio fields (find.dish) name fields of the table; every dish spec field has a name fallback slot ──
const names = Object.keys(LF.dishNames);
const studio = [...types.matchAll(/find: \{ dish: "([A-Za-z_]+)" \}/g)].map((m) => m[1]);
assert.ok(studio.length >= 10, 'Studio dishwasher fields found');
studio.forEach((n) => assert.ok(names.includes(n), 'Studio field known to the table: ' + n));
LF.sources.filter((s) => s.dish).forEach((s) => Object.keys(s.dish).forEach((n) => assert.ok(names.includes(n), s.id + ': ' + n)));
assert.equal(LF.dish.field(alt, 'sensor.alt_state', 'remaining'), 'sensor.alt_left', 'Studio placeholder = card');
console.log('ok Studio fields');
