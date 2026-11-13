// Hemma round #12: tap behaviour per tile „Normal / Ask first / View only“. An old confirm_toggle reads as „Ask first“
// (no migration, nothing lost); View only swallows every switching action of its tile (the icon opens the popup like a
// tap on the tile) and, while its popup is open, taps on the popup's controls.
//   node dev/unit/tippverhalten.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js#tapModeOf,setTapMode custom_components/casora/scripts/casora-core.js#casoraTapMode,casoraViewOnly,viewOwner,viewGuard,fromCfg
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');

// ── Studio: mapping and the one writer ──────────────────────────────────────────────
const win = {};
new Function('window', read('panel/casora-panel-b-mehr.js'))(win);
const M = win.__casoraStudioMehr;
assert.equal(M.tapModeOf(undefined), '', 'no variables: Normal');
assert.equal(M.tapModeOf({ confirm_toggle: true }), 'ask', 'saved confirm_toggle: Ask first, as before');
assert.equal(M.tapModeOf({ view_only: true }), 'view');
assert.equal(M.tapModeOf({ view_only: true, confirm_toggle: true }), 'view', 'View only wins');
let t = { entity: 'switch.ofen', variables: { confirm_toggle: true, hold_mode: 'menu' } };
M.setTapMode(t, 'view');
assert.deepEqual(t.variables, { hold_mode: 'menu', view_only: true }, 'View only replaces the question, keeps the rest');
M.setTapMode(t, 'ask');
assert.deepEqual(t.variables, { hold_mode: 'menu', confirm_toggle: true }, 'Ask first writes the old key');
M.setTapMode(t, '');
assert.deepEqual(t.variables, { hold_mode: 'menu' });
t = { entity: 'switch.ofen', variables: { view_only: true } };
M.setTapMode(t, '');
assert.equal(t.variables, undefined, 'empty variables go');
const mehr = read('panel/casora-panel-b-mehr.js');
assert.ok(/this\._combo\(tapModeOf\(V\), \["", "ask", "view"\]/.test(mehr), 'Studio offers the three as one choice');

// ── casora-core ─────────────────────────────────────────────────────────────────────
const core = read('scripts/casora-core.js');
const i = core.indexOf('(function () {\n  if (window.__casoraAskFirst)');
const blk = core.slice(i, core.indexOf('})();\n', i) + 6);
const states = { 'switch.ofen': { state: 'off', attributes: { friendly_name: 'Ofen' } }, 'switch.pumpe': { state: 'off', attributes: {} } };
const listeners = {};
const notices = [];
const w = {
  addEventListener(type, fn, cap) { (listeners[type] = listeners[type] || []).push({ fn, cap }); },
  casoraHaptic() {}, casoraNotice: (d) => notices.push(d.message), location: { pathname: '/x' },
};
const doc = { querySelector: () => ({ hass: { states } }), addEventListener() {}, removeEventListener() {} };
class CE { constructor(type, init) { this.type = type; this.detail = init.detail; } }
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout', blk)(w, doc, WeakSet, CE, () => {});

assert.equal(w.casoraTapMode({ confirm_toggle: true }), 'ask');
assert.equal(w.casoraTapMode({ view_only: true, confirm_toggle: true }), 'view');
assert.equal(w.casoraTapMode(null), 'normal');
const parts = w.__casoraAskFirstParts;
const got = parts.fromCfg({ views: [{ cards: [
  { entity: 'switch.ofen', variables: { view_only: true } },
  { entity: 'switch.pumpe', variables: { confirm_toggle: true } },
  { entity: 'cover.alle', variables: { view_only: true, covers: ['cover.a'] } },
] }] });
assert.deepEqual(got.views, ['switch.ofen', 'cover.alle', 'cover.a']);
assert.deepEqual(got.ids, ['switch.pumpe'], 'a View only tile asks nothing (it switches nothing)');

// hass-action from a View only tile.
const hassAction = listeners['hass-action'].find((l) => l.cap).fn;
const fire = (cfg, action = 'tap') => {
  const sent = [];
  const target = { dispatchEvent: (e) => { sent.push(e); } };
  let stopped = false;
  const ev = { detail: { config: cfg, action }, composedPath: () => [target, { _config: cfg }], stopImmediatePropagation: () => { stopped = true; }, target };
  hassAction(ev);
  return { stopped, sent };
};
const oven = { entity: 'switch.ofen', variables: { view_only: true }, tap_action: { action: 'more-info' }, icon_tap_action: { action: 'toggle' } };
let r = fire({ ...oven, tap_action: { action: 'toggle' } });
assert.ok(r.stopped, 'a switching tap of a View only tile is swallowed');
assert.equal(r.sent.length, 0, 'tap itself switches: nothing else happens');
assert.equal(notices.length, 1, 'it says why');
const cfgIcon = { ...oven };
r = (() => {
  const sent = [];
  const target = { dispatchEvent: (e) => { sent.push(e); } };
  let stopped = false;
  // button-card sends the icon's action with the tile's config; switching() reads icon_tap_action.
  hassAction({ detail: { config: cfgIcon, action: 'icon_tap' }, composedPath: () => [target, { _config: cfgIcon }], stopImmediatePropagation: () => { stopped = true; }, target });
  return { stopped, sent };
})();
assert.ok(r.stopped, 'icon tap does not toggle');
assert.equal(r.sent.length, 1, 'icon tap opens what the tile opens');
assert.equal(r.sent[0].detail.action, 'tap');
// A normal tile is untouched; an „Ask first“ tile still asks (stops the event for its question).
r = fire({ entity: 'switch.pumpe', tap_action: { action: 'toggle' } });
assert.ok(!r.stopped, 'Normal: switches');

// The popup guard: controls blocked, opening rows, ✕ and charts not.
const guard = listeners.click.find((l) => l.cap).fn;
const el = (attrs = {}, cls = '', tag = 'div') => ({ nodeType: 1, tagName: tag, className: cls, classList: { contains: (c) => cls.split(' ').includes(c) },
  hasAttribute: (a) => a in attrs, getAttribute: (a) => attrs[a] ?? null });
const pop = { hasAttribute: (a) => a === 'view-only' || a === 'open' };
w.casoraPopup = { element: pop };
const content = el({}, 'content');
const click = (...inner) => {
  let blocked = false;
  guard({ type: 'click', composedPath: () => [...inner, content, pop], preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
  return blocked;
};
assert.ok(click(el({ 'data-casora-svc': '{}' })), 'a service button: blocked');
assert.ok(click(el({ role: 'switch' }), el({ 'data-casora-mi': 'switch.x' }, 'hui-row')), 'a switch inside an opening row: blocked');
assert.ok(click(el({}, 'hui-dl-knob')), 'anything else in the content (the dial): blocked');
assert.ok(!click(el({}, 'hui-sub'), el({ 'data-casora-mi': 'sensor.x' }, 'hui-row')), 'a row that opens a device: allowed');
assert.ok(!click(el({}, '', 'casora-chart')), 'reading a chart: allowed');
let blocked = false;
guard({ type: 'click', composedPath: () => [el({}, 'header-close'), pop], preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
assert.ok(!blocked, '✕ closes');
guard({ type: 'click', composedPath: () => [el({}, 'header-switch'), pop], preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
assert.ok(blocked, 'the head switch: blocked (and hidden)');
w.casoraPopup = { element: { hasAttribute: (a) => a === 'open' } };
assert.ok(!click(el({ 'data-casora-svc': '{}' })), 'a normal popup is untouched');

// The popup knows from its tile.
assert.ok(/this\.toggleAttribute\('view-only', on\)/.test(core) && /tr\('Nur ansehen'\)/.test(core), 'popup marks itself and says „Nur ansehen“');
assert.ok(/if \(this\.hasAttribute\('view-only'\)\) \{ b\.hidden = true;/.test(core), 'no main switch in the head');
console.log('ok – tap behaviour');
