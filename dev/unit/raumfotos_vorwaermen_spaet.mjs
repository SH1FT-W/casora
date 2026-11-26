// Room photos warmed ahead (Prüfrunde w02-04): casora_shared warmed every room photo on idle callbacks, which fire
// often while the page loads: 17 photos (2.4 MB) went out beside the Casora scripts in the first 1-2 s. The chain
// now starts 2 s after the modules are in (casora-local-loaded), at the latest after 8 s; nothing is requested before.
//   node dev/unit/raumfotos_vorwaermen_spaet.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_shared
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json')).casora_shared;
const P = JSON.parse(rd('custom_components/casora/panel/casora-templates.json')).templates.casora_shared;
assert.ok(JSON.stringify(P.extra_styles).includes('casora-local-loaded'), 'built templates carry the late start');
const code = T.extra_styles.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

const run = (loaded) => {
  const requested = [], timers = [], listeners = {};
  const window = {
    _casoraLocalLoaded: loaded ? [] : undefined,
    matchMedia: () => ({ matches: false }),
    requestIdleCallback: (fn) => { timers.push({ fn, ms: 0, idle: true }); },
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  class Image { set src(v) { requested.push(v); } decode() { return Promise.resolve(); } }
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); };
  new Function('window', 'Image', 'setTimeout', 'hass', 'variables', code)(window, Image, setTimeout,
    { themes: { darkMode: false } }, { preload_rooms: ['kitchen-demo', 'garage-demo'] });
  return { requested, timers, listeners };
};

// Loading: nothing on the first idle callbacks, only a timer (fallback) and the event.
let r = run(false);
r.timers.filter((t) => t.idle).forEach((t) => t.fn());
assert.deepEqual(r.requested, [], 'no photo while the modules load');
assert.ok(typeof r.listeners['casora-local-loaded'] === 'function', 'waits for casora-local-loaded');
const fallback = r.timers.find((t) => !t.idle);
assert.ok(fallback && fallback.ms >= 5000, 'fallback start after some seconds');

// Modules in: a delayed start, then the photos one after another.
r = run(true);
assert.deepEqual(r.requested, [], 'not at once');
const delay = r.timers.find((t) => !t.idle);
assert.ok(delay && delay.ms >= 1000, 'a pause after the modules');
delay.fn();
r.timers.filter((t) => t.idle).forEach((t) => t.fn());
assert.equal(r.requested.length, 1, 'then the first photo');
console.log('ok raumfotos_vorwaermen_spaet');
