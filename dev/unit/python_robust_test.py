"""Kleine Robustheits-Fehler der Python-Seite (B-PY-…) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/python_robust_test.py

B-PY-04: zwei gleichzeitige Auffrisch-Läufe (Start + Karten-Update) laufen nacheinander.
B-PY-05: Konfigurieren-Dialog: „Ungültige Zeit“ nur unter Zeitplan-Feldern.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import config_flow, options, template_refresh  # noqa: E402

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


async def t_py05():
    got = {}
    flow = object.__new__(config_flow.CasoraOptionsFlow)
    flow.hass = None
    type(flow).config_entry = property(lambda self: SimpleNamespace(options={}))
    flow.async_show_form = lambda **k: got.update(k["errors"]) or k
    real_b, real_s = config_flow.build_options, config_flow.options_schema
    config_flow.options_schema = lambda *a: None
    try:
        for path in ("strompreis", options.PLAN_KEYS[0]):
            got.clear()
            config_flow.build_options = lambda *a, p=path: (_ for _ in ()).throw(options.OptionsError("x", p))
            await flow.async_step_init({"x": 1})
            want = "invalid_plan" if path in options.PLAN_KEYS else "invalid"
            check(f"B-PY-05: Feld {path} → {want}", got == {path: want}, repr(got))
    finally:
        config_flow.build_options, config_flow.options_schema = real_b, real_s


async def main():
    await t_py04()
    await t_py05()


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
