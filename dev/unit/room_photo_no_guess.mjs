// Room photos before casora-core.js has loaded.  node dev/unit/room_photo_no_guess.mjs
// Found in the gate for 26.11.2 (crawler, phone-webkit): under load the templates were drawn before casora-core.js
// defined casoraPhotoUrl and guessed /casora_assets/rooms/<room>(-night).jpg for own photos – a 404 per room.
// Expected: without casoraPhotoUrl only shipped demo photos (…-demo, …-demo-night) get an address on
// /casora_assets/rooms; own photos wait for the next draw (signed URL). Room names made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const styleOf = (tpl, key) => { for (const o of T[tpl].styles.card) if (o && o[key] != null) return o[key]; throw new Error(tpl + ' ' + key); };

const requested = [];
class FakeImage { set src(v) { requested.push(v); } decode() { return Promise.resolve(); } }
const head = { appendChild: (el) => { styleEl = el; } };
let styleEl = null;
const doc = { getElementById: () => styleEl, createElement: () => ({ textContent: '' }), head };
const run = (code, variables, dark) => {
  const window = { matchMedia: () => ({ matches: dark }), requestIdleCallback: (fn) => fn() };
  const hass = { themes: { darkMode: dark } };
  return new Function('window', 'document', 'Image', 'hass', 'variables', 'states', 'entity', code)(window, doc, FakeImage, hass, variables, {}, null);
};
const own = /\/casora_assets\/rooms\/(?!\S*-demo(-night)?\.)/;

for (const dark of [false, true]) {
  // 1) Preload list (casora_shared).
  requested.length = 0;
  run(body(T.casora_shared.extra_styles), { preload_rooms: ['schlafzimmer', 'garden-demo'] }, dark);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!requested.some((u) => own.test(u)), 'preload guessed an own photo: ' + requested.join(', '));
  assert.ok(requested.some((u) => /garden-demo/.test(u)), 'the demo photo is still preloaded');
  // 2) Room hero (casora_room --hero-img).
  const css = run(body(styleOf('casora_room', '--hero-img')), { image: 'schlafzimmer' }, dark);
  assert.ok(!own.test(css), 'room hero guessed an own photo: ' + css);
  assert.match(run(body(styleOf('casora_room', '--hero-img')), { image: 'garden-demo' }, dark), /garden-demo/);
  // 3) Phone wallpaper (casora_mobile_bg).
  styleEl = null;
  run(body(styleOf('casora_mobile_bg', '--casora-mobile-hero-src')), { image: 'schlafzimmer' }, dark);
  assert.ok(!styleEl || !own.test(styleEl.textContent), 'wallpaper guessed an own photo: ' + (styleEl && styleEl.textContent));
}
console.log('room_photo_no_guess: ok');
