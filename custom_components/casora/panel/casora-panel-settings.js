// Studio → „Einstellungen“ (30.09.2026)
//
// Alles, was für alle Dashboards gilt, an einer Stelle: im Abschnitt „Casora“ ganz
// unten in der Seitenleiste, über den Updates, mit Unterseiten. Zwei Speicher:
//   • Haus & Geräte, Glocke & Meldungen, Neue Dashboards – casora/settings/*
//     (Bereiche aus casora-panel-personal.js, window.CASORA_SETTINGS wie bisher)
//   • KI, Außenwerte & Strompreis, Lüften – die Optionen der Integration
//     (casora/options/*, options.py; dieselben wie HA → Casora → Konfigurieren)
// Ein Entwurf für beide, ein „Speichern“; ungespeichert bleibt er bis zum Neuladen.
// Updates brauchen keinen Zugang mehr (öffentliches Repo, update_source.py).
// Handy: dieselben Unterseiten als Blatt, erreichbar in der Abschnittsliste.
(function () {
  const OPTIONS_PATH = "/config/integrations/integration/casora";
  const I = () => window.__casoraPanelInternals || {};
  const icon = (name) => (I().iconUrl ? I().iconUrl(name) : "");
  // Icon-Farbe aus der zentralen Tabelle des Panels (STUDIO_ICON, casora-panel.js).
  const tint = (p) => (I().studioIcon ? I().studioIcon(p.tone) : "var(--ink)");

  // Unterseiten: personal = Bereiche aus casora-panel-personal.js, sonst Optionen.
  const PAGES = [
    { id: "home", label: "Home & Devices", icon: "home", tone: "set-home",
      personal: ["waste", "calendars", "contacts", "scenes", "media", "devices"],
      lede: "Waste collection, calendars, doors and windows, scenes and players – the same in every dashboard." },
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
  ];
  const pageOf = (id) => PAGES.find((p) => p.id === id) || PAGES[0];

  const CSS = ".cs-wrap{padding:4px 0 28px}"
    // Gleiche Maße wie der Kachel-Editor (Inspektor): Feldbeschriftung 13 px, Wert/Eingabe
    // 15 px bei 38 px Feldhöhe, Gruppen mit dem Radius der Editor-Karten und 10 px Einzug.
    // Geprüft von dev/qa/regress/r19_einstellungen_feldgroesse.mjs.
    + ".cs-wrap .flist{border-radius:var(--r-group)}"
    + ".cs-wrap .frow{min-height:44px;padding:10px;font-size:var(--t-callout);letter-spacing:-0.01em}"
    + ".cs-wrap .frow+.frow::before{left:10px;right:10px}"
    + ".cs-wrap .frow.casora-prow .rtext b{font-size:var(--t-foot)}"
    + ".cs-wrap .frow.casora-prow .rtext span{font-size:var(--t-caption)}"
    + ".cs-wrap .casora-pctl .combo>input,.cs-wrap .casora-pctl>input.fin,.cs-wrap .cs-num input"
    + "{height:var(--k-h, 38px);box-sizing:border-box;font-size:var(--t-callout)}"
    + ".cs-lede{margin:0 4px 14px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cs-note{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:var(--casora-studio-link-tint, rgba(10,132,255,.16));font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err{margin:0 0 14px;padding:10px 12px;border-radius:var(--r-m);background:rgba(255,69,58,.16);color:var(--ink);font-size:var(--t-foot);line-height:1.4}"
    + ".cs-err:empty{display:none}"
    // Speicherleiste: schwebende, abgerundete Leiste in Inhaltsbreite (wie ein Menü/Toast:
    // deckende Fläche, weicher Schatten), mit Abstand zum unteren Rand. Ohne Änderungen ist sie
    // ausgeblendet; sie behält ihren Platz am Seitenende, damit der Inhalt nie verdeckt bleibt.
    + ".cs-wrap:has(.cs-bar){padding-bottom:0}"
    + ".cs-bar{position:sticky;bottom:max(16px, calc(env(safe-area-inset-bottom, 0px) + 10px));z-index:3;box-sizing:border-box;"
    + "display:flex;align-items:center;gap:12px;min-height:56px;margin:24px 0 16px;padding:8px 8px 8px 20px;border-radius:22px;"
    + "background:var(--menu-glass, var(--casora-studio-menu-glass, rgba(44,44,50,0.94)));"
    + "-webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);"
    + "box-shadow:var(--toast-rim, var(--casora-studio-toast-rim, 0 0 0 .5px rgba(255,255,255,0.10), 0 14px 34px rgba(0,0,0,0.42)));"
    + "transition:opacity .22s ease, transform .34s cubic-bezier(.2,.9,.3,1.12), visibility 0s}"
    // Hell liegt die Leiste weiß auf weißer Karte – ein tieferer, weicher Schatten hebt sie ab.
    + ":host(.is-light) .cs-bar{box-shadow:var(--toast-rim, 0 0 0 .5px rgba(0,0,0,0.08)), 0 18px 40px -12px color-mix(in srgb, var(--ink, #3C2814) 28%, transparent), 0 2px 8px color-mix(in srgb, var(--ink, #3C2814) 8%, transparent)}"
    + ".cs-bar.cs-clean{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(18px) scale(.98);"
    + "transition:opacity .18s ease, transform .22s ease, visibility 0s .22s}"
    + "@media (prefers-reduced-motion:reduce){.cs-bar,.cs-bar.cs-clean{transform:none;transition:opacity .15s}}"
    + ".cs-bar span{flex:1 1 auto;display:flex;align-items:center;gap:9px;min-width:0;font-size:var(--t-callout);font-weight:500;color:var(--ink)}"
    + ".cs-bar span::before{content:'';flex:none;width:8px;height:8px;border-radius:50%;background:var(--casora-studio-done, var(--casora-color-blue, #0A84FF))}"
    + ".cs-bar button{flex:none;min-height:40px;padding:9px 20px;border-radius:999px;font-weight:600}"
    + ".cs-bar .cs-save:not(:disabled){background:var(--casora-studio-done, var(--casora-color-blue, #0A84FF));color:var(--casora-studio-on-done, #fff)}"
    + ".cs-area{width:100%;min-height:84px;box-sizing:border-box;resize:vertical;padding:9px 11px;border-radius:var(--r-s);border:none;"
    + "background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit;font:inherit;font-size:var(--t-callout);line-height:1.4}"
    // Zeitpläne: Modus, Wochentag und Uhrzeit nebeneinander, am Handy untereinander.
    + ".cs-wrap .frow.cs-plan .casora-pctl>.combo{flex:1 1 150px}"
    + ".cs-num{display:flex;align-items:center;gap:8px}"
    + ".cs-num input{width:110px;padding:7px 12px;border-radius:var(--r-m);border:none;background:var(--field, var(--casora-studio-field, rgba(118,118,128,.18)));color:inherit;font:inherit;text-align:right}"
    + ".cs-num span{font-size:var(--t-callout);color:var(--ink-2)}"
    + ".casora-pctl>button.ghost{padding:7px 13px;font-size:var(--t-foot)}"
    + ".frow .sw{margin-left:auto;flex:none}"
    + ".cs-empty{font-size:var(--t-foot);color:var(--ink-2)}"
    // Seitenleiste
    + ".sidehead.cu-sidehead small{display:block;margin-top:1px;font-size:var(--t-caption);font-weight:400;"
    + "color:var(--casora-studio-cap-sub, color-mix(in srgb, var(--ink) 48%, transparent))}"
    + ".sidelist .siderow .cs-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--casora-studio-warn, #ff9f0a)}"
    // Hemma entfernen
    + ".casora-pctl>button.cs-danger{background:var(--casora-studio-danger, #ff453a);color:#fff}"
    + ".chr-list{display:flex;flex-direction:column;gap:9px;margin:14px 0 2px;max-height:52vh;overflow:auto;text-align:left}"
    + ".chr-item{display:flex;align-items:flex-start;gap:10px;font-size:var(--t-foot);line-height:1.4}"
    + ".chr-item>i{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--casora-studio-danger, #ff453a)}"
    + ".chr-item.ok>i{background:var(--casora-studio-good, #34c759)}.chr-item.warn>i{background:var(--casora-studio-warn, #ff9f0a)}.chr-item.info>i{background:#8e8e93}"
    + ".chr-item>input{flex:none;width:16px;height:16px;margin:2px 0 0;accent-color:var(--casora-studio-danger, #ff453a);cursor:pointer}"
    + ".chr-item label,.chr-item>div{flex:1 1 auto;min-width:0;cursor:inherit}"
    + ".chr-item b{display:block;font-weight:600}"
    + ".chr-more{display:block;margin:2px 0 0;padding:0;border:0;background:none;font:inherit;font-size:var(--t-foot);font-weight:600;color:var(--accent);cursor:pointer;text-align:left}"
    + ".chr-item span{display:block;color:var(--ink-2);font-size:var(--t-foot);overflow-wrap:anywhere;white-space:pre-line}"
    // Bestätigung nach dem Neustart: Haken in Casora-Grün bzw. Hinweis in Orange über dem Titel
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
  // Pfad nur nach „/“ umbrechen, nie mitten im Datum (Wortverbinder um die Bindestriche).
  const pathText = (p) => String(p || "").replace(/-/g, "\u2060-\u2060").replace(/\//g, "/\u200b");
  const btn = (label, onTap, ghost) => {
    const b = el("button", ghost ? "ghost" : "", label);
    b.type = "button";
    b.onclick = onTap;
    return b;
  };
  const clone = (x) => JSON.parse(JSON.stringify(x || {}));
  // Wie options.clean_options: leere Felder fallen weg.
  const cleanOpts = (o) => {
    const out = {};
    Object.keys(o || {}).sort().forEach((k) => {
      const v = o[k];
      // Beta-Versionen stehen unter Updates (casora-panel-updates.js); fehlt der Schlüssel, behält options.py ihn.
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

    // ── Daten ────────────────────────────────────────────────────────────────
    const settingsDirty = (cs) => !!cs.S && JSON.stringify(PERS().prune(cs.S) || {}) !== cs.S0;
    const optionsDirty = (cs) => !!cs.opt && JSON.stringify(cleanOpts(cs.O)) !== cs.O0;
    P._csDirty = function () {
      const cs = this._cs;
      return !!cs && (settingsDirty(cs) || optionsDirty(cs));
    };

    const takeOptions = (cs, r) => {
      cs.opt = r;
      cs.O = clone(r.options);
      delete cs.O.ki_auto;  // bis 1.0.2; seit 1.0.3 Zeitpläne je Funktion (ki_plan_*)
      cs.O0 = JSON.stringify(cleanOpts(cs.O));
    };
    const takeSettings = (cs, data, stored) => {
      cs.S = PERS().normalize(data || {});
      cs.S0 = stored ? JSON.stringify(PERS().prune(cs.S) || {}) : "{}";
    };

    P._csLoad = async function () {
      const cs = this._cs = this._cs || {};
      // Entwurf behalten; sonst höchstens einmal pro Minute neu holen. false = nichts neu.
      if (cs.loaded && (this._csDirty() || Date.now() - cs.at < 60000)) return false;
      const hass = this._hass;
      let stored = false, data = {};
      cs.readErr = null;
      try {
        const r = await hass.callWS({ type: "casora/settings/get" });
        stored = !!r.stored;
        data = r.settings || {};
        // Preis aus HAs Energie-Dashboard: Hinweis am leeren Strompreis-Feld.
        cs.energyPrice = { kwh: r.energy_price_kwh, entity: r.energy_price_entity || null };
      } catch (e) {
        // Ältere Integration: nur Datei. Jeder andere Lesefehler sperrt das Speichern – settings/set
        // ersetzt alles, ein leeres Formular hätte sonst alle Einstellungen gelöscht.
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
      } catch (e) {
        cs.opt = null;
        cs.optErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
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
          // Frisch lesen und nur die hier geänderten Bereiche übernehmen: was inzwischen woanders
          // gespeichert wurde (Umzug, Willkommen, anderer Browser), bleibt erhalten.
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
          // Die Hinweise in den Studio-Seiten (Szenen …) lesen neu.
          this._casoraSettingsRead = null;
          this.shadowRoot.querySelectorAll(".casora-plink").forEach((x) => x.remove());
          done.push(t("Saved – reload open dashboards to apply"));
        }
        if (optionsDirty(cs)) {
          takeOptions(cs, await this._hass.callWS({ type: "casora/options/set", options: cleanOpts(cs.O) }));
          done.push(t("Saved – Casora applies the new options now"));
        }
      } catch (e) {
        cs.err = (e && e.message) || String(e);
      }
      cs.busy = false;
      this._csRepaint();
      if (done.length && !cs.err) this._status(done[done.length - 1], "ok");
    };

    // ── Bausteine der Optionen ───────────────────────────────────────────────
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
    // ── KI-Zeitpläne (1.0.3) ─────────────────────────────────────────────────
    // Je Funktion: Aus (Standard, nicht gespeichert), Automatisch (bisheriger Termin) oder
    // eigene Zeit („sun 18:00“; tägliche Funktionen nur „18:00“). Wie ki.py PLAN_AUTO.
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
      .format(new Date(2026, 0, 5 + PLAN_DAYS.indexOf(d)));  // 05.01.2026 war ein Montag
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
        // Text statt number: „0,30“ mit Komma geht so in jedem Browser.
        inp.type = "text";
        inp.inputMode = "decimal";
        // Leeres Feld: der Netzbezugspreis aus HAs Energie-Dashboard gilt (fester Wert oder
        // aktueller Zustand der Preis-Entität) und steht als Platzhalter und Hinweis da.
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

    // Inhalt einer Unterseite (Seite am Desktop, Blatt am Handy).
    P._csFill = function (host, pageId, rerender) {
      css(this);
      const cs = this._cs;
      const page = pageOf(pageId);
      host.replaceChildren();
      host.appendChild(el("p", "cs-lede", t(page.lede)));
      if (!cs || !cs.loaded) {
        host.appendChild(el("p", "cs-lede", t("Loading settings…")));
        return;
      }
      const err = el("div", "cs-err", cs.err || "");
      host.appendChild(err);
      if (page.personal) {
        if (cs.fromFile && page.id === "home") {
          host.appendChild(el("div", "cs-note", t("Taken over from einstellungen.js. Save once to manage these settings here; the file is no longer needed afterwards.")));
        }
        if (typeof this._casoraPersonalGroups === "function") {
          this._casoraPersonalGroups(host, cs.S, page.personal, rerender);
        }
        if (page.id === "dashboards") this._csHemmaGroup(host);
      } else {
        this._csFillOptions(host, page.id);
      }
    };

    // Speichern-Leiste und Punkt in der Seitenleiste nachziehen.
    // „Einstellungen speichern“ statt „Speichern“: „Fertig“ speichert das Dashboard, dieser Knopf nur
    // die Einstellungen für alle Dashboards (Nutzertest: drei gleich klingende Speicherwege).
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
      // Ohne Änderungen keine Leiste; beim Speichern bleibt sie bis zum Ende stehen.
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
      if (this._csOpen && split(this)) this._csRender();
      else if (this._csSheetPage && this._flowMode) this._csSheet(this._csSheetPage, null, true);
    };

    // Jede Änderung auf der Seite (auch im Auswahlmenü der Entitäten) → Leiste prüfen.
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

    // ── Hemma entfernen (hemma_cleanup.py) ───────────────────────────────────
    // Nur sichtbar, solange etwas von Hemma da ist: Integration, Einträge oder Ressourcen.
    // Auch Reste nach dem Entfernen (Paket-Helfer, Theme, www/hemma), damit sie sich später noch wegräumen lassen.
    const hemmaSeen = (h) => !!h && (h.installed || (h.entries || []).length > 0 || (h.resources || []).length > 0 || !!h.leftovers);
    // Dashboards, die mitgehen: das Desktop-Dashboard und sein Handy-Layout.
    const withMobile = (h, urls) => {
      const out = new Set();
      (h.dashboards || []).forEach((d) => { if (urls.has(d.url_path)) { out.add(d.url_path); if (d.mobile) out.add(d.mobile); } });
      return out;
    };
    // www/hemma darf weg: alles liegt in www/casora und nichts Bleibendes zeigt darauf (wie www_deletable).
    const wwwDeletable = (h, urls) => {
      const f = h.files || {};
      // Nicht kopierte Dateien übernimmt das Entfernen vorher nach www/casora (hemma_cleanup.py).
      if (!f.www_hemma || (f.conflicts || []).length || (f.resource_refs || []).length) return false;
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
    // „Bleibt“-Liste kurz halten: vier Beispiele, „… und N weitere“ klappt den Rest auf.
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

    // Bestätigen (was genau entfernt wird) → ausführen → Ergebnis mit „Jetzt neu starten“.
    P._casoraHemmaRemove = async function () {
      css(this);
      const h = await this._csHemmaLoad(true);
      if (!hemmaSeen(h)) {
        this._status(t("Hemma is not installed."), "ok");
        return;
      }
      const boards = h.dashboards || [];
      const sel = new Set(boards.filter((d) => d.moved_to && d.mode === "storage").map((d) => d.url_path));
      // www/hemma geht mit, sobald alles in www/casora liegt (vorgewählt, steckt in der Sicherung).
      let delWww = true, wwwWish = true;
      const ok = await this._ask({
        title: t("Remove Hemma?"),
        message: t("Casora saves a backup to casora_sicherungen first. Home Assistant needs a restart afterwards."),
        confirmLabel: t("Remove"), destructive: true, wide: true,
        extend: ({ box, acts }) => {
          const list = el("div", "chr-list");
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
          // Hemmas Helfer-Paket: nur was aus Hemma stammt (Herkunft, nicht Name) – Eigenes bleibt.
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
              item(www, "info", t("Old files in www/hemma stay"),
                t("A dashboard still uses them or not all of them are in www/casora yet – Casora keeps reading them from there."));
            }
          };
          paintWww();
          // Mit „hemma“ im Namen, aber nicht aus Hemma: bleibt – nur zur Info.
          const own = h.own || {};
          const ownN = (own.entities || []).length + (own.files || []).length;
          if (ownN) {
            ownItem(list, own.files, own.entities);
          }
          // Eigene Module (Ressourcen, z. B. /local/hemma-local/…): bleiben geladen.
          if ((own.resources || []).length) {
            item(list, "info", t("Stays: your own modules (dashboard resources)"),
              own.resources.join("\n") + "\n" + t("They keep loading – Casora's tiles find them under their old names."));
          }
          // Pfade, die eine Automation benutzt (Kamera-Standbilder …): bleiben in www/hemma.
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

    // Entfernen ausführen, Schritte zeigen, Neustart anbieten (auch für „Rest entfernen“).
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
          const list = el("div", "chr-list");
          list.setAttribute("data-no-i18n", "");
          (r.steps || []).forEach((s) => stepItem(list, s));
          box.insertBefore(list, acts);
        },
      });
      this._csRepaint();
      if (restart && r.restart_required) {
        // „Jetzt neu starten“ war schon die Bestätigung – nicht noch einmal fragen.
        try { await this._hass.callService("homeassistant", "restart", {}); } catch (e) {
          // Der Neustart trennt die Verbindung (Code 3) – das ist kein Fehler.
          if (!(e && (e.code === 3 || !e.message))) this._status(t("The restart didn't work."), "err");
        }
      }
    };

    // ── Nach dem Neustart: Hemma wirklich weg? (casora/hemma/verify) ─────────
    // Einmal je Entfernen, serverseitig gemerkt – auf jedem Gerät nur einmal.
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
      files: ["Old files in www/hemma", null],
    };
    const STATUS_ICON = {
      ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6 7.4-8.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="currentColor"/></svg>',
    };

    P._csHemmaVerifyShow = async function (r) {
      css(this);
      const mark = (box, tone) => {
        const m = el("div", "chv-mark " + tone);
        m.innerHTML = STATUS_ICON[tone];
        box.insertBefore(m, box.firstChild);
      };
      if (r.ok) {
        await this._ask({
          title: t("Hemma is completely removed"),
          message: t("Everything now runs on Casora.") + (r.backup ? "\n" + t("The backup is in:") : ""),
          confirmLabel: t("Done"),
          extend: ({ box, acts, cancel }) => {
            box.classList.add("chv");
            mark(box, "ok");
            cancel.remove();
            // Satz und Pfad je auf eigener Zeile; der Pfad bricht nur nach einem „/“ um,
            // nie mitten im Datum (Teile als inline-block, zu lange brechen trotzdem).
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
        // Breit nur bei längeren Listen – ein, zwei Reste passen ins schmale Fenster.
        wide: (r.leftovers || []).reduce((n, x) => n + 1 + (x.items || []).length, 0) > 4,
        extend: ({ box, acts }) => {
          box.classList.add("chv");
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
      // Erst, wenn kein anderes Fenster offen ist („Neu in Casora“, Willkommen, eine Frage).
      const t0 = Date.now();
      const busy = () => document.querySelector("[data-casora-welcome]")
        || (this.shadowRoot && this.shadowRoot.querySelector(".askpane"));
      while (busy() && Date.now() - t0 < 120000) await new Promise((ok) => setTimeout(ok, 400));
      if (!this.isConnected) return;
      if (this._cs) { this._cs.hemma = undefined; this._cs.hemmaAt = 0; }
      await this._csHemmaVerifyShow(r);
    };

    // Beim ersten Laden der Dashboard-Liste (Studio geöffnet) einmal prüfen.
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
      // Bei einem zweiten Durchgang (nur Reste): leere Schritte nicht als „0 … entfernt“ aufzählen.
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

    // ── Seite (Desktop) ──────────────────────────────────────────────────────
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
      const bar = el("div", "cs-bar" + (this._csDirty() ? "" : " cs-clean"));
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
      this._csOpen = true;
      this.classList.add("contentpage");
      this._csPage = pageOf(pageId).id;
      this._csSheetPage = undefined;
      this._csRender();
      this._csSideRow();
      const want = this._csPage;
      // Neu geladen: neu zeichnen, die Felder hängen am Entwurf.
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

    // Von überall (Hinweise in den Studio-Seiten, Updates, Menü): Desktop-Seite oder Blatt.
    P._csShow = function (pageId, focus) {
      if (split(this)) return this._csOpenPage(pageId, focus);
      return this._csSheet(pageId || null, focus);
    };

    // Versionen und Updates öffnen schließt die Einstellungen.
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
      return r;
    };

    // ── Seitenleiste: Überschrift „Einstellungen – für alle Dashboards“, darunter die Unterseiten ─
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
      // Unter der Überschrift „Casora“, vor den Updates.
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
          // Eine andere Seite verlässt die Einstellungen – auch die schon aktive.
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
      // Alles andere in der Seitenleiste (Räume, Popups, Dashboard-Wahl) verlässt die
      // Einstellungen ebenfalls – vor dem eigenen Klick, sonst zeichnet sich die
      // Einstellungsseite gleich wieder über den gewählten Raum.
      // Die Raumliste (#rooms) liegt neben #sidelist, daher am ganzen Studio lauschen.
      const root = this.shadowRoot;
      if (root && !root.__csLeave) {
        root.__csLeave = true;
        // Die Raumliste wählt schon beim Loslassen (pointerup, wegen Ziehen zum Sortieren) –
        // ein click kommt dort nicht an.
        // Gilt für alle Inhaltsseiten: Einstellungen, Updates, Zeitreise.
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

    // ── Handy: Blatt mit Unterseiten, in der Abschnittsliste erreichbar ───────
    P._csSheet = async function (pageId, focus, quiet) {
      css(this);
      watch(this);
      if (!pageId) {
        this._csSheetPage = null;
        const s = this._flowScreen({ icon: "home", title: t("Settings"), quiet,
          lede: t("For all dashboards: your home, the bell, new dashboards and Casora's options.") });
        const tok = this._flowTok;
        const list = this._flowGroup(s.body);
        PAGES.forEach((p) => this._flowRow(list, { mask: icon(p.icon), tint: tint(p), title: t(p.label), chevron: true,
          onTap: () => { this._flowDir = 1; this._csSheet(p.id); } }));
        // Auch mit ungespeichertem Entwurf (z. B. Einstellungen noch aus der Datei) braucht
        // die Vollbild-Seite einen Weg zurück: „Abbrechen“ (_flowBack). Der Entwurf bleibt.
        this._flowCancel(s.acts);
        if (this._csDirty()) {
          const save = this._flowButton(s.acts, t("Save settings"), () => this._csSave().then(() => this._csSheet(null, null, true)));
          save.classList.add("cs-save");
        }
        // Nur neu zeichnen, wenn die Seite noch offen ist: Wer schon „Abbrechen“ getippt hat,
        // bekäme die Einstellungen sonst nach dem Laden wieder darübergelegt – bei langsamem
        // HA kam man so nicht mehr heraus.
        if ((await this._csLoad()) && this._csSheetPage === null && this._flowMode && this._flowTok === tok) {
          this._csSheet(null, null, true);
        }
        return;
      }
      const page = pageOf(pageId);
      this._csSheetPage = page.id;
      const s = this._flowScreen({ title: t(page.label), quiet,
        back: () => { this._csSheet(null); } });
      // Die Einleitung steht schon unter dem Titel des Blatts.
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
      const save = this._flowButton(s.acts, t("Save settings"), () => this._csSave());
      save.classList.add("cs-save");
      this._csBar();
      if ((await this._csLoad()) && this._csSheetPage === page.id && host.isConnected) { fill(); this._csBar(); }
      if (focus) {
        const at = host.querySelector('[data-pkey="' + focus + '"]');
        if (at) requestAnimationFrame(() => at.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
    };

    // Blatt geschlossen: nichts mehr beobachten.
    const exitFlow = P._exitFlow;
    P._exitFlow = function () {
      this._csSheetPage = undefined;
      return exitFlow.apply(this, arguments);
    };

    // Abschnittsliste am Handy wie die Seitenleiste am Desktop: Überschrift „Einstellungen –
    // für alle Dashboards“, darunter die Unterseiten einzeln, zuletzt die Updates.
    const phoneList = P._phoneSectionList;
    if (typeof phoneList === "function") {
      P._phoneSectionList = function (bandFor) {
        const r = phoneList.apply(this, arguments);
        const slot = bandFor && bandFor.rooms && bandFor.rooms.colA;
        const cols = slot && slot.parentElement;
        if (!cols || !cols.classList.contains("phonelist") || cols.querySelector(".cs-phone")) return r;
        css(this);
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
          // Dasselbe Symbol wie die Zeile „Updates“ in der Desktop-Seitenleiste (casora-panel-updates.js).
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
