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

  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
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
  // Timestamp → „seit 12 Min.“, „seit 9 Std.“, „seit 1 Tag“, „seit 2 Tagen“ (days written out: it sits in the
  // row's subline now, not as a short value on the right).
  P.since = function (ts, now) {
    var t = Date.parse(ts);
    if (isNaN(t)) return null;
    var m = Math.max(1, Math.round(((now || Date.now()) - t) / 60000));
    if (m < 60) return 'seit ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    var days = Math.max(1, Math.floor(m / 1440));
    return 'seit ' + days + (days === 1 ? ' Tag' : ' Tagen');
  };
  // Short reason per reason_key; the status tells silent (check) from failed. since (optional, P.since)
  // goes into the sentence: „Antwortet seit 2 Tagen nicht“, „Still seit 9 Std.“.
  P.reason = function (d, since) {
    var k = d.reason, ev = P.every(d.typical);
    switch (k) {
      case 'silent': return (d.status === 'failed' ? 'Antwortet ' + (since ? since + ' ' : '') + 'nicht' : 'Still' + (since ? ' ' + since : ''))
        + (ev ? ' · sonst ' + ev : '');
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
  // Ring + title come from the popup frame (tile icon in tile colour). Below: the short subline
  // „N Probleme · K ok“ and the thin overview bar, then „Ausgefallen“, „Prüfen“, „Beobachten“ stacked,
  // each with its count as a pill and its entries in two columns (one on narrow popups, a single entry
  // over the full width), „Alles ok“ collapsed and the text link „In Pulse öffnen“ at the bottom.
  // Sections follow Pulse's status, so they count the same as the bar.
  var SECTIONS = [['failed', 'Ausgefallen'], ['check', 'Prüfen'], ['watch', 'Beobachten']];
  var inSec = function (s, st) { return s.list.filter(function (d) { return d.status === st; }); };
  // Wide popup only when some section has two entries to put side by side.
  P.wide = function (hass, states) {
    var s = P.scan(hass, states);
    return SECTIONS.some(function (x) { return inSec(s, x[0]).length > 1; });
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
    // Sections by content: only those with entries (an only-battery „prüfen“ still gets its row, checkup 10/2026).
    SECTIONS.forEach(function (x) { if (inSec(s, x[0]).length) f[x[0]] = { card: K.secCard(watch, call(x[0]), states) }; });
    f.more = { card: K.secCard(watch, call('more'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['failed', 'check', 'watch', 'more'], right: [] });
  };

  // Markers around the name of critical devices: replaced by a span for the name (ellipsis) and the
  // „Wichtig“ tag behind it, which then stays visible however long the name is.
  var NAME_ON = '⁢', NAME_OFF = '⁣';
  var SILENT = { silent: 1, silent_new: 1, unavailable: 1, partner: 1, radio_only: 1 };
  var rowOf = function (d, opts) {
    var tone = d.status === 'failed' ? 'bad' : d.status === 'check' ? 'warn' : d.status === 'watch' ? COLOR.watch : undefined;
    var silent = !!SILENT[d.reason];
    // How long it has been silent goes into the sentence („Antwortet seit 2 Tagen nicht“), right only ›.
    var since = silent && d.silentSince ? P.since(d.silentSince) : null;
    var sub = [P.reason(d, since)];
    if (since && d.reason !== 'silent') sub.push(since);
    if (d.area) sub.push(d.area);
    if (d.snoozed) sub.push('Erinnerung pausiert');
    var tag = d.critical && (d.status === 'failed' || d.status === 'check');
    var r = {
      entity: d.statusId, icon: P.icon(d), iconTone: tone,
      label: tag ? NAME_ON + d.name + NAME_OFF : d.name,
      sub: sub.join(' · '),
      // Battery level as a small badge on the icon (not for silent devices: their value is stale).
      pct: !(silent && d.silentSince) && d.battery != null ? Math.round(d.battery) + ' %' : null,
    };
    // „Batterie gewechselt“ (pulse.mark_replaced) for battery reasons: round ✓ button, with confirmation.
    if (opts && opts.replace && BATTERY[d.reason]) {
      r.action = 'Batterie gewechselt';
      r.actionIcon = 'mdi:check';
      r.svc = { domain: 'pulse', service: 'mark_replaced', data: { device_id: d.device }, done: 'Batteriewechsel gemeldet' };
      r.confirm = 'Batterie gewechselt';
    }
    return r;
  };

  // Text 1 of the popup (as the core's T.ink: without a Casora theme the popup is dark, so white).
  var INK = 'var(--casora-popup-tiles-text-primary, #fff)';
  var ROW_CSS = '<style>'
    // Count pill beside a section heading: centred on the heading's line box (= cap height in Inter).
    + '.pls-h{display:flex;align-items:center;gap:8px;}'
    + '.pls-ht{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25;}'
    + '.pls-n{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;'
    +   'min-width:20px;height:20px;padding:0 6px;border-radius:999px;font-size:12px;font-weight:700;line-height:1;'
    +   'font-variant-numeric:tabular-nums;letter-spacing:0;color:var(--casora-soft-glyph, #fff);}'
    // Entries of a section side by side once there is room (popup wide), a single one over the full width.
    + '.pls-grid{container-type:inline-size;}'
    + '@container (min-width: 560px){.pls-grid .hui-plate{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));}'
    +   '.pls-grid .hui-plate>.hui-srow:only-child{grid-column:1/-1;}}'
    // Battery badge: bottom right on the icon, 6 px outside it, clear of the glyph.
    + '.pls-ic{position:relative;flex:none;display:flex;line-height:0;}'
    + '.pls-pct{position:absolute;right:-6px;bottom:-6px;box-sizing:border-box;height:14px;padding:0 4px;border-radius:999px;'
    +   'border:1px solid var(--casora-soft-row-fill, transparent);font-size:10px;font-weight:800;line-height:12px;letter-spacing:0;'
    +   'font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;color:' + INK + ';'
    +   'background:linear-gradient(var(--casora-soft-surface, transparent), var(--casora-soft-surface, transparent)), var(--primary-background-color, #fff);}'
    + '.pls-std .pls-pct{bottom:-9px;border-color:transparent;background:rgb(28,28,30);}'
    // „Wichtig“ beside the name; the name takes the ellipsis.
    + '.hui-inner div:has(>.pls-nm){display:flex;align-items:center;gap:6px;}'
    + '.pls-nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.pls-tag{flex:none;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:800;line-height:12px;letter-spacing:.06em;'
    +   'text-transform:uppercase;color:var(--casora-soft-glyph, #fff);background:' + COLOR.failed + ';}'
    // „Batterie gewechselt“ as a round ✓ button on every screen (the core shows text on wide screens).
    + '.pls-sec .hui-actx{padding:2px!important;margin:-2px 0!important;gap:0!important;flex:none;color:' + INK + '!important;}'
    + '.pls-sec .hui-actx .hui-at{display:none!important;}'
    + '.pls-sec .hui-actx .hui-ab{display:grid!important;place-items:center;width:36px;height:36px;border-radius:50%;flex:none;'
    +   'transition:transform var(--casora-dur-feedback, 160ms) ease, background-color var(--casora-dur-feedback, 160ms) ease;}'
    + '.pls-sec .hui-actx .hui-ab ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
    + '.pls-sec .hui-actx:active .hui-ab{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){.pls-sec .hui-actx:hover .hui-ab{background:var(--casora-soft-row-press, rgba(140,115,90,0.16))!important;}}'
    + '</style>';

  // Rows through the core group (taps, confirm, live), then badge, name/tag and tooltip worked in.
  var plateHtml = function (UI, list, opts) {
    var rs = list.map(function (d) { return rowOf(d, opts); });
    var html = UI.group(rs, null);
    var INNER = '<div class="hui-inner">', at = 0;
    if (typeof UI.icon === 'function') {
      rs.forEach(function (r) {
        var iconHtml = UI.icon(r.icon, r.iconTone), leadHtml = INNER + iconHtml;
        var i = html.indexOf(leadHtml, at);
        if (i < 0) return;
        // Rows in order, so a row never picks up the badge of an earlier one with the same icon.
        var repHtml = r.pct ? INNER + '<div class="pls-ic">' + iconHtml + '<span class="pls-pct">' + esc(r.pct) + '</span></div>' : leadHtml;
        html = html.slice(0, i) + repHtml + html.slice(i + leadHtml.length);
        at = i + repHtml.length;
      });
    }
    return html.split(NAME_ON).join('<span class="pls-nm">')
      .split(NAME_OFF).join('</span><span class="pls-tag">Wichtig</span>')
      .replace(/ aria-label="([^"]*)"/g, ' aria-label="$1" title="$1"');
  };
  var soft = function () { return !!(window._casoraSoft && window._casoraSoft()); };
  var section = function (UI, st, label, list) {
    var T = UI.tokens || {}, sf = soft();
    var headHtml = '<div class="hui-slbl pls-h" style="font-family:' + (T.font || 'inherit') + ';'
      + (sf ? 'margin:0 6px 10px;">' : 'padding:0 4px 8px;">')
      + '<div class="pls-ht" style="font-size:var(--casora-h15-fs,' + (sf ? '17px' : '15px') + ');font-weight:var(--casora-h15-fw,' + (sf ? '700' : '600') + ');'
      + 'letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + INK + ');">'
      + esc(label) + '</div><span class="pls-n" style="background:' + COLOR[st] + ';">' + list.length + '</span></div>';
    return ROW_CSS + '<div class="pls-sec' + (sf ? ' pls-grid' : ' pls-std') + '">' + headHtml + plateHtml(UI, list, { replace: true }) + '</div>';
  };
  // Overview bar: thin segments failed / check / due soon / ok; the counts stand at the sections.
  P.bar = function (s) {
    var parts = [
      ['failed', s.counts.failed, s.counts.failed + ' ausgefallen'],
      ['check', s.counts.check, s.counts.check + ' prüfen'],
      ['watch', s.counts.watch, s.counts.watch + ' beobachten'],
      ['ok', s.counts.ok + s.counts.learning, (s.counts.ok + s.counts.learning) + ' ok'],
    ].filter(function (p) { return p[1] > 0; });
    if (!parts.length) return '';
    var said = parts.map(function (p) { return p[2]; }).join(' · ');
    if (typeof window.casoraTr === 'function') said = window.casoraTr(said);
    return '<div class="pls-bar" role="img" aria-label="' + esc(said) + '" style="display:flex;gap:3px;height:6px;margin:14px 6px 0;">'
      + parts.map(function (p) { return '<span style="flex:' + p[1] + ' 1 0;min-width:6px;border-radius:3px;background:' + COLOR[p[0]] + ';"></span>'; }).join('')
      + '</div>';
  };
  // Short, one line on a phone: the watch count stands at „Beobachten“.
  P.subline = function (s) {
    var main = !s.total ? 'Keine Geräte' : s.problems ? (s.problems === 1 ? '1 Problem' : s.problems + ' Probleme') : 'Keine Probleme';
    return { main: main, rest: s.total ? [s.ok + ' ok'] : [], tone: s.counts.failed ? 'bad' : s.problems ? 'warn' : null };
  };
  var MORE_CSS = '<style>'
    // „Alles ok“: green check in front, count centred, › while closed (opens in place).
    + '.pls-ok .hui-mhd{min-height:52px;padding:8px 14px 8px 12px;gap:12px;}'
    + '.pls-ok .hui-mlb{color:' + INK + ';}'
    + '.pls-ok .hui-mct{line-height:1;}'
    + '.pls-ok .hui-more:not(.open)>.hui-mhd .hui-mch{transform:rotate(-90deg);}'
    + '.pls-okic{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;pointer-events:none;'
    +   'background:' + COLOR.ok + ';color:var(--casora-soft-glyph, #fff);}'
    + '.pls-okic ha-icon{--mdc-icon-size:18px;width:18px;height:18px;display:flex;}'
    + '</style>';
  P.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var s = P.scan(hass, states);
    if (part === 'hero') {
      if (!s.installed) return UI.line('Pulse ist nicht installiert', []);
      var h = P.subline(s);
      return UI.line(h.main, h.rest, { tone: h.tone }) + P.bar(s);
    }
    for (var i = 0; i < SECTIONS.length; i++) {
      if (part !== SECTIONS[i][0]) continue;
      var list = inSec(s, part);
      return list.length ? section(UI, part, SECTIONS[i][1], list) : '';
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
      // column-span: the wide „Mehr“ (02-devices, MORE_WIDE_CSS) splits its own content into two columns –
      // without spanning, this two-column grid sat entirely in its left half and fell to one column (11.10.2026).
      var okHtml = '<div class="' + (soft() ? '' : 'pls-std') + '" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:start;column-span:all;-webkit-column-span:all;">'
        + cols.map(function (c) { return '<div style="min-width:0;">' + plateHtml(UI, c) + '</div>'; }).join('')
        + '</div>';
      var moreHtml = ok.length ? UI.more('pulse-ok', okHtml, { label: 'Alles ok', count: ok.length }) : '';
      moreHtml = moreHtml.replace('<span class="hui-mlb">', '<span class="pls-okic" aria-hidden="true"><ha-icon icon="mdi:check"></ha-icon></span><span class="hui-mlb">');
      // Footer: into the Pulse panel (rhythm bars, replacement history, settings stay there).
      /* Blueprint v2 (rules 6, 10): the way into the Pulse panel is a ↗ row (was a text link); not installed: the empty row. */
      var foot = '<div style="height:8px"></div>' + (!s.installed
        ? UI.empty({ icon: 'mdi:heart-pulse', text: 'Pulse einrichten', sub: 'Im Pulse-Panel', out: P.PANEL })
        : UI.group([{ icon: 'mdi:heart-pulse', iconTone: 'rgba(0,0,0,0)', label: 'In Pulse öffnen', sub: 'Verläufe, Ersatz, Einstellungen', out: true, url: P.PANEL }], null));
      return ROW_CSS + MORE_CSS + (moreHtml ? '<div class="pls-ok">' + moreHtml + '</div>' : '') + foot;
    }
    return '';
  };
})();
