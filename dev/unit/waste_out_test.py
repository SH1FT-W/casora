"""Waste put out (waste_out.py, issue #211) without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/waste_out_test.py

One shared list of confirmed pickups: set/unset changes only its own key, old rows and junk are dropped, and a reload
right after a change keeps it (same Store, pending delayed save).
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import waste_out as wo  # noqa: E402
from custom_components.casora.const import DOMAIN  # noqa: E402
from custom_components.casora.stores import STORE_KEYS  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


class HAStore:
    """Like HA's Store: a delayed save stays pending in this object; async_load returns it."""
    disk: dict = {}

    def __init__(self, hass, version, key):
        self.key, self.pending = key, None

    async def async_load(self):
        return self.pending() if self.pending else HAStore.disk.get(self.key)

    def async_delay_save(self, fn, delay):
        self.pending = fn


SENT: list = []
wo.Store = HAStore
wo.async_dispatcher_send = lambda hass, sig, data: SENT.append((sig, data))
wo.websocket_api.async_register_command = lambda *a, **k: None


async def main():
    now = time.time() * 1000
    day = 86400 * 1000
    # clean(): junk and rows older than 7 days go, fresh ones stay.
    c = wo.clean({"2026-11-20|bio": now, "old": now - 8 * day, "": now, "bool": True, "nan": float("nan"),
                  "neg": -1, "txt": "x", 5: now, "k" * 201: now}, now)
    check(c == {"rows": {"2026-11-20|bio": now}}, f"clean keeps only fresh valid rows ({c})")
    check(wo.clean(None) == {"rows": {}}, "clean(None) is empty")
    check(len(wo.clean({str(i): now - i for i in range(250)}, now)["rows"]) == wo.MAX_ROWS, "at most MAX_ROWS rows")

    HAStore.disk[wo.STORE_KEY] = {"rows": {"2026-11-19|papier": now - day, "ancient": now - 30 * day}}
    hass = SimpleNamespace(data={})
    lst = await wo.async_setup_waste_out(hass)
    check(lst.data["rows"] == {"2026-11-19|papier": now - day}, "load drops rows older than 7 days")
    lst.set("2026-11-20|restmüll", True, now)
    check(lst.data["rows"].get("2026-11-20|restmüll") == now, "set out=True adds the key")
    check("2026-11-19|papier" in lst.data["rows"], "set keeps the other keys")
    check(SENT and SENT[-1][0] == wo.SIGNAL and "2026-11-20|restmüll" in SENT[-1][1]["rows"], "change is pushed")
    lst.set("2026-11-20|restmüll", False, now)
    check("2026-11-20|restmüll" not in lst.data["rows"], "set out=False removes the key (undo)")
    lst.set("2026-11-21|bio", True, now)
    # Reload: async_unload_entry drops the list, setup builds a new one from the same Store.
    hass.data[DOMAIN].pop("waste_out", None)
    lst2 = await wo.async_setup_waste_out(hass)
    check(lst2 is not lst, "reload: a new list object")
    check("2026-11-21|bio" in lst2.data["rows"], f"reload right after a change keeps it ({lst2.data})")
    check(wo.STORE_KEY in STORE_KEYS, "store key listed for the diagnostics download")


asyncio.run(main())
if FAILS:
    print(f"{len(FAILS)} FEHLER")
    sys.exit(1)
print("waste_out: alles ok")
