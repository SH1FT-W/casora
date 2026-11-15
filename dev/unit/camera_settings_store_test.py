"""The house-wide camera detection list survives the settings store.

  uv run --python 3.14 --with homeassistant python dev/unit/camera_settings_store_test.py
"""

from __future__ import annotations

import asyncio
import inspect
import os
import sys
import unittest
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import settings  # noqa: E402


class FakeStore:
    def __init__(self):
        self.saved = None

    async def async_save(self, value):
        self.saved = value


class Connection:
    def __init__(self):
        self.results = []

    def send_result(self, mid, value):
        self.results.append((mid, value))


class CameraSettingsStoreTest(unittest.IsolatedAsyncioTestCase):
    async def test_camera_triggers_are_saved_with_the_house_camera_record(self):
        store = FakeStore()
        connection = Connection()
        hass = SimpleNamespace(data={})
        settings_store = settings._store
        settings._store = lambda _hass: store
        try:
            message = {
                "id": 1,
                "type": "casora/settings/set",
                "settings": {
                    "scenes": {"exclude": ["scene.olive"]},
                    "cameras": [{
                        "device_id": "garden",
                        "entity_id": "camera.garden",
                        "name": "Garden",
                        "detection_triggers": ["binary_sensor.garden_person", "event.garden_motion"],
                    }],
                    "unknown": {"ignored": True},
                },
            }
            await inspect.unwrap(settings.ws_set)(hass, connection, message)
        finally:
            settings._store = settings_store

        expected = {
            "scenes": {"exclude": ["scene.olive"]},
            "cameras": [{
                "device_id": "garden",
                "entity_id": "camera.garden",
                "name": "Garden",
                "detection_triggers": ["binary_sensor.garden_person", "event.garden_motion"],
            }],
        }
        self.assertEqual(store.saved, expected)
        self.assertEqual(connection.results, [(1, {"settings": expected, "stored": True})])


if __name__ == "__main__":
    unittest.main()
