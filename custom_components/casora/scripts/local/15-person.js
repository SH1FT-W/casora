// ── Person: Popup statt HAs Kartendialog (Casora 1.4) ─────────────────────────
// Entwurf „B · Karte zuerst“ (12.10.2026): oben HAs eigene Karte (Person und Zonen, ohne Weg),
// links das Handy (Companion-App: Akku, Verbindung, Aktionen), rechts „Nach Hause“ und „Zuletzt“.
// Daten: person.* (Zustand, latitude/longitude, gps_accuracy, source, device_trackers, entity_picture),
// zone.*, Sensoren des Handys über das Gerät des Trackers (translation_key bzw. Endung der Kennung),
// proximity (Entfernung, Richtung) falls eingerichtet, sonst Luftlinie zur Zone „Zuhause“.
// Verlauf der Person (3 Tage) einmal je Zustandswechsel aus dem HA-Verlauf.
//   window._casoraPerson.popup(states, hass, variables)   – Inhalt (Vorlage casora_popup_person)
//   window._casoraPerson.sec(part, id, states, hass, el)  – Live-Bereiche
//   window._casoraPerson.zoneHue(name)                    – Farbe eines Orts (Zuhause Türkis …)
(function () {
  if (window._casoraPerson) return;
  var P = window._casoraPerson = {};

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };

  // ── Orte und Farben ───────────────────────────────────────────────────────
  var HOME = 'var(--casora-color-teal, #4E9E95)';
  var AWAY = 'var(--casora-color-sand, #9A8672)';
  var PALETTE = ['var(--casora-color-blue, #5B8FC9)', 'var(--casora-color-violet)',
    'var(--casora-color-orange, #DE8A4E)', 'var(--casora-color-green, #6AAE78)', 'var(--casora-color-yellow, #E8B04A)'];
  // Zustand der Person → Anzeigename („home“ → „Zuhause“, sonst der Zonenname).
  P.place = function (state) {
    var s = String(state == null ? '' : state);
    if (s === 'home') return 'Zuhause';
    if (s === 'not_home') return 'Unterwegs';
    if (bad(s)) return 'Unbekannt';
    return s;
  };
  // Feste Farbe je Ort: Zuhause Türkis, unterwegs Sand, andere Zonen aus dem Namen (gleich in Karte und Liste).
  P.zoneHue = function (state) {
    var s = String(state == null ? '' : state);
    if (s === 'home') return HOME;
    if (s === 'not_home' || bad(s)) return AWAY;
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };
  var zoneIcon = function (state, states) {
    var s = String(state || '');
    if (s === 'home') return 'mdi:home';
    if (s === 'not_home') return 'mdi:car';
    var z = Object.keys(states || {}).find(function (k) {
      return k.indexOf('zone.') === 0 && (states[k].attributes || {}).friendly_name === s;
    });
    return (z && states[z].attributes.icon) || 'mdi:map-marker';
  };

  // ── Zeit ──────────────────────────────────────────────────────────────────
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // „19:18“ heute, „gestern 19:18“, sonst „Mo 19:18“.
  P.when = function (ms, now) {
    now = now || Date.now();
    var dd = Math.round((dayStart(now) - dayStart(ms)) / 86400000);
    if (dd <= 0) return hm(ms);
    if (dd === 1) return T('gestern') + ' ' + hm(ms);
    return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(ms).getDay()] + ' ' + hm(ms);
  };
  // Dauer: „32 Min.“, „3 Std. 6 Min.“, ab einem Tag „2 Tage“.
  P.dur = function (ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' Min.';
    if (m < 1440) { var h = Math.floor(m / 60), r = m % 60; return h + ' Std.' + (r ? ' ' + r + ' Min.' : ''); }
    var d = Math.round(m / 1440);
    return d + (d === 1 ? ' Tag' : ' Tage');
  };
  // „vor 2 Min.“
  P.ago = function (ms, now) {
    var m = Math.round(((now || Date.now()) - ms) / 60000);
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'vor ' + h + ' Std.';
    return 'vor ' + Math.round(h / 24) + ' T.';
  };
  P.km = function (m) {
    if (m == null) return null;
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m < 10000 ? (Math.round(m / 100) / 10).toFixed(1) : String(Math.round(m / 1000))).replace('.', ',') + ' km';
  };
  // Luftlinie in Metern.
  P.dist = function (a, b, c, d) {
    if ([a, b, c, d].some(function (x) { return x == null; })) return null;
    var R = 6371000, r = Math.PI / 180;
    var x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  };

  // ── Handy finden ──────────────────────────────────────────────────────────
  // Tracker der Companion-App (Quelle der Person, sonst der erste mobile_app-Tracker), sein Gerät und
  // dessen Sensoren. Notify-Dienst: notify.mobile_app_<Gerätename> (Name wie bei der Registrierung).
  // Wie HAs slugify: Apostrophe fallen weg („Basti's iPhone“ → bastis_iphone, nicht basti_s_iphone),
  // Akzente werden zum Grundbuchstaben.
  var slug = function (t) {
    return String(t || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };
  var KEY = {
    battery: [/^battery_level$/, /_battery_level$/],
    charging: [/^battery_state$/, /_battery_state$/],
    wifi: [/^wifi_connection$/, /_wifi_connection$/, /_ssid$/],
    network: [/^connection_type$/, /_connection_type$/, /_network_type$/],
  };
  P.phone = function (hass, pid) {
    var S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
    var st = S[pid];
    if (!st) return null;
    var a = st.attributes || {};
    var trackers = [].concat(a.device_trackers || []);
    var mob = function (t) { return R[t] && R[t].platform === 'mobile_app'; };
    var tid = (a.source && mob(a.source)) ? a.source : trackers.filter(mob)[0];
    if (!tid) return null;
    var dev = R[tid] && R[tid].device_id;
    var out = { tracker: tid, device: dev, name: (D[dev] && (D[dev].name_by_user || D[dev].name)) || ((S[tid] || {}).attributes || {}).friendly_name || tid };
    Object.keys(R).forEach(function (eid) {
      var e = R[eid];
      if (!e || e.device_id !== dev || eid.indexOf('sensor.') !== 0) return;
      var k = String(e.translation_key || eid.split('.')[1]);
      Object.keys(KEY).forEach(function (n) {
        if (out[n]) return;
        if (KEY[n].some(function (re) { return re.test(k) || re.test(eid.split('.')[1]); })) out[n] = eid;
      });
    });
    var svc = (hass.services && hass.services.notify) || {};
    var want = 'mobile_app_' + slug(D[dev] && D[dev].name);
    // Rückfall ohne Trenner verglichen (Gerät umbenannt, andere Schreibweise beim Registrieren).
    var bare = function (x) { return slug(x).replace(/_/g, ''); };
    out.notify = svc[want] ? want : Object.keys(svc).filter(function (k) {
      if (k.indexOf('mobile_app_') !== 0) return false;
      var kb = k.slice(11).replace(/_/g, '');
      return [D[dev] && D[dev].name, out.name].some(function (n) { return bare(n) && kb.indexOf(bare(n)) === 0; });
    })[0] || null;
    return out;
  };

  // proximity (falls eingerichtet): Entfernung und Richtung für diese Person.
  P.proximity = function (hass, pid) {
    var R = (hass && hass.entities) || {}, out = {};
    var who = pid.split('.')[1];
    Object.keys(R).forEach(function (eid) {
      var e = R[eid];
      if (!e || e.platform !== 'proximity' || eid.indexOf(who) < 0) return;
      if (e.translation_key === 'dist_to_zone' && !out.dist) out.dist = eid;
      if (e.translation_key === 'dir_of_travel' && !out.dir) out.dir = eid;
    });
    return out;
  };
  var DIR = { arrived: 'Angekommen', away_from: 'Entfernt sich', towards: 'Kommt näher', stationary: 'Bleibt stehen' };

  // Entfernung nach Hause in Metern: proximity (Einheit beachten), sonst Luftlinie zur Zone „Zuhause“.
  P.away = function (hass, pid) {
    var S = (hass && hass.states) || {}, st = S[pid];
    if (!st || st.state === 'home') return null;
    var px = P.proximity(hass, pid), d = px.dist && S[px.dist];
    if (d && num(d.state) != null) {
      var u = String((d.attributes || {}).unit_of_measurement || 'm');
      return num(d.state) * (u === 'km' ? 1000 : u === 'mi' ? 1609.34 : u === 'ft' ? 0.3048 : 1);
    }
    var a = st.attributes || {}, h = (S['zone.home'] || {}).attributes || {};
    return P.dist(num(a.latitude), num(a.longitude), num(h.latitude), num(h.longitude));
  };

  // ── Verlauf (3 Tage) ──────────────────────────────────────────────────────
  // Einmal je Zustandswechsel abfragen; danach die offenen Live-Bereiche neu zeichnen.
  var hist = {};
  P.history = function (hass, pid, el) {
    var st = hass && hass.states && hass.states[pid];
    if (!st) return null;
    var key = pid + '|' + st.last_changed;
    var hit = hist[pid];
    if (hit && hit.key === key) { if (el && hit.busy) hit.wait.push(el); return hit.list; }
    hist[pid] = { key: key, list: hit ? hit.list : null, busy: true, wait: el ? [el] : [] };
    if (!hass.callApi) return hist[pid].list;
    var start = new Date(Date.now() - 3 * 86400000), now = Date.now();
    hass.callApi('GET', 'history/period/' + start.toISOString() + '?filter_entity_id=' + pid
      + '&end_time=' + encodeURIComponent(new Date(now).toISOString()) + '&minimal_response&no_attributes')
      .then(function (r) {
        var rows = (r && r[0]) || [], segs = [];
        rows.forEach(function (x) {
          var s = x.state, t = Date.parse(x.last_changed);
          if (bad(s) || !isFinite(t)) return;
          var last = segs[segs.length - 1];
          if (last && last.state === s) return;
          if (last) last.end = t;
          segs.push({ state: s, start: Math.max(t, start.getTime()), end: null });
        });
        var h = hist[pid];
        if (!h || h.key !== key) return;
        h.list = segs.reverse();
        h.busy = false;
        h.wait.forEach(function (w) {
          try {
            if (typeof window.casoraKick === 'function') window.casoraKick(w);
            else if (typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
          } catch (e) { /* Popup schon zu */ }
        });
        h.wait = [];
      }).catch(function () { if (hist[pid] && hist[pid].key === key) hist[pid].busy = false; });
    return hist[pid].list;
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  P.pid = function (variables, entity) {
    var v = variables || {};
    var id = v.person_entity || (entity && entity.entity_id) || '';
    return /^person\./.test(id) ? id : '';
  };
  P.popup = function (states, hass, variables, entity) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var pid = P.pid(variables, entity);
    if (!K || !UI || !pid || !states[pid]) return { type: 'vertical-stack', cards: [] };
    var ph = P.phone(hass, pid) || {}, px = P.proximity(hass, pid);
    var watch = [pid, ph.tracker, ph.battery, ph.charging, ph.wifi, ph.network, px.dist, px.dir, 'zone.home'];
    var call = function (part) {
      return 'return window._casoraPerson ? window._casoraPerson.sec(' + JSON.stringify(part) + ', '
        + JSON.stringify(pid) + ', states, hass, this) : "";';
    };
    var zones = Object.keys(states).filter(function (k) { return k.indexOf('zone.') === 0; });
    // HAs Karte: Person und alle Zonen als Kreise, ohne Weg (14.10.: blaue Wegelinien unerwünscht). Gleiche Kartenkacheln wie
    // HAs Kartendialog – Casora bindet keinen weiteren Kartendienst ein.
    var map = {
      type: 'map', hours_to_show: 0, theme_mode: 'auto', aspect_ratio: '2.4',
      entities: [{ entity: pid }].concat(zones.map(function (z) { return { entity: z }; })),
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, map: { card: map } };
    if (ph.tracker) f.phone = { card: K.secCard(watch, call('phone'), states) };
    // „Nach Hause“ nur unterwegs (leer stünde „Zuletzt“ sonst tiefer als „Handy“).
    if (states[pid].state !== 'home') f.home = { card: K.secCard(watch, call('home'), states) };
    f.last = { card: K.secCard(watch, call('last'), states) };
    // Karte: Ecken wie die Platten (die Karte selbst kennt den Radius nicht). Der Grund ist Platzhalter, bis die
    // Kartenkacheln da sind – und sichtbar für den Kopfabstand des Rahmens (_fitHeadGap misst den ersten
    // sichtbaren Inhalt; ohne Grund nahm er „Handy“ darunter und schob alles 80 px hoch).
    var mapStyle = [{ 'border-radius': 'var(--casora-popup-row-radius, 26px)' }, { overflow: 'hidden' }, { 'isolation': 'isolate' },
      { background: 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))' }];
    return K.layout({ fields: f, top: ['hero', 'map'], left: ['phone'], right: ['home', 'last'], moveLeft: ['home'],
      narrowOrder: ['phone', 'home', 'last'], fieldStyle: { map: mapStyle } });
  };

  // „Verlauf · 3 Tage“ als Zeitleiste wie im Schloss-Popup (13-schloss.js): Uhrzeit | Punkt in der Farbe des
  // Orts mit Linie zum nächsten | Ort, darunter bis wann und wie lange. Beim ersten Eintrag eines früheren Tags
  // steht der Tag über der Uhrzeit. „Ganzer Verlauf“ öffnet HAs Verlauf der letzten drei Tage.
  var lastHtml = function (UI, list, pid, now) {
    var font = 'var(--primary-font-family, system-ui)', ink = 'var(--casora-popup-tiles-text-primary, #3A322B)',
      sub = 'var(--casora-soft-sub, rgba(58,50,43,.6))', row = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))',
      ctl = 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', dim = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))';
    var note = function (t) { return '<div style="padding:14px 4px;font-size:14px;font-weight:500;color:' + sub + ';">' + esc(T(t)) + '</div>'; };
    var head = UI.label('Verlauf').replace(/<\/div>$/, '<div style="font-size:12.5px;font-weight:600;color:' + sub + ';">' + esc(T('3 Tage')) + '</div></div>');
    var body;
    if (!list) body = note('Wird geladen …');
    else if (!list.length) body = note('Keine Änderung in den letzten drei Tagen');
    else {
      var items = list.slice(0, 8), today = dayStart(now);
      body = items.map(function (s, i) {
        var d = dayStart(s.start), prev = items[i - 1], first = d !== today && (!prev || dayStart(prev.start) !== d);
        var dd = Math.round((today - d) / 86400000);
        var day = first ? (dd === 1 ? T('Gestern') : new Date(s.start).toLocaleDateString(window.casoraLocale ? window.casoraLocale() : 'de-DE', { weekday: 'short' }).replace(/\.$/, '')) : '';
        var open = s.end == null, last = i === items.length - 1;
        // Teile einzeln, damit die Übersetzung sie erkennt („bis 16:42“, „8 Std. 21 Min.“).
        var info = '<span>' + esc(open ? T('jetzt hier') : T('bis ' + hm(s.end))) + '</span> · <span>' + esc(T(P.dur((s.end || now) - s.start))) + '</span>';
        return '<div class="cpe-ev" style="display:grid;grid-template-columns:minmax(46px,max-content) 22px minmax(0,1fr);align-items:start;column-gap:8px;position:relative;padding:9px 0;">'
          + '<div style="font-size:13px;font-weight:600;color:' + sub + ';font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap;">'
          + (day ? '<div style="font-size:11.5px;font-weight:700;margin:-1px 0 1px;">' + esc(day) + '</div>' : '') + esc(hm(s.start)) + '</div>'
          + '<div style="position:relative;height:100%;display:flex;justify-content:center;">'
          + (last ? '' : '<div style="position:absolute;top:16px;bottom:-18px;width:2px;border-radius:2px;background:' + dim + ';"></div>')
          + '<div style="position:relative;width:12px;height:12px;border-radius:50%;margin-top:4px;background:' + P.zoneHue(s.state) + ';box-shadow:0 0 0 3px ' + row + ';"></div></div>'
          + '<div style="min-width:0;"><div style="font-size:14.5px;font-weight:700;color:' + ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(T(P.place(s.state))) + '</div>'
          + '<div style="font-size:12.5px;font-weight:500;color:' + sub + ';margin-top:1px;white-space:nowrap;">' + info + '</div></div></div>';
      }).join('');
    }
    return '<div style="font-family:' + font + '">' + head
      + '<div class="cpe-verlauf" style="background:' + row + ';border-radius:var(--casora-popup-row-radius, 24px);padding:8px 16px 8px 12px;">' + body + '</div>'
      + '<div role="button" data-casora-person-act="hist" data-casora-person="' + esc(pid) + '" style="box-sizing:border-box;width:100%;text-align:center;margin-top:10px;height:46px;min-height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;'
      + 'font-size:14px;font-weight:700;cursor:pointer;background:var(--casora-soft-mehr-fill, ' + ctl + ');color:var(--casora-soft-mehr-ink, ' + ink + ');">'
      + '<span style="flex:none;margin:0;">' + esc(T('Ganzer Verlauf')) + '</span><ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:18px;display:flex;flex:none;margin:0;"></ha-icon></div></div>';
  };

  P.sec = function (part, pid, states, hass, el) {
    var UI = window._casoraUI;
    var st = states && states[pid];
    if (!UI || !st) return '';
    var a = st.attributes || {}, now = Date.now();
    var since = Date.parse(st.last_changed) || now;
    // „seit“ aus dem Verlauf (1.5): HA setzt last_changed bei jedem Neustart neu – der Verlauf kennt den
    // echten Beginn des Orts (Neustart-Lücken unavailable/unknown zählen dort nicht als Wechsel).
    var seg = (P.history(hass, pid, el) || [])[0];
    if (seg && seg.state === st.state && seg.start < since) since = seg.start;
    if (part === 'hero') {
      var rest = [T('seit') + ' ' + P.when(since, now)];
      var m = P.away(hass, pid);
      if (m != null && m > 150) rest.push(P.km(m) + ' ' + T('von zuhause'));
      return UI.line(P.place(st.state), rest);
    }
    if (part === 'phone') {
      var ph = P.phone(hass, pid);
      if (!ph) return '';
      var S = states, rows = [];
      var tr = S[ph.tracker] || {}, ta = tr.attributes || {};
      var seen = Date.parse(tr.last_updated) || null;
      var how = ta.source_type === 'gps' ? (ta.gps_accuracy != null ? 'GPS · auf ' + Math.round(ta.gps_accuracy) + ' m genau' : 'Standort per GPS')
        : ta.source_type === 'router' ? 'über das WLAN' : ta.source_type === 'bluetooth' || ta.source_type === 'bluetooth_le' ? 'über Bluetooth' : '';
      rows.push({ entity: ph.tracker, icon: 'mdi:cellphone', iconTone: 'var(--casora-color-blue, #5B8FC9)', label: ph.name, sub: how || null,
        value: seen ? P.ago(seen, now) : null });
      var bat = ph.battery && S[ph.battery];
      if (bat && num(bat.state) != null) {
        var lvl = num(bat.state), chg = ph.charging && S[ph.charging] ? String(S[ph.charging].state) : '';
        var charging = /^(charging|full)$/i.test(chg);
        rows.push({ entity: ph.battery, icon: charging ? 'mdi:battery-charging' : 'mdi:battery',
          iconTone: lvl <= 15 ? 'bad' : lvl <= 30 ? 'warn' : 'good', label: 'Akku',
          sub: chg ? (charging ? (/full/i.test(chg) ? 'Voll' : 'Lädt') : 'Lädt nicht') : null, value: Math.round(lvl) + ' %',
          valueTone: lvl <= 15 ? 'bad' : null });
      }
      var wifi = ph.wifi && S[ph.wifi], net = ph.network && S[ph.network];
      if (wifi || net) {
        var ssid = wifi ? String(wifi.state) : '';
        var on = ssid && !bad(ssid) && !/not connected/i.test(ssid);
        var nt = net ? String(net.state).toLowerCase() : '';
        rows.push({ entity: (wifi && ph.wifi) || ph.network, icon: on ? 'mdi:wifi' : 'mdi:signal-cellular-3',
          iconTone: 'var(--casora-color-blue, #5B8FC9)', label: 'Verbindung',
          sub: on ? 'WLAN' : 'kein WLAN', value: on ? ssid : (/cell|mobile/.test(nt) ? 'Mobilfunk' : nt && !bad(nt) ? net.state : 'Mobilfunk') });
      }
      var out = UI.group(rows, 'Handy');
      if (ph.notify) {
        var act = function (kind, icon, label, sub) {
          return UI.group([{ icon: icon, iconTone: 'accent', label: label, sub: sub, tappable: true }], null)
            .replace('<div class="hui-row', '<div data-casora-person-act="' + kind + '" data-casora-person="' + esc(pid)
              + '" data-casora-notify="' + esc(ph.notify) + '" class="hui-row');
        };
        out += '<div style="height:12px"></div>'
          + act('loc', 'mdi:crosshairs-gps', 'Standort jetzt holen', 'fragt die Companion-App')
          + '<div style="height:8px"></div>' + act('msg', 'mdi:message-text-outline', 'Nachricht schicken', null)
          + '<div style="height:8px"></div>' + act('ring', 'mdi:volume-high', 'Klingeln lassen', 'auch wenn es leise ist');
      }
      return out;
    }
    if (part === 'home') {
      if (st.state === 'home') return '';
      var rowsH = [];
      var m2 = P.away(hass, pid);
      if (m2 != null) rowsH.push({ icon: 'mdi:home', iconTone: HOME, label: 'Entfernung', sub: 'Luftlinie zur Zone Zuhause', value: P.km(m2) });
      var px = P.proximity(hass, pid), dir = px.dir && states[px.dir];
      if (dir && DIR[dir.state]) rowsH.push({ entity: px.dir, icon: 'mdi:navigation-variant', iconTone: AWAY, label: 'Richtung', value: DIR[dir.state] });
      return rowsH.length ? UI.group(rowsH, 'Nach Hause') : '';
    }
    if (part === 'last') return lastHtml(UI, P.history(hass, pid, el), pid, now);
    return '';
  };

  // ── Aktionen (Companion-App) ──────────────────────────────────────────────
  var notify = function (hass, svc, data) {
    return hass.callService('notify', svc, data);
  };
  var toast = function (msg) {
    try { window.dispatchEvent(new CustomEvent('hass-notification', { detail: { message: T(msg) } })); } catch (e) { /* ohne Hinweis */ }
    var ha = document.querySelector('home-assistant');
    if (ha) ha.dispatchEvent(new CustomEvent('hass-notification', { detail: { message: T(msg) }, bubbles: true, composed: true }));
  };
  P.act = function (kind, pid, svc) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!hass) return;
    // „Ganzer Verlauf“ braucht keinen Benachrichtigungsdienst (vorher brach !svc auch hier ab – Knopf tat nichts).
    if (kind === 'hist') {
      try { window.casoraPopup.close(); } catch (e) { /* schon zu */ }
      history.pushState(null, '', '/history?entity_id=' + encodeURIComponent(pid)
        + '&start_date=' + encodeURIComponent(new Date(dayStart(Date.now()) - 2 * 86400000).toISOString()));
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return;
    }
    if (!svc) return;
    var name = ((hass.states[pid] || {}).attributes || {}).friendly_name || '';
    if (kind === 'loc') {
      notify(hass, svc, { message: 'request_location_update' }).then(function () { toast('Standort angefragt'); }, function () { toast('Konnte das Handy nicht erreichen'); });
    } else if (kind === 'msg') {
      if (!window.casoraAsk) return;
      window.casoraAsk({ title: T('Nachricht an') + ' ' + name, text: '', yes: T('Senden'), input: { placeholder: 'Nachricht' } }).then(function (txt) {
        if (!txt) return;
        notify(hass, svc, { title: 'Home Assistant', message: txt }).then(function () { toast('Nachricht gesendet'); }, function () { toast('Konnte das Handy nicht erreichen'); });
      });
    } else if (kind === 'ring') {
      var go = window.casoraAsk ? window.casoraAsk({ title: T('Handy klingeln lassen?'), text: T('Es klingelt auch, wenn es leise gestellt ist.'), yes: T('Klingeln') }) : Promise.resolve(true);
      go.then(function (ok) {
        if (!ok) return;
        // iOS: kritischer Hinweis mit Ton; Android: Kanal „alarm_stream“ (läutet auch im Lautlos-Modus).
        notify(hass, svc, { title: 'Casora', message: T('Hier bin ich!'), data: { ttl: 0, priority: 'high', channel: 'alarm_stream',
          push: { sound: { name: 'default', critical: 1, volume: 1.0 } } } })
          .then(function () { toast('Handy klingelt'); }, function () { toast('Konnte das Handy nicht erreichen'); });
      });
    }
  };
  if (!window._casoraPersonClicks) {
    window._casoraPersonClicks = true;
    document.addEventListener('click', function (e) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (!n || !n.getAttribute) continue;
        var kind = n.getAttribute('data-casora-person-act');
        if (!kind) continue;
        e.preventDefault(); e.stopPropagation();
        P.act(kind, n.getAttribute('data-casora-person'), n.getAttribute('data-casora-notify'));
        return;
      }
    }, true);
  }

  // Kopf: Foto der Person füllt die Kachel, Grund in der Farbe des Orts.
  (window._casoraRingPhotoHooks = window._casoraRingPhotoHooks || []).push(function (src, key) {
    if (!/(^|\s)person\./.test(key)) return null;
    var so = src && src._stateObj, a = (so && so.attributes) || {};
    if (!so || !/^person\./.test(so.entity_id) || !a.entity_picture) return null;
    var ha = document.querySelector('home-assistant'), h = ha && ha.hass;
    return { url: h && h.hassUrl ? h.hassUrl(a.entity_picture) : a.entity_picture, hue: P.zoneHue(so.state) };
  });
  // Ohne Foto: Personen-Symbol (Casora-Symbol „person“) in der Kachel.
  var prevRingUrl = window.casoraRingUrl;
  window.casoraRingUrl = function (src, key) {
    if (/(^|\s)person\./.test(key) && typeof window.casoraIconUrl === 'function') return window.casoraIconUrl('person');
    return typeof prevRingUrl === 'function' ? prevRingUrl(src, key) : null;
  };
  // Ohne Foto: Kachel in der Farbe des Orts.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/(^|\s)person\./.test(key)) return null;
    var so = src && src._stateObj;
    return so && /^person\./.test(so.entity_id) ? { hue: P.zoneHue(so.state), off: false } : null;
  });
})();
