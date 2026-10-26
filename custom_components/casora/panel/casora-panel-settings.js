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

  // Subpages: personal = sections from casora-panel-personal.js, otherwise options.
  const PAGES = [
    // Design (theme): applies to all dashboards right away, without "Save settings" (casora-panel-addons.js).
    { id: "design", label: "Design", icon: "desktop", tone: "set-design", look: true,
      lede: "How every Casora dashboard looks – the change applies right away." },
    { id: "home", label: "Home & Devices", icon: "home", tone: "set-home",
      personal: ["waste", "contacts", "scenes", "media", "devices"],
      lede: "Waste collection, doors and windows, scenes and players – the same in every dashboard." },
    // Own page since issue #31: under Home & Devices the calendars were hard to find.
    { id: "calendar", label: "Calendar", icon: "calendar", tone: "set-calendar", personal: ["calendars"],
      lede: "The calendars every calendar tile and its popup show – with name, color and whether they appear on the tile." },
    { id: "alerts", label: "Bell & Alerts", icon: "bell", tone: "set-alerts",
      personal: ["notify"], lede: "What the bell shows in every dashboard." },
    { id: "dashboards", label: "New Dashboards", icon: "tile", tone: "set-dashboards",
      personal: ["basis", "umzug"], lede: "How Casora fills a new dashboard and whether it looks for Hemma dashboards." },
    { id: "ai", label: "AI", icon: "assist", tone: "set-ai",
      lede: "Coaches, camera and plant checks, update analysis and the recipe of the week." },
    { id: "outdoor", label: "Outdoor & Price", icon: "temp-medium", tone: "set-outdoor",
      lede: "Outdoor values and the electricity price for ventilation, heating and energy tips." },
    { id: "vent", label: "Ventilation", icon: "fan", tone: "set-vent",
      lede: "Push notifications when it is time to open or close the windows." },
    // Live activities (live_activity.py): own store casora/live/*, page in casora-panel-live.js.
    { id: "live", label: "Live Activities", icon: "iphone", tone: "set-live", live: true,
      lede: "Washing machine, dryer, dishwasher, robot vacuum and 3D printer live on the phone's lock screen – progress, time left, done." },
    // Fuel prices (1.2, tanken.py): own store casora/tanken/* – the key never goes to the browser.
    { id: "fuel", label: "Fuel prices", icon: "car", tone: "set-fuel", tanken: true,
      lede: "Gas stations nearby in the car popup: price, distance, open or closed." },
  ];
  // Settings by topic (variant B, 26.10.2026): one place for every setting. A topic lists the pages above ("page",
  // all dashboards) and the dashboard's own sections ("sec", only this dashboard) that belong to it.
  const HUB = [
    { id: "look", label: "Look & feel", icon: "desktop", tone: "set-design", sub: "Design and time",
      items: [{ page: "design", kw: "theme thema farben farbe hintergrund aussehen dunkel hell look colors" },
        { sec: "Time", label: "Time", icon: "clock", sub: "Shown at the top left", kw: "uhr uhrzeit datum clock" }] },
    { id: "msg", label: "Messages", icon: "bell", tone: "set-alerts", sub: "Bell, notifications, push and Live\u2011Activities",
      items: [{ sec: "Notifications", label: "Bell on this dashboard", icon: "bell", sub: "Which messages it shows here",
          kw: "glocke bell benachrichtigungen notifications meldungen sicherheit personen sauger pflanzen akku updates pulse" },
        { page: "alerts", label: "Bell: wording & exceptions", icon: "settings", sub: "Zone wording, mailbox, exceptions, limits",
          kw: "glocke bell meldungen ausnahmen nicht melden briefkasten post akku batterie push grenzwerte co2" },
        { page: "vent", kw: "push lüften lueften lüftung fenster" }, { page: "live", kw: "push sperrbildschirm iphone waschmaschine trockner" }] },
    { id: "house", label: "Home & Devices", icon: "home", tone: "set-home", sub: "Waste, doors and windows, scenes, players and calendars",
      items: [{ page: "home", label: "Waste, doors & windows, players", sub: "And hidden scenes – the same in every dashboard",
          kw: "abfall müll muell tonne türen tueren fenster kontakte player medien geräte" },
        { page: "calendar", kw: "kalender termine" },
        { sec: "Scenes", label: "Scenes on this dashboard", icon: "scenes", sub: "Order and colors", kw: "szenen szene stimmung" }] },
    { id: "wx", label: "Weather & climate", icon: "temp-medium", tone: "set-outdoor", sub: "Weather, outdoor values and electricity price",
      items: [{ sec: "Weather", label: "Weather", icon: "weather", sub: "Source and values in the chart", kw: "wetter quelle vorhersage" },
        { page: "outdoor", kw: "außen aussen temperatur strom strompreis tibber" }] },
    { id: "ctl", label: "Controls", icon: "settings", tone: "set-dashboards", sub: "Hold, font, tile size and new dashboards",
      items: [{ sec: "General", label: "Controls on this dashboard", icon: "settings", sub: "Hold, font, tile size", kw: "halten schrift kachelgröße kiosk handy" },
        { page: "dashboards", kw: "neue dashboards hemma vorlagen" }] },
    { id: "ext", label: "Extras", icon: "assist", tone: "set-ai", sub: "AI and fuel prices",
      items: [{ page: "ai", kw: "ki ai assist coach" }, { page: "fuel", kw: "tanken benzin diesel" }] },
  ];
  // Only found by the search: a group inside a page, opened scrolled to it.
  const HUB_FIND = [
    { page: "home", focus: "contacts", label: "Doors and windows", topic: "house", kw: "türen tueren fenster kontakte ausblenden umbenennen" },
    { page: "home", focus: "waste", label: "Waste collection", topic: "house", kw: "abfall müll muell tonne abholung" },
    { page: "home", focus: "scenes", label: "Hidden scenes", topic: "house", kw: "szenen ausblenden verstecken" },
    { page: "home", focus: "media", label: "Now Playing", topic: "house", kw: "player medien musik wiedergabe" },
    { page: "alerts", focus: "notify", label: "Bell: wording & exceptions", topic: "msg", kw: "zonen briefkasten akku ausnahme nicht melden" },
  ];
  const HUB_START = { id: "start", label: "Settings", hub: true, lede: "Settings by topic. What only this dashboard affects is marked." };
  const hubPage = (id) => {
    if (id === "start") return HUB_START;
    const h = HUB.find((x) => "t-" + x.id === id);
    return h ? { id: "t-" + h.id, label: h.label, hub: true, topic: h, lede: h.sub } : null;
  };
  const pageOf = (id) => hubPage(id) || PAGES.find((p) => p.id === id) || PAGES[0];

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
    + ".cs-hublist .rtext b,.cs-hublist .rtext span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}"
    + ".cs-hubback{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:0 6px 10px;font-size:var(--t-callout);font-weight:600;color:var(--accent)}"
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
    + ".cs-lede{margin:0 10px 14px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cs-note{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:var(--casora-studio-link-tint, rgba(10,132,255,.16));font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:rgba(255,69,58,.16);color:var(--ink);font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err:empty{display:none}"
    // Save bar: floating, rounded bar at content width (like a menu/toast:
    // opaque surface, soft shadow), spaced from the bottom edge. Without changes it is
    // hidden; it keeps its space at the end of the page so the content never stays covered.
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
    const liveDirty = (self) => typeof self._csLiveDirty === "function" && self._csLiveDirty();
    P._csDirty = function () {
      const cs = this._cs;
      return !!cs && (settingsDirty(cs) || optionsDirty(cs) || tankenDirty(cs) || liveDirty(this));
    };
    const takeTanken = (cs, r) => {
      cs.tk = r;
      const cars = {};
      (r.cars || []).forEach((c) => { cars[c.device_id] = c.fuel; });
      cs.F = { radius: r.radius, cars };
      cs.F0 = JSON.stringify(cs.F);
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
      const hass = this._hass;
      let stored = false, data = {};
      cs.readErr = null;
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
      try {
        takeTanken(cs, await hass.callWS({ type: "casora/tanken/get" }));
        cs.tkErr = null;
      } catch (e) {
        cs.tk = null;
        cs.tkErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
      if (typeof this._csLiveLoad === "function") await this._csLiveLoad(cs);
      cs.loaded = true;
      cs.at = Date.now();
      return true;
    };

    P._csSave = async function () {
      const cs = this._cs;
      if (!cs || cs.busy || !this._csDirty()) return;
      const price = cs.O && cs.O.price_kwh;
      if (price !== undefined && (typeof price !== "number" || isNaN(price) || price < 0 || price > 2)) {
        cs.err = t("The electricity price must be between 0 and 2 €/kWh.");
        this._csRepaint();
        return;
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
        if (liveDirty(this)) {
          await this._csLiveSave();
          done.push(t("Saved – live activities follow the devices from now on"));
        }
      } catch (e) {
        cs.err = (e && e.message) || String(e);
      }
      cs.busy = false;
      this._csRepaint();
      if (done.length && !cs.err) this._status(done[done.length - 1], "ok");
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
    // Every AI task with its model. Casora reads the model from the AI task's device in HA;
    // where that names none, the user types it (option ai_task_models: {entity_id: model}).
    // Only for judging strength – the AI task keeps answering with its own model.
    const aiModelGroup = (self, cs, host) => {
      const g = self._flowGroup(host, { header: t("AI models"),
        footer: t("Demanding jobs (setup with AI, moving changes, tile types) need a strong model. Casora reads the model from the AI task in Home Assistant. If it shows none, type the model name, for example anthropic/claude-sonnet-4.5.") });
      const wait = self._flowRow(g, { title: t("Loading…") });
      self._hass.callWS({ type: "casora/ki/models" }).then((r) => {
        wait.row.remove();
        const all = (r && r.all) || [];
        if (!all.length) { self._flowRow(g, { title: t("No AI task set up in Home Assistant.") }); return; }
        const had = Object.prototype.hasOwnProperty.call(JSON.parse(cs.O0 || "{}"), "ai_task_models");
        all.forEach((m) => {
          const typed = (cs.O.ai_task_models || {})[m.entity_id] || "";
          const known = m.model && m.source !== "typed";
          const sub = (m.model ? m.label : t("Model unknown")) + " · " + (m.ok ? t("strong enough") : t("too weak for demanding jobs"));
          const row = ctlRow(self, g, m.name, sub, []);
          row.querySelectorAll(".rtext > b, .rtext > span").forEach((x) => x.setAttribute("data-no-i18n", ""));
          const inp = el("input", "fin");
          inp.type = "text";
          inp.value = typed;
          inp.placeholder = known ? m.model : t("Model name");
          inp.setAttribute("aria-label", t("Model name"));
          inp.setAttribute("data-no-i18n", "");
          inp.oninput = () => {
            const map = Object.assign({}, cs.O.ai_task_models || {});
            const v = inp.value.trim();
            if (v) map[m.entity_id] = v; else delete map[m.entity_id];
            // Emptied: send {} when one was stored (options.py then removes it), else leave the key out.
            if (Object.keys(map).length || had) cs.O.ai_task_models = map; else delete cs.O.ai_task_models;
            self._csBar();
          };
          row.querySelector(".casora-pctl").appendChild(inp);
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
        let g = this._flowGroup(host, { header: t("Which AI"),
          footer: t("Empty: the default AI from Settings → AI tasks.") });
        ctlRow(this, g, t("AI for coaches, camera and plants"), null, [entPick(this, cs, "ai_task_entity", ["ai_task"])]);
        ctlRow(this, g, t("AI with web search"), t("Update analysis, recipe"),
          [entPick(this, cs, "ai_task_web_entity", ["ai_task"])]);
        aiModelGroup(this, cs, host);
        planGroup(this, host, O);
        g = this._flowGroup(host, { header: t("Recipe of the week"),
          footer: t("Empty: Cookidoo's additional purchases if set up, otherwise the first to-do list.") });
        ctlRow(this, g, t("Shopping list for the ingredients"), null, [entPick(this, cs, "rezept_liste", ["todo"])]);
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
        ctlRow(this, g, t("Outdoor temperature"), null, [entPick(this, cs, "outdoor_temperature", ["sensor"], ["temperature"])]);
        ctlRow(this, g, t("Outdoor humidity"), null, [entPick(this, cs, "outdoor_humidity", ["sensor"], ["humidity"])]);
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
        ctlRow(this, g, t("Send ventilation hints to"), null,
          [chips(this, known.map((id) => [id, notifyLabel(id)]), O.lueften_push || [], toggleIn(cs, "lueften_push"))]);
        const S = (this._hass && this._hass.states) || {};
        const people = Object.keys(S).filter((id) => id.startsWith("person.")).sort();
        (O.lueften_personen || []).forEach((x) => { if (!people.includes(x)) people.push(x); });
        g = this._flowGroup(host, { header: t("Only when someone is home"),
          footer: t("“Ventilate now” only when one of these people is home. None selected: anyone.") });
        ctlRow(this, g, t("People"), null,
          [chips(this, people.map((id) => [id, self._prettyEntity(id)]), O.lueften_personen || [], toggleIn(cs, "lueften_personen"))]);
      }
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
      // New Studio: a topic leads back to the start, a page to where it was opened from (topic, start, search,
      // a dashboard section); the phone's full-screen sheet of the previous layout has its own ‹.
      if (this._csDesk() && (page.topic || (!page.hub && this._hubBackTo))) {
        host.appendChild(this._csBackButton(page.topic ? "start" : this._hubBackTo));
      }
      host.appendChild(el("p", "cs-lede", t(page.lede)));
      if (page.hub) { this._csFillHub(host, page); return; }
      if (page.look) {
        if (!(typeof this._casoraLookPicker === "function" && this._casoraLookPicker(host))) {
          host.appendChild(el("p", "cs-lede", t("No Casora design is installed.")));
        }
        return;
      }
      if (!cs || !cs.loaded) {
        host.appendChild(el("p", "cs-lede", t("Loading settings…")));
        return;
      }
      const err = el("div", "cs-err", cs.err || "");
      host.appendChild(err);
      if (page.tanken) {
        this._csFillTanken(host);
        return;
      }
      if (page.live) {
        if (typeof this._csFillLive === "function") this._csFillLive(host);
        return;
      }
      if (page.personal) {
        if (cs.fromFile && page.id === "home") {
          host.appendChild(el("div", "cs-note", t("Taken over from einstellungen.js. Save once to manage these settings here; the file is no longer needed afterwards.")));
        }
        if (typeof this._casoraPersonalGroups === "function") {
          this._casoraPersonalGroups(host, cs.S, page.personal, rerender);
        }
        if (page.id === "dashboards") this._csHemmaGroup(host);
        // Integration options on this page: push on new Casora versions.
        if (page.id === "alerts" && cs.opt) this._csFillOptions(host, "update_push");
      } else {
        this._csFillOptions(host, page.id);
      }
    };

    // ── Settings by topic (variant B) ───────────────────────────────────────────
    // New Studio: pages in the inspector (on the phone its sheet), as the toolbar always opened them; the full-screen
    // sheet only in the previous layout's phone view.
    P._csDesk = function () {
      return split(this) || this.classList.contains("bmode");
    };
    const hubItem = (it, topic) => {
      const to = topic ? "t-" + topic.id : "start";
      if (it.page) {
        const p = PAGES.find((x) => x.id === it.page);
        return { label: it.label || p.label, sub: it.sub || p.lede, icon: it.icon || p.icon, tone: p.tone, kw: it.kw || "", go: { page: p.id, back: to, focus: it.focus } };
      }
      if (it.updates) return { label: "Updates", sub: it.sub, icon: "updates", tone: "updates", kw: "beta version update", go: { updates: true, back: to } };
      return { label: it.label, sub: it.sub || "", icon: it.icon, tone: topic.tone, dash: true, kw: it.kw || "", go: { sec: it.sec, back: to } };
    };
    // "‹ <where it came from>": a topic, the start (also after a search), or the dashboard section that linked here.
    const backLabel = (to) => {
      if (!to || to === "start") return t("Settings");
      if (to.indexOf("sec:") === 0) {
        const k = to.slice(4);
        const it = [].concat(...HUB.map((h) => h.items)).find((x) => x.sec === k);
        return t(it ? it.label : k);
      }
      return t(pageOf(to).label);
    };
    P._csBackButton = function (to) {
      const b = el("button", "cs-hubback", "‹ " + backLabel(to));
      b.type = "button";
      b.onclick = () => {
        if (to && to.indexOf("sec:") === 0) return this._csHubGo({ sec: to.slice(4), back: this._hubSecBack || "start" });
        this._hubBackTo = null;
        return this._csShow(to || "start");
      };
      return b;
    };
    // A navigation from the topics says where back leads; any other way of opening clears it (stale backs, #review).
    P._csHubGo = function (go) {
      this._hubNav = true;
      this._hubBackTo = go.back || "start";
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
      if (go.sec) {
        this._hubSecBack = this._hubBackTo;
        if (this._flowMode) this._exitFlow(false);
        this._csLeaving = true;
        try { this._csClose(); } finally { this._csLeaving = false; }
        if (typeof this._bLeavePages === "function") this._bLeavePages();
        // The inspector (on the phone its sheet) shows the section, also when the topics were not open before.
        if (this.classList.contains("bmode")) this._bOpen = true;
        this._select({ group: "rooms", key: go.sec, label: go.sec });
      }
      this._hubNav = false;
      return null;
    };
    // A dashboard section opened from the topics: its ‹ (phone) and a "‹ <topic>" link (desktop head) lead back there.
    P._csHubDecorate = function () {
      const to = this._hubBackTo, sel = this._sel;
      if (!to || !sel || sel.group !== "rooms" || this._csOpen || this._cuOpen) return;
      const root = this.shadowRoot;
      const round = root.querySelector("#pane .detailbar .back, .navrow .detailbar .back");
      if (round && round.getClientRects().length) {
        round.onclick = (ev) => { ev.stopPropagation(); this._hubBackTo = null; this._csShow(to); };
        round.title = round.getAttribute("aria-label") ? backLabel(to) : round.title;
        round.setAttribute("aria-label", backLabel(to));
        return;
      }
      const pane = this.$("pane");
      if (pane && !pane.querySelector(":scope > .cs-hubback")) {
        const b = this._csBackButton(to);
        b.style.margin = "0 6px 6px";
        pane.insertBefore(b, pane.firstChild);
      }
    };
    P._csFillHub = function (host, page) {
      const row = (list, it) => this._flowRow(list, { mask: icon(it.icon), tint: tint(it), title: t(it.label),
        sub: it.sub ? t(it.sub) : null, detail: it.dash ? t("Only this dashboard") : undefined,
        detailTone: it.dash ? "cs-dash" : undefined, chevron: true, onTap: () => this._csHubGo(it.go) });
      if (page.topic) {
        const list = this._flowGroup(host);
        list.classList.add("cs-hublist");
        page.topic.items.forEach((x) => row(list, hubItem(x, page.topic)));
        return;
      }
      const box = el("div", "cs-hubsearch");
      const inp = el("input", "fin");
      inp.type = "search";
      // The search text stays while the settings are open (redraws after loading, back from a hit).
      inp.value = this._hubQ || "";
      inp.placeholder = t("Search settings…");
      inp.setAttribute("aria-label", t("Search settings…"));
      box.appendChild(inp);
      const res = el("div"), main = el("div");
      host.append(box, res, main);
      const grid = el("div", "cs-hubgrid");
      HUB.forEach((h) => {
        const b = el("button", "cs-hubtile");
        b.type = "button";
        const ic = el("span", "rico"), mk = el("span", "mk");
        ic.style.setProperty("--tint", tint(h));
        mk.style.setProperty("--i", "url('" + icon(h.icon) + "')");
        ic.appendChild(mk);
        b.append(ic, el("b", "", t(h.label)), el("span", "", t(h.sub)));
        b.onclick = () => this._csShow("t-" + h.id);
        grid.appendChild(b);
      });
      main.appendChild(grid);
      const sysItems = typeof this._cuFromMenu === "function" ? [{ updates: true, sub: "Installed version and betas" }] : [];
      if (sysItems.length) {
        const sys = this._flowGroup(main, { header: t("System") });
        sysItems.forEach((x) => row(sys, hubItem(x)));
      }
      // Search: every entry of every topic, by its (translated) name, description and topic.
      // Search: name, description, topic and search words (German and English) of every entry; hits that start with
      // the word first. A hit leads back to the search, not into a topic that was never open.
      const fold = (x) => String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
      const all = [];
      const add = (it, h) => {
        const name = fold(t(it.label));
        it.go = Object.assign({}, it.go, { back: "start" });
        all.push({ it, name, hay: fold([name, it.sub ? t(it.sub) : "", h ? t(h.label) : "", it.kw || ""].join(" ")) });
      };
      HUB.forEach((h) => h.items.forEach((x) => add(hubItem(x, h), h)));
      HUB_FIND.forEach((x) => { const h = HUB.find((y) => y.id === x.topic); const it = hubItem(x, h); it.sub = t(pageOf(x.page).label); add(it, h); });
      sysItems.forEach((x) => add(hubItem(x)));
      const find = () => {
        const q = fold(inp.value.trim());
        this._hubQ = inp.value;
        // The field stays where it is while typing (the sheet would shrink to the hits and move it).
        if (q && !host.style.minHeight) host.style.minHeight = host.offsetHeight + "px";
        if (!q) host.style.minHeight = "";
        res.replaceChildren();
        main.style.display = q ? "none" : "";
        if (!q) return;
        const words = q.split(/\s+/);
        const score = (a) => (words.every((w) => a.name.split(/[\s&:,]+/).some((n) => n.indexOf(w) === 0)) ? 2 : 0)
          + (words.every((w) => a.hay.split(/[\s&:,/·–-]+/).some((n) => n.indexOf(w) === 0)) ? 1 : 0);
        const hits = all.filter((a) => words.every((w) => a.hay.includes(w))).sort((a, b) => score(b) - score(a));
        if (!hits.length) {
          res.appendChild(el("p", "cs-lede", t("No match – try one of the topics below.")));
          main.style.display = "";
          return;
        }
        const list = this._flowGroup(res);
        list.classList.add("cs-hublist");
        hits.forEach((a) => row(list, a.it));
      };
      inp.oninput = find;
      if (inp.value) find();
    };

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

    P._csRepaint = function () {
      // Page open (desktop with sidebar or phone in the new Studio, there without split): redraw.
      // Before, only with split – on the phone (393 px) tapping the live devices, the test etc. did nothing visible.
      if (this._csOpen && this.$("pane")) this._csRender();
      else if (this._csSheetPage && this._flowMode) this._csSheet(this._csSheetPage, null, true);
      // Otherwise (phone in the Studio: page as a sheet, no split) nobody redraws – after saving the bar
      // stayed on "Unsaved changes" / "Saving …" (user test 4, E-T3).
      else this._csBar();
    };

    // Every change on the page (also in the entity picker menu) → check the bar.
    const watch = (self) => {
      if (self._csWatch) return;
      self._csWatch = () => { if (self._csOpen || self._csSheetPage !== undefined) setTimeout(() => self._csBar(), 0); };
      ["input", "change", "click", "keyup"].forEach((ev) => self.shadowRoot.addEventListener(ev, self._csWatch, true));
    };

    P._csHaOptions = async function () {
      const dirty = this._state && this._isDirty && this._isDirty();
      if (dirty && !(await this._save())) return;
      if (this._flowMode) this._exitFlow(false);
      history.pushState(null, "", OPTIONS_PATH);
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
      const how = h.hacs ? t("Installed via HACS") : h.installed ? t("Installed in custom_components/hemma") : t("Leftovers from Hemma");
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
            h.hacs ? t("Removed through HACS, so HACS doesn't install it again.")
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
      hacs: ["Hemma is still installed in HACS", null],
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
          if (!s.ok) return item(list, "", t("Hemma not uninstalled"), err + (s.via === "hacs" ? "\n" + t("Remove it in HACS yourself.") : ""));
          return item(list, "ok", s.via === "hacs" ? t("Removed through HACS") : s.via === "folder"
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
      const bar = el("div", "cs-bar" + (this._csDirty() && !page.look ? "" : " cs-clean"));
      // Design and the topic pages: nothing to save here (unsaved drafts keep their bar on their own page).
      if (page.look || (page.hub && !this._csDirty())) bar.style.display = "none";
      const state = el("span", "cs-state");
      const save = btn(t("Save settings"), () => this._csSave());
      save.className = "cs-save";
      bar.append(state, save);
      wrap.appendChild(bar);
      pane.replaceChildren(wrap);
      this._csFill(body, page.id, () => this._csRender());
      pane.scrollTop = keep;
      this._csBar();
    };

    P._csOpenPage = async function (pageId, focus) {
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
      else if (!/^(start|t-)/.test(String(pageId || ""))) {
        const sel = this._sel;
        this._hubBackTo = sel && sel.group === "rooms" && !this._csOpen ? "sec:" + sel.key : null;
      }
      if (pageId === "start" && !this._csOpen) this._hubQ = "";
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
    P._csShow = function (pageId, focus) {
      if (this._csDesk()) return this._csOpenPage(pageId || "start", focus);
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
      const r = renderForm.apply(this, arguments);
      if (this._csOpen && !this._csLeaving) this._csRender();
      else if (this._hubBackTo) this._csHubDecorate();
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
      P._bClose = function () { this._hubBackTo = null; this._hubQ = ""; return bClose.apply(this, arguments); };
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
        PAGES.forEach((p) => {
          const b = el("button", "siderow cs-row cs-sub");
          b.type = "button";
          b.dataset.page = p.id;
          b.setAttribute("data-no-i18n", "");
          const si = el("span", "sicon");
          si.style.setProperty("--i", "url('" + icon(p.icon) + "')");
          si.style.setProperty("--sc", tint(p));
          b.append(si, el("span", "sidelabel", t(p.label)));
          b.onclick = () => { if (!(this._csOpen && this._csPage === p.id)) this._csOpenPage(p.id); };
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
      css(this);
      watch(this);
      // New Studio: the topics; the previous layout (tests only) keeps its list.
      if (!pageId) pageId = this.classList.contains("bmode") ? "start" : "start-list";
      if (pageId === "start-list") {
        this._csSheetPage = null;
        const s = this._flowScreen({ icon: "home", title: t("Settings"), quiet,
          lede: t("For all dashboards: your home, the bell, new dashboards and Casora's options.") });
        const tok = this._flowTok;
        const list = this._flowGroup(s.body);
        PAGES.forEach((p) => this._flowRow(list, { mask: icon(p.icon), tint: tint(p), title: t(p.label), chevron: true,
          onTap: () => { this._flowDir = 1; this._csSheet(p.id); } }));
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
      const backTo = page.id === "start" ? null : legacy ? "start-list" : page.topic ? "start" : this._hubBackTo || "start";
      const s = this._flowScreen({ title: t(page.label), quiet,
        back: backTo ? () => { this._flowDir = -1; this._csSheet(backTo); } : undefined });
      if (page.id === "start") this._flowCancel(s.acts);
      // The intro already sits below the sheet's title.
      const host = el("div");
      s.body.appendChild(host);
      const fill = () => {
        this._csFill(host, page.id, fill);
        const l = host.querySelector(".cs-lede");
        if (l) l.remove();
      };
      if (s.lede) s.lede.textContent = t(page.lede);
      else {
        const lede = el("p", "flede", t(page.lede));
        s.box.insertBefore(lede, s.box.querySelector(".flowerr"));
      }
      fill();
      // Design applies right away – no "Save settings" there; the topic pages only lead on.
      if (page.look || page.hub) { this._csBar(); return; }
      const save = this._flowButton(s.acts, t("Save settings"), () => this._csSave());
      save.classList.add("cs-save");
      this._csBar();
      if ((await this._csLoad()) && this._csSheetPage === page.id && host.isConnected) { fill(); this._csBar(); }
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
          c.dataset.page = "start";
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
          ch.onclick = () => this._csShow("start");
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
        PAGES.forEach((p) => {
          const c = card(t(p.label), icon(p.icon), tint(p), () => this._csSheet(p.id));
          c.classList.add("cs-pagerow");
          c.dataset.page = p.id;
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
