// Doorbell rule of the bell: a Reolink visitor sensor counts as a doorbell by platform and translation key
// (entity registry), with no device class and no guessed entity ID. The Studio exclusion list uses the same rule.
//   node dev/unit/glocke_doorbell_rule.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraIsDoorbell,isReolinkVisitor,notifySources
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,isDoorbell
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
const GATE = 'binary_sensor.mock_front_gate';
const CHIME = 'binary_sensor.mock_chime_doorbell';
const RING = 'event.mock_entrance_ding';
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

// 0. The bell asks the shared rule only when a hass is there; without one, the old check below it applies.
assert.match(core, /var h = hassOf\(\);\s*if \(window\.casoraIsDoorbell && h\) return window\.casoraIsDoorbell\(h, id\);/,
  'isDoorbell delegates to the shared rule only with hass present');

// 1. Reolink visitor sensor: renamed (no „doorbell“ in its ID), no device class, on only briefly.
const gateStates = { [GATE]: { entity_id: GATE, state: 'off', last_changed: new Date(NOW - 50 * 1000).toISOString(), attributes: attrs('Mock Front Gate') } };
const gateEntities = { [GATE]: { device_id: 'mock-gate-device', platform: 'reolink', translation_key: 'visitor' } };
assert.equal(typeof window.casoraIsDoorbell, 'function', 'the shared doorbell rule exists (00-finder.js)');
assert.equal(window.casoraIsDoorbell({ states: gateStates, entities: gateEntities }, GATE), true,
  'a Reolink visitor sensor is a doorbell by platform and translation key');
assert.equal(window.casoraIsDoorbell({ states: gateStates, entities: { [GATE]: { device_id: 'x', platform: 'example', translation_key: 'visitor' } } }, GATE), false,
  'a visitor sensor of another platform is not a doorbell');
assert.equal(window.casoraIsDoorbell({ states: gateStates, entities: { [GATE]: { device_id: 'x', platform: 'reolink', translation_key: 'motion' } } }, GATE), false,
  'a Reolink sensor with another translation key is not a doorbell');
assert.equal(window.casoraIsDoorbell({ states: gateStates, entities: {} }, GATE), false,
  'without registry data no guess from the entity ID or the name');

const gate = await bell({
  states: gateStates, entities: gateEntities,
  log: [on(GATE, NOW - 60 * 1000)],
});
const gateRows = gate.rows.filter((r) => r.entity === GATE);
assert.equal(gateRows.length, 1, 'a Reolink visitor press creates one bell row');
assert.match(gateRows[0].label, /hat geklingelt$/i, 'the bell row reads as a doorbell press');
assert.ok(gate.studio.some((r) => r.entity === GATE && r.kinds.includes('doorbell')),
  'the Studio exclusion list recognizes the same Reolink doorbell');

// 4. Regression: a Ring-style event with device class doorbell is still a row.
const ring = await bell({
  states: { [RING]: { entity_id: RING, state: new Date(NOW - 60 * 1000).toISOString(), attributes: attrs('Mock Entrance Ding', { device_class: 'doorbell' }) } },
  entities: { [RING]: { device_id: 'mock-entrance-device', platform: 'ring', translation_key: 'ding' } },
  log: [on(RING, NOW - 60 * 1000, new Date(NOW - 60 * 1000).toISOString())],
});
assert.equal(ring.rows.filter((r) => r.entity === RING).length, 1, 'a Ring-style doorbell event keeps its row');
console.log('ok glocke_doorbell_rule');
