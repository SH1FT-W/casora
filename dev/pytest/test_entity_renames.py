"""Issue #206: a light's entity ID changed in HA – Casora's dashboards and settings follow it.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_entity_renames.py -q

Reported: after changing a lamp's entity ID it was gone from its room's light badge and from the house's lighting
(tile and popup); adding it again with the new ID on the lighting tile did not bring it back, because the room's
badge (light_entity_N, where the house's lights come from) still held the old ID. Casora is set up for real, the
dashboards are stand-ins for HA's storage dashboards (lovelace is not loaded here), the rename goes through HA's
entity registry. Expected: every exact old ID is the new one (a list holding both keeps one), other dashboards,
longer texts and the locked comparison dashboards stay; renaming back undoes it.
"""

from __future__ import annotations

import copy
import os
import shutil
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ha_common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

DOMAIN = "casora"
OLD, NEW = "light.lamp_old", "light.lamp_new"


class FakeDash:
    mode = "storage"

    def __init__(self, cfg):
        self.cfg = cfg
        self.saves = 0

    async def async_load(self, force):
        return copy.deepcopy(self.cfg)

    async def async_save(self, cfg):
        self.cfg = copy.deepcopy(cfg)
        self.saves += 1


def _dashboard() -> dict:
    return {
        "casora_template_fingerprint": {"casora_light": "x"},
        "views": [
            {"path": "home", "cards": [{"type": "custom:button-card", "template": "casora_light", "entity": "light.other",
                                        "variables": {"house": True, "lights": ["light.other", OLD, NEW],
                                                      "active_entities": ["light.other", OLD]}}]},
            {"path": "living", "cards": [
                {"type": "custom:button-card", "template": ["casora_room"],
                 "variables": {"light_entity_1": OLD, "light_entity_2": "light.other", "note": "[[[ return states['" + OLD + "'] ]]]"}},
                {"type": "custom:button-card", "template": "casora_light", "entity": OLD,
                 "variables": {"lights": [OLD, OLD + "_2"]}},
            ]},
        ],
    }


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    hass.config.components.update({"frontend", "http", "lovelace"})
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "custom_components", DOMAIN)
    shutil.copytree(src, tmp_path / "custom_components" / DOMAIN, ignore=shutil.ignore_patterns("__pycache__", "rooms"))
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "persistent_notification", {})
    import custom_components.casora  # noqa: F401, PLC0415

    with patch("custom_components.casora.async_register_built_in_panel"), patch("custom_components.casora.async_remove_panel"):
        entry = MockConfigEntry(domain=DOMAIN, title="Casora", data={}, options={}, version=1, minor_version=2)
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        yield entry


async def test_rename_follows_in_dashboards_and_settings(hass: HomeAssistant, setup) -> None:
    from homeassistant.components.lovelace.const import LOVELACE_DATA  # noqa: PLC0415

    from custom_components.casora.settings import _store  # noqa: PLC0415

    casora, foreign = FakeDash(_dashboard()), FakeDash({"views": [{"cards": [{"type": "tile", "entity": OLD}]}]})
    hass.data[LOVELACE_DATA] = MagicMock(dashboards={"casora-home": casora, "other": foreign})
    await _store(hass).async_save({"scenes": {"order": [OLD]}, "night_entity": OLD})

    reg = er.async_get(hass)
    reg.async_get_or_create("light", "test", "lamp-1", suggested_object_id="lamp_old")
    assert reg.async_get(OLD)
    reg.async_update_entity(OLD, new_entity_id=NEW)
    await hass.async_block_till_done()

    cfg = casora.cfg
    home = cfg["views"][0]["cards"][0]["variables"]
    room = cfg["views"][1]["cards"][0]["variables"]
    tile = cfg["views"][1]["cards"][1]
    # The room's badge, where the house's lights come from (the reporter's lamp).
    assert room["light_entity_1"] == NEW
    assert tile["entity"] == NEW and tile["variables"]["lights"] == [NEW, OLD + "_2"]
    # A list that already had the new ID (added again by hand) keeps it once.
    assert home["lights"] == ["light.other", NEW]
    assert home["active_entities"] == ["light.other", NEW]
    # Longer texts stay; other dashboards are not Casora's.
    assert room["note"] == "[[[ return states['" + OLD + "'] ]]]"
    assert foreign.saves == 0
    assert await _store(hass).async_load() == {"scenes": {"order": [NEW]}, "night_entity": NEW}

    # Renaming back undoes it (the list keeps the one entry).
    reg.async_update_entity(NEW, new_entity_id=OLD)
    await hass.async_block_till_done()
    assert casora.cfg["views"][1]["cards"][0]["variables"]["light_entity_1"] == OLD
    assert casora.cfg["views"][1]["cards"][1]["entity"] == OLD

    # Other changes (a name) write nothing.
    saves = casora.saves
    reg.async_update_entity(OLD, name="Lamp")
    await hass.async_block_till_done()
    assert casora.saves == saves


def test_replace_entity_id_exact_only() -> None:
    from custom_components.casora.entity_renames import replace_entity_id  # noqa: PLC0415

    src = {OLD: 1, "k": [OLD, "x" + OLD, {"e": OLD}], "n": 3, "b": None}
    out, n = replace_entity_id(src, OLD, NEW)
    assert out == {NEW: 1, "k": [NEW, "x" + OLD, {"e": NEW}], "n": 3, "b": None} and n == 3
    assert src[OLD] == 1  # the input is not changed
    same = {"a": ["b"]}
    assert replace_entity_id(same, OLD, NEW) == (same, 0)
    # A key that exists in its new form already stays.
    assert replace_entity_id({OLD: 1, NEW: 2}, OLD, NEW) == ({OLD: 1, NEW: 2}, 0)
