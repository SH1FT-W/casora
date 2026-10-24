// E-bike tile/popup (03-popups.js, window._casoraBike) without HA: the bike is found by its device, the
// values by translation_key with the English entity-id suffix as fallback. Forum report 24.10.2026: with
// the Bosch eBike integration 1.19 in a German HA the ids read sensor.<rad>_tage_seit_letzter_fahrt, the
// old prefix logic found only the theft sensor and showed „Diebstahl: Nicht gemeldet“ plus an empty
// „Nächster Service“. Covers: old English ids with few keys, new German ids with keys, a mix, a bike with
// few entities (no „—“ rows), two bikes, no bike at all (note only then). All ids and names made up.
//   node dev/unit/ebike_zuordnung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
let HASS = null;
globalThis.document = { querySelector: () => ({ hass: HASS }) };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
const pop = src('03-popups.js');
const a = pop.indexOf('(function () {\n  if (window._casoraBike) return;');
const b = pop.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'e-bike block found');
new Function(pop.slice(a, b + 6))();
const B = window._casoraBike;
assert.ok(B && window.casoraDevice, 'modules loaded');

// Minimal UI: rows as text, so the sections can be read.
const rowsOf = [];
window._casoraUI = {
  tokens: { font: 'x', ink: '#fff', ink2: '#ccc', ink3: '#999' },
  group: (rows, label) => { rowsOf.push({ label, rows }); return '<g>' + label + ':' + rows.map((r) => r.label + '=' + r.value + (r.sub ? ' (' + r.sub + ')' : '')).join(' | ') + '</g>'; },
  hero: (o) => '<h>' + (o.label || '') + ' ' + o.value + (o.unit ? ' ' + o.unit : '') + (o.sub ? ' / ' + o.sub : '') + '</h>',
  note: (t) => '<n>' + t + '</n>',
};
window.casoraSvc = (s, d) => ({ domain: 'casora', service: s, data: d });

const fresh = () => { HASS = { states: {}, entities: {}, devices: {} }; window.CASORA_SETTINGS = {}; return HASS; };
const dev = (h, id, name) => { h.devices[id] = { id, name, name_by_user: null, manufacturer: 'Bosch', model: name }; };
const add = (h, id, state, { key = null, dev: d = null, attrs = {}, platform = 'bosch_bike_mock' } = {}) => {
  h.entities[id] = { entity_id: id, platform, translation_key: key, device_id: d, hidden: false };
  h.states[id] = { entity_id: id, state, attributes: attrs };
};
// Reset the module cache between houses (it keys on the registry object and the number of states).
const sections = (entity) => {
  rowsOf.length = 0;
  const out = {};
  for (const n of ['hero', 'range', 'last', 'total', 'battery', 'service', 'motor']) out[n] = B.sec(n, HASS.states, entity);
  return out;
};
const NOTE = 'Für Räder mit Bosch Smart System';

// ── 1. Old ids (private fixture style, 2025/26): English suffixes, few keys, odd prefixes per group.
{
  const h = fresh();
  dev(h, 'd1', 'Drive Unit Alt');
  const P = 'drive_unit_alt', G = 'garage_drive_unit_alt';
  add(h, `sensor.${P}_days_since_last_ride`, '42', { key: 'days_since_last_ride', dev: 'd1' });
  add(h, `sensor.${P}_odometer`, '2345.6', { dev: 'd1' });
  add(h, `sensor.${P}_service_due_in_days`, '120.4', { dev: 'd1' });
  add(h, `sensor.${P}_service_due_in_kilometres`, '654', { dev: 'd1' });
  add(h, `date.${P}_service_due_date`, '2027-02-20', { dev: 'd1' });
  add(h, `sensor.${P}_total_rides`, '80', { dev: 'd1' });
  add(h, `sensor.${P}_total_distance_activities`, '2200', { dev: 'd1' });
  add(h, `sensor.${P}_total_ride_duration`, '110.2', { dev: 'd1' });
  add(h, `sensor.${P}_last_ride_date`, '01.09.2026', { dev: 'd1' });
  add(h, `sensor.${P}_last_ride_distance`, '31.2', { dev: 'd1' });
  add(h, `sensor.${P}_last_ride_avg_rider_power`, '98', { dev: 'd1' });
  add(h, `sensor.${P}_last_ride_battery_consumption`, '240.5', { dev: 'd1' });
  add(h, `sensor.${P}_powertube_750_charge_cycles`, '9.7', { dev: 'd1' });
  add(h, `sensor.${P}_powertube_750_cycles_on_bike`, '9.7', { dev: 'd1' });
  add(h, `sensor.${P}_powertube_750_wh_lifetime`, '6353', { dev: 'd1' });
  add(h, `sensor.${G}_powertube_750_state_of_health`, 'unknown', { dev: 'd1' });
  add(h, `sensor.${G}_reachable_range_a100m00040`, '84', { dev: 'd1', attrs: { friendly_name: 'Garage Drive Unit Alt Reachable Range A100M00040' } });
  add(h, `sensor.${G}_reachable_range_a100mspic7`, '38', { dev: 'd1', attrs: { friendly_name: 'Garage Drive Unit Alt Reachable Range A100MSPIC7' } });
  add(h, `sensor.${G}_estimated_range_full`, '77', { key: 'estimated_range_full', dev: 'd1' });
  add(h, `sensor.${G}_energy_charged_365d`, '8800', { key: 'energy_charged_365d', dev: 'd1' });
  add(h, `binary_sensor.${G}_theft_reported`, 'off', { dev: 'd1' });
  add(h, 'number.bosch_ebike_battery_capacity', '750', { key: 'battery_capacity', dev: null, platform: 'ha_bosch_ebike' });
  add(h, 'sensor.other_car_odometer', '41000', { key: 'odometer', dev: 'car' });
  dev(h, 'car', 'Auto');

  const bikes = B.bikes(h.states);
  assert.equal(bikes.length, 1, 'one bike, the car is none: ' + JSON.stringify(bikes.map((x) => x.name)));
  assert.ok(bikes[0].ids.includes('number.bosch_ebike_battery_capacity'), 'account-wide capacity joins the only bike');
  const M = B.map(h.states);
  assert.equal(M.km, `sensor.${P}_odometer`);
  assert.equal(M.dueKm, `sensor.${P}_service_due_in_kilometres`, 'old spelling kilometres');
  assert.equal(M.hours, `sensor.${P}_total_ride_duration`);
  assert.equal(M.lastPower, `sensor.${P}_last_ride_avg_rider_power`);
  assert.equal(M.lastWh, `sensor.${P}_last_ride_battery_consumption`);
  assert.equal(M.cycles, `sensor.${P}_powertube_750_charge_cycles`, 'cycles total, not on/off bike');
  assert.equal(M.capacity, 'number.bosch_ebike_battery_capacity');
  assert.deepEqual(M.modes.map((m) => m.label), ['Eco', 'eMTB+'], 'codes in the id become mode names');
  const r = B.read(h.states);
  assert.equal(r.km, 2345.6); assert.equal(r.dueDays, 120.4); assert.equal(r.dueKm, 654); assert.equal(r.daysSince, 42);
  assert.equal(B.tile(h.states), 'Letzte Fahrt vor 42 T.');
  const S = sections();
  assert.match(S.hero, /Kilometerstand 2\.346 km/);
  assert.ok(!S.hero.includes(NOTE), 'no note when a bike was found');
  assert.match(S.service, /Nächster Service=20\.02\.2027 \(in 120 Tagen\)/);
  assert.match(S.service, /Service nach Strecke=in 654 km/);
  assert.match(S.service, /Diebstahl=Nicht gemeldet/);
  assert.match(S.range, /Eco=84 km \| eMTB\+=38 km/);
  assert.match(S.battery, /Ladezyklen=9,7 \(PowerTube 750 Wh\)/);
  assert.ok(!/Akku-Gesundheit/.test(S.battery), 'unknown health stays out');
  assert.match(S.total, /Fahrten=80 \(2\.200 km aufgezeichnet\) \| Fahrzeit gesamt=110 Std\./);
  assert.match(S.last, /Eigene Leistung=98 W/); assert.match(S.last, /Akku verbraucht=240,5 Wh/);
  assert.ok(!S.service.includes('—') && !S.hero.includes('—'), 'no dash');
}

// ── 2. New integration (1.19) in a German HA: German ids with keys, English ids without; service only as
//      date + due odometer (the integration's days/km sensors unknown) → computed.
const newHouse = (h, d, base, name) => {
  dev(h, d, name);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 45);
  const iso = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
  add(h, `sensor.${base}_kilometerstand`, '1140.63', { key: 'odometer', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_tage_seit_letzter_fahrt`, '1', { key: 'days_since_last_ride', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_service_fallig_in_tagen`, 'unknown', { key: 'service_due_in_days', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_service_fallig_in_kilometern`, 'unknown', { key: 'service_due_in_km', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `date.${base}_service_due_date`, iso, { key: 'service_due_date', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `number.${base}_service_due_odometer`, '1500', { key: 'service_due_odometer', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `number.${base}_battery_capacity`, '750', { key: 'battery_capacity', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_aktive_unterstutzungsstufen`, 'A100M00040, A100M0AUTO, A100M00020, A100M00010', { key: 'active_assist_modes', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_distanz_gesamt_touren`, '1098.2', { key: 'total_distance_activities', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_fahrzeit_gesamt`, '72.58', { key: 'total_duration', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_touren_gesamt`, '58', { key: 'total_rides', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_letzte_fahrt_o_leistung`, '112', { key: 'last_ride_avg_power', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_letzte_fahrt_datum`, '21.10.2026', { key: 'last_ride_date', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_letzte_fahrt_distanz`, '23.4', { key: 'last_ride_distance', dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_reachable_range_eco`, '84', { dev: d, platform: 'ha_bosch_ebike', attrs: { friendly_name: name + ' Reachable Range ECO' } });
  add(h, `sensor.${base}_reachable_range_turbo`, '40', { dev: d, platform: 'ha_bosch_ebike', attrs: { friendly_name: name + ' Reachable Range TURBO' } });
  add(h, `sensor.${base}_range_band`, '40–84 km', { dev: d, platform: 'ha_bosch_ebike', attrs: { min_km: 40, max_km: 84 } });
  add(h, `sensor.${base}_powertube_750_charge_cycles`, '12.3', { dev: d, platform: 'ha_bosch_ebike' });
  add(h, `sensor.${base}_powertube_750_state_of_health`, '96', { dev: d, platform: 'ha_bosch_ebike' });
  add(h, `binary_sensor.${base}_theft_reported`, 'off', { dev: d, platform: 'ha_bosch_ebike' });
  add(h, `binary_sensor.${base}_software_update_available`, 'on', { dev: d, platform: 'ha_bosch_ebike' });
  add(h, `device_tracker.${base}_last_known_location`, 'home', { dev: d, platform: 'ha_bosch_ebike' });
  add(h, `button.${base}_reset_service_due`, 'unknown', { dev: d, platform: 'ha_bosch_ebike' });
};
{
  const h = fresh();
  newHouse(h, 'd2', 'performance_line_neu', 'Performance Line Neu');
  const bikes = B.bikes(h.states);
  assert.equal(bikes.length, 1);
  const M = B.map(h.states);
  assert.equal(M.km, 'sensor.performance_line_neu_kilometerstand', 'German id found by key');
  assert.equal(M.daysSince, 'sensor.performance_line_neu_tage_seit_letzter_fahrt');
  assert.equal(M.dueDate, 'date.performance_line_neu_service_due_date');
  assert.equal(M.dueOdo, 'number.performance_line_neu_service_due_odometer');
  assert.equal(M.theft, 'binary_sensor.performance_line_neu_theft_reported');
  const r = B.read(h.states);
  assert.equal(r.dueDays, 45, 'days computed from the date entity');
  assert.equal(r.dueKm, 359.4, 'km computed from due odometer minus odometer');
  assert.equal(r.serviceDue, false);
  assert.equal(B.tile(h.states), 'Gestern gefahren');
  assert.equal(B.level(h.states), 0);
  const S = sections();
  assert.match(S.hero, /Kilometerstand 1\.141 km \/ Letzte Fahrt vor 1 Tagen/);
  assert.match(S.service, /Nächster Service=\d\d\.\d\d\.\d{4} \(in 45 Tagen\)/);
  assert.match(S.service, /Service nach Strecke=in 359 km/);
  assert.match(S.service, /Software-Update=Verfügbar/);
  assert.match(S.service, /Zuletzt gesehen=Zuhause/);
  assert.match(S.range, /Eco=84 km \| Turbo=40 km \| Unterstützungsmodi=Eco, Auto, Sport, Turbo/);
  assert.match(S.total, /Fahrten=58 \(1\.098 km aufgezeichnet\) \| Fahrzeit gesamt=73 Std\./);
  assert.match(S.battery, /Ladezyklen=12,3 \(PowerTube 750 Wh\) \| Akku-Gesundheit=96 %/);
  assert.match(S.last, /Feierabendrunde|Fahrt=23,4 km \(21\.10\.2026\)/);
  assert.match(S.last, /Eigene Leistung=112 W/);
  assert.ok(!Object.values(S).some((x) => x.includes('—')), 'no dash anywhere: ' + JSON.stringify(S));
  assert.ok(!S.hero.includes(NOTE));
  assert.deepEqual(B.ids(h.states).length, Object.keys(h.states).length, 'all entities of the device go to the bike check');
  // The band stands in when there are no per-mode sensors.
  delete h.states['sensor.performance_line_neu_reachable_range_eco']; delete h.states['sensor.performance_line_neu_reachable_range_turbo'];
  delete h.entities['sensor.performance_line_neu_reachable_range_eco']; delete h.entities['sensor.performance_line_neu_reachable_range_turbo'];
  assert.match(sections().range, /Reichweite=40–84 km/);
}

// ── 3. Mixed: keys only on some entities, English ids elsewhere, service only as days/km sensors.
{
  const h = fresh();
  dev(h, 'd3', 'Mischrad');
  add(h, 'sensor.mischrad_odometer', '500', { dev: 'd3' });
  add(h, 'sensor.mischrad_tage_seit_letzter_fahrt', '0', { key: 'days_since_last_ride', dev: 'd3' });
  add(h, 'sensor.mischrad_service_due_in_days', '-3', { key: 'service_due_in_days', dev: 'd3' });
  add(h, 'sensor.mischrad_service_due_in_km', '120', { dev: 'd3' });
  add(h, 'sensor.mischrad_touren_gesamt', '5', { key: 'total_rides', dev: 'd3' });
  add(h, 'binary_sensor.mischrad_theft_reported', 'off', { dev: 'd3' });
  const r = B.read(h.states);
  assert.equal(r.dueDays, -3); assert.equal(r.dueKm, 120); assert.equal(r.serviceDue, true);
  assert.equal(B.tile(h.states), 'Service fällig'); assert.equal(B.level(h.states), 1);
  const S = sections();
  assert.match(S.service, /Nächster Service=Fällig/, 'no date → the days stand as value');
  assert.ok(!S.service.includes('—'));
  assert.equal(S.range, '', 'no range entities → no range group');
  assert.equal(S.last, '', 'no last ride → no group');
  assert.equal(S.battery, '');
}

// ── 4. Sparse bike (theft + total distance only) and theft reported: rows only for what exists.
{
  const h = fresh();
  dev(h, 'd4', 'Sparrad');
  add(h, 'binary_sensor.sparrad_theft_reported', 'on', { dev: 'd4' });
  add(h, 'sensor.sparrad_distanz_gesamt_touren', '321.7', { key: 'total_distance_activities', dev: 'd4' });
  assert.equal(B.bikes(h.states).length, 1, 'theft sensor + one key make a bike');
  const r = B.read(h.states);
  assert.equal(r.theft, true); assert.equal(r.km, null); assert.equal(r.dist, 321.7);
  assert.equal(B.tile(h.states), 'Diebstahl gemeldet'); assert.equal(B.level(h.states), 2);
  const S = sections();
  assert.match(S.hero, /Distanz gesamt 322 km \/ Diebstahl gemeldet/, 'total distance stands in for the odometer');
  assert.equal(S.service, '<g>Service & Sicherheit:Diebstahl=Gemeldet</g>', 'only the theft row, no „Nächster Service —“');
  assert.equal(S.total, '', 'distance already in the head');
  assert.ok(!S.hero.includes(NOTE));
}

// ── 5. Two bikes: the tile entity picks its bike; without entity the first by name.
{
  const h = fresh();
  newHouse(h, 'dA', 'zweitrad', 'Zweitrad');
  newHouse(h, 'dB', 'erstrad', 'Erstrad');
  h.states['sensor.zweitrad_kilometerstand'].state = '99';
  const bikes = B.bikes(h.states);
  assert.deepEqual(bikes.map((x) => x.name), ['Erstrad', 'Zweitrad']);
  assert.equal(B.read(h.states).km, 1140.63, 'first by name without an entity');
  assert.equal(B.read(h.states, { entity_id: 'sensor.zweitrad_kilometerstand' }).km, 99);
  assert.equal(B.read(h.states, { entity_id: 'binary_sensor.zweitrad_theft_reported' }).km, 99, 'any entity of the bike');
  assert.ok(!B.ids(h.states, { entity_id: 'sensor.zweitrad_kilometerstand' }).includes('sensor.erstrad_kilometerstand'));
  const p = B.popup({ entity_id: 'sensor.zweitrad_kilometerstand' }, {}, h.states);
  assert.equal(p.entity, 'sensor.zweitrad_kilometerstand', 'popup anchored on the tile entity');
}

// ── 6. Settings prefix (older setup) adds a bike without registry keys.
{
  const h = fresh();
  add(h, 'sensor.altrad_odometer', '12', {});
  add(h, 'sensor.altrad_days_since_last_ride', '7', {});
  add(h, 'binary_sensor.rahmen_altrad_theft_reported', 'off', {});
  window.CASORA_SETTINGS = { ebike: { prefix: 'altrad', prefix_garage: 'rahmen_altrad', capacity: null } };
  const bikes = B.bikes(h.states);
  assert.equal(bikes.length, 1);
  assert.ok(bikes[0].ids.includes('binary_sensor.rahmen_altrad_theft_reported'));
  assert.equal(B.read(h.states).km, 12);
  assert.equal(B.tile(h.states), 'Letzte Fahrt vor 7 T.');
}

// ── 7. No bike: tile „Keine Daten“, popup still opens, note under the head, nothing else.
{
  const h = fresh();
  add(h, 'sensor.auto_odometer', '41000', { key: 'odometer', dev: 'car' });
  add(h, 'sensor.auto_service_due_in_days', '12', { key: 'service_due_in_days', dev: 'car' });
  dev(h, 'car', 'Auto');
  add(h, 'sun.sun', 'above_horizon', {});
  assert.equal(B.bikes(h.states).length, 0, 'a car with odometer + service days is no bike');
  assert.equal(B.tile(h.states), 'Keine Daten');
  const S = sections();
  assert.ok(S.hero.includes(NOTE), 'note only without any bike');
  assert.equal(S.service + S.range + S.total + S.battery + S.last + S.motor, '', 'no empty groups');
  const p = B.popup(undefined, {}, h.states);
  assert.ok(p && p.type === 'custom:button-card' && p.entity, 'popup opens on some entity so the note shows');
}
console.log('ebike_zuordnung: ok');
