"""Alte KI-Paket-Sensoren: nur ein noch gelieferter hält Casora passiv, ein verwaister nicht.

    uv run --python 3.14 --with homeassistant python dev/unit/ki_extern_verwaist_test.py
"""
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from custom_components.casora import ki  # noqa: E402

fails = []


def check(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok:
        fails.append(name)


class Reg:
    def __init__(self, ids):
        self.ids = ids

    def async_get_entity_id(self, domain, platform, uid):
        return self.ids.get(uid)


def hass(running, states):
    return SimpleNamespace(is_running=running, states=SimpleNamespace(get=states.get))


def run(reg_ids, running, states):
    ki.er.async_get = lambda h: Reg(reg_ids)
    return ki.is_external(hass(running, states), "energie")


EID = "sensor.alter_energie_coach"
UID = ki.LEGACY["energie"][0]
live = SimpleNamespace(attributes={})
orphan = SimpleNamespace(attributes={"restored": True})

check("ohne Registry-Eintrag: aktiv", run({}, True, {}) is False)
check("vor dem Start: Eintrag zählt (passiv)", run({UID: EID}, False, {}) is True)
check("Paket liefert ihn noch: passiv", run({UID: EID}, True, {EID: live}) is True)
check("verwaist (restored): aktiv", run({UID: EID}, True, {EID: orphan}) is False)
check("ohne Zustand nach dem Start: aktiv", run({UID: EID}, True, {}) is False)

print("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}")
sys.exit(1 if fails else 0)
