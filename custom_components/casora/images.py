"""Room image listing and upload for the Casora panel."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import ASSETS_DIR, ASSETS_URL_BASE

_LOGGER = logging.getLogger(__name__)

ROOMS_DIR = "www/casora/rooms"
PUBLIC_BASE = "/local/casora/rooms"
# Raumbilder aus der Casora-Zeit werden weiter gelistet (Upload geht in den neuen Ordner).
LEGACY_ROOMS = ("www/hemma/rooms", "/local/hemma/rooms")

SHIPPED_ROOMS = f"{ASSETS_DIR}/rooms"

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
NIGHT_SUFFIX = "-night"
MAX_BYTES = 12 * 1024 * 1024
SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def _rooms_dir(hass: HomeAssistant) -> str:
    return hass.config.path(ROOMS_DIR)


def _scan(path: str, public: str = PUBLIC_BASE, found: dict | None = None) -> list[dict[str, Any]]:
    found = {} if found is None else found
    if not os.path.isdir(path):
        return _pack(found)

    for entry in sorted(os.listdir(path)):
        full = os.path.join(path, entry)
        if not os.path.isfile(full):
            continue
        stem, ext = os.path.splitext(entry)
        if ext.lower() not in EXTENSIONS:
            continue

        night = stem.endswith(NIGHT_SUFFIX)
        base = stem[: -len(NIGHT_SUFFIX)] if night else stem
        slot = found.setdefault(base, {})
        slot.setdefault("night" if night else "day", f"{public}/{entry}")
    return _pack(found)


def _pack(found: dict) -> list[dict[str, Any]]:
    return [
        {"name": name, "day": urls.get("day"), "night": urls.get("night")}
        for name, urls in sorted(found.items())
        if urls.get("day")
    ]


class CasoraImagesView(HomeAssistantView):
    """List and upload room images."""

    url = "/api/casora/images"
    name = "api:casora:images"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        def _all():
            found: dict = {}
            _scan(_rooms_dir(hass), PUBLIC_BASE, found)
            if LEGACY_ROOMS[0] != ROOMS_DIR:
                _scan(hass.config.path(LEGACY_ROOMS[0]), LEGACY_ROOMS[1], found)
            # Mitgelieferte Beispielbilder – eigene gleichen Namens haben Vorrang.
            _scan(hass.config.path(SHIPPED_ROOMS), f"{ASSETS_URL_BASE}/rooms", found)
            return _pack(found)

        images = await hass.async_add_executor_job(_all)
        return self.json({"images": images, "directory": ROOMS_DIR})

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)

        hass: HomeAssistant = request.app["hass"]

        try:
            reader = await request.multipart()
        except Exception:  # noqa: BLE001
            return self.json_message("expected multipart body", 400)

        name: str | None = None
        variant = "day"
        payload: bytes | None = None
        filename = ""

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "name":
                name = (await part.text()).strip().lower()
            elif part.name == "variant":
                variant = (await part.text()).strip().lower()
            elif part.name == "file":
                filename = part.filename or ""
                payload = await part.read(decode=False)

        if not name or not SAFE_NAME.match(name):
            return self.json_message("name must be lowercase letters, digits and hyphens", 400)
        if variant not in ("day", "night"):
            return self.json_message("variant must be day or night", 400)
        if not payload:
            return self.json_message("no file received", 400)
        if len(payload) > MAX_BYTES:
            return self.json_message(f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 400)

        ext = os.path.splitext(filename)[1].lower()
        if ext == ".jpeg":
            ext = ".jpg"
        if ext not in EXTENSIONS:
            return self.json_message("file must be .jpg, .png or .webp", 400)

        stem = name + (NIGHT_SUFFIX if variant == "night" else "")
        directory = _rooms_dir(hass)

        def _write() -> str:
            os.makedirs(directory, exist_ok=True)
            # A name can already exist under a different extension.
            for old in EXTENSIONS:
                stale = os.path.join(directory, stem + old)
                if old != ext and os.path.isfile(stale):
                    os.remove(stale)
            target = os.path.join(directory, stem + ext)
            with open(target, "wb") as handle:
                handle.write(payload)
            return target

        try:
            target = await hass.async_add_executor_job(_write)
        except OSError as err:
            _LOGGER.error("Casora image upload failed: %s", err)
            return self.json_message(f"could not write file: {err}", 500)

        _LOGGER.debug("Casora wrote %s (%d bytes)", target, len(payload))
        images = await hass.async_add_executor_job(_scan, directory)
        return self.json({"name": name, "variant": variant, "images": images})
