// ── Velair: climate tile with Velair's schedule (community card, issue #32) ─────────────────────────────────
// Velair (HACS, cgonfer/velair) plans the climate entities of other integrations. The tile is the thermostat tile
// (template casora_velair = casora_thermostat + casora_popup_velair); the popup adds what Velair knows about this
// climate: the schedule of today and the week, schedule on/off (Velair's zone pause), Manual adjustment and editing
// a day – all through Velair's own services. The schedule comes from Velair's WebSocket API via casoraVelairFind
// (00-finder.js), which also holds the source table. Without data (Velair not loaded) the popup is a plain climate popup.
//   window._casoraVelair.zone(data, id)            → the climate's schedule as Casora reads it (pure)
//   window._casoraVelair.daySegments(sched, wd)    → [{ from, to, block, i, carried }] for one weekday, minutes 0…1440
//   window._casoraVelair.at(sched, date)           → { now, next: { block, wd, start, days } } (pure)
//   window._casoraVelair.change(blocks, i, patch)  → { blocks } | { error } – edit/add (i = -1)/remove (patch null)
//   window._casoraVelair.svc.*                     → service specs (day, pause, resume, resumeAuto)
//   window._casoraVelair.popup(entity, states, hass, variables) – popup casora_popup_velair
//   window._casoraVelair.sec(part, id, states, hass, el)        – live parts (hero, ctl, plan, opts)
(function () {
  if (window._casoraVelair && typeof window._casoraVelair.popup === 'function') return;
  var V = window._casoraVelair = {};
  var F = function () { return window.casoraVelairFind; };
  var WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var SHORT = { monday: 'Mo', tuesday: 'Di', wednesday: 'Mi', thursday: 'Do', friday: 'Fr', saturday: 'Sa', sunday: 'So' };
  var LONG = { monday: 'Montag', tuesday: 'Dienstag', wednesday: 'Mittwoch', thursday: 'Donnerstag', friday: 'Freitag',
    saturday: 'Samstag', sunday: 'Sonntag' };
  var MODE = { off: 'Aus', heat: 'Heizen', cool: 'Kühlen', heat_cool: 'Heizen/Kühlen', auto: 'Automatik', dry: 'Entfeuchten',
    fan_only: 'Lüfter' };
  var MODE_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];
  var FAN = { auto: 'Auto', low: 'Niedrig', medium: 'Mittel', middle: 'Mittel', high: 'Hoch', quiet: 'Leise', silent: 'Leise',
    turbo: 'Turbo', on: 'An', off: 'Aus', focus: 'Fokus', diffuse: 'Verteilt' };
  var PRESET = { none: 'Keine', eco: 'Eco', comfort: 'Komfort', sleep: 'Schlafen', boost: 'Boost', away: 'Abwesend', home: 'Zuhause',
    activity: 'Aktiv' };
  var SWING = { off: 'Aus', on: 'An', vertical: 'Vertikal', horizontal: 'Horizontal', both: 'Beide' };
  V.WD = WD; V.SHORT = SHORT; V.LONG = LONG; V.MODE = MODE;
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
  var nf = function (n, d) { return window.casoraNum ? window.casoraNum(n, 0, d == null ? 1 : d) : String(n).replace('.', ','); };
  // Steppers always with one decimal (21,0), as the thermostat popup.
  var nf1 = function (n) { return window.casoraNum ? window.casoraNum(n, 1, 1) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); };
  var deg = function (n) { return n == null ? null : nf(n) + '°'; };
  var hassNow = function () { var ha = typeof document !== 'undefined' && document.querySelector && document.querySelector('home-assistant'); return ha && ha.hass; };

  // ── Times ─────────────────────────────────────────────────────────────────
  V.mins = function (s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
    return m ? Math.min(1439, (+m[1]) * 60 + (+m[2])) : null;
  };
  V.hhmm = function (m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  };
  V.weekday = function (date) { return WD[((date || new Date()).getDay() + 6) % 7]; };

  // ── The climate's schedule in Velair's response ───────────────────────────
  // Effective week: an active Profile that owns the zone wins (behavior schedule → its week, pause → none),
  // otherwise the zone's default week. Only the default week is what set_daily_schedule writes.
  V.zone = function (data, id) {
    if (!data || !data.zones || !id || !data.zones[id]) return null;
    var z = data.zones[id] || {}, g = data.global || {};
    var active = Array.isArray(data.active_profile_ids) ? data.active_profile_ids : (g.active_profile_ids || []);
    var profs = Array.isArray(data.profiles) ? data.profiles : [];
    var prof = null;
    active.some(function (k) {
      var p = profs.filter(function (x) { return x && x.key === k; })[0];
      if (p && p.zones && p.zones[id]) { prof = p; return true; }
      return false;
    });
    var beh = prof ? String(prof.zones[id].behavior || 'normal') : 'normal';
    var sched = beh === 'schedule' ? (prof.zones[id].schedule || {}) : beh === 'pause' ? {} : (z.schedule || {});
    var rt = (data.zone_runtime || {})[id] || {};
    var mig = !!(data.temperature_migration && data.temperature_migration.required);
    var ext = ((data.external_execution || {}).zones || {})[id];
    var st = data.settings || {};
    return {
      id: id, enabled: z.enabled !== false, schedule: sched,
      source: beh === 'schedule' ? 'profile' : beh === 'pause' ? 'profile_pause' : 'default',
      profile: prof ? String(prof.name || prof.key || '') : null,
      editable: !mig && !data.operation_recovery && beh === 'normal',
      blocked: mig ? 'migration' : data.operation_recovery ? 'recovery' : null,
      state: rt.state || null, control: rt.control_mode || 'automatic', until: rt.until || null,
      zonePaused: (rt.pause_count || 0) > 0 || (rt.state === 'paused' && beh !== 'pause' && g.mode !== 'paused'),
      globalPaused: g.mode === 'paused', globalOff: g.mode != null && g.mode !== 'auto' && g.mode !== 'paused',
      boost: rt.state === 'boost', external: !!(ext && ext.provider) || rt.state === 'externally_managed',
      unit: data.temperature_unit || '°C', min: num(st.min_temperature), max: num(st.max_temperature),
      first: WD.indexOf(st.first_weekday) >= 0 ? st.first_weekday : 'monday',
    };
  };
  V.days = function (first) {
    var i = Math.max(0, WD.indexOf(first));
    return WD.slice(i).concat(WD.slice(0, i));
  };
  var blocksOf = function (sched, wd) {
    var b = (sched && Array.isArray(sched[wd])) ? sched[wd] : [];
    return b.map(function (x, i) { return { b: x, i: i, m: V.mins(x && x.start) }; })
      .filter(function (x) { return x.m != null; }).sort(function (a, c) { return a.m - c.m; });
  };
  // The block that runs into a day: the last block of the nearest earlier day that has one (the week wraps).
  var carryInto = function (sched, wd) {
    var k = WD.indexOf(wd);
    for (var d = 1; d <= 7; d++) {
      var prev = WD[(k - d + 7) % 7], list = blocksOf(sched, prev);
      if (list.length) return list[list.length - 1].b;
    }
    return null;
  };
  // A block stays active until the next block of the week starts, across midnight and empty days (Velair's rule).
  V.daySegments = function (sched, wd) {
    var list = blocksOf(sched, wd), out = [];
    var carry = carryInto(sched, wd);
    if (carry && (!list.length || list[0].m > 0)) out.push({ from: 0, to: list.length ? list[0].m : 1440, block: carry, i: -1, carried: true });
    list.forEach(function (x, j) {
      out.push({ from: x.m, to: j + 1 < list.length ? list[j + 1].m : 1440, block: x.b, i: x.i, carried: false });
    });
    return out;
  };
  V.at = function (sched, date) {
    date = date || new Date();
    var wd = V.weekday(date), m = date.getHours() * 60 + date.getMinutes();
    var segs = V.daySegments(sched, wd);
    var now = segs.filter(function (s) { return s.from <= m && m < s.to; })[0] || null;
    var next = null;
    segs.some(function (s) { if (!s.carried && s.from > m) { next = { block: s.block, wd: wd, start: s.from, days: 0 }; return true; } return false; });
    for (var d = 1; !next && d <= 7; d++) {
      var w = WD[(WD.indexOf(wd) + d) % 7], l = blocksOf(sched, w);
      if (l.length) next = { block: l[0].b, wd: w, start: l[0].m, days: d };
    }
    return { now: now ? now.block : null, next: next };
  };

  // ── Words ─────────────────────────────────────────────────────────────────
  var range = function (b) { return b && b.target_temp_low != null && b.target_temp_high != null; };
  V.label = function (b) {
    if (!b) return '';
    var a = b.action || 'set_temperature';
    if (a === 'turn_off') return 'Aus';
    if (a === 'set_hvac_mode') return MODE[b.hvac_mode] || String(b.hvac_mode || '');
    if (a === 'set_climate_options') return b.preset_mode ? (PRESET[b.preset_mode] || String(b.preset_mode)) : 'Optionen';
    if (b.temperature != null) return deg(b.temperature);
    if (range(b)) return nf(b.target_temp_low) + '–' + nf(b.target_temp_high) + '°';
    return 'Optionen';
  };
  // Second line of a slot: the mode it switches to, when it says one.
  V.detail = function (b) {
    if (!b) return '';
    var a = b.action || 'set_temperature', bits = [];
    if (a === 'set_temperature' && b.hvac_mode && MODE[b.hvac_mode]) bits.push(MODE[b.hvac_mode]);
    if (a === 'turn_off') bits.push('Ausschalten');
    if (a === 'set_hvac_mode') bits.push('Nur Modus');
    if (b.fan_mode) bits.push('Lüfter ' + (FAN[b.fan_mode] || b.fan_mode));
    return bits.join(' · ');
  };
  V.when = function (n, now) {
    if (!n) return '';
    var t = V.hhmm(n.start);
    if (n.days === 0) return 'ab ' + t;
    if (n.days === 1) return 'morgen ab ' + t;
    return 'am ' + LONG[n.wd] + ' ab ' + t;
  };
  var hhmmOf = function (iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return null;
    return V.hhmm(d.getHours() * 60 + d.getMinutes());
  };
  // Status of the schedule in one piece ("Zeitplan pausiert", "18° ab 18:00", "Manuell eingestellt").
  V.status = function (z, date) {
    if (!z) return '';
    if (z.blocked) return 'Velair wartet auf dich';
    if (!z.enabled || z.globalOff) return 'Zeitplan aus';
    if (z.external) return 'Extern gesteuert';
    if (z.globalPaused) return 'Velair pausiert';
    if (z.source === 'profile_pause') return 'Pausiert durch ' + (z.profile || 'Profil');
    if (z.zonePaused) { var u = hhmmOf(z.until); return u ? 'Zeitplan pausiert bis ' + u : 'Zeitplan pausiert'; }
    if (z.control === 'manual') return 'Manuell eingestellt';
    if (z.boost) { var bu = hhmmOf(z.until); return bu ? 'Boost bis ' + bu : 'Boost'; }
    var a = V.at(z.schedule, date);
    if (!a.next) return a.now ? 'Zeitplan · ' + V.label(a.now) : 'Noch kein Zeitplan';
    return V.label(a.next.block) + ' ' + V.when(a.next);
  };

  // ── Editing a day (pure) ──────────────────────────────────────────────────
  var clean = function (b) {
    var o = {};
    Object.keys(b || {}).forEach(function (k) { if (b[k] != null && b[k] !== '') o[k] = b[k]; });
    return o;
  };
  V.change = function (blocks, i, patch) {
    var list = (Array.isArray(blocks) ? blocks : []).map(clean);
    if (patch === null) { if (i >= 0 && i < list.length) list.splice(i, 1); }
    else if (i < 0) list.push(clean(patch));
    else if (i < list.length) list[i] = clean(Object.assign({}, list[i], patch));
    var seen = {};
    for (var k = 0; k < list.length; k++) {
      var m = V.mins(list[k].start);
      if (m == null) return { error: 'time' };
      list[k].start = V.hhmm(m);
      if (seen[list[k].start]) return { error: 'twice' };
      seen[list[k].start] = true;
    }
    list.sort(function (a, b) { return V.mins(a.start) - V.mins(b.start); });
    return { blocks: list };
  };
  var S = F() && F().SOURCE ? F().SOURCE.services : {};
  var sv = function (k, d) { return S[k] || d; };
  V.svc = {
    day: function (id, wd, blocks) {
      return { domain: 'velair', service: sv('setDay', 'set_daily_schedule'), data: { entity_id: id, weekday: wd, blocks: blocks } };
    },
    // Like Velair's own card: pause without an end, resume removes every pause reason and applies the current block.
    pause: function (id) { return { domain: 'velair', service: sv('pause', 'pause_zone'), data: { entity_id: id, action: 'none' } }; },
    resume: function (id) {
      return { domain: 'velair', service: sv('resume', 'resume_zone'), data: { entity_id: id, apply_current_schedule: true, resume_all: true } };
    },
    resumeAuto: function (id) { return { domain: 'velair', service: sv('resumeAuto', 'resume_automatic_control'), data: { entity_id: id } }; },
  };

  // ── Climate words (as the thermostat tile) ────────────────────────────────
  V.climateText = function (st, roomTemp) {
    if (!st) return 'Nicht verfügbar';
    var mode = st.state, a = st.attributes || {};
    if (mode === 'unavailable') return 'Nicht verfügbar';
    var room = roomTemp != null ? nf(Math.round(roomTemp * 10) / 10) + '° · ' : '';
    var target = a.temperature != null ? deg(a.temperature)
      : a.target_temp_low != null && a.target_temp_high != null ? nf(a.target_temp_low) + '–' + nf(a.target_temp_high) + '°' : null;
    var act = window.casoraClimateActive ? window.casoraClimateActive(st) || {} : {};
    if (act.cooling) return room + 'Kühlt auf ' + deg(a.temperature != null ? a.temperature : a.target_temp_high);
    if (act.heating) return room + 'Heizt auf ' + deg(a.temperature != null ? a.temperature : a.target_temp_low);
    if (mode === 'cool' || mode === 'heat') return room + (target ? 'Ziel ' + target : 'Bereit');
    if (mode === 'auto' || mode === 'heat_cool') return room + (target ? 'Automatik · ' + target : 'Automatik');
    if (mode === 'dry') return room + 'Entfeuchten';
    if (mode === 'fan_only') return room + 'Nur Lüfter';
    return room + 'Aus';
  };
  var roomTemp = function (st, states, sensor) {
    var s = sensor && states[sensor];
    if (s && !bad(s.state) && num(s.state) != null) return num(s.state);
    return st ? num((st.attributes || {}).current_temperature) : null;
  };

  // ── UI state per climate (selected day, slot being edited) ─────────────────
  var ui = {}, els = {};
  var uiOf = function (id) { return ui[id] || (ui[id] = { day: null, edit: null, busy: false }); };
  var keep = function (id, el) {
    if (!el) return;
    els[id] = (els[id] || []).filter(function (w) { return w && w.isConnected; });
    if (els[id].indexOf(el) < 0) els[id].push(el);
  };
  var redraw = function (id) {
    Object.keys(els).forEach(function (k) {
      if (id && k !== id) return;
      (els[k] || []).forEach(function (w) {
        if (!w || !w.isConnected) return;
        try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* next state push */ }
      });
    });
  };
  V._redraw = redraw;
  if (F() && F().onChange) F().onChange(function () { redraw(null); });
  var notice = function (msg) {
    var ha = typeof document !== 'undefined' && document.querySelector && document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: msg };
    ha.dispatchEvent(ev);
  };
  var tempStep = function (st, z) {
    var s = num(((st && st.attributes) || {}).target_temp_step);
    return s && s > 0 ? s : (z && /F/.test(z.unit) ? 1 : 0.5);
  };
  var limits = function (st, z) {
    var a = (st && st.attributes) || {};
    var lo = z && z.min != null ? z.min : num(a.min_temp), hi = z && z.max != null ? z.max : num(a.max_temp);
    return { lo: lo != null ? lo : 5, hi: hi != null ? hi : 35 };
  };
  var dayBlocks = function (z, wd) { return (z && z.schedule && Array.isArray(z.schedule[wd])) ? z.schedule[wd] : []; };

  // New slot: an hour after the day's last block (12:00 on an empty day), the climate's target, the mode of the
  // block before it.
  V.draft = function (z, wd, st) {
    var list = blocksOf(z && z.schedule, wd);
    var start = list.length ? Math.min(1425, list[list.length - 1].m + 60) : 720;
    while (list.some(function (x) { return x.m === start; }) && start < 1425) start += STEP_MIN;
    var a = (st && st.attributes) || {};
    // Only a single-target block lends its mode (a range mode like heat_cool needs two targets).
    var prev = list.filter(function (x) { return x.m < start && (x.b.action || 'set_temperature') === 'set_temperature' && x.b.temperature != null; }).pop();
    var t = num(a.temperature);
    if (t == null && prev && prev.b.temperature != null) t = num(prev.b.temperature);
    var d = { start: V.hhmm(start), action: 'set_temperature', temperature: t != null ? t : (z && /F/.test(z.unit) ? 70 : 21) };
    if (prev && prev.b.hvac_mode) d.hvac_mode = prev.b.hvac_mode;
    return d;
  };

  var save = function (hass, id, z, wd, i, patch) {
    var r = V.change(dayBlocks(z, wd), i, patch);
    if (r.error) { notice(T(r.error === 'twice' ? 'Zu dieser Uhrzeit gibt es schon ein Zeitfenster' : 'Uhrzeit ungültig')); return Promise.resolve(false); }
    var u = uiOf(id), s = V.svc.day(id, wd, r.blocks);
    u.busy = true; redraw(id);
    return Promise.resolve(hass.callService(s.domain, s.service, s.data)).then(function () {
      u.busy = false; u.edit = null;
      if (F()) F().load(hass, true);
      redraw(id);
      return true;
    }, function (e) {
      u.busy = false; redraw(id);
      notice(T('Speichern hat nicht geklappt') + (e && e.message ? ': ' + e.message : ''));
      return false;
    });
  };

  // ── Taps: pseudo entities velair-<what>:<climate>|<arg> (casora-core's data-casora-mi hooks) ──────────────
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^velair-(day|edit|add|step|save|del|cancel|open):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    var p = m[2].split('|'), id = p[0];
    var hass = hassNow();
    if (m[1] === 'open') {
      try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* closed */ }
      history.pushState(null, '', '/velair');
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return true;
    }
    var u = uiOf(id);
    var z = V.zone(F() && F().data(), id);
    if (!hass || !z || u.busy) return true;
    var wd = u.day || V.weekday();
    var st = (hass.states || {})[id];
    if (m[1] === 'day') { if (WD.indexOf(p[1]) >= 0) { u.day = p[1]; u.edit = null; } redraw(id); return true; }
    if (!z.editable) return true;
    if (m[1] === 'cancel') { u.edit = null; redraw(id); return true; }
    if (m[1] === 'edit') {
      var b = dayBlocks(z, wd)[+p[1]];
      if (b) u.edit = { i: +p[1], wd: wd, b: clean(b) };
      redraw(id);
      return true;
    }
    if (m[1] === 'add') { u.edit = { i: -1, wd: wd, b: V.draft(z, wd, st) }; redraw(id); return true; }
    var e = u.edit;
    if (!e) return true;
    if (m[1] === 'step') {
      var dir = p[2] === '-' ? -1 : 1, L = limits(st, z), step = tempStep(st, z);
      var clamp = function (v) { return Math.round(Math.max(L.lo, Math.min(L.hi, v)) * 100) / 100; };
      if (p[1] === 'start') e.b.start = V.hhmm(Math.max(0, Math.min(1439, (V.mins(e.b.start) || 0) + dir * STEP_MIN)));
      else if (p[1] === 'temperature' && e.b.temperature != null) e.b.temperature = clamp(num(e.b.temperature) + dir * step);
      else if (p[1] === 'low' && e.b.target_temp_low != null) e.b.target_temp_low = clamp(Math.min(num(e.b.target_temp_high), num(e.b.target_temp_low) + dir * step));
      else if (p[1] === 'high' && e.b.target_temp_high != null) e.b.target_temp_high = clamp(Math.max(num(e.b.target_temp_low), num(e.b.target_temp_high) + dir * step));
      redraw(id);
      return true;
    }
    if (m[1] === 'save') { save(hass, id, z, e.wd, e.i, e.b); return true; }
    if (m[1] === 'del' && e.i >= 0) {
      var go = function () { save(hass, id, z, e.wd, e.i, null); };
      if (!window.casoraAsk) { go(); return true; }
      var pop = window.casoraPopup && window.casoraPopup.element;
      window.casoraAsk({ title: T('Zeitfenster löschen?'), text: T(LONG[e.wd]) + ' · ' + e.b.start + ' · ' + T(V.label(e.b)), yes: T('Löschen'),
        withPopup: !!(pop && pop.hasAttribute && pop.hasAttribute('open')) }).then(function (ok) { if (ok) go(); });
      return true;
    }
    return true;
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  V.watch = function (hass, id, variables) {
    var E = F() ? F().entities(hass) : { zones: [] };
    return [id, variables && variables.temp_sensor, E.auto, E.status].concat(E.zones.map(function (x) { return x.entity_id; }))
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  };
  V.popup = function (entity, states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    var id = entity && entity.entity_id;
    if (!K || !UI || !id) return empty;
    if (F()) F().load(hass);
    var u = uiOf(id);
    u.day = null; u.edit = null; u.busy = false;
    var sensor = variables && variables.temp_sensor && variables.temp_sensor !== 'None' ? variables.temp_sensor : null;
    var watch = V.watch(hass, id, { temp_sensor: sensor });
    var call = function (part) {
      return 'return window._casoraVelair ? window._casoraVelair.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(id) + ', states, hass, this, '
        + JSON.stringify(sensor) + ') : "";';
    };
    var f = {};
    // "opts", not "more": the layout would stretch a trailing "more" over both columns.
    ['hero', 'ctl', 'plan', 'opts'].forEach(function (k) { f[k] = { card: K.secCard(watch, call(k), states) }; });
    return K.layout({ fields: f, top: ['hero'], left: ['ctl'], right: ['plan', 'opts'], narrowOrder: ['ctl', 'plan', 'opts'] });
  };

  var OFF_PLATE = 'var(--casora-soft-icon-off, rgba(140,115,90,0.12))';
  var segsHtml = function (UI, label, list, cur, words, svc) {
    if (!Array.isArray(list) || list.length < 2) return '';
    return UI.segments(list.map(function (v) {
      return { label: words[v] || String(v), active: v === cur, svc: svc(v) };
    }), label);
  };
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
  var GAP = '<div style="height:18px"></div>';
  var MINUS = '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var PLUS = '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16M10 4V16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  // One stepper row; attr(dir) gives the button its tap attributes (service or pseudo entity).
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
      + (primary ? 'color:var(--casora-soft-glyph, #fff);background:var(--casora-popup-accent, var(--casora-color-teal, #4E9E95));'
        : 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));')
      + '">' + esc(T(text)) + '</div>';
  };

  // Week: one bar per day, slots in the heating/cooling tone, stronger the warmer; off stays sand.
  var barColor = function (b, lo, hi) {
    var a = (b && b.action) || 'set_temperature';
    if (a === 'turn_off') return { c: 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', o: 1 };
    var cool = b && (b.hvac_mode === 'cool');
    var c = cool ? 'var(--casora-color-blue, #5B8FC9)' : a === 'set_temperature' ? 'var(--casora-color-orange, #DE8A4E)' : 'var(--casora-color-teal, #4E9E95)';
    var t = b && b.temperature != null ? num(b.temperature) : range(b) ? (num(b.target_temp_low) + num(b.target_temp_high)) / 2 : null;
    var f = t == null || hi <= lo ? 0.75 : (cool ? (hi - t) : (t - lo)) / (hi - lo);
    return { c: c, o: Math.round((0.35 + 0.65 * Math.max(0, Math.min(1, f))) * 100) / 100 };
  };
  var weekHtml = function (UI, id, z, sel, today, date) {
    var temps = [];
    WD.forEach(function (w) { dayBlocks(z, w).forEach(function (b) { var t = num(b.temperature); if (t != null) temps.push(t); }); });
    var lo = temps.length ? Math.min.apply(null, temps) : 0, hi = temps.length ? Math.max.apply(null, temps) : 0;
    var nowM = date.getHours() * 60 + date.getMinutes();
    var rowsHtml = V.days(z.first).map(function (w) {
      var on = w === sel;
      var segs = V.daySegments(z.schedule, w);
      var barHtml = segs.map(function (s) {
        var col = barColor(s.block, lo, hi);
        return '<span style="position:absolute;top:0;bottom:0;left:' + esc((s.from / 14.4).toFixed(2)) + '%;width:' + esc(((s.to - s.from) / 14.4).toFixed(2)) + '%;'
          + 'background:' + esc(col.c) + ';opacity:' + esc(col.o) + ';"></span>';
      }).join('');
      // Each slot's target in its block (#32), when the block is wide enough (2½ h) and the word is short („21°“, „Aus“).
      var tempHtml = segs.map(function (s) {
        var t = V.label(s.block);
        if (!t || t.length > 5 || s.to - s.from < 150) return '';
        return '<span style="position:absolute;top:0;bottom:0;left:' + esc((s.from / 14.4).toFixed(2)) + '%;width:' + esc(((s.to - s.from) / 14.4).toFixed(2)) + '%;'
          + 'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden;'
          + 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));">' + esc(T(t)) + '</span>';
      }).join('');
      var markHtml = w === today ? '<span style="position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:999px;left:calc(' + esc((nowM / 14.4).toFixed(2)) + '% - 1px);'
        + 'background:var(--casora-popup-tiles-text-primary, var(--primary-text-color));"></span>' : '';
      return '<div role="button" tabindex="0" data-casora-mi="' + esc('velair-day:' + id + '|' + w) + '" aria-label="' + esc(T(LONG[w])) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
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
    if (WD[(WD.indexOf(today) + 1) % 7] === w) return 'Morgen';
    return LONG[w];
  };
  var slotIcon = function (b) {
    var a = (b && b.action) || 'set_temperature';
    if (a === 'turn_off') return 'mdi:power';
    if (a === 'set_hvac_mode') return 'mdi:swap-horizontal';
    if (a === 'set_climate_options') return 'mdi:tune-variant';
    return b && b.hvac_mode === 'cool' ? 'mdi:snowflake' : 'mdi:thermometer';
  };

  var planHtml = function (UI, id, z, st, hass, date) {
    var u = uiOf(id), today = V.weekday(date), sel = u.day || today, E = F().entities(hass);
    // Schedule on/off = Velair's zone pause (what Velair's card does).
    var on = z.enabled && !z.globalOff && !z.zonePaused && z.source !== 'profile_pause';
    var head = { icon: 'mdi:calendar-clock', iconTone: on ? 'accent' : OFF_PLATE, label: 'Zeitplan', sub: V.status(z, date), active: on,
      value: on ? 'An' : 'Aus' };
    if (z.enabled && !z.globalOff && !z.blocked && z.source !== 'profile_pause' && !z.external) head.svc = on ? V.svc.pause(id) : V.svc.resume(id);
    var rows = [head];
    if (z.globalPaused && E.auto) {
      rows.push({ icon: 'mdi:pause-circle-outline', iconTone: 'warn', label: 'Velair pausiert', sub: 'Alle Zeitpläne warten', action: 'Fortsetzen',
        svc: { domain: 'switch', service: 'turn_on', target: { entity_id: E.auto } } });
    }
    if (z.control === 'manual' && !z.external) {
      rows.push({ icon: 'mdi:hand-back-right-outline', iconTone: 'warn', label: 'Manuell eingestellt', sub: 'Der Zeitplan wartet, bis du fortsetzt',
        action: 'Fortsetzen', svc: V.svc.resumeAuto(id) });
    }
    // Velair's global mode (select „Mode“: Default, Nacht, Urlaub …, #32): which week runs and why; a tap chooses another.
    var ms = E.mode && hass && hass.states[E.mode];
    if (ms && !bad(ms.state)) rows.push({ icon: 'mdi:home-switch-outline', iconTone: OFF_PLATE, label: 'Velair-Modus', value: ms.state, entity: E.mode });
    var out = UI.group(rows, 'Zeitplan');
    out += GAP + weekHtml(UI, id, z, sel, today, date);
    var e = u.edit && u.edit.wd === sel ? u.edit : null;
    if (e && z.editable) {
      var Tk = UI.tokens, b = e.b, L = limits(st, z), step = tempStep(st, z);
      var fieldAttrHtml = function (field) { return function (dir) { return ' data-casora-mi="' + esc('velair-step:' + id + '|' + field + '|' + (dir < 0 ? '-' : '+')) + '"'; }; };
      var html = stepCssHtml(Tk) + stepperHtml('Beginn', b.start, '', fieldAttrHtml('start'), V.mins(b.start) <= 0, V.mins(b.start) >= 1439 - STEP_MIN + 1);
      var a = b.action || 'set_temperature';
      if (a === 'set_temperature' && b.temperature != null) {
        html += stepperHtml('Temperatur', nf1(num(b.temperature)), String(z.unit || '°C'), fieldAttrHtml('temperature'), num(b.temperature) <= L.lo, num(b.temperature) >= L.hi);
      } else if (a === 'set_temperature' && range(b)) {
        html += stepperHtml('Unten', nf1(num(b.target_temp_low)), '°', fieldAttrHtml('low'), num(b.target_temp_low) <= L.lo, num(b.target_temp_low) + step > num(b.target_temp_high))
          + stepperHtml('Oben', nf1(num(b.target_temp_high)), '°', fieldAttrHtml('high'), num(b.target_temp_high) - step < num(b.target_temp_low), num(b.target_temp_high) >= L.hi);
      } else {
        html += UI.group([{ icon: slotIcon(b), iconTone: 'accent', label: V.label(b), sub: V.detail(b) || null }]);
      }
      html += '<div style="display:flex;gap:8px;margin-top:12px;">'
        + buttonHtml('Abbrechen', 'velair-cancel:' + id) + (e.i >= 0 ? buttonHtml('Löschen', 'velair-del:' + id) : '')
        + buttonHtml(u.busy ? 'Speichert …' : 'Speichern', 'velair-save:' + id, true) + '</div>';
      out += GAP + UI.label(T(e.i >= 0 ? 'Zeitfenster bearbeiten' : 'Neues Zeitfenster') + ' · ' + T(LONG[sel])) + html;
      return out;
    }
    var segsOf = V.daySegments(z.schedule, sel);
    var slots = segsOf.map(function (s) {
      var r = { icon: slotIcon(s.block), iconTone: (s.block.action || '') === 'turn_off' ? OFF_PLATE : 'accent',
        label: V.hhmm(s.from) + '–' + (s.to >= 1440 ? '24:00' : V.hhmm(s.to)), sub: s.carried ? 'Vom Vortag' : (V.detail(s.block) || null),
        value: V.label(s.block) };
      var nowM = date.getHours() * 60 + date.getMinutes();
      if (sel === today && s.from <= nowM && nowM < s.to) r.active = true;
      if (!s.carried && z.editable) r.entity = 'velair-edit:' + id + '|' + s.i;
      return r;
    });
    if (!slots.length) slots.push({ icon: 'mdi:calendar-blank-outline', iconTone: OFF_PLATE, label: 'Noch kein Zeitplan', sub: 'Lege das erste Zeitfenster an' });
    if (z.editable) slots.push({ icon: 'mdi:plus', iconTone: OFF_PLATE, label: 'Zeitfenster hinzufügen', entity: 'velair-add:' + id });
    out += GAP + UI.group(slots, dayTitle(sel, today));
    if (!z.editable) {
      var why = z.blocked ? 'Velair braucht eine Bestätigung im Velair-Panel.'
        : z.source === 'profile' ? 'Ein Profil ist aktiv – bearbeiten im Velair-Panel.' : 'Ein Profil pausiert diesen Zeitplan.';
      out += UI.note ? UI.note(T(why)) : '';
    }
    return out;
  };

  V.sec = function (part, id, states, hass, el, sensor) {
    var UI = window._casoraUI;
    if (!UI || !id) return '';
    keep(id, el);
    var S0 = states || {}, st = S0[id];
    var data = F() ? F().data() : null;
    var z = V.zone(data, id);
    var date = new Date();
    if (part === 'hero') {
      var main = V.climateText(st, roomTemp(st, S0, sensor));
      var rest = z ? [V.status(z, date)] : [];
      return UI.line(main, rest, { tone: st && st.state === 'unavailable' ? 'bad' : null });
    }
    if (part === 'ctl') {
      if (!st || bad(st.state)) return '';
      var a = st.attributes || {}, ctlHtml = '';
      var tgt = { entity_id: id };
      var modes = (a.hvac_modes || []).filter(function (m) { return MODE[m]; })
        .sort(function (x, y) { return MODE_ORDER.indexOf(x) - MODE_ORDER.indexOf(y); });
      var modeSvc = function (m) { return { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: m }, target: tgt }; };
      // More than four modes (air conditioners): two even rows instead of cut words ("Entfeuchten").
      if (modes.length > 4) {
        var half = Math.ceil(modes.length / 2);
        ctlHtml += segsHtml(UI, 'Modus', modes.slice(0, half), st.state, MODE, modeSvc)
          + '<div style="height:8px"></div>' + segsHtml(UI, '', modes.slice(half), st.state, MODE, modeSvc);
      } else ctlHtml += segsHtml(UI, 'Modus', modes, st.state, MODE, modeSvc);
      if (st.state !== 'off') {
        var Tk = UI.tokens, L = limits(st, null), step = tempStep(st, z);
        var t = num(a.temperature);
        if (t != null) {
          var stepAttrHtml = function (dir) {
            var v = Math.round((t + dir * step) * 100) / 100;
            return ' data-casora-svc="' + esc(JSON.stringify({ domain: 'climate', service: 'set_temperature', data: { temperature: v }, target: tgt })) + '"'
              + ' data-casora-step="' + (dir * step) + '" data-casora-min="' + esc(L.lo) + '" data-casora-max="' + esc(L.hi) + '"';
          };
          ctlHtml += (ctlHtml ? GAP : '') + stepCssHtml(Tk) + stepperHtml('Zieltemperatur', nf1(t), String((z && z.unit) || a.temperature_unit || '°C'), stepAttrHtml, t <= L.lo, t >= L.hi);
        } else if (num(a.target_temp_low) != null && num(a.target_temp_high) != null) {
          var lo = num(a.target_temp_low), hi = num(a.target_temp_high);
          var rangeAttrHtml = function (which) {
            return function (dir) {
              var nlo = which === 'low' ? Math.round((lo + dir * step) * 100) / 100 : lo, nhi = which === 'high' ? Math.round((hi + dir * step) * 100) / 100 : hi;
              return ' data-casora-svc="' + esc(JSON.stringify({ domain: 'climate', service: 'set_temperature', data: { target_temp_low: nlo, target_temp_high: nhi }, target: tgt })) + '"';
            };
          };
          ctlHtml += (ctlHtml ? GAP : '') + stepCssHtml(Tk) + stepperHtml('Unten', nf1(lo), '°', rangeAttrHtml('low'), lo <= L.lo, lo + step > hi)
            + stepperHtml('Oben', nf1(hi), '°', rangeAttrHtml('high'), hi - step < lo, hi >= L.hi);
        }
        var fan = segsHtml(UI, 'Lüfter', a.fan_modes, a.fan_mode, FAN, function (v) { return { domain: 'climate', service: 'set_fan_mode', data: { fan_mode: v }, target: tgt }; });
        var pre = segsHtml(UI, 'Voreinstellung', a.preset_modes, a.preset_mode, PRESET, function (v) { return { domain: 'climate', service: 'set_preset_mode', data: { preset_mode: v }, target: tgt }; });
        var sw = segsHtml(UI, 'Lamellen', a.swing_modes, a.swing_mode, SWING, function (v) { return { domain: 'climate', service: 'set_swing_mode', data: { swing_mode: v }, target: tgt }; });
        [fan, pre, sw].forEach(function (partHtml) { if (partHtml) ctlHtml += (ctlHtml ? GAP : '') + partHtml; });
      }
      return ctlHtml ? '<style>ha-card.disabled{pointer-events:auto!important;}</style>' + ctlHtml : '';
    }
    if (part === 'plan') {
      if (!z) {
        // Velair answers nothing (yet) for this climate – a quiet line instead of an empty area.
        return UI.group([{ icon: 'mdi:calendar-clock', iconTone: OFF_PLATE, label: 'Zeitplan',
          sub: data ? 'Velair plant dieses Gerät nicht' : 'Velair lädt …' }], 'Zeitplan');
      }
      return planHtml(UI, id, z, st, hass, date);
    }
    if (part === 'opts') {
      var rows = [];
      // Blueprint v2: the Velair panel leaves Casora (↗ row); „Weitere Einstellungen“ is the last row (rule 8).
      if (F() && F().present(hass)) rows.push({ icon: 'mdi:calendar-edit', label: 'Im Velair-Panel öffnen', sub: 'Profile, Modi und Vorlagen', entity: 'velair-open:' + id, out: true });
      return UI.settings(id, rows);
    }
    return '';
  };
})();
