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

// Neighbours: order of the menu, wrap-around (owner, 04.11.2026, issue 121: a carousel)
const keys = ['room_a', 'room_b', 'room_c'];
assert.equal(S.neighbour(keys, 'room_b', 'next'), 'room_c');
assert.equal(S.neighbour(keys, 'room_b', 'prev'), 'room_a');
assert.equal(S.neighbour(keys, 'room_c', 'next'), 'room_a', 'last page: swipe left wraps to the first');
assert.equal(S.neighbour(keys, 'room_a', 'prev'), 'room_c', 'first page: swipe right wraps to the last');
assert.equal(S.neighbour(keys, 'all', 'next'), null, 'not a page of the list');
assert.equal(S.neighbour(['room_a'], 'room_a', 'next'), null, 'one page: nothing to swipe to');
assert.equal(S.neighbour(['room_a'], 'room_a', 'prev'), null);
assert.equal(S.neighbour(keys, 'room_b', 'up'), null);
// Home is the first page (owner, 03.11.2026): Home → first room, first room → Home; issue 121: Home ↔ last room.
const withHome = ['all'].concat(keys);
assert.equal(S.neighbour(withHome, 'all', 'next'), 'room_a', 'Home: swipe left opens the first room');
assert.equal(S.neighbour(withHome, 'room_a', 'prev'), 'all', 'first room: swipe right goes back Home');
assert.equal(S.neighbour(withHome, 'all', 'prev'), 'room_c', 'Home: swipe right opens the last room');
assert.equal(S.neighbour(withHome, 'room_c', 'next'), 'all', 'last room: swipe left goes Home');
assert.equal(S.neighbour(['all', 'room_a'], 'all', 'prev'), 'room_a', 'two pages: both ways lead to the other');

// Scroll chaining: a sideways row under the finger keeps the swipe while it can still scroll that way (iPad, 03.11.2026).
assert.equal(S.rowTakes([], 'next'), false, 'no row: the page swipes');
assert.equal(S.rowTakes([{ left: 0, max: 600 }], 'next'), true, 'row at its start, finger to the left: the row scrolls');
assert.equal(S.rowTakes([{ left: 0, max: 600 }], 'prev'), false, 'row at its start, finger to the right: the page swipes');
assert.equal(S.rowTakes([{ left: 600, max: 600 }], 'next'), false, 'row at its end: the page swipes');
assert.equal(S.rowTakes([{ left: 300, max: 600 }], 'prev'), true, 'row in the middle: the row scrolls');

// The page follows half the way; the rubber band is left for a page without a neighbour (none with wrap-around and
// two or more pages).
assert.equal(S.follow(-100, false), -50);
assert.ok(Math.abs(S.follow(-400, true)) <= 28 && S.follow(-400, true) < 0, 'no neighbour: gives only a little');

// The head of a page never swipes (owner, 04.11.2026, issue 121): the phone's header, badge and sub-badge cards and the
// casora_room hero's head fields; the same ids in any other card are no head.
const card = (tpl) => ({ nodeType: 1, _config: { template: tpl } });
const inShadow = (id, host) => ({ nodeType: 1, id, getRootNode: () => ({ host }) });
assert.equal(S.inHead([{ nodeType: 1 }, card(['casora_mobile_filter_badges'])]), true, 'phone badge row');
assert.equal(S.inHead([card('casora_mobile_sensor_chips')]), true, 'phone sub-badge row');
assert.equal(S.inHead([card('casora_mobile_weather')]), true, 'phone Home header');
assert.equal(S.inHead([card(['casora_badge_light']), inShadow('badges', card(['casora_room']))]), true, 'hero badge row');
assert.equal(S.inHead([inShadow('badges_climate', card('casora_room'))]), true, 'hero sub-badge row');
assert.equal(S.inHead([inShadow('name', card(['casora_room']))]), true, 'hero room title');
assert.equal(S.inHead([inShadow('name', card(['casora_light']))]), false, 'a tile name is no head');
assert.equal(S.inHead([card(['casora_light']), { nodeType: 1, localName: 'casora-smart-row' }]), false, 'a tile row is no head');
assert.equal(S.inHead([]), false);

// Studio: ONE dashboard field under Controls › Screen for every touch device (owner, 03.11.2026), off by default; the
// phone's bar card gets swipe_rooms on save; no separate tablet option any more.
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.match(panel, /key: "swipe_rooms", sub: "chrome", label: "Swipe between rooms", type: "bool",\s*boolDefault: false, auto: true, scope: "dashboard"/);
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
// ── Gestures with a stand-in document (issue 121) ───────────────────────────
// The module once more with listeners: a phone with Home and two rooms, no overlay element (no slide), reduced motion.
// button-card stops a touchstart at a custom field's host and sends an untrusted copy from its parent, without the
// touched element in the path (docs/ha-annahmen.md): the copy must not start a gesture of its own.
{
  const L = {};
  const saved = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout,
    getComputedStyle: globalThis.getComputedStyle, Image: globalThis.Image };
  const body = { nodeType: 1 };
  globalThis.document = { addEventListener: (t, f) => (L[t] = L[t] || []).push(f), getElementById: () => ({}),
    head: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } }, querySelector: () => null, body };
  globalThis.getComputedStyle = (el) => ({ overflowX: el._ox || 'visible', opacity: '1' });
  globalThis.Image = class { decode() { return Promise.resolve(); } };
  globalThis.setTimeout = () => 0;
  let cur = 'all';
  const sets = [];
  globalThis.window = { addEventListener() {}, innerWidth: 393, dispatchEvent() {}, matchMedia: () => ({ matches: true }),
    _hmnOwner: { isConnected: true, _cfg: { swipe_rooms: true }, _cur: () => cur,
      _rooms: [{ key: 'room_a' }, { key: 'room_b' }], _set: (k) => { sets.push(k); cur = k; } },
    _casoraSmartRows: [] };
  new Function(src)();
  const G = window.casoraSwipeRooms;
  const fire = (type, e) => (L[type] || []).forEach((f) => f(e));
  const ev = (trusted, xy, path, ts) => ({ isTrusted: trusted, timeStamp: ts, composedPath: () => path,
    touches: xy ? [].concat(xy[0] instanceof Array ? xy : [xy]).map(([x, y]) => ({ clientX: x, clientY: y })) : [] });
  const outer = { nodeType: 1 };
  const row = (left) => ({ nodeType: 1, id: 'badges', scrollWidth: 900, clientWidth: 360, scrollLeft: left, _ox: 'auto' });
  const badges = (left) => [{ nodeType: 1 }, row(left), { nodeType: 1, _config: { template: ['casora_mobile_filter_badges'] } }, outer, body];
  const tiles = (left) => [{ nodeType: 1 }, { nodeType: 1, localName: 'casora-smart-row', scrollWidth: 900, clientWidth: 360, scrollLeft: left, _ox: 'auto' }, outer, body];
  const free = [{ nodeType: 1 }, outer, body];
  // A drag from x0 to x1 (moves are never copied); end: false leaves the touchend out (lost).
  const drag = (x0, x1, y, ts, end = true) => {
    for (let i = 1; i <= 10; i++) fire('touchmove', { touches: [{ clientX: x0 + (x1 - x0) * i / 10, clientY: y + 1 }] });
    if (end) { fire('touchend', ev(true, null, free, ts + 160)); fire('touchend', ev(false, null, [outer, body], ts + 165)); }
  };
  // The switch waits for the target's photo (a promise): the result after a tick.
  const run = async (at, f) => { cur = at; sets.length = 0; G.last = ''; f(); const last = G.last;
    await new Promise((res) => saved.setTimeout(res, 5)); return { last, to: sets[0] || null }; };

  let r = await run('all', () => {
    fire('touchstart', ev(true, [330, 120], badges(0), 1000));
    fire('touchstart', ev(false, [330, 120], [outer, body], 1014));     // button-card's copy, no badge row in its path
    drag(330, 100, 120, 1000);
  });
  assert.deepEqual(r, { last: 'head', to: null }, 'badge row at its start + copy: the head keeps the swipe');
  r = await run('all', () => {
    fire('touchstart', ev(true, [330, 120], badges(540), 2000));
    fire('touchstart', ev(false, [330, 120], [outer, body], 2014));
    drag(330, 100, 120, 2000);
  });
  assert.deepEqual(r, { last: 'head', to: null }, 'badge row at its end + copy: no chaining to the page');
  r = await run('all', () => { fire('touchstart', ev(true, [330, 120], badges(0), 3000)); drag(330, 100, 120, 3000); });
  assert.deepEqual(r, { last: 'head', to: null }, 'badge row without a copy: head');
  r = await run('room_a', () => {
    fire('touchstart', ev(true, [330, 400], free, 4000));
    fire('touchstart', ev(false, [330, 400], [outer, body], 4014));
    drag(330, 100, 400, 4000);
  });
  assert.deepEqual(r, { last: 'switch', to: 'room_b' }, 'free space + copy: the page swipes once, to the next room');
  r = await run('room_b', () => { fire('touchstart', ev(true, [330, 400], free, 5000)); drag(330, 100, 400, 5000); });
  assert.deepEqual(r, { last: 'switch', to: 'all' }, 'last room, swipe left: Home (wrap-around)');
  r = await run('all', () => { fire('touchstart', ev(true, [60, 400], free, 6000)); drag(60, 330, 400, 6000); });
  assert.deepEqual(r, { last: 'switch', to: 'room_b' }, 'Home, swipe right: the last room (wrap-around)');
  // Tile rows keep scroll chaining: at the start the row scrolls, at its end the page goes on.
  r = await run('room_a', () => { fire('touchstart', ev(true, [330, 400], tiles(0), 7000)); drag(330, 100, 400, 7000); });
  assert.deepEqual(r, { last: 'row', to: null }, 'tile row that can still scroll keeps the swipe');
  r = await run('room_a', () => { fire('touchstart', ev(true, [330, 400], tiles(540), 8000)); drag(330, 100, 400, 8000); });
  assert.deepEqual(r, { last: 'switch', to: 'room_b' }, 'tile row at its end: the page swipes on');
  // touchend / touchcancel end the touch: an untrusted touchstart at the same point right after is a touch of its own.
  r = await run('room_a', () => {
    fire('touchstart', ev(true, [330, 400], free, 9000));
    fire('touchend', ev(true, null, free, 9050));
    fire('touchstart', ev(false, [330, 400], free, 9100));
    drag(330, 100, 400, 9100);
  });
  assert.deepEqual(r, { last: 'switch', to: 'room_b' }, 'after touchend an untrusted touch is no copy');
  r = await run('room_a', () => {
    fire('touchstart', ev(true, [330, 400], free, 10000));
    fire('touchcancel', ev(true, null, free, 10050));
    fire('touchstart', ev(false, [330, 400], free, 10100));
    drag(330, 100, 400, 10100);
  });
  assert.deepEqual(r, { last: 'switch', to: 'room_b' }, 'after touchcancel an untrusted touch is no copy');
  // A touchend that never arrives (removed node, iOS without touchcancel): the stale gesture is dropped – the next
  // touch is judged on its own (here: from x 100 to the right = previous page), never finished from the old start.
  r = await run('room_b', () => {
    fire('touchstart', ev(true, [330, 400], free, 11000));
    drag(330, 300, 400, 11000, false);
    fire('touchstart', ev(false, [100, 400], free, 12000));
    drag(100, 300, 400, 12000);
  });
  assert.deepEqual(r, { last: 'switch', to: 'room_a' }, 'lost touchend: the next touch is a gesture of its own');
  r = await run('room_b', () => {
    fire('touchstart', ev(true, [330, 400], free, 13000));
    fire('touchstart', ev(false, [330, 400], free, 13000 + 2000));     // same point, but long after: no copy
    drag(330, 100, 400, 15000);
  });
  assert.deepEqual(r, { last: 'switch', to: 'all' }, 'an untrusted touch long after is no copy');
  // Two fingers: no swipe; lifting one does not end the touch.
  r = await run('room_a', () => {
    fire('touchstart', ev(true, [[330, 400], [200, 500]], free, 16000));
    drag(330, 100, 400, 16000);
  });
  assert.deepEqual(r, { last: '', to: null }, 'two fingers never swipe');
  Object.assign(globalThis, saved);
}
console.log('ok swipe_rooms');
