// Lock group (follow-up to #37): the setup names the first lock as the group tile's entity, next to
// variables.locks. A lock row in that popup searched the visible tiles and found the group tile again
// (same popup); the first lock counted as "the device of the open popup" and opened its device page.
// Expected: every lock row opens its lock (own card or the lock popup, no visible-tile search); the
// "Gerät" row in a single lock's popup keeps opening the device page.
//   node dev/unit/schloss_gruppe_zeile.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/' + p, import.meta.url), 'utf8');
const core = read('casora-core.js');

const hass = {
  states: { 'lock.a': { entity_id: 'lock.a', state: 'locked', attributes: {} }, 'lock.b': { entity_id: 'lock.b', state: 'locked', attributes: {} } },
  entities: { 'lock.a': {}, 'lock.b': {} }, devices: {}, areas: {},
};
const window = globalThis.window = {};
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener() {} };
new Function('window', core.match(/  function standsForGroup\(cfg, entityId\) \{[\s\S]*?\n  \}\n  window\._casoraStandsForGroup = standsForGroup;\n/)[0])(window);
new Function(read('local/18-ziele.js'))();
const Z = window._casoraZiele;

let opened = null;
Z.openDevice = (id) => { opened = ['device', id]; return true; };
window._casoraNotifyOpenViaCard = (id, done, cfg, noTile) => { opened = ['popup', id, noTile]; };
const popupOf = (tileCfg) => {
  window.casoraPopup = { entity: tileCfg.entity, current: null, element: { _src: { _config: tileCfg } } };
};
const row = (id) => { opened = null; window.casoraRoute(id, { el: { textContent: 'Schloss' } }); return opened; };

popupOf({ entity: 'lock.a', template: 'casora_lock', variables: { locks: ['lock.a', 'lock.b'] } });
assert.deepEqual(row('lock.a'), ['popup', 'lock.a', true], 'first lock of the group: its lock popup, not its device page');
assert.deepEqual(row('lock.b'), ['popup', 'lock.b', true], 'other lock: without the visible-tile search');

popupOf({ entity: 'lock.a', template: 'casora_lock' });
assert.deepEqual(row('lock.a'), ['device', 'lock.a'], 'single lock popup: the „Gerät“ row opens the device page');

window.casoraPopup = { entity: null, current: null, element: null };
opened = null; window.casoraRoute('lock.b', {});
assert.deepEqual(opened, ['popup', 'lock.b', false], 'no row (bell, badge): the visible tile as before');
console.log('ok schloss_gruppe_zeile');
