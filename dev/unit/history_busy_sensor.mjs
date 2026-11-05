// A busy sensor (PM2.5, CO2, humidity) changes every few seconds. Its 7/30-day history takes longer to load than the
// gap between two changes; every change started a new request and the answer of the previous one was dropped, so
// "Letzte 7 Tage" / "Letzte 30 Tage" said "Wird geladen …" for as long as the popup was open. An answer that arrives
// after the state moved on must still be shown.
//   node dev/unit/history_busy_sensor.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const now = Date.now(), iso = (t) => new Date(t).toISOString();
const id = 'sensor.pm25';
const states = { [id]: { entity_id: id, state: '0.8', attributes: { unit_of_measurement: 'µg/m³', state_class: 'measurement' }, last_changed: iso(now - 5000) } };
const pending = [];
let calls = 0;
const hass = { states, entities: { [id]: { entity_id: id, platform: 'demo' } }, devices: {}, language: 'de',
  callApi: () => { calls++; return new Promise((res) => pending.push(res)); } };

globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
window._casoraUI = { stage: () => '', line: () => '', segments: () => '', label: (t) => t, group: (rows) => rows.map((r) => r.label).join(';') };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8'))();
const Z = window._casoraZiele;
const answer = [[{ state: '12', last_changed: iso(now - 3 * 864e5) }, { state: '0.8', last_changed: iso(now - 5000) }]];
const tick = () => new Promise((r) => setImmediate(r));

for (const span of ['7d', '30d']) {
  pending.length = 0;
  assert.equal(Z.history(hass, id, span, null), null, span + ': nothing yet');
  // The sensor reports a new value before the answer is there.
  states[id] = Object.assign({}, states[id], { state: '0.9', last_changed: iso(Date.now()) });
  Z.history(hass, id, span, null);
  pending[0](answer);
  await tick();
  const rows = Z.history(hass, id, span, null);
  assert.ok(rows && rows.length >= 2, span + ': the answer that came in after the change is shown, not "Wird geladen" (got ' + JSON.stringify(rows) + ')');
  assert.equal(rows[rows.length - 1].s, '0.9', span + ': newest row is the current value');
}
console.log('history_busy_sensor: ok (' + calls + ' requests)');
