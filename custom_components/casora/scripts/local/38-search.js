// ── Search: rooms, devices and scenes (phone's Home field, ⌘K / Ctrl+K on the desktop) ─────────────────────────
// Variant A of the room search (01.11.2026): a field under the title of the phone's Home (casora_mobile_weather,
// custom field "search") opens a sheet with the results grouped as ROOMS (tap opens the room), DEVICES (switch in
// the row for switchable domains, tap opens the device's Casora popup) and SCENES (tap starts). On the desktop
// ⌘K / Ctrl+K opens the same search as a dialog.
// Only what the open dashboard shows and what "Who sees this?" lets the user see: rooms, tiles and the room badges'
// devices of this dashboard, the scenes of its scene menu. Matching ignores case, umlauts and accents
// ("kuche" → "Küche"), a prefix ranks before a word start before a part of a word, at most 8 per group.
// Recently opened results are kept per device (localStorage) and shown while the field is empty.
//   window._casoraSearch.fold(s)                     → { s, map }  folded text and its index map
//   window._casoraSearch.match(name, query, room)    → { score, name: [[a, b]…], room: [[a, b]…] } or null
//   window._casoraSearch.index(cfg, hass, user, o)   → { phone, rooms, devices, scenes }  (o.url: dashboard path)
//   window._casoraSearch.query(idx, q, max)          → { rooms, devices, scenes, total }
//   window._casoraSearch.recent / remember(item)     – recently opened (per device)
//   window._casoraSearch.open(o) / close()           – the sheet (o.from: element to return the focus to)
(function () {
  if (window._casoraSearch) return;
  var S = window._casoraSearch = {};
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var MAX = 8;
  var TOGGLE = ['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'siren'];
  var RUN = ['scene', 'script'];
  var RECENT_KEY = 'casora.search.recent';

  // ── Folding and ranking ───────────────────────────────────────────────────────────────────────────────────
  var SPECIAL = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ı': 'i' };
  var UML = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' };
  // Lower case without accents; map[i] = index of the original character behind folded character i.
  // umlauts: true spells ä/ö/ü as ae/oe/ue (so "kueche" finds "Küche" as well).
  S.fold = function (str, umlauts) {
    var src = String(str == null ? '' : str), out = '', map = [];
    for (var i = 0; i < src.length; i++) {
      var c = src[i].toLowerCase();
      var f = umlauts && UML[c] ? UML[c] : SPECIAL[c] || (c.normalize ? c.normalize('NFD').replace(/[̀-ͯ]/g, '') : c);
      for (var k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
    }
    return { s: out, map: map };
  };
  var isWordChar = function (ch) { return /[a-z0-9]/.test(ch || ''); };
  var tokensOf = function (q) { return S.fold(q).s.split(/[^a-z0-9]+/).filter(Boolean); };

  // Best hit of one token in a folded text: 3 = start of the text, 2 = start of a word, 1 = part of a word.
  function hit(f, t) {
    var best = null, at = f.indexOf(t);
    while (at >= 0) {
      var lvl = at === 0 ? 3 : !isWordChar(f[at - 1]) || (/[0-9]/.test(f[at - 1]) !== /[0-9]/.test(t[0])) ? 2 : 1;
      if (!best || lvl > best.lvl) best = { lvl: lvl, at: at };
      if (lvl === 3) break;
      at = f.indexOf(t, at + 1);
    }
    return best;
  }
  var SCORE = { 3: 100, 2: 70, 1: 40 };
  // Ranges in the original text for a hit in the folded one.
  function span(fm, at, len) { return [fm.map[at], fm.map[at + len - 1] + 1]; }
  function merge(r) {
    r.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    r.forEach(function (x) { var l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); });
    return out;
  }

  // Every word of the query must be found, in the name or (weaker) in the room's name.
  S.match = function (name, query, room) {
    var toks = Array.isArray(query) ? query : tokensOf(query);
    if (!toks.length) return null;
    var variants = [S.fold(name), S.fold(name, true)];
    var rvariants = room ? [S.fold(room), S.fold(room, true)] : [];
    var total = 0, nr = [], rr = [], inName = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], best = null;
      variants.forEach(function (fm) { var h = hit(fm.s, t); if (h && (!best || SCORE[h.lvl] > best.score)) best = { score: SCORE[h.lvl], r: span(fm, h.at, t.length), room: false }; });
      rvariants.forEach(function (fm) {
        var h = hit(fm.s, t);
        // The room only by a prefix or a word start, and weaker than any hit in the name.
        if (h && h.lvl >= 2 && (!best || 25 > best.score)) best = { score: h.lvl === 3 ? 25 : 18, r: span(fm, h.at, t.length), room: true };
      });
      if (!best) return null;
      total += best.score;
      if (best.room) rr.push(best.r); else { nr.push(best.r); inName++; }
    }
    var whole = S.fold(name).s.trim();
    if (whole === toks.join(' ')) total += 60;
    // Shorter names first among equals (a closer match), never more than a level.
    total -= Math.min(15, whole.length / 4);
    if (!inName) total -= 10;
    return { score: total, name: merge(nr), room: merge(rr) };
  };

  // ── What the dashboard shows ──────────────────────────────────────────────────────────────────────────────
  var userOf = function () { try { var h = document.querySelector('home-assistant'); return (h && h.hass && h.hass.user) || null; } catch (e) { return null; } };
  var allowed = function (list, user) { return !Array.isArray(list) || !list.length ? true : !!(user && user.id && list.indexOf(user.id) >= 0); };
  // "Who sees this?" on a card (visibility with condition "user") – as casora-smart-row and the filter overlay.
  function hiddenFor(c, user) {
    return Array.isArray(c && c.visibility) && c.visibility.some(function (v) {
      return v && v.condition === 'user' && Array.isArray(v.users) && !(user && user.id && v.users.indexOf(user.id) >= 0);
    });
  }
  function cardOff(c, user, phone) {
    if (hiddenFor(c, user)) return true;
    var v = (c && c.variables) || {};
    var en = v.enabled;
    if (en === false || en === 'false' || en === 0 || en === '0') return true;
    return !!phone && v.surfaces === 'desktop';
  }
  var tpls = function (c) { return [].concat((c && c.template) || []).map(String); };
  var NOT_TILE = /badge|chip|header|mobile_|scene_row|^casora_room$|weather|_nav|popup_/;
  var isTile = function (c) { var t = tpls(c); return t.length > 0 && !t.some(function (n) { return NOT_TILE.test(n); }); };
  var plain = function (s) { return typeof s === 'string' && s.trim() && s.indexOf('[[[') < 0 ? s.trim() : ''; };
  var isPhoneCfg = function (cfg) {
    var hit = false;
    (function walk(o, d) {
      if (hit || !o || typeof o !== 'object' || d > 4) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; }
      if (o.type === 'custom:casora-mobile-nav' || tpls(o).indexOf('casora_mobile_bg') >= 0) { hit = true; return; }
      if (o.cards) walk(o.cards, d + 1);
    })(((cfg && cfg.views) || []).map(function (v) { return v && v.cards; }), 0);
    return hit;
  };
  S.isPhoneCfg = isPhoneCfg;
  // Casora dashboard at all (⌘K only there): a Casora card in the config.
  S.isCasoraCfg = function (cfg) {
    if (!cfg || !Array.isArray(cfg.views)) return false;
    var s = '';
    try { s = JSON.stringify(cfg.views).slice(0, 400000); } catch (e) { return false; }
    return /"template":\s*\[?\s*"casora_|"custom:casora-/.test(s);
  };

  // Entities the room badges stand for (lights, heating, media, locks) – they have no tile of their own.
  var BADGE_KEYS = /^(light_entity_\d+|light_group_entity|climate_entity_\d+|media_player_\d+|security_lock_entity(_2)?)$/;
  function badgeEntities(vars) {
    var out = [];
    Object.keys(vars || {}).forEach(function (k) {
      var x = vars[k];
      if (BADGE_KEYS.test(k) && typeof x === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x) && out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }

  S.index = function (cfg, hass, user, o) {
    o = o || {};
    var states = (hass && hass.states) || {};
    var phone = o.phone != null ? !!o.phone : isPhoneCfg(cfg);
    var idx = { phone: phone, rooms: [], devices: [], scenes: [] };
    var seen = {}, sceneSeen = {};
    var sees = function (id) { return !window.casoraSeesEntity || window.casoraSeesEntity(id, user); };
    var nameOf = function (id, card) {
      var st = states[id];
      return plain(card && card.name) || (st && st.attributes && plain(st.attributes.friendly_name)) || id;
    };
    var addScene = function (id, card, room) {
      if (sceneSeen[id] || !states[id] || !sees(id)) return;
      sceneSeen[id] = true;
      idx.scenes.push({ kind: 'scene', id: id, name: nameOf(id, card), room: room || areaName(hass, id) });
    };
    var addDevice = function (id, card, room) {
      if (typeof id !== 'string' || !states[id] || !sees(id)) return;
      var dom = id.split('.')[0];
      if (RUN.indexOf(dom) >= 0) { addScene(id, card, room); return; }
      var had = seen[id];
      if (had) { if (!had.room && room) had.room = room; if (!had.card && card) had.card = card; return; }
      var d = seen[id] = { kind: 'device', id: id, name: nameOf(id, card), room: room || null, card: card || null };
      idx.devices.push(d);
    };
    var collect = function (c, room, depth) {
      if (!c || typeof c !== 'object' || depth > 8) return;
      if (Array.isArray(c)) { c.forEach(function (x) { collect(x, room, depth + 1); }); return; }
      if (cardOff(c, user, phone)) return;
      if (c.type === 'custom:casora-filter-overlay' || c.type === 'custom:casora-mobile-nav' || c.type === 'custom:casora-nav') return;
      if (c.type === 'conditional' && c.card) {
        // A tile behind a condition stands for itself; its own config opens the popup.
        collect(c.card, room, depth + 1);
        return;
      }
      if (c.type === 'custom:button-card' && typeof c.entity === 'string' && isTile(c)) addDevice(c.entity, c, room);
      if (c.cards) collect(c.cards, room, depth + 1);
      if (c.card) collect(c.card, room, depth + 1);
    };
    var views = (cfg && cfg.views) || [];

    if (phone) {
      var nav = null, user0 = user;
      (function find(x, d) {
        if (nav || !x || typeof x !== 'object' || d > 6) return;
        if (Array.isArray(x)) { x.forEach(function (y) { find(y, d + 1); }); return; }
        if (x.type === 'custom:casora-mobile-nav') { nav = x; return; }
        if (x.cards) find(x.cards, d + 1);
      })(views.map(function (v) { return v && v.cards; }), 0);
      var hiddenRooms = {};
      var navRooms = (nav && Array.isArray(nav.rooms) ? nav.rooms : []).filter(function (r) { return r && r.key && (r.name || r.label); });
      navRooms.forEach(function (r) {
        if (!allowed(r.users, user0)) { hiddenRooms[String(r.name || '').trim()] = true; return; }
        idx.rooms.push({ kind: 'room', id: r.key, key: r.key, name: String(r.label || r.name), icon: r.icon || null });
      });
      // Home's sections: a room header and the tile row after it.
      var walkRow = function (cards, depth) {
        if (!Array.isArray(cards) || depth > 5) return;
        var room = null, roomHidden = false, header = false;
        cards.forEach(function (c) {
          if (!c || typeof c !== 'object') return;
          if (tpls(c).indexOf('casora_mobile_header') >= 0) {
            header = true;
            var v = c.variables || {};
            var nm = plain(c.name);
            var fav = v.favorites === true || (v.favorites !== false && /^(favorites|favoriten)$/i.test(nm));
            var scenes = /^(scenes|szenen)$/i.test(nm);
            room = fav || scenes ? null : nm || null;
            roomHidden = hiddenFor(c, user) || v.casora_hidden === true || !allowed(v.casora_users, user) || (!!room && !!hiddenRooms[room]);
            return;
          }
          if (c.type === 'custom:casora-smart-row' && header) {
            if (!roomHidden && !hiddenFor(c, user)) collect(c.cards, room, depth + 1);
            header = false;
            return;
          }
          if (c.type === 'custom:casora-smart-row') walkRow(c.cards, depth + 1);
          else if (!/casora-filter-overlay|casora-mobile-nav/.test(String(c.type))) collect(c, null, depth + 1);
        });
      };
      views.forEach(function (v) { if (v && allowed(((v.visible || []).map ? (v.visible || []) : []).map(function (x) { return x && x.user; }).filter(Boolean), user)) walkRow(v.cards, 0); });
      // Rooms without a nav (older phone layouts): their headers.
      if (!navRooms.length) {
        (function hdr(x, d) {
          if (!x || typeof x !== 'object' || d > 6) return;
          if (Array.isArray(x)) { x.forEach(function (y) { hdr(y, d + 1); }); return; }
          if (x.type === 'custom:casora-filter-overlay' && plain(x.room) && !/^(scenes|szenen)$/i.test(plain(x.room))) {
            var nm = plain(x.room);
            var key = x.filter_category || 'room_' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (!idx.rooms.some(function (r) { return r.key === key; })) idx.rooms.push({ kind: 'room', id: key, key: key, name: nm, icon: null });
          }
          if (x.cards) hdr(x.cards, d + 1);
        })(views.map(function (v) { return v && v.cards; }), 0);
      }
      // The room badges' devices: the desktop room's variables come from the server (casoraPhoneRoom).
      var PR = window.casoraPhoneRoom, list = null;
      try { list = PR && PR.rooms ? PR.rooms() : null; } catch (e) { list = null; }
      (list || []).forEach(function (r) {
        var nm = String((r && r.name) || '').trim();
        if (!nm || hiddenRooms[nm]) return;
        var vars = (r && r.vars) || {};
        if (vars.casora_hidden === true || !allowed(vars.casora_users, user)) return;
        var shown = idx.rooms.some(function (x) { return x.name === nm; });
        if (!shown) return;
        badgeEntities(vars).forEach(function (id) { addDevice(id, null, nm); });
      });
    } else {
      var dash = o.url || '';
      var routes = null;
      (function find(x, d) {
        if (routes || !x || typeof x !== 'object' || d > 8) return;
        if (Array.isArray(x)) { x.forEach(function (y) { find(y, d + 1); }); return; }
        if (x.type === 'custom:casora-nav' && Array.isArray(x.routes)) { routes = x.routes; return; }
        ['cards', 'card'].forEach(function (k) { if (x[k]) find(x[k], d + 1); });
      })(views.map(function (v) { return v && v.cards; }), 0);
      views.forEach(function (v, i) {
        if (!v || typeof v !== 'object') return;
        var vis = Array.isArray(v.visible) ? v.visible.map(function (x) { return x && x.user; }).filter(Boolean) : null;
        if (v.visible === false || (Array.isArray(v.visible) && !allowed(vis, user))) return;
        var cards = v.cards || [];
        var hero = cards.filter(function (c) { return c && tpls(c).indexOf('casora_room') >= 0; })[0] || null;
        var path = v.path || String(i);
        var url = '/' + dash + '/' + path;
        var route = (routes || []).filter(function (r) { return r && r.url && String(r.url).replace(/\/+$/, '') === url; })[0] || null;
        if (route && !allowed(route.users, user)) return;
        var hv = (hero && hero.variables) || {};
        var home = path === 'home' || (route && route.auto === 'home') || (!routes && i === 0);
        var nm = plain(hero && hero.name) || plain(route && route.label) || plain(v.title) || path;
        if (!home) idx.rooms.push({ kind: 'room', id: url, url: url, name: nm, icon: roomIcon(hv.room_icon) || (route && route.icon) || null });
        var room = home ? null : nm;
        cards.forEach(function (c) { if (c !== hero) collect(c, room, 0); });
        badgeEntities(hv).forEach(function (id) { addDevice(id, null, room); });
      });
    }

    // Scenes: the scene menu's (same selection and exclusions), when the dashboard has scenes at all.
    var sc = null, hasScenes = false;
    (function find(x, d) {
      if (!x || typeof x !== 'object' || d > 8) return;
      if (Array.isArray(x)) { x.forEach(function (y) { find(y, d + 1); }); return; }
      if (tpls(x).indexOf('casora_scene_row') >= 0 || x.type === 'custom:casora-mobile-nav') hasScenes = true;
      var vv = x.variables && typeof x.variables === 'object' ? x.variables : null;
      [x, vv].forEach(function (s) {
        if (!sc && s && (Array.isArray(s.scenes) || Array.isArray(s.scene_exclude))) sc = s;
      });
      ['cards', 'card'].forEach(function (k) { if (x[k]) find(x[k], d + 1); });
    })(views.map(function (v) { return v && v.cards; }), 0);
    if (hasScenes && typeof window.casoraNavScenes === 'function') {
      var ids = [];
      try { ids = window.casoraNavScenes(hass, (sc && sc.scene_exclude) || []); } catch (e) { ids = []; }
      var pick = sc && Array.isArray(sc.scenes) ? sc.scenes.filter(function (id) { return states[id]; }) : [];
      if (pick.length) ids = pick.filter(function (id) { return ((sc && sc.scene_exclude) || []).indexOf(id) < 0; });
      ids.forEach(function (id) { addScene(id, null, null); });
    }
    return idx;
  };

  // A room's own symbol from the Studio (variables.room_icon: a glyph name or a path), as the phone's bar shows it.
  function roomIcon(g) {
    if (typeof g !== 'string' || !g.trim()) return null;
    g = g.trim();
    if (/^mdi:/.test(g) || g.charAt(0) === '/') return g;
    return /^[a-z0-9-]+$/.test(g) ? '/casora_assets/icons/' + g + '.svg' : null;
  }
  function areaName(hass, id) {
    var e = (hass && hass.entities && hass.entities[id]) || null;
    var aid = e && (e.area_id || (e.device_id && hass.devices && hass.devices[e.device_id] ? hass.devices[e.device_id].area_id : null));
    var a = aid && hass.areas && hass.areas[aid];
    return (a && a.name) || null;
  }

  S.query = function (idx, q, max) {
    var toks = tokensOf(q), n = max || MAX;
    var out = { rooms: [], devices: [], scenes: [], total: 0 };
    if (!toks.length || !idx) return out;
    ['rooms', 'devices', 'scenes'].forEach(function (g) {
      var hits = [];
      (idx[g] || []).forEach(function (it) {
        var m = S.match(it.name, toks, g === 'rooms' ? null : it.room);
        if (m) hits.push({ item: it, m: m });
      });
      hits.sort(function (a, b) { return b.m.score - a.m.score || String(a.item.name).localeCompare(String(b.item.name)); });
      out[g] = hits.slice(0, n);
      out.total += out[g].length;
    });
    return out;
  };

  // ── Recently opened (per device) ──────────────────────────────────────────────────────────────────────────
  S.recent = function () {
    try { var r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r.filter(function (x) { return x && x.kind && x.id; }) : []; }
    catch (e) { return []; }
  };
  S.remember = function (it) {
    if (!it || !it.kind || !it.id) return;
    try {
      var r = S.recent().filter(function (x) { return !(x.kind === it.kind && x.id === it.id); });
      r.unshift({ kind: it.kind, id: it.id });
      localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 6)));
    } catch (e) { /* private mode: no history */ }
  };
  S.recentItems = function (idx) {
    if (!idx) return [];
    return S.recent().map(function (x) {
      var g = x.kind === 'room' ? idx.rooms : x.kind === 'scene' ? idx.scenes : idx.devices;
      return (g || []).filter(function (it) { return it.id === x.id; })[0] || null;
    }).filter(Boolean).slice(0, 6);
  };

  // ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────
  var hassNow = function () { try { var h = document.querySelector('home-assistant'); return (h && h.hass) || null; } catch (e) { return null; } };
  S.canToggle = function (hass, id) {
    var st = hass && hass.states && hass.states[id];
    if (!st || TOGGLE.indexOf(id.split('.')[0]) < 0) return false;
    // "Ask before switching" (confirm_toggle): the popup asks, so no switch in the row.
    if (Array.isArray(window.__casoraConfirmIds) && window.__casoraConfirmIds.indexOf(id) >= 0) return false;
    if (Array.isArray((st.attributes || {}).entity_id) && id.indexOf('light.') !== 0 && id.indexOf('switch.') !== 0) return false;
    return true;
  };
  function openRoom(it) {
    if (it.url) {
      if (String(location.pathname).replace(/\/+$/, '') !== it.url) {
        history.pushState(null, '', it.url);
        window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      }
      return;
    }
    var HF = window._casoraFilter, h = hassNow();
    if (HF) { HF.set(it.key); HF.share(h, it.key); }
    else if (h) h.callService('input_select', 'select_option', { entity_id: 'input_select.casora_mobile_filter', option: it.key });
  }
  function openDevice(it) {
    var id = it.id, P = window.casoraPopup;
    var fallback = function () {
      if (P) P.moreInfo(id);
      else {
        var ha = document.querySelector('home-assistant');
        if (ha) ha.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: id } }));
      }
    };
    var card = it.card ? JSON.parse(JSON.stringify(it.card)) : null;
    if (card && P && P.enabled !== false && window._casoraNotifyOpenViaCard) {
      window._casoraNotifyOpenViaCard(id, function (ok) { if (!ok) fallback(); }, card, true);
    } else fallback();
  }
  function runScene(it) {
    var h = hassNow();
    if (!h) return;
    h.callService(it.id.split('.')[0], 'turn_on', { entity_id: it.id });
  }
  function toggle(it) {
    var h = hassNow();
    if (!h || !S.canToggle(h, it.id)) return;
    var dom = it.id.split('.')[0];
    h.callService(dom === 'light' || dom === 'switch' || dom === 'fan' || dom === 'input_boolean' || dom === 'humidifier' || dom === 'siren' ? dom : 'homeassistant', 'toggle', { entity_id: it.id });
  }
  S._actions = { openRoom: openRoom, openDevice: openDevice, runScene: runScene, toggle: toggle };

  // ── The sheet ─────────────────────────────────────────────────────────────────────────────────────────────
  var CSS = ''
    + '.cs-root{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:10050;box-sizing:border-box;font-family:var(--paper-font-body1_-_font-family, var(--ha-font-family-body, -apple-system, system-ui, sans-serif));'
    + '-webkit-tap-highlight-color:transparent;color:var(--casora-menu-fg, #fff);}'
    + '.cs-root *{box-sizing:border-box;}'
    + '.cs-scrim{position:absolute;inset:0;background:var(--casora-search-scrim, color-mix(in srgb, var(--primary-background-color, #1c1c1e) 86%, transparent));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);opacity:0;transition:opacity 200ms ease;}'
    + '.cs-root.in .cs-scrim{opacity:1;}'
    + '.cs-wrap{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;gap:var(--casora-space-2, 8px);'
    + 'padding:calc(env(safe-area-inset-top, 0px) + 12px) max(env(safe-area-inset-right, 0px), var(--casora-rail-left, 16px)) 12px max(env(safe-area-inset-left, 0px), var(--casora-rail-left, 16px));}'
    + '.cs-bar{position:relative;isolation:isolate;display:flex;align-items:center;gap:var(--casora-space-3, 12px);}'
    // Phone: the header strip behind field and "Abbrechen" is the sheet's own opaque pane, edge to edge.
    + '.cs-root:not(.desk) .cs-bar::before{content:"";position:absolute;z-index:-1;left:calc(-1 * max(env(safe-area-inset-left, 0px), var(--casora-rail-left, 16px)));'
    + 'right:calc(-1 * max(env(safe-area-inset-right, 0px), var(--casora-rail-left, 16px)));top:calc(-12px - env(safe-area-inset-top, 0px));bottom:-8px;'
    + 'background:var(--cs-pane, var(--primary-background-color));box-shadow:var(--casora-shadow-rest, none);}'
    + '.cs-field{flex:1;min-width:0;display:flex;align-items:center;gap:var(--casora-space-2, 8px);height:44px;padding:0 12px;border-radius:var(--casora-r-element, 18px);'
    + 'background:var(--casora-search-field, color-mix(in srgb, currentColor 9%, transparent));color:inherit;}'
    + '.cs-field svg{flex:none;width:18px;height:18px;opacity:.6;}'
    + '.cs-in{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:var(--casora-fs-row, 16px);-webkit-appearance:none;appearance:none;padding:0;}'
    + '.cs-in::-webkit-search-cancel-button{display:none;}'
    + '.cs-in::placeholder{color:currentColor;opacity:.55;}'
    + '.cs-clear{flex:none;width:28px;height:28px;margin-right:-6px;border:0;border-radius:50%;background:transparent;color:inherit;opacity:.5;font-size:18px;line-height:1;cursor:pointer;display:none;}'
    + '.cs-root.typed .cs-clear{display:block;}'
    + '.cs-cancel{flex:none;min-height:44px;padding:0 4px;border:0;background:transparent;color:var(--casora-popup-ui-action, var(--primary-text-color, #fff));font:inherit;font-size:var(--casora-fs-row, 16px);font-weight:600;cursor:pointer;}'
    + '.cs-esc{display:none;flex:none;font-size:var(--casora-fs-label, 12px);opacity:.55;border:1px solid currentColor;border-radius:6px;padding:1px 6px;}'
    + '.cs-panel{position:relative;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:var(--casora-menu-pad, 8px);'
    + 'transform:translateY(-6px);opacity:0;transition:opacity 200ms var(--casora-ease-enter, ease),transform var(--casora-dur-enter, 260ms) var(--casora-ease-enter, ease);}'
    + '.cs-root.in .cs-panel{transform:none;opacity:1;}'
    + '.cs-panel[hidden]{display:none;}'
    + '.cs-sec{font-size:var(--casora-fs-label, 12px);font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.6;margin:12px 12px 4px;}'
    + '.cs-sec:first-child{margin-top:4px;}'
    + '.cs-row{display:flex;align-items:center;gap:4px;min-height:52px;border-radius:var(--casora-menu-row-radius, 26px);}'
    + '.cs-main{flex:1;min-width:0;display:flex;align-items:center;gap:var(--casora-menu-ic-gap, 12px);min-height:52px;padding:6px 10px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;}'
    + '.cs-main:hover,.cs-main:focus-visible{background:var(--casora-soft-row-active, rgba(127,127,127,.14));outline:none;}'
    + '.cs-main:active{transform:scale(var(--casora-press-scale, .97));}'
    + '.cs-ic{flex:none;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
    + 'background:color-mix(in srgb, var(--cs-tone, var(--casora-color-teal, #4E9E95)) 22%, transparent);color:var(--cs-tone, var(--casora-color-teal, #4E9E95));--mdc-icon-size:20px;}'
    + '.cs-ic i{display:block;width:20px;height:20px;background:currentColor;-webkit-mask:var(--cs-svg) center/contain no-repeat;mask:var(--cs-svg) center/contain no-repeat;}'
    + '.cs-tx{flex:1;min-width:0;display:flex;flex-direction:column;}'
    + '.cs-name{font-size:var(--casora-fs-row, 15px);font-weight:600;line-height:1.25;overflow-wrap:anywhere;}'
    + '.cs-sub{font-size:var(--casora-fs-sub, 13px);opacity:.62;line-height:1.3;overflow-wrap:anywhere;}'
    + '.cs-go{flex:none;opacity:.45;font-size:20px;padding:0 4px;}'
    + '.cs-start{flex:none;font-size:var(--casora-fs-sub, 13px);font-weight:600;color:var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95));padding:0 4px;}'
    + '.cs-root mark{background:color-mix(in srgb, var(--casora-color-yellow, #E8B04A) 45%, transparent);color:inherit;border-radius:3px;padding:0 1px;}'
    + '.cs-sw{flex:none;position:relative;width:51px;height:44px;margin-right:6px;border:0;background:transparent;cursor:pointer;padding:0;}'
    + '.cs-sw::before{content:"";position:absolute;left:3px;top:9px;width:45px;height:26px;border-radius:13px;background:var(--casora-search-sw-off, rgba(127,127,127,.35));transition:background 160ms ease;}'
    + '.cs-sw::after{content:"";position:absolute;left:6px;top:12px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:var(--casora-shadow-rest, 0 1px 3px rgba(0,0,0,.25));transition:transform 160ms var(--casora-ease-feedback, ease);}'
    + '.cs-sw[aria-checked="true"]::before{background:var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95));}'
    + '.cs-sw[aria-checked="true"]::after{transform:translateX(19px);}'
    + '.cs-sw:focus-visible{outline:2px solid var(--casora-popup-ui-action, #4E9E95);outline-offset:-2px;border-radius:22px;}'
    + '.cs-sw[disabled]{opacity:.4;cursor:default;}'
    + '.cs-empty{padding:16px 12px;opacity:.65;font-size:var(--casora-fs-value, 14px);}'
    + '.cs-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
    // Desktop: a dialog in the middle, the field inside the window.
    + '.cs-root.desk .cs-wrap{left:50%;top:12vh;right:auto;width:min(640px, calc(100vw - 32px));transform:translateX(-50%);padding:0;gap:0;'
    + 'border-radius:var(--casora-menu-radius, 34px);overflow:hidden;}'
    + '.cs-root.desk .cs-bar{padding:var(--casora-menu-pad, 8px) var(--casora-menu-pad, 8px) 0;}'
        + '.cs-root.desk .cs-scrim{background:var(--casora-search-scrim-desk, rgba(0,0,0,.28));}'
    + '.cs-root.desk .cs-cancel{display:none;}'
    + '.cs-root.desk .cs-esc{display:inline-block;margin-right:6px;}'
    + '.cs-root.desk .cs-panel{max-height:min(60vh, 560px);transform:none;}'
    + '@media (prefers-reduced-motion: reduce){.cs-scrim,.cs-panel,.cs-sw::after{transition:none !important;}}';

  var ICON_SEARCH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13 13l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var TONE = { light: 'light', switch: 'general', fan: 'general', climate: 'heat', water_heater: 'heat', media_player: 'media',
    lock: 'alert', alarm_control_panel: 'alert', camera: 'alert', cover: 'general', vacuum: 'general', sensor: 'general' };

  var ui = null;     // { root, wrap, input, panel, live, list }
  var state = { idx: null, q: '', from: null, timer: null, statesAt: null, vvOff: null };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  // Text with <mark> around the hit ranges, without innerHTML.
  function marked(text, ranges) {
    var f = document.createDocumentFragment(), s = String(text || ''), at = 0;
    (ranges || []).forEach(function (r) {
      if (r[0] > at) f.appendChild(document.createTextNode(s.slice(at, r[0])));
      f.appendChild(el('mark', null, s.slice(r[0], r[1])));
      at = r[1];
    });
    if (at < s.length) f.appendChild(document.createTextNode(s.slice(at)));
    return f;
  }
  function iconFor(it, hass) {
    var box = el('span', 'cs-ic');
    var tone = it.kind === 'room' ? 'general' : it.kind === 'scene' ? 'light' : (TONE[it.id.split('.')[0]] || 'general');
    box.style.setProperty('--cs-tone', 'var(--casora-tone-' + tone + ', var(--casora-color-teal, #4E9E95))');
    if (it.kind === 'room' && it.icon && String(it.icon).charAt(0) === '/') {
      var i = el('i');
      var u = String(it.icon).replace(/['"()\\\s]/g, '');
      var name = (u.match(/^\/casora_assets\/icons\/([^/?]+)\.svg/) || [])[1];
      var inl = name && window.CASORA_ICONS && window.CASORA_ICONS[name];
      i.style.setProperty('--cs-svg', 'url("' + String(inl || u).replace(/"/g, '%22') + '")');
      box.appendChild(i);
      return box;
    }
    var st = hass && hass.states && hass.states[it.id];
    if (it.kind !== 'room' && st && customElements.get('ha-state-icon')) {
      var si = document.createElement('ha-state-icon');
      si.hass = hass; si.stateObj = st;
      box.appendChild(si);
      return box;
    }
    var hi = document.createElement('ha-icon');
    hi.setAttribute('icon', it.kind === 'room' ? (it.icon && /^mdi:/.test(it.icon) ? it.icon : 'mdi:home-variant') : it.kind === 'scene' ? ((st && st.attributes && st.attributes.icon) || 'mdi:palette-outline') : 'mdi:devices');
    box.appendChild(hi);
    return box;
  }
  // The state as the popup head says it (casoraStateWord, wortliste: „An“, „Bereit“, never HA's raw words). Where the
  // head says since when instead: a measurement shows its value, on/off of a group its word, a raw code nothing.
  S.stateWord = function (hass, st) {
    if (!st) return '';
    var tr = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
    var w = window.casoraStateWord ? window.casoraStateWord(hass, st) : undefined;
    if (typeof w === 'string') return w;
    if (st.state === 'on' || st.state === 'off') return tr(st.state === 'on' ? 'An' : 'Aus');
    var dom = st.entity_id.split('.')[0];
    if (w === null && (dom === 'sensor' || dom === 'number' || dom === 'input_number') && st.state !== '' && isFinite(Number(st.state))) {
      try { return hass.formatEntityState ? String(hass.formatEntityState(st)) : st.state; } catch (e) { return st.state; }
    }
    if (w === null) return '';
    // Without the core (tests): HA's word, a raw English token in Casora's words.
    return window._casoraNiceState ? window._casoraNiceState(hass, st) : st.state;
  };
  function subFor(it, hass) {
    if (it.kind === 'room') return [];
    var st = hass && hass.states && hass.states[it.id];
    var parts = [];
    if (it.room) parts.push(it.room);
    if (it.kind === 'device' && st) {
      var txt = S.stateWord(hass, st);
      if (txt) parts.push(txt);
    }
    return parts;
  }

  function ensureUi() {
    if (ui && ui.root.isConnected) return ui;
    if (!document.getElementById('casora-search-style')) {
      var st = document.createElement('style');
      st.id = 'casora-search-style';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    var root = el('div', 'cs-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', T('Suche'));
    var scrim = el('div', 'cs-scrim');
    var wrap = el('div', 'cs-wrap');
    var bar = el('div', 'cs-bar');
    var field = el('label', 'cs-field');
    field.insertAdjacentHTML('afterbegin', ICON_SEARCH);
    var input = el('input', 'cs-in');
    input.type = 'search';
    input.setAttribute('enterkeyhint', 'search');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('placeholder', T('Räume, Geräte, Szenen'));
    input.setAttribute('aria-label', T('Räume, Geräte, Szenen suchen'));
    input.setAttribute('aria-controls', 'casora-search-results');
    var clear = el('button', 'cs-clear', '×');
    clear.type = 'button';
    clear.setAttribute('aria-label', T('Eingabe löschen'));
    var escHint = el('span', 'cs-esc', 'esc');
    escHint.setAttribute('aria-hidden', 'true');
    field.appendChild(input); field.appendChild(clear); field.appendChild(escHint);
    var cancel = el('button', 'cs-cancel', T('Abbrechen'));
    cancel.type = 'button';
    bar.appendChild(field); bar.appendChild(cancel);
    var panel = el('div', 'cs-panel');
    panel.id = 'casora-search-results';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', T('Ergebnisse'));
    var live = el('div', 'cs-live');
    live.setAttribute('aria-live', 'polite');
    wrap.appendChild(bar); wrap.appendChild(panel);
    root.appendChild(scrim); root.appendChild(wrap); root.appendChild(live);

    scrim.addEventListener('click', function () { S.close(); });
    cancel.addEventListener('click', function (e) { e.preventDefault(); S.close(); });
    clear.addEventListener('click', function (e) { e.preventDefault(); input.value = ''; onInput(); input.focus(); });
    input.addEventListener('input', onInput);
    root.addEventListener('keydown', onKey);
    // Keep the page behind from scrolling under the sheet (touch on the scrim).
    scrim.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
    ui = { root: root, wrap: wrap, input: input, panel: panel, live: live, field: field };
    return ui;
  }

  function onInput() {
    state.q = ui.input.value;
    ui.root.classList.toggle('typed', !!state.q);
    render();
  }

  function focusables() { return Array.prototype.slice.call(ui.panel.querySelectorAll('.cs-main')); }
  function onKey(e) {
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); S.close(); return; }
    var act = ui.root.getRootNode().activeElement || document.activeElement;
    var list = focusables();
    var at = list.indexOf(act);
    if (k === 'ArrowDown') {
      e.preventDefault();
      if (act === ui.input) { if (list[0]) list[0].focus(); }
      else if (at >= 0 && list[at + 1]) list[at + 1].focus();
      else if (act && act.classList && act.classList.contains('cs-sw')) { var m = act.parentNode.nextElementSibling; while (m && !m.querySelector('.cs-main')) m = m.nextElementSibling; if (m) m.querySelector('.cs-main').focus(); }
      return;
    }
    if (k === 'ArrowUp') {
      e.preventDefault();
      if (at > 0) list[at - 1].focus(); else if (at === 0) ui.input.focus();
      return;
    }
    if (k === 'Enter' && act === ui.input) {
      e.preventDefault();
      var first = list[0];
      if (first) first.click();
      else ui.input.blur();
      return;
    }
    if (k === 'Tab') {
      // Keep the focus inside the dialog.
      var all = Array.prototype.slice.call(ui.root.querySelectorAll('input, button:not([disabled])')).filter(function (x) { return x.offsetParent !== null; });
      if (!all.length) return;
      var i = all.indexOf(act);
      if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
      else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      return;
    }
    // Typing while a result has the focus goes on in the field.
    if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && act !== ui.input && k !== ' ') ui.input.focus();
  }

  function rowFor(it, m, hass, recent) {
    var row = el('div', 'cs-row');
    row.setAttribute('data-kind', it.kind);
    row.setAttribute('data-id', it.id);
    row._it = it; row._m = m;
    var main = el('button', 'cs-main');
    main.type = 'button';
    main.appendChild(iconFor(it, hass));
    var tx = el('span', 'cs-tx');
    var nm = el('span', 'cs-name');
    nm.setAttribute('data-no-i18n', '');
    nm.appendChild(marked(it.name, m && m.name));
    tx.appendChild(nm);
    var s = el('span', 'cs-sub');
    s.setAttribute('data-no-i18n', '');
    if (fillSub(s, it, m, hass)) tx.appendChild(s);
    main.appendChild(tx);
    var label = it.name + (it.room ? ', ' + it.room : '');
    row.appendChild(main);
    if (it.kind === 'room') {
      row.appendChild(el('span', 'cs-go', '›')).setAttribute('aria-hidden', 'true');
      main.setAttribute('aria-label', label + ', ' + T('Raum öffnen'));
      main.addEventListener('click', function () { done(it, function () { openRoom(it); }); });
    } else if (it.kind === 'scene') {
      var go = el('span', 'cs-start', T('Start'));
      go.setAttribute('aria-hidden', 'true');
      row.appendChild(go);
      main.setAttribute('aria-label', label + ', ' + T('Szene starten'));
      main.addEventListener('click', function () {
        S.remember(it);
        if (window.casoraHaptic) window.casoraHaptic('light');
        runScene(it);
        go.textContent = T('Gestartet');
        ui.live.textContent = it.name + ': ' + T('Gestartet');
        setTimeout(function () { if (go.isConnected) go.textContent = T('Start'); }, 1600);
      });
    } else {
      main.setAttribute('aria-label', label + ', ' + T('Öffnen'));
      main.addEventListener('click', function () { done(it, function () { openDevice(it); }); });
      if (S.canToggle(hass, it.id)) {
        var sw = el('button', 'cs-sw');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', it.name);
        paintSwitch(sw, hass, it.id);
        sw.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (window.casoraHaptic) window.casoraHaptic('light');
          S.remember(it);
          // Optimistic: flip now, the next state confirms it.
          sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
          sw._pendUntil = Date.now() + 2500;
          toggle(it);
        });
        row.appendChild(sw);
      } else {
        row.appendChild(el('span', 'cs-go', '›')).setAttribute('aria-hidden', 'true');
      }
    }
    return row;
  }
  function fillSub(s, it, m, hass) {
    var parts = subFor(it, hass) || [];
    var key = parts.join('\u0001');
    if (s._key === key) return parts.length > 0;
    s._key = key;
    while (s.firstChild) s.removeChild(s.firstChild);
    parts.forEach(function (p, i) {
      if (i) s.appendChild(document.createTextNode(' · '));
      s.appendChild(i === 0 && it.room && p === it.room ? marked(p, m && m.room) : document.createTextNode(p));
    });
    return parts.length > 0;
  }
  function paintSwitch(sw, hass, id) {
    var st = hass && hass.states && hass.states[id];
    if (sw._pendUntil && Date.now() < sw._pendUntil) return;
    sw._pendUntil = 0;
    var dead = !st || st.state === 'unavailable' || st.state === 'unknown';
    sw.disabled = dead;
    sw.setAttribute('aria-checked', st && st.state === 'on' ? 'true' : 'false');
  }

  function done(it, fn) {
    S.remember(it);
    if (window.casoraHaptic) window.casoraHaptic('light');
    S.close(true);
    // After the sheet is gone: a popup or room opens on a calm page.
    setTimeout(fn, 30);
  }

  var GROUPS = [['rooms', 'Räume'], ['devices', 'Geräte'], ['scenes', 'Szenen']];
  function render() {
    var hass = hassNow();
    var p = ui.panel;
    while (p.firstChild) p.removeChild(p.firstChild);
    var q = state.q.trim();
    if (!q) {
      var rec = S.recentItems(state.idx);
      if (!rec.length) {
        p.appendChild(el('div', 'cs-empty', T('Räume, Geräte und Szenen suchen')));
        ui.live.textContent = '';
        return;
      }
      var g0 = el('div', 'cs-group');
      g0.setAttribute('role', 'group');
      var h0 = el('div', 'cs-sec', T('Zuletzt'));
      h0.id = 'cs-sec-recent';
      g0.setAttribute('aria-labelledby', h0.id);
      g0.appendChild(h0);
      rec.forEach(function (it) { g0.appendChild(rowFor(it, null, hass, true)); });
      p.appendChild(g0);
      ui.live.textContent = '';
      return;
    }
    var r = S.query(state.idx, q, MAX);
    if (!r.total) {
      p.appendChild(el('div', 'cs-empty', T('Keine Treffer')));
      ui.live.textContent = T('Keine Treffer');
      return;
    }
    GROUPS.forEach(function (g) {
      if (!r[g[0]].length) return;
      var box = el('div', 'cs-group');
      box.setAttribute('role', 'group');
      var h = el('div', 'cs-sec', T(g[1]));
      h.id = 'cs-sec-' + g[0];
      box.setAttribute('aria-labelledby', h.id);
      box.appendChild(h);
      r[g[0]].forEach(function (x) { box.appendChild(rowFor(x.item, x.m, hass)); });
      p.appendChild(box);
    });
    ui.live.textContent = r.total === 1 ? T('1 Treffer') : T('{n} Treffer').replace('{n}', String(r.total));
  }

  // Live: switches and states follow the house while the sheet is open.
  function tick() {
    var hass = hassNow();
    if (!ui || !hass || hass.states === state.statesAt) return;
    state.statesAt = hass.states;
    Array.prototype.forEach.call(ui.panel.querySelectorAll('.cs-row'), function (row) {
      var id = row.getAttribute('data-id'), sw = row.querySelector('.cs-sw');
      if (sw) paintSwitch(sw, hass, id);
      var sub = row.querySelector('.cs-sub');
      if (sub && row._it && row._it.kind === 'device') fillSub(sub, row._it, row._m, hass);
    });
  }

  function fitViewport() {
    if (!ui) return;
    var vv = window.visualViewport;
    var h = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
    ui.root.style.top = Math.round(top) + 'px';
    ui.root.style.height = Math.round(h) + 'px';
    if (!ui.root.classList.contains('desk')) {
      // The keyboard covers nothing: the results end above it.
      var bar = ui.wrap.firstChild.getBoundingClientRect();
      var max = Math.max(120, h - (bar.bottom - top) - 20);
      ui.panel.style.maxHeight = Math.round(max) + 'px';
    }
  }

  // The sheet and its header strip are opaque (nothing of the page – weather, title – shows through, also in Glas):
  // the window pane with its alpha at 1, shared with the header strip as --cs-pane.
  function solidify(pane) {
    var bg = '';
    try { bg = getComputedStyle(pane).backgroundColor || ''; } catch (e) { bg = ''; }
    var m = bg.match(/rgba?\(([^)]+)\)/);
    var p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : null;
    if (!p || p.length < 3) return;
    var solid = 'rgb(' + Math.round(p[0]) + ', ' + Math.round(p[1]) + ', ' + Math.round(p[2]) + ')';
    pane.style.backgroundColor = solid;
    pane.style.backdropFilter = 'none';
    pane.style.webkitBackdropFilter = 'none';
    ui.root.style.setProperty('--cs-pane', solid);
  }
  function dashUrl() { return (String(location.pathname || '').split('/').filter(Boolean)[0]) || ''; }
  function configNow() {
    var root = null;
    try { root = window._casoraHuiRoot ? window._casoraHuiRoot() : null; } catch (e) { root = null; }
    if (!root) {
      (function walk(r, d) {
        if (root || !r || d > 10 || !r.querySelector) return;
        var x = r.querySelector('hui-root');
        if (x) { root = x; return; }
        var all = r.querySelectorAll('*');
        for (var i = 0; i < all.length && !root; i++) if (all[i].shadowRoot) walk(all[i].shadowRoot, d + 1);
      })(document, 0);
    }
    return (root && root.lovelace && root.lovelace.config) || null;
  }
  S._configNow = configNow;

  // o.desk: dialog in the middle (⌘K); otherwise the phone sheet. o.from: element that gets the focus back.
  S.open = function (o) {
    o = o || {};
    var cfg = o.config || configNow();
    var hass = hassNow();
    if (!cfg || !hass) return false;
    var u = ensureUi();
    try { state.idx = S.index(cfg, hass, hass.user || userOf(), { url: dashUrl() }); } catch (e) { state.idx = { rooms: [], devices: [], scenes: [] }; }
    state.from = o.from || document.activeElement;
    state.q = '';
    u.input.value = '';
    u.root.classList.remove('typed', 'in');
    u.root.classList.toggle('desk', !!o.desk);
    if (window.casoraMenuGlass) {
      var pane = o.desk ? u.wrap : u.panel;
      window.casoraMenuGlass.apply(pane);
      if (window.casoraMenuGlass.frame) window.casoraMenuGlass.frame(pane);
      if (o.desk) { u.panel.style.background = 'transparent'; u.panel.style.boxShadow = 'none'; u.panel.style.backdropFilter = 'none'; u.panel.style.webkitBackdropFilter = 'none'; }
    }
    if (!u.root.isConnected) document.body.appendChild(u.root);
    solidify(o.desk ? u.wrap : u.panel);
    render();
    fitViewport();
    // Focus in the same tap (WebKit only opens the keyboard then).
    try { u.input.focus({ preventScroll: true }); } catch (e) { u.input.focus(); }
    requestAnimationFrame(function () { u.root.classList.add('in'); fitViewport(); });
    if (window.visualViewport) {
      state.vvOff = function () { fitViewport(); };
      window.visualViewport.addEventListener('resize', state.vvOff);
      window.visualViewport.addEventListener('scroll', state.vvOff);
    }
    state.statesAt = hass.states;
    clearInterval(state.timer);
    state.timer = setInterval(tick, 500);
    return true;
  };
  S.isOpen = function () { return !!(ui && ui.root.isConnected); };
  S.close = function (keepFocus) {
    if (!ui || !ui.root.isConnected) return;
    clearInterval(state.timer);
    if (state.vvOff && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', state.vvOff);
      window.visualViewport.removeEventListener('scroll', state.vvOff);
    }
    try { ui.input.blur(); } catch (e) { /* ignore */ }
    ui.root.remove();
    ui.root.classList.remove('in');
    var back = state.from;
    state.from = null;
    if (!keepFocus && back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  };

  // ── Opening: the phone's field (casora_mobile_weather) and ⌘K / Ctrl+K ─────────────────────────────────────
  var lastOpen = 0;
  function fromField(e) {
    var path = (e.composedPath && e.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.getAttribute && n.hasAttribute('data-casora-search')) return n;
    }
    return null;
  }
  var handle = function (e) {
    var f = fromField(e);
    if (!f) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); e.stopPropagation();
    if (Date.now() - lastOpen < 500) return;
    lastOpen = Date.now();
    if (window.casoraHaptic) window.casoraHaptic('light');
    S.open({ from: f });
  };
  window.addEventListener('click', handle, true);
  window.addEventListener('keydown', handle, true);
  // Touch: the card's action handler (HA's actionHandler on ha-card) cancels touchend, so on a phone no click ever
  // follows a tap on the field (26.11.2: tapping did nothing in the Companion app). The field opens on touchend
  // itself – in the gesture, so WebKit lets the input take the focus and opens the keyboard.
  var tap0 = null;
  window.addEventListener('touchstart', function (e) {
    var t = e.touches && e.touches[0];
    tap0 = t && e.touches.length === 1 && fromField(e) ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (e) {
    var t = e.touches && e.touches[0];
    if (tap0 && t && (Math.abs(t.clientX - tap0.x) > 10 || Math.abs(t.clientY - tap0.y) > 10)) tap0 = null;
  }, { capture: true, passive: true });
  window.addEventListener('touchend', function (e) {
    var ok = tap0;
    tap0 = null;
    if (ok) handle(e);
  }, { capture: true, passive: false });
  window.addEventListener('keydown', function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'k') return;
    if (S.isOpen()) { e.preventDefault(); e.stopPropagation(); S.close(); return; }
    var cfg = configNow();
    // Only on a Casora dashboard (not in the Studio or HA's own pages).
    if (!cfg || !S.isCasoraCfg(cfg)) return;
    e.preventDefault(); e.stopPropagation();
    S.open({ desk: true, config: cfg });
  }, true);
  // A room change or another page closes the sheet.
  window.addEventListener('location-changed', function () { if (S.isOpen()) S.close(true); });
  window.addEventListener('popstate', function () { if (S.isOpen()) S.close(true); });

  // Shown at all on the phone's Home? Studio switch "Show search" (show_search on the overview room, default on):
  // the phone's header carries it after saving, the desktop's overview room (casoraPhoneRoom.home) before that.
  S.shown = function (vars) {
    var off = function (v) { return v === false || v === 'false'; };
    if (vars && off(vars.show_search)) return false;
    var home = null;
    try { home = window.casoraPhoneRoom && window.casoraPhoneRoom.home ? window.casoraPhoneRoom.home() : null; } catch (e) { home = null; }
    return !(home && off(home.show_search));
  };
})();
