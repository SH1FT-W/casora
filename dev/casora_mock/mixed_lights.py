"""Made-up mixed-light room for light popup tests."""
from __future__ import annotations

AREA = "Mischraum"


def _device(key: str, name: str, model: str) -> dict:
    return {"key": key, "name": name, "manufacturer": "Testwerk", "model": model, "area": AREA}


def _lamp(entity_id: str, state: str, device: str, name: str, attrs: dict) -> dict:
    return {"entity_id": entity_id, "state": state,
            "attributes": {"friendly_name": name, **attrs}, "platform": "casora_mock", "device": device,
            "area": AREA, "original_name": name, "name": None, "icon": None, "device_class": None,
            "unit": None, "hidden": False, "translation_key": None, "entity_category": None}


def extra() -> dict:
    """A two-tone lamp beside a colour-only lamp."""
    two_tone = "test_mixed_two_tone"
    colour = "test_mixed_colour"
    return {
        "areas": [AREA],
        "devices": [
            _device(two_tone, "Testleuchte Zweiton", "Zweikanal"),
            _device(colour, "Testleuchte Farbe", "Farbkanal"),
        ],
        "entities": [
            _lamp("light.mischraum_zweiton", "off", two_tone, "Testleuchte Zweiton", {
                "supported_color_modes": ["color_temp"], "color_mode": None, "brightness": None,
                "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500,
            }),
            # HS lets the mock derive rgb_color after HA emulates color_temp_kelvin; rgbww does not.
            _lamp("light.mischraum_farbe", "on", colour, "Testleuchte Farbe", {
                "supported_color_modes": ["hs"], "color_mode": "hs", "brightness": 204,
                "hs_color": [210, 80],
            }),
        ],
    }


def join_house_group(fixture: dict) -> list[str]:
    """Put the mixed room's lamps, as one room group, into the house's light group of the fixture.

    Same reason as hubs.join_house_group: with lamps outside the house group, "Start fresh" finds no HA group for
    Home and the house light popup checks lose their precondition (dev/unit/phone_preview_twin.mjs). The group has
    no area and is not named like the room, so "Start fresh" still finds the lamps themselves. Without a fixture
    there is no house group and nothing changes. Returns the house groups changed.
    """
    lights = {e["entity_id"]: e for e in fixture["entities"] if e["entity_id"].startswith("light.")}

    def members(eid):
        m = ((lights.get(eid) or {}).get("attributes") or {}).get("entity_id")
        return m if isinstance(m, list) else []

    houses = [eid for eid in lights if len(members(eid)) >= 2 and all(members(x) for x in members(eid))]
    if not houses:
        return []
    lamps = [e for e in extra()["entities"] if e["entity_id"].startswith("light.")]
    gid = "light.testleuchten_misch"
    on = [e for e in lamps if e["state"] == "on"]
    attrs = {"entity_id": [e["entity_id"] for e in lamps], "supported_color_modes": ["color_temp", "hs"],
             "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500,
             "color_mode": on[0]["attributes"].get("color_mode") if on else None,
             "brightness": max(e["attributes"].get("brightness") or 0 for e in on) if on else None}
    if gid not in lights:
        g = {"entity_id": gid, "state": "on" if on else "off",
             "attributes": {"friendly_name": "Testleuchten Misch", **attrs}, "platform": "casora_mock", "device": None,
             "area": None, "original_name": "Testleuchten Misch", "name": None, "icon": None, "device_class": None,
             "unit": None, "hidden": False, "translation_key": None, "entity_category": None}
        fixture["entities"].append(g)
        lights[gid] = g
    for eid in houses:
        m = members(eid)
        if gid not in m:
            lights[eid]["attributes"] = {**lights[eid]["attributes"], "entity_id": m + [gid]}
    return houses
