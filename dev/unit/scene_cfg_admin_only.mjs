// Issue #244: the scene core read every editor scene's configuration (GET config/scene/config/<id>) for
// every user. Home Assistant answers that admin-only API with 401 for other users; the requests left
// in parallel, so with ip_ban enabled the device of a family member got banned before the first 401
// could stop the rest. Expected: only an admin's browser asks; a non-admin (or an unknown user) never.
//   node dev/unit/scene_cfg_admin_only.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_scene_core
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const T = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const CORE = body(T.casora_scene_core.variables.casora_scene_core_guard.value);

const ids = ['scene.sleep_bedroom', 'scene.office_off', 'scene.downstairs_off'];
const run = async (user) => {
  const calls = [];
  const states = {};
  const entities = {};
  ids.forEach((id, i) => {
    states[id] = { entity_id: id, state: '2026-11-25T10:00:00Z', attributes: { id: 'cfg' + i, entity_id: ['light.x'] } };
    entities[id] = { entity_id: id, platform: 'homeassistant' };
  });
  const hass = {
    user, states, entities,
    callApi: (m, url) => {
      calls.push(m + ' ' + url);
      if (!user || !user.is_admin) return Promise.reject({ status_code: 401 });
      return Promise.resolve({ entities: { 'light.x': { state: 'on' } } });
    },
    callWS: () => Promise.resolve({}),
  };
  const store = {};
  const window = {};
  const document = {
    querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
    addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} },
  };
  const localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };
  new Function('window', 'document', 'localStorage', 'states', 'hass', 'variables', 'entity', CORE)(
    window, document, localStorage, states, hass, {}, null);
  const SC = window._casoraSC;
  SC.prefetch(ids, states);
  ids.forEach((id) => SC.isActive(id, states));
  await new Promise((r) => setTimeout(r, 0));
  return calls.filter((c) => c.includes('config/scene/config'));
};

assert.deepEqual(await run({ id: 'u1', is_admin: false }), [], 'non-admin: no config request (401 → ip_ban)');
assert.deepEqual(await run(undefined), [], 'user not known yet: no config request');
assert.equal((await run({ id: 'u0', is_admin: true })).length, ids.length, 'admin still reads the configs');
console.log('ok scene_cfg_admin_only');
