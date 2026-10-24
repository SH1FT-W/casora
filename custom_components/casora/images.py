"""Room photos for the Casora panel and dashboards: listing, upload, private serving.

Uploaded photos live in /config/casora_fotos (const.PHOTOS_DIR), outside www, so HA's
/local route does not serve them. CasoraPhotoView serves them with auth; the frontend gets
signed URLs (async_sign_path, query authSig) from the listing and from the websocket command
casora/photos, because <img> and CSS backgrounds cannot send an Authorization header.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
import shutil
import time
from datetime import timedelta
from typing import Any

from aiohttp import web
from homeassistant.components.http import KEY_HASS_REFRESH_TOKEN_ID, HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, callback

from .const import ASSETS_DIR, ASSETS_URL_BASE, DOMAIN, PHOTO_URL_BASE, PHOTOS_DIR

_LOGGER = logging.getLogger(__name__)

ROOMS_DIR = PHOTOS_DIR
# Before the move (HACS review, Oct 2026): public under /local/casora/rooms. Migrated on setup.
OLD_ROOMS_DIR = "www/casora/rooms"
OLD_USER_DIR = "www/casora"
# Hemma's photos are still read as a fallback (served through CasoraPhotoView, too).
LEGACY_ROOMS_DIR = "www/hemma/rooms"

SHIPPED_ROOMS = f"{ASSETS_DIR}/rooms"

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
NIGHT_SUFFIX = "-night"
# HA accepts requests up to 16 MB (http.MAX_CLIENT_SIZE) and answers 413 itself above that.
MAX_BYTES = 16 * 1024 * 1024
SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
# Dashboards load room photos as <name>.jpg, so every photo is stored as JPEG at a size
# that loads quickly.
MAX_EDGE = 2560
JPEG_QUALITY = 85

# Signed photo URLs: valid for a day (a dashboard session); a signature is reused while it has
# more than RESIGN_AFTER left, so the URL (and the browser cache) stays stable for hours.
SIGN_TTL = timedelta(hours=24)
RESIGN_AFTER = timedelta(hours=12)
_SIGS = "photo_sigs"


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
        # Same name with another extension (older upload) goes.
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
    from .phone_badges import CYRILLIC  # noqa: PLC0415

    s = "".join(CYRILLIC.get(c, c) for c in (raw or "").strip().lower())
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    import unicodedata  # noqa: PLC0415

    s = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:64]


PRIVATE_TAIL = re.compile(r"-[0-9a-f]{12}$")


def private_name(path, name: str) -> str:
    """New photo name with a random tail ("kueche-3fa9c2d1e0b4"); existing names stay.

    Photos need auth now; the tail is kept as defence in depth (no guessable file names).
    """
    if PRIVATE_TAIL.search(name):
        return name
    for folder in (ROOMS_DIR, LEGACY_ROOMS_DIR):
        for stem in (name, name + NIGHT_SUFFIX):
            if any(os.path.isfile(path(folder, stem + ext)) for ext in EXTENSIONS):
                return name
    return name[:51] + "-" + secrets.token_hex(6)


def _rooms_dir(hass: HomeAssistant) -> str:
    return hass.config.path(ROOMS_DIR)


def _scan(path: str, public: str = PHOTO_URL_BASE, found: dict | None = None) -> list[dict[str, Any]]:
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
        # ?v=<mtime>: a replaced photo shows at once instead of the cached one.
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
    """Own photos, then legacy Hemma ones, then the shipped examples (own names win).

    Own and Hemma photos get PHOTO_URL_BASE addresses (auth); shipped ones stay public.
    """
    found: dict = {}
    _scan(_rooms_dir(hass), PHOTO_URL_BASE, found)
    _scan(hass.config.path(LEGACY_ROOMS_DIR), PHOTO_URL_BASE, found)
    _scan(hass.config.path(SHIPPED_ROOMS), f"{ASSETS_URL_BASE}/rooms", found)
    return _pack(found)


def photo_file(config_dir: str, name: str) -> str | None:
    """Private photo file for a /api/casora/photo/<name> request, or None.

    Own folder first, then Hemma's. Only plain image file names, nothing outside the folders.
    """
    if not name or "/" in name or "\\" in name or name.startswith(".") or "\0" in name:
        return None
    if os.path.splitext(name)[1].lower() not in EXTENSIONS:
        return None
    for folder in (ROOMS_DIR, LEGACY_ROOMS_DIR):
        base = os.path.normpath(os.path.join(config_dir, folder))
        full = os.path.normpath(os.path.join(base, name))
        if os.path.dirname(full) == base and os.path.isfile(full):
            return full
    return None


# ── Signing ──────────────────────────────────────────────────────────────────


@callback
def sign_photo_url(hass: HomeAssistant, url: Any, refresh_token_id: str | None = None,
                   now: float | None = None) -> Any:
    """Signed URL for a private photo (PHOTO_URL_BASE); other URLs unchanged.

    The signature belongs to the caller's refresh token (revoking the login revokes the URL).
    A signature with more than RESIGN_AFTER left is reused, so the URL stays cacheable.
    """
    if not isinstance(url, str) or not url.startswith(PHOTO_URL_BASE + "/"):
        return url
    now = time.time() if now is None else now
    cache: dict = hass.data.setdefault(DOMAIN, {}).setdefault(_SIGS, {})
    key = (refresh_token_id, url)
    hit = cache.get(key) if refresh_token_id else None
    if hit and hit[1] - now > RESIGN_AFTER.total_seconds():
        return hit[0]
    signed = async_sign_path(hass, url, SIGN_TTL, refresh_token_id=refresh_token_id)
    if refresh_token_id:
        if len(cache) > 4096:
            for k in [k for k, v in cache.items() if v[1] <= now]:
                cache.pop(k, None)
        cache[key] = (signed, now + SIGN_TTL.total_seconds())
    return signed


def sign_listing(hass: HomeAssistant, images: list[dict[str, Any]], refresh_token_id: str | None) -> list[dict[str, Any]]:
    """The image list with signed day/night URLs (shipped ones unchanged)."""
    return [
        {**img, "day": sign_photo_url(hass, img.get("day"), refresh_token_id),
         "night": sign_photo_url(hass, img.get("night"), refresh_token_id)}
        for img in images
    ]


def signed_map(hass: HomeAssistant, images: list[dict[str, Any]], refresh_token_id: str | None) -> dict[str, str]:
    """{file stem: signed URL} for private photos ("kueche", "kueche-night")."""
    out: dict[str, str] = {}
    for img in images:
        for slot, suffix in (("day", ""), ("night", NIGHT_SUFFIX)):
            url = img.get(slot)
            if isinstance(url, str) and url.startswith(PHOTO_URL_BASE + "/"):
                out[img["name"] + suffix] = sign_photo_url(hass, url, refresh_token_id)
    return out


# ── Migration www/casora/rooms → casora_fotos ────────────────────────────────


def _same_file(a: str, b: str) -> bool:
    def digest(p: str) -> str:
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    return os.path.getsize(a) == os.path.getsize(b) and digest(a) == digest(b)


def migrate_old_rooms(config_dir: str) -> dict[str, Any]:
    """Move photos from www/casora/rooms (public) into the private folder. Idempotent.

    Names stay (dashboards refer to them). A different file already at the target keeps its
    name; the old one moves next to it as <stem>-www<ext>, so nothing is lost. Removes
    www/casora/rooms when it is empty afterwards, and www/casora when nothing else is in it.
    """
    src_dir = os.path.join(config_dir, OLD_ROOMS_DIR)
    dst_dir = os.path.join(config_dir, ROOMS_DIR)
    out: dict[str, Any] = {"moved": [], "same": [], "renamed": [], "failed": [], "removed_dir": False}
    if not os.path.isdir(src_dir):
        return out
    for entry in sorted(os.listdir(src_dir)):
        src = os.path.join(src_dir, entry)
        if not os.path.isfile(src):
            continue
        try:
            if entry.endswith(".part"):
                # Leftover of an interrupted upload.
                os.remove(src)
                continue
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, entry)
            if os.path.exists(dst):
                if _same_file(src, dst):
                    os.remove(src)
                    out["same"].append(entry)
                    continue
                stem, ext = os.path.splitext(entry)
                n = 1
                while os.path.exists(dst):
                    dst = os.path.join(dst_dir, f"{stem}-www{n if n > 1 else ''}{ext}")
                    n += 1
                out["renamed"].append([entry, os.path.basename(dst)])
            # shutil.move keeps the mtime (copy2 across file systems): ?v= stays the same.
            shutil.move(src, dst)
            out["moved"].append(entry)
        except OSError as err:
            out["failed"].append({"file": entry, "error": str(err)})
    if not out["failed"]:
        for folder in (src_dir, os.path.join(config_dir, OLD_USER_DIR)):
            try:
                os.rmdir(folder)  # only when empty
                out["removed_dir"] = out["removed_dir"] or folder == src_dir
            except OSError:
                break
    return out


async def async_migrate_rooms(hass: HomeAssistant) -> dict[str, Any]:
    """Setup step: run the move once per start and log what happened."""
    try:
        res = await hass.async_add_executor_job(migrate_old_rooms, hass.config.config_dir)
    except OSError as err:
        _LOGGER.warning("Casora could not move the room photos out of %s: %s", OLD_ROOMS_DIR, err)
        return {"moved": [], "same": [], "renamed": [], "failed": [{"file": "", "error": str(err)}]}
    if res["moved"] or res["same"]:
        _LOGGER.info(
            "Casora moved %d room photo(s) from %s to %s (no longer served without login)%s",
            len(res["moved"]) + len(res["same"]), OLD_ROOMS_DIR, ROOMS_DIR,
            f"; renamed because of a name clash: {res['renamed']}" if res["renamed"] else "")
    if res["failed"]:
        _LOGGER.warning("Casora could not move some room photos out of %s: %s", OLD_ROOMS_DIR, res["failed"])
    return res


def _token_id(request: web.Request) -> str | None:
    return request.get(KEY_HASS_REFRESH_TOKEN_ID)


class CasoraImagesView(HomeAssistantView):
    """List and upload room images."""

    url = "/api/casora/images"
    name = "api:casora:images"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        images = await hass.async_add_executor_job(_all_images, hass)
        return self.json({"images": sign_listing(hass, images, _token_id(request)), "directory": ROOMS_DIR})

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
            # aiohttp reports oversized parts as ValueError.
            _LOGGER.debug("Casora image upload rejected: %s", err)
            return _fail("too_large", f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 413)

        if not name or not SAFE_NAME.match(name):
            return _fail("name", "name must be lowercase letters, digits and hyphens")
        if name.endswith("-demo") or name.endswith(NIGHT_SUFFIX):
            # -demo: shipped photos win under /casora_assets; -night is the night slot.
            return _fail("name", "this name is reserved, please choose another")
        if variant not in ("day", "night"):
            return _fail("variant", "variant must be day or night")
        if not payload:
            return _fail("empty", "no file received")
        if len(payload) > MAX_BYTES:
            return _fail("too_large", f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 413)

        directory = _rooms_dir(hass)
        # A new name gets a random tail (defence in depth, see private_name). Existing names stay,
        # or a night photo would no longer find its day photo.
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
        return self.json({"name": name, "variant": variant, "images": sign_listing(hass, images, _token_id(request))})


class CasoraPhotoView(HomeAssistantView):
    """Serve uploaded room photos; login or a signed URL (authSig) required.

    HA's auth middleware accepts ?authSig=… from async_sign_path for GET/HEAD on any route,
    so <img src> and CSS url() work without an Authorization header.
    """

    url = PHOTO_URL_BASE + "/{name}"
    name = "api:casora:photo"
    requires_auth = True

    async def get(self, request: web.Request, name: str) -> web.StreamResponse:
        from .assets import CACHE_DIR, PHONE_RE, webp_variant  # noqa: PLC0415

        hass: HomeAssistant = request.app["hass"]
        found = await hass.async_add_executor_job(photo_file, hass.config.config_dir, name)
        if found is None:
            return web.Response(status=404, text="not found")
        # ?v=<mtime> makes the URL change with the file: a day in the private cache is safe.
        headers = {
            "Cache-Control": "private, max-age=86400" if "v" in request.query else "private, no-cache",
            "Vary": "Accept, User-Agent",
        }
        if found.lower().endswith((".jpg", ".jpeg", ".png")) and "image/webp" in request.headers.get("Accept", ""):
            phone = bool(PHONE_RE.search(request.headers.get("User-Agent", "")))
            webp = await hass.async_add_executor_job(webp_variant, found, hass.config.path(CACHE_DIR), phone)
            if webp:
                return web.FileResponse(webp, headers={**headers, "Content-Type": "image/webp"})
        return web.FileResponse(found, headers=headers)


@callback
def async_setup_photos_ws(hass: HomeAssistant) -> None:
    """Websocket casora/photos: signed URLs of all private photos for the dashboard."""
    import voluptuous as vol  # noqa: PLC0415

    from homeassistant.components import websocket_api  # noqa: PLC0415

    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("photos_ws"):
        return

    @websocket_api.websocket_command({vol.Required("type"): "casora/photos"})
    @websocket_api.async_response
    async def ws_photos(hass, connection, msg) -> None:
        images = await hass.async_add_executor_job(_all_images, hass)
        photos = signed_map(hass, images, connection.refresh_token_id)
        # Every signature handed out has at least RESIGN_AFTER left; the page re-asks before that.
        shipped = sorted(
            img["name"] + suffix for img in images for slot, suffix in (("day", ""), ("night", NIGHT_SUFFIX))
            if str(img.get(slot) or "").startswith(ASSETS_URL_BASE + "/"))
        connection.send_result(msg["id"], {
            "photos": photos,
            "shipped": shipped,
            "expires_in": int(RESIGN_AFTER.total_seconds()),
            "base": PHOTO_URL_BASE,
        })

    websocket_api.async_register_command(hass, ws_photos)
    dom["photos_ws"] = True
