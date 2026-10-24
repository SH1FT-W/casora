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
dev/qa/regress/r307_start_fresh_lamps.mjs rely on these devices. With the private fixture the lamps also get a
light group per room in the house's light group (join_house_group). Names made up.
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


def join_house_group(fixture: dict) -> list[str]:
    """Give the hub lamps a light group per room and put those into the house's light group of the fixture.

    The house group is a light group whose members are all light groups (one per room), like a real "all lamps"
    group. With the hub lamps outside it, "Start fresh" found no HA group for Home (Home got a list tile and a
    badge without a group) and the gate's checks of the house light popup lost their precondition (r69, r73,
    r174, gate 23.10.2026). Room groups, not the lamps themselves: the house popup takes its members as rooms
    (r270), and a lamp's popup shows the group it is in as its room (r65). The groups have no area and are not
    named like the room, so "Start fresh" still finds the lamps themselves (r307). Without a fixture (unit tests,
    --public) there is no house group and nothing changes. Returns the house groups changed.
    """
    lights = {e["entity_id"]: e for e in fixture["entities"] if e["entity_id"].startswith("light.")}

    def members(eid):
        m = ((lights.get(eid) or {}).get("attributes") or {}).get("entity_id")
        return m if isinstance(m, list) else []

    houses = [eid for eid in lights if len(members(eid)) >= 2 and all(members(x) for x in members(eid))]
    if not houses:
        return []
    hub = extra(None)
    area = {d["key"]: d.get("area") for d in hub["devices"]}
    groups = []
    for room in (AREA_A, AREA_B):
        lamps = [e for e in hub["entities"] if e["entity_id"].startswith("light.") and area.get(e["device"]) == room]
        gid = "light.hub_lampen_" + room.lower()
        on = [e for e in lamps if e["state"] == "on"]
        attrs = {"entity_id": [e["entity_id"] for e in lamps], "supported_color_modes": ["brightness"],
                 "supported_features": 32, "color_mode": "brightness" if on else None,
                 "brightness": max(e["attributes"].get("brightness") or 0 for e in on) if on else None}
        g = _e(gid, "on" if on else "off", None, "Hub-Lampen " + room, attrs)
        if gid not in lights:
            fixture["entities"].append(g)
            lights[gid] = g
        groups.append(gid)
    for eid in houses:
        m = members(eid)
        lights[eid]["attributes"] = {**lights[eid]["attributes"], "entity_id": m + [g for g in groups if g not in m]}
    return houses


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
