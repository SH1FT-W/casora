// ── Covers in "Security" (#76) ───────────────────────────────────────────────────────────────
// Opt-in: Settings › Home & Devices › Security picks the covers that count for security
// (CASORA_SETTINGS.security.covers); without any, nothing changes. "Evening and night only" (on by default,
// stored only as covers_night: false) counts them from sunset to sunrise (sun.sun below_horizon; without
// sun.sun always). A selected cover is open when it is not fully closed: state other than closed, or
// current_position above 0. Unavailable/unknown covers are left out of the count (as the cover badge
// hides itself then) and listed in the popup as unavailable. Garage doors, gates and doors (device_class
// garage/gate/door) already count as "Tor offen" in the security badge and are left out here.
//   C.cfg()                                   → { ids, night }
//   C.isOpen(st)                              → true | false | null (null = unavailable/unknown)
//   C.isNight(states)                         → true from sunset to sunrise, true without sun.sun
//   C.scan(states, hass, user)                → { on, active, ids, open, closed, dead, count }
//   C.count(states, hass, user, v, where)     → open covers that count now on Home (0 elsewhere/by day/off)
//   C.show(states, hass, user, v, where)      → sub-badge "Jalousien" visible (Home, counting, ≥ 1 open)
//   C.popup(states, hass, variables)          – popup casora_popup_security_covers
//   C.sec(part, cfg, states, hass)            – live parts (hero, list)
(function () {
  if (window._casoraSecCovers && window._casoraSecCovers.v === 1) return;
  var C = window._casoraSecCovers = { v: 1 };

  var low = function (x) { return String(x == null ? '' : x).trim().toLowerCase(); };
  // Counted as gates by the security badge already (casora_badge_security_group).
  var GATE = ['garage', 'gate', 'door'];
  C.GATE = GATE;

  C.cfg = function () {
    var s = ((window.CASORA_SETTINGS || {}).security) || {};
    var ids = (Array.isArray(s.covers) ? s.covers : []).filter(function (x, i, a) {
      return typeof x === 'string' && x.indexOf('cover.') === 0 && a.indexOf(x) === i;
    });
    return { ids: ids, night: s.covers_night !== false };
  };

  C.isOpen = function (st) {
    if (!st) return null;
    var s = low(st.state);
    if (!s || s === 'unavailable' || s === 'unknown') return null;
    var p = st.attributes && st.attributes.current_position;
    var pos = p == null || p === '' ? NaN : Number(p);
    return s !== 'closed' || (isFinite(pos) && pos > 0);
  };

  C.isNight = function (states) {
    var sun = states && states['sun.sun'];
    if (!sun) return true;
    var s = low(sun.state);
    if (s === 'below_horizon') return true;
    if (s === 'above_horizon') return false;
    return true;   // sun unavailable: as without sun.sun
  };

  var sees = function (id, user) {
    return typeof window.casoraSeesEntity !== 'function' || window.casoraSeesEntity(id, user);
  };

  C.scan = function (states, hass, user) {
    var S = states || (hass && hass.states) || {};
    var cfg = C.cfg();
    var ids = cfg.ids.filter(function (id) {
      var st = S[id];
      if (st && GATE.indexOf(low(st.attributes && st.attributes.device_class)) >= 0) return false;
      return sees(id, user);
    });
    var open = [], closed = [], dead = [];
    ids.forEach(function (id) {
      var o = C.isOpen(S[id]);
      (o === null ? dead : o ? open : closed).push(id);
    });
    var on = ids.length > 0;
    var active = on && (!cfg.night || C.isNight(S));
    return { on: on, active: active, night: cfg.night, ids: ids, open: open, closed: closed, dead: dead,
      count: active ? open.length : 0 };
  };

  // Home only: the setting is for the whole house, a room's security badge stays as it is.
  // v.place wins (phone templates), else where: 'home' or the card (casoraOnHomeView), as casoraHouseContactsOf.
  var onHome = function (v, where) {
    v = v || {};
    if (v.place) return v.place === 'home';
    if (where === 'home') return true;
    return !!where && typeof where === 'object' && typeof window.casoraOnHomeView === 'function'
      && window.casoraOnHomeView(where) === true;
  };
  C.onHome = onHome;

  C.count = function (states, hass, user, v, where) {
    if (!onHome(v, where)) return 0;
    return C.scan(states, hass, user).count;
  };
  C.show = function (states, hass, user, v, where) { return C.count(states, hass, user, v, where) > 0; };

  // ── Popup ──────────────────────────────────────────────────────────────────────────────
  var nameOf = function (id, s) { return String((s && s.attributes && s.attributes.friendly_name) || id); };
  var roomOf = function (id, hass) {
    if (!hass) return '';
    var reg = (hass.entities || {})[id] || {};
    var area = reg.area_id || (reg.device_id && hass.devices && hass.devices[reg.device_id] ? hass.devices[reg.device_id].area_id : null);
    return area && hass.areas && hass.areas[area] ? String(hass.areas[area].name || '') : '';
  };
  // Words as the cover badge and tile (wortliste: „Geöffnet“, „62 % geöffnet“, never „Zu“ as a state).
  C.word = function (st) {
    var o = C.isOpen(st);
    if (o === null) return low(st && st.state) === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar';
    var s = low(st.state);
    if (s === 'opening') return 'Öffnet';
    if (s === 'closing') return 'Schließt';
    if (!o) return 'Geschlossen';
    var p = Number(st.attributes && st.attributes.current_position);
    if (st.attributes && st.attributes.current_position != null && isFinite(p) && p > 0 && p < 100) {
      return Math.round(p) + ' % geöffnet';
    }
    return 'Geöffnet';
  };
  // CLOSE (2) or SET_POSITION (4); without supported_features (template covers, old integrations) close_cover.
  var closeSvc = function (id, st) {
    var a = (st && st.attributes) || {};
    if (a.supported_features == null) return { domain: 'cover', service: 'close_cover', data: { entity_id: id } };
    var f = Number(a.supported_features) || 0;
    if (f & 2) return { domain: 'cover', service: 'close_cover', data: { entity_id: id } };
    if (f & 4) return { domain: 'cover', service: 'set_cover_position', data: { entity_id: id, position: 0 } };
    return null;
  };
  C.closeSvc = closeSvc;
  var iconOf = function (st) {
    return typeof window.casoraCoverIconName === 'function' && st ? window.casoraCoverIconName(st) : 'cover_open';
  };

  C.rows = function (states, hass, user) {
    var S = states || (hass && hass.states) || {};
    var r = C.scan(S, hass, user);
    var row = function (id) {
      var st = S[id], o = C.isOpen(st), s = low(st && st.state);
      var x = { icon: iconOf(st), label: nameOf(id, st), labelLit: true };
      var room = roomOf(id, hass);
      var svc = o && s !== 'closing' ? closeSvc(id, st) : null;
      if (o) x.iconTone = 'warn';
      if (svc) {
        x.entity = id;
        x.svc = svc;
        x.action = 'Schließen';
        x.actionTone = 'accent';
        x.sub = [room, C.word(st)].filter(Boolean).join(' · ');
      } else {
        if (st) x.entity = id;
        x.value = C.word(st);
        if (room) x.sub = room;
      }
      return x;
    };
    return { scan: r, open: r.open.map(row), closed: r.closed.map(row), dead: r.dead.map(row) };
  };

  C.popup = function (states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var watch = C.cfg().ids.concat(['sun.sun']);
    var call = function (part) {
      return 'return window._casoraSecCovers ? window._casoraSecCovers.sec(' + JSON.stringify(part) + ', null, states, hass, user) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) } };
    // One live section for all lists: a cover that closes moves from "Offen" to "Geschlossen" while the popup is open.
    f.list = { card: K.secCard(watch, call('list'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['list'], right: [] });
  };

  C.sec = function (part, cfg, states, hass, user) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var R = C.rows(states, hass, user);
    var r = R.scan;
    if (part === 'hero') {
      var n = r.ids.length;
      var main = !n ? 'Keine Jalousien ausgewählt'
        : r.open.length ? r.open.length + ' von ' + n + ' geöffnet'
        : r.closed.length ? (r.closed.length === 1 ? 'Geschlossen' : 'Alle geschlossen')
        : 'Nicht verfügbar';
      var rest = [];
      if (n && r.night) rest.push(r.active ? 'Bis Sonnenaufgang' : 'Ab Sonnenuntergang');
      return UI.line(main, rest, { tone: r.open.length && r.active ? 'warn' : null });
    }
    if (part !== 'list') return '';
    if (!r.ids.length) return UI.note ? UI.note('Jalousien wählst du im Studio unter Einstellungen › Haus & Geräte › Sicherheit.') : '';
    var groupsHtml = '';
    if (R.open.length) {
      var all = r.open.map(function (id) { return closeSvc(id, (states || {})[id]); })
        .filter(function (x) { return x && x.service === 'close_cover'; })
        .map(function (x) { return x.data.entity_id; });
      var act = R.open.length > 1 && all.length
        ? { text: 'Alle schließen', svc: { domain: 'cover', service: 'close_cover', data: { entity_id: all } }, tone: 'accent' }
        : null;
      groupsHtml += UI.group(R.open, 'Offen', act);
    }
    if (R.closed.length) groupsHtml += UI.group(R.closed, 'Geschlossen');
    if (R.dead.length) groupsHtml += UI.group(R.dead, 'Nicht verfügbar');
    return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 22px);">' + groupsHtml + '</div>';
  };
})();
