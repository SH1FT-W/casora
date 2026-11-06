// The inspector draws every condition editor at once; each text entity without a state list asked the history
// on its own (test house: nine history requests in a row when the Studio opened). Entities asked for in the
// same task now go out as one request; each caller still gets its own answer.
//   node dev/unit/studio_cond_history_batch.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#condLoadSeen,condStates
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const { I } = await loadPanel();
const { condLoadSeen, condStates } = I;
assert.equal(typeof condLoadSeen, 'function');

const calls = [];
const hist = {
  'sensor.cb_mode': [{ s: 'eco' }, { s: 'boost' }, { s: 'unavailable' }, { s: 'eco' }],
  'sensor.cb_phase': [{ s: 'rinse' }],
  'sensor.cb_empty': [],
};
const hass = { states: {}, callWS: (m) => { calls.push(m); return Promise.resolve(Object.fromEntries(m.entity_ids.map((id) => [id, hist[id] || []]))); } };

const got = await Promise.all(['sensor.cb_mode', 'sensor.cb_phase', 'sensor.cb_empty', 'sensor.cb_mode'].map((id) => condLoadSeen(hass, id)));
assert.equal(calls.length, 1, 'one history request for one draw');
assert.equal(calls[0].type, 'history/history_during_period');
assert.deepEqual(calls[0].entity_ids, ['sensor.cb_mode', 'sensor.cb_phase', 'sensor.cb_empty'], 'each entity once');
assert.equal(calls[0].minimal_response, true);
assert.equal(calls[0].no_attributes, true);
assert.deepEqual(got, [true, true, false, false], 'each caller its own answer; asked again = nothing new');
// What the history held is offered as values.
hass.states['sensor.cb_mode'] = { state: 'eco', attributes: {} };
const k = condStates(hass, 'sensor.cb_mode');
for (const v of ['eco', 'boost']) assert.ok((k.values || []).includes(v), 'history value offered: ' + v);

// A later draw is a new request.
await condLoadSeen(hass, 'sensor.cb_later');
assert.equal(calls.length, 2, 'a later draw asks again');
assert.deepEqual(calls[1].entity_ids, ['sensor.cb_later']);

// The request fails: every caller hears "nothing", nobody throws.
const bad = { states: {}, callWS: () => Promise.reject(new Error('recorder off')) };
assert.deepEqual(await Promise.all([condLoadSeen(bad, 'sensor.cb_x'), condLoadSeen(bad, 'sensor.cb_y')]), [false, false]);

console.log('ok studio_cond_history_batch');
