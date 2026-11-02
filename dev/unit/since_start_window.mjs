// Issue 106 follow-up: casoraSinceMs never names a Casora UI helper's change (input_*.casora_*, e.g. the phone filter
// behind the group badges said „Vor 8 Min.“) and treats a few minutes around HA's start as the start, not only the
// busiest minute (helpers restored a minute before the bulk passed as real changes).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const c0 = core.indexOf('window.casoraSinceMs = '), c1 = core.indexOf('  window.casoraStateWord = ', c0);
const a0 = core.lastIndexOf('  var startC = ', c0);
assert.ok(c0 > 0 && c1 > c0 && a0 > 0 && c0 - a0 < 400, 'casoraSinceMs');
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const start = Math.floor((now - 3 * 3600000) / 60000) * 60000;
const states = {};
for (let i = 0; i < 40; i++) states['sensor.s' + i] = { last_changed: iso(start + 1000 * (i % 30)) };
for (let i = 0; i < 10; i++) states['sensor.t' + i] = { last_changed: iso(now - (i + 2) * 3600000 - 7 * 60000) };
// Many Casora helpers changed at one other moment must not move HA's start there.
for (let i = 0; i < 45; i++) states['input_boolean.casora_x' + i] = { last_changed: iso(now - 30 * 60000) };
states['input_select.casora_mobile_filter'] = { entity_id: 'input_select.casora_mobile_filter', last_changed: iso(now - 8 * 60000) };
globalThis.window = {};
globalThis.document = { querySelector: () => ({ hass: { states } }) };
new Function(core.slice(a0, c1))();
const since = window.casoraSinceMs;
assert.equal(since(states['input_select.casora_mobile_filter']), null, 'a Casora helper is never a since time');
assert.equal(since({ entity_id: 'sensor.a', last_changed: iso(start + 5000) }), null, 'the start minute');
assert.equal(since({ entity_id: 'input_boolean.guest', last_changed: iso(start - 60000 + 20000) }), null, 'a minute before the start');
assert.equal(since({ entity_id: 'sensor.b', last_changed: iso(start + 2 * 60000) }), null, 'shortly after the start');
assert.equal(since({ entity_id: 'sensor.c', last_changed: iso(now - 30 * 60000) }), now - 30 * 60000, 'helpers do not make their minute the start');
assert.equal(since({ entity_id: 'sensor.d', last_changed: iso(start + 20 * 60000) }), start + 20 * 60000, 'a real change after the start');
console.log('since_start_window: ok');
