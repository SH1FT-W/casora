// ── Media popup extras and the camera timeline (13.11.2026) ─────────────────────────────────────────────
// Three additions to existing popups, each only when the device can do it (otherwise nothing changes):
//   window._casoraMediaRemote   TV remote in the media popup (casora_media): a remote.* on the player's device whose
//                               platform has a known command table, or a player that navigates itself (LG webOS).
//     .KEYS                     platform → command names; unknown platform → no remote
//     .find(hass, playerId)     → { platform, remote, player, keys, via } | null
//     .svc(spec, key, st)       → service call for one key (up, down, left, right, ok, back, home, play, volUp, volDown)
//     .html(spec, hass)         → section „Fernbedienung“ (ring with OK, back, home, play/pause, volume)
//   window._casoraMediaGroup    speaker grouping in the media popup (MediaPlayerEntityFeature.GROUPING = 524288)
//     .can(st)                  → whether a player groups
//     .list(hass, playerId)     → [{ id, name, area, on }] other groupable players of the same integration
//     .html(hass, playerId)     → section „Zusammen abspielen“ (selection list, join/unjoin per row)
//   window._casoraCamTimeline   today's motion, person and doorbell events in the general camera popup
//     .sources(hass, camId)     → [{ id, kind }] binary_sensor (motion/occupancy/presence) and event (doorbell) of the
//                               camera's device, else of its area
//     .parse(raw, sources, start) → [{ kind, at, id }] newest first (history/history_during_period answer)
//     .media(hass, camId)       → media browser path with the camera's recordings, or null
//     .mount(img)               fills the placeholder before the <img> (asks the history sparingly)
//   window._casoraMediaExtra.sec(entity, hass) → both media sections for the popup's right column
//   window._casoraMediaExtraHtml / window._casoraCamTimelineHtml – the same for the card templates
(function () {
  if (window._casoraMediaExtra && window._casoraMediaExtra.v === 1) return;
  var X = window._casoraMediaExtra = { v: 1 };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var reg = function (hass, id) { return (hass && hass.entities && hass.entities[id]) || {}; };
  var nameOf = function (hass, id) {
    var s = hass && hass.states && hass.states[id];
    var n = (s && s.attributes && s.attributes.friendly_name) || String(id).split('.').pop().replace(/_/g, ' ');
    return window.casoraCleanName ? (window.casoraCleanName(n) || n) : n;
  };
  var areaOf = function (hass, id) {
    var e = reg(hass, id);
    var a = e.area_id || (e.device_id && hass.devices && hass.devices[e.device_id] ? hass.devices[e.device_id].area_id : null);
    return a && hass.areas && hass.areas[a] ? String(hass.areas[a].name || '') : '';
  };
  var bad = function (s) { return !s || s.state === 'unavailable' || s.state === 'unknown'; };

  // ── Remote ──────────────────────────────────────────────────────────────────────────────────────────────
  // Command names as each integration's remote.send_command takes them (read in HA 2026.11):
  //   apple_tv          pyatv RemoteControl methods; volume through COMMAND_TO_ATTRIBUTE
  //   androidtv_remote  Android key codes without KEYCODE_
  //   androidtv         androidtv.constants.KEYS (ADB), no play/pause key there
  //   samsungtv         Samsung key codes
  //   roku              rokuecp VALID_REMOTE_KEYS
  //   philips_js        JointSpace key names
  //   webostv           no remote entity: the player takes webostv.button with aiowebostv's button names
  var R = window._casoraMediaRemote = {};
  R.KEYS = {
    apple_tv: { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'select', back: 'menu', home: 'home',
      play: 'play_pause', volUp: 'volume_up', volDown: 'volume_down' },
    androidtv_remote: { up: 'DPAD_UP', down: 'DPAD_DOWN', left: 'DPAD_LEFT', right: 'DPAD_RIGHT', ok: 'DPAD_CENTER',
      back: 'BACK', home: 'HOME', play: 'MEDIA_PLAY_PAUSE', volUp: 'VOLUME_UP', volDown: 'VOLUME_DOWN' },
    androidtv: { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'CENTER', back: 'BACK', home: 'HOME',
      play: null, volUp: 'VOLUME_UP', volDown: 'VOLUME_DOWN' },
    samsungtv: { up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', ok: 'KEY_ENTER', back: 'KEY_RETURN',
      home: 'KEY_HOME', play: null, volUp: 'KEY_VOLUP', volDown: 'KEY_VOLDOWN' },
    roku: { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'select', back: 'back', home: 'home', play: 'play',
      volUp: 'volume_up', volDown: 'volume_down' },
    philips_js: { up: 'CursorUp', down: 'CursorDown', left: 'CursorLeft', right: 'CursorRight', ok: 'Confirm', back: 'Back',
      home: 'Home', play: 'PlayPause', volUp: 'VolumeUp', volDown: 'VolumeDown' },
    webostv: { player: true, up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'ENTER', back: 'BACK', home: 'HOME',
      play: null, volUp: 'VOLUMEUP', volDown: 'VOLUMEDOWN' },
  };
  // A device of these models has a remote entity but nothing to navigate (Apple's speakers in apple_tv).
  var NO_SCREEN = /homepod/i;

  R.find = function (hass, playerId) {
    if (!hass || !playerId || String(playerId).indexOf('media_player.') !== 0) return null;
    var pe = reg(hass, playerId);
    var dev = pe.device_id && hass.devices ? hass.devices[pe.device_id] : null;
    if (dev && NO_SCREEN.test(String(dev.model || ''))) return null;
    var keys = R.KEYS[pe.platform];
    if (keys && keys.player) return { platform: pe.platform, remote: null, player: playerId, keys: keys, via: 'player' };
    var ents = hass.entities || {};
    var cands = Object.keys(ents).filter(function (id) {
      var e = ents[id];
      return id.indexOf('remote.') === 0 && e && R.KEYS[e.platform] && !R.KEYS[e.platform].player;
    });
    // Same device first (structured), then a remote with the player's object id (name only as a fallback).
    var hit = pe.device_id ? cands.filter(function (id) { return ents[id].device_id === pe.device_id; })[0] : null;
    if (!hit) {
      var obj = String(playerId).split('.')[1];
      hit = cands.filter(function (id) { return id.split('.')[1] === obj && (!pe.platform || ents[id].platform === pe.platform || !pe.device_id); })[0];
    }
    if (!hit) return null;
    var rDev = ents[hit].device_id && hass.devices ? hass.devices[ents[hit].device_id] : null;
    if (rDev && NO_SCREEN.test(String(rDev.model || ''))) return null;
    return { platform: ents[hit].platform, remote: hit, player: playerId, keys: R.KEYS[ents[hit].platform], via: 'remote' };
  };

  // One key → service. play and volume go to the player when it can (it knows its state), else to the remote.
  R.svc = function (spec, key, st) {
    if (!spec || !spec.keys) return null;
    var f = Number((st && st.attributes && st.attributes.supported_features) || 0);
    var p = { entity_id: spec.player };
    if (key === 'play' && ((f & 1) || (f & 16384))) return { domain: 'media_player', service: 'media_play_pause', target: p };
    if ((key === 'volUp' || key === 'volDown') && ((f & 1024) || (f & 4)))
      return { domain: 'media_player', service: key === 'volUp' ? 'volume_up' : 'volume_down', target: p };
    var cmd = spec.keys[key];
    if (!cmd) return null;
    if (spec.via === 'player') return { domain: 'webostv', service: 'button', data: { button: cmd }, target: p };
    return { domain: 'remote', service: 'send_command', data: { command: cmd }, target: { entity_id: spec.remote } };
  };

  var T = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };
  // Annulus sector of the ring (viewBox 220, centre 110): a0..a1 in degrees, 0 = right, clockwise.
  var sector = function (a0, a1, R1, r0) {
    var pt = function (r, a) { var t = a * Math.PI / 180; return (110 + r * Math.cos(t)).toFixed(2) + ' ' + (110 + r * Math.sin(t)).toFixed(2); };
    return 'M' + pt(R1, a0) + 'A' + R1 + ' ' + R1 + ' 0 0 1 ' + pt(R1, a1) + 'L' + pt(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + pt(r0, a0) + 'Z';
  };
  var CHEV = { up: 'M101 40l9-9 9 9', down: 'M101 180l9 9 9-9', left: 'M40 101l-9 9 9 9', right: 'M180 101l9 9-9 9' };
  R.css = function () {
    return '<style>'
      + '.crc{font-family:var(--primary-font-family, system-ui);background:var(--casora-popup-row-fill, rgba(140,115,90,.07));'
      +   'border-radius:var(--casora-popup-row-radius, 20px);padding:20px 16px 18px;display:flex;flex-direction:column;align-items:center;gap:14px;}'
      + '.crc-mid{display:grid;grid-template-columns:52px minmax(0,1fr) 52px;align-items:center;column-gap:14px;width:100%;max-width:340px;}'
      + '.crc-ring{width:100%;max-width:212px;justify-self:center;aspect-ratio:1/1;display:block;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}'
      + '.crc-sec{fill:var(--casora-soft-control-fill, rgba(140,115,90,.12));cursor:pointer;transition:fill .16s ease;outline:none;}'
      + '.crc-sec:active,.crc-sec.prs{fill:color-mix(in srgb, var(--casora-popup-accent, #B67A50) 30%, var(--casora-soft-control-fill, rgba(140,115,90,.12)));}'
      + '.crc-sec:focus-visible{stroke:var(--casora-popup-accent, #B67A50);stroke-width:2;}'
      + '.crc-chev{fill:none;stroke:var(--casora-soft-sub, rgba(58,50,43,.6));stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;}'
      + '.crc-ok{fill:var(--casora-soft-seg-on, var(--casora-lps-seg-on, #FFFDF9));cursor:pointer;transition:transform .12s ease;transform-origin:110px 110px;outline:none;'
      +   'filter:drop-shadow(0 4px 10px rgba(0,0,0,.14));}'
      + '.crc-ok.prs + .crc-okt,.crc-ok:active + .crc-okt{opacity:.8;}'
      + '.crc-ok:active,.crc-ok.prs{transform:scale(.95);}'
      + '.crc-ok:focus-visible{stroke:var(--casora-popup-accent, #B67A50);stroke-width:2;}'
      + '.crc-okt{font-size:17px;font-weight:700;letter-spacing:.02em;fill:var(--casora-soft-seg-on-ink, #2E2721);pointer-events:none;}'
      + '.crc-col{display:flex;flex-direction:column;gap:12px;align-items:center;}'
      + '.crc-b{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex:none;'
      +   'background:var(--casora-soft-control-fill, rgba(140,115,90,.12));color:var(--casora-popup-tiles-text-primary, #3A322B);'
      +   'transition:transform .12s ease, background-color .16s ease;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}'
      + '.crc-b > *{pointer-events:none;}'
      + '.crc-b:active,.crc-b.prs{transform:scale(var(--casora-press-scale, .94));background:color-mix(in srgb, var(--casora-popup-accent, #B67A50) 26%, var(--casora-soft-control-fill, rgba(140,115,90,.12)));}'
      + '.crc-vol{width:52px;height:116px;border-radius:26px;display:flex;flex-direction:column;overflow:hidden;background:var(--casora-soft-control-fill, rgba(140,115,90,.12));}'
      + '.crc-vol .crc-b{width:52px;height:58px;border-radius:0;background:transparent;}'
      + '.crc-vol .crc-b:active,.crc-vol .crc-b.prs{transform:none;background:color-mix(in srgb, var(--casora-popup-accent, #B67A50) 26%, transparent);}'
      + '.crc.dis{opacity:.5;pointer-events:none;}'
      + '.crc-gap{width:52px;height:52px;}'
      + '@media (prefers-reduced-motion: reduce){.crc-b,.crc-ok,.crc-sec{transition:none;}}'
      + '</style>';
  };
  var keyAttrHtml = function (svc, label) {
    return ' data-casora-rc="' + esc(JSON.stringify(svc)) + '" role="button" tabindex="0" aria-label="' + esc(T(label)) + '"';
  };
  var btnHtml = function (svc, icon, label) {
    if (!svc) return '<div class="crc-gap" aria-hidden="true"></div>';
    return '<div class="crc-b"' + keyAttrHtml(svc, label) + ' title="' + esc(T(label)) + '"><ha-icon icon="' + esc(icon) + '" style="--mdc-icon-size:22px;"></ha-icon></div>';
  };
  R.html = function (spec, hass) {
    if (!spec) return '';
    var st = hass && hass.states ? hass.states[spec.player] : null;
    var rs = spec.remote && hass && hass.states ? hass.states[spec.remote] : st;
    var off = bad(rs);
    var s = function (k) { return R.svc(spec, k, st); };
    var dirs = [['up', -135, -45, 'Nach oben'], ['right', -45, 45, 'Nach rechts'], ['down', 45, 135, 'Nach unten'], ['left', 135, 225, 'Nach links']];
    var ringSvg = '<svg class="crc-ring" viewBox="0 0 220 220" role="group" aria-label="' + esc(T('Steuerkreuz')) + '">'
      + dirs.map(function (d) {
        var v = s(d[0]);
        return v ? '<path class="crc-sec" d="' + esc(sector(d[1] + 1.5, d[2] - 1.5, 108, 50)) + '"' + keyAttrHtml(v, d[3]) + '></path>' : '';
      }).join('')
      + dirs.map(function (d) { return '<path class="crc-chev" d="' + esc(CHEV[d[0]]) + '"></path>'; }).join('')
      + (s('ok') ? '<circle class="crc-ok" cx="110" cy="110" r="44"' + keyAttrHtml(s('ok'), 'OK') + '></circle>'
        + '<text class="crc-okt" x="110" y="116" text-anchor="middle">OK</text>' : '')
      + '</svg>';
    var volHtml = s('volUp') && s('volDown')
      ? '<div class="crc-vol">' + btnHtml(s('volUp'), 'mdi:plus', 'Lauter') + btnHtml(s('volDown'), 'mdi:minus', 'Leiser') + '</div>'
      : '<div class="crc-col">' + btnHtml(null) + btnHtml(null) + '</div>';
    var bodyHtml = '<div class="crc' + (off ? ' dis' : '') + '"' + (off ? ' aria-disabled="true"' : '') + '>'
      + '<div class="crc-mid">'
      + '<div class="crc-col">' + btnHtml(s('back'), 'mdi:arrow-u-left-top', 'Zurück') + btnHtml(s('home'), 'mdi:home-outline', 'Home') + '</div>'
      + ringSvg + volHtml + '</div>'
      + (s('play') ? btnHtml(s('play'), 'mdi:play-pause', 'Wiedergabe/Pause') : '')
      + '</div>';
    var UI = window._casoraUI;
    return R.css() + (UI && UI.label ? UI.label('Fernbedienung') : '') + bodyHtml;
  };

  // Keys: own handler (casora-core's svc rows swallow taps within 400 ms – a remote is pressed quickly).
  // Touch and the click it echoes count once; the first 600 ms after a popup opens do nothing (02-devices.js).
  if (!window._casoraRcBound && typeof document !== 'undefined' && document.addEventListener) {
    window._casoraRcBound = true;
    var lastTouch = 0, tp = null;
    var keyEl = function (ev) {
      var path = (ev.composedPath && ev.composedPath()) || [ev.target];
      for (var i = 0; i < path.length; i++) {
        var t = path[i];
        if (t && t.getAttribute && t.getAttribute('data-casora-rc')) return t;
      }
      return null;
    };
    var flash = function (el) {
      try { el.classList.add('prs'); setTimeout(function () { el.classList.remove('prs'); }, 160); } catch (e) { /* gone */ }
    };
    var press = function (ev) {
      var el = keyEl(ev);
      if (!el) return;
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();
      if (Date.now() - (window._casoraPopupOpenedAt || 0) < 600) return;
      if (ev.type === 'touchend') {
        if (tp && tp.moved) { tp = null; return; }
        lastTouch = Date.now();
      } else if (ev.type === 'click' && Date.now() - lastTouch < 700) return;
      var spec;
      try { spec = JSON.parse(el.getAttribute('data-casora-rc')); } catch (e) { return; }
      var ha = document.querySelector('home-assistant');
      if (!spec || !ha || !ha.hass) return;
      if (window.casoraHaptic) window.casoraHaptic('light');
      flash(el);
      ha.hass.callService(spec.domain, spec.service, spec.data || {}, spec.target || undefined);
    };
    document.addEventListener('touchstart', function (ev) {
      var t = ev.touches && ev.touches[0];
      tp = t && keyEl(ev) ? { x: t.clientX, y: t.clientY, moved: false } : null;
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', function (ev) {
      var t = ev.touches && ev.touches[0];
      if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
    }, { capture: true, passive: true });
    document.addEventListener('touchend', press, true);
    document.addEventListener('click', press, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (keyEl(ev)) press(ev);
    }, true);
  }

  // ── Grouping ────────────────────────────────────────────────────────────────────────────────────────────
  var G = window._casoraMediaGroup = {};
  G.FLAG = 524288;  // MediaPlayerEntityFeature.GROUPING
  G.can = function (st) {
    if (!st || !st.attributes) return false;
    return (Number(st.attributes.supported_features || 0) & G.FLAG) !== 0 || Array.isArray(st.attributes.group_members);
  };
  G.members = function (st) {
    var m = st && st.attributes && st.attributes.group_members;
    return Array.isArray(m) ? m.filter(function (x) { return typeof x === 'string'; }) : [];
  };
  // Other groupable players of the same integration (grouping never crosses integrations), at most 12.
  G.list = function (hass, playerId) {
    var S = (hass && hass.states) || {};
    var me = S[playerId];
    if (!G.can(me) || bad(me)) return [];
    var plat = reg(hass, playerId).platform;
    var mine = G.members(me);
    var ids = Object.keys(hass.entities || {}).filter(function (id) {
      if (id === playerId || id.indexOf('media_player.') !== 0) return false;
      var e = hass.entities[id];
      if (!e || e.hidden || (plat && e.platform && e.platform !== plat)) return false;
      return G.can(S[id]) && !bad(S[id]);
    });
    return ids.map(function (id) {
      return { id: id, name: nameOf(hass, id), area: areaOf(hass, id), on: mine.indexOf(id) > -1, playing: S[id].state === 'playing' };
    }).sort(function (a, b) { return (b.on - a.on) || a.name.localeCompare(b.name); }).slice(0, 12);
  };
  G.rowSvc = function (playerId, r) {
    return r.on
      ? { domain: 'media_player', service: 'unjoin', target: { entity_id: r.id } }
      : { domain: 'media_player', service: 'join', data: { group_members: [r.id] }, target: { entity_id: playerId } };
  };
  G.html = function (hass, playerId) {
    var UI = window._casoraUI;
    var list = G.list(hass, playerId);
    if (!UI || !list.length) return '';
    var n = list.filter(function (r) { return r.on; }).length;
    var rows = list.map(function (r) {
      // Selection list without ticks: the joined row is highlighted (hui-sel) and its symbol in the device colour.
      return { icon: 'mdi:speaker', iconTone: r.on ? 'accent' : 'rgba(0,0,0,0)', label: r.name, labelLit: true, sub: r.area || undefined,
        selected: r.on, noChev: true, tappable: true, svc: G.rowSvc(playerId, r) };
    });
    return UI.group(rows, n ? 'Zusammen abspielen · ' + (n + 1) + ' Lautsprecher' : 'Zusammen abspielen');
  };

  // Both sections for the media popup (right column); '' when the player has neither.
  X.ids = function (hass, playerId) {
    var spec = R.find(hass, playerId);
    var out = [playerId];
    if (spec && spec.remote) out.push(spec.remote);
    G.list(hass, playerId).forEach(function (r) { out.push(r.id); });
    return out;
  };
  X.sec = function (entity, hass) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return '';
    var parts = [R.html(R.find(hass, id), hass), G.html(hass, id)].filter(Boolean);
    // ha-card.disabled: the card has no tap action of its own; without this rule nothing inside could be tapped.
    return parts.length ? '<style>ha-card.disabled{pointer-events:auto!important;}</style><div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 24px);">'
      + parts.map(function (partHtml) { return '<div>' + partHtml + '</div>'; }).join('') + '</div>' : '';
  };
  // Global markup builders for the templates (tools/html-escape-check.mjs counts window._casora…Html as markup).
  window._casoraMediaExtraHtml = function (entity, hass) { return X.sec(entity, hass); };
  X.has = function (hass, id) { return !!(R.find(hass, id) || G.list(hass, id).length); };

  // ── Camera timeline ─────────────────────────────────────────────────────────────────────────────────────
  var C = window._casoraCamTimeline = {};
  var MOTION_DC = ['motion', 'occupancy', 'presence'];
  var kindOf = function (hass, id) {
    var e = reg(hass, id), s = hass.states[id], dc = s && s.attributes ? s.attributes.device_class : null;
    if (id.indexOf('event.') === 0) return dc === 'doorbell' ? 'ring' : null;
    if (id.indexOf('binary_sensor.') !== 0 || MOTION_DC.indexOf(dc) < 0) return null;
    return e.translation_key === 'person' ? 'person' : 'motion';
  };
  C.sources = function (hass, camId) {
    if (!hass || !hass.states || !hass.entities) return [];
    var ce = reg(hass, camId), ents = hass.entities;
    var pick = function (match) {
      return Object.keys(ents).filter(function (id) { return hass.states[id] && match(ents[id]) && kindOf(hass, id); })
        .map(function (id) { return { id: id, kind: kindOf(hass, id) }; });
    };
    var out = ce.device_id ? pick(function (e) { return e.device_id === ce.device_id; }) : [];
    if (!out.length) {
      var area = ce.area_id || (ce.device_id && hass.devices && hass.devices[ce.device_id] ? hass.devices[ce.device_id].area_id : null);
      if (area) {
        out = pick(function (e) {
          var a = e.area_id || (e.device_id && hass.devices && hass.devices[e.device_id] ? hass.devices[e.device_id].area_id : null);
          return a === area && !e.hidden;
        }).slice(0, 4);
      }
    }
    return out;
  };
  // history_during_period (minimal, no attributes) → events newest first. The first row of each entity is its state
  // at the start of the period, not an event. Binary sensors: every change to „on“; doorbell events: every new
  // timestamp. Same kind within a minute (ring: 5 s) counts once.
  C.parse = function (raw, sources, start) {
    var all = [];
    (sources || []).forEach(function (src) {
      var rows = raw && raw[src.id];
      if (!Array.isArray(rows)) return;
      var prev = null;
      rows.forEach(function (r, i) {
        var s = r.s != null ? r.s : r.state;
        var ts = r.lc != null ? r.lc * 1000 : r.lu != null ? r.lu * 1000 : Date.parse(r.last_changed || r.last_updated);
        var first = i === 0 && start && ts <= start + 1000;
        if (src.kind === 'ring') {
          var at = Date.parse(s);
          if (!first && isFinite(at) && s !== prev) all.push({ kind: 'ring', at: at >= (start || 0) ? at : ts, id: src.id });
        } else if (s === 'on' && prev !== 'on' && !first) all.push({ kind: src.kind, at: ts, id: src.id });
        prev = s;
      });
    });
    all = all.filter(function (e) { return isFinite(e.at) && (!start || e.at >= start); }).sort(function (a, b) { return b.at - a.at; });
    // One moment, one mark: a ring or a person within a minute stands for the motion around it (rank ring > person
    // > motion); the same kind within a minute (ring: 5 s) counts once.
    var rank = { ring: 3, person: 2, motion: 1 };
    var out = [];
    all.slice().sort(function (a, b) { return (rank[b.kind] - rank[a.kind]) || (b.at - a.at); }).forEach(function (e) {
      var win = e.kind === 'ring' ? 5000 : 60000;
      var dup = out.some(function (x) {
        return (x.kind === e.kind && Math.abs(x.at - e.at) < win) || (rank[x.kind] > rank[e.kind] && Math.abs(x.at - e.at) < 60000);
      });
      if (!dup) out.push(e);
    });
    return out.sort(function (a, b) { return b.at - a.at; });
  };
  // Recordings in HA's media browser: integrations whose media source holds the camera's clips.
  C.MEDIA = { reolink: 'reolink', unifiprotect: 'unifiprotect', frigate: 'frigate', motioneye: 'motioneye' };
  C.media = function (hass, camId) {
    var comp = (hass && hass.config && hass.config.components) || [];
    var src = C.MEDIA[reg(hass, camId).platform];
    return src && comp.indexOf(src) > -1 && comp.indexOf('media_source') > -1
      ? '/media-browser/browser/' + encodeURIComponent('app,media-source://' + src) : null;
  };
  C.dayStart = function (now) { var d = new Date(now || Date.now()); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var WORD = { motion: 'Bewegung', person: 'Person erkannt', ring: 'Hat geklingelt' };
  C.word = function (kind) { return WORD[kind] || WORD.motion; };
  var clock = function (ms) {
    var d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  C.ago = function (ms, now) {
    var m = Math.max(0, Math.floor(((now || Date.now()) - ms) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : 'vor ' + Math.round(m / 60) + ' Std.';
  };
  C.head = function (n) { return n === 1 ? 'Heute · 1 Ereignis' : 'Heute · ' + n + ' Ereignisse'; };

  // Cache per camera: asked again only when a source changed since, or after 10 minutes.
  var cache = {};
  var TTL = 600000;
  C.keyOf = function (hass, sources) {
    return sources.map(function (s) { var x = hass.states[s.id]; return x ? x.last_changed + x.state : ''; }).join('|');
  };
  C.load = function (hass, camId, done) {
    var sources = C.sources(hass, camId);
    if (!sources.length) { done(null); return; }
    var key = C.keyOf(hass, sources), hit = cache[camId], start = C.dayStart();
    if (hit && hit.key === key && hit.start === start && Date.now() - hit.at < TTL) { done(hit); return; }
    if (hit && hit.busy && Date.now() - hit.at < 15000) { hit.wait.push(done); return; }
    var job = cache[camId] = { key: key, start: start, at: Date.now(), busy: true, list: hit ? hit.list : null, sources: sources, wait: [done] };
    var fin = function () { job.busy = false; var w = job.wait; job.wait = []; w.forEach(function (f) { try { f(job); } catch (e) { /* gone */ } }); };
    hass.callWS({ type: 'history/history_during_period', start_time: new Date(start).toISOString(), end_time: new Date().toISOString(),
      entity_ids: sources.map(function (s) { return s.id; }), minimal_response: true, no_attributes: true, significant_changes_only: false })
      .then(function (raw) { job.list = C.parse(raw, sources, start); job.err = false; })
      .catch(function () { job.list = job.list || []; job.err = true; })
      .then(fin);
  };

  C.css = function () {
    return '<style>'
      + '.ctl{font-family:var(--primary-font-family, system-ui);background:var(--casora-popup-row-fill, rgba(140,115,90,.07));'
      +   'border-radius:var(--casora-popup-row-radius, 20px);padding:16px 16px 14px;color:var(--casora-popup-tiles-text-primary, #3A322B);}'
      + '.ctl-strip{position:relative;height:34px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;outline:none;}'
      + '.ctl-track{position:absolute;left:0;right:0;top:10px;height:14px;border-radius:7px;background:var(--casora-soft-control-fill, rgba(140,115,90,.12));}'
      + '.ctl-m{position:absolute;top:17px;transform:translate(-50%,-50%);border-radius:999px;pointer-events:none;transition:box-shadow .16s ease;}'
      + '.ctl-m.motion{width:4px;height:14px;background:var(--casora-soft-sub, rgba(58,50,43,.55));}'
      + '.ctl-m.person{width:10px;height:10px;background:var(--casora-popup-tiles-text-primary, #3A322B);}'
      + '.ctl-m.ring{width:16px;height:16px;background:var(--casora-popup-accent, var(--casora-color-teal, #30B0C7));box-shadow:0 0 0 3px var(--casora-popup-row-fill, rgba(255,255,255,.6));}'
      + '.ctl-m.sel{box-shadow:0 0 0 3px var(--casora-popup-row-fill, #fff), 0 0 0 5px var(--casora-popup-accent, #B67A50);}'
      + '.ctl-ax{position:relative;height:16px;margin-top:2px;font-size:12px;font-weight:600;color:var(--casora-soft-sub, rgba(58,50,43,.6));font-variant-numeric:tabular-nums;}'
      + '.ctl-ax span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;}'
      + '.ctl-ax span:first-child{transform:none;}.ctl-ax span:last-child{transform:translateX(-100%);}'
      + '.ctl-r{display:flex;align-items:baseline;gap:8px;margin-top:12px;min-height:20px;}'
      + '.ctl-w{font-size:15px;font-weight:700;}.ctl-t{font-size:13px;font-weight:500;color:var(--casora-soft-sub, rgba(58,50,43,.6));font-variant-numeric:tabular-nums;}'
      + '.ctl-go{margin-left:auto;font-size:13px;font-weight:600;color:var(--casora-soft-sub, rgba(58,50,43,.6));}'
      + '</style>';
  };
  C.render = function (job, camId, hass, now) {
    var UI = window._casoraUI;
    now = now || Date.now();
    var start = C.dayStart(now), span = Math.max(1, now - start);
    var labelHtml = function (t) { return UI && UI.label ? UI.label(t) : '<div>' + esc(T(t)) + '</div>'; };
    if (!job) return '';
    var list = job.list;
    if (list == null) {
      return labelHtml('Heute') + '<div class="ctl" aria-busy="true"><div class="ctl-strip"><div class="ctl-track"></div></div><div class="ctl-ax"></div><div class="ctl-r"></div></div>';
    }
    if (!list.length) {
      return labelHtml('Heute') + (UI && UI.group ? UI.group([{ icon: job.err ? 'mdi:alert-circle-outline' : 'mdi:check', iconTone: job.err ? 'warn' : null,
        label: job.err ? 'Verlauf nicht abrufbar' : 'Heute keine Bewegung' }], null) : '');
    }
    var media = C.media(hass, camId);
    var pct = function (at) { return Math.max(0, Math.min(100, (at - start) / span * 100)); };
    var marksHtml = list.slice().reverse().map(function (e) {
      return '<i class="ctl-m ' + esc(e.kind) + '" data-at="' + Number(e.at) + '" data-k="' + esc(e.kind) + '" style="left:' + pct(e.at).toFixed(2) + '%"></i>';
    }).join('');
    var ticksHtml = [0, 6, 12, 18].map(function (h) { return start + h * 3600000; }).filter(function (t) { return t < now - span * 0.12; })
      .map(function (t) { return '<span style="left:' + pct(t).toFixed(2) + '%">' + esc(clock(t)) + '</span>'; }).join('')
      + '<span style="left:100%">' + esc(T('Jetzt')) + '</span>';
    var top = list[0];
    var sum = T(C.head(list.length));
    return labelHtml(C.head(list.length))
      + '<div class="ctl" data-cam="' + esc(camId) + '"' + (media ? ' data-media="' + esc(media) + '"' : '') + '>'
      + '<div class="ctl-strip" role="slider" tabindex="0" aria-label="' + esc(sum) + '" aria-valuemin="0" aria-valuemax="' + (list.length - 1)
      +   '" aria-valuenow="' + (list.length - 1) + '" onclick="window._casoraCamTimeline.tap(event,this)">'
      + '<div class="ctl-track"></div>' + marksHtml + '</div>'
      + '<div class="ctl-ax">' + ticksHtml + '</div>'
      + '<div class="ctl-r" aria-live="polite"><span class="ctl-w">' + esc(T(C.word(top.kind))) + '</span>'
      +   '<span class="ctl-t">' + esc(clock(top.at) + ' · ' + T(C.ago(top.at, now))) + '</span>'
      +   (media ? '<span class="ctl-go">' + esc(T('Aufnahmen')) + ' ↗</span>' : '') + '</div>'
      + '</div>';
  };
  // Nearest event to the tap: with recordings, open them; otherwise only show its time.
  C.nearest = function (marks, x) {
    var best = null, d = Infinity;
    marks.forEach(function (m) { var dd = Math.abs(m.x - x); if (dd < d) { d = dd; best = m; } });
    return best;
  };
  C.tap = function (ev, strip) {
    if (ev) { ev.stopPropagation(); }
    var box = strip.getBoundingClientRect();
    var els = Array.prototype.slice.call(strip.querySelectorAll('.ctl-m'));
    var hit = C.nearest(els.map(function (el) { var r = el.getBoundingClientRect(); return { el: el, x: r.left + r.width / 2 }; }),
      ev && ev.clientX != null ? ev.clientX : box.left + box.width);
    if (!hit) return;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    els.forEach(function (el) { el.classList.toggle('sel', el === hit.el); });
    var at = Number(hit.el.getAttribute('data-at')), plate = strip.parentNode;
    var r = plate.querySelector('.ctl-r');
    if (r) {
      r.querySelector('.ctl-w').textContent = T(C.word(hit.el.getAttribute('data-k')));
      r.querySelector('.ctl-t').textContent = clock(at) + ' · ' + T(C.ago(at));
    }
    var media = plate.getAttribute('data-media');
    if (media) {
      try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* closed */ }
      history.pushState(null, '', media);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    }
  };
  // The camera popup's markup is cached per camera state, so the timeline fills itself in: a placeholder and an
  // <img> whose onload calls mount(this). It redraws every minute while the popup is open (from the cache).
  C.mount = function (img) {
    var box = img && img.previousElementSibling;
    var ha = typeof document !== 'undefined' && document.querySelector('home-assistant');
    var hass = ha && ha.hass;
    if (!box || !hass) return;
    var camId = box.getAttribute('data-cam-tl');
    if (!C.sources(hass, camId).length) { box.innerHTML = ''; return; }
    var draw = function () {
      if (!box.isConnected) { clearInterval(box._ctlT); return; }
      var h = (document.querySelector('home-assistant') || {}).hass || hass;
      C.load(h, camId, function (job) { if (box.isConnected) { var tlHtml = C.css() + C.render(job, camId, h); box.innerHTML = tlHtml; } });
    };
    var waitHtml = C.css() + C.render({ list: null }, camId, hass);
    box.innerHTML = waitHtml;
    draw();
    clearInterval(box._ctlT);
    box._ctlT = setInterval(draw, 60000);
  };
  window._casoraCamTimelineHtml = function (camId) { return C.slot(camId); };
  C.slot = function (camId) {
    return '<div class="cam-tl" data-cam-tl="' + esc(camId) + '"></div>'
      + '<img alt="" style="display:none" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="'
      + ' onload="window._casoraCamTimeline&amp;&amp;window._casoraCamTimeline.mount(this)">';
  };
})();
