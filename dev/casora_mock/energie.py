"""A made-up balcony solar system for the energy tile, the energy popup and the solar tip (names made up).

Shaped like a real house: a solar storage (Anker-Solix-like: solar power with two inputs, house demand, battery
power and charge level, grid power, battery temperature), a grid meter (IOmeter-like: power, import and export
totals), utility-meter-like daily and monthly counters without a device (house demand, solar yield, battery
discharge, grid import, cost) and the battery's energy counters (integration helpers). Values form one consistent
moment: solar 1840 W, battery charging 700 W, 520 W exported, the house uses 620 W.

dev/qa/testhaus-extras.mjs points HA's energy settings at these sensors (grid, solar, battery and the aquarium
plugs as individual devices), as the house's own settings do; Casora's solar tip (binary_sensor.casora_solar_tipp)
then sees about 1.2 kW free.
"""
from __future__ import annotations

from datetime import datetime

BANK, METER = "testsolarbank", "teststromzaehler"


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": None}


def _w(eid, state, key, device, name):
    return _e(eid, state, key, device, name, {"state_class": "measurement"}, dc="power", unit="W")


def _kwh(eid, state, name, cls="total_increasing", device=None, key=None):
    return _e(eid, state, key, device, name, {"state_class": cls}, dc="energy", unit="kWh")


def extra(now: datetime) -> dict:
    b, m = BANK, METER
    ents = [
        # Solar storage
        _w(f"sensor.{b}_solarleistung", "1840", "solarbank_input_power", b, "Testsolarbank Solarleistung"),
        _w(f"sensor.{b}_solar_pv1", "930", "solar_power_1", b, "Testsolarbank Solar PV1"),
        _w(f"sensor.{b}_solar_pv2", "910", "solar_power_2", b, "Testsolarbank Solar PV2"),
        _w(f"sensor.{b}_hausbedarf", "620", "home_load_power", b, "Testsolarbank Hausbedarf"),
        # HA's sign: positive = discharging, negative = charging.
        _w(f"sensor.{b}_akkuleistung", "-700", "battery_power", b, "Testsolarbank Akkuleistung"),
        _w(f"sensor.{b}_aufladeleistung", "700", "charging_power", b, "Testsolarbank Aufladeleistung"),
        _w(f"sensor.{b}_entladeleistung", "0", "discharging_power", b, "Testsolarbank Entladeleistung"),
        _e(f"sensor.{b}_ladestand", "78", "state_of_charge", b, "Testsolarbank Ladestand",
           {"state_class": "measurement"}, dc="battery", unit="%"),
        _e(f"sensor.{b}_akkuenergie", "2097", "battery_energy", b, "Testsolarbank Akkuenergie",
           {"state_class": "measurement"}, dc="energy_storage", unit="Wh"),
        _e(f"sensor.{b}_temperatur", "26", "temperature", b, "Testsolarbank Temperatur",
           {"state_class": "measurement"}, dc="temperature", unit="°C"),
        _e(f"sensor.{b}_betriebszustand", "charge_priority", "charging_status", b, "Testsolarbank Betriebszustand",
           {"options": ["idle", "charge_priority", "discharge", "bypass", "detection"]}, dc="enum"),
        # Grid meter (positive = import, negative = export)
        _w(f"sensor.{m}_leistung", "-520", "power", m, "Teststromzähler Leistung"),
        _kwh(f"sensor.{m}_gesamtbezug", "4815.32", "Teststromzähler Gesamtbezug", device=m, key="total_consumption"),
        _kwh(f"sensor.{m}_gesamteinspeisung", "212.47", "Teststromzähler Gesamteinspeisung", device=m,
             key="total_production"),
        # Integration helpers of the house: battery energy counters and solar yield total
        _kwh("sensor.testenergie_akku_entladen", "731.2", "Akku Energie entladen", cls="total"),
        _kwh("sensor.testenergie_akku_aufgeladen", "802.9", "Akku Energie aufgeladen", cls="total"),
        _kwh("sensor.testenergie_solarertrag_gesamt", "1383.11", "Solarertrag gesamt"),
        # Utility meters (daily/monthly)
        _kwh("sensor.testenergie_hausbedarf_heute", "6.43", "Hausbedarf heute"),
        _kwh("sensor.testenergie_hausbedarf_monat", "222.05", "Hausbedarf Monat"),
        _kwh("sensor.testenergie_solarertrag_heute", "7.91", "Solarertrag heute"),
        _kwh("sensor.testenergie_solarertrag_monat", "56.98", "Solarertrag Monat"),
        _kwh("sensor.testenergie_akku_entladen_heute", "1.82", "Akku entladen heute"),
        _kwh("sensor.testenergie_akku_entladen_monat", "39.95", "Akku entladen Monat"),
        _kwh("sensor.testenergie_netzbezug_heute", "3.64", "Netzbezug heute"),
        _kwh("sensor.testenergie_netzbezug_monat", "167.79", "Netzbezug Monat"),
        _e("sensor.testenergie_stromkosten_heute", "1.31", None, None, "Stromkosten heute",
           {"state_class": "total"}, dc="monetary", unit="€"),
        _e("sensor.testenergie_stromkosten_monat", "60.40", None, None, "Stromkosten Monat",
           {"state_class": "total"}, dc="monetary", unit="€"),
    ]
    return {
        "devices": [
            {"key": b, "name": "Testsolarbank", "manufacturer": "Beispiel", "model": "Balkonspeicher 2,7 kWh", "area": None},
            {"key": m, "name": "Teststromzähler", "manufacturer": "Beispiel", "model": "Zählerauslese", "area": None},
        ],
        "entities": ents,
        # Solar: a day curve (nothing at night) instead of the automatic power bumps.
        "_history": {f"sensor.{b}_solarleistung": {"base": 700, "day": 1100, "peak": 13, "noise": 40, "digits": 0,
                                                    "min": 0}},
    }
