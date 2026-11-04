"""Zwei neutrale Waschmaschinen und ein Trockner für das Testhaus (immer dabei, auch ohne private Fixture).

* „Waschmaschine A“ im Keller: Schlüssel wie WashData (ha_washdata) – Zustand, Programm,
  Phase, Fortschritt, Restzeit, Laufzeit, Programmwahl, Erkennung anhalten/fortsetzen,
  Ende erzwingen, „Als entladen markieren“, Empfehlungen, Wartung fällig (binary_sensor mit
  due_tasks), Zähler je Programm (profile_cycle_count), Aufnahme starten/stoppen.
* „Trockner A“ im Keller: WashData-Trockner (Symbol tumble-dryer), aus, keine Wartung fällig.
* „Waschmaschine B“ im Dachboden: Schlüssel wie Home Connect (offizielle Integration) –
  Betriebszustand, Programmfortschritt, Programmende, aktives/gewähltes Programm, Tür,
  Pause/Fortsetzen/Abbrechen.

Im Testhaus läuft alles unter der Plattform casora_mock; Casora erkennt die Quelle dann
über die Kombination der translation_keys (scripts/local/00-finder.js, casoraLaundryFind).
"""
from __future__ import annotations

from datetime import datetime, timedelta

PROGRAMS_HC = [
    "laundry_care_washer_program_cotton", "laundry_care_washer_program_mix",
    "laundry_care_washer_program_easy_care", "laundry_care_washer_program_wool",
]
WD_STATES = ["off", "idle", "starting", "running", "paused", "user_paused", "ending", "finished", "anti_wrinkle",
             "delay_wait", "interrupted", "force_stopped", "rinse", "unknown", "clean"]
HC_STATES = ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"]


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None, category=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": category}


def _profiles(prefix, device, title, rows):
    """WashData-like per-programme counters (sensor.py WasherProfileCountSensor, diagnostic)."""
    out = []
    for slug, name, count, minutes, kwh in rows:
        out.append(_e(f"sensor.{prefix}_profil_{slug}_anzahl", str(count), "profile_cycle_count", device,
                      f"{title} Profil {name} Anzahl",
                      {"icon": "mdi:counter", "state_class": "total", "average_consumption_kwh": kwh,
                       "total_consumption_kwh": round(kwh * count, 2), "average_length_min": minutes,
                       "min_length_min": minutes - 6, "max_length_min": minutes + 7}, category="diagnostic"))
    return out


def extra(now: datetime) -> dict:
    a, b, t = "mock_waschmaschine_a", "mock_waschmaschine_b", "mock_trockner_a"
    end = (now + timedelta(minutes=47)).isoformat()
    ents = [
        # Waschmaschine A – WashData
        _e("sensor.waschmaschine_a_zustand", "running", "washer_state", a, "Waschmaschine A Zustand",
           {"icon": "mdi:washing-machine", "options": WD_STATES, "current_program_guess": "Baumwolle 40",
            "maintenance_due": ["filter_clean"]}, dc="enum"),
        _e("sensor.waschmaschine_a_programm", "Baumwolle 40", "washer_program", a, "Waschmaschine A Programm",
           {"icon": "mdi:file-document-outline"}),
        _e("sensor.waschmaschine_a_aktuelle_phase", "Rinse", "current_phase", a, "Waschmaschine A Aktuelle Phase",
           {"icon": "mdi:water-sync"}),
        _e("sensor.waschmaschine_a_fortschritt", "58", "cycle_progress", a, "Waschmaschine A Fortschritt",
           {"icon": "mdi:progress-clock", "projected_energy_kwh": 0.82, "projected_cost": 0.29}, unit="%"),
        _e("sensor.waschmaschine_a_verbleibende_zeit", "41", "time_remaining", a, "Waschmaschine A Verbleibende Zeit",
           {"icon": "mdi:timer-sand"}, dc="duration", unit="min"),
        _e("sensor.waschmaschine_a_verstrichene_zeit", "3420", "elapsed_time", a, "Waschmaschine A Verstrichene Zeit",
           {"icon": "mdi:timer-outline"}, dc="duration", unit="s"),
        _e("sensor.waschmaschine_a_gesamtdauer", "98", "total_duration", a, "Waschmaschine A Gesamtdauer",
           {"icon": "mdi:timer-check-outline"}, dc="duration", unit="min"),
        _e("sensor.waschmaschine_a_zyklusanzahl", "214", "cycle_count", a, "Waschmaschine A Zyklusanzahl",
           {"icon": "mdi:counter", "state_class": "total", "stored_cycles": 50}, unit="cycles"),
        _e("sensor.waschmaschine_a_energie_gesamt", "86.4", "energy_total", a, "Waschmaschine A Energie gesamt",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        # Spülen zieht ~160 W (Heizen wären ~2 kW) – das Haus meldet nur ~440 W, sonst stand im
        # Energie-Popup ein Verbraucher über dem ganzen Haus (Nutzertest 07.10.2026).
        _e("sensor.waschmaschine_a_aktuelle_leistung", "160", "current_power", a, "Waschmaschine A Aktuelle Leistung",
           {}, dc="power", unit="W"),
        _e("sensor.waschmaschine_a_empfohlene_einstellungen", "2", "suggestions", a,
           "Waschmaschine A Empfohlene Einstellungen",
           {"icon": "mdi:lightbulb-on-outline", "has_actionable_suggestions": True, "suggestions_count": 2,
            "suggested_option_keys": ["off_delay", "min_off_gap"]}, category="diagnostic"),
        _e("binary_sensor.waschmaschine_a_wartung_fallig", "on", "maintenance_due", a, "Waschmaschine A Wartung fällig",
           {"icon": "mdi:wrench-clock", "due_task_ids": ["filter_clean"], "due_tasks": [
               {"id": "filter_clean", "name": "Filter reinigen", "cycles_since": 23, "cycles_interval": 20,
                "days_since": 61, "days_interval": 0}]}),
        _e("button.waschmaschine_a_aufnahme_starten", "unknown", "record_start", a, "Waschmaschine A Aufnahme starten"),
        _e("button.waschmaschine_a_aufnahme_stoppen", "unavailable", "record_stop", a, "Waschmaschine A Aufnahme stoppen"),
        *_profiles("waschmaschine_a", a, "Waschmaschine A", [
            ("baumwolle_40", "Baumwolle 40", 96, 98, 0.84), ("eco_40_60", "Eco 40-60", 61, 165, 0.62),
            ("pflegeleicht", "Pflegeleicht", 38, 72, 0.55), ("schnell_30", "Schnell 30", 19, 31, 0.24)]),
        _e("binary_sensor.waschmaschine_a_lauft", "on", "running", a, "Waschmaschine A Läuft"),
        _e("select.waschmaschine_a_zyklusprogramm", "auto_detect", "program_select", a, "Waschmaschine A Zyklusprogramm",
           {"options": ["auto_detect", "Baumwolle 40", "Eco 40-60", "Pflegeleicht", "Schnell 30"]}),
        _e("button.waschmaschine_a_zyklus_anhalten", "unknown", "pause_cycle", a, "Waschmaschine A Zyklus anhalten"),
        _e("button.waschmaschine_a_zyklus_fortsetzen", "unavailable", "resume_cycle", a, "Waschmaschine A Zyklus fortsetzen"),
        _e("button.waschmaschine_a_zyklusende_erzwingen", "unknown", "force_end_cycle", a, "Waschmaschine A Zyklusende erzwingen"),
        _e("button.waschmaschine_a_als_entladen_markieren", "unavailable", "mark_unloaded", a,
           "Waschmaschine A Als entladen markieren", {"icon": "mdi:basket-check-outline"}),
        # Trockner A – WashData (dryer by its icon), idle, nothing due
        _e("sensor.trockner_a_zustand", "off", "washer_state", t, "Trockner A Zustand",
           {"icon": "mdi:tumble-dryer", "options": WD_STATES, "current_program_guess": "off", "sub_state": "off"}, dc="enum"),
        _e("sensor.trockner_a_programm", "off", "washer_program", t, "Trockner A Programm",
           {"icon": "mdi:file-document-outline", "options": ["Baumwolle schranktrocken", "Pflegeleicht", "none", "unknown"]},
           dc="enum"),
        _e("sensor.trockner_a_aktuelle_phase", "off", "current_phase", t, "Trockner A Aktuelle Phase", {"icon": "mdi:tumble-dryer"}),
        _e("sensor.trockner_a_fortschritt", "0", "cycle_progress", t, "Trockner A Fortschritt", {"icon": "mdi:progress-clock"}, unit="%"),
        _e("sensor.trockner_a_verbleibende_zeit", "unknown", "time_remaining", t, "Trockner A Verbleibende Zeit",
           {"icon": "mdi:timer-sand"}, dc="duration", unit="min"),
        _e("sensor.trockner_a_zyklusanzahl", "53", "cycle_count", t, "Trockner A Zyklusanzahl",
           {"icon": "mdi:counter", "state_class": "total", "stored_cycles": 41}, unit="cycles"),
        _e("sensor.trockner_a_energie_gesamt", "61.2", "energy_total", t, "Trockner A Energie gesamt",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        _e("sensor.trockner_a_aktuelle_leistung", "0.0", "current_power", t, "Trockner A Aktuelle Leistung", {}, dc="power", unit="W"),
        _e("sensor.trockner_a_empfohlene_einstellungen", "0", "suggestions", t, "Trockner A Empfohlene Einstellungen",
           {"icon": "mdi:lightbulb-on-outline", "has_actionable_suggestions": False, "suggestions_count": 0},
           category="diagnostic"),
        _e("binary_sensor.trockner_a_wartung_fallig", "off", "maintenance_due", t, "Trockner A Wartung fällig",
           {"icon": "mdi:wrench-clock", "due_task_ids": [], "due_tasks": []}),
        _e("binary_sensor.trockner_a_lauft", "off", "running", t, "Trockner A Läuft"),
        _e("select.trockner_a_zyklusprogramm", "auto_detect", "program_select", t, "Trockner A Zyklusprogramm",
           {"options": ["auto_detect", "Baumwolle schranktrocken", "Pflegeleicht"]}),
        _e("button.trockner_a_zyklusende_erzwingen", "unknown", "force_end_cycle", t, "Trockner A Zyklusende erzwingen"),
        _e("button.trockner_a_als_entladen_markieren", "unavailable", "mark_unloaded", t,
           "Trockner A Als entladen markieren", {"icon": "mdi:basket-check-outline"}),
        *_profiles("trockner_a", t, "Trockner A", [
            ("baumwolle_schranktrocken", "Baumwolle schranktrocken", 44, 145, 1.36), ("pflegeleicht", "Pflegeleicht", 9, 88, 0.7)]),
        # Waschmaschine B – Home Connect
        _e("sensor.waschmaschine_b_betriebszustand", "run", "operation_state", b, "Waschmaschine B Betriebszustand",
           {"options": HC_STATES}, dc="enum"),
        _e("sensor.waschmaschine_b_programmfortschritt", "35", "program_progress", b, "Waschmaschine B Programmfortschritt",
           {}, unit="%"),
        _e("sensor.waschmaschine_b_programmende", end, "program_finish_time", b, "Waschmaschine B Programmende",
           {}, dc="timestamp"),
        _e("sensor.waschmaschine_b_tur", "closed", "door", b, "Waschmaschine B Tür",
           {"options": ["closed", "locked", "open"]}, dc="enum"),
        _e("select.waschmaschine_b_aktives_programm", PROGRAMS_HC[0], "active_program", b,
           "Waschmaschine B Aktives Programm", {"options": PROGRAMS_HC}),
        _e("select.waschmaschine_b_ausgewahltes_programm", PROGRAMS_HC[0], "selected_program", b,
           "Waschmaschine B Ausgewähltes Programm", {"options": PROGRAMS_HC}),
        _e("button.waschmaschine_b_programm_pausieren", "unknown", "pause_program", b, "Waschmaschine B Programm pausieren"),
        _e("button.waschmaschine_b_programm_fortsetzen", "unavailable", "resume_program", b, "Waschmaschine B Programm fortsetzen"),
        _e("button.waschmaschine_b_programm_beenden", "unknown", "stop_program", b, "Waschmaschine B Programm beenden"),
    ]
    return {
        "areas": ["Keller", "Dachboden"],
        "devices": [
            {"key": a, "name": "Waschmaschine A", "manufacturer": "WashData", "model": None, "area": "Keller"},
            {"key": b, "name": "Waschmaschine B", "manufacturer": "Bosch", "model": "WGG244", "area": "Dachboden"},
            {"key": t, "name": "Trockner A", "manufacturer": "WashData", "model": None, "area": "Keller"},
        ],
        "entities": ents,
        # Tasten mit Wirkung: gedrückt → Zustände setzen (wie die echte Integration).
        "_buttons": {
            "button.waschmaschine_a_als_entladen_markieren": {
                "sensor.waschmaschine_a_zustand": "idle", "button.waschmaschine_a_als_entladen_markieren": "unavailable"},
            "button.trockner_a_als_entladen_markieren": {
                "sensor.trockner_a_zustand": "idle", "button.trockner_a_als_entladen_markieren": "unavailable"},
            "button.waschmaschine_b_programm_pausieren": {
                "sensor.waschmaschine_b_betriebszustand": "pause", "button.waschmaschine_b_programm_fortsetzen": "unknown"},
            "button.waschmaschine_b_programm_fortsetzen": {
                "sensor.waschmaschine_b_betriebszustand": "run", "button.waschmaschine_b_programm_fortsetzen": "unavailable"},
            "button.waschmaschine_b_programm_beenden": {"sensor.waschmaschine_b_betriebszustand": "ready"},
        },
    }
