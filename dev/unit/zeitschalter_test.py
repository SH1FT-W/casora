"""Zeitschalter (zeitschalter.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/zeitschalter_test.py

Reine Logik (Ablauf, Zielzustand, Neustart-Entscheid) und der Tracker mit nachgebautem
HA: Timer setzen/ersetzen/löschen, Ablauf schaltet, Schalten von Hand verwirft den Timer,
Neustart legt offene Timer wieder an und holt kurz verpasste nach.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import homeassistant.helpers.event as ha_event  # noqa: E402
from homeassistant.core import CoreState  # noqa: E402
from homeassistant.exceptions import ServiceValidationError  # noqa: E402
from homeassistant.util import dt as dt_util  # noqa: E402

from custom_components.casora import zeitschalter as z  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


t0 = datetime(2026, 10, 15, 18, tzinfo=timezone.utc)

# 1. Reine Logik
check(z.due_at(t0, 30) == t0 + timedelta(minutes=30), "Ablauf = jetzt + Minuten")
check(z.service_for("light.a", "turn_off") == ("homeassistant", "turn_off"), "Licht: homeassistant.turn_off")
check(z.service_for("cover.a", "turn_off") == ("cover", "close_cover"), "Rollladen aus = schließen")
check(z.service_for("cover.a", "turn_on") == ("cover", "open_cover"), "Rollladen an = öffnen")
check(not z.allowed("lock.a") and not z.allowed("alarm_control_panel.a") and not z.allowed("camera.a"),
      "Schloss/Alarm/Kamera abgelehnt")
check(z.allowed("switch.a") and z.allowed("media_player.a"), "Schalter/Player erlaubt")
check(z.in_target("light.a", "turn_off", "off") and not z.in_target("light.a", "turn_off", "on"), "Ziel aus")
check(z.in_target("climate.a", "turn_on", "heat"), "Klima heat zählt als an")
check(z.in_target("cover.a", "turn_off", "closed") and not z.in_target("cover.a", "turn_off", "open"), "Rollladen zu")
check(not z.in_target("light.a", "turn_on", "unavailable"), "unavailable ist nie Ziel")
check(z.reached_by_hand("light.a", "turn_off", "on", "off"), "an → aus von Hand")
check(not z.reached_by_hand("light.a", "turn_off", "unavailable", "off"), "unavailable → aus zählt nicht")
check(not z.reached_by_hand("light.a", "turn_off", None, "off"), "ohne alten Zustand zählt nicht")
check(not z.reached_by_hand("light.a", "turn_off", "off", "off"), "aus → aus (Attribut) zählt nicht")
check(not z.reached_by_hand("light.a", "turn_off", "on", "on"), "Helligkeit ändern zählt nicht")
check(z.reached_by_hand("light.a", "turn_on", "off", "on"), "aus → an bei turn_on")
check(z.on_restart(t0 + timedelta(minutes=1), t0) == "keep", "Zukunft: behalten")
check(z.on_restart(t0 - timedelta(minutes=9), t0) == "run", "9 Min. verpasst: nachholen")
check(z.on_restart(t0 - timedelta(minutes=10), t0) == "run", "genau 10 Min.: nachholen")
check(z.on_restart(t0 - timedelta(minutes=11), t0) == "drop", "11 Min. verpasst: verwerfen")
check(z.parse_entry({"at": t0.isoformat(), "action": "turn_on"}) == (t0, "turn_on"), "Eintrag lesen")
check(z.parse_entry({"at": "kaputt", "action": "turn_on"}) is None, "kaputtes Datum")
check(z.parse_entry({"at": "2026-10-15T18:00:00", "action": "turn_on"}) is None, "ohne Zeitzone")
check(z.parse_entry({"at": t0.isoformat(), "action": "toggle"}) is None, "unbekannte Aktion")


# 2. Tracker mit nachgebautem HA
class FakeStore:
    def __init__(self, shared):
        self.shared = shared

    async def async_load(self):
        return self.shared.get("data")

    def async_delay_save(self, fn, delay):
        self.shared["data"] = fn()

    async def async_save(self, data):
        self.shared["data"] = data


class St:
    def __init__(self, eid, state):
        self.entity_id, self.state = eid, state


class Bus:
    def __init__(self):
        self.cb = None
        self.once = []

    def async_listen(self, ev, cb):
        self.cb = cb
        return lambda: None

    def async_listen_once(self, ev, cb):
        self.once.append(cb)
        return lambda: None


class Services:
    def __init__(self):
        self.handlers, self.schemas, self.calls = {}, {}, []

    def async_register(self, domain, name, fn, schema=None):
        self.handlers[name], self.schemas[name] = fn, schema

    def async_remove(self, domain, name):
        self.handlers.pop(name, None)

    async def async_call(self, domain, service, data, blocking=False):
        self.calls.append((domain, service, data["entity_id"]))


class States:
    def __init__(self, items):
        self.items = {s.entity_id: s for s in items}

    def get(self, eid):
        return self.items.get(eid)


class Hass:
    def __init__(self, items, running=True):
        self.states = States(items)
        self.bus = Bus()
        self.services = Services()
        self.state = CoreState.running if running else CoreState.starting
        self.tasks = []

    def async_create_task(self, coro):
        self.tasks.append(asyncio.ensure_future(coro))


# Zeitplan nachbauen: Rückrufe merken, im Test von Hand auslösen.
POINTS: list = []


def fake_track(hass, cb, at):
    rec = {"cb": cb, "at": at, "live": True}
    POINTS.append(rec)

    def cancel():
        rec["live"] = False
    return cancel


ha_event.async_track_point_in_utc_time = fake_track
NOW = [t0]
dt_util.utcnow = lambda: NOW[0]


class Call:
    def __init__(self, data):
        self.data = data


class Ev:
    def __init__(self, data):
        self.data = data


def fire_due(eid):
    for rec in list(POINTS):
        if rec["live"] and rec["cb"].__closure__ and eid in [c.cell_contents for c in rec["cb"].__closure__
                                                            if isinstance(c.cell_contents, str)]:
            rec["live"] = False
            rec["cb"](rec["at"])


L, C, K = "light.lamp", "cover.blind", "lock.door"


async def main():
    disk: dict = {}
    h = Hass([St(L, "on"), St(C, "open"), St(K, "locked")])
    tr = z.TimerTracker(h, FakeStore(disk))
    notes = []
    tr.listeners.append(lambda: notes.append(1))
    await tr.async_start()
    check({"set_timer", "cancel_timer"} <= set(h.services.handlers), "Dienste registriert")
    schema = h.services.schemas["set_timer"]
    check(schema({"entity_id": L, "minutes": 30}) == {"entity_id": L, "minutes": 30, "action": "turn_off"},
          "Standard-Aktion turn_off")
    for bad in ({"entity_id": L, "minutes": 0}, {"entity_id": L, "minutes": 1441},
                {"entity_id": L, "minutes": 5, "action": "toggle"}, {"entity_id": [L, C], "minutes": 5}):
        try:
            schema(bad)
            check(False, f"Schema nimmt {bad} an")
        except Exception:  # noqa: BLE001
            pass

    async def svc(name, **data):
        await h.services.handlers[name](Call(h.services.schemas[name](data)))

    # Setzen, Ablauf schaltet, Eintrag weg.
    await svc("set_timer", entity_id=L, minutes=30)
    check(disk["data"]["timers"][L] == {"at": (t0 + timedelta(minutes=30)).isoformat(), "action": "turn_off"},
          "Timer gespeichert")
    check(notes, "Änderung gemeldet")
    fire_due(L)
    await asyncio.gather(*h.tasks)
    check(h.services.calls == [("homeassistant", "turn_off", L)], "Ablauf schaltet aus")
    check(L not in tr.timers and L not in disk["data"]["timers"], "nach Ablauf gelöscht")

    # Ersetzen: alter Rückruf schaltet nicht mehr.
    h.services.calls.clear()
    await svc("set_timer", entity_id=C, minutes=10)
    old_rec = POINTS[-1]
    await svc("set_timer", entity_id=C, minutes=60, action="turn_on")
    check(not old_rec["live"], "alter Timer abbestellt")
    check(tr.timers[C]["action"] == "turn_on" and len(tr.timers) == 1, "ersetzt statt doppelt")
    fire_due(C)
    await asyncio.gather(*h.tasks)
    check(h.services.calls == [("cover", "open_cover", C)], "Rollladen öffnet")

    # Von Hand in den Zielzustand: verfällt, schaltet später nicht.
    h.services.calls.clear()
    await svc("set_timer", entity_id=L, minutes=30)
    h.bus.cb(Ev({"entity_id": L, "old_state": St(L, "on"), "new_state": St(L, "on")}))
    check(L in tr.timers, "Attribut-Update lässt Timer stehen")
    h.bus.cb(Ev({"entity_id": L, "old_state": St(L, "unavailable"), "new_state": St(L, "off")}))
    check(L in tr.timers, "Rückkehr aus unavailable lässt Timer stehen")
    h.bus.cb(Ev({"entity_id": L, "old_state": St(L, "on"), "new_state": St(L, "off")}))
    check(L not in tr.timers, "von Hand aus: Timer verworfen")
    fire_due(L)
    await asyncio.gather(*h.tasks)
    check(h.services.calls == [], "verworfener Timer schaltet nicht")

    # Abbrechen.
    await svc("set_timer", entity_id=L, minutes=5)
    await svc("cancel_timer", entity_id=L)
    check(L not in tr.timers, "cancel_timer löscht")

    # Abgelehnt: Schloss, unbekannte Entität.
    for eid in (K, "light.missing"):
        try:
            await svc("set_timer", entity_id=eid, minutes=5)
            check(False, f"{eid} angenommen")
        except ServiceValidationError:
            pass
    check(K not in tr.timers, "kein Timer fürs Schloss")

    # 3. Neustart: offen → wieder angelegt, kurz verpasst → nach Start nachholen, alt → weg.
    disk2 = {"data": {"timers": {
        L: {"at": (t0 + timedelta(minutes=20)).isoformat(), "action": "turn_off"},
        C: {"at": (t0 - timedelta(minutes=5)).isoformat(), "action": "turn_off"},
        "switch.old": {"at": (t0 - timedelta(hours=1)).isoformat(), "action": "turn_on"},
        K: {"at": (t0 + timedelta(minutes=5)).isoformat(), "action": "turn_off"},
    }}}
    POINTS.clear()
    h2 = Hass([St(L, "on"), St(C, "open")], running=False)
    tr2 = z.TimerTracker(h2, FakeStore(disk2))
    await tr2.async_start()
    check(set(tr2.timers) == {L}, "nur der offene Timer bleibt")
    check(set(disk2["data"]["timers"]) == {L}, "Speicher bereinigt")
    check(h2.services.calls == [] and len(h2.bus.once) == 1, "verpasster wartet auf HA-Start")
    h2.bus.once[0](None)
    await asyncio.gather(*h2.tasks)
    check(h2.services.calls == [("cover", "close_cover", C)], "verpasster Timer nach Start nachgeholt")
    fire_due(L)
    await asyncio.gather(*h2.tasks)
    check(h2.services.calls[-1] == ("homeassistant", "turn_off", L), "wieder angelegter Timer schaltet")

    tr2.stop()
    check(not h2.services.handlers, "Dienste beim Entladen entfernt")


asyncio.run(main())

if FAILS:
    print(f"{len(FAILS)} Fehler")
    sys.exit(1)
print("zeitschalter: alles ok")
