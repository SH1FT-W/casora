// ── Robot lawn mower: tile + popup (device card; community card in 1.5, regular since 26.10) ─────────────────
// For every lawn_mower entity. The basic controls (mow, pause, to station) come from HA's own services
// (lawn_mower.*, by supported_features). Everything else the module reads from the mower's attributes (Gardena:
// activity, state, last_error_code, battery_level, rf_link_level, operating_hours; Navimow: battery) and from the
// entities on the same device, found by the integration's translation_keys (SOURCES below), by device_class and –
// only as a fallback – by a word in the key or entity_id. Never by the device name.
// Sources: Husqvarna Automower (core), Gardena smart system (HACS), Worx Landroid (HACS landroid_cloud),
// Segway Navimow (HACS), Ecovacs GOAT (core ecovacs), Mammotion (HACS). Unknown integrations get the generic set
// (battery, charging, connection, signal, hours, error word) – that is also what the test house uses, where every
// entity runs under casora_mock and the source is picked by its keys.
//   window._casoraMower.SOURCES                        → platform → {fields: {field: {keys, domain, dc, re, all}}}
//   window._casoraMower.resolve(items, platform)       → {src, battery, online, …} (pure; items from M.items)
//   window._casoraMower.find(hass, id)                 → resolve(items(hass, id)) with the mower's entity id
//   window._casoraMower.status(c, states)              → {key, label, level, run, dead, error, battery, …}
//   window._casoraMower.tileState / .active / .color   – tile casora_lawn_mower
//   window._casoraMower.popup(entity, states, hass)    – popup casora_popup_lawn_mower
//   window._casoraMower.sec(part, C, states, hass, el) – live sections of the popup (hero, info, ctrl, hist)
//   window._casoraMower.sessions(rows, now)            – mowing runs from the history (7 days)
(function () {
  if (window._casoraMower && typeof window._casoraMower.popup === 'function') return;
  var M = window._casoraMower = {};

  var COLOR = {
    run: 'var(--casora-color-green, #6AAE78)',
    warn: 'var(--casora-color-orange, #DE8A4E)',
    bad: 'var(--casora-color-red, #D35A4E)',
  };
  M.COLOR = COLOR;
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  var up = function (s) { return String(s == null ? '' : s).toUpperCase(); };
  var low = function (s) { return String(s == null ? '' : s).toLowerCase(); };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ── Words ─────────────────────────────────────────────────────────────────
  // HA states (lawn_mower, plus Landroid's own) and Gardena activities.
  var STATE = { mowing: 'Mäht', docked: 'In der Station', paused: 'Pausiert', returning: 'Fährt zur Station', error: 'Fehler',
    idle: 'Bereit', starting: 'Startet', edgecut: 'Mäht die Kante', zoning: 'Fährt zur Zone', searching_zone: 'Sucht die Zone',
    escaped_digital_fence: 'Außerhalb des Mähbereichs', rain_delayed: 'Regenpause' };
  var RUNNING = { mowing: 1, edgecut: 1, zoning: 1, starting: 1 };
  var RETURNING = { returning: 1, searching_zone: 1 };
  var ACTIVITY = {
    OK_CUTTING: 'Mäht', OK_CUTTING_TIMER_OVERRIDDEN: 'Mäht außerhalb des Zeitplans', OK_SEARCHING: 'Fährt zur Station',
    OK_LEAVING: 'Verlässt die Station', OK_CHARGING: 'Lädt', PAUSED: 'Pausiert', PAUSED_IN_CS: 'Pausiert', OFF: 'Aus',
    PARKED_TIMER: 'Parkt bis zum nächsten Zeitplan', PARKED_PARK_SELECTED: 'Parkt bis auf Weiteres',
    PARKED_AUTOTIMER: 'Parkt, Rasen wächst langsam', PARKED_FROST: 'Parkt wegen Frost', PARKED_RAIN: 'Parkt wegen Regen',
    PARKED_DAILY_LIMIT_REACHED: 'Parkt, Tagesziel erreicht', PARKED_NO_LIGHT: 'Parkt, zu dunkel', PARKED_MOWING_COMPLETED: 'Parkt, alles gemäht',
    SEARCHING_FOR_SATELLITES: 'Sucht Satelliten', INITIATE_NEXT_ACTION: 'Startet',
  };
  // Husqvarna: why the mower stays in the station (sensor restricted_reason).
  var REASON = { frost: 'Parkt wegen Frost', daily_limit: 'Parkt, Tagesziel erreicht', week_schedule: 'Parkt bis zum nächsten Zeitplan',
    park_override: 'Parkt bis auf Weiteres', sensor: 'Parkt wegen Regen', all_work_areas_completed: 'Parkt, alles gemäht', fota: 'Wird aktualisiert' };
  var REASON_EXTERNAL = /^(external|amazon_alexa|developer_portal|gardena_smart_system|google_assistant|home_assistant|ifttt|ifttt_applets|ifttt_calendar_connection|smart_routine|smart_routine_frost_guard|smart_routine_rain_guard|smart_routine_wildlife_protection)$/;
  // Husqvarna mode sensor.
  var MODE = { main_area: 'Hauptbereich', secondary_area: 'Nebenbereich', home: 'Zuhause', demo: 'Demo', poi: 'Zielpunkt' };
  // Error codes (Gardena upper case, Husqvarna and Landroid snake_case – compared upper case).
  var ERRORS = {
    OUTSIDE_WORKING_AREA: 'Außerhalb des Mähbereichs', OUTSIDE_WIRE: 'Außerhalb des Mähbereichs', NO_LOOP_SIGNAL: 'Kein Signal vom Begrenzungsdraht',
    WIRE_MISSING: 'Kein Signal vom Begrenzungsdraht', WRONG_LOOP_SIGNAL: 'Falsches Signal vom Begrenzungsdraht', REVERSE_WIRE: 'Begrenzungsdraht verpolt',
    TRAPPED: 'Steckt fest', TRAPPED_TIMEOUT: 'Steckt fest', UPSIDE_DOWN: 'Umgekippt',
    EMPTY_BATTERY: 'Akku leer', LOW_BATTERY: 'Akku schwach', BATTERY_LOW: 'Akku schwach', NO_DRIVE: 'Kann nicht fahren', LIFTED: 'Angehoben',
    TEMPORARILY_LIFTED: 'Kurz angehoben', MOWER_TILTED: 'Steht schief', SLIPPED: 'Rutscht', STEEP_SLOPE: 'Zu steil', EXCESSIVE_SLOPE: 'Zu steil',
    STUCK_IN_CHARGING_STATION: 'Hängt in der Station fest', CHARGING_STATION_BLOCKED: 'Station blockiert', CHARGING_STATION_DOCKING_ERROR: 'Station blockiert',
    UNREACHABLE_CHARGING_STATION: 'Findet die Station nicht', TIMEOUT_FINDING_HOME: 'Findet die Station nicht', MISSING_CHARGING_STATION: 'Findet die Station nicht',
    CHARGING_SYSTEM_PROBLEM: 'Ladefehler', CHARGE_ERROR: 'Ladefehler', CHARGING_CURRENT_TOO_HIGH: 'Ladestrom zu hoch', BATTERY_PROBLEM: 'Akkufehler',
    BATTERY_TEMPERATURE_ERROR: 'Akkufehler',
    WHEEL_MOTOR_BLOCKED_LEFT: 'Rad links blockiert', WHEEL_MOTOR_BLOCKED_RIGHT: 'Rad rechts blockiert', WHEEL_MOTOR_BLOCKED: 'Rad blockiert',
    WHEEL_MOTOR_OVERLOADED_LEFT: 'Rad links überlastet', WHEEL_MOTOR_OVERLOADED_RIGHT: 'Rad rechts überlastet',
    WHEEL_DRIVE_PROBLEM_LEFT: 'Radantrieb links gestört', WHEEL_DRIVE_PROBLEM_RIGHT: 'Radantrieb rechts gestört',
    CUTTING_SYSTEM_BLOCKED: 'Mähwerk blockiert', BLADE_MOTOR_BLOCKED: 'Mähwerk blockiert', CUTTING_MOTOR_PROBLEM: 'Mähmotor gestört', CUTTING_MOTOR_DRIVE_DEFECT: 'Mähmotor defekt',
    CUTTING_HEIGHT_BLOCKED: 'Schnitthöhe blockiert', BLADE_HEIGHT_ADJUSTMENT_BLOCKED: 'Schnitthöhe blockiert', CUTTING_HEIGHT_PROBLEM: 'Schnitthöhe gestört',
    COLLISION_SENSOR_PROBLEM_FRONT: 'Stoßsensor vorne gestört', COLLISION_SENSOR_PROBLEM_REAR: 'Stoßsensor hinten gestört',
    TILT_SENSOR_PROBLEM: 'Neigungssensor gestört', STOP_BUTTON_PROBLEM: 'Stopp-Taste gestört', ELECTRONIC_PROBLEM: 'Elektronik gestört',
    WRONG_PIN_CODE: 'Falsche PIN', LOCKED: 'Gesperrt', OFF_DISABLED: 'Aus', OFF: 'Aus', OFF_HATCH_OPEN: 'Klappe offen', OFF_HATCH_CLOSED: 'Aus, Klappe zu',
    CLOSE_DOOR_TO_MOW: 'Klappe schließen', CLOSE_DOOR_TO_GO_HOME: 'Klappe schließen', RAIN_DELAY: 'Regenpause',
    UNREACHABLE_ZONE: 'Zone nicht erreichbar', MAP_ERROR: 'Kartenfehler', CAMERA_ERROR: 'Kamera gestört',
    ALARM_MOWER_SWITCHED_OFF: 'Alarm: ausgeschaltet', ALARM_MOWER_STOPPED: 'Alarm: angehalten', ALARM_MOWER_LIFTED: 'Alarm: angehoben',
    ALARM_MOWER_TILTED: 'Alarm: gekippt', ALARM_MOWER_IN_MOTION: 'Alarm: bewegt', ALARM_OUTSIDE_GEOFENCE: 'Alarm: außerhalb des Bereichs',
    WAIT_UPDATING: 'Wird aktualisiert', WAIT_POWER_UP: 'Startet', ERROR_AT_POWER_UP: 'Fehler beim Start', FATAL_ERROR: 'Schwerer Fehler', ERROR: 'Fehler',
  };
  var NO_ERROR = /^(|NO_MESSAGE|NONE|NULL|NO_ERROR|UNKNOWN|UNAVAILABLE|OK|0|-)$/;
  // Unknown code: make it readable ("WHEEL_SOMETHING" → "Fehler: Wheel something"), never empty.
  M.errorText = function (code) {
    var k = up(code).trim();
    if (NO_ERROR.test(k)) return null;
    if (ERRORS[k]) return ERRORS[k];
    // Mammotion's error sensor carries a sentence – show it as it is.
    if (/\s/.test(k) && !/^[A-Z0-9_]+$/.test(k)) return String(code).trim();
    var t = k.toLowerCase().replace(/_/g, ' ');
    return 'Fehler: ' + t.charAt(0).toUpperCase() + t.slice(1);
  };

  // ── Sources: integration → fields ────────────────────────────────────────
  // Every field: keys (translation_key, exact), dc (device_class), re (word in key or entity_id, fallback), domain,
  // all (list instead of the first hit). Only what the integration really has is listed – the popup shows a row
  // only when its entity exists.
  var S = function (keys, domain, extra) { return Object.assign({ keys: [].concat(keys || []), domain: domain }, extra || {}); };
  var SOURCES = {
    husqvarna_automower: { fields: { // Husqvarna Automower
      battery: S([], 'sensor', { dc: 'battery' }), charging: S([], 'binary_sensor', { dc: 'battery_charging' }),
      error: S(['error'], 'sensor'), nextStart: S(['next_start_timestamp'], 'sensor'),
      blade: S(['cutting_blade_usage_time'], 'sensor'), hours: S(['total_running_time'], 'sensor'),
      mode: S(['mode'], 'sensor'), reason: S(['restricted_reason'], 'sensor'), workArea: S(['work_area'], 'sensor'),
      progress: S(['work_area_progress', 'my_lawn_progress'], 'sensor'),
      cutHeight: S(['cutting_height'], 'number'), schedule: S(['enable_schedule'], 'switch'), confirm: S(['confirm_error'], 'button'),
    } },
    gardena_smart_system: { fields: { // Gardena smart system
      battery: S([], 'sensor', { dc: 'battery' }), online: S([], 'binary_sensor', { dc: 'connectivity' }),
      rf: S([], 'sensor', { re: /rf_link|link_quality/ }), hours: S([], 'sensor', { re: /operating_hours/ }),
      error: S(['mower_error'], 'sensor'), park: S([], 'button', { re: /park_until_further_notice|park_permanent/ }),
      start: S([], 'button', { re: /start_mowing|start_override|mow_now/ }),
    } },
    landroid_cloud: { fields: { // Worx Landroid
      battery: S(['battery'], 'sensor', { dc: 'battery' }), charging: S(['charging'], 'binary_sensor', { dc: 'battery_charging' }),
      online: S(['mqtt_connected'], 'binary_sensor', { dc: 'connectivity' }), rf: S(['rssi'], 'sensor', { dc: 'signal_strength' }),
      error: S(['error'], 'sensor'), nextStart: S(['next_schedule'], 'sensor'), progress: S(['daily_progress'], 'sensor'),
      blade: S(['blade_runtime_current', 'blade_runtime_total'], 'sensor'), hours: S(['mower_runtime_total'], 'sensor'),
      rainSensor: S(['rain_sensor'], 'binary_sensor'), rainLeft: S(['rain_delay_remaining'], 'sensor'), rainDelay: S(['rain_delay'], 'number'),
      cutHeight: S(['cutting_height'], 'number'), zone: S(['zone'], 'select'),
    } },
    navimow: { fields: { // Segway Navimow
      battery: S(['battery'], 'sensor', { dc: 'battery' }),
    } },
    ecovacs: { fields: { // Ecovacs GOAT
      battery: S([], 'sensor', { dc: 'battery' }), charging: S([], 'binary_sensor', { dc: 'battery_charging' }),
      error: S(['error'], 'sensor'), blade: S(['lifespan_blade'], 'sensor'), hours: S(['total_stats_time_mower'], 'sensor'),
      area: S(['stats_area_mower'], 'sensor'), rf: S(['network_rssi'], 'sensor'),
    } },
    mammotion: { fields: { // Mammotion
      battery: S(['battery_percent'], 'sensor', { dc: 'battery' }), charging: S(['charging'], 'binary_sensor', { dc: 'battery_charging' }),
      online: S(['mqtt_status'], 'sensor'), rf: S(['wifi_rssi'], 'sensor'),
      error: S(['error_1_message'], 'sensor'), blade: S(['blade_used_time'], 'sensor'), hours: S(['maintenance_work_time'], 'sensor'),
      mode: S(['activity_mode'], 'sensor'), workArea: S(['work_area'], 'sensor'), progress: S(['progress'], 'sensor'), left: S(['left_time'], 'sensor'),
      rainSensor: S(['rain_detected'], 'binary_sensor'), cutHeight: S(['blade_height'], 'number'),
    } },
  };
  // Unknown integration: device classes and a word in the key – enough for battery and connection everywhere.
  var GENERIC = { fields: {
    battery: S([], 'sensor', { dc: 'battery' }), charging: S([], 'binary_sensor', { dc: 'battery_charging' }),
    online: S([], 'binary_sensor', { dc: 'connectivity' }), rf: S([], 'sensor', { dc: 'signal_strength', re: /rf_link|link_quality|rssi/ }),
    hours: S([], 'sensor', { re: /operating_hours|running_time|work_time|runtime_total|betriebsstunden/ }),
    error: S([], 'sensor', { re: /(^|_)error(_|$)|fehler/ }),
    nextStart: S([], 'sensor', { re: /next_start|next_schedule/ }), cutHeight: S([], 'number', { re: /cutting_height|blade_height/ }),
    park: S([], 'button', { re: /park_until_further_notice|park_permanent/ }), start: S([], 'button', { re: /start_mowing|mow_now|start_override/ }),
  } };
  M.SOURCES = SOURCES;
  M.GENERIC = GENERIC;

  // Entities of the mower's device: [{entity_id, key, platform, domain, dc, unit, state}] (hidden ones stay out).
  M.items = function (hass, id) {
    var D = window.casoraDevice, S0 = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    var list = D && D.entities ? D.entities(hass, id) : [];
    return list.map(function (x) {
      var st = S0[x.entity_id], a = (st && st.attributes) || {}, e = R[x.entity_id] || {};
      return { entity_id: x.entity_id, key: x.key || null, platform: e.platform || null, domain: x.domain, dc: x.dc || a.device_class || null,
        unit: a.unit_of_measurement || null, state: st ? st.state : null, category: x.category || null };
    });
  };
  var hit = function (x, spec, loose) {
    if (spec.domain && x.domain !== spec.domain) return false;
    if (spec.keys.length && x.key && spec.keys.indexOf(x.key) >= 0) return true;
    if (!loose) return false;
    if (spec.dc && x.dc === spec.dc) return true;
    if (spec.re && spec.re.test((x.key || '') + ' ' + x.entity_id.split('.')[1])) return true;
    return false;
  };
  // Which source: the mower's integration, else (test house, forks) the one whose keys appear most on the device.
  M.sourceOf = function (items, platform) {
    if (platform && SOURCES[platform]) return platform;
    var best = null, score = 0;
    Object.keys(SOURCES).forEach(function (p) {
      var f = SOURCES[p].fields, n = 0;
      Object.keys(f).forEach(function (k) {
        var sp = f[k];
        if (items.some(function (x) { return hit(x, sp, false) || (sp.re && hit(x, sp, true) && !sp.dc); })) n++;
      });
      if (n > score) { score = n; best = p; }
    });
    return score ? best : null;
  };
  M.resolve = function (items, platform, mowerId) {
    var src = M.sourceOf(items, platform);
    var fields = src ? SOURCES[src].fields : {};
    var c = { mower: mowerId || null, src: src };
    var own = items.filter(function (x) { return x.entity_id !== mowerId && x.domain !== 'lawn_mower'; });
    var pick = function (spec) {
      var exact = own.filter(function (x) { return hit(x, spec, false); });
      if (exact.length) return exact;
      return own.filter(function (x) { return hit(x, spec, true); });
    };
    Object.keys(fields).forEach(function (k) {
      var got = pick(fields[k]);
      c[k] = fields[k].all ? got.map(function (x) { return x.entity_id; }) : (got[0] ? got[0].entity_id : null);
    });
    // Battery, charging, connection, signal, hours, error: every mower, however the integration names them.
    Object.keys(GENERIC.fields).forEach(function (k) {
      if (c[k]) return;
      var got = pick(GENERIC.fields[k]);
      c[k] = got[0] ? got[0].entity_id : null;
    });
    return c;
  };
  M.find = function (hass, id) {
    var R = (hass && hass.entities) || {};
    return M.resolve(M.items(hass, id), (R[id] || {}).platform || null, id);
  };

  // ── Values from the found entities ────────────────────────────────────────
  var st = function (S0, id) { return id && S0[id] && !bad(S0[id].state) ? S0[id] : null; };
  var unitOf = function (o) { return low(((o && o.attributes) || {}).unit_of_measurement); };
  // Duration sensors of any unit → hours.
  var hoursOf = function (o) {
    var n = num(o && o.state);
    if (n == null) return null;
    var u = unitOf(o);
    if (u === 's') return n / 3600;
    if (u === 'min') return n / 60;
    if (u === 'd') return n * 24;
    return n;
  };
  M.hoursOf = hoursOf;
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // Timestamp → "heute 14:00", "morgen 8:00", "Fr 14:00"; null for the past or nothing planned.
  M.whenText = function (iso, now) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    now = now || Date.now();
    if (t < now - 60000) return null;
    var dd = Math.round((dayStart(t) - dayStart(now)) / 86400000);
    var time = hm(t);
    if (dd === 0) return 'heute ' + time;
    if (dd === 1) return 'morgen ' + time;
    var wd = new Date(t).toLocaleDateString(loc(), { weekday: 'short' }).replace(/\.$/, '');
    return wd + ' ' + time;
  };

  // ── Status ────────────────────────────────────────────────────────────────
  // level: 0 quiet, 1 running (green), 2 hint (orange), 3 error (red).
  M.status = function (c, states, now) {
    var S0 = states || {};
    var m = S0[c.mower];
    var s = { key: 'none', label: 'Nicht verfügbar', level: 0, dead: true, run: false, paused: false, docked: false,
      returning: false, charging: false, parkedManual: false, error: null, battery: null, rf: null, rfUnit: null, hours: null, online: null,
      nextStart: null, mode: null, workArea: null, progress: null, left: null, blade: null, bladePct: null, rain: null, cutHeight: null, src: c.src || null };
    if (!m) return s;
    var a = m.attributes || {};
    var hs = low(m.state);
    var act = up(a.activity);
    s.features = num(a.supported_features) || 0;
    // Battery: Gardena/Navimow attribute, else the battery sensor.
    s.battery = num(a.battery_level);
    if (s.battery == null) s.battery = num(a.battery);
    var bat = st(S0, c.battery);
    if (s.battery == null && bat) s.battery = num(bat.state);
    s.rf = num(a.rf_link_level);
    var rf = st(S0, c.rf);
    if (s.rf == null && rf) { s.rf = num(rf.state); s.rfUnit = unitOf(rf) || null; }
    else if (s.rf != null) s.rfUnit = '%';
    s.hours = num(a.operating_hours);
    var hrs = st(S0, c.hours);
    if (s.hours == null && hrs) s.hours = hoursOf(hrs);
    // Connection: Gardena attribute, connectivity sensor, Mammotion's mqtt_status sensor.
    if (a.rf_link_state) s.online = up(a.rf_link_state) !== 'OFFLINE';
    else {
      var on = st(S0, c.online);
      if (on) s.online = on.entity_id.indexOf('binary_sensor.') === 0 ? on.state === 'on' : !/offline/i.test(on.state);
    }
    var ch = st(S0, c.charging);
    s.charging = act === 'OK_CHARGING' || (ch ? ch.state === 'on' : false) || (bat && bat.attributes && bat.attributes.battery_charging === true);
    // Extra values (only where the source has them).
    var ns = st(S0, c.nextStart);
    if (ns) s.nextStart = M.whenText(ns.state, now);
    var md = st(S0, c.mode);
    if (md) s.mode = MODE[low(md.state)] || (c.src === 'mammotion' ? null : md.state);
    var wa = st(S0, c.workArea);
    if (wa && !/^(no_work_area_active|not working|none)$/i.test(wa.state)) s.workArea = wa.state;
    var pg = st(S0, c.progress);
    if (pg) s.progress = num(pg.state);
    var lf = st(S0, c.left);
    if (lf) { var lh = hoursOf(lf); s.left = lh != null && lh > 0 ? Math.round(lh * 60) : null; }
    var bl = st(S0, c.blade);
    if (bl) { if (unitOf(bl) === '%') s.bladePct = num(bl.state); else s.blade = hoursOf(bl); }
    var rs = st(S0, c.rainSensor), rl = st(S0, c.rainLeft), rd = st(S0, c.rainDelay);
    if (rs && rs.state === 'on') s.rain = 'Regen erkannt';
    else if (rl && (hoursOf(rl) || 0) > 0) s.rain = 'Pause noch ' + M.dur(hoursOf(rl) * 3600000);
    else if (hs === 'rain_delayed') s.rain = 'Regenpause';
    else if (rd && num(rd.state) != null) s.rain = 'Verzögerung ' + M.dur(num(rd.state) * 60000);
    var chh = st(S0, c.cutHeight);
    if (chh) s.cutHeight = { value: num(chh.state), unit: ((chh.attributes || {}).unit_of_measurement) || '', min: num((chh.attributes || {}).min),
      max: num((chh.attributes || {}).max), step: num((chh.attributes || {}).step) || 1 };
    if (bad(hs)) { s.label = hs === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar'; return s; }
    s.dead = false;
    s.key = act || hs;
    s.run = !!RUNNING[hs] || /^OK_(CUTTING|LEAVING)|^INITIATE_NEXT_ACTION$/.test(act);
    s.returning = !!RETURNING[hs] || act === 'OK_SEARCHING';
    s.paused = hs === 'paused' || /^PAUSED(_IN_CS)?$/.test(act);
    s.docked = !s.run && !s.returning && !s.paused && (hs === 'docked' || /^PARKED_|^OK_CHARGING$/.test(act));
    // Parked until further notice: Gardena activity, Husqvarna reason/mode or the schedule switch off.
    var rsn = st(S0, c.reason), sch = st(S0, c.schedule);
    var reason = rsn ? low(rsn.state) : '';
    s.parkedManual = act === 'PARKED_PARK_SELECTED' || reason === 'park_override' || (md && low(md.state) === 'home') || (sch ? sch.state === 'off' : false);
    s.label = ACTIVITY[act] || STATE[hs] || 'Bereit';
    if (s.docked && !ACTIVITY[act]) {
      if (s.charging) s.label = 'Lädt';
      else if (REASON[reason]) s.label = REASON[reason];
      else if (REASON_EXTERNAL.test(reason)) s.label = 'Parkt (extern)';
      else if (s.parkedManual) s.label = 'Parkt bis auf Weiteres';
    }
    // Error: Gardena code attribute, else the error sensor (Husqvarna/Landroid enum key, Ecovacs code with description,
    // Mammotion sentence). Shown while the mower reports an error (Gardena also as WARNING).
    var es = st(S0, c.error);
    var code = M.errorText(a.last_error_code) || (a.error != null ? M.errorText(a.error) : null);
    if (!code && es) code = (es.attributes && es.attributes.description && M.errorText(es.state)) ? String(es.attributes.description) : M.errorText(es.state);
    var err = up(a.state) === 'ERROR' || hs === 'error' || hs === 'escaped_digital_fence';
    if (err) { s.error = code || STATE[hs] || 'Fehler'; s.label = s.error; s.level = 3; return s; }
    if (s.online === false) { s.label = 'Offline'; s.level = 2; return s; }
    if (up(a.state) === 'WARNING' && code) { s.error = code; s.label = code; s.level = 2; return s; }
    s.level = (s.run || s.returning) ? 1 : 0;
    return s;
  };
  M.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    return M.status(M.find(hass, id), states || (hass && hass.states) || {});
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  M.active = function (s) { return !!(s && s.level >= 1); };
  M.color = function (s) { return !s ? COLOR.run : s.level === 3 ? COLOR.bad : s.level === 2 ? COLOR.warn : COLOR.run; };
  // Only the state – the ring top right shows the battery while under way (show_progress); charging "Lädt · 40 %".
  M.tileState = function (s) {
    if (!s) return '';
    if (s.charging && s.battery != null && s.level < 2 && s.label === 'Lädt') return s.label + ' · ' + Math.round(s.battery) + ' %';
    return s.label;
  };
  // Icon tap: under way → to station, else mow. Nothing without the matching feature.
  M.iconService = function (s) {
    if (!s || s.dead) return 'none';
    if (s.run || s.returning) return s.features & 4 ? 'lawn_mower.dock' : 'none';
    return s.features & 1 ? 'lawn_mower.start_mowing' : 'none';
  };

  // Popup head tile in the colour of the state (DP-15); quiet in the station.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_lawn_mower\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = M.of(src._stateObj, ha && ha.hass);
    return s.level ? { hue: M.color(s), off: false } : { hue: COLOR.run, off: true };
  });

  // ── History (7 days) ──────────────────────────────────────────────────────
  // Mowing runs from HA's history: a run starts with "mowing" and ends once the mower is back in the station
  // (pause and return belong to it). Errors are entries of their own. Fetched once per state change, then the
  // open live sections are redrawn (like the person popup, 15-person.js).
  var DAYS = 7;
  M.dur = function (ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' Min.';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
  };
  // rows: [{state, t}] ascending → [{kind: 'mow'|'error', start, end, mow (ms mowed), error}] newest first.
  M.sessions = function (rows, now) {
    var out = [], cur = null, err = null;
    var close = function (t) { if (cur) { cur.end = t; out.push(cur); cur = null; } };
    rows.forEach(function (x, i) {
      var s = x.state, t = x.t, next = rows[i + 1], tEnd = next ? next.t : null;
      if (s !== 'error' && err) { err.end = t; out.push(err); err = null; }
      if (RUNNING[s]) {
        if (!cur) cur = { kind: 'mow', start: t, end: null, mow: 0 };
        cur.mow += (tEnd || now) - t;
      } else if (s === 'paused' || RETURNING[s] || s === 'rain_delayed') {
        /* part of the current run */
      } else if (s === 'error' || s === 'escaped_digital_fence') {
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
    var so = hass && hass.states && hass.states[id];
    if (!so) return null;
    var key = id + '|' + so.last_changed;
    var h0 = hist[id];
    if (h0 && h0.key === key) { if (el && h0.busy) h0.wait.push(el); return h0.list; }
    hist[id] = { key: key, list: h0 ? h0.list : null, busy: true, wait: el ? [el] : [] };
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
          } catch (e) { /* popup already closed */ }
        });
        h.wait = [];
      }).catch(function () { if (hist[id] && hist[id].key === key) { hist[id].busy = false; hist[id].list = hist[id].list || []; } });
    return hist[id].list;
  };
  // Sum of the week for the heading: "6 Std. 10 Min. · 5 Fahrten".
  M.total = function (list) {
    var mow = (list || []).filter(function (x) { return x.kind === 'mow'; });
    if (!mow.length) return null;
    var ms = mow.reduce(function (a, x) { return a + x.mow; }, 0);
    return M.dur(ms) + ' · ' + (mow.length === 1 ? '1 Fahrt' : mow.length + ' Fahrten');
  };
  // Timeline like the person popup: time | dot (green mowed, red error) with a line | text.
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
        var day = first ? (dd === 1 ? T('Gestern') : new Date(s.start).toLocaleDateString(loc(), { weekday: 'short' }).replace(/\.$/, '')) : '';
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
      // Blueprint v2 (rule 6): „Ganzer Verlauf ↗“ is a row that leaves Casora for HA's history (was a wide pill).
      + (window._casoraUI && window._casoraUI.row ? '<div style="margin-top:10px;">' + window._casoraUI.group([window._casoraUI.row.out({ icon: 'mdi:chart-timeline-variant',
        label: 'Ganzer Verlauf', url: link })], null) + '</div>' : '')
      + '</div>';
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  var WATCH = ['mower', 'battery', 'charging', 'online', 'rf', 'hours', 'blade', 'error', 'nextStart', 'mode', 'reason', 'workArea', 'progress',
    'left', 'rainSensor', 'rainLeft', 'rainDelay', 'cutHeight', 'zone', 'schedule', 'confirm', 'park', 'start', 'area'];
  M.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id) return empty;
    var c = M.find(hass, id);
    var watch = WATCH.map(function (k) { return c[k]; }).filter(function (x) { return typeof x === 'string'; });
    var call = function (part) {
      return 'return window._casoraMower ? window._casoraMower.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, info: { card: K.secCard(watch, call('info'), states) },
      hist: { card: K.secCard(watch, call('hist'), states) } };
    // Settings only when the source has something to set (cutting height, zone, schedule).
    if (c.cutHeight || c.zone) f.ctrl = { card: K.secCard(watch, call('ctrl'), states) };
    return K.layout({ fields: f, top: ['hero'], left: ['info', 'ctrl'], right: ['hist'], narrowOrder: ['info', 'ctrl', 'hist'],
      settings: hass && hass.states && hass.states[c.mower] ? c.mower : id });
  };

  // Keys like the vacuum (To station · Mow/Pause · Park): soft design as pills, else large round buttons.
  // "Park" = until further notice: Gardena's button, Husqvarna's schedule switch (off = park).
  var buttons = function (s, c, UI, states) {
    var esc2 = UI.esc, TK = UI.tokens;
    var svc = function (domain, service, target, data) { return { domain: domain, service: service, data: data || {}, target: { entity_id: target } }; };
    var mdi = function (n, sz, col) { return '<ha-icon icon="' + n + '" style="--mdc-icon-size:' + sz + 'px;width:' + sz + 'px;height:' + sz + 'px;display:block;color:' + (col || 'currentColor') + ';"></ha-icon>'; };
    var canStart = !!(s.features & 1), canPause = !!(s.features & 2), canDock = !!(s.features & 4);
    var main = (s.run || s.returning) && canPause ? { s: svc('lawn_mower', 'pause', c.mower), i: 'mdi:pause', l: 'Pause', ok: true }
      : canStart || !c.start ? { s: svc('lawn_mower', 'start_mowing', c.mower), i: 'mdi:play', l: s.paused ? 'Fortsetzen' : 'Mähen', ok: canStart }
        : { s: svc('button', 'press', c.start), i: 'mdi:play', l: 'Mähen', ok: true };
    var keys = [
      { s: svc('lawn_mower', 'dock', c.mower), i: 'mdi:home-import-outline', l: 'Zur Station', ok: canDock && !s.docked && !s.returning },
      { s: main.s, i: main.i, l: main.l, ok: main.ok, lg: true },
    ];
    if (c.park) keys.push({ s: svc('button', 'press', c.park), i: 'mdi:sleep', l: 'Parken', ok: !s.parkedManual });
    else if (c.schedule && states && states[c.schedule] && !bad(states[c.schedule].state)) {
      var schedOn = states[c.schedule].state === 'on';
      keys.push(schedOn ? { s: svc('switch', 'turn_off', c.schedule), i: 'mdi:sleep', l: 'Parken', ok: true }
        : { s: svc('switch', 'turn_on', c.schedule), i: 'mdi:calendar-clock', l: 'Zeitplan', ok: true });
    }
    // Casora design (soft): pills with icon and text like the vacuum, the main action filled.
    var HH = window._casoraHH;
    /* Blueprint v2 (rule 4): the shared action row, mowing/pause filled in the device colour. */
    if (HH && HH.on && HH.on() && UI.actions) {
      return '<div style="margin-top:12px;">' + UI.actions(keys.map(function (k) {
        return { text: k.l, icon: k.i, svc: k.s, primary: !!k.lg, disabled: !(k.ok && !s.dead) };
      })) + '</div>';
    }
    var b = function (k) {
      var on = k.ok && !s.dead;
      return '<div class="hm-b' + (k.lg ? ' lg' : '') + (on ? '' : ' dis') + '"' + (on ? ' data-casora-svc="' + esc2(JSON.stringify(k.s)) + '"' : '') + '>'
        + mdi(k.i, k.lg ? 32 : 24, k.lg ? '#000' : null) + '</div>';
    };
    return '<style>.hm-ctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px;color:' + TK.ink + ';font-family:' + TK.font + ';}'
      + '.hm-b{border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;flex:none;width:52px;height:52px;'
      + 'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease, transform .12s ease;user-select:none;-webkit-user-select:none;}'
      + '.hm-b > *{pointer-events:none;}.hm-b.lg{width:68px;height:68px;background:' + TK.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
      + '.hm-b.dis{opacity:.3;pointer-events:none;}.hm-b:active{transform:scale(var(--casora-press-scale,.97));}'
      + '.hm-cap{display:flex;justify-content:center;gap:22px;margin-top:6px;font-size:12px;color:' + TK.ink3 + ';font-family:' + TK.font + ';}'
      + '.hm-cap span{width:52px;display:flex;justify-content:center;white-space:nowrap;overflow:visible;}.hm-cap span.lg{width:68px;}</style>'
      + '<div class="hm-ctl">' + keys.map(b).join('') + '</div>'
      + '<div class="hm-cap">' + keys.map(function (k) { return '<span' + (k.lg ? ' class="lg"' : '') + '>' + esc2(k.l) + '</span>'; }).join('') + '</div>';
  };

  var fmt = function (n, digits) { return Number(n).toLocaleString(loc(), { maximumFractionDigits: digits == null ? 0 : digits }); };
  // Steps of a number entity: [min, min+step, …, max]; null when there are too many for a segment bar.
  var stepsOf = function (h, max) {
    if (h.min == null || h.max == null || !(h.step > 0)) return null;
    var n = Math.round((h.max - h.min) / h.step) + 1;
    if (n < 2 || n > max) return null;
    var out = [];
    for (var i = 0; i < n; i++) out.push(Math.round((h.min + i * h.step) * 100) / 100);
    return out;
  };

  M.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var s = M.status(c, states);
    if (part === 'hero') {
      var sub = [];
      // "lädt" only when the state word does not say it already ("Lädt · Akku 87 % · lädt").
      if (s.battery != null) sub.push('Akku ' + Math.round(s.battery) + ' %' + (s.charging && s.label !== 'Lädt' ? ' · lädt' : ''));
      if (s.online === false) sub.push('Offline');
      else if (s.nextStart && !s.run && !s.returning) sub.push('Nächster Start ' + s.nextStart);
      else if (s.left != null && s.run) sub.push('noch ' + M.dur(s.left * 60000));
      return UI.hero({ value: s.label, sub: sub.join(' · ') || null, subTone: s.online === false ? 'warn' : null, center: true })
        + (s.dead ? '' : buttons(s, c, UI, states));
    }
    if (part === 'info') {
      var rows = [];
      if (s.error) {
        var er = { icon: 'mdi:alert-circle-outline', iconTone: s.level === 3 ? 'bad' : 'warn', label: s.error, entity: c.error || null };
        // A button's state is its last press ("unknown" until then) – only "unavailable" means it cannot confirm.
        if (c.confirm && states[c.confirm] && states[c.confirm].state !== 'unavailable') {
          er.action = 'Bestätigen';
          er.svc = { domain: 'button', service: 'press', data: {}, target: { entity_id: c.confirm }, done: 'Bestätigt' };
        }
        rows.push(er);
      }
      if (s.battery != null) rows.push({ entity: c.battery || c.mower, icon: s.charging ? 'mdi:battery-charging' : 'mdi:battery', iconTone: s.battery < 20 ? 'warn' : 'accent',
        label: 'Akku', value: Math.round(s.battery) + ' %', sub: s.charging ? 'Lädt' : null, valueTone: s.battery < 20 ? 'warn' : null });
      if (s.online != null || s.rf != null) {
        var rfText = s.rf == null ? null : (s.rfUnit === 'dbm' || s.rfUnit === 'dBm' ? fmt(s.rf) + ' dBm' : Math.round(s.rf) + ' %');
        rows.push({ entity: c.rf || c.online || null, icon: s.online === false ? 'mdi:wifi-off' : 'mdi:wifi', iconTone: s.online === false ? 'bad' : 'accent',
          label: 'Verbindung', value: s.online === false ? 'Offline' : rfText || 'Verbunden', valueTone: s.online === false ? 'bad' : null });
      }
      if (s.nextStart) rows.push({ entity: c.nextStart, icon: 'mdi:calendar-clock', iconTone: 'accent', label: 'Nächster Start', value: s.nextStart });
      if (s.mode) rows.push({ entity: c.mode, icon: 'mdi:tune-variant', iconTone: 'accent', label: 'Modus', value: s.mode });
      if (s.workArea) rows.push({ entity: c.workArea, icon: 'mdi:map-marker-radius-outline', iconTone: 'accent', label: 'Bereich', value: s.workArea });
      if (s.progress != null) rows.push({ entity: c.progress, icon: 'mdi:progress-check', iconTone: 'accent', label: 'Fortschritt', value: Math.round(s.progress) + ' %',
        sub: s.left != null && s.run ? 'noch ' + M.dur(s.left * 60000) : null });
      if (s.rain) rows.push({ entity: c.rainSensor || c.rainLeft || c.rainDelay || null, icon: 'mdi:weather-rainy', iconTone: /erkannt|Pause|Regenpause/.test(s.rain) ? 'warn' : 'accent',
        label: 'Regen', value: s.rain });
      if (s.bladePct != null) rows.push({ entity: c.blade, icon: 'mdi:knife', iconTone: s.bladePct < 15 ? 'warn' : 'accent', label: 'Messer',
        value: Math.round(s.bladePct) + ' %', sub: 'Restlebensdauer', valueTone: s.bladePct < 15 ? 'warn' : null });
      else if (s.blade != null) rows.push({ entity: c.blade, icon: 'mdi:knife', iconTone: 'accent', label: 'Messer', value: fmt(s.blade) + ' h', sub: 'Einsatzzeit' });
      if (s.hours != null) rows.push({ entity: c.hours || null, icon: 'mdi:timer-outline', iconTone: 'accent', label: 'Betriebsstunden', value: fmt(s.hours) + ' h' });
      return rows.length ? UI.group(rows, 'Status') : '';
    }
    if (part === 'ctrl') {
      var out = '';
      var gap = '<div style="height:18px"></div>';
      if (s.cutHeight && s.cutHeight.value != null) {
        var h = s.cutHeight, steps = stepsOf(h, 6);
        var unit = h.unit ? ' ' + h.unit : '';
        var setTo = function (v) { return { domain: 'number', service: 'set_value', data: { value: v }, target: { entity_id: c.cutHeight } }; };
        if (steps && UI.segments) {
          out += UI.segments(steps.map(function (v) {
            return { label: fmt(v, 1) + (h.unit && steps.length <= 4 ? unit : ''), active: Math.abs(v - h.value) < 1e-6, svc: setTo(v) };
          }), 'Schnitthöhe' + (h.unit && steps.length > 4 ? ' (' + h.unit + ')' : ''));
        } else if (h.min != null && h.max != null && UI.segments) {
          // Many steps (Husqvarna 1–9, Landroid 20–60 mm, Mammotion 25–70 mm): one row − value +, not a wall of buttons.
          var lo = Math.max(h.min, Math.round((h.value - h.step) * 100) / 100), hi = Math.min(h.max, Math.round((h.value + h.step) * 100) / 100);
          out += UI.segments([
            { label: '−', svc: h.value > h.min ? setTo(lo) : null },
            { label: fmt(h.value, 1) + unit, active: true },
            { label: '+', svc: h.value < h.max ? setTo(hi) : null },
          ], 'Schnitthöhe');
        } else out += UI.group([{ entity: c.cutHeight, icon: 'mdi:arrow-expand-vertical', iconTone: 'accent', label: 'Schnitthöhe', value: fmt(h.value, 1) + unit }], 'Schnitthöhe');
      }
      var zo = c.zone && states[c.zone];
      if (zo && !bad(zo.state)) {
        var opts = Array.isArray(zo.attributes.options) ? zo.attributes.options : [];
        if (opts.length && opts.length <= 6 && UI.segments) {
          out += (out ? gap : '') + UI.segments(opts.map(function (o) {
            return { label: /^\d+$/.test(o) ? 'Zone ' + o : o, active: zo.state === o,
              svc: { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.zone } } };
          }), 'Zone');
        } else out += (out ? gap : '') + UI.group([{ entity: c.zone, icon: 'mdi:map-marker-radius-outline', iconTone: 'accent', label: 'Zone', value: zo.state }], 'Zone');
      }
      return out;
    }
    if (part === 'hist') return histHtml(UI, M.history(hass, c.mower, el), c.mower, Date.now());
    return '';
  };
})();
