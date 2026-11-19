// Idle return and Idle close (Wall tablet): one pure function, idleDecision, in the Idle return block of
// casora-core.js. A popup open pauses Idle return; Idle close counts from the later of the last touch and the
// moment the popup opened. Phones and Off change nothing.   node dev/unit/idle_decision.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#idleDecision
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const m = core.match(/\n\/\/ Return to Home after a spell[\s\S]*?\n\}\)\(\);\n/);
assert.ok(m, 'Idle return block in casora-core.js');

const MIN = 60000;
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message.split('\n')[0]]);
  }
}

// Runs the block with a fake window, document, location and history. Returns the parts a test needs.
let clock = 0;
const realNow = Date.now;
Date.now = () => clock;
function loadBlock({ pathname = '/dash/room', idle = '1', close = '0', tablet = true, popup = null, openedAt = 0 } = {}) {
  const window = {
    addEventListener() {},
    dispatchEvent() {},
    casoraIsWallTablet: () => tablet,
    casoraPopup: {
      surface: popup,
      openedAt,
      closes: 0,
      close() { this.closes++; this.surface = null; },
    },
  };
  const views = [
    { path: 'home', cards: [{ variables: { casora_idle_home: idle, casora_idle_close: close } }] },
    { path: 'room', cards: [{}] },
  ];
  const hui = { lovelace: { editMode: false, config: { views } }, isConnected: true };
  const document = {
    hidden: false,
    addEventListener() {},
    querySelector: (sel) => (sel === 'hui-root' ? hui : null),
    querySelectorAll: () => [],
  };
  const location = { pathname, search: '' };
  const pushes = [];
  const history = { pushState: (_s, _t, url) => { pushes.push(url); location.pathname = url; } };
  let tick = null;
  const CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  new Function('window', 'document', 'location', 'history', 'setInterval', 'CustomEvent', m[0])(
    window, document, location, history, (fn) => { tick = fn; }, CustomEvent,
  );
  return { window, pushes, tick: () => tick() };
}

// The pure function alone: cut out of the block as source text (no window global needed).
const fnStart = m[0].indexOf('  function idleDecision(s) {');
const fnEnd = m[0].indexOf('\n  }\n', fnStart) + '\n  }\n'.length;
assert.ok(fnStart > 0 && fnEnd > fnStart, 'idleDecision in the Idle return block');
const idleDecision = new Function(m[0].slice(fnStart, fnEnd) + '\nreturn idleDecision;')();
const MIN_AWAY = 10 * MIN; // "now" for the cases below
const base = { now: MIN_AWAY, lastTouch: 0, popupOpen: false, popupOpenedAt: 0, onHome: false, idleHomeMins: 1, idleCloseMins: 0, isWallTablet: true };
const decide = (over) => idleDecision({ ...base, ...over });
const nothing = (d) => assert.deepEqual([d.close, d.home], [false, false]);
const goHome = (d) => assert.deepEqual([d.close, d.home], [false, true]);
const closeOnly = (d) => assert.deepEqual([d.close, d.home], [true, false]);
const closeAndHome = (d) => assert.deepEqual([d.close, d.home], [true, true]);

check('phone (not a Wall tablet) → nothing', () => {
  nothing(decide({ isWallTablet: false }));
  nothing(decide({ isWallTablet: false, popupOpen: true, now: 90 * MIN }));
  nothing(decide({ isWallTablet: false, popupOpen: true, now: 90 * MIN, idleCloseMins: 2 }));
  nothing(decide({ isWallTablet: false, idleCloseMins: 1, popupOpen: true, popupOpenedAt: 0, lastTouch: 0, now: 5 * MIN }));
});
check('Idle close Off → popup stays (an hour too)', () => {
  nothing(decide({ idleCloseMins: 0, idleHomeMins: 0, popupOpen: true, popupOpenedAt: 0, lastTouch: 0, now: 60 * MIN }));
});
check('Idle close: popup opened by a tap, 2 minutes after the last touch → close', () => {
  const at = { idleCloseMins: 2, idleHomeMins: 0, popupOpen: true, popupOpenedAt: 0, lastTouch: 0 };
  nothing(decide({ ...at, now: 2 * MIN - 1000 }));
  closeOnly(decide({ ...at, now: 2 * MIN }));
});
check('Idle close: Ring popup opened after 20 min without a touch, Idle close 2 → nothing at 1:59, close at 2:00', () => {
  const ring = { idleCloseMins: 2, idleHomeMins: 0, popupOpen: true, popupOpenedAt: 20 * MIN, lastTouch: 0 };
  nothing(decide({ ...ring, now: 22 * MIN - 1000 }));
  closeOnly(decide({ ...ring, now: 22 * MIN }));
});
check('Idle close: no popup open → nothing', () => {
  nothing(decide({ idleCloseMins: 1, popupOpen: false, popupOpenedAt: 0, lastTouch: 0, now: 60 * MIN, idleHomeMins: 0 }));
});
check('Idle close shuts the popup and Idle return has passed → close then Home in one answer', () => {
  closeAndHome(decide({ idleCloseMins: 2, idleHomeMins: 2, popupOpen: true, popupOpenedAt: 0, lastTouch: 0, now: 2 * MIN }));
});
check('Idle close 5, Idle return 2 → nothing at 4:59, close then Home at 5', () => {
  const x = { idleCloseMins: 5, idleHomeMins: 2, popupOpen: true, popupOpenedAt: 0, lastTouch: 0 };
  nothing(decide({ ...x, now: 5 * MIN - 1000 }));
  closeAndHome(decide({ ...x, now: 5 * MIN }));
});
check('Idle close while on Home: close, no Home', () => {
  closeOnly(decide({ idleCloseMins: 1, idleHomeMins: 1, onHome: true, popupOpen: true, popupOpenedAt: 0, lastTouch: 0, now: MIN }));
});
check('Idle return Off (0 minutes) → nothing', () => {
  nothing(decide({ idleHomeMins: 0 }));
});
check('touch inside the time → nothing', () => {
  nothing(decide({ lastTouch: MIN_AWAY - 30 * 1000 }));
});
check('time passed, not on Home, no popup → Home', () => {
  goHome(decide({}));
});
check('already on Home → nothing', () => {
  nothing(decide({ onHome: true }));
});
check('popup open for an hour → nothing (the count is paused)', () => {
  nothing(decide({ popupOpen: true, now: 60 * MIN }));
});
check('popup closed after the time passed → Home at once', () => {
  goHome(decide({ popupOpen: false, now: 60 * MIN }));
});
check('phone, Off, Home: the count restarts (no decision to make)', () => {
  assert.equal(decide({ isWallTablet: false }).restart, true);
  assert.equal(decide({ idleHomeMins: 0 }).restart, true);
  assert.equal(decide({ onHome: true }).restart, true);
});
check('touch inside the time and popup open: the count runs on (no restart)', () => {
  assert.equal(decide({ lastTouch: MIN_AWAY - 30 * 1000 }).restart, false);
  assert.equal(decide({ popupOpen: true, now: 60 * MIN }).restart, false);
});

// Wiring: the 10 s check runs the decision. A popup open for an hour is paused, and at the first check after
// it closes the tablet goes Home (the count was not restarted by the popup).
check('block: popup open for an hour, closed → Home at the next check', () => {
  clock = 0;
  const env = loadBlock({ popup: true });
  for (let t = 10 * 1000; t < 60 * MIN; t += 10 * 1000) {
    clock = t;
    env.tick();
  }
  assert.deepEqual(env.pushes, [], 'no Home while the popup is open');
  env.window.casoraPopup.surface = null;
  clock = 60 * MIN + 10 * 1000;
  env.tick();
  assert.deepEqual(env.pushes, ['/dash/home'], 'Home at the first check after the popup closed');
});

check('block: light popup opened on Home, Idle close 1, no touch → closed at 1 minute', () => {
  clock = 0;
  const env = loadBlock({ pathname: '/dash/home', idle: '0', close: '1', popup: true, openedAt: 0 });
  clock = 30 * 1000; env.tick();
  assert.equal(env.window.casoraPopup.closes, 0, 'not after 30 s');
  clock = 60 * 1000; env.tick();
  assert.equal(env.window.casoraPopup.closes, 1, 'closed at 60 s');
});
check('block: Idle close 1 and Idle return 1 → popup closed and Home in the same check', () => {
  clock = 0;
  const env = loadBlock({ idle: '1', close: '1', popup: true, openedAt: 0 });
  clock = 60 * 1000; env.tick();
  assert.equal(env.window.casoraPopup.closes, 1, 'popup closed');
  assert.deepEqual(env.pushes, ['/dash/home'], 'Home in the same check');
});
check('block: Ring popup opened at 20 min, Idle close 2 → not closed at 21:50, closed at 22:00', () => {
  clock = 0;
  const env = loadBlock({ idle: '0', close: '2', popup: true, openedAt: 20 * MIN });
  clock = 21 * MIN + 50 * 1000; env.tick();
  assert.equal(env.window.casoraPopup.closes, 0, 'not at 21:50');
  clock = 22 * MIN; env.tick();
  assert.equal(env.window.casoraPopup.closes, 1, 'closed at 22:00');
});

Date.now = realNow;
let failed = 0;
for (const r of results) {
  if (r[0] === 'ok') console.log(`ok – ${r[1]}`);
  else { failed++; console.log(`FAIL – ${r[1]}: ${r[2]}`); }
}
if (failed) {
  console.log(`${failed} of ${results.length} failed`);
  process.exitCode = 1;
} else {
  console.log(`ok – all ${results.length} cases`);
}
