"""Device finder for live activities (live_finder.py) without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/live_finder_test.py

1) Detection by platform + translation_key (invented devices): WashData washer/dryer/dishwasher (icon),
   Home Connect washer (program key), Home Connect WS dishwasher (dishcare), Miele washer and dishwasher,
   robot vacuum (vacuum domain), Bambu printer (print_status); oven and smart plug are no live devices.
2) Parity with the dashboard finder: the SOURCES of scripts/local/00-finder.js (read via node) must match
   live_finder.SOURCES in order, platforms, need/any and fields.
3) Same roles: the laundry/dishwasher devices of 1) through the JS classify() give the same kind.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import live_finder as lf  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


S: dict[str, SimpleNamespace] = {}


def st(eid, state="x", **attrs):
    S[eid] = SimpleNamespace(entity_id=eid, state=state, attributes=attrs)
    return eid


def E(eid, key, platform="casora_mock", icon=None):
    st(eid, "ready")
    return lf.Ent(eid, key, platform, None, icon)


# Laundry/dishwasher devices as they are now, for the role comparison with the JS finder (part 3).
ROLE_CASES: list[dict] = []


def snap(dev, ents, model=""):
    f = lf.classify(dev, ents, S.get, model)
    ROLE_CASES.append({
        "dev": dev, "model": model, "kind": f.kind if f else None,
        "entities": {e.entity_id: {"entity_id": e.entity_id, "device_id": dev, "translation_key": e.key,
                                   "platform": e.platform, "icon": e.icon} for e in ents},
        "states": {e.entity_id: {"state": S[e.entity_id].state, "attributes": dict(S[e.entity_id].attributes)}
                   for e in ents if e.entity_id in S},
    })


# ── 1) Detection ─────────────────────────────────────────────────────────
wd = [E("sensor.w1_state", "washer_state", "ha_washdata", "mdi:washing-machine"), E("sensor.w1_prog", "washer_program", "ha_washdata"),
      E("sensor.w1_pct", "cycle_progress", "ha_washdata"), E("sensor.w1_rem", "time_remaining", "ha_washdata"),
      E("binary_sensor.w1_run", "running", "ha_washdata")]
f = lf.classify("d1", wd, S.get)
check("WashData washer", f and f.kind == "washer" and f.source == "washdata" and f.grade == lf.GRADE_GOOD, f)
snap("d1", wd)
check("WashData fields", f and f.fields["state"] == "sensor.w1_state" and f.fields["progress"] == "sensor.w1_pct"
      and f.fields["running"] == "binary_sensor.w1_run", f and f.fields)
dr = [E("sensor.t1_state", "washer_state", "ha_washdata", "mdi:tumble-dryer"), E("sensor.t1_pct", "cycle_progress", "ha_washdata")]
check("WashData dryer by icon", lf.classify("d2", dr, S.get).kind == "dryer")
snap("d2", dr)
# Icon in the state (registry without icon)
st("sensor.g1_state", "running", icon="mdi:dishwasher")
dw = [lf.Ent("sensor.g1_state", "washer_state", "ha_washdata"), E("sensor.g1_pct", "cycle_progress", "ha_washdata")]
check("WashData dishwasher by icon", lf.classify("d3", dw, S.get).kind == "dishwasher")
snap("d3", dw)
pump = [E("sensor.p1_state", "washer_state", "ha_washdata", "mdi:water-pump"), E("sensor.p1_pct", "cycle_progress", "ha_washdata")]
check("WashData pump is no live device", lf.classify("d4", pump, S.get) is None)
snap("d4", pump)

# Official Home Connect: role from the program options
hc = [E("sensor.hc_state", "operation_state", "home_connect"), E("sensor.hc_pct", "program_progress", "home_connect"),
      E("sensor.hc_end", "program_finish_time", "home_connect"), E("select.hc_prog", "active_program", "home_connect")]
st("select.hc_prog", "laundry_care_washer_program_cotton", options=["laundry_care_washer_program_cotton", "laundry_care_washer_program_mix"])
f = lf.classify("d5", hc, S.get)
check("Home Connect washer", f and f.kind == "washer" and f.source == "home_connect" and f.fields["program"] == "select.hc_prog", f)
snap("d5", hc)
st("select.hc_prog", "dishcare_dishwasher_program_eco50", options=["dishcare_dishwasher_program_eco50"])
check("Home Connect dishwasher", lf.classify("d5", hc, S.get).kind == "dishwasher")
snap("d5", hc)
st("select.hc_prog", "laundry_care_dryer_program_cotton", options=["laundry_care_dryer_program_cotton"])
check("Home Connect dryer", lf.classify("d5", hc, S.get).kind == "dryer")
snap("d5", hc)
oven = [E("sensor.ov_state", "operation_state", "home_connect"), E("sensor.ov_pct", "program_progress", "home_connect"),
        E("select.ov_prog", "selected_program", "home_connect")]
st("select.ov_prog", "cooking_oven_program_heating_mode_hot_air", options=["cooking_oven_program_heating_mode_hot_air"])
check("Home Connect oven is no live device", lf.classify("d6", oven, S.get) is None)
snap("d6", oven)

# Home Connect WS (test house: platform casora_mock, keys only)
ws = [E("sensor.ws_state", "sensor_operation_state"), E("sensor.ws_prog", "sensor_active_program"),
      E("sensor.ws_phase", "sensor_program_phase"), E("sensor.ws_pct", "sensor_program_progress"),
      E("sensor.ws_rem", "sensor_remaining_program_time"), E("sensor.ws_salt", "sensor_salt"), E("sensor.ws_start", "sensor_start_in")]
st("sensor.ws_prog", "dishcare_dishwasher_program_eco50", options=["dishcare_dishwasher_program_eco50"])
f = lf.classify("d7", ws, S.get)
check("Home Connect WS dishwasher by keys", f and f.kind == "dishwasher" and f.source == "home_connect_alt" and f.how == "keys", f)
snap("d7", ws)
check("Home Connect WS fields incl. start delay", f and f.fields["phase"] == "sensor.ws_phase" and f.fields["start_in"] == "sensor.ws_start", f and f.fields)
for key in ("sensor_laundry_process_phase", "sensor_dryer_process_phase"):
    wsw = [E("sensor.wsw_state", "sensor_operation_state"), E("sensor.wsw_prog", "sensor_active_program"),
           E("sensor.wsw_phase", key), E("sensor.wsw_pct", "sensor_program_progress")]
    st("sensor.wsw_prog", "laundrycare_washer_program_cotton")
    f = lf.classify("d7b", wsw, S.get)
    check("Home Connect WS phase via " + key, f and f.fields.get("phase") == "sensor.wsw_phase", f and f.fields)

miele = [E("sensor.m_state", "status", "miele"), E("sensor.m_spin", "spin_speed", "miele"), E("sensor.m_rem", "remaining_time", "miele")]
f = lf.classify("d8", miele, S.get)
check("Miele washer (untested)", f and f.kind == "washer" and f.grade == lf.GRADE_UNTESTED, f)
snap("d8", miele)
mdw = [E("sensor.md_state", "status", "miele"), E("sensor.md_salt", "salt_level", "miele"), E("sensor.md_rem", "remaining_time", "miele")]
f = lf.classify("d8b", mdw, S.get)
check("Miele dishwasher by salt level", f and f.kind == "dishwasher" and f.fields["remaining"] == "sensor.md_rem", f)
snap("d8b", mdw)
moven = [E("sensor.mo_state", "status", "miele"), E("sensor.mo_temp", "core_temperature", "miele")]
check("Miele oven is no live device", lf.classify("d8c", moven, S.get) is None)
snap("d8c", moven)

vac = [E("vacuum.v1", None, "roborock"), E("sensor.v1_status", "status", "roborock"), E("sensor.v1_room", "current_room", "roborock"),
       E("sensor.v1_pct", "clean_percent", "roborock"), E("sensor.v1_rem", "remaining_time", "roborock")]
f = lf.classify("d9", vac, S.get)
check("Robot vacuum by vacuum domain", f and f.kind == "vacuum" and f.fields["state"] == "vacuum.v1" and f.fields["room"] == "sensor.v1_room", f)
check("Robot vacuum: status/remaining_time not read as laundry", f and f.source == "vacuum")
bare = [E("vacuum.v2", None, "dreame")]
check("Robot vacuum without neighbours", lf.classify("d10", bare, S.get).kind == "vacuum")

pr = [E("sensor.pr_state", "print_status", "bambu_lab"), E("sensor.pr_stage", "stage", "bambu_lab"),
      E("sensor.pr_pct", "print_progress", "bambu_lab"), E("sensor.pr_task", "subtask_name", "bambu_lab")]
f = lf.classify("d11", pr, S.get)
check("Bambu printer", f and f.kind == "printer" and f.fields["stage"] == "sensor.pr_stage" and f.grade == lf.GRADE_UNTESTED, f)

plug = [E("switch.plug", None, "shelly"), E("sensor.plug_power", None, "shelly")]
check("Smart plug is no live device", lf.classify("d12", plug, S.get) is None)
check("Device without states is nothing", lf.classify("d13", [lf.Ent("sensor.gone", "washer_state", "ha_washdata")], S.get) is None)

# ── 2) Parity with the JS finder ────────────────────────────────────────
JS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const win = {};
try { new Function('window', 'document', src)(win, { createElement: () => ({ style: {} }) }); } catch (e) { /* other modules of the bundle */ }
const LF = win.casoraLaundryFind;
if (!LF) { console.error('casoraLaundryFind missing'); process.exit(2); }
console.log(JSON.stringify(LF.sources.map((s) => ({ id: s.id, platforms: s.platforms, need: s.need, any: s.any,
  fields: Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, { keys: v.keys, domain: v.domain }])) }))));
"""
node = os.environ.get("NODE", "node")
try:
    out = subprocess.run([node, "-e", JS, os.path.join(ROOT, "custom_components/casora/scripts/local/00-finder.js")],
                         capture_output=True, text=True, check=True).stdout
    js_sources = json.loads(out)
except Exception as err:  # noqa: BLE001
    js_sources = None
    check("JS SOURCES readable", False, err)
if js_sources is not None:
    py_sources = [{"id": s["id"], "platforms": s["platforms"], "need": s["need"], "any": s["any"], "fields": s["fields"]} for s in lf.SOURCES]
    check("same sources in the same order", [s["id"] for s in js_sources] == [s["id"] for s in py_sources],
          ([s["id"] for s in js_sources], [s["id"] for s in py_sources]))
    for js, py in zip(js_sources, py_sources):
        for key in ("platforms", "need", "any", "fields"):
            check(f"{js['id']}: {key} as in the dashboard", js[key] == py[key], (js[key], py[key]))

# ── 3) Same roles in the JS finder ──────────────────────────────────────
JS_ROLES = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const win = {};
try { new Function('window', 'document', src)(win, { createElement: () => ({ style: {} }) }); } catch (e) { /* other modules */ }
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(cases.map((c) => {
  const hass = { entities: c.entities, states: c.states, devices: { [c.dev]: { model: c.model } } };
  const r = win.casoraLaundryFind.classify(hass, c.dev, ['washer', 'dryer', 'dishwasher']);
  return r ? r.role : null;
})));
"""
try:
    out = subprocess.run([node, "-e", JS_ROLES, os.path.join(ROOT, "custom_components/casora/scripts/local/00-finder.js")],
                         input=json.dumps(ROLE_CASES), capture_output=True, text=True, check=True).stdout
    js_roles = json.loads(out)
except Exception as err:  # noqa: BLE001
    js_roles = None
    check("JS roles readable", False, err)
if js_roles is not None:
    for c, role in zip(ROLE_CASES, js_roles):
        check(f"{c['dev']}: JS role as in Python ({c['kind']})", role == c["kind"], (role, c["kind"]))

print("\nALL OK" if not fails else f"\n{len(fails)} FAILED")
sys.exit(1 if fails else 0)
