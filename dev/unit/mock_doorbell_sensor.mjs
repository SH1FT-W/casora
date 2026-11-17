// @deckt: dev/casora_mock/binklingel.py
// The mock house has a made-up Reolink-style doorbell whose press is an on/off binary sensor with
// device class doorbell on the camera's device – a style that could not be checked for lack of
// such a sensor. The button must not carry translation_key "visitor": the Reolink community card
// (24-klingel.js) would otherwise pick the camera up as a second doorbell besides testklingel.
// Names made up; no private fixture needed (publicOnly).
//   node dev/unit/mock_doorbell_sensor.mjs
import assert from 'node:assert/strict';
import { testhaus } from './lib/testhaus.mjs';

const hass = testhaus({ publicOnly: true });
const cam = 'camera.testbinklingel_sub';
const bell = 'binary_sensor.testbinklingel_ding';
assert.ok(hass.entities[cam], 'camera of the doorbell exists');
assert.ok(hass.entities[bell], 'doorbell button (binary sensor) exists');
assert.equal(hass.entities[bell].device_id, hass.entities[cam].device_id, 'button sits on the camera device');
assert.equal(hass.entities[bell].translation_key, null, 'no translation_key "visitor": not a Reolink community doorbell');
assert.equal(hass.states[bell].attributes.device_class, 'doorbell', 'button has device class doorbell');
assert.equal(hass.states[bell].state, 'off', 'button starts off');
assert.equal(hass.entities[cam].platform, 'casora_mock', 'camera comes from the mock');
console.log('mock_doorbell_sensor: ok');
