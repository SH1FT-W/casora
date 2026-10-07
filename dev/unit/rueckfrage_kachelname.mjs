// Rückfrage nennt den Kachelnamen (note4 Frage 4).  node dev/unit/rueckfrage_kachelname.mjs
// Kachel „Garage“ auf der Entität „Testjalousie“: Dialog im Popup sagte „Testjalousie – Wirklich öffnen?“,
// auf der Kachel „Garage“. Jetzt überall der eigene Kachelname, ohne eigenen Namen der Gerätename.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const src = read('panel/casora-panel.js');
const grab = (name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n}', i) + 2); };
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const confirmNames = new Function(grab('confirmNames') + '\nreturn confirmNames;')();
const tile = (entity, name, ask, extra) => ({ type: 'custom:button-card', template: 'casora_cover', entity, ...(name !== undefined ? { name } : {}),
  variables: { ...(ask ? { confirm_toggle: true } : {}), ...(extra || {}) } });
const rooms = [{ tiles: [tile('cover.test_jalousie', 'Garage', true), tile('switch.testpumpe', undefined, true), tile('light.testraum_decke', 'Decke', false),
  tile('switch.testschalter', '[[[ return "y" ]]]', true), { type: 'conditional', card: tile('cover.testtor', 'Tor', true, { cover_entity: 'cover.testtor_motor' }) }] }];
assert.deepEqual(confirmNames(rooms), { 'cover.test_jalousie': 'Garage', 'cover.testtor': 'Tor', 'cover.testtor_motor': 'Tor' });
// Speichern schreibt die Namen neben casora_confirm_entities
const expand = new Function('clone', [grab('roomVisibility'), grab('entityUsers'), grab('confirmEntities'), grab('confirmNames'), grab('expandConfig'), 'return expandConfig;'].join('\n'))(clone);
const R = [{ path: 'flur', name: 'Flur', variables: {}, tiles: rooms[0].tiles, _hero: { template: 'casora_room' }, _row: {}, _view: {} }];
const v = expand({ rooms: R }, { view_type: 'panel', layout: {}, nav: {} }, {}, null).views[0].cards[0].variables;
assert.deepEqual(v.casora_confirm_names, { 'cover.test_jalousie': 'Garage', 'cover.testtor': 'Tor', 'cover.testtor_motor': 'Tor' });

// casora-core: word() wählt den Namen
const core = read('scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const states = { 'cover.test_jalousie': { state: 'closed', attributes: { friendly_name: 'Testjalousie' } },
  'switch.testpumpe': { state: 'off', attributes: { friendly_name: 'Pumpe' } } };
const w = { addEventListener: () => {} };
const doc = { querySelector: () => ({ hass: { user: { id: 'a' }, states } }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, (f) => f());
w.casoraEntityUsersFrom({ show_security: true, casora_confirm_entities: ['cover.test_jalousie', 'switch.testpumpe'], casora_confirm_names: v.casora_confirm_names });
const { word } = w.__casoraAskFirstParts;
const open = { action: 'perform-action', perform_action: 'cover.open_cover', target: { entity_id: 'cover.test_jalousie' } };
assert.equal(word(open, { entity: 'cover.test_jalousie' }).name, 'Garage', 'Popup-Knopf: Kachelname');
assert.equal(word(open, { entity: 'cover.test_jalousie', name: 'Garage' }).name, 'Garage', 'Kachel selbst');
assert.equal(word(open, { entity: 'cover.test_jalousie', name: 'Auf', __byId: true }).name, 'Garage', 'Knopf im Popup mit eigenem Text: Kachelname');
assert.equal(word({ action: 'toggle', target: { entity_id: 'switch.testpumpe' } }, { entity: 'switch.testpumpe' }).name, 'Pumpe', 'ohne eigenen Namen: Gerät');
assert.equal(word({ action: 'toggle', target: { entity_id: 'switch.testpumpe' } }, { entity: 'switch.testpumpe', name: '' }).name, 'Pumpe', 'Studio ohne Namen');
// Raum ohne Namensliste setzt sie zurück
w.casoraEntityUsersFrom({ show_security: true, casora_confirm_entities: ['cover.test_jalousie'] });
assert.equal(word(open, { entity: 'cover.test_jalousie' }).name, 'Testjalousie');
console.log('ok rueckfrage_kachelname');
