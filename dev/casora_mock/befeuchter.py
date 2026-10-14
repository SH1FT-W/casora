"""Ein erfundener Luftbefeuchter für das Testhaus (immer dabei, auch ohne private Fixture).

humidifier-Entität mit Zielfeuchte, Modi und Tätigkeit, dazu am selben Gerät Feuchtesensor, Wassertank und
Leistung. So prüft das Befeuchter-Popup (scripts/local/19-befeuchter.js) gegen echte HA-Entitäten. Name erfunden.
"""
from __future__ import annotations

from .maeher import _ent as _maeher_ent

DEV = "testbefeuchter"
BASE = "testbefeuchter"


def _ent(*a, **kw):
    e = _maeher_ent(*a, **kw)
    e["device"] = DEV
    return e


def extra(now) -> dict:
    hum = {"humidity": 50, "current_humidity": 41, "min_humidity": 30, "max_humidity": 80, "mode": "normal",
           "available_modes": ["normal", "eco", "sleep", "boost"], "action": "humidifying", "supported_features": 1}
    ents = [
        _ent(f"humidifier.{BASE}", "on", hum, "Testbefeuchter", dc="humidifier"),
        _ent(f"sensor.{BASE}_humidity", "41", {}, "Testbefeuchter Humidity", dc="humidity", unit="%"),
        _ent(f"sensor.{BASE}_water_level", "64", {}, "Testbefeuchter Water Level", unit="%", key="water_level"),
        _ent(f"sensor.{BASE}_power", "23.4", {}, "Testbefeuchter Power", dc="power", unit="W"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testbefeuchter", "manufacturer": "Nebelwerk", "model": "Nebel 1", "area": None}],
        "entities": ents,
    }
