"""A made-up dishwasher as Home Connect in HA core creates it with German names (issue #77), always present.

"Testspüler": operation state, selected/active program (select), door (enum sensor), progress, finish time, stop
button, power switch, remote start, the program options Hygiene +, Intensivzone, Halbe Beladung, Extra trocken as
switches, the start time as number start_in_relative (seconds, min/max/step) and the refill/care event sensors
(present / confirmed / off). Entity ids follow HA core's German translations (…_start_in_relativ, …_hygiene,
…_intensivzone). The translation_keys are the integration's (homeassistant/components/home_connect); in the test house
everything runs under casora_mock, Casora recognises the source by the keys. No start button, as in HA core.

Test service (only when Home Connect is not loaded): home_connect.start_selected_program {device_id,
b_s_h_common_option_start_in_relative} – starts the selected program, delayed when a delay is given.
"""
from __future__ import annotations

DEV = "testspueler"
B = "testspuler"
P = "dishcare_dishwasher_program_"
PROGRAMS = [P + x for x in ("eco_50", "auto_2", "intensiv_70", "kurz_60", "quick_45", "glas_40", "night_wash", "machine_care")]
OPS = ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"]
EVENT = ["confirmed", "off", "present"]


def _e(eid, state, key, name, attrs=None, dc=None, unit=None, cat=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    ents = [
        _e(f"sensor.{B}_betriebszustand", "ready", "operation_state", "Testspüler Betriebszustand", {"options": OPS}, dc="enum"),
        _e(f"select.{B}_ausgewahltes_programm", P + "eco_50", "selected_program", "Testspüler Ausgewähltes Programm",
           {"options": PROGRAMS}),
        _e(f"select.{B}_aktives_programm", "unknown", "active_program", "Testspüler Aktives Programm", {"options": PROGRAMS}),
        _e(f"sensor.{B}_tur", "closed", "door", "Testspüler Tür", {"options": ["open", "closed", "locked"]}, dc="enum"),
        _e(f"sensor.{B}_programm_fortschritt", "unknown", "program_progress", "Testspüler Programm-Fortschritt", unit="%"),
        _e(f"sensor.{B}_programm_endzeit", "unknown", "program_finish_time", "Testspüler Programm-Endzeit", dc="timestamp"),
        _e(f"button.{B}_programm_stoppen", "unknown", "stop_program", "Testspüler Programm stoppen"),
        _e(f"switch.{B}_einschalter", "on", "power", "Testspüler Einschalter"),
        _e(f"binary_sensor.{B}_fernstart", "on", "remote_start", "Testspüler Fernstart"),
        _e(f"switch.{B}_hygiene", "off", "hygiene_plus", "Testspüler Hygiene +"),
        _e(f"switch.{B}_intensivzone", "on", "intensiv_zone", "Testspüler Intensivzone"),
        _e(f"switch.{B}_halbe_beladung", "off", "half_load", "Testspüler Halbe Beladung"),
        _e(f"switch.{B}_extra_trocken", "off", "extra_dry", "Testspüler Extra trocken"),
        _e(f"number.{B}_start_in_relativ", "0", "start_in_relative", "Testspüler Start in relativ",
           {"min": 0, "max": 86340, "step": 60, "mode": "auto"}, dc="duration", unit="s"),
        _e(f"sensor.{B}_salz_fast_leer", "off", "salt_nearly_empty", "Testspüler Salz fast leer", {"options": EVENT}, dc="enum"),
        _e(f"sensor.{B}_klarspuler_fast_leer", "off", "rinse_aid_nearly_empty", "Testspüler Klarspüler fast leer",
           {"options": EVENT}, dc="enum"),
        _e(f"sensor.{B}_erinnerung_zur_maschinenpflege", "off", "machine_care_reminder",
           "Testspüler Erinnerung zur Maschinenpflege", {"options": EVENT}, dc="enum"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testspüler", "manufacturer": "Siemens", "model": "SN6 (Test)", "area": None}],
        "entities": ents,
    }


def setup(hass, mock) -> None:
    """home_connect.start_selected_program like the appliance (only while the real integration is missing)."""
    if hass.services.has_service("home_connect", "start_selected_program"):
        return

    async def start(call) -> None:
        delay = int(call.data.get("b_s_h_common_option_start_in_relative") or 0)
        if not hass.states.is_state(f"binary_sensor.{B}_fernstart", "on"):
            return
        prog = (hass.states.get(f"select.{B}_ausgewahltes_programm") or type("S", (), {"state": None})).state
        mock.set(f"sensor.{B}_betriebszustand", "delayedstart" if delay > 0 else "run")
        if delay > 0:
            mock.set(f"number.{B}_start_in_relativ", str(delay))
        elif prog in PROGRAMS:
            mock.set(f"select.{B}_aktives_programm", prog)

    hass.services.async_register("home_connect", "start_selected_program", start)
