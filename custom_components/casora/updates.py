"""Studio → „Updates“: Casora-Versionen und Versionshinweise.

Die Liste kommt aus zwei Quellen (release_notes.py): den Releases des öffentlichen
GitHub-Repos (update_source.py, anonym) und der mitgelieferten CHANGELOG.md bzw.
CHANGELOG.de.md – offline zeigt das Studio so wenigstens die bekannten Versionen. Die
Hinweise kommen in der Sprache der Oberfläche (Deutsch oder sonst Englisch). Die Antwort wird
zwischengespeichert (CACHE_S).

Installieren und Prüfen laufen über die Update-Entität (update.py) mit HAs eigenen
Diensten update.install / homeassistant.update_entity; hier gibt es nur zu lesen.
Verwaltet HACS Casora, gibt es keine eigene Update-Entität (hacs: true) – dann meldet
HACS neue Versionen, das Studio zeigt nur die Liste.

WebSocket (nur Admins):
  casora/updates/list ← {"force"?: bool, "language"?: str (Sprache der Oberfläche)} →
    {installed, latest, update_available, entity_id, entry_id, token (prüft Casora selbst?),
     hacs, beta (Vorabversionen an?), last_check, last_error, pending_restart, scan_hours, repo_url,
     notes_lang ("de"|"en"),
     groups: [{kind: "casora", title, releases: [{kind, version, date, notes_md, notes_lang, notes_html,
               summary, source: "github"|"changelog", url?, prerelease?, installed_at?}]}]}
Weitere Gruppen (etwa Karten-Updates) kommen später mit eigenem „kind“ dazu.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN, UPDATE_REPO, VERSION
from .release_notes import (
    KIND_CASORA,
    changelog_file,
    from_github,
    merge_releases,
    newer,
    notes_lang,
    parse_changelog,
    render_markdown,
    summarize,
)
from .update import (
    DATA_LAST_CHECK,
    DATA_HACS,
    DATA_LAST_ERROR,
    DATA_PENDING,
    SCAN_INTERVAL,
    async_load_history,
    beta_enabled,
)
from .update_source import error_code, fetch_releases

_LOGGER = logging.getLogger(__name__)

CACHE_S = 15 * 60
# Werden beim Release aus CHANGELOG.md / CHANGELOG.de.md im Repo kopiert (tools/sync-changelog.py).
CHANGELOG = os.path.join(os.path.dirname(__file__), "CHANGELOG.md")


def changelog_path(lang: str) -> str:
    return os.path.join(os.path.dirname(__file__), changelog_file(lang))


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def read_changelog(lang: str) -> tuple[str, float, str]:
    """Mitgelieferte CHANGELOG in dieser Sprache → (Sprache, mtime, Text).

    Fehlt die deutsche Datei (ältere Installation), gilt die englische."""
    for code in dict.fromkeys((notes_lang(lang), "en")):
        path = changelog_path(code)
        try:
            with open(path, encoding="utf-8") as fh:
                return code, os.path.getmtime(path), fh.read()
        except OSError:
            continue
    return "en", 0.0, ""


async def _changelog(hass: HomeAssistant, lang: str) -> list[dict]:
    data = hass.data.setdefault(DOMAIN, {})
    code, mtime, text = await hass.async_add_executor_job(read_changelog, lang)
    caches = data.setdefault("changelog_cache", {})
    if not isinstance(caches, dict):  # alter Aufbau (mtime, Liste) aus einer früheren Version
        caches = data["changelog_cache"] = {}
    cached = caches.get(code)
    if cached and cached[0] == mtime:
        return cached[1]
    parsed = parse_changelog(text, code)
    caches[code] = (mtime, parsed)
    return parsed


async def _remote(hass: HomeAssistant, force: bool, lang: str = "en") -> tuple[list[dict], str | None]:
    """Releases von GitHub, zwischengespeichert → (Einträge in dieser Sprache, Fehlercode)."""
    data = hass.data.setdefault(DOMAIN, {})
    cache = data.get("releases_cache") or {}
    if cache and not force and time.monotonic() - cache.get("at", 0) < CACHE_S:
        return from_github(cache.get("body") or [], lang), cache.get("error")
    try:
        body = await fetch_releases(hass)
    except Exception as err:  # noqa: BLE001 – offline/GitHub-Limit: Studio zeigt die CHANGELOG
        _LOGGER.debug("Casora: Releases nicht abrufbar: %s", err)
        code = error_code(err)
        data["releases_cache"] = {**cache, "at": time.monotonic(), "error": code}
        return from_github(cache.get("body") or [], lang), code
    data["releases_cache"] = {"at": time.monotonic(), "body": body, "error": None}
    return from_github(body, lang), None


def _entity_id(hass: HomeAssistant, entry) -> str | None:
    if entry is None:
        return None
    return er.async_get(hass).async_get_entity_id("update", DOMAIN, f"{entry.entry_id}_update")


async def async_updates_overview(hass: HomeAssistant, force: bool = False, lang: str | None = None) -> dict[str, Any]:
    """lang: Sprache der Oberfläche (Panel); ohne Angabe die von Home Assistant."""
    entry = _entry(hass)
    lang = notes_lang(lang or hass.config.language)
    github, error = await _remote(hass, force, lang)
    releases = merge_releases(github, await _changelog(hass, lang))

    installed_at: dict[str, str] = {}
    for h in await async_load_history(hass):  # jüngste Installation je Version gewinnt
        installed_at[h["version"]] = h["ts"]

    data = hass.data.get(DOMAIN, {})
    hacs = bool(data.get(DATA_HACS))
    entity_id = _entity_id(hass, entry)
    st = hass.states.get(entity_id) if entity_id else None
    latest = VERSION
    if st is not None and st.attributes.get("latest_version"):
        latest = str(st.attributes["latest_version"])
    # Vorabversionen nur mit „Beta-Versionen“ (Option beta_updates); die Liste ist neueste zuerst.
    beta = beta_enabled(entry)
    top = next((r["version"] for r in releases
                if (beta or not r.get("prerelease")) and r.get("source") == "github"), None)
    if top and newer(top, latest):
        latest = top
    # Installiert, aber noch nicht neu gestartet: das läuft erst nach dem Neustart.
    pending = data.get(DATA_PENDING)
    pending = pending if pending and pending != VERSION else None
    if pending and newer(pending, latest):
        latest = pending

    out = []
    for r in releases:
        item = dict(r)
        item["notes_html"] = render_markdown(r.get("notes_md", ""))
        item["summary"] = summarize(r.get("notes_md", ""))
        if r["version"] in installed_at:
            item["installed_at"] = installed_at[r["version"]]
        out.append(item)

    return {
        "installed": VERSION,
        "latest": latest,
        "update_available": newer(latest, pending or VERSION),
        "entity_id": entity_id,
        "entry_id": entry.entry_id if entry else None,
        # Prüft Casora selbst (Update-Entität)? Mit HACS übernimmt HACS das.
        "token": not hacs,
        "hacs": hacs,
        # Option „Beta-Versionen“; mit HACS schaltet man Betas in HACS selbst ein.
        "beta": beta,
        "last_check": data.get(DATA_LAST_CHECK),
        "last_error": error or data.get(DATA_LAST_ERROR),
        "pending_restart": pending,
        "scan_hours": int(SCAN_INTERVAL.total_seconds() // 3600),
        "repo_url": f"https://github.com/{UPDATE_REPO}/releases",
        "notes_lang": lang,
        "groups": [{"kind": KIND_CASORA, "title": "Casora", "releases": out}],
    }


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/updates/list",
    vol.Optional("force", default=False): bool,
    vol.Optional("language"): vol.Any(str, None),
})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    # Die Sprache schickt das Panel mit (wie für seine übrigen Texte); sonst die von HA.
    connection.send_result(msg["id"], await async_updates_overview(hass, msg["force"], msg.get("language")))


@callback
def async_setup_updates(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("updates_ws"):
        return
    websocket_api.async_register_command(hass, ws_list)
    hass.data.setdefault(DOMAIN, {})["updates_ws"] = True
