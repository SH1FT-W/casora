// Bell „Remove all“ (variant 3A, 14.11.2026): the undo sits in the bell itself (title, „Rückgängig“, a 10 s bar),
// no HA toast any more; „Rückgängig“ brings every message back, after 10 s the bell shows „Nichts Neues“ as usual.
//   node dev/unit/glocke_undo_3a.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,hideAll,undoAll,undoHtml,bindUndo,undoTick,openMenu
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6)
  .replace('    open: open,', '    open: open, _hideAll: hideAll, _undoAll: typeof undoAll === "function" ? undoAll : null,'
    + ' _undoHtml: typeof undoHtml === "function" ? undoHtml : null, _undoState: function () { return typeof _undo === "undefined" ? undefined : _undo; },');

const MIN = 60000;
let NOW = Date.parse('2026-11-13T15:00:00Z');
Date.now = () => NOW;
let hass;
const toasts = [];
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const haEl = { get hass() { return hass; }, dispatchEvent: (e) => { toasts.push(e); return true; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? haEl : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = (e) => { if (e && e.type === 'hass-notification') toasts.push(e); return true; };
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'door-open';
window.casoraWatchRestarts = () => {};
window.casoraNeedsRestart = () => false;
window.casoraClockText = () => '15:00';
window.CASORA_NOTIFY_EXTENSIONS = [];
window.casoraTr = (x) => x;
window._casoraUI = { tokens: { font: 'system-ui', ink3: 'grey' } };

const LOCK = 'lock.haustuer';
const iso = (ms) => new Date(ms).toISOString();
const log = [];
for (let i = 0; i < 4; i++) log.push({ entity_id: LOCK, state: i % 2 ? 'locked' : 'unlocked', when: (NOW - (40 - i * 6) * MIN) / 1000 });
const states = { [LOCK]: { entity_id: LOCK, state: 'locked', last_changed: iso(NOW - 2 * MIN), attributes: { friendly_name: 'Haustür' } } };
hass = {
  user: { id: 'u-anna', is_admin: false }, states, entities: {}, devices: {}, areas: {},
  callWS: (msg) => Promise.resolve(msg.type === 'logbook/get_events' ? log : null),
  connection: { sendMessagePromise: () => Promise.resolve(null), subscribeMessage: () => Promise.resolve(() => {}) },
};

// Timers by hand: the 10 s run out when the test says so.
const realTimeout = globalThis.setTimeout;
let timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, at: NOW + (ms || 0) }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
const advance = (ms) => { NOW += ms; timers.filter((t) => t.fn && t.at <= NOW).forEach((t) => { const f = t.fn; t.fn = null; f(); }); };

new Function(mod)();
const n = window._casoraNotify;
await new Promise((r) => realTimeout(r, 0));

let fails = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log('ok   ' + name),
  (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

await check('„Remove all“ shows no HA toast and keeps the undo for 10 s', async () => {
  const rows = await n.refresh();
  assert.ok(rows.length > 0, 'messages before');
  toasts.length = 0;
  n._hideAll();
  assert.equal(n.rows.length, 0, 'bell empty');
  assert.equal(toasts.length, 0, 'no hass-notification toast');
  assert.ok(n._undoState(), 'undo pending in the bell');
});

await check('the undo state: title, „Nichts Neues“, a 44 px „Rückgängig“ pill, aria-live, a bar', async () => {
  assert.equal(typeof n._undoHtml, 'function');
  advance(5000);
  const h = n._undoHtml();
  assert.match(h, />Alle Meldungen entfernt</);
  assert.match(h, />Nichts Neues</);
  assert.match(h, /class="casora-notify-undo-btn"[^>]*min-height:44px/);
  assert.match(h, /<span>Rückgängig<\/span>/);
  assert.match(h, /aria-live="polite"/);
  assert.match(h, /casora-notify-undo-bar" data-left="5000"[^>]*scaleX\(0\.5000\)/, 'bar half run down after 5 s');
});

await check('„Rückgängig“ brings every message back', async () => {
  const before = n.rows.length;
  assert.equal(before, 0);
  assert.equal(n._undoAll(), true);
  assert.ok(n.rows.length > 0, 'messages back');
  assert.equal(n._undoState(), null, 'undo done');
  assert.equal(toasts.length, 0);
});

await check('after 10 s the undo is gone and the messages stay removed', async () => {
  n._hideAll();
  advance(9999);
  assert.ok(n._undoState(), 'still there just before 10 s');
  advance(2);
  assert.equal(n._undoState(), null, 'gone after 10 s');
  assert.equal(n._undoAll(), false, 'nothing to undo any more');
  assert.equal(n.rows.length, 0, 'removed for good');
});

// The bell around it: stays open after „Remove all“, the list draws the undo, the bar respects reduced motion.
const open = core.slice(core.indexOf('  function openMenu(anchor) {'), core.indexOf('  function open(anchor) {'));
assert.ok(/hideAll\(\);\s*\n\s*if \(_menu === menu\) menu\._redraw\(\);/.test(open), 'the bell stays open and redraws');
assert.ok(/_undo && !_rows\.length \? undoHtml\(\) : sections\(\)/.test(open), 'the undo stands in place of „Nichts Neues“');
const bind = core.slice(core.indexOf('  function bindUndo('), core.indexOf('  function nameOf('));
assert.ok(/prefers-reduced-motion: reduce/.test(bind), 'reduced motion: the bar stands still');
assert.ok(!/hass-notification/.test(core.slice(core.indexOf('  function hideAll('), core.indexOf('  function nameOf('))), 'no toast in hideAll');

if (fails) { console.log(fails + ' Fehler'); process.exit(1); }
console.log('glocke_undo_3a: ok');
