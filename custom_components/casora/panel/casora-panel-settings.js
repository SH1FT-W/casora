// Studio → "Settings" (30.09.2026)
//
// Everything that applies to all dashboards in one place: in the "Casora" section at the
// bottom of the sidebar, above the updates, with subpages. Two stores:
//   • Home & Devices, Bell & Alerts, New Dashboards – casora/settings/*
//     (sections from casora-panel-personal.js, window.CASORA_SETTINGS as before)
//   • AI, Outdoor & Price, Ventilation – the integration's options
//     (casora/options/*, options.py; the same as HA → Casora → Configure)
// One draft for both, one "Save"; unsaved, it stays until a reload.
// Updates no longer need access (public repo, update_source.py).
// Phone: the same subpages as a sheet, reachable in the section list.
(function () {
  const OPTIONS_PATH = "/config/integrations/integration/casora";
  const I = () => window.__casoraPanelInternals || {};
  const icon = (name) => (I().iconUrl ? I().iconUrl(name) : "");
  // Icon color from the panel's central table (STUDIO_ICON, casora-panel.js).
  const tint = (p) => (I().studioIcon ? I().studioIcon(p.tone) : "var(--ink)");

  // Earlier page ids (variant B topics and subpages, still used by jumps from the Studio, the bell and saved links)
  // lead to the tile and block that hold them now: [tile page, block, block of a "home" focus].
  const ROUTE = {
    start: ["n-start"], "start-list": ["n-start"],
    "t-look": ["n-look"], "t-msg": ["n-bell"], "t-house": ["n-house"], "t-wx": ["n-wx"], "t-ctl": ["n-use"], "t-ext": ["n-ai"],
    design: ["n-look", "nb-design"], calendar: ["n-house", "nb-calendars"], alerts: ["n-bell", "nb-notify"],
    dashboards: ["n-system", "nb-basis"], ai: ["n-ai", "nb-ai"], outdoor: ["n-wx", "nb-outdoor"], vent: ["n-bell", "nb-vent"],
    live: ["n-phone", "nb-live"], fuel: ["n-wx", "nb-fuel"], home: ["n-house"],
  };
  // A focus inside an earlier page (a group of casora-panel-personal.js) → its block.
  const FOCUS_BLOCK = { waste: "waste", contacts: "contacts", security: "security", scenes: "scenes", media: "media",
    devices: "devices", calendars: "calendars", notify: "notify", notify_exclude: "notify", battery: "battery", basis: "basis", umzug: "umzug" };
  const route = (pageId, focus) => {
    const id = String(pageId || "n-start");
    if (/^n-/.test(id)) return [id, focus];
    const r = ROUTE[id] || ["n-start"];
    const fb = focus && FOCUS_BLOCK[focus];
    if (fb) {
      const tile = NEU.find((x) => x.blocks.some((b) => b.k === fb));
      if (tile) return ["n-" + tile.id, "nb-" + fb];
    }
    return [r[0], r[1]];
  };
  // ── Settings, new structure (prototype, 01.11.2026) ─────────────────────────────────────────────
  // Eight big tiles named by what people want to do (replaces the topics of 26.10. and their subpages, 03.11.2026), at most two levels (tile → its page). A tile page renders the existing controls of its
  // blocks directly (same draft, same "Save settings"); blocks marked adv sit in a folded "Advanced" part that is
  // only drawn when opened. Blocks with sec show the fields of a section of this dashboard (sub: one part of it, keys:
  // only these fields), drawn by the Studio's own section code; one bar saves everything (settings and dashboard).
  // Every block has one plain sentence; kw holds the field labels and everyday words for the search.
  // window.casoraSettingsMap exposes this table for the regress test that walks every block.
  const NEU = [
    { id: "look", label: "Look & feel", icon: "desktop", tone: "set-design",
      sub: "Colors and design, font, clock – how your dashboards look.",
      blocks: [
        { k: "design", page: "design", title: "Design", plain: "Pick how all Casora dashboards look.",
          kw: "design theme thema farben farbe hintergrund dunkel hell glas nebel aussehen look colors" },
        { k: "time", sec: "Time", title: "Clock", plain: "Show the clock at the top left, as 12 or 24 hours.",
          kw: "uhr uhrzeit zeit 12 stunden 24 clock time zeitsensor suffix" },
        { k: "font", sec: "General", sub: "text", title: "Font", plain: "The typeface of this dashboard, or a font you bring yourself.",
          kw: "schrift schriftart font inter hanken eigene schrift hochladen" },
        { k: "chrome", sec: "General", sub: "chrome", keys: ["show_assist", "badges_wrap", "casora_hide_header"],
          title: "Top bar and badges", adv: true,
          plain: "Assist button, the Home Assistant title bar and badges on several lines.",
          kw: "kopfzeile header assist taste badges umbrechen zeilen leiste" },
      ] },
    { id: "use", label: "Tapping & tablet", icon: "settings", tone: "set-dashboards",
      sub: "What tapping and holding a tile does, and how a wall tablet behaves.",
      blocks: [
        { k: "hold", sec: "General", sub: "hold", title: "Hold and sort tiles",
          plain: "What happens when you hold a tile, and when busy tiles move to the front.",
          kw: "halten gedrückt halten schnellmenü popup sortieren reihenfolge hold sort" },
        // #186: phone and tablet alike, so here and not under Phone (the field moved to the part chrome).
        { k: "swipe", sec: "General", sub: "chrome", keys: ["swipe_rooms"], title: "Swipe between rooms",
          plain: "On a phone or tablet, swipe left or right on Home or an open room to get to the next or previous room, in the order of the room menu.",
          kw: "wischen swipe räume wechseln blättern tablet handy nächster raum" },
        { k: "screen", sec: "General", sub: "chrome", keys: ["casora_idle_home"], title: "Wall tablet",
          plain: "Go back to Home after a while without use.",
          kw: "tablet inaktivität zurück zuhause idle kiosk wand" },
        { k: "dialogs", sec: "General", sub: "dialogs", title: "Home Assistant detail windows", adv: true,
          plain: "What the windows of Home Assistant itself show: logbook, history, attributes.",
          kw: "logbuch verlauf attribute brotkrumen lichtaktionen dialog mehr infos kiosk-mode" },
        { k: "perf", sec: "General", sub: "perf", title: "Speed", adv: true,
          plain: "Plain panels instead of frosted glass, so slow devices keep up.",
          kw: "leistung performance schnell langsam glas unschärfe" },
      ] },
    { id: "saver", label: "Screensaver", icon: "clock", tone: "set-saver",
      sub: "What a wall tablet shows when nobody touches it.",
      blocks: [
        { k: "saver", sec: "General", sub: "chrome", keys: ["casora_screensaver", "casora_screensaver_kind", "casora_screensaver_photos"], saver: true,
          title: "Screensaver", plain: "Pick a screensaver and after how long it starts. The picture shows what it looks like.",
          kw: "bildschirmschoner screensaver wandtablet tablet uhr wortuhr himmel landschaft fotos leerlauf idle ruhe" },
      ] },
    { id: "phone", label: "Phone", icon: "iphone", tone: "set-live",
      sub: "The dashboard on the phone, and progress on the lock screen.",
      blocks: [
        { k: "phone", sec: "General", sub: "phone", title: "Dashboard on the phone",
          plain: "Search at the top, rooms by category, how soft the room photo is, tile size.",
          kw: "handy suche raumfoto unschärfe kategorien kachelgröße automatisch phone search" },
        { k: "live", page: "live", title: "Lock screen (Live Activities)",
          plain: "Washing machine, dryer, dishwasher, robot vacuum and 3D printer show their progress on the lock screen.",
          kw: "live aktivitäten sperrbildschirm iphone waschmaschine trockner spülmaschine sauger drucker fortschritt" },
      ] },
    { id: "bell", label: "Bell & messages", icon: "bell", tone: "set-alerts",
      sub: "Which messages appear in the bell and who gets a push on the phone.",
      blocks: [
        { k: "bell", sec: "Notifications", title: "Bell on this dashboard",
          plain: "Switch the bell on or off and choose which messages it shows here.",
          kw: "glocke meldungen benachrichtigungen sicherheit wasser rauch co2 schloss alarm klingel türen personen sauger geräte pflanzen akku pulse updates neustart" },
        { k: "vent", opt: "vent", title: "Ventilation push",
          plain: "Push to your phone when it is time to open or close the windows.",
          kw: "lüften lueften push fenster öffnen schließen co2 handy personen" },
        { k: "updpush", opt: "update_push", title: "New version on the phone",
          plain: "A push to your phone when a new Casora version is out.",
          kw: "push update version neue version handy" },
        { k: "notify", personal: ["notify"], title: "Wording and exceptions", adv: true,
          plain: "How the bell words places, mailbox, combined contacts and device care.",
          kw: "zonen wortlaut briefkasten post ausnahmen kombi kontakt gerätepflege filter" },
      ] },
    // fold: every block is a section that opens on its heading; a jump from a tile or the search opens the right one.
    { id: "house", label: "Home & devices", icon: "home", tone: "set-home", fold: true,
      sub: "Blinds, doors and windows, batteries, scenes, music, waste and calendars.",
      blocks: [
        { k: "security", personal: ["security"], title: "Blinds and gates",
          plain: "Which blinds and gates count as open when the house is checked at night.",
          kw: "rollo rollos rollladen jalousie jalousien tor tore garage garagentor sicherheit abends nachts geschlossen covers shutters gates" },
        { k: "contacts", personal: ["contacts"], title: "Doors and windows",
          plain: "Group, rename or hide doors and windows in the security overview.",
          kw: "türen tueren fenster kontakte ausblenden umbenennen gruppen abwesenheit abwesend lüften lueften zuhause" },
        { k: "battery", personal: ["battery"], title: "Batteries",
          plain: "Batteries the bell should not warn about.",
          kw: "batterie batterien akku ausnahme ausnahmen warnung nicht melden battery" },
        { k: "scenes", sec: "Scenes", personal: ["scenes"], title: "Scenes",
          plain: "Which scene buttons appear here, and scenes Casora should never offer.",
          kw: "szenen szene stimmung reihenfolge farbe ausblenden verstecken scenes" },
        { k: "media", personal: ["media"], title: "Music and players",
          plain: "Which players the Now Playing bar shows and how they are named.",
          kw: "player medien musik wiedergabe now playing lautsprecher" },
        { k: "waste", personal: ["waste"], title: "Waste collection",
          plain: "Which bins are collected when, so tiles and the bell remind you.",
          kw: "abfall müll muell tonne abholung restmüll papier gelber sack bio" },
        { k: "calendars", personal: ["calendars"], title: "Calendars",
          plain: "Which calendars the calendar tiles show, with name and color.",
          kw: "kalender termine farbe calendar" },
        { k: "devices", personal: ["devices"], title: "Other devices",
          plain: "Devices Casora found that have no place of their own, e.g. an e-bike.",
          kw: "geräte ebike e-bike fahrrad" },
      ] },
    { id: "wx", label: "Weather, power & fuel", icon: "temp-medium", tone: "set-outdoor",
      sub: "Weather source, outdoor values, electricity price and fuel nearby.",
      blocks: [
        { k: "weather", sec: "Weather", title: "Weather",
          plain: "Where the weather comes from and what the weather window shows.",
          kw: "wetter quelle vorhersage diagramm gefühlte temperatur details extra werte" },
        { k: "outdoor", opt: "outdoor", title: "Outdoor values and electricity price",
          plain: "Outdoor temperature and humidity, and what a kWh costs – for ventilation, heating and energy tips.",
          kw: "außen aussen temperatur feuchte luftfeuchtigkeit strom strompreis kwh preis tibber" },
        { k: "fuel", fuel: true, title: "Fuel prices",
          plain: "Gas stations nearby in the car window: price, distance, open or closed.",
          kw: "tanken benzin diesel e5 e10 tankstelle tankerkönig umkreis auto" },
        { k: "charging", charging: true, title: "Chargers nearby",
          plain: "Public chargers nearby in the car window: distance, power, AC or DC.",
          kw: "laden ladesäule ladestation ladepunkt elektroauto e-auto wallbox openchargemap open charge map ac dc hpc umkreis auto" },
      ] },
    { id: "ai", label: "AI", icon: "assist", tone: "set-ai",
      sub: "What the AI checks for you, how often, and which AI does it.",
      blocks: [
        { k: "ai", opt: "ai", title: "AI",
          plain: "Which AI answers, when the checks run, the shopping list for recipes and notes for the AI.",
          kw: "ki ai assist coach kamera pflanzen update analyse rezept woche modell zeitplan hinweise einkaufsliste" },
      ] },
    { id: "system", label: "Updates & setup", icon: "updates", tone: "updates",
      sub: "Install updates, try betas, and how new dashboards are set up.",
      blocks: [
        { k: "updates", updates: true, title: "Updates",
          plain: "See the installed version, install updates, try test versions (betas).",
          kw: "update updates version beta installieren hacs neu starten" },
        { k: "basis", personal: ["basis"], title: "New dashboards",
          plain: "Which room a new dashboard starts with and what it gets filled with.",
          kw: "neue dashboards standardraum vorlagen anlegen" },
        { k: "umzug", personal: ["umzug"], title: "Hemma dashboards", adv: true,
          plain: "Whether Casora looks for old Hemma dashboards to take over.",
          kw: "hemma umzug übernehmen import" },
        { k: "hemma", hemma: true, title: "Remove Hemma", adv: true,
          plain: "Remove what is left of Hemma once everything has moved over.",
          kw: "hemma entfernen löschen aufräumen" },
      ] },
  ];
  const NEU_START = { id: "n-start", label: "Settings", neu: true, start: true,
    lede: "What do you want to set up? Pick a topic or search for a word." };
  const neuPage = (id) => {
    if (id === "n-start") return NEU_START;
    const tile = NEU.find((x) => "n-" + x.id === id);
    return tile ? { id: "n-" + tile.id, label: tile.label, neu: true, tile, lede: tile.sub } : null;
  };
  // The dashboard sections the tiles show (scope "dashboard" in casora-panel.js SECTIONS).
  const DASH_SECS = ["General", "Weather", "Time", "Notifications", "Scenes"];
  // The third tab of a tile's side panel: what is set for every device of this kind, [tile, block, tab label].
  // Kinds without shared settings (light, thermostat, switch …) have no entry and show Tile and Popup only.
  const LIVE_TAB = ["phone", "live", "Lock screen"];
  const COVERS_TAB = ["house", "security", "All blinds"];
  const TILE_SHARED = {
    cover: COVERS_TAB, cover_group: COVERS_TAB,
    media: ["house", "media", "All players"], battery: ["house", "battery", "All batteries"],
    casora_alarm: ["house", "contacts", "All doors and windows"],
    casora_trash: ["house", "waste", "Waste collection"], casora_calendar: ["house", "calendars", "All calendars"],
    casora_ebike: ["house", "devices", "Other devices"], casora_weather_warning: ["wx", "weather", "Weather"],
    casora_washer: LIVE_TAB, casora_dryer: LIVE_TAB, casora_dishwasher: LIVE_TAB, casora_3d_printer: LIVE_TAB, vacuum: LIVE_TAB,
  };
  window.casoraSettingsMap = { tiles: NEU, dashSections: DASH_SECS, route, tileShared: TILE_SHARED };
  const pageOf = (id) => neuPage(route(id)[0]) || NEU_START;

  const CSS = ".cs-wrap{padding:4px 0 28px}"
    // Settings by topic: search, topic tiles (two columns), "only this dashboard" on the row.
    + ".cs-hubsearch{margin:0 0 12px}.cs-hubsearch input{width:100%;box-sizing:border-box;height:42px;padding:0 14px;border:0;outline:none;"
    +   "border-radius:var(--r-m,14px);background:var(--casora-popup-row-fill,rgba(255,255,255,.10));color:var(--casora-popup-tiles-text-primary,#fff);font:inherit;font-size:var(--t-body)}"
    + ".cs-hubsearch input:focus-visible{box-shadow:0 0 0 2px var(--accent)}"
    + ".cs-hubgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 18px}"
    + ".cs-hubtile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px;min-height:104px;"
    +   "border-radius:var(--casora-popup-row-radius,20px);background:var(--casora-popup-row-fill,rgba(255,255,255,.10));color:var(--casora-popup-tiles-text-primary,#fff)}"
    + ".cs-hubtile:hover{background:var(--wash-hover,var(--casora-studio-wash-hover,rgba(255,255,255,.06)))}"
    + ".cs-hubtile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"
    + ".cs-hubtile b{margin-top:6px;font-size:var(--t-body);font-weight:600}"
    + ".cs-hubtile span:last-child{font-size:var(--t-foot);line-height:1.3;color:var(--ink-2)}"
    + ".cs-hubback{min-height:40px;padding:8px 10px 8px 2px;box-sizing:border-box}"
    // New structure (prototype): blocks with a title and one plain sentence, rare ones folded under "Advanced".
    // One grid for every block (04.11.2026): heading, sentence, plate and hint share the block's left and right edge,
    // one plate fill and the Studio's group radius (as the tile editor) for flow groups and dashboard sections alike, rows 10 px inside the plate, one heading
    // level, "Advanced" opens without a card of its own. Checked for every tile by dev/qa/regress/r545_settings_grid.mjs.
    // The page's content starts on the edge of its title (desktop and tablet: 10 px in; phone sheet: 2 px out).
    + ":host(:not(.phone)) .cs-wrap{padding-left:10px;padding-right:10px}:host(.phone) .cs-wrap{margin-left:-2px;margin-right:-2px}"
    + ".cn-block{margin:0 0 28px}"
    // Sections that open on their heading (Home & devices).
    + ".cn-fold{margin:0 0 8px}.cn-fold.open{margin-bottom:20px}.cn-fold:not(.open)>:not(.cn-bhead){display:none!important}"
    + ".cn-fold>.cn-bhead{position:relative;cursor:pointer;margin:0;min-height:44px;box-sizing:border-box;padding:11px 34px 11px 10px;justify-content:center;"
    +   "border-radius:var(--r-group);background:var(--casora-popup-row-fill,rgba(255,255,255,.10))}"
    + ".cn-fold.open>.cn-bhead{margin-bottom:10px}"
    + ".cn-fold>.cn-bhead::after{content:'›';position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:20px;color:var(--ink-3)}"
    + ".cn-fold.open>.cn-bhead::after{transform:translateY(-50%) rotate(90deg)}"
    + ".cn-fold>.cn-bhead:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"
    // Tabs of a tile's side panel.
    + ".tiletabs{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:2px;padding:3px;margin:0 0 12px;border-radius:var(--r-m);background:var(--casora-studio-chip,rgba(118,118,128,.18))}"
    + ".tiletabs button{all:unset;box-sizing:border-box;cursor:pointer;min-height:36px;padding:0 4px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:calc(var(--r-m) - 3px);font-size:var(--t-foot);font-weight:500;line-height:20px;color:var(--ink)}"
    + ".tiletabs button[aria-selected=true]{font-weight:650;background:var(--casora-studio-field,rgba(255,255,255,.14));box-shadow:var(--casora-shadow-rest)}"
    + ":host(.is-light) .tiletabs button[aria-selected=true]{background:#fff}"
    + ".tiletabs button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}"
    + ":host(.phone) .tiletabs button{min-height:44px}"
    + ".tilepane>.adv{margin-top:0}.tilepane>.adv>.advsum{display:none}"
    + ".tilepane .cs-wrap{padding:0!important;margin:0!important}.tilepane .cn-block{margin-bottom:12px}"
    + ".tilepane .cs-bar{margin:12px 0 0}.tilelink{all:unset;cursor:pointer;display:block;min-height:44px;line-height:44px;font-size:var(--t-callout);font-weight:600;color:var(--accent)}"
    + ".tilelink:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}"
    + ".cn-bhead{display:flex;flex-direction:column;gap:3px;margin:0 0 10px;padding:0}"
    + ".cn-bhead b{display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:4px;font-size:var(--t-body);font-weight:650;line-height:1.3;color:var(--ink)}"
    + ".cn-bhead span{font-size:var(--t-foot);line-height:1.4;color:var(--ink-2)}"
    + ".cn-bhead b .cn-only{display:inline-flex;align-items:center;margin:0;line-height:1.25;white-space:nowrap!important;max-width:none!important}"
    // A further part of a block (second group, part of a dashboard section) has a heading like the block title.
    + ".cn-block .fhead,.cn-block section.cn-card .subtitle{margin:20px 0 8px;padding:0;font-size:var(--t-body);font-weight:650;line-height:1.3;letter-spacing:-0.01em;color:var(--ink)}"
    + ".cn-block .fgroup{margin:0 0 14px}.cn-block .fgroup:last-child{margin-bottom:0}"
    // Plates: flow lists, a plain dashboard section, the parts of a grouped one.
    + ".cn-block section.cn-card{margin:0;border:0;box-shadow:none;width:auto}"
    + ".cn-block .flist,.cn-block section.cn-card:not(.grouped),.cn-block section.cn-card.grouped>.subcard{margin:0!important;"
    +   "border-radius:var(--r-group)!important;background:var(--casora-popup-row-fill,rgba(255,255,255,.10))!important}"
    + ".cn-block section.cn-card:not(.grouped),.cn-block section.cn-card.grouped>.subcard{padding:0 10px!important}"
    + ".cn-block section.cn-card.grouped{padding:0!important;background:none!important}"
    + ".cn-block section.cn-card.grouped>.subcard+.subcard{margin-top:14px!important}"
    + ".cn-block section.cn-card.grouped>.chead+.subtitle,.cn-block section.cn-card.grouped>.subtitle:first-child{margin-top:0}"
    // Hints under a plate on the same edge; a hint that belongs to one row stays in the plate under that row.
    + ".cn-block .ffoot,.cn-block section.cn-card.grouped>.hint{margin:8px 0 0;padding:0;font-size:var(--t-foot);line-height:1.45;color:var(--ink-3)}"
    + ".cn-block section.cn-card:not(.grouped)>.hint,.cn-block section.cn-card .subcard>.hint{margin:-2px 0 0;padding:0 0 12px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-3)}"
    + ".cn-block .cs-note,.cn-block .cs-err{margin-left:0;margin-right:0}"
    + ".cn-block .cs-area{margin-left:0!important;margin-right:0!important;width:100%;box-sizing:border-box}"
    // "Advanced": a disclosure row on the same edge; opened, its blocks look like every other block.
    + ".cn-adv{margin:0 0 24px;padding:0;background:none;border-radius:0}"
    + ".cn-adv>summary{cursor:pointer;list-style:none;display:flex;flex-direction:column;justify-content:center;gap:3px;min-height:44px;padding:6px 0;box-sizing:border-box}"
    + ".cn-adv>summary::-webkit-details-marker{display:none}"
    + ".cn-adv>summary b{font-size:var(--t-body);font-weight:650;color:var(--ink)}.cn-adv>summary b::after{content:' ›';color:var(--ink-2)}"
    + ".cn-adv[open]>summary b::after{content:' ⌄'}"
    + ".cn-adv>summary span{font-size:var(--t-foot);color:var(--ink-2);line-height:1.4}.cn-adv[open]>summary span{display:none}"
    + ".cn-adv:focus-within>summary{outline:none}.cn-adv>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}"
    + ".cn-advbody{padding:14px 0 0}"
    // A row's sentence wraps instead of being cut off (phone).
    + ".cn-block .frow .rtext b,.cn-block .frow .rtext span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}"
    // One look for a fold inside a plate: a dashboard section's "Erweitert" like the "Erweitert" row of the waste block.
    + ".cn-block .adv>.advsum{display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:center;width:100%;min-height:44px}"
    + ".cn-block .adv>.advsum span{color:var(--casora-studio-link,var(--accent));font-size:var(--t-callout);font-weight:500}"
    + ":host(.is-light) .cn-block .adv>.advsum span{color:var(--casora-studio-link,#0071e3)}"
    + ".cn-block .adv>.advsum svg{color:var(--ink-3)}"
    + ".cn-grid .cs-hubtile{min-height:96px}"
    // Start and topic pages have no "Applies to" line under the title: the fixed head height left an empty band of
    // ~40 px above "‹ Settings" (the pages with that line sat 16 px higher).
    + ":host(.split:not(.flow):not(.phone)) .insphead:has(> .cs-head):not(.uxhas){height:auto!important;min-height:0!important;padding-bottom:14px!important}"
    + ".cs-hublist .rtext b,.cs-hublist .rtext span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}"
    + ".cs-hubback{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:0 0 10px;font-size:var(--t-callout);font-weight:600;color:var(--accent)}"
    // Updates head: its children are stacked absolutely (navrow), so the way back gets a line of its own.
    + ".navrow.cu-head:has(> .cs-hubback){height:auto}"
    + ".navrow.cu-head > .cs-hubback{position:static;inset:auto;margin:0 0 6px}"
    + ".navrow.cu-head:has(> .cs-hubback) > .detailbar{position:relative;height:var(--headrow,35px)}"
    + "@media (max-width:600px){.rdetail.cs-dash{white-space:normal!important;max-width:84px;text-align:center;line-height:1.15}}"
    + ".rdetail.cs-dash{flex:none;font-size:var(--t-caption);font-weight:700;padding:3px 8px;border-radius:8px;white-space:nowrap;"
    +   "color:var(--casora-color-orange,#FF9230);background:color-mix(in srgb,var(--casora-color-orange,#FF9230) 16%,transparent)}"
    // Same sizes as the tile editor (inspector): field label 13 px, value/input
    // 15 px at 38 px field height, groups with the radius of the editor cards and 10 px indent.
    // Checked by dev/qa/regress/r19_einstellungen_feldgroesse.mjs.
    + ".cs-wrap .flist{border-radius:var(--r-group)}"
    + ".cs-wrap .frow{min-height:44px;padding:10px;font-size:var(--t-callout);letter-spacing:-0.01em}"
    + ".cs-wrap .frow+.frow::before{left:10px;right:10px}"
    + ".cs-wrap .frow.casora-prow .rtext b{font-size:var(--t-foot)}"
    + ".cs-wrap .frow.casora-prow .rtext span{font-size:var(--t-caption)}"
    + ".cs-wrap .casora-pctl .combo>input,.cs-wrap .casora-pctl>input.fin,.cs-wrap .cs-num input"
    + "{height:var(--k-h, 38px);box-sizing:border-box;font-size:var(--t-callout)}"
    // The page intro on the blocks' edge (04.11.2026).
    + ".cs-lede{margin:0 0 16px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cs-note{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:var(--casora-studio-link-tint, rgba(10,132,255,.16));font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:rgba(255,69,58,.16);color:var(--ink);font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err:empty{display:none}"
    // Save bar: floating, rounded bar at content width (like a menu/toast:
    // opaque surface, soft shadow), spaced from the bottom edge. Without changes it is
    // hidden and takes no space (an empty strip at the end of e.g. Ventilation on the phone, 26.10.); with changes
    // it keeps its space at the end of the page so the content never stays covered.
    + ".cs-wrap:has(.cs-bar){padding-bottom:0}"
    + ".cs-bar{position:sticky;bottom:max(16px, calc(env(safe-area-inset-bottom, 0px) + 10px));z-index:3;box-sizing:border-box;"
    + "display:flex;align-items:center;gap:12px;min-height:56px;margin:24px 0 16px;padding:8px 8px 8px 20px;border-radius:22px;"
    + "background:var(--menu-glass, var(--casora-studio-menu-glass, rgba(44,44,50,0.94)));"
    + "-webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);"
    + "box-shadow:var(--toast-rim, var(--casora-studio-toast-rim, 0 0 0 .5px rgba(255,255,255,0.10), 0 14px 34px rgba(0,0,0,0.42)));"
    + "transition:opacity .22s ease, transform .34s var(--casora-ease-enter, cubic-bezier(.2,.9,.3,1.12)), visibility 0s}"
    // In light mode the bar sits white on a white card – a deeper, soft shadow lifts it off.
    + ":host(.is-light) .cs-bar{box-shadow:var(--toast-rim, 0 0 0 .5px rgba(0,0,0,0.08)), 0 18px 40px -12px color-mix(in srgb, var(--ink, #3C2814) 28%, transparent), 0 2px 8px color-mix(in srgb, var(--ink, #3C2814) 8%, transparent)}"
    + ".cs-bar.cs-clean{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(18px) scale(.98);"
    + "min-height:0;height:0;margin:0;padding-top:0;padding-bottom:0;overflow:hidden;"
    + "transition:opacity .18s ease, transform .22s ease, visibility 0s .22s}"
    + "@media (prefers-reduced-motion:reduce){.cs-bar,.cs-bar.cs-clean{transform:none;transition:opacity .15s}}"
    + ".cs-bar span{flex:1 1 auto;display:flex;align-items:center;gap:9px;min-width:0;font-size:var(--t-callout);font-weight:500;color:var(--ink)}"
    + ".cs-bar span::before{content:'';flex:none;width:8px;height:8px;border-radius:50%;background:var(--casora-studio-done, var(--casora-color-blue, #0A84FF))}"
    + ".cs-bar button{flex:none;min-height:40px;padding:9px 20px;border-radius:999px;font-weight:600}"
    // Narrow (phone): state on top, button below across the full width – otherwise the button lay over
    // "Unsaved changes" (user test 5).
    + "@media (max-width:480px){.cs-bar{flex-wrap:wrap;gap:8px;padding:12px 8px 8px}.cs-bar span{flex:1 1 100%;padding-left:10px}.cs-bar button{flex:1 1 100%}}"
    + ".cs-bar .cs-save:not(:disabled){background:var(--casora-studio-done, var(--casora-color-blue, #0A84FF));color:var(--casora-studio-on-done, #fff)}"
    + ".cs-area{width:100%;min-height:84px;box-sizing:border-box;resize:vertical;padding:9px 11px;border-radius:var(--r-s);border:none;"
    + "background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit;font:inherit;font-size:var(--t-callout);line-height:1.4}"
    // Schedules: mode, weekday and time side by side, stacked on the phone.
    + ".cs-wrap .frow.cs-plan .casora-pctl>.combo{flex:1 1 150px}"
    + ".cs-num{display:flex;align-items:center;gap:8px}"
    + ".cs-num input{width:110px;padding:7px 12px;border-radius:var(--r-m);border:none;background:var(--field, var(--casora-studio-field, rgba(118,118,128,.18)));color:inherit;font:inherit;text-align:right}"
    + ".cs-num span{font-size:var(--t-callout);color:var(--ink-2)}"
    + ".casora-pctl>button.ghost{padding:7px 13px;font-size:var(--t-foot)}"
    + ".frow .sw{margin-left:auto;flex:none}"
    + ".cs-empty{font-size:var(--t-foot);color:var(--ink-2)}"
    // Sidebar
    + ".sidehead.cu-sidehead small{display:block;margin-top:1px;font-size:var(--t-caption);font-weight:400;"
    + "color:var(--casora-studio-cap-sub, color-mix(in srgb, var(--ink) 48%, transparent))}"
    + ".sidelist .siderow .cs-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--casora-studio-warn, #ff9f0a)}"
    // Remove Hemma
    + ".casora-pctl>button.cs-danger{background:var(--casora-studio-danger, #ff453a);color:#fff}"
    + ".chr-list{display:flex;flex-direction:column;gap:9px;margin:14px 0 2px;max-height:52vh;overflow:auto;text-align:left}"
    + ".chr-item{display:flex;align-items:flex-start;gap:10px;font-size:var(--t-foot);line-height:1.4}"
    + ".chr-item>i{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--casora-studio-danger, #ff453a)}"
    + ".chr-item.ok>i{background:var(--casora-studio-good, #34c759)}.chr-item.warn>i{background:var(--casora-studio-warn, #ff9f0a)}.chr-item.info>i{background:#8e8e93}"
    + ".chr-item>input{flex:none;width:16px;height:16px;margin:2px 0 0;accent-color:var(--casora-studio-danger, #ff453a);cursor:pointer}"
    // List with checkbox rows: dot centered over the 16 px box, texts aligned.
    + ".chr-mix .chr-item>i{margin-left:4px;margin-right:4px}"
    + ".chr-item label,.chr-item>div{flex:1 1 auto;min-width:0;cursor:inherit}"
    + ".chr-item b{display:block;font-weight:600}"
    + ".chr-more{display:block;margin:2px 0 0;padding:0;border:0;background:none;font:inherit;font-size:var(--t-foot);font-weight:600;color:var(--accent);cursor:pointer;text-align:left}"
    + ".chr-item span{display:block;color:var(--ink-2);font-size:var(--t-foot);overflow-wrap:anywhere;white-space:pre-line}"
    // Confirmation after the restart: check mark in Casora green or hint in orange above the title
    + ".askcard.chv .chv-mark{width:60px;height:60px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center}"
    + ".askstack.wide .askcard.chv .chv-mark{margin-left:0}"
    + ".chv-mark svg{width:34px;height:34px}"
    + ".askcard.chv p{white-space:pre-line}"
    + ".askcard.chv p.chv-path{margin-top:6px;font-size:var(--t-foot);font-weight:600;color:var(--ink);white-space:normal}"
    + ".chv-path span{display:inline-block;max-width:100%;overflow-wrap:anywhere}"
    + ".chv-mark.ok{color:var(--casora-studio-good, #34c759);background:var(--casora-studio-good-tint, rgba(52,199,89,.16))}"
    + ".chv-mark.warn{color:var(--casora-studio-warn, #ff9f0a);background:var(--casora-studio-warn-tint, rgba(255,159,10,.16))}"
    + ".chr-sub{margin:6px 0 0;font-size:var(--t-caption);font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-2)}";

  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  // Break the path only after "/", never inside the date (word joiners around the hyphens).
  const pathText = (p) => String(p || "").replace(/-/g, "\u2060-\u2060").replace(/\//g, "/\u200b");
  const btn = (label, onTap, ghost) => {
    const b = el("button", ghost ? "ghost" : "", label);
    b.type = "button";
    b.onclick = onTap;
    return b;
  };
  const clone = (x) => JSON.parse(JSON.stringify(x || {}));
  // Like options.clean_options: empty fields are dropped.
  const cleanOpts = (o) => {
    const out = {};
    Object.keys(o || {}).sort().forEach((k) => {
      const v = o[k];
      // Beta versions are under Updates (casora-panel-updates.js); if the key is missing, options.py keeps it.
      if (k === "beta_updates") return;
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    return out;
  };
  const PERS = () => window.casoraPersonal || { normalize: clone, prune: (x) => x, fileSettings: async () => null, CSS: "" };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraSettings) return;
    P.__casoraSettings = true;

    const css = (self) => {
      if (!self.shadowRoot.getElementById("casora-settings-css")) {
        const st = document.createElement("style");
        st.id = "casora-settings-css";
        st.textContent = CSS;
        self.shadowRoot.appendChild(st);
      }
      if (!self.shadowRoot.getElementById("casora-personal-css") && PERS().CSS) {
        const st = document.createElement("style");
        st.id = "casora-personal-css";
        st.textContent = PERS().CSS;
        self.shadowRoot.appendChild(st);
      }
    };
    const split = (self) => self.classList.contains("split") && !!self.$("sidesections");

    // ── Data ─────────────────────────────────────────────────────────────────
    const settingsDirty = (cs) => !!cs.S && JSON.stringify(PERS().prune(cs.S) || {}) !== cs.S0;
    const optionsDirty = (cs) => !!cs.opt && JSON.stringify(cleanOpts(cs.O)) !== cs.O0;
    // Fuel prices: draft without the key; F.key is only there when a new one was typed (or "" = remove).
    const tankenDirty = (cs) => !!cs.tk && JSON.stringify(cs.F) !== cs.F0;
    // Chargers nearby (charging.py): draft without the key, like fuel prices.
    const chargingDirty = (cs) => !!cs.ch && JSON.stringify(cs.C) !== cs.C0;
    const liveDirty = (self) => typeof self._csLiveDirty === "function" && self._csLiveDirty();
    // Issue 129: the design's scope ("all" / "casora") is a draft like the rest; the switch sits on the design page.
    const scopeDirty = (cs) => cs.scope !== undefined && cs.scope !== cs.scope0;
    // Settings for all dashboards (drafts above).
    P._csOwnDirty = function () {
      const cs = this._cs;
      return !!cs && (settingsDirty(cs) || optionsDirty(cs) || tankenDirty(cs) || chargingDirty(cs) || scopeDirty(cs) || liveDirty(this));
    };
    // New structure: this dashboard's settings belong to the same bar – when they were changed on one of its pages
    // (_csDashTouched, set in _markDirty below). Edits elsewhere in the Studio keep "Done" as before.
    const dashSetDirty = (self) => !!self._csDashTouched && !!self._state && !!self._isDirty && self._isDirty();
    P._csDirty = function () {
      return this._csOwnDirty() || dashSetDirty(this);
    };
    // For the leave guards in casora-panel.js: only with the new structure (the previous one keeps its behaviour).
    P._csLeaveDirty = function () {
      return this._csDirty();
    };
    const takeTanken = (cs, r) => {
      cs.tk = r;
      const cars = {};
      (r.cars || []).forEach((c) => { cars[c.device_id] = c.fuel; });
      cs.F = { radius: r.radius, cars };
      cs.F0 = JSON.stringify(cs.F);
    };

    const takeCharging = (cs, r) => {
      cs.ch = r;
      cs.C = { radius: r.radius };
      cs.C0 = JSON.stringify(cs.C);
    };

    const takeOptions = (cs, r) => {
      cs.opt = r;
      cs.O = clone(r.options);
      delete cs.O.ki_auto;  // up to 1.0.2; since 1.0.3 schedules per function (ki_plan_*)
      cs.O0 = JSON.stringify(cleanOpts(cs.O));
    };
    const takeSettings = (cs, data, stored) => {
      cs.S = PERS().normalize(data || {});
      cs.S0 = stored ? JSON.stringify(PERS().prune(cs.S) || {}) : "{}";
    };

    P._csLoad = async function () {
      const cs = this._cs = this._cs || {};
      // Keep the draft; otherwise refetch at most once a minute. false = nothing new.
      if (cs.loaded && (this._csDirty() || Date.now() - cs.at < 60000)) return false;
      delete cs.scope;
      delete cs.scope0;
      const hass = this._hass;
      let stored = false, data = {};
      cs.readErr = null;
      // The four stores load side by side; each one keeps its own error.
      const own = (async () => {
      try {
        const r = await hass.callWS({ type: "casora/settings/get" });
        stored = !!r.stored;
        data = r.settings || {};
        // Price from HA's energy dashboard: hint at the empty electricity price field.
        cs.energyPrice = { kwh: r.energy_price_kwh, entity: r.energy_price_entity || null };
      } catch (e) {
        // Older integration: file only. Any other read error blocks saving – settings/set
        // replaces everything, an empty form would otherwise have deleted all settings.
        if (!(e && e.code === "unknown_command")) cs.readErr = (e && e.message) || String(e);
      }
      cs.fromFile = false;
      if (!stored) {
        const f = await PERS().fileSettings();
        if (f && Object.keys(f).length) { data = f; cs.fromFile = true; }
      }
      takeSettings(cs, data, stored || !cs.fromFile);
      })();
      const opts = (async () => {
      try {
        takeOptions(cs, await hass.callWS({ type: "casora/options/get" }));
        cs.optErr = null;
        // Several AI tasks, none chosen: HA's preferred one answers. Name it in the hint through HA's
        // own frontend command (the backend does not read ai_task's stored preferences).
        const auto = cs.opt.auto || (cs.opt.auto = {});
        if (!auto.ai_task_entity || !auto.ai_task_web_entity) {
          try {
            const pref = ((await hass.callWS({ type: "ai_task/preferences/get" })) || {}).gen_data_entity_id;
            if (pref) { auto.ai_task_entity = auto.ai_task_entity || pref; auto.ai_task_web_entity = auto.ai_task_web_entity || pref; }
          } catch (e) { /* without ai_task: plain "Automatic" */ }
        }
      } catch (e) {
        cs.opt = null;
        cs.optErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
      })();
      const fuel = (async () => {
      try {
        takeTanken(cs, await hass.callWS({ type: "casora/tanken/get" }));
        cs.tkErr = null;
      } catch (e) {
        cs.tk = null;
        cs.tkErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
      })();
      const charging = (async () => {
      try {
        takeCharging(cs, await hass.callWS({ type: "casora/charging/get" }));
        cs.chErr = null;
      } catch (e) {
        cs.ch = null;
        cs.chErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
      })();
      const live = typeof this._csLiveLoad === "function" ? this._csLiveLoad(cs) : null;
      await Promise.all([own, opts, fuel, charging, live]);
      cs.loaded = true;
      cs.at = Date.now();
      return true;
    };

    P._csSave = async function () {
      const cs = this._cs || (this._cs = {});
      if (cs.busy) return false;
      if (!this._csDirty()) return true;
      const price = cs.O && cs.O.price_kwh;
      if (price !== undefined && (typeof price !== "number" || isNaN(price) || price < 0 || price > 2)) {
        cs.err = t("The electricity price must be between 0 and 2 €/kWh.");
        this._csRepaint();
        return false;
      }
      // Security › „Counts as closed up to“ (issue 138, casora-panel-personal.js): whole percent 0–20.
      const upTo = cs.S && cs.S.security && cs.S.security.closed_up_to;
      if (upTo !== undefined && !(typeof upTo === "number" && Number.isInteger(upTo) && upTo >= 0 && upTo <= 20)) {
        cs.err = t("“Counts as closed up to” must be a whole number from 0 to 20 %.");
        this._csRepaint();
        return false;
      }
      // The same per cover (security.closed_up_to_by): whole percent 0–99.
      const upBy = cs.S && cs.S.security && cs.S.security.closed_up_to_by;
      if (upBy && Object.keys(upBy).some((k) => !(typeof upBy[k] === "number" && Number.isInteger(upBy[k]) && upBy[k] >= 0 && upBy[k] <= 99))) {
        cs.err = t("“Counts as closed up to” for a single gate or blind must be a whole number from 0 to 99 %.");
        this._csRepaint();
        return false;
      }
      cs.busy = true;
      cs.err = null;
      this._csRepaint();
      const done = [];
      try {
        if (settingsDirty(cs)) {
          if (cs.readErr) throw new Error(t("The settings could not be read. Reload the page, then try again."));
          // Read fresh and only take over the sections changed here: what was saved elsewhere
          // in the meantime (migration, welcome, another browser) is kept.
          let fresh = null;
          try { fresh = (await this._hass.callWS({ type: "casora/settings/get" })).settings || {}; }
          catch (e) { if (!(e && e.code === "unknown_command")) throw e; }
          let clean = PERS().prune(cs.S) || {};
          if (fresh) {
            const was = JSON.parse(cs.S0 || "{}");
            const merged = Object.assign({}, fresh);
            new Set([...Object.keys(clean), ...Object.keys(was)]).forEach((k) => {
              if (JSON.stringify(clean[k]) === JSON.stringify(was[k])) return;
              if (clean[k] === undefined) delete merged[k]; else merged[k] = clean[k];
            });
            clean = PERS().prune(merged) || merged;
          }
          const r = await this._hass.callWS({ type: "casora/settings/set", settings: clean });
          window.CASORA_SETTINGS = (r && r.settings) || clean;
          takeSettings(cs, window.CASORA_SETTINGS, true);
          cs.fromFile = false;
          // The hints in the Studio pages (scenes …) read again.
          this._casoraSettingsRead = null;
          this._settingsP = null;
          this.shadowRoot.querySelectorAll(".casora-plink").forEach((x) => x.remove());
          done.push(t("Saved – reload open dashboards to apply"));
        }
        if (optionsDirty(cs)) {
          takeOptions(cs, await this._hass.callWS({ type: "casora/options/set", options: cleanOpts(cs.O) }));
          done.push(t("Saved – Casora applies the new options now"));
        }
        if (tankenDirty(cs)) {
          const msg = { type: "casora/tanken/set", radius: cs.F.radius, cars: cs.F.cars };
          if (cs.F.key !== undefined) msg.key = cs.F.key;
          takeTanken(cs, await this._hass.callWS(msg));
          cs.tkTest = null;
          done.push(t("Saved. Fuel prices follow within 10 minutes."));
        }
        if (chargingDirty(cs)) {
          const msg = { type: "casora/charging/set", radius: cs.C.radius };
          if (cs.C.key !== undefined) msg.key = cs.C.key;
          takeCharging(cs, await this._hass.callWS(msg));
          cs.chTest = null;
          done.push(t("Saved. The car window shows chargers nearby now."));
        }
        if (scopeDirty(cs)) {
          const CT = window.casoraTheme;
          if (!CT || typeof CT.setScope !== "function") throw new Error(t("The settings could not be read. Reload the page, then try again."));
          await CT.setScope(cs.scope);
          cs.scope0 = cs.scope;
          done.push(t("Saved"));
        }
        if (liveDirty(this)) {
          await this._csLiveSave();
          done.push(t("Saved – live activities follow the devices from now on"));
        }
        // New structure: the same bar saves this dashboard (its settings live there), as "Save" would.
        if (this._state && this._isDirty() && !this._saveBlocked) {
          if (!(await this._save())) throw new Error(t("The dashboard could not be saved. Your changes are still here."));
          this._csDashTouched = false;
          done.push(t("Saved"));
        }
      } catch (e) {
        cs.err = (e && e.message) || String(e);
      }
      cs.busy = false;
      this._csRepaint();
      if (done.length && !cs.err) this._status(done[done.length - 1], "ok");
      // Said where the user is, also when the page is not open (asked on "Done", a dashboard switch …).
      if (cs.err) this._status(cs.err, "err");
      return !cs.err;
    };

    // ── Option building blocks ───────────────────────────────────────────────
    const ctlRow = (self, list, title, sub, controls) => {
      const r = self._flowRow(list, { title, sub });
      r.row.classList.add("casora-prow");
      const c = el("div", "casora-pctl");
      controls.filter(Boolean).forEach((x) => c.appendChild(x));
      r.row.appendChild(c);
      return r.row;
    };
    const autoHint = (self, cs, key) => {
      const id = cs.opt && cs.opt.auto && cs.opt.auto[key];
      return id ? t("Automatic: {x}").replace("{x}", self._prettyEntity(id)) : t("Automatic");
    };
    const entPick = (self, cs, key, domains, classes) => {
      const cur = cs.O[key] || "";
      const c = self._combo(cur, self._rankedEntityList(domains, classes, null, cur), autoHint(self, cs, key), (v) => {
        if (v) cs.O[key] = v; else delete cs.O[key];
        self._csBar();
      });
      return c.wrap || c;
    };
    const chips = (self, items, selected, onChange) => {
      const box = el("div", "casora-chips");
      box.setAttribute("data-no-i18n", "");
      if (!items.length) {
        box.appendChild(el("span", "cs-empty", t("Nothing found in Home Assistant.")));
        return box;
      }
      items.forEach(([id, label]) => {
        const b = el("button", "casora-chip" + (selected.includes(id) ? " on" : ""), label);
        b.type = "button";
        b.title = id;
        b.onclick = () => {
          const on = !b.classList.contains("on");
          b.classList.toggle("on", on);
          onChange(id, on);
          self._csBar();
        };
        box.appendChild(b);
      });
      return box;
    };
    const toggleIn = (cs, key) => (id, on) => {
      const cur = (cs.O[key] || []).filter((x) => x !== id);
      if (on) cur.push(id);
      if (cur.length) cs.O[key] = cur; else delete cs.O[key];
    };
    // ── AI models (ki.py ai_models) ─────────────────────────────────────────
    // Every AI task with its model. The AI task always answers with the model chosen in its integration in HA;
    // Casora only needs to know which one it is, to judge whether it is strong enough.
    // Recognised (the AI task's device or title names it): no field, the row opens that AI task's entry on HA's
    // integration page, where HA offers its own model menu. Otherwise a menu of common models (ki.py
    // MODEL_CHOICES, labels from model_rank) plus "Other…" for free text; stored as ai_task_models {entity_id: model}.
    const AI_OTHER = "\u0001other";
    const aiTaskPath = (m) => {
      const domain = m.entry_domain || m.domain;
      if (!domain) return "/config/integrations/dashboard";
      return "/config/integrations/integration/" + encodeURIComponent(domain)
        + (m.entry_id ? "#config_entry=" + encodeURIComponent(m.entry_id) : "");
    };
    const aiModelGroup = (self, cs, host) => {
      const g = self._flowGroup(host, { header: t("AI models"),
        footer: t("Which model an AI task uses is chosen in Home Assistant, in the AI task's integration. Casora reads it by itself and only needs it to judge whether the model is strong enough. If Casora cannot read it, pick the model here.") });
      const wait = self._flowRow(g, { title: t("Loading…") });
      self._hass.callWS({ type: "casora/ki/models" }).then((r) => {
        wait.row.remove();
        const all = (r && r.all) || [];
        const choices = (r && r.choices) || [];
        if (!all.length) { self._flowRow(g, { title: t("No AI task set up in Home Assistant.") }); return; }
        const had = Object.prototype.hasOwnProperty.call(JSON.parse(cs.O0 || "{}"), "ai_task_models");
        const strength = (ok) => (ok ? t("strong enough") : t("too weak for demanding jobs"));
        all.forEach((m) => {
          const sub = (m.model ? m.label : t("Model unknown")) + " · " + strength(m.ok);
          if (m.model && (m.source === "device" || m.source === "title")) {
            const row = self._flowRow(g, { title: m.name, raw: true, sub, detail: t("Change model"), chevron: true,
              onTap: () => self._csHaGo(aiTaskPath(m)) }).row;
            row.classList.add("cs-aimodel");
            row.dataset.entity = m.entity_id;
            row.querySelector(".rtext > span").setAttribute("data-no-i18n", "");
            return;
          }
          const row = ctlRow(self, g, m.name, sub, []);
          row.classList.add("cs-aimodel");
          row.dataset.entity = m.entity_id;
          row.querySelectorAll(".rtext > b, .rtext > span").forEach((x) => x.setAttribute("data-no-i18n", ""));
          const subEl = row.querySelector(".rtext > span");
          const typed = (cs.O.ai_task_models || {})[m.entity_id] || "";
          const hit = choices.find((c) => c.model.toLowerCase() === typed.trim().toLowerCase());
          const store = (v) => {
            const map = Object.assign({}, cs.O.ai_task_models || {});
            if (v) map[m.entity_id] = v; else delete map[m.entity_id];
            // Emptied: send {} when one was stored (options.py then removes it), else leave the key out.
            if (Object.keys(map).length || had) cs.O.ai_task_models = map; else delete cs.O.ai_task_models;
            self._csBar();
          };
          const inp = el("input", "fin");
          inp.type = "text";
          inp.value = hit ? "" : typed;
          inp.placeholder = t("Model name");
          inp.setAttribute("aria-label", t("Model name"));
          inp.setAttribute("data-no-i18n", "");
          inp.hidden = !(typed && !hit);
          inp.oninput = () => store(inp.value.trim());
          const labels = { "": t("Not specified"), [AI_OTHER]: t("Other…") };
          choices.forEach((c) => { labels[c.model] = c.label; });
          const combo = self._combo(hit ? hit.model : typed ? AI_OTHER : "", [""].concat(choices.map((c) => c.model), [AI_OTHER]), "", (v) => {
            if (v === AI_OTHER) {
              inp.hidden = false;
              store(inp.value.trim());
              subEl.textContent = sub;
              setTimeout(() => inp.focus(), 0);
              return;
            }
            inp.hidden = true;
            store(v);
            const c = choices.find((x) => x.model === v);
            // The row says right away what the pick means; Casora's own reading follows after saving.
            subEl.textContent = c ? c.label + " · " + strength(c.ok) : sub;
          }, { fixed: true, labels });
          const pctl = row.querySelector(".casora-pctl");
          pctl.appendChild(combo.wrap || combo);
          pctl.appendChild(inp);
        });
      }).catch(() => { wait.row.remove(); });
    };
    // ── AI schedules (1.0.3) ─────────────────────────────────────────────────
    // Per function: off (default, not stored), auto (previous slot) or
    // own time ("sun 18:00"; daily functions only "18:00"). Like ki.py PLAN_AUTO.
    const PLAN_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const PLANS = [
      { key: "ki_plan_energie", title: "Energy coach", auto: "sun 18:00" },
      { key: "ki_plan_heizung", title: "Heating coach", auto: "mon 07:00", season: true },
      { key: "ki_plan_lueftung", title: "Ventilation coach", auto: "sat 10:00" },
      { key: "ki_plan_rezept", title: "Recipe of the week", auto: "mon 06:00" },
    ];
    const planLang = (self) => String((self._hass && self._hass.locale && self._hass.locale.language)
      || (self._hass && self._hass.language) || "en");
    const planParse = (v) => {
      const m = /^(?:(mon|tue|wed|thu|fri|sat|sun)\s+)?(\d{1,2}):(\d{2})$/.exec(String(v || "").trim().toLowerCase());
      return m ? { day: m[1] || null, time: m[2].padStart(2, "0") + ":" + m[3] } : null;
    };
    const dayName = (self, d) => new Intl.DateTimeFormat(planLang(self), { weekday: "long" })
      .format(new Date(2026, 0, 5 + PLAN_DAYS.indexOf(d)));  // 05.01.2026 was a Monday
    const timeName = (self, hm) => {
      const [h, m] = hm.split(":").map(Number);
      return new Intl.DateTimeFormat(planLang(self), { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 5, h, m));
    };
    const planText = (self, v) => {
      const p = planParse(v);
      return p ? (p.day ? dayName(self, p.day) + ", " : "") + timeName(self, p.time) : "";
    };
    const planGroup = (self, host, O) => {
      const g = self._flowGroup(host, { header: t("Automatic runs"),
        footer: t("Off: the AI only runs when you tap a button in a popup. Nothing runs automatically until you switch it on here.") });
      const times = [];
      for (let h = 0; h < 24; h++) ["00", "30"].forEach((m) => times.push(String(h).padStart(2, "0") + ":" + m));
      PLANS.forEach((f) => {
        const cur = O[f.key] || "off";
        const mode = cur === "off" || cur === "auto" ? cur : "custom";
        const sub = t("Automatic: {x}").replace("{x}", planText(self, f.auto))
          + (f.season ? " · " + t("heating season only") : "");
        const set = (v) => {
          if (!v || v === "off") delete O[f.key]; else O[f.key] = v;
          self._csBar();
        };
        const ctl = [self._combo(mode, ["off", "auto", "custom"], "", (v) => {
          if (!v || v === mode) return;
          set(v === "custom" ? f.auto : v);
          self._csRepaint();
        }, { fixed: true, labels: { off: t("Off"), auto: t("Automatic"), custom: t("Custom time") } }).wrap];
        if (mode === "custom") {
          const now = () => {
            const q = planParse(O[f.key]) || planParse(f.auto);
            return { day: q.day || planParse(f.auto).day, time: q.time };
          };
          const p = now();
          const dayLabels = {};
          PLAN_DAYS.forEach((d) => { dayLabels[d] = dayName(self, d); });
          const tl = times.indexOf(p.time) < 0 ? times.concat([p.time]).sort() : times;
          const timeLabels = {};
          tl.forEach((x) => { timeLabels[x] = timeName(self, x); });
          ctl.push(self._combo(p.day, PLAN_DAYS, "", (v) => { if (v) set(v + " " + now().time); },
            { fixed: true, labels: dayLabels }).wrap);
          ctl.push(self._combo(p.time, tl, "", (v) => { if (v) set(now().day + " " + v); },
            { fixed: true, labels: timeLabels }).wrap);
        }
        ctlRow(self, g, t(f.title), sub, ctl).classList.add("cs-plan");
      });
      const up = O.ki_plan_update || "off";
      ctlRow(self, g, t("Update check"), t("Checks the release notes of pending updates."),
        [self._combo(up, ["off", "daily", "manual"], "", (v) => {
          if (!v) return;
          if (v === "off") delete O.ki_plan_update; else O.ki_plan_update = v;
          self._csBar();
        }, { fixed: true, labels: { off: t("Off"), daily: t("Daily"), manual: t("Only on button press") } }).wrap])
        .classList.add("cs-plan");
    };
    const decimalSep = (self) => (1.5).toLocaleString(String((self._hass && self._hass.locale && self._hass.locale.language)
      || (self._hass && self._hass.language) || "en")).charAt(1);
    const notifyLabel = (id) => {
      const s = String(id).replace(/^notify\./, "").replace(/^mobile_app_/, "").replace(/_/g, " ").trim();
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
    };

    P._csFillOptions = function (host, page) {
      const cs = this._cs;
      const self = this;
      if (!cs.opt) {
        const list = this._flowGroup(host, { footer: cs.optErr === "old"
          ? t("These options appear here after Home Assistant has restarted with the new Casora version. Until then they are in Casora's options in Home Assistant.")
          : t("The options could not be loaded.") + " " + (cs.optErr || "") });
        this._flowRow(list, { title: t("Open Casora Options"), chevron: true, onTap: () => this._csHaOptions() });
        return;
      }
      const O = cs.O;
      if (page === "ai") {
        // "mcp" (ai_jobs.py AI_MCP) instead of an AI task: the features queue jobs that your own assistant fetches
        // and answers over MCP (casora.ai_jobs / casora.ai_answer). Either field may hold it (HA's options dialog).
        const MCP = "mcp";
        const mcp = O.ai_task_entity === MCP || O.ai_task_web_entity === MCP;
        let g = this._flowGroup(host, { header: t("Which AI"),
          footer: mcp
            ? t("Casora's AI features wait for your assistant: ask it to do Casora's open AI jobs. Casora Studio's own AI steps still need an AI task.")
            : t("Empty: the default AI from Settings → AI tasks.") });
        ctlRow(this, g, t("Who answers"), t("An AI task in Home Assistant, or your own assistant connected over MCP."),
          [this._combo(mcp ? MCP : "task", ["task", MCP], "", (v) => {
            if (!v || v === (mcp ? MCP : "task")) return;
            if (v === MCP) { O.ai_task_entity = MCP; delete O.ai_task_web_entity; }
            else ["ai_task_entity", "ai_task_web_entity"].forEach((k) => { if (O[k] === MCP) delete O[k]; });
            this._csBar();
            this._csRepaint();
          }, { fixed: true, labels: { task: t("AI task"), [MCP]: t("Your own assistant (MCP)") } }).wrap]);
        if (mcp) {
          this._flowRow(g, { title: t("How it works"), chevron: true, onTap: () => window.open(
            "https://github.com/SH1FT-W/casora/blob/main/docs/guide.md#use-your-own-assistant-for-casoras-ai-features",
            "_blank", "noopener") });
        } else {
          ctlRow(this, g, t("AI for coaches, camera and plants"), t("Which AI writes the coaches' tips and checks camera pictures and plants."), [entPick(this, cs, "ai_task_entity", ["ai_task"])]);
          ctlRow(this, g, t("AI with web search"), t("Update analysis, recipe"),
            [entPick(this, cs, "ai_task_web_entity", ["ai_task"])]);
        }
        aiModelGroup(this, cs, host);
        planGroup(this, host, O);
        g = this._flowGroup(host, { header: t("Recipe of the week"),
          footer: t("Empty: Cookidoo's additional purchases if set up, otherwise the first to-do list.") });
        ctlRow(this, g, t("Shopping list for the ingredients"), t("Where the recipe of the week puts its ingredients."), [entPick(this, cs, "rezept_liste", ["todo"])]);
        g = this._flowGroup(host, { header: t("Hints for the AI"),
          footer: t("Given to every analysis, e.g. “The bedroom windows are tilted on purpose.”") });
        const area = el("textarea", "cs-area");
        area.value = O.ki_hinweise || "";
        area.rows = 4;
        area.setAttribute("data-no-i18n", "");
        area.setAttribute("aria-label", t("Hints for the AI"));
        area.oninput = () => { if (area.value.trim()) O.ki_hinweise = area.value; else delete O.ki_hinweise; this._csBar(); };
        const ar = this._flowRow(g, {});
        ar.row.classList.add("casora-prow");
        ar.row.appendChild(area);
      } else if (page === "outdoor") {
        let g = this._flowGroup(host, { header: t("Outdoor values"),
          footer: t("Empty: Casora finds outdoor sensors by their name.") });
        ctlRow(this, g, t("Outdoor temperature"), t("A sensor outside, for ventilation and heating tips."), [entPick(this, cs, "outdoor_temperature", ["sensor"], ["temperature"])]);
        ctlRow(this, g, t("Outdoor humidity"), t("A sensor outside, for ventilation tips."), [entPick(this, cs, "outdoor_humidity", ["sensor"], ["humidity"])]);
        g = this._flowGroup(host, { header: t("Electricity price"),
          footer: t("For the energy analysis, the solar tip and costs in device popups. Between 0 and 2 €/kWh. Empty: the grid price from the Energy dashboard.") });
        const wrap = el("div", "cs-num");
        const inp = el("input");
        // Text instead of number: "0,30" with a comma works this way in every browser.
        inp.type = "text";
        inp.inputMode = "decimal";
        // Empty field: the grid import price from HA's energy dashboard applies (fixed value or
        // current state of the price entity) and shows as placeholder and hint.
        const ep = cs.energyPrice || {};
        let eKwh = typeof ep.kwh === "number" ? ep.kwh : null;
        const eSt = ep.entity && this._hass && this._hass.states[ep.entity];
        if (eSt && isFinite(parseFloat(eSt.state))) {
          eKwh = parseFloat(eSt.state);
          const u = String((eSt.attributes || {}).unit_of_measurement || "").replace(/\s/g, "").toLowerCase();
          if (/\/mwh$/.test(u)) eKwh /= 1000; else if (/\/wh$/.test(u)) eKwh *= 1000;
        }
        const eText = eKwh != null
          ? eKwh.toLocaleString((this._hass && this._hass.locale && this._hass.locale.language) || undefined,
            { minimumFractionDigits: 2, maximumFractionDigits: 4 })
          : null;
        inp.placeholder = eText || "0" + decimalSep(this) + "30";
        inp.value = O.price_kwh != null ? String(O.price_kwh).replace(".", decimalSep(this)) : "";
        inp.setAttribute("aria-label", t("Price per kWh"));
        const pr = this._flowRow(g, { title: t("Price per kWh"),
          sub: eText ? t("From the Energy dashboard: {v} €/kWh").replace("{v}", eText) : null });
        const sub = pr.row.querySelector(".rtext > span");
        if (sub) {
          sub.setAttribute("data-no-i18n", "");
          sub.hidden = O.price_kwh != null;
        }
        inp.oninput = () => {
          const v = inp.value.trim().replace(",", ".");
          if (!v) delete O.price_kwh; else O.price_kwh = /^\d*\.?\d+$/.test(v) ? Number(v) : NaN;
          if (sub) sub.hidden = !!v;
          this._csBar();
        };
        wrap.append(inp, el("span", "", "€/kWh"));
        pr.row.appendChild(wrap);
      } else if (page === "update_push") {
        // Push on new Casora versions (update_push.py): phones only (mobile_app), empty = off.
        const known = (cs.opt.notify_services || []).filter((x) => /^notify\.mobile_app_/.test(x));
        (O.update_push || []).forEach((x) => { if (!known.includes(x)) known.push(x); });
        const g = this._flowGroup(host, { header: t("New Casora versions"),
          footer: t("One push per new version. Tapping it opens Casora's updates. None selected: no push notifications.") });
        ctlRow(this, g, t("Notify about new Casora versions"), null,
          [chips(this, known.map((id) => [id, notifyLabel(id)]), O.update_push || [], toggleIn(cs, "update_push"))]);
      } else if (page === "vent") {
        const known = (cs.opt.notify_services || []).slice();
        (O.lueften_push || []).forEach((x) => { if (!known.includes(x)) known.push(x); });
        let g = this._flowGroup(host, { header: t("Push notifications"),
          footer: t("“Ventilate now” (7 am–10 pm), “Close the window” (7 am–11 pm) after 10 min., CO₂ above 2500 ppm right away. None selected: no push notifications.") });
        ctlRow(this, g, t("Send ventilation hints to"), t("The phones that get “Air now” and “Close the windows”."),
          [chips(this, known.map((id) => [id, notifyLabel(id)]), O.lueften_push || [], toggleIn(cs, "lueften_push"))]);
        const S = (this._hass && this._hass.states) || {};
        const people = Object.keys(S).filter((id) => id.startsWith("person.")).sort();
        (O.lueften_personen || []).forEach((x) => { if (!people.includes(x)) people.push(x); });
        g = this._flowGroup(host, { header: t("Only when someone is home"),
          footer: t("“Ventilate now” only when one of these people is home. None selected: anyone.") });
        ctlRow(this, g, t("People"), t("Only when one of them is at home."),
          [chips(this, people.map((id) => [id, self._prettyEntity(id)]), O.lueften_personen || [], toggleIn(cs, "lueften_personen"))]);
      }
    };

    // ── Chargers nearby (charging.py, issue 168) ─────────────────────────────
    const chargingTestText = (r) => {
      if (r.ok) {
        return r.count ? t("Works: {n} chargers within {r} km.").replace("{n}", r.count).replace("{r}", r.radius)
          : t("Works, but no charger within {r} km.").replace("{r}", r.radius);
      }
      const codes = { format: "The key doesn't have the right format.", key: "Open Charge Map doesn't accept this key.",
        wait: "Asked just now. Please try again in a moment.", timeout: "Open Charge Map doesn't answer right now.",
        net: "No connection to Open Charge Map.", limit: "Too many requests. Please try again later." };
      return codes[r.code] ? t(codes[r.code]) : (t("Didn't work:") + " " + (r.message || r.code));
    };
    P._csFillCharging = function (host) {
      const cs = this._cs;
      if (!cs.ch) {
        this._flowGroup(host, { footer: cs.chErr === "old"
          ? t("This page appears after Home Assistant has restarted with the new Casora version.")
          : t("The settings could not be loaded.") + " " + (cs.chErr || "") });
        return;
      }
      const ch = cs.ch, C = cs.C;
      if (!ch.key_set) host.appendChild(el("div", "cs-note", t("Not set up yet: the car popup shows no chargers. A free Open Charge Map key below turns them on.")));
      // 1 · Key
      const g = this._flowGroup(host, { header: t("1 · Key"),
        footer: t("The key stays in Home Assistant and never goes to the browser. Casora asks Open Charge Map only when a car window asks for chargers, at most every 30 minutes per place.") });
      const r1 = this._flowRow(g, { title: t("Free Open Charge Map key"), sub: t("Sign in there, then My Profile, My Apps") });
      const a = el("a", "cs-tk-link", t("Get one") + " ↗");
      a.href = "https://openchargemap.org/site/profile/applications";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.cssText = "margin-left:auto;font-size:var(--t-callout);font-weight:600;color:var(--accent);text-decoration:none;white-space:nowrap";
      r1.row.appendChild(a);
      const r2 = this._flowRow(g, { title: t("Key"), sub: ch.key_set ? (C.key === "" ? t("Removed when you save") : t("Saved")) : t("Paste") });
      r2.row.classList.add("casora-prow");
      const box = el("div", "casora-pctl");
      const inp = el("input", "fin cs-ch-key");
      // Masked like a password; the stored key never comes back into the form.
      inp.type = "password";
      inp.autocomplete = "off";
      inp.spellcheck = false;
      inp.setAttribute("autocapitalize", "off");
      inp.setAttribute("data-no-i18n", "");
      inp.setAttribute("aria-label", t("Key"));
      inp.placeholder = ch.key_set ? "••••••••-••••-••••-••••-••••••••••••" : "00000000-0000-0000-0000-000000000000";
      inp.value = C.key || "";
      inp.style.cssText = "flex:1 1 260px;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
      inp.oninput = () => {
        const v = inp.value.trim();
        if (v) C.key = v; else delete C.key;
        this._csBar();
      };
      box.appendChild(inp);
      if (ch.key_set) box.appendChild(btn(t("Remove"), () => { C.key = ""; this._csRepaint(); }, true));
      r2.row.appendChild(box);
      // Test request: with the typed key, otherwise with the stored one.
      const r3 = this._flowRow(g, { title: t("Test request"), sub: cs.chTest ? chargingTestText(cs.chTest) : t("Asks Open Charge Map once around your home.") });
      r3.row.classList.add("casora-prow", "cs-ch-test");
      const sub3 = r3.row.querySelector(".rtext > span");
      if (sub3) {
        sub3.setAttribute("data-no-i18n", "");
        if (cs.chTest) sub3.style.color = cs.chTest.ok ? "var(--casora-studio-good, #34c759)" : "var(--casora-studio-danger, #ff453a)";
      }
      const tb = btn(cs.chBusy ? t("Testing…") : t("Test now"), async () => {
        const key = C.key || null;
        if (!key && !ch.key_set) { cs.chTest = { ok: false, code: "format" }; this._csRepaint(); return; }
        cs.chBusy = true; this._csRepaint();
        try { cs.chTest = await this._hass.callWS(key ? { type: "casora/charging/test", key } : { type: "casora/charging/test" }); }
        catch (e) { cs.chTest = { ok: false, code: "error", message: (e && e.message) || String(e) }; }
        cs.chBusy = false;
        this._csRepaint();
      }, true);
      tb.disabled = !!cs.chBusy;
      const c3 = el("div", "casora-pctl");
      c3.appendChild(tb);
      r3.row.appendChild(c3);
      // 2 · Area
      const g2 = this._flowGroup(host, { header: t("2 · Area"),
        footer: t("Around home, or around the car while it is out and about (if it reports its location). Between 1 and 50 km.") });
      const rr = this._flowRow(g2, { title: t("Radius"), sub: t("Around home") });
      const wrap = el("div", "cs-num");
      const rin = el("input", "cs-ch-radius");
      rin.type = "text";
      rin.inputMode = "decimal";
      rin.value = String(C.radius).replace(".", decimalSep(this));
      rin.setAttribute("aria-label", t("Radius"));
      rin.oninput = () => {
        const v = Number(rin.value.trim().replace(",", "."));
        if (isFinite(v) && v > 0) C.radius = Math.max(1, Math.min(ch.radius_max || 50, Math.round(v * 10) / 10));
        this._csBar();
      };
      wrap.append(rin, el("span", "", "km"));
      rr.row.appendChild(wrap);
      host.appendChild(el("p", "cs-lede", t("Data: Open Charge Map and its data providers, CC BY 4.0. No live availability and hardly any prices.")));
    };

    // ── Fuel prices (tanken.py) ──────────────────────────────────────────────
    const FUEL_LABELS = { e5: "Super E5", e10: "Super E10", diesel: "Diesel", off: "Off" };
    const tankenTestText = (self, r) => {
      if (r.ok) {
        const best = Object.keys(r.cheapest || {}).map((f) => FUEL_LABELS[f] + " " + Number(r.cheapest[f]).toLocaleString(
          (self._hass && self._hass.language) || undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €").join(", ");
        return t("Works: {n} gas stations within {r} km.").replace("{n}", r.count).replace("{r}", r.radius)
          + (best ? " " + t("Cheapest: {x}").replace("{x}", best) : "");
      }
      const codes = { format: "The key doesn't have the right format.", key: "Tankerkönig doesn't accept this key.",
        wait: "Asked just now. Please try again in a moment.", timeout: "Tankerkönig doesn't answer right now.",
        net: "No connection to Tankerkönig." };
      return codes[r.code] ? t(codes[r.code]) : (t("Didn't work:") + " " + (r.message || r.code));
    };
    P._csFillTanken = function (host) {
      const cs = this._cs;
      const self = this;
      if (!cs.tk) {
        this._flowGroup(host, { footer: cs.tkErr === "old"
          ? t("This page appears after Home Assistant has restarted with the new Casora version.")
          : t("The settings could not be loaded.") + " " + (cs.tkErr || "") });
        return;
      }
      const tk = cs.tk, F = cs.F;
      if (!tk.source) host.appendChild(el("div", "cs-note", t("Not set up yet: the car popup shows no fuel row. Use the Tankerkönig integration in Home Assistant or a free key below.")));
      if (tk.source === "integration") {
        const g = this._flowGroup(host, { header: t("Data source"),
          footer: t("Casora reads the existing sensors. No key needed. Add gas stations in the Tankerkönig integration.") });
        const r = this._flowRow(g, { title: t("Tankerkönig in Home Assistant"),
          sub: t("Found: {n} gas stations with prices").replace("{n}", tk.integration.stations), detail: t("In use") });
        r.row.classList.add("cs-tk-source");
      } else {
        // 1 · Key
        const g = this._flowGroup(host, { header: t("1 · Key"),
          footer: t("The key stays in Home Assistant and never goes to the browser. Casora asks at most every 10 minutes, within at most 25 km.") });
        const r1 = this._flowRow(g, { title: t("Free Tankerkönig key"), sub: t("Arrives by e-mail after a short check") });
        const a = el("a", "cs-tk-link", t("Apply for one") + " ↗");
        a.href = "https://onboarding.tankerkoenig.de/";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.cssText = "margin-left:auto;font-size:var(--t-callout);font-weight:600;color:var(--accent);text-decoration:none;white-space:nowrap";
        r1.row.appendChild(a);
        const r2 = this._flowRow(g, { title: t("Key"), sub: tk.key_set ? (F.key === "" ? t("Removed when you save") : t("Saved")) : t("Paste") });
        r2.row.classList.add("casora-prow");
        const box = el("div", "casora-pctl");
        const inp = el("input", "fin cs-tk-key");
        // Masked like a password; the stored key never comes back into the form.
        inp.type = "password";
        inp.autocomplete = "off";
        inp.spellcheck = false;
        inp.setAttribute("autocapitalize", "off");
        inp.setAttribute("data-no-i18n", "");
        inp.setAttribute("aria-label", t("Key"));
        inp.placeholder = tk.key_set ? "••••••••-••••-••••-••••-••••••••••••" : "00000000-0000-0000-0000-000000000000";
        inp.value = F.key || "";
        inp.style.cssText = "flex:1 1 260px;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
        inp.oninput = () => {
          const v = inp.value.trim();
          if (v) F.key = v; else delete F.key;
          this._csBar();
        };
        box.appendChild(inp);
        if (tk.key_set) box.appendChild(btn(t("Remove"), () => { F.key = ""; this._csRepaint(); }, true));
        r2.row.appendChild(box);
        // Test fetch: with the typed key, otherwise with the stored one.
        const r3 = this._flowRow(g, { title: t("Test request"), sub: cs.tkTest ? tankenTestText(this, cs.tkTest) : t("Asks Tankerkönig once around your home.") });
        r3.row.classList.add("casora-prow", "cs-tk-test");
        const sub3 = r3.row.querySelector(".rtext > span");
        if (sub3) {
          sub3.setAttribute("data-no-i18n", "");
          if (cs.tkTest) sub3.style.color = cs.tkTest.ok ? "var(--casora-studio-good, #34c759)" : "var(--casora-studio-danger, #ff453a)";
        }
        const tb = btn(cs.tkBusy ? t("Testing…") : t("Test now"), async () => {
          const key = F.key || null;
          if (!key && !tk.key_set) { cs.tkTest = { ok: false, code: "format" }; this._csRepaint(); return; }
          cs.tkBusy = true; this._csRepaint();
          try { cs.tkTest = await this._hass.callWS(key ? { type: "casora/tanken/test", key } : { type: "casora/tanken/test" }); }
          catch (e) { cs.tkTest = { ok: false, code: "error", message: (e && e.message) || String(e) }; }
          cs.tkBusy = false;
          this._csRepaint();
        }, true);
        tb.disabled = !!cs.tkBusy;
        const c3 = el("div", "casora-pctl");
        c3.appendChild(tb);
        r3.row.appendChild(c3);
        // 2 · Radius
        const g2 = this._flowGroup(host, { header: t("2 · Area"),
          footer: t("Around home, or around the car while it is out and about (if it reports its location). Between 1 and 25 km.") });
        const rr = this._flowRow(g2, { title: t("Radius"), sub: t("Around home") });
        const wrap = el("div", "cs-num");
        const rin = el("input", "cs-tk-radius");
        rin.type = "text";
        rin.inputMode = "decimal";
        rin.value = String(F.radius).replace(".", decimalSep(this));
        rin.setAttribute("aria-label", t("Radius"));
        rin.oninput = () => {
          const v = Number(rin.value.trim().replace(",", "."));
          if (isFinite(v) && v > 0) F.radius = Math.max(1, Math.min(25, Math.round(v * 10) / 10));
          this._csBar();
        };
        wrap.append(rin, el("span", "", "km"));
        rr.row.appendChild(wrap);
        const st = tk.status || {};
        if (st.at) {
          const when = new Date(st.at).toLocaleTimeString((this._hass && this._hass.language) || undefined, { hour: "2-digit", minute: "2-digit" });
          host.appendChild(el("p", "cs-lede", st.ok ? t("Last request {t}: {n} gas stations.").replace("{t}", when).replace("{n}", st.count)
            : t("Last request {t} failed: {x}").replace("{t}", when).replace("{x}", st.error || "")));
        }
      }
      // Fuel per car
      const g3 = this._flowGroup(host, { header: t("Fuel per car"),
        footer: (tk.cars || []).length ? t("Off: no fuel row for this car. Electric cars don't appear here.")
          : t("No car with a fuel level found in Home Assistant.") });
      (tk.cars || []).forEach((c) => {
        const cur = F.cars[c.device_id] || c.fuel;
        const sub = c.sensor && tk.source ? c.sensor : (c.fuel_auto === "diesel" ? t("Diesel suggested (AdBlue found)") : null);
        const row = ctlRow(self, g3, c.name, sub, [self._combo(cur, ["e10", "e5", "diesel", "off"], "", (v) => {
          if (!v) return;
          F.cars[c.device_id] = v;
          self._csBar();
        }, { fixed: true, labels: FUEL_LABELS }).wrap]);
        row.querySelector(".rtext b").setAttribute("data-no-i18n", "");
        const sp = row.querySelector(".rtext > span");
        if (sp && c.sensor) sp.setAttribute("data-no-i18n", "");
      });
      host.appendChild(el("p", "cs-lede", t("Data: Tankerkönig, CC BY 4.0")));
    };

    // Content of a subpage (page on desktop, sheet on the phone).
    P._csFill = function (host, pageId, rerender) {
      css(this);
      const cs = this._cs;
      const page = pageOf(pageId);
      host.replaceChildren();
      this._csFillNeu(host, page);
    };

    // ── Settings: eight tiles ─────────────────────────────────────────────────────────
    // Start: search + tiles; tile page: its blocks, each with title, plain sentence and the existing controls.
    const neuHay = (b, tile) => {
      const fold = (x) => String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
      return { name: fold(t(b.title)), hay: fold([t(b.title), b.title, t(b.plain), t(tile.label), tile.label, b.kw].join(" ")), fold };
    };
    P._csNeuFind = function (q) {
      const fold = neuHay({}, { label: "" }).fold;
      const words = fold(q).trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const hits = [];
      NEU.forEach((tile) => tile.blocks.forEach((b) => {
        const h = neuHay(b, tile);
        if (!words.every((w) => h.hay.includes(w))) return;
        const starts = words.every((w) => h.name.split(/[\s&:,()-]+/).some((n) => n.indexOf(w) === 0)) ? 2 : 0;
        hits.push({ tile, b, score: starts + (words.every((w) => h.hay.split(/[\s&:,/()·–-]+/).some((n) => n.indexOf(w) === 0)) ? 1 : 0) });
      }));
      return hits.sort((a, b) => b.score - a.score);
    };
    P._csNeuGo = function (tile, b) {
      if (b && b.adv) (this._nAdv = this._nAdv || new Set()).add(tile.id);
      if (b && tile.fold) (this._nOpen = this._nOpen || new Set()).add(b.k);
      return this._csShow("n-" + tile.id, b ? "nb-" + b.k : undefined);
    };
    // Updates are a page of their own (install, versions); ‹ leads back to the tile.
    P._csNeuLink = function (tile, b) {
      return this._csHubGo({ updates: true, back: "n-" + tile.id });
    };
    // One dashboard section, drawn by the Studio's own code (_renderForm) into a detached pane: same fields, same
    // storage, undo and phone sync as in the inspector. Only that section is drawn (no tiles or badges), for the
    // home room – the dashboard-wide fields are the same in every room, and the scenes list exists only there.
    P._csDashCard = function (label) {
      const st = this._state;
      if (!st || !st.compact || !(st.compact.rooms || []).length) return null;
      const rooms = st.compact.rooms;
      const home = Math.max(0, rooms.findIndex((r) => I().isHomeRoom ? I().isHomeRoom(r, rooms) : r.path === "home"));
      const fake = document.createElement("div");
      fake.id = "pane";
      const had = Object.prototype.hasOwnProperty.call(this, "$");
      const keep = { room: this._room, sel: this._sel, $: this.$ };
      const KEEP = ["_cardsRoom", "_scrollRoom", "_switches", "_foldables", "_mapSig", "_toLevelTop", "_toListScroll",
        "_toPageTop", "_bRoomSeen", "_countFor", "_bSwapped", "_listScroll"];
      const kept = KEEP.map((k) => [k, this[k]]);
      this.$ = (id) => (id === "pane" ? fake : this.shadowRoot.getElementById(id));
      this._csOnly = new Set([label]);
      this._room = home;
      this._sel = null;
      // Through the whole chain of _renderForm, so the extensions (e.g. "Show as" for scenes) add their rows.
      this._csHarvesting = true;
      try { P._renderForm.call(this); } catch (e) { /* drawn as far as it got */ }
      finally {
        this._csHarvesting = false;
        this._csOnly = null;
        this._room = keep.room;
        this._sel = keep.sel;
        kept.forEach(([k, v]) => { this[k] = v; });
        if (had) this.$ = keep.$; else delete this.$;
        this._csHarvested = true;
      }
      return fake.querySelector('section.card[data-k="' + label + '"]');
    };
    // Trim a drawn section to one block: its own head goes (the block has a title; a section switch becomes a
    // labelled first row), sub keeps one part, keys keeps only those fields (and the hint under the last one).
    const DASH_SWITCH = { Scenes: "Show scenes on this dashboard" };
    const trimCard = (self, card, b) => {
      card.classList.remove("shut", "sel");
      card.classList.add("cn-card");
      const head = card.querySelector(":scope > .chead");
      const sw = head && head.querySelector(".sw");
      if (sw && !card.querySelector(":scope > .togglecard")) self._toggleRowFor(head, sw, card._toggleRow || t(DASH_SWITCH[b.sec] || "On"));
      if (head) head.remove();
      // Links into the previous settings pages (personal.js, addons.js) do not belong on the new pages.
      card.querySelectorAll(".casora-looklink, .casora-plink").forEach((x) => x.remove());
      // A section switch (bell, scenes) folds or greys the card in the inspector: here the page draws itself again.
      if (sw) sw.addEventListener("click", () => setTimeout(() => { if (self._csOpen) self._csRender(); }, 0));
      if (b.sub) {
        let mine = false;
        [...card.children].forEach((c) => {
          if (c.classList.contains("subtitle")) { mine = c.dataset.sub === b.sub; c.remove(); return; }
          if (c.classList.contains("togglecard") || c.classList.contains("cdesc")) return;
          if (!mine) c.remove();
        });
      }
      if (b.keys) {
        [...card.children].forEach((c) => {
          if (!c.classList.contains("subcard")) return;
          const rows = [...c.querySelectorAll(":scope > .row[data-key]")];
          if (!rows.length) return;
          const lastGone = !b.keys.includes(rows[rows.length - 1].dataset.key);
          rows.forEach((r) => { if (!b.keys.includes(r.dataset.key)) r.remove(); });
          const next = c.nextElementSibling;
          if (lastGone && next && next.classList.contains("hint")) next.remove();
          if (!c.querySelector(".row")) c.remove();
        });
      }
      // One plate per part: a hint between two plates belongs to the row above it, so it moves into the plate under
      // that row and the two plates become one (before, the hint tore the plate apart).
      for (let c = card.firstElementChild; c; c = c.nextElementSibling) {
        if (!c.classList.contains("subcard") || c.classList.contains("togglecard")) continue;
        let h = c.nextElementSibling;
        while (h && h.classList.contains("hint") && h.nextElementSibling && h.nextElementSibling.classList.contains("subcard")
          && !h.nextElementSibling.classList.contains("togglecard")) {
          const next = h.nextElementSibling;
          c.appendChild(h);
          while (next.firstChild) c.appendChild(next.firstChild);
          next.remove();
          h = c.nextElementSibling;
        }
      }
      // The "Add a field" button comes a beat later (microtask): it belongs to the whole section, keep it only
      // where the whole section is shown.
      if (b.sub || b.keys) queueMicrotask(() => card.querySelectorAll(":scope > .fieldadd").forEach((x) => x.remove()));
    };
    // One heading level: the block title is the heading of its first group, so that group's own heading goes;
    // headings of further groups stay (drawn like the block title). Numbered steps ("2 · Radius") lose the number,
    // since the first step has no heading of its own any more.
    const dedupe = (box) => {
      const heads = [...box.querySelectorAll(".fgroup > .fhead")];
      heads.forEach((h) => { const m = h.textContent.match(/^\s*\d+\s*·\s*(.+)$/); if (m) h.textContent = m[1]; });
      if (heads[0] && heads[0].parentElement === box.querySelector(".fgroup")) heads[0].remove();
    };
    P._csNeuBlock = function (host, tile, b, rerender) {
      const box = el("section", "cn-block");
      box.dataset.pkey = "nb-" + b.k;
      const head = el("div", "cn-bhead");
      head.append(el("b", "", t(b.title)), el("span", "", t(b.plain)));
      box.appendChild(head);
      host.appendChild(box);
      const cs = this._cs;
      if (b.updates) {
        const list = this._flowGroup(box);
        this._flowRow(list, { title: t("Open updates"), chevron: true, onTap: () => this._csNeuLink(tile, b) });
        return;
      }
      if (b.sec) {
        // Applies only here: said on the block, where the eye already is. A block that also holds settings for every
        // dashboard says it on its first part instead.
        if (b.personal) box.appendChild(el("div", "fhead", t("On this dashboard")));
        else head.querySelector("b").appendChild(el("span", "rdetail cs-dash cn-only", t("Only this dashboard")));
        const card = this._csDashCard(b.sec);
        // The note is for a missing dashboard only (the screensaver's preview had made it show under every card).
        if (card) { trimCard(this, card, b); box.appendChild(card); if (b.saver) this._csSaverPreview(box, card); }
        else box.appendChild(el("p", "cs-lede", t("Open a dashboard in the Studio to change this.")));
        if (b.personal && cs && cs.loaded && typeof this._casoraPersonalGroups === "function") this._casoraPersonalGroups(box, cs.S, b.personal, rerender);
        return;
      }
      if (b.page === "design") {
        if (!(typeof this._casoraLookPicker === "function" && this._casoraLookPicker(box))) box.appendChild(el("p", "cs-lede", t("No Casora design is installed.")));
        return;
      }
      if (!cs || !cs.loaded) { box.appendChild(el("p", "cs-lede", t("Loading settings…"))); return; }
      if (b.page === "live") { if (typeof this._csFillLive === "function") this._csFillLive(box); dedupe(box); return; }
      if (b.fuel) { this._csFillTanken(box); dedupe(box); return; }
      if (b.charging) { this._csFillCharging(box); dedupe(box); return; }
      if (b.hemma) { this._csHemmaGroup(box); if (!box.querySelector(".fgroup")) box.remove(); else dedupe(box); return; }
      if (b.personal) {
        if (typeof this._casoraPersonalGroups === "function") this._casoraPersonalGroups(box, cs.S, b.personal, rerender);
        // A section with nothing to show (e.g. no devices found) leaves no empty heading behind.
        if (!box.querySelector(".fgroup")) box.remove(); else dedupe(box);
        return;
      }
      if (b.opt) this._csFillOptions(box, b.opt);
      dedupe(box);
    };
    // A block of a fold tile: its heading opens and closes it. Drawn right away, closed by CSS, so the open state
    // survives the redraw after every change (this._nOpen) and an empty block has already removed itself.
    const foldBlock = (self, box, b) => {
      if (!box || box.dataset.pkey !== "nb-" + b.k) return;
      self._nOpen = self._nOpen || new Set();
      const head = box.querySelector(":scope > .cn-bhead");
      const set = (on) => {
        box.classList.toggle("open", on);
        head.setAttribute("aria-expanded", on ? "true" : "false");
        if (on) self._nOpen.add(b.k); else self._nOpen.delete(b.k);
      };
      box.classList.add("cn-fold");
      head.tabIndex = 0;
      head.setAttribute("role", "button");
      set(self._nOpen.has(b.k));
      head.addEventListener("click", () => set(!box.classList.contains("open")));
      head.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        set(!box.classList.contains("open"));
      });
    };
    // A tile's side panel in tabs (settings rework): Tile (the form as it is), Popup (its popup fields, no longer behind
    // a fold), and, for kinds with shared settings, one block of the settings drawn in place. That block uses the same
    // draft as the settings pages, so it takes effect only with "Save settings".
    P._tileTabs = function (box, body, tile, type, popupDet) {
      const shared = TILE_SHARED[type.id];
      const home = shared && NEU.find((x) => x.id === shared[0]);
      const block = home && home.blocks.find((b) => b.k === shared[1]);
      if (!popupDet && !block) return;
      css(this);
      if (block) watch(this);
      const tabs = [["tile", t("Tile"), body]];
      if (popupDet) {
        const pane = el("div", "tilepane");
        popupDet.classList.add("open");
        const sum = popupDet.querySelector(":scope > .advsum");
        if (sum) sum.setAttribute("aria-expanded", "true");
        pane.appendChild(popupDet);
        tabs.push(["popup", t("Popup"), pane]);
      }
      let drawShared = null;
      if (block) {
        const pane = el("div", "tilepane");
        tabs.push(["all", t(shared[2]), pane]);
        drawShared = async () => {
          if (pane.dataset.drawn) return;
          pane.dataset.drawn = "1";
          try { await this._csLoad(); } catch (e) { /* the block says what is missing */ }
          if (!pane.isConnected) return;
          const inner = el("div", "cs-wrap");
          const draw = () => {
            inner.replaceChildren();
            this._csNeuBlock(inner, home, block, draw);
            // Drawing a dashboard section ran the Studio's after-render steps for the home room.
            if (this._csHarvested) {
              this._csHarvested = false;
              if (typeof this._bApply === "function") this._bApply();
              if (typeof this._bRoomsPaint === "function") this._bRoomsPaint();
            }
            // A row redraws only this block, so the save bar is told here.
            this._csBar();
          };
          const link = el("button", "tilelink", t("Open in Settings") + " ›");
          link.type = "button";
          link.onclick = () => this._csNeuGo(home, block);
          const bar = el("div", "cs-bar" + (this._csDirty() ? "" : " cs-clean"));
          const save = btn(t("Save settings"), () => this._csSave());
          save.className = "cs-save";
          bar.append(el("span", "cs-state"), save);
          pane.append(inner, link, bar);
          draw();
        };
      }
      const strip = el("div", "tiletabs");
      strip.setAttribute("role", "tablist");
      const show = (id) => {
        this._tileTab = id;
        tabs.forEach(([k, , pane], i) => {
          pane.style.display = k === id ? "" : "none";
          strip.children[i].setAttribute("aria-selected", k === id ? "true" : "false");
        });
        if (id === "all" && drawShared) drawShared();
      };
      tabs.forEach(([id, label]) => {
        const b = el("button", "", label);
        b.type = "button";
        b.dataset.tab = id;
        b.setAttribute("role", "tab");
        b.onclick = () => {
          show(id);
          // The popup preview follows the tab (_cpSync alone keeps one that is already open).
          if (id === "popup" && this._cpSync) { this._cpDismissed = null; this._cpSync(); }
          else if (id !== "popup" && this._cpLayer && this._cpClose) this._cpClose();
        };
        strip.appendChild(b);
      });
      box.insertBefore(strip, body);
      tabs.slice(1).forEach(([, , pane]) => box.appendChild(pane));
      show(tabs.some(([k]) => k === this._tileTab) ? this._tileTab : "tile");
    };
    // The gear of a popup without a tile (?settings=<block> or start): opens that section once.
    P._settingsFromRoute = function () {
      let want = "";
      try { want = new URLSearchParams(window.location.search).get("settings") || ""; } catch (e) { want = ""; }
      if (!want) return;
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("settings");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      } catch (e) { /* the address stays */ }
      const tile = NEU.find((x) => x.blocks.some((b) => b.k === want));
      if (tile) return this._csNeuGo(tile, tile.blocks.find((b) => b.k === want));
      return this._csShow("n-start");
    };
    // Preview of the screensaver (scripts/local/46-screensaver.js draws it, the same code as on the tablet): it shows
    // the kind picked in the draft right away, nothing is saved by looking. Chips let one look at every kind; where the
    // house has nothing to show right now (nothing playing, no appointments), the preview shows an example.
    let saverLoad = null;
    P._csSaverPreview = function (box, card) {
      const SV = window._casoraSaver;
      const wrap = el("div", "cs-saver");
      wrap.style.cssText = "margin:0 0 14px;";
      const stage = el("div", "cs-saver-stage");
      stage.style.cssText = "position:relative;width:100%;aspect-ratio:1180 / 820;max-height:52vh;border-radius:22px;overflow:hidden;background:#101010;";
      wrap.appendChild(stage);
      box.insertBefore(wrap, card);
      if (!SV || typeof SV.mount !== "function") {
        stage.appendChild(el("p", "cs-lede", t("The preview appears once the dashboard's scripts have loaded.")));
        stage.firstChild.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;color:#fff;margin:0;padding:16px;text-align:center;";
        // The Studio does not load the dashboard's modules: fetch what the screensavers need (their texts, the
        // energy and waste helpers, the module itself) once, then draw the preview in place of this note.
        if (!saverLoad) {
          const imp = window.casoraImportScript || ((p) => import("/casora_scripts/" + p));
          const quiet = (p) => imp(p).catch(() => {});
          saverLoad = Promise.all([window.casoraTr ? null : quiet("casora-i18n.js"), window.casoraEnergyPrefs ? null : quiet("local/00-finder.js")])
            .then(() => imp("local/46-screensaver.js"));
        }
        saverLoad.then(() => {
          if (!wrap.isConnected || !window._casoraSaver) return;
          wrap.remove();
          this._csSaverPreview(box, card);
        }, () => { saverLoad = null; });
        return;
      }
      // The kind picked in the draft (the working copy of the dashboard, not yet saved).
      // The module reads a dashboard config: the Studio's rooms carry the same hero variables.
      const draft = () => {
        const rooms = this._state && this._state.compact && Array.isArray(this._state.compact.rooms) ? this._state.compact.rooms : null;
        // The room's name as the dashboard shows it (Studio rooms carry name, not title: the photo said „badezimmer“).
        const nameOf = (r) => (typeof this._roomShown === "function" ? this._roomShown(r) : r.name || r.title || "");
        return rooms ? { views: rooms.map((r) => ({ title: nameOf(r), cards: [{ variables: r.variables || {} }] })) } : null;
      };
      const picked = () => String((typeof SV.vars === "function" ? SV.vars(draft()) : {}).casora_screensaver_kind || "");
      // The chips choose (owner 11.11.2026: they looked like a choice but only changed the picture, and „One after the
      // other“, the default, had no chip). A tap writes casora_screensaver_kind to the draft like the select below.
      let show = picked() || "mix", last = picked();
      // Room photos: the Studio does not run the dashboard's casoraPhotoUrl, so the photos showed none and the preview
      // drew a landscape. The Studio's own photo list gives the address (shipped examples by their public path).
      const photoUrl = (ref) => {
        const name = String(ref || "").replace(/\.(jpe?g|png|webp)$/i, "");
        const day = name.replace(/-night$/, "");
        const hit = (this._imgs || []).find((i) => i.name === day);
        const url = hit ? (/-night$/.test(name) ? hit.night || hit.day : hit.day || hit.night) : "";
        if (url) return url;
        if (/-demo(-night)?$/.test(name)) return "/casora_assets/rooms/" + encodeURIComponent(name) + ".jpg";
        return typeof window.casoraPhotoUrl === "function" ? window.casoraPhotoUrl(ref, this._hass) : "";
      };
      const live = SV.mount(stage, null, { kind: () => show, every: 30000, sample: true,
        context: () => ({ config: draft(), photoUrl, vars: typeof SV.vars === "function" ? SV.vars(draft()) : {} }) });
      if (typeof this._images === "function") this._images().then(() => { if (stage.isConnected) { live.update(); photos(); } }, () => {});
      this._csSaverLive = live;
      const chips = el("div", "cs-saver-chips");
      chips.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;";
      const paint = () => {
        chips.textContent = "";
        [{ id: "mix", label: "One after the other" }].concat(SV.KINDS).forEach((k) => {
          const c = btn(t(k.label), () => {
            if (show === k.id) return;
            show = k.id;
            const rooms = (this._state && this._state.compact && this._state.compact.rooms) || [];
            const v = k.id === "mix" ? undefined : k.id;
            rooms.forEach((r) => { r.variables = r.variables || {}; if (v) r.variables.casora_screensaver_kind = v; else delete r.variables.casora_screensaver_kind; });
            if (typeof this._mirrorToPair === "function") this._mirrorToPair("casora_screensaver_kind", v, rooms);
            if (typeof this._markDirty === "function") this._markDirty();
            last = picked();
            // The select below shows the new choice: the page is drawn again (the preview follows the draft).
            if (typeof this._csRender === "function") { this._csRender(); return; }
            live.update(); paint(); photos();
          }, show !== k.id);
          c.classList.add("cs-saver-chip");
          c.dataset.kind = k.id;
          c.setAttribute("aria-pressed", show === k.id ? "true" : "false");
          chips.appendChild(c);
        });
      };
      paint();
      wrap.appendChild(chips);
      // Which room photos „Fotos“ shows: all of them, or the ones picked here (casora_screensaver_photos, the day
      // photo's name, on every room like the other screensaver settings). A draft like every setting.
      const pick = el("div", "cs-saver-photos");
      pick.style.cssText = "margin:14px 0 0;";
      wrap.appendChild(pick);
      const photos = () => {
        pick.textContent = "";
        const rooms = (this._state && this._state.compact && this._state.compact.rooms) || [];
        const seen = new Set(), list = [];
        rooms.forEach((r) => { const ref = r.variables && r.variables.image; if (ref && !seen.has(String(ref))) { seen.add(String(ref)); list.push({ ref: String(ref), title: typeof this._roomShown === "function" ? this._roomShown(r) : r.name || "" }); } });
        if (show !== "fotos" || !list.length) return;
        const cur = (rooms.map((r) => (r.variables || {}).casora_screensaver_photos).find((v) => Array.isArray(v) && v.length) || []).map(String);
        const on = (ref) => !cur.length || cur.includes(ref);
        pick.appendChild(el("div", "fhead", t("Photos")));
        pick.appendChild(el("p", "cs-lede", t(cur.length ? "Only the photos picked here." : "All room photos. Tap a photo to show only the ones you pick.")));
        const grid = el("div", "cs-saver-grid");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;margin:8px 0 0;";
        list.forEach((p) => {
          const b = el("button", "cs-saver-photo");
          b.type = "button";
          b.dataset.ref = p.ref;
          b.setAttribute("aria-pressed", on(p.ref) ? "true" : "false");
          const url = photoUrl(p.ref);
          b.style.cssText = "position:relative;aspect-ratio:4 / 3;border-radius:14px;overflow:hidden;cursor:pointer;padding:0;font:inherit;"
            + "border:2px solid " + (on(p.ref) ? "var(--cs-accent, #B5653A)" : "transparent") + ";opacity:" + (on(p.ref) ? "1" : "0.45") + ";"
            + "background:#2a2a2a center / cover no-repeat" + (url ? " url(\"" + String(url).replace(/["\\]/g, "\\$&") + "\")" : "") + ";";
          const cap = el("span", "", p.title);
          cap.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:14px 8px 6px;font-size:12px;font-weight:600;color:#fff;text-align:left;"
            + "background:linear-gradient(transparent, rgba(0,0,0,0.55));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
          b.appendChild(cap);
          b.onclick = () => {
            // From „all“ the first tap picks that one photo; the last one switched off means all again.
            let next = cur.length ? (cur.includes(p.ref) ? cur.filter((x) => x !== p.ref) : cur.concat([p.ref])) : [p.ref];
            next = list.map((x) => x.ref).filter((x) => next.includes(x));
            const all = rooms;
            all.forEach((r) => { r.variables = r.variables || {}; if (next.length) r.variables.casora_screensaver_photos = next.slice(); else delete r.variables.casora_screensaver_photos; });
            if (typeof this._mirrorToPair === "function") this._mirrorToPair("casora_screensaver_photos", next.length ? next.slice() : undefined, all);
            if (typeof this._markDirty === "function") this._markDirty();
            live.update(); photos();
          };
          grid.appendChild(b);
        });
        pick.appendChild(grid);
      };
      photos();
      // The kind of the draft changes: the preview follows it (looked at while the preview is on the page).
      const watch = setInterval(() => {
        if (!stage.isConnected) { clearInterval(watch); live.destroy(); return; }
        const p = picked();
        if (p === last) return;
        last = p;
        show = p || "mix"; live.update(); paint(); photos();
      }, 700);
    };
    P._csFillNeu = function (host, page) {
      if (page.tile) {
        const back = el("button", "cs-hubback", "‹ " + t("Settings"));
        back.type = "button";
        back.onclick = () => this._csShow("n-start");
        host.appendChild(back);
      }
      host.appendChild(el("p", "cs-lede", t(page.lede)));
      const rerender = () => this._csRender();
      if (page.tile) {
        const cs = this._cs;
        if (cs && cs.err) host.appendChild(el("div", "cs-err", cs.err));
        // Settings still read from the earlier file (www/casora/einstellungen.js): one save moves them here.
        if (cs && cs.fromFile && page.tile.id === "house") {
          host.appendChild(el("div", "cs-note", t("Taken over from einstellungen.js. Save once to manage these settings here; the file is no longer needed afterwards.")));
        }
        page.tile.blocks.filter((b) => !b.adv).forEach((b) => {
          this._csNeuBlock(host, page.tile, b, rerender);
          if (page.tile.fold) foldBlock(this, host.lastElementChild, b);
        });
        const adv = page.tile.blocks.filter((b) => b.adv);
        if (!adv.length) return;
        this._nAdv = this._nAdv || new Set();
        const det = el("details", "cn-adv");
        const sum = el("summary", "");
        sum.append(el("b", "", t("Advanced")), el("span", "", adv.map((b) => t(b.title)).join(" · ")));
        det.appendChild(sum);
        const body = el("div", "cn-advbody");
        det.appendChild(body);
        host.appendChild(det);
        // Only drawn when opened: rare settings cost nothing on the way in.
        const fill = () => { if (!body.childNodes.length) adv.forEach((b) => this._csNeuBlock(body, page.tile, b, rerender)); };
        if (this._nAdv.has(page.tile.id)) { det.open = true; fill(); }
        det.addEventListener("toggle", () => {
          if (det.open) { this._nAdv.add(page.tile.id); fill(); } else this._nAdv.delete(page.tile.id);
        });
        return;
      }
      // Start: search over every block, then the tiles.
      const box = el("div", "cs-hubsearch");
      const inp = el("input", "fin");
      inp.type = "search";
      inp.value = this._nQ || "";
      inp.placeholder = t("Search: e.g. clock, waste, push…");
      inp.setAttribute("aria-label", t("Search settings…"));
      box.appendChild(inp);
      const res = el("div"), main = el("div");
      host.append(box, res, main);
      const grid = el("div", "cs-hubgrid cn-grid");
      NEU.forEach((tile) => {
        const b = el("button", "cs-hubtile");
        b.type = "button";
        b.dataset.tile = tile.id;
        const ic = el("span", "rico"), mk = el("span", "mk");
        ic.style.setProperty("--tint", tint(tile));
        mk.style.setProperty("--i", "url('" + icon(tile.icon) + "')");
        ic.appendChild(mk);
        b.append(ic, el("b", "", t(tile.label)), el("span", "", t(tile.sub)));
        b.onclick = () => this._csShow("n-" + tile.id);
        grid.appendChild(b);
      });
      main.appendChild(grid);
      const find = () => {
        this._nQ = inp.value;
        if (inp.value.trim() && !host.style.minHeight) host.style.minHeight = host.offsetHeight + "px";
        if (!inp.value.trim()) host.style.minHeight = "";
        res.replaceChildren();
        main.style.display = inp.value.trim() ? "none" : "";
        if (!inp.value.trim()) return;
        const hits = this._csNeuFind(inp.value);
        if (!hits.length) {
          res.appendChild(el("p", "cs-lede", t("No match – try one of the topics below.")));
          main.style.display = "";
          return;
        }
        const list = this._flowGroup(res);
        list.classList.add("cs-hublist");
        hits.forEach(({ tile, b }) => this._flowRow(list, { mask: icon(tile.icon), tint: tint(tile), title: t(b.title),
          sub: t(tile.label) + " · " + t(b.plain), detail: b.sec ? t("Only this dashboard") : undefined,
          detailTone: b.sec ? "cs-dash" : undefined, chevron: true, onTap: () => this._csNeuGo(tile, b) }));
      };
      inp.oninput = find;
      if (inp.value) find();
    };

    // ── Settings by topic (variant B) ───────────────────────────────────────────
    // New Studio: pages in the inspector (on the phone its sheet), as the toolbar always opened them; the full-screen
    // sheet only in the previous layout's phone view.
    P._csDesk = function () {
      return split(this) || this.classList.contains("bmode");
    };
    // "‹ <where it came from>": a tile page or the start.
    const backLabel = (to) => (!to || to === "n-start" ? t("Settings") : t(pageOf(to).label));
    P._csBackButton = function (to) {
      const b = el("button", "cs-hubback", "‹ " + backLabel(to));
      b.type = "button";
      b.onclick = () => {
        this._hubBackTo = null;
        return this._csShow(to || "n-start");
      };
      return b;
    };
    // A jump from elsewhere (a Studio row such as "covers that count for security", #76; Updates from a tile): where back
    // leads is the page it came from.
    P._csHubGo = function (go) {
      this._hubNav = true;
      this._hubBackTo = go.back || "n-start";
      if (go.page) return this._csShow(go.page, go.focus);
      if (go.updates) {
        if (typeof this._cuFromMenu !== "function") return null;
        const r = this._cuFromMenu();
        // Updates draw their own head: the way back goes into it (the page body is redrawn after loading).
        const to = this._hubBackTo;
        setTimeout(() => {
          const h = this._cuOpen && this.shadowRoot.querySelector(".insphead .cu-head");
          if (h && !h.querySelector(".cs-hubback")) h.insertBefore(this._csBackButton(to), h.firstChild);
        }, 60);
        this._hubNav = false;
        return r;
      }
      this._hubNav = false;
      return null;
    };

    // Unsaved settings when leaving: save, discard or stay. "save" | "discard" | "back".
    P._csAskUnsaved = async function () {
      const res = await this._ask({
        title: t("Save your changes?"),
        message: t("Some changes are not saved yet. Discard takes back everything not saved, also on this dashboard."),
        confirmLabel: t("Save"), altLabel: t("Discard"), cancelLabel: t("Back"),
      });
      return res === true ? "save" : res && res.alt ? "discard" : "back";
    };
    // Throw away every unsaved change: the drafts of the settings (read again) and this dashboard's edits (read again
    // from Home Assistant, without offering the local copy back).
    P._csDiscardAll = async function () {
      const cs = this._cs;
      if (cs) { cs.loaded = false; cs.err = null; await this._csLoad(); }
      if (this._state && this._isDirty && this._isDirty()) {
        this._discardDraft();
        await this._load();
      } else if (this._state && typeof this._dropDraft === "function") {
        // Changed and changed back: a local copy written in between is not offered later.
        this._dropDraft();
      }
      this._csDashTouched = false;
      this._csRepaint();
    };
    // Ask, then act. true = go on, false = stay.
    P._csLeaveOk = async function () {
      if (!this._csLeaveDirty()) return true;
      if (this._csAsking) return false;
      this._csAsking = true;
      try {
        const r = await this._csAskUnsaved();
        if (r === "back") return false;
        if (r === "save") return !!(await this._csSave());
        await this._csDiscardAll();
        return true;
      } catch (e) {
        this._status((e && e.message) || String(e), "err");
        return false;
      } finally {
        this._csAsking = false;
      }
    };
    const done = P._done;
    P._done = async function () {
      if (this._csLeaveDirty() && !(await this._csLeaveOk())) return undefined;
      return done.apply(this, arguments);
    };
    const leaveOk = P._leaveStudioOk;
    P._leaveStudioOk = async function () {
      if (this._csLeaveDirty()) return this._csLeaveOk();
      return leaveOk.apply(this, arguments);
    };
    // Switching dashboards (title menu, dashboard list): the switch already set the new address; ask first.
    const load = P._load;
    P._load = async function () {
      const from = this._stateUrl, to = this._dashUrl;
      if (from && to && from !== to && this._state && this._csLeaveDirty() && !this._csSwitching) {
        this._setDash(from);
        this._csSwitching = true;
        let ok = false;
        try { ok = await this._csLeaveOk(); } finally { this._csSwitching = false; }
        if (!ok) { if (typeof this._remember === "function") this._remember(from); return false; }
        this._setDash(to);
        if (typeof this._remember === "function") this._remember(to);
      }
      this._csLoadingDash = true;
      try { return await load.apply(this, arguments); } finally {
        this._csLoadingDash = false;
        this._csDashTouched = false;
      }
    };
    // A change to the dashboard while a page of the new structure is open belongs to the bar.
    const markDirty = P._markDirty;
    P._markDirty = function () {
      const before = this._lastPrint;
      const r = markDirty.apply(this, arguments);
      if (this._csOpen && !this._csLoadingDash && /^n-/.test(String(this._csPage || "")) && this._lastPrint !== before && before !== undefined) this._csDashTouched = true;
      // A field may change without an event the bar listens to (a menu picks on mousedown, a slider writes a beat
      // after the last move): the bar follows every change of the dashboard.
      if (this._csOpen && this._lastPrint !== before && typeof this._csBar === "function") this._csBar();
      return r;
    };
    const resetUndo = P._resetUndo;
    if (typeof resetUndo === "function") {
      P._resetUndo = function () { this._csDashTouched = false; return resetUndo.apply(this, arguments); };
    }

    // Update the save bar and the dot in the sidebar.
    // "Save settings" instead of "Save": "Done" saves the dashboard, this button only
    // the settings for all dashboards (user test: three similar-sounding ways to save).
    P._csBar = function () {
      const dirty = this._csDirty();
      const cs = this._cs || {};
      this.shadowRoot.querySelectorAll(".cs-save").forEach((b) => {
        b.disabled = !dirty || !!cs.busy;
        b.textContent = cs.busy ? t("Saving…") : t("Save settings");
      });
      this.shadowRoot.querySelectorAll(".cs-state").forEach((s) => {
        s.textContent = dirty ? t("Unsaved changes") : t("Applies to all dashboards");
        s.dataset.dash = dashSetDirty(this) ? "1" : "";
      });
      // No bar without changes; while saving it stays until the end.
      this.shadowRoot.querySelectorAll(".cs-bar").forEach((b) => {
        const hide = !dirty && !cs.busy;
        b.classList.toggle("cs-clean", hide);
        if (hide) b.setAttribute("aria-hidden", "true"); else b.removeAttribute("aria-hidden");
      });
      const row = this.shadowRoot.querySelector("#sidesections .cu-sidehead");
      if (row) {
        let dot = row.querySelector(".cs-dot");
        if (dirty && !dot) { dot = el("span", "cs-dot"); dot.title = t("Unsaved changes"); row.appendChild(dot); }
        else if (!dirty && dot) dot.remove();
      }
    };

    // block: the key of a block on a tile page (e.g. "live"): only that block is drawn again. A live refresh every 5 s
    // redrew the whole tile before, including the Studio's own drawing of this dashboard's phone section, for nothing.
    P._csRepaint = function (block) {
      if (block && this._csRepaintBlock(block)) return;
      // Page open (desktop with sidebar or phone in the new Studio, there without split): redraw.
      // Before, only with split – on the phone (393 px) tapping the live devices, the test etc. did nothing visible.
      if (this._csOpen && this.$("pane")) this._csRender();
      else if (this._csSheetPage && this._flowMode) this._csSheet(this._csSheetPage, null, true);
      // Otherwise (phone in the Studio: page as a sheet, no split) nobody redraws – after saving the bar
      // stayed on "Unsaved changes" / "Saving …" (user test 4, E-T3).
      else this._csBar();
    };

    P._csRepaintBlock = function (k) {
      const at = this.shadowRoot.querySelector('[data-pkey="nb-' + k + '"]');
      const page = at && pageOf(this._csOpen ? this._csPage : this._csSheetPage);
      const tile = page && page.tile;
      const b = tile && tile.blocks.find((x) => x.k === k);
      if (!b) return false;
      const tmp = document.createElement("div");
      this._csNeuBlock(tmp, tile, b, () => this._csRender());
      const fresh = tmp.firstElementChild;
      if (!fresh) return false;
      // A block drawn under "Advanced" keeps its place there; the scroll position stays as it is.
      at.replaceWith(fresh);
      this._csBar();
      return true;
    };

    // Every change on the page (also in the entity picker menu) → check the bar.
    const watch = (self) => {
      if (self._csWatch) return;
      self._csWatch = () => { if (self._csOpen || self._csSheetPage !== undefined || self.shadowRoot.querySelector(".tilepane .cs-bar")) setTimeout(() => self._csBar(), 0); };
      ["input", "change", "click", "keyup"].forEach((ev) => self.shadowRoot.addEventListener(ev, self._csWatch, true));
    };

    P._csHaOptions = function () { return this._csHaGo(OPTIONS_PATH); };
    // A page of Home Assistant in place of the Studio (the HA way: pushState + location-changed).
    P._csHaGo = async function (path) {
      const dirty = this._state && this._isDirty && this._isDirty();
      if (dirty && !(await this._save())) return;
      if (this._flowMode) this._exitFlow(false);
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    };

    // ── Remove Hemma (hemma_cleanup.py) ──────────────────────────────────────
    // Only visible while something of Hemma is there: integration, entries or resources.
    // Also leftovers after removal (package helpers, theme, www/hemma), so they can still be cleared later.
    const hemmaSeen = (h) => !!h && (h.installed || (h.entries || []).length > 0 || (h.resources || []).length > 0 || !!h.leftovers);
    // Dashboards that go along: the desktop dashboard and its phone layout.
    const withMobile = (h, urls) => {
      const out = new Set();
      (h.dashboards || []).forEach((d) => { if (urls.has(d.url_path)) { out.add(d.url_path); if (d.mobile) out.add(d.mobile); } });
      return out;
    };
    // www/hemma may go: everything is in www/casora and nothing that stays points to it (like www_deletable).
    const wwwDeletable = (h, urls) => {
      const f = h.files || {};
      // Removal first moves files that were not copied over into www/casora (hemma_cleanup.py).
      if (!f.www_hemma || (f.conflicts || []).length || (f.resource_refs || []).length) return false;
      // Own scripts/hidden files and write targets (automations) keep www/hemma in place.
      if ((f.extra || []).length || (f.write_targets || []).length) return false;
      const gone = withMobile(h, urls);
      return Object.keys(f.refs || {}).every((u) => !f.refs[u] || gone.has(u));
    };
    const item = (parent, tone, title, sub) => {
      const r = el("div", "chr-item " + (tone || ""));
      r.appendChild(el("i"));
      const tx = el("div");
      tx.appendChild(el("b", "", title));
      if (sub) tx.appendChild(el("span", "", sub));
      r.appendChild(tx);
      parent.appendChild(r);
      return r;
    };
    // Keep the "Stays" list short: four examples, "… and N more" expands the rest.
    const ownItem = (parent, files, entities) => {
      const all = [...(files || []), ...(entities || [])];
      if (!all.length) return null;
      const r = item(parent, "info", t("Stays: your own things with “hemma” in the name"), all.slice(0, 4).join("\n"));
      if (all.length > 4) {
        const more = el("button", "chr-more", t("… and {1} more").replace("{1}", all.length - 4));
        more.type = "button";
        more.addEventListener("click", () => {
          r.querySelector("span").textContent = all.join("\n");
          more.remove();
        });
        r.lastChild.appendChild(more);
      }
      return r;
    };
    const checkItem = (parent, on, title, sub, onChange) => {
      const r = el("div", "chr-item");
      const box = document.createElement("input");
      box.type = "checkbox"; box.checked = !!on;
      box.id = "chr-" + Math.random().toString(36).slice(2);
      box.onchange = () => onChange(box.checked);
      const lab = document.createElement("label");
      lab.htmlFor = box.id;
      lab.appendChild(el("b", "", title));
      if (sub) lab.appendChild(el("span", "", sub));
      r.append(box, lab);
      parent.appendChild(r);
      return r;
    };

    P._csHemmaLoad = async function (force) {
      const cs = this._cs = this._cs || {};
      if (!force && cs.hemma !== undefined && Date.now() - (cs.hemmaAt || 0) < 60000) return cs.hemma;
      try { cs.hemma = await this._hass.callWS({ type: "casora/hemma/status" }); } catch (e) { cs.hemma = null; }
      cs.hemmaAt = Date.now();
      return cs.hemma;
    };

    P._csHemmaGroup = function (host) {
      const cs = this._cs;
      if (!cs || !this._hass) return;
      if (cs.hemma === undefined) {
        if (!cs.hemmaLoading) {
          cs.hemmaLoading = true;
          this._csHemmaLoad().then((h) => { cs.hemmaLoading = false; if (hemmaSeen(h)) this._csRepaint(); });
        }
        return;
      }
      const h = cs.hemma;
      if (!hemmaSeen(h)) return;
      const g = this._flowGroup(host, { header: "Hemma",
        footer: t("Casora replaces Hemma. Once your dashboards have moved, Hemma is no longer needed – both running side by side load their scripts twice.") });
      const how = h.hacs ? t("Installed via the Marketplace") : h.installed ? t("Installed in custom_components/hemma") : t("Leftovers from Hemma");
      const b = btn(t("Remove Hemma…"), () => this._casoraHemmaRemove());
      b.classList.add("cs-danger");
      ctlRow(this, g, h.installed ? t("Hemma is still installed") : t("Hemma leftovers are still there"), how, [b]);
      const f = h.files || {};
      const casoraRefs = Object.keys(f.refs || {}).filter((u) => !(h.dashboards || []).some((d) => d.url_path === u || d.mobile === u));
      if (f.www_hemma && (f.to_copy || casoraRefs.length)) {
        const c = btn(t("Carry over"), async () => {
          c.disabled = true;
          try {
            const r = await this._hass.callWS({ type: "casora/hemma/move_files", dashboards: casoraRefs });
            this._status(t("{1} files carried over").replace("{1}", (r.copied || []).length), "ok");
          } catch (e) {
            this._status(t("Carrying over didn't work.") + " " + ((e && e.message) || e), "err");
          }
          await this._csHemmaLoad(true);
          this._csRepaint();
        }, true);
        ctlRow(this, g, t("Photos and icons still in www/hemma"),
          t("Copies them to www/casora and points your Casora dashboards there. Nothing is overwritten."), [c]);
      }
    };

    // Confirm (what exactly is removed) → run → result with "Restart Now".
    P._casoraHemmaRemove = async function () {
      css(this);
      const h = await this._csHemmaLoad(true);
      if (!hemmaSeen(h)) {
        this._status(t("Hemma is not installed."), "ok");
        return;
      }
      const boards = h.dashboards || [];
      const sel = new Set(boards.filter((d) => d.moved_to && d.mode === "storage").map((d) => d.url_path));
      // www/hemma goes along once everything is in www/casora (preselected, part of the backup).
      let delWww = true, wwwWish = true;
      const ok = await this._ask({
        title: t("Remove Hemma?"),
        message: t("Casora saves a backup to casora_sicherungen first. Home Assistant needs a restart afterwards."),
        confirmLabel: t("Remove"), destructive: true, wide: true,
        extend: ({ box, acts }) => {
          const list = el("div", "chr-list chr-mix");
          list.setAttribute("data-no-i18n", "");
          if (h.installed) item(list, "", t("Hemma integration"), [
            h.hacs ? t("Removed through the Marketplace, so the Marketplace doesn't install it again.")
              : h.folder ? t("The folder custom_components/hemma is deleted.") : null,
            (h.entries || []).length === 1 ? t("1 integration entry")
              : (h.entries || []).length ? t("{1} integration entries").replace("{1}", h.entries.length) : null,
          ].filter(Boolean).join("\n") || null);
          const res = h.resources || [];
          if (res.length) {
            item(list, h.resources_writable ? "" : "warn",
              (res.length === 1 ? t("1 dashboard resource") : t("{1} dashboard resources").replace("{1}", res.length)),
              res.join("\n") + (h.resources_writable ? "" : "\n" + t("Set up in YAML – remove these lines from configuration.yaml yourself.")));
          }
          if (boards.length) {
            list.appendChild(el("div", "chr-sub", t("Hemma dashboards")));
            boards.forEach((d) => {
              const sub = [d.moved_to ? t("Moved to Casora") : t("Not moved yet"), d.mobile ? t("with phone layout") : null]
                .filter(Boolean).join(" · ");
              if (d.mode !== "storage") {
                item(list, "info", d.title, sub + "\n" + t("Set up in YAML – stays."));
                return;
              }
              checkItem(list, sel.has(d.url_path), d.title, sub, (on) => {
                if (on) sel.add(d.url_path); else sel.delete(d.url_path);
                paintWww();
              });
            });
          }
          // Hemma's helper package: only what comes from Hemma (origin, not name) – your own stays.
          const pk = (h.package || []).filter((p) => !p.error);
          const helperIds = [...new Set([...pk.flatMap((p) => p.items), ...(h.storage_helpers || [])])];
          if (helperIds.length) {
            const files = pk.map((p) => p.file + " – " + (p.delete ? t("file is deleted") : t("only Hemma's part, your own entries stay")));
            item(list, "", helperIds.length === 1 ? t("1 Hemma helper, script or automation")
              : t("{1} Hemma helpers, scripts and automations").replace("{1}", helperIds.length),
              [...files, helperIds.join(", ")].join("\n") + "\n" + t("Their values move to the Casora helpers first."));
          }
          const bad = (h.package || []).filter((p) => p.error);
          if (bad.length) {
            item(list, "warn", t("Remove Hemma's helpers from these files yourself:"), bad.map((p) => p.file + ": " + p.items.join(", ")).join("\n"));
          }
          if ((h.themes || []).length) {
            item(list, "", t("Hemma theme"), h.themes.join("\n") + "\n" + t("If it was your default, Casora takes over."));
          }
          // Old YAML dashboards/templates (Hemma without HACS) – only if no YAML dashboard loads them.
          const yf = h.yaml_files || [];
          if (yf.length) {
            item(list, "", t("Old Hemma dashboard files ({1})").replace("{1}", yf.length),
              yf.slice(0, 4).join("\n") + (yf.length > 4 ? "\n" + t("… and {1} more").replace("{1}", yf.length - 4) : "")
                + "\n" + t("No dashboard loads them any more. Included in the backup."));
          } else if ((h.yaml_held || []).length) {
            item(list, "info", t("Stays: old Hemma dashboard files"),
              t("A YAML dashboard still loads them:") + "\n" + h.yaml_held.join("\n"));
          }
          const www = el("div");
          list.appendChild(www);
          const paintWww = () => {
            www.replaceChildren();
            if (!(h.files || {}).www_hemma) return;
            if (wwwDeletable(h, sel)) {
              delWww = wwwWish;
              checkItem(www, delWww, t("Delete old files (www/hemma)"),
                (h.files || {}).complete ? t("Everything is in www/casora and no dashboard uses them any more. Included in the backup.")
                  : t("No dashboard uses them any more. Your photos and icons are copied to www/casora first. Included in the backup."), (on) => { delWww = wwwWish = on; });
            } else {
              delWww = false;
              // If only own/hidden files hold the folder, name them instead of "a dashboard uses them".
              const extra = (h.files || {}).extra || [];
              // If only an automation holds it, "Stays: folders an automation writes to" explains that.
              if (!extra.length && ((h.files || {}).write_targets || []).length) return;
              // Same-named files in www/casora differ: name them instead of "a dashboard uses them".
              const conf = (h.files || {}).conflicts || [];
              if (!extra.length && conf.length) {
                item(www, "info", t("Old files in www/hemma stay"),
                  t("These files differ from the ones with the same name in www/casora:") + "\n" + conf.slice(0, 4).join("\n")
                    + (conf.length > 4 ? "\n" + t("… and {1} more").replace("{1}", conf.length - 4) : ""));
                return;
              }
              item(www, "info", t("Old files in www/hemma stay"), extra.length
                ? t("It also holds files that don't come from Hemma:") + "\n" + extra.slice(0, 4).join("\n")
                  + (extra.length > 4 ? "\n" + t("… and {1} more").replace("{1}", extra.length - 4) : "")
                : t("A dashboard still uses them or not all of them are in www/casora yet – Casora keeps reading them from there."));
            }
          };
          paintWww();
          // With "hemma" in the name but not from Hemma: stays – for info only.
          const own = h.own || {};
          const ownN = (own.entities || []).length + (own.files || []).length;
          if (ownN) {
            ownItem(list, own.files, own.entities);
          }
          // Own modules (resources, e.g. /local/hemma-local/…): stay loaded.
          if ((own.resources || []).length) {
            item(list, "info", t("Stays: your own modules (dashboard resources)"),
              own.resources.join("\n") + "\n" + t("They keep loading – Casora's tiles find them under their old names."));
          }
          // Paths an automation uses (camera stills …): stay in www/hemma.
          const wt = (h.files || {}).write_targets || [];
          if (wt.length) {
            item(list, "info", t("Stays: folders an automation writes to"),
              wt.map((x) => x.path + " (" + (x.sources || []).join(", ") + ")").join("\n"));
          }
          box.insertBefore(list, acts);
        },
      });
      if (!ok) return;
      await this._csHemmaRun({ remove_dashboards: [...sel], keep_files: !delWww });
    };

    // Run the removal, show the steps, offer a restart (also for "Remove the Rest").
    // AB-09 (1.3): all result dialogs of "Remove Hemma" built the same – wide, left-aligned,
    // sign on top (✓ done, ! something still open).
    const resultMark = (box, tone) => {
      box.classList.add("chv");
      const m = el("div", "chv-mark " + tone);
      m.innerHTML = STATUS_ICON[tone];
      box.insertBefore(m, box.firstChild);
    };

    P._csHemmaRun = async function (payload) {
      css(this);
      this._status(t("Removing Hemma…"), "ok");
      let r;
      try {
        r = await this._hass.callWS(Object.assign({ type: "casora/hemma/remove" }, payload));
      } catch (e) {
        await this._ask({ title: t("Hemma couldn't be removed"), message: (e && e.message) || String(e), confirmLabel: t("OK") });
        return;
      }
      if (this._cs) { this._cs.hemma = undefined; this._cs.hemmaAt = 0; }
      if (typeof this._flowRelist === "function") this._flowRelist().catch(() => {});
      const restart = await this._ask({
        title: r.ok ? t("Hemma removed") : t("Hemma partly removed"),
        message: r.restart_required ? t("Restart Home Assistant to finish.") : t("Nothing was changed."),
        confirmLabel: r.restart_required ? t("Restart Now") : t("OK"),
        cancelLabel: t("Later"), wide: true,
        extend: ({ box, acts }) => {
          resultMark(box, r.ok ? "ok" : "warn");
          const list = el("div", "chr-list");
          list.setAttribute("data-no-i18n", "");
          (r.steps || []).forEach((s) => stepItem(list, s));
          box.insertBefore(list, acts);
        },
      });
      this._csRepaint();
      if (restart && r.restart_required) {
        // "Restart Now" already was the confirmation – do not ask again.
        try { await this._hass.callService("homeassistant", "restart", {}); } catch (e) {
          // The restart drops the connection (code 3) – that is not an error.
          if (!(e && (e.code === 3 || !e.message))) this._status(t("The restart didn't work."), "err");
        }
      }
    };

    // ── After the restart: is Hemma really gone? (casora/hemma/verify) ───────
    // Once per removal, remembered on the server – only once on each device.
    const LEFT = {
      loaded: ["Hemma integration is still loaded", "Home Assistant still runs it."],
      entries: ["Hemma integration entry still set up", null],
      hacs: ["Hemma is still installed in the Marketplace", null],
      folder: ["Folder custom_components/hemma is still there", null],
      resources: ["Hemma dashboard resources", null],
      dashboards: ["Hemma dashboards", null],
      helpers: ["Hemma helpers, scripts and automations", null],
      helpers_manual: ["Remove Hemma's helpers from these files yourself:", null],
      themes: ["Hemma theme", null],
      yaml: ["Old Hemma dashboard files", null],
      files: ["Old files in www/hemma", null],
    };
    const STATUS_ICON = {
      ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6 7.4-8.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="currentColor"/></svg>',
    };

    P._csHemmaVerifyShow = async function (r) {
      css(this);
      const mark = resultMark;
      if (r.ok) {
        await this._ask({
          title: t("Hemma is completely removed"),
          message: t("Everything now runs on Casora.") + (r.backup ? "\n" + t("The backup is in:") : ""),
          confirmLabel: t("Done"), wide: true,
          extend: ({ box, acts, cancel }) => {
            mark(box, "ok");
            cancel.remove();
            // Sentence and path each on its own line; the path only breaks after a "/",
            // never inside the date (parts as inline-block, overlong ones still break).
            if (r.backup) {
              const path = el("p", "chv-path");
              String(r.backup).split("/").forEach((part, i, all) => {
                if (i) path.append("\u200b");
                path.append(el("span", "", part + (i < all.length - 1 ? "/" : "")));
              });
              path.setAttribute("data-no-i18n", "");
              box.insertBefore(path, acts);
            }
          },
        });
        return;
      }
      const again = await this._ask({
        title: t("Hemma is almost removed"),
        message: t("A few things are still there:"),
        confirmLabel: t("Remove the Rest"), cancelLabel: t("Later"),
        wide: true,
        extend: ({ box, acts }) => {
          mark(box, "warn");
          const list = el("div", "chr-list");
          list.setAttribute("data-no-i18n", "");
          (r.leftovers || []).forEach((x) => {
            const [title, sub] = LEFT[x.kind] || [x.kind, null];
            const items = (x.items || []).slice(0, 12);
            if ((x.items || []).length > 12) items.push(t("… and {1} more").replace("{1}", x.items.length - 12));
            item(list, "warn", t(title), [sub && t(sub), items.join("\n") || null].filter(Boolean).join("\n") || null);
          });
          box.insertBefore(list, acts);
        },
      });
      if (again) await this._csHemmaRun({ remove_dashboards: r.remove_dashboards || [], keep_files: r.keep_files !== false });
    };

    P._csHemmaVerify = async function () {
      if (this._csVerified || !this._hass || !(this._hass.user || {}).is_admin) return;
      this._csVerified = true;
      let r;
      try { r = await this._hass.callWS({ type: "casora/hemma/verify" }); } catch (e) { return; }
      if (!r || !r.due) return;
      // Only when no other window is open ("New in Casora", welcome, a question).
      const t0 = Date.now();
      const busy = () => document.querySelector("[data-casora-welcome]")
        || (this.shadowRoot && this.shadowRoot.querySelector(".askpane"));
      while (busy() && Date.now() - t0 < 120000) await new Promise((ok) => setTimeout(ok, 400));
      if (!this.isConnected) return;
      if (this._cs) { this._cs.hemma = undefined; this._cs.hemmaAt = 0; }
      await this._csHemmaVerifyShow(r);
    };

    // Check once on the first load of the dashboard list (Studio opened).
    const refreshDashboards = P._refreshDashboards;
    P._refreshDashboards = async function (...a) {
      const out = await refreshDashboards.apply(this, a);
      if (!this._csVerified) setTimeout(() => this._csHemmaVerify(), 900);
      return out;
    };

    const stepItem = (list, s) => {
      const tone = s.ok ? "ok" : "";
      const err = s.error && s.error !== "yaml" && s.error !== "still_needed" ? String(s.error) : "";
      const n = (x) => (x || []).length;
      // On a second pass (leftovers only): do not list empty steps as "0 … removed".
      if (s.ok && ["resources", "entries", "dashboards", "helpers"].includes(s.step) && !n(s.removed) && !n(s.manual)) return null;
      if (s.ok && s.step === "integration" && s.via === "none") return null;
      switch (s.step) {
        case "backup":
          return item(list, tone, s.ok ? t("Backup saved") : t("Backup failed – nothing was removed"),
            s.ok ? pathText(String(s.path || "").split("/").slice(-2).join("/")) : err);
        case "resources":
          if (s.error === "yaml") {
            return item(list, "warn", t("Resources are set up in YAML"),
              t("Remove these lines from configuration.yaml:") + "\n" + (s.manual || []).join("\n"));
          }
          return item(list, tone, n(s.removed) === 1 ? t("1 resource removed") : t("{1} resources removed").replace("{1}", n(s.removed)), err || null);
        case "entries":
          return item(list, tone, s.ok ? t("Integration entry removed") : t("Integration entry not removed"), err || null);
        case "integration":
          if (!s.ok) return item(list, "", t("Hemma not uninstalled"), err + (s.via === "hacs" ? "\n" + t("Remove it in the Marketplace yourself.") : ""));
          return item(list, "ok", s.via === "hacs" ? t("Removed through the Marketplace") : s.via === "folder"
            ? t("Folder custom_components/hemma deleted") : t("No Hemma folder found"));
        case "dashboards":
          if (n(s.manual)) {
            item(list, "warn", t("Set up in YAML – remove from configuration.yaml yourself:"), s.manual.join("\n"));
          }
          return item(list, err ? "" : "ok", n(s.removed) === 1 ? t("1 dashboard removed") : t("{1} dashboards removed").replace("{1}", n(s.removed)), err || null);
        case "helpers":
          if (n(s.manual)) item(list, "warn", t("Remove Hemma's helpers from these files yourself:"), s.manual.join("\n"));
          return item(list, err ? "" : "ok", n(s.removed) === 1 ? t("1 Hemma helper removed")
            : t("{1} Hemma helpers, scripts and automations removed").replace("{1}", n(s.removed)),
            [...(s.deleted_files || []).map((f) => f + " – " + t("deleted")),
              ...(s.files || []).filter((f) => !(s.deleted_files || []).includes(f)).map((f) => f + " – " + t("your own entries stay")),
              n(s.carried) ? t("Values carried over: {1}").replace("{1}", s.carried.join(", ")) : null, err || null].filter(Boolean).join("\n") || null);
        case "theme":
          return item(list, tone, s.ok ? t("Hemma theme removed") : t("Hemma theme not removed"), err || (s.removed || []).join("\n"));
        case "yaml":
          return item(list, tone, s.ok ? t("Old Hemma dashboard files removed") : t("Old Hemma dashboard files not removed"),
            err || t("{1} files").replace("{1}", (s.removed || []).length));
        case "own": {
          const r = ownItem(list, s.files, s.entities);
          if (n(s.resources)) {
            const moved = (s.moved || []).map((m) => m.url + " → " + m.to);
            return item(list, "info", t("Stays: your own modules (dashboard resources)"),
              (moved.length ? moved.concat(s.resources.filter((u) => !(s.moved || []).some((m) => m.url === u))) : s.resources).join("\n"));
          }
          return r;
        }
        case "files":
          if (s.error === "still_needed") return item(list, "warn", t("Old files in www/hemma stay"), t("A dashboard still uses them."));
          return item(list, tone, s.kept ? t("Old files in www/hemma kept") : t("Old files in www/hemma deleted"), err || null);
        default:
          return item(list, tone, s.step, err || null);
      }
    };

    // ── Page (desktop) ───────────────────────────────────────────────────────
    P._csRender = function () {
      const pane = this.$("pane");
      if (!pane || !this._csOpen) return;
      css(this);
      watch(this);
      const page = pageOf(this._csPage);
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        [...head.children].forEach((c) => { if (!c.classList.contains("cs-head")) c.style.display = "none"; });
        let h = head.querySelector(".cs-head");
        if (!h) {
          h = el("div", "navrow cs-head");
          h.innerHTML = '<div class="detailbar rootlevel"><h3></h3></div>';
          head.appendChild(h);
        }
        h.querySelector("h3").textContent = t(page.label);
      }
      const keep = pane.firstChild && pane.firstChild.classList && pane.firstChild.classList.contains("cs-wrap")
        && pane.firstChild.dataset.page === page.id ? pane.scrollTop : 0;
      const wrap = el("div", "cs-wrap");
      wrap.dataset.page = page.id;
      const body = el("div");
      wrap.appendChild(body);
      // Design applies right away (own path, casora-panel-addons.js) – without the "Save settings" bar.
      const bar = el("div", "cs-bar" + (this._csDirty() ? "" : " cs-clean"));
      // Design and the topic pages: nothing to save here (unsaved drafts keep their bar on their own page).
      if (page.start && !this._csDirty()) bar.style.display = "none";
      const state = el("span", "cs-state");
      const save = btn(t("Save settings"), () => this._csSave());
      save.className = "cs-save";
      bar.append(state, save);
      wrap.appendChild(bar);
      pane.replaceChildren(wrap);
      this._csFill(body, page.id, () => this._csRender());
      // Drawing a dashboard section (new structure) ran the Studio's after-render steps for the home room: run them
      // again for the real room and selection, and keep the inspector's own head hidden.
      if (this._csHarvested) {
        this._csHarvested = false;
        if (typeof this._bApply === "function") this._bApply();
        if (typeof this._bRoomsPaint === "function") this._bRoomsPaint();
      }
      if (head) [...head.children].forEach((c) => { if (!c.classList.contains("cs-head")) c.style.display = "none"; });
      pane.scrollTop = keep;
      this._csRefocus(pane, page.id);
      this._csBar();
    };

    // A page opened at a group (search hit, link) scrolls there smoothly. A redraw shortly after (a late
    // answer such as the dashboards' players) replaces the content and cancels that scroll, so for a
    // moment after opening every redraw of the same page jumps to the group again (instantly).
    P._csFocusAt = function (pageId, key) {
      this._csFocusWant = key ? { page: pageId, key, until: Date.now() + 2500 } : null;
    };
    P._csRefocus = function (root, pageId) {
      const f = this._csFocusWant;
      if (!f) return;
      if (f.page !== pageId || Date.now() > f.until) { this._csFocusWant = null; return; }
      const at = root && root.querySelector('[data-pkey="' + f.key + '"]');
      if (at) at.scrollIntoView({ block: "start" });
    };

    P._csOpenPage = async function (pageId, focus) {
      [pageId, focus] = this._csRoute(pageId, focus);
      this._csFocusWant = null;
      if (this._cvOpen && this._cvClose) {
        this._cvLeaving = true;
        try { this._cvClose(); } finally { this._cvLeaving = false; }
      }
      if (this._cuOpen && this._cuClose) {
        this._cuLeaving = true;
        try { this._cuClose(); } finally { this._cuLeaving = false; }
      }
      if (this._flowMode) this._exitFlow(false);
      // Opened from the topics: back as set there; from a dashboard section (link): back to it; otherwise none.
      if (this._hubNav) this._hubNav = false;
      else if (!/^(start|t-|n-)/.test(String(pageId || ""))) {
        const sel = this._sel;
        this._hubBackTo = sel && sel.group === "rooms" && !this._csOpen ? "sec:" + sel.key : null;
      }
      if (pageId === "n-start" && !this._csOpen) this._nQ = "";
      this._csOpen = true;
      this.classList.add("contentpage");
      this._csPage = pageOf(pageId).id;
      this._csSheetPage = undefined;
      this._csRender();
      this._csSideRow();
      const want = this._csPage;
      // Reloaded: redraw, the fields hang on the draft.
      if ((await this._csLoad()) && this._csOpen && this._csPage === want) this._csRender();
      if (!this._csOpen) return;
      this._csFocusAt(want, focus);
      if (focus) {
        const at = this.$("pane").querySelector('[data-pkey="' + focus + '"]');
        if (at) requestAnimationFrame(() => {
          at.scrollIntoView({ block: "start", behavior: "smooth" });
          at.classList.add("casora-pfocus");
          setTimeout(() => at.classList.remove("casora-pfocus"), 1600);
        });
      }
    };

    P._csClose = function () {
      if (!this._csOpen) return;
      this._csOpen = false;
      if (!this._hubNav) this._hubBackTo = null;
      if (!this._cuOpen) this.classList.remove("contentpage");
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        const h = head.querySelector(".cs-head");
        if (h) h.remove();
        [...head.children].forEach((c) => { c.style.display = ""; });
      }
      const dirty = this._csDirty();
      this._csSideRow();
      if (dirty) this._status(t("Settings not saved yet – they wait under Settings"), "");
    };

    // From anywhere (hints in the Studio pages, updates, menu): desktop page or sheet.
    // Earlier page ids land on their tile and block (route); a block under "Advanced" opens it.
    P._csRoute = function (pageId, focus) {
      const r = route(pageId, focus);
      const tile = NEU.find((x) => "n-" + x.id === r[0]);
      const blk = tile && r[1] && tile.blocks.find((b) => "nb-" + b.k === r[1]);
      if (blk && blk.adv) (this._nAdv = this._nAdv || new Set()).add(tile.id);
      if (blk && tile.fold) (this._nOpen = this._nOpen || new Set()).add(blk.k);
      return r;
    };
    P._csShow = function (pageId, focus) {
      if (this._csDesk()) return this._csOpenPage(pageId || "n-start", focus);
      return this._csSheet(pageId || null, focus);
    };

    // Opening versions and updates closes the settings.
    ["_cvOpenPage", "_cuOpenPage"].forEach((name) => {
      const orig = P[name];
      if (typeof orig !== "function") return;
      P[name] = function () {
        if (this._csOpen) {
          this._csLeaving = true;
          try { this._csClose(); } finally { this._csLeaving = false; }
        }
        return orig.apply(this, arguments);
      };
    });

    const renderForm = P._renderForm;
    P._renderForm = function () {
      // Drawing one section for a settings page (_csDashCard): only the Studio's own drawing.
      if (this._csHarvesting) return renderForm.apply(this, arguments);
      // A page of the new structure shows dashboard sections itself: redraw it instead of the inspector (the
      // inspector would replace the page and lose its scroll position).
      if (this._csOpen && !this._csLeaving && /^n-/.test(String(this._csPage || ""))) {
        this._csRender();
        return undefined;
      }
      const r = renderForm.apply(this, arguments);
      if (this._csOpen && !this._csLeaving) this._csRender();
      return r;
    };
    // Choosing anything else (a tile, a badge, another section) leaves the way back to the topics.
    const select = P._select;
    P._select = function (pick) {
      if (!this._hubNav && pick && !(pick.group === "rooms" && this._hubBackTo && String(this._hubBackTo).indexOf("sec:") === 0)) this._hubBackTo = null;
      return select.apply(this, arguments);
    };
    const bClose = P._bClose;
    if (typeof bClose === "function") {
      P._bClose = function () { this._hubBackTo = null; this._nQ = ""; return bClose.apply(this, arguments); };
    }

    // ── Sidebar: heading "Settings – for all dashboards", the subpages below ──────────────────────
    P._csSideRow = function () {
      const host = this.shadowRoot.getElementById("sidesections");
      if (!host || !host.children.length || !this._dashUrl) return;
      css(this);
      const upd = host.querySelector(".cu-side");
      let head = host.querySelector(".cu-sidehead");
      if (!head) {
        head = el("h2", "sidehead cu-sidehead", t("Settings"));
        head.setAttribute("data-no-i18n", "");
        host.appendChild(head);
      }
      if (!head.querySelector("small")) head.appendChild(el("small", "", t("for all dashboards")));
      let rows = [...host.querySelectorAll(".cs-row")];
      if (!rows.length) {
        rows = [];
        NEU.forEach((tile) => {
          const id = "n-" + tile.id;
          const b = el("button", "siderow cs-row cs-sub");
          b.type = "button";
          b.dataset.page = id;
          b.setAttribute("data-no-i18n", "");
          const si = el("span", "sicon");
          si.style.setProperty("--i", "url('" + icon(tile.icon) + "')");
          si.style.setProperty("--sc", tint(tile));
          b.append(si, el("span", "sidelabel", t(tile.label)));
          b.onclick = () => { if (!(this._csOpen && this._csPage === id)) this._csOpenPage(id); };
          rows.push(b);
        });
      }
      // Under the "Casora" heading, before the updates.
      const at = upd || null;
      rows.forEach((r) => host.insertBefore(r, at));
      if (head.nextSibling !== rows[0]) host.insertBefore(head, rows[0]);
      if (this._csOpen) {
        host.querySelectorAll(".siderow").forEach((row) => {
          const mine = row.classList.contains("cs-sub") && row.dataset.page === this._csPage;
          row.classList.toggle("on", mine);
          if (mine) row.setAttribute("aria-current", "page"); else row.removeAttribute("aria-current");
        });
        const on = host.querySelector(".cs-sub.on");
        if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
      } else {
        rows.forEach((r) => { r.classList.remove("on"); r.removeAttribute("aria-current"); });
      }
      this._csBar();
    };

    if (typeof P._cuSideRow === "function") {
      const cuSide = P._cuSideRow;
      P._cuSideRow = function () {
        const r = cuSide.apply(this, arguments);
        this._csSideRow();
        return r;
      };
    }

    const renderSidebar = P._renderSidebar;
    P._renderSidebar = function () {
      const r = renderSidebar.apply(this, arguments);
      const host = this.shadowRoot.getElementById("sidesections");
      if (host) {
        host.querySelectorAll(".siderow").forEach((row) => {
          if (row.classList.contains("cs-row")) return;
          row.dataset.csOn = row.classList.contains("on") ? "1" : "";
          // Another page leaves the settings – even the one already active.
          const pick = row.onclick;
          row.onclick = (ev) => {
            if (this._csOpen) {
              this._csLeaving = true;
              try {
                this._csClose();
                if (row.dataset.csOn === "1" && !row.classList.contains("cu-side") && !row.classList.contains("cv-side")) {
                  this._renderForm();
                } else if (pick) pick.call(row, ev);
              } finally { this._csLeaving = false; }
              return;
            }
            if (pick) pick.call(row, ev);
          };
        });
      }
      // Everything else in the sidebar (rooms, popups, dashboard choice) leaves the
      // settings as well – before its own click, otherwise the
      // settings page draws itself right back over the chosen room.
      // The room list (#rooms) sits next to #sidelist, so listen on the whole Studio.
      const root = this.shadowRoot;
      if (root && !root.__csLeave) {
        root.__csLeave = true;
        // The room list selects on release already (pointerup, because of drag to sort) –
        // a click never arrives there.
        // Applies to all content pages: Settings, Updates, Rewind.
        const leave = (ev) => {
          if (!this._csOpen && !this._cuOpen && !this._cvOpen) return;
          const row = ev.target && ev.target.closest && ev.target.closest("button, [role=button], a");
          if (!row || !row.closest(".sidelist, #sidelist, #rooms") || row.closest("#sidesections")) return;
          if (this._csOpen) {
            this._csLeaving = true;
            try { this._csClose(); } finally { this._csLeaving = false; }
          }
          if (this._cuOpen && this._cuClose) {
            this._cuLeaving = true;
            try { this._cuClose(); } finally { this._cuLeaving = false; }
          }
          if (this._cvOpen && this._cvClose) {
            this._cvLeaving = true;
            try { this._cvClose(); } finally { this._cvLeaving = false; }
          }
        };
        root.addEventListener("pointerup", leave, true);
        root.addEventListener("click", leave, true);
      }
      this._csSideRow();
      return r;
    };

    // ── Phone: sheet with subpages, reachable in the section list ─────────────
    P._csSheet = async function (pageId, focus, quiet) {
      if (pageId && pageId !== "start-list") [pageId, focus] = this._csRoute(pageId, focus);
      this._csFocusWant = null;
      css(this);
      watch(this);
      // New Studio: the topics; the previous layout (tests only) keeps its list.
      if (!pageId) pageId = this.classList.contains("bmode") ? "n-start" : "start-list";
      if (pageId === "start-list") {
        this._csSheetPage = null;
        const s = this._flowScreen({ icon: "home", title: t("Settings"), quiet,
          lede: t("For all dashboards: your home, the bell, new dashboards and Casora's options.") });
        const tok = this._flowTok;
        const list = this._flowGroup(s.body);
        NEU.forEach((tile) => this._flowRow(list, { mask: icon(tile.icon), tint: tint(tile), title: t(tile.label), sub: t(tile.sub),
          chevron: true, onTap: () => { this._flowDir = 1; this._csSheet("n-" + tile.id); } }));
        // Even with an unsaved draft (e.g. settings still from the file) the
        // full-screen page needs a way back: "Cancel" (_flowBack). The draft stays.
        this._flowCancel(s.acts);
        if (this._csDirty()) {
          const save = this._flowButton(s.acts, t("Save settings"), () => this._csSave().then(() => this._csSheet(null, null, true)));
          save.classList.add("cs-save");
        }
        // Only redraw if the page is still open: someone who already tapped "Cancel"
        // would otherwise get the settings laid over again after loading – with a slow
        // HA there was no way out.
        if ((await this._csLoad()) && this._csSheetPage === null && this._flowMode && this._flowTok === tok) {
          this._csSheet(null, null, true);
        }
        return;
      }
      const page = pageOf(pageId);
      this._csSheetPage = page.id;
      // Back: a topic's page → that topic, a topic → the topics; the topics themselves close (Cancel).
      const legacy = !this.classList.contains("bmode");
      const backTo = page.id === "n-start" ? null : legacy ? "start-list" : this._hubBackTo || "n-start";
      const s = this._flowScreen({ title: t(page.label), quiet,
        back: backTo ? () => { this._flowDir = -1; this._csSheet(backTo); } : undefined });
      if (page.id === "n-start") this._flowCancel(s.acts);
      // The intro already sits below the sheet's title.
      const host = el("div");
      s.body.appendChild(host);
      const fill = () => {
        this._csFill(host, page.id, fill);
        const l = host.querySelector(".cs-lede");
        if (l) l.remove();
        if (this._csSheetPage === page.id) this._csRefocus(host, page.id);
      };
      if (s.lede) s.lede.textContent = t(page.lede);
      else {
        const lede = el("p", "flede", t(page.lede));
        s.box.insertBefore(lede, s.box.querySelector(".flowerr"));
      }
      fill();
      // The start only leads on: no "Save settings" there.
      if (page.start) { this._csBar(); return; }
      const save = this._flowButton(s.acts, t("Save settings"), () => this._csSave());
      save.classList.add("cs-save");
      this._csBar();
      if ((await this._csLoad()) && this._csSheetPage === page.id && host.isConnected) { fill(); this._csBar(); }
      this._csFocusAt(page.id, focus);
      if (focus) {
        const at = host.querySelector('[data-pkey="' + focus + '"]');
        if (at) requestAnimationFrame(() => at.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
    };

    // Sheet closed: stop observing.
    const exitFlow = P._exitFlow;
    P._exitFlow = function () {
      this._csSheetPage = undefined;
      return exitFlow.apply(this, arguments);
    };

    // Section list on the phone like the sidebar on desktop: heading "Settings –
    // for all dashboards", below it the subpages one by one, the updates last.
    const phoneList = P._phoneSectionList;
    if (typeof phoneList === "function") {
      P._phoneSectionList = function (bandFor) {
        const r = phoneList.apply(this, arguments);
        const slot = bandFor && bandFor.rooms && bandFor.rooms.colA;
        const cols = slot && slot.parentElement;
        if (!cols || !cols.classList.contains("phonelist") || cols.querySelector(".cs-phone")) return r;
        css(this);
        // New Studio (variant B): this dashboard's sections and the pages for all dashboards are one entry,
        // "Settings" (by topic); under "Dashboard" only Rewind stays.
        if (this.classList.contains("bmode")) {
          const SECS = I().SECTIONS || [];
          const isDash = (k) => SECS.some((x) => x.group === "rooms" && x.label === k && x.scope === "dashboard");
          // Hidden, not removed: a section opened from the topics is looked up here (_renderForm), and shows.
          const open = this._sel && this._sel.group === "rooms" ? this._sel.key : null;
          cols.querySelectorAll("section.card[data-k]").forEach((c) => {
            if (isDash(c.dataset.k) && c.dataset.k !== open) c.style.display = "none";
          });
          // A "Dashboard" heading over nothing (no Rewind here): away with its column.
          cols.querySelectorAll(":scope > .col.phonepanel:not(.cs-phone)").forEach((c) => {
            if ([...c.children].some((x) => x.style.display !== "none")) return;
            const h = c.previousElementSibling;
            if (h && h.classList.contains("phonehead")) h.remove();
            c.remove();
          });
          const col = el("div", "col phonepanel cs-phone");
          col.style.marginTop = "18px";
          const c = el("section", "card grouprow shut cs-pagerow");
          c.dataset.page = "n-start";
          const ch = el("div", "chead");
          const gi = el("span", "sicon");
          gi.style.setProperty("--i", "url('" + icon("settings") + "')");
          gi.style.setProperty("--sc", tint({ tone: "set-dashboards" }));
          const fold = el("span", "fold");
          fold.setAttribute("aria-hidden", "true");
          fold.setAttribute("aria-expanded", "false");
          fold.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" '
            + 'stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
          ch.append(gi, el("h2", "", t("Settings")), fold);
          ch.onclick = () => this._csShow("n-start");
          c.appendChild(ch);
          col.appendChild(c);
          col.setAttribute("data-no-i18n", "");
          cols.appendChild(col);
          return r;
        }
        const h = el("h2", "sidehead phonehead cu-sidehead", t("Settings"));
        h.setAttribute("data-no-i18n", "");
        h.appendChild(el("small", "", t("for all dashboards")));
        const col = el("div", "col phonepanel cs-phone");
        const card = (label, mask, color, onTap) => {
          const c = el("section", "card grouprow shut");
          const ch = el("div", "chead");
          const gi = el("span", "sicon");
          gi.style.setProperty("--i", "url('" + mask + "')");
          gi.style.setProperty("--sc", color);
          const h2 = el("h2", "", label);
          const fold = el("span", "fold");
          fold.setAttribute("aria-hidden", "true");
          fold.setAttribute("aria-expanded", "false");
          fold.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" '
            + 'stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
          ch.append(gi, h2, fold);
          ch.onclick = onTap;
          c.appendChild(ch);
          return c;
        };
        NEU.forEach((tile) => {
          const c = card(t(tile.label), icon(tile.icon), tint(tile), () => this._csSheet("n-" + tile.id));
          c.classList.add("cs-pagerow");
          c.dataset.page = "n-" + tile.id;
          col.appendChild(c);
        });
        if (typeof this._cuFromMenu === "function") {
          // The same icon as the "Updates" row in the desktop sidebar (casora-panel-updates.js).
          const upd = "data:image/svg+xml," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.1" '
            + 'stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/>'
            + '<path d="M20 4.5V9h-4.5"/><path d="M12 8v7M9 12.5l3 3 3-3"/></svg>');
          col.appendChild(card(t("Updates"), upd, tint({ tone: "updates" }), () => this._cuSheet()));
        }
        col.setAttribute("data-no-i18n", "");
        cols.append(h, col);
        return r;
      };
    }
  });
})();
