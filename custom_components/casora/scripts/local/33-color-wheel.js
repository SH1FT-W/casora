// ── Color wheel page for the single light popup (variant B, 25.10.2026) ──────────────────────────
// The rainbow circle first in the light popup's color row (casora_light, data-casora-wheel="<light>") opens
// the page „Farbe“ in the same popup, with ‹ back to the light: a hue/saturation wheel like Home Assistant's
// (hue around, red at the right and clockwise, saturation from the white centre to the edge) and the
// brightness bar below. Tap or drag on the wheel sets hs_color; while dragging it sends at most every 250 ms.
//   window._casoraColorWheel.open(id)        → opens the page (false without popup or light)
//   window._casoraColorWheel.hsAt(dx, dy)    → [hue, saturation] for a point, dx/dy from the centre in radii
//   window._casoraColorWheel.posOf(hs)       → { x, y } in % of the wheel for [hue, saturation]
//   window._casoraColorWheel.hsOf(attrs)     → [hue, saturation] of a light: from rgb_color (some integrations
//                                              report hs_color [0, 0] next to a real rgb_color), else hs_color
//   <casora-color-wheel> (custom:casora-color-wheel, entity)  – the wheel as a card
(function () {
  if (window._casoraColorWheel && window._casoraColorWheel.v === 1) return;
  var CW = window._casoraColorWheel = { v: 1 };

  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };

  CW.hsAt = function (dx, dy) {
    var h = Math.atan2(dy, dx) * 180 / Math.PI;
    if (h < 0) h += 360;
    var s = Math.min(1, Math.sqrt(dx * dx + dy * dy)) * 100;
    return [Math.round(h) % 360, Math.round(s)];
  };
  CW.posOf = function (hs) {
    var r = (Number(hs[0]) || 0) * Math.PI / 180, s = Math.max(0, Math.min(100, Number(hs[1]) || 0)) / 100;
    return { x: 50 + Math.cos(r) * s * 50, y: 50 + Math.sin(r) * s * 50 };
  };

  CW.hsOf = function (a) {
    a = a || {};
    var c = a.rgb_color;
    if (Array.isArray(c) && c.length >= 3) {
      var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
      if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = Math.round(h * 60); if (h < 0) h += 360;
      return [h % 360, mx ? Math.round(d / mx * 100) : 0];
    }
    return Array.isArray(a.hs_color) ? [Number(a.hs_color[0]) || 0, Number(a.hs_color[1]) || 0] : null;
  };

  // Brightness bar of the page: the same slider as the light popup, filled in the lamp's color.
  CW.bright = function (entity) {
    var UI = window._casoraUI;
    if (!UI || !entity) return '';
    var a = entity.attributes || {}, on = entity.state === 'on';
    var pct = on && a.brightness != null ? Math.max(1, Math.round(a.brightness / 2.55)) : 0;
    var fill = Array.isArray(a.rgb_color) ? 'rgb(' + a.rgb_color.map(Number).join(',') + ')' : 'var(--casora-color-yellow, #FFCC00)';
    return '<style>ha-card.disabled{pointer-events:auto!important;}</style>'
      + '<div style="margin-top:22px;--casora-popup-slider-fill:' + UI.esc(fill) + ';--casora-popup-slider-icon:' + (on ? 'rgba(0,0,0,0.55)' : '#ffffff') + ';">'
      + UI.slider({ value: pct, icon: 'light', svc: { domain: 'light', service: 'turn_on', field: 'brightness_pct', target: { entity_id: entity.entity_id } } })
      + '</div>';
  };

  var card = function (id, body, pad) {
    return {
      type: 'custom:button-card', entity: id, triggers_update: [id],
      tap_action: { action: 'none' }, hold_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: '\n:host { --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-box-shadow: none !important; --ha-card-border-width: 0px !important; }' },
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: pad }],
        grid: [{ 'grid-template-areas': '"body"' }, { 'grid-template-columns': '1fr' }],
        custom_fields: { body: [{ 'justify-self': 'stretch' }, { 'min-width': '0' }] },
      },
      custom_fields: { body: body },
    };
  };

  CW.open = function (id) {
    var P = window.casoraPopup, h = hassNow();
    if (!P || !h || !h.states[id]) return false;
    var prev = P.current;
    var st = h.states[id];
    P.open({
      title: 'Farbe', eyebrow: (st.attributes && st.attributes.friendly_name) || id,
      content: { type: 'vertical-stack', cards: [
        { type: 'custom:casora-color-wheel', entity: id },
        card(id, '[[[ return window._casoraColorWheel ? window._casoraColorWheel.bright(entity) : ""; ]]]', '0 26px 22px 26px'),
      ] },
      back: prev ? function () { P.open(prev); } : null,
      dismiss_on_background: prev ? prev.dismiss_on_background !== false : true,
      style: prev && prev.style, popup_styles: prev && prev.popup_styles,
    });
    return true;
  };

  var CSS = ':host{display:block;}'
    + '.w{position:relative;width:min(300px,100%);aspect-ratio:1/1;margin:8px auto 0;border-radius:50%;cursor:crosshair;'
    +   'touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;'
    +   'background:radial-gradient(circle closest-side,#fff,rgba(255,255,255,0)),'
    +   'conic-gradient(from 90deg,hsl(0 100% 50%),hsl(60 100% 50%),hsl(120 100% 50%),hsl(180 100% 50%),hsl(240 100% 50%),hsl(300 100% 50%),hsl(360 100% 50%));}'
    + '.k{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;box-sizing:border-box;pointer-events:none;'
    +   'border:3px solid #fff;outline:1px solid rgba(0,0,0,.3);transition:left .18s ease,top .18s ease;}'
    + '.w.drag .k{transition:none;}'
    + '.k[hidden]{display:none;}'
    + '@media (prefers-reduced-motion:reduce){.k{transition:none;}}';

  class CasoraColorWheel extends HTMLElement {
    setConfig(c) { this._id = c && c.entity; }
    getCardSize() { return 6; }
    connectedCallback() {
      if (this._w) return;
      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="w" role="slider" aria-label="Farbe"><div class="k" hidden></div></div>';
      this._w = root.querySelector('.w');
      this._k = root.querySelector('.k');
      var self = this;
      var at = function (ev) {
        var b = self._w.getBoundingClientRect();
        var r = b.width / 2;
        return CW.hsAt((ev.clientX - b.left - r) / r, (ev.clientY - b.top - r) / r);
      };
      var sendT = 0, wait = null, last = null;
      var send = function (hs, now) {
        last = hs;
        var go = function () {
          wait = null; sendT = Date.now();
          var h = self._hass || hassNow();
          if (h && self._id) h.callService('light', 'turn_on', { hs_color: last }, { entity_id: self._id });
        };
        if (now || Date.now() - sendT > 250) { clearTimeout(wait); go(); }
        else if (!wait) wait = setTimeout(go, 250 - (Date.now() - sendT));
      };
      var move = function (ev) {
        var hs = at(ev);
        self._hold = Date.now() + 2500;   // HA reports the new color a moment later: no jump back meanwhile
        self._place(hs, 'hsl(' + hs[0] + ',100%,' + (100 - hs[1] / 2) + '%)');
        return hs;
      };
      this._w.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        window._casoraSuppressDismiss = Date.now() + 600;
        self._drag = true; self._w.classList.add('drag');
        try { self._w.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers: move events still arrive */ }
        send(move(ev));
      });
      this._w.addEventListener('pointermove', function (ev) { if (self._drag) send(move(ev)); });
      var end = function (ev) {
        if (!self._drag) return;
        self._drag = false; self._w.classList.remove('drag');
        window._casoraSuppressDismiss = Date.now() + 600;
        if (ev.type === 'pointerup') send(move(ev), true);
      };
      this._w.addEventListener('pointerup', end);
      this._w.addEventListener('pointercancel', end);
      // The popup closes on a downward swipe: a drag on the wheel is not one.
      ['touchstart', 'touchmove'].forEach(function (t) {
        self._w.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true });
      });
      this._paint();
    }
    set hass(h) { this._hass = h; this._paint(); }
    _place(hs, color) {
      var p = CW.posOf(hs);
      this._k.style.left = p.x + '%';
      this._k.style.top = p.y + '%';
      this._k.style.background = color;
      this._k.hidden = false;
    }
    _paint() {
      if (!this._w || !this._hass || this._drag || Date.now() < (this._hold || 0)) return;
      var st = this._hass.states[this._id];
      var a = (st && st.attributes) || {};
      var hs = CW.hsOf(a);
      if (!hs) { this._k.hidden = true; return; }
      this._place(hs, Array.isArray(a.rgb_color) ? 'rgb(' + a.rgb_color.map(Number).join(',') + ')' : '#fff');
      this._w.style.opacity = st.state === 'on' ? '' : '.55';
    }
  }
  if (!customElements.get('casora-color-wheel')) customElements.define('casora-color-wheel', CasoraColorWheel);

  // Tap on the rainbow circle: click, and on touch screens a touchend without movement (the click does not
  // always arrive inside the popup there); tapAt swallows the click echo.
  var tp = null, tapAt = 0;
  var fire = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.hasAttribute || !n.hasAttribute('data-casora-wheel')) continue;
      ev.preventDefault(); ev.stopPropagation();
      if (Date.now() - tapAt < 400) return;
      tapAt = Date.now();
      if (window.casoraHaptic) window.casoraHaptic('light');
      window._casoraSuppressDismiss = Date.now() + 600;
      CW.open(n.getAttribute('data-casora-wheel'));
      return;
    }
  };
  document.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null; }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (ev) {
    var t = ev.touches && ev.touches[0];
    if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener('click', fire, true);
  document.addEventListener('touchend', function (ev) { var moved = !!(tp && tp.moved); tp = null; if (!moved) fire(ev); }, true);
})();
