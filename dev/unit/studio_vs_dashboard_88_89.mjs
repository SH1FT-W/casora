// Issues #88 and #89: the Studio preview showed the tile's own entity („48 %“, „24 km“) while the dashboard
// tile said „Service fällig“ (e-bike) or „Keine Daten“ (car). Cause: the Studio has no _casoraBike/_casoraCar and
// falls back to the tile entity's state; the dashboard modules ignored that entity for the text.
// #88: an eBike Bridge (ESP32, ESPHome device of its own) next to the Bosch cloud bike: tile shows the live
//      battery, the popup a „Live“ group; the bridge is found by its fixed entity names (also the dual bridge).
// #89: a car integration without door/lock values (BMW CarData): tile shows the tile's own entity.
// All ids and names made up.   node dev/unit/studio_vs_dashboard_88_89.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
let HASS = null;
globalThis.document = { querySelector: () => ({ hass: HASS }) };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
const pop = src('03-popups.js');
const block = (guard) => {
  const a = pop.indexOf('(function () {\n  if (window.' + guard + ') return;');
  const b = pop.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, guard + ' block found');
  return pop.slice(a, b + 6);
};
new Function(block('_casoraBike'))();
new Function(block('_casoraCar'))();
const B = window._casoraBike, C = window._casoraCar;

window._casoraUI = {
  tokens: { font: 'x', ink: '#fff', ink2: '#ccc', ink3: '#999' },
  group: (rows, label) => label + ':' + rows.map((r) => r.label + '=' + r.value + (r.sub ? ' (' + r.sub + ')' : '')).join(' | '),
  hero: (o) => (o.label || '') + ' ' + o.value + (o.unit ? ' ' + o.unit : '') + (o.sub ? ' / ' + o.sub : ''),
  note: (t) => '<n>' + t + '</n>',
};
window.casoraSvc = (s, d) => ({ domain: 'casora', service: s, data: d });

const fresh = () => { HASS = { states: {}, entities: {}, devices: {} }; window.CASORA_SETTINGS = {}; return HASS; };
const add = (h, id, state, { key = null, dev = null, attrs = {}, platform = 'ha_bosch_ebike' } = {}) => {
  h.entities[id] = { entity_id: id, platform, translation_key: key, device_id: dev, hidden: false };
  h.states[id] = { entity_id: id, state, attributes: attrs };
};
const cloudBike = (h) => {
  h.devices.bike = { id: 'bike', name: 'Testantrieb CX' };
  const P = 'testantrieb_cx';
  add(h, `sensor.${P}_kilometerstand`, '1157.2', { key: 'odometer', dev: 'bike' });
  add(h, `sensor.${P}_tage_seit_letzter_fahrt`, '2', { key: 'days_since_last_ride', dev: 'bike' });
  add(h, `sensor.${P}_service_fallig_in_tagen`, '-68', { key: 'service_due_in_days', dev: 'bike' });
  add(h, `sensor.${P}_touren_gesamt`, '234', { key: 'total_rides', dev: 'bike' });
  add(h, `binary_sensor.${P}_theft_reported`, 'off', { dev: 'bike' });
};
// The bridge as the factory firmware names it: device „eBike Bridge 1a2b3c“, entities „eBike …“.
const bridge = (h, pre = 'ebike_bridge_1a2b3c', n = '', dev = 'bridge') => {
  h.devices[dev] = { id: dev, name: 'eBike Bridge' };
  const e = `ebike${n}`, o = { dev, platform: 'esphome' };
  add(h, `sensor.${pre}_${e}_battery_soc_live`, '48', { ...o, attrs: { unit_of_measurement: '%', device_class: 'battery' } });
  add(h, `sensor.${pre}_${e}_odometer_live`, '1158.4', { ...o, attrs: { unit_of_measurement: 'km' } });
  add(h, `sensor.${pre}_${e}_speed`, '0', o);
  add(h, `sensor.${pre}_${e}_cadence`, '0', o);
  add(h, `sensor.${pre}_${e}_rider_power`, '0', o);
  add(h, `sensor.${pre}_${e}_ambient_brightness`, '103.2', o);
  add(h, `sensor.${pre}_${e}_charge_time_to_80_estimate`, 'unknown', o);
  add(h, `sensor.${pre}_${e}_charge_time_to_100_estimate`, 'unknown', o);
  add(h, `binary_sensor.${pre}_${e}_connected`, 'on', o);
  add(h, `binary_sensor.${pre}_${e}_light`, 'off', o);
  add(h, `binary_sensor.${pre}_${e}_charger_connected`, 'off', o);
  add(h, `binary_sensor.${pre}_${e}_light_reserve`, 'off', o);
  add(h, `binary_sensor.${pre}_${e}_diagnosis_active`, 'off', o);
  add(h, `binary_sensor.${pre}_${e}_in_motion`, 'off', o);
  add(h, `binary_sensor.${pre}_${e}_system_locked`, 'on', o);
  return `sensor.${pre}_${e}_battery_soc_live`;
};

// ── #88, as reported: cloud bike (service overdue) + bridge, the tile's entity is the bridge's SoC.
{
  const h = fresh();
  cloudBike(h);
  const soc = bridge(h);
  const ent = h.states[soc];
  assert.equal(B.tile(h.states, ent), 'Akku 48 %', 'live battery instead of „Service fällig“');
  assert.equal(B.level(h.states, ent), 1, 'the due service keeps the orange symbol');
  const r = B.read(h.states, ent);
  assert.equal(r.km, 1158.4, 'live odometer wins over the cloud one');
  assert.equal(r.serviceDue, true);
  const live = B.sec('live', h.states, ent);
  assert.match(live, /^Live:Akkustand=48 %/);
  assert.match(live, /Licht=Aus/); assert.match(live, /Helligkeit=103 lx/); assert.match(live, /Verbindung=Verbunden/);
  assert.ok(!/Geschwindigkeit|Eigene Leistung|Bis 80/.test(live), 'no riding/charging rows while parked');
  assert.ok(!/System|Verriegelt/.test(live), 'system_locked is not the anti-theft lock (bridge README) – left out');
  assert.match(B.sec('hero', h.states, ent), /Kilometerstand 1\.158 km \/ Service fällig/);
  // Tile on a cloud entity: the only bridge of the house joins as well.
  assert.equal(B.tile(h.states, h.states['sensor.testantrieb_cx_kilometerstand']), 'Akku 48 %');
  // Popup: anchor stays on the bridge, its entities are watched, „Live“ is a part.
  window._casoraHH = { on: () => true, layout: (o) => o, moreCard: () => ({}), pbar: () => '' };
  const p = B.popup(ent, {}, h.states);
  assert.equal(p.entity, soc);
  assert.ok(p.watch.includes(soc) && p.watch.includes('sensor.testantrieb_cx_kilometerstand'));
  assert.deepEqual(p.left, ['live', 'range']);
  assert.ok(p.fields.live && p.fields.live.includes("sec(\"live\""));
  delete window._casoraHH;
  // Charging: „Lädt · 48 %“, times to 80/100 %.
  h.states['binary_sensor.ebike_bridge_1a2b3c_ebike_charger_connected'].state = 'on';
  h.states['sensor.ebike_bridge_1a2b3c_ebike_charge_time_to_80_estimate'].state = '25';
  h.states['sensor.ebike_bridge_1a2b3c_ebike_charge_time_to_100_estimate'].state = '95.4';
  assert.equal(B.tile(h.states, ent), 'Lädt · 48 %');
  const lc = B.sec('live', h.states, ent);
  assert.match(lc, /Akkustand=48 % \(Lädt\) \| Bis 80 %=25 Min\. \| Bis 100 %=1 Std\. 35 Min\./);
  // Riding: speed and power show.
  h.states['binary_sensor.ebike_bridge_1a2b3c_ebike_in_motion'].state = 'on';
  h.states['sensor.ebike_bridge_1a2b3c_ebike_speed'].state = '21.37';
  h.states['sensor.ebike_bridge_1a2b3c_ebike_rider_power'].state = '93';
  h.states['sensor.ebike_bridge_1a2b3c_ebike_cadence'].state = '36';
  assert.match(B.sec('live', h.states, ent), /Geschwindigkeit=21,4 km\/h \| Eigene Leistung=93 W \(Trittfrequenz 36 U\/min\)/);
  // Theft still comes first.
  h.states['binary_sensor.testantrieb_cx_theft_reported'].state = 'on';
  assert.equal(B.tile(h.states, ent), 'Diebstahl gemeldet');
}

// ── Without a bridge nothing changes: service first, no „Live“ group.
{
  const h = fresh();
  cloudBike(h);
  assert.equal(B.tile(h.states), 'Service fällig');
  assert.equal(B.sec('live', h.states), '');
  assert.equal(B.bridge(h.states), null);
}

// ── Bridge only (no cloud integration): battery on the tile, no „no bike“ note.
{
  const h = fresh();
  const soc = bridge(h, 'ebike_bridge');
  assert.equal(B.tile(h.states, h.states[soc]), 'Akku 48 %');
  assert.ok(!B.sec('hero', h.states, h.states[soc]).includes('<n>'), 'a bridge counts as found');
}

// ── Dual bridge, two bikes: no guessing without the tile's own entity; with it, its own half.
{
  const h = fresh();
  cloudBike(h);
  h.devices.bike2 = { id: 'bike2', name: 'Zweitrad' };
  add(h, 'sensor.zweitrad_tage_seit_letzter_fahrt', '9', { key: 'days_since_last_ride', dev: 'bike2' });
  add(h, 'binary_sensor.zweitrad_theft_reported', 'off', { dev: 'bike2' });
  bridge(h, 'ha_ebike_dual_bridge_4d5e6f', '_1', 'dual');
  const soc2 = bridge(h, 'ha_ebike_dual_bridge_4d5e6f', '_2', 'dual');
  h.states[soc2].state = '77';
  assert.equal(B.bridge(h.states, h.states['sensor.zweitrad_tage_seit_letzter_fahrt']), null, 'two bridges, two bikes: none picked');
  assert.equal(B.tile(h.states, h.states[soc2]), 'Akku 77 %', 'the tile entity picks its half of the dual bridge');
}

// ── A cloud bike named „eBike“ is no bridge (its ids end in …_ebike_odometer but not in the bridge's own fields).
{
  const h = fresh();
  h.devices.b = { id: 'b', name: 'eBike' };
  add(h, 'sensor.ebike_kilometerstand', '10', { key: 'odometer', dev: 'b' });
  add(h, 'sensor.ebike_tage_seit_letzter_fahrt', '1', { key: 'days_since_last_ride', dev: 'b' });
  add(h, 'binary_sensor.ebike_theft_reported', 'off', { dev: 'b' });
  add(h, 'sensor.ebike_speed', '12', { dev: 'b' });
  assert.equal(B.bridge(h.states), null);
  assert.equal(B.tile(h.states), 'Gestern gefahren');
}

// ── #89: car without door/lock entities, the tile's entity is a range sensor (BMW CarData style).
{
  const h = fresh();
  h.devices.car = { id: 'car', name: 'Testwagen' };
  const id = 'sensor.testwagen_vehicle_drivetrain_electricengine_remainingelectricrange';
  add(h, id, '24', { dev: 'car', platform: 'cardata', attrs: { unit_of_measurement: 'km', friendly_name: 'Testwagen Range EV Estimate during charging' } });
  add(h, 'sensor.testwagen_vehicle_vehicle_travelleddistance', '12000', { dev: 'car', platform: 'cardata', attrs: { unit_of_measurement: 'km' } });
  assert.equal(C.tile(id, h.states), '24 km', 'the tile entity, as in the Studio');
  // With HA's formatter (casora-core) its text is used.
  window._casoraStateText = (hass, e) => 'fmt:' + e.state;
  assert.equal(C.tile(id, h.states), 'fmt:24');
  delete window._casoraStateText;
  h.states[id].state = 'unavailable';
  assert.equal(C.tile(id, h.states), 'Keine Daten');
  // An old prefix (variables.car, even a number) is no entity: no crash.
  assert.equal(C.tile(42, h.states), 'Keine Daten');
}

// ── Car with lock values: the lock state stays first (wish 24.09.2026).
{
  const h = fresh();
  h.devices.car = { id: 'car', name: 'Testauto' };
  add(h, 'sensor.testauto_range_combined', '410', { dev: 'car', platform: 'x', attrs: { unit_of_measurement: 'km' } });
  add(h, 'sensor.testauto_mileage', '7016', { dev: 'car', platform: 'x', attrs: { unit_of_measurement: 'km' } });
  add(h, 'sensor.testauto_fuel_level', '86', { dev: 'car', platform: 'x', attrs: { unit_of_measurement: '%' } });
  add(h, 'binary_sensor.testauto_front_left_door_lock', 'off', { dev: 'car', platform: 'x' });
  assert.equal(C.tile('sensor.testauto_range_combined', h.states), 'Verriegelt');
}
console.log('studio_vs_dashboard_88_89: ok');
