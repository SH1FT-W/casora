"""Assist shows the matching Casora popup: what a request resolves to (assist_show.resolve), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/assist_show_test.py

Spoken names fit loosely (case, umlauts, articles, a part of a name, an area's alias, a camera by its room); the
warmest/coldest room skips outdoor areas and sensors without a value; energy finds a device's sensor by the device's
name and says the kWh; weather and security answer from the states. Nothing fits: an answer and no target.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import assist_show as A  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FAIL:", msg)


SNAP = {
    "areas": [{"id": "kueche", "name": "Küche", "aliases": []}, {"id": "wz", "name": "Wohnzimmer", "aliases": ["Stube"]},
              {"id": "balkon", "name": "Balkon", "aliases": []}, {"id": "flur", "name": "Flur", "aliases": []}],
    "entities": [
        {"entity_id": "sensor.t_kueche", "domain": "sensor", "device_class": "temperature", "state": "22.5", "unit": "°C", "area_id": "kueche", "name": "Küche Temperatur"},
        {"entity_id": "sensor.t_wz", "domain": "sensor", "device_class": "temperature", "state": "20", "unit": "°C", "area_id": "wz", "name": "WZ"},
        {"entity_id": "sensor.t_wz2", "domain": "sensor", "device_class": "temperature", "state": "unavailable", "unit": "°C", "area_id": "wz", "name": "WZ 2"},
        {"entity_id": "sensor.t_balkon", "domain": "sensor", "device_class": "temperature", "state": "31", "unit": "°C", "area_id": "balkon", "name": "Balkon"},
        {"entity_id": "sensor.t_diag", "domain": "sensor", "device_class": "temperature", "state": "60", "unit": "°C", "area_id": "flur", "name": "Chip", "category": "diagnostic"},
        {"entity_id": "camera.flur", "domain": "camera", "state": "idle", "area_id": "flur", "name": "Eingang"},
        {"entity_id": "camera.garten", "domain": "camera", "state": "idle", "area_id": None, "name": "Garten Kamera"},
        {"entity_id": "switch.wama", "domain": "switch", "state": "on", "area_id": "kueche", "name": "Waschmaschine", "device_id": "d1", "device": "Waschmaschine"},
        {"entity_id": "sensor.wama_energy", "domain": "sensor", "device_class": "energy", "state": "120", "area_id": "kueche", "name": "Waschmaschine Energie", "device_id": "d1", "device": "Waschmaschine"},
        {"entity_id": "weather.home", "domain": "weather", "state": "partlycloudy", "attributes": {"temperature": 12.5, "temperature_unit": "°C"}, "name": "Zuhause"},
        {"entity_id": "binary_sensor.fenster", "domain": "binary_sensor", "device_class": "window", "state": "on", "name": "Küchenfenster"},
        {"entity_id": "lock.tuer", "domain": "lock", "state": "locked", "name": "Haustür"},
        {"entity_id": "light.a", "domain": "light", "state": "on", "area_id": "wz", "name": "Decke"},
    ],
}


def main() -> int:
    s, t = A.resolve("climate_warm", {}, SNAP, "de")
    check(t and t["area_id"] == "kueche", f"warmest: kitchen, not the balcony or a diagnostic chip ({t})")
    check(s == "Am wärmsten ist es gerade im Raum Küche mit 22,5 °C.", s)
    s, t = A.resolve("climate_cold", {}, SNAP, "en")
    check(t["area_id"] == "wz" and s == "The coldest room right now is Wohnzimmer at 20 °C.", s)

    check(A.match_area("im wohnzimmer", SNAP["areas"])["id"] == "wz", "article and case")
    check(A.match_area("kuche", SNAP["areas"])["id"] == "kueche", "umlaut folded")
    check(A.match_area("Stube", SNAP["areas"])["id"] == "wz", "alias")
    check(A.match_area("Keller", SNAP["areas"]) is None, "unknown room")
    s, t = A.resolve("room", {"area": "Keller"}, SNAP, "de")
    check(t is None and "Keller" in s, s)

    s, t = A.resolve("camera", {"name": "Flur"}, SNAP, "de")
    check(t == {"view": "camera", "entity_id": "camera.flur"}, f"camera by its room {t}")
    s, t = A.resolve("camera", {"name": "garten"}, SNAP, "de")
    check(t and t["entity_id"] == "camera.garten", f"camera by its name {t}")

    s, t = A.resolve("energy", {"name": "die Waschmaschine", "_period": "week", "_used": 3.456}, SNAP, "de")
    check(t == {"view": "energy", "entity_id": "sensor.wama_energy", "period": "week"}, f"energy {t}")
    check(s == "Waschmaschine hat diese Woche 3,46 kWh verbraucht.", s)
    s, t = A.resolve("energy", {"name": "washing machine"}, SNAP, "en")
    check(t is None, "no fit in another language")

    s, t = A.resolve("weather", {}, SNAP, "de")
    check(s == "Draußen sind es 12,5 °C, teils bewölkt." and t["entity_id"] == "weather.home", s)
    s, t = A.resolve("security", {}, SNAP, "de")
    check(s == "1 offen: Küchenfenster." and t == {"view": "security"}, s)

    check(A.kind_for_tool({"view": "climate", "extreme": "coldest"}) == ("climate_cold", {}), "tool → coldest")
    check(A.kind_for_tool({"view": "lights"}) == ("lights_all", {}), "tool → all lights")
    check(A.kind_for_tool({"view": "room", "area": "Flur"}) == ("room", {"area": "Flur"}), "tool → room")

    p = A.Pending()
    p.put("u", {"view": "weather"})
    p.put(None, {"view": "weather"})
    check(p.take("x") is None and p.take("u") == {"view": "weather"} and p.take("u") is None, "pending per user, once")
    p.rows["u"] = (0.0, {"view": "room"})
    check(p.take("u") is None, "expired")

    if FAILS:
        print(f"{len(FAILS)} FAIL")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
