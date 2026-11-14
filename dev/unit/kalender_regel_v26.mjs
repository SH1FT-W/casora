// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraCalendars,isWasteCalendar,casoraHomeNext custom_components/casora/scripts/local/06-kalender.js#cals custom_components/casora/scripts/local/46-screensaver.js#calendars
// V26: one rule for which calendars count, the same on the calendar tile, the line under the greeting and the
// screensaver (window.casoraCalendars, 00-finder.js). Before, each chose on its own: a visible Workday calendar was on
// the tile but not under the greeting, the waste calendar was in the screensaver but not under the greeting.
// The rule: the tile's own list, else the Studio pick (Settings › Home & devices › Calendars), else every calendar
// except holidays/working days (Workday, Holiday), waste calendars and those disabled or hidden in Home Assistant.
//   node dev/unit/kalender_regel_v26.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { finderSrc } from './lib/calendars_block.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 9, 10, 0, 0);
const cal = (name, msg, start) => ({ state: 'off', attributes: { friendly_name: name, message: msg, start_time: start } });
const states = {
  'calendar.family': cal('Family', 'Dentist', '2026-11-10 15:00:00'),
  'calendar.work': cal('Work', 'Meeting', '2026-11-11 09:00:00'),
  'calendar.workday_sensor': cal('Workday Sensor', 'Workday Sensor', '2026-11-09 00:00:00'),
  'calendar.public_holidays': cal('Public holidays', 'Holiday', '2026-11-09 00:00:00'),
  'calendar.bins': cal('Bins', 'Organic', '2026-11-09 00:00:00'),
  'calendar.waste_collection_schedule_town': cal('Waste Collection Schedule Town', 'Paper', '2026-11-09 00:00:00'),
  'calendar.hidden': cal('Hidden', 'Secret', '2026-11-09 08:00:00'),
};
const entities = {
  'calendar.family': { platform: 'google' }, 'calendar.work': { platform: 'caldav' },
  'calendar.workday_sensor': { platform: 'workday' }, 'calendar.public_holidays': { platform: 'holiday' },
  'calendar.bins': { platform: 'local_calendar' }, 'calendar.waste_collection_schedule_town': { platform: 'local_calendar' },
  'calendar.hidden': { platform: 'google', hidden_by: 'user' },
};
const hass = { states, entities, locale: { language: 'en' } };

// The real finder: casoraDevice.waste finds the waste calendar set in the settings (calendar.bins) and casoraCalendars.
const win = { CASORA_SETTINGS: { waste: { calendar: 'calendar.bins' } }, addEventListener() {}, matchMedia: () => ({ matches: false }) };
const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener() {}, querySelectorAll: () => [] };
const box = { window: win, document: doc, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, WeakMap,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' },
  customElements: { define() {}, get: () => null, whenDefined: () => new Promise(() => {}) }, MutationObserver: class { observe() {} } };
vm.createContext(box);
win.document = doc;
vm.runInContext(finderSrc, box);
vm.runInContext(read('custom_components/casora/scripts/local/06-kalender.js'), box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
assert.equal(typeof win.casoraCalendars, 'function', 'shared rule in 00-finder.js');
assert.equal(win.casoraDevice.waste(hass, {}).calendar, 'calendar.bins', 'the waste calendar from the settings');

const J = (x) => JSON.parse(JSON.stringify(x));
const tile = (v) => J(win._casoraCalendar.cals(v || {}).map((c) => c.entity));
const greeting = () => win.casoraHomeNext(hass, { casora_greeting_next: true }, now);
const saver = (only) => J(win._casoraSaver.calendars(hass, only));

// Without a pick: the same two calendars everywhere.
const AUTO = ['calendar.family', 'calendar.work'];
assert.deepEqual(J(win.casoraCalendars(hass).map((c) => c.entity)), AUTO,
  'no Workday, no Holiday, no waste calendar (settings or Waste Collection Schedule), no hidden one');
assert.deepEqual(tile(), AUTO, 'calendar tile: the same calendars');
assert.deepEqual(saver([]), AUTO, 'screensaver: the same calendars');
assert.match(greeting(), /^Morgen 15:00 Dentist/, 'greeting: the earliest of the same calendars (not Workday, holiday or bins today)');
assert.ok(win._casoraCalendar.cals({}).every((c) => /^#[0-9A-F]{6}$/i.test(c.color) && c.name), 'automatic calendars get a name and colour');

// The Studio pick counts for all three; a calendar only for the popup (tile: false) is no appointment.
win.CASORA_SETTINGS = { waste: { calendar: 'calendar.bins' }, calendars: [{ entity: 'calendar.work', name: 'Work' }, { entity: 'calendar.family', tile: false }] };
assert.deepEqual(tile(), ['calendar.work', 'calendar.family'], 'tile: the pick, in its order (popup-only one in the popup)');
assert.deepEqual(saver([]), ['calendar.work'], 'screensaver: the pick without the popup-only one');
assert.match(greeting(), /^Wednesday 09:00 Meeting/, 'greeting: the pick without the popup-only one');
// A pick may name a calendar the automatic rule leaves out: it is the user's choice.
win.CASORA_SETTINGS = { calendars: ['calendar.workday_sensor'] };
assert.deepEqual(saver([]), ['calendar.workday_sensor'], 'a picked Workday calendar counts');

// A calendar tile with a list of its own keeps it; the others still follow the settings.
win.CASORA_SETTINGS = { waste: { calendar: 'calendar.bins' } };
assert.deepEqual(tile({ calendars: [{ entity: 'calendar.bins', name: 'Waste', color: '#30D158' }] }), ['calendar.bins'], 'tile: its own list wins');
assert.deepEqual(saver([]), AUTO, 'screensaver: not touched by one tile’s list');
// The screensaver's own pick still wins for the screensaver.
assert.deepEqual(saver(['calendar.work']), ['calendar.work'], 'screensaver: its own pick');

console.log('ok kalender_regel_v26');
