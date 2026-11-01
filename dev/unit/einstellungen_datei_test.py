"""Settings file www/casora/einstellungen.js (Ladezeit stage 1.3), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/einstellungen_datei_test.py

The dashboard loader fetched the file with no-store and ?t= on every open. Now casora/settings/get names its
version key ("file", None without a file) and the loader asks for it only then, with ?v=<key>; such a request
may be cached for good (a changed file gets a new key). Covers the key (user folder before the former place,
changes with the file), the cache headers of the versioned and the plain request and the empty module.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import assets  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


with tempfile.TemporaryDirectory() as cfg:
    check(assets.settings_file_stamp(cfg) is None, "no file: no key")
    legacy = os.path.join(cfg, "www", "hemma")
    os.makedirs(legacy)
    with open(os.path.join(legacy, "einstellungen.js"), "w") as fh:
        fh.write("window.CASORA_SETTINGS = {};\n")
    k_legacy = assets.settings_file_stamp(cfg)
    check(bool(k_legacy), "file in the former place has a key")
    user = os.path.join(cfg, "www", "casora")
    os.makedirs(user)
    path = os.path.join(user, "einstellungen.js")
    with open(path, "w") as fh:
        fh.write("window.CASORA_SETTINGS = { waste: {} };\n")
    k1 = assets.settings_file_stamp(cfg)
    check(bool(k1) and k1 != k_legacy, "www/casora wins over the former place")
    st = os.stat(path)
    with open(path, "w") as fh:
        fh.write("window.CASORA_SETTINGS = { waste: { b: 1 } };\n")
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))
    k2 = assets.settings_file_stamp(cfg)
    check(k2 != k1, "changed file, same size and mtime: new key")

    # The view: versioned request cached for good, plain request revalidated, missing file an empty module.
    async def executor(fn, *args):
        return fn(*args)

    hass = SimpleNamespace(config=SimpleNamespace(path=lambda *p: os.path.join(cfg, *p), config_dir=cfg),
                           async_add_executor_job=executor)
    shipped = os.path.join(cfg, "shipped")
    os.makedirs(shipped)
    view = assets.CasoraAssetsView(shipped)

    def req(query):
        return SimpleNamespace(app={"hass": hass}, query=query, headers={})

    r = asyncio.run(view.get(req({"v": k2}), "einstellungen.js"))
    check("immutable" in r.headers.get("Cache-Control", ""), "versioned request: cached for good")
    r = asyncio.run(view.get(req({"v": k1}), "einstellungen.js"))
    check(r.headers.get("Cache-Control") == "no-cache", "outdated key: revalidated, not kept for good")
    r = asyncio.run(view.get(req({"t": "1"}), "einstellungen.js"))
    check(r.headers.get("Cache-Control") == "no-cache", "plain request: revalidated as before")
    os.remove(path)
    os.remove(os.path.join(legacy, "einstellungen.js"))
    r = asyncio.run(view.get(req({}), "einstellungen.js"))
    check(r.status == 200 and r.content_type == "text/javascript", "no file: empty module, no 404")

print("einstellungen_datei: " + ("ok" if not FAILS else f"{len(FAILS)} Fehler"))
sys.exit(1 if FAILS else 0)
