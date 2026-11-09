// Heat pump tile and popup (#132, scripts/local/44-waermepumpe.js, casoraHeatPumpFind in 00-finder.js): the Studio's
// fields found on the climate's device by translation_key or the entity's own words (never the entity id), the tile
// text (program, hot water, compressor), the circle and highlight, the climate with current_temperature null, the
// popup parts (presets as moons with climate.set_preset_mode, water_heater.set_temperature, button.press) and the
// wiring (module, templates, Studio type, English texts). Made-up entities only.
//   node dev/unit/waermepumpe.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const win = { innerWidth: 1440 };
const box = { window: win, document: { querySelector: () => null }, setTimeout, console, localStorage: { getItem: () => null } };
vm.createContext(box);
for (const f of ['00-finder.js', '44-waermepumpe.js']) vm.runInContext(read('custom_components/casora/scripts/local/' + f), box);
const H = win._casoraHeatPump, F = win.casoraHeatPumpFind;
const eq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

const DEV = 'dev1';
const E = (id, state, attrs, reg) => [id, { entity_id: id, state, attributes: attrs || {}, ...(reg ? { __reg: reg } : {}) }];
const entries = [
  E('climate.demo_waermepumpe', 'auto', { friendly_name: 'Demo Pumpe Heizung', hvac_modes: ['off', 'auto'], min_temp: 3, max_temp: 60,
    target_temp_step: 1, preset_modes: ['comfort', 'eco', 'home', 'sleep'], preset_mode: 'home', current_temperature: null, temperature: 19,
    temperature_unit: '°C', hvac_action: 'idle' }, { translation_key: 'heating' }),
  E('water_heater.demo_warmwasser', 'on', { friendly_name: 'Demo Pumpe Warmwasser', min_temp: 10, max_temp: 60, current_temperature: 42.9,
    temperature: 50, temperature_unit: '°C' }, { translation_key: 'domestic_hot_water' }),
  E('button.demo_laden_an', 'unknown', { friendly_name: 'Demo Pumpe Einmalige Ladung aktivieren' }, { translation_key: 'activate_onetimecharge' }),
  E('button.demo_laden_aus', 'unknown', { friendly_name: 'Demo Pumpe Einmalige Ladung deaktivieren' }, { translation_key: 'deactivate_onetimecharge' }),
  E('binary_sensor.demo_laden', 'off', { friendly_name: 'Demo Pumpe Einmalige Ladung', device_class: 'running' }, { translation_key: 'one_time_charge' }),
  E('binary_sensor.demo_kompressor', 'off', { friendly_name: 'Demo Pumpe Kompressor', device_class: 'running' }, { translation_key: 'compressor' }),
  E('sensor.demo_a', '9.8', { friendly_name: 'Demo Pumpe Außentemperatur', device_class: 'temperature', unit_of_measurement: '°C' }, { translation_key: 'outside_temperature' }),
  E('sensor.demo_b', '25.5', { friendly_name: 'Demo Pumpe Rücklauftemperatur', device_class: 'temperature', unit_of_measurement: '°C' }, { translation_key: 'return_temperature' }),
  E('sensor.demo_c', '25.6', { friendly_name: 'Demo Pumpe Sekundärkreis-Vorlauftemperatur', device_class: 'temperature', unit_of_measurement: '°C' }, { translation_key: 'secondary_circuit_supply_temperature' }),
  E('sensor.demo_d', '3.0', { friendly_name: 'Demo Pumpe Leistungszahl' }, { translation_key: 'cop_total' }),
  E('sensor.demo_e', '2.9', { friendly_name: 'Demo Pumpe Leistungszahl Heizung' }, { translation_key: 'cop_heating' }),
  E('sensor.demo_f', '6.0', { friendly_name: 'Demo Pumpe Verdichterleistung', device_class: 'power', unit_of_measurement: 'kW' }, { translation_key: 'compressor_power' }),
];
const hass = (overrides) => {
  const states = {}; const entities = {};
  for (const [id, st] of entries) {
    const { __reg, ...s } = st;
    states[id] = s;
    entities[id] = { entity_id: id, device_id: DEV, translation_key: (__reg || {}).translation_key || null, platform: 'demo' };
  }
  Object.assign(states, overrides || {});
  return { states, entities, devices: { [DEV]: { id: DEV, name: 'Demo Pumpe' } }, config: { unit_system: { temperature: '°C' } } };
};
const ID = 'climate.demo_waermepumpe';

// ── Finder: keys, then the entity's own words; never the id, and never „deactivate“ for the charge button ─────────
const h0 = hass();
win.casoraDeviceEntities = undefined;
eq(F.find(h0, ID), { water: 'water_heater.demo_warmwasser', charge: 'button.demo_laden_an', charging: 'binary_sensor.demo_laden',
  outdoor: 'sensor.demo_a', supply: 'sensor.demo_c', return: 'sensor.demo_b', cop: 'sensor.demo_d', power: 'sensor.demo_f', compressor: 'binary_sensor.demo_kompressor' });
assert.equal(F.field(h0, ID, 'nope'), null);
assert.equal(F.isPump(h0, ID), true, 'water heater and compressor on the same device');

// Other brand: no translation keys, only names, German/English.
const named = hass();
Object.keys(named.entities).forEach((k) => { named.entities[k].translation_key = null; });
named.states['sensor.demo_a'].attributes.friendly_name = 'Demo Pumpe Outdoor temperature';
named.states['sensor.demo_c'].attributes.friendly_name = 'Demo Pumpe Flow temperature';
named.states['sensor.demo_b'].attributes.friendly_name = 'Demo Pumpe Return temperature';
const nf = F.find(named, ID);
assert.equal(nf.outdoor, 'sensor.demo_a'); assert.equal(nf.supply, 'sensor.demo_c'); assert.equal(nf.return, 'sensor.demo_b');
assert.equal(nf.compressor, 'binary_sensor.demo_kompressor', 'German word Kompressor');
assert.equal(nf.cop, 'sensor.demo_d', 'the plain COP before „Heizung“');
// Only the entity's own words count, not the device name nor the entity id.
const dv = hass();
dv.devices[DEV].name = 'Kompressor Außen';
dv.states['sensor.demo_b'].attributes.friendly_name = 'Kompressor Außen Rücklauftemperatur';
Object.keys(dv.entities).forEach((k) => { dv.entities[k].translation_key = null; });
assert.notEqual(F.field(dv, ID, 'outdoor'), 'sensor.demo_b', 'the device name is no reading of its own');

// ── Tile ────────────────────────────────────────────────────────────────────────────────────────────────────
const h1 = hass();
let t = H.tileText(h1.states[ID], h1, {});
eq(t, { full: 'Zuhause · Wasser 42,9° / 50° · Aus', short: 'Zuhause 43/50°' });
assert.equal(H.tileText(h1.states[ID], h1, {}, true).short, 'Zuhause', 'phone: the program alone when both do not fit');
const ecoH = hass({ [ID]: { ...h1.states[ID], attributes: { ...h1.states[ID].attributes, preset_mode: 'eco' } } });
assert.equal(H.tileText(ecoH.states[ID], ecoH, {}, true).short, 'Eco 43/50°', 'phone: both when they fit');
assert.equal(H.tileOn(h1.states[ID], h1, {}), false, 'compressor off: circle plain');
assert.equal(H.active(h1.states[ID], h1, {}), false, 'compressor off: tile not highlighted');
const h2 = hass({ 'binary_sensor.demo_kompressor': { entity_id: 'binary_sensor.demo_kompressor', state: 'on', attributes: { friendly_name: 'x' } } });
assert.match(H.tileText(h2.states[ID], h2, {}).full, /· Läuft$/);
assert.equal(H.tileOn(h2.states[ID], h2, {}), true);
assert.equal(H.active(h2.states[ID], h2, {}), true);
// Compressor set to nothing (another brand): the thermostat's rule, the word falls away, no NaN or undefined.
const none = hass();
delete none.states['binary_sensor.demo_kompressor'];
none.entities['binary_sensor.demo_kompressor'] = undefined;
delete none.entities['binary_sensor.demo_kompressor'];
const tn = H.tileText(none.states[ID], none, {});
assert.ok(!/undefined|NaN|Läuft/.test(JSON.stringify(tn)), JSON.stringify(tn));
assert.equal(H.tileOn(none.states[ID], none, {}), true, 'no compressor known: any mode but off is on');
assert.equal(H.active(none.states[ID], none, {}), null, 'no compressor known: the thermostat decides the highlight');
// Studio field wins over the find; a set entity that vanished is simply gone, not a crash.
const h3 = hass();
const set = H.model(h3, ID, { water_heater_entity: 'water_heater.demo_warmwasser', compressor_entity: 'binary_sensor.gone' });
assert.equal(set.compressor, null);
const offStates = hass({ [ID]: { ...h1.states[ID], state: 'off' } });
assert.match(H.tileText(offStates.states[ID], offStates, {}).full, /^Aus · /, 'heating off first');
const dead = hass({ [ID]: { ...h1.states[ID], state: 'unavailable' } });
assert.equal(H.tileText(dead.states[ID], dead, {}).full, 'Nicht verfügbar');

// ── Model: current_temperature null (ViCare); optional sensor ─────────────────────────────────────────────
let m = H.model(h1, ID, {});
assert.equal(m.current, null, 'null current_temperature is no reading');
assert.equal(m.target, 19);
assert.equal(m.step, 1);
const withSensor = hass({ 'sensor.raum': { entity_id: 'sensor.raum', state: '20.5', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } } });
assert.equal(H.model(withSensor, ID, { temp_sensor: 'sensor.raum' }).current, 20.5);

// ── Popup parts ────────────────────────────────────────────────────────────────────────────────────────────
const captured = [];
win._casoraUI = {
  esc: (x) => String(x), line: (a, b) => a + '|' + (b || []).join(','), group: (rows, label) => JSON.stringify({ label, rows }),
  quick: (items) => JSON.stringify(items),
  stage: (type, o) => { captured.push({ type, o }); return ''; }, soft: () => true,
};
assert.equal(H.sec('hero', { id: ID, vars: {} }, h1.states, h1), 'Bereit|Verdichter aus');
H.sec('stage', { id: ID, vars: {} }, h1.states, h1);
let st = captured.pop().o;
assert.equal(st.value, 19); assert.equal(st.current, null); assert.equal(st.foot, null, 'no „Jetzt“ without a reading');
assert.equal(st.min, 3); assert.equal(st.max, 60); assert.equal(st.step, 1);
assert.equal(st.minus.svc.service, 'set_temperature');
assert.equal(st.minus.svc.data.temperature, 18);
const qk = JSON.parse(st.moons());
eq(qk.map((q) => q.text), ['Komfort', 'Eco', 'Zuhause', 'Schlafen']);
eq(qk.filter((q) => q.active).map((q) => q.text), ['Zuhause']);
eq(qk[0].svc, { domain: 'climate', service: 'set_preset_mode', data: { preset_mode: 'comfort' }, target: { entity_id: ID } });
const off2 = hass({ [ID]: { ...h1.states[ID], state: 'off' } });
H.sec('stage', { id: ID, vars: {} }, off2.states, off2);
st = captured.pop().o;
assert.equal(st.state, 'off'); assert.ok(!st.minus, 'off: no − / +');
const w = JSON.parse(H.sec('water', { id: ID, vars: {} }, h1.states, h1));
assert.equal(w.label, 'Warmwasser');
assert.equal(w.rows[0].value, '42,9 °C');
assert.match(w.rows[1].endHtml, /set_temperature&quot;,&quot;data&quot;:\{&quot;temperature&quot;:51/);
assert.match(w.rows[1].endHtml, /water_heater/);
assert.equal(w.rows[2].label, 'Einmal aufheizen');
eq(w.rows[2].svc.target, { entity_id: 'button.demo_laden_an' });
assert.equal(w.rows[2].svc.domain, 'button');
const v = JSON.parse(H.sec('values', { id: ID, vars: {} }, h1.states, h1));
const lbls = Object.fromEntries(v.rows.map((r) => [r.label, r.value]));
eq(lbls, { 'Außen': '9,8 °C', Vorlauf: '25,6 °C', 'Rücklauf': '25,5 °C', Leistungszahl: '3', Verdichterleistung: '6 kW', Verdichter: 'Aus' });

// ── Wiring ─────────────────────────────────────────────────────────────────────────────────────────────────
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'44-waermepumpe'"));
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
assert.deepEqual(tpl.casora_heat_pump.template, ['casora_thermostat', 'casora_popup_heat_pump']);
assert.equal(tpl.casora_popup_heat_pump.tap_action.casora_popup.variant, 'v3');
assert.equal(tpl.casora_thermostat.template[0], 'casora_entity');
assert.ok(!/heat_pump|_casoraHeatPump/.test(JSON.stringify(tpl.casora_thermostat)), 'a plain thermostat knows nothing of the heat pump');
const built = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
assert.ok(built.casora_heat_pump && built.casora_popup_heat_pump, 'templates built');
const types = read('custom_components/casora/panel/casora-panel-types.js');
assert.match(types, /id: "casora_heat_pump", like: "thermostat"/);
for (const k of ['water_heater_entity', 'charge_button', 'compressor_entity', 'outdoor_entity', 'supply_entity', 'return_entity', 'cop_entity', 'power_entity', 'temp_sensor'])
  assert.ok(types.includes(`key: "${k}"`), 'Studio field ' + k);
assert.ok(!/warmepumpe/.test(read('custom_components/casora/scripts/local/44-waermepumpe.js')), 'no reporter entity names');
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact;
for (const k of ['Wärmepumpe', 'Warmwasser', 'Vorlauf', 'Rücklauf', 'Verdichter läuft', 'Einmal aufheizen', 'Leistungszahl']) assert.ok(en[k], 'en: ' + k);

console.log('ok – waermepumpe');
