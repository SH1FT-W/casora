"""A made-up home server with System-Monitor-like sensors (community card "Chart", issue #50, always present).

Like HA's systemmonitor integration: one device, sensors with translation keys processor_use, memory_use_percent,
processor_temperature and network_in, state_class measurement. The CPU sensor has no device class (only a unit), so
the chart card has to read state_class and unit, not the device class. Curves for the last 48 h and the long-term
statistics come from the mock's history backfill (_history): 400 days for the chart card's year range. A smart-plug-
like energy meter (kWh, total_increasing) on the same device gives the card a counter for bars per hour / day / month.
Names made up.

Beside it a made-up DWD-like warning region (two warning level sensors, issue #55) for the weather warning tile.
"""
from __future__ import annotations

from datetime import timedelta

DEV = "testserver"
BASE = "testserver"
CPU = f"sensor.{BASE}_processor_use"
RAM = f"sensor.{BASE}_memory_use_percent"
TEMP = f"sensor.{BASE}_processor_temperature"
NET = f"sensor.{BASE}_network_in_eth0"
ENERGY = f"sensor.{BASE}_energy"


def _ent(eid, state, attrs, name, dc=None, unit=None, key=None, cat=None, dev=DEV):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": cat}


# Made-up DWD-like warning region (HA core dwd_weather_warnings, issue #55): two level sensors without a device class,
# state = level 0–4, warnings in warning_<n>_* attributes. Region name invented.
DWD_DEV = "testwetter"
DWD_REGION = "Testland Nord"
WARN_NOW = f"sensor.{BASE}_wetterwarnung_stufe"
WARN_PRE = f"sensor.{BASE}_vorwarnung_stufe"


def _dwd(now, key, name, warnings):
    t = lambda h: (now + timedelta(hours=h)).replace(microsecond=0).isoformat()
    a = {"last_update": t(-0.5), "region_name": DWD_REGION, "region_id": 909999999, "warning_count": len(warnings)}
    for n, w in enumerate(warnings, 1):
        a.update({f"warning_{n}_name": w["name"], f"warning_{n}_type": w["type"], f"warning_{n}_level": w["level"],
                  f"warning_{n}_headline": w["headline"], f"warning_{n}_description": w["description"],
                  f"warning_{n}_instruction": w["instruction"], f"warning_{n}_start": t(w["start"]), f"warning_{n}_end": t(w["end"]),
                  f"warning_{n}_parameters": w.get("parameters", {}), f"warning_{n}_color": w["color"]})
    level = max([w["level"] for w in warnings] or [0])
    return _ent(key[0], str(level), a, name, key=key[1], dev=DWD_DEV)


def extra(now) -> dict:
    ents = [
        _dwd(now, (WARN_NOW, "current_warning_level"), f"{DWD_REGION} Aktuelle Warnstufe", [
            {"name": "SCHWERE STURMBÖEN", "type": 52, "level": 3, "color": "#ff0000",
             "headline": "Amtliche UNWETTERWARNUNG vor SCHWEREN STURMBÖEN",
             "description": "Es treten schwere Sturmböen mit Geschwindigkeiten zwischen 90 km/h (25 m/s, 10 Bft) und "
                            "100 km/h (28 m/s, 10 Bft) aus westlicher Richtung auf. In exponierten Lagen muss mit "
                            "orkanartigen Böen bis 110 km/h (31 m/s, 11 Bft) gerechnet werden.",
             "instruction": "ACHTUNG! Hinweis auf mögliche Gefahren: Es können zum Beispiel einzelne Äste herabstürzen. "
                            "Achten Sie besonders auf herabfallende Gegenstände.",
             "start": -2, "end": 6, "parameters": {"Windböen": "90-100 [110] km/h"}},
            {"name": "GEWITTER", "type": 31, "level": 2, "color": "#ffa500",
             "headline": "Amtliche WARNUNG vor GEWITTER",
             "description": "Von Westen ziehen Gewitter auf. Dabei gibt es Windböen mit Geschwindigkeiten um 60 km/h "
                            "(17 m/s, 7 Bft) und Starkregen mit Niederschlagsmengen um 15 l/m² in einer Stunde.",
             "instruction": "Hinweis auf mögliche Gefahren: Örtlich kann es Blitzschlag geben.",
             "start": 1, "end": 5, "parameters": {"Windböen": "~60 km/h", "Niederschlag": "~15 l/m²"}},
        ]),
        _dwd(now, (WARN_PRE, "advance_warning_level"), f"{DWD_REGION} Vorwarnstufe", [
            {"name": "FROST", "type": 22, "level": 1, "color": "#ffff00",
             "headline": "Amtliche WARNUNG vor FROST",
             "description": "In der Nacht zum Freitag muss mit leichtem Frost zwischen 0 °C und -3 °C gerechnet werden.",
             "instruction": "", "start": 20, "end": 32},
        ]),
        _ent(CPU, "23", {"state_class": "measurement"}, "Testserver Processor use", unit="%", key="processor_use"),
        _ent(RAM, "61", {"state_class": "measurement"}, "Testserver Memory use", unit="%", key="memory_use_percent"),
        _ent(TEMP, "48.5", {"state_class": "measurement"}, "Testserver Processor temperature", dc="temperature", unit="°C",
             key="processor_temperature"),
        _ent(NET, "1.8", {"state_class": "measurement"}, "Testserver Network in eth0", dc="data_rate", unit="MB/s", key="network_in"),
        # Total counters as HA's systemmonitor reports them (diagnostic, no chart of their own).
        _ent(f"sensor.{BASE}_network_throughput_in_eth0", "1842.3", {"state_class": "total_increasing"},
             "Testserver Network throughput in eth0", dc="data_size", unit="MiB", key="network_throughput_in", cat="diagnostic"),
        # Energy meter of the server's smart plug: the mock imports hourly sums (__init__.py _import_statistics).
        # The state must exceed 400 days of the mock's hourly sums (~2 500 kWh), else the recorder sees a reset.
        _ent(ENERGY, "4870.6", {"state_class": "total_increasing"}, "Testserver Energy", dc="energy", unit="kWh", key="energy"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testserver", "manufacturer": None, "model": "Mini-PC", "area": None},
                    {"key": DWD_DEV, "name": DWD_REGION, "manufacturer": None, "model": "Weather warnings", "area": None}],
        "entities": ents,
        # Long-term statistics over 400 days (default 30) so the chart card's year range has twelve months.
        "_stats_days": {CPU: 400, RAM: 400, TEMP: 400, NET: 400, ENERGY: 400},
        # Curves for the backfill (__init__.py backfill_history): nightly backup at 03:30, streaming in the evening.
        "_history": {
            CPU: {"base": 23, "wave": 9, "noise": 2.5, "digits": 0, "min": 0, "max": 100,
                  "bumps": [[3.5, 55, 0.4], [20, 30, 1.2]]},
            RAM: {"base": 61, "wave": 4, "noise": 0.8, "digits": 0, "min": 0, "max": 100, "bumps": [[3.5, 22, 0.5]]},
            TEMP: {"base": 48.5, "wave": 3, "noise": 0.4, "digits": 1, "min": 30, "bumps": [[3.5, 14, 0.5], [20, 7, 1.2]]},
            NET: {"base": 1.8, "wave": 1.2, "noise": 0.5, "digits": 1, "min": 0, "bumps": [[3.5, 40, 0.4], [20, 6, 1.2]]},
        },
    }
