"""async_remove_entry without a running HA: Casora's script resources leave with it.

  uv run --python 3.14 --with homeassistant python dev/unit/remove_entry_resources_test.py

Report 10/2026: after removing Casora the Lovelace resources under /casora_scripts/ stayed,
so the mobile app kept its cached casora-core.js (dialog offset) until reinstalled.
Checks: /casora_scripts/ entries removed, everything else stays, yaml mode is left alone,
and a failing resource list does not stop the removal.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import custom_components.casora as casora_init  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


class Resources:
    def __init__(self, urls, loaded=True):
        self.items = [{"id": str(i), "url": u, "type": "module"} for i, u in enumerate(urls)]
        self.loaded = loaded

    async def async_load(self):
        self.loaded = True

    def async_items(self):
        return list(self.items)

    async def async_delete_item(self, rid):
        self.items = [i for i in self.items if i["id"] != rid]


class YamlResources:
    def __init__(self, urls):
        self.items = [{"url": u} for u in urls]

    def async_items(self):
        return list(self.items)


class BrokenResources(Resources):
    def async_items(self):
        raise RuntimeError("boom")


def make_hass(tmp, resources):
    async def run(fn, *args):
        return fn(*args)

    return SimpleNamespace(
        data={"lovelace": SimpleNamespace(resources=resources)},
        config=SimpleNamespace(config_dir=tmp),
        async_add_executor_job=run,
    )


async def main():
    import tempfile

    urls = [
        "/casora_scripts/casora-core.js?v=1",
        "/casora_scripts/casora-local.js?v=2",
        "/hacsfiles/button-card/button-card.js",
        "/local/my-module.js",
        "/local/casora_scripts/not-casora.js",
    ]
    with tempfile.TemporaryDirectory() as tmp:
        res = Resources(urls, loaded=False)
        await casora_init.async_remove_entry(make_hass(tmp, res), None)
        left = [i["url"] for i in res.items]
        check("Casora resources removed", not any(u.startswith("/casora_scripts/") for u in left))
        check("other resources stay", left == urls[2:])
        check("list loaded before reading", res.loaded)

        yaml = YamlResources(urls)
        await casora_init.async_remove_entry(make_hass(tmp, yaml), None)
        check("yaml mode untouched", [i["url"] for i in yaml.items] == urls)

        try:
            await casora_init.async_remove_entry(make_hass(tmp, BrokenResources(urls)), None)
            check("broken resource list does not raise", True)
        except Exception:  # noqa: BLE001
            check("broken resource list does not raise", False)

        hass = make_hass(tmp, None)
        hass.data = {}
        await casora_init.async_remove_entry(hass, None)
        check("no Lovelace data: nothing to do", True)


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
