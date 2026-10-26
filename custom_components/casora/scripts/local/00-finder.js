// ── Device finder (Casora, 26.09.2026) ──────────────────────────────────────
// Popups find their entities themselves instead of needing fixed ids or German
// name patterns. It rests on two language-independent facts from HA's registry,
// which reach the browser as hass.entities / hass.devices:
//   • device_id  – which entities belong to a device (including sub-devices
//                  via via_device, e.g. an AMS on a printer)
//   • translation_key – the integration's fixed key („print_status“), the same
//                  in every language and whatever the user named the entity
// Devices without keys (e.g. Zigbee plugs) are helped by device_class.
// Variables set in the dashboard always win – the finder only fills gaps.

// Entity ids of one device, sorted: an index built once per entity registry object instead of scanning every entity
// for every device (fridge finder on a house with hundreds of devices: each device scanned all entities, and the
// Studio asked that for every entity – the Studio hung). HA replaces hass.entities on every registry change, so the
// object itself is the version (as the other registry caches here); casoraDeviceEntities.reset() after an in-place change.
//   casoraDeviceEntities(R, devId) → [entity_id] (shared, do not change)
if (!window.casoraDeviceEntities) {
  (function () {
    var memo = { reg: null, map: null };
    var EMPTY = [];
    window.casoraDeviceEntities = function (R, devId) {
      if (!R || !devId) return EMPTY;
      if (memo.reg !== R) {
        var map = Object.create(null);
        Object.keys(R).sort().forEach(function (eid) {
          var e = R[eid], d = e && e.device_id;
          if (d) (map[d] || (map[d] = [])).push(eid);
        });
        memo = { reg: R, map: map };
      }
      return memo.map[devId] || EMPTY;
    };
    window.casoraDeviceEntities.reset = function () { memo = { reg: null, map: null }; };
  })();
}

// Electricity price for costs in device popups (1.0.3): 1) the price from the Casora settings (outdoor values &
// electricity price), 2) grid import from HA's energy dashboard (fixed price or live the state of the price entity,
// CASORA_PRICE_ENTITY). Both come with casora/settings/get (casora-local.js). Without either null: the popups then show
// no costs. The argument (a tile's old price_kwh) is ignored since issue #77: one price for all dashboards, the Studio
// no longer offers a price per tile; stored values stay in the dashboards untouched.
window.casoraPriceKwh = function (v) {
  var ok = function (p) { return typeof p === 'number' && isFinite(p) && p >= 0 ? p : null; };
  var ent = window.CASORA_PRICE_ENTITY;
  if (ent) {
    var ha = document.querySelector('home-assistant'), s = ha && ha.hass && ha.hass.states[ent];
    var n = s ? parseFloat(s.state) : NaN;
    if (isFinite(n)) {
      var u = String((s.attributes || {}).unit_of_measurement || '').replace(/\s/g, '').toLowerCase();
      if (/\/mwh$/.test(u)) n = n / 1000; else if (/\/wh$/.test(u)) n = n * 1000;
      return ok(n);
    }
  }
  return ok(window.CASORA_PRICE_KWH);
};

// HA's own energy settings (energy/get_prefs), one cached load for the dashboard and the Studio (#44). Here, not in
// casora-core.js: the Studio loads this file too (casora-panel-types.js), never casora-core.js.
//   casoraEnergyPrefs(hass)       – the prefs or null (not loaded yet, or the call failed); starts a load, at most
//                                   every few minutes. casoraEnergyPrefs.load(hass, force) → Promise of the same.
//   casoraEnergyPowers(hass, p)   – { grid, solar, battery }: power sensors of the settings that exist in hass.states.
//   casoraEnergyHouse(hass, p)    – the house from them, or null: { ids, power, grid, solar, battery }. HA's signs:
//                                   grid positive = import, battery positive = discharge, solar positive, so the house
//                                   is their sum. Only with a grid power sensor and one for every solar and battery
//                                   source (without one the sum would miss it). power: the one sensor when it is the
//                                   grid alone, else null (the house is the sum of ids).
//   casoraEnergySources(hass, ids) – ids by role when they are all such sensors (with the grid), else null: a list
//                                   that is the house from the settings, not consumers.
//   casoraEnergyConsumers(hass, p) – HA's "individual devices" (device_consumption) as the popup lists them, sorted by
//                                   power, or null without entries: [{ id, name, power, w, energy, kwh, daily }].
//                                   id = stat_consumption; power = stat_rate when it exists, else a power sensor on the
//                                   consumption entity's device (same id stem first); w its watts. Without a power
//                                   sensor: energy = the consumption entity when it is a Wh/kWh sensor, kwh its value,
//                                   daily when it is today's value. The sources' own sensors never appear.
//   casoraEnergyBatterySoc(hass, id) – charge level sensor (%) for a battery power sensor (default: the settings' first
//                                   battery): on its device, else one whose id shares its stem. null without one.
(function () {
  if (window.casoraEnergyPrefs) return;
  var AGE = 5 * 60 * 1000;
  var cache = null, at = 0, busy = null;
  var load = function (hass, force) {
    if (busy) return busy;
    if (!hass || typeof hass.callWS !== 'function') return Promise.resolve(cache);
    if (!force && at && Date.now() - at < AGE) return Promise.resolve(cache);
    busy = hass.callWS({ type: 'energy/get_prefs' }).then(function (p) {
      cache = p && typeof p === 'object' ? p : {};
    }, function (e) {
      // Energy never set up: HA answers with the error code not_found. Anything else keeps what was there.
      // Energy integration not loaded at all (unknown_command): the same, instead of asking again every few minutes.
      if (e && (e.code === 'not_found' || e.code === 'unknown_command')) cache = {};
    }).then(function () { at = Date.now(); busy = null; window.casoraEnergyPrefs.tried = true; return cache; });
    return busy;
  };
  window.casoraEnergyPrefs = function (hass) { load(hass); return cache; };
  window.casoraEnergyPrefs.load = load;
  // Load once early, so the first energy popup already knows the settings (a list that is the house).
  (function kick(n) {
    var ha = typeof document !== 'undefined' && document.querySelector ? document.querySelector('home-assistant') : null;
    if (ha && ha.hass && typeof ha.hass.callWS === 'function') { load(ha.hass); return; }
    if (n >= 20 || typeof setTimeout !== 'function') return;
    var t = setTimeout(function () { kick(n + 1); }, 1500);
    if (t && t.unref) t.unref();
  })(0);

  var ROLES = ['grid', 'solar', 'battery'];
  // HA writes the sensor to use into stat_rate (also a template sensor it makes for an inverted or a two sensor
  // power_config); power_config.stat_rate is the same sensor. The legacy grid format had power: [{ stat_rate }].
  var rate = function (x) { return (x && (x.stat_rate || (x.power_config && x.power_config.stat_rate))) || null; };
  var sources = function (prefs) {
    return ((prefs && prefs.energy_sources) || []).filter(function (s) { return s && ROLES.indexOf(s.type) > -1; });
  };
  var ratesOf = function (s) {
    var out = [rate(s)];
    if (s.type === 'grid' && Array.isArray(s.power)) s.power.forEach(function (x) { out.push(rate(x)); });
    return out.filter(function (id) { return typeof id === 'string' && id; });
  };
  // A sensor that exists: with a number now, or a power sensor that is just unavailable (an inverter at night).
  var exists = function (S, id) {
    var s = S[id];
    if (!s) return false;
    var a = s.attributes || {};
    return isFinite(parseFloat(s.state)) || a.device_class === 'power' || /^[mkMG]?W$/.test(String(a.unit_of_measurement || ''));
  };
  window.casoraEnergyPowers = function (hass, prefs) {
    var p = prefs !== undefined ? prefs : window.casoraEnergyPrefs(hass);
    var S = (hass && hass.states) || {}, out = { grid: [], solar: [], battery: [] };
    sources(p).forEach(function (s) {
      ratesOf(s).forEach(function (id) { if (exists(S, id) && out[s.type].indexOf(id) < 0) out[s.type].push(id); });
    });
    return out;
  };
  window.casoraEnergyHouse = function (hass, prefs) {
    var p = prefs !== undefined ? prefs : window.casoraEnergyPrefs(hass);
    var src = sources(p), S = (hass && hass.states) || {};
    if (!src.length) return null;
    var pw = window.casoraEnergyPowers(hass, p);
    if (!pw.grid.length) return null;
    var whole = src.every(function (s) {
      // Grid entries without power are fine: HA split one meter with two tariffs into two entries, the power on one.
      if (s.type === 'grid') return true;
      return ratesOf(s).some(function (id) { return exists(S, id); });
    });
    if (!whole) return null;
    var ids = pw.grid.concat(pw.solar, pw.battery);
    return { ids: ids, power: ids.length === 1 ? ids[0] : null, grid: pw.grid, solar: pw.solar, battery: pw.battery };
  };
  window.casoraEnergySources = function (hass, ids) {
    var list = (Array.isArray(ids) ? ids : []).filter(Boolean);
    if (!list.length) return null;
    var pw = window.casoraEnergyPowers(hass);
    var out = { grid: [], solar: [], battery: [] };
    var all = list.every(function (id) {
      var r = ROLES.filter(function (k) { return pw[k].indexOf(id) > -1; })[0];
      if (r && out[r].indexOf(id) < 0) out[r].push(id);
      return !!r;
    });
    return all && out.grid.length ? out : null;
  };

  // #44: consumers from HA's energy dashboard ("individual devices") and the battery's charge level.
  var POWER_UNIT = /^[mkMG]?W$/, W_FACTOR = { mW: 0.001, W: 1, kW: 1000, MW: 1e6, GW: 1e9 };
  var KWH_FACTOR = { Wh: 0.001, kWh: 1, MWh: 1000, GWh: 1e6 };
  var DAILY = /heute|today|daily|t(ä|ae)glich|(^|[_\s])tag(es)?([_\s]|$)|(^|[_\s])day([_\s]|$)/i;
  var NAME_TAIL = /(\s+(energie|energy|verbrauch|consumption|leistung|power|gesamt|total|heute|today|daily|aktuell|aktuelle|current|momentan|kwh))+$/i;
  var reg = function (hass) { return (hass && hass.entities) || {}; };
  var isPowerState = function (s) {
    var a = (s && s.attributes) || {};
    return a.device_class === 'power' || (!a.device_class && POWER_UNIT.test(String(a.unit_of_measurement || '')));
  };
  var wattOf = function (S, id) {
    var s = id && S[id];
    if (!s) return null;
    var n = parseFloat(s.state), u = String((s.attributes || {}).unit_of_measurement || 'W');
    return isFinite(n) && isPowerState(s) ? n * (W_FACTOR[u] || 1) : null;
  };
  var kwhOf = function (S, id) {
    var s = id && S[id];
    if (!s) return null;
    var n = parseFloat(s.state), f = KWH_FACTOR[String((s.attributes || {}).unit_of_measurement || '')];
    return isFinite(n) && f ? n * f : null;
  };
  var usable = function (hass, id) { var e = reg(hass)[id]; return !(e && (e.hidden || e.entity_category || e.disabled_by)); };
  var disabled = function (hass, id) { var e = reg(hass)[id]; return !!(e && e.disabled_by); };
  // Id without domain and without a trailing energy/power word (sensor.waschmaschine_energie → waschmaschine).
  var stem = function (id) {
    var x = String(id || '').replace(/^[^.]*\./, '');
    var y = x.replace(/_(energy|energie|verbrauch|consumption|power|leistung|total|gesamt|today|heute|daily|kwh|wh|w|p|soc|curr|current)(_[^_]*)?$/i, '');
    return y || x;
  };
  var friendly = function (S, id) { return String(((id && S[id] && S[id].attributes) || {}).friendly_name || '').trim(); };
  var ownSensors = function (hass, p) {
    var pw = window.casoraEnergyPowers(hass, p), own = pw.grid.concat(pw.solar, pw.battery);
    // The sources' meters too (also the legacy grid format with flow_from/flow_to lists).
    var meters = function (x) { ['stat_energy_from', 'stat_energy_to'].forEach(function (k) { if (x && typeof x[k] === 'string') own.push(x[k]); }); };
    sources(p).forEach(function (s) {
      meters(s);
      (Array.isArray(s.flow_from) ? s.flow_from : []).concat(Array.isArray(s.flow_to) ? s.flow_to : []).forEach(meters);
    });
    return own;
  };
  // Power sensor on the consumption entity's device: the one with the same id stem, else a device total, else the
  // first. Kept per prefs and registry (the registry object changes when devices or entities change).
  var devPowerCache = { p: null, R: null, map: {} };
  var devPower = function (hass, p, id) {
    var R = reg(hass);
    if (devPowerCache.p !== p || devPowerCache.R !== R) devPowerCache = { p: p, R: R, map: {} };
    if (id in devPowerCache.map) return devPowerCache.map[id];
    var S = (hass && hass.states) || {}, out = null;
    if (window.casoraDevice && R[id] && R[id].device_id) {
      var list = window.casoraDevice.entities(hass, id, { children: false }).filter(function (e) {
        return e.domain === 'sensor' && !e.category && e.entity_id !== id && S[e.entity_id] && isPowerState(S[e.entity_id]);
      }).map(function (e) { return e.entity_id; });
      var st = stem(id);
      out = list.filter(function (x) { return stem(x) === st; })[0]
        || list.filter(function (x) { return /device.?power|total.?power|power.?total|ger(ä|ae)t.?(leistung|gesamt)|gesamt.?leistung/i.test(x + ' ' + friendly(S, x)); })[0]
        || list[0] || null;
    }
    devPowerCache.map[id] = out;
    return out;
  };
  window.casoraEnergyConsumers = function (hass, prefs) {
    var p = prefs !== undefined ? prefs : window.casoraEnergyPrefs(hass);
    var dc = (p && Array.isArray(p.device_consumption) ? p.device_consumption : []).filter(function (d) {
      return d && typeof d.stat_consumption === 'string' && d.stat_consumption;
    });
    if (!dc.length) return null;
    var S = (hass && hass.states) || {}, own = ownSensors(hass, p), seen = {};
    var list = [];
    dc.forEach(function (d) {
      var id = d.stat_consumption;
      if (own.indexOf(id) > -1 || seen[id]) return;
      // #44: a meter disabled in HA stays in the energy prefs but is no consumer to list.
      if (disabled(hass, id)) return;
      seen[id] = true;
      var power = typeof d.stat_rate === 'string' && S[d.stat_rate] && usable(hass, d.stat_rate) ? d.stat_rate : devPower(hass, p, id);
      if (power && own.indexOf(power) > -1) return;
      // A disabled entity has no state at all (and is missing from hass.entities): no meter and no power → skip.
      if (!S[id] && !power) return;
      var energy = !power && S[id] && KWH_FACTOR[String((S[id].attributes || {}).unit_of_measurement || '')] ? id : null;
      var name = String(d.name || '').trim() || friendly(S, id) || friendly(S, power);
      name = name ? (name.replace(NAME_TAIL, '').trim() || name) : stem(id).replace(/_/g, ' ');
      list.push({ id: id, name: name, power: power, w: wattOf(S, power), energy: energy, kwh: kwhOf(S, energy),
        daily: !!energy && DAILY.test(id + ' ' + friendly(S, id)) });
    });
    // By power; devices without a power sensor after them (today's energy, then meters); without any value last.
    var rank = function (x) { return x.w != null ? 0 : x.kwh != null ? (x.daily ? 1 : 2) : 3; };
    list.sort(function (a, b) { return rank(a) - rank(b) || (b.w || 0) - (a.w || 0) || (b.kwh || 0) - (a.kwh || 0); });
    return list;
  };
  // The sensors a list reads (for a card's triggers_update).
  window.casoraEnergyConsumers.ids = function (list) {
    var out = [];
    (list || []).forEach(function (x) { [x.power, x.energy].forEach(function (id) { if (id && out.indexOf(id) < 0) out.push(id); }); });
    return out;
  };

  var NOT_SOC = /health|\bsoh\b|_soh(_|$)|wirkungsgrad|efficien|limit|grenze|reserve|minim|maxim|(^|_)(min|max)(_|$)|humid|feucht|signal|rssi|progress|fortschritt/i;
  var SOC_WORD = /\bsoc\b|_soc(_|$)|state.?of.?charge|ladestand|ladezustand|f(ü|ue)llstand|akku|batter|speicher|storage/i;
  var socCache = { R: null, map: {} };
  window.casoraEnergyBatterySoc = function (hass, powerId) {
    var S = (hass && hass.states) || {}, R = reg(hass);
    if (!powerId) powerId = window.casoraEnergyPowers(hass).battery[0] || null;
    if (!powerId) return null;
    if (socCache.R !== R) socCache = { R: R, map: {} };
    if (powerId in socCache.map && (!socCache.map[powerId] || S[socCache.map[powerId]])) return socCache.map[powerId];
    var pct = function (id) {
      var s = S[id], a = (s && s.attributes) || {};
      if (id.indexOf('sensor.') !== 0 || !s || !usable(hass, id)) return false;
      if (a.device_class === 'battery') return true;
      return a.unit_of_measurement === '%' && !a.device_class && !NOT_SOC.test(id + ' ' + (a.friendly_name || ''));
    };
    var score = function (id) {
      var a = S[id].attributes || {}, t = id + ' ' + (a.friendly_name || '');
      return (a.device_class === 'battery' ? 0 : 2) + (SOC_WORD.test(t) ? 0 : 1);
    };
    var cands = [];
    if (window.casoraDevice && R[powerId] && R[powerId].device_id) {
      cands = window.casoraDevice.entities(hass, powerId, { children: false }).map(function (e) { return e.entity_id; }).filter(pct);
    }
    if (!cands.length) {
      var st = stem(powerId);
      if (st === powerId.replace(/^[^.]*\./, '')) st = st.replace(/_[^_]+$/, '');
      var pre = 'sensor.' + st + '_';
      if (st) cands = Object.keys(S).filter(function (id) { return id.indexOf(pre) === 0 && id !== powerId && pct(id); });
    }
    cands.sort(function (a, b) { return score(a) - score(b) || (a < b ? -1 : 1); });
    socCache.map[powerId] = cands[0] || null;
    return socCache.map[powerId];
  };
})();

// ── Is this entity a plant? ──────────────────────────────────────────────────
// Plant Monitor (HACS, domain plant) has plant.*; Pflanzenmonitor Plus has one status sensor per plant
// instead (platform pflanzenmonitor_plus, translation_key status) with the same state (ok/problem) and
// attributes (problems, <m>_status, species). The single definition: the dashboard (casora-core.js,
// templates, popups) and the Studio (loads this file) ask this one. hass is optional (default: the one
// on <home-assistant>). Python counterpart: ki.py is_plant (dev/unit/plant_plus_test.py compares them).
// Callers that may run before this file has loaded fall back to plant.* only.
window.CASORA_PLANT_PLUS = 'pflanzenmonitor_plus';
window.casoraIsPlant = window.casoraIsPlant || function (hass, id) {
  id = String(id || '');
  if (id.indexOf('plant.') === 0) return true;
  if (id.indexOf('sensor.') !== 0) return false;
  if (!hass) { try { var ha = document.querySelector('home-assistant'); hass = ha && ha.hass; } catch (e) { hass = null; } }
  var e = hass && hass.entities && hass.entities[id];
  return !!e && e.platform === window.CASORA_PLANT_PLUS && e.translation_key === 'status';
};

(function () {
  if (window.casoraDevice) return;

  function reg(hass) { return (hass && hass.entities) || {}; }
  function devs(hass) { return (hass && hass.devices) || {}; }
  function dc(hass, eid) {
    var s = hass && hass.states && hass.states[eid];
    return s && s.attributes ? s.attributes.device_class : undefined;
  }
  function isPlant(hass, id) { return window.casoraIsPlant(hass, id); }

  // Device of an entity (or the device id itself).
  function deviceOf(hass, anchor) {
    if (!anchor) return null;
    if (devs(hass)[anchor]) return anchor;
    var e = reg(hass)[anchor];
    return (e && e.device_id) || null;
  }

  // Device ids: the device itself and every one hanging off it via via_device.
  function family(hass, devId) {
    var out = [devId], D = devs(hass);
    Object.keys(D).forEach(function (id) {
      if (D[id] && D[id].via_device_id === devId) out.push(id);
    });
    return out;
  }

  // Entity ids of a device: the shared index (casoraDeviceEntities above), a scan when this block runs alone (unit tests).
  var devIds = function (R, d) {
    return window.casoraDeviceEntities ? window.casoraDeviceEntities(R, d)
      : Object.keys(R).filter(function (x) { return R[x] && R[x].device_id === d; }).sort();
  };
  // Every entity of the device (with sub-devices), in a stable order.
  function entities(hass, anchor, opts) {
    var devId = deviceOf(hass, anchor);
    if (!devId) return [];
    var ids = (opts && opts.children === false) ? [devId] : family(hass, devId);
    if (opts && opts.siblings) siblings(hass, devId).forEach(function (id) { ids = ids.concat(family(hass, id)); });
    var R = reg(hass);
    var own = ids.length === 1 ? devIds(R, ids[0])
      : [].concat.apply([], ids.map(function (d) { return devIds(R, d); })).sort();
    return own.filter(function (eid) {
      var e = R[eid];
      return e && !e.hidden;
    }).map(function (eid) {
      var e = R[eid];
      return { entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0],
               device_id: e.device_id, dc: dc(hass, eid), category: e.entity_category || null };
    });
  }

  // First entity with one of the keys (optionally only in one domain).
  function pick(list, spec) {
    var keys = [].concat(spec.keys || []);
    for (var k = 0; k < keys.length; k++) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.key === keys[k] && (!spec.domain || e.domain === spec.domain)) return e.entity_id;
      }
    }
    if (spec.dc) {
      for (var j = 0; j < list.length; j++) {
        var x = list[j];
        if (x.dc === spec.dc && (!spec.domain || x.domain === spec.domain) && !x.category) return x.entity_id;
      }
    }
    return null;
  }

  // Several fields at once: spec = {field: {keys:[…], domain:'sensor', all:true}}
  function map(hass, anchor, spec, opts) {
    var list = entities(hass, anchor, opts);
    var out = {};
    Object.keys(spec).forEach(function (name) {
      var s = spec[name];
      if (s.all) {
        var keys = [].concat(s.keys || []);
        out[name] = list.filter(function (e) {
          return keys.indexOf(e.key) >= 0 && (!s.domain || e.domain === s.domain);
        }).map(function (e) { return e.entity_id; });
      } else {
        out[name] = pick(list, s);
      }
    });
    return out;
  }

  // Smart plug of a device: a device of its own in the same area whose name starts
  // with the device name („Drucker“ → „Drucker Steckdose“) and that switches and measures.
  function companionPlug(hass, anchor) {
    var devId = deviceOf(hass, anchor);
    var D = devs(hass);
    var me = devId && D[devId];
    if (!me) return null;
    var myName = String(me.name_by_user || me.name || '').trim().toLowerCase();
    if (!myName) return null;
    var fam = family(hass, devId);
    var cands = Object.keys(D).filter(function (id) {
      var d = D[id];
      if (!d || fam.indexOf(id) >= 0) return false;
      if (me.area_id && d.area_id && d.area_id !== me.area_id) return false;
      var n = String(d.name_by_user || d.name || '').trim().toLowerCase();
      // „Drucker Steckdose“ for „Drucker“ – or the other way round „Sauger“ for „Sauger Modell …“.
      return n !== myName && (n.indexOf(myName) === 0 || (n.length >= 4 && myName.indexOf(n + ' ') === 0));
    });
    for (var c = 0; c < cands.length; c++) {
      var list = entities(hass, cands[c], { children: false });
      var sw = list.filter(function (e) { return e.domain === 'switch' && !e.category; })[0];
      var power = pick(list, { dc: 'power', domain: 'sensor' });
      // A smart plug measures – otherwise it is e.g. the robot vacuum's dock.
      if (power) {
        return {
          device_id: cands[c],
          switch: sw ? sw.entity_id : null,
          power: power,
          voltage: pick(list, { dc: 'voltage', domain: 'sensor' }),
          current: pick(list, { dc: 'current', domain: 'sensor' }),
          // Total meter: the energy sensor without a suffix like _today/_month.
          energy: (list.filter(function (e) {
            return e.dc === 'energy' && e.domain === 'sensor' && !/_(today|yesterday|month|week|year)$/.test(e.entity_id);
          })[0] || {}).entity_id || null,
        };
      }
    }
    return null;
  }

  // Devices of the same maker in the same area whose name starts with the device
  // name (dock „Sauger Dock“ for the robot „Sauger“).
  function siblings(hass, anchor) {
    var devId = deviceOf(hass, anchor), D = devs(hass), me = devId && D[devId];
    if (!me) return [];
    var myName = String(me.name_by_user || me.name || '').trim().toLowerCase();
    return Object.keys(D).filter(function (id) {
      var d = D[id];
      if (!d || id === devId || d.manufacturer !== me.manufacturer) return false;
      if (me.area_id && d.area_id && d.area_id !== me.area_id) return false;
      var n = String(d.name_by_user || d.name || '').trim().toLowerCase();
      return myName && n.indexOf(myName + ' ') === 0;
    });
  }

  // First entity of an integration with this key – for devices the house has only
  // once (solar battery …). Cached per registry version.
  var keyCache = { reg: null, map: {} };
  var DISTINCT = { anker_solix: 'charging_status_desc' };
  function byKey(hass, platform, key, domain) {
    var R = reg(hass);
    if (keyCache.reg !== R) keyCache = { reg: R, map: {} };
    var ck = platform + '|' + key + '|' + (domain || '');
    if (!(ck in keyCache.map)) {
      var S = (hass && hass.states) || {};
      var ok = function (eid, e) {
        return e && e.translation_key === key && (!domain || eid.indexOf(domain + '.') === 0) && S[eid] && !e.hidden;
      };
      var hit = Object.keys(R).filter(function (eid) {
        return ok(eid, R[eid]) && (!platform || R[eid].platform === platform);
      }).sort()[0] || null;
      // Platform does not match (renamed, test HA …): find the device by a unique key
      // of the integration and search only there – „temperature“ and the like exist
      // on many devices otherwise.
      if (!hit && platform && DISTINCT[platform]) {
        var anchor = Object.keys(R).filter(function (eid) {
          return R[eid] && R[eid].device_id && R[eid].translation_key === DISTINCT[platform] && S[eid];
        }).sort()[0];
        var dev = anchor && R[anchor].device_id;
        if (dev) hit = Object.keys(R).filter(function (eid) { return R[eid].device_id === dev && ok(eid, R[eid]); }).sort()[0] || null;
      }
      keyCache.map[ck] = hit;
    }
    return keyCache.map[ck];
  }

  // ── Waste (Waste Collection Schedule or similar) ───────────────────────────
  // Bin sensors and the waste calendar are detected; own settings from the card variables
  // (trash_*) or CASORA_SETTINGS.waste win.
  // [pattern, colour, Soft key, Soft fallback colour]. In the Soft look the colour comes from
  // --casora-waste-<key> (theme_weich.yaml, 05.10.2026), as in the popup; residual waste is
  // opaque instead of half transparent, and on pickup day the tile got a grey icon on a grey
  // circle. Hazardous waste has its own colour (red) only in the Soft look; otherwise nothing
  // changes (colour null = orange, calendar match by name).
  var WASTE_KINDS = [
    [/bio|organ|kompost|green waste/i, '#30D158', 'bio', '#6AAE78'],
    [/papier|paper|pappe|karton|cardboard/i, '#0A84FF', 'paper', '#5B8FC9'],
    [/wertstoff|gelb|plastik|plastic|verpack|recycl/i, '#FFCC00', 'yellow', '#E8B04A'],
    [/glas|glass/i, '#00C3D0', 'glass', '#4E9E95'],
    [/sperr|bulky/i, null, 'bulky', '#DE8A4E'],
    [/problem|schadstoff|sonderm|gift|hazard/i, null, 'hazard', '#D35A4E'],
    [/rest|residual|general|haus|black/i, '#8E8E93', 'rest', '#8F7E6D'],
  ];
  var WASTE_WORDS = [
    [/gr(ü|ue)n|green/i, '#30D158'], [/blau|blue/i, '#0A84FF'], [/braun|brown/i, '#8F7E6D'],
    [/schwarz|grau|black|gr[ae]y/i, '#8E8E93'], [/rot\b|rote|red/i, '#FF453A'],
  ];
  // Pickup date as attribute key or value (WCS: {'2026-11-12': 'Bio'}), as in wasteDates.
  var WASTE_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function isWasteSensor(hass, eid) {
    if (eid.indexOf('sensor.') !== 0) return false;
    var e = reg(hass)[eid], st = hass.states[eid];
    if (!st || (e && e.hidden)) return false;
    if (e && e.platform === 'waste_collection_schedule') return true;
    return st.attributes && st.attributes.daysTo !== undefined;
  }
  // Bin name without the place (issue #27): since HA 2026.4 the friendly name is device name plus
  // entity name; WCS names its device after the integration, users often rename it to the place.
  // A name the user gave the entity has no device in front and stays as it is. Longest prefix first;
  // without a registry only the integration's own device name goes.
  function wasteLabel(hass, eid) {
    var st = hass.states[eid], e = reg(hass)[eid], d = e && e.device_id && devs(hass)[e.device_id];
    var n = String((st && st.attributes && st.attributes.friendly_name) || (e && e.name) || '').trim();
    var pre = [d && d.name_by_user, d && d.name].map(function (p) { return String(p || '').trim(); });
    pre.sort(function (a, b) { return b.length - a.length; }).forEach(function (p) {
      if (p && n.length > p.length && n.toLowerCase().indexOf(p.toLowerCase() + ' ') === 0) n = n.slice(p.length + 1).trim();
    });
    return n.replace(/^waste collection schedule\s+(?=\S)/i, '') || eid.split('.')[1];
  }
  // Days from today to a date ('YYYY-MM-DD', local) or a timestamp; null if it is neither.
  function daysUntil(s) {
    s = String(s == null ? '' : s);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    var d = new Date(s.length === 10 ? s + 'T00:00:00' : s), t = new Date();
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function waste(hass, variables) {
    var V = variables || {};
    var cfg = settings('waste');
    var S = (hass && hass.states) || {};
    var named = V.trash_sensors || cfg.sensors || null;   // {entity_id: label} or [entity_id]
    var ids = named ? (Array.isArray(named) ? named : Object.keys(named))
      : Object.keys(S).filter(function (eid) { return isWasteSensor(hass, eid); }).sort();
    var weich = !!(window._casoraSoft && window._casoraSoft());
    // A configured calendar that is gone (renamed, removed) falls back to the detected one; it only
    // stays when nothing else is found, so the tile can still say the source is unreachable.
    var calGiven = V.trash_calendar || cfg.calendar || null;
    var calendar = (calGiven && S[calGiven] ? calGiven : null) || Object.keys(S).filter(function (eid) {
      if (eid.indexOf('calendar.') !== 0) return false;
      var e = reg(hass)[eid];
      return (e && e.platform === 'waste_collection_schedule')
        || /^waste collection schedule/i.test((S[eid].attributes || {}).friendly_name || '');
    }).sort()[0] || calGiven;
    // Calendar only, no bin sensors (issue #27): one bin per event title from the preloaded
    // waste calendar, countdown from its next event. Ids are synthetic (no HA state behind them).
    var fromCal = {};
    var TC = window._casoraTrashCal;
    if (!named && !ids.filter(function (id) { return S[id]; }).length && calendar && TC && TC.id === calendar && Array.isArray(TC.ev)) {
      var t0 = new Date(); t0.setHours(0, 0, 0, 0);
      TC.ev.forEach(function (e) {
        var lab = String((e && e.summary) || '').trim(), st0 = e && e.start && (e.start.date || e.start.dateTime);
        var d = st0 ? new Date(String(st0).slice(0, 10) + 'T00:00:00') : null;
        if (!lab || !d || isNaN(d) || d < t0) return;
        var n = Math.round((d - t0) / 86400000), id = calendar + '#' + lab.toLowerCase();
        if (!fromCal[id] || n < fromCal[id].days) fromCal[id] = { label: lab, days: n };
      });
      ids = Object.keys(fromCal).sort();
    }
    var bins = ids.filter(function (id) { return S[id] || fromCal[id]; }).map(function (id) {
      var label = (named && !Array.isArray(named) && named[id]) || (fromCal[id] ? fromCal[id].label : wasteLabel(hass, id));
      var kind = WASTE_KINDS.filter(function (k) { return k[0].test(label) || k[0].test(id); })[0];
      // No known kind: a colour word in the name (green, blue …) gives the colour (issue #27).
      var word = !kind && WASTE_WORDS.filter(function (w) { return w[0].test(label); })[0];
      var color = kind && kind[1] ? kind[1] : word ? word[1] : '#FF9F0A';
      var st = S[id] || { state: String(fromCal[id].days), attributes: {} };
      // A date as state is a date, not a number of days (parseInt would give the year).
      var stDays = daysUntil(st.state);
      var days = stDays != null ? (stDays >= 0 ? stDays : NaN) : parseInt(st.state, 10);
      if (isNaN(days)) days = parseInt(st.attributes && st.attributes.daysTo, 10);
      // WCS default sensors ('on Thu, 12.11.2026', no daysTo): the nearest date from today among the
      // date attributes, as the popup lists them (wasteDates). Only when those dates are one bin's
      // ({date: type} with one type, or one {type: date}): an overview sensor for every type would
      // otherwise join the next pickup of the real bin.
      if (isNaN(days) && !fromCal[id]) {
        var a1 = st.attributes || {}, near = NaN, kinds = {};
        Object.keys(a1).forEach(function (k) {
          var byKey = WASTE_DAY.test(k), n1 = byKey ? daysUntil(k) : typeof a1[k] === 'string' && WASTE_DAY.test(a1[k]) ? daysUntil(a1[k]) : null;
          if (n1 == null || n1 < 0) return;
          kinds[byKey ? String(a1[k]).trim().toLowerCase() : k] = 1;
          if (isNaN(near) || n1 < near) near = n1;
        });
        if (Object.keys(kinds).length === 1) days = near;
      }
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      var tint = 'rgba(' + r + ',' + g + ',' + b + ',0.25)';
      if (weich && !word) {
        color = 'var(--casora-waste-' + (kind ? kind[2] : 'other') + ', ' + (kind ? kind[3] : '#DE8A4E') + ')';
        // Tile on pickup day: full bin circle with a light glyph like the Soft glyphs
        // (casora_trash sets --casora-icon-off-ink to --casora-waste-glyph for it).
        tint = color;
      }
      return {
        id: id, label: label, color: color, tint: tint,
        // Calendar bins match their own title exactly, so a green bin and green cuttings stay apart.
        re: fromCal[id] ? new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
          : kind && kind[1] ? kind[0] : new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        days: isNaN(days) ? null : days, cal: !!fromCal[id],
      };
    });
    var months = V.trash_duty_months || cfg.duty_months || null;
    if (Array.isArray(months) && !months.length) months = null;
    var dutyEnt = V.trash_duty_entity || cfg.duty_entity || null;
    // Duty: null = no duty roster (tile always active), otherwise true/false.
    var duty = null;
    if (dutyEnt && S[dutyEnt]) duty = S[dutyEnt].state === 'on';
    // Empty list = roster switched off (set to null above): as without a roster.
    else if (months) duty = months.indexOf(new Date().getMonth() + 1) > -1;
    var sorted = bins.filter(function (b) { return b.days != null; }).sort(function (a, b) { return a.days - b.days; });
    var days = sorted.length ? sorted[0].days : null;
    var nextBins = sorted.filter(function (b) { return b.days === days; });
    // Month calendar in the waste popup (Studio → Settings → Home & devices), on unless switched off (false).
    var calPopup = V.trash_calendar_popup != null ? V.trash_calendar_popup : cfg.calendar_popup;
    return {
      bins: bins, calendar: calendar, reminder: V.trash_reminder || cfg.reminder || null,
      months: months, duty: duty, days: days, calendarPopup: calPopup !== false,
      next: nextBins.length ? { label: nextBins.map(function (b) { return b.label; }).join(' + '),
                                tint: nextBins[0].tint, color: nextBins[0].color } : null,
    };
  }

  // Pickup dates per bin from today (as in the waste popup): the sensors' date attributes
  // plus the entries of the waste calendar the tile preloads (_casoraTrashCal).
  // Result: [{ bin, dates: [Date …] }] in the order of W.bins.
  function wasteDates(hass, W) {
    var S = (hass && hass.states) || {};
    if (!W) return [];
    var ISO = /^\d{4}-\d{2}-\d{2}$/;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var TC = window._casoraTrashCal;
    var cal = (TC && TC.id === W.calendar && Array.isArray(TC.ev)) ? TC.ev : [];
    return W.bins.map(function (b) {
      var a = (S[b.id] && S[b.id].attributes) || {}, set = {};
      Object.keys(a).forEach(function (k) {
        if (ISO.test(k)) set[k] = 1;
        else if (typeof a[k] === 'string' && ISO.test(a[k])) set[a[k]] = 1;
      });
      cal.forEach(function (e) {
        var s = e && e.start && (e.start.date || e.start.dateTime);
        if (s && b.re.test(e.summary || '')) set[String(s).slice(0, 10)] = 1;
      });
      var dates = Object.keys(set).map(function (k) { var d = new Date(k + 'T00:00:00'); return isNaN(d) ? null : d; })
        .filter(function (d) { return d && d >= today; }).sort(function (x, y) { return x - y; });
      // Only the countdown is known (no date attributes): the date from it.
      if (!dates.length && b.days != null) { var d1 = new Date(today); d1.setDate(d1.getDate() + b.days); dates = [d1]; }
      return { bin: b, dates: dates };
    });
  }

  // Waste source unreachable (04.10.2026): the waste calendar and/or every bin sensor is
  // unavailable/unknown and there is not a single date (e.g. the collector's server refuses
  // the connection). Then { source: name of the source or null }, otherwise null.
  // If only single sensors are gone but dates are there, everything stays as before.
  function wasteDown(hass, W) {
    var S = (hass && hass.states) || {};
    if (!W || (!W.calendar && !W.bins.length)) return null;
    var bad = function (id) { var s = S[id]; return !s || s.state === 'unavailable' || s.state === 'unknown'; };
    var calDown = !!(W.calendar && bad(W.calendar));
    var binsDown = W.bins.length > 0 && W.bins.every(function (b) { return !b.cal && bad(b.id); });
    if (!calDown && !binsDown) return null;
    // Calendar there but not loaded yet: wait first, no hasty „unreachable“.
    var TC = window._casoraTrashCal;
    if (W.calendar && !calDown && !(TC && TC.id === W.calendar)) return null;
    if (wasteDates(hass, W).some(function (x) { return x.dates.length; })) return null;
    var cs = W.calendar && S[W.calendar];
    var name = cs && cs.attributes && cs.attributes.friendly_name;
    name = name ? String(name).replace(/^waste collection schedule\s*/i, '').trim() : '';
    return { source: name || null };
  }

  // Meter reading of an entity at midnight (from history, once a day per entity).
  // Returns null while the query runs.
  var dayCache = {};
  function dayStart(eid) {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var key = eid + '|' + d0.getTime();
    if (key in dayCache) return dayCache[key];
    dayCache[key] = null;
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass || !hass.callApi) { delete dayCache[key]; return null; }
    // First value of the day (reading at midnight, otherwise the earliest of today).
    hass.callApi('GET', 'history/period/' + d0.toISOString() + '?filter_entity_id=' + eid
      + '&minimal_response&no_attributes')
      .then(function (r) {
        var list = (r && r[0]) || [];
        var n = NaN;
        for (var i = 0; i < list.length && isNaN(n); i++) n = parseFloat(list[i].state);
        dayCache[key] = isNaN(n) ? null : n;
      }).catch(function () { delete dayCache[key]; });
    return null;
  }

  // Sum of the hours the entities were „on“ (last `days` days).
  // From history, kept for 30 min; null while the query runs.
  var onCache = {};
  function onHours(eids, days) {
    eids = (eids || []).filter(Boolean).sort();
    if (!eids.length) return 0;
    var key = eids.join(',') + '|' + days;
    var hit = onCache[key];
    if (hit && Date.now() - hit.ts < 1800000) return hit.v;
    if (hit && hit.busy) return hit.v;
    onCache[key] = { ts: 0, v: hit ? hit.v : null, busy: true };
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass || !hass.callApi) { delete onCache[key]; return null; }
    var start = new Date(Date.now() - days * 86400000), now = Date.now();
    // Always pass end_time: without it HA returns only the first day from start.
    hass.callApi('GET', 'history/period/' + start.toISOString() + '?filter_entity_id=' + eids.join(',')
      + '&end_time=' + encodeURIComponent(new Date(now).toISOString()) + '&minimal_response&no_attributes')
      .then(function (r) {
        var ms = 0;
        (r || []).forEach(function (list) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].state !== 'on') continue;
            var a = Math.max(Date.parse(list[i].last_changed) || start.getTime(), start.getTime());
            var b = i + 1 < list.length ? Date.parse(list[i + 1].last_changed) : now;
            ms += Math.max(0, b - a);
          }
        });
        onCache[key] = { ts: Date.now(), v: Math.round(ms / 360000) / 10 };
      }).catch(function () { delete onCache[key]; });
    return onCache[key].v;
  }

  // Last change off → on of an entity (e.g. a scene's status switch, #11), in ms.
  // last_changed is no good: it jumps on every HA restart. Hence from history (30 days),
  // once per entity; again only when its state changes (live off → on without a query).
  // null while the query runs or when there is no change. done() after loading.
  var lastOnCache = {};
  function lastOn(eid, st, done) {
    if (!eid || !st) return null;
    var hit = lastOnCache[eid], lc = st.last_changed;
    if (hit && hit.lc === lc) return hit.v;
    if (hit && hit.busy) return hit.v;
    if (hit && hit.state === 'off' && st.state === 'on') {
      lastOnCache[eid] = { lc: lc, state: 'on', v: Date.parse(lc) || hit.v };
      return lastOnCache[eid].v;
    }
    /* Switched off or restart (on → on with a new last_changed): the known value stays, no query. */
    if (hit && (st.state !== 'on' || hit.state === 'on')) { hit.lc = lc; hit.state = st.state; return hit.v; }
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass || !hass.callApi) return hit ? hit.v : null;
    var keep = hit ? hit.v : null;
    lastOnCache[eid] = { lc: lc, state: st.state, v: keep, busy: true };
    var start = new Date(Date.now() - 30 * 86400000);
    // Always pass end_time: without it HA returns only the first day from start (so nothing of the last 29 days).
    hass.callApi('GET', 'history/period/' + start.toISOString() + '?filter_entity_id=' + eid
      + '&end_time=' + encodeURIComponent(new Date().toISOString()) + '&minimal_response&no_attributes')
      .then(function (r) {
        var list = (r && r[0]) || [], v = null;
        for (var i = list.length - 1; i > 0 && v == null; i--) {
          if (list[i].state === 'on' && list[i - 1].state === 'off') v = Date.parse(list[i].last_changed) || null;
        }
        lastOnCache[eid] = { lc: lc, state: st.state, v: v != null ? v : keep };
        if (typeof done === 'function') { try { done(); } catch (e) { /* ignore */ } }
      }).catch(function () { lastOnCache[eid] = { lc: lc, state: st.state, v: keep }; });
    return keep;
  }

  // Service for AI buttons: the user's own script (old Casora packages), otherwise
  // Casora's service from the integration (ki.py).
  var KI_SVC = {
    casora_update_ki_pruefen: 'update_pruefen', casora_update_ki_bestaetigen: 'update_bestaetigen',
    casora_heizungs_coach: 'heizungs_coach', casora_energie_coach: 'energie_coach', casora_lueftungs_coach: 'lueftungs_coach',
    casora_rezept_neu: 'rezept_neu', casora_rezept_auf_liste: 'rezept_auf_liste',
    casora_kamera_beschreiben: 'kamera_beschreiben', casora_pflanzen_doktor: 'pflanzen_doktor',
    casora_aquarium_doktor: 'aquarium_doktor', casora_ebike_check: 'ebike_check',
  };
  window.casoraSvc = function (script, data) {
    var ha = document.querySelector('home-assistant'), S = (ha && ha.hass && ha.hass.states) || {};
    if (S['script.' + script] || !KI_SVC[script]) return { domain: 'script', service: script, data: data || {} };
    return { domain: 'casora', service: KI_SVC[script], data: data || {} };
  };

  // First entity with this translation_key (for integrations that exist only once).
  function keyAny(hass, key, domain) {
    var R = reg(hass), S = (hass && hass.states) || {};
    return Object.keys(R).filter(function (eid) {
      return R[eid] && R[eid].translation_key === key && S[eid] && (!domain || eid.indexOf(domain + '.') === 0);
    }).sort()[0] || null;
  }

  // The user's own settings (Studio → „Persönliches“, formerly /config/www/casora/einstellungen.js).
  function settings(key) {
    var all = window.CASORA_SETTINGS || {};
    return key ? (all[key] || {}) : all;
  }
  window.casoraSettings = settings;

  // ── Network: routers, access points, switches, WLANs, latency (27.09.2026) ────
  // Maker-neutral (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik,
  // OpenWrt …): devices from network integrations or network makers, the
  // roles per entity from translation_key, device class, unit and name.
  // Result shaped like the popup variables network_devices / wlan_entities /
  // latency_entities – fixed variables in the dashboard still win.
  var NET_PLATFORM = /^(unifi|fritz|tplink_omada|tplink_deco|tplink_router|asuswrt|netgear|mikrotik|luci|openwrt|ubus|keenetic_ndms2|synology_srm|huawei_lte|vodafone_station|freebox|bbox|sfr_box|eero|linksys_smart|zyxel|draytek|glinet|omada)$/;
  var NET_MAKER = /ubiquiti|\bavm\b|fritz|tp-?link|netgear|asus|mikrotik|linksys|zyxel|draytek|eero|gl\.?inet|keenetic|huawei|openwrt|synology/i;
  var NET_ROLE = {
    state: function (x) { return x.domain === 'sensor' && /^(device_state|device_status|status|wan_status|connection_status)$/.test(x.key || ''); },
    online: function (x) { return x.domain === 'binary_sensor' && x.dc === 'connectivity'; },
    clients: function (x) { return x.domain === 'sensor' && x.key !== 'wlan_clients' && /(^|_)(device_clients|connected_clients|clients|client_count|connected_devices)$/.test(x.key || x.entity_id); },
    cpu: function (x) { return x.domain === 'sensor' && x.dc !== 'temperature' && /cpu|prozessor/.test(x.key || x.entity_id) && x.unit === '%'; },
    mem: function (x) { return x.domain === 'sensor' && /mem|ram\b|speicher/.test(x.key || x.entity_id) && x.unit === '%'; },
    temp: function (x) { return x.domain === 'sensor' && x.dc === 'temperature'; },
    uptime: function (x) { return x.domain === 'sensor' && (x.dc === 'timestamp' || x.dc === 'uptime') && /uptime|betriebszeit|boot|last_restart/.test((x.key || '') + ' ' + x.entity_id) && !/connection|wan/.test((x.key || '') + ' ' + x.entity_id); },
    restart: function (x) { return x.domain === 'button' && (x.dc === 'restart' || /reboot|restart|neu_?start/.test((x.key || '') + ' ' + x.entity_id)); },
    update: function (x) { return x.domain === 'update'; },
    wlan: function (x) { return x.domain === 'switch' && (x.key === 'wlan_control' || /wi_?fi|wlan|ssid|guest|gast/.test((x.key || '') + ' ' + x.entity_id)); },
    wlanClients: function (x) { return x.domain === 'sensor' && x.key === 'wlan_clients'; },
    latency: function (x) { return x.domain === 'sensor' && !/speedtest/.test(x.entity_id) && (x.key === 'wan_latency' || (/latency|latenz|ping/.test(x.entity_id) && (x.dc === 'duration' || x.unit === 'ms'))); },
  };
  function network(hass) {
    var R = reg(hass), D = devs(hass), S = (hass && hass.states) || {};
    var byDev = {}, netDev = {};
    Object.keys(R).forEach(function (eid) {
      var e = R[eid], st = S[eid];
      if (!e || !e.device_id || e.hidden || !st) return;
      var d = D[e.device_id];
      if (!d || !(NET_PLATFORM.test(e.platform || '') || NET_MAKER.test(d.manufacturer || ''))) return;
      if (NET_PLATFORM.test(e.platform || '')) (netDev[e.device_id] = true);
      (byDev[e.device_id] = byDev[e.device_id] || []).push({
        entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0],
        dc: st.attributes.device_class, unit: st.attributes.unit_of_measurement,
        name: String(st.attributes.friendly_name || ''), state: st.state,
      });
    });
    var out = { devices: [], wlans: [], latency: [] };
    Object.keys(byDev).sort(function (a, b) {
      return String(D[a].name_by_user || D[a].name).localeCompare(String(D[b].name_by_user || D[b].name));
    }).forEach(function (devId) {
      var list = byDev[devId].sort(function (a, b) { return a.entity_id < b.entity_id ? -1 : 1; });
      var dev = D[devId], label = String(dev.name_by_user || dev.name || '');
      var first = function (role) { var hit = list.filter(NET_ROLE[role])[0]; return hit ? hit.entity_id : null; };
      var lat = list.filter(NET_ROLE.latency);
      lat.forEach(function (x) {
        var n = x.name.replace(label, '').replace(/\b(wan|latency|latenz|ping)\b/gi, '').replace(/\s+/g, ' ').trim();
        out.latency.push([x.entity_id, n || label]);
      });
      // A WLAN as a device of its own (UniFi) – or WLAN switches on the router (FRITZ!Box, TP-Link …).
      // Orphaned entries (unavailable) are no WLAN – a switched-off one is off.
      var wl = list.filter(function (x) { return NET_ROLE.wlan(x) && (netDev[devId] || x.key === 'wlan_control') && x.state !== 'unavailable'; }), wc = first('wlanClients');
      wl.forEach(function (x) {
        var n = wc || wl.length === 1 ? label : x.name.replace(label, '').replace(/^[\s:–-]+/, '').trim() || x.name;
        out.wlans.push({ sw: x.entity_id, clients: wc, label: n });
      });
      if (wc) return;
      var d = {
        label: label, state: first('state') || first('online'), clients: first('clients'), cpu: first('cpu'),
        mem: first('mem'), temp: first('temp'), uptime: first('uptime'), restart: first('restart'), update: first('update'),
      };
      // Real network devices only. From a network integration restart + uptime/update is enough
      // (FRITZ!Box); devices detected only by their maker need clients, CPU or RAM –
      // TP-Link/AVM plugs have restart and update too.
      var strong = d.clients || d.cpu || d.mem || (d.state && first('state')) || lat.length;
      if (!(strong || (netDev[devId] && d.restart && (d.uptime || d.update)))) return;
      var model = (dev.model || '') + ' ' + label;
      d.icon = lat.length || /router|gateway|fritz!?box|udm|udr|ucg|uxg|usg|archer|\bdream/i.test(model) ? 'network'
        : /switch|usw|\bsg\d|\bgs\d|flex/i.test(model) ? 'access_point' : 'mesh';
      Object.keys(d).forEach(function (k) { if (d[k] == null) delete d[k]; });
      out.devices.push(d);
    });
    // Routers first, then access points, then switches.
    var rank = { network: 0, mesh: 1, access_point: 2 };
    out.devices.sort(function (a, b) { return rank[a.icon] - rank[b.icon]; });
    return out;
  }

  // ── Doors/windows for security and contact popups (27.09.2026) ────────────
  // Own group helpers from the settings (contacts.groups: [{id, label}]),
  // otherwise every contact sensor by device class. notify.contact_merged merges
  // combined sensors: first single sensor → combined, the others drop out.
  // Vehicles (car, e-bike): devices with odometer, range, tank or tyre pressure.
  var VEHICLE = /odometer|kilometerstand|mileage|fuel|tank|reichweite|range|reifendruck|tire_pressure|tyre_pressure/i;
  function vehicleDevs(hass) {
    var R = reg(hass), out = {};
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (e && e.device_id && VEHICLE.test(id + ' ' + (e.translation_key || ''))) out[e.device_id] = true;
    });
    return out;
  }
  var APPLIANCE_DOOR = /stuhl|chair|sitz|seat|geschirr|dishwasher|kühl|kuhl|gefrier|fridge|freezer|ofen|oven|backofen|wasch|washer|trockner|dryer|briefkasten|mailbox|drucker|printer|safe|tresor/i;
  function contacts(hass) {
    var cfg = window.CASORA_SETTINGS || {}, S = (hass && hass.states) || {}, R = reg(hass);
    var merged = (cfg.notify && cfg.notify.contact_merged) || {};
    var sub = {}, excl = [];
    Object.keys(merged).forEach(function (k) {
      var m = merged[k] || [];
      if (m[0]) sub[m[0]] = k;
      m.slice(1).forEach(function (x) { excl.push(x); });
    });
    var groups = ((cfg.contacts && cfg.contacts.groups) || []).map(function (g) {
      var st = S[g.id];
      return { id: g.id, label: g.label, members: st && Array.isArray(st.attributes.entity_id) ? st.attributes.entity_id : [] };
    });
    if (!groups.length) {
      var cars = vehicleDevs(hass);
      var pick = function (dcs) {
        return Object.keys(S).filter(function (id) {
          if (id.indexOf('binary_sensor.') !== 0) return false;
          var st = S[id], e = R[id];
          if (e && (e.hidden || e.entity_category || e.platform === 'group' || (e.device_id && cars[e.device_id]))) return false;
          if (Array.isArray(st.attributes.entity_id)) return false;
          // Appliance doors (dishwasher, fridge, oven …) and the mailbox are no house doors/windows.
          if (APPLIANCE_DOOR.test(id + ' ' + (st.attributes.friendly_name || ''))) return false;
          return dcs.indexOf(st.attributes.device_class) >= 0;
        }).sort();
      };
      groups = [{ label: 'Türen', members: pick(['door', 'garage_door']) }, { label: 'Fenster', members: pick(['window']) }];
    }
    // Without a configured combined sensor: detect contact + tilt sensor (+ combined) of the
    // same door (casoraOpenings) – the combined sensor stands for the single sensors, otherwise
    // the contact stays and shows the tilt position via tilt[contact].
    var tilt = {};
    var all = [];
    groups.forEach(function (g) { (g.members || []).forEach(function (x) { if (all.indexOf(x) < 0) all.push(x); }); });
    if (all.length) {
      var combos = Object.keys(S).filter(function (id) { return id.indexOf('binary_sensor.') === 0 && isCombo(hass, id); });
      openings(hass, all.concat(combos)).forEach(function (u) {
        if (u.ids.length < 2 || u.ids.some(function (x) { return sub[x] || excl.indexOf(x) >= 0; })) return;
        // As notify.contact_merged: the contact becomes the combined sensor, the tilt sensor drops out.
        var raw = u.ids.filter(function (x) { return x !== u.main; });
        var head = u.combo ? (raw.filter(function (x) { return !isTiltSensor(hass, x); })[0] || raw[0]) : null;
        raw.forEach(function (x) {
          if (x === head) sub[x] = u.main;
          else if (u.combo || x === u.tilt) excl.push(x);
        });
        if (!u.combo && u.tilt && u.tilt !== u.main) tilt[u.main] = u.tilt;
      });
    }
    // Settings › Doors and windows › Hidden (#69): left out of every group, found automatically or not. A door with
    // two sensors shows as its combined sensor: hiding either one hides the door.
    var hidden = (cfg.contacts && cfg.contacts.hidden) || [];
    if (hidden.length) groups.forEach(function (g) {
      g.members = (g.members || []).filter(function (x) { return hidden.indexOf(x) < 0 && hidden.indexOf(sub[x]) < 0; });
    });
    return { groups: groups, sub: sub, excl: excl, tilt: tilt };
  }
  // contacts() reads every binary sensor. Through button-card's state proxy each read subscribes the card to that
  // entity (it then redrew on every motion sensor of the house, and every further proxy read searched that list),
  // and it ran again for every card on every update. So: once per states object of HA's root element (HA replaces it
  // on every change), from its plain states – only when the caller's hass is of the same house (same registry).
  // Callers read the members they show through their own hass, which subscribes them to just those.
  var rootHass = function () {
    try { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; } catch (e) { return null; }
  };
  var ccShared = { S: null, R: null, cfg: null, v: null };
  var contactsShared = function (hass) {
    var root = rootHass(), raw = root && root.states;
    if (!raw || !hass || reg(hass) !== reg(root)) return contacts(hass);
    var cfg = window.CASORA_SETTINGS || null;
    if (ccShared.S !== raw || ccShared.R !== reg(root) || ccShared.cfg !== cfg) {
      ccShared = { S: raw, R: reg(root), cfg: cfg, v: contacts(raw === hass.states ? hass : Object.assign({}, hass, { states: raw })) };
    }
    return ccShared.v;
  };
  window.casoraContacts = contactsShared;
  // Own name of a door or window from Settings › Doors and windows (#69), '' without one.
  // A name given to a single sensor of a merged door counts for its combined sensor (the row shows that one).
  window.casoraContactName = function (id) {
    var c = (window.CASORA_SETTINGS || {}).contacts, N = (c && c.names) || {};
    var n = N[id];
    if (typeof n !== 'string' || !n.trim()) {
      var sub = (ccShared.v && ccShared.v.sub) || {};
      var k = Object.keys(N).filter(function (x) { return sub[x] === id && typeof N[x] === 'string' && N[x].trim(); })[0];
      n = k ? N[k] : '';
    }
    return typeof n === 'string' ? n.trim() : '';
  };
  // Every door and window of the house, merged sensors left out: what the security badge counts
  // on the home view without entries of its own (#39).
  window.casoraHouseContacts = function (hass) {
    var cc = contactsShared(hass), out = [];
    cc.groups.forEach(function (g) {
      (g.members || []).forEach(function (x) { if (out.indexOf(x) < 0 && cc.excl.indexOf(x) < 0) out.push(x); });
    });
    return out;
  };
  // Security row on Home (#39): the house's doors (kind 'door', every contact but windows) or windows
  // ('window') as a sub-badge of their own, with merged sensors as their combined sensor. Empty in a room,
  // for contacts hidden by „Wer sieht das?“, and when the badge lists that kind itself (no twins).
  // where: the card (home view?) or 'home'; v.place wins as in casora_badge_security_group.
  var OWN_KIND = { door: 'door', garage_door: 'door', opening: 'door', window: 'window' };
  // A badge asks several times per render. Keyed by the hass object: button-card hands its templates a
  // new one per update (its states are a proxy that stays the same for the card's life, so not those).
  var ccMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  var contactsOnce = function (hass) {
    if (!ccMemo || !hass || typeof hass !== 'object') return contactsShared(hass);
    if (!ccMemo.has(hass)) ccMemo.set(hass, contactsShared(hass));
    return ccMemo.get(hass);
  };
  // Kinds of door/window the badge lists itself (security_entity_1…8): contacts, or groups of them.
  // Other binary sensors (smoke, leak, motion …), missing ones and ones this user does not see do not count.
  function ownKinds(S, v, sees) {
    var out = {};
    var kindOf = function (x) { return OWN_KIND[String(((S[x] || {}).attributes || {}).device_class || '')]; };
    for (var i = 1; i <= 8; i++) {
      var x = v['security_entity_' + i];
      if (typeof x !== 'string' || x.indexOf('binary_sensor.') !== 0 || !S[x] || !sees(x)) continue;
      var m = (S[x].attributes || {}).entity_id;
      if (Array.isArray(m) && m.length) m.forEach(function (y) { var k = kindOf(y); if (k) out[k] = true; });
      else if (kindOf(x)) out[kindOf(x)] = true;
    }
    return out;
  }
  window.casoraHouseContactsOf = function (hass, v, kind, user, where) {
    v = v || {};
    var S = (hass && hass.states) || {};
    var home = v.place ? v.place === 'home' : where === 'home'
      || (!!where && typeof where === 'object' && typeof window.casoraOnHomeView === 'function' && window.casoraOnHomeView(where) === true);
    if (!home) return [];
    var sees = function (x) { return typeof window.casoraSeesEntity !== 'function' || window.casoraSeesEntity(x, user, v); };
    var want = kind === 'window' ? 'window' : 'door';
    if (ownKinds(S, v, sees)[want]) return [];
    var cc = contactsOnce(hass), out = [];
    cc.groups.forEach(function (g) {
      (g.members || []).forEach(function (x) {
        if (cc.excl.indexOf(x) >= 0 || !sees(x)) return;
        var win = String(((S[x] || {}).attributes || {}).device_class || '') === 'window';
        var id = cc.sub[x] || x;
        if (win === (want === 'window') && out.indexOf(id) < 0) out.push(id);
      });
    });
    return out;
  };
  // One state for such a list (variables.contacts of casora_badge_contact_group): on while one is open,
  // tilt when every open one is only tilted, unavailable when none reports. Shaped like a group helper.
  window.casoraContactsEntity = function (hass, entity, v) {
    var ids = v && Array.isArray(v.contacts) ? v.contacts.filter(Boolean) : [];
    if (!ids.length) return entity;
    var S = (hass && hass.states) || {}, tilt = contactsOnce(hass).tilt || {};
    var open = 0, tilted = 0, live = 0;
    ids.forEach(function (id) {
      var e = S[id] || {}, s = String(e.state || '').toLowerCase();
      var t = !!tilt[id] && String((S[tilt[id]] || {}).state || '') === 'on';
      if (s && s !== 'unknown' && s !== 'unavailable') live++;
      if (s === 'on' || s === 'open' || s === 'opening' || t) {
        open++;
        if ((e.attributes || {}).tilt === true || t) tilted++;
      }
    });
    return {
      entity_id: ids[0], state: open ? 'on' : live ? 'off' : 'unavailable',
      attributes: { device_class: v.contacts_kind === 'window' ? 'window' : 'door', friendly_name: v.label || '',
        tilt: open > 0 && tilted === open, entity_id: ids.slice() },
    };
  };

  // ── Openings: contact, tilt sensor and combined sensor = one door/window (30.09.2026) ──
  // Some doors/windows have two sensors (contact for open/closed, tilt sensor for
  // „tilted“), often plus a combined sensor (template: on = open or tilted, attribute
  // tilt: true when tilted). An opening counts only once everywhere:
  //   • combined sensor = attribute „tilt“ present or „kombi/combined“ in id/name
  //   • tilt sensor     = „kipp/tilt“ in id/name (and no combined sensor)
  //   • sensors belong together when on the same device or – in the same/no area – with
  //     the same name core without „Kontakt/Kippsensor/Kombi“ (terrassentur_kombi ↔
  //     kontaktsensor_terrassentur_contact ↔ kontaktsensor_terrassentur_kippsensor_contact).
  // Returns per opening { main, tilt, ids, combo, kind: 'door'|'window', state:
  // 'open'|'tilted'|'closed'|'dead' }. Only contact-like binary_sensors count (door,
  // window, garage door, opening or no class) – motion, smoke … stay out.
  // Same logic in the Studio: casora-panel-basis.js (openings), test: dev/unit/oeffnungen.mjs.
  var OPEN_STOP = /^(kontaktsensor|kontakt|contact|sensor|binary|state|status|zustand|open|offen|opening|oeffnung|ofnung)$|kipp|tilt|kombi|combined|combo/;
  function openAttrs(hass, id) { var s = hass && hass.states && hass.states[id]; return (s && s.attributes) || {}; }
  function openLabel(hass, id) { return id + ' ' + (openAttrs(hass, id).friendly_name || ''); }
  function isCombo(hass, id) {
    return Object.prototype.hasOwnProperty.call(openAttrs(hass, id), 'tilt') || /kombi|combined/i.test(openLabel(hass, id));
  }
  function isTiltSensor(hass, id) { return !isCombo(hass, id) && /kipp|tilt/i.test(openLabel(hass, id)); }
  function openTokens(s) {
    return String(s || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
      .split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1 && !/^\d+$/.test(w) && !OPEN_STOP.test(w); });
  }
  function openings(hass, ids) {
    var S = (hass && hass.states) || {}, R = reg(hass), D = devs(hass);
    var CONTACT = ['door', 'window', 'garage_door', 'opening', ''];
    var list = [];
    [].concat(ids || []).forEach(function (id) {
      if (typeof id !== 'string' || id.indexOf('binary_sensor.') !== 0 || list.indexOf(id) >= 0) return;
      var a = openAttrs(hass, id);
      if (CONTACT.indexOf(String(a.device_class || '')) < 0 && !isCombo(hass, id) && !isTiltSensor(hass, id)) return;
      list.push(id);
    });
    var devOf = function (id) { return (R[id] && R[id].device_id) || null; };
    var areaOf = function (id) { var e = R[id]; return e ? (e.area_id || ((D[e.device_id] || {}).area_id) || null) : null; };
    var sub = function (a, b) { return a.length > 0 && a.every(function (x) { return b.indexOf(x) >= 0; }); };
    var sameBase = function (a, b) { return sub(a, b) || sub(b, a); };
    var same = function (x, y) {
      if (devOf(x) && devOf(x) === devOf(y)) return true;
      var ax = areaOf(x), ay = areaOf(y);
      if (ax && ay && ax !== ay) return false;
      return sameBase(openTokens(x.split('.')[1]), openTokens(y.split('.')[1]))
        || sameBase(openTokens(openAttrs(hass, x).friendly_name), openTokens(openAttrs(hass, y).friendly_name));
    };
    var used = {}, units = [];
    // 1) Tilt sensor + contact
    list.forEach(function (t) {
      if (!isTiltSensor(hass, t)) return;
      var c = list.filter(function (x) { return !used[x] && x !== t && !isCombo(hass, x) && !isTiltSensor(hass, x) && same(t, x); })[0];
      var u = { main: c || t, tilt: t, ids: c ? [c, t] : [t], combo: false };
      u.ids.forEach(function (x) { used[x] = true; });
      units.push(u);
    });
    // 2) remaining contacts one by one
    list.forEach(function (x) {
      if (used[x] || isCombo(hass, x)) return;
      used[x] = true;
      units.push({ main: x, tilt: null, ids: [x], combo: false });
    });
    // 3) a combined sensor swallows the openings it matches
    list.filter(function (k) { return isCombo(hass, k); }).forEach(function (k) {
      var mine = units.filter(function (u) { return !u.combo && u.ids.some(function (x) { return same(k, x); }); });
      var ids = [k];
      mine.forEach(function (u) { ids = ids.concat(u.ids); units.splice(units.indexOf(u), 1); });
      units.push({ main: k, tilt: null, ids: ids, combo: true });
    });
    var st = function (id) { return String((S[id] || {}).state || '').toLowerCase(); };
    var on = function (s) { return s === 'on' || s === 'open' || s === 'opening'; };
    units.forEach(function (u) {
      var m = st(u.main), a = openAttrs(hass, u.main);
      if (u.tilt && u.tilt !== u.main && on(st(u.tilt))) u.state = 'tilted';
      else if (!m || m === 'unavailable' || m === 'unknown') u.state = 'dead';
      else if (!on(m)) u.state = 'closed';
      else u.state = (a.tilt === true || a.tilt === 'true' || u.tilt === u.main) ? 'tilted' : 'open';
      var dc = String(a.device_class || '');
      if (!dc) u.ids.some(function (x) { dc = String(openAttrs(hass, x).device_class || ''); return !!dc; });
      var names = u.ids.map(function (x) { return openLabel(hass, x); }).join(' ');
      u.kind = dc === 'window' || (dc !== 'door' && dc !== 'garage_door' && /fenster|window/i.test(names)) ? 'window' : 'door';
    });
    var pos = function (u) { return Math.min.apply(null, u.ids.map(function (x) { var i = list.indexOf(x); return i < 0 ? 1e9 : i; })); };
    return units.sort(function (a, b) { return pos(a) - pos(b); });
  }
  window.casoraOpenings = openings;

  // Sensors that only technically carry device_class door/opening/window but are no door and no
  // window (03.10.2026): Tankerkönig creates a „Status“ (open/closed) per petrol station with
  // device_class door – the bell reported „… ist offen“. Detects platforms from the list,
  // sensors with a location (petrol station, shop: latitude/longitude), diagnostic entities and
  // vehicles (a car's doors, windows and flaps are no openings of the home).
  var NOT_OPENING_PLATFORMS = ['tankerkoenig'];
  // Vehicle: a device with an odometer or device_tracker and door/window sensors of its own
  // (e-bikes have no doors). Cached per registry version.
  var VEHICLE_KEYS = /^(mileage|odometer|total_mileage|odometer_km)$/;
  var vehCache = { reg: null, dev: {} };
  function isVehicle(hass, id) {
    var R = reg(hass), e = R[id], dev = e && e.device_id;
    if (!dev) return false;
    if (vehCache.reg !== R) vehCache = { reg: R, dev: {} };
    if (vehCache.dev[dev] !== undefined) return vehCache.dev[dev];
    var S = (hass && hass.states) || {};
    var mine = Object.keys(R).filter(function (k) { return R[k].device_id === dev; });
    var moves = mine.some(function (k) {
      return k.indexOf('device_tracker.') === 0 || (k.indexOf('sensor.') === 0 && VEHICLE_KEYS.test(String(R[k].translation_key || '')));
    });
    var doors = moves && mine.some(function (k) {
      var dc = k.indexOf('binary_sensor.') === 0 && S[k] && S[k].attributes && S[k].attributes.device_class;
      return dc === 'door' || dc === 'window';
    });
    vehCache.dev[dev] = !!doors;
    return vehCache.dev[dev];
  }
  window.casoraIsVehicle = isVehicle;
  function notAnOpening(hass, id) {
    var e = reg(hass)[id] || {};
    if (e.platform && NOT_OPENING_PLATFORMS.indexOf(String(e.platform)) >= 0) return true;
    if (e.entity_category) return true;
    if (isVehicle(hass, id)) return true;
    var a = openAttrs(hass, id);
    return a.latitude != null && a.longitude != null;
  }
  window.casoraNotAnOpening = notAnOpening;

  // ── Bell: which entities can create an entry at all (1.1.2) ────
  // For the exception list „Nicht melden“ in the Studio (casora-panel-glocke.js). The same sources
  // the bell checks (casora-core.js watched/standing, 01-basis.js extension) – without the
  // switches per dashboard, the list applies to all. o: { appliances: [ids], notify: settings
  // notify (mail, warn_prefix, appliance_care), battery, open_minutes, co2 }.
  // Returns [{ entity, kinds: ['window', …], active }]; active = reporting right now (standing states).
  // Test: dev/unit/glocke_ausnahmen.mjs (compares with the real bell rows).
  var NOTIFY_SAFETY = { moisture: 'water', smoke: 'smoke', gas: 'gas', carbon_monoxide: 'co', safety: 'safety' };
  function notifySources(hass, o) {
    o = o || {};
    var S = (hass && hass.states) || {};
    var n = o.notify || ((window.CASORA_SETTINGS || {}).notify) || {};
    var appl = [].concat(o.appliances || []).filter(Boolean);
    var warn = n.warn_prefix === undefined ? 'binary_sensor.nina_warning_' : n.warn_prefix;
    var care = Array.isArray(n.appliance_care) ? n.appliance_care : [];
    var lowPct = Number(o.battery); if (!isFinite(lowPct)) lowPct = 20;
    var openMin = Number(o.open_minutes); if (!isFinite(openMin)) openMin = 10;
    var co2 = Number(o.co2); if (!isFinite(co2)) co2 = 1800;
    var plants = Object.keys(S).filter(function (id) { return isPlant(hass, id); })
      .map(function (id) { return id.slice(id.indexOf('.') + 1); });
    var out = {};
    var add = function (id, kind, active) {
      var x = out[id] = out[id] || { entity: id, kinds: [], active: false };
      if (x.kinds.indexOf(kind) < 0) x.kinds.push(kind);
      if (active) x.active = true;
    };
    Object.keys(S).forEach(function (id) {
      var st = S[id] || {}, a = st.attributes || {}, dc = String(a.device_class || ''), s = String(st.state);
      var dom = id.split('.')[0];
      if (dom === 'lock') add(id, 'lock', s === 'jammed');
      else if (dom === 'alarm_control_panel') add(id, 'alarm', s === 'triggered');
      else if (dom === 'vacuum') add(id, 'vacuum', s === 'error');
      else if (dom === 'person') add(id, 'person', false);
      else if (dom === 'update') add(id, 'update', s === 'on' && !a.in_progress);
      else if (isPlant(hass, id)) add(id, 'plant', s === 'problem');
      if ((dom === 'event' && dc === 'doorbell') || (dom === 'binary_sensor' && dc === 'occupancy' && /doorbell|ding|chime/i.test(id))) {
        add(id, 'doorbell', false);
      }
      if (dc === 'battery' && (dom === 'sensor' || dom === 'binary_sensor')) {
        var pct = parseFloat(s);
        add(id, 'battery', dom === 'sensor'
          ? isFinite(pct) && (window.casoraBattery ? window.casoraBattery.level(pct) !== 'ok' : pct <= lowPct)
          : s === 'on');
      }
      if (dom === 'binary_sensor' && NOTIFY_SAFETY[dc]) add(id, NOTIFY_SAFETY[dc], s === 'on');
      if (dom === 'binary_sensor' && /^(door|window|garage_door|opening)$/.test(dc) && !notAnOpening(hass, id)) {
        var nm = String(a.friendly_name || '').toLowerCase();
        // Open since: as the bell (casora-core.js openSince) with the integration's remembered value.
        var since = Date.parse(st.last_changed || '');
        var memo = S['sensor.casora_media_paused'];
        var seen = memo && memo.attributes && memo.attributes.contacts && memo.attributes.contacts[id];
        var t0 = seen && seen.since ? Date.parse(seen.since) : NaN;
        if (s === 'on' && isFinite(t0) && (!isFinite(since) || t0 <= since + 1000)) since = t0;
        add(id, dc === 'window' || nm.indexOf('fenster') > -1 || nm.indexOf('window') > -1 ? 'window'
          : dc === 'garage_door' ? 'garage' : 'door',
          s === 'on' && openMin > 0 && isFinite(since) && Date.now() - since >= openMin * 60000);
      }
      if (dom === 'sensor' && dc === 'carbon_dioxide' && co2 > 0
        && !plants.some(function (p) { return id.slice(7).indexOf(p) === 0; })) {
        add(id, 'co2', parseFloat(s) >= co2);
      }
      if (warn && id.indexOf(warn) === 0) add(id, 'warning', s === 'on');
      // DWD level sensor (issue #55): the same source as in the bell (01-basis.js casoraWarnings).
      else if (dom === 'sensor' && window.casoraWarnings && window.casoraWarnings.isLevelSensor(st, id)
        && !window.casoraWarnings.isAdvance(st, id)) {
        add(id, 'warning', window.casoraWarnings.active(st, id));
      }
    });
    appl.forEach(function (id) { if (S[id]) add(id, 'appliance', false); });
    if (n.mail && S[n.mail]) add(n.mail, 'mail', false);
    // Pulse (14-pulse.js): per watched device its status sensor; reports on check/failed.
    var PL = window._casoraPulse;
    if (PL && typeof PL.scan === 'function' && PL.installed(hass)) {
      try {
        PL.scan(hass, S).list.forEach(function (d) {
          add(d.statusId, 'pulse', (d.status === 'failed' || d.status === 'check') && !d.snoozed);
        });
      } catch (e) { /* without Pulse rows */ }
    }
    care.forEach(function (x) {
      if (x && x[1] && S[x[1]]) add(x[1], 'care', !!(x[0] && S[x[0]] && S[x[0]].state === 'on'));
    });
    return Object.keys(out).sort().map(function (id) { return out[id]; });
  }
  window.casoraNotifySources = notifySources;

  // ── Security: level per device/group (security colour system, 03.10.2026) ───────
  // 'ok' = fine, 'warn' = notice, 'alarm' = danger. The security badges colour their
  // icon circle via --casora-security-<level>-color (Soft: sand / orange / red);
  // without these theme variables (Standard, Glass) they keep their previous colours.
  //   ok    locked, closed, alarm armed, camera online
  //   warn  unlocked, open, tilted, alarm disarmed, device offline/unavailable
  //   alarm alarm triggered, lock jammed, open/unlocked while away
  // Away: an alarm panel is armed „away“/„vacation“, or there are persons and all with
  // a known state are gone (unknown persons do not count as away).
  // Only alarm panels and persons are read (button-card's state proxy subscribes a card to every entity it reads;
  // reading all of them made each security badge redraw on every change in the house). Remembered per states
  // object of HA's root element (replaced on every change; button-card's proxy stays the same for a card's life,
  // so keyed by it the answer never changed); a hit still reads the few ids through the caller's states.
  var awayMemo = { S: null, ids: null, r: false };
  function securityAway(hass) {
    var S = hass && hass.states;
    if (!S) return false;
    var root = rootHass(), raw = (root && reg(root) === reg(hass) && root.states) || null;
    if (raw && awayMemo.S === raw) { awayMemo.ids.forEach(function (id) { return S[id]; }); return awayMemo.r; }
    var ids = Object.keys(S).filter(function (id) { return id.indexOf('alarm_control_panel.') === 0 || id.indexOf('person.') === 0; });
    var armedAway = false, persons = 0, known = 0, home = 0;
    ids.forEach(function (id) {
      var s = String((S[id] || {}).state || '').toLowerCase();
      if (id.indexOf('alarm_control_panel.') === 0) { if (s === 'armed_away' || s === 'armed_vacation') armedAway = true; }
      else {
        persons++;
        if (s && s !== 'unknown' && s !== 'unavailable') { known++; if (s === 'home') home++; }
      }
    });
    var r = armedAway || (persons > 0 && known === persons && home === 0);
    if (raw) awayMemo = { S: raw, ids: ids, r: r };
    return r;
  }
  var SEC_RANK = { ok: 0, warn: 1, alarm: 2 };
  function securityLevel(hass, ids) {
    var S = (hass && hass.states) || {};
    var away = null;
    var isAway = function () { if (away === null) away = securityAway(hass); return away; };
    // Group helpers via their members (as casora_badge_security_group).
    var flat = [];
    [].concat(ids || []).forEach(function (id) {
      if (typeof id !== 'string' || id.indexOf('.') < 0) return;
      var m = ((S[id] || {}).attributes || {}).entity_id;
      (id.indexOf('binary_sensor.') === 0 && Array.isArray(m) ? m : [id]).forEach(function (x) {
        if (flat.indexOf(x) < 0) flat.push(x);
      });
    });
    var worst = 'ok';
    var up = function (lv) { if (SEC_RANK[lv] > SEC_RANK[worst]) worst = lv; };
    var contacts = [];
    flat.forEach(function (id) {
      var e = S[id] || {}, a = e.attributes || {};
      var s = String(e.state || '').toLowerCase(), dom = id.split('.')[0];
      var dc = String(a.device_class || '').toLowerCase();
      var dead = !s || s === 'unknown' || s === 'unavailable'
        /* Camera reports „ready“ but delivers no picture (e.g. proxy) – like offline (04.10.2026). */
        || (dom === 'camera' && !!(window._casoraCamDead || {})[id])
        /* Camera tile with „Status von: …“ (casora-core.js casoraCamOffline, 1.1.1). */
        || (dom === 'camera' && !!(window.casoraCamOffline && window.casoraCamOffline(id, S)));
      if (dom === 'binary_sensor') {
        if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') { if (s === 'on' && isAway()) up('alarm'); }
        else if (dc === 'door' || dc === 'window' || dc === 'garage_door' || dc === 'opening' || !dc) contacts.push(id);
        else if (dead) up('warn');
        return;
      }
      if (dead) { up('warn'); return; }
      if (dom === 'lock') up(s === 'jammed' ? 'alarm' : (s === 'locked' || s === 'locking') ? 'ok' : isAway() ? 'alarm' : 'warn');
      else if (dom === 'alarm_control_panel') up(s === 'triggered' ? 'alarm' : (s === 'disarmed' || s === 'pending') ? 'warn' : 'ok');
      else if (dom === 'cover') {
        if (['garage', 'gate', 'door'].indexOf(dc) >= 0 && (s === 'open' || s === 'opening')) up(isAway() ? 'alarm' : 'warn');
      }
    });
    // Doors/windows: contact + tilt sensor (+ combined sensor) are one opening.
    if (contacts.length) openings(hass, contacts).forEach(function (u) {
      if (u.state === 'open') up(isAway() ? 'alarm' : 'warn');
      else if (u.state === 'tilted' || u.state === 'dead') up('warn');
    });
    return worst;
  }
  window.casoraSecurityAway = securityAway;
  window.casoraSecurityLevel = securityLevel;

  // ── Security: one word and one colour per state (Soft, 05.10.2026) ────────
  // In the Soft look tile, badges, popups and notifications say the same word for the same
  // state and take the same level colour. null = no word of its own (the caller keeps its
  // text). Standard/Glass do not ask these helpers.
  // Friendly words instead of „Scharf · Bypass“ (05.10.2026): active/off; bypass is „Bypass“ again (06.10.2026)
  // (single sensors are excluded), away is „Abwesend“ (05.10.2026, formerly „Unterwegs“).
  var ALARM_MODE = { armed_home: 'Zuhause', armed_away: 'Abwesend', armed_night: 'Nacht',
    armed_vacation: 'Urlaub', armed_custom_bypass: 'Bypass' };
  var SEC_WORD = {
    alarm_control_panel: { disarmed: 'Aus', triggered: 'Alarm!' },
    lock: { locked: 'Verriegelt', unlocked: 'Entriegelt', jammed: 'Klemmt', open: 'Geöffnet' },
  };
  window.casoraSecurityWord = function (id, s) {
    var dom = String(id || '').split('.')[0];
    var st = String(s == null ? '' : s).toLowerCase();
    if (dom === 'alarm_control_panel' && ALARM_MODE[st]) return 'Aktiv · ' + ALARM_MODE[st];
    return (SEC_WORD[dom] || {})[st] || null;
  };
  window.casoraSecurityAlarmMode = function (s) { return ALARM_MODE[String(s || '').toLowerCase()] || null; };
  // Level colour as a CSS value; fallback = previous colour (Standard/Glass do not set the variable).
  window.casoraSecurityColor = function (lv, fallback) {
    return 'var(--casora-security-' + (lv || 'ok') + '-color' + (fallback ? ', ' + fallback : '') + ')';
  };

  // ── Sub-line of the security group badge (Soft/Fog, 06.10.2026) ─────────
  // sec = count from casora_badge_security_group (triggered, disarmed, locks, doors, gates,
  // windows, windowsTilted, doorsTilted, covers, lockDead, camDead, insecure, problem).
  // o.summary: 'short' (default) = small icons with a number, 'detailed' = list in words.
  // o.alarmState: state of the alarm panel (for „Aktiv · Abwesend“).
  // Returns { text, html }: text is always the list in words (also for tooltip/screen reader),
  // html only for 'short' with findings, otherwise null.
  // Order by importance: alarm off, door, gate, lock, window open, tilted, covers, offline.
  window.casoraSecuritySummary = function (sec, o) {
    var S = sec || {};
    o = o || {};
    var n = function (c, one, many) { return c === 1 ? one : c + ' ' + many; };
    if (S.triggered) return { text: 'Alarm!', html: null };
    if (!S.insecure && !S.problem) {
      var al = String(o.alarmState || '').toLowerCase();
      return { text: ALARM_MODE[al] ? 'Aktiv · ' + ALARM_MODE[al] : 'Alles sicher', html: null };
    }
    // [word, icon, number, offline?]; words with a number are in phrases/en.json.
    var L = [];
    if (S.disarmed) L.push(['Alarm aus', null, 0]);
    if (S.doors) L.push([n(S.doors, 'Tür offen', 'Türen offen'), 'door-open', S.doors]);
    if (S.gates) L.push([n(S.gates, 'Tor offen', 'Tore offen'), 'garage', S.gates]);
    if (S.locks) L.push([n(S.locks, 'Schloss offen', 'Schlösser offen'), 'lock-open', S.locks]);
    if (S.windows) L.push([n(S.windows, 'Fenster offen', 'Fenster offen'), 'window-open', S.windows]);
    if (S.windowsTilted) L.push([n(S.windowsTilted, 'Fenster gekippt', 'Fenster gekippt'), 'window-tilt', S.windowsTilted]);
    if (S.doorsTilted) L.push([n(S.doorsTilted, 'Tür gekippt', 'Türen gekippt'), 'window-tilt', S.doorsTilted]);
    // Selected covers open in the evening/night (#76, 34-security-covers.js), Home only.
    if (S.covers) L.push([n(S.covers, 'Jalousie offen', 'Jalousien offen'), 'cover_open', S.covers]);
    if (S.lockDead) L.push([n(S.lockDead, 'Schloss offline', 'Schlösser offline'), 'lock', S.lockDead, true]);
    if (S.camDead) L.push([n(S.camDead, 'Kamera offline', 'Kameras offline'), 'camera', S.camDead, true]);
    var text = L.map(function (x) { return x[0]; }).join(' · ');
    if (o.summary === 'detailed') return { text: text, html: null };
    // Short: one icon per finding; „gekippt“ has an icon of its own, offline is struck through.
    // Tooltip and screen-reader text say what is meant („2 Fenster offen“) – casora-i18n.js does
    // not translate attributes by itself, hence casoraTr here.
    var tr = function (t) { return typeof window.casoraTr === 'function' ? window.casoraTr(t) : t; };
    var escAttr = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var url = function (k) { return typeof window.casoraIconUrl === 'function' ? window.casoraIconUrl(k) : '/casora_assets/icons/' + k + '.svg'; };
    var items = L.map(function (x) {
      if (!x[1]) return '<span class="cs-sum-item">' + escAttr(x[0]) + '</span>';
      var lab = tr(x[0]), u = url(x[1]);
      return '<span class="cs-sum-item" role="img" aria-label="' + escAttr(lab) + '" title="' + escAttr(lab) + '"'
        + ' style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap">'
        + '<span aria-hidden="true" style="position:relative;display:inline-block;width:1.05em;height:1.05em;flex:none">'
        + '<span style="position:absolute;inset:0;background-color:currentColor;-webkit-mask:url(\'' + u + '\') center / contain no-repeat;mask:url(\'' + u + '\') center / contain no-repeat;' + (x[3] ? 'opacity:.7;' : '') + '"></span>'
        + (x[3] ? '<span style="position:absolute;left:-12%;top:50%;width:124%;height:1.6px;margin-top:-0.8px;border-radius:1px;background:currentColor;transform:rotate(-45deg)"></span>' : '')
        + '</span><span aria-hidden="true" style="font-variant-numeric:tabular-nums;font-weight:700">' + x[2] + '</span></span>';
    });
    // Height = line height of the badge sub-line (.badge-sub line-height 1.2): with 1.25em the
    // security badge was 0.6 px taller than every other badge (polish 1.3, d-kacheln).
    return { text: text, html: '<span class="cs-sum" style="display:inline-flex;align-items:center;gap:9px;height:1.2em;line-height:1;vertical-align:top">' + items.join('') + '</span>' };
  };

  // ── Security group badge: short form only when the row does not fit (1.3) ─────
  // Hemma 2/1: the template delivers a long and a short line („3 Schlösser offen · …“ / „3 offen · 3 offline“);
  // here we measure whether the badge row fits the width with the long line. The class
  // casora-sec-kurz on the badge shows the short one. Measured, not by device; again on resize.
  window.casoraSecFit = function (card) {
    if (!card || !card.isConnected) return;
    // Row = nearest ancestor with more badges; edge = nearest ancestor that clips or scrolls.
    var row = null, clip = null, n = card.parentNode || card.host, guard = 0;
    while (n && guard++ < 40) {
      if (n.nodeType === 1) {
        if (!row && n.querySelectorAll('button-card').length > 1) row = n;
        if (row && getComputedStyle(n).overflowX !== 'visible') { clip = n; break; }
      }
      n = n.parentNode || n.host;
    }
    if (!row) return;
    var right = 0;
    Array.prototype.forEach.call(row.querySelectorAll('button-card'), function (b) {
      var q = b.getBoundingClientRect(); if (q.width > 0) right = Math.max(right, q.right + (row.scrollLeft || 0));
    });
    var avail = clip ? clip.getBoundingClientRect().right - (parseFloat(getComputedStyle(clip).paddingRight) || 0) : window.innerWidth;
    var kurz = card.classList.contains('casora-sec-kurz');
    var w = card.getBoundingClientRect().width;
    if (!kurz) {
      if (right > avail + 1) { card._casoraSecLongW = w; card.classList.add('casora-sec-kurz'); }
    } else if (card._casoraSecLongW && right - w + card._casoraSecLongW <= avail + 1) {
      card.classList.remove('casora-sec-kurz');
    }
    var obs = clip || row;
    if (!obs._casoraSecRO && window.ResizeObserver) {
      obs._casoraSecRO = new ResizeObserver(function () { if (card.isConnected) window.casoraSecFit(card); });
      obs._casoraSecRO.observe(obs);
    }
  };

  // ── Short or detailed? (07.10.2026) ───────────────────────────────────────
  // Setting security_summary per room: '' or 'auto' (default) = short on the home page
  // (icons with a number), spelled out in rooms – there is mostly just one window, one door;
  // 'short' = always short, 'detailed' = always detailed. place: 'home' | 'room' (unknown = room).
  window.casoraSecurityMode = function (summary, place) {
    var s = String(summary || '').toLowerCase();
    if (s === 'short' || s === 'detailed') return s;
    return place === 'home' ? 'short' : 'detailed';
  };

  // Is el (a card in the dashboard) on the home page? As isHomeRoom in the Studio: the view with
  // path „home“, otherwise the first. Looks for the surrounding view (hui-view: index + lovelace –
  // layout cards like grid-layout have both too, there index is the card slot);
  // true/false, null if none is found (e.g. outside a dashboard).
  var VIEW_TAG = /^hui-([a-z]+-)?view$/;
  window.casoraOnHomeView = function (el) {
    var n = el, guard = 0;
    while (n && guard++ < 120) {
      if (n.lovelace && typeof n.index === 'number' && VIEW_TAG.test(n.localName || '')) {
        var views = (n.lovelace.config && n.lovelace.config.views) || [];
        if (!views.length) return null;
        var home = 0;
        for (var i = 0; i < views.length; i++) if (views[i] && views[i].path === 'home') { home = i; break; }
        return n.index === home;
      }
      n = n.parentNode || n.host || null;
    }
    return null;
  };

  // ── Outdoor sensor by device class (weather popup, 27.09.2026) ──────────────────
  // „outdoor/außen“ in the name or an outdoor area; air pressure is the same outside anyway.
  var OUTDOOR = /outdoor|aussen|außen|outside|exterior|draussen|draußen|garten|terrasse|balkon|garden|terrace|balcony/i;
  // Derived values share the device class with the real reading (issue #28: the dew point sorted before the
  // temperature). They only count when nothing else is there.
  var DERIVED = /dew|taupunkt|roc[ií]o|feels|gef[üu]hlt|apparent|sensaci[oó]n|heat_?index|hitze_?index|wind_?chill|(^|[_ ])(min|max|minimum|maximum)([_ ]|$)/i;
  // No outdoor air: plant, soil, water and vehicle sensors.
  var NOT_AIR = /boden|soil|reifen|tire|tyre|wasser|water|pool|aquarium|teich|pond|akku|battery|motor|engine|kühl|coolant/i;
  function outdoor(hass, dcs) {
    var S = (hass && hass.states) || {}, R = reg(hass), A = (hass && hass.areas) || {}, D = devs(hass);
    dcs = [].concat(dcs);
    var skipDev = vehicleDevs(hass);
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (e && e.device_id && (isPlant(hass, id) || id.indexOf('device_tracker.') === 0)) skipDev[e.device_id] = true;
    });
    var cand = Object.keys(S).filter(function (id) {
      var st = S[id], e = R[id] || {};
      if (id.indexOf('sensor.') !== 0 || dcs.indexOf(st.attributes.device_class) < 0) return false;
      if (e.hidden || e.entity_category || (e.device_id && skipDev[e.device_id])) return false;
      if (/pressure/.test(st.attributes.device_class) && !/^(hpa|mbar|inhg|mmhg|kpa)$/i.test(st.attributes.unit_of_measurement || '')) return false;
      return !NOT_AIR.test(id + ' ' + (st.attributes.friendly_name || ''));
    }).sort();
    var derived = function (id) { return DERIVED.test(id + ' ' + ((R[id] || {}).translation_key || '') + ' ' + (S[id].attributes.friendly_name || '')); };
    cand = cand.filter(function (id) { return !derived(id); }).concat(cand.filter(derived));
    var byName = cand.filter(function (id) { return OUTDOOR.test(id + ' ' + (S[id].attributes.friendly_name || '')); });
    if (byName.length) return byName[0];
    var byArea = cand.filter(function (id) {
      var e = R[id] || {}, d = e.device_id && D[e.device_id];
      var area = A[e.area_id || (d && d.area_id)];
      return area && OUTDOOR.test(area.name || '');
    });
    if (byArea.length) return byArea[0];
    return dcs.join(' ').indexOf('pressure') >= 0 ? cand[0] || null : null;
  }

  // ── Extra values of the weather source (issue #56) ──────────────────────────────
  // Felt temperature and the other values a weather integration offers beside the forecast: HA's standard
  // weather attributes (apparent_temperature, dew_point, humidity, wind_speed, wind_gust_speed, cloud_coverage,
  // uv_index) and the sensors on the weather entity's own device by translation_key ("Wetter & Warnungen":
  // dew_point, wind_gust, cloud_cover, precipitation, precipitation_probability(_today), solar). Display values:
  // attributes first (the entity the user chose), sensors fill the gaps. Chart curves: sensors first (statistics),
  // the attribute's history otherwise.
  var WX_FEELS = ['apparent_temperature', 'feels_like_temperature', 'feels_like', 'realfeel_temperature', 'apparent_temp'];
  var WX_KEYS = {
    temperature: ['temperature'], feels: WX_FEELS, dew_point: ['dew_point', 'dewpoint'],
    humidity: ['humidity', 'relative_humidity'], wind: ['wind_speed'],
    gust: ['wind_gust', 'wind_gust_speed', 'wind_gusts'], cloud: ['cloud_cover', 'cloud_coverage', 'cloudiness'],
    rain_chance: ['precipitation_probability'], rain_chance_today: ['precipitation_probability_today'],
    precipitation: ['precipitation', 'precipitation_intensity'], solar: ['solar', 'solar_irradiance', 'irradiance'],
    uv: ['uv_index', 'uv'],
  };
  var WX_ATTR = { temperature: 'temperature', feels: 'apparent_temperature', dew_point: 'dew_point', humidity: 'humidity',
    wind: 'wind_speed', gust: 'wind_gust_speed', cloud: 'cloud_coverage', uv: 'uv_index' };
  // Curves the popup chart can draw (Studio "In the chart"), in this order, and the extra rows (Studio "Extra values").
  var WX_CURVES = ['temperature', 'feels', 'dew_point', 'humidity', 'wind', 'gust', 'cloud', 'precipitation', 'rain_chance', 'solar', 'uv'];
  var WX_ROWS = ['feels', 'dew_point', 'gust', 'cloud', 'rain_chance', 'rain_chance_today', 'precipitation', 'solar', 'uv'];
  var WX_NAMES = { temperature: 'Temperatur', feels: 'Gefühlt', dew_point: 'Taupunkt', humidity: 'Luftfeuchtigkeit', wind: 'Wind',
    gust: 'Windböen', cloud: 'Bewölkung', precipitation: 'Niederschlag', rain_chance: 'Regenwahrscheinlichkeit',
    rain_chance_today: 'Regen heute', solar: 'Sonneneinstrahlung', uv: 'UV-Index' };
  // The chart's four colour steps (casora-chart C.color); the temperature keeps its orange (= c2).
  var WX_COLOR = { feels: 'c1', dew_point: 'c3', humidity: 'c1', wind: 'c1', gust: 'c3', cloud: 'c3', precipitation: 'c1',
    rain_chance: 'c1', solar: 'c4', uv: 'c4' };
  var WX_MAX_CURVES = 4;
  var wxNum = function (v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; };
  var wxOff = function (v) { return v === false || String(v) === 'false'; };
  // Sensors of the weather entity's device, by translation_key: { key: entity_id } (numeric state only).
  function weatherSensors(hass, wid) {
    var S = (hass && hass.states) || {}, R = reg(hass), dev = R[wid] && R[wid].device_id, out = {};
    if (!dev) return out;
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (!e || e.device_id !== dev || id.indexOf('sensor.') !== 0 || !S[id] || wxNum(S[id].state) == null) return;
      Object.keys(WX_KEYS).forEach(function (k) {
        if (!out[k] && WX_KEYS[k].indexOf(String(e.translation_key || '')) > -1) out[k] = id;
      });
    });
    return out;
  }
  // { key: { entity, attribute?, value, unit } } for every value the source has. opts.feels: chosen sensor
  // for the felt temperature (Studio), wins while it has a number. opts.sensorFirst: sensors before attributes
  // for every value (chart curves); otherwise only for temperature and felt temperature.
  function weatherSources(hass, wid, opts) {
    var S = (hass && hass.states) || {}, w = S[wid], a = (w && w.attributes) || {}, o = opts || {};
    var sens = weatherSensors(hass, wid), out = {};
    var tu = a.temperature_unit || '°C', wu = a.wind_speed_unit || 'km/h';
    var attrUnit = { temperature: tu, feels: tu, dew_point: tu, humidity: '%', wind: wu, gust: wu, cloud: '%', uv: '' };
    var fromSensor = function (k, id) {
      var st = id && S[id], v = st ? wxNum(st.state) : null;
      return v == null ? null : { entity: id, value: v, unit: String((st.attributes || {}).unit_of_measurement || '') };
    };
    var fromAttr = function (k) {
      var v = WX_ATTR[k] && w ? wxNum(a[WX_ATTR[k]]) : null;
      return v == null ? null : { entity: wid, attribute: WX_ATTR[k], value: v, unit: attrUnit[k] };
    };
    Object.keys(WX_KEYS).forEach(function (k) {
      var sensorFirst = o.sensorFirst || k === 'feels' || k === 'temperature';
      var hit = sensorFirst ? fromSensor(k, sens[k]) || fromAttr(k) : fromAttr(k) || fromSensor(k, sens[k]);
      if (hit) out[k] = hit;
    });
    var own = o.feels ? fromSensor('feels', o.feels) : null;
    if (own) out.feels = own;
    return out;
  }
  // The Studio choice from the card variables, older settings migrated: weather_chart (curve keys; absent:
  // temperature + felt, or temperature alone with the old weather_feels off), weather_extras (row keys; false:
  // none, true/absent: all - without the felt row when the old weather_feels was off). { chart, rows }.
  function weatherChoice(v) {
    var V = v || {}, feelsOff = wxOff(V.weather_feels);
    var known = function (list, all) {
      return list.map(String).filter(function (k, i, x) { return all.indexOf(k) > -1 && x.indexOf(k) === i; });
    };
    var c = Array.isArray(V.weather_chart) ? known(V.weather_chart, WX_CURVES) : [];
    var chart = c.length ? c.slice(0, WX_MAX_CURVES) : feelsOff ? ['temperature'] : ['temperature', 'feels'];
    var r = V.weather_extras, rows;
    if (Array.isArray(r)) rows = known(r, WX_ROWS);
    else if (wxOff(r)) rows = [];
    else rows = WX_ROWS.filter(function (k) { return !(feelsOff && k === 'feels'); });
    return { chart: chart, rows: rows };
  }
  // What this source offers for the Studio's lists: { curves: [keys], rows: [keys] }. The temperature is always
  // a curve (outdoor sensor or the source's own).
  function weatherOptions(hass, wid, opts) {
    var src = weatherSources(hass, wid, Object.assign({}, opts || {}, { sensorFirst: true }));
    return {
      curves: WX_CURVES.filter(function (k) { return k === 'temperature' || src[k]; }),
      rows: weatherRows(hass, wid, Object.assign({}, opts || {}, { rows: null })).map(function (r) { return r.key; }),
    };
  }
  // The weather popup's chart: the chosen curves (opts.curves; without: temperature + felt, opts.showFeels false:
  // temperature alone) the source has, at most four, grouped by unit - one chart per unit with the popup's switch
  // between them, curves of one unit drawn together with a legend. The temperature alone: the outdoor sensor as
  // before (else the weather device's temperature sensor); next to other curves of its unit the measured
  // temperature of the same source (its sensor, else the weather entity's attribute) - an outdoor sensor elsewhere
  // would put two places side by side. { key, series, feels (first group), groups: [{ key, label, title, unit,
  // series, curves }] }, null without anything to draw.
  function weatherChart(hass, wid, outT, opts) {
    var o = opts || {}, S = (hass && hass.states) || {};
    var want = Array.isArray(o.curves) ? o.curves : o.showFeels === false ? ['temperature'] : ['temperature', 'feels'];
    var src = weatherSources(hass, wid, Object.assign({}, o, { sensorFirst: true }));
    var keys = WX_CURVES.filter(function (k) { return want.indexOf(k) > -1 && (k === 'temperature' || src[k]); }).slice(0, WX_MAX_CURVES);
    var t = src.temperature, outU = outT && S[outT] ? String((S[outT].attributes || {}).unit_of_measurement || '') : '';
    var unitOf = function (k) { return String(k === 'temperature' ? (t ? t.unit : outU) || '°C' : src[k].unit || '').trim(); };
    var groups = [];
    keys.forEach(function (k) {
      var u = unitOf(k), g = groups.find(function (x) { return x.unit === u; });
      if (!g) groups.push(g = { unit: u, curves: [] });
      g.curves.push(k);
    });
    var out = [];
    groups.forEach(function (g) {
      var series = [], used = {};
      g.curves.forEach(function (k) {
        if (k === 'temperature') {
          var own = t ? (t.attribute ? { entity: wid, attribute: 'temperature', unit: t.unit } : { entity: t.entity }) : null;
          var base = g.curves.length > 1 ? own || (outT ? { entity: outT } : null) : outT ? { entity: outT } : own && !own.attribute ? own : null;
          if (base) { series.push(Object.assign({ name: WX_NAMES.temperature, color: '#FF9F0A' }, base)); used.c2 = 1; }
          return;
        }
        var s = src[k];
        if (series.some(function (x) { return x.entity === s.entity && x.attribute === s.attribute; })) return;
        var col = !used[WX_COLOR[k]] ? WX_COLOR[k] : ['c1', 'c3', 'c4', 'c2'].find(function (c) { return !used[c]; }) || WX_COLOR[k];
        used[col] = 1;
        series.push(Object.assign({ entity: s.entity, name: WX_NAMES[k], color: col }, s.attribute ? { attribute: s.attribute, unit: s.unit } : {}));
      });
      if (!series.length) return;
      var names = series.map(function (x) { return x.name; });
      var hasT = names[0] === WX_NAMES.temperature;
      var curves = g.curves.filter(function (k) { return k !== 'temperature' || hasT; });
      var windy = curves.length > 1 && curves.every(function (k) { return k === 'wind' || k === 'gust'; });
      // Chart key (window._hpPlantCfg, data-hp-metric): the first chart's entity, the others' made unique.
      var key = series[0].attribute && out.length ? wid + '#' + series[0].attribute : series[0].entity;
      if (out.some(function (x) { return x.key === key; })) key += '#' + out.length;
      out.push({ key: key, unit: g.unit, curves: curves, series: series,
        label: hasT ? WX_NAMES.temperature : windy ? WX_NAMES.wind : names.join(' · '),
        title: hasT ? 'Außentemperatur' : names.join(' · ') });
    });
    if (!out.length) return null;
    return { key: out[0].key, series: out[0].series, feels: out[0].curves.indexOf('feels') > -1, groups: out };
  }
  // Rows for the popup's "Details" group (UI.group objects), each with `after` = the label of the standard row it
  // follows (null: at the end, `first`: on top). The standard rows (humidity, wind, pressure, UV, visibility)
  // stay in the template; UV only comes from here when the entity has no uv_index. opts.rows: the keys to show
  // (Studio "Extra values"), all without.
  function weatherRows(hass, wid, opts) {
    var o = opts || {}, src = weatherSources(hass, wid, o), rows = [], pick = Array.isArray(o.rows) ? o.rows : null;
    var num = function (v, d) { return window.casoraNum ? window.casoraNum(v, 0, d) : String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).replace('.', ','); };
    var val = function (s, d) { return num(s.value, d) + (s.unit ? (s.unit === '%' ? ' %' : ' ' + s.unit) : ''); };
    var add = function (k, icon, d, after, tone) {
      var s = src[k];
      if (!s || (pick && pick.indexOf(k) < 0)) return;
      rows.push({ key: k, icon: icon, iconTone: tone || 'accent', label: WX_NAMES[k], value: val(s, d), entity: s.attribute ? undefined : s.entity,
        after: after || null, first: !after && k === 'feels' });
    };
    add('feels', 'mdi:thermometer-lines', 0);
    add('dew_point', 'mdi:thermometer-water', 0, 'Luftfeuchtigkeit');
    add('gust', 'mdi:weather-windy-variant', 0, 'Wind');
    add('cloud', 'mdi:cloud-percent', 0);
    add('rain_chance', 'mdi:umbrella-outline', 0);
    add('rain_chance_today', 'mdi:umbrella-outline', 0);
    add('precipitation', 'mdi:weather-rainy', 1);
    add('solar', 'mdi:sun-wireless-outline', 0, null, 'var(--casora-color-yellow, #FFCC00)');
    if (src.uv && !src.uv.attribute) add('uv', 'mdi:white-balance-sunny', 0, null, 'var(--casora-color-yellow, #FFCC00)');
    return rows;
  }

  /* Robot vacuum fields, shared by the card (02-devices.js _casoraVac) and its Studio fields (find.vac).
     Roborock's translation_keys first, then those of other integrations with the same meaning: Dreame (HACS,
     Tasshack), Ecovacs and iRobot Roomba (HA core). Settings that only look alike (Dreame's auto drying, auto
     dust collecting, self clean) stay out – the popup would treat them as "do it now". */
  var VACUUM_FIELDS = {
    status: { keys: ['status'], domain: 'sensor' }, room: { keys: ['current_room'], domain: 'sensor' },
    progress: { keys: ['clean_percent', 'cleaning_progress'], domain: 'sensor' },
    area: { keys: ['cleaning_area', 'cleaned_area', 'stats_area'], domain: 'sensor' },
    battery: { dc: 'battery', domain: 'sensor' }, charging: { dc: 'battery_charging', domain: 'binary_sensor' },
    time: { keys: ['cleaning_time', 'stats_time'], domain: 'sensor' }, dnd: { keys: ['dnd_switch', 'dnd'], domain: 'switch' },
    dndStart: { keys: ['dnd_start_time', 'dnd_start'], domain: 'time' }, dndEnd: { keys: ['dnd_end_time', 'dnd_end'], domain: 'time' },
    drying: { keys: ['mop_drying'], domain: 'switch' }, dryLeft: { keys: ['mop_drying_remaining_time', 'drying_left'], domain: 'sensor' },
    empty: { keys: ['dust_emptying'], domain: 'switch' }, wash: { keys: ['mop_washing'], domain: 'switch' },
    cleanMode: { keys: ['cleaning_mode', 'work_mode'], domain: 'select' },
    mopInt: { keys: ['mop_intensity', 'water_volume', 'water_amount'], domain: 'select' },
    mopMode: { keys: ['mop_mode', 'mop_pad_humidity'], domain: 'select' },
    emptyMode: { keys: ['dust_collection_mode', 'auto_empty_mode', 'auto_empty'], domain: 'select' },
    lock: { keys: ['child_lock'], domain: 'switch' }, volume: { keys: ['volume'], domain: 'number' },
    // 'error': Dreame (Tasshack) – its error sensor's translation_key; the state is a code like forward_suffocate (issue #33).
    err: { keys: ['vacuum_error', 'error'], domain: 'sensor' }, dockErr: { keys: ['dock_error'], domain: 'sensor' },
    water: { keys: ['water_shortage'], domain: 'binary_sensor' }, dirty: { keys: ['dirty_box_full'], domain: 'binary_sensor' },
    clean: { keys: ['clean_box_empty'], domain: 'binary_sensor' }, mopOn: { keys: ['mop_attached'], domain: 'binary_sensor' },
    // Dreame's station and tanks: enum sensors where Roborock has binary sensors (issue #33).
    cleanTank: { keys: ['clean_water_tank_status'], domain: 'sensor' }, lowWater: { keys: ['low_water_warning'], domain: 'sensor' },
    dirtyTank: { keys: ['dirty_water_tank_status'], domain: 'sensor' }, dustBag: { keys: ['dust_bag_status'], domain: 'sensor' },
    detergent: { keys: ['detergent_status'], domain: 'sensor' },
    boxOn: { keys: ['water_box_attached'], domain: 'binary_sensor' }, lastStart: { keys: ['last_clean_start', 'last_mission'], domain: 'sensor' },
    lastEnd: { keys: ['last_clean_end', 'cleaning_history'], domain: 'sensor' },
    total: { keys: ['total_cleaning_count', 'cleaning_count', 'total_stats_cleanings', 'total_missions'], domain: 'sensor' },
    totalTime: { keys: ['total_cleaning_time', 'total_stats_time'], domain: 'sensor' },
    totalArea: { keys: ['total_cleaning_area', 'total_cleaned_area', 'total_stats_area'], domain: 'sensor' },
  };

  /* 3D printer fields (Bambu Lab, HACS), shared by the card (02-devices.js _casoraPrint.resolve), its Studio fields
     (find.print) and the new-tile finder (TILE_MAIN_FIND). Python mirror for live activities: live_finder.py
     PRINTER_FIELDS (dev/unit/live_finder_test.py compares them). */
  var PRINTER_FIELDS = {
    status: { keys: ['print_status'], domain: 'sensor' }, stage: { keys: ['stage'], domain: 'sensor' },
    progress: { keys: ['print_progress'], domain: 'sensor' }, remaining: { keys: ['remaining_time'], domain: 'sensor' },
    layer: { keys: ['current_layer'], domain: 'sensor' }, layers: { keys: ['total_layers'], domain: 'sensor' },
    task: { keys: ['subtask_name'], domain: 'sensor' }, start: { keys: ['start_time'], domain: 'sensor' },
    end: { keys: ['end_time'], domain: 'sensor' }, weight: { keys: ['print_weight'], domain: 'sensor' },
    length: { keys: ['print_length'], domain: 'sensor' },
    noz: { keys: ['nozzle_temp'], domain: 'sensor' }, nozT: { keys: ['target_nozzle_temp'], domain: 'sensor' },
    bed: { keys: ['bed_temp'], domain: 'sensor' }, bedT: { keys: ['target_bed_temp'], domain: 'sensor' },
    slots: { keys: ['tray'], domain: 'sensor', all: true }, ext: { keys: ['external_spool'], domain: 'sensor' },
    activeSlot: { keys: ['active_tray'], domain: 'sensor' },
    amsHum: { keys: ['humidity'], domain: 'sensor' }, amsIdx: { keys: ['humidity_index'], domain: 'sensor' },
    amsTemp: { keys: ['ams_temp'], domain: 'sensor' },
    speedSel: { keys: ['printing_speed'], domain: 'select' }, speed: { keys: ['speed_profile'], domain: 'sensor' },
    auxFan: { keys: ['aux_fan'], domain: 'fan' }, coolFan: { keys: ['cooling_fan'], domain: 'fan' },
    chamberFan: { keys: ['chamber_fan'], domain: 'fan' },
    usage: { keys: ['total_usage_hours'], domain: 'sensor' }, nozSize: { keys: ['nozzle_diameter'], domain: 'sensor' },
    nozType: { keys: ['nozzle_type'], domain: 'sensor' }, plate: { keys: ['print_bed_type'], domain: 'sensor' },
    fw: { keys: ['firmware_update'], domain: 'update' }, online: { keys: ['online'], domain: 'binary_sensor' },
    hms: { keys: ['hms_errors'], domain: 'binary_sensor' }, err: { keys: ['print_error'], domain: 'binary_sensor' },
    cam: { keys: ['camera'], domain: 'camera' }, camSw: { keys: ['camera'], domain: 'switch' },
    light: { keys: ['chamber_light'], domain: 'light' },
    pause: { keys: ['pause'], domain: 'button' }, resume: { keys: ['resume'], domain: 'button' }, stop: { keys: ['stop'], domain: 'button' },
  };
  // A device is a 3D printer when it has the print status or the print stage sensor (the same keys as above).
  var PRINTER_KEYS = PRINTER_FIELDS.status.keys.concat(PRINTER_FIELDS.stage.keys);

  // Robot vacuums and 3D printers per device, built once per registry (cameras ask for every camera).
  var kindsMemo = { reg: null, out: null };
  function deviceKinds(hass) {
    var R = reg(hass);
    if (kindsMemo.reg === R && kindsMemo.out) return kindsMemo.out;
    var out = { vacuum: {}, printer: {} };
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (!e || !e.device_id) return;
      if (id.indexOf('vacuum.') === 0) out.vacuum[e.device_id] = true;
      if (id.indexOf('sensor.') === 0 && PRINTER_KEYS.indexOf(e.translation_key) >= 0) out.printer[e.device_id] = true;
    });
    kindsMemo = { reg: R, out: out };
    return out;
  }
  // Is the device of `anchor` (entity or device id) a 3D printer? Python: live_finder.py is_printer.
  function isPrinter(hass, anchor) {
    var devId = deviceOf(hass, anchor);
    return !!(devId && deviceKinds(hass).printer[devId]);
  }

  // A map by its name: an object id or translation_key with the word map/maps/karte/karten
  // (camera.robby_map, camera.robby_map_2, image.erdgeschoss_karte, camera.wohnungskarte). One rule for the
  // vacuum map finder below, the Cameras tile (_casoraCams) and the Studio assistant.
  var MAP_RE = /(^|_)(map|maps|karte|karten)(_|$)|karte(_\d+)?$/;
  function isMapName(x) { return MAP_RE.test(String(x || '')); }
  // Camera (or image) that is no surveillance camera: a map by its id or key, or one on a robot vacuum's device;
  // with `printers` also a 3D printer's camera (left out of automatic lists, kept when chosen by hand).
  function notSurveillance(hass, id, printers) {
    var e = reg(hass)[id];
    if (isMapName(String(id || '').split('.')[1]) || (e && isMapName(e.translation_key))) return true;
    if (!e || !e.device_id) return false;
    var K = deviceKinds(hass);
    return !!(K.vacuum[e.device_id] || (printers && K.printer[e.device_id]));
  }

  // ── Robot vacuum map (07.10.2026) ───────────────────────────────────────────
  // Image or camera entity on the robot (or its dock) that is a map:
  // Roborock creates an image.* per floor (name = map name, without a key),
  // Dreame/Valetudo/Map Extractor a camera.*_map. Detected by platform, key
  // or id (map|karte), never by room names. Active map first (a select with the
  // key selected_map names it), then reachable ones, otherwise the first.
  function vacuumMap(hass, anchor) {
    var S = (hass && hass.states) || {}, R = reg(hass);
    if (!anchor) return null;
    var list = deviceOf(hass, anchor) ? entities(hass, anchor, { siblings: true }) : [];
    // Device with a map choice (select, key selected_map): every image on it is a map.
    var mapDev = {};
    list.forEach(function (e) { if (e.domain === 'select' && e.key === 'selected_map') mapDev[e.device_id] = true; });
    var isMap = function (e) {
      if (e.domain !== 'image' && e.domain !== 'camera') return false;
      var r = R[e.entity_id] || {};
      if (e.domain === 'image' && (r.platform === 'roborock' || mapDev[e.device_id])) return true;
      return isMapName(e.key) || isMapName(e.entity_id.split('.')[1]);
    };
    var maps = list.filter(function (e) { return S[e.entity_id] && isMap(e); }).map(function (e) { return e.entity_id; });
    // Without a device (e.g. Map Extractor): camera./image.<robot>_map.
    if (!maps.length) {
      var base = String(anchor).split('.')[1] || '';
      maps = ['image.' + base + '_map', 'camera.' + base + '_map'].filter(function (id) { return base && S[id]; });
    }
    if (!maps.length) return null;
    var sel = list.filter(function (e) { return e.domain === 'select' && e.key === 'selected_map' && S[e.entity_id]; })[0];
    var cur = sel ? String(S[sel.entity_id].state || '').trim().toLowerCase() : '';
    var nm = function (id) {
      var r = R[id] || {}, a = (S[id] || {}).attributes || {};
      return [String(r.name || ''), String(a.friendly_name || '')].map(function (x) { return x.trim().toLowerCase(); });
    };
    var dead = function (id) { var s = S[id].state; return s === 'unavailable' ? 1 : 0; };
    var score = function (id) {
      var n = nm(id);
      var active = cur && cur !== 'unknown' && cur !== 'unavailable'
        && n.some(function (x) { return x && (x === cur || x.slice(-(cur.length + 1)) === ' ' + cur); });
      return (active ? 0 : 2) + dead(id);
    };
    return maps.slice().sort(function (a, b) { return score(a) - score(b); })[0];
  }
  // The configured map while it exists; otherwise (empty or deleted) the detected one.
  function vacuumMapFor(hass, anchor, chosen) {
    var S = (hass && hass.states) || {};
    if (chosen && S[chosen]) return chosen;
    return vacuumMap(hass, anchor);
  }

  window.casoraDevice = {
    vacuumMap: vacuumMap, vacuumMapFor: vacuumMapFor, vacuumFields: VACUUM_FIELDS,
    printerFields: PRINTER_FIELDS, printerKeys: PRINTER_KEYS, isPrinter: isPrinter, isMapName: isMapName,
    notSurveillance: notSurveillance,
    deviceOf: deviceOf, entities: entities, map: map, companionPlug: companionPlug, byKey: byKey,
    waste: waste, wasteDates: wasteDates, wasteDown: wasteDown, siblings: siblings, dayStart: dayStart, onHours: onHours, lastOn: lastOn, keyAny: keyAny, network: network,
    contacts: contacts, outdoor: outdoor, openings: openings,
    weatherSources: weatherSources, weatherChart: weatherChart, weatherRows: weatherRows, weatherChoice: weatherChoice,
    weatherOptions: weatherOptions, weatherNames: WX_NAMES, weatherMaxCurves: WX_MAX_CURVES,
  };
})();

// ── Cameras tile without a choice (27.09.2026) ─────────────────────────────────
// variables.cameras empty: every camera in the house – without robot vacuum maps and
// printer cameras (casoraDevice.notSurveillance), those are no surveillance.
(function () {
  if (window._casoraCams) return;
  // 30.09.2026: a chosen list without maps too (robot vacuum map and the like);
  // unreachable cameras go last (the popup shows them as offline).
  window._casoraCams = function (variables, entity, hass) {
    var H = hass || (document.querySelector('home-assistant') || {}).hass || {};
    var S = H.states || {}, R = H.entities || {};
    var CD = window.casoraDevice;
    // Map = by name or a robot vacuum's camera; auto = printer cameras too.
    var isMap = function (id, auto) { return !!(CD && CD.notSurveillance && CD.notSurveillance(H, id, auto)); };
    var dead = function (id) { var st = S[id]; return !st || st.state === 'unavailable' || st.state === 'unknown'; };
    var byLive = function (a, b) { return (dead(a) ? 1 : 0) - (dead(b) ? 1 : 0); };
    var list = Array.isArray(variables && variables.cameras) ? variables.cameras.filter(Boolean) : [];
    if (list.length) {
      var picked = list.filter(function (id) { return id.indexOf('camera.') !== 0 || !isMap(id, false); });
      return (picked.length ? picked : list).slice().sort(byLive);
    }
    var out = Object.keys(S).filter(function (id) {
      if (id.indexOf('camera.') !== 0) return false;
      var e = R[id];
      if (e && (e.hidden || e.entity_category)) return false;
      return !isMap(id, true);
    }).sort().sort(byLive);
    if (!out.length && entity && String(entity.entity_id || '').indexOf('camera.') === 0) out = [entity.entity_id];
    return out;
  };
})();

// ── Washer, dryer and dishwasher: where the values come from (03.10.2026) ──────────
// Priority: 1. the maker's official integration (Home Connect, Miele,
// SmartThings, LG ThinQ, Whirlpool, hOn/Electrolux and the like), 2. WashData
// (ha_washdata, learns programmes on the smart plug), 3. the smart plug only.
// Detected by the entity's platform and its translation_key, never by names
// or ids. Without a platform (test house) the key combination is enough.
// One table for every card (issue #48: the dishwasher had its own key lists and
// missed Home Connect from HA core): `fields` feed washer/dryer, `dish` the
// dishwasher card (dish()). Python mirror for live activities: live_finder.py
// (dev/unit/live_finder_test.py compares the tables).
// Used by the tile/popup (02-devices.js) and by the Studio (assistant,
// add tile, field placeholders): loaded there via import (panel/casora-panel-types.js).
(function () {
  if (window.casoraLaundryFind) return;

  function reg(hass) { return (hass && hass.entities) || {}; }
  function sts(hass) { return (hass && hass.states) || {}; }
  function devs(hass) { return (hass && hass.devices) || {}; }
  var k = function (keys, domain) { return { keys: [].concat(keys), domain: domain || 'sensor' }; };
  var has = function (list, key, dom) {
    return list.some(function (e) { return e.key === key && (!dom || e.domain === dom); });
  };
  var opts = function (hass, list, keys) {
    var out = [];
    list.forEach(function (e) {
      if (keys.indexOf(e.key) < 0) return;
      var st = sts(hass)[e.entity_id];
      out = out.concat((st && st.attributes && st.attributes.options) || [], st ? [st.state] : []);
    });
    return out.map(function (o) { return String(o || '').toLowerCase(); });
  };
  var model = function (hass, devId) { var d = devs(hass)[devId] || {}; return String(d.model || '') + ' ' + String(d.model_id || ''); };
  /* Home Connect: washing/drying/rinsing is in the programme key (laundry_care_washer_… / dishcare_dishwasher_…). */
  var hcRole = function (progKeys) {
    return function (hass, list) {
      var o = opts(hass, list, progKeys).join(' ');
      if (/laundry_?care[._]washer/.test(o) || has(list, 'washer_temperature') || has(list, 'prewash')) return 'washer';
      if (/laundry_?care[._]dryer/.test(o) || has(list, 'drying_target')) return 'dryer';
      if (/dishcare/.test(o) || has(list, 'sensor_salt') || has(list, 'sensor_rinse_aid') || has(list, 'select_rinse_aid')) return 'dishwasher';
      return null;
    };
  };
  // Dishwasher fields (02-devices.js _casoraDish): same keys on every device of that source.
  var bk = function (key) { return k(key, 'binary_sensor'); };
  // Home Connect Alt (HACS, ekutner/home-connect-hass) gives its entities generic translation_keys (statuses,
  // options, programs, settings or none) but fixes every entity_id itself: <domain>.<haid>_<Home Connect key in
  // lower case, dots as underscores> (common.py EntityBase), e.g. sensor.<haid>_bsh_common_status_operationstate,
  // sensor.<haid>_active_program, select.<haid>_programs, button.<haid>_start_pause. The frontend's registry has
  // no unique_id, so these fields match the end of the entity_id, and only on that platform (TAIL_PLATFORMS).
  var TAIL_PLATFORMS = ['home_connect_alt'];
  var hk = function (tails, domain, keys) { return { keys: [].concat(keys || []), domain: domain || 'sensor', tail: [].concat(tails) }; };
  var tailHit = function (e, tails) {
    if (TAIL_PLATFORMS.indexOf(e.platform) < 0) return false;
    var obj = String(e.entity_id).split('.')[1] || '';
    return tails.some(function (t) { return obj === t || obj.slice(-(t.length + 1)) === '_' + t; });
  };
  // Home Connect Alt: the program sensors and the program select carry the appliance type as their icon
  // (const.py DEVICE_ICON_MAP); else the program keys (translation mode "local") or the option entities' ids
  // (…_laundrycare_washer_option_temperature, …_dishcare_dishwasher_option_extradry). A coffee maker or oven: none.
  // The program entities' icon is gone while the appliance is unavailable: keep the last role seen for the device,
  // or the Studio suggestion comes and goes (review 23.10.2026).
  var ALT_ROLE = {};
  var altRole = function (hass, list) {
    var dev = list[0] && (list[0].device_id || list[0].entity_id);
    var r = altRoleNow(hass, list);
    if (r && dev) ALT_ROLE[dev] = r;
    return r || (dev && ALT_ROLE[dev]) || null;
  };
  var altRoleNow = function (hass, list) {
    var progs = list.filter(function (e) { return e.key === 'programs' || tailHit(e, ['active_program', 'selected_program', 'programs']); });
    var icon = progs.map(function (e) {
      var a = (sts(hass)[e.entity_id] || {}).attributes || {};
      return String(a.icon || (reg(hass)[e.entity_id] || {}).icon || '');
    }).join(' ');
    if (/tumble-dryer/.test(icon)) return 'dryer';
    if (/washing-machine/.test(icon)) return 'washer';
    if (/dishwasher/.test(icon)) return 'dishwasher';
    if (/coffee|stove|fridge|robot|hvac/.test(icon)) return null;
    var o = opts(hass, progs, ['programs']).concat(progs.map(function (e) { var st = sts(hass)[e.entity_id]; return String((st && st.state) || '').toLowerCase(); }))
      .concat(list.filter(function (e) { return TAIL_PLATFORMS.indexOf(e.platform) > -1; }).map(function (e) { return e.entity_id; })).join(' ');
    if (/laundry_?care[._]washer/.test(o)) return 'washer';
    if (/laundry_?care[._]dryer/.test(o)) return 'dryer';
    return /dishcare[._]dishwasher/.test(o) ? 'dishwasher' : null;
  };

  // need: every key required, any: one of them – only when the platform does not match (test house).
  // role(hass, list, devId) → 'washer' | 'dryer' | 'dishwasher' | null (null = none of them, e.g. an oven).
  // dish: the dishwasher card's fields; a spec may name a device class (dc) for entities without a key.
  var SOURCES = [
    { id: 'home_connect', rank: 0, platforms: ['home_connect'], need: ['operation_state'],
      any: ['program_progress', 'active_program', 'selected_program', 'program_finish_time'],
      role: hcRole(['active_program', 'selected_program']),
      fields: { state: k('operation_state'), program: k(['active_program', 'selected_program'], 'select'),
        select: k('selected_program', 'select'), remaining: k('program_finish_time'), progress: k('program_progress'),
        door: k('door'), pause: k('pause_program', 'button'), resume: k('resume_program', 'button'),
        stop: k('stop_program', 'button') },
      // HA core has no start button (the action home_connect.start_selected_program or the active_program select
      // starts) and reports the finish time. Program options are switches/numbers of the selected program
      // (switch.py/number.py, available only while the program offers them); refills and care reminders are
      // event sensors (present / confirmed / off). Issue #77: none of them was read, the German name fallback
      // below is Home Connect Local's (Start in relativ, Hygiene +, Intensivzone did not match).
      dish: { program: k('active_program', 'select'), sel: k('selected_program', 'select'), progress: k('program_progress'),
        remaining: k('program_finish_time'), door: k('door'), stop: k('stop_program', 'button'),
        startIn: k('start_in_relative', 'number'), power_sw: k('power', 'switch'), remoteStart: bk('remote_start'),
        extraDry: k('extra_dry', 'switch'), halfLoad: k('half_load', 'switch'), speed: k('vario_speed_plus', 'switch'),
        silence: k('silence_on_demand', 'switch'), hygiene: k('hygiene_plus', 'switch'), intensivZone: k('intensiv_zone', 'switch'),
        saltLow: k('salt_nearly_empty'), saltLack: k(['salt_lack', 'program_blocked_salt_lack']),
        rinseLow: k('rinse_aid_nearly_empty'), rinseLack: k('rinse_aid_lack'),
        smartFilter: k('smart_filter_cleaning_reminder'), machineCare: k('machine_care_reminder'),
        machineFilter: k(['machine_care_and_filter_cleaning_reminder', 'machine_care_and_low_maintenance_filter_cleaning_reminder']) } },
    /* Home Connect Alt (HACS, ekutner/home-connect-hass): by platform only (its keys are generic), fields by the
       end of the entity_id (hk above). Operation state and programs are Home Connect keys
       (BSH.Common.EnumType.OperationState.Run, LaundryCare.Washer.Program.Cotton) or, in translation mode "server",
       the cloud's texts; the remaining time is a timestamp (const.py: class timestamp); one button starts, pauses
       and resumes (button.py StartButton, translation_key by state), so pause and resume are that button. */
    { id: 'home_connect_alt', rank: 0, platforms: ['home_connect_alt'], need: null, any: [],
      role: altRole,
      fields: { state: hk('bsh_common_status_operationstate'), program: hk(['active_program', 'selected_program']),
        select: hk('programs', 'select'), remaining: hk('bsh_common_option_remainingprogramtime'),
        progress: hk('bsh_common_option_programprogress'), door: hk('bsh_common_status_doorstate', 'binary_sensor'),
        stop: hk('stop', 'button', 'stop_program'), pause: hk('start_pause', 'button'), resume: hk('start_pause', 'button') },
      dish: { program: hk('active_program'), sel: hk('programs', 'select'), progress: hk('bsh_common_option_programprogress'),
        remaining: hk('bsh_common_option_remainingprogramtime'), energyEst: hk('bsh_common_option_energyforecast'),
        waterEst: hk('bsh_common_option_waterforecast'),
        door: { keys: [], domain: 'binary_sensor', tail: ['bsh_common_status_doorstate'], dc: 'door' },
        conn: hk('connected', 'binary_sensor'), power_sw: hk('bsh_common_setting_powerstate', 'switch'),
        extraDry: hk('dishcare_dishwasher_option_extradry', 'switch'), halfLoad: hk('dishcare_dishwasher_option_halfload', 'switch'),
        speed: hk('dishcare_dishwasher_option_variospeedplus', 'switch'),
        silence: hk('dishcare_dishwasher_option_silenceondemand', 'switch'),
        hygiene: hk('dishcare_dishwasher_option_hygieneplus', 'switch'), intensivZone: hk('dishcare_dishwasher_option_intensivzone', 'switch'),
        startIn: hk('bsh_common_option_startinrelative', 'number'),
        start: hk('start_pause', 'button'), stop: hk('stop', 'button', 'stop_program') } },
    /* Home Connect Local (HACS, chris-mc1/homeconnect_local_hass, platform homeconnect_ws): translation_key = the
       entity description's key (entity.py), e.g. sensor_operation_state; entity_ids follow the (translated) names. */
    { id: 'homeconnect_ws', rank: 0, platforms: ['homeconnect_ws'], need: ['sensor_operation_state'],
      any: ['sensor_active_program', 'select_program', 'sensor_program_progress'],
      role: hcRole(['sensor_active_program', 'select_program', 'sensor_selected_program']),
      fields: { state: k('sensor_operation_state'), program: k(['sensor_active_program', 'sensor_selected_program']),
        select: k('select_program', 'select'), remaining: k('sensor_remaining_program_time'),
        progress: k('sensor_program_progress'), phase: k(['sensor_program_phase', 'sensor_laundry_process_phase', 'sensor_dryer_process_phase']),
        door: k('binary_sensor_door_state', 'binary_sensor'),
        stop: k('button_abort_program', 'button'), pause: k('button_pause_program', 'button'),
        resume: k('button_resume_program', 'button') },
      dish: { program: k('sensor_active_program'), sel: k('select_program', 'select'), phase: k('sensor_program_phase'),
        progress: k('sensor_program_progress'), remaining: k('sensor_remaining_program_time'),
        energyEst: k('sensor_energy_forecast'), waterEst: k('sensor_water_forecast'), salt: k('sensor_salt'),
        rinse: k('sensor_rinse_aid'), door: { keys: ['binary_sensor_door_state'], domain: 'binary_sensor', dc: 'door' },
        care: k(['sensor_machinecare_remaining_runs', 'sensor_machine_care_reminder']), starts: k('sensor_count_started'),
        conn: bk('connection'),
        remote: k('select_remote_control_level', 'select'), startIn: k('number_start_in', 'number'),
        power_sw: k('switch_power_state', 'switch'), light: k('switch_info_light', 'switch'),
        smartFilter: bk('binary_sensor_smartfiltercleaningreminder'), filterCheck: bk('binary_sensor_checkfiltersystem'),
        machineCare: bk('binary_sensor_machinecarereminder'),
        machineFilter: bk('binary_sensor_machinecareandfiltercleaningreminder'),
        // Per-program options first (dishcare.py), the settings of the same name are off by default.
        extraDry: k(['switch_extra_dry_option', 'switch_extra_dry'], 'switch'), halfLoad: k('switch_half_load', 'switch'),
        speed: k(['switch_vario_speed_plus', 'switch_speed_on_demand'], 'switch'), silence: k('switch_silence_on_demand', 'switch'),
        start: k('button_start_program', 'button'), stop: k('button_abort_program', 'button'),
        aquaStop: bk('binary_sensor_aqua_stop'), drainBlocked: bk('binary_sensor_drainpumpblocked'),
        drainImpossible: bk('binary_sensor_drainingnotpossible'), lowPressure: bk('binary_sensor_low_water_pressure'),
        calcified: bk('binary_sensor_waterheatercalcified'), aborted: bk('binary_sensor_program_aborted') } },
    { id: 'miele', rank: 0, platforms: ['miele'], need: ['status'], any: ['spin_speed', 'drying_step', 'twin_dos_1_level'],
      role: function (hass, list) {
        if (has(list, 'spin_speed') || has(list, 'twin_dos_1_level')) return 'washer';
        if (has(list, 'drying_step')) return 'dryer';
        return (has(list, 'salt_level') || has(list, 'rinse_aid_level') || has(list, 'power_disk_level')) ? 'dishwasher' : null;
      },
      fields: { state: k('status'), program: k('program_id'), phase: k(['program_phase', 'drying_step']),
        remaining: k(['remaining_time', 'finish']), elapsed: k(['elapsed_time', 'start']), energy: k('energy_consumption'),
        pause: k('pause', 'button'), stop: k('stop', 'button') },
      // Salt/rinse aid (percent) and the forecasts (percent) do not fit the card's levels; the door has no key.
      dish: { program: k('program_id'), phase: k('program_phase'), remaining: k(['remaining_time', 'finish']),
        door: { keys: [], domain: 'binary_sensor', dc: 'door' }, start: k('start', 'button'), stop: k('stop', 'button') } },
    { id: 'smartthings', rank: 0, platforms: ['smartthings'],
      need: [], any: ['washer_machine_state', 'washer_job_state', 'dryer_machine_state', 'dryer_job_state'],
      role: function (hass, list) {
        if (has(list, 'washer_machine_state') || has(list, 'washer_job_state')) return 'washer';
        return (has(list, 'dryer_machine_state') || has(list, 'dryer_job_state')) ? 'dryer' : null;
      },
      fields: { state: k(['washer_machine_state', 'dryer_machine_state']), phase: k(['washer_job_state', 'dryer_job_state']),
        program: k(['washer_mode', 'dryer_mode']), remaining: k('completion_time'), door: k('door', 'binary_sensor'),
        pause: k('pause', 'button'), resume: k('resume', 'button'), stop: k('stop', 'button') } },
    /* LG ThinQ: washer and dryer have the same keys; the appliance type is in the model („… (DRYER)“). */
    { id: 'lg_thinq', rank: 0, platforms: ['lg_thinq'], need: ['current_state', 'cycle_count'], any: ['remain', 'total'],
      role: function (hass, list, devId) {
        if (!has(list, 'cycle_count')) return null;
        return /dryer/i.test(model(hass, devId)) && !/wash/i.test(model(hass, devId)) ? 'dryer' : 'washer';
      },
      fields: { state: k('current_state'), remaining: k('remain'), elapsed: k('running'), total: k('total'), count: k('cycle_count') } },
    /* WashData before Whirlpool: both call the state „washer_state“, only WashData has progress, programme choice etc. */
    { id: 'washdata', rank: 1, platforms: ['ha_washdata'], need: ['washer_state'],
      any: ['cycle_progress', 'time_remaining', 'program_select', 'mark_unloaded', 'cycle_count', 'current_phase'],
      role: function (hass, list) {
        var st = list.filter(function (e) { return e.key === 'washer_state' && e.domain === 'sensor'; })[0];
        var a = (st && sts(hass)[st.entity_id] && sts(hass)[st.entity_id].attributes) || {};
        var icon = String(a.icon || (reg(hass)[st ? st.entity_id : ''] || {}).icon || '');
        // WashData also watches dishwashers, air fryers and pumps – the icon says what it is.
        if (/dishwasher/.test(icon)) return 'dishwasher';
        if (/pot-steam|water-pump|pump/.test(icon)) return null;
        return /tumble-dryer|dryer/.test(icon) ? 'dryer' : 'washer';
      },
      fields: { state: k('washer_state'), program: k('washer_program'), phase: k('current_phase'),
        remaining: k('time_remaining'), progress: k('cycle_progress'), elapsed: k('elapsed_time'),
        total: k('total_duration'), count: k('cycle_count'), energy: k('energy_total'), power: k('current_power'),
        running: k('running', 'binary_sensor'), select: k('program_select', 'select'),
        pause: k('pause_cycle', 'button'), resume: k('resume_cycle', 'button'), force: k('force_end_cycle', 'button'),
        unload: k('mark_unloaded', 'button'), suggest: k('suggestions') } },
    { id: 'whirlpool', rank: 0, platforms: ['whirlpool'], need: ['end_time'], any: ['washer_state', 'dryer_state'],
      role: function (hass, list) {
        if (has(list, 'washer_state')) return 'washer';
        return has(list, 'dryer_state') ? 'dryer' : null;
      },
      fields: { state: k(['washer_state', 'dryer_state']), remaining: k('end_time') } },
    /* Further maker integrations from HACS (Haier/Candy hOn, Electrolux/AEG, LG SmartThinQ):
       by platform only, fields by the usual keys. */
    { id: 'other', rank: 0, platforms: ['hon', 'electrolux_status', 'electrolux', 'smartthinq_sensors', 'candy', 'haier'],
      need: null, any: [],
      role: function (hass, list, devId) {
        // The integration's keys (programs_wm / programs_td …) and model, no names.
        var t = list.map(function (e) { return e.key || ''; }).join(' ') + ' ' + model(hass, devId);
        if (/wash|(^|[_ ])wm($|[_ ])|spin/i.test(t)) return 'washer';
        return /dryer|tumble|(^|[_ ])td($|[_ ])|dry_level/i.test(t) ? 'dryer' : null;
      },
      fields: { state: k(['machine_state', 'mach_modes_wm', 'mach_modes_td', 'run_state', 'appliance_state', 'program_state',
          'operation_state', 'current_state', 'status', 'state']),
        program: k(['programs_wm', 'programs_td', 'program', 'program_name', 'current_course', 'course']),
        phase: k(['program_phases_wm', 'program_phases_td', 'program_phase', 'phase', 'run_phase', 'current_phase']),
        remaining: k(['remaining_time', 'remain_time', 'time_remaining', 'remaining']),
        progress: k(['program_progress', 'progress']), door: k(['door', 'door_lock', 'door_status'], 'binary_sensor') } },
  ];

  // Entity ids of a device: the shared index (casoraDeviceEntities above), a scan when this block runs alone (unit tests).
  var devIds = function (R, d) {
    return window.casoraDeviceEntities ? window.casoraDeviceEntities(R, d)
      : Object.keys(R).filter(function (x) { return R[x] && R[x].device_id === d; }).sort();
  };
  function list(hass, devId) {
    var R = reg(hass), S = sts(hass);
    return devIds(R, devId).filter(function (eid) {
      var e = R[eid];
      return e && !e.disabled_by && S[eid];
    }).map(function (eid) {
      var e = R[eid];
      return { entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0], platform: e.platform || null,
               category: e.entity_category || null };
    });
  }
  function pick(lst, spec, hass) {
    var keys = spec.keys;
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < lst.length; j++) {
        if (lst[j].key === keys[i] && lst[j].domain === spec.domain) return lst[j].entity_id;
      }
    }
    // End of the entity_id (Home Connect Alt, hk): in the order of the tails.
    if (spec.tail) {
      for (var t = 0; t < spec.tail.length; t++) {
        for (var q = 0; q < lst.length; q++) {
          if (lst[q].domain === spec.domain && tailHit(lst[q], [spec.tail[t]])) return lst[q].entity_id;
        }
      }
    }
    // Device class (dish door: Miele's door has no key): visible entities only.
    if (spec.dc && hass) {
      for (var m = 0; m < lst.length; m++) {
        var a = (sts(hass)[lst[m].entity_id] || {}).attributes || {};
        if (lst[m].domain === spec.domain && !lst[m].category && a.device_class === spec.dc) return lst[m].entity_id;
      }
    }
    return null;
  }
  function matches(src, lst) {
    if (lst.some(function (e) { return src.platforms.indexOf(e.platform) >= 0; })) return 'platform';
    if (!src.need) return null;
    // A device of another known source it is not (Whirlpool keys on a WashData device …).
    var known = SOURCES.some(function (o) { return o !== src && lst.some(function (e) { return o.platforms.indexOf(e.platform) >= 0; }); });
    if (known) return null;
    var ok = src.need.every(function (key) { return has(lst, key); })
      && (!src.any.length || src.any.some(function (key) { return has(lst, key); }));
    return ok ? 'keys' : null;
  }

  // Classify a device: { device, source, rank, role, state, f: {program, …}, entry } or null.
  // roles: the kinds asked for; default washer and dryer (the laundry cards and the Studio's laundry lists).
  var LAUNDRY = ['washer', 'dryer'];
  function classify(hass, devId, roles) {
    if (!devId) return null;
    roles = roles || LAUNDRY;
    var lst = list(hass, devId);
    if (!lst.length) return null;
    for (var i = 0; i < SOURCES.length; i++) {
      var src = SOURCES[i];
      var how = matches(src, lst);
      if (!how) continue;
      var role = src.role(hass, lst, devId);
      if (!role || roles.indexOf(role) < 0) continue;
      var f = {};
      Object.keys(src.fields).forEach(function (name) { f[name] = pick(lst, src.fields[name]); });
      if (!f.state) continue;
      if (src.id === 'washdata') {
        f.profiles = lst.filter(function (e) { return e.key === 'profile_cycle_count' && e.domain === 'sensor'; })
          .map(function (e) { return e.entity_id; });
      }
      var d = devs(hass)[devId] || {};
      return { device: devId, source: src.id, rank: src.rank, role: role, how: how, state: f.state, f: f,
               entry: src.id === 'washdata' ? ((d.config_entries || [])[0] || null) : null };
    }
    return null;
  }

  function deviceOf(hass, eid) { var e = reg(hass)[eid]; return (e && e.device_id) || null; }
  function areaOfDev(hass, devId) { var d = devs(hass)[devId]; return (d && d.area_id) || null; }

  // Smart plug without an appliance integration: switches (switch) and measures (power in W).
  function plugOf(hass, devId) {
    var lst = list(hass, devId), S = sts(hass);
    var dc = function (e) { return ((S[e.entity_id] || {}).attributes || {}).device_class; };
    var sw = lst.filter(function (e) { return e.domain === 'switch' && !e.category; })[0];
    var pw = lst.filter(function (e) {
      return e.domain === 'sensor' && dc(e) === 'power' && e.platform !== 'powercalc';
    })[0];
    if (!pw) return null;
    return { device: devId, source: 'plug', rank: 2, role: null, how: 'plug', state: sw ? sw.entity_id : pw.entity_id,
             f: { plug: sw ? sw.entity_id : null, power: pw.entity_id }, entry: null };
  }

  // For the tile: source of the device behind the main entity (or the plug itself).
  function forEntity(hass, eid, roles) {
    var devId = deviceOf(hass, eid);
    var c = classify(hass, devId, roles);
    if (c) return c;
    var dom = String(eid || '').split('.')[0];
    if (devId && (dom === 'switch' || dom === 'sensor')) {
      var p = plugOf(hass, devId);
      if (p && (p.f.plug === eid || p.f.power === eid)) return p;
    }
    return null;
  }

  // Every laundry appliance in the house (role 'dishwasher': every dishwasher); per area and kind the best
  // source wins (official before WashData). Devices without an area all stay in.
  function all(hass, role) {
    var D = devs(hass);
    var out = [];
    Object.keys(D).forEach(function (id) {
      var d = D[id];
      if (!d || d.disabled_by || d.entry_type === 'service') return;
      var c = classify(hass, id, role === 'dishwasher' ? [role] : null);
      if (c && (!role || c.role === role)) out.push(c);
    });
    out.sort(function (a, b) { return a.rank - b.rank || (a.device < b.device ? -1 : 1); });
    var best = {};
    return out.filter(function (c) {
      var area = areaOfDev(hass, c.device);
      if (!area) return true;
      var key = area + '|' + c.role;
      if (best[key] !== undefined && best[key] < c.rank) return false;
      best[key] = c.rank;
      return true;
    });
  }

  // Dishwashers the dishwasher card can show: role 'dishwasher' from a source with a dish spec (Home Connect,
  // Home Connect Alt/WS, Miele). Never an oven or coffee machine that shares the operation_state key (Studio:
  // main entity of a new tile and the assistant). WashData dishwashers stay out (the card has no fields for them).
  function dishwashers(hass) {
    return all(hass, 'dishwasher').filter(function (c) {
      return SOURCES.some(function (s) { return s.id === c.source && !!s.dish; });
    });
  }

  // Last resort: smart plugs in an area (only when no laundry appliance is detected there).
  function plugs(hass, areaId) {
    var D = devs(hass);
    return Object.keys(D).filter(function (id) {
      return D[id] && !D[id].disabled_by && (!areaId || D[id].area_id === areaId) && !classify(hass, id);
    }).map(function (id) { return plugOf(hass, id); }).filter(Boolean);
  }

  // Dishwasher: German entity-id suffixes (Home Connect Local, homeconnect_ws, names from its translations/de.json),
  // only when no key and no device class matches – older installs without translation_key. [pattern, domain]
  var DISH_NAMES = {
    program: [/_aktives_programm$/, 'sensor'], sel: [/_ausgewahltes_programm$/, 'select'], phase: [/_programmphase$/, 'sensor'],
    progress: [/_programmfortschritt$/, 'sensor'], remaining: [/_verbleibende_programmlaufzeit$/, 'sensor'],
    energyEst: [/_energieverbrauch_schatzung$/, 'sensor'], waterEst: [/_wasserverbrauch_schatzung$/, 'sensor'],
    salt: [/_salz$/, 'sensor'], rinse: [/_klarspuler$/, 'sensor'], door: [/_tur$/, 'binary_sensor'],
    care: [/_maschinenpflege_erinnerung$/, 'sensor'], starts: [/_startanzahl$/, 'sensor'], conn: [/_verbindung$/, 'binary_sensor'],
    remote: [/_fernbedienung$/, 'select'], startIn: [/_start_in(_relativ)?$/, 'number'], power_sw: [/_einschalter$/, 'switch'],
    remoteStart: [/_fernstart$/, 'binary_sensor'],
    light: [/_info_licht$/, 'switch'], smartFilter: [/_smarte_filterreinigung$/, 'binary_sensor'],
    filterCheck: [/_filtersystem_prufen$/, 'binary_sensor'], machineCare: [/_maschinenreinigung$/, 'binary_sensor'],
    machineFilter: [/_maschinenreinigung_filter$/, 'binary_sensor'],
    extraDry: [/_extra_trocken$/, 'switch'], halfLoad: [/_halbe_ladung$/, 'switch'], speed: [/_speed_on_demand$/, 'switch'],
    silence: [/_silence_on_demand$/, 'switch'], start: [/_start$/, 'button'], stop: [/_abbrechen$/, 'button'],
    // Home Connect in HA core (its translations/de.json): Hygiene + → _hygiene, Intensivzone, refill events.
    hygiene: [/_hygiene(_plus)?$/, 'switch'], intensivZone: [/_intensivzone$/, 'switch'],
    saltLow: [/_salz_fast_leer$/, 'sensor'], saltLack: [/_salzmangel$/, 'sensor'],
    rinseLow: [/_klarspuler_fast_leer$/, 'sensor'], rinseLack: [/_fehlender_klarspuler$/, 'sensor'],
    aquaStop: [/_aquastop_aufgetreten$/, 'binary_sensor'], drainBlocked: [/_ablaufpumpe_blockiert$/, 'binary_sensor'],
    drainImpossible: [/_abpumpen_nicht_moglich$/, 'binary_sensor'], lowPressure: [/_niedriger_wasserdruck$/, 'binary_sensor'],
    calcified: [/_wasserheizung_verkalkt$/, 'binary_sensor'], aborted: [/_programm_abgebrochen$/, 'binary_sensor'],
  };

  // Dishwasher fields on the device of `anchor`: { source, f: {program, sel, door, …} } (every name of
  // DISH_NAMES, null when missing). Sources whose platform the device has come first; without one (test house,
  // a fork with its own platform) every source with a dish spec, in table order. Per field the first hit:
  // keys/device class of the sources, then the German name suffix (not powercalc's estimates).
  function dish(hass, anchor) {
    var devId = deviceOf(hass, anchor);
    var out = { source: null, f: {} };
    var lst = devId ? list(hass, devId) : [];
    var mine = SOURCES.filter(function (s) {
      return s.dish && lst.some(function (e) { return s.platforms.indexOf(e.platform) >= 0; });
    });
    var srcs = mine.length ? mine : SOURCES.filter(function (s) { return s.dish; });
    if (mine.length) out.source = mine[0].id;
    Object.keys(DISH_NAMES).forEach(function (name) {
      var hit = null;
      srcs.forEach(function (s) { if (!hit && s.dish[name]) hit = pick(lst, s.dish[name], hass); });
      var nm = DISH_NAMES[name];
      if (!hit) {
        hit = (lst.filter(function (e) {
          return e.domain === nm[1] && e.platform !== 'powercalc' && nm[0].test(e.entity_id);
        })[0] || {}).entity_id || null;
      }
      out.f[name] = hit;
    });
    return out;
  }
  // One field (Studio placeholder „Automatisch: …“).
  dish.field = function (hass, anchor, name) { return dish(hass, anchor).f[name] || null; };

  window.casoraLaundryFind = { classify: classify, forEntity: forEntity, all: all, plugs: plugs, sources: SOURCES,
    dish: dish, dishNames: DISH_NAMES, dishwashers: dishwashers };
})();

// ── Fridge and freezer: where the values come from (24.10.2026) ───────────────────
// One finder for the fridge card (30-fridge.js), the Studio (main entity of a new tile, field
// placeholders, assistant) and the Python mirror live_finder.py (FRIDGE_SOURCES; dev/unit/live_finder_test.py
// compares the tables). Detected by the entity's platform and its translation_key first, then by names:
//   1. Liebherr (HA core `liebherr`, HomeAPI): zone sensors top_zone/middle_zone/bottom_zone (a single zone has no
//      key, only device_class temperature), numbers setpoint_temperature(_<zone>), switches super_cool/super_frost
//      (_<zone>), night_mode, party_mode; selects BioFresh-Plus, HydroBreeze, IceMaker as extras. The HACS fork
//      (bhuebschen/liebherr, same domain) has climate entities per zone and switches named "<nick> supercool 1".
//   2. Home Connect (HA core `home_connect`, HACS `homeconnect_ws`, `home_connect_alt`): setpoint numbers per
//      compartment, super mode switches, door binary sensors, eco/vacation/sabbath/fresh modes, door alarms.
//   3. Generic: a device named like a fridge or freezer with temperature sensors, numbers and/or a door sensor.
// Without a matching platform (test house: casora_mock) the key combination is enough, as with the laundry finder.
//   casoraFridgeFind.find(hass, anchor) → { device, source, how, anchor, zones[], modes[], doors[], alarms[],
//                                          extras[], watch[] } or null
//   casoraFridgeFind.is(hass, anchor)   → the anchor belongs to a fridge
//   casoraFridgeFind.all(hass)          → every fridge in the house [{ device, anchor, name, source }]
//   casoraFridgeFind.field(hass, anchor, name) → one entity for a Studio field (z1temp, z1set, door, night …)
(function () {
  if (window.casoraFridgeFind) return;

  function reg(hass) { return (hass && hass.entities) || {}; }
  function sts(hass) { return (hass && hass.states) || {}; }
  function devs(hass) { return (hass && hass.devices) || {}; }

  // Zones in display order; labels in German (translated on the way out), the brand names stay.
  var ZONE_ORDER = ['top', 'middle', 'bottom', 'fridge', 'chiller', 'chiller_left', 'chiller_right', 'flex', 'bottle',
    'wine', 'wine2', 'wine3', 'freezer', 'single'];
  var ZONE_LABEL = { top: 'Obere Zone', middle: 'Mittlere Zone', bottom: 'Untere Zone', fridge: 'Kühlteil', freezer: 'Gefrierteil',
    chiller: 'Frischezone', chiller_left: 'Frischezone links', chiller_right: 'Frischezone rechts', flex: 'Flexfach',
    bottle: 'Flaschenkühler', wine: 'Weinfach', wine2: 'Weinfach 2', wine3: 'Weinfach 3', single: 'Temperatur' };
  var MODE = { night: ['Nachtmodus', 'mdi:weather-night'], party: ['Partymodus', 'mdi:party-popper'], vacation: ['Urlaubsmodus', 'mdi:beach'],
    eco: ['Eco-Modus', 'mdi:leaf'], sabbath: ['Sabbat-Modus', 'mdi:candle'], fresh: ['Frische-Modus', 'mdi:sprout'],
    dispenser: ['Wasserspender', 'mdi:cup-water'], assist_fridge: ['Türassistent Kühlteil', 'mdi:door-open'],
    assist_freezer: ['Türassistent Gefrierteil', 'mdi:door-open'] };
  // Super mode words: Liebherr's brand names, Home Connect's plain words.
  var SUPER = { liebherr: { cool: 'SuperCool', frost: 'SuperFrost' }, other: { cool: 'Superkühlen', frost: 'Supergefrieren' } };

  // Tables per source: translation_key (home_connect_alt: end of the entity_id) → zone, [zone, kind] or mode.
  // Plain data, so live_finder.py can hold the same tables (parity test).
  var SOURCES = [
    { id: 'liebherr', platforms: ['liebherr'],
      temps: { top_zone: 'top', middle_zone: 'middle', bottom_zone: 'bottom' },
      sets: { setpoint_temperature: 'single', setpoint_temperature_top_zone: 'top', setpoint_temperature_middle_zone: 'middle',
        setpoint_temperature_bottom_zone: 'bottom' },
      supers: { super_cool: ['single', 'cool'], super_cool_top_zone: ['top', 'cool'], super_cool_middle_zone: ['middle', 'cool'],
        super_cool_bottom_zone: ['bottom', 'cool'], super_frost: ['single', 'frost'], super_frost_top_zone: ['top', 'frost'],
        super_frost_middle_zone: ['middle', 'frost'], super_frost_bottom_zone: ['bottom', 'frost'] },
      modes: { night_mode: 'night', party_mode: 'party' },
      doors: {}, alarms: {},
      // Key prefixes of further settings (selects per zone, presentation light, AutoDoor): rows under "Mehr".
      extras: ['bio_fresh_plus', 'hydro_breeze', 'ice_maker', 'presentation_light', 'auto_door'],
      // A single-zone device: the temperature sensor has no key (HA names it after the device).
      tempDc: true, climate: true, nameSwitches: true },
    { id: 'home_connect', platforms: ['home_connect'],
      temps: {},
      sets: { refrigerator_setpoint_temperature: 'fridge', freezer_setpoint_temperature: 'freezer', chiller_setpoint_temperature: 'chiller',
        chiller_left_setpoint_temperature: 'chiller_left', chiller_right_setpoint_temperature: 'chiller_right',
        bottle_cooler_setpoint_temperature: 'bottle', wine_compartment_setpoint_temperature: 'wine',
        wine_compartment_2_setpoint_temperature: 'wine2', wine_compartment_3_setpoint_temperature: 'wine3' },
      supers: { refrigerator_super_mode: ['fridge', 'cool'], freezer_super_mode: ['freezer', 'frost'] },
      modes: { eco_mode: 'eco', vacation_mode: 'vacation', sabbath_mode: 'sabbath', fresh_mode: 'fresh', dispenser_enabled: 'dispenser',
        door_assistant_fridge: 'assist_fridge', door_assistant_freezer: 'assist_freezer' },
      doors: { refrigerator_door: 'fridge', freezer_door: 'freezer', chiller_door: 'chiller', common_chiller_door: 'chiller',
        left_chiller_door: 'chiller_left', right_chiller_door: 'chiller_right', bottle_cooler_door: 'bottle',
        wine_compartment_door: 'wine', flex_compartment_door: 'flex' },
      alarms: { refrigerator_door_alarm: ['fridge', 'door'], freezer_door_alarm: ['freezer', 'door'], freezer_temperature_alarm: ['freezer', 'temp'] },
      extras: [] },
    { id: 'homeconnect_ws', platforms: ['homeconnect_ws'],
      temps: {},
      sets: { number_setpoint_refrigerator: 'fridge', number_setpoint_freezer: 'freezer', number_setpoint_chiller_common: 'chiller' },
      supers: { switch_super_refrigerator: ['fridge', 'cool'], switch_super_freezer: ['freezer', 'frost'] },
      modes: { switch_refrigerator_eco: 'eco', switch_refrigerator_vacation: 'vacation', switch_refrigerator_sabbath_mode: 'sabbath',
        switch_refrigerator_dispenser_enabled: 'dispenser', switch_refrigerator_dispenser_party_mode: 'party',
        switch_refrigerator_door_assistant_freezer: 'assist_freezer' },
      doors: { binary_sensor_fridge_door_state: 'fridge', binary_sensor_freezer_door_state: 'freezer',
        binary_sensor_chiller_common_door_state: 'chiller' },
      alarms: { binary_sensor_door_alarm_fridge: ['fridge', 'door'], binary_sensor_door_alarm_freezer: ['freezer', 'door'],
        binary_sensor_door_alarm_chiller_common: ['chiller', 'door'], binary_sensor_temperature_alarm_freezer: ['freezer', 'temp'],
        binary_sensor_temperature_alarm_chiller_common: ['chiller', 'temp'] },
      extras: ['switch_refrigeration_light_internal', 'light_internal'] },
    /* Home Connect Alt (HACS, ekutner): generic keys, entity_ids end with the Home Connect key in lower case
       (Refrigeration.FridgeFreezer.Setting.SetpointTemperatureRefrigerator → …_setpointtemperaturerefrigerator). */
    { id: 'home_connect_alt', platforms: ['home_connect_alt'], tail: true,
      temps: {},
      sets: { refrigeration_fridgefreezer_setting_setpointtemperaturerefrigerator: 'fridge', refrigeration_common_setting_refrigerator_setpointtemperature: 'fridge',
        refrigeration_fridgefreezer_setting_setpointtemperaturefreezer: 'freezer', refrigeration_common_setting_freezer_setpointtemperature: 'freezer',
        refrigeration_common_setting_chillercommon_setpointtemperature: 'chiller', refrigeration_common_setting_chillerleft_setpointtemperature: 'chiller_left',
        refrigeration_common_setting_chillerright_setpointtemperature: 'chiller_right', refrigeration_common_setting_bottlecooler_setpointtemperature: 'bottle',
        refrigeration_common_setting_winecompartment_setpointtemperature: 'wine', refrigeration_common_setting_winecompartment2_setpointtemperature: 'wine2',
        refrigeration_common_setting_winecompartment3_setpointtemperature: 'wine3' },
      supers: { refrigeration_fridgefreezer_setting_supermoderefrigerator: ['fridge', 'cool'], refrigeration_common_setting_refrigerator_supermode: ['fridge', 'cool'],
        refrigeration_fridgefreezer_setting_supermodefreezer: ['freezer', 'frost'], refrigeration_common_setting_freezer_supermode: ['freezer', 'frost'] },
      modes: { refrigeration_common_setting_ecomode: 'eco', refrigeration_fridgefreezer_setting_ecomode: 'eco',
        refrigeration_common_setting_vacationmode: 'vacation', refrigeration_fridgefreezer_setting_vacationmode: 'vacation',
        refrigeration_common_setting_sabbathmode: 'sabbath', refrigeration_fridgefreezer_setting_sabbathmode: 'sabbath',
        refrigeration_common_setting_freshmode: 'fresh', refrigeration_fridgefreezer_setting_freshmode: 'fresh',
        refrigeration_common_setting_dispenser_enabled: 'dispenser', refrigeration_common_setting_dispenser_partymode: 'party' },
      doors: { refrigeration_common_status_door_refrigerator: 'fridge', refrigeration_fridgefreezer_status_doorrefrigerator: 'fridge',
        refrigeration_common_status_door_freezer: 'freezer', refrigeration_fridgefreezer_status_doorfreezer: 'freezer',
        refrigeration_common_status_door_chiller: 'chiller', refrigeration_common_status_door_chillercommon: 'chiller',
        refrigeration_common_status_door_chillerleft: 'chiller_left', refrigeration_common_status_door_chillerright: 'chiller_right',
        refrigeration_common_status_door_bottlecooler: 'bottle', refrigeration_common_status_door_winecompartment: 'wine',
        refrigeration_common_status_door_flexcompartment: 'flex' },
      alarms: { refrigeration_fridgefreezer_event_dooralarmrefrigerator: ['fridge', 'door'], refrigeration_common_event_door_alarmrefrigerator: ['fridge', 'door'],
        refrigeration_fridgefreezer_event_dooralarmfreezer: ['freezer', 'door'], refrigeration_common_event_door_alarmfreezer: ['freezer', 'door'],
        refrigeration_fridgefreezer_event_temperaturealarmfreezer: ['freezer', 'temp'], refrigeration_common_event_freezer_temperaturealarm: ['freezer', 'temp'] },
      extras: [] },
  ];
  // Names that say "fridge" (generic source, and the HACS Liebherr fork's switches).
  var FRIDGE_NAME = /k(ü|ue|u)hl|fridge|refrigerat|gefrier|freezer|tiefk(ü|ue|u)hl|frigo|nevera|congelador|eisschrank/i;
  var NOT_FRIDGE_NAME = /k(ü|ue|u)hlk(ö|oe|o)rper|radiator|wasserk(ü|ue|u)hl|cpu|gpu|k(ü|ue|u)hlmittel|coolant|cooler master|k(ü|ue|u)hlwasser/i;
  var DOOR_DC = /^(door|opening|garage_door)$/;
  var DEAD = function (s) { return s == null || s === '' || s === 'unknown' || s === 'unavailable'; };

  // Entity ids of a device: the shared index (casoraDeviceEntities above), a scan when this block runs alone (unit tests).
  var devIds = function (R, d) {
    return window.casoraDeviceEntities ? window.casoraDeviceEntities(R, d)
      : Object.keys(R).filter(function (x) { return R[x] && R[x].device_id === d; }).sort();
  };
  function list(hass, devId) {
    var R = reg(hass), S = sts(hass);
    return devIds(R, devId).filter(function (eid) {
      var e = R[eid];
      return e && !e.disabled_by && S[eid];
    }).map(function (eid) { return item(hass, eid); });
  }
  function item(hass, eid) {
    var e = reg(hass)[eid] || {}, st = sts(hass)[eid], a = (st && st.attributes) || {};
    return { entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0], platform: e.platform || null,
      category: e.entity_category || null, hidden: !!e.hidden, dc: a.device_class || null, unit: a.unit_of_measurement || null,
      name: String(a.friendly_name || e.name || e.original_name || '') };
  }
  // The key of an entity for a source: its translation_key, for Home Connect Alt the matching end of the entity_id.
  function keyOf(src, e, table) {
    if (!src.tail) return e.key && table[e.key] !== undefined ? e.key : null;
    var obj = String(e.entity_id).split('.')[1] || '';
    var hit = null;
    Object.keys(table).forEach(function (t) { if (!hit && (obj === t || obj.slice(-(t.length + 1)) === '_' + t)) hit = t; });
    return hit;
  }
  function hasAny(src, lst, table, domain) {
    return lst.some(function (e) { return (!domain || e.domain === domain) && keyOf(src, e, table) !== null; });
  }
  // A source matches: by platform, else (no other known platform on the device) by its keys alone.
  function matches(src, lst) {
    if (lst.some(function (e) { return src.platforms.indexOf(e.platform) >= 0; })) return 'platform';
    var known = SOURCES.some(function (o) { return o !== src && lst.some(function (e) { return o.platforms.indexOf(e.platform) >= 0; }); });
    if (known || src.tail) return null;
    var ok = hasAny(src, lst, src.sets, 'number') || hasAny(src, lst, src.temps, 'sensor') || hasAny(src, lst, src.supers, 'switch');
    return ok ? 'keys' : null;
  }
  // Does the device look like a refrigeration appliance of this source at all (Home Connect also builds ovens)?
  function refrigerates(src, lst) {
    if (src.tail) return lst.some(function (e) { return /(^|_)refrigeration_/.test(String(e.entity_id).split('.')[1] || ''); });
    return hasAny(src, lst, src.sets, 'number') || hasAny(src, lst, src.temps, 'sensor') || hasAny(src, lst, src.supers, 'switch')
      || hasAny(src, lst, src.doors, 'binary_sensor') || (src.climate && lst.some(function (e) { return e.domain === 'climate'; }));
  }
  function devName(hass, devId) {
    var d = devs(hass)[devId] || {};
    return String(d.name_by_user || d.name || '');
  }
  // Entity name without the device name in front ("Combi Obere Zone" → "Obere Zone").
  function shortName(name, dev) {
    var n = String(name || '').trim(), d = String(dev || '').trim();
    if (d && n.toLowerCase().indexOf(d.toLowerCase()) === 0) n = n.slice(d.length).replace(/^[\s:\-–·]+/, '');
    return n || String(name || '');
  }

  function zoneIn(zones, key, label) {
    var z = zones.filter(function (x) { return x.key === key; })[0];
    if (!z) { z = { key: key, label: label || ZONE_LABEL[key] || key, temp: null, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null }; zones.push(z); }
    return z;
  }
  function order(zones) {
    return zones.slice().sort(function (a, b) {
      var ia = ZONE_ORDER.indexOf(a.key), ib = ZONE_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a.key < b.key ? -1 : 1);
    });
  }
  // Keyed source: zones, modes, doors, alarms from the tables.
  function build(src, hass, lst, devId) {
    var zones = [], modes = [], alarms = [], extras = [], dn = devName(hass, devId);
    var S = sts(hass);
    var words = SUPER[src.id === 'liebherr' ? 'liebherr' : 'other'];
    var seen = {};
    var take = function (e) { seen[e.entity_id] = true; };
    lst.forEach(function (e) {
      var k;
      if (e.domain === 'sensor' && (k = keyOf(src, e, src.temps))) { zoneIn(zones, src.temps[k]).temp = e.entity_id; take(e); return; }
      if (e.domain === 'number' && (k = keyOf(src, e, src.sets))) { zoneIn(zones, src.sets[k]).set = e.entity_id; take(e); return; }
      if (e.domain === 'switch' && (k = keyOf(src, e, src.supers))) {
        var z = zoneIn(zones, src.supers[k][0]); z.sup = e.entity_id; z.supKind = src.supers[k][1]; z.supLabel = words[z.supKind]; take(e); return;
      }
      if (e.domain === 'switch' && (k = keyOf(src, e, src.modes))) {
        var m = src.modes[k];
        if (!modes.some(function (x) { return x.key === m; })) modes.push({ key: m, id: e.entity_id, label: MODE[m][0], icon: MODE[m][1] });
        take(e); return;
      }
      if (e.domain === 'binary_sensor' && (k = keyOf(src, e, src.doors))) { zoneIn(zones, src.doors[k]).door = e.entity_id; take(e); return; }
      if ((e.domain === 'sensor' || e.domain === 'binary_sensor' || e.domain === 'event') && (k = keyOf(src, e, src.alarms))) {
        var za = zoneIn(zones, src.alarms[k][0]);
        if (src.alarms[k][1] === 'temp') za.alarmTemp = e.entity_id; else za.alarm = e.entity_id;
        alarms.push({ id: e.entity_id, zone: za.key, kind: src.alarms[k][1] }); take(e); return;
      }
      if (e.key && src.extras.some(function (p) { return e.key.indexOf(p) === 0; }) && !e.category) { extras.push(e.entity_id); take(e); }
    });
    // Liebherr single zone: the temperature sensor carries no key.
    if (src.tempDc) {
      lst.forEach(function (e) {
        if (seen[e.entity_id] || e.domain !== 'sensor' || e.dc !== 'temperature' || e.category) return;
        if (!zones.length) { zoneIn(zones, 'single').temp = e.entity_id; take(e); }
        else if (zones.length === 1 && !zones[0].temp) { zones[0].temp = e.entity_id; take(e); }
      });
    }
    // HACS Liebherr: climate per zone, switches by name.
    if (src.climate) {
      lst.forEach(function (e) {
        if (seen[e.entity_id] || e.domain !== 'climate') return;
        var ztemp = zones.filter(function (z) { return !z.set && !z.climate; })[0];
        // Position from the id or name (the fork appends top/bottom or the zone number), so zones keep their order.
        var t = (String(e.entity_id).split('.')[1] + ' ' + e.name).toLowerCase();
        var pos = /top|upper|oben|obere/.test(t) ? 'top' : /middle|mitte/.test(t) ? 'middle' : /bottom|lower|unten|untere/.test(t) ? 'bottom' : 'c' + zones.length;
        var z = ztemp && zones.length === 1 ? ztemp : zoneIn(zones, pos, shortName(e.name, dn) || ('Zone ' + (zones.length + 1)));
        z.climate = e.entity_id; take(e);
      });
    }
    if (src.nameSwitches) {
      lst.forEach(function (e) {
        if (seen[e.entity_id] || e.domain !== 'switch' || e.category) return;
        var n = (String(e.entity_id).split('.')[1] + ' ' + e.name).toLowerCase();
        var m = /nightmode|night_mode/.test(n) ? 'night' : /partymode|party_mode/.test(n) ? 'party' : /holidaymode|holiday_mode|vacation/.test(n) ? 'vacation' : null;
        if (m) { if (!modes.some(function (x) { return x.key === m; })) modes.push({ key: m, id: e.entity_id, label: MODE[m][0], icon: MODE[m][1] }); take(e); return; }
        var kind = /supercool|super_cool/.test(n) ? 'cool' : /superfrost|super_frost/.test(n) ? 'frost' : null;
        if (!kind) return;
        // "<nick> supercool 1": zone by its number, else the first zone without a super switch.
        var num = /(\d+)\s*$/.exec(n), idx = num ? parseInt(num[1], 10) - 1 : -1;
        var zs = order(zones), z = (idx >= 0 && zs[idx]) || zs.filter(function (x) { return !x.sup; })[0] || zoneIn(zones, 'single');
        z.sup = e.entity_id; z.supKind = kind; z.supLabel = words[kind]; take(e);
      });
    }
    // A single zone with a plain label: say what it is by its target.
    zones.forEach(function (z) {
      if (z.key !== 'single') return;
      var v = parseFloat(((S[z.set] || S[z.temp] || {}).state) || NaN);
      z.label = isFinite(v) ? (v <= -2 ? ZONE_LABEL.freezer : ZONE_LABEL.fridge) : ZONE_LABEL.single;
    });
    return { zones: order(zones), modes: modes, alarms: alarms, extras: extras };
  }
  // Generic: a device named like a fridge – temperature sensors as zones, numbers as setpoints, door sensors,
  // every plain switch as a mode with its own name.
  function buildGeneric(hass, lst, devId, anchor) {
    var dn = devName(hass, devId);
    var temps = lst.filter(function (e) { return e.domain === 'sensor' && e.dc === 'temperature' && !e.category && !e.hidden; });
    var nums = lst.filter(function (e) { return e.domain === 'number' && !e.category && (e.dc === 'temperature' || /°/.test(String(e.unit || ''))); });
    var clim = lst.filter(function (e) { return e.domain === 'climate'; });
    var doors = lst.filter(function (e) { return e.domain === 'binary_sensor' && DOOR_DC.test(String(e.dc || '')) && !e.category; });
    var sws = lst.filter(function (e) { return e.domain === 'switch' && !e.category && !e.hidden; });
    // A door contact alone is a door, not a fridge (it belongs in the card's door field): a temperature is needed.
    if (!temps.length && !nums.length && !clim.length) return null;
    var zones = [];
    var label = function (e, i, n) { var s = shortName(e.name, dn); return s && s.toLowerCase() !== dn.toLowerCase() ? s : (n > 1 ? 'Zone ' + (i + 1) : ZONE_LABEL.single); };
    temps.forEach(function (e, i) { zones.push({ key: 'n' + i, label: label(e, i, temps.length), temp: e.entity_id, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null }); });
    if (nums.length === temps.length) nums.forEach(function (e, i) { zones[i].set = e.entity_id; });
    else nums.forEach(function (e, i) { zones.push({ key: 's' + i, label: label(e, i, nums.length), temp: null, set: e.entity_id, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null }); });
    clim.forEach(function (e, i) {
      var z = zones.filter(function (x) { return !x.set && !x.climate && !x.temp; })[0];
      if (!z) { z = { key: 'c' + i, label: label(e, i, clim.length), temp: null, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null }; zones.push(z); }
      z.climate = e.entity_id;
    });
    if (!zones.length) zones.push({ key: 'single', label: ZONE_LABEL.single, temp: null, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null });
    if (doors.length === zones.length) doors.forEach(function (e, i) { zones[i].door = e.entity_id; });
    else if (doors.length === 1) zones[0].door = doors[0].entity_id;
    var modes = sws.map(function (e, i) {
      var n = shortName(e.name, dn) || e.name;
      var m = /super\s*cool/i.test(n) ? 'cool' : /super\s*fro/i.test(n) ? 'frost' : null;
      return { key: 'sw' + i, id: e.entity_id, label: n, icon: m === 'cool' ? 'mdi:snowflake' : m === 'frost' ? 'mdi:snowflake-variant' : 'mdi:toggle-switch-outline' };
    });
    var extraDoors = doors.length !== zones.length && doors.length > 1 ? doors.slice(1).map(function (e) { return { id: e.entity_id, label: shortName(e.name, dn) || 'Tür' }; }) : [];
    return { zones: zones, modes: modes, alarms: [], extras: [], extraDoors: extraDoors };
  }
  function nameHit(text) { return FRIDGE_NAME.test(text) && !NOT_FRIDGE_NAME.test(text); }

  // Classify a device: null when it is no fridge.
  function classify(hass, devId, anchor) {
    if (!devId) return null;
    var lst = list(hass, devId);
    if (!lst.length) return null;
    var out = null, how = null, src = null;
    for (var i = 0; i < SOURCES.length && !out; i++) {
      how = matches(SOURCES[i], lst);
      if (!how || !refrigerates(SOURCES[i], lst)) continue;
      src = SOURCES[i];
      out = build(src, hass, lst, devId);
    }
    if (!out) {
      // Generic only for a device that says so by its name (its own or the anchor's), never for every thermometer.
      var txt = devName(hass, devId) + ' ' + (anchor ? (item(hass, anchor).name + ' ' + anchor) : '');
      if (!nameHit(txt)) return null;
      // A device of a known source that does not refrigerate (an oven) is no fridge, whatever its name.
      if (SOURCES.some(function (o) { return lst.some(function (e) { return o.platforms.indexOf(e.platform) >= 0; }); })) return null;
      out = buildGeneric(hass, lst, devId, anchor);
      if (!out) return null;
      src = { id: 'generic' }; how = 'name';
    }
    return finish(hass, out, devId, src.id, how, anchor);
  }
  function finish(hass, out, devId, source, how, anchor) {
    var zones = out.zones;
    var doors = zones.filter(function (z) { return z.door; }).map(function (z) { return { id: z.door, label: z.label, zone: z.key }; })
      .concat(out.extraDoors || []);
    var anchors = [].concat(zones.map(function (z) { return z.temp; }), zones.map(function (z) { return z.set; }), zones.map(function (z) { return z.climate; }),
      doors.map(function (d) { return d.id; })).filter(Boolean);
    if (!anchors.length) return null;
    var watch = anchors.concat(zones.map(function (z) { return z.sup; }), zones.map(function (z) { return z.alarm; }), zones.map(function (z) { return z.alarmTemp; }),
      out.modes.map(function (m) { return m.id; }), out.extras).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    return { device: devId, source: source, how: how, anchor: anchor && anchors.indexOf(anchor) >= 0 ? anchor : anchors[0],
      main: anchors[0], zones: zones, modes: out.modes, doors: doors, alarms: out.alarms, extras: out.extras, watch: watch };
  }
  // An entity without a device: only when the user picked it and it says "fridge" (a lone thermometer).
  function lone(hass, eid) {
    var S = sts(hass);
    if (!eid || !S[eid]) return null;
    var e = item(hass, eid);
    if (!nameHit(e.name + ' ' + eid)) return null;
    var z = { key: 'single', label: ZONE_LABEL.single, temp: null, set: null, climate: null, sup: null, supKind: null, supLabel: null, door: null, alarm: null, alarmTemp: null };
    if (e.domain === 'sensor') z.temp = eid; else if (e.domain === 'number') z.set = eid; else if (e.domain === 'climate') z.climate = eid;
    else if (e.domain === 'binary_sensor') z.door = eid; else return null;
    return finish(hass, { zones: [z], modes: [], alarms: [], extras: [] }, null, 'generic', 'name', eid);
  }

  var memo = { reg: null, map: {} };
  function find(hass, anchor) {
    if (!anchor) return null;
    var R = reg(hass);
    if (memo.reg !== R) memo = { reg: R, map: {} };
    var e = R[anchor];
    var devId = (e && e.device_id) || null;
    var key = (devId || '-') + '|' + anchor;
    if (memo.map[key] !== undefined) return memo.map[key];
    var out = devId ? classify(hass, devId, anchor) : lone(hass, anchor);
    memo.map[key] = out;
    return out;
  }
  function is(hass, anchor) { return !!find(hass, anchor); }
  // Every fridge in the house: one entry per device, the main entity as anchor.
  // Kept per registry, devices and states object: the Studio asks for it per candidate entity.
  var allMemo = { reg: null, devs: null, sts: null, out: null };
  function all(hass) {
    var D = devs(hass), R = reg(hass), S = sts(hass);
    if (allMemo.out && allMemo.reg === R && allMemo.devs === D && allMemo.sts === S) return allMemo.out.slice();
    var out = allFresh(hass, D);
    allMemo = { reg: R, devs: D, sts: S, out: out };
    return out.slice();
  }
  function allFresh(hass, D) {
    var out = [];
    Object.keys(D).forEach(function (id) {
      var d = D[id];
      if (!d || d.disabled_by || d.entry_type === 'service') return;
      var c = classify(hass, id, null);
      if (c) out.push({ device: id, anchor: c.main, name: devName(hass, id), source: c.source, area: d.area_id || null });
    });
    // The makers' integrations before a device that is a fridge only by its name.
    out.sort(function (a, b) { return (a.source === 'generic') - (b.source === 'generic') || a.name.localeCompare(b.name) || (a.device < b.device ? -1 : 1); });
    return out;
  }
  // One entity for a Studio field (placeholder "Automatisch: …").
  var FIELDS = {
    z1temp: function (c) { return (c.zones[0] || {}).temp || null; }, z1set: function (c) { return (c.zones[0] || {}).set || (c.zones[0] || {}).climate || null; },
    z2temp: function (c) { return (c.zones[1] || {}).temp || null; }, z2set: function (c) { return (c.zones[1] || {}).set || (c.zones[1] || {}).climate || null; },
    door: function (c) { return (c.doors[0] || {}).id || null; },
    supercool: function (c) { return (c.zones.filter(function (z) { return z.supKind === 'cool'; })[0] || {}).sup || null; },
    superfrost: function (c) { return (c.zones.filter(function (z) { return z.supKind === 'frost'; })[0] || {}).sup || null; },
    night: function (c) { return (c.modes.filter(function (m) { return m.key === 'night'; })[0] || {}).id || null; },
    party: function (c) { return (c.modes.filter(function (m) { return m.key === 'party'; })[0] || {}).id || null; },
  };
  function field(hass, anchor, name) {
    var c = find(hass, anchor);
    return c && FIELDS[name] ? FIELDS[name](c) : null;
  }

  window.casoraFridgeFind = { find: find, is: is, all: all, field: field, classify: classify, sources: SOURCES,
    zoneLabel: ZONE_LABEL, modeInfo: MODE, superWords: SUPER, nameRe: FRIDGE_NAME, notNameRe: NOT_FRIDGE_NAME, dead: DEAD };
})();

// ── Assist suggestions from the own house (D-ASSIST, 06.10.2026) ────────────
// Formerly fixed sentences per time of day („Wie warm ist das Aquarium?“) – in another house
// they led nowhere. Now building blocks that only appear when there are matching devices;
// room names come from the HA areas. Order: first what needs doing right now (window/door
// open, unlocked, light on), then the time of day, then general ones. No randomness – same
// situation, same suggestions. Sentences in German; English via phrases/en.json (casoraTr).
//   casoraAssistIdeas(hass, { hour, max }) → [{ q, icon, tone }]
//   casoraAssistIdeas.slot(hour)            → 'morgen' | 'tag' | 'abend' | 'nacht'
// tone: light | security | climate | energy | media | general (colour of the icon circle).
// Test: dev/unit/assist_vorschlaege.mjs
(function () {
  if (window.casoraAssistIdeas) return;
  var OUTSIDE = /outdoor|aussen|außen|outside|draussen|draußen|garten|terrasse|balkon|garden|terrace|balcony/i;
  function slot(h) { return h >= 5 && h < 10 ? 'morgen' : h >= 10 && h < 17 ? 'tag' : h >= 17 && h < 22 ? 'abend' : 'nacht'; }
  // „im Wohnzimmer“ but „in der Küche“: detect feminine room words by the first word.
  function inRoom(name) {
    var w = String(name || '').trim().split(/\s+/)[0].toLowerCase();
    var fem = /(e|ung|ei|heit|keit|ion|tät|kammer|statt|halle)$/.test(w);
    return (fem ? 'in der ' : 'im ') + String(name).trim();
  }
  function ideas(hass, o) {
    o = o || {};
    var S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {}, A = (hass && hass.areas) || {};
    var hour = o.hour != null ? o.hour : new Date().getHours();
    var max = o.max || 4;
    var dead = function (s) { return !s || s.state === 'unavailable' || s.state === 'unknown'; };
    // Visible entities of a domain (without hidden, diagnostic and config entities)
    var ids = Object.keys(S).filter(function (id) {
      var e = R[id];
      return !(e && (e.hidden || e.hidden_by || e.entity_category || e.disabled_by));
    });
    var dom = function (d) { return ids.filter(function (id) { return id.indexOf(d + '.') === 0; }); };
    var attr = function (id) { return (S[id] && S[id].attributes) || {}; };
    var areaOf = function (id) {
      var e = R[id]; if (!e) return null;
      var a = e.area_id || ((D[e.device_id] || {}).area_id) || null;
      return a && A[a] ? a : null;
    };
    var lights = dom('light').filter(function (id) { return !dead(S[id]) && !Array.isArray(attr(id).entity_id); });
    var lightsOn = lights.filter(function (id) { return S[id].state === 'on'; });
    var notOpening = window.casoraNotAnOpening || function () { return false; };
    var contacts = dom('binary_sensor').filter(function (id) {
      var dc = attr(id).device_class;
      return (dc === 'window' || dc === 'door' || dc === 'garage_door') && !notOpening(hass, id) && !dead(S[id]);
    });
    var windows = contacts.filter(function (id) { return attr(id).device_class === 'window'; });
    var doors = contacts.filter(function (id) { return attr(id).device_class !== 'window'; });
    var isOn = function (id) { return S[id].state === 'on'; };
    var locks = dom('lock').filter(function (id) { return !dead(S[id]); });
    var unlocked = locks.filter(function (id) { return S[id].state === 'unlocked' || S[id].state === 'open'; });
    var alarms = dom('alarm_control_panel').filter(function (id) { return !dead(S[id]); });
    var covers = dom('cover').filter(function (id) {
      return !dead(S[id]) && ['garage', 'gate', 'door', 'damper'].indexOf(attr(id).device_class) < 0 && !Array.isArray(attr(id).entity_id);
    });
    var media = dom('media_player').filter(function (id) { return !dead(S[id]); });
    var vacuums = dom('vacuum').filter(function (id) { return !dead(S[id]); });
    var power = dom('sensor').filter(function (id) { return attr(id).device_class === 'power' && !dead(S[id]); });
    var weather = dom('weather').filter(function (id) { return !dead(S[id]); });
    var shopping = dom('todo').filter(function (id) { return /shopping|einkauf/i.test(id + ' ' + (attr(id).friendly_name || '')); });

    // Rooms by weight (lights, climate, media, blinds) – the main room first, ties by name.
    var weight = {};
    lights.concat(dom('climate'), media, covers).forEach(function (id) { var a = areaOf(id); if (a) weight[a] = (weight[a] || 0) + 1; });
    var rank = function (list) {
      return list.filter(function (a, i) { return a && list.indexOf(a) === i; }).sort(function (x, y) {
        return (weight[y] || 0) - (weight[x] || 0) || String(A[x].name).localeCompare(String(A[y].name));
      });
    };
    var warmRooms = rank(dom('climate').filter(function (id) { return !dead(S[id]) && attr(id).current_temperature != null; }).map(areaOf)
      .concat(dom('sensor').filter(function (id) { return attr(id).device_class === 'temperature' && !dead(S[id]); }).map(areaOf)))
      .filter(function (a) { return !OUTSIDE.test(A[a].name || ''); });
    var dimOn = rank(lightsOn.filter(function (id) { var m = attr(id).supported_color_modes; return !m || m.join(',') !== 'onoff'; }).map(areaOf));
    var dimAny = rank(lights.filter(function (id) { var m = attr(id).supported_color_modes; return !m || m.join(',') !== 'onoff'; }).map(areaOf));
    var washerRuns = false;
    try {
      var LF = window.casoraLaundryFind;
      washerRuns = !!(LF && LF.all(hass, 'washer').some(function (c) {
        var run = c.f && c.f.running && S[c.f.running];
        if (run) return run.state === 'on';
        var st = c.state && S[c.state] ? String(S[c.state].state).toLowerCase() : '';
        return /^(run|running|wash|washing|main_wash|rinse|rinsing|spin|spinning|läuft|in_betrieb|active)$/.test(st);
      }));
    } catch (e) { washerRuns = false; }
    var wasteSoon = false;
    try {
      var W = window.casoraDevice && window.casoraDevice.waste(hass, {});
      wasteSoon = !!(W && W.bins.length && W.days != null && W.days <= 1);
    } catch (e) { wasteSoon = false; }

    var Q = {
      windows: { q: 'Welche Fenster sind offen?', icon: 'mdi:window-open-variant', tone: 'security' },
      doors: { q: 'Welche Türen sind offen?', icon: 'mdi:door-open', tone: 'security' },
      locked: { q: 'Ist alles abgeschlossen?', icon: 'mdi:lock-outline', tone: 'security' },
      lightsOn: { q: 'Welche Lichter sind an?', icon: 'mdi:lightbulb-group-outline', tone: 'light' },
      allOff: { q: 'Schalte alle Lichter aus', icon: 'mdi:lightbulb-off-outline', tone: 'light' },
      arm: { q: 'Alarm scharf schalten', icon: 'mdi:shield-lock-outline', tone: 'security' },
      weather: { q: 'Wie wird das Wetter heute?', icon: 'mdi:weather-partly-cloudy', tone: 'general' },
      waste: { q: 'Muss heute eine Tonne raus?', icon: 'mdi:trash-can-outline', tone: 'general' },
      coversUp: { q: 'Öffne die Jalousien', icon: 'mdi:blinds-open', tone: 'general' },
      coversDown: { q: 'Schließe die Jalousien', icon: 'mdi:blinds', tone: 'general' },
      power: { q: 'Wie viel Strom brauchen wir gerade?', icon: 'mdi:flash-outline', tone: 'energy' },
      washer: { q: 'Läuft die Waschmaschine noch?', icon: 'mdi:washing-machine', tone: 'general' },
      vacuum: { q: 'Starte den Saugroboter', icon: 'mdi:robot-vacuum', tone: 'general' },
      playing: { q: 'Was läuft gerade?', icon: 'mdi:music-note-outline', tone: 'media' },
      shopping: { q: 'Was steht auf der Einkaufsliste?', icon: 'mdi:cart-outline', tone: 'general' },
    };
    var warm = warmRooms[0] ? { q: 'Wie warm ist es ' + inRoom(A[warmRooms[0]].name) + '?', icon: 'mdi:thermometer', tone: 'climate' } : null;
    var dimRoom = dimOn[0] || dimAny[0];
    var dim = dimRoom ? { q: 'Dimme das Licht ' + inRoom(A[dimRoom].name), icon: 'mdi:lightbulb-on-50', tone: 'light' } : null;
    var night = slot(hour) === 'nacht';

    // 1) Needs action
    var now = [];
    if (windows.some(isOn)) now.push(Q.windows);
    if (unlocked.length) now.push(Q.locked);
    if (doors.some(isOn)) now.push(Q.doors);
    if (lightsOn.length) now.push(night ? Q.allOff : Q.lightsOn);
    if (night && alarms.some(function (id) { return S[id].state === 'disarmed'; })) now.push(Q.arm);
    // 2) Time of day
    var part = {
      morgen: [weather.length && Q.weather, wasteSoon && Q.waste, covers.length && covers.every(function (id) { return S[id].state === 'closed'; }) && Q.coversUp, warm],
      tag: [power.length && Q.power, washerRuns && Q.washer, vacuums.some(function (id) { return S[id].state === 'docked'; }) && Q.vacuum, warm],
      abend: [covers.some(function (id) { return S[id].state === 'open'; }) && Q.coversDown, media.some(function (id) { return S[id].state === 'playing'; }) && Q.playing, dim, windows.length && Q.windows],
      nacht: [locks.length && Q.locked, windows.length && Q.windows, alarms.some(function (id) { return S[id].state === 'disarmed'; }) && Q.arm],
    }[slot(hour)];
    // 3) General (only what the house has)
    var general = [warm, weather.length && Q.weather, locks.length && Q.locked, windows.length && Q.windows,
      shopping.length && Q.shopping, lights.length && Q.lightsOn, power.length && Q.power, dim];
    var out = [], seen = {};
    now.concat(part, general).forEach(function (x) {
      if (!x || seen[x.q] || out.length >= max) return;
      seen[x.q] = 1; out.push(x);
    });
    return out;
  }
  ideas.slot = slot;
  ideas.inRoom = inRoom;
  window.casoraAssistIdeas = ideas;
})();

// ── Hidden rows of automatic popups (issue #54, 24.10.2026) ───────────────────
// Some popups collect their rows themselves (room climate: the rooms of sensor.casora_lueften,
// batteries: every battery sensor of the house). The Studio lets the user switch single rows off;
// the tile keeps them in variables.popup_hide: ["<id>", …] (entity ids, or the row's own key such as
// the area id of a room). Every module that collects rows by itself applies the list in one place:
//   window.casoraPopupHide.rows(rows, variables)   – UI.group rows without the hidden ones (r.entity or r.id)
//   window.casoraPopupHide.ids(ids, variables)     – a plain id list without the hidden ones
//   window.casoraPopupHide.has(variables, id)      – is this id hidden?
// The Studio list „Shown in the popup“ (casora-panel-popups.js, _popupHideRows) asks the module for
// its candidates: casoraPopupHide.register('<tile template>', { entries(hass, variables, room) }) with
// entries → [{ id, name, sub }] in the popup's order, room = the Studio room's name (null on Home).
// Adding the list to another automatic popup = three steps: 1) filter the collected rows with
// rows()/ids() in the module (also where the tile sums them up), 2) register() the candidates,
// 3) if the module is not loaded in the Studio, name its script in LOAD (casora-panel-popups.js).
// Here and not in casora-core.js: the Studio loads this file, never casora-core.js.
(function () {
  if (window.casoraPopupHide) return;
  var KEY = 'popup_hide';
  var list = function (variables) {
    var v = variables && variables[KEY];
    if (typeof v === 'string') v = [v];
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : [];
  };
  var H = window.casoraPopupHide = {
    KEY: KEY,
    list: list,
    has: function (variables, id) { return !!id && list(variables).indexOf(id) > -1; },
    ids: function (ids, variables) {
      var hide = list(variables);
      return (ids || []).filter(function (id) { return hide.indexOf(id) < 0; });
    },
    rows: function (rows, variables) {
      var hide = list(variables);
      if (!hide.length) return rows || [];
      return (rows || []).filter(function (r) { return !r || hide.indexOf(r.entity || r.id) < 0; });
    },
    sources: {},
    register: function (template, source) { if (template && source && typeof source.entries === 'function') H.sources[template] = source; },
    // Candidates of a tile's popup for the Studio, or null when no module registered the template.
    entries: function (template, hass, variables, room) {
      var s = H.sources[template];
      if (!s) return null;
      try { return s.entries(hass, variables || {}, room || null) || []; } catch (e) { return []; }
    },
  };

  // Batteries (casora_battery): the pick of casoraBattery.scan (casora-core.js) and the battery popup –
  // every battery sensor with a number, without personal devices and the solar storage; a chosen list
  // (batteries / entity_filter) wins. opts.all keeps the hidden ones (Studio list).
  var PERSONAL = /iphone|ipad|\bwatch\b|ebike|e-bike|drive_unit|performance_line/i;
  var num = function (s) { var n = parseFloat(s); return isFinite(n) ? n : null; };
  H.batteries = function (states, variables, hass, opts) {
    var S = states || (hass && hass.states) || {}, v = variables || {};
    var dcOf = function (e) { return e && e.attributes && e.attributes.device_class; };
    var given = v.batteries || v.entity_filter;
    var chosen = Array.isArray(given) && given.some(function (id) { return dcOf(S[id]) === 'battery'; }) ? given : null;
    var ex = window.casoraDevice && hass ? window.casoraDevice.byKey(hass, 'anker_solix', 'state_of_charge', 'sensor') : null;
    var all = chosen ? chosen.map(function (id) { return S[id]; }).filter(Boolean)
      : Object.keys(S).map(function (id) { return S[id]; }).filter(function (e) {
        return e.entity_id !== ex && !PERSONAL.test(e.entity_id + ' ' + ((e.attributes || {}).friendly_name || ''));
      });
    all = all.filter(function (e) {
      return dcOf(e) === 'battery' && e.state !== 'unavailable' && e.state !== 'unknown' && num(e.state) != null;
    });
    if (opts && opts.all) return all;
    return all.filter(function (e) { return !H.has(v, e.entity_id); });
  };
  H.register('casora_battery', {
    entries: function (hass, variables) {
      return H.batteries(null, variables, hass, { all: true })
        .sort(function (a, b) { return num(a.state) - num(b.state); })
        .map(function (e) {
          var n = num(e.state);
          return { id: e.entity_id, name: String((e.attributes || {}).friendly_name || e.entity_id), sub: n != null ? Math.round(n) + ' %' : null };
        });
    },
  });
})();

// ── Velair: schedules for climates (community card, issue #32) ─────────────────────────────────────────────
// Velair (HACS, cgonfer/velair, domain velair) is a scheduler, not a device: one service device "Velair" with a few
// entities that plans the climate entities of other integrations. Casora detects it ONLY by the platform velair in
// the entity registry (hass.entities). Schedules are no entities: Velair's public WebSocket API sends them
// (velair/get_schedule, velair/subscribe_updates – what its own panel and card use, docs/developer/api.md); writes go
// through Velair's services. Never Velair's hass.data/runtime_data.
//   casoraVelairFind.SOURCE             – the one table: platform, translation_keys, WS commands, services, weekdays
//   casoraVelairFind.present(hass)      – Velair is installed (an entity with platform velair)
//   casoraVelairFind.entities(hass)     – Velair's own entities by role { auto, mode, status, next, zones: [] }
//   casoraVelairFind.data()             – the last schedule response (null until loaded)
//   casoraVelairFind.load(hass, force)  – Promise of the response; subscribes once for live updates
//   casoraVelairFind.managed(hass, id)  – true/false from the data; before it arrives Velair's zone sensors as a hint, else null
//   casoraVelairFind.climates(hass)     – climate ids Velair manages (data, else the zone-sensor hint)
//   casoraVelairFind.onChange(fn)       – fn(data) after every update
(function () {
  if (window.casoraVelairFind) return;
  var SOURCE = {
    id: 'velair', platforms: ['velair'],
    // translation_key → role (custom_components/velair: switch.py, select.py, sensor.py)
    keys: {
      'switch': { automatic_scheduling: 'auto' },
      select: { mode: 'mode' },
      sensor: { scheduler_status: 'status', next_climate_event: 'next', zone_control: 'zoneControl',
        zone_active_target_temperature: 'zoneTarget', zone_override_state: 'zoneOverride' },
    },
    ws: { read: 'velair/get_schedule', subscribe: 'velair/subscribe_updates' },
    services: { setDay: 'set_daily_schedule', copyDay: 'copy_day_schedule', clearDay: 'clear_schedule',
      pause: 'pause_zone', resume: 'resume_zone', resumeAuto: 'resume_automatic_control', boost: 'boost', cancelBoost: 'cancel_boost' },
    weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  };
  var reg = function (hass) { return (hass && hass.entities) || {}; };
  var isVelair = function (e) { return !!e && SOURCE.platforms.indexOf(e.platform) >= 0; };
  var present = function (hass) {
    var R = reg(hass);
    for (var k in R) { if (isVelair(R[k])) return true; }
    return false;
  };
  var entities = function (hass) {
    var R = reg(hass), out = { zones: [] };
    Object.keys(R).sort().forEach(function (eid) {
      var e = R[eid];
      if (!isVelair(e) || e.disabled_by) return;
      var role = (SOURCE.keys[eid.split('.')[0]] || {})[e.translation_key];
      if (!role) return;
      if (/^zone/.test(role)) out.zones.push({ entity_id: eid, role: role });
      else if (!out[role]) out[role] = eid;
    });
    return out;
  };
  var cache = null, at = 0, busy = null, unsub = null, subbing = false, fns = [];
  var tell = function () { fns.slice().forEach(function (fn) { try { fn(cache); } catch (e) { /* the listener's own problem */ } }); };
  var keep = function (d) { if (d && typeof d === 'object' && d.zones) { cache = d; at = Date.now(); tell(); } return cache; };
  var subscribe = function (hass) {
    if (unsub || subbing || !hass || !hass.connection || typeof hass.connection.subscribeMessage !== 'function') return;
    subbing = true;
    Promise.resolve(hass.connection.subscribeMessage(function (ev) {
      if (ev && ev.loaded === false) { cache = null; tell(); return; }
      keep(ev && ev.schedule);
    }, { type: SOURCE.ws.subscribe })).then(function (u) { unsub = u; }, function () { /* without it: reads only */ })
      .then(function () { subbing = false; });
  };
  var load = function (hass, force) {
    if (!hass || typeof hass.callWS !== 'function' || !present(hass)) return Promise.resolve(cache);
    subscribe(hass);
    if (busy) return busy;
    if (!force && cache && Date.now() - at < 60000) return Promise.resolve(cache);
    busy = hass.callWS({ type: SOURCE.ws.read }).then(keep, function () { return cache; })
      .then(function (d) { busy = null; return d; });
    return busy;
  };
  // Before the data arrives the zone sensors give it away: the control sensor is named after the climate
  // (sensor.velair_control_<object id>), the target sensor carries entity_id while a block is active.
  var hinted = function (hass) {
    var S = (hass && hass.states) || {}, out = [];
    entities(hass).zones.forEach(function (z) {
      var a = (S[z.entity_id] || {}).attributes || {};
      if (z.role === 'zoneTarget' && typeof a.entity_id === 'string' && /^climate\./.test(a.entity_id)) out.push(a.entity_id);
      var m = z.role === 'zoneControl' && /^sensor\.velair_control_(.+)$/.exec(z.entity_id);
      if (m && S['climate.' + m[1]]) out.push('climate.' + m[1]);
    });
    return out.filter(function (x, i) { return out.indexOf(x) === i; });
  };
  var climates = function (hass) {
    if (cache && Array.isArray(cache.configured_entities)) return cache.configured_entities.slice();
    return present(hass) ? hinted(hass) : [];
  };
  var managed = function (hass, id) {
    if (!id || !present(hass)) return false;
    if (cache && Array.isArray(cache.configured_entities)) return cache.configured_entities.indexOf(id) >= 0;
    load(hass);
    return hinted(hass).indexOf(id) >= 0 ? true : null;
  };
  window.casoraVelairFind = { SOURCE: SOURCE, present: present, entities: entities, load: load, managed: managed, climates: climates,
    data: function () { return cache; }, onChange: function (fn) { if (typeof fn === 'function') fns.push(fn); },
    // Unit tests: a response as Velair sends it.
    _seed: function (d) { cache = null; keep(d); } };
  // Load early when Velair is there, so the first popup already has the week.
  (function kick(n) {
    var ha = typeof document !== 'undefined' && document.querySelector ? document.querySelector('home-assistant') : null;
    if (ha && ha.hass && ha.hass.entities) { if (present(ha.hass)) load(ha.hass); return; }
    if (n >= 20 || typeof setTimeout !== 'function') return;
    var t = setTimeout(function () { kick(n + 1); }, 1500);
    if (t && t.unref) t.unref();
  })(0);
})();
