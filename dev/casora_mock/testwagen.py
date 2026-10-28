"""A made-up electric car like the BMW CarData integrations (cardata / BavarianData, #89).

Their entities are named after the CarData descriptors („Range EV Estimate during charging“ =
vehicle.drivetrain.electricEngine.remainingElectricRange) and carry no door or lock values Casora knows, so
the car tile said „Keine Daten“ while the Studio showed the tile's own sensor. Not a full car on purpose: none
of Casora's core car roles, so the automatic car of the test house stays the same. Names made up.
"""
from __future__ import annotations

DEV = "testwagen_cardata"
BASE = "testwagen"


def _ent(eid, state, name, dc=None, unit=None):
    a = {"friendly_name": name}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": None, "entity_category": None}


def extra(now) -> dict:
    ents = [
        _ent(f"sensor.{BASE}_range_ev_estimate_during_charging", "24", "Testwagen Range EV Estimate during charging", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_battery_hv_state_of_charge_target", "80", "Testwagen Battery HV State of Charge Target", unit="%"),
        _ent(f"sensor.{BASE}_charging_status", "NOCHARGING", "Testwagen Charging Status"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testwagen", "manufacturer": "BMW", "model": "Testwagen", "area": None}],
        "entities": ents,
    }
