// ── Halten-Schnellmenü (1.6, Entwurf B) ───────────────────────────────────────
// Halten auf eine Casora-Kachel öffnet ein kleines Menü an der Kachel statt gleich das Popup:
// oben die Hauptaktion (Ausschalten, Entriegeln …), darunter Schnellbedienung je Gerät (Helligkeit,
// Lichtfarbe, Jalousie, Temperatur, Wiedergabe), der Zeitschalter („Aus in 30 Min.“, Dienst
// casora.set_timer) und die Wege Popup öffnen · Verlauf · Einstellungen · Kachel bearbeiten.
// Rest der Seite unscharf, die Kachel bleibt scharf; am Handy als Blatt von unten.
// Abgefangen wird button-cards internes „action“-Ereignis (action: hold) einer casora_-Kachel, deren Halten
// bisher ein Popup bzw. HAs Dialog öffnete (button-card macht daraus erst danach ein „hass-action“ mit
// der Halten-Konfiguration); „Popup öffnen“ schickt genau dieses Halten weiter.
//   window._casoraHold.model(stateObj, o) → { main, quick[], timer, rows[] } (ohne DOM, für Tests)
//   window._casoraHold.open(tile, detail)  – Menü zur Kachel öffnen
//   window._casoraHold.close()
(function () {
  if (window._casoraHold) return;
  var H = window._casoraHold = {};
  var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var TIMERS = 'sensor.casora_timers';
  var MINUTES = [[15, '15 Min.'], [30, '30 Min.'], [60, '1 Std.'], [120, '2 Std.']];
  var TOGGLE = /^(light|switch|input_boolean|fan|humidifier)$/;

  // ── Modell: was das Menü für eine Entität zeigt (ohne DOM) ────────────────
  // o: { admin, device, timers (Attribut timers von sensor.casora_timers oder null), unit,
  //      tapPopup (Tippen öffnet schon das Popup – dann keine Zeile „Details“),
  //      printer {st, pause, resume, light, cam} (Kachel 3D-Drucker), aqLight (Licht der Aquarium-Kachel),
  //      states (für Zusatz-Entitäten) }
  // Grundsätze (Nutzerrunde 15.10.): Hauptaktion nur, wenn umkehrbar; Riskantes (Entriegeln, Tür öffnen) immer
  // mit Rückfrage; nur, was das Gerät wirklich kann; ohne Bedienung kein Menü (H.worth) – dann wie Tippen.
  H.model = function (st, o) {
    o = o || {};
    var m = { main: null, quick: [], timer: null, acts: [], rows: [] };
    if (!st) return m;
    var id = st.entity_id, dom = id.split('.')[0], s = String(st.state || ''), a = st.attributes || {};
    var feats = Number(a.supported_features || 0), dead = bad(s), S = o.states || {};
    var svc = function (t, ic, service, data, extra) {
      var x = { t: t, ic: ic, svc: service, data: data || null };
      if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
      return x;
    };
    var pct = function (v) { return v == null ? '' : ' · ' + Math.round(v) + ' %'; };

    if (!dead) {
      if (TOGGLE.test(dom)) {
        m.main = s === 'on' ? svc('Ausschalten', 'mdi:power', 'homeassistant.turn_off') : svc('Einschalten', 'mdi:power', 'homeassistant.turn_on');
      } else if (dom === 'climate') {
        // Ein/Aus nur, wenn das Gerät es kann (TURN_ON 128 / TURN_OFF 256), sonst über den Betriebsmodus.
        var hv = a.hvac_modes || [], onMode = hv.filter(function (x) { return x !== 'off'; })[0];
        if (s === 'off') {
          if (feats & 128) m.main = svc('Einschalten', 'mdi:power', 'climate.turn_on');
          else if (onMode) m.main = svc('Einschalten', 'mdi:power', 'climate.set_hvac_mode', { hvac_mode: hv.indexOf('heat') !== -1 ? 'heat' : onMode });
        } else if (feats & 256) m.main = svc('Ausschalten', 'mdi:power', 'climate.turn_off');
        else if (hv.indexOf('off') !== -1) m.main = svc('Ausschalten', 'mdi:power', 'climate.set_hvac_mode', { hvac_mode: 'off' });
      } else if (dom === 'cover') {
        if ((s === 'open' || s === 'opening') && (feats & 2)) m.main = svc('Schließen', 'mdi:arrow-collapse-down', 'cover.close_cover');
        else if (s !== 'open' && s !== 'opening' && (feats & 1)) m.main = svc('Öffnen', 'mdi:arrow-collapse-up', 'cover.open_cover');
      } else if (dom === 'valve') {
        m.main = (s === 'open' || s === 'opening') ? svc('Schließen', 'mdi:valve-closed', 'valve.close_valve') : svc('Öffnen', 'mdi:valve-open', 'valve.open_valve');
      } else if (dom === 'lock') {
        if (s === 'locked') m.main = svc('Entriegeln', 'mdi:lock-open-variant', 'lock.unlock', null, { ask: 'Wirklich entriegeln?' });
        else if (s === 'unlocked' || s === 'open' || s === 'jammed') m.main = svc('Verriegeln', 'mdi:lock', 'lock.lock');
      } else if (dom === 'media_player') {
        if (s === 'playing' && (feats & 1)) m.main = svc('Pausieren', 'mdi:pause', 'media_player.media_pause');
        else if ((s === 'paused' || s === 'idle' || s === 'on' || s === 'buffering') && (feats & 16384)) m.main = svc('Abspielen', 'mdi:play', 'media_player.media_play');
        else if (feats & 128) m.main = svc('Einschalten', 'mdi:power', 'media_player.turn_on');
      } else if (dom === 'vacuum') {
        if (s === 'cleaning') { if (feats & 16) m.main = svc('Zur Station', 'mdi:home-import-outline', 'vacuum.return_to_base'); }
        else if (feats & 8192) m.main = svc('Starten', 'mdi:play', 'vacuum.start');
      } else if (dom === 'lawn_mower') {
        if (s === 'mowing') { if (feats & 4) m.main = svc('Zur Station', 'mdi:home-import-outline', 'lawn_mower.dock'); }
        else if (feats & 1) m.main = svc('Starten', 'mdi:play', 'lawn_mower.start_mowing');
      }
    }

    // Schnellbedienung; der aktuelle Wert steht an der Überschrift.
    if (!dead) {
      if (dom === 'light') {
        var modes = a.supported_color_modes || [];
        var dim = modes.some(function (x) { return x !== 'onoff'; });
        var cur = s === 'on' && num(a.brightness) != null ? Math.round(num(a.brightness) / 2.55) : null;
        if (dim) {
          m.quick.push({ kind: 'pills', label: 'Helligkeit', value: pct(cur), items: [25, 50, 100].map(function (p) {
            return svc(p + ' %', null, 'light.turn_on', { brightness_pct: p }, { on: cur != null && Math.abs(cur - p) <= 3 });
          }) });
        }
        // Lichtfarbe nur bei eingeschaltetem Licht (aus: kurz halten, Nutzerrunde).
        if (s === 'on' && modes.indexOf('color_temp') !== -1) {
          var kmin = num(a.min_color_temp_kelvin) || 2200, kmax = num(a.max_color_temp_kelvin) || 6500;
          var warm = Math.max(kmin, 2700), cold = Math.min(kmax, 6000), mid = Math.round((warm + cold) / 2 / 100) * 100;
          var k = a.color_mode === 'color_temp' ? num(a.color_temp_kelvin) : null;
          var near = function (x) { return k != null && Math.abs(k - x) <= 150; };
          m.quick.push({ kind: 'pills', label: 'Lichtfarbe', items: [
            svc('Warm', null, 'light.turn_on', { color_temp_kelvin: warm }, { on: near(warm) }),
            svc('Neutral', null, 'light.turn_on', { color_temp_kelvin: mid }, { on: near(mid) }),
            svc('Kalt', null, 'light.turn_on', { color_temp_kelvin: cold }, { on: near(cold) }),
          ] });
        }
      } else if (dom === 'fan') {
        var pc = s === 'on' ? num(a.percentage) : null, fi = [];
        if (feats & 1) fi = [33, 66, 100].map(function (p) {
          return svc(p + ' %', null, 'fan.set_percentage', { percentage: p }, { on: pc != null && !a.preset_mode && Math.abs(pc - p) <= 4 });
        });
        var auto = (a.preset_modes || []).filter(function (x) { return /^auto$/i.test(x); })[0];
        if (auto) fi.push(svc('Auto', null, 'fan.set_preset_mode', { preset_mode: auto }, { on: s === 'on' && a.preset_mode === auto }));
        if (fi.length) m.quick.push({ kind: 'pills', label: 'Stufe', value: a.preset_mode && s === 'on' ? '' : pct(pc), items: fi });
      } else if (dom === 'humidifier' && num(a.humidity) != null) {
        var hu = num(a.humidity), lo = num(a.min_humidity) || 0, hi = num(a.max_humidity) || 100;
        var hs = [40, 50, 60].filter(function (p) { return p >= lo && p <= hi; });
        if (hs.length) m.quick.push({ kind: 'pills', label: 'Zielfeuchte', value: pct(hu), items: hs.map(function (p) {
          return svc(p + ' %', null, 'humidifier.set_humidity', { humidity: p }, { on: Math.abs(hu - p) <= 2 });
        }) });
      } else if (dom === 'cover') {
        var btn = [];
        if (feats & 1) btn.push(svc('Auf', 'mdi:arrow-up', 'cover.open_cover'));
        if (feats & 8) btn.push(svc('Stopp', 'mdi:stop', 'cover.stop_cover'));
        if (feats & 2) btn.push(svc('Zu', 'mdi:arrow-down', 'cover.close_cover'));
        if (btn.length > 1) m.quick.push({ kind: 'buttons', items: btn });
        if (feats & 4) {
          var pos = num(a.current_position);
          m.quick.push({ kind: 'pills', label: 'Position', value: pct(pos), items: [25, 50, 75].map(function (p) {
            return svc(p + ' %', null, 'cover.set_cover_position', { position: p }, { on: pos != null && Math.abs(pos - p) <= 3 });
          }) });
        }
      } else if (dom === 'climate' && num(a.temperature) != null && s !== 'off') {
        var step = num(a.target_temp_step) || (a.temperature_unit === '°F' ? 1 : 0.5);
        m.quick.push({ kind: 'step', label: 'Zieltemperatur', value: o.pendingTemp != null ? o.pendingTemp : num(a.temperature), step: step,
          min: num(a.min_temp), max: num(a.max_temp), unit: (o.unit || '°C'), svc: 'climate.set_temperature' });
      } else if (dom === 'media_player' && s !== 'off' && s !== 'standby') {
        var mb = [];
        if (feats & 16) mb.push(svc('Zurück', 'mdi:skip-previous', 'media_player.media_previous_track'));
        if (feats & 1024 || feats & 4) mb.push(svc('Leiser', 'mdi:volume-minus', 'media_player.volume_down'));
        if (feats & 1024 || feats & 4) mb.push(svc('Lauter', 'mdi:volume-plus', 'media_player.volume_up'));
        if (feats & 32) mb.push(svc('Weiter', 'mdi:skip-next', 'media_player.media_next_track'));
        if (mb.length) m.quick.push({ kind: 'buttons', items: mb });
      } else if (dom === 'vacuum' && s === 'cleaning' && (feats & 4)) {
        m.quick.push({ kind: 'buttons', items: [svc('Pause', 'mdi:pause', 'vacuum.pause', null, { wide: true })] });
      } else if (dom === 'lawn_mower' && s === 'mowing' && (feats & 2)) {
        m.quick.push({ kind: 'buttons', items: [svc('Pause', 'mdi:pause', 'lawn_mower.pause', null, { wide: true })] });
      }
    }

    // Alarm: scharf je Modus, unscharf als Hauptaktion – immer mit Rückfrage, Code verdeckt, wenn Alarmo einen verlangt.
    // Die Warnung „Fenster offen“ beim Scharfschalten kommt zusätzlich aus casora-core (hängt am Dienstaufruf).
    if (dom === 'alarm_control_panel' && !dead) {
      var af = typeof a.supported_features === 'number' ? a.supported_features : 63;
      var cn = a.code_format === 'number', needArm = !!a.code_format && a.code_arm_required !== false, needDis = !!a.code_format;
      if (s === 'disarmed') {
        var ab = [['Zuhause', 'mdi:shield-home-outline', 'alarm_arm_home', 1], ['Abwesend', 'mdi:shield-lock-outline', 'alarm_arm_away', 2],
          ['Nacht', 'mdi:shield-moon-outline', 'alarm_arm_night', 4]].filter(function (x) { return af & x[3]; }).map(function (x) {
          return svc(x[0], x[1], 'alarm_control_panel.' + x[2], null, { wide: true, ask: 'Alarm scharf schalten?', yes: 'Scharf schalten', mode: x[0], code: needArm, numeric: cn });
        });
        if (ab.length) m.quick.push({ kind: 'buttons', label: 'Scharf schalten', items: ab });
      } else if (/^(armed_|arming|pending|triggered)/.test(s)) {
        m.main = svc(s === 'triggered' ? 'Alarm beenden' : 'Unscharf schalten', 'mdi:shield-off-outline', 'alarm_control_panel.alarm_disarm', null,
          { ask: 'Alarm unscharf schalten?', yes: 'Unscharf schalten', code: needDis, numeric: cn });
      }
    }

    // 3D-Drucker: Pause/Fortsetzen (Tasten der Integration) und Bauraumlicht – nur, was es gibt. Kein Abbrechen.
    var P = o.printer;
    if (P) {
      var ps = String(((S[P.st] || st).state) || '').toLowerCase();
      var pb = [];
      if (/^(pause|paused)$/.test(ps) && P.resume && S[P.resume]) pb.push(svc('Fortsetzen', 'mdi:play', 'button.press', null, { entity: P.resume, wide: true }));
      else if (/^(running|printing|print)$/.test(ps) && P.pause && S[P.pause]) pb.push(svc('Pause', 'mdi:pause', 'button.press', null, { entity: P.pause, wide: true }));
      if (P.light && S[P.light] && !bad(S[P.light].state)) {
        pb.push(svc('Licht', 'mdi:lightbulb-outline', 'light.toggle', null, { entity: P.light, wide: true, on: S[P.light].state === 'on' }));
      }
      if (pb.length) m.quick.push({ kind: 'buttons', items: pb });
      if (P.cam && S[P.cam]) m.acts.push({ key: 'live', t: 'Kamera live', ic: 'mdi:cctv', entity: P.cam });
    }
    // Aquarium: Licht des Beckens an/aus.
    var L = o.aqLight && S[o.aqLight];
    if (L && !bad(L.state) && /^(light|switch)\./.test(o.aqLight)) {
      m.quick.push({ kind: 'buttons', items: [svc('Licht', 'mdi:lightbulb-outline', 'homeassistant.toggle', null, { entity: o.aqLight, wide: true, on: L.state === 'on' })] });
    }
    // Kamera: groß und live.
    if (dom === 'camera' && !dead) m.acts.push({ key: 'live', t: 'Live ansehen', ic: 'mdi:cctv', entity: id });
    // Schloss: Tür öffnen abgesetzt unter der Bedienung, immer mit Rückfrage.
    if (dom === 'lock' && !dead && (feats & 1) && !/ing$/.test(s)) {
      m.acts.push({ key: 'act', t: 'Tür öffnen', ic: 'mdi:door-open', svc: 'lock.open', ask: 'Wirklich die Tür öffnen?', yes: 'Tür öffnen' });
    }

    // Zeitschalter: nur mit Casoras Dienst (sensor.casora_timers) und für Schaltbares.
    var timerOk = o.timers && !dead && (TOGGLE.test(dom) || (dom === 'climate' && (feats & 256)) || (dom === 'media_player' && (feats & 256)));
    if (timerOk) {
      var on = dom === 'climate' ? s !== 'off' : dom === 'media_player' ? !(s === 'off' || s === 'standby') : s === 'on';
      var run = o.timers[id];
      if (run && run.at) {
        var at = new Date(run.at);
        if (!isNaN(at)) m.timer = { active: true, at: at.getTime(), action: run.action || 'turn_off',
          word: run.action === 'turn_on' ? 'An um' : 'Aus um', time: two(at.getHours()) + ':' + two(at.getMinutes()) };
      }
      if (!m.timer && (on || dom !== 'media_player')) {
        m.timer = { active: false, mode: on ? 'off' : 'on', label: on ? 'Ausschalten in' : 'Einschalten für',
          items: MINUTES.map(function (x) { return { t: x[1], min: x[0] }; }) };
      }
    }

    // Wege: „Details“ nur, wenn Tippen nicht schon das Popup öffnet; Gerät und Bearbeiten nur für Admins.
    if (!o.tapPopup) m.rows.push({ key: 'popup', t: 'Details', ic: 'mdi:card-text-outline' });
    if (dom !== 'camera') m.rows.push({ key: 'history', t: 'Verlauf', ic: 'mdi:history' });
    if (o.device && o.admin) m.rows.push({ key: 'device', t: 'Gerät', ic: 'mdi:tune-variant' });
    if (o.admin) m.rows.push({ key: 'edit', t: 'Kachel bearbeiten', ic: 'mdi:pencil-outline', sep: true });
    return m;
  };
  // Lohnt ein Menü? Nur mit etwas zu bedienen – sonst tut Halten dasselbe wie Tippen.
  H.worth = function (m) { return !!(m && (m.main || m.quick.length || m.timer || m.acts.length)); };

  // Zieltemperatur einen Schritt weiter, in den Grenzen des Geräts.
  H.stepTo = function (q, dir) {
    var v = Math.round((q.value + dir * q.step) * 100) / 100;
    if (q.min != null && v < q.min) v = q.min;
    if (q.max != null && v > q.max) v = q.max;
    return v;
  };
  H.fmtTemp = function (v, unit) {
    var s = (Math.round(v * 10) / 10).toLocaleString(window.casoraLocale ? window.casoraLocale() : undefined, { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 1 });
    return s + ' ' + (unit || '°C');
  };

  // ── Darstellung ───────────────────────────────────────────────────────────
  var CSS = ':host{position:fixed;inset:0;z-index:1000;font-family:var(--primary-font-family, system-ui, sans-serif);-webkit-tap-highlight-color:transparent;}'
    /* Schleier: unscharf, Loch an der Kachel (Maske), damit sie scharf und live bleibt. */
    + '.veil{position:fixed;inset:0;background:var(--casora-hold-veil, rgba(30,22,14,0.16));-webkit-backdrop-filter:blur(var(--casora-hold-blur, 14px));backdrop-filter:blur(var(--casora-hold-blur, 14px));'
    +   '-webkit-mask-size:100% 100%;mask-size:100% 100%;opacity:0;transition:opacity var(--casora-dur-enter, .32s) var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1));}'
    + ':host(.open) .veil{opacity:1;}'
    + '.lift{position:fixed;pointer-events:none;box-shadow:var(--casora-shadow-float, 0 18px 44px -14px rgba(60,40,20,0.35));opacity:0;transition:opacity var(--casora-dur-enter, .32s) ease;}'
    + ':host(.open) .lift{opacity:1;}'
    + '.pane{position:fixed;box-sizing:border-box;width:288px;max-width:calc(100vw - 32px);overflow:auto;overscroll-behavior:contain;'
    +   'padding:var(--casora-menu-pad, 8px);border-radius:var(--casora-menu-radius, 34px);'
    +   'background:var(--casora-menu-pane, var(--ha-card-background, var(--card-background-color, rgba(251,248,243,0.96))));-webkit-backdrop-filter:blur(24px) saturate(1.2);backdrop-filter:blur(24px) saturate(1.2);'
    +   'box-shadow:var(--casora-window-shadow, 0 18px 44px -14px rgba(60,40,20,0.35));color:var(--casora-menu-fg, var(--primary-text-color, rgba(46,39,33,0.95)));'
    +   'opacity:0;transform:scale(.96);transition:transform var(--casora-dur-enter, .32s) var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1)), opacity .18s ease;}'
    + ':host(.open) .pane{opacity:1;transform:none;}'
    + '@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.pane{background:var(--casora-menu-pane-webkit, var(--casora-menu-pane, rgb(248,244,237)));}}'
    /* Handy: schwebend über der Leiste wie das Räume-/Szenen-Blatt (04-navigation.js), ringsum rund. */
    + '.pane.sheet{left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom, 0px) * 0.4);width:auto;max-width:420px;margin:0 auto;'
    +   'max-height:min(520px, calc(100vh - 150px));max-height:min(520px, calc(100dvh - 150px));transform:translateY(10px) scale(.98);transform-origin:50% 100%;}'
    /* Zeilen wie die übrigen Casora-Menüs: Kreis 36 | Text, 52 hoch, Pille 26. */
    + '.row{display:grid;grid-template-columns:var(--casora-ic-row, 36px) minmax(0,1fr) auto;align-items:center;column-gap:var(--casora-menu-ic-gap, 12px);'
    +   'height:var(--casora-menu-row-h, 52px);padding:var(--casora-menu-row-pad, 0 16px 0 8px);box-sizing:border-box;border-radius:var(--casora-menu-row-radius, 26px);'
    +   'font-size:var(--casora-fs-row, 15px);font-weight:var(--casora-menu-item-weight, 600);letter-spacing:-0.01em;line-height:20px;cursor:pointer;user-select:none;outline:none;'
    +   'transition:transform var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease), background-color var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease);}'
    + '.row > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.row small{font-size:var(--casora-fs-sub, 13px);font-weight:500;color:var(--casora-text-2, rgba(127,127,127,.9));}'
    + '@media (hover:hover){.row:hover{background:var(--casora-menu-hover, rgba(140,115,90,0.08));}}'
    + '.row:focus-visible{box-shadow:inset 0 0 0 2px var(--casora-hold-hue, var(--primary-color, #B67A50));}'
    + '.row:active,.row.press{transform:scale(var(--casora-press-scale, .97));background:var(--casora-mnav-press-fill, rgba(127,127,127,0.16));}'
    + '.ic{width:var(--casora-ic-row, 36px);height:var(--casora-ic-row, 36px);border-radius:50%;display:flex;align-items:center;justify-content:center;'
    +   'background:var(--casora-icon-circle-bg, rgba(140,115,90,0.12));color:var(--casora-popup-tiles-text-primary, currentColor);}'
    + '.ic ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
    + '.row.main{background:var(--casora-soft-row-active, rgba(127,127,127,0.10));box-shadow:var(--casora-soft-row-active-shadow, none);}'
    + '.row.main .ic{background:var(--casora-hold-hue, var(--casora-color-teal, #4E9E95));color:var(--casora-soft-glyph, #fff);}'
    + '.sep{height:1px;margin:8px;background:var(--casora-popup-divider, rgba(120,100,80,0.10));}'
    /* Schnellbedienung: Pillen wie die Zeitraum-Pillen der Messwert-Seite, gewählt = Segment-Fläche. */
    /* Etiketten fluchten mit Kreisen/Pillen (wie die Gruppenüberschriften im Szenen-Menü), 4er-Raster. */
    + '.q{padding:8px;}'
    + '.ql{font-size:var(--casora-fs-sub, 13px);line-height:16px;font-weight:600;color:var(--casora-text-2, rgba(127,127,127,.9));padding:0 0 8px;letter-spacing:-0.01em;}'
    + '.qr{display:flex;gap:8px;}'
    + '.qr .pill{padding:0 4px;}'
    + '.pill{flex:1 1 0;min-width:0;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box;padding:0 8px;'
    +   'background:var(--casora-soft-control-fill, rgba(127,127,127,0.14));font-size:var(--casora-fs-value, 14px);font-weight:650;white-space:nowrap;cursor:pointer;user-select:none;outline:none;'
    +   'font-variant-numeric:tabular-nums;transition:transform var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease), background-color var(--casora-dur-feedback, .16s) ease;}'
    + '.pill ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
    + '.pill:active,.pill.press{transform:scale(var(--casora-press-scale, .97));}'
    + '.pill:focus-visible{box-shadow:inset 0 0 0 2px var(--casora-hold-hue, var(--primary-color, #B67A50));}'
    + '.pill.on{background:var(--casora-soft-seg-on, var(--primary-color, #B67A50));box-shadow:var(--casora-soft-seg-on-shadow, none);color:var(--casora-soft-seg-on-ink, var(--text-primary-color, #fff));}'
    + '.pill.busy{opacity:.55;pointer-events:none;}'
    + '.step{display:flex;align-items:center;gap:8px;}'
    + '.step .pill{flex:0 0 48px;}'
    + '.step b{flex:1;text-align:center;font-size:var(--casora-fs-heading, 17px);font-weight:700;font-variant-numeric:tabular-nums;}'
    + '.tm{display:flex;align-items:center;gap:8px;}'
    + '.tm .pill{flex:0 0 auto;padding:0 16px;}'
    + '.tm > ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;margin-left:10px;color:var(--casora-hold-hue, currentColor);}'
    + '.row.quiet{color:var(--casora-text-2, inherit);font-weight:500;}'
    + '.row.quiet .ic{color:var(--casora-text-2, inherit);}'
    + '.tm span{flex:1;font-size:var(--casora-fs-row, 15px);font-weight:600;padding-left:8px;}';

  var host = null, cur = null, poll = 0;

  var isPhone = function () {
    return window.matchMedia('(max-width: 767px), (max-height: 500px)').matches;
  };
  var hueOf = function (tile) {
    try { return window._casoraRingHue ? window._casoraRingHue(tile) : null; } catch (e) { return null; }
  };
  var cardRadius = function (tile) {
    var c = tile && tile.shadowRoot && tile.shadowRoot.querySelector('ha-card');
    var r = c ? parseFloat(getComputedStyle(c).borderTopLeftRadius) : NaN;
    return isFinite(r) ? r : 32;
  };
  var tileText = function (tile, sel) {
    var n = tile && tile.shadowRoot && tile.shadowRoot.querySelector(sel);
    return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : '';
  };
  // Maske: ganze Fläche sichtbar, abgerundetes Loch an der Kachel.
  var holeMask = function (r, rad) {
    var W = window.innerWidth, Hh = window.innerHeight;
    var x = Math.max(0, r.left), y = Math.max(0, r.top), w = Math.min(W, r.right) - x, h = Math.min(Hh, r.bottom) - y;
    rad = Math.min(rad, w / 2, h / 2);
    var d = 'M0 0H' + W + 'V' + Hh + 'H0Z'
      + 'M' + (x + rad) + ' ' + y + 'h' + (w - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' ' + rad
      + 'v' + (h - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + (-rad) + ' ' + rad
      + 'h' + (-(w - 2 * rad)) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + (-rad) + ' ' + (-rad)
      + 'v' + (-(h - 2 * rad)) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' ' + (-rad) + 'Z';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none">'
      + '<path fill="#fff" fill-rule="evenodd" d="' + d + '"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  };

  var html = function (m, c) {
    var out = '';
    var row = function (key, t, ic, cls, sub, i) {
      return '<div class="row' + (cls ? ' ' + cls : '') + '" role="menuitem" tabindex="-1" data-k="' + esc(key) + '"' + (i != null ? ' data-i="' + i + '"' : '') + '>'
        + '<div class="ic"><ha-icon icon="' + esc(ic) + '"></ha-icon></div><span>' + esc(T(t)) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    };
    // Handy: kein Kopf – Name und Zustand stehen schon scharf auf der Kachel darüber.
    if (m.main) out += row('main', m.main.t, m.main.ic, 'main');
    m.quick.forEach(function (q, qi) {
      out += '<div class="q">' + (q.label ? '<div class="ql">' + esc(T(q.label)) + esc(q.value || '') + '</div>' : '');
      if (q.kind === 'step') {
        out += '<div class="step"><div class="pill" role="button" tabindex="-1" aria-label="' + esc(T('Kälter')) + '" data-k="step" data-q="' + qi + '" data-d="-1"><ha-icon icon="mdi:minus"></ha-icon></div>'
          + '<b>' + esc(H.fmtTemp(q.value, q.unit)) + '</b>'
          + '<div class="pill" role="button" tabindex="-1" aria-label="' + esc(T('Wärmer')) + '" data-k="step" data-q="' + qi + '" data-d="1"><ha-icon icon="mdi:plus"></ha-icon></div></div>';
      } else {
        out += '<div class="qr">' + q.items.map(function (it, ii) {
          var label = it.ic && !it.wide ? '<ha-icon icon="' + esc(it.ic) + '"></ha-icon>' : (it.ic ? '<ha-icon icon="' + esc(it.ic) + '"></ha-icon>' : '') + esc(T(it.t));
          return '<div class="pill' + (it.on ? ' on' : '') + '" role="button" tabindex="-1" aria-label="' + esc(T(it.t)) + '"'
            + (it.on ? ' aria-pressed="true"' : '') + ' data-k="quick" data-q="' + qi + '" data-i="' + ii + '">' + label + '</div>';
        }).join('') + '</div>';
      }
      out += '</div>';
    });
    if (m.timer) {
      out += '<div class="q">';
      if (m.timer.active) {
        out += '<div class="tm"><ha-icon icon="mdi:timer-outline"></ha-icon><span>' + esc(T(m.timer.word) + ' ' + m.timer.time) + '</span>'
          + '<div class="pill" role="button" tabindex="-1" data-k="tcancel">' + esc(T('Abbrechen')) + '</div></div>';
      } else {
        out += '<div class="ql">' + esc(T(m.timer.label)) + '</div><div class="qr">' + m.timer.items.map(function (x, i) {
          return '<div class="pill" role="button" tabindex="-1" data-k="timer" data-i="' + i + '">' + esc(T(x.t)) + '</div>';
        }).join('') + '</div>';
      }
      out += '</div>';
    }
    // Wenige Linien wie in den übrigen Menüs: Bedienung | abgesetzte Aktionen und Wege | Bearbeiten.
    var blocks = [out, '', ''];
    m.acts.forEach(function (x, i) { blocks[1] += row(x.key, x.t, x.ic, x.ask ? 'quiet' : '', null, i); });
    m.rows.forEach(function (r) { blocks[r.key === 'edit' ? 2 : 1] += row(r.key, r.t, r.ic); });
    out = blocks.filter(Boolean).join('<div class="sep"></div>');
    return out;
  };

  var place = function (pane, r, phone) {
    if (phone) return;
    var W = window.innerWidth, Hh = window.innerHeight, gap = 12, edge = 16;
    var pw = pane.offsetWidth, ph = pane.offsetHeight;
    var left, top, origin;
    if (r.right + gap + pw <= W - edge) { left = r.right + gap; origin = 'left top'; }
    else if (r.left - gap - pw >= edge) { left = r.left - gap - pw; origin = 'right top'; }
    else { left = Math.min(Math.max(edge, r.left), W - edge - pw); origin = 'center top'; }
    if (origin === 'center top') {
      top = r.bottom + gap;
      if (top + ph > Hh - edge) { top = Math.max(edge, r.top - gap - ph); origin = 'center bottom'; }
    } else {
      // Oben bündig zur Kachel; passt das nicht, unten bündig – erst dann an den Bildschirmrand.
      top = r.top + ph > Hh - edge ? r.bottom - ph : r.top;
      top = Math.min(Math.max(edge, top), Math.max(edge, Hh - edge - ph));
    }
    pane.style.left = Math.round(left) + 'px';
    pane.style.top = Math.round(top) + 'px';
    pane.style.maxHeight = (Hh - 2 * edge) + 'px';
    pane.style.transformOrigin = origin;
  };

  var SWITCHY = /\.(turn_on|turn_off|toggle|open_cover|close_cover|lock|open_valve|close_valve)$/;
  // Fehlgeschlagener Dienst: kurzer HA-Hinweis statt stiller Ablehnung.
  var failed = function (e) {
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: T('Hat nicht geklappt') + (e && e.message ? ': ' + e.message : '') };
    ha.dispatchEvent(ev);
  };
  var call = function (service, data) {
    var h = hassNow();
    if (!h) return Promise.resolve();
    var p = service.split('.');
    return h.callService(p[0], p[1], data);
  };
  // Schalten wie in den Popups: mit Rückfrage, wenn das Gerät im Studio so eingestellt ist.
  var act = function (id, it) {
    var go = function () { return call(it.svc, Object.assign({ entity_id: it.entity || id }, it.data || {})).catch(failed); };
    // Riskantes (Entriegeln, Tür öffnen) fragt immer – unabhängig von der Studio-Einstellung.
    if (it.ask) {
      var name = (cur ? cur.name : id) + (it.mode ? ' · ' + T(it.mode) : ''), q = T(it.ask);
      // Alarm mit Code: Code im selben Dialog, verdeckt; leer = abbrechen.
      if (it.code && window.casoraAsk) {
        return window.casoraAsk({ title: name, text: q, yes: T(it.yes || it.t), input: { placeholder: 'Code', secret: true, numeric: !!it.numeric } })
          .then(function (code) {
            if (!code) return null;
            return call(it.svc, Object.assign({ entity_id: it.entity || id, code: String(code) }, it.data || {})).catch(failed);
          });
      }
      var w = window.casoraAsk ? window.casoraAsk({ title: name, text: q, yes: T(it.yes || it.t) }) : Promise.resolve(window.confirm(q));
      return w.then(function (ok) { return ok ? go() : null; });
    }
    // Rückfrage nach Studio-Einstellung nur fürs reine Schalten (nicht Helligkeit, Position, Stopp) – für das Gerät, das geschaltet wird.
    var ask = !it.data && SWITCHY.test(it.svc) && window.casoraConfirmSwitch;
    var ok = ask ? window.casoraConfirmSwitch(it.entity || id, it.svc) : true;
    return Promise.resolve(ok).then(function (yes) { return yes ? go() : null; });
  };

  var ENT = /^[a-z_]+\.[a-z0-9_]+$/;
  var modelFor = function (h, id, tile) {
    var e = ((h.entities || {})[id]) || {};
    var ts = h.states[TIMERS];
    var cfg = (tile && tile._config) || {}, tpl = [].concat(cfg.template || []).join(' '), V = cfg.variables || {};
    var o = {
      admin: window.casoraIsAdmin ? window.casoraIsAdmin() : !!(h.user && h.user.is_admin),
      device: !!e.device_id,
      timers: ts ? ((ts.attributes || {}).timers || {}) : null,
      unit: (h.config && h.config.unit_system && h.config.unit_system.temperature) || '°C',
      tapPopup: popupish(cfg.tap_action),
      states: h.states,
      pendingTemp: cur && cur.id === id && cur.stepT ? cur.pendingTemp : null,
    };
    // Kachel-eigene Geräte: Drucker über seinen Finder (02-geraete.js), Aquarium über die Kachel-Variable.
    if (/\bcasora_3d_printer\b/.test(tpl) && window._casoraPrint && window._casoraPrint.auto) {
      var c = null;
      try { c = window._casoraPrint.auto(h.states[id], h); } catch (x) { c = null; }
      if (c) o.printer = { st: c.st, pause: c.pause, resume: c.resume, light: c.light, cam: c.cam };
    }
    if (/\bcasora_aquarium/.test(tpl) && typeof V.light_entity === 'string' && ENT.test(V.light_entity)) o.aqLight = V.light_entity;
    return H.model(h.states[id], o);
  };

  var paint = function () {
    if (!cur) return;
    var h = hassNow();
    if (!h || !h.states[cur.id]) return H.close();
    cur.st = h.states[cur.id];
    cur.ts = h.states[TIMERS];
    cur.m = modelFor(h, cur.id, cur.tile);
    var pane = host.shadowRoot.querySelector('.pane');
    var focused = host.shadowRoot.activeElement;
    var fk = focused && focused.getAttribute('data-k') ? [focused.getAttribute('data-k'), focused.getAttribute('data-q'), focused.getAttribute('data-i'), focused.getAttribute('data-d')].join('|') : '';
    cur.state = tileText(cur.tile, '#state') || tileText(cur.tile, '#label');
    pane.innerHTML = html(cur.m, cur);
    if (fk) {
      var again = [].slice.call(pane.querySelectorAll('[data-k]')).find(function (n) {
        return [n.getAttribute('data-k'), n.getAttribute('data-q'), n.getAttribute('data-i'), n.getAttribute('data-d')].join('|') === fk;
      });
      if (again) again.focus();
    }
  };

  var navigate = function (url) {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  };

  var choose = function (n) {
    if (!cur || !n) return;
    var k = n.getAttribute('data-k'), id = cur.id, m = cur.m, Z = window._casoraZiele;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    if (k === 'main' && m.main) { var it = m.main; H.close(); act(id, it); return; }
    if (k === 'quick') {
      var q = m.quick[+n.getAttribute('data-q')], x = q && q.items[+n.getAttribute('data-i')];
      if (!x) return;
      if (x.ask) { H.close(); act(id, x); return; }
      // Sofort sichtbar: gewählte Pille markieren, bis der neue Zustand kommt.
      if (q.kind === 'pills') [].forEach.call(n.parentNode.children, function (p) { p.classList.toggle('on', p === n); });
      n.classList.add('busy');
      act(id, x).then(paint, paint);
      return;
    }
    if (k === 'step') {
      var sq = m.quick[+n.getAttribute('data-q')];
      if (!sq) return;
      var v = H.stepTo(sq, +n.getAttribute('data-d'));
      sq.value = v;
      var b = n.parentNode.querySelector('b');
      if (b) b.textContent = H.fmtTemp(v, sq.unit);
      // Mehrere Tipps sammeln, dann einmal setzen.
      // Mehrere Tipps sammeln (auch über Neuzeichnen hinweg, pendingTemp), dann einmal setzen.
      cur.pendingTemp = v;
      clearTimeout(cur.stepT);
      var me = cur;
      cur.stepT = setTimeout(function () { me.stepT = 0; call(sq.svc, { entity_id: id, temperature: v }).catch(failed); }, 450);
      return;
    }
    if (k === 'timer' && m.timer) {
      var mins = m.timer.items[+n.getAttribute('data-i')].min, mode = m.timer.mode;
      H.close();
      var start = mode === 'on' ? act(id, { svc: id.split('.')[0] === 'climate' ? 'climate.turn_on' : 'homeassistant.turn_on' }) : Promise.resolve(true);
      start.then(function (r) {
        if (r === null) return;
        call('casora.set_timer', { entity_id: id, minutes: mins, action: 'turn_off' }).catch(failed);
      });
      return;
    }
    if (k === 'act' || k === 'live') {
      var ax = m.acts[+n.getAttribute('data-i')];
      H.close();
      if (!ax) return;
      if (k === 'live') { if (!(Z && Z.openCamera(ax.entity)) && window.casoraPopup) window.casoraPopup.nativeMoreInfo(ax.entity); return; }
      act(id, ax);
      return;
    }
    if (k === 'tcancel') { n.classList.add('busy'); call('casora.cancel_timer', { entity_id: id }).catch(failed).then(paint); return; }
    var tile = cur.tile, detail = cur.detail;
    H.close();
    if (k === 'popup' && detail && detail.via === 'tap') {
      // Halten schaltete bisher (Jalousie), Tippen öffnet das Popup: das Casora-Popup der Kachel ohne zu schalten.
      if (!(Z && Z.openDeviceTile(id))) tile.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: id } }));
      return;
    }
    if (k === 'popup') {
      // Das ursprüngliche Halten weiterreichen (öffnet das Popup wie bisher), Kachel als Quelle für den Ring.
      window._casoraLastTile = { el: tile, at: Date.now() };
      ((detail && detail.src) || tile).dispatchEvent(new CustomEvent('action', { bubbles: true, composed: true,
        detail: { action: (detail && detail.via) || 'hold', casoraHoldPass: true } }));
      return;
    }
    if (k === 'history') { if (!(Z && Z.openMeasure(id, '24h', null))) navigate('/history?entity_id=' + encodeURIComponent(id)); return; }
    if (k === 'device') { if (!(Z && Z.openDevice(id, null)) && window.casoraPopup) window.casoraPopup.nativeMoreInfo(id); return; }
    if (k === 'edit') {
      var seg = (window.location.pathname || '').split('/').filter(Boolean);
      var dash = (seg[0] || '').replace(/[-_]mobile$/i, '');
      navigate('/casora-studio' + (seg[1] && !/^cat-/.test(seg[1]) ? '/' + encodeURIComponent(seg[1]) : '')
        + '?' + (dash ? 'dash=' + encodeURIComponent(dash) + '&' : '') + 'tile=' + encodeURIComponent(id));
    }
  };

  var onKey = function (ev) {
    if (!cur) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); H.close(true); return; }
    var all = [].slice.call(host.shadowRoot.querySelectorAll('.row, .pill'));
    var i = all.indexOf(host.shadowRoot.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Tab') {
      ev.preventDefault();
      var dir = ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey) ? -1 : 1;
      var nx = all[(i + dir + all.length) % all.length] || all[0];
      if (nx) nx.focus();
    } else if ((ev.key === 'Enter' || ev.key === ' ') && i >= 0) {
      ev.preventDefault();
      choose(all[i]);
    }
  };

  H.close = function (refocus) {
    if (!host || !cur) return;
    var was = cur;
    cur = null;
    clearInterval(poll);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('popstate', onNav, true);
    window.removeEventListener('location-changed', onNav, true);
    host.classList.remove('open');
    var h0 = host;
    setTimeout(function () { if (!cur && h0.parentNode) h0.parentNode.removeChild(h0); }, 340);
    if (refocus && was.tile && was.tile.focus) { try { was.tile.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
  };
  // Adressleiste am Handy (wenige px) schließt nicht; Drehen/Fenstergröße schon. Zurück/Seitenwechsel schließt.
  var onResize = function () {
    if (cur && (Math.abs(window.innerWidth - cur.vw) > 40 || Math.abs(window.innerHeight - cur.vh) > 120)) H.close();
  };
  var onNav = function () { H.close(); };
  var onScroll = function (ev) {
    if (!cur || (ev.target && ev.target.nodeType === 1 && host.contains(ev.target))) return;
    H.close();
  };

  H.open = function (tile, detail) {
    var h = hassNow();
    var id = (tile._stateObj && tile._stateObj.entity_id) || (tile._config && tile._config.entity);
    if (!h || !id || !h.states[id]) return false;
    if (cur) H.close();
    // Jedes Mal ein frisches Element: keine doppelten Klick-Zuhörer aus früheren Öffnungen.
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = document.createElement('casora-hold-menu');
    host.attachShadow({ mode: 'open' });
    var phone = isPhone();
    var r = tile.getBoundingClientRect(), rad = cardRadius(tile);
    var name = tileText(tile, '#name') || (h.states[id].attributes || {}).friendly_name || id;
    cur = { tile: tile, detail: detail, id: id, phone: phone, name: name, armed: false, opened: Date.now() };
    host.shadowRoot.innerHTML = '<style>' + CSS + '</style><div class="veil"></div><div class="lift"></div>'
      + '<div class="pane' + (phone ? ' sheet' : '') + '" role="menu" aria-label="' + esc(name) + '"></div>';
    var hue = hueOf(tile);
    if (hue) host.style.setProperty('--casora-hold-hue', hue); else host.style.removeProperty('--casora-hold-hue');
    var veil = host.shadowRoot.querySelector('.veil'), lift = host.shadowRoot.querySelector('.lift');
    var mask = holeMask(r, rad);
    veil.style.webkitMaskImage = mask; veil.style.maskImage = mask;
    lift.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + rad + 'px;';
    document.body.appendChild(host);
    paint();
    var pane = host.shadowRoot.querySelector('.pane');
    place(pane, r, phone);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (cur) host.classList.add('open'); }); });

    // button-card meldet Halten erst beim Loslassen – nur kurz sperren, falls danach noch ein Klick nachkommt.
    setTimeout(function () { if (cur) cur.armed = true; }, 150);

    host.shadowRoot.addEventListener('click', function (ev) {
      if (!cur) return;
      ev.stopPropagation();
      var p = ev.composedPath(), n = null;
      for (var i = 0; i < p.length; i++) { if (p[i].getAttribute && p[i].getAttribute('data-k')) { n = p[i]; break; } if (p[i] === pane) break; }
      if (!cur.armed) return;
      if (n) choose(n);
      else if (p.indexOf(pane) === -1) H.close(true);
    });
    host.shadowRoot.addEventListener('pointerdown', function (ev) {
      var t = ev.composedPath().find(function (x) { return x.classList && (x.classList.contains('row') || x.classList.contains('pill')); });
      if (t) { t.classList.add('press'); var off = function () { t.classList.remove('press'); }; setTimeout(off, 260); }
    });
    document.addEventListener('keydown', onKey, true);
    cur.vw = window.innerWidth; cur.vh = window.innerHeight;
    window.addEventListener('resize', onResize, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('popstate', onNav, true);
    window.addEventListener('location-changed', onNav, true);
    // Zustand live nachziehen (Schalten aus dem Menü, Zeitschalter).
    var last = h.states[id], lastT = h.states[TIMERS];
    poll = setInterval(function () {
      var hh = hassNow();
      if (!cur || !hh) return;
      if (hh.states[id] !== last || hh.states[TIMERS] !== lastT) { last = hh.states[id]; lastT = hh.states[TIMERS]; paint(); }
    }, 250);
    // Kein Fokus beim Öffnen (Halten kommt von Maus/Finger, ein Fokusring wirkte wie ein Fehler);
    // Pfeiltasten/Tab springen auf die erste Zeile.
    return true;
  };

  // ── Halten abfangen ───────────────────────────────────────────────────────
  var casoraTile = function (path) {
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!n || !n.tagName) continue;
      if (n.tagName === 'CASORA-POPUP') return null;
      if (n.tagName === 'BUTTON-CARD') {
        var tp = [].concat((n._config && n._config.template) || []);
        return tp.some(function (x) { return /^casora_/.test(String(x)); }) ? n : null;
      }
    }
    return null;
  };
  // Rohe Kachel-Konfiguration: Popup-Aktion (auch als Ausdruck über casoraPopupAction) oder HAs Dialog.
  var popupish = function (x) {
    var a = x && x.action;
    if (typeof a !== 'string') return false;
    if (/\[\[\[/.test(a)) return /casoraPopupAction|more-info/.test(a);
    return a === 'more-info' || a === 'fire-dom-event';
  };
  // Menü, wenn Halten bisher ein Popup öffnete – oder schaltete (Jalousie) und Tippen das Popup öffnet;
  // das Schalten steht dann als Hauptaktion im Menü. Rückgabe: welche Aktion „Popup öffnen“ auslöst.
  H.via = function (cfg) {
    if (!cfg) return null;
    if (popupish(cfg.hold_action)) return 'hold';
    if (cfg.hold_action && cfg.hold_action.action === 'toggle' && popupish(cfg.tap_action)) return 'tap';
    return null;
  };
  H.wants = function (cfg) { return !!H.via(cfg); };
  // Ohne Menü: Raum, Szenenzeile, eigene Karte, Kachel mit eigenen Knöpfen (Halten würde gegen die Kachel arbeiten).
  var NO_MENU = /^casora_(room|scene_row|custom|entity_actions)$/;
  window.addEventListener('action', function (ev) {
    var d = ev.detail || {};
    if (d.action !== 'hold' || d.casoraHoldPass || window.CASORA_HOLD_MENU === false) return;
    if (!(window.casoraPopup && window.casoraPopup.enabled)) return;
    if (/^\/casora-studio/.test(location.pathname)) return;
    var path = (ev.composedPath && ev.composedPath()) || [];
    var tile = casoraTile(path);
    if (!tile || [].concat(tile._config.template || []).some(function (x) { return NO_MENU.test(String(x)); })) return;
    var h = hassNow(), id = (tile._stateObj && tile._stateObj.entity_id) || '', cfg = tile._config;
    // Nur Halten, das bisher ein Popup/HAs Dialog war (bzw. Jalousie) – eigene Halten-Aktionen (Licht-Badge: Smart-Toggle) bleiben.
    if (!h || !id || !h.states[id] || !H.wants(cfg)) return;
    if (H.worth(modelFor(h, id, tile))) {
      if (H.open(tile, { src: path[0], via: H.via(cfg) })) { ev.stopPropagation(); ev.stopImmediatePropagation(); }
      return;
    }
    // Nichts zu bedienen (Info-Kacheln): Halten tut dasselbe wie Tippen, wenn Tippen das Popup öffnet.
    if (popupish(cfg.tap_action)) {
      ev.stopPropagation(); ev.stopImmediatePropagation();
      window._casoraLastTile = { el: tile, at: Date.now() };
      path[0].dispatchEvent(new CustomEvent('action', { bubbles: true, composed: true, detail: { action: 'tap', casoraHoldPass: true } }));
    }
  }, true);
})();
