// Kaffeevollautomat (Community-Karte, 25-kaffee.js) ohne HA: Rollenmodell je Integration (Home Connect Core,
// homeconnect_ws, home_connect_alt, Miele, De'Longhi BT/WLAN/Coffeelink, Jura, Melitta/Nivona, La Marzocco, Steckdose),
// Zustand, Warnungen und Vorwarnungen, Zähler, Kachel-Text, Start je Integration, Halten-Menü, Popup-Kopf.
// Schlüssel, Entity-IDs und Zustandswerte wie in den Quellen der Integrationen (Stand 10/2026); Geräte und Namen erfunden.
//   node dev/unit/kaffee.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
let HASS = null;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' && HASS ? { hass: HASS, dispatchEvent() {} } : null) };
globalThis.localStorage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; })();
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('25-kaffee.js'))();
const K = window._casoraCoffee;
assert.ok(K && K.roles && K.status && K.tileText && K.popup && K.hold, 'Modul geladen');

const entities = {}, states = {};
const add = (id, state, { key = null, platform = 'casora_mock', dev = 'd', attrs = {}, cat = null } = {}) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: key, entity_category: cat };
  states[id] = { entity_id: id, state: String(state), attributes: attrs, last_changed: new Date().toISOString() };
};
const hass = () => ({ states, entities, devices: {}, areas: {}, services: {} });
const st = (id) => K.status(K.find(hass(), id), states);
const set = (id, v, attrs) => { states[id] = Object.assign({}, states[id], { state: String(v) }, attrs ? { attributes: Object.assign({}, states[id].attributes, attrs) } : {}); };
const NB = ' ';
const recorder = (calls, fn) => Object.assign(hass(), { callService: (d, sv, data) => { calls.push([d, sv, data]); return fn ? fn(d, sv, data) : Promise.resolve(); } });

// ── 1. Home Connect Core ─────────────────────────────────────────────────
const P = 'consumer_products_coffee_maker_program_';
const PROGS = ['beverage_ristretto', 'beverage_espresso', 'beverage_coffee', 'beverage_cappuccino', 'beverage_latte_macchiato',
  'beverage_hot_water', 'coffee_world_flat_white', 'my_coffee_my_coffee_1', 'cleaning_modes_descaling'].map((x) => P + x);
const hc = { platform: 'home_connect', dev: 'hc' };
const BEAN = ['very_mild', 'mild', 'normal', 'strong', 'very_strong', 'extra_strong', 'double_shot'].map((x) => 'consumer_products_coffee_maker_enum_type_bean_amount_' + x);
const TEMP = ['88_c', '90_c', '92_c', '94_c', '95_c', '96_c'].map((x) => 'consumer_products_coffee_maker_enum_type_coffee_temperature_' + x);
const EV = { device_class: 'enum', options: ['confirmed', 'off', 'present'] };
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
// Zähler wie Core: *_counter (hot_water_counter in mL ohne state_class)
add('sensor.bar_coffee_counter', '410', { ...hc, key: 'coffee_counter', cat: 'diagnostic' });
add('sensor.bar_ristretto_espresso_counter', '180', { ...hc, key: 'ristretto_espresso_counter', cat: 'diagnostic' });
add('sensor.bar_coffee_and_milk_counter', '612', { ...hc, key: 'coffee_and_milk_counter', cat: 'diagnostic' });
add('sensor.bar_hot_milk_counter', '20', { ...hc, key: 'hot_milk_counter', cat: 'diagnostic' });
add('sensor.bar_frothy_milk_counter', '30', { ...hc, key: 'frothy_milk_counter', cat: 'diagnostic' });
add('sensor.bar_milk_counter', '50', { ...hc, key: 'milk_counter', cat: 'diagnostic' });
add('sensor.bar_hot_water_counter', '5400', { ...hc, key: 'hot_water_counter', attrs: { unit_of_measurement: 'mL', device_class: 'volume' }, cat: 'diagnostic' });
add('sensor.bar_water_tank_empty', 'off', { ...hc, key: 'water_tank_empty', attrs: EV });
add('sensor.bar_bean_container_empty', 'off', { ...hc, key: 'bean_container_empty', attrs: EV });
add('sensor.bar_drip_tray_full', 'off', { ...hc, key: 'drip_tray_full', attrs: EV });
add('sensor.bar_descaling_in_10_cups', 'present', { ...hc, key: 'descaling_in_10_cups', attrs: EV });
add('sensor.bar_descaling_in_20_cups', 'present', { ...hc, key: 'descaling_in_20_cups', attrs: EV });
add('sensor.bar_device_should_be_descaled', 'off', { ...hc, key: 'device_should_be_descaled', attrs: EV });
add('sensor.bar_device_calc_n_clean_blockage', 'off', { ...hc, key: 'device_calc_n_clean_blockage', attrs: EV });

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
assert.equal(c.warns.length, 5, 'Wasser, Bohnen, Schale, Entkalken, Calc’n’Clean blockiert');
assert.equal(c.pre.length, 2);
assert.equal(c.total, null, 'Home Connect hat keinen Gesamtzähler');
assert.ok(!c.counters.some((x) => x.id === 'sensor.bar_milk_counter'), 'milk_counter fällt weg, wenn warme Milch/Milchschaum einzeln gezählt werden');
assert.deepEqual(K.find(hass(), 'switch.bar_power').warns.map((w) => w.id), c.warns.map((w) => w.id), 'gleiche Rollen, egal welche Entität gewählt ist');

let s = st('sensor.bar_operation_state');
assert.equal(s.st, 'bereit'); assert.equal(s.label, 'Bereit');
assert.equal(s.total, 410 + 180 + 612 + 20 + 30, 'Summe der Tassen ohne doppelten Milchzähler, ohne ml');
assert.equal(s.perDrink[0].label, 'Kaffee mit Milch');
assert.ok(s.perDrink.some((x) => x.label === 'Ristretto & Espresso'));
assert.deepEqual(s.pre.map((p) => [p.art, p.cups]), [['entkalken', 10]], 'nur die nächste Vorwarnung');
assert.equal(K.preText(s.pre[0]), 'Entkalken in 10' + NB + 'Tassen', 'geschütztes Leerzeichen vor „Tassen“');
assert.equal(K.tileText(s), 'Bereit');
assert.equal(K.active(s), false);
assert.equal(K.iconService(c, s), 'switch.turn_off', 'Icon schaltet Strom');
const dr = K.drinks(c, states);
assert.deepEqual(dr.filter((x) => !x.care).map((x) => x.label),
  ['Ristretto', 'Espresso', 'Kaffee', 'Cappuccino', 'Latte Macchiato', 'Heißwasser', 'Flat White', 'Mein Kaffee 1']);
assert.equal(dr.filter((x) => x.care).length, 1, 'Entkalken ist Pflege');
assert.equal(new Set(dr.filter((x) => !x.care && !/^mdi:star/.test(x.icon)).map((x) => /:/.test(x.icon) ? 'mdi' : 'eigen')).size, 1, 'eine Symbol-Familie (eigene SVGs)');
assert.equal(K.picked(c, states), PROGS[3], 'an der Maschine gewähltes Programm vorgewählt');
assert.deepEqual(K.strengths(states['select.bar_bean_amount']).map((x) => x.label), ['Mild', 'Normal', 'Stark', 'Sehr stark'], 'höchstens vier Stufen');
assert.deepEqual(K.strengths(states['select.bar_bean_amount'], 3).map((x) => x.label), ['Normal', 'Stark', 'Sehr stark'], 'Handy drei um die eingestellte');
set('select.bar_bean_amount', BEAN[5]);
assert.deepEqual(K.strengths(states['select.bar_bean_amount']).map((x) => x.label), ['Mild', 'Normal', 'Stark', 'Extra stark'], 'eingestellte Stufe ist dabei');
set('select.bar_bean_amount', BEAN[3]);
assert.deepEqual(K.temps(states['select.bar_coffee_temperature']).map((x) => x.label), ['88°', '90°', '92°', '94°', '95°', '96°']);
assert.deepEqual(K.amounts(states['number.bar_fill_quantity']).map((x) => x.v), [100, 120, 150, 200, 250], '50er-Schritte + eingestellte');
assert.ok(K.amounts(states['number.bar_fill_quantity']).some((x) => x.v === 120 && x.on), 'eingestellte Menge dabei');

// Warnung: Wassertank leer → Vorrang auf der Kachel (kurz), Kachel hinterlegt in Tieforange
set('sensor.bar_water_tank_empty', 'present');
s = st('switch.bar_power');
assert.equal(K.tileText(s), 'Wasser leer', 'kurzes Warnwort auf der Kachel');
assert.equal(s.warns[0].label, 'Wasser nachfüllen');
assert.equal(s.warns[0].sub, 'Tank herausnehmen, füllen, einsetzen', 'Anleitung statt Rohdaten');
assert.equal(K.active(s), true); assert.equal(K.color(s), K.COLOR.warn);
assert.match(K.COLOR.warn, /deep-orange/);
assert.equal(K.startWarn(s), 'Wasser ist leer', 'Rückfrage vor dem Start');
set('sensor.bar_water_tank_empty', 'confirmed');
assert.equal(st('switch.bar_power').warns.length, 0, 'quittiert = nicht aktiv');
set('sensor.bar_device_should_be_descaled', 'present');
s = st('switch.bar_power');
assert.equal(s.warns[0].label, 'Entkalken fällig'); assert.equal(K.tileText(s), 'Entkalken fällig'); assert.equal(s.pre.length, 0, 'Vorwarnung weg, wenn fällig');
set('sensor.bar_device_should_be_descaled', 'off');
set('sensor.bar_device_calc_n_clean_blockage', 'present');
s = st('switch.bar_power');
assert.equal(s.warns[0].label, 'Entkalken blockiert'); assert.equal(s.warns[0].sev, 'bad');
set('sensor.bar_device_calc_n_clean_blockage', 'off');

// Bezug: Cappuccino 40 % – Zahl zuerst auf der Kachel
set('sensor.bar_operation_state', 'run'); set('select.bar_active_program', PROGS[3]); set('sensor.bar_program_progress', '40');
set('sensor.bar_program_finish_time', new Date(Date.now() + 30000).toISOString());
s = st('switch.bar_power');
assert.equal(s.st, 'bezieht'); assert.equal(s.drink.label, 'Cappuccino'); assert.equal(s.pct, 40);
assert.equal(K.tileText(s), '40 % · Cappuccino');
assert.equal(K.ring(s), 40);
assert.ok(s.remain > 0 && s.remain < 1);
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
// Unbekannter Statuswert: nicht „Bereit“, sondern lesbar
set('sensor.bar_operation_state', 'some_new_state');
s = st('switch.bar_power');
assert.equal(s.st, 'sonst'); assert.equal(K.tileText(s), 'Some new state');
set('sensor.bar_operation_state', 'ready');
// Nicht verfügbar
['switch.bar_power', 'sensor.bar_operation_state', 'select.bar_selected_program'].forEach((id) => set(id, 'unavailable'));
s = st('switch.bar_power');
assert.equal(s.st, 'offline'); assert.equal(K.tileText(s), 'Nicht verfügbar'); assert.equal(K.iconService(c, s), null);
set('switch.bar_power', 'on'); set('sensor.bar_operation_state', 'ready'); set('select.bar_selected_program', PROGS[3]);

// Start je Weg: Home Connect Core mit Dienst (Optionen dabei), sonst active_program
let calls = [];
const hc2 = recorder(calls);
hc2.services = { home_connect: { set_program_and_options: {} } };
assert.equal(await K.start(hc2, c, PROGS[1]), true);
assert.deepEqual(calls[0].slice(0, 2), ['home_connect', 'set_program_and_options']);
assert.equal(calls[0][2].device_id, 'hc'); assert.equal(calls[0][2].affects_to, 'active_program'); assert.equal(calls[0][2].program, PROGS[1]);
assert.equal(calls[0][2].consumer_products_coffee_maker_option_bean_amount, BEAN[3]);
assert.equal(calls[0][2].consumer_products_coffee_maker_option_fill_quantity, 120);
assert.deepEqual(K.recent('sensor.bar_operation_state'), [PROGS[1]], 'gestartetes Getränk gemerkt (Halten-Menü)');
calls.length = 0; hc2.services = {};
await K.start(hc2, c, PROGS[1]);
assert.deepEqual(calls[0], ['select', 'select_option', { entity_id: 'select.bar_active_program', option: PROGS[1] }]);
// Einschalten und starten: erst einschalten, auf „Bereit“ warten, dann starten
calls.length = 0; set('switch.bar_power', 'off'); set('sensor.bar_operation_state', 'inactive');
let waited = false;
const hc3 = recorder(calls, (d, sv) => { if (sv === 'turn_on') setTimeout(() => { set('switch.bar_power', 'on'); set('sensor.bar_operation_state', 'ready'); }, 20); return Promise.resolve(); });
c = K.find(hc3, 'switch.bar_power');
assert.equal(await K.start(hc3, c, PROGS[1], { wait: 500, step: 5, states: () => states, onWait: () => { waited = true; } }), true);
assert.deepEqual(calls.map((x) => x[0] + '.' + x[1]), ['switch.turn_on', 'select.select_option'], 'erst einschalten, nach „Bereit“ starten');
assert.ok(waited, 'Popup erfährt, dass gewartet wird („Startet, sobald bereit“)');
// … wird sie nicht rechtzeitig bereit: ehrlich nur eingeschaltet
calls.length = 0; set('switch.bar_power', 'off'); set('sensor.bar_operation_state', 'inactive');
const hc4 = recorder(calls, (d, sv) => { if (sv === 'turn_on') set('switch.bar_power', 'on'); return Promise.resolve(); });
set('sensor.bar_operation_state', 'inactive');
const hc4s = () => Object.assign({}, states, { 'sensor.bar_operation_state': { state: 'run', attributes: {} } });
assert.equal(await K.start(hc4, c, PROGS[1], { wait: 40, step: 5, states: hc4s }), 'on', 'nur eingeschaltet');
assert.deepEqual(calls.map((x) => x[1]), ['turn_on']);
set('switch.bar_power', 'on'); set('sensor.bar_operation_state', 'ready');
// Fehler beim Start → { error }
const hc5 = recorder([], () => Promise.reject(new Error('Fernstart nicht erlaubt')));
const r5 = await K.start(hc5, c, PROGS[1]);
assert.ok(r5 && r5.error && r5.error.message === 'Fernstart nicht erlaubt', 'Fehler kommt zurück');

// Home Connect: Waschmaschine ist kein Kaffeegerät
add('sensor.wm_operation_state', 'ready', { platform: 'home_connect', dev: 'wm', key: 'operation_state' });
add('select.wm_selected_program', 'laundry_care_washer_program_cotton', { platform: 'home_connect', dev: 'wm', key: 'selected_program', attrs: { options: ['laundry_care_washer_program_cotton'] } });
assert.equal(K.is(hass(), 'sensor.wm_operation_state'), false, 'Waschmaschine nicht');

// Popup-Bereiche (ohne _casoraUI kein Inhalt, kein Fehler)
assert.deepEqual(K.popup({ entity_id: 'switch.bar_power' }, states, hass()), { type: 'vertical-stack', cards: [] });
assert.equal(K.sec('hero', c, states, hass()), '');

// ── 2. homeconnect_ws (lokal) ────────────────────────────────────────────
const ws = { platform: 'homeconnect_ws', dev: 'ws' };
const WSP = 'consumerproducts_coffeemaker_program_beverage_';
add('sensor.ws_operation_state', 'run', { ...ws, key: 'sensor_operation_state' });
add('switch.ws_power', 'on', { ...ws, key: 'switch_power_state' });
add('select.ws_program', WSP + 'espresso', { ...ws, key: 'select_program', attrs: { options: [WSP + 'espresso', WSP + 'cappuccino'] } });
add('button.ws_start', 'unknown', { ...ws, key: 'button_start_program' });
add('button.ws_abort', 'unknown', { ...ws, key: 'button_abort_program' });
add('sensor.ws_progress', '70', { ...ws, key: 'sensor_program_progress', attrs: { unit_of_measurement: '%' } });
add('sensor.ws_remaining', '20', { ...ws, key: 'sensor_remaining_program_time', attrs: { unit_of_measurement: 's', device_class: 'duration' } });
add('sensor.ws_phase', 'grinding', { ...ws, key: 'sensor_coffeemaker_process_phase' });
add('binary_sensor.ws_remote', 'on', { ...ws, key: 'binary_remote_start_allowed' });
add('binary_sensor.ws_beans', 'off', { ...ws, key: 'binary_sensor_bean_container_empty' });
add('sensor.ws_water_tank', 'nearly_empty', { ...ws, key: 'sensor_water_tank' });
add('sensor.ws_drip_tray', 'ok', { ...ws, key: 'sensor_drip_tray' });
add('sensor.ws_countdown_descaling', '35', { ...ws, key: 'sensor_countdown_descaling' });
add('sensor.ws_countdown_water_filter', '0', { ...ws, key: 'sensor_countdown_water_filter' });
// Zähler ohne Einheit – auch Heißwasser (zählt ml); gestartet/abgeschlossen sind keine Getränke
add('sensor.ws_count_ristretto_espresso', '90', { ...ws, key: 'sensor_count_ristretto_espresso' });
add('sensor.ws_count_coffee_milk', '140', { ...ws, key: 'sensor_count_coffee_milk' });
add('sensor.ws_count_hot_water', '3000', { ...ws, key: 'sensor_count_hot_water' });
add('sensor.ws_count_hot_water_cups', '12', { ...ws, key: 'sensor_count_hot_water_cups' });
add('sensor.ws_count_started', '500', { ...ws, key: 'sensor_count_started' });
add('sensor.ws_count_completed', '480', { ...ws, key: 'sensor_count_completed' });
c = K.find(hass(), 'switch.ws_power');
assert.equal(c.fam, 'hcws');
assert.equal(c.sel, 'select.ws_program'); assert.equal(c.start, 'button.ws_start'); assert.equal(c.stop, 'button.ws_abort');
assert.equal(c.remote, 'binary_sensor.ws_remote');
assert.equal(c.remaining, 'sensor.ws_remaining', 'Restzeit (Sekunden)'); assert.equal(c.phase, 'sensor.ws_phase', 'Prozessphase');
s = st('switch.ws_power');
assert.equal(s.st, 'bezieht'); assert.equal(s.pct, 70);
assert.equal(s.phase, 'Mahlt'); assert.ok(Math.abs(s.remain - 20 / 60) < 1e-6);
assert.deepEqual(s.warns.map((w) => w.label), ['Wasser bald leer', 'Filter wechseln']);
assert.equal(s.drink.label, 'Espresso', 'laufendes Getränk aus der Auswahl');
assert.deepEqual(s.pre.map((p) => [p.art, p.cups]), [['entkalken', 35]]);
assert.equal(K.tileText(s), 'Filter wechseln', 'harte Warnung vor dem Bezug, „bald leer“ nicht');
assert.deepEqual(s.perDrink.map((x) => x.label), ['Kaffee mit Milch', 'Ristretto & Espresso', 'Heißwasser'], 'deutsche Namen, ohne ml und gestartet/abgeschlossen');
assert.equal(s.total, 90 + 140 + 12);
set('sensor.ws_drip_tray', 'full');
assert.ok(st('switch.ws_power').warns.some((w) => w.label === 'Schale leeren'), 'Schale voll (full ist hier schlecht)');
set('sensor.ws_water_tank', 'full');
assert.ok(!st('switch.ws_power').warns.some((w) => w.art === 'wasser'), 'Wassertank voll ist gut');
set('sensor.ws_water_tank', 'not_inserted');
assert.equal(K.tileText(st('switch.ws_power')), 'Tank fehlt');
calls = [];
await K.start(recorder(calls), c, WSP + 'cappuccino');
assert.deepEqual(calls.map((x) => x[0] + '.' + x[1]), ['select.select_option', 'button.press'], 'erst wählen, dann Start');
assert.equal(K.drink('ConsumerProducts.CoffeeMaker.Program.Beverage.Cappuccino').label, 'Cappuccino', 'Schlüssel normalisiert');
assert.equal(K.drink('consumerproducts_coffeemaker_program_beverage_xlcoffee').label, 'XL-Kaffee');

// ── 3. home_connect_alt: allgemeine Schlüssel, entscheidend ist das Ende der Entity-ID ──
const alt = { platform: 'home_connect_alt', dev: 'alt' };
const H = 'siemens_ti9_68a40e000000';
add(`sensor.${H}_bsh_common_status_doorstate`, 'BSH.Common.EnumType.DoorState.Closed', { ...alt, key: 'statuses' });
add(`sensor.${H}_bsh_common_status_operationstate`, 'BSH.Common.EnumType.OperationState.Ready', { ...alt, key: 'statuses' });
add(`select.${H}_programs`, 'ConsumerProducts.CoffeeMaker.Program.Beverage.Coffee', { ...alt, key: 'programs',
  attrs: { options: ['ConsumerProducts.CoffeeMaker.Program.Beverage.Coffee', 'ConsumerProducts.CoffeeMaker.Program.Beverage.LatteMacchiato'] } });
add(`select.${H}_consumerproducts_coffeemaker_option_beanamount`, 'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild', { ...alt, key: 'options',
  attrs: { options: ['ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild', 'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Strong'] } });
add(`number.${H}_consumerproducts_coffeemaker_option_fillquantity`, '120', { ...alt, attrs: { min: 60, max: 260 } });
add(`switch.${H}_bsh_common_setting_powerstate`, 'on', { ...alt });
add(`button.${H}_start_pause`, 'unknown', { ...alt, key: 'start_program' });
add(`button.${H}_stop`, 'unknown', { ...alt, key: 'stop_program' });
add(`binary_sensor.${H}_bsh_common_status_remotecontrolstartallowed`, 'on', { ...alt });
add(`sensor.${H}_consumerproducts_coffeemaker_status_beveragecountercoffee`, '321', { ...alt, key: 'statuses' });
c = K.find(hass(), `switch.${H}_bsh_common_setting_powerstate`);
assert.equal(c.fam, 'hcalt');
assert.equal(c.power, `switch.${H}_bsh_common_setting_powerstate`);
assert.equal(c.status, `sensor.${H}_bsh_common_status_operationstate`, 'nicht der Türzustand (gleicher Schlüssel „statuses“)');
assert.equal(c.sel, `select.${H}_programs`); assert.equal(c.start, `button.${H}_start_pause`); assert.equal(c.stop, `button.${H}_stop`);
assert.equal(c.remote, `binary_sensor.${H}_bsh_common_status_remotecontrolstartallowed`);
assert.equal(c.opts.strength, `select.${H}_consumerproducts_coffeemaker_option_beanamount`);
assert.equal(c.opts.amount, `number.${H}_consumerproducts_coffeemaker_option_fillquantity`);
s = st(`switch.${H}_bsh_common_setting_powerstate`);
assert.equal(s.st, 'bereit');
assert.deepEqual(s.perDrink.map((x) => [x.label, x.n]), [['Kaffee', 321]]);
assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Kaffee', 'Latte Macchiato']);
set(`sensor.${H}_bsh_common_status_operationstate`, 'BSH.Common.EnumType.OperationState.Run');
assert.equal(st(`switch.${H}_bsh_common_setting_powerstate`).drink.label, 'Kaffee');

// ── 4. Miele ─────────────────────────────────────────────────────────────
const mi = { platform: 'miele', dev: 'mi' };
add('sensor.cm', 'in_use', { ...mi, key: 'status', attrs: { device_class: 'enum' } });
add('sensor.cm_program', 'cappuccino', { ...mi, key: 'program_id', attrs: { options: ['no_program', 'espresso', 'cappuccino', 'caffe_americano', 'appliance_rinse'] } });
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
set('sensor.cm_phase', '2nd_grinding'); assert.equal(st('sensor.cm').phase, 'Mahlt', 'zweiter Durchgang');
set('sensor.cm_program', 'appliance_rinse'); set('sensor.cm_phase', 'rinse');
assert.equal(st('sensor.cm').st, 'pflege'); assert.equal(st('sensor.cm').label, 'Spült');
set('sensor.cm', 'program_ended'); assert.equal(st('sensor.cm').label, 'Fertig');
set('sensor.cm', 'failure'); assert.equal(K.tileText(st('sensor.cm')), 'Fehler'); assert.equal(K.color(st('sensor.cm')), K.COLOR.bad);
set('sensor.cm', 'not_connected'); assert.equal(st('sensor.cm').st, 'offline');
// Miele-Getränke deutsch, Tees, keine Einstellungen im Raster
assert.equal(K.drink('caffe_americano').label, 'Americano');
assert.equal(K.drink('cappuccino_italiano').label, 'Cappuccino Italiano');
assert.equal(K.drink('very_hot_water').label, 'Sehr heißes Wasser');
assert.equal(K.drink('black_tea').label, 'Schwarzer Tee'); assert.equal(K.drink('herbal_tea').label, 'Kräutertee');
assert.equal(K.drink('check_appliance'), null); assert.equal(K.drink('barista_assistant'), null);
assert.equal(K.drink('milk_pipework_rinse').care, true); assert.equal(K.drink('intermediate_rinsing').care, true);

// ── 5. De'Longhi BT (delonghi_primadonna): device_status, make_beverage (startet sofort, bleibt „none“) ──
for (const plat of ['delonghi_primadonna', 'casora_mock']) {
  const dl = { platform: plat, dev: 'dl' + plat };
  const p = 'dl' + plat.length;
  add(`sensor.${p}_device_status`, 'empty_water_tank', { ...dl, key: 'device_status', cat: 'diagnostic' });
  add(`switch.${p}_power`, 'on', { ...dl, key: 'power' });
  add(`select.${p}_make_beverage`, 'none', { ...dl, key: 'make_beverage', attrs: { options: ['none', 'Espresso Coffee', 'Coffee', 'Cappuccino', 'Hot Water'] } });
  add(`binary_sensor.${p}_dispensing`, 'off', { ...dl, key: 'dispensing', attrs: { percentage: 0 } });
  add(`binary_sensor.${p}_descaling`, 'off', { ...dl, key: 'descaling' });
  add(`sensor.${p}_total_coffee`, '300', { ...dl, key: 'total_coffee' });
  add(`sensor.${p}_total_coffee_with_milk`, '120', { ...dl, key: 'total_coffee_with_milk' });
  add(`sensor.${p}_total_water`, '86.4', { ...dl, key: 'total_water', attrs: { unit_of_measurement: 'L' } });
  add(`sensor.${p}_daily_coffee`, '3', { ...dl, key: 'daily_coffee' });
  c = K.find(hass(), `switch.${p}_power`);
  assert.equal(c.fam, 'dlbt', plat);
  assert.equal(c.sel, `select.${p}_make_beverage`); assert.equal(c.status, `sensor.${p}_device_status`);
  assert.equal(c.stop, null, 'keine Abbrechen-Taste');
  s = st(`switch.${p}_power`);
  assert.equal(s.st, 'aktion_noetig'); assert.equal(K.tileText(s), 'Wasser leer');
  assert.equal(s.label, 'Wasser nachfüllen', 'Grund statt „Eingriff nötig“');
  assert.equal(s.total, 420, 'Kaffee + Milchgetränke, ohne Wasser (L) und Tageszähler');
  for (const [v, lbl] of [['coffee_beans_empty_two', 'Bohnen leer'], ['bean_hopper_absent', 'Behälter fehlt'], ['machine_to_service', 'Service nötig']]) {
    set(`sensor.${p}_device_status`, v); assert.equal(K.tileText(st(`switch.${p}_power`)), lbl, v);
  }
  set(`sensor.${p}_device_status`, 'cleaning_milk_spout'); assert.equal(st(`switch.${p}_power`).st, 'pflege');
  set(`sensor.${p}_device_status`, 'changing_filter'); assert.equal(st(`switch.${p}_power`).st, 'pflege');
  set(`sensor.${p}_device_status`, 'tank_is_in_position'); assert.equal(st(`switch.${p}_power`).st, 'bereit', 'Merker ohne Alarm');
  set(`sensor.${p}_device_status`, 'State 9'); assert.equal(K.tileText(st(`switch.${p}_power`)), 'State 9', 'unbekannt: Rohtext');
  set(`sensor.${p}_device_status`, 'brewing'); set(`binary_sensor.${p}_dispensing`, 'on', { percentage: 40 });
  s = st(`switch.${p}_power`);
  assert.equal(s.pct, 40, 'Fortschritt aus „Gibt aus“');
  assert.equal(K.tileText(s), '40 % · Läuft', 'ohne Auswahl kennt die Kachel das Getränk nicht');
  set(`sensor.${p}_device_status`, 'ready'); set(`binary_sensor.${p}_dispensing`, 'off', { percentage: 0 }); set(`binary_sensor.${p}_descaling`, 'on');
  assert.equal(K.tileText(st(`switch.${p}_power`)), 'Entkalken fällig');
  set(`binary_sensor.${p}_descaling`, 'off');
  assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Espresso', 'Kaffee', 'Cappuccino', 'Heißwasser'], '„none“ ist kein Getränk');
  calls = [];
  await K.start(recorder(calls), c, 'Cappuccino');
  assert.deepEqual(calls, [['select', 'select_option', { entity_id: `select.${p}_make_beverage`, option: 'Cappuccino' }]], 'Auswahl startet sofort');
}
// Getränk beim Bezug aus dem eben gestarteten (Popup/Halten): K.of kennt es
HASS = recorder([]);
c = K.find(hass(), 'switch.dl19_power');
set('sensor.dl19_device_status', 'ready');
window._casoraMiHooks.forEach((f) => f('coffee-start:' + c.anchor + '|Cappuccino'));
await new Promise((r) => setTimeout(r, 20));
set('sensor.dl19_device_status', 'brewing'); set('binary_sensor.dl19_dispensing', 'on', { percentage: 20 });
assert.equal(K.tileText(K.of({ entity_id: 'switch.dl19_power' }, hass())), '20 % · Cappuccino', 'gestartetes Getränk statt „Läuft“');
set('sensor.dl19_device_status', 'ready'); set('binary_sensor.dl19_dispensing', 'off', { percentage: 0 });
HASS = null;

// ── 6. De'Longhi WLAN (delonghi_coffee) ──────────────────────────────────
const dw = { platform: 'delonghi_coffee', dev: 'dw' };
add('sensor.dw_machine_status', 'Ready', { ...dw, key: 'machine_status' });
add('button.dw_brew_espresso', 'unknown', { ...dw, key: 'brew_espresso' });
add('button.dw_brew_cappuccino', 'unknown', { ...dw, key: 'brew_cappuccino' });
add('button.dw_cancel_brew', 'unknown', { ...dw, key: 'cancel_brew' });
for (const n of [0, 5, 11, 13, 15, 17]) add('binary_sensor.dw_alarm_' + n, n === 5 ? 'on' : 'off', { ...dw, key: 'alarm_' + n });
add('sensor.dw_total_beverages', '999', { ...dw, key: 'total_beverages' });
add('sensor.dw_computed_total', '990', { ...dw, key: 'computed_total' });
add('sensor.dw_espresso', '300', { ...dw, key: 'espresso' });
add('sensor.dw_long_coffee', '120', { ...dw, key: 'long_coffee' });
add('sensor.dw_total_water_ml', '210', { ...dw, key: 'total_water_ml', attrs: { unit_of_measurement: 'L' } });
add('sensor.dw_descale_count', '4', { ...dw, key: 'descale_count' });
c = K.find(hass(), 'sensor.dw_machine_status');
assert.equal(c.fam, 'dlwifi'); assert.equal(c.brew.length, 2); assert.equal(c.total, 'sensor.dw_total_beverages');
assert.equal(c.stop, 'button.dw_cancel_brew', 'cancel_brew bricht ab');
s = st('sensor.dw_machine_status');
assert.equal(s.st, 'bereit'); assert.equal(K.tileText(s), 'Bohnen leer'); assert.equal(s.total, 999);
assert.deepEqual(s.perDrink.map((x) => x.label), ['Espresso', 'Lungo']);
set('binary_sensor.dw_alarm_5', 'off');
for (const [n, lbl] of [[13, 'Wassertank einsetzen'], [15, 'Bohnen nachfüllen'], [17, 'Bohnenbehälter einsetzen'], [11, 'Schale einsetzen']]) {
  set('binary_sensor.dw_alarm_' + n, 'on');
  assert.ok(st('sensor.dw_machine_status').warns.some((w) => w.label === lbl), 'Alarm ' + n);
  set('binary_sensor.dw_alarm_' + n, 'off');
}
for (const [v, want] of [['Turning On', 'heizt'], ['Preparing Milk', 'bezieht'], ['Dispensing Hot Water', 'bezieht'], ['Cleaning Milk System', 'pflege'],
  ['Rinsing Water Filter', 'pflege'], ['Preparing Chocolate', 'bezieht'], ['Going to sleep', 'aus'], ['Idle', 'bereit']]) {
  set('sensor.dw_machine_status', v); assert.equal(st('sensor.dw_machine_status').st, want, v);
}
set('sensor.dw_machine_status', 'Unknown (13)'); assert.equal(K.tileText(st('sensor.dw_machine_status')), 'Unbekannt');
set('sensor.dw_machine_status', 'Ready');
// Gesamtzähler da, aber gerade ohne Wert: keine Ersatzsumme
set('sensor.dw_total_beverages', 'unavailable');
assert.equal(st('sensor.dw_machine_status').total, null);
set('sensor.dw_total_beverages', '999');
assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Cappuccino', 'Espresso']);
calls = [];
await K.start(recorder(calls), c, 'espresso');
assert.deepEqual(calls, [['button', 'press', { entity_id: 'button.dw_brew_espresso' }]], 'Taste je Getränk');
calls = [];
await K.stop(recorder(calls), c);
assert.deepEqual(calls, [['button', 'press', { entity_id: 'button.dw_cancel_brew' }]]);

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
assert.equal(s.st, 'heizt'); assert.equal(K.tileText(s), 'Satz voll');
set('binary_sensor.dk_waste_container_full', 'off');
assert.equal(K.tileText(st('sensor.dk_machine_status')), 'Heizt auf');

// ── 8. Jura (ohne translation_key, entity_id <mac>_<attr>) ─────────────────
for (const plat of ['jura', 'casora_mock']) {
  const ju = { platform: plat, dev: 'ju' + plat };
  const m = plat === 'jura' ? 'aabbccddeeff' : 'aabbccddee00';
  add(`select.${m}_product`, 'Espresso', { ...ju, attrs: { options: ['Espresso', 'Coffee', 'Cappuccino', 'Flat White'] } });
  add(`button.${m}_make`, 'unknown', { ...ju });
  add(`switch.${m}_connection`, 'on', { ...ju });
  add(`binary_sensor.${m}_connection`, 'on', { ...ju, attrs: { device_class: 'connectivity' }, cat: 'diagnostic' });
  add(`sensor.${m}_total_product`, '2500', { ...ju, attrs: { unit_of_measurement: 'products' } });
  add(`sensor.${m}_product_espresso`, '800', { ...ju, attrs: { unit_of_measurement: 'products' } });
  add(`sensor.${m}_product_cappuccino`, '1100', { ...ju, attrs: { unit_of_measurement: 'products' } });
  add(`sensor.${m}_alerts`, 'alert', { ...ju, attrs: { device_class: 'enum' } });
  for (const a of ['insert_tray', 'fill_water', 'empty_grounds', 'empty_tray', 'cleaning_alert', 'filter_alert', 'cappu_rinse_alert', 'cappu_clean_alert']) {
    add(`binary_sensor.${m}_alert_${a}`, a === 'cappu_clean_alert' ? 'on' : 'off', { ...ju, attrs: { device_class: 'problem' } });
  }
  c = K.find(hass(), `select.${m}_product`);
  assert.equal(c.fam, 'jura', plat); assert.equal(c.power, null, 'Bluetooth-Verbindung ist kein Strom');
  assert.equal(c.sel, `select.${m}_product`); assert.equal(c.start, `button.${m}_make`);
  assert.equal(c.conn, `binary_sensor.${m}_connection`);
  assert.equal(c.warns.length, 8, 'alle Jura-Hinweise');
  s = st(`select.${m}_product`);
  assert.equal(s.st, 'bereit'); assert.equal(s.total, 2500); assert.equal(K.tileText(s), 'Milchsystem reinigen');
  assert.deepEqual(s.perDrink.map((x) => x.label), ['Cappuccino', 'Espresso'], 'Zähler je Produkt über das Ende der Entity-ID');
  assert.equal(K.iconService(c, s), null, 'ohne Strom-Schalter kein Icon-Schalten');
  set(`binary_sensor.${m}_connection`, 'off');
  s = st(`select.${m}_product`);
  assert.equal(s.st, 'offline'); assert.equal(K.tileText(s), 'Nicht verbunden', 'getrennt statt „Bereit“');
  assert.equal(K.blocked(c, s), 'Nicht verbunden');
  set(`binary_sensor.${m}_connection`, 'on');
}

// ── 9. Melitta/Nivona (Anzeigetexte, Schlüssel nur teilweise) ───────────────
const me = { platform: 'melitta_barista', dev: 'me' };
add('sensor.barista_state', 'Brewing', { ...me });
add('sensor.barista_activity', 'Grinding', { ...me });
add('sensor.barista_progress', '55', { ...me, attrs: { unit_of_measurement: '%' } });
add('sensor.barista_action_required', 'None', { ...me });
add('sensor.barista_connection', 'Connected', { ...me });
add('select.barista_recipe', 'Latte Macchiato', { ...me, attrs: { options: ['Espresso', 'Café Crème', 'Latte Macchiato', 'Red Eye', 'Hot Water'] } });
add('button.barista_brew', 'unknown', { ...me });
add('button.barista_brew_freestyle', 'unknown', { ...me });
add('button.barista_cancel', 'unknown', { ...me });
add('button.barista_switch_off', 'unknown', { ...me });
add('sensor.barista_total_cups', '77', { ...me, attrs: { unit_of_measurement: 'cups' } });
add('sensor.barista_descale_warning', '0', { ...me, key: 'descale_warning', cat: 'diagnostic' });
c = K.find(hass(), 'sensor.barista_state');
assert.equal(c.fam, 'melitta'); assert.equal(c.status, 'sensor.barista_state'); assert.equal(c.stop, 'button.barista_cancel');
assert.equal(c.powerOff, 'button.barista_switch_off'); assert.equal(c.start, 'button.barista_brew'); assert.equal(c.brew.length, 0, 'Freestyle ist kein Getränk');
assert.equal(c.total, 'sensor.barista_total_cups');
s = st('sensor.barista_state');
assert.equal(s.st, 'bezieht'); assert.equal(s.phase, 'Mahlt'); assert.equal(s.pct, 55);
assert.equal(K.tileText(s), '55 % · Latte Macchiato', 'Getränk aus der Auswahl');
assert.equal(s.warns.length, 0, 'Nivona-Merker „0“ ist nicht aktiv');
set('sensor.barista_descale_warning', '1');
assert.ok(st('sensor.barista_state').warns.some((w) => w.art === 'entkalken'), '„1“ ist aktiv');
set('sensor.barista_descale_warning', '0');
set('sensor.barista_action_required', 'Fill Water'); set('sensor.barista_state', 'Ready');
assert.equal(K.tileText(st('sensor.barista_state')), 'Wasser leer');
set('sensor.barista_action_required', 'Trays Missing');
assert.equal(K.tileText(st('sensor.barista_state')), 'Schale fehlt');
set('sensor.barista_action_required', 'Brew Unit Removed');
assert.equal(st('sensor.barista_state').warns[0].label, 'Brühgruppe einsetzen');
set('sensor.barista_action_required', 'Close Powder Lid');
s = st('sensor.barista_state');
assert.equal(s.st, 'aktion_noetig'); assert.equal(s.label, 'Eingriff nötig'); assert.equal(s.need, 'Close Powder Lid');
set('sensor.barista_action_required', 'None');
for (const v of ['Easy Clean', 'Intensive Clean', 'Evaporating', 'Descaling']) { set('sensor.barista_state', v); assert.equal(st('sensor.barista_state').st, 'pflege', v); }
set('sensor.barista_state', 'Ready');
assert.deepEqual(K.drinks(c, states).map((x) => x.label), ['Espresso', 'Caffè Crema', 'Latte Macchiato', 'Red Eye', 'Heißwasser']);
set('sensor.barista_connection', 'Disconnected');
assert.equal(K.tileText(st('sensor.barista_state')), 'Nicht verbunden');
set('sensor.barista_connection', 'Connected');

// ── 10. La Marzocco ──────────────────────────────────────────────────────
for (const plat of ['lamarzocco', 'casora_mock']) {
  const lm = { platform: plat, dev: 'lm' + plat };
  const p = 'lm' + plat.length;
  add(`switch.${p}`, 'on', { ...lm, key: 'main' });
  add(`binary_sensor.${p}_brew_active`, 'on', { ...lm, key: 'brew_active' });
  add(`binary_sensor.${p}_water_tank`, 'off', { ...lm, key: 'water_tank' });
  add(`button.${p}_start_backflush`, 'unknown', { ...lm, key: 'start_backflush' });
  add(`sensor.${p}_total_coffees_made`, '5000', { ...lm, key: 'total_coffees_made' });
  c = K.find(hass(), `switch.${p}`);
  assert.equal(c.fam, 'lamarzocco', plat); assert.equal(c.power, `switch.${p}`);
  s = st(`switch.${p}`);
  assert.equal(s.st, 'bezieht', 'brew_active'); assert.equal(s.total, 5000);
  assert.ok(K.drinks(c, states).every((x) => x.care), 'Rückspülen ist Pflege, nie im Getränke-Raster');
  set(`binary_sensor.${p}_brew_active`, 'off');
  assert.equal(K.tileText(st(`switch.${p}`)), 'Bereit');
  set(`binary_sensor.${p}_water_tank`, 'on');
  assert.equal(K.tileText(st(`switch.${p}`)), 'Wasser leer');
}

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

// ── 12. HA-Start: Zustände kommen nach und nach – die Rollen werden neu bestimmt ──
add('switch.late_power', 'on', { platform: 'home_connect', dev: 'late', key: 'power' });
entities['sensor.late_operation_state'] = { entity_id: 'sensor.late_operation_state', platform: 'home_connect', device_id: 'late', translation_key: 'operation_state' };
entities['sensor.late_coffee_counter'] = { entity_id: 'sensor.late_coffee_counter', platform: 'home_connect', device_id: 'late', translation_key: 'coffee_counter' };
const H1 = hass();
assert.equal(K.find(H1, 'switch.late_power').status, null, 'noch ohne Zustand');
states['sensor.late_operation_state'] = { entity_id: 'sensor.late_operation_state', state: 'ready', attributes: {} };
states['sensor.late_coffee_counter'] = { entity_id: 'sensor.late_coffee_counter', state: '5', attributes: {} };
assert.equal(K.find(H1, 'switch.late_power').status, 'sensor.late_operation_state', 'gleiche Registry, neue Zustände → neu bestimmt');

// ── 13. Klick-Hooks: „|“ im Programmnamen, Sperre nach Abbrechen ───────────
add('select.pipe_product', 'A|B', { platform: 'jura', dev: 'pipe', attrs: { options: ['A|B', 'Espresso'] } });
add('button.pipe_make', 'unknown', { platform: 'jura', dev: 'pipe' });
HASS = hass();
c = K.find(HASS, 'select.pipe_product');
window._casoraMiHooks.forEach((f) => f('coffee-pick:select.pipe_product|A|B'));
assert.equal(K.picked(c, states), 'A|B', 'nur am ersten „|“ getrennt');
window._casoraMiHooks.forEach((f) => f('coffee-pick:select.pipe_product|A|B'));
HASS = null;

// ── 14. Halten-Menü ──────────────────────────────────────────────────────
HASS = hass();
set('sensor.bar_operation_state', 'ready'); set('switch.bar_power', 'on');
let hold = K.hold(HASS, 'sensor.bar_operation_state');
assert.equal(hold[0].t, 'Ausschalten', 'An/Aus zuerst');
const drinkItems = hold.filter((x) => /starten$/.test(x.t));
assert.equal(drinkItems.length, 2, 'zwei Getränke');
assert.equal(drinkItems[0].t, 'Espresso starten', 'zuletzt gestartetes zuerst');
assert.ok(hold.every((x) => !x.ic || /^mdi:/.test(x.ic)), 'Halten-Menü nur mit mdi-Symbolen');
assert.equal(K.hold(HASS, 'switch.bar_power').filter((x) => x.t === 'Ausschalten').length, 0, 'Kachel am Schalter: kein doppeltes An/Aus');
set('binary_sensor.bar_remote_start', 'off');
assert.equal(K.hold(HASS, 'sensor.bar_operation_state').filter((x) => /starten$/.test(x.t)).length, 0, 'ohne Fernstart keine Getränke');
set('binary_sensor.bar_remote_start', 'on');
set('sensor.bar_operation_state', 'run'); set('select.bar_active_program', PROGS[3]); set('sensor.bar_program_progress', '10');
hold = K.hold(HASS, 'sensor.bar_operation_state');
assert.ok(hold.some((x) => x.t === 'Abbrechen'), 'Abbrechen beim Bezug');
assert.ok(!hold.some((x) => /starten$/.test(x.t)), 'beim Bezug keine Getränke');
set('sensor.bar_operation_state', 'ready'); set('select.bar_active_program', 'unknown'); set('sensor.bar_program_progress', 'unknown');
HASS = null;

// ── 15. Popup-Kopf und Hinweise (mit Stub-Bausteinen) ──────────────────────
const UIlog = [];
window._casoraUI = {
  line: (main, rest) => JSON.stringify({ main, rest: (rest || []).map((r) => (typeof r === 'object' ? r.text : r)) }),
  group: (rows, label) => { UIlog.push({ label, rows }); return '<g>' + label + ':' + rows.map((r) => r.label).join('|') + '</g>'; },
  label: (t) => '<l>' + t + '</l>', note: (t) => '<n>' + t + '</n>', segments: (items, label) => '<s>' + label + '</s>',
};
c = K.find(hass(), 'sensor.bar_operation_state');
set('sensor.bar_water_tank_empty', 'present'); set('sensor.bar_drip_tray_full', 'present'); set('sensor.bar_device_should_be_descaled', 'present');
let hero = JSON.parse(K.sec('hero', c, states, hass()));
assert.equal(hero.main, 'Wasser nachfüllen', 'Warnung zuerst, nicht „Bereit · …“');
assert.deepEqual(hero.rest, ['+2'], 'höchstens eine Warnung, Rest als +N');
UIlog.length = 0;
K.sec('info', c, states, hass());
const hin = UIlog.find((g) => /^Hinweise/.test(g.label)), pfl = UIlog.find((g) => g.label === 'Pflege');
assert.ok(hin && !hin.rows.some((r) => /Entkalken/.test(r.label)), 'Entkalken nicht unter Hinweise (steht unter Pflege)');
assert.ok(hin.rows.every((r) => !r.entity), 'Hinweis-Zeilen führen nicht auf Rohdaten');
assert.ok(pfl && pfl.rows.some((r) => r.label === 'Entkalken' && r.value === 'Fällig'));
set('sensor.bar_water_tank_empty', 'off'); set('sensor.bar_drip_tray_full', 'off'); set('sensor.bar_device_should_be_descaled', 'off');
hero = JSON.parse(K.sec('hero', c, states, hass()));
assert.deepEqual(hero, { main: 'Bereit', rest: [] }, 'Vorwarnung nicht im Kopf');
set('sensor.bar_operation_state', 'run'); set('select.bar_active_program', PROGS[3]); set('sensor.bar_program_progress', '40');
set('sensor.bar_program_finish_time', new Date(Date.now() + 12500).toISOString());
hero = JSON.parse(K.sec('hero', c, states, hass()));
assert.equal(hero.main, 'Cappuccino'); assert.match(hero.rest[0], /^noch 1[23] s$/, 'Kopf ohne „Läuft“ und Prozent');
const run = K.sec('drinks', c, states, hass());
assert.match(run, /stroke-dasharray/, 'Ring bei den Getränken (nicht im Kopf-Feld, das der Rahmen ausblendet)');
assert.match(run, /coffee-stop:/, 'Abbrechen einstufig direkt unter dem Ring');
assert.ok(!/Gerade/.test(run), 'keine „Gerade“-Zeile');
set('sensor.bar_operation_state', 'ready'); set('select.bar_active_program', 'unknown'); set('sensor.bar_program_progress', 'unknown');
const grid = K.sec('drinks', c, states, hass());
assert.match(grid, /grid-auto-rows:1fr/);
assert.ok(grid.indexOf('Cappuccino starten') < grid.indexOf('<s>Stärke'), 'Start direkt unter dem Raster, Optionen darunter');
delete window._casoraUI;

// Programm-Namen
assert.equal(K.drink('consumer_products_coffee_maker_program_coffee_world_americano').label, 'Americano');
assert.equal(K.drink('consumer_products_coffee_maker_program_cleaning_modes_descaling').care, true);
assert.equal(K.drink('no_program'), null);
assert.equal(K.drink('Ein ganz neues Getränk').label, 'Ein ganz neues Getränk', 'Unbekanntes lesbar');
assert.equal(K.drink('Café au Lait').label, 'Milchkaffee', 'Akzente egal');

console.log('PASS kaffee');
