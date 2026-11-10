// Faint day-history behind a tile's glass, and small extra readings on the tile.
// Studio, on the tile: "Day history in the background" (history_bg) and
// "Extra on the tile" (tile_info, a list of entities). Both stay off until set.
// A switch draws when it was on. A number draws its range. Nothing here takes a tap.
(function () {
  if (typeof window === 'undefined') return;

  var ON = { on: 1, open: 1, unlocked: 1, home: 1, heat: 1, cool: 1, heat_cool: 1,
    dry: 1, fan_only: 1, playing: 1, cleaning: 1, active: 1, 'true': 1 };
  var OFF = { off: 1, closed: 1, locked: 1, not_home: 1, idle: 1, 'false': 1,
    unavailable: 1, unknown: 1, none: 1 };

  function sample(state) {
    var s = String(state == null ? '' : state).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ON, s)) return 1;
    if (s === '' || Object.prototype.hasOwnProperty.call(OFF, s)) return 0;
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // events: [{t, v}] already sampled. Times outside the window only carry the value in.
  // Points are {t: 0..1, v: 0..1}. A switch stays 0 or 1. A number is stretched to its range.
  function shape(events, start, end) {
    var span = end - start;
    if (!(span > 0)) return [];
    var rows = (events || []).filter(function (e) {
      return e && isFinite(e.t) && isFinite(e.v);
    }).sort(function (a, b) { return a.t - b.t; });
    if (!rows.length) return [];
    var binary = rows.every(function (e) { return e.v === 0 || e.v === 1; });
    var lo = 0, hi = 1;
    if (!binary) {
      lo = rows[0].v;
      hi = rows[0].v;
      rows.forEach(function (e) { if (e.v < lo) lo = e.v; if (e.v > hi) hi = e.v; });
      if (!(hi > lo)) { lo -= 1; hi += 1; }
    }
    var nrm = function (v) { return (v - lo) / (hi - lo); };
    var v = rows[0].v;
    rows.forEach(function (e) { if (e.t <= start) v = e.v; });
    var pts = [{ t: 0, v: nrm(v) }];
    rows.forEach(function (e) {
      if (e.t <= start || e.t > end) return;
      var x = (e.t - start) / span;
      pts.push({ t: x, v: nrm(v) });
      v = e.v;
      pts.push({ t: x, v: nrm(v) });
    });
    pts.push({ t: 1, v: nrm(v) });
    return pts;
  }

  // The line lives in the lower half of the card, behind the name. Off sits
  // near the bottom, on rises, and the card's own glass stays visible around it.
  function yOf(v, h) { return h * (0.9 - v * 0.38); }

  // The line along the samples. The area is that line closed down to the bottom,
  // so a fade can sit under it the way mini-graph-card does (fill: fade).
  function line(pts, w, h) {
    if (!pts || !pts.length) return '';
    var d = 'M' + (pts[0].t * w).toFixed(2) + ' ' + yOf(pts[0].v, h).toFixed(2);
    for (var i = 1; i < pts.length; i++) {
      d += 'L' + (pts[i].t * w).toFixed(2) + ' ' + yOf(pts[i].v, h).toFixed(2);
    }
    return d;
  }

  function area(pts, w, h) {
    var d = line(pts, w, h);
    return d ? d + 'L' + w + ' ' + h + 'L0 ' + h + 'Z' : '';
  }

  function chip(state) {
    if (!state || state.state == null) return '';
    var s = String(state.state);
    if (s === 'unavailable' || s === 'unknown' || s === '') return '';
    var unit = (state.attributes && state.attributes.unit_of_measurement) || '';
    var n = parseFloat(s);
    var val = isFinite(n) && s !== 'on' && s !== 'off'
      ? (Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10))
      : s;
    return val + unit;
  }

  var api = window._casoraTileGlass || {};
  api.sample = sample;
  api.shape = shape;
  api.line = line;
  api.area = area;
  api.chip = chip;
  window._casoraTileGlass = api;
  if (!window.document || window.document.nodeType !== 9) return;
  if (api._booted) return;
  api._booted = true;

  var DAY = 86400000;
  var cache = {};
  var esc = window.casoraEsc || function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function hass() {
    var ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  }

  function varsOf(card) {
    var c = card && card._config;
    return (c && c.variables) || {};
  }

  function wants(card) {
    var v = varsOf(card);
    var hist = v.history_bg === true || v.history_bg === 'true';
    var info = Array.isArray(v.tile_info) ? v.tile_info.filter(Boolean) : [];
    return hist || info.length ? { hist: hist, info: info, id: (card._config && card._config.entity) || '' } : null;
  }

  function haCard(card) {
    return card.shadowRoot && card.shadowRoot.querySelector('ha-card');
  }

  function ensure(card) {
    var host = haCard(card);
    var root = card.shadowRoot;
    if (!host || !root) return null;
    if (!root.querySelector('style.cs-glass-css')) {
      var style = document.createElement('style');
      style.className = 'cs-glass-css';
      // Inside the tile's shadow root. A style on the page never reaches in here,
      // and an unstyled SVG path is black.
      style.textContent = [
        '.cs-glass{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit;',
        'color:var(--casora-icon-color-current,var(--casora-tone-general,var(--casora-color-teal,var(--accent-color))));}',
        '.cs-glass .cs-fill{fill:currentColor;fill-opacity:.34;}',
        '.cs-glass .cs-line{fill:none;stroke:color-mix(in srgb,currentColor 68%,#000);stroke-width:1.75;',
        'stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;}',
        'ha-card > :not(.cs-glass){position:relative;z-index:1;}',
        '.cs-glass svg{position:absolute;inset:0;width:100%;height:100%;display:block;}',
        '.cs-chips{position:absolute;right:14px;bottom:14px;z-index:3;display:flex;flex-direction:column;',
        'align-items:flex-end;gap:4px;max-width:46%;pointer-events:none;}',
        '.cs-chip{font-size:11px;font-weight:600;line-height:1.2;letter-spacing:-.01em;',
        'color:rgba(255,255,255,.88);background:rgba(255,255,255,.14);',
        'border-radius:999px;padding:3px 8px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
        'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      ].join('');
      root.appendChild(style);
    }
    var layer = host.querySelector(':scope > .cs-glass');
    if (layer) return layer;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    layer = document.createElement('div');
    layer.className = 'cs-glass';
    layer.innerHTML = '<svg viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true"></svg><div class="cs-chips"></div>';
    host.insertBefore(layer, host.firstChild);
    return layer;
  }

  function paint(layer, pts) {
    var svg = layer.querySelector('svg');
    var ln = line(pts, 100, 48);
    var ar = area(pts, 100, 48);
    if (!ln) { svg.innerHTML = ''; return; }
    // Theme colour under the line, a darker stroke along the top. Classes, so the
    // shadow root's own style supplies them.
    svg.innerHTML = '<path class="cs-fill" d="' + ar + '"/>'
      + '<path class="cs-line" d="' + ln + '"/>';
  }

  function paintChips(layer, h, ids) {
    var box = layer.querySelector('.cs-chips');
    var html = '';
    (ids || []).forEach(function (id) {
      var text = chip(h && h.states && h.states[id]);
      if (!text) return;
      var name = (h.states[id].attributes && h.states[id].attributes.friendly_name) || id;
      html += '<span class="cs-chip" title="' + esc(name) + '">' + esc(text) + '</span>';
    });
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // A climate's own state is "heat" all day, which draws a block. The graph follows
  // the temperature instead: the tile's sensor, else current_temperature.
  function sourceOf(card, h) {
    var v = varsOf(card);
    var id = (card._config && card._config.entity) || '';
    if (v.temp_sensor && h && h.states && h.states[v.temp_sensor]) return { id: v.temp_sensor, attr: '' };
    if (id.indexOf('climate.') === 0) return { id: id, attr: 'current_temperature' };
    return { id: id, attr: '' };
  }

  function take(id, attr, done) {
    var key = id + '|' + (attr || '');
    var hit = cache[key];
    if (hit && Date.now() - hit.at < 300000) { done(hit.rows); return; }
    if (hit && hit.pending) { hit.wait.push(done); return; }
    var h = hass();
    if (!h || !h.connection || !h.connection.subscribeMessage) { done([]); return; }
    var rows = [];
    var wait = [done];
    cache[key] = { at: 0, rows: [], pending: true, wait: wait };
    var finish = function () {
      var c = cache[key];
      if (!c) return;
      c.pending = false;
      c.at = Date.now();
      c.rows = rows;
      var q = c.wait.splice(0);
      q.forEach(function (fn) { fn(rows); });
    };
    var timer = null;
    h.connection.subscribeMessage(function (msg) {
      var st = (msg && msg.states) || {};
      Object.keys(st).forEach(function (e) {
        if (e !== id) return;
        (st[e] || []).forEach(function (x) {
          var raw = attr ? (x.a && x.a[attr]) : (x.s != null ? x.s : x.state);
          if (attr && (raw == null || raw === '')) return;
          var t = (x.lu || x.lc || 0) * 1000;
          if (!(t > 0) && x.last_changed) t = Date.parse(x.last_changed);
          rows.push({ t: t, v: sample(raw) });
        });
      });
      clearTimeout(timer);
      timer = setTimeout(function () {
        var c = cache[key];
        if (c && c.unsub) { try { c.unsub(); } catch (e) { /* already closed */ } }
        finish();
      }, 500);
    }, {
      type: 'history/stream',
      entity_ids: [id],
      start_time: new Date(Date.now() - DAY).toISOString(),
      minimal_response: !attr,
      no_attributes: !attr,
      significant_changes_only: false,
    }).then(function (unsub) {
      var c = cache[key];
      if (!c || !c.pending) { try { unsub(); } catch (e) { /* late */ } return; }
      c.unsub = unsub;
    }).catch(function () { finish(); });
  }

  function apply(card) {
    var spec = wants(card);
    var host = haCard(card);
    if (!host) return;
    if (!spec) {
      var old = host.querySelector(':scope > .cs-glass');
      if (old) old.remove();
      return;
    }
    var layer = ensure(card);
    if (!layer) return;
    var h = hass();
    paintChips(layer, h, spec.info);
    if (!spec.hist || !spec.id) { paint(layer, []); return; }
    var src = sourceOf(card, h);
    var end = Date.now();
    take(src.id, src.attr, function (rows) {
      if (!card.isConnected) return;
      paint(layer, shape(rows, end - DAY, end));
    });
  }

  function pass() {
    if (/^\/casora-studio/.test(location.pathname)) return;
    var seen = [];
    var walk = function (root, d) {
      if (!root || d > 12 || !root.querySelectorAll) return;
      var cards = root.querySelectorAll('button-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (seen.indexOf(card) !== -1) continue;
        seen.push(card);
        var tpl = [].concat((card._config && card._config.template) || []);
        if (tpl.some(function (t) { return String(t).indexOf('casora_') === 0; })) apply(card);
      }
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot, d + 1);
    };
    walk(document, 0);
  }

  setInterval(pass, 3000);
  window.addEventListener('location-changed', function () { setTimeout(pass, 400); });
  setTimeout(pass, 800);
})();
