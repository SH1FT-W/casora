// Chargers near the car: a tap opens the place in the map app of the device.
//   node dev/unit/charging_map_app.mjs
// Expected: Apple Maps on iPhone, iPad (which calls itself a Mac) and in the HA app on iOS, with the place's name as
// the label of the pin; Google Maps on Android and on a desktop, a real Mac included.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
const nav = (o) => Object.defineProperty(globalThis, 'navigator', { value: o, configurable: true });
nav({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 });
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/45-charging.js', import.meta.url), 'utf8');
new Function(src)();
const X = window._casoraCharge;
const s = { lat: 52.5, lng: 13.4, n: 'Parkhaus Mitte & Co', op: 'Testladenetz' };
const google = 'https://www.google.com/maps/search/?api=1&query=52.5%2C13.4';
const apple = 'https://maps.apple.com/?ll=52.5%2C13.4&q=Parkhaus%20Mitte%20%26%20Co';

assert.equal(X.mapUrl(s), google, 'Android');
nav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 });
assert.equal(X.mapUrl(s), google, 'Mac');
nav({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0', platform: 'Win32', maxTouchPoints: 0 });
assert.equal(X.mapUrl(s), google, 'Windows');
nav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 });
assert.equal(X.mapUrl(s), apple, 'iPhone');
nav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 });
assert.equal(X.mapUrl(s), apple, 'iPad');
nav({ userAgent: 'Home Assistant/2026.10.1 (io.robbie.HomeAssistant; build:1; iOS 26.1.0) Mobile/HomeAssistant, like Safari', platform: '', maxTouchPoints: 0 });
assert.equal(X.mapUrl(s), apple, 'HA app on iOS');
nav({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) Chrome/141.0 Mobile Safari/537.36 Home Assistant/2026.10.1-1 (Android 15; Pixel 9)', platform: 'Linux armv8l', maxTouchPoints: 5 });
assert.equal(X.mapUrl(s), google, 'HA app on Android');
// Without a name the operator labels the pin, without both the coordinates.
nav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 });
assert.equal(X.mapUrl({ lat: 1, lng: 2, op: 'Netz' }), 'https://maps.apple.com/?ll=1%2C2&q=Netz');
assert.equal(X.mapUrl({ lat: 1, lng: 2 }), 'https://maps.apple.com/?ll=1%2C2&q=1%2C2');
console.log('charging_map_app: ok');
