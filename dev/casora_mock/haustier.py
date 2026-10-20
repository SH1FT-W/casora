"""A made-up pet with a Tractive tracker (community card #25, always present).

Like HA's Tractive integration (2026.10): the tracker hardware "Tracker <id>" carries the device_tracker, battery,
charging, status, live tracking, buzzer and LED; the pet hangs on it via via_device (activity, rest, sleep, daily goal)
and is the only place with the pet's name (issue #25). The device_tracker is diagnostic, as every tracker since
HA 2026.10. Keys as in HA, so scripts/local/26-haustier.js is checked against real HA entities. Names made up.
"""
from __future__ import annotations

PET = "testhund"
HW = "testhund_tracker"
# Tracker id as Tractive gives it; the device_tracker is named after it, not after the pet.
HW_NAME = "Tracker QXKZ7PLM"
TRACKER = "device_tracker.tracker_qxkz7plm"


def _ent(eid, state, attrs, name, dev, dc=None, unit=None, key=None, cat=None):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    # The state is what counts; the map takes lat/lon.
    tracker = {"source_type": "gps", "latitude": 52.5208, "longitude": 13.4095, "gps_accuracy": 8, "battery_level": 82}
    ents = [
        _ent(TRACKER, "home", tracker, HW_NAME, HW, key="tracker", cat="diagnostic"),
        _ent("sensor.testhund_activity_time", "72", {"state_class": "total"}, "Testhund Activity time", PET, dc="duration", unit="min", key="activity_time"),
        _ent("sensor.testhund_rest_time", "580", {"state_class": "total"}, "Testhund Rest time", PET, dc="duration", unit="min", key="rest_time"),
        _ent("sensor.testhund_daily_goal", "90", {}, "Testhund Daily goal", PET, dc="duration", unit="min", key="daily_goal"),
        _ent("sensor.testhund_day_sleep", "185", {"state_class": "total"}, "Testhund Day sleep", PET, dc="duration", unit="min", key="minutes_day_sleep"),
        _ent("sensor.testhund_night_sleep", "500", {"state_class": "total"}, "Testhund Night sleep", PET, dc="duration", unit="min", key="minutes_night_sleep"),
        _ent("sensor.tracker_testhund_battery", "82", {}, "Tracker Testhund Battery", HW, dc="battery", unit="%"),
        _ent("binary_sensor.tracker_testhund_charging", "off", {}, "Tracker Testhund Charging", HW, dc="battery_charging"),
        _ent("sensor.tracker_testhund_status", "operational", {"options": ["inaccurate_position", "not_reporting", "operational",
             "system_shutdown_user", "system_startup"]}, "Tracker Testhund Status", HW, dc="enum", key="tracker_state", cat="diagnostic"),
        _ent("switch.tracker_testhund_live_tracking", "off", {}, "Tracker Testhund Live tracking", HW, key="live_tracking"),
        _ent("switch.tracker_testhund_buzzer", "off", {}, "Tracker Testhund Buzzer", HW, key="tracker_buzzer"),
        _ent("switch.tracker_testhund_led", "off", {}, "Tracker Testhund LED", HW, key="tracker_led"),
    ]
    return {
        "devices": [
            {"key": HW, "name": HW_NAME, "manufacturer": "Tractive GmbH", "model": "TRNJA4", "area": None},
            {"key": PET, "name": "Testhund", "manufacturer": None, "model": None, "area": None, "via": HW},
        ],
        "entities": ents,
        # Places of the last days (hours back, state) - history in the popup.
        "_history": {TRACKER: {"steps": [
            [70, "home"], [52, "not_home"], [51, "home"], [28, "not_home"], [26.5, "home"], [6.5, "not_home"], [5.2, "home"],
        ]}},
    }
