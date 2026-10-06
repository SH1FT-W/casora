// Studio B: Orientierung und Wege (UX-Runde 06.10.2026, Vorschläge V-01 … V-14)
//
// Ergänzt das neue Studio (casora-panel-b.js, -b-plus.js, -b-mehr.js) um das, was die
// Nutzertests an Orientierung vermisst haben:
// - Drei Ebenen sichtbar: Leiste von klein (Raum) nach groß (alle Dashboards), „Gilt für: …“
//   in Menüs und im Inspektor
// - Inspektor-Kopf mit Weg („Wohnzimmer › Kacheln“) und Geltungsbereich, auch im Handy-Blatt
// - Untertitel der Reiter (Inhalt, Dashboard, Einstellungen) als Hinweis und im Inhalt-Blatt
// - Wörterbuch: Badges und Popups mit einem Halbsatz erklärt
// Datenmodell, Speichern und Rückgängig bleiben die des Panels – hier wird nur angeschlossen.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));

  // Untertitel der Reiter (V-02): ein Satz, was darin steckt.
  const SUB = {
    list: "Photo, badges, tiles and popups of {room}",
    dash: "Look, weather, time, notifications and scenes – for this dashboard",
    home: "Home, bell, AI and updates – for all dashboards",
  };

  // Fachwörter mit Halbsatz (V-08): in der Inhalt-Liste unter „Badges“ und „Popups“.
  const WHAT = { Badges: "The small facts at the top of the room", Popups: "The window that opens when you tap a tile" };

  // Geltungsbereich (V-01): dieser Raum · dieses Dashboard · alle Dashboards.
  // ctx: { sel: {group, key} | null, page: "settings" | "updates" | "rewind" | null, arrange, list,
  //        dashSection(key) → true, wenn der Abschnitt zum ganzen Dashboard gehört }
  function scopeOf(ctx) {
    if (ctx.page === "settings" || ctx.page === "updates") return "all";
    if (ctx.page === "rewind" || ctx.arrange) return "dash";
    const sel = ctx.sel;
    if (!sel) return ctx.list ? "room" : "";
    if (sel.group === "tiles" || sel.group === "badges") return "room";
    if (sel.group === "rooms") {
      if (sel.key === "General") return "design";
      return ctx.dashSection && ctx.dashSection(sel.key) ? "dash" : "room";
    }
    return "";
  }
  const SCOPE = {
    room: "Applies to: {room}",
    thisroom: "Applies to: this room",
    dash: "Applies to: this dashboard",
    design: "Applies to: this dashboard – the design to all dashboards",
    all: "Applies to: all dashboards",
  };

  // Weg über dem Titel (V-07): wo liegt das Geöffnete? Nur bei Teilen eines Raums – Dashboard
  // und Einstellungen sagt schon die Zeile „Gilt für“. Ergebnis: Liste von Wörtern (ohne Titel).
  function pathOf(ctx) {
    const sel = ctx.sel;
    if (!sel || ctx.page) return [];
    if (sel.group === "tiles") return [ctx.room, "Tiles"];
    if (sel.group === "badges") return [ctx.room, "Badges"];
    if (sel.group === "rooms" && scopeOf(ctx) === "room") return [ctx.room];
    return [];
  }

  W.__casoraStudioUx = { SUB, WHAT, SCOPE, scopeOf, pathOf };
  if (typeof customElements === "undefined" || !W.document) return;

  const CSS = `
    /* Grauer Satz unter dem Titel im Inspektor (Inhalt-Blatt) */
    .insphead.uxhas { height:auto !important; min-height:0 !important; }
    .insphead.uxhas > .navrow.uxrow { margin-bottom:20px !important; }
    .insphead .uxpath { position:absolute !important; inset:auto !important; left:var(--uxl, 0px) !important; right:0 !important;
      top:calc(100% + 1px) !important; display:block !important; height:auto !important;
      font-size:12.5px; line-height:1.3; font-weight:500; color:var(--ink-2, rgba(127,127,127,.95));
      white-space:normal; overflow:hidden; pointer-events:none; text-shadow:none; }
    :host(.bmode.phone) .inspector .insphead .uxpath { color:color-mix(in srgb, var(--ink) 55%, transparent) !important; }
    /* Halbsatz unter „Badges“ / „Popups“ */
    .uxwhat { display:block; margin-top:1px; font-size:12.5px; line-height:1.3; font-weight:500; letter-spacing:0;
      color:var(--ink-2, rgba(127,127,127,.95)); white-space:normal; text-shadow:none; }
    /* Leiter in der Werkzeugleiste: Raum | Dashboard | alle Dashboards */
    .btools .btool[data-b="dash"], .btools .btool[data-b="home"] { position:relative; margin-left:13px; }
    .btools .btool[data-b="dash"]::before, .btools .btool[data-b="home"]::before { content:""; position:absolute; left:-8px; top:9px; bottom:9px;
      width:1px; background:var(--hair, rgba(127,127,127,.28)); pointer-events:none; }
    /* „Gilt für: …“ oben im Menü */
    .combo-menu > .combo-intro { padding:6px 12px 8px; margin:0 0 4px; font-size:12.5px; line-height:1.3; font-weight:500;
      color:var(--ink-2, rgba(127,127,127,.95)); border-bottom:.5px solid var(--hair, rgba(127,127,127,.2)); white-space:normal; }
    .combo-opt .uxsub { display:block; font-size:12px; line-height:1.25; font-weight:500; opacity:.62; margin-top:1px; white-space:normal; }
    .combo-opt:has(.uxsub) .lbl { display:flex; flex-direction:column; }
    :host(.bmode.phone) .inspector .uxwhat { color:color-mix(in srgb, var(--ink) 55%, transparent) !important; }
  `;

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraUx) return;
    P.__casoraUx = true;
    const wrap = (name, make) => { const orig = P[name]; if (typeof orig === "function") P[name] = make(orig); };
    const on = (p) => p.classList.contains("bmode") && !p.classList.contains("flow");
    const rooms$ = (p) => (p._state && p._state.compact && p._state.compact.rooms) || [];
    const room$ = (p) => rooms$(p)[p._room];

    P._uxCss = function () {
      const root = this.shadowRoot;
      if (root && !root.getElementById("bux-css")) {
        const st = document.createElement("style");
        st.id = "bux-css";
        st.textContent = CSS;
        root.appendChild(st);
      }
    };

    // ── Untertitel der Reiter (V-02) ─────────────────────────────────────
    P._uxRoomName = function () {
      const r = room$(this);
      return r ? this._roomLabel(r) : "";
    };
    P._uxTips = function () {
      const root = this.shadowRoot;
      const room = this._uxRoomName();
      const set = (sel, key) => root.querySelectorAll(sel).forEach((b) => {
        const t = fill(tr(SUB[key]), { room });
        if (b.title !== t) b.title = t;
      });
      set('.btools [data-b="list"]', "list");
      set('.btools [data-b="dash"]', "dash");
      set('.btools [data-b="home"]', "home");
    };

    // Grauer Satz unter dem Titel des Inspektors.
    P._uxScope = function () {
      const I = W.__casoraPanelInternals || {};
      const page = this._csOpen ? "settings" : this._cuOpen ? "updates" : this._cvOpen ? "rewind" : null;
      const list = !!this._bOpen && !this._sel && !page && !this._bRooms;
      return scopeOf({ sel: this._sel, page, arrange: !!this._bRooms && !this._sel && !page, list,
        dashSection: (k) => !!(I.SECTIONS || []).find((x) => x.group === "rooms" && x.label === k && x.scope === "dashboard") });
    };
    P._uxScopeText = function (sc) {
      return SCOPE[sc] ? fill(tr(SCOPE[sc]), { room: this._uxRoomName() }) : "";
    };
    P._uxHeadText = function () {
      if (!this._state || !(this._bOpen || (this._bPage && this._bPage()))) return "";
      const sc = this._uxScope();
      if (sc === "room" && !this._sel) return fill(tr(SUB.list), { room: this._uxRoomName() });
      // Teil eines Raums: „Wohnzimmer › Kacheln · Gilt für: diesen Raum“.
      const I = W.__casoraPanelInternals || {};
      const page = this._csOpen || this._cuOpen || this._cvOpen;
      const path = pathOf({ sel: this._sel, page, room: this._uxRoomName(),
        dashSection: (k) => !!(I.SECTIONS || []).find((x) => x.group === "rooms" && x.label === k && x.scope === "dashboard") });
      if (path.length) return path.map((x, i) => (i ? tr(x) : x)).join(" \u203a ") + " \u00b7 " + tr(SCOPE.thisroom);
      return this._uxScopeText(sc);
    };
    P._uxHead = function () {
      const root = this.shadowRoot;
      const head = root && root.querySelector(".inspector > .insphead");
      if (!head) return;
      const text = on(this) ? this._uxHeadText() : "";
      const rows = [...head.querySelectorAll(":scope > .navrow")];
      const row = rows.reverse().find((r) => r.style.display !== "none" && getComputedStyle(r).display !== "none");
      head.querySelectorAll(".uxpath").forEach((n) => { if (!text || n.parentElement !== row) n.remove(); });
      rows.forEach((r) => {
        r.classList.toggle("uxrow", !!text && r === row);
        if (!(text && r === row)) r.style.removeProperty("margin-bottom");
      });
      head.classList.toggle("uxhas", !!text && !!row);
      if (!text || !row) return;
      let line = row.querySelector(":scope > .uxpath");
      if (!line) {
        line = document.createElement("div");
        line.className = "uxpath";
        line.setAttribute("data-no-i18n", "");
        row.appendChild(line);
      }
      if (line.textContent !== text) line.textContent = text;
      line.title = text;
      // Bündig mit dem Titel (hinter „Zurück“).
      const h = row.querySelector("h3");
      const l = h && h.getClientRects().length ? Math.max(0, Math.round(h.getBoundingClientRect().left - row.getBoundingClientRect().left)) : 0;
      line.style.setProperty("--uxl", l + "px");
      // Zweizeilig (schmales Blatt): Platz darunter nach der echten Höhe.
      row.style.setProperty("margin-bottom", Math.max(20, line.offsetHeight + 6) + "px", "important");
    };

    // Handy: Überschriften im Inhalt-Blatt mit Untertitel.
    P._uxPhoneHeads = function () {
      if (!this.classList.contains("phone")) return;
      const heads = [...this.shadowRoot.querySelectorAll("#pane .sidehead.phonehead, .inspector .sidehead.phonehead")];
      if (!heads.length) return;
      // „nur dieses Dashboard“ → dieselbe Zeile wie überall: „Gilt für: dieses Dashboard“.
      heads.slice(1).forEach((h) => { const sm = h.querySelector("small"); const t = tr(SCOPE.dash); if (sm && sm.textContent !== t) { sm.textContent = t; sm.setAttribute("data-no-i18n", ""); } });
      const first = heads[0];
      if (first && !first.querySelector("small")) {
        first.appendChild(Object.assign(document.createElement("small"), { textContent: fill(tr(SUB.list), { room: this._uxRoomName() }) }));
      }
    };

    // Badges und Popups: ein Halbsatz unter dem Wort (Liste am Desktop und Blatt am Handy).
    P._uxWhat = function () {
      const pane = this.shadowRoot.getElementById("pane");
      if (!pane) return;
      pane.querySelectorAll(".grouphead.stackhead > h3, .card.grouprow > .chead > h2").forEach((h) => {
        if (h.querySelector(".uxwhat")) return;
        const t = [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
        const k = Object.keys(WHAT).find((x) => x === t || tr(x) === t);
        if (!k) return;
        const s = document.createElement("small");
        s.className = "uxwhat";
        s.setAttribute("data-no-i18n", "");
        s.textContent = tr(WHAT[k]);
        h.appendChild(s);
      });
    };

    P._uxPaint = function () {
      if (!this.shadowRoot) return;
      this._uxCss();
      this._uxTips();
      this._uxHead();
      this._uxPhoneHeads();
      this._uxWhat();
    };

    // ── Menüs: „Gilt für: …“ oben (V-01) ───────────────────────────────
    wrap("_menuAt", (orig) => function (anchor, items, onPick, mopts) {
      let intro = "", subs = null;
      if (on(this) && Array.isArray(items)) {
        if (items.some((x) => x && /^sec:/.test(x.id || ""))) {
          intro = tr(SCOPE.dash);
          // Die Zeile oben sagt es schon – keine zweite Überschrift „Nur dieses Dashboard“.
          items = items.map((x) => (x && /^sec:/.test(x.id || "") ? { ...x, quiet: true } : x));
          subs = { General: "The design applies to all dashboards" };
        } else if (items.some((x) => x && /^page:/.test(x.id || ""))) {
          intro = tr(SCOPE.all);
          items = items.map((x) => (x && (/^page:/.test(x.id || "") || x.id === "updates") ? { ...x, quiet: true } : x));
        }
      }
      const r = orig.call(this, anchor, items, onPick, mopts);
      if (intro) {
        const menus = this.shadowRoot.querySelectorAll(".combo-menu");
        const menu = menus[menus.length - 1];
        if (menu && !menu.querySelector(".combo-intro")) {
          const d = document.createElement("div");
          d.className = "combo-intro";
          d.setAttribute("data-no-i18n", "");
          d.textContent = intro;
          menu.insertBefore(d, menu.firstChild);
          if (subs) Object.keys(subs).forEach((k) => {
            const it = items.find((x) => x && x.id === "sec:" + k);
            const opt = it && [...menu.querySelectorAll(".combo-opt")].find((o) => {
              const l = o.querySelector(".lbl");
              return l && (l.textContent === it.label || l.textContent === tr(it.label));
            });
            const lbl = opt && opt.querySelector(".lbl");
            if (lbl && !lbl.querySelector(".uxsub")) {
              const sm = document.createElement("span");
              sm.className = "uxsub";
              sm.setAttribute("data-no-i18n", "");
              sm.textContent = tr(subs[k]);
              lbl.appendChild(sm);
            }
          });
        }
      }
      return r;
    });

    // ── Anschließen ─────────────────────────────────────────────────────
    const after = (name) => wrap(name, (orig) => function () {
      const r = orig.apply(this, arguments);
      try { if (this.classList.contains("bmode")) this._uxPaint(); } catch (e) { console.warn("Casora Studio:", e); }
      if (r && typeof r.then === "function") r.then(() => { try { if (this.classList.contains("bmode")) this._uxPaint(); } catch (e) { /* egal */ } });
      return r;
    });
    ["_renderForm", "_bApply", "_bRoomsPaint", "_csOpenPage", "_cuOpenPage", "_cvRender"].forEach(after);
  });
})();
