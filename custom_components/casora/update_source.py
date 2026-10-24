"""Where Casora gets its updates: the public GitHub API of UPDATE_REPO – anonymous,
no key and no token.

  GET /repos/<repo>/releases?per_page=…  → Casora releases ("vX.Y.Z"; old card updates "karten-…" are skipped)

Only the list and its release notes – Casora downloads no release; installing is HACS' job.
Anonymous, GitHub allows 60 requests per hour and IP. Casora asks only every 6 hours
(update entity) or at most every 15 minutes (Studio) – and sends
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

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, UPDATE_REPO, VERSION

_LOGGER = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com/repos/" + UPDATE_REPO
# Former options (update server/token) – no longer read, only removed.
LEGACY_OPTIONS = ("update_key", "update_server", "update_token")
# Option "Beta versions" (Studio → Updates): the update entity also reports pre-releases.
# Off by default.
OPT_BETA = "beta_updates"
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


async def _get(hass: HomeAssistant, path: str, *, timeout: int = 20) -> Any:
    """GET JSON from GitHub. Errors → UpdateSourceError."""
    data = hass.data.setdefault(DOMAIN, {})
    if time.time() < data.get(_PAUSE, 0):
        raise UpdateSourceError("rate_limited")  # limit reached: do not ask before the reset
    url, headers = GITHUB_API + path, gh_headers()
    etags: dict = data.setdefault(_ETAGS, {})
    cached = etags.get(url)
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
    """Release list (one URL, one ETag, one request).

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


async def fetch_releases(hass: HomeAssistant) -> list[dict]:
    """Releases in GitHub's shape (tag_name, body, published_at, prerelease, draft, html_url, assets)."""
    return await _releases(hass)
