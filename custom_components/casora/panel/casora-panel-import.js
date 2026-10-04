// Casora: Import-Assistent für Hemma-1-Dashboards.
//
// Hemma 1 war reines YAML: jede Seite = Raumkarte (casora_room) + layout-card mit
// den Kacheln. Hemma 2 / Casora erwartet Raumkarte + Navigation + Smart-Row und
// überspringt Hemma-1-Seiten deshalb komplett. Dieser Assistent liest Räume,
// Bilder, Raum-Einstellungen und Kacheln, schlägt für Kacheltypen, die es nicht
// mehr gibt, Alternativen vor und baut daraus mit den Bausteinen des Panels ein
// neues Dashboard samt Handy-Layout. Das Original bleibt unverändert.
(() => {
  if (window.casoraLegacy) return;

  // Frühere Casora-Kacheln, die es so nicht mehr gibt → naheliegender Ersatz.
  const RENAMED = {
    casora_curtain: "casora_cover",
    casora_blind: "casora_cover",
    casora_doorbell: "casora_camera",
    casora_camera_tile: "casora_camera",
    casora_air_purifier: "casora_air_purifier",
  };

  const isButtonCard = (c) => c && c.type === "custom:button-card";
  const tplName = (t) => (Array.isArray(t) ? t[0] : t) || "";

  // Alle Button-Karten einer Seite (außer der Raumkarte), in Anzeigereihenfolge.
  function collectTiles(cards) {
    const out = [];
    (function walk(list) {
      (list || []).forEach((c) => {
        if (!c || typeof c !== "object") return;
        if (isButtonCard(c)) {
          if (tplName(c.template) !== "casora_room") out.push(c);
          return;
        }
        if (Array.isArray(c.cards)) walk(c.cards);
        else if (c.card) walk([c.card]);
      });
    })(cards);
    return out;
  }

  // Hemma 1: Seiten beginnen mit casora_room, aber keine hat eine Smart-Row.
  function detect(cfg) {
    const views = (cfg && cfg.views) || [];
    if (!views.length) return false;
    const rooms = views.filter((v) => (((v.cards || [])[0]) || {}).template === "casora_room");
    if (!rooms.length) return false;
    const hasRow = views.some((v) => (v.cards || []).some((c) => c && c.type === "custom:casora-smart-row"));
    return !hasRow && rooms.some((v) => collectTiles((v.cards || []).slice(1)).length);
  }

  // Türklingel (Hemma 1 und ältere Fassungen „…_doorbell“) → Kamera-Kachel: die Kamera der Klingel. Ist die Entität
  // schon eine Kamera, sie selbst; sonst eine Kamera am selben Gerät oder mit demselben Namen
  // („binary_sensor.klingel_test“ → „camera.klingel…“). Keine gefunden: null (bleibt eigene Karte).
  function doorbellCamera(entity, hass) {
    const id = String(entity || "");
    if (/^camera\./.test(id)) return id;
    if (!hass || !id) return null;
    const reg = hass.entities || {}, S = hass.states || {};
    const dev = reg[id] && reg[id].device_id;
    if (dev) {
      const hit = Object.keys(reg).find((e) => /^camera\./.test(e) && reg[e].device_id === dev);
      if (hit) return hit;
    }
    const base = (id.split(".")[1] || "").replace(/_(ding|klingel|klingelt|ring|doorbell|press|pressed|motion|bewegung|visitor|besucher)(_.*)?$/, "");
    if (!base) return null;
    const cams = Object.keys(S).filter((e) => /^camera\./.test(e));
    return cams.find((e) => e === "camera." + base) || cams.find((e) => e.indexOf("camera." + base + "_") === 0) || null;
  }

  // Kacheln aus Hemma 1 und älteren Fassungen, die Casora als Studio-Kacheltyp führt: Schalter (casora_switch) und
  // Aquarien (casora_aquarium) heißen schon so; die Türklingel wird zur Kamera-Kachel. Fußball
  // (…_match) und alles andere bleiben, wie sie sind.
  function upgrade(tile, hass) {
    const t = tile.template;
    if (tplName(t) !== "casora_doorbell" || (Array.isArray(t) && t.length > 1)) return tile;
    const cam = doorbellCamera(tile.entity, hass);
    if (!cam) return tile;
    return Object.assign({}, tile, { template: "casora_camera", entity: cam, name: tile.name || "Doorbell" });
  }

  // Räume + Kacheln aus einem Hemma-1-Dashboard. hass (optional): Türklingel → Kamera (upgrade).
  function read(cfg, hass) {
    const I = window.__casoraPanelInternals;
    return ((cfg && cfg.views) || []).filter((v) => (((v.cards || [])[0]) || {}).template === "casora_room")
      .map((v) => {
        const hero = v.cards[0];
        const hv = Object.assign({}, hero.variables || {});
        // Name als JavaScript („Guten Morgen“ je nach Uhrzeit): Seitentitel statt Code als Raumname.
        const js = typeof hero.name === "string" && hero.name.indexOf("[[[") >= 0;
        const name = (!js && hero.name) || (v.title ? I.titleCase(v.title) : I.titleCase(v.path || "room"));
        const tiles = collectTiles(v.cards.slice(1)).map((c) => upgrade({
          card: c,
          template: c.template,
          entity: c.entity || "",
          name: c.name || "",
          variables: Object.assign({}, c.variables || {}),
        }, hass));
        return { name, path: v.path || I.slug(name), image: hv.image || null, variables: hv, tiles };
      });
  }

  // Bekannte Kacheltypen (Casora + eigene) als Auswahl. withHidden: auch die, die das
  // Studio nicht zum Hinzufügen anbietet (Schloss-/Jalousiegruppe …) – für „kennt Casora das?“.
  function knownTypes(withHidden) {
    const I = window.__casoraPanelInternals;
    return I.TILE_TYPES.filter((t) => withHidden || !t.hidden).concat(I.USER_TILE_TYPES || []);
  }

  // Erkennen schließt versteckte Typen ein: die Standard-Gruppenkacheln sind keine eigenen Karten.
  function typeOf(template) {
    const I = window.__casoraPanelInternals;
    return I.findType(knownTypes(true), template) || null;
  }

  // Vorschläge für eine unbekannte Kachel, bester zuerst.
  function suggest(tile, hass) {
    const types = knownTypes();
    const dom = String(tile.entity || "").split(".")[0];
    const out = [];
    const add = (t, why) => { if (t && !out.some((x) => x.type === t)) out.push({ type: t, why }); };
    const renamed = RENAMED[tplName(tile.template)];
    if (renamed) add(types.find((t) => t.template === renamed), "renamed");
    types.filter((t) => dom && (t.domains || []).includes(dom)).forEach((t) => add(t, "domain"));
    return out;
  }

  window.casoraLegacy = { detect, read, suggest, typeOf, collectTiles, upgrade, doorbellCamera };

  // Namen aus dem Dashboard des Nutzers nicht übersetzen („Living Room“ bleibt so).
  function keep(el) { if (el) el.setAttribute("data-no-i18n", ""); return el; }

  // Freier Name: Eingabefelder übersetzt der Panel-Übersetzer nicht, daher hier nach Sprache.
  function freeName(base, taken, hass) {
    // Auch Titel in der Seitenleiste zählen (YAML-Dashboards, frühere Importe).
    taken = new Set([...taken].concat(Object.values((hass && hass.panels) || {}).map((p) => (p.title || "").trim())));
    if (!taken.has(base)) return base;
    const lang = String((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en");
    const tag = lang.indexOf("de") === 0 ? "importiert" : "imported";
    let name = base + " (" + tag + ")";
    for (let n = 2; taken.has(name); n++) name = base + " (" + tag + " " + n + ")";
    return name;
  }

  window.casoraFreeName = freeName;

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._casoraLegacyReview) return;

    // Schritt 1: Überblick – Räume, Kacheln, was nicht erkannt wird.
    P._casoraLegacyReview = function (src, wides, all, o) {
      const I = window.__casoraPanelInternals;
      const rooms = read(src.cfg, this._hass);
      const unknown = [];
      rooms.forEach((r) => r.tiles.forEach((t) => { if (!typeOf(t.template)) unknown.push({ room: r, tile: t }); }));
      const s = this._flowScreen({
        icon: "import",
        title: "Hemma 1 Dashboard Found",
        lede: "This dashboard was made with Hemma 1. Its rooms and tiles can be moved to a new "
          + "dashboard. The original won't be changed.",
        back: o.back,
      });
      const list = this._flowGroup(s.body, { header: "Rooms" });
      rooms.forEach((r) => {
        const n = r.tiles.length;
        const miss = r.tiles.filter((t) => !typeOf(t.template)).length;
        const row = this._flowRow(list, {
          mask: I.iconUrl(I.roomGlyph(r.name, r)), tint: I.FLOW_TINT.teal, title: I.roomLabel(r, rooms, this._hass),
          detail: n + (n === 1 ? " tile" : " tiles"),
          sub: miss ? miss + (miss === 1 ? " tile needs a choice" : " tiles need a choice") : null,
          subTone: miss ? "warn" : null,
        });
        keep(row.row.querySelector(".rtext > b"));
      });
      this._flowCancel(s.acts);
      this._flowButton(s.acts, "Continue", () => (unknown.length
        ? this._casoraLegacyChoose(src, rooms, unknown, { back: () => this._casoraLegacyReview(src, wides, all, o) })
        : this._casoraLegacyName(src, rooms, {}, { back: () => this._casoraLegacyReview(src, wides, all, o) })));
    };

    // Schritt 2: Für jede unbekannte Kachel eine Alternative wählen.
    P._casoraLegacyChoose = function (src, rooms, unknown, o) {
      const I = window.__casoraPanelInternals;
      const choices = {};
      const s = this._flowScreen({
        icon: "import",
        title: "Choose Replacements",
        lede: "These tiles use card types that don't exist anymore. Pick what each one "
          + "should become.",
        back: o.back,
      });
      let group = null, lastRoom = null;
      unknown.forEach((u, i) => {
        if (u.room !== lastRoom) { group = this._flowGroup(s.body, { header: I.roomLabel(u.room, rooms, this._hass) }); keep(group.parentNode.querySelector(".fhead")); lastRoom = u.room; }
        const st = u.tile.entity && this._hass.states[u.tile.entity];
        const label = u.tile.name || (st && st.attributes && st.attributes.friendly_name) || u.tile.entity || tplName(u.tile.template);
        const r = this._flowRow(group, {
          icon: "doc", tint: I.FLOW_TINT.gray, title: label,
          sub: tplName(u.tile.template).replace(/^casora_/, "") + (u.tile.entity ? " · " + u.tile.entity : ""),
        });
        r.row.classList.add("wrap2");
        keep(r.row.querySelector(".rtext > b"));
        const sel = document.createElement("select");
        sel.className = "casora-pick";
        const opts = suggest(u.tile, this._hass).map((x) => ({ value: "type:" + x.type.id, label: x.type.label }));
        opts.push({ value: "custom", label: "Keep as its own card" });
        opts.push({ value: "skip", label: "Leave out" });
        opts.forEach((x) => {
          const op = document.createElement("option");
          op.value = x.value;
          op.textContent = x.label;
          sel.appendChild(op);
        });
        sel.value = opts[0].value;
        choices[i] = sel.value;
        sel.onchange = () => { choices[i] = sel.value; };
        r.row.appendChild(sel);
      });
      this._flowCancel(s.acts);
      this._flowButton(s.acts, "Continue", () => {
        const map = new Map();
        unknown.forEach((u, i) => map.set(u.tile, choices[i]));
        this._casoraLegacyName(src, rooms, map, { back: () => this._casoraLegacyChoose(src, rooms, unknown, o) });
      });
    };

    // Schritt 3: Name, dann bauen.
    P._casoraLegacyName = function (src, rooms, choices, o) {
      const s = this._flowScreen({
        icon: "import", title: "Import Your Dashboard",
        lede: "Your rooms and tiles will be copied to a new dashboard with a phone layout. "
          + "The original won't be changed.",
        back: o.back,
      });
      const base = (src.title || "Casora").trim();
      // Alle Titel in der Seitenleiste zählen – auch YAML-Dashboards wie das Original.
      const taken = new Set((this._dashList || []).map((d) => (d.title || "").trim())
        .concat(Object.values((this._hass && this._hass.panels) || {}).map((p) => (p.title || "").trim())));
      const dash = this._flowGroup(s.body, { header: "New Dashboard" });
      const titleIn = this._flowRow(dash, {
        title: "Name", input: freeName(base, taken, this._hass),
      }).input;
      this._flowCancel(s.acts);
      this._flowButton(s.acts, "Import", () => {
        const title = (titleIn.value || "").trim() || "Casora";
        this._casoraLegacyBuild(src, rooms, choices, this._flowPath(title, "casora-imported", "imported"), title);
      });
    };

    // opts.ownTpl: angepasste Vorlagen des Nutzers, die statt Casoras Fassung gelten (Umzugsassistent).
    P._casoraLegacyBuild = async function (src, legacyRooms, choices, url_path, title, opts) {
      const own = (opts && opts.ownTpl) || {};
      const I = window.__casoraPanelInternals;
      const s = this._flowScreen({ icon: "rooms", title: "Importing Your Dashboard", lede: "This only takes a moment.", closable: false });
      let created = null;
      const prog = this._flowProgress(s.body, ["Reading the card templates", "Building your rooms", "Saving " + title, "Adding the phone layout"]);
      try {
        const bundle = await this._bundleOnce();
        prog.at(1);
        const types = knownTypes();
        const kept = [];
        // Ohne eigenes Raumfoto: passendes Casora-Foto nach Raumname.
        const imgs = await this._images().catch(() => []);
        // Hemma 1 kam mit englischen Beispielnamen („Living Room“, „Front Door“) –
        // bekannte übersetzen, eigene Namen bleiben, wie sie sind.
        const tn = (n) => (typeof n === "string" && n && n.indexOf("[[[") < 0 && window.casoraI18n ? window.casoraI18n.t(n) : n);
        const rooms = legacyRooms.map((lr) => {
          // Foto nach dem Originalnamen suchen, gespeichert wird der übersetzte.
          // Die Übersicht behält ihren Standardnamen „Home“ – angezeigt in der HA-Sprache.
          const nm = I.storedRoomName ? I.storedRoomName(tn(lr.name), I.isHomeRoom(lr, legacyRooms)) : tn(lr.name);
          const room = I.blankRoom(nm, lr.path, lr.image || I.roomPhoto(lr.name, lr.path, imgs));
          const vars = Object.assign({}, lr.variables);
          delete vars.preload_rooms;
          // Hemmas Beispiel hatte temp_unit: 'F' – ohne Angabe folgt die Vorlage der Einheit von HA.
          delete vars.temp_unit;
          Object.assign(room.variables, vars);
          lr.tiles.forEach((t) => {
            const pick = choices && choices.get ? choices.get(t) : undefined;
            if (pick === "skip") return;
            const base = { type: "custom:button-card", entity: t.entity, name: tn(t.name) };
            if (Object.keys(t.variables).length) base.variables = I.clone(t.variables);
            if (pick === "custom") {
              kept.push(t.card);
              const card = I.clone(t.card);
              if (card.name) card.name = tn(card.name);
              room.tiles.push(I.wrapCustomCard(card));
              return;
            }
            if (pick && pick.indexOf("type:") === 0) {
              const ty = types.find((x) => x.id === pick.slice(5));
              if (ty) { base.template = I.clone(ty.template); room.tiles.push(base); return; }
            }
            base.template = I.clone(t.template);
            room.tiles.push(base);
          });
          return room;
        });
        if (!rooms.some((r) => r.path === "home")) rooms.unshift(I.blankRoom("Home", "home", I.roomPhoto("Home", "home", imgs)));
        const images = rooms.map((r) => r.variables.image);
        rooms.forEach((r) => { r.variables.preload_rooms = images.slice(); });
        if (I.applyFirstRun) I.applyFirstRun(rooms);

        const extras = {};
        extras[I.FINGERPRINT_KEY] = I.fingerprintOf(bundle.templates);
        // Szenen als Badge auf Home, nicht als Menü in der Leiste (wie neue Dashboards).
        I.sceneBadgeOn(rooms, true);
        const built = I.expandConfig({ rooms }, bundle.scaffold, extras, bundle.templates);
        const config = I.retargetRoutes(built, url_path, rooms).config;
        I.dropNavScenes(config);
        // Behaltene Hemma-1-Karten brauchen ihre alten Vorlagen, soweit Casora sie nicht hat.
        const oldTpl = (src.cfg && src.cfg.button_card_templates) || {};
        const legacyTpl = {};
        const need = (names) => [].concat(names || []).forEach((n) => {
          if (typeof n !== "string" || bundle.templates[n] || legacyTpl[n] || !oldTpl[n]) return;
          legacyTpl[n] = I.clone(oldTpl[n]);
          need(oldTpl[n].template);
        });
        kept.forEach((c) => JSON.stringify(c, (k, v) => { if (k === "template") need(v); return v; }));
        if (Object.keys(legacyTpl).length) config.button_card_templates = Object.assign({}, config.button_card_templates, legacyTpl);
        if (Object.keys(own).length) config.button_card_templates = Object.assign({}, config.button_card_templates, I.clone(own));
        // Wie beim ersten Speichern im Editor: Szenen-Auswahl, Bewegung, HA-Kopfleiste
        // (kiosk_mode) und „vom Panel verwaltet“ (Pillen-Navigation, ⋯-Menü, Uhrzeit).
        I.applyScenePick(config, rooms);
        I.applyMotion(config, rooms);
        I.applyKiosk(config, rooms);
        (config.views || []).forEach((v) => {
          const hero = (v.cards || [])[0];
          if (hero && hero.variables) hero.variables.casora_ui_managed = true;
        });
        prog.at(2);

        const made = await this._hass.callWS({ type: "lovelace/dashboards/create", url_path, title, icon: "mdi:home", show_in_sidebar: true, require_admin: false });
        created = made && made.id;
        await this._hass.callWS({ type: "lovelace/config/save", url_path, config });
        prog.at(3);

        let paired = false;
        if (bundle.mobile) {
          try {
            const st = I.mobileFromRooms(bundle.mobile, bundle.templates, rooms);
            const mx = Object.assign({}, I.clone(bundle.mobile.extras || {}));
            mx[I.FINGERPRINT_KEY] = I.fingerprintOf(bundle.templates);
            const mcfg = I.expandAny(st, { extras: mx, templates: bundle.templates });
            I.applyScenePick(mcfg, rooms);
            if (Object.keys(legacyTpl).length) mcfg.button_card_templates = Object.assign({}, mcfg.button_card_templates, legacyTpl);
            if (Object.keys(own).length) mcfg.button_card_templates = Object.assign({}, mcfg.button_card_templates, I.clone(own));
            I.applyMotion(mcfg, rooms);
            I.applyKiosk(mcfg, rooms);
            I.markPhoneManaged(mcfg);
            await this._hass.callWS({ type: "lovelace/dashboards/create", url_path: url_path + "-mobile", title: title + " Mobile", icon: "mdi:cellphone", show_in_sidebar: false, require_admin: false });
            await this._hass.callWS({ type: "lovelace/config/save", url_path: url_path + "-mobile", config: mcfg });
            paired = true;
          } catch (e) {
            this._log && this._log("phone layout not created: " + e.message, "warn");
          }
        }
        prog.at(4);
        await this._flowRelist();
        this._flowDone({ url_path, title, rooms, paired, fromYaml: true });
      } catch (e) {
        // Halb angelegtes Dashboard wieder entfernen, damit „nichts gespeichert“ stimmt.
        if (created) { try { await this._hass.callWS({ type: "lovelace/dashboards/delete", dashboard_id: created }); } catch (_) { /* bleibt stehen */ } }
        const fail = this._flowScreen({ icon: "alert", tone: "warn", title: "Dashboard Not Created", lede: "Nothing was saved. Check the name and address, then try again." });
        this._flowError(e.message);
        this._flowCancel(fail.acts);
      }
    };
  });
})();
