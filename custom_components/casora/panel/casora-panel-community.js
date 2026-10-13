// Casora Studio · Community (1.5): Kartenwunsch einreichen, eigene Kachel teilen, Karten der Community.
// Ohne eigenen Server: Einreichen öffnet ein fertig ausgefülltes GitHub-Issue, den Stand liest das
// Studio über die öffentliche GitHub-API, den Katalog aus dem Repo (community/karten.json).
//
// Sicherheit: Eine geteilte Karte ist nur Daten – eine Casora-Vorlage, ein Name, Platzhalter für
// Geräte und einfache Werte. validate() lässt nichts durch, was Code sein oder etwas auslösen kann
// (Formeln [[[ ]]], HTML, Links, Aktionen, Dienste, eigene Karten, verschachtelte Objekte). Geprüft
// wird beim Teilen, in der GitHub-Action (tools/community-check.mjs, gleicher Code) und beim
// Hinzufügen noch einmal – dem Katalog wird nicht blind vertraut.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));

  const REPO = "SH1FT-W/casora";
  const CATALOG = "https://raw.githubusercontent.com/" + REPO + "/main/community/karten.json";
  const LABEL_SHARE = "community-karte";
  const LABEL_WISH = "kartenwunsch";
  const SLOT = /^@slot:([1-9][0-9]?)$/;
  const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;
  const MAX_SLOTS = 12;

  // ── Prüfen ──────────────────────────────────────────────────────────────
  // Nur Kachel-Vorlagen; Gerüst, Popups, Badges und eigene Karten nie.
  const TEMPLATE = /^casora_[a-z0-9_]{2,40}$/;
  const NOT_TILES = /^casora_(room|popup|mobile|badge|custom|menu|assist|settings|notifications|scene_core|scene_row|now_playing|time|default|entity|shared|climate_popup)/;
  // Variablen, die etwas auslösen oder Code/Karten tragen könnten – nie.
  const BAD_KEY = /(action|service|url|link|navigat|script|card|style|template|html|popup|confirm|command|code|iframe|image|camera_url|webhook|token|password|secret|cookie|javascript|eval)/i;
  // Texte: keine Formeln, kein HTML, keine Jinja-Vorlagen, keine Protokolle.
  const BAD_TEXT = /\[\[\[|\]\]\]|[<>]|\$\{|\{\{|\{%|javascript:|data:|vbscript:|on[a-z]+\s*=|https?:\/\//i;

  function badText(s) { return typeof s !== "string" || s.length > 200 || BAD_TEXT.test(s); }

  function checkValue(v, path, errs) {
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") { if (!isFinite(v)) errs.push(path + ": keine gültige Zahl"); return; }
    if (typeof v === "string") { if (badText(v)) errs.push(path + ": Text nicht erlaubt"); return; }
    if (Array.isArray(v)) {
      if (v.length > 30) { errs.push(path + ": Liste zu lang"); return; }
      v.forEach((x, i) => {
        if (x !== null && typeof x === "object") errs.push(path + "[" + i + "]: verschachtelt nicht erlaubt");
        else checkValue(x, path + "[" + i + "]", errs);
      });
      return;
    }
    errs.push(path + ": nicht erlaubt");
  }

  // shared = {v:1, template, name, entity?, variables, slots:[{id, domain, label}]}
  function validate(shared) {
    const errs = [];
    if (!shared || typeof shared !== "object" || Array.isArray(shared)) return { ok: false, errors: ["keine Karte"] };
    const allowedTop = ["v", "template", "name", "entity", "variables", "slots"];
    Object.keys(shared).forEach((k) => { if (!allowedTop.includes(k)) errs.push(k + ": nicht erlaubt"); });
    if (shared.v !== 1) errs.push("v: unbekannte Fassung");
    const t = shared.template;
    if (typeof t !== "string" || !TEMPLATE.test(t) || NOT_TILES.test(t)) errs.push("template: nur Casora-Kachelvorlagen");
    if (badText(shared.name || "") || !String(shared.name || "").trim()) errs.push("name: fehlt oder nicht erlaubt");
    const slots = Array.isArray(shared.slots) ? shared.slots : null;
    if (!slots || slots.length > MAX_SLOTS) errs.push("slots: fehlen oder zu viele");
    const ids = new Set();
    (slots || []).forEach((s, i) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) { errs.push("slots[" + i + "]: nicht erlaubt"); return; }
      Object.keys(s).forEach((k) => { if (!["id", "domain", "label"].includes(k)) errs.push("slots[" + i + "]." + k + ": nicht erlaubt"); });
      if (!Number.isInteger(s.id) || s.id < 1 || s.id > MAX_SLOTS) errs.push("slots[" + i + "].id: ungültig");
      if (typeof s.domain !== "string" || !/^[a-z_]{2,30}$/.test(s.domain)) errs.push("slots[" + i + "].domain: ungültig");
      if (badText(s.label || "")) errs.push("slots[" + i + "].label: nicht erlaubt");
      ids.add(s.id);
    });
    const slotRef = (v, path) => {
      const m = SLOT.exec(v);
      if (m && !ids.has(Number(m[1]))) errs.push(path + ": Platzhalter ohne Gerät");
      // Echte Entitäts-IDs gehören nicht in eine geteilte Karte (dafür gibt es Platzhalter).
      if (!m && ENTITY.test(v)) errs.push(path + ": Gerät ohne Platzhalter");
    };
    if (shared.entity !== undefined) {
      if (typeof shared.entity !== "string" || !SLOT.test(shared.entity)) errs.push("entity: nur Platzhalter");
      else slotRef(shared.entity, "entity");
    }
    const vars = shared.variables;
    if (vars !== undefined && (typeof vars !== "object" || vars === null || Array.isArray(vars))) errs.push("variables: nicht erlaubt");
    else if (vars) {
      const keys = Object.keys(vars);
      if (keys.length > 60) errs.push("variables: zu viele");
      keys.forEach((k) => {
        if (!/^[a-z0-9_]{1,40}$/.test(k) || BAD_KEY.test(k)) { errs.push("variables." + k + ": nicht erlaubt"); return; }
        const v = vars[k];
        checkValue(v, "variables." + k, errs);
        [].concat(v).forEach((x) => { if (typeof x === "string") slotRef(x, "variables." + k); });
      });
    }
    return { ok: !errs.length, errors: errs };
  }

  // Kachel aus dem Studio → geteilte Form (Geräte → Platzhalter). Nur einfache Casora-Kacheln.
  function share(tile, hass) {
    const inner = tile && tile.type === "conditional" && tile.card ? tile.card : tile;
    if (!inner || inner.type !== "custom:button-card") return { ok: false, errors: [tr("Only Casora tiles can be shared.")] };
    const tpl = [].concat(inner.template || []).filter(Boolean);
    if (tpl.length !== 1) return { ok: false, errors: [tr("Only Casora tiles can be shared.")] };
    const S = (hass && hass.states) || {};
    const slots = [], map = new Map();
    const slotFor = (eid) => {
      if (!map.has(eid)) {
        const id = slots.length + 1;
        const st = S[eid];
        const dc = st && st.attributes && st.attributes.device_class;
        slots.push({ id, domain: eid.split(".")[0], label: dc ? String(dc).replace(/_/g, " ") : eid.split(".")[0] });
        map.set(eid, "@slot:" + id);
      }
      return map.get(eid);
    };
    const out = { v: 1, template: tpl[0], name: String(inner.name || "").trim(), slots };
    if (typeof inner.entity === "string" && ENTITY.test(inner.entity)) out.entity = slotFor(inner.entity);
    const vars = {};
    Object.keys(inner.variables || {}).forEach((k) => {
      let v = inner.variables[k];
      // Studio-interne Merker und Größe am Handy nicht mitnehmen.
      if (/^(casora_|size$)/.test(k)) return;
      if (typeof v === "string" && ENTITY.test(v)) v = slotFor(v);
      else if (Array.isArray(v)) v = v.map((x) => (typeof x === "string" && ENTITY.test(x) ? slotFor(x) : x));
      vars[k] = v;
    });
    if (Object.keys(vars).length) out.variables = vars;
    const res = validate(out);
    return res.ok ? { ok: true, shared: out } : { ok: false, errors: res.errors };
  }

  // Geteilte Karte + eigene Geräte → Kachel. Prüft vorher und danach.
  function materialize(shared, mapping) {
    const pre = validate(shared);
    if (!pre.ok) return { ok: false, errors: pre.errors };
    const put = (v) => {
      if (typeof v === "string") { const m = SLOT.exec(v); if (m) return mapping[Number(m[1])] || ""; }
      if (Array.isArray(v)) return v.map(put);
      return v;
    };
    const tile = { type: "custom:button-card", template: shared.template, name: shared.name };
    if (shared.entity) tile.entity = put(shared.entity);
    const vars = {};
    Object.keys(shared.variables || {}).forEach((k) => { vars[k] = put(shared.variables[k]); });
    vars.size = "auto";
    tile.variables = vars;
    for (const s of shared.slots) {
      const eid = mapping[s.id];
      if (!eid || !ENTITY.test(eid) || eid.split(".")[0] !== s.domain) return { ok: false, errors: [fill(tr("Pick a device for {x}."), { x: s.label })] };
    }
    return { ok: true, tile };
  }

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
    const short = eid.replace(/^([a-z_]+)\.[a-z0-9]+_/, "$1.<geraet>_");
    let val = st.state == null ? "" : String(st.state);
    if (val.length > 40 || /[<>]/.test(val)) val = "…";
    return {
      line: [short, val, a.unit_of_measurement ? "unit: " + a.unit_of_measurement : "", a.device_class ? "class: " + a.device_class : "",
        e.translation_key ? "tk: " + e.translation_key : ""].filter(Boolean).join("   "),
      attrs: Object.keys(a).filter((k) => !PRIVATE_ATTR.test(k)).slice(0, 25),
      platform: e.platform || "",
    };
  }

  function wishBody(f, hass) {
    const d = f.entities.map((x) => describe(hass, x));
    const plat = [...new Set(d.map((x) => x.platform).filter(Boolean))];
    return {
      plat,
      body: "### Gerät oder Dienst\n" + f.device + "\n\n### Was soll die Kachel zeigen?\n" + f.tile
        + (f.popup ? "\n\n### Und im Popup?\n" + f.popup : "")
        + "\n\n### Integration\n" + (plat.join(", ") || "–")
        + "\n\n### Entitäten (anonymisiert)\n```\n" + d.map((x) => x.line).join("\n") + "\n```"
        + "\n\n### Attribute\n" + d.map((x) => "- " + (x.attrs.join(", ") || "–")).join("\n")
        + (f.image ? "\n\n### Bild\n" + f.image : "")
        + "\n\n---\nEingereicht aus Casora " + version() + " · Home Assistant " + haVersion(hass),
    };
  }

  function shareBody(shared, desc, id) {
    return "### Kurzbeschreibung\n" + desc + "\n\n### Karte\n```casora-karte\n" + JSON.stringify(shared, null, 1) + "\n```\n\n"
      + "<!-- casora-id:" + id + " -->\nEingereicht aus Casora " + version();
  }

  // Stand einer geteilten Karte: Suche nach der Kennung im Issue (ohne Anmeldung, wenige Anfragen).
  async function status(id) {
    const q = encodeURIComponent("repo:" + REPO + " is:issue label:" + LABEL_SHARE + " casora-id:" + id);
    const r = await fetch("https://api.github.com/search/issues?q=" + q, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub " + r.status);
    const j = await r.json();
    const it = (j.items || [])[0];
    if (!it) return { state: "sent" };
    const labels = (it.labels || []).map((l) => l.name);
    let state = "review";
    if (labels.includes("freigegeben")) state = "approved";
    else if (labels.includes("abgelehnt") || it.state === "closed") state = labels.includes("freigegeben") ? "approved" : "declined";
    else if (labels.includes("rueckfrage")) state = "question";
    let note = "";
    if ((state === "question" || state === "declined") && it.comments) {
      try {
        const c = await (await fetch(it.comments_url + "?per_page=100")).json();
        const last = (c || []).filter((x) => x && x.author_association !== "NONE").pop() || (c || []).pop();
        note = last && last.body ? String(last.body).slice(0, 200) : "";
      } catch (e) { /* ohne Kommentar */ }
    }
    return { state, note, url: it.html_url, number: it.number };
  }

  async function catalog() {
    const r = await fetch(CATALOG, { cache: "no-store" });
    if (!r.ok) throw new Error("Katalog " + r.status);
    const j = await r.json();
    return ((j && j.cards) || []).filter((c) => c && typeof c === "object" && validate(c.card).ok
      && !badText(c.title || "") && !badText(c.desc || "") && !badText(c.by || ""));
  }

  W.casoraCommunity = { validate, share, materialize, issueUrl, wishBody, shareBody, status, catalog, describe, REPO, LABEL_SHARE, LABEL_WISH };
  if (typeof module !== "undefined" && module.exports) module.exports = W.casoraCommunity;
  if (typeof customElements === "undefined") return;

  // ── Studio ──────────────────────────────────────────────────────────────
  const KEY = "casora_community_shared";
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
    + ".comrow{display:flex;align-items:center;gap:10px;padding:10px 4px;border-top:1px solid rgba(127,127,127,.15)}.comrow:first-child{border-top:0}"
    + ".comrow .comtx{flex:1;min-width:0}.comrow b{display:block;font-size:14px}.comrow span{font-size:13px;opacity:.7}"
    + ".compill{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}"
    + ".comnote{font-size:13px;opacity:.75;margin:8px 2px 0;line-height:1.4}";
  const css = (box) => { if (!box.querySelector("style.comcss")) { const s = el("style", "comcss"); s.textContent = CSS; box.appendChild(s); } };
  const open = (url) => { try { W.open(url, "_blank", "noopener"); } catch (e) { location.href = url; } };

  // Casora-Version fürs Issue (casora/version, frontend_version.py).
  const loadVersion = (hass) => (W.__casoraVersion ? Promise.resolve() : Promise.resolve(hass && hass.callWS && hass.callWS({ type: "casora/version" }))
    .then((r) => { if (r && r.version) W.__casoraVersion = r.version; }).catch(() => {}));
  // Gerätart lesbar („Staubsauger“ statt „vacuum“), aus HAs eigenen Übersetzungen.
  const domainName = (hass, d) => { try { const t = hass && hass.localize && hass.localize("component." + d + ".title"); if (t) return t; } catch (e) { /* roh */ } return d; };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;

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
      const w = C.wishBody(f, hass);
      open(C.issueUrl("Kartenwunsch: " + f.device, w.body, [LABEL_WISH].concat(w.plat.length ? ["integration: " + w.plat[0]] : [])));
      if (this._status) this._status(tr("GitHub is open – submit the request there."), "ok");
    };

    // Kachel teilen: Vorschau der geteilten Form, Kurzbeschreibung, dann GitHub.
    P._comShare = async function (room, tile) {
      const C = W.casoraCommunity;
      const s = C.share(tile, this._hass);
      if (!s.ok) {
        await this._ask({ title: tr("This tile can't be shared"), message: s.errors.slice(0, 4).join(" · "), cancelLabel: tr("Close"), confirmLabel: "OK" });
        return;
      }
      let desc = "";
      const res = await this._ask({
        title: tr("Share with the community"),
        message: tr("After your review this card is visible to everyone. Devices become placeholders. Check the name – everyone will see it."),
        wide: true,
        confirmLabel: tr("Submit on GitHub"),
        extend: ({ box, acts, ok }) => {
          css(box);
          const info = el("div");
          info.appendChild(el("div", "comlbl", tr("Shared as")));
          const rows = [[tr("Template"), s.shared.template],
            [tr("Devices"), s.shared.slots.map((x) => domainName(this._hass, x.domain)).join(", ") || "–"]];
          rows.forEach(([k, v]) => { const r = el("div", "comrow"); const t = el("div", "comtx"); t.append(el("b", "", k), el("span", "", v)); r.appendChild(t); info.appendChild(r); });
          const nm = field(info, "Name for everyone *", { placeholder: "e.g. Robot vacuum" });
          nm.value = s.shared.name;
          const d = field(info, "Short description *", { placeholder: "e.g. Roborock with dock: status, dock errors, room" });
          box.insertBefore(info, acts);
          const warn = el("div", "fieldwarn");
          ok.addEventListener("click", (ev) => {
            desc = d.value.trim();
            const name = nm.value.trim();
            const plain = (x) => x.length <= 200 && !/[<>]|\[\[\[|https?:\/\/|\{\{|\$\{/i.test(x);
            const why = !name ? "Give the card a name." : !plain(name) ? "Plain text only, up to 200 characters."
              : !desc ? "Add a short description." : !plain(desc) ? "Plain text only, up to 200 characters." : "";
            if (!why) s.shared.name = name;
            if (why) { ev.stopImmediatePropagation(); warn.textContent = tr(why); if (!warn.parentNode) box.insertBefore(warn, acts); }
          }, true);
        },
      });
      if (!res) return;
      if (!C.validate(s.shared).ok) return;
      await loadVersion(this._hass);
      const id = Math.random().toString(36).slice(2, 10);
      const mine = await loadMine(this._hass);
      mine.push({ id, title: s.shared.name, at: Date.now() });
      saveMine(this._hass, mine);
      open(C.issueUrl("Community-Karte: " + s.shared.name, C.shareBody(s.shared, desc, id), [LABEL_SHARE]));
      if (this._status) this._status(tr("GitHub is open – submit the card there."), "ok");
    };

    // Karten der Community + eigene geteilte Karten mit Stand.
    P._comCatalog = async function () {
      const C = W.casoraCommunity;
      const room = this._state && this._state.compact && this._state.compact.rooms[this._room];
      let chosen = null, wish = false;
      const res = await this._ask({
        title: tr("Community cards"),
        message: tr("Reviewed and approved. Before adding, you pick your own devices."),
        wide: true,
        confirmLabel: tr("Close"),
        cancelLabel: tr("Request a card…"),
        extend: ({ box, acts, ok, cancel }) => {
          css(box);
          cancel.addEventListener("click", () => { wish = true; }, true);
          const host = el("div");
          box.insertBefore(host, acts);
          const listBox = el("div");
          host.appendChild(el("div", "comlbl", tr("Cards")));
          host.appendChild(listBox);
          listBox.appendChild(el("div", "comnote", tr("Loading …")));
          C.catalog().then((cards) => {
            listBox.innerHTML = "";
            if (!cards.length) listBox.appendChild(el("div", "comnote", tr("No cards yet.")));
            cards.forEach((c) => {
              const r = el("div", "comrow");
              const t = el("div", "comtx");
              t.append(el("b", "", c.title), el("span", "", [c.desc, c.by ? "@" + c.by : ""].filter(Boolean).join(" · ")));
              t.setAttribute("data-no-i18n", "");
              const b = el("button", "comchip", tr("Add"));
              b.type = "button";
              b.onclick = () => { chosen = c; ok.click(); };
              r.append(t, b);
              listBox.appendChild(r);
            });
          }).catch(() => { listBox.innerHTML = ""; listBox.appendChild(el("div", "comnote", tr("GitHub can't be reached right now."))); });
          // Eigene geteilte Karten
          loadMine(this._hass).then((mine) => {
            if (!mine.length) return;
            host.appendChild(el("div", "comlbl", tr("Your shared cards")));
            const L = { sent: ["Not submitted yet", "rgba(127,127,127,.2)"], review: ["In review", "rgba(232,176,74,.22)"],
              question: ["Question", "rgba(91,143,209,.25)"], approved: ["Approved", "rgba(107,178,122,.25)"], declined: ["Declined", "rgba(217,96,79,.25)"] };
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
                const l = L[st.state] || L.review;
                pill.textContent = tr(l[0]); pill.style.background = l[1];
                sub.textContent = st.note || (st.number ? "#" + st.number : tr("Submit it on GitHub to start the review."));
                if (st.url) { r.style.cursor = "pointer"; r.onclick = () => open(st.url); }
              }).catch(() => { sub.textContent = tr("GitHub can't be reached right now."); }), k * 1200);
            });
          });
        },
      });
      // Linker Knopf ist „Kartenwunsch …“ statt Abbrechen.
      if (res === null) { if (wish) this._comWish(); return; }
      if (!chosen || !room) return;
      await this._comAdd(room, chosen);
    };

    // Geräte zuordnen und hinzufügen – vorher noch einmal prüfen.
    P._comAdd = async function (room, c) {
      const C = W.casoraCommunity;
      const shared = c.card;
      if (!C.validate(shared).ok) { if (this._status) this._status(tr("This card did not pass the check."), "err"); return; }
      const S = (this._hass && this._hass.states) || {};
      const mapping = {};
      const res = await this._ask({
        title: fill(tr("Add “{x}”"), { x: c.title }),
        message: tr("Pick your devices. The card only shows them – it can't switch anything on its own."),
        wide: true,
        confirmLabel: tr("Add"),
        extend: ({ box, acts, ok }) => {
          css(box);
          const host = el("div");
          shared.slots.forEach((s) => {
            host.appendChild(el("div", "comlbl", s.label + " · " + s.domain));
            const list = Object.keys(S).filter((k) => k.split(".")[0] === s.domain).sort();
            host.appendChild(this._combo("", list, tr("Pick a device"), (v) => { mapping[s.id] = v; }).wrap);
          });
          box.insertBefore(host, acts);
          const warn = el("div", "fieldwarn");
          ok.addEventListener("click", (ev) => {
            const m = C.materialize(shared, mapping);
            if (!m.ok) { ev.stopImmediatePropagation(); warn.textContent = m.errors[0]; if (!warn.parentNode) box.insertBefore(warn, acts); }
          }, true);
        },
      });
      if (!res) return;
      const m = C.materialize(shared, mapping);
      if (!m.ok) return;
      room.tiles.push(m.tile);
      this._markDirty();
      this._renderForm();
      if (this._syncPreview) this._syncPreview();
      if (this._status) this._status(tr("Added – save to keep it."), "ok");
    };
  });

  // Kachel-Menü (casora-panel.js ruft menu/pick wie bei casoraKachelart).
  W.casoraCommunityMenu = {
    menu(panel, menu, ctx) {
      const t = ctx && ctx.tile;
      const inner = t && t.type === "conditional" && t.card ? t.card : t;
      if (!inner || inner.type !== "custom:button-card") return;
      menu.splice(Math.max(0, menu.length - 1), 0, { id: "community_share", label: "Share with the community…" });
    },
    pick(panel, id, ctx) {
      if (id !== "community_share") return false;
      panel._comShare(ctx.room, ctx.tile);
      return true;
    },
  };
})();
