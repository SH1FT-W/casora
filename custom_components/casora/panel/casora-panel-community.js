// Casora Studio · Community (1.5): "you ask, we build".
// Users submit card requests (a prefilled GitHub issue, no server of our own). The Casora team
// builds cards from them; they ship with the release (tile types with `community` in
// casora-panel-types.js) and only show in "Add tile" once added here, which keeps the tile
// list short. No code is loaded from outside.
//
// Stored per installation in the Casora settings: settings.community = {added: [type ids]}.
// window.casoraCommunityOn (Set) is read by the onlyIf of the community tile types.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));

  const REPO = "SH1FT-W/casora";
  const LABEL_WISH = "kartenwunsch";
  if (!(W.casoraCommunityOn instanceof Set)) W.casoraCommunityOn = new Set();

  // ── GitHub ──────────────────────────────────────────────────────────────
  function issueUrl(title, body, labels) {
    const q = "title=" + encodeURIComponent(title) + "&labels=" + encodeURIComponent(labels.join(","))
      + "&body=" + encodeURIComponent(body);
    return "https://github.com/" + REPO + "/issues/new?" + q;
  }
  const version = () => (W.__casoraVersion || (W.casoraVersion && W.casoraVersion()) || "");
  const haVersion = (hass) => (hass && hass.config && hass.config.version) || "";

  // Entity for the request: value, unit, device class, key, attribute names, nothing personal.
  const PRIVATE_ATTR = /^(friendly_name|latitude|longitude|gps_accuracy|entity_picture|icon|address|street|location|ssid|bssid|ip|mac|host|serial|vin|user|email|phone|name)$/i;
  function describe(hass, eid) {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    const st = S[eid] || {}, a = st.attributes || {}, e = R[eid] || {};
    // No names, rooms or serial numbers: of the id only the kind and the integration's key remain.
    const dom = eid.split(".")[0];
    const short = dom + ".<geraet>" + (e.translation_key ? "_" + e.translation_key : "");
    // State only as a number or a short key value (on, idle, charging); never coordinates, IPs or text.
    let val = st.state == null ? "" : String(st.state);
    if (!(/^-?\d+(\.\d+)?$/.test(val) || /^[a-z][a-z_]{0,29}$/.test(val))) val = "(Text)";
    return {
      line: [short, val, a.unit_of_measurement ? "unit: " + a.unit_of_measurement : "", a.device_class ? "class: " + a.device_class : "",
        e.translation_key ? "tk: " + e.translation_key : ""].filter(Boolean).join("   "),
      attrs: Object.keys(a).filter((k) => !PRIVATE_ATTR.test(k)).slice(0, 25),
      platform: e.platform || "",
    };
  }

  // id: marker in an HTML comment, by which the Studio finds the state of the user's own request.
  function wishBody(f, hass, id) {
    const d = f.entities.map((x) => describe(hass, x));
    const plat = [...new Set(d.map((x) => x.platform).filter(Boolean))];
    return {
      plat,
      body: "### Gerät oder Dienst\n" + f.device + "\n\n### Was soll die Kachel zeigen?\n" + f.tile
        + (f.popup ? "\n\n### Und im Popup?\n" + f.popup : "")
        + "\n\n### Integration\n" + (plat.join(", ") || "–")
        + "\n\n### Entitäten (anonymisiert)\n```\n" + d.map((x) => x.line).join("\n") + "\n```"
        + "\n\n### Attribute\n" + d.map((x) => "- " + x.line.split("   ")[0] + ": " + (x.attrs.join(", ") || "–")).join("\n")
        + (f.image ? "\n\n### Bild\n" + f.image : "")
        + "\n\n---\nEingereicht aus Casora " + version() + " · Home Assistant " + haVersion(hass)
        + (id ? "\n<!-- casora-id:" + id + " -->" : ""),
    };
  }

  // State of an own request: search for its marker (without sign-in, few requests). Without a
  // label filter: the action only sets the label after the request is submitted.
  async function status(id) {
    const q = encodeURIComponent("repo:" + REPO + " is:issue casora-id:" + id);
    const r = await fetch("https://api.github.com/search/issues?q=" + q, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub " + r.status);
    const j = await r.json();
    const it = (j.items || [])[0];
    if (!it) return { state: "sent" };
    const labels = (it.labels || []).map((l) => l.name);
    let state = "open";
    if (labels.includes("gebaut")) state = "built";
    else if (labels.includes("abgelehnt")) state = "declined";
    else if (labels.includes("rueckfrage")) state = "question";
    else if (labels.includes("in-arbeit")) state = "progress";
    else if (it.state === "closed") state = "closed";
    let note = "";
    if ((state === "question" || state === "declined") && it.comments) {
      try {
        const c = await (await fetch(it.comments_url + "?per_page=100")).json();
        // Only show replies from the Casora team, otherwise anyone could place text (links) here.
        const last = (c || []).filter((x) => x && /^(OWNER|MEMBER|COLLABORATOR)$/.test(x.author_association)).pop();
        note = last && last.body ? String(last.body).slice(0, 200) : "";
      } catch (e) { /* no comment */ }
    }
    return { state, note, url: it.html_url, number: it.number };
  }

  // ── Community cards ────────────────────────────────────────────────────
  // Tile types with `community: {desc, needs?}`: shipped, not in the tile list by default.
  // Retired cards (community.retired) only for those who added them (so they can remove them).
  const cards = (types, on) => (types || []).filter((t) => t && t.community && !t.hidden
    && (!t.community.retired || !!(on && on.has(t.id))));
  const tplOf = (t) => [].concat((t && t.template) || []).filter(Boolean);
  // Templates of this tile type: its own and custom tile types built on it (variables.casora_tile.base,
  // casora-panel-kachelart.js); their tiles depend on the community card just the same.
  const wantOf = (type, templates) => {
    const want = tplOf(type);
    Object.keys(templates || {}).forEach((name) => {
      const m = templates[name] && templates[name].variables && templates[name].variables.casora_tile;
      if (m && typeof m === "object" && want.includes(m.base) && !want.includes(name)) want.push(name);
    });
    return want;
  };
  // Tiles (also inside conditions and carousels) that use this tile type.
  const uses = (tile, type, want) => {
    let c = tile, n = 0;
    while (c && c.type === "conditional" && c.card && typeof c.card === "object" && n++ < 4) c = c.card;
    want = want || tplOf(type);
    return !!c && tplOf(c).some((x) => want.includes(x));
  };
  const isCarousel = (t) => !!t && /swipe|carousel/.test(String(t.type || "")) && Array.isArray(t.cards);
  const carouselIn = (t) => (isCarousel(t) ? t : t && t.type === "conditional" && isCarousel(t.card) ? t.card : null);
  // Tiles of this type in the rooms (or phone sections) → [tile].
  function usedIn(rooms, type, templates) {
    const want = wantOf(type, templates), out = [];
    (rooms || []).forEach((r) => (r.tiles || []).forEach((t) => {
      const car = carouselIn(t);
      if (car) car.cards.forEach((x) => { if (uses(x, type, want)) out.push(x); });
      else if (uses(t, type, want)) out.push(t);
    }));
    return out;
  }
  // Twin by type + entity (the phone tile is a copy of the room tile, not a reference).
  const innerOf = (t) => { let c = t, n = 0; while (c && c.type === "conditional" && c.card && n++ < 4) c = c.card; return c || t; };
  const twinKey = (t) => { const c = innerOf(t); return tplOf(c).join(",") + "|" + String((c && c.entity) || ""); };
  // Number of tiles: rooms plus phone tiles without a counterpart in the room (phone: phone sections,
  // templates: the dashboard's templates for custom tile types).
  function usage(rooms, type, phone, templates) {
    const desk = usedIn(rooms, type, templates);
    if (!phone) return desk.length;
    const left = desk.map(twinKey);
    let extra = 0;
    usedIn(phone, type, templates).forEach((t) => {
      const i = left.indexOf(twinKey(t));
      if (i > -1) left.splice(i, 1); else extra++;
    });
    return desk.length + extra;
  }
  // Removes the tiles of this type; a carousel left empty by that goes too. → count.
  function dropTiles(rooms, type, templates) {
    const want = wantOf(type, templates);
    let n = 0;
    (rooms || []).forEach((r) => {
      if (!Array.isArray(r.tiles)) return;
      r.tiles = r.tiles.filter((t) => {
        const car = carouselIn(t);
        if (car) {
          const keep = car.cards.filter((x) => !uses(x, type, want));
          n += car.cards.length - keep.length;
          car.cards = keep;
          return keep.length > 0;
        }
        if (uses(t, type, want)) { n++; return false; }
        return true;
      });
    });
    return n;
  }

  // Read/write the stored choice (casora/settings: set replaces everything, so read fresh and merge).
  async function load(hass) {
    try {
      const r = await hass.callWS({ type: "casora/settings/get" });
      const ids = (((r && r.settings) || {}).community || {}).added;
      W.casoraCommunityOn = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
    } catch (e) { /* no settings: nothing added */ }
    return W.casoraCommunityOn;
  }
  async function save(hass, ids) {
    const r = await hass.callWS({ type: "casora/settings/get" });
    const cur = Object.assign({}, (r && r.settings) || {});
    const list = [...new Set(ids)].sort();
    if (list.length) cur.community = { added: list }; else delete cur.community;
    await hass.callWS({ type: "casora/settings/set", settings: cur });
    W.casoraCommunityOn = new Set(list);
  }

  // Preview images of a community card: tile (required) and popup (optional, "<id>-popup.webp").
  // Cards with `darkShots` have their own images in dark mode (hass.themes.darkMode), "<id>-dark.webp" /
  // "<id>-popup-dark.webp"; a missing one falls back to the light image (light).
  const isDark = (hass) => !(hass && hass.themes && hass.themes.darkMode === false);
  const shots = (t, dark) => {
    const base = "/casora_assets/community/" + t.id;
    const light = { tile: t.community.preview || (base + ".webp"), popup: t.community.previewPopup || (base + "-popup.webp") };
    if (!dark || !t.community.darkShots || t.community.preview) return { ...light, light };
    return { tile: base + "-dark.webp", popup: base + "-popup-dark.webp", light };
  };
  W.casoraCommunity = { issueUrl, describe, wishBody, status, cards, usage, dropTiles, load, save, REPO, LABEL_WISH, shots, isDark };
  if (typeof module !== "undefined" && module.exports) module.exports = W.casoraCommunity;
  if (typeof customElements === "undefined") return;

  // ── Studio ──────────────────────────────────────────────────────────────
  // Own requests (per user): [{id, title, at}].
  const KEY = "casora_community_wishes";
  const loadMine = async (hass) => {
    try { const r = await hass.connection.sendMessagePromise({ type: "frontend/get_user_data", key: KEY }); return (r && Array.isArray(r.value)) ? r.value : []; }
    catch (e) { return []; }
  };
  const saveMine = (hass, list) => hass.connection.sendMessagePromise({ type: "frontend/set_user_data", key: KEY, value: list.slice(-50) }).catch(() => {});
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const field = (box, label, opts) => {
    const lab = el("div", "comlbl", tr(label));
    const inp = el(opts && opts.area ? "textarea" : "input", "fin lead comin");
    if (opts && opts.area) inp.rows = 3;
    if (opts && opts.placeholder) inp.placeholder = tr(opts.placeholder);
    inp.spellcheck = false;
    box.append(lab, inp);
    return inp;
  };
  const CSS = ".comlbl{font-size:12px;font-weight:700;opacity:.7;margin:12px 2px 6px;text-transform:uppercase;letter-spacing:.04em}"
    + ".comin{width:100%;box-sizing:border-box;font:inherit!important}.comchips{display:flex;flex-wrap:wrap;gap:6px}"
    + ".comchip{border:0;border-radius:999px;padding:5px 10px;font:inherit;font-size:13px;background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit;cursor:pointer}"
    + ".comchip.on{background:var(--casora-studio-accent, #0a84ff);color:#fff}"
    + ".comrow{display:flex;align-items:center;gap:10px;padding:10px 4px;border-top:1px solid rgba(127,127,127,.15)}.comrow:first-child{border-top:0}"
    + ".comrow .comtx{flex:1;min-width:0}.comrow b{display:block;font-size:14px}.comrow span{font-size:13px;opacity:.7}"
    + ".comrow small{display:block;font-size:12px;opacity:.6;margin-top:2px}"
    // Preview = exactly the tile (240 × 200, radius 32 px): same aspect ratio, proportional corners.
    + ".comshot{width:120px;height:100px;border-radius:13.33%/16%;flex:none;object-fit:cover;background:rgba(127,127,127,.15);border:0;padding:0;display:block}"
    + "button.comzoom{border:0;padding:0;background:none;border-radius:13.33%/16%;flex:none;cursor:zoom-in;line-height:0}"
    + ".comrow.comcard{align-items:flex-start}.comrow.comcard > .comchip{align-self:center}"
    // Phone: smaller image, text beside it at full width, "Add" as a wide button below.
    + "@media (max-width: 600px){.comrow.comcard{flex-wrap:wrap}.comrow.comcard .comshot,.comrow.comcard button.comzoom{width:96px;height:80px}"
    + ".comrow.comcard .comtx{flex:1 1 0}.comrow.comcard > .comchip{flex:1 0 100%;align-self:stretch;padding:9px 12px;text-align:center;font-weight:600}}"
    + ".comlink{display:inline-flex;align-items:center;gap:5px;margin-top:6px;border:0;border-radius:999px;padding:4px 10px 4px 8px;font:inherit;font-size:13px;font-weight:600;"
    + "background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit;cursor:pointer}.comlink ha-icon{--mdc-icon-size:16px;display:flex}"
    // Large preview over the Community page: tile / popup.
    + ".comlb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;box-sizing:border-box;"
    + "background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}"
    + ".comlb img{max-width:min(92vw,880px);max-height:72vh;border-radius:18px;box-shadow:var(--casora-popup-plate-shadow, 0 18px 50px -20px rgba(0,0,0,.6));background:rgba(127,127,127,.15)}"
    + ".comlb .comseg{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.18)}"
    + ".comlb .comseg button{border:0;border-radius:999px;padding:7px 16px;font:inherit;font-size:14px;font-weight:600;background:none;color:#fff;cursor:pointer}"
    + ".comlb .comseg button.on{background:#fff;color:#000}"
    // Image + bar above it (switch centered, × flush right with the image edge) as one block.
    + ".comlb .comfig{display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:100%}"
    + ".comlb .combar{position:relative;display:flex;justify-content:center;align-items:center;min-height:44px}"
    + ".comlb .comfig img{max-width:100%;align-self:center}"
    + ".comlb .comx{position:absolute;top:2px;right:0;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0;margin:0;box-sizing:border-box}"
    + ".comlb .comx ha-icon{--mdc-icon-size:22px;width:22px;height:22px;display:flex;margin:0}"
    + ".compill{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}"
    + ".comrm{flex:none;width:32px;height:32px;border-radius:50%;border:0;padding:0;margin:0;display:grid;place-items:center;cursor:pointer;"
    + "background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit}.comrm ha-icon{--mdc-icon-size:18px;width:18px;height:18px;display:flex;margin:0}"
    + ".comnote{font-size:13px;opacity:.75;margin:8px 2px 0;line-height:1.4}"
    + ".comflash{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:600;color:var(--casora-color-green, #30D158)}"
    + ".comflash.err{color:var(--casora-color-red, #FF453A)}.comflash ha-icon{--mdc-icon-size:18px;width:18px;height:18px;display:flex;flex:none}"
    + ".comflash span{color:var(--primary-text-color);opacity:.85;font-size:13px}";
  // Confirmation inside the page: green check or red exclamation mark, and text.
  const flash = (note) => {
    const f = el("div", "comflash" + (note.tone === "err" ? " err" : ""));
    f.setAttribute("role", "status");
    f.innerHTML = '<ha-icon icon="' + (note.tone === "err" ? "mdi:alert-circle" : "mdi:check-circle") + '"></ha-icon>';
    f.appendChild(el("span", "", note.text));
    return f;
  };
  const css = (box) => { if (!box.querySelector("style.comcss")) { const s = el("style", "comcss"); s.textContent = CSS; box.appendChild(s); } };
  // New tab through a real link: Safari and the HA app allow only that, and only right in the click
  // (after an await the click no longer counts as a user action; "Open GitHub" then did nothing, 14.10.).
  const open = (url) => {
    try {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { location.href = url; }
  };

  // Casora version for the issue (casora/version, frontend_version.py).
  const loadVersion = (hass) => (W.__casoraVersion ? Promise.resolve() : Promise.resolve(hass && hass.callWS && hass.callWS({ type: "casora/version" }))
    .then((r) => { if (r && r.version) W.__casoraVersion = r.version; }).catch(() => {}));
  // Readable integration name ("Roborock" rather than "roborock"), from HA's own translations.
  const integrationName = (hass, d) => {
    try { const t = hass && hass.localize && hass.localize("component." + d + ".title"); if (t) return t; } catch (e) { /* fallback */ }
    return d;
  };
  const hasIntegration = (hass, d) => !d || !!(hass && hass.config && (hass.config.components || []).includes(d));
  // Large preview over the Community page; Esc or a tap beside it closes only the preview.
  const lightbox = (box, t, which, hasPopup, dark) => {
    const pane = box.closest(".askpane") || box;
    const old = pane.querySelector(".comlb");
    if (old) old.remove();
    const S = shots(t, dark);
    const lb = el("div", "comlb");
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-label", tr(t.label));
    const img = el("img");
    img.alt = tr(t.label);
    const seg = el("div", "comseg");
    // The popup image is cropped exactly to the frame: corners round like the popup itself.
    img.onerror = () => { const k = img.dataset.k; if (k && img.src.indexOf(S.light[k]) < 0) img.src = S.light[k]; };
    const show = (k) => { img.dataset.k = k; img.src = S[k]; img.style.borderRadius = k === "popup" ? "36px" : "13.33%/16%"; img.style.width = k === "popup" ? "" : "min(360px, 80vw)"; seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); };
    [["tile", "Tile"], ["popup", "Popup"]].forEach(([k, label]) => {
      if (k === "popup" && !hasPopup) return;
      const b = el("button", "", tr(label));
      b.type = "button"; b.dataset.k = k;
      b.onclick = (ev) => { ev.stopPropagation(); show(k); };
      seg.appendChild(b);
    });
    const x = el("button", "comx");
    x.type = "button"; x.setAttribute("aria-label", tr("Close"));
    x.innerHTML = '<ha-icon icon="mdi:close"></ha-icon>';
    const close = () => { lb.remove(); W.removeEventListener("keydown", esc, true); };
    const esc = (ev) => { if (ev.key === "Escape") { ev.stopImmediatePropagation(); ev.preventDefault(); close(); } };
    W.addEventListener("keydown", esc, true);
    x.onclick = (ev) => { ev.stopPropagation(); close(); };
    lb.onclick = (ev) => { if (ev.target === lb) close(); };
    img.onclick = (ev) => ev.stopPropagation();
    const fig = el("div", "comfig");
    const bar = el("div", "combar");
    if (seg.children.length > 1) bar.appendChild(seg);
    bar.appendChild(x);
    fig.append(bar, img);
    fig.onclick = (ev) => ev.stopPropagation();
    lb.appendChild(fig);
    pane.appendChild(lb);
    show(which);
  };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;

    // Fetch the stored choice when the Studio loads; "Add tile" asks synchronously (onlyIf).
    const load0 = P._load;
    if (typeof load0 === "function") {
      P._load = function () {
        if (this._hass && !this._comLoaded) this._comLoaded = load(this._hass);
        return load0.apply(this, arguments);
      };
    }

    // Phone (and a tight tablet bar) hide the Community button next to the search: the "…" menu offers it there.
    const menu0 = P._menuAt;
    if (typeof menu0 === "function") {
      P._menuAt = function (anchor, items, onPick, mopts) {
        const h = Array.isArray(items) ? items.findIndex((x) => x && x.id === "hints") : -1;
        if (h >= 0 && typeof this._comCatalog === "function" && this._state && !this._flowMode
          && (this.classList.contains("phone") || this.classList.contains("btight")) && !items.some((x) => x && x.id === "community")) {
          items = items.slice();
          items.splice(h, 0, { id: "community", label: "Community cards…", group: items[h].group });
          const pick = onPick;
          onPick = (id) => (id === "community" ? this._comCatalog() : pick(id));
        }
        return menu0.call(this, anchor, items, onPick, mopts);
      };
    }

    // Card request: device, example entities (required), tile (required), popup, image.
    P._comWish = async function () {
      const hass = this._hass;
      const ents = Object.keys((hass && hass.states) || {}).sort();
      const f = { device: "", entities: [], tile: "", popup: "", image: "" };
      let get = null;
      const res = await this._ask({
        title: tr("Request a card"),
        message: tr("Describe the card you are missing. Casora adds the details of the devices, without names or places."),
        wide: true,
        confirmLabel: tr("Submit on GitHub"),
        extend: ({ box, acts, ok }) => {
          css(box);
          const form = el("div");
          const dev = field(form, "Device or service *", { placeholder: "e.g. Volvo XC40" });
          form.appendChild(el("div", "comlbl", tr("Example entities *")));
          const chips = el("div", "comchips");
          form.appendChild(chips);
          const paint = () => {
            chips.innerHTML = "";
            f.entities.forEach((id, i) => {
              const c = el("button", "comchip", id + "  ×");
              c.type = "button"; c.setAttribute("data-no-i18n", "");
              c.onclick = () => { f.entities.splice(i, 1); paint(); };
              chips.appendChild(c);
            });
          };
          const combo = this._combo("", ents, tr("Add entity"), (v) => {
            if (v && !f.entities.includes(v) && f.entities.length < 8) f.entities.push(v);
            paint();
            if (combo.input) combo.input.value = "";
          });
          form.appendChild(combo.wrap);
          const tile = field(form, "What should the tile show? *", { area: true });
          const pop = field(form, "And in the popup? (optional)", { area: true, placeholder: "e.g. history, switches, map …" });
          const img = field(form, "Image (optional)", { placeholder: "Link to a screenshot" });
          box.insertBefore(form, acts);
          const warn = el("div", "fieldwarn");
          [dev, tile, pop, img].forEach((x) => x.addEventListener("input", () => { if (warn.parentNode) warn.remove(); }));
          get = () => { f.device = dev.value.trim(); f.tile = tile.value.trim(); f.popup = pop.value.trim(); f.image = img.value.trim(); };
          ok.addEventListener("click", (ev) => {
            get();
            const why = !f.device ? "Name the device or service." : !f.entities.length ? "Pick at least one example entity."
              : !f.tile ? "Say what the tile should show." : (f.image && !/^https:\/\//.test(f.image)) ? "The image must be an https link." : "";
            if (why) { ev.stopImmediatePropagation(); warn.textContent = tr(why); if (!warn.parentNode) box.insertBefore(warn, acts); }
          }, true);
        },
      });
      if (!res) return;
      const C = W.casoraCommunity;
      await loadVersion(hass);
      const id = Math.random().toString(36).slice(2, 10);
      const w = C.wishBody(f, hass, id);
      const url = C.issueUrl("Kartenwunsch: " + f.device, w.body, [LABEL_WISH].concat(w.plat.length ? ["integration: " + w.plat[0]] : []));
      // Preview: exactly this text goes to GitHub (public).
      const go = await this._ask({ title: tr("This is what will be public"), message: tr("Check the text. Nothing else is sent."),
        value: w.body, multiline: true, rows: 14, wide: true, confirmLabel: tr("Open GitHub"),
        extend: ({ input, ok }) => {
          // Open GitHub right in the click, not after the dialog has closed.
          if (ok) ok.addEventListener("click", () => open(url), true);
          if (!input) return;
          input.readOnly = true;
          // Nothing selected, read from the top (the dialog otherwise selects all the text).
          setTimeout(() => { try { input.setSelectionRange(0, 0); input.scrollTop = 0; } catch (e) { /* ignore */ } }, 60);
        } });
      if (!go) return;
      const mine = await loadMine(hass);
      mine.push({ id, title: f.device, at: Date.now() });
      saveMine(hass, mine);
      if (this._status) this._status(tr("GitHub is open – submit the request there."), "ok");
    };

    // Community page: community cards (add/remove) and the user's own card requests with their state.
    // note (after add/remove): {text, tone, id}, shown in the page itself (at the card or on top);
    // a Studio status message would sit under the blur of the reopened page.
    P._comCatalog = async function (note) {
      const C = W.casoraCommunity;
      const I = W.__casoraPanelInternals || {};
      const hass = this._hass;
      if (this._comLoaded) await this._comLoaded;
      else if (hass) await (this._comLoaded = load(hass));
      const list = C.cards(I.TILE_TYPES, W.casoraCommunityOn);
      let then = null;
      const res = await this._ask({
        title: tr("Community"),
        message: tr("Cards that Casora users asked for. Add them to your tile list – or ask for one that is missing."),
        wide: true,
        confirmLabel: tr("Close"),
        extend: ({ box, acts, ok, cancel }) => {
          css(box);
          cancel.style.display = "none";
          const ways = el("div", "comchips");
          ways.style.margin = "4px 0 6px";
          const wish = el("button", "comchip", tr("Request a card…"));
          wish.type = "button";
          wish.onclick = () => { then = { wish: true }; ok.click(); };
          ways.appendChild(wish);
          box.insertBefore(ways, acts);
          // Head (title, text, request, list label) and "Close" stay; only the list scrolls (.askbody).
          // Note without a card (request removed): above the list.
          if (note && !note.id) box.insertBefore(flash(note), acts);
          box.insertBefore(el("div", "comlbl", tr("Community cards")), acts);
          const host = el("div", "askbody");
          box.insertBefore(host, acts);
          if (!list.length) host.appendChild(el("div", "comnote", tr("No community cards yet. Ask for one – the first ones come with the next update.")));
          list.forEach((t) => {
            const r = el("div", "comrow comcard");
            const dark = isDark(hass);
            const S = shots(t, dark);
            const zoom = el("button", "comzoom");
            zoom.type = "button";
            zoom.setAttribute("aria-label", fill(tr("Preview of “{x}”"), { x: tr(t.label) }));
            const shot = el("img", "comshot");
            shot.alt = "";
            shot.loading = "lazy";
            shot.src = S.tile;
            // No preview image: an empty area instead of a broken-image icon (dark missing → try the light one first).
            shot.onerror = () => { if (S.tile !== S.light.tile && shot.src.indexOf(S.light.tile) < 0) shot.src = S.light.tile; else shot.replaceWith(el("div", "comshot")); };
            zoom.appendChild(shot);
            const tx = el("div", "comtx");
            tx.append(el("b", "", tr(t.label)), el("span", "", tr(t.community.retired ? "This card is being retired. Your tiles keep working for now." : (t.community.desc || ""))));
            const need = t.community.needs;
            if (need) {
              const ok2 = hasIntegration(hass, need);
              // Readable note from the card (needsText/needsMissing), otherwise the integration's name.
              const txt = ok2 ? (t.community.needsText ? tr(t.community.needsText) : fill(tr("Needs {x}"), { x: integrationName(hass, need) }))
                : (t.community.needsMissing ? tr(t.community.needsMissing) : fill(tr("Needs {x} – not installed"), { x: integrationName(hass, need) }));
              tx.appendChild(el("small", "", txt));
            }
            // "View popup" only when there is a popup image.
            let hasPopup = false;
            const pop = el("button", "comlink");
            pop.type = "button";
            pop.innerHTML = '<ha-icon icon="mdi:open-in-app"></ha-icon>';
            pop.appendChild(el("span", "", tr("View popup")));
            pop.style.display = "none";
            pop.onclick = () => lightbox(box, t, "popup", true, dark);
            const probe = new Image();
            probe.onload = () => { hasPopup = true; pop.style.display = ""; };
            probe.onerror = () => { if (probe.src.indexOf(S.light.popup) < 0 && S.popup !== S.light.popup) probe.src = S.light.popup; };
            probe.src = S.popup;
            tx.appendChild(pop);
            zoom.onclick = () => lightbox(box, t, "tile", hasPopup, dark);
            const on = W.casoraCommunityOn.has(t.id);
            const b = el("button", "comchip" + (on ? "" : " on"), tr(on ? "Remove" : "Add"));
            b.type = "button";
            b.setAttribute("data-com", t.id);
            b.onclick = () => { then = { toggle: t }; ok.click(); };
            if (note && note.id === t.id) tx.appendChild(flash(note));
            r.append(zoom, tx, b);
            host.appendChild(r);
          });
          // Own requests
          loadMine(hass).then((mine) => {
            if (!mine.length) return;
            host.appendChild(el("div", "comlbl", tr("Your requests")));
            const L = { sent: ["Sent?", "rgba(127,127,127,.2)"], closed: ["Closed", "rgba(127,127,127,.2)"], open: ["Open", "rgba(232,176,74,.22)"],
              question: ["Question", "rgba(232,176,74,.30)"], progress: ["In progress", "rgba(91,143,209,.25)"], built: ["Built", "rgba(107,178,122,.25)"], declined: ["Declined", "rgba(217,96,79,.25)"] };
            mine.slice().reverse().slice(0, 10).forEach((m, k) => {
              const r = el("div", "comrow");
              const t = el("div", "comtx");
              const sub = el("span", "", tr("Checking …"));
              t.append(el("b", "", m.title), sub);
              t.setAttribute("data-no-i18n", "");
              const pill = el("span", "compill", "…");
              // × takes the request off the list (asks first; withdrawing on GitHub = closing the issue there).
              const rm = el("button", "comrm");
              rm.type = "button";
              rm.setAttribute("aria-label", tr("Remove from the list"));
              rm.innerHTML = '<ha-icon icon="mdi:close"></ha-icon>';
              rm.onclick = (ev) => { ev.stopPropagation(); then = { unwish: m, url: r.dataset.url || "" }; ok.click(); };
              r.append(t, pill, rm);
              host.appendChild(r);
              // Few requests: without sign-in GitHub allows only a few per minute.
              setTimeout(() => C.status(m.id).then((st) => {
                const l = L[st.state] || L.open;
                pill.textContent = tr(l[0]); pill.style.background = l[1];
                const when = new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
                sub.textContent = st.note || (st.number ? "#" + st.number + " · " + when
                  : tr("Submitted? It can take a few minutes until the state shows here.") + " · " + when);
                if (st.url) { r.dataset.url = st.url; r.style.cursor = "pointer"; r.onclick = () => open(st.url); }
              }).catch(() => { sub.textContent = tr("GitHub can't be reached right now."); }), k * 1200);
            });
          });
        },
      });
      if (then && then.wish) return this._comWish();
      if (then && then.unwish) return this._comCatalog(await this._comUnwish(then.unwish, then.url));
      if (!res || !then || !then.toggle) return;
      return this._comCatalog(await this._comToggle(then.toggle));
    };

    // Take an own card request off "Your requests". If it is already on GitHub, it is withdrawn there
    // (close the issue); Casora can't do that without sign-in, so the question offers the way.
    P._comUnwish = async function (m, url) {
      const res = await this._ask({
        title: fill(tr("Remove “{x}”?"), { x: m.title }),
        message: url ? tr("It is removed from this list. To withdraw it, close the request on GitHub.")
          : tr("It is removed from this list. If you did submit it on GitHub, close it there to withdraw it."),
        confirmLabel: tr("Remove"),
        extend: ({ acts }) => {
          if (!url || !acts) return;
          const gh = el("button", "comchip", tr("Open on GitHub"));
          gh.type = "button";
          gh.style.marginRight = "auto";
          gh.onclick = () => open(url);
          acts.insertBefore(gh, acts.firstChild);
        },
      });
      if (!res) return null;
      const mine = (await loadMine(this._hass)).filter((x) => x.id !== m.id);
      await saveMine(this._hass, mine);
      return { text: fill(tr("“{x}” removed from the list."), { x: m.title }), tone: "ok" };
    };

    // Add/remove a community card in the tile list.
    P._comToggle = async function (type) {
      const C = W.casoraCommunity;
      const ids = new Set(W.casoraCommunityOn);
      const name = tr(type.label);
      if (!ids.has(type.id)) {
        ids.add(type.id);
        try { await C.save(this._hass, ids); }
        catch (e) { return { text: tr("Couldn't save. Try again."), tone: "err", id: type.id }; }
        return { text: fill(tr("“{x}” is now in Add tile."), { x: name }), tone: "ok", id: type.id };
      }
      // Is the tile used in this dashboard (rooms, phone layout, custom tile types built on it)?
      // Then ask: keep the tiles or remove them too.
      const pair = this._pair && this._pair.safe !== false ? this._pair : null;
      const desk = pair ? pair.desktop : this._state;
      const roomsOf = (x) => (x && x.compact && x.compact.rooms) || [];
      const rooms = roomsOf(desk);
      const phone = pair && pair.mobile && pair.mobile !== desk ? roomsOf(pair.mobile) : null;
      const tpls = { ...((pair && pair.templates) || {}), ...((this._state && this._state.templates) || {}) };
      const n = C.usage(rooms, type, phone, tpls);
      let drop = false;
      if (n) {
        const res = await this._ask({
          title: fill(tr("Remove “{x}”?"), { x: name }),
          message: fill(tr(n === 1 ? "1 tile in this dashboard uses this card." : "{n} tiles in this dashboard use this card."), { n }),
          picks: [
            { id: "keep", title: tr("Keep the tiles"), sub: tr("They stay in the dashboard. Only Add tile gets shorter.") },
            { id: "drop", title: tr("Remove the tiles too"), sub: tr("Save afterwards to keep the change.") },
          ],
          confirmLabel: tr("Remove"),
        });
        if (!res || res.pick == null) return null;
        drop = res.pick === "drop";
      }
      ids.delete(type.id);
      try { await C.save(this._hass, ids); }
      catch (e) { return { text: tr("Couldn't save. Try again."), tone: "err", id: type.id }; }
      // Remove on the phone too, otherwise the tile of a card no longer added stayed there.
      const dropped = drop ? C.dropTiles(rooms, type, tpls) + (phone ? C.dropTiles(phone, type, tpls) : 0) : 0;
      if (dropped) {
        this._markDirty();
        this._renderForm();
        if (this._syncPreview) this._syncPreview();
        return { text: fill(tr("“{x}” is no longer in Add tile. Its tiles are removed – save to keep it."), { x: name }), tone: "ok", id: type.id };
      }
      return { text: fill(tr("“{x}” is no longer in Add tile."), { x: name }), tone: "ok", id: type.id };
    };
  });
})();
