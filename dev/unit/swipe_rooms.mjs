// Issue 114: swipe between rooms – the gesture decision of scripts/local/40-swipe-rooms.js (pure parts), the Studio
// fields and the phone mirror on save.
//   node dev/unit/swipe_rooms.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = {};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/40-swipe-rooms.js', import.meta.url), 'utf8');
new Function(src)();   // no document: only the pure helpers are defined
const S = window.casoraSwipeRooms;
assert.ok(S && S.decide && S.lock && S.neighbour, 'helpers exported');

// Axis lock
assert.equal(S.lock(5, 3), null, 'too small to decide');
assert.equal(S.lock(30, 5), 'h');
assert.equal(S.lock(-30, 10), 'h');
assert.equal(S.lock(20, 18), 'v', 'diagonal counts as vertical (scroll wins)');
assert.equal(S.lock(4, 40), 'v');

// Decision: direction, distance, flick, vertical
const w = 393;
assert.equal(S.decide({ dx: -120, dy: 8, dt: 400, w }), 'next', 'slow long drag to the left → next room');
assert.equal(S.decide({ dx: 120, dy: -6, dt: 400, w }), 'prev', 'to the right → previous room');
assert.equal(S.decide({ dx: -60, dy: 4, dt: 400, w }), null, 'slow short drag: nothing');
assert.equal(S.decide({ dx: -60, dy: 4, dt: 100, w }), 'next', 'quick flick of 60 px');
assert.equal(S.decide({ dx: -30, dy: 2, dt: 40, w }), null, 'flick too short');
assert.equal(S.decide({ dx: -150, dy: 120, dt: 300, w }), null, 'mostly vertical: a scroll, never a room change');
assert.equal(S.decide({ dx: -95, dy: 0, dt: 900, w: 1180 }), 'next', 'tablet: the distance is capped at 90 px');

// Neighbours: order of the menu, no wrap-around
const keys = ['room_a', 'room_b', 'room_c'];
assert.equal(S.neighbour(keys, 'room_b', 'next'), 'room_c');
assert.equal(S.neighbour(keys, 'room_b', 'prev'), 'room_a');
assert.equal(S.neighbour(keys, 'room_c', 'next'), null, 'last room: no wrap-around');
assert.equal(S.neighbour(keys, 'room_a', 'prev'), null, 'first room: no wrap-around');
assert.equal(S.neighbour(keys, 'all', 'next'), null, 'Home is not a room');
// Home is the first page (owner, 03.11.2026): Home → first room, first room → Home, nothing before Home.
const withHome = ['all'].concat(keys);
assert.equal(S.neighbour(withHome, 'all', 'next'), 'room_a', 'Home: swipe left opens the first room');
assert.equal(S.neighbour(withHome, 'room_a', 'prev'), 'all', 'first room: swipe right goes back Home');
assert.equal(S.neighbour(withHome, 'all', 'prev'), null, 'Home has no previous page');

// Scroll chaining: a sideways row under the finger keeps the swipe while it can still scroll that way (iPad, 03.11.2026).
assert.equal(S.rowTakes([], 'next'), false, 'no row: the page swipes');
assert.equal(S.rowTakes([{ left: 0, max: 600 }], 'next'), true, 'row at its start, finger to the left: the row scrolls');
assert.equal(S.rowTakes([{ left: 0, max: 600 }], 'prev'), false, 'row at its start, finger to the right: the page swipes');
assert.equal(S.rowTakes([{ left: 600, max: 600 }], 'next'), false, 'row at its end: the page swipes');
assert.equal(S.rowTakes([{ left: 300, max: 600 }], 'prev'), true, 'row in the middle: the row scrolls');

// Rubber band at the ends, half the way otherwise
assert.equal(S.follow(-100, false), -50);
assert.ok(Math.abs(S.follow(-400, true)) <= 28 && S.follow(-400, true) < 0, 'end: gives only a little');

// Studio: ONE dashboard field under Controls › Phone for every touch device (owner, 03.11.2026), off by default; the
// phone's bar card gets swipe_rooms on save; no separate tablet option any more.
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.match(panel, /key: "swipe_rooms", sub: "phone", label: "Swipe between rooms", type: "bool",\s*boolDefault: false, auto: true, scope: "dashboard"/);
assert.doesNotMatch(panel, /key: "swipe_rooms_tablet"/, 'no separate tablet option');
assert.match(panel, /home\.variables\.swipe_rooms === true\) c\.swipe_rooms = true;\s*else delete c\.swipe_rooms;/);
// Tablets and iPads read the same swipe_rooms from the desktop dashboard; a saved swipe_rooms_tablet is ignored.
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.match(core, /pick\(cfg, 'swipe_rooms', /);
assert.match(core, /window\._casoraSwipeRooms = m\.swipe;/);
const mod = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/40-swipe-rooms.js', import.meta.url), 'utf8');
assert.match(mod, /var keys = \['all'\]\.concat\(rooms\.map/, 'phone: Home first in the swipe order');
assert.match(mod, /pages\[0\]\.idx !== 0/, 'tablet: Home (first view) first in the swipe order');
assert.match(mod, /casora-swipe-card\)\$\/i/, 'carousels keep their own swipe');
assert.match(mod, /window\._casoraSwipeRooms !== true/, 'tablet follows swipe_rooms');
// Touch only, by capability: no user agent and no pointer media query (iPadOS Safari reports a Mac and may say fine pointer).
const code = mod.replace(/\/\/[^\n]*/g, '');
assert.doesNotMatch(code, /userAgent|pointer: ?coarse|swipe_rooms_tablet|_casoraSwipeTablet/);
assert.match(code, /addEventListener\('touchstart'/);
assert.doesNotMatch(code, /addEventListener\('(pointerdown|mousedown)'/, 'a mouse never swipes');
// Smooth change: neighbours' photos decoded ahead, the switch waits for the target photo, backgrounds crossfade under
// html.casora-room-swap (not with reduced motion), transforms only.
assert.match(code, /img\.decode/, 'photos are decoded ahead');
assert.match(code, /preloadAround\(tgt\)/, 'neighbours preloaded when a touch starts');
assert.match(code, /classList\.add\('casora-room-swap'\)/);
assert.match(code, /if \(!reduced\(\)\) \{\s*document\.documentElement\.classList\.add\('casora-room-swap'\)/, 'reduced motion: no crossfade');
assert.match(code, /translate3d\(/);
assert.doesNotMatch(code, /'translateX\(/, 'GPU transforms only');
const fo = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
assert.match(fo, /window\._casoraRoomPhotoOf = \(cfg, hass\) =>/, 'filter-overlay hands out the room photo for preloading');
const loader = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-local.js', import.meta.url), 'utf8');
assert.match(loader, /'40-swipe-rooms',/);
console.log('ok swipe_rooms');
