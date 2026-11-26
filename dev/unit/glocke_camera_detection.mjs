// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);
const id = 'binary_sensor.test_person';
const event = 'event.test_motion';
const idle = 'binary_sensor.test_idle';
const restart = 'binary_sensor.test_restart';
const absent = 'binary_sensor.test_absent';
const now = Date.now() / 1000;
const entries = [
  { entity_id: absent, state: 'on', name: 'Absent history', when: now - 115 },
  { entity_id: idle, state: 'on', name: 'Idle sensor', when: now - 110 },
  { entity_id: restart, state: 'on', name: 'Restart sensor', when: now - 105 },
  { entity_id: id, state: 'off', when: now - 100 },
  { entity_id: id, state: 'on', name: 'Person', when: now - 90 },
  { entity_id: id, state: 'unavailable', when: now - 80 },
  { entity_id: id, state: 'on', name: 'Person', when: now - 70 },
  { entity_id: event, state: new Date((now - 60) * 1000).toISOString(), name: 'Motion', when: now - 60 },
  { entity_id: id, state: 'off', when: now - 50 },
  { entity_id: id, state: 'on', name: 'Person', when: now - 40 },
];
const calls = [];
const hass = {
  states: {
    [id]: { entity_id: id, state: 'on', attributes: { friendly_name: 'Person' } },
    [event]: { entity_id: event, state: entries[7].state, attributes: { friendly_name: 'Motion' } },
    [absent]: { entity_id: absent, state: 'on', attributes: { friendly_name: 'Absent history' } },
    [idle]: { entity_id: idle, state: 'on', attributes: { friendly_name: 'Idle sensor' } },
    [restart]: { entity_id: restart, state: 'on', attributes: { friendly_name: 'Restart sensor' } },
  },
  entities: {}, devices: {}, areas: {},
  callWS: async message => {
    calls.push(message);
    if (message.type === 'logbook/get_events') return entries;
    if (message.type === 'history/history_during_period') return {
      [idle]: [{ s: 'off', lu: now - 110000 }],
      [restart]: [{ s: 'unavailable', lu: now - 110000 }],
    };
    return [];
  },
};
globalThis.window = globalThis;
window.CASORA_SETTINGS = { cameras: [{ entity_id: 'camera.test', detection_triggers: [id, event, idle, restart, absent] }] };
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
new Function(mod)();
const rows = await window._casoraNotify.refresh();
assert.ok(calls.some(c => c.type === 'history/history_during_period' && c.include_start_time_state && c.entity_ids.includes(idle)), 'history requests the state at the start of the logbook window');
assert.equal(rows.find(row => row.entity === idle)?.label, 'Idle sensor erkannt', 'idle-off predecessor before logbook window is recognized');
assert.equal(rows.find(row => row.entity === restart), undefined, 'unavailable before logbook window is not a detection');
assert.equal(rows.find(row => row.entity === absent), undefined, 'missing predecessor does not invent a detection');
assert.ok(calls.some(c => c.type === 'logbook/get_events' && c.entity_ids.includes(id)), 'listed detection is watched');
const detections = rows.filter(row => row.entity === id);
assert.equal(detections.length, 1, 'repeated detections of one trigger stack into one row');
assert.equal(detections[0].count, 2, 'the stack counts each off-to-on detection');
assert.equal(detections[0].label, 'Person erkannt');
assert.ok(!detections[0].opens, 'the stack opens no device');
assert.equal(rows.find(row => row.entity === event)?.label, 'Motion erkannt', 'event detection uses its own name');
