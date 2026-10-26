// ── Fridge and freezer: tile + popup (24.10.2026) ────────────────────────────────
// One tile for fridges, freezers and fridge-freezers. The entities come from the shared finder
// (casoraFridgeFind in 00-finder.js: Liebherr, Home Connect in its three flavours, a generically named device);
// the Studio's fields only override what it found. Tile: the zone temperatures ("7 °C · −18 °C"), a door
// that stands open as a warning, an active special mode (SuperCool, SuperFrost, party, holiday …) as a hint,
// calm when nothing is special. Popup (left the zones with their setpoints, right modes, doors, settings): status line, 24 h chart of the zone temperatures, per zone the current
// temperature with its setpoint as pills, the modes as toggle rows, the doors with "open since", further settings.
//   window._casoraFridge.find(hass, id, variables)      → config C (ids only, serialisable) or null
//   window._casoraFridge.status(C, states)              → { zones[], doorsOpen[], modesOn[], alarms[], level, dead }
//   window._casoraFridge.of(entity, hass, states, variables) → status of the tile's fridge
//   window._casoraFridge.tileText / active / color      – tile casora_fridge
//   window._casoraFridge.popup(entity, states, hass, variables) – popup casora_popup_fridge
//   window._casoraFridge.sec(part, C, states, hass)     – live parts (hero, zones, modes, doors, more)
(function () {
  if (window._casoraFridge && typeof window._casoraFridge.popup === 'function') return;
  var F = window._casoraFridge = {};

  var COLOR = {
    calm: 'var(--casora-tone-general, var(--casora-color-teal, #4E9E95))',
    // Door open: deep orange keeps 3:1 with the white glyph (as the coffee card's warning).
    warn: 'var(--casora-color-deep-orange, #C8693F)',
    bad: 'var(--casora-color-red, #D35A4E)',
  };
  F.COLOR = COLOR;
  var OFF_PLATE = 'rgba(0,0,0,0)';
  var MINUS = '−';
  var bad = function (s) { return s == null || s === '' || s === 'unknown' || s === 'unavailable'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var isId = function (v) { return typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v); };
  var T = function (x) { return typeof window.casoraTr === 'function' ? window.casoraTr(x) : x; };
  var loc = function () { return typeof window.casoraLocale === 'function' ? window.casoraLocale() : undefined; };
  var on = function (st) { return !!(st && String(st.state).toLowerCase() === 'on'); };
  // Alarm present: binary sensor on, Home Connect enum present/confirmed (also as the last part of an enum key).
  var alarmOn = function (st) {
    if (!st || bad(st.state)) return false;
    var s = String(st.state).split('.').pop().toLowerCase();
    return s === 'on' || s === 'present' || s === 'confirmed';
  };

  // Temperature as text: "7 °C", "−18 °C", short "7°" / "−18°"; one decimal only when the value has one.
  F.fmt = function (v, unit, short) {
    if (v == null) return null;
    var d = Math.round(v) === v ? 0 : 1;
    var t = Math.abs(v).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
    if (v < 0) t = MINUS + t;
    return short ? t + '°' : t + ' ' + (unit || '°C');
  };

  // ── Config: the finder's result with the Studio's overrides ──────────────
  var blank = function (key, label) {
    return { key: key, label: label, temp: null, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null };
  };
  F.find = function (hass, id, variables) {
    var FF = window.casoraFridgeFind;
    if (!FF) return null;
    var V = variables || {};
    var c = id ? FF.find(hass, id) : null;
    // No entity (tile added without one): the first fridge of the house.
    if (!c && !id) { var every = FF.all(hass); c = every.length ? FF.find(hass, every[0].anchor) : null; }
    var C = c ? JSON.parse(JSON.stringify(c)) : null;
    var over = ['entity_zone1_temp', 'entity_zone1_set', 'entity_zone2_temp', 'entity_zone2_set', 'entity_door', 'sw_super_cool', 'sw_super_frost', 'sw_night', 'sw_party']
      .some(function (k) { return isId(V[k]); });
    if (!C && !over) return null;
    if (!C) C = { device: null, source: 'studio', how: 'studio', anchor: id || null, main: id || null, zones: [], modes: [], doors: [], alarms: [], extras: [], watch: [] };
    var S = (hass && hass.states) || {};
    var zone = function (i) {
      while (C.zones.length <= i) C.zones.push(blank(C.zones.length ? 'z' + (C.zones.length + 1) : 'single', C.zones.length ? 'Zone ' + (C.zones.length + 1) : (FF.zoneLabel || {}).single || 'Temperatur'));
      return C.zones[i];
    };
    var setZone = function (i, what, v) {
      if (!isId(v)) return;
      var z = zone(i);
      if (what === 'set') { if (v.indexOf('climate.') === 0) { z.climate = v; z.set = null; } else { z.set = v; z.climate = null; } }
      else z[what] = v;
    };
    setZone(0, 'temp', V.entity_zone1_temp); setZone(0, 'set', V.entity_zone1_set);
    setZone(1, 'temp', V.entity_zone2_temp); setZone(1, 'set', V.entity_zone2_set);
    var words = (FF.superWords || {})[C.source === 'liebherr' ? 'liebherr' : 'other'] || { cool: 'Superkühlen', frost: 'Supergefrieren' };
    var setSuper = function (kind, v) {
      if (!isId(v)) return;
      var z = C.zones.filter(function (x) { return x.supKind === kind; })[0]
        || C.zones.filter(function (x) { return !x.sup && (kind === 'frost' ? num((S[x.set] || S[x.temp] || {}).state) <= -2 : true); })[0]
        || zone(0);
      z.sup = v; z.supKind = kind; z.supLabel = words[kind];
    };
    setSuper('cool', V.sw_super_cool); setSuper('frost', V.sw_super_frost);
    var setMode = function (key, v) {
      if (!isId(v)) return;
      var info = (FF.modeInfo || {})[key] || [key, 'mdi:toggle-switch-outline'];
      var m = C.modes.filter(function (x) { return x.key === key; })[0];
      if (m) m.id = v; else C.modes.push({ key: key, id: v, label: info[0], icon: info[1] });
    };
    setMode('night', V.sw_night); setMode('party', V.sw_party);
    if (isId(V.entity_door)) {
      var z0 = zone(0);
      C.doors = C.doors.filter(function (d) { return d.id !== V.entity_door && d.zone !== z0.key; });
      z0.door = V.entity_door;
      C.doors.unshift({ id: V.entity_door, label: C.zones.length > 1 ? z0.label : 'Tür', zone: z0.key });
    }
    // Zone labels in a one-zone fridge: "Kühlteil"/"Gefrierteil" by the target, as the finder does.
    C.zones.forEach(function (z) {
      if (z.key !== 'single') return;
      var v = num(((S[z.set] || S[z.temp] || {}).state));
      var ZL = FF.zoneLabel || {};
      z.label = v == null ? (ZL.single || 'Temperatur') : (v <= -2 ? (ZL.freezer || 'Gefrierteil') : (ZL.fridge || 'Kühlteil'));
    });
    var ids = [];
    C.zones.forEach(function (z) { ids.push(z.temp, z.set, z.climate, z.sup, z.door, z.alarm, z.alarmTemp); });
    C.modes.forEach(function (m) { ids.push(m.id); });
    C.doors.forEach(function (d) { ids.push(d.id); });
    ids = ids.concat(C.extras || []);
    C.watch = ids.filter(function (x, i, a) { return isId(x) && a.indexOf(x) === i; });
    if (!C.anchor) C.anchor = C.watch[0] || null;
    if (!C.main) C.main = C.anchor;
    return C.watch.length ? C : null;
  };

  // ── State ─────────────────────────────────────────────────────────────────
  // Elapsed time since a door opened ("seit 5 Min.", "seit 2 Std.").
  var since = function (ts) {
    var t = Date.parse(ts); if (!isFinite(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'seit ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    var d = Math.round(h / 24);
    return 'seit ' + d + (d === 1 ? ' Tag' : ' Tagen');
  };
  var openSince = function (st, states) {
    if (typeof window._casoraOpenSince === 'function') { try { return window._casoraOpenSince(st, states); } catch (e) { /* core not loaded */ } }
    return st && st.last_changed;
  };
  F.status = function (C, states) {
    var S = states || {};
    var out = { zones: [], doorsOpen: [], modesOn: [], alarms: [], level: -1, dead: false, any: false };
    if (!C) { out.dead = true; return out; }
    var alive = 0, seen = 0;
    C.zones.forEach(function (z) {
      var ts = z.temp && S[z.temp], ss = z.set && S[z.set], cs = z.climate && S[z.climate];
      var a = (ts || ss || cs || {}).attributes || {};
      var unit = a.unit_of_measurement || (cs ? '°C' : '°C');
      var temp = ts && !bad(ts.state) ? num(ts.state) : (cs && cs.attributes ? num(cs.attributes.current_temperature) : null);
      var set = ss && !bad(ss.state) ? num(ss.state) : (cs && cs.attributes ? num(cs.attributes.temperature) : null);
      [ts, ss, cs].forEach(function (x) { if (x) { seen++; if (!bad(x.state)) alive++; } });
      var dz = { key: z.key, label: z.label, temp: temp, set: set, unit: unit, supOn: on(S[z.sup]), supLabel: z.supLabel,
        doorOpen: on(S[z.door]), alarm: alarmOn(S[z.alarm]), alarmTemp: alarmOn(S[z.alarmTemp]) };
      out.zones.push(dz);
      if (dz.supOn) out.modesOn.push(z.supLabel || 'Super');
      // Zone name as its own piece (" · "): the translation works per piece, a pattern would keep it German.
      if (dz.alarm) out.alarms.push({ text: 'Türalarm', zone: z.key, where: C.zones.length > 1 ? z.label : null });
      if (dz.alarmTemp) out.alarms.push({ text: 'Temperaturalarm', zone: z.key, where: C.zones.length > 1 ? z.label : null });
    });
    C.doors.forEach(function (d) {
      var st = S[d.id];
      if (!st) return;
      seen++; if (!bad(st.state)) alive++;
      if (on(st)) out.doorsOpen.push({ id: d.id, label: d.label, since: since(openSince(st, S)) });
    });
    C.modes.forEach(function (m) { if (on(S[m.id])) out.modesOn.push(m.label); });
    out.dead = seen > 0 && alive === 0;
    out.any = out.zones.some(function (z) { return z.temp != null || z.set != null; });
    out.level = out.dead ? -1 : out.alarms.length ? 2 : out.doorsOpen.length ? 1 : out.modesOn.length ? 0 : -1;
    return out;
  };
  F.of = function (entity, hass, states, variables) {
    var C = F.find(hass, entity && entity.entity_id, variables);
    return C ? F.status(C, states) : null;
  };
  // "7 °C · −18 °C" – the zones' temperatures (the setpoint when a zone has no sensor).
  F.temps = function (s, short) {
    return s.zones.map(function (z) {
      var v = z.temp != null ? z.temp : z.set;
      return v == null ? null : F.fmt(v, z.unit, short);
    }).filter(Boolean).join(' · ');
  };
  var doorText = function (s) { return s.doorsOpen.length > 1 ? s.doorsOpen.length + ' Türen offen' : 'Tür offen'; };
  // Which door, when the fridge has several zones (popup status line).
  var doorWhere = function (s) { return s.doorsOpen.length === 1 && s.doorsOpen[0].label !== 'Tür' ? s.doorsOpen[0].label : null; };
  F.tileText = function (s, narrow) {
    if (!s) return 'Nicht verfügbar';
    if (s.dead) return 'Nicht verfügbar';
    var temps = F.temps(s, !!narrow);
    if (s.alarms.length) return s.alarms[0].text;
    if (s.doorsOpen.length) return narrow || !temps ? doorText(s) : doorText(s) + ' · ' + temps;
    if (s.modesOn.length) return narrow || !temps ? s.modesOn[0] : s.modesOn[0] + ' · ' + temps;
    return temps || 'Bereit';
  };
  F.active = function (s) { return !!(s && !s.dead && (s.alarms.length || s.doorsOpen.length || s.modesOn.length)); };
  F.color = function (s) {
    if (!s || s.dead) return COLOR.calm;
    return s.alarms.length ? COLOR.bad : s.doorsOpen.length ? COLOR.warn : COLOR.calm;
  };

  // Popup header: colour and ring follow the tile's state (DP-15).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_fridge\b/.test(String(key || '')) || !src) return null;
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass) return null;
    var vars = (src._config && src._config.variables) || {};
    var s = F.of(src._stateObj || null, hass, hass.states, vars);
    return { hue: F.color(s), off: !F.active(s) };
  });
  // No main switch in the header: a fridge is never switched off from the dashboard.
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    return /\bcasora_fridge\b/.test(tpl) ? false : null;
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  F.popup = function (entity, states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var S = states || {};
    var C = F.find(hass, entity && entity.entity_id, variables);
    var call = function (part) {
      return 'return window._casoraFridge ? window._casoraFridge.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass) : "";';
    };
    if (!C) {
      var f0 = { hero: { card: K.secCard([], call('hero'), S) } };
      return K.layout({ fields: f0, top: ['hero'], left: [], right: [] });
    }
    var f = { hero: { card: K.secCard(C.watch, call('hero'), S) } };
    var top = ['hero'];
    var curves = C.zones.filter(function (z) { return z.temp && S[z.temp] && !bad(S[z.temp].state) && num(S[z.temp].state) != null; });
    if (curves.length) {
      f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history', height: 160, readout: 'own', plate: true,
        // Hex, because the chart writes the colour straight into the SVG: fridge zones teal, freezer zones blue.
        switch: false, series: curves.map(function (z) {
          var cold = num(((S[z.set] || S[z.temp] || {}).state)) <= -2;
          return { entity: z.temp, name: z.label, unit: (S[z.temp].attributes || {}).unit_of_measurement || '°C', color: cold ? '#5b8fc9' : '#4e9e95' };
        }) } };
      top.push('chart');
    }
    f.zones = { card: K.secCard(C.watch, call('zones'), S) };
    if (C.modes.length || C.zones.some(function (z) { return z.sup; })) f.modes = { card: K.secCard(C.watch, call('modes'), S) };
    if (C.doors.length) f.doors = { card: K.secCard(C.watch, call('doors'), S) };
    f.more = { card: K.secCard(C.watch, call('more'), S) };
    return K.layout({ fields: f, top: top, left: ['zones'], right: ['modes', 'doors', 'more'], narrowOrder: ['zones', 'modes', 'doors', 'more'] });
  };

  // Setpoint pills around the current target: five steps within the device's range.
  F.steps = function (cur, lo, hi, step) {
    step = step > 0 ? step : 1;
    if (cur == null) return [];
    var start = cur - 2 * step;
    if (lo != null && start < lo) start = lo;
    if (hi != null && start + 4 * step > hi) start = Math.max(lo != null ? lo : -Infinity, hi - 4 * step);
    var out = [];
    for (var i = 0; i < 5; i++) {
      var v = Math.round((start + i * step) * 100) / 100;
      if ((lo != null && v < lo) || (hi != null && v > hi)) continue;
      out.push(v);
    }
    if (out.indexOf(cur) < 0) { out.push(cur); out.sort(function (a, b) { return a - b; }); }
    return out;
  };
  var setpointRow = function (UI, z, dz, S) {
    var id = z.set || z.climate;
    var st = id && S[id];
    if (!st || bad(st.state)) return '';
    var a = st.attributes || {};
    var climate = !!z.climate;
    var cur = climate ? num(a.temperature) : num(st.state);
    if (cur == null) return '';
    var lo = num(climate ? a.min_temp : a.min), hi = num(climate ? a.max_temp : a.max), step = num(climate ? a.target_temp_step : a.step) || 1;
    var vals = F.steps(cur, lo, hi, step);
    if (vals.length < 2) return '';
    var items = vals.map(function (v) {
      return { label: F.fmt(v, dz.unit, true), active: Math.abs(v - cur) < step / 2,
        svc: climate ? { domain: 'climate', service: 'set_temperature', data: { temperature: v }, target: { entity_id: id } }
          : { domain: 'number', service: 'set_value', data: { value: v }, target: { entity_id: id } } };
    });
    return UI.segments(items, z.label + ' · Sollwert ' + F.fmt(cur, dz.unit));
  };

  F.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var S = states || {};
    if (!C) {
      return UI.line('Kein Kühlschrank gefunden', []) + (UI.note ? UI.note(T('Wähle im Studio einen Temperatursensor oder Sollwert des Kühlschranks.')) : '');
    }
    var s = F.status(C, S);
    var gap = '<div style="height:18px"></div>';
    if (part === 'hero') {
      if (s.dead) return UI.line('Nicht verfügbar', []);
      var temps = F.temps(s, false);
      if (s.alarms.length) return UI.line(s.alarms[0].text, [s.alarms[0].where, temps], { tone: 'bad' });
      if (s.doorsOpen.length) return UI.line(doorText(s), [doorWhere(s), s.doorsOpen[0].since, temps], { tone: 'warn' });
      var rest = s.modesOn.length ? s.modesOn.slice() : ['Alles in Ordnung'];
      return UI.line(temps || 'Bereit', rest);
    }
    if (part === 'zones') {
      var rows = [], pills = '';
      C.zones.forEach(function (z, i) {
        var dz = s.zones[i];
        if (!dz) return;
        var val = dz.temp != null ? F.fmt(dz.temp, dz.unit) : (dz.set != null ? F.fmt(dz.set, dz.unit) : null);
        if (val == null && !z.set && !z.climate) return;
        var sub = [];
        if (dz.temp != null && dz.set != null) sub.push('Sollwert ' + F.fmt(dz.set, dz.unit));
        if (dz.supOn) sub.push(z.supLabel || 'Super');
        var freezer = (dz.set != null ? dz.set : dz.temp) <= -2;
        rows.push({ entity: z.temp || z.set || z.climate, icon: freezer ? 'mdi:snowflake' : 'mdi:thermometer', iconTone: dz.alarm || dz.alarmTemp ? 'bad' : 'accent',
          label: z.label, sub: sub.length ? sub.join(' · ') : null, value: val || 'Unbekannt', valueTone: dz.alarmTemp ? 'bad' : null });
        pills += (pills ? gap : '') + setpointRow(UI, z, dz, S);
      });
      if (!rows.length) return '';
      return UI.group(rows, 'Temperaturen') + (pills ? gap + pills : '');
    }
    if (part === 'modes') {
      var mr = [];
      C.zones.forEach(function (z, i) {
        if (!z.sup || !S[z.sup] || bad(S[z.sup].state)) return;
        var isOn = on(S[z.sup]);
        mr.push({ icon: z.supKind === 'frost' ? 'mdi:snowflake-variant' : 'mdi:snowflake', iconTone: isOn ? 'accent' : OFF_PLATE, label: z.supLabel || 'Super',
          sub: C.zones.filter(function (x) { return x.sup; }).length > 1 || C.zones.length > 1 ? z.label : null, value: isOn ? 'An' : 'Aus', active: isOn,
          svc: { domain: 'switch', service: isOn ? 'turn_off' : 'turn_on', target: { entity_id: z.sup } } });
      });
      C.modes.forEach(function (m) {
        var st = S[m.id];
        if (!st || bad(st.state)) return;
        var isOn = on(st);
        mr.push({ icon: m.icon, iconTone: isOn ? 'accent' : OFF_PLATE, label: m.label, value: isOn ? 'An' : 'Aus', active: isOn,
          svc: { domain: m.id.split('.')[0], service: isOn ? 'turn_off' : 'turn_on', target: { entity_id: m.id } } });
      });
      return mr.length ? UI.group(mr, 'Modi') : '';
    }
    if (part === 'doors') {
      var dr = C.doors.map(function (d) {
        var st = S[d.id];
        if (!st) return null;
        if (bad(st.state)) return { entity: d.id, icon: 'mdi:door', iconTone: OFF_PLATE, label: d.label, value: 'Nicht verfügbar' };
        var open = on(st);
        var o = s.doorsOpen.filter(function (x) { return x.id === d.id; })[0];
        return { entity: d.id, icon: open ? 'mdi:door-open' : 'mdi:door-closed', iconTone: open ? 'warn' : 'good', label: d.label,
          sub: open && o && o.since ? o.since : null, value: open ? 'Geöffnet' : 'Geschlossen', valueTone: open ? 'warn' : null, active: open };
      }).filter(Boolean);
      return dr.length ? UI.group(dr, 'Türen') : '';
    }
    if (part === 'more') {
      var out = '';
      if (s.alarms.length) {
        out += UI.group(s.alarms.map(function (a) { return { icon: 'mdi:alert-outline', iconTone: 'bad', label: a.text, sub: a.where, value: 'Prüfen', valueTone: 'bad' }; }), 'Hinweise');
      }
      var xr = (C.extras || []).map(function (id) {
        var st = S[id];
        if (!st) return null;
        var a = st.attributes || {}, word;
        try { word = hass && typeof hass.formatEntityState === 'function' ? hass.formatEntityState(st) : null; } catch (e) { word = null; }
        var raw = String(st.state || '');
        if (!word || bad(raw)) word = bad(raw) ? (raw === 'unavailable' ? 'Nicht verfügbar' : 'Unbekannt') : raw === 'on' ? 'An' : raw === 'off' ? 'Aus' : raw;
        // Name without the device in front ("Testfrost Obere Zone BioFresh-Plus" → "Obere Zone BioFresh-Plus").
        var dev = C.device && hass && hass.devices && hass.devices[C.device];
        var dn = dev ? String(dev.name_by_user || dev.name || '') : '';
        var lbl = String(a.friendly_name || id);
        if (dn && lbl.toLowerCase().indexOf(dn.toLowerCase() + ' ') === 0) lbl = lbl.slice(dn.length + 1);
        return { entity: id, icon: a.icon || 'mdi:tune-variant', iconTone: 'accent', label: lbl, value: word };
      }).filter(Boolean);
      if (C.anchor && UI.settingsRow) xr.push(UI.settingsRow(C.anchor));
      if (xr.length) out += (out ? gap : '') + UI.group(xr, 'Einstellungen');
      return out;
    }
    return '';
  };
})();
