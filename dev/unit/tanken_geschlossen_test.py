"""Issue #18: Geschlossene Tankstellen fehlten mit der Tankerkönig-Integration ganz in der Liste.

  uv run --python 3.14 --with homeassistant python dev/unit/tanken_geschlossen_test.py

Die Integration meldet für eine geschlossene Station „unknown“ als Preis; _integration_raw()
verwarf sie. Erwartet: mit dem letzten bekannten Preis bleibt sie als „zu“ (o: False) in der
Liste, die günstigste offene bleibt der Sensorwert, ohne bekannten Preis fehlt sie wie bisher,
und eine offene Station mit „unknown“ wird nicht mit altem Preis gezeigt.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import tanken  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


def ent(eid, dev, domain):
    return SimpleNamespace(entity_id=eid, device_id=dev, platform="tankerkoenig", domain=domain, disabled_by=None)


ENTS = [
    ent("sensor.a_diesel", "A", "sensor"), ent("binary_sensor.a_status", "A", "binary_sensor"),
    ent("sensor.b_diesel", "B", "sensor"), ent("binary_sensor.b_status", "B", "binary_sensor"),
    ent("sensor.c_diesel", "C", "sensor"), ent("binary_sensor.c_status", "C", "binary_sensor"),
]


class Reg:
    entities = SimpleNamespace(values=lambda: ENTS)

    def async_get(self, eid):
        return next((e for e in ENTS if e.entity_id == eid), None)


def st(state, name, lat):
    return SimpleNamespace(state=state, attributes={"fuel_type": "diesel", "station_name": name,
                                                     "latitude": lat, "longitude": 10.0})


def make(states):
    saves = []
    obj = SimpleNamespace(
        hass=SimpleNamespace(states=SimpleNamespace(get=states.get)),
        last_price={},
        integration_entities=lambda: [e.entity_id for e in ENTS if e.domain == "sensor"],
        _save_hist=lambda: saves.append(1),
    )
    return obj, saves


tanken.er.async_get = lambda hass: Reg()
raw_of = lambda o: tanken.Tanken._integration_raw(o)  # noqa: E731

# 1) Abends alle offen: Preise werden gemerkt.
states = {
    "sensor.a_diesel": st("2.199", "Station A", 54.30), "binary_sensor.a_status": st("on", "", 0),
    "sensor.b_diesel": st("1.959", "Station B", 54.31), "binary_sensor.b_status": st("on", "", 0),
    "sensor.c_diesel": st("1.999", "Station C", 54.32), "binary_sensor.c_status": st("on", "", 0),
}
o, saves = make(states)
check("alle offen: 3 Stationen", len(raw_of(o)) == 3)
check("Preise gemerkt", o.last_price == {"sensor.a_diesel": 2.199, "sensor.b_diesel": 1.959, "sensor.c_diesel": 1.999})
check("gemerkte Preise werden gespeichert", len(saves) >= 1)

# 2) Nachts: A und B geschlossen (unknown), C offen. B ohne bekannten Preis in einer frischen Instanz.
states.update({"sensor.a_diesel": st("unknown", "Station A", 54.30), "binary_sensor.a_status": st("off", "", 0),
               "sensor.b_diesel": st("unknown", "Station B", 54.31), "binary_sensor.b_status": st("off", "", 0)})
raw = raw_of(o)
check("geschlossene bleiben in der Liste", len(raw) == 3)
lst = tanken.stations_for(raw, "diesel", 54.30, 10.0, None)
by = {s["n"]: s for s in lst}
check("A zu mit letztem Preis", by["Station A"]["o"] is False and by["Station A"]["p"] == 2.199)
check("B zu mit letztem Preis", by["Station B"]["o"] is False and by["Station B"]["p"] == 1.959)
check("offene zuerst, Sensorwert = günstigste offene", lst[0]["n"] == "Station C" and [s for s in lst if s["o"]][0]["p"] == 1.999)

o2, _ = make(states)
o2.last_price = {"sensor.a_diesel": 2.199}
names = sorted(s["name"] for s in raw_of(o2))
check("ohne bekannten Preis fehlt die Station wie bisher", names == ["Station A", "Station C"])

# 3) Offen, aber Preis unknown (Störung): kein alter Preis als „offen“.
states.update({"binary_sensor.a_status": st("on", "", 0)})
names = sorted(s["name"] for s in raw_of(o))
check("offene Station mit unknown nicht mit altem Preis", "Station A" not in names)

print("FEHLER: " + ", ".join(fails) if fails else "tanken_geschlossen: alles ok")
sys.exit(1 if fails else 0)
