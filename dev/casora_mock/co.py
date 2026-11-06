"""A made-up smoke and CO detector (community card "CO-Melder", issue #124; not in the demo house).

Like a Matter SmokeCoAlarm with CO concentration measurement: the CO reading (sensor, device_class carbon_monoxide,
ppm, state_class measurement), the CO alarm and the smoke alarm (binary_sensor carbon_monoxide / smoke, no
translation_key), the battery (sensor battery %, diagnostic), the battery alert (binary_sensor battery_alert), the
self-test (button self_test_request, binary_sensor test_in_progress) and the hardware fault (binary_sensor
hardware_fault). Names made up.
"""
from __future__ import annotations

from .testserver import _ent

DEV = "testmelder"


def extra(now) -> dict:
    ents = [
        _ent(f"sensor.{DEV}_kohlenmonoxid", "4", {"state_class": "measurement"}, "Testmelder Kohlenmonoxid",
             dc="carbon_monoxide", unit="ppm", dev=DEV),
        _ent(f"binary_sensor.{DEV}_kohlenmonoxid", "off", {}, "Testmelder Kohlenmonoxid", dc="carbon_monoxide", dev=DEV),
        _ent(f"binary_sensor.{DEV}_rauch", "off", {}, "Testmelder Rauch", dc="smoke", dev=DEV),
        _ent(f"sensor.{DEV}_batterie", "87", {"state_class": "measurement"}, "Testmelder Batterie", dc="battery", unit="%",
             cat="diagnostic", dev=DEV),
        _ent(f"binary_sensor.{DEV}_batteriewarnung", "off", {}, "Testmelder Batteriewarnung", dc="battery",
             key="battery_alert", cat="diagnostic", dev=DEV),
        _ent(f"button.{DEV}_selbsttest", "unknown", {}, "Testmelder Selbsttest", key="self_test_request",
             cat="config", dev=DEV),
        _ent(f"binary_sensor.{DEV}_test_laeuft", "off", {}, "Testmelder Test läuft", dc="running", key="test_in_progress",
             cat="diagnostic", dev=DEV),
        _ent(f"binary_sensor.{DEV}_geraetefehler", "off", {}, "Testmelder Gerätefehler", dc="problem", key="hardware_fault",
             cat="diagnostic", dev=DEV),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testmelder", "manufacturer": "Melderwerk", "model": "Rauch-CO 1", "area": None}],
        "entities": ents,
    }
