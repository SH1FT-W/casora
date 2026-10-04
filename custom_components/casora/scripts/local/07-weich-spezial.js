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
  var MEDIA_FILL = 'linear-gradient(90deg, color-mix(in srgb, ' + MEDIA_HUE + ' 50%, var(--casora-soft-slider-light, #fff)),'
    + ' ' + MEDIA_HUE + ')';
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
        /* Fortschritt in Ton wie der Wiedergabe-Knopf (Variante B, 04.10.2026). */
        + '.hm-fill{background:var(--casora-np-progress, ' + MEDIA_FILL + ');}'
        + '.hm-times{font-weight:600;color:' + SUB + ';margin-top:7px;}'
        + '.hm-ctl{gap:22px;margin-top:18px;}'
        + '.hm-b.sm{width:56px;height:56px;background:' + CTL + ';}'
        + '.hm-b.sm > div{transform:scale(.72);}'
        + '.hm-b.lg{width:72px;height:72px;background:var(--casora-soft-media-play, var(--casora-lps-switch-on, #B67A50));'
        +   'box-shadow:var(--casora-soft-media-play-shadow, 0 14px 30px -12px rgba(150,95,55,0.55));}'
        + '.hm-b.lg > div{background-color:#fff !important;}'
        + '@media (hover:hover){.hm-b.sm:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
        + '.hm-vol{min-height:66px;margin-top:24px;padding:8px 12px 8px 10px;border-radius:999px;background:' + ROW + ';color:' + SUB + ';}'
        + '.hm-vol .hm-b{width:44px;height:44px;background:' + CTL + ';}'
        + '.hm-vol .hm-track{height:10px;}'
        /* Lautstärke im selben Casora-Ton wie der Fortschritt (1.0.5, 04.10.2026). */
        + '.hm-vol .hm-fill{background:var(--casora-np-progress, ' + MEDIA_FILL + ');}'
        + '.hm-vol .pct{font-size:14px;font-weight:700;color:' + INK + ';min-width:44px;}'
        + srcRules()
        + '</style>';
    },
  };

  // ── Alarm: großer An/Aus-Schalter (casora_popup_alarm u. a.) ──────────────
  // Als Vorlagenfeld ausgewertet, damit auch der Dienst dem Zustand folgt
  // (unscharf → Zuhause scharf, sonst → unscharf).
  window._casoraAlarmSoftToggle = function (ent, states) {
    var st = (states[ent] || {}).state || 'unknown';
    var on = st !== 'disarmed';
    var svc = esc(JSON.stringify(on
      ? { domain: 'alarm_control_panel', service: 'alarm_disarm', data: { entity_id: ent } }
      : { domain: 'alarm_control_panel', service: 'alarm_arm_home', data: { entity_id: ent } }));
    return '<div style="display:flex;justify-content:center;"><div data-casora-svc="' + svc + '" style="display:flex;align-items:center;'
      + 'justify-content:space-between;gap:18px;min-width:260px;box-sizing:border-box;padding:10px 12px 10px 22px;border-radius:999px;'
      + 'background:' + ROW + ';font-family:' + FONT + ';cursor:pointer;">'
      + '<div style="font-size:14.5px;font-weight:700;letter-spacing:-0.01em;color:' + INK + ';pointer-events:none;">'
      + (on ? 'Deaktivieren' : 'Aktivieren') + '</div>'
      + '<div role="switch" aria-checked="' + on + '" style="position:relative;width:44px;height:26px;border-radius:999px;flex:none;pointer-events:none;'
      + 'background:' + (on ? 'var(--casora-lps-switch-on, #B67A50)' : 'var(--casora-lps-switch-off, rgba(58,50,43,0.38))') + ';">'
      + '<div style="position:absolute;top:3px;left:' + (on ? '21px' : '3px') + ';width:20px;height:20px;border-radius:50%;'
      + 'background:var(--casora-lps-knob, #fff);box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div></div></div></div>';
  };

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
