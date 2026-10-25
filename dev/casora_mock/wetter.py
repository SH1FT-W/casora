"""A made-up weather station like "Wetter & Warnungen" (domain wetter) for the test house (issue #56).

weather entity with HA's standard attributes (dew point, gusts, cloud cover, felt temperature) and, on the same
device, sensors by translation_key as that integration names them (temperature, dew_point, wind_gust, cloud_cover,
precipitation, precipitation_probability(_today), solar) plus an apparent_temperature sensor, with 48 h history for
the popup's two curves. Name, place and values invented.
"""
from __future__ import annotations

from .maeher import _ent as _maeher_ent

DEV = "testwetter"
BASE = "testwetter"
WEATHER = f"weather.{BASE}"
TEMP = f"sensor.{BASE}_temperature"
FEELS = f"sensor.{BASE}_apparent_temperature"


def _ent(*a, **kw):
    e = _maeher_ent(*a, **kw)
    e["device"] = DEV
    return e


def extra(now) -> dict:
    w = {"temperature": 11.4, "apparent_temperature": 8.6, "dew_point": 6.2, "humidity": 70, "pressure": 1013.2,
         "wind_speed": 18.4, "wind_gust_speed": 41.0, "wind_bearing": 225, "cloud_coverage": 75, "visibility": 24.0,
         "temperature_unit": "°C", "pressure_unit": "hPa", "wind_speed_unit": "km/h", "visibility_unit": "km",
         "precipitation_unit": "mm", "attribution": "Testwetterdienst", "supported_features": 3}
    m = {"state_class": "measurement"}
    ents = [
        _ent(WEATHER, "partlycloudy", w, "Testwetter"),
        _ent(TEMP, "11.4", m, "Testwetter Temperatur", dc="temperature", unit="°C", key="temperature"),
        _ent(FEELS, "8.6", m, "Testwetter Gefühlte Temperatur", dc="temperature", unit="°C", key="apparent_temperature"),
        _ent(f"sensor.{BASE}_dew_point", "6.2", m, "Testwetter Taupunkt", dc="temperature", unit="°C", key="dew_point"),
        _ent(f"sensor.{BASE}_wind_gust", "41", m, "Testwetter Windböen", dc="wind_speed", unit="km/h", key="wind_gust"),
        _ent(f"sensor.{BASE}_cloud_cover", "75", m, "Testwetter Bewölkung", unit="%", key="cloud_cover"),
        _ent(f"sensor.{BASE}_precipitation", "0.4", m, "Testwetter Niederschlag", dc="precipitation_intensity",
             unit="mm/h", key="precipitation"),
        _ent(f"sensor.{BASE}_precipitation_probability", "35", m, "Testwetter Regenwahrscheinlichkeit", unit="%",
             key="precipitation_probability"),
        _ent(f"sensor.{BASE}_precipitation_probability_today", "60", m, "Testwetter Regenwahrscheinlichkeit heute",
             unit="%", key="precipitation_probability_today"),
        _ent(f"sensor.{BASE}_solar", "180", m, "Testwetter Globalstrahlung", dc="irradiance", unit="W/m²", key="solar"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testwetter", "manufacturer": "Testwetterdienst", "model": "Station 1",
                     "area": None}],
        "entities": ents,
        # Felt temperature below the measured one, further apart in the windy afternoon.
        "_history": {
            TEMP: {"base": 11.4, "day": 3.2, "peak": 15, "wave": 0.4, "noise": 0.08, "digits": 1},
            FEELS: {"base": 8.6, "day": 3.6, "peak": 15, "wave": 0.7, "noise": 0.12, "digits": 1,
                    "bumps": [[16, -1.6, 2.5]]},
        },
    }
