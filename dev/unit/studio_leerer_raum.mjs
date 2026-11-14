// "Add tile" in a room with nothing new (V18, newcomer round 14.11.2026): a new room without a Home Assistant area
// said "Every device in Hobbyraum already has a tile", though the room has no devices at all. It now says the room
// has no area and points to the search (rooms find their area by name, there is no area setting in the Studio).
//   node dev/unit/studio_leerer_raum.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
globalThis.window = globalThis;
const src = fs.readFileSync(new URL('casora-panel-b-ux.js', dir), 'utf8');
new Function(src)();
const ux = window.__casoraStudioUx;
assert.equal(typeof ux.emptyRoomText, 'function', 'emptyRoomText exported');
assert.match(ux.emptyRoomText(false), /has no area in Home Assistant/, 'no area: says so');
assert.doesNotMatch(ux.emptyRoomText(false), /already has a tile/, 'no area: not "every device has a tile"');
assert.doesNotMatch(ux.emptyRoomText(false), /Room actions|⋯/, 'no area: no menu that does not exist');
assert.match(ux.emptyRoomText(true), /already has a tile/, 'with an area: as before');
// The add sheet uses it with the room's area (the overview counts as having one).
const i = src.indexOf('P._uxAdd = function (o) {');
const body = src.slice(i, src.indexOf('P._uxAddBtn = function', i));
assert.ok(body.includes('emptyRoomText(overview || !!(this._roomArea && this._roomArea(room)))'), 'sheet asks the room for its area');
// Every language has the new text.
const de = JSON.parse(fs.readFileSync(new URL('../translations/panel/de.json', dir), 'utf8')).exact;
assert.ok(de[ux.emptyRoomText(false)], 'German text');
console.log('ok studio_leerer_raum');
