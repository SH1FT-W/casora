// ── Casora-Seiten statt HAs Dialog (1.5) ──────────────────────────────────────
// window.casoraRoute(id, {el}) entscheidet, was ein Tipp auf ein Gerät/einen Messwert öffnet – aufgerufen
// von Popup-Zeilen (data-casora-mi), casoraPopup.moreInfo und HAs more-info aus Casora heraus (Halten,
// Badges; casora-core.js). Rückgabe true = Casora übernimmt.
//   1. eigene Haken (window._casoraMiHooks, z. B. Update-Detailseite 17-update-detail.js)
//   2. Zeile „Weitere Einstellungen“ → Geräteseite (Gerätedaten, „Gehört dazu“, „In Home Assistant öffnen“)
//   3. Messwerte (sensor, binary_sensor, number …, Einstellungs-/Diagnose-Entitäten) → Messwert-Seite
//      (Zeitraum, Diagramm bzw. Offen-Band, Höchst/Tiefst/Ø bzw. Zählwerte, Zeitleiste)
//   4. Geräte (Licht, Klima, Medien, Sauger …) → das Casora-Popup ihrer Kachel (openViaCard), sonst Geräteseite;
//      Kamera aus einem offenen Popup heraus (Tipp aufs Bild) → Vollbild
// Jede Seite öffnet im selben Popup mit ‹ zurück (casoraPopup.open({back}) bzw. window._casoraBackNext).
(function () {
  if (window.casoraRoute) return;
  var Z = window._casoraZiele = {};
  var MEAS = /^(sensor|binary_sensor|number|input_number|counter|input_select|select|input_text|event|weather|sun)$/;
  var DEVICE = /^(light|cover|climate|fan|media_player|vacuum|lawn_mower|switch|lock|alarm_control_panel|camera|humidifier|water_heater|valve|siren|input_boolean|person|remote)$/;
  var SETTINGS_ROW = /^(Weitere Einstellungen|More settings)$/i;

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : undefined; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var dur = function (ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' Min.';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
    return Math.round(h / 24) + ' Tage';
  };
  var when = function (ms, now) {
    var dd = Math.round((dayStart(now || Date.now()) - dayStart(ms)) / 86400000);
    if (dd <= 0) return hm(ms);
    if (dd === 1) return T('Gestern') + ' ' + hm(ms);
    return new Date(ms).toLocaleDateString(loc(), { weekday: 'short' }).replace(/\.$/, '') + ' ' + hm(ms);
  };

  // ── Namen, Gerät, Bereich ──────────────────────────────────────────────────
  var reg = function (h, id) { return ((h && h.entities) || {})[id] || {}; };
  var devOf = function (h, id) { var e = reg(h, id); return e.device_id ? ((h.devices || {})[e.device_id] || null) : null; };
  // Registry category that makes an entity a setting or diagnostic value. Not for device_tracker: HA 2026.10
  // marks every tracker diagnostic, yet a phone or pet tracker is a device, not a measurement (issue #25).
  var catOf = function (h, id) { return String(id).indexOf('device_tracker.') === 0 ? null : (reg(h, id).entity_category || null); };
  var devName = function (d) { return d ? (d.name_by_user || d.name || '') : ''; };
  Z.nameOf = function (h, id) {
    var st = h.states[id], fn = (st && st.attributes && st.attributes.friendly_name) || id;
    return String(fn);
  };
  // Kurzname in der Geräteliste („Wohnzimmer Temperatur“ → „Temperatur“ beim Gerät „Wohnzimmer“).
  var shortName = function (h, id, d) {
    var n = Z.nameOf(h, id), dn = devName(d);
    if (dn && n.toLowerCase().indexOf(dn.toLowerCase() + ' ') === 0) n = n.slice(dn.length + 1);
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  var areaOf = function (h, id) {
    var e = reg(h, id), d = devOf(h, id), A = h.areas || {};
    var a = e.area_id || (d && d.area_id);
    return a && A[a] ? A[a].name : null;
  };
  Z.isNumeric = function (st) {
    if (!st) return false;
    var a = st.attributes || {};
    if (a.unit_of_measurement || a.state_class) return true;
    return /^-?\d+(\.\d+)?$/.test(String(st.state)) && !/^(binary_sensor|input_select|select)$/.test(st.entity_id.split('.')[0]);
  };
  Z.fmt = function (h, id, v) {
    var st = h.states[id] || {}, a = st.attributes || {}, e = reg(h, id);
    var n = parseFloat(v);
    if (!isFinite(n)) return String(v);
    var p = e.display_precision != null ? e.display_precision : (e.options && e.options.sensor && e.options.sensor.display_precision);
    if (p == null) p = Math.abs(n) >= 100 ? 0 : 1;
    if (Math.round(n) === n && p > 0 && !a.state_class) p = 0;
    return n.toLocaleString(loc(), { minimumFractionDigits: p, maximumFractionDigits: p }) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
  };
  // Zustandswort für Zweizustands-Sensoren nach Geräteklasse.
  var BIN = {
    door: ['Geöffnet', 'Geschlossen', 'geöffnet'], window: ['Geöffnet', 'Geschlossen', 'geöffnet'], opening: ['Geöffnet', 'Geschlossen', 'geöffnet'],
    garage_door: ['Geöffnet', 'Geschlossen', 'geöffnet'], motion: ['Bewegung', 'Ruhig', 'Bewegung'], occupancy: ['Belegt', 'Frei', 'belegt'],
    presence: ['Anwesend', 'Abwesend', 'anwesend'], moisture: ['Nass', 'Trocken', 'nass'], connectivity: ['Verbunden', 'Getrennt', 'verbunden'],
    battery: ['Schwach', 'Normal', 'schwach'], smoke: ['Rauch', 'Normal', 'Rauch'], problem: ['Problem', 'OK', 'Problem'],
    lock: ['Entriegelt', 'Verriegelt', 'entriegelt'], plug: ['Eingesteckt', 'Ausgesteckt', 'eingesteckt'], running: ['Läuft', 'Aus', 'gelaufen'],
  };
  Z.binWords = function (st) {
    var dc = ((st && st.attributes) || {}).device_class;
    return BIN[dc] || ['An', 'Aus', 'an'];
  };
  Z.stateWord = function (h, id, s) {
    var st = h.states[id];
    if (bad(s)) return s === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar';
    if (/^binary_sensor\./.test(id)) { var w = Z.binWords(st); return s === 'on' ? w[0] : w[1]; }
    if (Z.isNumeric(st)) return Z.fmt(h, id, s);
    try { var l = h.formatEntityState && h.formatEntityState(Object.assign({}, st, { state: s })); if (l) return l; } catch (e) { /* roh */ }
    return String(s);
  };

  // ── Verlauf holen (je Entität und Zeitraum einmal je Zustandswechsel) ───────
  var SPANS = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
  var hist = {}, retried = {};
  Z.history = function (h, id, span, el) {
    var st = h && h.states && h.states[id];
    if (!st) return null;
    var key = id + '|' + span + '|' + st.last_changed;
    var hit = hist[id + '|' + span];
    if (hit && hit.key === key) { if (el && hit.busy) hit.wait.push(el); return hit.rows; }
    var cell = hist[id + '|' + span] = { key: key, rows: hit ? hit.rows : null, busy: true, wait: el ? [el] : [] };
    var now = Date.now(), start = now - (SPANS[span] || SPANS['24h']);
    h.callApi('GET', 'history/period/' + new Date(start).toISOString() + '?filter_entity_id=' + id
      + '&end_time=' + encodeURIComponent(new Date(now).toISOString()) + '&minimal_response&no_attributes')
      .then(function (r) {
        var rows = [];
        ((r && r[0]) || []).forEach(function (x) {
          var t = Date.parse(x.last_changed || x.lu * 1000);
          if (!isFinite(t)) return;
          rows.push({ s: x.state, t: Math.max(t, start) });
        });
        cell.rows = rows;
        // Gerade gewechselt: Der Recorder schreibt mit kurzer Verzögerung, der neue Zustand fehlte dann bis zum
        // nächsten Wechsel in „Änderungen“ und „Verlauf“. Einmal je Wechsel kurz danach nachladen.
        var lc = Date.parse(st.last_changed), last = rows.length ? rows[rows.length - 1].t : 0;
        if (isFinite(lc) && last < lc - 1000 && !retried[key]) { retried[key] = true; cell.again = true; }
      }, function () { cell.rows = cell.rows || []; })
      .then(function () {
        cell.busy = false;
        var kick = function (ws) {
          ws.forEach(function (w) {
            try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* Popup zu */ }
          });
        };
        var ws = cell.wait;
        cell.wait = [];
        kick(ws);
        if (cell.again) {
          setTimeout(function () {
            if (hist[id + '|' + span] !== cell) return;
            cell.key += '|nachladen';
            kick(ws);
          }, 2500);
        }
      });
    return cell.rows;
  };
  // Zahlen: Höchster, Tiefster (mit Zeit) und zeitgewichteter Durchschnitt.
  Z.stats = function (rows, now) {
    var pts = (rows || []).map(function (r) { return { v: parseFloat(r.s), t: r.t }; }).filter(function (p) { return isFinite(p.v); });
    if (!pts.length) return null;
    var max = pts[0], min = pts[0], sum = 0, w = 0;
    pts.forEach(function (p, i) {
      if (p.v > max.v) max = p;
      if (p.v < min.v) min = p;
      var t1 = i + 1 < pts.length ? pts[i + 1].t : now;
      var dt = Math.max(0, t1 - p.t);
      sum += p.v * dt; w += dt;
    });
    return { max: max, min: min, avg: w ? sum / w : pts[pts.length - 1].v, n: pts.length };
  };
  // Zwei Zustände: Abschnitte, wie oft „an“, wie lange insgesamt, längster Abschnitt.
  Z.segments = function (rows, now) {
    var segs = [];
    (rows || []).forEach(function (r) {
      if (bad(r.s)) return;
      var last = segs[segs.length - 1];
      if (last && last.s === r.s) return;
      if (last) last.end = r.t;
      segs.push({ s: r.s, start: r.t, end: null });
    });
    var on = segs.filter(function (x) { return x.s === 'on'; });
    var total = 0, longest = null;
    on.forEach(function (x) {
      var d = (x.end || now) - x.start;
      total += d;
      if (!longest || d > (longest.end || now) - longest.start) longest = x;
    });
    return { segs: segs, count: on.length, total: total, longest: longest };
  };

  // ── Seiten öffnen ──────────────────────────────────────────────────────────
  var backTo = function () {
    var P = window.casoraPopup, prev = P && P.current;
    return prev ? function () { P.open(prev); } : null;
  };
  var pageCfg = function (title, content, back) {
    var P = window.casoraPopup, prev = P && P.current;
    return {
      title: title, content: content, back: back,
      dismiss_on_background: prev ? prev.dismiss_on_background !== false : true,
      style: '--popup-min-width: min(900px, 92vw); --popup-max-width: min(920px, 92vw);',
      popup_styles: prev && prev.popup_styles,
    };
  };
  var call = function (part, id, span) {
    return 'return window._casoraZiele ? window._casoraZiele.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(id) + ', '
      + JSON.stringify(span || '') + ', states, hass, this) : "";';
  };

  // Messwert-Seite (Baustein 1, Entwurf A; Zwei-Zustands-Sensoren als Entwurf D).
  Z.openMeasure = function (id, span, back) {
    var P = window.casoraPopup, K = window._casoraSoftKit, h = hassNow();
    if (!P || !K || !h || !h.states[id]) return false;
    span = SPANS[span] ? span : '24h';
    var st = h.states[id], num = Z.isNumeric(st);
    if (back === undefined) back = backTo();
    Z._back = back;
    var watch = [id];
    var f = { hero: { card: K.secCard(watch, call('m_hero', id, span), h.states) } };
    if (num) {
      f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: span, source: span === '24h' ? 'history' : 'auto',
        series: [{ entity: id, name: Z.nameOf(h, id), unit: (st.attributes || {}).unit_of_measurement || '' }], height: 200, readout: 'own', plate: true } };
    }
    f.vals = { card: K.secCard(watch, call('m_vals', id, span), h.states) };
    f.tl = { card: K.secCard(watch, call('m_tl', id, span), h.states) };
    var lay = K.layout({ fields: f, top: num ? ['hero', 'chart'] : ['hero'], left: ['vals'], right: ['tl'], narrowOrder: ['vals', 'tl'] });
    P.open(pageCfg(Z.nameOf(h, id), lay, back));
    return true;
  };

  // Geräteseite (Baustein 3, Stufe 1): Gerätedaten, „Gehört dazu“, „In Home Assistant öffnen“.
  Z.openDevice = function (id, back) {
    var P = window.casoraPopup, K = window._casoraSoftKit, h = hassNow();
    if (!P || !K || !h || !h.states[id]) return false;
    if (back === undefined) back = backTo();
    var d = devOf(h, id);
    var watch = [id];
    if (d) Object.keys(h.entities || {}).forEach(function (eid) { if (h.entities[eid].device_id === d.id) watch.push(eid); });
    var f = { hero: { card: K.secCard(watch, call('d_hero', id), h.states) }, info: { card: K.secCard(watch, call('d_info', id), h.states) },
      ents: { card: K.secCard(watch, call('d_ents', id), h.states) } };
    var lay = K.layout({ fields: f, top: ['hero'], left: ['info'], right: ['ents'], narrowOrder: ['info', 'ents'] });
    P.open(pageCfg(devName(d) || Z.nameOf(h, id), lay, back));
    return true;
  };

  // Gerät mit eigener Kachel: deren Casora-Popup (ohne zu schalten), sonst Geräteseite.
  Z.openDeviceTile = function (id) {
    var open = window._casoraNotifyOpenViaCard;
    var back = backTo();
    if (!open) return Z.openDevice(id, back);
    window._casoraBackNext = back ? { fn: back, at: Date.now() } : null;
    window._casoraTapPopupOnly = true;
    open(id, function (ok) {
      window._casoraTapPopupOnly = false;
      if (ok) return;
      window._casoraBackNext = null;
      if (!Z.openDevice(id, back) && window.casoraPopup) window.casoraPopup.nativeMoreInfo(id);
    });
    return true;
  };

  // Kamera-Vollbild: Live-Bild groß, ‹ zurück ins Kamera-Popup (statt HAs Kamera-Dialog).
  Z.openCamera = function (id) {
    var P = window.casoraPopup, h = hassNow();
    if (!P || !h || !h.states[id]) return false;
    var back = backTo();
    P.open({
      title: Z.nameOf(h, id), back: back, dismiss_on_background: true,
      content: { type: 'picture-entity', entity: id, camera_view: 'live', show_name: false, show_state: false, aspect_ratio: '16:9',
        tap_action: { action: 'none' }, hold_action: { action: 'none' },
        card_mod: { style: 'ha-card { border-radius: var(--casora-popup-row-radius, 20px) !important; overflow: hidden !important;'
          + ' border: none !important; background: #000 !important; }' } },
      // 16:9 passt ganz auf den Schirm: Breite folgt auch der Höhe (Abstand oben + Kopfzeile ≈ 260px).
      style: '--popup-min-width: min(1400px, 96vw, calc((100vh - 260px) * 16 / 9)); --popup-max-width: min(1400px, 96vw, calc((100vh - 260px) * 16 / 9));',
      popup_styles: (P.current || {}).popup_styles,
    });
    return true;
  };

  window.casoraRoute = function (id, o) {
    var h = hassNow();
    if (!id || !h || !h.states[id]) return false;
    var hooks = window._casoraMiHooks || [];
    for (var i = 0; i < hooks.length; i++) {
      try { if (hooks[i](id, o && o.el)) return true; } catch (e) { /* weiter */ }
    }
    var el = o && o.el;
    // Ganzer Zeilentext: das erste div der Zeile ist oft die (leere) Symbol-Fläche.
    var label = el ? String(el.textContent || '').replace(/\s+/g, ' ') : '';
    if (el && SETTINGS_ROW.test(String(label || '').trim())) return Z.openDevice(id);
    var dom = id.split('.')[0];
    // Picture tapped in an open camera popup → full screen; otherwise (holding the tile) the camera popup.
    if (dom === 'camera' && window.casoraPopup && window.casoraPopup.current) return Z.openCamera(id);
    if (MEAS.test(dom) || catOf(h, id)) return Z.openMeasure(id);
    // A device whose popup is already open: not the same popup again but its device page
    // (settings row in the air purifier, lock row …); only the marker on the person card does nothing.
    if (DEVICE.test(dom) && window.casoraPopup && window.casoraPopup.entity === id) return dom === 'person' ? true : Z.openDevice(id);
    if (DEVICE.test(dom)) return Z.openDeviceTile(id);
    if (devOf(h, id)) return Z.openDevice(id);
    return false;
  };

  // Zeitraum-Pillen und „In Home Assistant öffnen“.
  document.addEventListener('click', function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.getAttribute) continue;
      if (n.hasAttribute('data-casora-zspan')) {
        ev.preventDefault(); ev.stopPropagation();
        var v = n.getAttribute('data-casora-zspan').split('|');
        if (window.casoraHaptic) window.casoraHaptic('selection');
        Z.openMeasure(v[0], v[1], Z._back);
        return;
      }
      if (n.hasAttribute('data-casora-native')) {
        ev.preventDefault(); ev.stopPropagation();
        if (window.casoraPopup) { var nid = n.getAttribute('data-casora-native'); window.casoraPopup.close(); window.casoraPopup.nativeMoreInfo(nid); }
        return;
      }
    }
  }, true);

  // ── Bereiche ───────────────────────────────────────────────────────────────
  var CSS = '<style>.cz-pills{display:flex;gap:6px;justify-content:center;margin-top:12px;}'
    + '.cz-pill{border-radius:999px;padding:7px 16px;font-size:14px;font-weight:650;cursor:pointer;user-select:none;'
    + 'background:var(--casora-soft-control-fill, rgba(127,127,127,.14));color:var(--casora-popup-tiles-text-primary, inherit);}'
    + '.cz-pill.on{background:var(--casora-soft-seg-on, #fff);box-shadow:var(--casora-soft-seg-on-shadow, none);color:var(--casora-soft-seg-on-ink, inherit);}'
    + '.cz-pill > *{pointer-events:none;}'
    + '.cz-band{position:relative;height:30px;border-radius:12px;overflow:hidden;margin-top:14px;'
    + 'background:var(--casora-popup-row-fill, rgba(127,127,127,.10));}'
    + '.cz-band i{position:absolute;top:0;bottom:0;border-radius:2px;background:var(--casora-popup-accent, var(--casora-color-teal, #4E9E95));min-width:3px;}'
    + '.cz-axis{display:flex;justify-content:space-between;font-size:12px;opacity:.6;margin:6px 4px 0;}'
    + '</style>';
  var pills = function (id, span) {
    return '<div class="cz-pills">' + [['24h', '24 Std.'], ['7d', '7 Tage'], ['30d', '30 Tage']].map(function (x) {
      return '<div class="cz-pill' + (x[0] === span ? ' on' : '') + '" data-casora-zspan="' + esc(id + '|' + x[0]) + '"><span>' + esc(T(x[1])) + '</span></div>';
    }).join('') + '</div>';
  };
  var timeline = function (items, now) {
    var font = 'var(--primary-font-family, system-ui)', ink = 'var(--casora-popup-tiles-text-primary, #3A322B)',
      sub = 'var(--casora-soft-sub, rgba(58,50,43,.6))', row = 'var(--casora-popup-row-fill, rgba(140,115,90,0.07))',
      dim = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))';
    var today = dayStart(now);
    return '<div style="font-family:' + font + ';background:' + row + ';border-radius:var(--casora-popup-row-radius, 24px);padding:8px 16px 8px 12px;">'
      + items.map(function (x, i) {
        var d = dayStart(x.t), prev = items[i - 1], first = d !== today && (!prev || dayStart(prev.t) !== d);
        var dd = Math.round((today - d) / 86400000);
        var day = first ? (dd === 1 ? T('Gestern') : new Date(x.t).toLocaleDateString(loc(), { weekday: 'short' }).replace(/\.$/, '')) : '';
        var last = i === items.length - 1;
        return '<div style="display:grid;grid-template-columns:minmax(46px,max-content) 22px minmax(0,1fr);align-items:start;column-gap:8px;padding:9px 0;">'
          + '<div style="font-size:13px;font-weight:600;color:' + sub + ';font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap;">'
          + (day ? '<div style="font-size:12px;font-weight:700;margin:-1px 0 1px;">' + esc(day) + '</div>' : '') + esc(hm(x.t)) + '</div>'
          + '<div style="position:relative;height:100%;display:flex;justify-content:center;">'
          + (last ? '' : '<div style="position:absolute;top:16px;bottom:-18px;width:2px;border-radius:2px;background:' + dim + ';"></div>')
          + '<div style="position:relative;width:12px;height:12px;border-radius:50%;margin-top:4px;background:' + (x.color || dim) + ';box-shadow:0 0 0 3px ' + row + ';"></div></div>'
          + '<div style="min-width:0;"><div style="font-size:15px;font-weight:700;color:' + ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(T(x.title)) + '</div>'
          + (x.sub ? '<div style="font-size:13px;font-weight:500;color:' + sub + ';margin-top:1px;">' + x.sub + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
  };
  var histLink = function (id, span) {
    var start = new Date(Date.now() - (SPANS[span] || SPANS['24h'])).toISOString();
    return '<div role="button" data-casora-link="' + esc('/history?entity_id=' + encodeURIComponent(id) + '&start_date=' + encodeURIComponent(start)) + '" '
      + 'style="box-sizing:border-box;width:100%;margin-top:10px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;'
      + 'font-size:14px;font-weight:700;cursor:pointer;background:var(--casora-soft-mehr-fill, var(--casora-soft-control-fill, rgba(127,127,127,.12)));">'
      + '<span style="flex:none;margin:0;">' + esc(T('Ganzer Verlauf')) + '</span><ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:18px;display:flex;flex:none;margin:0;"></ha-icon></div>';
  };
  // Symbol je Messart/Domäne für Zeilen ohne eigenes Symbol (Geräteseite „Gehört dazu“).
  var DC_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', carbon_dioxide: 'mdi:molecule-co2', pm25: 'mdi:blur',
    pm10: 'mdi:blur', pm1: 'mdi:blur', volatile_organic_compounds: 'mdi:air-filter', volatile_organic_compounds_parts: 'mdi:air-filter',
    power: 'mdi:flash', energy: 'mdi:lightning-bolt', current: 'mdi:current-ac', voltage: 'mdi:sine-wave', battery: 'mdi:battery',
    illuminance: 'mdi:brightness-6', pressure: 'mdi:gauge', signal_strength: 'mdi:wifi', timestamp: 'mdi:clock-outline', duration: 'mdi:timer-outline',
    door: 'mdi:door', window: 'mdi:window-closed-variant', opening: 'mdi:window-closed-variant', motion: 'mdi:motion-sensor', occupancy: 'mdi:home-account',
    moisture: 'mdi:water-alert', connectivity: 'mdi:lan-connect', problem: 'mdi:alert-circle-outline', update: 'mdi:package-up', firmware: 'mdi:package-up' };
  var DOM_ICON = { sensor: 'mdi:chart-line', binary_sensor: 'mdi:checkbox-blank-circle-outline', switch: 'mdi:toggle-switch-outline', number: 'mdi:numeric',
    select: 'mdi:format-list-bulleted', button: 'mdi:gesture-tap-button', light: 'mdi:lightbulb-outline', update: 'mdi:package-up', fan: 'mdi:fan',
    climate: 'mdi:thermostat', media_player: 'mdi:speaker', camera: 'mdi:cctv', lock: 'mdi:lock-outline', cover: 'mdi:window-shutter', vacuum: 'mdi:robot-vacuum',
    event: 'mdi:bell-outline', image: 'mdi:image-outline', text: 'mdi:form-textbox', time: 'mdi:clock-outline' };
  Z.iconOf = function (st) {
    var a = (st && st.attributes) || {};
    return a.icon || DC_ICON[a.device_class] || DOM_ICON[String(st && st.entity_id).split('.')[0]] || 'mdi:circle-small';
  };
  var ACC = 'var(--casora-popup-accent, var(--casora-color-teal, #4E9E95))';
  var DIM = 'var(--casora-soft-icon-off, rgba(140,115,90,0.3))';


  // Zustandsfarben im Verlauf (16.10.2026, Variante C): Pulse-Status farbig wie Kachel/Popup und nach Schwere
  // gestuft hoch; andere Sensoren bleiben beim Akzent.
  // Farbe kräftiger/tiefer: mit der Schriftfarbe gemischt – hell dunkler, dunkel heller (Kontrast >= 3:1 beidseits).
  var deep = function (c, p) { return 'color-mix(in srgb, ' + c + ' ' + (p || 78) + '%, var(--primary-text-color, #3A322B))'; };
  var NEU = 'var(--casora-color-neutral, var(--secondary-text-color))';
  var WORD = { ok: 'Gut', learning: 'Lernt', watch: 'Beobachten', check: 'Prüfen', failed: 'Ausgefallen' };
  var HGT = { ok: 34, learning: 34, watch: 58, check: 80, failed: 100 };
  var stateTone = function (h, id, s) {
    var P = reg(h, id).platform === 'pulse' && window._casoraPulse;
    if (!P || !WORD[s]) return null;   // generisch: andere Enum-Sensoren bekämen hier ihre Zuordnung, sonst ACC
    var C = P.COLOR;
    if (s === 'learning') { var lc = deep(NEU, 70); return { fill: 'repeating-linear-gradient(135deg,' + lc + ' 0 4px, transparent 4px 8px)', dot: lc }; }
    if (s === 'ok') return { fill: deep(C.ok), dot: deep(C.ok) };
    var pc = s === 'watch' ? 65 : 78;   // Gelb braucht mehr Tiefe für >= 3:1 auf Creme
    return { fill: deep(C[s], pc), dot: deep(C[s], pc) };
  };
  Z.sec = function (part, id, span, states, hass, el) {
    var UI = window._casoraUI;
    var st = states && states[id];
    if (!UI || !st || !hass) return '';
    var now = Date.now(), num = Z.isNumeric(st), bin = /^binary_sensor\./.test(id);
    if (part === 'm_hero') {
      var since = Date.parse(st.last_changed);
      var rest = [areaOf(hass, id), isFinite(since) ? T('seit') + ' ' + when(since, now) : null].filter(Boolean);
      var out = CSS + UI.line(Z.stateWord(hass, id, st.state), rest, { tone: bad(st.state) ? 'warn' : null }) + pills(id, span);
      if (!num) {
        // Band: wann „an“ (offen, Bewegung …) über den Zeitraum.
        var rows = Z.history(hass, id, span, el), t0 = now - SPANS[span];
        if (rows && (bin || rows.length)) {
          var sg = Z.segments(rows, now);
          var C3 = stateTone(hass, id, st.state) || (sg.segs[0] && stateTone(hass, id, sg.segs[0].s));
          var sum = {};
          out += '<div class="cz-band"' + (C3 ? ' style="height:44px;"' : '') + '>' + sg.segs.filter(function (x) { return bin ? x.s === 'on' : true; }).map(function (x, k) {
            var l = (x.start - t0) / (now - t0) * 100, w = ((x.end || now) - x.start) / (now - t0) * 100;
            var tn = stateTone(hass, id, x.s);
            sum[x.s] = (sum[x.s] || 0) + ((x.end || now) - Math.max(x.start, t0));
            if (tn) {
              return '<i style="left:' + l.toFixed(2) + '%;width:' + Math.max(0.4, w).toFixed(2) + '%;background:' + tn.fill + ';border-radius:3px;'
                + 'outline:1.5px solid var(--casora-popup-row-fill, rgba(127,127,127,.10));'
                + (C3 ? 'top:auto;height:' + HGT[x.s] + '%;' : '') + '"></i>';
            }
            return '<i style="left:' + l.toFixed(2) + '%;width:' + Math.max(0.4, w).toFixed(2) + '%;' + (bin ? '' : 'opacity:' + (0.35 + 0.65 * ((k % 2) ? 0.5 : 1)) + ';') + '"></i>';
          }).join('') + '</div>';
          var leg = '';
          // Legende erst ab drei Zuständen im Zeitraum – bei „immer Gut“ wäre sie nur Rauschen.
          if (C3 && Object.keys(sum).filter(function (k) { return WORD[k]; }).length > 2) {
            leg = '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;margin-top:10px;font-size:13px;font-weight:600;">'
              + ['failed', 'check', 'watch', 'ok', 'learning'].filter(function (k) { return sum[k]; }).map(function (k) {
                var tk = stateTone(hass, id, k);
                return '<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">'
                  + '<span style="width:10px;height:' + Math.round(4 + HGT[k] / 100 * 10) + 'px;border-radius:2px;background:' + tk.fill + ';align-self:flex-end;margin-bottom:3px;"></span>'
                  + esc(T(WORD[k])) + ' <span style="opacity:.6;font-weight:500;">' + esc(dur(sum[k])) + '</span></span>';
              }).join('') + '</div>';
          }
          out += '<div class="cz-axis"><span>' + esc(when(t0, now)) + '</span><span>' + esc(T('Jetzt')) + '</span></div>' + leg;
        }
      }
      return out;
    }
    var rows2 = Z.history(hass, id, span, el);
    if (part === 'm_vals') {
      var head = span === '24h' ? 'Letzte 24 Std.' : span === '7d' ? 'Letzte 7 Tage' : 'Letzte 30 Tage';
      var r = [];
      if (rows2 == null) return UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head);
      if (num) {
        var s = Z.stats(rows2, now);
        if (s) {
          r.push({ icon: 'mdi:arrow-up-bold-outline', iconTone: 'bad', label: 'Höchster Wert', sub: when(s.max.t, now), value: Z.fmt(hass, id, s.max.v) });
          r.push({ icon: 'mdi:arrow-down-bold-outline', iconTone: 'accent', label: 'Tiefster Wert', sub: when(s.min.t, now), value: Z.fmt(hass, id, s.min.v) });
          r.push({ icon: 'mdi:approximately-equal', iconTone: 'accent', label: 'Durchschnitt', value: Z.fmt(hass, id, s.avg) });
        }
      } else {
        var sg2 = Z.segments(rows2, now), w = Z.binWords(st);
        if (bin) {
          r.push({ icon: 'mdi:counter', iconTone: 'accent', label: w[0], value: sg2.count + '×' });
          r.push({ icon: 'mdi:clock-outline', iconTone: 'accent', label: 'Insgesamt ' + w[2], value: sg2.total ? dur(sg2.total) : '–' });
          if (sg2.longest) r.push({ icon: 'mdi:arrow-expand-horizontal', iconTone: 'accent', label: 'Am längsten',
            sub: when(sg2.longest.start, now), value: dur((sg2.longest.end || now) - sg2.longest.start) });
        } else {
          r.push({ icon: 'mdi:swap-horizontal', iconTone: 'accent', label: 'Änderungen', value: String(Math.max(0, sg2.segs.length - 1)) });
        }
      }
      // Sensor: Gerät (öffnet die Geräteseite) und Akku des Geräts.
      var d = devOf(hass, id), out2 = r.length ? UI.group(r, head) : '';
      if (d) {
        var batt = null;
        Object.keys(hass.entities || {}).some(function (eid) {
          var x = hass.entities[eid], s3 = states[eid];
          if (x.device_id !== d.id || !s3 || (s3.attributes || {}).device_class !== 'battery' || !/^sensor\./.test(eid)) return false;
          batt = parseFloat(s3.state); return isFinite(batt);
        });
        var sub = [d.model, batt != null && isFinite(batt) ? T('Batterie') + ' ' + Math.round(batt) + ' %' : null].filter(Boolean).join(' · ');
        out2 += '<div style="height:16px"></div>' + UI.group([{ icon: 'mdi:chip', iconTone: 'accent', label: devName(d), sub: sub || null, tappable: true }], 'Gerät')
          .replace('<div class="hui-row', '<div data-casora-zdev="' + esc(id) + '" class="hui-row');
      }
      return out2;
    }
    if (part === 'm_tl') {
      var head2 = UI.label ? UI.label('Verlauf') : '<div>Verlauf</div>';
      if (rows2 == null) return head2 + '<div style="padding:14px 4px;opacity:.65;">' + esc(T('Wird geladen …')) + '</div>';
      var items = [];
      if (num) {
        var s4 = Z.stats(rows2, now);
        if (s4) {
          items.push({ t: s4.max.t, title: 'Höchster Wert', sub: esc(Z.fmt(hass, id, s4.max.v)), color: 'var(--casora-color-red, #D35A4E)' });
          items.push({ t: s4.min.t, title: 'Tiefster Wert', sub: esc(Z.fmt(hass, id, s4.min.v)), color: 'var(--casora-color-blue, #5B8FC9)' });
          // Größere Sprünge (mehr als ein Viertel der Spanne zwischen zwei Werten).
          var range = s4.max.v - s4.min.v, pts = rows2.map(function (x) { return { v: parseFloat(x.s), t: x.t }; }).filter(function (x) { return isFinite(x.v); });
          for (var k = 1; k < pts.length && range > 0; k++) {
            var dv = pts[k].v - pts[k - 1].v;
            if (Math.abs(dv) >= range * 0.25 && pts[k].t !== s4.max.t && pts[k].t !== s4.min.t) {
              items.push({ t: pts[k].t, title: dv > 0 ? 'Steigt' : 'Fällt', sub: esc(Z.fmt(hass, id, pts[k - 1].v) + ' → ' + Z.fmt(hass, id, pts[k].v)), color: ACC });
            }
          }
          items.sort(function (a, b) { return b.t - a.t; });
          items = items.slice(0, 6);
        }
      } else {
        var segs = Z.segments(rows2, now).segs.slice().reverse().slice(0, 8);
        items = segs.map(function (x) {
          var word = Z.stateWord(hass, id, x.s);
          return { t: x.start, title: word, sub: x.end ? esc(T('nach')) + ' ' + esc(T(dur(x.end - x.start))) : esc(T('seitdem')),
            color: (stateTone(hass, id, x.s) || {}).dot || (x.s === 'on' || !bin ? ACC : DIM) };
        });
      }
      return head2 + (items.length ? timeline(items, now) : '<div style="padding:14px 4px;opacity:.65;">' + esc(T('Keine Änderung im Zeitraum')) + '</div>') + histLink(id, span);
    }
    if (part === 'd_hero') {
      var dv2 = devOf(hass, id);
      var bits = [dv2 && dv2.manufacturer, dv2 && dv2.model].filter(Boolean);
      return UI.line(bits.length ? bits.join(' · ') : Z.nameOf(hass, id), [areaOf(hass, id)].filter(Boolean));
    }
    if (part === 'd_info') {
      var dv3 = devOf(hass, id), e3 = reg(hass, id), rows3 = [];
      var integ = e3.platform || '';
      try { var tt = hass.localize && hass.localize('component.' + integ + '.title'); if (tt) integ = tt; } catch (x) { /* roh */ }
      if (dv3) {
        if (dv3.manufacturer) rows3.push({ icon: 'mdi:factory', iconTone: 'accent', label: 'Hersteller', value: dv3.manufacturer });
        if (dv3.model) rows3.push({ icon: 'mdi:tag-outline', iconTone: 'accent', label: 'Modell', value: dv3.model });
        if (dv3.sw_version) rows3.push({ icon: 'mdi:chip', iconTone: 'accent', label: 'Firmware', value: String(dv3.sw_version) });
        if (dv3.hw_version) rows3.push({ icon: 'mdi:memory', iconTone: 'accent', label: 'Hardware', value: String(dv3.hw_version) });
        if (dv3.via_device_id && (hass.devices || {})[dv3.via_device_id]) rows3.push({ icon: 'mdi:lan-connect', iconTone: 'accent', label: 'Verbunden über', value: devName(hass.devices[dv3.via_device_id]) });
      }
      if (areaOf(hass, id)) rows3.push({ icon: 'mdi:sofa-outline', iconTone: 'accent', label: 'Bereich', value: areaOf(hass, id) });
      if (integ) rows3.push({ icon: 'mdi:puzzle-outline', iconTone: 'accent', label: 'Integration', value: integ });
      var outI = rows3.length ? UI.group(rows3, 'Gerät') : '';
      // Bewusster Ausweg: HAs eigener Dialog (Einstellungen, die Casora noch nicht zeigt).
      outI += '<div style="height:16px"></div>' + UI.group([{ icon: 'mdi:open-in-new', iconTone: 'rgba(0,0,0,0)', label: 'In Home Assistant öffnen',
        sub: 'Einstellungen, Umbenennen, Symbol', tappable: true }], null)
        .replace('<div class="hui-row', '<div data-casora-native="' + esc(id) + '" class="hui-row');
      return outI;
    }
    if (part === 'd_ents') {
      var dv4 = devOf(hass, id);
      var ids = dv4 ? Object.keys(hass.entities || {}).filter(function (eid) { var x = hass.entities[eid]; return x.device_id === dv4.id && !x.hidden && states[eid]; }) : [id];
      var groups = { main: [], config: [], diagnostic: [] };
      ids.sort().forEach(function (eid) {
        var s5 = states[eid];
        var row = { entity: eid, icon: Z.iconOf(s5), iconTone: 'accent', label: shortName(hass, eid, dv4),
          value: Z.stateWord(hass, eid, s5.state) };
        (groups[catOf(hass, eid)] || groups.main).push(row);
      });
      var outE = '';
      if (groups.main.length) outE += UI.group(groups.main, 'Gehört dazu');
      if (groups.config.length) outE += (outE ? '<div style="height:16px"></div>' : '') + UI.group(groups.config, 'Einstellungen');
      if (groups.diagnostic.length) outE += (outE ? '<div style="height:16px"></div>' : '') + (UI.more
        ? UI.more('cz-diag-' + id, UI.group(groups.diagnostic, null), { label: T('Diagnose'), count: groups.diagnostic.length })
        : UI.group(groups.diagnostic, 'Diagnose'));
      return outE;
    }
    return '';
  };

  // „Gerät“-Zeile auf der Messwert-Seite → Geräteseite.
  document.addEventListener('click', function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.getAttribute || !n.hasAttribute('data-casora-zdev')) continue;
      ev.preventDefault(); ev.stopPropagation();
      if (window.casoraHaptic) window.casoraHaptic('light');
      Z.openDevice(n.getAttribute('data-casora-zdev'));
      return;
    }
  }, true);
})();
