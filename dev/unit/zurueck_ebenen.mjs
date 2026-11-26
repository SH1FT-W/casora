// u06-01 (26.11.2026): the phone's back closes Casora's own layers first – sub page → page before, popup → closed,
// room → Home – and only then leaves the dashboard. window.casoraBack (casora-core.js) against a simulated session
// history (entries, async go() with popstate), plus the popup's and the phone room's wiring.
//   node dev/unit/zurueck_ebenen.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraBack,_backSync,_histPopup,_backBound
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const block = (start) => {
  const i = core.indexOf(start);
  assert.ok(i >= 0, 'block found: ' + start.slice(0, 50));
  return core.slice(i, core.indexOf('\n})();\n', i) + 6);
};
const BACK = block('(function () {\n  if (window.casoraBack) return;');

// A session history: entries with state, an index, pushState drops the forward ones, go() traverses later and fires
// popstate (as browsers do), timers run on flush().
function browser() {
  const timers = [];
  const listeners = [];
  const H = {
    entries: [{ url: '/dash/home', state: null }], at: 0,
    get state() { return this.entries[this.at].state; },
    pushState(state, _t, url) {
      this.entries.splice(this.at + 1);
      this.entries.push({ url: url || this.entries[this.at].url, state: JSON.parse(JSON.stringify(state)) });
      this.at++;
    },
    replaceState(state) { this.entries[this.at].state = state; },
    go(n) { timers.push({ ms: 1, fn: () => { const to = Math.max(0, Math.min(this.entries.length - 1, this.at + n)); if (to === this.at) return; this.at = to; listeners.forEach((f) => f()); } }); },
    back() { this.go(-1); },
  };
  const win = {
    history: H,
    addEventListener: (t, f) => { if (t === 'popstate') listeners.push(f); },
  };
  win.top = win;
  const flush = () => { for (let k = 0; k < 50 && timers.length; k++) { timers.sort((a, b) => a.ms - b.ms); timers.shift().fn(); } };
  const st = (fn, ms) => { timers.push({ ms: ms || 0, fn }); return timers.length; };
  new Function('window', 'setTimeout', 'clearTimeout', BACK)(win, st, () => {});
  // A user back: the browser traverses, popstate follows.
  const back = () => { H.go(-1); flush(); };
  return { win, H, B: win.casoraBack, flush, back };
}

// 1. A popup: one entry; back closes it and nothing else; the dashboard stays.
{
  const { H, B, back } = browser();
  let closed = 0;
  const p = B.push('popup', () => { closed++; });
  assert.equal(H.entries.length, 2, 'opening a popup adds one entry');
  assert.equal(H.entries[1].url, '/dash/home', 'same address (deep links stay)');
  back();
  assert.equal(closed, 1, 'back closes the popup');
  assert.equal(H.at, 0, 'still on the dashboard entry');
  assert.deepEqual(B.layers(), []);
  assert.equal(p.gone, true);
}

// 2. Closed by its X: the entry is taken back – the next back leaves the dashboard at once (no double back).
{
  const { H, B, flush } = browser();
  let closed = 0;
  const p = B.push('popup', () => { closed++; });
  B.release(p);
  flush();
  assert.equal(H.at, 0, 'X takes the entry back');
  assert.equal(closed, 0, 'its own close does not run onBack again');
  assert.equal(H.entries[H.at].state, null);
}

// 3. Room → popup → sub page: back, back, back walks down one layer at a time.
{
  const { H, B, back, flush } = browser();
  const log = [];
  B.push('room', () => log.push('home'));
  const pop = B.push('popup', () => log.push('close'));
  B.push('page', () => log.push('‹'));
  assert.equal(H.entries.length, 4);
  back(); assert.deepEqual(log, ['‹'], 'sub page: the page before');
  back(); assert.deepEqual(log, ['‹', 'close'], 'then the popup closes');
  back(); assert.deepEqual(log, ['‹', 'close', 'home'], 'then the room goes Home');
  assert.equal(H.at, 0);
  assert.deepEqual(B.layers(), []);
  void pop; void flush;
}

// 4. X on a popup with a sub page open: both entries go in one step; the room stays.
{
  const { H, B, flush, back } = browser();
  const log = [];
  B.push('room', () => log.push('home'));
  const pop = B.push('popup', () => log.push('close'));
  B.push('page', () => log.push('‹'));
  B.release(pop);
  flush();
  assert.equal(H.at, 1, 'back on the room entry');
  assert.deepEqual(B.layers(), ['room']);
  assert.deepEqual(log, []);
  back();
  assert.deepEqual(log, ['home'], 'the next back goes Home');
}

// 5. Closed and a new popup opened in the same tick: the push waits for nothing wrong, and back closes the new one.
{
  const { H, B, flush, back } = browser();
  const log = [];
  const a = B.push('popup', () => log.push('a'));
  B.release(a);
  B.push('popup', () => log.push('b'));
  flush();
  back();
  assert.deepEqual(log, ['b'], 'back closes the new popup, never the old one again');
  assert.deepEqual(B.layers(), []);
  void H;
}

// 6. Release while our own back is on its way: the next push waits until it arrived (never pushed before the back).
{
  const { H, B, flush, back } = browser();
  const log = [];
  B.push('popup', () => log.push('x'));
  const pg = B.push('page', () => log.push('‹'));
  B.release(pg);
  flush.call(null);   // the release's tick runs and go(-1) arrives
  const pg2 = B.push('page', () => log.push('‹2'));
  flush();
  assert.equal(H.entries.length, 3, 'popup + new page entry, the old page entry overwritten');
  back();
  assert.deepEqual(log, ['‹2']);
  void pg2;
}

// 7. The code navigates right after closing (gear → Studio, idle return): no go() undoes that navigation.
{
  const { H, B, flush } = browser();
  const p = B.push('popup', () => {});
  B.release(p);
  H.pushState(null, '', '/casora-studio');
  flush();
  assert.equal(H.entries[H.at].url, '/casora-studio', 'the navigation stands');
}

// 8. A popup that may not be dismissed: back keeps it (a new entry), the next back again.
{
  const { H, B, back } = browser();
  let tries = 0;
  const p = B.push('popup', () => { tries++; return false; });
  back();
  assert.equal(tries, 1);
  assert.deepEqual(B.layers(), ['popup'], 'still open');
  assert.equal(H.at, 1, 'with an entry again');
  assert.equal(p.gone, false);
}

// HA's dialog manager (home-assistant-frontend 20260930 to 20261028, make-dialog-manager): opening a dialog with
// history keeps the entry below and only adds a flag ({...state, opensDialog: true}, so Casora's mark stays), then
// pushes { dialog }; a second dialog over it replaces that entry. Its X closes with history.back().
const haOpen = (H, tag = 'ha-more-info-dialog') => {
  if (H.state && H.state.dialog) { H.replaceState({ dialog: tag }); return; }
  H.replaceState({ ...(H.state || {}), opensDialog: true });
  H.pushState({ dialog: tag }, '');
};

// 9. HA's own dialog over a popup: a back there is HA's (its dialog closes), the popup stays; the next back closes it.
{
  const { H, B, back } = browser();
  let closed = 0;
  B.push('popup', () => { closed++; });
  haOpen(H);
  back();
  assert.equal(closed, 0, 'HA closes its dialog, the popup stays');
  assert.deepEqual(B.layers(), ['popup']);
  back();
  assert.equal(closed, 1, 'the next back closes the popup');
  assert.equal(H.at, 0);
}

// 9b. Review 26.11.: a more-info opened and closed on the dashboard before a popup leaves its flag on the dashboard's
// entry; back still closes the popup (and the history is not left below an open popup).
{
  const { H, B, back } = browser();
  let closed = 0;
  haOpen(H);
  back();                                   // HA's X / back: the more-info is gone
  B.push('popup', () => { closed++; });
  back();
  assert.equal(closed, 1, 'back closes the popup');
  assert.deepEqual(B.layers(), []);
  assert.equal(H.at, 0);
}

// 9c. Review 26.11.: a more-info over a popup (or its sub page, or a phone room) keeps the layer's mark, so the X
// afterwards still takes the entry back – no dead entry, no double back.
{
  const { H, B, flush, back } = browser();
  let closed = 0;
  const p = B.push('popup', () => { closed++; });
  haOpen(H);
  back();                                   // the more-info closes
  assert.ok(H.state && H.state.casoraBack, 'the popup entry still carries its mark');
  B.release(p);                             // X on the popup
  flush();
  assert.equal(H.at, 0, 'X takes the popup entry back');
  assert.equal(closed, 0);
  const { H: H2, B: B2, flush: flush2 } = browser();
  B2.push('room', () => {});
  const pop = B2.push('popup', () => {});
  B2.push('page', () => {});
  haOpen(H2);
  haOpen(H2, 'ha-dialog-confirm');          // a second HA dialog over the first: HA replaces its entry
  H2.back(); flush2();
  B2.release(pop);
  flush2();
  assert.equal(H2.at, 1, 'popup and sub page entries taken back, the room entry stays');
  assert.deepEqual(B2.layers(), ['room']);
  void back;
}

// 10. Another page's entries (left and come back): a back that lands below every layer closes them all.
{
  const { H, B, back } = browser();
  const log = [];
  B.push('room', () => log.push('home'));
  B.push('popup', () => log.push('close'));
  H.go(-2);
  back.call(null);
  assert.deepEqual(log, ['close', 'home'], 'top first');
  void H;
}

// 11. The state's own keys stay, HA's dialog keys and the photo zoom flag do not travel into a layer's entry.
{
  const { H, B } = browser();
  H.replaceState({ root: true, dialog: 'x', open: true, casoraZoom: 1 });
  B.push('popup', () => {});
  assert.equal(H.state.root, true);
  assert.ok(!('dialog' in H.state) && !('open' in H.state) && !('casoraZoom' in H.state));
}

// 12. Not in a frame (Studio preview): no history at all.
{
  const win = { history: { pushState() { throw new Error('no push in a frame'); } }, addEventListener() {}, top: {} };
  new Function('window', 'setTimeout', 'clearTimeout', BACK)(win, () => 0, () => {});
  const l = win.casoraBack.push('popup', () => {});
  win.casoraBack.release(l);
  assert.deepEqual(win.casoraBack.layers(), []);
}

// ── Wiring ──────────────────────────────────────────────────────────────────
// The popup: one layer per opening, one more while a ‹ shows, both released on close.
{
  const cls = core.slice(core.indexOf('    _backSync(fresh) {'), core.indexOf('    dismiss() {'));
  assert.ok(cls.length > 100, '_backSync found');
  const open = core.slice(core.indexOf('    async open(data) {'), core.indexOf('    _checkEmpty(fresh) {'));
  assert.ok(/this\._backSync\(!wasOpen\);/.test(open), 'open() syncs the back layers after the ‹ is known');
  const close = core.slice(core.indexOf('    close() {\n      if (!this.hasAttribute(\'open\')'), core.indexOf('    close() {\n      if (!this.hasAttribute(\'open\')') + 1500);
  assert.ok(/casoraBack\.release\(this\._histPopup\)/.test(close), 'close() releases the popup layer');

  const { H, B, back, flush } = browser();
  const Pop = new Function('window', 'return class { ' + cls + ' };')({ casoraBack: B });
  const el = new Pop();
  let attrs = { open: true }, closes = 0, backs = 0;
  el.hasAttribute = (a) => !!attrs[a];
  el._dismissable = true;
  el.close = () => { closes++; attrs = {}; if (el._histPopup) B.release(el._histPopup); el._histPopup = el._histPage = null; };
  // fresh popup, top page
  el._backFn = null; el._backSync(true);
  assert.deepEqual(B.layers(), ['popup']);
  // a row opens a sub page (‹)
  el._backFn = () => { backs++; el._backFn = null; el._backSync(false); };
  el._backSync(false);
  assert.deepEqual(B.layers(), ['popup', 'page']);
  // sub page → sub page: still one page entry
  const deeper = el._backFn; el._backSync(false);
  assert.deepEqual(B.layers(), ['popup', 'page']);
  void deeper;
  back();
  assert.equal(backs, 1, 'back on the sub page = its ‹');
  assert.deepEqual(B.layers(), ['popup']);
  back();
  assert.equal(closes, 1, 'back on the top page closes');
  assert.equal(H.at, 0);
  flush();
}

// The phone room: Home → room pushes, room → room keeps, Home by another way releases; back goes Home.
{
  const ROOM = block('(function () {\n  var F = window._casoraFilter;\n  if (!F || F._backBound');
  const { H, B, back, flush } = browser();
  let cur = 'all';
  const fns = [];
  const F = { get: () => cur, set: (v) => { cur = v; fns.forEach((f) => f(v)); return v; }, share() {}, onChange: (f) => { fns.push(f); } };
  const owner = { isConnected: true, _closeMenu() {}, _set: (v) => F.set(v) };
  new Function('window', 'document', ROOM)({ _casoraFilter: F, casoraBack: B, _hmnOwner: owner }, { querySelector: () => null });
  F.set('room_kitchen');
  assert.deepEqual(B.layers(), ['room']);
  F.set('room_bath');
  assert.deepEqual(B.layers(), ['room'], 'swipe / menu to another room: same entry');
  back();
  assert.equal(cur, 'all', 'back goes Home');
  assert.equal(H.at, 0);
  F.set('room_kitchen');
  F.set('all');               // ‹ or the Home button
  flush();
  assert.equal(H.at, 0, 'Home by ‹ takes the entry back');
  assert.deepEqual(B.layers(), []);
}

console.log('zurueck_ebenen: ok');
