"""Live-Aktivitäten (live_activity.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/live_activity_test.py

Schnappschüsse je Geräteart (WashData, Home Connect WS, Saugroboter, Drucker), Payload wie die
HA-App sie erwartet (live_update, progress, chronometer, Farben, silent), Deutsch/Englisch, und der
Ablauf mit nachgebautem HA: Start laut, Zwischenstand leise, Pause laut, Aus = clear_notification,
Fertig bleibt bis zur Fertig-Dauer, Neustart nimmt Laufendes leise wieder auf und räumt Verwaistes ab,
Ausschalten (Gerät/Empfänger) beendet sofort, Einstellungen werden geprüft.
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
    return Found(dev, "dishwasher", "home_connect_alt", "sehr gut", {"state": "sensor.g_state", "program": "sensor.g_prog", "phase": "sensor.g_phase",
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


# ── Schnappschüsse ───────────────────────────────────────────────────────
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

# Ohne Restzeit (noch kein Profil): „Läuft“, chronometer ab Start
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
for raw in ("unknown", "unavailable", "", "irgendwas_neues", "idle", "off", "clean_x"):
    st("sensor.w_state", raw)
    check(f"„{raw}“ ist off, nie Fertig", la.snapshot(washer(), S.get, NOW, 0).phase == "off")

# Geschirrspüler (Home Connect WS): Stunden, Programmname, Startverzögerung
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
st("sensor.g_state", "actionrequired")
s = la.snapshot(dish(), S.get, NOW, 0)
d = la.build_payload(s, "dishwasher", "G", "t", "/", False)["data"]
check("Eingriff: rot, relevance 0.8", s.phase == "attn" and d["notification_icon_color"] == la.COLOR["attn"] and d["relevance_score"] == 0.8, d)
check("Programmname aus Schlüssel", la.program_name("laundry_care_washer_program_delicates_silk", 1) == "Delicates"
      and la.program_name("laundry_care_dryer_program_towels", 0) == "Towels" and la.program_name("Baumwolle 40", 0) == "Baumwolle 40")

# Saugroboter: Raum als Hauptwert, Fertig beim Andocken mit Fläche/Dauer, bleibt stehen
st("vacuum.v", "cleaning"); st("sensor.v_status", "segment_cleaning"); st("sensor.v_room", "Küche"); st("sensor.v_pct", "40")
st("sensor.v_area", "32.4", unit_of_measurement="m²"); st("sensor.v_time", "2700", unit_of_measurement="s"); st("sensor.v_err", "none")
s = la.snapshot(vac(), S.get, NOW, 0)
check("Sauger reinigt: Reinigt · Küche · 40 %, Kurztext Raum", s.phase == "run" and s.message == "Reinigt · Küche · 40 %" and s.critical == "Küche", s)
st("sensor.v_status", "washing_the_mop")
check("Mopp waschen: Text statt Raum", la.snapshot(vac(), S.get, NOW, 0).critical == "Mopp waschen")
st("vacuum.v", "docked"); st("sensor.v_status", "charging")
s2 = la.snapshot(vac(), S.get, NOW, 0, prev=s)
check("Andocken nach Reinigung = Fertig · 32 m² in 45 Min.", s2.phase == "done" and s2.message == "Fertig · 32 m² in 45 Min.", s2)
s3 = la.snapshot(vac(), S.get, NOW, 0, prev=s2)
check("Fertig bleibt beim Sauger stehen", s3.phase == "done" and s3.extra == s2.extra, s3)
check("ohne vorherigen Lauf: Station = off", la.snapshot(vac(), S.get, NOW, 0, prev=None).phase == "off")
st("sensor.v_status", "error"); st("sensor.v_err", "wheel_stuck")
check("Sauger Fehler mit Grund", la.snapshot(vac(), S.get, NOW, 0).message == "Fehler · wheel stuck")
st("sensor.v_status", "unavailable"); st("vacuum.v", "returning")
check("ohne Status-Sensor: vacuum-Zustand returning", la.snapshot(vac(), S.get, NOW, 0).critical == "Zurück zur Station")

# Drucker
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
check("Drucker offline = off", la.snapshot(printer(), S.get, NOW, 0).phase == "off")

# Probe
pr = la.build_payload(la.probe_snapshot("washer", NOW, 0), "washer", "Probe", la.PROBE_TAG, "/", False)
check("Probe: 42 %, chronometer, Hinweistext", pr["data"]["progress"] == 42 and pr["data"]["chronometer"] and "2 Minuten" in pr["message"], pr)


# ── Ablauf mit nachgebautem HA ───────────────────────────────────────────
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
    check("weiter: laut", svc.calls and svc.calls[0][1]["data"]["silent"] is False)
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
    # Aus mitten im Lauf → clear
    st("sensor.w_state", "running")
    await L._evaluate("d-washer", "state")
    svc.calls.clear()
    st("sensor.w_state", "idle")
    await L._evaluate("d-washer", "state")
    check("Gerät aus/bereit während Aktivität: clear", len(svc.calls) == 2 and svc.calls[0][1]["message"] == "clear_notification")
    # Protokoll
    check("Protokoll gefüllt, neueste zuerst, höchstens 20", 0 < len(L.payload()["log"]) <= 20 and L.payload()["log"][0]["clear"] is True)
    check("payload: Geräte mit Einstellungen und Stufe", L.payload()["found"][0]["settings"]["done_min"] == 30 and L.payload()["found"][0]["grade"] == "sehr gut")
    check("notify_services nur mobile_app", L.payload()["notify_services"] == ["notify.mobile_app_handy", "notify.mobile_app_tablet"])

    # Gerät ausschalten → sofort clear; Empfänger abwählen → clear nur dort
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
    # Prüfung der Eingaben
    for bad in ({"targets": ["notify.x y"]}, {"devices": {"d": {"foo": 1}}}, {"devices": {"d": {"done_min": "x"}}}, {"devices": {"d": {"quiet": 3}}}):
        try:
            la.merge_settings(L.cfg, bad)
            check(f"abgelehnt: {bad}", False)
        except ValueError:
            check(f"abgelehnt: {bad}", True)
    m = la.merge_settings(L.cfg, {"devices": {"d": {"done_min": 999, "interval_min": 0}}})
    check("Grenzen: 1–240 / 1–60 Min.", m["devices"]["d"] == {"done_min": 240, "interval_min": 1}, m)
    # Kaputter Empfänger stoppt die anderen nicht
    await L.async_set({"targets": ["notify.kaputt", "notify.mobile_app_handy"]})
    svc.calls.clear()
    st("sensor.w_state", "running"); st("sensor.w_pct", "10")
    L.active.clear(); L.snaps.clear()
    await L._evaluate("d-washer", "state")
    check("kaputter Empfänger: der andere bekommt die Meldung", [c[0] for c in svc.calls] == ["mobile_app_handy"], svc.calls)

    # Neustart: Laufendes leise wieder aufnehmen, Verwaistes abräumen
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
    # Neustart, Gerät inzwischen aus → clear
    st("sensor.w_state", "off")
    L3, svc3 = make([washer()], seed)
    await L3.async_start()
    L3.rescan = _rescan
    await L3._resume()
    check("Neustart: inzwischen aus → clear, nichts aktiv", all(c[1].get("message") == "clear_notification" for c in svc3.calls) and not L3.active, svc3.calls)

    # Ohne Empfänger passiert nichts, auch wenn Geräte laufen
    L4, svc4 = make([washer()])
    await L4.async_start()
    st("sensor.w_state", "running")
    await L4._evaluate("d-washer", "state")
    check("ohne Empfänger: nichts", not svc4.calls and not L4.active)

    # Englisch: Titel aus Art, wenn das Gerät keinen Namen hat
    L5, svc5 = make([Found("d-x", "dryer", "washdata", "sehr gut", {"state": "sensor.w_state", "progress": "sensor.w_pct"})])
    L5.hass.config.language = "en"
    await L5.async_start()
    await L5.async_set({"targets": ["notify.mobile_app_handy"]})
    check("Englisch: Titel „Dryer“, Text englisch", svc5.calls and svc5.calls[0][1]["title"] == "Dryer" and svc5.calls[0][1]["message"].startswith("Running"), svc5.calls)

    # Probe: an gespeicherte Empfänger, mit Probe-Tag
    class _Later:
        def __call__(self, hass, delay, fn):
            return lambda: None

    import homeassistant.helpers.event as ev
    ev.async_call_later = _Later()
    svc5.calls.clear()
    r = await L5.async_probe("d-x")
    check("Probe: gesendet, Probe-Tag, Beispielwerte", r == {"ok": True, "targets": 1} and svc5.calls[0][1]["data"]["tag"] == la.PROBE_TAG
          and svc5.calls[0][1]["data"]["progress"] == 42 and svc5.calls[0][1]["title"] == "Dryer · Test", svc5.calls)


asyncio.run(flow())

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
