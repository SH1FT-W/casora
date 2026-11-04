"""HA 2026.11 Marketplace (HACS built into HA, domain marketplace) next to the custom HACS (domain hacs).

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest -q          # HA 2026.10
  uv run --python 3.14 --prerelease=allow --with pytest-homeassistant pytest dev/pytest -q -p no:respx   # HA 2026.11+

On the first start with HA 2026.11 the Marketplace takes over HACS' registry entries
(homeassistant/components/marketplace/migration.py): device identifiers ("hacs", <GitHub id>) become
("marketplace", <GitHub id>), update entities get platform marketplace, unique_id stays the GitHub id.
A finished install that waits for a restart is a repair issue restart_required_<GitHub id>_<ref> under the
domain marketplace; the update entity's release notes and summary say nothing about it any more.
Registries and issue registry are HA's real ones here, the Marketplace itself is not loaded.
"""

from __future__ import annotations

from unittest.mock import patch

from ha_common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component

DOMAIN = "casora"


def _entry(hass: HomeAssistant, domain: str = DOMAIN) -> MockConfigEntry:
    entry = MockConfigEntry(domain=domain, title=domain, data={}, version=1, minor_version=2)
    entry.add_to_hass(hass)
    return entry


def _store_entity(hass: HomeAssistant, store: str, repo_id: str, object_id: str = "casora_update") -> str:
    """Update entity as HACS/the Marketplace registers it (platform = store, unique_id = GitHub id)."""
    store_entry = _entry(hass, "store_" + store)
    return er.async_get(hass).async_get_or_create("update", store, repo_id, suggested_object_id=object_id,
                                                  config_entry=store_entry).entity_id


def _store_device(hass: HomeAssistant, store: str, repo_id: str) -> None:
    store_entry = _entry(hass, "store_" + store)
    dr.async_get(hass).async_get_or_create(config_entry_id=store_entry.entry_id, identifiers={(store, repo_id)},
                                           name="Repo")


async def _overview(hass):
    from custom_components.casora import updates  # noqa: PLC0415

    with patch.object(updates, "fetch_releases", return_value=[]):
        return await updates.async_updates_overview(hass, force=True, lang="de")


# ── Casora managed by the Marketplace ────────────────────────────────────────

async def test_marketplace_entity_counts_as_hacs(hass: HomeAssistant, tmp_path) -> None:
    """Setup: the Marketplace's entry for Casora means no own update entity (else Casora shows up twice)."""
    from custom_components.casora import update  # noqa: PLC0415

    hass.config.config_dir = str(tmp_path)
    entry = _entry(hass)
    reg = er.async_get(hass)
    reg.async_get_or_create("update", DOMAIN, f"{entry.entry_id}_update", suggested_object_id="casora")
    eid = _store_entity(hass, "marketplace", update.UPDATE_REPO_ID)
    added = []
    await update.async_setup_entry(hass, entry, lambda ents, **k: added.extend(ents))
    assert added == [], "own update entity next to the Marketplace's"
    assert reg.async_get_entity_id("update", DOMAIN, f"{entry.entry_id}_update") is None
    assert hass.data[DOMAIN][update.DATA_HACS] is True
    assert update.casora_update_entity(hass, entry) == (eid, "hacs")


async def test_marketplace_device_only(hass: HomeAssistant) -> None:
    from custom_components.casora import update  # noqa: PLC0415

    assert update.store_of(hass, update.UPDATE_REPO_ID) is None
    _store_device(hass, "marketplace", update.UPDATE_REPO_ID)
    assert update.hacs_knows(hass, update.UPDATE_REPO_ID)
    assert update.store_of(hass, update.UPDATE_REPO_ID) == "marketplace"


async def test_overview_marketplace_link_and_restart(hass: HomeAssistant) -> None:
    from custom_components.casora import update  # noqa: PLC0415
    from custom_components.casora.const import VERSION  # noqa: PLC0415

    _entry(hass)
    eid = _store_entity(hass, "marketplace", update.UPDATE_REPO_ID)
    assert await update.async_hacs_managed(hass)
    hass.data[DOMAIN][update.DATA_HACS] = True
    a, b, c = (int(x) for x in VERSION.split("b")[0].split(".")[:3])
    new = f"{a}.{b}.{c + 1}"
    hass.states.async_set(eid, "on", {"latest_version": "v" + new, "installed_version": "v" + VERSION, "in_progress": False,
                                      "release_url": f"https://github.com/SH1FT-W/casora/releases/tag/v{new}"})
    d = await _overview(hass)
    assert d["entity_id"] == eid and d["via"] == "hacs" and d["store"] == "marketplace"
    # The Studio navigates inside the frontend: the Marketplace's route, not /hacs/ (a server redirect only).
    assert d["hacs_url"] == f"/marketplace/repository/{update.UPDATE_REPO_ID}"
    # Installed by the Marketplace, Casora keeps running the old version until the restart.
    hass.states.async_set(eid, "off", {"latest_version": "v" + new, "installed_version": "v" + new, "in_progress": False,
                                       "release_summary": None})
    d = await _overview(hass)
    assert d["pending_restart"] == new and not d["update_available"]


async def test_overview_hacs_still_hacs(hass: HomeAssistant) -> None:
    """HA 2026.10 with the custom HACS: unchanged, HACS' route."""
    from custom_components.casora import update  # noqa: PLC0415

    _entry(hass)
    eid = _store_entity(hass, "hacs", update.UPDATE_REPO_ID)
    assert await update.async_hacs_managed(hass)
    hass.data[DOMAIN][update.DATA_HACS] = True
    d = await _overview(hass)
    assert d["entity_id"] == eid and d["via"] == "hacs" and d["store"] == "hacs"
    assert d["hacs_url"] == f"/hacs/repository/{update.UPDATE_REPO_ID}"


# ── Restart pending: from repair issues ──────────────────────────────────────

def _issue(hass, domain, issue_id):
    ir.async_create_issue(hass, domain, issue_id, is_fixable=True, severity=ir.IssueSeverity.WARNING,
                          translation_key="restart_required", translation_placeholders={"name": "Repo"})


async def test_restart_pending_from_issues(hass: HomeAssistant) -> None:
    from custom_components.casora.updates import restart_pending_entities  # noqa: PLC0415

    mp = _store_entity(hass, "marketplace", "111", "repo_one")
    hacs = _store_entity(hass, "hacs", "222", "repo_two")
    _store_entity(hass, "marketplace", "333", "repo_three")
    assert restart_pending_entities(hass) == []
    _issue(hass, "marketplace", "restart_required_111_tags/v1.2.0")
    _issue(hass, "hacs", "restart_required_222_v2.0.0")
    _issue(hass, "marketplace", "restart_required_999_uninstall")  # removed repository: no entity
    _issue(hass, "other", "restart_required_333_x")                # someone else's issue
    assert restart_pending_entities(hass) == sorted([mp, hacs])
    ir.async_delete_issue(hass, "marketplace", "restart_required_111_tags/v1.2.0")
    assert restart_pending_entities(hass) == [hacs]


async def test_restart_subscription(hass: HomeAssistant, hass_ws_client) -> None:
    from custom_components.casora import updates  # noqa: PLC0415

    assert await async_setup_component(hass, "websocket_api", {})
    updates.async_setup_updates(hass)
    eid = _store_entity(hass, "marketplace", "111", "repo_one")
    client = await hass_ws_client(hass)
    await client.send_json({"id": 5, "type": "casora/updates/restarts"})
    msg = await client.receive_json()
    assert msg["success"], msg
    msg = await client.receive_json()
    assert msg["type"] == "event" and msg["event"] == {"entity_ids": []}
    _issue(hass, "marketplace", "restart_required_111_tags/v1.2.0")
    await hass.async_block_till_done()
    msg = await client.receive_json()
    assert msg["event"] == {"entity_ids": [eid]}
    ir.async_delete_issue(hass, "marketplace", "restart_required_111_tags/v1.2.0")
    await hass.async_block_till_done()
    msg = await client.receive_json()
    assert msg["event"] == {"entity_ids": []}


async def test_restart_subscription_first_install(hass: HomeAssistant, hass_ws_client) -> None:
    """A first install: the Marketplace files the restart issue before it adds the repository's update entity."""
    from custom_components.casora import updates  # noqa: PLC0415

    assert await async_setup_component(hass, "websocket_api", {})
    updates.async_setup_updates(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 7, "type": "casora/updates/restarts"})
    assert (await client.receive_json())["success"]
    assert (await client.receive_json())["event"] == {"entity_ids": []}
    _issue(hass, "marketplace", "restart_required_555_tags/v1.0.0")
    await hass.async_block_till_done()
    eid = _store_entity(hass, "marketplace", "555", "new_repo")
    await hass.async_block_till_done()
    msg = await client.receive_json()
    assert msg["event"] == {"entity_ids": [eid]}


async def test_marketplace_loaded_registry_still_hacs(hass: HomeAssistant) -> None:
    """HA 2026.11 with the Marketplace loaded but HACS' entries not taken over (yet): the store is the Marketplace
    (the frontend has no /hacs route any more, HACS cannot load next to it)."""
    from custom_components.casora import update  # noqa: PLC0415

    _store_entity(hass, "hacs", update.UPDATE_REPO_ID)
    assert update.store_of(hass, update.UPDATE_REPO_ID) == "hacs"
    hass.config.components.add("marketplace")
    assert update.store_of(hass, update.UPDATE_REPO_ID) == "marketplace"
    assert update.store_url(hass, update.UPDATE_REPO_ID) == f"/marketplace/repository/{update.UPDATE_REPO_ID}"
