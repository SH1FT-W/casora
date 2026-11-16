"""Follow entity ID renames in Casora's dashboards and settings (#206).

Casora's dashboards keep entity IDs as plain text (a tile's entity, a room badge's light_entity_1…10, a light tile's
"Popup lights", the house's lights …), and so do the Studio settings (.storage/casora.settings). When someone changes
an entity ID in Home Assistant, HA fires entity_registry_updated with action "update" and old_entity_id; nothing in
HA rewrites dashboards. Before, the lamp silently dropped out of its room and the house (the old ID has no state),
and adding it again with the new ID left the old one behind in the room's badge.

Now every string that is exactly the old ID becomes the new one: values, list items and dict keys, nothing inside
longer texts (templates "[[[ … ]]]" a user wrote stay as they are). A list that already holds the new ID loses the old
one instead of getting it twice. Only Casora dashboards in storage mode (casora_template_fingerprint, as
template_refresh.py) and Casora's settings store; the locked comparison dashboards of the test HAs stay. Renaming
back undoes it the same way.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def replace_entity_id(obj: Any, old: str, new: str) -> tuple[Any, int]:
    """obj with every string exactly `old` as `new` (a copy where something changed), and how many changed."""
    if isinstance(obj, str):
        return (new, 1) if obj == old else (obj, 0)
    if isinstance(obj, list):
        out: list = []
        n = 0
        has_new = new in obj
        for x in obj:
            if isinstance(x, str) and x == old and has_new:
                n += 1  # the list has the new ID already: the old one goes instead of a twin
                continue
            y, k = replace_entity_id(x, old, new)
            out.append(y)
            n += k
        return (out, n) if n else (obj, 0)
    if isinstance(obj, dict):
        res: dict = {}
        n = 0
        for key, val in obj.items():
            y, k = replace_entity_id(val, old, new)
            n += k
            if key == old and new not in obj:
                key = new
                n += 1
            res[key] = y
        return (res, n) if n else (obj, 0)
    return obj, 0


async def async_follow_rename(hass: HomeAssistant, old: str, new: str) -> list[str]:
    """Rewrite old → new in every Casora dashboard and the settings. Returns what changed (url paths, "settings")."""
    from .settings import _store as settings_store
    from .template_refresh import LOCKED, TEST_MARKER, _casora_dashboards, _lock

    changed: list[str] = []
    async with _lock(hass):
        test_ha = await hass.async_add_executor_job(os.path.isdir, hass.config.path(TEST_MARKER))
        for url, (dash, cfg) in (await _casora_dashboards(hass)).items():
            if test_ha and LOCKED.match(url):
                continue
            new_cfg, n = replace_entity_id(cfg, old, new)
            if not n:
                continue
            try:
                await dash.async_save(new_cfg)
            except Exception:  # noqa: BLE001 - one dashboard must not stop the others
                _LOGGER.exception("Casora: %s not updated to the new entity ID %s", url, new)
                continue
            changed.append(url)
            _LOGGER.info("Casora: dashboard %s follows the entity ID change %s → %s (%d places)", url, old, new, n)
        store = settings_store(hass)
        data = await store.async_load()
        new_data, n = replace_entity_id(data, old, new) if isinstance(data, dict) else (data, 0)
        if n:
            await store.async_save(new_data)
            changed.append("settings")
            _LOGGER.info("Casora: settings follow the entity ID change %s → %s (%d places)", old, new, n)
    return changed


@callback
def async_setup_entity_renames(hass: HomeAssistant) -> None:
    """Listen for entity ID changes while the entry is loaded (async_unload_entity_renames stops it)."""
    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("entity_renames_unsub"):
        return

    @callback
    def _is_rename(data: er.EventEntityRegistryUpdatedData) -> bool:
        return (data.get("action") == "update" and isinstance(data.get("old_entity_id"), str)
                and data["old_entity_id"] != data.get("entity_id"))

    @callback
    def _renamed(event: Event[er.EventEntityRegistryUpdatedData]) -> None:
        hass.async_create_task(async_follow_rename(hass, event.data["old_entity_id"], event.data["entity_id"]),
                               "casora entity rename", eager_start=False)

    dom["entity_renames_unsub"] = hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _renamed, event_filter=_is_rename)


@callback
def async_unload_entity_renames(hass: HomeAssistant) -> None:
    unsub = hass.data.get(DOMAIN, {}).pop("entity_renames_unsub", None)
    if unsub:
        unsub()
