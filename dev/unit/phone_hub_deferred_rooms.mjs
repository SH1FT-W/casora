// The phone hub shows the rooms once their postponed tile rows are built (w02-02).  node dev/unit/phone_hub_deferred_rooms.mjs
// @deckt: custom_components/casora/scripts/local/35-phone-hub.js#roomsOf,sigOf,P.sec
// @deckt: custom_components/casora/scripts/smart-row.js#whenBuilt,_markBuilt
// Found in the 26.11.26 review of next/z2-leistung: the phone's Home builds its room sections after the load, and
// window.casoraBuildDeferred() makes a room's header and its tile row at once. The tile row is itself a
// casora-smart-row, which builds its tiles only later (await loadCardHelpers, a frame). The People popup opened
// before the idle build read an empty row, listed no room, and stayed so: the recheck compared only the overview.
// Expected: the hub draws again as soon as the room row has built, and a room appearing changes the signature.
// Room and person names made up.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/35-phone-hub.js', import.meta.url), 'utf8');

const node = (localName, extra = {}) => Object.assign({ nodeType: 1, localName, children: [], shadowRoot: null,
  isConnected: true, getBoundingClientRect: () => ({ width: 0, height: 0 }), querySelector: () => null }, extra);

// Home's row: a room header and the room's tile row, which has not built its tiles yet.
let built = null;
const tileRow = node('casora-smart-row', { _cardsCreated: false, _wrappers: [],
  whenBuilt() { return this._cardsCreated ? Promise.resolve() : new Promise((r) => { built = r; }); } });
const header = node('button-card', { _config: { template: ['casora_mobile_header'], name: 'Garden' } });
const wrap = (el) => node('div', { children: [el], querySelector: (q) => (q === el.localName ? el : null) });
const container = node('div', { children: [wrap(header), wrap(tileRow)] });
const overlay = node('casora-filter-overlay', { _config: { filter_category: 'presence' },
  _findContainerAndSelf: () => ({ container }) });
const ha = node('home-assistant', { shadowRoot: node('#shadow', { children: [overlay] }) });

const timers = [];
const window = {
  casoraBuildDeferred: () => 0,
  _casoraUI: {
    line: (t) => t, stage: () => '', empty: () => 'EMPTY',
    group: (rows, title) => '[' + (title || '') + ':' + rows.map((r) => r.label).join(',') + ']',
  },
};
const document = { querySelector: (q) => (q === 'home-assistant' ? ha : null) };
vm.runInNewContext(src, { window, document, getComputedStyle: () => ({ display: 'block' }), console,
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} });
const P = window._casoraPhoneHub;

let updates = 0;
const el = { isConnected: true, requestUpdate: () => { updates++; } };
const first = P.sec('presence', 'list', {}, { states: {} }, el);
assert.ok(!/Garden/.test(first), 'nothing to list while the row is unbuilt');

// The room row finishes its build.
const person = node('button-card', { _config: { template: ['x'], variables: { mobile_filter_category: 'presence' } },
  _stateObj: { entity_id: 'person.robin', state: 'home', attributes: { friendly_name: 'Robin' } } });
tileRow._wrappers = [wrap(person)];
tileRow._cardsCreated = true;
if (built) built();
for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
assert.equal(updates, 1, 'the hub draws again once the room row has built');
assert.match(P.sec('presence', 'list', {}, { states: {} }, el), /\[Garden:Robin\]/, 'the room is listed');

// The recheck alone also catches a room appearing (the signature holds the rooms).
const a = P.scan('presence');
const b = { sub: a.sub, chips: a.chips, rooms: [] };
assert.notEqual(P.sigOf(a), P.sigOf(b), 'rooms are part of the signature');

// smart-row: whenBuilt resolves when the build is done, at once when it is.
let RowClass = null;
const rowSrc = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 393 };
new Function('window', 'document', 'customElements', 'HTMLElement', 'getComputedStyle', 'requestAnimationFrame',
  'setTimeout', 'clearTimeout', 'ResizeObserver', 'performance', rowSrc)(
  win, { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) }, class {},
  () => ({ display: 'block' }), () => 0, () => 0, () => {}, class { observe() {} disconnect() {} }, { now: () => 0 });
const r = Object.create(RowClass.prototype);
let done = false;
r.whenBuilt().then(() => { done = true; });
await new Promise((res) => setImmediate(res));
assert.equal(done, false, 'not before the build');
r._cardsCreated = true;
r._markBuilt();
await new Promise((res) => setImmediate(res));
assert.equal(done, true, 'resolved by the build');
let again = false;
await r.whenBuilt().then(() => { again = true; });
assert.ok(again, 'a built row resolves at once');
console.log('phone_hub_deferred_rooms: ok');
