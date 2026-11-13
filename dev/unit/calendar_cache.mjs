// Public Agenda/cache seam: redraws of independent tile configurations must settle.
// @deckt: custom_components/casora/scripts/local/06-kalender.js#K.next,load,K.load,K.repaint
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let now = new Date(2026, 10, 13, 10).getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const source = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8');
const states = {};
const configs = ['a', 'b'].map(name => ({ calendars: [{ entity: 'calendar.mock_' + name }] }));
const cards = configs.map(variables => ({ variables, _config: { state_display: 'window._casoraCalendar.next(states, variables)' } }));
let calls = 0, redraws = 0;
const ha = { hass: { states, callApi: async (method, path) => {
  calls++;
  // Bound the broken implementation without masking the request/redraw loop.
  if (calls > 10) return new Promise(() => {});
  return [{ summary: path.includes('mock_a?') ? 'Meeting A' : 'Meeting B',
    start: { dateTime: '2026-11-13T14:00:00' }, end: { dateTime: '2026-11-13T15:00:00' } }];
} }, shadowRoot: { querySelectorAll: selector => selector === 'button-card' ? cards : [] } };
const window = { casoraSettings: () => ({}), addEventListener() {}, casoraKick: card => {
  redraws++;
  card.event = window._casoraCalendar.next(states, card.variables);
} };
vm.runInNewContext(source, { window, document: { querySelector: () => ha }, Date: ClockDate, setTimeout: () => 0, console });
const calendar = window._casoraCalendar;
const settle = () => new Promise(resolve => setImmediate(resolve));
cards.forEach(card => { card.event = calendar.next(states, card.variables); });
await settle();
assert.equal(calls, 2, 'two visible calendar configurations each fetch once, even when completion redraws both');
assert.equal(cards[0].event?.name, 'Meeting A');
assert.equal(cards[1].event?.name, 'Meeting B');
assert.ok(redraws <= 4, 'both tiles settle instead of continuously redrawing each other');
calendar.load(ha.hass, configs[0]);
assert.ok(calendar.html('day', configs[0]).includes('Meeting A'), 'the popup reuses the selected tile cache');
assert.equal(calls, 2, 'opening the popup needs no second fetch path');
calendar.load(ha.hass, configs[1]);
calendar.next(states, configs[0]);
assert.ok(calendar.html('day', configs[1]).includes('Meeting B'), 'redrawing another tile does not replace the popup event view');
console.log('ok independent calendar tile configurations settle and share popup data');

states['calendar.mock_future'] = { state: 'off', attributes: { message: 'January meeting',
  start_time: '2027-01-15 14:00:00', end_time: '2027-01-15 15:00:00', all_day: false } };
const future = { calendars: [{ entity: 'calendar.mock_future' }] };
let requestedRange;
ha.hass.callApi = async (method, path) => { requestedRange = new URL('https://example.invalid/' + path).searchParams; return []; };
calendar.next(states, future);
await settle();
assert.ok(new Date(requestedRange.get('end')) < new Date('2027-01-15T14:00:00'), 'the January event is outside the API window');
assert.equal(calendar.next(states, future)?.name, 'January meeting', 'an empty API window preserves the next entity event outside that window');
states['calendar.mock_future'] = { state: 'off', attributes: { message: 'Removed meeting',
  start_time: '2026-11-14 14:00:00', end_time: '2026-11-14 15:00:00', all_day: false } };
calendar.next(states, future);
await settle();
assert.equal(calendar.next(states, future), null, 'authoritative empty results still remove stale entity events inside the window');
console.log('ok empty API windows preserve only out-of-window state candidates');

cards.length = 0;
let refreshes = 0;
ha.hass.callApi = async () => { refreshes++; return []; };
now += 299999;
calendar.next(states, future);
assert.equal(refreshes, 0, 'a completed calendar configuration is reused before the five-minute TTL');
now++;
calendar.next(states, future);
calendar.next(states, future);
assert.equal(refreshes, 1, 'TTL expiry refreshes once and repeated renders reuse the in-flight request');
await settle();
calendar.next(states, future);
assert.equal(refreshes, 1, 'the refreshed result starts a new bounded TTL');
console.log('ok calendar cache TTL and refresh deduplication');

const finishes = [];
ha.hass.callApi = async (method, path) => {
  if (path.includes('mock_a?')) return new Promise(resolve => finishes.push(resolve));
  return [{ summary: 'Meeting B', start: { dateTime: '2026-11-13T14:00:00' }, end: { dateTime: '2026-11-13T15:00:00' } }];
};
states['calendar.mock_a'] = { state: 'off', last_updated: 'first' };
calendar.load(ha.hass, configs[0]);
states['calendar.mock_a'] = { state: 'off', last_updated: 'second' };
calendar.load(ha.hass, configs[0]);
calendar.load(ha.hass, configs[1]);
await settle();
finishes[0]([]);
await settle();
assert.ok(calendar.html('day', configs[1]).includes('Meeting B'), 'a queued refresh of the previous popup cannot replace the current popup view');
finishes[1]([]);
await settle();
assert.ok(calendar.html('day', configs[1]).includes('Meeting B'), 'an old popup completion stays isolated from the current popup');
console.log('ok queued stale completions preserve the selected popup');

// Every completion redraws all visible tiles, including configurations beyond the old slot cap.
{
  const manyStates = {};
  const manyCards = Array.from({ length: 33 }, (_, i) => ({
    variables: { calendars: [{ entity: 'calendar.mock_' + i }] },
    _config: { state_display: 'window._casoraCalendar.next(states, variables)' },
  }));
  let requests = 0, renders = 0;
  const manyHa = { hass: { states: manyStates, callApi: async () => {
    requests++;
    if (requests > 200) return new Promise(() => {}); // Bound a refetch/redraw feedback loop.
    return [{ summary: 'Visible meeting', start: { dateTime: '2026-11-13T14:00:00' },
      end: { dateTime: '2026-11-13T15:00:00' } }];
  } }, shadowRoot: { querySelectorAll: selector => selector === 'button-card' ? manyCards : [] } };
  const manyWindow = { casoraSettings: () => ({}), addEventListener() {}, casoraKick: card => {
    renders++;
    card.event = manyWindow._casoraCalendar.next(manyStates, card.variables);
  } };
  vm.runInNewContext(source, { window: manyWindow, document: { querySelector: () => manyHa },
    Date: ClockDate, setTimeout: () => 0, console });
  const renderAll = () => manyCards.forEach(card => { card.event = manyWindow._casoraCalendar.next(manyStates, card.variables); });
  renderAll();
  await settle();
  assert.equal(requests, 33, '33 visible configurations settle with one fetch each');
  assert.ok(manyCards.every(card => card.event?.name === 'Visible meeting'), 'every visible tile receives its completed result');
  const settledRenders = renders;
  renderAll();
  renderAll();
  await settle();
  assert.equal(requests, 33, 'repeated redraws within the TTL never evict and refetch a visible configuration');
  assert.equal(renders, settledRenders, 'settled configurations do not start another completion/redraw cycle');
  console.log('ok 33 visible calendar configurations settle without eviction/refetch feedback');
}
