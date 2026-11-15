// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);
const id = 'binary_sensor.test_person';
const event = 'event.test_motion';
const now = Date.now() / 1000;
const entries = [
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
    [event]: { entity_id: event, state: entries[4].state, attributes: { friendly_name: 'Motion' } },
  },
  entities: {}, devices: {}, areas: {},
  callWS: async message => { calls.push(message); return message.type === 'logbook/get_events' ? entries : []; },
};
globalThis.window = globalThis;
window.CASORA_SETTINGS = { cameras: [{ entity_id: 'camera.test', detection_triggers: [id, event] }] };
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
assert.ok(calls.some(c => c.type === 'logbook/get_events' && c.entity_ids.includes(id)), 'listed detection is watched');
const detections = rows.filter(row => row.entity === id);
assert.equal(detections.length, 2, 'each off-to-on detection has its own non-opening row');
assert.ok(detections.every(row => row.count === 1), 'detection rows do not become expandable stacks');
assert.equal(detections[0].label, 'Person erkannt');
assert.equal(detections[0].opens, 'casora:detection', 'detection row uses the non-opening target');
assert.equal(rows.find(row => row.entity === event)?.label, 'Motion erkannt', 'event detection uses its own name');
