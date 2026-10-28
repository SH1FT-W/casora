"""Two made-up kettles (community card "Wasserkocher", issue #87; not in the demo house).

Testkocher: like Xiaomi BLE's Smart Kettle (model YM-K1501): only the water temperature (sensor, device_class
temperature) and whether it heats (binary_sensor, device_class power) – the card only shows. Testwasserkocher: a kettle
with a target temperature (number in °C) and a keep-warm switch, as integrations that control a kettle offer them.
Names made up.
"""
from __future__ import annotations

from .testserver import _ent

BLE = "testkocher"
PLUS = "testwasserkocher"


def extra(now) -> dict:
    ents = [
        _ent(f"sensor.{BLE}_temperature", "92", {"state_class": "measurement"}, "Testkocher Temperature",
             dc="temperature", unit="°C", dev=BLE),
        _ent(f"binary_sensor.{BLE}_power", "on", {}, "Testkocher Power", dc="power", dev=BLE),
        _ent(f"sensor.{PLUS}_temperature", "64", {"state_class": "measurement"}, "Testwasserkocher Temperatur",
             dc="temperature", unit="°C", dev=PLUS),
        _ent(f"binary_sensor.{PLUS}_power", "off", {}, "Testwasserkocher Heizen", dc="power", dev=PLUS),
        _ent(f"number.{PLUS}_target_temperature", "80", {"min": 40, "max": 100, "step": 5, "unit_of_measurement": "°C"},
             "Testwasserkocher Zieltemperatur", dev=PLUS),
        _ent(f"switch.{PLUS}_keep_warm", "on", {}, "Testwasserkocher Warmhalten", dev=PLUS),
    ]
    return {
        "devices": [{"key": BLE, "name": "Testkocher", "manufacturer": "Xiaomi", "model": "YM-K1501", "area": None},
                    {"key": PLUS, "name": "Testwasserkocher", "manufacturer": "Kochwerk", "model": "Kocher 2", "area": None}],
        "entities": ents,
    }
