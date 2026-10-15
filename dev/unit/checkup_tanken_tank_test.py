"""Tanken: „tank_level“ allein macht kein Auto (Zisterne, Öltank) – ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/checkup_tanken_tank_test.py

Erwartet: Ein Gerät nur mit …_tank_level bleibt draußen; mit Standort, Reichweite oder
Kilometerstand am selben Gerät ist es ein Auto. Eindeutige Tank-Sensoren (fuel_level …) reichen allein.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import tanken  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def ent(eid, dev, tk=None, platform="x"):
    return SimpleNamespace(entity_id=eid, device_id=dev, platform=platform, domain=eid.split(".")[0],
                           disabled_by=None, translation_key=tk)


ENTS = [
    ent("sensor.zisterne_tank_level", "Z"),
    ent("sensor.zisterne_temperatur", "Z"),
    ent("sensor.oeltank_tank_level", "O"),
    ent("sensor.oeltank_orange_led", "O"),           # „orange“ ist keine Reichweite
    ent("sensor.auto_a_tank_level", "A"),
    ent("device_tracker.auto_a_position", "A"),
    ent("sensor.auto_b_tank_level", "B"),
    ent("sensor.auto_b_reichweite", "B"),
    ent("sensor.auto_c_tank_level", "C"),
    ent("sensor.auto_c_km", "C", "odometer"),
    ent("sensor.auto_d_fuel_level", "D"),
]

tanken.er.async_get = lambda hass: SimpleNamespace(entities=SimpleNamespace(values=lambda: ENTS))
tanken.dr.async_get = lambda hass: SimpleNamespace(async_get=lambda d: SimpleNamespace(name="Gerät " + d, name_by_user=None))

cars = {c["device_id"] for c in tanken.Tanken.cars(SimpleNamespace(hass=None, cfg={}))}
check("Zisterne kein Auto", "Z" not in cars, cars)
check("Öltank kein Auto", "O" not in cars, cars)
check("tank_level + Standort", "A" in cars, cars)
check("tank_level + Reichweite", "B" in cars, cars)
check("tank_level + Kilometerstand", "C" in cars, cars)
check("fuel_level allein", "D" in cars, cars)

print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
