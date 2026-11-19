// Idle return (Wall tablet, Return to Home when idle): one pure function, idleDecision, in the Idle return
// block of casora-core.js. A popup open pauses the count instead of restarting it; after it closes, the count
// runs from the last touch. Phones, Off and Home change nothing.   node dev/unit/idle_decision.mjs
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
function loadBlock({ pathname = '/dash/room', idle = '1', tablet = true, popup = null } = {}) {
  const window = {
    addEventListener() {},
    dispatchEvent() {},
    casoraIsWallTablet: () => tablet,
    casoraPopup: { surface: popup },
  };
  const views = [
    { path: 'home', cards: [{ variables: { casora_idle_home: idle } }] },
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

// The pure function, loaded from the block.
const { window: w } = loadBlock();
const idleDecision = w.casoraIdleDecision;
const MIN_AWAY = 10 * MIN; // "now" for the cases below
const base = { now: MIN_AWAY, lastTouch: 0, popupOpen: false, onHome: false, idleHomeMins: 1, isWallTablet: true };
const decide = (over) => idleDecision({ ...base, ...over });
const nothing = (d) => assert.deepEqual([d.close, d.home], [false, false]);
const goHome = (d) => assert.deepEqual([d.close, d.home], [false, true]);

check('phone (not a Wall tablet) → nothing', () => {
  nothing(decide({ isWallTablet: false }));
  nothing(decide({ isWallTablet: false, popupOpen: true, now: 90 * MIN }));
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
