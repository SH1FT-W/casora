// Mähroboter (Community-Karte 1.5, 16-maeher.js) ohne HA: Zustände aus HA-Zustand und Gardena-Attributen,
// Fehler/Verbindung, Kachel-Text, Icon-Tipp je supported_features, Geräte-Entitäten am selben Gerät
// (Akku, Verbindung, „Parken bis auf Weiteres“), Popup-Tasten. Alle Geräte und Namen erfunden.
//   node dev/unit/maeher.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('00-finden.js'))();
new Function(src('16-maeher.js'))();
const M = window._casoraMower;
assert.ok(M && window.casoraDevice, 'Module geladen');

// Gerät wie Gardena: Mäher mit Attributen, daneben Sensoren und Tasten (krumme IDs, Gerätename erfunden).
const devices = { d_m: { id: 'd_m', name: 'Gartenzwerg', manufacturer: 'Gardena' } };
const entities = {}, states = {};
const add = (id, state, attributes = {}, key = null) => {
  entities[id] = { entity_id: id, platform: 'gardena_smart_system', translation_key: key, device_id: 'd_m' };
  states[id] = { entity_id: id, state, attributes };
};
const base = { battery_level: 100, battery_state: 'OK', rf_link_level: 90, rf_link_state: 'ONLINE', operating_hours: 1234,
  state: 'OK', activity: 'PARKED_TIMER', last_error_code: null, supported_features: 7 };
add('lawn_mower.gartenzwerg_lawn_mower', 'docked', base);
add('sensor.gartenzwerg_battery_level', '100', { device_class: 'battery', unit_of_measurement: '%' });
add('binary_sensor.gartenzwerg_online', 'on', { device_class: 'connectivity' });
add('sensor.gartenzwerg_operating_hours', '1234', { unit_of_measurement: 'h' });
add('sensor.gartenzwerg_rf_link_quality', '90', { unit_of_measurement: '%' });
add('sensor.gartenzwerg', 'ok', {});
add('button.gartenzwerg_park_until_further_notice', 'unknown');
add('button.gartenzwerg_return_to_dock', 'unknown');
add('button.gartenzwerg_start_mowing_now', 'unknown');
const hass = { states, entities, devices, areas: {} };
const ID = 'lawn_mower.gartenzwerg_lawn_mower';
const set = (state, attrs) => { states[ID] = { entity_id: ID, state, attributes: Object.assign({}, base, attrs) }; return M.of(states[ID], hass, states); };

// Entitäten am Gerät
const c = M.find(hass, ID);
assert.equal(c.battery, 'sensor.gartenzwerg_battery_level');
assert.equal(c.online, 'binary_sensor.gartenzwerg_online');
assert.equal(c.hours, 'sensor.gartenzwerg_operating_hours');
assert.equal(c.rf, 'sensor.gartenzwerg_rf_link_quality');
assert.equal(c.park, 'button.gartenzwerg_park_until_further_notice');
assert.equal(c.start, 'button.gartenzwerg_start_mowing_now');

// Zustände
let s = set('docked', {});
assert.equal(s.label, 'Parkt bis zum nächsten Zeitplan'); assert.equal(s.level, 0); assert.equal(M.active(s), false);
assert.equal(M.tileState(s), 'Parkt bis zum nächsten Zeitplan');
assert.equal(M.iconService(s), 'lawn_mower.start_mowing', 'geparkt: Icon startet');
s = set('mowing', { activity: 'OK_CUTTING', battery_level: 78 });
assert.equal(s.label, 'Mäht'); assert.equal(s.level, 1); assert.equal(M.active(s), true);
assert.equal(M.tileState(s), 'Mäht', 'Akku steht im Kreis, nicht im Text');
assert.equal(M.iconService(s), 'lawn_mower.dock', 'mäht: Icon schickt zur Station');
assert.equal(M.color(s), M.COLOR.run);
s = set('returning', { activity: 'OK_SEARCHING', battery_level: 30 });
assert.equal(s.label, 'Fährt zur Station'); assert.equal(M.active(s), true);
s = set('docked', { activity: 'OK_CHARGING', battery_level: 40 });
assert.equal(M.tileState(s), 'Lädt · 40 %'); assert.equal(M.active(s), false);
s = set('docked', { activity: 'PARKED_PARK_SELECTED' });
assert.equal(s.label, 'Parkt bis auf Weiteres'); assert.equal(s.parkedManual, true);
s = set('paused', { activity: 'PAUSED' });
assert.equal(s.label, 'Pausiert');
// Ohne Gardena-Attribute: HA-Zustand
states[ID] = { entity_id: ID, state: 'mowing', attributes: { supported_features: 3 } };
s = M.of(states[ID], hass, states);
assert.equal(s.label, 'Mäht'); assert.equal(s.battery, 100, 'Akku vom Akkusensor am Gerät');
assert.equal(M.iconService(s), 'none', 'ohne Dock-Funktion kein Icon-Dienst');
// Fehler, Warnung, Verbindung
s = set('error', { state: 'ERROR', last_error_code: 'TRAPPED' });
assert.equal(s.label, 'Steckt fest'); assert.equal(s.level, 3); assert.equal(M.color(s), M.COLOR.bad);
s = set('docked', { state: 'ERROR', last_error_code: 'SOMETHING_NEW' });
assert.equal(s.label, 'Fehler: Something new', 'unbekannter Code lesbar');
s = set('docked', { state: 'WARNING', last_error_code: 'OFF_HATCH_OPEN' });
assert.equal(s.label, 'Klappe offen'); assert.equal(s.level, 2);
s = set('docked', { rf_link_state: 'OFFLINE' });
assert.equal(s.label, 'Keine Verbindung'); assert.equal(s.level, 2); assert.equal(M.color(s), M.COLOR.warn);
// Nicht verfügbar / fehlt
states[ID] = { entity_id: ID, state: 'unavailable', attributes: {} };
s = M.of(states[ID], hass, states);
assert.equal(s.label, 'Nicht verfügbar'); assert.equal(s.dead, true); assert.equal(M.iconService(s), 'none');
s = M.of(null, hass, states);
assert.equal(s.label, 'Nicht verfügbar');
assert.equal(M.errorText(null), null); assert.equal(M.errorText('NO_MESSAGE'), null);

// Popup: Tasten Zur Station · Mähen · Parken, Status-Zeilen
window._casoraUI = {
  esc: (t) => String(t), tokens: { ink: '#fff', ink3: '#aaa', font: 'x' },
  hero: (o) => '<hero>' + o.value + '|' + (o.sub || '') + '</hero>',
  group: (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '')).join(';') + '</group>',
};
set('docked', {});
let h = M.sec('hero', c, states, hass);
assert.ok(/Parkt bis zum nächsten Zeitplan\|Akku 100 %/.test(h), h);
assert.ok(h.includes('"service":"start_mowing"') && h.includes('"service":"press"') && h.includes(c.park), 'Mähen und Parken bedienbar');
assert.ok(/hm-b dis"[^>]*><ha-icon icon="mdi:home-import-outline"/.test(h), 'in der Station: Zur Station aus');
set('mowing', { activity: 'OK_CUTTING' });
h = M.sec('hero', c, states, hass);
assert.ok(h.includes('"service":"pause"') && h.includes('"service":"dock"'), 'mäht: Pause und Zur Station');
const info = M.sec('info', c, states, hass);
assert.ok(/Akku=100 %/.test(info) && /Verbindung=90 %/.test(info) && /Betriebsstunden=1.?234 h/.test(info), info);
set('error', { state: 'ERROR', last_error_code: 'LIFTED' });
assert.ok(/^<group Status>Angehoben=/.test(M.sec('info', c, states, hass)), 'Fehler steht oben im Status');

// Verlauf: Mähfahrten aus Zustandswechseln (Pause/Rückfahrt gehören zur Fahrt, Fehler eigener Eintrag).
const H = 3600000, t0 = Date.parse('2026-10-13T08:00:00');
const ses = M.sessions([
  { state: 'docked', t: t0 },
  { state: 'mowing', t: t0 + 1 * H },
  { state: 'paused', t: t0 + 2 * H },
  { state: 'mowing', t: t0 + 2.5 * H },
  { state: 'returning', t: t0 + 3 * H },
  { state: 'docked', t: t0 + 3.2 * H },
  { state: 'mowing', t: t0 + 5 * H },
  { state: 'error', t: t0 + 5.5 * H },
  { state: 'docked', t: t0 + 6 * H },
  { state: 'mowing', t: t0 + 8 * H },
], t0 + 9 * H);
assert.deepEqual(ses.map((x) => x.kind), ['mow', 'error', 'mow', 'mow'], JSON.stringify(ses));
assert.equal(ses[0].end, null, 'laufende Fahrt offen');
assert.equal(ses[0].mow, 1 * H);
assert.equal(ses[3].mow, 1.5 * H, 'Pause zählt nicht als Mähzeit');
assert.equal(ses[3].end, t0 + 3.2 * H, 'Fahrt endet in der Station');
assert.equal(ses[2].end, t0 + 5.5 * H, 'Fehler beendet die Fahrt');
assert.equal(ses[1].end, t0 + 6 * H);
assert.equal(M.total(ses), '3 Std. · 3 Fahrten');
assert.equal(M.total([]), null);
assert.equal(M.dur(25 * 60000), '25 Min.'); assert.equal(M.dur(90 * 60000), '1 Std. 30 Min.');
window._casoraUI.label = (t) => '<div>' + t + '</div>';
const hh = M.sec('hist', c, states, Object.assign({}, hass, { callApi: () => new Promise(() => {}) }), null);
assert.ok(/Wird geladen/.test(hh) && /data-casora-link="\/history\?entity_id=lawn_mower\.gartenzwerg_lawn_mower&amp;start_date=/.test(hh), hh);
console.log('maeher: ok');
