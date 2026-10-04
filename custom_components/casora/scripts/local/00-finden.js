// ── Geräte-Finder (Casora, 26.09.2026) ──────────────────────────────────────
// Popups sollen ihre Entitäten selbst finden, statt feste IDs oder deutsche
// Namensmuster zu brauchen. Grundlage sind zwei sprachunabhängige Angaben aus
// HAs Registry, die im Browser als hass.entities / hass.devices ankommen:
//   • device_id  – welche Entitäten zu einem Gerät gehören (inkl. Unter-Geräten
//                  über via_device, z. B. AMS am Drucker)
//   • translation_key – fester Schlüssel der Integration („print_status“), gleich
//                  in jeder Sprache und egal, wie der Nutzer die Entität benannt hat
// Für Geräte ohne Schlüssel (z. B. Zigbee-Steckdosen) hilft device_class.
// Fest eingestellte Variablen im Dashboard haben immer Vorrang – der Finder füllt
// nur Lücken.

// Strompreis für Kosten in Geräte-Popups (1.0.3): 1) Kartenvariable price_kwh, 2) der Preis aus
// den Casora-Einstellungen (Außenwerte & Strompreis), 3) der Netzbezug aus HAs Energie-Dashboard
// (fester Preis oder live der Zustand der Preis-Entität, CASORA_PRICE_ENTITY). 2) und 3) kommen mit
// casora/settings/get (casora-local.js). Ohne alles null: dann zeigen die Popups keine Kosten.
window.casoraPriceKwh = function (v) {
  var ok = function (p) { return typeof p === 'number' && isFinite(p) && p >= 0 ? p : null; };
  if (v != null && v !== '') return ok(Number(v));
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

(function () {
  if (window.casoraDevice) return;

  function reg(hass) { return (hass && hass.entities) || {}; }
  function devs(hass) { return (hass && hass.devices) || {}; }
  function dc(hass, eid) {
    var s = hass && hass.states && hass.states[eid];
    return s && s.attributes ? s.attributes.device_class : undefined;
  }

  // Gerät einer Entität (oder die Geräte-ID selbst).
  function deviceOf(hass, anchor) {
    if (!anchor) return null;
    if (devs(hass)[anchor]) return anchor;
    var e = reg(hass)[anchor];
    return (e && e.device_id) || null;
  }

  // Geräte-IDs: das Gerät selbst und alle, die über via_device daran hängen.
  function family(hass, devId) {
    var out = [devId], D = devs(hass);
    Object.keys(D).forEach(function (id) {
      if (D[id] && D[id].via_device_id === devId) out.push(id);
    });
    return out;
  }

  // Alle Entitäten des Geräts (mit Unter-Geräten), in stabiler Reihenfolge.
  function entities(hass, anchor, opts) {
    var devId = deviceOf(hass, anchor);
    if (!devId) return [];
    var ids = (opts && opts.children === false) ? [devId] : family(hass, devId);
    if (opts && opts.siblings) siblings(hass, devId).forEach(function (id) { ids = ids.concat(family(hass, id)); });
    var R = reg(hass);
    return Object.keys(R).filter(function (eid) {
      var e = R[eid];
      return e && ids.indexOf(e.device_id) >= 0 && !e.hidden;
    }).sort().map(function (eid) {
      var e = R[eid];
      return { entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0],
               device_id: e.device_id, dc: dc(hass, eid), category: e.entity_category || null };
    });
  }

  // Erste Entität mit einem der Schlüssel (optional nur in einer Domain).
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

  // Mehrere Felder auf einmal: spec = {feld: {keys:[…], domain:'sensor', all:true}}
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

  // Zwischenstecker zu einem Gerät: eigenes Gerät im selben Bereich, dessen Name
  // mit dem Gerätenamen beginnt („Drucker“ → „Drucker Steckdose“) und das schaltet und misst.
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
      // „Drucker Steckdose“ zu „Drucker“ – oder umgekehrt „Sauger“ zu „Sauger Modell …“.
      return n !== myName && (n.indexOf(myName) === 0 || (n.length >= 4 && myName.indexOf(n + ' ') === 0));
    });
    for (var c = 0; c < cands.length; c++) {
      var list = entities(hass, cands[c], { children: false });
      var sw = list.filter(function (e) { return e.domain === 'switch' && !e.category; })[0];
      var power = pick(list, { dc: 'power', domain: 'sensor' });
      // Ein Zwischenstecker misst – sonst ist es z. B. die Station des Saugroboters.
      if (power) {
        return {
          device_id: cands[c],
          switch: sw ? sw.entity_id : null,
          power: power,
          voltage: pick(list, { dc: 'voltage', domain: 'sensor' }),
          current: pick(list, { dc: 'current', domain: 'sensor' }),
          // Gesamtzähler: der Energie-Sensor ohne Zusatz wie _today/_month.
          energy: (list.filter(function (e) {
            return e.dc === 'energy' && e.domain === 'sensor' && !/_(today|yesterday|month|week|year)$/.test(e.entity_id);
          })[0] || {}).entity_id || null,
        };
      }
    }
    return null;
  }

  // Geräte gleichen Herstellers im selben Bereich, deren Name mit dem Gerätenamen
  // beginnt (Station „Sauger Dock“ zum Roboter „Sauger“).
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

  // Erste Entität einer Integration mit diesem Schlüssel – für Geräte, die es im Haus
  // nur einmal gibt (Solarspeicher …). Zwischengespeichert je Registry-Stand.
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
      // Plattform passt nicht (umbenannt, Test-HA …): Gerät über einen eindeutigen
      // Schlüssel der Integration finden und nur dort suchen – „temperature“ o. ä.
      // gibt es sonst bei vielen Geräten.
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

  // ── Abfall (Waste Collection Schedule o. Ä.) ──────────────────────────────
  // Tonnen-Sensoren und Abfallkalender werden erkannt; eigene Angaben kommen aus
  // den Kartenvariablen (trash_*) oder CASORA_SETTINGS.waste und haben Vorrang.
  var WASTE_KINDS = [
    [/bio|organ|kompost|green waste/i, '#30D158'],
    [/papier|paper|pappe|karton|cardboard/i, '#0A84FF'],
    [/wertstoff|gelb|plastik|plastic|verpack|recycl/i, '#FFCC00'],
    [/glas|glass/i, '#00C3D0'],
    [/rest|residual|general|haus|black/i, '#8E8E93'],
  ];
  function isWasteSensor(hass, eid) {
    if (eid.indexOf('sensor.') !== 0) return false;
    var e = reg(hass)[eid], st = hass.states[eid];
    if (!st || (e && e.hidden)) return false;
    if (e && e.platform === 'waste_collection_schedule') return true;
    return st.attributes && st.attributes.daysTo !== undefined;
  }
  function wasteLabel(hass, eid) {
    var st = hass.states[eid];
    return String((st && st.attributes && st.attributes.friendly_name) || eid.split('.')[1])
      .replace(/^waste collection schedule\s*/i, '').trim();
  }
  function waste(hass, variables) {
    var V = variables || {};
    var cfg = settings('waste');
    var S = (hass && hass.states) || {};
    var named = V.trash_sensors || cfg.sensors || null;   // {entity_id: label} oder [entity_id]
    var ids = named ? (Array.isArray(named) ? named : Object.keys(named))
      : Object.keys(S).filter(function (eid) { return isWasteSensor(hass, eid); }).sort();
    var bins = ids.filter(function (id) { return S[id]; }).map(function (id) {
      var label = (named && !Array.isArray(named) && named[id]) || wasteLabel(hass, id);
      var kind = WASTE_KINDS.filter(function (k) { return k[0].test(label) || k[0].test(id); })[0];
      var color = kind ? kind[1] : '#FF9F0A';
      var st = S[id];
      var days = parseInt(st.state, 10);
      if (isNaN(days)) days = parseInt(st.attributes && st.attributes.daysTo, 10);
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      return {
        id: id, label: label, color: color, tint: 'rgba(' + r + ',' + g + ',' + b + ',0.25)',
        re: kind ? kind[0] : new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        days: isNaN(days) ? null : days,
      };
    });
    var calendar = V.trash_calendar || cfg.calendar || Object.keys(S).filter(function (eid) {
      if (eid.indexOf('calendar.') !== 0) return false;
      var e = reg(hass)[eid];
      return (e && e.platform === 'waste_collection_schedule')
        || /^waste collection schedule/i.test((S[eid].attributes || {}).friendly_name || '');
    }).sort()[0] || null;
    var months = V.trash_duty_months || cfg.duty_months || null;
    if (Array.isArray(months) && !months.length) months = null;
    var dutyEnt = V.trash_duty_entity || cfg.duty_entity || null;
    // Dienst: null = kein Dienstplan (Kachel immer aktiv), sonst true/false.
    var duty = null;
    if (dutyEnt && S[dutyEnt]) duty = S[dutyEnt].state === 'on';
    // Leere Liste = Dienstplan ausgeschaltet (oben auf null gesetzt): wie ohne Plan.
    else if (months) duty = months.indexOf(new Date().getMonth() + 1) > -1;
    var sorted = bins.filter(function (b) { return b.days != null; }).sort(function (a, b) { return a.days - b.days; });
    var days = sorted.length ? sorted[0].days : null;
    var nextBins = sorted.filter(function (b) { return b.days === days; });
    // Monatskalender im Abfall-Popup (Studio → Einstellungen → Haus & Geräte), Standard aus.
    var calPopup = V.trash_calendar_popup != null ? V.trash_calendar_popup : cfg.calendar_popup;
    return {
      bins: bins, calendar: calendar, reminder: V.trash_reminder || cfg.reminder || null,
      months: months, duty: duty, days: days, calendarPopup: calPopup === true,
      next: nextBins.length ? { label: nextBins.map(function (b) { return b.label; }).join(' + '),
                                tint: nextBins[0].tint, color: nextBins[0].color } : null,
    };
  }

  // Abholtermine je Tonne ab heute (wie im Abfall-Popup): Datums-Attribute der Sensoren
  // plus die Einträge aus dem Abfall-Kalender, den die Kachel vorlädt (_casoraTrashCal).
  // Ergebnis: [{ bin, dates: [Date …] }] in der Reihenfolge von W.bins.
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
      // Nur der Countdown bekannt (keine Datums-Attribute): Termin daraus.
      if (!dates.length && b.days != null) { var d1 = new Date(today); d1.setDate(d1.getDate() + b.days); dates = [d1]; }
      return { bin: b, dates: dates };
    });
  }

  // Abfall-Quelle nicht erreichbar (04.10.2026): Abfallkalender und/oder alle Tonnen-Sensoren
  // stehen auf unavailable/unknown und es liegt kein einziger Termin vor (z. B. lehnt der Server
  // des Entsorgers die Verbindung ab). Dann { source: Name der Quelle oder null }, sonst null.
  // Sind nur einzelne Sensoren weg, aber Termine da, bleibt alles wie bisher.
  function wasteDown(hass, W) {
    var S = (hass && hass.states) || {};
    if (!W || (!W.calendar && !W.bins.length)) return null;
    var bad = function (id) { var s = S[id]; return !s || s.state === 'unavailable' || s.state === 'unknown'; };
    var calDown = !!(W.calendar && bad(W.calendar));
    var binsDown = W.bins.length > 0 && W.bins.every(function (b) { return bad(b.id); });
    if (!calDown && !binsDown) return null;
    // Kalender da, aber noch nicht geladen: erst abwarten, nicht vorschnell „nicht erreichbar“.
    var TC = window._casoraTrashCal;
    if (W.calendar && !calDown && !(TC && TC.id === W.calendar)) return null;
    if (wasteDates(hass, W).some(function (x) { return x.dates.length; })) return null;
    var cs = W.calendar && S[W.calendar];
    var name = cs && cs.attributes && cs.attributes.friendly_name;
    name = name ? String(name).replace(/^waste collection schedule\s*/i, '').trim() : '';
    return { source: name || null };
  }

  // Zählerstand einer Entität um Mitternacht (aus dem Verlauf, einmal pro Tag je
  // Entität). Gibt null zurück, solange die Abfrage läuft.
  var dayCache = {};
  function dayStart(eid) {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var key = eid + '|' + d0.getTime();
    if (key in dayCache) return dayCache[key];
    dayCache[key] = null;
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass || !hass.callApi) { delete dayCache[key]; return null; }
    // Erster Wert des Tages (Stand um Mitternacht, sonst der früheste von heute).
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

  // Summe der Stunden, in denen die Entitäten „on“ waren (letzte `days` Tage).
  // Aus dem Verlauf, 30 Min. gemerkt; null, solange die Abfrage läuft.
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
    hass.callApi('GET', 'history/period/' + start.toISOString() + '?filter_entity_id=' + eids.join(',')
      + '&minimal_response&no_attributes')
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

  // Dienst für KI-Knöpfe: eigenes Skript des Nutzers (alte Casora-Pakete), sonst
  // Casoras Dienst aus der Integration (ki.py).
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

  // Erste Entität mit diesem translation_key (für Integrationen, die es nur einmal gibt).
  function keyAny(hass, key, domain) {
    var R = reg(hass), S = (hass && hass.states) || {};
    return Object.keys(R).filter(function (eid) {
      return R[eid] && R[eid].translation_key === key && S[eid] && (!domain || eid.indexOf(domain + '.') === 0);
    }).sort()[0] || null;
  }

  // Eigene Einstellungen des Nutzers (/config/www/casora/einstellungen.js).
  function settings(key) {
    var all = window.CASORA_SETTINGS || {};
    return key ? (all[key] || {}) : all;
  }
  window.casoraSettings = settings;

  // ── Netzwerk: Router, Access Points, Switches, WLANs, Latenz (27.09.2026) ────
  // Herstellerneutral (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik,
  // OpenWrt …): Geräte aus Netzwerk-Integrationen bzw. von Netzwerk-Herstellern,
  // die Rollen je Entität über translation_key, Geräteklasse, Einheit und Namen.
  // Ergebnis in der Form der Popup-Variablen network_devices / wlan_entities /
  // latency_entities – feste Variablen im Dashboard haben weiter Vorrang.
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
      // Ein WLAN als eigenes Gerät (UniFi) – oder WLAN-Schalter am Router (FRITZ!Box, TP-Link …).
      // Verwaiste Einträge (unavailable) sind kein WLAN – ein abgeschaltetes steht auf off.
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
      // Nur echte Netzwerkgeräte. Aus einer Netzwerk-Integration reicht Neustart + Laufzeit/Update
      // (FRITZ!Box); nur über den Hersteller erkannte Geräte brauchen Clients, CPU oder RAM –
      // TP-Link-/AVM-Steckdosen haben auch Neustart und Update.
      var strong = d.clients || d.cpu || d.mem || (d.state && first('state')) || lat.length;
      if (!(strong || (netDev[devId] && d.restart && (d.uptime || d.update)))) return;
      var model = (dev.model || '') + ' ' + label;
      d.icon = lat.length || /router|gateway|fritz!?box|udm|udr|ucg|uxg|usg|archer|\bdream/i.test(model) ? 'network'
        : /switch|usw|\bsg\d|\bgs\d|flex/i.test(model) ? 'access_point' : 'mesh';
      Object.keys(d).forEach(function (k) { if (d[k] == null) delete d[k]; });
      out.devices.push(d);
    });
    // Router zuerst, dann Access Points, dann Switches.
    var rank = { network: 0, mesh: 1, access_point: 2 };
    out.devices.sort(function (a, b) { return rank[a.icon] - rank[b.icon]; });
    return out;
  }

  // ── Türen/Fenster für Sicherheits- und Kontakt-Popups (27.09.2026) ────────────
  // Eigene Gruppen-Helfer aus den Einstellungen (contacts.groups: [{id, label}]),
  // sonst alle Kontaktsensoren nach Geräteklasse. notify.contact_merged fasst
  // Kombi-Sensoren zusammen: erster Einzelsensor → Kombi, die übrigen fallen weg.
  // Fahrzeuge (Auto, eBike): Geräte mit Kilometerstand, Reichweite, Tank oder Reifendruck.
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
          // Gerätetüren (Spüler, Kühlschrank, Ofen …) und Briefkasten sind keine Haustüren/Fenster.
          if (APPLIANCE_DOOR.test(id + ' ' + (st.attributes.friendly_name || ''))) return false;
          return dcs.indexOf(st.attributes.device_class) >= 0;
        }).sort();
      };
      groups = [{ label: 'Türen', members: pick(['door', 'garage_door']) }, { label: 'Fenster', members: pick(['window']) }];
    }
    // Ohne eingetragenen Kombi-Sensor: Kontakt + Kippsensor (+ Kombi) derselben Tür
    // erkennen (casoraOpenings) – der Kombi-Sensor vertritt die Einzelsensoren, sonst
    // bleibt der Kontakt stehen und zeigt über tilt[Kontakt] die Kipp-Stellung.
    var tilt = {};
    var all = [];
    groups.forEach(function (g) { (g.members || []).forEach(function (x) { if (all.indexOf(x) < 0) all.push(x); }); });
    if (all.length) {
      var combos = Object.keys(S).filter(function (id) { return id.indexOf('binary_sensor.') === 0 && isCombo(hass, id); });
      openings(hass, all.concat(combos)).forEach(function (u) {
        if (u.ids.length < 2 || u.ids.some(function (x) { return sub[x] || excl.indexOf(x) >= 0; })) return;
        // Wie notify.contact_merged: der Kontakt wird zum Kombi-Sensor, der Kippsensor fällt weg.
        var raw = u.ids.filter(function (x) { return x !== u.main; });
        var head = u.combo ? (raw.filter(function (x) { return !isTiltSensor(hass, x); })[0] || raw[0]) : null;
        raw.forEach(function (x) {
          if (x === head) sub[x] = u.main;
          else if (u.combo || x === u.tilt) excl.push(x);
        });
        if (!u.combo && u.tilt && u.tilt !== u.main) tilt[u.main] = u.tilt;
      });
    }
    return { groups: groups, sub: sub, excl: excl, tilt: tilt };
  }
  window.casoraContacts = contacts;

  // ── Öffnungen: Kontakt, Kippsensor und Kombi-Sensor = eine Tür/ein Fenster (30.09.2026) ──
  // Manche Türen/Fenster haben zwei Sensoren (Kontakt für offen/zu, Kippsensor für
  // „gekippt“), oft dazu einen Kombi-Sensor (Vorlage: an = offen oder gekippt, Attribut
  // tilt: true beim Kippen). Eine Öffnung zählt überall nur einmal:
  //   • Kombi-Sensor = Attribut „tilt“ vorhanden oder „kombi/combined“ in Kennung/Name
  //   • Kippsensor   = „kipp/tilt“ in Kennung/Name (und kein Kombi-Sensor)
  //   • zusammen gehören Sensoren desselben Geräts oder – im selben/ohne Bereich – mit
  //     gleichem Namenskern ohne „Kontakt/Kippsensor/Kombi“ (terrassentur_kombi ↔
  //     kontaktsensor_terrassentur_contact ↔ kontaktsensor_terrassentur_kippsensor_contact).
  // Rückgabe je Öffnung { main, tilt, ids, combo, kind: 'door'|'window', state:
  // 'open'|'tilted'|'closed'|'dead' }. Nur Kontakt-artige binary_sensor zählen (Tür,
  // Fenster, Garagentor, Öffnung oder ohne Klasse) – Bewegung, Rauch … bleiben draußen.
  // Gleiche Logik im Studio: casora-panel-basis.js (openings), Test: dev/unit/oeffnungen.mjs.
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
    // 1) Kippsensor + Kontakt
    list.forEach(function (t) {
      if (!isTiltSensor(hass, t)) return;
      var c = list.filter(function (x) { return !used[x] && x !== t && !isCombo(hass, x) && !isTiltSensor(hass, x) && same(t, x); })[0];
      var u = { main: c || t, tilt: t, ids: c ? [c, t] : [t], combo: false };
      u.ids.forEach(function (x) { used[x] = true; });
      units.push(u);
    });
    // 2) übrige Kontakte einzeln
    list.forEach(function (x) {
      if (used[x] || isCombo(hass, x)) return;
      used[x] = true;
      units.push({ main: x, tilt: null, ids: [x], combo: false });
    });
    // 3) Kombi-Sensor schluckt die Öffnungen, zu denen er passt
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

  // Sensoren, die nur technisch device_class door/opening/window tragen, aber keine Tür und kein
  // Fenster sind (03.10.2026): Tankerkönig legt je Tankstelle „Status“ (geöffnet/geschlossen) mit
  // device_class door an – die Glocke meldete „… ist offen“. Erkennt Plattformen aus der Liste,
  // Sensoren mit Ortsangabe (Tankstelle, Geschäft: latitude/longitude), Diagnose-Entitäten und
  // Fahrzeuge (Türen, Fenster, Klappen eines Autos sind keine Öffnungen der Wohnung).
  var NOT_OPENING_PLATFORMS = ['tankerkoenig'];
  // Fahrzeug: Gerät mit Kilometerstand bzw. device_tracker und eigenen Tür-/Fenstersensoren
  // (E-Bikes haben keine Türen). Zwischengespeichert je Registry-Stand.
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

  // ── Sicherheit: Stufe je Gerät/Gruppe (Farbsystem Sicherheit, 03.10.2026) ───────
  // 'ok' = in Ordnung, 'warn' = Hinweis, 'alarm' = Gefahr. Die Sicherheits-Badges färben
  // ihren Symbolkreis über --casora-security-<stufe>-color (Weich: Sand / Orange / Rot);
  // ohne diese Theme-Variablen (Standard, Glas) bleiben ihre bisherigen Farben.
  //   ok    verriegelt, geschlossen, Alarm scharf, Kamera online
  //   warn  entriegelt, offen, gekippt, Alarm unscharf, Gerät offline/nicht verfügbar
  //   alarm Alarm ausgelöst, Schloss klemmt (jammed), offen/entriegelt bei Abwesenheit
  // Abwesend: eine Alarmanlage ist „abwesend“/„Urlaub“ scharf, oder es gibt Personen und
  // alle mit bekanntem Zustand sind weg (unbekannte Personen zählen nicht als abwesend).
  var awayMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function securityAway(hass) {
    var S = hass && hass.states;
    if (!S) return false;
    if (awayMemo && awayMemo.has(S)) return awayMemo.get(S);
    var armedAway = false, persons = 0, known = 0, home = 0;
    Object.keys(S).forEach(function (id) {
      var s = String((S[id] || {}).state || '').toLowerCase();
      if (id.indexOf('alarm_control_panel.') === 0) { if (s === 'armed_away' || s === 'armed_vacation') armedAway = true; }
      else if (id.indexOf('person.') === 0) {
        persons++;
        if (s && s !== 'unknown' && s !== 'unavailable') { known++; if (s === 'home') home++; }
      }
    });
    var r = armedAway || (persons > 0 && known === persons && home === 0);
    if (awayMemo) awayMemo.set(S, r);
    return r;
  }
  var SEC_RANK = { ok: 0, warn: 1, alarm: 2 };
  function securityLevel(hass, ids) {
    var S = (hass && hass.states) || {};
    var away = null;
    var isAway = function () { if (away === null) away = securityAway(hass); return away; };
    // Gruppen-Helfer über ihre Mitglieder (wie casora_badge_security_group).
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
      var dead = !s || s === 'unknown' || s === 'unavailable';
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
    // Türen/Fenster: Kontakt + Kippsensor (+ Kombi-Sensor) sind eine Öffnung.
    if (contacts.length) openings(hass, contacts).forEach(function (u) {
      if (u.state === 'open') up(isAway() ? 'alarm' : 'warn');
      else if (u.state === 'tilted' || u.state === 'dead') up('warn');
    });
    return worst;
  }
  window.casoraSecurityAway = securityAway;
  window.casoraSecurityLevel = securityLevel;

  // ── Außensensor nach Geräteklasse (Wetter-Popup, 27.09.2026) ──────────────────
  // „outdoor/außen“ im Namen oder ein Außenbereich; Luftdruck ist ohnehin draußen gleich.
  var OUTDOOR = /outdoor|aussen|außen|outside|draussen|draußen|garten|terrasse|balkon|garden|terrace|balcony/i;
  // Keine Außenluft: Pflanzen-, Boden-, Wasser- und Fahrzeugsensoren.
  var NOT_AIR = /boden|soil|reifen|tire|tyre|wasser|water|pool|aquarium|teich|pond|akku|battery|motor|engine|kühl|coolant/i;
  function outdoor(hass, dcs) {
    var S = (hass && hass.states) || {}, R = reg(hass), A = (hass && hass.areas) || {}, D = devs(hass);
    dcs = [].concat(dcs);
    var skipDev = vehicleDevs(hass);
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (e && e.device_id && (id.indexOf('plant.') === 0 || id.indexOf('device_tracker.') === 0)) skipDev[e.device_id] = true;
    });
    var cand = Object.keys(S).filter(function (id) {
      var st = S[id], e = R[id] || {};
      if (id.indexOf('sensor.') !== 0 || dcs.indexOf(st.attributes.device_class) < 0) return false;
      if (e.hidden || e.entity_category || (e.device_id && skipDev[e.device_id])) return false;
      if (/pressure/.test(st.attributes.device_class) && !/^(hpa|mbar|inhg|mmhg|kpa)$/i.test(st.attributes.unit_of_measurement || '')) return false;
      return !NOT_AIR.test(id + ' ' + (st.attributes.friendly_name || ''));
    }).sort();
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

  window.casoraDevice = {
    deviceOf: deviceOf, entities: entities, map: map, companionPlug: companionPlug, byKey: byKey,
    waste: waste, wasteDates: wasteDates, wasteDown: wasteDown, siblings: siblings, dayStart: dayStart, onHours: onHours, keyAny: keyAny, network: network,
    contacts: contacts, outdoor: outdoor, openings: openings,
  };
})();

// ── Kameras-Kachel ohne Auswahl (27.09.2026) ─────────────────────────────────
// variables.cameras leer: alle Kameras im Haus – ohne Saugroboter-Karten und
// Drucker-Kameras (Geräte mit Sauger bzw. Druckstatus), die sind keine Überwachung.
(function () {
  if (window._casoraCams) return;
  // 30.09.2026: auch eine gewählte Liste ohne Karten (Saugroboter-Karte u. ä.);
  // nicht erreichbare Kameras stehen am Ende (das Popup zeigt sie als offline).
  window._casoraCams = function (variables, entity, hass) {
    var H = hass || (document.querySelector('home-assistant') || {}).hass || {};
    var S = H.states || {}, R = H.entities || {};
    var skip = {}, vac = {};
    Object.keys(R).forEach(function (id) {
      var e = R[id];
      if (!e || !e.device_id) return;
      if (id.indexOf('vacuum.') === 0) vac[e.device_id] = true;
      if (id.indexOf('vacuum.') === 0 || /^(print_status|stage)$/.test(e.translation_key || '')) skip[e.device_id] = true;
    });
    // Karte = Name endet auf _map/karte oder Kamera eines Saugroboters; auto = auch Drucker-Kameras.
    var isMap = function (id, auto) {
      var e = R[id];
      if (/(_map|karte)(_\d+)?$/.test(id)) return true;
      return !!(e && e.device_id && (auto ? skip : vac)[e.device_id]);
    };
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

// ── Waschmaschine und Trockner: woher die Werte kommen (03.10.2026) ──────────
// Vorrang: 1. die offizielle Integration des Herstellers (Home Connect, Miele,
// SmartThings, LG ThinQ, Whirlpool, hOn/Electrolux u. ä.), 2. WashData
// (ha_washdata, lernt Programme am Zwischenstecker), 3. nur der Zwischenstecker.
// Erkannt wird über die Plattform der Entität und ihren translation_key, nie über
// Namen oder IDs. Ohne Plattform (Testhaus) reicht die Schlüssel-Kombination.
// Genutzt von der Kachel/dem Popup (02-geraete.js) und vom Studio (Assistent,
// Kachel hinzufügen): dort per import geladen (panel/casora-panel-types.js).
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
  /* Home Connect: Waschen/Trocknen steht im Programmschlüssel (laundry_care_washer_… / laundry_care_dryer_…). */
  var hcRole = function (progKeys) {
    return function (hass, list) {
      var o = opts(hass, list, progKeys).join(' ');
      if (/laundry_?care[._]washer/.test(o) || has(list, 'washer_temperature') || has(list, 'prewash')) return 'washer';
      if (/laundry_?care[._]dryer/.test(o) || has(list, 'drying_target')) return 'dryer';
      return null;
    };
  };

  // need: alle Schlüssel nötig, any: einer davon – nur wenn die Plattform nicht passt (Testhaus).
  // role(hass, list, devId) → 'washer' | 'dryer' | null (null = kein Wäschegerät, z. B. Backofen).
  var SOURCES = [
    { id: 'home_connect', rank: 0, platforms: ['home_connect'], need: ['operation_state'],
      any: ['program_progress', 'active_program', 'selected_program', 'program_finish_time'],
      role: hcRole(['active_program', 'selected_program']),
      fields: { state: k('operation_state'), program: k(['active_program', 'selected_program'], 'select'),
        select: k('selected_program', 'select'), remaining: k('program_finish_time'), progress: k('program_progress'),
        door: k('door'), pause: k('pause_program', 'button'), resume: k('resume_program', 'button'),
        stop: k('stop_program', 'button') } },
    /* Home Connect Alt / Home Connect WS (HACS): eigene Schlüssel mit Präfix. */
    { id: 'home_connect_alt', rank: 0, platforms: ['home_connect_alt', 'homeconnect_ws'], need: ['sensor_operation_state'],
      any: ['sensor_active_program', 'select_program', 'sensor_program_progress'],
      role: hcRole(['sensor_active_program', 'select_program', 'sensor_selected_program']),
      fields: { state: k('sensor_operation_state'), program: k(['sensor_active_program', 'sensor_selected_program']),
        select: k('select_program', 'select'), remaining: k('sensor_remaining_program_time'),
        progress: k('sensor_program_progress'), phase: k('sensor_program_phase'), door: k('binary_sensor_door_state', 'binary_sensor'),
        stop: k('button_abort_program', 'button'), pause: k('button_pause_program', 'button'),
        resume: k('button_resume_program', 'button') } },
    { id: 'miele', rank: 0, platforms: ['miele'], need: ['status'], any: ['spin_speed', 'drying_step', 'twin_dos_1_level'],
      role: function (hass, list) {
        if (has(list, 'spin_speed') || has(list, 'twin_dos_1_level')) return 'washer';
        return has(list, 'drying_step') ? 'dryer' : null;
      },
      fields: { state: k('status'), program: k('program_id'), phase: k(['program_phase', 'drying_step']),
        remaining: k(['remaining_time', 'finish']), elapsed: k(['elapsed_time', 'start']), energy: k('energy_consumption'),
        pause: k('pause', 'button'), stop: k('stop', 'button') } },
    { id: 'smartthings', rank: 0, platforms: ['smartthings'],
      need: [], any: ['washer_machine_state', 'washer_job_state', 'dryer_machine_state', 'dryer_job_state'],
      role: function (hass, list) {
        if (has(list, 'washer_machine_state') || has(list, 'washer_job_state')) return 'washer';
        return (has(list, 'dryer_machine_state') || has(list, 'dryer_job_state')) ? 'dryer' : null;
      },
      fields: { state: k(['washer_machine_state', 'dryer_machine_state']), phase: k(['washer_job_state', 'dryer_job_state']),
        program: k(['washer_mode', 'dryer_mode']), remaining: k('completion_time'), door: k('door', 'binary_sensor'),
        pause: k('pause', 'button'), resume: k('resume', 'button'), stop: k('stop', 'button') } },
    /* LG ThinQ: Waschmaschine und Trockner haben dieselben Schlüssel; die Geräteart steht im Modell („… (DRYER)“). */
    { id: 'lg_thinq', rank: 0, platforms: ['lg_thinq'], need: ['current_state', 'cycle_count'], any: ['remain', 'total'],
      role: function (hass, list, devId) {
        if (!has(list, 'cycle_count')) return null;
        return /dryer/i.test(model(hass, devId)) && !/wash/i.test(model(hass, devId)) ? 'dryer' : 'washer';
      },
      fields: { state: k('current_state'), remaining: k('remain'), elapsed: k('running'), total: k('total'), count: k('cycle_count') } },
    /* WashData vor Whirlpool: beide nennen den Zustand „washer_state“, nur WashData hat Fortschritt, Programmwahl usw. */
    { id: 'washdata', rank: 1, platforms: ['ha_washdata'], need: ['washer_state'],
      any: ['cycle_progress', 'time_remaining', 'program_select', 'mark_unloaded', 'cycle_count', 'current_phase'],
      role: function (hass, list) {
        var st = list.filter(function (e) { return e.key === 'washer_state' && e.domain === 'sensor'; })[0];
        var a = (st && sts(hass)[st.entity_id] && sts(hass)[st.entity_id].attributes) || {};
        var icon = String(a.icon || (reg(hass)[st ? st.entity_id : ''] || {}).icon || '');
        // WashData überwacht auch Geschirrspüler, Heißluftfritteusen und Pumpen – das Symbol sagt, was es ist.
        if (/dishwasher|pot-steam|water-pump|pump/.test(icon)) return null;
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
    /* Weitere Hersteller-Integrationen aus HACS (Haier/Candy hOn, Electrolux/AEG, LG SmartThinQ):
       nur über die Plattform, Felder über übliche Schlüssel. */
    { id: 'other', rank: 0, platforms: ['hon', 'electrolux_status', 'electrolux', 'smartthinq_sensors', 'candy', 'haier'],
      need: null, any: [],
      role: function (hass, list, devId) {
        // Schlüssel der Integration (programs_wm / programs_td …) und Modell, keine Namen.
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

  function list(hass, devId) {
    var R = reg(hass), S = sts(hass);
    return Object.keys(R).filter(function (eid) {
      var e = R[eid];
      return e && e.device_id === devId && !e.disabled_by && S[eid];
    }).sort().map(function (eid) {
      var e = R[eid];
      return { entity_id: eid, key: e.translation_key || null, domain: eid.split('.')[0], platform: e.platform || null,
               category: e.entity_category || null };
    });
  }
  function pick(lst, spec) {
    var keys = spec.keys;
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < lst.length; j++) {
        if (lst[j].key === keys[i] && lst[j].domain === spec.domain) return lst[j].entity_id;
      }
    }
    return null;
  }
  function matches(src, lst) {
    if (lst.some(function (e) { return src.platforms.indexOf(e.platform) >= 0; })) return 'platform';
    if (!src.need) return null;
    // Ein Gerät einer anderen bekannten Quelle ist es nicht (Whirlpool-Schlüssel an einem WashData-Gerät …).
    var known = SOURCES.some(function (o) { return o !== src && lst.some(function (e) { return o.platforms.indexOf(e.platform) >= 0; }); });
    if (known) return null;
    var ok = src.need.every(function (key) { return has(lst, key); })
      && (!src.any.length || src.any.some(function (key) { return has(lst, key); }));
    return ok ? 'keys' : null;
  }

  // Ein Gerät einordnen: { device, source, rank, role, state, f: {program, …}, entry } oder null.
  function classify(hass, devId) {
    if (!devId) return null;
    var lst = list(hass, devId);
    if (!lst.length) return null;
    for (var i = 0; i < SOURCES.length; i++) {
      var src = SOURCES[i];
      var how = matches(src, lst);
      if (!how) continue;
      var role = src.role(hass, lst, devId);
      if (!role) continue;
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

  // Zwischenstecker ohne Geräte-Integration: schaltet (switch) und misst (Leistung in W).
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

  // Für die Kachel: Quelle des Geräts hinter der Haupt-Entität (oder der Stecker selbst).
  function forEntity(hass, eid) {
    var devId = deviceOf(hass, eid);
    var c = classify(hass, devId);
    if (c) return c;
    var dom = String(eid || '').split('.')[0];
    if (devId && (dom === 'switch' || dom === 'sensor')) {
      var p = plugOf(hass, devId);
      if (p && (p.f.plug === eid || p.f.power === eid)) return p;
    }
    return null;
  }

  // Alle Wäschegeräte im Haus; je Bereich und Art gewinnt die beste Quelle
  // (offiziell vor WashData). Geräte ohne Bereich bleiben alle drin.
  function all(hass, role) {
    var D = devs(hass);
    var out = [];
    Object.keys(D).forEach(function (id) {
      var d = D[id];
      if (!d || d.disabled_by || d.entry_type === 'service') return;
      var c = classify(hass, id);
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

  // Letzte Wahl: Zwischenstecker in einem Bereich (nur wenn dort kein Wäschegerät erkannt ist).
  function plugs(hass, areaId) {
    var D = devs(hass);
    return Object.keys(D).filter(function (id) {
      return D[id] && !D[id].disabled_by && (!areaId || D[id].area_id === areaId) && !classify(hass, id);
    }).map(function (id) { return plugOf(hass, id); }).filter(Boolean);
  }

  window.casoraLaundryFind = { classify: classify, forEntity: forEntity, all: all, plugs: plugs, sources: SOURCES };
})();
