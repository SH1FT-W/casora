"""Serve Casora's dashboard scripts (/casora_scripts) compressed and cacheable.

Casora (30.09.2026): Beim ersten Öffnen am Handy standen rund 15 s alle Räume
ungefiltert da. Ein Grund war die Menge: HAs statische Route lieferte die
Skripte ungepackt (gut 1,5 MB statt rund 0,4 MB) und ohne Cache-Control, das
Handy lud sie bei jedem Öffnen neu bzw. fragte jede Datei einzeln nach.

Jetzt: gzip, sobald der Browser es annimmt (einmal gepackt, im Speicher bis zur
nächsten Dateiänderung), und langes Cachen nur für eine Adresse, deren ?v= nicht
älter ist als die Datei. Die Integration setzt ?v= aus der Änderungszeit (der
Lader reicht seine an die Module weiter), eine Adresse mit altem Stempel – etwa
von Hand eingetragen im yaml-Modus – wird dagegen jedes Mal per ETag geprüft.
"""

from __future__ import annotations

import gzip
import os

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import SCRIPTS_URL_BASE

_YEAR = "public, max-age=31536000, immutable"
_TYPES = {".js": "text/javascript", ".json": "application/json", ".css": "text/css"}


def _under(base: str, rel: str) -> str | None:
    """Join and confirm the result is still inside base."""
    full = os.path.normpath(os.path.join(base, rel))
    root = os.path.normpath(base)
    if full != root and not full.startswith(root + os.sep):
        return None
    return full


class CasoraScriptsView(HomeAssistantView):
    """Same files and reach as the static route it replaces (no auth: module scripts send no token)."""

    url = SCRIPTS_URL_BASE + "/{path:.*}"
    name = "casora:scripts"
    requires_auth = False

    def __init__(self, base: str) -> None:
        self._base = base
        # Pfad -> (mtime_ns, Größe, roh, gepackt)
        self._cache: dict[str, tuple[int, int, bytes, bytes]] = {}

    def _load(self, full: str) -> tuple[int, int, bytes, bytes] | None:
        try:
            st = os.stat(full)
        except OSError:
            return None
        if not os.path.isfile(full):
            return None
        hit = self._cache.get(full)
        if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
            return hit
        with open(full, "rb") as f:
            raw = f.read()
        entry = (st.st_mtime_ns, st.st_size, raw, gzip.compress(raw, 6, mtime=0))
        self._cache[full] = entry
        return entry

    async def get(self, request: web.Request, path: str) -> web.StreamResponse:
        full = _under(self._base, path)
        ctype = _TYPES.get(os.path.splitext(path)[1].lower())
        if full is None or ctype is None:
            return web.Response(status=404, text="not found")
        hass: HomeAssistant = request.app["hass"]
        entry = await hass.async_add_executor_job(self._load, full)
        if entry is None:
            return web.Response(status=404, text="not found")
        mtime_ns, size, raw, packed = entry

        v = request.query.get("v", "")
        fresh = v.isdigit() and int(v) >= mtime_ns // 1_000_000_000
        etag = f'"{mtime_ns:x}-{size:x}"'
        headers = {
            "Cache-Control": _YEAR if fresh else "no-cache",
            "ETag": etag,
            "Vary": "Accept-Encoding",
        }
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=304, headers=headers)
        if "gzip" in request.headers.get("Accept-Encoding", "").lower():
            headers["Content-Encoding"] = "gzip"
            return web.Response(body=packed, content_type=ctype, charset="utf-8", headers=headers)
        return web.Response(body=raw, content_type=ctype, charset="utf-8", headers=headers)
