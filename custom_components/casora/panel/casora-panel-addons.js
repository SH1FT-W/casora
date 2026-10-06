// Casora-Ergänzungen für das Studio-Panel (casora-panel.js bleibt unverändert).
//
// Handy-Vorschau: Die Glas-Navigation unten (Home / Räume / Szenen) ist eine
// Casora-eigene Karte (scripts/local/04-navigation.js). Das Panel zeichnet seine
// Vorschau aus dem eigenen Modell und kennt sie nicht – hier wird sie als
// nicht bedienbare Nachbildung in den Handy-Rahmen gesetzt, maßstabsgetreu
// zur echten Leiste (280 × 60 px auf einem 390 px breiten Handy).
(() => {
  if (window.__casoraPanelAddons) return;
  window.__casoraPanelAddons = true;

  // Schrift: Die Vorschau verlangt „Hanken Grotesk“ ohne Ersatz. Die Schrift kommt
  // sonst nur als Dashboard-Ressource – wer das Panel direkt öffnet, sah Times.
  if (!document.querySelector('link[data-casora-font]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/casora_assets/fonts/hanken-grotesk.css";
    link.setAttribute("data-casora-font", "");
    document.head.appendChild(link);
  }

  const PHONE_WIDTH = 390;
  const LABELS = {
    de: ["Zuhause", "Räume", "Szenen"],
    en: ["Home", "Rooms", "Scenes"],
  };
  const CSS = `
    .casora-mnav{position:absolute;left:50%;bottom:6px;z-index:5;pointer-events:none;
      width:280px;height:60px;border-radius:30px;box-sizing:border-box;padding:6px;display:flex;gap:4px;
      transform-origin:50% 100%;
      background:rgba(40,40,44,0.55);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);
      box-shadow:0 10px 30px -10px rgba(0,0,0,0.55), inset 0 0.5px 0 rgba(255,255,255,0.22);
      font-family:inherit;}
    .casora-mnav span.b{flex:1 1 0;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:2px;font-family:inherit;font-size:11px;font-weight:500;letter-spacing:.01em;color:rgba(255,255,255,0.72);}
    .casora-mnav span.b.on{background:rgba(255,255,255,0.14);color:#fff;}
    .casora-mnav ha-icon{--mdc-icon-size:24px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;}
    .casora-mnav span.b.on ha-icon, .casora-mnav span.b.on i{color:var(--casora-color-teal, #00C3D0);}
    .casora-mnav span.b > span{max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .casora-mnav i{width:24px;height:24px;display:block;background:currentColor;
      -webkit-mask:url(/casora_assets/icons/rooms.svg?v=3) center/contain no-repeat;mask:url(/casora_assets/icons/rooms.svg?v=3) center/contain no-repeat;}
  `;

  let lang = "en";

  // Wie die echte Leiste: in einem Raum leuchtet „Räume“ mit Symbol und Namen des Raums.
  function roomOf(panel) {
    const f = String((panel && panel._phoneFilter) || "");
    if (f.indexOf("room:") !== 0) return null;
    const name = f.slice(5);
    const I = window.__casoraPanelInternals || {};
    const rooms = (((panel._pair || {}).desktop || panel._state || {}).compact || {}).rooms || [];
    const room = rooms.find((r) => r && r.name === name) || null;
    const glyph = I.roomGlyph ? I.roomGlyph(name, room) : "rooms";
    return { name, icon: I.roomIconSrc ? I.roomIconSrc(glyph) : "/casora_assets/icons/" + glyph + ".svg" };
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function build(phone, room) {
    const labels = LABELS[lang] || LABELS[lang.split("-")[0]] || LABELS.en;
    const nav = document.createElement("div");
    nav.className = "casora-mnav";
    nav.setAttribute("data-no-i18n", "");
    nav.setAttribute("data-lang", lang);
    nav.setAttribute("data-room", room ? room.name : "");
    const mask = room ? ` style="-webkit-mask-image:url('${esc(room.icon)}');mask-image:url('${esc(room.icon)}')"` : "";
    nav.innerHTML =
      `<span class="b${room ? "" : " on"}"><ha-icon icon="mdi:home-variant"></ha-icon><span>${labels[0]}</span></span>` +
      `<span class="b${room ? " on" : ""}"><i${mask}></i><span>${room ? esc(room.name) : labels[1]}</span></span>` +
      `<span class="b"><ha-icon icon="mdi:palette-outline"></ha-icon><span>${labels[2]}</span></span>`;
    if (getComputedStyle(phone).position === "static") phone.style.position = "relative";
    phone.appendChild(nav);
    return nav;
  }

  // Desktop-Vorschau: Casora nutzt am Desktop die Glas-Pille der Tablet-Navigation
  // (scripts/local/01-basis.js). Die Tablet-Regeln des Panels werden zur Laufzeit für
  // Desktop übernommen – so bleiben sie bei Panel-Updates synchron. Größen = unsere
  // Desktop-Werte (46 px Pille, 6 px Innenabstand, Zeile 33 px, 265 px Randreserve)
  // mal Vorschau-Maßstab 0,583.
  const DESKTOP_VARS = `.card.map.size-desktop{--nav-top:28px;--nav-h:26.8px;--nav-inset:3.5px;--nav-gap:2.4px;
    --nav-label:10.5px;--nav-label-h:19.8px;--nav-pad-x:9.5px;--nav-reserve:60px;--chrome-top:37.2px;--chrome-font:10.5px;
    --chrome-top-btn:calc(var(--nav-top) + (var(--nav-h) - var(--chrome-btn)) / 2);}`
    // Uhr und Symbole rechts auf die Mitte der Pille – wie im echten Dashboard eine Linie.
    + `.card.map.size-desktop .mini-time{top:calc(var(--nav-top) + var(--nav-h) / 2);transform:translateY(-50%);line-height:1;}`;

  function desktopPill(root) {
    let src = "";
    root.querySelectorAll("style").forEach((s) => { if (s.id !== "casora-addons-css") src += s.textContent; });
    const rules = src.match(/\.size-tablet \.mini-(?:nav|tabs|tab|time)[^{]*\{[^}]*\}/g) || [];
    return rules.map((r) => r.split(".size-tablet").join(".size-desktop")).join("\n") + "\n" + DESKTOP_VARS;
  }

  function sync(root) {
    if (!root.getElementById("casora-addons-css")) {
      const st = document.createElement("style");
      st.id = "casora-addons-css";
      st.textContent = CSS + desktopPill(root);
      root.appendChild(st);
    }
    const room = roomOf(root.host);
    root.querySelectorAll(".miniphone").forEach((phone) => {
      let nav = phone.querySelector(":scope > .casora-mnav");
      if (nav && (nav.getAttribute("data-lang") !== lang
        || nav.getAttribute("data-room") !== (room ? room.name : ""))) { nav.remove(); nav = null; }
      if (!nav) nav = build(phone, room);
      const s = (phone.clientWidth || PHONE_WIDTH) / PHONE_WIDTH;
      nav.style.transform = `translateX(-50%) scale(${s})`;
    });
  }

  customElements.whenDefined("casora-panel").then(() => {
    const C = customElements.get("casora-panel");
    const desc = Object.getOwnPropertyDescriptor(C.prototype, "hass");
    if (!desc || !desc.set || C.prototype.__casoraAddonsHooked) return;
    C.prototype.__casoraAddonsHooked = true;
    Object.defineProperty(C.prototype, "hass", {
      configurable: true,
      get: desc.get,
      set(h) {
        desc.set.call(this, h);
        lang = (h && ((h.locale && h.locale.language) || h.language)) || "en";
        const root = this.shadowRoot;
        if (!root) return;
        if (!root.__casoraAddonsObs) {
          let queued = false;
          root.__casoraAddonsObs = new MutationObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; sync(root); });
          });
          root.__casoraAddonsObs.observe(root, { childList: true, subtree: true });
        }
        sync(root);
      },
    });
  });
})();

// Design & Bedienung (Schlüssel „General“) → Design: dieselbe Wahl wie im Einrichtungsassistenten, jederzeit änderbar.
customElements.whenDefined("casora-panel").then(() => {
  const P = customElements.get("casora-panel").prototype;
  if (P.__casoraLookRow) return;
  P.__casoraLookRow = true;
  const GLASS = "Hemma 1";
  // Die Studio-Vorschau zeichnet ihre Kacheln selbst; im Glas-Design bekommen sie die
  // Werte aus theme_glass.yaml (durchscheinend, aktiv hell getönt, weiße Schrift).
  const GLASS_CSS = ""
    + ":host(.look-glass) .mtile{background:rgba(255,255,255,0.08);"
    + "backdrop-filter:blur(12px) saturate(1.4);-webkit-backdrop-filter:blur(12px) saturate(1.4);"
    + "box-shadow:inset 0 0 0 .5px rgba(255,255,255,0.12),inset 0 10px 18px -16px rgba(255,255,255,0.2),inset 0 -10px 18px -16px rgba(255,255,255,0.16)}"
    + ":host(.look-glass) .mtile.on,:host(.look-glass) .miniphone .mp-tiles .mtile.on{background:rgba(255,255,255,0.25)}"
    + ":host(.look-glass) .mtile.on .mname{color:#fff}"
    + ":host(.look-glass) .mtile.on .mstate{color:rgba(255,255,255,0.8)}"
    + ":host(.look-glass) .mtile.on .mmore{color:#fff}"
    + ":host(.look-glass) .mtile:not(.on) .mname{color:rgba(255,255,255,0.85)}";
  // Weich hat keine festen Werte hier: casora-panel.js setzt .soft auf die Vorschau-Karte und
  // liest die Theme-Variablen selbst (hell und dunkel, auch beim Umschalten ohne Neuladen).
  const themeNow = (panel) => {
    if (panel._lookNow) return panel._lookNow;
    const t = (panel._hass && panel._hass.themes) || {};
    let local = null;
    try { local = JSON.parse(localStorage.getItem("selectedTheme") || "null"); } catch (e) { local = null; }
    return (local && local.theme && local.theme !== "default") ? local.theme : t.default_theme;
  };
  const paintLook = (panel) => {
    const root = panel.shadowRoot;
    if (!root) return;
    if (!root.getElementById("casora-look-preview-css")) {
      const st = document.createElement("style");
      st.id = "casora-look-preview-css";
      st.textContent = GLASS_CSS;
      root.appendChild(st);
    }
    const look = themeNow(panel);
    panel.classList.toggle("look-glass", look === GLASS);
  };
  // Das Design gilt sofort für alle Dashboards (HA-Theme, nicht Teil von „Speichern“),
  // lässt sich aber mit Rückgängig zurücknehmen: der Undo-Eintrag trägt das vorige Design.
  const undo = P._undo;
  P._undo = function () {
    const stack = this._undoStack || [];
    const top = stack[stack.length - 1];
    const r = undo.apply(this, arguments);
    if (top && top.look) {
      this._lookNow = top.look;
      paintLook(this);
      Promise.resolve(this._applyTheme(top.look)).then(() => this._renderForm());
    }
    return r;
  };
  const renderForm = P._renderForm;
  P._renderForm = function () {
    const r = renderForm.apply(this, arguments);
    paintLook(this);
    const card = this.$("pane") && this.$("pane").querySelector('section.card[data-k="General"]');
    const themes = ((window.__casoraPanelInternals || {}).CASORA_THEMES || [])
      .filter((x) => this._hass && this._hass.themes && (this._hass.themes.themes || {})[x.name]);
    if (!card || card.querySelector(".casora-look") || !themes.length) return r;
    const t = this._hass.themes;
    const cur = themeNow(this);
    const ours = themes.find((x) => x.name === cur || (x.aliases || []).includes(cur));
    const tr = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
    const dark = !(t.darkMode === false);
    if (!this.shadowRoot.getElementById("casora-look-css")) {
      const st = document.createElement("style");
      st.id = "casora-look-css";
      st.textContent = ""
        // M10 (Weich-Audit): drei Designs nebeneinander statt 2er-Raster mit Lücke, Namen einzeilig.
        + ".casora-looks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px 0 14px}"
        + ".casora-lookcard b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        + ".casora-looktag{display:block;margin-top:-4px;font-size:11px;font-weight:500;letter-spacing:.02em;opacity:.6}"
        + ".casora-lookcard{appearance:none;border:0;margin:0;padding:0;background:none;box-shadow:none;cursor:pointer;"
        + "display:flex;flex-direction:column;gap:7px;text-align:left;color:var(--ink,#fff);min-width:0}"
        + ".casora-lookcard:hover{filter:none}"
        + ".casora-lookshot{display:block;aspect-ratio:16/10;border-radius:var(--r-m);background:rgba(255,255,255,.08) center/cover no-repeat;"
        + "box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);transition:box-shadow .15s}"
        + ".casora-lookcard[aria-checked=true] .casora-lookshot{box-shadow:0 0 0 2px var(--casora-studio-accent, var(--casora-color-teal,#00C3D0)),inset 0 0 0 1px rgba(255,255,255,.12)}"
        + ".casora-lookcard b{font-size:var(--t-foot);font-weight:600}"
        + ".casora-lookcard[aria-checked=true] b{color:var(--casora-studio-accent, var(--casora-color-teal,#00C3D0))}"
        + ".casora-lookcard:disabled{cursor:progress;opacity:.7}";
      this.shadowRoot.appendChild(st);
    }
    const sub = document.createElement("div");
    sub.className = "subtitle casora-look";
    sub.dataset.sub = "look";
    sub.textContent = "Design";
    const box = document.createElement("div");
    box.className = "subcard";
    // Two small cards with a real screenshot each, like the setup assistant, instead of a
    // plain list: the choice is seen, not read.
    const grid = document.createElement("div");
    grid.className = "casora-looks";
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", tr("Dashboard design"));
    let now = ours ? ours.name : (cur || "");
    const cards = [];
    const paint = () => cards.forEach((c) => c.setAttribute("aria-checked", c.dataset.theme === now ? "true" : "false"));
    const add = (name, label, img, ph) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "casora-lookcard";
      c.dataset.theme = name;
      c.setAttribute("role", "radio");
      const shot = document.createElement("span");
      shot.className = "casora-lookshot";
      if (img) shot.style.backgroundImage = "url('" + img + "')" + (ph ? ", " + ph : "");
      const b = document.createElement("b");
      // „Hemma Glas (Legacy)“: Name einzeilig, der Zusatz in Klammern als kleines Etikett darunter.
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label || "");
      b.textContent = m ? m[1] : label;
      c.append(shot, b);
      if (m) { const tg = document.createElement("span"); tg.className = "casora-looktag"; tg.textContent = m[2]; c.append(tg); }
      c.onclick = async () => {
        if (name === now) return;
        cards.forEach((x) => { x.disabled = true; });
        const before = now;
        now = name;
        paint();
        if (this._state && this._snap) {
          this._undoStack = (this._undoStack || []).concat([{ ...this._snap(), look: before }]).slice(-50);
          this._markDirty();
        }
        this._lookNow = name;
        paintLook(this);
        try { await this._applyTheme(name); } finally { cards.forEach((x) => { x.disabled = false; }); }
      };
      grid.appendChild(c);
      cards.push(c);
    };
    const SL = (window.__casoraPanelInternals || {}).shotLang || ((u) => u);
    themes.forEach((x) => add(x.name, tr(x.label), x.shot && SL(dark ? x.shot.dark : x.shot.light, this._hass),
      x.ph && (dark ? x.ph.dark : x.ph.light)));
    if (!ours && cur) add(cur, cur, null);
    paint();
    box.appendChild(grid);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "The design applies to all dashboards right away; the other settings here only to this dashboard. Undo switches the design back.";
    const head = card.querySelector(".chead");
    const at = head ? head.nextSibling : card.firstChild;
    card.insertBefore(hint, at);
    card.insertBefore(box, hint);
    card.insertBefore(sub, box);
    // Die Seitenleiste nennt die Unterbereiche – „Design“ kommt erst hier dazu.
    if (typeof this._renderSidebar === "function") this._renderSidebar();
    return r;
  };
});

// Szenen → Anzeige: als Badge auf Home oder als Menü in der Leiste.
customElements.whenDefined("casora-panel").then(() => {
  const P = customElements.get("casora-panel").prototype;
  if (P.__casoraSceneMode) return;
  P.__casoraSceneMode = true;
  const renderForm = P._renderForm;
  P._renderForm = function () {
    const r = renderForm.apply(this, arguments);
    const card = this.$("pane") && this.$("pane").querySelector('section.card[data-k="Scenes"]');
    const mode = this._scenesMode && this._scenesMode();
    if (!card || card.querySelector(".casora-scenemode") || !mode || mode === "off") return r;
    const row = document.createElement("div");
    row.className = "row casora-scenemode";
    const lab = document.createElement("label");
    lab.textContent = "Show as";
    const t = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
    const combo = this._combo(mode, ["badge", "nav"], "", (v) => {
      if (!v || v === this._scenesMode()) return;
      Promise.resolve(this._setScenesMode(v)).then(() => {
        this._markDirty();
        this._renderForm();
        this._rebuildPreview();
      });
    }, { fixed: true, labels: { badge: t("Badge on Home"), nav: t("Menu in the navigation bar") } });
    row.append(lab, combo.wrap);
    const head = card.querySelector(".chead");
    card.insertBefore(row, head ? head.nextSibling : card.firstChild);
    return r;
  };
});


// Eigene Schrift: Knopf „Upload font“ unter dem Feld „Font name“. Die Dateien gehen an
// /api/casora/fonts (fonts.py), das config/www/casora/fonts/casora-fonts.css schreibt.
customElements.whenDefined("casora-panel").then(() => {
  const P = customElements.get("casora-panel").prototype;
  if (P.__casoraFontUpload) return;
  P.__casoraFontUpload = true;
  const t = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
  const CSS = ".casora-fontup{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 10px}"
    + ".casora-fontup button{border:none;border-radius:999px;padding:7px 14px;font:inherit;font-size:var(--t-foot,13px);"
    + "font-weight:600;cursor:pointer;background:var(--casora-studio-link-tint, rgba(10,132,255,.18));color:inherit}"
    + ".casora-fontup button.fam{background:var(--casora-studio-chip, rgba(118,118,128,.18));font-weight:500}"
    + ".casora-fontup button.fam[aria-pressed=true]{background:var(--casora-studio-link-tint, rgba(10,132,255,.32))}"
    + ".casora-fontup .msg{flex-basis:100%;font-size:var(--t-caption,12px);opacity:.75}";
  const api = (panel, opts) => (panel._hass && panel._hass.fetchWithAuth
    ? panel._hass.fetchWithAuth("/api/casora/fonts", opts || {})
    : fetch("/api/casora/fonts", opts || {})).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || r.status);
    return data;
  });
  const setName = (row, name) => {
    const input = row.querySelector("input");
    if (!input) return;
    input.value = name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const renderForm = P._renderForm;
  P._renderForm = function () {
    const r = renderForm.apply(this, arguments);
    const pane = this.$("pane");
    const row = pane && pane.querySelector('.row[data-key="font_family"]');
    if (!row || row.nextElementSibling && row.nextElementSibling.classList.contains("casora-fontup")) return r;
    const root = this.shadowRoot;
    if (root && !root.getElementById("casora-fontup-css")) {
      const st = document.createElement("style"); st.id = "casora-fontup-css"; st.textContent = CSS; root.appendChild(st);
    }
    const box = document.createElement("div");
    box.className = "casora-fontup";
    const file = document.createElement("input");
    file.type = "file"; file.multiple = true; file.hidden = true; file.accept = ".woff2,.woff,.ttf,.otf";
    const up = document.createElement("button");
    up.type = "button"; up.textContent = t("Upload font");
    const msg = document.createElement("span"); msg.className = "msg";
    const fams = document.createElement("span"); fams.style.display = "contents";
    const internals = window.__casoraPanelInternals || {};
    const showFams = (list) => {
      fams.innerHTML = "";
      const cur = (row.querySelector("input") || {}).value || "";
      (list || []).forEach((f) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fam"; b.textContent = f.family;
        b.setAttribute("data-no-i18n", "");
        b.style.fontFamily = '"' + f.family + '", system-ui';
        b.setAttribute("aria-pressed", String(f.family === cur));
        b.onclick = () => { setName(row, f.family); showFams(list); };
        fams.appendChild(b);
      });
    };
    up.onclick = () => { file.value = ""; file.click(); };
    file.onchange = async () => {
      if (!file.files.length) return;
      const body = new FormData();
      const typed = ((row.querySelector("input") || {}).value || "").trim();
      if (typed) body.append("family", typed);
      [...file.files].forEach((f) => body.append("file", f, f.name));
      up.disabled = true; msg.textContent = t("Uploading…");
      try {
        const data = await api(this, { method: "POST", body });
        if (internals.ensureCustomFontCss) internals.ensureCustomFontCss(Date.now());
        setName(row, data.family);
        msg.textContent = t("Font uploaded.");
        showFams(data.fonts);
      } catch (e) {
        msg.textContent = t("Upload failed") + ": " + e.message;
      }
      up.disabled = false;
    };
    box.append(up, fams, file, msg);
    row.after(box);
    api(this).then((d) => showFams(d.fonts)).catch(() => {});
    if (internals.ensureCustomFontCss) internals.ensureCustomFontCss();
    return r;
  };
});
