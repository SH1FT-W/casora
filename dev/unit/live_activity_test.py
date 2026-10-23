"""Live activities (live_activity.py) without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/live_activity_test.py

Snapshots per device kind (WashData, Home Connect WS, robot vacuum, printer), payload as the
HA app expects it (live_update, progress, chronometer, colors, silent), German/English, and the
flow with a mocked HA: start loud, intermediate update silent, pause loud, off = clear_notification,
done stays until the done duration, restart silently resumes running ones and clears orphaned ones,
switching off (device/recipient) ends at once, settings are validated.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util import dt as dt_util  # noqa: E402

from custom_components.casora import live_activity as la  # noqa: E402
from custom_components.casora.live_finder import Found  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


NOW = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
S: dict[str, SimpleNamespace] = {}


def st(eid, state, **attrs):
    S[eid] = SimpleNamespace(entity_id=eid, state=str(state), attributes=attrs)


def washer(dev="d-washer"):
    return Found(dev, "washer", "washdata", "sehr gut", {"state": "sensor.w_state", "program": "sensor.w_prog", "phase": "sensor.w_phase",
                                                         "progress": "sensor.w_pct", "remaining": "sensor.w_rem", "elapsed": "sensor.w_el"},
                 name="Waschmaschine Test")


def dish(dev="d-dish"):
    return Found(dev, "dishwasher", "homeconnect_ws", "sehr gut", {"state": "sensor.g_state", "program": "sensor.g_prog", "phase": "sensor.g_phase",
                                                                   "progress": "sensor.g_pct", "remaining": "sensor.g_rem", "start_in": "sensor.g_start"},
                 name="Geschirrspüler Test")


def vac(dev="d-vac"):
    return Found(dev, "vacuum", "vacuum", "sehr gut", {"state": "vacuum.v", "status": "sensor.v_status", "room": "sensor.v_room",
                                                     "progress": "sensor.v_pct", "area": "sensor.v_area", "time": "sensor.v_time", "error": "sensor.v_err"},
                 name="Sauger Test")


def printer(dev="d-print"):
    return Found(dev, "printer", "bambu_lab", "ungetestet", {"state": "sensor.p_state", "stage": "sensor.p_stage", "progress": "sensor.p_pct",
                                                           "remaining": "sensor.p_rem", "end": "sensor.p_end", "task": "sensor.p_task",
                                                           "layer": "sensor.p_layer", "layers": "sensor.p_layers"}, name="Drucker Test")


# ── Snapshots ────────────────────────────────────────────────────────────
st("sensor.w_state", "running"); st("sensor.w_prog", "Baumwolle 40"); st("sensor.w_phase", "rinse")
st("sensor.w_pct", "58"); st("sensor.w_rem", "41", unit_of_measurement="min"); st("sensor.w_el", "3420", unit_of_measurement="s")
s = la.snapshot(washer(), S.get, NOW, 0)
check("Wäsche läuft: Phase run", s.phase == "run", s)
check("Wäsche: Text Programm · Phase · Prozent", s.message == "Baumwolle 40 · Spülen · 58 %", s.message)
check("Wäsche: Kurztext = Phase", s.critical == "Spülen", s.critical)
check("Wäsche: Restzeit → Endzeitpunkt", s.end_ts == int(NOW.timestamp()) + 41 * 60, s.end_ts)
check("Wäsche: läuft seit aus verstrichener Zeit", s.start_ts == int(NOW.timestamp()) - 3420, s.start_ts)
s_en = la.snapshot(washer(), S.get, NOW, 1)
check("Englisch: Rinsing, 58% ohne Leerzeichen", s_en.message == "Baumwolle 40 · Rinsing · 58%", s_en.message)

p = la.build_payload(s, "washer", "Waschmaschine Test", "casora-live-washer-d", "/handy/", silent=False)
d = p["data"]
check("Payload: live_update, tag, url", d["live_update"] is True and d["tag"] == "casora-live-washer-d" and d["url"] == "/handy/", d)
check("Payload: Fortschritt 58/100", d["progress"] == 58 and d["progress_max"] == 100, d)
check("Payload: chronometer bis Ende", d["chronometer"] is True and d["when"] == s.end_ts, d)
check("Payload: Casora-Blau, laut, relevance 0.5", d["notification_icon_color"] == la.COLOR["washer"] and d["silent"] is False
      and d["relevance_score"] == 0.5, d)
check("Payload: Symbol Waschmaschine, critical_text", d["notification_icon"] == "mdi:washing-machine" and d["critical_text"] == "Spülen", d)

# Without remaining time (no profile yet): „Läuft“, chronometer from start
st("sensor.w_rem", "-1"); st("sensor.w_prog", "detecting..."); st("sensor.w_phase", "running"); st("sensor.w_pct", "0")
s = la.snapshot(washer(), S.get, NOW, 0)
d = la.build_payload(s, "washer", "W", "t", "/", True)["data"]
check("ohne Restzeit: läuft seit (chronometer ab Start)", s.end_ts is None and d["when"] == s.start_ts and d["chronometer"] is True, (s, d))
check("ohne Programm: „Läuft“, kein Programmtext", s.message.startswith("Läuft") and s.program is None, s.message)
check("Prozent 0 bleibt Fortschritt 0", d["progress"] == 0, d)

st("sensor.w_state", "finished"); st("sensor.w_pct", "100")
s = la.snapshot(washer(), S.get, NOW, 0)
d = la.build_payload(s, "washer", "W", "t", "/", False)["data"]
check("fertig: done, grün, 100 %, relevance 0.8, kein chronometer", s.phase == "done" and d["notification_icon_color"] == la.COLOR["done"]
      and d["progress"] == 100 and d["relevance_score"] == 0.8 and "chronometer" not in d, (s, d))
check("fertig: Text", s.message == "Fertig · Wäsche rausnehmen", s.message)
st("sensor.w_state", "anti_wrinkle")
check("Knitterschutz = fertig mit Zusatz", la.snapshot(washer(), S.get, NOW, 0).message == "Fertig · Wäsche rausnehmen · Knitterschutz läuft")
st("sensor.w_state", "user_paused"); st("sensor.w_pct", "40")
s = la.snapshot(washer(), S.get, NOW, 0)
d = la.build_payload(s, "washer", "W", "t", "/", False)["data"]
check("Pause: gelb, Kurztext Pause", s.phase == "pause" and d["notification_icon_color"] == la.COLOR["pause"] and d["critical_text"] == "Pause", (s, d))
st("sensor.w_state", "paused")
s = la.snapshot(washer(), S.get, NOW, 0)
d = la.build_payload(s, "washer", "W", "t", "/", True)["data"]
check("kurze Pause (WashData): minor, Grundfarbe, „Kurze Pause“", s.minor and d["notification_icon_color"] == la.COLOR["washer"]
      and s.message.startswith("Kurze Pause"), (s, d))
for raw in ("irgendwas_neues", "idle", "off", "clean_x"):
    st("sensor.w_state", raw)
    check(f"„{raw}“ ist off, nie Fertig", la.snapshot(washer(), S.get, NOW, 0).phase == "off")
# Unreachable is not a device state: "gone" (never off/done) – finding 2, user test 17.10.
for raw in ("unknown", "unavailable", ""):
    st("sensor.w_state", raw)
    check(f"„{raw}“ ist nicht erreichbar (gone), nie Fertig", la.snapshot(washer(), S.get, NOW, 0).phase == "gone")

# Dishwasher (Home Connect WS): hours, program name, start delay
st("sensor.g_state", "run"); st("sensor.g_prog", "dishcare_dishwasher_program_eco50"); st("sensor.g_phase", "mainwash")
st("sensor.g_pct", "35"); st("sensor.g_rem", "1.25", unit_of_measurement="h"); st("sensor.g_start", "0", unit_of_measurement="h")
s = la.snapshot(dish(), S.get, NOW, 0)
check("Spüler: Eco 50° · Reinigen · 35 %", s.message == "Eco 50° · Reinigen · 35 %", s.message)
check("Spüler: Restzeit in Stunden", s.end_ts == int(NOW.timestamp()) + 4500, s.end_ts)
st("sensor.g_state", "finished")
check("Spüler fertig: Geschirr ausräumen", la.snapshot(dish(), S.get, NOW, 0).message == "Fertig · Geschirr ausräumen")
st("sensor.g_state", "delayedstart"); st("sensor.g_start", "2", unit_of_measurement="h")
s = la.snapshot(dish(), S.get, NOW, 0)
d = la.build_payload(s, "dishwasher", "G", "t", "/", False)["data"]
local = dt_util.as_local(NOW + timedelta(hours=2)).strftime("%H:%M")
check("Startverzögerung: Startzeit, Ortszeit, chronometer bis Start", s.phase == "delay" and s.message == f"Eco 50° · Startet {local} Uhr"
      and d["when"] == int(NOW.timestamp()) + 7200 and d["critical_text"] == "Startzeit", (s.message, d))
st("sensor.g_start", "0", unit_of_measurement="min")
s = la.snapshot(dish(), S.get, NOW, 0)
check("Startverzögerung ohne Startzeit: keine (falsche) Uhrzeit", s.phase == "delay" and s.message == "Eco 50°" and s.end_ts is None, s)
st("sensor.g_state", "actionrequired")
s = la.snapshot(dish(), S.get, NOW, 0)
d = la.build_payload(s, "dishwasher", "G", "t", "/", False)["data"]
check("Eingriff: rot, relevance 0.8", s.phase == "attn" and d["notification_icon_color"] == la.COLOR["attn"] and d["relevance_score"] == 0.8, d)
check("Programmname aus Schlüssel", la.program_name("laundry_care_washer_program_delicates_silk", 1) == "Delicates"
      and la.program_name("laundry_care_dryer_program_towels", 0) == "Towels" and la.program_name("Baumwolle 40", 0) == "Baumwolle 40")
# Home Connect Local (laundrycare_…) and Home Connect Alt (the Home Connect key with dots, translation mode local)
check("Program name Home Connect Local/Alt", la.program_name("laundrycare_washer_program_cotton", 0) == "Cotton"
      and la.program_name("LaundryCare.Washer.Program.Cotton", 0) == "Cotton"
      and la.program_name("Dishcare.Dishwasher.Program.Eco50", 0) == "Eco 50°", la.program_name("LaundryCare.Washer.Program.Cotton", 0))
alt = Found("d-alt", "dishwasher", "home_connect_alt", "ungetestet", {"state": "sensor.a_state", "program": "sensor.a_prog"}, name="G")
st("sensor.a_state", "BSH.Common.EnumType.OperationState.Run"); st("sensor.a_prog", "Dishcare.Dishwasher.Program.Eco50")
s = la.snapshot(alt, S.get, NOW, 0)
check("Home Connect Alt: state as the Home Connect key", s.phase == "run" and s.program == "Eco 50°", s)

# Robot vacuum: room as main value, done on docking with area/duration, stays
st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning"); st("sensor.v_room", "Küche"); st("sensor.v_pct", "40")
st("sensor.v_area", "32.4", unit_of_measurement="m²"); st("sensor.v_time", "2700", unit_of_measurement="s"); st("sensor.v_err", "none")
s = la.snapshot(vac(), S.get, NOW, 0)
check("Sauger reinigt: Reinigt · Küche · 32 m² · 40 %, Kurztext Raum", s.phase == "run" and s.message == "Reinigt · Küche · 32 m² · 40 %" and s.critical == "Küche", s)
# Finding 7: progress from the vacuum, cleaning time → "running since" (chronometer from start)
d = la.build_payload(s, "vacuum", "S", "t", "/", True)["data"]
check("Sauger: Fortschritt 40, läuft seit Reinigungszeit", d["progress"] == 40 and d.get("chronometer") and d["when"] == int(NOW.timestamp()) - 2700, d)
st("sensor.v_status", "washing_the_mop")
check("Mopp waschen: Text statt Raum", la.snapshot(vac(), S.get, NOW, 0, prev=s).critical == "Mopp waschen")
check("Station work without a run before: off", la.snapshot(vac(), S.get, NOW, 0).phase == "off")
st("vacuum.v", "docked"); st("sensor.v_status", "charging")
s1 = la.snapshot(vac(), S.get, NOW, 0, prev=s)
check("Andocken: erst Ruhezeit, letzter Stand bleibt", s1.phase == "run" and s1.rest_since == int(NOW.timestamp()) and s1.message == s.message, s1)
s1b = la.snapshot(vac(), S.get, NOW + timedelta(seconds=30), 0, prev=s1)
check("Ruhezeit läuft weiter (Beginn bleibt)", s1b.phase == "run" and s1b.rest_since == s1.rest_since, s1b)
s2 = la.snapshot(vac(), S.get, NOW + timedelta(seconds=la.VAC_SETTLE_S), 0, prev=s1b)
check("Andocken nach Reinigung = Fertig · 32 m² in 45 Min.", s2.phase == "done" and s2.message == "Fertig · 32 m² in 45 Min.", s2)
st("sensor.v_status", "washing_the_mop")
s2b = la.snapshot(vac(), S.get, NOW, 0, prev=s2)
check("Mopp waschen nach Fertig: Fertig bleibt", s2b.phase == "done" and s2b.message == s2.message, s2b)
st("sensor.v_status", "charging")
s3 = la.snapshot(vac(), S.get, NOW, 0, prev=s2)
check("Fertig bleibt beim Sauger stehen", s3.phase == "done" and s3.extra == s2.extra, s3)
check("ohne vorherigen Lauf: Station = off", la.snapshot(vac(), S.get, NOW, 0, prev=None).phase == "off")
st("sensor.v_status", "error"); st("sensor.v_err", "wheel_stuck")
check("Sauger Fehler mit Grund", la.snapshot(vac(), S.get, NOW, 0).message == "Fehler · wheel stuck")
st("sensor.v_status", "unavailable"); st("vacuum.v", "returning")
check("ohne Status-Sensor: vacuum-Zustand returning", la.snapshot(vac(), S.get, NOW, 0, prev=la.Snap(phase="run")).critical == "Zurück zur Station")
st("vacuum.v", "docked"); st("sensor.v_status", "charger_disconnected")
check("charger_disconnected without a run: off", la.snapshot(vac(), S.get, NOW, 0).phase == "off")
pz = la.Snap(phase="pause", message="Pausiert")
check("charger_disconnected during a pause: stays paused", la.snapshot(vac(), S.get, NOW, 0, prev=pz).phase == "pause")
st("sensor.v_status", "air_drying_stopping")
check("unknown vacuum code without a run: off", la.snapshot(vac(), S.get, NOW, 0).phase == "off")
check("unknown vacuum code during a run: run", la.snapshot(vac(), S.get, NOW, 0, prev=la.Snap(phase="run")).phase == "run")

# Printer
st("sensor.p_state", "running"); st("sensor.p_stage", "printing"); st("sensor.p_pct", "42"); st("sensor.p_rem", "75", unit_of_measurement="min")
st("sensor.p_end", (NOW + timedelta(minutes=80)).isoformat()); st("sensor.p_task", "Testwürfel.3mf"); st("sensor.p_layer", "120"); st("sensor.p_layers", "300")
s = la.snapshot(printer(), S.get, NOW, 0)
check("Drucker druckt: Name ohne Endung, Schicht, Prozent", s.message == "Testwürfel · Schicht 120/300 · 42 %", s.message)
check("Drucker: Endzeit vom Sensor vor Restzeit", s.end_ts == int((NOW + timedelta(minutes=80)).timestamp()), s.end_ts)
st("sensor.p_state", "prepare"); st("sensor.p_stage", "heatbed_preheating")
check("Drucker Vorbereitung: Schritt als Kurztext", la.snapshot(printer(), S.get, NOW, 0).critical == "Bett heizt")
st("sensor.p_state", "failed"); st("sensor.p_stage", "idle")
s = la.snapshot(printer(), S.get, NOW, 0)
check("Drucker fehlgeschlagen: error, Text", s.phase == "error" and s.message == "Fehlgeschlagen · Testwürfel", s)
st("sensor.p_state", "offline")
check("Drucker offline = nicht erreichbar (gone)", la.snapshot(printer(), S.get, NOW, 0).phase == "gone")
st("sensor.p_state", "idle")
check("Drucker idle = off", la.snapshot(printer(), S.get, NOW, 0).phase == "off")

# Home Connect (official): program from the select key, end time as timestamp, no phase sensor
hc = Found("d-hc", "washer", "home_connect", "sehr gut", {"state": "sensor.h_state", "program": "select.h_prog", "progress": "sensor.h_pct",
                                                       "remaining": "sensor.h_end"}, name="")
st("sensor.h_state", "run"); st("select.h_prog", "laundry_care_washer_program_cotton"); st("sensor.h_pct", "35")
st("sensor.h_end", (NOW + timedelta(minutes=50)).isoformat())
s = la.snapshot(hc, S.get, NOW, 0)
check("Home Connect: Baumwolle · 35 %, Kurztext Prozent", s.message == "Baumwolle · 35 %" and s.critical == "35 %", s)
check("Home Connect: Endzeit aus Zeitstempel", s.end_ts == int((NOW + timedelta(minutes=50)).timestamp()), s.end_ts)
st("sensor.h_state", "finished")
check("Home Connect fertig", la.snapshot(hc, S.get, NOW, 0).message == "Fertig · Wäsche rausnehmen")
st("sensor.h_state", "pause")
check("Home Connect Pause (nicht minor)", la.snapshot(hc, S.get, NOW, 0).phase == "pause" and not la.snapshot(hc, S.get, NOW, 0).minor)
for raw in ("aborting", "inactive", "ready"):
    st("sensor.h_state", raw)
    check(f"Home Connect „{raw}“ = off", la.snapshot(hc, S.get, NOW, 0).phase == "off")

# Dryer (WashData): plain-text program, anti-crease
dr = Found("d-dry", "dryer", "washdata", "sehr gut", {"state": "sensor.t_state", "program": "sensor.t_prog", "progress": "sensor.t_pct"})
st("sensor.t_state", "running"); st("sensor.t_prog", "Schranktrocken"); st("sensor.t_pct", "45")
s = la.snapshot(dr, S.get, NOW, 0)
d = la.build_payload(s, "dryer", "T", "t", "/", True)["data"]
check("Trockner: Schranktrocken · 45 %, Orange, Trockner-Symbol", s.message == "Schranktrocken · 45 %" and d["notification_icon_color"] == la.COLOR["dryer"]
      and d["notification_icon"] == "mdi:tumble-dryer", (s, d))
check("Trockner ohne Restzeit/Startzeit: kein chronometer", "chronometer" not in d, d)
st("sensor.t_state", "anti_wrinkle")
check("Trockner Knitterschutz = Fertig", la.snapshot(dr, S.get, NOW, 0).message == "Fertig · Wäsche rausnehmen · Knitterschutz läuft")

# Miele (untested): states and phase per documentation
mi = Found("d-mi", "washer", "miele", "ungetestet", {"state": "sensor.m_state", "program": "sensor.m_prog", "phase": "sensor.m_phase", "remaining": "sensor.m_rem"})
st("sensor.m_state", "in_use"); st("sensor.m_prog", "Cottons"); st("sensor.m_phase", "spin"); st("sensor.m_rem", "12", unit_of_measurement="min")
s = la.snapshot(mi, S.get, NOW, 0)
check("Miele läuft: Cottons · Schleudern, Restzeit", s.message == "Cottons · Schleudern" and s.end_ts == int(NOW.timestamp()) + 720, s)
st("sensor.m_state", "program_ended")
check("Miele program_ended = Fertig", la.snapshot(mi, S.get, NOW, 0).phase == "done")
st("sensor.m_state", "failure")
check("Miele failure = Fehler", la.snapshot(mi, S.get, NOW, 0).phase == "error")
st("sensor.m_state", "not_connected")
check("Miele not_connected = nicht erreichbar (gone)", la.snapshot(mi, S.get, NOW, 0).phase == "gone")

# Finding 6: HA language German → no English texts in messages (probe, phases, done, steps)
EN_ONLY = set()
for table in (la.T, la.PHASE, la.PROGRAM, la.VAC_TEXT, la.PRINT_STEP, la.TITLE):
    for de_, en_ in table.values():
        if en_ and en_ != de_ and not any(en_ in v[0] for v in table.values()):
            EN_ONLY.add(en_.split(" {")[0])
msgs = []
for kind in la.KINDS:
    ps = la.probe_snapshot(kind, NOW, 0)
    msgs += [ps.message, ps.critical or "", ps.step or "", ps.program or "", ps.extra or "", la.TITLE[kind][0] + " · " + la.T["probe"][0]]
for raw in ("running", "ending", "paused", "user_paused", "finished", "anti_wrinkle", "delay_wait", "interrupted"):
    st("sensor.w_state", raw); st("sensor.w_phase", "spin"); st("sensor.w_rem", "20", unit_of_measurement="min")
    sn = la.snapshot(washer(), S.get, NOW, 0)
    msgs += [sn.message, sn.critical or "", sn.step or ""]
for raw in ("run", "pause", "actionrequired", "error", "finished", "delayedstart"):
    st("sensor.g_state", raw)
    sn = la.snapshot(dish(), S.get, NOW, 0)
    msgs += [sn.message, sn.critical or ""]
for raw in la.VAC_TEXT:
    st("vacuum.v", "cleaning"); st("sensor.v_status", raw)
    sn = la.snapshot(vac(), S.get, NOW, 0)
    msgs += [sn.message, sn.critical or ""]
st("vacuum.v", "docked"); st("sensor.v_status", "charging")
msgs.append(la.snapshot(vac(), S.get, NOW, 0, prev=la.Snap(phase="run")).message)
for stage in la.PRINT_STEP:
    for raw in ("prepare", "running", "pause", "finish", "failed"):
        st("sensor.p_state", raw); st("sensor.p_stage", stage); st("sensor.p_task", "unknown")
        sn = la.snapshot(printer(), S.get, NOW, 0)
        msgs += [sn.message, sn.critical or ""]
english = sorted({w for w in EN_ONLY for m in msgs if w and w in m})
check("Deutsch: keine englischen Texte in Meldungen/Probe/Phasen/Schritten", not english, english)
st("sensor.p_task", "Testwürfel.3mf")

# Probe
pr = la.build_payload(la.probe_snapshot("washer", NOW, 0), "washer", "Probe", la.PROBE_TAG, "/", False)
check("Probe: 42 %, chronometer, Hinweistext", pr["data"]["progress"] == 42 and pr["data"]["chronometer"] and "2 Minuten" in pr["message"], pr)


# ── Flow with mocked HA ──────────────────────────────────────────────────
class FakeStore:
    def __init__(self, *a, **k):
        self.data = FakeStore.seed
        self.saved = None

    async def async_load(self):
        return self.data

    def async_delay_save(self, fn, delay=0):
        self.saved = fn()


FakeStore.seed = None
la.Store = FakeStore


class Services:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    async def async_call(self, domain, service, data, blocking=False):
        if service == "kaputt":
            raise RuntimeError("weg")
        self.calls.append((service, data))

    def async_services_for_domain(self, domain):
        return {"mobile_app_handy": None, "mobile_app_tablet": None, "send_message": None}

    mock = False  # test-house service casora_mock.live_lauf present?

    def has_service(self, domain, service):
        return self.mock and (domain, service) == ("casora_mock", "live_lauf")


def make(found, seed=None):
    FakeStore.seed = seed
    hass = SimpleNamespace(states=SimpleNamespace(get=S.get), services=Services(), config=SimpleNamespace(language="de"), data={},
                           bus=SimpleNamespace(async_listen=lambda *a, **k: (lambda: None)))
    L = la.LiveActivity(hass)
    L._subscribe = lambda: None
    L._listen = lambda: None

    async def _nourl():
        L.url = "/handy/"

    L._find_url = _nourl
    L.found = found
    return L, hass.services


async def flow():
    L, svc = make([washer()])
    await L.async_start()
    L.loaded = True
    await L.async_set({"targets": ["notify.mobile_app_handy", "notify.mobile_app_tablet"]})
    check("ohne laufendes Gerät nichts gesendet", not svc.calls, svc.calls)
    st("sensor.w_state", "running"); st("sensor.w_prog", "Baumwolle 40"); st("sensor.w_phase", "wash"); st("sensor.w_pct", "10")
    st("sensor.w_rem", "80", unit_of_measurement="min")
    await L._evaluate("d-washer", "state")
    check("Start: je Empfänger eine laute Meldung", len(svc.calls) == 2 and all(not c[1]["data"]["silent"] for c in svc.calls), svc.calls)
    check("Start: Titel = Gerätename", svc.calls[0][1]["title"] == "Waschmaschine Test", svc.calls[0][1])
    check("aktiv gemerkt und gespeichert", "d-washer" in L.active and L.store.saved["active"]["d-washer"]["phase"] == "run", L.store.saved)
    svc.calls.clear()
    await L._evaluate("d-washer", "state")
    check("gleicher Stand: nichts gesendet", not svc.calls, svc.calls)
    st("sensor.w_pct", "25")
    await L._evaluate("d-washer", "state")
    check("Progress alone: not sent at once (follows on the tick)", not svc.calls, svc.calls)
    L.active["d-washer"]["sent_at"] -= 10 * 60
    await L._evaluate("d-washer", "tick")
    check("Fortschritt: leise", len(svc.calls) == 2 and svc.calls[0][1]["data"]["silent"] is True and svc.calls[0][1]["data"]["progress"] == 25, svc.calls)
    svc.calls.clear()
    L.active["d-washer"]["sent_at"] -= 20 * 60
    await L._evaluate("d-washer", "tick")
    check("Takt: leise nachgezogen", len(svc.calls) == 2 and svc.calls[0][1]["data"]["silent"] is True, svc.calls)
    svc.calls.clear()
    await L._evaluate("d-washer", "tick")
    check("Takt zu früh: nichts", not svc.calls)
    st("sensor.w_state", "user_paused")
    await L._evaluate("d-washer", "state")
    check("Pause: laut", len(svc.calls) == 2 and svc.calls[0][1]["data"]["silent"] is False and svc.calls[0][1]["data"]["critical_text"] == "Pause", svc.calls)
    svc.calls.clear()
    st("sensor.w_state", "running")
    await L._evaluate("d-washer", "state")
    check("Resume after a pause: silent", svc.calls and svc.calls[0][1]["data"]["silent"] is True, svc.calls)
    svc.calls.clear()
    st("sensor.w_state", "finished"); st("sensor.w_pct", "100")
    await L._evaluate("d-washer", "state")
    check("Fertig: laut, grün", svc.calls and svc.calls[0][1]["data"]["silent"] is False and svc.calls[0][1]["data"]["notification_icon_color"] == la.COLOR["done"])
    svc.calls.clear()
    await L._evaluate("d-washer", "tick")
    check("Fertig bleibt vor Ablauf stehen", not svc.calls)
    L.active["d-washer"]["done_at"] -= 31 * 60
    await L._evaluate("d-washer", "tick")
    check("nach Fertig-Dauer: clear_notification mit Tag", len(svc.calls) == 2 and svc.calls[0][1]["message"] == "clear_notification"
          and svc.calls[0][1]["data"]["tag"] == "casora-live-washer-d-washer", svc.calls)
    check("nicht mehr aktiv", "d-washer" not in L.active)
    svc.calls.clear()
    await L._evaluate("d-washer", "state")
    check("Fertig schon gezeigt: startet nicht neu", not svc.calls and L.muted.get("d-washer") == "done")
    st("sensor.w_state", "off")
    await L._evaluate("d-washer", "state")
    check("aus: nichts (war nicht aktiv), Stumm aufgehoben", not svc.calls and "d-washer" not in L.muted)
    # Off mid-run → clear
    st("sensor.w_state", "running")
    await L._evaluate("d-washer", "state")
    svc.calls.clear()
    st("sensor.w_state", "idle")
    await L._evaluate("d-washer", "state")
    check("Gerät aus/bereit während Aktivität: clear", len(svc.calls) == 2 and svc.calls[0][1]["message"] == "clear_notification")
    # Log
    check("Protokoll gefüllt, neueste zuerst, höchstens 20", 0 < len(L.payload()["log"]) <= 20 and L.payload()["log"][0]["clear"] is True)
    check("payload: Geräte mit Einstellungen und Stufe", L.payload()["found"][0]["settings"]["done_min"] == 10 and L.payload()["found"][0]["grade"] == "sehr gut")
    check("notify_services nur mobile_app", L.payload()["notify_services"] == ["notify.mobile_app_handy", "notify.mobile_app_tablet"])
    # Test-run button: only with the test-house service and a known state entity
    check("ohne Testhaus: test_runs leer", L.payload()["test_runs"] == {})
    svc.mock = True
    L.hass.data["casora_mock_live"] = {"sensor.w_state": "waschmaschine_a", "sensor.fremd": "trockner"}
    check("Testhaus: test_runs device_id → Gerät", L.payload()["test_runs"] == {"d-washer": "waschmaschine_a"}, L.payload()["test_runs"])
    svc.mock = False

    # Switch device off → clear at once; deselect recipient → clear only there
    st("sensor.w_state", "running")
    await L._evaluate("d-washer", "state")
    svc.calls.clear()
    await L.async_set({"devices": {"d-washer": {"on": False}}})
    check("Gerät aus: clear an alle, nicht mehr aktiv", len(svc.calls) == 2 and svc.calls[0][1]["message"] == "clear_notification" and not L.active)
    check("Einstellung gespeichert", L.cfg["devices"]["d-washer"] == {"on": False})
    await L.async_set({"devices": {"d-washer": {"on": True}}})
    check("Standard wird nicht gespeichert, Gerät startet leise neu", "d-washer" not in L.cfg["devices"] and "d-washer" in L.active)
    svc.calls.clear()
    await L.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Empfänger abgewählt: clear nur an das Tablet", [c for c in svc.calls if c[1].get("message") == "clear_notification"] == [
        ("mobile_app_tablet", la.clear_payload("casora-live-washer-d-washer"))], svc.calls)
    svc.calls.clear()
    await L.async_set({"targets": []})
    check("alle Empfänger weg = aus: clear, nichts aktiv", svc.calls and svc.calls[0][1]["message"] == "clear_notification" and not L.active)
    # Input validation
    for bad in ({"targets": ["notify.x y"]}, {"devices": {"d": {"foo": 1}}}, {"devices": {"d": {"done_min": "x"}}}, {"devices": {"d": {"quiet": 3}}}):
        try:
            la.merge_settings(L.cfg, bad)
            check(f"abgelehnt: {bad}", False)
        except ValueError:
            check(f"abgelehnt: {bad}", True)
    m = la.merge_settings(L.cfg, {"devices": {"d": {"done_min": 999, "interval_min": 0}}})
    check("Grenzen: 1–240 / 1–60 Min.", m["devices"]["d"] == {"done_min": 240, "interval_min": 1}, m)
    # A broken recipient does not stop the others
    await L.async_set({"targets": ["notify.kaputt", "notify.mobile_app_handy"]})
    svc.calls.clear()
    st("sensor.w_state", "running"); st("sensor.w_pct", "10")
    L.active.clear(); L.snaps.clear()
    await L._evaluate("d-washer", "state")
    check("kaputter Empfänger: der andere bekommt die Meldung", [c[0] for c in svc.calls] == ["mobile_app_handy"], svc.calls)

    # Restart: silently resume running ones, clear orphaned ones
    seed = {"targets": ["notify.mobile_app_handy"], "devices": {},
            "active": {"d-washer": {"tag": "casora-live-washer-d-washer", "kind": "washer", "phase": "run", "sent_at": 0},
                       "d-weg": {"tag": "casora-live-dryer-d-weg", "kind": "dryer", "phase": "run", "sent_at": 0}}}
    L2, svc2 = make([washer()], seed)
    await L2.async_start()

    async def _rescan():
        L2._subscribe()

    L2.rescan = _rescan
    await L2._resume()
    kinds = [(c[1].get("message") == "clear_notification", c[1]["data"]["tag"], c[1]["data"].get("silent")) for c in svc2.calls]
    check("Neustart: verwaistes Gerät abgeräumt", (True, "casora-live-dryer-d-weg", None) in kinds, kinds)
    check("Neustart: laufende Waschmaschine leise neu gesendet", (False, "casora-live-washer-d-washer", True) in kinds, kinds)
    check("Neustart: Verwaistes vergessen, Laufendes aktiv", list(L2.active) == ["d-washer"], L2.active)
    # Restart, device off in the meantime → clear
    st("sensor.w_state", "off")
    L3, svc3 = make([washer()], seed)
    await L3.async_start()
    L3.rescan = _rescan
    await L3._resume()
    check("Neustart: inzwischen aus → clear, nichts aktiv", all(c[1].get("message") == "clear_notification" for c in svc3.calls) and not L3.active, svc3.calls)

    # One step changes several entities at once: parallel evaluations still send only one clear
    st("sensor.w_state", "running"); st("sensor.w_pct", "50")
    await L2._evaluate("d-washer", "state")
    svc2.calls.clear()
    st("sensor.w_state", "off"); st("sensor.w_pct", "0")
    await asyncio.gather(*[L2._evaluate("d-washer", "state") for _ in range(6)])
    check("6 gleichzeitige Zustandsänderungen → genau ein clear_notification, mit Titel im Protokoll",
          [c[1]["message"] for c in svc2.calls] == ["clear_notification"] and L2.log[-1]["title"] == "Waschmaschine Test", svc2.calls)

    # Switching on/restart with an old done/error: do not report after the fact, only the next run
    st("sensor.w_state", "finished"); st("sensor.w_pct", "100")
    L6, svc6 = make([washer()])
    await L6.async_start()
    await L6.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Einschalten bei „fertig“: nichts gesendet, stumm bis zum nächsten Zustand", not svc6.calls and L6.muted.get("d-washer") == "done", svc6.calls)
    st("sensor.w_state", "running"); st("sensor.w_pct", "5")
    await L6._evaluate("d-washer", "state")
    check("nächster Lauf startet wieder laut", svc6.calls and svc6.calls[0][1]["data"]["silent"] is False, svc6.calls)

    # Without recipients nothing happens, even when devices are running
    L4, svc4 = make([washer()])
    await L4.async_start()
    st("sensor.w_state", "running")
    await L4._evaluate("d-washer", "state")
    check("ohne Empfänger: nichts", not svc4.calls and not L4.active)

    # English: title from the kind when the device has no name
    L5, svc5 = make([Found("d-x", "dryer", "washdata", "sehr gut", {"state": "sensor.w_state", "progress": "sensor.w_pct"})])
    L5.hass.config.language = "en"
    await L5.async_start()
    await L5.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Englisch: Titel „Dryer“, Text englisch", svc5.calls and svc5.calls[0][1]["title"] == "Dryer" and svc5.calls[0][1]["message"].startswith("Running"), svc5.calls)

    # Probe: to the stored recipients, with probe tag
    class _Later:
        fn = None

        def __call__(self, hass, delay, fn):
            _Later.fn = fn
            return lambda: None

    import homeassistant.helpers.event as ev
    from homeassistant.core import is_callback
    ev.async_call_later = _Later()
    tasks: list = []
    L5.hass.async_create_task = lambda coro, eager_start=False: tasks.append(asyncio.ensure_future(coro))
    svc5.calls.clear()
    r = await L5.async_probe("d-x")
    check("Probe: gesendet, Probe-Tag, Beispielwerte", r == {"ok": True, "targets": 1} and svc5.calls[0][1]["data"]["tag"] == la.PROBE_TAG
          and svc5.calls[0][1]["data"]["progress"] == 42 and svc5.calls[0][1]["title"] == "Dryer · Test", svc5.calls)
    # Finding 4: the timer callback must run in the event loop (@callback) – otherwise HA calls it in a worker thread
    # and async_create_task raises; the probe's clear never arrived.
    check("Probe-Timer: Rückruf ist @callback (Event-Loop, kein Worker-Thread)", _Later.fn is not None and is_callback(_Later.fn), _Later.fn)
    svc5.calls.clear()
    _Later.fn(NOW)
    await asyncio.gather(*tasks)
    check("Probe-Timer: Clear der Probe kommt an", [c[1]["message"] for c in svc5.calls] == ["clear_notification"]
          and svc5.calls[0][1]["data"]["tag"] == la.PROBE_TAG, svc5.calls)

    # ── Finding 1: device off → save → on → save → reload = on ──
    L7, svc7 = make([washer()])
    await L7.async_start()
    full = lambda on: {"d-washer": {"on": on, "done_min": 10, "quiet": True, "interval_min": 10}}  # noqa: E731
    await L7.async_set({"targets": ["notify.mobile_app_handy"], "devices": full(False), "devices_replace": True})
    check("Fund 1: aus gespeichert", L7.cfg["devices"] == {"d-washer": {"on": False}}, L7.cfg)
    await L7.async_set({"targets": ["notify.mobile_app_handy"], "devices": full(True), "devices_replace": True})
    check("Fund 1: wieder an → Eintrag weg (Standard)", L7.cfg["devices"] == {}, L7.cfg)
    L8, _ = make([washer()], dict(L7.store.saved))
    await L8.async_start()
    check("Fund 1: nach Neuladen an", L8.enabled("d-washer") and L8.payload()["found"][0]["settings"]["on"] is True, L8.cfg)
    m = la.merge_settings({"targets": [], "devices": {"a": {"on": False}, "b": {"quiet": False}}},
                          {"devices": {"b": {"on": True, "quiet": False}}, "devices_replace": True})
    check("Fund 1: Ersetzen – nicht genannte Geräte fallen auf Standard", m["devices"] == {"b": {"quiet": False}}, m)

    # ── Finding 2: unreachable is never "done"; a short outage continues silently ──
    st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning"); st("sensor.v_room", "Küche"); st("sensor.v_pct", "40")
    L9, svc9 = make([vac()])
    await L9.async_start()
    await L9.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Sauger läuft: Aktivität beim Einschalten (leise) aufgenommen", L9.active.get("d-vac", {}).get("phase") == "run" and len(svc9.calls) == 1, svc9.calls)
    svc9.calls.clear()
    st("vacuum.v", "unavailable"); st("sensor.v_status", "unavailable")
    await L9._evaluate("d-vac", "state")
    check("Sauger nicht erreichbar: nichts gesendet, kein Fertig, bleibt aktiv", not svc9.calls and L9.active["d-vac"]["phase"] == "run"
          and L9.payload()["found"][0]["phase"] == "gone", (svc9.calls, L9.active))
    st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning"); st("sensor.v_pct", "45")
    await L9._evaluate("d-vac", "state")
    check("Sauger wieder da: leise weiter, nicht laut neu", len(svc9.calls) == 1 and svc9.calls[0][1]["data"]["silent"] is True
          and "gone_at" not in L9.active["d-vac"], svc9.calls)
    svc9.calls.clear()
    st("vacuum.v", "unavailable"); st("sensor.v_status", "unavailable")
    await L9._evaluate("d-vac", "state")
    st("vacuum.v", "docked"); st("sensor.v_status", "charging")
    await L9._evaluate("d-vac", "state")
    check("Ausfall, danach angedockt: leise beendet, kein „Fertig“", [c[1]["message"] for c in svc9.calls] == ["clear_notification"]
          and not any(e["phase"] == "done" for e in L9.log), svc9.calls)
    # Outage too long: clear silently
    st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning")
    await L9._evaluate("d-vac", "state")
    svc9.calls.clear()
    st("vacuum.v", "unavailable"); st("sensor.v_status", "unavailable")
    await L9._evaluate("d-vac", "state")
    await L9._evaluate("d-vac", "tick")
    check("Ausfall kurz, Takt: noch nichts", not svc9.calls and "d-vac" in L9.active)
    L9.active["d-vac"]["gone_at"] -= la.GONE_MAX_S + 1
    await L9._evaluate("d-vac", "tick")
    check("Ausfall länger als GONE_MAX: leise abgeräumt", [c[1]["message"] for c in svc9.calls] == ["clear_notification"] and not L9.active, svc9.calls)
    # Washer: running → unavailable → running: no new loud start
    st("sensor.w_state", "running"); st("sensor.w_pct", "30")
    L10, svc10 = make([washer()])
    await L10.async_start()
    await L10.async_set({"targets": ["notify.mobile_app_handy"]})
    svc10.calls.clear()
    st("sensor.w_state", "unavailable")
    await L10._evaluate("d-washer", "state")
    check("Waschmaschine nicht erreichbar: kein Clear, kein Fertig", not svc10.calls and "d-washer" in L10.active, svc10.calls)
    st("sensor.w_state", "running"); st("sensor.w_pct", "35")
    await L10._evaluate("d-washer", "state")
    check("Waschmaschine wieder da: leise weiter", len(svc10.calls) == 1 and svc10.calls[0][1]["data"]["silent"] is True, svc10.calls)
    # Not active, outage, then "finished" (old done after the integration restarted): do not report
    L10.active.clear(); svc10.calls.clear()
    st("sensor.w_state", "unavailable")
    await L10._evaluate("d-washer", "state")
    st("sensor.w_state", "finished")
    await L10._evaluate("d-washer", "state")
    check("nach Ausfall altes „finished“: nichts gemeldet", not svc10.calls and L10.muted.get("d-washer") == "done", svc10.calls)

    # ── Finding 5: restart, vacuum docked in the meantime → clear, never "done" ──
    st("vacuum.v", "docked"); st("sensor.v_status", "charging")
    seedv = {"targets": ["notify.mobile_app_handy"], "devices": {},
             "active": {"d-vac": {"tag": "casora-live-vacuum-d-vac", "kind": "vacuum", "phase": "run", "sent_at": 0,
                                  "since": NOW.isoformat()}}}
    L11, svc11 = make([vac()], seedv)
    await L11.async_start()

    async def _rescan11():
        pass

    L11.rescan = _rescan11
    await L11._resume()
    check("Neustart, Sauger angedockt: nur Clear, kein Fertig", [c[1]["message"] for c in svc11.calls] == ["clear_notification"]
          and not L11.active, svc11.calls)
    # Restart, vacuum still cleaning: silently resumed
    st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning")
    L12, svc12 = make([vac()], seedv)
    await L12.async_start()
    L12.rescan = _rescan11
    await L12._resume()
    check("Neustart, Sauger reinigt: leise wieder aufgenommen", len(svc12.calls) == 1 and svc12.calls[0][1]["data"]["silent"] is True, svc12.calls)

    # ── Dishwasher Home Connect: 60 s after „Fertig“ → „Bereit“ – done stays until the done duration ──
    st("sensor.g_state", "run"); st("sensor.g_prog", "dishcare_dishwasher_program_eco50"); st("sensor.g_phase", "mainwash")
    st("sensor.g_pct", "50"); st("sensor.g_rem", "60", unit_of_measurement="min"); st("sensor.g_start", "0", unit_of_measurement="min")
    L15, svc15 = make([dish()])
    await L15.async_start()
    await L15.async_set({"targets": ["notify.mobile_app_handy"]})
    st("sensor.g_state", "finished")
    await L15._evaluate("d-dish", "state")
    svc15.calls.clear()
    st("sensor.g_state", "ready")
    await L15._evaluate("d-dish", "state")
    await L15._evaluate("d-dish", "tick")
    check("Spüler: Bereit nach Fertig – Fertig bleibt stehen", not svc15.calls and L15.active["d-dish"]["phase"] == "done", svc15.calls)
    L15.active["d-dish"]["done_at"] -= 10 * 60
    await L15._evaluate("d-dish", "tick")
    check("Spüler: nach Fertig-Dauer abgeräumt", [c[1]["message"] for c in svc15.calls] == ["clear_notification"] and not L15.active, svc15.calls)
    st("sensor.g_state", "run")
    await L15._evaluate("d-dish", "state")
    check("Spüler: neuer Lauf startet wieder", L15.active.get("d-dish", {}).get("phase") == "run")

    # ── WashData: power blip "starting" after done → no loud „Läuft“, done stays ──
    st("sensor.w_state", "running"); st("sensor.w_pct", "90")
    L16, svc16 = make([washer()])
    await L16.async_start()
    await L16.async_set({"targets": ["notify.mobile_app_handy"]})
    st("sensor.w_state", "anti_wrinkle")
    await L16._evaluate("d-washer", "state")
    svc16.calls.clear()
    st("sensor.w_state", "starting")
    await L16._evaluate("d-washer", "state")
    st("sensor.w_state", "off")
    await L16._evaluate("d-washer", "state")
    check("WashData: starting nach Fertig, dann off – nichts gesendet, Fertig bleibt", not svc16.calls
          and L16.active["d-washer"]["phase"] == "done", svc16.calls)
    L16b, svc16b = make([washer("d-w2")])
    st("sensor.w_state", "starting")
    await L16b.async_start()
    await L16b.async_set({"targets": ["notify.mobile_app_handy"]})
    check("WashData: starting allein startet keine Aktivität", not svc16b.calls and not L16b.active, svc16b.calls)
    st("sensor.w_state", "running")
    await L16b._evaluate("d-w2", "state")
    check("WashData: erst running startet", L16b.active.get("d-w2", {}).get("phase") == "run")

    # ── WashData: short pause → resume: both silent ──
    svc16b.calls.clear()
    st("sensor.w_state", "paused")
    await L16b._evaluate("d-w2", "state")
    st("sensor.w_state", "running")
    await L16b._evaluate("d-w2", "state")
    check("WashData: kurze Pause und weiter – beides leise", len(svc16b.calls) == 2
          and all(c[1]["data"]["silent"] is True for c in svc16b.calls), svc16b.calls)

    # ── Restart: program was running, now done → loud ──
    st("sensor.w_state", "finished")
    seedw = {"targets": ["notify.mobile_app_handy"], "devices": {},
             "active": {"d-washer": {"tag": "casora-live-washer-d-washer", "kind": "washer", "phase": "run", "sent_at": 0,
                                     "since": NOW.isoformat()}}}
    L17, svc17 = make([washer()], seedw)
    await L17.async_start()
    L17.rescan = _rescan11
    await L17._resume()
    check("Neustart: lief, jetzt Fertig – laut gemeldet", len(svc17.calls) == 1 and svc17.calls[0][1]["data"]["silent"] is False
          and L17.active["d-washer"]["phase"] == "done", svc17.calls)

    # ── Printer: new layer/percent not at once, only on the tick; new step at once ──
    st("sensor.p_state", "running"); st("sensor.p_stage", "printing"); st("sensor.p_pct", "10"); st("sensor.p_layer", "10"); st("sensor.p_layers", "300")
    L18, svc18 = make([printer()])
    await L18.async_start()
    await L18.async_set({"targets": ["notify.mobile_app_handy"]})
    svc18.calls.clear()
    for n in range(11, 40):
        st("sensor.p_layer", str(n)); st("sensor.p_pct", str(n))
        await L18._evaluate("d-print", "state")
    check("Drucker: Schichten lösen keine Meldung aus", not svc18.calls, len(svc18.calls))
    L18.active["d-print"]["sent_at"] -= 10 * 60
    await L18._evaluate("d-print", "tick")
    check("Drucker: Takt sendet aktuellen Stand", len(svc18.calls) == 1 and "Schicht 39/300" in svc18.calls[0][1]["message"], svc18.calls)
    for n in range(40, 60):  # AMS: printing ↔ changing_filament on every layer
        st("sensor.p_stage", "changing_filament" if n % 2 else "printing"); st("sensor.p_layer", str(n))
        await L18._evaluate("d-print", "state")
    check("Printer: routine steps (AMS) not sent at once", len(svc18.calls) == 1, svc18.calls)
    st("sensor.p_state", "pause"); st("sensor.p_stage", "paused_filament_runout")
    await L18._evaluate("d-print", "state")
    check("Printer: filament runout (pause) loud at once", len(svc18.calls) == 2 and svc18.calls[1][1]["data"]["silent"] is False, svc18.calls)
    st("sensor.p_state", "running"); st("sensor.p_stage", "printing")
    await L18._evaluate("d-print", "state")
    check("Printer: resume after pause silent", len(svc18.calls) == 3 and svc18.calls[2][1]["data"]["silent"] is True, svc18.calls)

    # ── Scheduled start: start time appears at once, does not drift, delay → run silent ──
    st("sensor.g_state", "delayedstart"); st("sensor.g_start", "0", unit_of_measurement="min"); st("sensor.g_pct", "0")
    L22, svc22 = make([dish("d-d2")])
    await L22.async_start()
    await L22.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Delay: picked up when switching on (silently, like any running device)", len(svc22.calls) == 1, svc22.calls)
    t0 = dt_util.utcnow() - timedelta(minutes=20)
    st("sensor.g_start", "150", unit_of_measurement="min"); S["sensor.g_start"].last_updated = t0
    await L22._evaluate("d-d2", "state")
    check("Delay: start time sent at once", len(svc22.calls) == 2 and svc22.calls[1][1]["data"].get("when") == int(t0.timestamp()) + 9000, svc22.calls)
    await L22._evaluate("d-d2", "state")
    L22.active["d-d2"]["sent_at"] -= 10 * 60
    await L22._evaluate("d-d2", "tick")
    check("Delay: start time does not drift with a static sensor", svc22.calls[-1][1]["data"].get("when") == int(t0.timestamp()) + 9000, svc22.calls[-1])
    st("sensor.g_state", "run"); st("sensor.g_start", "0", unit_of_measurement="min")
    await L22._evaluate("d-d2", "state")
    check("Delay → run: silent (no 2 am sound)", svc22.calls[-1][1]["data"]["silent"] is True and L22.active["d-d2"]["phase"] == "run", svc22.calls[-1])

    # ── Roborock 18.10.: station briefly "charging", then mop wash, docking, charging → a single loud done ──
    st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning"); st("sensor.v_room", "Wohnzimmer"); st("sensor.v_pct", "92")
    st("sensor.v_area", "15", unit_of_measurement="m²"); st("sensor.v_time", "1680", unit_of_measurement="s")
    L14, svc14 = make([vac()])
    await L14.async_start()
    await L14.async_set({"targets": ["notify.mobile_app_handy"]})
    svc14.calls.clear()
    for vs, ss in (("returning", "returning_home"), ("docked", "charging"), ("docked", "washing_the_mop"),
                   ("docked", "docking"), ("docked", "charging")):
        st("vacuum.v", vs); st("sensor.v_status", ss)
        await L14._evaluate("d-vac", "state")
    check("Roborock: settle end has its own check timer (no wait for the minute tick)", "settle:d-vac" in L14._timers, L14._timers)
    check("Roborock: während Station kein Fertig, nichts laut", not any(c[1]["data"].get("silent") is False for c in svc14.calls)
          and L14.active["d-vac"]["phase"] == "run", svc14.calls)
    L14.snaps["d-vac"].rest_since -= la.VAC_SETTLE_S
    await L14._evaluate("d-vac", "tick")
    loud = [c[1]["message"] for c in svc14.calls if c[1]["data"].get("silent") is False]
    check("Roborock: nach Ruhezeit genau ein lautes Fertig (Takt wartet nicht)", loud == ["Fertig · 15 m² in 28 Min."], svc14.calls)
    st("sensor.v_status", "washing_the_mop")
    await L14._evaluate("d-vac", "state")
    st("sensor.v_status", "charging")
    await L14._evaluate("d-vac", "state")
    check("Roborock: Mopp waschen nach Fertig – kein zweites Fertig", len([c for c in svc14.calls if c[1]["data"].get("silent") is False]) == 1
          and L14.active["d-vac"]["phase"] == "done", svc14.calls)

    # ── Vacuum: station work after the "done" was cleared → no new loud run ──
    L14.active["d-vac"]["done_at"] -= 10 * 60
    await L14._evaluate("d-vac", "tick")
    check("Roborock: done cleared after done_min", "d-vac" not in L14.active and L14.muted.get("d-vac") == "done", L14.active)
    svc14.calls.clear()
    for ss in ("washing_the_mop", "docking", "charging"):
        st("sensor.v_status", ss)
        await L14._evaluate("d-vac", "state")
    L14.snaps["d-vac"].rest_since = None
    await L14._evaluate("d-vac", "tick")
    check("Roborock: station work after clear – nothing sent", not svc14.calls and "d-vac" not in L14.active, svc14.calls)

    # ── Vacuum: restart while "done" is shown, then station work → done stays, nothing loud ──
    st("vacuum.v", "docked"); st("sensor.v_status", "charging")
    seedd = {"targets": ["notify.mobile_app_handy"], "devices": {},
             "active": {"d-vac": {"tag": "casora-live-vacuum-d-vac", "kind": "vacuum", "phase": "done", "sent_at": 0,
                                  "done_at": dt_util.utcnow().timestamp(), "since": NOW.isoformat()}}}
    L19, svc19 = make([vac()], seedd)
    await L19.async_start()
    L19.rescan = _rescan11
    await L19._resume()
    st("sensor.v_status", "washing_the_mop")
    await L19._evaluate("d-vac", "state")
    st("sensor.v_status", "charging")
    await L19._evaluate("d-vac", "state")
    check("Restart with done shown: station work keeps done, nothing sent", not svc19.calls
          and L19.active["d-vac"]["phase"] == "done", svc19.calls)

    # ── WashData: done cleared (muted), then anti-crease pulse starting → anti_wrinkle: no second loud done ──
    st("sensor.w_state", "running")
    L20, svc20 = make([washer()])
    await L20.async_start()
    await L20.async_set({"targets": ["notify.mobile_app_handy"]})
    st("sensor.w_state", "anti_wrinkle")
    await L20._evaluate("d-washer", "state")
    L20.active["d-washer"]["done_at"] -= 10 * 60
    await L20._evaluate("d-washer", "tick")
    svc20.calls.clear()
    for ws_ in ("starting", "anti_wrinkle"):
        st("sensor.w_state", ws_)
        await L20._evaluate("d-washer", "state")
    check("WashData: pulse after cleared done – no second done", not svc20.calls and L20.muted.get("d-washer") == "done", svc20.calls)

    # ── Device vanished from discovery: activity cleared after GONE_MAX_S, not at once ──
    st("sensor.w_state", "running")
    L21, svc21 = make([washer()])
    await L21.async_start()
    await L21.async_set({"targets": ["notify.mobile_app_handy"]})
    svc21.calls.clear()
    L21.found = []
    await L21._evaluate("d-washer", "tick")
    check("Vanished device: kept at first", not svc21.calls and "d-washer" in L21.active, svc21.calls)
    L21.active["d-washer"]["orphan_at"] -= la.GONE_MAX_S + 1
    await L21._evaluate("d-washer", "tick")
    check("Vanished device: cleared after GONE_MAX_S", [c[1]["message"] for c in svc21.calls] == ["clear_notification"]
          and not L21.active, svc21.calls)

    # ── State changes are collected: three entity updates → one evaluation ──
    seen: list = []
    orig_eval = L21._evaluate

    async def _count(dev, reason):
        seen.append((dev, reason))

    L21._evaluate = _count
    L21.hass.async_create_task = lambda coro, eager_start=False: asyncio.ensure_future(coro)
    for _ in range(3):
        L21._later("state:d-washer", la.STATE_COLLECT_S, "d-washer")
    _Later.fn(None)
    await asyncio.sleep(0)
    check("State changes collected: one evaluation", seen == [("d-washer", "state")] and not L21._timers, (seen, L21._timers))
    L21._evaluate = orig_eval

    # ── Finding 7: vacuum without cleaning time → "running since" from the start of the activity ──
    vx = Found("d-vx", "vacuum", "vacuum", "sehr gut", {"state": "vacuum.vx"}, name="Sauger X")
    st("vacuum.vx", "cleaning")
    L13, svc13 = make([vx])
    await L13.async_start()
    await L13.async_set({"targets": ["notify.mobile_app_handy"]})
    d13 = svc13.calls[0][1]["data"] if svc13.calls else {}
    check("Sauger ohne Felder: chronometer ab Start", d13.get("chronometer") is True and abs(d13.get("when", 0) - dt_util.utcnow().timestamp()) < 5, d13)

    # Unloading the integration: nothing evaluates afterwards
    svc5.calls.clear()
    L5.stop()
    st("sensor.w_state", "running"); st("sensor.w_pct", "77")
    await L5._evaluate("d-x", "state")
    check("nach stop(): keine Sendung mehr", not svc5.calls and L5.loaded is False, svc5.calls)


# ── Device color: chosen color for running/short pause, signal colors stay ──
_vorher = dict(S)
st("sensor.w_state", "running"); st("sensor.w_pct", "30")
s = la.snapshot(washer(), S.get, NOW, 0)
d = la.build_payload(s, "washer", "W", "t", "/", True, "violet")["data"]
check("Farbe: violett beim Laufen (Symbol + Balken)", d["notification_icon_color"] == la.PALETTE["violet"] == d["progress_bar_color"], d)
d = la.build_payload(s, "washer", "W", "t", "/", True, "auto")["data"]
check("Farbe: auto = Farbe der Geräteart", d["notification_icon_color"] == la.COLOR["washer"], d)
st("sensor.w_state", "finished"); st("sensor.w_pct", "100")
d = la.build_payload(la.snapshot(washer(), S.get, NOW, 0), "washer", "W", "t", "/", False, "violet")["data"]
check("Farbe: Fertig bleibt grün", d["notification_icon_color"] == la.COLOR["done"], d)
st("sensor.w_state", "user_paused"); st("sensor.w_pct", "40")
d = la.build_payload(la.snapshot(washer(), S.get, NOW, 0), "washer", "W", "t", "/", False, "violet")["data"]
check("Farbe: Pause bleibt honig", d["notification_icon_color"] == la.COLOR["pause"], d)
m = la.merge_settings({"targets": [], "devices": {}}, {"devices": {"a": {"color": "teal"}, "b": {"color": "auto"}}})
check("Farbe: gespeichert, auto = Standard (kein Eintrag)", m["devices"] == {"a": {"color": "teal"}}, m)
check("Farbe: device_settings liefert auto als Standard", la.device_settings({"devices": {}}, "x")["color"] == "auto")
for bad in ("#ff0000", "pink", 3, True):
    try:
        la.merge_settings({"targets": [], "devices": {}}, {"devices": {"a": {"color": bad}}})
        check(f"Farbe abgelehnt: {bad!r}", False)
    except ValueError:
        check(f"Farbe abgelehnt: {bad!r}", True)
S.clear(); S.update(_vorher)

asyncio.run(flow())

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
