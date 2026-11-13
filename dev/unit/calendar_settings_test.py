"""Calendar filter persistence through the settings WebSocket command.

Run: uv run --python 3.14 --with homeassistant python dev/unit/calendar_settings_test.py
"""

import inspect
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from custom_components.casora import settings, share


class CalendarSettingsTest(unittest.IsolatedAsyncioTestCase):
    def test_dashboard_export_leaves_calendar_filter_out(self):
        data = share.build_export(
            title="Mock home", url_path="casora-mock", config={"views": []}, mobile_url=None, mobile=None,
            settings={"calendar_filter": "Naam vrij, verlof", "calendars": [{"entity": "calendar.mock_day"}]}, photos={},
            version="26.11.26", exported="2026-11-13T10:00:00Z",
        )
        self.assertEqual(share.read_file(data)["settings"], {"calendars": [{"entity": "calendar.mock_day"}]})

    async def test_saved_filter_survives_readback_and_can_be_cleared(self):
        data = {}

        async def save(value):
            nonlocal data
            data = value

        store = SimpleNamespace(async_save=save, async_load=AsyncMock(side_effect=lambda: data))
        hass = SimpleNamespace(data={"casora": {"settings_store": store}})
        results = []
        connection = SimpleNamespace(send_result=lambda mid, result: results.append(result))
        command = inspect.unwrap(settings.ws_set)
        await command(hass, connection, {"id": 1, "settings": {
            "calendar_filter": "Naam vrij, verlof", "calendars": [{"entity": "calendar.mock_day"}],
        }})
        self.assertEqual(results[-1]["settings"]["calendar_filter"], "Naam vrij, verlof")
        self.assertEqual((await settings.async_load_settings(hass))["calendar_filter"], "Naam vrij, verlof")
        await command(hass, connection, {"id": 2, "settings": {"calendar_filter": ""}})
        self.assertNotIn("calendar_filter", await settings.async_load_settings(hass))


if __name__ == "__main__":
    unittest.main()
