// @deckt: dashboards/casora/button_card_templates.json#casora_camera,dashboards/casora/button_card_templates.json#casora_frigate
// Ticket #188 (decision a): a camera with listed triggers and no picture (fallback name on) shows a
// live alert before „Kein Bild“. Recording and off are not overridden by an alert; unlisted cameras
// keep „Kein Bild“. Runs for casora_camera and casora_frigate (same rule in both).
//   node dev/unit/camera_listed_kein_bild.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
let fallbackName = '1';
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--casora-tile-fallback-name' ? fallbackName : '') });

// The alert helper (window.casoraCameraAlert) comes from casora_camera; both templates call it.
const helper = templates.casora_camera.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', helper.trim().slice(3, -3))({}, {}, {}, {});

const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.test_hof';
const ding = 'event.test_hof_ding';
const hass = { entities: { [camera]: { device_id: 'hof' }, [ding]: { device_id: 'hof' } } };
const states = {
  [ding]: { state: 'unknown', attributes: { friendly_name: 'Test Ding' } },
};
const idle = { entity_id: camera, state: 'idle' };

for (const name of ['casora_camera', 'casora_frigate']) {
  const render = new Function('hass', 'states', 'entity', 'variables', templates[name].state_display.trim().slice(3, -3));
  const show = (entity, card = { _hcPic: false }) => render.call(card, hass, states, entity, { alert_window_minutes: 5 });

  window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [ding] }] };

  // (1) Listed camera, no picture, fallback name on, live ring: the alert wins.
  states[ding].state = new Date(now).toISOString();
  assert.equal(show(idle), 'Test Ding', `${name}: listed camera without picture shows the live alert, not „Kein Bild“`);

  // (2) Listed camera, no picture, no active alert: still „Kein Bild“.
  delete window._casoraListedCameraAlerts;
  states[ding].state = 'unknown';
  assert.equal(show(idle), 'Kein Bild', `${name}: no active alert keeps „Kein Bild“`);

  // (3) Unlisted camera (not in the settings, so no detection triggers): still „Kein Bild“.
  states[ding].state = new Date(now).toISOString();
  window.CASORA_SETTINGS = { cameras: [] };
  delete window._casoraListedCameraAlerts;
  assert.equal(show(idle), 'Kein Bild', `${name}: unlisted camera without picture keeps „Kein Bild“`);

  // (4) Listed camera while recording: recording is not overridden by an alert, so it stays „Kein Bild“.
  window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [ding] }] };
  delete window._casoraListedCameraAlerts;
  states[ding].state = new Date(now).toISOString();
  assert.equal(show({ entity_id: camera, state: 'recording' }), 'Kein Bild', `${name}: recording is not overridden by an alert`);

  // (5) Listed camera that is off, with a live alert: off is not overridden either, so it stays „Aus“.
  delete window._casoraListedCameraAlerts;
  states[ding].state = new Date(now).toISOString();
  assert.equal(show({ entity_id: camera, state: 'off' }), 'Aus', `${name}: off is not overridden by an alert`);
}

Date.now = realNow;
