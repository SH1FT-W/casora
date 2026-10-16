// ── Mähroboter: Kachel + Popup (Community-Karte, Casora 1.5) ──────────────────
// Für jede lawn_mower-Entität. Die Grundbedienung (Mähen, Pause, Zur Station) kommt aus HAs eigenen
// Diensten (lawn_mower.*, je nach supported_features). Was eine Integration mehr liefert, liest das Modul
// aus den Attributen der Mäher-Entität (Gardena: activity, state, last_error_code, battery_level,
// rf_link_level, operating_hours) und aus Entitäten am selben Gerät (Akku, Verbindung, „Parken bis auf
// Weiteres“). Gesucht wird über Geräteklasse und Schlüssel, nie über den Gerätenamen.
//   window._casoraMower.find(hass, id)                 → {mower, battery, online, hours, rf, park, start, error}
//   window._casoraMower.status(c, states)              → {key, label, level, run, dead, error, battery, …}
//   window._casoraMower.tileState / .active / .color   – Kachel casora_lawn_mower
//   window._casoraMower.popup(entity, states, hass)    – Popup casora_popup_lawn_mower
//   window._casoraMower.sec(part, C, states, hass, el) – Live-Bereiche des Popups (hero, info, hist)
//   window._casoraMower.sessions(rows, now)            – Mähfahrten aus dem Verlauf (7 Tage)
(function () {
  if (window._casoraMower) return;
  var M = window._casoraMower = {};

  var COLOR = {
    run: 'var(--casora-color-green, #6AAE78)',
    warn: 'var(--casora-color-orange, #DE8A4E)',
    bad: 'var(--casora-color-red, #D35A4E)',
  };
  M.COLOR = COLOR;
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var up = function (s) { return String(s == null ? '' : s).toUpperCase(); };

  // HA-Zustände (lawn_mower) und Gardena-Tätigkeiten (activity).
  var STATE = { mowing: 'Mäht', docked: 'In der Station', paused: 'Pausiert', returning: 'Fährt zur Station', error: 'Fehler' };
  var ACTIVITY = {
    OK_CUTTING: 'Mäht', OK_CUTTING_TIMER_OVERRIDDEN: 'Mäht außerhalb des Zeitplans', OK_SEARCHING: 'Fährt zur Station',
    OK_LEAVING: 'Verlässt die Station', OK_CHARGING: 'Lädt', PAUSED: 'Pausiert', OFF: 'Ausgeschaltet',
    PARKED_TIMER: 'Parkt bis zum nächsten Zeitplan', PARKED_PARK_SELECTED: 'Parkt bis auf Weiteres',
    PARKED_AUTOTIMER: 'Parkt, Rasen wächst langsam', PARKED_FROST: 'Parkt wegen Frost',
    PARKED_DAILY_LIMIT_REACHED: 'Parkt, Tagesziel erreicht',
  };
  var ERRORS = {
    OUTSIDE_WORKING_AREA: 'Außerhalb des Mähbereichs', NO_LOOP_SIGNAL: 'Kein Signal vom Begrenzungsdraht',
    WRONG_LOOP_SIGNAL: 'Falsches Signal vom Begrenzungsdraht', TRAPPED: 'Steckt fest', UPSIDE_DOWN: 'Umgekippt',
    EMPTY_BATTERY: 'Akku leer', LOW_BATTERY: 'Akku schwach', NO_DRIVE: 'Kann nicht fahren', LIFTED: 'Angehoben',
    TEMPORARILY_LIFTED: 'Kurz angehoben', MOWER_TILTED: 'Steht schief', SLIPPED: 'Rutscht',
    STUCK_IN_CHARGING_STATION: 'Hängt in der Station fest', CHARGING_STATION_BLOCKED: 'Station blockiert',
    CHARGING_SYSTEM_PROBLEM: 'Ladefehler', CHARGING_CURRENT_TOO_HIGH: 'Ladestrom zu hoch', BATTERY_PROBLEM: 'Akkufehler',
    WHEEL_MOTOR_BLOCKED_LEFT: 'Rad links blockiert', WHEEL_MOTOR_BLOCKED_RIGHT: 'Rad rechts blockiert',
    WHEEL_MOTOR_OVERLOADED_LEFT: 'Rad links überlastet', WHEEL_MOTOR_OVERLOADED_RIGHT: 'Rad rechts überlastet',
    WHEEL_DRIVE_PROBLEM_LEFT: 'Radantrieb links gestört', WHEEL_DRIVE_PROBLEM_RIGHT: 'Radantrieb rechts gestört',
    CUTTING_SYSTEM_BLOCKED: 'Mähwerk blockiert', CUTTING_MOTOR_PROBLEM: 'Mähmotor gestört', CUTTING_MOTOR_DRIVE_DEFECT: 'Mähmotor defekt',
    CUTTING_HEIGHT_BLOCKED: 'Schnitthöhe blockiert', CUTTING_HEIGHT_PROBLEM: 'Schnitthöhe gestört',
    COLLISION_SENSOR_PROBLEM_FRONT: 'Stoßsensor vorne gestört', COLLISION_SENSOR_PROBLEM_REAR: 'Stoßsensor hinten gestört',
    TILT_SENSOR_PROBLEM: 'Neigungssensor gestört', STOP_BUTTON_PROBLEM: 'Stopp-Taste gestört', ELECTRONIC_PROBLEM: 'Elektronik gestört',
    WRONG_PIN_CODE: 'Falsche PIN', OFF_DISABLED: 'Ausgeschaltet', OFF_HATCH_OPEN: 'Klappe offen', OFF_HATCH_CLOSED: 'Ausgeschaltet, Klappe zu',
    ALARM_MOWER_SWITCHED_OFF: 'Alarm: ausgeschaltet', ALARM_MOWER_STOPPED: 'Alarm: angehalten', ALARM_MOWER_LIFTED: 'Alarm: angehoben',
    ALARM_MOWER_TILTED: 'Alarm: gekippt', ALARM_MOWER_IN_MOTION: 'Alarm: bewegt', ALARM_OUTSIDE_GEOFENCE: 'Alarm: außerhalb des Bereichs',
    WAIT_UPDATING: 'Wird aktualisiert', WAIT_POWER_UP: 'Startet',
  };
  // Unbekannter Code: lesbar machen („WHEEL_SOMETHING“ → „Wheel something“), nie leer.
  M.errorText = function (code) {
    var k = up(code);
    if (!k || k === 'NO_MESSAGE' || k === 'NONE' || k === 'NULL') return null;
    if (ERRORS[k]) return ERRORS[k];
    var t = k.toLowerCase().replace(/_/g, ' ');
    return 'Fehler: ' + t.charAt(0).toUpperCase() + t.slice(1);
  };

  // ── Entitäten am selben Gerät ─────────────────────────────────────────────
  var has = function (x, re) { return re.test((x.key || '') + ' ' + x.entity_id); };
  M.find = function (hass, id) {
    var c = { mower: id, battery: null, online: null, hours: null, rf: null, park: null, start: null, error: null };
    var D = window.casoraDevice;
    var list = D && D.entities ? D.entities(hass, id) : [];
    var S = (hass && hass.states) || {};
    var unit = function (eid) { return ((S[eid] || {}).attributes || {}).unit_of_measurement; };
    list.forEach(function (x) {
      if (x.entity_id === id) return;
      if (x.domain === 'sensor' && x.dc === 'battery' && !c.battery) c.battery = x.entity_id;
      else if (x.domain === 'binary_sensor' && x.dc === 'connectivity' && !c.online) c.online = x.entity_id;
      else if (x.domain === 'sensor' && !c.hours && (has(x, /operating_hours|betriebsstunden/) || (x.dc === 'duration' && unit(x.entity_id) === 'h'))) c.hours = x.entity_id;
      else if (x.domain === 'sensor' && !c.rf && (x.dc === 'signal_strength' || has(x, /rf_link|link_quality|signal/))) c.rf = x.entity_id;
      else if (x.domain === 'button' && !c.park && has(x, /park_until|until_further_notice|park_permanent/)) c.park = x.entity_id;
      else if (x.domain === 'button' && !c.start && has(x, /start_mowing|mow_now|start_override/)) c.start = x.entity_id;
      else if (x.domain === 'sensor' && !c.error && has(x, /error|fehler/)) c.error = x.entity_id;
    });
    return c;
  };

  // ── Zustand ───────────────────────────────────────────────────────────────
  // level: 0 ruhig, 1 läuft (grün), 2 Hinweis (orange), 3 Fehler (rot).
  M.status = function (c, states) {
    var S = states || {};
    var st = S[c.mower];
    var s = { key: 'none', label: 'Nicht verfügbar', level: 0, dead: true, run: false, paused: false, docked: false,
      returning: false, charging: false, parkedManual: false, error: null, battery: null, rf: null, hours: null, online: null };
    if (!st) return s;
    var a = st.attributes || {};
    var hs = String(st.state || '').toLowerCase();
    var act = up(a.activity);
    s.battery = num(a.battery_level);
    if (s.battery == null && c.battery && S[c.battery]) s.battery = num(S[c.battery].state);
    s.rf = num(a.rf_link_level);
    if (s.rf == null && c.rf && S[c.rf]) s.rf = num(S[c.rf].state);
    s.hours = num(a.operating_hours);
    if (s.hours == null && c.hours && S[c.hours]) s.hours = num(S[c.hours].state);
    if (a.rf_link_state) s.online = up(a.rf_link_state) !== 'OFFLINE';
    else if (c.online && S[c.online] && !bad(S[c.online].state)) s.online = S[c.online].state === 'on';
    s.features = num(a.supported_features) || 0;
    if (bad(hs)) { s.label = hs === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar'; return s; }
    s.dead = false;
    s.key = act || hs;
    s.run = hs === 'mowing' || /^OK_(CUTTING|LEAVING)/.test(act);
    s.returning = hs === 'returning' || act === 'OK_SEARCHING';
    s.charging = act === 'OK_CHARGING';
    s.paused = hs === 'paused' || act === 'PAUSED';
    s.docked = !s.run && !s.returning && !s.paused && (hs === 'docked' || /^PARKED_|^OK_CHARGING$/.test(act));
    s.parkedManual = act === 'PARKED_PARK_SELECTED';
    s.label = ACTIVITY[act] || STATE[hs] || 'Bereit';
    var err = up(a.state) === 'ERROR' || hs === 'error';
    var code = M.errorText(a.last_error_code);
    if (err) { s.error = code || 'Fehler'; s.label = s.error; s.level = 3; return s; }
    if (s.online === false) { s.label = 'Keine Verbindung'; s.level = 2; return s; }
    if (up(a.state) === 'WARNING' && code) { s.error = code; s.label = code; s.level = 2; return s; }
    s.level = (s.run || s.returning) ? 1 : 0;
    return s;
  };
  M.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    return M.status(M.find(hass, id), states || (hass && hass.states) || {});
  };

  // ── Kachel ────────────────────────────────────────────────────────────────
  M.active = function (s) { return !!(s && s.level >= 1); };
  M.color = function (s) { return !s ? COLOR.run : s.level === 3 ? COLOR.bad : s.level === 2 ? COLOR.warn : COLOR.run; };
  // Nur der Zustand – den Akku zeigt unterwegs der Kreis oben rechts (show_progress), beim Laden „Lädt · 40 %“.
  M.tileState = function (s) {
    if (!s) return '';
    if (s.charging && s.battery != null && s.level < 2) return s.label + ' · ' + Math.round(s.battery) + ' %';
    return s.label;
  };
  // Icon antippen: unterwegs → zur Station, sonst mähen. Ohne passende Funktion nichts.
  M.iconService = function (s) {
    if (!s || s.dead) return 'none';
    if (s.run || s.returning) return s.features & 4 ? 'lawn_mower.dock' : 'none';
    return s.features & 1 ? 'lawn_mower.start_mowing' : 'none';
  };

  // Kopf-Kachel des Popups in der Farbe des Zustands (DP-15); in der Station ruhig.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_lawn_mower\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = M.of(src._stateObj, ha && ha.hass);
    return s.level ? { hue: M.color(s), off: false } : { hue: COLOR.run, off: true };
  });

  // ── Verlauf (7 Tage) ──────────────────────────────────────────────────────
  // Mähfahrten aus HAs Verlauf: eine Fahrt beginnt mit „mowing“ und endet, sobald er wieder in der Station ist
  // (Pause und Rückfahrt gehören dazu). Fehler sind eigene Einträge. Einmal je Zustandswechsel abfragen, danach
  // die offenen Live-Bereiche neu zeichnen (wie das Personen-Popup, 15-person.js).
  var DAYS = 7;
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  M.dur = function (ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' Min.';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
  };
  // rows: [{state, t}] aufsteigend → [{kind: 'mow'|'error', start, end, mow (ms gemäht), error}] neueste zuerst.
  M.sessions = function (rows, now) {
    var out = [], cur = null, err = null;
    var close = function (t) { if (cur) { cur.end = t; out.push(cur); cur = null; } };
    rows.forEach(function (x, i) {
      var s = x.state, t = x.t, next = rows[i + 1], tEnd = next ? next.t : null;
      if (s !== 'error' && err) { err.end = t; out.push(err); err = null; }
      if (s === 'mowing') {
        if (!cur) cur = { kind: 'mow', start: t, end: null, mow: 0 };
        cur.mow += (tEnd || now) - t;
      } else if (s === 'paused' || s === 'returning') {
        /* gehört zur laufenden Fahrt */
      } else if (s === 'error') {
        close(t);
        if (!err) err = { kind: 'error', start: t, end: null };
      } else close(t);
    });
    if (err) out.push(err);
    if (cur) out.push(cur);
    return out.sort(function (a, b) { return b.start - a.start; });
  };
  var hist = {};
  M.history = function (hass, id, el) {
    var st = hass && hass.states && hass.states[id];
    if (!st) return null;
    var key = id + '|' + st.last_changed;
    var hit = hist[id];
    if (hit && hit.key === key) { if (el && hit.busy) hit.wait.push(el); return hit.list; }
    hist[id] = { key: key, list: hit ? hit.list : null, busy: true, wait: el ? [el] : [] };
    if (!hass.callApi) return hist[id].list;
    var now = Date.now(), start = dayStart(now) - (DAYS - 1) * 86400000;
    hass.callApi('GET', 'history/period/' + new Date(start).toISOString() + '?filter_entity_id=' + id
      + '&end_time=' + encodeURIComponent(new Date(now).toISOString()) + '&minimal_response&no_attributes')
      .then(function (r) {
        var rows = [];
        ((r && r[0]) || []).forEach(function (x) {
          var t = Date.parse(x.last_changed);
          if (bad(x.state) || !isFinite(t)) return;
          if (rows.length && rows[rows.length - 1].state === x.state) return;
          rows.push({ state: x.state, t: Math.max(t, start) });
        });
        var h = hist[id];
        if (!h || h.key !== key) return;
        h.list = M.sessions(rows, Date.now());
        h.busy = false;
        h.wait.forEach(function (w) {
          try {
            if (typeof window.casoraKick === 'function') window.casoraKick(w);
            else if (typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
          } catch (e) { /* Popup schon zu */ }
        });
        h.wait = [];
      }).catch(function () { if (hist[id] && hist[id].key === key) { hist[id].busy = false; hist[id].list = hist[id].list || []; } });
    return hist[id].list;
  };
  // Summe der Woche für die Überschrift: „6 Std. 10 Min. in 5 Fahrten“.
  M.total = function (list) {
    var mow = (list || []).filter(function (x) { return x.kind === 'mow'; });
    if (!mow.length) return null;
    var ms = mow.reduce(function (a, x) { return a + x.mow; }, 0);
    return M.dur(ms) + ' · ' + (mow.length === 1 ? '1 Fahrt' : mow.length + ' Fahrten');
  };
  // Zeitleiste wie im Personen-Popup: Uhrzeit | Punkt (grün gemäht, rot Fehler) mit Linie | Text.
  var histHtml = function (UI, list, id, now) {
    var font = 'var(--primary-font-family, system-ui)', ink = 'var(--casora-popup-tiles-text-primary, #3A322B)',
      sub = 'var(--casora-soft-sub, rgba(58,50,43,.6))', row = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))',
      ctl = 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', dim = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))';
    var note = function (t) { return '<div style="padding:14px 4px;font-size:14px;font-weight:500;color:' + sub + ';">' + esc(T(t)) + '</div>'; };
    var sum = list ? M.total(list) : null;
    var head = (UI.label ? UI.label('Verlauf') : '<div>Verlauf</div>').replace(/<\/div>$/, '<div style="font-size:12.5px;font-weight:600;color:' + sub + ';">'
      + esc(T('7 Tage')) + (sum ? ' · ' + sum.split(' · ').map(function (x) { return '<span>' + esc(T(x)) + '</span>'; }).join(' · ') : '') + '</div></div>');
    var body;
    if (!list) body = note('Wird geladen …');
    else if (!list.length) body = note('In den letzten 7 Tagen nicht gemäht');
    else {
      var items = list.slice(0, 8), today = dayStart(now);
      body = items.map(function (s, i) {
        var d = dayStart(s.start), prev = items[i - 1], first = d !== today && (!prev || dayStart(prev.start) !== d);
        var dd = Math.round((today - d) / 86400000);
        var day = first ? (dd === 1 ? T('Gestern') : new Date(s.start).toLocaleDateString(window.casoraLocale ? window.casoraLocale() : 'de-DE', { weekday: 'short' }).replace(/\.$/, '')) : '';
        var open = s.end == null, last = i === items.length - 1, isErr = s.kind === 'error';
        var title = isErr ? 'Fehler' : open ? 'Mäht gerade' : 'Gemäht';
        var info = isErr
          ? (open ? '<span>' + esc(T('besteht noch')) + '</span>' : '<span>' + esc(T('bis ' + hm(s.end))) + '</span>')
          : '<span>' + esc(T(M.dur(s.mow))) + '</span>' + (open ? '' : ' · <span>' + esc(T('bis ' + hm(s.end))) + '</span>');
        return '<div style="display:grid;grid-template-columns:minmax(46px,max-content) 22px minmax(0,1fr);align-items:start;column-gap:8px;position:relative;padding:9px 0;">'
          + '<div style="font-size:13px;font-weight:600;color:' + sub + ';font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap;">'
          + (day ? '<div style="font-size:11.5px;font-weight:700;margin:-1px 0 1px;">' + esc(day) + '</div>' : '') + esc(hm(s.start)) + '</div>'
          + '<div style="position:relative;height:100%;display:flex;justify-content:center;">'
          + (last ? '' : '<div style="position:absolute;top:16px;bottom:-18px;width:2px;border-radius:2px;background:' + dim + ';"></div>')
          + '<div style="position:relative;width:12px;height:12px;border-radius:50%;margin-top:4px;background:' + (isErr ? COLOR.bad : COLOR.run) + ';box-shadow:0 0 0 3px ' + row + ';"></div></div>'
          + '<div style="min-width:0;"><div style="font-size:14.5px;font-weight:700;color:' + ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(T(title)) + '</div>'
          + '<div style="font-size:12.5px;font-weight:500;color:' + sub + ';margin-top:1px;white-space:nowrap;">' + info + '</div></div></div>';
      }).join('');
    }
    var link = '/history?entity_id=' + encodeURIComponent(id) + '&start_date=' + encodeURIComponent(new Date(dayStart(now) - (DAYS - 1) * 86400000).toISOString());
    return '<div style="font-family:' + font + '">' + head
      + '<div style="background:' + row + ';border-radius:var(--casora-popup-row-radius, 24px);padding:8px 16px 8px 12px;">' + body + '</div>'
      + '<div role="button" data-casora-link="' + esc(link) + '" style="box-sizing:border-box;width:100%;text-align:center;margin-top:10px;height:46px;min-height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;'
      + 'font-size:14px;font-weight:700;cursor:pointer;background:var(--casora-soft-mehr-fill, ' + ctl + ');color:var(--casora-soft-mehr-ink, ' + ink + ');">'
      + '<span style="flex:none;margin:0;">' + esc(T('Ganzer Verlauf')) + '</span><ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:18px;display:flex;flex:none;margin:0;"></ha-icon></div></div>';
  };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  M.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id) return empty;
    var c = M.find(hass, id);
    var watch = [c.mower, c.battery, c.online, c.hours, c.rf, c.park, c.error];
    var call = function (part) {
      return 'return window._casoraMower ? window._casoraMower.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, info: { card: K.secCard(watch, call('info'), states) },
      hist: { card: K.secCard(watch, call('hist'), states) } };
    return K.layout({ fields: f, top: ['hero'], left: ['info'], right: ['hist'], narrowOrder: ['info', 'hist'] });
  };

  // Tasten wie beim Saugroboter (Zur Station · Mähen/Pause · Parken): Weich als Pillen, sonst große runde Knöpfe.
  var buttons = function (s, c, UI) {
    var esc = UI.esc, T = UI.tokens;
    var svc = function (domain, service, target) { return esc(JSON.stringify({ domain: domain, service: service, data: {}, target: { entity_id: target } })); };
    var mdi = function (n, sz, col) { return '<ha-icon icon="' + n + '" style="--mdc-icon-size:' + sz + 'px;width:' + sz + 'px;height:' + sz + 'px;display:block;color:' + (col || 'currentColor') + ';"></ha-icon>'; };
    var canStart = !!(s.features & 1), canPause = !!(s.features & 2), canDock = !!(s.features & 4);
    var main = (s.run || s.returning) && canPause ? { s: svc('lawn_mower', 'pause', c.mower), i: 'mdi:pause', l: 'Pause', ok: true }
      : { s: svc('lawn_mower', 'start_mowing', c.mower), i: 'mdi:play', l: s.paused ? 'Fortsetzen' : 'Mähen', ok: canStart };
    var keys = [
      { s: svc('lawn_mower', 'dock', c.mower), i: 'mdi:home-import-outline', l: 'Zur Station', ok: canDock && !s.docked && !s.returning },
      { s: main.s, i: main.i, l: main.l, ok: main.ok, lg: true },
    ];
    if (c.park) keys.push({ s: svc('button', 'press', c.park), i: 'mdi:sleep', l: 'Parken', ok: !s.parkedManual });
    // Casora-Design (Weich): Pillen mit Symbol und Text wie beim Saugroboter, die Hauptaktion gefüllt.
    var HH = window._casoraHH;
    if (HH && HH.on && HH.on()) {
      var pill = function (k) {
        var on = k.ok && !s.dead;
        return '<div class="hh-pill' + (k.lg ? ' pri' : '') + (on ? '' : ' dis') + '"' + (on ? ' data-casora-svc="' + k.s + '"' : '') + '>'
          + mdi(k.i, 20) + '<span style="pointer-events:none;">' + esc(k.l) + '</span></div>';
      };
      return HH.pillCss + '<style>.hh-pill > *{pointer-events:none;}</style><div class="hh-pills" style="margin-top:12px;">'
        + keys.map(pill).join('') + '</div>';
    }
    var b = function (k) {
      var on = k.ok && !s.dead;
      return '<div class="hm-b' + (k.lg ? ' lg' : '') + (on ? '' : ' dis') + '"' + (on ? ' data-casora-svc="' + k.s + '"' : '') + '>'
        + mdi(k.i, k.lg ? 32 : 24, k.lg ? '#000' : null) + '</div>';
    };
    return '<style>.hm-ctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px;color:' + T.ink + ';font-family:' + T.font + ';}'
      + '.hm-b{border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;flex:none;width:52px;height:52px;'
      + 'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease, transform .12s ease;user-select:none;-webkit-user-select:none;}'
      + '.hm-b > *{pointer-events:none;}.hm-b.lg{width:68px;height:68px;background:' + T.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
      + '.hm-b.dis{opacity:.3;pointer-events:none;}.hm-b:active{transform:scale(var(--casora-press-scale,.97));}'
      + '.hm-cap{display:flex;justify-content:center;gap:22px;margin-top:6px;font-size:12px;color:' + T.ink3 + ';font-family:' + T.font + ';}'
      + '.hm-cap span{width:52px;display:flex;justify-content:center;white-space:nowrap;overflow:visible;}.hm-cap span.lg{width:68px;}</style>'
      + '<div class="hm-ctl">' + keys.map(b).join('') + '</div>'
      + '<div class="hm-cap">' + keys.map(function (k) { return '<span' + (k.lg ? ' class="lg"' : '') + '>' + esc(k.l) + '</span>'; }).join('') + '</div>';
  };

  M.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var s = M.status(c, states);
    if (part === 'hero') {
      var sub = [];
      if (s.battery != null) sub.push('Akku ' + Math.round(s.battery) + ' %' + (s.charging ? ' · lädt' : ''));
      if (s.online === false) sub.push('Keine Verbindung');
      return UI.hero({ value: s.label, sub: sub.join(' · ') || null, subTone: s.online === false ? 'warn' : null, center: true })
        + (s.dead ? '' : buttons(s, c, UI));
    }
    if (part === 'info') {
      var rows = [];
      if (s.error) rows.push({ icon: 'mdi:alert-circle-outline', iconTone: s.level === 3 ? 'bad' : 'warn', label: s.error });
      if (s.battery != null) rows.push({ entity: c.battery || c.mower, icon: s.charging ? 'mdi:battery-charging' : 'mdi:battery', iconTone: s.battery < 20 ? 'warn' : 'accent',
        label: 'Akku', value: Math.round(s.battery) + ' %', valueTone: s.battery < 20 ? 'warn' : null });
      if (s.online != null || s.rf != null) rows.push({ entity: c.rf || c.online || null, icon: s.online === false ? 'mdi:wifi-off' : 'mdi:wifi', iconTone: s.online === false ? 'bad' : 'accent',
        label: 'Verbindung', value: s.online === false ? 'Getrennt' : s.rf != null ? Math.round(s.rf) + ' %' : 'Verbunden', valueTone: s.online === false ? 'bad' : null });
      if (s.hours != null) rows.push({ entity: c.hours || null, icon: 'mdi:timer-outline', iconTone: 'accent', label: 'Betriebsstunden',
        value: Math.round(s.hours).toLocaleString(window.casoraLocale ? window.casoraLocale() : undefined) + ' h' });
      return rows.length ? UI.group(rows, 'Status') : '';
    }
    if (part === 'hist') return histHtml(UI, M.history(hass, c.mower, el), c.mower, Date.now());
    return '';
  };
})();
