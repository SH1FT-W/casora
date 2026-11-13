// Hemma round #11: the bell stacks repeats of one source (a count instead of three rows and a cut), pins a
// triggered alarm, can leave out the reader's own comings and goings, and can share removed messages with all users.
//   node dev/unit/glocke_stapel.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,stackUp,rebuild,unfold,loadHidden,saveHidden,hideRows,ownPerson,standing
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const MIN = 60000;
const NOW = Date.parse('2026-11-13T15:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;
let hass;
let store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass, dispatchEvent: () => true } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'door-open';
window.casoraWatchRestarts = () => {};
window.casoraNeedsRestart = () => false;
window.casoraClockText = (h, use12, d) => use12 ? ((d.getHours() % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() >= 12 ? 'PM' : 'AM') : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
window.CASORA_NOTIFY_EXTENSIONS = [];

const iso = (ms) => new Date(ms).toISOString();
const ev = (id, state, ms) => ({ entity_id: id, state, when: ms / 1000 });
const LOCK = 'lock.haustuer', BELL = 'binary_sensor.klingel_ding', ALARM = 'alarm_control_panel.haus';
const ME = 'person.anna', YOU = 'person.ben';

let sent = [];
let ownHidden = null;
let pushShared = null;
function load({ logbook, states, uid = 'u-anna', cfg = {} }) {
  sent = [];
  pushShared = null;
  hass = {
    user: { id: uid, is_admin: false },
    states,
    entities: {}, devices: {}, areas: {},
    callWS: (msg) => Promise.resolve(msg.type === 'logbook/get_events' ? logbook : null),
    connection: {
      sendMessagePromise: (m) => { sent.push(m); return Promise.resolve(m.type === 'frontend/get_user_data' ? { value: ownHidden } : null); },
      subscribeMessage: (cb, m) => {
        sent.push(m);
        if (m.type === 'casora/notify_hidden/subscribe') { pushShared = cb; cb({ all: 0, rows: {} }); }
        return Promise.resolve(() => {});
      },
    },
  };
  delete window._casoraNotify;
  delete window.CASORA_NOTIFY_HIDE_OWN;
  delete window.CASORA_NOTIFY_SHARED_HIDDEN;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod)();
  globalThis.setTimeout = realTimeout;
  window._casoraNotify.configureFrom(cfg);
  return window._casoraNotify;
}

let fails = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log('ok   ' + name),
  (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

const lockStates = { [LOCK]: { entity_id: LOCK, state: 'locked', last_changed: iso(NOW - 2 * MIN), attributes: { friendly_name: 'Haustür' } } };
const lockLog = [];
// Five times locked and unlocked in the last hour.
for (let i = 0; i < 10; i++) lockLog.push(ev(LOCK, i % 2 ? 'locked' : 'unlocked', NOW - (60 - i * 6) * MIN));

await check('repeats of one source: one card with a count, no cut at 3', async () => {
  const n = load({ logbook: lockLog, states: lockStates });
  const rows = await n.refresh();
  const lock = rows.filter((r) => r.entity === LOCK);
  assert.equal(lock.length, 1, 'one card');
  assert.equal(lock[0].count, 10, 'all ten changes in the window');
  assert.equal(lock[0].members[0].when, lock[0].when, 'the card is the newest message');
  assert.equal(lock[0].label, 'Haustür verriegelt');
});

await check('an open stack is a timeline under its card (owner 13.11.2026), not rows of the list', async () => {
  const n = load({ logbook: lockLog, states: lockStates });
  const rows = await n.refresh();
  n.stack(rows[0].stackKey, true);
  assert.equal(n.shown.length, rows.length, 'the list keeps only the cards');
  const tl = n.timeline(rows[0].stackKey);
  assert.equal(tl.length, 9, 'every older message once');
  // Same source: only what differs, first letter up (verriegelt / entriegelt alternate).
  assert.deepEqual(tl.slice(0, 2).map((e) => e.text), ['Entriegelt', 'Verriegelt']);
  hass.locale = { time_format: '24' };
  assert.match(n.timeline(rows[0].stackKey)[0].time, /^\d{2}:\d{2}$/, '24-hour time when HA says so');
  assert.ok(tl[0].rel && tl[2].rel && !tl[3].rel, 'relative time only under the newest three');
  assert.ok(tl.every((e) => e.m.entity === LOCK), 'each entry opens its device');
});

await check('timeline: a day line above the first entry of an earlier day, the 12-hour time of HA', async () => {
  const y = new Date(NOW); y.setDate(y.getDate() - 1); y.setHours(21, 0, 0, 0);
  const log = lockLog.concat([ev(LOCK, 'unlocked', y.getTime()), ev(LOCK, 'locked', y.getTime() + 60e3)]);
  const n = load({ logbook: log, states: lockStates });
  const rows = await n.refresh();
  const tl = n.timeline(rows.find((r) => r.entity === LOCK).stackKey);
  const days = tl.filter((e) => e.day);
  assert.equal(days.length, 1, 'one day line');
  assert.equal(days[0].day, 'Gestern');
  assert.equal(tl.indexOf(days[0]), tl.findIndex((e) => e.m.when < NOW - (NOW - new Date(NOW).setHours(0, 0, 0, 0))), 'above the first entry of yesterday');
  // 12-hour profile: HA's time format.
  hass.locale = { time_format: '12' };
  assert.match(n.timeline(rows.find((r) => r.entity === LOCK).stackKey)[0].time, /^\d{1,2}:\d{2} (AM|PM)$/);
});
assert.ok(!/hui-chev/.test(mod.slice(mod.indexOf('function tlHtml'), mod.indexOf('var TL_CSS'))), 'timeline entries have no arrow');
assert.ok(/\.casora-ntl-e:active\{/.test(mod), 'press feedback on an entry');
assert.ok(/\.casora-ntl-e\{[^}]*min-height:36px;box-sizing:border-box;padding:4px 6px;/.test(mod.replace(/'\s*\/\/[^\n]*\n\s*\+\s*'/g, '').replace(/'\s*\+\s*'/g, '')), 'compact rows (owner 13.11.2026): 36 px, the tap area not smaller');

await check('removing the card removes the whole stack (and only it)', async () => {
  const states = { ...lockStates, [BELL]: { entity_id: BELL, state: 'off', last_changed: iso(NOW - 5 * MIN), attributes: { friendly_name: 'Klingel Ding' } } };
  window.CASORA_NOTIFY_TYPES = undefined;
  const n = load({ logbook: lockLog, states });
  const rows = await n.refresh();
  const card = rows.find((r) => r.entity === LOCK);
  // Remove via the swipe path (hideRows is not exported; the row carries its members).
  const mod2 = mod.replace('    open: open,', '    open: open, _hide: hideRows,');
  delete window._casoraNotify;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod2)();
  globalThis.setTimeout = realTimeout;
  const n2 = window._casoraNotify;
  const rows2 = await n2.refresh();
  n2._hide([rows2.find((r) => r.entity === LOCK)]);
  assert.ok(!n2.rows.some((r) => r.entity === LOCK), 'stack gone, no older message moves up');
  assert.ok(card.count > 1);
});

await check('the same text from a second source within minutes joins the stack (was the dedupe)', async () => {
  const B2 = 'event.klingel';
  const states = {
    [BELL]: { entity_id: BELL, state: 'off', attributes: { friendly_name: 'Klingel Ding' } },
    [B2]: { entity_id: B2, state: '2026', attributes: { friendly_name: 'Klingel', device_class: 'doorbell' } },
  };
  const n = load({ logbook: [ev(BELL, 'off', NOW - 30 * MIN), ev(BELL, 'on', NOW - 10 * MIN)], states });
  const rows = await n.refresh();
  const ring = rows.filter((r) => /geklingelt/.test(r.label));
  assert.ok(ring.length <= 1, 'one card for one ring');
});

await check('a triggered alarm is pinned on top while it lasts, without a second logbook row', async () => {
  const states = {
    ...lockStates,
    [ALARM]: { entity_id: ALARM, state: 'triggered', last_changed: iso(NOW - 30 * MIN), attributes: { friendly_name: 'Alarmanlage' } },
  };
  const log = lockLog.concat([ev(ALARM, 'armed_away', NOW - 90 * MIN), ev(ALARM, 'triggered', NOW - 30 * MIN)]);
  const n = load({ logbook: log, states });
  const rows = await n.refresh();
  assert.equal(rows[0].id, 'casora:alarm:' + ALARM, 'first row, although the lock is newer');
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].tone, 'bad');
  assert.equal(rows.filter((r) => r.entity === ALARM && r.label === rows[0].label).length, 1, 'not twice');
  // Disarmed: no longer pinned.
  states[ALARM] = { ...states[ALARM], state: 'disarmed', last_changed: iso(NOW - MIN) };
  const n2 = load({ logbook: log.concat([ev(ALARM, 'disarmed', NOW - MIN)]), states });
  assert.ok(!(await n2.refresh()).some((r) => r.id === 'casora:alarm:' + ALARM));
});

const people = {
  [ME]: { entity_id: ME, state: 'home', attributes: { friendly_name: 'Anna', user_id: 'u-anna' } },
  [YOU]: { entity_id: YOU, state: 'home', attributes: { friendly_name: 'Ben', user_id: 'u-ben' } },
};
const peopleLog = [ev(ME, 'not_home', NOW - 50 * MIN), ev(ME, 'home', NOW - 20 * MIN), ev(YOU, 'not_home', NOW - 40 * MIN), ev(YOU, 'home', NOW - 10 * MIN)];

await check('own comings and goings: shown by default', async () => {
  const rows = await load({ logbook: peopleLog, states: people }).refresh();
  assert.ok(rows.some((r) => r.entity === ME) && rows.some((r) => r.entity === YOU));
});
await check('own comings and goings: hidden with the switch, the others stay', async () => {
  const rows = await load({ logbook: peopleLog, states: people, cfg: { notification_hide_own: true } }).refresh();
  assert.ok(!rows.some((r) => r.entity === ME), 'Anna reads: not Anna');
  assert.ok(rows.some((r) => r.entity === YOU), 'Ben stays');
  const rowsBen = await load({ logbook: peopleLog, states: people, uid: 'u-ben', cfg: { notification_hide_own: true } }).refresh();
  assert.ok(rowsBen.some((r) => r.entity === ME) && !rowsBen.some((r) => r.entity === YOU), 'Ben reads: Anna, not Ben');
});

await check('removed messages: per user by default (frontend user data)', async () => {
  store = {};
  const n = load({ logbook: lockLog, states: lockStates });
  await n.refresh();
  assert.ok(sent.some((m) => m.type === 'frontend/get_user_data'));
  assert.ok(!sent.some((m) => /notify_hidden/.test(m.type)));
});
await check('removed messages: shared list with the switch, pushed changes apply', async () => {
  store = {};
  const n = load({ logbook: lockLog, states: lockStates, cfg: { notification_hidden_shared: true } });
  let rows = await n.refresh();
  assert.ok(sent.some((m) => m.type === 'casora/notify_hidden/subscribe'));
  assert.ok(!sent.some((m) => m.type === 'frontend/set_user_data'), 'never writes the per-user list (it is only read once to take it over)');
  assert.ok(rows.some((r) => r.entity === LOCK));
  // Another user removed the stack: the list arrives, the card is gone here too.
  const card = rows.find((r) => r.entity === LOCK);
  const hid = {}; card.members.forEach((m) => { hid[m.id] = m.when; });
  pushShared({ all: 0, rows: hid });
  assert.ok(!n.rows.some((r) => r.entity === LOCK));
  // „Remove all“ here writes the shared list.
  window.casoraTr = (x) => x;
  sent = [];
  const mod2 = mod.replace('    open: open,', '    open: open, _hideAll: hideAll,');
  delete window._casoraNotify;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod2)();
  globalThis.setTimeout = realTimeout;
  window._casoraNotify.configureFrom({ notification_hidden_shared: true });
  await window._casoraNotify.refresh();
  window._casoraNotify._hideAll();
  assert.ok(sent.some((m) => m.type === 'casora/notify_hidden/set' && m.all > 0), 'shared set');
});

await check('switching on „Removed for all users“ takes over what this user removed before', async () => {
  store = {};
  ownHidden = { all: NOW - 3 * 3600e3, rows: { 'lock.haustuer@123': NOW - 60e3 } };
  const n = load({ logbook: lockLog, states: lockStates, cfg: { notification_hidden_shared: true } });
  await n.refresh();
  await new Promise((r) => setTimeout(r, 0));
  const set = sent.filter((m) => m.type === 'casora/notify_hidden/set').pop();
  assert.ok(set, 'the merged list is written to the shared one');
  assert.equal(set.all, NOW - 3 * 3600e3);
  assert.equal(set.rows['lock.haustuer@123'], NOW - 60e3);
  ownHidden = null;
});

Date.now = realNow;
if (fails) { console.log(fails + ' Fehler'); process.exit(1); }
console.log('glocke_stapel: ok');
