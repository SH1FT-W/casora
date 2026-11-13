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
