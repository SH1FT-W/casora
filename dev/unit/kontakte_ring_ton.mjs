// Prüfrunde u07-07: the windows popup drew an open window red on its ring while the stage, the row icons, the doors
// popup and the security overview said orange (warning). §4.8 (c): orange = warning, red = alarm. Expected: open and
// tilted segments follow Casora's security level per contact (orange unless it is an alarm, e.g. armed away).
//   node dev/unit/kontakte_ring_ton.mjs
// @deckt: custom_components/casora/scripts/local/34-security-covers.js#casoraContactsStage
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const w = { addEventListener: () => {} };
let stage = null;
w._casoraUI = { stage: (k, o) => { stage = o; return 'S'; }, esc: String };
new Function('window', 'document', read('custom_components/casora/scripts/local/34-security-covers.js'))(w, { querySelector: () => null, addEventListener: () => {} });
const st = (s, dc) => ({ state: s, attributes: { device_class: dc, friendly_name: 'x' } });
const hass = { states: { 'binary_sensor.fenster_a': st('on', 'window'), 'binary_sensor.fenster_b': st('off', 'window'), 'binary_sensor.fenster_c': st('on', 'window') } };
const all = Object.keys(hass.states), open = ['binary_sensor.fenster_a', 'binary_sensor.fenster_c'];
const tilted = (id) => id === 'binary_sensor.fenster_c';

let level = 'warn';
w.casoraSecurityLevel = () => level;
w.casoraContactsStage(hass, open, all, tilted, '1 Fenster offen', null);
assert.equal(stage.tone, 'warn', 'stage orange');
assert.deepEqual(stage.segs.map((s) => s.tone), ['warn', 'good', 'warn'], 'open and tilted orange like the stage');
level = 'alarm';
w.casoraContactsStage(hass, open, all, tilted, '1 Fenster offen', null);
assert.equal(stage.tone, 'bad');
assert.deepEqual(stage.segs.map((s) => s.tone), ['bad', 'good', 'bad'], 'armed away: red stays');
console.log('kontakte_ring_ton: ok');
