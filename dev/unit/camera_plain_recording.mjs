// @deckt: dashboards/casora/button_card_templates.json#casora_camera
// A listed detection shows on the plain camera tile while the camera records (UniFi Protect, Synology and others record nonstop); only off keeps "Aus".
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const inheritedHelper = (template) => {
  const own = templates[template]?.variables?.casora_camera_alert_helper;
  if (own) return own.value;
  for (const parent of templates[template]?.template || []) {
    const value = inheritedHelper(parent);
    if (value) return value;
  }
  return null;
};
new Function('hass', 'states', 'entity', 'variables', inheritedHelper('casora_camera').trim().slice(3, -3))({}, {}, {}, {});
const render = new Function('hass', 'states', 'entity', 'variables', templates.casora_camera.state_display.trim().slice(3, -3));
const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.plain_driveway';
const person = 'binary_sensor.plain_driveway_person_occupancy';
const hass = { entities: { [camera]: { device_id: 'plain' } } };
const states = { [person]: { state: 'off', attributes: { friendly_name: 'Driveway Person' } } };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [person] }] };
const show = (state) => render.call({}, hass, states, { entity_id: camera, state }, {});

show('recording');
states[person] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Driveway Person' } };
assert.match(show('recording'), /Driveway Person/, 'a detection shows while the camera records');
assert.equal(show('off'), 'Aus', 'off keeps "Aus" during a detection');
Date.now = realNow;
console.log('camera_plain_recording: ok');
