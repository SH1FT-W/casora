// Shopping list card (#82, 36-shopping.js): tile word, the list's open and done items from HA's to-do API, the
// services a row calls (tick off / put back, clearing asks first), „Milch, 1 l“ as item and Bring specification;
// the popup is HA's own to-do list card until popup v3 draws Casora's own.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const win = {};
const box = { window: win, setTimeout, console };
vm.createContext(box);
vm.runInContext(fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/36-shopping.js', 'utf8'), box);
const S = win._casoraShopping;

assert.equal(S.tileState({ state: '3' }), '3 offen');
assert.equal(S.tileState({ state: '0' }), 'Alles eingekauft');
assert.equal(S.tileState({ state: 'unavailable' }), 'Nicht erreichbar');

const ID = 'todo.einkauf';
let push = null, changed = 0;
const hass = { states: {}, callWS: () => Promise.resolve({ items: [] }),
  connection: { subscribeMessage: (cb) => { push = cb; return Promise.resolve(() => {}); } } };
S.onChange(() => { changed++; });
assert.equal(S.items(hass, ID), null, 'loading until the list arrives');
push({ items: [{ uid: 'a', summary: 'Milch', description: '1 l', status: 'needs_action' }, { uid: 'b', summary: 'Brot', status: 'needs_action' },
  { uid: 'c', summary: 'Kaffee', status: 'completed' }] });
const L = S.items(hass, ID);
assert.equal(L.open.length, 2); assert.equal(L.done.length, 1);
assert.equal(changed, 1, 'a change tells the listeners');
const tick = S.toggleSvc(ID, L.open[0], false);
assert.equal(tick.service, 'update_item'); assert.equal(tick.data.item, 'a'); assert.equal(tick.data.status, 'completed');
assert.equal(S.toggleSvc(ID, L.done[0], true).data.status, 'needs_action', 'a tap puts back');
assert.ok(S.clearSvc(ID).confirm, 'clearing asks first');
assert.deepEqual(JSON.parse(JSON.stringify(S.parse(' Milch, 1 l '))), { item: 'Milch', description: '1 l' });
assert.deepEqual(JSON.parse(JSON.stringify(S.parse('Brot'))), { item: 'Brot' });
assert.equal(S.parse('  '), null);

// The popup: HA's to-do list card for the tile's list, no empty popup.
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const cp = T.casora_popup_shopping.tap_action.casora_popup;
const body = cp.content.replace(/^\[\[\[|\]\]\]\s*$/g, '');
const card = new Function('entity', body)({ entity_id: ID });
assert.deepEqual(card, { type: 'todo-list', entity: ID });
assert.ok(Array.isArray(cp.popup_styles), 'standard popup styles');
assert.match(fs.readFileSync(ROOT + 'custom_components/casora/scripts/casora-local.js', 'utf8'), /'36-shopping'/, 'module is loaded');
console.log('ok shopping_list');
