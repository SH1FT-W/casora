"""casora.setup_plan without a running HA (issue #131, step 2).

  uv run --python 3.14 --with homeassistant python dev/unit/setup_plan_test.py

1) Every tile type an assistant may name exists in the Studio, is offered (not hidden, no Community card) and its
   main entity domain is one of the Studio type's domains.
2) make_plan on invented devices: suggestion without a tile, a named tile type, washer/dryer swap, tile name,
   and each skip reason (unknown area/device/tile, duplicate, already on a tile, no main entity, does not fit).
3) The service answer: dashboard default and errors, the valid part becomes the pending plan, an empty plan
   clears it, no dashboard is written.
4) Registered as an admin service with SupportsResponse.ONLY plus two admin websocket commands, removed on
   unload, in services.yaml and in all service translations (with the two error messages).
The whole answer against real registries: dev/pytest/test_setup_plan.py.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.core import SupportsResponse  # noqa: E402
from homeassistant.exceptions import ServiceValidationError  # noqa: E402

from custom_components.casora import setup_plan as sp  # noqa: E402
from custom_components.casora.live_finder import Ent  # noqa: E402

PKG = os.path.join(ROOT, "custom_components", "casora")
fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({info})"))
    if not cond:
        fails.append(name)


# 1) Tile types against the Studio.
def studio_types() -> dict[str, str]:
    out: dict[str, str] = {}
    for fname, start in (("casora-panel.js", "const TILE_TYPES = ["), ("casora-panel-types.js", "window.CASORA_TILE_TYPES = [")):
        src = open(os.path.join(PKG, "panel", fname), encoding="utf-8").read()
        i = src.index(start)
        for p in re.split(r"\n  (?=\{ id: \")", src[i:src.index("\n];", i)]):
            m = re.match(r'\{ id: "([^"]+)"', p)
            if m:
                out[m.group(1)] = p
    return out


types = studio_types()
check("Studio type lists read", len(types) > 30, len(types))
for tid in sorted(sp.PLAN_TILES):
    entry = types.get(tid)
    check(f"tile type {tid} exists in the Studio", entry is not None)
    if entry is None:
        continue
    check(f"tile type {tid} is offered", "hidden: true" not in entry and "community:" not in entry
          and "onlyIf" not in entry)  # onlyIf types can be absent from a Studio: a plan row would silently drop
    if tid in sp.TILE_DOMAIN:
        doms = re.search(r"domains: \[([^\]]*)\]", entry)
        check(f"tile type {tid}: domain {sp.TILE_DOMAIN[tid]} fits the Studio",
              doms is not None and f'"{sp.TILE_DOMAIN[tid]}"' in doms.group(1), doms and doms.group(1))

# 2) make_plan.
E = lambda eid, key=None: Ent(eid, key, "test", None)  # noqa: E731
devs = {
    "lamp": sp.Dev("Deckenlampe", [E("light.decke")], ("light", "light.decke")),
    "thermo": sp.Dev("Heizkörper", [E("climate.hk"), E("light.hk_led")], ("thermostat", "climate.hk")),
    "wm": sp.Dev("Waschmaschine", [E("sensor.wm_power")], ("casora_washer", "sensor.wm_state")),
    "plug": sp.Dev("Steckdose", [E("switch.plug")], None),
    "robby": sp.Dev("Robby", [E("camera.robby_map"), E("vacuum.robby")], ("vacuum", "vacuum.robby")),
    "on": sp.Dev("Ganglicht", [E("light.gang")], ("light", "light.gang")),
    "meter": sp.Dev("Zähler", [E("sensor.zaehler")], None),
    "svc": sp.Dev("Wetterdienst", [E("light.wetter")], None, usable=False),
    "two": sp.Dev("Spot", [E("light.spot")], ("light", "light.spot")),
}
areas = {"kueche": "Küche", "bad": "Bad"}
used = {"light.gang"}
rooms_in = [
    {"area_id": "kueche", "devices": [
        {"device_id": "lamp", "name": "Licht Küche"},
        {"device_id": "thermo", "tile": "light"},
        {"device_id": "wm", "tile": "casora_dryer"},
        {"device_id": "plug", "tile": "casora_switch"},
        {"device_id": "robby", "tile": "casora_camera"},
        {"device_id": "on"},
        {"device_id": "meter"},
        {"device_id": "svc"},
        {"device_id": "ghost"},
        {"device_id": "lamp"},
        {"device_id": "two", "tile": "casora_coffee"},
    ]},
    {"area_id": "bad", "devices": [{"device_id": "two", "tile": "light", "name": "  "}]},
    {"area_id": "nirgends", "devices": [{"device_id": "plug"}]},
    {"area_id": "bad", "devices": []},
]
rooms, skipped = sp.make_plan(rooms_in, areas, devs, used)
tiles = {t["device_id"]: t for r in rooms for t in r["tiles"]}
why = {(s["device_id"], s["area_id"]): s["reason"] for s in skipped}
check("rooms with tiles only, in plan order", [r["area_id"] for r in rooms] == ["kueche", "bad"], rooms)
check("tile name from the plan", tiles["lamp"] == {"device_id": "lamp", "device": "Deckenlampe", "main_entity": "light.decke",
                                                    "tile": "light", "name": "Licht Küche"}, tiles.get("lamp"))
check("named tile type picks its domain's entity", (tiles["thermo"]["tile"], tiles["thermo"]["main_entity"]) == ("light", "light.hk_led"))
check("default name is the device name", tiles["thermo"]["name"] == "Heizkörper")
check("washer and dryer share the main entity", (tiles["wm"]["tile"], tiles["wm"]["main_entity"]) == ("casora_dryer", "sensor.wm_state"))
check("a plug as a switch tile (no suggestion needed)", (tiles["plug"]["tile"], tiles["plug"]["main_entity"]) == ("casora_switch", "switch.plug"))
check("a map camera is no camera tile", why.get(("robby", "kueche")) == "tile_does_not_fit", why)
check("already on a tile of the dashboard", why.get(("on", "kueche")) == "already_on_tile", why)
check("nothing to put on a tile", why.get(("meter", "kueche")) == "no_main_entity", why)
check("service device", why.get(("svc", "kueche")) == "no_main_entity", why)
check("unknown device", why.get(("ghost", "kueche")) == "unknown_device", why)
check("same device twice", sum(1 for s in skipped if s["device_id"] == "lamp" and s["reason"] == "duplicate") == 1, skipped)
check("unknown or Community tile type", why.get(("two", "kueche")) == "unknown_tile", why)
check("a skipped entry does not block a later one; blank name → device name",
      ("two", "bad") not in why and tiles["two"]["name"] == "Spot" and tiles["two"]["main_entity"] == "light.spot", tiles.get("two"))
check("unknown area", why.get(("plug", "nirgends")) == "unknown_area", why)
check("every skip has a detail text", all(s["detail"] for s in skipped))
check("main entity on a tile already", sp.make_plan([{"area_id": "bad", "devices": [{"device_id": "lamp"}]}], areas, devs,
                                                    {"light.decke"})[1][0]["reason"] == "already_on_tile")
two_same = sp.make_plan([{"area_id": "bad", "devices": [{"device_id": "thermo", "tile": "light"}]},
                         {"area_id": "kueche", "devices": [{"device_id": "lamp"}]}], areas, devs, set())[0]
check("rooms keep their area name", [r["area"] for r in two_same] == ["Bad", "Küche"], two_same)
merged = sp.make_plan([{"area_id": "bad", "devices": [{"device_id": "lamp"}]},
                       {"area_id": "bad", "devices": [{"device_id": "thermo"}]}], areas, devs, set())[0]
check("the same area twice is one room", [(r["area_id"], len(r["tiles"])) for r in merged] == [("bad", 2)], merged)


# 3) The service answer (registries and dashboards faked).
class FakeStore:
    data: dict | None = None
    saves = 0

    def __init__(self, hass, version, key):
        assert key == "casora.setup_plan"

    async def async_load(self):
        return FakeStore.data

    async def async_save(self, data):
        FakeStore.data = json.loads(json.dumps(data))
        FakeStore.saves += 1


sp.Store = FakeStore
refs = {"casora-home": {"light.gang"}, "zweites": set()}


async def fake_refs(hass):
    return refs


async def fake_devs(hass):
    return devs


sp.so.async_casora_refs = fake_refs
sp._devices = fake_devs
import homeassistant.helpers.area_registry as ar_mod  # noqa: E402

ar_mod.async_get = lambda hass: SimpleNamespace(async_list_areas=lambda: [SimpleNamespace(id=k, name=v) for k, v in areas.items()])
hass = SimpleNamespace(data={})


def run(data):
    return asyncio.run(sp.async_setup_plan(hass, data))


res = run({"rooms": [{"area_id": "kueche", "devices": [{"device_id": "lamp"}, {"device_id": "ghost"}]}]})
check("default dashboard: the first Casora one", res["dashboard"] == "casora-home", res)
check("answer: plan id, tiles, skipped, next", bool(res["plan_id"]) and res["tiles"] == 1 and len(res["skipped"]) == 1
      and "Studio" in res["next"], res)
pend = FakeStore.data["plan"]
check("pending plan stored", pend["plan_id"] == res["plan_id"] and pend["dashboard"] == "casora-home"
      and pend["rooms"] == res["rooms"] and "skipped" not in pend, pend)
res2 = run({"dashboard": "zweites", "rooms": [{"area_id": "kueche", "devices": [{"device_id": "on"}]}]})
check("other dashboard: its own tiles count", res2["dashboard"] == "zweites" and res2["tiles"] == 1, res2)
res3 = run({"rooms": [{"area_id": "kueche", "devices": [{"device_id": "meter"}]}]})
check("nothing valid: no plan id, nothing pending", res3["plan_id"] is None and FakeStore.data == {"plan": None}, res3)
for bad, key in (({"dashboard": "fremd", "rooms": []}, "setup_plan_not_casora"),):
    try:
        run(bad)
        check("unknown dashboard raises", False)
    except ServiceValidationError as e:
        check("unknown dashboard raises", e.translation_key == key and "casora-home" in e.translation_placeholders["dashboards"])
refs = {}
try:
    run({"rooms": []})
    check("no Casora dashboard raises", False)
except ServiceValidationError as e:
    check("no Casora dashboard raises", e.translation_key == "setup_plan_no_dashboard")
check("schema: name, tile optional; extra data ignored",
      sp.SCHEMA({"entity_id": "x", "rooms": [{"area_id": "a", "devices": [{"device_id": "d"}]}]})["rooms"][0]["devices"]
      == [{"device_id": "d"}])
try:
    sp.SCHEMA({"rooms": [{"area_id": "a", "devices": [{"name": "x"}]}]})
    check("schema: device_id required", False)
except Exception:  # noqa: BLE001
    check("schema: device_id required", True)
src = open(os.path.join(PKG, "setup_plan.py"), encoding="utf-8").read()
check("writes no dashboard (no async_save on Lovelace, no lovelace/config/save)",
      "lovelace" not in src.lower().replace("lovelace_data", "") and "async_save(cfg" not in src)

# 4) Registration, websocket, unload, services.yaml, translations.
got: list = []
ws: list = []
real_reg, real_ws = sp.async_register_admin_service, sp.websocket_api.async_register_command
sp.async_register_admin_service = lambda hass, dom, name, func, schema, **kw: got.append((dom, name, kw.get("supports_response")))
sp.websocket_api.async_register_command = lambda hass, cmd: ws.append(cmd)
try:
    h = SimpleNamespace(data={})
    asyncio.run(sp.async_setup_setup_plan(h))
    asyncio.run(sp.async_setup_setup_plan(h))
finally:
    sp.async_register_admin_service, sp.websocket_api.async_register_command = real_reg, real_ws
check("admin service casora.setup_plan, response only", got[:1] == [("casora", "setup_plan", SupportsResponse.ONLY)], got)
check("two websocket commands, registered once", [c for c in ws] == [sp.ws_get, sp.ws_clear], ws)
check("websocket commands are admin only", all("require_admin" in src.split(f"def {n}")[0].rsplit("\n\n\n", 1)[-1]
                                               for n in ("ws_get", "ws_clear")))
init = open(os.path.join(PKG, "__init__.py"), encoding="utf-8").read()
check("set up at start", "await async_setup_setup_plan(hass)" in init)
check("removed on unload", re.search(r'for name in \([^)]*"setup_plan"', init) is not None)
yaml_src = open(os.path.join(PKG, "services.yaml"), encoding="utf-8").read()
check("in services.yaml with fields", re.search(r"^setup_plan:\n  fields:\n    dashboard:", yaml_src, re.M) is not None)
for fn in sorted(os.listdir(os.path.join(PKG, "translations"))):
    if fn.endswith(".json"):
        d = json.load(open(os.path.join(PKG, "translations", fn), encoding="utf-8"))
        t = d.get("services", {}).get("setup_plan") or {}
        ex = d.get("exceptions", {})
        check(f"translation {fn}", bool(t.get("name")) and bool(t.get("description"))
              and all((t.get("fields") or {}).get(f, {}).get("name") for f in ("dashboard", "rooms"))
              and "{dashboards}" in ex.get("setup_plan_not_casora", {}).get("message", "")
              and ex.get("setup_plan_no_dashboard", {}).get("message"))

print("alle ok" if not fails else f"{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
