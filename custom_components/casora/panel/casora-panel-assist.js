// Geräte-Assistent für das Casora-Studio.
//
// „Ich habe ein neues Gerät – bau es ein“: Der Assistent sucht Geräte aus HAs
// Registry, die noch auf keiner Kachel des Dashboards stehen, ordnet sie über den
// HA-Bereich einem Raum zu und schlägt einen Kacheltyp vor (Domain, bei
// bekannten Geräten der translation_key – Drucker, Geschirrspüler …). Man kann
// je Gerät den Typ ändern oder es weglassen. Optional: ein Satz wie „Bau den
// Luftreiniger im Büro ein“ – mit KI (HA ai_task, falls eingerichtet), sonst
// über Namen von Gerät und Raum.
//
// Eingebaut wird wie im Editor von Hand: Kacheln kommen in den Raum, das
// Dashboard ist „geändert“, Rückgängig funktioniert, gespeichert wird mit Speichern.
(() => {
  if (window.casoraAssist) return;

  // Kacheltyp je Domain (Reihenfolge = Vorrang, wenn ein Gerät mehrere hat).
  const BY_DOMAIN = [
    ["climate", "thermostat"], ["vacuum", "vacuum"], ["alarm_control_panel", "casora_alarm"],
    ["lock", "lock"], ["cover", "cover"], ["media_player", "media"], ["camera", "casora_camera"],
    ["fan", "fan"], ["humidifier", "humidifier"], ["light", "light"],
  ];
  // Besondere Geräte über sprachunabhängige Schlüssel der Integration.
  // Für Gerätekacheln zählt der Zustand, nicht Energie- oder Leistungszähler.
  // Reihenfolge = Vorrang: erst der Gesamtzustand, eine Phase („aktuelle Phase“) nur zur Not.
  const STATE_LIKE = [/(^|_)(zustand|betriebszustand|operation_state|washer_state|dryer_state|state)$/i,
    /(^|_)status$/i, /(^|_)(program_phase|phase)$/i];
  // keys: translation_key der Integration, in dieser Reihenfolge (Hauptentität zuerst) –
  // Bambu print_status, Home Connect operation_state, WashData washer_state.
  // keyNeedsName: der Schlüssel allein reicht nicht (WashData nennt auch Trockner „washer_state“).
  // notName: Geräte mit diesem Namen sind etwas anderes (Home-Connect-Waschmaschine ≠ Geschirrspüler).
  const SPECIAL = [
    { type: "casora_3d_printer", keys: ["print_status", "stage"], domain: "sensor" },
    { type: "casora_dishwasher", keys: ["sensor_operation_state", "operation_state"], domain: "sensor", name: /dish|geschirr|spül/i,
      notName: /wasch|washer|washing|trockner|dryer|ofen|oven|backofen|k(ü|ue)hl|fridge|freezer|gefrier/i },
    { type: "@air_purifier", name: /luftrein|purifier|air ?clean/i, domain: "fan" },
    { type: "casora_washer", keys: ["washer_state", "sensor_operation_state", "operation_state"], keyNeedsName: true,
      name: /wasch(?!trockn)|washer|washing/i, domain: "sensor", prefer: STATE_LIKE },
    { type: "casora_dryer", keys: ["dryer_state", "washer_state", "sensor_operation_state", "operation_state"], keyNeedsName: true,
      name: /trockner|dryer/i, domain: "sensor", prefer: STATE_LIKE },
  ];
  // Erste Entität zum ersten passenden Muster (Liste = Vorrang).
  const firstBy = (list, tests, of) => { for (const t of tests) { const hit = list.find((e) => t(of(e))); if (hit) return hit; } return null; };

  function norm(s) {
    return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  }

  // Alle Entitäten, die im Dashboard schon vorkommen (Kacheln, Variablen, Listen).
  function usedEntities(rooms, hass) {
    const used = new Set();
    const states = hass.states || {};
    JSON.stringify(rooms, (k, v) => {
      if (typeof v === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(v) && states[v]) used.add(v);
      return v;
    });
    return used;
  }

  // Entitäten eines Geräts – über den Geräte-Finder (scripts/local/00-finden.js),
  // der im Panel aber nicht immer geladen ist; dann direkt aus der Registry.
  function devEntities(hass, id) {
    if (window.casoraDevice) return window.casoraDevice.entities(hass, id, { children: false });
    const R = hass.entities || {}, S = hass.states || {};
    return Object.keys(R).filter((eid) => R[eid] && R[eid].device_id === id && !R[eid].hidden).sort().map((eid) => ({
      entity_id: eid, key: R[eid].translation_key || null, domain: eid.split(".")[0],
      device_id: id, dc: ((S[eid] || {}).attributes || {}).device_class, category: R[eid].entity_category || null,
    }));
  }

  function devName(d) { return (d && (d.name_by_user || d.name)) || ""; }

  // Vorschläge: [{id, device, name, room, area, type, entity, reason}]
  function suggest(hass, rooms, types) {
    const D = hass.devices || {}, A = hass.areas || {};
    const used = usedEntities(rooms, hass);
    const typeIds = new Set(types.map((t) => t.id));
    // „@name“: Casora-Typ über das Etikett finden (ids sind in Casora nicht festgeschrieben).
    const alias = {};
    types.forEach((t) => { if (/air purifier/i.test(t.label)) alias["@air_purifier"] = t.id; });
    Object.keys(alias).forEach((k) => typeIds.add(k));
    const roomOfArea = (aid) => {
      const an = norm((A[aid] || {}).name);
      return an ? rooms.find((r) => norm(r.name) === an) || null : null;
    };
    const out = [];
    // Waschmaschine/Trockner über den gemeinsamen Finder (scripts/local/00-finden.js):
    // offizielle Hersteller-Integration vor WashData, je Bereich nur die beste Quelle.
    const LF = window.casoraLaundryFind;
    const laundry = new Map(LF ? LF.all(hass).map((c) => [c.device, c]) : []);
    Object.keys(D).forEach((id) => {
      const d = D[id];
      if (!d || d.entry_type === "service" || d.disabled_by || d.via_device_id) return;
      const list = devEntities(hass, id).filter((e) => !e.category && (hass.states || {})[e.entity_id]);
      if (!list.length || list.some((e) => used.has(e.entity_id))) return;
      // Dasselbe Wäschegerät über eine schwächere Quelle (WashData neben der Hersteller-Integration): weglassen.
      if (LF && !laundry.has(id) && LF.classify(hass, id)) return;
      let name = devName(d);
      let type = null, entity = null, reason = "";
      const lc = laundry.get(id);
      if (lc) {
        const t = lc.role === "dryer" ? "casora_dryer" : "casora_washer";
        if (typeIds.has(t)) { type = t; entity = lc.state; reason = "key"; }
      }
      for (const s of SPECIAL) {
        if (type) break;
        if (!typeIds.has(s.type)) continue;
        if (LF && (s.type === "casora_washer" || s.type === "casora_dryer")) continue;
        if (s.notName && s.notName.test(name)) continue;
        const named = !!(s.name && s.name.test(name));
        const inDomain = list.filter((e) => !s.domain || e.domain === s.domain);
        const byKey = s.keys && (!s.keyNeedsName || named)
          ? firstBy(inDomain, s.keys.map((k) => (x) => x === k), (e) => e.key) : null;
        // Nur über den Namen: bei Typen ohne Schlüssel, oder mit Vorrangliste für den Zustand.
        const same = !byKey && named && (!s.keys || s.prefer) ? inDomain : [];
        const byName = same.length ? ((s.prefer && firstBy(same, s.prefer.map((re) => (x) => re.test(x)), (e) => e.key || "")
          || s.prefer && firstBy(same, s.prefer.map((re) => (x) => re.test(x)), (e) => e.entity_id))
          || same.find((e) => !/energy|energie|power|leistung|verbrauch|kosten|cost/i.test(e.entity_id)) || same[0]) : null;
        const hit = byKey || byName;
        if (hit) { type = s.type; entity = hit.entity_id; reason = byKey ? "key" : "name"; break; }
      }
      // Saugroboter-Karten und Drucker-Kameras sind keine Überwachungskameras
      // (dieselbe Regel wie window._casoraCams in scripts/local/00-finden.js).
      const noCam = list.some((x) => x.domain === "vacuum" || /^(print_status|stage)$/.test(x.key || ""));
      const isCam = (x) => x.domain === "camera" && !noCam && !/(_map|karte)$/.test(x.entity_id);
      if (!type) {
        for (const [dom, t] of BY_DOMAIN) {
          const e = list.find((x) => x.domain === dom && (dom !== "camera" || isCam(x)));
          if (e && typeIds.has(t)) { type = t; entity = e.entity_id; reason = "domain"; break; }
        }
      }
      if (!type) return;
      if (alias[type]) type = alias[type];
      // Geräte, die nach ihrer Adresse heißen (z. B. „127_0_0_1“ bei Generic-Kameras):
      // lieber den Namen der Entität zeigen.
      if (/^[\d_.:\-]+$/.test(name) || /^(\d{1,3}[._]){3}\d{1,3}/.test(name)) {
        const fn = (((hass.states || {})[entity] || {}).attributes || {}).friendly_name;
        if (fn) name = fn;
      }
      const room = roomOfArea(d.area_id);
      // Dasselbe Gerät doppelt (z. B. Hersteller-Integration + WashData): nur einmal.
      // Bei Wäschegeräten gewinnt die bessere Quelle (Rang 0 = Hersteller, 1 = WashData).
      const rank = lc ? lc.rank : 9;
      const dup = out.findIndex((x) => x.type === type && norm(x.name) === norm(name) && x.area === ((A[d.area_id] || {}).name || null));
      if (dup >= 0 && !(out[dup].rank > rank)) return;
      if (dup >= 0) out.splice(dup, 1);
      out.push({ id, device: id, name, room: room ? room.name : null, area: (A[d.area_id] || {}).name || null, type, entity, reason, rank });
    });
    // Solar-Tipp und Raumklima kommen nicht von selbst dazu – nur über „Kachel hinzufügen“.
    // Räume in Dashboard-Reihenfolge, darin nach Name.
    const order = new Map(rooms.map((r, i) => [r.name, i]));
    out.sort((a, b) => (order.has(a.room) ? order.get(a.room) : 999) - (order.has(b.room) ? order.get(b.room) : 999)
      || a.name.localeCompare(b.name));
    return out;
  }

  // Alltagswörter je Kacheltyp – damit „Spülmaschine“ den Geschirrspüler findet.
  const SYNONYMS = {
    casora_dishwasher: ["spuelmaschine", "geschirrspueler", "spueler", "dishwasher"],
    casora_washer: ["waschmaschine", "waesche", "washer", "washing"],
    casora_dryer: ["trockner", "waeschetrockner", "dryer"],
    vacuum: ["sauger", "staubsauger", "saugroboter", "roboter", "wischer", "vacuum", "robot"],
    casora_3d_printer: ["drucker", "3d", "printer"],
    thermostat: ["heizung", "thermostat", "fussbodenheizung", "heizkoerper", "heating"],
    light: ["licht", "lampe", "leuchte", "light", "lamp"],
    cover: ["jalousie", "rollladen", "rollo", "markise", "blind", "shade"],
    lock: ["schloss", "tuerschloss", "lock"],
    media: ["fernseher", "tv", "lautsprecher", "homepod", "sonos", "speaker", "musik"],
    casora_camera: ["kamera", "camera", "klingel", "doorbell"],
    fan: ["ventilator", "fan"],
  };
  const PURIFIER = ["luftreiniger", "purifier", "luft"];
  // Füllwörter zählen nicht („den“ steckt sonst in „Fussbodenheizung“).
  const STOP = new Set(("der die das den dem des ein eine einen einem einer im in ins am an auf aus bei mit "
    + "und oder zu zum zur von vom fuer ich habe hab hat neu neue neuer neues bau baue bitte mal sie es er "
    + "da dort hier the a an to in on of and add new my please it put").split(" "));

  // Ohne KI: Wörter aus dem Satz mit Geräte- und Raumnamen abgleichen.
  function localMatch(text, items, rooms, types) {
    const words = norm(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
    if (!words.length) return null;
    const purifierId = ((types || []).find((t) => /air purifier/i.test(t.label)) || {}).id;
    const syn = (type) => (type === purifierId ? PURIFIER : SYNONYMS[type] || []);
    const score = (s) => words.filter((w) => w.length > 2 && norm(s).includes(w)).length;
    const typeScore = (type) => (words.some((w) => syn(type).some((x) => w.includes(x) || (x.length > 3 && x.includes(w) && w.length > 3))) ? 1 : 0);
    const room = rooms.map((r) => [r, score(r.name)]).filter((x) => x[1]).sort((a, b) => b[1] - a[1])[0];
    // Wörter, die den Raum nennen, zählen nicht für den Gerätenamen („Jalousie Küche“).
    const roomWords = room ? words.filter((w) => w.length > 2 && norm(room[0].name).includes(w)) : [];
    const nameScore = (s) => words.filter((w) => w.length > 2 && !roomWords.includes(w) && norm(s).includes(w)).length;
    const picks = items.map((it) => [it, nameScore(it.name) + typeScore(it.type)
        + (room && it.room === room[0].name ? 0.5 : 0) + (it.area ? score(it.area) * 0.1 : 0)])
      .filter((x) => x[1] >= 1).sort((a, b) => b[1] - a[1]);
    if (!picks.length) return null;
    const best = picks[0][1];
    return { ids: picks.filter((x) => x[1] >= best).map((x) => x[0].id), room: room ? room[0].name : null, via: "local" };
  }

  // Mit KI: HA ai_task (Einstellungen → KI-Aufgaben). Antwort als feste Struktur.
  async function aiMatch(hass, text, items, rooms, types) {
    const ents = Object.keys(hass.states || {}).filter((e) => e.startsWith("ai_task."));
    if (!ents.length) return null;
    const lines = items.map((it) => `${it.id} | ${it.name} | Raum: ${it.room || it.area || "-"} | Typ: ${it.type}`);
    const res = await hass.callWS({
      type: "execute_script",
      sequence: [{
        action: "ai_task.generate_data",
        data: {
          task_name: "Casora Geräte-Assistent",
          instructions: "Ein Nutzer richtet sein Home-Assistant-Dashboard ein und schreibt: \"" + text + "\"\n\n"
            + "Welche dieser Geräte meint er? Gib ihre IDs zurück. Nennt er einen Raum, gib ihn genau wie in der Raumliste zurück. "
            + "Nennt er eine Kachelart, gib die passende Typ-ID zurück.\n\nGeräte (ID | Name | Raum | Typ):\n" + lines.join("\n")
            + "\n\nRäume: " + rooms.map((r) => r.name).join(", ")
            + "\nTyp-IDs: " + types.map((t) => t.id + " (" + t.label + ")").join(", "),
          entity_id: ents[0],
          structure: {
            ids: { selector: { text: { multiple: true } }, description: "IDs der gemeinten Geräte" },
            room: { selector: { text: {} }, description: "Raum oder leer" },
            type: { selector: { text: {} }, description: "Typ-ID oder leer" },
          },
        },
        response_variable: "r",
      }, { stop: "done", response_variable: "r" }],
    });
    const data = (res && res.response && res.response.data) || {};
    const ids = [].concat(data.ids || []).map(String).filter((id) => items.some((it) => it.id === id));
    if (!ids.length) return null;
    const room = rooms.find((r) => norm(r.name) === norm(data.room)) ? rooms.find((r) => norm(r.name) === norm(data.room)).name : null;
    const type = types.some((t) => t.id === data.type) ? data.type : null;
    return { ids, room, type, via: "ai" };
  }

  // „Bau den Luftreiniger im Büro ein“ bei drei Luftreinigern im Haus: Die KI nennt
  // gern alle gleichartigen Geräte. Steht eins davon schon im genannten Raum, ist es gemeint;
  // sonst gehen Geräte ohne Raum vor.
  function narrowToRoom(ids, room, items) {
    if (!room || ids.length < 2) return ids;
    const of = (id) => items.find((x) => x.id === id) || {};
    const here = ids.filter((id) => of(id).room === room);
    if (here.length) return here;
    const free = ids.filter((id) => !of(id).room);
    return free.length ? free : ids;
  }

  window.casoraAssist = { suggest, localMatch, aiMatch, usedEntities, narrowToRoom };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._casoraAssist) return;

    // Welcher Badge-Bereich zu einem Kacheltyp gehört (für die Badges nach dem Einbauen).
    const BADGE_OF_TYPE = { light: "lights", thermostat: "climate", lock: "security", lock_group: "security",
      casora_camera: "security", camera: "security", media: "media" };

    P._casoraAssist = function (o) {
      o = o || {};
      const I = window.__casoraPanelInternals;
      const s0 = this._state;
      if (!s0 || !s0.compact) return;
      const rooms = s0.compact.rooms;
      const types = I.TILE_TYPES.filter((t) => !t.hidden);
      const all = suggest(this._hass, rooms, types);
      const picks = new Map(all.map((it) => [it.id, { on: !!it.room, room: it.room, type: it.type }]));
      let focus = null; // Ergebnis der Eingabe: nur diese Geräte zeigen

      if (!this.shadowRoot.getElementById("casora-assist-css")) {
        const st = document.createElement("style");
        st.id = "casora-assist-css";
        st.textContent = ".frow.casora-arow{flex-wrap:wrap;row-gap:8px}"
          + ".frow.casora-arow .rtext{flex:1 1 0;min-width:0}"
          + ".casora-sels{display:flex;gap:8px;flex:1 1 100%;min-width:0}"
          + ".casora-sels>.combo{flex:1 1 0;min-width:0;width:auto;max-width:none}"
          // Am Handy sind Felder sonst weiß wie die Karte, in der sie hier liegen.
          + ":host(.phone) .casora-sels>.combo>input{background:var(--casora-studio-field,rgba(118,118,128,0.12))}";
        this.shadowRoot.appendChild(st);
      }
      const s = this._flowScreen({
        icon: "rooms",
        title: "Device Assistant",
        lede: all.length
          ? "These devices aren't on your dashboard yet. Check where each one should go, or describe what you want to add."
          : "Every device with a matching tile is already on your dashboard.",
        back: o.back,
      });

      // Eingabe: „Bau den Luftreiniger im Büro ein“
      const ask = this._flowGroup(s.body, { header: "Describe it (optional)" });
      // Eingabefelder übersetzt der Panel-Übersetzer nicht – Platzhalter hier nach Sprache.
      const de = String((this._hass.locale && this._hass.locale.language) || this._hass.language || "").indexOf("de") === 0;
      const askRow = this._flowRow(ask, { title: "Request", input: "",
        placeholder: de ? "z. B. Bau den Luftreiniger im Büro ein" : "e.g. Add the air purifier to the office" });
      const askIn = askRow.input;
      const note = document.createElement("div");
      note.className = "ffoot casora-assist-note";
      ask.parentNode.appendChild(note);

      const listHost = document.createElement("div");
      s.body.appendChild(listHost);

      const roomNames = rooms.map((r) => r.name);
      // Anzeige: die Übersicht mit Standardnamen als „Zuhause“/„Home“ (HA-Sprache).
      const shownRoom = (n) => { const r = rooms.find((x) => x.name === n); return r ? I.roomLabel(r, rooms, this._hass) : n; };
      const render = () => {
        listHost.innerHTML = "";
        const shown = focus ? all.filter((it) => focus.includes(it.id)) : all;
        const groups = new Map();
        shown.forEach((it) => {
          const k = picks.get(it.id).room || "";
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(it);
        });
        [...groups.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : roomNames.indexOf(a) - roomNames.indexOf(b)))
          .forEach((k) => {
            const g = this._flowGroup(listHost, { header: k ? shownRoom(k) : "Not in a room yet" });
            if (k) g.parentNode.querySelector(".fhead").setAttribute("data-no-i18n", "");
            groups.get(k).forEach((it) => {
              const p = picks.get(it.id);
              const r = this._flowRow(g, {
                mask: I.iconUrl(I.roomGlyph(k || "Home")), tint: p.on ? I.FLOW_TINT.teal : I.FLOW_TINT.gray,
                title: it.name, sub: it.entity,
              });
              r.row.classList.add("wrap2", "casora-arow");
              const b = r.row.querySelector(".rtext > b");
              if (b) b.setAttribute("data-no-i18n", "");
              // Studio-Auswahlfelder (gleiche Fläche, Doppelpfeil, Studio-Menü) statt Browser-Selects.
              const roomLabels = { "": "Don't add" };
              roomNames.forEach((n) => { roomLabels[n] = shownRoom(n); });
              const roomSel = this._combo(p.on ? (p.room || "") : "", [""].concat(roomNames), "", (v) => {
                p.room = v || p.room; p.on = !!v; render();
              }, { fixed: true, labels: roomLabels });
              roomSel.input.setAttribute("data-no-i18n", "");
              const typeLabels = {};
              types.forEach((t) => { typeLabels[t.id] = t.label; });
              const typeSel = this._combo(p.type, types.map((t) => t.id), "", (v) => { if (v) p.type = v; },
                { fixed: true, labels: typeLabels });
              const sels = document.createElement("div");
              sels.className = "casora-sels";
              sels.appendChild(roomSel.wrap);
              sels.appendChild(typeSel.wrap);
              r.row.appendChild(sels);
            });
          });
        const n = [...picks.entries()].filter(([id, p]) => p.on && p.room && (!focus || focus.includes(id))).length;
        go.textContent = "Add " + n + (n === 1 ? " tile" : " tiles");
        go.disabled = !n;
      };

      this._flowCancel(s.acts);
      const go = this._flowButton(s.acts, "Add", () => {
        const byName = new Map(rooms.map((r) => [r.name, r]));
        const touched = new Map();
        let n = 0;
        all.forEach((it) => {
          const p = picks.get(it.id);
          if (!p.on || !p.room || (focus && !focus.includes(it.id))) return;
          const room = byName.get(p.room);
          const type = types.find((t) => t.id === p.type);
          if (!room || !type) return;
          const tile = { type: "custom:button-card", template: I.clone(type.template), entity: it.entity, name: it.name };
          room.tiles.push(tile);
          n++;
          if (!touched.has(room)) touched.set(room, new Set());
          const cat = BADGE_OF_TYPE[type.id];
          if (cat) touched.get(room).add(cat);
        });
        // Badges im Raum: passend zu den neuen Geräten (Licht → Beleuchtung …) aus seinem
        // HA-Bereich ergänzen; ein Raum ganz ohne Badges bekommt alle, die passen. Was schon
        // eingetragen oder ausgeschaltet ist, bleibt (window.casoraBasis.fillBadges).
        const B = window.casoraBasis;
        if (B && B.fillBadges) {
          const home = rooms[0];
          const bare = (V) => !Object.keys(V || {}).some((k) => /^(light_entity_\d+|light_group_entity|climate_entity_\d+|temp_sensor_\d+|humidity_sensor|security_|energy_power_entity|media_player_\d+)/.test(k) && V[k] != null && V[k] !== "");
          const targets = [...touched.keys()].filter((r) => r !== home && !I.isHomeRoom(r, rooms)).map((r) => {
            r.variables = r.variables || {};
            return { name: r.name, vars: r.variables, only: bare(r.variables) ? null : touched.get(r) };
          });
          try { B.fillBadges(this._hass, targets); } catch (e) { /* ohne Badges weiter */ }
        }
        this._exitFlow(true);
        this._markDirty();
        this._renderTabs();
        this._renderForm();
        this._syncPreview();
        // Bestätigt ist bestätigt: gleich speichern, sonst gehen die Kacheln beim
        // Verlassen verloren – das übersieht man als neuer Nutzer leicht.
        (async () => {
          let ok = false;
          try { ok = await this._save(); } catch (e) { ok = false; }
          this._status(ok ? (n === 1 ? "1 tile added and saved" : n + " tiles added and saved")
            : (n === 1 ? "1 tile added – save to keep it" : n + " tiles added – save to keep them"), ok ? "ok" : "err");
        })();
      }) || s.acts.lastElementChild;

      const run = async () => {
        const text = (askIn.value || "").trim();
        if (!text) { focus = null; note.textContent = ""; render(); return; }
        note.textContent = "Thinking…";
        let m = null;
        try { m = await aiMatch(this._hass, text, all, rooms, types); } catch (e) { m = null; }
        if (!m) m = localMatch(text, all, rooms, types);
        if (!m) { focus = null; note.textContent = "No matching device found."; render(); return; }
        m.ids = narrowToRoom(m.ids, m.room, all);
        focus = m.ids;
        m.ids.forEach((id) => {
          const p = picks.get(id);
          p.on = true;
          if (m.room) p.room = m.room;
          if (m.type) p.type = m.type;
          if (!p.room) p.on = false;
        });
        note.textContent = m.via === "ai" ? "Suggested by AI" : "Matched by name";
        render();
      };
      askIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); run(); } });
      askIn.addEventListener("change", run);
      render();
      if (o.text) { askIn.value = o.text; run(); }
    };
  });
})();

// Nach „Dashboard erstellen“: Geräte einbauen als Nebenweg auf dem Fertig-Bildschirm –
// kein zweiter Assistent, der sich vordrängt. Hat „Räume füllen“ die Geräte schon
// verteilt, heißt er „Weitere Geräte einbauen“. Hauptknopf bleibt „Dashboard öffnen“.
customElements.whenDefined("casora-panel").then(() => {
  const P = customElements.get("casora-panel").prototype;
  if (P.__casoraAssistDone) return;
  P.__casoraAssistDone = true;
  const orig = P._flowDone;
  P._flowDone = function (opts) {
    orig.call(this, opts);
    if (!opts || opts.fromYaml || !this._fx || !this._fx.foot) return;
    // Die Leiste stapelt von unten: ganz unten, unter „Bearbeiten“.
    const b = this._flowButton(this._fx.foot, opts.filled ? "Add More Devices" : "Add Devices", () => this._flowLeave(() => {
      this._remember(opts.url_path);
      this._routeUsed = true; this._room = 0;
      this._refreshDashboards(opts.url_path);
      // Warten, bis der Editor das neue Dashboard geladen hat.
      const t0 = Date.now();
      const wait = () => {
        if (this._dashUrl === opts.url_path && this._state && this._state.compact && !this._flowMode) return this._casoraAssist();
        if (Date.now() - t0 < 15000) setTimeout(wait, 250);
      };
      setTimeout(wait, 400);
    }), true);
    this._fx.foot.insertBefore(b, this._fx.foot.firstChild);
  };
});
