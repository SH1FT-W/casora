// Mitteilungszentrum: Schloss mit eigenem Türsensor + Kontaktsensor an derselben Tür meldeten
// „Haustür ist offen“ doppelt (Hemma 2.2.0). Je Tür-Name nur eine Meldung; verschiedene Türen
// bleiben getrennt. Ohne Browser: das Mitteilungs-Modul aus casora-core.js laden.
//   node dev/unit/tuer_offen_einmal.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const end = core.indexOf('\n})();', start);
const mod = core.slice(start, end + 6);

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const st = (id, name, dc, state, min) => ({ entity_id: id, state, last_changed: ago(min), attributes: { friendly_name: name, device_class: dc } });
const states = {};
for (const s of [
  st('binary_sensor.haustuer_schloss_tuer', 'Haustür', 'door', 'on', 30),          // Türsensor des Schlosses
  st('binary_sensor.haustuer_kontakt', 'Haustür Contact', 'door', 'on', 29),      // zusätzlicher Kontaktsensor
  st('binary_sensor.terrassentuer', 'Terrassentür', 'door', 'on', 40),
  st('binary_sensor.kellerfenster', 'Kellerfenster', 'window', 'off', 40),
  // gleicher Name „Fenster“ in zwei Räumen: zwei Fenster, zwei Meldungen (04.10.2026)
  st('binary_sensor.fenster_schlafzimmer', 'Fenster', 'window', 'on', 50),
  st('binary_sensor.fenster_hwr', 'Fenster', 'window', 'on', 50),
]) states[s.entity_id] = s;
const hass = { states, callWS: () => Promise.resolve([]),
  entities: { 'binary_sensor.fenster_schlafzimmer': { device_id: 'd1' }, 'binary_sensor.fenster_hwr': { area_id: 'hwr' },
    'binary_sensor.haustuer_schloss_tuer': { device_id: 'schloss' }, 'binary_sensor.haustuer_kontakt': { device_id: 'kontakt' } },
  devices: { d1: { area_id: 'schlafzimmer' }, schloss: { area_id: 'flur' }, kontakt: { area_id: 'flur' } },
  areas: { schlafzimmer: { name: 'Schlafzimmer' }, hwr: { name: 'HWR' }, flur: { name: 'Flur' } } };

const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'door-open';
new Function(mod)();

const rows = await window._casoraNotify.refresh();
const open = rows.filter((r) => /ist offen$/.test(r.label));
assert.deepEqual(open.map((r) => r.label).sort(), ['HWR Fenster ist offen', 'Haustür ist offen', 'Schlafzimmer Fenster ist offen', 'Terrassentür ist offen'],
  'Haustür nur einmal, Terrassentür und beide „Fenster“ (verschiedene Räume) eigene Meldung: ' + JSON.stringify(open.map((r) => r.label)));
// Antippen öffnet „Türen & Fenster“ (Kontakte), nicht das Schloss-Popup (04.10.2026).
for (const r of open) {
  assert.deepEqual(r.opens, ['casora_badge_contact_group', 'casora_popup_contacts'], 'Ziel von ' + r.label + ': ' + JSON.stringify(r.opens));
}
console.log('ok – „ist offen“ je Tür nur einmal, gleiche Namen in verschiedenen Räumen getrennt, Ziel Kontakte-Popup');
