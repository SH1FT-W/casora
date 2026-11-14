"""Bell list removed for all users (notify_hidden.py) without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/notify_hidden_test.py

A reload (options saved) right after a change must keep it: saving is delayed 2 s, the list after the reload
comes from the same Store and so from the pending save, not from the older file.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import notify_hidden as nh  # noqa: E402
from custom_components.casora.const import DOMAIN  # noqa: E402

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


nh.Store = HAStore
nh.async_dispatcher_send = lambda *a, **k: None
nh.websocket_api.async_register_command = lambda *a, **k: None


async def main():
    hass = SimpleNamespace(data={})
    now = time.time() * 1000
    lst = await nh.async_setup_notify_hidden(hass)
    lst.set(now, {"msg-1": now})
    check(lst.data["rows"] == {"msg-1": now}, "set: row kept")
    # Reload: async_unload_entry drops the list, setup builds a new one.
    hass.data[DOMAIN].pop("notify_hidden", None)
    lst2 = await nh.async_setup_notify_hidden(hass)
    check(lst2 is not lst, "reload: a new list object")
    check(lst2.data == {"all": now, "rows": {"msg-1": now}}, f"reload right after a change: change kept ({lst2.data})")


asyncio.run(main())
if FAILS:
    print(f"{len(FAILS)} FEHLER")
    sys.exit(1)
print("notify_hidden: alles ok")
