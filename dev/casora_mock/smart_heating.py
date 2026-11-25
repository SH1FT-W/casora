"""A made-up room heated by a Smart-Heating-Control-like controller (community card "Smart Heating Control", #240).

The HACS integration Smart Heating Control (sandreialexandru/Smart-Heating-Control, domain advanced_climate) has no
climate entity: a house device and one device per room, each room with a "Decision" sensor whose attributes carry
the room and target temperature, heating, the level, the manual change, the schedule profiles with their days and
the next change (custom_components/advanced_climate/sensor.py DecisionSensor). The test house has one invented house
"Testheizung" and one room "Testheizraum" with the room's and the house's entities under the platform
"advanced_climate" (registry_platform) and the real translation_keys (entity.py ROOM_ENTITY_KEYS/HOUSE_ENTITY_KEYS);
their states are written directly (no advanced_climate integration is loaded).

setup() registers the services Casora calls – advanced_climate.set_override, clear_override, set_schedule – and
answers select.select_option on the room's profile select (call_service event, as coffee.py), each changing the
room like the integration does and writing the Decision sensor again. Names, levels and the week are invented.
"""
from __future__ import annotations

import copy
import re
from datetime import datetime, timedelta

HOUSE = "testheizung"
ROOM = "testheizraum"
DECISION = f"sensor.{ROOM}_decision"
PROFILE_SELECT = f"select.{ROOM}_schedule_profile"
MODE_SELECT = f"select.{HOUSE}_mode"
ROOM_TEMP = f"sensor.{ROOM}_room_temperature"
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
PRESETS = ["home", "sleep", "eco", "away", "comfort", "activity"]
LEVELS = {"home": 21.0, "sleep": 18.0, "eco": 17.0, "away": 12.0, "comfort": 22.0, "activity": 20.0}
ROOM_C = 20.4

SCHEDULE = {
    "workday": [{"time": "00:00", "preset": "sleep"}, {"time": "06:00", "preset": "home"}, {"time": "08:30", "preset": "eco"},
                {"time": "16:30", "preset": "home"}, {"time": "22:00", "preset": "sleep"}],
    "weekend": [{"time": "00:00", "preset": "sleep"}, {"time": "08:00", "preset": "comfort"}, {"time": "23:00", "preset": "sleep"}],
    "home_office": [{"time": "00:00", "preset": "sleep"}, {"time": "07:00", "preset": "home"}, {"time": "22:30", "preset": "sleep"}],
}
PROFILE_DAYS = {
    "workday": {"days": "workday", "enabled": True},
    "weekend": {"days": "weekend", "enabled": True},
    "home_office": {"days": ["wed"], "enabled": False},
}


def _mins(s: str) -> int:
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(s).strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise ValueError(f"Invalid time '{s}'")
    return int(m.group(1)) * 60 + int(m.group(2))


def parse_profiles(profiles) -> dict:
    """Like schedule.py profiles_from_dict: name -> [{time, preset}], known levels, no time twice, sorted."""
    if not isinstance(profiles, dict) or not profiles:
        raise ValueError('profiles must be an object: profile name -> list of {"time", "preset"}')
    out = {}
    for name, slots in profiles.items():
        if not isinstance(slots, list) or not slots:
            raise ValueError(f'Profile "{name}": give a list of {{"time", "preset"}}')
        seen, rows = set(), []
        for slot in slots:
            if not isinstance(slot, dict) or "time" not in slot or "preset" not in slot:
                raise ValueError(f'Profile "{name}": every slot needs "time" and "preset"')
            m = _mins(slot["time"])
            preset = str(slot["preset"]).strip().lower()
            if preset not in PRESETS:
                raise ValueError(f"unknown preset '{slot['preset']}'")
            if m in seen:
                raise ValueError(f"two slots start at {slot['time']}")
            seen.add(m)
            rows.append({"time": f"{m // 60:02d}:{m % 60:02d}", "preset": preset})
        out[str(name).strip().lower()] = sorted(rows, key=lambda x: _mins(x["time"]))
    return out


def overlap(a, b) -> bool:
    """schedule.py overlap: all days overlaps workdays and weekend days; chosen weekdays when they share a day."""
    if isinstance(a, list) and isinstance(b, list):
        return bool(set(a) & set(b))
    if isinstance(a, list) or isinstance(b, list):
        return False
    return "all" in (a, b) or a == b


def profile_for(days: dict, weekday: int):
    """schedule.py Schedule.profile_for without calendar and holidays (Monday–Friday are workdays)."""
    active = [(n, d["days"]) for n, d in days.items() if d.get("enabled")]
    for name, d in active:
        if isinstance(d, list) and WEEKDAYS[weekday] in d:
            return name
    kind = "workday" if weekday < 5 else "weekend"
    for wanted in (kind, "all"):
        for name, d in active:
            if d == wanted:
                return name
    return None


def lookup(schedule: dict, days: dict, now: datetime):
    """(profile today, level now, next change, next level) – a slot lasts until the next one, across midnight."""
    def slots(day):
        p = profile_for(days, day.weekday())
        return p, ([(_mins(s["time"]), s["preset"]) for s in schedule.get(p, [])] if p else [(0, "frost")])

    today = now.date()
    profile, own = slots(today)
    minute = now.hour * 60 + now.minute
    cur = [lvl for m, lvl in own if m <= minute]
    level = cur[-1] if cur else slots(today - timedelta(days=1))[1][-1][1]
    for add in range(0, 8):
        day = today + timedelta(days=add)
        for m, lvl in slots(day)[1]:
            if (add or m > minute) and lvl != level:
                at = datetime(day.year, day.month, day.day, m // 60, m % 60, tzinfo=now.tzinfo)
                return profile, level, at, lvl
    return profile, level, None, None


def _e(eid, state, key, name, dev, attrs=None, dc=None, unit=None, cat=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev,
            "area": None, "original_name": name, "name": None, "icon": None, "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat,
            "registry_platform": "advanced_climate", "unique_id": f"shc_mock_{eid.split('.', 1)[1]}"}


ROOM_ENTITIES = {
    "decision": DECISION, "target_temperature": f"sensor.{ROOM}_target_temperature", "room_temperature": ROOM_TEMP,
    "next_change": f"sensor.{ROOM}_next_change", "heat_demand": f"binary_sensor.{ROOM}_heat_demand",
    "window_open": f"binary_sensor.{ROOM}_window_open", "manual_override": f"binary_sensor.{ROOM}_manual_override",
    "schedule_profile": PROFILE_SELECT, "clear_override": f"button.{ROOM}_clear_override",
}
HOUSE_ENTITIES = {"mode": MODE_SELECT, "presence": f"sensor.{HOUSE}_presence"}


def decision_attrs(state: dict, now: datetime) -> tuple[str, dict]:
    """The Decision sensor's state and attributes for the room's state (sensor.py DecisionSensor)."""
    profile, level, at, nxt = lookup(state["schedule"], state["days"], now)
    ov = state["override"]
    if ov:
        rule, preset = "manual_override", ov.get("preset")
        target = LEVELS[preset] if preset else ov.get("temperature")
    else:
        rule, preset = ("schedule", level) if level != "frost" else ("frost_protection", None)
        target = LEVELS.get(level, 5.0)
    heating = target is not None and ROOM_C < target - 0.2
    return rule, {
        "room_id": "testheizraum_subentry", "entry_id": "testheizung_entry", "room_name": "Testheizraum",
        "reason": "Schedule", "reason_key": rule, "reason_params": {}, "target_kind": "preset" if preset else "temperature",
        "preset": preset, "temperature_unit": "°C", "target_temperature": target, "held_at": None,
        "current_temperature": ROOM_C, "offsets": [], "presence": "home", "window_open": False,
        "override": copy.deepcopy(ov), "profile": profile, "next_change": at.isoformat() if at else None, "next_preset": nxt,
        "plan": [], "schedule": copy.deepcopy(state["schedule"]), "profile_days": copy.deepcopy(state["days"]),
        "schedule_error": None, "schedule_editable": True, "presets": PRESETS, "preset_names": {p: p for p in PRESETS},
        "levels": dict(LEVELS), "min_temperature": 5.0, "max_temperature": 30.0, "climate_entities": [],
        "heat_demand": heating, "heating": heating, "day_boundary": 0, "source": "climate", "custom_levels": True,
        "house_name": "Testheizung", "entities": dict(ROOM_ENTITIES), "house_entities": dict(HOUSE_ENTITIES),
        "device_class": "enum", "options": ["schedule", "manual_override", "frost_protection", "window_open"],
    }


def _initial() -> dict:
    return {"schedule": copy.deepcopy(SCHEDULE), "days": copy.deepcopy(PROFILE_DAYS), "override": None, "chosen": None}


def extra(now) -> dict:
    st = _initial()
    rule, attrs = decision_attrs(st, now if now.tzinfo else now.astimezone())
    attrs["friendly_name"] = "Testheizraum Entscheidung"
    ents = [
        {**_e(DECISION, rule, "decision", "Testheizraum Entscheidung", ROOM), "attributes": attrs, "device_class": "enum"},
        _e(f"sensor.{ROOM}_target_temperature", str(attrs["target_temperature"]), "target_temperature", "Testheizraum Zieltemperatur", ROOM,
           {"preset": attrs["preset"], "state_class": "measurement"}, dc="temperature", unit="°C"),
        _e(ROOM_TEMP, str(ROOM_C), "room_temperature", "Testheizraum Raumtemperatur", ROOM, {"state_class": "measurement"},
           dc="temperature", unit="°C", cat="diagnostic"),
        _e(f"sensor.{ROOM}_next_change", attrs["next_change"] or "unknown", "next_change", "Testheizraum Nächster Wechsel", ROOM,
           {"next_preset": attrs["next_preset"], "profile": attrs["profile"]}, dc="timestamp"),
        _e(f"binary_sensor.{ROOM}_heat_demand", "on" if attrs["heat_demand"] else "off", "heat_demand", "Testheizraum Wärmebedarf", ROOM, dc="heat"),
        _e(f"binary_sensor.{ROOM}_window_open", "off", "window_open", "Testheizraum Fenster offen", ROOM, dc="window"),
        _e(f"binary_sensor.{ROOM}_manual_override", "off", "manual_override", "Testheizraum Manuelle Änderung", ROOM),
        _e(PROFILE_SELECT, attrs["profile"] or "workday", "schedule_profile", "Testheizraum Profil", ROOM,
           {"options": list(SCHEDULE), "today": attrs["profile"]}),
        _e(f"button.{ROOM}_clear_override", "unknown", "clear_override", "Testheizraum Manuelle Änderung löschen", ROOM),
        _e(MODE_SELECT, "auto", "mode", "Testheizung Modus", HOUSE, {"options": ["auto", "away", "vacation", "off", "summer"]}),
        _e(f"sensor.{HOUSE}_presence", "home", "presence", "Testheizung Anwesenheit", HOUSE,
           {"options": ["home", "nearby", "far"], "advanced_climate_house": True, "temperature_unit": "°C"}, dc="enum"),
    ]
    return {
        "devices": [
            {"key": HOUSE, "name": "Testheizung", "manufacturer": "Smart Heating Control", "model": "House", "area": None},
            {"key": ROOM, "name": "Testheizraum", "manufacturer": "Smart Heating Control", "model": "Room", "area": None},
        ],
        "entities": ents,
    }


def setup(hass, mock) -> None:
    from homeassistant.core import callback
    from homeassistant.exceptions import HomeAssistantError
    from homeassistant.util import dt as dt_util

    state = _initial()

    def write() -> None:
        rule, attrs = decision_attrs(state, dt_util.now())
        if DECISION in mock.store:
            # mock.set keeps an attribute it gets as None; override and next change may become None.
            mock.store[DECISION][1].update({k: v for k, v in attrs.items() if k != "friendly_name"})
        mock.set(DECISION, rule)
        mock.set(f"sensor.{ROOM}_target_temperature", str(attrs["target_temperature"]))
        mock.set(f"binary_sensor.{ROOM}_manual_override", "on" if state["override"] else "off")
        mock.set(f"binary_sensor.{ROOM}_heat_demand", "on" if attrs["heat_demand"] else "off")
        mock.set(PROFILE_SELECT, state["chosen"] if state["chosen"] and state["days"][state["chosen"]]["enabled"] else (attrs["profile"] or "workday"),
                 options=list(state["schedule"]), today=attrs["profile"])
        if attrs["next_change"]:
            mock.set(f"sensor.{ROOM}_next_change", attrs["next_change"], next_preset=attrs["next_preset"], profile=attrs["profile"])

    def mine(call) -> None:
        ids = call.data.get("entity_id") or []
        ids = [ids] if isinstance(ids, str) else list(ids)
        room = call.data.get("room")
        if DECISION not in ids and str(room or "").lower() not in ("testheizraum", "testheizraum_subentry"):
            raise HomeAssistantError("room_not_found")

    async def set_override(call) -> None:
        mine(call)
        preset, temp = call.data.get("preset"), call.data.get("temperature")
        if (preset is None) == (temp is None):
            raise HomeAssistantError("preset_or_temperature")
        if preset is not None and str(preset).lower() not in PRESETS:
            raise HomeAssistantError(f"unknown_preset {preset}")
        hours = float(call.data.get("duration_hours") or 2.0)
        now = dt_util.now()
        state["override"] = {"description": "Manual change", "since": now.isoformat(), "until": (now + timedelta(hours=hours)).isoformat(),
                             "mode": "fixed", "origin": "card", "source_device": None, "devices": [], "interrupted": False, "applied": True,
                             "preset": str(preset).lower() if preset is not None else None,
                             "temperature": float(temp) if temp is not None else None}
        write()

    async def clear_override(call) -> None:
        state["override"] = None
        write()

    async def set_schedule(call) -> None:
        mine(call)
        profiles, text = call.data.get("profiles"), call.data.get("schedule")
        if (profiles is None) == (text is None):
            raise HomeAssistantError("schedule_or_profiles")
        if text is not None:
            raise HomeAssistantError("Casora sends profiles, not the text format")
        try:
            parsed = parse_profiles(profiles)
        except (ValueError, TypeError, AttributeError) as err:
            raise HomeAssistantError(f"invalid_schedule: {err}") from err
        days = call.data.get("profile_days")
        if days is None:
            # Without new days the profiles keep theirs; a new one is off.
            days = {n: state["days"].get(n, {"days": "all", "enabled": False}) for n in parsed}
        state["schedule"], state["days"] = parsed, copy.deepcopy(days)
        write()

    def activate(name: str) -> None:
        """room.py _activate_profiles: the profile on, the active ones sharing its days off."""
        if name not in state["schedule"]:
            return
        chosen = state["days"][name]["days"]
        for other, item in state["days"].items():
            if other != name and item["enabled"] and overlap(chosen, item["days"]):
                item["enabled"] = False
        state["days"][name]["enabled"] = True
        state["chosen"] = name
        write()

    @callback
    def called(event) -> None:
        d = event.data
        if d.get("domain") != "select" or d.get("service") != "select_option":
            return
        data = d.get("service_data") or {}
        ids = data.get("entity_id") or []
        ids = [ids] if isinstance(ids, str) else list(ids)
        if PROFILE_SELECT in ids and data.get("option"):
            activate(str(data["option"]))
        if MODE_SELECT in ids and data.get("option"):
            mock.set(MODE_SELECT, str(data["option"]))

    async def reset(call) -> None:
        state.clear()
        state.update(_initial())
        write()

    for name, fn in (("set_override", set_override), ("clear_override", clear_override), ("set_schedule", set_schedule)):
        if not hass.services.has_service("advanced_climate", name):
            hass.services.async_register("advanced_climate", name, fn)
    hass.bus.async_listen("call_service", called)
    hass.services.async_register("casora_mock", "smart_heating_reset", reset)
    write()
