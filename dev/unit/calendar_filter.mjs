// Calendar filter: one title predicate shared by Home, the greeting and screensavers.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let settings = { calendar_filter: 'Naam vrij' };
const now = new Date(2026, 10, 13, 10).getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const window = { casoraSettings: () => settings, addEventListener() {} };
const context = vm.createContext({ window, document: { querySelector: () => null }, setTimeout: () => 0, console, Date: ClockDate });
vm.runInContext(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8'), context);
const calendar = window._casoraCalendar;

assert.equal(calendar.allowsTitle('Naam vrij'), false, 'the complete entry hides an identical title');
assert.equal(calendar.allowsTitle('naam vrij (ochtend)'), false, 'title fragments ignore case and preserve spaces');
assert.equal(calendar.allowsTitle('Vrijdagmarkt'), true, 'a word inside an entry is not a separate filter');
console.log('ok calendar filter title fragments');

settings = { calendar_filter: 'a, , b' };
assert.equal(calendar.allowsTitle('Concert'), true, 'empty comma entries do not hide every title');
assert.equal(calendar.allowsTitle('Ballet'), false, 'each comma entry matches independently');
settings = { calendar_filter: '' };
assert.equal(calendar.allowsTitle('Naam vrij'), true, 'the default empty filter hides nothing');
settings = { calendar_filter: ' Naam vrij, verlof ' };
assert.equal(calendar.allowsTitle('Verlof'), false, 'entries are trimmed');

const states = {
  'calendar.mock_day': { state: 'on', attributes: { message: 'Naam vrij', start_time: '2026-11-13 00:00:00', end_time: '2026-11-14 00:00:00', all_day: true } },
  'calendar.mock_meeting': { state: 'off', attributes: { message: 'Overleg', start_time: '2026-11-13 14:00:00', end_time: '2026-11-13 15:00:00', all_day: false } },
};
const variables = { calendars: Object.keys(states).map(entity => ({ entity })) };
assert.equal(calendar.tile(states, variables), 'Heute 14:00 · Overleg', 'a filtered all-day event never wins the Agenda tile');
settings = {};
assert.equal(calendar.tile(states, variables), 'Heute 14:00 · Overleg', 'a timed event later today wins over a running all-day event without a filter');
states['calendar.mock_meeting'].attributes.start_time = '2026-11-14 09:00:00';
states['calendar.mock_meeting'].attributes.end_time = '2026-11-14 10:00:00';
assert.equal(calendar.tile(states, variables), 'Heute · Naam vrij', 'the running all-day event wins when no timed event remains today');
settings = { calendar_filter: 'Naam vrij' };
assert.equal(calendar.tile(states, variables), 'Morgen 09:00 · Overleg', 'without a visible event today the tile shows the next event');
console.log('ok Agenda tile selection and Calendar filter');

const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
vm.runInContext(finder.slice(finder.indexOf('// casora-home-next:start'), finder.indexOf('// casora-home-next:end')), context);
assert.equal(window.casoraHomeNext({ states }, { casora_greeting_next: true }, new ClockDate()), 'Morgen 09:00 Overleg', 'the greeting excludes the same filtered title');

vm.runInContext(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/46-screensaver.js', import.meta.url), 'utf8'), context);
const saver = window._casoraSaver;
const events = [
  { title: 'Naam vrij', start: now - 10 * 3600000, end: now + 14 * 3600000, allDay: true },
  { title: 'Overleg', start: now + 4 * 3600000, end: now + 5 * 3600000, allDay: false },
];
for (const kind of ['linie', 'woche']) {
  const view = saver.context({ kind, now: new ClockDate(), hass: { states: {} }, events, rooms: [], sun: null, wx: null, daily: [], hourly: [], bins: [] });
  const html = saver.html(kind, view);
  assert.ok(!html.includes('Naam vrij') && html.includes('Overleg'), `${kind} applies the shared Calendar filter`);
}

calendar.load({ callApi: async () => [{ summary: 'Naam vrij', start: { date: '2026-11-13' }, end: { date: '2026-11-14' } }] }, { calendars: [{ entity: 'calendar.mock_day', name: 'Mock calendar' }] });
await new Promise(resolve => setImmediate(resolve));
assert.ok(calendar.html('day', { calendars: [{ entity: 'calendar.mock_day', name: 'Mock calendar' }] }).includes('Naam vrij'), 'the popup still shows a title hidden from Home');
console.log('ok shared filter in greeting and screensavers, unfiltered popup');

class Panel {}
const elements = [], rows = [];
const element = () => ({ dataset: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} });
const document = { createElement: tag => { const el = element(); elements.push({ tag, el }); return el; } };
vm.runInNewContext(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-personal.js', import.meta.url), 'utf8'), {
  window, document, customElements: { whenDefined: () => Promise.resolve(), get: () => Panel },
});
await Promise.resolve();
const saved = { calendar_filter: 'verlof' }, draft = window.casoraPersonal.normalize(saved);
const panel = new Panel();
panel.shadowRoot = { getElementById: () => ({}) };
panel._hass = { states: {} };
panel._flowGroup = () => ({ parentElement: element() });
panel._flowRow = (list, options) => { rows.push(options); return { row: element() }; };
panel._casoraPersonalGroups(element(), draft, ['calendars'], () => {});
assert.ok(rows.some(row => row.title === 'Hide when the title contains'), 'Calendars settings expose the exact filter label');
assert.ok(rows.some(row => row.sub === 'Separate entries with commas; an entry may have several words. The calendar popup still shows them.'), 'Calendars settings explain comma entries and the unfiltered popup');
const field = elements.find(({ tag, el }) => tag === 'input' && el.value === 'verlof').el;
field.value = 'Naam vrij'; field.oninput();
assert.equal(saved.calendar_filter, 'verlof', 'typing changes only the draft, not saved settings');
assert.equal(window.casoraPersonal.prune(draft).calendar_filter, 'Naam vrij', 'the draft retains the filter for the existing save path');

vm.runInNewContext(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8'), {
  window, document, customElements: { whenDefined: () => Promise.resolve(), get: () => Panel },
});
await Promise.resolve();
let persisted = saved;
panel._hass.callWS = async msg => {
  if (msg.type === 'casora/settings/get') return { settings: persisted, stored: true };
  if (msg.type === 'casora/settings/set') { persisted = msg.settings; return { settings: persisted, stored: true }; }
  throw { code: 'unknown_command' };
};
panel.shadowRoot.querySelectorAll = () => [];
panel._csRepaint = () => {};
panel._status = () => {};
panel._cs = { S: draft, S0: JSON.stringify(saved) };
assert.equal(panel._csOwnDirty(), true, 'typing marks the settings draft dirty');
assert.equal(await panel._csSave(), true, 'the existing Save settings action succeeds');
assert.equal(persisted.calendar_filter, 'Naam vrij', 'Save settings persists the filter');
panel._cs.S.calendar_filter = 'discard this';
await panel._csDiscardAll();
assert.equal(panel._cs.S.calendar_filter, 'Naam vrij', 'Discard restores the saved filter');
assert.equal(panel._csOwnDirty(), false, 'Discard clears the dirty state');
console.log('ok Calendar filter settings draft, save and discard');
