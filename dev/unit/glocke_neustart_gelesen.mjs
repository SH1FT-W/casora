// Glocke nach einem HA-Neustart (1.0.5): „2 Updates verfügbar“ stand wieder unter „Neu“, weil der
// Eintrag last_changed als Zeitpunkt nahm. Jetzt: erster Sichtungszeitpunkt je Inhalt (Entität +
// latest_version) im localStorage. Gleiche Updates bleiben gelesen, eine neue Version ist neu.
// Dasselbe für Akku schwach und Sicherheitsmeldungen.
//   node dev/unit/glocke_neustart_gelesen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const upd = (id, ver, min) => ({ entity_id: id, state: 'on', last_changed: ago(min), last_updated: ago(min),
  attributes: { friendly_name: id, installed_version: '1.0', latest_version: ver } });
const bat = (id, min) => ({ entity_id: id, state: '5', last_changed: ago(min), last_updated: ago(min),
  attributes: { friendly_name: id, device_class: 'battery' } });
const leak = (id, min) => ({ entity_id: id, state: 'on', last_changed: ago(min), last_updated: ago(min),
  attributes: { friendly_name: id, device_class: 'moisture' } });

let states = {
  'update.a': upd('update.a', '2.0', 300),
  'update.b': upd('update.b', '3.0', 240),
  'sensor.bat_a': bat('sensor.bat_a', 300),
  'binary_sensor.leak': leak('binary_sensor.leak', 200),
};
const hass = { callWS: () => Promise.resolve([]), entities: {}, devices: {}, areas: {} };
Object.defineProperty(hass, 'states', { get: () => states });

// Gelesen vor 60 Min.: nach allen drei Meldungen.
const store = { casora_notify_read_v1: String(Date.now() - 60 * 60000) };
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
window.casoraSecurityIcon = () => 'window-open';
new Function(mod)();

const N = window._casoraNotify;
const unreadIds = (rows) => rows.filter((r) => r.when > Number(store.casora_notify_read_v1)).map((r) => r.id).sort();

let rows = await N.refresh();
assert.ok(rows.some((r) => r.id === 'casora:updates' && r.label === '2 Updates verfügbar'));
assert.deepEqual(unreadIds(rows), [], 'vor dem Neustart alles gelesen');
assert.ok(store.casora_notify_seen_v1, 'Sichtungs-Merker geschrieben');

// Neustart: alles kurz unavailable (Zeilen weg), dann gleiche Inhalte mit neuem last_changed.
states = Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { ...v, state: 'unavailable' }]));
rows = await N.refresh();
assert.ok(!rows.some((r) => r.id === 'casora:updates'), 'während des Neustarts keine Update-Zeile');
states = {
  'update.a': upd('update.a', '2.0', 1),
  'update.b': upd('update.b', '3.0', 1),
  'sensor.bat_a': bat('sensor.bat_a', 1),
  'binary_sensor.leak': leak('binary_sensor.leak', 1),
};
rows = await N.refresh();
assert.ok(rows.some((r) => r.id === 'casora:updates' && r.label === '2 Updates verfügbar'));
assert.deepEqual(unreadIds(rows), [], 'nach dem Neustart nichts neu');
assert.equal(N.count, 0);

// Ein Update installiert: weiter gelesen.
delete states['update.b'];
rows = await N.refresh();
assert.deepEqual(unreadIds(rows), [], 'weniger Updates: nicht neu');

// Neue Version (nur last_updated ändert sich): wieder neu.
states['update.a'] = { ...upd('update.a', '2.1', 1), last_changed: ago(400) };
rows = await N.refresh();
assert.deepEqual(unreadIds(rows), ['casora:updates'], 'neue latest_version: neu');

// Weiteres Update (andere Entität): neu.
store.casora_notify_read_v1 = String(Date.now());
await new Promise((r) => setTimeout(r, 5));
states['update.c'] = upd('update.c', '9.0', 0);
rows = await N.refresh();
assert.deepEqual(unreadIds(rows), ['casora:updates'], 'neue Entität: neu');
console.log('glocke_neustart_gelesen: ok');
