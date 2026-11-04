// ── Display diagnosis on the affected device (issue 123, 04.11.2026) ──────────
// Display bugs come from devices the Studio diagnosis (panel/casora-panel-diagnostics.js) never sees: a wall
// tablet in Fully Kiosk, a phone with a bigger system font. This opens, on that very device and inside any Casora
// dashboard, a sheet with what the screen looks like to Casora, as plain text to copy into a GitHub issue.
//
// Opened by
//   - the URL parameter casora_diag (…/dashboard-casora/home?casora_diag or &casora_diag), or
//   - five quick taps on the page title (room name or greeting in the head: desktop, tablet and phone alike;
//     the title has no tap action of its own, so the gesture never collides with normal use).
// No admin needed (a family member may be the one reporting). Only display data goes in: no entity ids, no names,
// no addresses, hosts or tokens – every value is a number, a word from a fixed list or passes a strict pattern.
// The user agent is kept (that is the point) but cut to printable ASCII and 300 characters.
//
//   window._casoraDisplayDiag.collect(w, probe)  pure: window-like values + measurements → data (dev/unit/display_diag.mjs)
//   window._casoraDisplayDiag.format(d)          pure: data → plain text, one "key: value" per line
//   window._casoraDisplayDiag.envOf(ua, w)       pure: app / browser / os / webview from the user agent
//   window._casoraDisplayDiag.open()             measure this page and open the sheet
(function () {
  if (window._casoraDisplayDiag) return;
  var W = window;
  var D = W._casoraDisplayDiag = {};
  var T = function (x) { return W.casoraTr ? W.casoraTr(x) : x; };

  // ── Cleaning: whatever is not plainly safe becomes "?" ─────────────────────
  var num = function (n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    var f = Math.pow(10, dec || 0);
    return Math.round(n * f) / f;
  };
  var cleanVersion = function (x) { return /^[0-9][0-9A-Za-z.+-]{0,30}$/.test(String(x || '')) ? String(x) : '?'; };
  var cleanLang = function (x) { return /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(String(x || '')) ? String(x) : '?'; };
  var cleanWord = function (x) { return /^[a-z0-9_-]{1,40}$/.test(String(x || '')) ? String(x) : '?'; };
  // Casora's own designs by name (lower case here; any other theme is the user's and only "other").
  var THEMES = ['casora', 'casora glas', 'casora nebel', 'casora weich'];
  var cleanTheme = function (x) {
    var s = String(x || '');
    if (!s || s === 'default') return 'default';
    return THEMES.indexOf(s.toLowerCase()) >= 0 ? s.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) : 'other';
  };
  var cleanUa = function (x) { return String(x || '').replace(/[^\x20-\x7e]/g, '').slice(0, 300) || '?'; };
  var yn = function (b) { return b === null || b === undefined ? '?' : b ? 'yes' : 'no'; };
  var px = function (n) { return n === null || n === undefined ? '-' : n + 'px'; };

  // App, browser, system and WebView from the user agent – only names from fixed lists and version numbers.
  // Like envOf in panel/casora-panel-diagnostics.js, plus Fully Kiosk and the Android WebView.
  D.envOf = function (ua, w) {
    var s = String(ua || '');
    w = w || {};
    var fully = /FullyKiosk/i.test(s) || !!w.fully;
    var companion = /Home ?Assistant\//i.test(s) || !!w.externalApp;
    var app = fully ? 'Fully Kiosk' : companion ? 'Companion app' : 'browser';
    var os = /iPhone|iPad|iPod/.test(s) ? 'ios' : /Android/.test(s) ? 'android' : /Mac OS X|Macintosh/.test(s)
      ? (w.touch ? 'ipados' : 'macos') : /Windows/.test(s) ? 'windows' : /CrOS/.test(s) ? 'chromeos' : /Linux/.test(s) ? 'linux' : '?';
    var m;
    var browser = (m = /Edg(?:A|iOS)?\/([0-9.]+)/.exec(s)) ? 'edge ' + m[1]
      : (m = /(?:Firefox|FxiOS)\/([0-9.]+)/.exec(s)) ? 'firefox ' + m[1]
        : (m = /OPR\/([0-9.]+)/.exec(s)) ? 'opera ' + m[1]
          : (m = /(?:Chrome|CriOS)\/([0-9.]+)/.exec(s)) ? 'chrome ' + m[1]
            : (m = /Version\/([0-9.]+).*Safari\//.exec(s)) ? 'safari ' + m[1]
              : /AppleWebKit/.test(s) ? 'webkit' : '?';
    // Android WebView: "; wv)" in the platform part (Fully Kiosk, Companion app), version from Chrome/….
    var webview = /Android/.test(s) && /;\s*wv\)/.test(s) ? ((m = /Chrome\/([0-9.]+)/.exec(s)) ? m[1] : '?') : null;
    var ver = function (re) { var x = re.exec(s); return x ? x[1] : null; };
    return { app: app, fully: fully, companion: companion, os: os,
      osVersion: ver(/Android ([0-9.]+)/) || (ver(/OS ([0-9_]+) like Mac/) || '').replace(/_/g, '.') || null,
      browser: browser, webview: webview };
  };

  // Which layout Casora picks from the screen: the same media queries the scripts and templates use.
  //   phone        casora-core MOBILE_MQ / isPhone(): phone look of popups, menus, badges
  //   phone_land   casora-core LANDSCAPE_MQ: phone turned sideways
  //   wide_hero    layout-offsets isDesktopOrTablet(): the hero (title, weather, badges) is fitted above the tiles
  //   touch_tablet templates' tablet rules (768–1400 wide, at least 501 high, coarse pointer or no hover)
  //   tablet_nav   the tablet navbar's / idle-return test (hover none, coarse pointer, at least 600 wide)
  //   short_h      popup sheets for short landscape screens (min-width 601, max-height 900 / 720)
  D.QUERIES = [
    ['phone', '(max-width: 767px), (max-height: 500px)'],
    ['phone_land', '(orientation: landscape) and (max-height: 500px)'],
    ['phone_portrait', '(max-width: 767px) and (orientation: portrait)'],
    ['touch_tablet', '(min-width: 768px) and (max-width: 1400px) and (min-height: 501px) and (pointer: coarse), '
      + '(min-width: 768px) and (max-width: 1400px) and (min-height: 501px) and (hover: none)'],
    ['tablet_nav', '(hover: none) and (pointer: coarse) and (min-width: 600px)'],
    ['short_900', '(max-height: 900px) and (min-width: 601px)'],
    ['short_720', '(max-height: 720px) and (min-width: 601px)'],
    ['narrow_600', '(max-width: 600px)'],
  ];

  // w: window-like ({ navigator: { userAgent }, innerWidth, innerHeight, visualViewport, screen, devicePixelRatio,
  //   matchMedia, fully, externalApp, KioskMode }); p: measurements of the page (see measure()). Pure.
  D.collect = function (w, p) {
    w = w || {}; p = p || {};
    var mm = function (q) { try { return !!(w.matchMedia && w.matchMedia(q).matches); } catch (e) { return null; } };
    var nav = w.navigator || {};
    var ua = nav.userAgent || '';
    var env = D.envOf(ua, { fully: !!w.fully, externalApp: !!w.externalApp, touch: (nav.maxTouchPoints || 0) > 1 });
    var vv = w.visualViewport || null, sc = w.screen || {};
    var media = {};
    D.QUERIES.forEach(function (q) { media[q[0]] = mm(q[1]); });
    // Text zoom: a box 1em high at font-size 100px. The browser (Android font scale, WebView textZoom in Fully
    // Kiosk, a minimum font size) draws it bigger than 100px – the factor is what every text on the page gets.
    var tp = num(p.textPx, 1), rp = num(p.rootPx, 1);
    var zoom = tp ? num(tp / 100, 2) : null;
    var adj = p.adjustPx !== undefined && p.adjustPx !== null && tp ? num(p.adjustPx / 100, 2) : null;
    var safe = p.safe || {};
    var h = p.heights || {};
    var L = p.layout || {};
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? p.date : '?',
      casora: cleanVersion(p.casora),
      stamp: /^[0-9]{6,14}$/.test(String(p.stamp || '')) ? String(p.stamp) : null,
      ha: cleanVersion(p.ha),
      language: cleanLang(p.language),
      theme: cleanTheme(p.theme),
      dark: p.dark === undefined ? null : !!p.dark,
      dashboard: ['phone', 'desktop'].indexOf(L.dashboard) >= 0 ? L.dashboard : '?',
      navVariant: ['desktop', 'tablet'].indexOf(L.nav) >= 0 ? L.nav : null,
      page: ['home', 'room'].indexOf(L.page) >= 0 ? L.page : '?',
      media: media,
      heroFit: L.heroFit && typeof L.heroFit === 'object'
        ? { shift: num(L.heroFit.shift), size: num(L.heroFit.size, 1), size0: num(L.heroFit.size0, 1), need: num(L.heroFit.need) } : null,
      heroTop: num(L.heroTop),
      titlePx: num(L.titlePx, 1),
      viewport: { w: num(w.innerWidth), h: num(w.innerHeight) },
      visual: vv ? { w: num(vv.width), h: num(vv.height), scale: num(vv.scale, 2) } : null,
      screen: { w: num(sc.width), h: num(sc.height), avW: num(sc.availWidth), avH: num(sc.availHeight) },
      dpr: num(w.devicePixelRatio, 2),
      orientation: cleanWord(sc.orientation && sc.orientation.type) !== '?' ? sc.orientation.type
        : (mm('(orientation: portrait)') ? 'portrait' : 'landscape'),
      pointer: mm('(pointer: coarse)') ? 'coarse' : mm('(pointer: fine)') ? 'fine' : 'none',
      anyPointer: mm('(any-pointer: fine)') ? 'fine' : mm('(any-pointer: coarse)') ? 'coarse' : 'none',
      hover: mm('(hover: hover)'),
      touchPoints: num(nav.maxTouchPoints),
      textZoom: zoom, textPx: tp, rootPx: rp,
      textAdjust: adj,
      reducedMotion: mm('(prefers-reduced-motion: reduce)'),
      prefersDark: mm('(prefers-color-scheme: dark)'),
      haHeader: ['shown', 'hidden'].indexOf(p.header) >= 0 ? p.header : '?',
      sidebar: ['shown', 'narrow', 'hidden'].indexOf(p.sidebar) >= 0 ? p.sidebar : '?',
      kioskMode: !!w.KioskMode,
      safe: { t: num(safe.t), r: num(safe.r), b: num(safe.b), l: num(safe.l) },
      ua: cleanUa(ua),
      env: env,
      heights: {
        head: num(h.head), title: num(h.title), badges: num(h.badges),
        sub: (h.sub || []).filter(function (x) { return x && cleanWord(x.k) !== '?'; })
          .map(function (x) { return { k: x.k, h: num(x.h) }; }),
        tiles: num(h.tiles), tileCount: num(h.tileCount),
        gap: num(h.gap), overlap: num(h.overlap), overlapWhat: cleanWord(h.overlapWhat) !== '?' ? h.overlapWhat : null,
      },
    };
  };

  D.format = function (d) {
    var out = [];
    var add = function (k, v) { out.push(k + ': ' + v); };
    add('casora_display_diagnosis', d.date);
    add('casora', d.casora + (d.stamp ? ' (scripts ' + d.stamp + ')' : ''));
    add('home_assistant', d.ha);
    add('language', d.language);
    add('dashboard', d.dashboard + (d.navVariant ? ' · nav ' + d.navVariant : '') + ' · page ' + d.page);
    var on = D.QUERIES.map(function (q) { return q[0]; }).filter(function (k) { return d.media[k]; });
    add('layout_rules', on.length ? on.join(', ') : 'none');
    add('hero_fit', d.heroFit ? 'shift ' + px(d.heroFit.shift) + (d.heroFit.size ? ' · title ' + px(d.heroFit.size0) + ' → ' + px(d.heroFit.size) : '')
      + ' · short by ' + px(d.heroFit.need) : 'none');
    add('hero_top', px(d.heroTop));
    add('viewport', d.viewport.w + 'x' + d.viewport.h);
    add('visual_viewport', d.visual ? d.visual.w + 'x' + d.visual.h + ' · scale ' + d.visual.scale : '-');
    add('screen', d.screen.w + 'x' + d.screen.h + ' · available ' + d.screen.avW + 'x' + d.screen.avH);
    add('device_pixel_ratio', d.dpr);
    add('orientation', d.orientation);
    add('pointer', d.pointer + ' · any ' + d.anyPointer + ' · hover ' + yn(d.hover) + ' · touch points ' + (d.touchPoints === null ? '?' : d.touchPoints));
    add('text_zoom', (d.textZoom === null ? '?' : d.textZoom.toFixed(2)) + ' (100px test → ' + px(d.textPx) + ')'
      + (d.textZoom !== null && Math.abs(d.textZoom - 1) >= 0.05 ? ' · ENLARGED TEXT' : ''));
    add('root_font', px(d.rootPx));
    add('text_size_adjust', d.textAdjust === null ? '?' : Math.abs(d.textAdjust - (d.textZoom || 1)) < 0.02
      ? 'no effect' : 'off → ' + d.textAdjust.toFixed(2));
    add('title_font', px(d.titlePx));
    add('reduced_motion', yn(d.reducedMotion));
    add('color_scheme', 'system ' + (d.prefersDark ? 'dark' : 'light') + ' · HA ' + (d.dark === null ? '?' : d.dark ? 'dark' : 'light'));
    add('theme', d.theme);
    add('ha_header', d.haHeader + ' · sidebar ' + d.sidebar + ' · kiosk_mode ' + yn(d.kioskMode));
    add('safe_area', [d.safe.t, d.safe.r, d.safe.b, d.safe.l].map(function (n) { return n === null ? '?' : n; }).join(' ') + ' (top right bottom left)');
    add('app', d.env.app + ' · ' + d.env.browser + ' · ' + d.env.os + (d.env.osVersion ? ' ' + d.env.osVersion : '')
      + (d.env.webview ? ' · Android WebView ' + d.env.webview : ''));
    add('user_agent', d.ua);
    var H = d.heights;
    add('height_head', px(H.head) + (H.title !== null ? ' (title ' + px(H.title) + ')' : ''));
    add('height_badges', px(H.badges));
    add('height_sub_badges', H.sub.length ? H.sub.map(function (s) { return s.k + ' ' + px(s.h); }).join(' · ') : 'closed');
    add('height_tiles', px(H.tiles) + (H.tileCount !== null ? ' (' + H.tileCount + ' in the first row)' : ''));
    add('gap_badges_tiles', px(H.gap));
    add('overlap', H.overlap ? H.overlapWhat + ' ' + px(H.overlap) : 'none');
    return out.join('\n');
  };

  // ── Triggers (pure parts) ──────────────────────────────────────────────────
  var hostOf = function (el) { var r = el && el.getRootNode && el.getRootNode(); return r && r.host; };
  var tplOf = function (el) { var c = el && el._config; return c ? [].concat(c.template || []).join(' ') : ''; };
  // URL parameter casora_diag; five quick taps on the page title: #name / #n of the room card (desktop, tablet)
  // and #name of casora_mobile_weather (phone).
  D.wanted = function (search) { return /[?&]casora_diag(=[^&]*)?(&|$)/.test(String(search || '')); };
  D.TAPS = 5;
  D.WINDOW = 3000;   // all five within 3 s …
  D.GAP = 700;       // … and at most 0.7 s apart
  var taps = [];
  D.isTitle = function (path) {
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || el.nodeType !== 1) continue;
      if (el.id === 'name' || el.id === 'n') {
        var host = hostOf(el);
        if (host && /casora_room|casora_mobile_weather/.test(tplOf(host))) return true;
      }
    }
    return false;
  };
  D.tap = function (now) {
    if (taps.length && now - taps[taps.length - 1] > D.GAP) taps = [];
    taps.push(now);
    taps = taps.filter(function (t) { return now - t <= D.WINDOW; });
    if (taps.length >= D.TAPS) { taps = []; return true; }
    return false;
  };

  if (typeof document === 'undefined' || !document.createElement || !W.customElements) return;

  // ── Measuring the page ───────────────────────────────────────────────────────
  var pierce = function (sel) {
    var out = [];
    (function walk(root, depth) {
      if (!root || depth > 24 || !root.querySelectorAll) return;
      var all = root.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        if (all[i].matches && all[i].matches(sel)) out.push(all[i]);
        if (all[i].shadowRoot) walk(all[i].shadowRoot, depth + 1);
      }
    })(document, 0);
    return out;
  };
  var box = function (el) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    try { var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; } catch (e) { /* box only */ }
    return r;
  };
  var union = function (list) {
    var u = null;
    list.forEach(function (r) {
      if (!r) return;
      if (!u) u = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      else { u.top = Math.min(u.top, r.top); u.bottom = Math.max(u.bottom, r.bottom); u.left = Math.min(u.left, r.left); u.right = Math.max(u.right, r.right); }
    });
    return u;
  };
  var inView = function (r) { return r && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };

  // Test boxes: font-size 100px (text zoom), the same with text-size-adjust off, and the safe-area insets.
  function probes() {
    var host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
    var a = document.createElement('div');
    a.style.cssText = 'font-size:100px;line-height:1;height:1em;width:1em;padding:0;margin:0;border:0;';
    var b = document.createElement('div');
    b.style.cssText = a.style.cssText + '-webkit-text-size-adjust:none;text-size-adjust:none;';
    a.textContent = 'M'; b.textContent = 'M';
    var s = document.createElement('div');
    s.style.cssText = 'position:fixed;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) '
      + 'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    host.appendChild(a); host.appendChild(b); host.appendChild(s);
    (document.body || document.documentElement).appendChild(host);
    var out = {};
    try {
      out.textPx = Math.max(a.getBoundingClientRect().height, parseFloat(getComputedStyle(a).fontSize) || 0);
      out.adjustPx = Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b).fontSize) || 0);
      out.rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || null;
      var cs = getComputedStyle(s);
      out.safe = { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) };
    } catch (e) { /* stays empty */ }
    host.remove();
    return out;
  }

  function haParts() {
    var out = { header: '?', sidebar: '?' };
    try {
      var ha = document.querySelector('home-assistant');
      var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      var mr = main && main.shadowRoot;
      var sb = mr && mr.querySelector('ha-sidebar');
      var sr = sb && box(sb);
      out.sidebar = !sr || sr.width < 2 ? 'hidden' : sr.width < 120 ? 'narrow' : 'shown';
      var hr = mr && mr.querySelector('partial-panel-resolver ha-panel-lovelace');
      hr = hr && hr.shadowRoot && hr.shadowRoot.querySelector('hui-root');
      var hd = hr && hr.shadowRoot && hr.shadowRoot.querySelector('.header');
      if (hr) out.header = hd && box(hd) && hd.getBoundingClientRect().height > 4 ? 'shown' : 'hidden';
    } catch (e) { /* stays "?" */ }
    return out;
  }

  // The current view: head (weather line + title), badge rows, open sub-badge rows, first tile row.
  function layout() {
    var L = {}, H = { sub: [] };
    var mobile = /^\/[^/]*[-_]mobile(\/|$)/i.test(location.pathname)
      || pierce('button-card').some(function (b) { return /casora_mobile_bg/.test(tplOf(b)); });
    L.dashboard = mobile ? 'phone' : 'desktop';
    var navs = pierce('casora-nav-bar, casora-nav').filter(function (n) { return n._variant; });
    L.nav = navs.length ? navs[0]._variant : null;
    var ht = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-top'));
    L.heroTop = isFinite(ht) ? ht : null;
    var filt = W._casoraFilter && W._casoraFilter.get ? W._casoraFilter.get() : null;

    var title = null, headBoxes = [], badgeRows = [], tileBoxes = [];
    if (!mobile) {
      // Desktop / tablet: the room card (layout-offsets.js findRoomHeaderStack) – #container holding the badge rows.
      var media = pierce('#badges_media');
      var cont = null;
      for (var i = 0; i < media.length && !cont; i++) {
        var c = media[i].closest('#container');
        if (c && box(c)) cont = c;
      }
      var sr = cont && cont.getRootNode();
      var host = sr && sr.host;
      if (host) {
        L.heroFit = host._casoraHeroFit || null;
        var hv = parseFloat(getComputedStyle(host).getPropertyValue('--hero-top'));
        if (isFinite(hv)) L.heroTop = hv;
        title = box(sr.querySelector('#name')) ? sr.querySelector('#name') : box(sr.querySelector('#n')) ? sr.querySelector('#n') : null;
        ['#temperature', '#weather', '#name', '#n'].forEach(function (s) { headBoxes.push(box(sr.querySelector(s))); });
        var rows = sr.querySelectorAll('#container > [id^="badges"]');
        for (var j = 0; j < rows.length; j++) {
          var kid = rows[j].firstElementChild;
          var rb = box(rows[j]);
          // Collapsed sub rows are zero high or hold a hidden child.
          if (!rb || rb.height < 4 || (kid && getComputedStyle(kid).visibility === 'hidden')) continue;
          if (rows[j].id === 'badges') badgeRows.unshift({ k: 'badges', r: rb });
          else badgeRows.push({ k: rows[j].id.replace(/^badges_/, ''), r: rb });
        }
      }
      // First tile row: the visible smart row (layout-offsets findActiveEntityRow / tilesTop).
      var srows = pierce('casora-smart-row').filter(function (r) { return r._scrollMode === false && box(r); });
      if (!srows.length) srows = pierce('casora-smart-row').filter(function (r) { return box(r); });
      (srows[0] && srows[0]._wrappers || []).forEach(function (wr) {
        var r = wr && wr.isConnected && box(wr);
        if (r && r.right > 0 && r.left < innerWidth) tileBoxes.push(r);
      });
      L.page = filt && filt !== 'all' ? 'room' : /\/home(\/|$)|\/0$/.test(location.pathname) ? 'home' : 'room';
    } else {
      // Phone: the title of casora_mobile_weather; badge rows = the visible badges grouped by their top (first row the
      // filter badges on Home or the room's chips, a further row an open sub row, _casoraFilter.row()); tiles = the
      // other cards under the head (they may run into the badges – that is what is measured).
      var wx = pierce('button-card').filter(function (b) { return /casora_mobile_weather/.test(tplOf(b)) && box(b); })[0];
      var wsr = wx && wx.shadowRoot;
      title = wsr && box(wsr.querySelector('#name')) ? wsr.querySelector('#name') : null;
      if (wx) headBoxes.push(box(wx));
      var groups = {};
      pierce('button-card').forEach(function (b) {
        var t = tplOf(b);
        if (!/casora_badge/.test(t) || /popup/.test(t)) return;
        var r = box(b);
        if (!r || !inView(r) || r.height < 20 || r.height > 90) return;
        var k = Math.round(r.top / 6);
        groups[k] = groups[k] ? union([groups[k], r]) : union([r]);
      });
      var subName = cleanWord(W._casoraFilter && W._casoraFilter.row ? W._casoraFilter.row() : null);
      Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.top - b.top; })
        .forEach(function (g, i) { badgeRows.push({ k: i ? (subName !== '?' ? subName : 'sub') : 'badges', r: g }); });
      var below = wx ? box(wx).bottom : 0;
      pierce('button-card').forEach(function (b) {
        var t = tplOf(b);
        if (!t || /badge|mobile_bg|mobile_weather|mobile_header|mobile_filter|mobile_chrome|sensor_chips|nav|menu|button|time|weather|room\b/.test(t)) return;
        var r = box(b);
        if (r && inView(r) && r.top >= below - 2 && r.height >= 40 && r.width >= 60) tileBoxes.push(r);
      });
      L.page = filt && filt !== 'all' ? 'room' : 'home';
    }
    if (title) {
      L.titlePx = parseFloat(getComputedStyle(title).fontSize) || null;
      H.title = Math.round(title.getBoundingClientRect().height);
    }
    var hb = union(headBoxes);
    if (hb) H.head = Math.round(hb.bottom - hb.top);
    var main = badgeRows.filter(function (x) { return x.k === 'badges'; })[0];
    if (main) H.badges = Math.round(main.r.bottom - main.r.top);
    // Sub rows grouped (phone: one box per open sub badge, measured as the row they form).
    var subs = {};
    badgeRows.filter(function (x) { return x.k !== 'badges'; }).forEach(function (x) {
      var u = subs[x.k] = subs[x.k] ? union([subs[x.k], x.r]) : union([x.r]);
      return u;
    });
    Object.keys(subs).forEach(function (k) { H.sub.push({ k: k, h: Math.round(subs[k].bottom - subs[k].top) }); });
    // First tile row: the tiles whose top lies within 4px of the highest one.
    if (tileBoxes.length) {
      var t0 = Math.min.apply(null, tileBoxes.map(function (r) { return r.top; }));
      var first = tileBoxes.filter(function (r) { return r.top - t0 < 4; });
      H.tiles = Math.round(Math.max.apply(null, first.map(function (r) { return r.height; })));
      H.tileCount = first.length;
      var bb = union(badgeRows.map(function (x) { return x.r; }));
      if (bb) {
        H.gap = Math.round(t0 - bb.bottom);
        // Overlap: a badge row's box intersecting a tile's box.
        var worst = 0, what = null;
        badgeRows.forEach(function (x) {
          tileBoxes.forEach(function (r) {
            var ox = Math.min(x.r.right, r.right) - Math.max(x.r.left, r.left);
            var oy = Math.min(x.r.bottom, r.bottom) - Math.max(x.r.top, r.top);
            if (ox > 1 && oy > 1 && oy > worst) { worst = oy; what = x.k === 'badges' ? 'badges_over_tiles' : 'sub_badges_over_tiles'; }
          });
        });
        H.overlap = worst ? Math.round(worst) : 0;
        H.overlapWhat = what;
      }
    }
    return { layout: L, heights: H };
  }

  function hassOf() { var ha = document.querySelector('home-assistant'); return ha && ha.hass; }
  function today() { var d = new Date(); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  D.measure = function () {
    var h = hassOf() || {};
    var p = probes();
    var lay = layout();
    var ha = haParts();
    p.layout = lay.layout; p.heights = lay.heights;
    p.header = ha.header; p.sidebar = ha.sidebar;
    p.date = today();
    p.casora = W.__casoraVersion || null;
    p.stamp = W.casoraLoadedStamp || null;
    p.ha = h.config && h.config.version;
    p.language = (h.locale && h.locale.language) || h.language;
    p.theme = (W.casoraTheme && W.casoraTheme.active && (function () { try { return W.casoraTheme.active(h); } catch (e) { return null; } })())
      || (h.selectedTheme && h.selectedTheme.theme) || (h.themes && h.themes.default_theme);
    p.dark = h.themes ? !!h.themes.darkMode : undefined;
    return D.collect(W, p);
  };

  // ── Clipboard: Clipboard API where allowed, else select the text and the old way ─
  function copyByHand(text) {
    var ok = false;
    var ta = document.createElement('textarea');
    try {
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:12pt;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = !!(document.execCommand && document.execCommand('copy'));
    } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  D.copy = function (text) {
    var C = W.navigator && W.navigator.clipboard;
    if (W.isSecureContext && C && C.writeText) {
      return C.writeText(text).then(function () { return true; }, function () { return copyByHand(text); });
    }
    return Promise.resolve(copyByHand(text));
  };

  // ── The sheet: own overlay in the v3 look (scrim, centred sheet, title, ×), the text only ever as textContent ─
  // Its own element on <body>, not casora-popup: the diagnosis has to work exactly where the dashboard's layout is
  // in doubt, and must not depend on the popup frame it may be reporting about.
  var CSS = ':host{position:fixed;inset:0;z-index:var(--casora-popup-z, 2147483000);display:block;'
    + 'font-family:var(--casora-font, var(--ha-font-family-body, Inter, system-ui, sans-serif));color:var(--primary-text-color, #fff)}'
    + '.scrim{position:absolute;inset:0;background:var(--casora-popup-scrim, rgba(0,0,0,.40));'
    + 'backdrop-filter:var(--casora-popup-scrim-backdrop, blur(6px) saturate(1.35));'
    + '-webkit-backdrop-filter:var(--casora-popup-scrim-backdrop, blur(6px) saturate(1.35))}'
    + '.layer{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;pointer-events:none;'
    + 'padding:16px 8px calc(16px + env(safe-area-inset-bottom, 0px));box-sizing:border-box}'
    + '.sheet{pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;width:min(552px, calc(100vw - 16px));'
    + 'max-height:100%;border-radius:var(--casora-popup-radius, 38px);overflow:hidden;'
    + 'background:var(--ha-dialog-surface-background, var(--card-background-color, rgb(42,39,35)));'
    + 'box-shadow:var(--casora-elevation-floating, 0 8px 20px rgba(0,0,0,.13));'
    + 'animation:dd-in var(--casora-popup-enter, 260ms) cubic-bezier(.2,.8,.2,1)}'
    + '@keyframes dd-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}'
    + '.head{display:flex;align-items:center;gap:12px;padding:26px 26px 14px}'
    + 'h2{flex:1;min-width:0;margin:0;font-size:var(--casora-popup-header-title-size, 22px);line-height:1.2;font-weight:700;'
    + 'color:var(--casora-popup-header-title-color, var(--primary-text-color, #fff))}'
    + '.x{all:unset;box-sizing:border-box;flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;'
    + 'justify-content:center;cursor:pointer;background:var(--casora-soft-control-fill, rgba(127,127,127,.14));'
    + 'color:var(--casora-popup-header-title-color, var(--primary-text-color, #fff))}'
    + '.x svg{width:18px;height:18px;display:block}'
    // The text scrolls, the buttons stay in view (foot).
    + '.body{overflow:auto;padding:0 26px;min-height:0;flex:1 1 auto}'
    + '.foot{flex:none;padding:16px 26px 22px}'
    + '.sub{margin:0 0 14px;font-size:14px;line-height:1.45;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color))}'
    + 'pre{margin:0;padding:14px 16px;white-space:pre-wrap;overflow-wrap:anywhere;'
    + 'border-radius:var(--casora-v3-stage-radius, 24px);font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;'
    + 'user-select:text;-webkit-user-select:text;color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));'
    + 'background:var(--casora-soft-row-fill, var(--casora-popup-row-fill, rgba(127,127,127,.12)))}'
    + '.acts{display:flex;flex-direction:column;gap:10px}'
    + '.b{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;'
    + 'border-radius:999px;font:inherit;font-size:16px;font-weight:700;text-align:center;cursor:pointer;'
    + 'transition:transform var(--casora-dur-feedback,160ms)}'
    + '.b:active,.x:active{transform:scale(var(--casora-press-scale,.97))}'
    + '.b:focus-visible,.x:focus-visible{outline:2px solid var(--casora-popup-ui-action, var(--casora-accent, #276B64));outline-offset:2px}'
    + '.pri{background:var(--casora-popup-ui-action, var(--casora-accent, #276B64));color:var(--casora-popup-ui-on-action, #fff)}'
    + '.sec{background:var(--casora-soft-control-fill, rgba(127,127,127,.14));color:var(--casora-popup-tiles-text-primary, var(--primary-text-color))}'
    // Phone: a sheet from the bottom edge, as the v3 popups there.
    + '@media (max-width: 600px){.layer{align-items:flex-end;padding:56px 0 0}'
    + '.sheet{width:100vw;border-radius:var(--casora-popup-radius, 38px) var(--casora-popup-radius, 38px) 0 0;'
    + 'padding-bottom:env(safe-area-inset-bottom, 0px);animation-name:dd-up}'
    + '.head{padding:22px 22px 12px}.body{padding:0 22px}.foot{padding:14px 22px 18px}}'
    + '@keyframes dd-up{from{transform:translateY(100%)}to{transform:none}}'
    + '@media (prefers-reduced-motion: reduce){.sheet{animation:none}.b{transition:none}}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var host = null;
  function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); D.close(); } }
  D.close = function () {
    if (!host) return;
    host.remove();
    host = null;
    document.removeEventListener('keydown', onKey, true);
  };
  D.open = function () {
    var text;
    try { text = D.format(D.measure()); } catch (e) { text = 'casora_display_diagnosis: failed (' + String(e && e.name || 'error').replace(/[^A-Za-z]/g, '') + ')'; }
    D.last = text;
    D.close();
    host = document.createElement('casora-display-diag');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('data-no-i18n', '');
    var root = host.attachShadow({ mode: 'open' });
    root.appendChild(el('style', null, CSS));
    var scrim = el('div', 'scrim');
    scrim.addEventListener('click', function () { D.close(); });
    var layer = el('div', 'layer');
    var sheet = el('div', 'sheet');
    var head = el('div', 'head');
    var title = el('h2', null, T('Anzeige-Diagnose'));
    title.id = 'dd-title';
    host.setAttribute('aria-labelledby', 'dd-title');
    var x = el('button', 'x');
    x.type = 'button';
    x.setAttribute('data-casora-diag', 'x');
    x.setAttribute('aria-label', T('Schließen'));
    // A fixed drawing, no data in it.
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" '
      + 'stroke-linecap="round" fill="none"/></svg>';
    x.addEventListener('click', function (ev) { ev.stopPropagation(); D.close(); });
    head.appendChild(title); head.appendChild(x);
    var body = el('div', 'body');
    var pre = el('pre', 'txt', text);
    var acts = el('div', 'acts');
    var copy = el('button', 'b pri', T('Kopieren'));
    copy.type = 'button';
    copy.setAttribute('data-casora-diag', 'copy');
    var close = el('button', 'b sec', T('Schließen'));
    close.type = 'button';
    close.setAttribute('data-casora-diag', 'close');
    copy.addEventListener('click', function (ev) {
      ev.stopPropagation();
      D.copy(text).then(function (ok) {
        if (!ok) {
          // No clipboard (HTTP, some apps): select the block so the person copies it by hand.
          try {
            var sel = W.getSelection(), rg = document.createRange();
            rg.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(rg);
          } catch (e) { /* nothing selectable */ }
        }
        copy.textContent = T(ok ? 'Kopiert' : 'Text markiert – jetzt kopieren');
        D.copied = ok;
        setTimeout(function () { copy.textContent = T('Kopieren'); }, 2500);
      });
    });
    close.addEventListener('click', function (ev) { ev.stopPropagation(); D.close(); });
    acts.appendChild(copy); acts.appendChild(close);
    body.appendChild(el('p', 'sub', T('Nur Anzeigedaten dieses Geräts, keine Namen oder Geräte. Kopieren und im GitHub-Issue einfügen.')));
    body.appendChild(pre);
    var foot = el('div', 'foot');
    foot.appendChild(acts);
    sheet.appendChild(head); sheet.appendChild(body); sheet.appendChild(foot);
    layer.appendChild(sheet);
    root.appendChild(scrim); root.appendChild(layer);
    (document.body || document.documentElement).appendChild(host);
    document.addEventListener('keydown', onKey, true);
    return true;
  };

  // Casora's version for the first line (casora/version needs no admin).
  function fetchVersion() {
    var h = hassOf();
    if (W.__casoraVersion || !h || !h.callWS) return Promise.resolve();
    return Promise.resolve(h.callWS({ type: 'casora/version' })).then(function (r) {
      if (r && r.version) W.__casoraVersion = r.version;
    }, function () { /* stays "?" */ });
  }
  // Waits until the dashboard has drawn (a Casora card on screen) and the layout settled, then measures.
  D.openWhenReady = function () {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        var drawn = pierce('button-card').some(function (b) { return /casora_(room|mobile_bg|mobile_weather)/.test(tplOf(b)) && box(b); });
        if (drawn || Date.now() - t0 > 20000) {
          fetchVersion().then(function () { setTimeout(function () { resolve(D.open()); }, drawn ? 1500 : 0); });
          return;
        }
        setTimeout(poll, 300);
      })();
    });
  };

  // ── Trigger 1: ?casora_diag in the address ─────────────────────────────────
  var opened = null;
  function fromUrl() {
    if (!D.wanted(location.search) || opened === location.href) return;
    opened = location.href;
    D.openWhenReady();
  }
  fromUrl();
  W.addEventListener('location-changed', function () { setTimeout(fromUrl, 0); });

  // ── Trigger 2: five quick taps on the page title ───────────────────────────
  // The title: #name / #n of the room card (desktop, tablet) and #name of casora_mobile_weather (phone).
  W.addEventListener('pointerup', function (ev) {
    if (ev.button > 0) return;
    var path = ev.composedPath ? ev.composedPath() : [];
    if (!D.isTitle(path)) { taps = []; return; }
    if (D.tap(Date.now())) fetchVersion().then(function () { D.open(); });
  }, true);
})();
