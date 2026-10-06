// Studio B „Vorschau ist der Editor“ (ab 1.1.0, 04.10.2026)
//
// Ein zweiter Aufbau desselben Studios, kein Neubau: Die Vorschau ist die Arbeitsfläche,
// ein Klick (am Handy: Antippen) auf Titel, Badge oder Kachel öffnet die bestehenden
// Editoren in einem Inspektor rechts bzw. in einem Blatt von unten. Seitenleiste und
// Raumliste weichen einer Werkzeugleiste (Räume, Elemente, Dashboard, Zuhause).
// Datenmodell, Speichern („Fertig“), Rückgängig, Umzug und Vorlagen bleiben unverändert –
// dieses Modul ordnet nur an, was das Panel ohnehin zeichnet.
//
// Umschaltbar über „…“ → „Neues Studio“ (pro Browser, localStorage casora.studio.b).
(() => {
  const KEY = "casora.studio.b";
  // Ab 1.1.0 Standard; das bisherige Studio bleibt über „…“ → „Neues Studio“ erreichbar.
  const DEFAULT_ON = true;

  const ICON = {
    rooms: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M2 12a2 2 0 0 1 4 0v3h12v-3a2 2 0 0 1 4 0v5H2zM5 17v2M19 17v2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    dash: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    home: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    upd: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>";

  const B_CSS = `
    /* ── Desktop und Tablet ─────────────────────────────────────────── */
    :host(.bmode.split:not(.flow)) .sidelist,
    :host(.bmode.split:not(.flow)) .sidegrip,
    :host(.bmode) #railbtn, :host(.bmode) #peekbtn, :host(.bmode) .railscrim { display:none !important; }
    :host(.bmode.split:not(.flow)) .top { margin-left:0 !important; width:var(--vpw, 100vw) !important; }
    :host(.bmode.split:not(.flow)) .top::before { display:none; }
    :host(.bmode.split:not(.flow)) .shell { display:flex; align-items:stretch; position:relative; }
    :host(.bmode.split:not(.flow)) .main {
      order:1; flex:1 1 auto; width:auto; min-width:0; padding-right:0; overflow:visible;
      transition:padding-right .26s var(--ease, ease);
    }
    :host(.bmode.split.narrow:not(.flow)) .stage { display:flex; }
    /* Tablet: der Umschalter Desktop/Tablet/Mobil lag unter der Kopfzeile (z-index) und ließ
       sich nicht antippen – unter die Kopfzeile rücken. „N ausgeblendet“ bleibt hinter der
       Vorschau, falls es dort steht (die schmale Ansicht sortiert die Bühne per order). */
    :host(.bmode.split.narrow:not(.flow)) .canvas { padding-top:76px; }
    :host(.bmode.narrow) .canvas > .bhid { order:3; }
    :host(.bmode.split.binsp:not(.flow):not(.bpage)) .main { padding-right:calc(var(--b-insp-w, 388px) + 14px); }
    :host(.bmode.split.binsp:not(.flow):not(.bpage)) { --b-insp-w:min(388px, 42vw); }
    :host(.bmode.split:not(.flow)) .inspector {
      position:absolute; order:0; z-index:9;
      right:14px; top:calc(var(--top-h, 64px) + 4px); bottom:14px;
      width:var(--b-insp-w, min(388px, calc(100% - 28px))); height:auto; max-height:none; margin:0;
      border-radius:22px; clip-path:inset(0 round 22px); flex:none;
      box-shadow:0 2px 6px rgba(0,0,0,.10), 0 26px 64px rgba(0,0,0,.26);
      display:none;
      /* Absolut positioniert zählt align-self: „flex-start“ (aus dem bisherigen Studio) machte den
         Inspektor so hoch wie sein Inhalt – lange Listen ragten dann über die Kopfzeile
         und verdeckten „Fertig“. Gestreckt füllt er den Platz und scrollt innen. */
      align-self:stretch;
    }
    :host(.bmode.binsp.split:not(.flow)) .inspector { display:flex; animation:bInspIn .22s var(--ease, ease); }
    :host(.bmode.bpage.split:not(.flow)) { --b-insp-w:min(760px, calc(100% - 28px)); }
    :host(.bmode.bpage.split:not(.flow)) .main { padding-right:0; }
    :host(.bmode.bpage.split:not(.flow)) .inspector { top:calc(var(--top-h, 64px) + 4px) !important; margin:0 !important; }
    /* Seiten (Einstellungen, Updates, Zeitreise) liegen über der Vorschau: deren Umschalter
       Desktop/Tablet/Mobil ragte sonst halb über den Rand. */
    :host(.bmode.bpage.split:not(.flow)) .stage .segrow { visibility:hidden; }
    /* S-05: Die Vorschau steht in der Mitte der freien Höhe (oben Umschalter, darunter nichts
       Leeres mehr) – auch wenn der Inspektor sie schmaler macht. */
    :host(.bmode.split:not(.flow):not(.phone)) .stage > .canvas { align-self:stretch; box-sizing:border-box; }
    :host(.bmode.split:not(.flow):not(.phone)) .canvas > .plinth { margin-top:auto; margin-bottom:auto; }
    @keyframes bInspIn { from { opacity:0; transform:translateX(18px); } }
    /* UX-01: Tablet hochkant (auch mit HA-Seitenleiste) – neben dem Inspektor blieb für die Vorschau
       kaum ein Drittel der Breite, der Umschalter rutschte unter die Seitenleiste. Hier liegt der
       Inspektor unten, die Vorschau behält die volle Breite darüber. */
    :host(.bmode.bstack.split:not(.flow):not(.phone)) { --b-insp-h:min(54vh, calc(100vh - 400px)); }
    :host(.bmode.bstack.split.binsp:not(.flow):not(.phone):not(.bpage)) .main {
      padding-right:0; padding-bottom:calc(var(--b-insp-h) + 14px); }
    :host(.bmode.bstack.split:not(.flow):not(.phone):not(.bpage)) .inspector {
      left:14px; right:14px; width:auto; top:auto !important; bottom:14px; height:var(--b-insp-h); }
    :host(.bmode.bstack.binsp.split:not(.flow):not(.phone):not(.bpage)) .inspector { animation-name:bStackIn; }
    @keyframes bStackIn { from { opacity:0; transform:translateY(24px); } }
    /* Sofortige Rückmeldung beim Antippen (auch ohne Maus): wie das Zeigen am Desktop, in der
       Handy-Vorschau leicht eingedrückt wie die Knöpfe des Studios. */
    :host(.bmode) .miniroom .bpress:not(.pvsel):not(.mini-fill) { outline-color:rgba(255,255,255,0.55); }
    :host(.bmode) .card.map.soft .miniroom .bpress:not(.pvsel):not(.mini-fill) {
      outline-color:color-mix(in srgb, var(--primary-text-color) 45%, transparent);
    }
    :host(.bmode) .miniphone .bpress { transform:scale(0.97); }
    @media (prefers-reduced-motion: reduce) { :host(.bmode) .inspector { animation:none !important; } }
    :host(.bmode) .inspector .insphead { padding-right:52px; }
    /* Das ✕ hat in der Kopfzeile einen eigenen Platz: die Zeile (Zurück, Titel, Schalter) endet davor.
       Die Kopfzeile des Editors setzt ihr eigenes Padding – deshalb am Inhalt, nicht am Rahmen. */
    :host(.bmode.split:not(.flow):not(.phone)) .inspector .insphead > .navrow { margin-right:46px; }
    .bclose {
      position:absolute; top:16px; right:14px; z-index:12; width:34px; height:34px; border-radius:50%;
      border:0; padding:0; display:none; place-items:center; cursor:pointer;
      background:var(--chip, rgba(127,127,127,.16)); color:var(--ink, inherit);
    }
    .bclose svg { width:16px; height:16px; }
    .bclose:focus-visible, .btool:focus-visible, .bbar button:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    :host(.bmode.binsp) .bclose { display:grid; }

    .btools { display:none; align-items:center; gap:4px; margin-left:10px; min-width:0; }
    :host(.bmode.split:not(.flow):not(.phone)) .btools { display:flex; }
    .btool {
      display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 11px; border:0; border-radius:11px;
      background:none; color:var(--ink, inherit); font:inherit; font-size:var(--t-foot, 14px); font-weight:600;
      cursor:pointer; white-space:nowrap;
    }
    .btool svg { width:17px; height:17px; flex:none; }
    .btool:hover, .btool[aria-expanded="true"], .btool.on { background:var(--chip, rgba(127,127,127,.14)); color:var(--ink, inherit); }
    .btool .blabel { overflow:hidden; text-overflow:ellipsis; max-width:160px; }
    /* UX-10: Beschriftungen nur weglassen, wenn die Zeile wirklich nicht reicht (_bFitTools misst). */
    :host(.btight) .btool:not(.broom) .blabel { display:none; }
    /* Der Inspektor liegt in B schon unter der Kopfzeile: kein zusätzlicher Abstand oben (Tablet),
       sonst stand das ✕ abgesetzt über Zurück/Titel. */
    :host(.bmode.split.narrow:not(.flow):not(.phone)) .inspector { padding-top:0; }
    /* Seiten (Einstellungen, Updates, Zeitreise): die ausgeblendete Listen-Kopfzeile darunter ließ
       die Regel „Listenkopf am Tablet aus“ greifen – die Seite stand ohne Titel da. */
    :host(.bmode.split.narrow:not(.flow):not(.phone)) .insphead:has(> .cs-head, > .cu-head, > .cv-head) { display:flex !important; }
    :host(.bmode.split.narrow:not(.flow):not(.phone)) .inspector:has(> .insphead > .cs-head, > .insphead > .cu-head, > .insphead > .cv-head) { padding-top:0 !important; }

    /* Arbeitsfläche: Elemente zeigen, dass sie anklickbar sind. */
    :host(.bmode) .card.map [data-mk], :host(.bmode) .card.map [data-pv],
    :host(.bmode) .card.map .pbadge, :host(.bmode) .card.map .mtile { cursor:pointer; }
    :host(.bmode) .card.map :is([data-mk], [data-pv], .pbadge, .mtile):focus-visible {
      outline:2px solid var(--accent, #B67A50); outline-offset:2px; }

    /* Ausgeblendete Kacheln als gestrichelte Platzhalter. */
    :host(.bmode) .card.map .mtile.bghost {
      display:flex !important; flex-direction:column; justify-content:flex-end; gap:2px; opacity:.72;
      border:1.5px dashed rgba(127,127,127,.6); background:rgba(255,255,255,.18); box-shadow:none;
    }
    :host(.bmode) .card.map .mtile.bghost .bgn { font-weight:650; font-size:inherit; }
    :host(.bmode) .card.map .mtile.bghost .bgw { opacity:.75; font-size:.86em; }
    :host(.bmode) .card.map .pbadge.blift, :host(.bmode) .card.map .pbadge.mdrag {
      box-shadow:0 6px 18px rgba(0,0,0,.25); z-index:5; position:relative; }
    :host(.bmode) .card.map .pbadge.btarget { box-shadow:0 0 0 2px var(--accent, #B67A50); }
    :host(.bmode) .card.map .pbadge, :host(.bmode) .card.map .mtile { -webkit-user-select:none; user-select:none;
      -webkit-touch-callout:none; }
    /* Wischen scrollt die Kachelreihe; gezogen wird erst nach langem Drücken. */
    :host(.bmode) .card.map .mtile { touch-action:pan-x pan-y; }
    .bhid { display:none; }
    :host(.bmode) .bhid {
      display:inline-flex; align-self:center; align-items:center; gap:7px; margin:10px auto 0; padding:7px 14px;
      border:0; border-radius:999px; cursor:pointer; font:inherit; font-size:var(--t-foot, 13.5px); font-weight:600;
      background:var(--chip, rgba(127,127,127,.14)); color:var(--ink-2, inherit);
    }
    :host(.bmode) .bhid svg { width:16px; height:16px; }
    :host(.bmode) .segrow .bhid { margin:0; height:36px; padding:0 14px; box-sizing:border-box; }
    :host(.bmode.phone) .bhid { position:fixed; left:50%; transform:translateX(-50%); bottom:calc(84px + env(safe-area-inset-bottom, 0px));
      z-index:19; margin:0; white-space:nowrap; box-shadow:0 6px 18px rgba(0,0,0,.16);
      background:var(--bar-solid, var(--casora-studio-bar-solid, rgba(242,242,247,.96))); }
    :host(.bmode.phone) .bhid.bphint { bottom:calc(128px + env(safe-area-inset-bottom, 0px)); }
    :host(.bmode.phone.binsp) .bhid { display:none; }
    :host(.bmode) .bhid:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    /* Liste „Elemente“: Schalter direkt in den Badge- und Kachelzeilen. */
    :host(.bmode) #pane.stack #band-badges .card > .chead .sw,
    :host(.bmode) #pane.sheet #band-badges .card > .chead .sw { display:flex; }
    :host(.bmode) #pane #band-tiles .tile > .thead .sw { display:flex; }
    :host(.bmode) #pane #band-tiles .tile > .thead .count { display:none; }
    :host(.bmode) #pane #band-badges .card > .chead .count {
      grid-column:2; grid-row:2; justify-self:start; text-align:left; max-width:100%; opacity:1; transform:none; margin-top:1px; }
    /* Sortieren geht über die Griffe (Liste) und in der Vorschau, Löschen im Editor der Kachel:
       der eigene Bearbeiten-Modus entfällt. */
    :host(.bmode) .tilebar .editbtn, :host(.bmode) .badgebar .badgeedit { display:none !important; }
    .bupd { display:none; }
    /* UX-05: Räume ordnen – Liste im Inspektor. */
    .inspector.brooms-on > .insphead > :not(.broomshead) { display:none !important; }
    .inspector:not(.brooms-on) .broomshead { display:none !important; }
    .inspector.brooms-on > .insphead > .broomshead { display:flex !important; }
    .brooms { padding:4px 0 6px !important; }
    .brow { display:flex; align-items:center; gap:12px; min-height:46px; padding:0 10px; border-radius:10px;
      cursor:pointer; position:relative; touch-action:pan-y; -webkit-user-select:none; user-select:none; }
    .brow + .brow { box-shadow:inset 0 1px 0 var(--hair, rgba(127,127,127,.18)); }
    .brow.on { background:var(--wash-sel, var(--casora-studio-wash-sel, rgba(127,127,127,.12))); box-shadow:none; }
    .brow.on + .brow { box-shadow:none; }
    .brow:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:-2px; }
    .brow .bri { width:22px; height:22px; flex:none; background-color:currentColor; opacity:.85;
      -webkit-mask:var(--i) center / contain no-repeat; mask:var(--i) center / contain no-repeat; }
    .brow .bn { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .brow .bfix { font-size:var(--t-foot, 13px); color:var(--ink-3, rgba(127,127,127,.9)); }
    .brow .bgrip { width:32px; height:32px; flex:none; display:grid; place-items:center; color:var(--ink-3, rgba(127,127,127,.9));
      cursor:grab; touch-action:none; }
    .brow .bgrip svg { width:18px; height:18px; }
    .brow.bdrag { z-index:3; background:var(--card, #fff); box-shadow:0 8px 24px rgba(0,0,0,.18) !important; cursor:grabbing; }
    .brow.bmoving { transition:transform .18s var(--ease, ease); }
    .broomacts { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 2px; }
    .broomacts button { border:0; border-radius:10px; padding:9px 14px; cursor:pointer; font:inherit;
      font-size:var(--t-foot, 14px); font-weight:600; background:var(--chip, rgba(127,127,127,.14)); color:var(--ink, inherit); }
    .broomacts button:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    /* UX-08: Entfernen sichtbar am Ende des Kachel-Editors (wie „Kontakt löschen“ in iOS). */
    .bremove {
      display:block; width:100%; margin:16px 0 6px; padding:12px 14px; border:0; border-radius:12px;
      background:var(--chip, rgba(127,127,127,.12)); color:var(--casora-studio-bad, #FF453A);
      font:inherit; font-size:var(--t-body, 15px); font-weight:600; cursor:pointer; text-align:center; }
    .bremove:hover { filter:brightness(.97); }
    .bremove:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    /* UX-07: Ungesichertes wie am Mac neben dem Namen („— Bearbeitet“), nicht nur als Punkt. */
    .bedited { display:none; }
    :host(.bmode.bdirty.split:not(.flow):not(.phone):not(.btight)) .toprow > .bedited {
      display:inline; flex:0 0 auto; margin-left:-6px; white-space:nowrap;
      font-size:var(--t-foot, 14px); font-weight:500; letter-spacing:0; color:var(--ink-2, inherit); }
    :host(.bmode.split:not(.phone)) .bupd.on { display:inline-flex; color:var(--accent, #B67A50); }

    /* ── Handy ──────────────────────────────────────────────────────── */
    :host(.bmode.phone) .stage { display:flex !important; }
    :host(.bmode.phone) .bigtitle { display:none; }
    :host(.bmode.phone) .inspector {
      position:fixed !important; left:0; right:0; bottom:0; top:auto; z-index:30;
      max-height:84dvh; display:none !important; flex-direction:column;
      border-radius:24px 24px 0 0; padding-top:18px;
      background:var(--bar-solid, var(--casora-studio-bar-solid, rgb(242,242,247)));
      box-shadow:0 -10px 40px rgba(0,0,0,.25);
    }
    /* Dunkel: --bar-solid gibt es nur hell – das Blatt blieb hellgrau, Überschriften und ✕ weiß darauf. */
    :host(.bmode.phone:not(.is-light)) .inspector { background:var(--pane-solid, #1d1f25); }
    :host(.bmode.phone.binsp) .inspector { display:flex !important; animation:bSheetIn .24s var(--ease, ease); }
    :host(.bmode.phone) .inspector .sheet { overflow-y:auto; max-height:calc(84dvh - 70px); }
    :host(.bmode.phone) .inspector::before {
      content:""; position:absolute; top:7px; left:50%; width:38px; height:5px; margin-left:-19px;
      border-radius:9px; background:var(--ink-3, rgba(127,127,127,.5)); opacity:.5; z-index:2;
    }
    @keyframes bSheetIn { from { transform:translateY(40px); opacity:.4; } }
    /* Im Blatt liegt nichts über einem Foto: Kopfzeile in Textfarbe statt Weiß mit Schatten. */
    :host(.bmode.phone) .inspector .insphead, :host(.bmode.phone) .inspector .insphead * ,
    :host(.bmode.phone) .inspector .detailbar h3 { color:var(--ink) !important; text-shadow:none !important; }
    :host(.bmode.phone) .inspector .insphead .back {
      background:var(--chip, rgba(127,127,127,.16)) !important; box-shadow:none !important;
      backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
    :host(.bmode.phone) .inspector .insphead { padding:4px 60px 8px 16px; }
    /* UX-09: ✕ auf der Mitte der Kopfzeile (Zurück/Titel), nicht darüber. */
    :host(.bmode.phone) .bclose { top:27px; right:14px; }
    .bscrim { display:none; }
    :host(.bmode.phone.binsp) .bscrim { display:block; position:fixed; inset:0; z-index:29; background:rgba(0,0,0,.28); }
    .bbar { display:none; }
    :host(.bmode.phone) .bbar {
      display:flex; position:fixed; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom, 0px));
      z-index:20; height:58px; border-radius:20px; align-items:center; justify-content:space-around;
      background:var(--bar-solid, var(--casora-studio-bar-solid, rgba(242,242,247,.96)));
      box-shadow:0 10px 30px rgba(0,0,0,.22);
    }
    :host(.bmode.phone.binsp) .bbar { display:none; }
    .bbar button {
      border:0; background:none; color:var(--ink-2, inherit); font:inherit; font-size:11px; font-weight:600;
      display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 8px; cursor:pointer;
    }
    .bbar button svg { width:22px; height:22px; }
    .bbar button { position:relative; }
    .bbar button.bdot::after { content:""; position:absolute; top:3px; right:12px; width:8px; height:8px; border-radius:50%;
      background:var(--casora-popup-ui-bad, #FF453A); }
    .bbar .bplus { width:44px; height:44px; border-radius:50%; padding:0; justify-content:center;
      background:var(--casora-studio-done, var(--accent, #B67A50)); color:#fff; }
    :host(.bmode.phone) .body { padding-bottom:90px; }
  `;

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    const after0 = (name, fn) => {
      const orig = P[name];
      if (typeof orig !== "function") return;
      P[name] = function () {
        const r = orig.apply(this, arguments);
        try { fn.call(this, r, arguments); } catch (e) { console.warn("Casora Studio B:", e); }
        return r;
      };
    };

    P._bOn = function () {
      try {
        const v = localStorage.getItem(KEY);
        return v === null ? DEFAULT_ON : v === "1";
      } catch (e) { return DEFAULT_ON; }
    };

    P._bSetOn = function (on) {
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* nur für diese Sitzung */ }
      this._bOpen = false;
      this._bApply();
      if (this._state) {
        this._renderForm();
        this._rebuildPreview();
      }
      this._bRefit();
    };

    // Das Layout hat sich geändert: die Vorschau neu einpassen.
    P._bRefit = function () {
      requestAnimationFrame(() => {
        try { if (this._setVph) this._setVph(); } catch (e) { /* egal */ }
        try { if (this._fitSlot) this._fitSlot(); } catch (e) { /* egal */ }
      });
    };

    // Abläufe (Assistent, Design, Umzug …) liegen über allem: B beim Öffnen und Schließen eines
    // Ablaufs neu anwenden – sonst blieben am Handy Größen-Umschalter und Inspektor-Blatt mit ✕ sichtbar.
    ["_flowOpen", "_exitFlow"].forEach((m) => {
      const orig = P[m];
      if (typeof orig !== "function") return;
      P[m] = function () {
        const r = orig.apply(this, arguments);
        try { this._bApply(); } catch (e) { /* B bleibt, wie es ist */ }
        return r;
      };
    });

    // Größen-Umschalter (Desktop/Tablet/Mobil) nach einer Größe von hier nachziehen: sonst stand
    // am Handy „Tablet“ markiert über der Handy-Vorschau, und „Tablet“ antippen tat nichts.
    const wireSeg = P._wireSeg;
    P._wireSeg = function (seg, attr, initial, onPick, opts) {
      if (seg && seg.id === "sizeseg") this._bSizeWire = [seg, attr, onPick, opts];
      return wireSeg.apply(this, arguments);
    };
    P._bSyncSize = function () {
      try { if (this._syncSizeOpts) this._syncSizeOpts(); } catch (e) { /* ohne */ }
      const w = this._bSizeWire;
      if (w && w[0].isConnected) this._wireSeg(w[0], w[1], this._miniSize, w[2], w[3]);
      else {
        const sg = this.shadowRoot && this.shadowRoot.getElementById("sizeseg");
        if (sg && sg._moveThumb) requestAnimationFrame(() => sg._moveThumb(false));
      }
    };

    P._bPage = function () { return !!(this._csOpen || this._cuOpen || this._cvOpen); };

    // UX-02: Im neuen Studio ist der Titel auf jedem Gerät das Dashboard – der Raum hat seinen
    // eigenen Knopf. Bisher war er am Tablet und Handy der Raumname (zweimal „Zuhause“ nebeneinander).
    const titleIsDash = P._titleIsDash;
    P._titleIsDash = function () {
      if (this.classList.contains("bmode") && !this.classList.contains("flow")) return true;
      return titleIsDash.apply(this, arguments);
    };
    after0("_markDirty", function () {
      const dirty = this._isDirty ? this._isDirty() : false;
      this.classList.toggle("bdirty", !!dirty);
      // Neben dem Titelknopf, nicht darin: sonst bricht ein kurzer Name schon zweizeilig um.
      const t = this.shadowRoot.getElementById("roomtitle");
      if (t && t.parentElement) {
        let e = t.parentElement.querySelector(":scope > .bedited");
        if (!e) {
          e = document.createElement("span");
          e.className = "bedited";
          e.textContent = "\u2014 " + tr("Edited");
          e.setAttribute("data-no-i18n", "");
        }
        if (t.nextElementSibling !== e) t.after(e);
      }
    });
    after0("_syncTitles", function () {
      if (!this.classList.contains("bmode")) return;
      const nav = this.shadowRoot.getElementById("navtitle");
      const lab = nav && nav.querySelector(".nt-label");
      const d = (this._dashList || []).find((x) => x.url_path === this._dashUrl);
      const name = (d && d.title) || this._dashUrl || "";
      if (lab && name) {
        lab.textContent = name;
        lab.setAttribute("data-no-i18n", "");
        nav.setAttribute("aria-label", name + ", " + tr("switch dashboard"));
      }
    });

    // UX-03: Titelmenü wie bei einem Mac-Dokument – Dashboards wechseln und anlegen, darunter
    // alles, was dieses Dashboard als Ganzes betrifft (bisher im „…“-Menü und unter „Dashboard“).
    P._bDocItems = function () {
      if (!this._dashUrl || this._flowMode) return [];
      const g = "This dashboard";
      const out = [
        { id: "doc:rename", label: "Rename\u2026", icon: "pencil", group: g },
        { id: "doc:icon", label: "Icon\u2026", icon: "grid", group: g },
      ];
      if (typeof this._cvFromMenu === "function") out.push({ id: "doc:versions", label: "Rewind", icon: "clock", group: g });
      if (this._canAddMobile && this._canAddMobile()) out.push({ id: "doc:addmobile", label: "Phone layout", icon: "phone", group: g });
      out.push({ id: "doc:delete", label: "Delete\u2026", icon: "trash", danger: true, group: g });
      return out;
    };
    P._bDocPick = function (id, anchor) {
      if (String(id).indexOf("doc:") !== 0) return false;
      const d = (this._dashList || []).find((x) => x.url_path === this._dashUrl);
      const k = id.slice(4);
      this._bRooms = false;
      if (k === "rename") { if (d) this._renameDashboard(d); }
      else if (k === "icon") { if (d) this._dashIconMenu(anchor, d); }
      else if (k === "versions") { this._bOpen = true; this._cvFromMenu(); }
      else if (k === "addmobile") this._addMobileSibling();
      else if (k === "delete") this._deleteDashboard();
      return true;
    };
    const dashSwitchMenu = P._dashSwitchMenu;
    P._dashSwitchMenu = function (anchor) {
      if (!this.classList.contains("bmode")) return dashSwitchMenu.apply(this, arguments);
      const items = this._dashSwitchItems(true).map((x) => (x.id === "newdash" ? { ...x, group: "new" } : x));
      this._menuAt(anchor, items.concat(this._bDocItems()), (id) => {
        if (this._bDocPick(id, anchor)) return;
        this._dashSwitchPick(id);
      });
    };

    P._bApply = function () {
      const root = this.shadowRoot;
      if (!root) return;
      if (!root.getElementById("b-css")) {
        const st = document.createElement("style");
        st.id = "b-css";
        st.textContent = B_CSS;
        root.appendChild(st);
      }
      const on = this._bOn() && !this._flowMode;
      const wasOn = this.classList.contains("bmode");
      // UX-01: hochkant und schmal → Inspektor unten statt rechts.
      const pw = this.clientWidth || 0, ph = window.innerHeight || 0;
      const stack = on && pw > 0 && pw < 1000 && ph > pw;
      if (stack !== this.classList.contains("bstack")) { this.classList.toggle("bstack", stack); this._bRefit(); }
      if (on && pw !== this._bFitW) { this._bFitW = pw; requestAnimationFrame(() => this._bFitTools()); }
      this.classList.toggle("bmode", on);
      // Nach einem Ablauf (am Handy z. B. Updates, Zeitreise) war B kurz aus: die Vorschau kann
      // inzwischen neu gebaut sein – Platzhalter, „N ausgeblendet“ und Tastatur neu anbringen.
      if (on && !wasOn) requestAnimationFrame(() => this._bDecorate());
      if (on !== wasOn && this._state && this._syncTitles) this._syncTitles();
      if (on) { this._editTiles = false; this._editBadges = false; }
      const page = on && this._bPage();
      if (page) this.classList.remove("contentpage");
      const open = on && (!!this._bOpen || page);
      const was = this.classList.contains("binsp");
      this.classList.toggle("binsp", open);
      this.classList.toggle("bpage", page);
      this._bTools(on);
      if (was !== open) this._bRefit();
      // Neu an (oder Handy gedreht): die Vorschau war ausgeblendet und hat nichts gemessen.
      const phone = this.classList.contains("phone");
      // Auch nach dem Laden eines anderen Dashboards: ob es ein Mobil-Layout hat, ändert sich dann.
      const reach = typeof this._phoneReachable === "function" && this._state ? this._phoneReachable() : false;
      const sig = on ? (phone ? "p" : "d") + "|" + (this._dashUrl || "") + "|" + reach : "";
      if (sig !== this._bSig) {
        this._bSig = sig;
        if (on && phone && typeof this._phoneReachable === "function" && this._phoneReachable()
          && this._miniSize !== "phone") { this._miniSize = "phone"; this._bSyncSize(); }
        if (this._state) requestAnimationFrame(() => { this._rebuildPreview(); this._bRefit(); });
      }
    };

    // Werkzeugleiste (Desktop/Tablet) und untere Leiste (Handy).
    P._bTools = function (on) {
      const root = this.shadowRoot;
      const row = root.querySelector(".toprow");
      let tools = root.querySelector(".btools");
      if (on && row && !tools) {
        tools = document.createElement("div");
        tools.className = "btools";
        tools.setAttribute("role", "toolbar");
        tools.setAttribute("aria-label", "Studio");
        const mk = (id, icon, label, onPick, cls) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btool " + (cls || "");
          b.dataset.b = id;
          b.innerHTML = svg(icon) + '<span class="blabel"></span>';
          b.querySelector(".blabel").textContent = label;
          b.title = label;
          b.setAttribute("aria-haspopup", id === "list" ? "false" : "menu");
          b.onclick = () => onPick(b);
          tools.appendChild(b);
          return b;
        };
        const rb = mk("rooms", "rooms", "Rooms", (b) => this._roomTitleMenu(b), "broom");
        // Raumnamen sind keine Casora-Texte: „Home“ stand sonst als „Zuhause“ neben dem
        // gleichnamigen Knopf für die Einstellungen aller Dashboards.
        rb.querySelector(".blabel").setAttribute("data-no-i18n", "");
        mk("list", "list", "Elements", () => this._bShowList());
        mk("dash", "dash", "Dashboard", (b) => this._bDashMenu(b));
        // UX-04: Einstellungen für alle Dashboards – nicht „Haus & Geräte“ (so heißt nur die erste Seite).
        mk("home", "gear", "Settings", (b) => this._bHomeMenu(b));
        const upd = mk("upd", "upd", "Update", () => this._cuFromMenu && this._cuFromMenu(), "bupd");
        upd.setAttribute("aria-haspopup", "false");
        const title = row.querySelector("#roomtitle");
        if (title && title.nextSibling) row.insertBefore(tools, title.nextSibling);
        else row.appendChild(tools);
      }
      if (tools) {
        const room = this._state && this._state.compact.rooms[this._room];
        const lab = tools.querySelector('[data-b="rooms"] .blabel');
        if (lab && room) lab.textContent = this._roomLabel(room);
        const list = tools.querySelector('[data-b="list"]');
        if (list) list.classList.toggle("on", !!this._bOpen && !this._sel && !this._bPage());
        // Update-Hinweis: dieselbe Zahl wie die (hier ausgeblendete) Zeile „Updates“.
        const n = this._bUpdates();
        const upd = tools.querySelector(".bupd");
        if (upd) {
          upd.classList.toggle("on", n > 0);
          upd.querySelector(".blabel").textContent = tr("Update") + (n > 1 ? " (" + n + ")" : "");
        }
      }
      if (on && tools) {
        const sig = tools.textContent + "|" + tools.querySelectorAll(".on").length;
        if (sig !== this._bFitSig) { this._bFitSig = sig; requestAnimationFrame(() => this._bFitTools()); }
      }
      // Handy: der Titel oben öffnet wie überall das Dashboard-Menü (Räume: untere Leiste).
      const nav = root.getElementById("navtitle");
      if (on && nav && !nav._bWired) {
        nav._bWired = true;
        const orig = nav.onclick;
        nav.onclick = (ev) => (this.classList.contains("bmode") && !this.classList.contains("flow")
          ? this._dashSwitchMenu(ev.currentTarget) : orig && orig.call(nav, ev));
      }
      const homeBtn = root.querySelector('.bbar [data-b="home"]');
      if (homeBtn) homeBtn.classList.toggle("bdot", this._bUpdates() > 0);
      // Schließen-Knopf im Inspektor.
      const insp = root.querySelector(".inspector");
      if (on && insp && !insp.querySelector(".bclose")) {
        const x = document.createElement("button");
        x.type = "button";
        x.className = "bclose";
        x.title = "Close";
        x.setAttribute("aria-label", "Close");
        x.innerHTML = svg("x");
        x.onclick = () => this._bClose();
        insp.appendChild(x);
      }
      // Handy: Abdunkelung hinter dem Blatt und die untere Leiste.
      const shell = root.querySelector(".shell") || root;
      if (on && !root.querySelector(".bscrim")) {
        const s = document.createElement("div");
        s.className = "bscrim";
        s.onclick = () => this._bClose();
        shell.appendChild(s);
      }
      if (on && !root.querySelector(".bbar")) {
        const bar = document.createElement("nav");
        bar.className = "bbar";
        bar.setAttribute("aria-label", "Studio");
        const mk = (id, icon, label, onPick, cls) => {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.b = id;
          if (cls) b.className = cls;
          b.innerHTML = svg(icon) + (cls ? "" : "<span></span>");
          if (!cls) b.querySelector("span").textContent = label;
          b.setAttribute("aria-label", label);
          b.onclick = () => onPick(b);
          bar.appendChild(b);
        };
        mk("rooms", "rooms", "Rooms", (b) => this._roomTitleMenu(b));
        mk("list", "list", "Elements", () => this._bShowList());
        mk("add", "plus", "Add a tile", () => this._bAddTile(), "bplus");
        mk("dash", "dash", "Dashboard", (b) => this._bDashMenu(b));
        mk("home", "gear", "Settings", (b) => this._bHomeMenu(b));
        shell.appendChild(bar);
      }
    };

    P._bFitTools = function () {
      const tools = this.shadowRoot.querySelector(".btools");
      const row = tools && tools.parentElement;
      if (!row || !tools.getClientRects().length) return;
      this.classList.remove("btight");
      const tr0 = tools.getBoundingClientRect();
      let next = tools.nextElementSibling;
      while (next && (!next.getClientRects().length || next.getBoundingClientRect().width < 2)) next = next.nextElementSibling;
      // Auch eng: der Dashboard-Name wird gekürzt („Test …“) oder die Knöpfe rechts
      // (Rückgängig, Fertig) rücken bis an die Beschriftungen – Tablet hochkant.
      const lab = row.querySelector("#roomtitle .rt-label");
      const pill = [...this.shadowRoot.querySelectorAll(".navpill")].find((x) => x.getClientRects().length
        && x.getBoundingClientRect().left > tr0.left);
      const tight = row.scrollWidth > row.clientWidth + 1 || (next && next.getBoundingClientRect().left < tr0.right + 8)
        || (lab && lab.scrollWidth > lab.clientWidth + 1)
        || (pill && pill.getBoundingClientRect().left < tr0.right + 20);
      this.classList.toggle("btight", !!tight);
    };

    P._bUpdates = function () {
      const b = this.shadowRoot.querySelector("#sidesections .cu-side .cu-badge");
      return b ? (parseInt(b.textContent, 10) || 1) : 0;
    };

    // „Elemente“: die Raumansicht mit allen Abschnitten, auch was in der Vorschau fehlt.
    P._bShowList = function () {
      if (this._bOpen && !this._sel && !this._bPage()) return this._bClose();
      this._bLeavePages();
      this._sel = null;
      this._group = "rooms";
      this._bOpen = true;
      this._renderForm();
      this._bFocusInspector();
    };

    // „Kachel hinzufügen“ (Platz in der Vorschau, am Handy „+“): Kachelliste im Inspektor und
    // gleich die Typauswahl. Der Platz der Vorschau rief bisher scrollIntoView auf – das schob
    // im neuen Aufbau die ganze Seite samt Vorschau aus dem Bild. Hier scrollt nur der Inspektor.
    P._bAddTile = function () {
      this._bLeavePages();
      this._group = "tiles";
      this._sel = null;
      this._stackOpenReq = "tiles";
      this._bOpen = true;
      this._renderForm();
      requestAnimationFrame(() => {
        const pane = this.shadowRoot.getElementById("pane");
        const bar = pane && pane.querySelector(".addbar.tileadd");
        const add = bar && bar.querySelector("button.scadd");
        if (!add) return;
        const insp = this.shadowRoot.querySelector(".inspector");
        for (let sc = bar.parentElement; sc && sc !== insp; sc = sc.parentElement) {
          if (sc.scrollHeight <= sc.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) continue;
          const r = bar.getBoundingClientRect(), rs = sc.getBoundingClientRect();
          sc.scrollTop += r.top - rs.top - Math.max(0, (rs.height - r.height) / 2);
          break;
        }
        setTimeout(() => { if (add.isConnected) add.click(); }, 120);
      });
    };

    P._bLeavePages = function () {
      this._bRooms = false;
      try { if (this._csOpen) this._csClose(); } catch (e) { /* weiter */ }
      try { if (this._cuOpen) this._cuClose(); } catch (e) { /* weiter */ }
      try { if (this._cvOpen) this._cvClose(); } catch (e) { /* weiter */ }
    };

    P._bClose = function () {
      if (this._openCombo) this._openCombo();
      // Offene Anfrage „Kacheln aufklappen“ (Kachel hinzufügen) hielt den Inspektor sonst offen:
      // am Handy ließ sich das Blatt danach weder per ✕ noch per Esc schließen.
      this._stackOpenReq = null;
      this._bLeavePages();
      this._bOpen = false;
      this._bRooms = false;
      if (this._sel) {
        this._sel = null;
        this._group = "rooms";
      }
      this._renderForm();
      this._bApply();
      // Fokus zurück an das Element, das den Inspektor geöffnet hat.
      const back = this._bFrom;
      this._bFrom = null;
      if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
      // Die Vorschau ist inzwischen neu gezeichnet: dasselbe Element über seinen Schlüssel suchen.
      else if (back && back.dataset && back.dataset.mk) this._bRefocus(back.dataset.mk);
    };

    P._bFocusInspector = function () {
      requestAnimationFrame(() => {
        const insp = this.shadowRoot.querySelector(".inspector");
        if (!insp) return;
        const first = insp.querySelector(".insphead button, .sheet h2, .sheet button, .sheet input");
        if (first && first.focus) first.focus({ preventScroll: true });
      });
    };

    // Symbole wie in der Seitenleiste des bisherigen Studios (Abschnitte bzw. Einstellungsseiten).
    const SECS = [
      ["General", "Look & Controls", "settings"], ["Weather", "Weather", "weather"], ["Time", "Time", "clock"],
      ["Notifications", "Notifications", "bell"], ["Scenes", "Scenes", "scenes"],
    ];
    P._bDashMenu = function (anchor) {
      // UX-03: nur Einstellungen dieses Dashboards. Zeitreise und Mobil-Layout gehören zum
      // Dashboard selbst und stehen im Titelmenü (_bDocItems).
      const items = SECS.map(([k, l, g]) => ({ id: "sec:" + k, label: l, glyph: g, plainGlyph: true,
        group: "Only this dashboard" }));
      this._menuAt(anchor, items, (id) => {
        if (id.indexOf("sec:") === 0) {
          const key = id.slice(4);
          this._bLeavePages();
          this._bFrom = anchor;
          this._select({ group: "rooms", key, label: key });
        }
      });
    };

    const PAGES = [
      ["home", "Home & Devices", "home"], ["alerts", "Bell & Alerts", "bell"], ["dashboards", "New Dashboards", "tile"],
      ["ai", "AI", "assist"], ["outdoor", "Outdoor & Price", "temp-medium"], ["vent", "Ventilation", "fan"],
    ];
    P._bHomeMenu = function (anchor) {
      const items = PAGES.map(([id, l, g]) => ({ id: "page:" + id, label: l, glyph: g, plainGlyph: true,
        group: "For all dashboards" }));
      if (typeof this._cuFromMenu === "function") {
        items.push({ id: "updates", label: "Updates", icon: "update", group: "For all dashboards" });
      }
      this._menuAt(anchor, items, (id) => {
        this._bFrom = anchor;
        this._bRooms = false;
        if (id === "updates") return this._cuFromMenu();
        if (id.indexOf("page:") === 0 && typeof this._csOpenPage === "function") {
          this._bOpen = true;
          return this._csOpenPage(id.slice(5));
        }
      });
    };

    // ── Unsichtbares sichtbar machen ───────────────────────────────────
    // Kacheln, die die Vorschau nicht zeigt (ausgeschaltet, nur am Handy, Bedingung oder
    // „nur wenn aktiv“ gerade nicht erfüllt), und ausgeschaltete Badges.
    P._bHidden = function () {
      const room = this._state && this._state.compact.rooms[this._room];
      const map = this.shadowRoot.querySelector(".card.map");
      const out = { tiles: [], badges: [] };
      if (!room || !map) return out;
      (room.tiles || []).forEach((t) => {
        const key = this._tileKey(t);
        const V = t.variables || {};
        let why = "";
        if (V.enabled === false) why = "Hidden";
        else if (V.surfaces === "phone") why = "Phone only";
        else {
          // data-mk trägt den Schlüssel dieses Raums; data-jump zeigt in der Handy-Vorschau auf
          // die Kachel des Mobil-Layouts (anderer Schlüssel) – sonst galt dort alles als verborgen.
          const el = map.querySelector('.mtile[data-mk="t:' + CSS.escape(key) + '"]:not(.bghost)')
            || map.querySelector('.mtile[data-jump="' + CSS.escape(key) + '"]:not(.bghost)');
          if (!el || el.style.display === "none") why = "Hidden right now";
        }
        if (why) out.tiles.push({ key, why, label: this._tileLabelFor(key) || t.name || key,
          glyph: this._tileGlyphFor ? this._tileGlyphFor(key) : "tile" });
      });
      map.querySelectorAll(".pbadge.ghost").forEach((el) => {
        const g = el.querySelector(".pglyph");
        const m = g && /url\(["']?(.*?)["']?\)/.exec(g.style.getPropertyValue("--i") || "");
        out.badges.push({ el, label: (el.textContent || "").trim(), glyphUrl: m ? m[1] : null });
      });
      return out;
    };

    const tr = (x) => (window.casoraI18n && window.casoraI18n.t ? window.casoraI18n.t(x) : x);

    P._bDecorate = function () {
      if (!this.classList.contains("bmode")) return;
      const root = this.shadowRoot;
      const map = root.querySelector(".card.map");
      if (!map) return;
      const hid = this._bHidden();
      // Gestrichelte Platzhalter für ausgeblendete Kacheln, hinten in der Reihe.
      const row = map.querySelector(".mini-tiles");
      const ghosts = hid.tiles.filter((h) => h.why === "Hidden");
      const gsig = ghosts.map((h) => h.key + "|" + h.label).join(",");
      // Nur bei Änderung neu einsetzen – der Beobachter der Vorschau sähe sonst jede Runde neu.
      const same = row && row._bSig === gsig && row.querySelectorAll(".bghost").length === ghosts.length;
      if (!same) map.querySelectorAll(".bghost").forEach((n) => n.remove());
      if (row && !same) {
        row._bSig = gsig;
        ghosts.forEach((h) => {
          const g = document.createElement("div");
          g.className = "mtile ghost bghost";
          g.dataset.mk = "t:" + h.key;
          g.innerHTML = '<span class="bgn"></span><span class="bgw"></span>';
          g.querySelector(".bgn").textContent = h.label;
          g.querySelector(".bgw").textContent = tr(h.why);
          g.setAttribute("data-no-i18n", "");
          g.title = h.label + " · " + tr(h.why);
          row.appendChild(g);
        });
      }
      // Alles Anklickbare ist auch per Tastatur erreichbar.
      map.querySelectorAll("[data-mk], [data-pv], .mtile.ghost, .pbadge.ghost, .mini-tab").forEach((el) => {
        if (el.tabIndex < 0 || !el.hasAttribute("tabindex")) el.tabIndex = 0;
        el.setAttribute("role", "button");
        // Name aus dem sichtbaren Text: der Tooltip ist teils ein Hinweis („Intelligente
        // Sortierung ist an …“) und taugt nicht als Name für Screenreader.
        const nm = el.querySelector(".mname, .plabel, .bgn");
        const t = ((nm && nm.textContent) || el.textContent || el.title || "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (t && el.getAttribute("aria-label") !== t) el.setAttribute("aria-label", t);
      });
      if (!map._bWired) {
        map._bWired = true;
        map.addEventListener("keydown", (ev) => this._bMapKey(ev));
        map.addEventListener("pointerdown", (ev) => this._bBadgeDown(ev), true);
        map.addEventListener("pointerdown", (ev) => {
          const el = ev.target.closest && ev.target.closest("[data-mk], [data-pv]");
          if (!el || ev.button) return;
          el.classList.add("bpress");
          const off = () => {
            el.classList.remove("bpress");
            window.removeEventListener("pointerup", off, true);
            window.removeEventListener("pointercancel", off, true);
          };
          window.addEventListener("pointerup", off, true);
          window.addEventListener("pointercancel", off, true);
        }, true);
        // Nach einem Ziehen löst das Loslassen keinen Klick aus.
        map.addEventListener("click", (ev) => {
          if (this._bDragged) { ev.stopPropagation(); ev.preventDefault(); return; }
          // Platz „Kachel hinzufügen“: eigener Ablauf ohne Seiten-Scrollen (_bAddTile).
          const slot = ev.target.closest && ev.target.closest(".mtile.ghost:not(.bghost)");
          if (slot) { ev.stopPropagation(); ev.preventDefault(); this._bFrom = slot; this._bAddTile(); }
        }, true);
        // Touch: nach langem Drücken scrollt die Seite nicht mehr, das Ziehen hat Vorrang.
        map.addEventListener("touchmove", (ev) => { if (this._bHold) ev.preventDefault(); }, { passive: false });
        map.addEventListener("contextmenu", (ev) => { if (this._bHold) ev.preventDefault(); });
      }
      this._bHiddenChip(hid);
      this._bPhoneHint();
    };

    // „N ausgeblendet“ unter der Vorschau: Liste aller unsichtbaren Dinge.
    P._bHiddenChip = function (hid) {
      const canvas = this.shadowRoot.querySelector(".canvas");
      if (!canvas) return;
      let chip = canvas.querySelector(".bhid");
      const n = hid.tiles.length + hid.badges.length;
      if (!n) { if (chip) chip.remove(); return; }
      if (!chip) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "bhid";
        chip.setAttribute("aria-haspopup", "menu");
        chip.setAttribute("data-no-i18n", "");
        chip.onclick = () => {
          const h = this._bHidden();
          const items = [
            ...h.tiles.map((x) => ({ id: "t:" + x.key, label: tr(x.label) + " · " + tr(x.why), group: tr("Tiles"),
              quiet: true, glyph: x.glyph, plainGlyph: true })),
            ...h.badges.map((x, i) => ({ id: "b:" + i, label: x.label, group: tr("Badges"), quiet: true,
              glyph: x.glyphUrl ? null : "badge", glyphUrl: x.glyphUrl || null, plainGlyph: true })),
          ];
          this._menuAt(chip, items, (id) => {
            if (id.indexOf("t:") === 0) return this._select({ group: "tiles", key: id.slice(2) });
            const b = h.badges[+id.slice(2)];
            if (b && b.el && b.el.isConnected) b.el.click();
          });
        };
      }
      // Desktop/Tablet: neben dem Umschalter Desktop/Tablet/Mobil. Unter der Vorschau lag der
      // Knopf bei großer Vorschau halb unter dem Fensterrand (die Bühne scrollt nicht).
      // Handy: unten über der Leiste (CSS, fixed).
      const row = !this.classList.contains("phone") && canvas.querySelector(".segrow");
      if (row) { if (chip.parentElement !== row) row.appendChild(chip); }
      else {
        const pl = canvas.querySelector(".plinth");
        if (chip.parentElement !== canvas || (pl && chip.previousElementSibling !== pl)) {
          if (pl) pl.after(chip); else canvas.appendChild(chip);
        }
      }
      chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/></svg>';
      chip.appendChild(document.createTextNode(tr("{n} hidden").replace("{n}", n)));
    };

    // Handy ohne Mobil-Layout: die Vorschau ist nur verkleinert – Hinweis zum Anlegen.
    P._bPhoneHint = function () {
      const canvas = this.shadowRoot.querySelector(".canvas");
      if (!canvas) return;
      let hint = canvas.querySelector(".bphint");
      const want = this.classList.contains("phone") && typeof this._phoneReachable === "function"
        && !this._phoneReachable() && this._canAddMobile && this._canAddMobile();
      if (!want) { if (hint) hint.remove(); return; }
      if (!hint) {
        hint = document.createElement("button");
        hint.type = "button";
        hint.className = "bhid bphint";
        hint.textContent = "Create a phone layout for a phone preview";
        hint.onclick = () => this._addMobileSibling();
        const pl = canvas.querySelector(".plinth");
        if (pl) pl.after(hint); else canvas.appendChild(hint);
      }
    };

    // ── Reihenfolge: Kacheln und Badges in der Vorschau ────────────────
    const room$ = (p) => p._state && p._state.compact.rooms[p._room];
    const bidOf = (el) => String((el && el.dataset.mk) || "").replace(/^b:/, "").split(":")[0];

    P._bSetBadges = function (room, visibleIds) {
      const I = window.__casoraPanelInternals || {};
      const full = this._badgeOrder(room).slice();
      const slots = full.map((id, i) => (visibleIds.includes(id) ? i : -1)).filter((i) => i >= 0);
      const next = full.slice();
      slots.forEach((slot, k) => { next[slot] = visibleIds[k]; });
      const ids = I.badgeOrderOf ? I.badgeOrderOf(next) : next;
      room.variables = room.variables || {};
      room.variables.badge_order = ids;
      if (this._mirrorToPair) this._mirrorToPair("badge_order", ids, [room]);
      this._markDirty();
      this._mapSig = null;
      this._renderForm();
      // Die Handy-Vorschau baut ihre Badge-Reihe nicht bei jedem Zeichnen neu.
      this._rebuildPreview();
    };

    P._bVisibleBadges = function () {
      return [...this.shadowRoot.querySelectorAll('.card.map .pbadge[data-mk^="b:"]:not(.ghost)')];
    };

    P._bMoveTile = function (key, d) {
      const room = room$(this);
      if (!room) return false;
      if (this._smartSortOn && this._smartSortOn()) {
        if (this._status) this._status("Smart Sort is on – reorder in the Tiles list", "info");
        return false;
      }
      const tiles = room.tiles || [];
      const i = tiles.findIndex((t) => this._tileKey(t) === key);
      const j = i + d;
      if (i < 0 || j < 0 || j >= tiles.length) return false;
      const [x] = tiles.splice(i, 1);
      tiles.splice(j, 0, x);
      this._markDirty();
      this._mapSig = null;
      this._renderForm();
      return true;
    };

    P._bMoveBadge = function (bid, d) {
      const room = room$(this);
      const ids = this._bVisibleBadges().map(bidOf).filter((x, i, a) => a.indexOf(x) === i);
      const i = ids.indexOf(bid);
      const j = i + d;
      if (!room || i < 0 || j < 0 || j >= ids.length) return false;
      const [x] = ids.splice(i, 1);
      ids.splice(j, 0, x);
      this._bSetBadges(room, ids);
      return true;
    };

    P._bRefocus = function (mk) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = this.shadowRoot.querySelector('.card.map [data-mk="' + CSS.escape(mk) + '"]');
        if (el && el.focus) el.focus({ preventScroll: true });
      }));
    };

    P._bMapKey = function (ev) {
      const el = ev.target.closest ? ev.target.closest('[role="button"]') : null;
      if (!el) return;
      if ((ev.key === "Enter" || ev.key === " ") && !ev.altKey) {
        ev.preventDefault();
        this._bFrom = el;
        this._bKbd = true;
        el.click();
        // Per Tastatur geöffnet: der Fokus wandert in den Inspektor.
        if (this._bKbd) { this._bKbd = false; if (this.classList.contains("binsp")) this._bFocusInspector(); }
        return;
      }
      if (!ev.altKey) return;
      const d = ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1
        : (ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : 0);
      if (!d) return;
      const mk = el.dataset.mk || "";
      let ok = false;
      if (mk.indexOf("t:") === 0 && !el.classList.contains("ghost")) ok = this._bMoveTile(mk.slice(2), d);
      else if (mk.indexOf("b:") === 0 && !el.classList.contains("ghost")) ok = this._bMoveBadge(bidOf(el), d);
      else return;
      ev.preventDefault();
      if (ok) this._bRefocus(mk);
    };

    // Langes Drücken (Touch) bzw. Ziehen mit der Maus sortiert die Badges.
    P._bBadgeDown = function (ev) {
      if (!this.classList.contains("bmode") || ev.button) return;
      const pill = ev.target.closest && ev.target.closest('.pbadge[data-mk^="b:"]:not(.ghost)');
      if (!pill) return;
      const pills = this._bVisibleBadges();
      const me = pills.indexOf(pill);
      if (me < 0 || pills.length < 2) return;
      const touch = ev.pointerType === "touch";
      const rects = pills.map((p) => p.getBoundingClientRect());
      const sx = ev.clientX, sy = ev.clientY;
      const scale = (this._mapVis && this._mapVis.scale) || 1;
      let moved = false, target = me, timer = null;
      if (touch) {
        timer = setTimeout(() => { this._bHold = true; pill.classList.add("blift"); }, 320);
      }
      const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];
      const onMove = (e2) => {
        const dx = e2.clientX - sx, dy = e2.clientY - sy;
        if (!moved) {
          if (touch && !this._bHold) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) end(true);
            return;
          }
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
          moved = true;
          pill.classList.add("mdrag");
          try { pill.setPointerCapture(ev.pointerId); } catch (e) { /* ohne */ }
        }
        pill.style.transform = "translate(" + dx / scale + "px," + dy / scale + "px)";
        let best = me, bd = Infinity;
        rects.forEach((r, k) => {
          const [cx, cy] = center(r);
          const dd = Math.hypot(e2.clientX - cx, e2.clientY - cy);
          if (dd < bd) { bd = dd; best = k; }
        });
        target = best;
        pills.forEach((p, k) => p.classList.toggle("btarget", k === target && k !== me));
      };
      const end = (cancel) => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancelUp);
        pill.classList.remove("mdrag", "blift");
        pills.forEach((p) => { p.classList.remove("btarget"); });
        pill.style.transform = "";
        this._bHold = false;
        if (cancel || !moved) return;
        this._bDragged = true;
        setTimeout(() => { this._bDragged = false; }, 0);
        if (target === me) return;
        // Getrennte Klima-/Sicherheits-Badges (climate:0, :1 …) gehören zu einer Karte:
        // sortiert wird nach Karte, nicht nach einzelner Pille.
        const ids = pills.map(bidOf).filter((v, i, a) => a.indexOf(v) === i);
        const mine = bidOf(pill), there = bidOf(pills[target]);
        if (mine === there) return;
        const from = ids.indexOf(mine);
        ids.splice(from, 1);
        const at = ids.indexOf(there);
        ids.splice(target > me ? at + 1 : at, 0, mine);
        const room = room$(this);
        if (room) this._bSetBadges(room, ids);
      };
      const up = () => end(false);
      const cancelUp = () => end(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancelUp);
    };

    // ── Haken in bestehende Abläufe ────────────────────────────────────
    const after = (name, fn) => {
      const orig = P[name];
      if (typeof orig !== "function") return;
      P[name] = function () {
        const r = orig.apply(this, arguments);
        try { fn.call(this, r, arguments); } catch (e) { console.warn("Casora Studio B:", e); }
        return r;
      };
    };
    const before = (name, fn) => {
      const orig = P[name];
      if (typeof orig !== "function") return;
      P[name] = function () {
        try { fn.call(this, arguments); } catch (e) { console.warn("Casora Studio B:", e); }
        return orig.apply(this, arguments);
      };
    };

    // Auswahl öffnet den Inspektor; wer ausgewählt hat, bekommt später den Fokus zurück.
    before("_select", function () {
      if (!this.classList.contains("bmode")) return;
      this._bRooms = false;
      this._bOpen = true;
      const a = this.shadowRoot.activeElement;
      if (a && a.closest && a.closest(".card.map, .btools, .bbar")) this._bFrom = a;
    });
    before("_pvPick", function () { if (this.classList.contains("bmode")) this._bOpen = true; });
    before("_openRoomSec", function () { if (this.classList.contains("bmode")) this._bOpen = true; });
    // Hat dieser Durchlauf die Vorschau selbst neu gebaut? (Desktop: ja, beim Raumwechsel.)
    const renderForm0 = P._renderForm;
    P._renderForm = function () {
      const tok = this._mapSwap;
      const r = renderForm0.apply(this, arguments);
      this._bSwapped = this._mapSwap !== tok;
      return r;
    };
    before("_renderForm", function () {
      // „Kachel hinzufügen“ in der Vorschau will die Liste offen haben.
      if (this._stackOpenReq && this.classList.contains("bmode")) this._bOpen = true;
    });
    after("_renderForm", function () {
      this._bApply();
      this._bRoomsPaint();
      // UX-08: „Kachel entfernen“ unten im Editor – dieselbe Aktion wie im „…“-Menü.
      if (this.classList.contains("bmode") && this._sel && this._sel.group === "tiles") {
        const box = this.shadowRoot.querySelector("#pane #band-tiles .tile.sel");
        const del = box && box.querySelector(":scope > .delbtn");
        if (box && del && !box.querySelector(":scope > .bremove")) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "bremove";
          b.textContent = "Remove tile";
          b.onclick = () => del.click();
          box.appendChild(b);
        }
      }
      // Raumwechsel: am Handy zeichnet _renderForm die Vorschau nicht von selbst neu. Am Desktop
      // hat es das gerade getan – ein zweites Mal im nächsten Bild war doppelte Arbeit.
      if (this.classList.contains("bmode") && this._bRoomSeen !== this._room) {
        this._bRoomSeen = this._room;
        if (!this._bSwapped) requestAnimationFrame(() => this._syncPreview());
      }
    });
    after("_swapMap", function () {
      this._bDecorate();
      // Die Vorschau tauscht weich über; danach noch einmal (neue Elemente).
      requestAnimationFrame(() => this._bDecorate());
    });
    ["_csOpenPage", "_csClose", "_cuOpenPage", "_cuClose", "_cvOpenPage", "_cvClose", "_renderTabs"].forEach((n) => after(n, function (r) {
      this._bApply();
      if (r && typeof r.then === "function") r.then(() => this._bApply());
    }));

    // „…“-Menü: Eintrag „Neues Studio“ zum Umschalten.
    const menuAt = P._menuAt;
    P._menuAt = function (anchor, items, onPick, mopts) {
      // UX-03: Umbenennen, Symbol, Zeitreise, Mobil-Layout und Löschen stehen im neuen Studio im Titelmenü.
      if (this.classList.contains("bmode") && Array.isArray(items) && items.some((x) => x && x.id === "hints")) {
        const DOC = ["renamedash", "icondash", "delete", "addmobile", "casora_versions"];
        items = items.filter((x) => !(x && DOC.indexOf(x.id) >= 0));
      }
      if (Array.isArray(items) && items.some((x) => x && x.id === "hints") && !items.some((x) => x && x.id === "studio_b")) {
        const at = items.findIndex((x) => x && x.id === "hints");
        items = items.slice();
        items.splice(at, 0, { id: "studio_b", label: "New Studio", glyph: "tile", plainGlyph: true, checked: this._bOn() });
        const pick = onPick;
        onPick = (id) => (id === "studio_b" ? this._bSetOn(!this._bOn()) : pick(id));
      }
      // Raummenü in B: Räume sortieren (die Raumliste der Seitenleiste fehlt hier).
      if (this.classList.contains("bmode") && Array.isArray(items)
        && items.some((x) => x && x.id === "rename" && x.group === "This Room")) {
        const rooms = (this._state && this._state.compact.rooms) || [];
        const I = window.__casoraPanelInternals || {};
        const home = (i) => !!(I.isHomeRoom && I.isHomeRoom(rooms[i], rooms));
        const i = this._room;
        items = items.slice();
        // UX-05: ganze Reihenfolge auf einen Blick (Ziehen, Alphabetisch) statt Schritt für Schritt.
        const add = items.findIndex((x) => x && x.id === "add");
        if (add >= 0) items.splice(add + 1, 0, { id: "barrange", label: "Arrange Rooms\u2026", glyph: "rooms", plainGlyph: true,
          group: items[add].group, quiet: true, disabled: rooms.length < 2 });
        items.splice(items.findIndex((x) => x && x.id === "rename") + 1, 0,
          { id: "bmove:-1", label: "Move earlier", glyph: "arrow-up", plainGlyph: true, group: "This Room", quiet: true,
            disabled: i <= 0 || home(i) || home(i - 1) },
          { id: "bmove:1", label: "Move later", glyph: "arrow-down", plainGlyph: true, group: "This Room", quiet: true,
            disabled: i >= rooms.length - 1 || home(i) });
        const pick = onPick;
        onPick = (id) => {
          if (id === "barrange") return this._bRoomsOpen();
          if (String(id).indexOf("bmove:") === 0) {
            this._moveRoom(this._room, this._room + Number(id.slice(6)));
            this._markDirty();
            return;
          }
          return pick(id);
        };
      }
      return menuAt.call(this, anchor, items, onPick, mopts);
    };

    // ── UX-05: Räume ordnen ─────────────────────────────────────────────
    P._bRoomsOpen = function () {
      this._bLeavePages();
      this._sel = null;
      this._group = "rooms";
      this._bOpen = true;
      this._bRooms = true;
      this._renderForm();
      requestAnimationFrame(() => {
        const r = this.shadowRoot.querySelector("#pane .brow.on") || this.shadowRoot.querySelector("#pane .brow");
        if (r) r.focus({ preventScroll: true });
      });
    };

    const isHome = (rooms, r) => {
      const I = window.__casoraPanelInternals || {};
      return !!(I.isHomeRoom && I.isHomeRoom(r, rooms));
    };

    P._bRoomsSort = function () {
      const rooms = this._state.compact.rooms;
      const cur = rooms[this._room];
      const fixed = rooms.filter((r) => isHome(rooms, r));
      const lang = (this._hass && this._hass.language) || undefined;
      const rest = rooms.filter((r) => !isHome(rooms, r))
        .sort((a, b) => this._roomLabel(a).localeCompare(this._roomLabel(b), lang, { sensitivity: "base" }));
      const next = fixed.concat(rest);
      if (next.every((r, k) => r === rooms[k])) return;
      rooms.splice(0, rooms.length, ...next);
      this._room = Math.max(0, rooms.indexOf(cur));
      this._renderTabs();
      this._renderForm();
      this._markDirty();
    };

    P._bRoomsMove = function (from, to) {
      const rooms = this._state.compact.rooms;
      const first = rooms.findIndex((r) => !isHome(rooms, r));
      if (first < 0 || from < first || to < first || to >= rooms.length || to === from) return false;
      this._moveRoom(from, to);
      this._markDirty();
      return true;
    };

    P._bRoomsPaint = function () {
      const root = this.shadowRoot;
      const want = !!this._bRooms && this.classList.contains("bmode") && !this._sel && !this._bPage() && this._state;
      const insp = root.querySelector(".inspector");
      const head = insp && insp.querySelector(".insphead");
      const pane = root.getElementById("pane");
      // Eigene Kopfzeile neben der des Panels (die bleibt unangetastet, nur ausgeblendet).
      let own = head && head.querySelector(":scope > .broomshead");
      if (insp) insp.classList.toggle("brooms-on", !!want);
      if (!want) { if (own) own.remove(); return; }
      if (!pane || !head) return;
      const I = window.__casoraPanelInternals || {};
      const rooms = this._state.compact.rooms;
      if (!own) {
        own = document.createElement("div");
        own.className = "navrow broomshead";
        own.innerHTML = '<div class="detailbar rootlevel"><h3></h3></div>';
        head.appendChild(own);
      }
      own.querySelector("h3").textContent = tr("Arrange Rooms");
      pane.innerHTML = "";
      const card = document.createElement("section");
      card.className = "card brooms";
      const list = document.createElement("div");
      list.setAttribute("role", "list");
      rooms.forEach((r, i) => {
        const fixed = isHome(rooms, r);
        const row = document.createElement("div");
        row.className = "brow" + (i === this._room ? " on" : "");
        row.dataset.i = String(i);
        row.tabIndex = 0;
        row.setAttribute("role", "listitem");
        row.setAttribute("data-no-i18n", "");
        const g = document.createElement("span");
        g.className = "bri";
        if (I.roomIconSrc && I.roomGlyph) g.style.setProperty("--i", "url('" + I.roomIconSrc(I.roomGlyph(r.name, r)) + "')");
        const n = document.createElement("span");
        n.className = "bn";
        n.textContent = this._roomLabel(r);
        row.append(g, n);
        if (fixed) {
          const f = document.createElement("span");
          f.className = "bfix";
          f.textContent = tr("Always first");
          row.appendChild(f);
        } else {
          const grip = document.createElement("span");
          grip.className = "bgrip";
          grip.setAttribute("aria-hidden", "true");
          grip.innerHTML = svg("list").replace("M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01", "M5 8h14M5 12h14M5 16h14");
          row.appendChild(grip);
          grip.addEventListener("pointerdown", (ev) => this._bRoomsDrag(ev, row, list));
        }
        row.setAttribute("aria-label", this._roomLabel(r) + (fixed ? "" : ", " + tr("Alt+Arrow keys move")));
        row.onclick = () => {
          if (this._bRoomsDragged || i === this._room) return;
          this._room = i;
          this._renderTabs();
          this._renderForm();
          this._bRoomsFocus(i);
        };
        row.onkeydown = (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); return; }
          const d = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
          if (!d) return;
          ev.preventDefault();
          if (ev.altKey) { if (this._bRoomsMove(i, i + d)) this._bRoomsFocus(i + d); return; }
          const to = list.children[i + d];
          if (to) to.focus();
        };
        list.appendChild(row);
      });
      card.appendChild(list);
      const acts = document.createElement("div");
      acts.className = "broomacts";
      const mkBtn = (label, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = tr(label);
        b.setAttribute("data-no-i18n", "");
        b.onclick = fn;
        acts.appendChild(b);
      };
      mkBtn("Sort A\u2013Z", () => this._bRoomsSort());
      mkBtn("Add Room\u2026", () => this._addRoom());
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = tr("Drag to change the order. It applies on desktop, tablet and phone.");
      hint.setAttribute("data-no-i18n", "");
      // .col > .card: dieselbe Kartenfläche wie die übrigen Listen im Inspektor.
      const col = document.createElement("div");
      col.className = "col";
      col.appendChild(card);
      pane.append(col, acts, hint);
    };

    P._bRoomsFocus = function (i) {
      requestAnimationFrame(() => {
        const r = this.shadowRoot.querySelector('#pane .brow[data-i="' + i + '"]');
        if (r) r.focus({ preventScroll: true });
      });
    };

    P._bRoomsDrag = function (ev, row, list) {
      if (ev.button) return;
      ev.preventDefault();
      const rows = [...list.children];
      const me = rows.indexOf(row);
      const rects = rows.map((r) => r.getBoundingClientRect());
      const rooms = this._state.compact.rooms;
      const first = rooms.findIndex((r) => !isHome(rooms, r));
      const sy = ev.clientY;
      let target = me, moved = false;
      row.classList.add("bdrag");
      rows.forEach((r) => { if (r !== row) r.classList.add("bmoving"); });
      const h = rects[me].height;
      const onMove = (e) => {
        const dy = e.clientY - sy;
        if (Math.abs(dy) > 3) moved = true;
        row.style.transform = "translateY(" + dy + "px)";
        const y = rects[me].top + h / 2 + dy;
        let t = me;
        for (let k = me + 1; k < rects.length; k++) if (y > rects[k].top + rects[k].height / 2) t = k;
        for (let k = me - 1; k >= 0; k--) if (y < rects[k].top + rects[k].height / 2) t = k;
        target = Math.max(first, t);
        rows.forEach((r, k) => {
          if (r === row) return;
          const shift = me < target && k > me && k <= target ? -h : (me > target && k < me && k >= target ? h : 0);
          r.style.transform = shift ? "translateY(" + shift + "px)" : "";
        });
      };
      const end = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        rows.forEach((r) => { r.style.transform = ""; r.classList.remove("bdrag", "bmoving"); });
        if (moved) { this._bRoomsDragged = true; setTimeout(() => { this._bRoomsDragged = false; }, 0); }
        if (moved && target !== me && this._bRoomsMove(me, target)) this._bRoomsFocus(target);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };

    // Esc schließt den Inspektor (Menüs und Dialoge zuerst). Einmal je Element verdrahtet –
    // connectedCallback lässt sich nach customElements.define nicht mehr umhängen.
    P._bWireKeys = function () {
      if (this._bKeys) return;
      this._bKeys = true;
      // Drehen oder HA-Seitenleiste auf/zu: Lage des Inspektors (rechts/unten) neu bestimmen.
      if (window.ResizeObserver) new ResizeObserver(() => { if (this.isConnected) this._bApply(); }).observe(this);
      this.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || !this.classList.contains("binsp")) return;
        if (this._openCombo) return;
        // Offene Dialoge (Rückfrage, Auswahlblatt) schließen zuerst selbst.
        if ([...this.shadowRoot.querySelectorAll(".askpane, .psheet-panel")].some((n) => n.getClientRects().length)) return;
        ev.preventDefault();
        ev.stopPropagation();
        this._bClose();
      }, true);
    };
    after("_bApply", function () {
      this._bWireKeys();
      // Die Vorschau wird an mehreren Stellen (auch zeitversetzt) neu gebaut: jede neue
      // Karte bekommt Platzhalter, Tastatur und Ziehen.
      const mount = this.shadowRoot.getElementById("mapmount");
      if (mount && !this._bObs) {
        let q = 0;
        this._bObs = new MutationObserver(() => {
          if (q || !this.classList.contains("bmode")) return;
          q = requestAnimationFrame(() => { q = 0; this._bDecorate(); });
        });
        this._bObs.observe(mount, { childList: true, subtree: true });
      }
    });
  });
})();
