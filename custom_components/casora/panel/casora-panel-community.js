// Casora Studio · Community (1.5): „Sie fragen, wir bauen“.
// Nutzer reichen Kartenwünsche ein (fertig ausgefülltes GitHub-Issue, ohne eigenen Server). Das
// Casora-Team baut daraus Karten; sie kommen mit dem Release (Kachelarten mit `community` in
// casora-panel-types.js) und stehen erst in „Kachel hinzufügen“, wenn man sie hier hinzufügt –
// so bleibt die Kachelauswahl kurz. Kein Code wird von außen nachgeladen.
//
// Gemerkt pro Installation in den Casora-Einstellungen: settings.community = {added: [Typ-IDs]}.
// window.casoraCommunityOn (Set) liest das onlyIf der Community-Kachelarten.
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

  // Entität für den Wunsch: Wert, Einheit, Geräteklasse, Schlüssel, Attributnamen – ohne Persönliches.
  const PRIVATE_ATTR = /^(friendly_name|latitude|longitude|gps_accuracy|entity_picture|icon|address|street|location|ssid|bssid|ip|mac|host|serial|vin|user|email|phone|name)$/i;
  function describe(hass, eid) {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    const st = S[eid] || {}, a = st.attributes || {}, e = R[eid] || {};
    // Keine Namen, Räume, Seriennummern: von der ID bleibt nur die Art und der Schlüssel der Integration.
    const dom = eid.split(".")[0];
    const short = dom + ".<geraet>" + (e.translation_key ? "_" + e.translation_key : "");
    // Zustand nur als Zahl oder kurzer Schlüsselwert (on, idle, charging) – Koordinaten, IPs, Texte nie.
    let val = st.state == null ? "" : String(st.state);
    if (!(/^-?\d+(\.\d+)?$/.test(val) || /^[a-z][a-z_]{0,29}$/.test(val))) val = "(Text)";
    return {
      line: [short, val, a.unit_of_measurement ? "unit: " + a.unit_of_measurement : "", a.device_class ? "class: " + a.device_class : "",
        e.translation_key ? "tk: " + e.translation_key : ""].filter(Boolean).join("   "),
      attrs: Object.keys(a).filter((k) => !PRIVATE_ATTR.test(k)).slice(0, 25),
      platform: e.platform || "",
    };
  }

  // id: Kennung im HTML-Kommentar – darüber findet das Studio den Stand des eigenen Wunschs.
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

  // Stand eines eigenen Wunschs: Suche nach der Kennung (ohne Anmeldung, wenige Anfragen). Ohne
  // Label-Filter: das Label setzt die Action erst nach dem Einreichen.
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
    else if (it.state === "closed") state = "closed";
    let note = "";
    if ((state === "question" || state === "declined") && it.comments) {
      try {
        const c = await (await fetch(it.comments_url + "?per_page=100")).json();
        // Nur Antworten des Casora-Teams zeigen – sonst könnte jeder hier Text (Links) unterbringen.
        const last = (c || []).filter((x) => x && /^(OWNER|MEMBER|COLLABORATOR)$/.test(x.author_association)).pop();
        note = last && last.body ? String(last.body).slice(0, 200) : "";
      } catch (e) { /* ohne Kommentar */ }
    }
    return { state, note, url: it.html_url, number: it.number };
  }

  // ── Community-Karten ────────────────────────────────────────────────────
  // Kachelarten mit `community: {desc, needs?}` – mitgeliefert, standardmäßig nicht in der Auswahl.
  const cards = (types) => (types || []).filter((t) => t && t.community && !t.hidden);
  const tplOf = (t) => [].concat((t && t.template) || []).filter(Boolean);
  // Kacheln (auch in Bedingungen und Karussells), die diese Kachelart benutzen.
  const uses = (tile, type) => {
    let c = tile, n = 0;
    while (c && c.type === "conditional" && c.card && typeof c.card === "object" && n++ < 4) c = c.card;
    const want = tplOf(type);
    return !!c && tplOf(c).some((x) => want.includes(x));
  };
  const isCarousel = (t) => !!t && /swipe|carousel/.test(String(t.type || "")) && Array.isArray(t.cards);
  const carouselIn = (t) => (isCarousel(t) ? t : t && t.type === "conditional" && isCarousel(t.card) ? t.card : null);
  function usage(rooms, type) {
    let n = 0;
    (rooms || []).forEach((r) => (r.tiles || []).forEach((t) => {
      const car = carouselIn(t);
      if (car) n += car.cards.filter((x) => uses(x, type)).length;
      else if (uses(t, type)) n++;
    }));
    return n;
  }
  // Entfernt die Kacheln dieser Art; ein dadurch leeres Karussell fällt mit weg. → Anzahl.
  function dropTiles(rooms, type) {
    let n = 0;
    (rooms || []).forEach((r) => {
      if (!Array.isArray(r.tiles)) return;
      r.tiles = r.tiles.filter((t) => {
        const car = carouselIn(t);
        if (car) {
          const keep = car.cards.filter((x) => !uses(x, type));
          n += car.cards.length - keep.length;
          car.cards = keep;
          return keep.length > 0;
        }
        if (uses(t, type)) { n++; return false; }
        return true;
      });
    });
    return n;
  }

  // Gemerkte Auswahl lesen/schreiben (casora/settings: set ersetzt alles – darum frisch lesen und mischen).
  async function load(hass) {
    try {
      const r = await hass.callWS({ type: "casora/settings/get" });
      const ids = (((r && r.settings) || {}).community || {}).added;
      W.casoraCommunityOn = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
    } catch (e) { /* ohne Einstellungen: nichts hinzugefügt */ }
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

  W.casoraCommunity = { issueUrl, describe, wishBody, status, cards, usage, dropTiles, load, save, REPO, LABEL_WISH };
  if (typeof module !== "undefined" && module.exports) module.exports = W.casoraCommunity;
  if (typeof customElements === "undefined") return;

  // ── Studio ──────────────────────────────────────────────────────────────
  // Eigene Wünsche (pro Nutzer): [{id, title, at}].
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
    // Vorschaubild = genau die Kachel (240 × 200, Radius 32 px): gleiches Seitenverhältnis, Ecken anteilig.
    + ".comshot{width:120px;height:100px;border-radius:13.33%/16%;flex:none;object-fit:cover;background:rgba(127,127,127,.15);border:0;padding:0;display:block}"
    + "button.comzoom{border:0;padding:0;background:none;border-radius:13.33%/16%;flex:none;cursor:zoom-in;line-height:0}"
    + ".comrow.card{align-items:flex-start}.comrow.card > .comchip{align-self:center}"
    + ".comlink{display:inline-flex;align-items:center;gap:5px;margin-top:6px;border:0;border-radius:999px;padding:4px 10px 4px 8px;font:inherit;font-size:13px;font-weight:600;"
    + "background:var(--casora-studio-chip, rgba(118,118,128,.18));color:inherit;cursor:pointer}.comlink ha-icon{--mdc-icon-size:16px;display:flex}"
    // Große Vorschau über der Community-Seite: Kachel / Popup.
    + ".comlb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;box-sizing:border-box;"
    + "background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}"
    + ".comlb img{max-width:min(92vw,880px);max-height:72vh;border-radius:18px;box-shadow:var(--casora-popup-plate-shadow, 0 18px 50px -20px rgba(0,0,0,.6));background:rgba(127,127,127,.15)}"
    + ".comlb .comseg{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.18)}"
    + ".comlb .comseg button{border:0;border-radius:999px;padding:7px 16px;font:inherit;font-size:14px;font-weight:600;background:none;color:#fff;cursor:pointer}"
    + ".comlb .comseg button.on{background:#fff;color:#000}"
    // Bild + Leiste darüber (Umschalter mittig, × rechts bündig mit der Bildkante) als ein Block.
    + ".comlb .comfig{display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:100%}"
    + ".comlb .combar{position:relative;display:flex;justify-content:center;align-items:center;min-height:44px}"
    + ".comlb .comfig img{max-width:100%;align-self:center}"
    + ".comlb .comx{position:absolute;top:2px;right:0;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;display:grid;place-items:center}"
    + ".compill{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}"
    + ".comnote{font-size:13px;opacity:.75;margin:8px 2px 0;line-height:1.4}";
  const css = (box) => { if (!box.querySelector("style.comcss")) { const s = el("style", "comcss"); s.textContent = CSS; box.appendChild(s); } };
  const open = (url) => { try { W.open(url, "_blank", "noopener"); } catch (e) { location.href = url; } };

  // Casora-Version fürs Issue (casora/version, frontend_version.py).
  const loadVersion = (hass) => (W.__casoraVersion ? Promise.resolve() : Promise.resolve(hass && hass.callWS && hass.callWS({ type: "casora/version" }))
    .then((r) => { if (r && r.version) W.__casoraVersion = r.version; }).catch(() => {}));
  // Integration lesbar („Roborock“ statt „roborock“), aus HAs eigenen Übersetzungen.
  const integrationName = (hass, d) => {
    try { const t = hass && hass.localize && hass.localize("component." + d + ".title"); if (t) return t; } catch (e) { /* Rückfall */ }
    return d;
  };
  const hasIntegration = (hass, d) => !d || !!(hass && hass.config && (hass.config.components || []).includes(d));
  // Vorschaubilder einer Community-Karte: Kachel (Pflicht) und Popup (optional, „<id>-popup.webp“).
  const shots = (t) => ({ tile: t.community.preview || ("/casora_assets/community/" + t.id + ".webp"),
    popup: t.community.previewPopup || ("/casora_assets/community/" + t.id + "-popup.webp") });
  // Große Vorschau über der Community-Seite; Esc oder Tipp daneben schließt nur die Vorschau.
  const lightbox = (box, t, which, hasPopup) => {
    const pane = box.closest(".askpane") || box;
    const old = pane.querySelector(".comlb");
    if (old) old.remove();
    const S = shots(t);
    const lb = el("div", "comlb");
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-label", tr(t.label));
    const img = el("img");
    img.alt = tr(t.label);
    const seg = el("div", "comseg");
    // Popup-Bild ist genau auf den Rahmen geschnitten: Ecken rund wie das Popup selbst.
    const show = (k) => { img.src = S[k]; img.style.borderRadius = k === "popup" ? "36px" : "13.33%/16%"; img.style.width = k === "popup" ? "" : "min(360px, 80vw)"; seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); };
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

    // Beim Laden des Studios die gemerkte Auswahl holen – „Kachel hinzufügen“ fragt synchron (onlyIf).
    const load0 = P._load;
    if (typeof load0 === "function") {
      P._load = function () {
        if (this._hass && !this._comLoaded) this._comLoaded = load(this._hass);
        return load0.apply(this, arguments);
      };
    }

    // Kartenwunsch: Gerät, Beispiel-Entitäten (Pflicht), Kachel (Pflicht), Popup, Bild.
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
      // Vorschau: genau dieser Text geht an GitHub (öffentlich).
      const go = await this._ask({ title: tr("This is what will be public"), message: tr("Check the text. Nothing else is sent."),
        value: w.body, multiline: true, rows: 14, wide: true, confirmLabel: tr("Open GitHub"),
        extend: ({ input }) => {
          if (!input) return;
          input.readOnly = true;
          // Nicht alles markiert und von oben lesen (der Dialog wählt sonst den ganzen Text aus).
          setTimeout(() => { try { input.setSelectionRange(0, 0); input.scrollTop = 0; } catch (e) { /* egal */ } }, 60);
        } });
      if (!go) return;
      const mine = await loadMine(hass);
      mine.push({ id, title: f.device, at: Date.now() });
      saveMine(hass, mine);
      open(C.issueUrl("Kartenwunsch: " + f.device, w.body, [LABEL_WISH].concat(w.plat.length ? ["integration: " + w.plat[0]] : [])));
      if (this._status) this._status(tr("GitHub is open – submit the request there."), "ok");
    };

    // Community-Seite: Community-Karten (Hinzufügen/Entfernen) und eigene Kartenwünsche mit Stand.
    P._comCatalog = async function () {
      const C = W.casoraCommunity;
      const I = W.__casoraPanelInternals || {};
      const hass = this._hass;
      if (this._comLoaded) await this._comLoaded;
      else if (hass) await (this._comLoaded = load(hass));
      const list = C.cards(I.TILE_TYPES);
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
          const host = el("div");
          box.insertBefore(host, acts);
          host.appendChild(el("div", "comlbl", tr("Community cards")));
          if (!list.length) host.appendChild(el("div", "comnote", tr("No community cards yet. Ask for one – the first ones come with the next update.")));
          list.forEach((t) => {
            const r = el("div", "comrow card");
            const S = shots(t);
            const zoom = el("button", "comzoom");
            zoom.type = "button";
            zoom.setAttribute("aria-label", fill(tr("Preview of “{x}”"), { x: tr(t.label) }));
            const shot = el("img", "comshot");
            shot.alt = "";
            shot.loading = "lazy";
            shot.src = S.tile;
            // Ohne Vorschaubild: leere Fläche statt Symbol für ein kaputtes Bild.
            shot.onerror = () => { shot.replaceWith(el("div", "comshot")); };
            zoom.appendChild(shot);
            const tx = el("div", "comtx");
            tx.append(el("b", "", tr(t.label)), el("span", "", tr(t.community.desc || "")));
            const need = t.community.needs;
            if (need) {
              const ok2 = hasIntegration(hass, need);
              // Lesbarer Hinweis aus der Karte (needsText/needsMissing), sonst der Name der Integration.
              const txt = ok2 ? (t.community.needsText ? tr(t.community.needsText) : fill(tr("Needs {x}"), { x: integrationName(hass, need) }))
                : (t.community.needsMissing ? tr(t.community.needsMissing) : fill(tr("Needs {x} – not installed"), { x: integrationName(hass, need) }));
              tx.appendChild(el("small", "", txt));
            }
            // „Popup ansehen“ nur, wenn es ein Popup-Bild gibt.
            let hasPopup = false;
            const pop = el("button", "comlink");
            pop.type = "button";
            pop.innerHTML = '<ha-icon icon="mdi:open-in-app"></ha-icon>';
            pop.appendChild(el("span", "", tr("View popup")));
            pop.style.display = "none";
            pop.onclick = () => lightbox(box, t, "popup", true);
            const probe = new Image();
            probe.onload = () => { hasPopup = true; pop.style.display = ""; };
            probe.src = S.popup;
            tx.appendChild(pop);
            zoom.onclick = () => lightbox(box, t, "tile", hasPopup);
            const on = W.casoraCommunityOn.has(t.id);
            const b = el("button", "comchip" + (on ? "" : " on"), tr(on ? "Remove" : "Add"));
            b.type = "button";
            b.setAttribute("data-com", t.id);
            b.onclick = () => { then = { toggle: t }; ok.click(); };
            r.append(zoom, tx, b);
            host.appendChild(r);
          });
          // Eigene Wünsche
          loadMine(hass).then((mine) => {
            if (!mine.length) return;
            host.appendChild(el("div", "comlbl", tr("Your requests")));
            const L = { sent: ["Sent?", "rgba(127,127,127,.2)"], closed: ["Closed", "rgba(127,127,127,.2)"], open: ["Open", "rgba(232,176,74,.22)"],
              question: ["Question", "rgba(91,143,209,.25)"], built: ["Built", "rgba(107,178,122,.25)"], declined: ["Declined", "rgba(217,96,79,.25)"] };
            mine.slice().reverse().slice(0, 10).forEach((m, k) => {
              const r = el("div", "comrow");
              const t = el("div", "comtx");
              const sub = el("span", "", tr("Checking …"));
              t.append(el("b", "", m.title), sub);
              t.setAttribute("data-no-i18n", "");
              const pill = el("span", "compill", "…");
              r.append(t, pill);
              host.appendChild(r);
              // Wenige Anfragen: GitHub erlaubt ohne Anmeldung nur einige je Minute.
              setTimeout(() => C.status(m.id).then((st) => {
                const l = L[st.state] || L.open;
                pill.textContent = tr(l[0]); pill.style.background = l[1];
                const when = new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
                sub.textContent = st.note || (st.number ? "#" + st.number + " · " + when
                  : tr("Submitted? It can take a few minutes until the state shows here.") + " · " + when);
                if (st.url) { r.style.cursor = "pointer"; r.onclick = () => open(st.url); }
              }).catch(() => { sub.textContent = tr("GitHub can't be reached right now."); }), k * 1200);
            });
          });
        },
      });
      if (then && then.wish) return this._comWish();
      if (!res || !then || !then.toggle) return;
      await this._comToggle(then.toggle);
      return this._comCatalog();
    };

    // Hinzufügen/Entfernen einer Community-Karte in der Kachelauswahl.
    P._comToggle = async function (type) {
      const C = W.casoraCommunity;
      const ids = new Set(W.casoraCommunityOn);
      const name = tr(type.label);
      if (!ids.has(type.id)) {
        ids.add(type.id);
        try { await C.save(this._hass, ids); }
        catch (e) { if (this._status) this._status(tr("Couldn't save. Try again."), "err"); return; }
        if (this._status) this._status(fill(tr("“{x}” is now in Add tile."), { x: name }), "ok");
        return;
      }
      // Wird die Kachel in diesem Dashboard benutzt? Dann nachfragen: Kacheln behalten oder mit entfernen.
      const rooms = (this._state && this._state.compact && this._state.compact.rooms) || [];
      const n = C.usage(rooms, type);
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
        if (!res || res.pick == null) return;
        drop = res.pick === "drop";
      }
      ids.delete(type.id);
      try { await C.save(this._hass, ids); }
      catch (e) { if (this._status) this._status(tr("Couldn't save. Try again."), "err"); return; }
      if (drop && C.dropTiles(rooms, type)) {
        this._markDirty();
        this._renderForm();
        if (this._syncPreview) this._syncPreview();
        if (this._status) this._status(tr("Removed – save to keep it."), "ok");
        return;
      }
      if (this._status) this._status(fill(tr("“{x}” is no longer in Add tile."), { x: name }), "ok");
    };
  });
})();
