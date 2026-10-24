// Private room photos (HACS review, hacs/default#12143): casoraPhotoUrl maps names and old
// addresses (/casora_assets/rooms, /local/casora/rooms, /local/hemma/rooms) to the signed URLs
// from casora/photos; demo photos stay public; reload on reconnect and on an unknown name.
//   node dev/unit/photos_signed.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('// casora-photos:start');
const b = core.indexOf('// casora-photos:end');
assert.ok(a > 0 && b > a, 'block found');

globalThis.window = globalThis;
let kicks = 0;
window.casoraWallpaperRefresh = () => { kicks++; };
const events = [];
window.dispatchEvent = (e) => events.push(e.type);
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
new Function(core.slice(a, b))();

const SIG = (f) => `/api/casora/photo/${f}?v=1&authSig=abc`;
let calls = 0;
let photos = { 'kueche-3fa9c2d1e0b4': SIG('kueche-3fa9c2d1e0b4.jpg'), 'kueche-3fa9c2d1e0b4-night': SIG('kueche-3fa9c2d1e0b4-night.jpg'),
  kueche: SIG('kueche.jpg') };
const listeners = {};
const hass = {
  connection: { addEventListener: (t, fn) => { listeners[t] = fn; } },
  callWS: (msg) => { calls++; assert.equal(msg.type, 'casora/photos'); return Promise.resolve({ photos: { ...photos }, shipped: ['default'], expires_in: 43200 }); },
};
const tick = () => new Promise((r) => setTimeout(r, 0));

const P = window.casoraPhotoUrl;
const stem = window.casoraPhotoStem;

// Stems from every kind of reference.
assert.equal(stem('kueche'), 'kueche');
assert.equal(stem('kueche-night.jpg'), 'kueche-night');
assert.equal(stem('/local/casora/rooms/kueche.jpg?v=3'), 'kueche');
assert.equal(stem('/local/hemma/rooms/kueche-night.jpg'), 'kueche-night');
assert.equal(stem('/casora_assets/rooms/livingroom-demo.jpg'), 'livingroom-demo');
assert.equal(stem('http://ha:8123/local/casora/rooms/k%C3%BCche.png'), 'küche');
assert.equal(stem('/api/casora/photo/kueche.jpg?v=1&authSig=x'), 'kueche');
assert.equal(stem('/local/other/photo.jpg'), '');
assert.equal(stem('https://example.com/x.jpg'), '');
assert.equal(stem(null), '');

// Demo photos: public, no request needed.
assert.equal(P('livingroom-demo'), '/casora_assets/rooms/livingroom-demo.jpg');
assert.equal(P('livingroom-demo-night'), '/casora_assets/rooms/livingroom-demo-night.jpg');
assert.equal(calls, 0);
// Foreign URLs untouched, nothing for nothing.
assert.equal(P('/local/other/photo.jpg'), '/local/other/photo.jpg');
assert.equal(P(''), '');

// Own photo before the list is there: '' (no broken image) and one request.
assert.equal(P('kueche-3fa9c2d1e0b4', hass), '');
assert.equal(window.casoraPhotoCss('kueche-3fa9c2d1e0b4', hass), 'none');
await tick(); await tick();
assert.equal(calls, 1, 'one request while loading');
assert.ok(events.includes('casora-photos-changed') && kicks === 1, 'repaint after the list arrived');

// Then signed URLs for names and old addresses.
assert.equal(P('kueche-3fa9c2d1e0b4', hass), SIG('kueche-3fa9c2d1e0b4.jpg'));
assert.equal(P('kueche-3fa9c2d1e0b4-night'), SIG('kueche-3fa9c2d1e0b4-night.jpg'));
assert.equal(P('/local/casora/rooms/kueche.jpg?v=3'), SIG('kueche.jpg'));
assert.equal(P('/local/hemma/rooms/kueche.jpg'), SIG('kueche.jpg'));
assert.equal(P('/casora_assets/rooms/kueche.jpg'), SIG('kueche.jpg'));
assert.equal(window.casoraPhotoCss('kueche'), `url("${SIG('kueche.jpg')}")`);
// Shipped names from the server (no -demo) stay public, no extra request.
assert.equal(P('default'), '/casora_assets/rooms/default.jpg');
assert.equal(calls, 1);

// Unknown name (just uploaded elsewhere): one more request, then it is there.
await new Promise((r) => setTimeout(r, 2100));
photos = { ...photos, neu: SIG('neu.jpg') };
assert.equal(P('neu', hass), '/casora_assets/rooms/neu.jpg');
await tick(); await tick();
assert.equal(calls, 2);
assert.equal(P('neu', hass), SIG('neu.jpg'));
// Still unknown: not asked again (no request storm on every redraw).
P('gibts-nicht', hass); await tick();
const after = calls;
P('gibts-nicht', hass); P('gibts-nicht', hass); await tick();
assert.equal(calls, after);

// Reconnect: asks again (HA restart, new login).
assert.equal(typeof listeners.ready, 'function', 'listens for reconnect');
listeners.ready(); await tick(); await tick();
assert.equal(calls, after + 1);

// Expired list: asks again on use.
window.__casoraPhotos.refreshAt = Date.now() - 1;
P('kueche', hass); await tick(); await tick();
assert.equal(calls, after + 2);

// Server error: empty list, no endless retries, demo still fine.
window.__casoraPhotos.map = null; window.__casoraPhotos.refreshAt = 0;
hass.callWS = () => { calls++; return Promise.reject(new Error('unknown command')); };
P('kueche', hass); await tick(); await tick();
const errCalls = calls;
assert.equal(P('kueche', hass), '/casora_assets/rooms/kueche.jpg');
assert.equal(calls, errCalls);
assert.equal(P('home-demo'), '/casora_assets/rooms/home-demo.jpg');

// Templates use the helpers.
const tpl = read('dashboards/casora/button_card_templates.json');
const T = JSON.parse(tpl);
assert.ok(T.casora_room.styles.card.some((x) => String(x['--hero-img'] || '').includes('casoraPhotoCss')), 'casora_room');
assert.ok(T.casora_mobile_bg.styles.card.some((x) => String(x['--casora-mobile-hero-src'] || '').includes('casoraPhotoUrl')), 'casora_mobile_bg');
assert.ok(String(T.casora_shared.extra_styles).includes('casoraPhotoUrl'), 'casora_shared preload');
assert.ok(read('custom_components/casora/scripts/filter-overlay.js').includes('casoraPhotoCss'), 'filter-overlay');

console.log('photos_signed: ok');
