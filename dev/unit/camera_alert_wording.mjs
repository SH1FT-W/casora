// @deckt: dashboards/casora/button_card_templates.json#casora_camera_alert_helper
// Ring-style doorbell alerts use the same state word as the other doorbell tile.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.window = globalThis;
const camera = 'camera.testring_view';
const ding = 'event.testring_ding';
const states = { [camera]: { entity_id: camera, state: 'idle', attributes: {} },
  [ding]: { state: new Date().toISOString() } };
const hass = { states, entities: { [camera]: { device_id: 'ring' }, [ding]: { device_id: 'ring' } } };
const variables = { cameras: [camera], label: 'Camera' };
const run = (source) => new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))
  .call({}, hass, states, states[camera], variables);
for (const [name, field, helper] of [
  ['casora_cameras', 'state_display', 'casora_popup_camera'],
  ['casora_badge_camera_group', 'name', 'casora_badge_base'],
  ['casora_badge_security', 'name', 'casora_badge_base'],
  ['casora_badge_contact_group', 'name', 'casora_badge_base'],
]) {
  delete window.casoraCameraAlert;
  run(templates[helper].variables.casora_camera_alert_helper.value);
  assert.match(run(templates[name][field]), /Hat geklingelt/, name);
}
console.log('camera_alert_wording: ok');
