"""Geräte für Live-Aktivitäten finden – Entsprechung zu casoraLaundryFind (scripts/local/00-finden.js).

Erkannt wird wie im Dashboard: über die Plattform der Entitäten und ihren translation_key, nie über
Namen oder IDs. Ohne passende Plattform (Testhaus: alles casora_mock) reicht die Schlüssel-Kombination.
Die Quellen-IDs und Felder entsprechen den SOURCES im JS; dev/unit/live_finder_test.py liest sie dort aus
und vergleicht sie mit SOURCES hier – geht eine Seite auseinander, wird der Test rot.

Arten (kind): washer | dryer | dishwasher | vacuum | printer. Stufen (grade): „sehr gut“ (bei der Entwicklung
mit echten Geräten geprüft: Home Connect auch als Geschirrspüler, WashData, Saugroboter) und „ungetestet“
(Felder nach Dokumentation der Integration – aktiv, aber ohne Gewähr).

  find_devices(hass) → [Found]        (liest Geräte- und Entitäts-Registry)
  classify(ents, states) → Found|None (reine Logik; ents = Einträge eines Geräts, für Tests ohne HA)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

GRADE_GOOD = "sehr gut"
GRADE_UNTESTED = "ungetestet"


@dataclass
class Ent:
    """Eine Entität des Geräts, so viel wie der Finder braucht."""

    entity_id: str
    key: str | None = None
    platform: str | None = None
    category: str | None = None
    icon: str | None = None  # Symbol aus der Registry (WashData: Gerätetyp)

    @property
    def domain(self) -> str:
        return self.entity_id.partition(".")[0]


@dataclass
class Found:
    device_id: str
    kind: str
    source: str
    grade: str
    fields: dict[str, str | None]
    name: str = ""
    area: str | None = None
    model: str = ""
    how: str = "platform"

    @property
    def entity_ids(self) -> list[str]:
        return [e for e in self.fields.values() if e]

    def as_dict(self) -> dict[str, Any]:
        return {"device_id": self.device_id, "kind": self.kind, "source": self.source, "grade": self.grade,
                "name": self.name, "area": self.area, "state": self.fields.get("state"), "how": self.how}


def k(keys: str | list[str], domain: str = "sensor") -> dict[str, Any]:
    return {"keys": [keys] if isinstance(keys, str) else list(keys), "domain": domain}


def _has(ents: list[Ent], key: str, domain: str | None = None) -> bool:
    return any(e.key == key and (not domain or e.domain == domain) for e in ents)


def _opts(states: Callable[[str], Any], ents: list[Ent], keys: list[str]) -> str:
    """Optionen und Zustand der Programm-Entitäten, klein geschrieben, als ein Text."""
    out: list[str] = []
    for e in ents:
        if e.key not in keys:
            continue
        st = states(e.entity_id)
        if st is None:
            continue
        out.extend(str(o or "") for o in (st.attributes or {}).get("options") or [])
        out.append(str(st.state))
    return " ".join(out).lower()


def _hc_role(prog_keys: list[str]):
    """Home Connect: Waschen/Trocknen/Spülen steht im Programmschlüssel."""

    def role(states, ents: list[Ent], model: str) -> str | None:
        o = _opts(states, ents, prog_keys)
        if re.search(r"laundry_?care[._]washer", o) or _has(ents, "washer_temperature") or _has(ents, "prewash"):
            return "washer"
        if re.search(r"laundry_?care[._]dryer", o) or _has(ents, "drying_target"):
            return "dryer"
        if re.search(r"dishcare", o) or _has(ents, "sensor_salt") or _has(ents, "sensor_rinse_aid") or _has(ents, "select_rinse_aid"):
            return "dishwasher"
        return None

    return role


def _miele_role(states, ents, model):
    if _has(ents, "spin_speed") or _has(ents, "twin_dos_1_level"):
        return "washer"
    return "dryer" if _has(ents, "drying_step") else None


def _smartthings_role(states, ents, model):
    if _has(ents, "washer_machine_state") or _has(ents, "washer_job_state"):
        return "washer"
    return "dryer" if (_has(ents, "dryer_machine_state") or _has(ents, "dryer_job_state")) else None


def _lg_role(states, ents, model):
    if not _has(ents, "cycle_count"):
        return None
    return "dryer" if re.search(r"dryer", model, re.I) and not re.search(r"wash", model, re.I) else "washer"


def _washdata_role(states, ents, model):
    st = next((e for e in ents if e.key == "washer_state" and e.domain == "sensor"), None)
    s = states(st.entity_id) if st else None
    icon = str(((s.attributes if s else {}) or {}).get("icon") or (st.icon if st else "") or "")
    # WashData überwacht auch Geschirrspüler, Heißluftfritteusen und Pumpen – das Symbol sagt, was es ist.
    if re.search(r"dishwasher", icon):
        return "dishwasher"
    if re.search(r"pot-steam|water-pump|pump", icon):
        return None
    return "dryer" if re.search(r"tumble-dryer|dryer", icon) else "washer"


def _whirlpool_role(states, ents, model):
    if _has(ents, "washer_state"):
        return "washer"
    return "dryer" if _has(ents, "dryer_state") else None


def _other_role(states, ents, model):
    t = " ".join(e.key or "" for e in ents) + " " + model
    if re.search(r"wash|(^|[_ ])wm($|[_ ])|spin", t, re.I):
        return "washer"
    return "dryer" if re.search(r"dryer|tumble|(^|[_ ])td($|[_ ])|dry_level", t, re.I) else None


# Reihenfolge, Plattformen, need/any und Felder wie casoraLaundryFind.SOURCES (00-finden.js).
SOURCES: list[dict[str, Any]] = [
    {"id": "home_connect", "grade": GRADE_GOOD, "platforms": ["home_connect"], "need": ["operation_state"],
     "any": ["program_progress", "active_program", "selected_program", "program_finish_time"],
     "role": _hc_role(["active_program", "selected_program"]),
     "fields": {"state": k("operation_state"), "program": k(["active_program", "selected_program"], "select"),
                "select": k("selected_program", "select"), "remaining": k("program_finish_time"), "progress": k("program_progress"),
                "door": k("door"), "pause": k("pause_program", "button"), "resume": k("resume_program", "button"),
                "stop": k("stop_program", "button")}},
    {"id": "home_connect_alt", "grade": GRADE_GOOD, "platforms": ["home_connect_alt", "homeconnect_ws"], "need": ["sensor_operation_state"],
     "any": ["sensor_active_program", "select_program", "sensor_program_progress"],
     "role": _hc_role(["sensor_active_program", "select_program", "sensor_selected_program"]),
     "fields": {"state": k("sensor_operation_state"), "program": k(["sensor_active_program", "sensor_selected_program"]),
                "select": k("select_program", "select"), "remaining": k("sensor_remaining_program_time"),
                "progress": k("sensor_program_progress"), "phase": k("sensor_program_phase"), "door": k("binary_sensor_door_state", "binary_sensor"),
                "stop": k("button_abort_program", "button"), "pause": k("button_pause_program", "button"),
                "resume": k("button_resume_program", "button")},
     # Nur hier: Startverzögerung (Home Connect WS), nicht im JS-Finder.
     "extra": {"start_in": k("sensor_start_in")}},
    {"id": "miele", "grade": GRADE_UNTESTED, "platforms": ["miele"], "need": ["status"], "any": ["spin_speed", "drying_step", "twin_dos_1_level"],
     "role": _miele_role,
     "fields": {"state": k("status"), "program": k("program_id"), "phase": k(["program_phase", "drying_step"]),
                "remaining": k(["remaining_time", "finish"]), "elapsed": k(["elapsed_time", "start"]), "energy": k("energy_consumption"),
                "pause": k("pause", "button"), "stop": k("stop", "button")}},
    {"id": "smartthings", "grade": GRADE_UNTESTED, "platforms": ["smartthings"],
     "need": [], "any": ["washer_machine_state", "washer_job_state", "dryer_machine_state", "dryer_job_state"],
     "role": _smartthings_role,
     "fields": {"state": k(["washer_machine_state", "dryer_machine_state"]), "phase": k(["washer_job_state", "dryer_job_state"]),
                "program": k(["washer_mode", "dryer_mode"]), "remaining": k("completion_time"), "door": k("door", "binary_sensor"),
                "pause": k("pause", "button"), "resume": k("resume", "button"), "stop": k("stop", "button")}},
    {"id": "lg_thinq", "grade": GRADE_UNTESTED, "platforms": ["lg_thinq"], "need": ["current_state", "cycle_count"], "any": ["remain", "total"],
     "role": _lg_role,
     "fields": {"state": k("current_state"), "remaining": k("remain"), "elapsed": k("running"), "total": k("total"), "count": k("cycle_count")}},
    {"id": "washdata", "grade": GRADE_GOOD, "platforms": ["ha_washdata"], "need": ["washer_state"],
     "any": ["cycle_progress", "time_remaining", "program_select", "mark_unloaded", "cycle_count", "current_phase"],
     "role": _washdata_role,
     "fields": {"state": k("washer_state"), "program": k("washer_program"), "phase": k("current_phase"),
                "remaining": k("time_remaining"), "progress": k("cycle_progress"), "elapsed": k("elapsed_time"),
                "total": k("total_duration"), "count": k("cycle_count"), "energy": k("energy_total"), "power": k("current_power"),
                "running": k("running", "binary_sensor"), "select": k("program_select", "select"),
                "pause": k("pause_cycle", "button"), "resume": k("resume_cycle", "button"), "force": k("force_end_cycle", "button"),
                "unload": k("mark_unloaded", "button"), "suggest": k("suggestions")}},
    {"id": "whirlpool", "grade": GRADE_UNTESTED, "platforms": ["whirlpool"], "need": ["end_time"], "any": ["washer_state", "dryer_state"],
     "role": _whirlpool_role,
     "fields": {"state": k(["washer_state", "dryer_state"]), "remaining": k("end_time")}},
    {"id": "other", "grade": GRADE_UNTESTED, "platforms": ["hon", "electrolux_status", "electrolux", "smartthinq_sensors", "candy", "haier"],
     "need": None, "any": [],
     "role": _other_role,
     "fields": {"state": k(["machine_state", "mach_modes_wm", "mach_modes_td", "run_state", "appliance_state", "program_state",
                            "operation_state", "current_state", "status", "state"]),
                "program": k(["programs_wm", "programs_td", "program", "program_name", "current_course", "course"]),
                "phase": k(["program_phases_wm", "program_phases_td", "program_phase", "phase", "run_phase", "current_phase"]),
                "remaining": k(["remaining_time", "remain_time", "time_remaining", "remaining"]),
                "progress": k(["program_progress", "progress"]), "door": k(["door", "door_lock", "door_status"], "binary_sensor")}},
]

# Saugroboter: die vacuum-Entität genügt; Nachbarn (Roborock-Schlüssel) verfeinern Text und Fortschritt.
VACUUM_FIELDS = {"status": k("status"), "room": k("current_room"), "progress": k("clean_percent"),
                 "area": k("cleaning_area"), "time": k("cleaning_time"), "error": k("vacuum_error"),
                 "last_end": k("last_clean_end")}
# 3D-Drucker (Bambu Lab): Druckstatus ist der Anker.
PRINTER_FIELDS = {"state": k("print_status"), "stage": k("stage"), "progress": k("print_progress"),
                  "remaining": k("remaining_time"), "end": k("end_time"), "task": k("subtask_name"),
                  "layer": k("current_layer"), "layers": k("total_layers")}


def _pick(ents: list[Ent], spec: dict[str, Any]) -> str | None:
    for key in spec["keys"]:
        for e in ents:
            if e.key == key and e.domain == spec["domain"]:
                return e.entity_id
    return None


def _matches(src: dict[str, Any], ents: list[Ent]) -> str | None:
    if any(e.platform in src["platforms"] for e in ents):
        return "platform"
    if src["need"] is None:
        return None
    # Ein Gerät einer anderen bekannten Quelle ist es nicht (Whirlpool-Schlüssel an einem WashData-Gerät …).
    if any(o is not src and any(e.platform in o["platforms"] for e in ents) for o in SOURCES):
        return None
    ok = all(_has(ents, key) for key in src["need"]) and (not src["any"] or any(_has(ents, key) for key in src["any"]))
    return "keys" if ok else None


def classify(device_id: str, ents: list[Ent], states: Callable[[str], Any], model: str = "") -> Found | None:
    """Ein Gerät einordnen – oder None, wenn es kein Live-Gerät ist."""
    ents = [e for e in ents if states(e.entity_id) is not None]
    if not ents:
        return None
    # Saugroboter und Drucker zuerst: deren Nachbarn heißen „status“/„remaining_time“ wie bei Wäschequellen.
    vac = next((e for e in ents if e.domain == "vacuum"), None)
    if vac:
        f = {"state": vac.entity_id}
        f.update({n: _pick(ents, s) for n, s in VACUUM_FIELDS.items()})
        return Found(device_id, "vacuum", "vacuum", GRADE_GOOD, f, model=model)
    if _has(ents, "print_status", "sensor"):
        f = {n: _pick(ents, s) for n, s in PRINTER_FIELDS.items()}
        return Found(device_id, "printer", "bambu_lab", GRADE_UNTESTED, f, model=model)
    for src in SOURCES:
        how = _matches(src, ents)
        if not how:
            continue
        role = src["role"](states, ents, model)
        if not role:
            continue
        f = {n: _pick(ents, s) for n, s in src["fields"].items()}
        for n, s in (src.get("extra") or {}).items():
            f[n] = _pick(ents, s)
        if not f.get("state"):
            continue
        return Found(device_id, role, src["id"], src["grade"], f, model=model, how=how)
    return None


def find_devices(hass) -> list[Found]:
    """Alle Live-Geräte im Haus (Geräte- und Entitäts-Registry)."""
    from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er

    devs = dr.async_get(hass)
    ents = er.async_get(hass)
    areas = ar.async_get(hass)
    by_dev: dict[str, list[Ent]] = {}
    for e in ents.entities.values():
        if not e.device_id or e.disabled_by:
            continue
        by_dev.setdefault(e.device_id, []).append(Ent(e.entity_id, e.translation_key, e.platform, e.entity_category, e.icon or e.original_icon))
    out: list[Found] = []
    for dev_id, lst in by_dev.items():
        d = devs.async_get(dev_id)
        if not d or d.disabled_by or d.entry_type is not None:
            continue
        model = f"{d.model or ''} {d.model_id or ''}"
        f = classify(dev_id, sorted(lst, key=lambda e: e.entity_id), hass.states.get, model)
        if not f:
            continue
        f.name = d.name_by_user or d.name or ""
        a = areas.async_get_area(d.area_id) if d.area_id else None
        f.area = a.name if a else None
        out.append(f)
    out.sort(key=lambda f: (f.kind, f.name.lower(), f.device_id))
    return out
