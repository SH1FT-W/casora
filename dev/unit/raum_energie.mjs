// Energie-Badge je Raum: in jedem Raum, in dem Strom gemessen wird, sonst keine.
//   node dev/unit/raum_energie.mjs
// 03.10.2026: Ein Leistungssensor im HA-Bereich reicht (auch eine Steckdose, auch bei
// 0 W). Ein Sensor für den ganzen Raum geht vor; Solar/Akku/Netz zählen nicht. Ausdrücklich
// ausgeschaltet (show_energy: false) bleibt aus. Bestehende Dashboards ergänzt das Studio beim
// Laden (fillRoomEnergy), einmal: wer den Sensor danach entfernt, bekommt ihn nicht wieder.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const panel = src('custom_components/casora/panel/casora-panel.js');
const from = panel.indexOf('const ENERGY_VAR = ');
const fillRoomEnergy = new Function(panel.slice(from, panel.indexOf('\nfunction deriveEnergyRooms(', from)) + '\nreturn fillRoomEnergy;')();

function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['sz', 'Schlafzimmer'], ['wz', 'Wohnzimmer'], ['bu', 'Büro'], ['ku', 'Küche'], ['fl', 'Flur'], ['ar', 'Arbeitszimmer']]) h.areas[id] = { area_id: id, name };
  const dev = (id, area, name) => { h.devices[id] = { id, area_id: area, name }; };
  const ent = (eid, { dev: d = null, area = null, dc, unit, name, state = '0' } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform: d ? 'zha' : 'template' };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name } };
  };
  // Schlafzimmer: nur eine Steckdose (Nachttisch), gerade 0 W.
  dev('d_plug', 'sz', 'Steckdose Nachttisch');
  ent('sensor.steckdose_nachttisch_leistung', { dev: 'd_plug', dc: 'power', unit: 'W', name: 'Steckdose Nachttisch Leistung', state: '0' });
  // Wohnzimmer: Fernseher-Steckdose und ein Raum-Gesamtsensor – der Gesamtsensor gewinnt.
  dev('d_tv', 'wz', 'Fernseher Steckdose');
  ent('sensor.fernseher_steckdose_power', { dev: 'd_tv', dc: 'power', unit: 'W', name: 'Fernseher Steckdose', state: '85' });
  ent('sensor.wohnzimmer_gesamt_leistung', { area: 'wz', dc: 'power', unit: 'W', name: 'Wohnzimmer Gesamt', state: '120' });
  // Büro: Gerät ohne Geräteklasse, nur mit Einheit kW, gerade nicht erreichbar.
  dev('d_pc', 'bu', 'Rechner');
  ent('sensor.rechner_leistung', { dev: 'd_pc', unit: 'kW', name: 'Rechner Leistung', state: 'unavailable' });
  // Küche: nur Solar und Akku – keine Raum-Messung.
  dev('d_pv', 'ku', 'Balkonkraftwerk');
  ent('sensor.balkon_solar_leistung', { dev: 'd_pv', dc: 'power', unit: 'W', name: 'Solar Leistung', state: '300' });
  ent('sensor.akku_leistung', { dev: 'd_pv', dc: 'power', unit: 'W', name: 'Akku Leistung', state: '10' });
  // Flur: nichts Elektrisches – nur Temperatur und die Tretleistung des E-Bikes (Watt, aber kein Strom).
  ent('sensor.flur_temperatur', { area: 'fl', dc: 'temperature', unit: '°C', name: 'Flur Temperatur', state: '20' });
  dev('d_bike', 'fl', 'Drive Unit Beispiel');
  ent('sensor.drive_unit_beispiel_avg_rider_power', { dev: 'd_bike', dc: 'power', unit: 'W', name: 'Ø Fahrerleistung', state: '140' });
  // Arbeitszimmer (04.10.2026): kein Raumsensor, aber zwei Steckdosen, eine davon mit zwei
  // Leistungssensoren – die Badge zeigt die Summe, jedes Gerät zählt einmal.
  dev('d_plug_a', 'ar', 'Steckdose Monitor');
  ent('sensor.steckdose_monitor_leistung', { dev: 'd_plug_a', dc: 'power', unit: 'W', name: 'Steckdose Monitor', state: '40' });
  dev('d_plug_b', 'ar', 'Steckdose Drucker');
  ent('sensor.steckdose_drucker_leistung', { dev: 'd_plug_b', unit: 'kW', name: 'Steckdose Drucker', state: '0.2' });
  ent('sensor.steckdose_drucker_leistung_mittel', { dev: 'd_plug_b', dc: 'power', unit: 'W', name: 'Steckdose Drucker Mittel', state: '150' });
  // Küche-Nebenraum „Hauswirtschaft“ (04.10.2026): Zweikanal-Shelly mit Geräte-Gesamtsensor
  // (nur dieser zählt), Zweikanal-Shelly ohne Gesamtsensor (beide Kanäle zählen).
  h.areas.hw = { area_id: 'hw', name: 'Hauswirtschaft' };
  dev('d_sh_a', 'hw', 'Shelly Boiler');
  ent('sensor.shelly_boiler_device_power', { dev: 'd_sh_a', dc: 'power', unit: 'W', name: 'Shelly Boiler Leistung', state: '30' });
  ent('sensor.shelly_boiler_switch_0_power', { dev: 'd_sh_a', dc: 'power', unit: 'W', name: 'Shelly Boiler Kanal 0', state: '10' });
  ent('sensor.shelly_boiler_switch_1_power', { dev: 'd_sh_a', dc: 'power', unit: 'W', name: 'Shelly Boiler Kanal 1', state: '20' });
  dev('d_sh_b', 'hw', 'Shelly Trockner');
  ent('sensor.shelly_trockner_switch_0_power', { dev: 'd_sh_b', dc: 'power', unit: 'W', name: 'Shelly Trockner Kanal 0', state: '5' });
  ent('sensor.shelly_trockner_switch_1_power', { dev: 'd_sh_b', dc: 'power', unit: 'W', name: 'Shelly Trockner Kanal 1', state: '7' });
  return h;
}

const B = window.casoraBasis;
const hass = house();
const room = (name, extra) => ({ name, vars: { ...(extra || {}) } });
const t = [room('Schlafzimmer'), room('Wohnzimmer'), room('Büro'), room('Küche'), room('Flur')];
B.fillBadges(hass, t);
const pw = (r) => r.vars.energy_power_entity || null;
// 06.10.2026: Geräte stehen immer in der Liste (auch ein einzelnes), nur ein Raumsensor im Einzelfeld.
const one = (r) => pw(r) || (r.vars.energy_entities || []).join(',') || null;
assert.equal(one(t[0]), 'sensor.steckdose_nachttisch_leistung', 'Steckdose mit 0 W zählt');
assert.equal(pw(t[1]), 'sensor.wohnzimmer_gesamt_leistung', 'Raum-Gesamtsensor vor der Steckdose');
assert.equal(one(t[2]), 'sensor.rechner_leistung', 'kW ohne Geräteklasse, auch gerade nicht erreichbar');
assert.equal(pw(t[3]), null, 'Solar/Akku sind keine Raum-Messung');
assert.equal(pw(t[4]), null, 'ohne Leistungssensor keine Energie-Badge');
// Mehrere Geräte, kein Raumsensor: Liste statt erstem Sensor, je Gerät einer.
const ar = [room('Arbeitszimmer')];
B.fillBadges(hass, ar);
assert.equal(pw(ar[0]), null, 'mehrere Geräte: kein einzelner Sensor');
assert.deepEqual(ar[0].vars.energy_entities, ['sensor.steckdose_drucker_leistung', 'sensor.steckdose_monitor_leistung'], 'alle Geräte, je Gerät ein Sensor');
assert.equal(t[1].vars.energy_entities, undefined, 'Raumsensor geht vor: keine Liste');
assert.deepEqual(t[0].vars.energy_entities, ['sensor.steckdose_nachttisch_leistung'], 'ein einzelnes Gerät: Liste mit einem Eintrag');
// Eingetragene Liste bleibt, wird nicht ergänzt.
const arOwn = [room('Arbeitszimmer', { energy_entities: ['sensor.steckdose_monitor_leistung'] })];
assert.deepEqual(B.fillBadges(hass, arOwn)[0], [], 'eigene Liste bleibt');

// Badge (casora_badge_energy_group): Summe in W (kW umgerechnet), nicht der Hausverbrauch.
{
  const T = JSON.parse(src('dashboards/casora/button_card_templates.json'));
  const body = (v) => String(v).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const nameFn = new Function('states', 'hass', 'variables', body(T.casora_badge_energy_group.name));
  window._casoraHousePower = () => 'sensor.haus';
  const S = { ...hass.states, 'sensor.haus': { state: '999', attributes: {} } };
  const sub = (vars) => /badge-sub">([^<]*)</.exec(nameFn(S, { locale: { language: 'de' } }, vars))[1];
  assert.equal(sub({ power_entities: ['sensor.steckdose_monitor_leistung', 'sensor.steckdose_drucker_leistung'] }), '240 W', 'Summe 40 W + 0,2 kW');
  assert.equal(sub({ power_entity: 'sensor.fernseher_steckdose_power', power_entities: ['sensor.steckdose_monitor_leistung'] }), '40 W', 'die Liste geht vor (06.10.2026)');
  assert.equal(sub({}), '999 W', 'ohne alles weiter der Hausverbrauch');
  const rc = T.casora_room.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  assert.ok(/energy_entities/.test(rc.variables.power_entities), 'Raum gibt die Liste ans Popup (power_entities)');
  assert.ok('energy_entities' in T.casora_room.variables, 'casora_room kennt energy_entities');
  delete window._casoraHousePower;
}
// Ausgeschaltet bleibt aus, Eingetragenes bleibt.
const off = [room('Schlafzimmer', { show_energy: false }), room('Wohnzimmer', { energy_power_entity: 'sensor.fernseher_steckdose_power' })];
B.fillBadges(hass, off);
assert.equal(pw(off[0]), null, 'show_energy: false bleibt aus');
assert.equal(pw(off[1]), 'sensor.fernseher_steckdose_power', 'eigene Wahl bleibt');

// Bestehendes Dashboard beim Laden: Home bleibt, wie es ist; Räume ohne Energie bekommen sie einmal.
const rooms = [
  { name: 'Home', path: 'home', variables: {} },
  { name: 'Schlafzimmer', path: 'schlafzimmer', variables: {} },
  { name: 'Flur', path: 'flur', variables: {} },
  { name: 'Büro', path: 'buero', variables: { show_energy: false } },
];
assert.equal(fillRoomEnergy(hass, rooms), 1);
assert.equal(rooms[0].variables.energy_power_entity, undefined, 'Home unverändert');
assert.deepEqual(rooms[1].variables.energy_entities, ['sensor.steckdose_nachttisch_leistung']);
assert.equal(rooms[1].variables.casora_energy_auto, 2);
assert.equal(rooms[2].variables.energy_power_entity, undefined, 'Flur ohne Messung');
assert.equal(rooms[3].variables.energy_power_entity, undefined, 'Büro ausgeschaltet');
// Bestehendes Dashboard: Raum mit mehreren Geräten bekommt die Liste, einmal.
const rooms2 = [{ name: 'Home', path: 'home', variables: {} }, { name: 'Arbeitszimmer', path: 'arbeitszimmer', variables: {} }];
assert.equal(fillRoomEnergy(hass, rooms2), 1);
assert.equal(rooms2[1].variables.energy_entities.length, 2);
assert.equal(fillRoomEnergy(hass, rooms2), 0, 'nur einmal');
// Bisher automatisch nur das erste Gerät (1.0.2): wird einmal zur Summe; eine andere Wahl bleibt.
const rooms3 = [{ name: 'Home', path: 'home', variables: {} },
  { name: 'Arbeitszimmer', path: 'a', variables: { energy_power_entity: 'sensor.steckdose_drucker_leistung' } },
  { name: 'Arbeitszimmer', path: 'b', variables: { energy_power_entity: 'sensor.steckdose_monitor_leistung' } },
  { name: 'Wohnzimmer', path: 'wz', variables: { energy_power_entity: 'sensor.fernseher_steckdose_power' } }];
assert.equal(fillRoomEnergy(hass, rooms3), 3);
assert.equal(rooms3[1].variables.energy_power_entity, undefined, 'erstes Gerät → Summe');
assert.equal(rooms3[1].variables.energy_entities.length, 2);
assert.equal(rooms3[1].variables.casora_energy_sum, true);
// Altfall ohne Markierung: auch ein anderes Gerät des Bereichs als das erste wird zur Summe.
assert.equal(rooms3[2].variables.energy_power_entity, undefined, 'Gerätesensor ohne Markierung → Summe');
assert.equal(rooms3[2].variables.casora_energy_sum, true);
assert.deepEqual(rooms3[3].variables.energy_entities, ['sensor.fernseher_steckdose_power'], 'eigene Wahl bleibt, als Liste mit einem Eintrag');
assert.equal(rooms3[3].variables.energy_power_entity, undefined);
rooms3[1].variables.energy_power_entity = 'sensor.steckdose_drucker_leistung'; delete rooms3[1].variables.energy_entities;
assert.equal(fillRoomEnergy(hass, rooms3), 1, 'Umstellung zur Summe nur einmal je Raum');
assert.deepEqual(rooms3[1].variables.energy_entities, ['sensor.steckdose_drucker_leistung'], 'danach eigene Wahl: bleibt (als Liste)');
assert.equal(fillRoomEnergy(hass, rooms3), 0, 'danach nichts mehr');
// Je Gerät: Gesamtsensor allein, sonst alle Kanäle – keine Doppelzählung, kein Kanal verloren.
const hw = [room('Hauswirtschaft')];
B.fillBadges(hass, hw);
assert.deepEqual(hw[0].vars.energy_entities, ['sensor.shelly_boiler_device_power', 'sensor.shelly_trockner_switch_0_power',
  'sensor.shelly_trockner_switch_1_power'], 'Gesamtsensor allein, sonst beide Kanäle');
// Altfall: Badge hatte den ersten Kanal (alphabetisch) – wird zur Summe, einmal; Raumsensor bleibt.
const rooms4 = [{ name: 'Home', path: 'home', variables: {} },
  { name: 'Hauswirtschaft', path: 'hw', variables: { energy_power_entity: 'sensor.shelly_trockner_switch_0_power' } },
  { name: 'Schlafzimmer', path: 'sz', variables: { energy_power_entity: 'sensor.steckdose_nachttisch_leistung' } }];
assert.equal(fillRoomEnergy(hass, rooms4), 2);
assert.equal(rooms4[1].variables.energy_entities.length, 3);
assert.equal(rooms4[1].variables.casora_energy_sum, true);
assert.deepEqual(rooms4[2].variables.energy_entities, ['sensor.steckdose_nachttisch_leistung'], 'einziges Gerät bleibt (als Liste)');
// Entfernt der Nutzer den Sensor, kommt er beim nächsten Laden nicht wieder.
delete rooms[1].variables.energy_entities;
assert.equal(fillRoomEnergy(hass, rooms), 0);
assert.equal(rooms[1].variables.energy_entities, undefined);
console.log('ok raum_energie');
