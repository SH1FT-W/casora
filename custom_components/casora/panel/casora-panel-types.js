// Casora-Kacheltypen für das Studio-Panel.
//
// Das Panel kennt nur Casoras eingebaute Typen und nimmt fremde Vorlagen nur,
// wenn sie nicht mit „casora_“ beginnen – Casoras Vorlagen tun das aber
// (Stufe 3: Umbenennung). Diese Liste wird vor dem Panel geladen und dort an
// TILE_TYPES angehängt, damit Editor und Vorschau die Kacheln erkennen.
// Beschriftungen englisch; Übersetzung über translations/panel/*.json.
// Feldangaben wie im Panel (key/label/domains/advanced/group …). Zusätzlich:
//   find – wo Casora die Entität selbst findet, wenn das Feld leer bleibt
//          ({keys, domain, dc} am Gerät der Kachel-Entität, {plug} = Zwischenstecker).
//          Das Studio zeigt den Fund als Platzhalter („Automatisch: …“); die
//          KI-Hilfe füllt nur, was der Finder nicht findet.
const ICON = { key: "icon", label: "Icon", type: "icon" };
const TITLE = { key: "room_name", label: "Popup title", type: "text", advanced: true };
// Popups, deren Titel sonst der Kachelname ist (window.casoraPopupTitle).
const TITLE_NAME = { ...TITLE, placeholder: "The tile's name" };
const PLUG = { key: "plug_entity", label: "Smart plug", domains: ["switch"], find: { plug: "switch" },
  advanced: true, group: "Popup", hint: "Measures power and energy; the popup shows usage and cost." };
const PRICE = { key: "price_kwh", label: "Electricity price per kWh", type: "number", placeholder: "0.36", advanced: true };
// Hex, weil die Diagramme die Farbe direkt ins SVG schreiben.
const CHART = (ph) => ({ key: "chart_color", label: "Chart color", type: "text", placeholder: ph || "#00C3D0",
  advanced: true, hint: "A hex color, e.g. #30D158." });
const LAUNDRY = [
  ICON,
  PLUG,
  PRICE,
  { key: "appliance_progress", label: "Progress", domains: ["sensor"], classes: ["progress"], find: { keys: ["cycle_progress", "program_progress", "sensor_program_progress"] }, advanced: true },
  { key: "appliance_remaining", label: "Time remaining", domains: ["sensor"], classes: ["duration"], find: { keys: ["time_remaining", "remaining_time", "sensor_remaining_program_time"] }, advanced: true },
  TITLE,
  CHART(),
];
// 3D-Drucker: _casoraPrint.resolve() nimmt diese Variablen vor dem Geräte-Finder (FIND in 02-geraete.js).
const PRINT_FIELDS = [
  { key: "entity_state", label: "Print stage", domains: ["sensor"], find: { keys: ["stage"], domain: "sensor" },
    advanced: true, group: "Print job", placeholder: "This tile's entity" },
  { key: "entity_task_name", label: "Job name", domains: ["sensor"], find: { keys: ["subtask_name"], domain: "sensor" }, advanced: true },
  { key: "entity_layer", label: "Current layer", domains: ["sensor"], find: { keys: ["current_layer"], domain: "sensor" }, advanced: true },
  { key: "entity_layers_total", label: "Total layers", domains: ["sensor"], find: { keys: ["total_layers"], domain: "sensor" }, advanced: true },
  { key: "entity_start_time", label: "Start time", domains: ["sensor"], find: { keys: ["start_time"], domain: "sensor" }, advanced: true },
  { key: "entity_end_time", label: "End time", domains: ["sensor"], find: { keys: ["end_time"], domain: "sensor" }, advanced: true },
  { key: "entity_weight", label: "Filament weight", domains: ["sensor"], find: { keys: ["print_weight"], domain: "sensor" }, advanced: true },
  { key: "entity_error", label: "Print error", domains: ["binary_sensor"], find: { keys: ["print_error"], domain: "binary_sensor" }, advanced: true },
  { key: "entity_nozzle_temp", label: "Nozzle temperature", domains: ["sensor"], classes: ["temperature"],
    find: { keys: ["nozzle_temp"], domain: "sensor" }, advanced: true, group: "Temperatures" },
  { key: "entity_nozzle_target", label: "Nozzle target", domains: ["sensor", "number"],
    find: { keys: ["target_nozzle_temp"], domain: "sensor" }, advanced: true },
  { key: "entity_bed_temp", label: "Bed temperature", domains: ["sensor"], classes: ["temperature"],
    find: { keys: ["bed_temp"], domain: "sensor" }, advanced: true },
  { key: "entity_bed_target", label: "Bed target", domains: ["sensor", "number"],
    find: { keys: ["target_bed_temp"], domain: "sensor" }, advanced: true },
  { key: "entity_active_slot", label: "Active filament", domains: ["sensor"], find: { keys: ["active_tray"], domain: "sensor" },
    advanced: true, group: "Filament" },
  ...[1, 2, 3, 4].map((n) => ({ key: "entity_ams_slot_" + n, label: "AMS slot " + n, domains: ["sensor"], advanced: true,
    placeholder: "Automatic" })),
  { key: "btn_pause", label: "Pause button", domains: ["button"], find: { keys: ["pause"], domain: "button" },
    advanced: true, group: "Buttons" },
  { key: "btn_resume", label: "Resume button", domains: ["button"], find: { keys: ["resume"], domain: "button" }, advanced: true },
  { key: "btn_stop", label: "Stop button", domains: ["button"], find: { keys: ["stop"], domain: "button" }, advanced: true },
  CHART(),
];
window.CASORA_TILE_TYPES = [
  { id: "casora_3d_printer", label: "3D printer", template: "casora_3d_printer", domains: ["sensor"],
    entityLabel: "Print status", icon: "3D_Printer", fields: [
      ICON,
      { key: "printer_name", label: "Printer name", type: "text", placeholder: "Device name",
        hint: "Empty: the printer's name in Home Assistant." },
      { ...PLUG },
      PRICE,
      { key: "entity_camera", label: "Camera", domains: ["camera"], find: { keys: ["camera"], domain: "camera" }, advanced: true },
      { key: "entity_light", label: "Chamber light", domains: ["light"], find: { keys: ["chamber_light"], domain: "light" }, advanced: true },
      { key: "entity_progress", label: "Progress", domains: ["sensor"], classes: ["progress"], find: { keys: ["print_progress"] }, advanced: true },
      ...PRINT_FIELDS,
    ] },
  { id: "casora_washer", label: "Washing machine", template: "casora_waschmaschine", domains: ["sensor"],
    entityLabel: "Status sensor", entityPlaceholder: "State of the machine (e.g. Home Connect, Miele or WashData)", icon: "laundry-room", fields: LAUNDRY },
  { id: "casora_dryer", label: "Dryer", template: "casora_trockner", domains: ["sensor"],
    entityLabel: "Status sensor", entityPlaceholder: "State of the machine (e.g. Home Connect, Miele or WashData)", icon: "dryer", fields: LAUNDRY },
  { id: "casora_dishwasher", label: "Dishwasher", template: "casora_geschirrspueler", domains: ["sensor"],
    entityLabel: "Operation state", entityPlaceholder: "State of the dishwasher (e.g. Home Connect)", icon: "dishwasher", fields: [
      ICON,
      PLUG,
      PRICE,
      { key: "entity_program", label: "Active program", domains: ["sensor"], find: { keys: ["sensor_active_program"] }, advanced: true },
      { key: "entity_door", label: "Door", domains: ["binary_sensor"], classes: ["door", "opening"], find: { keys: ["binary_sensor_door_state"], dc: "door" }, advanced: true },
      { key: "entity_salt", label: "Salt", domains: ["sensor"], find: { keys: ["sensor_salt"] }, advanced: true },
      { key: "entity_rinse_aid", label: "Rinse aid", domains: ["sensor"], find: { keys: ["sensor_rinse_aid"] }, advanced: true },
      { key: "btn_start", label: "Start button", domains: ["button"], find: { keys: ["button_start_program"], domain: "button" }, advanced: true },
      { key: "btn_stop", label: "Stop button", domains: ["button"], find: { keys: ["button_abort_program"], domain: "button" }, advanced: true },
      TITLE_NAME,
      // Weitere Popup-Werte (Home Connect); leer = Geräte-Finder über den translation_key.
      { key: "entity_phase", label: "Program phase", domains: ["sensor"], find: { keys: ["sensor_program_phase"] }, advanced: true },
      { key: "appliance_progress", label: "Progress", domains: ["sensor"], classes: ["progress"],
        find: { keys: ["sensor_program_progress"] }, advanced: true },
      { key: "appliance_remaining", label: "Time remaining", domains: ["sensor"],
        find: { keys: ["sensor_remaining_program_time"] }, advanced: true },
      { key: "entity_energy_est", label: "Energy forecast", domains: ["sensor"], find: { keys: ["sensor_energy_forecast"] }, advanced: true },
      { key: "entity_water_est", label: "Water forecast", domains: ["sensor"], find: { keys: ["sensor_water_forecast"] }, advanced: true },
      { key: "entity_filter", label: "Check filter", domains: ["binary_sensor"],
        find: { keys: ["binary_sensor_checkfiltersystem"], domain: "binary_sensor" }, advanced: true },
      { key: "sw_extra_dry", label: "Extra dry", domains: ["switch"], find: { keys: ["switch_extra_dry"], domain: "switch" },
        advanced: true, group: "Options" },
      { key: "sw_half_load", label: "Half load", domains: ["switch"], find: { keys: ["switch_half_load"], domain: "switch" }, advanced: true },
      { key: "sw_speed", label: "Faster", domains: ["switch"], find: { keys: ["switch_speed_on_demand"], domain: "switch" }, advanced: true },
      { key: "sw_silence", label: "Quieter", domains: ["switch"], find: { keys: ["switch_silence_on_demand"], domain: "switch" }, advanced: true },
      { key: "entity_power", label: "Power", domains: ["sensor"], classes: ["power"], advanced: true,
        hint: "Only without a smart plug." },
      { key: "entity_energy", label: "Energy", domains: ["sensor"], classes: ["energy"], advanced: true,
        hint: "Only without a smart plug." },
      CHART(),
    ] },
  { id: "casora_aquarium", label: "Aquarium", template: "casora_aquarium_tank", domains: ["sensor"], classes: ["temperature"],
    entityLabel: "Water temperature", icon: "fish", fields: [
      ICON,
      { key: "tank_name", label: "Tank name", type: "text", placeholder: "Tile name",
        hint: "Heading in the popup. Empty: the tile's name." },
      { key: "light_entity", label: "Light", domains: ["light"], advanced: true, group: "Popup" },
      { key: "status_entity", label: "Status sensor", domains: ["sensor"], advanced: true },
      { key: "leak_entity", label: "Leak sensor", domains: ["binary_sensor"], classes: ["moisture"], advanced: true },
      { key: "leak_battery", label: "Leak sensor battery", domains: ["sensor"], classes: ["battery"], advanced: true },
      { key: "temp_battery", label: "Thermometer battery", domains: ["sensor"], classes: ["battery"],
        find: { dc: "battery", domain: "sensor" }, advanced: true },
      { key: "light_reachable", label: "Light reachable", domains: ["binary_sensor"], advanced: true,
        hint: "Warns when the light has been unreachable for 30 minutes." },
      // Lichtsteuerung und Dosierpumpe (1.0.3): frei gewählte Entitäten. Ältere Kacheln mit den
      // Präfixen helialux / dosing_prefix laufen weiter; die Felder erscheinen nur, solange sie gesetzt sind.
      { key: "light_profile", label: "Light profile", domains: ["select"], advanced: true, group: "Light control",
        hint: "The light's own day profiles, e.g. of a Juwel HeliaLux." },
      { key: "light_schedule_switch", label: "Schedule switch", domains: ["switch"], advanced: true,
        hint: "On: the light follows your automation. Off: the light runs its own profile." },
      { key: "helialux", label: "Light control (older setting)", type: "text", advanced: true,
        when: (v) => !!v.helialux, placeholder: "Entity prefix",
        hint: "Entity prefix from an older version. Used while the two fields above are empty." },
      { key: "dosing_buttons", label: "Dose buttons", type: "list", domains: ["button"], advanced: true, group: "Dosing pump",
        placeholder: "add dose button.", hint: "One button per channel. Pressing it doses the set amount." },
      { key: "dosing_names", label: "Channel name", type: "map", over: "dosing_buttons", kind: "text", advanced: true,
        when: (v) => Array.isArray(v.dosing_buttons) && v.dosing_buttons.length > 0 },
      { key: "dosing_volume", label: "Dose volume", type: "map", over: "dosing_buttons", domains: ["number"], advanced: true,
        when: (v) => Array.isArray(v.dosing_buttons) && v.dosing_buttons.length > 0 },
      { key: "dosing_today", label: "Dosed today", type: "map", over: "dosing_buttons", domains: ["sensor"], advanced: true,
        when: (v) => Array.isArray(v.dosing_buttons) && v.dosing_buttons.length > 0 },
      { key: "dosing_total", label: "Dosed in total", type: "map", over: "dosing_buttons", domains: ["sensor"], advanced: true,
        when: (v) => Array.isArray(v.dosing_buttons) && v.dosing_buttons.length > 0 },
      { key: "dosing_prefix", label: "Dosing pump (older setting)", type: "text", advanced: true,
        when: (v) => !!v.dosing_prefix, placeholder: "Entity prefix",
        hint: "Entity prefix from an older version. Used while no dose buttons are chosen." },
      CHART("#30D158"),
    ] },
  { id: "casora_camera", label: "Camera", template: "casora_camera", domains: ["camera"], icon: "camera", fields: [
      ICON,
      TITLE_NAME,
      { key: "alert_window_minutes", label: "Recent activity (minutes)", type: "number", advanced: true, group: "Popup",
        placeholder: "5", hint: "A dot marks a camera with activity in this window." },
      { key: "show_stream_variants", label: "Show stream variants", type: "bool", advanced: true, group: "Popup",
        hint: "Also list snapshot cameras and every stream of a camera (Soft design hides them)." },
    ] },
  { id: "casora_alarm", label: "Alarm", template: "casora_alarm", domains: ["alarm_control_panel"], icon: "shield_check",
    color: "var(--casora-color-red, #FF453A)", fields: [
      // casora_popup_alarm liest alarm_entity vor der Kachel-Entität; Vorgabe der Vorlage: Alarmo.
      { key: "alarm_entity", label: "Popup alarm panel", domains: ["alarm_control_panel"], advanced: true, group: "Popup",
        placeholder: "alarm_control_panel.alarmo", hint: "The alarm the popup arms and disarms." },
      { ...TITLE, placeholder: "Automatic" },
    ] },
  { id: "casora_weather_warning", label: "Weather warning", template: "casora_weather_warning", domains: ["binary_sensor"], classes: ["safety"],
    icon: "attention2", color: "var(--casora-color-orange, #FF9F0A)", fields: [
      ICON,
      { key: "sensors", type: "list", label: "Warning sensors", domains: ["binary_sensor"], classes: ["safety"],
        placeholder: "Add a warning sensor", hint: "E.g. the NINA or DWD warnings for your town." },
      { ...TITLE, placeholder: "NINA warnings" },
    ] },
  { id: "casora_solar_tip", label: "Solar tip", template: "casora_solar_tip", domains: ["binary_sensor"], ownData: true,
    icon: "sun", color: "var(--casora-color-yellow, #FFCC00)", fields: [ICON, TITLE] },
  { id: "casora_vent", label: "Room climate", template: "casora_vent", domains: ["binary_sensor", "sensor"], ownData: true,
    icon: "wind", color: "var(--casora-color-teal, #00C3D0)", fields: [ICON, TITLE] },
  { id: "casora_trash", label: "Waste collection", template: "casora_trash", domains: ["sensor"], ownData: true,
    icon: "trash", fields: [
      ICON,
      { key: "trash_calendar", label: "Waste calendar", domains: ["calendar"] },
      { ...TITLE, placeholder: "Waste" },
      { key: "trash_reminder", label: "Reminder automation", domains: ["automation"], advanced: true },
    ] },
  { id: "casora_car", label: "Car", template: "casora_car", domains: ["sensor"], ownData: true, icon: "car_side_w2", fields: [ICON, TITLE] },
  { id: "casora_ebike", label: "E-bike", template: "casora_ebike", domains: ["sensor"], ownData: true, icon: "ebike", fields: [ICON, TITLE] },
  // Fußbodenheizung: Thermostat-Kachel mit Casora-Popup – verhält sich wie ein Thermostat
  // (like), hat aber eigenen Namen und eigene Kennung, sonst stünde „Thermostat“ doppelt in der Auswahl.
  { id: "fbh", like: "thermostat", label: "Floor heating", template: ["casora_thermostat", "casora_popup_fbh"],
    domains: ["climate"], icon: "heating_coil", fields: [
      { key: "temp_sensor", label: "Temperature sensor", domains: ["sensor"], classes: ["temperature"] },
      { key: "show_toggle", label: "Toggle button", type: "bool", boolDefault: true },
      { key: "master_switch", label: "Main switch", domains: ["switch"], find: { keys: ["main_switch"], domain: "switch" },
        advanced: true, group: "Popup", hint: "For a heating group: the switch that turns the whole system on or off." },
      TITLE_NAME,
    ] },
  { id: "casora_recipe", label: "Recipe of the week", template: "casora_recipe", domains: ["sensor"], ownData: true,
    icon: "chef-hat", color: "var(--casora-color-orange, #FF9F0A)", fields: [ICON, TITLE] },
  // Schalter: aus Hemma 1 und älteren Fassungen umgezogene Kacheln (…_switch) und neue – Steckdosen, Pumpen, Lampen am Schalter.
  { id: "casora_switch", label: "Switch", template: "casora_switch", domains: ["switch"], icon: "power_on",
    color: "var(--casora-color-teal, #00C3D0)", fields: [
      ICON,
      { key: "show_toggle", label: "Toggle button", type: "bool", boolDefault: false },
      TITLE_NAME,
    ] },
  // Aquarien-Übersicht (Hemma 1 und ältere Fassungen „…_aquarium“): bis zu drei Becken in einer Kachel. Nur fürs
  // Bearbeiten umgezogener Kacheln – neue Becken bekommen die Aquarium-Kachel (casora_aquarium_tank).
  { id: "casora_aquariums", label: "Aquariums", template: "casora_aquarium", hidden: true, domains: ["sensor"],
    classes: ["temperature"], entityLabel: "Water temperature", icon: "fish", fields: [
      ICON,
      { key: "entity_freshwater", label: "Freshwater tank", domains: ["sensor"], classes: ["temperature"] },
      { key: "entity_saltwater", label: "Saltwater tank", domains: ["sensor"], classes: ["temperature"] },
      { key: "entity_turtle", label: "Turtle tank", domains: ["sensor"], classes: ["temperature"] },
      TITLE,
    ] },
];

// Symbole, die Casora mitliefert, aber das Panel nicht kennt (Auswahlliste + Kachelliste).
window.CASORA_EXTRA_ICONS = Object.fromEntries([
  "3D_Printer", "dryer", "dishwasher", "fish", "camera", "attention2", "sun", "trash", "car", "car_side",
  "car_side_w2", "ebike", "chef-hat", "shield_check", "shield_lock", "shield_moon", "shield_off",
  "shield_alarm", "shield_bypass", "shield_vacation", "calendar", "calendar-day", "window-open",
  "window-closed", "heating_coil", "wind", "rooms",
].map((n) => [n, "/casora_assets/icons/" + n + ".svg"]));

// Vorschau: bedingte Karten (type: conditional) so zeigen wie das Dashboard –
// unsichtbar, wenn die Bedingung gerade nicht erfüllt ist, sonst die Karte darin.
// Rückgabe: {hidden: true} | {inner: <karte>} | {} (unverändert zeichnen).
(() => {
  const asList = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);
  function check(c, states) {
    if (!c || typeof c !== "object") return true;
    const kind = c.condition || (c.entity ? "state" : "");
    if (kind === "and") return (c.conditions || []).every((x) => check(x, states));
    if (kind === "or") return (c.conditions || []).some((x) => check(x, states));
    if (kind === "not") return !(c.conditions || []).some((x) => check(x, states));
    const st = c.entity && states[c.entity];
    const val = st ? String(st.state) : "unavailable";
    if (kind === "state") {
      if (c.state !== undefined && !asList(c.state).includes(val)) return false;
      if (c.state_not !== undefined && asList(c.state_not).includes(val)) return false;
      return true;
    }
    if (kind === "numeric_state") {
      const n = Number(val);
      if (!Number.isFinite(n)) return false;
      if (c.above !== undefined && !(n > Number(c.above))) return false;
      if (c.below !== undefined && !(n < Number(c.below))) return false;
      return true;
    }
    return true; // screen, user, time … zeigen
  }
  // Karten, die das Dashboard an dieser Stelle tatsächlich zeigt (0, 1 oder mehrere).
  function shown(card, states) {
    if (!card || typeof card !== "object") return [];
    if (card.type === "custom:button-card") return [card];
    if (card.type === "conditional") {
      if (!(card.conditions || []).every((c) => check(c, states))) return [];
      return shown(card.card, states);
    }
    if (card.type === "custom:auto-entities") {
      // Nur explizite Einträge (entity_id + optional state) – wie in Casoras Dashboards.
      const out = [];
      for (const inc of ((card.filter || {}).include || [])) {
        if (!inc || !inc.entity_id || String(inc.entity_id).includes("*")) continue;
        const st = states[inc.entity_id];
        if (!st) continue;
        if (inc.state !== undefined && !asList(inc.state).includes(String(st.state))) continue;
        const opt = Object.assign({ type: "custom:button-card", entity: inc.entity_id }, inc.options || {});
        out.push(...shown(opt, states));
      }
      return out;
    }
    // Swipe-Karte: die erste Kachel darin steht stellvertretend.
    if (Array.isArray(card.cards)) {
      for (const c of card.cards) { const s = shown(c, states); if (s.length) return [s[0]]; }
    }
    return [];
  }
  // Seiten einer Swipe-Karte – auch wenn sie in einer Bedingung steckt oder auto-entities ihre
  // Seiten sammelt (Luftreiniger, Aquarien). Sonst 0. Bisher standen gesammelte Seiten in der
  // Vorschau einzeln nebeneinander und kamen und gingen mit jedem Schalten (Blinken).
  const isSwipe = (c) => !!c && /swipe|carousel/.test(String(c.type || ""));
  function swipePages(card, states) {
    let c = card, n = 0;
    while (c && c.type === "conditional" && c.card && n++ < 4) c = c.card;
    if (!c || typeof c !== "object") return 0;
    if (isSwipe(c) && Array.isArray(c.cards)) return c.cards.filter((x) => shown(x, states).length).length;
    if (c.type === "custom:auto-entities" && isSwipe(c.card)) return shown(c, states).length;
    return 0;
  }
  window.casoraPreviewUnwrap = (tile, hass) => {
    if (!tile || tile.type === "custom:button-card" || !tile.type) return {};
    const cards = shown(tile, (hass && hass.states) || {});
    if (!cards.length) return { hidden: true };
    const pages = swipePages(tile, (hass && hass.states) || {});
    if (pages) return { inner: cards[0], pages };
    // Swipe-Karte: eine Kachel wie am Dashboard, dazu Seitenpunkte für die übrigen.
    if (cards.length === 1 && tile.type !== "conditional" && Array.isArray(tile.cards)) {
      const pages = tile.cards.filter((c) => shown(c, (hass && hass.states) || {}).length).length;
      return { inner: cards[0], pages };
    }
    return cards.length === 1 ? { inner: cards[0] } : { cards };
  };
})();

// Vorschau: Symbol und Zustandstext der Casora-Kacheln aus ihrer Vorlagenkette,
// damit die Vorschau dasselbe zeigt wie das Dashboard (state_display wird mit
// denselben Werten ausgeführt). Fehler fallen still auf das Panel-Verhalten zurück.
(() => {
  // Rückfall für Gerätezustände, wenn die Vorlage ihren Text über ein im Panel
  // nicht geladenes Modul bildet (z. B. Waschmaschine über _casoraLaundry).
  const WORDS = {
    de: { running: "Läuft", run: "Läuft", starting: "Startet", ending: "Endet", paused: "Pausiert",
          user_paused: "Pausiert", finished: "Fertig", finish: "Fertig", off: "Aus", idle: "Bereit",
          ready: "Bereit", anti_wrinkle: "Knitterschutz", rinse: "Spülen", clean: "Reinigen",
          delay_wait: "Startet später", printing: "Druckt", on: "An" },
    en: { running: "Running", run: "Running", off: "Off", idle: "Ready", ready: "Ready", finished: "Finished" },
  };
  const OURS = new Set((window.CASORA_TILE_TYPES || []).map((t) => t.template));
  const names = (t) => (Array.isArray(t) ? t : t ? [t] : []);
  const isOurs = (tile) => names(tile && tile.template).some((n) => OURS.has(n));

  function resolve(templates, list, seen = new Set()) {
    const out = { variables: {} };
    for (const n of names(list)) {
      if (seen.has(n) || !templates || !templates[n]) continue;
      seen.add(n);
      const t = templates[n];
      const base = resolve(templates, t.template, seen);
      Object.assign(out.variables, base.variables, t.variables || {});
      for (const k of ["state_display", "icon", "entity_picture"]) {
        if (t[k] !== undefined) out[k] = t[k];
        else if (base[k] !== undefined && out[k] === undefined) out[k] = base[k];
      }
    }
    return out;
  }

  function run(code, ctx) {
    if (typeof code !== "string") return code;
    const m = code.match(/^\s*\[\[\[([\s\S]*)\]\]\]\s*$/);
    if (!m) return code;
    // eslint-disable-next-line no-new-func
    const fn = new Function("states", "entity", "variables", "hass", "user", "html", m[1]);
    return fn(ctx.states, ctx.entity, ctx.variables, ctx.hass, ctx.hass && ctx.hass.user, (s) => s);
  }

  function ctxFor(tile, ent, hass, tpl) {
    const variables = Object.assign({}, tpl.variables, tile.variables || {});
    const ctx = { states: (hass && hass.states) || {}, entity: ent, variables, hass };
    // Wie button-card: Variablen der Reihe nach auswerten, spätere sehen frühere.
    for (const k of Object.keys(variables)) {
      const v = variables[k];
      if (typeof v === "string" && v.includes("[[[")) {
        try { variables[k] = run(v, ctx); } catch (e) { variables[k] = undefined; }
      }
    }
    return ctx;
  }

  // Raumklima (casora_vent) und Solar-Tipp (casora_solar_tip) bilden ihren Text über
  // window._casoraVent / _casoraSolar aus scripts/local/05-standard-medien.js – ohne das
  // Modul stand in der Vorschau nur „Aus“. Einmal nachladen (reine Funktionen, keine Karten).
  let medien = false;
  const needMedien = (tile) => {
    if (medien || (window._casoraVent && window._casoraSolar)) return;
    if (!names(tile && tile.template).some((n) => n === "casora_vent" || n === "casora_solar_tip")) return;
    medien = true;
    import("/casora_scripts/local/05-standard-medien.js").catch(() => {});
  };

  window.casoraTileState = (tile, ent, hass, templates) => {
    if (!isOurs(tile) || !ent) return null;
    needMedien(tile);
    try {
      const tpl = resolve(templates, tile.template);
      const fallback = () => {
        const lang = ((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en").split("-")[0];
        const w = (WORDS[lang] || {})[String(ent.state).toLowerCase()];
        if (w) return w;
        // Zahlen: sinnvoll runden und Einheit anhängen (z. B. 1191.59 → „1.192 km“).
        const n = Number(ent.state);
        const unit = ent.attributes && ent.attributes.unit_of_measurement;
        if (ent.state !== "" && Number.isFinite(n)) {
          const digits = Math.abs(n) >= 100 ? 0 : 1;
          const txt = n.toLocaleString(lang, { maximumFractionDigits: digits });
          return unit ? txt + " " + unit : txt;
        }
        return hass && hass.formatEntityState ? hass.formatEntityState(ent) : null;
      };
      if (!tpl.state_display) return fallback();
      let v;
      try { v = run(tpl.state_display, ctxFor(tile, ent, hass, tpl)); } catch (e) { return fallback(); }
      if (v == null || v === "") return fallback();
      if (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v).trim())) return fallback();
      // Vorlage ohne ihr Modul gibt oft nur den Rohzustand zurück („off“) → übersetzen.
      if (String(v).trim() === String(ent.state)) return fallback();
      // DOMParser statt div: ein nicht eingehängtes div lädt <img> und führt onerror aus.
      const d = new DOMParser().parseFromString(String(v), "text/html");
      return ((d.body && d.body.textContent) || "").trim() || null;
    } catch (e) {
      return null;
    }
  };

  window.casoraTileIconUrl = (tile, ent, hass, templates) => {
    if (!isOurs(tile)) return null;
    try {
      const tpl = resolve(templates, tile.template);
      const name = run(tpl.variables && tpl.variables.icon, ctxFor(tile, ent, hass, tpl));
      if (!name || typeof name !== "string") return null;
      if (name.startsWith("mdi:")) return null;
      return name.includes("/") ? name : "/casora_assets/icons/" + name + ".svg";
    } catch (e) {
      return null;
    }
  };
})();

// Editor-Hilfen für Casora-Kacheln: Geräte-Finder als Platzhalter und „Mit KI ergänzen“.
(() => {
  // Derselbe Finder wie im Dashboard (scripts/local/00-finden.js) – ohne DOM, nur Registry.
  if (!window.casoraDevice) import("/casora_scripts/local/00-finden.js").catch(() => {});

  const lang = (hass) => (((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en").split("-")[0]);
  const T = {
    de: { auto: "Automatisch: ", ai: "Mit KI ergänzen", busy: "KI sucht …", none: "Die KI hat nichts Passendes gefunden.",
          done: (n) => n === 1 ? "1 Feld ergänzt – bitte prüfen." : n + " Felder ergänzt – bitte prüfen.",
          all: "Alles belegt oder automatisch gefunden.", fail: "KI-Aufgabe fehlgeschlagen: ",
          noai: "Für die KI-Hilfe unter Einstellungen → KI-Aufgaben eine Standard-KI festlegen.",
          lead: "Felder, die Casora nicht selbst findet, kann die KI aus deinen Entitäten vorschlagen." },
    en: { auto: "Automatic: ", ai: "Complete with AI", busy: "AI is looking…", none: "The AI found nothing that fits.",
          done: (n) => n === 1 ? "1 field filled – please check." : n + " fields filled – please check.",
          all: "Everything is set or found automatically.", fail: "AI task failed: ",
          noai: "To use the AI helper, pick a default AI under Settings → AI tasks.",
          lead: "The AI can suggest the fields Casora cannot find on its own." },
  };
  const t = (hass) => T[lang(hass)] || T.en;
  const nameOf = (hass, id) => {
    const s = hass && hass.states && hass.states[id];
    return (s && s.attributes && s.attributes.friendly_name) || id;
  };

  function found(f, tile, hass) {
    const CD = window.casoraDevice;
    if (!CD || !f.find || !tile || !tile.entity || !hass) return null;
    try {
      if (f.find.plug) {
        const p = CD.companionPlug(hass, tile.entity);
        return (p && p[f.find.plug]) || null;
      }
      const spec = Object.assign({ domain: (f.domains || [])[0] }, f.find);
      return CD.map(hass, tile.entity, { x: spec }).x || null;
    } catch (e) {
      return null;
    }
  }
  // Die gefundene Entität selbst (für das Vorbelegen neuer Kacheln im Studio).
  window.casoraFieldEntity = (f, tile, hass) => found(f, tile, hass);
  window.casoraFieldFound = (f, tile, hass) => {
    const id = found(f, tile, hass);
    if (!id) return null;
    // Nur ein echter Name, nie die Entity-ID („Automatisch“ statt „Automatisch: sensor.time“).
    const name = nameOf(hass, id);
    return name && name !== id ? t(hass).auto + name : t(hass).auto.replace(/:\s*$/, "");
  };

  const isOurs = (type) => type && (String(type.id).startsWith("casora_"));
  const entityFields = (type) => (type.fields || []).filter((f) => f.domains && (!f.type || f.type === "entity"));
  const aiEntity = (hass) => {
    const ids = Object.keys((hass && hass.states) || {}).filter((e) => e.startsWith("ai_task."));
    return ids[0] || null;
  };
  const tr = (s) => (window.casoraI18n && window.casoraI18n.t ? window.casoraI18n.t(s) : s);

  // Kandidaten: Entitäten am Gerät der Kachel und im selben Bereich; ohne Kachel-Entität
  // alle Entitäten der Domains, die die Kachel braucht.
  function candidates(hass, tile, domains) {
    const R = hass.entities || {}, D = hass.devices || {}, S = hass.states || {};
    const areaOf = (id) => {
      const e = R[id];
      if (!e) return null;
      return e.area_id || ((D[e.device_id] || {}).area_id) || null;
    };
    const anchor = tile.entity;
    const dev = anchor && R[anchor] && R[anchor].device_id;
    const area = anchor ? areaOf(anchor) : null;
    const want = new Set(domains);
    const out = Object.keys(S).filter((id) => {
      if (!want.has(id.split(".")[0])) return false;
      const e = R[id];
      if (e && (e.hidden || e.entity_category === "diagnostic")) return false;
      if (!anchor) return true;
      if (e && dev && (e.device_id === dev || (D[e.device_id] || {}).via_device_id === dev)) return true;
      // Außerhalb des Geräts nur Schalter im selben Raum (Zwischenstecker) – sonst
      // greift die KI z. B. beim Trockner daneben.
      if (dev && !id.startsWith("switch.")) return false;
      return !!area && areaOf(id) === area;
    });
    return out.slice(0, 400).map((id) => {
      const s = S[id], e = R[id] || {};
      const d = D[e.device_id] || {};
      return { id, name: (s.attributes && s.attributes.friendly_name) || id,
        dc: (s.attributes && s.attributes.device_class) || "", device: d.name_by_user || d.name || "" };
    });
  }

  async function askAI(panel, type, tile, missing, withMain) {
    const hass = panel._hass;
    const domains = [...new Set(missing.flatMap((f) => f.domains).concat(withMain ? type.domains : []))];
    const cands = candidates(hass, tile, domains);
    if (!cands.length) return {};
    const fieldLines = (withMain ? [`- entity | ${tr(type.entityLabel || "Entity")} (${tr(type.label)}) | ${type.domains.join(", ")}`] : [])
      .concat(missing.map((f) => `- ${f.key} | ${tr(f.label)} | ${f.domains.join(", ")}`));
    const structure = {};
    (withMain ? ["entity"] : []).concat(missing.map((f) => f.key)).forEach((k) => {
      structure[k] = { selector: { text: {} }, description: "entity_id oder leer" };
    });
    const res = await hass.callWS({
      type: "execute_script",
      sequence: [{
        action: "ai_task.generate_data",
        data: {
          task_name: "Casora Kachel-Felder",
          entity_id: aiEntity(hass),
          instructions: "Casora Kachel-Felder\nEine Home-Assistant-Dashboard-Kachel vom Typ \"" + tr(type.label) + "\""
            + (tile.name ? " mit dem Namen \"" + tile.name + "\"" : "")
            + (tile.entity ? " zeigt die Entität " + tile.entity + " (" + nameOf(hass, tile.entity) + ")." : ".")
            + "\nOrdne jedem Feld die passende Entität aus der Kandidatenliste zu. Nur IDs aus der Liste, "
            + "nur Domains, die beim Feld stehen. Passt nichts eindeutig, lass das Feld leer.\n\n"
            + "Felder (Schlüssel | Bedeutung | erlaubte Domains):\n" + fieldLines.join("\n")
            + "\n\nKandidaten (entity_id | Name | device_class | Gerät):\n"
            + cands.map((c) => `${c.id} | ${c.name} | ${c.dc} | ${c.device}`).join("\n"),
          structure,
        },
        response_variable: "r",
      }, { stop: "done", response_variable: "r" }],
    });
    return (res && res.response && res.response.data) || {};
  }

  window.casoraTileExtras = (panel, { type, tile, body }) => {
    if (!isOurs(type) || !body) return;
    const hass = panel._hass;
    const fields = entityFields(type);
    // Ohne Zusatzfelder nur, wenn die Kachel ein Gerät braucht – nicht bei Kacheln, die ihre Daten
    // selbst finden (Solar-Tipp, Raumklima, Auto, E-Bike, Rezept).
    if (!fields.length && (tile.entity || type.ownData || type.noEntity)) return;
    const row = document.createElement("div");
    row.className = "hint casora-ai";
    row.dataset.noI18n = "";
    row.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px";
    const txt = document.createElement("span");
    txt.style.flex = "1 1 200px";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "editbtn";
    btn.style.cssText = "flex:0 0 auto";
    btn.textContent = "✨ " + t(hass).ai;
    const has = !!aiEntity(hass);
    txt.textContent = has ? t(hass).lead : t(hass).noai;
    btn.disabled = !has;
    btn.onclick = async () => {
      const vars = tile.variables || {};
      const missing = fields.filter((f) => !vars[f.key] && !found(f, tile, hass));
      const withMain = !tile.entity && !type.noEntity && !type.ownData;
      if (!missing.length && !withMain) { txt.textContent = t(hass).all; return; }
      btn.disabled = true;
      txt.textContent = t(hass).busy;
      let data;
      try {
        data = await askAI(panel, type, tile, missing, withMain);
      } catch (e) {
        btn.disabled = false;
        txt.textContent = t(hass).fail + ((e && e.message) || e);
        return;
      }
      btn.disabled = false;
      const S = hass.states || {};
      const ok = (id, doms) => typeof id === "string" && S[id] && doms.includes(id.split(".")[0]);
      let n = 0;
      if (withMain && ok(data.entity, type.domains)) {
        tile.entity = data.entity;
        if (!(tile.name || "").trim()) tile.name = nameOf(hass, data.entity);
        n++;
      }
      missing.forEach((f) => {
        const id = data[f.key];
        if (!ok(id, f.domains)) return;
        if (!tile.variables) tile.variables = {};
        tile.variables[f.key] = id;
        n++;
      });
      if (!n) { txt.textContent = t(hass).none; return; }
      if (panel._markDirty) panel._markDirty();
      panel._renderForm();
      panel._status && panel._status(t(hass).done(n), "ok");
    };
    row.appendChild(txt);
    row.appendChild(btn);
    body.appendChild(row);
  };
})();

// Hemma → Casora: Dashboards aus Hemma (Import) in Casora-Namen übersetzen.
// Gleiche Regel wie der Dienst casora.umstellen (umstellen.py):
//   • „hemma“ → „casora“ in Vorlagen, Karten, CSS-Variablen und JS der Vorlagen,
//   • Entitäten nur, wenn sie Casora gehören (panel/umbenennung.json), sonst bleiben
//     sie – z. B. Sensoren aus eigenen Paketen,
//   • eigene Dateien unter /local/hemma/ und Dashboard-Adressen bleiben.
// Umbenannte Kopien (jedes „hemma“ z. B. als „zuhaus“) genauso, mit ihrem Präfix.
(() => {
  let own = new Set(), prefixes = [];
  fetch(new URL("./umbenennung.json", import.meta.url)).then((r) => r.json()).then((j) => {
    own = new Set(j.eigene || []);
    prefixes = j.praefixe || [];
  }).catch(() => {});
  const DOMAINS = new Set(("sensor binary_sensor input_boolean input_text input_select input_number input_datetime "
    + "input_button script automation switch light climate cover media_player camera calendar todo select number "
    + "button fan vacuum lock alarm_control_panel scene update weather plant person zone device_tracker counter "
    + "timer event image text time date humidifier water_heater valve lawn_mower siren remote").split(" "));
  const isOwn = (obj, pre) => {
    const n = "casora_" + obj.slice(pre.length + 1);
    return own.has(n) || prefixes.some((p) => n.indexOf(p) === 0);
  };
  // Umbenannte Hemma-Kopie („zuhaus_room“, „--zuhaus-…“, /local/zuhaus/): Präfix des
  // Dashboards. Die Seiten beginnen mit einer Raumkarte „<präfix>_room“, und die Vorlagen
  // (falls vorhanden) tragen überwiegend dasselbe Präfix. Sonst null.
  const PREFIX_RE = /^[a-z][a-z0-9]*$/;
  function prefixOf(cfg) {
    const views = (cfg && Array.isArray(cfg.views)) ? cfg.views : [];
    const count = {};
    views.forEach((v) => {
      const c = v && (v.cards || [])[0];
      const t = c && c.type === "custom:button-card" && [].concat(c.template || [])[0];
      const m = typeof t === "string" && t.match(/^([a-z][a-z0-9]*)_room$/);
      if (m && m[1] !== "casora") count[m[1]] = (count[m[1]] || 0) + 1;
    });
    const tpl = Object.keys((cfg && cfg.button_card_templates) || {});
    const hits = Object.keys(count)
      .filter((p) => !tpl.length || tpl.filter((n) => n.indexOf(p + "_") === 0).length * 2 > tpl.length)
      .sort((p, q) => count[q] - count[p]);
    return hits[0] || null;
  }
  function renameOne(s, pre) {
    const keep = [];
    const hold = (m) => { keep.push(m); return "\u0001" + (keep.length - 1) + "\u0001"; };
    // Andere Präfixe als „hemma“ nur am Wortanfang – nicht mitten in einem fremden Wort.
    const at = pre === "hemma" ? "" : "(?<![A-Za-z])";
    const up = pre.toUpperCase();
    s = s.replace(new RegExp("/" + pre + "-studio", "g"), "/casora-studio");
    s = s.replace(new RegExp("\\b([a-z_]+)\\.(" + pre + "_[a-z0-9_]*)", "g"), (m, d, o) => (DOMAINS.has(d) && !isOwn(o, pre) ? hold(m) : m));
    s = s.replace(new RegExp("/local/" + pre + "/", "g"), hold);
    s = s.replace(new RegExp("([\"'(\\s])(/[a-z0-9-]*" + pre + "[a-z0-9-]*)(?=[/\"'?#])", "g"), (m, a, b) => a + hold(b));
    s = s.replace(new RegExp(at + pre, "gi"), (w) => (w === up ? "CASORA" : w[0] !== w[0].toLowerCase() ? "Casora" : "casora"));
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
  }
  // prefix: Präfix einer umbenannten Kopie (z. B. „zuhaus“); „hemma“ wird immer mit übersetzt.
  const otherPrefix = (p) => (p && p !== "hemma" && p !== "casora" && PREFIX_RE.test(p) ? p : null);
  function renameText(s, prefix) {
    const p = otherPrefix(prefix);
    return renameOne(p ? renameOne(s, p) : s, "hemma");
  }
  window.casoraRename = (cfg, prefix) => {
    if (!cfg || typeof cfg !== "object") return cfg;
    const p = otherPrefix(prefix === undefined ? prefixOf(cfg) : prefix);
    const txt = JSON.stringify(cfg);
    if (!(p ? new RegExp("hemma|" + p, "i") : /hemma/i).test(txt)) return cfg;
    return JSON.parse(renameText(txt, p));
  };
  window.casoraRenameText = renameText;
  window.casoraPrefixOf = prefixOf;
})();
