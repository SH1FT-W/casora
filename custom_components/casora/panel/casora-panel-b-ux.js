// Studio B: Orientierung und Wege (UX-Runde 06.10.2026, Vorschläge V-01 … V-14)
//
// Ergänzt das neue Studio (casora-panel-b.js, -b-plus.js, -b-mehr.js) um das, was die
// Nutzertests an Orientierung vermisst haben:
// - Untertitel der Reiter (Inhalt, Dashboard, Einstellungen) als Hinweis und im Inhalt-Blatt
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

  W.__casoraStudioUx = { SUB };
  if (typeof customElements === "undefined" || !W.document) return;

  const CSS = `
    /* Grauer Satz unter dem Titel im Inspektor (Inhalt-Blatt) */
    .insphead.uxhas { height:auto !important; min-height:0 !important; }
    .insphead.uxhas > .navrow.uxrow { margin-bottom:20px !important; }
    .insphead .uxpath { position:absolute !important; inset:auto !important; left:var(--uxl, 0px) !important; right:0 !important;
      top:calc(100% + 1px) !important; display:block !important; height:auto !important;
      font-size:12.5px; line-height:1.3; font-weight:500; color:var(--ink-2, rgba(127,127,127,.95));
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none; text-shadow:none; }
    :host(.bmode.phone) .inspector .insphead .uxpath { color:color-mix(in srgb, var(--ink) 55%, transparent) !important; }
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
    P._uxHeadText = function () {
      if (!this._state || !this._bOpen || this._sel || (this._bPage && this._bPage()) || this._bRooms) return "";
      return fill(tr(SUB.list), { room: this._uxRoomName() });
    };
    P._uxHead = function () {
      const root = this.shadowRoot;
      const head = root && root.querySelector(".inspector > .insphead");
      if (!head) return;
      const text = on(this) ? this._uxHeadText() : "";
      const rows = [...head.querySelectorAll(":scope > .navrow")];
      const row = rows.reverse().find((r) => r.style.display !== "none" && getComputedStyle(r).display !== "none");
      head.querySelectorAll(".uxpath").forEach((n) => { if (!text || n.parentElement !== row) n.remove(); });
      rows.forEach((r) => r.classList.toggle("uxrow", !!text && r === row));
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
    };

    // Handy: Überschriften im Inhalt-Blatt mit Untertitel.
    P._uxPhoneHeads = function () {
      if (!this.classList.contains("phone")) return;
      const heads = [...this.shadowRoot.querySelectorAll("#pane .sidehead.phonehead, .inspector .sidehead.phonehead")];
      if (!heads.length) return;
      const first = heads[0];
      if (first && !first.querySelector("small")) {
        first.appendChild(Object.assign(document.createElement("small"), { textContent: fill(tr(SUB.list), { room: this._uxRoomName() }) }));
      }
    };

    P._uxPaint = function () {
      if (!this.shadowRoot) return;
      this._uxCss();
      this._uxTips();
      this._uxHead();
      this._uxPhoneHeads();
    };

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
