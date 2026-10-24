"""Room climate (raumklima.py): areas outside the house are no rooms (#54).

  uv run --python 3.14 --with homeassistant python dev/unit/raumklima_aussen_test.py

A "Garten" area with a humidity sensor counted as an indoor room; its outdoor values showed up as room
climate. OUTDOOR_AREA (ki.py) decides for area names, OUTDOOR stays the narrower rule for entity names.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import raumklima  # noqa: E402,F401  (imports OUTDOOR_AREA)
from custom_components.casora.ki import OUTDOOR, OUTDOOR_AREA  # noqa: E402

for name in ("Garten", "Terrasse", "Balkon", "Hof", "Außen", "Backyard", "Carport", "Einfahrt"):
    assert OUTDOOR_AREA.search(name), name
for name in ("Wohnzimmer", "Küche", "Bahnhofstraße", "Büro"):
    assert not OUTDOOR_AREA.search(name), name
assert not OUTDOOR.search("light.gartenlampe"), "entity names keep the narrow rule"
assert OUTDOOR.search("sensor.aussen_temperatur")
print("ok raumklima outdoor areas")
