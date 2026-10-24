"""Three made-up robot lawn mowers for the test house (always there, also without the private fixture).

* "Testmäher" – like the Gardena smart system: a lawn_mower entity with activity, error code, battery and radio link
  in its attributes, on the same device battery, connectivity and hours sensors plus three buttons.
* "Rasenpilot" – like Husqvarna Automower (HA core): mower without attributes, on the device battery (device class),
  charging, error (enum), next start (timestamp), mode, restricted reason, work area, blade usage and running time
  (duration in seconds), cutting height (number 1–9), schedule switch, confirm-error button.
* "Grasfuchs" – like Worx Landroid (HACS landroid_cloud): battery (key battery), error (enum), RSSI (dBm), next schedule,
  rain delay (number, remaining, rain sensor), blade runtime (min), MQTT connectivity, cutting height (mm, step 5),
  zone select.

This is how the mower card (scripts/local/16-maeher.js SOURCES) is checked against real HA entities. Everything runs
under casora_mock – Casora picks the source by the translation_keys. Names made up.
"""
from __future__ import annotations

from datetime import timedelta

DEV = "testmaeher"
BASE = "testmaeher"
HQ = "rasenpilot"
LR = "grasfuchs"


def _ent(eid, state, attrs, name, dc=None, unit=None, key=None, device=DEV, cat=None):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": cat}


def _gardena(now):
    mower = {"battery_level": 100, "battery_state": "OK", "rf_link_level": 90, "rf_link_state": "ONLINE",
             "operating_hours": 1234, "state": "OK", "activity": "PARKED_TIMER", "last_error_code": None,
             "supported_features": 7}
    return [
        _ent(f"lawn_mower.{BASE}_lawn_mower", "docked", mower, "Testmäher Lawn Mower"),
        _ent(f"sensor.{BASE}_battery_level", "100", {}, "Testmäher Battery Level", dc="battery", unit="%"),
        _ent(f"binary_sensor.{BASE}_online", "on", {}, "Testmäher Online", dc="connectivity"),
        _ent(f"sensor.{BASE}_operating_hours", "1234", {}, "Testmäher Operating Hours", unit="h"),
        _ent(f"sensor.{BASE}_rf_link_quality", "90", {}, "Testmäher RF Link Quality", unit="%"),
        _ent(f"sensor.{BASE}", "no_message", {"options": ["no_message", "trapped", "lifted", "outside_working_area", "unknown"]},
             "Testmäher", dc="enum", key="mower_error"),
        _ent(f"button.{BASE}_park_until_further_notice", "unknown", {}, "Testmäher Park Until Further Notice"),
        _ent(f"button.{BASE}_return_to_dock", "unknown", {}, "Testmäher Return to Dock"),
        _ent(f"button.{BASE}_start_mowing_now", "unknown", {}, "Testmäher Start Mowing Now"),
    ]


def _husqvarna(now):
    d = HQ
    nxt = (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=3)).isoformat()
    e = lambda eid, st, name, **kw: _ent(eid, st, kw.pop("attrs", {}), "Rasenpilot " + name, device=d, **kw)  # noqa: E731
    return [
        _ent(f"lawn_mower.{d}", "docked", {"supported_features": 7}, "Rasenpilot", device=d),
        e(f"sensor.{d}_battery", "87", "Battery", dc="battery", unit="%"),
        e(f"binary_sensor.{d}_charging", "on", "Charging", dc="battery_charging"),
        e(f"sensor.{d}_error", "no_error", "Error", dc="enum", key="error",
          attrs={"options": ["no_error", "trapped", "lifted", "outside_working_area", "no_loop_signal", "stuck_in_charging_station", "unknown"]}),
        e(f"sensor.{d}_next_start", nxt, "Next start", dc="timestamp", key="next_start_timestamp"),
        e(f"sensor.{d}_mode", "main_area", "Mode", dc="enum", key="mode", attrs={"options": ["main_area", "demo", "secondary_area", "home", "poi"]}),
        e(f"sensor.{d}_restricted_reason", "week_schedule", "Restricted reason", dc="enum", key="restricted_reason",
          attrs={"options": ["none", "week_schedule", "park_override", "sensor", "daily_limit", "fota", "frost", "all_work_areas_completed", "external"]}),
        e(f"sensor.{d}_work_area", "Vorgarten", "Work area", dc="enum", key="work_area",
          attrs={"options": ["Vorgarten", "Hinter dem Haus", "no_work_area_active"], "work_area_id_assignment": {"1": "Vorgarten", "2": "Hinter dem Haus"}}),
        e(f"sensor.{d}_cutting_blade_usage_time", "46800", "Cutting blade usage time", dc="duration", unit="s", key="cutting_blade_usage_time", cat="diagnostic"),
        e(f"sensor.{d}_total_running_time", "1234800", "Total running time", dc="duration", unit="s", key="total_running_time", cat="diagnostic"),
        e(f"sensor.{d}_total_cutting_time", "1000800", "Total cutting time", dc="duration", unit="s", key="total_cutting_time", cat="diagnostic"),
        e(f"number.{d}_cutting_height", "5", "Cutting height", key="cutting_height", cat="config", attrs={"min": 1, "max": 9, "step": 1, "mode": "slider"}),
        e(f"switch.{d}_enable_schedule", "on", "Enable schedule", key="enable_schedule"),
        e(f"switch.{d}_vorgarten", "on", "Vorgarten", key="work_area_work_area"),
        e(f"switch.{d}_hinter_dem_haus", "on", "Hinter dem Haus", key="work_area_work_area"),
        e(f"button.{d}_confirm_error", "unknown", "Confirm error", key="confirm_error"),
        e(f"button.{d}_sync_clock", "unknown", "Sync clock", key="sync_clock"),
    ]


def _landroid(now):
    d = LR
    nxt = (now.replace(minute=30, second=0, microsecond=0) + timedelta(hours=18)).isoformat()
    e = lambda eid, st, name, **kw: _ent(eid, st, kw.pop("attrs", {}), "Grasfuchs " + name, device=d, **kw)  # noqa: E731
    return [
        _ent(f"lawn_mower.{d}", "docked", {"supported_features": 7}, "Grasfuchs", device=d),
        e(f"sensor.{d}_battery", "64", "Battery", dc="battery", unit="%", key="battery", attrs={"battery_charging": False}),
        e(f"sensor.{d}_error", "no_error", "Error", dc="enum", key="error", cat="diagnostic",
          attrs={"options": ["unknown", "no_error", "trapped", "lifted", "wire_missing", "outside_wire", "rain_delay", "blade_motor_blocked", "battery_low"]}),
        e(f"sensor.{d}_rssi", "-67", "RSSI", dc="signal_strength", unit="dBm", key="rssi", cat="diagnostic"),
        e(f"sensor.{d}_next_scheduled_start", nxt, "Next scheduled start", dc="timestamp", key="next_schedule"),
        e(f"sensor.{d}_rain_delay_remaining", "0", "Rain delay remaining", dc="duration", unit="min", key="rain_delay_remaining"),
        e(f"sensor.{d}_blade_runtime_since_reset", "2130", "Blade runtime since reset", dc="duration", unit="min", key="blade_runtime_current", cat="diagnostic"),
        e(f"sensor.{d}_blade_runtime_total", "8640", "Blade runtime total", dc="duration", unit="min", key="blade_runtime_total", cat="diagnostic"),
        e(f"sensor.{d}_mower_runtime_total", "41220", "Mower runtime total", dc="duration", unit="min", key="mower_runtime_total", cat="diagnostic"),
        e(f"binary_sensor.{d}_mqtt", "on", "MQTT", dc="connectivity", key="mqtt_connected"),
        e(f"binary_sensor.{d}_rain_sensor", "off", "Rain sensor", dc="moisture", key="rain_sensor", cat="diagnostic"),
        e(f"binary_sensor.{d}_charging", "off", "Charging", dc="battery_charging", key="charging", cat="diagnostic"),
        e(f"number.{d}_rain_delay", "120", "Rain delay", unit="min", key="rain_delay", cat="config", attrs={"min": 0, "max": 1440, "step": 1, "mode": "box"}),
        e(f"number.{d}_cutting_height", "45", "Cutting height", unit="mm", key="cutting_height", cat="config", attrs={"min": 20, "max": 60, "step": 5, "mode": "slider"}),
        e(f"select.{d}_zone", "1", "Zone", key="zone", cat="config", attrs={"options": ["1", "2", "3", "4"]}),
        e(f"switch.{d}_party_mode", "off", "Party mode", key="party_mode", cat="config"),
        e(f"button.{d}_edge_cut", "unknown", "Edge cut", key="edge_cut"),
    ]


def extra(now) -> dict:
    ents = _gardena(now) + _husqvarna(now) + _landroid(now)
    return {
        "devices": [{"key": DEV, "name": "Testmäher", "manufacturer": "Gardena", "model": "smart Mower", "area": None},
                    {"key": HQ, "name": "Rasenpilot", "manufacturer": "Husqvarna", "model": "Automower 430X NERA", "area": None},
                    {"key": LR, "name": "Grasfuchs", "manufacturer": "Worx", "model": "Landroid Vision", "area": None}],
        "entities": ents,
        # Mowing runs of the last days (hours back, state) – history in the popup. Gardena: an error yesterday.
        "_history": {
            f"lawn_mower.{BASE}_lawn_mower": {"steps": [
                [100, "docked"], [98, "mowing"], [96.2, "returning"], [96, "docked"],
                [74, "mowing"], [73, "paused"], [72.6, "mowing"], [71.5, "docked"],
                [50, "mowing"], [48.8, "docked"],
                [28, "mowing"], [27.2, "error"], [26.5, "docked"],
                [6, "mowing"], [4.5, "returning"], [4.3, "docked"],
            ]},
            f"lawn_mower.{HQ}": {"steps": [
                [100, "docked"], [52, "mowing"], [50.5, "returning"], [50.3, "docked"],
                [30, "mowing"], [28.4, "docked"], [8, "mowing"], [7, "docked"],
            ]},
            f"lawn_mower.{LR}": {"steps": [
                [100, "docked"], [45, "mowing"], [44, "edgecut"], [43.5, "returning"], [43.3, "docked"],
                [20, "mowing"], [19.5, "rain_delayed"], [19, "docked"],
            ]},
        },
        # "Park until further notice" sends it to the station (state only; the activity stays a matter of the tests).
        "_buttons": {f"button.{BASE}_park_until_further_notice": {f"lawn_mower.{BASE}_lawn_mower": "docked"}},
    }
