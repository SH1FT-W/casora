// @deckt: dashboards/casora/button_card_templates.json#global
// A camera without listed triggers keeps the entity-ID alert texts unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.plain_view';
const ding = 'event.plain_ding';
const motion = 'event.plain_motion';
const hass = { entities: { [camera]: { device_id: 'ring' }, [ding]: { device_id: 'ring' }, [motion]: { device_id: 'ring' } } };
const states = {
  [ding]: { state: new Date(now).toISOString(), attributes: { friendly_name: 'Front Door Ding' } },
  [motion]: { state: 'unknown', attributes: { friendly_name: 'Front Motion' } },
};
const alert = () => window.casoraCameraAlert(hass, states, [camera], 5);

window.CASORA_SETTINGS = {};
assert.equal(alert(), 'Hat geklingelt', 'a ring without any settings shows the doorbell text');
states[ding].state = 'unknown';
states[motion].state = new Date(now).toISOString();
assert.equal(alert(), 'Bewegung erkannt', 'motion without settings shows the motion text');

delete window._casoraListedCameraAlerts;
window.CASORA_SETTINGS = { cameras: [{ entity_id: 'camera.other', detection_triggers: ['binary_sensor.other'] }] };
assert.equal(alert(), 'Bewegung erkannt', 'a list for another camera does not change this one');
Date.now = realNow;
