// @deckt: custom_components/casora/scripts/local/46-screensaver.js#events,html
// Screensavers across a clock change (46-screensaver.js): the week, the day line and the calendar request count days
// by the calendar, not in 24-hour steps. Before, the week of 25.10. showed the 25th twice and lost the last day's
// appointments. The day line (a travelling window since #233) keeps the wall clock's hours across the change.
//   node dev/unit/screensaver_sommerzeit.mjs
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
const ctx = (now, o) => S.context({ hass: { states: {} }, now, vars: {}, sun: null, rooms: [], cals: [], events: [], bins: [], daily: [], hourly: [], media: null, energy: null, bell: [], people: [], cams: [], wx: null, ...o });

// The week before the clocks go back (Sunday 25.10.2026): seven different days, the 26th has its appointment.
const now = new Date(2026, 9, 24, 10, 0);
const ev = [{ title: 'Zahnarzt', start: +new Date(2026, 9, 26, 9, 0), end: +new Date(2026, 9, 26, 10, 0), allDay: false },
  { title: 'Sport', start: +new Date(2026, 9, 30, 0, 30), end: +new Date(2026, 9, 30, 1, 30), allDay: false }];
const html = S.html('woche', ctx(now, { events: ev }));
const days = [...html.matchAll(/class="cs-n">(\d+)</g)].map((m) => +m[1]);
assert.deepEqual(days, [24, 25, 26, 27, 28, 29, 30], 'seven calendar days, none twice');
const cols = html.split(/class="cs-col[" ]/).slice(1);
assert.match(cols[2], /Zahnarzt/, 'the appointment of the 26th stands on the 26th');
assert.match(cols[6], /Sport/, 'half past midnight on the 30th stands on the 30th');
assert.doesNotMatch(cols[5], /Sport/);

// The day line across the night the clocks go forward (29.03.2026, 2 o'clock becomes 3): its window is fifteen real
// hours ahead, the hours are the wall clock's (there is no 2, so 3 comes two real hours after midnight), and an
// appointment sits where its real distance from now puts it.
const eve = new Date(2026, 2, 28, 22, 0);
const line = S.html('linie', ctx(eve, { events: [{ title: 'Frühstück', start: +new Date(2026, 2, 29, 8, 0), end: +new Date(2026, 2, 29, 8, 30), allDay: false }] }));
assert.match(line, /Frühstück/, 'tomorrow morning is on the line in the evening');
const ticks = [...line.matchAll(/class="cs-tick[^"]*" style="left:([\d.]+)%">([^<]*)</g)].map((m) => [m[2], Number(m[1])]);
assert.deepEqual(ticks.map((t) => t[0]), ['21', 'So', '3', '6', '9', '12'], 'the wall clock\'s hours, midnight as the coming day');
const step = (a, b) => Math.round((ticks[b][1] - ticks[a][1]) / 100 * 18 * 10) / 10;
assert.deepEqual([step(0, 1), step(1, 2), step(2, 3)], [3, 2, 3], 'three real hours apart, two across the missing hour');
const left = Number((line.match(/class="cs-seg[^"]*" style="left:([\d.]+)%/) || [])[1]);
assert.ok(Math.abs(left - (3 + 9) / 18 * 100) < 0.1, 'eight o\'clock is nine real hours after ten in the evening: ' + left);
const nowAt = Number((line.match(/class="cs-now" style="left:([\d.]+)%/) || [])[1]);
assert.ok(Math.abs(nowAt - 3 / 18 * 100) < 0.1, 'now stands three hours into the window: ' + nowAt);

// The calendar request: from midnight to midnight, whatever the clock does in between.
const asked = [];
const hass = { callApi: (m, url) => { asked.push(decodeURIComponent(url)); return new Promise(() => {}); } };
S.events(hass, ['calendar.a'], 8, new Date(2026, 9, 24));
const q = asked[0].match(/start=([^&]+)&end=(.+)$/);
assert.equal(new Date(q[2]).getTime(), new Date(2026, 10, 1).getTime(), 'eight days from the 24th end at midnight of the 1st');
console.log('screensaver_sommerzeit: ok');
