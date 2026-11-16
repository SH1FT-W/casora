"""Follow entity ID renames in Casora's dashboards and settings (#206).

Casora's dashboards keep entity IDs as plain text (a tile's entity, a room badge's light_entity_1…10, a light tile's
"Popup lights", the house's lights …), and so do the Studio settings (.storage/casora.settings). When someone changes
an entity ID in Home Assistant, HA fires entity_registry_updated with action "update" and old_entity_id; nothing in
HA rewrites dashboards. Before, the lamp silently dropped out of its room and the house (the old ID has no state),
and adding it again with the new ID left the old one behind in the room's badge.

Now every string that is exactly an old ID becomes the new one: values, list items and dict keys, nothing inside
longer texts (templates "[[[ … ]]]" a user wrote stay as they are). Left alone:
  - button_card_templates and casora_template_fingerprint: shipped templates hold IDs of their own (sensor.time,
    input_select.casora_*); a changed template no longer matches its fingerprint and template_refresh would keep it
    as the user's forever. Only the scene picks the Studio copies into them follow (replace_scene_picks; a template
    that was Casora's stays Casora's: its stored print moves along),
  - values under service / perform_action / action: renaming the entity script.foo does not rename its action.
A list (or dict) that already holds the new ID loses the old one instead of getting it twice.

Renames are collected for a second (renaming a device renames all its entities, one event each) into one mapping –
a→b then b→c is a→c, a swap through a temporary ID stays a swap – and applied in one pass: one save per dashboard,
with a version before and after (Studio › Versions, origin "rename"; a run of renames shares one version and
they never push the user's own saves out, versions.py), the settings with a copy in /config/casora_sicherungen
first (the newest BACKUPS_KEEP stay). Only Casora dashboards in storage mode (casora_template_fingerprint); the locked
comparison dashboards of the test HAs stay. Renaming back undoes it. Not followed: renames while Casora is not
loaded, YAML dashboards, www/casora/einstellungen.js, stored versions.
"""

from __future__ import annotations

import copy
import json
import logging
import os
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

DELAY = 1.0
# Keys whose values are never rewritten (anywhere in the tree), and top-level keys of a dashboard left out.
SKIP_KEYS = frozenset({"service", "perform_action", "action"})
SKIP_TOP = frozenset({"button_card_templates", "casora_template_fingerprint"})
# Settings backups (casora_sicherungen/rename_*_settings.json) kept.
BACKUPS_KEEP = 5


def compose(mapping: dict[str, str], old: str, new: str) -> dict[str, str]:
    """mapping (old → new, applied at once) followed by the rename old → new."""
    out = {k: (new if v == old else v) for k, v in mapping.items()}
    if old not in out:
        out[old] = new
    return {k: v for k, v in out.items() if k != v}


def _dedupe(items: list, changed: list[bool]) -> list:
    """Drop a changed string that equals an unchanged one, or an earlier changed one."""
    keep_unchanged = {x for x, c in zip(items, changed) if not c and isinstance(x, str)}
    seen: set = set()
    out = []
    for x, c in zip(items, changed):
        if c and isinstance(x, str):
            if x in keep_unchanged or x in seen:
                continue
            seen.add(x)
        out.append(x)
    return out


def replace_ids(obj: Any, mapping: dict[str, str], skip_top: frozenset = frozenset()) -> tuple[Any, int]:
    """obj with every string exactly a key of mapping as its value (a copy where something changed), and how many."""
    if not mapping:
        return obj, 0
    if isinstance(obj, str):
        return (mapping[obj], 1) if obj in mapping else (obj, 0)
    if isinstance(obj, list):
        n = 0
        items, changed = [], []
        for x in obj:
            y, k = replace_ids(x, mapping)
            items.append(y)
            changed.append(bool(k) and isinstance(x, str))
            n += k
        return (_dedupe(items, changed), n) if n else (obj, 0)
    if isinstance(obj, dict):
        n = 0
        res: dict = {}
        new_keys = {}
        for key, val in obj.items():
            if key in SKIP_KEYS or key in skip_top:
                res[key] = val
                continue
            y, k = replace_ids(val, mapping)
            n += k
            res[key] = y
        # Keys: renamed unless two would end up the same (then the renamed one keeps its old key).
        keys = list(res)
        target = {k: (mapping[k] if isinstance(k, str) and k in mapping else k) for k in keys}
        while True:
            count: dict = {}
            for k in keys:
                count[target[k]] = count.get(target[k], 0) + 1
            clash = [k for k in keys if target[k] != k and count[target[k]] > 1]
            if not clash:
                break
            for k in clash:
                target[k] = k
        moved = sum(1 for k in keys if target[k] != k)
        if moved:
            res = {target[k]: v for k, v in res.items()}
            n += moved
        return (res, n) if n else (obj, 0)
    return obj, 0


def replace_scene_picks(templates: Any, mapping: dict[str, str], prints: Any = None) -> tuple[Any, Any, int]:
    """Inside button_card_templates only the scene picks the Studio copies there (template_print.apply_scene_pick:
    casora_scene_row's variables, the nav's and room filter overlays' scene keys). Returns (templates, fingerprint,
    count). The nav's and the scene row's picks are outside the fingerprint; an overlay's are inside, so a template
    whose stored print matched before gets its new print (it stays Casora's for template_refresh), any other print
    stays as it is (the template was the user's already)."""
    from .template_print import (_MISSING, FILTER_OVERLAY, NAV, SCENE_KEYS, SCENE_LIST_KEYS, SCENE_ROW, _each,
                                 print_matches, template_print)

    if not isinstance(templates, dict) or not mapping:
        return templates, prints, 0
    out = dict(templates)
    fp = dict(prints) if isinstance(prints, dict) else prints
    total = 0
    for name, tpl in templates.items():
        t = copy.deepcopy(tpl)
        n = 0

        def put(o: dict, keys: tuple) -> None:
            nonlocal n
            for k in keys:
                if k in o:
                    o[k], c = replace_ids(o[k], mapping)
                    n += c

        if name == SCENE_ROW and isinstance(t, dict) and isinstance(t.get("variables"), dict):
            put(t["variables"], SCENE_KEYS)

        def fn(o: dict) -> None:
            if o.get("type") == NAV:
                put(o, SCENE_KEYS)
            elif o.get("type") == FILTER_OVERLAY and o.get("room"):
                put(o, SCENE_LIST_KEYS)

        _each(t, fn)
        if not n:
            continue
        # Casora's before (any print form template_refresh accepts): Casora's after.
        if isinstance(fp, dict) and print_matches(fp.get(name, _MISSING), tpl, _MISSING, name):
            fp[name] = template_print(t, name)
        out[name] = t
        total += n
    return (out, fp, total) if total else (templates, prints, 0)


def replace_dashboard(cfg: Any, mapping: dict[str, str]) -> tuple[Any, int]:
    """A Casora dashboard: everything but the templates and their fingerprint, in the templates the scene picks."""
    from .template_print import FINGERPRINT_KEY

    new_cfg, n = replace_ids(cfg, mapping, SKIP_TOP)
    if isinstance(cfg, dict) and "button_card_templates" in cfg:
        tpl, fp, k = replace_scene_picks(cfg["button_card_templates"], mapping, cfg.get(FINGERPRINT_KEY))
        if k:
            new_cfg = dict(new_cfg)
            new_cfg["button_card_templates"] = tpl
            if FINGERPRINT_KEY in cfg:
                new_cfg[FINGERPRINT_KEY] = fp
            n += k
    return new_cfg, n


def replace_entity_id(obj: Any, old: str, new: str) -> tuple[Any, int]:
    """One rename (see replace_ids)."""
    return replace_ids(obj, {old: new})


async def async_follow_renames(hass: HomeAssistant, mapping: dict[str, str]) -> list[str]:
    """Rewrite mapping in every Casora dashboard and the settings. Returns what changed (url paths, "settings")."""
    from .settings import _store as settings_store
    from .template_refresh import LOCKED, TEST_MARKER, _casora_dashboards, _is_mobile, _lock
    from .versions import _snap

    changed: list[str] = []
    if not mapping:
        return changed
    async with _lock(hass):
        test_ha = await hass.async_add_executor_job(os.path.isdir, hass.config.path(TEST_MARKER))
        dashes = await _casora_dashboards(hass)
        todo: dict[str, dict] = {}
        for url, (_dash, cfg) in dashes.items():
            if test_ha and LOCKED.match(url):
                continue
            new_cfg, n = replace_dashboard(cfg, mapping)
            if n:
                todo[url] = new_cfg
        # Desktop and its phone layout together (one version for both), as template_refresh.py.
        groups: dict[str, str | None] = {}
        for url in todo:
            head = url
            if url.endswith("-mobile") and _is_mobile(dashes[url][1]) and url.removesuffix("-mobile") in dashes:
                head = url.removesuffix("-mobile")
            mob = head + "-mobile"
            groups[head] = mob if mob in dashes and _is_mobile(dashes[mob][1]) else None
        for head, mob in groups.items():
            urls = [u for u in (head, mob) if u and u in todo]
            try:
                await _snap(hass, head, mob, {"kind": "initial"})
                for u in urls:
                    await dashes[u][0].async_save(todo[u])
                await _snap(hass, head, mob, {"kind": "save", "summary": json.dumps({"origin": "rename", "renamed": mapping})})
            except Exception:  # noqa: BLE001 - one dashboard must not stop the others
                _LOGGER.exception("Casora: %s not updated to the new entity IDs", ", ".join(urls))
                continue
            changed.extend(urls)
            _LOGGER.info("Casora: %s follow entity ID changes %s", ", ".join(urls), mapping)
        try:
            store = settings_store(hass)
            data = await store.async_load()
            new_data, n = replace_ids(data, mapping) if isinstance(data, dict) else (data, 0)
            if n:
                folder = hass.config.path("casora_sicherungen")
                path = os.path.join(folder, f"rename_{dt_util.now().strftime('%Y-%m-%d_%H%M%S_%f')}_settings.json")

                def _backup() -> None:
                    os.makedirs(folder, exist_ok=True)
                    with open(path, "x", encoding="utf-8") as fh:
                        json.dump(data, fh, ensure_ascii=False, indent=1)
                    # Only the newest few (the names sort by time).
                    old = sorted(f for f in os.listdir(folder) if f.startswith("rename_") and f.endswith("_settings.json"))
                    for f in old[:-BACKUPS_KEEP]:
                        try:
                            os.remove(os.path.join(folder, f))
                        except OSError:
                            pass

                await hass.async_add_executor_job(_backup)
                await store.async_save(new_data)
                changed.append("settings")
                _LOGGER.info("Casora: settings follow entity ID changes %s", mapping)
        except Exception:  # noqa: BLE001 - unreadable settings or no backup: leave them
            _LOGGER.exception("Casora: settings not updated to the new entity IDs")
    return changed


async def async_follow_rename(hass: HomeAssistant, old: str, new: str) -> list[str]:
    return await async_follow_renames(hass, {old: new})


@callback
def async_setup_entity_renames(hass: HomeAssistant) -> None:
    """Listen for entity ID changes while the entry is loaded (async_unload_entity_renames stops it)."""
    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("entity_renames"):
        return
    state: dict[str, Any] = {"pending": {}, "timer": None}

    @callback
    def _is_rename(data: er.EventEntityRegistryUpdatedData) -> bool:
        return (data.get("action") == "update" and isinstance(data.get("old_entity_id"), str)
                and data["old_entity_id"] != data.get("entity_id"))

    @callback
    def _flush(_now: Any = None) -> None:
        state["timer"] = None
        mapping, state["pending"] = state["pending"], {}
        if mapping:
            hass.async_create_task(async_follow_renames(hass, mapping), "casora entity renames", eager_start=False)

    @callback
    def _renamed(event: Event[er.EventEntityRegistryUpdatedData]) -> None:
        state["pending"] = compose(state["pending"], event.data["old_entity_id"], event.data["entity_id"])
        if state["timer"]:
            state["timer"]()
        state["timer"] = async_call_later(hass, DELAY, _flush)

    state["unsub"] = hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _renamed, event_filter=_is_rename)
    dom["entity_renames"] = state


@callback
def async_unload_entity_renames(hass: HomeAssistant) -> None:
    state = hass.data.get(DOMAIN, {}).pop("entity_renames", None)
    if not state:
        return
    state["unsub"]()
    if state["timer"]:
        state["timer"]()
        state["timer"] = None
    # A reload right after a rename: the collected changes still go through.
    if state["pending"]:
        hass.async_create_task(async_follow_renames(hass, state["pending"]), "casora entity renames", eager_start=False)
        state["pending"] = {}
