// Energie-Popup „Verbraucher“ ohne Zuordnung im Studio (07.10.2026): Casora sucht die größten
// Verbraucher selbst (window._casoraAutoConsumers, casora-core.js).
//   node dev/unit/energie_verbraucher_auto.mjs
// Erwartet: nur Leistungssensoren mit gültigem Wert über 0 W; kW → W; Haus-, Netz-, Solar- und
// Akku-Gesamtsensoren, Gruppen, versteckte/Diagnose-Sensoren und Tretleistung fallen weg; je Gerät
// eine Messung (Geräte-Gesamtsensor bzw. Last-Kanal vor Eigenverbrauch, nie Mittelwert);
// sortiert nach Leistung, höchstens 5; Bereich und Sichtbarkeit werden beachtet.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// 07.10.2026: Größte Verbraucher');
const b = core.indexOf('// ── Performance mode', a);
assert.ok(a > 0 && b > a, 'Baustein fehlt');
globalThis.window = globalThis;
new Function(core.slice(a, b))();
const pick = window._casoraAutoConsumers;

const hass = { entities: {}, devices: {} };
const states = {};
const dev = (id, area, name) => { hass.devices[id] = { id, area_id: area, name }; };
const ent = (eid, state, { d = null, area = null, dc = 'power', unit = 'W', name, platform = 'demo', hidden = false, cat = null, attrs = {} } = {}) => {
  hass.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform, hidden, entity_category: cat };
  states[eid] = { entity_id: eid, state: String(state), attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name || eid, ...attrs } };
};
dev('d_wm', 'bad', 'Waschmaschine'); ent('sensor.waschmaschine_leistung', 1.2, { d: 'd_wm', unit: 'kW', name: 'Waschmaschine Leistung' });
dev('d_tv', 'wz', 'Fernseher'); ent('sensor.fernseher_power', 85, { d: 'd_tv' });
ent('sensor.fernseher_power_mittel', 400, { d: 'd_tv', name: 'Fernseher Mittelwert' });
dev('d_sh', 'kz', 'Shelly Boiler');
ent('sensor.shelly_boiler_switch_0_power', 300, { d: 'd_sh' });
ent('sensor.shelly_boiler_eigenverbrauch', 0.9, { d: 'd_sh', platform: 'powercalc' });
dev('d_pc', 'bu', 'Rechner'); ent('sensor.rechner_power', 'unavailable', { d: 'd_pc' });
dev('d_lp', 'bu', 'Lampe'); ent('sensor.lampe_power', 0, { d: 'd_lp' });
dev('d_kue', 'kue', 'Kühlschrank'); ent('sensor.kuehlschrank_power', 60, { d: 'd_kue' });
dev('d_ofen', 'kue', 'Ofen'); ent('sensor.ofen_power', 2000, { d: 'd_ofen' });
dev('d_pump', 'ga', 'Pumpe'); ent('sensor.pumpe_power', 40, { d: 'd_pump' });
dev('d_ms', 'ga', 'Mähroboter'); ent('sensor.maehroboter_power', 20, { d: 'd_ms' });
// Gesamt-, Netz-, Solar-, Akku-Sensoren, Gruppe, versteckt, Diagnose, Tretleistung, keine Leistung
ent('sensor.haus_verbrauch_leistung', 3000, { name: 'Hausverbrauch' });
ent('sensor.wohnzimmer_gesamt_leistung', 500, { area: 'wz', name: 'Wohnzimmer Gesamt' });
dev('d_meter', 'ke', 'Stromzähler'); ent('sensor.stromzaehler_power', 2500, { d: 'd_meter' });
ent('sensor.netzbezug', 1000, { name: 'Netzbezug' });
dev('d_pv', 'da', 'Balkonkraftwerk'); ent('sensor.balkon_solar_leistung', 600, { d: 'd_pv', name: 'Solar Leistung' });
ent('sensor.akku_leistung', 700, { d: 'd_pv', name: 'Akku Leistung' });
ent('sensor.alle_steckdosen', 900, { platform: 'group', attrs: { entity_id: ['sensor.a', 'sensor.b'] } });
dev('d_x', 'bu', 'Drucker'); ent('sensor.drucker_power', 5000, { d: 'd_x', hidden: true });
dev('d_y', 'bu', 'Router'); ent('sensor.router_power', 4000, { d: 'd_y', cat: 'diagnostic' });
dev('d_bike', 'fl', 'Drive Unit'); ent('sensor.drive_unit_rider_power', 250, { d: 'd_bike' });
dev('d_t', 'bu', 'Thermo'); ent('sensor.thermo_temp', 3000, { d: 'd_t', dc: 'temperature', unit: '°C' });

const r = pick(hass, states, { exclude: ['sensor.haus_verbrauch_leistung'] });
const ids = r.top.map((x) => x.id);
assert.deepEqual(ids, ['sensor.ofen_power', 'sensor.waschmaschine_leistung', 'sensor.shelly_boiler_switch_0_power',
  'sensor.fernseher_power', 'sensor.kuehlschrank_power'], 'Auswahl: ' + JSON.stringify(ids));
assert.equal(r.top[1].w, 1200, 'kW → W');
assert.equal(r.top.length, 5, 'höchstens 5');
for (const no of ['sensor.haus_verbrauch_leistung', 'sensor.wohnzimmer_gesamt_leistung', 'sensor.stromzaehler_power',
  'sensor.netzbezug', 'sensor.balkon_solar_leistung', 'sensor.akku_leistung', 'sensor.alle_steckdosen',
  'sensor.drucker_power', 'sensor.router_power', 'sensor.drive_unit_rider_power', 'sensor.thermo_temp',
  'sensor.fernseher_power_mittel', 'sensor.shelly_boiler_eigenverbrauch']) {
  assert.ok(!r.top.some((x) => x.id === no), 'nicht in der Liste: ' + no);
}
// unavailable und 0 W fallen weg, auch ohne Größenbegrenzung
const all = pick(hass, states, { max: 50 }).top.map((x) => x.id);
assert.ok(!all.includes('sensor.rechner_power'), 'unavailable raus');
assert.ok(!all.includes('sensor.lampe_power'), '0 W raus');
assert.ok(all.includes('sensor.maehroboter_power'), 'sechster Verbraucher erscheint ohne Begrenzung');
// Bereich: nur die Küche
assert.deepEqual(pick(hass, states, { area: 'kue' }).top.map((x) => x.id), ['sensor.ofen_power', 'sensor.kuehlschrank_power']);
// Sichtbarkeit: verborgene Geräte fallen weg
assert.ok(!pick(hass, states, { visible: (l) => l.filter((x) => x !== 'sensor.ofen_power') }).top.some((x) => x.id === 'sensor.ofen_power'));
// Eigenverbrauch allein (kein anderer Kanal am Gerät) zählt
dev('d_solo', 'ga', 'Zwischenstecker'); ent('sensor.zwischenstecker_eigen', 3, { d: 'd_solo', platform: 'powercalc' });
assert.ok(pick(hass, states, { max: 50 }).top.some((x) => x.id === 'sensor.zwischenstecker_eigen'), 'powercalc allein');
console.log('ok energie_verbraucher_auto');
