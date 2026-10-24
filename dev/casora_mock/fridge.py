"""A made-up fridge-freezer for the test house (fridge card, always present).

"Testfrost" is built like a two-zone Liebherr appliance in HA core (integration liebherr, HomeAPI): zone sensors
top_zone / bottom_zone (current temperature), numbers setpoint_temperature_top_zone / _bottom_zone, switches
super_cool_top_zone, super_frost_bottom_zone, night_mode, party_mode and a BioFresh-Plus select. The translation_keys
are the integration's (homeassistant/components/liebherr/strings.json); in the test house everything runs under
casora_mock, Casora recognises the source by the keys. Names invented.
"""
from __future__ import annotations

DEV = "testfrost"
BASE = "testfrost"
BIO = ["zero_zero", "zero_minus_two", "minus_two_zero", "minus_two_minus_two"]


def _e(eid, state, key, name, attrs=None, dc=None, unit=None, cat=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    b = BASE
    m = {"state_class": "measurement"}
    ents = [
        _e(f"sensor.{b}_top_zone", "7", "top_zone", "Testfrost Obere Zone", m, dc="temperature", unit="°C"),
        _e(f"sensor.{b}_bottom_zone", "-18", "bottom_zone", "Testfrost Untere Zone", m, dc="temperature", unit="°C"),
        _e(f"number.{b}_top_zone_setpoint", "5", "setpoint_temperature_top_zone", "Testfrost Sollwert obere Zone",
           {"min": 3, "max": 9, "step": 1}, dc="temperature", unit="°C"),
        _e(f"number.{b}_bottom_zone_setpoint", "-18", "setpoint_temperature_bottom_zone", "Testfrost Sollwert untere Zone",
           {"min": -26, "max": -16, "step": 1}, dc="temperature", unit="°C"),
        _e(f"switch.{b}_nightmode", "off", "night_mode", "Testfrost Nachtmodus", {"icon": "mdi:sleep"}),
        _e(f"switch.{b}_top_zone_supercool", "off", "super_cool_top_zone", "Testfrost Obere Zone SuperCool", {"icon": "mdi:snowflake"}),
        _e(f"switch.{b}_bottom_zone_superfrost", "off", "super_frost_bottom_zone", "Testfrost Untere Zone SuperFrost",
           {"icon": "mdi:snowflake-alert"}),
        _e(f"switch.{b}_partymode", "off", "party_mode", "Testfrost Partymodus", {"icon": "mdi:glass-cocktail"}),
        _e(f"select.{b}_top_zone_biofresh_plus", "zero_zero", "bio_fresh_plus_top_zone", "Testfrost Obere Zone BioFresh-Plus",
           {"options": BIO, "icon": "mdi:leaf"}),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testfrost", "manufacturer": "Liebherr", "model": "Combi (Test)", "area": None}],
        "entities": ents,
        # Gentle curves for the 24 h chart (fridge door openings in the evening, freezer steady).
        "_history": {
            f"sensor.{b}_top_zone": {"base": 6.5, "wave": 0.6, "noise": 0.2, "digits": 0, "bumps": [[19, 2, 0.6], [7.5, 1.5, 0.4]]},
            f"sensor.{b}_bottom_zone": {"base": -18, "wave": 0.5, "noise": 0.2, "digits": 0},
        },
    }
