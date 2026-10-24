// Robot lawn mower source table (16-maeher.js SOURCES) without HA: for each supported integration a made-up entity
// set as the integration creates it (translation_key, device_class, unit, platform) → the fields the card maps, the
// status values and which popup rows appear. Battery and connection must work for every source; an unknown
// integration falls back to device classes. Also the test house (dev/casora_mock/maeher.py): all three mock mowers
// run under casora_mock and are recognised by their keys. Names made up.
//   node dev/unit/mower_sources.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { testhaus } from './lib/testhaus.mjs';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
new Function(src('16-maeher.js'))();
const M = window._casoraMower;
assert.ok(M && M.SOURCES, 'module loaded');

const NOW = Date.parse('2026-10-24T10:00:00');
// One device per call: [[entity_id, state, {key, dc, unit, attrs, category}]]
const house = (platform, list) => {
  const states = {}, entities = {};
  list.forEach(([id, state, o = {}]) => {
    const a = Object.assign({}, o.attrs || {});
    if (o.dc) a.device_class = o.dc;
    if (o.unit) a.unit_of_measurement = o.unit;
    states[id] = { entity_id: id, state, attributes: a, last_changed: '2026-10-24T09:00:00Z' };
    entities[id] = { entity_id: id, platform, translation_key: o.key || null, device_id: 'dev_' + platform, entity_category: o.category || null };
  });
  return { states, entities, devices: { ['dev_' + platform]: { id: 'dev_' + platform, name: 'Gartenroboter' } }, areas: {} };
};
const mowerId = (h) => Object.keys(h.states).find((x) => x.startsWith('lawn_mower.'));

const CASES = {
  husqvarna_automower: {
    list: [
      ['lawn_mower.rasenpilot', 'docked', { attrs: { supported_features: 7 } }],
      ['sensor.rasenpilot_battery', '87', { dc: 'battery', unit: '%' }],
      ['binary_sensor.rasenpilot_charging', 'on', { dc: 'battery_charging' }],
      ['sensor.rasenpilot_error', 'no_error', { key: 'error', dc: 'enum' }],
      ['sensor.rasenpilot_next_start', '2026-10-24T13:00:00', { key: 'next_start_timestamp', dc: 'timestamp' }],
      ['sensor.rasenpilot_mode', 'main_area', { key: 'mode', dc: 'enum' }],
      ['sensor.rasenpilot_restricted_reason', 'week_schedule', { key: 'restricted_reason', dc: 'enum' }],
      ['sensor.rasenpilot_work_area', 'Vorgarten', { key: 'work_area', dc: 'enum' }],
      ['sensor.rasenpilot_cutting_blade_usage_time', '46800', { key: 'cutting_blade_usage_time', dc: 'duration', unit: 's' }],
      ['sensor.rasenpilot_total_running_time', '1234800', { key: 'total_running_time', dc: 'duration', unit: 's' }],
      ['number.rasenpilot_cutting_height', '5', { key: 'cutting_height', attrs: { min: 1, max: 9, step: 1 } }],
      ['switch.rasenpilot_enable_schedule', 'on', { key: 'enable_schedule' }],
      ['button.rasenpilot_confirm_error', 'unknown', { key: 'confirm_error' }],
    ],
    want: { battery: 'sensor.rasenpilot_battery', charging: 'binary_sensor.rasenpilot_charging', error: 'sensor.rasenpilot_error',
      nextStart: 'sensor.rasenpilot_next_start', blade: 'sensor.rasenpilot_cutting_blade_usage_time', hours: 'sensor.rasenpilot_total_running_time',
      cutHeight: 'number.rasenpilot_cutting_height', schedule: 'switch.rasenpilot_enable_schedule', confirm: 'button.rasenpilot_confirm_error',
      mode: 'sensor.rasenpilot_mode', workArea: 'sensor.rasenpilot_work_area', reason: 'sensor.rasenpilot_restricted_reason' },
    status: { battery: 87, charging: true, label: 'Lädt', hours: 343, blade: 13, nextStart: 'heute 13:00', mode: 'Hauptbereich', workArea: 'Vorgarten' },
    rows: ['Akku', 'Nächster Start', 'Modus', 'Bereich', 'Messer', 'Betriebsstunden'],
    ctrl: /Schnitthöhe/,
  },
  gardena_smart_system: {
    list: [
      ['lawn_mower.gartenzwerg_lawn_mower', 'docked', { attrs: { supported_features: 7, battery_level: 100, rf_link_level: 90, rf_link_state: 'ONLINE',
        operating_hours: 1234, state: 'OK', activity: 'PARKED_TIMER', last_error_code: null } }],
      ['sensor.gartenzwerg_battery_level', '100', { dc: 'battery', unit: '%' }],
      ['binary_sensor.gartenzwerg_online', 'on', { dc: 'connectivity' }],
      ['sensor.gartenzwerg_operating_hours', '1234', { dc: 'duration', unit: 'h' }],
      ['sensor.gartenzwerg_rf_link_quality', '90', { unit: '%' }],
      ['sensor.gartenzwerg', 'no_message', { key: 'mower_error', dc: 'enum' }],
      ['button.gartenzwerg_park_until_further_notice', 'unknown'],
      ['button.gartenzwerg_start_mowing_now', 'unknown'],
    ],
    want: { battery: 'sensor.gartenzwerg_battery_level', online: 'binary_sensor.gartenzwerg_online', rf: 'sensor.gartenzwerg_rf_link_quality',
      hours: 'sensor.gartenzwerg_operating_hours', error: 'sensor.gartenzwerg', park: 'button.gartenzwerg_park_until_further_notice',
      start: 'button.gartenzwerg_start_mowing_now' },
    status: { battery: 100, online: true, rf: 90, hours: 1234, label: 'Parkt bis zum nächsten Zeitplan' },
    rows: ['Akku', 'Verbindung', 'Betriebsstunden'],
    ctrl: null,
  },
  landroid_cloud: {
    list: [
      ['lawn_mower.grasfuchs', 'rain_delayed', { attrs: { supported_features: 7 } }],
      ['sensor.grasfuchs_battery', '64', { key: 'battery', dc: 'battery', unit: '%' }],
      ['sensor.grasfuchs_error', 'no_error', { key: 'error', dc: 'enum' }],
      ['sensor.grasfuchs_rssi', '-67', { key: 'rssi', dc: 'signal_strength', unit: 'dBm' }],
      ['sensor.grasfuchs_next_scheduled_start', '2026-10-25T08:30:00', { key: 'next_schedule', dc: 'timestamp' }],
      ['sensor.grasfuchs_rain_delay_remaining', '90', { key: 'rain_delay_remaining', dc: 'duration', unit: 'min' }],
      ['sensor.grasfuchs_blade_runtime_since_reset', '2130', { key: 'blade_runtime_current', dc: 'duration', unit: 'min' }],
      ['sensor.grasfuchs_mower_runtime_total', '41220', { key: 'mower_runtime_total', dc: 'duration', unit: 'min' }],
      ['binary_sensor.grasfuchs_mqtt', 'on', { key: 'mqtt_connected', dc: 'connectivity' }],
      ['binary_sensor.grasfuchs_rain_sensor', 'off', { key: 'rain_sensor', dc: 'moisture' }],
      ['number.grasfuchs_rain_delay', '120', { key: 'rain_delay', unit: 'min', attrs: { min: 0, max: 1440, step: 1 } }],
      ['number.grasfuchs_cutting_height', '45', { key: 'cutting_height', unit: 'mm', attrs: { min: 20, max: 60, step: 5 } }],
      ['select.grasfuchs_zone', '1', { key: 'zone', attrs: { options: ['1', '2', '3', '4'] } }],
    ],
    want: { battery: 'sensor.grasfuchs_battery', online: 'binary_sensor.grasfuchs_mqtt', rf: 'sensor.grasfuchs_rssi', error: 'sensor.grasfuchs_error',
      nextStart: 'sensor.grasfuchs_next_scheduled_start', rainLeft: 'sensor.grasfuchs_rain_delay_remaining', rainSensor: 'binary_sensor.grasfuchs_rain_sensor',
      rainDelay: 'number.grasfuchs_rain_delay', blade: 'sensor.grasfuchs_blade_runtime_since_reset', hours: 'sensor.grasfuchs_mower_runtime_total',
      cutHeight: 'number.grasfuchs_cutting_height', zone: 'select.grasfuchs_zone' },
    status: { battery: 64, online: true, rf: -67, label: 'Regenpause', rain: 'Pause noch 1 Std. 30 Min.', hours: 687, nextStart: 'morgen 08:30' },
    rows: ['Akku', 'Verbindung', 'Nächster Start', 'Regen', 'Messer', 'Betriebsstunden'],
    ctrl: /Zone 1[\s\S]*Zone 4|Schnitthöhe/,
  },
  navimow: {
    list: [
      ['lawn_mower.mähfix', 'mowing', { attrs: { supported_features: 7, battery: 72, status: 'mowing' } }],
      ['sensor.mähfix_battery', '72', { key: 'battery', dc: 'battery', unit: '%' }],
    ],
    want: { battery: 'sensor.mähfix_battery' },
    status: { battery: 72, label: 'Mäht', level: 1 },
    rows: ['Akku'],
    ctrl: null,
  },
  ecovacs: {
    list: [
      ['lawn_mower.ziege', 'docked', { attrs: { supported_features: 7 } }],
      ['sensor.ziege_battery', '55', { dc: 'battery', unit: '%', category: 'diagnostic' }],
      ['sensor.ziege_error', '102', { key: 'error', attrs: { description: 'Blockiert am Rand' } }],
      ['sensor.ziege_blade_lifespan', '12', { key: 'lifespan_blade', unit: '%' }],
      ['sensor.ziege_total_mowing_duration', '7200', { key: 'total_stats_time_mower', dc: 'duration', unit: 'min' }],
    ],
    want: { battery: 'sensor.ziege_battery', error: 'sensor.ziege_error', blade: 'sensor.ziege_blade_lifespan', hours: 'sensor.ziege_total_mowing_duration' },
    status: { battery: 55, bladePct: 12, hours: 120, label: 'In der Station' },
    rows: ['Akku', 'Messer', 'Betriebsstunden'],
    ctrl: null,
  },
  mammotion: {
    list: [
      ['lawn_mower.luba', 'error', { attrs: { supported_features: 15 } }],
      ['sensor.luba_battery', '40', { key: 'battery_percent', dc: 'battery', unit: '%' }],
      ['binary_sensor.luba_charging', 'off', { key: 'charging', dc: 'battery_charging' }],
      ['sensor.luba_mqtt_status', 'reported_online', { key: 'mqtt_status', dc: 'enum' }],
      ['sensor.luba_wifi_rssi', '-58', { key: 'wifi_rssi', dc: 'signal_strength', unit: 'dBm' }],
      ['sensor.luba_last_error', 'Hindernis vor dem Mäher', { key: 'error_1_message' }],
      ['sensor.luba_blade_used_time', '36000', { key: 'blade_used_time', dc: 'duration', unit: 's' }],
      ['sensor.luba_total_work_time', '360000', { key: 'maintenance_work_time', dc: 'duration', unit: 's' }],
      ['sensor.luba_progress', '40', { key: 'progress', unit: '%' }],
      ['binary_sensor.luba_rain_detected', 'on', { key: 'rain_detected', dc: 'moisture' }],
      ['number.luba_blade_height', '55', { key: 'blade_height', dc: 'distance', unit: 'mm', attrs: { min: 25, max: 70, step: 1 } }],
    ],
    want: { battery: 'sensor.luba_battery', charging: 'binary_sensor.luba_charging', online: 'sensor.luba_mqtt_status', rf: 'sensor.luba_wifi_rssi',
      error: 'sensor.luba_last_error', blade: 'sensor.luba_blade_used_time', hours: 'sensor.luba_total_work_time', progress: 'sensor.luba_progress',
      rainSensor: 'binary_sensor.luba_rain_detected', cutHeight: 'number.luba_blade_height' },
    status: { battery: 40, online: true, label: 'Hindernis vor dem Mäher', level: 3, rain: 'Regen erkannt', blade: 10, hours: 100 },
    rows: ['Hindernis vor dem Mäher', 'Akku', 'Verbindung', 'Fortschritt', 'Regen', 'Messer', 'Betriebsstunden'],
    // 46 steps: − value + instead of a wall of buttons.
    ctrl: /<seg Schnitthöhe>−,55 mm\*,\+<\/seg>/,
  },
};

// Popup kit stub: rows as "label=value"; segments as their labels.
window._casoraUI = {
  esc: (t) => String(t), tokens: { ink: '#fff', ink3: '#aaa', font: 'x' },
  hero: (o) => '<hero>' + o.value + '|' + (o.sub || '') + '</hero>',
  group: (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '')).join(';') + '</group>',
  segments: (items, label) => '<seg ' + label + '>' + items.map((x) => x.label + (x.active ? '*' : '')).join(',') + '</seg>',
};
const realNow = Date.now;
for (const [platform, cs] of Object.entries(CASES)) {
  const h = house(platform, cs.list);
  const id = mowerId(h);
  const c = M.find(h, id);
  assert.equal(c.src, platform, platform + ': source picked by the integration');
  for (const [k, v] of Object.entries(cs.want)) assert.equal(c[k], v, platform + ': field ' + k);
  // Fields the source does not have stay empty (no row without an entity).
  Object.keys(M.SOURCES[platform].fields).filter((k) => !(k in cs.want)).forEach((k) => assert.ok(!c[k], platform + ': ' + k + ' empty, got ' + c[k]));
  const s = M.status(c, h.states, NOW);
  for (const [k, v] of Object.entries(cs.status)) {
    const got = typeof s[k] === 'number' && typeof v === 'number' ? Math.round(s[k]) : s[k];
    assert.equal(got, v, platform + ': status.' + k);
  }
  assert.ok(s.battery != null, platform + ': battery for every source');
  Date.now = () => NOW;
  const info = M.sec('info', c, h.states, h);
  Date.now = realNow;
  const labels = info.replace(/^<group Status>|<\/group>$/g, '').split(';').map((x) => x.split('=')[0]);
  assert.deepEqual(labels, cs.rows, platform + ': status rows ' + info);
  const ctrl = M.sec('ctrl', c, h.states, h);
  if (cs.ctrl) assert.match(ctrl, cs.ctrl, platform + ': settings ' + ctrl);
  else assert.equal(ctrl, '', platform + ': no settings');
}

// Landroid: cutting height as − value + (9 steps are too many for a bar), zones as "Zone n"; current value marked.
{
  const h = house('landroid_cloud', CASES.landroid_cloud.list);
  const ctrl = M.sec('ctrl', M.find(h, 'lawn_mower.grasfuchs'), h.states, h);
  assert.ok(ctrl.includes('<seg Schnitthöhe>−,45 mm*,+</seg>'), 'many steps: − value +: ' + ctrl);
  assert.ok(ctrl.includes('<seg Zone>Zone 1*,Zone 2,Zone 3,Zone 4</seg>'), ctrl);
}
// Husqvarna: schedule switch off = parked until further notice; the third key turns the schedule back on.
{
  const h = house('husqvarna_automower', CASES.husqvarna_automower.list);
  h.states['switch.rasenpilot_enable_schedule'].state = 'off';
  h.states['binary_sensor.rasenpilot_charging'].state = 'off';
  h.states['sensor.rasenpilot_restricted_reason'].state = 'park_override';
  const c = M.find(h, 'lawn_mower.rasenpilot');
  const s = M.status(c, h.states, NOW);
  assert.equal(s.label, 'Parkt bis auf Weiteres'); assert.equal(s.parkedManual, true);
  const hero = M.sec('hero', c, h.states, h);
  assert.ok(hero.includes('"service":"turn_on"') && hero.includes('switch.rasenpilot_enable_schedule'), 'schedule back on: ' + hero);
  // Error with confirm button: error row first, confirmable.
  h.states['lawn_mower.rasenpilot'].state = 'error';
  h.states['sensor.rasenpilot_error'].state = 'trapped';
  const s2 = M.status(c, h.states, NOW);
  assert.equal(s2.label, 'Steckt fest'); assert.equal(s2.level, 3);
  window._casoraUI.group = (rows, label) => JSON.stringify(rows);
  const rows = JSON.parse(M.sec('info', c, h.states, h));
  assert.equal(rows[0].label, 'Steckt fest'); assert.equal(rows[0].action, 'Bestätigen');
  assert.equal(rows[0].svc.target.entity_id, 'button.rasenpilot_confirm_error');
  window._casoraUI.group = (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '')).join(';') + '</group>';
}
// Ecovacs: error code with description → the description.
{
  const h = house('ecovacs', CASES.ecovacs.list);
  h.states['lawn_mower.ziege'].state = 'error';
  assert.equal(M.status(M.find(h, 'lawn_mower.ziege'), h.states, NOW).label, 'Blockiert am Rand');
}
// Landroid states of its own: edgecut runs (green), escaped_digital_fence is an error.
{
  const h = house('landroid_cloud', CASES.landroid_cloud.list);
  const c = M.find(h, 'lawn_mower.grasfuchs');
  h.states['lawn_mower.grasfuchs'].state = 'edgecut';
  let s = M.status(c, h.states, NOW);
  assert.equal(s.label, 'Mäht die Kante'); assert.equal(M.active(s), true); assert.equal(M.iconService(s), 'lawn_mower.dock');
  h.states['lawn_mower.grasfuchs'].state = 'escaped_digital_fence';
  s = M.status(c, h.states, NOW);
  assert.equal(s.level, 3); assert.equal(s.label, 'Außerhalb des Mähbereichs');
  h.states['binary_sensor.grasfuchs_mqtt'].state = 'off';
  h.states['lawn_mower.grasfuchs'].state = 'docked';
  s = M.status(c, h.states, NOW);
  assert.equal(s.label, 'Offline'); assert.equal(s.online, false);
}
// Unknown integration: battery and connection by device class, nothing else invented.
{
  const h = house('some_new_mower', [
    ['lawn_mower.neu', 'docked', { attrs: { supported_features: 5 } }],
    ['sensor.neu_akku', '33', { dc: 'battery', unit: '%' }],
    ['binary_sensor.neu_cloud', 'on', { dc: 'connectivity' }],
    ['sensor.neu_temperature', '21', { dc: 'temperature', unit: '°C' }],
  ]);
  const c = M.find(h, 'lawn_mower.neu');
  assert.equal(c.src, null);
  assert.equal(c.battery, 'sensor.neu_akku'); assert.equal(c.online, 'binary_sensor.neu_cloud');
  assert.ok(!c.hours && !c.error && !c.cutHeight, 'no guesses: ' + JSON.stringify(c));
  const s = M.status(c, h.states, NOW);
  assert.equal(s.battery, 33); assert.equal(s.online, true);
  assert.equal(M.iconService(s), 'lawn_mower.start_mowing');
  const hero = M.sec('hero', c, h.states, h);
  assert.ok(!hero.includes('"service":"pause"'), 'no pause without the feature');
}
// Pure helpers.
assert.equal(M.errorText('no_error'), null); assert.equal(M.errorText('trapped'), 'Steckt fest');
assert.equal(M.errorText('wire_missing'), 'Kein Signal vom Begrenzungsdraht');
assert.equal(M.whenText('2026-10-24T08:00:00', NOW), null, 'past start: nothing');
assert.equal(M.hoursOf({ state: '7200', attributes: { unit_of_measurement: 's' } }), 2);

// Test house: the three mock mowers, each recognised as its source (all under casora_mock).
{
  const h = testhaus({ publicOnly: true });
  const want = { 'lawn_mower.testmaeher_lawn_mower': 'gardena_smart_system', 'lawn_mower.rasenpilot': 'husqvarna_automower', 'lawn_mower.grasfuchs': 'landroid_cloud' };
  for (const [id, platform] of Object.entries(want)) {
    assert.ok(h.states[id], 'test house has ' + id);
    const c = M.find(h, id);
    assert.equal(c.src, platform, id + ' → ' + platform);
    assert.ok(c.battery, id + ': battery');
  }
}
console.log('mower_sources: ok (' + Object.keys(CASES).length + ' integrations + generic + test house)');
