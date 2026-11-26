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
    check(A.kind_for_tool({"view": "lights", "area": "house"}) == ("lights", {"area": "house"}), "tool → lights (house words)")
    check(A.kind_for_tool({"view": "room", "area": "Flur"}) == ("room", {"area": "Flur"}), "tool → room")

    # Review: "Lichter im Haus" fit both the house and the room sentence; one trigger now, the house words win
    # unless a room is called exactly that (also not "Gartenhaus" by a part of its name).
    snap_h = {"areas": SNAP["areas"] + [{"id": "gh", "name": "Gartenhaus", "aliases": []}], "entities": SNAP["entities"]}
    for said in ("haus", "ganzen Haus", "the whole house", ""):
        s, t = A.resolve("lights", {"area": said}, snap_h, "de")
        check(t == {"view": "lights"} and s == "1 von 1 Lichtern sind an.", f"lights in the house ({said!r}): {s} {t}")
    s, t = A.resolve("lights", {"area": "Wohnzimmer"}, snap_h, "de")
    check(t and t["area_id"] == "wz", f"lights of a room {t}")
    snap_h2 = {"areas": [{"id": "haus", "name": "Haus", "aliases": []}], "entities": []}
    s, t = A.resolve("lights", {"area": "Haus"}, snap_h2, "de")
    check(t is None and "Haus" in s, f"a room called Haus is that room: {s}")

    # Review: a room's temperature is its thermostat, else the median of sensors that read like a room; a freezer,
    # fridge, printer nozzle or aquarium in the area does not decide warmest/coldest.
    ents = [
        {"entity_id": "sensor.k_room", "domain": "sensor", "device_class": "temperature", "state": "21", "unit": "°C", "area_id": "kueche", "name": "Küche"},
        {"entity_id": "sensor.k_freezer", "domain": "sensor", "device_class": "temperature", "state": "-18", "unit": "°C", "area_id": "kueche", "name": "Gefrierschrank"},
        {"entity_id": "sensor.k_fridge", "domain": "sensor", "device_class": "temperature", "state": "4", "unit": "°C", "area_id": "kueche", "name": "Kühlschrank"},
        {"entity_id": "sensor.b_nozzle", "domain": "sensor", "device_class": "temperature", "state": "220", "unit": "°C", "area_id": "flur", "name": "Düse"},
        {"entity_id": "sensor.b_room", "domain": "sensor", "device_class": "temperature", "state": "19", "unit": "°C", "area_id": "flur", "name": "Flur"},
        {"entity_id": "sensor.b_room2", "domain": "sensor", "device_class": "temperature", "state": "19.4", "unit": "°C", "area_id": "flur", "name": "Flur 2"},
        {"entity_id": "sensor.b_aqua", "domain": "sensor", "device_class": "temperature", "state": "25", "unit": "°C", "area_id": "flur", "name": "Aquarium"},
        {"entity_id": "sensor.w_room", "domain": "sensor", "device_class": "temperature", "state": "23", "unit": "°C", "area_id": "wz", "name": "WZ"},
        {"entity_id": "climate.wz", "domain": "climate", "state": "heat", "unit": "°C", "area_id": "wz", "name": "Thermostat", "attributes": {"current_temperature": 20.5}},
    ]
    snap_t = {"areas": SNAP["areas"], "entities": ents}
    temps = A.room_temps(snap_t)
    check(temps["kueche"]["value"] == 21 and temps["flur"]["value"] == 19.4, f"room values {temps}")
    check(temps["wz"] == {"value": 20.5, "unit": "°C", "entity_id": "climate.wz"}, f"thermostat first {temps['wz']}")
    s, t = A.resolve("climate_cold", {}, snap_t, "de")
    check(t["area_id"] == "flur" and s == "Am kältesten ist es gerade im Raum Flur mit 19,4 °C.", f"coldest: no freezer {s}")
    s, t = A.resolve("climate_warm", {}, snap_t, "en")
    check(t["area_id"] == "kueche", f"warmest: no nozzle {s}")
    f = [{"entity_id": "sensor.f", "domain": "sensor", "device_class": "temperature", "state": "70", "unit": "°F", "area_id": "wz", "name": "F"}]
    check(A.room_temps({"areas": SNAP["areas"], "entities": f})["wz"]["value"] == 70, "°F reads like a room")

    # Review: Casora's "Who sees this?" also limits what Assist tells; a satellite (no user) gets no limited entity.
    users = {"lock.tuer": {"u1"}}
    check(A.sees("lock.tuer", "u1", users) and not A.sees("lock.tuer", "u2", users), "who sees this")
    check(not A.sees("lock.tuer", None, users) and A.sees("light.a", None, users), "no user: unlimited only")

    # Review: the sentences follow the Studio switch (and the Assist button) of Casora's dashboards.
    def dash(v, eu=None):
        var = dict(v)
        if eu:
            var["casora_entity_users"] = eu
        return {"views": [{"cards": [{"type": "custom:button-card", "template": "casora_room", "variables": var}]}]}
    check(A.dashboards_state([dash({})])[0] is True, "a Casora dashboard: on by default")
    check(A.dashboards_state([dash({"assist_popups": False})])[0] is False, "switch off")
    check(A.dashboards_state([dash({"show_assist": False})])[0] is False, "no Assist button")
    check(A.dashboards_state([dash({"assist_popups": False}), dash({})])[0] is True, "one dashboard on is enough")
    check(A.dashboards_state([{"views": [{"cards": [{"type": "entities"}]}]}])[0] is False, "no Casora dashboard: off")
    phone = {"views": [{"cards": [{"template": "casora_mobile_bg"}, {"type": "vertical-stack", "cards": [
        {"template": "casora_mobile_weather", "variables": {"assist_popups": False}}]}]}]}
    check(A.dashboards_state([phone])[0] is False, "phone title card switch")
    _w, u = A.dashboards_state([dash({}, {"lock.tuer": ["u1", "u2"]}), dash({}, {"lock.tuer": ["u1"], "cam": []})])
    check(u == {"lock.tuer": {"u1"}}, f"user lists of several dashboards {u}")

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
