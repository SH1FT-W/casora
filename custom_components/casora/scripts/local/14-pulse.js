// ── Pulse: tile + popup (Casora 1.2.x) ───────────────────────────────────────
// For the "Pulse" integration (battery/radio watchdog). Built from entities only, no WebSocket subscription.
// Detection: hass.entities with platform 'pulse'; which entity is which comes from the translation_key
// (status, problem, last_report per device; problems, monitored overall) – never the entity ID, which depends
// on language and device names. Battery % from the battery sensor of the same device (device_id).
// Reasons (reason_key) become our own short sentences; Pulse's finished sentence (reason) is in the server
// language and contains running times.
//   window._casoraPulse.installed(hass)        → Pulse entities present?
//   window._casoraPulse.scan(hass, states)     → {list, problems, soon, ok, total, worst, counts, …}
//   window._casoraPulse.tileState(s) / .active(s) / .color(worst)  – tile casora_pulse
//   window._casoraPulse.popup(states, hass, variables)             – popup casora_popup_pulse
//   window._casoraPulse.sec(part, C, states, hass)                 – live sections of the popup
(function () {
  if (window._casoraPulse) return;
  var P = window._casoraPulse = {};

  // Severity as in Pulse (const.py SEVERITY), for sorting.
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

  // ── Finding entities ──────────────────────────────────────────────────────
  // Once per registry state (hass.entities only swaps the object on registry changes).
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
    // Battery sensor per monitored device (not from Pulse; device_class battery is only in the state –
    // so only collect candidates here, scan() does the check).
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

  // ── Texts ─────────────────────────────────────────────────────────────────
  // Typical interval (seconds) → „alle 4 Std.“, „jede Stunde“, „einmal am Tag“.
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
  // Timestamp → „seit 12 Min.“, „seit 9 Std.“, „seit 2 T.“
  P.since = function (ts, now) {
    var t = Date.parse(ts);
    if (isNaN(t)) return null;
    var m = Math.max(1, Math.round(((now || Date.now()) - t) / 60000));
    if (m < 60) return 'seit ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    return 'seit ' + Math.max(1, Math.floor(m / 1440)) + ' T.';
  };
  // Short reason per reason_key; the status tells silent (check) from failed.
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
      case 'radio_only': return 'Funkt, schickt aber keine Werte';
      case 'battery_missing': return 'Batteriewert fehlt';
      case 'cloud_outage': return 'Cloud antwortet nicht';
      case 'startup_waiting': return 'Seit dem Neustart noch keine Meldung';
      case 'learning': return 'Lernt noch den Rhythmus';
      case 'ok_reachable':
      case 'silent_reachable': return 'Erreichbar, gerade nichts zu melden';
      case 'ok':
      case 'ok_rhythm': return 'Meldet sich wie gewohnt' + (ev ? ' · ' + ev : '');
      default:
        // Unknown reason (newer Pulse): only the status, never a battery claim
        return { failed: 'Ausgefallen', check: 'Bitte prüfen', watch: 'Beobachten', learning: 'Lernt noch den Rhythmus' }[d.status]
          || 'Meldet sich wie gewohnt';
    }
  };
  P.icon = function (d) {
    var k = d.reason;
    if (k === 'battery_low' || k === 'battery_low_flag') return 'mdi:battery-alert-variant-outline';
    if (k === 'battery_soon') return 'mdi:battery-low';
    if (k === 'waiting_first' || k === 'startup_waiting') return 'mdi:timer-sand';
    if (k === 'battery_missing') return 'mdi:battery-unknown';
    if (k === 'cloud_outage') return 'mdi:cloud-off-outline';
    if (k === 'silent' || k === 'silent_new' || k === 'partner' || k === 'unavailable' || k === 'radio_only') return 'mdi:access-point-off';
    return d.status === 'learning' ? 'mdi:school-outline' : 'mdi:pulse';
  };

  // ── Evaluation ────────────────────────────────────────────────────────────
  // → { installed, list (sorted: worst first, critical devices first, longest silence first),
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

  // ── Bell (notification centre) ────────────────────────────────────────────
  // Real problems only (check/failed) – „bald fällig“ needs no action yet and stays in the tile and
  // popup, just as the battery source only reports from „schwach“ on. Not for paused reminders
  // (snoozed) or exceptions (ex: entity → true, „Nicht melden“). Up to BELL_SINGLE devices one row each,
  // above that a summary row (otherwise e.g. a radio outage floods the bell).
  // Time: start of the silence (silent_since, kept by Pulse across restarts), otherwise last_changed
  // of the status; plus `seen` per device + status + reason – after an HA restart read stays
  // read (settleSeen in casora-core.js), a new reason is new.
  // → { rows, devices } – devices: devices (device_id → true) whose problem Pulse reports or that are
  // deliberately paused; the bell's battery source skips their battery sensors (no double report).
  var BELL_SINGLE = 3;
  var BELL_OPENS = ['casora_pulse', 'casora_popup_pulse'];
  P.bellPhrase = function (d) {
    switch (d.reason) {
      case 'silent': case 'partner': return d.status === 'failed' ? 'antwortet nicht' : 'ist still';
      case 'silent_new': return 'hat sich noch nicht gemeldet';
      case 'unavailable': return 'ist nicht erreichbar';
      case 'battery_low': return 'braucht eine neue Batterie';
      case 'battery_low_flag': return 'meldet schwache Batterie';
      case 'battery_soon': return 'braucht bald eine neue Batterie';
      case 'waiting_first': return 'wartet auf die erste Meldung';
      case 'radio_only': return 'funkt, schickt aber keine Werte';
      case 'battery_missing': return 'meldet keinen Batteriewert';
      default: return d.status === 'failed' ? 'ist ausgefallen' : 'sollte geprüft werden';
    }
  };
  P.bell = function (hass, states, ex, now) {
    var S = states || (hass && hass.states) || {};
    var s = P.scan(hass, S, now);
    var out = { rows: [], devices: {} };
    var shown = [];
    s.list.forEach(function (d) {
      if (d.status !== 'failed' && d.status !== 'check') return;
      if (ex && ex[d.statusId]) return;
      out.devices[d.device] = true;
      if (!d.snoozed) shown.push(d);
    });
    if (!shown.length) return out;
    var at = function (d) {
      var t = d.silentSince ? Date.parse(d.silentSince) : NaN;
      if (isNaN(t)) t = Date.parse((S[d.statusId] || {}).last_changed || '');
      return isNaN(t) ? (now || Date.now()) : Math.min(t, now || Date.now());
    };
    var key = function (d) { return { k: d.device + '|' + d.status + '|' + (d.reason || ''), t: at(d) }; };
    var tone = function (list) { return list.some(function (d) { return d.status === 'failed'; }) ? 'bad' : 'warn'; };
    // Failed important devices (smoke, water) on top like security notices.
    var rank = function (list) { return list.some(function (d) { return d.status === 'failed' && d.critical; }) ? 1 : 0; };
    var target = s.problemsId || null;
    if (shown.length <= BELL_SINGLE) {
      shown.forEach(function (d) {
        out.rows.push({
          id: 'casora:pulse:' + d.device,
          when: at(d),
          label: d.name + ' ' + P.bellPhrase(d),
          sub: d.area || null,
          value: BATTERY[d.reason] && d.battery != null ? Math.round(d.battery) + ' %' : null,
          icon: BATTERY[d.reason] ? 'battery' : 'pulse',
          tone: tone([d]),
          // Tap opens the Pulse popup via the Pulse tile (its entity is „Probleme“).
          entity: target || d.statusId,
          opens: BELL_OPENS,
          rank: rank([d]),
          seen: [key(d)],
        });
      });
      return out;
    }
    var names = shown.slice(0, 3).map(function (d) { return d.name; });
    out.rows.push({
      id: 'casora:pulse',
      when: Math.max.apply(null, shown.map(at)),
      label: shown.length + ' Geräte brauchen Aufmerksamkeit',
      sub: names.join(', ') + (shown.length > 3 ? ' …' : ''),
      icon: 'pulse',
      tone: tone(shown),
      entity: target || shown[0].statusId,
      opens: BELL_OPENS,
      rank: rank(shown),
      seen: shown.map(key),
    });
    return out;
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  // Highlighted (active) as soon as something needs attention: a problem (check/failed) or due soon
  // (1.4, before only problems). „Lernt noch“ and ok stay calm. Colour = worst state.
  P.active = function (s) { return !!(s && (s.problems || s.soon)); };
  P.color = function (worst) { return COLOR[worst] && worst !== 'learning' ? COLOR[worst] : COLOR.ok; };
  P.tileState = function (s) {
    if (!s || !s.installed) return 'Nicht installiert';
    if (!s.total) return 'Keine Geräte';
    // „Bald fällig“ split into battery and the rest (13.10.: „3 bald fällig“ was 1 battery + 2 watch).
    var bat = (s.list || []).filter(function (d) { return d.status === 'watch' && BATTERY[d.reason]; }).length;
    var rest = (s.soon || 0) - bat;
    var soon = [];
    if (bat) soon.push(bat === 1 ? '1 Batterie bald fällig' : bat + ' Batterien bald fällig');
    if (rest > 0) soon.push(rest + ' beobachten');
    // No problem, but due soon (e.g. battery 18 %): not „Alles ok“.
    if (!s.problems) return soon.length ? soon.join(' · ') : 'Alles ok';
    return [s.problems === 1 ? '1 Problem' : s.problems + ' Probleme'].concat(soon).join(' · ');
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  // Ring + title come from the popup frame (tile icon in tile colour). Below: the subline
  // „N Probleme · M beobachten · K ok“ and the overview bar, left „Ausgefallen“/„Prüfen“,
  // right „Batterie“/„Beobachten“, below that „Alles ok“ collapsed and „In Pulse öffnen“.
  P.wide = function (hass, states) {
    var s = P.scan(hass, states);
    var left = s.list.some(function (d) { return d.status === 'failed' || (d.status === 'check' && !BATTERY[d.reason]); });
    var right = s.list.some(function (d) { return d.status === 'watch' || (d.status === 'check' && BATTERY[d.reason]); });
    return left && right;
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
    // Sections by content, not by counters: „prüfen“ because of the battery counts as a problem,
    // but sits under „Batterie“ (right) – with only one such device the row was missing (checkup 10/2026).
    var batt = function (d) { return !!BATTERY[d.reason]; };
    if (s.list.some(function (d) { return d.status === 'failed' || (d.status === 'check' && !batt(d)); })) f.prob = { card: K.secCard(watch, call('prob'), states) };
    if (s.list.some(function (d) { return d.status === 'watch' || (d.status === 'check' && batt(d)); })) f.soon = { card: K.secCard(watch, call('soon'), states) };
    f.more = { card: K.secCard(watch, call('more'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['prob'], right: ['soon', 'more'], moveLeft: ['soon'] });
  };

  var CHIP_MARK = '⁣';
  var rowOf = function (d, opts) {
    var tone = d.status === 'failed' ? 'bad' : d.status === 'check' ? 'warn' : d.status === 'watch' ? COLOR.watch : undefined;
    var sub = [d.text, d.area].filter(Boolean);
    if (d.snoozed) sub.push('Erinnerung pausiert');
    var silent = d.reason === 'silent' || d.reason === 'silent_new' || d.reason === 'unavailable' || d.reason === 'partner' || d.reason === 'radio_only';
    var r = {
      entity: d.statusId, icon: P.icon(d), iconTone: tone,
      label: d.name,
      // Badge at the start of the subline – behind the name the ellipsis („…“) cut it off.
      sub: (d.critical && (d.status === 'failed' || d.status === 'check') ? CHIP_MARK : '') + sub.join(' · '),
      value: silent && d.silentSince ? P.since(d.silentSince) : d.battery != null ? Math.round(d.battery) + ' %' : null,
      valueTone: d.status === 'failed' ? 'bad' : d.status === 'check' ? 'warn' : null,
    };
    // „Gewechselt“ (pulse.mark_replaced) for battery reasons – with confirmation („Bestätigen“ slider).
    if (opts && opts.replace && BATTERY[d.reason]) {
      r.action = 'Gewechselt';
      r.svc = { domain: 'pulse', service: 'mark_replaced', data: { device_id: d.device }, done: 'Batteriewechsel gemeldet' };
      r.confirm = 'Batterie gewechselt';
    }
    return r;
  };
  // „Wichtig“ badge before the reason of critical devices (smoke, water).
  var chips = function (html) {
    return html.split(CHIP_MARK).join('<span style="display:inline-block;vertical-align:1px;margin-right:6px;padding:1px 7px;'
      + 'border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;'
      + 'background:' + COLOR.failed + ';">Wichtig</span>');
  };
  // Overview bar: shares failed / check / due soon / ok, legend below.
  P.bar = function (s) {
    var parts = [
      ['failed', s.counts.failed, s.counts.failed + ' ausgefallen'],
      ['check', s.counts.check, s.counts.check + ' prüfen'],
      ['watch', s.counts.watch, s.counts.watch + ' beobachten'],
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
    if (s.soon) rest.push(s.soon + ' beobachten');
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
    // Sections as in the Pulse panel: left Failed + Check, right Battery + Watch.
    // Battery reasons go under „Batterie“, whether Pulse lists them as check or watch.
    var sect = function (rows, label) {
      return rows.length ? chips(UI.group(rows.map(function (d) { return rowOf(d, { replace: true }); }), label)) : '';
    };
    var join = function (a, b) { return a && b ? a + '<div style="height:12px"></div>' + b : a || b; };
    var bat = function (d) { return !!BATTERY[d.reason]; };
    if (part === 'prob') {
      return join(sect(s.list.filter(function (d) { return d.status === 'failed'; }), 'Ausgefallen'),
        sect(s.list.filter(function (d) { return d.status === 'check' && !bat(d); }), 'Prüfen'));
    }
    if (part === 'soon') {
      return join(sect(s.list.filter(function (d) { return (d.status === 'check' || d.status === 'watch') && bat(d); }), 'Batterie'),
        sect(s.list.filter(function (d) { return d.status === 'watch' && !bat(d); }), 'Beobachten'));
    }
    if (part === 'more') {
      var ok = s.list.filter(function (d) { return d.status === 'ok' || d.status === 'learning'; });
      // Lowest battery first; without a battery value at the end, then by name.
      ok.sort(function (p, q) {
        return (p.battery == null ? 101 : p.battery) - (q.battery == null ? 101 : q.battery)
          || String(p.name).localeCompare(String(q.name));
      });
      // Wide (desktop/tablet) two columns side by side, narrow one (auto-fit, from 2 × 300 px).
      // Alternate the distribution so the weakest are on top in both columns (read row by row).
      var cols = ok.length > 1 ? [ok.filter(function (d, i) { return i % 2 === 0; }), ok.filter(function (d, i) { return i % 2 === 1; })] : [ok];
      // column-span: the wide „Mehr“ (02-geraete, MORE_WIDE_CSS) splits its own content into two columns –
      // without spanning, this two-column grid sat entirely in its left half and fell to one column (11.10.2026).
      var okHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:start;column-span:all;-webkit-column-span:all;">'
        + cols.map(function (c) { return '<div style="min-width:0;">' + UI.group(c.map(function (d) { return rowOf(d); }), null) + '</div>'; }).join('')
        + '</div>';
      var out = ok.length ? UI.more('pulse-ok', okHtml, { label: 'Alles ok', count: ok.length }) : '';
      // Footer: into the Pulse panel (rhythm bars, replacement history, settings stay there).
      var foot = UI.group([{ icon: 'mdi:pulse', label: 'In Pulse öffnen', tappable: true }], null)
        .replace('<div class="hui-row', '<div data-casora-link="' + P.PANEL + '" class="hui-row');
      return out + (out ? '<div style="height:12px"></div>' : '') + foot;
    }
    return '';
  };
})();
