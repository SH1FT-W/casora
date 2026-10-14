"""Ein erfundener Mähroboter für das Testhaus (Gardena-artig, immer dabei, auch ohne private Fixture).

Die Gardena-Integration legt eine lawn_mower-Entität mit Tätigkeit, Fehlercode, Akku und Funkverbindung in
den Attributen an, dazu am selben Gerät Akku-, Verbindungs- und Stundensensor und drei Tasten. So prüft die
Community-Karte „Mähroboter“ (scripts/local/16-maeher.js) gegen echte HA-Entitäten. Name erfunden.
"""
from __future__ import annotations

DEV = "testmaeher"
BASE = "testmaeher"


def _ent(eid, state, attrs, name, dc=None, unit=None, key=None):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": None}


def extra(now) -> dict:
    mower = {"battery_level": 100, "battery_state": "OK", "rf_link_level": 90, "rf_link_state": "ONLINE",
             "operating_hours": 1234, "state": "OK", "activity": "PARKED_TIMER", "last_error_code": None,
             "supported_features": 7}
    ents = [
        _ent(f"lawn_mower.{BASE}_lawn_mower", "docked", mower, "Testmäher Lawn Mower"),
        _ent(f"sensor.{BASE}_battery_level", "100", {}, "Testmäher Battery Level", dc="battery", unit="%"),
        _ent(f"binary_sensor.{BASE}_online", "on", {}, "Testmäher Online", dc="connectivity"),
        _ent(f"sensor.{BASE}_operating_hours", "1234", {}, "Testmäher Operating Hours", unit="h"),
        _ent(f"sensor.{BASE}_rf_link_quality", "90", {}, "Testmäher RF Link Quality", unit="%"),
        _ent(f"sensor.{BASE}", "ok", {}, "Testmäher"),
        _ent(f"button.{BASE}_park_until_further_notice", "unknown", {}, "Testmäher Park Until Further Notice"),
        _ent(f"button.{BASE}_return_to_dock", "unknown", {}, "Testmäher Return to Dock"),
        _ent(f"button.{BASE}_start_mowing_now", "unknown", {}, "Testmäher Start Mowing Now"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testmäher", "manufacturer": "Gardena", "model": "smart Mower", "area": None}],
        "entities": ents,
        # „Parken bis auf Weiteres“ schickt ihn in die Station (nur der Zustand; die Tätigkeit bleibt Testsache).
        "_buttons": {f"button.{BASE}_park_until_further_notice": {f"lawn_mower.{BASE}_lawn_mower": "docked"}},
    }
