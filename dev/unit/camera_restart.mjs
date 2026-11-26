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

// Known limit (pinned, not a promise): only when the page saw the sensor go straight from off to on (no unavailable in
// between) four minutes after the start, outside the start window, does it show. A real restart passes through
// unavailable, see the test below.
delete window._casoraListedCameraAlerts;
now = started + 5 * 60000;
assert.equal(alert(seen('off', '2026-11-26T10:00:00+00:00')), '');
assert.equal(alert(seen('on', new Date(started + 4 * 60000).toISOString())), 'Test motion', 'late return after the start window is not caught');
Date.now = realNow;

// A real restart passes through unavailable (or no state at all) before the sensor is on again. A detection needs off
// right before on, so a sensor that returns late through unavailable is no detection, not even more than three minutes
// after the start. The same rule misses a real detection that follows an outage; that is the price of the guard.
Date.now = () => now;
delete window._casoraListedCameraAlerts;
now = started + 5 * 60000;
assert.equal(alert(seen('off', '2026-11-26T10:00:00+00:00')), '');
assert.equal(alert(seen('unavailable', new Date(started + 1000).toISOString())), '');
assert.equal(alert(seen('on', new Date(started + 4 * 60000).toISOString())), '', 'off, unavailable, on: the late return through unavailable shows nothing');
delete window._casoraListedCameraAlerts;
assert.equal(alert(seen('off', '2026-11-26T10:00:00+00:00')), '');
const gone = { ...real }; delete gone[sensor];
assert.equal(alert(gone), '');
assert.equal(alert(seen('on', new Date(started + 4 * 60000).toISOString())), '', 'off, no state, on: shows nothing either');

// An event is dated by its own time stamp (its state), not by last_changed: the state HA restores after a restart is the
// old time stamp, so it cannot fake a detection, and a real event in the first minutes after the start must still count.
const event = 'event.test_item_31';
assert.equal(window.casoraDetectionAt(event, real[event].state, null, real[event].last_changed, hass), Date.parse(real[event].state), 'the restored event is dated by its old time stamp, not by the restart (the detection window drops it)');
const quick = new Date(started + 20000).toISOString();
now = started + 60000;
assert.equal(window.casoraDetectionAt(event, quick, real[event].state, quick, hass), Date.parse(quick), 'an event fired a minute after the start is a detection');
Date.now = realNow;
