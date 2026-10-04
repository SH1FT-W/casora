"""Pausiert seit (media_pause.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/media_pause_test.py

Nach einem HA-Neustart geht ein Player paused → unavailable → paused. Gleicher Titel:
alter Zeitpunkt bleibt. Anderer Titel oder playing → paused: neuer Zeitpunkt.
Der Tracker hält das über einen (nachgebauten) Neustart im Store.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora.media_pause import PauseTracker, media_key, next_entry  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


T0, T1, T2 = "2026-10-04T10:00:00+00:00", "2026-10-04T13:00:00+00:00", "2026-10-04T13:00:05+00:00"
fire = {"since": T0, "title": "I'm On Fire"}

# 1. Reine Merklogik
check(next_entry(None, "playing", "paused", "I'm On Fire", T0) == fire, "playing → paused merkt Zeitpunkt")
check(next_entry(fire, "paused", "unavailable", "", T1) == fire, "Ausfall behält Eintrag")
check(next_entry(fire, "unavailable", "paused", "I'm On Fire", T2) == fire, "unavailable → paused gleicher Titel = alter Zeitpunkt")
check(next_entry(fire, "unknown", "paused", "I'm On Fire", T2) == fire, "unknown → paused gleicher Titel = alter Zeitpunkt")
check(next_entry(fire, None, "paused", "I'm On Fire", T2) == fire, "Neustart ohne alten Zustand, gleicher Titel = alter Zeitpunkt")
check(next_entry(fire, "unavailable", "paused", "Dancing in the Dark", T2) == {"since": T2, "title": "Dancing in the Dark"},
      "anderer Titel = neuer Zeitpunkt")
check(next_entry(fire, "playing", "paused", "I'm On Fire", T2) == {"since": T2, "title": "I'm On Fire"},
      "playing → paused = neuer Zeitpunkt, auch bei gleichem Titel")
check(next_entry(fire, "paused", "playing", "I'm On Fire", T2) is None, "playing löscht Eintrag")
check(next_entry(fire, "paused", "off", "", T2) is None, "off löscht Eintrag")
check(next_entry(None, "unavailable", "paused", "x", T2) == {"since": T2, "title": "x"}, "ohne Daten wie bisher: last_changed")
check(media_key({"media_content_id": "x-stream://1"}) == "x-stream://1", "ohne Titel zählt content_id")


# 2. Tracker über einen Neustart (Store + Startabgleich + Events)
class FakeStore:
    def __init__(self, shared):
        self.shared = shared

    async def async_load(self):
        return self.shared.get("data")

    def async_delay_save(self, fn, delay):
        self.shared["data"] = fn()


class St:
    def __init__(self, eid, state, title, changed):
        self.entity_id, self.state = eid, state
        self.attributes = {"media_title": title} if title else {}
        self.last_changed = changed


class Bus:
    def __init__(self):
        self.cb = None

    def async_listen(self, ev, cb):
        self.cb = cb
        return lambda: None


class States:
    def __init__(self, items):
        self.items = items

    def async_all(self, domain):
        return list(self.items)


class Hass:
    def __init__(self, items):
        self.states = States(items)
        self.bus = Bus()


class Ev:
    def __init__(self, data):
        self.data = data


EID = "media_player.speaker"
t0 = datetime(2026, 10, 4, 10, tzinfo=timezone.utc)


async def main():
    disk: dict = {}
    # Erster Lauf: Player spielt, dann pausiert.
    h = Hass([St(EID, "playing", "I'm On Fire", t0 - timedelta(minutes=3))])
    tr = PauseTracker(h, FakeStore(disk))
    await tr.async_start()
    h.bus.cb(Ev({"entity_id": EID, "old_state": St(EID, "playing", "I'm On Fire", t0),
                 "new_state": St(EID, "paused", "I'm On Fire", t0)}))
    check(disk["data"]["players"][EID]["since"] == t0.isoformat(), "Pause gespeichert")

    # Neustart drei Stunden später: Player beim Start wieder paused (last_changed neu).
    later = t0 + timedelta(hours=3)
    h2 = Hass([St(EID, "paused", "I'm On Fire", later)])
    tr2 = PauseTracker(h2, FakeStore(disk))
    await tr2.async_start()
    check(tr2.players[EID]["since"] == t0.isoformat(), "nach Neustart alter Zeitpunkt (Startabgleich)")

    # Kurzer Ausfall danach: unavailable → paused mit gleichem Titel.
    h2.bus.cb(Ev({"entity_id": EID, "old_state": St(EID, "paused", "I'm On Fire", later),
                  "new_state": St(EID, "unavailable", None, later)}))
    h2.bus.cb(Ev({"entity_id": EID, "old_state": St(EID, "unavailable", None, later),
                  "new_state": St(EID, "paused", "I'm On Fire", later + timedelta(seconds=9))}))
    check(tr2.players[EID]["since"] == t0.isoformat(), "Ausfall: alter Zeitpunkt bleibt")

    # Neustart, bei dem der Player erst nach Casora kommt.
    h3 = Hass([St(EID, "unavailable", None, later)])
    tr3 = PauseTracker(h3, FakeStore(disk))
    await tr3.async_start()
    h3.bus.cb(Ev({"entity_id": EID, "old_state": None, "new_state": St(EID, "paused", "I'm On Fire", later)}))
    check(tr3.players[EID]["since"] == t0.isoformat(), "Player kommt nach Casora: alter Zeitpunkt")

    # Anderer Titel nach Neustart: neuer Zeitpunkt.
    h4 = Hass([St(EID, "paused", "Born to Run", later)])
    tr4 = PauseTracker(h4, FakeStore(disk))
    await tr4.async_start()
    check(tr4.players[EID] == {"since": later.isoformat(), "title": "Born to Run"}, "anderer Titel nach Neustart = neu")


asyncio.run(main())

if FAILS:
    print(f"{len(FAILS)} Fehler")
    sys.exit(1)
print("media_pause: alles ok")
