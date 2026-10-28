// ── Own badges (issue #53): any number of badges per room, from an entity or a Jinja template ──
// The Studio stores them in the room's variables (custom_badges: [{name, icon, color, entity | template, tap,
// navigate, navigate_filter, ask, users}]; tap 'run' runs a script, scene or button, ask: true asks first, #90;
// users: the HA user ids who see this badge, empty or missing = everyone, #90). The badge
// row of casora_room (and, derived from it, the phone room page; the phone's start page via
// casora_mobile_filter_badges) carries one card `custom:casora-custom-badges`, which draws one real button-card
// per entry with the template casora_badge_custom – so every entry looks and behaves like the built-in badges
// (pill, icon circle, haptic, "Who sees this?"), and the list has no upper limit.
//
//   window._casoraTemplates.watch(template, cb) → unsubscribe   one HA render_template subscription per template
//   window._casoraTemplates.text(template)      → last result or null (cached per template string)
//   window._casoraCustomBadge.view(badge, entity, value, hass) → what the template draws (title, sub, active …)
//   window._casoraCustomBadge.popupVars(badge) → the badge's own popup as the Universal tile's variables (#60)
//   window._casoraCustomBadge.sees(badge, user) → false when the badge's "Who sees this?" leaves this user out
//   <casora-custom-badges>  setConfig({badges, enabled, place}), .hass – the row card
//
// Tap "Own popup" (tap: 'own_popup', #60): the badge carries popup: {free_values, free_value_labels, free_chart,
// free_chart_entity, free_controls, popup_extra_cards, popup_extra_title} – the Universal tile's settings, composed in
// the Studio with the same fields. The badge card then also gets the template casora_popup_own_badge (built on
// casora_popup_free), so the popup is the Universal tile's (window._casoraFree.popup in 28-free-tile.js).
(function () {
  if (window._casoraTemplates) return;

  var hassOf = function () {
    try { var h = document.querySelector('home-assistant'); return (h && h.hass) || null; } catch (e) { return null; }
  };
  var asText = function (r) {
    if (r == null) return '';
    if (typeof r === 'object') { try { return JSON.stringify(r); } catch (e) { return String(r); } }
    return String(r);
  };
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ── Shared template subscriber ────────────────────────────────────────────────
  // One subscription per template string, shared by every badge that shows it (two rooms with the same
  // template cost one subscription). Released a moment after the last watcher left – a re-render of the row
  // (button-card builds its custom field cards anew) would otherwise unsubscribe and subscribe again.
  var subs = {};        // template → {text, error, cbs: Set, unsub: Promise|null, timer}
  var RELEASE_MS = 15000;

  var tell = function (s) {
    s.cbs.forEach(function (cb) { try { cb(s.text, s.error); } catch (e) { /* one badge must not stop the others */ } });
  };
  var start = function (s, tpl) {
    var h = hassOf();
    var c = h && h.connection;
    if (!c || typeof c.subscribeMessage !== 'function' || s.unsub) return;
    s.unsub = c.subscribeMessage(function (msg) {
      if (msg && typeof msg === 'object' && 'result' in msg) { s.text = asText(msg.result); s.error = null; }
      // report_errors: a broken template says so instead of staying empty forever.
      else if (msg && msg.error) { s.error = String(msg.error); if (s.text == null) s.text = ''; }
      else return;
      tell(s);
    }, { type: 'render_template', template: tpl, report_errors: true });
    s.unsub.catch(function (e) {
      s.unsub = null;
      s.error = String((e && (e.message || e.code)) || e || 'error'); s.text = '';
      tell(s);
    });
  };
  var stop = function (tpl) {
    var s = subs[tpl];
    if (!s || s.cbs.size) return;
    delete subs[tpl];
    if (s.unsub) s.unsub.then(function (u) { try { u(); } catch (e) { /* already gone */ } }).catch(function () {});
  };

  window._casoraTemplates = {
    // cb(text, error) on every result; returns the unsubscribe function.
    watch: function (tpl, cb) {
      tpl = String(tpl == null ? '' : tpl);
      if (!tpl.trim()) return function () {};
      var s = subs[tpl];
      if (!s) s = subs[tpl] = { text: null, error: null, cbs: new Set(), unsub: null, timer: null };
      if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      s.cbs.add(cb);
      if (s.text != null) { try { cb(s.text, s.error); } catch (e) { /* see above */ } }
      start(s, tpl);
      return function () {
        s.cbs.delete(cb);
        if (s.cbs.size || s.timer) return;
        s.timer = setTimeout(function () { s.timer = null; stop(tpl); }, RELEASE_MS);
      };
    },
    text: function (tpl) { var s = subs[String(tpl == null ? '' : tpl)]; return s && s.text != null ? s.text : null; },
    error: function (tpl) { var s = subs[String(tpl == null ? '' : tpl)]; return (s && s.error) || null; },
    // Connection lost (HA restart): subscribe again on the next watcher.
    reset: function () { Object.keys(subs).forEach(function (k) { subs[k].unsub = null; }); },
    _subs: subs,
    RELEASE_MS: RELEASE_MS,
  };

  // ── What one badge shows (template casora_badge_custom calls this) ─────────────
  // States that read as "off" – the badge then shows the inactive look (as the light badge does).
  var OFF = ['off', 'closed', 'locked', 'not_home', 'away', 'idle', 'standby', 'disarmed', 'paused', 'docked',
    'false', 'no', 'none', '0', '', 'unavailable', 'unknown', 'aus', 'nein', 'zu', 'geschlossen'];
  var DEAD = ['unavailable', 'unknown', 'none', ''];
  var TEAL = 'var(--casora-color-teal, #4E9E95)';
  var POPUP_KEYS = ['free_values', 'free_value_labels', 'free_chart', 'free_chart_entity', 'free_controls', 'popup_extra_cards', 'popup_extra_title'];

  var stateText = function (e, hass) {
    var raw = String(e.state == null ? '' : e.state);
    try { if (hass && typeof hass.formatEntityState === 'function') { var f = hass.formatEntityState(e); if (f) return f; } } catch (x) { /* raw */ }
    var n = parseFloat(raw);
    if (isFinite(n) && String(n) === raw.trim()) {
      var u = (e.attributes && e.attributes.unit_of_measurement) || '';
      var txt = window.casoraNum ? window.casoraNum(n, 0, 2) : String(n);
      return u ? txt + ' ' + u : txt;
    }
    var W = { on: 'An', off: 'Aus', open: 'Geöffnet', closed: 'Geschlossen', locked: 'Verriegelt', unlocked: 'Entriegelt',
      home: 'Zuhause', not_home: 'Unterwegs', unavailable: 'Nicht verfügbar', unknown: 'Unbekannt' };
    return W[raw] || (raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' '));
  };

  window._casoraCustomBadge = {
    OFF: OFF,
    esc: esc,
    // "Who sees this?" of one badge (#90), as a tile's: users lists who sees it, none = everyone.
    sees: function (b, user) {
      var l = b && b.users;
      if (!Array.isArray(l) || !l.length) return true;
      return !!(user && user.id && l.indexOf(user.id) !== -1);
    },
    // badge: the stored entry; entity: the state object (entity badges); value: template result or null (loading).
    view: function (b, entity, value, hass) {
      b = b && typeof b === 'object' ? b : {};
      var isTpl = typeof b.template === 'string' && b.template.trim() !== '' && !b.entity;
      var icon = String(b.icon || '').trim();
      var out = { hide: false, title: String(b.name || '').trim(), sub: '', active: true, tpl: isTpl,
        mdi: /^mdi:/.test(icon) ? icon : '', svg: '', color: String(b.color || '').trim() || TEAL };
      if (!out.mdi && icon && /^[\w-]+$/.test(icon) && typeof window.casoraIconUrl === 'function') out.svg = window.casoraIconUrl(icon);
      if (isTpl) {
        if (!out.svg && !out.mdi && typeof window.casoraIconUrl === 'function') out.svg = window.casoraIconUrl('default');
        if (!out.title) out.title = 'Badge';
        if (value == null) { out.sub = '…'; out.active = false; return out; }
        var v = String(value).trim();
        out.sub = v || '—';
        out.active = OFF.indexOf(v.toLowerCase()) === -1;
        return out;
      }
      var st = entity && entity.entity_id ? String(entity.state == null ? '' : entity.state).trim().toLowerCase() : '';
      // On tap: Run it (#86, #90) reads like the tile: a script "Bereit", while it runs "Läuft"; a scene or button
      // "Bereit" instead of its last-run time, also before its first run ("unknown"). Unavailable still hides it.
      var runs = String(b.tap || '') === 'run' && entity && entity.entity_id && window.casoraRunService
        && !!window.casoraRunService(String(entity.entity_id)) && st !== 'unavailable';
      if (runs) {
        if (!out.title) out.title = (entity.attributes && entity.attributes.friendly_name) || entity.entity_id;
        var going = /^script\./.test(String(entity.entity_id)) && st === 'on';
        out.sub = going ? 'Läuft' : 'Bereit';
        out.active = /^script\./.test(String(entity.entity_id)) ? going : true;
        return out;
      }
      if (!entity || !entity.entity_id || DEAD.indexOf(st) !== -1) { out.hide = true; return out; }
      if (!out.title) out.title = (entity.attributes && entity.attributes.friendly_name) || entity.entity_id;
      out.sub = stateText(entity, hass);
      out.active = isFinite(parseFloat(st)) ? true : OFF.indexOf(st) === -1;
      return out;
    },
    html: function (v) {
      return '<div class="badge-wrap"><div class="badge-title"><span data-no-i18n>' + esc(v.title) + '</span></div>'
        + (v.sub ? '<div class="badge-sub">' + (v.tpl ? '<span data-no-i18n>' + esc(v.sub) + '</span>' : esc(v.sub)) + '</div>' : '') + '</div>';
    },
    // Studio settings of the own popup, flat as the Universal tile's variables (and casoraPopupExtras) read them.
    hasPopup: function (b) { return !!(b && typeof b === 'object' && b.tap === 'own_popup'); },
    popupVars: function (b) {
      var p = b && b.popup && typeof b.popup === 'object' && !Array.isArray(b.popup) ? b.popup : {};
      var out = {};
      POPUP_KEYS.forEach(function (k) { if (p[k] !== undefined && p[k] !== null && p[k] !== '') out[k] = p[k]; });
      if (!b.entity && typeof b.template === 'string' && b.template.trim()) out.free_template = b.template;
      return out;
    },
    popupTitle: function (b, entity) {
      var n = String((b && b.name) || '').trim();
      return n || (entity && entity.attributes && entity.attributes.friendly_name) || (entity && entity.entity_id) || 'Badge';
    },
    // tap_action of one badge: own_popup = the template's popup action (null: nothing of its own); popup = HA more-info (Casora routes it to the device's page, casora-core.js),
    // navigate = the room's page (phone: its filter), else nothing.
    tap: function (b, place) {
      b = b && typeof b === 'object' ? b : {};
      var t = String(b.tap || '');
      if (t === 'navigate' && b.navigate) {
        if (place === 'phone' && b.navigate_filter) return { action: 'fire-dom-event', casora_filter: String(b.navigate_filter), haptic: 'light' };
        var dash = String((typeof location !== 'undefined' && location.pathname) || '').split('/')[1] || 'lovelace';
        return { action: 'navigate', navigation_path: '/' + dash + '/' + String(b.navigate).replace(/^\/+/, ''), haptic: 'light' };
      }
      if (t === 'own_popup') return null;
      if (t === 'popup' && b.entity) return { action: 'more-info', entity: String(b.entity), haptic: 'light' };
      // run (#90): a script, scene or button runs; casora_run lets the confirmation (casora-core.js) see past the
      // template's popup config, which button-card merges into this tap_action.
      var svc = t === 'run' && b.entity && window.casoraRunService ? window.casoraRunService(String(b.entity)) : '';
      if (svc) return { action: 'call-service', service: svc, service_data: { entity_id: String(b.entity) }, casora_run: true, haptic: 'medium' };
      return { action: 'none' };
    },
  };

  // ── Row card: one button-card per badge ───────────────────────────────────────
  var keyOf = function (b, i) { try { return i + ':' + JSON.stringify(b); } catch (e) { return i + ':' + String(b); } };
  var cardConfig = function (b, i, place, text) {
    var CB = window._casoraCustomBadge;
    var own = CB.hasPopup(b);
    // The popup settings travel as flat variables only (as on a tile): button-card evaluates variables deeply, a
    // pasted card's [[[ ]]] inside variables.badge would run twice.
    var shown = b;
    if (own || (b && b.popup)) { shown = Object.assign({}, b); delete shown.popup; }
    var cfg = {
      type: 'custom:button-card',
      template: own ? ['casora_badge_custom', 'casora_popup_own_badge'] : 'casora_badge_custom',
      variables: Object.assign({ badge: shown, index: i, place: place || 'room', value: text == null ? null : text }, own ? CB.popupVars(b) : {}),
    };
    var tap = CB.tap(b, place);
    if (tap) cfg.tap_action = tap;
    // Same switch as a tile's "Ask before switching" (casora-core.js reads it from the card's variables).
    if (tap && tap.casora_run && b.ask === true) cfg.variables.confirm_toggle = true;
    if (b && typeof b.entity === 'string' && b.entity) cfg.entity = b.entity;
    return cfg;
  };
  var helpers = null;
  var cardHelpers = function () {
    if (helpers) return helpers;
    helpers = (window.loadCardHelpers ? window.loadCardHelpers() : Promise.reject(new Error('no card helpers')))
      .catch(function (e) { helpers = null; throw e; });
    return helpers;
  };

  class CasoraCustomBadges extends HTMLElement {
    constructor() {
      super();
      this._items = [];      // [{key, badge, el, cfg, text, err, unwatch, watched}]
      this._config = { badges: [], place: 'room' };
      this._hass = null;
    }
    setConfig(cfg) {
      cfg = cfg || {};
      var list = Array.isArray(cfg.badges) ? cfg.badges.filter(function (b) {
        return b && typeof b === 'object' && ((typeof b.entity === 'string' && b.entity) || (typeof b.template === 'string' && b.template.trim()));
      }) : [];
      var on = cfg.enabled === undefined || cfg.enabled === null || cfg.enabled === true || cfg.enabled === 'true' || cfg.enabled === 1;
      this._all = on ? list : [];
      this._place = cfg.place || 'room';
      this._seen();
      this.style.display = 'contents';
      this._sync();
    }
    // Only the badges this HA user sees (per badge "Who sees this?", #90); the user may arrive after setConfig.
    _seen() {
      var h = this._hass || hassOf();
      var u = (h && h.user) || null;
      this._uid = (u && u.id) || '';
      var CB = window._casoraCustomBadge;
      this._config = { badges: (this._all || []).filter(function (b) { return CB.sees(b, u); }), place: this._place || 'room' };
    }
    get hass() { return this._hass; }
    set hass(h) {
      this._hass = h;
      var uid = (h && h.user && h.user.id) || '';
      if (this._all && uid !== this._uid) { this._seen(); this._sync(); }
      this._items.forEach(function (it) { if (it.el) it.el.hass = h; });
    }
    getCardSize() { return 1; }
    connectedCallback() { this._sync(); }
    disconnectedCallback() {
      // Gone from the page: release the template subscriptions (shared ones stay alive for the other rows).
      this._items.forEach(function (it) { if (it.unwatch) it.unwatch(); it.unwatch = null; it.watched = false; });
    }
    _sync() {
      var self = this;
      var list = this._config.badges || [];
      var place = this._config.place;
      var want = list.map(function (b, i) { return keyOf(b, i); });
      this._items = this._items.filter(function (it) {
        if (want.indexOf(it.key) !== -1) return true;
        if (it.unwatch) it.unwatch();
        if (it.el && it.el.parentNode === self) self.removeChild(it.el);
        return false;
      });
      list.forEach(function (b, i) {
        var key = want[i];
        var it = self._items.filter(function (x) { return x.key === key; })[0];
        if (!it) {
          it = { key: key, badge: b, el: null, text: null, err: false, unwatch: null, watched: false };
          self._items.push(it);
          self._build(it, i, place);
        }
        if (!it.watched && b.template && !b.entity && self.isConnected) {
          it.watched = true;
          it.unwatch = window._casoraTemplates.watch(b.template, function (text, error) {
            var v = error ? '' : text;
            if (it.text === v && it.err === !!error) return;
            it.text = v; it.err = !!error;
            self._apply(it, i, place);
          });
        }
      });
      this._items.sort(function (a, b) { return want.indexOf(a.key) - want.indexOf(b.key); });
      this._items.forEach(function (it) { if (it.el && it.el.parentNode !== self) self.appendChild(it.el); });
    }
    _build(it, i, place) {
      var self = this;
      it.cfg = cardConfig(it.badge, i, place, it.text);
      cardHelpers().then(function (h) {
        if (self._items.indexOf(it) === -1) return;   // removed meanwhile
        var el = h.createCardElement(it.cfg);
        el.classList.add('casora-custom-badge');
        if (self._hass) el.hass = self._hass;
        it.el = el;
        self._sync();
      }).catch(function () { /* without card helpers no badges – the row stays as it is */ });
    }
    _apply(it, i, place) {
      it.cfg = cardConfig(it.badge, i, place, it.text);
      if (!it.el || typeof it.el.setConfig !== 'function') return;
      try { it.el.setConfig(it.cfg); } catch (e) { return; }
      if (this._hass) it.el.hass = this._hass;
    }
  }
  // Popup header of an own popup: the badge's colour and icon, sand when the badge looks off (DP-15).
  var ownView = function (src, key) {
    if (!/\bcasora_popup_own_badge\b/.test(String(key || '')) || !src || !src._config) return null;
    var V = src._config.variables || {};
    return window._casoraCustomBadge.view(V.badge, src._stateObj || null, V.value, src._hass || hassOf());
  };
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    var v = ownView(src, key);
    return v ? { hue: v.color, off: !v.active } : null;
  });
  var prevRingUrl = window.casoraRingUrl;
  window.casoraRingUrl = function (src, key) {
    var v = ownView(src, key);
    if (v && v.svg) return v.svg;
    return typeof prevRingUrl === 'function' ? prevRingUrl(src, key) : null;
  };
  // mdi icon of the badge, else the device's own (the badge draws HA's state icon, which names none).
  var prevRingGlyph = window.casoraRingGlyph;
  window.casoraRingGlyph = function (src, key) {
    var v = ownView(src, key);
    if (v) {
      if (v.mdi) return v.mdi;
      var st = src._stateObj;
      if (st && window._casoraZiele && window._casoraZiele.iconOf) return window._casoraZiele.iconOf(st);
      if (st && st.attributes && st.attributes.icon) return st.attributes.icon;
    }
    return typeof prevRingGlyph === 'function' ? prevRingGlyph(src, key) : null;
  };

  if (!customElements.get('casora-custom-badges')) customElements.define('casora-custom-badges', CasoraCustomBadges);
})();
