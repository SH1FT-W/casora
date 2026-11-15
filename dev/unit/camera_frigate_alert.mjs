// @deckt: dashboards/casora/button_card_templates.json#global
// A Frigate object sensor listed as a trigger: off to on is the alert, the restart is not.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const realNow = Date.now;
let now = Date.now();
Date.now = () => now;
const camera = 'camera.frigate_driveway';
const person = 'binary_sensor.frigate_driveway_person_occupancy';
const hass = { entities: { [camera]: { device_id: 'frigate' } } };
const states = { [person]: { state: 'off', attributes: { friendly_name: 'Driveway Person' } } };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [person] }] };
const alert = () => window.casoraCameraAlert(hass, states, [camera], 5);

assert.equal(alert(), '', 'off is no alert');
states[person] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Driveway Person' } };
assert.equal(alert(), 'Driveway Person', 'off to on shows the Frigate sensor name');
now += 301000;
assert.equal(alert(), '', 'the Frigate alert expires after the window');

delete window._casoraListedCameraAlerts;
states[person] = { state: 'unavailable', attributes: { friendly_name: 'Driveway Person' } };
alert();
states[person] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Driveway Person' } };
assert.equal(alert(), '', 'unavailable to on after a restart is no alert');

window.CASORA_SETTINGS = { cameras: [] };
delete window._casoraListedCameraAlerts;
states[person] = { state: 'off', attributes: { friendly_name: 'Driveway Person' } };
alert();
states[person] = { state: 'on', last_changed: new Date(now).toISOString(), attributes: { friendly_name: 'Driveway Person' } };
assert.equal(alert(), '', 'an unlisted Frigate sensor does not alert');
Date.now = realNow;
