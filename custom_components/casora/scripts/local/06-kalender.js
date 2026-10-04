// ── Kalender-Kachel + Popup (24.09.2026) ────────────────────────────────────
// Template casora_calendar (['casora_entity','casora_popup_calendar']) ruft nur
// window._casoraCalendar.tile()/popup()/sec() auf. Kalender kommen aus
// variables.calendars ([{ entity, name, color, tile }]), sonst CASORA_SETTINGS.calendars bzw. alle Kalender.
// Kachel: nächster Termin aus den Kalender-Zuständen (ohne Abruf). Popup
// (Info-Stil): Hero mit heutigem Datum, links Monat mit Punkten und
// Kalender-Legende (antippen = ein-/ausblenden), rechts gewählter Tag und
// "Demnächst". Termine per REST calendars/…, 5 Min. gemerkt.
(function () {
  if (window._casoraCalendar) return;
  var K = window._casoraCalendar = { ev: null, key: '', ts: 0, busy: false, hide: {}, sel: null, month: null };
  // Kalender: variables.calendars, sonst CASORA_SETTINGS.calendars, sonst alle
  // Kalender im Haus (Abfallkalender nur im Popup, nicht auf der Kachel).
  var PALETTE = ['#0A84FF', '#FF453A', '#30D158', '#BF5AF2', '#FF9F0A', '#64D2FF', '#FFD60A', '#FF375F'];
  var autoCache = { states: null, list: [] };
  var autoCals = function () {
    var own = window.casoraSettings && window.casoraSettings().calendars;
    if (Array.isArray(own) && own.length) return own;
    var ha = document.querySelector('home-assistant');
    var hass = ha && ha.hass;
    var S = hass && hass.states;
    if (!S) return autoCache.list;
    if (autoCache.states === S) return autoCache.list;
    var wasteCal = window.casoraDevice && window.casoraDevice.waste ? window.casoraDevice.waste(hass).calendar : null;
    var list = Object.keys(S).filter(function (id) { return id.indexOf('calendar.') === 0; }).sort()
      .map(function (id, n) {
        var c = { entity: id, name: (S[id].attributes || {}).friendly_name || id, color: PALETTE[n % PALETTE.length] };
        if (id === wasteCal) { c.name = 'Abfall'; c.tile = false; }
        return c;
      });
    autoCache = { states: S, list: list };
    return list;
  };
  var DAYL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var MONS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var day0 = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var addD = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var ymd = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var parseYmd = function (s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var hm = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var diffDays = function (d) { return Math.round((day0(d) - day0(new Date())) / 86400000); };
  var dayWord = function (d, long) {
    var n = diffDays(d);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Morgen';
    if (n > 1 && n < 7) return long ? DAYL[d.getDay()] : DAYS[d.getDay()];
    return (long ? DAYL[d.getDay()] + ', ' : '') + d.getDate() + '. ' + (long ? MON[d.getMonth()] : MONS[d.getMonth()]);
  };
  /* Weich: die iOS-Standardfarben (automatische Palette, Studio-Vorgabe, übernommene Hemma-Werte)
     in Theme-Farben statt greller Systemtöne; Lila ist in Weich Alarm-Rot, deshalb Petrol.
     Selbst gewählte andere Farben bleiben. Standard/Glas unverändert. */
  var SOFT_CAL = { '#0A84FF': 'var(--casora-color-blue, #5B8FC9)', '#FF453A': 'var(--casora-color-red, #D35A4E)',
    '#30D158': 'var(--casora-color-green, #6AAE78)', '#BF5AF2': 'var(--casora-color-teal, #4E9E95)',
    '#FF9F0A': 'var(--casora-color-orange, #DE8A4E)', '#64D2FF': 'var(--casora-color-deep-blue, #4A7DB5)',
    '#FFD60A': 'var(--casora-color-yellow, #E8B04A)', '#FF375F': 'var(--casora-color-pink, #D16E7E)',
    '#8E8E93': 'var(--casora-color-sand, #9A8672)' };
  var softCache = { src: null, out: null };
  K.cals = function (variables) {
    var v = variables && variables.calendars;
    var list = Array.isArray(v) && v.length ? v : autoCals();
    if (!(window._casoraSoft && window._casoraSoft())) return list;
    if (softCache.src === list) return softCache.out;
    var out = list.map(function (c) {
      var t = c && SOFT_CAL[String(c.color || '').toUpperCase()];
      return t ? Object.assign({}, c, { color: t }) : c;
    });
    softCache = { src: list, out: out };
    return out;
  };
  var calOf = function (cals, id) { for (var i = 0; i < cals.length; i++) if (cals[i].entity === id) return cals[i]; return { entity: id, name: id, color: '#8E8E93' }; };

  /* Nächster Termin aus den Kalender-Zuständen (message/start_time/all_day). */
  K.next = function (states, variables) {
    var best = null, now = new Date();
    K.cals(variables).forEach(function (c) {
      if (c.tile === false) return;
      var s = states[c.entity], a = s && s.attributes;
      if (!a || !a.message || !a.start_time) return;
      var st = new Date(String(a.start_time).replace(' ', 'T')), en = new Date(String(a.end_time || a.start_time).replace(' ', 'T'));
      if (isNaN(st)) return;
      var ev = { name: a.message, start: st, end: en, allDay: !!a.all_day, on: s.state === 'on', cal: c };
      if (!ev.on && en < now) return;
      if (!best || (ev.on && !best.on) || (ev.on === best.on && st < best.start)) best = ev;
    });
    return best;
  };
  K.tile = function (states, variables) {
    var n = K.next(states, variables);
    if (!n) return 'Keine Termine';
    if (n.on && !n.allDay) return 'Jetzt · ' + n.name;
    var w = n.on ? 'Heute' : dayWord(n.start, false);
    return w + (n.allDay ? '' : ' ' + hm(n.start)) + ' · ' + n.name;
  };

  /* Kachel-Symbol: Kalenderrahmen (calendar-day.svg) mit heutiger Tageszahl, als Maske. */
  var FRAME = 'M3.06359 17.999L16.3971 17.999C18.4456 17.999 19.4607 16.9776 19.4607 14.9665L19.4607 3.04922C19.4607 1.03808 18.4456 0.0166814 16.3971 0.0166814L3.06359 0.0166814C1.02753 0.0166814 0 1.03386 0 3.04922L0 14.9665C0 16.9819 1.02753 17.999 3.06359 17.999ZM2.9229 16.418C2.05114 16.418 1.57069 15.9582 1.57069 15.0554L1.57069 5.85362C1.57069 4.95081 2.05114 4.48896 2.9229 4.48896L16.5274 4.48896C17.3907 4.48896 17.8921 4.95081 17.8921 5.85362L17.8921 15.0554C17.8921 15.9582 17.3907 16.418 16.5274 16.418Z';
  K.iconUrl = function () {
    var d = new Date().getDate();
    if (K._icD === d && K._icU) return K._icU;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19.4607 17.999">'
      + '<path fill="#fff" d="' + FRAME + '"/>'
      + '<text x="9.73" y="10.55" text-anchor="middle" dominant-baseline="central"'
      + ' font-family="-apple-system,BlinkMacSystemFont,\'SF Pro Text\',\'Helvetica Neue\',Roboto,Arial,sans-serif"'
      + ' font-weight="700" font-size="8.6" letter-spacing="-0.3" fill="#fff">' + d + '</text></svg>';
    K._icD = d;
    K._icU = 'data:image/svg+xml,' + encodeURIComponent(svg);
    return K._icU;
  };
  /* Popup-Ring (Weich): dasselbe Symbol wie die Kachel – Rahmen mit heutiger Tageszahl –
     statt des schlichten calendar-day aus variables.icon. */
  var ringPrev = window.casoraRingUrl;
  window.casoraRingUrl = function (src, key) {
    if (/\bcasora_(popup_)?calendar\b/.test(key)) return K.iconUrl();
    return typeof ringPrev === 'function' ? ringPrev(src, key) : null;
  };
  /* Um Mitternacht Kalender-Kacheln neu zeichnen (Tageszahl, „Heute“/„Morgen“). */
  var midnight = function () {
    var n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
    setTimeout(function () {
      var out = [];
      var ha = document.querySelector('home-assistant');
      find(ha && ha.shadowRoot, 'button-card', out);
      out.forEach(function (el) {
        var c = el._config;
        if (c && typeof c.state_display === 'string' && c.state_display.indexOf('_casoraCalendar') !== -1 && window.casoraKick) window.casoraKick(el);
      });
      midnight();
    }, m - n);
  };
  setTimeout(midnight, 0);

  /* Termine laden: sichtbarer Monat (6 Wochen) plus 31 Tage ab heute. */
  var weekStart = function (d) { var x = day0(d); return addD(x, -((x.getDay() + 6) % 7)); };
  var gridStart = function (m) { var f = new Date(m.getFullYear(), m.getMonth(), 1); return addD(f, -((f.getDay() + 6) % 7)); };
  K.load = function (hass, variables, force) {
    if (!K.month) K.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    var today = day0(new Date()), gs = gridStart(K.month), ws = weekStart(today);
    var s = gs < ws ? gs : ws, e0 = addD(gs, 42), e1 = addD(today, 32), e = e0 > e1 ? e0 : e1;
    var cals = K.cals(variables), key = ymd(s) + '|' + ymd(e) + '|' + cals.map(function (c) { return c.entity; }).join(',');
    if (K.busy || !hass || !hass.callApi) return;
    if (!force && K.key === key && Date.now() - K.ts < 300000) return;
    K.busy = true;
    var q = '?start=' + encodeURIComponent(s.toISOString()) + '&end=' + encodeURIComponent(e.toISOString());
    Promise.all(cals.map(function (c) {
      return hass.callApi('GET', 'calendars/' + c.entity + q).then(function (r) {
        return (r || []).map(function (ev) {
          var sd = ev.start && (ev.start.dateTime || ev.start.date), ed = ev.end && (ev.end.dateTime || ev.end.date);
          var all = !(ev.start && ev.start.dateTime);
          var st = all ? parseYmd(sd) : new Date(sd), en = all ? parseYmd(ed || sd) : new Date(ed || sd);
          if (all && en <= st) en = addD(st, 1);
          return { name: ev.summary || '', loc: ev.location || '', start: st, end: en, allDay: all, cal: c.entity };
        });
      }).catch(function () { return []; });
    })).then(function (lists) {
      K.ev = [].concat.apply([], lists).sort(function (a, b) { return (a.start - b.start) || (b.allDay - a.allDay); });
      K.key = key; K.ts = Date.now(); K.err = false;
    }).catch(function () { K.err = true; })
      .then(function () { K.busy = false; K.repaint(); });
  };
  /* Termine eines Tages (mehrtägige ganztägige auf jedem Tag). */
  var onDay = function (d) {
    var a = day0(d), b = addD(a, 1);
    return (K.ev || []).filter(function (e) { return !K.hide[e.cal] && e.start < b && e.end > a && !(e.allDay === false && e.end.getTime() === a.getTime()); });
  };

  var find = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) find(n.shadowRoot, sel, out); });
    return out;
  };
  K.repaint = function () {
    var ha = document.querySelector('home-assistant');
    if (ha && ha.hass) K.w.hass = ha.hass;
    ['month', 'week', 'day', 'up', 'hero', 'wmonth', 'wday'].forEach(function (k) {
      find(ha && ha.shadowRoot, '.hcal-' + k).forEach(function (n) { n.innerHTML = (window.casoraTr || function (x) { return x; })(K.html(k, K._vars)); });
    });
  };

  var UIT = function () { return (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.56)', ink3: 'rgba(255,255,255,0.42)', font: 'system-ui' }; };
  var PLATE = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
    + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';
  var head = function (t, right) {
    var T = UIT();
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 0 10px;">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');text-align:left;">' + t + '</div>' + (right || '') + '</div>';
  };
  var CSS = function () {
    var T = UIT();
    return '<style>'
      + '.hcal{font-family:' + T.font + ';text-align:left;' + PLATE + 'padding:16px 18px;}'
      + '.hcal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));row-gap:2px;}'
      + '.hcal-w{font-size:12px;font-weight:600;color:' + T.ink3 + ';text-align:center;padding:0 0 6px;}'
      + '.hcal-d{display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 0 4px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}'
      + '.hcal-n{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;font-variant-numeric:tabular-nums;color:' + T.ink + ';pointer-events:none;transition:background-color .15s ease;}'
      + '.hcal-d.o .hcal-n{color:' + T.ink3 + ';opacity:.55;}'
      + '.hcal-d.we .hcal-n{color:' + T.ink2 + ';}'
      + '@media (hover:hover){.hcal-d:hover .hcal-n{background:rgba(255,255,255,0.08);}}'
      + '.hcal-d.s .hcal-n{background:rgba(255,255,255,0.16);font-weight:600;}'
      + '.hcal-d.t .hcal-n{background:var(--casora-color-teal, #00C3D0);color:#000;font-weight:600;opacity:1;}'
      + '.hcal-dots{display:flex;gap:3px;height:5px;pointer-events:none;}'
      + '.hcal-dots i{width:5px;height:5px;border-radius:50%;}'
      + '.hcal-b{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;cursor:pointer;background:rgba(255,255,255,0.08);-webkit-tap-highlight-color:transparent;}'
      + '.hcal-b ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;color:' + T.ink + ';pointer-events:none;}'
      + '.hcal-tb{font-size:13px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;background:rgba(255,255,255,0.08);color:' + T.ink + ';-webkit-tap-highlight-color:transparent;}'
      + '.hcal-lg{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}'
      + '.hcal-c{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;padding:6px 11px;border-radius:999px;cursor:pointer;user-select:none;-webkit-user-select:none;background:rgba(255,255,255,0.10);color:' + T.ink + ';-webkit-tap-highlight-color:transparent;}'
      + '.hcal-c i{width:8px;height:8px;border-radius:50%;pointer-events:none;}'
      + '.hcal-c.off{background:transparent;color:' + T.ink3 + ';box-shadow:inset 0 0 0 1px rgba(255,255,255,0.16);}.hcal-c.off i{opacity:.35;}'
      + '.hcal-r{display:flex;align-items:stretch;gap:12px;padding:9px 0;}'
      + '.hcal-r + .hcal-r{border-top:1px solid var(--casora-popup-divider, rgba(255,255,255,0.08));}'
      + '.hcal-bar{width:4px;border-radius:2px;flex:none;}'
      + '.hcal-tm{flex:none;width:52px;font-size:14px;font-variant-numeric:tabular-nums;color:' + T.ink2 + ';line-height:1.35;}'
      + '.hcal-tx{flex:1;min-width:0;}'
      + '.hcal-tt{font-size:16px;color:' + T.ink + ';line-height:1.3;overflow:hidden;text-overflow:ellipsis;}'
      + '.hcal-ts{font-size:13px;color:' + T.ink3 + ';margin-top:1px;}'
      + '.hcal-e{font-size:15px;color:' + T.ink3 + ';padding:6px 0 2px;}'
      + '.hcal-dh{font-size:13px;font-weight:600;color:' + T.ink2 + ';padding:10px 0 2px;}'
      + '.hcal-dh:first-child{padding-top:0;}'
      + '.hcal-wd{display:flex;align-items:flex-start;gap:12px;padding:8px 0;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}'
      + '.hcal-wd + .hcal-wd{border-top:1px solid var(--casora-popup-divider, rgba(255,255,255,0.08));}'
      + '.hcal-wl{flex:none;width:52px;display:flex;align-items:baseline;gap:5px;pointer-events:none;}'
      + '.hcal-wn{font-size:13px;font-weight:600;color:' + T.ink2 + ';width:20px;}'
      + '.hcal-wdt{font-size:16px;font-variant-numeric:tabular-nums;color:' + T.ink + ';}'
      + '.hcal-wd.t .hcal-wn,.hcal-wd.t .hcal-wdt{color:var(--casora-color-teal, #00C3D0);font-weight:600;}'
      + '.hcal-wd.p{opacity:.45;}'
      + '.hcal-wd.s{background:rgba(255,255,255,0.06);border-radius:12px;margin:0 -8px;padding-left:8px;padding-right:8px;}'
      + '.hcal-wd.s + .hcal-wd,.hcal-wd + .hcal-wd.s{border-top-color:transparent;}'
      + '.hcal-wev{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;pointer-events:none;}'
      + '.hcal-we{display:flex;align-items:center;gap:7px;font-size:15px;line-height:1.3;color:' + T.ink + ';min-width:0;}'
      + '.hcal-we i{width:7px;height:7px;border-radius:50%;flex:none;}'
      + '.hcal-we b{font-weight:400;font-variant-numeric:tabular-nums;color:' + T.ink2 + ';flex:none;}'
      + '.hcal-we span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}'
      + '.hcal-wf{font-size:15px;line-height:1.3;color:' + T.ink3 + ';}'
      + '</style>' + (SOFT() ? SCSS(T) : '');
  };
  /* ── Weich (01.10.2026): Etikett über dem Abschnitt, Termine und Wochentage als Sand-Pillen,
     nur der Monat bleibt eine Platte. Ohne Weich bleibt alles wie oben. ── */
  var SOFT = function () { return !!(window._casoraHH && window._casoraHH.on()); };
  var sHead = function (t, right) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 6px 10px;min-height:20px;">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, var(--secondary-text-color));text-align:left;">'
      + t + '</div>' + (right || '') + '</div>';
  };
  var SCSS = function (T) {
    var row = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))', hov = 'var(--casora-soft-row-hover, rgba(140,115,90,0.11))';
    var sub = 'var(--casora-soft-sub, ' + T.ink2 + ')', rad = 'var(--casora-popup-row-radius, 24px)';
    var act = 'var(--casora-popup-ui-action, #276B64)', on = 'var(--casora-soft-seg-on, #FFFDF9)', onSh = 'var(--casora-soft-seg-on-shadow, none)';
    return '<style>'
      + '.hcal.hs{background:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0;border-radius:0;}'
      + '.hs .hcal-pl{background:var(--casora-popup-row-fill, ' + row + ');border-radius:' + rad + ';padding:14px 12px 16px;}'
      + '.hs .hcal-w{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + sub + ';}'
      + '@media (hover:hover){.hs .hcal-d:hover .hcal-n{background:' + hov + ';}}'
      + '.hs .hcal-d.s .hcal-n{background:' + on + ';box-shadow:' + onSh + ';font-weight:700;color:var(--casora-soft-seg-on-ink, ' + T.ink + ');}'
      + '.hs .hcal-d.t .hcal-n{background:' + act + ';color:var(--casora-popup-ui-on-action, #fff);font-weight:700;}'
      + '.hs .hcal-b,.hs .hcal-tb{background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));}'
      + '.hs .hcal-c{background:' + row + ';color:' + sub + ';font-weight:600;padding:7px 13px;}'
      + '.hs .hcal-c.off{background:transparent;box-shadow:inset 0 0 0 1px ' + hov + ';}'
      + '.hs .hcal-r{background:' + row + ';border-radius:' + rad + ';padding:12px 16px 12px 12px;}'
      + '.hs .hcal-r + .hcal-r{border-top:none;margin-top:8px;}'
      + '.hs .hcal-bar{width:5px;border-radius:3px;}'
      + '.hs .hcal-tm{font-size:13.5px;font-weight:600;color:' + sub + ';}'
      + '.hs .hcal-tt{font-size:14.5px;font-weight:700;letter-spacing:-0.01em;}'
      + '.hs .hcal-ts{font-size:12.5px;font-weight:500;color:' + sub + ';}'
      + '.hs .hcal-e{background:' + row + ';border-radius:' + rad + ';padding:16px;font-size:14px;font-weight:500;color:' + sub + ';}'
      /* Tage unter „Demnächst“ (03.10.2026): untergeordnete Zwischenzeilen wie in der iOS-Kalenderliste,
         nicht in Versalien wie die Abschnitts-Überschrift; der erste Tag rückt an die Überschrift heran. */
      + '.hs .hcal-dh{font-size:13px;font-weight:600;letter-spacing:-0.01em;text-transform:none;color:' + sub + ';padding:14px 8px 6px;}'
      + '.hs .hcal-dh:first-child{padding-top:0;}'
      + '.hs .hcal-wd{background:' + row + ';border-radius:' + rad + ';padding:12px 16px;margin:0;transition:background-color .18s ease;}'
      + '.hs .hcal-wd + .hcal-wd{border-top:none;margin-top:8px;}'
      + '@media (hover:hover){.hs .hcal-wd:hover{background:' + hov + ';}}'
      + '.hs .hcal-wd.s{background:' + on + ';box-shadow:' + onSh + ';margin:0;padding:12px 16px;}'
      + '.hs .hcal-wd.s + .hcal-wd{margin-top:8px;}'
      + '.hs .hcal-wd.t .hcal-wn,.hs .hcal-wd.t .hcal-wdt{color:' + act + ';font-weight:700;}'
      + '.hs .hcal-wn{font-weight:700;color:' + sub + ';}'
      + '.hs .hcal-wdt{font-weight:700;}'
      + '.hs .hcal-we{font-size:14px;font-weight:600;}'
      + '.hs .hcal-we b{font-weight:600;color:' + sub + ';}'
      + '.hs .hcal-wf{font-size:14px;font-weight:500;color:' + sub + ';}'
      + '</style>';
  };
  var row = function (e, cals, withDay) {
    var c = calOf(cals, e.cal);
    var tm = e.allDay ? 'ganztägig' : hm(e.start);
    var span = e.allDay && (e.end - e.start) > 86400000 ? 'bis ' + dayWord(addD(e.end, -1), false) : (!e.allDay ? 'bis ' + hm(e.end) : '');
    /* Ort ohne Leerzeichen/Kommas am Rand; nur Satzzeichen (z. B. „ , “) gilt als leer. */
    var loc = String(e.loc || '').replace(/^[\s,;.·\-–]+|[\s,;·\-–]+$/g, '');
    if (!/[\p{L}\p{N}]/u.test(loc)) loc = '';
    var sub = [c.name, span, loc].filter(Boolean).join(' · ');
    return '<div class="hcal-r"><div class="hcal-bar" style="background:' + c.color + ';"></div>'
      + '<div class="hcal-tm"' + (e.allDay ? ' style="font-size:12px;"' : '') + '>' + tm + '</div>'
      + '<div class="hcal-tx"><div class="hcal-tt">' + esc(e.name) + '</div><div class="hcal-ts">' + esc(sub) + '</div></div></div>';
  };

  /* Monat mit Punkten, Blättern und Legende: gemeinsam für das Kalender- und das Abfall-Popup.
     pre: Vorsilbe der Tipp-Aktionen ('' Kalender, 'w' Abfall), dots(d) → Farben des Tages,
     legend: [{ key, color, name, off }]. */
  var monthHtml = function (m, sel, pre, dots, legend) {
    var today = day0(new Date()), gs = gridStart(m);
    var isCur = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
    var nav = '<div style="display:flex;align-items:center;gap:6px;">'
      + (isCur ? '' : '<span class="hcal-tb" data-hcal="' + pre + 'nav:0">Heute</span>')
      + '<span class="hcal-b" data-hcal="' + pre + 'nav:-1"><ha-icon icon="mdi:chevron-left"></ha-icon></span>'
      + '<span class="hcal-b" data-hcal="' + pre + 'nav:1"><ha-icon icon="mdi:chevron-right"></ha-icon></span></div>';
    var g = '<div class="hcal-g">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(function (w) { return '<div class="hcal-w">' + w + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var d = addD(gs, i), cols = dots(d);
      var cls = 'hcal-d' + (d.getMonth() !== m.getMonth() ? ' o' : '') + (d.getDay() % 6 === 0 ? ' we' : '')
        + (ymd(d) === ymd(today) ? ' t' : '') + (ymd(d) === ymd(sel) ? ' s' : '');
      g += '<div class="' + cls + '" data-hcal="' + pre + 'day:' + ymd(d) + '"><div class="hcal-n">' + d.getDate() + '</div>'
        + '<div class="hcal-dots">' + cols.slice(0, 3).map(function (cc) { return '<i style="background:' + cc + ';"></i>'; }).join('') + '</div></div>';
    }
    g += '</div>';
    var lg = '<div class="hcal-lg">' + legend.map(function (c) {
      return '<span class="hcal-c' + (c.off ? ' off' : '') + '" data-hcal="' + c.key + '"><i style="background:' + c.color + ';"></i>' + esc(c.name) + '</span>';
    }).join('') + '</div>';
    if (SOFT()) return CSS() + '<div class="hcal hs">' + sHead(MON[m.getMonth()] + ' ' + m.getFullYear(), nav) + '<div class="hcal-pl">' + g + lg + '</div></div>';
    return CSS() + '<div class="hcal">' + head(MON[m.getMonth()] + ' ' + m.getFullYear(), nav) + g + lg + '</div>';
  };

  /* ── Abfall-Popup (03.10.2026, optional über Studio → Einstellungen → Haus & Geräte):
     derselbe Monat, die Abholtage als Punkte in der Farbe der Tonne (Weich gedämpft wie die
     Tonnen-Symbole), darunter die Abholung am gewählten Tag. Eigener Zustand K.w, damit sich
     Kalender- und Abfall-Popup nicht gegenseitig den Monat oder Tag verstellen. ── */
  K.w = { sel: null, month: null, hide: {}, vars: null, hass: null, tries: 0 };
  var wasteData = function () {
    var D = window.casoraDevice, hass = K.w.hass;
    var W = D && D.waste && hass ? D.waste(hass, K.w.vars) : null;
    if (!W) return { list: [], loading: false };
    if (W.calendar && window._casoraTrashFetch) window._casoraTrashFetch(hass, W.calendar);
    var tone = SOFT() && window._casoraSoftColor ? window._casoraSoftColor : function (c) { return c; };
    var list = (D.wasteDates ? D.wasteDates(hass, W) : []).filter(function (x) { return x.dates.length; }).map(function (x) {
      var keys = {};
      x.dates.forEach(function (d) { keys[ymd(d)] = 1; });
      return { id: x.bin.id, label: x.bin.label, color: tone(x.bin.color), dates: x.dates, keys: keys };
    });
    var TC = window._casoraTrashCal;
    return { list: list, loading: !!(W.calendar && !(TC && TC.id === W.calendar)) };
  };
  var wasteHtml = function (k) {
    var data = wasteData(), today = day0(new Date());
    var on = function (d) { return data.list.filter(function (b) { return !K.w.hide[b.id] && b.keys[ymd(d)]; }); };
    var sel = K.w.sel ? parseYmd(K.w.sel) : null;
    if (!sel) {
      var first = null;
      data.list.forEach(function (b) { if (!K.w.hide[b.id] && (!first || b.dates[0] < first)) first = b.dates[0]; });
      sel = first || today;
    }
    if (k === 'wmonth') {
      return monthHtml(K.w.month || new Date(sel.getFullYear(), sel.getMonth(), 1), sel, 'w',
        function (d) { return on(d).map(function (b) { return b.color; }); },
        data.list.map(function (b) { return { key: 'wbin:' + b.id, color: b.color, name: b.label, off: !!K.w.hide[b.id] }; }));
    }
    var n = diffDays(sel);
    var t = n === 0 ? 'Heute' : n === 1 ? 'Morgen' : DAYL[sel.getDay()] + ', ' + sel.getDate() + '. ' + MON[sel.getMonth()];
    var hits = on(sel);
    var sub = n === 0 ? 'Abholung heute' : n === 1 ? 'Abholung morgen · heute Abend raus' : n > 1 ? 'Abholung in ' + n + ' Tagen' : 'Abholung';
    var body = hits.length ? hits.map(function (b) {
      return '<div class="hcal-r"><div class="hcal-bar" style="background:' + b.color + ';"></div>'
        + '<div class="hcal-tx"><div class="hcal-tt">' + esc(b.label) + '</div><div class="hcal-ts">' + esc(sub) + '</div></div></div>';
    }).join('') : '<div class="hcal-e">' + (data.loading && !data.list.length ? 'Wird geladen …' : 'Keine Abholung') + '</div>';
    return CSS() + (SOFT() ? '<div class="hcal hs">' + sHead(esc(t)) : '<div class="hcal">' + head(esc(t))) + body + '</div>';
  };
  /* Abschnitt im Abfall-Popup; lädt der Abfall-Kalender noch, wird ein paar Mal nachgezeichnet. */
  K.wsec = function (k, states, hass, variables) {
    K.w.hass = hass; K.w.vars = variables;
    var D = window.casoraDevice, W = D && D.waste ? D.waste(hass, variables) : null, TC = window._casoraTrashCal;
    if (W && W.calendar && !(TC && TC.id === W.calendar) && K.w.tries < 8) {
      K.w.tries++;
      setTimeout(K.repaint, 1200);
    }
    return '<div class="hcal-' + k + '">' + K.html(k) + '</div>';
  };
  /* Spalte fürs Abfall-Popup: Monat und gewählter Tag; beim Öffnen auf den nächsten Abholtag. */
  K.wcol = function (variables, watch) {
    K.w.sel = null; K.w.month = null; K.w.tries = 0;
    var V = {};
    Object.keys(variables || {}).forEach(function (key) { if (key.indexOf('trash_') === 0) V[key] = variables[key]; });
    return colCard(['wmonth', 'wday'], null, watch || [], V, 'wsec');
  };

  K.html = function (k, variables) {
    if (k === 'wmonth' || k === 'wday') return wasteHtml(k);
    var T = UIT(), cals = K.cals(variables), today = day0(new Date());
    var sel = K.sel ? parseYmd(K.sel) : today;
    var wait = !K.ev ? '<div class="hcal-e">' + (K.err ? 'Kalender nicht erreichbar' : 'Wird geladen …') + '</div>' : null;
    if (k === 'hero') {
      var n = K.ev ? onDay(today).length : null;
      var nx = (K.ev || []).filter(function (e) { return !K.hide[e.cal] && e.end > new Date() && day0(e.start) > today; })[0];
      var UI = window._casoraUI;
      var o = { center: true, label: DAYL[today.getDay()] + ', ' + today.getDate() + '. ' + MON[today.getMonth()],
        value: n == null ? '…' : n === 0 ? 'Keine Termine' : n === 1 ? '1 Termin' : n + ' Termine',
        sub: nx ? 'Als Nächstes: ' + dayWord(nx.start, false) + (nx.allDay ? '' : ' ' + hm(nx.start)) + ' · ' + nx.name : null };
      /* Weich (Entschlacken): „3 Termine heute“ als eine Aussage, das Datum steht im Monat. */
      if (window._casoraHH && window._casoraHH.on() && n != null) { o.label = null; o.value = n === 0 ? 'Heute keine Termine' : o.value + ' heute'; }
      return UI && UI.hero ? UI.hero(o) : '';
    }
    if (k === 'month') {
      return monthHtml(K.month || new Date(today.getFullYear(), today.getMonth(), 1), sel, '', function (d) {
        var cols = [];
        (K.ev ? onDay(d) : []).forEach(function (e) { var cc = calOf(cals, e.cal).color; if (cols.indexOf(cc) < 0) cols.push(cc); });
        return cols;
      }, cals.map(function (c) { return { key: 'cal:' + c.entity, color: c.color, name: c.name, off: !!K.hide[c.entity] }; }));
    }
    if (k === 'day') {
      var list = K.ev ? onDay(sel) : [];
      var body = wait || (list.length ? list.map(function (e) { return row(e, cals); }).join('') : '<div class="hcal-e">Keine Termine</div>');
      var t = diffDays(sel) === 0 ? 'Heute' : diffDays(sel) === 1 ? 'Morgen' : DAYL[sel.getDay()] + ', ' + sel.getDate() + '. ' + MON[sel.getMonth()];
      return CSS() + (SOFT() ? '<div class="hcal hs">' + sHead(esc(t)) : '<div class="hcal">' + head(esc(t))) + body + '</div>';
    }
    if (k === 'week') {
      var w0 = weekStart(today), wout = '', wseen = [];
      for (var j = 0; j < 7; j++) {
        var wd = addD(w0, j), wl = (K.ev ? onDay(wd) : []).slice().sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
        wl.forEach(function (e) { if (wseen.indexOf(e) < 0) wseen.push(e); });
        var wcls = 'hcal-wd' + (ymd(wd) === ymd(today) ? ' t' : wd < today ? ' p' : '') + (K.sel && ymd(wd) === K.sel ? ' s' : '');
        var wev = wl.length ? wl.slice(0, 4).map(function (e) {
          return '<div class="hcal-we"><i style="background:' + calOf(cals, e.cal).color + ';"></i>'
            + (e.allDay ? '' : '<b>' + hm(e.start) + '</b>') + '<span>' + esc(e.name) + '</span></div>';
        }).join('') + (wl.length > 4 ? '<div class="hcal-wf">+' + (wl.length - 4) + ' weitere</div>' : '')
          : '<div class="hcal-wf">Frei</div>';
        wout += '<div class="' + wcls + '" data-hcal="day:' + ymd(wd) + '"><div class="hcal-wl"><span class="hcal-wn">'
          + DAYS[wd.getDay()] + '</span><span class="hcal-wdt">' + wd.getDate() + '.</span></div><div class="hcal-wev">' + wev + '</div></div>';
      }
      var wr = K.ev ? '<div style="font-size:13px;color:' + T.ink3 + ';">' + (wseen.length === 1 ? '1 Termin' : wseen.length + ' Termine') + '</div>' : '';
      return CSS() + (SOFT() ? '<div class="hcal hs">' + sHead('Diese Woche', wr.replace('font-size:13px;', 'font-size:13px;font-weight:600;')) : '<div class="hcal">' + head('Diese Woche', wr)) + (wait || wout) + '</div>';
    }
    if (k === 'up') {
      var from = addD(today, 1), to = addD(today, 31), out = '', last = '', cnt = 0;
      (K.ev || []).forEach(function (e) {
        if (cnt >= 12 || K.hide[e.cal] || e.start < from || e.start >= to) return;
        var dk = ymd(day0(e.start));
        if (dk !== last) { out += '<div class="hcal-dh">' + esc(dayWord(e.start, true)) + '</div>'; last = dk; }
        out += row(e, cals); cnt++;
      });
      return CSS() + (SOFT() ? '<div class="hcal hs">' + sHead('Demnächst') : '<div class="hcal">' + head('Demnächst')) + (wait || out || '<div class="hcal-e">Nichts in den nächsten 30 Tagen</div>') + '</div>';
    }
    return '';
  };
  /* Abschnitt für ein custom_field: Hülle mit Klasse, damit Antippen/Laden neu zeichnen kann. */
  K.sec = function (k, states, hass, variables) {
    K.load(hass, variables);
    K._vars = variables;
    return '<div class="hcal-' + k + '">' + K.html(k, variables) + '</div>';
  };

  /* Spalte aus Abschnitten (custom_fields, je eine Hülle aus sec/wsec), für beide Popups. */
  var colCard = function (keys, entityId, watch, vars, fn) {
    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var cf = {}, cs = {};
    keys.forEach(function (k) {
      cf[k] = '[[[ return window._casoraCalendar ? window._casoraCalendar.' + fn + '(' + JSON.stringify(k) + ', states, hass, variables) : ""; ]]]';
      cs[k] = [{ 'justify-self': 'stretch' }];
    });
    var card = {
      type: 'custom:button-card', triggers_update: watch, variables: vars,
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: colStyle }, extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }, { 'align-content': 'start' }],
        custom_fields: cs,
      },
      custom_fields: cf,
    };
    if (entityId) card.entity = entityId;
    return card;
  };

  K.popup = function (entity, variables, states, hass) {
    if (!entity) return { type: 'vertical-stack', cards: [] };
    K.sel = null; K.month = null; K.ts = 0; K.load(hass, variables, true);
    var watch = [entity.entity_id].concat(K.cals(variables).map(function (c) { return c.entity; }))
      .filter(function (w, i, a) { return a.indexOf(w) === i && states[w]; });
    var fld = function (k) { return '[[[ return window._casoraCalendar ? window._casoraCalendar.sec(' + JSON.stringify(k) + ', states, hass, variables) : ""; ]]]'; };
    var makeCol = function (keys) { return colCard(keys, entity.entity_id, watch, { calendars: variables.calendars || null }, 'sec'); };
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; will-change: auto !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');
    return {
      type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch, variables: { calendars: variables.calendars || null },
      card_mod: { style: wrapperStyle },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: "hero hero" "left right" !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"hero" "left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { hero: [{ 'justify-self': 'stretch' }], left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: (function () {
        /* Weich (Entschlacken 01.10.2026): ohne „Diese Woche“ – sie doppelt sich mit Monat und „Demnächst“. */
        if (window._casoraHH && window._casoraHH.on()) return { hero: fld('hero'), left: { card: makeCol(['month']) }, right: { card: makeCol(['day', 'up']) } };
        var sp = window._casoraSplit ? window._casoraSplit('calendar', ['month', 'week'], ['day', 'up'], { leftMovable: ['week'] }) : { left: ['month', 'week'], right: ['day', 'up'] };
        return { hero: fld('hero'), left: { card: makeCol(sp.left) }, right: { card: makeCol(sp.right) } }; })(),
    };
  };

  /* Antippen: Tag wählen, Monat blättern, Kalender ein-/ausblenden (Capture, da Popups Klicks schlucken). */
  var target = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].getAttribute && p[i].hasAttribute('data-hcal')) return p[i].getAttribute('data-hcal');
    return null;
  };
  var act = function (a) {
    var p = a.split(':'), v = a.slice(p[0].length + 1);
    if (p[0] === 'day') {
      K.sel = v; var d = parseYmd(v);
      if (!K.month || d.getMonth() !== K.month.getMonth() || d.getFullYear() !== K.month.getFullYear()) K.month = new Date(d.getFullYear(), d.getMonth(), 1);
    } else if (p[0] === 'nav') {
      var t = new Date();
      if (v === '0') { K.month = new Date(t.getFullYear(), t.getMonth(), 1); K.sel = null; }
      else { var m = K.month || new Date(t.getFullYear(), t.getMonth(), 1); K.month = new Date(m.getFullYear(), m.getMonth() + Number(v), 1); }
    } else if (p[0] === 'cal') { K.hide[v] = !K.hide[v]; }
    else if (p[0] === 'wday') {
      K.w.sel = v; var wd = parseYmd(v), wm = K.w.month;
      if (!wm || wd.getMonth() !== wm.getMonth() || wd.getFullYear() !== wm.getFullYear()) K.w.month = new Date(wd.getFullYear(), wd.getMonth(), 1);
    } else if (p[0] === 'wnav') {
      var wt = new Date();
      if (v === '0') { K.w.month = new Date(wt.getFullYear(), wt.getMonth(), 1); K.w.sel = null; }
      else { var wm0 = K.w.month || (K.w.sel ? parseYmd(K.w.sel) : wt); K.w.month = new Date(wm0.getFullYear(), wm0.getMonth() + Number(v), 1); }
    } else if (p[0] === 'wbin') { K.w.hide[v] = !K.w.hide[v]; }
    K.repaint();
    if (p[0].charAt(0) === 'w') return;
    var ha = document.querySelector('home-assistant');
    K.load(ha && ha.hass, K._vars);
  };
  var tS = null, tDone = 0;
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; tS = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    var a = target(ev); if (!a || !tS) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - tS.x) > 10 || Math.abs(t.clientY - tS.y) > 10)) return;
    tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); act(a);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var a = target(ev); if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - tDone >= 700) act(a);
  }, true);
})();

// ── Thermostat aktiv? ───────────────────────────────────────────────────────
// Rückfall, falls casora-core.js window.casoraClimateActive nicht mitbringt.
// Thermostat-Texte ("Heizt"/"Bereit") lesen sie über window.casoraClimateActive?.(entity).
if (typeof window.casoraClimateActive !== 'function') {
  window.casoraClimateActive = function (entity) {
    const mode = entity?.state;
    const action = entity?.attributes?.hvac_action;
    const heating = mode === 'heat' && (action == null || action === 'heating');
    const cooling = mode === 'cool' && (action == null || action === 'cooling');
    return { heating, cooling, active: heating || cooling };
  };
}

// ── Glocke: Neustart-Filter (25.09.2026) ───────────────────────────────────
// Nach jedem HA-Neustart springen Entitäten unavailable/unknown → alter Zustand.
// Das Logbuch schreibt das als neuen Eintrag: Klingel-Event (alter Zeitstempel
// vom 28.11.2025) wurde zu "hat geklingelt", Schlösser zu "verriegelt".
// Pflanzen: last_changed = Neustart-Zeit → Hinweis wurde wieder "neu".
(function () {
  if (window._casoraRestartGuard) return;
  window._casoraRestartGuard = true;
  var DEAD = { unavailable: 1, unknown: 1, '': 1 };
  // Fahrzeug-Sensoren (Türen, Schlösser, Klappen eines Autos; Daten oft verzögert) nie in der
  // Glocke: window.casoraIsVehicle aus 00-finden.js.
  var vehicle = function (id) {
    if (id.indexOf('binary_sensor.') !== 0 || typeof window.casoraIsVehicle !== 'function') return false;
    var ha = document.querySelector('home-assistant');
    try { return !!(ha && ha.hass && window.casoraIsVehicle(ha.hass, id)); } catch (e) { return false; }
  };

  var guard = {
    describe: function (entry, st, prev) {
      var id = entry.entity_id || '';
      var s = String(entry.state == null ? '' : entry.state);
      if (vehicle(id)) return null;
      if (prev !== undefined && DEAD[prev]) return null;       // Rückkehr nach Neustart
      if (DEAD[s]) return null;
      if (id.indexOf('event.') === 0) {
        // Event-Zustand = Zeitpunkt des Ereignisses; muss zum Logbuch-Eintrag passen.
        var fired = Date.parse(s), when = Number(entry.when) * 1000;
        if (!isFinite(fired) || !isFinite(when) || Math.abs(when - fired) > 120000) return null;
      }
      if (id.indexOf('binary_sensor.') === 0 && /doorbell|ding|chime/i.test(id) && s !== 'on') return null;
      return undefined;
    },

    // Pflanzen: echten Problem-Beginn aus dem Verlauf statt last_changed.
    standing: function (hass, rows) {
      var mid = new Date(); mid.setHours(0, 0, 0, 0);
      var m = mid.getTime();
      rows.forEach(function (r) {
        if (String(r.id || '').indexOf('casora:plant:') !== 0) return;
        var st = hass.states[r.entity];
        var lc = st && st.last_changed;
        var c = _plant[r.entity];
        if (c && c.lc === lc && c.day === m) {
          if (c.since != null) r.when = Math.max(c.since, m);
          else r.when = m;                                    // Abfrage läuft noch
          return;
        }
        _plant[r.entity] = { lc: lc, day: m, since: null };
        r.when = m;
        lookup(hass, r.entity, m);
      });
      return rows.filter(function (r) { return !HIDE.test(String(r.entity || '')); });
    },
  };

  var _plant = {};

  function lookup(hass, id, m) {
    if (!hass.callWS) return;
    hass.callWS({
      type: 'history/history_during_period',
      start_time: new Date(m).toISOString(),
      entity_ids: [id], minimal_response: true, no_attributes: true,
      significant_changes_only: false,
    }).then(function (res) {
      var list = (res && res[id]) || [];
      var since = m;
      // Letzter Wechsel von einem echten Nicht-Problem-Zustand zu "problem".
      var last = null;
      list.forEach(function (x) {
        var v = x.s;
        if (DEAD[v]) return;
        var t = Number(x.lc || x.lu) * 1000;
        if (v === 'problem' && last !== 'problem' && last !== null) since = t;
        last = v;
      });
      var c = _plant[id];
      if (c && c.day === m) c.since = since;
    }).catch(function () {});
  }

  window.CASORA_NOTIFY_EXTENSIONS = [guard].concat(window.CASORA_NOTIFY_EXTENSIONS || []);
})();

// ── Nachzeichnen nach spätem Laden ────────────────────────────────────────
// button-card kommt oft aus dem Cache und zeichnet Kacheln, bevor diese Datei
// geladen ist. Kacheln, die Helfer von hier nutzen (_casoraCar, _casoraBike, …),
// zeigen dann den Rohwert, bis sich ihr Zustand ändert. Einmal alle betroffenen
// button-cards neu zeichnen, wie casora-core.js es für die eigenen macht.
(function () {
  if (window._casoraLocalKick) return;
  window._casoraLocalKick = true;

  function collect(root, out, depth) {
    if (!root || depth > 30 || !root.querySelectorAll) return;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.localName === 'button-card') out.push(el);
      if (el.shadowRoot) collect(el.shadowRoot, out, depth + 1);
    }
  }

  function kick() {
    var els = [];
    collect(document, els, 0);
    els.forEach(function (el) {
      var cfg = el._config;
      if (!cfg) return;
      // Nur die Felder der Kachel selbst ansehen, nicht die (großen) Popups.
      var parts = [cfg.state_display, cfg.label, cfg.name];
      var cf = cfg.custom_fields || {};
      Object.keys(cf).forEach(function (k) { if (typeof cf[k] === 'string') parts.push(cf[k]); });
      // Casora: auch Variablen, die den Geräte-Finder fragen (Drucker, Solarspeicher …).
      var vars = cfg.variables || {};
      Object.keys(vars).forEach(function (k) { if (typeof vars[k] === 'string') parts.push(vars[k]); });
      if (!parts.some(function (t) { return typeof t === 'string' && (t.indexOf('window._casora') !== -1 || t.indexOf('window.casoraDevice') !== -1); })) return;
      if (typeof window.casoraKick === 'function') window.casoraKick(el);
      else if (typeof el.requestUpdate === 'function') el.requestUpdate('_config', undefined);
    });
  }

  // Zwei Durchgänge: sofort und nachdem noch montierende Ansichten stehen.
  setTimeout(kick, 0);
  setTimeout(kick, 1500);
})();
