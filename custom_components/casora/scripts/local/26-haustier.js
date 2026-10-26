// ── Pet tracker: tile + popup (community card, card request #25) ──────────────
// One tile per Tractive device_tracker. Tractive creates two devices per pet: the tracker hardware ("Tracker <id>":
// device_tracker, battery, status, buzzer, LED, live tracking) and the pet hanging on it via via_device_id (activity
// sensors, the pet's name). Older versions had the device_tracker on the pet device, the hardware behind it; both
// layouts are read. Searched by translation_key / device class, never by entity id or name.
// Place, zones, map and history come from the person module (15-person.js), so pets read like people.
//   window._casoraPet.find(hass, id)                 → {tracker, battery, charging, state, saving, live, buzzer, led, active, rest, goal, sleepDay, sleepNight}
//   window._casoraPet.status(c, states, hass)        → {place, home, battery, charging, level, dead, live, …}
//   window._casoraPet.tileState / .active / .color   – tile casora_pet
//   window._casoraPet.popup(entity, states, hass)    – popup casora_popup_pet
//   window._casoraPet.sec(part, c, states, hass, el) – live parts of the popup (hero, info, today, hist)
(function () {
  if (window._casoraPet) return;
  var P = window._casoraPet = {};

  var COLOR = {
    away: 'var(--casora-color-sand, #9A8672)',
    warn: 'var(--casora-color-red, #D35A4E)',
    ring: 'var(--casora-color-orange, #DE8A4E)',
  };
  P.COLOR = COLOR;
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var PER = function () { return window._casoraPerson; };
  var LOW = 20;

  var STATE = {
    operational: 'Aktiv', not_reporting: 'Meldet sich nicht', inaccurate_position: 'Ungenaue Position',
    system_shutdown_user: 'Ausgeschaltet', system_startup: 'Startet',
  };

  // ── Entities of the pet and its tracker ───────────────────────────────────
  P.find = function (hass, id) {
    var c = { tracker: id, battery: null, charging: null, state: null, saving: null, live: null, buzzer: null, led: null,
      active: null, rest: null, goal: null, sleepDay: null, sleepNight: null };
    var D = window.casoraDevice;
    if (!D || !D.entities) return c;
    var dev = D.deviceOf(hass, id), devs = (hass && hass.devices) || {};
    var hw = dev && devs[dev] && devs[dev].via_device_id;
    var list = D.entities(hass, id).concat(hw ? D.entities(hass, hw, { children: false }) : []);
    var KEYS = { tracker_state: 'state', tracker_power_saving: 'saving', live_tracking: 'live', tracker_buzzer: 'buzzer',
      tracker_led: 'led', activity_time: 'active', rest_time: 'rest', daily_goal: 'goal',
      minutes_day_sleep: 'sleepDay', minutes_night_sleep: 'sleepNight' };
    list.forEach(function (x) {
      if (x.entity_id === id) return;
      var k = x.key && KEYS[x.key];
      if (k && !c[k]) c[k] = x.entity_id;
      else if (x.domain === 'sensor' && x.dc === 'battery' && !c.battery) c.battery = x.entity_id;
      else if (x.domain === 'binary_sensor' && x.dc === 'battery_charging' && !c.charging) c.charging = x.entity_id;
    });
    return c;
  };

  // ── State ─────────────────────────────────────────────────────────────────
  // level: 0 fine, 2 needs attention (battery low, tracker silent or switched off).
  P.status = function (c, states, hass) {
    var S = states || {}, st = S[c.tracker];
    var s = { place: 'Nicht verfügbar', home: false, dead: true, battery: null, charging: false, level: 0, live: false,
      state: null, stateText: null, saving: false, away: null, zone: null, accuracy: null };
    if (!st) return s;
    var a = st.attributes || {};
    var val = function (id) { return id && S[id] && !bad(S[id].state) ? S[id].state : null; };
    s.battery = num(val(c.battery));
    if (s.battery == null) s.battery = num(a.battery_level);
    s.charging = val(c.charging) === 'on';
    s.live = val(c.live) === 'on';
    s.saving = val(c.saving) === 'on';
    s.state = val(c.state);
    s.stateText = s.state ? (STATE[s.state] || s.state) : null;
    s.accuracy = num(a.gps_accuracy);
    if (bad(st.state)) { s.place = st.state === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar'; return s; }
    s.dead = false;
    s.zone = st.state;
    s.home = st.state === 'home';
    s.place = PER() ? PER().place(st.state) : st.state;
    if (!s.home && st.state === 'not_home' && PER() && hass) s.away = PER().away(hass, c.tracker);
    var silent = s.state === 'not_reporting' || s.state === 'system_shutdown_user';
    if ((s.battery != null && s.battery < LOW && !s.charging) || silent) s.level = 2;
    return s;
  };
  P.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    return P.status(P.find(hass, id), states || (hass && hass.states) || {}, hass);
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  // Highlighted while known; the circle has the colour of the place (home teal, away sand, zones like people).
  P.active = function (s) { return !!(s && !s.dead); };
  P.color = function (s) {
    if (!s) return COLOR.away;
    if (s.level === 2) return COLOR.warn;
    return PER() ? PER().zoneHue(s.zone) : COLOR.away;
  };
  // "Zuhause · 82 %", "Unterwegs · 1,4 km", "Live · Unterwegs · 1,4 km", "Akku schwach · 12 %", "Meldet sich nicht".
  P.tileState = function (s) {
    if (!s) return '';
    if (s.dead) return s.place;
    if (s.state === 'not_reporting' || s.state === 'system_shutdown_user') return s.stateText;
    var pct = s.battery != null ? Math.round(s.battery) + ' %' : null;
    if (s.level === 2 && pct) return 'Akku schwach · ' + pct;
    var tail = s.away != null && s.away > 150 && PER() ? PER().km(s.away) : pct;
    return (s.live ? 'Live · ' : '') + s.place + (tail ? ' · ' + tail : '');
  };

  // Popup header in the colour of the place (DP-15).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_pet\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = P.of(src._stateObj, ha && ha.hass);
    return { hue: P.color(s), off: s.dead };
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  P.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id || !states[id]) return empty;
    var c = P.find(hass, id);
    var watch = [c.tracker, c.battery, c.charging, c.state, c.saving, c.live, c.buzzer, c.led, c.active, c.rest, c.goal,
      c.sleepDay, c.sleepNight, 'zone.home'];
    var call = function (part) {
      return 'return window._casoraPet ? window._casoraPet.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var zones = Object.keys(states).filter(function (k) { return k.indexOf('zone.') === 0; });
    // HA's own map like the person popup: the pet and all zones, no path.
    var map = { type: 'map', hours_to_show: 0, theme_mode: 'auto', aspect_ratio: '2.4',
      entities: [{ entity: id }].concat(zones.map(function (z) { return { entity: z }; })) };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, map: { card: map },
      info: { card: K.secCard(watch, call('info'), states) }, hist: { card: K.secCard(watch, call('hist'), states) } };
    if (c.active || c.rest || c.sleepDay || c.sleepNight) f.today = { card: K.secCard(watch, call('today'), states) };
    var mapStyle = [{ 'border-radius': 'var(--casora-popup-row-radius, 26px)' }, { overflow: 'hidden' }, { 'isolation': 'isolate' },
      { background: 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))' }];
    return K.layout({ fields: f, top: ['hero', 'map'], left: ['info'], right: ['today', 'hist'],
      narrowOrder: ['today', 'info', 'hist'], fieldStyle: { map: mapStyle }, settings: c.tracker || id });
  };

  // Live tracking, sound and light as pills (Weich) or round keys; each one only if the tracker has it.
  // Tractive makes these switches unavailable while the tracker saves power (switch.py: available = not power_saving),
  // and HA skips a service call on an unavailable entity silently - such a key is shown dimmed, without an action,
  // with one line saying why (issue #25: "buttons aren't working").
  var buttons = function (s, c, UI, states) {
    var svc = function (target) { return esc(JSON.stringify({ domain: 'switch', service: 'toggle', data: {}, target: { entity_id: target } })); };
    var mdi = function (n, sz, col) { return '<ha-icon icon="' + n + '" style="--mdc-icon-size:' + sz + 'px;width:' + sz + 'px;height:' + sz + 'px;display:block;color:' + (col || 'currentColor') + ';"></ha-icon>'; };
    var S = states || {};
    var on = function (id) { var st = S[id]; return !!(st && st.state === 'on'); };
    var off = function (id) { var st = S[id]; return !st || st.state === 'unavailable'; };
    var keys = [];
    if (c.live) keys.push({ id: c.live, i: 'mdi:crosshairs-gps', l: 'Live-Tracking', on: s.live, off: off(c.live) });
    if (c.buzzer) keys.push({ id: c.buzzer, i: 'mdi:bell-ring-outline', l: 'Ton', on: on(c.buzzer), off: off(c.buzzer) });
    if (c.led) keys.push({ id: c.led, i: 'mdi:flashlight', l: 'Licht', on: on(c.led), off: off(c.led) });
    if (!keys.length) return '';
    var act = function (k) { return k.off ? ' aria-disabled="true" style="opacity:.38;cursor:default;"' : ' data-casora-svc="' + svc(k.id) + '"'; };
    var why = !keys.some(function (k) { return k.off; }) ? ''
      : '<div style="margin-top:10px;text-align:center;font-size:13px;line-height:1.35;color:' + (UI.tokens || {}).ink3 + ';font-family:' + (UI.tokens || {}).font + ';">'
        + esc(T(s.saving ? 'Energiesparen ist an: der Tracker reagiert erst wieder, wenn er unterwegs ist.'
          : 'Der Tracker ist gerade nicht erreichbar.')) + '</div>';
    var HH = window._casoraHH;
    if (HH && HH.on && HH.on()) {
      return HH.pillCss + '<style>.hh-pill > *{pointer-events:none;}</style><div class="hh-pills" style="margin-top:12px;">'
        + keys.map(function (k) {
          return '<div class="hh-pill' + (k.on ? ' pri' : '') + '"' + act(k) + '>' + mdi(k.i, 20)
            + '<span style="pointer-events:none;">' + esc(T(k.l)) + '</span></div>';
        }).join('') + '</div>' + why;
    }
    var TK = UI.tokens;
    return '<style>.hp-ctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px;color:' + TK.ink + ';font-family:' + TK.font + ';}'
      + '.hp-b{border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;flex:none;width:52px;height:52px;'
      + 'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease, transform .12s ease;user-select:none;-webkit-user-select:none;}'
      + '.hp-b > *{pointer-events:none;}.hp-b.on{background:' + TK.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
      + '.hp-b:active{transform:scale(var(--casora-press-scale,.97));}'
      + '.hp-cap{display:flex;justify-content:center;gap:22px;margin-top:6px;font-size:12px;color:' + TK.ink3 + ';font-family:' + TK.font + ';}'
      + '.hp-cap span{width:52px;display:flex;justify-content:center;white-space:nowrap;overflow:visible;}</style>'
      + '<div class="hp-ctl">' + keys.map(function (k) {
        return '<div class="hp-b' + (k.on ? ' on' : '') + '"' + act(k) + '>' + mdi(k.i, 24) + '</div>';
      }).join('') + '</div>'
      + '<div class="hp-cap">' + keys.map(function (k) { return '<span>' + esc(T(k.l)) + '</span>'; }).join('') + '</div>' + why;
  };

  // Minutes as "1 Std. 12 Min." (same wording as the person popup).
  P.mins = function (m) {
    m = Math.round(m);
    if (m < 60) return m + ' Min.';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
  };

  // Today: activity ring (minutes active against the daily goal) and rest/sleep beside it.
  var todayHtml = function (UI, c, states) {
    var S = states || {};
    var v = function (id) { return id && S[id] && !bad(S[id].state) ? num(S[id].state) : null; };
    var act = v(c.active), goal = v(c.goal), rest = v(c.rest), sd = v(c.sleepDay), sn = v(c.sleepNight);
    if (act == null && rest == null && sd == null && sn == null) return '';
    var font = 'var(--primary-font-family, system-ui)', ink = 'var(--casora-popup-tiles-text-primary, #3A322B)',
      sub = 'var(--casora-soft-sub, rgba(58,50,43,.6))', row = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))',
      dim = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))';
    var head = (UI.label ? UI.label('Heute') : '<div>Heute</div>');
    if (goal) head = head.replace(/<\/div>$/, '<div style="font-size:13px;font-weight:600;color:' + sub + ';"><span>' + esc(T('Ziel')) + '</span> <span>' + esc(T(P.mins(goal))) + '</span></div></div>');
    var r = 42, len = 2 * Math.PI * r, part = goal && act != null ? Math.min(1, act / goal) : 0;
    var ring = act == null ? '' : '<div style="position:relative;width:104px;height:104px;flex:none;">'
      + '<svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg);display:block;">'
      + '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + dim + '" stroke-width="10"/>'
      + (part > 0 ? '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + COLOR.ring + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="'
        + (len * part).toFixed(1) + ' ' + len.toFixed(1) + '"/>' : '') + '</svg>'
      + '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.1;">'
      + '<div><div style="font-size:24px;font-weight:700;color:' + ink + ';font-variant-numeric:tabular-nums;">' + Math.round(act) + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:' + sub + ';">' + esc(T('Min. aktiv')) + '</div></div></div></div>';
    var stat = function (label, m) {
      return m == null ? '' : '<div style="min-width:0;"><div style="font-size:13px;font-weight:600;color:' + sub + ';">' + esc(T(label)) + '</div>'
        + '<div style="font-size:16px;font-weight:700;color:' + ink + ';font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;">' + esc(T(P.mins(m))) + '</div></div>';
    };
    var stats = stat('Ruhe', rest) + stat('Schlaf Tag', sd) + stat('Schlaf Nacht', sn);
    /* Phone: the values one under the other – two columns beside the ring ran into each other („9 Std. 40 Min3 Std. 5 Min.“). */
    return '<style>.hpt-st{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;flex:1 1 auto;min-width:0;}'
      + '@media (max-width:480px){.hpt-st{grid-template-columns:minmax(0,1fr);gap:8px;}}</style>'
      + '<div style="font-family:' + font + '">' + head
      + '<div style="background:' + row + ';border-radius:var(--casora-popup-row-radius, 24px);padding:16px 18px;display:flex;align-items:center;gap:18px;">'
      + ring + '<div class="hpt-st">' + stats + '</div></div></div>';
  };

  P.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI, PE = PER();
    if (!UI || !c) return '';
    var s = P.status(c, states, hass), st = (states || {})[c.tracker];
    if (part === 'hero') {
      var rest = [];
      if (!s.dead && st && PE) {
        var now = Date.now(), since = Date.parse(st.last_changed) || now;
        var seg = (PE.history(hass, c.tracker, el) || [])[0];
        if (seg && seg.state === st.state && seg.start < since) since = seg.start;
        rest.push(T('seit') + ' ' + PE.when(since, now));
        if (s.away != null && s.away > 150) rest.push(PE.km(s.away) + ' ' + T('von zuhause'));
      }
      if (s.battery != null) rest.push('Akku ' + Math.round(s.battery) + ' %' + (s.charging ? ' · lädt' : ''));
      return UI.line(s.place, rest) + (s.dead ? '' : buttons(s, c, UI, states));
    }
    if (part === 'info') {
      var rows = [];
      if (s.battery != null) rows.push({ entity: c.battery || c.tracker, icon: s.charging ? 'mdi:battery-charging' : 'mdi:battery',
        iconTone: s.battery < LOW ? 'bad' : s.battery <= 30 ? 'warn' : 'good', label: 'Akku',
        sub: c.charging ? (s.charging ? 'Lädt' : 'Lädt nicht') : null, value: Math.round(s.battery) + ' %', valueTone: s.battery < LOW ? 'bad' : null });
      if (s.stateText) rows.push({ entity: c.state, icon: s.state === 'operational' ? 'mdi:check-circle-outline' : 'mdi:alert-circle-outline',
        iconTone: s.state === 'operational' ? 'accent' : 'warn', label: 'Tracker',
        sub: s.accuracy != null ? 'GPS · auf ' + Math.round(s.accuracy) + ' m genau' : null, value: s.stateText });
      if (s.saving) rows.push({ entity: c.saving, icon: 'mdi:leaf', iconTone: 'accent', label: 'Energiesparen', value: 'An' });
      return rows.length ? UI.group(rows, 'Status') : '';
    }
    if (part === 'today') return todayHtml(UI, c, states);
    if (part === 'hist') return PE && PE.lastHtml ? PE.lastHtml(UI, PE.history(hass, c.tracker, el), c.tracker, Date.now()) : '';
    return '';
  };
})();
