"""Plants from Pflanzenmonitor Plus count like plant.* (ki.py, raumklima.py) – without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/plant_plus_test.py

Pflanzenmonitor Plus has one status sensor per plant (platform pflanzenmonitor_plus, unique_id
"<plant>-status") instead of Plant Monitor's plant.*. Checks: is_plant/plant_devices know both, a
plant's humidity/CO2 readings stay out of the ventilation coach (vent_rooms) and the room climate
(find_rooms) for both, other Plus entities and foreign sensors do not make a device a plant.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import ki, raumklima  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


def entry(eid, platform, unique_id, device_id, area_id=None):
    return SimpleNamespace(entity_id=eid, domain=eid.split(".")[0], platform=platform, unique_id=unique_id,
                           device_id=device_id, area_id=area_id, entity_category=None, disabled_by=None,
                           hidden_by=None)


class Reg:
    def __init__(self, items):
        self.entities = {e.entity_id: e for e in items}

    def async_get(self, eid):
        return self.entities.get(eid)


class Areas:
    def async_get_area(self, aid):
        return SimpleNamespace(name=aid.title()) if aid else None


class Devices:
    def async_get(self, did):
        return SimpleNamespace(area_id="wohnzimmer")


class States:
    def __init__(self, items):
        self.items = {s.entity_id: s for s in items}

    def get(self, eid):
        return self.items.get(eid)

    def async_all(self, domain=None):
        doms = (domain,) if isinstance(domain, str) else domain
        return [s for s in self.items.values() if not doms or s.domain in doms]


def st(eid, state, **attrs):
    return SimpleNamespace(entity_id=eid, domain=eid.split(".")[0], state=str(state), attributes=attrs)


# A made-up home: one Plant Monitor plant, one Plus plant, a room sensor, all in the living room.
REG = Reg([
    entry("plant.fern", "plant", "pm-1", "dev_pm"),
    entry("sensor.fern_humidity", "plant", "pm-1-current-humidity", "dev_pm"),
    entry("sensor.palm", "pflanzenmonitor_plus", "palm-status", "dev_plus"),
    entry("sensor.palm_luftfeuchtigkeit", "pflanzenmonitor_plus", "palm-current-humidity", "dev_plus"),
    entry("sensor.palm_co2", "pflanzenmonitor_plus", "palm-current-co2", "dev_plus"),
    entry("number.palm_max_bodenfeuchtigkeit", "pflanzenmonitor_plus", "palm-max-moisture", "dev_plus"),
    # Plus entities that are not a plant's status: a learning sensor on a device of its own.
    entry("sensor.palm_giessen_in", "pflanzenmonitor_plus", "palm_next_watering", "dev_learn"),
    # Another integration's sensor whose unique_id happens to end in "-status".
    entry("sensor.router_status", "router_x", "abc-status", "dev_router"),
    entry("sensor.raum_feuchte", "zigbee", "z-1", "dev_room"),
    entry("sensor.raum_co2", "zigbee", "z-2", "dev_room"),
])

check("plant.* is a plant", ki.is_plant(REG.entities["plant.fern"]))
check("Plus status sensor is a plant", ki.is_plant(REG.entities["sensor.palm"]))
check("Plus reading is no plant", not ki.is_plant(REG.entities["sensor.palm_luftfeuchtigkeit"]))
check("Plus limit (number) is no plant", not ki.is_plant(REG.entities["number.palm_max_bodenfeuchtigkeit"]))
check("Plus learning sensor is no plant", not ki.is_plant(REG.entities["sensor.palm_giessen_in"]))
check("foreign *-status sensor is no plant", not ki.is_plant(REG.entities["sensor.router_status"]))
devs = ki.plant_devices(REG)
check("plant devices: Plant Monitor and Plus", devs == {"dev_pm", "dev_plus"}, devs)

STATES = States([
    st("plant.fern", "ok"),
    st("sensor.fern_humidity", 55, device_class="humidity"),
    st("sensor.palm", "problem", problems=[], moisture_status="Low", species="Palm"),
    st("sensor.palm_luftfeuchtigkeit", 60, device_class="humidity"),
    st("sensor.palm_co2", 900, device_class="carbon_dioxide"),
    st("sensor.raum_feuchte", 48, device_class="humidity"),
    st("sensor.raum_co2", 700, device_class="carbon_dioxide"),
])
HASS = SimpleNamespace(states=STATES, data={})

# Registries for both modules (ki._area_id looks up the device's area).
for mod in (ki, raumklima):
    mod.er.async_get = lambda hass: REG
    mod.ar.async_get = lambda hass: Areas()
    mod.dr.async_get = lambda hass: Devices()

rooms = ki.vent_rooms(HASS)
check("vent_rooms: one room", len(rooms) == 1, rooms)
check("vent_rooms: room humidity, no plant's", rooms and rooms[0]["rh"] == "sensor.raum_feuchte", rooms)
check("vent_rooms: room CO2, not the Plus plant's", rooms and rooms[0]["co2"] == "sensor.raum_co2", rooms)

rooms = raumklima.find_rooms(HASS)
check("find_rooms: one room", len(rooms) == 1, rooms)
r = rooms[0] if rooms else {}
check("find_rooms: only the room's humidity", r.get("rh") == ["sensor.raum_feuchte"], r)
check("find_rooms: only the room's CO2", r.get("co2") == ["sensor.raum_co2"], r)

print("alle ok" if not fails else f"{fails} Fehler")
sys.exit(1 if fails else 0)
