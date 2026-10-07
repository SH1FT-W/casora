// Studio → live popup preview.
//
// Picking a popup in the room view (a row under "Popups", or a tile page with its
// Popup section open) shows the REAL popup on the right: the tile's button-card
// resolves its template chain, hands over its finished casora_popup config, and a
// private casora-popup element renders it with live states over the dimmed room
// preview. Nothing here writes to the dashboard; the popup is view-only.
(function () {
  // A group badge's own tap usually opens its row; the popup sits on the badges in
  // that row (or rides along in the merged tap_action). First match with content wins.
  const BADGE_TPL = {
    climate: ["casora_badge_temp", "casora_badge_humidity", "casora_badge_air_quality", "casora_badge_climate_group"],
    lights: ["casora_badge_light", "casora_badge_light_group"],
    security: ["casora_badge_security", "casora_badge_lock_group", "casora_badge_contact_group",
      "casora_badge_camera_group", "casora_badge_security_group"],
    energy: ["casora_badge_energy_group", "casora_badge_energy"],
  };
  const ACTIONS = ["tap_action", "icon_tap_action", "hold_action", "double_tap_action"];
  const XSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>';
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M7.5 9h9M7.5 12.5h6"/></svg>';

  const CSS = ""
    + ":host(.cp-on) #mapmount{filter:blur(5px) brightness(.5) saturate(1.1);transition:filter .28s ease;pointer-events:none}"
    + ".cp-layer{position:absolute;z-index:6;left:0;right:0;top:0;display:flex;flex-direction:column;align-items:center;"
    + "pointer-events:none;box-sizing:border-box;padding:0 12px}"
    + ".cp-layer>*{pointer-events:auto}"
    // Schmale Vorschau (Tablet mit offenem Blatt): Popup als eigene Ebene über dem ganzen Studio,
    // sonst war es nur ~300 px breit und kaum lesbar (Nutzertest 5, H-T2).
    + ".cp-layer.cp-wide{position:fixed;z-index:80;left:0;right:0;top:0;bottom:0;height:auto!important;padding:16px 16px 0;"
    + "pointer-events:auto;background:rgba(0,0,0,.34);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}"
    + ".cp-layer.cp-wide .cp-box{padding-bottom:16px}"
    + ".cp-bar{position:relative;z-index:3;flex:none;display:flex;align-items:center;gap:6px;margin:0 auto 12px;max-width:100%;padding:4px 4px 4px 14px;"
    + "border-radius:999px;background:var(--casora-studio-link-tint, rgba(94,92,230,.28));box-shadow:inset 0 0 0 .5px var(--casora-studio-link-line, rgba(160,158,255,.5));"
    + "-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6)}"
    + ".cp-bar b{font-size:var(--t-foot);font-weight:600;color:var(--ink,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".cp-bar b span{opacity:.6;font-weight:500}"
    + ".cp-bar button{appearance:none;display:grid;place-items:center;width:28px;height:28px;min-width:0;padding:0;margin:0;border:0;"
    + "border-radius:50%;background:rgba(255,255,255,.14);box-shadow:none;color:var(--ink,#fff);cursor:pointer;flex:none}"
    + ".cp-bar button:hover{background:rgba(255,255,255,.24);filter:none}"
    + ".cp-bar svg{width:15px;height:15px}"
    // M9: hell stand das Etikett durchscheinend auf der abgedunkelten Vorschau – dunkle Schrift auf
    // dunklem Grund. Jetzt eine helle, deckende Pille.
    + ":host(.is-light) .cp-bar{background:var(--casora-studio-card, rgba(251,248,243,.94));box-shadow:0 2px 10px color-mix(in srgb, var(--ink, #282014) 18%, transparent),inset 0 0 0 .5px color-mix(in srgb, var(--ink, #282014) 8%, transparent)}"
    + ":host(.is-light) .cp-bar button{background:var(--casora-studio-chip, rgba(118,118,128,.14))}:host(.is-light) .cp-bar button:hover{background:var(--casora-studio-chip-hi, rgba(118,118,128,.24))}"
    + ":host(.is-light) .cp-note{background:rgba(255,255,255,.9);box-shadow:0 0 0 .5px rgba(0,0,0,.08)}"
    + ".cp-box{flex:1 1 auto;min-height:0;width:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;"
    + "scrollbar-width:none;display:flex;justify-content:center;align-items:flex-start}"
    + ".cp-box::-webkit-scrollbar{display:none}"
    + ".cp-box casora-popup{position:relative!important;inset:auto!important;display:block!important;z-index:auto!important;"
    + "flex:none;opacity:0;transition:opacity .22s ease}"
    + ".cp-box casora-popup.cp-in{opacity:1}"
    + ".cp-note{margin-top:40px;padding:14px 18px;border-radius:var(--r-l);background:rgba(20,20,26,.66);font-size:var(--t-foot);"
    + "color:var(--ink-2,rgba(255,255,255,.7));text-align:center;max-width:340px}"
    + "@media (prefers-reduced-motion:no-preference){.cp-layer .cp-box{animation:cpIn .3s cubic-bezier(.32,.72,0,1)}}"
    + "@keyframes cpIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}"
    // Reopen pill under the room preview while a tile with a popup is selected.
    + ".cp-show{position:absolute;z-index:6;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;"
    + "appearance:none;margin:0;padding:7px 14px 7px 11px;border:0;border-radius:999px;cursor:pointer;white-space:nowrap;"
    + "font:600 var(--t-foot)/1 system-ui,-apple-system,sans-serif;color:var(--ink,#fff);min-width:0;"
    + "background:var(--casora-studio-link-tint, rgba(94,92,230,.3));box-shadow:inset 0 0 0 .5px var(--casora-studio-link-line, rgba(160,158,255,.5))}"
    + ".cp-show:hover{background:var(--casora-studio-link-line, rgba(94,92,230,.45));filter:none}"
    + ".cp-show svg{width:16px;height:16px}";

  // Inside the private casora-popup: sit in the flow instead of covering the window.
  const SHADOW_CSS = ""
    + ".scrim,.grab{display:none!important}"
    + ".layer{position:relative!important;inset:auto!important;display:block!important;pointer-events:auto!important}"
    + ".surface{margin:0 auto!important;height:auto!important;min-height:0!important;max-height:none!important;"
    + "width:var(--popup-min-width,580px)!important;max-width:var(--popup-max-width,600px)!important;"
    + "border-radius:var(--casora-popup-radius,38px)!important;animation:none!important;transform:none!important}"
    + ".content{overflow:visible!important;pointer-events:none!important;animation:none!important}"
    + ".header-close,.header-content,.header-actions{animation:none!important;opacity:1!important}"
    + ".header-actions{pointer-events:none}"
    + ".header-bar{padding-top:0!important}";

  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraPopups) return;
    P.__casoraPopups = true;

    const css = (self) => {
      if (self.shadowRoot.getElementById("casora-popups-css")) return;
      const st = document.createElement("style");
      st.id = "casora-popups-css";
      st.textContent = CSS;
      self.shadowRoot.appendChild(st);
    };

    const curRoom = (self) => self._state && self._state.compact && self._state.compact.rooms[self._room];

    const popupTemplate = (self, tpl) => {
      const templates = (self._state && self._state.templates) || {};
      const seen = new Set();
      const walk = (x) => {
        for (const n of [].concat(x || [])) {
          if (typeof n !== "string" || seen.has(n)) continue;
          seen.add(n);
          if (/^casora_popup_/.test(n) && n !== "casora_popup_base") return n;
          const hit = walk((templates[n] || {}).template);
          if (hit) return hit;
        }
        return null;
      };
      return walk(tpl);
    };

    // What the current selection's popup is, or null.
    P._cpTarget = function () {
      const sel = this._sel;
      const room = curRoom(this);
      if (!sel || !room) return null;
      if (sel.group === "tiles") {
        const tile = (room.tiles || []).find((x) => this._tileKey(x) === sel.key);
        // Auch Popups, die eine Vorlage direkt im tap_action mitbringt (Thermostat, Medien,
        // Jalousie, Saugroboter …), nicht nur casora_popup_*-Vorlagen in der Kette.
        if (!tile || !(popupTemplate(this, tile.template) || this._popupCardsFor(tile))) return null;
        const name = (tile.name && String(tile.name).trim()) || sel.label || "";
        return { kind: "tile", key: sel.key, tile, name, sig: "tile|" + room.path + "|" + sel.key };
      }
      if (sel.group === "badges") {
        const bid = String(sel.key || "").toLowerCase();
        if (!BADGE_TPL[bid]) return null;
        return { kind: "badge", bid, name: sel.key, sig: "badge|" + room.path + "|" + bid };
      }
      return null;
    };

    // button-card, Casora's scripts and HA's card helpers (loaded with the dashboard
    // panel's code), then casora-popup exists and can build any card type.
    P._cpReady = function () {
      if (this._cpReadyP) return this._cpReadyP;
      this._cpReadyP = (async () => {
        const ok = this._casoraCardsReady ? await this._casoraCardsReady() : !!customElements.get("button-card");
        if (!window.loadCardHelpers) {
          let n = this;
          while (n && n.localName !== "partial-panel-resolver") n = n.parentNode || n.host;
          const routes = n && (n.routerOptions || n._routerOptions || {}).routes;
          const lov = routes && (routes.lovelace || Object.values(routes).find((r) => r && r.tag === "ha-panel-lovelace"));
          try { if (lov && lov.load) await lov.load(); } catch (e) { /* the popup falls back to what is defined */ }
        }
        if (!customElements.get("casora-popup")) {
          await Promise.race([customElements.whenDefined("casora-popup"), tick(4000)]);
        }
        return ok && !!customElements.get("casora-popup");
      })();
      this._cpReadyP.then((ok) => { if (!ok) this._cpReadyP = null; });
      return this._cpReadyP;
    };

    // An offscreen holder for the source cards; button-card only evaluates when connected.
    const holder = () => {
      let h = document.getElementById("casora-popup-src");
      if (!h) {
        h = document.createElement("div");
        h.id = "casora-popup-src";
        h.setAttribute("aria-hidden", "true");
        // The transform makes this the containing block for fixed children (the room
        // hero carries casora-nav), so nothing it renders can escape onto the Studio.
        h.style.cssText = "position:fixed;left:0;top:0;width:1200px;height:800px;overflow:hidden;pointer-events:none;"
          + "visibility:hidden;opacity:0;contain:strict;transform:translate(-300vw,-300vh)";
        document.body.appendChild(h);
      }
      return h;
    };

    const settle = async (el) => {
      for (let i = 0; i < 3; i++) {
        try { if (el.updateComplete) await el.updateComplete; } catch (e) { /* keep going */ }
        await tick(0);
      }
    };

    const popupOf = (el) => {
      if (!el || !el._config || !el._evalActions) return null;
      for (const a of ACTIONS) {
        if (!el._config[a]) continue;
        try {
          // button-card evaluates the action object and always answers under tap_action.
          const r = el._evalActions(el._config, el._config[a]);
          const act = r && (r.tap_action || r[a]);
          const pop = act && act.casora_popup;
          if (pop && pop.content) return pop;
        } catch (e) { /* next action */ }
      }
      // A badge whose tap does something else right now (no members, row toggle) still
      // carries the popup it would open; evaluate that part on its own.
      // Not for a card that stands for the badge row itself: its entity is the row switch.
      if (/^input_select\.casora_expanded_row$/.test(String(el._config.entity || ""))) return null;
      for (const a of ACTIONS) {
        const raw = el._config[a] && el._config[a].casora_popup;
        if (!raw || !el._objectEvalTemplate) continue;
        try {
          const pop = el._objectEvalTemplate(el._stateObj, raw);
          if (pop && pop.content && typeof pop.content === "object") return pop;
        } catch (e) { /* next action */ }
      }
      return null;
    };

    const findCards = (root, out) => {
      if (!root || !root.querySelectorAll) return out;
      root.querySelectorAll("*").forEach((e) => {
        if (e.localName === "button-card") out.push(e);
        if (e.shadowRoot) findCards(e.shadowRoot, out);
      });
      return out;
    };

    // The finished popup config for a target, straight from button-card.
    P._cpConfig = async function (target) {
      const room = curRoom(this);
      if (!room) return null;
      // Casora's current templates where the dashboard holds an unchanged older copy,
      // as the next save will write them – field edits show with today's popups.
      const tpl = this._previewTemplates ? await this._previewTemplates() : (this._state.templates || {});
      if (!curRoom(this)) return null;
      this._casoraCardsShim(tpl || {});
      const h = holder();
      h.replaceChildren();
      const el = document.createElement("button-card");
      // „Vor dem Schalten fragen“ gilt auch hier, mit dem ungespeicherten Stand (casora-core.js
      // liest die Liste aus den Raumvariablen; sonst setzt der Raum sie auf leer zurück).
      const ce = I().confirmEntities ? I().confirmEntities(this._state.compact.rooms) : [];
      window.__casoraConfirmIds = ce;
      const cfg = target.kind === "tile" ? clone(target.tile)
        : { ...clone(room._hero), name: room.name, variables: { ...clone(room.variables), casora_confirm_entities: ce.slice() } };
      try { el.setConfig(cfg); } catch (e) { return null; }
      el.hass = this._hass;
      h.appendChild(el);
      await settle(el);
      try { return await this._cpExtract(el, target); } finally { h.replaceChildren(); }
    };

    P._cpExtract = async function (el, target) {
      if (target.kind === "tile") return popupOf(el);
      // Badges are nested button-cards inside the room hero; they may arrive a beat later.
      const names = BADGE_TPL[target.bid] || [];
      const rank = (c) => {
        const own = [].concat((c._config && c._config.template) || []).map(String);
        const i = names.findIndex((n) => own.includes(n));
        return i < 0 ? Infinity : i;
      };
      for (let i = 0; i < 20; i++) {
        const cards = findCards(el.shadowRoot, []).filter((c) => rank(c) < Infinity).sort((a, b) => rank(a) - rank(b));
        for (const c of cards) {
          await settle(c);
          const pop = popupOf(c);
          if (pop) return pop;
        }
        if (cards.length && i > 4) break;
        await tick(100);
      }
      return null;
    };

    P._cpBar = function (layer, target) {
      let bar = layer.querySelector(".cp-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "cp-bar";
        bar.innerHTML = "<b></b><button type=\"button\" class=\"cp-x\">" + XSVG + "</button>";
        bar.querySelector(".cp-x").onclick = () => this._cpClose(true);
        layer.prepend(bar);
      }
      const b = bar.querySelector("b");
      b.setAttribute("data-no-i18n", "");
      b.innerHTML = "";
      const s = document.createElement("span");
      s.textContent = t("Popup") + " · ";
      b.append(s, document.createTextNode(t(target.name || "")));
      const x = bar.querySelector(".cp-x");
      x.title = t("Close Popup Preview");
      x.setAttribute("aria-label", t("Close Popup Preview"));
      return bar;
    };

    // Lay the layer over the room preview, down to the bottom of the column.
    const WIDE_BELOW = 520;
    P._cpPlace = function () {
      const layer = this._cpLayer;
      const plinth = this.shadowRoot.querySelector(".plinth");
      if (!layer || !plinth) return;
      const stage = plinth.closest(".stage") || plinth.parentElement;
      const pb = plinth.getBoundingClientRect();
      const sb = stage.getBoundingClientRect();
      const wide = pb.width > 0 && pb.width < WIDE_BELOW;
      layer.classList.toggle("cp-wide", wide);
      if (wide && layer.parentNode !== this.shadowRoot) this.shadowRoot.appendChild(layer);
      else if (!wide && layer.parentNode !== plinth) plinth.appendChild(layer);
      // Nutzertest 6 (H, iPad): fixed links ab 0 lag unter HAs Seitenleiste (An/Aus angeschnitten) –
      // die eigene Ebene deckt nur die Studio-Fläche ab.
      if (wide) {
        const hb = this.getBoundingClientRect();
        layer.style.left = Math.max(0, Math.round(hb.left)) + "px";
        layer.style.right = Math.max(0, Math.round(window.innerWidth - hb.right)) + "px";
        layer.style.top = Math.max(0, Math.round(hb.top)) + "px";
      } else ["left", "right", "top"].forEach((k) => layer.style.removeProperty(k));
      if (wide) { layer.style.removeProperty("height"); this._cpFit(); return; }
      const bottom = Math.min(sb.bottom, window.innerHeight) - 16;
      layer.style.height = Math.max(240, Math.round(bottom - pb.top)) + "px";
      this._cpFit();
    };

    // Fit width first. A wide popup (two columns, 900px and up) reflows to a narrower
    // sheet rather than shrinking into unreadable text; only then shrink for height.
    const MIN_ZOOM = 0.66;
    P._cpFit = function () {
      const layer = this._cpLayer;
      const pop = layer && layer.querySelector("casora-popup");
      const box = layer && layer.querySelector(".cp-box");
      if (!pop || !box || !pop.surface) return;
      pop.style.zoom = "1";
      pop.surface.style.removeProperty("width");
      const aw = box.clientWidth - 8, ah = box.clientHeight - 4;
      let w = pop.surface.offsetWidth;
      if (!w || aw < 40) return;
      if (aw / w < MIN_ZOOM) {
        pop.surface.style.setProperty("width", Math.floor(aw / MIN_ZOOM) + "px", "important");
        w = pop.surface.offsetWidth;
      }
      const h = pop.surface.offsetHeight;
      let z = Math.min(1, aw / w);
      if (h * z > ah) z = Math.max(Math.min(z, ah / h), Math.min(z, 0.6));
      pop.style.zoom = z.toFixed(3);
    };

    P._cpOpen = async function (target) {
      target = target || this._cpTarget();
      if (!target || this.classList.contains("phone")) return;
      css(this);
      this._cpWant = target.sig;
      this._cpShowPill(null);
      const plinth = this.shadowRoot.querySelector(".plinth");
      if (!plinth) return;
      let layer = this._cpLayer;
      if (!layer || !layer.isConnected) {
        layer = document.createElement("div");
        layer.className = "cp-layer";
        layer.setAttribute("data-no-i18n", "");
        const box = document.createElement("div");
        box.className = "cp-box";
        layer.appendChild(box);
        plinth.appendChild(layer);
        // Eigene Ebene (cp-wide): Tippen neben das Popup schließt es wie im Dashboard.
        layer.addEventListener("click", (ev) => {
          if (layer.classList.contains("cp-wide") && (ev.target === layer || ev.target === box)) this._cpClose(true);
        });
        this._cpLayer = layer;
        if (!this._cpObs) {
          this._cpObs = new ResizeObserver(() => this._cpPlace());
        }
        this._cpObs.disconnect();
        this._cpObs.observe(plinth.closest(".stage") || plinth);
      }
      this.classList.add("cp-on");
      this._cpBar(layer, target);
      this._cpPlace();
      const box = layer.querySelector(".cp-box");
      const tok = (this._cpTok = (this._cpTok || 0) + 1);
      const note = (msg) => {
        const old = layer.querySelector("casora-popup");
        if (old) this._cpDrop(old);
        const n = document.createElement("div");
        n.className = "cp-note";
        n.textContent = msg;
        box.replaceChildren(n);
      };
      if (!layer.querySelector("casora-popup") && !layer.querySelector(".cp-note")) note(t("Loading popup…"));
      const ok = await this._cpReady();
      if (tok !== this._cpTok) return;
      if (!ok) { note(t("The popup can't be shown here – the button-card isn't installed.")); return; }
      let cfg = null;
      try { cfg = await this._cpConfig(target); } catch (e) { cfg = null; }
      if (tok !== this._cpTok || !this._cpLayer) return;
      if (!cfg || !cfg.content) {
        this._cpSig = null;
        note(t("This popup can't be shown in the preview."));
        return;
      }
      const sig = JSON.stringify(cfg);
      let pop = box.querySelector("casora-popup");
      if (pop && sig === this._cpSig) { this._cpFit(); return; }
      this._cpSig = sig;
      if (!pop) {
        box.replaceChildren();
        pop = document.createElement("casora-popup");
        const st = document.createElement("style");
        st.textContent = SHADOW_CSS;
        pop.shadowRoot.appendChild(st);
        // Its own ✕ and Escape end the preview too.
        pop.addEventListener("casora-popup-closed", () => {
          if (pop._cpDropping) return;
          if (this._cpLayer && this._cpLayer.contains(pop)) this._cpClose(true);
        });
        box.appendChild(pop);
      }
      try { await pop.open(cfg); } catch (e) { note(t("This popup can't be shown in the preview.")); return; }
      // Its document-wide Escape trap would swallow the Studio's own Escape (menus, pickers).
      if (pop._onKey) document.removeEventListener("keydown", pop._onKey, true);
      if (tok !== this._cpTok) return;
      this._cpFit();
      requestAnimationFrame(() => pop.classList.add("cp-in"));
      // Charts and nested cards settle after the first paint.
      [300, 900, 1800].forEach((ms) => setTimeout(() => { if (tok === this._cpTok) this._cpFit(); }, ms));
    };

    // Tear a private popup down through its own close(), so its listeners go too.
    P._cpDrop = function (pop) {
      pop._cpDropping = true;
      try { pop.close(); } catch (e) { /* already gone */ }
      setTimeout(() => pop.remove(), 450);
      pop.style.display = "none";
    };

    // byUser: the ✕ (or Escape) – remember it, so the same selection does not reopen.
    P._cpClose = function (byUser) {
      this._cpTok = (this._cpTok || 0) + 1;
      if (byUser) this._cpDismissed = this._cpWant;
      this._cpWant = null;
      this._cpSig = null;
      const layer = this._cpLayer;
      this._cpLayer = null;
      if (this._cpObs) this._cpObs.disconnect();
      if (layer) {
        const pop = layer.querySelector("casora-popup");
        if (pop) this._cpDrop(pop);
        layer.remove();
      }
      this.classList.remove("cp-on");
      const h = document.getElementById("casora-popup-src");
      if (h) h.replaceChildren();
      this._cpSync();
    };

    // A small "Show Popup" pill under the room preview while a tile or badge with a popup is selected.
    P._cpShowPill = function (target) {
      let pill = this.shadowRoot.querySelector(".cp-show");
      const mount = this.$ && this.$("mapmount");
      const plinth = this.shadowRoot.querySelector(".plinth");
      if (!target || !mount || !plinth || this.classList.contains("phone")) { if (pill) pill.remove(); return; }
      css(this);
      if (!pill) {
        pill = document.createElement("button");
        pill.type = "button";
        pill.className = "cp-show";
        pill.innerHTML = EYE + "<span></span>";
        plinth.appendChild(pill);
      }
      pill.querySelector("span").textContent = t("Show Popup");
      pill.onclick = () => { this._cpDismissed = null; this._cpOpen(this._cpTarget()); };
      pill.style.top = (mount.offsetTop + mount.offsetHeight + 14) + "px";
    };

    // Popup section of the tile page (its fold label names the popup).
    const popupFoldOpen = (self) => [...self.shadowRoot.querySelectorAll("#pane .advsum")]
      .some((s) => /popup/i.test((s.textContent || "") + " " + (s.dataset.orig || ""))
        && s.getAttribute("aria-expanded") === "true");

    // Decide after every render whether the popup preview belongs on screen.
    P._cpSync = function () {
      this._cpWire();
      if (!this.shadowRoot || this._cvOpen || this._cvPeek) { if (this._cpLayer) this._cpClose(); this._cpShowPill(null); return; }
      const target = this._cpTarget();
      const pane = this.$ && this.$("pane");
      const inRoom = !!pane && !this.classList.contains("phone");
      if (!target || !inRoom) {
        if (this._cpLayer) this._cpClose();
        this._cpShowPill(null);
        this._cpDismissed = null;
        return;
      }
      if (this._cpDismissed && this._cpDismissed !== target.sig) this._cpDismissed = null;
      const want = !this._cpDismissed && (this._cpArm === target.sig || this._cpWant === target.sig || popupFoldOpen(this));
      this._cpArm = null;
      if (want) this._cpOpen(target);
      else {
        if (this._cpLayer) this._cpClose();
        this._cpShowPill(target);
      }
    };

    let queued = 0;
    const later = (self, ms) => {
      clearTimeout(queued);
      queued = setTimeout(() => self._cpSync(), ms == null ? 60 : ms);
    };

    // ── Own cards in a tile's popup ─────────────────────────────────────────
    // tile.variables.popup_extra_cards (list of card configs) and popup_extra_title.
    // Every popup template hands them on as casora_popup.extra (window.casoraPopupExtras),
    // casora-popup draws them below its content – here and on the dashboard.
    const PC_CSS = ""
      + ".pc-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}"
      + ".pc-acts .pc-sum{flex:1 1 auto;min-width:0;font-size:var(--t-foot);color:var(--ink-3,rgba(255,255,255,.5));"
      + "overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
      + ".pc-ai{display:flex;flex-direction:column;gap:8px;margin:12px 0 0}"
      + ".pc-aibar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}"
      + ".pc-aibtn{appearance:none;border:0;cursor:pointer;padding:8px 16px;border-radius:999px;font:600 var(--t-foot) system-ui;color:#fff;"
      + "background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff));box-shadow:0 4px 18px rgba(191,90,242,.3)}"
      + ".pc-aibtn:disabled{cursor:progress;opacity:1;background:var(--casora-studio-ai-shimmer, linear-gradient(100deg,#bf5af2 20%,#e3a6ff 50%,#7d5cff 80%)) 0 0/250% 100%;"
      + "animation:pcai 1.4s linear infinite}"
      + ".pc-aibtn[data-off]{cursor:not-allowed;opacity:.45;animation:none;background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff))}"
      + "@keyframes pcai{to{background-position:-250% 0}}"
      + ".pc-aimsg{font-size:var(--t-foot);line-height:1.4;color:var(--ink-3,rgba(255,255,255,.55))}"
      + ".pc-aimsg.err{color:#ff6961}"
      + ".pc-seg{display:inline-flex;padding:2px;border-radius:999px;background:var(--chip,rgba(255,255,255,.08));"
      + "box-shadow:inset 0 0 0 1px var(--chip-rim,rgba(255,255,255,.1))}"
      + ".pc-seg button{appearance:none;border:0;padding:5px 12px;border-radius:999px;font:600 var(--t-foot) system-ui;"
      + "background:transparent;color:var(--ink-2,rgba(255,255,255,.7));box-shadow:none;cursor:pointer}"
      + ".pc-seg button.on{background:var(--chip-hi,rgba(255,255,255,.18));color:var(--ink,#fff)}"
      + ".pc-notes{margin:0;padding:10px 14px 10px 30px;border-radius:var(--r-m);background:rgba(191,90,242,.12);"
      + "box-shadow:inset 0 0 0 .5px rgba(191,90,242,.4);font-size:var(--t-foot);line-height:1.45;color:var(--ink,#fff);text-align:left}"
      + ".pc-notes li+li{margin-top:3px}";
    const pcCss = (self) => {
      if (self.shadowRoot.getElementById("casora-pc-css")) return;
      const st = document.createElement("style");
      st.id = "casora-pc-css";
      st.textContent = PC_CSS;
      self.shadowRoot.appendChild(st);
    };
    const I = () => window.__casoraPanelInternals || {};

    // Does the tile's template chain open a Casora popup (an action with casora_popup.content)?
    const opensPopup = (templates, tpl, seen) => {
      seen = seen || new Set();
      for (const n of [].concat(tpl || [])) {
        if (typeof n !== "string" || seen.has(n)) continue;
        seen.add(n);
        const d = templates[n];
        if (!d || typeof d !== "object") continue;
        if (ACTIONS.some((a) => d[a] && d[a].casora_popup && d[a].casora_popup.content)) return n;
        const hit = opensPopup(templates, d.template, seen);
        if (hit) return hit;
      }
      return null;
    };

    P._popupCardsFor = function (tile) {
      if (!tile || !tile.template || tile.template === "casora_custom") return false;
      return !!opensPopup((this._state && this._state.templates) || {}, tile.template);
    };

    // "custom:mushroom-title-card" reads as "Mushroom title card".
    const cardLabel = (c) => {
      const raw = String((c && c.type) || "card").replace(/^custom:/, "").replace(/[-_]+/g, " ").trim();
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Card";
    };
    const cardSummary = (c) => {
      const o = c || {};
      const v = o.title || o.name || o.entity || o.content
        || (Array.isArray(o.entities) && o.entities.length ? o.entities.length + " entities" : "")
        || (Array.isArray(o.cards) && o.cards.length ? o.cards.length + " cards" : "");
      const first = String(typeof v === "string" || typeof v === "number" ? v : "").split("\n").filter((l) => l.trim())[0] || "";
      const s = first.replace(/^#{1,6}\s*/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
      return /^\[\[\[/.test(s) ? "" : s.length > 48 ? s.slice(0, 48) + "…" : s;
    };

    // JavaScript in [[[ ]]] compiled, never run: the first broken place, or null.
    const brokenJs = (card) => {
      let bad = null;
      (function walk(x, path) {
        if (bad) return;
        if (typeof x === "string") {
          const m = x.match(/^\s*\[\[\[([\s\S]*)\]\]\]\s*$/);
          if (m) { try { new Function("states", "entity", "user", "hass", "variables", "html", "helpers", m[1]); } catch (e) { bad = path || "card"; } }
        } else if (x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k], path ? path + "." + k : k));
      })(card, "");
      return bad;
    };

    const writeCards = (self, tile, list) => {
      const v = tile.variables || (tile.variables = {});
      if (list.length) v.popup_extra_cards = list;
      else {
        delete v.popup_extra_cards;
        delete v.popup_extra_title;
        if (!Object.keys(v).length) delete tile.variables;
      }
      if (self._markDirty) self._markDirty();
      self._renderForm();
    };

    P._popupCardsRows = function (tile, type, advRow) {
      pcCss(this);
      const list = Array.isArray((tile.variables || {}).popup_extra_cards) ? tile.variables.popup_extra_cards : [];
      const add = document.createElement("div");
      add.className = "pc-acts";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "mini";
      addBtn.textContent = "+ Add card";
      addBtn.onclick = () => this._popupCardSheet(tile, type, -1);
      if (!list.length) {
        const s = document.createElement("span");
        s.className = "pc-sum";
        s.textContent = "Shown below the popup's content.";
        add.appendChild(s);
      }
      add.appendChild(addBtn);
      advRow("Own cards in popup", add);
      list.forEach((card, i) => {
        const acts = document.createElement("div");
        acts.className = "pc-acts";
        const sum = document.createElement("span");
        sum.className = "pc-sum";
        sum.setAttribute("data-no-i18n", "");
        sum.textContent = cardSummary(card);
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "mini";
        edit.textContent = "Edit";
        edit.onclick = () => this._popupCardSheet(tile, type, i);
        const up = document.createElement("button");
        up.type = "button";
        up.className = "mini icon";
        up.title = "Move up";
        up.setAttribute("aria-label", "Move up");
        up.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
        up.disabled = i === 0;
        up.onclick = () => {
          const next = list.slice();
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          writeCards(this, tile, next);
        };
        const del = document.createElement("button");
        del.type = "button";
        del.className = "mini danger";
        del.textContent = "Remove";
        del.onclick = async () => {
          const yes = await this._ask({
            title: "Remove this card?",
            message: "It disappears from this tile's popup. This cannot be undone.",
            confirmLabel: "Remove", destructive: true,
          });
          if (!yes) return;
          writeCards(this, tile, list.filter((_, k) => k !== i));
          this._status("Card removed", "ok");
        };
        acts.append(sum, edit);
        if (list.length > 1) acts.appendChild(up);
        acts.appendChild(del);
        const lab = (i + 1) + ". " + cardLabel(card);
        advRow(lab, acts);
        // The label is data, not UI text.
        const rows = acts.parentNode && acts.parentNode.querySelector("label");
        if (rows) rows.setAttribute("data-no-i18n", "");
      });
      if (list.length) {
        const input = document.createElement("input");
        input.value = typeof tile.variables.popup_extra_title === "string" ? tile.variables.popup_extra_title : "";
        input.placeholder = "No heading";
        input.onchange = () => {
          const v = input.value.trim();
          if (v) tile.variables.popup_extra_title = v;
          else delete tile.variables.popup_extra_title;
          this._syncPreview();
        };
        advRow("Heading above your cards", input);
      }
    };

    // Paste or edit one card (YAML or JSON), with "Adapt to Casora with AI".
    P._popupCardSheet = async function (tile, type, i) {
      pcCss(this);
      const list = Array.isArray((tile.variables || {}).popup_extra_cards) ? tile.variables.popup_extra_cards : [];
      const editing = i >= 0 && !!list[i];
      const { parseCardText, cardToText } = I();
      if (!parseCardText || !cardToText) return;
      const room = curRoom(this);
      const self = this;
      const got = await this._ask({
        title: editing ? "Edit popup card" : "Card in the popup",
        message: "Paste a Lovelace card – the same YAML or JSON you would use in Home Assistant's "
          + "card editor. It shows below the popup's content.",
        value: editing ? cardToText(list[i]) : "",
        multiline: true,
        wide: true,
        rows: 14,
        placeholder: "type: markdown\ncontent: Hello",
        confirmLabel: editing ? "Save" : "Add",
        validate: (v) => {
          let c;
          try { c = parseCardText(v); } catch (e) { return e.message; }
          const bad = brokenJs(c);
          return bad ? t("The JavaScript in [[[ ]]] does not compile") + " (" + bad + ")." : "";
        },
        extend: (ui) => self._popupCardAi(ui, { tile, type, room }),
      });
      if (!got) return;
      let card;
      try { card = parseCardText(typeof got === "string" ? got : got.value); } catch (e) { return this._status(e.message, "err"); }
      const next = list.slice();
      if (editing) next[i] = card; else next.push(card);
      writeCards(this, tile, next);
      this._status(editing ? "Card updated" : "Card added to the popup", "ok");
    };

    // The AI part of the sheet: button, notes on what changed, before/after.
    P._popupCardAi = function (ui, ctx) {
      const { box, input, acts } = ui;
      if (!input) return;
      const { parseCardText, cardToText } = I();
      const wrap = document.createElement("div");
      wrap.className = "pc-ai";
      const bar = document.createElement("div");
      bar.className = "pc-aibar";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pc-aibtn";
      btn.textContent = "✨ Adapt to Casora with AI";
      const msg = document.createElement("div");
      msg.className = "pc-aimsg";
      bar.appendChild(btn);
      wrap.appendChild(bar);
      wrap.appendChild(msg);
      box.insertBefore(wrap, acts);

      let best, seg = null, notes = null;
      const slots = { before: null, after: null };
      let showing = "after";
      const say = (text, err) => {
        msg.textContent = text || "";
        msg.classList.toggle("err", !!err);
        if (err) msg.setAttribute("data-no-i18n", ""); else msg.removeAttribute("data-no-i18n");
      };
      const models = this._hass.callWS({ type: "casora/ki/models" })
        .then((r) => { best = (r && r.best) || null; return r; })
        .catch(() => { best = null; return null; });
      models.then((r) => {
        if (best) return;
        btn.setAttribute("data-off", "");
        say(r && r.all && r.all.length
          ? "Needs a stronger AI – for example Claude Opus, Claude Sonnet 4.5 or GPT-5. Settings → AI tasks."
          : "Needs an AI – for example Claude Opus. Settings → AI tasks.");
      });
      const show = (which) => {
        if (slots[showing] != null) slots[showing] = input.value;
        showing = which;
        input.value = slots[which];
        if (seg) seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === which));
      };

      btn.onclick = async () => {
        if (btn.disabled) return;
        await models;
        if (!best) return;
        const raw = input.value.trim();
        let card;
        try { card = parseCardText(raw); } catch (e) { say(e.message, true); return; }
        const tile = ctx.tile || {};
        const context = {
          tile_type: (ctx.type && (ctx.type.label || ctx.type.id)) || "",
          tile_name: String(tile.name || ""),
          entity: String(tile.entity || ""),
          room: String((ctx.room && ctx.room.name) || ""),
          popup: opensPopup((this._state && this._state.templates) || {}, tile.template) || "",
        };
        if (window.casoraAiCost) {
          const chars = JSON.stringify(card).length + 6000;
          const ok = await window.casoraAiCost.confirm(this, { model: best.model, label: best.label, inChars: chars,
            calls: 1, outTokens: JSON.stringify(card).length / 3, what: t("this card") });
          if (!ok) return;
        }
        btn.disabled = true;
        say("AI is adapting the card…");
        let r;
        try {
          r = await this._hass.callWS({ type: "casora/ki/adapt_card", card, context });
          const bad = r && r.card && typeof r.card === "object" ? brokenJs(r.card) : "card";
          if (bad) throw new Error(t("The AI returned broken code") + " (" + bad + ").");
        } catch (e) {
          btn.disabled = false;
          say(t("AI didn't work: ") + ((e && e.message) || e), true);
          return;
        }
        btn.disabled = false;
        slots.before = raw + "\n";
        slots.after = cardToText(r.card);
        showing = "after";
        input.value = slots.after;
        const changes = (Array.isArray(r.changes) ? r.changes : []).map(String).filter(Boolean);
        say(changes.length ? "Check the result, then save." : "The AI found nothing to change.");
        if (!notes) {
          notes = document.createElement("ul");
          notes.className = "pc-notes";
          notes.setAttribute("data-no-i18n", "");
          wrap.appendChild(notes);
        }
        notes.replaceChildren(...changes.map((c) => { const li = document.createElement("li"); li.textContent = c; return li; }));
        notes.hidden = !changes.length;
        if (!seg) {
          seg = document.createElement("div");
          seg.className = "pc-seg";
          seg.setAttribute("role", "group");
          [["before", "Before"], ["after", "After"]].forEach(([k, label]) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.k = k;
            b.textContent = label;
            b.onclick = () => show(k);
            seg.appendChild(b);
          });
          bar.appendChild(seg);
        }
        show("after");
      };
    };

    // ── Hooks ────────────────────────────────────────────────────────────────
    const stackPopups = P._stackPopups;
    P._stackPopups = function (pane) {
      const r = stackPopups.apply(this, arguments);
      pane.querySelectorAll("#band-popups .poprow").forEach((row) => {
        if (row._cpWrapped) return;
        row._cpWrapped = true;
        const go = row.onclick;
        row.onclick = (ev) => {
          this._cpDismissed = null;
          if (go) go.call(row, ev);
          const target = this._cpTarget();
          if (target) { this._cpArm = target.sig; later(this, 0); }
        };
      });
      return r;
    };

    const renderForm = P._renderForm;
    P._renderForm = function () {
      const r = renderForm.apply(this, arguments);
      later(this);
      return r;
    };

    // Field edits: rebuild the popup from the new tile config (only when it changed).
    const syncPreview = P._syncPreview;
    P._syncPreview = function () {
      const r = syncPreview.apply(this, arguments);
      if (this._cpLayer) later(this, 250);
      return r;
    };

    const rebuild = P._rebuildPreview;
    P._rebuildPreview = function () {
      const r = rebuild.apply(this, arguments);
      later(this, 120);
      return r;
    };

    // Opening or closing a Popup fold on the tile page.
    P._cpWire = function () {
      if (!this._cpClicks && this.shadowRoot) {
        this._cpClicks = (ev) => {
          const sum = ev.composedPath().find((n) => n && n.classList && n.classList.contains("advsum"));
          if (!sum || !/popup/i.test(sum.textContent || "")) return;
          this._cpDismissed = null;
          setTimeout(() => {
            if (sum.getAttribute("aria-expanded") === "true") this._cpSync();
            else if (this._cpLayer) this._cpClose(true);
          }, 30);
        };
        this.shadowRoot.addEventListener("click", this._cpClicks);
      }
    };
    const connected = P.connectedCallback;
    P.connectedCallback = function () {
      const r = connected ? connected.apply(this, arguments) : undefined;
      this._cpWire();
      return r;
    };
    const disconnected = P.disconnectedCallback;
    P.disconnectedCallback = function () {
      if (this._cpLayer) this._cpClose();
      return disconnected ? disconnected.apply(this, arguments) : undefined;
    };

  });
})();
