"""Zwei neutrale Waschmaschinen für das Testhaus (immer dabei, auch ohne private Fixture).

* „Waschmaschine A“ im Keller: Schlüssel wie WashData (ha_washdata) – Zustand, Programm,
  Phase, Fortschritt, Restzeit, Laufzeit, Programmwahl, Erkennung anhalten/fortsetzen,
  Ende erzwingen, „Als entladen markieren“, Empfehlungen.
* „Waschmaschine B“ im Dachboden: Schlüssel wie Home Connect (offizielle Integration) –
  Betriebszustand, Programmfortschritt, Programmende, aktives/gewähltes Programm, Tür,
  Pause/Fortsetzen/Abbrechen.

Im Testhaus läuft alles unter der Plattform casora_mock; Casora erkennt die Quelle dann
über die Kombination der translation_keys (scripts/local/00-finden.js, casoraLaundryFind).
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


def extra(now: datetime) -> dict:
    a, b = "mock_waschmaschine_a", "mock_waschmaschine_b"
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
           {"icon": "mdi:progress-clock"}, unit="%"),
        _e("sensor.waschmaschine_a_verbleibende_zeit", "41", "time_remaining", a, "Waschmaschine A Verbleibende Zeit",
           {"icon": "mdi:timer-sand"}, dc="duration", unit="min"),
        _e("sensor.waschmaschine_a_verstrichene_zeit", "3420", "elapsed_time", a, "Waschmaschine A Verstrichene Zeit",
           {"icon": "mdi:timer-outline"}, dc="duration", unit="s"),
        _e("sensor.waschmaschine_a_gesamtdauer", "98", "total_duration", a, "Waschmaschine A Gesamtdauer",
           {"icon": "mdi:timer-check-outline"}, dc="duration", unit="min"),
        _e("sensor.waschmaschine_a_zyklusanzahl", "214", "cycle_count", a, "Waschmaschine A Zyklusanzahl",
           {"icon": "mdi:counter", "state_class": "total"}, unit="cycles"),
        _e("sensor.waschmaschine_a_energie_gesamt", "86.4", "energy_total", a, "Waschmaschine A Energie gesamt",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        # Spülen zieht ~160 W (Heizen wären ~2 kW) – das Haus meldet nur ~440 W, sonst stand im
        # Energie-Popup ein Verbraucher über dem ganzen Haus (Nutzertest 07.10.2026).
        _e("sensor.waschmaschine_a_aktuelle_leistung", "160", "current_power", a, "Waschmaschine A Aktuelle Leistung",
           {}, dc="power", unit="W"),
        _e("sensor.waschmaschine_a_empfohlene_einstellungen", "2", "suggestions", a,
           "Waschmaschine A Empfohlene Einstellungen", {"icon": "mdi:lightbulb-on-outline"}, category="diagnostic"),
        _e("binary_sensor.waschmaschine_a_lauft", "on", "running", a, "Waschmaschine A Läuft"),
        _e("select.waschmaschine_a_zyklusprogramm", "auto_detect", "program_select", a, "Waschmaschine A Zyklusprogramm",
           {"options": ["auto_detect", "Baumwolle 40", "Eco 40-60", "Pflegeleicht", "Schnell 30"]}),
        _e("button.waschmaschine_a_zyklus_anhalten", "unknown", "pause_cycle", a, "Waschmaschine A Zyklus anhalten"),
        _e("button.waschmaschine_a_zyklus_fortsetzen", "unavailable", "resume_cycle", a, "Waschmaschine A Zyklus fortsetzen"),
        _e("button.waschmaschine_a_zyklusende_erzwingen", "unknown", "force_end_cycle", a, "Waschmaschine A Zyklusende erzwingen"),
        _e("button.waschmaschine_a_als_entladen_markieren", "unavailable", "mark_unloaded", a,
           "Waschmaschine A Als entladen markieren", {"icon": "mdi:basket-check-outline"}),
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
        ],
        "entities": ents,
        # Tasten mit Wirkung: gedrückt → Zustände setzen (wie die echte Integration).
        "_buttons": {
            "button.waschmaschine_a_als_entladen_markieren": {
                "sensor.waschmaschine_a_zustand": "idle", "button.waschmaschine_a_als_entladen_markieren": "unavailable"},
            "button.waschmaschine_b_programm_pausieren": {
                "sensor.waschmaschine_b_betriebszustand": "pause", "button.waschmaschine_b_programm_fortsetzen": "unknown"},
            "button.waschmaschine_b_programm_fortsetzen": {
                "sensor.waschmaschine_b_betriebszustand": "run", "button.waschmaschine_b_programm_fortsetzen": "unavailable"},
            "button.waschmaschine_b_programm_beenden": {"sensor.waschmaschine_b_betriebszustand": "ready"},
        },
    }
