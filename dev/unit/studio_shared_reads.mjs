// Opening the Studio read the Lovelace resource list three times (requirement check, _syncMods, card loader;
// the first two one after another, before the dashboard config) and casora/settings/get twice (scene list,
// Community tiles). Measured on a test HA: start 4 → 2 resource reads and 3 → 2 settings reads (the rest
// belong to the dashboard scripts), every further visit 2 → 1 each. Now shared for 5 s.
//   node dev/unit/studio_shared_reads.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_resources,_settingsOnce,_missingReqs,_syncMods
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => fs.readFileSync(ROOT + 'custom_components/casora/panel/' + f, 'utf8');
const { P } = await loadPanel();

const calls = [];
const fake = (answer) => ({ callWS: (m) => { calls.push(m.type); return typeof answer === 'function' ? answer(m) : Promise.resolve(answer); } });
const realNow = Date.now;
let now = 1_000_000;
Date.now = () => now;
try {
  // Resource list: one request for everything within 5 s, then asked again.
  const p = Object.create(P);
  p._hass = fake([{ url: '/hacsfiles/button-card/button-card.js', type: 'module' }]);
  const a = await Promise.all([p._resources(), p._resources(), p._resources()]);
  assert.equal(calls.filter((t) => t === 'lovelace/resources').length, 1, 'three readers, one request');
  assert.equal(a[0], a[2], 'same answer for every reader');
  now += 6000;
  await p._resources();
  assert.equal(calls.filter((t) => t === 'lovelace/resources').length, 2, 'asked again after 5 s');

  // A failed read is not kept.
  calls.length = 0;
  const q = Object.create(P);
  let fail = true;
  q._hass = fake(() => (fail ? Promise.reject({ code: 'home_assistant_error', message: 'x' }) : Promise.resolve([])));
  await assert.rejects(q._resources());
  await new Promise((r) => setImmediate(r));
  fail = false;
  assert.deepEqual(await q._resources(), [], 'read again after an error');

  // Settings: shared by the scene list and the Community tiles; null when unreadable.
  calls.length = 0;
  const s = Object.create(P);
  s._hass = fake({ settings: { community: { added: ['x'] } } });
  const [s1, s2] = await Promise.all([s._settingsOnce(), s._settingsOnce()]);
  assert.equal(calls.filter((t) => t === 'casora/settings/get').length, 1, 'one settings read');
  assert.deepEqual(s1, { community: { added: ['x'] } });
  assert.equal(s1, s2);
  now += 6000;
  await s._settingsOnce();
  assert.equal(calls.filter((t) => t === 'casora/settings/get').length, 2, 'settings asked again after 5 s');
  const e = Object.create(P);
  e._hass = { callWS: () => Promise.reject(new Error('down')) };
  assert.equal(await e._settingsOnce(), null, 'unreadable → null');
} finally { Date.now = realNow; }

// The callers use the shared reads.
const core = read('casora-panel.js');
const fn = (name) => { const a = core.indexOf('\n  async ' + name + '('); const b = core.indexOf('\n  }\n', a); return core.slice(a, b); };
assert.ok(!fn('_missingReqs').includes('type: "lovelace/resources"') && fn('_missingReqs').includes('this._resources()'), '_missingReqs → _resources');
assert.ok(!fn('_syncMods').includes('type: "lovelace/resources"') && fn('_syncMods').includes('this._resources()'), '_syncMods → _resources');
assert.ok(/this\._resources \? this\._resources\(\)/.test(read('casora-panel-umzug.js')), 'card loader → _resources');
assert.ok(/panel\._settingsOnce\(\)/.test(read('casora-panel-community.js')), 'Community tiles → _settingsOnce');
assert.ok(/panel\._settingsOnce\(\)/.test(read('casora-panel-personal.js')), 'scene list → _settingsOnce');
// Saving the settings page drops the shared copy, the hints read again.
assert.ok(/this\._casoraSettingsRead = null;\s*\n\s*this\._settingsP = null;/.test(read('casora-panel-settings.js')), 'saving forgets the shared settings');

console.log('ok studio_shared_reads');
