// @deckt: custom_components/casora/scripts/local/46-screensaver.js#use12,timeText,hm,html,vars
// The screensaver's times follow the dashboard's „12-hour clock“ switch (use_12h) like the clock in the top bar
// (Prüfrunde u03-01): before, it read only the HA profile's time format and showed „08:13“ next to „8:13 AM“.
//   node dev/unit/screensaver_12h.mjs
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array, Promise,
  setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
const now = new Date(2026, 10, 26, 8, 13);
const sun = { rise: +new Date(2026, 10, 26, 6, 44), set: +new Date(2026, 10, 26, 18, 50) };
const hass = { states: {}, locale: { language: 'de', time_format: '24' }, language: 'de' };
const ctx = (vars) => S.context({ hass, now, vars, sun, rooms: [], cals: [], events: [], bins: [], daily: [], hourly: [], media: null, energy: null, bell: [], people: [], cams: [], wx: null });
const time = (html) => (html.match(/class="cs-time">([^<]*)</) || [])[1];

// The switch on: the big time and sunrise read in 12 hours, though the profile says 24.
const on = S.html('himmel', ctx({ use_12h: true }));
assert.equal(time(on), '8:13', 'the clock without a leading zero: ' + time(on));
assert.match(on, /6:44\s?AM/, 'sunrise in 12 hours');
assert.doesNotMatch(on, /06:44/);
// The switch off: 24 hours even where the profile says 12.
const off = S.html('himmel', S.context({ hass: { ...hass, locale: { language: 'en', time_format: '12' } }, now, vars: { use_12h: false }, sun, rooms: [] }));
assert.equal(time(off), '08:13');
assert.match(off, /06:44/);
// Not set: the profile's format as before.
assert.equal(time(S.html('himmel', ctx({}))), '08:13');
// The dashboard's settings carry the switch (S.vars feeds both the tablet and the Studio preview).
assert.equal(S.vars({ views: [{ cards: [{ variables: { use_12h: true } }] }] }).use_12h, true);
console.log('screensaver_12h: ok');
