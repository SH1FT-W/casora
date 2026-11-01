"""A made-up electric car with a picture of the car, like BMW CarData's image.*_vehicle_image (#89).

The vehicle popup takes the image entity on the car's device by itself (variables.vehicle_image 'auto'). The picture is
not in the repo: the mock serves bilder/fahrzeug-test.png from its folder in the test HA when that file is there (put
there by hand, a free photo), else its grey placeholder. Fewer roles than the test house's main car, so the automatic
car stays the same. Names made up.
"""
from __future__ import annotations

DEV = "testlimousine_ev"
BASE = "testlimousine"


def _ent(eid, state, name, dc=None, unit=None, **extra):
    a = {"friendly_name": name}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    e = {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV, "area": None,
         "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
         "translation_key": None, "entity_category": None}
    e.update(extra)
    return e


def extra(now) -> dict:
    ents = [
        _ent(f"sensor.{BASE}_remaining_range_total", "312", "Testlimousine Remaining Range Total", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_state_of_charge", "64", "Testlimousine State of Charge", dc="battery", unit="%"),
        _ent(f"sensor.{BASE}_mileage", "23418", "Testlimousine Mileage", dc="distance", unit="km"),
        _ent(f"binary_sensor.{BASE}_doors_locked", "off", "Testlimousine Doors Locked", dc="lock"),
        _ent(f"binary_sensor.{BASE}_doors", "off", "Testlimousine Doors", dc="door"),
        _ent(f"binary_sensor.{BASE}_windows", "off", "Testlimousine Windows", dc="window"),
        _ent(f"image.{BASE}_vehicle_image", now.isoformat(), "Testlimousine Vehicle Image", picture_file="fahrzeug-test.png"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testlimousine", "manufacturer": "BMW", "model": "Testlimousine", "area": None}],
        "entities": ents,
    }
