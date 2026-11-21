// ── Detectors in Security: sub-badges „Rauchmelder“, „Wassermelder“ and „Bewegung“ with their popups (#209) ───────────────────────────
// The counting lives in 00-finder.js (casoraSecDetectors, casoraSecCount); here the three sub-badges of the security
// badge and the popups they open. They show while their switch is on (Settings › Home & devices › Security ›
// Detectors) and there is at least one such sensor – also when all is calm, so one sees Casora knows the detectors.
// A detector the badge lists itself (security_entity_1…8) keeps its own single badge and is not listed again here.
//   D.list(hass, v, where, user, kind)          → ids of 'smoke' (smoke, gas, CO), 'water', 'motion' ('detectors': all but motion)
//   D.badge(states, hass, user, v, where, kind) → { shown, level, title, sub, html, icon, ids }
//   D.show(states, hass, user, v, where, kind)  → the sub-badge is visible
//   D.popup(states, hass, variables)            – popup casora_popup_security_detectors (variables.kind)
//   D.sec(part, ctx, states, hass, user)        – live parts (stage, list)
//   D.names(rows)                               → the list rows with their titles (the room only in the subtitle, #225)
(function () {
  if (window._casoraSecDet && window._casoraSecDet.v === 1) return;
  var D = window._casoraSecDet = { v: 1 };

  var low = function (x) { return String(x == null ? '' : x).trim().toLowerCase(); };
  var isDead = function (s) { s = low(s); return !s || s === 'unavailable' || s === 'unknown'; };
  var esc = function (t) {
    return window.casoraEsc ? window.casoraEsc(t) : String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var onHome = function (v, where) { return window.casoraSecDetOnHome ? window.casoraSecDetOnHome(v || {}, where) : !!(v && v.place === 'home'); };

  // The sub-badge's kind: 'smoke' (smoke, gas, CO), 'water', 'motion'; 'detectors' = smoke and water together.
  var kindOf = function (k) { return k === 'motion' || k === 'water' || k === 'detectors' ? k : 'smoke'; };
  // The badge's own entries: v.own (the room's security_entity_1…8, passed by the row), groups through their members.
  var ownOf = function (S, v) {
    var out = [];
    (Array.isArray(v && v.own) ? v.own : []).forEach(function (x) {
      if (typeof x !== 'string') return;
      var m = ((S[x] || {}).attributes || {}).entity_id;
      (Array.isArray(m) ? m : [x]).forEach(function (y) { if (out.indexOf(y) < 0) out.push(y); });
    });
    return out;
  };
  D.list = function (hass, v, where, user, kind) {
    if (!window.casoraSecDetectors || !hass) return { ids: [], kind: {}, area: {} };
    var det = window.casoraSecDetectors(hass, v || {}, onHome(v, where) ? 'home' : 'room', user, []);
    var own = ownOf((hass && hass.states) || {}, v || {});
    var grp = kindOf(kind);
    var ids = (grp === 'motion' ? det.motion : det.safety).filter(function (x) {
      if (own.indexOf(x) >= 0) return false;
      return grp === 'detectors' || grp === 'motion' || (grp === 'water') === (det.kind[x] === 'water');
    });
    return { ids: ids, kind: det.kind, area: det.area };
  };

  // When was there motion last? The newest of the sensors (casoraSinceMs: not HA's start), and where.
  var lastMove = function (ids, S, hass, area) {
    var best = null, at = null;
    ids.forEach(function (id) {
      var x = S[id];
      if (!x || low(x.state) !== 'off') return;
      var t = typeof window.casoraSinceMs === 'function' ? window.casoraSinceMs(x, hass) : Date.parse(x.last_changed || '');
      if (t != null && isFinite(t) && (at == null || t > at)) { at = t; best = id; }
    });
    return best ? { id: best, at: at, area: area[best] || '' } : null;
  };
  var ago = function (t) { return typeof window.casoraAgo === 'function' ? window.casoraAgo(t) : ''; };

  D.badge = function (states, hass, user, v, where, kind) {
    var S = states || (hass && hass.states) || {};
    var L = D.list(hass, v, where, user, kind);
    var ids = L.ids;
    if (!ids.length) return { shown: false, level: 'ok', title: '', sub: '', html: null, icon: '', ids: [] };
    var home = onHome(v, where);
    if (kind === 'motion') {
      var on = ids.filter(function (id) { return low((S[id] || {}).state) === 'on'; });
      var away = !!(window.casoraSecurityAway && window.casoraSecurityAway(hass));
      var r = { shown: true, title: 'Bewegung', icon: 'mdi:motion-sensor', ids: ids, html: null, level: on.length && away ? 'alarm' : 'ok', away: away };
      if (on.length) {
        var where1 = L.area[on[0]] || '';
        r.sub = 'Erkannt' + (where1 && (home || on.length > 1) ? ' · ' + where1 : '');
      } else if (ids.every(function (id) { return isDead((S[id] || {}).state); })) {
        r.sub = 'Offline';
      } else {
        var m = lastMove(ids, S, hass, L.area);
        if (m && ago(m.at)) {
          var pre = home && m.area ? m.area + ' · ' : '';
          r.sub = pre + ago(m.at);
          r.html = esc(pre) + '<casora-ago data-since="' + Math.round(m.at) + '">' + esc(ago(m.at)) + '</casora-ago>';
        } else r.sub = 'Ruhig';
      }
      return r;
    }
    var hits = [], dead = [];
    ids.forEach(function (id) {
      var s = (S[id] || {}).state;
      if (isDead(s)) dead.push(id);
      else if (low(s) === 'on') hits.push({ id: id, kind: L.kind[id], area: L.area[id] });
    });
    var every = function (k) { return ids.every(function (id) { return L.kind[id] === k; }); };
    var water = every('water');
    var b = { shown: true, ids: ids, html: null,
      title: every('smoke') ? 'Rauchmelder' : water ? 'Wassermelder' : every('gas') ? 'Gasmelder' : every('co') ? 'CO-Melder' : kindOf(kind) === 'smoke' ? 'Rauchmelder' : 'Melder' };
    if (hits.length) {
      b.level = 'alarm';
      b.sub = window.casoraSecDetWords(hits, home).map(function (w) { return w.word; }).join(' · ');
      b.icon = hits.every(function (h) { return h.kind === 'water'; }) ? 'mdi:water-alert' : 'mdi:smoke-detector-variant-alert';
    } else if (dead.length) {
      b.level = 'warn';
      b.sub = ids.length === 1 ? 'Offline' : dead.length + ' offline';
      b.icon = water ? 'mdi:water-off' : 'mdi:smoke-detector-variant-off';
    } else {
      b.level = 'ok';
      b.sub = (ids.length > 1 ? ids.length + ' Melder · ' : '') + (water ? 'Trocken' : 'Normal');
      b.icon = water ? 'mdi:water-check' : 'mdi:smoke-detector-variant';
    }
    return b;
  };
  D.show = function (states, hass, user, v, where, kind) { return D.badge(states, hass, user, v, where, kind).shown; };
  // Icon colour of the sub-badge: the security level's colour (Soft: green / orange / red).
  D.color = function (lv) {
    var fb = lv === 'alarm' ? 'var(--casora-badge-red-color, #ff453a)' : lv === 'warn' ? 'var(--casora-badge-alert-color, #ff9800)'
      : 'var(--casora-badge-security-color, #00c3d0)';
    return 'var(--casora-security-' + (lv || 'ok') + '-color, ' + fb + ')';
  };

  // ── Popup ──────────────────────────────────────────────────────────────────────────────
  var nameOf = function (id, S) { return String(((S[id] || {}).attributes || {}).friendly_name || id); };
  // The state word as the detector's tile says it (18-ziele.js: smoke „Rauch“/„Normal“, moisture „Nass“/„Trocken“).
  var WORD = { smoke: ['Rauch', 'Normal'], gas: ['Gas', 'Normal'], co: ['Kohlenmonoxid', 'Normal'], water: ['Nass', 'Trocken'] };
  var ICON = { smoke: 'mdi:smoke-detector-variant', gas: 'mdi:meter-gas', co: 'mdi:molecule-co', water: 'mdi:water' };
  var ctxOf = function (variables) {
    var v = variables || {};
    return { kind: kindOf(v.kind), place: v.place || null, room_name: v.room_name || null,
      own: Array.isArray(v.own) ? v.own.filter(function (x) { return typeof x === 'string'; }) : [] };
  };
  /* The titles of a detector list (#225). A row shows its room as subtitle (r.sub), so the title does not say it
     again: after the shared leading words are dropped (casoraDropCommonPrefix), the room goes from the start or the
     end of the title, whole words only, any case, with its separators („Flur Rauchmelder“, „Rauchmelder - Flur“,
     „Rauchmelder (Flur)“ → „Rauchmelder“). The twin rule (#116: the room in front of equal names from different
     rooms) does not apply to these rows, the subtitle tells them apart. Never an empty title or a bare number (then
     the whole name without its room, else the name as it was), and two detectors of one room that would read alike
     keep their names. A row without a room is named as in every other list. Returns new rows, marked so that
     UI.group does not cut them again. */
  var SEP = '[\\s\\-–—·:,;|/()\\[\\]]*';
  var bare = function (t) { return !/[\p{L}]/u.test(String(t || '')); };
  var noRoom = function (name, room) {
    var rx = String(room || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (!rx) return String(name);
    return String(name)
      .replace(new RegExp('^' + SEP + rx + '(?![\\p{L}\\p{N}])' + SEP, 'iu'), '')
      .replace(new RegExp('(^|[^\\p{L}\\p{N}])' + SEP + rx + SEP + '$', 'iu'), '').trim();
  };
  D.names = function (rows) {
    rows = rows || [];
    var drop = window.casoraDropCommonPrefix;
    var full = rows.map(function (r) { return String(r.label == null ? '' : r.label); });
    var cut = drop ? drop(full) : full;
    var twin = drop ? drop(full, rows.map(function (r) { return r.entity || null; })) : full;
    var out = rows.map(function (r, i) {
      if (!r.sub) return twin[i];
      var t = noRoom(cut[i], r.sub);
      if (bare(t)) t = noRoom(full[i], r.sub);
      return bare(t) ? cut[i] : t;
    });
    return rows.map(function (r, i) {
      var alike = !!r.sub && rows.some(function (q, j) {
        return j !== i && q.sub === r.sub && low(out[j]) === low(out[i]) && low(full[j]) !== low(full[i]);
      });
      return Object.assign({}, r, { label: alike ? cut[i] : out[i], popupNamed: true });
    });
  };

  D.popup = function (states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var c = ctxOf(variables);
    var watch = D.list(hass, c, c.place || 'room', hass && hass.user, c.kind).ids
      .concat(c.kind === 'motion' ? Object.keys((hass && hass.states) || {}).filter(function (x) { return /^(person|alarm_control_panel)\./.test(x); }) : []);
    var call = function (part) {
      return 'return window._casoraSecDet ? window._casoraSecDet.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, user) : "";';
    };
    var v3 = !!(UI.v3 && UI.v3() && UI.stage);
    var f = { list: { card: K.secCard(watch, call('list'), states) } };
    if (v3) f.stage = { card: K.secCard(watch, call('stage'), states) };
    else f.hero = { card: K.secCard(watch, call('hero'), states) };
    return K.layout({ fields: f, top: v3 ? [] : ['hero'], stage: v3 ? 'stage' : null, left: ['list'], right: [] });
  };

  D.sec = function (part, c, states, hass, user) {
    var UI = window._casoraUI;
    if (!UI) return '';
    c = ctxOf(c);
    var S = states || (hass && hass.states) || {};
    var where = c.place || 'room';
    var b = D.badge(S, hass, user, c, where, c.kind);
    var L = D.list(hass, c, where, user, c.kind);
    var ids = L.ids;
    if (c.kind === 'motion') {
      if (part === 'hero') return UI.line(b.sub || 'Bewegung', [], { tone: b.level === 'alarm' ? 'bad' : null });
      var mv = function (id) { var x = S[id]; return x && low(x.state) === 'on' ? 'on' : x && !isDead(x.state) ? 'off' : 'dead'; };
      if (part === 'stage') {
        if (!ids.length) return UI.stage('status', { empty: { icon: 'mdi:motion-sensor', text: 'Keine Bewegungsmelder gefunden' } });
        var on = ids.filter(function (id) { return mv(id) === 'on'; });
        var m = lastMove(ids, S, hass, L.area);
        return UI.stage('status', {
          tone: on.length ? (b.away ? 'bad' : 'good') : 'off',
          icon: 'mdi:motion-sensor',
          text: on.length ? 'Bewegung erkannt' : m && ago(m.at) ? 'Zuletzt ' + ago(m.at) : 'Ruhig',
          facts: [{ label: 'Melder', value: String(ids.length) }, { label: 'Zählt', value: b.away ? 'Jetzt' : 'Wenn niemand zuhause ist' }],
          segs: ids.map(function (id) {
            var k = mv(id);
            return { ok: k !== 'on', tone: k === 'on' ? (b.away ? 'bad' : 'good') : 'off', label: nameOf(id, S) };
          }),
        });
      }
      if (part !== 'list') return '';
      var t = function (id) { var x = S[id]; var n = x && typeof window.casoraSinceMs === 'function' ? window.casoraSinceMs(x, hass) : Date.parse((x || {}).last_changed || ''); return isFinite(n) ? n : 0; };
      var sorted = ids.slice().sort(function (a, b2) { return (mv(b2) === 'on') - (mv(a) === 'on') || t(b2) - t(a); });
      var rows = sorted.map(function (id) {
        var k = mv(id), r = { icon: 'mdi:motion-sensor', label: nameOf(id, S), labelLit: true, entity: id };
        if (L.area[id]) r.sub = L.area[id];
        r.value = k === 'on' ? 'Erkannt' : k === 'dead' ? 'Offline' : (t(id) && ago(t(id))) || 'Ruhig';
        if (k === 'on' && b.away) r.iconTone = 'bad';
        return r;
      });
      return rows.length ? UI.group(D.names(rows), 'Bewegungsmelder') : '';
    }
    // Smoke, gas, CO and water detectors.
    var st = function (id) { var s = (S[id] || {}).state; return isDead(s) ? 'dead' : low(s) === 'on' ? 'on' : 'off'; };
    if (part === 'hero') return UI.line(b.sub || b.title || 'Melder', [], { tone: b.level === 'alarm' ? 'bad' : b.level === 'warn' ? 'warn' : null });
    if (part === 'stage') {
      if (!ids.length) return UI.stage('status', { empty: { icon: c.kind === 'water' ? 'mdi:water' : 'mdi:smoke-detector-variant', text: 'Keine Melder gefunden' } });
      var hits = ids.filter(function (id) { return st(id) === 'on'; }), dead = ids.filter(function (id) { return st(id) === 'dead'; });
      var water = ids.every(function (id) { return L.kind[id] === 'water'; });
      var facts = [{ label: 'Melder', value: String(ids.length) }];
      if (dead.length) facts.push({ label: 'offline', value: String(dead.length) });
      return UI.stage('status', {
        tone: hits.length ? 'bad' : dead.length ? 'warn' : 'good',
        icon: b.icon,
        text: hits.length || dead.length ? b.sub : water ? 'Alles trocken' : 'Alles normal',
        facts: facts,
        segs: ids.map(function (id) {
          var k = st(id);
          return { ok: k === 'off', tone: k === 'on' ? 'bad' : k === 'dead' ? 'warn' : 'good', label: nameOf(id, S) };
        }),
      });
    }
    if (part !== 'list') return '';
    var row = function (id) {
      var k = st(id), kd = L.kind[id] || 'smoke', w = WORD[kd] || WORD.smoke;
      var r = { icon: ICON[kd] || ICON.smoke, label: nameOf(id, S), labelLit: true, entity: id,
        value: k === 'dead' ? 'Offline' : k === 'on' ? w[0] : w[1] };
      if (L.area[id]) r.sub = L.area[id];
      if (k === 'on') r.iconTone = 'bad';
      else if (k === 'dead') r.iconTone = 'warn';
      return r;
    };
    // One name per detector across „Meldet“, „Offline“ and the calm ones: a detector that reports keeps its name.
    var all = D.names(ids.map(row));
    var of = function (k) { return all.filter(function (r) { return st(r.entity) === k; }); };
    var on2 = of('on'), off2 = of('dead'), ok2 = of('off');
    var html = '';
    if (on2.length) html += UI.group(on2, 'Meldet');
    if (off2.length) html += UI.group(off2, 'Offline');
    if (ok2.length) html += UI.group(ok2, on2.length || off2.length ? 'Normal' : (b.title || 'Melder'));
    return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 22px);">' + html + '</div>';
  };
})();
