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
  var T = function (x) { return typeof window.casoraTr === 'function' ? window.casoraTr(x) : x; };
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
    var m = { main: null, quick: [], timer: null, acts: [], rows: [], info: o.info || null };
    // Kachel ohne Gerät (Müll, Lüften, Rezept …): Öffnen wie Tippen und Bearbeiten.
    if (!st) {
      if (o.tapPopup || o.tapOpens) m.main = { t: 'Öffnen', ic: 'mdi:arrow-top-right', open: true };
      kindActs(m, o);
      if (o.admin) m.rows.push({ key: 'edit', t: 'Kachel bearbeiten', ic: 'mdi:pencil-outline', sep: true });
      return m;
    }
    var id = st.entity_id, dom = id.split('.')[0], s = String(st.state || ''), a = st.attributes || {};
    var feats = Number(a.supported_features || 0), dead = bad(s), S = o.states || {};
    var svc = function (t, ic, service, data, extra) {
      var x = { t: t, ic: ic, svc: service, data: data || null };
      if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
      return x;
    };
    var pct = function (v) { return v == null ? '' : ' · ' + Math.round(v) + ' %'; };

    if (!dead) {
      var fanOk = dom !== 'fan' || !(feats & 48) || (s === 'on' ? feats & 16 : feats & 32);
      if (TOGGLE.test(dom) && fanOk) {
        m.main = s === 'on' ? svc('Ausschalten', 'mdi:power', 'homeassistant.turn_off') : svc('Einschalten', 'mdi:power', 'homeassistant.turn_on');
      } else if (dom === 'climate') {
        // Ein/Aus nur, wenn das Gerät es kann (ClimateEntityFeature TURN_OFF 128 / TURN_ON 256), sonst über den Betriebsmodus.
        var hv = a.hvac_modes || [], onMode = hv.filter(function (x) { return x !== 'off'; })[0];
        if (s === 'off') {
          if (feats & 256) m.main = svc('Einschalten', 'mdi:power', 'climate.turn_on');
          else if (onMode) m.main = svc('Einschalten', 'mdi:power', 'climate.set_hvac_mode', { hvac_mode: hv.indexOf('heat') !== -1 ? 'heat' : onMode });
        } else if (feats & 128) m.main = svc('Ausschalten', 'mdi:power', 'climate.turn_off');
        else if (hv.indexOf('off') !== -1) m.main = svc('Ausschalten', 'mdi:power', 'climate.set_hvac_mode', { hvac_mode: 'off' });
      } else if (dom === 'cover') {
        if ((s === 'open' || s === 'opening') && (feats & 2)) m.main = svc('Schließen', 'mdi:arrow-collapse-down', 'cover.close_cover');
        else if (s !== 'open' && s !== 'opening' && (feats & 1)) m.main = svc('Öffnen', 'mdi:arrow-collapse-up', 'cover.open_cover');
      } else if (dom === 'valve') {
        if ((s === 'open' || s === 'opening') && (feats & 2)) m.main = svc('Schließen', 'mdi:valve-closed', 'valve.close_valve');
        else if (s !== 'open' && s !== 'opening' && (feats & 1)) m.main = svc('Öffnen', 'mdi:valve-open', 'valve.open_valve');
      } else if (dom === 'lock') {
        // Schloss mit Tastenfeld (code_format): Code im selben Dialog.
        if (s === 'locked') m.main = svc('Entriegeln', 'mdi:lock-open-variant', 'lock.unlock', null, { ask: 'Wirklich entriegeln?', code: !!a.code_format, numeric: /^\^?\\d/.test(String(a.code_format || '')) });
        // Mit code_format verlangt HA den Code auch fürs Verriegeln (leer erlaubt, wenn ein Standard-Code hinterlegt ist).
        else if (s === 'unlocked' || s === 'open' || s === 'jammed') m.main = svc('Verriegeln', 'mdi:lock', 'lock.lock', null,
          a.code_format ? { ask: 'Code eingeben', code: true, numeric: /^\^?\\d/.test(String(a.code_format)) } : null);
      } else if (dom === 'media_player') {
        if (s === 'playing' && (feats & 1)) m.main = svc('Pausieren', 'mdi:pause', 'media_player.media_pause');
        else if ((s === 'paused' || s === 'idle' || s === 'on' || s === 'buffering') && (feats & 16384)) m.main = svc('Abspielen', 'mdi:play', 'media_player.media_play');
        else if ((s === 'off' || s === 'standby') && (feats & 128)) m.main = svc('Einschalten', 'mdi:power', 'media_player.turn_on');
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
        if (btn.length > 1) { m.quick.push({ kind: 'buttons', labels: true, items: btn }); m.main = null; }
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
        var vol = num(a.volume_level);
        if (mb.length) m.quick.push({ kind: 'buttons', labels: true, label: vol != null ? 'Lautstärke' : null, value: vol != null ? pct(vol * 100) : '', items: mb });
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
          return svc(x[0], x[1], 'alarm_control_panel.' + x[2], null, { row: true, ask: 'Alarm scharf schalten?', yes: 'Scharf schalten', mode: x[0], code: needArm, numeric: cn });
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
      // Tasten haben den Zustand „unknown“ bis zum ersten Druck – nur „unavailable“ heißt: gerade nicht möglich.
      // Bambu meldet beim Pausieren im Arbeitsschritt „paused_user“ u. ä., der Druckstatus heißt „pause“.
      if (/paus/.test(ps) && P.resume && S[P.resume] && S[P.resume].state !== 'unavailable') pb.push(svc('Fortsetzen', 'mdi:play', 'button.press', null, { entity: P.resume, wide: true }));
      else if (/^(running|printing|print|prepare|printing_\w+)$/.test(ps) && P.pause && S[P.pause] && S[P.pause].state !== 'unavailable') pb.push(svc('Pause', 'mdi:pause', 'button.press', null, { entity: P.pause, wide: true }));
      if (P.light && S[P.light] && !bad(S[P.light].state)) {
        var pOn = S[P.light].state === 'on';
        pb.push(svc(pOn ? 'Licht aus' : 'Licht an', pOn ? 'mdi:lightbulb-off-outline' : 'mdi:lightbulb-outline', 'light.toggle', null, { entity: P.light, wide: true, on: pOn }));
      }
      if (pb.length) m.quick.push({ kind: 'buttons', items: pb });
      if (P.cam && S[P.cam]) m.acts.push({ key: 'live', t: 'Kamera live', ic: 'mdi:cctv', entity: P.cam });
    }
    // Aquarium: Licht des Beckens an/aus.
    var L = o.aqLight && S[o.aqLight];
    if (L && !bad(L.state) && /^(light|switch)\./.test(o.aqLight)) {
      var lOn = L.state === 'on';
      m.quick.push({ kind: 'buttons', items: [svc(lOn ? 'Licht aus' : 'Licht an', lOn ? 'mdi:lightbulb-off-outline' : 'mdi:lightbulb-outline', 'homeassistant.toggle', null, { entity: o.aqLight, wide: true, on: lOn })] });
    }
    // Kamera: groß und live.
    if (dom === 'camera' && !dead) m.acts.push({ key: 'live', t: 'Live ansehen', ic: 'mdi:cctv', entity: id });
    // Schloss: Tür öffnen abgesetzt unter der Bedienung, immer mit Rückfrage.
    if (dom === 'lock' && !dead && (feats & 1) && !/ing$/.test(s)) {
      m.acts.push({ key: 'act', t: 'Tür öffnen', ic: 'mdi:door-open', svc: 'lock.open', ask: 'Wirklich die Tür öffnen?', yes: 'Tür öffnen', code: !!a.code_format });
    }

    // Zeitschalter: nur mit Casoras Dienst (sensor.casora_timers) und für Schaltbares.
    // Klima: Aus braucht TURN_OFF (128); „Einschalten für“ (aus) zusätzlich TURN_ON (256).
    var timerOk = o.timers && !dead && (TOGGLE.test(dom) || (dom === 'climate' && (feats & 128) && (s !== 'off' || (feats & 256))) || (dom === 'media_player' && (feats & 256)));
    if (timerOk) {
      var on = dom === 'climate' ? s !== 'off' : dom === 'media_player' ? !(s === 'off' || s === 'standby') : s === 'on';
      var run = o.timers[id];
      if (run && run.at) {
        var at = new Date(run.at);
        if (!isNaN(at)) m.timer = { active: true, at: at.getTime(), action: run.action || 'turn_off',
          word: run.action === 'turn_on' ? 'An um' : 'Aus um',
          time: at.toLocaleTimeString(window.casoraLocale ? window.casoraLocale() : undefined, { hour: 'numeric', minute: '2-digit' }) };
      }
      if (m.timer && m.timer.active) { m.timer.mode = 'off'; m.timer.items = MINUTES.map(function (x) { return { t: x[1], min: x[0] }; }); }
      if (!m.timer && (on || dom !== 'media_player')) {
        m.timer = { active: false, mode: on ? 'off' : 'on', label: on ? 'Ausschalten in' : 'Einschalten für',
          items: MINUTES.map(function (x) { return { t: x[1], min: x[0] }; }) };
      }
    }

    kindActs(m, o);
    // Info-Kacheln (nichts zu bedienen): oben „Öffnen“ wie Tippen, darunter die Wege (Menü auf allen Kacheln).
    if (!m.main && !m.quick.length && !m.timer && (o.tapPopup || o.tapOpens)) m.main = { t: 'Öffnen', ic: 'mdi:arrow-top-right', open: true };
    if (o.kind === 'updates' && m.main && m.main.open) { m.main.t = 'Alle Updates'; m.main.ic = 'mdi:update'; }
    // Türklingel: oben „Öffnen“ mit Pfeil wie Frigate, Kaffee und alle Info-Kacheln (16.10.: ein Wort für alle;
    // vorher „Details“, weil „Öffnen“ nach Tür öffnen klang – das Popup-Symbol ↗ sagt, was aufgeht).
    // Wege: „Details“ nur, wenn Tippen nicht schon das Popup öffnet; Gerät und Bearbeiten nur für Admins.
    if (!o.tapPopup) m.rows.push({ key: 'popup', t: 'Details', ic: 'mdi:card-text-outline' });
    if (dom !== 'camera') m.rows.push({ key: 'history', t: 'Verlauf', ic: 'mdi:history' });
    if (o.device && o.admin) m.rows.push({ key: 'device', t: 'Gerät', ic: 'mdi:tune-variant' });
    if (o.admin) m.rows.push({ key: 'edit', t: 'Kachel bearbeiten', ic: 'mdi:pencil-outline', sep: true });
    return m;
  };
  // Eigene Wege je Kachelart (auch ohne Gerät, z. B. Updates-Sammelkachel) und Zusatz-Einträge.
  var kindActs = function (m, o) {
    (o.extra || []).forEach(function (x) { m.acts.push(x); });
    if (o.kind === 'energy') m.acts.push({ key: 'nav', t: 'Energie-Dashboard', ic: 'mdi:lightning-bolt-outline', path: '/energy' });
    // Updates: sofort suchen wie der Knopf im Updates-Popup (03-popups.js, _casoraUpdCheck – Supervisor, HACS, update.*).
    if (o.kind === 'updates' && o.updCheck) m.acts.push({ key: 'updcheck', t: 'Nach Updates suchen', ic: 'mdi:refresh' });
    // Updates: „Alle Updates“ ist das Casora-Popup der Kachel (statt HAs Seite) und steht oben statt „Öffnen“.
    if (o.kind === 'updates' && m.main && m.main.open) { m.main.t = 'Alle Updates'; m.main.ic = 'mdi:update'; }
  };
  // Lohnt ein Menü? Nur mit etwas zu bedienen – sonst tut Halten dasselbe wie Tippen.
  H.worth = function (m) { return !!(m && (m.main || m.quick.length || m.timer || m.acts.length || m.rows.length)); };

  // Laufender Zeitschalter einzeilig: „Aus in 28 Min.“ / „Aus in 1 Std. 5 Min.“.
  H.dur = function (min) {
    min = Math.max(1, Math.round(min));
    if (min < 60) return min + ' ' + T('Min.');
    var h = Math.floor(min / 60), r = min % 60;
    return h + ' ' + T('Std.') + (r ? ' ' + r + ' ' + T('Min.') : '');
  };
  H.leftText = function (t, now) {
    // Aufgerundet wie der Ring auf der Kachel (beide zeigen dieselbe Minute).
    return T(t.action === 'turn_on' ? 'An in' : 'Aus in') + ' ' + H.dur(Math.ceil((t.at - (now || Date.now())) / 60000));
  };
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
    + '.head{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 16px 8px;text-align:center;}'
    + '.head b{font-size:var(--casora-fs-heading, 17px);font-weight:700;letter-spacing:-0.01em;line-height:22px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.head span{font-size:var(--casora-fs-sub, 13px);font-weight:500;color:var(--casora-text-2, rgba(127,127,127,.9));}'
    + '.row{display:grid;grid-template-columns:var(--casora-ic-row, 36px) minmax(0,1fr) auto;align-items:center;column-gap:var(--casora-menu-ic-gap, 12px);'
    +   'height:var(--casora-menu-row-h, 52px);padding:var(--casora-menu-row-pad, 0 16px 0 8px);box-sizing:border-box;border-radius:var(--casora-menu-row-radius, 26px);'
    +   'font-size:var(--casora-fs-row, 15px);font-weight:var(--casora-menu-item-weight, 600);letter-spacing:-0.01em;line-height:20px;cursor:pointer;user-select:none;outline:none;'
    +   'transition:transform var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease), background-color var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease);}'
    + '.row > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.row small{font-size:var(--casora-fs-sub, 13px);font-weight:500;color:var(--casora-text-2, rgba(127,127,127,.9));}'
    + '@media (hover:hover){.row:hover{background:var(--casora-menu-hover, rgba(140,115,90,0.08));}}'
    /* Fokus als outline (box-shadow der Hauptzeile/aktiven Pille überdeckte ihn), feste Farbe statt Gerätefarbe (Kontrast). */
    + '.row:focus-visible{outline:2px solid var(--casora-hold-focus, var(--casora-popup-ui-action, #276B64));outline-offset:2px;}'
    + '.row:active,.row.press{transform:scale(var(--casora-press-scale, .97));background:var(--casora-mnav-press-fill, rgba(127,127,127,0.16));}'
    + '.ic{width:var(--casora-ic-row, 36px);height:var(--casora-ic-row, 36px);border-radius:50%;display:flex;align-items:center;justify-content:center;'
    +   'background:var(--casora-icon-circle-bg, rgba(140,115,90,0.12));color:var(--casora-popup-tiles-text-primary, currentColor);}'
    + '.ic ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
    + '.ic i{display:block;width:22px;height:22px;background-color:currentColor;-webkit-mask:var(--m) center / contain no-repeat;mask:var(--m) center / contain no-repeat;}'
    + '.row.main{background:var(--casora-soft-row-active, rgba(127,127,127,0.10));box-shadow:var(--casora-soft-row-active-shadow, none);}'
    + '.row.main .ic{background:var(--casora-hold-hue, var(--casora-color-teal, #4E9E95));color:var(--casora-soft-glyph, #fff);}'
    + '@media (prefers-reduced-motion: reduce){.pane,.pane.sheet,.veil,.lift{transition:opacity .12s linear !important;transform:none !important;}.row:active,.row.press,.pill:active,.pill.press{transform:none;}}'
    + '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
    + '.sep{height:1px;margin:8px;background:var(--casora-popup-divider, rgba(120,100,80,0.10));}'
    /* Schnellbedienung: Pillen wie die Zeitraum-Pillen der Messwert-Seite, gewählt = Segment-Fläche. */
    /* Etiketten fluchten mit Kreisen/Pillen (wie die Gruppenüberschriften im Szenen-Menü), 4er-Raster. */
    + '.q{padding:8px;}'
    + '.ql{font-size:var(--casora-fs-sub, 13px);line-height:16px;font-weight:600;color:var(--casora-text-2, rgba(127,127,127,.9));padding:0 0 8px;letter-spacing:-0.01em;}'
    + '.qr{display:flex;gap:8px;}'
    + '.q > .row{margin:0 -8px;}'
    + '.q:has(> .row:last-child){padding-bottom:0;}'
    + '.qr .pill{padding:0 4px;}'
    + '.pill{flex:1 1 0;min-width:0;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box;padding:0 8px;'
    +   'background:var(--casora-soft-control-fill, rgba(127,127,127,0.14));font-size:var(--casora-fs-value, 14px);font-weight:600;white-space:nowrap;cursor:pointer;user-select:none;outline:none;'
    +   'font-variant-numeric:tabular-nums;transition:transform var(--casora-dur-feedback, .16s) var(--casora-ease-feedback, ease), background-color var(--casora-dur-feedback, .16s) ease;}'
    + '.pill ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
    + '.pill:active,.pill.press{transform:scale(var(--casora-press-scale, .97));}'
    + '.pill:focus-visible{outline:2px solid var(--casora-hold-focus, var(--casora-popup-ui-action, #276B64));outline-offset:2px;}'
    + '.pill.lbl{flex-direction:column;height:56px;gap:2px;padding:4px 2px;border-radius:var(--casora-r-element, 18px);}'
    + '.pill.lbl small{font-size:var(--casora-fs-label, 12px);font-weight:600;line-height:14px;}'
    + '.pill.on{background:var(--casora-soft-seg-on, var(--primary-color, #B67A50));box-shadow:var(--casora-soft-seg-on-shadow, none), inset 0 0 0 2px var(--casora-hold-hue, transparent);color:var(--casora-soft-seg-on-ink, var(--text-primary-color, #fff));}'
    + '.pill.busy{opacity:.55;pointer-events:none;}'
    + '.step{display:flex;align-items:center;gap:8px;}'
    + '.step .pill{flex:0 0 48px;}'
    + '.step b{flex:1;text-align:center;font-size:var(--casora-fs-heading, 17px);font-weight:700;font-variant-numeric:tabular-nums;}'
    + '.tm{display:flex;align-items:center;gap:8px;}'
    + '.tm .pill{flex:0 0 auto;padding:0 12px;}'
    + '.tm > ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;margin-left:8px;color:var(--casora-text-2, currentColor);}'
    /* Fertig-Zeile im Raster der Zeilen (Kreis 36 | Text), Restzeit als Unterzeile – Info, keine Aktion. */
    + '.info{display:grid;grid-template-columns:var(--casora-ic-row, 36px) minmax(0,1fr);align-items:center;column-gap:var(--casora-menu-ic-gap, 12px);'
    +   'min-height:var(--casora-menu-row-h, 52px);padding:0 16px 0 8px;box-sizing:border-box;font-variant-numeric:tabular-nums;}'
    + '.info ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;justify-self:center;color:var(--casora-text-2, currentColor);}'
    + '.info b{display:block;font-size:var(--casora-fs-row, 15px);font-weight:600;line-height:20px;}'
    + '.info small{display:block;font-size:var(--casora-fs-sub, 13px);font-weight:500;line-height:16px;color:var(--casora-text-2, inherit);}'
    + '.row.quiet{color:var(--casora-text-2, inherit);font-weight:500;}'
    + '.row.quiet .ic{color:var(--casora-text-2, inherit);}'
    + '.tm span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:4px;flex:1;font-size:var(--casora-fs-row, 15px);font-weight:600;padding-left:8px;}';

  // lastName: Titel der Rückfrage, auch wenn das Menü schon zu ist (Hauptaktion schließt erst, dann fragt sie).
  var host = null, cur = null, poll = 0, lastName = '';

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
    // Gekürzter Zustand (casoraStateFit): nur der volle Text, nicht zusätzlich die versteckte Kurzform („… +1“).
    var full = n && n.querySelector && n.querySelector('.sf-f');
    return n ? String((full || n).textContent || '').replace(/\s+/g, ' ').trim() : '';
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
    // lit: selbst gewählter Text (Nachricht einer Klingel) – nicht übersetzen.
    // Symbol: mdi:… über ha-icon, ein Casora-Symbol ohne „:“ (Getränke der Kaffee-Kachel) als Maske wie im Popup.
    var glyph = function (ic) {
      if (/:/.test(String(ic || ''))) return '<ha-icon icon="' + esc(ic) + '"></ha-icon>';
      var url = typeof window.casoraIconUrl === 'function' ? window.casoraIconUrl(ic) : '/casora_assets/icons/' + ic + '.svg';
      return '<i style="--m:url(\'' + esc(url) + '\')"></i>';
    };
    var row = function (key, t, ic, cls, sub, i, lit) {
      return '<div class="row' + (cls ? ' ' + cls : '') + '" role="menuitem" tabindex="-1" data-k="' + esc(key) + '"' + (i != null ? ' data-i="' + i + '"' : '') + '>'
        + '<div class="ic">' + glyph(ic) + '</div><span' + (lit ? ' data-no-i18n' : '') + '>' + esc(lit ? t : T(t)) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    };
    // Handy: Kopf mit Name und Zustand nur, wenn das Blatt die Kachel verdeckt (sonst steht beides scharf darüber).
    if (c.phone) out += '<div class="head"><b>' + esc(c.name) + '</b>' + (c.state ? '<span>' + esc(c.state) + '</span>' : '') + '</div>';
    if (m.info) out += '<div class="info"><ha-icon icon="' + esc(m.info.ic) + '"></ha-icon><span><b>' + esc(m.info.t) + '</b>' + (m.info.sub ? '<small>' + esc(m.info.sub) + '</small>' : '') + '</span></div>';
    if (m.main) out += row('main', m.main.t, m.main.ic, 'main');
    m.quick.forEach(function (q, qi) {
      out += '<div class="q" role="group"' + (q.label ? ' aria-label="' + esc(T(q.label)) + '"' : '') + '>' + (q.label ? '<div class="ql" aria-hidden="true">' + esc(T(q.label)) + (q.kind === 'step' ? '' : esc(q.value || '')) + '</div>' : '');
      if (q.kind === 'step') {
        out += '<div class="step"><div class="pill" role="button" tabindex="-1" aria-label="' + esc(T('Kälter')) + '" data-k="step" data-q="' + qi + '" data-d="-1"><ha-icon icon="mdi:minus"></ha-icon></div>'
          + '<b>' + esc(H.fmtTemp(q.value, q.unit)) + '</b>'
          + '<div class="pill" role="menuitem" tabindex="-1" aria-label="' + esc(T('Wärmer')) + '" data-k="step" data-q="' + qi + '" data-d="1"><ha-icon icon="mdi:plus"></ha-icon></div></div>';
      } else {
        // Einträge als Menüzeilen (Alarm-Modi: Symbol + Wort passt nicht in drei Pillen).
        if (q.items.some(function (it) { return it.row; })) {
          out += q.items.map(function (it, ii) {
            return '<div class="row" role="menuitem" tabindex="-1" data-k="quick" data-q="' + qi + '" data-i="' + ii + '"><div class="ic"><ha-icon icon="'
              + esc(it.ic) + '"></ha-icon></div><span>' + esc(T(it.t)) + '</span></div>';
          }).join('') + '</div>';
          return;
        }
        out += '<div class="qr">' + q.items.map(function (it, ii) {
          // Symbol-Tasten mit Wort darunter (Nutzerrunde: „■“ allein war nicht zu erraten).
          var label = q.labels && it.ic ? '<ha-icon icon="' + esc(it.ic) + '"></ha-icon><small>' + esc(T(it.t)) + '</small>'
            : it.ic && !it.wide ? '<ha-icon icon="' + esc(it.ic) + '"></ha-icon>' : (it.ic ? '<ha-icon icon="' + esc(it.ic) + '"></ha-icon>' : '') + esc(T(it.t));
          return '<div class="pill' + (it.on ? ' on' : '') + (q.labels ? ' lbl' : '') + '" role="' + (q.kind === 'pills' ? 'menuitemradio' : 'menuitem') + '" tabindex="-1" aria-label="' + esc(T(it.t)) + '"'
            + (q.kind === 'pills' ? ' aria-checked="' + (it.on ? 'true' : 'false') + '"' : '') + ' data-k="quick" data-q="' + qi + '" data-i="' + ii + '">' + label + '</div>';
        }).join('') + '</div>';
      }
      out += '</div>';
    });
    if (m.timer) {
      out += '<div class="q">';
      if (m.timer.active) {
        out += '<div class="tm"><ha-icon icon="mdi:timer-outline"></ha-icon><span>' + esc(H.leftText(m.timer)) + '</span>'
          + '<div class="pill" role="menuitem" tabindex="-1" data-k="tcancel">' + esc(T('Zeitschalter aus')) + '</div></div>';
        // Direkt ändern statt erst beenden: dieselben Zeiten, ersetzen den laufenden Zeitschalter.
        if (m.timer.items) out += '<div class="ql" style="padding-top:8px;">' + esc(T('Ändern auf')) + '</div><div class="qr">' + m.timer.items.map(function (x, i) {
          return '<div class="pill" role="menuitem" tabindex="-1" data-k="timer" data-i="' + i + '">' + esc(T(x.t)) + '</div>';
        }).join('') + '</div>';
      } else {
        out += '<div class="ql">' + esc(T(m.timer.label)) + '</div><div class="qr">' + m.timer.items.map(function (x, i) {
          return '<div class="pill" role="menuitem" tabindex="-1" data-k="timer" data-i="' + i + '">' + esc(T(x.t)) + '</div>';
        }).join('') + '</div>';
      }
      out += '</div>';
    }
    // Wenige Linien wie in den übrigen Menüs: Bedienung | abgesetzte Aktionen und Wege | Bearbeiten.
    var blocks = [out, '', ''];
    m.acts.forEach(function (x, i) { blocks[1] += row(x.key, x.t, x.ic, x.ask && x.svc === 'lock.open' ? 'quiet' : '', x.sub || null, i, x.lit); });
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
  var notice = function (msg) {
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: msg };
    ha.dispatchEvent(ev);
  };
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
    var go = function () {
      var d = Object.assign(it.noEntity ? {} : { entity_id: it.entity || id }, it.data || {});
      return call(it.svc, d).then(function () { if (it.done) notice(T(it.done)); return true; }).catch(function (e) { failed(e); return null; });
    };
    // Riskantes (Entriegeln, Tür öffnen) fragt immer – unabhängig von der Studio-Einstellung.
    if (it.ask) {
      var name = (cur ? cur.name : lastName || id) + (it.mode ? ' · ' + T(it.mode) : ''), q = T(it.ask), yes = T(it.yes || it.t);
      // Scharf schalten: Casoras Fenster-/Schloss-Warnung gleich in diese Rückfrage (sonst kamen zwei Dialoge nacheinander).
      if (/^alarm_control_panel\.alarm_arm_/.test(it.svc) && window.casoraArmWarnings && window.casoraArmIds && window._casoraLovelaceCfg) {
        try {
          var hh = hassNow(), parts = window.casoraArmWarnings(hh, window.casoraArmIds(window._casoraLovelaceCfg(), hh && hh.user));
          if (parts && parts.length) { q = T('Achtung') + ': ' + parts.map(T).join(', ') + '. ' + T('Trotzdem scharf schalten?'); yes = T('Trotzdem scharf schalten'); }
          // Nur wenn die Warnung hier wirklich geprüft wurde, darf der Kern seine eigene Rückfrage auslassen.
          it = Object.assign({}, it, { armed: true });
        } catch (e) { /* ohne Warnung: der Kern fragt selbst */ }
      }
      var arm = function () { if (it.armed) window._casoraArmAsked = Date.now(); };
      // Alarm mit Code: Code im selben Dialog, verdeckt; leer = abbrechen.
      if (it.code && window.casoraAsk) {
        return window.casoraAsk({ title: name, text: q, yes: yes, stack: yes.length > 14, input: { placeholder: 'Code', secret: true, numeric: !!it.numeric, allowEmpty: true } })
          .then(function (code) {
            // Abbrechen = false; „Ja“ mit leerem Feld schickt ohne Code (Code nur fürs Scharfschalten verlangt).
            if (code === false || code == null) return null;
            var d = Object.assign({ entity_id: it.entity || id }, it.data || {});
            if (String(code)) d.code = String(code);
            arm();
            return call(it.svc, d).catch(failed);
          });
      }
      var w = window.casoraAsk ? window.casoraAsk({ title: name, text: q, yes: yes, stack: yes.length > 14 }) : Promise.resolve(window.confirm(q));
      return w.then(function (ok) { if (!ok) return null; arm(); return go(); });
    }
    // Rückfrage nach Studio-Einstellung nur fürs reine Schalten (nicht Helligkeit, Position, Stopp) – für das Gerät, das geschaltet wird.
    var ask = !it.data && SWITCHY.test(it.svc) && window.casoraConfirmSwitch;
    var ok = ask ? window.casoraConfirmSwitch(it.entity || id, it.svc) : true;
    return Promise.resolve(ok).then(function (yes) { return yes ? go() : null; });
  };

  var ENT = /^[a-z_]+\.[a-z0-9_]+$/;
  // Eigene Einträge je Info-Kachel – nur, was Casora dort schon kann (Knöpfe der Popups, Dienste).
  // Kachel-Variablen kommen roh an (können [[[ ]]] sein): nur echte Entitäten übernehmen.
  var extras = function (h, id, tpl, V) {
    var out = [], S = h.states || {};
    var real = function (x) { return typeof x === 'string' && ENT.test(x) ? x : null; };
    var live = function (x) { return !!(x && S[x] && !bad(S[x].state)); };
    var has = function (re) { return re.test(tpl); };
    try {
      // Person: Nachricht und Handy klingeln lassen (15-person.js, mit eigenen Rückfragen).
      if (has(/\bcasora_presence\b/) && window._casoraPerson) {
        var pid = real(V.person_entity) || (/^person\./.test(id) ? id : null);
        var ph = pid && window._casoraPerson.phone(h, pid);
        if (ph && ph.notify) {
          out.push({ key: 'fn', t: 'Nachricht schicken', ic: 'mdi:message-text-outline', fn: function () { window._casoraPerson.act('msg', pid, ph.notify); } });
          out.push({ key: 'fn', t: 'Handy klingeln lassen', ic: 'mdi:volume-high', fn: function () { window._casoraPerson.act('ring', pid, ph.notify); } });
        }
      }
      // Rezept: Zutaten auf die Einkaufsliste (casora.rezept_auf_liste, keine KI), Rezept öffnen.
      if (has(/\bcasora_recipe\b/) && window.casoraSvc) {
        var ra = (S['sensor.casora_rezept_der_woche'] || {}).attributes || {};
        if ((ra.zutaten || []).length && ra.status !== 'running') {
          var sv = window.casoraSvc('casora_rezept_auf_liste');
          out.push({ key: 'act', t: 'Auf die Einkaufsliste', ic: 'mdi:cart-plus', svc: sv.domain + '.' + sv.service, data: sv.data, noEntity: true, done: 'Auf der Einkaufsliste' });
        }
        if (/^https:\/\/cookidoo\./.test(String(ra.link || ''))) {
          var link = String(ra.link);
          out.push({ key: 'fn', t: 'Rezept öffnen', ic: 'mdi:open-in-new', fn: function () { window.open(link, '_blank', 'noopener'); } });
        }
      }
      // Pulse: Panel; „Batterie gewechselt“, wenn genau ein Gerät einen Batterie-Grund hat (mit Rückfrage).
      var PU = window._casoraPulse;
      if (has(/\bcasora_pulse\b/) && PU && PU.installed && PU.installed(h)) {
        out.push({ key: 'nav', t: 'In Pulse öffnen', ic: 'mdi:pulse', path: PU.PANEL || '/pulse' });
        var bl = ((PU.scan(h, S) || {}).list || []).filter(function (d) { return /^battery_(low|low_flag|soon)$/.test(d.reason || ''); });
        if (bl.length === 1 && bl[0].device) {
          out.push({ key: 'act', t: 'Batterie gewechselt', sub: bl[0].name, ic: 'mdi:battery-sync', svc: 'pulse.mark_replaced', data: { device_id: bl[0].device },
            noEntity: true, ask: 'Batterie gewechselt?', yes: 'Gewechselt', done: 'Batteriewechsel gemeldet' });
        }
      }
      // Frigate: Erkennung/Aufnahme an/aus (Aus mit Rückfrage), letzte Erkennung, Frigate öffnen (23-frigate.js).
      if (has(/\bcasora_frigate\b/) && window._casoraFrigate && window._casoraFrigate.hold) out = out.concat(window._casoraFrigate.hold(h, id));
      // Reolink-Türklingel: Ton hören (Popup mit Ton), Schnellantworten mit Rückfrage (24-klingel.js).
      if (has(/\bcasora_reolink_doorbell\b/) && window._casoraKlingel && window._casoraKlingel.hold) out = out.concat(window._casoraKlingel.hold(h, id));
      // Kaffeevollautomat: An/Aus, zwei Getränke direkt starten (Rückfrage), Abbrechen beim Bezug (25-kaffee.js).
      if (has(/\bcasora_coffee\b/) && window._casoraCoffee && window._casoraCoffee.hold) out = out.concat(window._casoraCoffee.hold(h, id));
      // Netzwerk: Gäste-WLAN (genau ein Schalter), Speedtest-Taste der Kachel.
      if (has(/\bcasora_network\b/)) {
        var CD = window.casoraDevice;
        if (V.network_extended !== false && CD && CD.network) {
          var gw = ((CD.network(h) || {}).wlans || []).filter(function (w) { return /guest|gast/i.test(w.sw + ' ' + (w.label || '')); });
          if (gw.length === 1 && live(gw[0].sw)) {
            var gOn = S[gw[0].sw].state === 'on';
            out.push({ key: 'act', t: gOn ? 'Gäste-WLAN aus' : 'Gäste-WLAN an', ic: gOn ? 'mdi:wifi-off' : 'mdi:wifi', svc: gOn ? 'switch.turn_off' : 'switch.turn_on',
              entity: gw[0].sw, ask: gOn ? 'Gäste-WLAN ausschalten?' : null, yes: 'Ausschalten' });
          }
        }
        var sb = real(V.entity_speedtest_button), sr = real(V.entity_speedtest_running);
        if (live(sb) && !(sr && S[sr] && S[sr].state === 'on')) out.push({ key: 'act', t: 'Speedtest starten', ic: 'mdi:speedometer', svc: 'button.press', entity: sb });
      }
      // Waschmaschine/Trockner: „Ausgeräumt“ (fertig, Wäsche noch drin), Pausieren/Fortsetzen nur mit Hersteller-Integration.
      var LA = window._casoraLaundry;
      if (has(/\bcasora_(waschmaschine|trockner)\b/) && LA && LA.resolve && id) {
        var c = LA.resolve(S[id], V, S, h), ls = LA.state(S, c.st) || [];
        if (ls[3] === 'clean' && live(c.unload)) out.push({ key: 'act', t: 'Ausgeräumt', ic: 'mdi:basket-check-outline', svc: 'button.press', entity: c.unload });
        if (c.official) {
          if (ls[2] && ls[3] !== 'pause' && live(c.pause)) out.push({ key: 'act', t: 'Pausieren', ic: 'mdi:pause', svc: 'button.press', entity: c.pause });
          if (ls[3] === 'pause' && live(c.resume)) out.push({ key: 'act', t: 'Fortsetzen', ic: 'mdi:play', svc: 'button.press', entity: c.resume });
        }
      }
      // Auto: Daten holen (weckt das Auto – Rückfrage wie im Popup).
      if (has(/\bcasora_car\b/) && window._casoraCar && window._casoraCar.read) {
        var r = window._casoraCar.read(real(V.car) || id, S) || {};
        if (live(r.refresh)) out.push({ key: 'act', t: 'Daten aktualisieren', ic: 'mdi:refresh', svc: 'button.press', entity: r.refresh, ask: 'Auto aufwecken und Daten holen?', yes: 'Aktualisieren' });
      }
      // Kachel mit Knöpfen: ihre eigenen Knöpfe (Dienst oder Umschalten), bis zu drei.
      if (has(/\bcasora_entity_actions\b/)) {
        for (var i = 1; i <= 6 && out.length < 3; i++) {
          var p = 'action_' + i + '_', a = V[p + 'action'], ent = real(V[p + 'entity']), svn = V[p + 'service'];
          if (V[p + 'enabled'] === false || typeof a !== 'string' || /\[\[\[/.test(a)) continue;
          var lbl = typeof V[p + 'label'] === 'string' && !/\[\[\[/.test(V[p + 'label']) ? V[p + 'label'] : (ent && S[ent] && S[ent].attributes.friendly_name) || svn || ent;
          var ic = typeof V[p + 'icon'] === 'string' && V[p + 'icon'] ? (V[p + 'icon'].indexOf(':') < 0 ? 'mdi:' + V[p + 'icon'] : V[p + 'icon']) : 'mdi:gesture-tap-button';
          if (a === 'call-service' && typeof svn === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(svn)) {
            var sd = V[p + 'service_data'] && typeof V[p + 'service_data'] === 'object' ? V[p + 'service_data'] : {};
            out.push({ key: 'act', t: lbl, ic: ic, svc: svn, data: sd, noEntity: !ent, entity: ent || undefined });
          } else if (a === 'toggle' && ent) out.push({ key: 'act', t: lbl, ic: ic, svc: 'homeassistant.toggle', entity: ent });
        }
      }
    } catch (e) { /* ohne Zusatz-Einträge */ }
    return out;
  };
  // Restzeit eines Sensors in Minuten (Zeitpunkt, Minuten/Stunden/Sekunden oder „H:MM:SS“).
  H.minutesLeft = function (st, now) {
    if (!st || bad(st.state)) return null;
    var a = st.attributes || {}, v = String(st.state), u = String(a.unit_of_measurement || '').toLowerCase();
    if (a.device_class === 'timestamp' || /^\d{4}-\d{2}-\d{2}T/.test(v)) { var t = Date.parse(v); return isNaN(t) ? null : (t - (now || Date.now())) / 60000; }
    var hm = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(v);
    if (hm) return +hm[1] * 60 + +hm[2] + (hm[3] ? +hm[3] / 60 : 0);
    var n = num(v);
    if (n == null) return null;
    return /^h/.test(u) ? n * 60 : /^s/.test(u) ? n / 60 : n;
  };
  // Programm-Geräte: „Fertig um 14:20 · noch 35 Min.“ bzw. „Fertig seit 13:05“ oben im Menü.
  var progInfo = function (h, id, tpl, V) {
    var S = h.states || {}, clock = function (ms) { return new Date(ms).toLocaleTimeString(window.casoraLocale ? window.casoraLocale() : undefined, { hour: 'numeric', minute: '2-digit' }); };
    var line = function (rem, doneSince) {
      if (rem != null && rem > 0.5) return { t: T('Fertig um') + ' ' + clock(Date.now() + rem * 60000), sub: T('noch') + ' ' + H.dur(rem), ic: 'mdi:timer-sand' };
      if (doneSince) return { t: T('Fertig seit') + ' ' + clock(doneSince), ic: 'mdi:check-circle-outline' };
      return null;
    };
    try {
      var LA = window._casoraLaundry, DI = window._casoraDish, PR = window._casoraPrint;
      if (/\bcasora_(waschmaschine|trockner)\b/.test(tpl) && LA && LA.resolve && id) {
        var c = LA.resolve(S[id], V, S, h), ls = LA.state(S, c.st) || [], so = S[c.st] || {};
        if (ls[2]) return line(H.minutesLeft(S[c.remaining]));
        if (ls[3] === 'done' || ls[3] === 'clean') return line(null, Date.parse(so.last_changed));
      }
      if (/\bcasora_geschirrspueler\b/.test(tpl) && DI && DI.resolve && id) {
        var d = DI.resolve(S[id], V, S, h), ds = String((S[d.st] || {}).state || '').toLowerCase();
        if (/^(finish(ed)?|fertig|end(ed)?|program_ended|done)$/.test(ds)) return line(null, Date.parse((S[d.st] || {}).last_changed));
        return line(H.minutesLeft(S[d.remaining]));
      }
      if (/\bcasora_3d_printer\b/.test(tpl) && PR && PR.auto && id) {
        var p = PR.auto(S[id], h) || {}, ps = String((S[p.st] || S[id] || {}).state || '').toLowerCase();
        if (/^(running|printing|print|prepare)$/.test(ps)) return line(H.minutesLeft(S[p.remaining]));
        if (/^finish/.test(ps) && p.end && S[p.end]) return line(null, Date.parse(S[p.end].state));
      }
    } catch (e) { /* ohne Zeile */ }
    return null;
  };
  H.extras = function (h, id, tpl, V) { return extras(h, id, tpl, V || {}); };
  // Tippen öffnet etwas (Popup, eigene Seite per javascript, navigate) – dann gibt es oben „Öffnen“.
  var tapOpens = function (x) {
    var a = x && x.action;
    if (popupish(x)) return true;
    return typeof a === 'string' && !/\[\[\[/.test(a) && /^(javascript|navigate|url|fire-dom-event)$/.test(a);
  };
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
      tapOpens: tapOpens(cfg.tap_action),
      states: h.states,
      tpl: tpl,
      // Gesammelte Tipps gelten, bis HA den neuen Wert meldet (höchstens 4 s) – sonst rechnete ein Tipp kurz nach dem Senden vom alten Wert.
      pendingTemp: cur && cur.id === id && cur.pendingTemp != null && Date.now() - (cur.pendingAt || 0) < 4000
        && num(((h.states[id] || {}).attributes || {}).temperature) !== cur.pendingTemp ? cur.pendingTemp : null,
    };
    // Kachel-eigene Geräte: Drucker über seinen Finder (02-devices.js), Aquarium über die Kachel-Variable.
    if (/\bcasora_3d_printer\b/.test(tpl) && window._casoraPrint && window._casoraPrint.auto) {
      var c = null;
      try { c = window._casoraPrint.auto(h.states[id], h); } catch (x) { c = null; }
      if (c) o.printer = { st: c.st, pause: c.pause, resume: c.resume, light: c.light, cam: c.cam };
    }
    if (/\bcasora_aquarium/.test(tpl) && typeof V.light_entity === 'string' && ENT.test(V.light_entity)) o.aqLight = V.light_entity;
    // Rohe Variablen ohne Vorlagen-Ausdrücke ([[[ ]]]) – die Finder würden sie sonst als Entität nehmen.
    var VP = {};
    Object.keys(V).forEach(function (k) { var x = V[k]; if (!(typeof x === 'string' && /\[\[\[/.test(x))) VP[k] = x; });
    o.extra = extras(h, id, tpl, VP);
    o.info = progInfo(h, id, tpl, VP);
    if (/\bcasora_energy\b/.test(tpl)) o.kind = 'energy';
    if (/\bcasora_updates\b/.test(tpl)) { o.kind = 'updates'; o.updCheck = !!(window._casoraUpdCheck && window._casoraUpdCheck.run); }
    return H.model(id ? h.states[id] : null, o);
  };

  var paint = function () {
    if (!cur) return;
    var h = hassNow();
    if (!h || (cur.id && !h.states[cur.id])) return H.close();
    cur.st = cur.id ? h.states[cur.id] : null;
    cur.ts = h.states[TIMERS];
    cur.m = modelFor(h, cur.id, cur.tile);
    cur.painted = Date.now();
    var pane = host.shadowRoot.querySelector('.pane');
    var focused = host.shadowRoot.activeElement;
    var fk = focused && focused.getAttribute('data-k') ? [focused.getAttribute('data-k'), focused.getAttribute('data-q'), focused.getAttribute('data-i'), focused.getAttribute('data-d')].join('|') : '';
    cur.state = tileText(cur.tile, '#state') || tileText(cur.tile, '#label');
    pane.innerHTML = html(cur.m, cur);
    // Ansage bei Änderung (Helligkeit · 50 %, Aus in 28 Min. …) – nicht beim ersten Zeichnen.
    var say = [].map.call(pane.querySelectorAll('.ql, .tm span, .info span'), function (n) { return n.textContent; }).join('. ');
    var live = host.shadowRoot.querySelector('.sr');
    if (live && cur.said != null && say !== cur.said) live.textContent = say;
    cur.said = say;
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
    // Rückmeldung wie beim Tippen auf Kacheln (haptic light; die HA-App vibriert).
    if (window.casoraHaptic) window.casoraHaptic('light');
    if (k === 'main' && m.main && m.main.open) {
      // „Öffnen“: dasselbe wie Tippen (Popup der Kachel).
      var t0 = cur.tile, src0 = (cur.detail && cur.detail.src) || t0;
      H.close();
      window._casoraLastTile = { el: t0, at: Date.now() };
      src0.dispatchEvent(new CustomEvent('action', { bubbles: true, composed: true, detail: { action: 'tap', casoraHoldPass: true } }));
      return;
    }
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
      cur.pendingTemp = v; cur.pendingAt = Date.now();
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
        call('casora.set_timer', { entity_id: id, minutes: mins, action: 'turn_off' }).then(function () {
          // Bestätigung (Nutzerrunde: ohne Hinweis war unklar, ob es geklappt hat).
          var at = new Date(Date.now() + mins * 60000);
          notice((lastName ? lastName + ': ' : '') + T('Aus um') + ' ' + at.toLocaleTimeString(window.casoraLocale ? window.casoraLocale() : undefined, { hour: 'numeric', minute: '2-digit' }));
        }, failed);
      });
      return;
    }
    if (k === 'updcheck') {
      var UC = window._casoraUpdCheck, hu = hassNow();
      H.close();
      if (!UC || !hu) return;
      notice(T('Suche nach Updates …'));
      UC.run(hu).then(function () { var st = UC.status(); if (st[1]) notice(T(st[1])); });
      return;
    }
    if (k === 'act' || k === 'live' || k === 'nav' || k === 'fn') {
      var ax = m.acts[+n.getAttribute('data-i')];
      H.close();
      if (!ax) return;
      if (ax.path) { navigate(ax.path); return; }
      if (ax.fn) { try { ax.fn(); } catch (e) { failed(e); } return; }
      // Frigate-Kamera: mit Kachelnamen, ohne Stream das erneuerte Standbild statt Schwarz (23-frigate.js F.live).
      var FRL = window._casoraFrigate;
      if (k === 'live' && FRL && FRL.live && FRL.live(ax.entity, lastName)) return;
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
      navigate('/casora-studio' + (seg[1] ? '/' + encodeURIComponent(seg[1]) : '')
        + (dash || id ? '?' : '') + (dash ? 'dash=' + encodeURIComponent(dash) : '') + (dash && id ? '&' : '') + (id ? 'tile=' + encodeURIComponent(id) : ''));
    }
  };

  var onKey = function (ev) {
    if (!cur) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); H.close(true); return; }
    var all = [].slice.call(host.shadowRoot.querySelectorAll('.row, .pill'));
    var i = all.indexOf(host.shadowRoot.activeElement);
    if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); var e2 = all[ev.key === 'Home' ? 0 : all.length - 1]; if (e2) e2.focus(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Tab') {
      ev.preventDefault();
      var dir = ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || (ev.key === 'Tab' && ev.shiftKey) ? -1 : 1;
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
    if (refocus && was.tile) {
      var fc = (was.tile.shadowRoot && was.tile.shadowRoot.querySelector('ha-card[tabindex]')) || was.tile;
      try { fc.focus({ preventScroll: true }); } catch (e) { /* egal */ }
    }
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
    var id = (tile._stateObj && tile._stateObj.entity_id) || '';
    if (!h || (id && !h.states[id])) return false;
    if (cur) H.close();
    // Jedes Mal ein frisches Element: keine doppelten Klick-Zuhörer aus früheren Öffnungen.
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = document.createElement('casora-hold-menu');
    host.attachShadow({ mode: 'open' });
    var phone = isPhone();
    var r = tile.getBoundingClientRect(), rad = cardRadius(tile);
    var name = tileText(tile, '#name') || (id ? (h.states[id].attributes || {}).friendly_name || id : '');
    cur = { tile: tile, detail: detail, id: id, phone: phone, name: name, armed: false, opened: Date.now() };
    lastName = name;
    host.shadowRoot.innerHTML = '<style>' + CSS + '</style><div class="veil"></div><div class="lift"></div>'
      + '<div class="pane' + (phone ? ' sheet' : '') + '" role="menu" aria-label="' + esc(name) + '"></div>'
      + '<div class="sr" role="status" aria-live="polite"></div>';
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

    // button-card meldet Halten erst beim Loslassen. Bedienbar erst nach einer Sperrzeit und nur mit einem neuen
    // Antippen danach – ein Nachtipper am Handy (Blatt rutscht unter den Finger) schaltet sonst gleich etwas.
    var touch = phone || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    setTimeout(function () { if (cur) cur.armed = true; }, touch ? 450 : 150);

    host.shadowRoot.addEventListener('click', function (ev) {
      if (!cur) return;
      ev.stopPropagation();
      var p = ev.composedPath(), n = null;
      for (var i = 0; i < p.length; i++) { if (p[i].getAttribute && p[i].getAttribute('data-k')) { n = p[i]; break; } if (p[i] === pane) break; }
      if (!cur.armed || !cur.downOk) return;
      cur.downOk = false;
      if (n) choose(n);
      else if (p.indexOf(pane) === -1) H.close(true);
    });
    host.shadowRoot.addEventListener('pointerdown', function (ev) {
      if (cur) cur.downOk = !!cur.armed;
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
      // Restzeit (Fertig-Zeile, Zeitschalter) alle 30 s nachziehen, sonst nur bei Zustandswechsel.
      var tick = Date.now() - (cur.painted || 0) > 30000 && (cur.m && (cur.m.info || (cur.m.timer && cur.m.timer.active)));
      if (hh.states[id] !== last || hh.states[TIMERS] !== lastT || tick) { last = hh.states[id]; lastT = hh.states[TIMERS]; paint(); }
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
  // Kein Menü: Raum-Hintergrund, Szenenleiste, Badges und Bedienleisten (Uhr, Wetter im Kopf, Knöpfe oben) – keine Kacheln.
  var NO_MENU = /^casora_(room|scene_row|badge_.*|mobile_.*|menu_icon|settings_button|assist_button|notifications_button|now_playing.*|time|weather)$/;
  // Halten auf einer eingebetteten Karte (eigene Karte, HA-Karte im Kachelinhalt) gehört dieser Karte.
  var innerCard = function (path, tile) {
    for (var i = 0; i < path.length && path[i] !== tile; i++) {
      var t = path[i] && path[i].tagName;
      if (t && t !== 'HA-CARD' && (/^HUI-/.test(t) || /-CARD$/.test(t))) return true;
    }
    return false;
  };
  // Halten (oder Rechtsklick/Kontextmenü-Taste) auf einer Kachel: Menü bzw. wie eingestellt (Studio „Halten auf Kacheln“).
  var modeOf = function (cfg) {
    var v = cfg && cfg.variables && cfg.variables.hold_mode;
    v = typeof v === 'string' && /^(menu|popup|ha)$/.test(v) ? v : (window._casoraHoldMode || 'menu');
    return /^(menu|popup|ha)$/.test(v) ? v : 'menu';
  };
  var tapLike = function (tile, src) {
    window._casoraLastTile = { el: tile, at: Date.now() };
    (src || tile).dispatchEvent(new CustomEvent('action', { bubbles: true, composed: true, detail: { action: 'tap', casoraHoldPass: true } }));
  };
  // Rückgabe true = erledigt (Ereignis abfangen).
  var onHold = function (path, src) {
    if (window.CASORA_HOLD_MENU === false || !(window.casoraPopup && window.casoraPopup.enabled)) return false;
    if (/^\/casora-studio/.test(location.pathname)) return false;
    var tile = casoraTile(path);
    if (!tile || [].concat(tile._config.template || []).some(function (x) { return NO_MENU.test(String(x)); })) return false;
    // Eigene Karte: die eingebettete Karte füllt die Kachel – dort gilt das Menü (Bearbeiten), sonst behält die innere Karte ihr Halten.
    if (innerCard(path, tile) && ![].concat(tile._config.template || []).some(function (x) { return x === 'casora_custom'; })) return false;
    var h = hassNow(), id = (tile._stateObj && tile._stateObj.entity_id) || '', cfg = tile._config;
    // Nur Halten, das bisher ein Popup/HAs Dialog war (bzw. Jalousie) – eigene Halten-Aktionen (Licht-Badge: Smart-Toggle) bleiben.
    if (!h || !H.wants(cfg)) return false;
    var mode = modeOf(cfg);
    if (mode === 'ha') {
      if (!id || !h.states[id]) return false;
      window.casoraPopup.nativeMoreInfo(id);
      return true;
    }
    if (mode !== 'popup' && (!id || h.states[id]) && H.worth(modelFor(h, id, tile))) {
      if (H.open(tile, { src: src, via: H.via(cfg) })) {
        // button-card vibriert beim Halten erst in seiner Aktion – die fangen wir ab, also hier (wie hold_action haptic: medium).
        if (window.casoraHaptic) window.casoraHaptic('medium');
        return true;
      }
      return false;
    }
    // Nichts zu bedienen bzw. „Popup öffnen“ eingestellt: Halten tut dasselbe wie Tippen, wenn Tippen das Popup öffnet.
    if (popupish(cfg.tap_action) || tapOpens(cfg.tap_action)) { tapLike(tile, src); return true; }
    return false;
  };
  window.addEventListener('action', function (ev) {
    var d = ev.detail || {};
    if (d.casoraHoldPass) return;
    var path = (ev.composedPath && ev.composedPath()) || [];
    if (d.action === 'tap') { tipOnce(path); return; }
    if (d.action !== 'hold') return;
    if (onHold(path, path[0])) { ev.stopPropagation(); ev.stopImmediatePropagation(); }
  }, true);
  var lastPointer = '';
  window.addEventListener('pointerdown', function (ev) { lastPointer = ev.pointerType || ''; }, { capture: true, passive: true });
  // Desktop: Rechtsklick öffnet dasselbe Menü (nur mit feinem Zeiger – am Touchgerät löst langes Drücken auch contextmenu aus).
  window.addEventListener('contextmenu', function (ev) {
    if (!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
    // Touch-Laptop: langes Drücken mit dem Finger löst contextmenu und Halten aus – nur Maus/Stift zählt.
    if ((ev.pointerType || lastPointer) === 'touch' || (cur && Date.now() - cur.opened < 800)) { if (cur) ev.preventDefault(); return; }
    var path = (ev.composedPath && ev.composedPath()) || [];
    if (onHold(path, path[0])) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  // Tastatur: Kacheln fokussierbar machen (erst wenn jemand Tab nutzt), Kontextmenü-Taste bzw. Umschalt+F10 öffnet das Menü.
  var kbd = false;
  var lastTab = 0, kbdTimer = 0;
  var focusable = function () {
    if (/^\/(casora-studio|config|developer-tools|profile|hassio)(\/|$)/.test(location.pathname)) return;
    var walk = function (root) {
      [].forEach.call(root.querySelectorAll('*'), function (n) {
        if (n.tagName === 'BUTTON-CARD' && n._config && [].concat(n._config.template || []).some(function (x) { return /^casora_/.test(String(x)) && !NO_MENU.test(String(x)); })) {
          var c = n.shadowRoot && n.shadowRoot.querySelector('ha-card');
          if (c && !c.hasAttribute('tabindex')) {
            c.setAttribute('tabindex', '0'); c.setAttribute('aria-haspopup', 'menu'); c.setAttribute('role', 'button');
            // Enter/Leertaste = Tippen (button-card reagiert ohne eigenen Fokus nicht auf Tasten).
            c.addEventListener('keydown', function (ev) {
              if ((ev.key === 'Enter' || ev.key === ' ') && !ev.shiftKey && !cur) { ev.preventDefault(); ev.stopPropagation(); tapLike(n, c); }
            });
          }
          if (c) {
            var nm = n.shadowRoot.querySelector('#name'), stt = n.shadowRoot.querySelector('#state');
            var lab = [nm && nm.textContent, stt && stt.textContent].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
            if (lab && c.getAttribute('aria-label') !== lab) c.setAttribute('aria-label', lab);
          }
        }
        if (n.shadowRoot) walk(n.shadowRoot);
      });
    };
    try { walk(document); } catch (e) { /* egal */ }
  };
  document.addEventListener('keydown', function (ev) {
    // Nach dem ersten Tab; danach nur bei Seitenwechsel bzw. alle 15 s und nur bei sichtbarer Seite (neu gezeichnete Kacheln).
    if (ev.key === 'Tab') lastTab = Date.now();
    if (ev.key === 'Tab' && !kbd) {
      kbd = true; focusable();
      window.addEventListener('location-changed', function () { if (kbd) setTimeout(focusable, 800); }, true);
      // Neu gezeichnete Kacheln nachziehen; nach 10 Min. ohne Tab aufhören (beim nächsten Tab wieder an).
      kbdTimer = setInterval(function () {
        if (Date.now() - lastTab > 600000) { clearInterval(kbdTimer); kbd = false; return; }
        if (!document.hidden) focusable();
      }, 15000);
    }
    if (cur) return;
    if (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) {
      var path = (ev.composedPath && ev.composedPath()) || [];
      if (onHold(path, path[0])) {
        ev.preventDefault(); ev.stopPropagation();
        var f = host && host.shadowRoot && host.shadowRoot.querySelector('.row, .pill');
        if (f) { try { f.focus(); } catch (e) { /* egal */ } }
      }
    }
  }, true);
  // Einmaliger Tipp, damit man das Menü findet: beim ersten Tippen auf eine Kachel (je Browser).
  var TIP = 'casora.holdTip';
  var tipOnce = function (path) {
    if (/^\/casora-studio/.test(location.pathname)) return;
    try { if (localStorage.getItem(TIP)) return; } catch (e) { return; }
    var tile = casoraTile(path);
    if (!tile || window.CASORA_HOLD_MENU === false || (window._casoraHoldMode && window._casoraHoldMode !== 'menu')) return;
    // Nur echte Kacheln – nicht Leiste, Badges, Kopf-Knöpfe (der Hinweis lag sonst über der Handy-Leiste).
    if ([].concat(tile._config.template || []).some(function (x) { return NO_MENU.test(String(x)); })) return;
    try { localStorage.setItem(TIP, '1'); } catch (e) { return; }
    setTimeout(function () {
      var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      notice(T(fine ? 'Tipp: Kachel gedrückt halten oder rechts klicken – Schnellbedienung' : 'Tipp: Kachel gedrückt halten – Schnellbedienung'));
    }, 1200);
  };
})();
