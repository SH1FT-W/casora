// Public redraw seam: calendar completions share core batching without widening the card filter.
// @deckt: custom_components/casora/scripts/local/06-kalender.js#K.repaint,kickTiles,custom_components/casora/scripts/casora-core.js#casoraKickAll
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const calendarSource = read('custom_components/casora/scripts/local/06-kalender.js');
const calendarCard = { localName: 'button-card', _config: { state_display: 'window._casoraCalendar.tile(states)' } };
const otherCard = { localName: 'button-card', _config: { state_display: 'Other tile' } };
const popupOnly = { localName: 'button-card', _config: { custom_fields: { popup: 'window._casoraCalendar.popup()' } } };
const cards = [calendarCard, otherCard, popupOnly];
let walks = 0;
const root = { querySelectorAll(selector) {
  if (selector === '*') { walks++; return cards; }
  return selector === 'button-card' ? cards : [];
} };
const ha = { shadowRoot: root };
const timers = [];
const kicked = [];
const window = { addEventListener() {}, casoraKick: card => kicked.push(card), _casoraLocalLoaded: true };
const context = vm.createContext({ window, document: { querySelector: () => ha, querySelectorAll: root.querySelectorAll },
  setTimeout: fn => { timers.push(fn); return timers.length; }, console });
// Run the real core batch helper, observing only its public redraw API.
vm.runInContext(core.slice(core.indexOf("  if (typeof window.casoraKickAll !== 'function') {"),
  core.indexOf('  if (!window.CASORA_FILTER_CATEGORIES)')), context);
vm.runInContext(calendarSource, context);
timers.length = 0; // Startup timers are unrelated to explicit repaints.
const calendar = window._casoraCalendar;
calendar.repaint();
calendar.repaint();
window.casoraKickSoon(calendarCard);
assert.equal(kicked.length, 0, 'calendar repaints wait for the shared redraw batch');
timers.splice(0).forEach(fn => fn());
assert.deepEqual(kicked, [calendarCard], 'repeated calendar repaints and a direct kick redraw the matching tile once');
// Each repaint still checks popup fields; the batch adds exactly one card traversal.
const afterBatch = walks;
kicked.length = 0;
calendar.repaint();
const beforeFlush = walks;
timers.splice(0).forEach(fn => fn());
assert.equal(walks - beforeFlush, 1, 'the core performs one shared card traversal');
assert.ok(afterBatch > 0);
assert.deepEqual(kicked, [calendarCard], 'unrelated cards and popup-only calendar references stay untouched');
delete window.casoraKickAll;
kicked.length = 0;
calendar.repaint();
assert.deepEqual(kicked, [calendarCard], 'without the core helper the filtered fallback still redraws calendar tiles');
console.log('ok calendar redraws share core batching and preserve the tile filter');
