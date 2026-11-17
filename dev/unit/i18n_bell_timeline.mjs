// #175: the bell in English. An open stack's timeline (time, what happened, day line, relative time) is built
// outside UI.group, which translates the rows; it showed „Aus“, „Aktiv · Zuhause“, „Gestern“, „vor 2 Std.“.
// Every text the bell shows in English has to be translated already: tr(text) === text.
//   node dev/unit/i18n_bell_timeline.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,tlEntries,tlTexts,tlHtml,ago
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const MIN = 60000;
const NOW = Date.parse('2026-11-17T08:00:00Z');
Date.now = () => NOW;
const ALARM = 'alarm_control_panel.verisure';
let hass = {
  user: { id: 'u-a', is_admin: false },
  locale: { language: 'en', time_format: '12' },
  language: 'en',
  states: { [ALARM]: { entity_id: ALARM, state: 'disarmed', last_changed: new Date(NOW - 80 * MIN).toISOString(), attributes: { friendly_name: 'Verisure Alarm' } } },
  entities: {}, devices: {}, areas: {},
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
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
window.__casoraI18nPhrases = phrases();
try { new Function('customElements', 'MutationObserver', i18n)({ whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
const tr = window.casoraTr;
assert.ok(tr && tr('Aus') === 'Off', 'English phrase table loaded');

window.casoraSecurityIcon = () => 'shield';
window.casoraWatchRestarts = () => {};
window.casoraNeedsRestart = () => false;
window.casoraClockText = (h, use12, d) => ((d.getHours() % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() >= 12 ? 'PM' : 'AM');
window.CASORA_NOTIFY_EXTENSIONS = [];

// The alarm of the report: armed home and off in turns, today and yesterday evening.
const ev = (state, ms) => ({ entity_id: ALARM, state, when: ms / 1000 });
const y = new Date(NOW); y.setDate(y.getDate() - 1); y.setHours(20, 17, 0, 0);
const log = [];
for (let i = 0; i < 6; i++) log.push(ev(i % 2 ? 'disarmed' : 'armed_home', NOW - (330 - i * 50) * MIN));
log.push(ev('armed_home', y.getTime()), ev('disarmed', y.getTime() - 45 * MIN), ev('armed_home', y.getTime() - 90 * MIN));
log.sort((a, b) => a.when - b.when);
hass.callWS = (msg) => Promise.resolve(msg.type === 'logbook/get_events' ? log : null);
hass.connection = {
  sendMessagePromise: () => Promise.resolve(null),
  subscribeMessage: (cb, m) => { if (m.type === 'casora/notify_hidden/subscribe') cb({ all: 0, rows: {} }); return Promise.resolve(() => {}); },
};

async function timelineOf(soft) {
  delete window._casoraNotify;
  window._casoraSoft = () => soft;
  // Weich: the words of tile, badge and popup (casoraSecurityWord), as in the report.
  window.casoraSecurityWord = soft ? (id, s) => (s === 'disarmed' ? 'Aus' : s === 'armed_home' ? 'Aktiv · Zuhause' : null) : undefined;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod)();
  globalThis.setTimeout = realTimeout;
  const n = window._casoraNotify;
  n.configureFrom({});
  const rows = await n.refresh();
  const card = rows.find((r) => r.entity === ALARM && r.count > 1);
  assert.ok(card, 'the alarm is one stack');
  n.stack(card.stackKey, true);
  return n.timeline(card.stackKey);
}

for (const soft of [false, true]) {
  const tl = await timelineOf(soft);
  assert.ok(tl.length >= 5 && tl.some((e) => e.day) && tl.some((e) => e.rel), 'timeline with a day line and relative times');
  const german = [];
  for (const e of tl) for (const k of ['text', 'day', 'rel']) if (e[k] && tr(e[k]) !== e[k]) german.push(k + ': ' + e[k] + ' → ' + tr(e[k]));
  assert.deepEqual(german, [], 'timeline shows German in English');
  assert.ok(tl.some((e) => e.day === 'Yesterday'), 'day line in English');
  assert.ok(tl.some((e) => / ago$/.test(e.rel)), 'relative time in English');
  const texts = tl.map((e) => e.text).join(' | ');
  assert.match(texts, soft ? /Alarm off|(^|\| )Off( |$)/ : /Disarmed/, texts);
  console.log('ok   bell timeline in English, ' + (soft ? 'Weich' : 'classic') + ': ' + texts);
}

// The bell window hangs on <body>, outside the watched tiles and popups: it carries the window mark, so a text
// that skips tr is still translated (casora-i18n.js, dev/unit/i18n_body_windows.mjs).
const om = core.slice(core.indexOf('  function openMenu(anchor) {'), core.indexOf('    fade();\n    paint(body);'));
assert.match(om, /menu\.setAttribute\('data-casora-window', ''\); document\.body\.appendChild\(menu\);/, 'bell window marked');
console.log('ok   bell window marked for the dashboard translation');
