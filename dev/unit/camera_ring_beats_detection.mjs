// @deckt: dashboards/casora/button_card_templates.json#casora_camera_alert_helper,dashboards/casora/button_card_templates.json#casora_reolink_doorbell
// A ring and a detection at the same time: the ring keeps its text (and its red dot on the doorbell tile).
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const body = (source) => source.trim().slice(3, -3);
const camera = 'camera.test_door';
const ding = 'event.test_door_ding';
const sensor = 'binary_sensor.test_door_person';
const states = {
  [camera]: { entity_id: camera, state: 'idle', attributes: {} },
  [ding]: { state: 'unknown', attributes: { friendly_name: 'Door Ding' } },
  [sensor]: { state: 'off', attributes: { friendly_name: 'Person' } },
};
const hass = { states, entities: { [camera]: { device_id: 'ring' }, [ding]: { device_id: 'ring' } } };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor] }] };
new Function('hass', 'states', 'entity', 'variables', body(templates.casora_popup_camera.variables.casora_camera_alert_helper.value))({}, {}, {}, {});
const alert = () => window.casoraCameraAlert(hass, states, [camera], 5);

alert();
states[sensor] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Person' } };
assert.equal(alert(), 'Person erkannt', 'a detection alone shows its name');
states[ding].state = new Date(now).toISOString();
assert.equal(alert(), 'Hat geklingelt', 'a ring and a detection together show the ring');

// Doorbell tile: the ring text with the red dot, not the detection.
window._casoraKlingel = { of: () => ({ ring: now, live: [] }), tileText: () => 'Hat geklingelt', hot: () => true };
const render = new Function('hass', 'states', 'entity', 'variables', body(templates.casora_reolink_doorbell.state_display));
const shown = render.call({}, hass, states, states[camera], {});
assert.match(shown, /Hat geklingelt/, 'doorbell tile shows the ring text');
assert.match(shown, /border-radius:50%/, 'doorbell tile keeps the red dot');
assert.doesNotMatch(shown, /erkannt/, 'the detection does not hide the ring');
Date.now = realNow;
console.log('camera_ring_beats_detection: ok');
