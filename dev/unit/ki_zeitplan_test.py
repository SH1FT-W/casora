"""KI-Zeitpläne (1.0.3) ohne laufendes HA: Übernahme aus ki_auto, Termine, Antwortsprache.

  uv run --python 3.14 --with homeassistant python dev/unit/ki_zeitplan_test.py

Prüft: bestehende Installationen behalten ihr Verhalten (ki_auto an oder nie gesetzt →
bisherige Termine, Update-Check täglich statt stündlich; ki_auto aus → nichts automatisch,
Update-Check auf Knopfdruck), neue Einträge starten ohne Zeitpläne (alles aus), eigene
Zeiten werden richtig gelesen und der nächste Lauf stimmt, KiRunner plant genau die
eingestellten Termine (kein stündlicher Lauf, kein Lauf nach dem Start), der Update-Sensor
meldet seinen Zeitplan, und die KI antwortet in der Sprache von Home Assistant.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import custom_components.casora as casora_init  # noqa: E402
from custom_components.casora import config_flow, ki, sensor  # noqa: E402

FAILS: list[str] = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        FAILS.append(name)


PLANS = ("ki_plan_energie", "ki_plan_heizung", "ki_plan_lueftung", "ki_plan_rezept")

# ── Übernahme aus ki_auto ─────────────────────────────────────────────────────
m = ki.migrate_options({"ai_task_entity": "ai_task.x"})
check("ki_auto nie gesetzt (Standard an) → alle Termine automatisch",
      all(m[p] == "auto" for p in PLANS) and m["ki_plan_update"] == "daily" and m["ai_task_entity"] == "ai_task.x")
m = ki.migrate_options({"ki_auto": True})
check("ki_auto an → automatisch, Update täglich, ki_auto weg",
      all(m[p] == "auto" for p in PLANS) and m["ki_plan_update"] == "daily" and "ki_auto" not in m)
m = ki.migrate_options({"ki_auto": False, "price_kwh": 0.3})
check("ki_auto aus → nichts automatisch, Update auf Knopfdruck",
      not any(p in m for p in PLANS) and m["ki_plan_update"] == "manual" and m["price_kwh"] == 0.3 and "ki_auto" not in m)
m = ki.migrate_options({"ki_plan_energie": "sun 20:00"})
check("vorhandene Zeitpläne bleiben", m["ki_plan_energie"] == "sun 20:00")
check("Neuer Eintrag: Flow mit Minor-Version 2 (keine Übernahme, alles aus)",
      config_flow.CasoraConfigFlow.VERSION == 1 and config_flow.CasoraConfigFlow.MINOR_VERSION == 2)


class Entries:
    def __init__(self):
        self.calls = []

    def async_update_entry(self, entry, options=None, minor_version=None):
        self.calls.append((options, minor_version))
        entry.options, entry.minor_version = options, minor_version
        return True


hass = SimpleNamespace(config_entries=Entries())
old = SimpleNamespace(version=1, minor_version=1, options={"ki_auto": True})
ok = asyncio.run(casora_init.async_migrate_entry(hass, old))
check("async_migrate_entry: 1.1 → 1.2 mit Zeitplänen",
      ok and old.minor_version == 2 and old.options["ki_plan_update"] == "daily" and "ki_auto" not in old.options)
new = SimpleNamespace(version=1, minor_version=2, options={})
n = len(hass.config_entries.calls)
ok = asyncio.run(casora_init.async_migrate_entry(hass, new))
check("async_migrate_entry: neuer Eintrag bleibt unverändert (alles aus)",
      ok and len(hass.config_entries.calls) == n and new.options == {})

# ── Termine ───────────────────────────────────────────────────────────────────
check("aus / leer / unbekannt → kein Termin",
      ki.parse_plan("energie", None) is None and ki.parse_plan("energie", "off") is None
      and ki.parse_plan("energie", "sonntags") is None and ki.parse_plan("energie", "sun 24:00") is None)
check("auto = bisherige Termine",
      ki.parse_plan("energie", "auto") == (6, 18, 0) and ki.parse_plan("heizung", "auto") == (0, 7, 0)
      and ki.parse_plan("lueftung", "auto") == (5, 10, 0) and ki.parse_plan("rezept", "auto") == (0, 6, 0))
check("eigene Zeit", ki.parse_plan("rezept", "Fri 17:30") == (4, 17, 30) and ki.parse_plan("energie", "7:05") == (None, 7, 5))
check("valid_plan", ki.valid_plan("auto") and ki.valid_plan("off") and ki.valid_plan("sat 09:15")
      and not ki.valid_plan("sa 09:15") and not ki.valid_plan("12:60"))

now = datetime(2026, 10, 4, 12, 0)  # Sonntag, 12:00
check("nächster Lauf: heute später", ki.next_run((6, 18, 0), now) == datetime(2026, 10, 4, 18, 0))
check("nächster Lauf: heute schon vorbei → nächste Woche", ki.next_run((6, 9, 0), now) == datetime(2026, 10, 11, 9, 0))
check("nächster Lauf: Montag", ki.next_run((0, 7, 0), now) == datetime(2026, 10, 5, 7, 0))
check("nächster Lauf: Samstag", ki.next_run((5, 10, 0), now) == datetime(2026, 10, 10, 10, 0))
check("nächster Lauf: täglich", ki.next_run((None, 6, 17), now) == datetime(2026, 10, 5, 6, 17)
      and ki.next_run((None, 13, 0), now) == datetime(2026, 10, 4, 13, 0))
check("nächster Lauf: aus", ki.next_run(None, now) is None)

# ── KiRunner plant genau die eingestellten Termine ────────────────────────────
tracked: list[dict] = []
later: list = []
ki.async_track_time_change = lambda hass, fn, **kw: tracked.append({"fn": fn, **kw}) or (lambda: None)
ki.async_call_later = lambda *a, **k: later.append(a) or (lambda: None)
ki.is_external = lambda hass, key: False


def plan(options):
    tracked.clear()
    later.clear()
    runner = ki.KiRunner(SimpleNamespace(), SimpleNamespace(options=options))
    runner._schedule()
    return sorted((t.get("hour"), t.get("minute")) for t in tracked)


check("Neuinstallation: nichts geplant", plan({}) == [] and not later)
check("ki_auto an (übernommen): 4 Wochentermine + Update täglich 6:17, nichts stündlich",
      plan(ki.migrate_options({})) == sorted([(18, 0), (7, 0), (10, 0), (6, 0), (6, 17)]) and not later
      and all(t.get("hour") is not None for t in tracked))
check("ki_auto aus (übernommen): nichts geplant", plan(ki.migrate_options({"ki_auto": False})) == [])
check("eigene Zeit + Update auf Knopfdruck", plan({"ki_plan_rezept": "fri 17:30", "ki_plan_update": "manual"}) == [(17, 30)])

# Wochentag wird beim Auslösen geprüft
fired = []
ki.KiRunner._run_recipe = lambda self: fired.append("rezept") or asyncio.sleep(0)
runner = ki.KiRunner(SimpleNamespace(async_create_task=lambda c: c.close() if hasattr(c, "close") else None),
                     SimpleNamespace(options={"ki_plan_rezept": "fri 17:30"}))
tracked.clear()
runner._schedule()
from homeassistant.util import dt as dt_util  # noqa: E402
fri = dt_util.as_utc(datetime(2026, 10, 9, 17, 30, tzinfo=dt_util.get_default_time_zone()))
sat = dt_util.as_utc(datetime(2026, 10, 10, 17, 30, tzinfo=dt_util.get_default_time_zone()))
tracked[0]["fn"](sat)
check("Samstag: Rezept (Freitag) läuft nicht", fired == [])
tracked[0]["fn"](fri)
check("Freitag: Rezept läuft", fired == ["rezept"])

# ── Update-Sensor meldet seinen Zeitplan ──────────────────────────────────────
s = sensor.KiSensor("update", SimpleNamespace(options={}))
check("Update-Sensor: ohne Zeitplan → zeitplan off", s.extra_state_attributes.get("zeitplan") == "off")
s = sensor.KiSensor("update", SimpleNamespace(options={"ki_plan_update": "daily"}))
check("Update-Sensor: täglich", s.extra_state_attributes.get("zeitplan") == "daily")
check("andere Sensoren ohne zeitplan", "zeitplan" not in sensor.KiSensor("energie", SimpleNamespace(options={})).extra_state_attributes)

# ── Antwortsprache wie Home Assistant ─────────────────────────────────────────
lang = lambda code: ki.answer_language(SimpleNamespace(config=SimpleNamespace(language=code)))  # noqa: E731
check("Sprache de → Deutsch", lang("de") == "Deutsch")
check("Sprache en → Englisch", "English" in lang("en") and "English" in lang("en-GB"))
check("Sprache unbekannt → Code", "xx" in lang("xx"))
src = open(os.path.join(ROOT, "custom_components/casora/ki.py"), encoding="utf-8").read()
check("ki.py: kein festes „Antworte auf Deutsch“", "Antworte auf Deutsch" not in src)
for name in ("rezept", "kamera", "pflanzen", "update"):
    y = open(os.path.join(ROOT, f"custom_components/casora/ki/{name}.yaml"), encoding="utf-8").read()
    check(f"ki/{name}.yaml: Sprache aus HA", "{{ sprache" in y and "auf Deutsch" not in y)

print("\n" + ("ALLES OK" if not FAILS else f"{len(FAILS)} FEHLER"))
sys.exit(1 if FAILS else 0)
