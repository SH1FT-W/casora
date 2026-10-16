// Kaffeevollautomat (Community-Karte, 25-kaffee.js) ohne HA: Rollenmodell je Integration (Home Connect Core,
// homeconnect_ws, home_connect_alt, Miele, De'Longhi BT/WLAN/Coffeelink, Jura, Melitta, La Marzocco, Steckdose),
// Zustand, Warnungen und Vorwarnungen, Zähler, Kachel-Text, Start je Integration, Popup-Bereiche.
// Geräte und Namen erfunden.   node dev/unit/kaffee.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('25-kaffee.js'))();
const K = window._casoraCoffee;
assert.ok(K && K.roles && K.status && K.tileText && K.popup, 'Modul geladen');

const entities = {}, states = {};
const add = (id, state, { key = null, platform = 'casora_mock', dev = 'd', attrs = {}, cat = null } = {}) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: key, entity_category: cat };
  states[id] = { entity_id: id, state: String(state), attributes: attrs, last_changed: new Date().toISOString() };
};
const hass = () => ({ states, entities, devices: {}, areas: {}, services: {} });
const st = (id) => K.status(K.find(hass(), id), states);
const set = (id, v) => { states[id] = Object.assign({}, states[id], { state: String(v) }); };

// ── 1. Home Connect Core ─────────────────────────────────────────────────
const P = 'consumer_products_coffee_maker_program_';
const PROGS = ['beverage_ristretto', 'beverage_espresso', 'beverage_coffee', 'beverage_cappuccino', 'beverage_latte_macchiato',
  'beverage_hot_water', 'coffee_world_flat_white', 'my_coffee_my_coffee_1', 'cleaning_modes_descaling'].map((x) => P + x);
const hc = { platform: 'home_connect', dev: 'hc' };
const BEAN = ['very_mild', 'mild', 'normal', 'strong', 'very_strong', 'extra_strong', 'double_shot'].map((x) => 'consumer_products_coffee_maker_enum_type_bean_amount_' + x);
const TEMP = ['88_c', '90_c', '92_c', '94_c', '95_c', '96_c'].map((x) => 'consumer_products_coffee_maker_enum_type_coffee_temperature_' + x);
add('switch.bar_power', 'on', { ...hc, key: 'power' });
add('sensor.bar_operation_state', 'ready', { ...hc, key: 'operation_state', attrs: { device_class: 'enum' } });
add('select.bar_active_program', 'unknown', { ...hc, key: 'active_program', attrs: { options: PROGS } });
add('select.bar_selected_program', PROGS[3], { ...hc, key: 'selected_program', attrs: { options: PROGS } });
add('sensor.bar_program_progress', 'unknown', { ...hc, key: 'program_progress', attrs: { unit_of_measurement: '%' } });
add('sensor.bar_program_finish_time', 'unknown', { ...hc, key: 'program_finish_time', attrs: { device_class: 'timestamp' } });
add('button.bar_stop_program', 'unknown', { ...hc, key: 'stop_program' });
add('binary_sensor.bar_remote_start', 'on', { ...hc, key: 'remote_start' });
add('select.bar_bean_amount', BEAN[3], { ...hc, key: 'bean_amount', attrs: { options: BEAN } });
add('select.bar_coffee_temperature', TEMP[2], { ...hc, key: 'coffee_temperature', attrs: { options: TEMP } });
add('number.bar_fill_quantity', '120', { ...hc, key: 'fill_quantity', attrs: { min: 60, max: 250, step: 10, unit_of_measurement: 'ml' } });
add('sensor.bar_coffees', '410', { ...hc, key: 'coffee_counter', cat: 'diagnostic' });
add('sensor.bar_ristretto_espresso_cups', '180', { ...hc, key: 'ristretto_espresso_cups', cat: 'diagnostic' });
add('sensor.bar_coffee_and_milk_cups', '612', { ...hc, key: 'coffee_and_milk_cups', cat: 'diagnostic' });
add('sensor.bar_hot_water_counter', '5400', { ...hc, key: 'hot_water_counter', attrs: { unit_of_measurement: 'ml' }, cat: 'diagnostic' });
add('sensor.bar_water_tank_empty', 'off', { ...hc, key: 'water_tank_empty', attrs: { device_class: 'enum', options: ['confirmed', 'off', 'present'] } });
add('sensor.bar_bean_container_empty', 'off', { ...hc, key: 'bean_container_empty' });
add('sensor.bar_drip_tray_full', 'off', { ...hc, key: 'drip_tray_full' });
add('sensor.bar_descaling_in_10_cups', 'present', { ...hc, key: 'descaling_in_10_cups' });
add('sensor.bar_descaling_in_20_cups', 'present', { ...hc, key: 'descaling_in_20_cups' });
add('sensor.bar_device_should_be_descaled', 'off', { ...hc, key: 'device_should_be_descaled' });

let c = K.find(hass(), 'sensor.bar_operation_state');
assert.equal(c.fam, 'hc');
assert.equal(K.is(hass(), 'switch.bar_power'), true, 'Kaffeegerät erkannt');
assert.equal(c.power, 'switch.bar_power');
assert.equal(c.status, 'sensor.bar_operation_state');
assert.equal(c.actSel, 'select.bar_active_program');
assert.equal(c.sel, 'select.bar_selected_program');
assert.equal(c.stop, 'button.bar_stop_program');
assert.equal(c.remote, 'binary_sensor.bar_remote_start');
assert.equal(c.progress, 'sensor.bar_program_progress');
assert.equal(c.finish, 'sensor.bar_program_finish_time');
assert.deepEqual(c.opts, { strength: 'select.bar_bean_amount', temp: 'select.bar_coffee_temperature', amount: 'number.bar_fill_quantity' });
assert.equal(c.warns.length, 4, 'Wasser, Bohnen, Schale, Entkalken');
assert.equal(c.pre.length, 2);
assert.equal(c.counters.filter((x) => !x.ml).length, 3, 'drei Tassen-Zähler, ml-Zähler extra');
assert.equal(c.total, null, 'Home Connect hat keinen Gesamtzähler');
// gleiche Rollen, egal welche Entität gewählt ist
assert.deepEqual(K.find(hass(), 'switch.bar_power').warns.map((w) => w.id), c.warns.map((w) => w.id));

let s = st('sensor.bar_operation_state');
assert.equal(s.st, 'bereit'); assert.equal(s.label, 'Bereit');
assert.equal(s.total, 410 + 180 + 612, 'Summe der Tassen');
assert.equal(s.perDrink[0].label, 'Kaffee mit Milch');
assert.deepEqual(s.pre.map((p) => [p.art, p.cups]), [['entkalken', 10]], 'nur die nächste Vorwarnung');
assert.equal(K.preText(s.pre[0]), 'Entkalken in 10 Tassen');
assert.equal(K.tileText(s), 'Bereit');
assert.equal(K.active(s), false);
assert.equal(K.iconService(c, s), 'switch.turn_off', 'Icon schaltet Strom');
// Getränke ohne Pflege, Namen und Symbole
const dr = K.drinks(c, states);
assert.deepEqual(dr.filter((x) => !x.care).map((x) => x.label),
  ['Ristretto', 'Espresso', 'Kaffee', 'Cappuccino', 'Latte Macchiato', 'Heißwasser', 'Flat White', 'Mein Kaffee 1']);
assert.equal(dr.filter((x) => x.care).length, 1, 'Entkalken ist Pflege');
assert.equal(K.picked(c, states), PROGS[3], 'an der Maschine gewähltes Programm vorgewählt');
assert.deepEqual(K.strengths(states['select.bar_bean_amount']).map((x) => x.label), ['Mild', 'Normal', 'Stark', 'Sehr stark', 'Extra stark']);
assert.deepEqual(K.temps(states['select.bar_coffee_temperature']).map((x) => x.label), ['88°', '90°', '92°', '94°', '95°', '96°']);
assert.deepEqual(K.amounts(states['number.bar_fill_quantity']).map((x) => x.v), [60, 110, 120, 160, 200, 250]);
assert.ok(K.amounts(states['number.bar_fill_quantity']).some((x) => x.v === 120 && x.on), 'eingestellte Menge dabei');

// Warnung: Wassertank leer → Vorrang auf der Kachel, Kachel hinterlegt in Orange
set('sensor.bar_water_tank_empty', 'present');
s = st('switch.bar_power');
assert.equal(K.tileText(s), 'Wasser nachfüllen');
assert.equal(K.active(s), true); assert.equal(K.color(s), K.COLOR.warn);
set('sensor.bar_water_tank_empty', 'confirmed');
assert.equal(st('switch.bar_power').warns.length, 0, 'quittiert = nicht aktiv');
set('sensor.bar_device_should_be_descaled', 'present');
s = st('switch.bar_power');
assert.equal(s.warns[0].label, 'Entkalken'); assert.equal(s.pre.length, 0, 'Vorwarnung weg, wenn fällig');
set('sensor.bar_device_should_be_descaled', 'off');

// Bezug: Cappuccino 40 %
set('sensor.bar_operation_state', 'run'); set('select.bar_active_program', PROGS[3]); set('sensor.bar_program_progress', '40');
set('sensor.bar_program_finish_time', new Date(Date.now() + 30000).toISOString());
s = st('switch.bar_power');
assert.equal(s.st, 'bezieht'); assert.equal(s.drink.label, 'Cappuccino'); assert.equal(s.pct, 40);
assert.equal(K.tileText(s), 'Cappuccino · 40 %');
assert.equal(K.ring(s), 40);
assert.ok(s.remain > 0 && s.remain < 1);
// Pflegeprogramm läuft
set('select.bar_active_program', PROGS[8]);
s = st('switch.bar_power');
assert.equal(s.st, 'pflege'); assert.equal(s.label, 'Entkalkt');
set('sensor.bar_operation_state', 'ready'); set('select.bar_active_program', 'unknown'); set('sensor.bar_program_progress', 'unknown');
// Aus
set('switch.bar_power', 'off'); set('sensor.bar_operation_state', 'inactive');
s = st('switch.bar_power');
assert.equal(K.tileText(s), 'Aus'); assert.equal(K.iconService(c, s), 'switch.turn_on');
set('switch.bar_power', 'on'); set('sensor.bar_operation_state', 'inactive');
assert.equal(st('switch.bar_power').st, 'bereit', 'inactive mit Strom an = Bereit');
set('sensor.bar_operation_state', 'ready');
// Fernstart aus → gesperrt mit Hinweis
set('binary_sensor.bar_remote_start', 'off');
assert.equal(K.blocked(c, st('switch.bar_power')), 'Fernstart an der Maschine erlauben');
set('binary_sensor.bar_remote_start', 'on');
assert.equal(K.blocked(c, st('switch.bar_power')), null);
// Nicht verfügbar
['switch.bar_power', 'sensor.bar_operation_state', 'select.bar_selected_program'].forEach((id) => set(id, 'unavailable'));
s = st('switch.bar_power');
assert.equal(s.st, 'offline'); assert.equal(K.tileText(s), 'Nicht verfügbar'); assert.equal(K.iconService(c, s), null);
set('switch.bar_power', 'on'); set('sensor.bar_operation_state', 'ready'); set('select.bar_selected_program', PROGS[3]);

// Start je Weg: Home Connect Core mit Dienst (Optionen dabei), sonst active_program
const calls = [];
const hc2 = Object.assign(hass(), { callService: (d, sv, data) => { calls.push([d, sv, data]); return Promise.resolve(); } });
hc2.services = { home_connect: { set_program_and_options: {} } };
await K.start(hc2, c, PROGS[1]);
assert.deepEqual(calls[0].slice(0, 2), ['home_connect', 'set_program_and_options']);
assert.equal(calls[0][2].device_id, 'hc'); assert.equal(calls[0][2].affects_to, 'active_program'); assert.equal(calls[0][2].program, PROGS[1]);
assert.equal(calls[0][2].consumer_products_coffee_maker_option_bean_amount, BEAN[3]);
assert.equal(calls[0][2].consumer_products_coffee_maker_option_fill_quantity, 120);
calls.length = 0; hc2.services = {};
await K.start(hc2, c, PROGS[1]);
assert.deepEqual(calls[0], ['select', 'select_option', { entity_id: 'select.bar_active_program', option: PROGS[1] }]);
calls.length = 0; set('switch.bar_power', 'off');
await K.start(hc2, c, PROGS[1]);
assert.deepEqual(calls[0], ['switch', 'turn_on', { entity_id: 'switch.bar_power' }], 'erst einschalten');
set('switch.bar_power', 'on');

// Home Connect: Waschmaschine ist kein Kaffeegerät
add('sensor.wm_operation_state', 'ready', { platform: 'home_connect', dev: 'wm', key: 'operation_state' });
add('select.wm_selected_program', 'laundry_care_washer_program_cotton', { platform: 'home_connect', dev: 'wm', key: 'selected_program', attrs: { options: ['laundry_care_washer_program_cotton'] } });
assert.equal(K.is(hass(), 'sensor.wm_operation_state'), false, 'Waschmaschine nicht');

// Popup-Bereiche (ohne _casoraUI kein Inhalt, kein Fehler)
assert.deepEqual(K.popup({ entity_id: 'switch.bar_power' }, states, hass()), { type: 'vertical-stack', cards: [] });
assert.equal(K.sec('hero', c, states, hass()), '');

// ── 2. homeconnect_ws (lokal) ────────────────────────────────────────────
const ws = { platform: 'homeconnect_ws', dev: 'ws' };
add('sensor.ws_operation_state', 'Run', { ...ws, key: 'sensor_operation_state' });
add('switch.ws_power', 'on', { ...ws, key: 'switch_power_state' });
add('select.ws_program', 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso', { ...ws, key: 'select_program',
  attrs: { options: ['ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso', 'ConsumerProducts.CoffeeMaker.Program.Beverage.Cappuccino'] } });
add('button.ws_start', 'unknown', { ...ws, key: 'button_start_program' });
add('button.ws_abort', 'unknown', { ...ws, key: 'button_abort_program' });
add('sensor.ws_progress', '70', { ...ws, key: 'sensor_program_progress', attrs: { unit_of_measurement: '%' } });
add('binary_sensor.ws_remote', 'on', { ...ws, key: 'binary_remote_start_allowed' });
add('binary_sensor.ws_beans', 'off', { ...ws, key: 'binary_sensor_bean_container_empty' });
add('sensor.ws_water_tank', 'nearly_empty', { ...ws, key: 'sensor_water_tank' });
add('sensor.ws_drip_tray', 'ok', { ...ws, key: 'sensor_drip_tray' });
add('sensor.ws_countdown_descaling', '35', { ...ws, key: 'sensor_countdown_descaling' });
add('sensor.ws_countdown_water_filter', '0', { ...ws, key: 'sensor_countdown_water_filter' });
add('sensor.ws_count_espresso', '90', { ...ws, key: 'sensor_count_espresso' });
add('sensor.ws_count_cappuccino', '140', { ...ws, key: 'sensor_count_cappuccino' });
c = K.find(hass(), 'switch.ws_power');
assert.equal(c.fam, 'hcws');
assert.equal(c.sel, 'select.ws_program'); assert.equal(c.start, 'button.ws_start'); assert.equal(c.stop, 'button.ws_abort');
assert.equal(c.remote, 'binary_sensor.ws_remote');
s = st('switch.ws_power');
assert.equal(s.st, 'bezieht'); assert.equal(s.pct, 70);
assert.deepEqual(s.warns.map((w) => w.label), ['Wasser bald leer', 'Filter wechseln']);
assert.equal(s.drink.label, 'Espresso', 'laufendes Getränk aus der Auswahl');
assert.deepEqual(s.pre.map((p) => [p.art, p.cups]), [['entkalken', 35]]);
assert.equal(K.tileText(s), 'Filter wechseln', 'harte Warnung vor dem Bezug, „bald leer“ nicht');
assert.deepEqual(s.perDrink.map((x) => x.label), ['Cappuccino', 'Espresso']);
set('sensor.ws_drip_tray', 'full');
assert.ok(st('switch.ws_power').warns.some((w) => w.label === 'Schale leeren'), 'Schale voll (full ist hier schlecht)');
set('sensor.ws_water_tank', 'full');
assert.ok(!st('switch.ws_power').warns.some((w) => w.art === 'wasser'), 'Wassertank voll ist gut');
calls.length = 0;
const ws2 = Object.assign(hass(), { callService: (d, sv, data) => { calls.push([d, sv, data]); return Promise.resolve(); } });
await K.start(ws2, c, 'ConsumerProducts.CoffeeMaker.Program.Beverage.Cappuccino');
assert.deepEqual(calls.map((x) => x[0] + '.' + x[1]), ['select.select_option', 'button.press'], 'erst wählen, dann Start');
assert.equal(K.drink('ConsumerProducts.CoffeeMaker.Program.Beverage.Cappuccino').label, 'Cappuccino', 'Schlüssel normalisiert');
assert.equal(K.drink('consumerproducts_coffeemaker_program_beverage_xlcoffee').label, 'XL-Kaffee');

// ── 3. home_connect_alt ──────────────────────────────────────────────────
const alt = { platform: 'home_connect_alt', dev: 'alt' };
add('sensor.alt_operationstate', 'BSH.Common.EnumType.OperationState.Ready', { ...alt });
add('select.alt_programs', 'ConsumerProducts.CoffeeMaker.Program.Beverage.Coffee', { ...alt,
  attrs: { options: ['ConsumerProducts.CoffeeMaker.Program.Beverage.Coffee', 'ConsumerProducts.CoffeeMaker.Program.Beverage.LatteMacchiato'] } });
add('switch.alt_power', 'on', { ...alt });
c = K.find(hass(), 'switch.alt_power');
assert.equal(c.fam, 'hcalt'); assert.equal(c.power, 'switch.alt_power'); assert.equal(c.status, 'sensor.alt_operationstate');
assert.equal(st('switch.alt_power').st, 'bereit');
assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Kaffee', 'Latte Macchiato']);

// ── 4. Miele ─────────────────────────────────────────────────────────────
const mi = { platform: 'miele', dev: 'mi' };
add('sensor.cm', 'in_use', { ...mi, key: 'status', attrs: { device_class: 'enum' } });
add('sensor.cm_program', 'cappuccino', { ...mi, key: 'program_id', attrs: { options: ['no_program', 'espresso', 'cappuccino', 'appliance_rinse'] } });
add('sensor.cm_phase', 'grinding', { ...mi, key: 'program_phase' });
add('sensor.cm_remaining', '1', { ...mi, key: 'remaining_time', attrs: { unit_of_measurement: 'min' } });
add('switch.cm_power', 'on', { ...mi, key: 'power' });
add('button.cm_stop', 'unknown', { ...mi, key: 'stop' });
c = K.find(hass(), 'sensor.cm');
assert.equal(c.fam, 'miele'); assert.equal(c.status, 'sensor.cm'); assert.equal(c.program, 'sensor.cm_program'); assert.equal(c.phase, 'sensor.cm_phase');
assert.equal(c.stop, 'button.cm_stop');
assert.equal(K.is(hass(), 'sensor.cm'), true);
s = st('sensor.cm');
assert.equal(s.label, 'Cappuccino'); assert.equal(s.phase, 'Mahlt'); assert.equal(s.remain, 1);
assert.equal(K.tileText(s), 'Cappuccino', 'ohne Prozent nur das Getränk');
set('sensor.cm_program', 'appliance_rinse'); set('sensor.cm_phase', 'rinse');
assert.equal(st('sensor.cm').st, 'pflege'); assert.equal(st('sensor.cm').label, 'Spült');
set('sensor.cm', 'program_ended'); assert.equal(st('sensor.cm').label, 'Fertig');
set('sensor.cm', 'failure'); assert.equal(K.tileText(st('sensor.cm')), 'Fehler'); assert.equal(K.color(st('sensor.cm')), K.COLOR.bad);
set('sensor.cm', 'not_connected'); assert.equal(st('sensor.cm').st, 'offline');

// ── 5. De'Longhi BT (delonghi_primadonna) – auch ohne Plattform über die Schlüssel ──
for (const plat of ['delonghi_primadonna', 'casora_mock']) {
  const dl = { platform: plat, dev: 'dl' + plat };
  const p = 'dl' + plat.length;
  add(`sensor.${p}_status`, 'empty_water_tank', { ...dl, key: 'machine_status' });
  add(`switch.${p}_power`, 'on', { ...dl, key: 'power' });
  add(`select.${p}_beverage`, 'espresso', { ...dl, key: 'beverage', attrs: { options: ['espresso', 'coffee', 'long', 'cappuccino', 'hot_water'] } });
  add(`binary_sensor.${p}_dispensing`, 'off', { ...dl, key: 'dispensing' });
  add(`binary_sensor.${p}_descaling`, 'off', { ...dl, key: 'descaling' });
  add(`sensor.${p}_total_coffee`, '300', { ...dl, key: 'total_coffee' });
  add(`sensor.${p}_total_coffee_with_milk`, '120', { ...dl, key: 'total_coffee_with_milk' });
  c = K.find(hass(), `switch.${p}_power`);
  assert.equal(c.fam, 'dlbt', plat);
  assert.equal(c.sel, `select.${p}_beverage`);
  s = st(`switch.${p}_power`);
  assert.equal(s.st, 'aktion_noetig'); assert.equal(K.tileText(s), 'Wasser nachfüllen');
  assert.equal(s.total, 420);
  set(`sensor.${p}_status`, 'brewing');
  assert.equal(K.tileText(st(`switch.${p}_power`)), 'Läuft', 'BT kennt das laufende Getränk nicht');
  set(`sensor.${p}_status`, 'ready'); set(`binary_sensor.${p}_descaling`, 'on');
  assert.equal(K.tileText(st(`switch.${p}_power`)), 'Entkalken');
  calls.length = 0;
  await K.start(Object.assign(hass(), { callService: (d, sv, data) => { calls.push([d, sv, data]); return Promise.resolve(); } }), c, 'cappuccino');
  assert.deepEqual(calls, [['select', 'select_option', { entity_id: `select.${p}_beverage`, option: 'cappuccino' }]], 'Auswahl startet sofort');
}

// ── 6. De'Longhi WLAN (delonghi_coffee) ──────────────────────────────────
const dw = { platform: 'delonghi_coffee', dev: 'dw' };
add('sensor.dw_machine_status', 'Ready', { ...dw, key: 'machine_status' });
add('button.dw_brew_espresso', 'unknown', { ...dw, key: 'brew_espresso' });
add('button.dw_brew_cappuccino', 'unknown', { ...dw, key: 'brew_cappuccino' });
add('binary_sensor.dw_alarm_0', 'off', { ...dw, key: 'alarm_0' });
add('binary_sensor.dw_alarm_5', 'on', { ...dw, key: 'alarm_5' });
add('binary_sensor.dw_alarm_11', 'off', { ...dw, key: 'alarm_11' });
add('sensor.dw_total_beverages', '999', { ...dw, key: 'total_beverages' });
c = K.find(hass(), 'sensor.dw_machine_status');
assert.equal(c.fam, 'dlwifi'); assert.equal(c.brew.length, 2); assert.equal(c.total, 'sensor.dw_total_beverages');
s = st('sensor.dw_machine_status');
assert.equal(s.st, 'bereit'); assert.equal(K.tileText(s), 'Bohnen nachfüllen'); assert.equal(s.total, 999);
set('binary_sensor.dw_alarm_11', 'on');
assert.ok(st('sensor.dw_machine_status').warns.some((w) => w.label === 'Schale einsetzen'));
assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Cappuccino', 'Espresso']);
calls.length = 0;
await K.start(Object.assign(hass(), { callService: (d, sv, data) => { calls.push([d, sv, data]); return Promise.resolve(); } }), c, 'espresso');
assert.deepEqual(calls, [['button', 'press', { entity_id: 'button.dw_brew_espresso' }]], 'Taste je Getränk');

// ── 7. De'Longhi Coffeelink ──────────────────────────────────────────────
const dk = { platform: 'delonghi_coffeelink', dev: 'dk' };
add('sensor.dk_machine_status', 'Heating', { ...dk, key: 'machine_status' });
add('binary_sensor.dk_water_tank_empty', 'off', { ...dk, key: 'water_tank_empty' });
add('binary_sensor.dk_waste_container_full', 'on', { ...dk, key: 'waste_container_full' });
add('binary_sensor.dk_decalcification_needed', 'off', { ...dk, key: 'decalcification_needed' });
add('button.dk_start_coffee', 'unknown', { ...dk, key: 'start_coffee' });
c = K.find(hass(), 'sensor.dk_machine_status');
assert.equal(c.fam, 'dllink');
s = st('sensor.dk_machine_status');
assert.equal(s.st, 'heizt'); assert.equal(K.tileText(s), 'Satzbehälter leeren');
set('binary_sensor.dk_waste_container_full', 'off');
assert.equal(K.tileText(st('sensor.dk_machine_status')), 'Heizt auf');

// ── 8. Jura ──────────────────────────────────────────────────────────────
const ju = { platform: 'jura', dev: 'ju' };
add('select.ju_product', 'espresso', { ...ju, key: 'product', attrs: { options: ['espresso', 'coffee', 'cappuccino', 'flat_white'] } });
add('button.ju_make', 'unknown', { ...ju, key: 'make' });
add('switch.ju_connection', 'on', { ...ju, key: 'connection' });
add('sensor.ju_total_product', '2500', { ...ju, key: 'total_product' });
add('sensor.ju_product_espresso', '800', { ...ju, key: 'product_espresso' });
add('sensor.ju_product_cappuccino', '1100', { ...ju, key: 'product_cappuccino' });
add('binary_sensor.ju_alert_empty_grounds', 'off', { ...ju, key: 'alert_empty_grounds' });
add('binary_sensor.ju_alert_fill_water', 'off', { ...ju, key: 'alert_fill_water' });
add('binary_sensor.ju_alert_cappu_clean_alert', 'on', { ...ju, key: 'alert_cappu_clean_alert' });
c = K.find(hass(), 'select.ju_product');
assert.equal(c.fam, 'jura'); assert.equal(c.power, null, 'Bluetooth-Verbindung ist kein Strom');
assert.equal(c.start, 'button.ju_make');
s = st('select.ju_product');
assert.equal(s.st, 'bereit'); assert.equal(s.total, 2500); assert.equal(K.tileText(s), 'Milchsystem reinigen');
assert.deepEqual(s.perDrink.map((x) => x.label), ['Cappuccino', 'Espresso']);
assert.equal(K.iconService(c, s), null, 'ohne Strom-Schalter kein Icon-Schalten');

// ── 9. Melitta/Nivona ────────────────────────────────────────────────────
const me = { platform: 'melitta_barista', dev: 'me' };
add('sensor.me_state', 'brewing', { ...me, key: 'state' });
add('sensor.me_activity', 'grinding', { ...me, key: 'activity' });
add('sensor.me_progress', '55', { ...me, key: 'progress', attrs: { unit_of_measurement: '%' } });
add('sensor.me_action_required', 'none', { ...me, key: 'action_required' });
add('select.me_recipe', 'Latte Macchiato', { ...me, key: 'recipe', attrs: { options: ['Espresso', 'Cafe Creme', 'Latte Macchiato'] } });
add('button.me_brew', 'unknown', { ...me, key: 'brew' });
add('button.me_cancel', 'unknown', { ...me, key: 'cancel' });
add('button.me_switch_off', 'unknown', { ...me, key: 'switch_off' });
add('sensor.me_total_beverages', '77', { ...me, key: 'total_beverages' });
c = K.find(hass(), 'sensor.me_state');
assert.equal(c.fam, 'melitta'); assert.equal(c.status, 'sensor.me_state'); assert.equal(c.stop, 'button.me_cancel');
assert.equal(c.powerOff, 'button.me_switch_off'); assert.equal(c.start, 'button.me_brew');
s = st('sensor.me_state');
assert.equal(s.st, 'bezieht'); assert.equal(s.phase, 'Mahlt'); assert.equal(s.pct, 55);
assert.equal(K.tileText(s), 'Läuft · 55 %');
set('sensor.me_action_required', 'fill_water'); set('sensor.me_state', 'ready');
assert.equal(K.tileText(st('sensor.me_state')), 'Wasser nachfüllen');
set('sensor.me_action_required', 'trays_missing');
assert.equal(K.tileText(st('sensor.me_state')), 'Schale einsetzen');

// ── 10. La Marzocco ──────────────────────────────────────────────────────
const lm = { platform: 'lamarzocco', dev: 'lm' };
add('switch.lm_main', 'on', { ...lm, key: 'main' });
add('binary_sensor.lm_brewing_active', 'on', { ...lm, key: 'brewing_active' });
add('binary_sensor.lm_water_tank_empty', 'off', { ...lm, key: 'water_tank_empty' });
add('sensor.lm_total_coffees_made', '5000', { ...lm, key: 'total_coffees_made' });
c = K.find(hass(), 'switch.lm_main');
assert.equal(c.fam, 'lamarzocco'); assert.equal(c.power, 'switch.lm_main');
s = st('switch.lm_main');
assert.equal(s.st, 'bezieht'); assert.equal(s.total, 5000);
set('binary_sensor.lm_brewing_active', 'off');
assert.equal(K.tileText(st('switch.lm_main')), 'Bereit');

// ── 11. Steckdose (Rückfall) ─────────────────────────────────────────────
const pl = { platform: 'shelly', dev: 'pl' };
add('switch.pl_switch', 'on', { ...pl });
add('sensor.pl_power', '1200', { ...pl, attrs: { device_class: 'power', unit_of_measurement: 'W' } });
c = K.find(hass(), 'switch.pl_switch');
assert.equal(c.fam, 'plug'); assert.equal(c.plugW, 'sensor.pl_power');
assert.equal(st('switch.pl_switch').st, 'bezieht'); assert.equal(K.tileText(st('switch.pl_switch')), 'Läuft');
set('sensor.pl_power', '12'); assert.equal(st('switch.pl_switch').st, 'bereit');
set('sensor.pl_power', '1.4'); assert.equal(K.tileText(st('switch.pl_switch')), 'Aus', 'unter 3 W aus');
set('switch.pl_switch', 'off'); assert.equal(K.iconService(c, st('switch.pl_switch')), 'switch.turn_on');

// Programm-Namen
assert.equal(K.drink('consumer_products_coffee_maker_program_coffee_world_americano').label, 'Americano');
assert.equal(K.drink('consumer_products_coffee_maker_program_cleaning_modes_descaling').care, true);
assert.equal(K.drink('no_program'), null);
assert.equal(K.drink('Ein ganz neues Getränk').label, 'Ein ganz neues Getränk', 'Unbekanntes lesbar');

console.log('PASS kaffee');
