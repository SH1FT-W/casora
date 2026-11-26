"""casora/settings/set keeps sections this version does not know (Prüfrunde w01-02), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/einstellungen_fremde_abschnitte_test.py

Going back to an older Casora and saving any setting dropped every section the older version did not know
(climate room types from 26.11.28), and they stayed gone after the update. Now set replaces only the sections it
knows (SECTIONS); everything else in the store stays as it is. Known sections are still replaced or removed as before.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import settings  # noqa: E402
from custom_components.casora.const import DOMAIN  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


class FakeStore:
    def __init__(self, data):
        self.data = data
        self.saved = None

    async def async_load(self):
        return self.data

    async def async_save(self, data):
        self.saved = data
        self.data = data


class Conn:
    def __init__(self):
        self.result = None
        self.user = SimpleNamespace(is_admin=True)

    def send_result(self, _id, result):
        self.result = result

    def send_error(self, *a):
        raise AssertionError(a)


def run(stored, sent):
    store = FakeStore(stored)
    hass = SimpleNamespace(data={DOMAIN: {"settings_store": store}})
    conn = Conn()
    handler = settings.ws_set
    while hasattr(handler, "__wrapped__"):
        handler = handler.__wrapped__
    asyncio.run(handler(hass, conn, {"id": 1, "type": "casora/settings/set", "settings": sent}))
    return store, conn


stored = {"waste": {"a": 1}, "media": {"b": 2}, "zukunft": {"rooms": {"x": "living"}}}
store, conn = run(stored, {"waste": {"a": 9}, "media": {}})
check(store.saved.get("zukunft") == {"rooms": {"x": "living"}}, "unknown section kept")
check(store.saved.get("waste") == {"a": 9}, "known section replaced")
check("media" not in store.saved, "known section emptied by the Studio is removed")
check(conn.result["stored"] is True, "answer as before")

# The Studio sends an unknown key: still not stored (only the stored one survives).
store, _ = run({"zukunft": 1}, {"fremd": 2, "waste": {"a": 1}})
check("fremd" not in store.saved and store.saved.get("zukunft") == 1, "unknown key from the Studio not stored")

# Nothing stored yet.
store, _ = run(None, {"waste": {"a": 1}})
check(store.saved == {"waste": {"a": 1}}, "empty store: only the known sections")

print("einstellungen_fremde_abschnitte: " + ("ok" if not FAILS else f"{len(FAILS)} Fehler"))
sys.exit(1 if FAILS else 0)
