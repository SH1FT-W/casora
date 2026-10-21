// #38: Without calendars of one's own the calendar tile took every calendar.*, also those hidden in HA
// (Workday's calendars), which HA's calendar leaves out. Expected: hidden ones stay out; a list of
// one's own (Studio) still shows what it names.
//   node dev/unit/kalender_versteckt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const st = (name) => ({ state: 'off', attributes: { friendly_name: name } });
const hass = {
  states: { 'calendar.family': st('Family'), 'calendar.workday': st('Workday'), 'calendar.workday_tomorrow': st('Workday tomorrow') },
  entities: { 'calendar.family': {}, 'calendar.workday': { hidden: true }, 'calendar.workday_tomorrow': { hidden_by: 'user' } },
};
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null) };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8'))();
const ids = (v) => window._casoraCalendar.cals(v).map((c) => c.entity);

assert.deepEqual(ids({}), ['calendar.family'], 'hidden calendars stay out of the automatic list');
window.casoraSettings = () => ({ calendars: [{ entity: 'calendar.workday', name: 'Workday' }] });
assert.deepEqual(ids({}), ['calendar.workday'], 'a calendar of one’s own still shows, even if hidden');
console.log('ok kalender_versteckt');
