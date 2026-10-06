"""Kleine Robustheits-Fehler der Python-Seite (B-PY-…) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/python_robust_test.py

B-PY-04: zwei gleichzeitige Auffrisch-Läufe (Start + Karten-Update) laufen nacheinander.
B-PY-05: Konfigurieren-Dialog: „Ungültige Zeit“ nur unter Zeitplan-Feldern.
B-PY-06: unpassende KI-Änderung beim Umzug („Vorlage anpassen“) → verständliche Meldung statt Absturz.
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


async def t_py06():
    from custom_components.casora import ki, settings

    sent = {}
    conn = SimpleNamespace(user=SimpleNamespace(is_admin=True), send_error=lambda i, code, text: sent.update(code=code, text=text),
                           send_result=lambda i, r: sent.update(code="ok"))
    hass = SimpleNamespace(config_entries=SimpleNamespace(async_entries=lambda d: [object()]),
                           config=SimpleNamespace(language="de"))
    jobs = []
    hass.async_create_background_task = lambda coro, *a, **k: jobs.append(coro)

    async def ask(*a, **k):
        return {"ops": '[{"op": "set", "path": "variables/liste/0/stil/farbe", "value": "rot"}]', "changes": []}

    real = ki.ai_models, ki.ask_ai
    ki.ai_models = lambda h: [{"ok": True, "entity_id": "ai_task.x"}]
    ki.ask_ai = ask
    try:
        settings.ws_merge_template(hass, conn, {
            "id": 1, "name": "t", "mine": {}, "casora": {"variables": {"liste": ["text"]}}})
        for j in jobs:
            try:
                await j
            except Exception as err:  # noqa: BLE001
                sent.update(code="absturz", text=repr(err))
    finally:
        ki.ai_models, ki.ask_ai = real
    check("B-PY-06: Meldung „passen nicht zur Vorlage“", sent.get("code") == "bad_ops", repr(sent))


async def main():
    await t_py06()
    await t_py04()
    await t_py05()


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
