"""Helper scripts (helfer.py): does configuration.yaml load scripts.yaml, and does the setup notice clear.

  uv run --python 3.14 --with homeassistant python dev/unit/skripte_einrichten_test.py

Forum report 23.10.2026: "script: !include scripts.yaml" plus "script manual: !include_dir_merge_named scripts",
still the notice that the scripts need that line. The notice now goes away once everything exists and only
names the include line when it is really missing.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import helfer  # noqa: E402


def ok(text: str) -> bool:
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "configuration.yaml"), "w", encoding="utf-8") as f:
            f.write(text)
        return helfer._scripts_file_ok(d)


assert ok("script: !include scripts.yaml\nscript manual: !include_dir_merge_named scripts\n")
assert ok("default_config:\r\nscript: !include scripts.yaml\r\n")
assert ok("﻿script: !include scripts.yaml\n")
assert ok("script: !include scripts.yaml  # UI scripts\n")
assert ok("script: !include 'scripts.yaml'\n")
assert not ok("script manual: !include_dir_merge_named scripts\n")
assert not ok("# script: !include scripts.yaml\n")
assert not ok("script: !include scripts_old.yaml\n")
print("ok include line")


class Services:
    def __init__(self):
        self.calls = []

    async def async_call(self, domain, service, data=None, blocking=False):
        self.calls.append((domain, service, data))


def run(helpers, scripts):
    """async_einrichten with stubbed creation; returns the notification calls."""
    hass = SimpleNamespace(services=Services(), async_add_executor_job=None)
    tasks = []
    hass.async_create_task = lambda c: tasks.append(c)

    async def read(*_):
        return {}

    async def eh(_h, _s):
        return helpers

    async def es(_h, _s):
        return scripts

    async def go():
        hass.async_add_executor_job = read
        old = helfer._ensure_helpers, helfer._ensure_scripts
        helfer._ensure_helpers, helfer._ensure_scripts = eh, es
        try:
            res = await helfer.async_einrichten(hass)
        finally:
            helfer._ensure_helpers, helfer._ensure_scripts = old
        for t in tasks:
            await t
        return res

    res = asyncio.run(go())
    return res, [c for c in hass.services.calls if c[0] == "persistent_notification"]


res, calls = run(([], []), ([], [], True))
assert calls == [("persistent_notification", "dismiss", {"notification_id": "casora_einrichten"})], calls
print("ok notice dismissed when all exist")

_, calls = run(([], []), ([], ["script.casora_restart_toggle"], False))
assert calls[0][1] == "create" and "!include scripts.yaml" in calls[0][2]["message"], calls
print("ok include missing")

_, calls = run(([], []), (["script.casora_restart_toggle"], ["script.casora_restart_toggle"], True))
msg = calls[0][2]["message"]
assert "!include scripts.yaml" not in msg and "Protokoll" in msg, msg
print("ok written but not created")
