// ── Swipe between rooms (issue 114, 03.11.2026) ────────────────────────────────
// A horizontal swipe on an open room goes to the next / previous room, in the order of the room menu – in addition
// to the room menu, never instead of it. Home is the first page (owner, 03.11.2026): on Home a swipe to the left opens
// the first room, on the first room a swipe to the right goes back Home; Home has no previous page. Studio › Controls › Phone: "Swipe between rooms" (swipe_rooms; the phone's
// bottom bar card gets it on save, markPhoneManaged) and "Also on the tablet" (swipe_rooms_tablet; the desktop
// dashboard's room views, read like hold_mode in casora-core.js → window._casoraSwipeTablet). Both off by default.
// Not a swipe: a mostly vertical move, a start in a row that scrolls sideways (badges, chips, media), on a slider,
// chart, input or menu, a start at the screen's left edge (iOS back), anything while a Casora popup or a menu is open.
// No wrap-around: at the first / last room the page gives a little and springs back. prefers-reduced-motion: the room
// changes without the slide.
// window.casoraSwipeRooms.decide / lock / neighbour are pure (dev/unit/swipe_rooms.mjs).
(function () {
  if (window.casoraSwipeRooms) return;

  var LOCK_PX = 12;           // movement before the axis is decided
  var AXIS_RATIO = 1.6;       // horizontal must beat vertical by this much
  var EDGE_PX = 24;           // starts this close to the left edge belong to the system's back gesture
  var MIN_FLICK_PX = 45;      // a quick flick needs at least this far …
  var FLICK_SPEED = 0.45;     // … at this speed (px/ms)
  var DIST_SHARE = 0.22;      // or a slow drag this share of the width …
  var DIST_CAP = 90;          // … capped at this many px

  // 'h' (horizontal), 'v' (vertical) or null (not decided yet).
  function lock(dx, dy) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < LOCK_PX && ay < LOCK_PX) return null;
    return ax >= ay * AXIS_RATIO ? 'h' : 'v';
  }
  // 'next' (finger to the left), 'prev' (finger to the right) or null.
  function decide(g) {
    var dx = Number(g && g.dx) || 0, dy = Number(g && g.dy) || 0;
    var dt = Math.max(1, Number(g && g.dt) || 1), w = Math.max(1, Number(g && g.w) || 390);
    if (lock(dx, dy) !== 'h') return null;
    var ax = Math.abs(dx);
    var far = ax >= Math.min(DIST_CAP, w * DIST_SHARE);
    var flick = ax >= MIN_FLICK_PX && ax / dt >= FLICK_SPEED;
    if (!far && !flick) return null;
    return dx < 0 ? 'next' : 'prev';
  }
  // The key next to cur in keys for dir ('next' | 'prev'), null at either end or when cur is not a room.
  function neighbour(keys, cur, dir) {
    var i = (keys || []).indexOf(cur);
    if (i < 0) return null;
    var j = dir === 'next' ? i + 1 : dir === 'prev' ? i - 1 : -1;
    return j >= 0 && j < keys.length ? keys[j] : null;
  }
  // How far the page follows the finger: half the way, at an end only a little (rubber band).
  function follow(dx, atEnd) {
    if (!atEnd) return dx * 0.5;
    var s = dx < 0 ? -1 : 1;
    return s * Math.min(28, Math.abs(dx) * 0.15);
  }

  window.casoraSwipeRooms = { decide: decide, lock: lock, neighbour: neighbour, follow: follow, EDGE_PX: EDGE_PX };
  if (typeof document === 'undefined' || !document.addEventListener) return;

  var reduced = function () {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };
  var popupOpen = function () { return !!(window.casoraPopup && window.casoraPopup.surface); };

  // A start inside something that takes horizontal touches itself.
  var H_IDS = { media_row: 1, climate_row: 1, rooms_row: 1 };
  var NO_SWIPE = /^(input|textarea|select|ha-slider|ha-control-slider|ha-textfield|casora-chart|canvas|ha-chart-base|casora-swipe-card)$/i;
  function blocked(path) {
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || el.nodeType !== 1) continue;
      if (H_IDS[el.id]) return true;
      var tag = el.localName || '';
      if (NO_SWIPE.test(tag)) return true;
      if (el.getAttribute && (el.getAttribute('role') === 'slider' || el.hasAttribute('data-no-swipe'))) return true;
      var cl = el.classList;
      if (cl && (cl.contains('hmn-bar') || cl.contains('hmn-menu') || cl.contains('hmn-sheet'))) return true;
      var cs = null;
      try { cs = getComputedStyle(el); } catch (e) { cs = null; }
      // A row that claims horizontal touches (smart-row's tile row: touch-action pan-x) or scrolls sideways.
      if (cs && /pan-x/.test(cs.touchAction || '') && !/pan-y/.test(cs.touchAction || '')) return true;
      if (cs && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) return true;
      if (el === document.body) break;
    }
    return false;
  }

  // ── Phone: the open room overlay of the bottom bar's room list ──────────────
  function phoneTarget() {
    var o = window._hmnOwner;
    if (!o || !o.isConnected || !o._cfg || o._cfg.swipe_rooms !== true || o._menu || o._extKind) return null;
    var cur = typeof o._cur === 'function' ? o._cur() : null;
    // Home ('all') first, then the rooms of the menu; categories and the scenes page are no stop.
    if (!cur || (cur !== 'all' && (!/^room_/.test(cur) || cur === 'room_scenes'))) return null;
    var rooms = (o._rooms || []).filter(window.casoraSeesRoute || function () { return true; });
    var keys = ['all'].concat(rooms.map(function (r) { return r.key; }));
    if (keys.indexOf(cur) < 0 || keys.length < 2) return null;
    var el = null;
    Array.prototype.forEach.call(window._casoraSmartRows || [], function (r) {
      if (el || !r.shadowRoot) return;
      Array.prototype.forEach.call(r.shadowRoot.querySelectorAll('casora-filter-overlay'), function (fo) {
        if (!el && fo._showing && fo._config && fo._config.filter_category === cur && fo._overlayEl) el = fo._overlayEl;
      });
    });
    return {
      el: el, keys: keys, cur: cur,
      go: function (key) { if (typeof o._haptic === 'function') o._haptic(); o._set(key); },
    };
  }

  // ── Tablet: the desktop dashboard's room views ──────────────────────────────
  var deep = function (root, sel, d) {
    if (!root || d > 10 || !root.querySelector) return null;
    var hit = root.querySelector(sel);
    if (hit) return hit;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) { var f = deep(all[i].shadowRoot, sel, d + 1); if (f) return f; }
    return null;
  };
  function tabletTarget() {
    if (window._hmnOwner && window._hmnOwner.isConnected) return null;          // the phone dashboard
    // Read the dashboard setting now (a touch does not always come with a pointerdown that refreshes it).
    try { if (window._casoraHoldModeRefresh) window._casoraHoldModeRefresh(); } catch (e) { /* the last value stands */ }
    if (window._casoraSwipeTablet !== true) return null;
    try { if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return null; } catch (e) { return null; }
    var root = deep(document, 'hui-root', 0);
    var cfg = root && root.lovelace && root.lovelace.config;
    if (!cfg || !Array.isArray(cfg.views)) return null;
    var parts = location.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    // Home is the dashboard's first view (/dash, /dash/0 or its path); the room views follow in their order.
    var dash = parts[0], at = parts.length > 1 ? decodeURIComponent(parts[1]) : '0';
    var pages = [];
    cfg.views.forEach(function (v, i) {
      var hero = ((v || {}).cards || [])[0] || {};
      var V = hero.variables || {};
      if ([].concat(hero.template || []).indexOf('casora_room') < 0) return;
      // Category pages (casora_category: lights, climate …) are no rooms.
      if (V.casora_hidden === true || v.visible === false || v.casora_category || V.casora_category) return;
      if (i > 0 && (!v.path || (window.casoraSeesRoute && !window.casoraSeesRoute({ users: V.casora_users })))) return;
      pages.push({ key: v.path ? String(v.path) : String(i), idx: i });
    });
    if (!pages.length || pages[0].idx !== 0) return null;      // no Casora Home first: not this feature's dashboard
    var hit = pages.filter(function (p) { return p.key === at || String(p.idx) === at; })[0];
    if (!hit || pages.length < 2) return null;
    var keys = pages.map(function (p) { return p.key; }), cur = hit.key;
    var view = root.shadowRoot && root.shadowRoot.querySelector('#view');
    return {
      el: view, keys: keys, cur: cur,
      go: function (key) {
        try { window.dispatchEvent(new CustomEvent('haptic', { detail: 'light' })); } catch (e) { /* no haptics */ }
        history.pushState(null, '', '/' + dash + '/' + key);
        window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      },
    };
  }

  var g = null;
  var reset = function (el, animate) {
    if (!el) return;
    el.style.transition = animate ? 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease' : '';
    el.style.transform = '';
    el.style.opacity = '';
    if (animate) setTimeout(function () { if (!g || g.el !== el) el.style.transition = ''; }, 320);
  };

  document.addEventListener('touchstart', function (e) {
    g = null;
    if (!e.touches || e.touches.length !== 1 || popupOpen()) return;
    var t = e.touches[0];
    if (t.clientX < EDGE_PX) return;
    var tgt = phoneTarget() || tabletTarget();
    if (!tgt) return;
    if (blocked(e.composedPath ? e.composedPath() : [e.target])) return;
    g = { x: t.clientX, y: t.clientY, t: e.timeStamp || Date.now(), axis: null, tgt: tgt, el: tgt.el, dx: 0, dy: 0 };
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', function (e) {
    if (!g || !e.touches || !e.touches[0]) return;
    var t = e.touches[0];
    g.dx = t.clientX - g.x; g.dy = t.clientY - g.y;
    if (!g.axis) g.axis = lock(g.dx, g.dy);
    if (g.axis === 'v') { g = null; return; }
    if (g.axis !== 'h' || !g.el || reduced()) return;
    var dir = g.dx < 0 ? 'next' : 'prev';
    var atEnd = !neighbour(g.tgt.keys, g.tgt.cur, dir);
    g.el.style.transition = 'none';
    g.el.style.transform = 'translateX(' + follow(g.dx, atEnd).toFixed(1) + 'px)';
  }, { passive: true, capture: true });

  var end = function (e) {
    var s = g; g = null;
    if (!s || s.axis !== 'h') { if (s) reset(s.el, false); return; }
    var dir = decide({ dx: s.dx, dy: s.dy, dt: (e.timeStamp || Date.now()) - s.t, w: window.innerWidth });
    var key = dir && neighbour(s.tgt.keys, s.tgt.cur, dir);
    if (!key || popupOpen()) { reset(s.el, true); return; }
    if (!s.el || reduced()) { reset(s.el, false); s.tgt.go(key); return; }
    // The page slides on out to its side and fades, then the next room opens as from the menu.
    s.el.style.transition = 'transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.18s ease';
    s.el.style.transform = 'translateX(' + (dir === 'next' ? -40 : 40) + '%)';
    s.el.style.opacity = '0';
    setTimeout(function () { reset(s.el, false); s.tgt.go(key); }, 170);
  };
  document.addEventListener('touchend', end, { passive: true, capture: true });
  document.addEventListener('touchcancel', function () { var s = g; g = null; if (s) reset(s.el, true); }, { passive: true, capture: true });
})();
