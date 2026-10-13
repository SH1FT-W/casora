"""Gemeldet 13.10.2026: „Kein Auto mit Tankfüllstand gefunden“ bei einem Volvo.

  uv run --python 3.14 --with homeassistant python dev/unit/tanken_autos_test.py

Die Volvo-Integration meldet den Tank nur in Litern (translation_key fuel_amount, deutsch
„…_kraftstoffmenge“), keinen Füllstand in Prozent. Erwartet: das Auto erscheint unter Tanken;
ein E-Auto (nur Akku) und ein Gerät ohne Tank bleiben draußen.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import tanken  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


def ent(eid, dev, tk=None, platform="volvo"):
    return SimpleNamespace(entity_id=eid, device_id=dev, platform=platform, domain=eid.split(".")[0],
                           disabled_by=None, translation_key=tk)


ENTS = [
    ent("sensor.auto_test_kraftstoffmenge", "V", "fuel_amount"),
    ent("sensor.auto_test_kilometerstand", "V", "odometer"),
    ent("sensor.zweitauto_fuel_amount", "W"),
    ent("sensor.e_auto_akkustand", "E", "battery_level"),
    ent("sensor.wetter_temperatur", "X", None, "met"),
]

tanken.er.async_get = lambda hass: SimpleNamespace(entities=SimpleNamespace(values=lambda: ENTS))
tanken.dr.async_get = lambda hass: SimpleNamespace(async_get=lambda d: SimpleNamespace(name="Gerät " + d, name_by_user=None))

obj = SimpleNamespace(hass=None, cfg={})
cars = {c["device_id"]: c for c in tanken.Tanken.cars(obj)}
check("Volvo mit Kraftstoffmenge (translation_key) gefunden", "V" in cars)
check("Kraftstoffmenge über die Endung gefunden", "W" in cars)
check("E-Auto ohne Tank nicht dabei", "E" not in cars)
check("anderes Gerät nicht dabei", "X" not in cars)
check("Benziner: E10 vorgeschlagen", cars.get("V", {}).get("fuel") == "e10")

sys.exit(1 if fails else 0)
