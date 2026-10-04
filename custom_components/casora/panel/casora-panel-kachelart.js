// Eigene Kachelarten (03.10.2026)
//
// Statt eine Casora-Vorlage (casora_camera …) direkt zu ändern – dann bekommt sie keine
// Updates mehr – legt man eine eigene Kachelart an: eine Vorlage own_<name>, die von der
// Casora-Vorlage erbt (button-card „template: casora_xyz“) und nur die Änderungen als
// Überlagerung trägt. Casora-Updates der Grundlage wirken so weiter.
//
// Ablauf: Vorlage wählen → Name → „Was soll anders sein?“ (KI, casora/ki/tile_type, gleiche
// Op-Liste wie der Umzug) → Vorher/Nachher als echte Kachel → Nachbessern oder Verwerfen →
// anlegen. Gespeichert wird die Vorlage sofort in beiden Dashboards (Desktop + Handy); das
// Umstellen von Kacheln ist eine normale Studio-Änderung (Speichern).
//
// Die Überlagerung folgt button-cards Zusammenführung (mergeDeep): Objekte werden gemischt,
// Listen aneinandergehängt, alles andere ersetzt; state-Einträge mit id gemischt.
// In der Vorlage steht unter variables.casora_tile {label, base, wishes}: daran erkennt das
// Studio die Kachelart (syncUserTileTypes) und übernimmt Felder, Symbol und Farbe der Grundlage.
(() => {
  if (window.casoraKachelart) return;
  const PREFIX = "own_";
  const I = () => window.__casoraPanelInternals || {};
  const tr = (x) => (window.casoraI18n ? window.casoraI18n.t(x) : x);
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ── Reine Logik (auch für dev/unit/kachelart.mjs) ─────────────────────────────

  // button-card: kn() – Listen anhängen, Objekte mischen, sonst ersetzen.
  function mergeBC(a, b) {
    const out = isObj(a) ? { ...a } : {};
    Object.keys(b || {}).forEach((k) => {
      const o = out[k], r = b[k];
      if (Array.isArray(o) && Array.isArray(r)) out[k] = o.concat(r);
      else if (o && typeof o === "object" && r && typeof r === "object" && !Array.isArray(o) && !Array.isArray(r)) out[k] = mergeBC(o, r);
      else out[k] = r;
    });
    return out;
  }
  // state wird in button-card über id gemischt (Fn), sonst angehängt.
  function mergeState(a, b) {
    const out = [];
    (a || []).forEach((x) => {
      let it = x;
      (b || []).forEach((y) => { if (y && x && y.id && x.id && y.id == x.id) it = mergeBC(it, y); }); // eslint-disable-line eqeqeq
      out.push(it);
    });
    return out.concat((b || []).filter((y) => !(a || []).some((x) => x && y && x.id && y.id && x.id == y.id))); // eslint-disable-line eqeqeq
  }
  // Eine Ebene so, wie button-card die eigene Vorlage über die geerbte legt.
  function overlayApply(base, ov) {
    const out = mergeBC(base, ov);
    if (Array.isArray(base.state) || Array.isArray(ov.state)) out.state = mergeState(base.state, ov.state);
    return out;
  }

  const UNREPRESENTABLE = {};
  // Unterschied b → m als Überlagerung (undefined = gleich; UNREPRESENTABLE = geht nicht).
  function diff(b, m, path) {
    if (same(b, m)) return undefined;
    if (isObj(b) && isObj(m)) {
      const out = {};
      Object.keys(m).forEach((k) => {
        const d = diff(b[k], m[k], path.concat(k));
        if (d === UNREPRESENTABLE) throw UNREPRESENTABLE;
        if (d !== undefined) out[k] = d;
      });
      // Weggefallene Schlüssel: auf null setzen (überschreibt den geerbten Wert).
      Object.keys(b).forEach((k) => { if (!(k in m)) out[k] = null; });
      return Object.keys(out).length ? out : undefined;
    }
    if (Array.isArray(b) && Array.isArray(m)) {
      // Nur angehängt: genau das Angehängte.
      if (m.length >= b.length && b.every((x, i) => same(x, m[i]))) return m.slice(b.length);
      // Styles (Listen aus {Eigenschaft: Wert}): spätere Einträge gewinnen.
      if (path.includes("styles") && b.concat(m).every(isObj)) {
        const flat = (l) => Object.assign({}, ...l);
        const fb = flat(b), fm = flat(m), out = [];
        Object.keys(fm).forEach((k) => { if (!same(fb[k], fm[k])) out.push({ [k]: fm[k] }); });
        Object.keys(fb).forEach((k) => { if (!(k in fm)) out.push({ [k]: "unset" }); });
        return out.length ? out : undefined;
      }
      // state mit id: geänderte Einträge über ihre id.
      if (path.length === 1 && path[0] === "state" && b.concat(m).every((x) => isObj(x) && x.id)
        && b.every((x) => m.some((y) => y.id == x.id))) { // eslint-disable-line eqeqeq
        const out = [];
        m.forEach((y) => {
          const x = b.find((z) => z.id == y.id); // eslint-disable-line eqeqeq
          if (!x) { out.push(y); return; }
          const d = diff(x, y, path.concat(String(y.id)));
          if (d === UNREPRESENTABLE) throw UNREPRESENTABLE;
          if (d !== undefined) out.push({ ...d, id: y.id });
        });
        return out.length ? out : undefined;
      }
      return UNREPRESENTABLE;
    }
    if (Array.isArray(b) && !Array.isArray(m) && m != null && typeof m === "object") return UNREPRESENTABLE;
    return m === undefined ? null : clone(m);
  }

  // Überlagerung zwischen Casoras Vorlage und der geänderten Fassung, ohne „template“.
  // null: lässt sich nicht als Überlagerung ausdrücken (eine Liste wurde umgebaut).
  function overlayOf(base, modified) {
    const b = { ...(base || {}) }, m = { ...(modified || {}) };
    delete b.template; delete m.template;
    if (isObj(b.variables)) { b.variables = { ...b.variables }; delete b.variables.casora_tile; }
    if (isObj(m.variables)) { m.variables = { ...m.variables }; delete m.variables.casora_tile; }
    try {
      const d = diff(b, m, []);
      return d === UNREPRESENTABLE ? null : (d || {});
    } catch (e) {
      if (e === UNREPRESENTABLE) return null;
      throw e;
    }
  }

  const metaOf = (tpl) => {
    const m = tpl && tpl.variables && tpl.variables.casora_tile;
    return isObj(m) && typeof m.base === "string" ? m : null;
  };

  // Die eigene Vorlage: erbt von der Grundlage und trägt nur den Unterschied.
  // Geht das nicht (umgebaute Liste), eine vollständige Kopie, die von den Eltern der
  // Grundlage erbt – dann gelten Casora-Updates nur für diese Eltern (meta.copy).
  function buildOwn(baseName, base, modified, meta) {
    const ov = overlayOf(base, modified);
    const wishes = (meta.wishes || []).map((w) => String(w).replace(/\[\[\[|\]\]\]/g, "")).slice(-8);
    const m = { label: String(meta.label || "").trim(), base: baseName, wishes };
    if (ov) {
      const out = { template: baseName, ...ov };
      out.variables = { ...(isObj(ov.variables) ? ov.variables : {}), casora_tile: m };
      return out;
    }
    const out = clone(modified);
    out.template = clone(base.template);
    if (out.template === undefined) delete out.template;
    out.variables = { ...(isObj(out.variables) ? out.variables : {}), casora_tile: { ...m, copy: true } };
    return out;
  }

  // Die bearbeitbare Fassung einer eigenen Vorlage: Grundlage mit Überlagerung darüber.
  function effectiveOf(base, own) {
    const meta = metaOf(own);
    const body = clone(own);
    delete body.template;
    if (isObj(body.variables)) { delete body.variables.casora_tile; if (!Object.keys(body.variables).length) delete body.variables; }
    const out = meta && meta.copy ? body : overlayApply(clone(base), body);
    if (base && base.template !== undefined) out.template = clone(base.template); else delete out.template;
    return out;
  }

  const slugOf = (s) => String(s || "").toLowerCase().trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "kachel";
  function ownName(label, existing) {
    const have = existing || {};
    const root = PREFIX + slugOf(label);
    let n = root, k = 2;
    while (have[n] !== undefined) n = root + "_" + k++;
    return n;
  }

  // Kacheln (auch in bedingten Hüllen), die diese Vorlage nutzen.
  function tilesUsing(rooms, name) {
    const out = [];
    (rooms || []).forEach((r) => (r.tiles || []).forEach((t) => {
      let c = t, n = 0;
      while (c && c.type === "conditional" && c.card && n++ < 4) c = c.card;
      if (c && c.template === name) out.push({ room: r, tile: c });
    }));
    return out;
  }

  // JavaScript in [[[ ]]] übersetzen lassen, ohne es auszuführen.
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

  const lib = { mergeBC, overlayApply, overlayOf, buildOwn, effectiveOf, metaOf, ownName, slugOf, tilesUsing, brokenJs, PREFIX };

  // ── Studio ───────────────────────────────────────────────────────────────────

  const CSS = ".ka-wish{width:100%;min-height:88px;box-sizing:border-box;resize:vertical;border:0;outline:0;background:none;color:var(--ink);"
    + "font:400 var(--t-body,17px)/1.4 var(--primary-font-family,system-ui);padding:12px 16px}"
    + ".ka-wish::placeholder{color:var(--ink-3,rgba(255,255,255,.45))}"
    + ".ka-ai{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:999px;"
    + "white-space:nowrap;font:600 var(--t-callout,15px) system-ui;color:#fff;background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff))}"
    + ".ka-ai[hidden]{display:none !important}.ka-ai svg{width:17px;height:17px;fill:currentColor}.ka-ai[disabled]{opacity:.5;cursor:not-allowed}"
    + ".ka-ai.busy{cursor:progress;background:var(--casora-studio-ai-shimmer, linear-gradient(100deg,#bf5af2 20%,#e3a6ff 50%,#7d5cff 80%)) 0 0/250% 100%;animation:kaaibusy 1.4s linear infinite}"
    + "@keyframes kaaibusy{to{background-position:-250% 0}}"
    + ".ka-cost{font-weight:400;opacity:.8}"
    + ".ka-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}"
    + ".ka-col{display:flex;flex-direction:column;gap:8px;min-width:0}"
    + ".ka-stage{display:grid;place-items:center;min-height:220px;padding:18px 10px;border-radius:var(--r-l,20px);background:#1c1d22 center/cover no-repeat;overflow:hidden}"
    + ".ka-tile{width:min(250px,100%);pointer-events:none;--casora-entity-height-current:190px}"
    + ".ka-cap{font:600 var(--t-callout,15px) system-ui;color:var(--ink-2);text-align:center}"
    + ".ka-cap.new{color:var(--casora-studio-ai,#bf5af2)}"
    + ".ka-notes{margin:14px 0 0;padding:12px 16px;border-radius:var(--casora-popup-row-radius,20px);background:var(--casora-popup-row-fill,rgba(255,255,255,.10));"
    + "display:flex;flex-direction:column;gap:6px;margin-bottom:22px;font-size:var(--t-callout,15px);line-height:1.4;color:var(--ink)}"
    + ".ka-notes div{display:flex;gap:8px}.ka-notes div::before{content:'✦';color:var(--casora-studio-ai,#bf5af2);flex:none}"
    + ".ka-notes.err div::before{content:'!';color:var(--casora-studio-bad,#ff6961);font-weight:700}"
    + ".ka-hint{margin:12px 4px 0;font-size:var(--t-foot,13px);line-height:1.45;color:var(--ink-3,rgba(255,255,255,.5))}"
    + ".ka-refine{display:flex;align-items:center;gap:8px;padding-right:8px}.ka-refine input.fin{flex:1;text-align:left !important}"
    + ".ka-send{appearance:none;border:0;background:none;cursor:pointer;font:600 var(--t-callout,15px) system-ui;color:var(--casora-studio-ai,#bf5af2);padding:8px}"
    + ".ka-send[disabled]{opacity:.4;cursor:default}"
    + ".ka-timer{text-align:center;font:500 var(--t-foot,13px) system-ui;color:var(--ink-3,rgba(255,255,255,.5));margin-top:10px;font-variant-numeric:tabular-nums}"
    + "@media (max-width:700px){.ka-stage{min-height:170px;padding:14px 8px}.ka-tile{width:100%}}";
  const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';

  function css(root) {
    if (root.querySelector("style[data-ka]")) return;
    const st = document.createElement("style");
    st.setAttribute("data-ka", "");
    st.textContent = CSS;
    root.appendChild(st);
  }
  const el = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };

  // Casoras Kachelarten, die als Grundlage taugen: eine Vorlage, die es im Bundle gibt.
  function baseTypes(panelTemplates) {
    const T = I().TILE_TYPES || [];
    return T.filter((t) => !t.hidden && typeof t.template === "string" && t.template.indexOf("casora_") === 0
      && (!panelTemplates || panelTemplates[t.template]));
  }
  const typeLabel = (t) => tr(t.label);
  const iconOf = (t) => {
    const I0 = I();
    const name = (I0.TILE_ICON || {})[t.id] || t.icon;
    return name && I0.iconUrl ? I0.iconUrl(name) : null;
  };
  const tintOf = (t) => (I().TILE_COLOR || {})[t.id] || "var(--casora-color-teal, #00C3D0)";

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;

    // Alle eigenen Kachelarten dieses Dashboards: {name, tpl, meta}.
    P._kaOwn = function () {
      const T = (this._state && this._state.templates) || {};
      return Object.keys(T).filter((n) => n.indexOf(PREFIX) === 0 && metaOf(T[n]))
        .map((n) => ({ name: n, tpl: T[n], meta: metaOf(T[n]) }))
        .sort((a, b) => a.meta.label.localeCompare(b.meta.label));
    };
    P._kaRooms = function () {
      const out = [];
      ((this._state && this._state.compact && this._state.compact.rooms) || []).forEach((r) => out.push(r));
      const p = this._pair;
      if (p && p.safe !== false) ((p.mobile.compact || {}).rooms || []).forEach((r) => out.push(r));
      return out;
    };
    P._kaResync = function () {
      const s = this._state;
      const I0 = I();
      if (s && I0.syncUserTileTypes) {
        I0.syncUserTileTypes(s.templates, (s.compact || {}).rooms, null, (s.extras || {})[I0.FINGERPRINT_KEY]);
      }
    };

    // Vorlagen sofort in beide Dashboards schreiben (Desktop + Handy). Nur button_card_templates.
    // changes: {name: Vorlage | null (löschen)}.
    P._kaWrite = async function (changes) {
      const s = this._state;
      const urls = [this._dashUrl];
      const p = this._pair;
      if (p && p.safe !== false && p.mobileUrl) urls.push(p.mobileUrl);
      const lock = window.CASORA_STUDIO_SAVE_LOCK;
      if (lock && urls.some((u) => new RegExp(lock).test(u || "")) && !window.CASORA_STUDIO_SAVE_OK) {
        throw new Error(tr("Saving is locked for this dashboard."));
      }
      for (const url_path of urls.filter(Boolean)) {
        const cfg = await this._hass.callWS({ type: "lovelace/config", url_path });
        const tpl = { ...(cfg.button_card_templates || {}) };
        Object.keys(changes).forEach((k) => { if (changes[k] === null) delete tpl[k]; else tpl[k] = clone(changes[k]); });
        await this._hass.callWS({ type: "lovelace/config/save", url_path, config: { ...cfg, button_card_templates: tpl } });
      }
      // Im Studio nachziehen: das nächste Speichern übernimmt sie (oder lässt sie weg).
      s.templates = { ...(s.templates || {}) };
      this._ownTemplates = { ...(this._ownTemplates || {}) };
      Object.keys(changes).forEach((k) => {
        if (changes[k] === null) { delete s.templates[k]; delete this._ownTemplates[k]; }
        else { s.templates[k] = clone(changes[k]); this._ownTemplates[k] = clone(changes[k]); }
      });
      if (p && p.templates) {
        p.templates = { ...p.templates };
        Object.keys(changes).forEach((k) => { if (changes[k] === null) delete p.templates[k]; else p.templates[k] = clone(changes[k]); });
      }
      this._pvTpl = null;
      this._kaResync();
    };

    // Eine Kachel auf eine andere Kachelart stellen – auch ihr Gegenstück auf dem Handy.
    P._kaSwitchTile = function (tile, to) {
      const from = tile.template;
      if (from === to) return;
      const p = this._pair;
      if (p && p.safe !== false) {
        ((p.mobile.compact || {}).rooms || []).forEach((sec) => (sec.tiles || []).forEach((mt) => {
          if (mt && mt !== tile && mt.template === from && (mt.entity || "") === (tile.entity || "")) mt.template = to;
        }));
      }
      tile.template = to;
    };

    // ── Einstieg aus dem Kachelmenü ─────────────────────────────────────────────
    window.casoraKachelart = window.casoraKachelart || {};
    Object.assign(window.casoraKachelart, {
      lib,
      // Menüeinträge einer Kachel ergänzen (casora-panel.js, _tileCard).
      menu(panel, menu, ctx) {
        const t = ctx.type || {};
        const base = t.own ? t.baseTemplate : (typeof t.template === "string" && t.template.indexOf("casora_") === 0 && !t.hidden ? t.template : null);
        if (!base) return;
        const at = Math.max(0, menu.findIndex((m) => m.id === "remove"));
        const items = [{ id: "ka_new", label: "Create own tile type…" }];
        if (panel._kaOwn().some((o) => o.meta.base === base)) items.push({ id: "ka_switch", label: "Change tile type…" });
        menu.splice(at, 0, ...items);
      },
      pick(panel, id, ctx) {
        if (id === "ka_new") { panel._kaStart({ room: ctx.room, tile: ctx.tile, base: ctx.type.own ? ctx.type.baseTemplate : ctx.type.template }); return true; }
        if (id === "ka_switch") { panel._kaSwitchMenu(ctx.anchor, ctx.room, ctx.tile, ctx.type); return true; }
        return false;
      },
      // Einträge in „Kachel hinzufügen“.
      addItems(panel) {
        const out = [{ id: "__ka_new", label: tr("New tile type…"), group: tr("Own tile types"), quiet: false }];
        if (panel._kaOwn().length) out.push({ id: "__ka_manage", label: tr("Manage own tile types…"), group: tr("Own tile types"), quiet: false });
        return out;
      },
      addPick(panel, id, room) {
        if (id === "__ka_new") { panel._kaStart({ room }); return true; }
        if (id === "__ka_manage") { panel._kaManage(); return true; }
        return false;
      },
    });

    P._kaSwitchMenu = function (anchor, room, tile, type) {
      const base = type.own ? type.baseTemplate : type.template;
      const T = I().TILE_TYPES || [];
      const bt = I().findType ? I().findType(T, base) : null;
      const items = [{ id: base, label: bt ? typeLabel(bt) : base, group: tr("Casora") }]
        .concat(this._kaOwn().filter((o) => o.meta.base === base)
          .map((o) => ({ id: o.name, label: o.meta.label, group: tr("Own tile types") })));
      this._menuAt(anchor, items, (to) => {
        if (!to || to === tile.template) return;
        this._kaSwitchTile(tile, to);
        this._markDirty();
        this._renderForm();
        this._status(tr("Tile type changed. Save to apply."), "ok");
      });
    };

    // ── Assistent ──────────────────────────────────────────────────────────────
    // o: {room, tile?, base?, own?: {name, tpl, meta}}
    P._kaStart = async function (o) {
      css(this.shadowRoot);
      let T = {};
      try { T = await this._previewTemplates(); } catch (e) { T = (this._state && this._state.templates) || {}; }
      const a = { room: o.room, tile: o.tile || null, base: o.base || null, own: o.own || null, T,
        label: "", wish: "", wishes: [], notes: [], current: null, switchTile: !!o.tile, ai: null };
      if (a.own) {
        a.base = a.own.meta.base;
        a.label = a.own.meta.label;
        a.wishes = (a.own.meta.wishes || []).slice();
      }
      a.aiReady = this._hass.callWS({ type: "casora/ki/models" }).then((r) => { a.ai = (r && r.best) || null; return r; }).catch(() => null);
      if (a.base) return this._kaName(a);
      return this._kaBase(a);
    };

    // Schritt 1: Grundlage wählen.
    P._kaBase = function (a) {
      const s = this._flowScreen({ icon: "palette", step: [1, 3], title: "New Tile Type",
        lede: "Pick the Casora tile your tile type builds on. It keeps getting Casora's updates." });
      const list = this._flowGroup(s.body, { header: "Based on" });
      const types = baseTypes(a.T).slice().sort((x, y) => typeLabel(x).localeCompare(typeLabel(y)));
      types.forEach((t) => {
        const r = this._flowRow(list, { title: t.label, mask: iconOf(t), tint: tintOf(t), chevron: true,
          onTap: () => { a.base = t.template; a.label = ""; this._kaName(a); } });
        r.row.dataset.base = t.template;
      });
    };

    // Schritt 2: Name und Wunsch.
    P._kaName = async function (a) {
      const T = I().TILE_TYPES || [];
      const bt = (I().findType && I().findType(T, a.base)) || { label: a.base, id: a.base };
      a.baseType = bt;
      const s = this._flowScreen({ icon: "palette", step: [a.own ? 1 : 2, a.own ? 2 : 3],
        title: a.own ? "Adjust Tile Type" : tr("Adjust {1}").replace("{1}", tr(bt.label)),
        lede: a.own ? "Say what should change. Your earlier changes stay." : "Name your tile type and say what should be different.",
        back: a.own || o_fromTile(a) ? null : () => this._kaBase(a) });
      const nameList = this._flowGroup(s.body, { header: "Name" });
      const nm = this._flowRow(nameList, { input: a.label, placeholder: tr("e.g. Camera with still image") });
      nm.input.setAttribute("data-no-i18n", "");
      nm.input.dataset.ka = "name";
      nm.input.style.textAlign = "left";
      nm.input.addEventListener("input", () => { a.label = nm.input.value; sync(); });
      if (a.own) nm.input.disabled = true;
      const wl = this._flowGroup(s.body, { header: "What should be different?",
        footer: tr("The AI only changes what you write here. Everything else stays Casora's {1} tile.").replace("{1}", tr(bt.label)) });
      const row = el("div", "frow field", wl);
      const wish = el("textarea", "ka-wish", row);
      wish.dataset.ka = "wish";
      wish.placeholder = tr("e.g. Show a still image every 10 seconds instead of the live picture");
      wish.value = a.wish;
      wish.setAttribute("data-no-i18n", "");
      wish.addEventListener("input", () => { a.wish = wish.value; sync(); });
      const hint = el("div", "ka-hint", s.body);
      hint.hidden = true;
      const aiBtn = el("button", "ka-ai", s.acts);
      aiBtn.type = "button";
      aiBtn.dataset.ka = "ai";
      aiBtn.innerHTML = SPARK + "<span></span><span class=\"ka-cost\" data-no-i18n></span>";
      aiBtn.querySelector("span").textContent = tr("Adjust with AI");
      const plain = a.own ? null : this._flowButton(s.acts, "Create without changes", () => this._kaCreate(a, null), true);
      if (plain) plain.dataset.ka = "plain";
      const sync = () => {
        const named = !!String(a.label || "").trim();
        aiBtn.disabled = !a.ai || !named || !String(a.wish || "").trim();
        if (plain) plain.disabled = !named;
      };
      sync();
      aiBtn.onclick = () => { if (!aiBtn.disabled) this._kaRun(a, a.wish, true); };
      await a.aiReady;
      if (!s.box.isConnected) return;
      if (!a.ai) {
        hint.hidden = false;
        hint.textContent = tr("AI changes need an AI task (Settings → AI tasks), for example Claude Sonnet 4.5. You can still create the tile type now as an unchanged copy and adjust it later.");
        aiBtn.hidden = true;
      } else if (window.casoraAiCost && window.casoraAiCost.format) {
        const chars = JSON.stringify(a.T[a.base] || {}).length + 9000;
        aiBtn.querySelector(".ka-cost").textContent = "(≈ " + window.casoraAiCost.format(this._hass, { model: a.ai.model, inChars: chars, calls: 1 }) + ")";
      }
      sync();
      (a.own ? wish : nm.input).focus();
    };
    const o_fromTile = (a) => !!a.tile;

    // Die Fassung, an der die KI arbeitet: bisheriges Ergebnis, sonst die (eigene) Vorlage.
    const working = (a) => {
      if (a.current) return a.current;
      const base = a.T[a.base] || {};
      return a.own ? effectiveOf(base, a.own.tpl) : clone(base);
    };
    const parentsOf = (a) => {
      const out = {};
      const seen = new Set();
      const walk = (t) => [].concat(t || []).forEach((n) => {
        if (typeof n !== "string" || seen.has(n) || !a.T[n]) return;
        seen.add(n);
        out[n] = a.T[n];
        walk(a.T[n].template);
      });
      walk((a.T[a.base] || {}).template);
      return out;
    };

    // KI arbeiten lassen (erster Wunsch oder Nachbessern).
    P._kaRun = async function (a, text, first) {
      const wish = String(text || "").trim();
      if (!wish || !a.ai) return;
      if (first && window.casoraAiCost) {
        const chars = JSON.stringify(working(a)).length + JSON.stringify(parentsOf(a)).length / 3 + 3000;
        const ok = await window.casoraAiCost.confirm(this, { model: a.ai.model, label: a.ai.label, inChars: chars, calls: 1,
          what: tr("this tile type") });
        if (!ok) return;
      }
      const s = this._flowScreen({ icon: "palette", step: [a.own ? 2 : 3, a.own ? 2 : 3], title: "AI Is Adjusting…",
        lede: tr("{1} changes the tile as you asked.").replace("{1}", a.ai.label || "AI") });
      const timer = el("div", "ka-timer", s.body, "0:00");
      timer.setAttribute("data-no-i18n", "");
      const t0 = Date.now();
      const tick = setInterval(() => {
        if (!timer.isConnected) return clearInterval(tick);
        const sec = Math.round((Date.now() - t0) / 1000);
        timer.textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
      }, 1000);
      let r = null, err = null;
      try {
        r = await this._hass.callWS({ type: "casora/ki/tile_type", name: a.base, template: working(a), wish,
          label: String(a.label || "").trim(), parents: parentsOf(a) });
        const bad = brokenJs(r.template);
        if (bad) throw new Error(tr("The AI returned broken code") + " (" + bad + ").");
      } catch (e) { err = (e && e.message) || String(e); }
      clearInterval(tick);
      if (!s.box.isConnected) return;
      if (err) {
        a.error = tr("AI didn't work: ") + err;
        return a.current ? this._kaPreview(a) : this._kaName(a);
      }
      a.error = null;
      a.current = r.template;
      a.wishes.push(wish);
      a.notes = (r.changes || []).map(String).filter(Boolean);
      if (!r.ops) a.notes = a.notes.length ? a.notes : [tr("The AI found nothing to change.")];
      return this._kaPreview(a);
    };

    // Schritt 3: Vorher und nachher, als echte Kachel.
    P._kaPreview = async function (a) {
      const s = this._flowScreen({ icon: "palette", step: [a.own ? 2 : 3, a.own ? 2 : 3], title: "Before and After",
        back: () => this._kaName(a) });
      const sample = this._kaSample(a);
      if (s.lede) s.lede.remove();
      const lede = el("p", "flede", null);
      s.box.insertBefore(lede, s.body);
      lede.textContent = sample.name ? tr("Shown with “{1}” from your dashboard.").replace("{1}", sample.name) : "";
      lede.setAttribute("data-no-i18n", "");
      const pair = el("div", "ka-pair", s.body);
      const own = buildOwn(a.base, a.T[a.base] || {}, a.current || working(a), { label: a.label, wishes: a.wishes });
      const cols = [["Casora", a.own ? a.base : a.base, false], [String(a.label || "").trim(), "__ka_preview", true]];
      const ok = this._casoraCardsReady ? await this._casoraCardsReady() : false;
      if (!s.box.isConnected) return;
      const photo = "/casora_assets/rooms/livingroom-demo" + ((this._hass.themes && this._hass.themes.darkMode === false) ? "" : "-night") + ".jpg";
      if (ok && this._casoraCardsShim) this._casoraCardsShim({ ...a.T, __ka_preview: own });
      cols.forEach(([label, tplName, mine]) => {
        const col = el("div", "ka-col", pair);
        col.dataset.ka = mine ? "after" : "before";
        const stage = el("div", "ka-stage", col);
        stage.style.backgroundImage = "url('" + photo + "')";
        if (ok) {
          const cfg = clone(sample);
          cfg.template = tplName;
          const card = document.createElement("button-card");
          try { card.setConfig(cfg); card.hass = this._hass; } catch (e) { stage.textContent = String(e.message || e); }
          const wrap = el("div", "ka-tile", stage);
          wrap.appendChild(card);
        } else {
          stage.textContent = tr("The tiles can't be shown here – the button-card isn't installed.");
        }
        const cap = el("span", "ka-cap" + (mine ? " new" : ""), col, label);
        if (mine) cap.setAttribute("data-no-i18n", "");
      });
      if (a.error || a.notes.length) {
        const n = el("div", "ka-notes" + (a.error ? " err" : ""), s.body);
        n.setAttribute("data-no-i18n", "");
        (a.error ? [a.error] : a.notes).forEach((x) => el("div", "", n, x));
      }
      const meta = metaOf(own);
      if (meta && meta.copy) el("div", "ka-hint", s.body, tr("This change rebuilds a list, so the tile type is a full copy. Casora's updates then only reach the parts it inherits."));
      if (a.ai) {
        const g = this._flowGroup(s.body, { header: "Refine" });
        const row = el("div", "frow field ka-refine", g);
        const inp = el("input", "fin", row);
        inp.placeholder = tr("e.g. The name a little bigger");
        inp.dataset.ka = "refine";
        inp.setAttribute("data-no-i18n", "");
        const send = el("button", "ka-send", row, tr("Send"));
        send.type = "button";
        send.disabled = true;
        inp.addEventListener("input", () => { send.disabled = !inp.value.trim(); });
        const go = () => { if (inp.value.trim()) this._kaRun(a, inp.value, false); };
        send.onclick = go;
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      }
      if (a.tile && !a.own) {
        const g = this._flowGroup(s.body, {});
        const r = this._flowRow(g, { title: tr("Use it for “{1}”").replace("{1}", a.tile.name || a.baseType.label), check: a.switchTile,
          onTap: () => { a.switchTile = !a.switchTile; r.row.setAttribute("aria-checked", a.switchTile ? "true" : "false"); } });
        r.row.dataset.ka = "switch";
        r.row.querySelector("b").setAttribute("data-no-i18n", "");
      }
      const create = this._flowButton(s.acts, a.own ? "Save" : "Create Tile Type", () => this._kaCreate(a, a.current));
      create.dataset.ka = "create";
      const drop = this._flowButton(s.acts, "Discard", () => { a.current = null; a.notes = []; a.wishes = a.own ? (a.own.meta.wishes || []).slice() : []; this._kaName(a); }, true);
      drop.dataset.ka = "discard";
    };

    // Eine Kachel zum Zeigen: die gewählte, sonst eine des Dashboards mit dieser Grundlage,
    // sonst irgendein passendes Gerät.
    P._kaSample = function (a) {
      if (a.tile) return clone(a.tile);
      const hit = this._kaRooms().map((r) => (r.tiles || []).find((t) => t && t.template === a.base && t.entity)).find(Boolean);
      if (hit) return clone(hit);
      const doms = (a.baseType && a.baseType.domains) || [];
      const ent = Object.keys((this._hass && this._hass.states) || {}).find((e) => doms.includes(e.split(".")[0]));
      const st = ent && this._hass.states[ent];
      return { type: "custom:button-card", entity: ent || "", name: (st && st.attributes.friendly_name) || typeLabel(a.baseType || {}) };
    };

    // Anlegen (oder beim Verwalten: speichern).
    P._kaCreate = async function (a, modified) {
      const label = String(a.label || "").trim();
      if (!label) return;
      const base = a.T[a.base];
      if (!base) return this._flowError(tr("Casora's tile is missing in this dashboard."));
      const tpl = buildOwn(a.base, base, modified || (a.own ? effectiveOf(base, a.own.tpl) : clone(base)),
        { label, wishes: a.wishes });
      const name = a.own ? a.own.name : ownName(label, { ...((this._state && this._state.templates) || {}), ...a.T });
      try {
        await this._kaWrite({ [name]: tpl });
      } catch (e) {
        return this._flowError(tr("Could not save: ") + ((e && e.message) || e));
      }
      let msg = (a.own ? tr("“{1}” saved.") : tr("“{1}” created.")).replace("{1}", label);
      if (a.tile && !a.own && a.switchTile) {
        this._kaSwitchTile(a.tile, name);
        this._markDirty();
        msg += " " + tr("Save to use it on the dashboard.");
      }
      this._exitFlow(true);
      this._renderForm();
      this._status(msg, "ok");
    };

    // ── Verwalten ──────────────────────────────────────────────────────────────
    P._kaManage = function () {
      css(this.shadowRoot);
      const own = this._kaOwn();
      const s = this._flowScreen({ icon: "palette", title: "Own Tile Types",
        lede: "They build on Casora's tiles and keep getting their updates." });
      if (!own.length) { el("div", "ka-hint", s.body, tr("No own tile types yet.")); }
      const list = own.length ? this._flowGroup(s.body, {}) : null;
      const T = I().TILE_TYPES || [];
      own.forEach((o) => {
        const bt = (I().findType && I().findType(T, o.meta.base)) || { label: o.meta.base, id: o.meta.base };
        const n = tilesUsing(this._kaRooms(), o.name).length;
        const r = this._flowRow(list, { title: o.meta.label, raw: true,
          sub: tr("from {1}").replace("{1}", typeLabel(bt)) + " · " + (n === 1 ? tr("1 tile") : tr("{1} tiles").replace("{1}", n)),
          mask: iconOf(bt), tint: tintOf(bt), chevron: true, onTap: () => this._kaDetail(o) });
        r.row.dataset.own = o.name;
      });
      const add = this._flowGroup(s.body, {});
      this._flowRow(add, { title: tr("New tile type…"), onTap: () => this._kaStart({}) });
    };

    P._kaDetail = function (o) {
      const T = I().TILE_TYPES || [];
      const bt = (I().findType && I().findType(T, o.meta.base)) || { label: o.meta.base, id: o.meta.base };
      const uses = tilesUsing(this._kaRooms(), o.name);
      const s = this._flowScreen({ icon: "palette", title: o.meta.label, back: () => this._kaManage(),
        lede: tr("Builds on Casora's {1} tile.").replace("{1}", typeLabel(bt)) });
      s.box.querySelector(".ftitle").setAttribute("data-no-i18n", "");
      const list = this._flowGroup(s.body, {});
      this._flowRow(list, { title: tr("Rename…"), onTap: () => this._kaRename(o) }).row.dataset.ka = "rename";
      this._flowRow(list, { title: tr("Adjust with AI…"), onTap: () => this._kaStart({ own: o }) }).row.dataset.ka = "readjust";
      const del = this._flowRow(list, { title: tr("Delete…"), onTap: () => this._kaDelete(o) });
      del.row.dataset.ka = "delete";
      del.row.querySelector("b").style.color = "var(--casora-studio-bad, #ff6961)";
      if ((o.meta.wishes || []).length) {
        const w = this._flowGroup(s.body, { header: "Changes asked for" });
        o.meta.wishes.forEach((x) => { const r = this._flowRow(w, { title: x, raw: true }); r.row.classList.add("dim"); });
      }
      if (uses.length) {
        el("div", "ka-hint", s.body, tr("Used by: ") + [...new Set(uses.map((u) => u.tile.name || u.tile.entity))].slice(0, 6).join(", "))
          .setAttribute("data-no-i18n", "");
      }
    };

    P._kaRename = async function (o) {
      const got = await this._ask({ title: tr("Rename Tile Type"), value: o.meta.label, confirmLabel: tr("Rename") });
      const label = String(typeof got === "string" ? got : (got && got.value) || "").trim();
      if (!label || label === o.meta.label) return;
      const tpl = clone(o.tpl);
      tpl.variables.casora_tile = { ...o.meta, label };
      try { await this._kaWrite({ [o.name]: tpl }); } catch (e) { return this._status(tr("Could not save: ") + e.message, "err"); }
      this._renderForm();
      this._kaDetail({ name: o.name, tpl, meta: metaOf(tpl) });
    };

    P._kaDelete = async function (o) {
      const T = I().TILE_TYPES || [];
      const bt = (I().findType && I().findType(T, o.meta.base)) || { label: o.meta.base };
      const uses = tilesUsing(this._kaRooms(), o.name);
      const ok = await this._ask({ title: tr("Delete “{1}”?").replace("{1}", o.meta.label),
        message: uses.length
          ? (uses.length === 1 ? tr("1 tile uses it. It goes back to Casora's {2} tile.") : tr("{1} tiles use it. They go back to Casora's {2} tile."))
            .replace("{1}", uses.length).replace("{2}", typeLabel(bt))
          : tr("No tile uses it."),
        confirmLabel: tr("Delete"), destructive: true });
      if (!ok) return;
      uses.forEach((u) => { u.tile.template = o.meta.base; });
      try { await this._kaWrite({ [o.name]: null }); } catch (e) { return this._status(tr("Could not save: ") + e.message, "err"); }
      if (uses.length) this._markDirty();
      this._renderForm();
      this._kaManage();
      this._status(uses.length ? tr("Deleted. Save to update the tiles.") : tr("Deleted."), "ok");
    };
  });

  window.casoraKachelart = Object.assign(window.casoraKachelart || {}, { lib });
})();
