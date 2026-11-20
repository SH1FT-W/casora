// Bell doorbell stacks in the dashboard language: the expanded stack's text, relative time and day heading
// come from the existing dashboard phrases in all nine languages (no new phrases).
// The expected words are read from the real phrase files (translations/dashboard/phrases/<lang>.json).
//   node dev/unit/i18n_bell_doorbell.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,tlEntries,tlTexts,tlHtml,ago
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const PHRASES = new URL('../../custom_components/casora/translations/dashboard/phrases/', import.meta.url);
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const MIN = 60000;
const NOW = Date.parse('2026-11-17T08:00:00Z');
Date.now = () => NOW;
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

// The phrase a German source text gets in a language, from the real file: exact match first, then the pattern
// ({1}, {2} are the captured groups). A German text with no entry stays German (de has no entries).
const phraseFile = (lang) => JSON.parse(fs.readFileSync(new URL(lang + '.json', PHRASES), 'utf8'));
function fromFile(lang, german) {
  const table = phraseFile(lang);
  if (Object.prototype.hasOwnProperty.call(table.exact || {}, german)) return table.exact[german];
  for (const [pattern, out] of table.patterns || []) {
    const m = german.match(new RegExp(pattern));
    if (m) return out.replace(/\{(\d+)\}/g, (_, i) => m[Number(i)]);
  }
  return german;
}

// Three doorbell kinds: a Ring event with the device name (rows read „Mock Entrance hat geklingelt“), a Ring event
// named „Mock Entrance Ding“ (the row name is then not a prefix of the label, so the pattern form is used), and a
// Reolink visitor sensor (binary, on and back to off; its release adds no ring).
const yesterday = new Date(NOW);
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(20, 17, 0, 0);
const rings = [NOW - 5 * MIN, NOW - 50 * MIN, yesterday.getTime()];
// The Ring-style event; the two Ring kinds differ only in the entity's friendly name and the German text of the row.
const RING_EVENT = {
  id: 'event.mock_entrance_ding', device_class: 'doorbell',
  entity: { device_id: 'mock-bell', platform: 'ring', translation_key: 'ding' },
  log: rings.map((ms) => ({ entity_id: 'event.mock_entrance_ding', state: new Date(ms).toISOString(), when: ms / 1000 })),
  state: new Date(rings[0]).toISOString(),
};
const KINDS = {
  ring: { ...RING_EVENT, friendly: 'Mock Entrance', text: 'Hat geklingelt' },
  ringDing: { ...RING_EVENT, friendly: 'Mock Entrance Ding', text: 'Mock Entrance hat geklingelt' },
  reolink: { id: 'binary_sensor.mock_front_gate', friendly: 'Mock Entrance', text: 'Hat geklingelt',
    entity: { device_id: 'mock-bell', platform: 'reolink', translation_key: 'visitor' },
    log: rings.flatMap((ms) => [{ entity_id: 'binary_sensor.mock_front_gate', state: 'on', when: ms / 1000 },
      { entity_id: 'binary_sensor.mock_front_gate', state: 'off', when: ms / 1000 + 3 }]),
    state: 'off' },
};
const LANGS = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb'];
const GERMAN = /Hat geklingelt|hat geklingelt|vor \d+ Min\.|Gestern|Gerade eben/;

for (const kind of Object.keys(KINDS)) for (const lang of LANGS) {
  const K = KINDS[kind], SRC = K.id;
  const text = fromFile(lang, K.text), rel = fromFile(lang, 'vor 50 Min.'), day = fromFile(lang, 'Gestern');
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
  assert.ok(tl.some((e) => e.text === text), `${kind} ${lang}: stack entry reads "${text}" (phrase file), got: ${shown}`);
  const newest = tl.find((e) => e.rel);
  assert.equal(newest && newest.rel, rel, `${kind} ${lang}: relative time`);
  assert.ok(tl.some((e) => e.day === day), `${kind} ${lang}: day heading "${day}"`);
  // No German text left in the entries shown, in any language but German.
  if (lang !== 'de') {
    for (const e of tl) {
      for (const shownText of [e.text, e.rel, e.day]) {
        assert.doesNotMatch(String(shownText || ''), GERMAN, `${kind} ${lang}: German left in "${shownText}"`);
      }
    }
  }
  console.log(`ok   ${kind} ${lang}: ${text} | ${rel} | ${day}`);
}
console.log('ok i18n_bell_doorbell');
