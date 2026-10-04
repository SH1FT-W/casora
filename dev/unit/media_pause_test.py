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

from custom_components.casora.media_pause import PauseTracker, is_contact, media_key, next_entry, next_open  # noqa: E402

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


class Contact(St):
    def __init__(self, eid, state, changed, dc="window"):
        super().__init__(eid, state, None, changed)
        self.attributes = {"device_class": dc}


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
        return [s for s in self.items if s.entity_id.startswith(domain + ".")]


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


    # 3. Kontakte: offen seit überlebt Neustarts, Spieler bleiben unberührt.
    win = "binary_sensor.window_a"
    cdisk: dict = {}
    hc = Hass([Contact(win, "off", t0 - timedelta(hours=1)), St(EID, "playing", "x", t0)])
    tc = PauseTracker(hc, FakeStore(cdisk))
    await tc.async_start()
    check(tc.contacts == {} and tc.players == {}, "geschlossen: nichts gemerkt")
    hc.bus.cb(Ev({"entity_id": win, "old_state": Contact(win, "off", t0), "new_state": Contact(win, "on", t0)}))
    check(cdisk["data"]["contacts"][win]["since"] == t0.isoformat(), "Öffnen gespeichert")
    # Gleicher Zustand (Attribut-Update, on → on): Zeitpunkt bleibt.
    hc.bus.cb(Ev({"entity_id": win, "old_state": Contact(win, "on", t0),
                  "new_state": Contact(win, "on", t0 + timedelta(minutes=5))}))
    check(tc.contacts[win]["since"] == t0.isoformat(), "on → on: alter Zeitpunkt")
    # Neustart zwei Stunden später: Kontakt beim Start schon wieder on.
    later = t0 + timedelta(hours=2)
    hc2 = Hass([Contact(win, "on", later)])
    tc2 = PauseTracker(hc2, FakeStore(cdisk))
    await tc2.async_start()
    check(tc2.contacts[win]["since"] == t0.isoformat(), "Kontakt nach Neustart: alter Zeitpunkt")
    # Neustart, Kontakt kommt erst nach Casora (unavailable → on).
    hc3 = Hass([Contact(win, "unavailable", later)])
    tc3 = PauseTracker(hc3, FakeStore(cdisk))
    await tc3.async_start()
    hc3.bus.cb(Ev({"entity_id": win, "old_state": Contact(win, "unavailable", later),
                   "new_state": Contact(win, "on", later + timedelta(seconds=20))}))
    check(tc3.contacts[win]["since"] == t0.isoformat(), "unavailable → on: alter Zeitpunkt")
    # Neuer Öffnungsvorgang: zu, wieder auf = neuer Zeitpunkt.
    t5 = later + timedelta(minutes=30)
    hc3.bus.cb(Ev({"entity_id": win, "old_state": Contact(win, "on", later), "new_state": Contact(win, "off", t5)}))
    check(win not in tc3.contacts, "Schließen löscht Eintrag")
    hc3.bus.cb(Ev({"entity_id": win, "old_state": Contact(win, "off", t5),
                   "new_state": Contact(win, "on", t5 + timedelta(minutes=1))}))
    check(tc3.contacts[win]["since"] == (t5 + timedelta(minutes=1)).isoformat(), "neu geöffnet = neuer Zeitpunkt")
    # Andere binary_sensor-Klassen (Bewegung) werden nicht gemerkt.
    mot = "binary_sensor.motion"
    hc3.bus.cb(Ev({"entity_id": mot, "old_state": Contact(mot, "off", t5, "motion"),
                   "new_state": Contact(mot, "on", t5, "motion")}))
    check(mot not in tc3.contacts, "Bewegung nicht gemerkt")
    check(tc3.players == {}, "Kontakte berühren keine Player")


# Reine Merklogik Kontakte
check(next_open(None, "off", "on", T0) == {"since": T0}, "off → on merkt Zeitpunkt")
check(next_open({"since": T0}, "on", "unavailable", T1) == {"since": T0}, "Ausfall behält Kontakt")
check(next_open({"since": T0}, "unknown", "on", T2) == {"since": T0}, "unknown → on alter Zeitpunkt")
check(next_open({"since": T0}, "off", "on", T2) == {"since": T2}, "neuer Öffnungsvorgang")
check(next_open({"since": T0}, "on", "off", T2) is None, "off löscht")
check(is_contact("binary_sensor.x", {"device_class": "garage_door"}), "garage_door ist Kontakt")
check(not is_contact("binary_sensor.x", {"device_class": "motion"}), "motion ist kein Kontakt")
check(not is_contact("cover.x", {"device_class": "window"}), "nur binary_sensor")

asyncio.run(main())

if FAILS:
    print(f"{len(FAILS)} Fehler")
    sys.exit(1)
print("media_pause: alles ok")
