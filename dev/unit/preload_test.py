"""Early fetch of the dashboard's core scripts (preload.py, Ladezeit stage 3.2), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/preload_test.py

Covers the preload URL (exactly the resource URLs of i18n, core and loader, in that order, nothing else), the
registration on every page (frontend.add_extra_js_url), the swap on a new stamp, none in yaml mode, the removal
on unload, and the browser side (scripts/casora-preload.js: modulepreload only, not on settings pages).
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import preload  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


RES = {
    "casora-i18n.js": "/casora_scripts/casora-i18n.js?v=11",
    "casora-core.js": "/casora_scripts/casora-core.js?v=22",
    "casora-local.js": "/casora_scripts/casora-local.js?v=33",
    "smart-row.js": "/casora_scripts/smart-row.js?v=44",
}
url = preload.preload_url(5, RES)
parts = urlsplit(url)
q = parse_qs(parts.query)
check(parts.path == "/casora_scripts/casora-preload.js" and q["v"] == ["5"], f"preload script with its stamp: {url}")
check(q["u"] == [",".join([RES["casora-i18n.js"], RES["casora-core.js"], RES["casora-local.js"]])],
      "exactly the resource URLs of i18n, core and loader")
check('"' not in url and "<" not in url, "safe inside HA's import(\"…\")")
check(preload.preload_url(5, {"smart-row.js": "x"}) is None, "nothing to preload: no script")

# Registration
registered: set[str] = set()
preload.add_extra_js_url = lambda hass, u: registered.add(u)
preload.remove_extra_js_url = lambda hass, u: registered.discard(u)


async def executor(fn, *args):
    return fn(*args)


hass = SimpleNamespace(data={}, async_add_executor_job=executor)
scripts = os.path.join(ROOT, "custom_components", "casora", "scripts")
asyncio.run(preload.async_set_preload(hass, scripts, RES))
check(len(registered) == 1 and next(iter(registered)).startswith("/casora_scripts/casora-preload.js?v="), "registered on every page")
first = next(iter(registered))
asyncio.run(preload.async_set_preload(hass, scripts, RES))
check(registered == {first}, "same URLs: unchanged")
asyncio.run(preload.async_set_preload(hass, scripts, {**RES, "casora-core.js": "/casora_scripts/casora-core.js?v=23"}))
check(len(registered) == 1 and first not in registered, "new stamp: the former one is replaced")
asyncio.run(preload.async_set_preload(hass, scripts, None))
check(not registered, "yaml mode (no resource URLs of its own): no preload")
asyncio.run(preload.async_set_preload(hass, scripts, RES))
preload.async_unload_preload(hass)
check(not registered, "unload removes it")

# Browser side
js = open(os.path.join(scripts, "casora-preload.js"), encoding="utf-8").read()
check("modulepreload" in js and "import(" not in js.replace("import.meta", ""), "only announces, runs nothing")
check("config" in js and "casora-studio" in js, "not on settings pages or in the Studio")
check("/casora_scripts/" in js and "location.origin" in js, "only Casora's own scripts on this server")

print("preload: " + ("ok" if not FAILS else f"{len(FAILS)} Fehler"))
sys.exit(1 if FAILS else 0)
