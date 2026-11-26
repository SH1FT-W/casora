// Repeated detections of one listed detection trigger stack into one bell row (newest time, a count, a timeline on
// tap); a single detection row stays untappable; a busy trigger no longer pushes other news out of the bell.
//   node dev/unit/glocke_camera_stapel.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,stackUp,rebuild,sections
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);
const trig = 'binary_sensor.test_person';
const lone = 'binary_sensor.test_lone';
const lock = 'lock.test_door';
const now = Date.now() / 1000;
const entries = [];
for (let i = 0; i < 40; i++) {
  entries.push({ entity_id: trig, state: 'off', when: now - 3000 + i * 60 });
  entries.push({ entity_id: trig, state: 'on', name: 'Person', when: now - 2990 + i * 60 });
}
entries.push({ entity_id: lone, state: 'off', when: now - 3500 });
entries.push({ entity_id: lone, state: 'on', name: 'Lone', when: now - 3490 });
entries.push({ entity_id: lock, state: 'unlocked', name: 'Test door', when: now - 3600 });
const hass = {
  states: {
    [trig]: { entity_id: trig, state: 'off', attributes: { friendly_name: 'Person' } },
    [lone]: { entity_id: lone, state: 'off', attributes: { friendly_name: 'Lone' } },
    [lock]: { entity_id: lock, state: 'unlocked', last_changed: new Date((now - 3600) * 1000).toISOString(), attributes: { friendly_name: 'Test door' } },
  },
  entities: {}, devices: {}, areas: {},
  callWS: async m => m.type === 'logbook/get_events' ? entries : (m.type === 'history/history_during_period' ? {} : []),
};
globalThis.window = globalThis;
window.CASORA_SETTINGS = { cameras: [{ entity_id: 'camera.test', detection_triggers: [trig, lone] }] };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: q => q === 'home-assistant' ? { hass } : null,
  querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'door-open';
const drawn = [];
window._casoraUI = { tokens: { font: 'x', ink3: 'x' }, group: rows => { drawn.push(...rows); return ''; } };
new Function(mod)();
const rows = await window._casoraNotify.refresh();

const stack = rows.filter(r => r.entity === trig);
assert.equal(stack.length, 1, '40 detections of one trigger make one bell row');
assert.equal(stack[0].count, 40, 'the row carries the count');
assert.equal(stack[0].label, 'Person erkannt');
assert.equal(stack[0].when, Math.max(...stack[0].members.map(m => m.when)), 'the row shows the newest time');
assert.ok(rows.some(r => r.entity === lock), 'other news stays in the bell when one trigger fires 40 times');
const single = rows.filter(r => r.entity === lone);
assert.equal(single.length, 1);
assert.equal(single[0].count, 1);

window._casoraNotify.sections();
const stackRow = drawn.find(r => r.label === 'Person erkannt');
const singleRow = drawn.find(r => r.label === 'Lone erkannt');
assert.equal(stackRow.tappable, true, 'a stacked detection row is tappable (opens the timeline)');
assert.equal(stackRow.entity, null, 'a stacked detection row opens no device');
assert.equal(singleRow.tappable, false, 'a single detection row is not tappable');
assert.equal(stackRow.stackOpen, false, 'a stacked detection row starts closed');

// The tap on a stacked row opens its stack (bindOpens flips _openStacks[stackKey]); the open stack is a timeline of the
// detections under the newest one. The test flips the same switch the click handler flips, there is no DOM here.
const key = stack[0].stackKey;
window._casoraNotify.stack(key, true);
drawn.length = 0;
window._casoraNotify.sections();
assert.equal(drawn.find(r => r.label === 'Person erkannt').stackOpen, true, 'after the tap the stacked row is open');
const tl = window._casoraNotify.timeline(key);
assert.equal(tl.length, 39, 'the timeline holds every older detection once');
assert.ok(tl.every(e => e.m.label === 'Person erkannt' && e.m.entity === trig), 'each entry is a detection of the trigger');
assert.ok(tl.every(e => e.m.when <= stack[0].when), 'no entry is newer than the row');
window._casoraNotify.stack(key, false);
assert.equal(window._casoraNotify.shown.filter(r => r.entity === trig || r.stackKey === key).length, 1, 'a second tap closes it again');
console.log('ok   glocke_camera_stapel');
