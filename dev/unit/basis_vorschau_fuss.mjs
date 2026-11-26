// Setup preview foot (Prüfrunde u01-02, u01-14): "… devices have no room in Home Assistant" counts only devices
// without an HA area; devices in areas the user did not pick get their own sentence. With no room picked the
// create button has no "(≈ n per room)" and the preview says only Home is created. Made-up devices.
//   node dev/unit/basis_vorschau_fuss.mjs
// @deckt: custom_components/casora/panel/casora-panel-basis.js#planFoot,createLabel
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.addEventListener = () => {};
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
assert.equal(typeof B.planFoot, 'function', 'planFoot exported');

const loose = [
  { id: 'a', area: null }, { id: 'b', area: null },
  { id: 'c', area: 'Küche' }, { id: 'd', area: 'Bad' }, { id: 'e', area: 'Bad' },
];
const twoRooms = { rooms: [{ name: 'Home' }, { name: 'Wohnzimmer' }, { name: 'Flur' }], loose };
assert.deepEqual(B.planFoot(twoRooms), { noArea: 2, notPicked: 3, rooms: 2 });
// The count of devices without an HA area does not change with the choice of rooms.
assert.equal(B.planFoot({ rooms: [{ name: 'Home' }], loose }).noArea, 2);
assert.equal(B.planFoot({ rooms: [{ name: 'Home' }], loose }).rooms, 0);

assert.equal(B.createLabel(10, 2), 'Create with 10 tiles (≈ 5 per room)');
assert.equal(B.createLabel(1, 2), 'Create with 1 tile');
assert.equal(B.createLabel(2, 0), 'Create with 2 tiles', 'no rooms: no per-room average');

// The preview uses both helpers instead of its own count.
const src = read('custom_components/casora/panel/casora-panel-basis.js');
assert.ok(src.includes('const foot = planFoot(p);') && src.includes('createLabel(count(), foot.rooms)'), 'preview uses the helpers');
assert.ok(!src.includes('p.loose.length === 1 ? "1 device has no room'), 'old count over all loose devices is gone');
console.log('ok basis_vorschau_fuss');
