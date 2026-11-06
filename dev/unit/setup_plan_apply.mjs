// Studio side of casora.setup_plan (issue #131, step 2): a pending plan becomes rows of the device assistant
// (window.casoraAssist.planItems) and is added through its "Add" like by hand, but never saved on its own.
// Made-up devices only.
//   node dev/unit/setup_plan_apply.mjs
// @deckt: custom_components/casora/panel/casora-panel-assist.js#planItems,casoraSetupPlan,_casoraAssist
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const code = src('panel/casora-panel-assist.js');
new Function(code)();
const A = window.casoraAssist;
const SP = window.casoraSetupPlan;
assert.ok(A.planItems && SP && SP.title && SP.clear, 'exports');

const hass = { areas: { kueche: { area_id: 'kueche', name: 'Küche' }, bad: { area_id: 'bad', name: 'Bad' }, flur: { area_id: 'flur', name: 'Flur' } } };
const rooms = [{ name: 'Home', path: 'home' }, { name: 'Kueche' }, { name: 'Bad' }];
const types = [{ id: 'light' }, { id: 'thermostat' }, { id: 'casora_switch' }];
// What the device assistant suggests on its own: the lamp (as a light) and the thermostat.
const all = [
  { id: 'lamp', device: 'lamp', name: 'Deckenlampe', room: 'Kueche', area: 'Küche', type: 'light', entity: 'light.qa_decke' },
  { id: 'hk', device: 'hk', name: 'Heizkörper', room: null, area: null, type: 'thermostat', entity: 'climate.qa_hk' },
];
const plan = { plan_id: 'p1', dashboard: 'casora-home', rooms: [
  { area_id: 'bad', area: 'Bad', tiles: [
    { device_id: 'hk', device: 'Heizkörper', main_entity: 'climate.qa_hk', tile: 'thermostat', name: 'Heizung Bad' },
    { device_id: 'plug', device: 'Steckdose', main_entity: 'switch.qa_plug', tile: 'casora_switch', name: 'Steckdose' },
  ] },
  { area_id: 'kueche', area: 'Küche', tiles: [
    { device_id: 'lamp', device: 'Deckenlampe', main_entity: 'light.qa_decke', tile: 'light', name: 'Licht' },
    { device_id: 'lamp', device: 'Deckenlampe', main_entity: 'light.qa_decke', tile: 'light', name: 'Doppelt' },
  ] },
  // The area has no room on this dashboard: the row comes without a room (not ticked, "Don't add").
  { area_id: 'flur', area: 'Flur', tiles: [{ device_id: 'spot', device: 'Spot', main_entity: 'light.qa_spot', tile: 'light', name: 'Spot' }] },
  // A type this Studio does not offer keeps the row's own type.
  { area_id: 'kueche', area: 'Küche', tiles: [{ device_id: 'x', device: 'X', main_entity: 'fan.qa_x', tile: 'fan', name: 'X' }] },
] };
const r = A.planItems(hass, plan, all, rooms, types);
assert.deepEqual(r.focus, ['hk', 'plan:plug:switch.qa_plug', 'lamp', 'plan:spot:light.qa_spot', 'plan:x:fan.qa_x'], 'plan order, each device once');
assert.deepEqual(r.set.get('hk'), { room: 'Bad', type: 'thermostat', name: 'Heizung Bad' }, 'existing row: room, type, name from the plan');
assert.deepEqual(r.set.get('lamp'), { room: 'Kueche', type: 'light', name: 'Licht' }, 'room by area name (umlauts), first entry wins');
assert.deepEqual(r.extra.map((x) => x.id), ['plan:plug:switch.qa_plug', 'plan:spot:light.qa_spot', 'plan:x:fan.qa_x'], 'rows the assistant does not list');
const plug = r.extra[0];
assert.equal(plug.device, 'plug');
assert.equal(plug.entity, 'switch.qa_plug');
assert.equal(plug.type, 'casora_switch');
assert.equal(plug.room, 'Bad');
assert.equal(r.set.get('plan:spot:light.qa_spot').room, null, 'no room for the area: nothing to tick');
assert.equal(r.set.get('plan:x:fan.qa_x').type, 'fan', 'unknown type stays as the row has it (the Add skips it)');
// The current HA area name wins over the one stored in the plan (renamed area).
const renamed = A.planItems({ areas: { bad: { name: 'Kueche' } } }, { rooms: [{ area_id: 'bad', area: 'Bad', tiles: [plan.rooms[0].tiles[0]] }] }, all, rooms, types);
assert.equal(renamed.set.get('hk').room, 'Kueche');
assert.deepEqual(A.planItems(hass, null, all, rooms, types).focus, [], 'no plan');

// Banner text (English; the patterns in translations/panel/*.json translate it).
assert.equal(SP.title(plan), 'Suggestion from your assistant: 6 devices in 3 rooms');
assert.equal(SP.title({ rooms: [{ area_id: 'a', tiles: [{}] }] }), 'Suggestion from your assistant: 1 device in 1 room');
assert.equal(SP.title({ rooms: [{ area_id: 'a', tiles: [{}, {}] }, { area_id: 'b', tiles: [] }] }), 'Suggestion from your assistant: 2 devices in 1 room');
const de = JSON.parse(src('translations/panel/de.json'));
const deT = (s) => {
  if (de.exact[s]) return de.exact[s];
  for (const [re, rep] of de.patterns) {
    const m = s.match(new RegExp(re));
    if (m) return rep.replace(/\{(\d)\}/g, (_, i) => m[+i]);
  }
  return s;
};
assert.equal(deT('Suggestion from your assistant: 3 devices in 2 rooms'), 'Vorschlag von deinem Assistenten: 3 Geräte in 2 Räumen');
assert.equal(deT('Suggestion from your assistant: 1 device in 1 room'), 'Vorschlag von deinem Assistenten: 1 Gerät in 1 Raum');
assert.equal(deT('Suggestion from your assistant: 2 devices in 1 room'), 'Vorschlag von deinem Assistenten: 2 Geräte in 1 Raum');
assert.equal(deT('Review'), 'Ansehen');
assert.equal(deT('Discard'), 'Verwerfen');

// Clear: the banner goes and the websocket command names this plan.
const calls = [];
let removed = 0;
const panel = { shadowRoot: { querySelector: (q) => (q === '.cp-plan' ? { remove: () => { removed++; } } : null) },
  _hass: { callWS: async (m) => { calls.push(m); return {}; } } };
await SP.clear(panel, 'p1');
assert.deepEqual(calls, [{ type: 'casora/setup_plan/clear', plan_id: 'p1' }]);
assert.equal(removed, 1);
// Not an admin: no request at all.
const asked = [];
assert.equal(await SP.get({ _hass: { user: { is_admin: false }, callWS: async (m) => { asked.push(m); return {}; } } }), null);
assert.deepEqual(asked, []);

// The "Add" with a plan: same tile builder as by hand, then an unsaved change – it returns before the auto-save.
const add = code.slice(code.indexOf('const go = this._flowButton(s.acts, "Add"'), code.indexOf('const run = async () =>'));
const planAt = add.indexOf('if (plan) {'), saveAt = add.indexOf('this._save()');
assert.ok(add.includes('room.tiles.push(tile)') && add.includes('name: noEval(it.name)'), 'one tile builder, name guarded');
assert.ok(planAt > 0 && saveAt > planAt && /if \(plan\) \{[^}]*clear\(this, o\.plan\.plan_id\)[^}]*return;/.test(add), 'plan path ends before _save');
assert.ok(add.indexOf('this._markDirty()') < planAt, 'marked as changed before');
// The request field never widens a plan: focus falls back to the plan, matches stay within it.
const run = code.slice(code.indexOf('const run = async () =>'), code.indexOf('askIn.addEventListener'));
assert.ok(run.includes('const planFocus = plan ? plan.focus : null;'), 'plan focus fallback');
assert.ok(!/focus = null/.test(run), 'no reset to all devices in run()');
assert.ok(run.includes('m.ids.filter((id) => plan.focus.includes(id))'), 'matches limited to the plan');
// Python and the Studio use the same websocket commands.
const py = fs.readFileSync(new URL('../../custom_components/casora/setup_plan.py', import.meta.url), 'utf8');
for (const t of ['casora/setup_plan/get', 'casora/setup_plan/clear']) {
  assert.ok(py.includes(`"${t}"`) && code.includes(`"${t}"`), t);
}
console.log('setup_plan_apply: ok');
