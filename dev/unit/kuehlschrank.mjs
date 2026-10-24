// Fridge card (casoraFridgeFind in 00-finder.js, 30-kuehlschrank.js) without HA: finder per source (Liebherr core
// two zones and one zone, Liebherr HACS fork, Home Connect core, homeconnect_ws, home_connect_alt, generic by name,
// none: oven, thermometer, washer), Studio overrides, state, tile text, popup parts; first use in the test house
// (the Studio suggests the made-up fridge as a sure match). Keys as in the integrations' sources (10/2026);
// devices and names invented.
//   node dev/unit/kuehlschrank.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finder.js'))();
new Function(src('30-kuehlschrank.js'))();
const FF = window.casoraFridgeFind, K = window._casoraFridge;
assert.ok(FF && K && K.popup, 'modules loaded');

let entities = {}, states = {}, devices = {};
const reset = () => { entities = {}; states = {}; devices = {}; };
const add = (id, state, { key = null, platform = 'casora_mock', dev = 'd', attrs = {}, cat = null } = {}) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: key, entity_category: cat };
  states[id] = { entity_id: id, state: String(state), attributes: attrs, last_changed: new Date(Date.now() - 5 * 60000).toISOString() };
  if (dev && !devices[dev]) devices[dev] = { id: dev, name: 'Gerät ' + dev };
};
const hass = () => ({ states, entities, devices, areas: {} });
const T = { device_class: 'temperature', unit_of_measurement: '°C' };

// ── 1. Liebherr (HA core), two zones – like a CNsdc combi ───────────────────
const lh = { platform: 'liebherr', dev: 'lh' };
add('sensor.combi_obere_zone', 7, { ...lh, key: 'top_zone', attrs: T });
add('sensor.combi_untere_zone', -18, { ...lh, key: 'bottom_zone', attrs: T });
add('number.combi_sollwert_obere_zone', 5, { ...lh, key: 'setpoint_temperature_top_zone', attrs: { ...T, min: 3, max: 9, step: 1 } });
add('number.combi_sollwert_untere_zone', -18, { ...lh, key: 'setpoint_temperature_bottom_zone', attrs: { ...T, min: -26, max: -16, step: 1 } });
add('switch.combi_nachtmodus', 'off', { ...lh, key: 'night_mode' });
add('switch.combi_obere_zone_supercool', 'off', { ...lh, key: 'super_cool_top_zone' });
add('switch.combi_untere_zone_superfrost', 'off', { ...lh, key: 'super_frost_bottom_zone' });
add('switch.combi_partymodus', 'off', { ...lh, key: 'party_mode' });
add('select.combi_obere_zone_biofresh_plus', 'zero_zero', { ...lh, key: 'bio_fresh_plus_top_zone' });
let c = FF.find(hass(), 'sensor.combi_obere_zone');
assert.equal(c.source, 'liebherr'); assert.equal(c.how, 'platform');
assert.deepEqual(c.zones.map((z) => [z.key, z.label, z.temp, z.set, z.sup, z.supLabel]), [
  ['top', 'Obere Zone', 'sensor.combi_obere_zone', 'number.combi_sollwert_obere_zone', 'switch.combi_obere_zone_supercool', 'SuperCool'],
  ['bottom', 'Untere Zone', 'sensor.combi_untere_zone', 'number.combi_sollwert_untere_zone', 'switch.combi_untere_zone_superfrost', 'SuperFrost']]);
assert.deepEqual(c.modes.map((m) => [m.key, m.id, m.label]), [['night', 'switch.combi_nachtmodus', 'Nachtmodus'], ['party', 'switch.combi_partymodus', 'Partymodus']]);
assert.deepEqual(c.extras, ['select.combi_obere_zone_biofresh_plus']);
assert.equal(FF.is(hass(), 'switch.combi_nachtmodus'), true, 'any entity of the device anchors it');
assert.equal(FF.field(hass(), 'switch.combi_nachtmodus', 'z2set'), 'number.combi_sollwert_untere_zone');
assert.equal(FF.field(hass(), 'switch.combi_nachtmodus', 'superfrost'), 'switch.combi_untere_zone_superfrost');
assert.equal(FF.field(hass(), 'switch.combi_nachtmodus', 'door'), null);
assert.deepEqual(FF.all(hass()).map((x) => [x.device, x.anchor, x.source]), [['lh', 'sensor.combi_obere_zone', 'liebherr']]);

// State and tile
let C = K.find(hass(), 'sensor.combi_obere_zone', {});
let s = K.status(C, states);
assert.equal(K.tileText(s), '7 °C · −18 °C'); assert.equal(K.tileText(s, true), '7° · −18°');
assert.equal(K.active(s), false, 'calm when nothing is special');
states['switch.combi_untere_zone_superfrost'].state = 'on';
s = K.status(K.find(hass(), 'sensor.combi_obere_zone', {}), states);
assert.equal(K.tileText(s), 'SuperFrost · 7 °C · −18 °C'); assert.equal(K.active(s), true);
assert.equal(K.color(s), K.COLOR.calm, 'a mode is no warning');
states['switch.combi_untere_zone_superfrost'].state = 'off';
states['sensor.combi_obere_zone'].state = '6.5';
assert.ok(/^6[.,]5 °C · −18 °C$/.test(K.tileText(K.status(C, states))), 'one decimal when the value has one');
states['sensor.combi_obere_zone'].state = '7';
['sensor.combi_obere_zone', 'sensor.combi_untere_zone', 'number.combi_sollwert_obere_zone', 'number.combi_sollwert_untere_zone']
  .forEach((id) => { states[id].state = 'unavailable'; });
assert.equal(K.tileText(K.status(C, states)), 'Nicht verfügbar');
states['sensor.combi_obere_zone'].state = '7'; states['sensor.combi_untere_zone'].state = '-18';
states['number.combi_sollwert_obere_zone'].state = '5'; states['number.combi_sollwert_untere_zone'].state = '-18';

// Setpoint pills
assert.deepEqual(K.steps(5, 3, 9, 1), [3, 4, 5, 6, 7]);
assert.deepEqual(K.steps(9, 3, 9, 1), [5, 6, 7, 8, 9]);
assert.deepEqual(K.steps(-18, -26, -16, 1), [-20, -19, -18, -17, -16]);

// Popup parts with a UI stub
window._casoraUI = {
  line: (m, r, o) => '<line ' + ((o && o.tone) || '') + '>' + m + '|' + (r || []).filter(Boolean).join('|') + '</line>',
  group: (rows, l) => '<group ' + l + '>' + rows.map((r) => r.label + '=' + (r.value || '') + (r.sub ? '(' + r.sub + ')' : '') + (r.svc ? '>' + r.svc.service : '')).join(';') + '</group>',
  segments: (items, l) => '<seg ' + l + '>' + items.map((i) => (i.active ? '*' : '') + i.label + '>' + JSON.stringify(i.svc.data)).join(';') + '</seg>',
  note: (t) => '<note>' + t + '</note>',
};
assert.equal(K.sec('hero', C, states, hass()), '<line >7 °C · −18 °C|Alles in Ordnung</line>');
const zones = K.sec('zones', C, states, hass());
assert.ok(zones.includes('<group Temperaturen>Obere Zone=7 °C(Sollwert 5 °C);Untere Zone=−18 °C(Sollwert −18 °C)</group>'), zones);
assert.ok(zones.includes('<seg Obere Zone · Sollwert 5 °C>3°>{"value":3};4°>{"value":4};*5°>{"value":5};6°>{"value":6};7°>{"value":7}</seg>'), zones);
assert.ok(zones.includes('<seg Untere Zone · Sollwert −18 °C>−20°'), zones);
assert.equal(K.sec('modes', C, states, hass()),
  '<group Modi>SuperCool=Aus(Obere Zone)>turn_on;SuperFrost=Aus(Untere Zone)>turn_on;Nachtmodus=Aus>turn_on;Partymodus=Aus>turn_on</group>');
assert.equal(K.sec('doors', C, states, hass()), '');
assert.ok(/Weitere Einstellungen/.test(K.sec('more', C, states, hass())));

// Studio overrides: a door chosen by hand
add('binary_sensor.kueche_kuehlschrank_tuer', 'on', { dev: 'kontakt', attrs: { device_class: 'door' } });
C = K.find(hass(), 'sensor.combi_obere_zone', { entity_door: 'binary_sensor.kueche_kuehlschrank_tuer' });
s = K.status(C, states);
assert.equal(K.tileText(s), 'Tür offen · 7 °C · −18 °C'); assert.equal(K.color(s), K.COLOR.warn);
assert.ok(/^<line warn>Tür offen\|Obere Zone\|seit 5 Min\.\|7 °C · −18 °C<\/line>$/.test(K.sec('hero', C, states, hass())), K.sec('hero', C, states, hass()));
assert.ok(K.sec('doors', C, states, hass()).includes('Obere Zone=Geöffnet(seit 5 Min.)'));

// ── 2. Liebherr, one zone: the sensor has no key ─────────────────────────────
reset();
const l1 = { platform: 'liebherr', dev: 'l1' };
add('sensor.weinschrank', 12, { ...l1, attrs: T });
add('number.weinschrank_sollwert', 12, { ...l1, key: 'setpoint_temperature', attrs: { min: 5, max: 20, step: 1 } });
add('switch.weinschrank_supercool', 'off', { ...l1, key: 'super_cool' });
c = FF.find(hass(), 'sensor.weinschrank');
assert.deepEqual(c.zones.map((z) => [z.key, z.label, z.temp, z.set, z.sup]),
  [['single', 'Kühlteil', 'sensor.weinschrank', 'number.weinschrank_sollwert', 'switch.weinschrank_supercool']]);

// ── 3. Liebherr HACS fork (bhuebschen): climate per zone, switches by name ───
reset();
const lf = { platform: 'liebherr', dev: 'lf' };
devices.lf = { id: 'lf', name: 'Kombi' };
add('climate.kombi_temperature_top', 'cool', { ...lf, attrs: { friendly_name: 'Kombi Oben', current_temperature: 6, temperature: 5, min_temp: 3, max_temp: 9 } });
add('climate.kombi_temperature_bottom', 'cool', { ...lf, attrs: { friendly_name: 'Kombi Unten', current_temperature: -19, temperature: -18, min_temp: -26, max_temp: -16 } });
add('switch.kombi_supercool_1', 'off', { ...lf, attrs: { friendly_name: 'Kombi supercool 1' } });
add('switch.kombi_superfrost_2', 'on', { ...lf, attrs: { friendly_name: 'Kombi superfrost 2' } });
add('switch.kombi_nightmode', 'off', { ...lf, attrs: { friendly_name: 'Kombi nightmode' } });
c = FF.find(hass(), 'climate.kombi_temperature_top');
assert.equal(c.source, 'liebherr');
assert.deepEqual(c.zones.map((z) => [z.label, z.climate, z.sup, z.supKind]),
  [['Oben', 'climate.kombi_temperature_top', 'switch.kombi_supercool_1', 'cool'], ['Unten', 'climate.kombi_temperature_bottom', 'switch.kombi_superfrost_2', 'frost']]);
assert.deepEqual(c.modes.map((m) => m.key), ['night']);
C = K.find(hass(), 'climate.kombi_temperature_top', {});
assert.equal(K.tileText(K.status(C, states)), 'SuperFrost · 6 °C · −19 °C');
assert.ok(K.sec('zones', C, states, hass()).includes('"temperature":5'), 'climate setpoint via set_temperature');

// ── 4. Home Connect (core) fridge-freezer ────────────────────────────────────
reset();
const hc = { platform: 'home_connect', dev: 'hc' };
add('number.kgn_refrigerator_temperature', 4, { ...hc, key: 'refrigerator_setpoint_temperature', attrs: { min: 2, max: 8, step: 1 } });
add('number.kgn_freezer_temperature', -18, { ...hc, key: 'freezer_setpoint_temperature', attrs: { min: -24, max: -16, step: 1 } });
add('switch.kgn_refrigerator_super_mode', 'off', { ...hc, key: 'refrigerator_super_mode' });
add('switch.kgn_freezer_super_mode', 'on', { ...hc, key: 'freezer_super_mode' });
add('switch.kgn_vacation_mode', 'off', { ...hc, key: 'vacation_mode' });
add('switch.kgn_eco_mode', 'off', { ...hc, key: 'eco_mode' });
add('binary_sensor.kgn_refrigerator_door', 'off', { ...hc, key: 'refrigerator_door', attrs: { device_class: 'door' } });
add('binary_sensor.kgn_freezer_door', 'on', { ...hc, key: 'freezer_door', attrs: { device_class: 'door' } });
add('sensor.kgn_freezer_door_alarm', 'off', { ...hc, key: 'freezer_door_alarm', attrs: { device_class: 'enum', options: ['confirmed', 'off', 'present'] } });
c = FF.find(hass(), 'switch.kgn_eco_mode');
assert.equal(c.source, 'home_connect');
assert.deepEqual(c.zones.map((z) => [z.key, z.label, z.set, z.supLabel, z.door]), [
  ['fridge', 'Kühlteil', 'number.kgn_refrigerator_temperature', 'Superkühlen', 'binary_sensor.kgn_refrigerator_door'],
  ['freezer', 'Gefrierteil', 'number.kgn_freezer_temperature', 'Supergefrieren', 'binary_sensor.kgn_freezer_door']]);
assert.deepEqual(c.modes.map((m) => m.key), ['eco', 'vacation']);
assert.equal(c.anchor, 'number.kgn_refrigerator_temperature', 'a mode switch is no anchor: the first setpoint');
C = K.find(hass(), 'number.kgn_refrigerator_temperature', {});
s = K.status(C, states);
assert.equal(K.tileText(s), 'Tür offen · 4 °C · −18 °C', 'without sensors the setpoints');
assert.ok(K.sec('hero', C, states, hass()).includes('Tür offen|Gefrierteil|'), K.sec('hero', C, states, hass()));
states['sensor.kgn_freezer_door_alarm'].state = 'present';
s = K.status(C, states);
assert.equal(K.tileText(s), 'Türalarm'); assert.equal(K.color(s), K.COLOR.bad);
// An oven of the same integration is no fridge.
add('sensor.ofen_operation_state', 'ready', { platform: 'home_connect', dev: 'oven', key: 'operation_state' });
add('number.ofen_setpoint', 180, { platform: 'home_connect', dev: 'oven', key: 'setpoint_temperature' });
devices.oven.name = 'Backofen Kühlteil-Test';
assert.equal(FF.find(hass(), 'sensor.ofen_operation_state'), null, 'oven');

// ── 5. Home Connect Local (homeconnect_ws) ───────────────────────────────────
reset();
const ws = { platform: 'homeconnect_ws', dev: 'ws' };
add('number.fridge_setpoint_refrigerator', 5, { ...ws, key: 'number_setpoint_refrigerator' });
add('number.fridge_setpoint_freezer', -20, { ...ws, key: 'number_setpoint_freezer' });
add('switch.fridge_super_freezer', 'off', { ...ws, key: 'switch_super_freezer' });
add('switch.fridge_sabbath', 'off', { ...ws, key: 'switch_refrigerator_sabbath_mode' });
add('binary_sensor.fridge_door', 'off', { ...ws, key: 'binary_sensor_fridge_door_state', attrs: { device_class: 'door' } });
add('binary_sensor.fridge_temp_alarm', 'off', { ...ws, key: 'binary_sensor_temperature_alarm_freezer' });
c = FF.find(hass(), 'number.fridge_setpoint_refrigerator');
assert.equal(c.source, 'homeconnect_ws');
assert.deepEqual(c.zones.map((z) => [z.key, z.door, z.alarmTemp, z.sup]), [['fridge', 'binary_sensor.fridge_door', null, null],
  ['freezer', null, 'binary_sensor.fridge_temp_alarm', 'switch.fridge_super_freezer']]);
assert.deepEqual(c.modes.map((m) => m.key), ['sabbath']);

// ── 6. Home Connect Alt (ekutner): entity_id ends ────────────────────────────
reset();
const al = { platform: 'home_connect_alt', dev: 'al' };
const HA = 'bosch_kgn39_68a40e000001';
add(`number.${HA}_refrigeration_fridgefreezer_setting_setpointtemperaturerefrigerator`, 4, { ...al, key: 'settings' });
add(`number.${HA}_refrigeration_fridgefreezer_setting_setpointtemperaturefreezer`, -18, { ...al, key: 'settings' });
add(`switch.${HA}_refrigeration_fridgefreezer_setting_supermodefreezer`, 'off', { ...al, key: 'settings' });
add(`binary_sensor.${HA}_refrigeration_common_status_door_refrigerator`, 'off', { ...al, attrs: { device_class: 'door' } });
c = FF.find(hass(), `number.${HA}_refrigeration_fridgefreezer_setting_setpointtemperaturerefrigerator`);
assert.equal(c.source, 'home_connect_alt');
assert.deepEqual(c.zones.map((z) => z.key), ['fridge', 'freezer']);
assert.equal(c.zones[0].door, `binary_sensor.${HA}_refrigeration_common_status_door_refrigerator`);
// Its washer is no fridge.
add(`sensor.${HA}x_bsh_common_status_operationstate`, 'run', { platform: 'home_connect_alt', dev: 'alw', key: 'statuses' });
assert.equal(FF.find(hass(), `sensor.${HA}x_bsh_common_status_operationstate`), null, 'washer of Home Connect Alt');

// ── 7. Generic: named like a fridge (Zigbee sensors on a "Gefrierschrank" device) ─
reset();
devices.g = { id: 'g', name: 'Gefrierschrank Keller' };
add('sensor.gefrierschrank_keller_temperatur', -21, { platform: 'zha', dev: 'g', attrs: { ...T, friendly_name: 'Gefrierschrank Keller Temperatur' } });
add('sensor.gefrierschrank_keller_luftfeuchtigkeit', 40, { platform: 'zha', dev: 'g', attrs: { device_class: 'humidity' } });
add('binary_sensor.gefrierschrank_keller_tuer', 'off', { platform: 'zha', dev: 'g', attrs: { device_class: 'door', friendly_name: 'Gefrierschrank Keller Tür' } });
c = FF.find(hass(), 'sensor.gefrierschrank_keller_temperatur');
assert.equal(c.source, 'generic');
assert.deepEqual(c.zones.map((z) => [z.label, z.temp, z.door]), [['Temperatur', 'sensor.gefrierschrank_keller_temperatur', 'binary_sensor.gefrierschrank_keller_tuer']]);
assert.equal(K.tileText(K.status(K.find(hass(), 'sensor.gefrierschrank_keller_temperatur', {}), states)), '−21 °C');

// ── 8. None ──────────────────────────────────────────────────────────────────
reset();
devices.t = { id: 't', name: 'Wohnzimmer Klima' };
add('sensor.wohnzimmer_temperatur', 21, { platform: 'zha', dev: 't', attrs: T });
assert.equal(FF.find(hass(), 'sensor.wohnzimmer_temperatur'), null, 'a room thermometer');
devices.w = { id: 'w', name: 'Wasserkühler PC' };
add('sensor.wasserkuehler_temp', 30, { platform: 'liquidctl', dev: 'w', attrs: T });
assert.equal(FF.find(hass(), 'sensor.wasserkuehler_temp'), null, 'a PC water cooler');
assert.deepEqual(FF.all(hass()), []);
assert.equal(K.find(hass(), '', {}), null, 'no fridge in the house');
assert.ok(/Kein Kühlschrank gefunden/.test(K.sec('hero', null, states, hass())));

// ── 9. Test house: the made-up Liebherr-like fridge, first use in the Studio ─
const H = testhaus({ publicOnly: true });
const all = FF.all(H);
assert.deepEqual(all.map((x) => [x.device, x.anchor, x.source]), [['dev_testfrost', 'sensor.testfrost_top_zone', 'liebherr']],
  'test house: one fridge, by its keys');
const { P, I } = await loadPanel();
const type = I.TILE_TYPES.find((t) => t.id === 'casora_fridge');
assert.ok(type && type.ownData, 'tile type in the Studio');
const home = { path: 'home', name: 'Home', tiles: [], variables: {} };
const p = Object.create(P); p._hass = H; p._state = { compact: { rooms: [home] } }; p._room = 0;
const cands = P._tileCandidates.call(p, type, home);
assert.equal(cands[0] && cands[0].id, 'sensor.testfrost_top_zone', 'new tile suggests the fridge');
assert.ok(cands[0].sure, 'as a sure match');
assert.equal(cands.length, 1, 'and nothing else');
const fld = (k) => type.fields.find((f) => f.key === k);
assert.equal(window.casoraFieldEntity(fld('entity_zone2_set'), { entity: 'sensor.testfrost_top_zone' }, H), 'number.testfrost_bottom_zone_setpoint');
assert.equal(window.casoraFieldEntity(fld('sw_party'), { entity: 'sensor.testfrost_top_zone' }, H), 'switch.testfrost_partymode');
const sug = window.casoraAssist.suggest(H, [home], I.TILE_TYPES).filter((x) => x.type === 'casora_fridge');
assert.deepEqual(sug.map((x) => x.entity), ['sensor.testfrost_top_zone'], 'assistant suggests the fridge');
console.log('kuehlschrank: ok');
