"""The test house without Home Assistant: composition and a frontend-like snapshot.

compose() builds what async_setup_entry loads (fixture plus the made-up devices of the modules beside it),
so the test integration and the unit tests see the same house. snapshot() turns it into the shape the
frontend gets as `hass` (states, entities, devices, areas), as the test integration registers it: every
entity under the platform casora_mock, categories from the fixture or the base class default.

    python3 dev/casora_mock/haus.py            # snapshot as JSON (stdout), with the private fixture if present
    python3 dev/casora_mock/haus.py --public   # only the made-up devices (no fixture)

No Home Assistant import here: the unit tests run it with any Python 3.9+.
"""
from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
_LOGGER = logging.getLogger(__name__)

# Helpers and core entities the test HA has for real (configuration.yaml): not registered by the mock.
REAL_DOMAINS = ("input_boolean", "input_select", "input_number", "input_text", "input_datetime", "sun", "automation")
# Base class defaults of HA when the fixture names no category (entity.py MockEntity).
DEFAULT_CATEGORY = {"device_tracker": "diagnostic", "update": "config"}


def merge(fixture: dict, extra: dict, label: str = "Stresshaus aktiv") -> None:
    """Append areas/devices/entities; what is there wins."""
    fixture["areas"] = list(fixture["areas"]) + [a for a in extra.get("areas", []) if a not in fixture["areas"]]
    keys = {d["key"] for d in fixture["devices"]}
    fixture["devices"] = list(fixture["devices"]) + [d for d in extra.get("devices", []) if d["key"] not in keys]
    ids = {e["entity_id"] for e in fixture["entities"]}
    fixture["entities"] = list(fixture["entities"]) + [e for e in extra.get("entities", []) if e["entity_id"] not in ids]
    fixture.setdefault("_buttons", {}).update(extra.get("_buttons", {}))
    fixture.setdefault("_history_extra", {}).update(extra.get("_history", {}))
    _LOGGER.warning("Casora Mock: %s (+%s Entitäten)", label, len(extra.get("entities", [])))


def vacuum_map(fixture: dict) -> None:
    """A vacuum without a map gets one (image.<vacuum>_map, picture from entity.MAP_PNG),
    so the popup shows the automatic map search."""
    ents = fixture["entities"]
    for v in [e for e in ents if e["entity_id"].startswith("vacuum.") and e.get("device")]:
        if any(e["entity_id"].startswith("image.") and e.get("device") == v["device"] for e in ents):
            continue
        name = (v.get("attributes") or {}).get("friendly_name") or "Saugroboter"
        ents.append({"entity_id": "image." + v["entity_id"].split(".", 1)[1] + "_map", "state": "2026-10-07T08:00:00+00:00",
                     "attributes": {"friendly_name": name + " Karte"}, "platform": "casora_mock", "device": v["device"],
                     "area": None, "original_name": "Karte", "name": None, "icon": None, "device_class": None,
                     "unit": None, "hidden": False, "translation_key": "map", "entity_category": "diagnostic"})


def compose(fixture: dict, now: datetime, stress: dict | None = None, hacs: dict | None = None) -> dict:
    """Fixture plus the made-up devices, in the order async_setup_entry always used."""
    from . import (aquarium, befeuchter, frigate, fussball, haustier, halten, hubs, kaffee, klingel, live, maeher,
                   waesche)
    if stress:
        merge(fixture, stress)
    # Demo house (dev/demo/demo_fixture.py sets "_demo"): without the German test devices (washers A/B with
    # cellar/attic, test tanks A/B, lamps behind hubs) - those belong to the tests only.
    demo = bool(fixture.get("_demo"))
    # Two neutral washers (WashData-like and Home-Connect-like), see waesche.py.
    if not demo:
        merge(fixture, waesche.extra(now), "Waschmaschinen A/B")
    # A made-up team tracker sensor (football tile), see fussball.py.
    merge(fixture, fussball.extra(now), "Team-Tracker-Sensor")
    # Two made-up aquariums (HeliaLux- and Fluval/Chihiros-like lamp, dosing pump), see aquarium.py.
    if not demo:
        merge(fixture, aquarium.extra(now), "Testbecken A/B")
    # A made-up Gardena-like mower (community card), see maeher.py.
    merge(fixture, maeher.extra(now), "Testmäher")
    # A made-up Frigate camera with detections (community card), see frigate.py.
    merge(fixture, frigate.extra(now), "Frigate-Testhof")
    # A made-up Reolink doorbell with presses in the history (community card), see klingel.py.
    merge(fixture, klingel.extra(now), "Testklingel")
    # Three made-up coffee machines (Home Connect-, De'Longhi-BT-like and power curve, community card), see kaffee.py.
    merge(fixture, kaffee.extra(now), "Testbarista/Morgenbohne/Bohnenwerk")
    # A made-up pet with a Tractive-like tracker (community card #25), see haustier.py.
    merge(fixture, haustier.extra(now), "Testhund")
    # A made-up humidifier with modes, water tank and humidity sensor, see befeuchter.py.
    merge(fixture, befeuchter.extra(now), "Testbefeuchter")
    if not demo:
        # One test device per tile type for the hold menu (light, climate, printer, alarm ...), see halten.py.
        merge(fixture, halten.extra(now), "Halten-Testgeräte")
        # Dishwasher/dryer for live activities + service casora_mock.live_lauf, see live.py.
        merge(fixture, live.extra(now), "Live-Testgeräte")
        # Lamps behind a Hue-like bridge and a Zigbee coordinator, a two-channel dimmer, see hubs.py.
        merge(fixture, hubs.extra(now), "Hub-Lampen Garage/Garten")
        hubs.join_house_group(fixture)
    vacuum_map(fixture)
    # Only on request: HACS-like update entity for Casora (hacs_casora.py).
    if hacs:
        from .hacs_casora import extra as hacs_extra
        merge(fixture, hacs_extra(hacs), "HACS-Update für Casora")
    return fixture


def _slug(s: str) -> str:
    s = str(s).lower()
    for a, b in (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def snapshot(fixture: dict, skip: list[str] | tuple = ()) -> dict:
    """The composed house as the frontend sees it (hass.states/entities/devices/areas)."""
    areas = {}
    for name in fixture["areas"]:
        if name:
            areas[_slug(name)] = {"area_id": _slug(name), "name": name}
    area_id = {a["name"]: aid for aid, a in areas.items()}
    devices = {}
    for d in fixture["devices"]:
        did = "dev_" + str(d["key"])
        devices[did] = {"id": did, "name": d.get("name") or d["key"], "name_by_user": None,
                        "area_id": area_id.get(d.get("area")), "manufacturer": d.get("manufacturer"),
                        "model": d.get("model"), "via_device_id": None, "entry_type": None, "disabled_by": None}
    for d in fixture["devices"]:
        if d.get("via") and "dev_" + str(d["via"]) in devices:
            devices["dev_" + str(d["key"])]["via_device_id"] = "dev_" + str(d["via"])
    states, entities = {}, {}
    for e in fixture["entities"]:
        eid = e["entity_id"]
        domain = eid.split(".")[0]
        if eid in skip or domain in REAL_DOMAINS:
            continue
        did = "dev_" + str(e.get("device")) if e.get("device") else None
        entities[eid] = {"entity_id": eid, "platform": "casora_mock", "device_id": did if did in devices else None,
                         "area_id": area_id.get(e.get("area")), "name": e.get("name"), "icon": e.get("icon"),
                         "translation_key": e.get("translation_key"), "hidden": False,
                         "entity_category": e.get("entity_category") or DEFAULT_CATEGORY.get(domain)}
        states[eid] = {"entity_id": eid, "state": e["state"], "attributes": dict(e.get("attributes") or {})}
    return {"states": states, "entities": entities, "devices": devices, "areas": areas}


def main(argv: list[str]) -> int:
    f = HERE / "fixture.json"
    private = f.exists() and "--public" not in argv
    fixture = json.loads(f.read_text(encoding="utf-8")) if private else {"areas": [], "devices": [], "entities": []}
    skip = (HERE / "skip.txt").read_text(encoding="utf-8").split() if private and (HERE / "skip.txt").exists() else []
    compose(fixture, datetime.now(timezone.utc))
    snap = snapshot(fixture, skip)
    # Whether the private fixture was part of it (in the gate always; a fresh clone has only the made-up devices).
    snap["_fixture"] = private
    json.dump(snap, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    # Run as a script: load this folder as a package (relative imports of the modules) without its
    # __init__.py, which needs Home Assistant.
    import importlib
    import types
    logging.disable(logging.WARNING)
    pkg = types.ModuleType("casora_mock_haus")
    pkg.__path__ = [str(HERE)]
    sys.modules["casora_mock_haus"] = pkg
    sys.exit(importlib.import_module("casora_mock_haus.haus").main(sys.argv[1:]))
