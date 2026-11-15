// @deckt: dashboards/casora/button_card_templates.json#global
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const realNow = Date.now;
let now = Date.now();
Date.now = () => now;
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
states[sensor].state = 'unknown';
window.casoraCameraAlert(hass, states, [camera], 5);
states[sensor].state = 'on';
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '', 'unknown to on is not a detection');
states[event].state = new Date(now).toISOString();
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), 'Motion');
for (const name of ['casora_camera', 'casora_reolink_doorbell', 'casora_frigate']) {
  delete window.casoraCameraAlert;
  const inheritedHelper = (template) => {
    const own = templates[template]?.variables?.casora_camera_alert_helper;
    if (own) return own.value;
    for (const parent of templates[template]?.template || []) {
      const value = inheritedHelper(parent);
      if (value) return value;
    }
    return null;
  };
  const helper = inheritedHelper(name);
  assert.ok(helper, `${name} inherits the helper without a badge`);
  new Function('hass', 'states', 'entity', 'variables', helper.trim().slice(3, -3))({}, {}, {}, {});
  const render = new Function('hass', 'states', 'entity', 'variables', templates[name].state_display.trim().slice(3, -3));
  const result = render.call({}, hass, states, { entity_id: camera, state: 'idle' }, {});
  assert.equal(result, 'Motion', `${name} shows the trigger's name`);
}
assert.ok(templates.casora_camera.variables.casora_camera_alert_helper, 'camera tiles initialize the shared helper');
now += 301000;
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '', 'listed alert expires');
delete window._casoraListedCameraAlerts;
now += 1000;
const doorbell = 'binary_sensor.doorbell_button';
window.CASORA_SETTINGS.cameras[0].detection_triggers = [doorbell];
states[doorbell] = { state: 'off', attributes: { friendly_name: 'Doorbell button' } };
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), '');
states[doorbell] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Doorbell button' } };
assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), 'Doorbell button', 'binary doorbell uses its own name');
Date.now = realNow;
