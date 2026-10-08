// ── Weich-Gestaltung der Spezial-Popups (01.10.2026) ─────────────────────────
// Die Kamera (casora_popup_camera), Medien und Alarm-Schalter im Weich-Design: Ring-Kopf, Sand-Pillen, Etiketten,
// runde Balken und Knöpfe. Nur aktiv, wenn das Theme --casora-popup-layout: soft setzt
// (window._casoraSoft); Standard und Glas bauen weiter ihr bisheriges HTML.
// Die Vorlagen rufen nur window._casoraCamSoft / _casoraMediaSoft / _casoraAlarmSoftToggle auf.
// (Aquarien-Übersicht und Aquarium-Licht: am 01.10.2026 entfernt, Nachfolger ist das Becken-Popup.)
(function () {
  if (window._casoraWeichSpezial) return;
  window._casoraWeichSpezial = true;

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var FONT = 'var(--primary-font-family, system-ui)';
  var INK = 'var(--casora-popup-tiles-text-primary, #3A322B)';
  var SUB = 'var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary))';
  var ROW = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))';
  var CTL = 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))';

  // ── Medien (casora_media, casora_now_playing_chip/_primary) ───────────────
  // Zusatzregeln hinter dem bisherigen <style> des Medien-Popups (nur Weich):
  // Etikett, große runde Cover-Ecke, runde Fortschritts- und Lautstärke-Balken,
  // Sand-Kreise für die Knöpfe, Wiedergabe-Knopf in Ton, Quellen als Sand-Pillen.
  // Fix-Runde 1: Medien = Blau (feste Farbzuordnung), über --casora-soft-media-hue.
  var MEDIA_HUE = 'var(--casora-soft-media-hue, var(--casora-soft-media, var(--casora-color-pink, #D16E7E)))';
  /* 1.2 (P6): Wiedergabe-Knopf, Fortschritt und Lautstärke im Medien-Popup in der Medien-Farbe der Kachel (Rosa). */
  var MEDIA_ACC = 'var(--casora-tile-media-color, ' + MEDIA_HUE + ')';
  var srcRules = function () {
    return '.hm-src-l{font-size:12px !important;font-weight:700 !important;letter-spacing:.1em !important;text-transform:uppercase;'
      + 'color:var(--casora-soft-label, ' + SUB + ') !important;margin:24px 6px 10px !important;}'
      + '.hm-src .hui-sg{font-size:13px !important;font-weight:600 !important;padding:11px 16px !important;'
      + 'background:var(--casora-lps-chip, ' + ROW + ') !important;color:var(--casora-lps-chip-ink, ' + SUB + ') !important;}'
      + '.hm-src .hui-sg.on{background:var(--casora-lps-chip-on, ' + CTL + ') !important;color:var(--casora-lps-chip-on-ink, ' + INK + ') !important;}';
  };
  window._casoraMediaSoft = {
    srcRules: srcRules,
    css: function () {
      return '<style>'
        /* Fix-Runde 1 (B-01/B-04): Raum als Statuszeile unter dem Titel, Titel des Stücks 17/700. */
        + '.hm-lbl{font-size:15px;font-weight:500;letter-spacing:0;text-transform:none;line-height:1.35;overflow:visible;color:' + SUB + ';margin:-2px 0 20px;}'
        + '.hm-art{border-radius:28px;background:' + CTL + ';box-shadow:var(--casora-soft-art-shadow, 0 18px 40px -22px rgba(90,70,50,0.45));}'
        + '.hm-art::after{box-shadow:none;}'
        + '.hm-t{font-size:17px;font-weight:700;letter-spacing:-0.01em;}'
        + '.hm-s{font-weight:500;color:' + SUB + ';}'
        + '.hm-prog{margin-top:18px;}'
        + '.hm-track{height:8px;background:' + CTL + ';}'
        /* Fortschritt wie der Wiedergabe-Knopf in der Medien-Farbe (P6). */
        + '.hm-fill{background:' + MEDIA_ACC + ';}'
        + '.hm-times{font-weight:600;color:' + SUB + ';margin-top:7px;}'
        + '.hm-ctl{gap:22px;margin-top:18px;}'
        + '.hm-b.sm{width:56px;height:56px;background:' + CTL + ';}'
        + '.hm-b.sm > div{transform:scale(.72);}'
        + '.hm-b.lg{width:72px;height:72px;background:' + MEDIA_ACC + ';'
        +   'box-shadow:0 14px 30px -12px color-mix(in srgb, ' + MEDIA_ACC + ' 60%, transparent);}'
        + '.hm-b.lg > div{background-color:#fff !important;}'
        + '@media (hover:hover){.hm-b.sm:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
        + '.hm-vol{min-height:66px;margin-top:24px;padding:8px 12px 8px 10px;border-radius:999px;background:' + ROW + ';color:' + SUB + ';}'
        + '.hm-vol .hm-b{width:44px;height:44px;background:' + CTL + ';}'
        + '.hm-vol .hm-track{height:10px;}'
        /* Lautstärke wie der Fortschritt (P6). */
        + '.hm-vol .hm-fill{background:' + MEDIA_ACC + ';}'
        + '.hm-vol .pct{font-size:14px;font-weight:700;color:' + INK + ';min-width:44px;}'
        + srcRules()
        /* Niedriges Querformat (iPad 1024×768): Cover kleiner, damit Tasten und Lautstärke ohne
           Scrollen sichtbar bleiben – vorher lag die Lautstärke beim Abspielen unter dem Rand (07.10.2026). */
        + '@media (min-width:761px) and (max-height:900px){.hm-art{width:min(240px, max(120px, calc(100vh - 640px)));}}'
        + '</style>';
    },
  };

  // ── Alarm-Popup: Bedienung (06.10.2026, nur Weich) ──────────────────────────
  // Statt An/Aus-Schalter: großer Haupt-Knopf (Scharf/Unscharf/Abbrechen/Alarm beenden) + Modus-Zeilen
  // darunter. Code-Feld, wenn Alarmo einen Code verlangt (code_format /
  // code_arm_required), Countdown bei arming/pending aus dem Alarmo-Attribut delay, Hinweis bei ausgelöst.
  // Die Vorlage ruft _casoraAlarmSoftToggle (Feld „toggle“) und _casoraSoftAlarm (Feld „modes“).
  var AL = window._casoraAlarmSoft = {};
  // Zahl im Countdown läuft per CSS (registrierte Ganzzahl-Eigenschaft) – kein Timer nötig.
  try { if (window.CSS && CSS.registerProperty) CSS.registerProperty({ name: '--cal-n', syntax: '<integer>', inherits: true, initialValue: '0' }); } catch (e) { /* schon registriert */ }
  var FEAT = { armed_home: 1, armed_away: 2, armed_night: 4, armed_custom_bypass: 16, armed_vacation: 32 };
  var MODE_WORD = { armed_home: 'Zuhause', armed_away: 'Abwesend', armed_night: 'Nacht', armed_vacation: 'Urlaub', armed_custom_bypass: 'Bypass' };
  var GOOD = 'var(--casora-security-ok-color, var(--casora-color-green, #5E9E6E))';
  var WARN = 'var(--casora-security-warn-color, var(--casora-color-orange, #DE8A4E))';
  var BAD = 'var(--casora-security-alarm-color, var(--casora-color-red, #D35A4E))';
  var TON = 'var(--casora-ton-ink, #94603B)';
  var icon = function (name, size, color) {
    var u = (typeof window.casoraIconUrl === 'function') ? window.casoraIconUrl(name) : '';
    return '<span style="display:inline-block;flex:none;width:' + size + 'px;height:' + size + 'px;background-color:' + color + ';'
      + "-webkit-mask:url('" + u + "') center / contain no-repeat;mask:url('" + u + "') center / contain no-repeat;pointer-events:none;\"></span>";
  };
  AL.info = function (ent, states) {
    var so = states[ent] || {}, a = so.attributes || {};
    var st = so.state || 'unknown';
    var feat = typeof a.supported_features === 'number' ? a.supported_features : 63;
    var needArm = !!a.code_format && a.code_arm_required !== false;
    var needDis = !!a.code_format;
    var left = null;
    if ((st === 'arming' || st === 'pending') && Number(a.delay) > 0 && so.last_changed) {
      left = Math.max(0, Math.round(Number(a.delay) - (Date.now() - new Date(so.last_changed).getTime()) / 1000));
    }
    var target = MODE_WORD[a.next_state] || MODE_WORD[a.arm_mode] || null;
    return { st: st, a: a, feat: feat, needArm: needArm, needDis: needDis, left: left, total: Number(a.delay) || 0, target: target,
      armed: !!MODE_WORD[st], numeric: a.code_format === 'number' };
  };
  AL.ok = function (I, id) { return !FEAT[id] || (I.feat & FEAT[id]) === FEAT[id]; };
  // Bedien-Element: data-casora-alarm statt data-casora-svc – der Code aus dem Feld wird beim Tippen ergänzt.
  AL.act = function (ent, service) {
    return ' role="button" tabindex="0" data-casora-alarm="' + esc(JSON.stringify({ e: ent, s: service })) + '"';
  };
  // Zwei Formen kommen an: {e, s} vom Haupt-Knopf und {domain, service, data:{entity_id}} aus den
  // Modus-Zeilen (UI.group, nur Attribut umbenannt). Ohne Angleichen fehlte bei Modus-Zeilen der Dienst.
  AL.spec = function (sp) {
    if (!sp || typeof sp !== 'object') return null;
    var s = sp.s || sp.service, e = sp.e || (sp.data && sp.data.entity_id) || (sp.target && sp.target.entity_id);
    if (Array.isArray(e)) e = e[0];
    return s && e ? { e: e, s: s } : null;
  };
  // Code-Feld (nur wenn die nächste Aktion einen Code braucht).
  AL.code = function (I) {
    var need = I.st === 'disarmed' ? I.needArm : I.needDis;
    if (!need) return '';
    return '<style>.cal-code input::placeholder{letter-spacing:0;font-weight:500;font-size:15px;color:' + SUB + ';}</style>'
      + '<div class="cal-code" style="display:flex;justify-content:center;margin:0 0 12px;">'
      + '<input type="password" autocomplete="off" ' + (I.numeric ? 'inputmode="numeric" pattern="[0-9]*" ' : '') + 'placeholder="Code eingeben" aria-label="Code"'
      + ' ontouchstart="event.stopPropagation();" ontouchend="event.stopPropagation();if(this.getRootNode().activeElement!==this){this.focus();}"'
      + ' onclick="event.stopPropagation();" onkeydown="event.stopPropagation();" onkeyup="event.stopPropagation();" onkeypress="event.stopPropagation();"'
      + ' style="width:220px;height:48px;box-sizing:border-box;border:none;outline:none;border-radius:999px;text-align:center;'
      + 'font:600 18px/1 ' + FONT + ';letter-spacing:.3em;color:' + INK + ';background:' + CTL + ';-webkit-appearance:none;appearance:none;"></div>';
  };
  // Countdown-Balken + Zahl (arming = bis scharf, pending = bis Alarm).
  AL.count = function (I, color) {
    if (I.left == null) return { bar: '', n: '' };
    var pct = I.total ? Math.max(0, Math.min(100, 100 - I.left / I.total * 100)) : 0;
    var k = 'cal' + Date.now().toString(36);
    return {
      bar: '<style>@keyframes ' + k + 'w{from{width:' + pct.toFixed(1) + '%}to{width:100%}}@keyframes ' + k + 'n{from{--cal-n:' + I.left + '}to{--cal-n:0}}'
        + '.cal-n::after{counter-reset:caln var(--cal-n);content:counter(caln);}</style>'
        + '<div style="height:6px;border-radius:3px;background:' + CTL + ';overflow:hidden;margin-top:10px;">'
        + '<div style="height:100%;border-radius:3px;background:' + color + ';animation:' + k + 'w ' + I.left + 's linear forwards;"></div></div>',
      n: '<span class="cal-n" style="font-variant-numeric:tabular-nums;animation:' + k + 'n ' + I.left + 's steps(' + Math.max(1, I.left) + ', end) forwards;"></span>',
    };
  };
  // Feld „toggle“ (oben, mittig)
  window._casoraAlarmSoftToggle = function (ent, states) {
    var I = AL.info(ent, states);
    var away = AL.ok(I, 'armed_away') ? 'armed_away' : (Object.keys(FEAT).filter(function (k) { return AL.ok(I, k); })[0] || 'armed_away');
    var cd = AL.count(I, '#fff');
    var b;
    if (I.st === 'disarmed') b = { svc: 'alarm_' + away.replace('armed_', 'arm_'), bg: TON, ink: '#fff', ic: 'shield_lock', t: 'Scharf schalten', s: MODE_WORD[away] };
    else if (I.st === 'triggered') b = { svc: 'alarm_disarm', bg: BAD, ink: '#fff', ic: 'shield_alarm', t: 'Alarm beenden', s: 'Die Alarmanlage wurde ausgelöst' };
    else if (I.st === 'arming') b = { svc: 'alarm_disarm', bg: TON, ink: '#fff', ic: 'shield_off', t: 'Abbrechen',
      s: (I.target ? I.target + ' · ' : '') + (cd.n ? 'scharf in ' + cd.n + ' s' : 'wird scharf …'), bar: true };
    else if (I.st === 'pending') b = { svc: 'alarm_disarm', bg: WARN, ink: '#fff', ic: 'shield_off', t: 'Unscharf schalten',
      s: cd.n ? 'Alarm in ' + cd.n + ' s' : 'Alarm läuft an', bar: true };
    else b = { svc: 'alarm_disarm', bg: CTL, ink: INK, ic: 'shield_off', t: 'Unscharf schalten', s: null };
    var bar = b.bar && cd.bar ? cd.bar.replace('background:' + CTL, 'background:rgba(255,255,255,0.28)').replace('margin-top:10px', 'margin-top:8px') : '';
    return '<div>' + AL.code(I) + '<div style="display:flex;justify-content:center;"><div' + AL.act(ent, b.svc)
      + ' style="display:flex;align-items:center;gap:14px;width:340px;max-width:100%;min-height:64px;box-sizing:border-box;padding:10px 22px 10px 16px;'
      + 'border-radius:999px;background:' + b.bg + ';color:' + b.ink + ';font-family:' + FONT + ';text-align:left;cursor:pointer;'
      + (b.bg === CTL ? '' : 'box-shadow:0 12px 26px -14px rgba(90,60,40,0.55);') + '">'
      + '<div style="width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;background:' + (b.bg === CTL ? 'var(--casora-lps-seg-on, #FFFDF9)' : 'rgba(255,255,255,0.2)') + ';">'
      + icon(b.ic, 22, b.bg === CTL ? INK : '#fff') + '</div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:700;letter-spacing:-0.01em;">' + b.t + '</div>'
      + (b.s ? '<div style="font-size:13px;font-weight:600;opacity:.82;margin-top:1px;">' + b.s + '</div>' : '')
      + bar + '</div></div></div></div>';
  };

  // Feld „modes“ (unten, volle Breite)
  window._casoraAlarmSoft.modes = function (ent, modes, states) {
    var UI = window._casoraUI; if (!UI) return '';
    var I = AL.info(ent, states);
    var list = modes.filter(function (m) { return AL.ok(I, m.id); });
    var aim = (I.st === 'arming' || I.st === 'pending') ? (I.a.next_state || I.a.arm_mode) : I.st;
    var svcOf = function (id) { return id === 'disarmed' ? 'alarm_disarm' : 'alarm_' + id.replace('armed_', 'arm_'); };
    var swap = function (html) { return String(html).replace(/data-casora-svc="/g, 'data-casora-alarm="'); };
    return swap(UI.group(list.map(function (m) {
      var on = aim === m.id;
      return { icon: m.icon, iconTone: on ? (m.id === 'disarmed' ? 'rgba(0,0,0,0)' : 'good') : 'rgba(0,0,0,0)', label: m.label,
        sub: on && (I.st === 'arming' || I.st === 'pending') ? 'Wird scharf …' : m.description,
        selected: on, svc: { domain: 'alarm_control_panel', service: svcOf(m.id), data: { entity_id: ent } } };
    }), I.st === 'disarmed' ? 'Oder Modus wählen' : 'Modus'));
  };

  // Tippen auf data-casora-alarm: Dienst mit Code aus dem Feld; fehlt der Code, Feld fokussieren.
  if (!window._casoraAlarmTap) {
    window._casoraAlarmTap = true;
    var tp = null, lastTouch = 0;
    window.addEventListener('touchstart', function (ev) {
      var t = ev.touches && ev.touches[0]; tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null;
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', function (ev) {
      var t = ev.touches && ev.touches[0];
      if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
    }, { capture: true, passive: true });
    var fire = function (ev) {
      var moved = ev.type === 'touchend' && !!(tp && tp.moved);
      if (ev.type === 'touchend') tp = null;
      var path = (ev.composedPath && ev.composedPath()) || [ev.target], el = null;
      for (var i = 0; i < path.length; i++) { if (path[i] && path[i].dataset && path[i].dataset.casoraAlarm) { el = path[i]; break; } }
      if (!el) return;
      ev.stopImmediatePropagation(); ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
      if (moved) return;
      if (ev.type === 'click' && Date.now() - lastTouch < 700) return;
      if (ev.type === 'touchend') lastTouch = Date.now();
      if (Date.now() - (window._casoraPopupOpenedAt || 0) < 600) return;
      var spec; try { spec = JSON.parse(el.dataset.casoraAlarm); } catch (e) { return; }
      spec = AL.spec(spec); if (!spec) return;
      var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
      var I = AL.info(spec.e, hass.states);
      var need = spec.s === 'alarm_disarm' ? I.needDis : I.needArm;
      var root = el.getRootNode && el.getRootNode();
      var inp = root && root.querySelector ? root.querySelector('.cal-code input') : null;
      var code = inp ? String(inp.value || '').trim() : '';
      if (need && !code) {
        if (inp) { inp.focus(); inp.animate && inp.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
        return;
      }
      var data = { entity_id: spec.e }; if (code) data.code = code;
      hass.callService('alarm_control_panel', spec.s, data).catch(function () {
        if (inp) { inp.value = ''; inp.placeholder = 'Code falsch'; inp.focus(); }
      });
      if (inp) inp.value = '';
    };
    window.addEventListener('touchend', fire, true);
    window.addEventListener('click', fire, true);
    window.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target;
      if (t && t.dataset && t.dataset.casoraAlarm) { ev.preventDefault(); t.click(); }
    }, true);
  }

  // ── Kamera ────────────────────────────────────────────────────────────────
  // Zusatz-CSS für casora_popup_camera (nur Weich): Knöpfe als Sand-Kreise mit Etikett,
  // aktive Knöpfe hell erhaben wie die Segmente, Kacheln und Livebild mit Weich-Rundung,
  // dazu eine Statuszeile (.cam-mode: Live / Bild / Offline / Letzte Aufnahme).
  window._casoraCamSoft = {
    css: function () {
      return '\n/* Weich (01.10.2026) */'
        + '\n.casora-cam-tile { border-radius: var(--casora-popup-row-radius, 24px) !important; box-shadow: var(--casora-soft-cam-tile-shadow, 0 10px 24px -16px rgba(90,70,50,0.45)) !important; }'
        + '\n.cam-stream-mount { border-radius: var(--casora-soft-cam-radius, 28px) !important; box-shadow: var(--casora-soft-cam-shadow, 0 18px 40px -24px rgba(90,70,50,0.55)) !important; }'
        + '\n.cam-frame { max-height: 58vh; }'
        /* Fix-Runde 1 (B-06/B-18): Fehlerfläche warmes Anthrazit statt Schwarz, Schrift wie überall. */
        + '\n.cam-stream-mount { background: var(--casora-soft-cam-fail, #24211E) !important; }'
        + '\n.casora-cam-offline { background: transparent !important; font-family: var(--primary-font-family, system-ui) !important; }'
        + '\n.casora-cam-offline .cam-retry { font-family: var(--primary-font-family, system-ui) !important; font-weight: 600 !important; }'
        /* Etiketten sind breiter als die 52-px-Knöpfe: bei 16 px stießen „Aufnahme“ und „Beschreiben“ aneinander. */
        + '\n.cam-controls { gap: 34px 24px !important; padding-bottom: 26px !important; }'
        + '\n.cam-controls > * { --cam-rim: none; box-shadow: none !important;'
        + ' background: var(--casora-soft-control-fill, rgba(140,115,90,0.10)) !important;'
        + ' color: var(--casora-popup-tiles-text-primary, #3A322B) !important; }'
        + '\n.cam-controls > * ha-icon { color: inherit !important; }'
        + '\n.cam-controls > *[data-on] { background: var(--casora-lps-seg-on, #FFFDF9) !important;'
        + ' color: var(--casora-lps-seg-on-ink, #2E2721) !important; box-shadow: var(--casora-lps-seg-on-shadow, none) !important; }'
        + '\n.cam-controls > *[data-confirm] { background: var(--casora-color-orange, #DE8A4E) !important; color: #fff !important; }'
        + '\n@media (hover: hover) { .cam-controls > *:hover { box-shadow: none !important; filter: brightness(0.97); }'
        + ' .cam-controls > *[data-on]:hover { box-shadow: var(--casora-lps-seg-on-shadow, none) !important; } }'
        + '\n.cam-controls > * > .cam-lbl { top: calc(100% + 8px); font-size: 12px; font-weight: 600;'
        + ' color: var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary)); }'
        + '\n.cam-mode-row { display: flex; justify-content: center; margin: -4px 0 2px; }'
        + '\n.cam-mode { display: inline-flex; align-items: center; gap: 7px; font-family: var(--primary-font-family, system-ui);'
        + ' font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 999px;'
        + ' background: var(--casora-soft-row-fill, rgba(140,115,90,0.07)); color: var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary)); }'
        + '\n.cam-mode::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--casora-color-orange, #DE8A4E); }'
        + '\n.cam-mode:empty { display: none; }';
    },
    // Statuszeile unter dem Livebild; _casoraCAM.setMode füllt .cam-mode.
    mode: function () {
      return '<div class="cam-mode-row"><span class="cam-mode"></span></div>';
    },

    // ── Entschlacken (E3, 01.10.2026) ──
    // Technische Varianten ausblenden: „Schnappschüsse …“ und je Gerät nur ein Stream
    // (Reolink legt main/sub/ext und Schnappschuss-Kameras an). Nur ohne eigene Auswahl
    // (variables.cameras); variables.show_stream_variants: true zeigt wieder alle.
    filter: function (ids, hass, variables) {
      var v = variables || {};
      if (v.show_stream_variants === true || (Array.isArray(v.cameras) && v.cameras.filter(Boolean).length)) return ids;
      var R = (hass && hass.entities) || {}, S = (hass && hass.states) || {};
      var name = function (id) { return String((S[id] && S[id].attributes && S[id].attributes.friendly_name) || ''); };
      var snap = function (id) {
        return /^snapshots?(_|$)/.test(String((R[id] || {}).translation_key || '')) || /schnappsch|snapshot/i.test(name(id) + ' ' + id);
      };
      var PREF = ['main', 'clear', 'sub', 'fluent', 'ext', 'balanced'];
      var dead = function (id) { var st = S[id]; return !st || st.state === 'unavailable' || st.state === 'unknown'; };
      var rank = function (id) {
        var i = PREF.indexOf(String((R[id] || {}).translation_key || ''));
        if (i < 0) i = /(_main|hochaufl|clear)\b/i.test(id + ' ' + name(id)) ? 0 : 10;
        return (dead(id) ? 100 : 0) + i;
      };
      var out = ids.filter(function (id) { return !snap(id); });
      var best = {};
      out.forEach(function (id) {
        var d = (R[id] || {}).device_id; if (!d) return;
        if (!best[d] || rank(id) < rank(best[d])) best[d] = id;
      });
      return out.filter(function (id) { var d = (R[id] || {}).device_id; return !d || best[d] === id; });
    },
    // Anzeigename ohne Stream-Technik: „Küche CamProxy_Kueche_main“ → „Küche“.
    label: function (id, st, hass, fallback) {
      var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
      var e = R[id] || {};
      var dev = e.device_id ? D[e.device_id] : null;
      var dn = String((dev && (dev.name_by_user || dev.name)) || '').trim();
      var fn = String(fallback || '').trim();
      if (!dn) return fn;
      var rest = fn.indexOf(dn) === 0 ? fn.slice(dn.length).trim() : null;
      if (rest === '' || (rest != null && /_|hochaufl|standardaufl|aufl[oö]sung|fluent|clear|\bmain\b|\bsub\b|stream|live/i.test(rest))) return dn;
      if (/_/.test(fn)) return dn;
      return fn;
    },
    // „vor 41 Min.“ statt „41m“; Bewegungssensor als Quelle: „Bewegung vor 2 Min.“
    age: function (ms, motion) {
      if (!isFinite(ms) || ms < 0) return '';
      var m = Math.floor(ms / 60000);
      var t = m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.floor(m / 60) + ' Std.' : 'vor ' + Math.floor(m / 1440) + ' T.';
      return motion ? 'Bewegung ' + t : t;
    },
    // Zurück zur Übersicht – sichtbarer Pfeil über dem Livebild.
    back: function (bindAttr) {
      return '<div class="cam-back-row"><div class="cam-back" role="button" aria-label="Zurück"' + bindAttr + '>'
        + '<ha-icon icon="mdi:chevron-left" style="--mdc-icon-size:22px;"></ha-icon><span>Alle Kameras</span></div></div>';
    },
    // Doppelklick bzw. Doppeltipp aufs Bild: Ausfüllen ↔ Einpassen (statt eigenem Knopf).
    dtap: function (ev, el) {
      var C = window._casoraCAM; if (!C || !el) return;
      var now = Date.now();
      if (ev.type === 'touchend') {
        if (el._casoraLt && now - el._casoraLt < 320) {
          el._casoraLt = 0; el._casoraDone = now;
          if (ev.cancelable) ev.preventDefault();
          C.toggleFit(el);
        } else el._casoraLt = now;
        return;
      }
      if (now - (el._casoraDone || 0) < 700) return;
      C.toggleFit(el);
    },
    css2: function () {
      return '\n.cam-back-row { display: flex; margin: -6px 0 -6px; }'
        + '\n.cam-back { display: inline-flex; align-items: center; gap: 2px; min-height: 40px; padding: 0 16px 0 8px; border-radius: 999px; cursor: pointer;'
        + ' pointer-events: auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent;'
        + ' font-family: var(--primary-font-family, system-ui); font-size: 14px; font-weight: 700;'
        + ' background: var(--casora-soft-row-fill, rgba(140,115,90,0.07)); color: var(--casora-popup-tiles-text-primary, #3A322B); }'
        + '\n@media (hover: hover) { .cam-back:hover { background: var(--casora-soft-row-hover, rgba(140,115,90,0.11)); } }'
        + '\n.cam-stream-mount { cursor: zoom-in; }';
    },
  };
})();
