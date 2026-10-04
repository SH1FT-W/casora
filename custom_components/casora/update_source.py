"""Woher Casora seine Updates holt: die öffentliche GitHub-API von UPDATE_REPO – anonym,
ohne Schlüssel und ohne Token.

  GET /repos/<repo>/releases?per_page=…  → Casora-Releases („vX.Y.Z“) und Karten-Updates („karten-…“)
  GET /repos/<repo>/zipball/<tag>        → Release-Archiv (zip)
  GET /repos/<repo>/releases/assets/<id> → Paket-JSON eines Karten-Updates

Anonym erlaubt GitHub 60 Anfragen pro Stunde und IP. Casora fragt nur alle 6 Stunden
(Update-Entität, Karten-Updates) bzw. höchstens alle 15 Minuten (Studio) – und schickt
If-None-Match mit, damit unveränderte Antworten (304) nicht mitzählen. Ist das Limit
trotzdem erreicht (403/429), wartet Casora bis zur Freigabe, die GitHub nennt, und fragt
bis dahin gar nicht erst. 404 (Repo nicht öffentlich oder umbenannt) heißt einfach
„keine Updates“ – ohne Fehler und ohne Log-Rauschen.

Alle Abrufe liefern GitHubs Form (tag_name, body, published_at, …) – release_notes.py
liest sie unverändert. Früher gab es dafür einen eigenen Update-Server mit Casora-Schlüssel
(Optionen update_key/update_server/update_token); alte Werte davon räumt __init__.py weg.
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
# Frühere Optionen (Update-Server/Token) – werden nicht mehr gelesen, nur noch entfernt.
LEGACY_OPTIONS = ("update_key", "update_server", "update_token")
# Option „Beta-Versionen“ (Studio → Updates): Vorabversionen (prerelease) zählen mit.
# Standard aus. Karten-Updates bleiben immer ohne Vorabversionen.
OPT_BETA = "beta_updates"
# Ohne Angabe von GitHub so lange nach einem Limit-Treffer still sein.
RATE_PAUSE_S = 15 * 60
_ETAGS = "gh_etags"
_PAUSE = "gh_paused_until"


class UpdateSourceError(Exception):
    """Abruf gescheitert; `code` ist der kurze Code fürs Studio."""

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
    """Fehler beim Abruf → kurzer Code fürs Studio."""
    if isinstance(err, UpdateSourceError):
        return err.code
    return code_for_status(getattr(err, "status", None), str(getattr(err, "message", "")))


def error_text(code: str | None) -> str | None:
    """Deutscher Kurztext (Karten-Updates zeigen ihn direkt an)."""
    if not code:
        return None
    return {
        "forbidden": "Kein Zugriff auf die Updates",
        "rate_limited": "Zu viele Anfragen – später erneut",
        "not_found": "Keine Updates gefunden",
    }.get(code, "GitHub nicht erreichbar")


def gh_headers(accept: str = "application/vnd.github+json") -> dict[str, str]:
    """Kopfzeilen für GitHubs REST-API – anonym; GitHub verlangt einen User-Agent."""
    return {"Accept": accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": f"Casora/{VERSION}"}


def _pause_until(headers: Any) -> float:
    """Wann GitHub wieder Anfragen annimmt (Retry-After bzw. X-RateLimit-Reset)."""
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
    """GET bei GitHub → JSON oder Bytes. Fehler → UpdateSourceError."""
    data = hass.data.setdefault(DOMAIN, {})
    if time.time() < data.get(_PAUSE, 0):
        raise UpdateSourceError("rate_limited")  # Limit erreicht: bis zur Freigabe nicht fragen
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
    except Exception as err:  # noqa: BLE001 – offline, Zeitüberschreitung, kaputte Antwort
        raise UpdateSourceError("unreachable") from err


async def _releases(hass: HomeAssistant) -> list[dict]:
    """Release-Liste (eine Adresse für Casora- und Karten-Updates – ein ETag, eine Anfrage).

    404 (Repo nicht öffentlich/umbenannt) = keine Releases, kein Fehler.
    """
    try:
        body = await _get(hass, "/releases?per_page=100")
    except UpdateSourceError as err:
        if err.code != "not_found":
            raise
        _LOGGER.debug("Casora: %s nicht öffentlich erreichbar (404) – keine Updates", UPDATE_REPO)
        return []
    return body if isinstance(body, list) else []


# ── Casora-Releases ─────────────────────────────────────────────────────────

async def fetch_releases(hass: HomeAssistant) -> list[dict]:
    """Releases in GitHubs Form (tag_name, body, published_at, prerelease, draft, html_url)."""
    return await _releases(hass)


async def download_release(hass: HomeAssistant, tag: str) -> bytes:
    return await _get(hass, f"/zipball/{quote(tag, safe='')}", timeout=120, raw=True)


# ── Karten-Updates ─────────────────────────────────────────────────────────

async def fetch_card_releases(hass: HomeAssistant, prefix: str) -> list[dict]:
    """Karten-Releases → [{tag, url, package: {name, size, sha256, stamp, ref} | None}]."""
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
