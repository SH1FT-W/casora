// ── Media group badge: one rule for "N läuft" and its popup (#64) ────────────────────────────
// The badge (casora_badge_media_group) counted a player as running from its state alone (playing,
// buffering, on – a TV that is merely on), while the row its tap opened only showed players with a
// title or artist. A TV that was on showed "1 läuft" and the tap opened an empty row. Now the badge
// counts with kind() below and its tap opens the popup casora_popup_media, which lists every configured
// player with the same kind(): running first (with play/pause), then paused, then the rest with their state.
//   window._casoraMediaBadge.ids(variables)                  → configured players (entity_1 … entity_14), unique
//   window._casoraMediaBadge.kind(s, timeout, states)        → 'run' | 'pause' | 'rest' (the badge's rule)
//   window._casoraMediaBadge.count(ids, states, timeout, pc) → { active, run, paused, sub } (sub = "1 läuft" …)
//   window._casoraMediaBadge.word(s)                         → state word (Läuft, An, Pausiert, Bereit, Aus …)
//   window._casoraMediaBadge.rows(ids, states, hass, timeout, pcCfg) → popup rows, running first
//   window._casoraMediaBadge.popup(states, hass, variables)  – popup casora_popup_media
//   window._casoraMediaBadge.sec(part, C, states, hass)      – live parts (hero, list)
(function () {
  if (window._casoraMediaBadge && window._casoraMediaBadge.v === 1) return;
  var B = window._casoraMediaBadge = { v: 1 };

  var low = function (x) { return String(x == null ? '' : x).trim().toLowerCase(); };
  var hasContent = function (a) {
    a = a || {};
    return !!(String(a.media_title || '').trim() || String(a.media_artist || a.artist || a.media_album_artist || '').trim());
  };

  B.ids = function (v) {
    v = v || {};
    var out = [];
    for (var i = 1; i <= 14; i++) {
      var e = v['entity_' + i];
      if (e && typeof e === 'string' && out.indexOf(e) < 0) out.push(e);
    }
    return out;
  };

  // Same rule the badge has always used (dashfix2 06.10.2026): playing/buffering/on run, paused with a title
  // stays active until the pause timeout, everything else rests.
  B.kind = function (s, timeout, states) {
    if (!s) return 'rest';
    var st = low(s.state);
    if (['unavailable', 'unknown', 'off', 'standby', ''].indexOf(st) > -1) return 'rest';
    if (['playing', 'buffering', 'on'].indexOf(st) > -1) return 'run';
    if (st !== 'paused' || !hasContent(s.attributes)) return 'rest';
    var t = Number(timeout == null ? 10 : timeout);
    if (!isFinite(t)) t = 10;
    if (t <= 0) return 'pause';
    var since = (typeof window._casoraPausedSince === 'function' && window._casoraPausedSince(s, states)) || s.last_changed;
    return (Date.now() - new Date(since).getTime()) / 60000 <= t ? 'pause' : 'rest';
  };

  B.subText = function (active, paused) {
    var run = active - paused;
    return active === 0 ? 'Nichts läuft'
      : run === 0 ? paused + ' pausiert'
      : run === 1 ? '1 läuft' : run + ' laufen';
  };

  B.count = function (ids, states, timeout, pc) {
    var run = 0, paused = 0;
    (ids || []).forEach(function (id) {
      var k = B.kind(states && states[id], timeout, states);
      if (k === 'run') run++;
      else if (k === 'pause') paused++;
    });
    run += Number(pc) || 0;
    return { active: run + paused, run: run, paused: paused, sub: B.subText(run + paused, paused) };
  };

  B.word = function (s) {
    if (!s) return 'Nicht verfügbar';
    var st = low(s.state);
    return st === 'playing' || st === 'buffering' ? 'Läuft'
      : st === 'on' ? 'An'
      : st === 'paused' ? 'Pausiert'
      : st === 'idle' ? 'Bereit'
      : st === 'standby' ? 'Standby'
      : st === 'off' ? 'Aus'
      : 'Nicht verfügbar';
  };

  var nameOf = function (id, s) { return String((s && s.attributes && s.attributes.friendly_name) || id); };
  var iconOf = function (id, s) {
    var t = (nameOf(id, s) + ' ' + id + ' ' + ((s && s.attributes && s.attributes.device_class) || '')).toLowerCase();
    if (/playstation|ps5|ps4|xbox|psn/.test(t)) return 'mdi:gamepad-variant';
    if (/\btv\b|tv_|_tv|fernseher|qled|oled|bravia|webos|television/.test(t)) return 'mdi:television';
    return 'mdi:speaker';
  };
  var roomOf = function (id, hass) {
    if (!hass) return '';
    var reg = (hass.entities || {})[id] || {};
    var area = reg.area_id || (reg.device_id && hass.devices && hass.devices[reg.device_id] ? hass.devices[reg.device_id].area_id : null);
    return area && hass.areas && hass.areas[area] ? String(hass.areas[area].name || '') : '';
  };
  var mediaLine = function (a) {
    a = a || {};
    // Entities in the metadata (#97, casora-core) as plain text.
    var dec = window.casoraDecodeEntities || function (x) { return String(x == null ? '' : x).trim(); };
    var title = dec(a.media_title || '');
    var artist = dec(a.media_artist || a.artist || a.media_album_artist || a.media_series_title || '');
    var app = String(a.app_name || a.source || '').trim();
    return [title, artist].filter(Boolean).join(' – ') || app;
  };
  // PAUSE (1) or PLAY (16384) – without either the row opens the player instead.
  var canToggle = function (s) {
    var f = Number((s && s.attributes && s.attributes.supported_features) || 0);
    return (f & 1) !== 0 || (f & 16384) !== 0;
  };

  B.rows = function (ids, states, hass, timeout, pcCfg) {
    var order = { run: 0, pause: 1, rest: 2 };
    var restRank = function (s) {
      var st = low(s && s.state);
      return st === 'idle' || st === 'on' ? 0 : st === 'paused' ? 1 : st === 'standby' || st === 'off' ? 2 : 3;
    };
    var list = (ids || []).map(function (id, i) {
      var s = states ? states[id] : null;
      var kind = B.kind(s, timeout, states);
      var line = s ? mediaLine(s.attributes) : '';
      return {
        id: id, i: i, kind: kind, word: B.word(s), name: nameOf(id, s), icon: iconOf(id, s),
        room: roomOf(id, hass), line: kind === 'rest' ? '' : line,
        playing: !!s && low(s.state) === 'playing',
        // Play/pause only for real playback: a TV that is "on" (webOS: live channel as media_title) gets "An" instead.
        toggle: kind !== 'rest' && !!s && ['playing', 'buffering', 'paused'].indexOf(low(s.state)) > -1
          && hasContent(s.attributes) && canToggle(s),
        // Running: real playback before a device that is merely on (a TV without a title).
        rank: kind === 'rest' ? restRank(s) : kind === 'run' && low(s && s.state) === 'on' ? 1 : 0,
      };
    });
    // PC activities (Discord/Steam) count as running in the badge (pc_count), so they are listed too.
    var P = pcCfg && typeof window._casoraPCSources === 'function' ? (window._casoraPCSources(states || {}, pcCfg) || {}) : {};
    ['discord', 'steam'].forEach(function (k, j) {
      var r = P[k];
      if (!r) return;
      list.push({ id: null, i: 100 + j, kind: 'run', word: 'Läuft', name: String(r.label || (k === 'steam' ? 'Steam' : 'Discord')),
        icon: 'mdi:gamepad-variant', room: '', line: [r.game, r.details].filter(Boolean).join(' – '), playing: true, toggle: false, rank: 0, pc: true });
    });
    return list.sort(function (a, b) { return (order[a.kind] - order[b.kind]) || (a.rank - b.rank) || (a.i - b.i); });
  };

  var rowOf = function (r) {
    var sub = [r.line, r.room].filter(Boolean).join(' · ');
    var o = { icon: r.icon, iconTone: r.kind === 'run' ? 'accent' : undefined, label: r.name, labelLit: true, sub: sub || undefined };
    if (r.toggle) {
      o.entity = r.id;
      o.svc = { domain: 'media_player', service: 'media_play_pause', data: { entity_id: r.id } };
      o.action = r.playing ? 'Pausieren' : 'Abspielen';
      o.actionTone = 'accent';
    } else {
      if (r.id) o.entity = r.id;
      o.value = r.word;
      o.valueTone = r.kind === 'run' ? 'accent' : null;
    }
    return o;
  };

  var cfgOf = function (variables) {
    var v = variables || {};
    var pc = v.pc_cfg && typeof v.pc_cfg === 'object' ? v.pc_cfg : null;
    return { ids: B.ids(v), timeout: v.pause_timeout_minutes == null ? 10 : v.pause_timeout_minutes, pc: pc };
  };
  B.cfgOf = cfgOf;

  B.popup = function (states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var C = cfgOf(variables);
    var watch = C.ids.slice();
    if (C.pc) Object.keys(C.pc).forEach(function (k) { var e = C.pc[k]; if (typeof e === 'string' && e.indexOf('.') > 0) watch.push(e); });
    var call = function (part) {
      return 'return window._casoraMediaBadge ? window._casoraMediaBadge.sec(' + JSON.stringify(part) + ', '
        + JSON.stringify(C) + ', states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) } };
    // One live section for both lists: a player that starts or stops moves between them while the popup is open.
    f.list = { card: K.secCard(watch, call('list'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['list'], right: [] });
  };

  B.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    C = C || {};
    var rows = B.rows(C.ids || [], states, hass, C.timeout, C.pc);
    if (part === 'hero') {
      var pc = rows.filter(function (r) { return r.pc; }).length;
      var c = B.count(C.ids || [], states, C.timeout, pc);
      var n = (C.ids || []).length;
      return UI.line(c.sub, n > 1 ? [n + ' Geräte'] : []);
    }
    if (part !== 'list') return '';
    if (!rows.length) return UI.note ? UI.note('Noch kein Gerät zugeordnet') : '';
    var live = rows.filter(function (r) { return r.kind !== 'rest'; });
    var rest = rows.filter(function (r) { return r.kind === 'rest'; });
    var groupsHtml = '';
    if (live.length) groupsHtml += UI.group(live.map(rowOf), 'Läuft');
    if (rest.length) groupsHtml += UI.group(rest.map(rowOf), live.length ? 'Weitere Geräte' : 'Geräte');
    return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 22px);">' + groupsHtml + '</div>';
  };
})();
