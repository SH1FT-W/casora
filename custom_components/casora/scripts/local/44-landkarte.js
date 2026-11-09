// ── Landkarte (community card, issue 159) ──────────────────────────────────────────────────────────────────────────
// The tile shows the map itself like the camera tile its picture (map_tile, default on; off: title and symbol). The map on
// the tile is HA's ha-map as a picture: no gestures, created when the tile is in view, stopped when it is gone, markers
// follow the states; if it cannot load the tile stays plain. The popup is Home Assistant's own map card, large: an S5
// stage across the wide popup (900 on a desktop, as the two-column popups, a sheet on the phone). No map service of
// Casora's own: HA brings the map tiles. Studio fields (variables of the tile): map_tile, map_entities (empty: all persons
// and zones), map_geo ('': none, 'all' or one source), map_hours (trail in hours, default 0), map_zoom (HA's default_zoom),
// map_theme ('': follows the theme, light, dark).
//   window._casoraMapCard.ids(states, vars)     → the entities on the map
//   window._casoraMapCard.sources(vars)         → geo_location_sources
//   window._casoraMapCard.hours(vars)           → hours_to_show
//   window._casoraMapCard.zoom(vars)            → default_zoom or null
//   window._casoraMapCard.ratio(vw, vh)         → aspect_ratio that fills the popup in this window
//   window._casoraMapCard.config(states, vars, vw, vh) → the map card's config
//   window._casoraMapCard.popup(states, hass, vars)    – the popup's cards
//   window._casoraMapCard.sec(part, data, states, el)  – the v3 parts (line, stage)
(function () {
  if (window._casoraMapCard) return;
  var M = window._casoraMapCard = {};
  var isDomain = function (id, dom) { return String(id).indexOf(dom + '.') === 0; };

  // Chosen entities still in HA; none chosen: every person, then every zone.
  M.ids = function (states, vars) {
    var S = states || {}, own = vars && vars.map_entities;
    if (Array.isArray(own) && own.length) return own.filter(function (id) { return typeof id === 'string' && !!S[id]; });
    var keys = Object.keys(S).sort();
    return keys.filter(function (k) { return isDomain(k, 'person'); }).concat(keys.filter(function (k) { return isDomain(k, 'zone'); }));
  };
  M.sources = function (vars) {
    var g = String((vars && vars.map_geo) || '').trim();
    return g ? [g] : [];
  };
  M.hours = function (vars) {
    var n = parseInt(vars && vars.map_hours, 10);
    return n > 0 ? n : 0;
  };
  M.zoom = function (vars) {
    var n = Number(vars && vars.map_zoom);
    return vars && vars.map_zoom !== undefined && vars.map_zoom !== null && vars.map_zoom !== '' && n >= 1 && n <= 20 ? n : null;
  };
  M.theme = function (vars) {
    var t = String((vars && vars.map_theme) || '');
    return t === 'light' || t === 'dark' ? t : 'auto';
  };
  // Width and height of the map in this window; the card only takes an aspect ratio.
  // Desktop: the popup is 900 wide (content 848), the map as high as the window leaves room for under the header. Phone:
  // the sheet, about two thirds of the screen high.
  M.ratio = function (vw, vh) {
    var w = vw > 0 ? vw : 1024, h = vh > 0 ? vh : 768;
    var narrow = w <= 760;
    var width = narrow ? Math.max(240, w - 28) : Math.min(900, w - 16) - 52;
    var height = narrow ? Math.min(Math.round(h * 0.66), h - 220) : Math.min(680, h - 230);
    return width + ':' + Math.max(narrow ? 260 : 320, height);
  };
  M.config = function (states, vars, vw, vh) {
    var c = { type: 'map', entities: M.ids(states, vars).map(function (id) { return { entity: id }; }),
      hours_to_show: M.hours(vars), theme_mode: M.theme(vars), aspect_ratio: M.ratio(vw, vh) };
    var geo = M.sources(vars), z = M.zoom(vars);
    if (geo.length) c.geo_location_sources = geo;
    if (z !== null) c.default_zoom = z;
    return c;
  };
  // HA's card refuses a config with neither entities nor sources.
  M.empty = function (states, vars) { return !M.ids(states, vars).length && !M.sources(vars).length; };

  M.sec = function (part, data, states, el) {
    var UI = window._casoraUI, S = states || {};
    if (!UI) return '';
    if (part === 'line') {
      var word = M.word(S, { map_entities: data || [] });
      return word ? UI.line(word, []) : '';
    }
    if (part === 'stage') {
      // The fallback rule (§4.7): nothing to show is a status stage, never an empty map.
      if (!data) return UI.stage('status', { icon: 'mdi:map-marker-off-outline', tone: 'off', text: 'Nichts auf der Karte', dial: false });
      if (window._casoraStageCard) window._casoraStageCard(el, data);
      var ar = String(data.aspect_ratio || '16:9').split(':');
      // Plain plate until the map is there (§9 „Lädt“); the map brings no border of its own, the stage rounds it. HA paints
      // its round entity markers with --card-background-color, which the popup sets to transparent: bring it back here.
      return UI.stage('image', { html: '<div data-casora-stage-card="" style="aspect-ratio:' + Number(ar[0]) + ' / ' + Number(ar[1]) + ';'
        + 'background:var(--casora-soft-row-fill, rgba(127,127,127,0.1));--ha-card-border-width:0;--ha-card-box-shadow:none;--ha-card-border-radius:0;'
        + '--card-background-color:var(--primary-background-color, #fff);"></div>' });
    }
    return '';
  };

  // ── Map on the tile ──────────────────────────────────────────────────────────────────────────────────────────────
  // Persons on the map, as a status: „1 von 4 zu Hause“; none: nothing.
  M.word = function (states, vars) {
    var S = states || {}, persons = M.ids(S, vars).filter(function (id) { return isDomain(id, 'person'); });
    if (!persons.length) return '';
    return persons.filter(function (id) { return S[id].state === 'home'; }).length + ' von ' + persons.length + ' zu Hause';
  };
  // Everything the map of the tile draws: the entities and the geo locations of the chosen sources.
  M.markers = function (states, vars) {
    var S = states || {}, src = M.sources(vars);
    var geo = src.length ? Object.keys(S).sort().filter(function (k) {
      return isDomain(k, 'geo_location') && (src[0] === 'all' || (S[k].attributes || {}).source === src[0]);
    }) : [];
    return M.ids(S, vars).concat(geo);
  };
  // The tile's field: a stable string, so a redraw of the tile keeps the element and its map.
  M.tileField = function (el, vars) {
    if (el) el._casoraMapVars = vars || null;
    return vars && vars.map_tile === false ? '' : '<casora-tile-map></casora-tile-map>';
  };
  // The people's bounding box for the map ([[west, south], [east, north]]), zones not counted; none located: null.
  M.bounds = function (states, ids) {
    var S = states || {}, lat = [], lon = [];
    (ids || []).forEach(function (id) {
      var a = !isDomain(id, 'zone') && S[id] && S[id].attributes;
      if (a && isFinite(parseFloat(a.latitude)) && isFinite(parseFloat(a.longitude))) { lat.push(parseFloat(a.latitude)); lon.push(parseFloat(a.longitude)); }
    });
    if (!lat.length) return null;
    return [[Math.min.apply(null, lon), Math.min.apply(null, lat)], [Math.max.apply(null, lon), Math.max.apply(null, lat)]];
  };
  // Room a fit keeps free: the pin stands above its point. Small tile: little padding, so nearby people spread out and do
  // not stack; markers smaller there too.
  M.padding = function (w, h) { return h < 170 ? { top: 34, bottom: 22, left: 20, right: 20 } : { top: 46, bottom: 36, left: 28, right: 28 }; };
  M.markerScale = function (h) { return h < 170 ? 0.58 : 0.68; };
  M.MAX_LIVE = 4;       // WebGL maps at once; a tile over the limit stays plain until another one stops
  M.MIN_HEIGHT = 100;   // below this (a small phone tile) a map shows nothing useful: plain tile
  M.LINGER_MS = 30000;  // a map out of view is kept this long (scrolling past), then stopped
  M.READY_MS = 12000;   // no tiles by then: the map cannot load, plain tile
  M.TICK_MS = 2000;
  var FLAG = 'data-casora-map';
  // On the button-card: over the map the name and status are white and the symbol gives way (the veil is in the layer).
  var TILE_CSS = ':host([' + FLAG + '="ok"]) #name,:host([' + FLAG + '="ok"]) #state{-webkit-text-fill-color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45)}'
    + ':host([' + FLAG + '="ok"]) #img-cell{visibility:hidden}';
  // Inside ha-map: no controls; the attribution the map's licence asks for stays, small, in the free corner.
  var MAP_CSS = '.maplibregl-ctrl-top-left,.maplibregl-ctrl-top-right,.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-scale,.maplibregl-ctrl-attrib-button{display:none!important}'
    + '.maplibregl-ctrl-bottom-right{right:0;bottom:0}'
    + '.maplibregl-ctrl-attrib{font-size:8px!important;line-height:1.2!important;padding:0 14px 3px 4px!important;margin:0!important;min-height:0!important;background:transparent!important;color:rgba(255,255,255,.72)!important}'
    + '.maplibregl-ctrl-attrib a{color:inherit!important}.maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-inner{display:block!important}'
    // HA's markers (48 px) are made for a full map; on a tile they would cover it (scale composes with MapLibre's transform).
    + 'ha-entity-marker{scale:var(--casora-marker-scale,.68);transform-origin:50% 100%}';
  var HANDLERS = ['dragPan', 'scrollZoom', 'boxZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'dragRotate', 'touchPitch'];
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var live = new Set(), waiting = new Set();
  M.liveCount = function () { return live.size; };

  var defineTile = function () {
    if (!window.customElements || customElements.get('casora-tile-map')) return;
    class TileMap extends HTMLElement {
      connectedCallback() {
        this.style.cssText = 'display:block;position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;';
        var root = this.getRootNode();
        this._host = root && root.host;
        if (root && root.querySelector && !root.querySelector('style[data-casora-map-css]')) {
          var st = document.createElement('style');
          st.setAttribute('data-casora-map-css', '');
          st.textContent = TILE_CSS;
          root.appendChild(st);
        }
        this._failed = false; this._vis = false; this._big = false;
        this._io = new IntersectionObserver((list) => { this._vis = list[list.length - 1].isIntersecting; this._update(); });
        this._io.observe(this);
        this._ro = new ResizeObserver(() => this._resized());
        this._ro.observe(this);
      }
      disconnectedCallback() {
        if (this._io) this._io.disconnect();
        if (this._ro) this._ro.disconnect();
        this._io = this._ro = null;
        this._vis = false;
        this._stop();
      }
      _resized() {
        this._big = this.getBoundingClientRect().height >= M.MIN_HEIGHT;
        this._update();
        if (this._ml) { try { this._ml.resize(); this._fit(); } catch (e) { /* being removed */ } }
      }
      _update() {
        var want = this._vis && this._big && !this._failed;
        if (want) {
          clearTimeout(this._linger); this._linger = null;
          if (!this._el && !this._starting) this._start();
        } else if (this._el || this._starting) {
          // Scrolled past: kept a little; too small or failed: stopped now.
          if (!this._big || this._failed) this._stop();
          else if (!this._linger) this._linger = setTimeout(() => { this._linger = null; this._stop(); }, M.LINGER_MS);
        }
      }
      _start() {
        if (live.size >= M.MAX_LIVE) { waiting.add(this); return; }
        waiting.delete(this);
        var H = window._casoraHaMap, hass = hassNow();
        if (!H || !hass || !H.ok()) { this._fail(); return; }
        this._starting = true;
        live.add(this);
        H.defined().then((ok) => {
          this._starting = false;
          if (!this.isConnected || !live.has(this)) return;
          if (!ok) { this._fail(); return; }
          this._build(hass);
        });
      }
      _build(hass) {
        var vars = (this._host && this._host._casoraMapVars) || {};
        var layer = document.createElement('div');
        layer.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity .35s ease;overflow:hidden;border-radius:inherit;';
        var m = document.createElement('ha-map');
        // HA's connection for a map outside HA's own context; without it there is no token (as in 12-tanken.js).
        m._connection = { connection: hass.connection, hassUrl: function (u) { return hass.hassUrl(u); } };
        this._ids = M.markers(hass.states, vars);
        this._hass = hass;
        this._word = M.word(hass.states, vars);
        m.entities = this._ids.slice();
        m.themeMode = M.theme(vars);
        m.zoom = M.zoom(vars) || 14;
        m.interactiveZones = false;
        m.autoFit = false;
        m.clusterMarkers = false;
        m.style.cssText = 'display:block;width:100%;height:100%;';
        var veil = document.createElement('div');
        veil.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to top,rgba(10,10,12,.82) 0%,rgba(10,10,12,.62) 32%,rgba(10,10,12,0) 66%);';
        layer.appendChild(m); layer.appendChild(veil);
        this.appendChild(layer);
        this._el = m; this._layer = layer;
        var t0 = Date.now(), H = window._casoraHaMap;
        var tiles = 0;
        this._wait = setInterval(() => {
          var ml = H.ml(m);
          if (ml && !this._ml) {
            this._ml = ml;
            HANDLERS.forEach(function (x) { if (ml[x] && ml[x].disable) ml[x].disable(); });
            if (m.shadowRoot) { var st = document.createElement('style'); st.textContent = MAP_CSS; m.shadowRoot.appendChild(st); }
            ml.on('data', function (e) { if (e && e.tile && (!e.tile.state || e.tile.state === 'loaded')) tiles++; });
            if (ml.queryRenderedFeatures && ml.loaded() && ml.queryRenderedFeatures().length) tiles++;
          }
          if (ml && tiles > 0 && ml.loaded()) {
            clearInterval(this._wait); this._wait = null;
            try { this._fit(); } catch (e) { /* no markers yet */ }
            layer.style.opacity = '1';
            if (this._host) this._host.setAttribute(FLAG, 'ok');
            this._tick = setInterval(() => this._sync(), M.TICK_MS);
            return;
          }
          if (Date.now() - t0 > M.READY_MS) this._fail();
        }, 150);
      }
      // The people in view with the tile's padding, or HA's own fit when nobody has a place yet.
      _fit() {
        var ml = this._ml, m = this._el, h = hassNow(), vars = (this._host && this._host._casoraMapVars) || {};
        if (!ml || !m) return;
        var r = this.getBoundingClientRect(), b = M.bounds(h && h.states, this._ids);
        m.style.setProperty('--casora-marker-scale', String(M.markerScale(r.height)));
        this._fitted = !!b;
        if (!b) { if (m.fitMap) m.fitMap(); return; }
        // MapLibre counts zoom one level lower than HA's option (512 px tiles, as in 12-tanken.js).
        ml.fitBounds(b, { padding: M.padding(r.width, r.height), maxZoom: (M.zoom(vars) || 14) - 1, duration: 0 });
      }
      // Keeps the tile's status current; the view stays where it was fitted.
      _sync() {
        var m = this._el, h = hassNow();
        if (!m || !h || h === this._hass || document.hidden) return;
        var vars = (this._host && this._host._casoraMapVars) || {};
        var ids = M.markers(h.states, vars), old = this._hass;
        var same = ids.length === this._ids.length && ids.every((x, i) => x === this._ids[i]);
        var changed = !same || ids.some(function (id) { return h.states[id] !== old.states[id]; });
        this._hass = h;
        if (!changed) return;
        // ha-map follows the states itself (HA's context); it only needs a new list when the entities change.
        if (!same) { this._ids = ids; m.entities = ids.slice(); }
        // Nobody had a place when the map came up: fit once somebody has one; after that the view stays.
        if (!this._fitted) { try { this._fit(); } catch (e) { /* being removed */ } }
        var w = M.word(h.states, vars);
        if (w !== this._word) { this._word = w; if (this._host && window.casoraKick) window.casoraKick(this._host); }
      }
      _fail() { this._failed = true; this._stop(); }
      _stop() {
        clearTimeout(this._linger); this._linger = null;
        clearInterval(this._wait); clearInterval(this._tick); this._wait = this._tick = null;
        this._starting = false;
        waiting.delete(this);
        if (this._host) this._host.removeAttribute(FLAG);
        if (this._layer) this._layer.remove();
        this._el = this._layer = this._ml = this._hass = null;
        if (live.delete(this)) Array.from(waiting).forEach(function (t) { t._update(); });
      }
    }
    customElements.define('casora-tile-map', TileMap);
  };
  defineTile();

  M.popup = function (states, hass, vars) {
    var K = window._casoraSoftKit, UI = window._casoraUI, S = states || {};
    if (!K || !UI || !UI.stage) return { type: 'vertical-stack', cards: [] };
    var vw = window.innerWidth, vh = window.innerHeight;
    var cfg = M.empty(S, vars) ? null : M.config(S, vars, vw, vh);
    var persons = M.ids(S, vars).filter(function (id) { return isDomain(id, 'person'); });
    var f = { stage: { card: K.secCard([], 'return window._casoraMapCard ? window._casoraMapCard.sec("stage", ' + JSON.stringify(cfg) + ', states, this) : "";', S) } };
    if (persons.length) f.line = { card: K.secCard(persons, 'return window._casoraMapCard ? window._casoraMapCard.sec("line", ' + JSON.stringify(persons) + ', states, this) : "";', S) };
    var ui = K.layout({ fields: f, top: ['line'], stage: 'stage', stageWide: true, left: [], right: [] });
    // The layout counts columns (one here) and would take the narrow 552 popup; this one is about the size of the map.
    if (cfg && vw > 760) ui.casora_cols = 2;
    return ui;
  };
})();
