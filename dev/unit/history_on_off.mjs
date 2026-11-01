// History page of a two-state entity (#104): the timeline row says how long THAT state lasted („für …“, not
// „nach …“ which read as the time since the previous change), active states get a filled dot and idle ones an
// empty ring, the band draws only the active spans, and the status ring is empty while the entity is off.
// Applies to every entity that switches between an active and an idle state (light, switch, door, person …).
//   node dev/unit/history_on_off.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const MIN = 60000, now = Date.now();
const states = {}, entities = {};
const add = (id, state, attrs) => {
  states[id] = { entity_id: id, state, attributes: Object.assign({ friendly_name: id }, attrs || {}), last_changed: new Date(now - 12 * MIN).toISOString() };
  entities[id] = { entity_id: id, platform: 'demo' };
};
add('light.kitchen', 'off');
add('binary_sensor.door', 'off', { device_class: 'door' });
add('person.someone', 'not_home');
add('lock.front', 'locked');
add('sensor.mode', 'eco');
const hass = { states, entities, devices: {}, language: 'de', callApi: () => new Promise(() => {}) };

globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
// Casora's shared active states (casora-core.js).
window.CASORA_ACTIVE_STATES = new Set(['on', 'open', 'opening', 'playing', 'unlocked', 'unlocking', 'cleaning', 'returning',
  'cool', 'heat', 'washing', 'rinsing', 'spinning', 'drying', 'running', 'active', 'problem']);
// Minimal UI kit: the stage reports its tone and passes the band through.
window._casoraUI = {
  stage: (kind, o) => '<stage tone="' + o.tone + '">' + (o.extra || '') + '</stage>',
  line: () => '', segments: () => '', label: (t) => '<h>' + t + '</h>', group: () => '',
};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8'))();
const Z = window._casoraZiele;

// on → off after 21 min → on after 1 h 32 → off 12 min ago (oldest first, as HA returns it).
const t0 = now - 150 * MIN;
const seq = (on, off) => [{ s: on, t: t0 }, { s: off, t: t0 + 21 * MIN }, { s: on, t: t0 + 113 * MIN }, { s: off, t: now - 12 * MIN }];
const H = {
  'light.kitchen': seq('on', 'off'), 'binary_sensor.door': seq('on', 'off'), 'person.someone': seq('home', 'not_home'),
  'lock.front': seq('unlocked', 'locked'), 'sensor.mode': [{ s: 'eco', t: t0 }, { s: 'comfort', t: t0 + 21 * MIN }],
};
Z.history = (h, id) => H[id];

const rowsOf = (id) => {
  const html = Z.sec('m_tl', id, '24h', states, hass, null);
  return [...html.matchAll(/class="cz-dot (on|off)"[\s\S]*?font-weight:700;color:[^>]*>([^<]*)<\/div>(?:<div[^>]*>([^<]*)<\/div>)?/g)]
    .map((m) => ({ dot: m[1], word: m[2], sub: m[3] || '' }));
};

for (const id of ['light.kitchen', 'binary_sensor.door', 'person.someone', 'lock.front']) {
  const r = rowsOf(id);
  assert.equal(r.length, 4, id + ': four rows');
  // Newest first: off since 12 min, on 25 min, off 1 h 32 (21 → 113 min), on 21 min.
  assert.deepEqual(r.map((x) => x.dot), ['off', 'on', 'off', 'on'], id + ': idle = ring, active = filled dot');
  assert.deepEqual(r.map((x) => x.sub), ['seitdem', 'für 25 Min.', 'für 1 Std. 32 Min.', 'für 21 Min.'],
    id + ': each row is the duration of its own state');

  const stage = Z.sec('m_stage', id, '24h', states, hass, null);
  assert.match(stage, /tone="off"/, id + ': ring empty while off');
  const band = stage.match(/<div class="cz-band"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.equal((band.match(/<i /g) || []).length, 2, id + ': only the two active spans are drawn');
  assert.equal((band.match(/<i class="on"/g) || []).length, 2, id + ': active spans marked');
  assert.ok(!/opacity:/.test(band), id + ': no alternating shades');
}

// Active now: the ring is full.
states['light.kitchen'].state = 'on';
assert.match(Z.sec('m_stage', 'light.kitchen', '24h', states, hass, null), /tone="good"/, 'ring full while on');

// Free-text states stay as before: every change a filled dot, every span drawn.
const m = rowsOf('sensor.mode');
assert.deepEqual(m.map((x) => x.dot), ['on', 'on'], 'text sensor: filled dots');
assert.equal(Z.isTwoState(states['sensor.mode']), false);
console.log('history_on_off: ok');
