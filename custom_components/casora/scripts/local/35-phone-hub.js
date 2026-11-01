// ── Phone badges on Home open a popup (26.10.63) ─────────────────────────────────────────────
// Until 26.10.62 a tap on the phone's Security, Climate or People badge filtered the start page: a page
// with the badge's sub-badges (locks, cameras, doors, windows, blinds / temperature, humidity …) and the
// tiles of that category. Since #80 the light badge opens its popup instead; now every badge does. The badges
// that already have a popup that suits the phone keep it (lights, energy, media); Security, Climate and
// People get this "hub" popup: the same sub-badges and tiles the filter page showed, as rows. A row opens
// that badge's or tile's own popup as a sub page (‹ back to the hub).
// The rows are read from the cards Home already renders (hidden while no filter is set), so the hub always
// shows exactly what the filter page would: same order, same words, nothing counted twice.
//   window._casoraPhoneHub.popup(cat, states, hass, variables)  – content of the phone group badges' popup (casora_badge_*_group)
//   window._casoraPhoneHub.sec(cat, part, states, hass)          – live parts (hero, list)
//   window._casoraPhoneHub.scan(cat)                             → { chips, rooms, watch, sub }
(function () {
  if (window._casoraPhoneHub && window._casoraPhoneHub.v === 1) return;
  var P = window._casoraPhoneHub = { v: 1, last: {} };

  var CHIP_ROW = { security: 'security_row', climate: 'climate_row' };
  var BADGE = { security: 'casora_badge_security_group', climate: 'casora_badge_climate_group', presence: 'casora_badge_presence_group' };
  var TITLE = { security: 'Sicherheit', climate: 'Klima', presence: 'Personen' };

  var tpls = function (el) { return [].concat((el && el._config && el._config.template) || []); };
  var txt = function (n) { return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : ''; };

  // Breadth-first through light and shadow DOM; stop at max hits.
  var deep = function (root, pred, max) {
    var out = [], queue = [root], seen = 0;
    while (queue.length && seen < 40000) {
      var n = queue.shift();
      if (!n) continue;
      seen++;
      if (n.nodeType === 1 && pred(n)) { out.push(n); if (max && out.length >= max) break; }
      if (n.shadowRoot) queue.push(n.shadowRoot);
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
    }
    return out;
  };
  var haRoot = function () { var ha = document.querySelector('home-assistant'); return ha && ha.shadowRoot; };

  // Cached per category: the elements stay the same while the view is open.
  var memo = {};
  var cached = function (key, fn) {
    var m = memo[key];
    if (m && m.at > Date.now() - 1500 && (!m.v || !m.v.length || m.v.every(function (x) { return !x.el || x.el.isConnected; }))) return m.v;
    var v = fn();
    memo[key] = { at: Date.now(), v: v };
    return v;
  };

  var enabled = function (b) {
    var ev = b._evaluatedVariables && b._evaluatedVariables.enabled;
    var v = ev && typeof ev === 'object' && 'value' in ev ? ev.value : ev;
    return v !== false && v !== 'false' && v !== 0;
  };
  // The card's own icon: an HA icon („mdi:…“), else Casora's icon file (/casora_assets/icons/<name>.svg), else the
  // icon variable (tiles with an inline picture).
  var iconOf = function (b) {
    var sr = b.shadowRoot;
    var n = sr && sr.querySelector('ha-state-icon, ha-icon');
    var i = n && (n.icon || n.getAttribute('icon'));
    if (typeof i === 'string' && i) return i;
    var img = sr && sr.querySelector('img#icon');
    var m = img && /\/casora_assets\/icons\/([\w-]+)\.svg/.exec(img.getAttribute('src') || '');
    if (m) return m[1];
    var ev = b._evaluatedVariables && b._evaluatedVariables.icon;
    var v = ev && typeof ev === 'object' && 'value' in ev ? ev.value : ev;
    return typeof v === 'string' && v && v.indexOf('[[[') < 0 ? v : null;
  };
  // Tile state as the tile shows it (casora-statefit keeps the full text in .sf-f).
  var stateOf = function (b) {
    var sr = b.shadowRoot;
    var f = sr && sr.querySelector('#state .sf-f');
    return txt(f) || txt(sr && sr.querySelector('#state')) || txt(sr && sr.querySelector('#label'));
  };
  // Badge sub-line in words: the security badge's short form is icons with numbers, its words sit in aria-label.
  var subOf = function (b) {
    var sr = b && b.shadowRoot, n = sr && sr.querySelector('.badge-sub');
    if (!n) return '';
    var items = n.querySelectorAll('.cs-sum-item');
    if (items.length) {
      return Array.prototype.map.call(items, function (x) {
        var lab = x.getAttribute('aria-label'), num = x.querySelector('span[aria-hidden="true"]:last-child');
        var c = num ? txt(num) : '';
        return lab ? (c && c !== '1' && lab.indexOf(c) !== 0 ? c + ' ' + lab : lab) : txt(x);
      }).join(' · ');
    }
    return txt(n);
  };
  var entityIds = function (b) {
    var out = [];
    var add = function (x) {
      if (typeof x === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x) && out.indexOf(x) < 0) out.push(x);
      else if (Array.isArray(x)) x.forEach(add);
      else if (x && typeof x === 'object' && 'value' in x) add(x.value);
    };
    if (b._stateObj) add(b._stateObj.entity_id);
    var ev = b._evaluatedVariables || {};
    Object.keys(ev).forEach(function (k) { add(ev[k]); });
    return out;
  };

  // Sub-badges of the category on Home (casora_mobile_sensor_chips › security_row / climate_row).
  var chipsOf = function (cat) {
    var row = CHIP_ROW[cat];
    if (!row) return [];
    var host = deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_mobile_sensor_chips') >= 0; }, 1)[0];
    var field = host && host.shadowRoot && host.shadowRoot.querySelector('#' + row);
    // A phone room page (its badge row #rooms_row shows): the room's own sub-row of the badge, not Home's.
    var roomRow = host && host.shadowRoot && host.shadowRoot.querySelector('#rooms_row');
    var roomSub = roomRow && getComputedStyle(roomRow).display !== 'none' ? host.shadowRoot.querySelector('#room_sub_' + cat) : null;
    if (roomSub) field = roomSub;
    // Desktop/tablet (26.10.63): the room header's own sub-row of the badge (casora_room › badges_<cat>).
    if (!field) {
      var room = deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_room') >= 0 && n.getBoundingClientRect().width > 0; }, 1)[0];
      field = room && room.shadowRoot && room.shadowRoot.querySelector('#badges_' + cat);
    }
    if (!field) return [];
    return deep(field, function (n) { return n.localName === 'button-card' && /casora_badge_/.test(tpls(n).join(',')); })
      .filter(enabled)
      // A sub-badge that hides itself (its card display none, e.g. „Jalousien“ without blinds) is no row either.
      .filter(function (b) { var hc = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return !hc || getComputedStyle(hc).display !== 'none'; })
      .map(function (b) {
        var sr = b.shadowRoot;
        return { el: b, tpl: tpls(b).join(','), title: txt(sr && sr.querySelector('.badge-title')), sub: subOf(b),
          icon: iconOf(b), ids: entityIds(b) };
      })
      .filter(function (c) { return c.title; });
  };

  // People badge: its single person badges in the phone's badge row.
  var peopleOf = function () {
    var row = deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_mobile_filter_badges') >= 0; }, 1)[0];
    if (!row) return [];
    return deep(row.shadowRoot || row, function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_badge_presence') >= 0 && !!n._stateObj; })
      .filter(function (b, i, a) { return a.findIndex(function (x) { return x._stateObj.entity_id === b._stateObj.entity_id; }) === i; })
      .map(function (b) {
        var s = b._stateObj, ha = document.querySelector('home-assistant'), h = ha && ha.hass;
        var word = h && typeof h.formatEntityState === 'function' ? h.formatEntityState(s) : s.state;
        return { el: b, title: String((s.attributes && s.attributes.friendly_name) || s.entity_id), sub: word,
          icon: 'mdi:account', picture: s.attributes && s.attributes.entity_picture, ids: [s.entity_id], home: s.state === 'home',
          unk: !s.state || s.state === 'unknown' || s.state === 'unavailable' };
      });
  };

  // Tiles of the category, by room – the rule filter-overlay.js uses for its page.
  var catOf = function (cfg) {
    var v = (cfg && cfg.variables) || {};
    if (v.mobile_filter_category !== null && v.mobile_filter_category !== undefined) return v.mobile_filter_category;
    var cats = window.CASORA_FILTER_CATEGORIES || {};
    var t = [].concat((cfg && cfg.template) || []);
    for (var i = 0; i < t.length; i++) if (t[i] && Object.prototype.hasOwnProperty.call(cats, t[i])) return cats[t[i]];
    return null;
  };
  var offOnPhone = function (cfg) {
    var v = cfg && cfg.variables && cfg.variables.enabled;
    if (v === false || v === 'false' || v === 0 || v === '0') return true;
    return !!(cfg && cfg.variables && cfg.variables.surfaces === 'desktop');
  };
  // Blinds left out of the climate devices (collected here for the „Jalousien“ row of the climate popup).
  var blindsOut = [];
  var roomsOf = function (cat) {
    if (cat === 'climate') blindsOut = [];
    var ov = deep(haRoot(), function (n) { return n.localName === 'casora-filter-overlay' && n._config && n._config.filter_category === cat; }, 1)[0];
    var found = ov && typeof ov._findContainerAndSelf === 'function' ? ov._findContainerAndSelf() : null;
    var container = found && found.container;
    if (!container) return roomsFromCfg(cat);
    var rooms = [], pending = null;
    for (var i = 0; i < container.children.length; i++) {
      var kid = container.children[i];
      var bc = kid.localName === 'button-card' ? kid : (kid.querySelector && kid.querySelector('button-card'));
      if (bc && tpls(bc).indexOf('casora_mobile_header') >= 0) {
        var hv = (bc._config && bc._config.variables) || {};
        pending = hv.favorites === true ? null : String((bc._config && bc._config.name) || '');
        continue;
      }
      var sr = kid.querySelector && (kid.localName === 'casora-smart-row' ? kid : kid.querySelector('casora-smart-row'));
      if (!sr || pending === null) { if (sr) pending = null; continue; }
      var tiles = (sr._wrappers || []).map(function (w) {
        return w.localName === 'button-card' ? w : (w.querySelector && w.querySelector('button-card'));
      }).filter(function (b) { return b && b._config && !offOnPhone(b._config) && catOf(b._config) === cat; })
        // Blinds are no climate device in the popup (owner, 27.10.2026), though the old filter page listed them there.
        .filter(function (b) {
          var blind = cat === 'climate' && (/^cover\./.test((b._stateObj && b._stateObj.entity_id) || '') || tpls(b).some(function (t) { return /cover/.test(t); }));
          if (blind && b._stateObj && blindsOut.indexOf(b._stateObj.entity_id) < 0) blindsOut.push(b._stateObj.entity_id);
          return !blind;
        })
        .map(function (b) {
          var r = b.shadowRoot;
          return { el: b, main: b._stateObj ? b._stateObj.entity_id : null, title: txt(r && r.querySelector('#name')) || String((b._stateObj && b._stateObj.attributes.friendly_name) || ''),
            sub: stateOf(b), icon: iconOf(b), ids: entityIds(b) };
        }).filter(function (t) { return t.title; });
      if (tiles.length) rooms.push({ name: pending, tiles: tiles });
      pending = null;
    }
    return rooms;
  };

  // Desktop/tablet: no phone page to read – the tiles of the category from the dashboard's room views (by view
  // title), each opened like a tile tap through its own config (openViaCard).
  var DOM_ICON = { lock: 'lock', camera: 'camera', alarm_control_panel: 'shield_alarm', binary_sensor: 'door-closed', cover: 'cover_open',
    climate: 'thermostat', fan: 'fan', humidifier: 'humidifier' };
  var roomsFromCfg = function (cat) {
    var cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    var ha = document.querySelector('home-assistant'), h = ha && ha.hass, S = (h && h.states) || {};
    if (!cfg || !h) return [];
    var rooms = [];
    (cfg.views || []).forEach(function (v) {
      var tiles = [], seen = {};
      (function walk(x, d) {
        if (!x || typeof x !== 'object' || d > 10) return;
        if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
        if (x.type === 'custom:button-card' && typeof x.entity === 'string' && S[x.entity] && !offOnPhone(x) && catOf(x) === cat
            && !(cat === 'climate' && /^cover\./.test(x.entity)) && !seen[x.entity]) {
          seen[x.entity] = 1;
          var st = S[x.entity], dom = x.entity.split('.')[0], vi = x.variables && x.variables.icon;
          tiles.push({ cfg: x, main: x.entity, ids: [x.entity],
            title: (typeof x.name === 'string' && x.name.indexOf('[[[') < 0 && x.name) || String((st.attributes && st.attributes.friendly_name) || x.entity),
            sub: typeof h.formatEntityState === 'function' ? h.formatEntityState(st) : st.state,
            icon: (typeof vi === 'string' && vi.indexOf('[[[') < 0 && vi) || DOM_ICON[dom] || 'mdi:devices' });
        }
        walk(x.cards, d + 1); walk(x.card, d + 1); walk(x.sections, d + 1);
      })(v.cards || v.sections || [], 0);
      // The room's name as its header shows it (casora_room), else the view's title.
      var head = (v.cards || []).filter(function (x) { return x && [].concat(x.template || []).indexOf('casora_room') >= 0; })[0];
      var nm = (head && typeof head.name === 'string' && head.name.indexOf('[[[') < 0 && head.name)
        || (head && head.variables && typeof head.variables.room_name === 'string' && head.variables.room_name) || v.title || '';
      if (!nm && v.path) nm = String(v.path).charAt(0).toUpperCase() + String(v.path).slice(1);
      if (tiles.length) rooms.push({ name: String(nm), tiles: tiles });
    });
    return rooms;
  };

  // A Home badge option (Studio): the phone's badge row carries Home's variables (casora_hv), the desktop its room
  // header (casora_room).
  var homeVar = function (k) {
    var row = deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_mobile_filter_badges') >= 0; }, 1)[0];
    var ev = row && row._evaluatedVariables && row._evaluatedVariables.casora_hv;
    var hv = ev && typeof ev === 'object' && 'value' in ev ? ev.value : ev;
    if (hv && typeof hv === 'object' && k in hv) return hv[k];
    var room = !row && deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf('casora_room') >= 0 && n.getBoundingClientRect().width > 0; }, 1)[0];
    var v = room && room._config && room._config.variables;
    return v ? v[k] : undefined;
  };
  P.homeVar = homeVar;

  // The Klima badge's „Jalousien“ (26.10.63, Studio option climate_blinds, default on): the house's blinds – Home only.
  // Garage doors, gates and doors are no blinds (as the security covers, 34-security-covers.js).
  window.casoraClimateBlinds = function (hass, user, opt, home) {
    if (opt === false || !home || !hass || !hass.states) return [];
    var S = hass.states, GATE = ['garage', 'gate', 'door'];
    /* The dashboard's blinds tile is the one place the blinds are set up – its popup opens from this badge
       (casoraOpenBlinds), so the badge counts exactly its blinds (review 2, T09: badge 7, popup 6). */
    var SC = window._casoraSecCovers, tile = window.casoraBlindsTile && SC && SC.singles ? window.casoraBlindsTile() : null;
    if (tile) {
      var tv = tile.variables || {};
      var list = Array.isArray(tv.covers) && tv.covers.length > 1 ? tv.covers : [tile.entity || tv.cover_entity];
      return SC.singles(S, list).filter(function (id) {
        return !!S[id] && (typeof window.casoraSeesEntity !== 'function' || window.casoraSeesEntity(id, user));
      }).sort();
    }
    return Object.keys(S).filter(function (id) {
      if (id.indexOf('cover.') !== 0) return false;
      var dc = String((S[id].attributes || {}).device_class || '').toLowerCase();
      if (GATE.indexOf(dc) >= 0) return false;
      // HA cover groups are no blinds of their own: their members are listed (27.10.2026).
      var m = (S[id].attributes || {}).entity_id;
      if (Array.isArray(m) && m.length) return false;
      return typeof window.casoraSeesEntity !== 'function' || window.casoraSeesEntity(id, user);
    }).sort();
  };

  P.scan = function (cat) {
    return cached(cat, function () {
      var chips = cat === 'presence' ? peopleOf() : chipsOf(cat);
      var rooms = roomsOf(cat);
      // „Jalousien“ last in the overview, as in the sub-row (owner, 27.10.2026).
      chips = chips.filter(function (c) { return !/casora_badge_climate_covers/.test(c.tpl || ''); })
        .concat(chips.filter(function (c) { return /casora_badge_climate_covers/.test(c.tpl || ''); }));
      // Climate: the blinds as one row „Jalousien“ in the overview (owner, 27.10.2026: shading is climate and
      // security), opening the blinds popup of just those – not as single devices by room.
      if (cat === 'climate' && blindsOut.length && homeVar('climate_blinds') !== false
          && !chips.some(function (c) { return /casora_badge_climate_covers/.test(c.tpl || ''); })) {
        var h = document.querySelector('home-assistant'), S = (h && h.hass && h.hass.states) || {};
        var open = blindsOut.filter(function (id) { var st = S[id] || {}, p = Number((st.attributes || {}).current_position);
          return ['open', 'opening'].indexOf(st.state) >= 0 || (isFinite(p) && p > 0); }).length;
        chips.push({ blinds: blindsOut.slice(), title: 'Jalousien', icon: 'cover_open', ids: blindsOut.slice(),
          sub: open ? (open === 1 ? '1 geöffnet' : open + ' geöffnet') : (blindsOut.length > 1 ? 'Alle geschlossen' : 'Geschlossen') });
      }
      var watch = [];
      var add = function (x) { (x.ids || []).forEach(function (id) { if (watch.indexOf(id) < 0) watch.push(id); }); };
      chips.forEach(add);
      rooms.forEach(function (r) { r.tiles.forEach(add); });
      var badge = deep(haRoot(), function (n) { return n.localName === 'button-card' && tpls(n).indexOf(BADGE[cat]) >= 0 && n.getBoundingClientRect().width > 0; }, 1)[0];
      var sub = subOf(badge);
      var r = { chips: chips, rooms: rooms, watch: watch, sub: sub };
      P.last[cat] = r;
      return [r];
    })[0];
  };

  // A row opens the badge's or tile's own popup as a sub page. Its tap is replayed and caught before it runs,
  // so a tile whose tap switches (a lamp, a heating room) never switches from here.
  P.open = function (cat, kind, idx) {
    var r = P.last[cat];
    var item = r && (kind === 'c' ? r.chips[idx] : (function () {
      var k = 0;
      for (var i = 0; i < r.rooms.length; i++) for (var j = 0; j < r.rooms[i].tiles.length; j++) { if (k === idx) return r.rooms[i].tiles[j]; k++; }
      return null;
    })());
    if (item && item.blinds) {
      // The blinds popup (casora_popup_cover) of the climate popup's blinds, ‹ back to the climate popup.
      var prevB = window.casoraPopup && window.casoraPopup.current;
      if (prevB) window._casoraBackNext = { fn: function () { window.casoraPopup.open(prevB); }, at: Date.now() };
      // The dashboard's blinds tile popup if there is one, else the single blinds (34-security-covers.js).
      if (window.casoraOpenBlinds) window.casoraOpenBlinds(item.blinds);
      else if (window._casoraNotifyOpenViaCard) window._casoraNotifyOpenViaCard(item.blinds[0], function () {}, { type: 'custom:button-card',
        template: 'casora_popup_cover', entity: item.blinds[0], variables: { covers: item.blinds, room_name: 'Jalousien' } }, true);
      return;
    }
    if (item && item.cfg && !item.el) {
      var prevC = window.casoraPopup && window.casoraPopup.current;
      if (prevC) window._casoraBackNext = { fn: function () { window.casoraPopup.open(prevC); }, at: Date.now() };
      if (window._casoraNotifyOpenViaCard) window._casoraNotifyOpenViaCard(item.main, function (ok) {
        if (!ok && window.casoraPopup) window.casoraPopup.moreInfo(item.main); }, JSON.parse(JSON.stringify(item.cfg)), true);
      return;
    }
    var el = item && item.el;
    if (!el || typeof el._handleAction !== 'function') return;
    var done = false;
    // No popup of its own (e.g. a blind picked as a security entry: its sub-badge only switches): the device's own
    // tile popup – its tile's own config from the dashboard (openViaCard), else Casora's page for it.
    var fallback = function () {
      var id = item.main || (el && el._stateObj && el._stateObj.entity_id) || (item.ids || [])[0];
      if (!id || !window.casoraPopup) return;
      var prev = window.casoraPopup.current;
      var back = function () { if (prev) window._casoraBackNext = { fn: function () { window.casoraPopup.open(prev); }, at: Date.now() }; };
      back();
      if (window._casoraNotifyOpenViaCard) window._casoraNotifyOpenViaCard(id, function (ok) { if (!ok) { back(); window.casoraPopup.moreInfo(id); } }, null, true);
      else window.casoraPopup.moreInfo(id);
    };
    var take = function (ev) {
      if (done) return;
      done = true;
      ev.stopPropagation();
      ev.preventDefault();
      var c = (ev.detail && ev.detail.config) || {};
      var pop = ['tap_action', 'icon_tap_action', 'hold_action'].map(function (k) { return c[k] && c[k].casora_popup; })
        .filter(function (x) { return x && typeof x === 'object' && x.content; })[0];
      if (pop && window.casoraPopup) window.casoraPopup.sub(Object.assign({}, pop, { src: el }));
      else fallback();
    };
    el.addEventListener('hass-action', take, true);
    try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { done = true; fallback(); }
    setTimeout(function () {
      el.removeEventListener('hass-action', take, true);
      if (!done) { done = true; fallback(); }
    }, 600);
  };

  P.popup = function (cat, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI || !BADGE[cat]) return empty;
    var s = P.scan(cat);
    var call = function (part) {
      return 'return window._casoraPhoneHub ? window._casoraPhoneHub.sec(' + JSON.stringify(cat) + ', ' + JSON.stringify(part) + ', states, hass, this) : "";';
    };
    // Popup v3 (richtlinien §4 S7): the badge's words become the status stage; the overview rows stay as the list.
    var v3 = !!(UI.v3 && UI.v3() && UI.stage);
    var f = { list: { card: K.secCard(s.watch, call('list'), states || {}) } };
    if (v3) f.stage = { card: K.secCard(s.watch, call('stage'), states || {}) };
    else f.hero = { card: K.secCard(s.watch, call('hero'), states || {}) };
    return K.layout({ fields: f, top: v3 ? [] : ['hero'], stage: v3 ? 'stage' : null, left: ['list'], right: [] });
  };

  // What needs attention shows it on the icon (owner, 27.10.2026): Casora's own rules decide – security by
  // casoraSecurityLevel (lock open, door/window open or tilted, camera offline, alarm off/triggered), blinds by the
  // count of „Jalousien“ (#76), climate readings by the badge's word. Fine rows keep the calm tone.
  var SEC_DOM = /^(lock|binary_sensor|camera|alarm_control_panel|cover)\./;
  var CLIMATE_BAD = /^(Sehr schlecht|Sehr heiß|Sehr kalt)\b/, CLIMATE_WARN = /^(Schlecht|Mäßig|Heiß|Sehr trocken|Hoch)\b/;
  var levelOf = function (cat, item, hass) {
    if (cat === 'climate' && item.blinds) {
      var Cb = window._casoraSecCovers, sc = Cb && hass ? Cb.scan(hass.states, hass, hass.user) : null;
      return sc && sc.count && sc.open.some(function (id) { return item.blinds.indexOf(id) >= 0; }) ? 'warn' : 'ok';
    }
    if (cat === 'climate') return item.kind === 'c' ? (CLIMATE_BAD.test(item.sub) ? 'alarm' : CLIMATE_WARN.test(item.sub) ? 'warn' : 'ok') : 'ok';
    if (cat !== 'security' || !hass) return 'ok';
    if (/casora_badge_security_covers/.test(item.tpl || '')) {
      var C = window._casoraSecCovers;
      return C && C.count(hass.states, hass, hass.user, { place: 'home' }) > 0 ? 'warn' : 'ok';
    }
    var ids = (item.kind === 't' && item.main ? [item.main] : item.ids || []).filter(function (id) { return SEC_DOM.test(id); });
    return ids.length && window.casoraSecurityLevel ? window.casoraSecurityLevel(hass, ids) : 'ok';
  };
  // Klima readings in the air quality badge's tones, like their sub-badges (casoraComfortLevel, 01-basis.js).
  var AQ_WORD = { 'Ausgezeichnet': 0, 'Gut': 0, 'Mäßig': 1, 'Schlecht': 1, 'Sehr schlecht': 2 };
  var climateTone = function (item, hass) {
    var tpl = item.tpl || '', st = item.el && item.el._stateObj, C = window.casoraComfortColor, Lv = window.casoraComfortLevel;
    if (!C || !Lv) return null;
    // The badge's own reading: the average of its sensors when it has several (casoraAvgState, 01-basis.js).
    var ev = (item.el && item.el._evaledVariables) || {};
    var val = st && window.casoraAvgState ? window.casoraAvgState(hass, ev.avg_sensors, st) : st && st.state;
    if (/casora_badge_temp/.test(tpl) && st) {
      var u = (st.attributes && st.attributes.unit_of_measurement) || (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature);
      var lt = Lv('temp', val, u);
      return lt === null ? null : C(lt);
    }
    if (/casora_badge_humidity/.test(tpl) && st) { var lh = Lv('humidity', val); return lh === null ? null : C(lh); }
    if (/casora_badge_air_quality/.test(tpl)) {
      var w = String(item.sub || '').split(' · ')[0];
      return w in AQ_WORD ? C(AQ_WORD[w]) : null;
    }
    return undefined;
  };
  var tone = function (cat, item, hass) {
    if (cat === 'presence') return item.home ? 'accent' : null;
    if (cat === 'climate' && item.kind === 'c' && !item.blinds) {
      var ct = climateTone(item, hass);
      if (ct !== undefined) return ct;
    }
    var lv = levelOf(cat, item, hass);
    if (lv === 'ok') return null;
    var soft = window._casoraSoft && window._casoraSoft();
    return soft && window.casoraSecurityColor ? window.casoraSecurityColor(lv) : (lv === 'alarm' ? 'bad' : 'warn');
  };
  P.levelOf = levelOf;
  // Popup v3 stage S7: the badge's sub line as the sentence, the worst row's level as the traffic light. Security:
  // one main action – lock the unlocked locks among its rows, else close the blinds that count (#76).
  var STAGE_ICON = { security: 'mdi:shield-home', climate: 'mdi:home-thermometer', presence: 'mdi:account-group' };
  var stageOf = function (cat, s, S, hass) {
    var UI = window._casoraUI;
    var rows = s.chips.map(function (c) { return Object.assign({ kind: 'c' }, c); });
    if (!rows.length && !s.rooms.length) return UI.stage('status', { empty: { icon: 'mdi:information-outline',
      text: 'Hier gibt es noch keine Geräte', sub: 'Im Studio Kacheln zu Räumen hinzufügen', studio: true } });
    var o = { icon: STAGE_ICON[cat], text: s.sub || TITLE[cat] || '' };
    // Two findings in the dial, the rest counted – a long list ended in „· T…“ there (review 2, T03).
    var parts = String(o.text).split(' · ');
    if (parts.length > 3) o.text = parts.slice(0, 2).join(' · ') + ' · und ' + (parts.length - 2) + ' weitere';
    if (cat === 'presence') {
      var home = rows.filter(function (c) { return c.home; }).length;
      o.tone = home ? 'good' : 'off';
      // Counts in small letters after the number („2 unterwegs“, wortliste §2); the one the sentence already says
      // („1 unterwegs“ as the sentence and as a fact) is not repeated under it (final review, 01.11.2026).
      // A person HA does not know is counted as „unbekannt“, not „unterwegs“ (detail round #9).
      var unk = rows.filter(function (c) { return c.unk; }).length;
      if (rows.length) o.facts = [{ label: 'zuhause', value: String(home) }, { label: 'unterwegs', value: String(rows.length - home - unk) }]
        .concat(unk ? [{ label: 'unbekannt', value: String(unk) }] : [])
        .filter(function (f) { return (f.value + ' ' + f.label).toLowerCase() !== String(o.text).trim().toLowerCase(); });
      // Dial (richtlinien §4.8): one segment per person, green at home, grey away.
      o.segs = rows.map(function (c) { return { ok: true, tone: c.home ? 'good' : 'off', label: c.title || c.name || '' }; });
      return UI.stage('status', o);
    }
    // Climate (detail round #22): the badge's sub is a bare number („21°“, small and without a word) – the dial says how
    // it is („Angenehm“, from the temperature row) and the readings as facts („Temperatur 21°“, „Luftfeuchtigkeit 55 %“).
    if (cat === 'climate' && /^[\d−-]/.test(String(o.text).trim())) {
      var wordC = null, factsC = [];
      rows.forEach(function (c) {
        var pp = String(c.sub || '').split(' · ');
        if (pp.length < 2 || !/\d/.test(pp[pp.length - 1])) return;
        if (!wordC && /[A-Za-zÄÖÜäöü]/.test(pp[0]) && !/\d/.test(pp[0])) wordC = pp[0];
        if (factsC.length < 3) factsC.push({ label: c.title || '', value: pp[pp.length - 1] });
      });
      if (wordC) { o.text = wordC; o.facts = factsC; }
    }
    var lv = rows.map(function (c) { return levelOf(cat, c, hass); });
    o.tone = lv.indexOf('alarm') >= 0 ? 'bad' : lv.indexOf('warn') >= 0 ? 'warn' : 'good';
    // Dial: one segment per row (lock, contact, room …) in its traffic-light colour.
    o.segs = rows.map(function (c, i) { return { ok: lv[i] === 'ok', tone: lv[i] === 'alarm' ? 'bad' : lv[i] === 'warn' ? 'warn' : 'good', label: c.title || c.name || '' }; });
    if (cat === 'security') {
      var ids = [];
      rows.forEach(function (c) { (c.ids || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
      var locks = ids.filter(function (id) { return id.indexOf('lock.') === 0 && S[id] && S[id].state === 'unlocked'; });
      var Cv = window._casoraSecCovers, sc = Cv && hass ? Cv.scan(S, hass, hass.user) : null;
      var covers = sc && sc.count ? sc.open.filter(function (id) { var x = Cv.closeSvc(id, S[id]); return x && x.service === 'close_cover'; }) : [];
      // One word: „Alle verriegeln“ ran out of the round button (review 2, T03).
      if (locks.length) o.action = { text: 'Verriegeln', icon: 'mdi:lock', primary: true,
        svc: { domain: 'lock', service: 'lock', data: { entity_id: locks } } };
      else if (covers.length) o.action = { text: 'Schließen', icon: 'mdi:arrow-collapse-down', primary: true,
        svc: { domain: 'cover', service: 'close_cover', data: { entity_id: covers } } };
    }
    return UI.stage('status', o);
  };
  /* The rows mirror Home's badges, which may draw their new state after this card (fam-03: locked, the sentence still
     said „Schloss offen“). Look again shortly after each update; when the badges changed since, draw again. */
  var sigOf = function (s) { return [s.sub].concat(s.chips.map(function (c) { return c.title + ':' + c.sub; })).join('|'); };
  var recheck = function (cat, el, sig) {
    if (!el || typeof el.requestUpdate !== 'function') return;
    [350, 1200].forEach(function (ms, i) {
      clearTimeout((el._casoraHubT || [])[i]);
      (el._casoraHubT = el._casoraHubT || [])[i] = setTimeout(function () {
        if (!el.isConnected) return;
        memo[cat] = null;
        if (sigOf(P.scan(cat)) !== sig) el.requestUpdate();
      }, ms);
    });
  };
  P.sigOf = sigOf;
  P.sec = function (cat, part, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI) return '';
    // Re-read once per update (hero comes first): the cards it mirrors have drawn their new state by then.
    if (part === 'hero' || part === 'stage') memo[cat] = null;
    var s = P.scan(cat);
    recheck(cat, el, sigOf(s));
    if (part === 'hero') return UI.line(s.sub || TITLE[cat] || '', [], {});
    if (part === 'stage') return stageOf(cat, s, states || (hass && hass.states) || {}, hass);
    if (part !== 'list') return '';
    var out = [];
    if (s.chips.length) {
      out.push(UI.group(s.chips.map(function (c, i) {
        var row = { icon: c.icon || 'mdi:shield-home', label: c.title, labelLit: true, sub: c.sub, page: 'phub|' + cat + '|c|' + i };
        var t = tone(cat, Object.assign({ kind: 'c' }, c), hass);
        if (t) row.iconTone = t;
        return row;
      }), cat === 'presence' ? 'Personen' : 'Übersicht'));
    }
    var k = 0;
    // Owner (27.10.2026): Sicherheit and Klima show only their overview rows – the devices by room are gone.
    (cat === 'security' || cat === 'climate' ? [] : s.rooms).forEach(function (r) {
      out.push(UI.group(r.tiles.map(function (t) {
        var row = { icon: t.icon || 'mdi:devices', label: t.title, labelLit: true, sub: t.sub, page: 'phub|' + cat + '|t|' + (k++) };
        var tn = tone(cat, Object.assign({ kind: 't' }, t), hass);
        if (tn) row.iconTone = tn;
        return row;
      }), r.name || null));
    });
    if (!out.length) {
      return UI.empty ? UI.empty({ icon: 'mdi:information-outline', text: 'Hier gibt es noch keine Geräte',
        sub: 'Im Studio Kacheln zu Räumen hinzufügen', studio: true }) : '';
    }
    return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 22px);">' + out.join('') + '</div>';
  };

  if (window._casoraUI && window._casoraUI.page) {
    window._casoraUI.page('phub', function (arg) {
      var a = String(arg || '').split('|');
      P.open(a[0], a[1], Number(a[2]) || 0);
    });
  } else {
    (window._casoraPages || (window._casoraPages = {})).phub = function (arg) {
      var a = String(arg || '').split('|');
      P.open(a[0], a[1], Number(a[2]) || 0);
    };
  }
})();
