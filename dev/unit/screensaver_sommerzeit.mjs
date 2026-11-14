// @deckt: custom_components/casora/scripts/local/46-screensaver.js#events,html
// Screensavers across a clock change (46-screensaver.js): the week, the day line and the calendar request count days
// by the calendar, not in 24-hour steps. Before, the week of 25.10. showed the 25th twice and lost the last day's
// appointments; the day line of 29.03. started at seven.
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

// The day line on 29.03.2026 (clocks go forward): from 6 to 24 o'clock of that day.
const spring = new Date(2026, 2, 29, 12, 0);
const line = S.html('linie', ctx(spring, { events: [{ title: 'Frühstück', start: +new Date(2026, 2, 29, 6, 30), end: +new Date(2026, 2, 29, 7, 0), allDay: false }] }));
assert.match(line, /Frühstück/, 'an appointment at half past six is on the line');
const left = Number((line.match(/class="sv-dot[^"]*" style="left:([\d.]+)%/) || [])[1]);
assert.ok(Math.abs(left - 0.5 / 18 * 100) < 0.2, 'half past six sits half an hour after the start: ' + left);
const nowAt = Number((line.match(/class="cs-now" style="left:([\d.]+)%/) || [])[1]);
assert.ok(Math.abs(nowAt - 6 / 18 * 100) < 0.2, 'noon sits at six of eighteen hours: ' + nowAt);

// The calendar request: from midnight to midnight, whatever the clock does in between.
const asked = [];
const hass = { callApi: (m, url) => { asked.push(decodeURIComponent(url)); return new Promise(() => {}); } };
S.events(hass, ['calendar.a'], 8, new Date(2026, 9, 24));
const q = asked[0].match(/start=([^&]+)&end=(.+)$/);
assert.equal(new Date(q[2]).getTime(), new Date(2026, 10, 1).getTime(), 'eight days from the 24th end at midnight of the 1st');
console.log('screensaver_sommerzeit: ok');
