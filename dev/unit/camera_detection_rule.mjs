// @deckt: custom_components/casora/scripts/casora-core.js#casoraDetectionAt, dashboards/casora/button_card_templates.json#global
// The shared detection rule as the camera tile shows it: clock skew.
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const realNow = Date.now;
const now = realNow();
Date.now = () => now;
const camera = 'camera.test';
const sensor = 'binary_sensor.person';
const hass = { entities: { [camera]: { device_id: 'camera' } } };
const at = ms => new Date(ms).toISOString();
const fresh = () => { delete window._casoraListedCameraAlerts; };
const alert = (states, minutes) => window.casoraCameraAlert(hass, states, [camera], minutes);
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor] }] };

// Clock skew: HA stamped the change a few seconds ahead of this browser.
fresh();
const skew = { [sensor]: { state: 'off', attributes: { friendly_name: 'Person' } } };
assert.equal(alert(skew, 5), '');
skew[sensor] = { state: 'on', last_changed: at(now + 20000), attributes: { friendly_name: 'Person' } };
assert.equal(alert(skew, 5), 'Person', 'a change time slightly ahead of the browser clock is still a detection');
assert.equal(window.casoraDetectionAt(sensor, 'on', 'off', now + 20000, {}), now, 'the rule clamps a slightly future time to now');
assert.equal(window.casoraDetectionAt(sensor, 'on', 'off', now + 3600000, {}), null, 'a time an hour ahead is no detection');

Date.now = realNow;
