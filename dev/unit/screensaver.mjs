// Wall-panel screensaver (scripts/local/43-screensaver.js): idle minutes, the photo choice,
// and which calendar events are still ahead.
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

assert.equal(S.photo('sunny', 0, '', []), '', 'dark does not load a picture');
assert.equal(S.photo('sunny', 0, 'photo', []), '', 'local photos with an empty library stay dark');
assert.equal(S.photo('sunny', 0, 'photo', ['/api/casora/photo/a', '/api/casora/photo/b']), '/api/casora/photo/a');
assert.equal(S.photo('sunny', 0, 'live', ['/api/casora/photo/a']), 'https://picsum.photos/seed/casora-wall-0/1920/1080');
assert.equal(S.photo('rainy', 1, 'live', []), S.photo('sunny', 1, 'live', []));
assert.equal(S.fallbackPhoto, undefined);

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
assert.ok(read('custom_components/casora/panel/casora-panel.js').includes('Live wallpapers'), 'live or local is a setting');
assert.ok(!/unsplash\.com/.test(read('custom_components/casora/scripts/local/43-screensaver.js')), 'no second photo source');
