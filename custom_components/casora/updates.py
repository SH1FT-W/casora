"""Studio → "Updates": Casora versions and release notes – read only.

The list comes from two sources (release_notes.py): the releases of the public GitHub repo
(update_source.py, anonymous) and the bundled CHANGELOG.md / CHANGELOG.de.md – so offline the
Studio shows at least the known versions. Notes come in the UI language (German, otherwise
English). The answer is cached (CACHE_S).

Casora installs nothing itself (HACS default-store rule): updates go through HACS. Checking runs
through the update entity with HA's own service homeassistant.update_entity. If HACS manages
Casora there is no own update entity (hacs: true); entity_id is then HACS' entry for the Casora
repo (update.casora_update_entity) and hacs_url its HACS page.

WebSocket (admins only):
  casora/updates/list ← {"force"?: bool, "language"?: str (UI language)} →
    {installed, latest, update_available, entity_id (update entity or None), via ("hacs"|"casora"|None),
     hacs_url (HACS page of Casora or None), entry_id, own_check (does Casora check itself?),
     hacs, beta (pre-releases on?), last_check, last_error, pending_restart (HACS already put a
     newer version in place, HA not restarted yet), scan_hours, repo_url, notes_lang ("de"|"en"),
     groups: [{kind: "casora", title, releases: [{kind, version, date, notes_md, notes_lang, notes_html,
               summary, source: "github"|"changelog", url?, prerelease?}]}]}
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, UPDATE_REPO, VERSION
from .release_notes import (
    KIND_CASORA,
    norm_version,
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
    DATA_HACS,
    DATA_HACS_ID,
    DATA_LAST_CHECK,
    DATA_LAST_ERROR,
    SCAN_INTERVAL,
    beta_enabled,
    casora_update_entity,
)
from .update_source import error_code, fetch_releases

_LOGGER = logging.getLogger(__name__)

CACHE_S = 15 * 60
# Copied from the repo's CHANGELOG.md / CHANGELOG.de.md at release time (tools/sync-changelog.py).
CHANGELOG = os.path.join(os.path.dirname(__file__), "CHANGELOG.md")


def changelog_path(lang: str) -> str:
    return os.path.join(os.path.dirname(__file__), changelog_file(lang))


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def read_changelog(lang: str) -> tuple[str, float, str]:
    """Bundled CHANGELOG in this language → (language, mtime, text).

    If the German file is missing (older install), the English one counts."""
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
    if not isinstance(caches, dict):  # old shape (mtime, list) from an earlier version
        caches = data["changelog_cache"] = {}
    cached = caches.get(code)
    if cached and cached[0] == mtime:
        return cached[1]
    parsed = parse_changelog(text, code)
    caches[code] = (mtime, parsed)
    return parsed


async def _remote(hass: HomeAssistant, force: bool, lang: str = "en") -> tuple[list[dict], str | None]:
    """Releases from GitHub, cached → (entries in this language, error code)."""
    data = hass.data.setdefault(DOMAIN, {})
    cache = data.get("releases_cache") or {}
    if cache and not force and time.monotonic() - cache.get("at", 0) < CACHE_S:
        return from_github(cache.get("body") or [], lang), cache.get("error")
    try:
        body = await fetch_releases(hass)
    except Exception as err:  # noqa: BLE001 – offline/GitHub limit: the Studio shows the CHANGELOG
        _LOGGER.debug("Casora: Releases nicht abrufbar: %s", err)
        code = error_code(err)
        data["releases_cache"] = {**cache, "at": time.monotonic(), "error": code}
        return from_github(cache.get("body") or [], lang), code
    data["releases_cache"] = {"at": time.monotonic(), "body": body, "error": None}
    return from_github(body, lang), None


async def async_updates_overview(hass: HomeAssistant, force: bool = False, lang: str | None = None) -> dict[str, Any]:
    """lang: UI language (panel); without it Home Assistant's."""
    entry = _entry(hass)
    lang = notes_lang(lang or hass.config.language)
    github, error = await _remote(hass, force, lang)
    releases = merge_releases(github, await _changelog(hass, lang))

    data = hass.data.get(DOMAIN, {})
    hacs = bool(data.get(DATA_HACS))
    entity_id, via = casora_update_entity(hass, entry)
    st = hass.states.get(entity_id) if entity_id else None
    ready = st is not None and st.state not in ("unavailable", "unknown")
    latest = VERSION
    ent_latest = norm_version(st.attributes.get("latest_version")) if ready else ""
    if ent_latest and newer(ent_latest, latest):
        latest = ent_latest
    # Pre-releases only with "Beta versions" (option beta_updates); the list is newest first.
    beta = beta_enabled(entry)
    top = next((r["version"] for r in releases
                if (beta or not r.get("prerelease")) and r.get("source") == "github"), None)
    if top and newer(top, latest):
        latest = top
    # HACS already put the new version in place (installed_version), Casora still runs the old one.
    pending = None
    if via == "hacs" and ready:
        hacs_inst = norm_version(st.attributes.get("installed_version"))
        if hacs_inst and newer(hacs_inst, VERSION):
            pending = hacs_inst
    if pending and newer(pending, latest):
        latest = pending
    rid = data.get(DATA_HACS_ID)

    out = []
    for r in releases:
        item = dict(r)
        item["notes_html"] = render_markdown(r.get("notes_md", ""))
        item["summary"] = summarize(r.get("notes_md", ""))
        out.append(item)

    return {
        "installed": VERSION,
        "latest": latest,
        "update_available": newer(latest, pending or VERSION),
        "entity_id": entity_id,
        "via": via if entity_id else None,
        # Casora's page in HACS (HACS' route takes the GitHub repo id).
        "hacs_url": f"/hacs/repository/{rid}" if hacs and rid else None,
        "entry_id": entry.entry_id if entry else None,
        # Does Casora check itself (own update entity)? With HACS, HACS does.
        "own_check": not hacs,
        "hacs": hacs,
        # Option "Beta versions"; with HACS, betas are turned on in HACS.
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
    # The panel sends its language (as for its other texts); otherwise HA's.
    connection.send_result(msg["id"], await async_updates_overview(hass, msg["force"], msg.get("language")))


@callback
def async_setup_updates(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("updates_ws"):
        return
    websocket_api.async_register_command(hass, ws_list)
    hass.data.setdefault(DOMAIN, {})["updates_ws"] = True
