// layout-offsets.js
(function () {
  if (window._casoraLayoutOffsets) return;
  window._casoraLayoutOffsets = true;

  var html = document.documentElement;

  // One walk serves all three lookups and holds until the next microtask (was six per tick).
  var scanned = null;
  function scan() {
    if (scanned) return scanned;
    var out = scanned = { badges: [], rows: [], navs: [] };
    (function walk(root, depth) {
      if (!root || depth > 20 || !root.querySelectorAll) return;
      var all = root.querySelectorAll('*'), sr = [], i, el;
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (el.id === 'badges_media') out.badges.push(el);
        if (el.localName === 'casora-smart-row') out.rows.push(el);
        else if (el.localName === 'casora-nav-bar') out.navs.push(el);
        if (el.shadowRoot) sr.push(el.shadowRoot);
      }
      for (i = 0; i < sr.length; i++) walk(sr[i], depth + 1);
    })(document, 0);
    Promise.resolve().then(function () { scanned = null; });
    return out;
  }

  function isVisible(el) {
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // ── Sidebar width ─────────────────────────────────────────────────────────
  var lastSidebarW = -1;
  var sidebarDebounce = null;
  var sidebarObserversReady = false;

  function findSidebar() {
    try {
      var ha = document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return null;
      var ham = ha.shadowRoot.querySelector('home-assistant-main');
      if (!ham || !ham.shadowRoot) return null;
      var sb = ham.shadowRoot.querySelector('ha-sidebar');
      if (sb) return sb;
      var dr = ham.shadowRoot.querySelector('ha-drawer');
      if (!dr) return null;
      return dr.shadowRoot ? dr.shadowRoot.querySelector('ha-sidebar') : dr.querySelector('ha-sidebar');
    } catch (e) {
      return null;
    }
  }

  function setSidebarWidth(w) {
    if (w !== lastSidebarW) {
      lastSidebarW = w;
      html.style.setProperty('--casora-sidebar-w', w + 'px');
    }
  }

  // ── Content left edge ────────────────────────────────────────────────────
  // Where HA's panel area starts: the docked sidebar's width (full or
  // collapsed), 0 when the sidebar is hidden (kiosk, "hide sidebar") or only
  // slides in as a modal drawer on a narrow screen. Tablet layouts pin the
  // room card and the tile row to the viewport with position: fixed, so they
  // read this to start beside a docked sidebar instead of underneath it.
  // --casora-sidebar-w can't serve: an open modal drawer has a width too.
  var lastContentLeft = -1;

  function findPanelArea() {
    try {
      var ha = document.querySelector('home-assistant');
      var ham = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      return (ham && ham.shadowRoot && ham.shadowRoot.querySelector('partial-panel-resolver')) || null;
    } catch (e) {
      return null;
    }
  }

  function applyContentLeft() {
    var area = findPanelArea();
    if (!area) return;
    var r = area.getBoundingClientRect();
    if (r.width <= 0) return;
    var left = Math.max(0, Math.round(r.left));
    if (left !== lastContentLeft) {
      lastContentLeft = left;
      html.style.setProperty('--casora-content-left', left + 'px');
    }
  }

  function applySidebar() {
    applyContentLeft();
    var sb = findSidebar();
    if (!sb) return false;

    var r = sb.getBoundingClientRect();
    var w = (r.width > 0 && r.right > 0) ? Math.round(r.width) : 0;

    if (w > 0) {
      if (sidebarDebounce) { clearTimeout(sidebarDebounce); sidebarDebounce = null; }
      setSidebarWidth(w);
    } else if (!sidebarDebounce) {
      sidebarDebounce = setTimeout(function () {
        sidebarDebounce = null;
        var sb2 = findSidebar();
        if (sb2) {
          var r2 = sb2.getBoundingClientRect();
          setSidebarWidth((r2.width > 0 && r2.right > 0) ? Math.round(r2.width) : 0);
        }
      }, 300);
    }
    return true;
  }

  function setupSidebarObservers() {
    if (sidebarObserversReady) return;
    var sb = findSidebar();
    if (!sb) return;
    sidebarObserversReady = true;

    try {
      var ro = new ResizeObserver(applySidebar);
      ro.observe(sb);
      var area = findPanelArea();
      if (area) ro.observe(area);
    } catch (e) {}
    try {
      var mo = new MutationObserver(applySidebar);
      mo.observe(sb, { attributes: true });
      if (sb.parentNode) mo.observe(sb.parentNode, { attributes: true, childList: true });
    } catch (e) {}
  }

  function initSidebar() {
    if (applySidebar()) { setupSidebarObservers(); return; }
    var attempts = 0;
    var iv = setInterval(function () {
      if (++attempts > 60) { clearInterval(iv); return; }
      if (applySidebar()) { clearInterval(iv); setupSidebarObservers(); }
    }, 250);
  }

  // ── Header stack centering ────────────────────────────────────────────────
  var headerRO = null;
  var headerObservedEls = [];
  var lastHeaderTop = -1;
  var recomputeQueued = false;

  function isDesktopOrTablet() {
    try {
      return !(window.matchMedia('(max-width: 767px)').matches &&
               window.matchMedia('(orientation: portrait)').matches);
    } catch (e) {
      return true;
    }
  }

  function findRoomHeaderStack() {
    var found = scan().badges;
    for (var i = 0; i < found.length; i++) {
      var container = found[i].closest('#container');
      if (container && isVisible(container)) return container;
    }
    return null;
  }

  function findActiveEntityRow() {
    var found = scan().rows;
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (el._scrollMode === false && isVisible(el)) return el;
    }
    return null;
  }

  // The casora-nav-bar host is a zero-height fixed anchor; .bar is the real box.
  function findNavbar() {
    var found = scan().navs;
    for (var i = 0; i < found.length; i++) {
      var nb = found[i];
      var inner = nb.shadowRoot ? nb.shadowRoot.querySelector('.bar') : null;
      if (inner && isVisible(inner)) return inner;
    }
    return null;
  }

  function fallbackNavbarBottom() {
    var v = getComputedStyle(html).getPropertyValue('--casora-nav-top-current').trim();
    var px = parseFloat(v);
    return isNaN(px) ? 60 : px + 40; // plus an approximate navbar height
  }

  // A card placed under the tile row is the one thing in this view still in
  // normal flow, so its height has to come off the hero or the view grows past
  // the viewport and the whole dashboard scrolls.
  var lastExtras = -1;
  function extrasHeight() {
    var row = findActiveEntityRow();
    if (!row) return 0;
    var node = row;
    while (node.parentElement && node.parentElement.children.length < 2) {
      node = node.parentElement;
    }
    if (!node.parentElement) return 0;
    var kids = node.parentElement.children;
    var total = 0, seen = false;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === node) { seen = true; continue; }
      if (!seen) continue;
      var r = kids[i].getBoundingClientRect();
      if (r.height <= 0) continue;
      total += r.height;
      // The gap a card sits in counts too, or the view is short by it.
      try {
        var cs = getComputedStyle(kids[i]);
        total += (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      } catch (e) {}
    }
    return total;
  }

  function applyExtras() {
    if (!isDesktopOrTablet()) return;
    var px = Math.round(extrasHeight());
    if (px === lastExtras) return;
    lastExtras = px;
    html.style.setProperty('--casora-extras-h', px + 'px');
  }

  function setHeaderTop(px) {
    var rounded = Math.round(px);
    if (rounded !== lastHeaderTop) {
      lastHeaderTop = rounded;
      html.style.setProperty('--hero-top', rounded + 'px');
    }
  }

  // ── Hero fit ──────────────────────────────────────────────────────────────
  // The hero (weather line, room title, badge rows) starts at the theme's
  // --hero-top while the tile row sits at the bottom of the screen. On short
  // landscape screens (8.7" tablets, 720p laptops, kiosk browsers with a
  // bigger text size) the badge rows ran into the tiles while the photo
  // above stayed empty. Only when the gap gets too small does the hero move
  // up (never into the nav bar or an open Now Playing card) and the title
  // shrink a little, just as much as needed. Where it fits nothing is set, so
  // those layouts stay exactly as the theme draws them.
  //
  // Each pass clears the card's override, measures the natural layout and
  // derives the override from that, so the result depends only on the
  // natural layout and a re-run can't feed on its own output (no loop).
  var FIT_GAP = 28;            // wanted space between the lowest badge row and the tiles
  var FIT_TOP_GAP = 20;        // least space between the nav bar and the hero's top
  var FIT_TITLE_SHARE = 0.35;  // part of the shortfall a smaller title takes
  var FIT_TITLE_SOFT = 0.85;   // ... while it keeps this share of its size
  var FIT_TITLE_MIN = 0.62;    // only with no room left to move up, down to this
  var FIT_TITLE_MIN_PX = 30;   // ... nor below this
  var fittedHosts = [];

  function boxOf(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return r;
  }

  // Inside a real dashboard view only: the Studio preview is a scaled replica
  // with its own layout and must not be touched.
  function inLovelace(el) {
    for (var n = el, i = 0; n && i < 60; i++) {
      var name = n.localName;
      if (name === 'ha-panel-lovelace' || name === 'hui-root') return true;
      if (name === 'casora-panel' || name === 'casora-studio') return false;
      n = n.parentNode || n.host;
    }
    return false;
  }

  function clearFit(host) {
    if (!host || !host._casoraHeroFit) return;
    host._casoraHeroFit = null;
    host.style.removeProperty('--hero-top');
    host.style.removeProperty('--hero-room-name-size-current');
  }

  function clearAllFits() {
    for (var i = 0; i < fittedHosts.length; i++) clearFit(fittedHosts[i]);
    fittedHosts = [];
  }

  // Box of the badge rows: height from the grid areas that take space
  // (collapsed sub-rows are zero high with hidden content), width from their
  // visible content rather than the full grid track.
  function badgeRowsBox(els) {
    var out = null;
    for (var i = 0; i < els.length; i++) {
      var area = boxOf(els[i]);
      if (!area) continue;
      var left = area.left, right = area.right;
      var kid = els[i].firstElementChild;
      var kr = kid && getComputedStyle(kid).visibility !== 'hidden' ? boxOf(kid) : null;
      if (kr) { left = Math.max(left, kr.left); right = Math.min(right, kr.right); }
      if (!out) out = { left: left, right: right, top: area.top, bottom: area.bottom };
      else {
        out.left = Math.min(out.left, left); out.right = Math.max(out.right, right);
        out.top = Math.min(out.top, area.top); out.bottom = Math.max(out.bottom, area.bottom);
      }
    }
    return out;
  }

  function tilesTop(row) {
    var wraps = row._wrappers || [];
    var top = Infinity;
    for (var i = 0; i < wraps.length; i++) {
      var w = wraps[i];
      if (!w || !w.isConnected || w.offsetParent === null) continue;
      var r = boxOf(w);
      if (r && r.right > 0 && r.left < window.innerWidth) top = Math.min(top, r.top);
    }
    return top === Infinity ? null : { top: top, rect: row.getBoundingClientRect() };
  }

  // Bottom edge of Now Playing where it overlaps [left, right]: the card in
  // the room header and the open list under the waveform (10-weich-welle.js,
  // a fixed box on <body>).
  function nowPlayingBottom(sr, left, right) {
    var bottom = 0;
    function take(r) {
      if (r && r.right > left && r.left < right && r.height < window.innerHeight / 2) bottom = Math.max(bottom, r.bottom);
    }
    (function walk(root, depth) {
      if (!root || depth > 6) return;
      var kids = root.children || [];
      for (var i = 0; i < kids.length; i++) {
        take(boxOf(kids[i]));
        if (kids[i].shadowRoot) walk(kids[i].shadowRoot, depth + 1);
        walk(kids[i], depth + 1);
      }
    })(sr.querySelector('#now_playing'), 0);
    var menus = document.querySelectorAll('body > .casora-welle-menu');
    for (var m = 0; m < menus.length; m++) take(boxOf(menus[m]));
    return bottom;
  }

  function fitHero(headerStack, entityRow, navbarBottom) {
    var sr = headerStack.getRootNode ? headerStack.getRootNode() : null;
    var host = sr && sr.host;
    if (!host || !inLovelace(host)) return;
    clearFit(host);
    // Regression tests compare against the unfitted layout.
    if (!entityRow || window.CASORA_QA_NO_HERO_FIT) return;

    var tiles = tilesTop(entityRow);
    var badgeEls = sr.querySelectorAll('#container > [id^="badges"]');
    var badges = badgeRowsBox(badgeEls);
    if (!tiles || !badges) return;
    // Tiles beside the hero (phone landscape rail) can't collide with it.
    if (tiles.rect.right <= badges.left || tiles.rect.left >= badges.right) return;

    var need = FIT_GAP - (tiles.top - badges.bottom);
    if (need <= 0.5) return;

    var title = boxOf(sr.querySelector('#name')) ? sr.querySelector('#name')
      : (boxOf(sr.querySelector('#n')) ? sr.querySelector('#n') : null);
    var stackTop = badges.top, left = badges.left, right = badges.right;
    ['#temperature', '#weather', '#name', '#n'].forEach(function (sel) {
      var r = boxOf(sr.querySelector(sel));
      if (!r) return;
      stackTop = Math.min(stackTop, r.top);
      left = Math.min(left, r.left); right = Math.max(right, r.right);
    });
    var limit = Math.max(navbarBottom || 0, nowPlayingBottom(sr, left, right)) + FIT_TOP_GAP;
    var room = Math.max(0, stackTop - limit);

    var titleH = 0, size0 = 0;
    if (title) {
      titleH = title.getBoundingClientRect().height;
      size0 = parseFloat(getComputedStyle(title).fontSize) || 0;
    }
    var softCut = 0, maxCut = 0;
    if (titleH > 0 && size0 > 0) {
      var minSize = Math.min(size0, Math.max(FIT_TITLE_MIN_PX, size0 * FIT_TITLE_MIN));
      maxCut = titleH * (1 - minSize / size0);
      softCut = Math.min(maxCut, titleH * (1 - FIT_TITLE_SOFT));
    }
    // A somewhat smaller title takes its share, moving up the rest; whatever
    // the move can't cover (no room left under the nav bar) goes back to the
    // title, down to its minimum.
    var cut = Math.min(softCut, need * FIT_TITLE_SHARE);
    var shift = Math.min(room, need - cut);
    cut = Math.max(cut, Math.min(maxCut, need - shift));
    shift = Math.round(shift);
    var size = cut > 0.5 ? Math.round(size0 * (1 - cut / titleH) * 10) / 10 : 0;
    if (shift < 1 && !size) return;

    var base = getComputedStyle(host).getPropertyValue('--hero-top').trim();
    if (shift >= 1 && base) host.style.setProperty('--hero-top', 'calc(' + base + ' - ' + shift + 'px)');
    if (size) host.style.setProperty('--hero-room-name-size-current', size + 'px');
    host._casoraHeroFit = { shift: shift, size: size, size0: size0, need: Math.round(need) };
    if (fittedHosts.indexOf(host) === -1) fittedHosts.push(host);
  }

  function computeAndApplyHeader() {
    if (!isDesktopOrTablet()) { clearAllFits(); return; }
    applyExtras();

    var headerStack = findRoomHeaderStack();
    if (!headerStack) return;

    var entityRow = findActiveEntityRow();
    var navbar = findNavbar();
    var navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : fallbackNavbarBottom();

    var viewportH = window.innerHeight;
    var headerH = headerStack.getBoundingClientRect().height;
    var entityRowH = entityRow ? entityRow.getBoundingClientRect().height : 0;

    var available = viewportH - navbarBottom - entityRowH;
    var centeredTop = navbarBottom + Math.max(0, (available - headerH) / 2);

    setHeaderTop(centeredTop);
    // A failed fit must never take the rest of the header logic with it.
    try { fitHero(headerStack, entityRow, navbarBottom); } catch (e) {}
  }

  function queueRecompute() {
    if (recomputeQueued) return;
    recomputeQueued = true;
    requestAnimationFrame(function () {
      recomputeQueued = false;
      computeAndApplyHeader();
    });
  }

  function observeEl(el) {
    if (!el || headerObservedEls.indexOf(el) !== -1) return;
    headerObservedEls.push(el);
    try { headerRO.observe(el); } catch (e) {}
  }

  function setupHeaderObservers() {
    if (!headerRO) {
      try { headerRO = new ResizeObserver(queueRecompute); } catch (e) { return; }
    }

    var headerStack = findRoomHeaderStack();
    if (headerStack) observeEl(headerStack);
    var entityRow = findActiveEntityRow();
    if (entityRow) observeEl(entityRow);

    // Catches zoom and devtools changes that don't fire a resize event.
    observeEl(html);
  }

  function initHeader() {
    computeAndApplyHeader();
    setupHeaderObservers();
    var attempts = 0;
    var iv = setInterval(function () {
      if (++attempts > 20) { clearInterval(iv); return; }
      computeAndApplyHeader();
      setupHeaderObservers();
    }, 250);
  }

  window.addEventListener('resize', queueRecompute);
  window.addEventListener('resize', applyContentLeft);
  window.addEventListener('location-changed', function () {
    // Drop stale observations and re-discover once the new view has rendered.
    headerObservedEls = [];
    lastExtras = -1;
    if (headerRO) { try { headerRO.disconnect(); } catch (e) {} }
    // Early passes fit a new room's hero before it has been on screen long.
    setTimeout(queueRecompute, 60);
    setTimeout(queueRecompute, 180);
    setTimeout(initHeader, 400);
  });

  // The Now Playing list under the waveform opens and closes on <body>; the
  // hero must stay clear of it, so a change there is a reason to re-fit.
  function watchNowPlayingMenu() {
    if (!document.body) return;
    try {
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var nodes = [].slice.call(list[i].addedNodes).concat([].slice.call(list[i].removedNodes));
          for (var k = 0; k < nodes.length; k++) {
            if (nodes[k].classList && nodes[k].classList.contains('casora-welle-menu')) {
              // Its size settles after the opening animation.
              queueRecompute();
              setTimeout(queueRecompute, 400);
              return;
            }
          }
        }
      }).observe(document.body, { childList: true });
    } catch (e) {}
  }
  try {
    if (document.body) watchNowPlayingMenu();
    else document.addEventListener('DOMContentLoaded', watchNowPlayingMenu);
  } catch (e) {}

  setTimeout(initSidebar, 200);
  setTimeout(initSidebar, 1500);
  setTimeout(initSidebar, 5000);

  setTimeout(initHeader, 200);
  setTimeout(initHeader, 1500);
})();
