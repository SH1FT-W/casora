// Studio preview = dashboard (test 2, T04): lock and light tiles run their templates in the preview – a lock group says
// "2 entriegelt" (not "Entriegelt"), the house light tile counts the rooms' lights ("2 An", not "Alle an").
//   node dev/unit/studio_preview_groups.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-basis.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;

const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.DOMParser = class { parseFromString(t) { return { body: { textContent: t.replace(/<[^>]+>/g, ''), querySelectorAll: () => [] } }; } };
const st = (id, state, a) => ({ entity_id: id, state, attributes: { friendly_name: id, ...a } });
const states = {
  'lock.front': st('lock.front', 'unlocked'), 'lock.back': st('lock.back', 'unlocked'), 'lock.shed': st('lock.shed', 'locked'),
  'light.a': st('light.a', 'on'), 'light.b': st('light.b', 'on'), 'light.c': st('light.c', 'off'), 'light.d': st('light.d', 'off'),
};
const hass = { states, entities: {}, devices: {}, areas: {}, language: 'de', locale: { language: 'de' }, formatEntityState: (s) => s.state };
const state = (tile, rooms) => window.casoraTileState(tile, states[tile.entity] || null, hass, templates, rooms);

// Locks
const locks = { type: 'custom:button-card', template: ['casora_lock', 'casora_popup_lock'], entity: 'lock.front', name: 'Schlösser',
  variables: { locks: ['lock.front', 'lock.back', 'lock.shed'] } };
assert.equal(state(locks), '2 entriegelt', 'lock group counts like the dashboard');
assert.equal(state({ type: 'custom:button-card', template: 'casora_lock', entity: 'lock.shed' }), 'Verriegelt', 'single lock');

// House lights without an HA group: the rooms' light badges
const rooms = [{ path: 'home', name: 'Home', variables: {} },
  { path: 'k', name: 'Kitchen', variables: { light_entity_1: 'light.a', light_entity_2: 'light.c' } },
  { path: 'b', name: 'Bath', variables: { light_entity_1: 'light.b', light_entity_2: 'light.d' } }];
const house = { type: 'custom:button-card', template: 'casora_light', entity: 'light.a', name: 'Beleuchtung',
  variables: { house: true, light_rooms_auto: true, lights: ['light.a'] } };
const txt = state(house, rooms);
assert.ok(/^2 An/.test(txt), 'house light tile counts the rooms\' lights: ' + txt);
assert.equal(window._casoraHouseLights, undefined, 'the Studio stand-in is removed again');
console.log('ok preview: lock and light groups as on the dashboard');
