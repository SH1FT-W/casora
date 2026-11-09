// #157: the line under the Home greeting: off by default, next calendar event and next waste pickup.   node dev/unit/begruessung_naechstes.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraHomeNext
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const a = src.indexOf('// casora-home-next:start'), b = src.indexOf('// casora-home-next:end');
assert.ok(a > 0 && b > a, 'block found');
const window = {};
new Function('window', src.slice(a, b))(window);
const now = new Date(2026, 10, 9, 10, 0, 0);
const cal = (msg, start, extra) => ({ state: 'off', attributes: { message: msg, start_time: start, ...extra } });
const on = { casora_greeting_next: true };
const next = (S, W) => { window.casoraDevice = { waste: () => W || { bins: [] } }; return window.casoraHomeNext({ states: S, locale: { language: 'de' } }, on, now); };

assert.equal(window.casoraHomeNext({ states: {} }, {}, now), '', 'off by default');
assert.equal(next({}), '', 'nothing due: no line');
assert.equal(next({ 'calendar.a': cal('Zahnarzt', '2026-11-09 15:00:00') }), 'Heute 15:00 Zahnarzt', 'today with time');
assert.equal(next({ 'calendar.a': cal('Spät', '2026-11-11 09:00:00'), 'calendar.b': cal('Früh', '2026-11-10 08:05:00') }), 'Morgen 08:05 Früh', 'the earliest of all calendars');
assert.equal(next({ 'calendar.a': cal('Urlaub', '2026-11-09 00:00:00', { all_day: true }) }), 'Heute Urlaub', 'all day: no time');
assert.equal(next({ 'calendar.a': { state: 'on', attributes: { message: 'Läuft', start_time: '2026-11-09 09:00:00' } } }), 'Jetzt Läuft', 'running now');
assert.equal(next({}, { bins: [{ label: 'Bio', days: 2 }, { label: 'Restmüll', days: 1 }] }), 'Morgen Restmüll', 'nearest bin');
assert.equal(next({ 'calendar.a': cal('Zahnarzt', '2026-11-09 15:00:00') }, { bins: [{ label: 'Bio', days: 0 }] }), 'Heute 15:00 Zahnarzt · Heute Bio', 'both in one line');
assert.equal(next({ 'calendar.waste': cal('Bio', '2026-11-09 00:00:00', { all_day: true }) }, { calendar: 'calendar.waste', bins: [] }), '', 'the waste calendar is not an event');
assert.match(next({}, { bins: [{ label: 'Papier', days: 3 }] }), /^Donnerstag Papier$/, 'a weekday within the week');
assert.equal(next({}, { bins: [{ label: 'Papier', days: null }] }), '', 'no date: left out');
console.log('ok – line under the greeting');
