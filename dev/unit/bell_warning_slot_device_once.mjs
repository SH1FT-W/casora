// Beta 26.11.28b4 (owner, phone): with the weather warning tile on Home and in the room „Terrasse“ (both on
// „Warnung 1“ of „Wetter & Warnungen“) the bell listed „Terrasse Entwarnung · Wetterwarnung aufgehoben“ (2) and
// „Entwarnung · Wetterwarnung aufgehoben“ (2). Cause: the logbook rows were per slot. The integration moves its
// warnings between the slots (Nebel arrives: Frost moves from slot 1 to slot 2; Nebel ends: Frost moves back and
// slot 2 goes off), so each slot made its own stack „Wetterwarnung“ + „Entwarnung“, the twin names got the room of
// the slot on the room tile in front (#116), and slot 2 said „Entwarnung“ while Frost was still active.
// Expected: the slot device is one source: one stack, „Entwarnung“ only once no warning is left.
//   node dev/unit/bell_warning_slot_device_once.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#slotLog,slotFamily,describe,prepare custom_components/casora/scripts/casora-core.js#collect,stackUp
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const cut = (src, head) => {
  const s = src.indexOf(head);
  assert.ok(s > 0, head.trim() + ' found');
  return src.slice(s, src.indexOf('\n})();', s) + 6);
};
const notifyMod = cut(core, '(function () {\n  if (window._casoraNotify) return;');
const localMod = cut(basis, '(function () {\n  if (window._casoraNotifyLocal) return;');
// The name cut of the list (popupNames → casoraDropCommonPrefix → roomForTwins, #116), as sections() uses it.
const a = core.indexOf('  window.casoraDropCommonPrefix = function');
const b = core.indexOf('  function group(rows, label', a);
assert.ok(a > 0 && b > a, 'name helpers found');

const H = 3600 * 1000;
const NOW = Date.now();
const realNow = Date.now.bind(Date);
Date.now = () => NOW;
const store = {};
let hass;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
window.casoraSecurityIcon = () => 'exclamation';
window.CASORA_NOTIFY_EXTENSIONS = [];

const ID = (n) => 'binary_sensor.qa_wetter_warnung_' + n;
// The tile in a room view sits on slot 1: that room is its room for the list (_casoraRoomOf).
window._casoraRoomOf = (id) => (id === ID(1) ? 'Terrasse' : '');
const tile = { type: 'custom:button-card', template: 'casora_weather_warning', entity: ID(1), variables: { sensors: [] } };
const LC = { views: [{ path: 'home', cards: [tile] }, { path: 'terrasse', cards: [JSON.parse(JSON.stringify(tile))] }] };
window._casoraLovelaceCfg = () => LC;

const FROST = { severity: 'Minor', headline: 'Amtliche WARNUNG vor FROST', event: 'FROST' };
const ev = (n, state, ms) => ({ entity_id: ID(n), state, when: ms / 1000 });
// The real course (made-up ids): Frost in slot 1; Nebel arrives and takes slot 1, Frost moves to slot 2; Nebel ends,
// Frost moves back to slot 1 and slot 2 goes off; Frost ends.
const T = { frost: NOW - 20 * H, nebel: NOW - 11 * H, nebelEnd: NOW - 5.5 * H, frostEnd: NOW - 0.5 * H };
const LOG = [ev(1, 'on', T.frost), ev(2, 'on', T.nebel), ev(2, 'off', T.nebelEnd), ev(1, 'off', T.frostEnd)];

const slot = (n, on, a) => ({ entity_id: ID(n), state: on ? 'on' : 'off', last_changed: new Date(NOW - 30 * H).toISOString(),
  attributes: { friendly_name: 'Wetterstation Warnung ' + n, device_class: 'safety', region: 'Teststadt', ...(on ? a : {}) } });
function load(t, states) {
  Date.now = () => t;
  hass = {
    states: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [ID(n), states[n] || slot(n, false)])),
    entities: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [ID(n), { entity_id: ID(n), platform: 'wetter', translation_key: 'warning', device_id: 'dev1' }])),
    devices: {}, areas: {}, user: { id: 'u1' },
    callWS: (msg) => {
      if (msg.type !== 'logbook/get_events') return Promise.resolve(null);
      const from = Date.parse(msg.start_time) / 1000;
      return Promise.resolve(LOG.filter((e) => e.when >= from && e.when * 1000 <= t && msg.entity_ids.includes(e.entity_id)));
    },
  };
  for (const k of Object.keys(store)) delete store[k];
  delete window._casoraNotify;
  delete window._casoraNotifyLocal;
  window.CASORA_NOTIFY_EXTENSIONS = [];
  new Function(notifyMod)();
  new Function(localMod)();
  return window._casoraNotify;
}
const history = (rows) => rows.filter((r) => !String(r.id).startsWith('casora:'));
const W = {};
const names = new Function('window', core.slice(a, b) + '\nreturn popupNames;')(Object.assign(W, { _casoraRoomOf: window._casoraRoomOf }));
const shown = (rows) => { const nm = names(rows); return rows.map(nm).map((r) => r.label); };

let fails = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log('ok   ' + name),
  (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

await check('after both warnings ended: one stack for the slot device, plain name „Entwarnung“', async () => {
  const rows = history(await load(NOW, {}).refresh());
  assert.deepEqual(shown(rows), ['Entwarnung'], 'one row, no room in front of the name: ' + JSON.stringify(shown(rows).map((n, i) => n + ' (' + rows[i].count + ')')));
  assert.equal(rows[0].entity, ID(1), 'under the device\'s first slot');
  assert.deepEqual(rows[0].members.map((m) => m.label), ['Entwarnung', 'Wetterwarnung', 'Wetterwarnung'],
    'Frost and Nebel arrived, one all-clear at the end');
  // Owner, 15.11.2026: the all-clear is good news, green (its own hue wins over the red of the warning icon).
  const clear = rows[0].members.find((m) => m.label === 'Entwarnung');
  assert.match(String(clear.hue || rows[0].hue || ''), /security-ok-color/, 'all-clear in green: ' + JSON.stringify({ hue: clear.hue, row: rows[0].hue }));
  const warn = rows[0].members.find((m) => m.label === 'Wetterwarnung');
  assert.doesNotMatch(String(warn.hue || ''), /security-ok-color/, 'a warning is not green');
});

await check('Nebel ended, Frost still active (moved to slot 1): no „Entwarnung“', async () => {
  const t = T.nebelEnd + H;
  const rows = history(await load(t, { 1: slot(1, true, FROST) }).refresh());
  assert.deepEqual(rows.map((r) => r.label).filter((l) => l === 'Entwarnung'), [], JSON.stringify(rows.map((r) => [r.entity, r.label])));
});

Date.now = realNow;
if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('bell_warning_slot_device_once: ok');
