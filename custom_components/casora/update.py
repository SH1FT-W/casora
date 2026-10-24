"""Casora updates without HACS – straight from the releases of the public GitHub repo.

Casora asks GitHub itself and anonymously (update_source.py) for new releases and offers
them under Settings → Updates like any other integration. If HACS already manages Casora,
HACS does that – then Casora creates no update entity of its own, otherwise the same
version would show up twice under Updates.
"Install" downloads the release (the package casora.zip if the release has one, otherwise the
repo archive), backs up the running version to /config/casora_sicherungen/ and puts the new one
into a staging area (/config/casora_update_neu). Only when Home Assistant stops does Casora swap
the folder custom_components/casora – so frontend and server code match until the restart.
Casora does not restart by itself, it reports the restart as a repair issue.
"""
from __future__ import annotations

import errno
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import timedelta
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, UPDATE_REPO, VERSION
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
from .update_source import (  # noqa: F401 – error_code: former import location
    OPT_BETA,
    download_release,
    UpdateSourceError,
    error_code,
    error_text,
    fetch_releases,
)

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=6)
# When was the last check, and is an installed version waiting for the restart?
# (Studio → "Updates", updates.py)
DATA_LAST_CHECK = "update_last_check"
DATA_PENDING = "update_pending"
DATA_LAST_ERROR = "update_last_error"
DATA_HACS = "update_via_hacs"
# GitHub id of the Casora repo in HACS (= unique_id of HACS' update entity) when HACS manages Casora.
DATA_HACS_ID = "update_hacs_repo_id"
DATA_STAGE_LISTENER = "update_stage_listener"
STAGE_DIR = "casora_update_neu"
HISTORY_KEY = f"{DOMAIN}.update_history"


def _history_store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "update_history" not in data:
        data["update_history"] = Store(hass, 1, HISTORY_KEY)
    return data["update_history"]


async def async_load_history(hass: HomeAssistant) -> list[dict]:
    """Installs via Studio/Updates: [{version, ts, from}], oldest first."""
    raw = await _history_store(hass).async_load() or {}
    return [x for x in raw.get("installs", []) if isinstance(x, dict) and x.get("version")]


async def async_record_install(hass: HomeAssistant, version: str, previous: str) -> None:
    items = await async_load_history(hass)
    items.append({"version": version, "ts": dt_util.utcnow().isoformat(), "from": previous})
    await _history_store(hass).async_save({"installs": items[-100:]})


def zip_source_prefix(names: list[str]) -> str | None:
    """Folder inside a release zip that holds Casora's files, or None.

    Two layouts: the package casora.zip has the files at its root (manifest.json, panel/ …),
    GitHub's repo archive has "<owner>-<repo>-<sha>/custom_components/casora/"."""
    if "manifest.json" in names:
        return ""
    return next((n[: -len("manifest.json")] for n in names
                 if n.endswith("custom_components/casora/manifest.json")), None)


def install_zip(data: bytes, target: str, backups: str, backup_name: str) -> None:
    """Unpack a release zip: its Casora folder to target, back up the old version as a zip."""
    staged = target + ".neu"
    stage_zip(data, target, backups, backup_name, staged)
    swap_in(staged, target)


def stage_zip(data: bytes, target: str, backups: str, backup_name: str, staged: str) -> None:
    """Like install_zip, but only prepares the new version in staged (swap later with swap_in)."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        src = zip_source_prefix(zf.namelist())
        if src is None:
            raise RuntimeError("Im Release fehlt custom_components/casora")
        with tempfile.TemporaryDirectory() as tmp:
            new = os.path.join(tmp, "casora")
            for name in zf.namelist():
                if not name.startswith(src) or name.endswith("/"):
                    continue
                dest = os.path.normpath(os.path.join(new, name[len(src):]))
                if not dest.startswith(new + os.sep):
                    raise RuntimeError("Ungültiger Pfad im Release")
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with zf.open(name) as fsrc, open(dest, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst)
            if not os.path.exists(os.path.join(new, "manifest.json")):
                raise RuntimeError("Release unvollständig")
            # The Studio loader panel/casora-studio.js is written at startup (__init__._write_loader,
            # not in the repo) – carry it over, otherwise the Studio returns 404 until the restart.
            loader = os.path.join("panel", "casora-studio.js")
            if os.path.isfile(os.path.join(target, loader)) and not os.path.exists(os.path.join(new, loader)):
                os.makedirs(os.path.join(new, "panel"), exist_ok=True)
                shutil.copy2(os.path.join(target, loader), os.path.join(new, loader))
            # Back up the running version, then replace it.
            os.makedirs(backups, exist_ok=True)
            if os.path.isdir(target):
                shutil.make_archive(os.path.join(backups, backup_name), "zip", target)
            # Copy completely next to the target first (disk full, permissions …: the target stays
            # untouched), then only rename.
            shutil.rmtree(staged, ignore_errors=True)
            try:
                shutil.copytree(new, staged)
            except BaseException:
                shutil.rmtree(staged, ignore_errors=True)
                raise


def swap_in(staged: str, target: str) -> None:
    """Put the fully copied version in place of target; if that fails, the old one comes back."""
    old = target + ".alt"
    shutil.rmtree(old, ignore_errors=True)
    had = os.path.isdir(target)
    if had:
        os.replace(target, old)
    try:
        try:
            os.replace(staged, target)
        except OSError as err:
            if err.errno != errno.EXDEV:
                raise
            # Staging area on another drive (custom Docker mount): copy.
            try:
                shutil.copytree(staged, target)
            except BaseException:
                shutil.rmtree(target, ignore_errors=True)
                raise
            shutil.rmtree(staged, ignore_errors=True)
    except BaseException:
        if had and not os.path.exists(target):
            os.replace(old, target)
        raise
    shutil.rmtree(old, ignore_errors=True)


def _hacs_repo_id(path: str) -> str | None:
    """GitHub id of UPDATE_REPO in HACS' list if installed there (.storage/hacs.repositories).

    HACS uses this id as unique_id of its update entity."""
    try:
        with open(path, encoding="utf-8") as fh:
            repos = (json.load(fh) or {}).get("data") or {}
    except (OSError, ValueError, AttributeError):
        return None
    want = UPDATE_REPO.lower()
    for key, r in (repos.items() if isinstance(repos, dict) else []):
        if isinstance(r, dict) and str(r.get("full_name") or "").lower() == want and r.get("installed"):
            return str(r.get("id") or key)
    return None


def _read_hacs(path: str) -> bool:
    """Is UPDATE_REPO listed as installed in HACS' list? (.storage/hacs.repositories)"""
    return _hacs_repo_id(path) is not None


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
    """Does HACS manage Casora? From the stored list – HACS need not be loaded yet.

    Also remembers the repo id (DATA_HACS_ID) that casora_update_entity uses to find HACS' entry."""
    rid = await hass.async_add_executor_job(_hacs_repo_id, hass.config.path(".storage", "hacs.repositories"))
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
        # Own update entity from before HACS: would otherwise stay as "unavailable", and the
        # Studio found it instead of HACS' entry (Install then did nothing).
        try:
            reg = er.async_get(hass)
            old = reg.async_get_entity_id("update", DOMAIN, _own_unique_id(entry))
            if old:
                reg.async_remove(old)
        except Exception as err:  # noqa: BLE001 – cleanup must never break the startup
            _LOGGER.debug("Casora: alte Update-Entität nicht entfernt: %s", err)
    if not data.get(DATA_PENDING):
        # Leftover staging area not applied at the last stop (crash, power cut): discard it –
        # the update is simply offered again.
        await hass.async_add_executor_job(shutil.rmtree, hass.config.path(STAGE_DIR), True)
    if not hacs:
        # Not update_before_add: without internet that would delay Casora's startup by up to 20 s.
        async_add_entities([CasoraUpdate(hass, entry)])


class CasoraUpdate(UpdateEntity):
    """New Casora version from the releases of the public repo."""

    _attr_has_entity_name = True
    _attr_title = "Casora"
    _attr_supported_features = UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES
    _attr_should_poll = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._entry = entry
        self._attr_unique_id = _own_unique_id(entry)
        self._attr_name = "Casora"
        self._attr_installed_version = VERSION
        self._attr_latest_version = VERSION
        self._release: dict[str, Any] | None = None
        # Installed but not restarted yet? hass.data keeps that across a reload of the integration
        # (options changed) – otherwise HA would offer the same version again.
        pending = (hass.data.get(DOMAIN) or {}).get(DATA_PENDING)
        self._installed_new: str | None = pending if pending and pending != VERSION else None
        if self._installed_new:
            self._attr_installed_version = self._attr_latest_version = self._installed_new

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
        # After installing, until the restart: the new version counts as installed.
        installed = self._installed_new or VERSION
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

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        rel = self._release
        if not rel:
            raise RuntimeError("Kein Casora-Release gefunden")
        tag = str(rel.get("tag_name") or "")
        try:
            data = await download_release(self.hass, tag, rel)
        except UpdateSourceError as err:
            raise HomeAssistantError(f"Casora {tag} nicht geladen: {error_text(err.code)}") from err
        target = self.hass.config.path("custom_components", DOMAIN)
        backups = self.hass.config.path("casora_sicherungen")
        stamp = dt_util.now().strftime("%Y-%m-%d_%H%M%S")

        staged = self.hass.config.path(STAGE_DIR)
        await self.hass.async_add_executor_job(stage_zip, data, target, backups, f"casora_{VERSION}_{stamp}", staged)
        _swap_on_stop(self.hass, staged, target)
        self._installed_new = str(tag).lstrip("v")
        # For "installed on …" in the Studio; the old version keeps running until the restart.
        await async_record_install(self.hass, self._installed_new, VERSION)
        self.hass.data.setdefault(DOMAIN, {})[DATA_PENDING] = self._installed_new
        self._attr_installed_version = self._installed_new
        self._attr_latest_version = self._installed_new
        ir.async_create_issue(
            self.hass, DOMAIN, "restart_after_update", is_fixable=False, is_persistent=False,
            severity=ir.IssueSeverity.WARNING, translation_key="restart_after_update",
            translation_placeholders={"version": self._installed_new},
        )
        self.async_write_ha_state()


def _swap_on_stop(hass: HomeAssistant, staged: str, target: str) -> None:
    """Apply the new version only when HA stops – until then Casora keeps serving the frontend
    that matches the running server code. Register once per run."""
    data = hass.data.setdefault(DOMAIN, {})
    if data.get(DATA_STAGE_LISTENER):
        return

    async def _apply(_event: Event) -> None:
        if not await hass.async_add_executor_job(os.path.isdir, staged):
            return
        try:
            await hass.async_add_executor_job(swap_in, staged, target)
        except OSError as err:
            _LOGGER.error("Casora: neue Fassung nicht eingespielt (%s) – die bisherige bleibt aktiv", err)

    data[DATA_STAGE_LISTENER] = hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _apply)
