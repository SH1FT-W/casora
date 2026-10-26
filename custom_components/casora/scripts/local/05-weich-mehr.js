// ── Weich: Netzwerk- und Energie-Popup entschlackt (01.10.2026) ────────────────
// Nur im Weich-Design (window._casoraSoft()). casora_popup_network/_energy rufen
// window._casoraSoftNet.build(ctx) bzw. window._casoraSoftEnergy.build(ctx) auf und
// bekommen eine fertige ui-Karte zurück; in Standard und Glas bleibt alles wie bisher.
// Aufbau wie das Licht-Popup: Ring + Titel (casora-popup), eine Unterzeile, Diagramm
// über volle Breite, links Bedienung, rechts Liste, unten rechts „Mehr“ (UI.more).
// Live: Jeder Bereich ist eine eigene button-card mit triggers_update, die nur
// window._casoraSoft*.sec(...) aufruft – der Popup-Inhalt selbst wird nur beim Öffnen gebaut.
(function () {
  if (window._casoraSoftNet) return;
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var LANG = function (hass) { return (hass && hass.locale && hass.locale.language) || 'de'; };
  var num = function (states, id) {
    if (!id || !states[id]) return null;
    var n = parseFloat(states[id].state);
    return isNaN(n) ? null : n;
  };
  /* Leistung in Watt, auch wenn der Sensor kW/MW meldet (B-TPL-03). */
  var watt = function (states, id) {
    var n = num(states, id); if (n == null) return null;
    var u = (states[id].attributes || {}).unit_of_measurement;
    return u === 'kW' ? n * 1000 : u === 'MW' ? n * 1e6 : u === 'mW' ? n / 1000 : n;
  };
  var raw = function (states, id) { return (id && states[id]) ? states[id].state : null; };
  var ok = function (s) { return s != null && s !== 'unknown' && s !== 'unavailable'; };
  var fN = function (v, hass) { return v == null ? '—' : (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(LANG(hass)); };
  var fW = function (v, hass) {
    return v == null ? '—' : (Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10).toLocaleString(LANG(hass)) + ' kW' : Math.round(v) + ' W');
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    // Kalendertage statt 24-h-Blöcke (#11): vor 36 Stunden ist „vor 1 T.“, nicht „vor 2 T.“.
    var dd = Math.round((new Date(new Date().setHours(0, 0, 0, 0)) - new Date(new Date(t).setHours(0, 0, 0, 0))) / 86400000);
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 || dd < 1 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + dd + ' T.';
  };
  var since = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var h = Math.max(0, (Date.now() - t) / 3600000);
    // Dauer: unter 1 Std. in Minuten (nicht „0 Std.“), ab gerundet 24 Std. ganze Tage (nicht „24 Std.“).
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' Min.';
    if (Math.round(h) < 24) return Math.round(h) + ' Std.';
    var days = Math.max(1, Math.floor(h / 24));
    return days + (days === 1 ? ' Tag' : ' Tagen');
  };

  // ── Gemeinsame Karten ─────────────────────────────────────────────────────
  var CARD_CSS = ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; }'
    + '\nha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important;'
    + ' backdrop-filter: none !important; -webkit-backdrop-filter: none !important; overflow: visible !important; cursor: default !important;'
    + ' will-change: auto !important; pointer-events: auto !important; }'
    + '\nha-card:hover { box-shadow: none !important; border-color: transparent !important; }'
    + '\nha-ripple { display: none !important; }';
  var bare = function (extra) {
    return {
      type: 'custom:button-card',
      tap_action: { action: 'none' }, hold_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: CARD_CSS },
      extra_styles: 'ha-card.disabled{pointer-events:auto!important;}' + (extra || ''),
    };
  };
  // Bereich mit eigenem triggers_update; code ist der Rumpf der Vorlage (… return html).
  var secCard = function (watch, code, states) {
    var c = bare(' .hui-plate{animation:none!important;}'
      + ' .hui-sub{display:block!important;max-width:100%;}'
      + ' .hui-sub2::before{content:none!important;}'
      + ' @keyframes casora-plate-in { from { opacity: 0; transform: perspective(900px) translateZ(-70px); }'
      + ' to { opacity: 1; transform: perspective(900px) translateZ(0); } }'
      + ' ha-card { animation: var(--casora-popup-plate-enter, none); animation-delay: var(--casora-popup-plate-delay, 0ms); }');
    c.triggers_update = (watch || []).filter(function (id, i, a) { return id && states[id] && a.indexOf(id) === i; });
    c.styles = {
      card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
      grid: [{ 'grid-template-areas': '"c"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }],
      custom_fields: { c: [{ 'justify-self': 'stretch' }, { 'text-align': 'left' }, { overflow: 'visible' }] },
    };
    c.custom_fields = { c: '[[[\n' + code + '\n]]]' };
    return c;
  };
  var call = function (obj, part, C) {
    return 'return window.' + obj + ' ? window.' + obj + '.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass) : "";';
  };
  // Diagramm-Platte aus dem Popup, ohne Kopfzeile (die Werte stehen in der Unterzeile). Die Legende
  // bleibt (1.2): mehrere Kurven nie nur über die Farbe unterscheiden.
  var chartCard = function (metricCard, extra) {
    if (!metricCard) return null;
    var f = metricCard.custom_fields || {}, st = (metricCard.styles && metricCard.styles.custom_fields) || {};
    var keys = ['ct', 'chart', 'legend'].filter(function (k) { return f[k] !== undefined; });
    if (!keys.length) return null;
    var cf = {}, cs = {};
    keys.forEach(function (k) { cf[k] = f[k]; cs[k] = st[k] || [{ 'justify-self': 'stretch' }]; });
    /* Blueprint v2: the chart's title is a normal section heading (17/700), not a small grey caption. */
    if (typeof cf.ct === 'string') cf.ct = cf.ct.replace(/(<div class="hp-ct" style=")[^"]*"/, '$1font-family:var(--primary-font-family,system-ui);'
      + 'font-size:var(--casora-h15-fs,17px);font-weight:var(--casora-h15-fw,700);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);'
      + 'color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));margin:0 2px 8px;text-align:left;"');
    if (extra) { cf.x = extra; cs.x = [{ 'justify-self': 'stretch' }, { overflow: 'visible' }]; keys.push('x'); }
    var styles = Object.assign({}, metricCard.styles);
    styles.card = (metricCard.styles.card || []).map(function (o) { return o.padding ? { padding: '16px 18px 18px 18px' } : o; });
    styles.grid = [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
      { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }];
    styles.custom_fields = cs;
    return Object.assign({}, metricCard, { styles: styles, custom_fields: cf });
  };
  /* Breites „Mehr“: aufgeklappt zwei ausgeglichene Spalten (wie MORE_WIDE_CSS in 02-devices.js). */
  var MORE_WIDE_CSS = '\n@media (min-width: 761px) {'
    + ' .hui-more.open > .hui-mbd { display: block !important; column-count: 2; column-gap: var(--casora-popup-col-gap, 26px) !important; }'
    + ' .hui-more.open > .hui-mbd > * { break-inside: avoid; -webkit-column-break-inside: avoid; display: block; margin: 0; padding-bottom: 18px; }'
    + ' .hui-more.open > .hui-mbd > style { display: none; margin: 0; } }';
  // Innere button-cards werten ihre Vorlagen selbst aus (do_not_eval). Sonst wertet die äußere Karte sie mit
  // aus, beobachtet damit deren Entitäten und baut bei jeder Attributänderung alle Kinder neu – der Bereich
  // blitzte kurz leer auf (Pulse → Gerät → Verlauf flackerte, 17.10.2026).
  var own = function (f) {
    return f && f.card && f.card.type === 'custom:button-card' && f.do_not_eval === undefined ? Object.assign({}, f, { do_not_eval: true }) : f;
  };
  // Aufbau: top (volle Breite) – dann links/rechts; schmal eine Spalte in Lesereihenfolge.
  var layout = function (o) {
    var narrow = typeof window !== 'undefined' && window.innerWidth <= 760;
    /* Blueprint v2 (rule 8): o.settings = device entity → section „Einstellungen“ with „Weitere Einstellungen“ as the
       last section (right column before „Mehr“, or at the end of the only column; phone: last before „Mehr“). */
    var UIb = window._casoraUI;
    if (o.settings && UIb && UIb.settings && o.fields.set == null) {
      o = Object.assign({}, o, { fields: Object.assign({}, o.fields, { set: UIb.settings(o.settings, o.settingsRows) }) });
      var rr = o.right.filter(function (k) { return k !== 'more' && o.fields[k] != null && o.fields[k] !== ''; });
      if (!rr.length) o.left = o.left.concat(['set']);
      else o.right = o.right.indexOf('more') > -1 ? o.right.slice(0, o.right.indexOf('more')).concat(['set'], o.right.slice(o.right.indexOf('more'))) : o.right.concat(['set']);
      if (o.narrowOrder) o.narrowOrder = o.narrowOrder.filter(function (k) { return k !== 'more'; }).concat(['set', 'more']);
    }
    var has = function (k) { return o.fields[k] != null && o.fields[k] !== ''; };
    var top = o.top.filter(has), L = o.left.filter(has), R = o.right.filter(has);
    if (!L.length && R.length > 1 && o.moveLeft) { L = R.filter(function (k) { return o.moveLeft.indexOf(k) > -1; }); R = R.filter(function (k) { return L.indexOf(k) < 0; }); }
    /* Wie B-11 in den Geräte-Popups (H.layout, 02-devices.js): Steht rechts nur „Mehr“, wird das Popup
       einspaltig und „Mehr“ ist die letzte Zeile. Sonst saß die Mehr-Pille oben rechts höher als das
       Etikett links (z. B. Updates ohne KI-Warnung: „Mehr“ über „Verfügbare Updates“, 03.10.2026). */
    var oneMore = false;
    if (L.length && R.length === 1 && R[0] === 'more') { L = L.concat(R); R = []; oneMore = true; }
    var fs0 = function (i) { return [{ 'justify-self': 'stretch' }, { overflow: 'visible' }, { 'min-width': '0' }, { '--casora-popup-plate-delay': (i * 55) + 'ms' }]; };
    // o.fieldStyle: Zusatzstile je Feld (z. B. ein meist ausgeblendetes Diagramm ohne Rasterabstand).
    var fs = function (i, k) { return fs0(i).concat((o.fieldStyle && o.fieldStyle[k]) || []); };
    var col = function (keys, first) {
      var c = bare();
      var cs = {}, cf = {};
      keys.forEach(function (k, i) { cf[k] = own(o.fields[k]); cs[k] = fs(first + i * 2, k); });
      c.styles = {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
          { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': 'var(--casora-popup-sec-gap, 22px)' }, { 'align-content': 'start' }],
        custom_fields: cs,
      };
      c.custom_fields = cf;
      return c;
    };
    var areas, cols, cf = {}, cs = {};
    if (narrow || !L.length || !R.length) {
      var keys = top.concat(o.narrowOrder ? L.concat(R).sort(function (x, y) { return o.narrowOrder.indexOf(x) - o.narrowOrder.indexOf(y); }) : L.concat(R));
      areas = keys.map(function (k) { return '"' + k + '"'; }).join(' ');
      cols = 'minmax(0, 1fr)';
      keys.forEach(function (k, i) { cf[k] = own(o.fields[k]); cs[k] = fs(i, k); });
      /* Einspaltiges „Mehr“ am breiten Popup: aufgeklappt zwei ausgeglichene Spalten (MORE_WIDE_CSS greift erst ab 761 px). */
      if (oneMore && cf.more && cf.more.card) {
        cf.more = own({ card: Object.assign({}, cf.more.card, { extra_styles: (cf.more.card.extra_styles || '') + MORE_WIDE_CSS }) });
      }
    } else {
      /* „Mehr“ wie in den Geräte-Popups unter beiden Spalten über die volle Breite; aufgeklappt
         verteilen sich die Abschnitte auf zwei Spalten statt rechts zu stapeln (links blieb sonst leer). */
      var wideMore = R.length > 1 && R[R.length - 1] === 'more' && o.fields.more && o.fields.more.card;
      if (wideMore) R = R.slice(0, -1);
      areas = top.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + ' "main side"' + (wideMore ? ' "more more"' : '');
      cols = 'minmax(0, 1fr) minmax(0, 1fr)';
      top.forEach(function (k, i) { cf[k] = own(o.fields[k]); cs[k] = fs(i, k); });
      cf.main = own({ card: col(L, top.length) }); cs.main = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
      cf.side = own({ card: col(R, top.length + 1) }); cs.side = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
      if (wideMore) {
        cf.more = own({ card: Object.assign({}, o.fields.more.card, { extra_styles: (o.fields.more.card.extra_styles || '') + MORE_WIDE_CSS }) });
        cs.more = fs(top.length + 2, 'more');
      }
    }
    var ui = bare();
    ui.card_mod = { style: CARD_CSS + '\n@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }' };
    ui.styles = {
      card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }],
      grid: [{ 'grid-template-areas': areas }, { 'grid-template-columns': cols }, { 'row-gap': 'var(--casora-popup-sec-gap, 22px)' },
        { 'column-gap': 'var(--casora-popup-col-gap, 26px)' }, { 'align-items': 'start' }],
      custom_fields: cs,
    };
    ui.custom_fields = cf;
    return ui;
  };
  var pill = function (UI, text, svc, tone) {
    return '<span' + (svc ? ' data-casora-svc="' + UI.esc(JSON.stringify(svc)) + '"' : '')
      + ' style="display:inline-flex;align-items:center;gap:7px;cursor:' + (svc ? 'pointer' : 'default') + ';font-size:13px;font-weight:700;'
      + 'padding:8px 14px;border-radius:999px;background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));'
      // Trefferfläche 44 px (07.10.2026): unsichtbarer Rand oben/unten, Fläche nur im Innern, Lage unverändert.
      + (svc ? 'border-block:6px solid transparent;background-clip:padding-box;margin-block:-6px;' : '') + 'color:'
      + UI.esc(tone || 'var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95))') + ';white-space:nowrap;">' + UI.esc(text) + '</span>';
  };

  // Bausteine für weitere entschlackte Popups (08-weich-kompakt.js).
  window._casoraSoftKit = { secCard: secCard, layout: layout, chartCard: chartCard, bare: bare, pill: pill, CARD_CSS: CARD_CSS };

  // ── Netzwerk ──────────────────────────────────────────────────────────────
  var NET_STATE = {
    connected: 'Online', disconnected: 'Offline', pending: 'Ausstehend', firmware_mismatch: 'Firmware passt nicht',
    upgrading: 'Update läuft', provisioning: 'Wird eingerichtet', heartbeat_missed: 'Keine Rückmeldung',
    adopting: 'Wird übernommen', deleting: 'Wird entfernt', inform_error: 'Meldefehler',
    adoption_failed: 'Übernahme fehlgeschlagen', isolated: 'Isoliert',
    on: 'Online', off: 'Offline', online: 'Online', offline: 'Offline',
  };
  var devInfo = function (states, d) {
    var st = raw(states, d.state);
    var online = d.state ? ['connected', 'on', 'online'].indexOf(st) > -1 : true;
    var offline = d.state ? ['disconnected', 'off', 'offline'].indexOf(st) > -1 : false;
    var upd = !!(d.update && raw(states, d.update) === 'on');
    var word = online ? (upd ? 'Update verfügbar' : 'Online') : offline ? 'Offline' : ok(st) ? 'Problem' : 'Unbekannt';
    var tone = online ? (upd ? 'warn' : 'good') : offline ? 'bad' : 'warn';
    return { st: st, online: online, upd: upd, word: word, tone: tone };
  };

  var N = window._casoraSoftNet = {};
  // K10 (Weich-Audit): eine Farbe je Gerätetyp – Netzwerk ist Blau. Zustand nur über Warn-/Fehlerfarbe.
  var NET_TONE = 'var(--casora-tone-media, #5B8FC9)';
  N.build = function (ctx) {
    var UI = window._casoraUI, states = ctx.states, hass = ctx.hass, v = ctx.variables || {}, ids = ctx.ids || {};
    if (!UI || !UI.more) return null;
    var net = window.casoraDevice && window.casoraDevice.network ? window.casoraDevice.network(hass) : {};
    var pick = function (k, nk) { return Array.isArray(v[k]) && v[k].length ? v[k] : (net[nk] || []); };
    var C = {
      dl: ids.dl, ul: ids.ul, status: ids.status, ping: ids.ping || v.entity_speedtest_ping,
      stDown: v.entity_speedtest_download, stUp: v.entity_speedtest_upload, stLast: v.entity_speedtest_last_run,
      stRunning: v.entity_speedtest_running, stButton: v.entity_speedtest_button,
      isp: v.entity_isp, wanName: v.entity_wan_name, ip4: v.entity_wan_ipv4, ip6: v.entity_wan_ipv6,
      tp: [[ids.wiredDl, 'LAN-Download', 'arrow-down'], [ids.wiredUl, 'LAN-Upload', 'arrow-up'],
           [ids.wifiDl, 'WLAN-Download', 'wifi'], [ids.wifiUl, 'WLAN-Upload', 'wifi']].filter(function (t) { return t[0]; }),
      latency: v.network_extended === false ? [] : pick('latency_entities', 'latency'),
      devices: v.network_extended === false ? [] : pick('network_devices', 'devices'),
      wlans: v.network_extended === false ? [] : pick('wlan_entities', 'wlans'),
      locks: v.lock_entities || [],
      acts: (ctx.actions || []).filter(function (a) { return a && a[0]; }),
    };
    var f = {};
    f.hero = { card: secCard([C.dl, C.ul, C.status, C.ping], call('_casoraSoftNet', 'hero', C), states) };
    var st = C.stButton && states[C.stButton]
      ? { card: secCard([C.stButton, C.stRunning, C.stLast], call('_casoraSoftNet', 'st', C), states) } : null;
    f.metric = { card: chartCard(ctx.metricCard, st) };
    if (!ctx.metricCard) delete f.metric;
    if (C.wlans.length) f.wl = { card: secCard(C.wlans.map(function (w) { return w.sw; }).concat(C.wlans.map(function (w) { return w.clients; })), call('_casoraSoftNet', 'wl', C), states) };
    if (C.devices.filter(function (d) { return states[d.state] || states[d.restart]; }).length) {
      f.nd = { card: secCard([].concat.apply([], C.devices.map(function (d) { return [d.state, d.update]; })), call('_casoraSoftNet', 'nd', C), states) };
    }
    /* Mehr: CPU/RAM/Temperatur und Latenz bewusst nicht im triggers_update (ändern sich
       ständig, eine offene Neustart-Bestätigung klappte sonst zu) – Latenz und Durchsatz
       tauscht casora-notify-local als Text. */
    var watch = C.locks.map(function (l) { return l.sw; })
      .concat([C.isp, C.wanName, C.ip4, C.ip6, C.stDown, C.stUp, C.stLast])
      .concat([].concat.apply([], C.devices.map(function (d) { return [d.state, d.update, d.uptime, d.restart]; })))
      .concat(C.acts.map(function (a) { return a[2]; }));
    if (N.sec('more', C, states, hass)) f.more = { card: secCard(watch, call('_casoraSoftNet', 'more', C), states) };
    return layout({ fields: f, top: ['hero', 'metric'], left: ['wl'], right: ['nd', 'more'], moveLeft: ['nd'] });
  };

  N.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    if (part === 'hero') {
      var dl = num(states, C.dl), ul = num(states, C.ul), p = num(states, C.ping);
      var s = raw(states, C.status);
      var stt = (s === 'on' || s === 'off') ? s : ((dl != null || ul != null) ? 'on' : null);
      var rate = [dl != null ? fN(dl, hass) + ' ↓' : null, ul != null ? fN(ul, hass) + ' ↑' : null].filter(Boolean).join(' · ');
      var sub = [rate ? rate + ' Mbit/s' : null, p != null && p > 0 ? (p < 1 ? '< 1' : Math.round(p)) + ' ms' : null].filter(Boolean).join(' · ');
      return UI.hero({ center: true, value: stt === 'on' ? 'Online' : stt === 'off' ? 'Offline' : '—',
        sub: stt === 'off' ? 'Keine Verbindung' : (sub || null), subTone: stt === 'off' ? 'bad' : null, read: '*' });
    }
    if (part === 'st') {
      var running = raw(states, C.stRunning) === 'on';
      var when = ok(raw(states, C.stLast)) ? ago(raw(states, C.stLast)) : null;
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:10px;font-family:var(--primary-font-family, system-ui);">'
        + (running ? pill(UI, 'Speedtest läuft …', null, 'var(--casora-popup-ui-warn, #FF9F0A)')
                   : pill(UI, 'Speedtest starten', { domain: 'button', service: 'press', target: { entity_id: C.stButton } }))
        + (when && !running ? '<span style="font-size:12.5px;font-weight:500;color:var(--casora-soft-sub, rgba(0,0,0,0.5));">Zuletzt ' + UI.esc(when) + '</span>' : '')
        + '</div>';
    }
    if (part === 'wl') {
      /* Einschalten direkt, Ausschalten mit Bestätigung (trennt sonst womöglich das Gerät, auf dem das Popup offen ist). */
      var rows = [];
      (C.wlans || []).forEach(function (w) {
        if (!states[w.sw]) return;
        var on = raw(states, w.sw) === 'on';
        var cl = num(states, w.clients);
        /* Blueprint v2 (rule 6): a real switch instead of the word „An“; switching off still asks first. */
        var tr0 = UI.row ? UI.row.toggle({ icon: 'wifi', label: w.label, on: on,
          sub: on ? (cl != null ? Math.round(cl) + ' Clients' : 'Aktiv') : 'Ausgeschaltet',
          svc: { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: w.sw } },
          confirm: on ? 'Ausschalten' : undefined }) : null;
        if (tr0) { tr0.iconTone = on ? NET_TONE : null; rows.push(tr0); return; }
        rows.push({ icon: 'wifi', iconTone: on ? NET_TONE : null, label: w.label,
          sub: on ? (cl != null ? Math.round(cl) + ' Clients' : 'Aktiv') : 'Ausgeschaltet',
          action: on ? 'An' : 'Aus', actionTone: null,
          svc: { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: w.sw } },
          confirm: on ? 'Ausschalten' : undefined });
      });
      return rows.length ? UI.group(rows, 'WLAN') : '';
    }
    if (part === 'nd') {
      var drows = (C.devices || []).filter(function (d) { return states[d.state] || states[d.restart]; }).map(function (d) {
        var i = devInfo(states, d);
        return { entity: d.state || d.restart, icon: d.icon, iconTone: i.tone === 'good' ? NET_TONE : i.tone, label: d.label,
          value: i.word, valueTone: i.tone === 'good' ? null : i.tone,
          // Aktive Zeile bei Handlungsbedarf (offline, Update, Problem) wie Pflanzen-/Batterie-Popup.
          active: i.tone !== 'good' };
      });
      return drows.length ? UI.group(drows, 'Geräte') : '';
    }
    if (part === 'more') {
      var secs = [];
      // Sperren
      var lrows = [];
      (C.locks || []).forEach(function (l) {
        if (!states[l.sw]) return;
        var on = raw(states, l.sw) === 'on';
        lrows.push({ icon: on ? 'mdi:shield-lock-outline' : 'mdi:shield-off-outline', iconTone: on ? 'warn' : null,
          label: l.label, sub: on ? 'Aktiv' : 'Aufgehoben', action: on ? 'An' : 'Aus', actionTone: on ? 'warn' : null,
          svc: { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: l.sw } },
          confirm: on ? 'Aufheben' : 'Aktivieren', active: on });
      });
      if (lrows.length) secs.push(UI.group(lrows, 'Sperren'));
      // Internet: Anbieter, Öffentliche IP, Latenz je Ziel (der Ping steht nur oben)
      var irows = [];
      var sd = num(states, C.stDown), su = num(states, C.stUp);
      if ((sd != null || su != null) && C.stDown !== C.dl) {
        var w2 = ok(raw(states, C.stLast)) ? ago(raw(states, C.stLast)) : null;
        irows.push({ entity: C.stDown, icon: 'mdi:speedometer', iconTone: NET_TONE, label: 'Speedtest',
          value: fN(sd, hass) + ' ↓  ' + fN(su, hass) + ' ↑', sub: ['Mbit/s', w2].filter(Boolean).join(' · ') });
      }
      var isp = raw(states, C.isp), wan = raw(states, C.wanName);
      if (ok(isp)) {
        irows.push({ entity: C.isp, icon: 'mdi:web', iconTone: NET_TONE, label: 'Anbieter',
          value: isp.replace(/\s+(AG|GmbH|SE|KG|Inc\.?|Ltd\.?)$/i, ''), sub: ok(wan) ? wan.replace(/\s*\(.*\)\s*$/, '') : null });
      }
      var ip4 = raw(states, C.ip4), ip6 = raw(states, C.ip6);
      if (ok(ip4) || ok(ip6)) {
        irows.push({ entity: ok(ip4) ? C.ip4 : C.ip6, icon: 'mdi:ip-network-outline', iconTone: NET_TONE,
          label: 'Öffentliche IP', value: ok(ip4) ? ip4 : '', sub: ok(ip6) ? ip6 : null });
      }
      var lat = (C.latency || []).map(function (l) { return { n: l[1], v: num(states, l[0]), id: l[0] }; }).filter(function (l) { return l.v != null; });
      if (lat.length) {
        irows.push({ entity: lat[0].id, icon: 'mdi:timer-outline', iconTone: NET_TONE, label: 'Latenz',
          value: lat.map(function (l) { return Math.round(l.v) + ' ms'; }).join(' / '),
          sub: lat.map(function (l) { return l.n; }).join(' / '), liveAttr: 'state', liveSuffix: ' ms' });
      }
      if (irows.length) {
        var ih = UI.group(irows, 'Internet');
        if (lat.length) ih = ih.split('data-casora-live="text" data-casora-ent="' + UI.esc(lat[0].id) + '"')
          .join('data-hp-live-join="' + UI.esc(lat.map(function (l) { return l.id; }).join(',')) + '"');
        secs.push(ih);
      }
      // Durchsatz LAN/WLAN
      var trows = (C.tp || []).map(function (t) {
        return { entity: t[0], icon: t[2], /* Weich-Töne wie im Diagramm (Upload petrol, Download blau) statt greller iOS-Serienfarben. */
          iconTone: /upload/i.test(t[1]) ? 'var(--casora-tone-general, #4E9E95)' : 'var(--casora-tone-media, #5B8FC9)',
          label: t[1], value: num(states, t[0]) == null ? '—' : fN(num(states, t[0]), hass) + ' Mbit/s', liveAttr: 'state', liveSuffix: ' Mbit/s' };
      });
      if (trows.length) secs.push(UI.group(trows, 'Durchsatz').split('data-casora-live="text" data-casora-ent=').join('data-hp-live='));
      // Geräte im Detail: Zustand im Klartext, Laufzeit, CPU/RAM/Temperatur, Neustart
      var grows = (C.devices || []).filter(function (d) { return states[d.state] || states[d.restart]; }).map(function (d) {
        var i = devInfo(states, d);
        var cpu = num(states, d.cpu), mem = num(states, d.mem), tmp = num(states, d.temp);
        var up = ok(raw(states, d.uptime)) ? since(raw(states, d.uptime)) : null;
        var line1 = (!d.state ? 'Online' : ok(i.st) ? (NET_STATE[i.st] || i.st) : 'Unbekannt') + (i.online && up ? ' seit ' + up : '');
        var line2 = [i.upd ? 'Firmware-Update verfügbar' : null, cpu != null ? 'CPU ' + Math.round(cpu) + ' %' : null,
          mem != null ? 'RAM ' + Math.round(mem) + ' %' : null,
          tmp != null ? Math.round(tmp) + ' ' + (((states[d.temp] || {}).attributes || {}).unit_of_measurement || '°C') : null].filter(Boolean).join(' · ');
        var r = { entity: d.state || d.restart, icon: d.icon, iconTone: i.tone === 'good' ? NET_TONE : i.tone, label: d.label, sub: [line1, line2].filter(Boolean) };
        if (d.restart && states[d.restart]) {
          r.action = 'Neu starten'; r.confirm = true;
          r.svc = { domain: 'button', service: 'press', target: { entity_id: d.restart } };
        }
        return r;
      });
      if (!grows.length) {
        (C.acts || []).forEach(function (a) {
          var id = a[0], dom = String(id).split('.')[0];
          if (!states[id]) return;
          var nm = a[1] || (a[2] && hass && hass.entities && hass.entities[a[2]] && hass.entities[a[2]].name)
            || (states[id].attributes || {}).friendly_name || id;
          grows.push({ entity: a[2] || id, icon: 'access_point', iconTone: 'accent', label: nm, action: 'Neu starten', confirm: true,
            svc: dom === 'button' ? { domain: 'button', service: 'press', target: { entity_id: id } }
                                  : { domain: 'homeassistant', service: 'turn_on', target: { entity_id: id } } });
        });
      }
      if (grows.length) secs.push(UI.group(grows, 'Gerätedetails'));
      return secs.length ? UI.more('net', secs.map(function (x) { return '<div>' + x + '</div>'; }).join(''), { count: secs.length }) : '';
    }
    return '';
  };

  // ── Energie ───────────────────────────────────────────────────────────────
  var COACH = 'sensor.casora_energie_coach';
  var E = window._casoraSoftEnergy = {};
  E.build = function (ctx) {
    var UI = window._casoraUI, states = ctx.states, v = ctx.variables || {};
    if (!UI || !UI.more) return null;
    var solar = v.entity_solar_power || null;
    var C = {
      home: ctx.powerId, costToday: ctx.costTodayId, today: ctx.todayId, cur: ctx.costCurrency || '',
      solar: solar, soc: v.entity_battery_soc || null, grid: v.entity_netz_power || null, battery: v.entity_battery_power || null,
      solarToday: v.entity_solar_today || null, gridToday: v.entity_netz_today || null,
      charge: v.entity_battery_charge, discharge: v.entity_battery_discharge,
      output: v.entity_solarbank_output, export: v.entity_grid_export,
      exportTotal: v.entity_grid_export_total, savings: v.entity_savings,
      state: v.entity_solarbank_state, mode: v.entity_solarbank_mode,
      error: v.entity_solarbank_error, energy: v.entity_solarbank_energy,
      capacity: v.entity_solarbank_capacity, temp: v.entity_solarbank_temp,
      loadTarget: v.entity_solarbank_load_target, pv: v.entity_pv_strings || [],
      limit: v.entity_output_limit, exportSwitch: v.entity_export_switch,
      socMin: v.entity_soc_min, socMax: v.entity_soc_max,
    };
    var has = function (id) { return !!(id && states[id]); };
    // 06.10.2026: room without a sensor of its own: the sum of the devices on top, below each
    // summand with its value; skipped ones (unreachable, no power, behind a metering plug) marked.
    var parts = !ctx.powerId && window._casoraPowerSum && Array.isArray(v.power_entities) && v.power_entities.some(Boolean)
      ? { energy_entities: v.power_entities.filter(Boolean), energy_parent: v.power_parent || null } : null;
    if (parts) { C.sum = parts; C.icons = v.power_icons || null; }
    var sumIds = parts ? window._casoraPowerIds(parts) : [];
    // #44: Home's list is the house from HA's energy settings: grid, solar and battery as such (before the hero,
    // which counts a sleeping inverter as 0 W, not as a device without a value).
    var srcs = parts && window.casoraEnergySources ? window.casoraEnergySources(ctx.hass, sumIds) : null;
    if (srcs) C.sources = srcs;
    // #79: a room's list also shows the consumers measured in its HA area that it does not add up (not excluded).
    var pex = Array.isArray(v.power_exclude) ? v.power_exclude.filter(Boolean) : [];
    var listArea = parts && !srcs ? E.listArea(ctx.hass, v, sumIds.concat(pex)) : null;
    if (listArea) { C.area = listArea; if (pex.length) C.exclude = pex; }
    var f = {};
    f.hero = { card: secCard([C.home, C.grid, C.costToday, C.today, C.error].concat(sumIds), call('_casoraSoftEnergy', 'hero', C), states) };
    if (ctx.metricCard) f.metric = { card: chartCard(ctx.metricCard) };
    var fl = ctx.fields || {}, autoTop = null;
    if (typeof fl.use === 'string' && fl.use) f.use = UI.label('Verbrauch') + fl.use;
    // #44: the house popup (the settings' list, or a house sensor without an area) lists the "individual devices" of
    // HA's energy dashboard when there are any (casoraEnergyConsumers, 00-finder.js), instead of the automatic top list.
    var area = ctx.powerId ? autoArea(ctx, v) : null;
    var haCons = window.casoraEnergyConsumers && (srcs || (ctx.powerId && !area)) ? window.casoraEnergyConsumers(ctx.hass) : null;
    var haIds = haCons ? window.casoraEnergyConsumers.ids(haCons) : [];
    // #62: the energy flow (E1) with the tile's solar fields as before, and for the house also from HA's energy
    // settings (its solar, battery and grid sensors); "Woher kommt der Strom" then is the flow, not a list.
    var house = !!(srcs || (ctx.powerId && !area));
    var fs = (solar && has(C.solar)) || house ? E.flowSources(C, ctx.hass, states, house) : null;
    // Standard look (ctx.only 'top'): no E1 flow there, so the sources stay rows ("Woher kommt der Strom").
    if (fs && ctx.only !== 'top') C.flowOn = true;
    // #44: the settings' sources, then the consumers as with a house sensor (the parts are no consumers).
    if (srcs) {
      var cand0 = { ids: [] };
      if (haCons) C.auto = { ha: true };
      else if (window._casoraAutoConsumers) {
        C.auto = { exclude: sumIds.concat(C.solar, C.grid).filter(Boolean), area: null, max: 5 };
        cand0 = window._casoraAutoConsumers(ctx.hass, states, C.auto);
      }
      // The battery rows show the charge level: its sensor is watched too.
      var socIds = window.casoraEnergyBatterySoc ? (srcs.battery || []).map(function (id) { return window.casoraEnergyBatterySoc(ctx.hass, id); }) : [];
      f.top = { card: secCard(sumIds.concat(socIds, haIds, cand0.ids.slice(0, 60)), call('_casoraSoftEnergy', 'sources', C), states) };
    } else if (parts) {
      var extra0 = C.area ? E.roomExtras(ctx.hass, states, C) : { ids: [] };
      f.top = { card: secCard(sumIds.concat(extra0.ids.slice(0, 60)), call('_casoraSoftEnergy', 'parts', C), states) };
    }
    else if (typeof fl.top === 'string' && fl.top) f.top = UI.label('Verbraucher') + fl.top;
    else if (haCons) {
      C.auto = { ha: true };
      f.top = { card: secCard([C.home].concat(haIds), call('_casoraSoftEnergy', 'auto', C), states) };
    } else if (ctx.powerId && window._casoraAutoConsumers) {
      // 07.10.2026: no consumers assigned, Casora finds the largest itself (up to 5 by power).
      // Popup of a room (sensor with an area, not a house sensor): only that area, and there every consumer,
      // also at 0 W (#79: the list must not depend on what the others draw); the house keeps its top 5.
      C.auto = { exclude: [C.home, C.solar, C.grid, C.charge, C.discharge, C.output, C.export, C.loadTarget]
        .concat(C.pv).filter(Boolean), area: area, max: area ? 99 : 5 };
      if (area) C.auto.zero = true;
      var cand = window._casoraAutoConsumers(ctx.hass, states, C.auto);
      if (cand.ids.length) autoTop = f.top = { card: secCard([C.home].concat(cand.ids.slice(0, 60)), call('_casoraSoftEnergy', 'auto', C), states) };
    }
    // Standard look (casora_popup_energy): the same consumer list as here, so units, the rooms' complete list (#79),
    // HA's individual devices and the house's sources (#44) read alike in every look.
    if (ctx.only === 'top') return f.top && f.top.card ? own(f.top) : null;
    var inner = ctx.inner || {};
    var cj = 'const C = ' + JSON.stringify(C) + ';\n';
    if (fs) {
      // Standard and Glass keep their own circle flow (casora_popup_energy).
      f.flow = { card: secCard(E.flowSources.ids(fs).concat(C.home),
        'return window._casoraSoftEnergy ? window._casoraSoftEnergy.flow(' + JSON.stringify(Object.assign({}, C, { fs: fs })) + ', states, hass, this) : "";', states) };
    }
    if (solar && inner.common) {
      /* Controls run with the existing body (same services), only the label is soft. */
      var ctl = inner.ctl ? inner.ctl.replace("plate(title('Steuerung') + parts.join(div))", "UI.label('Steuerung') + plate(parts.join(div))") : "return '';";
      var code = inner.common + cj + 'const __ctl = (() => {\n' + ctl + '\n})();\n'
        + 'return window._casoraSoftEnergy ? window._casoraSoftEnergy.sec("more", C, states, hass, __ctl) : "";';
      var watch = [C.mode, C.limit, C.exportSwitch, C.socMin, C.socMax, C.state, C.error, C.energy, C.capacity, C.temp,
        C.loadTarget, C.solarToday, C.gridToday, C.export, C.exportTotal, C.savings, COACH].concat(C.pv);
      if (E.sec('more', C, states, null, '')) f.more = { card: secCard(watch, code, states) };
      else if (inner.ctl && (has(C.mode) || has(C.limit) || has(C.exportSwitch))) f.more = { card: secCard(watch, code, states) };
    }
    // Empty state (round 2): without daily meters, consumers and solar not just the chart but a calm row with the
    // next step, like "Noch kein Gerät zugeordnet".
    if (!f.use && (!f.top || f.top === autoTop) && !f.flow && !f.more) {
      f.use = UI.group([{ icon: 'mdi:link-variant-off', iconTone: 'var(--casora-popup-ui-dim, rgba(255,255,255,0.18))',
        label: 'Noch keine Tageswerte', sub: (!window.casoraIsAdmin || window.casoraIsAdmin()) ? 'Welche Geräte hier zählen, legst du im Studio fest.' : null, subWrap: true }], 'Verbrauch');
    }
    var wide = !!(solar || f.flow);
    return layout({ fields: f, top: ['hero', 'metric'], left: wide ? ['flow'] : ['top'],
      right: wide ? ['use', 'top', 'more'] : ['use', 'more'], moveLeft: ['top'],
      /* Blueprint v2: the phone reads like the desktop, left before right – the consumers before „Verbrauch“. */
      narrowOrder: ['flow', 'top', 'use', 'more'] });
  };

  // ── Energy flow as bars (1.2.1, design B "Sankey light") ─────────────────
  // On top the home's power with the battery level, below "Woher" (shares of the home's power) and "Wohin Solar".
  // No animation. Since #62 only the sub-badge popups' halves (C.only); live like the fix against the blinking: the
  // HTML stays the same per card, new values, widths and visibility go straight into the existing nodes.
  var FLOW_ON = 5;
  // Whole percentages adding up to exactly 100 (the largest remainder gets the difference).
  var shares = function (parts) {
    var sum = parts.reduce(function (s, p) { return s + p.w; }, 0);
    if (!sum) return parts.map(function () { return 0; });
    var raw = parts.map(function (p) { return p.w / sum * 100; });
    var out = raw.map(Math.floor), rest = 100 - out.reduce(function (s, x) { return s + x; }, 0);
    raw.map(function (x, i) { return [x - out[i], i]; }).sort(function (a, b) { return b[0] - a[0]; })
      .slice(0, rest).forEach(function (r) { out[r[1]]++; });
    return out;
  };
  // v: { solar, chg, dis, outp, grid, exp, home, soc, akku (Akku vorhanden), lade (Lade-/Entladesensor vorhanden) }
  E.flowModel = function (v) {
    var act = function (w) { return w != null && w > FLOW_ON; };
    var pos = function (w) { return w == null ? null : Math.max(0, w); };
    var exporting = act(v.exp);
    var dis = pos(v.dis), chg = pos(v.chg), netz = exporting ? 0 : pos(v.grid);
    // Solar that stays in the home: what is left after battery and feed-in (else output minus discharge),
    // at most what the home still needs after battery and grid.
    var avail = v.solar != null ? Math.max(0, v.solar - (chg || 0) - (exporting ? v.exp : 0))
      : (v.outp != null ? Math.max(0, v.outp - (dis || 0)) : null);
    var need = v.home != null ? Math.max(0, v.home - (dis || 0) - (netz || 0)) : null;
    var sHome = avail == null ? need : need == null ? avail : Math.min(avail, need);
    var side = function (list) {
      var on = list.filter(function (p) { return act(p.w); }), pc = shares(on);
      return list.map(function (p) { var i = on.indexOf(p); return { k: p.k, w: p.w, on: i > -1, pct: i > -1 ? pc[i] : 0 }; });
    };
    var from = side([{ k: 'solar', w: sHome }, { k: 'akku', w: dis }, { k: 'netz', w: netz }]);
    var to = side([{ k: 'haus', w: sHome }, { k: 'akku', w: chg }, { k: 'exp', w: exporting ? v.exp : 0 }]);
    var any = function (l) { return l.some(function (p) { return p.on; }); };
    return {
      home: v.home, soc: v.soc, solar: v.solar, akku: !!v.akku,
      akkuSub: !v.lade ? 'Akku' : act(chg) ? 'Akku lädt' : act(dis) ? 'Akku entlädt' : 'Akku bereit',
      from: from, fromEmpty: !any(from) ? (v.home == null ? 'Noch keine Werte' : 'Kein Verbrauch') : null,
      to: to, solarOn: act(v.solar), toEmpty: !act(v.solar) ? 'Solar liefert gerade nichts' : !any(to) ? 'Noch keine Aufteilung' : null,
    };
  };
  var FLOW_COL = { solar: 'var(--casora-color-yellow, #E8B04A)', akku: 'var(--casora-color-blue, #5B8FC9)',
    netz: 'var(--casora-color-sand, #9A8672)', exp: 'var(--casora-color-green, #6AAE78)', haus: 'var(--casora-color-teal, #4E9E95)' };
  var FLOW_NAME = { solar: 'Solar', akku: 'Akku', netz: 'Netz', exp: 'Einspeisung', haus: 'Haus' };
  var flowHtml = function (C, FK) {
    var INK = 'var(--casora-popup-tiles-text-primary, #3A322B)', INK2 = 'var(--casora-popup-tiles-text-secondary, rgba(58,50,43,.62))';
    var mi = function (id) { return id ? ' data-casora-mi="' + esc(id) + '"' : ''; };
    // C.only ('from' | 'to', sub-badge popups 15.10.2026): only this half, without the home row and subtitles.
    var only = C.only === 'from' || C.only === 'to' ? C.only : null;
    var sec = function (key, title, keys) {
      return '<div data-b="' + key + '">'
        + (title ? '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:16px;">'
        + '<div style="font-size:14.5px;font-weight:700;">' + title + '</div>'
        + '<div data-b="' + key + '-total" style="font-size:14.5px;font-weight:600;color:' + INK2 + ';font-variant-numeric:tabular-nums;"></div></div>' : '')
        + '<div data-b="' + key + '-bar" style="display:flex;gap:3px;margin-top:' + (title ? 10 : 14) + 'px;height:12px;">'
        + keys.map(function (k) { return '<div data-seg="' + k + '" style="flex:1 1 0;min-width:10px;border-radius:999px;background:' + FLOW_COL[k] + ';"></div>'; }).join('')
        + '</div><div data-b="' + key + '-leg" style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:9px;">'
        + keys.map(function (k) {
          return '<div data-leg="' + k + '" style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:' + INK2 + ';white-space:nowrap;">'
            + '<span style="width:8px;height:8px;border-radius:50%;flex:none;background:' + FLOW_COL[k] + ';"></span><span>' + FLOW_NAME[k] + '</span>'
            + '<b data-v style="font-weight:700;color:' + INK + ';font-variant-numeric:tabular-nums;"></b>'
            + '<span data-p style="opacity:.8;font-variant-numeric:tabular-nums;"></span></div>';
        }).join('')
        + '</div><div data-b="' + key + '-hint" style="margin-top:8px;font-size:12.5px;font-weight:500;color:' + INK2 + ';"></div></div>';
    };
    return '<div data-casora-flow="' + FK + '" data-casora-kind="b" style="background:var(--casora-popup-row-fill, #FEFCF7);'
      + 'border-radius:var(--casora-popup-row-radius, 24px);padding:18px 20px 20px;box-shadow:var(--casora-popup-plate-shadow, none);'
      + 'font-family:var(--primary-font-family, Inter, system-ui);color:' + INK + ';text-align:left;">'
      // Partial view: the label sits outside (UI.label in the sub-badge popup), like the other sections there.
      + (only ? '' : '<div style="font-size:var(--casora-h15-fs,17px);font-weight:var(--casora-h15-fw,700);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));">Energiefluss</div>')
      + (only ? '' : '<div style="display:flex;align-items:center;gap:14px;margin-top:14px;">'
      + '<div' + mi(C.home) + ' style="width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;cursor:pointer;'
      + 'background:color-mix(in srgb, ' + FLOW_COL.haus + ' 16%, transparent);box-shadow:inset 0 0 0 1.5px color-mix(in srgb, ' + FLOW_COL.haus + ' 70%, transparent);">'
      + '<ha-icon icon="mdi:home-outline" style="--mdc-icon-size:21px;color:' + FLOW_COL.haus + ';display:flex;pointer-events:none;"></ha-icon></div>'
      + '<div style="flex:1;min-width:0;"><div data-b="home" style="font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.1;font-variant-numeric:tabular-nums;"></div>'
      + '<div style="font-size:12.5px;font-weight:500;color:' + INK2 + ';margin-top:2px;">Verbrauch im Haus</div></div>'
      + '<div data-b="akku"' + mi(C.soc) + ' style="text-align:right;cursor:pointer;"><div data-b="soc" style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;"></div>'
      + '<div data-b="akkusub" style="font-size:12.5px;font-weight:500;color:' + INK2 + ';"></div></div></div>'
      + '<div style="height:1px;background:var(--casora-popup-ui-divider, rgba(140,115,90,.14));margin:16px 0 0;"></div>')
      + (only === 'to' ? '' : sec('from', only ? '' : 'Woher', ['solar', 'akku', 'netz']))
      + (only === 'from' ? '' : sec('to', only ? '' : 'Wohin Solar', ['haus', 'akku', 'exp']))
      + '</div>';
  };
  // Writes the model into the existing nodes; text only when it really changes (the translation swaps the text
  // afterwards, so the value last written is remembered).
  var flowApply = function (box, m, hass) {
    var q = function (s, r) { return (r || box).querySelector(s); };
    var txt = function (el, s) { if (el && el.dataset.t !== s) { el.dataset.t = s; el.textContent = s; } };
    // Hiding remembers the element's own display (flex), showing restores it.
    var show = function (el, on) {
      if (!el) return;
      var hid = el.style.display === 'none';
      if (on && hid) el.style.display = el.dataset.d || '';
      else if (!on && !hid) { el.dataset.d = el.style.display; el.style.display = 'none'; }
    };
    txt(q('[data-b="home"]'), fW(m.home, hass));
    show(q('[data-b="akku"]'), m.akku);
    txt(q('[data-b="soc"]'), m.soc != null ? Math.round(m.soc) + ' %' : '—');
    txt(q('[data-b="akkusub"]'), m.akkuSub);
    var side = function (key, parts, total, empty, quiet) {
      // Partial view (C.only): the other half is missing; do not write into the segments of the present one.
      if (!q('[data-b="' + key + '-bar"]')) return;
      var on = parts.some(function (p) { return p.on; });
      show(q('[data-b="' + key + '-total"]'), !quiet);
      txt(q('[data-b="' + key + '-total"]'), fW(total, hass));
      show(q('[data-b="' + key + '-bar"]'), on || !quiet);
      show(q('[data-b="' + key + '-leg"]'), on);
      show(q('[data-b="' + key + '-hint"]'), !on);
      txt(q('[data-b="' + key + '-hint"]'), on ? '' : empty || '');
      var bar = q('[data-b="' + key + '-bar"]');
      if (bar) { var bg = on ? '' : 'var(--casora-popup-ui-fill, rgba(140,115,90,.08))'; if (bar.style.background !== bg) { bar.style.background = bg; bar.style.borderRadius = on ? '' : '999px'; } }
      parts.forEach(function (p) {
        var seg = q('[data-seg="' + p.k + '"]', bar), leg = q('[data-b="' + key + '-leg"] [data-leg="' + p.k + '"]');
        show(seg, p.on); show(leg, p.on);
        if (seg && p.on) { var fx = Math.round(p.w) + ' 1 0'; if (seg.dataset.fx !== fx) { seg.dataset.fx = fx; seg.style.flex = fx; } }
        if (leg) { txt(q('[data-v]', leg), p.on ? fW(p.w, hass) : ''); txt(q('[data-p]', leg), p.on ? p.pct + ' %' : ''); }
      });
    };
    side('from', m.from, m.home, m.fromEmpty, false);
    // Solar off: no bar, only the calm hint.
    side('to', m.to, m.solar, m.toEmpty, !m.solarOn);
  };
  // Building blocks for the sub-badge popups (20-energie-fokus.js).
  E.kit = { secCard: secCard, layout: layout, chartCard: chartCard, call: call };
  // Live without rebuilding (fix against the blinking flow, r96): the HTML stays the same per card; after the first
  // build, apply() writes new values straight into the existing nodes and the card gets the same HTML back.
  var flowLive = function (C, self, buildHtml, apply) {
    var FK = 'b' + Array.from(JSON.stringify(C)).reduce(function (h, ch) { return (h * 31 + ch.charCodeAt(0)) | 0; }, 7).toString(36);
    var host = (self && typeof self === 'object') ? self : window;
    var MEMO = window._casoraFlowMemo || (window._casoraFlowMemo = new WeakMap());
    var memo = MEMO.get(host) || {};
    MEMO.set(host, memo);
    var deep = function (root, s) {
      if (!root) return null;
      var hit = root.querySelector(s);
      if (hit) return hit;
      var all = root.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) { var r = deep(all[i].shadowRoot, s); if (r) return r; }
      return null;
    };
    var sel = '[data-casora-flow="' + FK + '"]', mm = memo[FK];
    if (mm && !(mm.el && mm.el.isConnected)) mm.el = deep(host.shadowRoot, sel) || deep(host.renderRoot !== host.shadowRoot ? host.renderRoot : null, sel);
    if (mm && mm.el && mm.el.isConnected) { apply(mm.el); return mm.html; }
    // First build: the frame with the values in it, returned as HTML (afterwards only apply()).
    var tpl = document.createElement('template');
    tpl.innerHTML = buildHtml(FK);
    apply(tpl.content.firstElementChild);
    var html = tpl.innerHTML;
    memo[FK] = { html: html, el: null };
    return html;
  };
  E.flow = function (C, states, hass, self) {
    // #62: the energy popup shows the flow like HA's energy dashboard (E1); the sub-badge popups keep their half
    // of the bars (C.only).
    if (C.fs && !C.only) return E.flowE1(C, states, hass, self);
    var has = function (id) { return !!(id && states[id]); };
    var lade = has(C.charge) || has(C.discharge);
    var m = E.flowModel({ solar: watt(states, C.solar), chg: watt(states, C.charge), dis: watt(states, C.discharge),
      outp: watt(states, C.output), grid: watt(states, C.grid), exp: watt(states, C.export), home: watt(states, C.home),
      soc: num(states, C.soc), akku: has(C.soc) || lade, lade: lade });
    return flowLive(C, self, function (FK) { return flowHtml(C, FK); }, function (el) { flowApply(el, m, hass); });
  };

  // ── Energy flow like HA's energy dashboard (#62, design E1) ────────────────
  // Circles for grid (left), solar (top), home (right) and battery (bottom), plus a low-carbon circle above the grid
  // when HA's CO2 signal integration is set up; only the sources that exist. Lines between them carry slow dots in
  // the direction of the flow (none with reduced motion); the home's ring shows where its power comes from.
  //
  // E.flowSources(C, hass, states, house): which sensors feed the flow, or null when there is nothing to draw
  // (neither solar nor a battery). The tile's fields (Studio) come first; for the house popup HA's energy settings
  // fill in what the tile does not name (casoraEnergyPowers, 00-finder.js). Signs: the tile's grid sensor is positive
  // on import (negative = feed-in) and its battery power positive while charging (as the Standard popup reads it);
  // HA's grid is positive on import, its battery positive while discharging.
  var co2Of = function (hass, states) {
    // HA's energy dashboard takes the CO2 signal entry's sensor in % (fossil fuel share of the grid).
    var R = (hass && hass.entities) || {};
    for (var id in R) {
      var e = R[id], s = states[id];
      if (e && e.platform === 'co2signal' && s && (s.attributes || {}).unit_of_measurement === '%') return id;
    }
    return null;
  };
  E.flowSources = function (C, hass, states, house) {
    var has = function (id) { return !!(id && states[id]); };
    var pw = house && window.casoraEnergyPowers ? window.casoraEnergyPowers(hass) : { grid: [], solar: [], battery: [] };
    var F = {};
    if (has(C.solar)) F.solar = [C.solar]; else if (pw.solar.length) { F.solar = pw.solar.slice(); F.solarHa = true; }
    if (has(C.charge) || has(C.discharge)) { F.chg = C.charge || null; F.dis = C.discharge || null; }
    else if (has(C.battery)) F.batTile = C.battery;
    else if (pw.battery.length) F.batHa = pw.battery.slice();
    if (has(C.grid) || has(C.export)) { F.grid = C.grid || null; F.exp = C.export || null; }
    else if (pw.grid.length) F.gridHa = pw.grid.slice();
    if (has(C.soc)) F.soc = C.soc;
    else if (F.batHa && window.casoraEnergyBatterySoc) F.soc = window.casoraEnergyBatterySoc(hass, F.batHa[0]) || null;
    var bat = !!(F.chg || F.dis || F.batTile || F.batHa || F.soc), grid = !!(F.grid || F.exp || F.gridHa);
    if (!F.solar && !bat) return null;
    if (has(C.home)) F.home = C.home; else if (C.sum) F.sum = C.sum;
    if (!F.home && !F.sum && !grid) return null;
    if (house && grid) F.co2 = co2Of(hass, states);
    F.has = { solar: !!F.solar, battery: bat, grid: grid, co2: !!F.co2 };
    return F;
  };
  // Sensors the flow reads (for the card's triggers_update).
  E.flowSources.ids = function (F) {
    var out = [];
    ['solar', 'batHa', 'gridHa'].forEach(function (k) { (F[k] || []).forEach(function (id) { out.push(id); }); });
    ['chg', 'dis', 'batTile', 'grid', 'exp', 'soc', 'home', 'co2'].forEach(function (k) { if (F[k]) out.push(F[k]); });
    if (F.sum && window._casoraPowerIds) out = out.concat(window._casoraPowerIds(F.sum));
    return out;
  };
  // Values in watts from the sensors (E.flowSources); null where nothing is known.
  E.flowValues = function (F, states) {
    var sum = function (ids, sleep) {
      var t = null;
      (ids || []).forEach(function (id) {
        var w = watt(states, id);
        // #44: a solar or battery sensor of HA's settings without a value is an inverter asleep (0 W).
        if (w == null && sleep && states[id]) w = 0;
        if (w != null) t = (t || 0) + w;
      });
      return t;
    };
    var pos = function (w) { return w == null ? null : Math.max(0, w); };
    var neg = function (w) { return w == null ? null : Math.max(0, -w); };
    var v = { has: F.has, solar: F.solar ? sum(F.solar, !!F.solarHa) : null };
    if (F.chg || F.dis) { v.chg = pos(watt(states, F.chg)); v.dis = pos(watt(states, F.dis)); }
    else if (F.batTile) { var b = watt(states, F.batTile); v.chg = pos(b); v.dis = neg(b); }
    else if (F.batHa) { var h = sum(F.batHa, true); v.dis = pos(h); v.chg = neg(h); }
    if (F.grid || F.exp) {
      var g = watt(states, F.grid), x = watt(states, F.exp);
      v.imp = pos(g); v.exp = x != null ? pos(x) : neg(g);
    } else if (F.gridHa) { var gh = sum(F.gridHa, false); v.imp = pos(gh); v.exp = neg(gh); }
    v.lade = !!(F.chg || F.dis || F.batTile || F.batHa);
    v.soc = num(states, F.soc);
    if (F.home) v.home = watt(states, F.home);
    else if (F.sum && window._casoraPowerSum) { var R = window._casoraPowerSum(F.sum, states); v.home = isFinite(R.sum) ? R.sum : null; }
    var fossil = num(states, F.co2);
    v.co2 = fossil == null ? null : Math.max(0, Math.min(100, 100 - fossil));
    return v;
  };
  // Dot pattern: one dot every DOT_GAP units; the speed grows with the power, but only a little (calm), in steps of
  // a quarter second so that small changes keep the same pace.
  var DOT_GAP = 44;
  E.flowDur = function (w) {
    var speed = 14 + 8 * Math.log10(1 + Math.max(0, w || 0) / 100);
    return Math.round(DOT_GAP / speed * 4) / 4;
  };
  // The model: which circles and lines, who feeds whom, the home's shares. Pure, for dev/unit/energy_flow_e1.mjs.
  // v: { has: { solar, grid, battery, co2 }, solar, imp, exp, chg, dis, home, soc, co2, lade } (watts ≥ 0 or null)
  E.flowE1Model = function (v) {
    var h = v.has || {};
    var known = function (w) { return w != null && isFinite(w); };
    var z = function (w) { return known(w) ? Math.max(0, w) : 0; };
    var act = function (w) { return w != null && w > FLOW_ON; };
    var solar = h.solar ? z(v.solar) : 0, imp = h.grid ? z(v.imp) : 0, exp = h.grid ? z(v.exp) : 0;
    var chg = h.battery ? z(v.chg) : 0, dis = h.battery ? z(v.dis) : 0;
    // Like HA's energy distribution: feed-in comes from solar first, the rest of it from the battery; the battery
    // charges from solar first, the rest from the grid; what is left of each source goes to the home.
    var bToG = Math.min(dis, Math.max(0, exp - solar));
    var sToG = Math.min(solar, Math.max(0, exp - bToG));
    var sRest = solar - sToG;
    var sToB = Math.min(chg, sRest);
    var gToB = Math.min(Math.max(0, chg - sToB), imp);
    var bToH = Math.max(0, dis - bToG), gToH = Math.max(0, imp - gToB);
    var sToH = Math.max(0, sRest - sToB);
    var home = known(v.home) ? Math.max(0, v.home) : null;
    // Solar the home cannot use (no feed-in or battery sensor) is not invented as home power.
    if (home != null) sToH = Math.min(sToH, Math.max(0, home - bToH - gToH));
    var any = [v.solar, v.imp, v.exp, v.chg, v.dis].some(known);
    if (home == null && any) home = sToH + bToH + gToH;
    var edge = function (show, w, rev) {
      w = show ? w : 0;
      return { show: !!show, w: w, on: !!show && act(w), rev: !!rev, dur: E.flowDur(w) };
    };
    var parts = [{ k: 'solar', w: sToH }, { k: 'battery', w: bToH }, { k: 'grid', w: gToH }].filter(function (p) { return act(p.w); });
    var pc = shares(parts);
    var exporting = act(exp) && !act(imp);
    return {
      top: !!(h.solar || (h.co2 && h.grid)), bottom: !!h.battery,
      nodes: {
        grid: { show: !!h.grid, w: !known(v.imp) && !known(v.exp) ? null : exporting ? exp : imp,
          label: exporting ? 'Einspeisung' : 'Netz' },
        solar: { show: !!h.solar, w: known(v.solar) ? solar : null, label: 'Solar' },
        battery: { show: !!h.battery, soc: known(v.soc) ? v.soc : null,
          w: !known(v.chg) && !known(v.dis) ? null : act(chg) ? chg : act(dis) ? dis : 0,
          label: !v.lade ? 'Akku' : act(chg) ? 'Akku lädt' : act(dis) ? 'Akku entlädt' : 'Akku bereit' },
        home: { show: true, w: home, label: 'Haus' },
        co2: { show: !!(h.co2 && h.grid), pct: known(v.co2) ? v.co2 : null, label: 'CO₂-neutral' },
      },
      edges: {
        sh: edge(h.solar, sToH), sg: edge(h.solar && h.grid, sToG), sb: edge(h.solar && h.battery, sToB),
        gh: edge(h.grid, gToH), gb: edge(h.grid && h.battery, Math.max(gToB, bToG), bToG > gToB), bh: edge(h.battery, bToH),
        co2: { show: !!(h.co2 && h.grid), w: 0, on: false, rev: false, dur: E.flowDur(0) },
      },
      ring: parts.map(function (p, i) { return { k: p.k, pct: pc[i] }; }),
    };
  };
  // Stage geometry in px (300 wide fits a 393 px phone unscaled; it never scales up, only down on smaller phones).
  var E1 = { W: 300, xL: 44, xC: 150, xR: 256, R: 38, RC: 30, off: 10, dy: 8, k: 22, gap: 104 };
  E.flowE1Geo = function (top, bottom) {
    var y0 = top ? 64 : null, y1 = top ? 64 + E1.gap : 46, y2 = bottom ? y1 + E1.gap : null;
    return { y0: y0, y1: y1, y2: y2, H: (bottom ? y2 : y1) + E1.R + 26 };
  };
  var E1_COL = { solar: 'var(--casora-color-yellow, #E8B04A)', battery: 'var(--casora-color-blue, #5B8FC9)',
    grid: 'var(--casora-color-sand, #9A8672)', home: 'var(--casora-color-teal, #4E9E95)', co2: 'var(--casora-color-green, #6AAE78)' };
  var E1_ICON = { solar: 'mdi:solar-power-variant', battery: 'mdi:home-battery-outline', grid: 'mdi:transmission-tower',
    home: 'mdi:home-outline', co2: 'mdi:leaf' };
  // Each line in its source's colour, from the edge of its source circle to the edge of its target (the circles are
  // see-through in the Casora look, so no line may run under them).
  var E1_FROM = { sh: 'solar', sg: 'solar', sb: 'solar', gh: 'grid', gb: 'grid', bh: 'battery', co2: 'co2' };
  E.flowE1Paths = function (g) {
    var c = E1, P = {}, l = c.xC - c.off, r = c.xC + c.off;
    var n = function (x) { return String(Math.round(x * 10) / 10); };
    var vOff = Math.sqrt(c.R * c.R - c.off * c.off), hOff = Math.sqrt(c.R * c.R - c.dy * c.dy);
    if (g.y0 != null) {
      P.sh = 'M' + r + ' ' + n(g.y0 + vOff) + ' V' + (g.y1 - c.dy - c.k) + ' Q' + r + ' ' + (g.y1 - c.dy) + ' ' + (r + c.k) + ' ' + (g.y1 - c.dy) + ' H' + n(c.xR - hOff);
      P.sg = 'M' + l + ' ' + n(g.y0 + vOff) + ' V' + (g.y1 - c.dy - c.k) + ' Q' + l + ' ' + (g.y1 - c.dy) + ' ' + (l - c.k) + ' ' + (g.y1 - c.dy) + ' H' + n(c.xL + hOff);
      P.co2 = 'M' + c.xL + ' ' + (g.y0 + c.RC) + ' V' + (g.y1 - c.R);
    }
    if (g.y0 != null && g.y2 != null) P.sb = 'M' + c.xC + ' ' + (g.y0 + c.R) + ' V' + (g.y2 - c.R);
    P.gh = 'M' + (c.xL + c.R) + ' ' + g.y1 + ' H' + (c.xR - c.R);
    if (g.y2 != null) {
      P.gb = 'M' + n(c.xL + hOff) + ' ' + (g.y1 + c.dy) + ' H' + (l - c.k) + ' Q' + l + ' ' + (g.y1 + c.dy) + ' ' + l + ' ' + (g.y1 + c.dy + c.k) + ' V' + n(g.y2 - vOff);
      P.bh = 'M' + r + ' ' + n(g.y2 - vOff) + ' V' + (g.y1 + c.dy + c.k) + ' Q' + r + ' ' + (g.y1 + c.dy) + ' ' + (r + c.k) + ' ' + (g.y1 + c.dy) + ' H' + n(c.xR - hOff);
    }
    return P;
  };
  var E1_CSS = '@keyframes casora-flow-dot{from{stroke-dashoffset:' + DOT_GAP + ';}to{stroke-dashoffset:0;}}'
    + '[data-e1-dot]{animation:casora-flow-dot 2s linear infinite;transition:opacity var(--casora-dur-feedback, 160ms) ease;}'
    + '@media (prefers-reduced-motion:reduce){[data-e1-dot]{animation:none;display:none;}}';
  var e1Html = function (F, m, FK) {
    var INK = 'var(--casora-popup-tiles-text-primary, #3A322B)', INK2 = 'var(--casora-popup-tiles-text-secondary, rgba(58,50,43,.62))';
    var FILL = 'var(--casora-popup-row-fill, #FEFCF7)';
    var g = E.flowE1Geo(m.top, m.bottom), P = E.flowE1Paths(g), c = E1;
    var first = function (ids) { return Array.isArray(ids) ? ids[0] : ids; };
    var miOf = { grid: first(F.gridHa) || F.grid || F.exp, solar: first(F.solar), battery: F.soc || F.batTile || first(F.batHa) || F.chg || F.dis,
      home: F.home, co2: F.co2 };
    var svg = '<svg viewBox="0 0 ' + esc(c.W) + ' ' + esc(g.H) + '" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;" aria-hidden="true">';
    Object.keys(m.edges).forEach(function (k) {
      if (!m.edges[k].show || !P[k]) return;
      var col = E1_COL[E1_FROM[k]];
      svg += '<path data-e1-line="' + esc(k) + '" d="' + esc(P[k]) + '" fill="none" stroke="' + esc(col) + '" stroke-width="2" stroke-linecap="round" style="opacity:.35;"></path>';
      if (k !== 'co2') svg += '<path data-e1-dot="' + esc(k) + '" d="' + esc(P[k]) + '" fill="none" stroke="' + esc(col) + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 ' + esc(DOT_GAP) + '" style="opacity:0;"></path>';
    });
    svg += '</svg>';
    var pos = { grid: [c.xL, g.y1], solar: [c.xC, g.y0], battery: [c.xC, g.y2], home: [c.xR, g.y1], co2: [c.xL, g.y0] };
    var node = function (k) {
      var n = m.nodes[k];
      if (!n.show) return '';
      var x = pos[k][0] / c.W * 100, y = pos[k][1] / g.H * 100, rr = k === 'co2' ? c.RC : c.R, above = k === 'solar' || k === 'co2';
      // [icon top, value top, watts top, icon size] inside the padding box (circles with a 2 px border, home without).
      var lay = { co2: [9, 30, 0, 18], battery: [8, 32, 50, 22], home: [15, 41, 0, 22] }[k] || [13, 39, 0, 22];
      // Home: a ring of segments in the colours of its sources (its own svg in px, so it never scales).
      var ringSvg = k !== 'home' ? ''
        : '<svg viewBox="0 0 76 76" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);pointer-events:none;" aria-hidden="true">'
          + '<circle data-e1-ring="none" cx="38" cy="38" r="37" fill="none" stroke="' + esc(E1_COL.home) + '" stroke-width="2"></circle>'
          + ['solar', 'battery', 'grid'].map(function (s) {
            return '<circle data-e1-ring="' + esc(s) + '" cx="38" cy="38" r="37" fill="none" stroke="' + esc(E1_COL[s]) + '" stroke-width="3" pathLength="100" stroke-dasharray="0 100" style="display:none;"></circle>';
          }).join('') + '</svg>';
      return '<div data-e1-node="' + esc(k) + '"' + (miOf[k] ? ' data-casora-mi="' + esc(miOf[k]) + '"' : '') + ' style="position:absolute;left:' + esc(x.toFixed(3)) + '%;top:' + esc(y.toFixed(3)) + '%;'
        + 'width:' + esc(rr * 2) + 'px;height:' + esc(rr * 2) + 'px;margin:-' + esc(rr) + 'px 0 0 -' + esc(rr) + 'px;box-sizing:border-box;border-radius:50%;'
        + 'background:' + FILL + ';' + (k === 'home' ? '' : 'border:2px solid ' + esc(E1_COL[k]) + ';')
        + 'cursor:' + (miOf[k] ? 'pointer' : 'default') + ';">'
        + ringSvg
        // Fixed places inside the circle (icon, value, battery's watts), so nothing moves when a value changes.
        + '<ha-icon icon="' + esc(E1_ICON[k]) + '" style="position:absolute;left:50%;top:' + esc(lay[0]) + 'px;margin-left:-' + esc(lay[3] / 2) + 'px;'
        + '--mdc-icon-size:' + esc(lay[3]) + 'px;width:' + esc(lay[3]) + 'px;height:' + esc(lay[3]) + 'px;color:color-mix(in srgb, ' + esc(E1_COL[k]) + ' 50%, ' + INK + ');display:flex;pointer-events:none;"></ha-icon>'
        + '<div data-e1-v style="position:absolute;left:0;right:0;top:' + esc(lay[1]) + 'px;text-align:center;font-size:' + (k === 'co2' ? 12 : 13) + 'px;font-weight:700;line-height:16px;'
        + 'font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;"></div>'
        + (k === 'battery' ? '<div data-e1-s style="position:absolute;left:0;right:0;top:' + esc(lay[2]) + 'px;text-align:center;font-size:12px;font-weight:500;line-height:14px;color:' + INK2 + ';'
          + 'font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;"></div>' : '')
        + '<div data-e1-l style="position:absolute;left:50%;transform:translateX(-50%);' + (above ? 'bottom:100%;margin-bottom:6px;' : 'top:100%;margin-top:6px;')
        + 'font-size:12px;font-weight:600;line-height:16px;color:' + INK2 + ';white-space:nowrap;pointer-events:none;"></div>'
        + '</div>';
    };
    var nodesHtml = ['co2', 'solar', 'grid', 'home', 'battery'].map(node).join('');
    return '<div data-casora-flow="' + esc(FK) + '" data-casora-kind="e1" style="background:' + FILL + ';'
      + 'border-radius:var(--casora-popup-row-radius, 24px);padding:18px 20px 20px;box-shadow:var(--casora-popup-plate-shadow, none);'
      + 'font-family:var(--primary-font-family, Inter, system-ui);color:' + INK + ';text-align:left;">'
      + '<div style="font-size:var(--casora-h15-fs,17px);font-weight:var(--casora-h15-fw,700);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));">Energiefluss</div>'
      + '<div data-e1-stage style="position:relative;width:100%;max-width:' + esc(c.W) + 'px;aspect-ratio:' + esc(c.W) + ' / ' + esc(g.H) + ';margin:14px auto 0;">'
      + svg + nodesHtml + '</div><style>' + E1_CSS + '</style></div>';
  };
  // Writes the model into the existing nodes; text only when it really changes (the translation swaps it afterwards).
  var e1Apply = function (box, m, hass) {
    var q = function (s, r) { return (r || box).querySelector(s); };
    var txt = function (el, s) { if (el && el.dataset.t !== s) { el.dataset.t = s; el.textContent = s; } };
    var set = function (el, prop, val) { if (el && el.style[prop] !== val) el.style[prop] = val; };
    Object.keys(m.nodes).forEach(function (k) {
      var n = m.nodes[k], el = q('[data-e1-node="' + esc(k) + '"]');
      if (!el) return;
      txt(q('[data-e1-l]', el), n.label);
      if (k === 'co2') txt(q('[data-e1-v]', el), n.pct == null ? '—' : Math.round(n.pct) + ' %');
      else if (k === 'battery') {
        txt(q('[data-e1-v]', el), n.soc != null ? Math.round(n.soc) + ' %' : fW(n.w, hass));
        txt(q('[data-e1-s]', el), n.soc != null && n.w != null ? fW(n.w, hass) : '');
      } else txt(q('[data-e1-v]', el), fW(n.w, hass));
    });
    Object.keys(m.edges).forEach(function (k) {
      var e = m.edges[k], line = q('[data-e1-line="' + esc(k) + '"]'), dot = q('[data-e1-dot="' + esc(k) + '"]');
      set(line, 'opacity', e.on ? '0.9' : '0.35');
      // The dots keep running while hidden: switching them on never starts a new animation.
      set(dot, 'opacity', e.on ? '1' : '0');
      set(dot, 'animationDuration', e.dur + 's');
      set(dot, 'animationDirection', e.rev ? 'reverse' : 'normal');
      if (k === 'gb' && line) {
        var col = E1_COL[e.rev ? 'battery' : 'grid'];
        if (line.getAttribute('stroke') !== col) { line.setAttribute('stroke', col); if (dot) dot.setAttribute('stroke', col); }
      }
    });
    // Home ring: one segment per source in its share, clockwise from the top; the plain ring without any flow.
    var at = 0;
    ['solar', 'battery', 'grid'].forEach(function (s) {
      var seg = q('[data-e1-ring="' + esc(s) + '"]'), p = m.ring.filter(function (x) { return x.k === s; })[0];
      if (!seg) return;
      set(seg, 'display', p ? '' : 'none');
      if (p) {
        var da = p.pct + ' ' + (100 - p.pct), off = String(-at);
        if (seg.getAttribute('stroke-dasharray') !== da) seg.setAttribute('stroke-dasharray', da);
        if (seg.getAttribute('stroke-dashoffset') !== off) seg.setAttribute('stroke-dashoffset', off);
        at += p.pct;
      }
    });
    set(q('[data-e1-ring="none"]'), 'display', m.ring.length ? 'none' : '');
  };
  E.flowE1 = function (C, states, hass, self) {
    var F = C.fs, m = E.flowE1Model(E.flowValues(F, states));
    return flowLive(C, self, function (FK) { return e1Html(F, m, FK); }, function (el) { e1Apply(el, m, hass); });
  };

  // Area for the automatic consumers: the room of the popup (room_name = area name) or the area
  // of the power sensor if it is not one for the whole house; else the whole house.
  var HOUSE_NAME = /haus|house|home|wohnung|zuhause|gesamt|total|netz|grid|verbrauch|consumption|energie|energy/i;
  var autoArea = function (ctx, v) {
    var h = ctx.hass || {}, areas = h.areas || {}, norm = function (x) { return String(x || '').trim().toLowerCase(); };
    var rn = norm(v.room_name);
    if (rn) for (var k in areas) if (areas[k] && norm(areas[k].name) === rn) return k;
    var e = (h.entities || {})[ctx.powerId];
    if (!e) return null;
    var a = e.area_id || (e.device_id && h.devices && h.devices[e.device_id] && h.devices[e.device_id].area_id) || null;
    var nm = ctx.powerId + ' ' + ((ctx.states[ctx.powerId] || {}).attributes || {}).friendly_name;
    return a && !HOUSE_NAME.test(nm) ? a : null;
  };
  E.autoArea = autoArea;
  // #79: the HA area of a room's list: the area named like the room, else the one area all its sensors are in
  // (a powercalc sensor without one counts in its source's area). Several areas (Home's sum of the rooms): none.
  E.listArea = function (hass, v, ids) {
    var h = hass || {}, areas = h.areas || {}, R = h.entities || {}, D = h.devices || {};
    var norm = function (x) { return String(x || '').trim().toLowerCase(); };
    var rn = norm(v && v.room_name);
    if (rn) for (var k in areas) if (areas[k] && norm(areas[k].name) === rn) return k;
    var of = function (id, deep) {
      var e = R[id];
      if (!e) return null;
      var a = e.area_id || (e.device_id && D[e.device_id] && D[e.device_id].area_id) || null;
      var src = !a && !deep && e.platform === 'powercalc' ? ((((h.states || {})[id] || {}).attributes) || {}).source_entity : null;
      return a || (src && src !== id ? of(src, true) : null);
    };
    var seen = null;
    for (var i = 0; i < (ids || []).length; i++) {
      var a = of(ids[i]);
      if (!a) continue;
      if (seen && seen !== a) return null;
      seen = a;
    }
    return seen;
  };
  // Consumers in C.area that the list neither adds up nor excludes, one per device (a device with a sensor in the
  // list or excluded stays out): { list: [{ id, w }], ids: sensors to watch }.
  E.roomExtras = function (hass, states, C) {
    if (!C || !C.area || !window._casoraAutoConsumers || !window._casoraPowerIds) return { list: [], ids: [] };
    var R = (hass && hass.entities) || {};
    var known = window._casoraPowerIds(C.sum || {}).concat(C.exclude || []);
    var devs = {};
    known.forEach(function (id) { var d = (R[id] || {}).device_id; if (d) devs[d] = 1; });
    var A = window._casoraAutoConsumers(hass, states, { area: C.area, zero: true, max: 99, exclude: known, visible: autoVisible });
    return { list: A.top.filter(function (x) { var d = (R[x.id] || {}).device_id; return !(d && devs[d]); }), ids: A.ids };
  };
  // #79: one order for a room's consumers, whatever the others draw: drawing ones by power, then the ones at 0 W in
  // the list's order, then ones measured in the room outside the sum (by power), last the ones without a value.
  // items: { w, skip, out }. consRank > 0: the row's icon is pale (everything but the drawing ones).
  E.consRank = function (x) { return x.skip ? 3 : x.out ? 2 : x.w > 0 ? 0 : 1; };
  E.consOrder = function (items) {
    return (items || []).map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      var ra = E.consRank(a.x), rb = E.consRank(b.x);
      if (ra !== rb) return ra - rb;
      var d = ra === 0 || ra === 2 ? (b.x.w || 0) - (a.x.w || 0) : 0;
      return d || a.i - b.i;
    }).map(function (o) { return o.x; });
  };
  var DIM = 'var(--casora-popup-ui-dim, rgba(58,50,43,0.25))';
  // „Wer sieht das?“: admins see everything; others only what the dashboard config does not hide,
  // nothing while it still loads (it is mostly there from the dashboard start).
  var autoVisible = function (ids) {
    var now = window.casoraVisibleIdsNow ? window.casoraVisibleIdsNow(ids) : ids;
    if (now) return now;
    return (!window.casoraIsAdmin || window.casoraIsAdmin()) ? ids : [];
  };

  // #62: long consumer lists show the largest five, the rest behind "Alle N anzeigen" (open while the popup is).
  var CONS_TOP = 5;
  E.consSplit = function (rows, n) {
    n = n || CONS_TOP;
    return rows.length > n ? { top: rows.slice(0, n), rest: rows.slice(n) } : { top: rows, rest: [] };
  };
  var consList = function (UI, rows) {
    var s = E.consSplit(rows);
    return UI.group(s.top) + (s.rest.length
      ? '<div style="margin-top:var(--casora-space-2, 8px);">'
        + UI.more('energy-cons', UI.group(s.rest), { label: 'Alle ' + rows.length + ' anzeigen', less: 'Weniger anzeigen' }) + '</div>'
      : '');
  };

  var money = function (v, cur, hass) {
    if (v == null) return null;
    var s = v.toLocaleString(LANG(hass), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cur === '$' ? '$' + s : (s + ' ' + (cur || '')).trim();
  };

  E.sec = function (part, C, states, hass, ctlHtml) {
    var UI = window._casoraUI;
    if (!UI) return '';
    if (part === 'hero') {
      var p = watt(states, C.home), grid = watt(states, C.grid);
      var bits = [];
      if (C.sum && window._casoraPowerSum) {
        var R0 = window._casoraPowerSum(C.sum, states);
        p = isFinite(R0.sum) ? R0.sum : null;
        // #44: a solar or battery sensor of HA's energy settings without a value is an inverter asleep (0 W).
        var asleep = C.sources ? (C.sources.solar || []).concat(C.sources.battery || []) : [];
        var off0 = R0.items.filter(function (x) { return x.skip === 'off' && asleep.indexOf(x.id) < 0; }).length;
        if (off0) bits.push(off0 === 1 ? '1 Gerät ohne Wert' : off0 + ' Geräte ohne Wert');
      }
      if (p != null && p < -20) bits.push('Einspeisung');
      if (C.solar && p != null && p > 0 && grid != null) {
        var aut = Math.max(0, Math.min(1, 1 - Math.max(grid, 0) / p));
        bits.push(Math.round(aut * 100) + ' % aus Solar und Akku');
      }
      var cost = money(num(states, C.costToday), C.cur, hass);
      var kwh = num(states, C.today);
      if (cost) bits.push('heute ' + cost);
      else if (kwh != null) bits.push('heute ' + fN(kwh, hass) + ' kWh');
      var err = raw(states, C.error);
      /* Anker code 40 = device asleep (battery empty, at night), no error. */
      var bad = ok(err) && err !== '0' && err !== '40' && String(err).toLowerCase() !== 'none';
      /* Without a power sensor the first value becomes the main line ("Heute 3,72 kWh") instead of "— · heute …". */
      var main = p == null ? null : fW(Math.abs(p) < 20 && p < 0 ? 0 : Math.abs(p), hass);
      if (main == null && bits.length) { main = bits.shift(); main = main.charAt(0).toUpperCase() + main.slice(1); }
      var heroH = UI.hero({ center: true, value: main == null ? '—' : main,
        sub: bits.join(' · ') || null, read: C.home || null,
        chip: bad ? { text: 'Solarbank-Fehler ' + err, tone: 'bad' } : null });
      /* 1.2: when the chart shows columns (row "Heute"/"Diesen Monat"), tapping the power switches back to the
         power curve, like the power row in the Standard look. */
      if (C.home && window._hpPlantCfg && window._hpPlantCfg[C.home]) {
        var tp = function (k) { return 'window._hpPlantTap&&window._hpPlantTap(event,\'' + k + '\')'; };
        heroH = '<div data-hp-metric="' + esc(C.home) + '" data-casora-nodismiss="" style="cursor:pointer;pointer-events:auto;"'
          + ' ontouchstart="' + tp('s') + '" ontouchend="' + tp('t') + '" onclick="' + tp('c') + '">' + heroH + '</div>';
      }
      return heroH;
    }
    if (part === 'sources' && C.sources) {
      // Signs as in HA: grid below 0 is feed-in, battery above 0 discharges, below 0 charges.
      var ROLE = [['grid', 'Netz', 'mdi:transmission-tower'], ['solar', 'Solar', 'mdi:solar-power-variant'],
        ['battery', 'Akku', 'mdi:home-battery-outline']];
      var srows = [];
      ROLE.forEach(function (r) {
        (C.sources[r[0]] || []).forEach(function (id) {
          var w = watt(states, id);
          // Solar and battery without a value: asleep (at night), 0 W rather than unreachable.
          if (w == null && r[0] !== 'grid' && states[id]) w = 0;
          var how = w == null ? 'Nicht erreichbar' : r[0] === 'grid' && w < -FLOW_ON ? 'Einspeisung'
            : r[0] === 'battery' && w > FLOW_ON ? 'Entlädt' : r[0] === 'battery' && w < -FLOW_ON ? 'Lädt' : null;
          // #44: the battery's charge level („Lädt · 78 %“) when its device has a percent sensor.
          var soc = r[0] === 'battery' && window.casoraEnergyBatterySoc ? num(states, window.casoraEnergyBatterySoc(hass, id)) : null;
          var socT = soc != null ? Math.round(soc) + ' %' : null;
          srows.push({ entity: id, icon: r[2], label: r[1], sub: how && socT ? how + ' · ' + socT : (how || socT),
            value: fW(w == null ? null : Math.abs(w), hass) });
        });
      });
      var autoHtml = C.auto ? E.sec('auto', C, states, hass) : '';
      // #62: with the energy flow above, the sources are its circles, not a second list.
      return (srows.length && !C.flowOn ? UI.label('Woher kommt der Strom') + UI.group(srows) : '') + autoHtml;
    }
    // The house's power for the consumers' shares: the sensor, else the sum of the list.
    var homeW = function () {
      var home = watt(states, C.home);
      if (home == null && C.sum && window._casoraPowerSum) {
        var RH = window._casoraPowerSum(C.sum, states);
        home = isFinite(RH.sum) ? RH.sum : null;
      }
      return home;
    };
    var wText = function (w) { return w < 10 ? (Math.round(w * 10) / 10).toLocaleString(LANG(hass)) + ' W' : fW(w, hass); };
    if (part === 'auto' && C.auto && C.auto.ha && window.casoraEnergyConsumers) {
      // #44: exactly the "individual devices" of HA's energy dashboard, by power; a device without a power sensor
      // shows today's energy (or just its meter), one whose sensor is unreachable says so.
      var L = window.casoraEnergyConsumers(hass) || [];
      var vis = autoVisible(L.map(function (x) { return x.power || x.id; })) || [];
      var homeH = homeW();
      var hrows = L.filter(function (x) { return vis.indexOf(x.power || x.id) > -1; }).map(function (x) {
        var pct = x.w != null && homeH > 0 ? Math.round(x.w / homeH * 100) : null;
        var sub = pct > 0 && pct <= 100 ? pct + ' % des aktuellen Verbrauchs'
          : x.power && x.w == null ? 'Nicht erreichbar' : x.kwh != null && x.daily ? 'heute' : null;
        return { entity: x.power || x.id, icon: 'plug', iconTone: x.w != null && x.w <= 0 ? DIM : null, label: x.name, sub: sub,
          value: x.w != null ? wText(Math.max(0, x.w)) : x.kwh != null ? fN(x.kwh, hass) + ' kWh' : null };
      });
      return hrows.length ? UI.label('Verbraucher') + consList(UI, hrows) : '';
    }
    if (part === 'auto' && C.auto && window._casoraAutoConsumers) {
      var A = window._casoraAutoConsumers(hass, states, Object.assign({}, C.auto, { visible: autoVisible }));
      var home = homeW();
      var anm = function (id) {
        var a = (states[id] && states[id].attributes) || {};
        var t = String(a.friendly_name || (hass && hass.entities && hass.entities[id] && hass.entities[id].name) || id);
        return window.casoraCleanName ? window.casoraCleanName(t) : (t.replace(/\s*((aktuelle|momentane)\s+leistung|current\s+(power|consumption)|power|leistung)$/i, '').trim() || t);
      };
      var arows2 = E.consOrder(A.top.map(function (x) { return { id: x.id, w: x.w, skip: x.w == null ? 'off' : '' }; })).map(function (x) {
        var pct = home > 0 && x.w > 0 ? Math.round(x.w / home * 100) : null;
        return { entity: x.id, icon: 'plug', iconTone: E.consRank(x) ? DIM : null, label: anm(x.id),
          sub: pct > 0 && pct <= 100 ? pct + ' % des aktuellen Verbrauchs' : null,
          value: x.w == null ? 'Nicht erreichbar' : wText(Math.max(0, x.w)), valueTone: x.w == null ? 'warn' : null };
      });
      /* #44: "Top N" says the list is the largest ones, not every consumer adding up to the total.
         #79: a room lists all of its consumers (zero): five, the rest behind "Alle N anzeigen". */
      if (C.auto.zero) return arows2.length ? UI.label('Verbraucher') + consList(UI, arows2) : '';
      return arows2.length ? UI.label(arows2.length > 1 ? 'Top ' + arows2.length + ' Verbraucher' : 'Verbraucher') + UI.group(arows2) : '';
    }
    if (part === 'parts' && C.sum && window._casoraPowerSum) {
      var R = window._casoraPowerSum(C.sum, states);
      var nm = function (id) {
        var a = (states[id] && states[id].attributes) || {};
        var t = String(a.friendly_name || (hass && hass.entities && hass.entities[id] && hass.entities[id].name) || id);
        return t.replace(/\s*(power|leistung)$/i, '').trim() || t;
      };
      var WHY = { off: 'Nicht erreichbar', nopower: 'Keine Leistung', parent: 'Steckt hinter' };
      // #79: every consumer of the room, in one order that does not depend on what the others draw (E.consOrder),
      // also the ones measured in the room's area that the list does not add up; five, the rest behind "Alle N".
      var extra = C.area ? E.roomExtras(hass, states, C).list : [];
      var all = E.consOrder(R.items.concat(extra.map(function (x) { return { id: x.id, w: x.w, skip: '', out: true }; })));
      var rows = all.map(function (x) {
        var icon = (C.icons || {})[x.id] || 'plug', dim = E.consRank(x) ? DIM : null;
        if (x.skip) {
          return { entity: x.id, icon: icon, iconTone: dim,
            label: nm(x.id), sub: 'Nicht in der Summe' + (x.skip === 'parent' ? ' · ' + WHY.parent + ' ' + nm(x.parent) : ''),
            value: x.skip === 'parent' ? '—' : WHY[x.skip], valueTone: x.skip === 'off' ? 'warn' : null };
        }
        var pct = !x.out && R.sum > 0 && x.w > 0 ? Math.round(x.w / R.sum * 100) : null;
        var w = x.out && x.w != null ? Math.max(0, x.w) : x.w;
        return { entity: x.id, icon: icon, iconTone: dim, label: nm(x.id),
          sub: x.out ? 'Nicht in der Summe' : pct ? pct + ' % der Summe' : null,
          value: w == null ? WHY.off : w > 0 && w < 10 ? (Math.round(w * 10) / 10).toLocaleString(LANG(hass)) + ' W' : fW(w, hass),
          valueTone: w == null ? 'warn' : null };
      });
      var head = 'In der Summe' + (R.used < all.length ? ' · ' + R.used + ' von ' + all.length : '');
      return rows.length ? UI.label(head) + consList(UI, rows) : '';
    }
    if (part === 'more') {
      var secs = [];
      if (ctlHtml) secs.push(ctlHtml);
      // Energy coach: one row, expandable with summary, tips and "Neu auswerten"
      var cs = states[COACH];
      if (cs) {
        var a = cs.attributes || {};
        var running = a.status === 'running';
        var eur = Number(a.ersparnis_eur);
        var head = { icon: 'mdi:creation', iconTone: 'accent', label: 'Energie-Coach',
          value: running ? 'Läuft …' : (eur > 0 ? '≈ ' + money(eur, '€', hass) : null),
          sub: running ? 'Claude wertet die letzte Woche aus …' : (eur > 0 ? 'pro Woche sparbar' : (a.fazit ? null : 'Noch keine Auswertung')) };
        var ink = 'var(--casora-popup-tiles-text-primary, #3A322B)', ink2 = 'var(--casora-soft-sub, rgba(58,50,43,0.6))';
        var body = '<div style="font-family:var(--primary-font-family, system-ui);padding:2px 6px 0;text-align:left;white-space:normal;">'
          + (a.fazit ? '<div style="font-size:14px;line-height:1.45;color:' + ink + ';">' + esc(a.fazit) + '</div>' : '')
          + ((a.erkenntnisse || []).length ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.5;color:' + ink2 + ';">'
            + a.erkenntnisse.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
          + ((a.tipps || []).length ? UI.label('Tipps').replace('margin:0 6px 10px', 'margin:12px 0 4px')
            + '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5;color:' + ink + ';">'
            + a.tipps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
          + (a.erstellt ? '<div style="font-size:12px;color:' + ink2 + ';margin-top:10px;">Auswertung der letzten 7 Tage · ' + esc(ago(a.erstellt) || '') + '</div>' : '')
          + (running ? '' : '<div style="margin-top:12px;">' + pill(UI, a.fazit ? 'Neu auswerten' : 'Jetzt auswerten',
              window.casoraSvc ? window.casoraSvc('casora_energie_coach') : null) + '</div>')
          + '</div>';
        secs.push('<div>' + UI.group([head])
          + '<div style="margin-top:8px;">' + UI.more('energy-coach', body, { sub: true, label: 'Tipps', less: 'Weniger' }) + '</div></div>');
      }
      // Self-sufficiency details (the self-supply share is already in the status line)
      var arows = [];
      var sT = num(states, C.solarToday), nT = num(states, C.gridToday);
      if (sT != null && nT != null && sT + nT > 0) {
        arows.push({ entity: C.solarToday, icon: 'mdi:solar-power-variant', iconTone: '#FFD600', label: 'Solaranteil heute',
          value: Math.round(sT / (sT + nT) * 100) + ' %', sub: 'Solar ' + fN(sT, hass) + ' kWh · Netz ' + fN(nT, hass) + ' kWh' });
      }
      var exp = watt(states, C.export), expTot = num(states, C.exportTotal);
      // Meter in Wh, kWh or MWh; divided by 1000 below for kWh.
      if (expTot != null) expTot *= ({ kWh: 1000, MWh: 1e6 }[(states[C.exportTotal].attributes || {}).unit_of_measurement] || 1);
      if (exp != null || expTot != null) {
        arows.push({ entity: C.export || C.exportTotal, icon: 'mdi:transmission-tower-export', iconTone: '#30D158', label: 'Einspeisung',
          value: fW(exp, hass), sub: expTot != null ? 'Gesamt ' + fN(expTot / 1000, hass) + ' kWh' : null });
      }
      var sav = num(states, C.savings);
      if (sav != null) {
        var cur = (states[C.savings].attributes || {}).unit_of_measurement || '€';
        arows.push({ entity: C.savings, icon: 'mdi:piggy-bank-outline', iconTone: '#30D158', label: 'Ersparnis gesamt',
          value: money(sav, cur, hass) });
      }
      if (arows.length) secs.push(UI.group(arows, 'Autarkie'));
      // Solarbank details (without the battery level, which is in the energy flow)
      var STATE = {
        detection: 'Erkennung', protection_charge: 'Schutzladung', bypass: 'Bypass',
        bypass_discharge: 'Bypass und Entladen', discharge: 'Entlädt', charge: 'Lädt',
        charge_bypass: 'Lädt und Bypass', charge_ac: 'Lädt aus dem Netz', charge_priority: 'Ladevorrang',
        wakeup: 'Aufwachen', cold_wakeup: 'Kaltstart', fully_charged: 'Voll geladen',
        full_bypass: 'Voll, Bypass', standby: 'Standby', unknown: 'Unbekannt',
      };
      var srows = [];
      var err = raw(states, C.error);
      if (ok(err) && err !== '0' && err !== '40' && String(err).toLowerCase() !== 'none') {
        srows.push({ entity: C.error, icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: 'Fehler', labelTone: 'bad', value: 'Code ' + err });
      }
      var st = raw(states, C.state);
      if (st != null) {
        srows.push({ entity: C.state, icon: 'mdi:swap-horizontal', iconTone: '#BF5AF2', label: 'Betriebszustand',
          value: ok(st) ? (STATE[st] || st) : 'Offline', valueTone: ok(st) ? null : 'warn' });
      }
      var en = num(states, C.energy), capv = num(states, C.capacity);
      if (capv != null || en != null) {
        srows.push({ entity: C.capacity || C.energy, icon: 'mdi:battery-outline', iconTone: '#0A84FF', label: 'Kapazität',
          value: capv != null ? fN(capv / 1000, hass) + ' kWh' : '—',
          sub: en != null ? (en < 1000 ? Math.round(en) + ' Wh' : fN(en / 1000, hass) + ' kWh') + ' gespeichert' : null });
      }
      (Array.isArray(C.pv) ? C.pv : []).forEach(function (id, i) {
        if (!states[id]) return;
        srows.push({ entity: id, icon: 'mdi:solar-panel', iconTone: '#FFD600', label: 'Modul ' + (i + 1), value: fW(watt(states, id), hass) });
      });
      var temp = num(states, C.temp);
      if (temp != null) {
        srows.push({ entity: C.temp, icon: 'mdi:thermometer', iconTone: temp >= 45 ? 'bad' : '#FF9F0A', label: 'Temperatur',
          value: Math.round(temp) + ' ' + ((states[C.temp].attributes || {}).unit_of_measurement || '°C') });
      }
      var lt = watt(states, C.loadTarget);
      if (lt != null) srows.push({ entity: C.loadTarget, icon: 'mdi:tune-vertical', iconTone: 'accent', label: 'Lastvorgabe', value: fW(lt, hass) });
      if (srows.length) secs.push(UI.group(srows, 'Solarbank'));
      return secs.length ? UI.more('energy', secs.map(function (x) { return '<div>' + x + '</div>'; }).join(''), { count: secs.length }) : '';
    }
    return '';
  };
})();
