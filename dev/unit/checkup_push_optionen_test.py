"""Lüften-Push, eigene KI-Zeiten und Update-Push – ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/checkup_push_optionen_test.py

7. lueften_push.py: Kommt ein Hinweis innerhalb von 30 Min. nach dem letzten wieder, wird er nach
   Ablauf der 30 Min. gesendet, solange er anhält (vorher blieb er bis zum Ende stumm).
8. options.py: eigene Zeit mit Tab oder geschütztem Leerzeichen („sun\\t6:00“) wird einheitlich
   gespeichert statt mit ValueError (500) abzubrechen.
10. update_push.py: gemerkte Versionen nach Version sortiert gekürzt – „1.10.0“ fällt nicht vor „1.9.0“ raus.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import lueften_push as lp  # noqa: E402
from custom_components.casora import options  # noqa: E402
from custom_components.casora import update_push as up  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


# ── 7. Lüften: nach der Sperrzeit doch senden ──────────────────────────────────
NOW = [datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)]
lp.dt_util = SimpleNamespace(utcnow=lambda: NOW[0], as_local=lambda t: t)
sent: list = []


def _task(coro, eager_start=False):
    sent.append(NOW[0])
    coro.close()


hass = SimpleNamespace(async_create_task=_task)
rk = SimpleNamespace(vent={"rooms": [{"k": "bad", "n": "Bad"}], "alerts": []}, vent_enabled=True)
push = lp.LueftenPush(hass, SimpleNamespace(options={lp.OPT_VENT_NOTIFY: ["notify.handy"]}), rk)


def at(minutes, alerts):
    NOW[0] = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc) + timedelta(minutes=minutes)
    rk.vent["alerts"] = alerts
    push.tick()


at(0, ["bad|co2krit"])
at(5, [])
at(10, ["bad|co2krit"])
check("7: innerhalb von 30 Min. kein zweiter Push", len(sent) == 1, sent)
at(31, ["bad|co2krit"])
check("7: nach 30 Min. gesendet, weil er anhält", len(sent) == 2, sent)
at(40, ["bad|co2krit"])
check("7: danach nur einmal je Zustand", len(sent) == 2, sent)

# ── 8. eigene Zeit mit Tab / geschütztem Leerzeichen ──────────────────────────
real_schema = options.options_schema
options.options_schema = lambda hass, cur: (lambda d: dict(d))
try:
    key = options.PLAN_OPTS["rezept"]
    for raw, want in (("Sun\t6:00", "sun 06:00"), ("sun 18:05", "sun 18:05"), (" 7:30 ", "07:30"),
                      ("Mon  6:00", "mon 06:00")):
        try:
            got = options.build_options(None, {}, {key: raw}).get(key)
        except Exception as err:  # noqa: BLE001
            got = f"{type(err).__name__}: {err}"
        check(f"8: {raw!r} → {want!r}", got == want, got)
finally:
    options.options_schema = real_schema

# ── 10. Update-Push: Liste nach Version gekürzt ───────────────────────────────
saved: list = []
p = object.__new__(up.UpdatePush)
p.hass = SimpleNamespace(states=SimpleNamespace(get=lambda eid: SimpleNamespace(
    state="on", attributes={"latest_version": "v99.10.0", "in_progress": False})),
    async_create_task=lambda coro, eager_start=False: coro.close())
p.entry = SimpleNamespace(options={up.OPT_UPDATE_PUSH: ["notify.handy"]})
p.store = SimpleNamespace(async_delay_save=lambda fn, delay: saved.append(fn()))
p.loaded = True
p.notified = {f"99.{i}.0" for i in range(10)} | {f"0.0.{i}" for i in range(45)}
real_entity = up.casora_update_entity
up.casora_update_entity = lambda hass, entry: ("update.casora", "hacs")
try:
    p.check()
finally:
    up.casora_update_entity = real_entity
kept = saved[-1]["notified"] if saved else []
check("10: gespeichert, höchstens 50", len(kept) == 50, len(kept))
check("10: neueste bleibt (99.10.0 nach 99.9.0)", kept[-2:] == ["99.9.0", "99.10.0"], kept[-3:])
check("10: älteste fallen raus", "0.0.0" not in kept and "0.0.44" in kept, kept[:3])

print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
