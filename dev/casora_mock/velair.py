"""A made-up air conditioner planned by a Velair-like scheduler (community card "Velair", issue #32).

"Testklimaanlage" is a plain climate (heat/cool/dry/fan only/auto, fan modes) under casora_mock. Beside it the test
house has what the HACS integration Velair (cgonfer/velair 1.8) puts into Home Assistant: one service device "Velair"
with its switch automatic_scheduling, the select mode and the sensors scheduler_status / next_climate_event plus the
zone sensors zone_control / zone_active_target_temperature / zone_override_state of the climate. These entities are
registered under the platform "velair" (registry_platform), so Casora detects Velair as it does in a real house; their
states are written directly (no velair integration is loaded).

Velair's schedules are no entities: setup() answers the WebSocket commands velair/get_schedule and
velair/subscribe_updates with a response shaped like Velair's (docs/developer/api.md) and registers the services
Casora calls – set_daily_schedule, copy_day_schedule, clear_schedule, pause_zone, resume_zone,
resume_automatic_control – which change the schedule and push an update. Names and the week are invented.
"""
from __future__ import annotations

import copy
import re

DEV = "testklimaanlage"
VDEV = "velair_test"
CLIMATE = f"climate.{DEV}"
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

_WORK = [
    {"start": "06:00", "action": "set_temperature", "temperature": 21.0, "hvac_mode": "heat"},
    {"start": "08:30", "action": "set_temperature", "temperature": 18.0},
    {"start": "16:30", "action": "set_temperature", "temperature": 21.5},
    {"start": "22:30", "action": "set_temperature", "temperature": 17.0},
]
_FREE = [
    {"start": "08:00", "action": "set_temperature", "temperature": 21.5, "hvac_mode": "heat"},
    {"start": "13:00", "action": "turn_off"},
    {"start": "15:00", "action": "set_temperature", "temperature": 21.0},
    {"start": "23:00", "action": "set_temperature", "temperature": 17.5},
]
WEEK = {d: copy.deepcopy(_FREE if d in ("saturday", "sunday") else _WORK) for d in WEEKDAYS}


def _e(eid, state, key, name, dev, attrs=None, dc=None, unit=None, cat=None, platform=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    e = {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev,
         "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
         "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat}
    if platform:
        e["registry_platform"] = platform
        e["unique_id"] = f"velair_mock_{eid.split('.', 1)[1]}"
    return e


def extra(now) -> dict:
    ents = [
        # Climate features: target temperature 1 | fan mode 8 | turn off 128 | turn on 256
        _e(CLIMATE, "heat", None, "Testklimaanlage", DEV,
           {"hvac_modes": ["off", "heat", "cool", "dry", "fan_only", "auto"], "hvac_action": "heating", "temperature": 21.0,
            "current_temperature": 20.4, "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5,
            "fan_modes": ["auto", "low", "medium", "high"], "fan_mode": "auto", "supported_features": 1 | 8 | 128 | 256}),
        _e("switch.velair_automatic_scheduling", "on", "automatic_scheduling", "Velair Automatische Planung", VDEV, platform="velair"),
        _e("select.velair_mode", "default", "mode", "Velair Modus", VDEV, {"options": ["default", "manual"]}, platform="velair"),
        _e("sensor.velair_scheduler_status", "scheduled", "scheduler_status", "Velair Status", VDEV,
           {"options": ["paused", "override_active", "scheduled", "idle", "temperature_migration_required"]}, dc="enum", platform="velair"),
        _e("sensor.velair_next_climate_event", "unknown", "next_climate_event", "Velair Nächstes Ereignis", VDEV, dc="timestamp", platform="velair"),
        _e(f"sensor.velair_control_{DEV}", "automatic", "zone_control", "Velair Steuerung Testklimaanlage", VDEV,
           {"options": ["automatic", "manual", "external"]}, dc="enum", platform="velair"),
        _e(f"sensor.velair_{DEV}_active_target", "21.0", "zone_active_target_temperature", "Velair Ziel Testklimaanlage", VDEV,
           {"entity_id": CLIMATE}, dc="temperature", unit="°C", platform="velair"),
        _e(f"sensor.velair_{DEV}_override", "none", "zone_override_state", "Velair Übersteuerung Testklimaanlage", VDEV,
           {"options": ["none", "boost", "paused", "disabled"]}, dc="enum", platform="velair"),
    ]
    return {
        "devices": [
            {"key": DEV, "name": "Testklimaanlage", "manufacturer": "Testklima", "model": "Split (Test)", "area": None},
            {"key": VDEV, "name": "Velair", "manufacturer": "Velair", "model": None, "area": None},
        ],
        "entities": ents,
    }


def _mins(s: str) -> int:
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(s))
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise ValueError(f"Invalid start time: {s}")
    return int(m.group(1)) * 60 + int(m.group(2))


def normalize(blocks) -> list[dict]:
    """Like Velair's normalize_schedule_blocks: valid HH:MM, no start twice, sorted, known actions."""
    out, seen = [], set()
    for b in blocks or []:
        m = _mins(b.get("start"))
        start = f"{m // 60:02d}:{m % 60:02d}"
        if start in seen:
            raise ValueError(f"Duplicate schedule start time: {start}")
        seen.add(start)
        action = b.get("action", "set_temperature")
        if action not in ("set_temperature", "set_hvac_mode", "set_climate_options", "turn_off"):
            raise ValueError(f"Unknown action: {action}")
        nb = {k: v for k, v in b.items() if v is not None}
        nb["start"], nb["action"] = start, action
        if action == "set_temperature" and nb.get("temperature") is None and nb.get("target_temp_low") is None:
            raise ValueError(f"Temperature block without a target: {start}")
        out.append(nb)
    return sorted(out, key=lambda x: _mins(x["start"]))


def active_block(week: dict, weekday: int, minute: int):
    """The block running at that time: the last one started this week before it (wraps over the week)."""
    for back in range(8):
        day = WEEKDAYS[(weekday - back) % 7]
        blocks = [b for b in week.get(day, []) if back > 0 or _mins(b["start"]) <= minute]
        if blocks:
            return blocks[-1]
    return None


def setup(hass, mock) -> None:
    import voluptuous as vol
    from homeassistant.components import websocket_api
    from homeassistant.core import callback
    from homeassistant.exceptions import HomeAssistantError
    from homeassistant.util import dt as dt_util

    state = {"week": copy.deepcopy(WEEK), "paused": False, "manual": False, "global": "auto"}
    subs: dict = {}

    def response() -> dict:
        now = dt_util.now()
        blk = active_block(state["week"], now.weekday(), now.hour * 60 + now.minute)
        st = "paused" if state["paused"] or state["global"] == "paused" else ("scheduled" if blk else "idle")
        rt = {"state": st, "control_mode": "manual" if state["manual"] else "automatic",
              "room_temperature": (hass.states.get(CLIMATE).attributes.get("current_temperature") if hass.states.get(CLIMATE) else None),
              "target_temperature": blk.get("temperature") if blk else None, "hvac_mode": hass.states.get(CLIMATE).state if hass.states.get(CLIMATE) else None}
        if state["paused"]:
            rt.update({"pause_count": 1, "pause_ids": [], "manual_pause": True, "until": None})
        return {
            "configured_entities": [CLIMATE], "temperature_unit": "°C", "home_assistant_temperature_unit": "°C",
            "temperature_migration": {"required": False, "reason": None}, "operation_recovery": None,
            "global": {"mode": state["global"], "paused_started_at": None, "paused_until": None, "active_profile_ids": [], "active_mode_id": None},
            "active_profile_ids": [], "profiles": [], "modes": [], "active_mode_id": None,
            "settings": {"first_weekday": "monday", "zone_order": [CLIMATE], "min_temperature": 16, "max_temperature": 30},
            "zones": {CLIMATE: {"enabled": True, "schedule": copy.deepcopy(state["week"]), "override": None}},
            "external_execution": {"systems": [], "zones": {}},
            "operational_status": "paused" if st == "paused" else "scheduled",
            "zone_runtime": {CLIMATE: rt}, "templates": [],
            "versions": {"integration": "1.8.0 (Testhaus)"},
        }

    def changed() -> None:
        mock.set(f"sensor.velair_{DEV}_override", "paused" if state["paused"] else "none")
        mock.set(f"sensor.velair_control_{DEV}", "manual" if state["manual"] else "automatic")
        payload = {"loaded": True, "schedule": response()}
        for key, (conn, sid) in list(subs.items()):
            try:
                conn.send_message(websocket_api.event_message(sid, payload))
            except Exception:  # noqa: BLE001
                subs.pop(key, None)

    base = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA

    @callback
    def ws_get(hass_, connection, msg):
        connection.send_result(msg["id"], response())

    @callback
    def ws_sub(hass_, connection, msg):
        sid = msg["id"]
        key = (id(connection), sid)
        subs[key] = (connection, sid)
        connection.subscriptions[sid] = lambda: subs.pop(key, None)
        connection.send_result(sid)
        connection.send_message(websocket_api.event_message(sid, {"loaded": True, "schedule": response()}))

    websocket_api.async_register_command(hass, "velair/get_schedule", ws_get, base.extend({vol.Required("type"): "velair/get_schedule"}))
    websocket_api.async_register_command(hass, "velair/subscribe_updates", ws_sub,
                                         base.extend({vol.Required("type"): "velair/subscribe_updates"}))

    def managed(call) -> str:
        eid = call.data.get("entity_id")
        if eid != CLIMATE:
            raise HomeAssistantError(f"{eid} is not managed by Velair")
        return eid

    async def set_day(call) -> None:
        managed(call)
        day = call.data.get("weekday")
        if day not in WEEKDAYS:
            raise HomeAssistantError(f"Unknown weekday: {day}")
        try:
            state["week"][day] = normalize(call.data.get("blocks"))
        except (ValueError, TypeError, AttributeError) as err:
            raise HomeAssistantError(str(err)) from err
        changed()

    async def copy_day(call) -> None:
        managed(call)
        src = state["week"].get(call.data.get("source_weekday"), [])
        for d in call.data.get("target_weekdays") or []:
            if d in WEEKDAYS:
                state["week"][d] = copy.deepcopy(src)
        changed()

    async def clear(call) -> None:
        managed(call)
        day = call.data.get("weekday")
        for d in ([day] if day else WEEKDAYS):
            state["week"][d] = []
        changed()

    async def pause(call) -> None:
        managed(call)
        state["paused"] = True
        changed()

    async def resume(call) -> None:
        managed(call)
        state["paused"] = False
        changed()

    async def resume_auto(call) -> None:
        managed(call)
        state["manual"] = False
        changed()

    async def manual(call) -> None:
        # Test helper (not Velair): put the climate into Manual adjustment.
        state["manual"] = bool(call.data.get("on", True))
        changed()

    async def reset(call) -> None:
        state.update({"week": copy.deepcopy(WEEK), "paused": False, "manual": False, "global": "auto"})
        changed()

    for name, fn in (("set_daily_schedule", set_day), ("copy_day_schedule", copy_day), ("clear_schedule", clear),
                     ("pause_zone", pause), ("resume_zone", resume), ("resume_automatic_control", resume_auto)):
        if not hass.services.has_service("velair", name):
            hass.services.async_register("velair", name, fn)
    hass.services.async_register("casora_mock", "velair_manuell", manual)
    hass.services.async_register("casora_mock", "velair_reset", reset)
