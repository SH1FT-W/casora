// Renaming a room checks like adding one (Prüfrunde u02-03).   node dev/unit/raum_umbenennen_pruefung.mjs
// „Rename…“ let a second „Küche“ through and ignored an empty field without a word; the name field in the room
// settings did not check either. All three use _roomNameTaken (the room itself left out).
// @deckt: casora-panel.js#_roomNameTaken,_addRoom,_roomMenuAction,_renderForm
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('\n  _roomNameTaken(v, self) {');
assert.ok(a > 0, '_roomNameTaken exists');
const body = src.slice(a, src.indexOf('\n  }\n', a) + 4).trim();
const slug = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_');
const isDefaultHomeName = (v) => /^(home|zuhause)$/i.test(String(v || '').trim());
const isHomeRoom = (r, rooms) => rooms[0] === r;
const taken = new Function('slug', 'isDefaultHomeName', 'isHomeRoom', 'return { ' + body.replace(/^_roomNameTaken/, 'f: function') + ' }.f;')(
  slug, isDefaultHomeName, isHomeRoom);
const rooms = [{ path: 'home', name: 'Home' }, { path: 'kuche', name: 'Küche' }, { path: 'bad', name: 'Bad' }];
const P = { _state: { compact: { rooms } } };
const T = (v, self) => taken.call(P, v, self);

assert.equal(T('küche', rooms[2]), true, 'another room has the name');
assert.equal(T('Küche', rooms[1]), false, 'the room may keep its own name');
assert.equal(T('Bad '), true);
assert.equal(T('Flur', rooms[2]), false);
assert.equal(T('Zuhause', rooms[2]), true, 'the default home name');
assert.equal(T('', rooms[2]), false, 'empty is the empty hint, not a duplicate');

// Wiring: rename dialog and the name field use it, with the same hints as adding.
const ren = src.slice(src.indexOf('if (id === "rename") {', src.indexOf('async _roomMenuAction(')), src.indexOf('if (id === "delete") {', src.indexOf('async _roomMenuAction(')));
assert.match(ren, /emptyHint: "Enter a name for the room\."/, 'rename: empty hint');
assert.match(ren, /this\._roomNameTaken\(v, r\) \? "A room with this name already exists\."/, 'rename: duplicate');
assert.match(src, /validate: \(v\) => \(this\._roomNameTaken\(v\) \? "A room with this name already exists\." : ""\)/, 'add room');
assert.match(src, /if \(f\.key === "__name"\) \{\n[^\n]*\n\s+if \(this\._roomNameTaken\(v, room\)\) \{/, 'name field in the room settings');
console.log('raum_umbenennen_pruefung: ok');
