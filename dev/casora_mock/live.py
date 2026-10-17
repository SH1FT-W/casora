"""Testgeräte und Testlauf für Live-Aktivitäten (live_activity.py) – immer dabei, außer im Demo-Haus.

Ergänzt zu Waschmaschine A/B (waesche.py), Testsauger und Testdrucker (halten.py):
* „Geschirrspüler Test“ – Schlüssel wie Home Connect WS (sensor_operation_state, sensor_program_phase …),
* „Trockner Test“ – Schlüssel wie WashData mit Trockner-Symbol.

Dienst casora_mock.live_lauf (geraet, sekunden): spielt an einem Gerät einen ganzen Durchgang durch –
Start → Fortschritt in Schritten → Fertig → wieder aus/bereit – damit man im Studio-Protokoll und am
Test-Handy (sensor.casora_mock_testhandy) sieht, wie die Live-Aktivität entsteht, sich aktualisiert und endet.
Der Testsauger bekommt Fortschritt, Fläche und Reinigungszeit (Roborock-Schlüssel clean_percent, cleaning_area,
cleaning_time), damit die Live-Aktivität Fortschritt und „läuft seit“ zeigt.

Ein laufender Durchgang übersteht einen Neustart: Start und Dauer liegen in /config/casora_mock_live_lauf.json;
nach dem Start spielt der Mock den Stand nach, der gerade dran wäre, und läuft weiter (Wiederaufnahme vorführbar).
Alle Namen erfunden.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

DISH_PROGS = ["dishcare_dishwasher_program_eco50", "dishcare_dishwasher_program_auto2", "dishcare_dishwasher_program_quick45"]
HC_STATES = ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"]
WD_STATES = ["off", "idle", "starting", "running", "paused", "user_paused", "ending", "finished", "anti_wrinkle",
             "delay_wait", "interrupted", "force_stopped", "unknown", "clean"]
LAUF_DATEI = "casora_mock_live_lauf.json"
GERAETE = ["waschmaschine_a", "waschmaschine_b", "geschirrspueler", "trockner", "sauger", "drucker"]
# Zustands-Entität je Testgerät – darüber ordnet Casora (live_activity.payload → test_runs) den Knopf
# „Testlauf starten“ im Studio dem gefundenen Gerät zu.
ZUSTAND = {"waschmaschine_a": "sensor.waschmaschine_a_zustand", "waschmaschine_b": "sensor.waschmaschine_b_betriebszustand",
           "geschirrspueler": "sensor.geschirrspueler_test_betriebszustand", "trockner": "sensor.trockner_test_zustand",
           "sauger": "vacuum.testsauger", "drucker": "sensor.testdrucker_druckstatus"}


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": None}


def extra(now: datetime) -> dict:
    g, t = "mock_geschirrspueler_test", "mock_trockner_test"
    ents = [
        # Geschirrspüler Test – Home Connect WS (bereit)
        _e("sensor.geschirrspueler_test_betriebszustand", "ready", "sensor_operation_state", g, "Geschirrspüler Test Betriebszustand",
           {"options": HC_STATES}, dc="enum"),
        _e("sensor.geschirrspueler_test_aktives_programm", "unknown", "sensor_active_program", g, "Geschirrspüler Test Aktives Programm",
           {"options": DISH_PROGS}, dc="enum"),
        _e("select.geschirrspueler_test_programm", DISH_PROGS[0], "select_program", g, "Geschirrspüler Test Programm",
           {"options": DISH_PROGS}),
        _e("sensor.geschirrspueler_test_programmphase", "unknown", "sensor_program_phase", g, "Geschirrspüler Test Programmphase",
           {"options": ["prerinse", "mainwash", "finalrinse", "drying"]}, dc="enum"),
        _e("sensor.geschirrspueler_test_programmfortschritt", "0", "sensor_program_progress", g, "Geschirrspüler Test Programmfortschritt",
           {}, unit="%"),
        _e("sensor.geschirrspueler_test_verbleibende_programmlaufzeit", "0", "sensor_remaining_program_time", g,
           "Geschirrspüler Test Verbleibende Programmlaufzeit", {}, dc="duration", unit="h"),
        _e("sensor.geschirrspueler_test_salz", "ok", "sensor_salt", g, "Geschirrspüler Test Salz"),
        _e("binary_sensor.geschirrspueler_test_tur", "off", "binary_sensor_door_state", g, "Geschirrspüler Test Tür", dc="door"),
        _e("button.geschirrspueler_test_programm_abbrechen", "unknown", "button_abort_program", g, "Geschirrspüler Test Programm abbrechen"),
        # Trockner Test – WashData (aus)
        _e("sensor.trockner_test_zustand", "off", "washer_state", t, "Trockner Test Zustand",
           {"icon": "mdi:tumble-dryer", "options": WD_STATES}, dc="enum"),
        _e("sensor.trockner_test_programm", "none", "washer_program", t, "Trockner Test Programm", {"icon": "mdi:file-document-outline"}),
        _e("sensor.trockner_test_fortschritt", "0", "cycle_progress", t, "Trockner Test Fortschritt", {"icon": "mdi:progress-clock"}, unit="%"),
        _e("sensor.trockner_test_verbleibende_zeit", "0", "time_remaining", t, "Trockner Test Verbleibende Zeit",
           {"icon": "mdi:timer-sand"}, dc="duration", unit="min"),
        _e("sensor.trockner_test_verstrichene_zeit", "0", "elapsed_time", t, "Trockner Test Verstrichene Zeit",
           {"icon": "mdi:timer-outline"}, dc="duration", unit="s"),
        _e("sensor.trockner_test_zyklusanzahl", "88", "cycle_count", t, "Trockner Test Zyklusanzahl", {"icon": "mdi:counter"}, unit="cycles"),
        _e("binary_sensor.trockner_test_lauft", "off", "running", t, "Trockner Test Läuft"),
        # Testsauger (Gerät aus halten.py): Fortschritt, Fläche, Reinigungszeit wie Roborock
        _e("sensor.testsauger_reinigungsfortschritt", "0", "clean_percent", "testsauger", "Testsauger Reinigungsfortschritt", unit="%"),
        _e("sensor.testsauger_reinigungsflaeche", "0", "cleaning_area", "testsauger", "Testsauger Reinigungsfläche", unit="m²"),
        _e("sensor.testsauger_reinigungszeit", "0", "cleaning_time", "testsauger", "Testsauger Reinigungszeit", dc="duration", unit="min"),
    ]
    return {
        "areas": [],
        "devices": [
            {"key": g, "name": "Geschirrspüler Test", "manufacturer": "Bosch", "model": "SMV4HCX48E", "area": None},
            {"key": t, "name": "Trockner Test", "manufacturer": "WashData", "model": None, "area": None},
        ],
        "entities": ents,
    }


# Ein Durchgang je Gerät: Liste von Schritten (Zustände je Entität); der letzte Schritt ist „wieder aus“.
def _plan(geraet: str, now: datetime, total_min: int = 60) -> list[dict]:
    def end_in(minutes: float) -> str:
        return (now + timedelta(minutes=minutes)).isoformat()

    if geraet == "waschmaschine_a":
        s, pr, ph, pct, rem, el, run = ("sensor.waschmaschine_a_zustand", "sensor.waschmaschine_a_programm",
                                        "sensor.waschmaschine_a_aktuelle_phase", "sensor.waschmaschine_a_fortschritt",
                                        "sensor.waschmaschine_a_verbleibende_zeit", "sensor.waschmaschine_a_verstrichene_zeit",
                                        "binary_sensor.waschmaschine_a_lauft")
        steps = [{s: "starting", pr: "detecting...", ph: "unknown", pct: "0", rem: "-1", el: "0", run: "on"}]
        for i, (phase, p) in enumerate([("wash", 15), ("wash", 35), ("rinse", 55), ("rinse", 70), ("spin", 88)], start=1):
            steps.append({s: "running", pr: "Baumwolle 40", ph: phase, pct: str(p), rem: str(total_min - total_min * p // 100),
                          el: str(i * 600)})
        steps += [{s: "ending", pct: "97", rem: "2"}, {s: "finished", pct: "100", rem: "0", run: "off"},
                  {s: "off", pr: "none", ph: "unknown", pct: "0", rem: "0", el: "0"}]
        return steps
    if geraet == "trockner":
        s, pr, ph, pct, rem, el, run = ("sensor.trockner_test_zustand", "sensor.trockner_test_programm",
                                        None, "sensor.trockner_test_fortschritt", "sensor.trockner_test_verbleibende_zeit",
                                        "sensor.trockner_test_verstrichene_zeit", "binary_sensor.trockner_test_lauft")
        steps = [{s: "starting", pr: "detecting...", pct: "0", rem: "-1", el: "0", run: "on"}]
        for i, p in enumerate([12, 30, 48, 66, 84], start=1):
            steps.append({s: "running", pr: "Schranktrocken", pct: str(p), rem: str(total_min - total_min * p // 100), el: str(i * 600)})
        steps += [{s: "paused", pct: "95", rem: "3"}, {s: "finished", pct: "100", rem: "0", run: "off"},
                  {s: "anti_wrinkle"}, {s: "off", pr: "none", pct: "0", rem: "0", el: "0"}]
        return steps
    if geraet == "waschmaschine_b":
        s, pct, end = "sensor.waschmaschine_b_betriebszustand", "sensor.waschmaschine_b_programmfortschritt", "sensor.waschmaschine_b_programmende"
        steps = [{s: "run", pct: "0", end: end_in(total_min)}]
        steps += [{s: "run", pct: str(p), end: end_in(total_min - total_min * p // 100)} for p in (20, 40, 60, 80, 95)]
        steps += [{s: "finished", pct: "100"}, {s: "ready", pct: "0"}]
        return steps
    if geraet == "geschirrspueler":
        s, pr, ph, pct, rem = ("sensor.geschirrspueler_test_betriebszustand", "sensor.geschirrspueler_test_aktives_programm",
                               "sensor.geschirrspueler_test_programmphase", "sensor.geschirrspueler_test_programmfortschritt",
                               "sensor.geschirrspueler_test_verbleibende_programmlaufzeit")
        steps = [{s: "run", pr: DISH_PROGS[0], ph: "prerinse", pct: "2", rem: str(round(total_min / 60, 2))}]
        for phase, p in (("mainwash", 20), ("mainwash", 45), ("finalrinse", 65), ("drying", 85), ("drying", 96)):
            steps.append({s: "run", ph: phase, pct: str(p), rem: str(round((total_min - total_min * p // 100) / 60, 2))})
        steps += [{s: "finished", pct: "100", rem: "0"}, {s: "ready", pr: "unknown", ph: "unknown", pct: "0"}]
        return steps
    if geraet == "sauger":
        v, pct, area, tm = ("vacuum.testsauger", "sensor.testsauger_reinigungsfortschritt", "sensor.testsauger_reinigungsflaeche",
                            "sensor.testsauger_reinigungszeit")
        steps = [{v: "cleaning", pct: "0", area: "0", tm: "0"}]
        for i, p in enumerate((20, 45, 60), start=1):
            steps.append({v: "cleaning", pct: str(p), area: str(round(p * 0.4)), tm: str(i * total_min // 6)})
        steps += [{v: "paused"}, {v: "cleaning", pct: "85", area: "34", tm: str(4 * total_min // 6)},
                  {v: "returning", pct: "100", area: "40", tm: str(5 * total_min // 6)}, {v: "docked"}]
        return steps
    if geraet == "drucker":
        P = "testdrucker"
        st, stage, pct, rem, layer = (f"sensor.{P}_druckstatus", f"sensor.{P}_aktueller_arbeitsschritt", f"sensor.{P}_druckfortschritt",
                                      f"sensor.{P}_verbleibende_zeit", f"sensor.{P}_aktuelle_schicht")
        steps = [{st: "prepare", stage: "heatbed_preheating", pct: "0", rem: str(total_min), layer: "0"},
                 {st: "prepare", stage: "auto_bed_leveling", pct: "0"}]
        for p in (10, 30, 50, 70, 90):
            steps.append({st: "running", stage: "printing", pct: str(p), rem: str(total_min - total_min * p // 100), layer: str(3 * p)})
        steps += [{st: "finish", stage: "idle", pct: "100", rem: "0", layer: "300"}, {st: "idle", stage: "idle", pct: "0"}]
        return steps
    return []


def setup(hass, mock) -> None:
    import voluptuous as vol
    from homeassistant.core import ServiceCall, callback
    from homeassistant.helpers.event import async_call_later
    from homeassistant.util import dt as dt_util

    timers: dict[str, list] = {}
    laeufe: dict[str, dict] = {}  # geraet → {start (Unix-Sekunden), sekunden} – überlebt den Neustart (LAUF_DATEI)
    path = hass.config.path(LAUF_DATEI)

    def _write(data: dict) -> None:
        if data:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
        elif os.path.exists(path):
            os.remove(path)

    def merken() -> None:
        hass.async_add_executor_job(_write, dict(laeufe))

    def cancel(geraet: str) -> None:
        for c in timers.pop(geraet, []):
            c()

    def apply(step: dict) -> None:
        for eid, state in step.items():
            if eid:
                mock.set(eid, state)

    def spielen(geraet: str, start: float, seconds: int) -> None:
        """Durchgang ab start abspielen; schon vergangene Schritte sofort (Wiederaufnahme nach Neustart)."""
        cancel(geraet)
        steps = _plan(geraet, datetime.fromtimestamp(start, tz=timezone.utc))
        if not steps:
            return
        gap = seconds / max(1, len(steps) - 1)
        elapsed = max(0.0, dt_util.utcnow().timestamp() - start)
        laeufe[geraet] = {"start": start, "sekunden": seconds}
        merken()
        for i, step in enumerate(steps):
            if i * gap <= elapsed:
                apply(step)
                continue

            @callback
            def later(_now, step=step, last=(i == len(steps) - 1)) -> None:
                apply(step)
                if last:
                    laeufe.pop(geraet, None)
                    merken()

            timers.setdefault(geraet, []).append(async_call_later(hass, i * gap - elapsed, later))
        if elapsed >= (len(steps) - 1) * gap:
            laeufe.pop(geraet, None)
            merken()

    async def live_lauf(call: ServiceCall) -> None:
        spielen(call.data["geraet"], dt_util.utcnow().timestamp(), max(10, int(call.data.get("sekunden", 90))))

    async def live_stopp(call: ServiceCall) -> None:
        for g in list(timers):
            cancel(g)
        laeufe.clear()
        merken()

    async def wiederaufnehmen() -> None:
        def _read() -> dict:
            try:
                with open(path, encoding="utf-8") as fh:
                    return json.load(fh)
            except (OSError, ValueError):
                return {}

        for geraet, lauf in (await hass.async_add_executor_job(_read)).items():
            if geraet in GERAETE and isinstance(lauf, dict):
                spielen(geraet, float(lauf.get("start", 0)), int(lauf.get("sekunden", 90)))

    hass.services.async_register("casora_mock", "live_lauf", live_lauf, vol.Schema({
        vol.Required("geraet"): vol.In(GERAETE), vol.Optional("sekunden", default=90): vol.All(int, vol.Range(min=10, max=3600))}))
    hass.services.async_register("casora_mock", "live_stopp", live_stopp)
    hass.data["casora_mock_live"] = {eid: g for g, eid in ZUSTAND.items()}
    hass.async_create_task(wiederaufnehmen(), eager_start=False)


def note_notify(hass, call) -> None:
    """Test-Handy: letzte Meldungen als Sensor, damit man sie im Docker ohne echtes Handy sieht."""
    from homeassistant.util import dt as dt_util

    eid = "sensor.casora_mock_testhandy"
    cur = hass.states.get(eid)
    last = list(((cur.attributes if cur else {}) or {}).get("letzte") or [])
    d = dict(call.data.get("data") or {})
    entry = {"zeit": dt_util.now().strftime("%H:%M:%S"), "tag": d.get("tag"), "titel": call.data.get("title"),
             "text": call.data.get("message"), "fortschritt": d.get("progress"), "leise": d.get("silent", False),
             "live": bool(d.get("live_update")), "wann": d.get("when"), "farbe": d.get("notification_icon_color")}
    last.insert(0, entry)
    n = int(cur.state) + 1 if cur and str(cur.state).isdigit() else 1
    hass.states.async_set(eid, str(n), {"friendly_name": "Testhandy Meldungen", "icon": "mdi:cellphone-message",
                                        "letzte": last[:15], "zuletzt": entry})
