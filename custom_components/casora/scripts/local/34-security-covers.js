// ── Covers in "Security" (#76) ───────────────────────────────────────────────────────────────
// Opt-in: Settings › Home & Devices › Security picks the covers that count for security
// (CASORA_SETTINGS.security.covers); without any, nothing changes. "Evening and night only" (on by default,
// stored only as covers_night: false) counts them from sunset to sunrise (sun.sun below_horizon; without
// sun.sun always). A selected cover is open when it is not fully closed: state other than closed, or
// current_position above 0 – or above security.closed_up_to while at rest (issue 138, also for gates). Unavailable/unknown covers are left out of the count (as the cover badge
// hides itself then) and listed in the popup as unavailable. Garage doors, gates and doors (device_class
// garage/gate/door) already count as "Tor offen" in the security badge and are left out here.
//   C.cfg()                                   → { ids, night }
//   C.closedUpTo(id)                          → security.closed_up_to_by[id] (0–99), else closed_up_to (0–20), else 0
//   C.coverOpen(st, kind)                     → window.casoraCoverOpen: kind 'gate' or a picked cover; true | false | null
//   C.isOpen(st)                              → true | false | null (null = unavailable/unknown)
//   C.isNight(states)                         → true from sunset to sunrise, true without sun.sun
//   C.scan(states, hass, user)                → { on, active, ids, open, closed, dead, count }
//   C.count(states, hass, user, v, where)     → open covers that count now on Home (0 elsewhere/by day/off)
//   C.show(states, hass, user, v, where)      → sub-badge "Jalousien" visible (Home, counting, ≥ 1 open)
//   C.popup(states, hass, variables)          – popup casora_popup_security_covers
//   C.sec(part, cfg, states, hass)            – live parts (hero, list, contacts)
//   C.contactsCard(states, hass, user)        – section „Jalousien“ for the house's „Türen & Fenster“ popup (#76)
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

  // Issue 138: security.closed_up_to, whole percent 0–20 (Studio „Gilt als geschlossen bis“). A cover at rest whose
  // current_position is at or below it counts as closed – a garage door left ajar for air. Anything else: 0, as before.
  // Per cover (follow-up 07.11.2026, blinds left at different positions in the evening): security.closed_up_to_by
  // { entity_id: whole percent 0–99 } wins over the general value for that cover; an invalid one falls back to it.
  C.closedUpTo = function (id) {
    var sec = ((window.CASORA_SETTINGS || {}).security) || {};
    var whole = function (v, max) { return typeof v === 'number' && Math.floor(v) === v && v >= 0 && v <= max; };
    var by = sec.closed_up_to_by;
    if (id && by && typeof by === 'object' && !Array.isArray(by) && whole(by[id], 99)) return by[id];
    return whole(sec.closed_up_to, 20) ? sec.closed_up_to : 0;
  };

  // Open for security? The one rule for gates and the picked covers (security badge, its level, arm warning, this module).
  // kind 'gate' (garage/gate/door): open/opening count, as HA reports them. Otherwise (a picked cover): anything but
  // fully closed. Opening/closing are in motion and never fall under closed_up_to. null: missing, unavailable, unknown.
  C.coverOpen = function (st, kind) {
    if (!st) return null;
    var s = low(st.state);
    if (!s || s === 'unavailable' || s === 'unknown') return null;
    var p = st.attributes && st.attributes.current_position;
    var pos = p == null || p === '' || typeof p === 'boolean' ? NaN : Number(p);
    var t = C.closedUpTo(st.entity_id);
    if (t > 0 && (s === 'open' || s === 'closed') && isFinite(pos) && pos <= t) return false;
    if (kind === 'gate') return s === 'open' || s === 'opening';
    return s !== 'closed' || (isFinite(pos) && pos > 0);
  };
  window.casoraCoverOpen = C.coverOpen;

  C.isOpen = function (st) { return C.coverOpen(st, 'blind'); };

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

  // Single covers only (27.10.2026): an HA cover group stands for its members – expanded, each blind once, the
  // group entity itself never listed or counted (a list held „Jalousien“ and „Jalousien Wohnzimmer“ beside them).
  C.isGroup = function (st) { var m = st && st.attributes && st.attributes.entity_id; return Array.isArray(m) && m.length > 0; };
  C.singles = function (S, ids) {
    var out = [];
    (function add(list, d) {
      (list || []).forEach(function (id) {
        if (typeof id !== 'string' || id.indexOf('cover.') !== 0 || d > 4) return;
        var st = S[id];
        if (C.isGroup(st)) return add(st.attributes.entity_id, d + 1);
        // A missing blind stays (listed as unavailable), a group never.
        if (out.indexOf(id) < 0) out.push(id);
      });
    })(ids, 0);
    return out;
  };

  // The dashboard's blinds tile (casora_cover / casora_popup_cover over an HA cover group or a list of several
  // blinds): the one place the blinds popup is set up – the Klima sub-badge opens exactly its popup (owner,
  // 27.10.2026: „das sollte immer das gleiche sein, dass man nur eine Stelle einstellen muss“). null: none.
  window.casoraBlindsTile = function () {
    var cfg = window._casoraLovelaceCfg ? window._casoraLovelaceCfg() : null;
    var ha = document.querySelector('home-assistant'), S = (ha && ha.hass && ha.hass.states) || {};
    if (!cfg) return null;
    // The badges ask on every state change (casoraClimateBlinds): walk the config once per config and states.
    var K = window._casoraBlindsTileC;
    if (K && K.cfg === cfg && K.S === S) return K.hit ? JSON.parse(JSON.stringify(K.hit)) : null;
    var hit = null;
    (function walk(x, d) {
      if (hit || !x || typeof x !== 'object' || d > 14) return;
      if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
      var t = [].concat(x.template || []);
      if (x.type === 'custom:button-card' && t.some(function (n) { return n === 'casora_cover' || n === 'casora_popup_cover'; })) {
        var v = x.variables || {}, e = typeof x.entity === 'string' ? x.entity : (typeof v.cover_entity === 'string' ? v.cover_entity : null);
        if ((Array.isArray(v.covers) && v.covers.length > 1) || (e && C.isGroup(S[e]))) { hit = x; return; }
      }
      Object.keys(x).forEach(function (k) { if (k !== 'button_card_templates') walk(x[k], d + 1); });
    })(cfg, 0);
    window._casoraBlindsTileC = { cfg: cfg, S: S, hit: hit };
    return hit ? JSON.parse(JSON.stringify(hit)) : null;
  };
  // Open the blinds popup: the tile's, else one over the given single blinds.
  window.casoraOpenBlinds = function (ids) {
    var open = window._casoraNotifyOpenViaCard;
    if (!open) return false;
    var tile = window.casoraBlindsTile();
    if (tile) { open(tile.entity || (tile.variables || {}).cover_entity, function () {}, tile, true); return true; }
    var ha = document.querySelector('home-assistant'), S = (ha && ha.hass && ha.hass.states) || {};
    var one = C.singles(S, ids || []);
    if (!one.length) return false;
    open(one[0], function () {}, { type: 'custom:button-card', template: 'casora_popup_cover', entity: one[0],
      variables: { covers: one, room_name: 'Jalousien' } }, true);
    return true;
  };
  if (!window._casoraBlindsOpen) {
    window._casoraBlindsOpen = true;
    document.addEventListener('ll-custom', function (e) {
      var d = (e.detail && e.detail.event_data) ? e.detail.event_data : (e.detail || {});
      if (d.casora_blinds_open !== true) return;
      var v = (d.casora_popup && d.casora_popup._covers) || [];
      if (window.casoraOpenBlinds(v)) e.stopPropagation();
    }, true);
  }

  C.scan = function (states, hass, user) {
    var S = states || (hass && hass.states) || {};
    var cfg = C.cfg();
    var ids = C.singles(S, cfg.ids).filter(function (id) {
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
    // Popup v3 (richtlinien §4 S7): the sentence becomes the status stage with „Alle schließen“ in it. The line stays on
    // top for the head (§3): its first part reads like the stage and goes, „Bis Sonnenaufgang“ remains – the wheel's
    // middle holds two facts only, and without the line the head stayed empty.
    var v3 = !!(UI.v3 && UI.v3() && UI.stage);
    var f = { hero: { card: K.secCard(watch, call('hero'), states) } };
    if (v3) f.stage = { card: K.secCard(watch, call('stage'), states) };
    // One live section for all lists: a cover that closes moves from "Offen" to "Geschlossen" while the popup is open.
    f.list = { card: K.secCard(watch, call('list'), states) };
    return K.layout({ fields: f, top: ['hero'], stage: v3 ? 'stage' : null, left: ['list'], right: [] });
  };

  // The security badge on Home counts the selected open covers, and its tap opens the house's „Türen & Fenster“
  // (casora_popup_contacts): that popup lists them too, as its own section with „Schließen“ (#76, 26.10.63).
  // Only while they count (Home, evening/night unless „Nur abends und nachts“ is off); null otherwise.
  C.contactsCard = function (states, hass, user) {
    var K = window._casoraSoftKit;
    var S = states || (hass && hass.states) || {};
    if (!K || !C.scan(S, hass, user).count) return null;
    var c = K.secCard(C.cfg().ids.concat(['sun.sun']),
      'return window._casoraSecCovers ? window._casoraSecCovers.sec("contacts", null, states, hass, user) : "";', S);
    c.styles.card = [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 22px 26px' }];
    c.card_mod = { style: ((c.card_mod && c.card_mod.style) || '') + '\n@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }' };
    return c;
  };

  // Popup v3 stage S7 of „Türen & Fenster“ (casora_popup_contacts and the contact branch of the security/alarm badge
  // popups): the head line's sentence, Casora's security level as the traffic light, counts and the last change as facts.
  // No main action – doors and windows close by hand.
  window.casoraContactsStage = function (hass, openIds, allIds, tilted, text, when) {
    var UI = window._casoraUI;
    if (!UI || !UI.stage) return '';
    var S = (hass && hass.states) || {};
    var dc = function (id) { return low(S[id] && S[id].attributes && S[id].attributes.device_class); };
    var tc = openIds.filter(tilted).length, oc = openIds.length - tc;
    var lv = openIds.length && window.casoraSecurityLevel ? window.casoraSecurityLevel(hass, openIds) : openIds.length ? 'warn' : 'ok';
    var win = (openIds.length ? openIds : allIds).every(function (id) { return dc(id) === 'window'; });
    // Counts after the number in small letters („2 geöffnet“, word list §2), a count of 0 left out (review 2, DD-16).
    var facts = [];
    if (oc) facts.push({ label: 'geöffnet', value: String(oc) });
    if (tc) facts.push({ label: 'gekippt', value: String(tc) });
    // A count the sentence already says („1 gekippt“ as the sentence and as a fact) is not repeated under it.
    var same = function (f) { return low(f.value + ' ' + f.label).replace(/\s+/g, ' ') === low(text).replace(/\s+/g, ' ').trim(); };
    facts = facts.filter(function (f) { return !same(f); });
    if (facts.length < 2 && allIds.length > openIds.length) facts.push({ label: 'geschlossen', value: String(allIds.length - openIds.length) });
    if (when && facts.length < 2) facts.push({ label: 'Zuletzt', value: when });
    return UI.stage('status', {
      tone: !allIds.length ? 'off' : lv === 'alarm' ? 'bad' : lv === 'warn' ? 'warn' : 'good',
      icon: win ? (openIds.length ? 'mdi:window-open-variant' : 'mdi:window-closed-variant') : (openIds.length ? 'mdi:door-open' : 'mdi:door-closed'),
      text: text, facts: allIds.length ? facts : [],
      // Dial (richtlinien §4.8): one segment per door/window, green closed, orange tilted, red open.
      segs: allIds.map(function (id) {
        var op = openIds.indexOf(id) > -1, nm = S[id] && S[id].attributes && S[id].attributes.friendly_name;
        return { ok: !op, tone: !op ? 'good' : tilted(id) ? 'warn' : 'bad', label: nm || id };
      }),
    });
  };

  C.sec = function (part, cfg, states, hass, user) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var R = C.rows(states, hass, user);
    var r = R.scan;
    if (part === 'contacts') {
      if (!r.active || !R.open.length) return '';
      var ids = r.open.map(function (id) { return closeSvc(id, (states || {})[id]); })
        .filter(function (x) { return x && x.service === 'close_cover'; })
        .map(function (x) { return x.data.entity_id; });
      var all = R.open.length > 1 && ids.length
        ? { text: 'Alle schließen', svc: { domain: 'cover', service: 'close_cover', data: { entity_id: ids } }, tone: 'accent' }
        : null;
      return UI.group(R.open, 'Jalousien', all);
    }
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
    // Popup v3 stage S7: sentence as the head line, traffic light while open covers count, „Alle schließen“ as the pill.
    if (part === 'stage') {
      var n7 = r.ids.length;
      if (!n7) return UI.stage('status', { empty: { icon: 'mdi:window-shutter', text: 'Noch keine Jalousien gewählt',
        sub: 'Im Studio unter Einstellungen › Haus & Geräte › Sicherheit', studio: true } });
      var ids7 = r.open.map(function (id) { return closeSvc(id, (states || {})[id]); })
        .filter(function (x) { return x && x.service === 'close_cover'; })
        .map(function (x) { return x.data.entity_id; });
      var facts7 = [{ label: 'Geöffnet', value: String(r.open.length) }, { label: 'Geschlossen', value: String(r.closed.length) }];
      if (r.night) facts7.push({ label: 'Zählt', value: r.active ? 'Bis Sonnenaufgang' : 'Ab Sonnenuntergang' });
      return UI.stage('status', {
        tone: r.open.length ? (r.active ? 'warn' : 'off') : r.closed.length ? 'good' : 'off',
        state: !r.open.length && !r.closed.length ? 'na' : null,
        icon: r.open.length ? 'mdi:window-shutter-open' : 'mdi:window-shutter',
        text: r.open.length ? r.open.length + ' von ' + n7 + ' geöffnet'
          : r.closed.length ? (r.closed.length === 1 ? 'Geschlossen' : 'Alle geschlossen') : 'Nicht verfügbar',
        facts: facts7,
        action: ids7.length ? { text: ids7.length > 1 ? 'Alle schließen' : 'Schließen', icon: 'mdi:arrow-collapse-down', primary: true,
          svc: { domain: 'cover', service: 'close_cover', data: { entity_id: ids7 } } } : null,
        // Dial: one segment per cover, open ones orange while they count (night), grey otherwise.
        segs: r.ids.map(function (id) {
          var op = r.open.indexOf(id) > -1, st = (states || {})[id];
          return { ok: !op, tone: !op ? (st && st.state !== 'unavailable' ? 'good' : 'off') : r.active ? 'warn' : 'off',
            label: (st && st.attributes && st.attributes.friendly_name) || id };
        }),
      });
    }
    if (part !== 'list') return '';
    /* Blueprint v2 (rule 10): the empty row with the way into the Studio (was a grey sentence without a plate). */
    if (!r.ids.length) return UI.empty ? UI.empty({ icon: 'mdi:window-shutter', text: 'Noch keine Jalousien gewählt',
      sub: 'Im Studio unter Einstellungen › Haus & Geräte › Sicherheit', studio: true })
      : (UI.note ? UI.note('Jalousien wählst du im Studio unter Einstellungen › Haus & Geräte › Sicherheit.') : '');
    // One name per cover across „Offen“, „Geschlossen“ and „Nicht verfügbar“ (UI.popupNames): a cover that closes keeps it.
    var nm = UI.popupNames ? UI.popupNames(R.open.concat(R.closed, R.dead)) : function (x) { return x; };
    var groupsHtml = '';
    if (R.open.length) {
      var all = r.open.map(function (id) { return closeSvc(id, (states || {})[id]); })
        .filter(function (x) { return x && x.service === 'close_cover'; })
        .map(function (x) { return x.data.entity_id; });
      // v3: „Alle schließen“ sits in the stage.
      var act = R.open.length > 1 && all.length && !(UI.v3 && UI.v3())
        ? { text: 'Alle schließen', svc: { domain: 'cover', service: 'close_cover', data: { entity_id: all } }, tone: 'accent' }
        : null;
      groupsHtml += UI.group(R.open.map(nm), 'Offen', act);
    }
    if (R.closed.length) groupsHtml += UI.group(R.closed.map(nm), 'Geschlossen');
    if (R.dead.length) groupsHtml += UI.group(R.dead.map(nm), 'Nicht verfügbar');
    return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 22px);">' + groupsHtml + '</div>';
  };
})();
