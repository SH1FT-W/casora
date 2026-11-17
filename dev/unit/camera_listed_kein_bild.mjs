// @deckt: dashboards/casora/button_card_templates.json#casora_camera
// Ticket #188 (decision a): a camera with listed triggers and no picture (fallback name on) shows a
// live alert before „Kein Bild“. Other cameras, „Rec“ and „Aus“ keep their order and text.
//   node dev/unit/camera_listed_kein_bild.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const templates = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url)));
globalThis.window = globalThis;
let fallbackName = '1';
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--casora-tile-fallback-name' ? fallbackName : '') });

const helper = templates.casora_camera.variables.casora_camera_alert_helper.value;
new Function('hass', 'states', 'entity', 'variables', helper.trim().slice(3, -3))({}, {}, {}, {});
const render = new Function('hass', 'states', 'entity', 'variables', templates.casora_camera.state_display.trim().slice(3, -3));

const realNow = Date.now;
const now = Date.now();
Date.now = () => now;
const camera = 'camera.test_hof';
const ding = 'event.test_hof_ding';
const hass = { entities: { [camera]: { device_id: 'hof' }, [ding]: { device_id: 'hof' } } };
const states = {
  [ding]: { state: 'unknown', attributes: { friendly_name: 'Test Ding' } },
};
const show = (entity, card = { _hcPic: false }) => render.call(card, hass, states, entity, { alert_window_minutes: 5 });
const idle = { entity_id: camera, state: 'idle' };

window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [ding] }] };

// (1) Listed camera, no picture, fallback name on, live ring: the alert wins.
states[ding].state = new Date(now).toISOString();
assert.equal(show(idle), 'Test Ding', 'listed camera without picture shows the live alert, not „Kein Bild“');

// (2) Listed camera, no picture, no active alert: still „Kein Bild“.
delete window._casoraListedCameraAlerts;
states[ding].state = 'unknown';
assert.equal(show(idle), 'Kein Bild', 'no active alert keeps „Kein Bild“');

// (3) Unlisted camera (same device, but no detection triggers in the settings): still „Kein Bild“.
states[ding].state = new Date(now).toISOString();
window.CASORA_SETTINGS = { cameras: [] };
delete window._casoraListedCameraAlerts;
assert.equal(show(idle), 'Kein Bild', 'unlisted camera without picture keeps „Kein Bild“');

// (4) Listed camera while recording: „Rec“ keeps its place before the alert, so it stays „Kein Bild“.
window.CASORA_SETTINGS = { cameras: [{ entity_id: camera, detection_triggers: [ding] }] };
delete window._casoraListedCameraAlerts;
states[ding].state = new Date(now).toISOString();
assert.equal(show({ entity_id: camera, state: 'recording' }), 'Kein Bild', 'recording keeps today’s order');

Date.now = realNow;
