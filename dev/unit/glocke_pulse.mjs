// Pulse in der Glocke (Casora 1.2.x): Probleme (prüfen/ausgefallen) als Einträge, „bald fällig“ nicht,
// pausierte Erinnerungen nicht. Tipp öffnet das Pulse-Popup (opens + Entität „Probleme“). Schalter
// notify_pulse. Keine Doppelmeldung mit der Akku-Quelle (auch nicht über 01-basis fixBattery), solange
// die Pulse-Quelle an ist. Ausnahmen „Nicht melden“ je Status-Sensor. Mehr als 3 → Sammelzeile.
// Nach einem HA-Neustart (Zustände kurz unavailable, last_changed neu) nichts neu.
// Alle Geräte und Namen erfunden.
//   node dev/unit/glocke_pulse.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const s0 = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(s0 > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(s0, core.indexOf('\n})();', s0) + 6);
const basis = fs.readFileSync(new URL('local/01-basis.js', root), 'utf8');
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'Mitteilungs-Erweiterung (01-basis) gefunden');
const basisMod = basis.slice(bs, basis.indexOf('\n})();', bs) + 6);
const finden = fs.readFileSync(new URL('local/00-finden.js', root), 'utf8');
const pulse = fs.readFileSync(new URL('local/14-pulse.js', root), 'utf8');

const MIN = 60000;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const entities = {}, devices = {}, areas = { a_flur: { name: 'Flur' } };
let states = {};
const add = (id, platform, key, device, state, attributes = {}, ago = 300 * MIN) => {
  entities[id] = { entity_id: id, platform, translation_key: key, device_id: device };
  states[id] = { entity_id: id, state, attributes, last_changed: iso(ago), last_updated: iso(ago) };
};
const dev = (n, name, status, attrs, bat, area) => {
  devices['d' + n] = { id: 'd' + n, name, area_id: area || null };
  add('sensor.p' + n + '_status', 'pulse', 'status', 'd' + n, status,
    Object.assign({ reason_key: null, silent_since: null, typical_interval: null, critical: false, snoozed_until: null }, attrs));
  if (bat != null) add('sensor.p' + n + '_akku', 'zha', null, 'd' + n, String(bat), { device_class: 'battery', unit_of_measurement: '%', friendly_name: name + ' Batterie' });
};
devices.hub = { id: 'hub', name: 'Pulse' };
dev(1, 'Rauchmelder Dachboden', 'failed', { reason_key: 'silent', silent_since: iso(2 * 24 * 60 * MIN), typical_interval: 14400, critical: true }, 80);
dev(2, 'Fensterkontakt Atelier', 'check', { reason_key: 'battery_low' }, 6, 'a_flur');
dev(3, 'Thermometer Keller', 'watch', { reason_key: 'battery_soon' }, 15);
dev(4, 'Taster Diele', 'check', { reason_key: 'silent', silent_since: iso(9 * 60 * MIN), snoozed_until: new Date(Date.now() + 86400000).toISOString() }, 5);
dev(5, 'Tür Schuppen', 'ok', { reason_key: 'ok_rhythm' }, 70);
add('sensor.pulse_probleme', 'pulse', 'problems', 'hub', '3');
// Fremdes Gerät mit leerem Akku (ohne Pulse): meldet weiter über die Akku-Quelle.
add('sensor.wetterstation_akku', 'zha', null, 'dw', '9', { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Wetterstation Batterie' });

const hass = { entities, devices, areas, callWS: () => Promise.resolve([]) };
Object.defineProperty(hass, 'states', { get: () => states });
const store = { casora_notify_read_v1: '0' };
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } };
window.casoraSecurityIcon = () => 'door-open';
window.CASORA_SETTINGS = { notify: {} };

new Function(mod)();
new Function(finden)();
new Function(basisMod)();
new Function(pulse)();
window._casoraLocalLoaded = ['00-finden.js', '01-basis.js', '14-pulse.js'];

const N = window._casoraNotify;
const rows = async () => (await N.refresh(), N.rows);
const pulseRows = (list) => list.filter((r) => /^casora:pulse/.test(r.id));
const batKeys = (list) => {
  const b = list.find((r) => r.id === 'casora:battery');
  return b ? b.seen.map((x) => x.k).sort() : [];
};

// (1) Einträge: Rauchmelder (ausgefallen, wichtig) + Fensterkontakt (Batterie); nicht „bald fällig“,
//     nicht pausiert, nicht ok.
let list = await rows();
let pr = pulseRows(list);
assert.deepEqual(pr.map((r) => r.label).sort(), ['Fensterkontakt Atelier braucht eine neue Batterie', 'Rauchmelder Dachboden antwortet nicht']);
const smoke = pr.find((r) => r.id === 'casora:pulse:d1');
assert.equal(smoke.tone, 'bad');
assert.equal(smoke.rank, 1, 'ausgefallenes wichtiges Gerät steht oben');
assert.equal(smoke.icon, 'pulse');
assert.ok(Math.abs(smoke.when - (Date.now() - 2 * 24 * 60 * MIN)) < 5000, 'Zeitpunkt = Beginn der Stille');
const win = pr.find((r) => r.id === 'casora:pulse:d2');
assert.equal(win.tone, 'warn');
assert.equal(win.value, '6 %');
assert.equal(win.icon, 'battery');
assert.equal(win.sub, 'Flur');
pr.forEach((r) => {
  assert.deepEqual(r.opens, ['casora_pulse', 'casora_popup_pulse'], 'Tipp öffnet das Pulse-Popup');
  assert.equal(r.entity, 'sensor.pulse_probleme', 'Entität der Pulse-Kachel');
});

// (2) Keine Doppelmeldung: Akkus von Fensterkontakt (gemeldet) und Taster (pausiert) fehlen in der
//     Akku-Zeile, Thermometer (nur „bald fällig“) und Wetterstation bleiben.
assert.deepEqual(batKeys(list), ['sensor.p3_akku', 'sensor.wetterstation_akku']);

// (3) Schalter aus: keine Pulse-Einträge, Akku-Quelle meldet wieder alle.
N.configureFrom({ notify_pulse: false });
list = await rows();
assert.equal(pulseRows(list).length, 0, 'Pulse aus: nichts von Pulse');
assert.deepEqual(batKeys(list), ['sensor.p2_akku', 'sensor.p3_akku', 'sensor.p4_akku', 'sensor.wetterstation_akku']);
N.configureFrom({});

// (4) „Nicht melden“ für den Status-Sensor: Eintrag weg, Akku-Quelle übernimmt das Gerät.
window.CASORA_SETTINGS = { notify: { exclude: ['sensor.p2_status'] } };
list = await rows();
assert.deepEqual(pulseRows(list).map((r) => r.id), ['casora:pulse:d1']);
assert.ok(batKeys(list).includes('sensor.p2_akku'));
window.CASORA_SETTINGS = { notify: {} };

// Studio-Auswahl „Nicht melden“: Status-Sensoren mit Art „pulse“, meldet gerade bei Problemen.
const srcs = Object.fromEntries(window.casoraNotifySources(hass, {}).map((x) => [x.entity, x]));
assert.ok(srcs['sensor.p1_status'] && srcs['sensor.p1_status'].kinds.includes('pulse') && srcs['sensor.p1_status'].active);
assert.ok(srcs['sensor.p5_status'] && !srcs['sensor.p5_status'].active, 'ok-Gerät meldet gerade nicht');
assert.ok(!srcs['sensor.p4_status'].active, 'pausiert meldet gerade nicht');

// (5) Alles gelesen; HA-Neustart: Status kurz unavailable, dann gleich mit neuem last_changed → nichts neu.
list = await rows();
store.casora_notify_read_v1 = String(Date.now() - 1000);
assert.equal(N.count, 0);
const before = JSON.parse(JSON.stringify(states));
states = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { ...v, state: 'unavailable' }]));
list = await rows();
assert.equal(pulseRows(list).length, 0, 'während des Neustarts keine Pulse-Zeilen');
states = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { ...v, last_changed: iso(MIN), last_updated: iso(MIN) }]));
list = await rows();
assert.equal(pulseRows(list).length, 2);
assert.equal(N.count, 0, 'nach dem Neustart nichts neu (auch nicht die Batterie-Meldung mit neuem last_changed)');

// Neuer Grund am selben Gerät (Batterie → still): wieder neu.
states['sensor.p2_status'] = { ...states['sensor.p2_status'], last_changed: iso(0),
  attributes: { ...states['sensor.p2_status'].attributes, reason_key: 'silent', silent_since: iso(0) } };
list = await rows();
assert.equal(N.count, 1, 'neuer Grund = neue Mitteilung');
assert.equal(pulseRows(list).find((r) => r.id === 'casora:pulse:d2').label, 'Fensterkontakt Atelier ist still');

// (6) Mehr als 3 Probleme: eine Sammelzeile.
dev(6, 'Bewegung Garage', 'check', { reason_key: 'unavailable' });
dev(7, 'Wassermelder Bad', 'failed', { reason_key: 'silent', silent_since: iso(60 * MIN) });
dev(8, 'Taster Küche', 'check', { reason_key: 'silent_new' });
hass.entities = { ...entities };   // HA: neue Registry = neues Objekt
list = await rows();
pr = pulseRows(list);
assert.equal(pr.length, 1);
assert.equal(pr[0].id, 'casora:pulse');
assert.equal(pr[0].label, '5 Geräte brauchen Aufmerksamkeit');
assert.equal(pr[0].tone, 'bad');
assert.ok(/ …$/.test(pr[0].sub) && pr[0].sub.startsWith('Rauchmelder Dachboden'), pr[0].sub);
assert.equal(pr[0].seen.length, 5);

// Ohne Pulse (keine Entitäten der Integration): nichts, kein Fehler.
for (const k of Object.keys(entities)) if (entities[k].platform === 'pulse') delete entities[k];
hass.entities = { ...entities };
list = await rows();
assert.equal(pulseRows(list).length, 0);

// Englisch: Muster für die neuen Sätze.
const en = JSON.parse(fs.readFileSync(new URL('../translations/dashboard/phrases/en.json', root), 'utf8'));
const tr = (t) => { for (const [re, out] of en.patterns) { const m = t.match(new RegExp(re)); if (m) return out.replace(/\{(\d)\}/g, (_, i) => m[i]); } return null; };
assert.equal(tr('Rauchmelder antwortet nicht'), 'Rauchmelder is not responding');
assert.equal(tr('5 Geräte brauchen Aufmerksamkeit'), '5 devices need attention');
assert.equal(tr('X braucht eine neue Batterie'), 'X needs a new battery');

console.log('ok – Glocke: Pulse-Probleme, Schalter, keine Doppelmeldung mit Akku, Ausnahmen, Neustart, Sammelzeile');
