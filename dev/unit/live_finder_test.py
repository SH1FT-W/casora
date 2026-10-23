"""Geräte-Finder für Live-Aktivitäten (live_finder.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/live_finder_test.py

1) Erkennung über Plattform + translation_key (erfundene Geräte): WashData Waschmaschine/Trockner/Geschirrspüler
   (Symbol), Home Connect Waschmaschine (Programmschlüssel), Home Connect WS Geschirrspüler (dishcare), Miele,
   Saugroboter (vacuum-Domäne), Bambu-Drucker (print_status); Backofen und Steckdose sind keine Live-Geräte.
2) Gleichstand mit dem Dashboard-Finder: die SOURCES aus scripts/local/00-finder.js (per node ausgelesen) müssen
   in Reihenfolge, Plattformen, need/any und Feldern mit live_finder.SOURCES übereinstimmen.
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


# ── 1) Erkennung ─────────────────────────────────────────────────────────
wd = [E("sensor.w1_state", "washer_state", "ha_washdata", "mdi:washing-machine"), E("sensor.w1_prog", "washer_program", "ha_washdata"),
      E("sensor.w1_pct", "cycle_progress", "ha_washdata"), E("sensor.w1_rem", "time_remaining", "ha_washdata"),
      E("binary_sensor.w1_run", "running", "ha_washdata")]
f = lf.classify("d1", wd, S.get)
check("WashData Waschmaschine", f and f.kind == "washer" and f.source == "washdata" and f.grade == lf.GRADE_GOOD, f)
check("WashData Felder", f and f.fields["state"] == "sensor.w1_state" and f.fields["progress"] == "sensor.w1_pct"
      and f.fields["running"] == "binary_sensor.w1_run", f and f.fields)
dr = [E("sensor.t1_state", "washer_state", "ha_washdata", "mdi:tumble-dryer"), E("sensor.t1_pct", "cycle_progress", "ha_washdata")]
check("WashData Trockner über Symbol", lf.classify("d2", dr, S.get).kind == "dryer")
# Symbol im Zustand (Registry ohne Symbol)
st("sensor.g1_state", "running", icon="mdi:dishwasher")
dw = [lf.Ent("sensor.g1_state", "washer_state", "ha_washdata"), E("sensor.g1_pct", "cycle_progress", "ha_washdata")]
check("WashData Geschirrspüler über Symbol", lf.classify("d3", dw, S.get).kind == "dishwasher")
pump = [E("sensor.p1_state", "washer_state", "ha_washdata", "mdi:water-pump"), E("sensor.p1_pct", "cycle_progress", "ha_washdata")]
check("WashData Pumpe ist kein Live-Gerät", lf.classify("d4", pump, S.get) is None)

# Home Connect offiziell: Rolle aus den Programm-Optionen
hc = [E("sensor.hc_state", "operation_state", "home_connect"), E("sensor.hc_pct", "program_progress", "home_connect"),
      E("sensor.hc_end", "program_finish_time", "home_connect"), E("select.hc_prog", "active_program", "home_connect")]
st("select.hc_prog", "laundry_care_washer_program_cotton", options=["laundry_care_washer_program_cotton", "laundry_care_washer_program_mix"])
f = lf.classify("d5", hc, S.get)
check("Home Connect Waschmaschine", f and f.kind == "washer" and f.source == "home_connect" and f.fields["program"] == "select.hc_prog", f)
st("select.hc_prog", "dishcare_dishwasher_program_eco50", options=["dishcare_dishwasher_program_eco50"])
check("Home Connect Geschirrspüler", lf.classify("d5", hc, S.get).kind == "dishwasher")
st("select.hc_prog", "laundry_care_dryer_program_cotton", options=["laundry_care_dryer_program_cotton"])
check("Home Connect Trockner", lf.classify("d5", hc, S.get).kind == "dryer")
oven = [E("sensor.ov_state", "operation_state", "home_connect"), E("sensor.ov_pct", "program_progress", "home_connect"),
        E("select.ov_prog", "selected_program", "home_connect")]
st("select.ov_prog", "cooking_oven_program_heating_mode_hot_air", options=["cooking_oven_program_heating_mode_hot_air"])
check("Home Connect Backofen ist kein Live-Gerät", lf.classify("d6", oven, S.get) is None)

# Home Connect WS (Testhaus: Plattform casora_mock, nur Schlüssel)
ws = [E("sensor.ws_state", "sensor_operation_state"), E("sensor.ws_prog", "sensor_active_program"),
      E("sensor.ws_phase", "sensor_program_phase"), E("sensor.ws_pct", "sensor_program_progress"),
      E("sensor.ws_rem", "sensor_remaining_program_time"), E("sensor.ws_salt", "sensor_salt"), E("sensor.ws_start", "sensor_start_in")]
st("sensor.ws_prog", "dishcare_dishwasher_program_eco50", options=["dishcare_dishwasher_program_eco50"])
f = lf.classify("d7", ws, S.get)
check("Home Connect WS Geschirrspüler über Schlüssel", f and f.kind == "dishwasher" and f.source == "home_connect_alt" and f.how == "keys", f)
check("Home Connect WS Felder inkl. Startverzögerung", f and f.fields["phase"] == "sensor.ws_phase" and f.fields["start_in"] == "sensor.ws_start", f and f.fields)
for key in ("sensor_laundry_process_phase", "sensor_dryer_process_phase"):
    wsw = [E("sensor.wsw_state", "sensor_operation_state"), E("sensor.wsw_prog", "sensor_active_program"),
           E("sensor.wsw_phase", key), E("sensor.wsw_pct", "sensor_program_progress")]
    st("sensor.wsw_prog", "laundrycare_washer_program_cotton")
    f = lf.classify("d7b", wsw, S.get)
    check("Home Connect WS Phase über " + key, f and f.fields.get("phase") == "sensor.wsw_phase", f and f.fields)

miele = [E("sensor.m_state", "status", "miele"), E("sensor.m_spin", "spin_speed", "miele"), E("sensor.m_rem", "remaining_time", "miele")]
f = lf.classify("d8", miele, S.get)
check("Miele Waschmaschine (ungetestet)", f and f.kind == "washer" and f.grade == lf.GRADE_UNTESTED, f)

vac = [E("vacuum.v1", None, "roborock"), E("sensor.v1_status", "status", "roborock"), E("sensor.v1_room", "current_room", "roborock"),
       E("sensor.v1_pct", "clean_percent", "roborock"), E("sensor.v1_rem", "remaining_time", "roborock")]
f = lf.classify("d9", vac, S.get)
check("Saugroboter über vacuum-Domäne", f and f.kind == "vacuum" and f.fields["state"] == "vacuum.v1" and f.fields["room"] == "sensor.v1_room", f)
check("Saugroboter: „status“/„remaining_time“ nicht als Wäsche gedeutet", f and f.source == "vacuum")
bare = [E("vacuum.v2", None, "dreame")]
check("Saugroboter ohne Nachbarn", lf.classify("d10", bare, S.get).kind == "vacuum")

pr = [E("sensor.pr_state", "print_status", "bambu_lab"), E("sensor.pr_stage", "stage", "bambu_lab"),
      E("sensor.pr_pct", "print_progress", "bambu_lab"), E("sensor.pr_task", "subtask_name", "bambu_lab")]
f = lf.classify("d11", pr, S.get)
check("Bambu-Drucker", f and f.kind == "printer" and f.fields["stage"] == "sensor.pr_stage" and f.grade == lf.GRADE_UNTESTED, f)

plug = [E("switch.plug", None, "shelly"), E("sensor.plug_power", None, "shelly")]
check("Steckdose ist kein Live-Gerät", lf.classify("d12", plug, S.get) is None)
check("Gerät ohne Zustände ist nichts", lf.classify("d13", [lf.Ent("sensor.gone", "washer_state", "ha_washdata")], S.get) is None)

# ── 2) Gleichstand mit dem JS-Finder ────────────────────────────────────
JS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const win = {};
try { new Function('window', 'document', src)(win, { createElement: () => ({ style: {} }) }); } catch (e) { /* andere Module des Bündels */ }
const LF = win.casoraLaundryFind;
if (!LF) { console.error('casoraLaundryFind fehlt'); process.exit(2); }
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
    check("JS-SOURCES lesbar", False, err)
if js_sources is not None:
    py_sources = [{"id": s["id"], "platforms": s["platforms"], "need": s["need"], "any": s["any"], "fields": s["fields"]} for s in lf.SOURCES]
    check("gleiche Quellen in gleicher Reihenfolge", [s["id"] for s in js_sources] == [s["id"] for s in py_sources],
          ([s["id"] for s in js_sources], [s["id"] for s in py_sources]))
    for js, py in zip(js_sources, py_sources):
        for key in ("platforms", "need", "any", "fields"):
            check(f"{js['id']}: {key} wie im Dashboard", js[key] == py[key], (js[key], py[key]))

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
