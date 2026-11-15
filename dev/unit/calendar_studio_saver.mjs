// Studio screensaver preview: the calendar filter from the settings draft hides matching titles.
// The Studio loads only scripts/local/06a-kalender-filter.js (no calendar module), so the screensaver
// reads the title rule from there, with the draft passed in as the settings.
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#S.context,S.sample,custom_components/casora/scripts/local/06a-kalender-filter.js#casoraCalendarAllows
//   node dev/unit/calendar_studio_saver.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/06a-kalender-filter.js'), box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
assert.ok(S && win.casoraCalendarAllows, 'the screensaver and the title rule load without the calendar module');
assert.equal(win._casoraCalendar, undefined, 'the Studio has no calendar module');

const now = new Date(2026, 10, 15, 10, 0);
const events = [{ title: 'Naam-aaaaaa (ochtend)' }, { title: 'Visible' }];
const titles = (settings) => S.context({ hass: { states: {} }, now, vars: {}, kind: 'woche', events, settings,
  rooms: [], sun: null, wx: null, daily: [], hourly: [], cams: [], media: null, cals: [] }).events.map((e) => e.title);

assert.deepEqual(titles({ calendar_filter: 'Naam-aaaaaa' }), ['Visible'],
  'the filter in the settings draft hides the matching title in the Studio preview');
assert.deepEqual(titles({ calendar_filter: 'visible' }), ['Naam-aaaaaa (ochtend)'],
  'plain title matching ignores case');
assert.deepEqual(titles({ calendar_filter: '' }), ['Naam-aaaaaa (ochtend)', 'Visible'],
  'an empty draft filter hides nothing');
assert.deepEqual(titles({}), ['Naam-aaaaaa (ochtend)', 'Visible'],
  'a draft without a filter hides nothing');
// With no calendar events, the Studio preview draws sample events; the filter hides them too.
const sampled = (settings) => S.sample(S.context({ hass: { states: {} }, now, vars: {}, kind: 'woche', events: [], settings,
  rooms: [], sun: null, wx: null, daily: [], hourly: [], cams: [], media: null, cals: [] })).events.map((e) => e.title);
assert.ok(sampled({}).includes('Mittagessen'), 'the preview draws sample events when no event is left');
assert.ok(!sampled({ calendar_filter: 'Mittagessen' }).includes('Mittagessen'), 'the filter hides a matching sample event');
assert.equal(sampled({ calendar_filter: 'Arzttermin, Mittagessen, Einkaufen, Kino' }).length, 0, 'all samples hidden: the preview shows no events');
console.log('ok Studio screensaver preview applies the calendar filter from the draft, samples too');
