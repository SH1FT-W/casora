// HA 2026.11 Marketplace (HACS built into HA): an install that waits for a restart has no text in
// release_summary any more (HACS: "Restart of Home Assistant required"), only a repair issue
// restart_required_<GitHub id>_<ref>. Casora's backend turns those into update entity ids
// (casora/updates/restarts, updates.py); the one restart rule (casoraNeedsRestart) reads them.
// Without a browser: the rule and the watcher from casora-core.js, the popup rules from 03-popups.js
// and the popup template. HACS on HA 2026.10 (text in release_summary) must keep working.
//   node dev/unit/updates_restart_marketplace.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const fn = core.match(/window\.casoraNeedsRestart = function \(e\) \{[\s\S]*?\n {2}\};/);
assert.ok(fn, 'casoraNeedsRestart found in casora-core.js');
new Function(fn[0])();
const R = window.casoraNeedsRestart;

const HACS_TEXT = "<ha-alert alert-type='error'>Restart of Home Assistant required</ha-alert>";
// What the Marketplace's update entity shows right after installing: off, installed == latest, no summary.
const mp = (id, a) => ({ entity_id: id, state: 'off',
  attributes: { friendly_name: id, installed_version: 'v1.1.0', latest_version: 'v1.1.0', release_summary: null,
    supported_features: 23, in_progress: false, ...a } });

// ── The rule ──
window._casoraRestartIds = undefined;
assert.equal(R(mp('update.casora_update')), false, 'no issue known: installed and done');
window._casoraRestartIds = { 'update.casora_update': true };
assert.equal(R(mp('update.casora_update')), true, 'Marketplace: repair issue → restart owed');
assert.equal(R(mp('update.other')), false, 'only the entity the issue names');
assert.equal(R({ ...mp('update.casora_update'), state: 'on' }), false, 'still pending is not a restart');
assert.equal(R(mp('update.casora_update', { installed_version: 'v1.0.0' })), false, 'installed != latest');
assert.equal(R(mp('update.casora_update', {})), true);
// HACS (HA 2026.10): the text alone still counts, with or without the list.
window._casoraRestartIds = {};
assert.equal(R(mp('update.hacs_repo', { release_summary: HACS_TEXT })), true, 'HACS text still counts');
window._casoraRestartIds = undefined;
assert.equal(R(mp('update.hacs_repo', { release_summary: HACS_TEXT })), true, 'HACS text without the watcher');

// ── The watcher (casora/updates/restarts subscription) ──
const w = core.match(/ {2}var _restartSub = false[\s\S]*?window\.casoraWatchRestarts = function \(hass, onChange, retry\) \{[\s\S]*?\n {2}\};/);
assert.ok(w, 'casoraWatchRestarts found in casora-core.js');
new Function(w[0])();
const subs = [];
const hass = { connection: { subscribeMessage: (cb, msg, opts) => { subs.push({ cb, msg, opts }); return Promise.resolve(() => {}); } } };
const seen = [];
window.casoraWatchRestarts(hass, (ids) => seen.push(Object.keys(ids)));
window.casoraWatchRestarts(hass, null);
assert.equal(subs.length, 1, 'one subscription per page');
assert.deepEqual(subs[0].msg, { type: 'casora/updates/restarts' });
subs[0].cb({ entity_ids: ['update.casora_update', 42] });
assert.deepEqual(window._casoraRestartIds, { 'update.casora_update': true }, 'ids from the event, strings only');
assert.deepEqual(seen, [['update.casora_update']], 'listener told');
assert.equal(R(mp('update.casora_update')), true);
subs[0].cb({ entity_ids: [] });
assert.equal(R(mp('update.casora_update')), false, 'restart done (issue gone): no longer owed');
assert.equal(subs[0].opts && subs[0].opts.resubscribe, false, 'no silent resubscribe by the library');
// HA restarts: the list is dropped at once (a restart clears the issues), on "ready" Casora subscribes anew; while
// Casora's command is not registered yet (unknown_command) it tries again later.
{
  const timers = [];
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return 0; };
  const ev = {};
  let fail = 0;
  const subs2 = [];
  const conn = {
    addEventListener: (n, fn) => { (ev[n] = ev[n] || []).push(fn); },
    subscribeMessage: (cb, msg, opts) => { subs2.push({ cb, msg, opts }); return fail-- > 0 ? Promise.reject({ code: 'unknown_command' }) : Promise.resolve(() => {}); },
  };
  const w2 = {};
  new Function('window', w[0])(w2);
  w2.casoraWatchRestarts({ connection: conn });
  await new Promise((r) => realSet(r, 0));
  subs2[0].cb({ entity_ids: ['update.casora_update'] });
  assert.deepEqual(w2._casoraRestartIds, { 'update.casora_update': true });
  ev.disconnected.forEach((fn) => fn());
  assert.deepEqual(w2._casoraRestartIds, {}, 'disconnected: stale list dropped');
  fail = 1;
  ev.ready.forEach((fn) => fn());
  await new Promise((r) => realSet(r, 0));
  assert.equal(subs2.length, 2, 'ready: subscribed anew');
  assert.equal(timers.length, 1, 'unknown_command right after the restart: try again later');
  w2.casoraWatchRestarts({ connection: conn });
  w2.casoraWatchRestarts({ connection: conn });
  assert.equal(subs2.length, 2, 'state changes in between do not subscribe again (only the timer does)');
  timers[0].fn();
  await new Promise((r) => realSet(r, 0));
  assert.equal(subs2.length, 3, 'second try');
  subs2[2].cb({ entity_ids: [] });
  assert.deepEqual(w2._casoraRestartIds, {});
  // Offline (retry timer fires while the socket is down): no subscription that would never be answered.
  ev.disconnected.forEach((fn) => fn());
  conn.connected = false;
  w2.casoraWatchRestarts({ connection: conn });
  assert.equal(subs2.length, 3, 'nothing sent while disconnected');
  conn.connected = true;
  ev.ready.forEach((fn) => fn());
  await new Promise((r) => realSet(r, 0));
  assert.equal(subs2.length, 4, 'ready after the outage subscribes');
  // A new connection object (old one closed on purpose, no "disconnected"): subscribe on the new one.
  const subs3 = [];
  const conn2 = { addEventListener: () => {}, subscribeMessage: (cb, msg) => { subs3.push(msg); return Promise.resolve(() => {}); } };
  w2.casoraWatchRestarts({ connection: conn2 });
  await new Promise((r) => realSet(r, 0));
  assert.equal(subs3.length, 1, 'new connection: subscribed again');
  globalThis.setTimeout = realSet;
}

// ── Popup rows: the status rule asks the same rule (not release_summary) ──
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const T = fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8');
for (const [name, src] of [['03-popups.js', pop], ['button_card_templates.json', T]]) {
  assert.ok(!/attr: 'release_summary', has: 'restart'/.test(src), name + ': no restart rule on release_summary alone');
  assert.ok(/and: \[\{ restart: true \}\]/.test(src), name + ': restart rule via casoraNeedsRestart');
}
// The live bridge evaluates { restart: true } with casoraNeedsRestart (casora-core.js, data-casora-live="act").
const atest = core.match(/var atest = function \(c\) \{[\s\S]*?\n {8}\};/);
assert.ok(atest && /if \(c\.restart\) return !!\(window\.casoraNeedsRestart && window\.casoraNeedsRestart\(st\)\);/.test(atest[0]),
  'act rule { restart: true } → casoraNeedsRestart');
{
  const pick = (st, rules) => {
    // eslint-disable-next-line no-new-func
    const at = new Function('st', atest[0] + '; return atest;')(st);
    return rules.find((r) => at(r) && (r.and || []).every(at)) || null;
  };
  const rules = [{ attr: 'in_progress', text: 'busy' }, { attr: 'state', eq: 'off', and: [{ restart: true }], text: 'restart' },
    { attr: 'state', eq: 'off', text: 'installed' }];
  window._casoraRestartIds = { 'update.casora_update': true };
  assert.equal(pick(mp('update.casora_update'), rules).text, 'restart', 'Marketplace row says restart');
  assert.equal(pick(mp('update.other'), rules).text, 'installed');
  window._casoraRestartIds = {};
  assert.equal(pick(mp('update.hacs_repo', { release_summary: HACS_TEXT }), rules).text, 'restart', 'HACS row says restart');
}
console.log('ok updates_restart_marketplace');
