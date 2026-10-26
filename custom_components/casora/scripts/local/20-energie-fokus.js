// ── Energy: a popup of its own per sub-badge (15.10.2026) ─────────────────────
// The energy row's sub-badges (solar, battery, house, grid, state of charge) all opened the
// same plain popup or the big house popup. Now Casora detects the badge's kind and builds a
// popup for just that part, from the big energy popup's pieces (chart, energy flow, controls,
// consumers).
//   detect(hass, V, n) – kind of the n-th sub-badge: 'solar' | 'battery' | 'home' | 'grid' | null
//                         (Studio field energy_popup_focus_n, else HA's energy settings, the
//                         integration's key, device class/unit and last the name).
//   peers(hass, V)     – entities of the whole system from all of the room's sub-badges, filled
//                         in from HA's energy settings (one sensor per role) and Anker Solix keys.
//   build(ctx)         – the finished ui card; called from casora_popup_energy (energy_focus set).
// Live like the Weich energy popup: hero and flow as cards of their own with triggers_update,
// rows with power only by swapping their text (liveAttr), so nothing is redrawn.
(function () {
  if (window._casoraEnergyFocus) return;

  var FOCI = ['solar', 'battery', 'home', 'grid'];
  // Colours from the theme (design rules § 5): the same tones as the energy flow (FLOW_COL) and the
  // popup head (ring hook below).
  var COL = { solar: 'var(--casora-color-yellow, #E8B04A)', battery: 'var(--casora-color-blue, #5B8FC9)',
    home: 'var(--casora-color-teal, #4E9E95)', grid: 'var(--casora-color-red, #D35A4E)', green: 'var(--casora-color-green, #6AAE78)',
    warm: 'var(--casora-color-orange, #DE8A4E)' };
  // Keys (translation_key) of known integrations; Anker Solix first.
  var TK = {
    input_power: 'solar', solarbank_input_power: 'solar', solar_power_1: 'solar', solar_power_2: 'solar',
    solar_power_3: 'solar', solar_power_4: 'solar',
    battery_power_signed: 'battery', solarbank_battery_power_signed: 'battery', bat_charge_power: 'battery',
    bat_discharge_power: 'battery', state_of_charge: 'battery', battery_energy: 'battery',
    home_load_power: 'home', ac_to_home_load: 'home',
    grid_power_signed: 'grid', grid_to_home_power: 'grid', grid_export_power: 'grid',
  };
  // Names only as the last fallback and only whole words: a network cabinet, a home server or a
  // fridge's consumption are no part of the system.
  var NAMES = [[/\b(solar|solarleistung|solaranlage|solarstrom|pv|pv-anlage|photovoltaik)\b/i, 'solar'],
    [/\b(akku|akkustand|akkuleistung|batterie|batteriespeicher|stromspeicher|battery|ladestand|soc)\b/i, 'battery'],
    [/\b(netz|netzbezug|netzleistung|netzeinspeisung|grid|einspeisung|smart ?meter|smartmeter)\b/i, 'grid'],
    // Electricity meter, also in an entity ID without umlaut (sensor.stromzahler_…).
    [/(^|[^a-zäöü])stromz(ä|ae|a)hler/i, 'grid'],
    [/\b(haus|hausbedarf|hausverbrauch|house|home)\b/i, 'home']];
  var NOT_HOME = /\bhome\s*office\b/i;

  var num = function (states, id) {
    if (!id || !states[id]) return null;
    var n = parseFloat(states[id].state);
    return isNaN(n) ? null : n;
  };
  var watt = function (states, id) {
    var n = num(states, id); if (n == null) return null;
    var u = (states[id].attributes || {}).unit_of_measurement;
    return u === 'kW' ? n * 1000 : u === 'MW' ? n * 1e6 : u === 'mW' ? n / 1000 : n;
  };
  var unit = function (states, id) { return String(((states[id] || {}).attributes || {}).unit_of_measurement || ''); };
  var isPower = function (states, id) {
    var a = (states[id] || {}).attributes || {};
    return !!states[id] && (a.device_class === 'power' || /^[mkMG]?W$/.test(String(a.unit_of_measurement || '')));
  };
  var isPct = function (states, id) {
    var a = (states[id] || {}).attributes || {};
    return !!states[id] && (a.device_class === 'battery' || a.unit_of_measurement === '%');
  };
  var LANG = function (hass) { return (hass && hass.locale && hass.locale.language) || 'de'; };
  var fN = function (v, hass) { return v == null ? '—' : (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(LANG(hass)); };
  var fW = function (v, hass) {
    return v == null ? '—' : (Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10).toLocaleString(LANG(hass)) + ' kW' : Math.round(v) + ' W');
  };
  var kwh = function (states, id, hass) {
    var v = num(states, id); if (v == null) return null;
    var u = unit(states, id);
    if (u === 'Wh') v /= 1000; else if (u === 'MWh') v *= 1000;
    return fN(v, hass) + ' kWh';
  };
  var money = function (states, id, hass) {
    var v = num(states, id); if (v == null) return null;
    var cur = unit(states, id) || '€';
    var s = v.toLocaleString(LANG(hass), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cur === '$' ? '$' + s : s + ' ' + cur;
  };
  var both = function (a, b) { return a && b ? a + ' · ' + b : (a || b || null); };
  var key = function (hass, platform, k, domain) {
    return window.casoraDevice && window.casoraDevice.byKey ? window.casoraDevice.byKey(hass, platform, k, domain) : null;
  };

  // HA's energy settings (export meter and the like): the shared cached load (window.casoraEnergyPrefs, 00-finder.js).
  var prefsOf = function (hass) { return window.casoraEnergyPrefs ? window.casoraEnergyPrefs(hass) : null; };
  var gridPref = function (prefs, k) {
    var src = ((prefs && prefs.energy_sources) || []).filter(function (s) { return s && s.type === 'grid'; })[0];
    if (!src) return null;
    // Legacy format: flow_from/flow_to as lists; newer: right on the entry.
    if (src[k]) return src[k];
    var list = k === 'stat_energy_to' ? src.flow_to : src.flow_from;
    return (list && list[0] && list[0][k]) || null;
  };

  // Studio field remembered per entity, so the popup head (casoraRingUrl) knows the simple popup.
  var OVR = {};
  function detect(hass, V, n) {
    V = V || {};
    var o = V['energy_popup_focus_' + n];
    var id = V['energy_entity_' + n];
    if (id) { if (o) OVR[id] = o; else delete OVR[id]; }
    if (o === 'simple') return null;
    if (FOCI.indexOf(o) > -1) return o;
    var states = (hass && hass.states) || {};
    if (!id || !states[id]) return null;
    // #44: a power sensor of HA's energy settings has its role there, before keys and names.
    var pw = window.casoraEnergyPowers ? window.casoraEnergyPowers(hass) : null;
    var role = pw && ['grid', 'solar', 'battery'].filter(function (r) { return pw[r].indexOf(id) > -1; })[0];
    if (role) return role;
    var reg = ((hass && hass.entities) || {})[id];
    if (reg && TK[reg.translation_key]) return TK[reg.translation_key];
    // #44: SMA calls the inverter's output grid_power (no translation_key): that is the solar power,
    // the SMA energy meter's metering_power is the grid.
    if (reg && reg.platform === 'sma') {
      var sl = id + ' ' + ((states[id].attributes || {}).friendly_name || '');
      if (/metering.?power/i.test(sl)) return 'grid';
      if (/grid.?power|pv.?power/i.test(sl)) return 'solar';
    }
    var a = states[id].attributes || {};
    if (a.device_class === 'battery' || (a.unit_of_measurement === '%' && /akku|batter|lade|soc/i.test(id + ' ' + (a.friendly_name || '')))) return 'battery';
    if (!isPower(states, id) && !isPct(states, id)) return null; /* cost/kWh badges are no part of the system */
    var txt = [V['energy_label_' + n], V['energy_popup_name_' + n], a.friendly_name, id].filter(Boolean).join(' ');
    for (var i = 0; i < NAMES.length; i++) if (NAMES[i][0].test(txt) && !(NAMES[i][1] === 'home' && NOT_HOME.test(txt))) return NAMES[i][1];
    return null;
  }

  function peers(hass, V) {
    V = V || {};
    var states = (hass && hass.states) || {};
    var prefs = prefsOf(hass);
    var P = { solar: {}, battery: {}, home: {}, grid: {} };
    for (var n = 1; n <= 6; n++) {
      var id = V['energy_entity_' + n];
      if (!id) continue;
      var f = detect(hass, V, n);
      if (!f) continue;
      var p = P[f];
      var pw = V['energy_popup_power_' + n] || (isPower(states, id) ? id : null);
      if (pw && !p.power) p.power = pw;
      if (f === 'battery' && isPct(states, id) && !p.soc) p.soc = id;
      ['today', 'month', 'cost_today', 'cost_month'].forEach(function (k) {
        var v = V['energy_popup_' + k + '_' + n];
        var kk = k.replace('_t', 'T').replace('_m', 'M');
        if (v && !p[kk]) p[kk] = v;
      });
    }
    // House: the room's values; grid: the room's costs (only power from the grid costs money).
    P.home.power = P.home.power || V.energy_home_power_entity || V.energy_power_entity || key(hass, 'anker_solix', 'home_load_power', 'sensor');
    P.home.today = P.home.today || V.energy_usage_today || null;
    P.home.month = P.home.month || V.energy_usage_month || null;
    P.home.costToday = P.home.costToday || V.energy_cost_today || null;
    P.home.costMonth = P.home.costMonth || V.energy_cost_month || null;
    P.grid.costToday = P.grid.costToday || V.energy_cost_today || null;
    P.grid.costMonth = P.grid.costMonth || V.energy_cost_month || null;
    // HA's energy settings (00-finder.js) for a role no sub-badge names; badges and Studio fields above win.
    // Only a role with exactly one sensor: of two inverters, one alone would show half the solar power.
    var pw = window.casoraEnergyPowers ? window.casoraEnergyPowers(hass) : null;
    if (pw) ['grid', 'solar', 'battery'].forEach(function (r) { if (!P[r].power && pw[r].length === 1) P[r].power = pw[r][0]; });
    // Anker Solix keys only as the fallback: a role HA's energy settings name stays theirs (also with two sensors).
    var anker = function (r, k2) { return pw && pw[r].length ? null : key(hass, 'anker_solix', k2, 'sensor'); };
    P.solar.power = P.solar.power || anker('solar', 'input_power');
    P.battery.power = P.battery.power || anker('battery', 'battery_power_signed');
    // #44: the charge level from the battery power sensor's device (or id stem) when no sub-badge names one.
    if (!P.battery.soc && P.battery.power && window.casoraEnergyBatterySoc) P.battery.soc = window.casoraEnergyBatterySoc(hass, P.battery.power);
    P.battery.soc = P.battery.soc || anker('battery', 'state_of_charge');
    P.grid.power = P.grid.power || anker('grid', 'grid_power_signed');
    P.grid.exportTotal = gridPref(prefs, 'stat_energy_to');
    return P;
  }

  // All entities a popup needs, in one object (goes into the live cards as JSON).
  function model(hass, focus, P, self) {
    var k = function (key2, domain) { return key(hass, 'anker_solix', key2, domain || 'sensor'); };
    // The badge's own sensor is the main value (two solar badges do not both show the first).
    var S0 = (hass && hass.states) || {};
    if (self && S0[self]) {
      P = JSON.parse(JSON.stringify(P));
      if (focus === 'solar' && isPower(S0, self)) P.solar.power = self;
      if (focus === 'home' && isPower(S0, self)) P.home.power = self;
      if (focus === 'battery') { if (isPct(S0, self)) P.battery.soc = self; else if (isPower(S0, self)) P.battery.power = self; }
    }
    // Solar and battery sensors of HA's energy settings: unavailable at night is an inverter asleep, so 0 W.
    var pw = window.casoraEnergyPowers ? window.casoraEnergyPowers(hass) : null;
    // The Anker Solix battery details only when HA's energy settings name no battery (they would be another device's).
    var kb = function (key2) { return pw && pw.battery.length ? null : k(key2); };
    return {
      focus: focus, self: self || null, asleep: pw ? pw.solar.concat(pw.battery) : [],
      // HA's battery power is positive while discharging; the hero reads positive as charging (Anker): flip it.
      battSign: pw && P.battery.power && pw.battery.indexOf(P.battery.power) > -1 ? -1 : 1,
      solar: P.solar.power || null, solarToday: P.solar.today || null, solarMonth: P.solar.month || null,
      soc: P.battery.soc || null, batt: P.battery.power || null, battToday: P.battery.today || null, battMonth: P.battery.month || null,
      home: P.home.power || null, today: P.home.today || null, month: P.home.month || null,
      costToday: P.home.costToday || null, costMonth: P.home.costMonth || null,
      grid: (focus === 'grid' && self) || P.grid.power || null, gridToday: P.grid.today || null, gridMonth: P.grid.month || null,
      gridCostToday: P.grid.costToday || null, gridCostMonth: P.grid.costMonth || null, exportTotal: P.grid.exportTotal || null,
      charge: kb('bat_charge_power'), discharge: kb('bat_discharge_power'), output: k('ac_to_home_load'),
      state: kb('charging_status_desc'), energy: kb('battery_energy'), capacity: k('battery_capacity', 'number'),
      temp: k('temperature'), savings: k('total_saved_money'),
      pv: ['solar_power_1', 'solar_power_2', 'solar_power_3', 'solar_power_4'].map(function (x) { return k(x); }).filter(Boolean),
      exportSwitch: k('allow_grid_export', 'switch'), socMin: k('min_soc', 'number'), socMax: k('max_soc', 'number'),
    };
  }

  var STATE = {
    detection: 'Erkennung', protection_charge: 'Schutzladung', bypass: 'Bypass',
    bypass_discharge: 'Bypass und Entladen', discharge: 'Entlädt', charge: 'Lädt',
    charge_bypass: 'Lädt und Bypass', charge_ac: 'Lädt aus dem Netz', charge_priority: 'Ladevorrang',
    wakeup: 'Aufwachen', cold_wakeup: 'Kaltstart', fully_charged: 'Voll geladen',
    full_bypass: 'Voll, Bypass', standby: 'Standby',
  };
  var ON = 5;

  // Live parts (called from the cards with triggers_update).
  function sec(part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    if (part === 'hero') {
      var value = '—', bits = [];
      var sleepy = function (id) {
        var w = watt(states, id);
        return w == null && id && states[id] && (C.asleep || []).indexOf(id) > -1 ? 0 : w;
      };
      if (C.focus === 'solar') {
        var s = sleepy(C.solar);
        value = fW(s, hass);
        var mods = C.pv.filter(function (id) { var w = watt(states, id); return w != null && w > ON; }).length;
        bits.push(s == null || s <= ON ? 'Liefert gerade nichts' : mods > 1 ? mods + ' Module liefern' : 'Liefert');
        var st = kwh(states, C.solarToday, hass);
        if (st) bits.push('heute ' + st);
      } else if (C.focus === 'battery') {
        var soc = num(states, C.soc), chg = watt(states, C.charge), dis = watt(states, C.discharge), bp = sleepy(C.batt);
        if (bp != null && C.battSign === -1) bp = -bp;
        value = soc != null ? Math.round(soc) + ' %' : fW(bp, hass);
        var lade = chg != null ? chg : (bp != null && bp > 0 ? bp : 0), ent = dis != null ? dis : (bp != null && bp < 0 ? -bp : 0);
        var raw = C.state && states[C.state] ? states[C.state].state : null;
        bits.push(lade > ON ? 'Lädt · ' + fW(lade, hass) : ent > ON ? 'Entlädt · ' + fW(ent, hass)
          : (raw && STATE[raw]) || 'Bereit');
        var en = num(states, C.energy);
        if (en != null) bits.push(en < 1000 ? Math.round(en) + ' Wh' : fN(en / 1000, hass) + ' kWh');
      } else if (C.focus === 'home') {
        var h = watt(states, C.home), g = watt(states, C.grid);
        value = fW(h, hass);
        if (h != null && h > 0 && g != null && (C.solar || C.soc)) {
          bits.push(Math.round(Math.max(0, Math.min(1, 1 - Math.max(g, 0) / h)) * 100) + ' % aus Solar und Akku');
        }
        var ht = kwh(states, C.today, hass);
        if (ht) bits.push('heute ' + ht);
      } else if (C.focus === 'grid') {
        var gw = watt(states, C.grid);
        value = fW(gw == null ? null : Math.abs(gw), hass);
        bits.push(gw == null ? 'Netz' : gw < -20 ? 'Einspeisung' : gw > 20 ? 'Bezug' : 'Kein Austausch');
        var gc = money(states, C.gridCostToday, hass);
        if (gc) bits.push('heute ' + gc);
      }
      return UI.hero({ center: true, value: value, sub: bits.join(' · ') || null, read: C.chart || null });
    }
    if (part === 'flow') {
      var E = window._casoraSoftEnergy;
      if (!E || !E.flow) return '';
      var lbl = C.flow.only === 'from' ? 'Woher kommt der Strom' : C.flow.only === 'to' ? 'Wohin geht der Solarstrom' : '';
      return (lbl && UI.label ? UI.label(lbl) : '') + E.flow(C.flow, states, hass, this);
    }
    return '';
  }

  var PV_KEY = 'casora.energy.pvSeen';
  function pvSeen(ids, states) {
    var mem = {};
    try { mem = JSON.parse(localStorage.getItem(PV_KEY) || '{}') || {}; } catch (e) { mem = {}; }
    var add = false;
    ids.forEach(function (id) { var w = watt(states, id); if (w != null && w > ON && !mem[id]) { mem[id] = 1; add = true; } });
    if (add) { try { localStorage.setItem(PV_KEY, JSON.stringify(mem)); } catch (e) { /* private mode */ } }
    var on = ids.filter(function (id) { return mem[id]; });
    return on.length ? on : ids;
  }

  // Rows built only on opening (power follows by swapping the text).
  function rows(UI, C, states, hass) {
    var out = {};
    var row = function (id, icon, tone, label, value, sub, live) {
      if (!id || !states[id]) return null;
      var r = { entity: id, icon: icon, iconTone: tone, label: label, value: value == null ? '—' : value, sub: sub || null };
      if (live) { r.liveAttr = 'state'; r.liveSuffix = ' W'; }
      return r;
    };
    var grp = function (list, label) { list = list.filter(Boolean); return list.length ? UI.group(list, label) : ''; };
    if (C.focus === 'solar') {
      // Only inputs with a panel: seen with power once (remembered in the browser); none seen yet
      // (at night, first start): all.
      var seen = pvSeen(C.pv, states);
      out.mods = grp(C.pv.map(function (id, i) {
        return seen.indexOf(id) < 0 ? null : row(id, 'mdi:solar-panel', COL.solar, 'Modul ' + (i + 1), fW(watt(states, id), hass), null, true);
      }), 'Module');
      var sT = num(states, C.solarToday), gT = num(states, C.gridToday);
      out.yield = grp([
        row(C.solarToday, 'calendar-day', COL.solar, 'Heute', kwh(states, C.solarToday, hass),
          sT != null && gT != null && sT + gT > 0 ? 'Solaranteil am Verbrauch ' + Math.round(sT / (sT + gT) * 100) + ' %' : null),
        row(C.solarMonth, 'calendar', COL.solar, 'Diesen Monat', kwh(states, C.solarMonth, hass)),
        row(C.savings, 'mdi:piggy-bank-outline', COL.green, 'Ersparnis gesamt', money(states, C.savings, hass)),
      ], 'Ertrag');
    } else if (C.focus === 'battery') {
      var t = num(states, C.temp), capv = num(states, C.capacity);
      out.batt = grp([
        row(C.charge, 'mdi:battery-arrow-up-outline', COL.battery, 'Laden', fW(watt(states, C.charge), hass), null, true),
        row(C.discharge, 'mdi:battery-arrow-down-outline', COL.battery, 'Entladen', fW(watt(states, C.discharge), hass),
          C.battToday ? 'heute ' + (kwh(states, C.battToday, hass) || '—') : null, true),
        row(C.capacity, 'mdi:battery-outline', COL.battery, 'Kapazität', capv != null ? fN(capv / 1000, hass) + ' kWh' : null),
        row(C.temp, 'mdi:thermometer', t != null && t >= 45 ? 'bad' : COL.warm, 'Temperatur',
          t != null ? Math.round(t) + ' ' + (unit(states, C.temp) || '°C') : null),
      ], 'Akku');
    } else if (C.focus === 'home') {
      out.use = grp([
        row(C.today || C.costToday, 'calendar-day', 'accent', 'Heute', both(kwh(states, C.today, hass), money(states, C.costToday, hass))),
        row(C.month || C.costMonth, 'calendar', 'accent', 'Diesen Monat', both(kwh(states, C.month, hass), money(states, C.costMonth, hass))),
      ], 'Verbrauch');
    } else if (C.focus === 'grid') {
      out.use = grp([
        row(C.gridToday || C.gridCostToday, 'calendar-day', COL.grid, 'Heute', both(kwh(states, C.gridToday, hass), money(states, C.gridCostToday, hass))),
        row(C.gridMonth || C.gridCostMonth, 'calendar', COL.grid, 'Diesen Monat', both(kwh(states, C.gridMonth, hass), money(states, C.gridCostMonth, hass))),
      ], 'Bezug');
      var sT2 = num(states, C.solarToday), gT2 = num(states, C.gridToday);
      out.aut = grp([
        row(C.exportTotal, 'mdi:transmission-tower-export', COL.green, 'Eingespeist gesamt', kwh(states, C.exportTotal, hass)),
        sT2 != null && gT2 != null && sT2 + gT2 > 0
          ? row(C.solarToday, 'mdi:solar-power-variant', COL.solar, 'Solaranteil heute', Math.round(sT2 / (sT2 + gT2) * 100) + ' %',
            'Solar ' + fN(sT2, hass) + ' kWh · Netz ' + fN(gT2, hass) + ' kWh') : null,
        row(C.savings, 'mdi:piggy-bank-outline', COL.green, 'Ersparnis gesamt', money(states, C.savings, hass)),
      ], 'Einspeisung und Eigenversorgung');
    }
    return out;
  }

  function build(ctx) {
    var UI = window._casoraUI, E = window._casoraSoftEnergy, K = E && E.kit;
    if (!UI || !K) return null;
    var hass = ctx.hass, states = ctx.states, v = ctx.variables || {};
    var focus = v.energy_focus;
    if (FOCI.indexOf(focus) < 0) return null;
    var C = model(hass, focus, v.energy_peers || peers(hass, {}), v.energy_focus_entity);
    var main = { solar: C.solar, battery: C.soc || C.batt, home: C.home, grid: C.grid }[focus];
    if (!main || !states[main]) return null;
    var f = {};

    // Chart: solar/house 4 h of power, battery 24 h of charge, grid 24 h (above 0 import, below 0 feed-in).
    var CH = { solar: ['Solarleistung', '4h'], battery: [C.soc ? 'Ladestand' : 'Akkuleistung', '24h'],
      home: ['Verbrauch', '4h'], grid: ['Netzleistung', '24h'] }[focus];
    if (typeof window._hpChartCfg === 'function' && ctx.metricCard) {
      // Chart: casora-chart's checked steps (c1 blue, c2 orange, c3 teal, c4 gold) to match the kind.
      window._hpChartCfg(main, CH[0], CH[1], { solar: 'c4', battery: 'c1', home: 'c3', grid: 'c2' }[focus], 120);
      if (CH[1] === '24h' && window._hpSmooth) window._hpSmooth(main, '15min');
      var mc = ctx.metricCard;
      var cf = {
        ct: '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:12px;color:var(--casora-h15-c, var(--casora-popup-tiles-text-muted, rgba(255,255,255,0.55)));margin:2px 2px 4px;text-align:left;">'
          + window.casoraEsc(window._hpChartTitle(main)) + '</div>',
        chart: '<div class="hp-chart-slot" style="min-height:120px;pointer-events:auto;"></div>',
      };
      var cs = { ct: [{ 'justify-self': 'stretch' }], chart: [{ 'justify-self': 'stretch' }] };
      var styles = Object.assign({}, mc.styles, {
        grid: [{ 'grid-template-areas': '"ct" "chart"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }],
        custom_fields: cs,
      });
      f.chart = { card: K.chartCard(Object.assign({}, mc, { styles: styles, custom_fields: cf })) };
      window._hpChartInit(main, false);
      C.chart = main;
    }

    var watch = [C.solar, C.soc, C.batt, C.charge, C.discharge, C.home, C.grid, C.state, C.energy,
      C.solarToday, C.today, C.gridCostToday].concat(C.pv);
    f.hero = { card: K.secCard(watch, 'return window._casoraEnergyFocus ? window._casoraEnergyFocus.sec("hero", '
      + JSON.stringify(C) + ', states, hass) : "";', states) };

    // Energy flow as bars: only the half this popup is about.
    var only = focus === 'solar' ? 'to' : focus === 'home' ? 'from' : null;
    if (only && C.solar && states[C.solar] && C.home && states[C.home]) {
      C.flow = { home: C.home, solar: C.solar, soc: C.soc, grid: C.grid, charge: C.charge, discharge: C.discharge,
        output: C.output, export: null, only: only };
      f.flow = { card: K.secCard([C.solar, C.charge, C.discharge, C.output, C.grid, C.home, C.soc],
        'return window._casoraEnergyFocus ? window._casoraEnergyFocus.sec.call(this, "flow", ' + JSON.stringify(C) + ', states, hass) : "";', states) };
    }

    var r = rows(UI, C, states, hass);
    Object.keys(r).forEach(function (k2) { if (r[k2]) f[k2] = r[k2]; });

    // Consumers (house): HA's "individual devices" when there are any (#44), else the largest found automatically as
    // in the big popup, without the system itself.
    var HC = focus === 'home' && window.casoraEnergyConsumers ? window.casoraEnergyConsumers(hass) : null;
    if (HC) {
      f.top = { card: K.secCard([C.home].concat(window.casoraEnergyConsumers.ids(HC)), K.call('_casoraSoftEnergy', 'auto', { home: C.home, auto: { ha: true } }), states) };
    } else if (focus === 'home' && window._casoraAutoConsumers) {
      var CA = { home: C.home, auto: { exclude: [C.home, C.solar, C.grid, C.batt, C.charge, C.discharge, C.output].concat(C.pv).filter(Boolean),
        area: null, max: 5 } };
      var cand = window._casoraAutoConsumers(hass, states, CA.auto);
      if (cand.ids.length) f.top = { card: K.secCard([C.home].concat(cand.ids.slice(0, 60)), K.call('_casoraSoftEnergy', 'auto', CA), states) };
    }

    // Controls: battery = charge limits, grid = allow feed-in (same body as in the big popup).
    var inner = ctx.inner || {};
    var CC = focus === 'battery' ? { socMin: C.socMin, socMax: C.socMax }
      : focus === 'grid' ? { exportSwitch: C.exportSwitch } : null;
    if (CC && inner.common && inner.ctl && Object.keys(CC).some(function (x) { return CC[x] && states[CC[x]]; })) {
      var ctl = UI.soft && UI.soft() ? inner.ctl.replace("plate(title('Steuerung') + parts.join(div))", "UI.label('Steuerung') + plate(parts.join(div))") : inner.ctl;
      f.ctl = { card: K.secCard([CC.socMin, CC.socMax, CC.exportSwitch], inner.common + 'const C = ' + JSON.stringify(CC) + ';\n' + ctl, states) };
    }

    // Popup blueprint: controls on the left, information on the right.
    var L = { solar: ['flow', 'mods'], battery: ['ctl'], home: ['flow', 'use'], grid: ['ctl'] }[focus];
    var R = { solar: ['yield'], battery: ['batt'], home: ['top'], grid: ['use', 'aut'] }[focus];
    return K.layout({ fields: f, top: ['hero', 'chart'], left: L, right: R, moveLeft: ['top'],
      narrowOrder: L.concat(R) });
  }

  // Popup head: the kind's symbol instead of the bolt (badge entity as in detect, without the Studio field).
  var GLYPH = { solar: 'sun', battery: 'battery', home: 'home', grid: 'electric' };
  var prevRingUrl = window.casoraRingUrl;
  window.casoraRingUrl = function (src, key2) {
    if (/\bcasora_badge_energy\b/.test(key2) && typeof window.casoraIconUrl === 'function') {
      var h = src && (src._hass || (document.querySelector('home-assistant') || {}).hass);
      var id = src && src._stateObj && src._stateObj.entity_id;
      var f = id && h && OVR[id] !== 'simple' ? detect(h, { energy_entity_1: id, energy_popup_focus_1: OVR[id] }, 1) : null;
      if (f) return window.casoraIconUrl(GLYPH[f]);
    }
    return typeof prevRingUrl === 'function' ? prevRingUrl(src, key2) : null;
  };

  // Popup head in the kind's colour (like chart and rows), not in the badge's free colour.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key2) {
    if (!/\bcasora_badge_energy\b/.test(key2)) return null;
    var h = src && (src._hass || (document.querySelector('home-assistant') || {}).hass);
    var id = src && src._stateObj && src._stateObj.entity_id;
    if (!id || !h || OVR[id] === 'simple') return null;
    var f = detect(h, { energy_entity_1: id, energy_popup_focus_1: OVR[id] }, 1);
    return f ? COL[f] : null;
  });

  window._casoraEnergyFocus = { detect: detect, peers: peers, model: model, sec: sec, build: build };
})();
