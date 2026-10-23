// Standardraum („Basis“) für „Neu beginnen“ (29.09.2026)
//
// Nach der Raumwahl füllt Casora die Räume selbst: Geräte kommen über ihren
// HA-Bereich in den passenden Raum (wie beim Geräte-Assistenten), in einer festen
// Reihenfolge (Licht → Heizung → Luft → Jalousien → Medien → Geräte → Rest). Ab
// zwei Lichtern, Jalousien oder Schlössern in einem Raum wird daraus eine Kachel.
// Status-LEDs von Routern und Kameras bleiben draußen. Home bekommt die Favoriten
// (Schlösser, Beleuchtung, Jalousien). Optional verfeinert eine KI Zuordnung und
// Namen. Vor dem Anlegen zeigt eine Vorschau alles; jede Kachel lässt sich abwählen.
// Die Regeln (Reihenfolge, ab wann gruppiert wird, was draußen bleibt) stellt man im
// Studio unter „Persönliches → Standardraum“ ein (casora/settings, Bereich „basis“).
(() => {
  if (window.casoraBasis) return;
  const I = () => window.__casoraPanelInternals;
  const tr = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const norm = (s) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

  // Voreinstellung der Basis; eigene Werte kommen aus den Casora-Einstellungen.
  const DEFAULTS = {
    order: ["light", "thermostat", "air_purifier", "fan", "humidifier", "cover", "media",
      "casora_dishwasher", "casora_washer", "casora_dryer", "casora_3d_printer",
      "vacuum", "casora_camera", "lock", "casora_alarm"],
    group_min: 2,
    skip_leds: true,
    favorites: true,
  };
  async function rules(hass) {
    try {
      const b = ((await hass.callWS({ type: "casora/settings/get" })).settings || {}).basis || {};
      return Object.assign({}, DEFAULTS, b, { order: Array.isArray(b.order) && b.order.length ? b.order : DEFAULTS.order });
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }

  // Status-LEDs (Router, Access Point, Kamera): Licht-Entitäten, die auf „_led“ enden.
  // „…_led_light“ (z. B. eine Aquarienleuchte) ist ein echtes Licht und bleibt.
  const NOISE = /(^|_)status_led$|_led$/;

  // Namen ohne den Raum („Jalousie Küche“ in der Küche → „Jalousie“).
  function shortName(name, room) {
    const words = String(room || "").split(/\s+/).filter(Boolean);
    let out = String(name || "");
    words.forEach((w) => { out = out.replace(new RegExp("(^|[\\s·–-])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[\\s·–-])", "i"), " "); });
    out = out.replace(/\s{2,}/g, " ").replace(/^[\s·–-]+|[\s·–-]+$/g, "").trim();
    return out || name;
  }

  function areaOf(hass, eid) {
    const R = hass.entities || {}, D = hass.devices || {};
    const e = R[eid];
    if (!e) return null;
    return e.area_id || ((D[e.device_id] || {}).area_id) || null;
  }

  // Öffnungen: Kontakt, Kippsensor und Kombi-Sensor derselben Tür/desselben Fensters
  // gehören zusammen (30.09.2026). Dieselbe Regel wie window.casoraOpenings in
  // scripts/local/00-finder.js (dort ausführlich beschrieben) – beide prüft
  // dev/unit/oeffnungen.mjs gegeneinander.
  const OPEN_STOP = /^(kontaktsensor|kontakt|contact|sensor|binary|state|status|zustand|open|offen|opening|oeffnung|ofnung)$|kipp|tilt|kombi|combined|combo/;
  const openAttrs = (hass, id) => ((((hass || {}).states || {})[id]) || {}).attributes || {};
  const openLabel = (hass, id) => id + " " + (openAttrs(hass, id).friendly_name || "");
  const isCombo = (hass, id) => Object.prototype.hasOwnProperty.call(openAttrs(hass, id), "tilt") || /kombi|combined/i.test(openLabel(hass, id));
  const isTiltSensor = (hass, id) => !isCombo(hass, id) && /kipp|tilt/i.test(openLabel(hass, id));
  const openTokens = (s) => String(s || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !/^\d+$/.test(w) && !OPEN_STOP.test(w));
  function openings(hass, ids) {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
    const CONTACT = ["door", "window", "garage_door", "opening", ""];
    const list = [];
    [].concat(ids || []).forEach((id) => {
      if (typeof id !== "string" || !id.startsWith("binary_sensor.") || list.includes(id)) return;
      if (!CONTACT.includes(String(openAttrs(hass, id).device_class || "")) && !isCombo(hass, id) && !isTiltSensor(hass, id)) return;
      list.push(id);
    });
    const devOf = (id) => (R[id] && R[id].device_id) || null;
    const areaOf2 = (id) => { const e = R[id]; return e ? (e.area_id || ((D[e.device_id] || {}).area_id) || null) : null; };
    const sub = (a, b) => a.length > 0 && a.every((x) => b.includes(x));
    const sameBase = (a, b) => sub(a, b) || sub(b, a);
    const same = (x, y) => {
      if (devOf(x) && devOf(x) === devOf(y)) return true;
      const ax = areaOf2(x), ay = areaOf2(y);
      if (ax && ay && ax !== ay) return false;
      return sameBase(openTokens(x.split(".")[1]), openTokens(y.split(".")[1]))
        || sameBase(openTokens(openAttrs(hass, x).friendly_name), openTokens(openAttrs(hass, y).friendly_name));
    };
    const used = {}, units = [];
    list.forEach((t) => {
      if (!isTiltSensor(hass, t)) return;
      const c = list.filter((x) => !used[x] && x !== t && !isCombo(hass, x) && !isTiltSensor(hass, x) && same(t, x))[0];
      const u = { main: c || t, tilt: t, ids: c ? [c, t] : [t], combo: false };
      u.ids.forEach((x) => { used[x] = true; });
      units.push(u);
    });
    list.forEach((x) => {
      if (used[x] || isCombo(hass, x)) return;
      used[x] = true;
      units.push({ main: x, tilt: null, ids: [x], combo: false });
    });
    list.filter((k) => isCombo(hass, k)).forEach((k) => {
      const mine = units.filter((u) => !u.combo && u.ids.some((x) => same(k, x)));
      let all = [k];
      mine.forEach((u) => { all = all.concat(u.ids); units.splice(units.indexOf(u), 1); });
      units.push({ main: k, tilt: null, ids: all, combo: true });
    });
    const st = (id) => String((S[id] || {}).state || "").toLowerCase();
    const on = (s) => s === "on" || s === "open" || s === "opening";
    units.forEach((u) => {
      const m = st(u.main), a = openAttrs(hass, u.main);
      if (u.tilt && u.tilt !== u.main && on(st(u.tilt))) u.state = "tilted";
      else if (!m || m === "unavailable" || m === "unknown") u.state = "dead";
      else if (!on(m)) u.state = "closed";
      else u.state = (a.tilt === true || a.tilt === "true" || u.tilt === u.main) ? "tilted" : "open";
      let dc = String(a.device_class || "");
      if (!dc) u.ids.some((x) => { dc = String(openAttrs(hass, x).device_class || ""); return !!dc; });
      const names = u.ids.map((x) => openLabel(hass, x)).join(" ");
      u.kind = dc === "window" || (dc !== "door" && dc !== "garage_door" && /fenster|window/i.test(names)) ? "window" : "door";
    });
    const pos = (u) => Math.min(...u.ids.map((x) => { const i = list.indexOf(x); return i < 0 ? 1e9 : i; }));
    return units.sort((a, b) => pos(a) - pos(b));
  }

  // Gruppen aus HA (Helfer „Gruppe“, Hue-Raum …): Mitglieder einer Entität, rekursiv.
  const membersOf = (hass, id) => [].concat((((hass.states || {})[id] || {}).attributes || {}).entity_id || []).filter((x) => typeof x === "string");
  function deepMembers(hass, id, seen) {
    seen = seen || new Set();
    if (seen.has(id)) return [];
    seen.add(id);
    const m = membersOf(hass, id);
    return m.length ? [].concat(...m.map((x) => [x].concat(deepMembers(hass, x, seen)))) : [];
  }
  // Die kleinste HA-Gruppe einer Domain, die alle ids enthält – dann zählt die Kachel über HA.
  // exact: nur eine Gruppe ohne fremde Geräte – sonst wurde z. B. „alle Lampen“ des Hauses zur
  // Beleuchtung eines Raums, sobald dort zwei Lichter stehen (Nutzertest 7: „1 von 8 Räumen an“).
  function groupFor(hass, ids, domain, exact) {
    domain = domain || String(ids[0] || "").split(".")[0];
    const mine = new Set([].concat(...ids.map((x) => [x].concat(deepMembers(hass, x)))));
    const hit = Object.keys(hass.states || {}).filter((id) => id.startsWith(domain + ".") && membersOf(hass, id).length)
      .map((id) => ({ id, all: new Set(deepMembers(hass, id).concat(id)) }))
      // Verglichen werden nur echte Geräte: eine Untergruppe ohne Bereich („Spiegel“ in „Bad“) ist nicht fremd.
      .filter((g) => ids.every((x) => g.all.has(x)) && (!exact || [...g.all].every((x) => x === g.id || mine.has(x) || membersOf(hass, x).length)))
      .sort((a, b) => a.all.size - b.all.size)[0];
    return hit ? hit.id : null;
  }
  // Nur die obersten: was schon in einer anderen Gruppe der Liste steckt, fällt weg.
  function topUnits(hass, ids) {
    const inner = new Set([].concat(...ids.map((id) => deepMembers(hass, id))));
    return [...new Set(ids)].filter((id) => !inner.has(id));
  }

  function typeById(id) { return (I().TILE_TYPES || []).find((t) => t.id === id) || null; }
  function tile(type, entity, name, variables) {
    const t = typeById(type);
    const out = { type: "custom:button-card", template: I().clone(t ? t.template : type), entity, name };
    if (variables) out.variables = variables;
    return out;
  }
  // Several devices of one kind → one tile (like Casora's own group tiles).
  // wide: the overview (all rooms) – there the whole house's group may hold more, and the light tile is
  // marked as the house's (house: true): its popup is "Beleuchtung", not the room of its first light (#30).
  function groupTile(kind, ids, name, room, hass, wide) {
    if (kind === "light") {
      const g = ids.length === 1 ? ids[0] : groupFor(hass, ids, "light", !wide);
      const house = wide && ids.length > 1 ? { house: true } : null;
      if (g) return tile("light", g, name, house);
      return tile("light", ids[0], name, Object.assign({ lights: ids.slice(), active_entities: ids.slice() }, house));
    }
    if (kind === "cover") return tile("cover_group", groupFor(hass, ids, "cover", !wide) || ids[0], name, { room_name: room, covers: ids.slice() });
    if (kind === "lock") return tile("lock_group", ids[0], name, { room_name: room, locks: ids.slice() });
    return null;
  }
  const GROUP_NAME = { light: "Lights", cover: "Blinds", lock: "Locks" };

  // Der Plan: {rooms: [{name, items: [{key, on, label, sub, tile}]}], loose: [...]}.
  // key = stabile Kennung für die Vorschau (Gerät oder Gruppe).
  function plan(hass, roomNames, r) {
    const types = (I().TILE_TYPES || []).filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(hass)));
    const rooms = [{ name: "Home", tiles: [] }].concat(roomNames.map((name) => ({ name, tiles: [] })));
    let items = window.casoraAssist ? window.casoraAssist.suggest(hass, rooms, types) : [];
    if (r.skip_leds) items = items.filter((it) => !(it.type === "light" && NOISE.test(String(it.entity).split(".")[1] || "")));
    const rank = (type) => { const i = r.order.indexOf(type); return i < 0 ? r.order.length : i; };
    const out = rooms.map((room) => ({ name: room.name, items: [] }));
    const byName = new Map(out.map((x) => [x.name, x]));
    const loose = [];
    items.forEach((it) => {
      if (!it.room) { loose.push(it); return; }
      const room = byName.get(it.room);
      if (room) room.items.push({ key: it.id, type: it.type, entity: it.entity, name: it.name, on: true });
    });
    const tr2 = (s) => tr(s);
    // Entitäten ohne Gerät (Gruppen-Helfer, Hue-Räume): über ihren Bereich oder – ohne
    // Bereich – über den Namen („Küche“ ist die Lichtgruppe der Küche).
    const R = hass.entities || {}, A = hass.areas || {}, S = hass.states || {};
    const usedIds = new Set(items.map((it) => it.entity));
    const orphans = [];
    const areaName = (id) => { const aid = areaOf(hass, id); return aid && A[aid] ? A[aid].name : null; };
    Object.keys(S).forEach((id) => {
      const dom = id.split(".")[0];
      if (!["light", "cover"].includes(dom) || usedIds.has(id)) return;
      const e = R[id];
      if (!e || e.device_id || e.hidden || e.entity_category || e.disabled_by) return;
      const fn = (S[id].attributes || {}).friendly_name || "";
      const room = out.slice(1).find((x) => norm(x.name) === norm(areaName(id)))
        || (!areaName(id) && membersOf(hass, id).length ? out.slice(1).find((x) => norm(x.name) === norm(fn)) : null);
      if (room) room.items.push({ key: id, type: dom, entity: id, name: fn || id, on: true });
      else if (!areaName(id) && membersOf(hass, id).length) orphans.push({ id, device: null, name: fn || id, room: null, area: null, type: dom, entity: id, reason: "group" });
    });
    // Gruppen ohne Raum: nur die, deren Mitglieder noch nirgends stecken – „alle Lampen“ bleibt draußen.
    const placed = new Set([].concat(...out.map((room) => room.items.map((x) => x.entity))));
    orphans.forEach((g) => { if (!deepMembers(hass, g.entity).some((m) => placed.has(m))) loose.push(g); });
    // Die Übersicht ist der erste Eintrag (nicht der Name „Home“ – ein HA-Bereich kann so heißen).
    const overview = out[0];
    out.forEach((room) => {
      // Lichter: nur die obersten Einheiten (eine Gruppe ersetzt ihre Mitglieder).
      const lights = room.items.filter((x) => x.type === "light");
      if (lights.length > 1) {
        const top = new Set(topUnits(hass, lights.map((x) => x.entity)));
        room.items = room.items.filter((x) => x.type !== "light" || top.has(x.entity));
      }
      // Eine Lichtgruppe allein ist die Beleuchtung des Raums.
      const one = room.items.filter((x) => x.type === "light");
      if (room !== overview && one.length === 1 && membersOf(hass, one[0].entity).length) one[0].name = tr2("Lights");
      // Gruppieren: ab group_min Geräten einer Art eine Kachel.
      ["light", "cover", "lock"].forEach((kind) => {
        const same = room.items.filter((x) => x.type === kind);
        if (same.length < r.group_min) return;
        const ids = same.map((x) => x.entity);
        const t = groupTile(kind, ids, tr2(GROUP_NAME[kind]), room.name, hass, room === overview);
        room.items = room.items.filter((x) => x.type !== kind);
        room.items.push({ key: "group:" + kind + ":" + room.name, type: kind, group: ids, name: tr2(GROUP_NAME[kind]), tile: t, on: true });
      });
      // Heißt ein Gerät wie sein Raum („Büro“ im Büro), sagt der Typ mehr als der Name.
      const PLAIN = { thermostat: "Room heating", light: "Lights", cover: "Blind", media: "Media", air_purifier: "Air purifier", casora_camera: "Camera" };
      const nameIn = (x) => {
        if (room === overview) return x.name;
        const n = shortName(x.name, room.name);
        return norm(n) === norm(room.name) && PLAIN[x.type] ? tr2(PLAIN[x.type]) : n;
      };
      room.items.forEach((x) => {
        if (!x.tile) x.tile = tile(x.type, x.entity, nameIn(x));
        x.label = x.tile.name;
      });
      room.items.sort((a, b) => rank(a.type) - rank(b.type) || String(a.label).localeCompare(String(b.label)));
    });
    // Favoriten auf Home: Schlösser, Beleuchtung, Jalousien – über alle Räume.
    if (r.favorites) {
      const home = out[0];
      const all = (kind) => topUnits(hass, [].concat(...out.slice(1).map((room) => [].concat(...room.items
        .filter((x) => x.type === kind && x.on).map((x) => x.group || [x.entity])))));
      const fav = [];
      [["lock", "Locks", "Lock"], ["light", "Lights", "Lights"], ["cover", "Blinds", "Blind"]].forEach(([kind, many, single]) => {
        const ids = [...new Set(all(kind))];
        if (!ids.length) return;
        const name = ids.length === 1 ? single : many;
        const t = ids.length === 1 ? tile(kind, ids[0], tr2(name)) : groupTile(kind, ids, tr2(name), tr2("Home"), hass, true);
        fav.push({ key: "fav:" + kind, type: kind, group: ids, name: tr2(name), tile: t, label: tr2(name), on: true, fav: true });
      });
      home.items = fav.concat(home.items);
    }
    // Tür- und Fensterkontakte je Raum (für das Sicherheits-Badge), Klima ohne Raum für Home.
    // Fenster und Tore immer; Türkontakte nur, wenn sie nach Tür klingen (manche Sensoren
    // melden sich als „Tür“, sitzen aber am Stuhl). Geräte mit vielen Entitäten sind
    // Haushaltsgeräte (Geschirrspüler-Tür) und zählen nicht.
    const D = hass.devices || {};
    const devSize = {};
    Object.values(R).forEach((x) => { if (x && x.device_id) devSize[x.device_id] = (devSize[x.device_id] || 0) + 1; });
    const DOORISH = /t(ü|ue|u)r|door|(^|[\s_.-])tor(\b|_)|garagentor|hoftor|gartentor|gate|eingang|pforte/i;
    const contactIds = Object.keys(S).filter((id) => {
      if (!id.startsWith("binary_sensor.")) return false;
      const e = R[id];
      if (!e || e.hidden || e.entity_category || e.disabled_by) return false;
      const a = (S[id] || {}).attributes || {};
      if (Array.isArray(a.entity_id)) return false;
      const dc = a.device_class;
      // Kombi-Sensoren (Vorlage aus Kontakt + Kippsensor) haben oft keine Geräteklasse.
      if (!["door", "window", "garage_door"].includes(dc) && !(isCombo(hass, id) && (!dc || dc === "opening"))) return false;
      if (e.device_id && devSize[e.device_id] > 10) return false;
      const dev = D[e.device_id] || {};
      const label = [id, a.friendly_name, dev.name_by_user, dev.name].join(" ");
      return !(dc === "door" && !DOORISH.test(label));
    });
    // Kontakt + Kippsensor derselben Tür: gibt es einen Kombi-Sensor, nur ihn eintragen,
    // sonst beide (das Badge zählt sie als eine Öffnung). Ein Kombi-Sensor ohne Bereich
    // gehört in den Raum seiner Einzelsensoren.
    openings(hass, contactIds).forEach((u) => {
      const ids = u.combo ? [u.main] : u.ids;
      const area = [u.main].concat(u.ids).map(areaName).find(Boolean);
      const room = out.slice(1).find((x) => norm(x.name) === norm(area));
      if (room) (room.contacts = room.contacts || []).push(...ids);
    });
    const houseClimate = loose.filter((it) => it.type === "thermostat" && !it.area).map((it) => it.entity);
    // Room temperature and humidity for the climate badge. Plant sensors (a device with soil
    // moisture), water, appliances and outdoors do not count.
    const plantDev = new Set(Object.keys(S).filter((id) => ((S[id].attributes || {}).device_class === "moisture")).map((id) => (R[id] || {}).device_id).filter(Boolean));
    const NOT_ROOM = /boden|soil|wasser|water|aquarium|pool|nozzle|d(ü|ue)se|bett|bed|cpu|chip|akku|batter|k(ü|ue)hl|fridge|gefrier|freezer|ofen|oven|au(ß|ss)en|outdoor|drucker|printer|ger(ä|ae)t/i;
    const numeric = (id) => Number.isFinite(parseFloat((S[id] || {}).state));
    const pickSensor = (dc, room) => Object.keys(S).find((id) => {
      if (!id.startsWith("sensor.") || ((S[id].attributes || {}).device_class) !== dc || !numeric(id)) return false;
      const e = R[id];
      if (!e || e.hidden || e.entity_category || e.disabled_by || plantDev.has(e.device_id)) return false;
      const dev = (D[e.device_id] || {});
      if (NOT_ROOM.test([id, (S[id].attributes || {}).friendly_name, dev.name_by_user, dev.name].join(" "))) return false;
      return room ? norm(areaName(id)) === norm(room.name) : true;
    }) || null;
    // A power sensor for the whole room: without a device (helper), at a device named like the
    // room, or „Gesamt“/„Raumverbrauch“ in its name. Never the plug of the TV or the solar system.
    const ROOM_POWER = /gesamt|total|summe|raum.?(leistung|verbrauch)|room.?(power|consumption)|zimmer.?(leistung|verbrauch)/i;
    const NOT_ROOM_POWER = /solar|pv\d?\b|akku|batter|einspeis|netz|grid|smart.?meter|phase/i;
    // Watts, but no electricity from the room: rider power on an e-bike, fitness equipment.
    const NOT_ELECTRIC = /rider|fahrer|trett?leistung|cadence|trittfrequenz|drive.?unit|watt.?bike|ergometer/i;
    const pickPowerWhole = (room) => Object.keys(S).find((id) => {
      if (!id.startsWith("sensor.") || ((S[id].attributes || {}).device_class) !== "power" || !numeric(id)) return false;
      const e = R[id];
      if (!e || e.hidden || e.entity_category || e.disabled_by || norm(areaName(id)) !== norm(room.name)) return false;
      const dev = D[e.device_id] || {};
      const label = [id, (S[id].attributes || {}).friendly_name].join(" ");
      // A house meter in the room (houseMeter: grid, house, a meter's total) measures the house, not the room.
      if (NOT_ROOM.test(label) || NOT_ROOM_POWER.test(label) || houseMeter(hass, id)) return false;
      return !e.device_id || norm(dev.name_by_user || dev.name) === norm(room.name) || ROOM_POWER.test(label);
    }) || null;
    // 03.10.2026: energy badge in every room where power is measured, also through a plug or a
    // device, also while it reports 0 W. A sensor for the whole room comes first; else the first
    // power sensor in the area (W/kW or device class power), never solar, battery or grid/meter
    // (those belong to the house).
    const isPower = (id) => {
      const a = (S[id] || {}).attributes || {};
      return a.device_class === "power" || /^(m|k|M)?W$/.test(String(a.unit_of_measurement || ""));
    };
    const measuring = (id) => numeric(id) || ["unavailable", "unknown"].includes(String((S[id] || {}).state));
    // 04.10.2026: all power sensors in the area (plugs, devices). Without a sensor for the whole
    // room the badge shows their sum (energy_entities), the popup each one.
    // 06.10.2026: powercalc sensors without an area of their own (no device) belong to the room of
    // their source (attribute source_entity), e.g. the own consumption of a Shelly.
    const powerArea = (id) => {
      const a = areaName(id);
      if (a || (R[id] || {}).platform !== "powercalc") return a;
      const src = ((S[id] || {}).attributes || {}).source_entity;
      return src && src !== id ? areaName(src) : null;
    };
    const pickPowerAll = (room) => Object.keys(S).sort().filter((id) => {
      if (!id.startsWith("sensor.") || !isPower(id) || !measuring(id)) return false;
      const e = R[id];
      if (!e || e.hidden || e.entity_category || e.disabled_by || norm(powerArea(id)) !== norm(room.name)) return false;
      const dev = D[e.device_id] || {};
      const label = [id, (S[id].attributes || {}).friendly_name, dev.name_by_user, dev.name].join(" ");
      return !NOT_ROOM_POWER.test(label) && !NOT_ELECTRIC.test(label) && !houseMeter(hass, id);
    });
    const POWER_STAT = /mittel|durchschnitt|average|\bavg|_avg|mean|maxim|minim|(^|[_\s.])(max|min)([_\s]|$)|peak|spitze/i;
    const DEVICE_TOTAL = /device.?power|total.?power|power.?total|ger(ä|ae)t.?(leistung|gesamt)|gesamt.?leistung/i;
    const CHANNEL = /(?:^|[_\s.])(?:switch|channel|kanal|relay|relais|outlet|socket|output|ausgang|ch|plug|steckdose|l)[ _-]?(\d+)(?=_|$)/gi;
    const chanOf = (id) => { const m = [...id.replace(/^sensor\./, "").matchAll(CHANNEL)]; return m.length ? m[m.length - 1][1] : null; };
    const labelOf = (id) => id + " " + ((S[id] || {}).attributes || {}).friendly_name;
    const perDevice = (ids) => {
      if (ids.length < 2) return ids;
      const base = ids.filter((id) => !POWER_STAT.test(labelOf(id)));
      const c = base.length ? base : ids;
      const total = c.find((id) => DEVICE_TOTAL.test(labelOf(id)));
      if (total) return [total];
      const chans = c.filter((id) => chanOf(id) != null);
      const nums = new Set(chans.map(chanOf));
      if (chans.length > 1 && nums.size === chans.length) return chans;
      return [c[0]];
    };
    out.slice(1).forEach((room) => {
      room.temp = pickSensor("temperature", room); room.hum = pickSensor("humidity", room);
      // A sensor for the whole room comes first; else the devices as a list (sum).
      const whole = pickPowerWhole(room);
      // Per device: a device total (e.g. *_device_power) alone; else all channels (switch_0,
      // switch_1 …); else one sensor. „Leistung Durchschnitt“ and the like never count twice.
      // 06.10.2026: devices by device_id, never by name: two spots with the same name are two
      // consumers. The own consumption from powercalc (platform powercalc, e.g. *_device_power at
      // the Shelly) measures something else than the load channel and counts on top.
      const groups = new Map(), extra = [];
      const all0 = whole ? [] : pickPowerAll(room);
      all0.forEach((id) => {
        const e = R[id] || {};
        if (e.platform === "powercalc") { extra.push(id); return; }
        const key = e.device_id || "\u0000" + id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(id);
      });
      const all = [];
      groups.forEach((ids) => all.push(...perDevice(ids)));
      extra.forEach((id) => { if (!all.includes(id)) all.push(id); });
      // Up to 1.0.11 (devices with the same name as one, one sensor per device): only to recognize
      // lists entered automatically that nobody has changed since.
      const old = new Map();
      all0.forEach((id) => {
        const d = (R[id] || {}).device_id;
        const dv = d ? (D[d] || {}) : {};
        const key = d ? (norm(dv.name_by_user || dv.name || "") || d) : "\u0000" + id;
        if (!old.has(key)) old.set(key, []);
        old.get(key).push(id);
      });
      const oldAll = [];
      old.forEach((ids) => oldAll.push(...perDevice(ids)));
      room.power = whole || null;
      room.powers = whole ? [] : all.slice(0, 12);
      room.powersOld = whole ? [whole] : oldAll.slice(0, 12);
      room.powersAny = all0;
    });
    const INDOOR = /innen|indoor|durchschnitt|average|mittel|wohnung|zuhause|haus/i;
    const houseSensor = (dc) => Object.keys(S).find((id) => id.startsWith("sensor.") && ((S[id].attributes || {}).device_class) === dc
      && numeric(id) && INDOOR.test(id + " " + ((S[id].attributes || {}).friendly_name || "")) && !NOT_ROOM.test(id)) || null;
    return { rooms: out, loose, houseClimate, houseTemp: houseSensor("temperature"), houseHum: houseSensor("humidity"),
      housePower: housePower(hass) };
  }

  // House consumption for the energy badge on Home, in this order: what the house draws, then
  // totals, last the grid/meter (it shows 0 W on solar surplus). Same rule as
  // window._casoraHousePower in scripts/local/01-basis.js; dev/unit/house_power.mjs checks both.
  // #44: a "total" of a device, in an area or named after one ("Wohnzimmer Gesamt") is that
  // device's or room's total, never the house.
  const HOUSE_POWER = [/hausbedarf|hausverbrauch|haus.?leistung|house.?(power|consumption)|home.?(power|consumption)/i,
    /gesamt|total/i, /netzbezug|grid|smart.?meter|stromz(ä|ae|a)hler/i];
  // #44 (Westerloer): a peak, average or period value is no live house consumption ("Netzbezugs-Spitze heute",
  // "Grundlast", "Überschuss letzte Stunde" of a PV statistics integration).
  const NOT_LIVE = /spitze|peak|maxim|minim|(^|[_\s.])(max|min)([_\s.]|$)|mittel|durchschnitt|average|\bavg|_avg|mean|heute|today|gestern|yesterday|stunde|hour|woche|week|monat|month|jahr|year|grundlast|base.?load|prognose|forecast|vorhersage|(ü|ue)berschuss|surplus/i;
  const HOUSE_AREA = /^(haus|house|home|zuhause|wohnung)$/;
  const houseLabel = (S, id) => id + " " + (((S[id] || {}).attributes || {}).friendly_name || "");
  // Words of a name, umlauts both ways (friendly name "Küche", entity ID "kuche"/"kueche").
  const words = (t) => {
    const l = String(t || "").toLowerCase();
    return [norm(l), l.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")]
      .map((x) => " " + x.replace(/[^a-z0-9]+/g, " ").trim() + " ");
  };
  // Area of the sensor (own or its device's), else an area its name starts with or contains.
  function roomOfPower(hass, id) {
    const A = (hass && hass.areas) || {}, aid = areaOf(hass, id);
    if (aid) return A[aid] ? A[aid].name : aid;
    const label = words(houseLabel((hass && hass.states) || {}, id));
    const hit = Object.values(A).find((a) => a && a.name && !HOUSE_AREA.test(norm(a.name))
      && words(a.name).some((w) => w.trim() && label.some((l) => l.includes(w))));
    return hit ? hit.name : null;
  }
  // Power sensors that may be the house: device class power, a number, no diagnostic entity.
  const anyPowers = (hass) => {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    return Object.keys(S).filter((id) => id.startsWith("sensor.") && ((S[id].attributes || {}).device_class) === "power"
      && Number.isFinite(parseFloat(S[id].state)) && !((R[id] || {}).entity_category));
  };
  // #44: a PV inverter's output is no house consumption: solar/PV/inverter in the sensor's own name, or SMA's
  // "Grid power" (the inverter's AC output, no translation_key).
  const INVERTER = /(^|[^a-z])(solar|pv|photovoltaik|wechselrichter|inverter)([^a-z]|$)/i;
  const inverterOut = (hass, id) => {
    const S = (hass && hass.states) || {}, e = ((hass && hass.entities) || {})[id] || {};
    const label = houseLabel(S, id);
    return INVERTER.test(label) || (e.platform === "sma" && /grid.?power/i.test(label));
  };
  const housePowers = (hass) => {
    const S = (hass && hass.states) || {};
    return anyPowers(hass).filter((id) => !NOT_LIVE.test(houseLabel(S, id)) && !inverterOut(hass, id));
  };
  // May this sensor be the house at all (live power, no peak or period value)?
  const housePowerOk = (hass, id) => housePowers(hass).includes(id);
  // A meter, not a consumer: its "total" is the house, wherever the device sits. Phase sensors on the
  // device (three phase clamp), or a single phase meter: nothing to switch on the device (a plug has
  // a switch) and returned/exported energy, voltage with power factor or frequency, or a meter model.
  const PHASE = /phase|(^|[_\s])l[123]([_\s]|$)/i;
  const RETURNED = /returned|export|einspeis|r(ü|ue)ckspeis|zur(ü|ue)ck|feed.?in|produced/i;
  const METER_MODEL = /(^|[^a-z])(3?em|pro ?3?em|energy ?meter|power ?meter|stromz(ä|ae)hler|z(ä|ae)hler|meter|clamp|zange|powct|pzem|sdm\d*|eastron|iammeter|emporia|ct ?clamp)([^a-z]|$)/i;
  const SWITCHING = /^(switch|light|fan|climate|media_player|cover|valve|humidifier|vacuum|lock|water_heater)\./;
  function meterDevice(hass, id) {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
    const dev = (R[id] || {}).device_id;
    if (!dev) return false;
    const sibs = Object.keys(R).filter((x) => x !== id && R[x] && R[x].device_id === dev);
    if (sibs.some((x) => x.startsWith("sensor.") && PHASE.test(houseLabel(S, x)))) return true;
    if (sibs.some((x) => SWITCHING.test(x))) return false;
    const dc = (x) => ((S[x] || {}).attributes || {}).device_class;
    if (sibs.some((x) => dc(x) === "energy" && RETURNED.test(houseLabel(S, x) + " " + ((R[x] || {}).translation_key || "")))) return true;
    if (sibs.some((x) => dc(x) === "voltage") && sibs.some((x) => dc(x) === "power_factor" || dc(x) === "frequency")) return true;
    const d = D[dev] || {};
    return METER_MODEL.test([d.model, d.name, d.name_by_user].filter(Boolean).join(" "));
  }
  function housePower(hass) {
    const S = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    const powers = housePowers(hass);
    for (let i = 0; i < HOUSE_POWER.length; i++) {
      const id = powers.find((p) => HOUSE_POWER[i].test(houseLabel(S, p))
        && !(i === 1 && ((R[p] || {}).device_id || roomOfPower(hass, p)) && !meterDevice(hass, p)));
      if (id) return id;
    }
    return null;
  }
  // The rule before #44, only where it differs: the first "total" when nothing matched stage 1.
  // fixHomePower touches a Home sensor only when it is exactly this pick.
  function oldHouseTotal(hass) {
    const S = (hass && hass.states) || {}, powers = anyPowers(hass);
    if (powers.some((p) => HOUSE_POWER[0].test(houseLabel(S, p)))) return null;
    return powers.find((p) => HOUSE_POWER[1].test(houseLabel(S, p))) || null;
  }
  // A sensor that measures the house (house/grid name, or a phase meter's total): never a summand
  // of the rooms' sum on Home, it would count twice.
  function houseMeter(hass, id) {
    const label = houseLabel((hass && hass.states) || {}, id);
    return HOUSE_POWER[0].test(label) || HOUSE_POWER[2].test(label) || (HOUSE_POWER[1].test(label) && meterDevice(hass, id));
  }

  // A Home sensor only the rule before #44 picked: "total" in its name and nothing else that
  // makes it a house sensor, belonging to one of the dashboard's rooms (rooms: their names). A
  // phase meter stays: that one measures the house.
  function wrongHousePower(hass, id, rooms) {
    const S = (hass && hass.states) || {};
    const label = houseLabel(S, id);
    if (!S[id] || !HOUSE_POWER[1].test(label) || HOUSE_POWER[0].test(label) || HOUSE_POWER[2].test(label)) return false;
    const room = roomOfPower(hass, id);
    if (!room || !(rooms || []).some((n) => norm(n) === norm(room))) return false;
    return !meterDevice(hass, id);
  }

  // Badges per room from what is ticked: lights, climate, media, security.
  function badgesOf(hass, p) {
    const out = {};
    const idsOf = (room, kinds) => [].concat(...room.items.filter((x) => x.on && kinds.includes(x.type)).map((x) => x.group || [x.entity])).filter(Boolean);
    const put = (v, prefix, ids, max) => ids.slice(0, max).forEach((id, i) => { v[prefix + (i + 1)] = id; });
    const all = { light: [], climate: [], media: [], lock: [], camera: [], power: [] };
    p.rooms.slice(1).forEach((room) => {
      const v = {};
      const lights = topUnits(hass, idsOf(room, ["light"]));
      const climate = idsOf(room, ["thermostat"]), media = idsOf(room, ["media"]);
      const locks = idsOf(room, ["lock"]), cams = idsOf(room, ["casora_camera"]);
      put(v, "light_entity_", lights, 10);
      put(v, "climate_entity_", climate, 3);
      if (room.temp) v.temp_sensor_1 = room.temp;
      if (room.hum) v.humidity_sensor = room.hum;
      // Sensor for the whole room: energy_power_entity; devices (also a single one): list.
      if (room.power) v.energy_power_entity = room.power;
      else if ((room.powers || []).length) v.energy_entities = room.powers.slice();
      put(v, "media_player_", media, 10);
      if (locks.length) v.security_locks = locks;
      if (cams.length) v.security_cameras = cams;
      put(v, "security_entity_", room.contacts || [], 8);
      out[room.name] = v;
      all.light.push(...lights); all.climate.push(...climate); all.media.push(...media); all.lock.push(...locks); all.camera.push(...cams);
      all.power.push(...(room.power ? [room.power] : (room.powers || [])));
    });
    const h = {};
    const lightsAll = topUnits(hass, all.light);
    // The badge counts the single lights; the HA group is for the popup.
    const g = lightsAll.length > 1 ? groupFor(hass, lightsAll, "light") : null;
    if (g) h.light_group_entity = g;
    put(h, "light_entity_", lightsAll, 10);
    put(h, "climate_entity_", [...new Set((p.houseClimate || []).concat(all.climate))], 3);
    const firstRoom = (k) => (p.rooms.slice(1).find((r) => r[k]) || {})[k];
    const ht = p.houseTemp || firstRoom("temp"), hh = p.houseHum || firstRoom("hum");
    if (ht) h.temp_sensor_1 = ht;
    if (hh) h.humidity_sensor = hh;
    // Without a house sensor Home counts the rooms, the same sensors as their energy badges
    // (#44). casora_energy_auto 2: the Studio adds what the rooms gain later (fillHomeEnergy).
    // casora_energy_auto "house": the Studio picked the house sensor, not the user.
    const sum = [...new Set(all.power)].filter((id) => !houseMeter(hass, id));
    if (p.housePower) { h.energy_power_entity = p.housePower; h.casora_energy_auto = "house"; }
    else if (sum.length) { h.energy_entities = sum; h.casora_energy_auto = 2; }
    put(h, "media_player_", [...new Set(all.media)], 10);
    if (all.lock.length) h.security_locks = [...new Set(all.lock)];
    if (all.camera.length) h.security_cameras = [...new Set(all.camera)];
    out[p.rooms[0].name] = h;
    return out;
  }

  // Result for _create: {room name: [tile, …]}, only ticked ones.
  function tilesOf(p, hass) {
    const tiles = {};
    p.rooms.forEach((room) => { tiles[room.name] = room.items.filter((x) => x.on).map((x) => I().clone(x.tile)); });
    return { tiles, vars: hass ? badgesOf(hass, p) : {} };
  }

  // Badge categories: [category, "already set", which keys are taken over].
  const BADGE_CATS = [
    ["lights", /^(light_entity_\d+|light_group_entity)$/, /^(light_entity_\d+|light_group_entity)$/],
    ["climate", /^(climate_entity_\d+|temp_sensor_\d+)$/, /^(climate_entity_\d+|temp_sensor_1|humidity_sensor)$/],
    ["security", /^security_(locks|cameras|entity_\d+|lock_entity(_\d+)?)$/, /^security_(locks|cameras|entity_\d+)$/],
    ["energy", /^energy_(power_entity|entity_\d+|entities)$/, /^(energy_(power_entity|entities)|casora_energy_auto)$/],
    ["media", /^media_player_\d+$/, /^media_player_\d+$/],
  ];

  // Fill the badges per room from the devices of its HA area: only categories with nothing set
  // there yet (what users or the source chose stays), and never one someone switched off
  // (show_… = false).
  // targets: [{ name, vars, home, only }]: vars is filled in; only (Set/Array): only these
  // categories (device assistant). Returns the added categories per target.
  // Plan and badges depend only on the HA state: on load the Studio asks per room
  // (fillRoomEnergy), so plan only once for the same hass (before: once per room).
  let fillMemo = null;
  function fillBadges(hass, targets) {
    const list = [].concat(targets || []);
    if (!hass || !list.length) return list.map(() => []);
    let vars = {}, p = null;
    if (fillMemo && fillMemo.hass === hass) ({ vars, p } = fillMemo);
    else try {
      const areas = Object.values(hass.areas || {}).map((x) => x && x.name).filter(Boolean);
      p = plan(hass, areas, Object.assign({}, DEFAULTS));
      vars = badgesOf(hass, p);
      fillMemo = { hass, vars, p };
    } catch (e) { return list.map(() => []); }
    const set = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length);
    const res = list.map((t) => {
      const V = t && t.vars;
      if (!V) return [];
      let src = null;
      if (t.home) src = vars[p.rooms[0].name];
      else {
        const room = p.rooms.slice(1).find((r) => norm(r.name) === norm(t.name));
        src = room ? vars[room.name] : null;
      }
      if (!src) return [];
      const only = t.only ? new Set(t.only) : null;
      const added = [];
      BADGE_CATS.forEach(([cat, hasRe, takeRe]) => {
        if (only && !only.has(cat)) return;
        if (V["show_" + cat] === false) return;
        if (Object.keys(V).some((k) => hasRe.test(k) && set(V[k]))) return;
        const keys = Object.keys(src).filter((k) => takeRe.test(k) && set(src[k]) && V[k] === undefined);
        if (!keys.length) return;
        keys.forEach((k) => { V[k] = I().clone(src[k]); });
        added.push(cat);
      });
      return added;
    });
    // #44: the plan covers every HA area; Home sums only the rooms filled with it, as their
    // badges count them (none measuring: no sum).
    const hi = list.findIndex((t) => t && t.home && t.vars);
    const others = list.filter((t) => t && !t.home && t.vars);
    if (hi >= 0 && others.length && res[hi].includes("energy") && Array.isArray(list[hi].vars.energy_entities)) {
      const H = list[hi].vars, ids = homeSumIds(hass, others.map((t) => t.vars));
      if (ids.length) H.energy_entities = ids;
      else {
        delete H.energy_entities; delete H.casora_energy_auto;
        res[hi] = res[hi].filter((c) => c !== "energy");
      }
    }
    return res;
  }

  // Power sensors the rooms' energy badges add up (energy_entities without energy_exclude, else
  // the room sensor), each once: the sum on Home without a house sensor (#44).
  function roomPowerIds(varsList) {
    const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
    const out = [];
    (varsList || []).forEach((V) => {
      if (!V || V.show_energy === false) return;
      const ex = arr(V.energy_exclude), list = arr(V.energy_entities);
      (list.length ? list : (V.energy_power_entity ? [V.energy_power_entity] : []))
        .forEach((id) => { if (!ex.includes(id) && !out.includes(id)) out.push(id); });
    });
    return out;
  }
  // The sum on Home: the rooms' sensors without the ones that measure the house (#44).
  function homeSumIds(hass, varsList) {
    return roomPowerIds(varsList).filter((id) => !houseMeter(hass, id));
  }

  // 06.10.2026: power sensors of a room as the automatic picks them, for the Studio (extend the
  // list, the note about further sensors in the room). whole: sensor for the whole room; list:
  // devices; old: what Casora would have entered up to 1.0.11; any: all power sensors in the
  // area (before 1.0.3 Casora entered the first of them).
  function energyProbe(hass, name) {
    if (!hass) return null;
    fillBadges(hass, [{ name, vars: {}, only: ["energy"] }]);
    const p = fillMemo && fillMemo.hass === hass ? fillMemo.p : null;
    const room = p && p.rooms.slice(1).find((r) => norm(r.name) === norm(name));
    if (!room) return null;
    return { whole: room.power || null, list: (room.powers || []).slice(), old: (room.powersOld || []).slice(),
      any: (room.powersAny || []).slice() };
  }

  window.casoraBasis = { plan, tilesOf, rules, DEFAULTS, shortName, fillBadges, energyProbe, housePower, housePowerOk, oldHouseTotal, wrongHousePower, roomPowerIds, homeSumIds, openings, isCombo };

  // KI kostet: Casora schätzt vor dem ersten Einsatz grob, was es über den API-Schlüssel
  // kostet (Zeichen → Token, Listenpreise je Modellfamilie in USD pro 1 Mio. Token) und fragt nach.
  const PRICES = [
    [/opus-(3|4-0|4-1|4$)|opus-4-2/, 15, 75], [/opus|fable/, 5, 25], [/sonnet/, 3, 15], [/haiku/, 1, 5],
    [/gpt-5|gpt5/, 1.25, 10], [/gemini.*pro/, 1.25, 10], [/gemini/, 0.3, 2.5],
  ];
  const SKIP_KEY = "casora.aiCost.skip";
  const cost = (model, inChars, calls, outTokens) => {
    const m = String(model || "").toLowerCase();
    const [, pin, pout] = PRICES.find(([re]) => re.test(m)) || [null, 5, 25];
    const tin = inChars / 3.5 + 900 * calls, tout = outTokens != null ? outTokens : 700 * calls;
    return (tin * pin + tout * pout) / 1e6;
  };
  const money = (hass, usd) => {
    const cur = ((hass && hass.config && hass.config.currency) || "EUR").toUpperCase();
    const val = cur === "EUR" ? usd * 0.92 : usd;
    const loc = (hass && hass.locale && hass.locale.language) || (hass && hass.language) || "de";
    if (val < 0.01) return tr("less than 1 cent");
    try { return new Intl.NumberFormat(loc, { style: "currency", currency: cur === "EUR" ? "EUR" : "USD", maximumFractionDigits: 2 }).format(val); }
    catch (e) { return val.toFixed(2) + " " + (cur === "EUR" ? "€" : "$"); }
  };
  window.casoraAiCost = {
    estimate: cost,
    // Geschätzter Preis als Text („0,05 €“) – dieselbe Rechnung wie in der Nachfrage.
    format: (hass, o) => money(hass, cost(o.model, o.inChars, o.calls, o.outTokens)),
    // true = weiter mit KI. what = kurze Beschreibung („13 Kacheltypen“). Kommt bei jedem
    // KI-Einsatz, bis man „Nicht mehr anzeigen“ wählt (gilt für dieses Gerät).
    confirm: async (panel, o) => {
      try { if (localStorage.getItem(SKIP_KEY) === "1") return true; } catch (e) { /* ohne Speicher: fragen */ }
      const usd = cost(o.model, o.inChars, o.calls, o.outTokens);
      const r = await panel._ask({
        title: tr("AI costs a little"),
        message: tr("Casora sends {1} to {2}. That runs on your API key and is billed by your provider – estimated {3}. Your provider's bill is what counts.")
          .replace("{1}", o.what).replace("{2}", o.label || "AI").replace("{3}", money(panel._hass, usd)),
        confirmLabel: tr("Continue with AI"),
        check: { label: tr("Don't show again"), value: false },
      });
      if (!r) return false;
      if (r.checked) { try { localStorage.setItem(SKIP_KEY, "1"); } catch (e) { /* egal */ } }
      return true;
    },
  };

  // Zu schwache KI: Knopf „Casora KI mit … anlegen“ – eine eigene KI-Aufgabe mit dem
  // stärksten Modell des Anbieters; die bisherige bleibt, wie sie ist. onDone(best).
  window.casoraAiUpgrade = async (panel, host, onDone) => {
    let opts = [];
    try { opts = (await panel._hass.callWS({ type: "casora/ki/upgrade" })).options || []; } catch (e) { opts = []; }
    if (!opts.length || !host.isConnected) return;
    const o = opts[0];
    const box = document.createElement("div"); box.className = "cc-upg";
    const b = document.createElement("button"); b.type = "button"; b.className = "cc-upg-btn";
    b.setAttribute("data-no-i18n", "");
    b.textContent = "✦ " + tr("Set up Casora AI with {1}").replace("{1}", o.label);
    const n = document.createElement("div"); n.className = "cc-upg-note";
    n.textContent = tr("A separate AI task for Casora – your current AI stays as it is.");
    box.append(b, n);
    host.appendChild(box);
    if (!panel.shadowRoot.getElementById("casora-upg-css")) {
      const st = document.createElement("style"); st.id = "casora-upg-css";
      st.textContent = ".cc-upg{display:flex;flex-direction:column;align-items:center;gap:6px;margin:10px 0 0}"
        + ".cc-upg-btn{appearance:none;border:0;cursor:pointer;padding:9px 18px;border-radius:999px;font:600 var(--t-callout) var(--casora-font-studio, system-ui);color:#fff;"
        + "background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff));box-shadow:0 4px 18px rgba(191,90,242,.35)}"
        + ".cc-upg-btn:disabled{cursor:progress;background:var(--casora-studio-ai-shimmer, linear-gradient(100deg,#bf5af2 20%,#e3a6ff 50%,#7d5cff 80%)) 0 0/250% 100%;animation:ccupg 1.4s linear infinite}"
        + "@keyframes ccupg{to{background-position:-250% 0}}"
        + ".cc-upg-note{font-size:var(--t-caption);color:var(--ink-3,rgba(255,255,255,.5))}";
      panel.shadowRoot.appendChild(st);
    }
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "✦ " + tr("Setting up {1}…").replace("{1}", o.label);
      try {
        const r = await panel._hass.callWS({ type: "casora/ki/upgrade", entry_id: o.entry_id, model: o.model });
        if (!r.best) throw new Error(tr("The new AI didn't start."));
        box.remove();
        onDone(r.best);
      } catch (e) {
        b.disabled = false;
        b.textContent = "✦ " + tr("Set up Casora AI with {1}").replace("{1}", o.label);
        n.textContent = tr("Didn't work: ") + ((e && e.message) || e);
      }
    };
  };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P._fillStep) return;
    const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const css = (root) => {
      if (root.getElementById("casora-basis-css")) return;
      const st = document.createElement("style"); st.id = "casora-basis-css";
      st.textContent = ".bs-shot{display:grid!important;place-items:center;aspect-ratio:16/9;border-radius:0!important;box-shadow:none!important}"
        + ".bs-shot i{width:30%;height:44%;background:#fff;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}"
        + ".bs-auto{background:var(--casora-studio-auto-grad, linear-gradient(135deg,#2FB8E0,#3A6FF7))!important}.bs-ai{background:var(--casora-studio-ai-grad, linear-gradient(135deg,#bf5af2,#7d5cff))!important}"
        + ".bs-empty{background:linear-gradient(135deg,#3a3b40,#26272b)!important}"
        + ".themecard[aria-disabled=true]{opacity:.45;cursor:not-allowed}"
        + ".bs-lock{margin:12px 4px 0;font-size:var(--t-foot);color:var(--ink-3,rgba(255,255,255,.5));text-align:center}"
        + ".flowin.casora-bwide{max-width:1180px}"
        + ".bs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;text-align:left}"
        + ".bs-room{padding:14px;border-radius:var(--r-l);background:var(--casora-popup-row-fill,rgba(255,255,255,.08))}"
        + ".bs-room>b{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:var(--t-callout);font-weight:600;color:var(--ink);margin:0 2px 8px}"
        + ".bs-room>b span{font-size:var(--t-foot);font-weight:500;color:var(--ink-3,rgba(255,255,255,.5))}"
        + ".bs-item{appearance:none;border:0;background:none;display:flex;align-items:center;gap:10px;width:100%;padding:7px 4px;cursor:pointer;color:var(--ink);text-align:left;border-radius:var(--r-s)}"
        + ".bs-item:hover:not(:disabled){filter:none;background:rgba(255,255,255,.05)}"
        + ".bs-item i{flex:0 0 22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--casora-studio-chip-hi, rgba(118,118,128,.32))}"
        + ".bs-item[aria-checked=true] i{background:var(--casora-studio-done, #0a84ff)}.bs-item i svg{width:14px;height:14px;opacity:0}.bs-item[aria-checked=true] i svg{opacity:1}"
        + ".bs-item span{flex:1 1 auto;min-width:0}.bs-item span b{display:block;font-size:var(--t-callout);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        + ".bs-item span small{display:block;font-size:var(--t-caption);color:var(--ink-3,rgba(255,255,255,.5));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        + ".bs-item[aria-checked=false] span{opacity:.45}"
        + ".bs-empty-room{font-size:var(--t-foot);color:var(--ink-3,rgba(255,255,255,.5));padding:4px}"
        + ".bs-foot{margin:14px 4px 0;font-size:var(--t-foot);line-height:1.45;color:var(--ink-3,rgba(255,255,255,.5));text-align:center}"
        + ".bs-foot.ai{color:#c77dff}"
        + ":host(.is-light) .bs-item:hover:not(:disabled){background:rgba(0,0,0,.04)}"
        + ":host(.is-light) .bs-foot.ai{color:var(--casora-studio-ai, #8944ab)}";
      root.appendChild(st);
    };
    const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 12.5 4 4 9-9"/></svg>';

    // Schritt „Räume füllen“: automatisch (vorausgewählt), mit KI oder leer.
    P._fillStep = async function (o) {
      let pick = o.pick || "auto";
      const s = this._flowScreen({
        full: true, icon: "rooms",
        title: "Fill Your Rooms", step: [2, 3],
        lede: "Casora can put your devices into the rooms right away – you check everything before it's created.",
        back: o.back,
      });
      css(this.shadowRoot);
      s.box.classList.add("fwide");
      s.box.style.setProperty("--fcols", 3);
      const grid = el("div", "themegrid", s.body);
      let best = null;
      const cards = [];
      const paint = () => cards.forEach((c) => c.setAttribute("aria-checked", c.dataset.k === pick ? "true" : "false"));
      [["auto", "bs-auto", "rooms", "Set Up Automatically", "Your devices go into their rooms, sorted and grouped the Casora way."],
        ["ai", "bs-ai", "assist", "✦ Set Up with AI", "Like automatic, plus AI sorts in devices without a room and gives tiles clear names."],
        ["empty", "bs-empty", "home", "Start Empty", "The rooms stay empty – you add tiles yourself in the Studio."]].forEach(([k, cls, ic, title, sub]) => {
        const c = el("button", "themecard", grid); c.type = "button"; c.dataset.k = k; c.setAttribute("role", "radio");
        const shot = el("span", "themeshot bs-shot " + cls, c);
        const i = el("i", "", shot); i.style.setProperty("--m", "url('/casora_assets/icons/" + ic + ".svg')");
        const meta = el("span", "thememeta", c), tx = el("span", "themetext", meta);
        el("b", "", tx, title); el("span", "", tx, sub);
        const tick = el("span", "themetick", meta); tick.innerHTML = CHECK;
        c.onclick = () => { if (c.getAttribute("aria-disabled") === "true") return; pick = k; paint(); };
        cards.push(c);
      });
      paint();
      const lock = el("div", "bs-lock", s.body);
      try { const m = await this._hass.callWS({ type: "casora/ki/models" }); best = m && m.best; if (!best) lock.textContent = m && m.all && m.all.length ? "AI setup needs a stronger AI – for example Claude Opus, Claude Sonnet 4.5 or GPT-5. Settings → AI tasks." : "AI setup needs an AI – for example Claude Opus. Settings → AI tasks."; } catch (e) { best = null; }
      const aiCard = cards.find((c) => c.dataset.k === "ai");
      const showBest = () => { lock.setAttribute("data-no-i18n", ""); lock.textContent = "✦ " + tr("AI") + ": " + best.label; };
      if (!best) {
        aiCard.setAttribute("aria-disabled", "true"); if (pick === "ai") { pick = "auto"; paint(); }
        window.casoraAiUpgrade(this, s.body, (b) => { best = b; aiCard.removeAttribute("aria-disabled"); showBest(); });
      } else showBest();
      this._flowButton(s.acts, "Continue", async () => {
        if (pick === "empty") return o.go(null);
        if (pick === "ai" && best) {
          // Grobe Größe: je Raum ein paar Geräte mit Namen und IDs, hin und zurück.
          const n = Object.keys(this._hass.entities || {}).length;
          const chars = Math.min(60000, 400 + n * 60);
          const ok = await window.casoraAiCost.confirm(this, { model: best.model, label: best.label, inChars: chars, calls: 1,
            outTokens: chars / 3.5, what: tr("your room and device names") });
          if (!ok) return;
        }
        return this._fillPreview(Object.assign({}, o, { pick, back: () => this._fillStep(Object.assign({}, o, { pick })) }));
      });
    };

    // Vorschau: je Raum die Kacheln, jede abwählbar. Mit KI erst nach deren Antwort.
    P._fillPreview = async function (o) {
      const s = this._flowScreen({
        icon: "rooms",
        title: "Your Rooms", step: [3, 3],
        lede: "This is what Casora puts in. Tap a tile to leave it out – you can change everything later.",
        back: o.back,
      });
      css(this.shadowRoot);
      s.box.classList.add("casora-uwide", "casora-bwide");
      const note = el("div", "bs-foot", s.body, o.pick === "ai" ? "AI is sorting your devices…" : "");
      const r = await rules(this._hass);
      let p = plan(this._hass, o.picked, r);
      if (o.pick === "ai") {
        note.classList.add("ai");
        try {
          p = await this._fillAi(p);
          note.textContent = "";
        } catch (e) {
          note.textContent = tr("AI didn't work: ") + ((e && e.message) || e) + " – " + tr("showing the automatic setup.");
        }
      }
      const grid = el("div", "bs-grid", s.body);
      s.body.insertBefore(grid, note);
      const count = () => p.rooms.reduce((n, room) => n + room.items.filter((x) => x.on).length, 0);
      let go = null;
      // „Mit 43 Kacheln anlegen (≈ 5 pro Raum)“ – der Schnitt über die Räume ohne Home.
      const rooms = Math.max(1, p.rooms.length - 1);
      const sync = () => {
        const n = count();
        if (!go) return;
        const per = Math.round(n / rooms);
        go.textContent = tr(n === 1 ? "Create with 1 tile" : "Create with {1} tiles").replace("{1}", n)
          + (n > 1 && per >= 1 ? " " + tr("(≈ {1} per room)").replace("{1}", per) : "");
        go.setAttribute("data-no-i18n", "");
      };
      p.rooms.forEach((room, ri) => {
        const box = el("div", "bs-room", grid);
        const I0 = I();
        const shownName = ri === 0 && I0.isDefaultHomeName && I0.isDefaultHomeName(room.name) ? I0.homeRoomWord(this._hass) : room.name;
        const h = el("b", "", box, shownName); h.setAttribute("data-no-i18n", "");
        const cnt = el("span", "", h);
        const upd = () => { const n = room.items.filter((x) => x.on).length; cnt.textContent = tr(n === 1 ? "1 tile" : "{1} tiles").replace("{1}", n); };
        if (!room.items.length) el("div", "bs-empty-room", box, ri === 0 ? "Favorites appear here once your rooms have devices." : "No devices found in this area.");
        room.items.forEach((x) => {
          const b = el("button", "bs-item", box); b.type = "button"; b.setAttribute("role", "checkbox");
          b.setAttribute("aria-checked", x.on ? "true" : "false");
          const i = el("i", "", b); i.innerHTML = CHECK;
          const tx = el("span", "", b); tx.setAttribute("data-no-i18n", "");
          el("b", "", tx, x.label);
          const t = typeById(x.tile.template && [].concat(x.tile.template)[0] === "casora_cover" && x.group ? "cover_group" : x.type);
          el("small", "", tx, (x.group && x.group.length > 1 ? x.group.length + " × " : "") + tr((t && t.label) || x.type));
          b.onclick = () => { x.on = !x.on; b.setAttribute("aria-checked", x.on ? "true" : "false"); upd(); sync(); };
        });
        upd();
      });
      if (p.loose.length) el("div", "bs-foot", s.body, tr(p.loose.length === 1 ? "1 device has no room in Home Assistant – add it later with the device assistant." : "{1} devices have no room in Home Assistant – add them later with the device assistant.").replace("{1}", p.loose.length));
      go = this._flowButton(s.acts, "Create", () => o.go(tilesOf(p, this._hass)));
      sync();
    };

    // KI: ordnet Geräte ohne Raum zu, vergibt klare Namen, kann Kacheln abwählen und sortieren.
    P._fillAi = async function (p) {
      const rooms = p.rooms.map((room) => ({ name: room.name, tiles: room.items.map((x) => ({ key: x.key, name: x.label, type: x.type, entities: x.group || [x.entity] })) }));
      const loose = p.loose.map((it) => ({ key: it.id, name: it.name, type: it.type, entity: it.entity, area: it.area || "" }));
      const r = await this._hass.callWS({ type: "casora/ki/basis", rooms, loose });
      const byKey = new Map();
      p.rooms.forEach((room) => room.items.forEach((x) => byKey.set(x.key, x)));
      const looseBy = new Map(p.loose.map((it) => [it.id, it]));
      const next = p.rooms.map((room) => ({ name: room.name, items: [] }));
      const byName = new Map(next.map((x) => [x.name, x]));
      const used = new Set();
      [].concat(r.rooms || []).forEach((rr) => {
        const room = byName.get(rr.name);
        if (!room) return;
        [].concat(rr.tiles || []).forEach((t) => {
          if (!t || used.has(t.key)) return;
          const had = byKey.get(t.key);
          const lo = looseBy.get(t.key);
          if (!had && !lo) return;  // nur, was es wirklich gibt
          used.add(t.key);
          const item = had ? Object.assign({}, had, { tile: I().clone(had.tile) })
            : { key: lo.id, type: lo.type, entity: lo.entity, tile: tile(lo.type, lo.entity, lo.name), on: true };
          const name = String(t.name || "").trim().slice(0, 40);
          if (name) item.tile.name = name;
          item.label = item.tile.name;
          item.on = t.on !== false;
          room.items.push(item);
        });
      });
      // Was die KI vergessen hat, bleibt – am Ende seines Raums.
      p.rooms.forEach((room) => room.items.forEach((x) => { if (!used.has(x.key)) byName.get(room.name).items.push(x); }));
      next.forEach((room) => { const was = p.rooms.find((x) => x.name === room.name); if (was) Object.assign(room, { contacts: was.contacts, temp: was.temp, hum: was.hum }); });
      return { rooms: next, loose: p.loose.filter((it) => !used.has(it.id)), houseClimate: p.houseClimate, houseTemp: p.houseTemp, houseHum: p.houseHum, housePower: p.housePower };
    };
  });
})();
