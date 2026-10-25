// Phone room filter (casora-core.js window._casoraFilter.apply), without HA. Each device keeps its own room and
// rewrites input_select.casora_mobile_filter on the way to the cards. The filter overlay rewrites the hass, the smart
// row inside it gets that rewritten hass and rewrites it again: with a badge row token (casora_tok, set when the
// server's room badges arrive) that made a new entity object on each pass, so on every change in the house all
// phone cards at the helper redrew (lag report after 26.10.60b2, ~27 redraws per change of an unrelated entity).
// Expected: one entity object per value, a rewritten hass passes unchanged, and the value still follows set().
//   node dev/unit/mobile_filter_apply.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('(function () {\n  if (window._casoraFilter) return;');
const b = core.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'filter block found');
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.document = { querySelector: () => null };
new Function(core.slice(a, b + 6))();
const F = window._casoraFilter;
const ID = 'input_select.casora_mobile_filter';

const helper = { entity_id: ID, state: 'all', attributes: { options: ['all', 'room_a'] } };
let hass = { states: { [ID]: helper, 'sensor.x': { state: '1' } } };
const next = () => { hass = { ...hass, states: { ...hass.states, 'sensor.x': { state: String(Math.random()) } } }; return hass; };

// HA's value and no badge token: the hass passes as it is
assert.equal(F.apply(hass), hass, 'nothing to rewrite');

// Badge token set (as the phone does once its room badges arrived)
F.bump();
const seen = new Set();
for (let i = 0; i < 6; i++) {
  const outer = F.apply(next());
  const inner = F.apply(outer);           // smart row inside the filter overlay
  assert.equal(inner, outer, 'a rewritten hass passes unchanged');
  seen.add(outer.states[ID]);
  assert.equal(outer.states[ID].attributes.casora_tok, 1);
  assert.equal(outer.states['sensor.x'], hass.states['sensor.x'], 'the other states are HA\'s');
}
assert.equal(seen.size, 1, 'one helper object across updates (cards at it do not redraw): ' + seen.size);

// Own room on this device: the value follows, again one object across updates
F.set('room_a');
const r1 = F.apply(next()), r2 = F.apply(F.apply(next()));
assert.equal(r1.states[ID].state, 'room_a');
assert.equal(r2.states[ID], r1.states[ID], 'same object for the same value');
// HA's helper changes (another device picked): rewritten from the new one, still this device's room
hass = { ...hass, states: { ...hass.states, [ID]: { ...helper, state: 'room_a', attributes: { options: ['all', 'room_a', 'room_b'] } } } };
const r3 = F.apply(hass);
assert.equal(r3.states[ID].state, 'room_a');
assert.deepEqual(r3.states[ID].attributes.options, ['all', 'room_a', 'room_b'], 'built from HA\'s new helper');
F.set('all');
assert.equal(F.apply(F.apply(next())).states[ID].state, 'all', 'back to all');
console.log('ok mobile_filter_apply');
