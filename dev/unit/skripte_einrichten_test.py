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


# _ensure_scripts: write, reload, check; put scripts.yaml back only when HA did not load it and the include is missing.
def ensure(config_text, scripts_text, created_after_reload):
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "configuration.yaml"), "w", encoding="utf-8") as f:
        f.write(config_text)
    if scripts_text is not None:
        with open(os.path.join(d, "scripts.yaml"), "w", encoding="utf-8") as f:
            f.write(scripts_text)
    states = {}

    async def call(domain, service, data=None, blocking=False):
        if (domain, service) == ("script", "reload") and created_after_reload:
            states["script.casora_x"] = object()

    async def job(fn, *a):
        return fn(*a)

    hass = SimpleNamespace(config=SimpleNamespace(config_dir=d), services=SimpleNamespace(async_call=call),
                           states=SimpleNamespace(get=lambda e: states.get(e)), async_add_executor_job=job)
    real = helfer._exists
    helfer._exists = lambda h, e: False
    try:
        res = asyncio.run(helfer._ensure_scripts(hass, {"script": {"casora_x": {"sequence": []}}}))
    finally:
        helfer._exists = real
    path = os.path.join(d, "scripts.yaml")
    return res, (open(path, encoding="utf-8").read() if os.path.exists(path) else None)


# Include line in a form the check does not know, HA loads it anyway: created, nothing put back.
res, text = ensure("script: !include scripts.yaml\u00a0\n", "", True)
assert res == (["script.casora_x"], [], True), res
assert "casora_x:" in text
print("ok unknown include form: written and created")

# Not loaded and no include line: failed, scripts.yaml exactly as before.
res, text = ensure("default_config:\n", "# mine\nfoo:\n  sequence: []\n", False)
assert res == ([], ["script.casora_x"], False), res
assert text == "# mine\nfoo:\n  sequence: []\n", text
res, text = ensure("default_config:\n", None, False)
assert text is None, "file that did not exist is removed again"
print("ok not loaded: scripts.yaml put back")

# Include line there but HA does not create it: kept for the log, and not written twice next time.
res, text = ensure("script: !include scripts.yaml\n", "casora_x:\n  sequence: []\n", False)
assert res == ([], ["script.casora_x"], True), res
assert text.count("casora_x:") == 1, text
print("ok no duplicate keys")
