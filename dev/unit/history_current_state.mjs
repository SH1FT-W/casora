// Issue #106: a window's history page said „Geschlossen · Seit 18:14“ on the stage while its history ended on
// „Geöffnet · seitdem“ and the 24 h figures counted the whole day as open – HA's history lacked the latest change
// (recorder behind or not recording). The newest row must be the current state, the figures must follow it, and the
// stage's „Seit …“ comes from the one shared source the popup head uses (casoraSinceMs, nothing after HA's start).
// Checked for a window, a door, a lock, a switch, a cover and a motion sensor.
//   node dev/unit/history_current_state.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const MIN = 60000, now = Date.now(), start24 = now - 24 * 60 * MIN;
const iso = (t) => new Date(t).toISOString();
const states = {}, entities = {};
const add = (id, state, attrs, lcAgo) => {
  states[id] = { entity_id: id, state, attributes: Object.assign({ friendly_name: id }, attrs || {}), last_changed: iso(now - lcAgo) };
  entities[id] = { entity_id: id, platform: 'demo' };
};
// [entity, state now, active state HA's history ended on, attributes]
const CASES = [
  ['binary_sensor.window', 'off', 'on', { device_class: 'window' }],
  ['binary_sensor.door', 'off', 'on', { device_class: 'door' }],
  ['binary_sensor.motion', 'off', 'on', { device_class: 'motion' }],
  ['lock.front', 'locked', 'unlocked', {}],
  ['switch.plug', 'off', 'on', {}],
  ['cover.garage', 'closed', 'open', { device_class: 'garage' }],
];
for (const [id, s, , a] of CASES) add(id, s, a, 4 * 60 * MIN);
// HA's answer: the state at the window's start (open since before it) and nothing after – the close 4 h ago is missing.
const hist = (id) => [{ entity_id: id, state: CASES.find((c) => c[0] === id)[2], last_changed: iso(start24) }];
const hass = { states, entities, devices: {}, language: 'de',
  callApi: (m, url) => Promise.resolve([hist(decodeURIComponent(url.match(/filter_entity_id=([^&]+)/)[1]))]) };

globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
window.CASORA_ACTIVE_STATES = new Set(['on', 'open', 'opening', 'playing', 'unlocked', 'unlocking']);
window._casoraUI = {
  stage: (kind, o) => '<stage facts="' + (o.facts || []).map((f) => f.label + ' ' + f.value).join('|') + '">' + (o.extra || '') + '</stage>',
  line: () => '', segments: () => '', label: (t) => '<h>' + t + '</h>',
  group: (rows, head) => '<g>' + rows.map((r) => r.label + '=' + r.value).join(';') + '</g>',
};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8'))();
const Z = window._casoraZiele;

const rowsOf = (id) => {
  const html = Z.sec('m_tl', id, '24h', states, hass, null);
  return [...html.matchAll(/font-weight:700;color:[^>]*>([^<]*)<\/div>(?:<div[^>]*>([^<]*)<\/div>)?/g)].map((m) => ({ word: m[1], sub: m[2] || '' }));
};

for (const [id] of CASES) Z.history(hass, id, '24h', null);
await new Promise((r) => setImmediate(r));

for (const [id, s] of CASES) {
  const r = rowsOf(id);
  const word = Z.stateWord(hass, id, s);
  assert.ok(r.length >= 1, id + ': history rows');
  assert.equal(r[0].word, word, id + ': newest row is the current state (' + word + ')');
  assert.equal(r[0].sub, 'seitdem', id + ': newest row runs until now');
  assert.match(r[1] ? r[1].sub : '', /^für 20 Std\./, id + ': the active span ended with the change 4 h ago');
}
// The oldest row is the state held when the 24 h began: it names no time (the period's start is no change), the
// newest row keeps its real time.
for (const [id] of CASES) {
  const times = [...Z.sec('m_tl', id, '24h', states, hass, null).matchAll(/tabular-nums;[^>]*>(?:<div[^>]*>[^<]*<\/div>)?([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.equal(times[times.length - 1], 'Früher', id + ': the row from the window start says „Früher“, not its time');
  assert.match(times[0], /^\d\d:\d\d$/, id + ': the newest row keeps its time');
}
// 24 h figures of a binary sensor: open once, for 20 h – not the whole day.
const vals = Z.sec('m_vals', 'binary_sensor.window', '24h', states, hass, null);
assert.match(vals, /=1×/, 'window: opened once');
assert.ok(!/24 Std\./.test(vals), 'window: not open the whole day: ' + vals);
assert.match(vals, /Insgesamt [^=]*=20 Std\./, 'window: open 20 h in total');

// Time source: the stage says the time the head says (casoraSinceMs); none after HA's start.
const sinceOf = (id) => (Z.sec('m_stage', id, '24h', states, hass, null).match(/facts="([^"]*)"/) || [])[1];
window.casoraSinceMs = () => null;
assert.equal(sinceOf('binary_sensor.window'), '', 'no „Seit“ when last_changed is only HA\'s start');
const shared = now - 95 * MIN;
window.casoraSinceMs = () => shared;
const d = new Date(shared), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
assert.match(sinceOf('binary_sensor.window'), new RegExp('Seit .*' + hm), 'stage uses the shared since time');
console.log('history_current_state: ok');
