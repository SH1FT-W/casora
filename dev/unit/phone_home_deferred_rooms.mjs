// Phone Home builds its hidden room sections after the load (w02-02).  node dev/unit/phone_home_deferred_rooms.mjs
// @deckt: custom_components/casora/scripts/smart-row.js#slimDeferIndices,_buildDeferred,_scheduleDeferred,casoraBuildDeferred,sectionIndices
// Found in the 26.11.26 review: the phone's Home row drew every room's header and tiles (hidden by _slimHome) while
// the page loaded, ~200 unseen button-cards with 30 rooms; load time grew with the number of rooms. Expected: the
// cards of the hidden sections (room headers up to the next other header, scene rows) are not made during the
// build; they come after casora-local-loaded on idle, at once on a filter (room/category page) or on
// window.casoraBuildDeferred(), each into its own wrapper. Room names made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
const timers = [], idles = [], listeners = {};
const win = {
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener() {},
  matchMedia: () => ({ matches: false }), innerWidth: 393,
  requestIdleCallback: (fn) => { idles.push(fn); },
};
const sandbox = {
  window: win,
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {},
  getComputedStyle: () => ({ display: 'block' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
  performance: { now: () => 0 },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'casora-smart-row defined');

const hdr = (name, more) => ({ type: 'custom:button-card', template: 'casora_mobile_header', name, ...more });
const row = (n) => ({ type: 'custom:casora-smart-row', scroll_mode: true, cards: Array.from({ length: n }, () => ({ type: 'custom:button-card' })) });
const cards = [
  { type: 'custom:button-card', template: 'casora_mobile_filter_badges' },  // 0
  { type: 'custom:casora-filter-overlay', room: 'Kitchen' },               // 1
  { type: 'custom:button-card', template: 'casora_mobile_sensor_chips' },   // 2
  hdr('Favorites', { variables: { favorites: true } }),                     // 3
  row(3),                                                                   // 4
  hdr('Kitchen'), row(4),                                                   // 5, 6
  hdr('Szenen'), { type: 'custom:button-card', template: 'casora_scene_row' }, // 7, 8
  hdr('Attic'), row(1),                                                     // 9, 10
];
const nav = { type: 'custom:casora-mobile-nav', rooms: [{ key: 'room_kitchen', name: 'Kitchen' }, { key: 'room_attic', name: 'Attic' }] };

// 1) The rule: room and scene sections, nothing else; no nav (Studio preview) or slim_home off: nothing.
const idx = [...win._casoraSlimDefer(cards, nav)].sort((a, b) => a - b);
assert.deepEqual(idx, [5, 6, 7, 8, 9, 10], 'room and scene sections are postponed');
assert.equal(win._casoraSlimDefer(cards, null).size, 0, 'no nav: nothing postponed');
assert.equal(win._casoraSlimDefer(cards, { ...nav, slim_home: false }).size, 0, 'slim_home off: nothing postponed');
assert.equal(win._casoraSlimDefer(cards.filter((c) => c.type !== 'custom:casora-filter-overlay'), nav).size, 0, 'only the Home row');

// 2) Building: a stand-in row with wrappers for every card, cards only outside the postponed set.
const made = [];
const mkWrapper = () => { const w = { kids: [], querySelector: () => null, insertBefore(c) { this.kids.push(c); } }; return w; };
const mkRow = () => {
  const r = Object.create(RowClass.prototype);
  const defer = win._casoraSlimDefer(cards, nav);
  Object.assign(r, { _config: { cards }, _helpers: { createCardElement: (cfg) => { const c = { cfg }; made.push(c); return c; } },
    _hass: { states: {} }, _haCards: [], isConnected: true, _deferred: new Set(defer) });
  r._wrappers = cards.map(() => mkWrapper());
  r._cards = cards.map((c, i) => (defer.has(i) ? null : { cfg: c }));
  return r;
};

const a = mkRow();
win._casoraSmartRows = new Set([a]);
a._scheduleDeferred();
assert.equal(made.length, 0, 'nothing built before casora-local-loaded');
assert.equal(timers.length, 0);
win._casoraLocalLoaded = true;
timers.length = 0;
listeners['casora-local-loaded'].at(-1)();
assert.equal(made.length, 0, 'nothing built right at casora-local-loaded');
assert.ok(timers.length === 1 && timers[0].ms >= 1000, 'starts after a delay');
timers.shift().fn();
while (idles.length) idles.shift()();
assert.equal(made.length, 6, 'all postponed cards built in the end');
assert.equal(a._deferred.size, 0);
[5, 6, 7, 8, 9, 10].forEach((i) => {
  assert.equal(a._cards[i] && a._cards[i].cfg, cards[i], 'card ' + i + ' in its slot');
  assert.equal(a._wrappers[i].kids[0], a._cards[i], 'card ' + i + ' in its own wrapper');
  assert.ok(a._cards[i].hass, 'card ' + i + ' got hass');
});

// 3) A room page builds its own section at once, before the cards get the hass; a category page all the rest.
made.length = 0;
const b = mkRow();
b._cardsCreated = true;
b._initialized = false;
b._scrollMode = true;
b.parentNode = { localName: 'hui-root', lovelace: { config: { views: [{ cards: [nav] }] } } };
const hass = { states: { 'input_select.casora_mobile_filter': { state: 'room_kitchen' } } };
b.hass = hass;
assert.deepEqual(made.map((c) => cards.indexOf(c.cfg)), [5, 6], 'a room page builds its own section at once');
assert.equal(b._cards[6].hass, hass, 'with the new hass');
b.hass = { states: { 'input_select.casora_mobile_filter': { state: 'lights' } } };
assert.equal(made.length, 6, 'a category page builds every hidden section');

// 4) window.casoraBuildDeferred: every row, synchronously.
made.length = 0;
const c = mkRow();
win._casoraSmartRows = new Set([c]);
assert.equal(win.casoraBuildDeferred('Attic'), 2, 'one room: its header and row');
assert.equal(c._deferred.size, 4);
assert.equal(win.casoraBuildDeferred(), 4);
assert.equal(c._deferred.size, 0);
assert.equal(win.casoraBuildDeferred(), 0, 'nothing left');
console.log('phone_home_deferred_rooms: ok');
