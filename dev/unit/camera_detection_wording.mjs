// @deckt: dashboards/casora/button_card_templates.json#casora_camera_alert_helper
// A detection reads "{name} erkannt" in the helper and in every place that shows its text.
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.test_driveway';
const sensor = 'binary_sensor.test_driveway_person';
const states = {
  [camera]: { entity_id: camera, state: 'idle', attributes: {} },
  [sensor]: { state: 'off', attributes: { friendly_name: 'Person' } },
};
const hass = { states, entities: { [camera]: { device_id: 'cam' } } };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor] }] };
const inherited = (template, pick) => {
  const own = pick(templates[template]);
  if (own) return own;
  for (const parent of templates[template]?.template || []) {
    const value = inherited(parent, pick);
    if (value) return value;
  }
  return null;
};
const body = (source) => source.trim().slice(3, -3);
const loadHelper = (template) => {
  delete window.casoraCameraAlert;
  delete window._casoraListedCameraAlerts;
  states[sensor] = { state: 'off', attributes: { friendly_name: 'Person' } };
  new Function('hass', 'states', 'entity', 'variables', body(inherited(template, (t) => t.variables?.casora_camera_alert_helper?.value)))({}, {}, {}, {});
  window.casoraCameraAlert(hass, states, [camera], 5);
  states[sensor] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Person' } };
};
const run = (source) => new Function('hass', 'states', 'entity', 'variables', body(source))
  .call({}, hass, states, states[camera], { cameras: [camera], label: 'Camera' });

for (const helper of ['casora_badge_base', 'casora_popup_camera']) {
  loadHelper(helper);
  assert.equal(window.casoraCameraAlert(hass, states, [camera], 5), 'Person erkannt', `${helper}: helper wording`);
}
for (const [name, field] of [
  ['casora_camera', 'state_display'], ['casora_frigate', 'state_display'], ['casora_reolink_doorbell', 'state_display'],
  ['casora_cameras', 'state_display'], ['casora_badge_camera_group', 'name'], ['casora_badge_contact_group', 'name'],
  ['casora_badge_security', 'name'],
]) {
  loadHelper(name);
  assert.match(run(templates[name][field]), /Person erkannt/, name);
}
Date.now = realNow;
console.log('camera_detection_wording: ok');
