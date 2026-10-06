// Studio B: Orientierung und Wege (UX-Runde 06.10.2026, Vorschläge V-01 … V-14)
//
// Ergänzt das neue Studio (casora-panel-b.js, -b-plus.js, -b-mehr.js) um das, was die
// Nutzertests an Orientierung vermisst haben:
// - Drei Ebenen sichtbar: Leiste von klein (Raum) nach groß (alle Dashboards), „Gilt für: …“
//   in Menüs und im Inspektor
// - Inspektor-Kopf mit Weg („Wohnzimmer › Kacheln“) und Geltungsbereich, auch im Handy-Blatt
// - „…“ heißt „Hilfe & Extras“: Einführung, Tastenkürzel, Assistenten, Import, Hilfe; alles über
//   das Dashboard steht im Titelmenü; am Handy Rückgängig und Zeitreise oben sichtbar
// - Hinzufügen vom Gerät her: „Was soll auf das Dashboard?“ – Gerät suchen, Casora wählt die
//   Kachelart; die bisherige Typauswahl bleibt als „Andere Kachelart …“
// - Kachel-Editor gestuft: oben Gerät, Name, Symbol, An/Aus; „Sichtbar & sicher“ und „Popup“
//   zugeklappt mit Zusammenfassung rechts (aufgeklappt bleibt, was man einmal geöffnet hat)
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

  // ── Hinzufügen vom Gerät her (V-04) ────────────────────────────────────────────────
  // Kachelart je Domain (wie der Geräte-Assistent, casora-panel-assist.js); Rest: „Gerät mit Tasten“.
  const BY_DOMAIN = { light: "light", climate: "thermostat", media_player: "media", fan: "fan", cover: "cover", lock: "lock",
    vacuum: "vacuum", humidifier: "humidifier", camera: "casora_camera", alarm_control_panel: "casora_alarm", switch: "casora_switch",
    input_boolean: "entity_actions", script: "entity_actions", scene: "entity_actions", button: "entity_actions",
    input_button: "entity_actions", remote: "entity_actions" };
  const ADD_DOMAINS = Object.keys(BY_DOMAIN);
  // Alltagswörter je Kachelart – „Licht“ findet auch „Stehlampe“.
  const WORDS = { light: "licht lampe leuchte light lamp", cover: "jalousie rollladen rollo markise blind", thermostat: "heizung thermostat klima heating",
    media: "fernseher tv musik lautsprecher speaker", lock: "schloss tür tuer lock", vacuum: "sauger staubsauger saugroboter vacuum",
    casora_switch: "schalter steckdose switch plug", fan: "ventilator lüfter fan", casora_camera: "kamera camera", casora_alarm: "alarm sicherheit" };
  function typeFor(entity, typeIds, suggested) {
    if (suggested && typeIds.has(suggested)) return suggested;
    const t = BY_DOMAIN[String(entity || "").split(".")[0]];
    if (t && typeIds.has(t)) return t;
    return typeIds.has("entity_actions") ? "entity_actions" : null;
  }
  const foldTx = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
  // Geräte-Treffer: jedes Wort muss in Name, Bereich oder Art vorkommen; vorn im Namen zählt mehr,
  // Neues (ohne Kachel) und Vorschläge des Assistenten vor Vorhandenem.
  function rankDevices(list, q, max) {
    const toks = foldTx(q).split(/\s+/).filter(Boolean);
    const out = [];
    list.forEach((c, i) => {
      const name = foldTx(c.name), all = name + " " + foldTx(c.area) + " " + foldTx(c.kind) + " " + foldTx(c.words);
      let sc = 0;
      for (const t of toks) {
        if (all.indexOf(t) < 0) return;
        sc += name.indexOf(t) === 0 ? 30 : name.indexOf(" " + t) >= 0 ? 20 : name.indexOf(t) >= 0 ? 10 : 4;
      }
      sc += (c.fresh ? 6 : 0) + (c.suggested ? 4 : 0) + (c.here ? 3 : 0);
      out.push({ c, sc, i });
    });
    out.sort((a, b) => b.sc - a.sc || a.i - b.i);
    return out.slice(0, max || 40).map((x) => x.c);
  }

  W.__casoraStudioUx = { SUB, WHAT, SCOPE, scopeOf, pathOf, typeFor, rankDevices, BY_DOMAIN };
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
    /* Handy: Rückgängig und Zeitreise sichtbar oben (V-09) */
    :host(.bmode.phone:not(.flow)) .toprow > .navpill > button#undo,
    :host(.bmode.phone:not(.flow)) .toprow > .navpill > button#brewind.has { display:inline-flex !important; align-items:center; justify-content:center;
      width:36px; min-width:36px; padding:0; }
    :host(.bmode.phone:not(.flow)) .toprow > .navpill > button#undo:disabled { opacity:.38; }
    :host(.bmode.phone:not(.flow)) .toprow > .navpill > button#brewind svg,
    :host(.bmode.phone:not(.flow)) .toprow > .navpill > button#undo svg { width:20px; height:20px; }
    /* Hinzufügen vom Gerät her */
    .uxadd .uxaddh { padding:14px 16px 0; font-size:15px; }
    .uxadd .uxaddh b { font-weight:650; }
    .uxadd .mres { min-height:120px; }
    .uxadd .uxmore { display:flex; flex-wrap:wrap; gap:6px; padding:8px 10px 12px; border-top:.5px solid var(--hair, rgba(127,127,127,.22)); }
    .uxadd .uxlink { border:0; border-radius:999px; padding:6px 12px; font:inherit; font-size:13px; font-weight:600; cursor:pointer;
      background:var(--wash-fill, rgba(118,118,128,.12)); color:var(--ink-2, inherit); box-shadow:none; }
    .uxadd .uxlink:hover { color:var(--ink, inherit); }
    .btools .btool.uxplus { padding:0 8px; }
    :host(.phone) .uxadd .mbox { max-height:82vh; }
    /* Kachel-Editor: zugeklappte Gruppen mit Zusammenfassung rechts */
    .advsum .uxsum { margin-left:auto; padding-left:10px; min-width:0; max-width:62%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      font-weight:500; color:var(--ink-3, var(--ink-2, rgba(127,127,127,.9))); text-align:right; }
    .adv.open .advsum .uxsum { display:none; }
    .tile > .tbody > .adv.uxvis .advbody > .subcard { margin:0 0 10px; padding:0; background:none; box-shadow:none; }
    .tile > .tbody > .adv.uxvis .advbody > .row:first-child { padding-top:2px; }
    /* Tastenkürzel */
    .uxkeys { display:grid; grid-template-columns:auto 1fr; gap:8px 14px; margin:2px 4px 6px; font-size:14px; align-items:center; }
    .uxkeys kbd { font:inherit; font-size:12.5px; font-weight:650; padding:2px 7px; border-radius:7px; white-space:nowrap; justify-self:start;
      background:var(--wash-fill, rgba(118,118,128,.14)); }
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
      // Zeitreise (V-06): „Frühere Stände · Gilt für: dieses Dashboard“.
      if (this._cvOpen) return tr("Earlier versions") + " \u00b7 " + this._uxScopeText(sc);
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
      this._uxMore();
      this._uxAddBtn();
      this._uxTileEditor();
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

    // ── „…“ = Hilfe & Extras, Titelmenü = dieses Dashboard (V-09) ─────────
    const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    wrap("_menuAt", (orig) => function (anchor, items, onPick, mopts) {
      if (on(this) && Array.isArray(items) && items.some((x) => x && x.id === "hints")) {
        const phone = this.classList.contains("phone");
        // Was oben sichtbar ist (Handy: Rückgängig, Zeitreise) und was zum Dashboard gehört
        // (Dashboard öffnen → Titelmenü), steht hier nicht noch einmal.
        const DROP = phone ? ["casora_versions", "open"] : ["casora_versions"];
        items = items.filter((x) => !(x && DROP.indexOf(x.id) >= 0));
        if (!phone && !items.some((x) => x && x.id === "uxkeys")) {
          // Hinter „Hinweise“: „Kurze Einführung“ (casora-panel-b-plus.js) rückt davor.
          const h = items.findIndex((x) => x && x.id === "hints");
          items = items.slice();
          items.splice(h + 1, 0, { id: "uxkeys", label: "Keyboard shortcuts", icon: "help", group: items[h].group });
          const pick = onPick;
          onPick = (id) => (id === "uxkeys" ? setTimeout(() => this._uxKeys(anchor), 60) : pick(id));
        }
        const r = orig.call(this, anchor, items, onPick, mopts);
        // Handy: die Zeitreise fügt casora-panel-versions.js ganz innen an – sie steht oben neben
        // Rückgängig und im Titelmenü, hier nicht noch einmal.
        // Ebenso Rückgängig und Suchen (beides oben); Wiederholen und „N Änderungen“ bleiben.
        if (phone) this._uxDropOpt(["Rewind…", "Rewind", "Undo", "Search…"]);
        return r;
      }
      return orig.call(this, anchor, items, onPick, mopts);
    });
    P._uxDropOpt = function (labels) {
      const menus = this.shadowRoot.querySelectorAll(".combo-menu");
      const menu = menus[menus.length - 1];
      if (!menu) return;
      const want = new Set(labels.concat(labels.map(tr)));
      menu.querySelectorAll(".combo-opt").forEach((o) => {
        const l = o.querySelector(".lbl");
        if (!l || !want.has(l.textContent.trim())) return;
        const g = o.dataset.g;
        o.remove();
        if (!menu.querySelector('.combo-opt[data-g="' + g + '"]')) menu.querySelectorAll('.combo-head[data-g="' + g + '"], .combo-sep[data-g="' + g + '"]').forEach((n) => n.remove());
      });
    };
    P._uxKeys = function (anchor) {
      const m = isMac();
      const K = [[m ? "⌘K" : "Ctrl+K", "Search"], [m ? "⌘Z" : "Ctrl+Z", "Undo"], [m ? "⇧⌘Z" : "Ctrl+Y", "Redo"],
        [m ? "⌘S" : "Ctrl+S", "Save"], ["Esc", "Close"], ["Enter", "Edit the selected item"],
        [m ? "⌥ ←/→" : "Alt+←/→", "Move a tile or badge"]];
      const box = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = tr("Keyboard shortcuts");
      const g = document.createElement("div");
      g.className = "uxkeys";
      K.forEach(([k, t]) => {
        const a = document.createElement("kbd");
        a.textContent = k;
        const b = document.createElement("span");
        b.textContent = tr(t);
        g.append(a, b);
      });
      box.setAttribute("data-no-i18n", "");
      box.append(h, g);
      if (this._mPop) this._mPop(anchor || this.shadowRoot.getElementById("more"), box, "uxkeyspop");
    };
    // Titelmenü: Zeitreise (auch am Handy) und am Handy „Dashboard öffnen“.
    wrap("_bDocItems", (orig) => function () {
      const items = orig.apply(this, arguments);
      if (!this._dashUrl || this._flowMode || !on(this)) return items;
      const out = items.slice();
      const at = out.findIndex((x) => x.id === "doc:qr" || x.id === "doc:addmobile" || x.id === "doc:delete");
      const g = (out[0] && out[0].group) || "This dashboard";
      const add = [];
      if (typeof this._cvFromMenu === "function" && !out.some((x) => x.id === "doc:versions")) add.push({ id: "doc:versions", label: "Rewind", icon: "clock", group: g });
      if (this.classList.contains("phone")) add.unshift({ id: "doc:open", label: "Open dashboard", icon: "open", group: g });
      out.splice(at >= 0 ? at : out.length, 0, ...add);
      return out;
    });
    wrap("_bDocPick", (orig) => function (id) {
      if (id === "doc:open") { this._bRooms = false; if (this._openDash) this._openDash(true); return true; }
      return orig.apply(this, arguments);
    });
    P._uxMore = function () {
      const more = this.shadowRoot.getElementById("more");
      if (!more) return;
      const t = tr("Help & extras");
      if (more.title !== t) { more.title = t; more.setAttribute("aria-label", t); }
      // Handy: Zeitreise-Knopf neben Rückgängig (casora-panel-b-plus.js legt ihn an).
      if (this._bRewindBtn) this._bRewindBtn();
    };

    // ── Hinzufügen vom Gerät her (V-04) ─────────────────────────────────
    // Alle Geräte, die eine Kachel tragen können: [{entity, name, area, roomIndex, type, kind, fresh, suggested}]
    P._uxDevices = function () {
      const h = this._hass || {};
      const I = W.__casoraPanelInternals || {};
      const R = h.entities || {}, D = h.devices || {}, S = h.states || {}, A = h.areas || {};
      const rooms = rooms$(this);
      const types = (I.TILE_TYPES || []).filter((t) => !t.hidden);
      const typeIds = new Set(types.map((t) => t.id));
      const label = (id) => { const t = types.find((x) => x.id === id); return t ? tr(t.label) : ""; };
      const A2 = W.casoraAssist;
      const used = A2 && A2.usedEntities ? A2.usedEntities(rooms, h) : new Set();
      // Vorschläge des Geräte-Assistenten: Geräte ohne Kachel, mit erkannter Art (Drucker, Waschmaschine …).
      let sugg = [];
      try { sugg = A2 && A2.suggest ? A2.suggest(h, rooms.map((r) => ({ name: r.name, tiles: r.tiles || [] })), types) : []; } catch (e) { sugg = []; }
      const byEntity = new Map(sugg.map((x) => [x.entity, x]));
      const areaOf = (id) => { const e = R[id]; return (e && (e.area_id || (D[e.device_id] || {}).area_id)) || null; };
      const roomOfArea = new Map();
      rooms.forEach((r, i) => { const a = this._roomArea ? this._roomArea(r) : null; if (a && !roomOfArea.has(a)) roomOfArea.set(a, i); });
      const out = [];
      const seen = new Set();
      const push = (id, name, suggested) => {
        if (seen.has(id) || !S[id]) return;
        const e = R[id];
        if (e && (e.hidden || e.entity_category || e.disabled_by)) return;
        const type = typeFor(id, typeIds, suggested);
        if (!type) return;
        seen.add(id);
        const aid = areaOf(id);
        const ri = aid && roomOfArea.has(aid) ? roomOfArea.get(aid) : -1;
        out.push({ entity: id, name: name || (S[id].attributes || {}).friendly_name || id, area: aid && A[aid] ? A[aid].name : "",
          roomIndex: ri, type, kind: label(type), fresh: !used.has(id), suggested: !!suggested, here: ri === this._room,
          words: WORDS[type] || "" });
      };
      sugg.forEach((x) => push(x.entity, x.name, x.type));
      Object.keys(S).forEach((id) => { if (ADD_DOMAINS.indexOf(id.split(".")[0]) >= 0) push(id, "", byEntity.has(id) ? byEntity.get(id).type : null); });
      return out;
    };

    // Die bisherige Typauswahl („Andere Kachelart …“) – unverändert aus casora-panel-b.js.
    const addTile0 = P._bAddTile;
    P._uxAddByType = function () { return addTile0.apply(this, arguments); };
    P._bAddTile = function () {
      if (!on(this) || !this._state) return addTile0.apply(this, arguments);
      return this._uxAdd();
    };

    P._uxAdd = function () {
      if (!this._state) return;
      if (this._mCss) this._mCss();
      this._uxCss();
      if (this._openCombo) this._openCombo();
      if (this._mPopClose) this._mPopClose();
      if (this._bToastHide) this._bToastHide();
      const root = this.shadowRoot;
      if (root.querySelector(".uxadd")) { root.querySelector(".uxadd input").focus(); return; }
      // Immer nur ein Blatt: am Handy schließt das Inhalt-Blatt, bevor dieses aufgeht.
      if (this.classList.contains("phone") && this.classList.contains("binsp")) this._bClose();
      const phone = this.classList.contains("phone");
      const from = root.activeElement;
      const room = room$(this);
      const roomName = this._uxRoomName();
      const I = W.__casoraPanelInternals || {};
      const overview = !!(room && I.isHomeRoom && I.isHomeRoom(room, rooms$(this)) && !(this._roomArea && this._roomArea(room)));
      const all = this._uxDevices();
      const box = document.createElement("div");
      box.className = "msearch uxadd";
      box.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><div class="uxaddh"><b></b></div><div class="mfield">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
        + '<input type="text" enterkeyhint="go" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="uxres" aria-autocomplete="list">'
        + '<span class="mesc">esc</span></div><div class="mres" id="uxres" role="listbox"></div><div class="uxmore"></div></div>';
      box.setAttribute("data-no-i18n", "");
      box.querySelector(".uxaddh b").textContent = tr("What should go on the dashboard?");
      box.querySelector(".mbox").setAttribute("aria-label", tr("What should go on the dashboard?"));
      const input = box.querySelector("input");
      input.placeholder = tr("Search a device, e.g. floor lamp");
      input.setAttribute("aria-label", tr("Search a device"));
      if (phone) box.querySelector(".mesc").remove();
      const res = box.querySelector(".mres");
      let list = [], at = 0;
      const close = (refocus) => {
        document.removeEventListener("keydown", esc, true);
        box.remove();
        if (refocus && from && from.focus) from.focus();
      };
      const pick = (c) => { close(false); this._uxAddDevice(c); };
      const mark = () => {
        res.querySelectorAll(".mrow").forEach((b, k) => { b.classList.toggle("on", k === at); b.setAttribute("aria-selected", k === at ? "true" : "false"); });
        input.setAttribute("aria-activedescendant", "uxopt" + at);
        const cur = res.querySelector("#uxopt" + at);
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      };
      const head = (t) => { const d = document.createElement("div"); d.className = "mhead"; d.textContent = t; res.appendChild(d); };
      const row = (c, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mrow" + (k === at ? " on" : "");
        b.id = "uxopt" + k;
        b.setAttribute("role", "option");
        b.innerHTML = '<span class="mtx"><b></b><span class="msub"></span></span><span class="mkind"></span>';
        b.querySelector("b").textContent = c.name;
        const where = c.area || tr("No area");
        b.querySelector(".msub").textContent = c.fresh ? where : where + " \u00b7 " + tr("already has a tile");
        b.querySelector(".mkind").textContent = c.kind;
        // Für Profis: die Entitäts-ID beim Zeigen.
        b.title = c.entity;
        b.onpointermove = () => { if (at !== k) { at = k; mark(); } };
        b.onclick = () => pick(c);
        res.appendChild(b);
      };
      const paint = () => {
        res.innerHTML = "";
        const q = input.value.trim();
        if (q) {
          list = rankDevices(all, q, 40);
          at = Math.min(at, Math.max(0, list.length - 1));
          if (!list.length) {
            const e = document.createElement("div");
            e.className = "mempty";
            e.textContent = tr("No device found. Try another word, or pick a tile type below.");
            res.appendChild(e);
          }
          list.forEach(row);
        } else {
          // Leer: was neu ist und noch keine Kachel hat – im Raum bzw. in der Übersicht nach Raum.
          const fresh = all.filter((c) => c.fresh && c.suggested);
          if (overview) {
            list = [];
            const order = rooms$(this).map((r, i) => i);
            const groups = new Map();
            fresh.forEach((c) => { const k = c.roomIndex; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
            const keys = [...groups.keys()].sort((a, b) => (a < 0 ? 999 : order.indexOf(a)) - (b < 0 ? 999 : order.indexOf(b)));
            keys.forEach((k) => { groups.get(k).slice(0, 6).forEach((c) => list.push(c)); });
            let last = null;
            list.forEach((c, k) => {
              const t = c.roomIndex >= 0 ? fill(tr("New in {room} – no tile yet"), { room: this._roomLabel(rooms$(this)[c.roomIndex]) })
                : tr("Without a room – no tile yet");
              if (t !== last) { last = t; head(t); }
              row(c, k);
            });
          } else {
            list = fresh.filter((c) => c.roomIndex === this._room).slice(0, 12);
            head(fill(tr("New in {room} – no tile yet"), { room: roomName }));
            list.forEach(row);
          }
          if (!list.length) {
            const e = document.createElement("div");
            e.className = "mempty";
            e.textContent = fill(tr("Every device in {room} already has a tile. Search for one above."), { room: roomName });
            res.appendChild(e);
          }
          at = Math.min(at, Math.max(0, list.length - 1));
        }
        mark();
      };
      // Unten klein: die übrigen Wege (Typauswahl bleibt erreichbar).
      const more = box.querySelector(".uxmore");
      const extra = (label, run, ok) => {
        if (ok === false) return;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "uxlink";
        b.textContent = tr(label);
        b.onclick = () => { close(false); run(); };
        more.appendChild(b);
      };
      extra("Other tile type…", () => this._uxAddByType());
      extra("Scene from the current state…", () => this._bSceneFromState(), typeof this._bSceneFromState === "function"
        && !!(this._hass && this._hass.user && this._hass.user.is_admin));
      extra("Badge…", () => { this._bLeavePages && this._bLeavePages(); this._sel = null; this._group = "badges"; this._stackOpenReq = "badges"; this._bOpen = true; this._renderForm(); });
      extra("Custom card (YAML)…", () => { const r = room$(this); if (r && this._addCustomCard) this._addCustomCard(r); });
      input.addEventListener("input", () => { at = 0; paint(); });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (!list.length) return;
          at = (at + (ev.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
          mark();
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          if (list[at]) pick(list[at]);
        }
      });
      const esc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(true); } };
      document.addEventListener("keydown", esc, true);
      box.addEventListener("pointerdown", (ev) => { if (ev.target === box) close(true); });
      root.appendChild(box);
      paint();
      // Am Handy nicht gleich die Tastatur: erst sehen, was neu ist.
      if (!phone) setTimeout(() => input.focus(), 20);
    };

    // Gerät gewählt: Kachelart steht fest; liegt das Gerät in einem anderen Raum, kurz fragen wohin.
    P._uxAddDevice = async function (c) {
      const rooms = rooms$(this);
      let ri = this._room;
      if (c.roomIndex >= 0 && c.roomIndex !== ri) {
        const res = await this._ask({
          title: tr("Where should the tile go?"),
          picks: [
            { id: "dev", title: fill(tr("In {room}"), { room: this._roomLabel(rooms[c.roomIndex]) }), sub: tr("Where the device is") },
            { id: "cur", title: fill(tr("In {room}"), { room: this._roomLabel(rooms[ri]) }), sub: tr("The room open now") },
          ],
          confirmLabel: tr("Add"),
        });
        if (!res || !res.pick) return;
        if (res.pick === "dev") ri = c.roomIndex;
      }
      const room = rooms[ri];
      const I = W.__casoraPanelInternals || {};
      const type = (I.TILE_TYPES || []).find((t) => t.id === c.type);
      if (!room || !type) return;
      const tile = I.newTile ? I.newTile(type) : { type: "custom:button-card", template: type.template, entity: "", name: tr(type.label) };
      if (this._fillTile) this._fillTile(tile, type, c.entity); else tile.entity = c.entity;
      // Der Name ohne den Raum („Stehlampe Schlafzimmer“ im Schlafzimmer → „Stehlampe“).
      const B = W.casoraBasis;
      tile.name = B && B.shortName ? B.shortName(c.name, this._roomLabel(room)) : c.name;
      if (ri !== this._room) {
        this._room = ri;
        this._renderTabs();
      }
      room.tiles = room.tiles || [];
      if (this.classList.contains("phone")) this._bAfterAdd = { room, n: room.tiles.length };
      room.tiles.push(tile);
      this._markDirty();
      this._renderForm();
      this._rebuildPreview && requestAnimationFrame(() => this._rebuildPreview());
    };
    P._uxAddBtn = function () {
      const tools = this.shadowRoot.querySelector(".btools");
      if (!tools || tools.querySelector('[data-b="add"]')) return;
      const list = tools.querySelector('[data-b="list"]');
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btool uxplus";
      b.dataset.b = "add";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      b.title = tr("Add a tile");
      b.setAttribute("aria-label", tr("Add a tile"));
      b.onclick = () => { this._bFrom = b; this._bAddTile(); };
      if (list) list.after(b); else tools.appendChild(b);
    };

    // ── Kachel-Editor gestuft (V-11) ──────────────────────────────────────
    const FOLD = "casora.studio.fold.";
    const foldGet = (k) => { try { return localStorage.getItem(FOLD + k) === "1"; } catch (e) { return false; } };
    const foldSet = (k, v) => { try { if (v) localStorage.setItem(FOLD + k, "1"); else localStorage.removeItem(FOLD + k); } catch (e) { /* nur jetzt */ } };
    const labelOf = (row) => { const l = row && row.querySelector(":scope > label, :scope > .lab"); return l ? l.textContent.trim() : ""; };
    const isLabel = (row, en) => { const t = labelOf(row); return t === en || t === tr(en); };
    // Eine aufklappbare Gruppe wie „Popup“ (gleiche Optik), Inhalt = nodes. key merkt sich offen/zu.
    P._uxFold = function (key, title, nodes, cls) {
      const det = document.createElement("div");
      det.className = "adv " + (cls || "");
      const sum = document.createElement("button");
      sum.className = "advsum";
      sum.type = "button";
      sum.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
      const lab = document.createElement("span");
      lab.textContent = tr(title);
      lab.setAttribute("data-no-i18n", "");
      const val = document.createElement("span");
      val.className = "uxsum";
      val.setAttribute("data-no-i18n", "");
      sum.append(lab, val);
      const body = document.createElement("div");
      body.className = "advbody";
      nodes.forEach((n) => body.appendChild(n));
      det.append(sum, body);
      const open = foldGet(key);
      det.classList.toggle("open", open);
      sum.setAttribute("aria-expanded", open ? "true" : "false");
      sum.onclick = () => {
        const now = !det.classList.contains("open");
        foldSet(key, now);
        if (this._openAdv) this._openAdv(det, sum, now, true);
        else { det.classList.toggle("open", now); sum.setAttribute("aria-expanded", now ? "true" : "false"); }
      };
      return det;
    };
    // Zusammenfassung „Sichtbar & sicher“: wer, wo, Rückfrage (V-10 nennt es im Satz).
    P._uxVisSummary = function (shell) {
      const inner = (shell && shell.type === "conditional" && shell.card) || shell || {};
      const V = inner.variables || {}, SV = (shell && shell.variables) || {};
      const vis = Array.isArray(shell && shell.visibility) ? shell.visibility.find((x) => x && x.condition === "user" && Array.isArray(x.users)) : null;
      const ids = vis ? vis.users : [];
      const users = this._mUsersCache || [];
      const names = ids.map((id) => (users.find((u) => u.id === id) || {}).name).filter(Boolean);
      const surf = SV.surfaces || V.surfaces;
      const parts = [];
      parts.push(ids.length ? (names.length ? fill(tr("Only {names}"), { names: names.join(", ") }) : tr("Only some people")) : tr("Everyone"));
      parts.push(surf === "phone" ? tr("phone only") : surf === "desktop" ? tr("desktop only") : tr("everywhere"));
      if (V.confirm_toggle === true) parts.push(tr("asks first"));
      if (shell && shell.type === "conditional") parts.push(tr("with a condition"));
      return parts.join(" \u00b7 ");
    };
    P._uxTileEditor = function () {
      if (!this._sel || this._sel.group !== "tiles") return;
      const box = this.shadowRoot.querySelector("#pane #band-tiles .tile.sel");
      const body = box && box.querySelector(":scope > .tbody");
      if (!body) return;
      // Schon gestuft (z. B. aus _bApply mitten im Zeichnen): später angefügte Gruppen
      // („Vor dem Schalten fragen“/„Wer sieht das?“, casora-panel-b-mehr.js) noch hineinholen.
      const room = room$(this);
      const shell = room && (room.tiles || []).find((t) => this._tileKey(t) === this._sel.key);
      const have = body.querySelector(":scope > .adv.uxvis");
      if (have) {
        const late = body.querySelector(":scope > .subcard.mgroup");
        if (late) have.querySelector(".advbody").appendChild(late);
        const v = have.querySelector(".uxsum");
        if (v) v.textContent = this._uxVisSummary(shell);
        return;
      }
      const mg = body.querySelector(":scope > .subcard.mgroup");
      const optRows = [...body.querySelectorAll(":scope > .subcard > .row[data-opt]")];
      const showOn = optRows.find((r) => isLabel(r, "Show on"));
      const move = [];
      if (showOn) {
        // „Anzeigen auf“ samt seinem Hinweis (falls einer folgt).
        const next = showOn.nextElementSibling && showOn.nextElementSibling.classList.contains("hint") ? showOn.nextElementSibling : null;
        move.push(showOn);
        if (next) move.push(next);
      }
      if (mg) move.push(mg);
      if (!move.length) return;
      const det = this._uxFold("vis", "Visible & safe", move, "uxvis");
      // Vor „Popup“ (erste vorhandene Aufklapp-Gruppe), sonst ans Ende.
      const adv = body.querySelector(":scope > .adv");
      if (adv) adv.before(det); else body.appendChild(det);
      // Leere Optionen-Karte samt Überschrift weg.
      body.querySelectorAll(":scope > .subcard").forEach((c) => {
        if (!c.children.length) { const t = c.previousElementSibling; if (t && t.classList.contains("subtitle")) t.remove(); c.remove(); }
      });
      const sum = () => { const v = det.querySelector(".uxsum"); if (v) v.textContent = this._uxVisSummary(shell); };
      sum();
      // Schalter darin ändern die Zusammenfassung sofort (die Auswahl „Wer sieht das?“ beim nächsten Zeichnen).
      det.addEventListener("click", () => setTimeout(sum, 60));
      if (this._mUsers) this._mUsers().then((u) => { this._mUsersCache = u; sum(); });
      // „Popup“: Zusammenfassung rechts – Standard oder wie viel eigens gesetzt ist.
      const pop = [...body.querySelectorAll(":scope > .adv:not(.uxvis)")].find((a) => { const s2 = a.querySelector(".advsum span"); return s2 && (s2.textContent === "Popup" || s2.textContent === tr("Popup")); });
      if (pop && !pop.querySelector(".uxsum")) {
        const n = [...pop.querySelectorAll(".advbody input")].filter((i) => i.type !== "checkbox" && i.value && i.value.trim()).length;
        const v = document.createElement("span");
        v.className = "uxsum";
        v.setAttribute("data-no-i18n", "");
        v.textContent = n ? (n === 1 ? tr("1 set") : fill(tr("{n} set"), { n })) : tr("Standard");
        pop.querySelector(".advsum").appendChild(v);
      }
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
