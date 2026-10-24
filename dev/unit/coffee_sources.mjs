// Coffee machine source table (25-coffee.js K.SOURCES): for every row an entity set as the integration creates it
// (translation_key, entity_id, states and options read from the integrations' source, 10/2026; devices and names
// made up) → family, status word, what the machine needs, the drinks and how one starts. The flags of the row
// (start/stop/opts/warns/counters/progress) must match what the roles find: the popup shows rows and controls only
// where the source has them. Also: the Studio's coffee platforms agree with the table.
//   node dev/unit/coffee_sources.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(read('scripts/local/25-coffee.js'))();
const K = window._casoraCoffee;

// One machine per row: [entity_id, state, translation_key, attributes]; platform and device from the row.
const HCP = 'consumer_products_coffee_maker_program_';
const WSP = 'consumerproducts_coffeemaker_program_beverage_';
const EV = { device_class: 'enum', options: ['confirmed', 'off', 'present'] };
const ALT = 'siemens_ti9_68a40e000000';
const MAC = 'f1a2b3c4d5e6';
const MACHINES = {
  hc: { platform: 'home_connect', name: 'Testbar', entities: [
    ['switch.testbar_power', 'on', 'power'],
    ['sensor.testbar_operation_state', 'run', 'operation_state', { device_class: 'enum' }],
    ['select.testbar_active_program', HCP + 'beverage_cappuccino', 'active_program', { options: [HCP + 'beverage_espresso', HCP + 'beverage_cappuccino', HCP + 'cleaning_modes_descale'] }],
    ['select.testbar_selected_program', HCP + 'beverage_cappuccino', 'selected_program', { options: [HCP + 'beverage_espresso', HCP + 'beverage_cappuccino', HCP + 'cleaning_modes_descale'] }],
    ['sensor.testbar_program_progress', '40', 'program_progress', { unit_of_measurement: '%' }],
    ['sensor.testbar_program_finish_time', '2026-10-24T08:00:30+00:00', 'program_finish_time', { device_class: 'timestamp' }],
    ['button.testbar_stop_program', 'unknown', 'stop_program'],
    ['binary_sensor.testbar_remote_start', 'on', 'remote_start'],
    ['select.testbar_bean_amount', 'consumer_products_coffee_maker_enum_type_bean_amount_normal', 'bean_amount',
      { options: ['mild', 'normal', 'strong'].map((x) => 'consumer_products_coffee_maker_enum_type_bean_amount_' + x) }],
    ['sensor.testbar_water_tank_empty', 'present', 'water_tank_empty', EV],
    ['sensor.testbar_calc_n_clean_in10cups', 'present', 'calc_n_clean_in10cups', EV],
    ['sensor.testbar_coffee_counter', '120', 'coffee_counter'],
    ['sensor.testbar_powder_coffee_counter', '3', 'powder_coffee_counter'],
  ], status: 'Cappuccino', needs: ['Wasser nachfüllen'], drinks: ['Espresso', 'Cappuccino'],
  ready: { 'sensor.testbar_operation_state': 'ready', 'sensor.testbar_water_tank_empty': 'off' },
  calls: ['home_connect.set_program_and_options'] },
  hcws: { platform: 'homeconnect_ws', name: 'Kaffeeinsel', entities: [
    ['switch.kaffeeinsel_power', 'on', 'switch_power_state'],
    ['sensor.kaffeeinsel_operation_state', 'run', 'sensor_operation_state'],
    // The running program is in sensor_active_program; the select only holds the selection.
    ['select.kaffeeinsel_program', WSP + 'espresso', 'select_program', { options: [WSP + 'espresso', WSP + 'latte_macchiato'] }],
    ['sensor.kaffeeinsel_active_program', WSP + 'latte_macchiato', 'sensor_active_program'],
    ['button.kaffeeinsel_start', 'unknown', 'button_start_program'],
    ['button.kaffeeinsel_abort', 'unknown', 'button_abort_program'],
    ['sensor.kaffeeinsel_progress', '55', 'sensor_program_progress', { unit_of_measurement: '%' }],
    ['sensor.kaffeeinsel_phase', 'milkfroth', 'sensor_coffeemaker_process_phase'],
    ['binary_sensor.kaffeeinsel_remote', 'on', 'binary_remote_start_allowed'],
    ['select.kaffeeinsel_bean_amount', 'normal', 'select_bean_amount', { options: ['mild', 'normal', 'strong'] }],
    ['sensor.kaffeeinsel_drip_tray', 'full', 'sensor_drip_tray'],
    ['sensor.kaffeeinsel_countdown_calc_n_clean', '20', 'sensor_countdown_calc_n_clean'],
    ['sensor.kaffeeinsel_count_coffee', '80', 'sensor_count_coffee'],
  ], status: 'Latte Macchiato', needs: ['Schale leeren'], drinks: ['Espresso', 'Latte Macchiato'],
  ready: { 'sensor.kaffeeinsel_operation_state': 'ready', 'sensor.kaffeeinsel_drip_tray': 'ok' },
  calls: ['select.select_option', 'button.press'] },
  hcalt: { platform: 'home_connect_alt', name: 'Alt', entities: [
    [`sensor.${ALT}_bsh_common_status_operationstate`, 'BSH.Common.EnumType.OperationState.Run', 'statuses'],
    [`switch.${ALT}_bsh_common_setting_powerstate`, 'on', null],
    [`select.${ALT}_programs`, 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso', 'programs',
      { options: ['ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso', 'ConsumerProducts.CoffeeMaker.Program.Beverage.Coffee'] }],
    [`select.${ALT}_consumerproducts_coffeemaker_option_beanamount`, 'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal', 'options',
      { options: ['ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild', 'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal'] }],
    [`sensor.${ALT}_bsh_common_option_programprogress`, '30', 'options', { unit_of_measurement: '%' }],
    [`button.${ALT}_start_pause`, 'unknown', 'pause_program'],
    [`button.${ALT}_stop`, 'unknown', 'stop_program'],
    [`binary_sensor.${ALT}_bsh_common_status_remotecontrolstartallowed`, 'on', null],
    [`sensor.${ALT}_consumerproducts_coffeemaker_status_beveragecountercoffee`, '321', 'statuses'],
  ], status: 'Espresso', needs: [], drinks: ['Espresso', 'Kaffee'],
  ready: { [`sensor.${ALT}_bsh_common_status_operationstate`]: 'BSH.Common.EnumType.OperationState.Ready' },
  calls: ['select.select_option', 'button.press'] },
  miele: { platform: 'miele', name: 'CM', entities: [
    ['switch.cm_power', 'on', 'power'],
    ['sensor.cm_status', 'in_use', 'status', { device_class: 'enum' }],
    ['sensor.cm_program', 'long_coffee', 'program_id', { device_class: 'enum', options: ['no_program', 'espresso', 'long_coffee', 'cappuccino_italiano', 'appliance_rinse'] }],
    ['sensor.cm_phase', 'second_grinding', 'program_phase', { device_class: 'enum' }],
    ['sensor.cm_descaling_counter', '4', 'descaling_counter'],
  ], status: 'Lungo', phase: 'Mahlt', needs: [], drinks: [], ready: { 'sensor.cm_status': 'on', 'sensor.cm_program': 'no_program' }, calls: null },
  dlbt: { platform: 'delonghi_primadonna', name: 'Prima', entities: [
    ['switch.prima_power', 'on', 'power'],
    ['sensor.prima_device_status', 'brewing', 'device_status', {}, 'diagnostic'],
    ['select.prima_make_beverage', 'none', 'make_beverage', { options: ['none', 'Espresso Coffee', 'Cappuccino'] }],
    ['binary_sensor.prima_dispensing', 'on', 'dispensing', { percentage: 60 }],
    ['binary_sensor.prima_descaling', 'on', 'descaling'],
    ['sensor.prima_total_coffee', '40', 'total_coffee'],
  ], status: 'Läuft', needs: ['Entkalken fällig'], drinks: ['Espresso', 'Cappuccino'],
  ready: { 'sensor.prima_device_status': 'ready', 'binary_sensor.prima_dispensing': 'off', 'binary_sensor.prima_descaling': 'off' },
  calls: ['select.select_option'] },
  dlwifi: { platform: 'delonghi_coffee', name: 'Wolke', entities: [
    ['switch.wolke_power', 'on', 'power'],
    ['sensor.wolke_machine_status', 'Brewing', 'machine_status'],
    ['button.wolke_brew_espresso', 'unknown', 'brew_espresso'],
    ['button.wolke_brew_cappuccino', 'unknown', 'brew_cappuccino'],
    ['button.wolke_cancel_brew', 'unknown', 'cancel_brew'],
    ['binary_sensor.wolke_alarm_5', 'on', 'alarm_5'],
    ['sensor.wolke_total_beverages', '500', 'total_beverages'],
  ], status: 'Läuft', needs: ['Bohnen nachfüllen'], drinks: ['Cappuccino', 'Espresso'],
  ready: { 'sensor.wolke_machine_status': 'Ready', 'binary_sensor.wolke_alarm_5': 'off' }, calls: ['button.press'] },
  dllink: { platform: 'delonghi_coffeelink', name: 'Link', entities: [
    ['sensor.link_machine_status', 'waking_up', 'machine_status', { device_class: 'enum' }],
    ['button.link_start_espresso', 'unknown', 'start_espresso'],
    ['button.link_start_cappuccino', 'unknown', 'start_cappuccino'],
    ['button.link_stop', 'unknown', 'stop'],
    ['binary_sensor.link_waste_container_full', 'on', 'waste_container_full'],
    ['sensor.link_total_beverages', '700', 'total_beverages'],
    ['sensor.link_total_coffee', '300', 'total_coffee'],
    ['sensor.link_total_cappuccino', '200', 'total_cappuccino'],
    ['sensor.link_total_descales', '3', 'total_descales'],
  ], status: 'Heizt auf', needs: ['Satzbehälter leeren'], drinks: ['Cappuccino', 'Espresso'],
  counters: ['Kaffee', 'Cappuccino'], total: 700,
  ready: { 'sensor.link_machine_status': 'ready', 'binary_sensor.link_waste_container_full': 'off' }, calls: ['button.press'] },
  jura: { platform: 'jura', name: 'Jura', entities: [
    [`select.${MAC}_product`, 'Cappuccino', null, { options: ['Espresso', 'Cappuccino'] }],
    [`button.${MAC}_make`, 'unknown', null],
    [`binary_sensor.${MAC}_alert_fill_water`, 'on', null],
    [`sensor.${MAC}_total_product`, '900', null],
    [`sensor.${MAC}_product_espresso`, '400', null],
  ], status: 'Bereit', needs: ['Wasser nachfüllen'], drinks: ['Espresso', 'Cappuccino'],
  ready: { [`binary_sensor.${MAC}_alert_fill_water`]: 'off' }, calls: ['select.select_option', 'button.press'] },
  jurawifi: { platform: 'jura_wifi', name: 'Jura E8', entities: [
    ['sensor.jura_e8_status', 'brewing', 'status', { device_class: 'enum' }],
    ['button.jura_e8_brew_espresso', 'unknown', 'brew', { friendly_name: 'Jura E8 Brew Espresso' }],
    ['button.jura_e8_espresso_zubereiten_2', 'unknown', 'brew', { friendly_name: 'Jura E8 Cappuccino zubereiten' }],
    ['button.jura_e8_cancel', 'unknown', 'cancel'],
    ['button.jura_e8_start_descale', 'unknown', 'start_descale', {}, 'config'],
    ['button.jura_e8_start_filter_change', 'unknown', 'start_filter_change', {}, 'config'],
    ['binary_sensor.jura_e8_beans_empty', 'on', 'beans_empty', { device_class: 'problem' }],
    ['binary_sensor.jura_e8_connectivity', 'on', 'connectivity', { device_class: 'connectivity' }],
    ['sensor.jura_e8_total_brews', '1500', 'total_brews'],
    ['sensor.jura_e8_espresso_count', '600', 'product_brews', { friendly_name: 'Jura E8 Espresso count' }],
    ['sensor.jura_e8_anzahl_cappuccino', '300', 'product_brews', { friendly_name: 'Jura E8 Anzahl Cappuccino' }],
  ], status: 'Läuft', needs: ['Bohnen nachfüllen'], drinks: ['Espresso', 'Cappuccino'], counters: ['Espresso', 'Cappuccino'], total: 1500,
  ready: { 'sensor.jura_e8_status': 'ready', 'binary_sensor.jura_e8_beans_empty': 'off' }, calls: ['button.press'] },
  melitta: { platform: 'melitta_barista', name: 'Barista', entities: [
    ['sensor.barista_state', 'Brewing', null],
    ['sensor.barista_activity', 'Extracting', null],
    ['sensor.barista_progress', '55', null, { unit_of_measurement: '%' }],
    ['sensor.barista_action_required', 'Fill Water', null],
    ['select.barista_recipe', 'Espresso', null, { options: ['Espresso', 'Café Crème'] }],
    ['button.barista_brew', 'unknown', null],
    ['button.barista_cancel', 'unknown', null],
    ['sensor.barista_total_cups', '77', null, { unit_of_measurement: 'cups' }],
  ], status: 'Espresso', needs: ['Wasser nachfüllen'], drinks: ['Espresso', 'Caffè Crema'],
  ready: { 'sensor.barista_state': 'Ready', 'sensor.barista_action_required': 'None' }, calls: ['select.select_option', 'button.press'] },
  lamarzocco: { platform: 'lamarzocco', name: 'Linea', entities: [
    ['switch.linea', 'on', 'main'],
    ['binary_sensor.linea_brewing_active', 'on', 'brew_active', { device_class: 'running' }],
    ['binary_sensor.linea_water_tank_empty', 'on', 'water_tank', { device_class: 'problem' }],
    ['button.linea_start_backflush', 'unknown', 'start_backflush'],
    ['sensor.linea_total_coffees_made', '2500', 'total_coffees_made'],
  ], status: 'Läuft', needs: ['Wasser nachfüllen'], drinks: [],
  ready: { 'binary_sensor.linea_brewing_active': 'off', 'binary_sensor.linea_water_tank_empty': 'off' }, calls: null },
  philips: { platform: 'philips_homeid', name: 'EP', entities: [
    ['switch.ep_power', 'on', 'power'],
    ['sensor.ep_machine_state', 'brewing', 'espresso_mainstate', { device_class: 'enum' }],
    ['sensor.ep_brewing_progress', '70', 'espresso_brewing_progress', { unit_of_measurement: '%' }],
    ['binary_sensor.ep_water_tank_empty', 'on', 'water_tank_empty', { device_class: 'problem' }],
    ['button.ep_brew_espresso', 'unknown', 'espresso_brew_espresso'],
    ['button.ep_brew_coffee', 'unknown', 'espresso_brew_coffee'],
  ], status: 'Läuft', needs: ['Wasser nachfüllen'], drinks: ['Kaffee', 'Espresso'],
  ready: { 'sensor.ep_machine_state': 'ready', 'binary_sensor.ep_water_tank_empty': 'off' }, calls: ['button.press'] },
  strom: { platform: 'casora_mock', name: 'Strombohne', entities: [
    ['sensor.strombohne_status', 'running', 'status', { options: ['off', 'ready', 'running'], power_w: 1400 }],
    ['switch.strombohne_power', 'on', 'power'],
    ['sensor.strombohne_learning', '4', 'learning'],
    ['sensor.strombohne_last_program', 'Espresso', 'last_program'],
    ['sensor.strombohne_drinks_total', '86', 'drinks_total'],
    ['sensor.strombohne_tank', '0', 'tank', { due: true }],
  ], status: 'Läuft', needs: ['Wasser nachfüllen'], drinks: [], ready: { 'sensor.strombohne_status': 'ready', 'sensor.strombohne_tank': ['900', { due: false }] }, calls: null },
  plug: { platform: 'shelly', name: 'Espressobar', entities: [
    ['switch.espressobar_steckdose', 'on', null],
    ['sensor.espressobar_leistung', '1300', null, { device_class: 'power', unit_of_measurement: 'W' }],
  ], status: 'Läuft', needs: [], drinks: [], ready: { 'sensor.espressobar_leistung': '4' }, calls: null },
};

assert.deepEqual(K.SOURCES.map((x) => x.fam).sort(), Object.keys(MACHINES).sort(), 'one test machine per source row');
const fails = [];
for (const src of K.SOURCES) {
  const m = MACHINES[src.fam];
  const entities = {}, states = {}, dev = 'dev_' + src.fam;
  m.entities.forEach(([id, state, key, attrs, cat]) => {
    entities[id] = { entity_id: id, platform: m.platform, device_id: dev, translation_key: key, entity_category: cat || null };
    states[id] = { entity_id: id, state, attributes: { friendly_name: m.name + ' ' + id.split('.')[1], ...(attrs || {}) }, last_changed: new Date().toISOString() };
  });
  const hass = { states, entities, devices: { [dev]: { id: dev, name: m.name } }, areas: {}, services: { home_connect: { set_program_and_options: {} } } };
  const anchor = m.entities[0][0];
  const c = K.find(hass, anchor);
  const f = (cond, what) => { if (!cond) fails.push(`${src.fam}: ${what}`); };
  f(c.fam === src.fam, `family ${c.fam}`);
  f(K.is(hass, anchor), 'recognized as a coffee machine');
  // Flags of the row = what the roles find.
  const drinks = K.drinks(c, states).filter((x) => !x.care);
  f(!!src.start === drinks.length > 0, `start ${src.start} but ${drinks.length} drinks`);
  f(src.stop === !!c.stop, `stop ${src.stop} but ${c.stop}`);
  f(src.opts === !!(c.opts.strength || c.opts.temp || c.opts.amount), `opts ${src.opts}`);
  f(src.warns === c.warns.length > 0, `warns ${src.warns} but ${c.warns.length}`);
  f(src.counters === (c.counters.length > 0 || !!c.total), `counters ${src.counters}`);
  f(src.progress === !!(c.progress || (src.fam === 'dlbt' && c.dispensing)), `progress ${src.progress}`);
  // Status, needs, drinks while brewing.
  const s = K.status(c, states);
  f(s.label === m.status, `status "${s.label}", expected "${m.status}"`);
  if (m.phase) f(s.phase === m.phase, `phase "${s.phase}"`);
  f(JSON.stringify(s.warns.map((w) => w.label)) === JSON.stringify(m.needs), `needs ${JSON.stringify(s.warns.map((w) => w.label))}`);
  f(JSON.stringify(drinks.map((x) => x.label)) === JSON.stringify(m.drinks), `drinks ${JSON.stringify(drinks.map((x) => x.label))}`);
  if (m.counters) f(JSON.stringify(s.perDrink.map((x) => x.label)) === JSON.stringify(m.counters), `counters ${JSON.stringify(s.perDrink.map((x) => x.label))}`);
  if (m.total != null) f(s.total === m.total, `total ${s.total}`);
  // Ready, no warning: start the first drink the way the source does it.
  Object.entries(m.ready).forEach(([id, v]) => {
    states[id] = Array.isArray(v) ? { ...states[id], state: v[0], attributes: { ...states[id].attributes, ...v[1] } } : { ...states[id], state: v };
  });
  const s2 = K.status(c, states);
  f(/^(bereit|fertig)$/.test(s2.st) && !s2.warns.length, `ready: ${s2.st} / ${s2.label} ${JSON.stringify(s2.warns.map((w) => w.label))}`);
  if (m.calls) {
    const calls = [];
    const h = { ...hass, callService: (d, sv) => { calls.push(d + '.' + sv); return Promise.resolve(); } };
    // A drink other than the one already selected (else there is nothing to select).
    const pick = drinks.find((x) => !c.sel || !states[c.sel] || states[c.sel].state !== x.raw) || drinks[0];
    const r = await K.start(h, c, pick.raw);
    f(r === true, `start → ${JSON.stringify(r)}`);
    f(JSON.stringify(calls) === JSON.stringify(m.calls), `start calls ${JSON.stringify(calls)}`);
  }
}
assert.deepEqual(fails, [], 'coffee sources:\n  ' + fails.join('\n  '));

// The Studio recognizes the same integrations (casora-panel-b-ux.js COFFEE_PLATFORMS): every platform of the table
// except those that build other appliances too (there the coffee keys decide).
const ux = read('panel/casora-panel-b-ux.js');
const studio = JSON.parse('[' + /const COFFEE_PLATFORMS = new Set\(\[([^\]]*)\]\)/.exec(ux)[1] + ']').sort();
const shared = ['home_connect', 'homeconnect_ws', 'home_connect_alt', 'miele', 'philips_homeid'];
assert.deepEqual(studio, K.SOURCES.flatMap((x) => x.platforms).filter((p) => !shared.includes(p)).sort(), 'Studio coffee platforms = source table');

// A plug alone is a coffee machine only by its device name; grinders are not.
const plugHass = (name) => ({ states: { 'switch.p': { state: 'on', attributes: {} } }, entities: { 'switch.p': { entity_id: 'switch.p', device_id: 'p', platform: 'shelly' } },
  devices: { p: { name } } });
assert.equal(K.is(plugHass('Siebträger'), 'switch.p'), true, 'plug of a named espresso machine');
assert.equal(K.is(plugHass('Kaffeemühle'), 'switch.p'), false, 'grinder');
assert.equal(K.is(plugHass('Stehlampe'), 'switch.p'), false, 'lamp');
assert.equal(K.status(K.find(plugHass('Siebträger'), 'switch.p'), plugHass('Siebträger').states).label, 'An', 'plug without power sensor: On, not Ready');
console.log(`coffee_sources: ok (${K.SOURCES.map((x) => x.fam).join(', ')})`);
