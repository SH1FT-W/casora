// Tasks tile (43-aufgaben.js): which lists it shows, the tile's word, due words and order, what "add" sends.
//   node dev/unit/aufgaben.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ctx = { console, setTimeout: () => 0, localStorage: { getItem: () => null, setItem() {} }, document: { querySelector: () => null } };
ctx.window = ctx; ctx.window.addEventListener = () => {};
ctx.window._casoraShopping = { onChange() {}, items() { return null; } };
vm.createContext(ctx);
vm.runInContext(read('custom_components/casora/scripts/local/43-aufgaben.js'), ctx);
const T = ctx._casoraTasks;
const S = { 'todo.b': { state: '2', attributes: { friendly_name: 'Bravo' } }, 'todo.a': { state: '1', attributes: { friendly_name: 'Alpha' } }, 'todo.off': { state: 'unavailable', attributes: {} }, 'light.x': { state: 'on', attributes: {} } };
const ids = (v) => Array.from(T.ids(S, v));
assert.deepEqual(ids({}), ['todo.a', 'todo.b', 'todo.off'].sort((a, b) => T.nameOf(S, a).localeCompare(T.nameOf(S, b))), 'no list set: every to-do list, by name');
assert.deepEqual(ids({ lists: ['todo.b', 'todo.gone', 'todo.b'] }), ['todo.b'], 'own lists: as given, without doubles or gone ones');
assert.equal(T.tile(S, {}), '3 offen', 'an unavailable list counts as nothing');
assert.equal(T.tile({ 'todo.a': { state: '0', attributes: {} } }, {}), 'Alles erledigt');
assert.equal(T.tile({}, {}), 'Keine Listen');
assert.equal(T.active(S, {}), true);
assert.equal(T.active({ 'todo.a': { state: '0', attributes: {} } }, {}), false);

const now = new Date(2026, 10, 16, 12, 0);
assert.equal(T.dueWord(null, now), null);
assert.equal(T.dueWord('not a date', now), null);
assert.deepEqual({ ...T.dueWord('2026-11-16', now) }, { text: 'Heute', over: false }, 'a date alone is the whole day');
assert.deepEqual({ ...T.dueWord('2026-11-17', now) }, { text: 'Morgen', over: false });
assert.deepEqual({ ...T.dueWord('2026-11-20', now) }, { text: '20.11.', over: false });
assert.deepEqual({ ...T.dueWord('2026-11-14', now) }, { text: 'Überfällig · 14.11.', over: true });
assert.deepEqual({ ...T.dueWord(new Date(2026, 10, 16, 9, 30).toISOString(), now) }, { text: 'Heute 09:30', over: true }, 'earlier today: late, with its time');
const order = Array.from(T.sortOpen([{ summary: 'none' }, { summary: 'late', due: '2026-11-20' }, { summary: 'soon', due: '2026-11-17' }, { summary: 'none2' }])).map((x) => x.summary);
assert.deepEqual(order, ['soon', 'late', 'none', 'none2'], 'due first, the rest in the list order');

assert.equal(T.itemData({ title: '  ' }).error, 'Bitte gib eine Aufgabe ein.');
assert.deepEqual({ ...T.itemData({ title: ' Milk ', note: 'x', due: '2026-11-20' }).data }, { item: 'Milk' }, 'a list without those features gets only the name');
assert.deepEqual({ ...T.itemData({ title: 'Milk', note: ' 1 l ', due: '2026-11-20', canNote: true, canDue: true }).data }, { item: 'Milk', description: '1 l', due_date: '2026-11-20' });

const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
assert.deepEqual(tpl.casora_tasks.template, ['casora_entity', 'casora_popup_tasks']);
assert.equal(tpl.casora_popup_tasks.tap_action.casora_popup.variant, 'v3');
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'43-aufgaben'"), 'module in MODULES');
assert.ok(fs.existsSync(new URL('../../custom_components/casora/assets/icons/tasks.svg', import.meta.url)), 'icon');
console.log('ok aufgaben');
