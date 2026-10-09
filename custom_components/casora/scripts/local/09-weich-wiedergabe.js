// ── Weich: „Aktuelle Wiedergabe“ als ruhige Liste (05.10.2026, 1.0.7) ────────
// Nur im Weich-Design (window._casoraSoft()). Eine Karte, jeder Player eine Zeile:
// Cover, Titel, „Interpret · Gerät“, dünner Fortschritt und ein runder Play/Pause-Knopf.
// Am Handy stehen die Zeilen untereinander, am Desktop/Tablet nebeneinander (umbrechend
// statt seitlich zu scrollen). Standard und Glas zeigen weiter Karussell bzw. Pillen.
// Seit 09.10.2026 (Entwurf B1 „Cover-Streifen“): jede Wiedergabe ist eine eigene, vom Cover
// eingefärbte Fläche (76 px), rechts ⏮ ⏯ ⏭ – Zurück/Vor nur, wenn der Player es kann. Im
// Welle-Menü (opt.stage) wird die erste Wiedergabe zur Cover-Bühne (Entwurf C) mit Zeiten und
// Lautstärke. Tasten und Lautstärke öffnen nie das Popup.
//
// Die Vorlagen melden ihre Karte nur an (window._casoraNPSoft.mount):
//   casora_mobile_now_playing  → 'phone' (ersetzt #media_row/#np_rail, Überschrift bleibt)
//   casora_room                → 'room'  (ersetzt die Medien-Pillen in #badges_media; angemeldet wird
//                                          die Raumkarte, die innere Karte wird hier gesucht)
// Die bisherigen Karten bleiben unsichtbar im DOM: ihre Logik (Ein-/Ausblenden, Pausen-
// Frist, Reihenfolge) läuft weiter, und ein Tipp auf eine Zeile löst genau deren Aktion
// aus – das Medien-Popup öffnet sich also wie bisher.
//
// Seit 05.10.2026: Player mit gleichem Titel und Interpret stehen als EINE Zeile da
// („Interpret · HomePod Küche + Büro“, Play/Pause steuert alle), und nach links gewischt gibt
// eine Zeile „Ausblenden“ frei – nur auf diesem Gerät, bis der Player etwas anderes spielt
// (window._casoraNPHidden in casora-core.js; _casoraNP filtert im Weich-Design für alle Ansichten).
(function () {
  if (window._casoraNPSoft) return;
  var M = window._casoraNPSoft = {};

  var soft = function () { return typeof window._casoraSoft === 'function' && window._casoraSoft(); };
  var getHass = function () { var h = document.querySelector('home-assistant'); return h && h.hass; };
  var T = function (de) { return window.casoraTr ? window.casoraTr(de) : de; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var P = {
    play: 'M8,5.14V19.14L19,12.14L8,5.14Z',
    pause: 'M14,19H18V5H14M6,19H10V5H6V19Z',
    note: 'M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z',
    game: 'M7.97,16L5,19C4.67,19.3 4.23,19.5 3.75,19.5A1.75,1.75 0 0,1 2,17.75V17.5L3,10.12C3.21,7.81 5.14,6 7.5,6H16.5C18.86,6 20.79,7.81 21,10.12L22,17.5V17.75A1.75,1.75 0 0,1 20.25,19.5C19.77,19.5 19.33,19.3 19,19L16.03,16H7.97M7,8V10H5V11H7V13H8V11H10V10H8V8H7M16.5,8A0.75,0.75 0 0,0 15.75,8.75A0.75,0.75 0 0,0 16.5,9.5A0.75,0.75 0 0,0 17.25,8.75A0.75,0.75 0 0,0 16.5,8M14.75,9.75A0.75,0.75 0 0,0 14,10.5A0.75,0.75 0 0,0 14.75,11.25A0.75,0.75 0 0,0 15.5,10.5A0.75,0.75 0 0,0 14.75,9.75M18.25,9.75A0.75,0.75 0 0,0 17.5,10.5A0.75,0.75 0 0,0 18.25,11.25A0.75,0.75 0 0,0 19,10.5A0.75,0.75 0 0,0 18.25,9.75M16.5,11.5A0.75,0.75 0 0,0 15.75,12.25A0.75,0.75 0 0,0 16.5,13A0.75,0.75 0 0,0 17.25,12.25A0.75,0.75 0 0,0 16.5,11.5Z',
  };
  P.prev = 'M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z';
  P.next = 'M16,18H18V6H16M6,18L14.5,12L6,6V18Z';
  P.volLo = 'M7,9V15H11L16,20V4L11,9H7Z';
  P.volHi = 'M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z';
  var svg = function (d, s) { return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>'; };

  // Einstellungen der Raumkarte → dieselbe Form wie casora_mobile_now_playing (variables.cfg),
  // damit beide Ansichten dieselbe Quelle (window._casoraNP) mit denselben Regeln nutzen.
  M.roomCfg = function (v) {
    v = v || {};
    var c = { pause_timeout_minutes: v.pause_timeout_minutes != null ? v.pause_timeout_minutes : 10 };
    for (var i = 1; i <= 10; i++) { c['media_player_' + i] = v['media_player_' + i] || null; c['show_media_player_' + i] = !!v['media_player_' + i]; }
    for (var j = 1; j <= 2; j++) { c['psn_' + j] = v['psn_' + j] || null; c['show_psn_' + j] = !!v['psn_' + j]; }
    ['discord_user', 'discord_online', 'discord_game', 'discord_image', 'discord_details', 'discord_label',
      'steam_account', 'steam_online', 'steam_game', 'steam_image', 'steam_label', 'duplicate_game'].forEach(function (k) { c[k] = v[k] || null; });
    c.show_discord = !!(v.discord_user || (v.discord_online && v.discord_game));
    c.show_steam = !!(v.steam_account || v.steam_game);
    c.pinned_key = '';
    return c;
  };

  var CSS = ''
    + ':host{display:block;--cnp-card:var(--casora-np-list-surface, var(--ha-card-background, rgba(251,248,243,.88)));'
    + '--cnp-ink:var(--primary-text-color, #3A322B);--cnp-sub:var(--secondary-text-color, rgba(98,87,76,.92));'
    + '--cnp-ton:var(--casora-np-progress, var(--primary-color, #B67A50));--cnp-track:var(--casora-np-track, var(--casora-soft-control-fill, rgba(140,115,90,.14)));'
    + '--cnp-hair:var(--casora-pill-divider, rgba(120,100,80,.16));--cnp-shadow:var(--button-card-box-shadow-mobile, 0 6px 16px -10px rgba(90,70,50,.18))}'
    + '.l{font-family:var(--primary-font-family, Inter, system-ui);color:var(--cnp-ink);-webkit-font-smoothing:antialiased;line-height:1.25;text-align:left;'
    + 'background:var(--cnp-card);border-radius:26px;box-shadow:var(--cnp-shadow);padding:4px 0;box-sizing:border-box;'
    + '-webkit-backdrop-filter:var(--casora-np-list-backdrop, none);backdrop-filter:var(--casora-np-list-backdrop, none)}'
    + '.l.d{display:grid;border-radius:28px;padding:4px 6px}'
    // Im Panel hinter der Medien-Welle trägt das Menü die Fläche: keine eigene Karte.
    + '.l.pn{background:none;box-shadow:none;border-radius:0;padding:0;-webkit-backdrop-filter:none;backdrop-filter:none}'
    + '.l *{box-sizing:border-box}'
    // .r = Zeile (Fläche, Trennlinien, Wischen), .rc = ihr Inhalt, der beim Wischen nach links rückt
    // und rechts den Knopf „Ausblenden“ (.hd) freigibt. pan-y: senkrecht scrollt die Seite weiter.
    + '.r{position:relative;min-width:0;cursor:pointer;border-radius:22px;overflow:hidden;touch-action:pan-y;'
    + '-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;outline:none}'
    + '.rc{display:flex;align-items:center;gap:14px;padding:12px 14px 12px 12px;min-width:0;position:relative;z-index:1;'
    + 'transition:transform .26s cubic-bezier(0.32,0.72,0,1);will-change:transform}'
    + '.r.dr .rc{transition:none}'
    + '.hd{position:absolute;right:12px;top:50%;z-index:0;height:36px;padding:0 16px;border:0;margin:0;border-radius:18px;'
    + 'transform:translateY(-50%);display:flex;align-items:center;cursor:pointer;font:inherit;font-size:14px;font-weight:600;'
    + 'letter-spacing:-.005em;white-space:nowrap;background:var(--cnp-track);color:var(--cnp-ink);opacity:0;'
    + 'transition:opacity .2s ease;-webkit-tap-highlight-color:transparent}'
    + '.r.sw .hd,.r.dr .hd{opacity:1}'
    + '.hd:focus-visible{outline:2px solid var(--cnp-ton);outline-offset:2px}'
    + '.r.out{transition:opacity .18s ease;opacity:0}'
    + '.r:focus-visible{box-shadow:inset 0 0 0 2px var(--cnp-ton)}'
    + '@media (hover:hover){.r:hover{background:var(--casora-np-hover, var(--casora-soft-row-hover, rgba(140,115,90,.06)))}}'
    + '.r:active{background:var(--casora-soft-row-hover, rgba(140,115,90,.08))}'
    + '.r.hs:before{content:"";position:absolute;top:0;left:78px;right:16px;height:1px;background:var(--cnp-hair)}'
    + '.l.d .r.hs:before{left:12px;right:12px}'
    + '.r.vs:after{content:"";position:absolute;left:0;top:18px;bottom:18px;width:1px;background:var(--cnp-hair)}'
    + '.cv{width:52px;height:52px;border-radius:14px;flex:none;display:grid;place-items:center;color:var(--cnp-sub);'
    + 'background:var(--casora-np-art-fill, var(--cnp-track)) center/cover no-repeat}'
    + '.l.d .cv{width:56px;height:56px}'
    + '.m{flex:1;min-width:0}'
    + '.t{font-size:16px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.s{font-size:13px;color:var(--cnp-sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.b{height:3px;border-radius:2px;background:var(--cnp-track);overflow:hidden;margin-top:9px}'
    + '.b i{display:block;height:100%;border-radius:2px;background:var(--cnp-ton)}'
    + '.b.n{visibility:hidden}'
    + '.p{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;border:0;padding:0;margin:0;cursor:pointer;'
    + 'background:var(--casora-soft-media-play, var(--primary-color, #B67A50));color:#fff;font:inherit;-webkit-tap-highlight-color:transparent;'
    + 'box-shadow:var(--casora-soft-media-play-shadow, 0 10px 22px -12px rgba(150,95,55,.55));transition:transform .12s ease}'
    + '.p.o{background:var(--cnp-track);color:var(--cnp-ink);box-shadow:none}'
    + '.p:active{transform:scale(.92)}'
    + '.p:focus-visible{outline:2px solid var(--cnp-ton);outline-offset:2px}'
    // ── Cover-Streifen (B1) und Cover-Bühne (C), 09.10.2026 ──
    // .tn: jede Wiedergabe eine eigene Fläche, vom Cover eingefärbt (--c aus dem Bild, sonst Ton
    // leise). Hell 30/11 %, dunkel 62/24 % Coverfarbe im radialen Verlauf von oben links.
    + '.l.tn{display:grid;gap:8px;background:none;box-shadow:none;border-radius:0;padding:0;-webkit-backdrop-filter:none;backdrop-filter:none;'
    + '--cnp-sf:var(--casora-np-list-surface, var(--ha-card-background, rgba(251,248,243,.96)));--mA:30%;--mB:11%}'
    + '.l.tn.dk{--mA:62%;--mB:24%}'
    + '.l.tn .r.nc{--c:var(--cnp-ton)}'
    + '.l.tn .r.nc{--mA:16%;--mB:6%}.l.tn.dk .r.nc{--mA:30%;--mB:11%}'
    + '.l.tn .r{border-radius:22px;background:var(--cnp-sf)}'
    + '.l.tn.ph .r{box-shadow:var(--cnp-shadow)}'
    + '.l.tn .r:before,.l.tn .r:after{display:none}'
    + '.l.tn .r:hover,.l.tn .r:active{background:var(--cnp-sf)}'
    + '.tn .rc{border-radius:inherit;gap:12px;padding:12px;'
    + 'background:radial-gradient(130% 150% at 0% 0%,color-mix(in srgb,var(--c) var(--mA),var(--cnp-sf)) 0%,'
    + 'color-mix(in srgb,var(--c) var(--mB),var(--cnp-sf)) 48%,var(--cnp-sf) 100%)}'
    + '.tn .rc:after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:transparent;transition:background .15s ease}'
    + '@media (hover:hover){.tn .r:hover .rc:after{background:var(--casora-np-hover, var(--casora-soft-row-hover, rgba(140,115,90,.06)))}}'
    + '.tn .r:active .rc:after{background:var(--casora-soft-row-hover, rgba(140,115,90,.08))}'
    // Kein Schleier über dem ganzen Player (09.10.2026): nur ⏮ ⏯ ⏭ reagieren auf Maus und Tipp.
    + '.tn .rc:after{display:none}'
    + '.tn .k{transition:background .15s ease,transform .1s ease}'
    + '@media (hover:hover){.tn .k:hover{background:color-mix(in srgb,var(--cnp-ink) 12%,transparent)}.tn .p:hover{filter:brightness(1.08)}}'
    + '.tn .k:active{background:color-mix(in srgb,var(--cnp-ink) 18%,transparent)}'
    + '.tn .cv,.l.d.tn .cv{width:52px;height:52px;border-radius:14px;box-shadow:0 6px 14px -8px rgba(0,0,0,.45)}'
    + '.tn .t{font-size:15px;font-weight:650}'
    + '.tn .s{font-size:12.5px;margin-top:1px}'
    + '.tn .b{margin-top:8px;background:color-mix(in srgb,var(--cnp-ink) 16%,transparent)}'
    + '.tn .b i{background:var(--cnp-ink)}'
    + '.ct{display:flex;align-items:center;gap:2px;flex:none}'
    + '.k{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;border:0;padding:0;margin:0;cursor:pointer;'
    + 'background:none;color:var(--cnp-ink);font:inherit;-webkit-tap-highlight-color:transparent;transition:transform .12s ease,background .15s ease}'
    + '@media (hover:hover){.k:hover{background:color-mix(in srgb,var(--cnp-ink) 8%,transparent)}}'
    + '.k:active{transform:scale(.9)}'
    + '.k:focus-visible{outline:2px solid var(--cnp-ton);outline-offset:1px}'
    + '.tn .p{width:40px;height:40px}'
    + '.tn .p.o{background:var(--casora-soft-media-play, var(--primary-color, #B67A50));color:#fff;box-shadow:var(--casora-soft-media-play-shadow, 0 10px 22px -12px rgba(150,95,55,.55))}'
    // Handy: Trefferflächen mindestens 40 px.
    + '.tn.ph .k{width:40px;height:40px}.tn.ph .p{width:44px;height:44px}.tn.ph .ct{gap:0}'
    // Bühne (Welle-Menü, erste Wiedergabe): Cover groß, Zeiten, Tasten mittig, Lautstärke.
    + '.r.st .rc{display:block;padding:18px 18px 14px;border-radius:inherit}'
    + '.l.tn .r.st{border-radius:20px}'
    + '.st .hr{display:flex;align-items:center;gap:14px;min-width:0}'
    + '.st .cv{width:64px;height:64px;border-radius:16px}'
    + '.st .t{font-size:17px}'
    + '.st .a,.st .s{font-size:13px;color:var(--cnp-sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.st .a{color:var(--cnp-ink);opacity:.82}'
    + '.st .b{height:4px;margin-top:16px}'
    + '.st .tm{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--cnp-sub);font-variant-numeric:tabular-nums}'
    + '.st .ct{justify-content:center;gap:26px;margin-top:6px}'
    + '.st .k{width:44px;height:44px}'
    + '.st .p{width:56px;height:56px}'
    + '.vo{display:flex;align-items:center;gap:10px;margin-top:8px;color:var(--cnp-sub)}'
    + '.vo svg{flex:none}'
    + '.vb{flex:1;height:28px;position:relative;cursor:pointer;touch-action:none;outline:none;border-radius:14px}'
    + '.vb:before{content:"";position:absolute;left:0;right:0;top:12px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--cnp-ink) 16%,transparent)}'
    + '.vb i{position:absolute;left:0;top:12px;height:4px;border-radius:2px;background:var(--cnp-ink)}'
    + '.vb i:after{content:"";position:absolute;right:-6px;top:-4px;width:12px;height:12px;border-radius:50%;background:var(--cnp-ink);box-shadow:0 1px 4px rgba(0,0,0,.25)}'
    + '.vb:focus-visible{box-shadow:0 0 0 2px var(--cnp-ton)}';

  // Was die Vorlage sonst zeigt, wird im Weich-Design ausgeblendet (die Karten bleiben im DOM).
  var HIDE = {
    phone: '#media_row,#np_rail{display:none !important}ha-card{flex-direction:column !important;align-items:stretch !important}',
    // #container trägt sein display inline mit !important (styles.grid) – darum aus dem Fluss nehmen statt display.
    room: '#container{position:absolute !important;left:0;top:0;opacity:0 !important;visibility:hidden !important;'
      + 'clip-path:inset(50%) !important;pointer-events:none !important}'
      + 'ha-card{position:relative;min-height:0 !important;overflow:visible !important}',
  };

  var entries = [];
  M._entries = function () { return entries; };
  var timer = 0;

  M.mount = function (card, cfg, kind) {
    try {
      if (!card || !cfg) return '';
      var e = null;
      for (var i = 0; i < entries.length; i++) if (entries[i].card === card) { e = entries[i]; break; }
      if (!e) { e = { card: card, kind: kind === 'room' ? 'room' : 'phone', rows: {} }; entries.push(e); }
      e.cfg = cfg;
      if (!timer) timer = setInterval(tick, 1000);
      requestAnimationFrame(function () { render(e); });
    } catch (err) { /* nie die Vorlage brechen */ }
    return '';
  };

  // Karten, die vor diesem Modul gerendert haben, haben sich noch nicht angemeldet (die Module
  // laden nach den Vorlagen). Einmal neu rendern lassen, dann ruft ihre Vorlage mount() auf.
  var TPL = ['casora_mobile_now_playing', 'casora_room'];
  function discover() {
    try {
      if (!soft()) return;
      (function walk(r, d) {
        if (!r || d > 14) return;
        r.querySelectorAll('*').forEach(function (el) {
          if (el.localName === 'button-card' && el._config) {
            var t = [].concat(el._config.template || []);
            if (TPL.some(function (n) { return t.indexOf(n) >= 0; })
              && !entries.some(function (e) { return e.card === el; })) {
              var h = el._hass || el.hass;
              if (h) el.hass = Object.assign({}, h);
              if (typeof el.requestUpdate === 'function') el.requestUpdate('_config', undefined);
            }
          }
          if (el.shadowRoot) walk(el.shadowRoot, d + 1);
        });
      })(document, 0);
    } catch (err) { /* nur Nachfassen */ }
  }
  [600, 2500, 6000, 15000].forEach(function (t) { setTimeout(discover, t); });

  function teardown(e) {
    if (e.host) { if (e.host.parentNode) e.host.parentNode.removeChild(e.host); e.host = null; }
    if (e.style) { if (e.style.parentNode) e.style.parentNode.removeChild(e.style); e.style = null; }
    e.sig = null;
  }

  function tick() {
    var now = Date.now();
    entries = entries.filter(function (e) {
      if (e.card.isConnected) { e.gone = 0; return true; }
      if (!e.gone) e.gone = now;
      return now - e.gone < 120000;
    });
    if (!entries.length) { clearInterval(timer); timer = 0; return; }
    // Jede Sekunde nur die Balken laufender Wiedergaben weiterschieben. Früher baute der Takt die
    // ganze Liste neu (Breite messen, Stil schreiben) – das kostete jede Sekunde ein Neuberechnen
    // der Seite und ließ das Wischen der Kachelreihe hängen (05.10.2026). Neu gezeichnet wird,
    // wenn die Vorlage nach einer Zustandsänderung mount() aufruft.
    entries.forEach(function (e) {
      if (!e.card.isConnected || !e.rows) return;
      for (var k in e.rows) { var r = e.rows[k]; if (r && r.bar && r.playing) { progress(e); return; } }
    });
  }

  // Verfügbare Breite der Raumkarten-Zeile: vom Anfang der Medien-Zeile bis zum Kartenrand.
  function roomWidth(card) {
    var field = card.parentElement, grid = field && field.parentElement;
    if (!field || !grid) return 0;
    var fr = field.getBoundingClientRect(), gr = grid.getBoundingClientRect();
    var pr = parseFloat(getComputedStyle(grid).paddingRight) || 0;
    return Math.max(0, Math.floor(gr.right - pr - fr.left));
  }

  function device(rec, states) {
    if (rec.kind === 'player') {
      var s = states[rec.entity];
      return String((s && s.attributes && s.attributes.friendly_name) || rec.source || '').trim();
    }
    return String(rec.source || '').trim();
  }

  // Karte, deren Inhalt ersetzt wird: am Handy die angemeldete Karte selbst, im Raum die
  // innere Karte der Medien-Zeile (#badges_media) der angemeldeten Raumkarte.
  function target(e) {
    if (e.kind !== 'room') return e.card;
    var rr = e.card.shadowRoot, f = rr && rr.getElementById('badges_media');
    return (f && f.querySelector('button-card')) || null;
  }

  function render(e) {
    var card = target(e), root = card && card.shadowRoot;
    var hc = root && root.querySelector('ha-card');
    if (!hc) return;
    if (!soft()) { if (e.host || e.style) teardown(e); return; }
    var h = getHass(); if (!h || !h.states) return;
    var states = h.states;

    if (!e.style || !e.style.isConnected) {
      e.style = document.createElement('style');
      e.style.className = 'cnp-hide';
      e.style.textContent = HIDE[e.kind];
      root.appendChild(e.style);
    }
    if (!e.host || e.host.parentNode !== hc) {
      if (e.host && e.host.parentNode) e.host.parentNode.removeChild(e.host);
      e.host = document.createElement('div');
      e.host.className = 'cnp-host';
      e.host.setAttribute('data-no-i18n', '');
      var sr = e.host.attachShadow({ mode: 'open' });
      sr.innerHTML = '<style>' + CSS + '</style><div class="w"></div>';
      bind(e, sr);
      hc.appendChild(e.host);
      e.sig = null;
    }

    var list = typeof window._casoraNP === 'function' ? window._casoraNP(states, e.cfg) : [];
    var show = list.length > 0;
    if (e.kind === 'phone') {
      var f = (states['input_select.casora_mobile_filter'] || {}).state || 'all';
      show = show && (f === 'all' || f === 'media');
    }

    var desk = e.kind === 'room';
    var cols = 1, colW = 0, avail = 0;
    if (desk) {
      avail = roomWidth(card);
      // Cover-Streifen mit ⏮ ⏯ ⏭ brauchen ~340 px je Spalte (09.10.2026, vorher 290).
      cols = Math.max(1, Math.min(group(list).length || 1, Math.floor((avail - 4) / 348)));
      colW = Math.floor(Math.max(300, Math.min(420, (avail - 12) / cols)));
      // Schmale Zeile (Handy hoch): wie die Handy-Liste untereinander.
      if (avail && avail < 560) { desk = false; cols = 1; }
    }

    var html = paint(e, e.host.shadowRoot.querySelector('.w'), show ? list : [], states, { desk: desk, cols: cols, key: [colW, avail] });
    if (html !== null) {
      if (e.kind === 'room') {
        // Feste Breite statt max-content: die Zeilen sollen umbrechen, nicht seitlich scrollen.
        e.host.style.cssText = !html ? 'display:none'
          : desk ? 'display:block;width:' + (cols * colW + 12) + 'px;max-width:' + (avail || 9999) + 'px;padding:2px 0 10px'
            : 'display:block;width:' + (avail || 320) + 'px;padding:2px 0 10px';
      } else {
        e.host.style.cssText = !html ? 'display:none'
          : 'display:block;width:100%;box-sizing:border-box;padding:0 max(env(safe-area-inset-right), var(--casora-rail-left, 16px)) 14px max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px))';
      }
    }
  }

  // ── Gruppieren (05.10.2026) ──
  // Player, die dasselbe spielen (gleicher Titel und Interpret), werden eine Zeile. Reihenfolge:
  // wie die Liste (die Gruppe steht dort, wo ihr erster Player steht).
  var low = function (t) { return String(t == null ? '' : t).trim().toLowerCase(); };
  function group(list) {
    var out = [], by = {};
    (list || []).forEach(function (rec) {
      // mtitle: echter Medientitel (casora-core.js); fehlt er (ältere Quelle), zählt der Titel nur mit Interpret.
      var mt = rec && rec.kind === 'player' ? (rec.mtitle !== undefined ? rec.mtitle : (rec.subtitle ? rec.title : '')) : '';
      var k = mt ? low(mt) + '\u0001' + low(rec.subtitle) : '';
      if (k && by[k]) { by[k].recs.push(rec); return; }
      var g = { key: rec.key, recs: [rec] };
      if (k) by[k] = g;
      out.push(g);
    });
    out.forEach(function (g) {
      g.lead = g.recs[0];
      // Fortschritt und Knopf vom spielenden Player (sonst vom ersten).
      g.live = g.recs.filter(function (r) { return r.playing; })[0] || g.lead;
    });
    return out;
  }
  // Gerätenamen einer Gruppe: „A“, „HomePod Küche + Büro“ (gemeinsames erstes Wort beim zweiten
  // weggelassen), „A + B“, ab drei „A + 2“.
  function names(list) {
    var n = (list || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (n.length < 2) return n[0] || '';
    if (n.length > 2) return n[0] + ' + ' + (n.length - 1);
    var wa = n[0].split(/\s+/), wb = n[1].split(/\s+/);
    if (wa.length > 1 && wb.length > 1 && low(wa[0]) === low(wb[0])) return n[0] + ' + ' + wb.slice(1).join(' ');
    return n[0] + ' + ' + n[1];
  }
  function subline(g, states) {
    var artist = String(g.lead.subtitle || '').trim();
    var dev = names(g.recs.map(function (r) { return device(r, states); }));
    // Gruppe: Player zuerst – bei langer Zeile wird sonst gerade das „+ …“ abgeschnitten.
    var sub = (g.recs.length > 1 ? [dev, artist] : [artist, dev]).filter(Boolean);
    if (sub.length === 2 && sub[0] === sub[1]) sub.pop();
    return sub.join(' · ');
  }
  M.group = group;
  M.names = names;
  M.subline = subline;

  // ── Farbe aus dem Cover (09.10.2026) ──
  // Das Bild wird klein (24×24) auf eine Leinwand gezeichnet; die Farbe ist der nach Sättigung
  // gewichtete Mittelwert, danach gedämpft (Sättigung 0,34–0,7, Helligkeit 0,32–0,52), damit Schrift
  // hell wie dunkel lesbar bleibt. Fremde Bilder ohne CORS bleiben beim ruhigen Rückfall (Ton).
  var TINT = {}, tintN = 0, painted = [];
  function pickColor(img) {
    var c = document.createElement('canvas'); c.width = c.height = 24;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 24, 24);
    var d = x.getImageData(0, 0, 24, 24).data, R = 0, G = 0, B = 0, W = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var s = mx ? (mx - mn) / mx : 0, l = (mx + mn) / 510;
      // Kräftige, mittelhelle Pixel zählen viel; Schwarz/Weiß nur wenig.
      var w = 0.05 + s * s * (1 - Math.abs(l - 0.5) * 1.6);
      if (w <= 0) w = 0.02;
      R += r * w; G += g * w; B += b * w; W += w;
    }
    if (!W) return '';
    return clampColor(R / W, G / W, B / W);
  }
  function clampColor(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, l = (mx + mn) / 2, s = 0, dd = mx - mn;
    if (dd) {
      s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60;
    }
    // Blasse, dunkle Cover (Film-Standbilder) ergäben fast Grau wie die normale Karte: ihren Farbton
    // sichtbar machen (Sättigung ≥ 0,34, Helligkeit ≥ 0,32); echtes Grau (kein Farbton) bleibt Grau.
    s = Math.min(s, 0.7);
    if (s > 0.03) s = Math.max(s, 0.34);
    l = Math.max(0.32, Math.min(0.52, l));
    return 'hsl(' + Math.round(h) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%)';
  }
  // Farbe zum Bild: Zeichenkette (fertig), '' (keine), null (lädt – Zeilen werden danach eingefärbt).
  function tintOf(url) {
    if (!url) return '';
    if (Object.prototype.hasOwnProperty.call(TINT, url)) return TINT[url];
    if (++tintN > 300) { TINT = {}; tintN = 1; }
    TINT[url] = null;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    var done = function (col) { TINT[url] = col || ''; applyTint(url, TINT[url]); };
    img.onload = function () { var col = ''; try { col = pickColor(img); } catch (err) { col = ''; } done(col); };
    img.onerror = function () { done(''); };
    img.src = url;
    return null;
  }
  function applyTint(url, col) {
    painted = painted.filter(function (e) { return e.w && e.w.isConnected; });
    if (!col) return;
    painted.forEach(function (e) {
      Array.prototype.forEach.call(e.w.querySelectorAll('.r[data-art]'), function (row) {
        if (row.getAttribute('data-art') !== url) return;
        row.style.setProperty('--c', col);
        row.classList.remove('nc');
      });
    });
  }
  M.tintOf = tintOf;
  M.clampColor = clampColor;

  // Raum der Player (Bereich der Entität, sonst des Geräts) – nur wenn alle im selben Raum stehen.
  function roomOf(recs) {
    var h = getHass(), out = [];
    if (!h) return '';
    (recs || []).forEach(function (r) {
      var en = r && r.entity && h.entities && h.entities[r.entity];
      if (!en) return;
      var a = en.area_id || (en.device_id && h.devices && h.devices[en.device_id] && h.devices[en.device_id].area_id);
      var n = a && h.areas && h.areas[a] && h.areas[a].name;
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    return out.length === 1 ? out[0] : '';
  }
  function clock(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x;
  }
  M.clock = clock;

  // Zeilen in w zeichnen (auch für das Panel hinter der Medien-Welle, 10-weich-welle.js).
  // opt: desk/cols = nebeneinander (Raumkarte), panel = ohne eigene Kartenfläche (liegt im Menü).
  // Gibt das neue HTML zurück, wenn neu gebaut wurde, sonst null (nur der Fortschritt lief weiter).
  function paint(e, w, list, states, opt) {
    opt = opt || {};
    var desk = !!opt.desk, cols = opt.cols || 1, stage = !!opt.stage;
    var hs = getHass(), dk = !!(hs && hs.themes && hs.themes.darkMode);
    var rows = {}, groups = {};
    var gl = group(list);
    var items = gl.map(function (g, gi) {
      var rec = g.live, lead = g.lead;
      var dur = Number(rec.dur), pos = Number(rec.pos);
      var hasBar = rec.kind === 'player' && isFinite(dur) && dur > 0 && isFinite(pos);
      var playing = g.recs.some(function (r) { return r.playing; });
      var tog = g.recs.some(function (r) { return !!(r.controls || {}).toggle; });
      // Zurück/Vor nur, wenn der Player es kann (supported_features, _casoraNP → controls).
      var prev = !!(rec.controls || {}).prev, next = !!(rec.controls || {}).next;
      var art = lead.art || (g.recs.filter(function (r) { return r.art; })[0] || {}).art || '';
      // Lautstärke (nur Bühne): wenn der spielende Player volume_set kann (Bit 4) und einen Pegel meldet.
      var vids = [], vol = null;
      if (stage && gi === 0) {
        g.recs.forEach(function (r) {
          var s = r.kind === 'player' && states[r.entity], a = (s && s.attributes) || {};
          if ((Number(a.supported_features) & 4) && typeof a.volume_level === 'number') {
            vids.push(r.entity);
            if (vol === null || r === rec) vol = a.volume_level;
          }
        });
      }
      rows[g.key] = { pos: pos, dur: dur, at: Number(rec.posAt) || 0, playing: !!rec.playing, bar: hasBar,
        live: rec.entity, vol: vol, vids: vids };
      groups[g.key] = g.recs;
      var dev = names(g.recs.map(function (r) { return device(r, states); }));
      // D-15: ohne Medientitel steht der Gerätename schon als Titel – die Unterzeile wiederholt ihn nicht,
      // sondern nennt die App (falls nicht ebenfalls der Name) bzw. „Spielt“/„Pausiert“.
      // Seit 09.10.2026: läuft eine App (Netflix …) ohne Medientitel, steht sie als Titel und das Gerät darunter.
      var tl = String(lead.title || '').trim(), sb = subline(g, states), src = String(lead.source || '').trim();
      if (lead.kind === 'player' && !lead.mtitle && src && low(src) !== low(dev) && low(src) !== low(tl)) { tl = src; sb = dev; }
      if (tl && sb) sb = sb.split(' · ').filter(function (x) { return x && x !== tl; }).join(' · ');
      if (!sb) sb = src && src !== tl ? src : T(playing ? 'Spielt' : 'Pausiert');
      // Bühne: „Gerät · Raum“, der Interpret als eigene Zeile darüber.
      var artist = '', place = '';
      if (stage && gi === 0) {
        artist = String(lead.subtitle || '').trim();
        if (artist === tl) artist = '';
        var room = roomOf(g.recs);
        place = [dev && dev !== tl ? dev : '', room && low(dev).indexOf(low(room)) < 0 ? room : ''].filter(Boolean).join(' · ');
        if (!place) place = artist ? '' : sb;
      }
      return [g.key, tl || lead.title, sb, art, playing, tog, hasBar, lead.kind, g.recs.length, prev, next, vids.length > 0, artist, place];
    });
    e.rows = rows;
    e.groups = groups;
    e.list = list;
    // Signatur ohne Fortschritt und Lautstärke: beides läuft über progress(), ohne die Zeilen neu zu bauen.
    var sig = JSON.stringify([items, desk, cols, !!opt.panel, stage, dk, opt.key || 0]);
    if (!w) return null;
    e.w = w;
    if (painted.indexOf(e) < 0) painted.push(e);
    if (e.sig === sig) { progress(e); return null; }
    e.sig = sig;
    if (e.swRow || e.swAway) closeSwipe(e);
    var hideL = T('Ausblenden');
    var btn = function (cls, a, d, s, label) {
      return '<button type="button" class="' + cls + '"' + (a ? ' data-a="' + a + '"' : '') + ' aria-label="' + esc(label) + '">' + svg(d, s) + '</button>';
    };
    var html = items.map(function (it, i) {
      var key = it[0], title = it[1], sub = it[2], artU = it[3], playing = it[4], tog = it[5], hasBar = it[6], kind = it[7];
      var prev = it[9], next = it[10], hasVol = it[11], artist = it[12], place = it[13];
      var big = stage && i === 0;
      var cls = 'r tn' + (big ? ' st' : '');
      var col = artU ? tintOf(artU) : '';
      if (!col) cls += ' nc';
      var art = artU ? ' style="background-image:url(&quot;' + esc(artU) + '&quot;)"' : '';
      var cover = '<div class="cv"' + art + '>' + (artU ? '' : svg(kind === 'player' ? P.note : P.game, big ? 28 : 24)) + '</div>';
      var ks = big ? 26 : 20;
      var ctl = (prev ? btn('k', 'prev', P.prev, ks, T('Vorheriger Titel')) : '')
        + (tog ? '<button type="button" class="p' + (playing ? '' : ' o') + '" aria-label="' + esc(T(playing ? 'Pausieren' : 'Abspielen')) + '">'
          + svg(playing ? P.pause : P.play, big ? 28 : 22) + '</button>' : '')
        + (next ? btn('k', 'next', P.next, ks, T('Nächster Titel')) : '');
      var bar = '<div class="b' + (hasBar ? '' : ' n') + '"><i style="width:' + pct(rows[key]) + '%"></i></div>';
      var inner;
      if (big) {
        var r = rows[key], p0 = r && r.bar ? Number(pct(r)) / 100 * r.dur : 0;
        var vp = Math.round(Math.max(0, Math.min(1, (r && r.vol) || 0)) * 100);
        inner = '<div class="hr">' + cover + '<div class="m"><div class="t">' + esc(title) + '</div>'
          + (artist ? '<div class="a">' + esc(artist) + '</div>' : '')
          + (place ? '<div class="s">' + esc(place) + '</div>' : '<div class="s"></div>') + '</div></div>'
          + (hasBar ? bar + '<div class="tm"><span class="t0">' + clock(p0) + '</span><span class="t1">−' + clock(r.dur - p0) + '</span></div>' : '')
          + (ctl ? '<div class="ct">' + ctl + '</div>' : '')
          + (hasVol ? '<div class="vo">' + svg(P.volLo, 18) + '<div class="vb" role="slider" tabindex="0" aria-label="' + esc(T('Lautstärke'))
            + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + vp + '"><i style="width:' + vp + '%"></i></div>' + svg(P.volHi, 18) + '</div>' : '');
      } else {
        inner = cover + '<div class="m"><div class="t">' + esc(title) + '</div><div class="s">' + esc(sub) + '</div>' + bar + '</div>'
          + (ctl ? '<div class="ct">' + ctl + '</div>' : '');
      }
      return '<div class="' + cls + '" data-k="' + esc(key) + '" data-n="' + it[8] + '"' + (artU ? ' data-art="' + esc(artU) + '"' : '')
        + (col ? ' style="--c:' + col + '"' : '') + ' role="button" tabindex="0" aria-label="' + esc(title) + '">'
        + '<div class="rc">' + inner + '</div>'
        + '<button type="button" class="hd" tabindex="-1">' + esc(hideL) + '</button>'
        + '</div>';
    }).join('');
    if (html) {
      html = '<div class="l tn' + (desk ? ' d' : '') + (opt.panel ? ' pn' : '') + (!desk && !opt.panel ? ' ph' : '') + (dk ? ' dk' : '') + '"'
        + (desk ? ' style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))"' : '') + '>' + html + '</div>';
    }
    w.innerHTML = html;
    return html;
  }

  function pct(r) {
    if (!r || !r.bar) return '0';
    var p = r.pos + (r.playing && r.at ? (Date.now() - r.at) / 1000 : 0);
    return (Math.max(0, Math.min(1, p / r.dur)) * 100).toFixed(2);
  }

  function progress(e) {
    var w = e.w || (e.host && e.host.shadowRoot && e.host.shadowRoot.querySelector('.w'));
    if (!w) return;
    Array.prototype.forEach.call(w.querySelectorAll('.r'), function (row) {
      var r = e.rows[row.getAttribute('data-k')];
      if (!r) return;
      var bar = row.querySelector('.b i');
      if (r.bar && r.playing && bar) bar.style.width = pct(r) + '%';
      var t0 = row.querySelector('.t0'), t1 = row.querySelector('.t1');
      if (r.bar && t0 && t1) {
        var p = Number(pct(r)) / 100 * r.dur;
        t0.textContent = clock(p); t1.textContent = '−' + clock(r.dur - p);
      }
      var vb = row.querySelector('.vb');
      // Lautstärke vom Player – nicht während man zieht, und nicht kurz danach (HA bestätigt erst).
      if (vb && r.vol != null && !e.volDrag && Date.now() - (e.volAt || 0) > 2500) setVol(vb, r.vol);
    });
  }
  function setVol(vb, v) {
    var p = Math.round(Math.max(0, Math.min(1, v)) * 100);
    var i = vb.querySelector('i');
    if (i) i.style.width = p + '%';
    vb.setAttribute('aria-valuenow', String(p));
  }

  // Die bisherige (unsichtbare) Karte zu einer Zeile – ihr Tipp öffnet das gewohnte Popup.
  function original(e, key) {
    if (e.kind === 'wave') return e.original ? e.original(key) : null;
    var tg = target(e), root = tg && tg.shadowRoot;
    if (!root) return null;
    if (e.kind === 'room') {
      var id = key === 'discord' ? 'activity_discord' : key === 'steam' ? 'activity_steam'
        : /^psn\d$/.test(key) ? 'activity' + key.slice(3) : key;
      var fld = root.getElementById(id);
      return fld && fld.querySelector('button-card');
    }
    var mr = root.getElementById('media_row');
    var inner = mr && mr.querySelector('button-card');
    var isr = inner && inner.shadowRoot;
    var slots = window._casoraNPSlotState || {};
    for (var i = 1; i <= 9 && isr; i++) {
      var st = slots['media' + i];
      if (st && st._npHoldSrc && st._npHoldSrc.key === key) {
        var f2 = isr.getElementById('media' + i);
        var bc = f2 && f2.querySelector('button-card');
        if (bc) return bc;
      }
    }
    return null;
  }

  function open(e, key) {
    var rec = (e.list || []).filter(function (r) { return r.key === key; })[0];
    if (e.onOpen) e.onOpen(key);
    var orig = original(e, key);
    var hc = orig && orig.shadowRoot && orig.shadowRoot.querySelector('ha-card');
    if (hc) {
      window._casoraLastTile = { el: orig, at: Date.now() };
      hc.dispatchEvent(new CustomEvent('action', { detail: { action: 'tap' } }));
      return;
    }
    if (rec && rec.entity) {
      if (window.casoraPopup && window.casoraPopup.moreInfo) window.casoraPopup.moreInfo(rec.entity);
      else {
        var ha = document.querySelector('home-assistant');
        if (ha) ha.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: rec.entity } }));
      }
    }
  }

  function toggle(e, key, btn) {
    var recs = (e.groups && e.groups[key]) || (e.list || []).filter(function (r) { return r.key === key; });
    var h = getHass();
    var ids = recs.filter(function (r) { return r && r.entity && r.kind === 'player'; }).map(function (r) { return r.entity; });
    if (!ids.length || !h) return;
    // Sofort umschalten; der nächste Zustand aus HA bestätigt oder korrigiert.
    var playing = !btn.classList.contains('o');
    btn.classList.toggle('o', playing);
    btn.innerHTML = svg(playing ? P.play : P.pause, btn.closest('.st') ? 28 : 22);
    btn.setAttribute('aria-label', T(playing ? 'Abspielen' : 'Pausieren'));
    var r = e.rows[key];
    if (r) { r.pos = Number(pct(r)) / 100 * r.dur; r.at = Date.now(); r.playing = !playing; }
    try { card_haptic(e.card); } catch (err) { /* egal */ }
    // Gruppe: alle Player gemeinsam anhalten bzw. starten (umschalten liefe bei gemischtem Zustand auseinander).
    if (ids.length > 1) h.callService('media_player', playing ? 'media_pause' : 'media_play', { entity_id: ids });
    else h.callService('media_player', 'media_play_pause', { entity_id: ids[0] });
    // Bleibt HA die Antwort schuldig, zeigt die Zeile nach kurzer Zeit wieder den echten Zustand.
    setTimeout(function () { e.sig = null; }, 4000);
  }

  // Zurück/Vor: nur der spielende Player der Zeile (bei einer Gruppe sonst doppelt gesprungen).
  function skip(e, key, dir) {
    var r = e.rows[key], h = getHass();
    if (!r || !r.live || !h) return;
    try { card_haptic(e.card); } catch (err) { /* egal */ }
    h.callService('media_player', dir === 'prev' ? 'media_previous_track' : 'media_next_track', { entity_id: r.live });
  }

  // Lautstärke aus der Zeigerlage auf dem Balken; gesendet wird beim Loslassen (bzw. je Pfeiltaste).
  function volAt(vb, x) {
    var b = vb.getBoundingClientRect();
    return b.width ? Math.max(0, Math.min(1, (x - b.left) / b.width)) : 0;
  }
  function sendVol(e, key, v) {
    var r = e.rows[key], h = getHass();
    if (!r || !h || !r.vids || !r.vids.length) return;
    v = Math.round(v * 100) / 100;
    r.vol = v;
    e.volAt = Date.now();
    h.callService('media_player', 'volume_set', { entity_id: r.vids.length > 1 ? r.vids : r.vids[0], volume_level: v });
  }

  function card_haptic(el) {
    el.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
  }

  // ── Wischen: nach links gibt „Ausblenden“ frei (05.10.2026) ──
  var SW_GAP = 12;
  function swipeW(row) {
    var b = row && row.querySelector('.hd');
    return b ? Math.ceil(b.offsetWidth) + SW_GAP * 2 : 120;
  }
  function setSwipe(row, x, drag) {
    var rc = row && row.querySelector('.rc');
    if (!rc) return;
    row.classList.toggle('dr', !!drag);
    rc.style.transform = x ? 'translateX(' + Math.round(x) + 'px)' : '';
  }
  function openSwipe(e, row) {
    closeSwipe(e, row);
    row.classList.add('sw');
    setSwipe(row, -swipeW(row), false);
    var hb = row.querySelector('.hd');
    if (hb) hb.tabIndex = 0;
    e.swRow = row;
    if (!e.swAway) {
      // Tipp woanders (auch außerhalb der Liste) schließt den Knopf wieder.
      e.swAway = function (ev) {
        var path = (ev.composedPath && ev.composedPath()) || [];
        if (e.swRow && path.indexOf(e.swRow) >= 0) return;
        // Dieser Tipp schließt nur – er öffnet nicht zugleich eine andere Zeile.
        if (e.w && path.indexOf(e.w) >= 0) e.swClosedAt = Date.now();
        closeSwipe(e);
      };
      document.addEventListener('pointerdown', e.swAway, true);
    }
  }
  function closeSwipe(e, keep) {
    var w = e.w;
    if (w) Array.prototype.forEach.call(w.querySelectorAll('.r.sw, .r.dr'), function (r) {
      if (r === keep) return;
      r.classList.remove('sw');
      setSwipe(r, 0, false);
      var hb = r.querySelector('.hd');
      if (hb) hb.tabIndex = -1;
    });
    if (!keep || e.swRow !== keep) e.swRow = null;
    if (!e.swRow && e.swAway) { document.removeEventListener('pointerdown', e.swAway, true); e.swAway = null; }
  }
  function hideRow(e, row) {
    var key = row.getAttribute('data-k');
    var recs = (e.groups && e.groups[key]) || [];
    if (!recs.length || !window._casoraNPHidden) return;
    try { card_haptic(e.card); } catch (err) { /* egal */ }
    closeSwipe(e, row);
    e.swRow = null;
    if (e.swAway) { document.removeEventListener('pointerdown', e.swAway, true); e.swAway = null; }
    row.classList.add('out');
    setTimeout(function () { e.sig = null; window._casoraNPHidden.hide(recs); }, 180);
  }
  M.closeSwipe = closeSwipe;

  function bind(e, sr) {
    var rowOf = function (ev) {
      var path = ev.composedPath ? ev.composedPath() : [];
      var btn = null, hd = null, row = null, sk = null, vo = null;
      for (var i = 0; i < path.length && path[i] !== sr; i++) {
        var n = path[i];
        if (!n.classList) continue;
        if (!btn && n.classList.contains('p')) btn = n;
        if (!sk && n.classList.contains('k')) sk = n;
        if (!vo && n.classList.contains('vo')) vo = n;
        if (!hd && n.classList.contains('hd')) hd = n;
        if (n.classList.contains('r')) { row = n; break; }
      }
      return { row: row, btn: btn, hd: hd, sk: sk, vo: vo };
    };
    var act = function (ev) {
      var t = rowOf(ev), row = t.row;
      if (!row) return;
      ev.stopPropagation();
      if (ev.cancelable && ev.type !== 'pointerup') ev.preventDefault();
      if (t.hd) { if (row.classList.contains('sw')) hideRow(e, row); return; }
      if (Date.now() - (e.swClosedAt || 0) < 700) return;
      // Aufgewischt: ein Tipp auf die Zeile schließt nur den Knopf.
      if (row.classList.contains('sw') || e.swRow) { closeSwipe(e); return; }
      var key = row.getAttribute('data-k');
      // Tasten und Lautstärke bedienen nur – sie öffnen nie das Popup.
      if (t.vo) return;
      if (t.sk) skip(e, key, t.sk.getAttribute('data-a'));
      else if (t.btn) toggle(e, key, t.btn); else { try { card_haptic(e.card); } catch (err) { /* egal */ } open(e, key); }
    };
    // Antippen selbst erkennen: die umgebende button-card (Aktions-Handler am ha-card) unterdrückt
    // am Handy sonst den click. Ihre Touch-/Maus-Ereignisse bekommt sie daher nicht zu sehen.
    var down = null, last = 0;
    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (t) {
      sr.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true });
    });
    sr.addEventListener('pointerdown', function (ev) {
      if (ev.button > 0) { down = null; return; }
      var t = rowOf(ev);
      // Lautstärke ziehen: kein Wischen, kein Tipp auf die Zeile.
      var vb = t.vo && t.vo.querySelector('.vb');
      if (vb && t.row && (ev.composedPath ? ev.composedPath() : []).indexOf(vb) >= 0) {
        down = null;
        e.volDrag = { vb: vb, key: t.row.getAttribute('data-k'), id: ev.pointerId };
        try { vb.setPointerCapture(ev.pointerId); } catch (err) { /* egal */ }
        setVol(vb, volAt(vb, ev.clientX));
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      down = { x: ev.clientX, y: ev.clientY, t: Date.now(), row: t.row, id: ev.pointerId, drag: false,
        base: t.row && t.row.classList.contains('sw') ? -swipeW(t.row) : 0 };
    });
    sr.addEventListener('pointermove', function (ev) {
      var vd = e.volDrag;
      if (vd && ev.pointerId === vd.id) { setVol(vd.vb, volAt(vd.vb, ev.clientX)); return; }
      var d = down;
      if (!d || !d.row || ev.pointerId !== d.id) return;
      var dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.drag) {
        // Erst waagrecht und deutlich: sonst bleibt es Tippen bzw. senkrechtes Scrollen.
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        d.drag = true;
        if (e.swRow && e.swRow !== d.row) closeSwipe(e, d.row);
        try { d.row.setPointerCapture(ev.pointerId); } catch (err) { /* egal */ }
      }
      var max = swipeW(d.row);
      var x = Math.max(-max - 24, Math.min(0, d.base + dx));
      d.lx = ev.clientX;
      setSwipe(d.row, x, true);
    });
    var endDrag = function (ev, cancel) {
      var d = down;
      if (!d || !d.drag) return false;
      down = null;
      var max = swipeW(d.row);
      var x = d.base + ((d.lx != null ? d.lx : ev.clientX) - d.x);
      if (!cancel && x < -max / 2) openSwipe(e, d.row);
      else { d.row.classList.remove('sw'); setSwipe(d.row, 0, false); if (e.swRow === d.row) closeSwipe(e); }
      last = Date.now();
      return true;
    };
    var endVol = function (ev, send) {
      var vd = e.volDrag;
      if (!vd || ev.pointerId !== vd.id) return false;
      e.volDrag = null;
      last = Date.now();
      if (send) sendVol(e, vd.key, volAt(vd.vb, ev.clientX));
      return true;
    };
    sr.addEventListener('pointercancel', function (ev) { if (endVol(ev, false)) return; if (!endDrag(ev, false)) down = null; });
    sr.addEventListener('pointerup', function (ev) {
      if (endVol(ev, true)) return;
      if (endDrag(ev, false)) return;
      var d = down; down = null;
      if (!d || Date.now() - d.t > 700 || Math.abs(ev.clientX - d.x) > 10 || Math.abs(ev.clientY - d.y) > 10) return;
      last = Date.now();
      act(ev);
    });
    sr.addEventListener('click', function (ev) {
      if (Date.now() - last < 700) { ev.stopPropagation(); return; }
      act(ev);
    });
    sr.addEventListener('keydown', function (ev) {
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target;
      if (t && t.classList && t.classList.contains('vb')) {
        var st = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[ev.key];
        if (st === undefined) return;
        ev.preventDefault(); ev.stopPropagation();
        var row = t.closest('.r'), k = row && row.getAttribute('data-k'), r = k && e.rows[k];
        var v = Math.max(0, Math.min(1, ((r && r.vol) || 0) + st));
        setVol(t, v);
        sendVol(e, k, v);
        return;
      }
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (t && t.classList && (t.classList.contains('p') || t.classList.contains('k'))) return;
      act(ev);
    });
  }

  // Ausblenden oder abgelaufene Pausen-Frist (casora-core.js, _casoraNPChanged): alle angemeldeten
  // Karten neu rechnen lassen – ihre Sichtbarkeit hängt an derselben Liste.
  window.addEventListener('casora-np-changed', function () {
    entries.forEach(function (e) {
      if (!e.card || !e.card.isConnected) return;
      e.sig = null;
      try { if (window.casoraKick) window.casoraKick(e.card); } catch (err) { /* egal */ }
      try { render(e); } catch (err) { /* nächster Zustand */ }
    });
  });

  // Für das Panel hinter der Medien-Welle (10-weich-welle.js): dieselben Zeilen, dieselbe Bedienung.
  // e: { kind: 'wave', card, original(key) → Kachel, onOpen(key) }.
  M.CSS = CSS;
  M.paint = paint;
  M.bind = bind;
})();
