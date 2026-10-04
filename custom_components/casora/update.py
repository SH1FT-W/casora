"""Casora-Updates ohne HACS – direkt aus den Releases des öffentlichen GitHub-Repos.

Casora fragt selbst und anonym bei GitHub (update_source.py) nach neuen Releases und
bietet sie unter Einstellungen → Updates an, wie jede andere Integration. Verwaltet HACS
Casora schon, übernimmt HACS das – dann legt Casora keine eigene Update-Entität an,
sonst stünde dieselbe Version doppelt unter Updates.
„Installieren“ lädt das Release, sichert die laufende Fassung nach /config/casora_sicherungen/ und legt die neue
nach custom_components/casora. Danach ist ein Neustart nötig – den löst Casora nicht
selbst aus, sondern meldet ihn als Reparatur-Hinweis.
"""
from __future__ import annotations

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
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
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
from .update_source import (  # noqa: F401 – error_code: frühere Importstelle
    OPT_BETA,
    download_release,
    UpdateSourceError,
    error_code,
    error_text,
    fetch_releases,
)

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=6)
# Wann zuletzt geprüft wurde, und wartet eine installierte Version auf den Neustart?
# (Studio → „Updates“, updates.py)
DATA_LAST_CHECK = "update_last_check"
DATA_PENDING = "update_pending"
DATA_LAST_ERROR = "update_last_error"
DATA_HACS = "update_via_hacs"
HISTORY_KEY = f"{DOMAIN}.update_history"


def _history_store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "update_history" not in data:
        data["update_history"] = Store(hass, 1, HISTORY_KEY)
    return data["update_history"]


async def async_load_history(hass: HomeAssistant) -> list[dict]:
    """Installationen über das Studio/Updates: [{version, ts, from}], älteste zuerst."""
    raw = await _history_store(hass).async_load() or {}
    return [x for x in raw.get("installs", []) if isinstance(x, dict) and x.get("version")]


async def async_record_install(hass: HomeAssistant, version: str, previous: str) -> None:
    items = await async_load_history(hass)
    items.append({"version": version, "ts": dt_util.utcnow().isoformat(), "from": previous})
    await _history_store(hass).async_save({"installs": items[-100:]})


def install_zip(data: bytes, target: str, backups: str, backup_name: str) -> None:
    """Release-Archiv auspacken: custom_components/casora daraus nach target, alte Fassung als Zip sichern."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        # Das Archiv hat einen Wurzelordner „<owner>-<repo>-<sha>/“.
        prefix = next((n.split("custom_components/")[0] for n in zf.namelist()
                       if n.endswith("custom_components/casora/manifest.json")), None)
        if prefix is None:
            raise RuntimeError("Im Release fehlt custom_components/casora")
        src = prefix + "custom_components/casora/"
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
            # Der Studio-Lader panel/casora-studio.js entsteht erst beim Start (__init__._write_loader,
            # nicht im Repo) – mitnehmen, sonst gibt das Studio bis zum Neustart 404.
            loader = os.path.join("panel", "casora-studio.js")
            if os.path.isfile(os.path.join(target, loader)) and not os.path.exists(os.path.join(new, loader)):
                os.makedirs(os.path.join(new, "panel"), exist_ok=True)
                shutil.copy2(os.path.join(target, loader), os.path.join(new, loader))
            # Laufende Fassung sichern, dann ersetzen.
            os.makedirs(backups, exist_ok=True)
            if os.path.isdir(target):
                shutil.make_archive(os.path.join(backups, backup_name), "zip", target)
            old = target + ".alt"
            shutil.rmtree(old, ignore_errors=True)
            if os.path.isdir(target):
                os.replace(target, old)
            shutil.copytree(new, target)
            shutil.rmtree(old, ignore_errors=True)


def _read_hacs(path: str) -> bool:
    """Steht UPDATE_REPO in HACS' Liste als installiert? (.storage/hacs.repositories)"""
    try:
        with open(path, encoding="utf-8") as fh:
            repos = (json.load(fh) or {}).get("data") or {}
    except (OSError, ValueError, AttributeError):
        return False
    want = UPDATE_REPO.lower()
    return any(isinstance(r, dict) and str(r.get("full_name") or "").lower() == want and r.get("installed")
               for r in (repos.values() if isinstance(repos, dict) else []))


def beta_enabled(entry: ConfigEntry | None) -> bool:
    """Option „Beta-Versionen“ an? Standard aus."""
    return bool(entry is not None and (entry.options or {}).get(OPT_BETA, False))


def pick_latest(releases: list[dict], installed: str, beta: bool) -> tuple[dict | None, str]:
    """Release und angebotene Version → (Release, latest_version).

    Mit beta zählen Vorabversionen mit, die höchste Version gewinnt. Ohne beta nur
    stabile; wer eine Beta installiert hat, bekommt erst die nächste höhere stabile
    angeboten, nie eine ältere (kein Zurückstufen).
    """
    rel = latest_casora(releases, beta=beta)
    if rel is None:
        return None, installed
    latest = str(rel.get("tag_name") or "").lstrip("v") or installed
    return rel, (latest if newer(latest, installed) else installed)


async def async_hacs_managed(hass: HomeAssistant) -> bool:
    """Verwaltet HACS Casora? Aus der gespeicherten Liste – HACS muss dafür noch nicht geladen sein."""
    return await hass.async_add_executor_job(_read_hacs, hass.config.path(".storage", "hacs.repositories"))


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    # Mit HACS meldet HACS neue Versionen – eine zweite Update-Entität wäre doppelt.
    hacs = await async_hacs_managed(hass)
    hass.data.setdefault(DOMAIN, {})[DATA_HACS] = hacs
    if not hacs:
        async_add_entities([CasoraUpdate(hass, entry)], update_before_add=True)


class CasoraUpdate(UpdateEntity):
    """Neue Casora-Version aus den Releases des öffentlichen Repos."""

    _attr_has_entity_name = True
    _attr_title = "Casora"
    _attr_supported_features = UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES
    _attr_should_poll = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_update"
        self._attr_name = "Casora"
        self._attr_installed_version = VERSION
        self._attr_latest_version = VERSION
        self._release: dict[str, Any] | None = None
        self._installed_new: str | None = None

    async def async_update(self) -> None:
        data = self.hass.data.setdefault(DOMAIN, {})
        data[DATA_LAST_CHECK] = dt_util.utcnow().isoformat()
        try:
            # Nicht /releases/latest: das könnte ein Karten-Update („karten-…“) sein.
            rels = await fetch_releases(self.hass)
        except Exception as err:  # noqa: BLE001 – offline oder GitHub-Limit: später wieder
            _LOGGER.debug("Casora: Update-Prüfung fehlgeschlagen: %s", err)
            data[DATA_LAST_ERROR] = error_code(err)
            return
        data[DATA_LAST_ERROR] = None
        # Nach der Installation, bis zum Neustart: die neue Version gilt als installiert.
        installed = self._installed_new or VERSION
        rel, latest = pick_latest(rels, installed, beta_enabled(self._entry))
        # Eine Beta heißt in HAs Update-Liste „Casora Beta“ (die Version trägt „-beta.N“).
        self._attr_title = "Casora Beta" if is_prerelease(latest) else "Casora"
        if rel is None:
            # Noch kein Casora-Release: nichts anbieten.
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
        # Kurzfassung (HA erlaubt höchstens 255 Zeichen): die fetten Anfänge der ersten Punkte.
        # Im Dashboard-Popup die zweite Zeile unter „Casora“; die ganzen Hinweise kommen
        # über async_release_notes.
        self._attr_release_summary = (summarize(await self._notes_md(), limit=2) or None)
        if self._attr_release_summary and len(self._attr_release_summary) > 255:
            self._attr_release_summary = self._attr_release_summary[:254] + "…"

    async def _notes_md(self) -> str:
        """Text des Releases in der Sprache von Home Assistant (Deutsch-Block im Release,
        sonst Englisch); fehlt er oder gibt es die Sprache nur in der mitgelieferten
        CHANGELOG(.de).md, der Abschnitt von dort."""
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
                break  # Englisch aus dem Release ist so gut wie die englische CHANGELOG
            for e in parse_changelog(text, code):
                if e["version"] == want and e.get("notes_md"):
                    return e["notes_md"]
        return notes

    async def async_release_notes(self) -> str | None:
        # HAs Dialog rendert Markdown: harte Umbrüche der CHANGELOG zusammenziehen, <…> als Text.
        return ha_markdown(await self._notes_md()) or None

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        rel = self._release
        if not rel:
            raise RuntimeError("Kein Casora-Release gefunden")
        tag = str(rel.get("tag_name") or "")
        try:
            data = await download_release(self.hass, tag)
        except UpdateSourceError as err:
            raise HomeAssistantError(f"Casora {tag} nicht geladen: {error_text(err.code)}") from err
        target = self.hass.config.path("custom_components", DOMAIN)
        backups = self.hass.config.path("casora_sicherungen")
        stamp = dt_util.now().strftime("%Y-%m-%d_%H%M%S")

        await self.hass.async_add_executor_job(install_zip, data, target, backups, f"casora_{VERSION}_{stamp}")
        self._installed_new = str(tag).lstrip("v")
        # Für „installiert am …“ im Studio; läuft bis zum Neustart noch die alte Fassung.
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
