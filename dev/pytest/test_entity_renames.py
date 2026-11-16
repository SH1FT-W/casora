"""Issue #206: a light's entity ID changed in HA – Casora's dashboards and settings follow it.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_entity_renames.py -q

Reported: after changing a lamp's entity ID it was gone from its room's light badge and from the house's lighting
(tile and popup); adding it again with the new ID on the lighting tile did not bring it back, because the room's
badge (light_entity_N, where the house's lights come from) still held the old ID. Casora is set up for real, the
dashboards are stand-ins for HA's storage dashboards (lovelace is not loaded here), the renames go through HA's
entity registry. Expected: every exact old ID is the new one (a list holding both keeps one); templates, their
fingerprint, actions, longer texts, other and locked dashboards stay; renames in a burst are one pass and one save
with a version before; the settings get a backup first; renaming back undoes it.
"""

from __future__ import annotations

import copy
import json
import os
import shutil
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ha_common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

try:
    from pytest_homeassistant.common import async_fire_time_changed
except ImportError:  # HA 2026.10 and older
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

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


TEMPLATES = {"casora_light": {"variables": {"time_entity": "sensor.time", "x": OLD}},
             "casora_popup_alarm": {"variables": {"alarm_entity": OLD}}}


def _dashboard() -> dict:
    return {
        "casora_template_fingerprint": {"casora_light": "abc", OLD: "def"},
        "button_card_templates": copy.deepcopy(TEMPLATES),
        "views": [
            {"path": "home", "cards": [{"type": "custom:button-card", "template": "casora_light", "entity": "light.other",
                                        "variables": {"house": True, "lights": ["light.other", OLD, NEW],
                                                      "active_entities": ["light.other", OLD]}}]},
            {"path": "living", "cards": [
                {"type": "custom:button-card", "template": ["casora_room"],
                 "variables": {"light_entity_1": OLD, "light_entity_2": "light.other", "note": "[[[ return states['" + OLD + "'] ]]]"}},
                {"type": "custom:button-card", "template": "casora_light", "entity": OLD,
                 "variables": {"lights": [OLD, OLD + "_2"]},
                 "tap_action": {"action": "perform-action", "perform_action": "script.lamp_old", "target": {"entity_id": OLD}}},
            ]},
        ],
    }


def _mobile() -> dict:
    return {"casora_template_fingerprint": {}, "views": [{"cards": [{"template": "casora_mobile_bg"},
                                                                     {"entity": OLD}]}]}


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


def _dashes(hass: HomeAssistant, **dashes) -> None:
    from homeassistant.components.lovelace.const import LOVELACE_DATA  # noqa: PLC0415

    hass.data[LOVELACE_DATA] = MagicMock(dashboards=dashes)


async def _settle(hass: HomeAssistant) -> None:
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=2))
    await hass.async_block_till_done()


def _versions(hass: HomeAssistant, url: str) -> list[dict]:
    from custom_components.casora.versions import FOLDER, _Store  # noqa: PLC0415

    return _Store(hass.config.path(FOLDER), url).index()


async def test_rename_follows_in_dashboards_and_settings(hass: HomeAssistant, setup) -> None:
    from custom_components.casora.settings import _store  # noqa: PLC0415

    casora, mobile = FakeDash(_dashboard()), FakeDash(_mobile())
    foreign = FakeDash({"views": [{"cards": [{"type": "tile", "entity": OLD}]}]})
    _dashes(hass, **{"casora-home": casora, "casora-home-mobile": mobile, "other": foreign})
    settings0 = {"scenes": {"order": [OLD]}, "night_entity": OLD}
    await _store(hass).async_save(settings0)

    reg = er.async_get(hass)
    reg.async_get_or_create("light", "test", "lamp-1", suggested_object_id="lamp_old")
    reg.async_update_entity(OLD, new_entity_id=NEW)
    await _settle(hass)

    cfg = casora.cfg
    home = cfg["views"][0]["cards"][0]["variables"]
    room = cfg["views"][1]["cards"][0]["variables"]
    tile = cfg["views"][1]["cards"][1]
    # The room's badge, where the house's lights come from (the reporter's lamp).
    assert room["light_entity_1"] == NEW
    assert tile["entity"] == NEW and tile["variables"]["lights"] == [NEW, OLD + "_2"]
    assert tile["tap_action"] == {"action": "perform-action", "perform_action": "script.lamp_old", "target": {"entity_id": NEW}}
    # A list that already had the new ID (added again by hand) keeps it once.
    assert home["lights"] == ["light.other", NEW]
    assert home["active_entities"] == ["light.other", NEW]
    # Templates and their fingerprint stay byte for byte (else template_refresh keeps them as the user's).
    want = _dashboard()
    assert json.dumps(cfg["button_card_templates"]) == json.dumps(want["button_card_templates"])
    assert json.dumps(cfg["casora_template_fingerprint"]) == json.dumps(want["casora_template_fingerprint"])
    # Longer texts stay; other dashboards are not Casora's; the phone layout follows too.
    assert room["note"] == "[[[ return states['" + OLD + "'] ]]]"
    assert foreign.saves == 0
    assert mobile.cfg["views"][0]["cards"][1]["entity"] == NEW
    assert casora.saves == 1 and mobile.saves == 1
    # A version before (and after), desktop and phone together.
    vs = _versions(hass, "casora-home")
    assert [v["kind"] for v in vs][-1] == "initial" and len(vs) == 2, vs
    # Settings: rewritten, the old ones kept in casora_sicherungen.
    assert await _store(hass).async_load() == {"scenes": {"order": [NEW]}, "night_entity": NEW}
    folder = hass.config.path("casora_sicherungen")
    backups = [f for f in os.listdir(folder) if f.startswith("rename_")]
    assert len(backups) == 1
    with open(os.path.join(folder, backups[0]), encoding="utf-8") as fh:
        assert json.load(fh) == settings0

    # Renaming back undoes it.
    reg.async_update_entity(NEW, new_entity_id=OLD)
    await _settle(hass)
    assert casora.cfg["views"][1]["cards"][0]["variables"]["light_entity_1"] == OLD
    assert casora.cfg["views"][1]["cards"][1]["entity"] == OLD

    # Other changes (a name) write nothing.
    saves = casora.saves
    reg.async_update_entity(OLD, name="Lamp")
    await _settle(hass)
    assert casora.saves == saves


async def test_burst_chain_and_swap_one_save(hass: HomeAssistant, setup) -> None:
    from custom_components.casora.settings import _store  # noqa: PLC0415

    dash = FakeDash({"casora_template_fingerprint": {}, "views": [{"cards": [
        {"entity": "light.a", "variables": {"x": "light.b", "c": "light.c"}}]}]})
    _dashes(hass, **{"d": dash})
    reg = er.async_get(hass)
    for o in ("a", "b", "c"):
        reg.async_get_or_create("light", "test", o, suggested_object_id=o)
    # A swap through a temporary ID (a ↔ b) and a chain (c → d → e), all within the second.
    reg.async_update_entity("light.a", new_entity_id="light.tmp")
    reg.async_update_entity("light.b", new_entity_id="light.a")
    reg.async_update_entity("light.tmp", new_entity_id="light.b")
    reg.async_update_entity("light.c", new_entity_id="light.d")
    reg.async_update_entity("light.d", new_entity_id="light.e")
    await hass.async_block_till_done()
    assert dash.saves == 0  # nothing yet: collected first
    await _settle(hass)
    assert dash.saves == 1
    assert dash.cfg["views"][0]["cards"][0] == {"entity": "light.b", "variables": {"x": "light.a", "c": "light.e"}}
    assert await _store(hass).async_load() is None  # no settings: none written


async def test_reload_one_listener_and_bad_settings(hass: HomeAssistant, setup) -> None:
    from custom_components.casora.settings import _store  # noqa: PLC0415

    dash = FakeDash({"casora_template_fingerprint": {}, "views": [{"cards": [{"entity": OLD}]}]})
    _dashes(hass, **{"d": dash})
    with patch("custom_components.casora.async_register_built_in_panel"), patch("custom_components.casora.async_remove_panel"):
        assert await hass.config_entries.async_reload(setup.entry_id)
        await hass.async_block_till_done()
    store = _store(hass)
    reg = er.async_get(hass)
    reg.async_get_or_create("light", "test", "lamp-1", suggested_object_id="lamp_old")
    # A settings store that cannot be read: logged, the dashboards still follow.
    with patch.object(store, "async_load", AsyncMock(side_effect=ValueError("broken"))):
        reg.async_update_entity(OLD, new_entity_id=NEW)
        await _settle(hass)
    assert dash.saves == 1 and dash.cfg["views"][0]["cards"][0]["entity"] == NEW
    # Unloaded: nothing follows any more.
    with patch("custom_components.casora.async_remove_panel"):
        assert await hass.config_entries.async_unload(setup.entry_id)
        await hass.async_block_till_done()
    reg.async_update_entity(NEW, new_entity_id=OLD)
    await _settle(hass)
    assert dash.saves == 1


def test_replace_ids_exact_only() -> None:
    from custom_components.casora.entity_renames import compose, replace_entity_id  # noqa: PLC0415

    src = {OLD: 1, "k": [OLD, "x" + OLD, {"e": OLD}], "n": 3, "b": None, "service": OLD, "action": OLD}
    out, n = replace_entity_id(src, OLD, NEW)
    assert out == {NEW: 1, "k": [NEW, "x" + OLD, {"e": NEW}], "n": 3, "b": None, "service": OLD, "action": OLD} and n == 3
    assert src[OLD] == 1  # the input is not changed
    same = {"a": ["b"]}
    assert replace_entity_id(same, OLD, NEW) == (same, 0)
    # A key that exists in its new form already stays.
    assert replace_entity_id({OLD: 1, NEW: 2}, OLD, NEW) == ({OLD: 1, NEW: 2}, 0)
    assert compose(compose(compose({}, "a", "t"), "b", "a"), "t", "b") == {"a": "b", "b": "a", "t": "b"}
    assert compose(compose({}, "a", "b"), "b", "a") == {"b": "a"}
