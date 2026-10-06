"""Lüften (raumklima.evaluate_rooms) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/lueften_test.py

B-PY-09: Fenster-Timer beginnt nach einem HA-Neustart nicht von vorn (gemerktes „offen seit“).
B-PY-10: ohne Außenwerte kein „draußen feuchter“.
"""

from __future__ import annotations

import os
import sys
from datetime import timedelta
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util import dt as dt_util  # noqa: E402

from custom_components.casora import raumklima  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


now = dt_util.utcnow()


def st(eid, state, changed=None, **attrs):
    return SimpleNamespace(entity_id=eid, state=str(state), last_changed=changed or now, attributes=attrs)


def hass_with(states, contacts=None):
    m = {s.entity_id: s for s in states}
    data = {"casora": {"media_pause": SimpleNamespace(contacts=contacts or {})}}
    return SimpleNamespace(states=SimpleNamespace(get=m.get), data=data)


ROOM = {"k": "bad", "n": "Bad", "rh": ["sensor.rh"], "t": ["sensor.t"], "co2": [], "voc": [], "w": ["binary_sensor.f"],
        "heat": []}

# B-PY-09: Fenster seit 25 Min. offen, HA vor 1 Min. neu gestartet (last_changed = Start).
h = hass_with([st("sensor.rh", 50), st("sensor.t", 21), st("sensor.out_t", 5), st("sensor.out_rh", 80),
               st("binary_sensor.f", "on", now - timedelta(minutes=1))],
              {"binary_sensor.f": {"since": (now - timedelta(minutes=25)).isoformat()}})
_, rooms, alerts = raumklima.evaluate_rooms(h, [ROOM], "sensor.out_t", "sensor.out_rh", None)
check("B-PY-09: offen seit gemerktem Zeitpunkt", rooms[0]["offen_min"] == 25, rooms[0]["offen_min"])
check("B-PY-09: „schließen“ kommt rechtzeitig", rooms[0]["status"] == "schliessen", rooms[0]["status"])

# Ohne gemerkten Zeitpunkt wie bisher last_changed.
h = hass_with([st("sensor.rh", 50), st("sensor.t", 21), st("binary_sensor.f", "on", now - timedelta(minutes=3))])
_, rooms, _ = raumklima.evaluate_rooms(h, [ROOM], None, None, None)
check("B-PY-09: ohne Merker last_changed", rooms[0]["offen_min"] == 3, rooms[0]["offen_min"])

# B-PY-10: Bad 70 %, keine Außenwerte → kein „draußen feuchter“.
h = hass_with([st("sensor.rh", 70), st("sensor.t", 21)])
_, rooms, _ = raumklima.evaluate_rooms(h, [dict(ROOM, w=[])], None, None, None)
check("B-PY-10: ohne Außenwerte kein „draußen feuchter“", rooms[0]["status"] == "feucht"
      and rooms[0]["grund"] == "Feuchte 70 % · Außenwerte fehlen", rooms[0]["grund"])
h = hass_with([st("sensor.rh", 70), st("sensor.t", 21), st("sensor.out_t", 20), st("sensor.out_rh", 95)])
_, rooms, _ = raumklima.evaluate_rooms(h, [dict(ROOM, w=[])], "sensor.out_t", "sensor.out_rh", None)
check("B-PY-10: mit feuchten Außenwerten wie bisher", rooms[0]["grund"] == "Feuchte 70 % · draußen feuchter", rooms[0]["grund"])

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
