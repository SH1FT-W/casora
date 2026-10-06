"""Room image listing and upload for the Casora panel."""

from __future__ import annotations

import logging
import os
import re
import secrets
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
# HA nimmt Anfragen bis 16 MB an (http.MAX_CLIENT_SIZE); darüber antwortet es selbst mit 413.
MAX_BYTES = 16 * 1024 * 1024
SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
# Das Dashboard lädt Raumfotos als /casora_assets/rooms/<name>.jpg – darum wird jedes
# Foto als JPEG abgelegt und auf eine Größe gebracht, die Dashboards schnell lädt.
MAX_EDGE = 2560
JPEG_QUALITY = 85


class UploadError(Exception):
    """Upload rejected; code is what the panel translates."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def sniff(data: bytes) -> str | None:
    """Image type from the first bytes (file names from phones are unreliable)."""
    head = data[:32]
    if head[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1", b"avif"):
            return "heic" if brand != b"avif" else "avif"
    return None


def to_jpeg(data: bytes, kind: str) -> bytes | None:
    """Re-encode as JPEG (upright, at most MAX_EDGE). None when Pillow is missing.

    Raises UploadError("heic") for HEIC/AVIF that Pillow cannot read here.
    """
    try:
        from PIL import Image, ImageOps  # noqa: PLC0415
    except ImportError:
        if kind in ("heic", "avif"):
            raise UploadError("heic", "HEIC photos are not supported here, please export as JPG") from None
        return None
    if kind in ("heic", "avif"):
        try:
            from pillow_heif import register_heif_opener  # noqa: PLC0415

            register_heif_opener()
        except Exception:  # noqa: BLE001
            raise UploadError("heic", "HEIC photos are not supported here, please export as JPG") from None
    import io  # noqa: PLC0415

    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, (255, 255, 255))
                flat.paste(img, mask=img.split()[-1])
                img = flat
            elif img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            out = io.BytesIO()
            img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            return out.getvalue()
    except UploadError:
        raise
    except Exception as err:  # noqa: BLE001
        if kind in ("heic", "avif"):
            raise UploadError("heic", "HEIC photos are not supported here, please export as JPG") from err
        raise UploadError("broken", f"could not read the image: {err}") from err


def store(directory: str, stem: str, data: bytes, night: bool) -> list[str]:
    """Write <stem> as .jpg (or the original type without Pillow); returns written paths.

    A night photo for a name without a day photo also becomes its day photo, so the
    new name is selectable at once and the dashboard has something to show by day.
    """
    kind = sniff(data)
    if kind is None:
        raise UploadError("type", "file must be a JPG, PNG or WebP photo")
    jpeg = to_jpeg(data, kind)
    if jpeg is not None:
        payload, ext = jpeg, ".jpg"
    elif kind in ("jpeg", "png", "webp"):
        payload, ext = data, {"jpeg": ".jpg", "png": ".png", "webp": ".webp"}[kind]
    else:
        raise UploadError("type", "file must be a JPG, PNG or WebP photo")

    os.makedirs(directory, exist_ok=True)

    def _put(name: str) -> str:
        # Gleicher Name mit anderer Endung (älterer Upload) fliegt raus.
        for old in EXTENSIONS:
            stale = os.path.join(directory, name + old)
            if old != ext and os.path.isfile(stale):
                os.remove(stale)
        target = os.path.join(directory, name + ext)
        tmp = target + ".part"
        with open(tmp, "wb") as handle:
            handle.write(payload)
        os.replace(tmp, target)
        return target

    written = [_put(stem + (NIGHT_SUFFIX if night else ""))]
    if night and not any(os.path.isfile(os.path.join(directory, stem + e)) for e in EXTENSIONS):
        written.append(_put(stem))
    return written


def clean_name(raw: str) -> str:
    """'Wohn Zimmer' / 'Küche' -> 'wohn-zimmer' / 'kueche' (same rule as the panel's slug)."""
    s = (raw or "").strip().lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    import unicodedata  # noqa: PLC0415

    s = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:64]


PRIVATE_TAIL = re.compile(r"-[0-9a-f]{12}$")


def private_name(path, name: str) -> str:
    """Neuer Fotoname mit zufälligem Anhang („kueche-3fa9c2d1e0b4“); vorhandene Namen unverändert."""
    if PRIVATE_TAIL.search(name):
        return name
    for folder in (ROOMS_DIR, LEGACY_ROOMS[0]):
        for stem in (name, name + NIGHT_SUFFIX):
            if any(os.path.isfile(path(folder, stem + ext)) for ext in EXTENSIONS):
                return name
    return name[:51] + "-" + secrets.token_hex(6)


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
        # ?v= Änderungszeit: ein ersetztes Foto zeigt sofort das neue statt des zwischengespeicherten.
        try:
            stamp = f"?v={int(os.path.getmtime(full))}"
        except OSError:
            stamp = ""
        slot.setdefault("night" if night else "day", f"{public}/{entry}{stamp}")
    return _pack(found)


def _pack(found: dict) -> list[dict[str, Any]]:
    return [
        {"name": name, "day": urls.get("day"), "night": urls.get("night")}
        for name, urls in sorted(found.items())
        if urls.get("day")
    ]


def _all_images(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Own photos, then legacy Hemma ones, then the shipped examples (own names win)."""
    found: dict = {}
    _scan(_rooms_dir(hass), PUBLIC_BASE, found)
    if LEGACY_ROOMS[0] != ROOMS_DIR:
        _scan(hass.config.path(LEGACY_ROOMS[0]), LEGACY_ROOMS[1], found)
    _scan(hass.config.path(SHIPPED_ROOMS), f"{ASSETS_URL_BASE}/rooms", found)
    return _pack(found)


class CasoraImagesView(HomeAssistantView):
    """List and upload room images."""

    url = "/api/casora/images"
    name = "api:casora:images"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        images = await hass.async_add_executor_job(_all_images, hass)
        return self.json({"images": images, "directory": ROOMS_DIR})

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)

        hass: HomeAssistant = request.app["hass"]

        def _fail(code: str, message: str, status: int = 400) -> web.Response:
            return self.json({"message": message, "code": code}, status_code=status)

        try:
            reader = await request.multipart()
        except Exception:  # noqa: BLE001
            return _fail("empty", "expected multipart body")

        name: str | None = None
        variant = "day"
        payload: bytes | None = None

        try:
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "name":
                    name = clean_name(await part.text())
                elif part.name == "variant":
                    variant = (await part.text()).strip().lower()
                elif part.name == "file":
                    payload = await part.read(decode=False)
        except ValueError as err:
            # aiohttp meldet zu große Teile als ValueError.
            _LOGGER.debug("Casora image upload rejected: %s", err)
            return _fail("too_large", f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 413)

        if not name or not SAFE_NAME.match(name):
            return _fail("name", "name must be lowercase letters, digits and hyphens")
        if name.endswith("-demo") or name.endswith(NIGHT_SUFFIX):
            # -demo: mitgelieferte Fotos gewinnen unter /casora_assets; -night ist der Nacht-Platz.
            return _fail("name", "this name is reserved, please choose another")
        if variant not in ("day", "night"):
            return _fail("variant", "variant must be day or night")
        if not payload:
            return _fail("empty", "no file received")
        if len(payload) > MAX_BYTES:
            return _fail("too_large", f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 413)

        directory = _rooms_dir(hass)
        # Fotos liegen unter /local und /casora_assets ohne Anmeldung (ein <img> schickt kein Token).
        # Ein neuer Name bekommt darum einen zufälligen Anhang, damit niemand „wohnzimmer.jpg“ erraten
        # kann. Vorhandene Namen bleiben, sonst landete ein Nachtfoto nicht mehr beim Tagfoto.
        name = await hass.async_add_executor_job(private_name, hass.config.path, name)
        try:
            written = await hass.async_add_executor_job(store, directory, name, payload, variant == "night")
        except UploadError as err:
            return _fail(err.code, str(err))
        except OSError as err:
            _LOGGER.error("Casora image upload failed: %s", err)
            return _fail("write", f"could not write file: {err}", 500)

        _LOGGER.debug("Casora wrote %s (%d bytes in)", written, len(payload))
        images = await hass.async_add_executor_job(_all_images, hass)
        return self.json({"name": name, "variant": variant, "images": images})
