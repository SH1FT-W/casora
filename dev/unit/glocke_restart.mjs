// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify
// After an HA restart the bell shows no "erkannt" row. The states are a real snapshot of the mock Test HA taken right
// after a restart (dev/unit/fixtures/restart_snapshot.json), so casoraSinceMs runs on real timestamps.
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);
const snapshot = JSON.parse(fs.readFileSync(new URL('./fixtures/restart_snapshot.json', import.meta.url)));
const sensor = 'binary_sensor.test_motion';
const real = Object.fromEntries(snapshot.states.map(s => [s.entity_id, s]));
const started = Date.parse(real[sensor].last_changed);
const realNow = Date.now;
Date.now = () => started + 10 * 60000;
const seconds = ms => ms / 1000;
const run = async entries => {
  const hass = {
    states: { ...real, [sensor]: { ...real[sensor], state: 'on' } },
    entities: {}, devices: {}, areas: {},
    callWS: async message => message.type === 'logbook/get_events' ? entries : [],
  };
  globalThis.window = globalThis;
  window.CASORA_SETTINGS = { cameras: [{ entity_id: 'camera.test', detection_triggers: [sensor] }] };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = {
    readyState: 'complete', hidden: false,
    querySelector: q => q === 'home-assistant' ? { hass } : null,
    querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  globalThis.addEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.setInterval = () => 0;
  window.casoraSecurityIcon = () => 'camera';
  delete window._casoraNotify;
  new Function(mod)();
  return (await window._casoraNotify.refresh()).filter(row => row.entity === sensor);
};

assert.deepEqual(await run([
  { entity_id: sensor, state: 'off', when: seconds(started - 3600000) },
  { entity_id: sensor, state: 'on', name: 'Test motion', when: seconds(started) },
]), [], 'a sensor that is on again after the HA start gives no bell row');

const rows = await run([
  { entity_id: sensor, state: 'off', when: seconds(started + 5 * 60000) },
  { entity_id: sensor, state: 'on', name: 'Test motion', when: seconds(started + 9 * 60000) },
]);
assert.equal(rows.length, 1, 'a real detection after the start still gives a row');
assert.equal(rows[0].label, 'Test motion erkannt');
Date.now = realNow;
