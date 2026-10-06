// Umzugsassistent Hemma → Casora (27.09.2026)
//
// Ein Weg für Hemma 1 (YAML) und Hemma 2 (Hemma Studio): Casora findet das alte
// Dashboard selbst, zeigt in Alltagssprache, was passiert, fragt nur bei echten
// Entscheidungen, sichert das Original und legt ein neues Casora-Dashboard daneben
// an. Das Hemma-Dashboard bleibt unverändert.
//
// Angepasste Vorlagen: panel/hemma-originals.json enthält die Fingerabdrücke aller
// Original-Vorlagen aller Hemma-Versionen (tools/build-hemma-originals.py). Passt
// eine Vorlage des Nutzers zu keinem Original (und nicht zu Hemmas eigenem
// Fingerabdruck im Dashboard), hat er sie verändert – dann fragt der Assistent,
// statt sie still durch Casoras Fassung zu ersetzen.
(() => {
  if (window.casoraUmzug) return;
  const ORIGINALS_URL = new URL("./hemma-originals.json", import.meta.url).href;
  let originals = null;
  const loadOriginals = async () => {
    if (originals) return originals;
    try { originals = (await (await fetch(ORIGINALS_URL)).json()).templates || {}; } catch (e) { originals = {}; }
    return originals;
  };
  const I = () => window.__casoraPanelInternals;
  const print = (def) => I().fingerprintOf({ x: def }).x;
  // Umbenannte Kopie („zuhaus“) zurück in Hemmas Schreibweise – nur für Fingerabdrücke.
  const asHemma = (x, pre) => JSON.parse(JSON.stringify(x).replace(new RegExp("(?<![A-Za-z])" + pre, "gi"),
    (w) => (w === pre.toUpperCase() ? "HEMMA" : w[0] !== w[0].toLowerCase() ? "Hemma" : "hemma")));
  const tplOf = (t) =>[].concat((t && t.template) || []).filter((x) => typeof x === "string");
  // Tests (dev/e2e/harness.mjs) schalten das automatische Angebot ab.
  const offerOff = () => { try { return localStorage.getItem("casora.umzug.off") === "1"; } catch (e) { return false; } };
  // „Später“ (oder das Angebot einfach weggeklickt): eine Woche Ruhe auf diesem Gerät.
  const SNOOZE_KEY = "casora.umzug.snooze", SNOOZE_MS = 7 * 24 * 3600 * 1000;
  const snoozed = () => { try { return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < SNOOZE_MS; } catch (e) { return false; } };
  const snooze = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch (e) { /* egal */ } };
  // „Nicht mehr fragen“: für alle Geräte in den Casora-Einstellungen.
  async function offerOffForGood(hass) {
    try {
      const cur = await settingsForWrite(hass);
      await hass.callWS({ type: "casora/settings/set",
        settings: Object.assign({}, cur, { umzug: Object.assign({}, cur.umzug || {}, { off: true }) }) });
      return true;
    } catch (e) { return false; }
  }

  // Farbe je Kacheltyp (Symbolkreis, Vergleichsansicht).
  // Theme-Farben mit iOS-Fallback (Legacy setzt die Variablen auf genau diese Werte, Weich auf gedämpfte).
  const C = (n, f) => "var(--casora-color-" + n + ", " + f + ")";
  const HUE = [[/light|licht|lamp/, C("yellow", "#FFCC00")], [/cover|blind|jalou|shade|lock|schloss|camera|kamera|door|window|purifier|air|fan|vacuum|sauger/, C("teal", "#00C3D0")],
    [/media|player|tv/, C("pink", "#FF4D70")], [/thermostat|climate|heat|fbh/, C("red", "#FF453A")], [/batter|plant|pflanz/, C("green", "#34C759")],
    [/energy|energie|solar/, C("yellow", "#FFCC00")], [/network|wifi|update/, C("blue", "#0A84FF")], [/alarm/, C("red", "#FF453A")]];
  const hueFor = (key) => { const h = HUE.find(([re]) => re.test(String(key).toLowerCase())); return h ? h[1] : C("teal", "#00C3D0"); };

  // Kurzname der Quelle: ihr Titel ohne „Hemma“ und ohne Zusätze wie „(alt)“ oder „(Hemma 2)“.
  // „Hemma 1 (Test)“ → „Test“, „Mein Zuhause (Hemma 2)“ → „Mein Zuhause“, „Ferienhaus“ → „Ferienhaus“,
  // „Mein Hemma (alt)“ → „Mein Zuhause“ (nur „Mein“ bliebe übrig). Nie leer: sonst „Mein Zuhause“.
  function sourceName(title, home) {
    let s = String(title || "")
      // Klammern mit „Hemma“ darin oder nur einem Alters-/Kopie-Vermerk fallen ganz weg …
      .replace(/\s*[([][^)\]]*hemma[^)\]]*[)\]]/ig, " ")
      .replace(/\s*[([]\s*(alt|old|kopie|copy|backup|original)\s*[)\]]/ig, " ")
      .replace(/\bhemma(\s*\d+)?\b/ig, " ")
      // … andere („(Test)“) bleiben als Wort.
      .replace(/[()[\]]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—·:|/,]+|[\s\-–—·:|/,]+$/g, "")
      .trim();
    // Nur ein „Mein“/„Unser“/„My“ übrig: das war „Mein Hemma“ → „Mein Zuhause“.
    if (!s || /^(mein|meine|unser|unsere|my|our|the|das|der|die)$/i.test(s)) s = home;
    return s;
  }

  // Name fürs neue Dashboard. Das erste umgezogene heißt „Mein Zuhause“; ist das vergeben, behält es
  // den Kurznamen der Quelle (sourceName). Erst wenn auch der vergeben ist, kommt eine Nummer dazu –
  // nie „(importiert 2)“-Ketten. Der Titel der Quelle selbst zählt nicht als vergeben: das neue
  // Dashboard löst sie ab („Ferienhaus“ → „Ferienhaus“).
  function proposeTitle(panel, c) {
    const hass = panel._hass;
    const home = tr("My Home");
    const own = String((c && c.title) || "").trim();
    // Je Adresse ein Titel (Dashboard-Liste und Seitenleiste nennen dieselben) – ohne die Quelle.
    const byPath = {};
    Object.entries((hass && hass.panels) || {}).forEach(([k, p]) => { byPath[(p && p.url_path) || k] = (p && p.title) || ""; });
    (panel._dashList || []).forEach((d, i) => { byPath[d.url_path || "#" + i] = d.title || ""; });
    if (c && c.url_path) delete byPath[c.url_path];
    const taken = new Set(Object.values(byPath).map((t) => String(t).trim()).filter(Boolean));
    if (!taken.has(home)) return home;
    const base = sourceName(own, home);
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(base + " " + n)) n++;
    return base + " " + n;
  }

  // Badges je Raum (Home: das ganze Haus): Casoras Standard-Badges (Beleuchtung, Klima,
  // Sicherheit, Energie, Medien) mit den Geräten aus dem HA-Bereich – nur, wo das
  // Hemma-Dashboard dafür nichts eingetragen hatte (window.casoraBasis.fillBadges).
  // targets: [{ name, vars, home }]; vars wird ergänzt.
  // Energie: jeder Raum mit einem Leistungssensor im HA-Bereich bekommt die Badge (auch bei 0 W).
  function fillRoomBadges(hass, targets) {
    const B = window.casoraBasis;
    if (!B || !B.fillBadges || !hass) return [];
    try { return B.fillBadges(hass, targets.filter((t) => t && t.vars)); } catch (e) { return []; }
  }

  // Wetter: Hemma merkte sich das Wetter der Übersicht im Browser und zeigte es so in jedem Raum,
  // auch wo der Raum selbst keins eingetragen hatte. Casora liest nur das Dashboard (wie beim
  // Neu-Anlegen: dashboardweit in jedem Raum) – deshalb das Wetter der Übersicht in Räume ohne
  // eigenes übernehmen, sonst fehlt es nach dem Umzug überall außer in der Übersicht.
  function spreadWeather(targets) {
    const list = targets.filter((t) => t && t.vars);
    const home = list.find((t) => t.home) || list[0];
    const hv = (home && home.vars) || {};
    if (!hv.weather_entity && !hv.weather_temp_sensor) return 0;
    let n = 0;
    list.forEach((t) => {
      if (t === home || t.vars.weather_entity || t.vars.weather_temp_sensor) return;
      if (hv.weather_entity) t.vars.weather_entity = hv.weather_entity;
      if (hv.weather_temp_sensor) t.vars.weather_temp_sensor = hv.weather_temp_sensor;
      n++;
    });
    return n;
  }

  async function settings(hass) {
    try { return (await hass.callWS({ type: "casora/settings/get" })).settings || {}; } catch (e) { return {}; }
  }
  // Zum Zurückschreiben: settings/set ersetzt alles – ein leerer Stand nach einem Lesefehler
  // hätte alle anderen Einstellungen gelöscht. Hier wirft ein Lesefehler.
  async function settingsForWrite(hass) {
    return (await hass.callWS({ type: "casora/settings/get" })).settings || {};
  }

  // Umgezogene Dashboards: {src, target}; ältere Einträge sind nur der Pfad des Originals.
  // Ein Eintrag gilt nur, solange sein Casora-Dashboard noch da ist – wer es löscht,
  // bekommt das Hemma-Dashboard wieder angeboten.
  function liveDone(done, list) {
    const paths = new Set(list.map((d) => d.url_path));
    // Alte Einträge ohne Ziel: gelten, solange es irgendein umgezogenes Casora-Dashboard gibt.
    const anyCasora = list.some((d) => /^casora/.test(d.url_path || "") && !/-mobile$/.test(d.url_path));
    return new Set([].concat(done || []).filter((x) => (typeof x === "string" ? anyCasora
      : x && x.src && x.target && paths.has(x.target))).map((x) => (typeof x === "string" ? x : x.src)));
  }

  // Alte Hemma-Dashboards (Speicher und YAML). opts.includeDone: auch schon umgezogene
  // (Menü, Erststart) – sie tragen dann done: true. Ohne nur die offenen (automatisches Angebot).
  async function candidates(panel, opts) {
    const hass = panel._hass;
    const include = !!(opts && opts.includeDone);
    let list = [];
    try { list = await hass.callWS({ type: "lovelace/dashboards/list" }); } catch (e) { return []; }
    const done = liveDone(((await settings(hass)).umzug || {}).done, list);
    const out = [];
    // Hemma-Dashboards in YAML, die HA nicht lesen kann (z. B. fehlt eine !include-Datei): nicht still
    // weglassen, sondern mit Hinweis zeigen – nicht auswählbar (candidates(…).broken).
    const broken = [];
    for (const d of list) {
      if (/-mobile$/.test(d.url_path) || (!include && done.has(d.url_path))) continue;
      let raw;
      try { raw = await hass.callWS({ type: "lovelace/config", url_path: d.url_path }); } catch (e) {
        if (d.mode === "yaml" && d.filename) {
          let probe = null;
          try { probe = await hass.callWS({ type: "casora/hemma/yaml_probe", filename: d.filename }); } catch (e2) { probe = null; }
          if (probe && probe.prefix) broken.push({ url_path: d.url_path, title: d.title || d.url_path, prefix: probe.prefix,
            error: String((e && e.message) || e || "") });
        }
        continue;
      }
      // Hemma – auch eine umbenannte Kopie („zuhaus_room“ …): prefix sagt, unter welchem Namen.
      const prefix = /"hemma_room"/.test(JSON.stringify(raw.views || [])) ? "hemma"
        : (window.casoraPrefixOf && window.casoraPrefixOf(raw));
      if (!prefix) continue;
      let rawMobile = null;
      if (list.some((x) => x.url_path === d.url_path + "-mobile")) {
        try { rawMobile = await hass.callWS({ type: "lovelace/config", url_path: d.url_path + "-mobile" }); } catch (e) { /* ohne Handy */ }
      }
      out.push({ url_path: d.url_path, id: d.id, title: d.title || d.url_path, mode: d.mode, raw, rawMobile, prefix, done: done.has(d.url_path) });
    }
    // Vorausgewählt ist das erste: noch nicht umgezogene zuerst, dann Hemma 2 im HA-Speicher
    // (YAML-Test-Dashboards und Hemma 1 dahinter), dann das mit den meisten Räumen.
    const L = window.casoraLegacy;
    const old1 = (c) => { try { return !!(L && L.detect(c.raw)); } catch (e) { return false; } };
    const rank = (c) => (c.done ? 4 : 0) + (c.mode === "storage" ? 0 : 2) + (old1(c) ? 1 : 0);
    const size = (c) => (c.raw.views || []).length;
    const sorted = out.map((c, i) => [c, i]).sort(([p, i], [q, j]) => rank(p) - rank(q) || size(q) - size(p) || i - j).map(([c]) => c);
    sorted.broken = broken;
    return sorted;
  }

  // „Dashboard „X“ konnte nicht gelesen werden (Fehler in der YAML)“ – je unlesbarem Hemma-Dashboard.
  const brokenText = (b) => tr("Dashboard “{1}” couldn't be read (error in the YAML)").replace("{1}", b.title);
  function brokenNotes(parent, broken, cls) {
    const root = parent && parent.getRootNode && parent.getRootNode();
    if ((broken || []).length && root && root.getElementById && !root.getElementById("casora-ubroken-css")) {
      const st = document.createElement("style");
      st.id = "casora-ubroken-css";
      st.textContent = ".cu-broken{display:flex;align-items:flex-start;justify-content:center;gap:9px;margin:12px auto 0;max-width:640px;"
        + "font-size:var(--t-foot);line-height:1.4;color:var(--ink-2);text-align:left}"
        + ".cu-broken.cu-broken-top{margin:-8px auto 18px}"
        + ".cu-broken i{flex:0 0 18px;height:18px;border-radius:50%;background:var(--casora-color-orange, #ff9f0a);display:grid;place-items:center;color:#fff}"
        + ".cu-broken i svg{width:12px;height:12px}";
      (root.head || root).appendChild(st);
    }
    (broken || []).forEach((b) => {
      const n = document.createElement("div");
      n.className = cls;
      n.setAttribute("data-no-i18n", "");
      n.title = b.error || "";
      const i = document.createElement("i");
      i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6"/><path d="M12 17h.01"/></svg>';
      const t = document.createElement("span");
      t.textContent = brokenText(b);
      n.append(i, t);
      parent.appendChild(n);
    });
  }
  window.casoraUmzugBrokenNotes = brokenNotes;

  // ── Angepasste Kacheln erkennen (reine Logik, auch für dev/unit/umzug_angepasst.mjs) ──────────
  // Kachel in bedingter Hülle: die eigentliche Karte.
  const innerTile = (t) => { let c = t, n = 0; while (c && c.type === "conditional" && c.card && n++ < 4) c = c.card; return c || {}; };
  // Vorlagen, die eine Kachel selbst nennt – auch die vor einer Umstellung (Hemma 1: Türklingel → Kamera
  // behält ihre ursprüngliche Karte in tile.card).
  const directOf = (x) => { const t = innerTile(x.tile); return [...new Set(tplOf(t).concat(t.card ? tplOf(innerTile(t.card)) : []))]; };
  const headOf = (x) => tplOf(innerTile(x.tile))[0];
  // Alle Vorlagen, die eine Liste von Vorlagen über „template:“ einbindet (Kachel → Basis → Popup …).
  function chainOf(names, T) {
    const out = [];
    const walk = (n) => { if (typeof n !== "string" || out.includes(n)) return; out.push(n); tplOf((T || {})[n]).forEach(walk); };
    [].concat(names || []).forEach(walk);
    return out;
  }
  // Grundgerüst, das immer von Casora kommt (Raumkarte, Basis, Popup-Gerüst) – nie eine Kachelfrage.
  const isBase = (n) => /_base$|^[a-z0-9]+_(entity|room|shared|default|custom|time|weather|menu_icon|scene_core)$/.test(n);
  const isPopup = (n) => /(^|_)popup(_|$)/.test(n);
  // Variablen, die das Studio selbst an Kacheln schreibt (casora-panel.js TILE_OWN_KEYS).
  const STUDIO_VARS = new Set(["enabled", "surfaces", "size", "casora_derived", "casora_from_room", "casora_ui_managed", "casora_tile", "mobile_filter_category"]);
  const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentions = (text, v) => new RegExp("(?<![A-Za-z0-9_$])" + esc(v) + "(?![A-Za-z0-9_$])").test(text);

  // Variablen einer Kachel, die Casoras Vorlage (samt Basis-Kette) nicht kennt – ein starkes Zeichen
  // für eigene Logik (eigene Schwellen, Standbild-Pfad …). Nicht gezählt: Studio-Variablen, Felder
  // der Kachelart und Variablen, die nur Hemmas unveränderte Original-Vorlagen kannten.
  // ctx: { shipped, defs, unchanged: Set, fields(head) → Set, cache: Map }
  function foreignVars(x, ctx) {
    const t = innerTile(x.tile);
    const head = headOf(x);
    const vars = Object.keys(t.variables || {});
    if (!head || !vars.length || !ctx.shipped[head]) return [];
    const cache = ctx.cache || (ctx.cache = new Map());
    if (!cache.has(head)) cache.set(head, chainOf([head], ctx.shipped).map((n) => JSON.stringify(ctx.shipped[n] || "")).join("\n"));
    const casora = cache.get(head);
    const fields = (ctx.fields && ctx.fields(head)) || new Set();
    const mine = chainOf(directOf(x), ctx.defs);
    return vars.filter((v) => {
      if (STUDIO_VARS.has(v) || fields.has(v) || mentions(casora, v)) return false;
      // Kennt nur eine unveränderte Hemma-Vorlage die Variable, hat Casora sie bewusst abgelöst.
      const texts = ctx.texts || (ctx.texts = new Map());
      const text = (n) => { if (!texts.has(n)) texts.set(n, JSON.stringify(ctx.defs[n])); return texts.get(n); };
      const users = mine.filter((n) => ctx.defs[n] && mentions(text(n), v));
      return !(users.length && users.every((n) => ctx.unchanged.has(n)));
    });
  }

  // Welche Hemma-Vorlagen der Nutzer verändert hat und welche Kacheln sie betreffen.
  // in: { rawTpl, defs (umbenannt), tiles [{room, tile}], shipped, O, rawFp, pre, print, fields }
  // out: { modified [{raw, name, uses, def, via?, vars?}], unchanged, structural, groups }
  function classify(inp) {
    const { rawTpl, defs, tiles, shipped, O, rawFp } = inp;
    const pre = inp.pre || "hemma";
    const preRe = new RegExp("^" + pre + "_");
    const modified = [], unchanged = [], structural = [];
    const rawOf = {};
    Object.keys(rawTpl).forEach((n) => {
      // Umbenannte Kopie: „zuhaus_light“ ist Hemmas „hemma_light“.
      const orig = n.replace(preRe, "hemma_");
      if (!O[orig]) return;  // keine Hemma-Vorlage: gehört dem Nutzer und wird ohnehin mitgenommen
      const name = n.replace(preRe, "casora_");
      rawOf[name] = n;
      // Gibt es in Casora nicht mehr (z. B. Plex): unverändert mitnehmen, Karten brauchen sie noch.
      if (!shipped[name]) return;
      // Vergleich mit Hemmas Originalen: die Kopie mit „hemma“ statt ihres Präfixes.
      const h = inp.print(rawTpl[n], n);
      if (O[orig].includes(h) || (rawFp || {})[n] === h) { unchanged.push(name); return; }
      let uses = tiles.filter((x) => directOf(x).includes(name));
      let via = null;
      // Nicht direkt genutzt: Popup-Vorlage (Kamera → Kamera-Popup) oder Vorlage, die nur eine Kachelart
      // über ihre Kette einbindet. Grundgerüst (Basis, Raumkarte) bleibt Casoras.
      if (!uses.length && !isBase(name)) {
        const users = tiles.filter((x) => chainOf(directOf(x), defs).includes(name));
        const heads = new Set(users.map(headOf).filter(Boolean));
        if (users.length && (heads.size === 1 || (isPopup(name) && heads.size <= 3))) { uses = users; via = "chain"; }
      }
      if (!uses.length) { structural.push(name); return; }
      modified.push({ raw: n, name, uses, via, def: defs[name] || rawTpl[n] });
    });
    // Unbekannte Variablen: die Kachelart gilt als angepasst, auch wenn ihre Vorlage ein Original ist.
    const ctx = { shipped, defs, unchanged: new Set(unchanged), fields: inp.fields };
    const flagged = new Map();
    tiles.forEach((x) => {
      const vars = foreignVars(x, ctx);
      if (!vars.length) return;
      const head = headOf(x);
      if (!flagged.has(head)) flagged.set(head, new Set());
      vars.forEach((v) => flagged.get(head).add(v));
    });
    flagged.forEach((vars, head) => {
      let m = modified.find((y) => y.name === head);
      if (!m && defs[head]) {
        const uses = tiles.filter((x) => headOf(x) === head);
        m = { raw: rawOf[head] || head, name: head, uses, via: "vars", def: defs[head] };
        modified.push(m);
      }
      if (m) m.vars = [...new Set((m.vars || []).concat([...vars]))];
    });
    // Eine Frage pro Kacheltyp: Kachel und ihr Popup (z. B. casora_cover + casora_popup_cover) gehören zusammen.
    const groups = new Map();
    modified.forEach((m) => {
      const heads = m.uses.map(headOf).filter(Boolean);
      const key = heads.sort((p, q) => heads.filter((h) => h === q).length - heads.filter((h) => h === p).length)[0] || m.name;
      if (!groups.has(key)) groups.set(key, { key, names: [], uses: [], vars: [] });
      const g = groups.get(key);
      g.names.push(m.name);
      m.uses.forEach((u) => { if (!g.uses.includes(u)) g.uses.push(u); });
      (m.vars || []).forEach((v) => { if (!g.vars.includes(v)) g.vars.push(v); });
    });
    // Kachel zuerst, Popup dahinter.
    groups.forEach((g) => g.names.sort((p, q) => (p === g.key ? -1 : q === g.key ? 1 : isPopup(p) - isPopup(q))));
    return { modified, unchanged, structural, groups: [...groups.values()] };
  }

  // „Meine Fassung behalten“: Die Vorlagen der Gruppe werden eine eigene Kachelart own_<name>
  // (wie „Eigene Kachelart“, casora-panel-kachelart.js) – nie unter casora_*, sonst stünden sie
  // Casoras Updates im Weg. Die Kachel trägt variables.casora_tile {label, base, copy, kept}, ihr
  // Popup (und weitere Popup-Vorlagen ihrer Kette) heißt ebenfalls own_…, Verweise darin folgen.
  // Kacheln zeigen danach auf own_<name>; casora_<name> bekommt wieder Casoras Fassung.
  // in: g (Gruppe), defs (Vorlagen des Dashboards, umbenannt), taken (vergebene Namen), label
  // out: { map {casora_x: own_x}, templates {own_x: Vorlage}, head }
  function ownPlan(g, defs, taken, label) {
    const head = g.key;
    const names = [head].concat(g.names).concat(chainOf([head], defs).filter((n) => isPopup(n) && !isBase(n)))
      .filter((n, i, all) => typeof n === "string" && defs[n] && all.indexOf(n) === i);
    const used = new Set(Object.keys(taken || {}));
    const map = {};
    names.forEach((n) => {
      const root = "own_" + n.replace(/^[a-z0-9]+_/, "");
      let x = root, k = 2;
      while (used.has(x)) x = root + "_" + k++;
      used.add(x);
      map[n] = x;
    });
    const templates = {};
    names.forEach((n) => {
      const def = renameRefs(JSON.parse(JSON.stringify(defs[n])), map);
      if (n === head) {
        def.variables = Object.assign({}, def.variables || {}, {
          casora_tile: { label: String(label || head), base: head, wishes: [], copy: true, kept: true } });
      }
      templates[map[n]] = def;
    });
    return { map, templates, head };
  }
  // Verweise auf umbenannte Vorlagen: „template:“-Einträge und im JavaScript als 'name' bzw. "name".
  function renameRefs(x, map) {
    const keys = Object.keys(map);
    if (!keys.length) return x;
    const re = new RegExp("(['\"])(" + keys.map(esc).join("|") + ")\\1", "g");
    const walk = (o) => {
      if (Array.isArray(o)) return o.map(walk);
      if (typeof o === "string") return o.indexOf("[[[") >= 0 ? o.replace(re, (m, q, n) => q + map[n] + q) : o;
      if (!o || typeof o !== "object") return o;
      const out = {};
      Object.keys(o).forEach((k) => {
        if (k === "template") out[k] = Array.isArray(o[k]) ? o[k].map((n) => map[n] || walk(n)) : (map[o[k]] || walk(o[k]));
        else out[k] = walk(o[k]);
      });
      return out;
    };
    return walk(x);
  }
  // Karten in den Ansichten (Desktop/Handy) auf die eigene Kachelart stellen. Die Vorlagen des
  // Dashboards (button_card_templates) bleiben außen vor. Liefert die Zahl umgestellter Karten.
  function retarget(cfg, map) {
    let n = 0;
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if (typeof o.template === "string" && map[o.template]) { o.template = map[o.template]; n++; }
      else if (Array.isArray(o.template) && o.template.some((t) => map[t])) { o.template = o.template.map((t) => map[t] || t); n++; }
      Object.keys(o).forEach((k) => { if (k !== "button_card_templates") walk(o[k]); });
    };
    walk(cfg && cfg.views);
    return n;
  }

  // Eigene Module des Nutzers (Lovelace-Ressourcen): /local/hemma-local/…, Hemmas Skript-Ordner ohne
  // Hemmas eigene Dateien, sonst JavaScript unter /local/hemma…/ (wie hemma_cleanup.is_own_module).
  const HEMMA_SCRIPTS = new Set(["hemma-core.js", "hemma-i18n.js", "hemma-icons.js", "hemma-redirect.js", "hemma-swipe-card.js",
    "hemma-smart-row.js", "hemma-local.js", "hemma-kompat.js", "hemma-notify-local.js", "casora-local.js", "layout-card-modified.js",
    "layout-offsets.js", "smart-row.js", "swipe-card-patch.js", "filter-overlay.js", "navbar-popup-caret.js", "navbar-scroll.js",
    "navbar-sidebar-offset.js"]);
  function isOwnModule(url) {
    const p = String(url || "").split("?")[0].split("#")[0];
    if (/^\/(local\/)?hemma[-_]local\//.test(p)) return true;
    for (const base of ["/hemma_scripts/", "/local/hemma/scripts/"]) {
      if (p.indexOf(base) === 0) { const rest = p.slice(base.length); return !!rest && rest.indexOf("/") < 0 && !HEMMA_SCRIPTS.has(rest); }
    }
    if (p.indexOf("/local/hemma/fonts/") === 0) return false;
    return /^\/local\/hemma[^/]*\/.+\.m?js$/i.test(p);
  }

  // Was beim Umzug passiert – ohne etwas zu verändern.
  // bundle: Casoras Vorlagen (panel._bundleOnce()). Gefragt wird nur bei Kachel-Vorlagen,
  // die es in Casora gibt; das Grundgerüst (Raumkarte, Basis) kommt immer von Casora.
  async function analyze(c, bundle, hass) {
    const shipped = (bundle && bundle.templates) || {};
    const O = await loadOriginals();
    const rename = window.casoraRename || ((x) => x);
    const pre = c.prefix || "hemma";
    const cfg = rename(JSON.parse(JSON.stringify(c.raw)), pre);
    const mobile = c.rawMobile ? rename(JSON.parse(JSON.stringify(c.rawMobile)), pre) : null;
    const L = window.casoraLegacy;
    const legacy = !!(L && L.detect(cfg));
    let rooms;
    if (legacy) rooms = L.read(cfg, hass).map((r) => ({ name: r.name, image: r.image, tiles: r.tiles }));
    else rooms = ((I().extractAny(cfg).compact || {}).rooms || []).map((r) => ({ name: r.name || r.path, image: (r.variables || {}).image, tiles: r.tiles || [] }));
    const tiles = [].concat(...rooms.map((r) => r.tiles.map((t) => ({ room: r, tile: t }))));
    // Versteckte Casora-Typen (Schloss-/Jalousiegruppe) zählen als bekannt; eigene Karten
    // (casora_custom) bleiben eigene.
    const known = (t) => { const ty = L && L.typeOf(t.template); return !!ty && ty.id !== "custom"; };
    const own = tiles.filter((x) => !known(x.tile));

    const rawTpl = c.raw.button_card_templates || {};
    const rawFp = c.raw[pre + "_template_fingerprint"] || c.raw.hemma_template_fingerprint || c.raw.casora_template_fingerprint || {};
    const fields = (head) => {
      const ty = I().findType && I().findType(I().TILE_TYPES || [], head);
      return new Set(((ty && ty.fields) || []).map((f) => f && f.key).filter(Boolean));
    };
    const res = classify({ rawTpl, defs: cfg.button_card_templates || {}, tiles, shipped, O, rawFp, pre, fields,
      print: (def) => print(pre === "hemma" ? def : asHemma(def, pre)) });
    // Eigene Module (Ressourcen) und Pfade, in die Automationen schreiben – beides bleibt, wie es ist.
    let ownModules = [], writeKept = [];
    try { ownModules = ((await hass.callWS({ type: "lovelace/resources" })) || []).map((x) => String(x.url || "")).filter(isOwnModule); } catch (e) { ownModules = []; }
    try { writeKept = (((await hass.callWS({ type: "casora/hemma/status" })) || {}).files || {}).write_targets || []; } catch (e) { writeKept = []; }
    return { c, cfg, mobile, legacy, rooms, tiles, own, ...res, ownModules, writeKept };
  }

  // JavaScript in [[[ ]]] einer Vorlage übersetzen lassen, ohne es auszuführen: Fehler → Fundstelle.
  function brokenJs(tpl) {
    let bad = null;
    (function walk(x, path) {
      if (bad) return;
      if (typeof x === "string") {
        const m = x.match(/^\s*\[\[\[([\s\S]*)\]\]\]\s*$/);
        if (m) { try { new Function("states", "entity", "user", "hass", "variables", "html", "helpers", m[1]); } catch (e) { bad = path || "template"; } }
      } else if (x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k], path ? path + "." + k : k));
    })(tpl, "");
    return bad;
  }

  const tr = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
  // Raumnamen so, wie der Umzug sie anlegt (_import / _casoraLegacyBuild übersetzen Hemmas Beispielnamen).
  const roomName = (n) => (typeof n === "string" && n && n.indexOf("[[[") < 0 ? tr(n) : n);

  function friendlyName(m) {
    const types = I().TILE_TYPES || [];
    const t = I().findType(types, m.name);
    if (t && t.label) return t.label;
    return m.name.replace(/^casora_/, "").replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
  }

  // Aussehen von Auswahl und Vergleich (auch für den Vergleich vom Fertig-Bildschirm aus).
  function chooseCss(root) {
    if (!root.getElementById("casora-choose-css")) {
      const st = document.createElement("style");
      st.id = "casora-choose-css";
      st.textContent = ".flowin.casora-uwide.casora-cwide{max-width:1180px}"
        + ".cu-h{font-size:var(--t-body);font-weight:600;letter-spacing:-.015em;color:var(--ink)}"
        + ".cc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 4px 12px}"
        + ".cc-head .cu-h{margin:0}"
        + ".cc-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--casora-studio-chip-hi, rgba(118,118,128,.24))}"
        + ".cc-seg button{appearance:none;border:0;cursor:pointer;white-space:nowrap;padding:6px 14px;border-radius:999px;font:500 var(--t-foot) system-ui;background:none;color:var(--ink-2)}"
        + ".cc-seg button.on{background:rgba(255,255,255,.92);color:#111;box-shadow:0 1px 4px rgba(0,0,0,.25)}"
        + ".cc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}"
        + ".cc-card{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:var(--r-l);text-align:left;"
        + "background:var(--casora-popup-row-fill,rgba(255,255,255,.08))}"
        + ".cc-top{display:flex;align-items:center;gap:12px;min-width:0}"
        + ".cc-ic{flex:0 0 40px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center}"
        + ".cc-ic i{width:22px;height:22px;background:#fff;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}"
        + ".cc-tx{flex:1 1 auto;min-width:0}.cc-tx b{display:block;font-size:var(--t-callout);font-weight:600;letter-spacing:-.01em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        + ".cc-tx>span{display:block;font-size:var(--t-foot);color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        + ".cc-card .cc-seg{display:flex}.cc-card .cc-seg button{flex:1 1 0}.cc-seg button[hidden]{display:none}"
        + ".cc-seg button.cc-seg-ai{display:inline-flex;align-items:center;justify-content:center;gap:5px;color:#c77dff}"
        + ".cc-seg button.cc-seg-ai svg{width:13px;height:13px;fill:currentColor;flex:none}"
        + ".cc-seg button.cc-seg-ai.on{background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff));color:#fff}"
        + ".cc-seg button.cc-seg-ai:disabled{color:var(--ink-3,rgba(255,255,255,.35));cursor:not-allowed;filter:none}"
        + ".cc-seg button.cc-seg-ai.busy{color:#fff;cursor:progress;background:var(--casora-studio-ai-shimmer, linear-gradient(100deg,#bf5af2 20%,#e3a6ff 50%,#7d5cff 80%)) 0 0/250% 100%;animation:ccaibusy 1.4s linear infinite}"
        + "@keyframes ccaibusy{to{background-position:-250% 0}}"
        + ".cc-note{margin:-2px 4px 0;font-size:var(--t-caption);line-height:1.4;color:#c77dff}.cc-note.err{color:#ff6961}.cc-note[hidden]{display:none}"
        + ".cc-lock{margin-top:4px}"
        + ".cc-prog{margin:-4px 4px 12px;font:500 var(--t-foot) system-ui;color:#c77dff;text-align:right}.cc-prog[hidden]{display:none}"
        + ".cc-tx>span span{display:inline}"
        + ".cc-cmp{appearance:none;border:0;background:none;padding:0 0 0 8px;margin-left:auto;flex:none;align-self:center;cursor:pointer;font:500 var(--t-foot) system-ui;color:var(--casora-studio-link, #0a84ff);white-space:nowrap}"
        + ".cc-sh-foot{display:flex;justify-content:flex-end;margin-top:14px}"
        + ".cc-apply{appearance:none;border:0;cursor:pointer;padding:11px 26px;border-radius:999px;font:600 var(--t-callout) system-ui;background:var(--casora-studio-done, #0a84ff);color:#fff}"
        + ".cc-apply:hover{filter:brightness(1.08)}"
        + ".cc-sh-foot{gap:10px;align-items:center}"
        + ".cc-ai{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:999px;"
        + "font:600 var(--t-callout) system-ui;color:#fff;background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff));box-shadow:0 4px 18px rgba(191,90,242,.35)}"
        + ".cc-ai svg{width:17px;height:17px;fill:currentColor}.cc-ai:hover{filter:brightness(1.08)}"
        + ".cc-ai.busy{cursor:progress;background:var(--casora-studio-ai-shimmer, linear-gradient(100deg,#bf5af2 20%,#e3a6ff 50%,#7d5cff 80%)) 0 0/250% 100%;animation:ccaibusy 1.4s linear infinite}"
        + ".cc-ai.busy svg{animation:ccaispin 1.6s ease-in-out infinite}"
        + "@keyframes ccaibusy{to{background-position:-250% 0}}@keyframes ccaispin{50%{transform:scale(.8) rotate(90deg)}}"
        + ".cc-ai.locked{background:var(--casora-studio-chip-hi, rgba(118,118,128,.28));color:var(--ink-3,rgba(255,255,255,.45));box-shadow:none;cursor:not-allowed;filter:none}"
        + ".cc-aiwho{margin-right:auto;font:500 var(--t-foot) system-ui;color:var(--casora-studio-ai, #bf5af2)}.cc-aiwho[hidden]{display:none}"
        + ".cc-ailock{margin:10px 4px 0;font-size:var(--t-foot);color:var(--ink-3,rgba(255,255,255,.5));text-align:right}"
        + ".cc-ai[hidden]{display:none}.cc-col:nth-child(3) .cc-cap,.cc-col:nth-child(3).on .cc-cap{color:var(--casora-studio-ai, #bf5af2)}.cc-col:nth-child(3).on .cc-stage,.cc-col:nth-child(3).on .cc-pop{box-shadow:0 0 0 3px #bf5af2}"
        + ".cc-tile{width:min(290px,100%)}"
        + ".cc-stage.cc-wait{background:var(--casora-studio-chip, rgba(118,118,128,.14));color:var(--ink-2);font:500 var(--t-foot)/1.45 system-ui;text-align:center;padding:24px 28px;"
        + "box-shadow:inset 0 0 0 1.5px rgba(191,90,242,.35)}"
        + ".cc-seg button.cc-seg-ai.covered{text-decoration:line-through;text-decoration-thickness:1px}"
        + ".cc-ov{position:fixed;inset:0;left:var(--vpl,0px);z-index:400;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.45);"
        + "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:ccin .2s ease both}.cc-ov.out{opacity:0;transition:opacity .2s}"
        + "@keyframes ccin{from{opacity:0}to{opacity:1}}"
        + ".cc-sheet{width:min(820px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:var(--r-xl);padding:18px 20px 20px;"
        + "background:var(--casora-dialog-bg,rgba(20,20,24,.92));backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);box-shadow:0 30px 80px rgba(0,0,0,.5)}"
        + ".cc-sh-top{display:flex;align-items:center;justify-content:space-between;margin:0 2px 14px}.cc-sh-top b{font-size:var(--t-body);font-weight:700;letter-spacing:-.02em;color:var(--ink)}"
        + ".cc-x{appearance:none;border:0 !important;flex:0 0 32px;width:32px !important;height:32px !important;min-width:0 !important;padding:0 !important;margin:0 !important;"
        + "border-radius:50% !important;background:rgba(255,255,255,.12) !important;box-shadow:none !important;display:grid !important;place-items:center;cursor:pointer;color:var(--ink)}"
        + ".cc-x:hover{background:rgba(255,255,255,.2) !important;filter:none}"
        + ".cc-x svg{width:18px;height:18px;fill:currentColor}"
        + ".cc-pair{display:grid;grid-template-columns:repeat(var(--cc-n,2),minmax(0,1fr));gap:12px}"
        + ".cc-stage[hidden],.cc-pop[hidden]{display:none !important}.cc-col{min-width:0}"
        + ".cc-col{appearance:none;border:0;padding:0;background:none;cursor:default;display:flex;flex-direction:column;gap:8px;color:inherit}"
        + ".cc-stage{display:grid;place-items:center;min-height:250px;padding:24px 14px;border-radius:var(--r-l);background:#1c1d22 center/cover no-repeat;"
        + "box-shadow:0 0 0 2px transparent;transition:box-shadow .2s}"
        + ".cc-col.on .cc-stage{box-shadow:0 0 0 3px var(--casora-studio-done, #0a84ff)}"
        // Kein Filter auf der Spalte: Safari schneidet sonst den Rahmen samt Kachel-Blur ab.
        + ".cc-col:hover:not(:disabled){filter:none}.cc-col:hover:not(.on) .cc-stage{box-shadow:0 0 0 2px rgba(255,255,255,.28)}"
        + ".cc-tile{width:290px;max-width:100%;pointer-events:none;--casora-entity-height-current:200px}"
        + ".cc-cap{font:600 var(--t-callout) system-ui;color:var(--ink);text-align:center}.cc-col.on .cc-cap{color:var(--casora-studio-link, #0a84ff)}"
        + ".cc-hint{margin:12px 4px 0;font-size:var(--t-foot);color:var(--ink-3,rgba(255,255,255,.5));text-align:center}"
        + "@media (max-width:700px){.cc-pair{grid-template-columns:minmax(0,1fr)}.cc-stage{min-height:0;padding:16px}.cc-tile{width:260px}}"
        + ".cc-mode{margin:0 12px 0 auto}.cc-mode button{padding:5px 14px;transition:background .25s ease,color .25s ease}"
        + ".cc-mode button.on{background:var(--cc-accent,var(--casora-studio-done, #0a84ff))!important;color:var(--cc-accent-ink,#fff)!important;box-shadow:0 1px 6px rgba(0,0,0,.3)}"
        + ".cc-mode button.cc-hintme:not(.on){animation:cchint 1.1s ease 3}"
        + "@keyframes cchint{0%,100%{background:transparent;color:var(--ink-2)}50%{background:color-mix(in srgb,var(--cc-accent,var(--casora-studio-done, #0a84ff)) 55%,transparent);color:#fff}}"
        + "@keyframes ccpulse{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--cc-accent,var(--casora-studio-done, #0a84ff)) 45%,transparent)}}"
        + ".cc-sheet.wide{width:min(1180px,100%)}.cc-sheet{max-width:100%;box-sizing:border-box}"
        + ".cc-pop{height:min(560px,62vh);overflow:auto;border-radius:var(--r-l);background:var(--casora-dialog-bg,rgba(10,10,14,.6));"
        + "box-shadow:inset 0 0 0 .5px rgba(255,255,255,.12);text-align:left;scrollbar-width:thin}"
        + ".cc-col.on .cc-pop{box-shadow:0 0 0 3px var(--casora-studio-done, #0a84ff)}"
        + ".cc-pop.empty{display:grid;place-items:center;color:var(--ink-3,rgba(255,255,255,.5));font:500 var(--t-foot) system-ui}"
        + ".cc-pop-in{zoom:.78;padding:14px 4px}.cc-pop-t{display:block;margin:4px 22px 10px;font:700 var(--t-title) system-ui;color:var(--ink)}"
        + ".cc-foot{margin:14px 4px 0;font-size:var(--t-foot);line-height:1.45;color:var(--ink-3,rgba(255,255,255,.5));text-align:center}"
        // Ein Satz unter dem Umschalter: was die gewählte Fassung bedeutet.
        + ".cc-why{margin:-4px 4px 0;font-size:var(--t-foot);line-height:1.4;color:var(--ink-2)}.cc-why[hidden]{display:none}"
        + ".cc-seg button .cc-cost{font-weight:400;opacity:.85}"
        // Hell: Blatt und Bedienung hell; Kachel- und Popup-Vorschau zeigen das (dunkle) Dashboard.
        + ":host(.is-light) .cc-seg{background:var(--casora-studio-chip, rgba(118,118,128,.12))}"
        + ":host(.is-light) .cc-seg button.on{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.14)}"
        + ":host(.is-light) .cc-seg button.cc-seg-ai,:host(.is-light) .cc-note,:host(.is-light) .cc-prog,:host(.is-light) .cc-aiwho{color:var(--casora-studio-ai, #8944ab)}"
        + ":host(.is-light) .cc-note.err{color:var(--casora-studio-bad, #d70015)}"
        + ":host(.is-light) .cc-cmp,:host(.is-light) .cc-col.on .cc-cap{color:var(--casora-studio-link, #0071e3)}"
        + ":host(.is-light) .cc-ov{background:rgba(0,0,0,.22)}"
        + ":host(.is-light) .cc-sheet{background:var(--casora-studio-psheet-pane, rgba(242,242,247,.94));box-shadow:0 30px 80px rgba(0,0,0,.22)}"
        + ":host(.is-light) .cc-x{background:var(--casora-studio-chip, rgba(118,118,128,.14)) !important}:host(.is-light) .cc-x:hover{background:var(--casora-studio-chip-hi, rgba(118,118,128,.24)) !important}"
        + ":host(.is-light) .cc-col:hover:not(.on) .cc-stage{box-shadow:0 0 0 2px rgba(0,0,0,.2)}"
        + ":host(.is-light) :is(.cc-pop,.cc-stage){--ink:#fff;--ink-2:rgba(255,255,255,.7);--ink-3:rgba(255,255,255,.46)}";
      root.appendChild(st);
    }
  }

  window.casoraUmzug = { candidates, analyze, loadOriginals, spreadWeather, sourceName, proposeTitle, movedAny: (h, d) => movedAny(h, d),
    lib: { classify, foreignVars, chainOf, ownPlan, renameRefs, retarget, isOwnModule } };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._casoraUmzug) return;

    // Schritt 1: Übersicht. o.list = Kandidaten (sonst selbst suchen).
    P._casoraUmzug = async function (o) {
      o = o || {};
      this._casoraUmzugShown = true;
      const list = o.list || await candidates(this, { includeDone: true });
      if (!list.length) {
        const s = this._flowScreen({ icon: "import", title: "No Hemma Dashboard Found",
          lede: "Casora didn't find a Hemma dashboard to move. You can build a new one from your rooms instead.", back: o.back });
        brokenNotes(s.body, list.broken, "cu-broken");
        this._flowCancel(s.acts);
        this._flowButton(s.acts, "Create Dashboard", () => this._createForm());
        return;
      }
      const pick = o.pick || list[0];
      const a = await analyze(pick, await this._bundleOnce(), this._hass);
      if (!this.shadowRoot.getElementById("casora-umzug-css")) {
        const st = document.createElement("style");
        st.id = "casora-umzug-css";
        st.textContent = ".casora-uchoice{display:flex;gap:6px;flex:1 1 100%;margin-top:2px}"
          + ".casora-uchoice button{flex:1 1 0;border:none;border-radius:var(--r-s);padding:8px 10px;cursor:pointer;"
          + "font:500 var(--t-foot) system-ui;background:var(--casora-studio-chip-hi, rgba(118,118,128,.22));color:inherit}"
          + ".casora-uchoice button.on{background:var(--casora-studio-done, #0a84ff);color:#fff}"
          + ".frow.casora-urow{flex-wrap:wrap;row-gap:8px}"
          // Übersicht: Umschalter, Kennzahlen, Räume als Fotos, dann was passiert – klar getrennt.
          + ".flowin.casora-uwide{max-width:880px}"
          + ".cu-seg{display:flex;justify-content:center;margin:-8px 0 22px}"
          + ".cu-seg>div{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--casora-studio-chip-hi, rgba(118,118,128,.24));max-width:100%;overflow-x:auto;scrollbar-width:none}"
          + ".cu-seg button{appearance:none;border:0;cursor:pointer;white-space:nowrap;padding:7px 16px;border-radius:999px;"
          + "font:500 var(--t-foot) system-ui;background:none;color:var(--ink-2)}"
          + ".cu-src{margin:-10px 0 20px;text-align:center;font-size:var(--t-foot);color:var(--ink-2)}.cu-src b{font-weight:600;color:var(--ink)}"
          + ".cu-seg button.on{background:rgba(255,255,255,.92);color:#111;box-shadow:0 1px 4px rgba(0,0,0,.25)}"
          + ":host(.is-light) .cu-seg>div{background:var(--casora-studio-chip, rgba(118,118,128,.12))}:host(.is-light) .cu-seg button.on{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.14)}"
          + ".cu-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 20px}"
          + ".cu-stat{display:flex;align-items:baseline;justify-content:center;gap:8px;padding:12px 10px;border-radius:var(--r-l);background:var(--casora-popup-row-fill,rgba(255,255,255,.08))}"
          + ".cu-stat b{font-size:var(--t-title);font-weight:700;letter-spacing:-.03em;line-height:1;color:var(--ink)}"
          + ".cu-stat span{font-size:var(--t-foot);color:var(--ink-2)}"
          + ".cu-h{margin:0 4px 10px;font-size:var(--t-body);font-weight:600;letter-spacing:-.015em;color:var(--ink)}"
          + ".cu-rooms{display:grid;grid-auto-flow:column;grid-auto-columns:168px;gap:10px;margin:0 0 18px;padding:0 0 4px;"
          + "overflow-x:auto;scrollbar-width:none}"
          + ".cu-rooms.more-r{-webkit-mask-image:linear-gradient(to right,#000 88%,transparent);mask-image:linear-gradient(to right,#000 88%,transparent)}"
          + ".cu-rooms.more-l.more-r{-webkit-mask-image:linear-gradient(to right,transparent,#000 6%,#000 88%,transparent);mask-image:linear-gradient(to right,transparent,#000 6%,#000 88%,transparent)}"
          + ".cu-rooms.more-l:not(.more-r){-webkit-mask-image:linear-gradient(to right,transparent,#000 6%);mask-image:linear-gradient(to right,transparent,#000 6%)}"
          + ".cu-rooms::-webkit-scrollbar{display:none}"
          + ".cu-room{position:relative;aspect-ratio:4/3;border-radius:var(--r-l);overflow:hidden;background:#1c1d22 center/cover no-repeat;"
          + "box-shadow:inset 0 0 0 .5px rgba(255,255,255,.12)}"
          + ".cu-room::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 35%,rgba(0,0,0,.62))}"
          + ".cu-room div{position:absolute;left:12px;right:12px;bottom:10px;z-index:1;color:#fff;text-align:left}"
          + ".cu-room b{display:block;font-size:var(--t-callout);font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
          + ".cu-room span{display:block;font-size:var(--t-foot);opacity:.78}"
          + ".cu-list{display:grid;grid-template-columns:1fr;gap:10px 28px;padding:16px 20px;border-radius:var(--r-l);"
          + "background:var(--casora-popup-row-fill,rgba(255,255,255,.08));text-align:left}"
          + "@media (min-width:760px){.cu-list{grid-template-columns:1fr 1fr}}"
          + ".cu-item{display:flex;gap:11px;align-items:flex-start;font-size:var(--t-callout);line-height:1.4;color:var(--ink)}"
          + ".cu-item i{flex:0 0 20px;height:20px;border-radius:50%;background:var(--casora-color-green, #30d158);display:grid;place-items:center;margin-top:1px}"
          + ".cu-item i svg{width:12px;height:12px;color:#fff}"
          + ".frow.wrap2.cu-ainote .rtext span{white-space:pre-line}"
          + ".frow.cu-hideold .rtext b{white-space:normal;line-height:1.3}"
          // Fertig-Bildschirm nach dem Umzug: Zusammenfassung oben, Vorschau darunter etwas kleiner.
          + ".dn-stage.cu-small{max-width:min(72%,560px);margin:18px auto 0}"
          + ".fgroup.cu-donetop{text-align:left}"
          + ".casora-uwide .ficon{width:60px;height:60px;border-radius:var(--r-m);margin-bottom:14px}.casora-uwide .ficon svg{width:34px;height:34px}"
          + ".casora-uwide .fbody{margin-top:22px}"
          + ".casora-uwide .fgroup.cu-name{margin-top:22px;text-align:left}"
          + ".casora-uwide .fgroup.cu-name.cu-name-top{margin:0 0 22px}"
          + "@media (max-height:860px) and (min-width:561px){.casora-uwide .ficon{display:none}}"
          + "@media (max-width:560px){.cu-stat{flex-direction:column;align-items:center;gap:2px}.cu-stat b{font-size:var(--t-title)}.cu-rooms{grid-auto-columns:150px}}";
        this.shadowRoot.appendChild(st);
      }
      const tileCount = a.tiles.length;
      const s = this._flowScreen({
        icon: "import",
        title: "Move to Casora",
        lede: list.length > 1
          ? "Casora found " + list.length + " Hemma dashboards. Choose the one to move – it comes across in one step, "
            + "and the original stays exactly as it is."
          : pick.done
            ? tr("“{1}” was already moved to Casora. Move it again to get a second Casora dashboard – "
              + "your Hemma dashboard stays exactly as it is.").replace("{1}", pick.title)
            : "Casora found your dashboard “" + pick.title + "”. Everything moves across in one step – "
              + "your Hemma dashboard stays exactly as it is.",
        back: o.back,
      });
      // Schon übersetzt (mit Dashboard-Namen) – nicht noch einmal durch den Übersetzer.
      const ledeEl = pick.done && list.length === 1 && s.box.querySelector(".flede");
      if (ledeEl) ledeEl.setAttribute("data-no-i18n", "");
      s.box.classList.add("casora-uwide");
      const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };

      // Welches Dashboard – als Umschalter, nur wenn es mehrere gibt.
      if (list.length > 1) {
        const seg = el("div", "cu-seg", s.body), wrap = el("div", "", seg);
        list.forEach((c) => {
          const b = el("button", c === pick ? "on" : "", wrap, c.done ? c.title + " · " + tr("Already Moved") : c.title);
          b.type = "button"; b.setAttribute("data-no-i18n", "");
          b.onclick = () => { if (c !== pick) this._casoraUmzug({ ...o, list, pick: c, quiet: true }); };
        });
      }
      // Welches Dashboard gerade gewählt ist – deutlich, mit Art und Adresse.
      const src = el("div", "cu-src", s.body);
      src.setAttribute("data-no-i18n", "");
      el("b", "", src, pick.title);
      // Umbenannte Kopie: „Hemma 1 · unter dem Namen „zuhaus““.
      const alias = pick.prefix && pick.prefix !== "hemma" ? " · " + tr("under the name “{1}”").replace("{1}", pick.prefix) : "";
      el("span", "", src, " · " + (a.legacy ? "Hemma 1" : "Hemma 2") + alias + " · "
        + (pick.mode === "storage" ? tr("Saved in Home Assistant") : "YAML") + " · /" + pick.url_path);
      // Unlesbare Hemma-Dashboards: genannt, aber nicht wählbar.
      brokenNotes(s.body, list.broken, "cu-broken cu-broken-top");

      // Kennzahlen. Karten, die nicht von Hemma stammen, nur zählen, wenn es welche gibt.
      const stats = el("div", "cu-stats", s.body);
      const figures = [[a.rooms.length, a.rooms.length === 1 ? "Room" : "Rooms"], [tileCount, tileCount === 1 ? "Tile" : "Tiles"]];
      if (a.own.length) figures.push([a.own.length, a.own.length === 1 ? "Card from another source" : "Cards from other sources"]);
      stats.style.gridTemplateColumns = "repeat(" + figures.length + ",1fr)";
      figures.forEach(([n, label]) => {
        const st = el("div", "cu-stat", stats); el("b", "", st, String(n)); el("span", "", st, label);
      });

      // Ohne Rückfrage zu angepassten Kacheln ist das der letzte Schritt: den Namen gleich hier
      // wählen – oben, damit er ohne Scrollen zu sehen ist.
      if (!a.groups.length) this._casoraUmzugName(s.body, a, true);

      // Räume als Fotos – das eigene Zuhause sehen statt eine Liste lesen.
      el("div", "cu-h", s.body, "Your Rooms");
      const grid = el("div", "cu-rooms", s.body);
      const sync = () => {
        const max = grid.scrollWidth - grid.clientWidth, over = max > 2;
        grid.classList.toggle("more-l", over && grid.scrollLeft > 2);
        grid.classList.toggle("more-r", over && grid.scrollLeft < max - 2);
      };
      grid.addEventListener("scroll", sync, { passive: true });
      const imgs = await this._images().catch(() => []);
      const dark = !(this._hass && this._hass.themes && this._hass.themes.darkMode === false);
      const photo = (r) => {
        const name = r.image || I().roomPhoto(r.name, I().slug(r.name), imgs);
        const hit = imgs.find((x) => x.name === name) || imgs.find((x) => x.name === I().roomPhoto(r.name, I().slug(r.name), imgs));
        return hit ? ((dark && hit.night) || hit.day) : null;
      };
      a.rooms.forEach((r) => {
        const t = el("div", "cu-room", grid), url = photo(r);
        if (url) t.style.backgroundImage = "url('" + url + "')";
        const d = el("div", "", t);
        // Wie beim Umzug selbst: Hemmas englische Beispielnamen („Living Room“) auf Deutsch.
        // Die Übersicht mit Standardnamen heißt „Zuhause“/„Home“ nach HA-Sprache.
        const home = I().isHomeRoom(r, a.rooms) && I().isDefaultHomeName(r.name);
        el("b", "", d, home ? I().homeRoomWord(this._hass) : roomName(r.name)).setAttribute("data-no-i18n", "");
        const n = r.tiles.length; el("span", "", d, n + (n === 1 ? " tile" : " tiles"));
      });
      // Karussell: gleitet langsam hin und her, wenn nicht alle Räume passen. Anfassen hält es an.
      // Ohne Kopien der Karten – sonst stünden Räume doppelt da (ein Raum mehr als gezählt).
      requestAnimationFrame(() => {
        sync();
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce || grid.scrollWidth - grid.clientWidth <= 2) return;
        let last = 0, hold = performance.now() + 1500, pos = grid.scrollLeft, dir = 1;
        const stop = () => { hold = performance.now() + 2500; };
        ["pointerenter", "pointerdown", "touchstart", "wheel"].forEach((ev) => grid.addEventListener(ev, stop, { passive: true }));
        grid.addEventListener("pointerleave", () => { hold = performance.now() + 800; });
        grid.addEventListener("pointermove", stop, { passive: true });
        const tick = (now) => {
          if (!grid.isConnected) return;
          const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
          const max = grid.scrollWidth - grid.clientWidth;
          if (now < hold) pos = grid.scrollLeft;
          else {
            pos += dir * 25 * dt;
            // Am Ende kurz stehen bleiben, dann zurück.
            if (pos >= max) { pos = max; dir = -1; hold = now + 1500; }
            else if (pos <= 0) { pos = 0; dir = 1; hold = now + 1500; }
            grid.scrollLeft = pos;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      // Was passiert – kurz, mit Häkchen.
      el("div", "cu-h", s.body, "What happens");
      const lst = el("div", "cu-list", s.body);
      const ok = (text) => { const it = el("div", "cu-item", lst); const i = el("i", "", it); i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 12.5 4 4 9-9"/></svg>'; el("span", "", it, text); };
      if (a.own.length) ok(a.own.length === 1 ? "1 card from another source stays exactly as it is"
        : a.own.length + " cards from other sources stay exactly as they are");
      if (a.groups.length) ok(a.groups.length === 1 ? tr("You customized 1 kind of tile – you choose next what stays")
        : tr("You customized {1} kinds of tiles – you choose next what stays").replace("{1}", a.groups.length));
      // Nichts angepasst: dann gibt es auch nichts für die KI – das offen sagen, statt sie still auszulassen.
      else ok("No customized tiles – all tiles get Casora's current version");
      if (a.structural.length) ok("Rooms and navigation get Casora's design");
      ok(a.mobile ? "Your phone layout comes along" : "A phone layout is added");
      // Eigene Module (Ressourcen) laden weiter; Casoras Kacheln finden sie unter ihren alten Namen.
      if ((a.ownModules || []).length) {
        const names = a.ownModules.map((u) => u.split("?")[0].split("/").pop());
        ok(tr(names.length === 1 ? "Your own module {1} stays loaded" : "Your {2} own modules stay loaded: {1}")
          .replace("{1}", names.slice(0, 3).join(", ") + (names.length > 3 ? " …" : "")).replace("{2}", names.length));
      }
      // Ordner, in die eine Automation schreibt (Kamera-Standbilder …): Pfade bleiben.
      if ((a.writeKept || []).length) {
        ok(tr("Paths stay where an automation writes to them: {1}").replace("{1}", a.writeKept.map((x) => x.path).slice(0, 3).join(", ")));
      }
      // Was nach dem Umzug anders aussieht, ist gewollt – vorher sagen, damit es niemand für einen Fehler hält.
      ok("Names come in your language, badges are added, tiles sort by activity");
      ok("Your Hemma dashboard stays unchanged, with a backup");


      // Beim automatischen Angebot: gar nicht mehr fragen (für alle Geräte, in den Casora-Einstellungen).
      if (o.auto) {
        snooze();  // auch wer das Angebot einfach schließt, wird eine Woche nicht gefragt
        this._flowButton(s.acts, "Don't Ask Again", async () => {
          await offerOffForGood(this._hass);
          this._flowBack();
          this._status("Casora won't look for Hemma dashboards anymore – switch it back on under Personal.", "ok");
        }, true);
      }
      if (!o.hideNotNow) this._flowButton(s.acts, o.notNowLabel || "Not Now", () => {
        // Nur „Später“ merkt sich das: eine Woche Ruhe. „Neu beginnen“ im Erststart ist eine andere Entscheidung.
        if (!o.notNowLabel) snooze();
        if (o.notNow) o.notNow(); else this._flowBack();
      }, true);
      let moving = false;
      this._flowButton(s.acts, a.groups.length ? "Continue" : "Move to Casora", () => {
        if (a.groups.length) return this._casoraUmzugChoose(a, o);
        // Nur einmal: ein Doppelklick legte sonst zwei Dashboards an.
        if (moving) return;
        moving = true;
        return this._casoraUmzugRun(a, {});
      });
    };

    // Name des neuen Dashboards – vorgeschlagen ist der Titel des Hemma-Dashboards.
    // top: direkt unter den Kennzahlen (Übersicht), sonst am Ende des Schritts.
    P._casoraUmzugName = function (body, a, top) {
      if (!a.newTitle) a.newTitle = proposeTitle(this, a.c);
      const g = this._flowGroup(body, { header: "New Dashboard" });
      g.parentNode.classList.add("cu-name");
      if (top) g.parentNode.classList.add("cu-name-top");
      const inp = this._flowRow(g, { title: "Name", input: a.newTitle }).input;
      inp.addEventListener("input", () => { a.newTitle = inp.value; });
      return inp;
    };

    // Echte Kacheln im Studio: button-card und Casoras Skripte laden (wie ein Dashboard es tut)
    // und button-card die Vorlagen über ein unsichtbares Lovelace-Gegenstück (hc-main) finden lassen.
    P._casoraCardsReady = async function () {
      if (!customElements.get("button-card")) {
        let res = [];
        try { res = await this._hass.callWS({ type: "lovelace/resources" }); } catch (e) { res = []; }
        for (const r of res || []) {
          const url = String(r.url || "");
          if (!url) continue;
          try {
            if (r.type === "module") await import(url);
            else await new Promise((ok) => { const sc = document.createElement("script"); sc.src = url; sc.onload = sc.onerror = ok; document.head.appendChild(sc); });
          } catch (e) { /* eine fehlende Datei soll den Vergleich nicht verhindern */ }
        }
      }
      if (!customElements.get("button-card")) {
        await Promise.race([customElements.whenDefined("button-card"), new Promise((r) => setTimeout(r, 6000))]);
      }
      return !!customElements.get("button-card");
    };
    P._casoraCardsShim = function (templates) {
      let host = document.querySelector("hc-main[data-casora]");
      if (!host) {
        host = document.createElement("hc-main"); host.setAttribute("data-casora", ""); host.style.display = "none";
        const r1 = host.attachShadow({ mode: "open" }), ll = document.createElement("hc-lovelace");
        r1.appendChild(ll);
        const r2 = ll.attachShadow({ mode: "open" }), view = document.createElement("hui-view");
        r2.appendChild(view);
        document.body.appendChild(host);
      }
      const view = host.shadowRoot.querySelector("hc-lovelace").shadowRoot.querySelector("hui-view");
      // hui-view ist HAs eigenes Element: eine leere Ansicht, damit es beim Aufwerten nichts vermisst.
      const cfg = { button_card_templates: templates, views: [{ cards: [] }] };
      view.index = 0;
      view.hass = this._hass;
      view.lovelace = { config: cfg, rawConfig: cfg, editMode: false, mode: "storage", locale: this._hass && this._hass.locale };
    };

    // Kleiner Karten-Renderer für Popup-Inhalte (Stapel + eigene Karten), ohne HAs Kartenhelfer.
    function buildCard(cfg, hass) {
      if (!cfg || typeof cfg !== "object") return document.createElement("div");
      const t = String(cfg.type || "");
      if (t === "vertical-stack" || t === "horizontal-stack" || t === "grid") {
        const box = document.createElement("div");
        box.style.cssText = t === "vertical-stack" ? "display:flex;flex-direction:column;gap:8px"
          : t === "horizontal-stack" ? "display:flex;gap:8px"
          : "display:grid;gap:8px;grid-template-columns:repeat(" + (cfg.columns || 2) + ",minmax(0,1fr))";
        (cfg.cards || []).forEach((c) => { const k = buildCard(c, hass); if (t === "horizontal-stack") k.style.flex = "1 1 0"; box.appendChild(k); });
        return box;
      }
      const tag = t.indexOf("custom:") === 0 ? t.slice(7) : "hui-" + t + "-card";
      if (!customElements.get(tag)) { const d = document.createElement("div"); return d; }
      const el = document.createElement(tag);
      try { el.setConfig(cfg); el.hass = hass; } catch (e) { /* eine Karte weniger im Vergleich */ }
      return el;
    }

    // Vergleich: deine Fassung und Casoras nebeneinander, als echte Kachel mit einem deiner Geräte.
    // Nur zum Ansehen: deine Fassung, Casoras und – falls schon angepasst – die der KI. Gewählt wird auf der Karte.
    P._casoraUmzugCompare = async function (a, g, hue) {
      const root = this.shadowRoot;
      chooseCss(root);
      const ov = document.createElement("div");
      ov.className = "cc-ov";
      ov.innerHTML = '<div class="cc-sheet"><div class="cc-sh-top"><b></b><button type="button" class="cc-x" aria-label="Close">'
        + '<svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg></button></div>'
        + '<div class="cc-pair"></div><div class="cc-hint"></div></div>';
      root.appendChild(ov);
      const close = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 200); };
      ov.querySelector(".cc-x").onclick = close;
      ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
      ov.querySelector(".cc-sh-top b").textContent = friendlyName({ name: g.key });
      const pair = ov.querySelector(".cc-pair"), hint = ov.querySelector(".cc-hint");
      const modeSeg = document.createElement("div"); modeSeg.className = "cc-seg cc-mode";
      modeSeg.style.setProperty("--cc-accent", hue || "#0a84ff");
      modeSeg.style.setProperty("--cc-accent-ink", /yellow|^#FFCC00$/i.test(hue || "") ? "#1c1c1e" : "#fff");
      ov.querySelector(".cc-sh-top").insertBefore(modeSeg, ov.querySelector(".cc-x"));
      hint.textContent = "Loading tiles…";
      const ok = await this._casoraCardsReady();
      if (!ok) { hint.textContent = "The tiles can't be shown here – the button-card isn't installed."; return; }
      const bundle = await this._bundleOnce();
      const T = Object.assign({}, (bundle && bundle.templates) || {});
      const mine = new Set(g.names);
      a.modified.filter((m) => mine.has(m.name)).forEach((m) => { T[m.name + "__mine"] = m.def; });
      this._casoraCardsShim(T);
      const sample = (g.uses[0] || {}).tile || {};
      const tpl = (x) => (Array.isArray(x) ? x : x ? [x] : []);
      const photo = "/casora_assets/rooms/livingroom-demo" + ((this._hass.themes && this._hass.themes.darkMode === false) ? "" : "-night") + ".jpg";
      hint.textContent = sample.name ? "Shown with “" + sample.name + "” from your dashboard." : "";
      a.merged = a.merged || {};
      const cols = [];
      let mode = "tile";
      // Eine Spalte: Kachel auf dem Raumfoto, im Popup-Modus ihr Popup.
      const addCol = (label, cls, rename) => {
        const col = document.createElement("div");
        col.className = "cc-col " + cls;
        const stage = document.createElement("div"); stage.className = "cc-stage"; stage.style.backgroundImage = "url('" + photo + "')";
        const cfg = JSON.parse(JSON.stringify(sample));
        cfg.template = tpl(cfg.template).map((n) => (mine.has(n) ? rename(n) : n));
        const el = document.createElement("button-card");
        try { el.setConfig(cfg); el.hass = this._hass; } catch (e) { stage.textContent = String(e.message || e); }
        const wrap = document.createElement("div"); wrap.className = "cc-tile"; wrap.appendChild(el);
        stage.appendChild(wrap);
        const pop = document.createElement("div"); pop.className = "cc-pop"; pop.hidden = true;
        const cap = document.createElement("span"); cap.className = "cc-cap"; cap.textContent = label;
        col.append(stage, pop, cap);
        pair.appendChild(col); cols.push(col);
        pair.style.setProperty("--cc-n", cols.length);
      };
      // Popup je Spalte: die Kachel liefert ihre fertige Popup-Konfiguration (tap_action → casora_popup).
      const fillPopups = () => {
        cols.forEach((col) => {
          const pop = col.querySelector(".cc-pop"); if (pop._done) return; pop._done = true;
          const el = col.querySelector("button-card");
          let cfg = null;
          try { const r = el._evalActions(el._config, el._config.tap_action); cfg = r && r.tap_action && r.tap_action.casora_popup; } catch (e) { cfg = null; }
          if (!cfg || !cfg.content) { pop.textContent = "No popup"; pop.classList.add("empty"); return; }
          const inner = document.createElement("div"); inner.className = "cc-pop-in";
          if (cfg.title) { const h = document.createElement("b"); h.className = "cc-pop-t"; h.textContent = cfg.title; inner.appendChild(h); }
          inner.appendChild(buildCard(cfg.content, this._hass));
          pop.appendChild(inner);
        });
      };
      const setMode = (m) => {
        mode = m;
        modeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
        ov.querySelector(".cc-sheet").classList.toggle("wide", m === "popup" || cols.length > 2);
        cols.forEach((c) => { c.querySelector(".cc-stage").hidden = m === "popup"; c.querySelector(".cc-pop").hidden = m !== "popup"; });
        if (m === "popup") fillPopups();
      };
      addCol("Yours", "cc-mine", (n) => n + "__mine");
      addCol("Casora", "cc-casora", (n) => n);
      if (g.names.every((n) => a.merged[n])) {
        g.names.forEach((n) => { T[n + "__ai"] = a.merged[n]; });
        this._casoraCardsShim(T);
        addCol("With AI", "cc-withai", (n) => n + "__ai");
      } else {
        // Noch keine KI-Fassung: die Spalte trotzdem zeigen – mit einem Satz, wann sie entsteht.
        const col = document.createElement("div");
        col.className = "cc-col cc-withai cc-aiwait";
        const msg = tr(g._covered ? "Casora already contains your changes – no AI needed for this tile."
          : "The AI version is made when you choose AI on the card or move with AI selected.");
        const stage = document.createElement("div"); stage.className = "cc-stage cc-wait"; stage.textContent = msg;
        const pop = document.createElement("div"); pop.className = "cc-pop empty"; pop.hidden = true; pop._done = true; pop.textContent = msg;
        const cap = document.createElement("span"); cap.className = "cc-cap"; cap.textContent = tr("With AI");
        [stage, pop, cap].forEach((x) => x.setAttribute("data-no-i18n", ""));
        col.append(stage, pop, cap);
        pair.appendChild(col); cols.push(col);
        pair.style.setProperty("--cc-n", cols.length);
      }
      [["tile", "Tile"], ["popup", "Popup"]].forEach(([m, label]) => {
        const b = document.createElement("button"); b.type = "button"; b.dataset.m = m; b.textContent = label;
        b.onclick = () => setMode(m); modeSeg.appendChild(b);
      });
      setMode("tile");
      // Gleich aussehende Kacheln: dann steckt die Änderung im Popup oder im Verhalten – sagen statt rätseln lassen.
      setTimeout(() => {
        const html = [...pair.querySelectorAll("button-card")].slice(0, 2).map((c) => (c.shadowRoot ? c.shadowRoot.innerHTML.replace(/<!--[^]*?-->/g, "").replace(/\s+/g, " ") : ""));
        if (html.length === 2 && html[0] && html[0] === html[1]) {
          // Kein automatischer Wechsel: nur ein Hinweis und die Popup-Seite des Umschalters leuchtet kurz auf.
          hint.textContent = "Both tiles look the same – your changes are in the popup. Tap Popup to compare.";
          const pb = modeSeg.querySelector('[data-m="popup"]');
          if (pb) { pb.classList.remove("cc-hintme"); void pb.offsetWidth; pb.classList.add("cc-hintme"); }
        }
      }, 1500);
    };

    // Schritt 2 (nur wenn nötig): angepasste Vorlagen – eigene Fassung oder Casoras?
    P._casoraUmzugChoose = function (a, o) {
      // Vorauswahl: Casoras Fassung. KI kostet Geld – die wählt man bewusst (Preis steht dran).
      // Übergibt eine Kachel Variablen, die Casora nicht kennt (eigene Logik), ist „Meine“ vorgewählt –
      // mit Casoras Fassung ginge sie verloren.
      const keep = a.keep = a.keep || {};
      a.groups.forEach((g) => { if (!(g.key in keep)) keep[g.key] = (g.vars || []).length ? true : false; });
      const s = this._flowScreen({
        icon: "palette",
        title: "Some Tiles You've Customized",
        lede: "Keep your version, take Casora's new one – or let AI carry your changes into Casora's version.",
        back: () => this._casoraUmzug(o),
      });
      s.box.classList.add("casora-uwide", "casora-cwide");
      chooseCss(this.shadowRoot);
      const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
      // Symbol je Kacheltyp: aus der Typliste, sonst nach dem Namen.
      const ICON_BY = [[/cover|blind|jalou|shade|shutter/, "blinds-horizontal-open"], [/lock|schloss/, "lock"], [/purifier|air/, "purifier"],
        [/batter/, "battery"], [/camera|kamera/, "camera"], [/energy|energie|solar/, "energy"], [/light|licht|lamp/, "light"],
        [/media|player|tv/, "media"], [/thermostat|climate|heat|fbh/, "thermostat"], [/vacuum|sauger/, "vacuum"], [/plant|pflanz/, "plant"],
        [/wash/, "laundry-room"], [/dryer|trock/, "dryer"], [/dish/, "dishwasher"], [/printer|drucker/, "3D_Printer"], [/car|auto/, "car"],
        [/fan/, "fan"], [/scene/, "scenes"], [/trash|waste|abfall/, "trash"], [/network|wifi/, "network"], [/alarm/, "alarm"],
        [/door|contact/, "door-closed"], [/window/, "window-closed"], [/weather/, "sun"], [/calendar/, "calendar"], [/recipe/, "chef-hat"],
        [/update/, "updates"], [/aquarium|fish/, "fish"], [/presence|person/, "person"]];
      // Wie die Kachel aktiv aussieht: farbiger Kreis, weißes Symbol (Datei aus /casora_assets/icons).
      const ICON_FILES = new Set(["3D_Printer", "access_point", "alarm", "alarm-fill", "allergens", "allergens-fill", "apple", "apple-watch", "apple_tv", "aqi-high", "aqi-low", "aqi-medium", "arrow-down", "arrow-up", "assist", "assist-fill", "attention2", "backward", "bathroom", "battery", "bedroom", "bell", "bell-badge", "blinds-horizontal-closed", "blinds-horizontal-open", "blinds-vertical-closed", "blinds-vertical-open", "calendar", "calendar-day", "camera", "car", "car_side", "car_side_w2", "chair", "chef-hat", "clock", "close", "co2", "co2-fill", "console", "cooling", "cover_20", "cover_40", "cover_60", "cover_80", "cover_closed", "cover_closed1", "cover_open", "cover_open1", "curtain-closed", "curtain-open", "decrease", "default", "desktop", "dishwasher", "door-closed", "door-open", "doorbell", "dryer", "ebike", "electric", "energy", "exclamation", "fan", "favorites", "fish", "forward", "fridge", "gas", "heating", "heating_coil", "home", "homepod", "hot_water", "humidifier", "humidity", "increase", "ipad", "ipad-landscape", "iphone", "kitchen", "lamp", "laptop", "laundry-room", "light", "living-room", "lock", "lock-fill", "lock-open", "lock-open-fill", "lock-unlocking", "lock-unlocking-fill", "media", "menu", "mesh", "motion", "music", "mute", "network", "pause", "pc", "pendant-light", "pendent", "person", "plant", "play", "play-next", "plex", "plug", "power_off", "power_on", "ps5", "ps5_off", "purifier", "roller-shade-closed", "roller-shade-open", "roman-shade-closed", "roman-shade-open", "rooms", "scenes", "settings", "shield_alarm", "shield_bypass", "shield_check", "shield_lock", "shield_marked", "shield_moon", "shield_off", "shield_vacation", "skip_next", "skip_previous", "sony", "speaker", "stove", "stove-fill", "sun", "sync", "temp-high", "temp-low", "temp-medium", "thermostat", "trash", "tv", "tv-play", "unmute", "updates", "vacuum", "vacuum-charge", "vacuum-clean", "wifi", "wind", "window-closed", "window-open", "window-shade-closed", "window-shade-open"]);
      const iconFor = (key) => {
        const ty = I().findType(I().TILE_TYPES || [], key);
        if (ty && ty.icon && ICON_FILES.has(ty.icon)) return ty.icon;
        const hit = ICON_BY.find(([re]) => re.test(String(key).toLowerCase()));
        return hit && ICON_FILES.has(hit[1]) ? hit[1] : "home";
      };
      const syncs = [];
      const sync = () => syncs.forEach((f) => f());
      a.merged = a.merged || {};
      const merged = (g) => g.names.every((n) => a.merged[n]);
      // Schon in Casora: steht jede Einstellung deiner Fassung genauso in Casoras (Leerraum egal),
      // hat die KI nichts zu übertragen – dann weder anbieten noch berechnen.
      const norm = (x) => x.replace(/\s+/g, " ").trim();
      const within = (m, c) => {
        if (m === c) return true;
        if (typeof m === "string") return typeof c === "string" && norm(m) === norm(c);
        if (Array.isArray(m)) return Array.isArray(c) && m.every((x) => c.some((y) => within(x, y)));
        if (m && typeof m === "object") return !!c && typeof c === "object" && !Array.isArray(c) && Object.keys(m).every((k) => within(m[k], c[k]));
        return false;
      };
      const covered = (g) => !!g._covered;
      this._bundleOnce().then((b) => {
        const T = (b && b.templates) || {};
        a.groups.forEach((g) => {
          if (g._covered || merged(g)) return;
          g._covered = g.names.every((n) => { const m = a.modified.find((x) => x.name === n); return !!(m && T[n] && within(m.def, T[n])); });
          if (g._covered && keep[g.key] === "ai") keep[g.key] = false;
        });
        if (s.box.isConnected) { sync(); updatePrice(); }
      }).catch(() => {});
      const hasPopup = (g) => g.names.length > 1 && g.names.some((n) => /popup/.test(n));
      // KI: nur mit einem starken Modell (Casora nimmt die stärkste ausreichende) – sonst gesperrt.
      let best = null, busy = 0;
      const aiReady = this._hass.callWS({ type: "casora/ki/models" }).then((r) => { best = r && r.best; return r; }).catch(() => null);
      const errs = new Map();
      const durs = [];  // Dauer je Kacheltyp (ms) – für die Restzeit
      const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
      // Laufende Zeit sichtbar halten, solange die KI arbeitet.
      let ticker = null;
      const tick = () => { if (busy > 0 && !ticker) ticker = setInterval(() => { if (!s.box.isConnected || busy <= 0) { clearInterval(ticker); ticker = null; } sync(); }, 1000); };
      // Persönliche Änderungen dieser Kacheltypen in Casoras aktuelle Fassung übertragen.
      // g._pick zählt jede Wahl mit: hat der Nutzer während der KI-Arbeit umentschieden, gilt seine Wahl.
      const choose = (g, v) => { g._pick = (g._pick || 0) + 1; keep[g.key] = v; };
      // Vor jedem KI-Einsatz: Kosten schätzen und nachfragen (bis „Nicht mehr anzeigen“).
      // Umfang eines KI-Einsatzes (Zeichen hin, Anzahl Anfragen) – für Nachfrage und Preis am Knopf.
      const costArgs = async (gs) => {
        const T = ((await this._bundleOnce()) || {}).templates || {};
        let chars = 0, calls = 0;
        gs.forEach((g) => g.names.forEach((n) => {
          const m = a.modified.find((x) => x.name === n);
          if (!m || !T[n]) return;
          chars += JSON.stringify(m.def).length + JSON.stringify(T[n]).length; calls++;
        }));
        return { chars, calls };
      };
      const askCost = async (gs) => {
        if (!window.casoraAiCost || !best) return true;
        const { chars, calls } = await costArgs(gs);
        if (!calls) return true;
        const what = gs.length === 1 ? tr("1 tile type") : tr("{1} tile types").replace("{1}", gs.length);
        return !!(await window.casoraAiCost.confirm(this, { model: best.model, label: best.label, inChars: chars, calls, what }));
      };
      // Geschätzter Preis („≈ 0,05 €“) – dieselbe Schätzung wie in der Nachfrage.
      const priceOf = async (gs) => {
        if (!best || !window.casoraAiCost || !window.casoraAiCost.format) return "";
        const { chars, calls } = await costArgs(gs.filter((g) => !merged(g) && !covered(g)));
        return calls ? "≈ " + window.casoraAiCost.format(this._hass, { model: best.model, inChars: chars, calls }) : "";
      };
      const runAi = async (g) => {
        if (merged(g)) { choose(g, "ai"); sync(); return true; }
        if (g._busy) return false;
        const mine = g._pick = (g._pick || 0) + 1;
        g._busy = true; g._t0 = Date.now(); g._ops = 0; g._notes = []; busy++; errs.delete(g.key); sync(); tick();
        try {
          const T = ((await this._bundleOnce()) || {}).templates || {};
          // Kachel und Popup eines Typs gleichzeitig – die KI liefert nur die Änderungen.
          await Promise.all(g.names.map(async (n) => {
            const m = a.modified.find((x) => x.name === n);
            if (!m || !T[n]) { a.merged[n] = m ? m.def : T[n]; return; }
            const r = await this._hass.callWS({ type: "casora/ki/merge_template", name: n, mine: m.def, casora: T[n] });
            const bad = brokenJs(r.template);
            if (bad) throw new Error("The AI returned broken code (" + bad + ").");
            a.merged[n] = r.template;
            g._ops = (g._ops || 0) + (r.ops || 0);
            // Bei Kachel + Popup sagen, wo die Änderung liegt.
            const where = hasPopup(g) ? tr(/popup/.test(n) ? "Popup" : "Tile") + ": " : "";
            g._notes = [...new Set((g._notes || []).concat((r.changes || []).map((c) => where + c)))];
          }));
          // Immer eine Rückmeldung – auch wenn die KI nichts beschreibt.
          if (!g._notes.length) g._notes = [tr(g._ops ? "Your changes were carried over."
            : hasPopup(g) ? "Tile and popup checked – nothing personal, Casora's version already has it."
              : "Checked – nothing personal, Casora's version already has it.")];
          durs.push(Date.now() - g._t0);
          // Nichts Persönliches gefunden: Casoras Fassung reicht – kein zweites Mal anbieten.
          if (!g._ops) g._covered = true;
          if (g._pick === mine) keep[g.key] = g._covered ? false : "ai";
          return true;
        } catch (e) {
          g.names.forEach((n) => { delete a.merged[n]; });
          errs.set(g.key, "AI didn't work: " + ((e && e.message) || e));
          return false;
        } finally {
          g._busy = false; busy--; sync();
        }
      };
      const seg = (parent, isOn, pick, busyNow, off) => {
        const box = el("div", "cc-seg", parent);
        const mk = (label, val) => {
          const b = el("button", "", box, label); b.type = "button";
          if (val === "ai") {
            b.className = "cc-seg-ai";
            b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg><span></span><span class="cc-cost" data-no-i18n></span>';
            b.querySelector("span").textContent = label;
            b._cost = b.querySelector(".cc-cost");
          }
          b._sync = () => {
            b.classList.toggle("on", isOn(val));
            if (val === "ai") {
              const no = !!(off && off());
              b.disabled = !best || no; b.classList.toggle("busy", busyNow()); b.classList.toggle("covered", no);
              b.title = no ? tr("Casora already contains your changes – no AI needed.") : "";
            }
          };
          b.onclick = () => pick(val);
          return b;
        };
        const bs = [mk(pick.labels[0], true), mk(pick.labels[1], false), mk(pick.labels[2], "ai")];
        syncs.push(() => bs.forEach((b) => b._sync()));
        box._ai = bs[2];
        return box;
      };
      // Preis am KI-Knopf: bei mehreren Kacheltypen an „Alle mit KI“, sonst an der einen Karte.
      let priceBtn = null;
      const updatePrice = async () => {
        if (!priceBtn || !priceBtn._cost) return;
        const p = await priceOf(a.groups);
        priceBtn._cost.textContent = p ? " (" + p + ")" : "";
      };
      const head = el("div", "cc-head", s.body);
      el("div", "cu-h", head, a.groups.length === 1 ? tr("1 customized kind of tile") : tr("{1} customized kinds of tiles").replace("{1}", a.groups.length));
      if (a.groups.length > 1) {
        let allRun = 0;
        var allTotal = 0, allDone = 0, allOn = false;
        const pickAll = async (v) => {
          const run = ++allRun;
          if (v !== "ai") { a.groups.forEach((g) => choose(g, v)); sync(); return; }
          // Drei Kacheltypen gleichzeitig; jede Karte zeigt ihren Stand. Wählt der Nutzer
          // zwischendurch „Alle meine/Casora“, startet keine weitere mehr.
          // Kacheltypen, die Casora schon enthält, bleiben bei Casora – sie kosten nichts.
          const queue = a.groups.filter((g) => !merged(g) && !covered(g));
          if (queue.length && !(await askCost(queue))) return;
          a.groups.forEach((g) => { if (covered(g)) choose(g, false); else if (merged(g)) choose(g, "ai"); });
          allTotal = queue.length; allDone = 0; allOn = true; sync();
          const worker = async () => {
            while (queue.length && run === allRun) { await runAi(queue.shift()); allDone++; sync(); }
          };
          await Promise.all([worker(), worker(), worker()]);
          if (run === allRun) { allOn = false; sync(); }
          updatePrice();
        };
        pickAll.labels = ["All mine", "All Casora", "All with AI"];
        // „Alle mit KI“ gilt als gewählt, wenn alle, die KI brauchen, auf KI stehen.
        const allOnAi = () => { const need = a.groups.filter((g) => !covered(g)); return need.length > 0 && need.every((g) => keep[g.key] === "ai"); };
        priceBtn = seg(head, (v) => (v === "ai" ? allOnAi() : a.groups.every((g) => keep[g.key] === v)), pickAll,
          () => a.groups.some((g) => g._busy), () => a.groups.every(covered))._ai;
        // Fortschritt von „Alle mit KI“: fertig / gesamt und geschätzte Restzeit.
        const prog = el("div", "cc-prog", s.body);
        prog.setAttribute("data-no-i18n", "");
        syncs.push(() => {
          if (!allOn) { prog.hidden = true; return; }
          prog.hidden = false;
          const left = allTotal - allDone;
          const avg = durs.length ? durs.reduce((x, y) => x + y, 0) / durs.length : 0;
          const ms = avg * Math.ceil(left / 3);
          const eta = !avg ? tr("estimating time…")
            : ms < 60000 ? tr("about {1} s left").replace("{1}", Math.max(5, Math.ceil(ms / 5000) * 5))
              : tr("about {1} min left").replace("{1}", Math.ceil(ms / 60000));
          prog.textContent = "✦ " + tr("{1} of {2} done").replace("{1}", allDone).replace("{2}", allTotal) + " · " + eta;
        });
      }
      const grid = el("div", "cc-grid", s.body);
      a.groups.forEach((g) => {
        const names = g.uses.map((x) => x.tile.name || x.tile.entity).filter(Boolean);
        const card = el("div", "cc-card", grid), top = el("div", "cc-top", card);
        const ic = el("span", "cc-ic", top), i = el("i", "", ic);
        i.style.setProperty("--m", "url('/casora_assets/icons/" + iconFor(g.key) + ".svg')");
        ic.style.background = hueFor(g.key);
        const tx = el("div", "cc-tx", top);
        el("b", "", tx, friendlyName({ name: g.key }));
        const line = el("span", "", tx);
        el("span", "", line, g.uses.length === 1 ? "1 tile" : g.uses.length + " tiles");
        if (hasPopup(g)) el("span", "", line, " + Popup");
        if (names.length) el("span", "", line, ": " + [...new Set(names)].slice(0, 3).join(", ") + (names.length > 3 ? " …" : "")).setAttribute("data-no-i18n", "");
        // Eigene Variablen nennen: daran sieht man, warum die Kachel als angepasst gilt.
        if ((g.vars || []).length) {
          const vs = el("div", "cc-why cc-vars", null);
          vs.setAttribute("data-no-i18n", "");
          vs.textContent = tr("Uses settings Casora doesn't know: {1}").replace("{1}", g.vars.slice(0, 4).join(", ") + (g.vars.length > 4 ? " …" : ""));
          card.appendChild(vs);
        }
        const cmp = el("button", "cc-cmp", top, "View"); cmp.type = "button";
        cmp.onclick = () => this._casoraUmzugCompare(a, g, hueFor(g.key));
        const pick = async (v) => {
          if (v !== "ai") { choose(g, v); sync(); return; }
          if (covered(g)) return;
          if (merged(g) || await askCost([g])) { await runAi(g); updatePrice(); }
        };
        pick.labels = ["Mine", "Casora", "AI"];
        const cardSeg = seg(card, (v) => keep[g.key] === v, pick, () => !!g._busy, () => covered(g));
        if (a.groups.length === 1) priceBtn = cardSeg._ai;
        // Ein Satz dazu, was die gewählte Fassung bedeutet.
        const why = el("div", "cc-why", card);
        why.setAttribute("data-no-i18n", "");
        syncs.push(() => {
          why.textContent = tr(keep[g.key] === true ? "Stays exactly as you built it – as your own tile type."
            : covered(g) ? "Casora already contains your changes – no AI needed, nothing is charged."
            : keep[g.key] === "ai" ? "AI carries your changes into Casora's new version."
              : "Casora's new version – your changes are left out.");
        });
        const note = el("div", "cc-note", card);
        note.setAttribute("data-no-i18n", "");
        syncs.push(() => {
          const err = errs.get(g.key);
          note.classList.toggle("err", !!err);
          note.textContent = g._busy ? tr("AI is adapting…") + " " + mmss(Date.now() - g._t0) : err ? tr(err) : keep[g.key] === "ai" && g._notes && g._notes.length ? g._notes.join(" · ") : "";
          note.hidden = !note.textContent;
        });
      });
      const lock = el("div", "cc-foot cc-lock", s.body);
      aiReady.then((r) => {
        const showBest = () => {
          lock.setAttribute("data-no-i18n", "");
          lock.textContent = "✦ " + tr("AI") + ": " + best.label + " · " + tr("billed via your API key");
          updatePrice();
        };
        if (!best) {
          lock.textContent = tr(r && r.all && r.all.length
            ? "Moving your changes needs a stronger AI – for example Claude Opus, Claude Sonnet 4.5 or GPT-5. Settings → AI tasks."
            : "Set up an AI to carry your changes over – for example Claude Opus. Settings → AI tasks.");
          // Zu schwache KI: Casora kann eine starke eigene anlegen.
          if (window.casoraAiUpgrade) window.casoraAiUpgrade(this, s.body, (b) => { best = b; showBest(); sync(); });
        } else showBest();
        sync();
      });
      // Letzter Schritt vor dem Umzug: Name des neuen Dashboards.
      this._casoraUmzugName(s.body, a);
      let go = null, moving = false;
      syncs.push(() => { if (go) go.disabled = busy > 0 || moving; });
      sync();
      go = this._flowButton(s.acts, "Move to Casora", async () => {
        // Doppelklick legte sonst zwei Dashboards an.
        if (moving || busy > 0) return;
        moving = true; sync();
        // „KI“ gewählt (auch als Vorauswahl), aber noch nicht angepasst: jetzt nachholen.
        const todo = a.groups.filter((g) => keep[g.key] === "ai" && !merged(g));
        if (todo.length) {
          if (!best || !(await askCost(todo))) { moving = false; sync(); return; }
          const queue = todo.slice();
          const worker = async () => { while (queue.length) await runAi(queue.shift()); };
          await Promise.all([worker(), worker(), worker()]);
          // Fehlgeschlagen: Fehler steht an der Karte, der Nutzer entscheidet neu.
          if (todo.some((g) => !merged(g))) { moving = false; sync(); return; }
        }
        // Auswahl je Kacheltyp auf die einzelnen Vorlagen übertragen.
        const byName = {};
        a.groups.forEach((g) => g.names.forEach((n) => { byName[n] = keep[g.key]; }));
        this._casoraUmzugRun(a, byName);
      });
    };

    // Gruppen, für die „Meine“ gewählt ist (keep je Vorlagenname, auch nur fürs Popup).
    const keptGroups = (a, keep) => (a.groups || []).filter((g) => keep[g.key] === true || g.names.some((n) => keep[n] === true));
    // Name der eigenen Kachelart im Studio: „Kamera (meine)“.
    const ownLabel = (g) => tr("{1} (mine)").replace("{1}", tr(friendlyName({ name: g.key })));

    // Schritt 3: sichern, bauen, merken.
    P._casoraUmzugRun = async function (a, keep) {
      const hass = this._hass;
      const c = a.c;
      try {
        // HA liest das Dashboard selbst – große Dashboards sprengen sonst die WebSocket-Nachricht.
        await hass.callWS({ type: "casora/backup/dashboard", name: c.url_path, url_path: c.url_path, title: c.title,
          ...(c.rawMobile ? { mobile_url_path: c.url_path + "-mobile" } : {}) });
      } catch (e) {
        const s = this._flowScreen({ icon: "alert", tone: "warn", title: "Backup Didn't Work",
          lede: "Casora couldn't save a backup, so nothing was moved. Your Hemma dashboard is unchanged." });
        this._flowError(this._plainError(e, (e && e.message) || "Unknown error."));
        this._flowCancel(s.acts);
        return;
      }
      // Name aus dem letzten Schritt; sonst der Titel des Hemma-Dashboards (ohne „Hemma“).
      const title = String(a.newTitle || "").trim() || proposeTitle(this, c);
      const url_path = this._flowPath(title, "casora", "casora");
      // Fertig-Bildschirm: altes Dashboard (nur aus dem HA-Speicher) per Schalter aus der Seitenleiste
      // nehmen – unter dem Inhalt, nicht als Knopf über „Dashboard öffnen“. Wieder einschaltbar.
      // Ausblenden-Symbol: durchgestrichenes Auge (nicht das Herunterladen-Symbol des Umzugs).
      const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5.4 0 8.8 5 9.6 6.4a1.3 1.3 0 0 1 0 1.2 16 16 0 0 1-2.4 3.1"/>'
        + '<path d="M6.5 6.6C4.3 8 2.9 10.2 2.4 11.4a1.3 1.3 0 0 0 0 1.2C3.2 14 6.6 19 12 19c1.9 0 3.6-.6 5-1.5"/>'
        + '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>';
      const eyeOff = (r) => { const ic = r.row.querySelector(".rico"); if (ic) ic.innerHTML = EYE_OFF; };
      const hideOld = () => {
        const body = this._fx && this._fx.scroll && this._fx.scroll.querySelector(".fbody");
        if (!body) return;
        // YAML-Dashboards (configuration.yaml) lassen sich von hier aus nicht ausblenden – das sagen,
        // statt den Schalter kommentarlos wegzulassen.
        if (c.mode !== "storage" || !c.id) {
          const gy = this._flowGroup(body, { footer: "To hide it, set show_in_sidebar: false for it in your configuration.yaml." });
          const ry = this._flowRow(gy, { icon: "import", tint: I().studioIcon("move-plain"), raw: true,
            title: tr("“{1}” is set up in YAML – Casora can't hide it from the sidebar.").replace("{1}", c.title) });
          ry.row.classList.add("wrap2", "cu-hideold");
          eyeOff(ry);
          return;
        }
        const g = this._flowGroup(body, { footer: "You still find it under Settings → Dashboards." });
        const r = this._flowRow(g, { icon: "import", tint: I().studioIcon("move-plain"), title: "Hide old dashboard in the sidebar (stays saved)" });
        r.row.classList.add("wrap2", "cu-hideold");
        eyeOff(r);
        const sw = document.createElement("button");
        sw.type = "button"; sw.className = "fswitch"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-checked", "false");
        let busy = false;
        sw.onclick = async () => {
          if (busy) return;
          const on = sw.getAttribute("aria-checked") !== "true";
          busy = true; sw.setAttribute("aria-checked", on ? "true" : "false");
          try {
            await hass.callWS({ type: "lovelace/dashboards/update", dashboard_id: c.id, show_in_sidebar: !on });
          } catch (e) {
            sw.setAttribute("aria-checked", on ? "false" : "true");
            this._flowError(tr("Couldn't change the sidebar:") + " " + ((e && e.message) || e));
          }
          busy = false;
        };
        r.row.appendChild(sw);
      };
      // Merkt Original → neues Dashboard; nur fürs automatische Angebot (Menü zeigt es weiter).
      const remember = async (target) => {
        try {
          const cur = await settingsForWrite(hass);
          const done = [].concat((cur.umzug || {}).done || [])
            .filter((x) => (typeof x === "string" ? x : x && x.src) !== c.url_path)
            .concat({ src: c.url_path, target: target || url_path });
          await hass.callWS({ type: "casora/settings/set",
            settings: Object.assign({}, cur, { umzug: Object.assign({}, cur.umzug || {}, { done }) }) });
        } catch (e) { /* nur Komfort */ }
      };

      // Fertig-Bildschirm: was die KI von den eigenen Änderungen übernommen hat.
      const aiSummary = () => {
        // Auch Kacheltypen, bei denen die KI nichts Persönliches fand (stehen danach auf Casora).
        const withAi = (a.groups || []).filter((g) => keep[g.key] === "ai" || (g._covered && g._t0));
        const body = this._fx && this._fx.scroll && this._fx.scroll.querySelector(".fbody");
        if (!body) return;
        // Keine angepassten Kacheln: die KI hatte nichts zu tun – das sagen (Willkommen verspricht sie).
        // Direkt im Einleitungssatz, damit es ohne Scrollen zu lesen ist.
        if (!(a.groups || []).length) {
          const lede = this._fx.scroll.querySelector(".flede");
          if (lede) {
            const note = document.createElement("span");
            note.setAttribute("data-no-i18n", "");
            note.textContent = " " + tr("No customized tiles found – everything is on Casora's current version.");
            lede.appendChild(note);
          }
          return;
        }
        if (!withAi.length) return;
        const changed = withAi.filter((g) => g._ops > 0);
        const quiet = withAi.length - changed.length;
        const list = this._flowGroup(body, { header: "Carried over with AI",
          footer: quiet ? (quiet === 1 ? "1 more tile checked – nothing personal, Casora already has it."
            : quiet + " more tiles checked – nothing personal, Casora already has it.") : null });
        if (!changed.length) {
          this._flowRow(list, { icon: "sparkle", tint: I().studioIcon("move-ai"), title: "No personal changes found",
            sub: "Your tiles now use Casora's current version." });
          return;
        }
        // Je Kacheltyp: deutscher Name, die Änderungen in ganzen Sätzen (umbrochen, nicht abgeschnitten),
        // antippen öffnet den Vergleich (deine Fassung / Casora / mit KI).
        changed.forEach((g) => {
          const row = this._flowRow(list, { icon: "sparkle", tint: I().studioIcon("move-ai"), title: tr(friendlyName({ name: g.key })), raw: true,
            sub: (g._notes || []).join("\n"), chevron: true, onTap: () => this._casoraUmzugCompare(a, g, hueFor(g.key)) });
          row.row.classList.add("wrap2", "cu-ainote");
          const sub = row.row.querySelector(".rtext > span");
          if (sub) sub.setAttribute("data-no-i18n", "");
        });
      };

      // Eigene Fotos und Symbole aus www/hemma nach www/casora kopieren und im neuen Dashboard
      // (Desktop + Handy) darauf zeigen – das Hemma-Dashboard bleibt unverändert (hemma_cleanup.py).
      // Gleich beim Fertig-Bildschirm, damit „Bearbeiten“ schon die neuen Adressen lädt.
      // Danach im Fertig-Bildschirm: „N Raumfotos übernommen“ und „Hemma danach entfernen …“.
      const carryFiles = async (target) => {
        if (!target) return;
        let r = null, st = null;
        try { r = await hass.callWS({ type: "casora/hemma/move_files", dashboards: [target] }); } catch (e) { r = null; }
        try { st = await hass.callWS({ type: "casora/hemma/status" }); } catch (e) { st = null; }
        const body = this._fx && this._fx.scroll && this._fx.scroll.querySelector(".fbody");
        if (!body) return;
        const copied = r ? (r.copied || []).length : 0;
        const rooms = r ? r.rooms || 0 : 0;
        const kept = (r && r.write_kept) || [];
        const removable = st && st.installed && typeof this._casoraHemmaRemove === "function";
        if (!copied && !rooms && !removable && !kept.length) return;
        const list = this._flowGroup(body, { footer: rooms || copied ? "Copied to www/casora – the Hemma dashboard keeps its own." : null });
        if (rooms || copied) {
          const title = rooms ? (rooms === 1 ? tr("1 room photo carried over") : tr("{1} room photos carried over").replace("{1}", rooms))
            : (copied === 1 ? tr("1 file carried over") : tr("{1} files carried over").replace("{1}", copied));
          const row = this._flowRow(list, { icon: "import", tint: I().studioIcon("move-import"), title, raw: true });
          row.row.classList.add("wrap2");
        }
        // „Pfad bleibt, weil eine Automation dorthin schreibt“ – nichts kopiert, nichts umgeschrieben.
        kept.forEach((x) => {
          const row = this._flowRow(list, { icon: "import", tint: I().studioIcon("move-plain"), raw: true,
            title: tr("{1} stays – an automation writes there").replace("{1}", x.path), sub: (x.sources || []).join(", ") });
          row.row.classList.add("wrap2");
          const sub = row.row.querySelector(".rtext > span");
          if (sub) sub.setAttribute("data-no-i18n", "");
        });
        if (removable) {
          this._flowRow(list, { icon: "alert", tint: I().studioIcon("move-plain"), title: "Remove Hemma afterwards…", chevron: true,
            onTap: () => this._casoraHemmaRemove() });
        }
        const grp = list.parentNode;
        const stage = body.querySelector(":scope > .dn-stage");
        grp.classList.add("cu-donetop");
        if (stage) body.insertBefore(grp, stage);
      };

      // Einstellungen, die in Hemma-Helfern stecken, auf die Casora-Helfer übertragen – sonst stehen
      // sie nach dem Umzug auf Casora-Standard (Glocke wieder ungelesen, Thermostat-Modus, Schalter).
      // Nur Werte, die der Nutzer setzt; Bedien-Zustände (Overlays, aufgeklappte Reihe) nicht.
      const carryHelpers = async () => {
        const S = hass.states || {};
        const KEYS = ["input_boolean.dashboard_redirect", "input_boolean.motion_badges",
          "input_boolean.now_playing_minimized", "input_text.now_playing_pinned",
          "input_select.thermostat_mode", "input_number.thermostat_target_temperature",
          "input_datetime.notifications_read"];
        for (const k of KEYS) {
          const [dom, name] = k.split(".");
          const from = S[dom + ".hemma_" + name], to = S[dom + ".casora_" + name];
          if (!from || !to || from.state === to.state || /^(unknown|unavailable)$/.test(from.state)) continue;
          const v = from.state, entity_id = to.entity_id;
          try {
            if (dom === "input_boolean") await hass.callService(dom, v === "on" ? "turn_on" : "turn_off", { entity_id });
            else if (dom === "input_select") {
              if ((to.attributes.options || []).includes(v)) await hass.callService(dom, "select_option", { entity_id, option: v });
            } else if (dom === "input_number") await hass.callService(dom, "set_value", { entity_id, value: Number(v) });
            else if (dom === "input_text") await hass.callService(dom, "set_value", { entity_id, value: v });
            else if (dom === "input_datetime") await hass.callService(dom, "set_datetime", { entity_id, datetime: v });
          } catch (e) { /* ein Helfer, der nicht passt, hält den Umzug nicht auf */ }
        }
      };

      // Nur der Fertig-Bildschirm dieses Umzugs merkt ihn und bietet das Ausblenden an. Scheitert der
      // Import (Fehlermeldung statt Fertig), wird der Haken wieder entfernt – sonst träfe er den nächsten.
      const hooked = async (build) => {
        const origDone = this._flowDone;
        const hook = (opts) => {
          this._flowDone = origDone; remember(opts && opts.url_path);
          carryFiles(opts && opts.url_path);
          carryHelpers();
          // move: der Fertig-Bildschirm hält den ersten Stand als „Umgezogen“ in den Versionen fest.
          const r = origDone.call(this, Object.assign({}, opts, { move: true }));
          // KI-Zusammenfassung und Ausblenden-Schalter über die Vorschau – sonst erst nach Scrollen zu sehen.
          const body = this._fx && this._fx.scroll && this._fx.scroll.querySelector(".fbody");
          const before = body ? body.children.length : 0;
          aiSummary(); hideOld();
          const stage = body && body.querySelector(":scope > .dn-stage");
          if (stage && body.children.length > before) {
            [...body.children].slice(before).forEach((x) => { x.classList.add("cu-donetop"); body.insertBefore(x, stage); });
            stage.classList.add("cu-small");
          }
          return r;
        };
        this._flowDone = hook;
        try { return await build(); } finally { if (this._flowDone === hook) this._flowDone = origDone; }
      };

      if (a.legacy) {
        // Hemma 1: Kacheln, die Casora nicht kennt, bleiben als eigene Karten.
        const rooms = window.casoraLegacy.read(a.cfg, hass);
        // Badges in jedem Raum: Casoras Standard-Badges ergänzen, wo Hemma nichts eingetragen hatte.
        const legacyTargets = rooms.map((r, i) => ({ name: r.name, home: r.path === "home" || (i === 0 && !rooms.some((x) => x.path === "home")),
          vars: r.variables = r.variables || {} }));
        fillRoomBadges(hass, legacyTargets);
        spreadWeather(legacyTargets);
        // „Meine Fassung“: eigene Kachelart own_<name>, die Kacheln zeigen darauf (vor der Typ-Erkennung).
        const own = {};
        const bundle = await this._bundleOnce();
        const taken = Object.assign({}, (bundle && bundle.templates) || {}, a.cfg.button_card_templates || {});
        keptGroups(a, keep).forEach((g) => {
          const plan = ownPlan(g, a.cfg.button_card_templates || {}, taken, ownLabel(g));
          Object.assign(own, plan.templates); Object.assign(taken, plan.templates);
          a.ownKept = (a.ownKept || []).concat(Object.keys(plan.templates));
          rooms.forEach((r) => r.tiles.forEach((t) => {
            const name = tplOf(t)[0], before = t.card && tplOf(t.card)[0];
            if (plan.map[name]) t.template = plan.map[name];
            else if (before && plan.map[before]) { t.template = plan.map[before]; t.entity = t.card.entity || t.entity; }
          }));
        });
        const choices = new Map();
        rooms.forEach((r) => r.tiles.forEach((t) => {
          if (!window.casoraLegacy.typeOf(t.template) && !own[tplOf(t)[0]]) choices.set(t, "custom");
        }));
        // Mit KI angepasst: Casoras Fassung mit den persönlichen Änderungen.
        a.modified.forEach((m) => { if (keep[m.name] === "ai" && a.merged && a.merged[m.name]) own[m.name] = a.merged[m.name]; });
        return hooked(() => this._casoraLegacyBuild({ cfg: a.cfg, title: c.title, url_path: c.url_path }, rooms, choices, url_path, title, { ownTpl: own }));
      }

      // Hemma 2: der Studio-Import. Fingerabdrücke steuern, was er aktualisiert:
      // unverändert → Casoras Fassung, „meine behalten“ → bleibt, sonst → Casoras.
      const cfg = JSON.parse(JSON.stringify(a.cfg));
      // Badges wie bei einem neuen Dashboard, in jedem Raum: nur ergänzen, was das Hemma-Dashboard nicht hatte.
      const homeView = (cfg.views || []).find((v) => v && v.path === "home") || (cfg.views || [])[0];
      const roomTargets = (cfg.views || []).map((v) => {
        const hero = v && (v.cards || [])[0];
        if (!hero || hero.template !== "casora_room") return null;
        return { name: hero.name, home: v === homeView, vars: hero.variables = hero.variables || {} };
      }).filter(Boolean);
      fillRoomBadges(hass, roomTargets);
      spreadWeather(roomTargets);
      const fp = {};
      // „Meine Fassung“: eigene Kachelart own_<name> (Kachel + Popup), Kacheln auf Desktop und Handy
      // zeigen darauf; casora_<name> bekommt wieder Casoras Fassung und damit künftige Updates.
      const mobile = a.mobile ? JSON.parse(JSON.stringify(a.mobile)) : null;
      const shipped = ((await this._bundleOnce()) || {}).templates || {};
      cfg.button_card_templates = cfg.button_card_templates || {};
      const converted = new Set();
      keptGroups(a, keep).forEach((g) => {
        const plan = ownPlan(g, cfg.button_card_templates, Object.assign({}, shipped, cfg.button_card_templates), ownLabel(g));
        Object.assign(cfg.button_card_templates, plan.templates);
        a.ownKept = (a.ownKept || []).concat(Object.keys(plan.templates));
        Object.keys(plan.map).forEach((n) => {
          if (!shipped[n]) return;
          cfg.button_card_templates[n] = JSON.parse(JSON.stringify(shipped[n]));
          fp[n] = print(shipped[n]);
          converted.add(n);
        });
        retarget(cfg, plan.map);
        if (mobile) retarget(mobile, plan.map);
      });
      Object.keys(cfg.button_card_templates).forEach((k) => {
        if (converted.has(k)) return;
        if (a.unchanged.includes(k)) fp[k] = print(cfg.button_card_templates[k]);
        else if (keep[k]) fp[k] = "eigene";
        // Mit KI angepasst: Casoras Fassung mit den persönlichen Änderungen – bleibt als eigene Vorlage.
        if (keep[k] === "ai" && a.merged && a.merged[k]) cfg.button_card_templates[k] = a.merged[k];
      });
      delete cfg.hemma_template_fingerprint;
      cfg[I().FINGERPRINT_KEY] = fp;
      const all = mobile ? [{ kind: "mobile", url_path: url_path + "-src-mobile", cfg: mobile }] : [];
      const src = { url_path: url_path + "-src", title: c.title, cfg };
      if (mobile) all[0].url_path = src.url_path + "-mobile";
      return hooked(() => this._import(src, url_path, title, all, null, { move: true }));
    };
  });

  // Einmal pro Sitzung anbieten, sobald das Studio offen und bereit ist (nach „Willkommen“).
  // Das Panel entsteht erst beim Öffnen – danach suchen (connectedCallback am Prototyp
  // zu ersetzen greift nicht, der Browser merkt sich die Callbacks bei define).
  const findPanel = (root, d) => {
    if (!root || d > 12 || !root.querySelectorAll) return null;
    for (const el of root.querySelectorAll("*")) {
      if (el.localName === "casora-panel") return el;
      const hit = el.shadowRoot && findPanel(el.shadowRoot, d + 1);
      if (hit) return hit;
    }
    return null;
  };
  customElements.whenDefined("casora-panel").then(() => {
    const t0 = Date.now();
    const look = () => {
      const ha = document.querySelector("home-assistant");
      const panel = ha && findPanel(ha.shadowRoot || ha, 0);
      if (panel) return offer(panel);
      if (Date.now() - t0 < 60000) setTimeout(look, 800);
    };
    look();
  });

  // Gibt es einen Umzug, dessen Casora-Dashboard noch da ist?
  async function movedAny(hass, done) {
    if (![].concat(done || []).length) return false;
    let list = [];
    try { list = await hass.callWS({ type: "lovelace/dashboards/list" }); } catch (e) { return false; }
    return liveDone(done, list).size > 0;
  }

  let offered = false;
  function offer(panel) {
    if (offered) return;
    offered = true;
    const t0 = Date.now();
    const wait = async () => {
      if (Date.now() - t0 > 60000) return;
      if (panel._casoraUmzugShown || offerOff()) return;  // schon gezeigt (Erststart oder Menü) bzw. abgeschaltet
      if (!panel._hass || !panel._dashList || panel._flowMode || !panel.isConnected) return setTimeout(wait, 700);
      if (!panel._hass.user || !panel._hass.user.is_admin) return;
      // In den Casora-Einstellungen abgeschaltet („Nicht mehr fragen“ / Persönliches).
      const um = (await settings(panel._hass)).umzug || {};
      if (um.off) return;
      if (snoozed()) return;  // „Später“ gilt eine Woche
      // Schon ein Dashboard erfolgreich umgezogen: die übrigen nicht ungefragt anbieten – sie bleiben
      // über ⋯ → Einrichtungsassistent bzw. „Von Hemma umziehen …“ erreichbar.
      if (await movedAny(panel._hass, um.done)) return;
      const list = await candidates(panel);
      panel._casoraUmzugList = list;
      if (!list.length || panel._flowMode) return;
      // Handy: kein Vollbild-Assistent beim Öffnen, sondern ein Hinweis oben im Studio.
      if (panel.classList.contains("phone")) return banner(panel, list);
      panel._casoraUmzug({ list, auto: true });
    };
    setTimeout(wait, 1500);
  }

  // Hinweis oben im Studio (Handy): antippen führt in den Umzug, × schiebt ihn eine Woche auf.
  function banner(panel, list) {
    const root = panel.shadowRoot;
    const host = root && (root.querySelector(".body") || root.getElementById("status"));
    if (!host || root.querySelector(".cu-banner")) return;
    if (!root.getElementById("casora-ubanner-css")) {
      const st = document.createElement("style");
      st.id = "casora-ubanner-css";
      st.textContent = ".cu-banner{display:flex;align-items:center;gap:12px;margin:10px 16px 6px;padding:12px 8px 12px 14px;border-radius:var(--r-l);"
        + "background:var(--casora-popup-row-fill,rgba(255,255,255,.08));box-shadow:inset 0 0 0 .5px rgba(255,255,255,.12);color:var(--ink);text-align:left}"
        + ".cu-banner>i{flex:0 0 34px;height:34px;border-radius:50%;background:var(--casora-studio-done, #0a84ff);display:grid;place-items:center}"
        + ".cu-banner>i b{width:19px;height:19px;background:#fff;-webkit-mask:url('/casora_assets/icons/home.svg') center/contain no-repeat;mask:url('/casora_assets/icons/home.svg') center/contain no-repeat}"
        + ".cu-banner .cu-bt{flex:1 1 auto;min-width:0;appearance:none;border:0;background:none;padding:0;text-align:left;color:inherit;cursor:pointer}"
        + ".cu-banner .cu-bt b{display:block;font:600 var(--t-callout) system-ui;letter-spacing:-.01em}"
        + ".cu-banner .cu-bt span{display:block;margin-top:2px;font:400 var(--t-foot) system-ui;color:var(--ink-2);line-height:1.35}"
        + ".cu-banner .cu-bt span u{text-decoration:none;color:var(--casora-studio-link, #0a84ff);font-weight:500}"
        + ".cu-banner .cu-bx{flex:0 0 36px;width:36px;height:36px;appearance:none;border:0;border-radius:50%;background:none;color:var(--ink-2);cursor:pointer;display:grid;place-items:center;padding:0}"
        + ".cu-banner .cu-bx svg{width:18px;height:18px;fill:currentColor}"
        + ":host(.is-light) .cu-banner{box-shadow:inset 0 0 0 .5px rgba(0,0,0,.08)}:host(.is-light) .cu-banner .cu-bt span u{color:var(--casora-studio-link, #0071e3)}";
      root.appendChild(st);
    }
    const b = document.createElement("div");
    b.className = "cu-banner";
    b.setAttribute("role", "region");
    const title = list.length === 1 ? tr("Hemma dashboard found") : tr("{1} Hemma dashboards found").replace("{1}", list.length);
    b.innerHTML = '<i><b></b></i><button type="button" class="cu-bt"><b></b><span></span></button>'
      + '<button type="button" class="cu-bx"><svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg></button>';
    b.querySelector(".cu-bt b").textContent = title;
    const sub = b.querySelector(".cu-bt span");
    sub.textContent = tr(list.length === 1 ? "Move it to Casora – the original stays as it is."
      : "Move to Casora – the originals stay as they are.") + " ";
    const u = document.createElement("u"); u.textContent = tr("Move now"); sub.appendChild(u);
    b.setAttribute("data-no-i18n", "");
    const x = b.querySelector(".cu-bx");
    x.setAttribute("aria-label", tr("Not Now"));
    x.onclick = () => { snooze(); b.remove(); };
    b.querySelector(".cu-bt").onclick = () => { b.remove(); panel._casoraUmzug({ list, auto: true }); };
    host.insertBefore(b, host.firstChild);
  }


  // Erststart (casora-panel.js _setupExisting): alle Hemma-Dashboards, auch zuvor verschobene,
  // für „Vorhandenes Dashboard gefunden“ im Einrichtungsassistenten – der ist dann das Angebot.
  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._casoraMoveCandidates) return;
    P._casoraMoveCandidates = function () { return candidates(this, { includeDone: true }); };
  });

  // Menüeintrag „Von Hemma umziehen …“.
  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraUmzugMenu || typeof P._menuAt !== "function") return;
    P.__casoraUmzugMenu = true;
    const orig = P._menuAt;
    P._menuAt = function (anchor, items, onPick, opts) {
      if (Array.isArray(items) && items.some((x) => x && x.id === "create") && !this._flowMode
        && !items.some((x) => x && x.id === "casora_umzug")) {
        const at = items.findIndex((x) => x && x.id === "create");
        items = items.slice();
        items.splice(at + 1, 0, { id: "casora_umzug", label: "Move from Hemma…", icon: "import", group: "Dashboard", quiet: true });
        const pick = onPick;
        onPick = (id) => (id === "casora_umzug" ? this._casoraUmzug() : pick(id));
      }
      return orig.call(this, anchor, items, onPick, opts);
    };
  });
})();
