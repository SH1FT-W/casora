// Bell doorbell stacks in the dashboard language: the expanded stack's text, relative time and day heading
// come from the existing dashboard phrases in all nine languages (no new phrases).
//   node dev/unit/i18n_bell_doorbell.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,tlEntries,tlTexts,tlHtml,ago
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const MIN = 60000;
const NOW = Date.parse('2026-11-17T08:00:00Z');
Date.now = () => NOW;
const SRC = 'event.mock_entrance_ding';
let hass;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass, dispatchEvent: () => true } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.setInterval = () => 0;
window.__casoraI18nPhrases = phrases();
window.casoraSecurityIcon = () => 'shield';
window.casoraWatchRestarts = () => {};
window.casoraNeedsRestart = () => false;
window.casoraClockText = (h, use12, d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
window.CASORA_NOTIFY_EXTENSIONS = [];
new Function(finder)(); // the doorbell rule (window.casoraIsDoorbell) loads before the bell, as on the dashboard

// Two doorbell kinds: a Ring event (rows read „Mock Entrance hat geklingelt“) and a Reolink
// visitor sensor (binary, on and back to off; its release adds no ring).
const yesterday = new Date(NOW);
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(20, 17, 0, 0);
const rings = [NOW - 5 * MIN, NOW - 50 * MIN, yesterday.getTime()];
const KINDS = {
  ring: { id: 'event.mock_entrance_ding', friendly: 'Mock Entrance', device_class: 'doorbell',
    entity: { device_id: 'mock-bell', platform: 'ring', translation_key: 'ding' },
    log: rings.map((ms) => ({ entity_id: 'event.mock_entrance_ding', state: new Date(ms).toISOString(), when: ms / 1000 })),
    state: new Date(rings[0]).toISOString() },
  reolink: { id: 'binary_sensor.mock_front_gate', friendly: 'Mock Entrance', device_class: undefined,
    entity: { device_id: 'mock-bell', platform: 'reolink', translation_key: 'visitor' },
    log: rings.flatMap((ms) => [{ entity_id: 'binary_sensor.mock_front_gate', state: 'on', when: ms / 1000 },
      { entity_id: 'binary_sensor.mock_front_gate', state: 'off', when: ms / 1000 + 3 }]),
    state: 'off' },
};

// The phrases of each language: text of the stack's entry, relative time of the newest, day heading of yesterday.
const CASES = [
  ['de', 'Hat geklingelt', 'vor 50 Min.', 'Gestern'],
  ['en', 'Someone rang', '50 min ago', 'Yesterday'],
  ['es', 'Han llamado', 'hace 50 min', 'Ayer'],
  ['fr', 'On a sonné', 'il y a 50 min', 'Hier'],
  ['it', 'Hanno suonato', '50 min fa', 'Ieri'],
  ['nl', 'Er is aangebeld', '50 min geleden', 'Gisteren'],
  ['pl', 'Ktoś dzwonił', '50 min temu', 'Wczoraj'],
  ['pt', 'Tocaram à campainha', 'há 50 min', 'Ontem'],
  ['nb', 'Noen ringte på', 'for 50 min siden', 'I går'],
];
const GERMAN = /Hat geklingelt|hat geklingelt|vor \d+ Min\.|Gestern|Gerade eben/;

for (const kind of Object.keys(KINDS)) for (const [lang, text, rel, day] of CASES) {
  const K = KINDS[kind], SRC = K.id;
  delete window._casoraNotify;
  hass = {
    user: { id: 'u', is_admin: false }, locale: { language: lang, time_format: '24' }, language: lang,
    states: { [SRC]: { entity_id: SRC, state: K.state, attributes: { friendly_name: K.friendly, ...(K.device_class ? { device_class: K.device_class } : {}) } } },
    entities: { [SRC]: K.entity }, devices: {}, areas: {},
    callWS: (msg) => Promise.resolve(msg.type === 'logbook/get_events' ? K.log : null),
    connection: {
      sendMessagePromise: () => Promise.resolve(null),
      subscribeMessage: (cb, m) => { if (m.type === 'casora/notify_hidden/subscribe') cb({ all: 0, rows: {} }); return Promise.resolve(() => {}); },
    },
  };
  // The dashboard translation of this language (casora-i18n.js reads the language from the page's hass).
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  new Function('window', 'document', 'customElements', 'MutationObserver', i18n)(
    window, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} });
  assert.equal(window.casoraTr('Aus'), window.casoraTr('Aus'), 'translator loaded');
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod)();
  globalThis.setTimeout = realTimeout;
  const n = window._casoraNotify;
  n.configureFrom({});
  const rows = await n.refresh();
  const card = rows.find((r) => r.entity === SRC);
  assert.ok(card && card.count === 3, `${kind} ${lang}: the three rings are one doorbell stack`);
  n.stack(card.stackKey, true);
  const tl = n.timeline(card.stackKey);
  const shown = tl.map((e) => e.text).join(' | ');
  assert.ok(tl.some((e) => e.text === text), `${kind} ${lang}: stack entry reads "${text}", got: ${shown}`);
  const newest = tl.find((e) => e.rel);
  assert.equal(newest && newest.rel, rel, `${lang}: relative time`);
  assert.ok(tl.some((e) => e.day === day), `${lang}: day heading "${day}"`);
  // Also the rendered markup (what the drawer shows): no German text left, in any language but German.
  if (lang !== 'de') {
    const html = [text, rel, day].join(' ');
    assert.doesNotMatch(html, GERMAN, `${lang}: no German text`);
    for (const e of tl) assert.doesNotMatch(String(e.text) + String(e.rel) + String(e.day), GERMAN, `${lang}: entry without German`);
  }
  console.log(`ok   ${kind} ${lang}: ${text} | ${rel} | ${day}`);
}
console.log('ok i18n_bell_doorbell');
