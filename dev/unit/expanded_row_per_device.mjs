// u05-09 (review 26.11.2026): the badges' sub-rows hang on the helper input_select.casora_expanded_row, one value for
// the whole house – a badge tapped on one device opened the row on every screen, and a fresh page showed what someone
// else had left open. Owner: remember the open row per device. window._casoraRow rewrites the helper on the way into
// every Casora button-card (lazy-hass setter) with this device's value (localStorage); a tap through the card's hass
// sets it here and still writes the helper; a change by no person (Casora's „media“ on playback, an automation) is
// followed. Invented ids.
//   node dev/unit/expanded_row_per_device.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraRow
import fs from 'node:fs';
import assert from 'node:assert/strict';

const SRC = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = SRC.indexOf('(function () {\n  if (window._casoraRow) return;');
assert.ok(a > -1, '_casoraRow module');
const b = SRC.indexOf('\n})();\n', a);
const mod = SRC.slice(a, b + 6);

const boot = (stored) => {
  const store = new Map(stored ? [['casora_expanded_row', stored]] : []);
  const win = {};
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  new Function('window', 'localStorage', mod)(win, ls);
  return { R: win._casoraRow, store };
};
const E = 'input_select.casora_expanded_row';
const ent = (state, user, t) => ({ entity_id: E, state, last_changed: new Date(t).toISOString(), attributes: { options: ['none', 'lights', 'security', 'media'] },
  context: { id: 'c' + t, user_id: user || null, parent_id: null } });
const calls = [];
// HA's callService goes out through the connection (home-assistant-js-websocket), as every call of this browser.
const conn = { sendMessagePromise(msg) { calls.push(msg); return Promise.resolve(); } };
const hassOf = (e) => ({ states: { [E]: e, 'light.qa': { state: 'on' } }, user: { id: 'me' }, connection: conn,
  callService(domain, service, service_data) { return this.connection.sendMessagePromise({ type: 'call_service', domain, service, service_data }); } });

const T0 = Date.now() - 60000;
// 1. A fresh device: a row someone else opened stays closed here.
let { R, store } = boot();
let h = hassOf(ent('security', 'someone_else', T0));
let out = R.apply(h, null);
assert.equal(out.states[E].state, 'none', 'another person\'s open row is not opened here');
assert.equal(h.states[E].state, 'security', 'HA\'s hass untouched');
assert.equal(out.states['light.qa'], h.states['light.qa'], 'other states are the same objects');

// 2. A tap here (the badge's call-service through the card's hass): this device's row, redraws, still writes the helper.
let redrawn = 0;
const card = { isConnected: true, set hass(v) { redrawn++; this._h = v; } };
out = R.apply(h, card);
await out.callService('input_select', 'select_option', { entity_id: E, option: 'lights' });
assert.equal(R.get(), 'lights');
assert.deepEqual(calls.at(-1), { type: 'call_service', domain: 'input_select', service: 'select_option', service_data: { entity_id: E, option: 'lights' } }, 'the helper is still written');
assert.ok(redrawn > 0, 'the cards of this device redraw at once');
assert.equal(R.apply(h, null).states[E].state, 'lights', 'shown open here');
assert.equal(JSON.parse(store.get('casora_expanded_row')).v, 'lights', 'kept in this browser');

// 3. Another person opens another row later: not here.
h = hassOf(ent('security', 'someone_else', Date.now() + 1000));
assert.equal(R.apply(h, null).states[E].state, 'lights', 'a later tap elsewhere does not change this device');

// 4. Casora's own „media“ on playback (no person): followed, as before.
h = hassOf(ent('media', null, Date.now() + 2000));
assert.equal(R.apply(h, null).states[E].state, 'media', 'a change by no person is followed');

// 5. A card inside a card gets the rewritten hass: it stays as it is.
await h.callService('input_select', 'select_option', { entity_id: E, option: 'security' });   // HA's own hass, this browser
assert.equal(R.get(), 'security', 'a call through HA\'s hass in this browser is this device\'s pick too');
h = hassOf(ent('media', null, Date.now() - 500));
out = R.apply(h, null);
assert.equal(out.states[E].state, 'security');
assert.equal(R.apply(out, null), out, 'already rewritten');
// A state that does not come from HA (no context) is shown as it is.
assert.equal(R.apply({ states: { [E]: { state: 'climate' } }, connection: conn }, null).states[E].state, 'climate');

// 6. After a reload the device keeps its row.
({ R } = boot(store.get('casora_expanded_row')));
assert.equal(R.apply(hassOf(ent('lights', 'someone_else', T0)), null).states[E].state, 'security', 'remembered after reload');

// 7. No helper: nothing to do.
const bare = { states: {}, callService: () => {} };
assert.equal(R.apply(bare, null), bare);

// 8. Every Casora button-card goes through it (the lazy-hass setter).
assert.match(SRC, /if \(mine && h && window\._casoraRow\) h = window\._casoraRow\.apply\(h, this\);/, 'setter rewrites');
console.log('expanded_row_per_device: ok');
