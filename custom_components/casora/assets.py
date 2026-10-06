"""Serve Casora's icons, fonts, weather art and demo room images."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import ASSETS_URL_BASE, LEGACY_USER_ASSETS_DIR, USER_ASSETS_DIR

_LOGGER = logging.getLogger(__name__)

SETTINGS_FILE = "einstellungen.js"

# Raumfotos (06.10.2026): Das Dashboard lädt sie als /casora_assets/rooms/<name>.jpg – rund
# 3 MB je Öffnen. Nimmt der Browser WebP an, kommt eine WebP-Fassung (gleiche Größe, etwa
# halb so viele Bytes; am Handy höchstens PHONE_EDGE Pixel breit – das Foto liegt dort
# ohnehin weichgezeichnet hinter den Karten). Die Fassungen entstehen beim ersten Abruf und
# liegen unter CACHE_DIR; die Originale bleiben unverändert.
CACHE_DIR = ".storage/casora_bilder"
PHOTO_EXT = (".jpg", ".jpeg", ".png")
WEBP_QUALITY = 80
PHONE_EDGE = 1280
_PHONE = re.compile(r"iPhone|iPod|Android.*Mobile|Mobile.*Android", re.I)
# Mitgelieferte Dateien ändern sich nur mit einem Update: einen Tag cachen. Eigene Dateien
# (www/casora) können jederzeit ersetzt werden: immer kurz nachfragen (ETag → meist „304“).
_SHIPPED_CC = "public, max-age=86400"
_OWN_CC = "no-cache"
_lock = threading.Lock()


def _under(base: str, rel: str) -> str | None:
    """Join and confirm the result is still inside base."""
    full = os.path.normpath(os.path.join(base, rel))
    root = os.path.normpath(base)
    if full != root and not full.startswith(root + os.sep):
        return None
    return full


def webp_variant(src: str, cache_dir: str, phone: bool) -> str | None:
    """Pfad der WebP-Fassung von src (anlegen, falls nötig); None, wenn es keine gibt."""
    try:
        st = os.stat(src)
    except OSError:
        return None
    key = hashlib.sha1(src.encode("utf-8")).hexdigest()[:16]
    name = f"{key}-{st.st_mtime_ns:x}-{st.st_size:x}-{'p' if phone else 'd'}.webp"
    out = os.path.join(cache_dir, name)
    if os.path.isfile(out):
        return out if os.path.getsize(out) < st.st_size else None
    try:
        from PIL import Image  # noqa: PLC0415
    except ImportError:
        return None
    import io  # noqa: PLC0415

    try:
        with Image.open(src) as img:
            img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img
            if phone and img.width > PHONE_EDGE:
                img = img.resize((PHONE_EDGE, round(img.height * PHONE_EDGE / img.width)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=WEBP_QUALITY, method=4)
    except Exception:  # noqa: BLE001 - dann eben das Original
        _LOGGER.debug("Casora: keine WebP-Fassung für %s", src, exc_info=True)
        return None
    with _lock:
        os.makedirs(cache_dir, exist_ok=True)
        # Ältere Fassungen desselben Fotos (ersetzt) entfernen.
        for old in os.listdir(cache_dir):
            if old.startswith(key + "-") and old.endswith(("-p.webp" if phone else "-d.webp")) and old != name:
                try:
                    os.remove(os.path.join(cache_dir, old))
                except OSError:
                    pass
        tmp = out + f".{threading.get_ident()}.part"
        with open(tmp, "wb") as handle:
            handle.write(buf.getvalue())
        os.replace(tmp, out)
    return out if os.path.getsize(out) < st.st_size else None


class CasoraAssetsView(HomeAssistantView):
    """Shipped assets win; the user's www/casora fills the gaps.

    Unauthenticated because these are loaded by bare <img> and @font-face,
    which send no token. Same reach as /local, which serves the same files.
    """

    url = ASSETS_URL_BASE + "/{path:.*}"
    name = "casora:assets"
    requires_auth = False

    def __init__(self, shipped: str) -> None:
        self._shipped = shipped

    async def get(self, request: web.Request, path: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        user = hass.config.path(USER_ASSETS_DIR)
        legacy = hass.config.path(LEGACY_USER_ASSETS_DIR)

        def _find() -> str | None:
            for base in (self._shipped, user, legacy):
                full = _under(base, path)
                if full and os.path.isfile(full):
                    return full
            return None

        found = await hass.async_add_executor_job(_find)
        if found is None and path == SETTINGS_FILE:
            # Eigene Einstellungen sind optional: ohne Datei ein leeres Modul.
            return web.Response(text="// Keine eigenen Casora-Einstellungen (www/casora/einstellungen.js).\n",
                                content_type="text/javascript", headers={"Cache-Control": "no-store"})
        if found is None:
            return web.Response(status=404, text="not found")
        shipped = found.startswith(os.path.normpath(self._shipped) + os.sep)
        headers = {"Cache-Control": _SHIPPED_CC if shipped else _OWN_CC}
        if path.startswith("rooms/") and found.lower().endswith(PHOTO_EXT):
            headers["Vary"] = "Accept, User-Agent"
            if "image/webp" in request.headers.get("Accept", ""):
                phone = bool(_PHONE.search(request.headers.get("User-Agent", "")))
                webp = await hass.async_add_executor_job(
                    webp_variant, found, hass.config.path(CACHE_DIR), phone)
                if webp:
                    return web.FileResponse(webp, headers={**headers, "Content-Type": "image/webp"})
        return web.FileResponse(found, headers=headers)
