// Device page on the phone: „In Home Assistant öffnen“ (and the period pills) did nothing, the tap's click never
// arrived. Expected: a touchend without movement opens HA's dialog, the click echo after it does not fire twice,
// a swipe does not count.
//   node dev/unit/device_page_native_tap.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8');
const a = src.indexOf('  var tp = null, tapAt = 0;');
const b = src.indexOf("document.addEventListener('touchend'", a);
assert.ok(a > 0 && b > a, 'tap handler found');
const block = src.slice(a, src.indexOf('\n', b) + 1);

const L = {};
const document = { addEventListener: (t, fn) => { L[t] = fn; } };
const opened = [];
const window = { casoraPopup: { close() {}, nativeMoreInfo: (id) => opened.push(id) }, casoraHaptic() {} };
new Function('document', 'window', 'Z', block)(document, window, {});
const row = { getAttribute: (k) => (k === 'data-casora-native' ? 'light.example' : null), hasAttribute: (k) => k === 'data-casora-native' };
const ev = (type) => ({ type, composedPath: () => [row], preventDefault() {}, stopPropagation() {} });

L.touchstart({ touches: [{ clientX: 10, clientY: 10 }] });
L.touchend(ev('touchend'));
L.click(ev('click'));
assert.deepEqual(opened, ['light.example'], 'tap opens HA dialog once (click echo swallowed)');

const realNow = Date.now; Date.now = () => realNow() + 1000;
L.touchstart({ touches: [{ clientX: 10, clientY: 10 }] });
L.touchmove({ touches: [{ clientX: 10, clientY: 60 }] });
L.touchend(ev('touchend'));
assert.equal(opened.length, 1, 'swipe does not open');
L.click(ev('click'));
assert.equal(opened.length, 2, 'desktop click opens');
Date.now = realNow;
console.log('ok device_page_native_tap');
