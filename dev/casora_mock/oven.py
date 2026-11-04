"""Two made-up ovens (oven popup v3), always present, names invented.

* "Testofen" – as Home Connect Local (HACS, platform homeconnect_ws, chris-mc1/homeconnect_local_hass and its forks)
  creates a Bosch/Siemens oven with German names: translation_key = the entity description's key
  (entity_descriptions/common.py, cooking.py, sensor.py): sensor_operation_state, select_program (program keys
  lower-cased, "." → "_", CamelCase not split: cooking_oven_program_heatingmode_hotair), sensor_active_program,
  binary_sensor_door_state (a door with two states), sensor_oven_current_temperature, number_oven_setpoint_temperature,
  sensor_remaining_program_time (seconds, shown in hours), sensor_program_progress, select_power_state (the power as a
  select: on/standby), switch_child_lock, switch_oven_fast_pre_heat, binary_remote_start_allowed,
  binary_sensor_remote_control_active, binary_sensor_interior_illumination (read only), connection, button_start_program,
  button_pause_program, button_resume_program, button_abort_program.
* "Testbackofen" – as Home Connect in HA core creates it (homeassistant/components/home_connect): operation_state,
  selected_program/active_program (cooking_oven_program_heating_mode_…), door (enum sensor),
  oven_current_cavity_temperature, setpoint_temperature, program_progress, program_finish_time, stop_program, power,
  child_lock, remote_start. Registered under the platform "home_connect" (registry_platform, states written directly,
  like velair.py): Casora tells an oven from a Liebherr fridge by the platform – by keys alone the oven's
  setpoint_temperature would read as a single-zone fridge, which no real house shows.

The Local oven runs under casora_mock (Casora recognises it by the translation_keys, switches and buttons work). The
entity ids follow the integrations' German names.
"""
from __future__ import annotations

WS = "testofen"
HC = "testbackofen"
WSP = "cooking_oven_program_heatingmode_"
WS_PROGRAMS = [WSP + x for x in (
    "topbottomheating", "topbottomheatingeco", "hotair", "hotaireco", "hotairgrilling", "grilllargearea", "grillsmallarea",
    "bottomheating", "intensiveheat", "pizzasetting", "slowcook", "keepwarm", "preheatovenware", "frozenheatupspecial",
    "desiccation", "defrost")]
HCP = "cooking_oven_program_heating_mode_"
HC_PROGRAMS = [HCP + x for x in (
    "top_bottom_heating", "hot_air", "hot_air_eco", "hot_air_grilling", "grill_large_area", "bottom_heating",
    "intensive_heat", "pizza_setting", "keep_warm", "pre_heating")]
OPS = ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"]


def _e(dev, eid, state, key, name, attrs=None, dc=None, unit=None, cat=None, platform=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    e = {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev,
         "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
         "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat}
    if platform:
        e["registry_platform"] = platform
        e["unique_id"] = f"oven_mock_{eid.split('.', 1)[1]}"
    return e


def extra(now) -> dict:
    m = {"state_class": "measurement"}
    w = lambda *a, **k: _e(WS, *a, **k)  # noqa: E731
    h = lambda *a, **k: _e(HC, *a, platform="home_connect", **k)  # noqa: E731
    ents = [
        # Home Connect Local (homeconnect_ws), the entities a Bosch oven reports (settings left out but two)
        w(f"sensor.{WS}_betriebszustand", "inactive", "sensor_operation_state", "Testofen Betriebszustand", {"options": OPS}, dc="enum"),
        # The power state as a select when it is not a plain on/off (generate_power_select): same German name.
        w(f"select.{WS}_betriebszustand", "standby", "select_power_state", "Testofen Betriebszustand", {"options": ["on", "standby"]}),
        w(f"select.{WS}_ausgewahltes_programm", WSP + "hotair", "select_program", "Testofen Ausgewähltes Programm",
          {"options": WS_PROGRAMS}),
        w(f"sensor.{WS}_aktives_programm", "unknown", "sensor_active_program", "Testofen Aktives Programm",
          {"options": WS_PROGRAMS}, dc="enum"),
        w(f"select.{WS}_aktiver_heizmodus", "unknown", "select_oven_used_heating_mode", "Testofen Aktiver Heizmodus",
          {"options": ["hotair", "bottomheating", "topbottomheating"]}),
        w(f"binary_sensor.{WS}_tur", "off", "binary_sensor_door_state", "Testofen Tür", dc="door"),
        w(f"sensor.{WS}_tur", "closed", "sensor_door_state", "Testofen Tür", {"options": ["open", "closed", "locked", "ajar"]}, dc="enum"),
        w(f"sensor.{WS}_aktuelle_temperatur", "20", "sensor_oven_current_temperature", "Testofen Aktuelle Temperatur", m,
          dc="temperature", unit="°C"),
        w(f"number.{WS}_sollwert_temperatur", "180", "number_oven_setpoint_temperature", "Testofen Sollwert Temperatur",
          {"min": 30, "max": 275, "step": 5, "mode": "auto"}, dc="temperature", unit="°C"),
        w(f"sensor.{WS}_verbleibende_programmlaufzeit", "unknown", "sensor_remaining_program_time",
          "Testofen Verbleibende Programmlaufzeit", dc="duration", unit="h"),
        w(f"sensor.{WS}_programmfortschritt", "unknown", "sensor_program_progress", "Testofen Programmfortschritt", unit="%"),
        w(f"sensor.{WS}_starten_in", "unknown", "sensor_start_in", "Testofen Starten in", dc="duration", unit="h"),
        w(f"switch.{WS}_kindersicherung", "off", "switch_child_lock", "Testofen Kindersicherung"),
        w(f"switch.{WS}_schnelles_vorheizen", "off", "switch_oven_fast_pre_heat", "Testofen Schnelles Vorheizen"),
        w(f"switch.{WS}_tastentone", "on", "switch_oven_button_tones", "Testofen Tastentöne", cat="config"),
        w(f"binary_sensor.{WS}_fernstart_erlaubt", "off", "binary_remote_start_allowed", "Testofen Fernstart erlaubt"),
        w(f"binary_sensor.{WS}_fernbedienung_aktiv", "on", "binary_sensor_remote_control_active", "Testofen Fernbedienung aktiv"),
        w(f"binary_sensor.{WS}_innenbeleuchtung", "off", "binary_sensor_interior_illumination", "Testofen Innenbeleuchtung"),
        w(f"binary_sensor.{WS}_verbindung", "on", "connection", "Testofen Verbindung", dc="connectivity", cat="diagnostic"),
        w(f"binary_sensor.{WS}_cloud_verbindung", "on", "binary_sensor_backend_connected", "Testofen Cloud-Verbindung",
          dc="connectivity", cat="diagnostic"),
        w(f"button.{WS}_start", "unknown", "button_start_program", "Testofen Start"),
        w(f"button.{WS}_pause", "unknown", "button_pause_program", "Testofen Pause"),
        w(f"button.{WS}_fortsetzen", "unknown", "button_resume_program", "Testofen Fortsetzen"),
        w(f"button.{WS}_abbrechen", "unknown", "button_abort_program", "Testofen Abbrechen"),
        # Home Connect in HA core
        h(f"sensor.{HC}_betriebszustand", "ready", "operation_state", "Testbackofen Betriebszustand", {"options": OPS}, dc="enum"),
        h(f"select.{HC}_ausgewahltes_programm", HCP + "top_bottom_heating", "selected_program",
          "Testbackofen Ausgewähltes Programm", {"options": HC_PROGRAMS}),
        h(f"select.{HC}_aktives_programm", "unknown", "active_program", "Testbackofen Aktives Programm", {"options": HC_PROGRAMS}),
        h(f"sensor.{HC}_tur", "closed", "door", "Testbackofen Tür", {"options": ["open", "closed", "locked"]}, dc="enum"),
        h(f"sensor.{HC}_aktuelle_garraumtemperatur", "21", "oven_current_cavity_temperature",
          "Testbackofen Aktuelle Garraumtemperatur", m, dc="temperature", unit="°C"),
        h(f"number.{HC}_solltemperatur", "200", "setpoint_temperature", "Testbackofen Solltemperatur",
          {"min": 30, "max": 275, "step": 5, "mode": "auto"}, dc="temperature", unit="°C"),
        h(f"sensor.{HC}_programm_fortschritt", "unknown", "program_progress", "Testbackofen Programm-Fortschritt", unit="%"),
        h(f"sensor.{HC}_programm_endzeit", "unknown", "program_finish_time", "Testbackofen Programm-Endzeit", dc="timestamp"),
        h(f"button.{HC}_programm_stoppen", "unknown", "stop_program", "Testbackofen Programm stoppen"),
        h(f"switch.{HC}_einschalter", "on", "power", "Testbackofen Einschalter"),
        h(f"switch.{HC}_kindersicherung", "off", "child_lock", "Testbackofen Kindersicherung"),
        h(f"binary_sensor.{HC}_fernstart", "on", "remote_start", "Testbackofen Fernstart"),
    ]
    return {
        "devices": [{"key": WS, "name": "Testofen", "manufacturer": "Bosch", "model": "HBG7 (Test)", "area": None},
                    {"key": HC, "name": "Testbackofen", "manufacturer": "Siemens", "model": "HB7 (Test)", "area": None}],
        "entities": ents,
        # Cavity at room temperature, one baking in the evening.
        "_history": {
            f"sensor.{WS}_aktuelle_temperatur": {"base": 20, "wave": 0.4, "noise": 0.2, "digits": 0, "bumps": [[18.5, 160, 1.2]]},
            f"sensor.{HC}_aktuelle_garraumtemperatur": {"base": 21, "wave": 0.4, "noise": 0.2, "digits": 0, "bumps": [[12.5, 180, 1]]},
        },
    }
