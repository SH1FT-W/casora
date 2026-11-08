// "Sort tiles" (Studio › Controls › Tiles, variable tile_sort), 01.11.2026: after the load phase a tile row
// re-sorts only after 30 s without use ('calm'), only when the page opens ('open', the E19 behaviour)
// or after 2 s like before E19 ('now', the default again since 26.11.6 at the maintainer's request). Also: casora-core reads the setting, Studio field, phone mirror, texts.
//   node dev/unit/kachelreihe_sortiermodus.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const listeners = new Map();
const win = {
  addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
  removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
  matchMedia: () => ({ matches: false }), innerWidth: 1440,
};
let RowClass = null, now = 100000;
let timers = [];
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({ overflowX: 'auto' }), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
  Date: { now: () => now },
};
new Function(...Object.keys(sandbox), read('custom_components/casora/scripts/smart-row.js'))(...Object.values(sandbox));
assert.ok(RowClass, 'row class defined');
for (const t of ['pointerdown', 'touchstart', 'touchmove', 'wheel', 'keydown', 'scroll']) assert.ok(listeners.get(t)?.size, 'input marks ' + t);

// ── Pure decision ─────────────────────────────────────────────────────────────
const D = win._casoraSortDecide;
const base = { settled: true, idle: 60000, popup: false, hover: false, noAnim: false };
assert.deepEqual(D({ ...base, mode: 'open' }), { act: 'skip' }, 'open: never live');
assert.deepEqual(D({ ...base, mode: 'calm' }), { act: 'sort', keep: true }, 'calm, quiet: sorts and keeps the visible tile');
assert.deepEqual(D({ ...base, mode: 'calm', idle: 5000 }), { act: 'wait', ms: 5000 }, 'calm: waits for 30 s of quiet, looks again every 5 s');
assert.deepEqual(D({ ...base, mode: 'calm', idle: 28000 }), { act: 'wait', ms: 2000 }, 'calm: last step exact');
assert.equal(D({ ...base, mode: 'calm', idle: 29999 }).act, 'wait');
assert.equal(D({ ...base, mode: 'calm', idle: 30000 }).act, 'sort', 'calm: 30 s are enough');
assert.equal(D({ ...base, mode: 'calm', popup: true }).act, 'wait', 'calm: popup open');
assert.equal(D({ ...base, mode: 'calm', hover: true }).act, 'wait', 'calm: pointer over the row');
assert.deepEqual(D({ ...base, mode: 'now', idle: 2500 }), { act: 'sort', keep: false }, 'now: 2 s of quiet, as before');
assert.equal(D({ ...base, mode: 'now', idle: 1000 }).act, 'wait');
assert.equal(D({ ...base, mode: 'calm', settled: false, idle: 2500 }).act, 'sort', 'load phase: 2 s in every mode');
assert.equal(D({ ...base, mode: 'open', settled: false, idle: 2500 }).act, 'sort', 'load phase sorts even in open');
assert.deepEqual(D({ ...base, mode: 'calm', idle: 0, noAnim: true }), { act: 'sort', keep: false }, 'filter switch sorts at once');

// ── Mode: setting, code switches ──────────────────────────────────────────────
const M = win._casoraSortModeNow;
assert.equal(M(), 'now', 'default: right away');
win._casoraSortMode = 'open'; assert.equal(M(), 'open');
win._casoraSortModeRefresh = () => 'now'; assert.equal(M(), 'now', 'asks casora-core first');
win._casoraSortModeRefresh = () => 'quatsch'; assert.equal(M(), 'now', 'unknown = now');
win.CASORA_SORT_MODE = 'open'; assert.equal(M(), 'open', 'CASORA_SORT_MODE overrides');
win.CASORA_LIVE_SORT = true; assert.equal(M(), 'now', 'CASORA_LIVE_SORT = now');
delete win.CASORA_LIVE_SORT; delete win.CASORA_SORT_MODE; delete win._casoraSortModeRefresh; delete win._casoraSortMode;

// ── Row timing ────────────────────────────────────────────────────────────────
const tick = () => { timers.sort((a, b) => a.at - b.at); const t = timers.shift(); now = Math.max(now, t.at); t.fn(); };
const tap = () => listeners.get('pointerdown').forEach((fn) => fn());
const mk = () => {
  const row = Object.create(RowClass.prototype);
  Object.assign(row, { _sortEnabled: true, _sortTimer: null, _builtAt: now - 20000,
    _wrappers: [{}, {}, {}], _config: { cards: [{}, {}, {}] }, _activeSet: new Set([0, 1]), _activationOrder: [0, 1] });
  row.active = new Set([0, 1]);
  row._isActive = (i) => row.active.has(i);
  row.applied = []; row._applyOrder = (anim, keep) => { row.applied.push({ anim, keep }); };
  row.matches = () => false;
  return row;
};
const run = (row, ms) => { const end = now + ms; while (timers.length) { timers.sort((a, b) => a.at - b.at); if (timers[0].at > end) break; tick(); } now = Math.max(now, end); };

// calm: tile 0 turns idle while someone taps → no move; 30 s after the last tap it moves back (keep).
timers = [];
win.CASORA_SORT_MODE = 'calm';
let r = mk();
tap();
r.active.delete(0);
r._updateSort();
assert.deepEqual(r._activationOrder, [1], 'new active set noted');
run(r, 10000); tap(); run(r, 10000); tap();
assert.equal(r.applied.length, 0, 'no re-sort while in use');
run(r, 29000);
assert.equal(r.applied.length, 0, 'not before 30 s of quiet');
run(r, 3000);
assert.deepEqual(r.applied, [{ anim: true, keep: true }], 'after the quiet spell: re-sorted, visible tile kept');

// calm: popup open keeps it waiting.
timers = [];
r = mk(); win.casoraPopup = { surface: {} };
r.active.delete(1); r._updateSort();
run(r, 120000);
assert.equal(r.applied.length, 0, 'popup open: no re-sort');
win.casoraPopup.surface = null;
run(r, 35000);
assert.equal(r.applied.length, 1, 'popup closed + quiet: re-sorted');

// open: nothing after the load phase.
timers = [];
win.CASORA_SORT_MODE = 'open';
r = mk(); r.active.delete(0); r._updateSort();
assert.deepEqual(r._activationOrder, [0, 1], 'open: no change noted');
run(r, 120000);
assert.equal(r.applied.length, 0, 'open: never re-sorted while the page is open');
// …but in the load phase it still sorts.
r = mk(); r._builtAt = now; r.active.delete(0); r._updateSort();
run(r, 6000);
assert.equal(r.applied.length, 1, 'open: load phase still sorts');

// now: as before E19 (SORT_DELAY 2.5 s + 2 s quiet).
timers = [];
win.CASORA_SORT_MODE = 'now';
r = mk(); tap(); r.active.delete(0); r._updateSort();
run(r, 5000);
assert.deepEqual(r.applied, [{ anim: true, keep: false }], 'now: re-sorted within seconds');
delete win.CASORA_SORT_MODE;

// ── casora-core: window._casoraSortMode from the room card / casora_mobile_bg ──
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  const start = core.indexOf('(function () {\n  if (window._casoraHoldWatch) return;');
  assert.ok(start > 0, 'block in casora-core.js');
  const block = core.slice(start, core.indexOf('})();\n', start) + 6);
  const ls = {};
  const w = { addEventListener: (t, fn) => { (ls[t] = ls[t] || []).push(fn); } };
  let config = null;
  const root = { isConnected: true, get lovelace() { return { config }; } };
  const doc = { querySelector: (s) => (s === 'hui-root' ? root : null), querySelectorAll: () => [] };
  new Function('window', 'document', 'setTimeout', 'location', block)(w, doc, () => {}, { pathname: '/casora/home' });
  assert.equal(w._casoraSortMode, 'now', 'default now');
  const view = (vars) => ({ path: 'home', cards: [{ type: 'custom:button-card', template: 'casora_room', variables: vars }] });
  assert.equal(w._casoraSortModeOf({ views: [view({ tile_sort: 'open' })] }), 'open', 'desktop: room card');
  assert.equal(w._casoraSortModeOf({ views: [view({})] }), 'now', 'nothing set');
  assert.equal(w._casoraSortModeOf({ views: [view({ tile_sort: 'x' })] }), 'now', 'unknown = now');
  const phone = { views: [{ path: 'home', cards: [{ type: 'custom:layout-card', cards: [
    { type: 'custom:button-card', template: 'casora_mobile_bg', variables: { tile_sort: 'now' } }] }] }] };
  assert.equal(w._casoraSortModeOf(phone), 'now', 'phone: casora_mobile_bg');
  config = { views: [view({ tile_sort: 'open', hold_mode: 'popup' })] };
  assert.equal(w._casoraSortModeRefresh(), 'open', 'refresh reads the dashboard');
  assert.equal(w._casoraHoldMode, 'popup', 'hold mode read alongside');
}

// ── Studio field, phone mirror, texts ─────────────────────────────────────────
{
  const panel = read('custom_components/casora/panel/casora-panel.js');
  const i = panel.indexOf('{ key: "tile_sort"');
  assert.ok(i > 0, 'Studio field tile_sort');
  const field = panel.slice(i, panel.indexOf('},\n', panel.indexOf('hint:', i)) + 1);
  assert.ok(/sub: "hold"/.test(field) && /scope: "dashboard"/.test(field) && /type: "select"/.test(field), 'Controls › Tiles, dashboard-wide select');
  assert.ok(field.includes('options: ["", "calm", "open"]'), 'empty = right away');
  const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
  const B = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
  for (const tpl of [T, B]) {
    assert.ok('tile_sort' in tpl.casora_room.variables, 'casora_room declares tile_sort');
    assert.ok('tile_sort' in tpl.casora_mobile_bg.variables, 'casora_mobile_bg declares tile_sort (phone mirror)');
  }
  const hint = /hint: "([^"]+)"/.exec(field)[1];
  for (const lang of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
    const ex = JSON.parse(read(`custom_components/casora/translations/panel/${lang}.json`)).exact;
    for (const k of ['Sort tiles', 'After a short pause', 'Only when opening', 'Right away', hint]) assert.ok(ex[k], `${lang}: ${k}`);
  }
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
  assert.equal(de['Sort tiles'], 'Kacheln sortieren');
  assert.equal(de['After a short pause'], 'Nach kurzer Ruhe');
  assert.equal(de['Only when opening'], 'Nur beim Öffnen');
  assert.equal(de['Right away'], 'Sofort');
}

// ── Rooms (filter-overlay.js) use the same setting ────────────────────────────
{
  const fo = read('custom_components/casora/scripts/filter-overlay.js');
  assert.ok(/roomSortMode\(\) !== 'open'/.test(fo), 'rooms: live re-sort unless open');
  assert.ok(/_resortWhenQuiet\(\) \{[\s\S]*?window\._casoraSortDecide[\s\S]*?this\._sortSectionGrids\(true\)/.test(fo), 'rooms: calm waits via the shared decision');
}
// A pointer resting on the row must not hold "right away" back for good (08.11.2026): an inactive tile stayed between the
// active ones until the mouse left. While it was just used the row still waits, and "calm" keeps its rule.
assert.equal(D({ mode: 'now', settled: true, idle: 1000, popup: false, hover: true, noAnim: false }).act, 'wait', 'just used: waits');
assert.equal(D({ mode: 'now', settled: true, idle: 6000, popup: false, hover: true, noAnim: false }).act, 'sort', 'pointer resting: sorts after a few seconds');
assert.equal(D({ mode: 'calm', settled: true, idle: 60000, popup: false, hover: true, noAnim: false }).act, 'wait', 'calm: the pointer still holds it');
assert.equal(D({ mode: 'now', settled: true, idle: 60000, popup: true, hover: false, noAnim: false }).act, 'wait', 'an open popup still holds it');
console.log('ok kachelreihe_sortiermodus');
