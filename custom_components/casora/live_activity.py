"""Live activities (iOS Live Activities / Android Live Updates) via the HA app, driven by Casora.

Instead of one automation per device: Casora watches the devices the finder knows (live_finder.py, the
same detection as tiles and popups) and sends notify.mobile_app_… with data.live_update. An
activity starts with the program, shows program/phase, progress and remaining time (chronometer to the
end; without remaining time "running since" from the start), reports pause (yellow), attention/error (red)
and done (green) and cleans up after itself: "done" after the set duration, otherwise once the device is off/ready again.
Intermediate updates (progress, phase, tick) go out silently, phase changes loudly.

Settings (Studio → Settings → Live Activities) live in the Casora store, not in the
options: recipients once, per device a switch, done duration, silent intermediate updates, interval. Running
activities are stored there as well – after a restart they are re-evaluated (still running →
resent silently, otherwise ended). Switching off (device, recipient, all) ends running ones at once.

Rules: only show what the device delivers; never read unknown states as "done"; colors from the
Casora palette; texts German/English by HA language; times as local time.

WebSocket (admins only):
  casora/live/get   ← {} → {targets, devices, found: [...], notify_services, log, active, url, test_runs (test house only)}
  casora/live/set   ← {targets?: [notify.…], devices?: {<device_id>: {on?, done_min?, quiet?, interval_min?, color?}},
                       devices_replace?: bool (devices = complete list, replaces everything)} → same as get
  casora/live/probe ← {device_id?} → {ok, targets}   (sample activity, cleans itself up after 2 min)
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field, replace
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
DEFAULTS = {"on": True, "done_min": 10, "quiet": True, "interval_min": 10, "color": "auto"}
# Selectable colors per device (Casora palette); "auto" = color of the device kind.
PALETTE = {"blue": "#5B8FC9", "teal": "#4E9E95", "green": "#6AAE78", "honey": "#E8B04A",
           "orange": "#DE8A4E", "red": "#D35A4E", "violet": "#7E6A9E", "rose": "#D16E7E"}
LIMITS = {"done_min": (1, 240), "interval_min": (1, 60)}
LOG_MAX = 20
PROBE_TAG = "casora-live-probe"
PROBE_CLEAR_S = 120
# Device unreachable (unavailable/unknown/offline): leave the activity standing quietly; when the device
# returns, it continues silently. Only after this long without the device does Casora clear it (silently, never "done").
GONE_MAX_S = 30 * 60
GONE_STATES = {"unavailable", "unknown", "", "none", "not_connected", "offline", "device_offline"}
TICK = timedelta(seconds=60)
STATE_COLLECT_S = 1.5

# Colors from the Casora palette (theme_weich.yaml casora-color-*), no iOS system values.
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
    "flaeche_dauer": ("{a} m² in {m} Min.", "{a} m² in {m} min"), "flaeche": ("{a} m²", "{a} m²"), "probe": ("Probe", "Test"),
    "probe_text": ("Beispiel aus Casora – verschwindet in 2 Minuten", "Sample from Casora – gone in 2 minutes"),
}

# Device state → phase (like STATE in scripts/local/02-geraete.js, kind off|idle|delay|run|pause|attn|done|error).
# Unknown states are missing on purpose: they count as "off" and never become "done".
STATE_PHASE = {
    # WashData
    "off": "off", "idle": "off", "starting": "run", "running": "run", "paused": "pause", "user_paused": "pause",
    "ending": "run", "finished": "done", "anti_wrinkle": "done", "delay_wait": "delay", "interrupted": "error",
    "force_stopped": "off", "rinse": "run", "clean": "done",
    # Home Connect (also dishwashers)
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
# No program/phase, only the device state (otherwise WashData fills the phase with it).
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

# Robot vacuum: status sensor (Roborock) → text; while cleaning, the room is the main value.
VAC_CLEANING = {"cleaning", "segment_cleaning", "zoned_cleaning", "spot_cleaning", "robot_status_mopping", "segment_mopping",
                "zoned_mopping", "clean_mop_cleaning", "clean_mop_mopping", "segment_clean_mop_cleaning",
                "segment_clean_mop_mopping", "zoned_clean_mop_cleaning", "zoned_clean_mop_mopping"}
# Idle states – "unknown"/"unavailable"/"device_offline" are not among them: that is "unreachable" (gone),
# never docking and never "done".
VAC_REST = {"charging", "charging_complete", "idle", "shutting_down", "updating", "locked", "docked", "off", "sleeping",
            "charger_disconnected"}
# Work at the station after cleaning (washing the mop, emptying dust, docking): belongs to the cleaning,
# is never a new run after "done".
VAC_STATION = {"washing_the_mop", "going_to_wash_the_mop", "back_to_dock_washing_duster", "emptying_the_bin", "docking",
               "returning_home", "returning"}
# How long the vacuum must rest after cleaning before "done" comes: the Roborock briefly reports "charging"
# and washes the mop afterwards (otherwise "done" twice with sound).
VAC_SETTLE_S = 90
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
    "charging_complete": ("Geladen", "Charged"), "charger_disconnected": ("Abgedockt", "Undocked"), "idle": ("Bereit", "Ready"), "error": ("Fehler", "Error"),
    "charging_problem": ("Ladeproblem", "Charging problem"), "going_to_target": ("Unterwegs", "On the way"), "mapping": ("Kartiert", "Mapping"),
    "attaching_the_mop": ("Mopp anbringen", "Attaching the mop"), "detaching_the_mop": ("Mopp abnehmen", "Detaching the mop"),
    "starting": ("Startet", "Starting"), "manual_mode": ("Manuell", "Manual"), "remote_control_active": ("Fernsteuerung", "Remote control"),
}
# 3D printer (Bambu Lab): work step → text.
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
    """What to show right now – independent of the source."""

    phase: str = "off"            # off | delay | run | pause | attn | done | error | gone (unreachable)
    program: str | None = None
    step: str | None = None       # phase, work step or room
    pct: int | None = None
    end_ts: int | None = None     # end of remaining time or start time (chronometer up to it)
    start_ts: int | None = None   # without remaining time: running since
    extra: str | None = None      # extra info („Knitterschutz läuft“, „Schicht 12/80“, „32 m² in 45 Min.“)
    critical: str | None = None   # short text for the compact view
    message: str = ""
    minor: bool = False           # short pause/ending soon (WashData): silent, base color
    rest_since: int | None = None # vacuum: resting since (waiting for "done"), otherwise None
    restored: bool = False        # rebuilt from the stored activity after a restart/outage (phase only)
    tentative: bool = False       # WashData "starting": power detected, not yet a confirmed run
    detail_on_tick: bool = False  # send percent/extra only on the tick (printer: otherwise one message per layer)

    def signature(self) -> tuple:
        """What sends at once when it changes; everything else (progress, printer layers and routine steps
        such as AMS filament changes) follows on the interval tick. A changed start time sends at once."""
        start = self.end_ts // 60 if self.phase == "delay" and self.end_ts else None
        if self.detail_on_tick:
            return (self.phase, self.program, None, None, None, self.minor, start)
        return (self.phase, self.program, self.step, None, self.extra, self.minor, start)


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
    """Duration sensor in seconds (h/min/s by unit, no unit means minutes)."""
    n = _num(st)
    if n is None:
        return None
    u = _unit(st)
    return n * 3600 if u == "h" else n if u == "s" else n * 60


def _timestamp(st) -> int | None:
    """Timestamp sensor (program_finish_time, end_time, completion_time) → Unix seconds."""
    if st is None or st.state in ("unknown", "unavailable", "", None):
        return None
    d = dt_util.parse_datetime(str(st.state))
    if d is None:
        return None
    if d.tzinfo is None:
        d = dt_util.as_utc(d.replace(tzinfo=dt_util.get_default_time_zone()))
    return int(d.timestamp())


def _end_from(st, now: datetime) -> int | None:
    """Remaining time → end timestamp: a timestamp as is, a duration from the sensor's last update (not from
    now – a value that does not count down would otherwise drift by one tick on every evaluation)."""
    ts = _timestamp(st)
    if ts:
        return ts
    s = _seconds(st)
    if not s or s <= 0:
        return None
    base = getattr(st, "last_updated", None)
    base_ts = base.timestamp() if isinstance(base, datetime) and base.timestamp() <= now.timestamp() else now.timestamp()
    return int(base_ts + s)


def _gone(st) -> bool:
    """State entity missing or unreachable – no device state, derive nothing from it."""
    return st is None or str(st.state).strip().lower() in GONE_STATES


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
        return raw.strip()  # the integration's plain text („Baumwolle 40“) stays
    s = s.replace("_", " ").strip()
    return s[:1].upper() + s[1:]


def _join(*parts: str | None) -> str:
    return " · ".join(p for p in parts if p)


def _time_text(ts: int, lang: int) -> str:
    local = dt_util.as_local(dt_util.utc_from_timestamp(ts))
    return local.strftime("%H:%M") if lang == 0 else local.strftime("%-I:%M %p")


def snapshot(found: Found, get: Callable[[str], Any], now: datetime, lang: int, prev: Snap | None = None) -> Snap:
    """State of a found device as a snapshot. prev: last state (vacuum "done" on docking)."""
    f = found.fields
    g = lambda name: get(f[name]) if f.get(name) else None  # noqa: E731
    if found.kind == "vacuum":
        return _snap_vacuum(found, g, now, lang, prev)
    if found.kind == "printer":
        return _snap_printer(found, g, now, lang)
    return _snap_appliance(found, g, now, lang)


def _snap_appliance(found: Found, g, now: datetime, lang: int) -> Snap:
    if _gone(g("state")):
        return Snap(phase="gone")
    raw = str(getattr(g("state"), "state", "") or "").lower()
    ph = STATE_PHASE.get(raw, "off")
    s = Snap(phase=ph, tentative=raw == "starting")
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
        s.minor = raw == "paused" and found.source == "washdata"  # short automatic pause before the end
        s.critical = T["pause"][lang]
        s.message = _join(T["kurze_pause"][lang] if s.minor else T["pausiert"][lang], prog, pct_t)
    elif ph == "attn":
        s.critical = T["eingriff"][lang]
        s.message = _join(T["eingriff_noetig"][lang], prog)
    elif ph == "error":
        s.critical = T["fehler"][lang]
        s.message = _join(T["fehler"][lang], prog)
    elif ph == "delay":
        # Only the real start time – the program end is not one (otherwise „Startet <Endzeit>“).
        start = _end_from(g("start_in"), now)
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
    if _gone(g("state")):
        return Snap(phase="gone")
    vst = str(getattr(g("state"), "state", "") or "").lower()
    sst = _clean(g("status")).lower()
    if sst in GONE_STATES and sst:
        return Snap(phase="gone")
    raw = sst or vst
    if raw in VAC_STATION and (not prev or prev.phase in ("off", "done")):
        # Station work after "done" (or with no run before it, e.g. after the activity was cleared): never a new run
        return replace(prev) if prev and prev.phase == "done" else Snap(phase="off")
    if raw == "charger_disconnected" and prev and prev.phase == "pause":
        return replace(prev)  # lifted off the dock during a pause: still paused
    text = VAC_TEXT[raw][lang] if raw in VAC_TEXT else raw.replace("_", " ").capitalize()
    cleaning = raw in VAC_CLEANING
    if raw in ("error", "charging_problem"):
        ph = "error"
    elif raw == "paused":
        ph = "pause"
    elif raw in VAC_REST or not raw:
        ph = "off"
    elif raw in VAC_CLEANING or raw in VAC_STATION or raw in VAC_TEXT or (prev and prev.phase in ("run", "pause")):
        ph = "run"
    else:
        ph = "off"  # unknown code (e.g. air_drying_stopping, patrol) without a run: never starts an activity
    s = Snap(phase=ph)
    pct_n = _num(g("progress"))
    s.pct = max(0, min(100, int(pct_n))) if pct_n is not None else None
    room = _clean(g("room"))
    if ph == "off":
        # Back in the station after cleaning: "done" with area and duration – only after VAC_SETTLE_S
        # of rest (until then the last state stays silently), then until the done duration is over
        # (docking is the normal state for a vacuum, not a reason to clear).
        if prev and prev.restored and prev.phase != "done":
            return s  # after a restart/outage: no "done" derived from docking (who knows what happened)
        if prev and prev.phase in ("run", "pause"):
            since = prev.rest_since or int(now.timestamp())
            if now.timestamp() - since < VAC_SETTLE_S:
                return replace(prev, rest_since=since)
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
    # Progress/duration if the vacuum delivers them (Roborock: clean_percent, cleaning_area, cleaning_time):
    # cleaning time → "running since"; without it, _evaluate uses the start of the activity.
    secs = _seconds(g("time"))
    if secs is not None and secs >= 0 and ph in ("run", "pause"):
        s.start_ts = int(now.timestamp() - secs)
    area = _num(g("area"))
    if area and ph in ("run", "pause"):
        s.extra = T["flaeche"][lang].format(a=int(round(area)))
    if ph == "error":
        err = _clean(g("error")).replace("_", " ")
        s.critical = T["fehler"][lang]
        s.message = _join(text, err if err.lower() not in ("none", "no error") else None)
    elif ph == "pause":
        s.step = room or None
        s.critical = T["pause"][lang]
        s.message = _join(T["pausiert"][lang], room, s.extra, pct_t)
    else:
        s.step = room if cleaning and room else text
        s.critical = pct_t if cleaning and not room and pct_t else s.step
        s.message = _join(text, room if cleaning else None, s.extra if cleaning else None, pct_t)
    return s


def _snap_printer(found: Found, g, now: datetime, lang: int) -> Snap:
    if _gone(g("state")):
        return Snap(phase="gone")
    raw = str(getattr(g("state"), "state", "") or "").lower()
    ph = PRINT_PHASE.get(raw, "off")
    s = Snap(phase=ph, detail_on_tick=True)
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


def build_payload(snap: Snap, kind: str, title: str, tag: str, url: str, silent: bool,
                  color_key: str = "auto") -> dict[str, Any]:
    """Notification for notify.mobile_app_* – like the reference automations.

    color_key: chosen device color; done/pause/attention/error keep their signal colors."""
    color = PALETTE.get(color_key) or COLOR.get(kind, COLOR["washer"])
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
        when = snap.start_ts  # without remaining time: running since
    if when:
        d["chronometer"], d["when"] = True, int(when)
    return {"title": title, "message": snap.message, "data": d}


def clear_payload(tag: str) -> dict[str, Any]:
    return {"message": "clear_notification", "data": {"tag": tag}}


def probe_snapshot(kind: str, now: datetime, lang: int) -> Snap:
    """Sample for „Probe senden“: running, 42 %, 25 minutes left."""
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
    """Validate new settings from the Studio and merge them in (returns the changed copy).

    devices_replace: true → all device entries are complete in the call; missing devices count as
    default (entry removed), named ones are replaced. Without it: only the given keys change."""
    replace = bool(msg.get("devices_replace"))
    new = {"targets": list(cfg.get("targets") or []), "devices": {k: dict(v) for k, v in (cfg.get("devices") or {}).items()}}
    if replace and "devices" in msg:
        # The Studio sends all devices in full: replace instead of merge – otherwise an old
        # "on: false" stayed when "on" (the default) was not sent at all (user test 17.10.).
        new["devices"] = {}
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
            elif key == "color":
                if v != "auto" and v not in PALETTE:
                    raise ValueError(f"invalid color {v!r}")
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
        self.muted: dict[str, str] = {}               # after done/error has expired: phase that does not restart
        self.log: list[dict[str, Any]] = []
        self.found: list[Found] = []
        self.snaps: dict[str, Snap] = {}
        self.gone: set[str] = set()                   # currently unreachable
        self.url = "/"
        self.loaded = False
        self._unsubs: list = []
        self._unsub_states = None
        self._probe_timers: list = []
        self._pending: list = []  # collected registry follow-up (one timer)
        self._timers: dict[str, Any] = {}  # per device: state-change collector / vacuum settle check (one each)
        self._lock = asyncio.Lock()  # evaluations one after another: one step often changes several entities at once

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
        """HA events: start (resume), minute tick, registry changes (search again)."""
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
            # Devices come and go: search again in batches, not on every entry.
            if not pending:
                pending.append(async_call_later(self.hass, 5, _rescan_now))

        self._unsubs.append(self.hass.bus.async_listen(EVENT_DEVICE_REGISTRY_UPDATED, _registry))
        self._unsubs.append(self.hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, _registry))

    @callback
    def stop(self) -> None:
        for unsub in [*self._unsubs, self._unsub_states, *self._probe_timers, *self._pending, *self._timers.values()]:
            try:
                if unsub:
                    unsub()
            except Exception:  # noqa: BLE001 – already unsubscribed
                pass
        self._unsubs, self._unsub_states, self._probe_timers = [], None, []
        self._pending.clear()
        self._timers.clear()
        self.loaded = False

    async def _resume(self) -> None:
        await self.rescan()
        await self._find_url()
        known = {f.device_id for f in self.found}
        # Orphaned (device gone or off): end. Otherwise re-evaluate – still running → resend silently.
        async with self._lock:
            for dev in list(self.active):
                if dev not in known or not self.enabled(dev):
                    await self._clear(dev)
        for f in self.found:
            if self.enabled(f.device_id):
                await self._evaluate(f.device_id, "resume")

    async def rescan(self) -> None:
        try:
            self.found = find_devices(self.hass)
        except Exception:  # noqa: BLE001 – a broken registry must not stop Casora
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
                # Integrations update progress, area and status one entity at a time: collect them for
                # STATE_COLLECT_S and evaluate once (one update instead of three, never a stale value).
                self._later(f"state:{dev}", STATE_COLLECT_S, dev)

        self._unsub_states = async_track_state_change_event(self.hass, list(by_entity), _changed)

    def _later(self, key: str, delay: float, device_id: str) -> None:
        """(Re)start the one timer for key; when due, evaluate the device."""
        from homeassistant.helpers.event import async_call_later

        old = self._timers.pop(key, None)
        if old:
            old()

        @callback
        def _due(_now) -> None:
            self._timers.pop(key, None)
            if self.loaded:
                self.hass.async_create_task(self._evaluate(device_id, "state"), eager_start=False)

        self._timers[key] = async_call_later(self.hass, delay, _due)

    async def _find_url(self) -> None:
        """Casora phone dashboard as the tap target, otherwise the home page."""
        try:
            from .phone_badges import is_mobile

            data = self.hass.data.get("lovelace")
            dashboards = getattr(data, "dashboards", None) or {}
            for key, dash in dashboards.items():
                if not key:
                    continue
                try:
                    cfg = await dash.async_load(False)
                except Exception:  # noqa: BLE001 – empty or invalid dashboard
                    continue
                if isinstance(cfg, dict) and is_mobile(cfg):
                    self.url = f"/{key}/"
                    return
        except Exception:  # noqa: BLE001 – only the tap target
            pass
        self.url = "/"

    # ── Settings ───────────────────────────────────────────────────────────
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
                       "phase": "gone" if f.device_id in self.gone else self.snaps[f.device_id].phase if f.device_id in self.snaps else None}
                      for f in self.found],
            "notify_services": [f"notify.{s}" for s in notify_services(self.hass) if s.startswith("mobile_app_")],
            "log": list(reversed(self.log[-LOG_MAX:])),
            "active": sorted(self.active),
            "url": self.url,
            "test_runs": self._test_runs(),
        }

    def _test_runs(self) -> dict[str, str]:
        """Test house only: devices on which casora_mock.live_lauf plays a run (device_id → device)."""
        if not self.hass.services.has_service("casora_mock", "live_lauf"):
            return {}
        by_state = self.hass.data.get("casora_mock_live") or {}
        return {f.device_id: by_state[f.fields["state"]] for f in self.found if f.fields.get("state") in by_state}

    async def async_set(self, msg: dict) -> None:
        old_targets, new = set(self.targets), merge_settings(self.cfg, msg)
        self.cfg = new
        gone = sorted(old_targets - set(self.targets))
        # Deselected recipients: end running activities there (under the lock: no send can overtake the clear).
        async with self._lock:
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

    # ── Evaluation and sending ─────────────────────────────────────────────
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
        if not self.loaded:
            return
        if not f:
            # Device vanished from discovery (removed/renamed): clear its activity after GONE_MAX_S, so a
            # short registry reload does not end a running one.
            act = self.active.get(device_id)
            if act and reason == "tick":
                ts = dt_util.utcnow().timestamp()
                act.setdefault("orphan_at", ts)
                if ts - act["orphan_at"] >= GONE_MAX_S:
                    await self._clear(device_id)
                self._save()
            return
        now = dt_util.utcnow()
        lang = _lang(self.hass)
        prev = self.snaps.get(device_id)
        act = self.active.get(device_id)
        # After an outage, derive no "done" from docking (who knows what happened in between).
        if act and act.pop("orphan_at", None) is not None:
            self._save()
        base = prev if act and not act.get("gone_at") else None
        if act and base is None:
            # Restart or outage: only the stored phase is known (keeps "done" across station work)
            base = Snap(phase=act.get("phase") or "run", restored=True)
        snap = snapshot(f, self.hass.states.get, now, lang, base)
        was_gone = device_id in self.gone
        if snap.phase == "gone":
            # Unreachable: keep the last state, send nothing, end nothing – unless the done duration
            # is over or the device stays away too long (then clear silently).
            self.gone.add(device_id)
            if not act or not self.enabled(device_id):
                return
            if not act.get("gone_at"):
                act["gone_at"] = now.timestamp()
                self._save()
            if reason == "tick":
                st = device_settings(self.cfg, device_id)
                if act.get("phase") in ("done", "error") and act.get("done_at"):
                    if now.timestamp() - act["done_at"] >= st["done_min"] * 60:
                        self.muted[device_id] = act["phase"]
                        await self._clear(device_id)
                elif now.timestamp() - act["gone_at"] >= GONE_MAX_S:
                    await self._clear(device_id)
            return
        self.gone.discard(device_id)
        if act and act.pop("gone_at", None) is not None:
            self._save()
        if snap.phase in ("run", "pause") and snap.start_ts is None and snap.end_ts is None:
            # Without remaining time and without a duration from the device: "running since" from the start of the activity.
            since = dt_util.parse_datetime(str(act.get("since") or "")) if act else None
            snap.start_ts = int((since or now).timestamp())
        self.snaps[device_id] = snap
        if snap.rest_since and not (prev and prev.rest_since == snap.rest_since):
            # Vacuum settle started: check right when it ends instead of on the next minute tick.
            self._later(f"settle:{device_id}", VAC_SETTLE_S + 1, device_id)
        if not self.enabled(device_id):
            return
        st = device_settings(self.cfg, device_id)
        if snap.tentative and (not act or act.get("phase") in ("done", "error")):
            return  # WashData "starting" (power blip, anti-crease pulse): only "running" is a run; keeps muted
        if self.muted.get(device_id) == snap.phase:
            return  # done/error already shown and cleared – only a new state starts again
        self.muted.pop(device_id, None)
        if snap.phase == "off":
            if act and act.get("phase") in ("done", "error") and act.get("done_at") \
                    and now.timestamp() - act["done_at"] < st["done_min"] * 60:
                return  # done stays until the done duration (Home Connect jumps to „Bereit“ 60 s after „Fertig“)
            if act:
                await self._clear(device_id)
            return
        if (reason == "resume" or was_gone) and not act and snap.phase in ("done", "error"):
            # Switching on/restart/device reachable again: do not report an old done/error after the fact –
            # only the next run.
            self.muted[device_id] = snap.phase
            return
        if act and act.get("phase") in ("done", "error") and snap.phase in ("done", "error"):
            # done/error stays until the duration is over (intermediate updates there are nothing new).
            if reason == "tick" and act.get("done_at") and now.timestamp() - act["done_at"] >= st["done_min"] * 60:
                self.muted[device_id] = snap.phase
                await self._clear(device_id)
            return
        changed_phase = not act or act.get("phase") != snap.phase
        if not changed_phase and reason != "tick" and not was_gone and prev is not None \
                and prev.signature() == snap.signature():
            return
        if reason == "tick" and act and not changed_phase and now.timestamp() - act.get("sent_at", 0) < st["interval_min"] * 60 - 5:
            return
        # Restart: only report a real end loudly (before running/paused, now done/error).
        ended = bool(act) and act.get("phase") in ("run", "pause") and snap.phase in ("done", "error")
        # Resuming after a pause and a scheduled start (delay → run, e.g. at 2 am) go out silently: the user
        # started it or chose the time.
        quiet_run = bool(act) and act.get("phase") in ("pause", "delay") and snap.phase == "run"
        loud = changed_phase and (reason != "resume" or ended) and not snap.minor and not quiet_run
        if not changed_phase and not st["quiet"]:
            loud = True
        await self._send(f, snap, silent=not loud, now=now)

    async def _send(self, f: Found, snap: Snap, silent: bool, now: datetime) -> None:
        lang = _lang(self.hass)
        tag = self.tag_for(f)
        payload = build_payload(snap, f.kind, self._title(f, lang), tag, self.url, silent,
                                device_settings(self.cfg, f.device_id)["color"])
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
        if to:  # without recipients (already deselected and ended there) just forget
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
            except Exception as err:  # noqa: BLE001 – one broken recipient must not stop the others
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

        @callback
        def _due(_now) -> None:
            # @callback: runs in the event loop. A bare lambda made HA run it in a worker thread →
            # async_create_task from a foreign thread, traceback, the probe's clear never arrived.
            self.hass.async_create_task(_later(), eager_start=False)

        self._probe_timers.append(async_call_later(self.hass, PROBE_CLEAR_S, _due))
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
    vol.Optional("devices_replace"): bool,
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
