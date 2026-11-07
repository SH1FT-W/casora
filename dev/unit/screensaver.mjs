// Wall-panel screensaver (scripts/local/43-screensaver.js): idle minutes, which photo a weather
// state picks, and which calendar events are still ahead.
//   node dev/unit/screensaver.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const win = {};
const box = { window: win, console };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/43-screensaver.js'), box);
const S = win._casoraScreensaver;
assert.ok(S, 'module loads');
assert.equal(S._booted, undefined, 'does not mount without a document');

assert.equal(S.minutes(''), 0);
assert.equal(S.minutes('0'), 0);
assert.equal(S.minutes('2'), 2);
assert.equal(S.minutes('10'), 10);
assert.equal(S.minutes('999'), 240);

assert.equal(S.bucket('sunny'), 'sunny');
assert.equal(S.bucket('clear-night'), 'night');
assert.equal(S.bucket('lightning-rainy'), 'rainy');
assert.equal(S.bucket('pouring'), 'rainy');
assert.equal(S.bucket('snowy-rainy'), 'snowy');
assert.equal(S.bucket('fog'), 'fog');
assert.equal(S.bucket('partlycloudy'), 'cloudy');
assert.equal(S.bucket(''), 'cloudy');

const sun = S.photo('sunny', 0, '');
const sunNext = S.photo('sunny', 1, '');
assert.ok(sun.startsWith('https://images.unsplash.com/'), 'weather photo is a picture url');
assert.notEqual(sun, sunNext, 'the photo changes on the next turn');
assert.notEqual(S.photo('rainy', 0, 'weather'), S.photo('sunny', 0, 'weather'), 'rain is not the sun photo');
assert.equal(S.photo('rainy', 0, 'photo'), S.photo('sunny', 0, 'photo'), 'rotating photos ignore the weather');

const now = Date.parse('2026-11-07T15:00:00');
const rows = S.upcoming([
  { summary: 'Past', start: '2026-11-07T08:00:00', end: '2026-11-07T09:00:00' },
  { summary: 'Soon', start: '2026-11-07T18:00:00', end: '2026-11-07T19:00:00' },
  { summary: 'Tomorrow', start: '2026-11-08T10:00:00', end: '2026-11-08T11:00:00' },
], now, 6);
assert.deepEqual(rows.map((r) => r.summary), ['Soon', 'Tomorrow']);

assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'43-screensaver'"), 'module in MODULES');
assert.ok(read('custom_components/casora/panel/casora-panel.js').includes('casora_screensaver'), 'studio setting');
assert.ok(!/weather\.[a-z0-9_]+/.test(read('custom_components/casora/scripts/local/43-screensaver.js')), 'no weather entity id');
