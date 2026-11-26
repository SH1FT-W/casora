// @deckt: custom_components/casora/scripts/casora-core.js#casoraDetectionAt, dashboards/casora/button_card_templates.json#global
// After an HA restart the camera tile shows no detection. The states are a real snapshot of the mock Test HA taken
// right after a restart (dev/unit/fixtures/restart_snapshot.json), so casoraSinceMs runs on real timestamps.
import assert from 'node:assert/strict';
import './_detection_rule.mjs';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
const snapshot = JSON.parse(fs.readFileSync(new URL('./fixtures/restart_snapshot.json', import.meta.url)));
const source = templates.casora_badge_base.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', source.trim().slice(3, -3))({}, {}, {}, {});
const camera = 'camera.test';
const sensor = 'binary_sensor.test_motion';
const real = Object.fromEntries(snapshot.states.map(s => [s.entity_id, s]));
const changed = real[sensor].last_changed;
const started = Date.parse(changed);
const hass = { entities: { [camera]: { device_id: 'camera' } }, states: real };
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [sensor] }] };
const realNow = Date.now;
let now = Date.parse(snapshot.taken_at);
Date.now = () => now;
const alert = states => window.casoraCameraAlert(hass, states, [camera], 5);
const seen = (state, last_changed) => ({ ...real, [sensor]: { ...real[sensor], state, last_changed } });

// The sensor was off before the restart and comes back on with the restart's time stamp.
assert.equal(alert(seen('off', '2026-11-26T10:00:00+00:00')), '');
assert.equal(alert(seen('on', changed)), '', 'a sensor that is on again after the HA start is no detection');

// Control: the same sensor really fires ten minutes after the start.
delete window._casoraListedCameraAlerts;
now = started + 10 * 60000;
assert.equal(alert(seen('off', changed)), '');
assert.equal(alert(seen('on', new Date(now - 5000).toISOString())), 'Test motion', 'a real detection after the start still shows');
Date.now = realNow;
