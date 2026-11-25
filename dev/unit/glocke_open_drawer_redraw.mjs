// @deckt: custom_components/casora/scripts/casora-core.js#_casoraNotify,collect,rowsKey
// The bell drawer is open with rows already in it. A plain lock event that a collect finds afterwards
// must reach the open drawer at once, not only after the drawer is closed and opened again.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);
const known = 'lock.test_door';
const garage = 'lock.test_garage';
const now = Date.now() / 1000;
// One older row is already in the bell, so the drawer opens with rows it knows.
const entries = [{ entity_id: known, state: 'unlocked', name: 'Test Door', when: now - 400 }];
const hass = {
  states: {
    [known]: { entity_id: known, state: 'unlocked', attributes: { friendly_name: 'Test Door' } },
    [garage]: { entity_id: garage, state: 'unlocked', attributes: { friendly_name: 'Test Garage' } },
  },
  entities: {}, devices: {}, areas: {},
  callWS: async message => {
    if (message.type === 'logbook/get_events') return entries;
    return [];
  },
};

// Minimal DOM stand-in: every element accepts any call, the drawer's own redraw is counted.
let redraws = 0;
const element = () => {
  const store = { __kids: [] };
  const el = new Proxy(store, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'then' || key === Symbol.toPrimitive) return undefined;
      if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (key === 'style') return target.style || (target.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' });
      if (key === 'getBoundingClientRect') return () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
      if (key === 'offsetWidth' || key === 'offsetHeight') return 300;
      if (key === 'appendChild' || key === 'insertBefore' || key === 'append') return child => { target.__kids.push(child); return child; };
      if (key === 'childNodes' || key === 'children') return [];
      if (key === 'firstChild' || key === 'firstElementChild' || key === 'parentNode' || key === 'shadowRoot' || key === 'host') return null;
      return () => el;
    },
    set(target, key, value) {
      if (key === '_redraw') {
        const redraw = value;
        value = () => { redraws += 1; return redraw(); };
      }
      target[key] = value;
      return true;
    },
  });
  return el;
};

globalThis.window = globalThis;
window.innerWidth = 1200;
window.innerHeight = 800;
window.CASORA_SETTINGS = { cameras: [] };
window.casoraSecurityIcon = () => 'lock';
window.casoraMenuGlass = new Proxy({ dropTop: () => 0 }, { get: (target, key) => (key in target ? target[key] : () => 0) });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = new Proxy({
  readyState: 'complete', hidden: false, documentElement: element(), body: element(),
  querySelector: query => (query === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener() {}, createElement: () => element(),
}, { get: (target, key) => (key in target ? target[key] : () => element()) });
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.Event = class { constructor(type) { this.type = type; } };
new Function(mod)();

const notify = window._casoraNotify;
assert.deepEqual((await notify.refresh()).map(row => row.label), ['Test Door entriegelt'], 'the known lock row is there before the drawer opens');

// The drawer is open. Then a plain lock event happens; the collect that it starts finds the new row.
notify.open(element());
await notify.refresh();
assert.deepEqual(notify.rows.map(row => row.label), ['Test Door entriegelt'], 'the drawer opens with the rows it knows');

const before = redraws;
entries.push({ entity_id: garage, state: 'unlocked', name: 'Test Garage', when: now - 2 });
await notify.refresh();

assert.ok(notify.rows.some(row => row.label === 'Test Garage entriegelt'), 'the collect finds the lock event');
assert.ok(redraws > before, 'the open drawer is drawn again when a collect changes its rows');
console.log('ok glocke_open_drawer_redraw');
