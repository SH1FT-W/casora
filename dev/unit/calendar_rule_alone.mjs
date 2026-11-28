// The shared calendar rule (06a-kalender-filter.js) loaded alone picks the same event as the calendar module's tile.
// @deckt: custom_components/casora/scripts/local/06a-kalender-filter.js#casoraCalendarNext,casoraCalendarAllows
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
const states = {
  'calendar.mock_day': { state: 'on', attributes: { message: 'Termin-bbbbbb ffffff', start_time: '2054-11-13 00:00:00', end_time: '2054-11-14 00:00:00', all_day: true } },
  'calendar.mock_meeting': { state: 'off', attributes: { message: 'Termin-gggggg', start_time: '2054-11-13 14:00:00', end_time: '2054-11-13 15:00:00', all_day: false } },
};
const cals = Object.keys(states).map(entity => ({ entity }));

// Alone: only the shared rule file and the calendar list (no calendar module, no popup).
const alone = { casoraSettings: () => settings, addEventListener() {} };
loadCalendars(alone);
vm.runInContext(read('06a-kalender-filter.js'), vm.createContext({ window: alone, Date: ClockDate, console }));
const pickAlone = (title) => alone.casoraCalendarNext(states, cals, new ClockDate(), (t, a) => alone.casoraCalendarAllows(t, null, a));

// With the module: the tile text the Agenda tile shows for the same states.
const mod = { casoraSettings: () => settings, addEventListener() {} };
loadCalendars(mod);
const ctx = vm.createContext({ window: mod, document: { querySelector: () => null }, setTimeout: () => 0, console, Date: ClockDate });
vm.runInContext(read('06a-kalender-filter.js'), ctx);
vm.runInContext(read('06-kalender.js'), ctx);
const tile = (variables) => mod._casoraCalendar.tile(states, variables);

// Literal expectations from the rule, not computed by the code under test.
const cases = [
  { settings: {}, name: 'Termin-bbbbbb ffffff', text: 'Heute · Termin-bbbbbb ffffff' },
  { settings: { calendar_filter: 'Termin-bbbbbb ffffff' }, name: 'Termin-gggggg', text: 'Heute 14:00 · Termin-gggggg' },
  { settings: { calendar_filter: 'Termin-gggggg' }, name: 'Termin-bbbbbb ffffff', text: 'Heute · Termin-bbbbbb ffffff' },
  { settings: { calendar_filter: 'Termin-gggggg, Termin-bbbbbb ffffff' }, name: null, text: 'Keine Termine' },
];
for (const c of cases) {
  settings = c.settings;
  const ev = pickAlone();
  assert.equal(ev ? ev.name : null, c.name, `alone picks ${c.name} for ${JSON.stringify(c.settings)}`);
  assert.equal(tile({ calendars: cals }), c.text, `module tile matches for ${JSON.stringify(c.settings)}`);
}
console.log('ok shared rule alone matches the calendar module tile pick');
