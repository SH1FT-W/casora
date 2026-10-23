// Sub-Badge-Popups (20-energie-fokus.js): Art je Sub-Badge und Anlage aus allen Badges.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const win = {};
const ctx = vm.createContext({ window: win, console });
vm.runInContext(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/20-energie-fokus.js', import.meta.url), 'utf8'), ctx);
const F = win._casoraEnergyFocus;

const st = (state, unit, dc, name) => ({ state: String(state), attributes: { unit_of_measurement: unit, device_class: dc, friendly_name: name } });
const states = {
  'sensor.sb_solar': st(432, 'W', 'power', 'Solarleistung'),
  'sensor.sb_akku': st(-120, 'W', 'power', 'Akkuleistung'),
  'sensor.sb_haus': st(569, 'W', 'power', 'Hausbedarf'),
  'sensor.sb_netz': st(149, 'W', 'power', 'Netzleistung'),
  'sensor.sb_soc': st(5, '%', 'battery', 'Ladestand'),
  'sensor.ertrag_heute': st(0.85, 'kWh', 'energy', 'Ertrag heute'),
  'sensor.kosten_heute': st(1.3, '€', 'monetary', 'Kosten heute'),
  'sensor.leistung_x': st(10, 'W', 'power', 'Irgendwas'),
};
const entities = {
  'sensor.sb_solar': { platform: 'anker_solix', translation_key: 'input_power' },
  'sensor.sb_akku': { platform: 'anker_solix', translation_key: 'battery_power_signed' },
  'sensor.sb_haus': { platform: 'anker_solix', translation_key: 'home_load_power' },
  'sensor.sb_netz': { platform: 'anker_solix', translation_key: 'grid_power_signed' },
  'sensor.sb_soc': { platform: 'anker_solix', translation_key: 'state_of_charge' },
};
const hass = { states, entities };
const V = {
  energy_power_entity: 'sensor.sb_haus', energy_cost_today: 'sensor.kosten_heute',
  energy_entity_1: 'sensor.sb_solar', energy_popup_today_1: 'sensor.ertrag_heute',
  energy_entity_2: 'sensor.sb_akku', energy_entity_3: 'sensor.sb_haus',
  energy_entity_4: 'sensor.sb_netz', energy_entity_5: 'sensor.sb_soc',
};

// Erkennung über den Schlüssel der Integration
assert.deepEqual([1, 2, 3, 4, 5].map((n) => F.detect(hass, V, n)), ['solar', 'battery', 'home', 'grid', 'battery']);
// Ohne Schlüssel: Gerätetyp bzw. Name/Etikett; unbekannt → einfaches Popup
const bare = { states, entities: {} };
assert.equal(F.detect(bare, V, 5), 'battery');
assert.equal(F.detect(bare, { energy_entity_1: 'sensor.leistung_x', energy_label_1: 'Netz' }, 1), 'grid');
assert.equal(F.detect(bare, { energy_entity_1: 'sensor.leistung_x' }, 1), null);
// Studio-Feld gewinnt; „simple“ = altes Popup
assert.equal(F.detect(hass, { ...V, energy_popup_focus_1: 'home' }, 1), 'home');
assert.equal(F.detect(hass, { ...V, energy_popup_focus_1: 'simple' }, 1), null);

// Anlage aus allen Sub-Badges
const P = F.peers(hass, V);
assert.equal(P.solar.power, 'sensor.sb_solar');
assert.equal(P.solar.today, 'sensor.ertrag_heute');
assert.equal(P.battery.power, 'sensor.sb_akku');
assert.equal(P.battery.soc, 'sensor.sb_soc');
assert.equal(P.home.power, 'sensor.sb_haus');
assert.equal(P.grid.power, 'sensor.sb_netz');
assert.equal(P.grid.costToday, 'sensor.kosten_heute');
// Namen sind nur Rückfall, als ganze Wörter und nur bei Leistung/Prozent (Code-Review 15.10.).
{
  const S2 = { ...states, 'sensor.k': st(80, 'W', 'power', 'Kühlschrank Verbrauch'), 'sensor.n': st(40, 'W', 'power', 'Netzwerkschrank'),
    'sensor.hs': st(30, 'W', 'power', 'Homeserver Power'), 'sensor.ws': st(2, 'kW', 'power', 'Warmwasserspeicher'),
    'sensor.kost': st(1.2, '€', 'monetary', 'Gartenhaus Kosten'), 'sensor.pv2': st(100, 'W', 'power', 'PV Balkon') };
  const d = (id, label) => F.detect({ states: S2, entities: {} }, { energy_entity_1: id, energy_label_1: label }, 1);
  assert.equal(d('sensor.k'), null, 'Kühlschrank');
  assert.equal(d('sensor.n'), null, 'Netzwerkschrank');
  assert.equal(d('sensor.hs'), null, 'Homeserver');
  assert.equal(d('sensor.ws'), null, 'Warmwasserspeicher');
  assert.equal(d('sensor.kost', 'Haus'), null, 'Kosten-Badge');
  assert.equal(d('sensor.pv2'), 'solar', 'PV Balkon');
  const S3 = { ...S2, 'sensor.sp': st(30, 'W', 'power', 'Solarpumpe Teich'), 'sensor.as': st(5, 'W', 'power', 'Akkuschrauber Ladegerät'),
    'sensor.ho': st(90, 'W', 'power', 'Home Office'), 'sensor.bl': st(8, 'W', 'power', 'Batterieladegerät') };
  const d3 = (id) => F.detect({ states: S3, entities: {} }, { energy_entity_1: id }, 1);
  assert.equal(d3('sensor.sp'), null, 'Solarpumpe'); assert.equal(d3('sensor.as'), null, 'Akkuschrauber');
  assert.equal(d3('sensor.ho'), null, 'Home Office'); assert.equal(d3('sensor.bl'), null, 'Batterieladegerät');
  // #44: SMA "Grid power" is the inverter's output (solar), its energy meter's "Metering power" the grid; the
  // electricity meter's entity ID without umlaut ("stromzahler") is the grid.
  const S4 = { ...S3, 'sensor.stp_8000tl_20_grid_power': st(2400, 'W', 'power', 'STP 8000TL-20 Grid power'),
    'sensor.sma_metering_power_absorbed': st(300, 'W', 'power', 'Metering power absorbed'),
    'sensor.stromzahler_emh_power_curr': st(424, 'W', 'power', 'Wirkleistung (W)') };
  const E4 = { 'sensor.stp_8000tl_20_grid_power': { platform: 'sma' }, 'sensor.sma_metering_power_absorbed': { platform: 'sma' },
    'sensor.stromzahler_emh_power_curr': { platform: 'tasmota' } };
  const d4 = (id) => F.detect({ states: S4, entities: E4 }, { energy_entity_1: id }, 1);
  assert.equal(d4('sensor.stp_8000tl_20_grid_power'), 'solar', 'SMA grid power = inverter output');
  assert.equal(d4('sensor.sma_metering_power_absorbed'), 'grid', 'SMA metering = grid');
  assert.equal(d4('sensor.stromzahler_emh_power_curr'), 'grid', 'stromzahler = grid');
  // Eigener Sensor ist Hauptwert: zweites Solar-Badge zeigt seinen Wert, nicht den des ersten.
  const C = F.model({ states: S2, entities: {} }, 'solar', F.peers(hass, V), 'sensor.pv2');
  assert.equal(C.solar, 'sensor.pv2');
}

// #44: a power sensor of HA's energy settings has its role from there, before keys and names; the Studio field still
// wins. The settings come from the shared cached load (window.casoraEnergyPrefs, 00-finder.js).
{
  vm.runInContext(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'), ctx);
  const S5 = { ...states, 'sensor.stp_8000tl_20_grid_power': st(2400, 'W', 'power', 'STP 8000TL-20 Grid power'),
    'sensor.stromzahler_emh_power_curr': st(424, 'W', 'power', 'Wirkleistung (W)'),
    'sensor.speicher_leistung': st(-200, 'W', 'power', 'Speicher Leistung') };
  const h5 = { states: S5, entities: { ...entities, 'sensor.stp_8000tl_20_grid_power': { platform: 'sma' } },
    callWS: async () => ({ energy_sources: [
      { type: 'grid', stat_energy_from: 'sensor.bezug', stat_energy_to: 'sensor.einspeisung_gesamt', stat_rate: 'sensor.stromzahler_emh_power_curr' },
      { type: 'solar', stat_energy_from: 'sensor.ertrag', stat_rate: 'sensor.stp_8000tl_20_grid_power' },
      { type: 'battery', stat_energy_from: 'sensor.a', stat_energy_to: 'sensor.b', power_config: { stat_rate: 'sensor.speicher_leistung' } },
      // The Anker key says grid; the settings say solar.
      { type: 'solar', stat_energy_from: 'sensor.c', stat_rate: 'sensor.sb_netz' }] }) };
  await win.casoraEnergyPrefs.load(h5, true);
  const d5 = (id, extra) => F.detect(h5, { energy_entity_1: id, ...(extra || {}) }, 1);
  assert.equal(d5('sensor.stromzahler_emh_power_curr'), 'grid', 'settings: grid');
  assert.equal(d5('sensor.stp_8000tl_20_grid_power'), 'solar', 'settings: solar');
  assert.equal(d5('sensor.speicher_leistung'), 'battery', 'settings: battery, no name hint');
  assert.equal(d5('sensor.sb_netz'), 'solar', 'settings before the integration key');
  assert.equal(d5('sensor.sb_netz', { energy_popup_focus_1: 'home' }), 'home', 'Studio field wins');
  assert.equal(d5('sensor.leistung_x'), null, 'not in the settings: rules as before');
  // The export meter for the grid popup comes from the same settings.
  assert.equal(F.peers(h5, {}).grid.exportTotal, 'sensor.einspeisung_gesamt');
}

console.log('ok energie_fokus');
