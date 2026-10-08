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
    if (extra) { cf.x = extra; cs.x = [{ 'justify-self': 'stretch' }, { overflow: 'visible' }]; keys.push('x'); }
    var styles = Object.assign({}, metricCard.styles);
    styles.card = (metricCard.styles.card || []).map(function (o) { return o.padding ? { padding: '22px 24px 18px 24px' } : o; });
    styles.grid = [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
      { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }];
    styles.custom_fields = cs;
    return Object.assign({}, metricCard, { styles: styles, custom_fields: cf });
  };
  /* Breites „Mehr“: aufgeklappt zwei ausgeglichene Spalten (wie MORE_WIDE_CSS in 02-geraete.js). */
  var MORE_WIDE_CSS = '\n@media (min-width: 761px) {'
    + ' .hui-more.open > .hui-mbd { display: block !important; column-count: 2; column-gap: var(--casora-popup-col-gap, 26px) !important; }'
    + ' .hui-more.open > .hui-mbd > * { break-inside: avoid; -webkit-column-break-inside: avoid; display: block; margin: 0; padding-bottom: 18px; }'
    + ' .hui-more.open > .hui-mbd > style { display: none; margin: 0; } }';
  // Aufbau: top (volle Breite) – dann links/rechts; schmal eine Spalte in Lesereihenfolge.
  var layout = function (o) {
    var narrow = typeof window !== 'undefined' && window.innerWidth <= 760;
    var has = function (k) { return o.fields[k] != null && o.fields[k] !== ''; };
    var top = o.top.filter(has), L = o.left.filter(has), R = o.right.filter(has);
    if (!L.length && R.length > 1 && o.moveLeft) { L = R.filter(function (k) { return o.moveLeft.indexOf(k) > -1; }); R = R.filter(function (k) { return L.indexOf(k) < 0; }); }
    /* Wie B-11 in den Geräte-Popups (H.layout, 02-geraete.js): Steht rechts nur „Mehr“, wird das Popup
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
      keys.forEach(function (k, i) { cf[k] = o.fields[k]; cs[k] = fs(first + i * 2, k); });
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
      keys.forEach(function (k, i) { cf[k] = o.fields[k]; cs[k] = fs(i, k); });
      /* Einspaltiges „Mehr“ am breiten Popup: aufgeklappt zwei ausgeglichene Spalten (MORE_WIDE_CSS greift erst ab 761 px). */
      if (oneMore && cf.more && cf.more.card) {
        cf.more = { card: Object.assign({}, cf.more.card, { extra_styles: (cf.more.card.extra_styles || '') + MORE_WIDE_CSS }) };
      }
    } else {
      /* „Mehr“ wie in den Geräte-Popups unter beiden Spalten über die volle Breite; aufgeklappt
         verteilen sich die Abschnitte auf zwei Spalten statt rechts zu stapeln (links blieb sonst leer). */
      var wideMore = R.length > 1 && R[R.length - 1] === 'more' && o.fields.more && o.fields.more.card;
      if (wideMore) R = R.slice(0, -1);
      areas = top.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + ' "main side"' + (wideMore ? ' "more more"' : '');
      cols = 'minmax(0, 1fr) minmax(0, 1fr)';
      top.forEach(function (k, i) { cf[k] = o.fields[k]; cs[k] = fs(i, k); });
      cf.main = { card: col(L, top.length) }; cs.main = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
      cf.side = { card: col(R, top.length + 1) }; cs.side = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
      if (wideMore) {
        cf.more = { card: Object.assign({}, o.fields.more.card, { extra_styles: (o.fields.more.card.extra_styles || '') + MORE_WIDE_CSS }) };
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
      + (tone || 'var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95))') + ';white-space:nowrap;">' + UI.esc(text) + '</span>';
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
        if (lat.length) ih = ih.split('data-casora-live="text" data-casora-ent="' + lat[0].id + '"')
          .join('data-hp-live-join="' + lat.map(function (l) { return l.id; }).join(',') + '"');
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
      solar: solar, soc: v.entity_battery_soc || null, grid: v.entity_netz_power || null,
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
    // 06.10.2026: Raum ohne eigenen Sensor – Summe der Geräte oben, darunter jeder Summand mit
    // seinem Wert; übersprungene (nicht erreichbar, keine Leistung, hinter Messsteckdose) markiert.
    var parts = !ctx.powerId && window._casoraPowerSum && Array.isArray(v.power_entities) && v.power_entities.some(Boolean)
      ? { energy_entities: v.power_entities.filter(Boolean), energy_parent: v.power_parent || null } : null;
    if (parts) { C.sum = parts; C.icons = v.power_icons || null; }
    var sumIds = parts ? window._casoraPowerIds(parts) : [];
    var f = {};
    f.hero = { card: secCard([C.home, C.grid, C.costToday, C.today, C.error].concat(sumIds), call('_casoraSoftEnergy', 'hero', C), states) };
    if (ctx.metricCard) f.metric = { card: chartCard(ctx.metricCard) };
    var fl = ctx.fields || {}, autoTop = null;
    if (typeof fl.use === 'string' && fl.use) f.use = UI.label('Verbrauch') + fl.use;
    if (parts) f.top = { card: secCard(sumIds, call('_casoraSoftEnergy', 'parts', C), states) };
    else if (typeof fl.top === 'string' && fl.top) f.top = UI.label('Verbraucher') + fl.top;
    else if (ctx.powerId && window._casoraAutoConsumers) {
      // 07.10.2026: keine Verbraucher zugeordnet – Casora sucht die größten selbst (bis 5 nach
      // Leistung). Popup eines Raums (Sensor mit Bereich, kein Haus-Sensor): nur dieser Bereich.
      C.auto = { exclude: [C.home, C.solar, C.grid, C.charge, C.discharge, C.output, C.export, C.loadTarget]
        .concat(C.pv).filter(Boolean), area: autoArea(ctx, v), max: 5 };
      var cand = window._casoraAutoConsumers(ctx.hass, states, C.auto);
      if (cand.ids.length) autoTop = f.top = { card: secCard([C.home].concat(cand.ids.slice(0, 60)), call('_casoraSoftEnergy', 'auto', C), states) };
    }
    var inner = ctx.inner || {};
    var cj = 'const C = ' + JSON.stringify(C) + ';\n';
    if (solar && has(C.solar) && has(C.home) && inner.common && inner.flow) {
      f.flow = { card: secCard([C.solar, C.charge, C.discharge, C.output, C.grid, C.export, C.home, C.soc],
        inner.common + cj + inner.flow.replace("plate(title('Energiefluss')", "UI.label('Energiefluss') + plate(''"), states) };
    }
    if (solar && inner.common) {
      /* Steuerung läuft mit dem bisherigen Rumpf (gleiche Dienste), nur das Etikett wird weich. */
      var ctl = inner.ctl ? inner.ctl.replace("plate(title('Steuerung') + parts.join(div))", "UI.label('Steuerung') + plate(parts.join(div))") : "return '';";
      var code = inner.common + cj + 'const __ctl = (() => {\n' + ctl + '\n})();\n'
        + 'return window._casoraSoftEnergy ? window._casoraSoftEnergy.sec("more", C, states, hass, __ctl) : "";';
      var watch = [C.mode, C.limit, C.exportSwitch, C.socMin, C.socMax, C.state, C.error, C.energy, C.capacity, C.temp,
        C.loadTarget, C.solarToday, C.gridToday, C.export, C.exportTotal, C.savings, COACH].concat(C.pv);
      if (E.sec('more', C, states, null, '')) f.more = { card: secCard(watch, code, states) };
      else if (inner.ctl && (has(C.mode) || has(C.limit) || has(C.exportSwitch))) f.more = { card: secCard(watch, code, states) };
    }
    // Leerzustand (Runde 2): ohne Tageszähler, Verbraucher und Solar nicht nur das Diagramm,
    // sondern eine ruhige Zeile mit dem nächsten Schritt – wie „Noch kein Gerät zugeordnet“.
    if (!f.use && (!f.top || f.top === autoTop) && !f.flow && !f.more) {
      f.use = UI.group([{ icon: 'mdi:link-variant-off', iconTone: 'var(--casora-popup-ui-dim, rgba(255,255,255,0.18))',
        label: 'Noch keine Tageswerte', sub: (!window.casoraIsAdmin || window.casoraIsAdmin()) ? 'Welche Geräte hier zählen, legst du im Studio fest.' : null, subWrap: true }], 'Verbrauch');
    }
    return layout({ fields: f, top: ['hero', 'metric'], left: solar ? ['flow'] : ['top'],
      right: solar ? ['use', 'top', 'more'] : ['use', 'more'], moveLeft: ['top'],
      narrowOrder: ['flow', 'use', 'top', 'more'] });
  };

  // Bereich für die automatischen Verbraucher: der Raum des Popups (room_name = Bereichsname) oder
  // der Bereich des Leistungssensors, wenn er keiner fürs ganze Haus ist; sonst das ganze Haus.
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
  // Wer sieht das? Admins sehen alles; sonst nur, was die Dashboard-Konfiguration nicht verbirgt –
  // solange sie noch lädt, nichts (sie ist meist schon vom Dashboard-Start da).
  var autoVisible = function (ids) {
    var now = window.casoraVisibleIdsNow ? window.casoraVisibleIdsNow(ids) : ids;
    if (now) return now;
    return (!window.casoraIsAdmin || window.casoraIsAdmin()) ? ids : [];
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
        var off0 = R0.items.filter(function (x) { return x.skip === 'off'; }).length;
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
      var bad = ok(err) && err !== '0' && String(err).toLowerCase() !== 'none';
      /* Ohne Leistungssensor: der erste Wert wird zur Hauptzeile („Heute 3,72 kWh“) statt „— · heute …“. */
      var main = p == null ? null : fW(Math.abs(p) < 20 && p < 0 ? 0 : Math.abs(p), hass);
      if (main == null && bits.length) { main = bits.shift(); main = main.charAt(0).toUpperCase() + main.slice(1); }
      return UI.hero({ center: true, value: main == null ? '—' : main,
        sub: bits.join(' · ') || null, read: C.home || null,
        chip: bad ? { text: 'Solarbank-Fehler ' + err, tone: 'bad' } : null });
    }
    if (part === 'auto' && C.auto && window._casoraAutoConsumers) {
      var A = window._casoraAutoConsumers(hass, states, Object.assign({}, C.auto, { visible: autoVisible }));
      var home = watt(states, C.home);
      var anm = function (id) {
        var a = (states[id] && states[id].attributes) || {};
        var t = String(a.friendly_name || (hass && hass.entities && hass.entities[id] && hass.entities[id].name) || id);
        return t.replace(/\s*((aktuelle|momentane)\s+leistung|current\s+(power|consumption)|power|leistung)$/i, '').trim() || t;
      };
      var arows2 = A.top.map(function (x) {
        var pct = home > 0 ? Math.round(x.w / home * 100) : null;
        return { entity: x.id, icon: 'plug', label: anm(x.id),
          sub: pct > 0 && pct <= 100 ? pct + ' % des aktuellen Verbrauchs' : null,
          value: x.w < 10 ? (Math.round(x.w * 10) / 10).toLocaleString(LANG(hass)) + ' W' : fW(x.w, hass) };
      });
      return arows2.length ? UI.label('Verbraucher') + UI.group(arows2) : '';
    }
    if (part === 'parts' && C.sum && window._casoraPowerSum) {
      var R = window._casoraPowerSum(C.sum, states);
      var nm = function (id) {
        var a = (states[id] && states[id].attributes) || {};
        var t = String(a.friendly_name || (hass && hass.entities && hass.entities[id] && hass.entities[id].name) || id);
        return t.replace(/\s*(power|leistung)$/i, '').trim() || t;
      };
      var WHY = { off: 'Nicht erreichbar', nopower: 'Keine Leistung', parent: 'Steckt hinter' };
      var used = R.items.filter(function (x) { return !x.skip; }).sort(function (a, b) { return b.w - a.w; });
      var skipped = R.items.filter(function (x) { return x.skip; });
      var rows = used.map(function (x) {
        var pct = R.sum > 0 && x.w > 0 ? Math.round(x.w / R.sum * 100) : null;
        return { entity: x.id, icon: (C.icons || {})[x.id] || 'plug', label: nm(x.id),
          sub: pct ? pct + ' % der Summe' : null,
          value: x.w > 0 && x.w < 10 ? (Math.round(x.w * 10) / 10).toLocaleString(LANG(hass)) + ' W' : fW(x.w, hass) };
      }).concat(skipped.map(function (x) {
        return { entity: x.id, icon: (C.icons || {})[x.id] || 'plug', iconTone: 'var(--casora-popup-ui-dim, rgba(58,50,43,0.25))',
          label: nm(x.id), sub: 'Nicht in der Summe' + (x.skip === 'parent' ? ' · ' + WHY.parent + ' ' + nm(x.parent) : ''),
          value: x.skip === 'parent' ? '—' : WHY[x.skip], valueTone: x.skip === 'off' ? 'warn' : null };
      }));
      var head = 'In der Summe' + (skipped.length ? ' · ' + used.length + ' von ' + R.items.length : '');
      return rows.length ? UI.label(head) + UI.group(rows) : '';
    }
    if (part === 'more') {
      var secs = [];
      if (ctlHtml) secs.push(ctlHtml);
      // Energie-Coach: eine Zeile, aufklappbar mit Fazit, Tipps und „Neu auswerten“
      var cs = states[COACH];
      if (cs) {
        var a = cs.attributes || {};
        var running = a.status === 'running';
        var eur = Number(a.ersparnis_eur);
        var head = { icon: 'mdi:creation', iconTone: 'accent', label: 'Energie-Coach',
          value: running ? 'Läuft …' : (eur > 0 ? '≈ ' + money(eur, '€', hass) : null),
          sub: running ? 'Claude wertet die letzte Woche aus …' : (eur > 0 ? 'pro Woche sparbar' : (a.fazit ? null : 'Noch keine Auswertung')) };
        var esc = UI.esc;
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
      // Autarkie-Details (Eigenversorgung steht schon oben in der Unterzeile)
      var arows = [];
      var sT = num(states, C.solarToday), nT = num(states, C.gridToday);
      if (sT != null && nT != null && sT + nT > 0) {
        arows.push({ entity: C.solarToday, icon: 'mdi:solar-power-variant', iconTone: '#FFD600', label: 'Solaranteil heute',
          value: Math.round(sT / (sT + nT) * 100) + ' %', sub: 'Solar ' + fN(sT, hass) + ' kWh · Netz ' + fN(nT, hass) + ' kWh' });
      }
      var exp = watt(states, C.export), expTot = num(states, C.exportTotal);
      // Zähler in Wh, kWh oder MWh – unten durch 1000 in kWh.
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
      // Solarbank-Technik (ohne Akkustand – der steht im Energiefluss)
      var STATE = {
        detection: 'Erkennung', protection_charge: 'Schutzladung', bypass: 'Bypass',
        bypass_discharge: 'Bypass und Entladen', discharge: 'Entlädt', charge: 'Lädt',
        charge_bypass: 'Lädt und Bypass', charge_ac: 'Lädt aus dem Netz', charge_priority: 'Ladevorrang',
        wakeup: 'Aufwachen', cold_wakeup: 'Kaltstart', fully_charged: 'Voll geladen',
        full_bypass: 'Voll, Bypass', standby: 'Standby', unknown: 'Unbekannt',
      };
      var srows = [];
      var err = raw(states, C.error);
      if (ok(err) && err !== '0' && String(err).toLowerCase() !== 'none') {
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
