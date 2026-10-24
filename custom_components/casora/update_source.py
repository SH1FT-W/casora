"""Where Casora gets its updates: the public GitHub API of UPDATE_REPO – anonymous,
no key and no token.

  GET /repos/<repo>/releases?per_page=…  → Casora releases ("vX.Y.Z") and card updates ("karten-…")
  GET /repos/<repo>/releases/assets/<id> → release package casora.zip (custom_components/casora only),
                                           or the package JSON of a card update
  GET /repos/<repo>/zipball/<tag>        → whole repository archive (fallback for releases without casora.zip)

Anonymous, GitHub allows 60 requests per hour and IP. Casora asks only every 6 hours
(update entity, card updates) or at most every 15 minutes (Studio) – and sends
If-None-Match so unchanged answers (304) do not count. If the limit is reached anyway
(403/429), Casora waits until the reset GitHub names and does not ask before that.
404 (repo not public or renamed) simply means "no updates" – no error, no log noise.

All calls return GitHub's shape (tag_name, body, published_at, …) – release_notes.py
reads it unchanged. There used to be an own update server with a Casora key
(options update_key/update_server/update_token); __init__.py removes old values of those.
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import quote

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, UPDATE_REPO, VERSION

_LOGGER = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com/repos/" + UPDATE_REPO
# Former options (update server/token) – no longer read, only removed.
LEGACY_OPTIONS = ("update_key", "update_server", "update_token")
# Option "Beta versions" (Studio → Updates): pre-releases count as well.
# Off by default. Card updates never include pre-releases.
OPT_BETA = "beta_updates"
# Release package built by tools/release.sh (same file HACS loads via hacs.json zip_release).
RELEASE_ASSET = "casora.zip"
# Quiet period after hitting the limit when GitHub gives no reset time.
RATE_PAUSE_S = 15 * 60
_ETAGS = "gh_etags"
_PAUSE = "gh_paused_until"


class UpdateSourceError(Exception):
    """Request failed; `code` is the short code for the Studio."""

    def __init__(self, code: str, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def code_for_status(status: int | None, text: str = "", remaining: str | None = None) -> str:
    if status == 429 or (status == 403 and (remaining == "0" or "rate limit" in (text or "").lower())):
        return "rate_limited"
    if status in (401, 403):
        return "forbidden"
    if status == 404:
        return "not_found"
    return "unreachable"


def error_code(err: Exception) -> str:
    """Request error → short code for the Studio."""
    if isinstance(err, UpdateSourceError):
        return err.code
    return code_for_status(getattr(err, "status", None), str(getattr(err, "message", "")))


def error_text(code: str | None) -> str | None:
    """German short text (card updates show it as is)."""
    if not code:
        return None
    return {
        "forbidden": "Kein Zugriff auf die Updates",
        "rate_limited": "Zu viele Anfragen – später erneut",
        "not_found": "Keine Updates gefunden",
    }.get(code, "GitHub nicht erreichbar")


def gh_headers(accept: str = "application/vnd.github+json") -> dict[str, str]:
    """Headers for GitHub's REST API – anonymous; GitHub requires a User-Agent."""
    return {"Accept": accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": f"Casora/{VERSION}"}


def _pause_until(headers: Any) -> float:
    """When GitHub accepts requests again (Retry-After or X-RateLimit-Reset)."""
    now = time.time()
    try:
        after = headers.get("Retry-After")
        if after and str(after).isdigit():
            return now + int(after)
        reset = headers.get("X-RateLimit-Reset")
        if reset and str(reset).isdigit() and int(reset) > now:
            return min(float(reset), now + 3600)
    except (AttributeError, TypeError, ValueError):
        pass
    return now + RATE_PAUSE_S


async def _get(hass: HomeAssistant, path: str, *, accept: str = "application/vnd.github+json",
               timeout: int = 20, raw: bool = False, max_bytes: int | None = None) -> Any:
    """GET from GitHub → JSON or bytes. Errors → UpdateSourceError."""
    data = hass.data.setdefault(DOMAIN, {})
    if time.time() < data.get(_PAUSE, 0):
        raise UpdateSourceError("rate_limited")  # limit reached: do not ask before the reset
    url, headers = GITHUB_API + path, gh_headers(accept)
    etags: dict = data.setdefault(_ETAGS, {})
    cached = None if raw else etags.get(url)
    if cached:
        headers["If-None-Match"] = cached[0]
    session = async_get_clientsession(hass)
    try:
        async with session.get(url, headers=headers, timeout=timeout) as resp:
            if resp.status == 304 and cached:
                return cached[1]
            if resp.status >= 400:
                text = ""
                if resp.status == 403:
                    text = (await resp.text())[:500]
                code = code_for_status(resp.status, text, resp.headers.get("X-RateLimit-Remaining"))
                if code == "rate_limited":
                    data[_PAUSE] = _pause_until(resp.headers)
                raise UpdateSourceError(code, resp.status)
            if raw:
                if max_bytes is not None:
                    length = resp.headers.get("Content-Length")
                    if length and length.isdigit() and int(length) > max_bytes:
                        raise UpdateSourceError("too_large")
                    body = await resp.content.read(max_bytes + 1)
                    if len(body) > max_bytes:
                        raise UpdateSourceError("too_large")
                    return body
                return await resp.read()
            body = await resp.json(content_type=None)
            etag = resp.headers.get("ETag")
            if etag:
                etags[url] = (etag, body)
            return body
    except UpdateSourceError:
        raise
    except Exception as err:  # noqa: BLE001 – offline, timeout, broken answer
        raise UpdateSourceError("unreachable") from err


async def _releases(hass: HomeAssistant) -> list[dict]:
    """Release list (one URL for Casora and card updates – one ETag, one request).

    404 (repo not public/renamed) = no releases, no error.
    """
    try:
        body = await _get(hass, "/releases?per_page=100")
    except UpdateSourceError as err:
        if err.code != "not_found":
            raise
        _LOGGER.debug("Casora: %s nicht öffentlich erreichbar (404) – keine Updates", UPDATE_REPO)
        return []
    return body if isinstance(body, list) else []


# ── Casora releases ─────────────────────────────────────────────────────────

async def fetch_releases(hass: HomeAssistant) -> list[dict]:
    """Releases in GitHub's shape (tag_name, body, published_at, prerelease, draft, html_url, assets)."""
    return await _releases(hass)


def release_asset(rel: dict | None) -> dict | None:
    """The casora.zip asset of a release, if the release lists one (releases before 26.10.60 do not)."""
    for asset in (rel or {}).get("assets") or []:
        if isinstance(asset, dict) and asset.get("name") == RELEASE_ASSET and asset.get("id") is not None:
            return asset
    return None


async def download_release(hass: HomeAssistant, tag: str, rel: dict | None = None) -> bytes:
    """Release as zip: the small package casora.zip if listed, otherwise the whole repo archive.

    update.stage_zip accepts both layouts. A failed package download (other than the rate
    limit, which would hit the fallback too) falls back to the repo archive."""
    asset = release_asset(rel)
    if asset is not None:
        try:
            return await _get(hass, f"/releases/assets/{quote(str(asset['id']), safe='')}",
                              accept="application/octet-stream", timeout=120, raw=True)
        except UpdateSourceError as err:
            if err.code == "rate_limited":
                raise
            _LOGGER.debug("Casora: %s für %s nicht geladen (%s) – nehme das Repo-Archiv", RELEASE_ASSET, tag, err.code)
    return await _get(hass, f"/zipball/{quote(tag, safe='')}", timeout=120, raw=True)


# ── Card updates ────────────────────────────────────────────────────────────

async def fetch_card_releases(hass: HomeAssistant, prefix: str) -> list[dict]:
    """Card releases → [{tag, url, package: {name, size, sha256, stamp, ref} | None}]."""
    out: list[dict] = []
    for rel in await _releases(hass):
        tag = str(rel.get("tag_name") or "")
        if not tag.startswith(prefix) or rel.get("draft") or rel.get("prerelease"):
            continue
        asset = next((a for a in rel.get("assets") or []
                      if str(a.get("name", "")).startswith(prefix) and str(a.get("name", "")).endswith(".json")), None)
        pkg = None
        if asset is not None:
            digest = str(asset.get("digest") or "")
            pkg = {"name": str(asset.get("name")), "size": int(asset.get("size") or 0),
                   "sha256": digest[7:] if digest.startswith("sha256:") else "",
                   "stamp": f"{asset.get('id')}:{asset.get('updated_at')}", "ref": str(asset.get("id"))}
        out.append({"tag": tag, "url": rel.get("html_url"), "package": pkg})
    return out


async def download_card(hass: HomeAssistant, pkg: dict, max_bytes: int) -> bytes:
    ref = quote(str(pkg.get("ref") or ""), safe="")
    return await _get(hass, f"/releases/assets/{ref}", accept="application/octet-stream",
                      timeout=60, raw=True, max_bytes=max_bytes)
