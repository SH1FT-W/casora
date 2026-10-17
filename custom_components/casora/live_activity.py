"""Live-Aktivitäten (iOS Live Activities / Android Live Updates) über die HA-App – aus Casora heraus.

Statt je Gerät eine Automation: Casora beobachtet die Geräte, die der Finder kennt (live_finder.py –
dieselbe Erkennung wie Kacheln und Popups), und schickt notify.mobile_app_… mit data.live_update. Eine
Aktivität beginnt mit dem Programm, zeigt Programm/Phase, Fortschritt und Restzeit (chronometer bis zum
Ende; ohne Restzeit „läuft seit“ ab Start), meldet Pause (gelb), Eingriff/Fehler (rot) und Fertig (grün)
und räumt sich auf: „Fertig“ nach der eingestellten Dauer, sonst sobald das Gerät wieder aus/bereit ist.
Zwischenstände (Fortschritt, Phase, Takt) gehen leise, Phasenwechsel laut.

Einstellungen (Studio → Einstellungen → Live-Aktivitäten) liegen im Casora-Speicher, nicht in den
Optionen: Empfänger einmal, je Gerät Schalter, Fertig-Dauer, leise Zwischenstände, Takt. Laufende
Aktivitäten stehen ebenfalls im Speicher – nach einem Neustart werden sie neu bewertet (läuft noch →
leise neu gesendet, sonst beendet). Ausschalten (Gerät, Empfänger, alle) beendet laufende sofort.

Regeln: nur zeigen, was das Gerät liefert; unbekannte Zustände nie als „Fertig“ deuten; Farben aus der
Casora-Palette; Texte Deutsch/Englisch nach HA-Sprache; Zeiten als Ortszeit.

WebSocket (nur Admins):
  casora/live/get   ← {} → {targets, devices, found: [...], notify_services, log, active, url, test_runs (nur Testhaus)}
  casora/live/set   ← {targets?: [notify.…], devices?: {<device_id>: {on?, done_min?, quiet?, interval_min?}}} → wie get
  casora/live/probe ← {device_id?} → {ok, targets}   (Beispiel-Aktivität, räumt sich nach 2 Min. selbst auf)
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .live_finder import Found, find_devices
from .lueften_push import notify_services

_LOGGER = logging.getLogger(__name__)

STORE_KEY = f"{DOMAIN}.live_activity"
KINDS = ("washer", "dryer", "dishwasher", "vacuum", "printer")
DEFAULTS = {"on": True, "done_min": 30, "quiet": True, "interval_min": 10}
LIMITS = {"done_min": (1, 240), "interval_min": (1, 60)}
LOG_MAX = 20
PROBE_TAG = "casora-live-probe"
PROBE_CLEAR_S = 120
TICK = timedelta(seconds=60)

# Farben aus der Casora-Palette (theme_weich.yaml casora-color-*), keine iOS-Systemwerte.
COLOR = {"washer": "#5B8FC9", "dryer": "#DE8A4E", "dishwasher": "#4E9E95", "vacuum": "#7E6A9E", "printer": "#D16E7E",
         "done": "#6AAE78", "pause": "#E8B04A", "attn": "#D35A4E", "error": "#D35A4E"}
ICON = {"washer": "mdi:washing-machine", "dryer": "mdi:tumble-dryer", "dishwasher": "mdi:dishwasher",
        "vacuum": "mdi:robot-vacuum", "printer": "mdi:printer-3d-nozzle"}
TITLE = {"washer": ("Waschmaschine", "Washing machine"), "dryer": ("Trockner", "Dryer"),
         "dishwasher": ("Geschirrspüler", "Dishwasher"), "vacuum": ("Saugroboter", "Robot vacuum"),
         "printer": ("3D-Drucker", "3D printer")}
T = {
    "laeuft": ("Läuft", "Running"), "fertig": ("Fertig", "Done"), "pause": ("Pause", "Pause"), "pausiert": ("Pausiert", "Paused"),
    "eingriff": ("Eingriff", "Attention"), "eingriff_noetig": ("Eingriff nötig", "Attention needed"), "fehler": ("Fehler", "Error"),
    "startzeit": ("Startzeit", "Start time"), "startet": ("Startet {t} Uhr", "Starts at {t}"),
    "waesche_raus": ("Wäsche rausnehmen", "Take out the laundry"), "geschirr_raus": ("Geschirr ausräumen", "Unload the dishes"),
    "knitterschutz": ("Knitterschutz läuft", "Anti-crease running"), "kurze_pause": ("Kurze Pause", "Short pause"),
    "endet": ("Endet", "Ending"), "endet_gleich": ("Endet gleich", "Ending soon"),
    "fehlgeschlagen": ("Fehlgeschlagen", "Failed"), "vorbereitung": ("Vorbereitung", "Preparing"),
    "schicht": ("Schicht {a}/{b}", "Layer {a}/{b}"), "druckauftrag": ("Druckauftrag", "Print job"),
    "flaeche_dauer": ("{a} m² in {m} Min.", "{a} m² in {m} min"), "probe": ("Probe", "Test"),
    "probe_text": ("Beispiel aus Casora – verschwindet in 2 Minuten", "Sample from Casora – gone in 2 minutes"),
}

# Gerätezustand → Phase (wie STATE in scripts/local/02-geraete.js, Art off|idle|delay|run|pause|attn|done|error).
# Unbekanntes fehlt bewusst: es gilt als „off“ und wird nie „Fertig“.
STATE_PHASE = {
    # WashData
    "off": "off", "idle": "off", "starting": "run", "running": "run", "paused": "pause", "user_paused": "pause",
    "ending": "run", "finished": "done", "anti_wrinkle": "done", "delay_wait": "delay", "interrupted": "error",
    "force_stopped": "off", "rinse": "run", "clean": "done",
    # Home Connect (auch Geschirrspüler)
    "inactive": "off", "ready": "off", "delayedstart": "delay", "run": "run", "pause": "pause", "actionrequired": "attn",
    "error": "error", "aborting": "off",
    # Miele
    "on": "off", "programmed": "off", "waiting_to_start": "delay", "in_use": "run", "program_ended": "done", "failure": "error",
    "program_interrupted": "error", "rinse_hold": "pause", "service": "error", "not_connected": "off",
    # SmartThings
    "stop": "off",
    # Whirlpool
    "standby": "off", "setting": "off", "system_initialize": "run", "running_maincycle": "run", "running_postcycle": "run",
    "cycle_filling": "run", "cycle_rinsing": "run", "cycle_sensing": "run", "cycle_soaking": "run", "cycle_spinning": "run",
    "cycle_washing": "run", "complete": "done", "delay_countdown": "delay", "smart_delay": "delay", "delay_paused": "pause",
    "power_failure": "error", "hard_stop_or_error": "error",
    # LG ThinQ
    "power_off": "off", "initial": "off", "detecting": "run", "rinsing": "run", "spinning": "run", "drying": "run",
    "cooling": "run", "cool_down": "run", "soaking": "run", "refreshing": "run", "wrinkle_care": "done", "end": "done",
    "done": "done", "reservation": "delay",
}
# Kein Programm/keine Phase, nur der Gerätezustand (WashData füllt die Phase sonst damit).
NOPROG = {"off", "none", "unknown", "unavailable", "detecting...", "detecting", "starting", "running", "idle", "paused",
          "user_paused", "ending", "finished", "clean", "auto_detect", ""}
PHASE = {
    "pre-wash": ("Vorwäsche", "Pre-wash"), "prewash": ("Vorwäsche", "Pre-wash"), "pre-rinse": ("Vorspülen", "Pre-rinse"),
    "prerinse": ("Vorspülen", "Pre-rinse"), "wash": ("Waschen", "Washing"), "mainwash": ("Reinigen", "Cleaning"),
    "rinse": ("Spülen", "Rinsing"), "finalrinse": ("Klarspülen", "Final rinse"), "spin": ("Schleudern", "Spinning"),
    "soak": ("Einweichen", "Soaking"), "anti-crease": ("Knitterschutz", "Anti-crease"), "anti-wrinkle": ("Knitterschutz", "Anti-crease"),
    "drying": ("Trocknen", "Drying"), "dry": ("Trocknen", "Drying"), "cool-down": ("Abkühlen", "Cooling down"),
    "cooldown": ("Abkühlen", "Cooling down"), "heat-up": ("Aufheizen", "Heating up"), "heating": ("Aufheizen", "Heating up"),
    "heat": ("Aufheizen", "Heating up"), "drain": ("Abpumpen", "Draining"), "drain-&-switch": ("Abpumpen", "Draining"),
    "sensor-check": ("Prüfung", "Sensor check"), "sanitize": ("Hygiene", "Sanitize"),
}
PROGRAM = {
    "dishcare_dishwasher_program_eco50": ("Eco 50°", "Eco 50°"), "dishcare_dishwasher_program_auto2": ("Auto 45–65°", "Auto 45–65°"),
    "dishcare_dishwasher_program_intensiv70": ("Intensiv 70°", "Intensive 70°"), "dishcare_dishwasher_program_quick45": ("Schnell 45°", "Quick 45°"),
    "dishcare_dishwasher_program_quick65": ("Schnell 65°", "Quick 65°"), "dishcare_dishwasher_program_prerinse": ("Vorspülen", "Pre-rinse"),
    "dishcare_dishwasher_program_machinecare": ("Maschinenpflege", "Machine care"), "favorite_001": ("Favorit", "Favorite"),
    "laundry_care_washer_program_cotton": ("Baumwolle", "Cotton"), "laundry_care_washer_program_easy_care": ("Pflegeleicht", "Easy care"),
    "laundry_care_washer_program_mix": ("Mix", "Mix"), "laundry_care_washer_program_delicates_silk": ("Feinwäsche", "Delicates"),
    "laundry_care_washer_program_wool": ("Wolle", "Wool"), "laundry_care_washer_program_sensitive": ("Sensitiv", "Sensitive"),
    "laundry_care_dryer_program_cotton": ("Baumwolle", "Cotton"), "laundry_care_dryer_program_synthetic": ("Pflegeleicht", "Synthetics"),
    "laundry_care_dryer_program_mix": ("Mix", "Mix"),
}
PROGRAM_PREFIX = re.compile(r"^(laundry_care_(washer|dryer)_program_|dishcare_dishwasher_program_)")

# Saugroboter: Status-Sensor (Roborock) → Text; reinigt = Raum ist der Hauptwert.
VAC_CLEANING = {"cleaning", "segment_cleaning", "zoned_cleaning", "spot_cleaning", "robot_status_mopping", "segment_mopping",
                "zoned_mopping", "clean_mop_cleaning", "clean_mop_mopping", "segment_clean_mop_cleaning",
                "segment_clean_mop_mopping", "zoned_clean_mop_cleaning", "zoned_clean_mop_mopping"}
VAC_REST = {"charging", "charging_complete", "idle", "device_offline", "shutting_down", "updating", "locked", "unknown",
            "unavailable", "docked", "off", "sleeping"}
VAC_TEXT = {
    "cleaning": ("Reinigt", "Cleaning"), "segment_cleaning": ("Reinigt", "Cleaning"), "zoned_cleaning": ("Reinigt", "Cleaning"),
    "spot_cleaning": ("Punktreinigung", "Spot cleaning"), "robot_status_mopping": ("Wischt", "Mopping"), "segment_mopping": ("Wischt", "Mopping"),
    "zoned_mopping": ("Wischt", "Mopping"), "clean_mop_cleaning": ("Reinigt", "Cleaning"), "clean_mop_mopping": ("Wischt", "Mopping"),
    "segment_clean_mop_cleaning": ("Reinigt", "Cleaning"), "segment_clean_mop_mopping": ("Wischt", "Mopping"),
    "zoned_clean_mop_cleaning": ("Reinigt", "Cleaning"), "zoned_clean_mop_mopping": ("Wischt", "Mopping"),
    "washing_the_mop": ("Mopp waschen", "Washing the mop"), "going_to_wash_the_mop": ("Zur Moppwäsche", "Going to wash the mop"),
    "back_to_dock_washing_duster": ("Zur Moppwäsche", "Going to wash the mop"), "emptying_the_bin": ("Staub entleeren", "Emptying the bin"),
    "returning_home": ("Zurück zur Station", "Returning to dock"), "returning": ("Zurück zur Station", "Returning to dock"),
    "docking": ("Dockt an", "Docking"), "paused": ("Pausiert", "Paused"), "charging": ("Lädt", "Charging"),
    "charging_complete": ("Geladen", "Charged"), "idle": ("Bereit", "Ready"), "error": ("Fehler", "Error"),
    "charging_problem": ("Ladeproblem", "Charging problem"), "going_to_target": ("Unterwegs", "On the way"), "mapping": ("Kartiert", "Mapping"),
    "attaching_the_mop": ("Mopp anbringen", "Attaching the mop"), "detaching_the_mop": ("Mopp abnehmen", "Detaching the mop"),
    "starting": ("Startet", "Starting"), "manual_mode": ("Manuell", "Manual"), "remote_control_active": ("Fernsteuerung", "Remote control"),
}
# 3D-Drucker (Bambu Lab): Arbeitsschritt → Text.
PRINT_STEP = {
    "printing": ("Druckt", "Printing"), "heating_hotend": ("Düse heizt", "Heating nozzle"), "heatbed_preheating": ("Bett heizt", "Heating bed"),
    "waiting_for_heatbed_temperature": ("Bett heizt", "Heating bed"), "auto_bed_leveling": ("Bett-Leveling", "Bed leveling"),
    "bed_level_phase_1": ("Bett-Leveling", "Bed leveling"), "bed_level_phase_2": ("Bett-Leveling", "Bed leveling"),
    "homing_toolhead": ("Homing", "Homing"), "cleaning_nozzle_tip": ("Düse reinigen", "Cleaning nozzle"),
    "preparing_ams": ("AMS vorbereiten", "Preparing AMS"), "changing_filament": ("Filamentwechsel", "Changing filament"),
    "filament_loading": ("Filament laden", "Loading filament"), "filament_unloading": ("Filament entladen", "Unloading filament"),
    "inspecting_first_layer": ("Erste Schicht prüfen", "Inspecting first layer"), "calibrating_micro_lidar": ("Kalibrierung", "Calibrating"),
    "calibrating_extrusion": ("Kalibrierung", "Calibrating"), "calibrating_extrusion_flow": ("Kalibrierung", "Calibrating"),
    "pre_extrusion_before_printing": ("Vorextrusion", "Pre-extrusion"), "heating_chamber": ("Kammer heizt", "Heating chamber"),
    "cooling_chamber": ("Kammer kühlt", "Cooling chamber"), "purifying_chamber_air": ("Luft filtern", "Purifying air"),
    "paused_user": ("Pausiert", "Paused"), "paused_filament_runout": ("Filament leer", "Filament runout"),
    "paused_front_cover_falling": ("Abdeckung offen", "Cover open"), "paused_nozzle_clog": ("Düse verstopft", "Nozzle clogged"),
    "paused_first_layer_error": ("Erste Schicht fehlerhaft", "First layer error"), "paused_ams_lost": ("AMS getrennt", "AMS lost"),
    "m400_pause": ("Pause (G-Code)", "Pause (G-code)"), "idle": ("", ""), "unknown": ("", ""), "offline": ("", ""), "unavailable": ("", ""),
}
PRINT_PHASE = {"prepare": "run", "running": "run", "pause": "pause", "finish": "done", "failed": "error"}


@dataclass
class Snap:
    """Was gerade zu zeigen ist – unabhängig von der Quelle."""

    phase: str = "off"            # off | delay | run | pause | attn | done | error
    program: str | None = None
    step: str | None = None       # Phase, Arbeitsschritt oder Raum
    pct: int | None = None
    end_ts: int | None = None     # Restzeit bzw. Startzeit (chronometer bis dahin)
    start_ts: int | None = None   # ohne Restzeit: läuft seit
    extra: str | None = None      # Zusatz („Knitterschutz läuft“, „Schicht 12/80“, „32 m² in 45 Min.“)
    critical: str | None = None   # Kurztext für die kompakte Ansicht
    message: str = ""
    minor: bool = False           # kurze Pause/Endet gleich (WashData): leise, Grundfarbe

    def signature(self) -> tuple:
        return (self.phase, self.program, self.step, self.pct, self.extra, self.minor)


def _lang(hass) -> int:
    return 0 if str(getattr(hass.config, "language", "") or "").startswith("de") else 1


def _pct_text(pct: int, lang: int) -> str:
    return f"{pct} %" if lang == 0 else f"{pct}%"


def _num(st) -> float | None:
    if st is None:
        return None
    try:
        return float(st.state)
    except (TypeError, ValueError):
        return None


def _unit(st) -> str:
    return str(((st.attributes if st else {}) or {}).get("unit_of_measurement") or "").lower()


def _seconds(st) -> float | None:
    """Dauer-Sensor in Sekunden (h/min/s nach Einheit, ohne Einheit Minuten)."""
    n = _num(st)
    if n is None:
        return None
    u = _unit(st)
    return n * 3600 if u == "h" else n if u == "s" else n * 60


def _timestamp(st) -> int | None:
    """Zeitpunkt-Sensor (program_finish_time, end_time, completion_time) → Unix-Sekunden."""
    if st is None or st.state in ("unknown", "unavailable", "", None):
        return None
    d = dt_util.parse_datetime(str(st.state))
    if d is None:
        return None
    if d.tzinfo is None:
        d = dt_util.as_utc(d.replace(tzinfo=dt_util.get_default_time_zone()))
    return int(d.timestamp())


def _end_from(st, now: datetime) -> int | None:
    """Restzeit → Endzeitpunkt: Zeitstempel direkt, Dauer ab jetzt."""
    ts = _timestamp(st)
    if ts:
        return ts
    s = _seconds(st)
    return int(now.timestamp() + s) if s and s > 0 else None


def _clean(st) -> str:
    return str(st.state).strip() if st is not None and str(st.state).lower() not in ("unknown", "unavailable", "none", "") else ""


def program_name(raw: str, lang: int) -> str:
    key = raw.strip().lower()
    if key in PROGRAM:
        return PROGRAM[key][lang]
    if key in NOPROG:
        return ""
    s = PROGRAM_PREFIX.sub("", key)
    if s == key and "_" not in key:
        return raw.strip()  # Klartext der Integration („Baumwolle 40“) bleibt
    s = s.replace("_", " ").strip()
    return s[:1].upper() + s[1:]


def _join(*parts: str | None) -> str:
    return " · ".join(p for p in parts if p)


def _time_text(ts: int, lang: int) -> str:
    local = dt_util.as_local(dt_util.utc_from_timestamp(ts))
    return local.strftime("%H:%M") if lang == 0 else local.strftime("%-I:%M %p")


def snapshot(found: Found, get: Callable[[str], Any], now: datetime, lang: int, prev: Snap | None = None) -> Snap:
    """Zustand eines gefundenen Geräts als Schnappschuss. prev: letzter Stand (Sauger-„Fertig“ beim Andocken)."""
    f = found.fields
    g = lambda name: get(f[name]) if f.get(name) else None  # noqa: E731
    if found.kind == "vacuum":
        return _snap_vacuum(found, g, now, lang, prev)
    if found.kind == "printer":
        return _snap_printer(found, g, now, lang)
    return _snap_appliance(found, g, now, lang)


def _snap_appliance(found: Found, g, now: datetime, lang: int) -> Snap:
    raw = str(getattr(g("state"), "state", "") or "").lower()
    ph = STATE_PHASE.get(raw, "off")
    s = Snap(phase=ph)
    if ph == "off":
        return s
    prog = program_name(_clean(g("program")), lang)
    phase_raw = _clean(g("phase")).lower()
    step = PHASE[phase_raw][lang] if phase_raw in PHASE else ("" if phase_raw in NOPROG else phase_raw.replace("_", " ").capitalize())
    pct_n = _num(g("progress"))
    s.pct = max(0, min(100, int(pct_n))) if pct_n is not None else None
    s.program = prog or None
    s.step = step or None
    end = _end_from(g("remaining"), now)
    if end and end > now.timestamp() + 30:
        s.end_ts = end
    el = _seconds(g("elapsed"))
    if el is not None and el >= 0:
        s.start_ts = int(now.timestamp() - el)
    laundry = found.kind in ("washer", "dryer")
    pct_t = _pct_text(s.pct, lang) if s.pct is not None else None
    if ph == "done":
        s.pct = 100
        s.extra = T["knitterschutz"][lang] if raw in ("anti_wrinkle", "wrinkle_care") else None
        s.critical = T["fertig"][lang]
        s.message = _join(T["fertig"][lang], T["waesche_raus"][lang] if laundry else T["geschirr_raus"][lang], s.extra)
    elif ph == "pause":
        s.minor = raw == "paused" and found.source == "washdata"  # kurze automatische Pause vor dem Ende
        s.critical = T["pause"][lang]
        s.message = _join(T["kurze_pause"][lang] if s.minor else T["pausiert"][lang], prog, pct_t)
    elif ph == "attn":
        s.critical = T["eingriff"][lang]
        s.message = _join(T["eingriff_noetig"][lang], prog)
    elif ph == "error":
        s.critical = T["fehler"][lang]
        s.message = _join(T["fehler"][lang], prog)
    elif ph == "delay":
        start = _end_from(g("start_in"), now) or s.end_ts
        s.end_ts = start
        s.critical = T["startzeit"][lang]
        s.message = _join(prog, T["startet"][lang].format(t=_time_text(start, lang)) if start else None)
    else:
        if raw == "ending":
            s.minor = True
            s.step = T["endet_gleich"][lang]
            s.critical = T["endet"][lang]
        else:
            s.critical = s.step or pct_t or T["laeuft"][lang]
        s.message = _join(prog or T["laeuft"][lang], s.step, pct_t)
    return s


def _snap_vacuum(found: Found, g, now: datetime, lang: int, prev: Snap | None) -> Snap:
    vst = str(getattr(g("state"), "state", "") or "").lower()
    sst = _clean(g("status")).lower()
    raw = sst or vst
    text = VAC_TEXT[raw][lang] if raw in VAC_TEXT else raw.replace("_", " ").capitalize()
    cleaning = raw in VAC_CLEANING
    if raw in ("error", "charging_problem"):
        ph = "error"
    elif raw == "paused":
        ph = "pause"
    elif raw in VAC_REST or not raw:
        ph = "off"
    else:
        ph = "run"
    s = Snap(phase=ph)
    pct_n = _num(g("progress"))
    s.pct = max(0, min(100, int(pct_n))) if pct_n is not None else None
    room = _clean(g("room"))
    if ph == "off":
        # Zurück in der Station nach einer Reinigung: „Fertig“ mit Fläche und Dauer – bleibt stehen,
        # bis die Fertig-Dauer um ist (Andocken ist beim Sauger der Normalzustand, kein Abräumen).
        if prev and prev.phase in ("run", "pause", "done"):
            s.phase, s.pct = "done", 100
            s.critical = T["fertig"][lang]
            if prev.phase == "done":
                s.extra = prev.extra
            else:
                area, secs = _num(g("area")), _seconds(g("time"))
                s.extra = T["flaeche_dauer"][lang].format(a=int(round(area)), m=int(round(secs / 60))) if area and secs else None
            s.message = _join(T["fertig"][lang], s.extra)
        return s
    pct_t = _pct_text(s.pct, lang) if s.pct is not None else None
    if ph == "error":
        err = _clean(g("error")).replace("_", " ")
        s.critical = T["fehler"][lang]
        s.message = _join(text, err if err.lower() not in ("none", "no error") else None)
    elif ph == "pause":
        s.step = room or None
        s.critical = T["pause"][lang]
        s.message = _join(T["pausiert"][lang], room, pct_t)
    else:
        s.step = room if cleaning and room else text
        s.critical = s.step
        s.message = _join(text, room if cleaning else None, pct_t)
    return s


def _snap_printer(found: Found, g, now: datetime, lang: int) -> Snap:
    raw = str(getattr(g("state"), "state", "") or "").lower()
    ph = PRINT_PHASE.get(raw, "off")
    s = Snap(phase=ph)
    if ph == "off":
        return s
    pct_n = _num(g("progress"))
    s.pct = max(0, min(100, int(pct_n))) if pct_n is not None else None
    end = _timestamp(g("end")) or _end_from(g("remaining"), now)
    if end and end > now.timestamp() + 60:
        s.end_ts = end
    task = re.sub(r"\.(gcode|3mf)$", "", _clean(g("task"))) or T["druckauftrag"][lang]
    s.program = task
    stage = _clean(g("stage")).lower()
    step = PRINT_STEP[stage][lang] if stage in PRINT_STEP else stage.replace("_", " ").capitalize()
    pct_t = _pct_text(s.pct, lang) if s.pct is not None else None
    if ph == "done":
        s.pct, s.critical = 100, T["fertig"][lang]
        s.message = _join(T["fertig"][lang], task)
    elif ph == "error":
        s.step, s.critical = step or None, T["fehler"][lang]
        s.message = _join(T["fehlgeschlagen"][lang], task, step)
    elif ph == "pause":
        s.step = step if step and step != T["pausiert"][lang] else None
        s.critical = T["pause"][lang]
        s.message = _join(T["pausiert"][lang], s.step, task)
    elif raw == "prepare" or stage != "printing":
        s.step = step or T["vorbereitung"][lang]
        s.critical = s.step
        s.message = _join(task, s.step)
    else:
        a, b = _num(g("layer")), _num(g("layers"))
        s.extra = T["schicht"][lang].format(a=int(a), b=int(b)) if a is not None and b else None
        s.critical = pct_t or step
        s.message = _join(task, s.extra, pct_t)
    return s


def build_payload(snap: Snap, kind: str, title: str, tag: str, url: str, silent: bool) -> dict[str, Any]:
    """Benachrichtigung für notify.mobile_app_* – wie die Vorbild-Automationen."""
    color = COLOR.get(kind, COLOR["washer"])
    if snap.phase in ("done", "attn", "error") or (snap.phase == "pause" and not snap.minor):
        color = COLOR[snap.phase]
    d: dict[str, Any] = {"tag": tag, "live_update": True, "notification_icon": ICON.get(kind, "mdi:bell"),
                         "notification_icon_color": color, "progress_bar_color": color, "url": url,
                         "relevance_score": 0.8 if snap.phase in ("done", "attn", "error") else 0.5,
                         "silent": bool(silent), "group": "casora-live"}
    if snap.pct is not None:
        d["progress"], d["progress_max"] = snap.pct, 100
    if snap.critical:
        d["critical_text"] = snap.critical
    when = snap.end_ts if snap.phase in ("run", "delay") else None
    if when is None and snap.phase in ("run", "pause") and snap.start_ts:
        when = snap.start_ts  # ohne Restzeit: läuft seit
    if when:
        d["chronometer"], d["when"] = True, int(when)
    return {"title": title, "message": snap.message, "data": d}


def clear_payload(tag: str) -> dict[str, Any]:
    return {"message": "clear_notification", "data": {"tag": tag}}


def probe_snapshot(kind: str, now: datetime, lang: int) -> Snap:
    """Beispiel für „Probe senden“: läuft, 42 %, noch 25 Minuten."""
    s = Snap(phase="run", pct=42, end_ts=int(now.timestamp() + 25 * 60), minor=False)
    if kind == "vacuum":
        s.step = ("Wohnzimmer", "Living room")[lang]
        s.message = _join(("Reinigt", "Cleaning")[lang], s.step, _pct_text(42, lang))
    elif kind == "printer":
        s.program = ("Beispielteil", "Sample part")[lang]
        s.extra = T["schicht"][lang].format(a=34, b=80)
        s.message = _join(s.program, s.extra, _pct_text(42, lang))
    elif kind == "dishwasher":
        s.program, s.step = "Eco 50°", PHASE["mainwash"][lang]
        s.message = _join(s.program, s.step, _pct_text(42, lang))
    else:
        s.program, s.step = ("Baumwolle 40", "Cotton 40")[lang], PHASE["rinse"][lang]
        s.message = _join(s.program, s.step, _pct_text(42, lang))
    s.critical = s.step or _pct_text(42, lang)
    s.message = _join(s.message, T["probe_text"][lang])
    return s


def device_settings(cfg: dict, device_id: str) -> dict[str, Any]:
    out = dict(DEFAULTS)
    out.update({k: v for k, v in (cfg.get("devices", {}).get(device_id) or {}).items() if k in DEFAULTS})
    return out


def merge_settings(cfg: dict, msg: dict) -> dict:
    """Neue Einstellungen aus dem Studio prüfen und einarbeiten (gibt die geänderte Kopie zurück)."""
    new = {"targets": list(cfg.get("targets") or []), "devices": {k: dict(v) for k, v in (cfg.get("devices") or {}).items()}}
    if "targets" in msg:
        tg = []
        for t in msg["targets"] or []:
            t = str(t)
            if not re.fullmatch(r"notify\.[a-z0-9_]+", t):
                raise ValueError(f"invalid target {t!r}")
            if t not in tg:
                tg.append(t)
        new["targets"] = tg
    for dev, vals in (msg.get("devices") or {}).items():
        if not isinstance(vals, dict):
            raise ValueError("devices must map device_id to settings")
        cur = new["devices"].setdefault(str(dev), {})
        for key, v in vals.items():
            if key not in DEFAULTS:
                raise ValueError(f"unknown setting {key!r}")
            if key in LIMITS:
                if isinstance(v, bool) or not isinstance(v, (int, float)):
                    raise ValueError(f"{key} must be a number")
                lo, hi = LIMITS[key]
                v = int(max(lo, min(hi, v)))
            elif not isinstance(v, bool):
                raise ValueError(f"{key} must be true or false")
            if v == DEFAULTS[key]:
                cur.pop(key, None)
            else:
                cur[key] = v
        if not cur:
            new["devices"].pop(str(dev), None)
    return new


class LiveActivity:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store = Store(hass, 1, STORE_KEY)
        self.cfg: dict[str, Any] = {"targets": [], "devices": {}}
        self.active: dict[str, dict[str, Any]] = {}   # device_id → {tag, kind, since, phase, done_at, sent_at}
        self.muted: dict[str, str] = {}               # nach Ablauf von Fertig/Fehler: Phase, die nicht neu startet
        self.log: list[dict[str, Any]] = []
        self.found: list[Found] = []
        self.snaps: dict[str, Snap] = {}
        self.url = "/"
        self.loaded = False
        self._unsubs: list = []
        self._unsub_states = None
        self._probe_timers: list = []
        self._pending: list = []  # gesammelter Registry-Nachlauf (ein Timer)
        self._lock = asyncio.Lock()  # Bewertungen nacheinander: ein Schritt ändert oft mehrere Entitäten zugleich

    # ── Start/Stop ─────────────────────────────────────────────────────────
    async def async_start(self) -> None:
        raw = await self.store.async_load() or {}
        self.cfg = {"targets": list(raw.get("targets") or []), "devices": dict(raw.get("devices") or {})}
        self.active = dict(raw.get("active") or {})
        self.muted = dict(raw.get("muted") or {})
        self.log = list(raw.get("log") or [])[-LOG_MAX:]
        self.loaded = True
        self._listen()

    def _listen(self) -> None:
        """HA-Ereignisse: Start (Wiederaufnahme), Minutentakt, Registry-Änderungen (neu suchen)."""
        from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
        from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED
        from homeassistant.helpers.event import async_call_later, async_track_time_interval
        from homeassistant.helpers.start import async_at_started

        @callback
        def _started(_hass: HomeAssistant) -> None:
            self.hass.async_create_task(self._resume(), eager_start=False)

        self._unsubs.append(async_at_started(self.hass, _started))
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, TICK))

        pending = self._pending

        @callback
        def _rescan_now(_now) -> None:
            pending.clear()
            self.hass.async_create_task(self.rescan(), eager_start=False)

        @callback
        def _registry(_event) -> None:
            # Geräte kommen und gehen: gesammelt neu suchen, nicht bei jedem Eintrag.
            if not pending:
                pending.append(async_call_later(self.hass, 5, _rescan_now))

        self._unsubs.append(self.hass.bus.async_listen(EVENT_DEVICE_REGISTRY_UPDATED, _registry))
        self._unsubs.append(self.hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, _registry))

    @callback
    def stop(self) -> None:
        for unsub in [*self._unsubs, self._unsub_states, *self._probe_timers, *self._pending]:
            try:
                if unsub:
                    unsub()
            except Exception:  # noqa: BLE001 – schon abgemeldet
                pass
        self._unsubs, self._unsub_states, self._probe_timers = [], None, []
        self._pending.clear()
        self.loaded = False

    async def _resume(self) -> None:
        await self.rescan()
        await self._find_url()
        known = {f.device_id for f in self.found}
        # Verwaist (Gerät weg oder aus): beenden. Sonst neu bewerten – läuft noch → leise neu senden.
        for dev in list(self.active):
            if dev not in known or not self.enabled(dev):
                await self._clear(dev)
        for f in self.found:
            if self.enabled(f.device_id):
                await self._evaluate(f.device_id, "resume")

    async def rescan(self) -> None:
        try:
            self.found = find_devices(self.hass)
        except Exception:  # noqa: BLE001 – Registry kaputt darf Casora nicht stoppen
            _LOGGER.exception("Live-Aktivitäten: Geräte nicht gefunden")
            self.found = []
        self._subscribe()

    def _subscribe(self) -> None:
        from homeassistant.helpers.event import async_track_state_change_event

        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        by_entity: dict[str, str] = {}
        for f in self.found:
            if self.enabled(f.device_id):
                for eid in f.entity_ids:
                    by_entity[eid] = f.device_id
        if not by_entity:
            return

        @callback
        def _changed(event) -> None:
            dev = by_entity.get(event.data.get("entity_id"))
            if dev:
                self.hass.async_create_task(self._evaluate(dev, "state"), eager_start=False)

        self._unsub_states = async_track_state_change_event(self.hass, list(by_entity), _changed)

    async def _find_url(self) -> None:
        """Casora-Handy-Dashboard als Ziel beim Antippen, sonst die Startseite."""
        try:
            from .phone_badges import is_mobile

            data = self.hass.data.get("lovelace")
            dashboards = getattr(data, "dashboards", None) or {}
            for key, dash in dashboards.items():
                if not key:
                    continue
                try:
                    cfg = await dash.async_load(False)
                except Exception:  # noqa: BLE001 – leeres oder ungültiges Dashboard
                    continue
                if isinstance(cfg, dict) and is_mobile(cfg):
                    self.url = f"/{key}/"
                    return
        except Exception:  # noqa: BLE001 – nur das Ziel beim Antippen
            pass
        self.url = "/"

    # ── Einstellungen ──────────────────────────────────────────────────────
    @property
    def targets(self) -> list[str]:
        return [t.removeprefix("notify.") for t in self.cfg.get("targets") or []]

    def enabled(self, device_id: str) -> bool:
        return bool(self.targets) and bool(device_settings(self.cfg, device_id)["on"])

    def _save(self) -> None:
        self.store.async_delay_save(lambda: {**self.cfg, "active": self.active, "muted": self.muted, "log": self.log[-LOG_MAX:]}, 1)

    def payload(self) -> dict[str, Any]:
        return {
            "targets": list(self.cfg.get("targets") or []),
            "devices": {k: dict(v) for k, v in (self.cfg.get("devices") or {}).items()},
            "found": [{**f.as_dict(), "settings": device_settings(self.cfg, f.device_id),
                       "phase": self.snaps[f.device_id].phase if f.device_id in self.snaps else None}
                      for f in self.found],
            "notify_services": [f"notify.{s}" for s in notify_services(self.hass) if s.startswith("mobile_app_")],
            "log": list(reversed(self.log[-LOG_MAX:])),
            "active": sorted(self.active),
            "url": self.url,
            "test_runs": self._test_runs(),
        }

    def _test_runs(self) -> dict[str, str]:
        """Nur im Testhaus: Geräte, an denen casora_mock.live_lauf einen Durchgang spielt (device_id → Gerät)."""
        if not self.hass.services.has_service("casora_mock", "live_lauf"):
            return {}
        by_state = self.hass.data.get("casora_mock_live") or {}
        return {f.device_id: by_state[f.fields["state"]] for f in self.found if f.fields.get("state") in by_state}

    async def async_set(self, msg: dict) -> None:
        old_targets, new = set(self.targets), merge_settings(self.cfg, msg)
        self.cfg = new
        gone = sorted(old_targets - set(self.targets))
        # Abgewählte Empfänger: laufende Aktivitäten dort beenden.
        for dev in list(self.active):
            if gone:
                await self._clear(dev, targets=gone, forget=False)
            if not self.enabled(dev):
                await self._clear(dev)
        self._subscribe()
        self._save()
        if self.targets:
            await self._find_url()
            for f in self.found:
                if self.enabled(f.device_id) and f.device_id not in self.active:
                    await self._evaluate(f.device_id, "resume")

    # ── Bewertung und Versand ──────────────────────────────────────────────
    def _found(self, device_id: str) -> Found | None:
        return next((f for f in self.found if f.device_id == device_id), None)

    def _title(self, f: Found, lang: int) -> str:
        return f.name or TITLE[f.kind][lang]

    @staticmethod
    def tag_for(f: Found) -> str:
        return f"casora-live-{f.kind}-{f.device_id[:8]}"

    async def _evaluate(self, device_id: str, reason: str) -> None:
        async with self._lock:
            await self._evaluate_locked(device_id, reason)

    async def _evaluate_locked(self, device_id: str, reason: str) -> None:
        f = self._found(device_id)
        if not f or not self.loaded:
            return
        now = dt_util.utcnow()
        lang = _lang(self.hass)
        prev = self.snaps.get(device_id)
        act = self.active.get(device_id)
        snap = snapshot(f, self.hass.states.get, now, lang, prev if act else None)
        self.snaps[device_id] = snap
        if not self.enabled(device_id):
            return
        st = device_settings(self.cfg, device_id)
        if self.muted.get(device_id) == snap.phase:
            return  # Fertig/Fehler schon gezeigt und abgeräumt – erst ein neuer Zustand startet neu
        self.muted.pop(device_id, None)
        if snap.phase == "off":
            if act:
                await self._clear(device_id)
            return
        if reason == "resume" and not act and snap.phase in ("done", "error"):
            # Einschalten/Neustart: ein altes Fertig/Fehler nicht nachträglich melden – erst der nächste Lauf.
            self.muted[device_id] = snap.phase
            return
        if act and act.get("phase") in ("done", "error") and snap.phase in ("done", "error"):
            # Fertig/Fehler bleibt stehen, bis die Dauer um ist (Zwischenstände dort sind nichts Neues).
            if reason == "tick" and act.get("done_at") and now.timestamp() - act["done_at"] >= st["done_min"] * 60:
                self.muted[device_id] = snap.phase
                await self._clear(device_id)
            return
        changed_phase = not act or act.get("phase") != snap.phase
        if not changed_phase and reason != "tick" and prev is not None and prev.signature() == snap.signature():
            return
        if reason == "tick" and act and now.timestamp() - act.get("sent_at", 0) < st["interval_min"] * 60 - 5:
            return
        loud = changed_phase and reason != "resume" and not snap.minor
        if not changed_phase and not st["quiet"]:
            loud = True
        await self._send(f, snap, silent=not loud, now=now)

    async def _send(self, f: Found, snap: Snap, silent: bool, now: datetime) -> None:
        lang = _lang(self.hass)
        tag = self.tag_for(f)
        payload = build_payload(snap, f.kind, self._title(f, lang), tag, self.url, silent)
        act = self.active.get(f.device_id) or {"tag": tag, "kind": f.kind, "since": now.isoformat()}
        if snap.phase in ("done", "error") and act.get("phase") not in ("done", "error"):
            act["done_at"] = now.timestamp()
        act["phase"], act["sent_at"], act["title"] = snap.phase, now.timestamp(), payload["title"]
        self.active[f.device_id] = act
        await self._deliver(self.targets, payload, device_id=f.device_id, phase=snap.phase, now=now)
        self._save()

    async def _clear(self, device_id: str, targets: list[str] | None = None, forget: bool = True) -> None:
        act = self.active.get(device_id)
        if not act:
            return
        to = targets if targets is not None else self.targets
        if forget:
            self.active.pop(device_id, None)
        if to:  # ohne Empfänger (schon abgewählt und dort beendet) nur vergessen
            await self._deliver(to, clear_payload(act["tag"]), device_id=device_id, phase="clear", now=dt_util.utcnow(),
                                title=act.get("title"))
        self._save()

    async def _deliver(self, targets: list[str], payload: dict, device_id: str | None, phase: str, now: datetime,
                       title: str | None = None) -> None:
        sent = []
        for target in targets:
            try:
                await self.hass.services.async_call("notify", target, payload, blocking=True)
                sent.append(target)
            except Exception as err:  # noqa: BLE001 – ein kaputter Empfänger soll die anderen nicht stoppen
                _LOGGER.warning("Live-Aktivität an notify.%s fehlgeschlagen: %s", target, err)
        d = payload.get("data") or {}
        self.log.append({"time": now.isoformat(), "targets": sent, "device_id": device_id, "phase": phase,
                         "tag": d.get("tag"), "title": payload.get("title") or title, "message": payload.get("message"),
                         "progress": d.get("progress"), "when": d.get("when"), "silent": d.get("silent", False),
                         "clear": payload.get("message") == "clear_notification"})
        del self.log[:-LOG_MAX]

    @callback
    def _tick(self, _now) -> None:
        if not self.targets:
            return
        for dev in list(self.active):
            self.hass.async_create_task(self._evaluate(dev, "tick"), eager_start=False)

    async def async_probe(self, device_id: str | None) -> dict[str, Any]:
        from homeassistant.helpers.event import async_call_later

        f = self._found(device_id) if device_id else None
        kind = f.kind if f else "washer"
        now = dt_util.utcnow()
        lang = _lang(self.hass)
        title = (f.name if f and f.name else TITLE[kind][lang]) + " · " + T["probe"][lang]
        payload = build_payload(probe_snapshot(kind, now, lang), kind, title, PROBE_TAG, self.url, silent=False)
        await self._deliver(self.targets, payload, device_id=device_id, phase="probe", now=now)
        self._save()

        async def _later() -> None:
            await self._deliver(self.targets, clear_payload(PROBE_TAG), device_id=device_id, phase="clear", now=dt_util.utcnow())
            self._save()

        self._probe_timers.append(async_call_later(self.hass, PROBE_CLEAR_S, lambda _n: self.hass.async_create_task(_later(), eager_start=False)))
        return {"ok": True, "targets": len(self.targets)}


# ── WebSocket ────────────────────────────────────────────────────────────────
def _la(hass: HomeAssistant) -> LiveActivity | None:
    return hass.data.get(DOMAIN, {}).get("live")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/live/get"})
@websocket_api.async_response
async def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    la = _la(hass)
    if la is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    await la.rescan()
    connection.send_result(msg["id"], la.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/live/set",
    vol.Optional("targets"): [str],
    vol.Optional("devices"): {str: dict},
})
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    la = _la(hass)
    if la is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    try:
        await la.async_set(msg)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], la.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/live/probe", vol.Optional("device_id"): vol.Any(None, str)})
@websocket_api.async_response
async def ws_probe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    la = _la(hass)
    if la is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    if not la.targets:
        connection.send_error(msg["id"], "no_targets", "No recipients selected")
        return
    connection.send_result(msg["id"], await la.async_probe(msg.get("device_id")))


async def async_setup_live(hass: HomeAssistant) -> LiveActivity:
    la = LiveActivity(hass)
    await la.async_start()
    hass.data.setdefault(DOMAIN, {})["live"] = la
    if not hass.data[DOMAIN].get("live_ws"):
        websocket_api.async_register_command(hass, ws_get)
        websocket_api.async_register_command(hass, ws_set)
        websocket_api.async_register_command(hass, ws_probe)
        hass.data[DOMAIN]["live_ws"] = True
    return la
