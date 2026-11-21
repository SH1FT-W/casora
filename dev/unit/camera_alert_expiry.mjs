// @deckt: dashboards/casora/button_card_templates.json#global
// A Ring-style camera alert must expire even when sensor.time is absent,
// and also when sensor.time exists but has no usable value (unavailable, unknown, empty).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testhaus } from './lib/testhaus.mjs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
const run = (source, card, hass, entity, variables) =>
  new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))
    .call(card, hass, hass.states, entity, variables);
globalThis.window = globalThis;
// The clock helpers of casora-core.js (the same slice the clock test uses): the templates ask
// window.casoraTimeUnusable whether a sensor.time has a usable value.
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const coreFrom = core.indexOf('    window.casoraClockText = function');
const coreTo = core.indexOf('    if (!customElements.get(\'casora-clock\'))', coreFrom);
assert.ok(coreFrom > 0 && coreTo > coreFrom, 'clock helpers in casora-core.js');
new Function('window', 'document', core.slice(coreFrom, coreTo))(globalThis, { querySelector: () => ({ hass: null }) });
const realNow = Date.now;
let now = Date.parse('2026-01-01T12:00:00Z');
Date.now = () => now;
const pending = new Map();
let nextId = 0;
globalThis.setTimeout = (fn, delay) => { const id = ++nextId; pending.set(id, { fn, at: now + delay }); return id; };
globalThis.clearTimeout = (id) => pending.delete(id);
// Move the clock forward and run the timers that are due.
const advance = (ms) => {
  now += ms;
  for (const [id, task] of [...pending]) {
    if (task.at <= now) { pending.delete(id); task.fn(); }
  }
};
const camera = 'camera.testring_view';
const ding = 'event.testring_ding';
const motion = 'event.testring_motion';
const publicHouse = testhaus({ publicOnly: true });
assert.ok(publicHouse.entities[camera] && publicHouse.entities[ding] && publicHouse.entities[motion]);
const hass = {
  entities: { [camera]: { device_id: 'ring' }, [ding]: { device_id: 'ring' }, [motion]: { device_id: 'ring' } },
  states: { [camera]: { entity_id: camera, state: 'idle', attributes: {} },
    [ding]: { entity_id: ding, state: '2026-01-01T12:00:00Z' }, [motion]: { entity_id: motion, state: 'unknown' } },
};
const vars = { cameras: [camera], label: 'Camera' };
// A card that writes its output on every update.
const freshCard = (name, field) => ({ isConnected: true, addController(controller) { this.controller = controller; },
  requestUpdate() { this.output = run(templates[name][field], this, hass, hass.states[camera], vars); } });
const card = { isConnected: true, requestUpdate() { this.output = render(); }, addController(controller) { this.controller = controller; } };
run(templates.casora_badge_base.variables.casora_camera_alert_helper.value, card, hass, hass.states[camera], vars);
const render = () => run(templates.casora_badge_camera_group.name, card, hass, hass.states[camera], vars);

assert.match(render(), /klingel/i, 'ring is visible during the window');
assert.equal(pending.size, 1, 'an expiry redraw is scheduled without sensor.time');
for (let i = 0; i < 1000; i++) {
  render();
  assert.equal(pending.size, 1, 'repeated renders leave only one waiting timer');
}
advance(301000);
assert.match(card.output, /Ruhig/, 'badge returns to idle after the alert window');
assert.equal(pending.size, 0, 'no timer remains after expiry');
now = Date.parse('2026-01-01T12:00:00Z');
render();
assert.equal(pending.size, 1);
card.controller.hostDisconnected();
assert.equal(pending.size, 0, 'removing the card clears its timer');
card.controller.hostConnected();
assert.equal(pending.size, 1, 'reconnecting the card resumes expiry checks');
card.controller.hostDisconnected();
for (const [name, field] of [
  ['casora_cameras', 'state_display'],
  ['casora_badge_camera_group', 'name'],
  ['casora_badge_security', 'name'],
  ['casora_badge_contact_group', 'name'],
]) {
  const fresh = freshCard(name, field);
  hass.states[ding].state = '2026-01-01T12:00:00Z';
  now = Date.parse('2026-01-01T12:00:00Z');
  assert.match(run(templates[name][field], fresh, hass, hass.states[camera], vars), /klingel/i, name);
  advance(301000);
  assert.match(fresh.output, /Ruhig/, `${name} expires without a clock sensor`);
  assert.equal(pending.size, 0);
  hass.states[ding].state = 'unknown';
  hass.states[motion].state = '2026-01-01T12:00:00Z';
  now = Date.parse('2026-01-01T12:00:00Z');
  assert.match(run(templates[name][field], fresh, hass, hass.states[camera], vars), /Bewegung erkannt/, name);
  advance(301000);
  assert.match(fresh.output, /Ruhig/, `${name} motion expires without a clock sensor`);
  assert.equal(pending.size, 0);
  hass.states[motion].state = 'unknown';
}
now = Date.parse('2026-01-01T12:00:00Z');
hass.states[ding].state = '2026-01-01T12:00:00Z';
hass.states['sensor.time'] = { state: '12:00' };
assert.match(render(), /klingel/i);
assert.equal(pending.size, 0, 'an existing clock sensor remains the redraw source');
advance(301000);
hass.states['sensor.time'].state = '12:05';
assert.match(render(), /Ruhig/, 'the minute tick redraws the expired alert');
assert.equal(pending.size, 0, 'the minute tick needs no expiry timer');
delete hass.states['sensor.time'];
// A sensor.time without a usable value never changes, so the minute tick never comes: the timer has to end the alert.
for (const helper of ['casora_badge_base', 'casora_popup_camera']) {
  for (const clockState of ['unavailable', 'unknown', '']) {
    for (const [name, field] of [
      ['casora_badge_camera_group', 'name'],
      ['casora_cameras', 'state_display'],
    ]) {
      delete window.casoraCameraAlert;
      pending.clear();
      now = Date.parse('2026-01-01T12:00:00Z');
      hass.states[ding].state = '2026-01-01T12:00:00Z';
      hass.states[motion].state = 'unknown';
      hass.states['sensor.time'] = { state: clockState };
      const fresh = freshCard(name, field);
      run(templates[helper].variables.casora_camera_alert_helper.value, fresh, hass, hass.states[camera], vars);
      const what = `${helper} in ${name} with sensor.time "${clockState}"`;
      assert.match(run(templates[name][field], fresh, hass, hass.states[camera], vars), /klingel/i, `${what}: the alert shows`);
      assert.equal(pending.size, 1, `${what}: an expiry timer is scheduled`);
      advance(301000);
      assert.match(fresh.output, /Ruhig/i, `${what}: the alert expires`);
      assert.equal(pending.size, 0, `${what}: no timer remains after expiry`);
    }
  }
}
// Without the module, preserve the original missing-sensor-only timer.
{
  const helper = window.casoraTimeUnusable;
  delete window.casoraTimeUnusable;
  try {
    delete window.casoraCameraAlert;
    pending.clear();
    now = Date.parse('2026-01-01T12:00:00Z');
    hass.states[ding].state = '2026-01-01T12:00:00Z';
    hass.states[motion].state = 'unknown';
    const fresh = freshCard('casora_badge_camera_group', 'name');
    run(templates.casora_badge_base.variables.casora_camera_alert_helper.value, fresh, hass, hass.states[camera], vars);
    for (const state of ['12:00', 'unavailable', 'unknown', '']) {
      hass.states['sensor.time'] = { state };
      assert.match(run(templates.casora_badge_camera_group.name, fresh, hass, hass.states[camera], vars), /klingel/i);
      assert.equal(pending.size, 0, `without the module: no timer for present sensor.time "${state}"`);
    }
    delete hass.states['sensor.time'];
    assert.match(run(templates.casora_badge_camera_group.name, fresh, hass, hass.states[camera], vars), /klingel/i);
    assert.equal(pending.size, 1, 'without the module: a missing sensor schedules a timer');
    advance(301000);
    assert.match(fresh.output, /Ruhig/i, 'without the module: the alert expires');
    assert.equal(pending.size, 0, 'without the module: no timer remains after expiry');
  } finally {
    window.casoraTimeUnusable = helper;
  }
}
delete hass.states['sensor.time'];
Date.now = realNow;
console.log('camera_alert_expiry: ok');
