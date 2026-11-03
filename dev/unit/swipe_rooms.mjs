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

// Rubber band at the ends, half the way otherwise
assert.equal(S.follow(-100, false), -50);
assert.ok(Math.abs(S.follow(-400, true)) <= 28 && S.follow(-400, true) < 0, 'end: gives only a little');

// Studio: two dashboard fields under Controls › Phone, off by default; the phone's bar card gets swipe_rooms on save.
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.match(panel, /key: "swipe_rooms", sub: "phone", label: "Swipe between rooms", type: "bool",\s*boolDefault: false, auto: true, scope: "dashboard"/);
assert.match(panel, /key: "swipe_rooms_tablet", sub: "phone", label: "Also on the tablet", type: "bool",\s*boolDefault: false, auto: true, scope: "dashboard", when: \(v\) => v\.swipe_rooms === true/);
assert.match(panel, /home\.variables\.swipe_rooms === true\) c\.swipe_rooms = true;\s*else delete c\.swipe_rooms;/);
// Tablet value read with the other dashboard settings; module loaded by casora-local.js
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.match(core, /pick\(cfg, 'swipe_rooms_tablet'/);
assert.match(core, /window\._casoraSwipeTablet = m\.swipe;/);
const mod = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/40-swipe-rooms.js', import.meta.url), 'utf8');
assert.match(mod, /var keys = \['all'\]\.concat\(rooms\.map/, 'phone: Home first in the swipe order');
assert.match(mod, /pages\[0\]\.idx !== 0/, 'tablet: Home (first view) first in the swipe order');
assert.match(mod, /casora-swipe-card\)\$\/i/, 'carousels keep their own swipe');
assert.match(mod, /pan-x/, 'rows that claim horizontal touches keep them');
const loader = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-local.js', import.meta.url), 'utf8');
assert.match(loader, /'40-swipe-rooms',/);
console.log('ok swipe_rooms');
