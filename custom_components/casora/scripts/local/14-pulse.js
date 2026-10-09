// ── Pulse: Kachel + Popup (Casora 1.2.x) ─────────────────────────────────────
// Für die Integration „Pulse“ (Batterie-/Funkwächter). Nur aus Entitäten, kein WebSocket-Abo.
// Erkennung: hass.entities mit platform 'pulse'; welche Entität was ist, sagt der translation_key
// (status, problem, last_report je Gerät; problems, monitored gesamt) – nie die Entity-ID, die hängt
// an Sprache und Gerätenamen. Batterie-% aus dem Batteriesensor desselben Geräts (device_id).
// Gründe (reason_key) als eigene kurze Sätze; Pulses fertiger Satz (reason) ist in Server-Sprache
// und enthält laufende Zeiten.
//   window._casoraPulse.installed(hass)        → Pulse-Entitäten vorhanden?
//   window._casoraPulse.scan(hass, states)     → {list, problems, soon, ok, total, worst, counts, …}
//   window._casoraPulse.tileState(s) / .active(s) / .color(worst)  – Kachel casora_pulse
//   window._casoraPulse.popup(states, hass, variables)             – Popup casora_popup_pulse
//   window._casoraPulse.sec(part, C, states, hass)                 – Live-Bereiche des Popups
(function () {
  if (window._casoraPulse) return;
  var P = window._casoraPulse = {};

  // Schwere wie in Pulse (const.py SEVERITY), für die Sortierung.
  var RANK = { failed: 0, check: 1, watch: 2, learning: 3, ok: 4 };
  var BATTERY = { battery_low: 1, battery_low_flag: 1, battery_soon: 1 };
  var COLOR = {
    failed: 'var(--casora-color-red, #D35A4E)',
    check: 'var(--casora-color-orange, #DE8A4E)',
    watch: 'var(--casora-color-yellow, #E8B04A)',
    ok: 'var(--casora-color-green, #6AAE78)',
  };
  P.COLOR = COLOR;
  P.PANEL = '/pulse';

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };

  // ── Entitäten finden ──────────────────────────────────────────────────────
  // Je Registry-Stand einmal (hass.entities wechselt nur bei Registry-Änderungen das Objekt).
  var cache = { R: null, idx: null };
  P.index = function (hass) {
    var R = (hass && hass.entities) || {};
    if (cache.R === R && cache.idx) return cache.idx;
    var idx = { dev: {}, problems: null, monitored: null, battery: {} };
    var ids = Object.keys(R).sort();
    for (var i = 0; i < ids.length; i++) {
      var e = R[ids[i]];
      if (!e || e.platform !== 'pulse') continue;
      var k = e.translation_key;
      if (k === 'problems' || k === 'monitored') { if (!idx[k]) idx[k] = ids[i]; continue; }
      if (k !== 'status' && k !== 'problem' && k !== 'last_report') continue;
      if (!e.device_id) continue;
      var d = idx.dev[e.device_id] || (idx.dev[e.device_id] = { device: e.device_id });
      if (!d[k]) d[k] = ids[i];
    }
    // Batteriesensor je überwachtem Gerät (nicht von Pulse, device_class battery steht nur im Zustand –
    // deshalb hier nur Kandidaten sammeln, die Prüfung macht scan()).
    for (var j = 0; j < ids.length; j++) {
      var x = R[ids[j]];
      if (!x || x.platform === 'pulse' || !x.device_id || !idx.dev[x.device_id]) continue;
      if (ids[j].indexOf('sensor.') !== 0) continue;
      (idx.battery[x.device_id] || (idx.battery[x.device_id] = [])).push(ids[j]);
    }
    cache = { R: R, idx: idx };
    return idx;
  };
  P.installed = function (hass) {
    var idx = P.index(hass);
    return !!(idx.problems || idx.monitored || Object.keys(idx.dev).length);
  };

  // ── Texte ─────────────────────────────────────────────────────────────────
  // Typischer Takt (Sekunden) → „alle 4 Std.“, „jede Stunde“, „einmal am Tag“.
  P.every = function (sec) {
    var s = num(sec);
    if (s == null || s <= 0) return null;
    var m = Math.round(s / 60);
    if (m < 2) return 'jede Minute';
    if (m < 60) return 'alle ' + m + ' Min.';
    var h = Math.round(s / 3600);
    if (h < 2) return 'jede Stunde';
    if (h < 24) return 'alle ' + h + ' Std.';
    var d = Math.round(s / 86400);
    return d < 2 ? 'einmal am Tag' : 'alle ' + d + ' Tage';
  };
  // Zeitpunkt → „seit 12 Min.“, „seit 9 Std.“, „seit 2 T.“
  P.since = function (ts, now) {
    var t = Date.parse(ts);
    if (isNaN(t)) return null;
    var m = Math.max(1, Math.round(((now || Date.now()) - t) / 60000));
    if (m < 60) return 'seit ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    return 'seit ' + Math.max(1, Math.floor(m / 1440)) + ' T.';
  };
  // Kurzer Grund je reason_key; der Status unterscheidet still (prüfen) und ausgefallen.
  P.reason = function (d) {
    var k = d.reason, ev = P.every(d.typical);
    switch (k) {
      case 'silent': return (d.status === 'failed' ? 'Antwortet nicht' : 'Still') + (ev ? ' · sonst ' + ev : '');
      case 'silent_new': return 'Hat sich noch nicht gemeldet';
      case 'unavailable': return 'Nicht erreichbar';
      case 'partner': return 'Still, obwohl das Partnergerät aktiv war';
      case 'battery_low': return 'Batterie fast leer';
      case 'battery_soon': return 'Batterie bald fällig';
      case 'battery_low_flag': return 'Meldet schwache Batterie';
      case 'waiting_first': return 'Gewechselt · wartet auf erste Meldung';
      case 'learning': return 'Lernt noch den Rhythmus';
      case 'ok':
      case 'ok_rhythm': return 'Meldet sich wie gewohnt' + (ev ? ' · ' + ev : '');
      default:
        return { failed: 'Ausgefallen', check: 'Bitte prüfen', watch: 'Bald fällig', learning: 'Lernt noch den Rhythmus' }[d.status]
          || 'Meldet sich wie gewohnt';
    }
  };
  P.icon = function (d) {
    var k = d.reason;
    if (k === 'battery_low' || k === 'battery_low_flag') return 'mdi:battery-alert-variant-outline';
    if (k === 'battery_soon') return 'mdi:battery-low';
    if (k === 'waiting_first') return 'mdi:timer-sand';
    if (k === 'silent' || k === 'silent_new' || k === 'partner' || k === 'unavailable') return 'mdi:access-point-off';
    return d.status === 'learning' ? 'mdi:school-outline' : 'mdi:pulse';
  };

  // ── Auswertung ────────────────────────────────────────────────────────────
  // → { installed, list (sortiert: schlimmstes zuerst, kritische Geräte vorn, längste Stille vorn),
  //     problems (check+failed), soon (watch), ok (ok+learning), total, worst, counts, problemsId, monitored }
  P.scan = function (hass, states, now) {
    var S = states || (hass && hass.states) || {};
    var D = (hass && hass.devices) || {}, A = (hass && hass.areas) || {};
    var idx = P.index(hass);
    var list = [];
    Object.keys(idx.dev).forEach(function (dev) {
      var x = idx.dev[dev];
      var st = x.status && S[x.status];
      if (!st || bad(st.state) || RANK[st.state] == null) return;
      var a = st.attributes || {};
      var dv = D[dev] || {};
      var name = dv.name_by_user || dv.name
        || String(a.friendly_name || x.status).replace(/\s*Pulse[- ]Status$/i, '');
      var area = dv.area_id && A[dv.area_id] ? A[dv.area_id].name : null;
      var pct = null;
      (idx.battery[dev] || []).some(function (id) {
        var b = S[id];
        if (!b || (b.attributes || {}).device_class !== 'battery') return false;
        pct = num(b.state);
        return pct != null;
      });
      var snooze = Date.parse(a.snoozed_until);
      var d = {
        device: dev, name: name, area: area, status: st.state, reason: a.reason_key || null,
        silentSince: a.silent_since || null, typical: a.typical_interval, critical: !!a.critical,
        snoozed: !isNaN(snooze) && snooze > (now || Date.now()), battery: pct,
        statusId: x.status, problemId: x.problem || null, lastId: x.last_report || null,
      };
      d.text = P.reason(d);
      list.push(d);
    });
    var key = function (d) { return d.silentSince ? Date.parse(d.silentSince) || Infinity : Infinity; };
    list.sort(function (p, q) {
      return RANK[p.status] - RANK[q.status]
        || (q.critical ? 1 : 0) - (p.critical ? 1 : 0)
        || (BATTERY[p.reason] && BATTERY[q.reason] ? (p.battery == null ? 101 : p.battery) - (q.battery == null ? 101 : q.battery) : 0)
        || key(p) - key(q)
        || String(p.name).localeCompare(String(q.name));
    });
    var counts = { failed: 0, check: 0, watch: 0, learning: 0, ok: 0 };
    list.forEach(function (d) { counts[d.status]++; });
    var problems = counts.failed + counts.check;
    return {
      installed: P.installed(hass), list: list, counts: counts,
      problems: problems, soon: counts.watch, ok: counts.ok + counts.learning, total: list.length,
      worst: counts.failed ? 'failed' : counts.check ? 'check' : counts.watch ? 'watch' : 'ok',
      problemsId: idx.problems, monitored: idx.monitored ? num((S[idx.monitored] || {}).state) : null,
    };
  };

  // ── Kachel ────────────────────────────────────────────────────────────────
  // Hinterlegt (aktiv) nur bei echten Problemen; „bald fällig“ steht dahinter, färbt aber nicht.
  P.active = function (s) { return !!(s && s.problems); };
  P.color = function (worst) { return worst === 'failed' || worst === 'check' ? COLOR[worst] : COLOR.ok; };
  P.tileState = function (s) {
    if (!s || !s.installed) return 'Nicht installiert';
    if (!s.total) return 'Keine Geräte';
    if (!s.problems) return 'Alles ok';
    return (s.problems === 1 ? '1 Problem' : s.problems + ' Probleme') + (s.soon ? ' · ' + s.soon + ' bald' : '');
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  // Ring + Titel kommen aus dem Popup-Rahmen (Kachelsymbol in Kachelfarbe). Darunter die Unterzeile
  // „N Probleme · M bald fällig · K ok“ und die Übersichtsleiste, links „Braucht Aufmerksamkeit“,
  // rechts „Bald fällig“, darunter „Alles ok“ eingeklappt und „In Pulse öffnen“.
  P.wide = function (hass, states) {
    var s = P.scan(hass, states);
    return s.problems > 0 && s.soon > 0;
  };
  P.popup = function (states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var s = P.scan(hass, states);
    var watch = [];
    s.list.forEach(function (d) {
      [d.statusId, d.problemId].forEach(function (id) { if (id) watch.push(id); });
      var bat = (P.index(hass).battery[d.device] || []);
      bat.forEach(function (id) { if (((states[id] || {}).attributes || {}).device_class === 'battery') watch.push(id); });
    });
    if (s.problemsId) watch.push(s.problemsId);
    var call = function (part) {
      return 'return window._casoraPulse ? window._casoraPulse.sec(' + JSON.stringify(part) + ', null, states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) } };
    if (s.problems) f.prob = { card: K.secCard(watch, call('prob'), states) };
    if (s.soon) f.soon = { card: K.secCard(watch, call('soon'), states) };
    f.more = { card: K.secCard(watch, call('more'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['prob'], right: ['soon', 'more'], moveLeft: ['soon'] });
  };

  var CHIP_MARK = '⁣';
  var rowOf = function (d, opts) {
    var tone = d.status === 'failed' ? 'bad' : d.status === 'check' ? 'warn' : d.status === 'watch' ? COLOR.watch : undefined;
    var sub = [d.text, d.area].filter(Boolean);
    if (d.snoozed) sub.push('Erinnerung pausiert');
    var silent = d.reason === 'silent' || d.reason === 'silent_new' || d.reason === 'unavailable' || d.reason === 'partner';
    var r = {
      entity: d.statusId, icon: P.icon(d), iconTone: tone,
      label: d.name + (d.critical && (d.status === 'failed' || d.status === 'check') ? CHIP_MARK : ''),
      sub: sub.join(' · '),
      value: silent && d.silentSince ? P.since(d.silentSince) : d.battery != null ? Math.round(d.battery) + ' %' : null,
      valueTone: d.status === 'failed' ? 'bad' : d.status === 'check' ? 'warn' : null,
    };
    // „Gewechselt“ (pulse.mark_replaced) für Batterie-Gründe – mit Rückfrage („Bestätigen“-Schieber).
    if (opts && opts.replace && BATTERY[d.reason]) {
      r.action = 'Gewechselt';
      r.svc = { domain: 'pulse', service: 'mark_replaced', data: { device_id: d.device }, done: 'Batteriewechsel gemeldet' };
      r.confirm = 'Batterie gewechselt';
    }
    return r;
  };
  // „Wichtig“-Marke hinter dem Namen kritischer Geräte (Rauch, Wasser).
  var chips = function (html) {
    return html.split(CHIP_MARK).join('<span style="display:inline-block;vertical-align:2px;margin-left:8px;padding:2px 8px;'
      + 'border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;'
      + 'background:' + COLOR.failed + ';">Wichtig</span>');
  };
  // Übersichtsleiste: Anteile ausgefallen / prüfen / bald fällig / ok, darunter die Legende.
  P.bar = function (s) {
    var parts = [
      ['failed', s.counts.failed, s.counts.failed + ' ausgefallen'],
      ['check', s.counts.check, s.counts.check + ' prüfen'],
      ['watch', s.counts.watch, s.counts.watch + ' bald fällig'],
      ['ok', s.counts.ok + s.counts.learning, (s.counts.ok + s.counts.learning) + ' ok'],
    ].filter(function (p) { return p[1] > 0; });
    if (!parts.length) return '';
    return '<div class="pls-bar" style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:3px;margin:14px 6px 0;">'
      + parts.map(function (p) { return '<span style="flex:' + p[1] + ' 1 0;min-width:6px;background:' + COLOR[p[0]] + ';"></span>'; }).join('')
      + '</div><div class="pls-leg" style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;margin:10px 6px 0;'
      + 'font-size:13px;font-weight:500;color:var(--casora-soft-sub, var(--secondary-text-color));">'
      + parts.map(function (p) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;"><i style="width:9px;height:9px;border-radius:50%;background:'
          + COLOR[p[0]] + ';"></i><span>' + esc(p[2]) + '</span></span>';
      }).join('') + '</div>';
  };
  P.subline = function (s) {
    var main = !s.total ? 'Keine Geräte' : s.problems ? (s.problems === 1 ? '1 Problem' : s.problems + ' Probleme') : 'Keine Probleme';
    var rest = [];
    if (s.soon) rest.push(s.soon + ' bald fällig');
    if (s.total) rest.push(s.ok + ' ok');
    return { main: main, rest: rest, tone: s.counts.failed ? 'bad' : s.problems ? 'warn' : null };
  };
  P.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var s = P.scan(hass, states);
    if (part === 'hero') {
      if (!s.installed) return UI.line('Pulse ist nicht installiert', []);
      var h = P.subline(s);
      return UI.line(h.main, h.rest, { tone: h.tone }) + P.bar(s);
    }
    if (part === 'prob') {
      var pr = s.list.filter(function (d) { return d.status === 'failed' || d.status === 'check'; });
      return pr.length ? chips(UI.group(pr.map(function (d) { return rowOf(d, { replace: true }); }), 'Braucht Aufmerksamkeit')) : '';
    }
    if (part === 'soon') {
      var so = s.list.filter(function (d) { return d.status === 'watch'; });
      return so.length ? UI.group(so.map(function (d) { return rowOf(d, { replace: true }); }), 'Bald fällig') : '';
    }
    if (part === 'more') {
      var ok = s.list.filter(function (d) { return d.status === 'ok' || d.status === 'learning'; });
      var out = ok.length ? UI.more('pulse-ok', UI.group(ok.map(function (d) { return rowOf(d); }), null), { label: 'Alles ok', count: ok.length }) : '';
      // Fuß: ins Pulse-Panel (Rhythmusleisten, Wechsel-Verlauf, Einstellungen bleiben dort).
      var foot = UI.group([{ icon: 'mdi:open-in-new', label: 'In Pulse öffnen', tappable: true }], null)
        .replace('<div class="hui-row', '<div data-casora-link="' + P.PANEL + '" class="hui-row');
      return out + (out ? '<div style="height:12px"></div>' : '') + foot;
    }
    return '';
  };
})();
