// @deckt: dashboards/casora/button_card_templates.json#casora_badge_contact_group,casora_badge_security
// The contact and security badges show a listed detection while the camera records, like the tiles; only the plain state
// words stay when nothing was detected.
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const body = (source) => source.trim().slice(3, -3);
const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.test_driveway';
const sensor = 'binary_sensor.test_driveway_person';
const states = {};
const hass = { states, entities: { [camera]: { device_id: 'cam' } } };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor] }] };
new Function('hass', 'states', 'entity', 'variables', body(templates.casora_badge_base.variables.casora_camera_alert_helper.value))({}, {}, {}, {});
const sensorOff = { state: 'off', attributes: { friendly_name: 'Person' } };
const sensorOn = () => ({ state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Person' } });
const show = (name, state) => {
  const entity = { entity_id: camera, state, attributes: {} };
  states[camera] = entity;
  return new Function('hass', 'states', 'entity', 'variables', body(templates[name].name))
    .call({}, hass, states, entity, { cameras: [camera], label: 'Camera' });
};

for (const name of ['casora_badge_contact_group', 'casora_badge_security']) {
  delete window._casoraListedCameraAlerts;
  states[sensor] = sensorOff;
  assert.match(show(name, 'recording'), /Aufnahme/, `${name}: recording without a detection says Aufnahme`);
  states[sensor] = sensorOn();
  assert.match(show(name, 'recording'), /Person/, `${name}: a detection shows while the camera records`);
  assert.doesNotMatch(show(name, 'recording'), /Aufnahme/, `${name}: the detection replaces the word Aufnahme`);
  assert.match(show(name, 'idle'), /Person/, `${name}: a detection shows on an idle camera`);
}
Date.now = realNow;
console.log('camera_badge_recording: ok');
