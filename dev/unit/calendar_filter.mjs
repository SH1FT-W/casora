// Calendar filter: one title rule for the Agenda tile, the greeting, the screensavers and the Studio preview.
// The tile's pick is Upstream's rule (one event per calendar from the calendar states, a running event wins,
// then the earliest start); the filter only skips titles.
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraHomeNext,custom_components/casora/scripts/local/46-screensaver.js#S.context,custom_components/casora/scripts/local/06-kalender.js#K.next,custom_components/casora/scripts/local/06a-kalender-filter.js#casoraCalendarNext
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { loadCalendars } from './lib/calendars_block.mjs';

const read = (p) => fs.readFileSync(new URL(`../../custom_components/casora/scripts/local/${p}`, import.meta.url), 'utf8');

let settings = {};
const now = new Date(2054, 10, 13, 10).getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const window = { casoraSettings: () => settings, addEventListener() {} };
loadCalendars(window);
const context = vm.createContext({ window, document: { querySelector: () => null }, setTimeout: () => 0, console, Date: ClockDate });
vm.runInContext(read('06a-kalender-filter.js'), context);
vm.runInContext(read('06-kalender.js'), context);
const calendar = window._casoraCalendar;

// ── Title rule ────────────────────────────────────────────────────────────────
assert.equal(window.casoraCalendarAllows('Termin-bbbbbb ffffff'), true, 'empty settings hide nothing');
assert.equal(window.casoraCalendarAllows('Termin-bbbbbb ffffff', { calendar_filter: 'Termin-bbbbbb ffffff' }), false, 'the entry hides an identical title');
assert.equal(window.casoraCalendarAllows('termin-bbbbbb ffffff (a)', { calendar_filter: 'Termin-bbbbbb ffffff' }), false, 'matching ignores case and keeps fragments');
assert.equal(window.casoraCalendarAllows('Vrijdagmarkt', { calendar_filter: 'Termin-bbbbbb ffffff' }), true, 'a word inside an entry is no separate filter');
assert.equal(window.casoraCalendarAllows('Concert', { calendar_filter: 'a, , b' }), true, 'empty comma entries hide nothing');
assert.equal(window.casoraCalendarAllows('Ballet', { calendar_filter: 'a, , b' }), false, 'each comma entry matches on its own');
console.log('ok calendar filter title rule');

// ── Agenda tile: Upstream's pick, the filter skips titles ─────────────────────
const states = {
  'calendar.mock_day': { state: 'on', attributes: { message: 'Termin-bbbbbb ffffff', start_time: '2054-11-13 00:00:00', end_time: '2054-11-14 00:00:00', all_day: true } },
  'calendar.mock_meeting': { state: 'off', attributes: { message: 'Termin-gggggg', start_time: '2054-11-13 14:00:00', end_time: '2054-11-13 15:00:00', all_day: false } },
};
const variables = { calendars: Object.keys(states).map(entity => ({ entity })) };

settings = {};
assert.equal(calendar.tile(states, variables), 'Heute · Termin-bbbbbb ffffff', 'empty filter: the running all-day event wins, as on Upstream main');
settings = { calendar_filter: 'Termin-bbbbbb ffffff' };
assert.equal(calendar.tile(states, variables), 'Heute 14:00 · Termin-gggggg', 'a filtered running event leaves its calendar out of the pick');
settings = { calendar_filter: 'Termin-gggggg' };
assert.equal(calendar.tile(states, variables), 'Heute · Termin-bbbbbb ffffff', 'a filtered timed event never shows');
settings = { calendar_filter: 'Termin-gggggg, Termin-bbbbbb ffffff' };
assert.equal(calendar.tile(states, variables), 'Keine Termine', 'every title filtered: no event left');
console.log('ok Agenda tile pick with the filter');

// A calendar that casoraCalendars leaves out reaches no tile pick.
settings = {};
assert.equal(calendar.tile(states, { calendars: [{ entity: 'calendar.mock_meeting' }] }), 'Heute 14:00 · Termin-gggggg', 'only the calendars casoraCalendars gives count');
assert.equal(calendar.tile(states, { calendars: [{ entity: 'calendar.mock_day' }] }), 'Heute · Termin-bbbbbb ffffff', 'a calendar left out by casoraCalendars is not picked');
console.log('ok Agenda tile uses casoraCalendars');

// ── Greeting line ─────────────────────────────────────────────────────────────
settings = { calendar_filter: 'Termin-bbbbbb ffffff' };
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
vm.runInContext(finder.slice(finder.indexOf('// casora-home-next:start'), finder.indexOf('// casora-home-next:end')), context);
assert.equal(window.casoraHomeNext({ states }, { casora_greeting_next: true }, new ClockDate()), 'Heute 14:00 Termin-gggggg', 'the greeting excludes the filtered title');
console.log('ok greeting line uses the filter');

// ── Screensavers ──────────────────────────────────────────────────────────────
vm.runInContext(read('46-screensaver.js'), context);
const saver = window._casoraSaver;
const events = [
  { title: 'Termin-bbbbbb ffffff', start: now - 10 * 3600000, end: now + 14 * 3600000, allDay: true },
  { title: 'Termin-gggggg', start: now + 4 * 3600000, end: now + 5 * 3600000, allDay: false },
];
for (const kind of ['linie', 'woche', 'kalender']) {
  const view = saver.context({ kind, now: new ClockDate(), hass: { states: {} }, events, settings, rooms: [], sun: null, wx: null, daily: [], hourly: [], bins: [] });
  const html = saver.html(kind, view);
  assert.ok(!html.includes('Termin-bbbbbb ffffff') && html.includes('Termin-gggggg'), `${kind} applies the shared Calendar filter`);
}
console.log('ok screensavers apply the filter');
