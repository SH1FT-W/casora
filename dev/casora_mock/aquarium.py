"""Made-up aquariums for the test house (always there, also without the private fixture).

Tank A is built like a Juwel HeliaLux lamp: one RGBW light, a switch "manual colour simulation" (on = Home
Assistant controls the colours) and a profile select. Tank B mixes what Fluval and Chihiros provide: an RGB light
with its own effects (effect_list), one number per colour channel (0-100 %), a select "mode" with translated states
and a switch "auto mode" (on = the lamp runs its own program), plus a dosing pump with two channels. No rooms - the
Studio does not add them by itself; dev/qa/regress/r86_aquarium_licht.mjs builds the tiles in the browser.
Three complete tanks for the popup gallery follow below (tanks()).
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
        # Tank A - HeliaLux-like
        _e("sensor.testbecken_a_wassertemperatur", "25.4", "water_temperature", A, "Testbecken A Wassertemperatur",
           {"state_class": "measurement"}, dc="temperature", unit="°C"),
        _e("light.testbecken_a_lampe", "on", "light", A, "Testbecken A Lampe",
           {"supported_color_modes": ["rgbw"], "color_mode": "rgbw", "brightness": 178,
            "rgbw_color": [140, 76, 102, 178], "supported_features": 0}),
        _e("switch.testbecken_a_manuelle_farbsimulation", "on", "manual_color_simulation", A,
           "Testbecken A Manuelle Farbsimulation"),
        _e("select.testbecken_a_profil", "standard", "profile", A, "Testbecken A Profil",
           {"options": ["standard", "pflanzen", "abend"]}),
        # Tank B - Fluval/Chihiros-like
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


# ── Three complete tanks (popup gallery: aquarium overview, tank, aquarium light) ─────────────────────────────
# Shaped like a real house with three tanks, names made up: per tank a probe (water temperature + battery,
# Zigbee-like ids ending in "_temperatur_temperature"), a template status helper "<tank>_temperaturstatus"
# (the overview tile finds it by that name), a template problem sensor, a leak sensor (moisture + battery),
# plugs for the equipment (switch + power + energy today/month, the tank popup finds them on the switch's device)
# and the lamp of its integration:
#   Testriff     – Fluval-like reef lamp: RGB light with effects, five number channels (blue, cold white, cyan,
#                  pink, purple), a reachability sensor and a mode select
#   Testpflanzen – HeliaLux-like 4-channel lamp (RGBW light, numbers red/green/blue/white, "manual colour
#                  simulation" switch, profile select) and a Chihiros-like four-channel dosing pump
#   Testschildi  – Chihiros-like RGB lamp (auto mode, reachability), four plugs (pump, skimmer, heat lamp, daylight)
TANKS = (
    # key, name, water temperature, chart colour
    ("testriff", "Testriff", "25.3", "#57FFFC"),
    ("testpflanzen", "Testpflanzenbecken", "24.8", "#30D158"),
    ("testschildi", "Testschildkrötenbecken", "22.6", "#FF9230"),
)


def _plug(key, name, power, today, month, total):
    dev = key + "_steckdose"
    return dev, name, [
        _e("switch." + key, "on", "switch", dev, name, dc="outlet"),
        _e("sensor." + key + "_power", power, "power", dev, name + " Leistung", {"state_class": "measurement"},
           dc="power", unit="W"),
        _e("sensor." + key + "_energy", total, "energy", dev, name + " Energie", {"state_class": "total_increasing"},
           dc="energy", unit="kWh"),
        _e("sensor." + key + "_energy_today", today, "energy_today", dev, "Energie Heute",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        _e("sensor." + key + "_energy_month", month, "energy_month", dev, "Energie Monat",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
    ]


def tanks(now: datetime) -> dict:
    devs, ents = [], []

    def dev(key, name, manufacturer, model):
        devs.append({"key": key, "name": name, "manufacturer": manufacturer, "model": model, "area": None})

    for key, name, temp, _c in TANKS:
        probe = key + "_temperatur"
        dev(probe, name + " Temperatur", "Beispiel", "Wassertemperaturfühler (Zigbee)")
        ents += [
            _e("sensor." + probe + "_temperature", temp, "temperature", probe, name + " Temperatur",
               {"state_class": "measurement"}, dc="temperature", unit="°C"),
            _e("sensor." + probe + "_battery", "100", "battery", probe, name + " Temperatur Batterie",
               {"state_class": "measurement"}, dc="battery", unit="%"),
            # Template helpers of the house (no device): temperature status and "check tank".
            _e("sensor." + key + "_temperaturstatus", "ok", None, None, name + " Temperaturstatus",
               {"icon": "mdi:thermometer-check"}),
            _e("binary_sensor." + key + "_pruefen", "off", None, None, name + " prüfen", dc="problem"),
        ]
        leak = key + "_lecksensor"
        dev(leak, name + " Lecksensor", "Beispiel", "Wassermelder (Zigbee)")
        ents += [
            _e("binary_sensor." + leak + "_wasserleck", "off", "water_leak", leak, name + " Lecksensor Wasserleck",
               dc="moisture"),
            _e("sensor." + leak + "_batterie", "91", "battery", leak, name + " Lecksensor Batterie",
               {"state_class": "measurement"}, dc="battery", unit="%"),
        ]

    plugs = [
        _plug("testriff_technik", "Testriff Technik", "30.7", "0.952", "34.195", "135.74"),
        _plug("testriff_abschaeumer", "Testriff Abschäumer", "4.1", "0.098", "3.02", "18.4"),
        _plug("testpflanzen_technik", "Testpflanzenbecken Technik", "18.2", "0.41", "13.6", "77.2"),
        _plug("testschildi_pumpe", "Testschildkrötenbecken Pumpe", "7.56", "0.136", "5.299", "77.72"),
        _plug("testschildi_skimmer", "Testschildkrötenbecken Skimmer", "5.2", "0.12", "3.9", "41.0"),
        _plug("testschildi_waermelampe", "Testschildkrötenbecken Wärmelampe", "48.0", "0.52", "16.8", "120.3"),
        _plug("testschildi_tageslicht", "Testschildkrötenbecken Tageslicht", "11.4", "0.14", "4.6", "33.9"),
    ]
    for key, name, pe in plugs:
        dev(key, name, "Beispiel", "Zwischenstecker (Zigbee)")
        ents += pe

    # Testriff: Fluval-like reef lamp.
    lamp = "testriff_lampe"
    dev(lamp, "Testriff Lampe", "Beispiel", "Riff-LED (BLE)")
    ch = (("blue", "Blau", "100"), ("cold_white", "Kaltweiß", "44"), ("cyan", "Cyan", "87"), ("pink", "Pink", "32"),
          ("purple", "Violett", "76"))
    ents += [
        _e("light." + lamp + "_licht", "on", "light", lamp, "Testriff Lampe Licht",
           {"supported_color_modes": ["rgb"], "color_mode": "rgb", "brightness": 255, "rgb_color": [119, 71, 255],
            "effect_list": ["off", "crescent_moon", "partly_cloudy", "lightning", "sun_and_lightning"], "effect": "off",
            "channels": {k: int(v) for k, _n, v in ch}, "supported_features": 36}),
        _e("binary_sensor." + lamp + "_erreichbar", "on", "reachable", lamp, "Testriff Lampe Erreichbar",
           dc="connectivity"),
        _e("select." + lamp + "_modus", "professional", "mode", lamp, "Testriff Lampe Modus",
           {"options": ["manual", "automatic", "professional"]}),
        *[_e("number." + lamp + "_" + k, v, k, lamp, "Testriff Lampe " + n,
             {"min": 0, "max": 100, "step": 1, "mode": "slider"}, unit="%") for k, n, v in ch],
    ]

    # Testpflanzen: HeliaLux-like 4-channel lamp.
    lamp = "testpflanzen_lampe"
    dev(lamp, "Testpflanzenbecken Lampe", "Beispiel", "4-Kanal-Lichtsteuerung")
    ch = (("red", "Rot", "80"), ("green", "Grün", "55"), ("blue", "Blau", "60"), ("white", "Weiß", "100"))
    ents += [
        _e("light." + lamp + "_licht", "on", "light", lamp, "Testpflanzenbecken Lampe Licht",
           {"supported_color_modes": ["rgbw"], "color_mode": "rgbw", "brightness": 255, "rgbw_color": [204, 140, 153, 255],
            "manual": False, "supported_features": 32}),
        _e("switch." + lamp + "_manual_color_simulation", "off", "manual_color_simulation", lamp,
           "Testpflanzenbecken Lampe Manuelle Farbsimulation"),
        _e("select." + lamp + "_profil", "Tag", "profile", lamp, "Testpflanzenbecken Lampe Profil",
           {"options": ["Tag", "Pflanzen", "Abend", "Mondlicht"]}),
        *[_e("number." + lamp + "_" + k, v, k, lamp, "Testpflanzenbecken Lampe " + n,
             {"min": 0, "max": 100, "step": 1, "mode": "slider"}, unit="%") for k, n, v in ch],
    ]
    # Chihiros-like dosing pump with four channels.
    pump = "testdosierpumpe"
    dev(pump, "Testdosierpumpe", "Beispiel", "Dosierpumpe 4 Kanäle")
    ents.append(_e("binary_sensor." + pump + "_erreichbar", "on", "reachable", pump, "Testdosierpumpe Erreichbar",
                   dc="connectivity"))
    for n, today, total in ((1, "1.5", "285.5"), (2, "1.0", "245.0"), (3, "1.0", "238.0"), (4, "1.0", "244.0")):
        p = f"{pump}_pumpe_{n}"
        ents += [
            _e(f"button.{p}_dosieren", "unknown", f"dose_{n}", pump, f"Testdosierpumpe Pumpe {n} dosieren"),
            _e(f"number.{p}_dosiermenge", "1.0", f"dose_volume_{n}", pump, f"Testdosierpumpe Pumpe {n} Dosiermenge",
               {"min": 0.2, "max": 20, "step": 0.1, "mode": "box"}, unit="mL"),
            _e(f"sensor.{p}_heute", today, f"dosed_today_{n}", pump, f"Testdosierpumpe Pumpe {n} heute",
               dc="volume", unit="mL"),
            _e(f"sensor.{p}_gesamt", total, f"dosed_total_{n}", pump, f"Testdosierpumpe Pumpe {n} gesamt",
               {"state_class": "total_increasing"}, dc="volume", unit="mL"),
        ]

    # Testschildi: Chihiros-like RGB lamp.
    lamp = "testschildi_lampe"
    dev(lamp, "Testschildkrötenbecken Lampe", "Beispiel", "RGB-Leuchte (BLE)")
    ents += [
        _e("light." + lamp + "_rgb", "on", "light", lamp, "Testschildkrötenbecken Lampe",
           {"supported_color_modes": ["rgb"], "color_mode": "rgb", "brightness": 181, "rgb_color": [255, 255, 255],
            "auto_mode": True, "channels": {"red": 71, "green": 71, "blue": 71}, "supported_features": 32}),
        _e("binary_sensor." + lamp + "_erreichbar", "on", "reachable", lamp, "Testschildkrötenbecken Lampe Erreichbar",
           dc="connectivity"),
        _e("switch." + lamp + "_auto_modus", "on", "auto_mode", lamp, "Testschildkrötenbecken Lampe Auto-Modus"),
    ]
    # A BLE current pump that dropped out (not reachable): Pulse lists it as failed (dev/qa/testhaus-extras.mjs).
    pump = "testschildi_stroemungspumpe"
    dev(pump, "Testschildkrötenbecken Strömungspumpe", "Beispiel", "Strömungspumpe (BLE)")
    ents += [
        _e("binary_sensor." + pump + "_erreichbar", "off", "reachable", pump,
           "Testschildkrötenbecken Strömungspumpe Erreichbar", dc="connectivity"),
        _e("switch." + pump, "unavailable", "switch", pump, "Testschildkrötenbecken Strömungspumpe"),
    ]
    return {"devices": devs, "entities": ents}

