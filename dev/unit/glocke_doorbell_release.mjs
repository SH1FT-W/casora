// A binary-sensor doorbell that goes back to „off“ (the release) adds no second bell row, for a binary doorbell
// by name and for a Reolink visitor sensor.
//   node dev/unit/glocke_doorbell_release.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,isDoorbell
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraIsDoorbell,isReolinkVisitor
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'bell module found');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const NOW = Date.parse('2026-11-17T08:00:00Z');
Date.now = () => NOW;
const GATE = 'binary_sensor.mock_front_gate';
const CHIME = 'binary_sensor.mock_chime_doorbell';
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
try { new Function('customElements', 'MutationObserver', i18n)({ whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* no browser */ }
window.casoraSecurityIcon = () => 'shield';
window.casoraWatchRestarts = () => {};
window.casoraNeedsRestart = () => false;
window.casoraClockText = (h, use12, d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
window.CASORA_NOTIFY_EXTENSIONS = [];
new Function(finder)();

// One bell run over the given states, registry and logbook. Returns the rows and the Studio's list.
async function bell({ states, entities, log }) {
  hass = {
    user: { id: 'u', is_admin: false }, locale: { language: 'en', time_format: '24' }, language: 'en',
    states, entities, devices: {}, areas: {},
    callWS: (msg) => Promise.resolve(msg.type === 'logbook/get_events' ? log : null),
    connection: {
      sendMessagePromise: () => Promise.resolve(null),
      subscribeMessage: (cb, m) => { if (m.type === 'casora/notify_hidden/subscribe') cb({ all: 0, rows: {} }); return Promise.resolve(() => {}); },
    },
  };
  delete window._casoraNotify;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  new Function(mod)();
  globalThis.setTimeout = realTimeout;
  const n = window._casoraNotify;
  n.configureFrom({});
  const rows = await n.refresh();
  return { rows, studio: window.casoraNotifySources(hass) };
}
const on = (id, ms, state = 'on') => ({ entity_id: id, state, when: ms / 1000 });
const attrs = (name, extra = {}) => ({ friendly_name: name, ...extra });

// 1. Release: a binary doorbell (occupancy class, name rule) going back to „off“ adds no second row.
const chimeStates = { [CHIME]: { entity_id: CHIME, state: 'off', last_changed: new Date(NOW - 20 * 1000).toISOString(), attributes: attrs('Mock Chime Doorbell', { device_class: 'occupancy' }) } };
const pressed = await bell({ states: chimeStates, entities: {}, log: [on(CHIME, NOW - 60 * 1000), on(CHIME, NOW - 57 * 1000, 'off')] });
const chimeRows = pressed.rows.filter((r) => r.entity === CHIME);
assert.equal(chimeRows.length, 1, 'the release of a binary doorbell does not create a second row');
assert.equal(chimeRows[0].count, 1, 'the release is not counted as a ring');

// 2. Reolink visitor release: the same rule, for a visitor sensor (needs the doorbell rule of glocke_doorbell_rule.mjs).
const gateStates = { [GATE]: { entity_id: GATE, state: 'off', last_changed: new Date(NOW - 50 * 1000).toISOString(), attributes: attrs('Mock Front Gate') } };
const gateEntities = { [GATE]: { device_id: 'mock-gate-device', platform: 'reolink', translation_key: 'visitor' } };
const released = await bell({
  states: { [GATE]: { ...gateStates[GATE], state: 'off' } }, entities: gateEntities,
  log: [on(GATE, NOW - 60 * 1000), on(GATE, NOW - 57 * 1000, 'off')],
});
const releasedRows = released.rows.filter((r) => r.entity === GATE);
assert.equal(releasedRows.length, 1, 'the Reolink release does not create a second row');
assert.equal(releasedRows[0].count, 1, 'the Reolink release is not counted as a ring');
console.log('ok glocke_doorbell_release');
