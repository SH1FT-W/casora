"""casora.setup_overview without a running HA (issue #131, step 1).

  uv run --python 3.14 --with homeassistant python dev/unit/setup_overview_test.py

1) Every tile type id setup_overview can suggest exists in the Studio's tile types (TILE_TYPES in
   casora-panel.js, CASORA_TILE_TYPES in casora-panel-types.js), is not hidden and no Community card
   (those are switched on per install).
2) suggest_tile on invented devices: domain order as in the Studio, air purifier by name, washer/dishwasher/
   vacuum/printer through live_finder, oven and fridge, a vacuum map camera is no camera tile.
3) "On a tile": entity and device ids from a dashboard's views, never from its button_card_templates.
4) Suggested area for a device without one: the area of its entities, else an area named in its name.
5) Registered as an admin service with SupportsResponse.ONLY, removed on unload, in services.yaml and in all
   service translations.
6) The setup assistant's hint (no ai_task) links to the guide section on MCP.
The whole answer against real registries: dev/pytest/test_setup_overview.py.
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

from custom_components.casora import setup_overview as so  # noqa: E402
from custom_components.casora.live_finder import Ent  # noqa: E402

PKG = os.path.join(ROOT, "custom_components", "casora")
fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({info})"))
    if not cond:
        fails.append(name)


# 1) Tile type ids against the Studio.
def studio_types() -> dict[str, str]:
    """id → source text of its entry, from both type lists."""
    out: dict[str, str] = {}
    for fname, start in (("casora-panel.js", "const TILE_TYPES = ["), ("casora-panel-types.js", "window.CASORA_TILE_TYPES = [")):
        src = open(os.path.join(PKG, "panel", fname), encoding="utf-8").read()
        i = src.index(start)
        block = src[i:src.index("\n];", i)]
        parts = re.split(r"\n  (?=\{ id: \")", block)
        for p in parts:
            m = re.match(r'\{ id: "([^"]+)"', p)
            if m:
                out[m.group(1)] = p
    return out


types = studio_types()
check("Studio type lists read", len(types) > 30 and "light" in types and "casora_washer" in types, len(types))
for tid in sorted(so.TILE_IDS):
    entry = types.get(tid)
    check(f"tile type {tid} exists in the Studio", entry is not None)
    if entry is not None:
        check(f"tile type {tid} is offered (not hidden, no Community card)",
              "hidden: true" not in entry and "community:" not in entry)

# 2) suggest_tile on invented devices.
S: dict[str, SimpleNamespace] = {}


def E(eid, key=None, platform="test", category=None, **attrs):
    S[eid] = SimpleNamespace(entity_id=eid, state="on", attributes=attrs)
    return Ent(eid, key, platform, category)


def sug(name, ents, model=""):
    return so.suggest_tile(name, ents, S.get, model)


check("climate before light", sug("Heizung", [E("light.heiz_led"), E("climate.heiz")]) == ("thermostat", "climate.heiz"))
check("plain lamp", sug("Stehlampe", [E("light.steh"), E("sensor.steh_power")]) == ("light", "light.steh"))
check("diagnostic entities do not count", sug("Hub", [E("light.hub_led", category="diagnostic")]) is None)
check("only sensors: no tile", sug("Thermometer", [E("sensor.t_temp"), E("sensor.t_hum")]) is None)
check("air purifier by name", sug("Luftreiniger Büro", [E("fan.lr"), E("sensor.lr_pm25")]) == ("air_purifier", "fan.lr"))
check("ceiling fan stays a fan", sug("Deckenventilator", [E("fan.dv"), E("light.dv")]) == ("fan", "fan.dv"))
check("robot vacuum (map camera is no camera tile)",
      sug("Robby", [E("camera.robby_map"), E("vacuum.robby"), E("sensor.robby_status", "status")]) == ("vacuum", "vacuum.robby"))
check("map camera alone is no camera tile", sug("Karte", [E("camera.erdgeschoss_karte")]) is None)
check("camera", sug("Garten", [E("camera.garten")]) == ("casora_camera", "camera.garten"))
check("3D printer", sug("Drucker", [E("sensor.p_status", "print_status"), E("camera.p_cam"), E("light.p_light", "chamber_light")])
      == ("casora_3d_printer", "sensor.p_status"))
washer = [E("sensor.wm_state", "washer_state", "ha_washdata"), E("sensor.wm_power")]
check("washer through live_finder (WashData)", sug("Waschmaschine", washer) == ("casora_washer", "sensor.wm_state"), sug("Waschmaschine", washer))
# Tumble: the tile follows Tumble's appliance type (device model), not the word "tumble" in the name.
tum = [E("sensor.tumble_status", "status", "tumble"), E("button.tumble_unload", "unload", "tumble"),
       E("binary_sensor.tumble_run", "running", "tumble"), E("sensor.tumble_count", "cycle_count", "tumble")]
check("Tumble washer: washer tile", sug("Tumble Trockner", tum, "washer ") == ("casora_washer", "sensor.tumble_status"),
      sug("Tumble Trockner", tum, "washer "))
check("Tumble dryer: dryer tile", sug("Tumble", tum, "dryer ") == ("casora_dryer", "sensor.tumble_status"))
dish = [E("sensor.gs_op", "operation_state", "home_connect"), E("select.gs_prog", "selected_program", "home_connect",
        options=["dishcare_dishwasher_program_eco_50"]), E("sensor.gs_rem", "program_finish_time", "home_connect")]
check("dishwasher (Home Connect)", sug("Geschirrspüler", dish) == ("casora_dishwasher", "sensor.gs_op"), sug("Geschirrspüler", dish))
oven = [E("sensor.ofen_op", "operation_state", "home_connect"), E("sensor.ofen_cav", "oven_current_cavity_temperature", "home_connect")]
check("oven before dishwasher (same operation_state)", sug("Backofen", oven) == ("casora_oven", "sensor.ofen_op"), sug("Backofen", oven))
fridge = [E("sensor.kue_top", "top_zone", "liebherr"), E("switch.kue_super", "super_cool", "liebherr")]
check("fridge (Liebherr)", sug("Kühlschrank", fridge) == ("casora_fridge", "sensor.kue_top"), sug("Kühlschrank", fridge))
fryer = [E("sensor.af_state", "washer_state", "ha_washdata"), E("sensor.af_power")]
check("WashData device type 'other' (air fryer) is no washer",
      so.suggest_tile("Heißluftfritteuse", fryer, S.get, "", "other") is None)
check("finders see entities with a category, as in the Studio",
      sug("Waschmaschine 2", [E("sensor.wm2_state", "washer_state", "ha_washdata", category="diagnostic")])
      == ("casora_washer", "sensor.wm2_state"))
check("finders see hidden entities; the domain step does not",
      so.suggest_tile("Waschmaschine 3", [E("sensor.wm3_state", "washer_state", "ha_washdata")], S.get,
                      hidden=frozenset({"sensor.wm3_state"})) == ("casora_washer", "sensor.wm3_state")
      and so.suggest_tile("Lampe", [E("light.versteckt")], S.get, hidden=frozenset({"light.versteckt"})) is None)

# 3) References in a dashboard.
dev_id = "0123456789abcdef0123456789abcdef"
cfg = {"button_card_templates": {"casora_x": {"variables": {"e": "light.only_in_template"}}},
       "views": [{"cards": [{"template": "casora_room", "variables": {"light_1": "light.kueche", "ids": f"{dev_id}"}},
                            {"entity": "climate.bad", "custom_fields": {"x": "[[[ return states['sensor.aussen'].state ]]]"}}]}]}
refs = so.collect_refs(cfg)
check("entity in variables", "light.kueche" in refs)
check("entity of a card", "climate.bad" in refs)
check("entity inside card JS", "sensor.aussen" in refs)
check("device id", dev_id in refs)
check("templates are not tiles", "light.only_in_template" not in refs)
check("no views: nothing", so.collect_refs({}) == set() and so.collect_refs(None) == set())

# 4) Suggested area.
areas = {"kueche": "Küche", "bad": "Bad", "bad_oben": "Bad oben"}
check("area of its entities wins", so._suggest_area("Lampe Bad", ["kueche", "kueche", "bad"], areas) == "kueche")
check("area named in the device name (umlauts)", so._suggest_area("Kueche Deckenlicht", [], areas) == "kueche")
check("longest area name", so._suggest_area("Spiegel Bad oben", [], areas) == "bad_oben")
check("whole words only", so._suggest_area("Badezimmerwaage", [], areas) is None)
check("nothing found", so._suggest_area("Steckdose 3", [], areas) is None)

# 5) Registration, unload, services.yaml, translations.
got: list = []
real = so.async_register_admin_service
so.async_register_admin_service = lambda hass, dom, name, func, schema, **kw: got.append(
    (dom, name, kw.get("supports_response"), schema))
try:
    asyncio.run(so.async_setup_setup_overview(SimpleNamespace()))
finally:
    so.async_register_admin_service = real
check("admin service casora.setup_overview, response only",
      [g[:3] for g in got] == [("casora", "setup_overview", SupportsResponse.ONLY)], got)
check("extra call data is ignored (MCP clients may send a target)", bool(got) and got[0][3]({"entity_id": "x"}) == {"entity_id": "x"}, got)
init = open(os.path.join(PKG, "__init__.py"), encoding="utf-8").read()
check("set up at start", "await async_setup_setup_overview(hass)" in init)
check("removed on unload", re.search(r'for name in \([^)]*"setup_overview"', init) is not None)
yaml_src = open(os.path.join(PKG, "services.yaml"), encoding="utf-8").read()
check("in services.yaml", re.search(r"^setup_overview:", yaml_src, re.M) is not None)
for fn in sorted(os.listdir(os.path.join(PKG, "translations"))):
    if fn.endswith(".json"):
        svc = json.load(open(os.path.join(PKG, "translations", fn), encoding="utf-8")).get("services", {})
        t = svc.get("setup_overview") or {}
        check(f"translation {fn}", bool(t.get("name")) and bool(t.get("description")))

# 6) The setup assistant's hint without an AI task links to the guide section that exists.
basis = open(os.path.join(PKG, "panel", "casora-panel-basis.js"), encoding="utf-8").read()
guide = open(os.path.join(ROOT, "docs", "guide.md"), encoding="utf-8").read()
# Also with the AI option "Your own assistant (MCP)" (casora/ki/models → mcp): that wizard step cannot wait for it.
check("wizard hint without any ai_task or in MCP mode",
      "if (noAiTask || mcpMode) {" in basis and "mcpMode = !!(m && m.mcp)" in basis and "casora.setup_overview" in basis)
check("wizard link points to the guide section",
      "docs/guide.md#set-up-with-your-own-assistant-over-mcp" in basis
      and "\n## Set up with your own assistant over MCP\n" in guide)

print("alle ok" if not fails else f"{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
