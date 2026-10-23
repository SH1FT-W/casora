// Casora tile types for the Studio panel.
//
// The panel only knows Casora's built-in types and only takes foreign templates
// that do not start with "casora_" – but Casora's templates do
// (stage 3: renaming). This list loads before the panel and is appended there to
// TILE_TYPES so the editor and preview recognize the tiles.
// Labels in English; translation via translations/panel/*.json.
// Field specs as in the panel (key/label/domains/advanced/group …). In addition:
//   find – where Casora finds the entity itself when the field stays empty
//          ({keys, domain, dc} on the device of the tile entity, {plug} = smart plug).
//          The Studio shows the match as a placeholder ("Auto: …"); the
//          AI helper only fills what the finder does not find.
const ICON = { key: "icon", label: "Icon", type: "icon" };
const TITLE = { key: "room_name", label: "Popup title", type: "text", advanced: true };
// Popups whose title is otherwise the tile name (window.casoraPopupTitle).
const TITLE_NAME = { ...TITLE, placeholder: "The tile's name" };
const PLUG = { key: "plug_entity", label: "Smart plug", domains: ["switch"], find: { plug: "switch" },
  advanced: true, group: "Popup", hint: "Measures power and energy; the popup shows usage and cost." };
const PRICE = { key: "price_kwh", label: "Electricity price per kWh", type: "number", placeholder: "0.36", advanced: true };
// Hex, because the charts write the color straight into the SVG.
const CHART = (ph) => ({ key: "chart_color", label: "Chart color", type: "text", placeholder: ph || "#00C3D0",
  advanced: true, hint: "A hex color, e.g. #30D158." });
const LAUNDRY = [
  ICON,
  PLUG,
  PRICE,
  { key: "appliance_progress", label: "Progress", domains: ["sensor"], classes: ["progress"], find: { keys: ["cycle_progress", "program_progress", "sensor_program_progress"] }, advanced: true },
  { key: "appliance_remaining", label: "Time remaining", domains: ["sensor"], classes: ["duration", "timestamp"], find: { keys: ["time_remaining", "remaining_time", "sensor_remaining_program_time", "program_finish_time"] }, advanced: true },
  TITLE,
  CHART(),
];
// 3D printer: _casoraPrint.resolve() takes these variables before the device finder (FIND in 02-devices.js).
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
      // Home Connect in HA core: program as select (active_program), door as enum sensor (open/closed/locked).
      { key: "entity_program", label: "Active program", domains: ["sensor", "select"], find: { keys: ["sensor_active_program", "active_program"], domain: "" }, advanced: true },
      { key: "entity_door", label: "Door", domains: ["binary_sensor", "sensor"], classes: { binary_sensor: ["door", "opening"], sensor: ["enum"] },
        find: { keys: ["binary_sensor_door_state", "door"], dc: "door", domain: "" }, advanced: true },
      { key: "entity_salt", label: "Salt", domains: ["sensor"], find: { keys: ["sensor_salt"] }, advanced: true },
      { key: "entity_rinse_aid", label: "Rinse aid", domains: ["sensor"], find: { keys: ["sensor_rinse_aid"] }, advanced: true },
      { key: "btn_start", label: "Start button", domains: ["button"], find: { keys: ["button_start_program"], domain: "button" }, advanced: true },
      { key: "btn_stop", label: "Stop button", domains: ["button"], find: { keys: ["button_abort_program", "stop_program"], domain: "button" }, advanced: true },
      TITLE_NAME,
      // More popup values (Home Connect); empty = device finder via the translation_key.
      { key: "entity_phase", label: "Program phase", domains: ["sensor"], find: { keys: ["sensor_program_phase"] }, advanced: true },
      { key: "appliance_progress", label: "Progress", domains: ["sensor"], classes: ["progress"],
        find: { keys: ["sensor_program_progress", "program_progress"] }, advanced: true },
      { key: "appliance_remaining", label: "Time remaining", domains: ["sensor"],
        find: { keys: ["sensor_remaining_program_time", "program_finish_time"] }, advanced: true },
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
      // Target range (1.1.2): outside it "Check", more than 2 °C (3.6 °F) off "Alarm" (_casoraAqTempRange).
      { key: "temp_min", label: "Lowest water temperature", type: "number", placeholder: "24", advanced: true, group: "Popup",
        hint: "Below this the tile warns. Same unit as the thermometer." },
      { key: "temp_max", label: "Highest water temperature", type: "number", placeholder: "26", advanced: true,
        hint: "Above this the tile warns; more than 2 °C off raises an alarm." },
      { key: "light_entity", label: "Light", domains: ["light"], advanced: true },
      // Color channels (1.1.2): empty = number entities on the light's device with a color word, else the light's rgb/rgbw.
      { key: "light_channels", label: "Color channels", type: "list", domains: ["number"], advanced: true,
        when: (v) => !!v.light_entity, placeholder: "add channel number.",
        hint: "Empty: Casora finds the channels itself (numbers of the light's device, else the light's own colors)." },
      { key: "status_entity", label: "Status sensor", domains: ["sensor", "binary_sensor"], advanced: true,
        hint: "Optional. Warns on warning/critical (also German) or when a problem sensor is on." },
      { key: "leak_entity", label: "Leak sensor", domains: ["binary_sensor"], classes: ["moisture"], advanced: true },
      { key: "leak_battery", label: "Leak sensor battery", domains: ["sensor"], classes: ["battery"], advanced: true },
      { key: "temp_battery", label: "Thermometer battery", domains: ["sensor"], classes: ["battery"],
        find: { dc: "battery", domain: "sensor" }, advanced: true },
      // Battery hints (window.casoraBatteryHints, scripts/casora-core.js): "Auto" is not
      // stored – the variable is then missing, as on existing dashboards.
      { key: "battery_hints", label: "Battery hints", type: "select", advanced: true,
        options: ["", "always", "never"], optionLabels: { "": "Automatic", always: "Always", never: "Never" },
        when: (v) => !!(v.leak_battery || v.temp_battery || v.battery_hints),
        hint: "Automatic: a weak battery does not highlight this tile when the dashboard already has a Batteries tile." },
      { key: "light_reachable", label: "Light reachable", domains: ["binary_sensor"], advanced: true,
        hint: "Warns when the light has been unreachable for 30 minutes." },
      // Light control and dosing pump (1.0.3): freely chosen entities. Older tiles with the
      // prefixes helialux / dosing_prefix keep working; the fields only show while they are set.
      { key: "light_profile", label: "Light profile", domains: ["select"], advanced: true, group: "Light control",
        hint: "The light's own day profiles, e.g. of a Juwel HeliaLux." },
      { key: "light_schedule_switch", label: "Schedule switch", domains: ["switch"], advanced: true,
        hint: "Switches between your automation and the light's own program." },
      // Meaning of "on" (1.1.2): Auto = window._casoraAqSwitchMeaning (HeliaLux on = HA, auto mode on = lamp).
      { key: "light_schedule_on", label: "Schedule switch on means", type: "select", advanced: true,
        options: ["", "ha", "lamp"],
        optionLabels: { "": "Automatic", ha: "Home Assistant controls the light", lamp: "The light runs its own program" },
        when: (v) => !!(v.light_schedule_switch || v.helialux || v.light_schedule_on),
        hint: "Automatic: recognized from the switch (e.g. manual color simulation = Home Assistant, auto mode = the light)." },
      { key: "helialux", label: "Light control (older setting)", type: "text", advanced: true,
        when: (v) => !!v.helialux, placeholder: "Entity prefix",
        hint: "Entity prefix from an older version. Used while the two fields above are empty." },
      // Equipment (1.1.2): pump, heater, skimmer … – service from the domain (switch, light, fan, climate …).
      // Older tiles with devices from YAML keep working unchanged (window._casoraAqDevices).
      { key: "tech_entities", label: "Equipment", type: "list", domains: ["switch", "light", "fan", "climate", "input_boolean", "humidifier"],
        advanced: true, group: "Equipment", placeholder: "add pump, heater …",
        hint: "Pump, heater, skimmer … Shown under “Equipment” in the popup and switchable there." },
      { key: "tech_names", label: "Name", type: "map", over: "tech_entities", kind: "text", advanced: true,
        when: (v) => Array.isArray(v.tech_entities) && v.tech_entities.length > 0 },
      { key: "tech_alarm", label: "Alarm when off", type: "map", over: "tech_entities", kind: "bool", advanced: true,
        when: (v) => Array.isArray(v.tech_entities) && v.tech_entities.length > 0 },
      { key: "tech_confirm", label: "Ask before switching off", type: "map", over: "tech_entities", kind: "bool", advanced: true,
        when: (v) => Array.isArray(v.tech_entities) && v.tech_entities.length > 0 },
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
      // "Status from: …" (1.1.1): an image via a proxy reports "ready" although the camera is gone.
      // casora-core.js casoraCamOffline – tile, security and camera badge, popup.
      { key: "status_entity", label: "Status from", domains: ["camera", "binary_sensor"],
        classes: { binary_sensor: ["connectivity"] }, advanced: true, placeholder: "This camera",
        hint: "Optional. Another camera or a connection sensor that tells whether the camera is reachable, e.g. when the picture comes through a proxy (go2rtc, Frigate, Scrypted) that stays ready although the camera is gone. Picture and popup stay with this camera." },
      // "Still image from: …" (1.2.1): the tile's image from another camera.*/image.* –
      // without an entry, automatically a snapshot entity of the same camera (casora-core.js casoraCamStill).
      { key: "still_entity", label: "Still image from", domains: ["camera", "image"], advanced: true,
        placeholder: "Automatic",
        hint: "Optional. Another camera or image entity whose picture the tile shows. Without it, Casora uses a snapshot entity of the same camera if there is one (e.g. Reolink snapshots), otherwise this camera. The popup always shows this camera live." },
      // "Refresh image" (1.2.1): polling interval of the still image as a tile setting (casora-core.js casoraCamRefresh).
      { key: "refresh_s", label: "Refresh image", type: "select", advanced: true, tileLevel: true,
        options: ["5", "", "30", "60"],
        optionLabels: { "5": "Every 5 seconds", "": "Every 10 seconds", "30": "Every 30 seconds", "60": "Every 60 seconds" },
        hint: "How often the tile fetches a new still image while it is visible. The tile says \"Up to date\" while the picture is fresh and shows its age in the warning color when the camera stops delivering." },
      { key: "alert_window_minutes", label: "Recent activity (minutes)", type: "number", advanced: true, group: "Popup",
        placeholder: "5", hint: "A dot marks a camera with activity in this window." },
      { key: "show_stream_variants", label: "Show stream variants", type: "bool", advanced: true, group: "Popup",
        hint: "Also list snapshot cameras and every stream of a camera (Soft design hides them)." },
    ] },
  { id: "casora_alarm", label: "Alarm", template: "casora_alarm", domains: ["alarm_control_panel"], icon: "shield_check",
    color: "var(--casora-color-red, #FF453A)", fields: [
      // casora_popup_alarm reads alarm_entity before the tile entity; template default: Alarmo.
      { key: "alarm_entity", label: "Popup alarm panel", domains: ["alarm_control_panel"], advanced: true, group: "Popup",
        placeholder: "alarm_control_panel.alarmo", hint: "The alarm the popup arms and disarms." },
      { ...TITLE, placeholder: "Automatic" },
    ] },
  { id: "casora_weather_warning", label: "Weather warning", template: "casora_weather_warning", domains: ["binary_sensor"], classes: ["safety"],
    icon: "attention2", color: "var(--casora-color-orange, #FF9F0A)", fields: [
      ICON,
      { key: "sensors", type: "list", label: "Warning sensors", domains: ["binary_sensor"], classes: ["safety"],
        placeholder: "Add a warning sensor", hint: "E.g. the NINA or DWD warnings for your town." },
      { ...TITLE, placeholder: "Warnings" },
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
      // Same switch as Settings → Home & Devices → Waste collection: a Casora setting for every
      // waste tile, not a tile variable (setting: casora-panel-personal.js, _casoraSettingSwitch).
      { key: "waste.calendar_popup", setting: true, type: "bool", boolDefault: true, advanced: true,
        label: "Calendar in the waste popup", sub: "Month with the pickup days in the bin colors",
        hint: "Applies to all waste tiles" },
      { key: "trash_reminder", label: "Reminder automation", domains: ["automation"], advanced: true },
    ] },
  // Calendar (issue #31): template and popup existed, the Studio did not offer the tile. Which calendars it
  // shows, their names and colors are a Casora setting for every calendar tile (Settings → Calendar), so the
  // tile asks for no calendar of its own (noEntity; the popup anchors on the first one). An entity from
  // older dashboards keeps working. The icon shows today's date, so no icon field.
  { id: "casora_calendar", label: "Calendar", template: "casora_calendar", domains: ["calendar"], noEntity: true,
    icon: "calendar-day", color: "var(--casora-color-red, #FF453A)", fields: [
      { key: "calendars", settingsLink: "calendars", label: "Calendars",
        hint: "Which calendars the tile and popup show, with name and color – the same for every calendar tile." },
      { ...TITLE, placeholder: "Calendar" },
    ] },
  { id: "casora_car", label: "Car", template: "casora_car", domains: ["sensor"], ownData: true, icon: "car_side_w2", fields: [ICON, TITLE] },
  { id: "casora_ebike", label: "E-bike", template: "casora_ebike", domains: ["sensor"], ownData: true, icon: "ebike", fields: [ICON, TITLE] },
  // Underfloor heating: thermostat tile with a Casora popup – behaves like a thermostat
  // (like) but has its own name and id, otherwise "Thermostat" would appear twice in the picker.
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
  // Switch: tiles migrated from Hemma 1 and older versions (…_switch) and new ones – sockets, pumps, lamps on a switch.
  { id: "casora_switch", label: "Switch", template: "casora_switch", domains: ["switch"], icon: "power_on",
    color: "var(--casora-color-teal, #00C3D0)", fields: [
      ICON,
      { key: "show_toggle", label: "Toggle button", type: "bool", boolDefault: false },
      TITLE_NAME,
    ] },
  // Football (07.10.2026): one Team Tracker sensor per tile. The tile reads team, opponent, league and crest
  // from the sensor (scripts/local/11-fussball.js); TILE_MAIN_FIND in the panel only suggests Team Tracker sensors.
  { id: "casora_football", label: "Football", template: "casora_football", domains: ["sensor"], icon: "soccer",
    color: "var(--casora-color-green, #30D158)", entityLabel: "Team (Team Tracker)",
    entityPlaceholder: "A Team Tracker sensor", fields: [
      { key: "show_when_match", label: "Show", type: "select", options: ["", "week", "matchday", "around", "live"],
        optionLabels: { "": "Always", week: "In match weeks", matchday: "On match day",
          around: "Around the match", live: "Only live" },
        hint: "In match weeks: from 7 days before a match. During a match the tile always shows; afterwards it keeps the result until the next morning." },
      { key: "hours_before", label: "Hours before kick-off", type: "number", placeholder: "3",
        when: (v) => v.show_when_match === "around" },
      { key: "hours_after", label: "Show the result for (hours)", type: "number", placeholder: "Until the next morning",
        when: (v) => ["week", "matchday", "around"].includes(v.show_when_match) },
      TITLE_NAME,
    ] },
  // Pulse (battery/radio watchdog, own integration): tile + popup from the Pulse entities
  // (scripts/local/14-pulse.js). Main entity = Pulse's "Problems" sensor (finds itself);
  // only offered when Pulse is installed (onlyIf), the device assistant suggests it for the home page.
  { id: "casora_pulse", label: "Pulse", template: "casora_pulse", domains: ["sensor"], ownData: true, icon: "pulse",
    color: "var(--casora-color-green, #30D158)", entityLabel: "Pulse problems", entityPlaceholder: "Automatic",
    onlyIf: (hass) => !!(hass && hass.entities && Object.values(hass.entities).some((e) => e && e.platform === "pulse")),
    fields: [ICON, { ...TITLE, placeholder: "Pulse" }] },
  // Robot mower (community card 1.5, from a card request): any lawn_mower entity; battery, connection and
  // "park until further notice" are found by scripts/local/16-maeher.js on the same device. Gardena also
  // provides activity and error code as attributes.
  { id: "casora_lawn_mower", label: "Robot lawn mower", template: "casora_lawn_mower", domains: ["lawn_mower"],
    icon: "lawn-mower", color: "var(--casora-color-green, #30D158)", entityLabel: "Lawn mower",
    community: { desc: "Status, battery and connection. Mow, pause, back to the station and park. More details for Gardena.",
      needs: "lawn_mower", needsText: "For every robot lawn mower in Home Assistant",
      needsMissing: "No robot lawn mower in Home Assistant yet" },
    fields: [ICON, TITLE_NAME] },
  // Pet tracker (community card, card request #25): every Tractive device_tracker; battery, status, live tracking,
  // sound, light and activity come from the pet and its tracker device (scripts/local/26-haustier.js).
  { id: "casora_pet", label: "Pet tracker", template: "casora_pet", domains: ["device_tracker"],
    icon: "paw", color: "var(--casora-color-teal, #00C3D0)", entityLabel: "Pet", entityPlaceholder: "Choose your pet",
    community: { desc: "Where your pet is, battery and tracker status on the tile. The popup shows the map, live tracking, sound and light, today's activity against the daily goal, rest, sleep and the places of the last days. For Tractive.",
      needs: "tractive", needsText: "For every pet in the Tractive integration",
      needsMissing: "Tractive integration not installed yet" },
    fields: [ICON, TITLE_NAME] },
  // Frigate (community card, from card request #22): camera tile for cameras of the Frigate integration
  // (only Frigate sets device_class "camera"), plus detections, snapshots and switches on the same device
  // (scripts/local/23-frigate.js). Fields like the camera tile, without the popup fields of the camera overview.
  { id: "casora_frigate", label: "Frigate camera", template: "casora_frigate", domains: ["camera"], classes: ["camera"],
    icon: "camera", entityLabel: "Frigate camera",
    // "Seen" (frigate/reviews/viewed) applies per Frigate user = the integration's user (23-frigate.js F.mark).
    community: { desc: "Live camera with what Frigate detected last. The popup shows the live view, alerts and detections with clip, download, share and favorite, the recordings of the last days with a timeline, objects and the camera switches. “Seen” is stored by Frigate for the user the integration signs in with – so everyone in Home Assistant shares the same state.",
      needs: "frigate", needsText: "For every camera of the Frigate integration",
      needsMissing: "Frigate integration not installed yet", darkShots: true },
    fields: [ICON, TITLE_NAME,
      { key: "status_entity", label: "Status from", domains: ["camera", "binary_sensor"],
        classes: { binary_sensor: ["connectivity"] }, advanced: true, placeholder: "This camera",
        hint: "Optional. Another camera or a connection sensor that tells whether the camera is reachable, e.g. when the picture comes through a proxy (go2rtc, Frigate, Scrypted) that stays ready although the camera is gone. Picture and popup stay with this camera." },
      { key: "refresh_s", label: "Refresh image", type: "select", advanced: true, tileLevel: true,
        options: ["5", "", "30", "60"],
        optionLabels: { "5": "Every 5 seconds", "": "Every 10 seconds", "30": "Every 30 seconds", "60": "Every 60 seconds" },
        hint: "How often the tile fetches a new still image while it is visible. The tile says \"Up to date\" while the picture is fresh and shows its age in the warning color when the camera stops delivering." },
      // Frigate 2: live image instead of a still (23-frigate.js tileWatch) – only while visible and in front, else torn down.
      { key: "live_tile", label: "Live on the tile", type: "bool", boolDefault: false, advanced: true, tileLevel: true,
        hint: "Plays the muted live stream on the tile instead of the still image – only while the tile is visible and the page is open, so it uses more data only then. Without a stream (or if it fails) the tile keeps the still image." },
    ] },
  // Reolink doorbell (community card, from card request #23): camera tile for the live camera of a Reolink
  // doorbell (device with the "visitor" doorbell button), plus rings, detections, quick replies, siren and
  // settings on the same device (scripts/local/24-klingel.js). "Talk" is experimental and off by default.
  { id: "casora_reolink_doorbell", label: "Reolink doorbell", template: "casora_reolink_doorbell", domains: ["camera"],
    icon: "doorbell", entityLabel: "Doorbell camera",
    onlyIf: (hass) => !!(hass && hass.entities && Object.values(hass.entities).some((e) => e && e.translation_key === "visitor")),
    community: { desc: "Doorbell with live picture that says when someone rang. The popup has the live view with sound, quick replies, the siren, who rang lately and the doorbell's settings.",
      needs: "reolink", needsText: "For every Reolink doorbell", needsMissing: "Reolink integration not installed yet",
      darkShots: true },
    fields: [ICON, TITLE_NAME,
      { key: "still_entity", label: "Still image from", domains: ["camera", "image"], advanced: true,
        placeholder: "Automatic",
        hint: "Optional. Another camera or image entity whose picture the tile shows. Without it, Casora uses a snapshot entity of the same camera if there is one (e.g. Reolink snapshots), otherwise this camera. The popup always shows this camera live." },
      { key: "refresh_s", label: "Refresh image", type: "select", advanced: true, tileLevel: true,
        options: ["5", "", "30", "60"],
        optionLabels: { "5": "Every 5 seconds", "": "Every 10 seconds", "30": "Every 30 seconds", "60": "Every 60 seconds" },
        hint: "How often the tile fetches a new still image while it is visible. The tile says \"Ready\" while the picture is fresh and shows its age in the warning color when the doorbell stops delivering." },
      { key: "talk", label: "Talk (experiment)", type: "bool", advanced: true, group: "Popup",
        hint: "Adds a Talk button under the live picture: your microphone goes to the doorbell through Home Assistant's own WebRTC connection. Only works over HTTPS, with the doorbell connected in your network (RTSP), and only if the doorbell accepts it – many Reolink doorbells don't. If it doesn't, the popup says so and listening keeps working." },
      // Second camera (#23): switcher on the live image in the popup; large image while listening/talking (tablet request).
      { key: "camera2", label: "Second camera", domains: ["camera"], group: "Popup",
        hint: "Optional. Another camera, for example the entrance. The popup then shows a switch on the live picture to change between the doorbell and this camera. Talking always goes to the doorbell." },
      { key: "big_on_audio", label: "Large picture when listening/talking", type: "bool", boolDefault: true, advanced: true, group: "Popup",
        hint: "Tapping Listen or Talk opens the live picture large over the popup. Close it with ×, Esc or by swiping down." },
    ] },
  // Coffee machine (community card, card request): pick one entity of the device (status, power or
  // drink selection); scripts/local/25-kaffee.js finds the rest on the device – Home Connect, Miele, De'Longhi, Jura,
  // Melitta/Nivona, La Marzocco or a smart plug with power metering.
  { id: "casora_coffee", label: "Coffee machine", template: "casora_coffee", domains: ["sensor", "switch", "select"],
    icon: "coffee-maker", color: "var(--casora-color-teal, #00C3D0)", entityLabel: "Coffee machine",
    community: { desc: "Ready, heating up or brewing with progress, and what the machine needs: water, beans, drip tray, descaling. The popup starts drinks with strength and amount, shows care and how many coffees you made. For Home Connect, Miele, De'Longhi, Jura, Melitta, La Marzocco or a smart plug." },
    fields: [ICON, TITLE_NAME] },
  // Aquarium overview (Hemma 1 and older versions "…_aquarium"): up to three tanks in one tile. Only for
  // editing migrated tiles – new tanks get the aquarium tile (casora_aquarium_tank).
  { id: "casora_aquariums", label: "Aquariums", template: "casora_aquarium", hidden: true, domains: ["sensor"],
    classes: ["temperature"], entityLabel: "Water temperature", icon: "fish", fields: [
      ICON,
      { key: "entity_freshwater", label: "Freshwater tank", domains: ["sensor"], classes: ["temperature"] },
      { key: "entity_saltwater", label: "Saltwater tank", domains: ["sensor"], classes: ["temperature"] },
      { key: "entity_turtle", label: "Turtle tank", domains: ["sensor"], classes: ["temperature"] },
      TITLE,
    ] },
];

// Community cards (1.5): tile types with `community: {desc, needs?, preview?}` – built from card requests,
// they ship with the release but only show in "Add a tile" once added under Community
// (window.casoraCommunityOn, casora-panel-community.js). The Studio always recognizes existing tiles.
//   desc   – short description (English, translation in translations/panel)
//   needs  – integration (domain) the card needs; if it is missing, a hint says so
//   needsText / needsMissing – readable hint for it (otherwise "Needs <integration>")
//   preview – preview image, otherwise /casora_assets/community/<id>.webp; popup image optional <id>-popup.webp
//   darkShots – own preview images for the dark profile: <id>-dark.webp / <id>-popup-dark.webp (falls back to light)
//   retired – card is discontinued: no longer in the community list (except for those who added it –
//            there only "Remove") and never again in "Add a tile"; existing tiles keep
//            working, the editor shows a hint. A later release can then delete the tile type and template.
window.casoraCommunityType = (t) => {
  if (!t || !t.community || t._communityWrapped) return t;
  const own = t.onlyIf;
  t.onlyIf = (hass) => !t.community.retired && !!(window.casoraCommunityOn && window.casoraCommunityOn.has(t.id)) && (!own || own(hass));
  if (t.community.retired && Array.isArray(t.fields) && t.fields.length) {
    t.fields = [{ ...t.fields[0], hint: "This Community card is being retired. Your tiles keep working for now; a later update removes it." }].concat(t.fields.slice(1));
  }
  t._communityWrapped = true;
  return t;
};
window.CASORA_TILE_TYPES.forEach(window.casoraCommunityType);

// Symbole, die Casora mitliefert, aber das Panel nicht kennt (Auswahlliste + Kachelliste).
window.CASORA_EXTRA_ICONS = Object.fromEntries([
  "3D_Printer", "dryer", "dishwasher", "fish", "camera", "attention2", "sun", "trash", "car", "car_side",
  "car_side_w2", "ebike", "chef-hat", "shield_check", "shield_lock", "shield_moon", "shield_off",
  "shield_alarm", "shield_bypass", "shield_vacation", "calendar", "calendar-day", "window-open",
  "window-closed", "heating_coil", "wind", "rooms", "soccer", "pulse", "lawn-mower", "coffee-maker", "paw",
  "coffee-espresso", "coffee-doppio", "coffee-cup", "coffee-cappuccino", "coffee-latte", "coffee-tall", "coffee-water",
  "coffee-milk", "coffee-tea",
].map((n) => [n, "/casora_assets/icons/" + n + ".svg"]));

// Preview: show conditional cards (type: conditional) as the dashboard does –
// invisible while the condition is not met, otherwise the card inside.
// Returns: {hidden: true} | {inner: <card>} | {} (draw unchanged).
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
    return true; // show screen, user, time …
  }
  // Cards the dashboard actually shows at this spot (0, 1 or more).
  function shown(card, states) {
    if (!card || typeof card !== "object") return [];
    if (card.type === "custom:button-card") return [card];
    if (card.type === "conditional") {
      if (!(card.conditions || []).every((c) => check(c, states))) return [];
      return shown(card.card, states);
    }
    if (card.type === "custom:auto-entities") {
      // Only explicit entries (entity_id + optional state) – as in Casora's dashboards.
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
    // Swipe card: the first tile in it stands in for it.
    if (Array.isArray(card.cards)) {
      for (const c of card.cards) { const s = shown(c, states); if (s.length) return [s[0]]; }
    }
    return [];
  }
  // Pages of a swipe card – also when it sits inside a condition or auto-entities collects its
  // pages (air purifiers, aquariums). Otherwise 0. Previously collected pages sat side by side in the
  // preview and came and went with every toggle (flicker).
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
    // Swipe card: one tile as on the dashboard, plus page dots for the others.
    if (cards.length === 1 && tile.type !== "conditional" && Array.isArray(tile.cards)) {
      const pages = tile.cards.filter((c) => shown(c, (hass && hass.states) || {}).length).length;
      return { inner: cards[0], pages };
    }
    return cards.length === 1 ? { inner: cards[0] } : { cards };
  };
})();

// Preview: icon and state text of Casora tiles from their template chain,
// so the preview shows the same as the dashboard (state_display runs with
// the same values). Errors silently fall back to the panel behavior.
(() => {
  // Fallback for device states when the template builds its text via a module
  // not loaded in the panel (e.g. washing machine via _casoraLaundry).
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
  // Also tile types with a template list (underfloor heating: casora_thermostat + casora_popup_fbh).
  const OURS_ANY = new Set((window.CASORA_TILE_TYPES || []).flatMap((t) => names(t.template)));
  const isOursAny = (tile) => names(tile && tile.template).some((n) => OURS_ANY.has(n));

  function resolve(templates, list, seen = new Set()) {
    const out = { variables: {} };
    for (const n of names(list)) {
      if (seen.has(n) || !templates || !templates[n]) continue;
      seen.add(n);
      const t = templates[n];
      const base = resolve(templates, t.template, seen);
      Object.assign(out.variables, base.variables, t.variables || {});
      for (const k of ["state_display", "icon", "entity_picture", "entity", "name"]) {
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
    // Like button-card: evaluate variables in order, later ones see earlier ones.
    for (const k of Object.keys(variables)) {
      const v = variables[k];
      if (typeof v === "string" && v.includes("[[[")) {
        try { variables[k] = run(v, ctx); } catch (e) { variables[k] = undefined; }
      }
    }
    return ctx;
  }

  // Room climate (casora_vent) and solar tip (casora_solar_tip) build their text via
  // window._casoraVent / _casoraSolar from scripts/local/05-standard-medien.js – without the
  // module the preview only said "Off". Load it once (pure functions, no cards).
  let medien = false, fussball = false, kaffee = false;
  const needMedien = (tile) => {
    const tn = names(tile && tile.template);
    // Coffee machine: state ("Ready", "Cappuccino · 40 %") via window._casoraCoffee (scripts/local/25-kaffee.js);
    // without the module the preview showed the integration's raw state ("Brewing").
    if (!kaffee && !window._casoraCoffee && tn.includes("casora_coffee")) {
      kaffee = true;
      import("/casora_scripts/local/25-kaffee.js").catch(() => {});
    }
    // Football: text ("Sat 18:30 · vs …") from window._casoraFootball (scripts/local/11-fussball.js).
    if (!fussball && !window._casoraFootball && tn.includes("casora_football")) {
      fussball = true;
      import("/casora_scripts/local/11-fussball.js").catch(() => {});
    }
    if (medien || (window._casoraVent && window._casoraSolar)) return;
    if (!tn.some((n) => n === "casora_vent" || n === "casora_solar_tip")) return;
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
        // Numbers: round sensibly and append the unit (e.g. 1191.59 → "1.192 km").
        const n = Number(ent.state);
        const unit = ent.attributes && ent.attributes.unit_of_measurement;
        if (ent.state !== "" && Number.isFinite(n)) {
          const digits = Math.abs(n) >= 100 ? 0 : 1;
          const txt = n.toLocaleString(lang, { maximumFractionDigits: digits });
          // English without a space before % ("62%"), like HA itself.
          return unit ? txt + (unit === "%" && lang === "en" ? "" : " ") + unit : txt;
        }
        // HA's German "Ein" reads "An" on the dashboard (casora-i18n.js).
        const f = hass && hass.formatEntityState ? hass.formatEntityState(ent) : null;
        return f === "Ein" ? "An" : f;
      };
      if (!tpl.state_display) return fallback();
      let v;
      try { v = run(tpl.state_display, ctxFor(tile, ent, hass, tpl)); } catch (e) { return fallback(); }
      if (v == null || v === "") return fallback();
      if (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v).trim())) return fallback();
      // A template without its module often returns just the raw state ("off") → translate.
      if (String(v).trim() === String(ent.state)) return fallback();
      // DOMParser instead of a div: a detached div loads <img> and runs onerror.
      // Template texts are German; the dashboard translates them in button-card (casora-i18n.js),
      // the preview does it here – otherwise an English UI showed "3 Räume" or "Bereit" (07.10.2026).
      const tv = typeof window.casoraTr === "function" ? window.casoraTr(String(v)) : String(v);
      const d = new DOMParser().parseFromString(tv, "text/html");
      return ((d.body && d.body.textContent) || "").trim() || null;
    } catch (e) {
      return null;
    }
  };

  // Entity as on the dashboard: tiles without their own entity whose template picks it itself
  // (alarm: alarm_entity, Alarmo by default). Previously the preview said "Device missing" while the
  // dashboard showed the tile as "Alarmo · Zuhause" (user test 6, H-T4).
  window.casoraTileEntity = (tile, hass, templates) => {
    if (!tile || tile.entity) return (tile && tile.entity) || null;
    if (!isOursAny(tile)) return null;
    try {
      const tpl = resolve(templates, tile.template);
      if (typeof tpl.entity !== "string" || !tpl.entity) return null;
      const id = tpl.entity.includes("[[[") ? run(tpl.entity, ctxFor(tile, null, hass, tpl)) : tpl.entity;
      return typeof id === "string" && hass && hass.states && hass.states[id] ? id : null;
    } catch (e) {
      return null;
    }
  };

  // Name as on the dashboard (name of the template chain, e.g. casora_entity: the entity's display name,
  // warning tile "Warnings"). Empty (no entity, depending on the design) → the preview keeps the name of the
  // tile type. null = nothing of its own.
  window.casoraTileName = (tile, ent, hass, templates) => {
    if (!tile || tile.name || !isOursAny(tile)) return null;
    try {
      const tpl = resolve(templates, tile.template);
      const v = run(tpl.name, ctxFor(tile, ent, hass, tpl));
      return typeof v === "string" && v.trim() && !v.includes("<") ? v.trim() : null;
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

// Editor helpers for Casora tiles: device finder as placeholder and "Complete with AI".
(() => {
  // The same finder as on the dashboard (scripts/local/00-finder.js) – no DOM, registry only.
  if (!window.casoraDevice) import("/casora_scripts/local/00-finder.js").catch(() => {});
  // Dashboard translation (German → user language) for texts the preview takes over from the
  // dashboard scripts (e.g. security subline "Alles sicher", 07.10.2026).
  if (!window.casoraTr) import("/casora_scripts/casora-i18n.js").catch(() => {});
  // Chart card (1.2) for the optional sparklines in the preview.
  if (!window.casoraChart) import("/casora_scripts/casora-chart.js").catch(() => {});

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
    const r = hass && hass.entities && hass.entities[id];
    return (r && r.name) || (s && s.attributes && s.attributes.friendly_name) || id;
  };

  function found(f, tile, hass) {
    const CD = window.casoraDevice;
    if (!CD || !f.find || !tile || !tile.entity || !hass) return null;
    try {
      // The finder's own search (e.g. vacuum card: vacuumMap).
      if (f.find.fn) return (typeof CD[f.find.fn] === "function" && CD[f.find.fn](hass, tile.entity)) || null;
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
  // The entered entity does not exist (anymore): hint at what is used instead.
  window.casoraFieldMissing = (f, tile, hass, cur) => {
    if (!f.find || !f.find.fn || !cur || typeof cur !== "string" || !hass || (hass.states || {})[cur]) return null;
    const id = found(f, tile, hass);
    const de = lang(hass) === "de";
    if (!id) return de ? "Eingetragene Entität fehlt – keine Karte gefunden." : "The chosen entity is missing – no map found.";
    return (de ? "Eingetragene Entität fehlt – automatisch: " : "The chosen entity is missing – automatic: ") + nameOf(hass, id);
  };
  // The found entity itself (to prefill new tiles in the Studio).
  window.casoraFieldEntity = (f, tile, hass) => found(f, tile, hass);
  window.casoraFieldFound = (f, tile, hass) => {
    const id = found(f, tile, hass);
    if (!id) return null;
    // Only a real name, never the entity ID ("Auto" instead of "Auto: sensor.time").
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

  // Candidates: entities on the tile's device and in the same area; without a tile entity
  // every entity of the domains the tile needs.
  function candidates(hass, tile, domains) {
    const R = hass.entities || {}, D = hass.devices || {}, S = hass.states || {};
    // Diagnostic entities stay out, device_trackers not (the pet tile's tracker, issue #25).
    const category = (window.__casoraPanelInternals || {}).listCategory || ((id, e) => e.entity_category);
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
      if (e && (e.hidden || category(id, e) === "diagnostic")) return false;
      if (!anchor) return true;
      if (e && dev && (e.device_id === dev || (D[e.device_id] || {}).via_device_id === dev)) return true;
      // Off the device only switches in the same room (smart plugs) – otherwise
      // the AI picks the wrong one, e.g. for the dryer.
      if (dev && !id.startsWith("switch.")) return false;
      return !!area && areaOf(id) === area;
    });
    return out.slice(0, 400).map((id) => {
      const s = S[id], e = R[id] || {};
      const d = D[e.device_id] || {};
      return { id, name: e.name || (s.attributes && s.attributes.friendly_name) || id,
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
    // Without extra fields only if the tile needs a device – not for tiles that find their data
    // themselves (solar tip, room climate, car, e-bike, recipe).
    if (!fields.length && (tile.entity || type.ownData || type.noEntity)) return;
    const row = document.createElement("div");
    row.className = "hint casora-ai";
    row.dataset.noI18n = "";
    row.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;padding-bottom:10px";
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

// Hemma → Casora: translate dashboards from Hemma (import) into Casora names.
// Same rule as the casora.umstellen service (umstellen.py):
//   • "hemma" → "casora" in templates, cards, CSS variables and template JS,
//   • entities only if they belong to Casora (panel/umbenennung.json), otherwise they
//     stay – e.g. sensors from your own packages,
//   • your own files under /local/hemma/ and dashboard URLs stay.
// Renamed copies (every "hemma" e.g. as "zuhaus") the same way, with their prefix.
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
  // Renamed Hemma copy ("zuhaus_room", "--zuhaus-…", /local/zuhaus/): the dashboard's
  // prefix. The pages start with a room card "<prefix>_room", and the templates
  // (if any) mostly carry the same prefix. Otherwise null.
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
    // Prefixes other than "hemma" only at the start of a word – not inside a foreign word.
    const at = pre === "hemma" ? "" : "(?<![A-Za-z])";
    const up = pre.toUpperCase();
    s = s.replace(new RegExp("/" + pre + "-studio", "g"), "/casora-studio");
    s = s.replace(new RegExp("\\b([a-z_]+)\\.(" + pre + "_[a-z0-9_]*)", "g"), (m, d, o) => (DOMAINS.has(d) && !isOwn(o, pre) ? hold(m) : m));
    s = s.replace(new RegExp("/local/" + pre + "/", "g"), hold);
    s = s.replace(new RegExp("([\"'(\\s])(/[a-z0-9-]*" + pre + "[a-z0-9-]*)(?=[/\"'?#])", "g"), (m, a, b) => a + hold(b));
    s = s.replace(new RegExp(at + pre, "gi"), (w) => (w === up ? "CASORA" : w[0] !== w[0].toLowerCase() ? "Casora" : "casora"));
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
  }
  // prefix: prefix of a renamed copy (e.g. "zuhaus"); "hemma" is always translated as well.
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
