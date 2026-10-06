"""Kleine Robustheits-Fehler der Python-Seite (B-PY-…) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/python_robust_test.py

B-PY-04: zwei gleichzeitige Auffrisch-Läufe (Start + Karten-Update) laufen nacheinander.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import template_refresh  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


async def t_py04():
    hass = SimpleNamespace(data={})
    log = []

    async def inner(h):
        log.append("start")
        await asyncio.sleep(0.01)
        log.append("ende")
        return 1

    real = template_refresh._async_refresh_dashboards
    template_refresh._async_refresh_dashboards = inner
    try:
        await asyncio.gather(template_refresh.async_refresh_dashboards(hass),
                             template_refresh.async_refresh_dashboards(hass))
    finally:
        template_refresh._async_refresh_dashboards = real
    check("B-PY-04: Auffrischen läuft nacheinander", log == ["start", "ende", "start", "ende"], repr(log))


async def main():
    await t_py04()


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
