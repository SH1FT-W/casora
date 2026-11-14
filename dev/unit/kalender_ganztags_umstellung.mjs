// @deckt: custom_components/casora/scripts/local/06-kalender.js#row
// Calendar popup (06-kalender.js): an all-day appointment on the day the clocks go back (25.10.2026, 25 hours) is
// one day; it said „bis So“ (until itself) like a two-day one. One that really spans two days still says until when.
//   node dev/unit/kalender_ganztags_umstellung.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const hass = { states: { 'calendar.family': { state: 'off', attributes: { friendly_name: 'Family' } } }, entities: {} };
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null) };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8'))();
const K = window._casoraCalendar;
const ev = (name, d0, d1) => ({ name, loc: '', start: new Date(2026, 9, d0), end: new Date(2026, 9, d1), allDay: true, cal: 'calendar.family' });
const sub = (html, name) => (html.split(name + '</div><div class="hcal-ts">')[1] || '').split('</div>')[0];

// The day the clocks go back.
K.ev = [ev('Herbstfest', 25, 26), ev('Ausflug', 25, 27)];
K.sel = '2026-10-25';
const day = K.html('day', {});
assert.ok(day.includes('Herbstfest'), 'the appointment is listed');
assert.doesNotMatch(sub(day, 'Herbstfest'), /bis/, 'one day long (25 hours): no „bis“');
assert.match(sub(day, 'Ausflug'), /bis /, 'two days long: says until when');

// The day the clocks go forward (23 hours): a two-day one that starts the day before still says until when.
K.ev = [{ ...ev('Messe', 28, 30), start: new Date(2026, 2, 28), end: new Date(2026, 2, 30) }];
K.sel = '2026-03-28';
assert.match(sub(K.html('day', {}), 'Messe'), /bis /, '28.–29.03. (47 hours): two days');
console.log('ok kalender_ganztags_umstellung');
