// ── Smart Heating Control: a room of the heating schedule (community card, issue #240) ──────────────────────────────
// Smart Heating Control (HACS, sandreialexandru/Smart-Heating-Control, domain advanced_climate) decides the target of
// every room by rules (safety, window, manual change, vacation, presence, schedule) and sends it to the room's own
// thermostats or valves. It has no climate entity: the tile's entity is the room's „Decision“ sensor
// (casoraShcFind in 00-finder.js), whose attributes carry everything – room and target temperature, heating, the
// level, the manual change, the schedule profiles with their days, the next change and the entity map of the room
// and the house (sensor.py DecisionSensor.extra_state_attributes).
// Tile: room temperature, target and whether it heats. Popup v3 (popup-richtlinien-v3.md §4 S2, §8): the target on
// the dial (− / + set a manual change, set_override), Automatik and the levels as moons, the Verlauf of the room
// temperature under it; right a row „Zeitplan ›“ (the week as a sub page: profiles with their days, switching the
// profile with the room's profile select, each day's slots, editing a profile's slots with set_schedule), the
// manual change, the house mode and the decision.
//   window._casoraShc.model(st)                → the room as Casora reads it (pure)
//   window._casoraShc.profileFor(days, wd)      → the active profile of a weekday (0 = Monday) in a usual week
//   window._casoraShc.daySegments(m, wd)        → [{ from, to, preset, i, profile, carried }] minutes 0…1440
//   window._casoraShc.change(slots, i, patch)   → { slots } | { error } – edit/add (i = -1)/remove (patch null)
//   window._casoraShc.tileState(st)             – tile casora_smart_heating („20,4° · Heizt auf 21°“)
//   window._casoraShc.svc.*                     → service specs (override, clear, schedule, profile)
//   window._casoraShc.popup(entity, hass, vars) – popup casora_popup_smart_heating
//   window._casoraShc.sec(part, id, states, hass, el) – live parts (hero, stage, rows, plan)
(function () {
  if (window._casoraShc && typeof window._casoraShc.popup === 'function') return;
  var S = window._casoraShc = {};
  var F = function () { return window.casoraShcFind; };
  var DOMAIN = 'advanced_climate';
  var WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  // The integration's levels (const.py PRESETS) and the frost protection of a day without an active profile.
  var PRESETS = ['home', 'sleep', 'eco', 'away', 'comfort', 'activity'];
  var LEVEL = { home: 'Zuhause', sleep: 'Schlafen', eco: 'Eco', away: 'Abwesend', comfort: 'Komfort', activity: 'Aktiv', frost: 'Frostschutz' };
  var LEVEL_ICON = { home: 'mdi:home-outline', sleep: 'mdi:weather-night', eco: 'mdi:leaf', away: 'mdi:home-export-outline',
    comfort: 'mdi:sofa-outline', activity: 'mdi:run', frost: 'mdi:snowflake' };
  // States of the Decision sensor (const.py RULES).
  var RULE = { starting: 'Startet', frost_protection: 'Frostschutz', maximum_temperature: 'Höchsttemperatur', pause: 'Pausiert',
    mode_off: 'Aus', summer: 'Sommer', out_of_season: 'Außerhalb der Heizzeit', valve_exercise: 'Ventilbewegung',
    window_open: 'Fenster offen', manual_override: 'Manuell', vacation: 'Urlaub', house_away: 'Abwesend', presence_far: 'Alle weit weg',
    presence_nearby: 'Unterwegs in der Nähe', room_unoccupied: 'Raum leer', sensor_fallback: 'Sensor ausgefallen', schedule: 'Zeitplan',
    optimal_start: 'Früher Start', optimal_stop: 'Früher Stopp', outdoor_cutoff: 'Draußen warm' };
  // Rules that keep the room from its target: the tile names the rule instead of the target.
  var HOLD = ['starting', 'frost_protection', 'pause', 'mode_off', 'summer', 'out_of_season', 'window_open', 'sensor_fallback', 'outdoor_cutoff'];
  var OFF = ['pause', 'mode_off', 'summer', 'out_of_season'];
  // The house mode (select mode, const.py MODES).
  var MODE = { auto: 'Automatik', away: 'Abwesend', vacation: 'Urlaub', off: 'Aus', summer: 'Sommer' };
  var DAYS = { all: 'Alle Tage', workday: 'Werktage', weekend: 'Wochenende' };
  // The integration's default profiles (Prüfrunde u08-06: shown as „workday“, „home_office“ before).
  var PROFILE = { workday: 'Werktag', weekend: 'Wochenende', home_office: 'Homeoffice' };
  S.WD = WD; S.LEVEL = LEVEL; S.RULE = RULE; S.MODE = MODE; S.PRESETS = PRESETS;
  // The house mode's page (the row „Modus ›“ opens the select's page, 18-ziele.js) says the row's words (Prüfrunde u08-02).
  (window._casoraOptionWords = window._casoraOptionWords || []).push(function (h, id, o) {
    var e = h && h.entities && h.entities[id];
    return e && e.platform === DOMAIN && e.translation_key === 'mode' && MODE[o] ? MODE[o] : null;
  });
  var STEP_MIN = 15;

  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  var esc = function (t) {
    if (typeof window.casoraEsc === 'function') return window.casoraEsc(t);
    if (window._casoraUI && window._casoraUI.esc) return window._casoraUI.esc(t);
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var nf = function (n, d) { return window.casoraNum ? window.casoraNum(n, 0, d == null ? 1 : d) : String(Math.round(n * 10) / 10).replace('.', ','); };
  // Steppers and the dial's foot always with one decimal (21,0), as the thermostat popup.
  var nf1 = function (n) { return window.casoraNum ? window.casoraNum(n, 1, 1) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); };
  var deg = function (n) { return n == null ? '' : nf(n) + '°'; };
  var hassNow = function () { var ha = typeof document !== 'undefined' && document.querySelector && document.querySelector('home-assistant'); return ha && ha.hass; };

  // ── Times ─────────────────────────────────────────────────────────────────
  S.mins = function (s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
    return m && +m[1] < 24 && +m[2] < 60 ? (+m[1]) * 60 + (+m[2]) : null;
  };
  S.hhmm = function (m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  };
  S.weekday = function (date) { return ((date || new Date()).getDay() + 6) % 7; };

  // ── The room from its Decision sensor ─────────────────────────────────────
  S.model = function (st) {
    var a = (st && st.attributes) || {};
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
    var m = {
      id: st ? st.entity_id : null, ok: !!st && !bad(st.state), dead: !st || st.state === 'unavailable',
      rule: st && !bad(st.state) ? String(st.state) : null,
      name: a.room_name ? String(a.room_name) : '', house: a.house_name ? String(a.house_name) : '',
      unit: String(a.temperature_unit || '°C'), cur: num(a.current_temperature), target: num(a.target_temperature),
      heating: a.heating === true, demand: a.heat_demand === true, window: a.window_open === true,
      preset: a.preset ? String(a.preset) : null, override: a.override && typeof a.override === 'object' ? a.override : null,
      profile: a.profile ? String(a.profile) : null, nextChange: a.next_change || null, nextPreset: a.next_preset || null,
      schedule: obj(a.schedule), days: obj(a.profile_days), error: a.schedule_error || null,
      levels: obj(a.levels), names: obj(a.preset_names), min: num(a.min_temperature), max: num(a.max_temperature),
      boundary: num(a.day_boundary) || 0, ents: obj(a.entities), houseEnts: obj(a.house_entities),
    };
    m.profiles = Object.keys(m.schedule);
    // A saved schedule the integration cannot read shows its default (room.py _build_schedule): saving or switching a
    // profile there would replace the user's own schedule for good, so it stays view only until it is fixed.
    m.editable = a.schedule_editable === true && !m.error;
    return m;
  };
  // A level's word: the room's own name when it has one (custom levels), else Casora's word.
  S.levelName = function (m, p) {
    var own = m && m.names && m.names[p];
    if (own && String(own).toLowerCase() !== String(p).toLowerCase()) return String(own);
    return LEVEL[p] || String(p || '');
  };
  S.levelTemp = function (m, p) { return m && m.levels ? num(m.levels[p]) : null; };
  // A profile's name for display only (services keep the key): Casora's word for the default profiles, a snake_case key
  // made readable („late_shift“ → „Late shift“), a name the user wrote as it is.
  S.profileName = function (n) {
    var k = String(n == null ? '' : n);
    if (Object.prototype.hasOwnProperty.call(PROFILE, k)) return T(PROFILE[k]);
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(k)) return k;
    var w = k.replace(/_/g, ' ');
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  S.daysWord = function (days) {
    // Each short day translated on its own: the page translates whole texts, „Mo, Mi“ is none.
    if (Array.isArray(days)) return WD.filter(function (d) { return days.indexOf(d) >= 0; }).map(function (d) { return T(SHORT[WD.indexOf(d)]); }).join(', ');
    return DAYS[days] || '';
  };

  // ── The week (pure) ───────────────────────────────────────────────────────
  // The active profile of a weekday in a usual week (schedule.py Schedule.profile_for without the calendar and the
  // holidays): a profile for that weekday, else the one of workdays (Monday–Friday) or weekend days, else all days.
  S.profileFor = function (days, wd) {
    var active = Object.keys(days || {}).filter(function (n) { return days[n] && days[n].enabled; });
    var hit = active.filter(function (n) { return Array.isArray(days[n].days) && days[n].days.indexOf(WD[wd]) >= 0; })[0];
    if (hit) return hit;
    var kind = wd < 5 ? 'workday' : 'weekend';
    return active.filter(function (n) { return days[n].days === kind; })[0] || active.filter(function (n) { return days[n].days === 'all'; })[0] || null;
  };
  // The profile of a weekday: today the one the room uses (calendar, holidays), else the usual week's.
  S.dayProfile = function (m, wd, today) {
    if (wd === today && m.profile && m.schedule[m.profile]) return m.profile;
    return S.profileFor(m.days, wd);
  };
  var slotsOf = function (m, profile) {
    var list = (m && profile && Array.isArray(m.schedule[profile])) ? m.schedule[profile] : [];
    return list.map(function (x, i) { return { preset: x && x.preset, i: i, m: S.mins(x && x.time) }; })
      .filter(function (x) { return x.m != null; }).sort(function (a, c) { return a.m - c.m; });
  };
  S.daySegments = function (m, wd, today) {
    var prof = S.dayProfile(m, wd, today);
    if (!prof) return [{ from: 0, to: 1440, preset: 'frost', i: -1, profile: null, carried: false }];
    var list = slotsOf(m, prof), out = [];
    // Before the first slot the last slot of the day before continues (schedule.py Schedule.lookup).
    if (!list.length || list[0].m > 0) {
      var prevProf = S.dayProfile(m, (wd + 6) % 7, today), prev = slotsOf(m, prevProf);
      out.push({ from: 0, to: list.length ? list[0].m : 1440, preset: prev.length ? prev[prev.length - 1].preset : 'frost', i: -1, profile: prevProf, carried: true });
    }
    list.forEach(function (x, j) {
      out.push({ from: x.m, to: j + 1 < list.length ? list[j + 1].m : 1440, preset: x.preset, i: x.i, profile: prof, carried: false });
    });
    return out;
  };

  // ── Editing a profile's slots (pure) ──────────────────────────────────────
  S.change = function (slots, i, patch) {
    var list = (Array.isArray(slots) ? slots : []).map(function (x) { return { time: String(x.time), preset: String(x.preset) }; });
    if (patch === null) { if (i >= 0 && i < list.length) list.splice(i, 1); }
    else if (i < 0) list.push({ time: String(patch.time), preset: String(patch.preset) });
    else if (i < list.length) list[i] = { time: String(patch.time != null ? patch.time : list[i].time), preset: String(patch.preset || list[i].preset) };
    // A profile needs a slot (schedule.py parse_schedule: „has no slots“).
    if (!list.length) return { error: 'empty' };
    var seen = {};
    for (var k = 0; k < list.length; k++) {
      var mm = S.mins(list[k].time);
      if (mm == null) return { error: 'time' };
      list[k].time = S.hhmm(mm);
      if (seen[list[k].time]) return { error: 'twice' };
      seen[list[k].time] = true;
    }
    list.sort(function (a, b) { return S.mins(a.time) - S.mins(b.time); });
    return { slots: list };
  };

  // ── Services (services.py, select.py) ─────────────────────────────────────
  var SV = function (k, d) { var s = F() && F().SOURCE && F().SOURCE.services; return (s && s[k]) || d; };
  S.svc = {
    // A manual change of the room: a temperature or a level for the integration's own duration.
    override: function (id, temperature) {
      return { domain: DOMAIN, service: SV('setOverride', 'set_override'), data: { entity_id: id, temperature: temperature }, target: { entity_id: id } };
    },
    level: function (id, preset) { return { domain: DOMAIN, service: SV('setOverride', 'set_override'), data: { entity_id: id, preset: preset } }; },
    clear: function (id) { return { domain: DOMAIN, service: SV('clearOverride', 'clear_override'), data: { entity_id: id } }; },
    // Replaces the profiles; without profile_days the profiles keep their days (services.py set_schedule).
    schedule: function (id, profiles) { return { domain: DOMAIN, service: SV('setSchedule', 'set_schedule'), data: { entity_id: id, profiles: profiles } }; },
    // Turns a profile on and the active ones of the same days off (select.py ProfileSelect).
    profile: function (select, name) { return { domain: 'select', service: 'select_option', data: { option: name }, target: { entity_id: select } }; },
  };

  // ── Words ─────────────────────────────────────────────────────────────────
  S.ruleWord = function (rule) { return RULE[rule] || String(rule || ''); };
  var hhmmOf = function (iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };
  // Days from today to a moment's day (0 today, 1 tomorrow …).
  var dayDiff = function (d, now) {
    var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 86400000);
  };
  // „ab 22:00“, „morgen ab 06:00“, „am Montag ab 06:00“.
  S.when = function (iso, now) {
    var d = hhmmOf(iso);
    if (!d) return '';
    now = now || new Date();
    var t = S.hhmm(d.getHours() * 60 + d.getMinutes()), days = dayDiff(d, now);
    if (days <= 0) return 'ab ' + t;
    if (days === 1) return 'morgen ab ' + t;
    return 'am ' + LONG[S.weekday(d)] + ' ab ' + t;
  };
  // „bis 14:30“, „bis morgen 06:00“, „bis Montag 06:00“.
  S.until = function (iso, now) {
    var d = hhmmOf(iso);
    if (!d) return '';
    now = now || new Date();
    var t = S.hhmm(d.getHours() * 60 + d.getMinutes()), days = dayDiff(d, now);
    if (days <= 0) return 'bis ' + t;
    if (days === 1) return 'bis morgen ' + t;
    return 'bis ' + LONG[S.weekday(d)] + ' ' + t;
  };
  S.next = function (m, now) {
    if (!m || !m.nextChange || !m.nextPreset) return '';
    return S.levelName(m, m.nextPreset) + ' ' + S.when(m.nextChange, now);
  };
  // The manual change in a few words: „bis 14:30“, „Bis zum nächsten Wechsel“; set on the device or waiting.
  S.overrideText = function (m, now) {
    var o = m && m.override;
    if (!o) return '';
    var bits = [];
    if (o.origin === 'device' || o.origin === 'room') bits.push('Am Gerät eingestellt');
    bits.push(S.until(o.until, now) || 'Bis zum nächsten Wechsel');
    if (o.applied === false || o.interrupted) bits.push('Wartet');
    return bits.join(' · ');
  };
  S.overrideLevel = function (m) {
    var o = m && m.override;
    if (!o) return '';
    if (o.preset) return S.levelName(m, o.preset);
    return o.temperature != null ? deg(num(o.temperature)) : '';
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  S.tileState = function (st) {
    if (!st) return '';
    if (st.state === 'unavailable') return 'Nicht verfügbar';
    var m = S.model(st);
    var room = m.cur != null ? deg(m.cur) + ' · ' : '';
    if (!m.ok) return room + 'Unbekannt';
    if (m.heating && m.target != null) return room + 'Heizt auf ' + deg(m.target);
    if (HOLD.indexOf(m.rule) >= 0) return room + S.ruleWord(m.rule);
    return room + (m.target != null ? 'Ziel ' + deg(m.target) : S.ruleWord(m.rule));
  };
  // Highlighted while the room heats (its heat source runs for it).
  S.active = function (st) { return !!st && !bad(st.state) && ((st.attributes || {}).heating === true); };

  // ── UI state per room (selected day, slot being edited) ───────────────────
  var ui = {}, els = {};
  var uiOf = function (id) { return ui[id] || (ui[id] = { day: null, edit: null, busy: false }); };
  var keep = function (id, el) {
    if (!el) return;
    els[id] = (els[id] || []).filter(function (w) { return w && w.isConnected; });
    if (els[id].indexOf(el) < 0) els[id].push(el);
  };
  var redraw = function (id) {
    (els[id] || []).forEach(function (w) {
      if (!w || !w.isConnected) return;
      try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* next state push */ }
    });
  };
  S._ui = uiOf;
  var notice = function (msg) {
    var ha = typeof document !== 'undefined' && document.querySelector && document.querySelector('home-assistant');
    if (!ha || typeof Event !== 'function') return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: msg };
    ha.dispatchEvent(ev);
  };
  var stepOf = function (m) { return /F/.test(m.unit) ? 1 : 0.5; };
  var limits = function (m) {
    return { lo: m.min != null ? m.min : (/F/.test(m.unit) ? 41 : 5), hi: m.max != null ? m.max : (/F/.test(m.unit) ? 86 : 30) };
  };
  // The levels from the coldest to the warmest (the editor's − / + walk through them).
  S.levelOrder = function (m) {
    return PRESETS.slice().sort(function (a, b) {
      var ta = S.levelTemp(m, a), tb = S.levelTemp(m, b);
      return (ta == null ? 99 : ta) - (tb == null ? 99 : tb) || PRESETS.indexOf(a) - PRESETS.indexOf(b);
    });
  };
  // New slot: an hour after the profile's last slot (12:00 for an empty one), the home level.
  S.draft = function (m, profile) {
    var list = slotsOf(m, profile);
    var start = list.length ? Math.min(1425, list[list.length - 1].m + 60) : 720;
    while (list.some(function (x) { return x.m === start; }) && start < 1425) start += STEP_MIN;
    return { time: S.hhmm(start), preset: 'home' };
  };

  // The slot being edited is still where it was (another device may have changed the profile since it was opened).
  S.same = function (m, e) {
    if (!m || !e || !m.schedule[e.profile]) return false;
    if (e.i < 0) return true;
    var x = m.schedule[e.profile][e.i];
    return !!x && !!e.orig && S.mins(x.time) === S.mins(e.orig.time) && String(x.preset) === e.orig.preset;
  };
  var save = function (hass, id, m, profile, i, patch) {
    var profiles = {};
    m.profiles.forEach(function (n) { profiles[n] = (m.schedule[n] || []).map(function (x) { return { time: x.time, preset: x.preset }; }); });
    if (!profiles[profile] || !S.same(m, uiOf(id).edit)) {
      uiOf(id).edit = null; redraw(id);
      notice(T('Der Zeitplan wurde inzwischen geändert, bitte noch einmal bearbeiten'));
      return Promise.resolve(false);
    }
    var r = S.change(profiles[profile], i, patch);
    if (r.error) {
      notice(T(r.error === 'twice' ? 'Zu dieser Uhrzeit gibt es schon ein Zeitfenster' : r.error === 'empty' ? 'Ein Profil braucht mindestens ein Zeitfenster' : 'Uhrzeit ungültig'));
      return Promise.resolve(false);
    }
    profiles[profile] = r.slots;
    var u = uiOf(id), s = S.svc.schedule(id, profiles);
    u.busy = true; redraw(id);
    return Promise.resolve(hass.callService(s.domain, s.service, s.data)).then(function () {
      u.busy = false; u.edit = null; redraw(id);
      return true;
    }, function (e) {
      u.busy = false; redraw(id);
      notice(T('Speichern hat nicht geklappt') + (e && e.message ? ': ' + e.message : ''));
      return false;
    });
  };

  // ── Taps: pseudo entities shc-<what>:<decision>|<arg> (casora-core's data-casora-mi hooks) ────────────────
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var mt = /^shc-(day|edit|add|step|save|del|cancel):(.*)$/.exec(String(mid || ''));
    if (!mt) return false;
    var p = mt[2].split('|'), id = p[0];
    var hass = hassNow(), u = uiOf(id);
    var st = hass && hass.states && hass.states[id];
    if (!st || u.busy) return true;
    var m = S.model(st);
    if (mt[1] === 'day') { var d = +p[1]; if (d >= 0 && d < 7) { u.day = d; u.edit = null; } redraw(id); return true; }
    if (!m.editable) return true;
    if (mt[1] === 'cancel') { u.edit = null; redraw(id); return true; }
    if (mt[1] === 'edit') {
      var x = (m.schedule[p[1]] || [])[+p[2]];
      if (x) u.edit = { profile: p[1], i: +p[2], slot: { time: S.hhmm(S.mins(x.time) || 0), preset: String(x.preset) },
        orig: { time: String(x.time), preset: String(x.preset) } };
      redraw(id);
      return true;
    }
    if (mt[1] === 'add') { if (m.schedule[p[1]]) u.edit = { profile: p[1], i: -1, slot: S.draft(m, p[1]) }; redraw(id); return true; }
    var e = u.edit;
    if (!e) return true;
    if (mt[1] === 'step') {
      var dir = p[2] === '-' ? -1 : 1;
      if (p[1] === 'start') e.slot.time = S.hhmm(Math.max(0, Math.min(1439, (S.mins(e.slot.time) || 0) + dir * STEP_MIN)));
      else if (p[1] === 'level') {
        var order = S.levelOrder(m), k = order.indexOf(e.slot.preset);
        e.slot.preset = order[Math.max(0, Math.min(order.length - 1, (k < 0 ? 0 : k) + dir))];
      }
      redraw(id);
      return true;
    }
    if (mt[1] === 'save') { save(hass, id, m, e.profile, e.i, e.slot); return true; }
    if (mt[1] === 'del' && e.i >= 0) {
      var go = function () { save(hass, id, m, e.profile, e.i, null); };
      if (!window.casoraAsk) { go(); return true; }
      var pop = window.casoraPopup && window.casoraPopup.element;
      window.casoraAsk({ title: T('Zeitfenster löschen?'), text: S.profileName(e.profile) + ' · ' + e.slot.time + ' · ' + T(S.levelName(m, e.slot.preset)), yes: T('Löschen'),
        withPopup: !!(pop && pop.hasAttribute && pop.hasAttribute('open')) }).then(function (ok) { if (ok) go(); });
      return true;
    }
    return true;
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  S.v3 = function () {
    var UI = window._casoraUI;
    if (!(UI && UI.stage && UI.soft && UI.soft() && window._casoraSoftKit)) return false;
    try { var v = localStorage.getItem('casora_popup_variant'); return !v || v === 'v3'; } catch (e) { return true; }
  };
  S.watch = function (hass, id) {
    var m = S.model(((hass && hass.states) || {})[id]);
    return [id, m.houseEnts.mode, m.ents.schedule_profile].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  };
  S.popup = function (entity, hass) {
    var K = window._casoraSoftKit;
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var St = hass.states || {}, m = S.model(St[id]);
    var u = uiOf(id);
    u.day = null; u.edit = null; u.busy = false;
    if (S.v3()) {
      var watch = S.watch(hass, id);
      var call = function (part) { return 'return window._casoraShc ? window._casoraShc.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(id) + ', states, hass, this) : "";'; };
      var f = {};
      ['hero', 'stage', 'rows'].forEach(function (k) { f[k] = { card: K.secCard(watch, call(k), St) }; });
      // The Verlauf under the dial (§7.1: 120 high, temperature orange): the room temperature the integration uses.
      var rt = m.ents.room_temperature;
      if (rt && St[rt]) {
        f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history', title: 'Raumtemperatur · 24 Std.',
          series: [{ entity: rt, name: 'Raum', unit: /F/.test(m.unit) ? '°F' : '°C', color: 'var(--casora-color-orange, #FF9F0A)' }],
          height: 120, readout: 'own', plate: true }, do_not_eval: true };
      }
      return K.layout({ fields: f, top: ['hero'], stage: 'stage', left: [], right: ['rows'], entity: id });
    }
    // Other looks: HA's rows of the room.
    var ents = [id].concat(Object.keys(m.ents).map(function (k) { return m.ents[k]; })).filter(function (x, i, a) { return St[x] && a.indexOf(x) === i; });
    return { type: 'vertical-stack', cards: [{ type: 'entities', entities: ents }] };
  };

  // The week as a sub page with ‹ (row „Zeitplan ›“): live, editable there.
  (window._casoraPages || (window._casoraPages = {}))['shc-plan'] = function (arg) {
    var K = window._casoraSoftKit, h = hassNow();
    var id = String(arg || '');
    if (!K || !h || !id || !window.casoraPopup || !window.casoraPopup.sub) return;
    var u = uiOf(id);
    u.day = null; u.edit = null; u.busy = false;
    var code = 'return window._casoraShc ? window._casoraShc.sec("plan", ' + JSON.stringify(id) + ', states, hass, this) : "";';
    window.casoraPopup.sub({ title: 'Zeitplan', content: K.layout({ fields: { p: { card: K.secCard(S.watch(h, id), code, h.states) } },
      top: [], left: ['p'], right: [] }) });
  };

  var OFF_PLATE = 'var(--casora-soft-icon-off, rgba(140,115,90,0.12))';
  var GAP = '<div style="height:18px"></div>';
  var stepCssHtml = function (Tk) {
    return '<style>'
      + '.hp-st{display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:' + esc(Tk.font) + ';'
      +   'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-stepper-radius, var(--casora-popup-row-radius, 24px));padding:12px;}'
      + '.hp-st + .hp-st{margin-top:8px;}'
      + '.hp-st-b{width:44px;height:44px;flex:none;border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;color:' + esc(Tk.ink) + ';'
      +   'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease,transform .12s ease;user-select:none;-webkit-user-select:none;}'
      + '.hp-st-b.dis{opacity:.3;cursor:default;}.hp-st-b svg{pointer-events:none;}'
      + '.hp-st-b:not(.dis):active{transform:scale(var(--casora-press-scale,.97));}'
      + '@media (hover:hover){.hp-st-b:not(.dis):hover{background:var(--casora-popup-seg-fill-hover, rgba(255,255,255,0.24));}}'
      + '.hp-st-v{text-align:center;pointer-events:none;min-width:0;}'
      + '.hp-st-v .l{font-size:13px;color:' + esc(Tk.ink2) + ';}'
      + '.hp-st-v .n{font-size:28px;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:' + esc(Tk.ink) + ';}'
      + '.hp-st-v .n span{font-size:15px;font-weight:400;color:' + esc(Tk.ink2) + ';}'
      + '</style>';
  };
  var MINUS = '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var PLUS = '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16M10 4V16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var stepperHtml = function (label, value, unit, attrHtml, disDn, disUp) {
    var btnHtml = function (svg, dir, dis) {
      return '<div role="button" class="hp-st-b' + (dis ? ' dis' : '') + '"' + (dis ? '' : attrHtml(dir)) + ' aria-label="' + esc(T(dir < 0 ? 'Weniger' : 'Mehr')) + '">' + svg + '</div>';
    };
    return '<div class="hp-st">' + btnHtml(MINUS, -1, disDn)
      + '<div class="hp-st-v"><div class="l">' + esc(T(label)) + '</div><div class="n">' + esc(value) + (unit ? '<span> ' + esc(unit) + '</span>' : '') + '</div></div>'
      + btnHtml(PLUS, 1, disUp) + '</div>';
  };
  var buttonHtml = function (text, mid, primary) {
    return '<div role="button" tabindex="0" data-casora-mi="' + esc(mid) + '" style="flex:1 1 0;min-width:0;box-sizing:border-box;min-height:44px;'
      + 'display:flex;align-items:center;justify-content:center;padding:0 16px;border-radius:999px;cursor:pointer;font-size:13px;font-weight:700;'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      + (primary ? 'color:var(--casora-soft-glyph, #fff);background:var(--casora-popup-accent, var(--casora-color-orange, #DE8A4E));'
        : 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));')
      + '">' + esc(T(text)) + '</div>';
  };

  // Week: one bar per day, each slot in the heating tone, stronger the warmer its level; frost protection stays sand.
  var barColor = function (m, preset, lo, hi) {
    if (preset === 'frost') return { c: 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', o: 1 };
    var t = S.levelTemp(m, preset);
    var f = t == null || hi <= lo ? 0.75 : (t - lo) / (hi - lo);
    return { c: 'var(--casora-color-orange, #DE8A4E)', o: Math.round((0.35 + 0.65 * Math.max(0, Math.min(1, f))) * 100) / 100 };
  };
  var weekHtml = function (UI, id, m, sel, today, date) {
    var temps = PRESETS.map(function (p) { return S.levelTemp(m, p); }).filter(function (t) { return t != null; });
    var lo = temps.length ? Math.min.apply(null, temps) : 0, hi = temps.length ? Math.max.apply(null, temps) : 0;
    var nowM = date.getHours() * 60 + date.getMinutes();
    var rowsHtml = [0, 1, 2, 3, 4, 5, 6].map(function (w) {
      var on = w === sel, segs = S.daySegments(m, w, today);
      var barHtml = segs.map(function (s) {
        var col = barColor(m, s.preset, lo, hi);
        return '<span style="position:absolute;top:0;bottom:0;left:' + esc((s.from / 14.4).toFixed(2)) + '%;width:' + esc(((s.to - s.from) / 14.4).toFixed(2)) + '%;'
          + 'background:' + esc(col.c) + ';opacity:' + esc(col.o) + ';"></span>';
      }).join('');
      // Each slot's target in its block, when the block is wide enough (2½ h).
      var tempHtml = segs.map(function (s) {
        var t = s.preset === 'frost' ? '' : deg(S.levelTemp(m, s.preset));
        if (!t || s.to - s.from < 150) return '';
        return '<span style="position:absolute;top:0;bottom:0;left:' + esc((s.from / 14.4).toFixed(2)) + '%;width:' + esc(((s.to - s.from) / 14.4).toFixed(2)) + '%;'
          + 'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden;'
          + 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));">' + esc(t) + '</span>';
      }).join('');
      var markHtml = w === today ? '<span style="position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:999px;left:calc(' + esc((nowM / 14.4).toFixed(2)) + '% - 1px);'
        + 'background:var(--casora-popup-tiles-text-primary, var(--primary-text-color));"></span>' : '';
      return '<div role="button" tabindex="0" data-casora-mi="' + esc('shc-day:' + id + '|' + w) + '" aria-label="' + esc(T(LONG[w])) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' style="display:flex;align-items:center;gap:12px;min-height:40px;padding:0 12px;border-radius:12px;cursor:pointer;'
        + (on ? 'background:var(--casora-soft-row-active, var(--casora-soft-row-fill, rgba(140,115,90,0.07)));box-shadow:var(--casora-soft-row-active-shadow, none);' : '') + '">'
        + '<span style="flex:none;width:28px;font-size:13px;font-weight:' + (w === today || on ? 800 : 600) + ';pointer-events:none;color:'
        + (on ? 'var(--casora-soft-row-active-ink, var(--casora-popup-tiles-text-primary, var(--primary-text-color)))' : 'var(--casora-soft-sub, var(--secondary-text-color))') + ';">'
        + esc(T(SHORT[w])) + '</span>'
        + '<span style="position:relative;flex:1;min-width:0;height:18px;border-radius:999px;overflow:visible;pointer-events:none;">'
        + '<span style="position:absolute;inset:0;border-radius:999px;overflow:hidden;background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));">' + barHtml + tempHtml + '</span>'
        + markHtml + '</span></div>';
    }).join('');
    var ticksHtml = '<div style="display:flex;justify-content:space-between;margin:4px 12px 0 52px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;'
      + 'color:var(--casora-soft-sub, var(--secondary-text-color));pointer-events:none;"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>';
    return UI.label(T('Woche')) + '<div class="hui-plate" style="font-family:var(--primary-font-family, system-ui);background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));'
      + 'border-radius:var(--casora-popup-row-radius, 24px);padding:8px 8px 12px;">' + rowsHtml + ticksHtml + '</div>';
  };
  var dayTitle = function (w, today) {
    if (w === today) return 'Heute';
    if ((today + 1) % 7 === w) return 'Morgen';
    return LONG[w];
  };

  // Profiles: one row each with its days; tapping an inactive one turns it on (the room's profile select).
  var profilesHtml = function (UI, m) {
    var sel = m.ents.schedule_profile;
    var rows = m.profiles.map(function (n) {
      var d = m.days[n] || {}, on = !!d.enabled, today = m.profile === n;
      var r = { icon: on ? 'mdi:calendar-check-outline' : 'mdi:calendar-blank-outline', iconTone: on ? 'accent' : OFF_PLATE, label: S.profileName(n),
        sub: [S.daysWord(d.days), today ? 'Heute' : ''].filter(Boolean).join(' · ') || null };
      if (on) { r.value = 'Aktiv'; r.active = today; }
      else if (sel && m.editable) { r.action = 'Aktivieren'; r.svc = S.svc.profile(sel, n); }
      else r.value = 'Aus';
      return r;
    });
    return rows.length ? UI.group(rows, 'Tagesprofile') : '';
  };

  var planHtml = function (UI, id, m, date) {
    var u = uiOf(id), today = S.weekday(date), sel = u.day != null ? u.day : today;
    // The page's status line (§3, lifted into the head): today's profile and the next change (Prüfrunde u08-06: the
    // head said „Gerade eben“, the Decision sensor's last change).
    var out = UI.line(m.profile ? S.profileName(m.profile) : 'Frostschutz', S.next(m, date) ? [S.next(m, date)] : []);
    var ph = profilesHtml(UI, m);
    out += ph + (ph ? GAP : '') + weekHtml(UI, id, m, sel, today, date);
    var e = u.edit;
    if (e && m.editable && m.schedule[e.profile]) {
      var Tk = UI.tokens, b = e.slot, order = S.levelOrder(m), k = order.indexOf(b.preset);
      var fieldAttrHtml = function (field) { return function (dir) { return ' data-casora-mi="' + esc('shc-step:' + id + '|' + field + '|' + (dir < 0 ? '-' : '+')) + '"'; }; };
      var t = S.levelTemp(m, b.preset);
      var html = stepCssHtml(Tk) + stepperHtml('Beginn', b.time, '', fieldAttrHtml('start'), S.mins(b.time) <= 0, S.mins(b.time) >= 1439 - STEP_MIN + 1)
        + stepperHtml('Stufe', T(S.levelName(m, b.preset)) + (t != null ? ' · ' + deg(t) : ''), '', fieldAttrHtml('level'), k <= 0, k >= order.length - 1);
      var only = (m.schedule[e.profile] || []).length <= 1;
      html += '<div style="display:flex;gap:8px;margin-top:12px;">'
        + buttonHtml('Abbrechen', 'shc-cancel:' + id) + (e.i >= 0 && !only ? buttonHtml('Löschen', 'shc-del:' + id) : '')
        + buttonHtml(u.busy ? 'Speichert …' : 'Speichern', 'shc-save:' + id, true) + '</div>';
      var dw = S.daysWord((m.days[e.profile] || {}).days);
      out += GAP + UI.label(T(e.i >= 0 ? 'Zeitfenster bearbeiten' : 'Neues Zeitfenster') + ' · ' + S.profileName(e.profile)) + html
        + (UI.note ? UI.note(T('Gilt für jeden Tag mit diesem Profil') + (dw ? ' · ' + T(dw) : '')) : '');
      return out;
    }
    var nowM = date.getHours() * 60 + date.getMinutes();
    var segs = S.daySegments(m, sel, today), prof = S.dayProfile(m, sel, today);
    var slots = segs.map(function (s) {
      var t = s.preset === 'frost' ? null : S.levelTemp(m, s.preset);
      var r = { icon: LEVEL_ICON[s.preset] || 'mdi:thermometer', iconTone: s.preset === 'frost' ? OFF_PLATE : 'accent',
        label: S.hhmm(s.from) + '–' + (s.to >= 1440 ? '24:00' : S.hhmm(s.to)), sub: s.carried ? 'Vom Vortag' : S.levelName(m, s.preset),
        value: t != null ? deg(t) : S.levelName(m, s.preset) };
      if (s.carried && s.preset !== 'frost') r.sub = 'Vom Vortag · ' + S.levelName(m, s.preset);
      if (sel === today && s.from <= nowM && nowM < s.to) r.active = true;
      if (!s.carried && s.profile && m.editable) r.entity = 'shc-edit:' + id + '|' + s.profile + '|' + s.i;
      return r;
    });
    if (prof && m.editable) slots.push({ icon: 'mdi:plus', iconTone: OFF_PLATE, label: 'Zeitfenster hinzufügen', entity: 'shc-add:' + id + '|' + prof });
    var head = dayTitle(sel, today) + (prof ? ' · ' + S.profileName(prof) : '');
    out += GAP + UI.group(slots, head);
    if (!prof) out += UI.note ? UI.note(T('Kein aktives Profil an diesem Tag: der Raum hält den Frostschutz.')) : '';
    else if (!m.editable && !m.error) out += UI.note ? UI.note(T('Der Zeitplan kommt aus einem Zeitplan-Helfer und wird dort bearbeitet.')) : '';
    if (m.error) out += UI.note ? UI.note(T('Der Zeitplan hat einen Fehler, bitte in Smart Heating Control prüfen.')) : '';
    return out;
  };

  S.sec = function (part, id, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !id) return '';
    keep(id, el);
    var St = states || (hass && hass.states) || {}, st = St[id], m = S.model(st);
    var date = new Date();
    if (part === 'hero') {
      if (!st || m.dead) return UI.line('Nicht verfügbar', [], { tone: 'bad' });
      if (!m.ok) return UI.line('Unbekannt', []);
      // The word, then the end of the manual change or the next change of the schedule (§3: never the dial's value).
      var hold = HOLD.indexOf(m.rule) >= 0 || m.rule === 'vacation' || m.rule === 'house_away' || m.rule === 'presence_far';
      var main = m.heating ? 'Heizt' : hold ? S.ruleWord(m.rule) : m.override ? 'Manuell' : 'Bereit';
      var rest = m.override ? [S.until(m.override.until, date) || 'Bis zum nächsten Wechsel'] : S.next(m, date) ? [S.next(m, date)] : [];
      return UI.line(main, rest, { tone: m.window ? 'warn' : null });
    }
    if (part === 'stage') {
      if (!st) return '';
      var L = limits(m), step = stepOf(m);
      var foot = m.cur != null ? 'Jetzt ' + nf1(m.cur) + ' ' + m.unit : null;
      var moons = function () { return S.sec('quick', id, states, hass, el); };
      // Mode off, summer, outside the season and the pause rank above a manual change (const.py RULES): no − / + there.
      var off = OFF.indexOf(m.rule) >= 0;
      if (!m.ok || m.target == null || off) {
        return UI.stage('value', { caption: 'Zielwert', label: 'Zieltemperatur', value: m.target != null ? m.target : '–', unit: m.target != null ? m.unit : '',
          state: !m.ok ? 'na' : off ? 'off' : null, foot: foot, heat: true, current: m.cur, min: L.lo, max: L.hi, moons: moons });
      }
      var pm = function (dir) {
        var v = Math.round((m.target + dir * step) * 100) / 100;
        return { svc: S.svc.override(id, v), step: step, min: L.lo, max: L.hi, dis: dir < 0 ? m.target <= L.lo : m.target >= L.hi };
      };
      return UI.stage('value', { caption: 'Zielwert', label: 'Zieltemperatur', value: m.target, unit: m.unit, minus: pm(-1), plus: pm(1), foot: foot,
        heat: true, current: m.cur, min: L.lo, max: L.hi, moons: moons });
    }
    if (part === 'quick') {
      if (!m.ok) return '';
      // Automatik ends the manual change; a level is a manual change for the integration's own duration.
      var o = m.override, items = [{ icon: 'mdi:calendar-clock', text: 'Automatik', active: !o, svc: S.svc.clear(id) }];
      ['home', 'eco', 'comfort', 'sleep', 'away', 'activity'].forEach(function (p) {
        items.push({ icon: LEVEL_ICON[p], text: S.levelName(m, p), active: !!(o && o.preset === p), svc: S.svc.level(id, p) });
      });
      return UI.quick(items, 'Stufe');
    }
    if (part === 'rows') {
      if (!st || !m.ok) return '';
      var rows = [];
      var sub = [m.profile ? S.profileName(m.profile) : '', S.next(m, date)].filter(Boolean).join(' · ');
      rows.push({ icon: 'mdi:calendar-clock', iconTone: 'accent', label: 'Zeitplan', sub: sub || null,
        value: m.profile ? null : 'Frostschutz', page: 'shc-plan|' + id });
      if (m.override) {
        rows.push({ icon: 'mdi:hand-back-right-outline', iconTone: 'warn', label: 'Manuell · ' + S.overrideLevel(m), sub: S.overrideText(m, date),
          action: 'Automatik', svc: S.svc.clear(id) });
      }
      var ms = m.houseEnts.mode && St[m.houseEnts.mode];
      if (ms && !bad(ms.state)) rows.push({ icon: 'mdi:home-switch-outline', iconTone: OFF_PLATE, label: 'Modus', value: MODE[ms.state] || ms.state, entity: m.houseEnts.mode });
      rows.push({ icon: m.window ? 'mdi:window-open-variant' : 'mdi:scale-balance', iconTone: m.window ? 'warn' : OFF_PLATE, label: 'Entscheidung',
        value: S.ruleWord(m.rule) });
      return UI.group(rows, 'Smart Heating');
    }
    if (part === 'plan') {
      if (!st || !m.ok) return UI.group([{ icon: 'mdi:calendar-clock', iconTone: OFF_PLATE, label: 'Zeitplan', sub: 'Nicht verfügbar' }], 'Zeitplan');
      return planHtml(UI, id, m, date);
    }
    return '';
  };
})();
