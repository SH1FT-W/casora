// @deckt: dashboards/casora/button_card_templates.json#global
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const now = Date.now();
const camera = 'camera.test';
const sensor = 'binary_sensor.person';
const event = 'event.motion';
const hass = { entities: { [camera]: { device_id: 'camera' } } };
const states = {
  [sensor]: { state: 'off', attributes: { friendly_name: 'Person' } },
  [event]: { state: 'unknown', attributes: { friendly_name: 'Motion' } },
};
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor, event] }] };
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '');
states[sensor] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Person' } };
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), 'Person');
delete window._casoraListedCameraAlerts;
states[sensor].state = 'unavailable';
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '');
states[sensor].state = 'on';
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '', 'restart is not a detection');
states[event].state = new Date(now).toISOString();
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), 'Motion');
