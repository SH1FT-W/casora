"""Made-up lamps behind hubs for the test house (always present, except in the demo house).

Lamps behind a bridge were not found by the setup from 1.0.3 until 26.10.41, and the test house had none, so
nobody noticed. This module adds the usual shapes of a real home:
  * a Hue-like bridge (no area) with two lamps, each lamp its own device behind the bridge (via_device),
    one in "Garage", one in "Garten";
  * a Zigbee coordinator (no area) with a ceiling lamp and a radiator thermostat behind it, both in "Garage",
    with the noise such devices bring (link quality as diagnostic, start-up behaviour and calibration as config);
  * a two-channel dimmer (Shelly-like): the dimmer itself in "Garage", each channel its own device behind it
    (via_device) with a light and a power sensor, channel 1 in "Garage", channel 2 in "Garten".
"Garage" and "Garten" were empty rooms of the test house: no new rooms (every room costs time in the gate), the
rooms that had something keep their content. dev/unit/setup_completeness.mjs, dev/unit/light_badge_later.mjs and
dev/qa/regress/r307_start_fresh_lamps.mjs rely on these devices. Names made up.
"""
from __future__ import annotations

AREA_A = "Garage"
AREA_B = "Garten"
BRIDGE = "testbruecke"
COORD = "testkoordinator"
DIMMER = "testdimmer"



def _e(eid, state, device, name, attrs=None, dc=None, unit=None, key=None, cat=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit,
            "hidden": False, "translation_key": key, "entity_category": cat}


def _dev(key, name, manufacturer, model, area=None, via=None):
    d = {"key": key, "name": name, "manufacturer": manufacturer, "model": model, "area": area}
    if via:
        d["via"] = via
    return d


# Light: dimmable with colour temperature (supported_features 32 = transition), like Hue and Zigbee bulbs.
CT = {"supported_color_modes": ["color_temp", "xy"], "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500,
      "supported_features": 32}
DIM = {"supported_color_modes": ["brightness"], "supported_features": 32}


def _on(base, brightness, **extra):
    return {**base, "color_mode": "color_temp" if "color_temp" in base["supported_color_modes"] else "brightness",
            "brightness": brightness, **extra}


def _off(base):
    return {**base, "color_mode": None, "brightness": None}


def extra(now) -> dict:
    ents = [
        # Hue-like bridge: one device per lamp, behind the bridge.
        _e("light.werkbanklampe", "on", "testhue_werkbank", "Werkbanklampe", _on(CT, 204, color_temp_kelvin=4000)),
        _e("light.palmenleuchte", "off", "testhue_palme", "Palmenleuchte", _off(CT)),
        # Zigbee coordinator: lamp and thermostat behind it, with diagnostic and config entities.
        _e("light.deckenlicht_garage", "off", "testzb_decke", "Deckenlicht Garage", _off(CT)),
        _e("sensor.deckenlicht_garage_linkquality", "142", "testzb_decke", "Deckenlicht Garage Linkquality",
           {"state_class": "measurement"}, unit="lqi", key="linkquality", cat="diagnostic"),
        _e("select.deckenlicht_garage_start_up_behavior", "previous", "testzb_decke",
           "Deckenlicht Garage Start-up behavior", {"options": ["off", "on", "toggle", "previous"]},
           key="start_up_on_off", cat="config"),
        # Climate: target temperature 1 | turn on 128 | turn off 256
        _e("climate.heizkoerper_garage", "heat", "testzb_thermostat", "Heizkörper Garage",
           {"hvac_modes": ["off", "heat"], "hvac_action": "idle", "temperature": 19, "current_temperature": 19.5,
            "min_temp": 5, "max_temp": 30, "target_temp_step": 0.5, "supported_features": 1 | 128 | 256}),
        _e("number.heizkoerper_garage_local_temperature_calibration", "0", "testzb_thermostat",
           "Heizkörper Garage Local temperature calibration", {"min": -5, "max": 5, "step": 0.1, "mode": "box"},
           unit="°C", key="local_temperature_calibration", cat="config"),
        # Two-channel dimmer: device temperature on the dimmer, light and power on each channel.
        _e("sensor.testdimmer_geraetetemperatur", "41.2", DIMMER, "Testdimmer Gerätetemperatur",
           {"state_class": "measurement"}, dc="temperature", unit="°C", key="device_temperature", cat="diagnostic"),
        _e("light.werkbank_spots", "on", "testdimmer_k1", "Werkbank Spots", _on(DIM, 102)),
        _e("sensor.werkbank_spots_leistung", "12.4", "testdimmer_k1", "Werkbank Spots Leistung",
           {"state_class": "measurement"}, dc="power", unit="W"),
        _e("light.wandlicht_garten", "off", "testdimmer_k2", "Wandlicht Garten", _off(DIM)),
        _e("sensor.wandlicht_garten_leistung", "0.0", "testdimmer_k2", "Wandlicht Garten Leistung",
           {"state_class": "measurement"}, dc="power", unit="W"),
    ]
    return {
        "areas": [AREA_A, AREA_B],
        "devices": [
            _dev(BRIDGE, "Testbrücke", "Signify Netherlands B.V.", "BSB002"),
            _dev("testhue_werkbank", "Werkbanklampe", "Signify Netherlands B.V.", "LTA009", AREA_A, BRIDGE),
            _dev("testhue_palme", "Palmenleuchte", "Signify Netherlands B.V.", "LCA006", AREA_B, BRIDGE),
            _dev(COORD, "Testkoordinator", "Testfunk", "Zigbee-Stick"),
            _dev("testzb_decke", "Deckenlicht Garage", "Testfunk", "Deckenleuchte CT", AREA_A, COORD),
            _dev("testzb_thermostat", "Heizkörper Garage", "Testfunk", "Heizkörperthermostat", AREA_A, COORD),
            _dev(DIMMER, "Testdimmer 2PM", "Testwerk", "Dimmer 2PM", AREA_A),
            _dev("testdimmer_k1", "Werkbank Spots", "Testwerk", "Dimmer 2PM", AREA_A, DIMMER),
            _dev("testdimmer_k2", "Wandlicht Garten", "Testwerk", "Dimmer 2PM", AREA_B, DIMMER),
        ],
        "entities": ents,
    }
