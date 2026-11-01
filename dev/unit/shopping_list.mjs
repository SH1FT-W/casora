// Shopping list card (#82, 36-shopping.js): tile word, the list's open and done items from HA's to-do API, the
// services a row calls (tick off / put back, clearing asks first), „Milch, 1 l“ as item and Bring specification;
// popup v3 draws Casora's own list (S.popup), without v3 HA's own to-do list card.
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

// The popup: without popup v3 (no Casora UI kit) HA's to-do list card for the tile's list, no empty popup.
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
const cp = T.casora_popup_shopping.tap_action.casora_popup;
assert.equal(cp.variant, 'v3', 'v3 frame');
const body = cp.content.replace(/^\[\[\[|\]\]\]\s*$/g, '');
const card = new Function('entity', 'states', 'hass', 'window', body)({ entity_id: ID }, {}, hass, win);
assert.deepEqual(JSON.parse(JSON.stringify(card)), { type: 'todo-list', entity: ID });
assert.deepEqual(JSON.parse(JSON.stringify(new Function('entity', 'states', 'hass', 'window', body)(null, {}, hass, win))), { type: 'vertical-stack', cards: [] });
// Popup v3 parts: open items with their food and specification, the ticked ones with „Erledigte löschen“ (asks first).
const UIs = { esc: String, empty: (o) => 'EMPTY:' + o.text, group: (rows, label) => label + '|' + rows.map((r) => r.label + (r.sub ? '/' + r.sub : '') + (r.confirm ? '?' : '')).join(','),
  stage: (t, o) => t + ':' + o.html };
win._casoraUI = UIs;
const st = S.innerHtml('stage', ID, hass);
assert.match(st, /data-shop-add=/); assert.match(st, /Offen\|Milch\/1 l,Brot/); assert.ok(!/2 offen/.test(st), 'the count is the status line\'s, not the heading\'s (§3)');
assert.equal(S.innerHtml('done', ID, hass), 'Erledigt|Kaffee,Erledigte löschen?');
assert.ok(Array.isArray(cp.popup_styles), 'standard popup styles');
assert.match(fs.readFileSync(ROOT + 'custom_components/casora/scripts/casora-local.js', 'utf8'), /'36-shopping'/, 'module is loaded');
// Status line (prod test 01.11.2026): words, never the raw count „0“; „Alles eingekauft“ only there, not on the plate.
UIs.line = (m, r) => m + (r.length ? ' · ' + r.join(' · ') : '');
assert.equal(S.innerHtml('line', ID, hass), '2 offen · 1 erledigt');
push({ items: [{ uid: 'c', summary: 'Kaffee', status: 'completed' }, { uid: 'd', summary: 'Tee', status: 'completed' }, { uid: 'e', summary: 'Brot', status: 'completed' }] });
assert.equal(S.innerHtml('line', ID, hass), 'Alles eingekauft · 3 erledigt');
assert.ok(!/Alles eingekauft/.test(S.innerHtml('stage', ID, hass)), 'the plate does not repeat the status word');
// Layout: open and ticked items → two columns from the top; otherwise one column (552): stage, then „Erledigt“.
UIs.v3 = () => true;
win._casoraSoftKit = { secCard: (w, code) => ({ code }), layout: (o) => o };
// (the list above is loaded: 0 open, 3 done → one column whatever the count says)
assert.deepEqual(JSON.parse(JSON.stringify(S.popup({ entity_id: ID }, { [ID]: { state: '2' } }, hass))).top, ['line', 'stage', 'done']);
push({ items: [{ uid: 'a', summary: 'Milch', status: 'needs_action' }] });
assert.deepEqual(JSON.parse(JSON.stringify(S.popup({ entity_id: ID }, {}, hass))).top, ['line', 'stage', 'done'], 'open but nothing ticked: one column');
push({ items: [{ uid: 'a', summary: 'Milch', status: 'needs_action' }, { uid: 'c', summary: 'Kaffee', status: 'completed' }] });
const layB = JSON.parse(JSON.stringify(S.popup({ entity_id: ID }, {}, hass)));
assert.deepEqual(layB.top, ['line']); assert.deepEqual(layB.right, ['done'], 'open and ticked: two columns');
const ID2 = 'todo.zweite';
const lay0 = JSON.parse(JSON.stringify(S.popup({ entity_id: ID2 }, { [ID2]: { state: '0' } }, { states: {}, connection: null })));
assert.deepEqual(lay0.top, ['line', 'stage', 'done']); assert.deepEqual(lay0.right, []);
const lay2 = JSON.parse(JSON.stringify(S.popup({ entity_id: ID2 }, { [ID2]: { state: '2' } }, { states: {}, connection: null })));
assert.deepEqual(lay2.top, ['line']); assert.equal(lay2.stage, 'stage'); assert.deepEqual(lay2.left, []); assert.deepEqual(lay2.right, ['done']);
console.log('ok shopping_list');
