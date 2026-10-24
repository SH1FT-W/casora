"""Casora's update entity: reports new releases of the public GitHub repo, installs nothing.

Casora asks GitHub itself and anonymously (update_source.py) for new releases and shows them
under Settings → Updates with their release notes. Installing is HACS' job: the entity has no
INSTALL feature and no code here writes into custom_components (HACS default-store review,
hacs/default#12143). If HACS already manages Casora, HACS reports new versions too – then Casora
creates no update entity of its own, otherwise the same version would show up twice.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from datetime import timedelta
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, UPDATE_REPO, UPDATE_REPO_ID, VERSION
from .release_notes import (
    changelog_file,
    ha_markdown,
    is_prerelease,
    latest_casora,
    newer,
    norm_version,
    notes_lang,
    parse_changelog,
    pick_notes,
    summarize,
)
from .update_source import OPT_BETA, error_code, fetch_releases

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=6)
# When was the last check, and did it fail? (Studio → "Updates", updates.py)
DATA_LAST_CHECK = "update_last_check"
DATA_LAST_ERROR = "update_last_error"
DATA_HACS = "update_via_hacs"
# GitHub id of the Casora repo in HACS (= unique_id of HACS' update entity) when HACS manages Casora.
DATA_HACS_ID = "update_hacs_repo_id"
# Leftovers of the former self-updater (last shipped in 26.10.59), both outside custom_components:
# the staging area and the install history store. Setup deletes them once; keep this
# for one release, then drop it (by then every install has run it).
LEGACY_STAGE_DIR = "casora_update_neu"
LEGACY_HISTORY_FILE = f"{DOMAIN}.update_history"
# Before every install the self-updater zipped the running version into casora_sicherungen
# ("casora_<version>_<YYYY-MM-DD_HHMMSS>.zip", 20-35 MB each). The newest stays as a fallback; dashboard backups
# in the same folder (umzug_…, umstellen_…, Hemma) have other names and are never touched.
LEGACY_BACKUP_DIR = "casora_sicherungen"
LEGACY_BACKUP_ZIP = re.compile(r"^casora_\d+\.\d+\.\d+(b\d+)?_\d{4}-\d{2}-\d{2}_\d{6}\.zip$")


def _remove_legacy_leftovers(config_dir: str) -> None:
    shutil.rmtree(os.path.join(config_dir, LEGACY_STAGE_DIR), ignore_errors=True)
    try:
        os.remove(os.path.join(config_dir, ".storage", LEGACY_HISTORY_FILE))
    except OSError:
        pass
    _prune_version_backups(os.path.join(config_dir, LEGACY_BACKUP_DIR))


def _prune_version_backups(folder: str) -> list[str]:
    """Delete the self-updater's version zips except the newest; returns the removed names."""
    try:
        names = [n for n in os.listdir(folder) if LEGACY_BACKUP_ZIP.match(n)
                 and os.path.isfile(os.path.join(folder, n))]
    except OSError:
        return []
    names.sort(key=lambda n: os.path.getmtime(os.path.join(folder, n)))
    removed = []
    for n in names[:-1]:
        try:
            os.remove(os.path.join(folder, n))
            removed.append(n)
        except OSError:
            continue
    if removed:
        _LOGGER.info("Casora: removed %d old version backups from %s (kept the newest)", len(removed), folder)
    return removed


def hacs_knows(hass: HomeAssistant, repo_id: str) -> bool:
    """Is this GitHub repository downloaded through HACS?

    HACS keys the device and the update entity of a downloaded repository by its GitHub id; both live in
    HA's registries (public API), so this works before HACS has loaded and without reading HACS' storage."""
    if er.async_get(hass).async_get_entity_id("update", "hacs", repo_id) is not None:
        return True
    ident = ("hacs", repo_id)
    return any(ident in d.identifiers for d in list(dr.async_get(hass).devices.values()))


def hacs_repo_id(hass: HomeAssistant) -> str | None:
    """GitHub id of UPDATE_REPO if HACS manages Casora, else None."""
    return UPDATE_REPO_ID if hacs_knows(hass, UPDATE_REPO_ID) else None


def beta_enabled(entry: ConfigEntry | None) -> bool:
    """Option "Beta versions" on? Off by default."""
    return bool(entry is not None and (entry.options or {}).get(OPT_BETA, False))


def pick_latest(releases: list[dict], installed: str, beta: bool) -> tuple[dict | None, str]:
    """Release and offered version → (release, latest_version).

    With beta, pre-releases count too and the highest version wins. Without beta only
    stable ones; with a beta installed, the next higher stable one is offered, never an
    older one (no downgrade).
    """
    rel = latest_casora(releases, beta=beta)
    if rel is None:
        return None, installed
    latest = str(rel.get("tag_name") or "").lstrip("v") or installed
    return rel, (latest if newer(latest, installed) else installed)


async def async_hacs_managed(hass: HomeAssistant) -> bool:
    """Does HACS manage Casora? From the registries – HACS need not be loaded yet.

    Also remembers the repo id (DATA_HACS_ID) that casora_update_entity uses to find HACS' entry."""
    rid = hacs_repo_id(hass)
    hass.data.setdefault(DOMAIN, {})[DATA_HACS_ID] = rid
    return rid is not None


def _own_unique_id(entry) -> str:
    return f"{entry.entry_id}_update"


@callback
def casora_update_entity(hass: HomeAssistant, entry) -> tuple[str | None, str | None]:
    """Update entity that updates Casora → (entity_id, "hacs" | "casora").

    With HACS: HACS' update entity for the Casora repo – found via platform hacs and the repo
    id as unique_id; if that is missing (HACS list shaped differently), via the release_url
    pointing to UPDATE_REPO. Without HACS our own (update.py). Nothing found → (None, source).
    """
    data = hass.data.get(DOMAIN, {})
    reg = er.async_get(hass)
    if data.get(DATA_HACS):
        rid = data.get(DATA_HACS_ID)
        eid = reg.async_get_entity_id("update", "hacs", str(rid)) if rid else None
        if eid is None:
            repo = "/" + UPDATE_REPO.lower() + "/"
            hits = []
            for e in list(reg.entities.values()):
                if e.domain != "update" or e.platform == DOMAIN:
                    continue
                st = hass.states.get(e.entity_id)
                url = str((st.attributes.get("release_url") if st else "") or "").lower()
                if repo in url + "/":
                    hits.append((e.platform != "hacs", e.entity_id))
            eid = min(hits)[1] if hits else None
        return eid, "hacs"
    if entry is None:
        return None, None
    return reg.async_get_entity_id("update", DOMAIN, _own_unique_id(entry)), "casora"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    # With HACS, HACS reports new versions – a second update entity would be a duplicate.
    hacs = await async_hacs_managed(hass)
    data = hass.data.setdefault(DOMAIN, {})
    data[DATA_HACS] = hacs
    if hacs:
        # Own update entity from before HACS: would otherwise stay as "unavailable" next to HACS' entry.
        try:
            reg = er.async_get(hass)
            old = reg.async_get_entity_id("update", DOMAIN, _own_unique_id(entry))
            if old:
                reg.async_remove(old)
        except Exception as err:  # noqa: BLE001 – cleanup must never break the startup
            _LOGGER.debug("Casora: alte Update-Entität nicht entfernt: %s", err)
    # Only deletes leftovers of the former self-updater; harmless when there are none.
    await hass.async_add_executor_job(_remove_legacy_leftovers, hass.config.config_dir)
    if not hacs:
        # Not update_before_add: without internet that would delay Casora's startup by up to 20 s.
        async_add_entities([CasoraUpdate(hass, entry)])


class CasoraUpdate(UpdateEntity):
    """New Casora version from the releases of the public repo – report only (no INSTALL)."""

    _attr_has_entity_name = True
    _attr_title = "Casora"
    _attr_supported_features = UpdateEntityFeature.RELEASE_NOTES
    _attr_should_poll = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._entry = entry
        self._attr_unique_id = _own_unique_id(entry)
        self._attr_name = "Casora"
        self._attr_installed_version = VERSION
        self._attr_latest_version = VERSION
        self._release: dict[str, Any] | None = None

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # First check in the background, then every SCAN_INTERVAL as usual.
        self.hass.async_create_background_task(self._async_first_check(), "casora_update_first_check")

    async def _async_first_check(self) -> None:
        await self.async_update()
        self.async_write_ha_state()

    async def async_update(self) -> None:
        data = self.hass.data.setdefault(DOMAIN, {})
        data[DATA_LAST_CHECK] = dt_util.utcnow().isoformat()
        try:
            # Not /releases/latest: that could be a card update ("karten-…").
            rels = await fetch_releases(self.hass)
        except Exception as err:  # noqa: BLE001 – offline or GitHub limit: try again later
            _LOGGER.debug("Casora: Update-Prüfung fehlgeschlagen: %s", err)
            data[DATA_LAST_ERROR] = error_code(err)
            return
        data[DATA_LAST_ERROR] = None
        installed = VERSION
        rel, latest = pick_latest(rels, installed, beta_enabled(self._entry))
        # A beta is called "Casora Beta" in HA's update list (the version carries "-beta.N").
        self._attr_title = "Casora Beta" if is_prerelease(latest) else "Casora"
        if rel is None:
            # No Casora release yet: offer nothing.
            self._release = None
            self._attr_latest_version = self._attr_installed_version
            self._attr_release_summary = None
            return
        self._release = rel
        self._attr_installed_version = installed
        self._attr_latest_version = latest
        url = str(rel.get("html_url") or "")
        self._attr_release_url = (url if url.startswith("https://")
                                  else f"https://github.com/{UPDATE_REPO}/releases/tag/{rel.get('tag_name')}")
        # Summary (HA allows at most 255 characters): the bold starts of the first items.
        # Second line under "Casora" in the dashboard popup; the full notes come via
        # async_release_notes.
        self._attr_release_summary = (summarize(await self._notes_md(), limit=2) or None)
        if self._attr_release_summary and len(self._attr_release_summary) > 255:
            self._attr_release_summary = self._attr_release_summary[:254] + "…"

    async def _notes_md(self) -> str:
        """Release text in Home Assistant's language (German block in the release, otherwise
        English); if missing or the language exists only in the bundled CHANGELOG(.de).md,
        the section from there."""
        rel = self._release or {}
        lang = notes_lang(getattr(self.hass.config, "language", None))
        notes, got = pick_notes(str(rel.get("body") or ""), lang)
        notes = notes.strip()
        if notes and got == lang:
            return notes
        want = norm_version(rel.get("tag_name"))

        def read() -> list[tuple[str, str]]:
            out = []
            for code in dict.fromkeys((lang, "en")):
                try:
                    with open(os.path.join(os.path.dirname(__file__), changelog_file(code)), encoding="utf-8") as fh:
                        out.append((code, fh.read()))
                except OSError:
                    pass
            return out

        for code, text in await self.hass.async_add_executor_job(read):
            if notes and code != lang:
                break  # English from the release is as good as the English CHANGELOG
            for e in parse_changelog(text, code):
                if e["version"] == want and e.get("notes_md"):
                    return e["notes_md"]
        return notes

    async def async_release_notes(self) -> str | None:
        # HA's dialog renders Markdown: join hard CHANGELOG line breaks, <…> as text.
        return ha_markdown(await self._notes_md()) or None
