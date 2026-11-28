// @deckt: dashboards/casora/button_card_templates.json#casora_camera_alert_helper custom_components/casora/panel/casora-panel.js#cameraAlert
// A recent doorbell event qualifies by device_class alone, whatever its entity name is,
// while the legacy ding|doorbell|button name match keeps firing with missing or conflicting
// metadata. One table runs against both Dashboard helper copies and the Studio's own copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.window = globalThis;

// Each copy defines window.casoraCameraAlert only when it is missing; capture the own reference
// so both copies stay testable side by side.
const dashboardCopy = (template) => {
  delete window.casoraCameraAlert;
  new Function('hass', 'states', 'entity', 'variables',
    templates[template].variables.casora_camera_alert_helper.value.trim().slice(3, -3))({}, {}, {}, {});
  assert.equal(typeof window.casoraCameraAlert, 'function', template);
  const own = window.casoraCameraAlert;
  return (hass, states, cams) => own(hass, states, cams, 5);
};
const badge = dashboardCopy('casora_badge_base');
const popup = dashboardCopy('casora_popup_camera');

// The Studio preview keeps its own copy of the rule; a fresh Studio has not loaded casora-core.js.
const studioMatch = read('custom_components/casora/panel/casora-panel.js')
  .match(/const cameraAlert = (\(hass, states, cams, windowMinutes\) => \{[\s\S]*?\n\});/);
assert.ok(studioMatch, 'Studio: cameraAlert found');
assert.ok(!/window\.casora/.test(studioMatch[1]), 'Studio: the copy stands alone');
const studio = new Function('return ' + studioMatch[1])();

const NOW = Date.parse('2026-01-01T12:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;
const camera = 'camera.testgarten_view';

// [name, event entity, state attributes, device, age in seconds, wanted outcome]
const cases = [
  ['doorbell device_class, non-matching name', 'event.testgarten_klingel',
    { device_class: 'doorbell', event_type: 'ring' }, 'dev_cam', 60, 'ding'],
  ['legacy name match without metadata', 'event.testring_ding', null, 'dev_cam', 60, 'ding'],
  ['legacy name match with conflicting device_class', 'event.testring_ding',
    { device_class: 'motion' }, 'dev_cam', 60, 'ding'],
  ['doorbell device_class wins over motion name', 'event.testring_motion',
    { device_class: 'doorbell' }, 'dev_cam', 60, 'ding'],
  ['unrelated event without doorbell metadata', 'event.testgarten_klingel',
    { event_type: 'ring' }, 'dev_cam', 60, 'none'],
  ['doorbell event on another device', 'event.testgarten_klingel',
    { device_class: 'doorbell' }, 'dev_other', 60, 'none'],
  ['doorbell event outside the alert window', 'event.testring_ding', null, 'dev_cam', 6 * 60, 'none'],
  ['motion event stays motion', 'event.testring_motion', null, 'dev_cam', 60, 'motion'],
  ['device_class button is not a doorbell', 'event.testgarten_klingel',
    { device_class: 'button' }, 'dev_cam', 60, 'none'],
];
const DASHBOARD = { ding: 'Hat geklingelt', motion: 'Bewegung erkannt', none: '' };
const STUDIO = { ding: 'Doorbell', motion: 'Motion Detected', none: '' };
for (const [name, ev, attributes, device, ageSeconds, want] of cases) {
  const states = { [ev]: { state: new Date(NOW - ageSeconds * 1000).toISOString(), attributes } };
  const hass = { entities: { [camera]: { device_id: 'dev_cam' }, [ev]: { device_id: device } } };
  assert.equal(badge(hass, states, [camera]), DASHBOARD[want], `badge: ${name}`);
  assert.equal(popup(hass, states, [camera]), DASHBOARD[want], `popup: ${name}`);
  assert.equal(studio(hass, states, [camera], 5), STUDIO[want], `studio: ${name}`);
}
Date.now = realNow;
console.log('camera_alert_doorbell_class: ok');
