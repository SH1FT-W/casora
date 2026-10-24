"""A made-up home server with System-Monitor-like sensors (community card "Chart", issue #50, always present).

Like HA's systemmonitor integration: one device, sensors with translation keys processor_use, memory_use_percent,
processor_temperature and network_in, state_class measurement. The CPU sensor has no device class (only a unit), so
the chart card has to read state_class and unit, not the device class. Curves for the last 48 h and the long-term
statistics come from the mock's history backfill (_history): 400 days for the chart card's year range. A smart-plug-
like energy meter (kWh, total_increasing) on the same device gives the card a counter for bars per hour / day / month.
Names made up.
"""
from __future__ import annotations

DEV = "testserver"
BASE = "testserver"
CPU = f"sensor.{BASE}_processor_use"
RAM = f"sensor.{BASE}_memory_use_percent"
TEMP = f"sensor.{BASE}_processor_temperature"
NET = f"sensor.{BASE}_network_in_eth0"
ENERGY = f"sensor.{BASE}_energy"


def _ent(eid, state, attrs, name, dc=None, unit=None, key=None, cat=None):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    ents = [
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
        "devices": [{"key": DEV, "name": "Testserver", "manufacturer": None, "model": "Mini-PC", "area": None}],
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
