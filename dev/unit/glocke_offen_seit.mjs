// Glocke nach einem HA-Neustart (1.0.5): offene Fenster standen als „Seit 10 Min.“ unter „Neu“,
// weil last_changed nach unavailable → on neu beginnt, und zweimal nur „Fenster ist offen“.
// Jetzt: Dauer aus dem Merker der Integration (sensor.casora_media_paused, Attribut contacts),
// Gelesenes bleibt gelesen, gleiche Namen bekommen den Raum davor.
//   node dev/unit/glocke_offen_seit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const win = (id, name, min) => ({ entity_id: id, state: 'on', last_changed: ago(min), attributes: { friendly_name: name, device_class: 'window' } });
// Nach dem Neustart: alle seit 12 Min. „on“, A und B wirklich offen seit 2 bzw. 3 Std.
const states = {
  'binary_sensor.window_a': win('binary_sensor.window_a', 'Fenster', 12),
  'binary_sensor.window_b': win('binary_sensor.window_b', 'Fenster', 12),
  'binary_sensor.window_c': win('binary_sensor.window_c', 'Bürofenster', 12),
  'sensor.casora_media_paused': { entity_id: 'sensor.casora_media_paused', state: '0', attributes: {
    players: {},
    contacts: {
      'binary_sensor.window_a': { since: ago(120) },
      'binary_sensor.window_b': { since: ago(180) },
      // Merkwert nach last_changed (passt nicht zum Zustand) zählt nicht.
      'binary_sensor.window_c': { since: ago(1) },
    },
  } },
};
const hass = { states, callWS: () => Promise.resolve([]),
  entities: { 'binary_sensor.window_a': { device_id: 'd1' }, 'binary_sensor.window_b': { area_id: 'room_b' },
    'binary_sensor.window_c': { area_id: 'room_c' } },
  devices: { d1: { area_id: 'room_a' } },
  areas: { room_a: { name: 'Schlafzimmer' }, room_b: { name: 'Waschküche' }, room_c: { name: 'Büro' } } };

// Vor dem Neustart gelesen: Wasserstand vor 90 Min. (nach beiden echten Öffnungen).
const store = { casora_notify_read_v1: String(Date.now() - 90 * 60000) };
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

const rows = await window._casoraNotify.refresh();
const by = Object.fromEntries(rows.filter((r) => r.entity).map((r) => [r.entity, r]));
assert.equal(by['binary_sensor.window_a'].label, 'Schlafzimmer Fenster ist offen');
assert.equal(by['binary_sensor.window_b'].label, 'Waschküche Fenster ist offen');
assert.equal(by['binary_sensor.window_c'].label, 'Bürofenster ist offen', 'eindeutiger Name bleibt ohne Raum');
assert.equal(by['binary_sensor.window_a'].sub, 'seit 2 Std.');  // D13 (1.2): klein wie mitten im Satz
assert.equal(by['binary_sensor.window_b'].sub, 'seit 3 Std.');
assert.equal(by['binary_sensor.window_c'].sub, 'seit 12 Min.', 'Merkwert nach last_changed: last_changed');
// Gelesen bleibt gelesen: nur der wirklich neue Eintrag (C, seit 12 Min.) zählt als neu.
assert.equal(window._casoraNotify.count, 1, 'nur ein ungelesener Eintrag');
const w = Number(store.casora_notify_read_v1);
assert.deepEqual(rows.filter((r) => r.entity && r.when > w).map((r) => r.entity), ['binary_sensor.window_c']);

// Geschlossen oder ohne Merker: last_changed.
const closed = { ...states['binary_sensor.window_a'], state: 'off' };
assert.equal(window._casoraOpenSince(closed, states), closed.last_changed);
assert.equal(window._casoraOpenSince(states['binary_sensor.window_a'], {}), states['binary_sensor.window_a'].last_changed);
console.log('glocke_offen_seit: ok');
