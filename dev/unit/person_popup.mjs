// Personen-Popup (1.4, 15-person.js) ohne Browser.  node dev/unit/person_popup.mjs
// Orte und Farben, Zeiten, Entfernung, Handy der Companion-App finden (Tracker → Gerät → Sensoren, Notify-Dienst).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/15-person.js', import.meta.url), 'utf8');
const win = {};
const doc = { addEventListener() {}, querySelector() { return null; } };
new Function('window', 'document', src)(win, doc);
const P = win._casoraPerson;
assert.ok(P && P.popup && P.sec && P.phone, 'Bausteine fehlen');

// Orte
assert.equal(P.place('home'), 'Zuhause');
assert.equal(P.place('not_home'), 'Unterwegs');
assert.equal(P.place('Arbeit'), 'Arbeit');
assert.equal(P.place('unavailable'), 'Unbekannt');
assert.match(P.zoneHue('home'), /teal/);
assert.match(P.zoneHue('not_home'), /sand/);
assert.equal(P.zoneHue('Arbeit'), P.zoneHue('Arbeit'), 'gleiche Zone, gleiche Farbe');
assert.ok(!/teal|sand/.test(P.zoneHue('Fitnessstudio')), 'andere Zone: Palette');

// Zeiten und Dauern
const now = new Date(2026, 9, 12, 20, 0).getTime();
assert.equal(P.when(new Date(2026, 9, 12, 8, 34).getTime(), now), '08:34');
assert.equal(P.when(new Date(2026, 9, 11, 18, 12).getTime(), now), 'gestern 18:12');
assert.match(P.when(new Date(2026, 9, 9, 7, 5).getTime(), now), /^(Fr) 07:05$/);
assert.equal(P.dur(32 * 60000), '32 Min.');
assert.equal(P.dur(186 * 60000), '3 Std. 6 Min.');
assert.equal(P.dur(120 * 60000), '2 Std.');
assert.equal(P.dur(2 * 86400000), '2 Tage');
assert.equal(P.ago(now - 90000, now), 'vor 2 Min.');

// Entfernung
assert.equal(P.km(140), '140 m');
assert.equal(P.km(12400), '12 km');
assert.equal(P.km(3240), '3,2 km');
const d = P.dist(52.52, 13.405, 52.531, 13.41);
assert.ok(d > 1200 && d < 1400, 'Luftlinie ~1,3 km: ' + d);

const hass = {
  states: {
    'person.anna': { state: 'Arbeit', attributes: { friendly_name: 'Anna', source: 'device_tracker.annas_phone',
      device_trackers: ['device_tracker.router_anna', 'device_tracker.annas_phone'], latitude: 52.531, longitude: 13.41 } },
    'device_tracker.annas_phone': { state: 'Arbeit', attributes: { source_type: 'gps' } },
    'device_tracker.router_anna': { state: 'not_home', attributes: {} },
    'sensor.annas_phone_battery_level': { state: '64', attributes: {} },
    'sensor.annas_phone_battery_state': { state: 'Not Charging', attributes: {} },
    'sensor.annas_phone_wifi_connection': { state: '<not connected>', attributes: {} },
    'zone.home': { state: '0', attributes: { latitude: 52.52, longitude: 13.405 } },
  },
  entities: {
    'device_tracker.annas_phone': { platform: 'mobile_app', device_id: 'd1' },
    'device_tracker.router_anna': { platform: 'fritz', device_id: 'r1' },
    'sensor.annas_phone_battery_level': { platform: 'mobile_app', device_id: 'd1' },
    'sensor.annas_phone_battery_state': { platform: 'mobile_app', device_id: 'd1' },
    'sensor.annas_phone_wifi_connection': { platform: 'mobile_app', device_id: 'd1' },
  },
  devices: { d1: { name: 'Annas Phone' } },
  services: { notify: { mobile_app_annas_phone: {}, persistent_notification: {} } },
};
const ph = P.phone(hass, 'person.anna');
assert.equal(ph.tracker, 'device_tracker.annas_phone', 'Companion-App-Tracker, nicht der Router');
assert.equal(ph.battery, 'sensor.annas_phone_battery_level');
assert.equal(ph.charging, 'sensor.annas_phone_battery_state');
assert.equal(ph.wifi, 'sensor.annas_phone_wifi_connection');
assert.equal(ph.notify, 'mobile_app_annas_phone');
// Gemeldet 13.10.2026: Apostroph im Gerätenamen – HA lässt ihn im Dienstnamen weg (bastis_iphone).
for (const [name, svc] of [['Annas’ iPhone', 'mobile_app_annas_iphone'], ["Ben's iPhone", 'mobile_app_bens_iphone'], ['Zoë Handy', 'mobile_app_zoe_handy']]) {
  const h2 = JSON.parse(JSON.stringify(hass));
  h2.devices.d1.name = name;
  h2.services.notify = { [svc]: {}, persistent_notification: {} };
  assert.equal(P.phone(h2, 'person.anna').notify, svc, 'Dienst gefunden für ' + name);
}
// Ohne Companion-App kein Handy-Block.
const noApp = JSON.parse(JSON.stringify(hass));
delete noApp.entities['device_tracker.annas_phone'];
assert.equal(P.phone(noApp, 'person.anna'), null);
// Entfernung nach Hause: Luftlinie zur Zone, zuhause keine.
const away = P.away(hass, 'person.anna');
assert.ok(away > 1200 && away < 1400);
assert.equal(P.away({ ...hass, states: { ...hass.states, 'person.anna': { state: 'home', attributes: {} } } }, 'person.anna'), null);
// proximity hat Vorrang (in km gemeldet).
const withProx = { ...hass, entities: { ...hass.entities, 'sensor.home_anna_distance': { platform: 'proximity', translation_key: 'dist_to_zone' } },
  states: { ...hass.states, 'sensor.home_anna_distance': { state: '7.5', attributes: { unit_of_measurement: 'km' } } } };
assert.equal(P.away(withProx, 'person.anna'), 7500);
console.log('ok person_popup');
