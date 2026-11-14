"""A setup that fails in a late step rolls back (V27c, 14.11.2026).

Before: async_setup_entry registered listeners, timers and services step by step and had no cleanup when a later
step raised. HA marks the entry as setup_error and does not call async_unload_entry; the next try (reload or
restart of the entry) registered everything a second time.
"""

from __future__ import annotations

import os
import shutil
from collections import Counter
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ha_common import MockConfigEntry

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

DOMAIN = "casora"


@pytest.fixture
async def http(hass: HomeAssistant, tmp_path):
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    hass.config.components.update({"frontend", "http", "lovelace"})
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "custom_components", DOMAIN)
    shutil.copytree(src, tmp_path / "custom_components" / DOMAIN, ignore=shutil.ignore_patterns("__pycache__", "rooms"))
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "persistent_notification", {})
    return hass.http


@pytest.fixture
def panel():
    import custom_components.casora  # noqa: F401, PLC0415

    with patch("custom_components.casora.async_register_built_in_panel") as reg, \
         patch("custom_components.casora.async_remove_panel") as rem:
        yield reg, rem


def _snapshot(hass: HomeAssistant) -> tuple[Counter, int, int]:
    """Bus listeners per event, Casora services, and scheduled loop timers."""
    # homeassistant_final_write: one per Store with a pending delayed save (HA drops it after writing), not a leak.
    listeners = Counter({k: v for k, v in hass.bus.async_listeners().items() if v and k != "homeassistant_final_write"})
    services = len(hass.services.async_services().get(DOMAIN, {}))
    timers = len([t for t in hass.loop._scheduled if not t.cancelled()])  # noqa: SLF001 - test only
    return listeners, services, timers


def _entry(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title="Casora", data={}, options={}, version=1, minor_version=2)
    entry.add_to_hass(hass)
    return entry


async def _clean_baseline(hass: HomeAssistant) -> tuple[Counter, int, int]:
    """Counts after one normal setup + unload, so one-off things (HA's own listeners) are in both snapshots."""
    entry = _entry(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    loaded = _snapshot(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    return loaded


@pytest.mark.parametrize("step", ["live", "platforms", "update_push"])
async def test_failed_setup_rolls_back(hass: HomeAssistant, http, panel, step) -> None:
    loaded = await _clean_baseline(hass)
    after_unload = _snapshot(hass)

    entry = _entry(hass)
    boom = RuntimeError("simulated failure late in setup")
    target = {
        "live": ("custom_components.casora.live_activity.async_setup_live", AsyncMock(side_effect=boom)),
        "platforms": ("homeassistant.config_entries.ConfigEntries.async_forward_entry_setups",
                      AsyncMock(side_effect=boom)),
        "update_push": ("custom_components.casora.async_start_update_push", AsyncMock(side_effect=boom)),
    }[step]
    with patch(target[0], target[1]):
        assert not await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_ERROR

    # The failed try left nothing behind.
    failed = _snapshot(hass)
    assert failed[0] == after_unload[0], f"listeners left after the failed setup: {failed[0] - after_unload[0]}"
    assert failed[1] == after_unload[1], f"services left after the failed setup: {failed[1]} vs {after_unload[1]}"
    assert failed[2] <= after_unload[2], f"timers left after the failed setup: {failed[2]} vs {after_unload[2]}"
    assert "raumklima" not in hass.data.get(DOMAIN, {})
    assert "media_pause" not in hass.data.get(DOMAIN, {})

    # The next try registers everything once, not twice.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    again = _snapshot(hass)
    doubled = again[0] - loaded[0]
    assert not doubled, f"listeners registered twice after a failed setup: {dict(doubled)}"
    assert again[1] == loaded[1]
