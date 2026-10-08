"""Zwei erfundene Aquarien für das Testhaus (immer dabei, auch ohne private Fixture).

Becken A ist wie eine Juwel-HeliaLux-Lampe gebaut: eine RGBW-Leuchte, ein Schalter
„manuelle Farbsimulation“ (an = Home Assistant steuert die Farben) und ein Profil-select.
Becken B mischt, was Fluval und Chihiros liefern: eine RGB-Leuchte mit eigenen Effekten
(effect_list), je Farbkanal eine number (0–100 %), ein select „Modus“ mit übersetzten
Zuständen und einen Schalter „Auto-Modus“ (an = die Lampe fährt ihr eigenes Programm),
dazu eine Dosierpumpe mit zwei Kanälen. Keine Räume – das Studio legt sie nicht von selbst an;
dev/qa/regress/r86_aquarium_licht.mjs baut die Kacheln im Browser.
"""
from __future__ import annotations

from datetime import datetime

A, B = "mock_becken_a", "mock_becken_b"


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": None}


def extra(now: datetime) -> dict:
    ents = [
        # Becken A – HeliaLux-artig
        _e("sensor.testbecken_a_wassertemperatur", "25.4", "water_temperature", A, "Testbecken A Wassertemperatur",
           {"state_class": "measurement"}, dc="temperature", unit="°C"),
        _e("light.testbecken_a_lampe", "on", "light", A, "Testbecken A Lampe",
           {"supported_color_modes": ["rgbw"], "color_mode": "rgbw", "brightness": 178,
            "rgbw_color": [140, 76, 102, 178], "supported_features": 0}),
        _e("switch.testbecken_a_manuelle_farbsimulation", "on", "manual_color_simulation", A,
           "Testbecken A Manuelle Farbsimulation"),
        _e("select.testbecken_a_profil", "standard", "profile", A, "Testbecken A Profil",
           {"options": ["standard", "pflanzen", "abend"]}),
        # Becken B – Fluval-/Chihiros-artig
        _e("sensor.testbecken_b_wassertemperatur", "25.9", "water_temperature", B, "Testbecken B Wassertemperatur",
           {"state_class": "measurement"}, dc="temperature", unit="°C"),
        _e("light.testbecken_b_lampe", "on", "light", B, "Testbecken B Lampe",
           {"supported_color_modes": ["rgb"], "color_mode": "rgb", "brightness": 230, "rgb_color": [115, 74, 255],
            "effect_list": ["off", "Sunrise", "Clouds", "Moonlight"], "effect": "off", "supported_features": 4}),
        *[_e("number.testbecken_b_kanal_" + k, v, "channel_" + k, B, "Testbecken B Kanal " + n,
             {"min": 0, "max": 100, "step": 1, "mode": "slider"}, unit="%")
          for k, n, v in (("red", "Rot", "45"), ("green", "Grün", "29"), ("blue", "Blau", "100"), ("white", "Weiß", "60"))],
        _e("select.testbecken_b_modus", "manual", "mode", B, "Testbecken B Modus",
           {"options": ["manual", "automatic", "professional"]}),
        _e("switch.testbecken_b_auto_modus", "on", "auto_mode", B, "Testbecken B Auto-Modus"),
        _e("button.testbecken_b_dosieren_1", "unknown", "dose_1", B, "Testbecken B Dosieren 1"),
        _e("button.testbecken_b_dosieren_2", "unknown", "dose_2", B, "Testbecken B Dosieren 2"),
        _e("number.testbecken_b_menge_1", "2.0", "dose_volume_1", B, "Testbecken B Menge 1",
           {"min": 0.2, "max": 20, "step": 0.1, "mode": "box"}, unit="ml"),
        _e("sensor.testbecken_b_heute_1", "2.0", "dosed_today_1", B, "Testbecken B Heute 1", unit="ml"),
    ]
    return {
        "devices": [
            {"key": A, "name": "Testbecken A", "manufacturer": "Beispiel", "model": "RGBW-Leuchte", "area": None},
            {"key": B, "name": "Testbecken B", "manufacturer": "Beispiel", "model": "RGB-Leuchte", "area": None},
        ],
        "entities": ents,
    }
