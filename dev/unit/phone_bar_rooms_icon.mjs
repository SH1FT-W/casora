// Prüfrunde u06-05: in a room whose symbol is the house (the Studio's fallback for an unknown room name, e.g.
// "Werkstatt") the phone bar showed two houses side by side: Home and the active Rooms button. Expected: the Rooms
// button never repeats the house, it shows the floor plan (rooms.svg) then; other room symbols stay.
//   node dev/unit/phone_bar_rooms_icon.mjs
// @deckt: custom_components/casora/scripts/local/04-navigation.js#_roomBtnIcon,_roomIcon
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/04-navigation.js', import.meta.url), 'utf8');
const a = src.indexOf('  var SFI ='), b = src.indexOf('  var css = function');
const body = (name) => {
  const m = new RegExp('\\n    ' + name + '\\(r\\) \\{([\\s\\S]*?)\\}\\n').exec(src);
  assert.ok(m, name + ' found');
  return m[1];
};
const one = /_roomIcon\(r\) \{ (return [^\n]*) \}/.exec(src);
assert.ok(one, '_roomIcon found');
let btn;
try { btn = body('_roomBtnIcon'); } catch (e) { btn = null; }
globalThis.window = {};
const ctx = new Function(src.slice(a, b) + '\nreturn { SFI: SFI, roomIcon: function (r) { ' + one[1] + ' } };')();
const nav = { _roomIcon: ctx.roomIcon };
// Without the fix the Rooms button took _roomIcon(r) as it was (the same expression _render used).
const roomBtn = btn ? new Function('SFI', 'r', btn).bind(nav, ctx.SFI) : (r) => (r ? nav._roomIcon(r) : ctx.SFI + 'rooms.svg?v=3');

const PLAN = '/casora_assets/icons/rooms.svg?v=3';
assert.equal(roomBtn({ key: 'room_werkstatt', icon: '/casora_assets/icons/home.svg' }), PLAN, 'house symbol: floor plan instead');
assert.equal(roomBtn({ key: 'room_x', icon: 'mdi:home-variant' }), PLAN, 'mdi house: floor plan instead');
assert.equal(roomBtn(null), PLAN, 'no room open: floor plan');
assert.equal(roomBtn({ key: 'room_keller', icon: '/casora_assets/icons/stairs.svg' }), '/casora_assets/icons/stairs.svg', 'own symbol stays');
assert.equal(roomBtn({ key: 'room_wohnzimmer' }), '/casora_assets/icons/living-room.svg', 'known key: its symbol');
assert.equal(roomBtn({ key: 'room_x', icon: '/casora_assets/icons/homepod.svg' }), '/casora_assets/icons/homepod.svg', 'homepod is no house');
assert.ok(/var ri = this\._roomBtnIcon\(ar\);/.test(src), '_render uses _roomBtnIcon');
console.log('phone_bar_rooms_icon: ok');
