// ── Own badges (issue #53): any number of badges per room, from an entity or a Jinja template ──
// The Studio stores them in the room's variables (custom_badges: [{name, icon, color, entity | template, tap,
// navigate, navigate_filter}]). The badge row of casora_room (and, derived from it, the phone room page; the
// phone's start page via casora_mobile_filter_badges) carries one card `custom:casora-custom-badges`, which draws
// one real button-card per entry with the template casora_badge_custom – so every entry looks and behaves like the
// built-in badges (pill, icon circle, haptic, "Who sees this?"), and the list has no upper limit.
//
//   window._casoraTemplates.watch(template, cb) → unsubscribe   one HA render_template subscription per template
//   window._casoraTemplates.text(template)      → last result or null (cached per template string)
//   window._casoraCustomBadge.view(badge, entity, value, hass) → what the template draws (title, sub, active …)
//   <casora-custom-badges>  setConfig({badges, enabled, place}), .hass – the row card
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
    // tap_action of one badge: popup = HA more-info (Casora routes it to the device's page, casora-core.js),
    // navigate = the room's page (phone: its filter), else nothing.
    tap: function (b, place) {
      b = b && typeof b === 'object' ? b : {};
      var t = String(b.tap || '');
      if (t === 'navigate' && b.navigate) {
        if (place === 'phone' && b.navigate_filter) return { action: 'fire-dom-event', casora_filter: String(b.navigate_filter), haptic: 'light' };
        var dash = String((typeof location !== 'undefined' && location.pathname) || '').split('/')[1] || 'lovelace';
        return { action: 'navigate', navigation_path: '/' + dash + '/' + String(b.navigate).replace(/^\/+/, ''), haptic: 'light' };
      }
      if (t === 'popup' && b.entity) return { action: 'more-info', entity: String(b.entity), haptic: 'light' };
      return { action: 'none' };
    },
  };

  // ── Row card: one button-card per badge ───────────────────────────────────────
  var keyOf = function (b, i) { try { return i + ':' + JSON.stringify(b); } catch (e) { return i + ':' + String(b); } };
  var cardConfig = function (b, i, place, text) {
    var cfg = {
      type: 'custom:button-card',
      template: 'casora_badge_custom',
      variables: { badge: b, index: i, place: place || 'room', value: text == null ? null : text },
      tap_action: window._casoraCustomBadge.tap(b, place),
    };
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
      this._config = { badges: on ? list : [], place: cfg.place || 'room' };
      this.style.display = 'contents';
      this._sync();
    }
    get hass() { return this._hass; }
    set hass(h) {
      this._hass = h;
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
  if (!customElements.get('casora-custom-badges')) customElements.define('casora-custom-badges', CasoraCustomBadges);
})();
