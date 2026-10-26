// Studio → ⋯ → Help → "Copy diagnostics…" (20.10.2026, after issue #25).
//
// Issue #25 was only solved once the reporter ran a console line and posted its result
// (9 trackers, all diagnostic, Studio list 0). This builds the same kind of summary for any
// installation and copies it for a GitHub issue: versions, device, dashboards, and per domain how
// many entities exist and how many Casora's own filters leave for lists and tile suggestions.
//
// Private data never goes in: no entity ids, no names (devices, rooms, people, pets), no addresses,
// coordinates, URLs, hosts or tokens. Only counts, entity domains, a fixed list of integration
// domains, Casora's own tile type ids and versions – every value passes a strict pattern or a fixed
// list before it is written (see clean*). Test: dev/unit/studio_diagnostics.mjs.
//
// Energy (#78/#79, 26.10.2026): HA's energy settings as counts (sources per type, which have a power sensor,
// individual devices) and per Casora dashboard the energy badges: how many rooms have one, automatic or chosen by
// hand, and per room how many power sensors it adds up of how many Casora finds in the room's area.
//
// Pure part: window.casoraDiagnostics = { collect, format, KNOWN_PLATFORMS, energyOf, energyBadge }.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const ISSUES = "https://github.com/SH1FT-W/casora/issues";

  // Integrations Casora's tiles and finders know by name (scripts/local/*.js, casora-panel-types.js).
  // Only these are named; every other integration is just counted – a custom integration's domain
  // could be anything.
  const KNOWN_PLATFORMS = [
    "casora", "casora_mock", "pulse", "tractive", "frigate", "reolink", "waste_collection_schedule", "teamtracker",
    "tankerkoenig", "roborock", "powercalc", "mobile_app", "group", "min_max",
    "home_connect", "home_connect_alt", "homeconnect_ws", "miele", "smartthings", "lg_thinq", "ha_washdata", "whirlpool",
    "hon", "electrolux_status", "electrolux", "smartthinq_sensors", "candy", "haier",
    "delonghi_primadonna", "delonghi_coffee", "delonghi_coffeelink", "jura", "melitta_barista", "lamarzocco",
    "bambu_lab", "dwd_weather_warnings", "nina", "husqvarna_automower", "gardena_bluetooth",
    "unifi", "fritz", "tplink_omada", "tplink_deco", "asuswrt", "netgear", "mikrotik", "eero",
  ];
  const KNOWN = new Set(KNOWN_PLATFORMS);
  // Theme names Casora ships; any other theme is "other" (its name is the user's). "Casora Glas" was missing (energy
  // audit b7): Glass users showed up as "other", although the look decides how the energy popup is built.
  const THEMES = ["Casora", "Casora Glas", "Casora Nebel", "Casora Weich"];

  // ── Cleaning: whatever is not plainly safe becomes "?" ──────────────────────
  const cleanWord = (x) => (/^[a-z0-9_]{1,40}$/.test(String(x || "")) ? String(x) : "?");
  const cleanVersion = (x) => (/^[0-9][0-9A-Za-z.+-]{0,30}$/.test(String(x || "")) ? String(x) : "?");
  const cleanLang = (x) => (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(String(x || "")) ? String(x) : "?");
  const cleanTheme = (x) => {
    const s = String(x || "");
    if (!s || s === "default") return "default";
    return THEMES.indexOf(s) >= 0 ? s : "other";
  };
  const oneOf = (x, list) => (list.indexOf(x) >= 0 ? x : "?");
  const num = (n) => (typeof n === "number" && isFinite(n) ? Math.max(0, Math.round(n)) : null);
  const domainOf = (id) => { const m = /^([a-z0-9_]+)\.[^.]/.exec(String(id || "")); return m ? m[1] : null; };

  // Browser, system and kind of app from the user agent – only names from fixed lists.
  function envOf(ua, extra) {
    const s = String(ua || "");
    const app = /Home ?Assistant\//i.test(s) || (extra && extra.externalApp) ? "app" : "browser";
    const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X|Macintosh/.test(s)
      ? ((extra && extra.touch) ? "iPadOS" : "macOS") : /Windows/.test(s) ? "Windows" : /Linux|CrOS/.test(s) ? "Linux" : "?";
    const browser = /Edg\//.test(s) ? "Edge" : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /OPR\//.test(s) ? "Opera"
      : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) || /AppleWebKit/.test(s) ? "Safari" : "?";
    return { app, os, browser };
  }

  // ── Energy: counts and fixed words only ──────────────────────────────────
  const ENERGY_TYPES = ["grid", "solar", "battery", "gas", "water"];
  const rateOf = (x) => !!(x && ((typeof x.stat_rate === "string" && x.stat_rate)
    || (x.power_config && typeof x.power_config.stat_rate === "string" && x.power_config.stat_rate)));
  const listOf = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  // One badge's variables → { on, mode, n (sensors it adds up), ex (left out) }. mode: Home "settings" (HA's energy
  // settings), "name" (a house sensor by its name), "rooms" (sum of the rooms), "rooms-chosen" (the user cleared the
  // house sensor), "manual", "none"; a room "auto", "manual", "none".
  function energyBadge(V, home) {
    V = V || {};
    const list = listOf(V.energy_entities), ex = listOf(V.energy_exclude);
    const n = list.length ? list.filter((id) => ex.indexOf(id) < 0).length : (V.energy_power_entity ? 1 : 0);
    let sub = false;
    for (let i = 1; i <= 6; i++) if (V["energy_entity_" + i]) sub = true;
    const on = V.show_energy !== false && (n > 0 || !!(V.energy_usage_today || V.energy_usage_month
      || V.energy_cost_today || V.energy_cost_month) || sub);
    const m = V.casora_energy_auto;
    let mode;
    if (!n) mode = "none";
    else if (home) {
      mode = m === "prefs" ? "settings" : m === "house" ? "name" : m === 2 ? (V.casora_energy_rooms ? "rooms-chosen" : "rooms") : "manual";
    } else mode = m === 2 || m === true ? "auto" : "manual";
    return { on, mode, n, ex: ex.length };
  }
  // prefs: energy/get_prefs ({} = not set up, null = not loaded). house: Casora takes the house from them (bool|null).
  // dashboards: [{ current, rooms: [{ home, vars, found }] }], found = power sensors Casora finds in the room's area
  // (null: no HA area of that name).
  function energyOf(prefs, house, dashboards) {
    const out = { prefs: prefs === null || prefs === undefined ? "unknown" : "none", sources: {}, power: {}, devices: 0, devicesPower: 0,
      house: typeof house === "boolean" ? house : null, dashboards: [] };
    ENERGY_TYPES.forEach((t) => { out.sources[t] = 0; out.power[t] = 0; });
    out.sources.other = 0;
    if (prefs && typeof prefs === "object") {
      const src = Array.isArray(prefs.energy_sources) ? prefs.energy_sources : [];
      const dc = Array.isArray(prefs.device_consumption) ? prefs.device_consumption : [];
      if (src.length || dc.length) out.prefs = "yes";
      src.forEach((x) => {
        const t = x && ENERGY_TYPES.indexOf(x.type) >= 0 ? x.type : "other";
        out.sources[t]++;
        // The legacy grid format kept the power sensor in power: [{ stat_rate }].
        if (t !== "other" && (rateOf(x) || (Array.isArray(x.power) && x.power.some(rateOf)))) out.power[t]++;
      });
      dc.forEach((x) => {
        if (!x || typeof x.stat_consumption !== "string") return;
        out.devices++;
        if (rateOf(x)) out.devicesPower++;
      });
    }
    (Array.isArray(dashboards) ? dashboards : []).forEach((d) => {
      const rooms = Array.isArray(d && d.rooms) ? d.rooms : [];
      const row = { current: !!(d && d.current), rooms: 0, badges: 0, home: "–", auto: 0, manual: 0, left: 0, per: [] };
      rooms.forEach((r) => {
        const b = energyBadge(r && r.vars, !!(r && r.home));
        row.left += b.ex;
        if (r && r.home) { row.home = b.on ? b.mode : "off"; return; }
        row.rooms++;
        const found = num(r && r.found);
        // Switched off: "off"; nothing to show (no sensor added up): 0 of what the area has.
        if (r && r.vars && r.vars.show_energy === false) { row.per.push("off"); return; }
        if (!b.on) { row.per.push(found ? "0:" + found : "–"); return; }
        row.badges++;
        if (b.mode === "auto") row.auto++;
        else if (b.mode === "manual") row.manual++;
        row.per.push(b.n + ":" + (found === null ? "x" : found));
      });
      out.dashboards.push(row);
    });
    return out;
  }

  // ── Collect: counts only ─────────────────────────────────────────────────
  // hass: the frontend's hass. o: what the panel knows –
  //   registry   full entity registry (config/entity_registry/list) or null (then no disabled counts)
  //   listCategory(id, entry)  Casora's filter (casora-panel.js); lists(domain) → n  the Studio's entity list
  //   finders    [{type, n}]  tile suggestions per tile type; community [type ids added]
  //   casora, dashboards {casora, phone}, current {rooms, tiles, missing} | null, device, studio, ua, uaExtra, viewport, date
  function collect(hass, o) {
    o = o || {};
    const H = hass || {};
    const S = H.states || {}, E = H.entities || {}, D = H.devices || {};
    const full = {};
    (Array.isArray(o.registry) ? o.registry : []).forEach((r) => { if (r && r.entity_id) full[r.entity_id] = r; });
    const ids = new Set([...Object.keys(S), ...Object.keys(E), ...Object.keys(full)]);
    const cat = typeof o.listCategory === "function" ? o.listCategory : (id, e) => (e && e.entity_category) || null;
    const doms = {}, plats = {};
    let total = 0, disabledAll = 0, hiddenAll = 0, noStateAll = 0;
    ids.forEach((id) => {
      const d = domainOf(id);
      if (!d) return;
      const e = E[id] || null, f = full[id] || null, rec = f || e || {};
      const disabled = !!(f && f.disabled_by);
      const hidden = !!((f && f.hidden_by) || (e && e.hidden));
      const category = rec.entity_category || null;
      const area = rec.area_id || (e && e.area_id) || ((D[rec.device_id] || {}).area_id) || null;
      const hasState = !!S[id];
      const row = doms[d] || (doms[d] = { all: 0, diag: 0, conf: 0, hid: 0, dis: 0, noArea: 0, noState: 0, tiles: 0 });
      total++; row.all++;
      if (category === "diagnostic") row.diag++;
      if (category === "config") row.conf++;
      if (hidden) { row.hid++; hiddenAll++; }
      if (disabled) { row.dis++; disabledAll++; }
      if (!area) row.noArea++;
      if (!hasState && !disabled) { row.noState++; noStateAll++; }
      // Like _tileCandidates' "usable": shown, not filtered by category, enabled, with a state.
      if (hasState && !hidden && !disabled && !cat(id, e || rec)) row.tiles++;
      const p = rec.platform || (e && e.platform) || "";
      if (p) {
        const pr = plats[p] || (plats[p] = { n: 0, doms: {} });
        pr.n++;
        pr.doms[d] = (pr.doms[d] || 0) + 1;
      }
    });
    const lists = typeof o.lists === "function" ? o.lists : () => null;
    const domains = Object.keys(doms).sort().map((d) => Object.assign({ domain: cleanWord(d), lists: num(lists(d)) }, doms[d]));
    const known = Object.keys(plats).filter((p) => KNOWN.has(p)).sort()
      .map((p) => ({ platform: p, n: plats[p].n, doms: Object.keys(plats[p].doms).sort().map((d) => [cleanWord(d), plats[p].doms[d]]) }));
    const other = Object.keys(plats).filter((p) => !KNOWN.has(p));
    const env = envOf(o.ua, o.uaExtra);
    const vp = o.viewport && num(o.viewport.w) && num(o.viewport.h) ? num(o.viewport.w) + "x" + num(o.viewport.h) : "?";
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date || "")) ? o.date : "?",
      casora: cleanVersion(o.casora),
      ha: cleanVersion(H.config && H.config.version),
      language: cleanLang((H.locale && H.locale.language) || H.language),
      // Casora's design (scripts/casora-theme.js) first, else HA's theme.
      theme: cleanTheme((W.casoraTheme && W.casoraTheme.active(H)) || (H.selectedTheme && H.selectedTheme.theme)
        || (H.themes && H.themes.default_theme)),
      dark: !!((H.selectedTheme && typeof H.selectedTheme.dark === "boolean") ? H.selectedTheme.dark : (H.themes && H.themes.darkMode)),
      device: oneOf(o.device, ["phone", "tablet", "desktop"]),
      studio: oneOf(o.studio, ["new", "previous"]),
      app: env.app, os: env.os, browser: env.browser, viewport: vp,
      dashboards: { casora: num((o.dashboards || {}).casora), phone: num((o.dashboards || {}).phone) },
      current: o.current ? { rooms: num(o.current.rooms), tiles: num(o.current.tiles), missing: num(o.current.missing) } : null,
      community: (o.community || []).map(cleanWord).filter((x) => x !== "?").sort(),
      total, disabled: Array.isArray(o.registry) ? disabledAll : null, hidden: hiddenAll, noState: noStateAll,
      domains,
      integrations: known,
      otherIntegrations: { count: other.length, entities: other.reduce((s, p) => s + plats[p].n, 0) },
      finders: (o.finders || []).map((x) => ({ type: cleanWord(x && x.type), n: num(x && x.n) })).filter((x) => x.type !== "?"),
      energy: o.energy ? energyOf(o.energy.prefs, o.energy.house, o.energy.dashboards) : null,
    };
  }

  // ── Format: a Markdown code block for a GitHub issue ─────────────────────
  const dash = (n) => (n === null || n === undefined ? "–" : String(n));
  // First column (and the ones in `left`) left-aligned, numbers right-aligned.
  function table(head, rows, left) {
    const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
    const L = new Set([0].concat(left || []));
    const line = (r) => r.map((c, i) => (L.has(i) ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join("  ").replace(/\s+$/, "");
    return [line(head)].concat(rows.map(line));
  }
  // An integration's domains: all of them when few, else the largest five and how many more.
  const domList = (doms) => {
    if (doms.length <= 6) return doms.map(([k, n]) => k + " " + n).join(", ");
    const top = doms.slice().sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
    return top.map(([k, n]) => k + " " + n).join(", ") + " +" + (doms.length - 5) + " more";
  };
  function formatEnergy(e) {
    const out = [];
    const typ = (t) => t + " " + e.sources[t] + (["grid", "solar", "battery"].indexOf(t) >= 0 && e.sources[t] ? " (power " + e.power[t] + ")" : "");
    out.push("energy settings (HA): " + (e.prefs === "yes" ? "set up" : e.prefs === "none" ? "not set up" : "not loaded")
      + (e.prefs === "yes" ? " · " + ENERGY_TYPES.map(typ).join(" · ") + (e.sources.other ? " · other " + e.sources.other : "")
        + " · devices " + e.devices + " (power " + e.devicesPower + ")" : "")
      + " · house from settings: " + (e.house === null ? "–" : e.house ? "yes" : "no"));
    if (!e.dashboards.length) return out;
    out.push("energy badges (per room: sensors added up:found in its area, off = switched off, x = no area of that name)");
    out.push(...table(["dashboard", "rooms", "badges", "home", "auto", "manual", "left_out", "per room"],
      e.dashboards.map((r, i) => [(i + 1) + (r.current ? "+" : ""), r.rooms, r.badges, r.home, r.auto, r.manual, r.left,
        r.per.length ? r.per.join(" ") : "–"]), [3, 7]));
    out.push("(+ = open in the Studio, unsaved changes included)");
    return out;
  }
  function format(d) {
    const out = [];
    out.push("Casora-Diagnose · " + d.date);
    out.push("Casora " + d.casora + " · Home Assistant " + d.ha + " · language " + d.language);
    out.push("theme " + d.theme + " (" + (d.dark ? "dark" : "light") + ") · Studio " + d.studio + " · " + d.device + " · "
      + (d.app === "app" ? "Companion app" : "browser") + " · " + d.browser + " on " + d.os + " · " + d.viewport);
    const db = d.dashboards || {};
    out.push("dashboards: " + dash(db.casora) + " Casora (" + dash(db.phone) + " phone layout)"
      + (d.current ? " · this one: " + dash(d.current.rooms) + " rooms, " + dash(d.current.tiles) + " tiles, "
        + dash(d.current.missing) + " without device" : ""));
    out.push("community cards added: " + (d.community.length ? d.community.join(", ") : "none"));
    out.push("");
    out.push("entities: " + d.total + " · disabled " + dash(d.disabled) + " · hidden " + d.hidden + " · no state " + d.noState);
    out.push("(lists = Studio entity lists, tiles = usable for tile suggestions)");
    out.push(...table(["domain", "all", "diag", "config", "hidden", "disabled", "no_area", "no_state", "lists", "tiles"],
      d.domains.map((r) => [r.domain, r.all, r.diag, r.conf, r.hid, d.disabled === null ? "–" : r.dis, r.noArea, r.noState, dash(r.lists), r.tiles])));
    if (d.finders.length) {
      out.push("");
      out.push("tile suggestions (new tile, no room)");
      out.push(...table(["tile type", "found"], d.finders.map((f) => [f.type, dash(f.n)])));
    }
    out.push("");
    out.push("integrations Casora knows");
    if (d.integrations.length) {
      out.push(...table(["integration", "entities", "domains"],
        d.integrations.map((p) => [p.platform, p.n, domList(p.doms)]), [2]));
    } else out.push("none");
    out.push("other integrations: " + d.otherIntegrations.count + " (" + d.otherIntegrations.entities + " entities)");
    if (d.energy) out.push("", ...formatEnergy(d.energy));
    return "```text\n" + out.join("\n") + "\n```\n";
  }

  W.casoraDiagnostics = { collect, format, envOf, KNOWN_PLATFORMS, cleanWord, cleanVersion, cleanTheme, energyOf, energyBadge };

  if (typeof customElements === "undefined" || !customElements || !customElements.whenDefined) return;

  // ── Clipboard: Clipboard API where allowed, else the old way (HTTP, Companion app) ──
  // Like clipboard.js: a read-only textarea outside the panel, selected, execCommand("copy").
  function copyByHand(text) {
    let ok = false;
    const ta = document.createElement("textarea");
    try {
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:12pt;";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = !!(document.execCommand && document.execCommand("copy"));
    } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text) {
    const C = W.navigator && W.navigator.clipboard;
    if (W.isSecureContext && C && C.writeText) {
      // Still inside the tap: the fallback works when the API is refused (permissions, app).
      return C.writeText(text).then(() => true, () => copyByHand(text));
    }
    return Promise.resolve(copyByHand(text));
  }

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraDiag) return;
    P.__casoraDiag = true;

    // Everything the panel knows, gathered for collect().
    P._diagData = async function () {
      const h = this._hass || {};
      const I = W.__casoraPanelInternals || {};
      if (!W.__casoraVersion && h.callWS) {
        try { const r = await h.callWS({ type: "casora/version" }); if (r && r.version) W.__casoraVersion = r.version; } catch (e) { /* stays "?" */ }
      }
      let registry = null;
      try { registry = h.callWS ? await h.callWS({ type: "config/entity_registry/list" }) : null; } catch (e) { registry = null; }
      const lists = (d) => {
        try { return typeof this._rankedEntityList === "function" ? this._rankedEntityList([d], undefined, null, "").length : null; } catch (e) { return null; }
      };
      const types = (I.TILE_TYPES || []).filter((t) => t && !t.hidden && !t.user && (t.community || (I.TILE_MAIN_FIND || {})[t.id]));
      const finders = types.map((t) => {
        let n = null;
        try { n = this._tileCandidates(t, null).length; } catch (e) { n = null; }
        return { type: t.id, n };
      });
      const list = this._dashList || [];
      const phone = list.filter((x) => /[-_]mobile$/i.test(x.url_path || "")).length;
      const rooms = (this._state && this._state.compact && this._state.compact.rooms) || null;
      let current = null;
      if (rooms) {
        let tiles = 0, missing = 0;
        rooms.forEach((r) => (r.tiles || []).forEach((t) => {
          tiles++;
          const v = (t && t.type === "conditional" && t.card) || t;
          const type = I.tileTypeAny ? I.tileTypeAny(v) : null;
          try { if ((I.tileMissingEntity && I.tileMissingEntity(v, type)) || (I.tileEntityGone && I.tileEntityGone(v, h.states))) missing++; } catch (e) { /* not counted */ }
        }));
        current = { rooms: rooms.length, tiles, missing };
      }
      const energy = await this._diagEnergy(list, rooms);
      const touch = !!(W.matchMedia && W.matchMedia("(pointer: coarse)").matches);
      const device = this.classList.contains("phone") ? "phone" : touch ? "tablet" : "desktop";
      return W.casoraDiagnostics.collect(h, {
        registry, lists, listCategory: I.listCategory, finders,
        community: W.casoraCommunityOn instanceof Set ? [...W.casoraCommunityOn] : [],
        casora: W.__casoraVersion || "",
        dashboards: { casora: list.length, phone },
        current, device,
        studio: typeof this._bOn === "function" ? (this._bOn() ? "new" : "previous") : "previous",
        ua: W.navigator && W.navigator.userAgent,
        uaExtra: { externalApp: !!(W.externalApp || (W.webkit && W.webkit.messageHandlers && W.webkit.messageHandlers.externalBus)), touch },
        viewport: { w: W.innerWidth, h: W.innerHeight },
        date: new Date().toISOString().slice(0, 10),
        energy,
      });
    };

    // HA's energy settings and every Casora dashboard's rooms (the open one as the Studio holds it, others as
    // saved; phone halves mirror the desktop and are left out). Never throws: what fails is left out.
    P._diagEnergy = async function (list, openRooms) {
      const h = this._hass || {};
      const I = W.__casoraPanelInternals || {};
      const B = W.casoraBasis;
      let prefs = null;
      try { prefs = B && B.energyPrefsReady ? await B.energyPrefsReady(h, 3000) : null; } catch (e) { prefs = null; }
      let house = null;
      try { house = prefs && W.casoraEnergyHouse ? !!W.casoraEnergyHouse(h, prefs) : null; } catch (e) { house = null; }
      const found = (name) => {
        try {
          const pr = B && B.energyProbe ? B.energyProbe(h, name || "") : null;
          return pr ? (pr.whole ? 1 : pr.list.length) : null;
        } catch (e) { return null; }
      };
      const roomsOf = (rooms) => (rooms || []).map((r) => {
        const home = I.isHomeRoom ? I.isHomeRoom(r, rooms) : false;
        return { home, vars: (r && r.variables) || {}, found: home ? null : found(r && r.name) };
      });
      const dashboards = [];
      for (const d of (list || [])) {
        if (!d || /[-_]mobile$/i.test(d.url_path || "")) continue;
        if (d.url_path === this._dashUrl && openRooms) { dashboards.push({ current: true, rooms: roomsOf(openRooms) }); continue; }
        try {
          const cfg = h.callWS ? await h.callWS({ type: "lovelace/config", url_path: d.url_path }) : null;
          if (!cfg || (I.isMobileConfig && I.isMobileConfig(cfg))) continue;
          const st = I.extractAny ? I.extractAny(cfg) : null;
          dashboards.push({ current: false, rooms: roomsOf(st && st.compact && st.compact.rooms) });
        } catch (e) { /* not readable: left out */ }
      }
      return { prefs, house, dashboards };
    };

    P._diagText = async function () {
      return W.casoraDiagnostics.format(await this._diagData());
    };

    // The dialog shows exactly what is copied; Copy works in the tap itself (Safari, app).
    P._diagShow = async function () {
      let text = "";
      try { text = await this._diagText(); } catch (e) {
        if (this._status) this._status(tr("The diagnostics could not be collected."), "err");
        return;
      }
      const res = await this._ask({
        title: tr("Diagnostics"),
        message: tr("Paste it into your GitHub issue. It contains only counts, versions and integrations – no names of devices, rooms or people, no addresses."),
        value: text, multiline: true, rows: 14, wide: true,
        cancelLabel: tr("Close"), altLabel: tr("Report a problem"), confirmLabel: tr("Copy"),
        extend: ({ box, input, ok, acts }) => {
          if (box) box.classList.add("casora-diag");
          if (input) {
            input.readOnly = true;
            input.setAttribute("data-no-i18n", "");
            input.setAttribute("aria-label", tr("Diagnostics"));
            setTimeout(() => { try { input.setSelectionRange(0, 0); input.scrollTop = 0; } catch (e) { /* fine */ } }, 60);
          }
          const alt = acts && acts.querySelector(".askalt");
          // GitHub opens in the tap (Safari and the app allow a new tab only there).
          if (alt) alt.addEventListener("click", () => {
            try {
              const a = document.createElement("a");
              a.href = ISSUES + "/new/choose"; a.target = "_blank"; a.rel = "noopener noreferrer";
              a.style.display = "none";
              document.body.appendChild(a); a.click(); a.remove();
            } catch (e) { /* the dialog still closes */ }
          }, true);
          if (!ok) return;
          // Copy keeps the dialog open (like "Copy link"): the button says "Copied".
          ok.addEventListener("click", (ev) => {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            copyText(text).then((done) => {
              if (done) {
                ok.textContent = tr("Copied");
                ok.classList.add("copied");
                if (typeof W.casoraHaptic === "function") W.casoraHaptic("success");
                return;
              }
              // Neither way worked: select the text so it can be copied by hand.
              ok.textContent = tr("Copy");
              let warn = box.querySelector(".casora-diag-warn");
              if (!warn) {
                warn = document.createElement("div");
                warn.className = "fieldwarn casora-diag-warn";
                box.insertBefore(warn, acts);
              }
              warn.textContent = tr("Copying is not possible here. The text is selected – copy it by hand.");
              if (input) { try { input.focus(); input.select(); } catch (e) { /* fine */ } }
            });
          }, true);
        },
      });
      if (res && res.alt && this._status) this._status(tr("GitHub is open – paste the diagnostics into your issue."), "ok");
    };
  });
})();
