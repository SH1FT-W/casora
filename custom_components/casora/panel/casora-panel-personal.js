// Studio → Settings: sections for the whole home (27.09.2026; since 30.09.2026
// in the Settings page of casora-panel-settings.js instead of a page of its own)
//
// Settings that apply to the whole home rather than one dashboard: waste,
// calendar, bell, hidden scenes, door/window groups, Now Playing,
// eBike, default room. Stored in the integration (casora/settings/*), read
// by the dashboards as window.CASORA_SETTINGS. Without stored values the page
// /config/www/casora/einstellungen.js (the earlier way) takes over.
(function () {
  const CSS = ".frow.casora-prow{flex-wrap:wrap;row-gap:8px}"
    + ".frow.casora-prow .rtext{flex:1 1 100%;min-width:0}"
    + ".casora-pctl{display:flex;gap:8px;flex:1 1 100%;min-width:0;align-items:center;flex-wrap:wrap}"
    + ".casora-pctl>.combo{flex:1 1 260px;min-width:0;width:auto;max-width:none}"
    // Base width 100 instead of 160: on the phone (337 px row) short field + field + ✕ fit in one row –
    // before, the ✕ slipped alone into a row of its own below (zone wording, bell).
    + ".casora-pctl>input.fin{flex:1 1 100px;min-width:0;text-align:left;padding:7px 12px;border-radius:var(--r-m);height:var(--k-h, 38px);box-sizing:border-box;"
    + "background:var(--field, var(--casora-studio-field, rgba(118,118,128,.18)));border:none;color:inherit;font:inherit}"
    + ".casora-pctl>input.fin.casora-short{flex:0 1 130px}"
    + ".casora-pctl>input[type=color]{flex:0 0 38px;width:38px;height:32px;padding:0;border:none;border-radius:var(--r-s);background:none;cursor:pointer}"
    // Remove as in the builder: ✕ without a surface, red only on hover; 32 px, 44 px on the phone.
    + ".casora-x{flex:0 0 auto;width:var(--k-hit, 32px);height:var(--k-hit, 32px);border-radius:50%;border:none;cursor:pointer;"
    + "background:transparent;color:var(--ink-3);display:grid;place-items:center;padding:0}"
    + ".casora-x svg{width:14px;height:14px}"
    + ".casora-x:is(:hover,:focus-visible){background:color-mix(in srgb, var(--casora-studio-danger, #d70015) 13%, transparent);color:var(--casora-studio-danger, #d70015)}"
    // Fields stand out from the card (on the phone --field is as light as the card).
    + ".frow.casora-prow .casora-pctl .combo>input,.frow.casora-prow .casora-pctl>input.fin{background:var(--casora-studio-field, var(--field));"
    + "border:0;border-radius:var(--r-m);height:var(--k-h, 38px);box-sizing:border-box;color:var(--ink);font-size:var(--t-callout)}"
    + ".frow.casora-prow .casora-pctl>input.fin{padding:0 12px}"
    + ".frow.casora-prow .casora-pctl .combo.hasface:not(.typing)>input{color:transparent}"
    + ".casora-pctl input[type=checkbox]{accent-color:var(--accent)}"
    + ".casora-chips{display:flex;flex-wrap:wrap;gap:6px}"
    + ".casora-chip{border:none;border-radius:999px;padding:6px 11px;cursor:pointer;font:500 var(--t-foot) var(--casora-font-studio, system-ui);"
    + "background:var(--casora-studio-chip-hi, rgba(118,118,128,.24));color:inherit}"
    + ".casora-chip.on{background:var(--casora-studio-done, #0a84ff);color:#fff}"
    // Calendar color: the same color button as for scenes (just the dot, menu with the Casora colors).
    + ".casora-pctl>.scpick{gap:0;margin-right:0;flex:0 0 auto}"
    + ".casora-pctl>.scpick .scval{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}"
    + ".casora-pctl>.scpick .swatch{width:16px;height:16px;flex-basis:16px}"
    + ".casora-tog{display:flex;align-items:center;gap:6px;font-size:var(--t-foot);opacity:.85;white-space:nowrap}"
    // Switches instead of browser checkboxes – as everywhere else in the Studio.
    + ".casora-tog{gap:8px}"
    + ".casora-tog input[type=checkbox]{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:36px;height:22px;margin:0;"
    + "border-radius:11px;background:var(--sw-off, rgba(120,120,128,.24));cursor:pointer;transition:background .2s}"
    + ".casora-tog input[type=checkbox]::before{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;"
    + "background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}"
    + ".casora-tog input[type=checkbox]:checked{background:var(--sw-on, #34c759)}"
    + ".casora-tog input[type=checkbox]:checked::before{transform:translateX(14px)}"
    + ".casora-tog input[type=checkbox]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"
    // Phone: the 36×22 switch and its text get a 44 px tap height (the label toggles it); the look stays.
    + ":host(.phone) .casora-tog{position:relative}"
    + ":host(.phone) .casora-tog::before{content:'';position:absolute;left:-4px;right:-4px;top:50%;height:44px;transform:translateY(-50%)}"
    // Calendar: name, color, switch and ✕ in one line (the ✕ used to wrap into a line of its own on the phone).
    + ".frow.casora-calrow .casora-pctl>input.fin.casora-short{flex:1 1 72px}"
    + ".frow.casora-calrow .casora-pctl>.casora-x{margin-left:auto}"
    + ".fgroup.casora-pfocus .flist{box-shadow:0 0 0 2px var(--casora-studio-done, #0a84ff);transition:box-shadow .3s}"
    + ".frow.casora-pmore .rtext b{color:var(--casora-studio-link, #0a84ff);font-weight:500}"
    + ".frow.casora-pmore .rchev{transform:rotate(90deg);transition:transform .2s}"
    + ".frow.casora-pmore.open .rchev{transform:rotate(-90deg)}"
    // Light: blue and red in the darker Apple tones so text stays ≥ 4.5:1.
    + ":host(.is-light) .frow.casora-pmore .rtext b{color:var(--casora-studio-link, #0071e3)}"

    + ":host(.is-light) .casora-chip{background:var(--casora-studio-chip, rgba(118,118,128,.12))}:host(.is-light) .casora-chip.on{background:var(--casora-studio-link, #0071e3)}"
    + ":host(.is-light) .fgroup.casora-pfocus .flist{box-shadow:0 0 0 2px var(--casora-studio-link, #0071e3)}";

  const clone = (x) => JSON.parse(JSON.stringify(x || {}));
  // New calendars: Casora blue as in the color menu (formerly fixed #0A84FF, which stays readable).
  const CAL_DEFAULT = "var(--casora-color-blue, #0088FF)";
  const ICONS = ["", "tv", "apple_tv", "homepod", "playstation", "speaker"];
  const ICON_LABELS = { "": "Icon: Automatic", tv: "TV", apple_tv: "Apple TV", homepod: "HomePod",
    playstation: "PlayStation", speaker: "Speaker" };

  // Bring everything into a fixed shape so the UI does not have to check every time.
  function normalize(src) {
    const s = clone(src);
    const w = s.waste = s.waste || {};
    w.sensors = w.sensors || {};
    w.duty_months = Array.isArray(w.duty_months) ? w.duty_months : [];
    s.calendars = Array.isArray(s.calendars) ? s.calendars : [];
    const n = s.notify = s.notify || {};
    n.zone_phrases = n.zone_phrases || {};
    n.battery_exclude = Array.isArray(n.battery_exclude) ? n.battery_exclude : [];
    n.contact_merged = n.contact_merged || {};
    n.appliance_care = Array.isArray(n.appliance_care) ? n.appliance_care : [];
    s.scenes = s.scenes || {};
    s.scenes.exclude = Array.isArray(s.scenes.exclude) ? s.scenes.exclude : [];
    s.contacts = s.contacts || {};
    s.contacts.groups = Array.isArray(s.contacts.groups) ? s.contacts.groups : [];
    s.contacts.hidden = Array.isArray(s.contacts.hidden) ? s.contacts.hidden : [];
    s.contacts.names = s.contacts.names && typeof s.contacts.names === "object" ? s.contacts.names : {};
    s.security = s.security && typeof s.security === "object" ? s.security : {};
    s.security.covers = Array.isArray(s.security.covers) ? s.security.covers : [];
    s.media = s.media || {};
    s.media.players = s.media.players || {};
    s.ebike = s.ebike || {};
    s.basis = s.basis || {};
    return s;
  }

  // Drop empty entries – only what is really set gets stored.
  function prune(x) {
    if (Array.isArray(x)) return x.map(prune).filter((v) => v !== undefined);
    if (x && typeof x === "object") {
      const out = {};
      Object.keys(x).forEach((k) => {
        if (k === "") return;
        const v = prune(x[k]);
        if (v !== undefined) out[k] = v;
      });
      return Object.keys(out).length ? out : undefined;
    }
    return x === "" || x === null || x === undefined ? undefined : x;
  }

  async function fileSettings() {
    const before = window.CASORA_SETTINGS;
    try {
      window.CASORA_SETTINGS = undefined;
      await import("/casora_assets/einstellungen.js?t=" + Date.now());
      return window.CASORA_SETTINGS || null;
    } catch (e) {
      return null;
    } finally {
      window.CASORA_SETTINGS = before;
    }
  }

  // Players the Casora dashboards show: media_player_1…10 of the room cards and of the
  // phone playback (Studio "Now Playing"; same source as _casoraNPSources).
  async function dashboardPlayers(hass) {
    const ids = [];
    let list = [];
    try { list = await hass.callWS({ type: "lovelace/dashboards/list" }); } catch (e) { return ids; }
    for (const d of list) {
      if (!/^casora/.test(d.url_path || "") && d.mode !== "storage") continue;
      let cfg;
      try { cfg = await hass.callWS({ type: "lovelace/config", url_path: d.url_path }); } catch (e) { continue; }
      if (!/"casora_(room|mobile_now_playing)"/.test(JSON.stringify(cfg.views || []))) continue;
      (function walk(o) {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        const tpl = [].concat(o.template || []);
        if (o.variables && tpl.some((x) => /^casora_(room|mobile_now_playing|now_playing)$/.test(x))) {
          for (let i = 1; i <= 10; i++) {
            const v = o.variables["media_player_" + i];
            // Only existing players (not Hemma examples like media_player.YOUR_ENTITY).
            if (typeof v === "string" && /^media_player\./.test(v) && hass.states[v] && !ids.includes(v)) ids.push(v);
          }
        }
        Object.keys(o).forEach((k) => { if (k !== "button_card_templates") walk(o[k]); });
      })(cfg.views || []);
    }
    return ids.sort((a, b) => {
      const n = (x) => String(((hass.states[x] || {}).attributes || {}).friendly_name || x).toLowerCase();
      return n(a).localeCompare(n(b));
    });
  }

  // For the Settings page (casora-panel-settings.js): loading and saving stay the same.
  window.casoraPersonal = { normalize, prune, fileSettings, CSS };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._casoraPersonal) return;

    // The sections of the settings (casora-panel-settings.js): waste, calendar, doors
    // and windows, scenes, Now Playing, devices, bell, default room, Hemma search.
    // S is the draft (normalize), keys the sections of this subpage, render rebuilds.
    P._casoraPersonalGroups = function (host, S, keys, render) {
      const self = this;
      const hass = this._hass;
      const want = (k) => keys.includes(k);
      const group = (key, opts) => {
        const list = self._flowGroup(host, opts);
        list.parentElement.dataset.pkey = key;
        return list;
      };
      let g;
      if (!this.shadowRoot.getElementById("casora-personal-css")) {
        const st = document.createElement("style");
        st.id = "casora-personal-css";
        st.textContent = CSS;
        this.shadowRoot.appendChild(st);
      }

      // ── Building blocks ────────────────────────────────────────────────────
      // cls: device_class filter as in the panel (_entityList), list or {domain: [...]}.
      const ent = (value, domains, onChange, ph, cls) => self._combo(value || "", self._entityList(domains, cls),
        ph || (self._pickHint ? self._pickHint(domains) : ""), onChange).wrap;
      const txt = (value, ph, onChange, short) => {
        const i = document.createElement("input");
        i.className = "fin" + (short ? " casora-short" : "");
        i.value = value || "";
        i.spellcheck = false;
        if (ph) i.placeholder = window.casoraI18n ? window.casoraI18n.t(ph) : ph;
        i.setAttribute("data-no-i18n", "");
        i.oninput = () => onChange(i.value);
        return i;
      };
      const pick = (value, options, labels, onChange) => self._combo(value || "", options, "", onChange,
        { fixed: true, labels }).wrap;
      const del = (onTap) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "casora-x";
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
        b.title = "Remove";
        b.setAttribute("aria-label", "Remove");
        b.onclick = () => { onTap(); render(); };
        return b;
      };
      const row = (list, title, controls, sub) => {
        const r = self._flowRow(list, { title, sub });
        r.row.classList.add("casora-prow");
        const c = document.createElement("div");
        c.className = "casora-pctl";
        controls.filter(Boolean).forEach((x) => c.appendChild(x));
        r.row.appendChild(c);
        return r.row;
      };
      const addRow = (list, label, onTap) => self._flowRow(list, {
        icon: "plus", tint: I().FLOW_TINT.teal, title: label, onTap: () => { onTap(); render(); } });
      const I = () => window.__casoraPanelInternals || { FLOW_TINT: {} };
      const mapRows = (obj) => Object.keys(obj).map((k) => [k, obj[k]]);
      const setMap = (obj, oldKey, newKey, value) => {
        if (oldKey !== newKey) delete obj[oldKey];
        obj[newKey] = value;
      };

      // Advanced items behind "More options": closed while nothing is set there;
      // once expanded or collapsed it stays so until the Studio reloads.
      // what: own label per section – two identical "More options …" on one page confuse.
      const more = (list, key, isSet, build, what) => {
        const st = self._casoraPMore = self._casoraPMore || {};
        const open = st[key] !== undefined ? st[key] : !!isSet;
        // Header ("Advanced") first, the content expands below it.
        const r = self._flowRow(list, { title: open ? what[1] : what[0], chevron: true,
          onTap: () => { st[key] = !open; render(); } });
        r.row.classList.add("casora-pmore");
        r.row.classList.toggle("open", open);
        r.row.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) build();
      };

      // Color button as for scenes (casora-panel.js, scene colors): dot, menu with the
      // Casora colors (in Weich e.g. "Dark red"). Stored as there:
      // var(--casora-color-…, #hex); older hex values stay readable and show as
      // "Custom color" until a Casora color is picked.
      const colorPick = (value, onChange) => {
        const P = I();
        const ACC = P.CASORA_ACCENTS || [];
        const tr = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
        const css = (v) => (P.swatchCss ? P.swatchCss(v) : v);
        const known = (v) => ACC.find((a) => a.id === v);
        const name = (v) => { const a = known(v); return a ? (P.accentLabel ? P.accentLabel(a) : a.label) : "Custom color"; };
        let cur = value || "";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "scpick";
        b.setAttribute("data-no-i18n", "");
        const val = document.createElement("span");
        val.className = "scval";
        const sw = document.createElement("span");
        sw.className = "swatch";
        const paint = () => {
          sw.style.background = css(cur) || "transparent";
          val.textContent = tr(name(cur));
          b.setAttribute("aria-label", tr("Color") + ": " + tr(name(cur)));
        };
        paint();
        b.appendChild(val);
        b.appendChild(sw);
        b.onclick = () => {
          const items = [];
          if (cur && !known(cur)) items.push({ id: cur, label: "Custom color", swatch: css(cur), checked: true });
          (P.accentsShown ? P.accentsShown(cur) : ACC).forEach((a) => items.push({ id: a.id, label: name(a.id), swatch: css(a.id), checked: cur === a.id }));
          if (!items.length || typeof self._menuAt !== "function") return;
          self._menuAt(b, items, (id) => {
            if (!id || id === cur) return;
            cur = id;
            onChange(id);
            paint();
            if (typeof self._csBar === "function") self._csBar();
          });
        };
        return b;
      };
      const tog = (value, label, onChange) => {
        const l = document.createElement("label");
        l.className = "casora-tog";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.setAttribute("role", "switch");
        cb.checked = value;
        cb.onchange = () => onChange(cb.checked);
        l.appendChild(cb);
        l.appendChild(document.createTextNode(label));
        return l;
      };

      if (want("waste")) {
        // Waste
        g = group("waste", { header: "Waste collection",
          footer: "Without bins here, Casora uses every Waste Collection Schedule sensor." });
        // Heading only above the first row – not "Bin" in front of every bin.
        // A bin without a name was dropped on save (prune, issue #27): picking a sensor fills in its
        // name as the picker shows it, without the device in front (the place, the integration name).
        // Picking another sensor replaces a filled-in name, not a typed one; an emptied name field
        // gets the filled-in name back instead of dropping the bin.
        const binName = (v) => {
          if (!v) return "";
          const m = typeof self._entMeta === "function" ? self._entMeta(v) : null;
          return String((m && m.short) || self._prettyEntity(v) || v).replace(/^waste collection schedule\s+/i, "").trim();
        };
        mapRows(S.waste.sensors).forEach(([id, label], i) => {
          row(g, i ? "" : "Bin", [
            ent(id, ["sensor"], (v) => {
              const cur = S.waste.sensors[id];
              setMap(S.waste.sensors, id, v, cur && cur !== binName(id) ? cur : binName(v));
              render();
            }),
            txt(label, "Name", (v) => { S.waste.sensors[id] = v.trim() ? v : binName(id); }, true),
            del(() => { delete S.waste.sensors[id]; }),
          ]);
        });
        addRow(g, "Add bin", () => { S.waste.sensors[""] = ""; });
        row(g, "Waste calendar", [ent(S.waste.calendar, ["calendar"], (v) => { S.waste.calendar = v; })],
          "More dates in the popup");
        // Month calendar in the waste popup (03.10.2026), on by default since 20.10.2026; only "off" is stored (false).
        const calSw = self._flowRow(g, { title: "Calendar in the waste popup", sub: "Month with the pickup days in the bin colors" });
        if (typeof self._boolSwitch === "function") {
          calSw.row.appendChild(self._boolSwitch(S.waste.calendar_popup !== false, true, (v) => {
            if (v === false) S.waste.calendar_popup = false; else delete S.waste.calendar_popup;
          }, window.casoraI18n ? window.casoraI18n.t("Calendar in the waste popup") : "Calendar in the waste popup"));
        }
        const chips = document.createElement("div");
        chips.className = "casora-chips";
        const fmt = new Intl.DateTimeFormat((hass.locale && hass.locale.language) || hass.language || "en", { month: "short" });
        for (let m = 1; m <= 12; m++) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "casora-chip" + (S.waste.duty_months.includes(m) ? " on" : "");
          b.textContent = fmt.format(new Date(2026, m - 1, 1));
          b.setAttribute("data-no-i18n", "");
          b.onclick = () => {
            const i = S.waste.duty_months.indexOf(m);
            if (i >= 0) S.waste.duty_months.splice(i, 1); else S.waste.duty_months.push(m);
            S.waste.duty_months.sort((a, c) => a - c);
            b.classList.toggle("on");
          };
          chips.appendChild(b);
        }
        // "Your turn" (service months), sensor and reminder are not for everyone: under "Advanced",
        // closed by default (even when something is set there).
        more(g, "waste", false, () => {
          row(g, "Your turn in", [chips], "Months you put the bins out");
          row(g, "Your turn sensor", [ent(S.waste.duty_entity, ["sensor", "binary_sensor", "input_boolean"],
            (v) => { S.waste.duty_entity = v; })], "Instead of fixed months");
          row(g, "Reminder automation", [ent(S.waste.reminder, ["automation"], (v) => { S.waste.reminder = v; })],
            "The “Push the evening before” switch in the popup");
        }, ["Advanced", "Advanced"]);
      }

      if (want("calendars")) {
        // Calendar
        g = group("calendars", { header: "Calendars",
          footer: "Without calendars here, the calendar tile shows all of them." });
        S.calendars.forEach((c, i) => {
          const col = colorPick(c.color || CAL_DEFAULT, (v) => { c.color = v; });
          const tog = document.createElement("label");
          tog.className = "casora-tog";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.setAttribute("role", "switch");
          cb.checked = c.tile !== false;
          cb.onchange = () => { if (cb.checked) delete c.tile; else c.tile = false; };
          tog.appendChild(cb);
          tog.appendChild(document.createTextNode("On tile"));
          row(g, i ? "" : "Calendar", [
            ent(c.entity, ["calendar"], (v) => { c.entity = v; }),
            txt(c.name, "Name", (v) => { c.name = v; }, true), col, tog,
            del(() => { S.calendars.splice(i, 1); }),
          ]).classList.add("casora-calrow");
        });
        addRow(g, "Add calendar", () => { S.calendars.push({ entity: "", name: "", color: CAL_DEFAULT }); });
      }

      if (want("contacts")) {
        // Doors and windows
        g = group("contacts", { header: "Doors and windows",
          footer: "Groups of contact sensors for the security popups. Empty: every door and window sensor. Hidden ones and own names apply to the security badges and popups." });
        S.contacts.groups.forEach((c, i) => {
          row(g, "Group", [
            ent(c.id, ["binary_sensor"], (v) => { c.id = v; }),
            txt(c.label, "Label", (v) => { c.label = v; }, true),
            del(() => { S.contacts.groups.splice(i, 1); }),
          ]);
        });
        addRow(g, "Add group", () => { S.contacts.groups.push({ id: "", label: "" }); });
        // #69: single doors and windows left out of the security badge and popups, and own names for them.
        const CONTACT = ["door", "window", "opening", "garage_door"];
        S.contacts.hidden.forEach((id, i) => {
          row(g, i ? "" : "Hidden", [
            ent(id, ["binary_sensor"], (v) => { S.contacts.hidden[i] = v; }, null, CONTACT),
            del(() => { S.contacts.hidden.splice(i, 1); }),
          ]);
        });
        addRow(g, "Hide a door or window", () => { S.contacts.hidden.push(""); });
        mapRows(S.contacts.names).forEach(([id, name], i) => {
          row(g, i ? "" : "Own name", [
            ent(id, ["binary_sensor"], (v) => { setMap(S.contacts.names, id, v, S.contacts.names[id] || ""); render(); }, null, CONTACT),
            txt(name, "Name", (v) => { S.contacts.names[id] = v; }, true),
            del(() => { delete S.contacts.names[id]; }),
          ]);
        });
        addRow(g, "Rename a door or window", () => { if (!("" in S.contacts.names)) S.contacts.names[""] = ""; });
      }

      if (want("security")) {
        // Covers in security (#76, scripts/local/34-security-covers.js): which covers count on Home, and whether
        // only from sunset to sunrise (on by default; only "off" is stored). No cover picked = feature off.
        const sec = S.security;
        g = group("security", { header: "Security: covers",
          footer: "Picked covers that are not fully closed show on Home in the security row as “Blinds” and count as not secure. Nothing picked: nothing changes." });
        const nightRow = self._flowRow(g, { title: "Evening and night only", sub: "From sunset to sunrise" });
        if (typeof self._boolSwitch === "function") {
          nightRow.row.appendChild(self._boolSwitch(sec.covers_night !== false, true, (v) => {
            if (v === false) sec.covers_night = false; else delete sec.covers_night;
          }, window.casoraI18n ? window.casoraI18n.t("Evening and night only") : "Evening and night only"));
        }
        // Garage doors, gates and doors already count as "gate open" in the security badge.
        const GATE = ["garage", "gate", "door"];
        const reg = hass.entities || {};
        const listed = Object.keys(hass.states).filter((id) => {
          if (!id.startsWith("cover.")) return false;
          const e = reg[id];
          if (e && (e.hidden || e.entity_category)) return false;
          return !GATE.includes(String((hass.states[id].attributes || {}).device_class || "").toLowerCase());
        });
        // Picked ones stay in the list (also when gone or hidden) so they can be unpicked.
        sec.covers.forEach((id) => { if (id && !listed.includes(id)) listed.push(id); });
        const meta = (id) => (typeof self._entMeta === "function" ? self._entMeta(id) : { name: self._prettyEntity(id), area: "" });
        listed.sort((a, b) => String(meta(a).name).localeCompare(String(meta(b).name)));
        if (!listed.length) {
          self._flowRow(g, { title: "No covers found", dim: true });
        } else {
          // Grouped by area as in the entity picker (_entGroups), areas alphabetically, "no area" last.
          const groups = typeof self._entGroups === "function" ? self._entGroups(listed) : [["", listed]];
          groups.sort((a, b) => (!a[0]) - (!b[0]) || String(a[0]).localeCompare(String(b[0])));
          groups.forEach(([area, ids]) => {
            const list = self._flowGroup(host, { header: area || "No area" });
            if (area) list.parentElement.querySelector(".fhead").setAttribute("data-no-i18n", "");
            list.parentElement.classList.add("casora-psec-covers");
            ids.forEach((id) => {
              const m = meta(id);
              const st = hass.states[id];
              const r = self._flowRow(list, { title: (m && (m.short || m.name)) || id, raw: true,
                sub: st ? (m.device && m.device !== m.name ? m.device : "") : "Not found in Home Assistant",
                check: sec.covers.includes(id), onTap: () => {
                  const i = sec.covers.indexOf(id);
                  if (i >= 0) sec.covers.splice(i, 1); else sec.covers.push(id);
                  r.row.setAttribute("aria-checked", i >= 0 ? "false" : "true");
                } });
              const sub = r.row.querySelector(".rtext > span");
              if (sub && st) sub.setAttribute("data-no-i18n", "");
            });
          });
        }
      }

      if (want("scenes")) {
        // Scenes
        g = group("scenes", { header: "Hidden scenes",
          footer: "Hidden in every dashboard. To hide a scene in one dashboard only, use Scenes in the Studio." });
        S.scenes.exclude.forEach((id, i) => {
          row(g, "Scene", [
            ent(id, ["scene"], (v) => { S.scenes.exclude[i] = v; }),
            del(() => { S.scenes.exclude.splice(i, 1); }),
          ]);
        });
        addRow(g, "Hide a scene", () => { S.scenes.exclude.push(""); });
      }

      if (want("media")) {
        // Now Playing: all players the Casora dashboards show (Studio "Now
        // Playing"), with icon auto and volume via the player. Only what differs is
        // stored; players added by hand stay in the list with a marker (listed).
        g = group("media", { header: "Now Playing",
          footer: "Which players a dashboard shows is set in the Studio under Now Playing. Here you set the icon and volume for all dashboards." });
        // Re-read once a minute: players changed in the Studio show up the next time it opens.
        if (!self._casoraNPShown || Date.now() - (self._casoraNPAt || 0) > 60000) {
          self._casoraNPAt = Date.now();
          self._casoraNPShown = self._casoraNPShown || [];
          const was = JSON.stringify(self._casoraNPShown);
          dashboardPlayers(hass).then((ids) => {
            self._casoraNPShown = ids;
            if (JSON.stringify(ids) !== was && host.isConnected) render();
          });
        }
        const shown = self._casoraNPShown;
        const icon = (c, onSet) => pick(c.icon || "", ICONS, ICON_LABELS, (v) => { if (v) c.icon = v; else delete c.icon; onSet && onSet(); });
        const vol = (c, onSet) => ent(c.volume_entity, ["number", "media_player"],
          (v) => { if (v) c.volume_entity = v; else delete c.volume_entity; onSet && onSet(); }, "Volume: through the player");
        shown.forEach((id) => {
          // No entry yet: only create it once it differs (prune clears it away again when empty).
          const c = S.media.players[id] || {};
          const put = () => { S.media.players[id] = c; };
          const st = hass && hass.states[id];
          const r = row(g, (st && st.attributes && st.attributes.friendly_name) || id, [icon(c, put), vol(c, put)], id);
          const b = r.querySelector(".rtext > b");
          if (b) b.setAttribute("data-no-i18n", "");
          const sub = r.querySelector(".rtext > span");
          if (sub) sub.setAttribute("data-no-i18n", "");
        });
        mapRows(S.media.players).filter(([id]) => !shown.includes(id)).forEach(([id, cfg]) => {
          const c = cfg || {};
          row(g, "Player", [
            ent(id, ["media_player"], (v) => { setMap(S.media.players, id, v, c); render(); }),
            icon(c), vol(c),
            del(() => { delete S.media.players[id]; }),
          ]);
        });
        addRow(g, "Add player", () => { S.media.players[""] = { listed: true }; });
      }

      if (want("devices")) {
        // eBike: only via the Bosch eBike integration (Bosch Smart System), nothing to set.
        g = group("devices", { header: "More devices",
          footer: "The e-bike tile is for bikes with the Bosch Smart System. Its values come from the Bosch eBike integration (HACS: Xunil99/ha-bosch-ebike)." });
        const reg = hass.entities || {};
        const bike = Object.keys(hass.states).some((id) => id.startsWith("sensor.")
          && ((reg[id] && reg[id].translation_key === "days_since_last_ride") || /_days_since_last_ride$/.test(id)));
        self._flowRow(g, { title: "E-bike", sub: "Bosch Smart System",
          detail: bike ? "Detected" : "Not detected" });
      }

      if (want("notify")) {
        // Bell
        g = group("notify", { header: "Notifications",
          footer: "For all dashboards. Which messages a dashboard shows is set in the Studio under Notifications." });
        mapRows(S.notify.zone_phrases).forEach(([zone, phrase], i) => {
          row(g, i ? "" : "Zone wording", [
            txt(zone, "Zone", (v) => { setMap(S.notify.zone_phrases, zone, v, S.notify.zone_phrases[zone]); zone = v; }, true),
            txt(phrase, "e.g. at the office", (v) => { S.notify.zone_phrases[zone] = v; }),
            del(() => { delete S.notify.zone_phrases[zone]; }),
          ], i ? undefined : "“is at the office” instead of “is at Office”");
        });
        addRow(g, "Add zone wording", () => { S.notify.zone_phrases[""] = ""; });
        row(g, "Mailbox", [ent(S.notify.mail, ["binary_sensor", "input_boolean"], (v) => { S.notify.mail = v; }, null,
          { binary_sensor: ["door", "window", "opening", "garage_door", "motion", "occupancy", "presence", "vibration", "moving", "tamper"] })],
          "Shows a hint when new mail arrives");
        S.notify.battery_exclude.forEach((id, i) => {
          row(g, i ? "" : "No battery warning", [
            ent(id, ["sensor"], (v) => { S.notify.battery_exclude[i] = v; }, null, ["battery"]),
            del(() => { S.notify.battery_exclude.splice(i, 1); }),
          ]);
        });
        addRow(g, "Add battery exception", () => { S.notify.battery_exclude.push(""); });
        mapRows(S.notify.contact_merged).forEach(([combo, members]) => {
          const m = Array.isArray(members) ? members : [];
          const setM = (j, v) => { m[j] = v; S.notify.contact_merged[combo] = m.filter(Boolean); };
          row(g, "Combined contact", [
            ent(combo, ["binary_sensor"], (v) => { setMap(S.notify.contact_merged, combo, v, m); render(); }, "Combined sensor"),
            ent(m[0], ["binary_sensor"], (v) => setM(0, v), "Contact", ["door", "window", "opening", "garage_door"]),
            ent(m[1], ["binary_sensor"], (v) => setM(1, v), "Tilt", ["door", "window", "opening", "garage_door", "vibration", "moving"]),
            del(() => { delete S.notify.contact_merged[combo]; }),
          ], "One door or window with two sensors");
        });
        addRow(g, "Add combined contact", () => { S.notify.contact_merged[""] = []; });
        S.notify.appliance_care.forEach((a, i) => {
          row(g, "Appliance care", [
            ent(a[0], ["binary_sensor"], (v) => { a[0] = v; }, "Care needed"),
            ent(a[1], ["sensor"], (v) => { a[1] = v; }, "Appliance state"),
            txt(a[2], "Name", (v) => { a[2] = v; }, true),
            del(() => { S.notify.appliance_care.splice(i, 1); }),
          ]);
        });
        addRow(g, "Add appliance care", () => { S.notify.appliance_care.push(["", "", "", ""]); });
      }

      if (want("basis")) {
        // Default room: how "Start from Scratch" fills the rooms (casora-panel-basis.js).
        const B = S.basis;
        const D = (window.casoraBasis && window.casoraBasis.DEFAULTS) || { order: [], group_min: 2, skip_leds: true, favorites: true };
        g = group("basis", { header: "Standard room",
          footer: "How Casora fills the rooms of a new dashboard. Tap a tile type to move it one place forward." });
        const order = Array.isArray(B.order) && B.order.length ? B.order.slice() : D.order.slice();
        const types = (I().TILE_TYPES || []);
        const chipsO = document.createElement("div");
        chipsO.className = "casora-chips";
        order.forEach((id, i) => {
          const t = types.find((x) => x.id === id);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "casora-chip";
          b.textContent = (i + 1) + ". " + ((window.casoraI18n ? window.casoraI18n.t((t && t.label) || id) : (t && t.label) || id));
          b.setAttribute("data-no-i18n", "");
          b.onclick = () => { if (!i) return; order.splice(i - 1, 0, order.splice(i, 1)[0]); B.order = order; render(); };
          chipsO.appendChild(b);
        });
        row(g, "Order in a room", [chipsO]);
        const GROUP = ["2", "3", "4", "0"];
        row(g, "Combine into one tile", [pick(B.group_min >= 99 ? "0" : String(B.group_min != null ? B.group_min : D.group_min), GROUP,
          Object.fromEntries(Object.entries({ 2: "From 2 devices", 3: "From 3 devices", 4: "From 4 devices", 0: "Never" })
            .map(([k, v]) => [k, window.casoraI18n ? window.casoraI18n.t(v) : v])),
          (v) => { B.group_min = Number(v) || 99; })], "Lights, blinds and locks of a room");
        row(g, "Status LEDs", [tog(B.skip_leds !== false, "Leave out", (v) => { B.skip_leds = v; })],
          "Router, access point and camera lights");
        row(g, "Favorites on Home", [tog(B.favorites !== false, "Fill automatically", (v) => { B.favorites = v; })],
          "Locks, lights and blinds of all rooms");
        if (B.order || B.group_min != null || B.skip_leds === false || B.favorites === false) {
          addRow(g, "Reset standard room", () => { S.basis = {}; });
        }
      }

      if (want("umzug")) {
        // Find Hemma dashboards (migration)
        g = group("umzug", { header: "Hemma dashboards" });
        row(g, "Hemma dashboards", [tog(!(S.umzug || {}).off, "Look for them automatically", (v) => {
          S.umzug = Object.assign({}, S.umzug || {});
          if (v) delete S.umzug.off; else S.umzug.off = true;
        })], "Offers to move a Hemma dashboard when the Studio opens");
      }
    };

    // Formerly a page of its own ("Home settings"), now part of the Settings.
    // Old jumps (focus) land on the matching subpage.
    const FOCUS_PAGE = { notify: "alerts", scenes: "home", media: "home", basis: "dashboards", calendars: "calendar" };
    P._casoraPersonal = function (o) {
      o = o || {};
      if (typeof this._csShow !== "function") return undefined;
      return this._csShow(FOCUS_PAGE[o.focus] || "home", o.focus);
    };

    // In the Studio pages Scenes, Now Playing and Notifications: hint at
    // what applies to all dashboards, with a jump there.
    const LINKS = {
      Scenes: ["scenes", (S) => {
        const n = ((S.scenes || {}).exclude || []).filter(Boolean).length;
        return n ? ["In every dashboard: {n} hidden", n] : ["Hide scenes in every dashboard", 0];
      }],
      "Now Playing": ["media", () => ["Player icons and volume controls for every dashboard", 0]],
      Notifications: ["notify", () => ["Mailbox, battery exceptions and more for every dashboard", 0]],
    };
    // The Studio scene list needs what is hidden everywhere, the tile inspector the settings it
    // shows (_casoraSettingSwitch). Read once.
    const readSettings = (panel) => {
      if (panel._casoraSettingsRead || !panel._hass) return;
      panel._casoraSettingsRead = panel._hass.callWS({ type: "casora/settings/get" })
        .then((x) => (x && x.settings) || {}).catch(() => ({}));
      panel._casoraSettingsRead.then((S) => {
        panel._casoraSettingsNow = S;
        const hide = ((S.scenes || {}).exclude || []).filter(Boolean);
        const was = JSON.stringify(panel._casoraSceneHide || []);
        panel._casoraSceneHide = hide;
        if (was !== JSON.stringify(hide) && panel._state && !panel._flowMode) {
          panel.shadowRoot.querySelectorAll(".casora-plink").forEach((x) => x.remove());
          panel._renderForm();
          panel._rebuildPreview();
        }
      });
    };

    // Tile inspector (field with setting: true, key "<area>.<key>"): a switch for a Casora setting
    // instead of a tile variable – the waste tile's "Calendar in the waste popup" is the same value
    // as the switch under Settings → Home & Devices (issue #27; only "off" is stored). Like the
    // Design it is saved right away for all dashboards; set replaces everything, so read fresh and
    // change only this value, as the Settings page does.
    P._casoraSettingSwitch = function (f) {
      const [area, key] = String((f && f.key) || "").split(".");
      if (!area || !key || typeof this._boolSwitch !== "function") return null;
      const tr = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
      const on = (S) => {
        const v = ((S || {})[area] || {})[key];
        return v === undefined || v === null || v === "" ? !!f.boolDefault : !!v;
      };
      readSettings(this);
      const was = on(this._casoraSettingsNow || window.CASORA_SETTINGS);
      const save = async (v) => {
        const h = this._hass;
        try {
          const r0 = (await h.callWS({ type: "casora/settings/get" })) || {};
          let cur = r0.settings || {};
          // Still the older file (einstellungen.js): carry it over, as saving under Settings does.
          if (!r0.stored) {
            const file = await fileSettings();
            if (file && Object.keys(file).length) cur = file;
          }
          cur = clone(cur);
          const sec = cur[area] || {};
          if (v === undefined) delete sec[key]; else sec[key] = v;
          if (Object.keys(sec).length) cur[area] = sec; else delete cur[area];
          const r = await h.callWS({ type: "casora/settings/set", settings: cur });
          const S = (r && r.settings) || cur;
          window.CASORA_SETTINGS = S;
          this._casoraSettingsNow = S;
          this._casoraSettingsRead = Promise.resolve(S);
          // The Settings page reads again instead of showing its older copy; unsaved edits there
          // take the value, so saving them keeps it.
          const cs = this._cs;
          if (cs && cs.S && typeof this._csDirty === "function" && this._csDirty()) {
            const d = cs.S[area] = cs.S[area] || {};
            if (v === undefined) delete d[key]; else d[key] = v;
          } else if (cs) cs.at = 0;
          this._status(tr("Saved – reload open dashboards to apply"), "ok");
        } catch (e) {
          this._status(tr("Could not save: ") + ((e && e.message) || e), "err");
          this._renderForm();
        }
      };
      const sw = this._boolSwitch(was, f.boolDefault, save, tr(f.label));
      // Settings not read yet (or saved under Settings since): draw again once they are there.
      if (this._casoraSettingsRead) {
        this._casoraSettingsRead.then((S) => { if (on(S) !== was && sw.isConnected) this._renderForm(); });
      }
      return sw;
    };
    // Tile inspector (field with settingsLink: "<group>"): what is set there and a jump to it, instead of
    // a tile variable – the calendar tile shows the calendars under Settings → Calendar (issue #31).
    const LINK_TEXT = {
      calendars: (S) => {
        const n = (S.calendars || []).filter((c) => c && c.entity).length;
        return n ? [n === 1 ? "1 calendar" : "{n} calendars", n] : ["All calendars", 0];
      },
    };
    P._casoraSettingsLink = function (f) {
      const focus = f && f.settingsLink;
      if (!LINK_TEXT[focus]) return null;
      readSettings(this);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "casora-plink";
      b.setAttribute("data-no-i18n", "");
      b.onclick = () => this._casoraPersonal({ focus });
      const paint = (S) => {
        const [msg, n] = LINK_TEXT[focus](S || {});
        const tr = window.casoraI18n ? window.casoraI18n.t(msg) : msg;
        b.textContent = tr.replace("{n}", n) + " ›";
      };
      paint(this._casoraSettingsNow || window.CASORA_SETTINGS);
      if (this._casoraSettingsRead) this._casoraSettingsRead.then(paint);
      return b;
    };
    // Request already while loading (in parallel with the dashboard config): when the answer came after
    // the first draw, the inspector and preview were built a second time right away.
    const load = P._load;
    P._load = function () {
      try { readSettings(this); } catch (e) { /* ignore */ }
      return load.apply(this, arguments);
    };
    const renderForm = P._renderForm;
    P._renderForm = function () {
      const r = renderForm.apply(this, arguments);
      const pane = this.$("pane");
      if (!pane || !this._hass) return r;
      readSettings(this);
      Object.keys(LINKS).forEach((k) => {
        const card = pane.querySelector('section.card[data-k="' + k + '"]');
        if (!card || card.querySelector(".casora-plink")) return;
        const [focus, text] = LINKS[k];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "casora-plink";
        b.onclick = () => this._casoraPersonal({ focus });
        const paint = (S) => {
          const [msg, n] = text(S || {});
          const tr = window.casoraI18n ? window.casoraI18n.t(msg) : msg;
          b.textContent = tr.replace("{n}", n) + " \u203a";
        };
        paint(window.CASORA_SETTINGS);
        b.setAttribute("data-no-i18n", "");
        card.appendChild(b);
        if (focus === "scenes") this._casoraSettingsRead.then(paint);
      });
      if (!this.shadowRoot.getElementById("casora-plink-css")) {
        const st = document.createElement("style");
        st.id = "casora-plink-css";
        st.textContent = ".casora-plink{appearance:none;display:block;width:100%;margin:10px 0 0;padding:10px 0 2px;border:0;"
          + "background:none;box-shadow:none;text-align:left;font:500 var(--t-foot)/1.35 var(--casora-font-studio, system-ui);color:var(--casora-studio-link, #0a84ff);cursor:pointer}"
          + ".casora-plink:hover{opacity:.8;filter:none}"
          + ".row>.casora-plink{margin:0;padding:4px 0}"
          + ":host(.is-light) .casora-plink{color:var(--casora-studio-link, #0071e3)}";
        this.shadowRoot.appendChild(st);
      }
      return r;
    };
  });
})();

