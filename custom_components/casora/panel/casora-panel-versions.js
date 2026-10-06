// Studio → „Versionen“ (29.09.2026)
//
// Jedes Speichern hält die Integration als Stand fest (casora/versions/*, versions.py).
// Die Seite listet die Stände wie eine Zeitleiste; ein gewählter Stand erscheint rechts
// in der Vorschau, ohne das Geöffnete anzutasten. „Wiederherstellen“ schreibt ihn
// zurück – der überschriebene Stand bleibt selbst als Version erhalten.
(function () {
  const PAGE = "__versions";
  // Sperre nur im Test-Rahmen (CASORA_STUDIO_SAVE_LOCK schützt dessen Fixture, wie beim Speichern);
  // im Produkt ist jedes Dashboard wiederherstellbar.
  const isLocked = (url) => {
    const lock = window.CASORA_STUDIO_SAVE_LOCK;
    if (!lock || window.CASORA_STUDIO_SAVE_OK) return false;
    try { return new RegExp(lock).test(url || ""); } catch (e) { return false; }
  };
  const CLOCK = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/>'
    + '<path d="M3 4.5V9h4.5"/><path d="M12 7.5V12l3 2"/></svg>');
  // Icon-Farbe aus der zentralen Tabelle des Panels (STUDIO_ICON, casora-panel.js).
  const tint = () => ((window.__casoraPanelInternals || {}).studioIcon ? window.__casoraPanelInternals.studioIcon("versions") : "var(--casora-color-green, #34C759)");

  const CSS = ".cv-wrap{padding:4px 0 24px}"
    + ".cv-blurb{margin:0 4px 16px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cv-day{margin:18px 6px 8px;font-size:var(--t-foot);font-weight:600;letter-spacing:.01em;color:var(--ink-2)}"
    + ".cv-day:first-of-type{margin-top:4px}"
    + ".cv-list{border-radius:var(--r-l);overflow:hidden;background:var(--casora-popup-row-fill,rgba(255,255,255,.07))}"
    + ".cv-row{appearance:none;display:flex;align-items:center;gap:12px;width:100%;min-height:52px;margin:0;padding:9px 14px;"
    + "border:0;border-radius:0;background:none;box-shadow:none;color:inherit;text-align:left;cursor:pointer;font:inherit}"
    + ".cv-row+.cv-row{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}"
    + ".cv-row:hover{background:rgba(255,255,255,.05);filter:none}"
    + ".cv-row[aria-current=true]{background:var(--casora-studio-good-tint, rgba(52,199,89,.2))}"
    + ".cv-dot{flex:0 0 10px;height:10px;border-radius:50%;background:rgba(235,235,245,.3)}"
    + ".cv-row[aria-current=true] .cv-dot{background:var(--casora-studio-good, #34c759);box-shadow:0 0 0 4px var(--casora-studio-good-tint, rgba(52,199,89,.25))}"
    + ".cv-tx{flex:1 1 auto;min-width:0}"
    + ".cv-tx b{display:block;font-size:var(--t-callout);font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}"
    + ".cv-tx span{display:block;font-size:var(--t-foot);color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".cv-now{flex:none;padding:3px 9px;border-radius:999px;font-size:var(--t-caption);font-weight:600;background:var(--casora-studio-good-tint, rgba(52,199,89,.22));color:var(--casora-studio-good, #34c759)}"
    + ".cv-pin{display:inline-grid;vertical-align:-2px;margin-left:6px;width:14px;height:14px;color:var(--ink-2)}.cv-pin svg{width:14px;height:14px}"
    + ".cv-item{display:flex;align-items:center}.cv-item+.cv-item{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}"
    + ".cv-item .cv-row{flex:1 1 auto;min-width:0}"
    + ".cv-more{appearance:none;flex:none;width:40px;height:40px;margin:0 6px 0 0;padding:0;border:0;border-radius:50%;background:none;box-shadow:none;"
    + "color:var(--ink-2);font:inherit;font-size:20px;line-height:1;cursor:pointer}.cv-more:hover{background:rgba(127,127,127,.12)}"
    + ".cv-tags{display:flex;gap:8px}.cv-tags button{flex:1 1 0}"
    + ".cv-empty{padding:28px 18px;text-align:center;font-size:var(--t-callout);line-height:1.45;color:var(--ink-2)}"
    + ".cv-act{display:flex;flex-direction:column;gap:8px;margin-top:16px;padding:4px 0}"
    // Ein älterer Stand ist gewählt: Die Knöpfe stehen fest am unteren Rand der Spalte, wie die
    // Fußknöpfe im Einrichtungsassistenten – nicht erst unter der ganzen Liste.
    + ":host(.split:not(.flow)) .cv-act:not(:empty){position:sticky;bottom:-16px;z-index:3;margin:16px -16px -16px;"
    + "padding:14px 16px 16px;"
    // Deckend: der Spaltenton (slab-page) über dem Seitengrund, damit die Liste nicht durchscheint.
    + "background-color:var(--primary-background-color,#1c1c1e);"
    + "background-image:linear-gradient(var(--slab-page,var(--casora-studio-slab-page,rgba(10,10,14,.55))),var(--slab-page,var(--casora-studio-slab-page,rgba(10,10,14,.55))));"
    + "box-shadow:inset 0 1px 0 var(--hair)}"
    + ":host(.split:not(.flow)) .cv-wrap:has(>.cv-act:not(:empty)){padding-bottom:0}"
    + ".cv-act:empty{display:none}.cv-act button{width:100%}"
    + ".cv-act .cv-note{font-size:var(--t-foot);line-height:1.4;color:var(--ink-2);text-align:center}"
    + ".cv-err{margin:10px 4px 0;font-size:var(--t-foot);color:#ff6961}"
    // Vorschau: Banner mit Datum und Pfeilen, dahinter gestaffelte ältere Stände.
    + ".cv-banner{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 14px;width:max-content;max-width:100%;"
    + "padding:5px 6px;border-radius:999px;background:rgba(52,199,89,.18);box-shadow:inset 0 0 0 .5px rgba(52,199,89,.45)}"
    + ".cv-banner b{padding:0 6px;font-size:var(--t-foot);font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}"
    + ".cv-banner button{appearance:none;display:grid;place-items:center;width:28px;height:28px;min-width:0;padding:0;margin:0;border:0;"
    + "border-radius:50%;background:rgba(255,255,255,.12);box-shadow:none;color:var(--ink);cursor:pointer}"
    + ".cv-banner button:disabled{opacity:.3;cursor:default}"
    + ".cv-banner svg{width:15px;height:15px}"
    + ":host(.cv-peek) #mapmount{position:relative;pointer-events:none}"
    + ":host(.cv-peek) #mapmount::before,:host(.cv-peek) #mapmount::after{content:'';position:absolute;left:4%;right:4%;top:-10px;height:40px;"
    + "border-radius:var(--r-l);background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1);z-index:-1}"
    + ":host(.cv-peek) #mapmount::after{left:8%;right:8%;top:-20px;background:rgba(255,255,255,.04)}"
    + "@media (prefers-reduced-motion:no-preference){:host(.cv-peek) #mapmount>*{animation:cvIn .32s cubic-bezier(.32,.72,0,1)}}"
    + "@keyframes cvIn{from{opacity:.4;transform:translateY(-10px) scale(.985)}to{opacity:1;transform:none}}"
    // Hell (HA im Hellmodus): dunkle Waschungen und Grün mit genug Kontrast.
    + ":host(.is-light) .cv-row:hover{background:rgba(0,0,0,.04)}"
    + ":host(.is-light) .cv-row[aria-current=true]{background:var(--casora-studio-good-tint, rgba(52,199,89,.14))}"
    + ":host(.is-light) .cv-dot{background:rgba(60,60,67,.3)}"
    + ":host(.is-light) .cv-now{background:var(--casora-studio-good-tint, rgba(52,199,89,.16));color:var(--casora-studio-good, #1a6b2f)}"
    + ":host(.is-light) .cv-err{color:var(--casora-studio-bad, #d70015)}"
    + ":host(.is-light) .cv-banner{background:var(--casora-studio-good-tint, rgba(52,199,89,.14));box-shadow:inset 0 0 0 .5px var(--casora-studio-good-line, rgba(36,138,61,.35))}"
    + ":host(.is-light) .cv-banner button{background:var(--casora-studio-chip, rgba(118,118,128,.14))}"
    + ":host(.is-light.cv-peek) #mapmount::before{background:rgba(0,0,0,.06);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.08)}"
    + ":host(.is-light.cv-peek) #mapmount::after{background:rgba(0,0,0,.035)}";

  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const I = () => window.__casoraPanelInternals || {};
  const stable = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));

  // Was sich zwischen zwei gespeicherten Fassungen geändert hat – knapp, für die Liste.
  // first: erstes Speichern im Studio (noch keine Version) – die angelegte Fassung
  // unterscheidet sich dann in jedem Raum nur im Aufbau, nicht inhaltlich.
  function summarize(before, after, mobileBefore, mobileAfter, first) {
    const out = { added: [], removed: [], changed: [], general: false, phone: false };
    const X = I().extractAny;
    let a = null, b = null;
    try { a = X && before ? X(before) : null; b = X && after ? X(after) : null; } catch (e) { a = b = null; }
    // Was das Speichern selbst an jedem Raum setzt, ist keine Änderung des Nutzers:
    // die abgeleiteten Energie-Unterbadges von Zuhause (deriveEnergyRooms – setzt u. a.
    // energy_subs_auto) und die Markierung casora_ui_managed. Beide Seiten gleich glätten.
    const settle = (st) => {
      const list = (st && st.compact && st.compact.rooms) || [];
      if (!list.length) return st;
      const rs = JSON.parse(JSON.stringify(list));
      rs.forEach((r) => { if (r && r.variables) delete r.variables.casora_ui_managed; });
      if (I().deriveEnergyRooms) { try { I().deriveEnergyRooms(rs); } catch (e) { /* ungeglättet */ } }
      return Object.assign({}, st, { compact: Object.assign({}, st.compact, { rooms: rs }) });
    };
    a = settle(a); b = settle(b);
    const rooms = (s) => ((s && s.compact && s.compact.rooms) || []);
    const by = (list) => new Map(list.map((r) => [r.path, r]));
    // Ohne Vorher-Stand mit Räumen gibt es nichts zu vergleichen: sonst stünde jeder Raum als „geändert“ da.
    if (!before || !a || !rooms(a).length) return "";
    if (first) {
      const A = by(rooms(a)), B = by(rooms(b));
      B.forEach((r, p) => { if (!A.has(p)) out.added.push(r.name || p); });
      A.forEach((r, p) => { if (!B.has(p)) out.removed.push(r.name || p); });
      return out.added.length || out.removed.length ? JSON.stringify(out) : "";
    }
    if (a && b) {
      const A = by(rooms(a)), B = by(rooms(b));
      B.forEach((r, p) => { if (!A.has(p)) out.added.push(r.name || p); });
      A.forEach((r, p) => { if (!B.has(p)) out.removed.push(r.name || p); });
      out.detail = {};
      B.forEach((r, p) => {
        const o = A.has(p) && A.get(p);
        if (o && stable(o) !== stable(r)) {
          out.changed.push(r.name || p);
          const what = roomDiff(o, r);
          if (what.length) out.detail[r.name || p] = what;
        }
      });
    }
    const rest = (c) => { const o = Object.assign({}, c || {}); delete o.views; delete o.button_card_templates; return o; };
    if (!out.added.length && !out.removed.length && !out.changed.length
      && before && after && stable(before.views) !== stable(after.views)) out.general = true;
    if (before && after && stable(rest(before)) !== stable(rest(after))) out.general = true;
    if (mobileBefore && mobileAfter && stable(mobileBefore.views) !== stable(mobileAfter.views)) out.phone = true;
    return JSON.stringify(out);
  }

  // What changed in one room, as short codes (the list words them): photo, name,
  // tiles added/removed/moved/edited, badges, other settings.
  const BADGE_VAR = /^(show_|badge|climate|temp|humid|aqi|light|security|lock|contact|camera|energy|people|person|media|now_playing|motion|window|door|co2|power)/;
  function roomDiff(o, r) {
    const out = [];
    const ov = o.variables || {}, rv = r.variables || {};
    if ((o.name || "") !== (r.name || "")) out.push("name");
    if (stable(ov.image) !== stable(rv.image)) out.push("photo");
    const sig = (t) => { const x = t || {}; return stable([x.type, x.template, x.entity]); };
    const ta = (o.tiles || []).map(sig), tb = (r.tiles || []).map(sig);
    const count = (list) => list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    const ca = count(ta), cb = count(tb);
    let plus = 0, minus = 0;
    cb.forEach((n, k) => { plus += Math.max(0, n - (ca.get(k) || 0)); });
    ca.forEach((n, k) => { minus += Math.max(0, n - (cb.get(k) || 0)); });
    if (plus) out.push("tiles+" + plus);
    if (minus) out.push("tiles-" + minus);
    if (!plus && !minus && stable(ta) !== stable(tb)) out.push("moved");
    else if (!plus && !minus && stable(o.tiles) !== stable(r.tiles)) out.push("tiles");
    const keys = new Set(Object.keys(ov).concat(Object.keys(rv)));
    let badges = false, other = false;
    // Leer ist leer (fehlt, null, "", []), und show_<Badge>: true ist der Standard – kein Unterschied.
    const norm = (k, v) => {
      if (v === null || v === "" || (Array.isArray(v) && !v.length)) v = undefined;
      if (/^show_(climate|lights|people|media|security|energy)$/.test(k) && v === true) v = undefined;
      return stable(v);
    };
    keys.forEach((k) => {
      if (k === "image" || k === "room_name" || norm(k, ov[k]) === norm(k, rv[k])) return;
      if (BADGE_VAR.test(k)) badges = true; else other = true;
    });
    if (badges) out.push("badges");
    const shell = (x) => stable([x._hero, x._row, x._view, x._extraCards]);
    if (other || shell(o) !== shell(r)) out.push("settings");
    return out;
  }
  const WORDS = { name: "Name", photo: "Photo", moved: "Tiles moved", tiles: "Tile settings",
    badges: "Badges", settings: "Settings" };
  const word = (c) => {
    const m = /^tiles([+-])(\d+)$/.exec(c);
    if (m) return t("Tiles") + " " + (m[1] === "+" ? "+" : "\u2212") + m[2];
    return t(WORDS[c] || c);
  };

  // Several saves of the same dashboard a moment apart read as one step in the list:
  // the newest stands for them (its snapshot is the one shown and restored), the
  // summary covers them all. Nothing is dropped on the server.
  const GROUP_MS = 2 * 60 * 1000;
  function mergeSummaries(list) {
    const out = { added: [], removed: [], changed: [], general: false, phone: false, detail: {} };
    let any = false;
    list.forEach((v) => {
      let s = null;
      try { s = v.summary ? JSON.parse(v.summary) : null; } catch (e) { s = null; }
      if (!s) return;
      any = true;
      const add = (arr, xs) => (xs || []).forEach((x) => { if (!arr.includes(x)) arr.push(x); });
      if (s.origin) out.origin = s.origin;  // der älteste Eintrag der Gruppe: angelegt/umgezogen
      add(out.added, s.added); add(out.removed, s.removed); add(out.changed, s.changed);
      out.general = out.general || !!s.general;
      out.phone = out.phone || !!s.phone;
      Object.keys(s.detail || {}).forEach((room) => {
        const have = out.detail[room] || (out.detail[room] = []);
        (s.detail[room] || []).forEach((c) => {
          const m = /^tiles([+-])(\d+)$/.exec(c);
          const at = m ? have.findIndex((x) => x.indexOf("tiles" + m[1]) === 0) : have.indexOf(c);
          if (m && at >= 0) have[at] = "tiles" + m[1] + (Number(have[at].slice(6)) + Number(m[2]));
          else if (at < 0) have.push(c);
        });
      });
    });
    return any ? JSON.stringify(out) : "";
  }
  function groupVersions(list) {
    const out = [];
    let g = null;
    list.forEach((v) => {
      // Angelegt/Importiert/Umgezogen/Vorlagen erneuert sind eigene Schritte, keine Speicherung
      // im Studio – sie bleiben für sich (sonst verschwände z. B. „Angelegt“ in einer Gruppe).
      let origin = false;
      try { origin = !!(v.summary && JSON.parse(v.summary).origin); } catch (e) { origin = false; }
      // Benannte und angeheftete Stände bleiben ebenfalls für sich.
      const plain = (!v.kind || v.kind === "save") && !origin && !v.name && !v.pinned;
      // ts kommt als ISO-Text (versions.py) – erst in Millisekunden, sonst ist der Abstand NaN
      // und nichts wird je zusammengefasst.
      const gap = g ? Date.parse(g.last.ts) - Date.parse(v.ts) : NaN;
      if (g && plain && g.plain && gap <= GROUP_MS && gap >= 0) {
        g.members.push(v);
        g.last = v;
        return;
      }
      g = { head: v, members: [v], last: v, plain };
      out.push(g);
    });
    return out.map((x) => (x.members.length < 2 ? x.head
      : Object.assign({}, x.head, { summary: mergeSummaries(x.members), grouped: x.members.length })));
  }

  function describe(v) {
    if (v.kind === "restore") return t("Restored an earlier version");
    if (v.kind === "initial") return t("Starting point");
    if (v.kind === "outside") return t("Changed outside the Studio");
    let s = null;
    try { s = v.summary ? JSON.parse(v.summary) : null; } catch (e) { s = null; }
    if (!s) return t("Saved");
    const bits = [];
    // Erster Stand aus Anlegen, Import oder Umzug (_flowDone).
    // update: nach einem Casora-Update von der Integration erneuerte Vorlagen (template_refresh.py).
    const ORIGIN = { created: "Created", imported: "Imported", moved: "Moved from Hemma",
      update: "Templates refreshed after a Casora update" };
    if (s.origin && ORIGIN[s.origin]) bits.push(t(ORIGIN[s.origin]));
    ["added", "removed", "changed"].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    // Der Standardname der Übersicht („Home“) in der HA-Sprache („Zuhause“).
    const rn = (n) => (n && I().isDefaultHomeName && I().isDefaultHomeName(n) ? I().homeRoomWord() : n);
    s.added.forEach((n) => bits.push(t("New room") + ": " + rn(n)));
    s.removed.forEach((n) => bits.push(t("Room removed") + ": " + rn(n)));
    // Rooms with a known change say what it was: „Wohnbereich: Foto, Kacheln +1“.
    const det = s.detail || {};
    const told = s.changed.filter((n) => (det[n] || []).length);
    told.slice(0, 2).forEach((n) => bits.push(rn(n) + ": " + det[n].map(word).join(", ")));
    const rest = s.changed.filter((n) => told.slice(0, 2).indexOf(n) < 0);
    // Mehrere Räume: die Zahl vorn („3 Räume geändert: Büro, Flur, Küche …“) statt „+5“ am Ende.
    if (rest.length === 1) bits.push(t("Changed") + ": " + rn(rest[0]));
    else if (rest.length) {
      bits.push(t(told.length ? "{n} more rooms changed" : "{n} rooms changed").replace("{n}", rest.length)
        + ": " + rest.slice(0, 3).map(rn).join(", ") + (rest.length > 3 ? " …" : ""));
    }
    if (s.general) bits.push(t("Dashboard settings"));
    if (s.phone && !bits.length) bits.push(t("Phone layout"));
    const txt = bits.length ? bits.join(" · ") : t("Saved");
    return v.grouped ? txt + " (" + t("{n} saves").replace("{n}", v.grouped) + ")" : txt;
  }

  // Angeheftete Stände oben (je neueste zuerst), darunter die Zeitleiste.
  const pinnedFirst = (list) => list.filter((v) => v.pinned).concat(list.filter((v) => !v.pinned));
  // Der Stand „Jetzt“ – nicht einfach der erste Eintrag, oben können angeheftete stehen.
  const nowOf = (list) => list.find((v) => v.current) || list.find((v) => !v.pinned) || list[0];
  const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/></svg>';
  // Zeile: Name (falls vergeben) groß, darunter Uhrzeit und was sich geändert hat.
  const rowInner = (v, time) => '<span class="cv-dot"></span><span class="cv-tx"><b>'
    + (v.name ? esc(v.name) : esc(time)) + (v.pinned ? '<i class="cv-pin" title="' + esc(t("Pinned")) + '">' + PIN_SVG + "</i>" : "")
    + "</b><span>" + (v.name ? esc(time) + " · " : "") + esc(describe(v)) + "</span></span>"
    + (v.current ? '<span class="cv-now">' + esc(t("Now")) + "</span>" : "");

  // Für die Unit-Tests (dev/unit/zeitreise.mjs).
  window.__casoraVersionsInternals = { summarize, roomDiff, mergeSummaries, groupVersions, describe, pinnedFirst, nowOf };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraVersions) return;
    P.__casoraVersions = true;

    const lang = (self) => String((self._hass && self._hass.locale && self._hass.locale.language)
      || (self._hass && self._hass.language) || navigator.language || "en");
    const fmtTime = (self, d) => d.toLocaleTimeString(lang(self), { hour: "2-digit", minute: "2-digit" });
    const fmtDay = (self, d) => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const day = new Date(d); day.setHours(0, 0, 0, 0);
      const diff = Math.round((today - day) / 86400000);
      if (diff === 0) return t("Today");
      if (diff === 1) return t("Yesterday");
      return d.toLocaleDateString(lang(self), { weekday: "long", day: "numeric", month: "long" });
    };
    const fmtFull = (self, d) => d.toLocaleString(lang(self),
      { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    const css = (self) => {
      if (self.shadowRoot.getElementById("casora-versions-css")) return;
      const st = document.createElement("style");
      st.id = "casora-versions-css";
      st.textContent = CSS;
      self.shadowRoot.appendChild(st);
    };

    // ── Hinweis: Vorlagen nach einem Update erneuert (template_refresh.py) ────
    const hassDesc = Object.getOwnPropertyDescriptor(P, "hass");
    if (hassDesc && hassDesc.set) {
      Object.defineProperty(P, "hass", {
        ...hassDesc,
        set(hass) {
          hassDesc.set.call(this, hass);
          if (this._cvNoticeAsked || !hass || !hass.callWS || !(hass.user && hass.user.is_admin)) return;
          this._cvNoticeAsked = true;
          hass.callWS({ type: "casora/templates/auto_notice", ack: true }).then((r) => {
            const n = r && r.notice && r.notice.count;
            if (!n) return;
            const msg = (n === 1 ? t("1 dashboard brought up to the new templates")
              : t("{n} dashboards brought up to the new templates").replace("{n}", n))
              + " – " + t("see Rewind to undo");
            this._log && this._log(msg + ": " + (r.notice.dashboards || []).join(", "), "ok");
            this.dispatchEvent(new CustomEvent("hass-notification",
              { detail: { message: msg, duration: 8000 }, bubbles: true, composed: true }));
          }).catch(() => { /* ältere Integration ohne den Befehl */ });
        },
      });
    }

    // ── Beim Speichern festhalten ─────────────────────────────────────────────
    // Vorher-Stand für die Zusammenfassung: sie vergleicht Räume, Ansichten und Rest, nie die
    // Vorlagen – die (~2,5 MB je Hälfte) nicht bei jedem Speichern tief kopieren.
    const snapRaw = (r) => {
      if (!r) return null;
      const { button_card_templates: tpl, ...rest } = r;
      const c = JSON.parse(JSON.stringify(rest));
      if (tpl !== undefined) c.button_card_templates = tpl;
      return c;
    };
    const save = P._save;
    P._save = async function () {
      const url_path = this._dashUrl;
      const mobile_url = (this._pair && this._pair.mobileUrl) || null;
      const before = snapRaw(this._raw);
      const mBefore = this._pair ? snapRaw(this._pair.mobileRaw) : null;
      const blocked = isLocked(url_path);
      let first = false;
      if (url_path && this._hass && !blocked) {
        try {
          first = !((await this._hass.callWS({ type: "casora/versions/list", url_path })).versions || []).length;
        } catch (e) { first = false; }
        // Der Stand vor dem Speichern – fällt weg, wenn er schon der letzte ist.
        try { await this._hass.callWS({ type: "casora/versions/snap", url_path, mobile_url, kind: "initial" }); }
        catch (e) { this._log && this._log("versions: " + e.message, "warn"); }
      }
      const ok = await save.apply(this, arguments);
      if (ok && url_path && this._hass) {
        const summary = summarize(before, this._raw, mBefore, this._pair && this._pair.mobileRaw, first);
        // Abwarten: der Server liest den Stand erst beim Festhalten. Liefe das nebenher, könnte
        // ein gleich folgendes Speichern dazwischenkommen – dann hielte dieser Stand schon den
        // nächsten fest, der nächste fiele als „gleich“ weg, und seine Änderung (z. B. Flur)
        // stünde in keiner Zusammenfassung.
        try {
          await this._hass.callWS({ type: "casora/versions/snap", url_path, mobile_url, kind: "save", summary });
          if (this._cvOpen) this._cvRender(true);
        } catch (e) { this._log && this._log("versions: " + e.message, "warn"); }
      }
      return ok;
    };

    // ── Vorschau eines Stands ────────────────────────────────────────────────
    const roomMap = P._roomMap;
    P._roomMap = function () {
      const peek = this._cvPeek;
      if (!peek || !peek.state) return roomMap.apply(this, arguments);
      const s = this._state, r = this._room;
      const rooms = peek.state.compact.rooms;
      const cur = s && s.compact.rooms[r];
      const at = cur ? rooms.findIndex((x) => x.path === cur.path) : -1;
      this._state = peek.state;
      this._room = at >= 0 ? at : 0;
      try { return roomMap.apply(this, arguments); } finally { this._state = s; this._room = r; }
    };

    P._cvBanner = function () {
      const plinth = this.shadowRoot.querySelector(".plinth");
      const mount = this.$("mapmount");
      let b = this.shadowRoot.querySelector(".cv-banner");
      const v = this._cvPeek && this._cvPeek.v;
      if (!v || !plinth || !mount) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement("div");
        b.className = "cv-banner";
        // Die Liste steht neueste zuerst: älter liegt weiter unten (↓), neuer weiter oben (↑).
        b.innerHTML = '<button type="button" class="cv-newer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg></button>'
          + "<b></b>"
          + '<button type="button" class="cv-older"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>';
        b.querySelector(".cv-older").onclick = () => this._cvStep(1);
        b.querySelector(".cv-newer").onclick = () => this._cvStep(-1);
        plinth.insertBefore(b, mount);
      }
      const list = this._cvList || [];
      const i = list.findIndex((x) => x.id === v.id);
      b.querySelector("b").textContent = fmtFull(this, new Date(v.ts));
      b.querySelector(".cv-older").disabled = i >= list.length - 1;
      b.querySelector(".cv-newer").disabled = i <= 0;
      b.querySelector(".cv-older").title = t("Older");
      b.querySelector(".cv-newer").title = t("Newer");
      b.querySelector(".cv-older").setAttribute("aria-label", t("Older"));
      b.querySelector(".cv-newer").setAttribute("aria-label", t("Newer"));
    };

    P._cvShow = async function (v) {
      const tok = (this._cvTok = (this._cvTok || 0) + 1);
      this._cvSel = v ? v.id : null;
      this._cvPaintRows();
      if (!v || v.current) {
        this._cvPeek = null;
        this.classList.remove("cv-peek");
      } else {
        let data = (this._cvCache || {})[v.id];
        if (!data) {
          try {
            data = await this._hass.callWS({ type: "casora/versions/get", url_path: this._dashUrl, version: v.id });
          } catch (e) {
            this._cvError(t("This version could not be read.") + " " + e.message);
            return;
          }
          if (tok !== this._cvTok) return;
          this._cvCache = this._cvCache || {};
          this._cvCache[v.id] = data;
        }
        let state = null;
        try { state = I().extractAny(data.config); } catch (e) { state = null; }
        if (!state || !state.compact || !(state.compact.rooms || []).length) {
          this._cvError(t("This version can't be shown in the preview."));
          return;
        }
        this._cvPeek = { v, state };
        this.classList.add("cv-peek");
      }
      this._cvBanner();
      this._rebuildPreview();
      this._cvActions();
      // Die Liste folgt der Auswahl, auch bei Pfeiltasten.
      const row = this.shadowRoot.querySelector('.cv-row[aria-current="true"]');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    };

    P._cvStep = function (dir) {
      const list = this._cvList || [];
      if (!list.length) return;
      let i = list.findIndex((x) => x.id === this._cvSel);
      if (i < 0) i = 0;
      const j = Math.max(0, Math.min(list.length - 1, i + dir));
      if (j !== i) this._cvShow(list[j]);
    };

    P._cvPaintRows = function () {
      this.shadowRoot.querySelectorAll(".cv-row").forEach((r) =>
        r.setAttribute("aria-current", r.dataset.id === this._cvSel ? "true" : "false"));
    };

    P._cvError = function (msg) {
      const pane = this.$("pane");
      if (!pane) return;
      let e = pane.querySelector(".cv-err");
      if (!e) { e = document.createElement("div"); e.className = "cv-err"; pane.querySelector(".cv-wrap") && pane.querySelector(".cv-wrap").appendChild(e); }
      e.textContent = msg;
    };

    P._cvActions = function () {
      const act = this.shadowRoot.querySelector(".cv-act");
      if (!act) return;
      act.replaceChildren();
      const peek = this._cvPeek;
      const sel = (this._cvList || []).find((x) => x.id === this._cvSel);
      // Benennen und Anheften für jeden gewählten Stand, auch „Jetzt“.
      const tags = sel ? this._cvTagButtons(sel, () => this._cvRender(true)) : null;
      if (!peek) { if (tags) act.append(tags); return; }
      const locked = isLocked(this._dashUrl);
      const go = document.createElement("button");
      go.type = "button";
      go.textContent = t("Restore This Version");
      go.disabled = locked;
      go.onclick = () => this._cvRestore(peek.v);
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ghost";
      back.textContent = t("Back to Now");
      back.onclick = () => this._cvShow(nowOf(this._cvList || []));
      const note = document.createElement("div");
      note.className = "cv-note";
      note.textContent = locked ? t("This dashboard is locked against saving from the Studio.")
        : t("What is saved now stays in the list, so you can always go back.");
      act.append(go, back, note);
      if (tags) act.append(tags);
    };

    // „Benennen…“ und „Anheften“/„Lösen“ für einen Stand; after zeichnet die Liste neu.
    P._cvTagButtons = function (v, after) {
      const box = document.createElement("div");
      box.className = "cv-tags";
      const name = document.createElement("button");
      name.type = "button";
      name.className = "ghost";
      name.textContent = t(v.name ? "Rename…" : "Name…");
      name.onclick = () => this._cvName(v, after);
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "ghost";
      pin.textContent = t(v.pinned ? "Unpin" : "Pin");
      pin.onclick = () => this._cvLabel(v, { pinned: !v.pinned }, after);
      box.append(name, pin);
      return box;
    };
    P._cvName = async function (v, after) {
      const name = await this._ask({ title: t("Name this version"), value: v.name || "",
        placeholder: t("e.g. Before the remodel"), confirmLabel: t("Save") });
      if (name === null || name === undefined || name === false) return;
      // Ein Name heftet den Stand gleich an – sonst räumt das Aufräumen ihn irgendwann weg.
      const patch = { name: String(name).trim() };
      if (patch.name && !v.pinned) patch.pinned = true;
      await this._cvLabel(v, patch, after);
    };
    P._cvLabel = async function (v, patch, after) {
      try {
        await this._hass.callWS(Object.assign({ type: "casora/versions/label", url_path: this._dashUrl, version: v.id }, patch));
      } catch (e) {
        const msg = e && e.code === "too_many" ? t("At most 20 versions can be pinned.") : t("That didn't work.") + " " + ((e && e.message) || "");
        if (this._bToast) this._bToast(msg, { kind: "err" }); else this._cvError(msg);
        return;
      }
      if ("name" in patch) { if (patch.name) v.name = patch.name; else delete v.name; }
      if ("pinned" in patch) { if (patch.pinned) v.pinned = true; else delete v.pinned; }
      this._cvList = null;
      if (this._bToast) this._bToast(t(patch.pinned === true ? "Pinned – kept for good" : patch.pinned === false ? "Unpinned" : "Name saved"), { ms: 2000 });
      if (after) after();
    };

    P._cvRestore = async function (v) {
      if (this._state && this._isDirty && this._isDirty()) {
        const ok = await this._ask({
          title: t("Discard unsaved changes?"),
          message: t("Your edits to the dashboard you were working on have not been saved."),
          confirmLabel: t("Discard"), destructive: true,
        });
        if (!ok) return;
        if (this._discardDraft) this._discardDraft();
      }
      const ok = await this._ask({
        title: t("Restore this version?"),
        message: fmtFull(this, new Date(v.ts)) + " – " + t("The dashboard and its phone layout go back to this version."),
        confirmLabel: t("Restore"),
      });
      if (!ok) return;
      try {
        await this._hass.callWS({ type: "casora/versions/restore", url_path: this._dashUrl, version: v.id });
      } catch (e) {
        this._cvError(t("Restoring didn't work.") + " " + e.message);
        return;
      }
      this._cvPeek = null;
      this._cvCache = {};
      this._cvSel = null;
      this._cvList = null;
      this.classList.remove("cv-peek");
      const banner = this.shadowRoot.querySelector(".cv-banner");
      if (banner) banner.remove();
      await this._load();
      if (this.classList.contains("split")) this._cvOpenPage(true);
    };

    // ── Die Seite ────────────────────────────────────────────────────────────
    // force: Liste neu vom Server holen (sonst die schon geladene zeichnen).
    P._cvRender = async function (force) {
      const pane = this.$("pane");
      if (!pane || !this._cvOpen) return;
      css(this);
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        [...head.children].forEach((c) => { if (!c.classList.contains("cv-head")) c.style.display = "none"; });
        let h = head.querySelector(".cv-head");
        if (!h) {
          h = document.createElement("div");
          h.className = "navrow cv-head";
          h.innerHTML = '<div class="detailbar rootlevel"><h3></h3></div>';
          head.appendChild(h);
        }
        h.querySelector("h3").textContent = t("Rewind");
      }
      const wrap = document.createElement("div");
      wrap.className = "cv-wrap";
      const blurb = document.createElement("p");
      blurb.className = "cv-blurb";
      blurb.textContent = t("Every save is kept here. Pick a version to see it on the right – nothing changes until you restore it.");
      wrap.appendChild(blurb);
      pane.replaceChildren(wrap);
      const act = document.createElement("div");
      act.className = "cv-act";

      let list = !force && this._cvList;
      if (!list) {
        try {
          list = (await this._hass.callWS({ type: "casora/versions/list", url_path: this._dashUrl })).versions || [];
        } catch (e) {
          const er = document.createElement("div");
          er.className = "cv-err";
          er.textContent = t("Rewind could not be loaded.") + " " + e.message;
          wrap.appendChild(er);
          return;
        }
        if (!this._cvOpen || pane.firstChild !== wrap) return;
        list = pinnedFirst(groupVersions(list));
        this._cvList = list;
      }
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "cv-list cv-empty";
        empty.textContent = t("No saved states yet. The first one is kept the next time you save.");
        wrap.appendChild(empty);
        return;
      }
      let day = null, box = null;
      list.forEach((v) => {
        const d = new Date(v.ts);
        const label = v.pinned ? t("Pinned") : fmtDay(this, d);
        if (label !== day) {
          day = label;
          const h = document.createElement("div");
          h.className = "cv-day";
          h.textContent = label;
          h.setAttribute("data-no-i18n", "");
          wrap.appendChild(h);
          box = document.createElement("div");
          box.className = "cv-list";
          wrap.appendChild(box);
        }
        const r = document.createElement("button");
        r.type = "button";
        r.className = "cv-row";
        r.dataset.id = v.id;
        r.setAttribute("data-no-i18n", "");
        r.innerHTML = rowInner(v, v.pinned ? fmtFull(this, d) : fmtTime(this, d));
        r.onclick = () => this._cvShow(v);
        box.appendChild(r);
      });
      wrap.appendChild(act);
      const keep = list.find((x) => x.id === this._cvSel);
      this._cvShow(keep || nowOf(list));
    };

    P._cvOpenPage = function () {
      this._cvOpen = true;
      this._cvRender(true);
      this._cvSideRow();
    };

    P._cvClose = function () {
      if (!this._cvOpen) return;
      this._cvOpen = false;
      this._cvSel = null;
      this._cvList = null;
      this._cvCache = {};
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        const h = head.querySelector(".cv-head");
        if (h) h.remove();
        [...head.children].forEach((c) => { c.style.display = ""; });
      }
      const b = this.shadowRoot.querySelector(".cv-banner");
      if (b) b.remove();
      if (this._cvPeek) {
        this._cvPeek = null;
        this.classList.remove("cv-peek");
        this._rebuildPreview();
      }
    };

    // Jede andere Seite (Klick in der Seitenleiste, Raumwechsel …) läuft über _renderForm.
    const renderForm = P._renderForm;
    P._renderForm = function () {
      const r = renderForm.apply(this, arguments);
      if (this._cvOpen && !this._cvLeaving) this._cvRender();
      return r;
    };

    // ── Seitenleiste ─────────────────────────────────────────────────────────
    P._cvSideRow = function () {
      const host = this.shadowRoot.getElementById("sidesections");
      if (!host || !host.children.length || !this._dashUrl) return;
      let b = host.querySelector(".cv-side");
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "siderow cv-side";
        const ic = document.createElement("span");
        ic.className = "sicon";
        ic.style.setProperty("--i", "url('" + CLOCK + "')");
        ic.style.setProperty("--sc", tint());
        const l = document.createElement("span");
        l.className = "sidelabel";
        l.textContent = t("Rewind");
        b.append(ic, l);
        b.onclick = () => { if (!this._cvOpen) this._cvOpenPage(); };
        host.appendChild(b);
      }
      host.querySelectorAll(".siderow").forEach((row) => {
        const mine = row === b;
        const on = mine ? !!this._cvOpen : (!this._cvOpen && row.dataset.cvOn === "1");
        row.classList.toggle("on", on);
        if (on) row.setAttribute("aria-current", "page"); else row.removeAttribute("aria-current");
      });
    };

    const renderSidebar = P._renderSidebar;
    P._renderSidebar = function () {
      const r = renderSidebar.apply(this, arguments);
      const host = this.shadowRoot.getElementById("sidesections");
      if (host) {
        host.querySelectorAll(".siderow").forEach((row) => {
          if (row.classList.contains("cv-side")) return;
          row.dataset.cvOn = row.classList.contains("on") ? "1" : "";
          // Ein Klick auf eine andere Seite verlässt die Versionen – auch die schon aktive.
          const pick = row.onclick;
          row.onclick = (ev) => {
            if (this._cvOpen) {
              this._cvLeaving = true;
              this._cvClose();
              try {
                if (row.classList.contains("on")) this._renderForm();
                else if (pick) pick.call(row, ev);
              } finally { this._cvLeaving = false; }
              return;
            }
            if (pick) pick.call(row, ev);
          };
        });
      }
      this._cvSideRow();
      return r;
    };

    // Pfeiltasten blättern durch die Stände, solange die Seite offen ist.
    // Die Liste steht neueste zuerst: ↓ = älter (weiter unten), ↑ = neuer.
    const keys = (self) => {
      if (self._cvKeys) return;
      self._cvKeys = (ev) => {
        if (!self._cvOpen || !self.isConnected || ev.defaultPrevented) return;
        if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
        const tag = ((ev.composedPath && ev.composedPath()[0]) || {}).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        ev.preventDefault();
        self._cvStep(ev.key === "ArrowDown" ? 1 : -1);
      };
      window.addEventListener("keydown", self._cvKeys);
    };
    const connected = P.connectedCallback;
    P.connectedCallback = function () {
      const r = connected ? connected.apply(this, arguments) : undefined;
      keys(this);
      return r;
    };
    // Das Panel ist oft schon eingehängt, bevor dieses Modul läuft – dann hier.
    const openPage = P._cvOpenPage;
    P._cvOpenPage = function () {
      keys(this);
      return openPage.apply(this, arguments);
    };

    // ── Menü: auch ohne Seitenleiste (Handy) erreichbar ──────────────────────
    const menuAt = P._menuAt;
    P._menuAt = function (anchor, items, onPick, opts) {
      if (Array.isArray(items) && items.some((x) => x && x.id === "create") && this._dashUrl && !this._flowMode
        && !items.some((x) => x && x.id === "casora_versions")
        && !(this.classList.contains("split") && this.$("sidesections"))) { // mit Seitenleiste steht es dort
        const at = items.findIndex((x) => x && x.id === "delete");
        items = items.slice();
        items.splice(at >= 0 ? at : items.length, 0,
          { id: "casora_versions", label: "Rewind…", icon: "undo", group: "Dashboard", quiet: true });
        const pick = onPick;
        onPick = (id) => (id === "casora_versions" ? this._cvFromMenu() : pick(id));
      }
      return menuAt.call(this, anchor, items, onPick, opts);
    };

    P._cvFromMenu = function () {
      if (this.classList.contains("split") && this.$("sidesections")) return this._cvOpenPage();
      return this._cvSheet();
    };

    // Handy: schlichte Liste im Blatt, ohne Vorschau.
    P._cvSheet = async function () {
      css(this);
      const s = this._flowScreen({ icon: "rewind", title: t("Rewind"),
        lede: t("Every save is kept here. Restoring puts the dashboard back to that version.") });
      let list = [];
      try {
        list = pinnedFirst(groupVersions((await this._hass.callWS({ type: "casora/versions/list", url_path: this._dashUrl })).versions || []));
      } catch (e) {
        this._flowError(t("Rewind could not be loaded.") + " " + e.message);
      }
      const wrap = document.createElement("div");
      wrap.className = "cv-wrap";
      s.body.appendChild(wrap);
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "cv-list cv-empty";
        empty.textContent = t("No saved states yet. The first one is kept the next time you save.");
        wrap.appendChild(empty);
      }
      let day = null, box = null;
      list.forEach((v) => {
        const d = new Date(v.ts);
        const label = v.pinned ? t("Pinned") : fmtDay(this, d);
        if (label !== day) {
          day = label;
          const h = document.createElement("div"); h.className = "cv-day"; h.textContent = label;
          h.setAttribute("data-no-i18n", ""); wrap.appendChild(h);
          box = document.createElement("div"); box.className = "cv-list"; wrap.appendChild(box);
        }
        const item = document.createElement("div");
        item.className = "cv-item";
        const r = document.createElement("button");
        r.type = "button"; r.className = "cv-row"; r.setAttribute("data-no-i18n", "");
        r.dataset.id = v.id;
        r.innerHTML = rowInner(v, v.pinned ? fmtFull(this, d) : fmtTime(this, d));
        if (!v.current) r.onclick = async () => { this._exitFlow(true); await this._cvRestore(v); };
        // „…“: Benennen und Anheften, ohne den Stand gleich wiederherzustellen.
        const more = document.createElement("button");
        more.type = "button"; more.className = "cv-more"; more.textContent = "\u2026";
        more.setAttribute("aria-label", t("More"));
        more.onclick = (ev) => {
          ev.stopPropagation();
          this._menuAt(more, [
            { id: "name", label: v.name ? "Rename…" : "Name…", icon: "pencil" },
            { id: "pin", label: v.pinned ? "Unpin" : "Pin" },
          ], (id) => {
            const again = () => this._cvSheet();
            if (id === "name") this._cvName(v, again);
            else if (id === "pin") this._cvLabel(v, { pinned: !v.pinned }, again);
          });
        };
        item.append(r, more);
        box.appendChild(item);
      });
      this._flowCancel(s.acts);
    };
  });
})();
