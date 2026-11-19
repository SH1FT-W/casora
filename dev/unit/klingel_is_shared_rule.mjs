// KL.is (Reolink doorbell, 24-klingel.js) asks the shared visitor rule of 00-finder.js (window.casoraIsReolinkVisitor)
// for each entity of the camera's device. Made-up devices and names.   node dev/unit/klingel_is_shared_rule.mjs
// @deckt: custom_components/casora/scripts/local/24-klingel.js#KL.is
// @deckt: custom_components/casora/scripts/local/00-finder.js#isReolinkVisitor,casoraIsReolinkVisitor
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.casoraLocale = () => 'de-DE';
new Function(src('00-finder.js'))(); // the finder loads first (start module), so the shared rule exists
new Function(src('24-klingel.js'))();
const KL = window._casoraKlingel;
assert.equal(typeof window.casoraIsReolinkVisitor, 'function', 'the finder exposes the shared Reolink visitor rule');

const hass = {
  entities: {
    'camera.mock_gate_sub': { entity_id: 'camera.mock_gate_sub', platform: 'reolink', device_id: 'mock-gate', translation_key: 'sub' },
    'binary_sensor.mock_gate_visitor': { entity_id: 'binary_sensor.mock_gate_visitor', platform: 'reolink', device_id: 'mock-gate', translation_key: 'visitor' },
    'camera.mock_yard_sub': { entity_id: 'camera.mock_yard_sub', platform: 'reolink', device_id: 'mock-yard', translation_key: 'sub' },
    'binary_sensor.mock_yard_motion': { entity_id: 'binary_sensor.mock_yard_motion', platform: 'reolink', device_id: 'mock-yard', translation_key: 'motion' },
  },
  states: {},
};

// A Reolink-style camera with a visitor sensor on its device is a doorbell.
assert.equal(KL.is(hass, 'camera.mock_gate_sub'), true, 'a Reolink camera with a visitor sensor is found');
// The same device without a visitor sensor is not.
assert.equal(KL.is(hass, 'camera.mock_yard_sub'), false, 'a Reolink camera with only a motion sensor is not');
// KL.is asks the shared rule: with the rule saying no, the camera is not a doorbell.
const realRule = window.casoraIsReolinkVisitor;
const asked = [];
window.casoraIsReolinkVisitor = (h, id) => { asked.push(id); return false; };
assert.equal(KL.is(hass, 'camera.mock_gate_sub'), false, 'KL.is follows the shared rule');
assert.ok(asked.includes('binary_sensor.mock_gate_visitor'), 'KL.is asks the shared rule about the sensor');
window.casoraIsReolinkVisitor = realRule;
// Without the finder's rule (it has not loaded), the fallback still finds the visitor sensor.
delete window.casoraIsReolinkVisitor;
assert.equal(KL.is(hass, 'camera.mock_gate_sub'), true, 'fallback without the shared rule');
window.casoraIsReolinkVisitor = realRule;
console.log('ok klingel_is_shared_rule');
