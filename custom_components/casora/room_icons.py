"""Eigene Raum-Symbole: hochladen (SVG oder PNG mit Transparenz), auflisten, löschen.

Die Dateien liegen in config/www/casora/icons/eigene/ (außerhalb von custom_components,
überstehen also jedes Update) und werden unter /local/casora/icons/eigene/<name> geladen.
Gezeichnet werden sie wie die mitgelieferten Symbole als CSS-Maske in Theme-Farbe:
bei SVG zählt die Form, bei PNG der Alphakanal.

SVG ist Text und könnte Skripte tragen, die beim direkten Öffnen der Datei laufen.
Darum wird jede SVG beim Hochladen neu geschrieben: nur bekannte Zeichen-Elemente und
-Attribute bleiben, Verweise nur innerhalb der Datei (#id), keine Ereignis-Attribute,
kein <script>, kein <foreignObject>, kein <style>, keine DOCTYPE-Entitäten.
"""

from __future__ import annotations

import json
import logging
import os
import re
import struct
import xml.etree.ElementTree as ET
from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

ICONS_DIR = "www/casora/icons/eigene"
PUBLIC_BASE = "/local/casora/icons/eigene"
EXTENSIONS = (".svg", ".png")
MAX_BYTES = 200 * 1024
MAX_PNG_SIDE = 1024
SAFE_FILE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}\.(svg|png)$")

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"

# Was eine Symbol-Datei zum Zeichnen braucht. Alles andere fällt weg.
ALLOWED_TAGS = {
    "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "defs", "mask", "clipPath", "linearGradient", "radialGradient", "stop", "use",
    "symbol", "title", "desc",
}
ALLOWED_ATTRS = {
    "id", "class", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
    "cx", "cy", "r", "rx", "ry", "fx", "fy", "d", "points", "transform", "version",
    "fill", "fill-opacity", "fill-rule", "clip-rule", "clip-path", "mask", "opacity",
    "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "vector-effect",
    "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
    "spreadMethod", "maskUnits", "maskContentUnits", "clipPathUnits",
    "preserveAspectRatio", "display", "visibility", "style", "href",
}
# Erlaubte Angaben in style="…" (gleiche Sorte wie die Attribute oben).
ALLOWED_STYLE = {
    "fill", "fill-opacity", "fill-rule", "clip-rule", "opacity", "stroke", "stroke-width",
    "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
    "stroke-dasharray", "stroke-dashoffset", "display", "visibility", "stop-color",
    "stop-opacity", "mask", "clip-path",
}
URL_REF = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)
DOCTYPE = re.compile(rb"<!DOCTYPE[^>\[]*>", re.I)


class IconError(ValueError):
    """Ungültige oder unsichere Datei (Meldung geht an die Oberfläche)."""


def _local(name: str) -> str:
    return name.split("}", 1)[1] if name.startswith("{") else name


def _ns(name: str) -> str:
    return name[1:].split("}", 1)[0] if name.startswith("{") else ""


def _safe_value(value: str) -> bool:
    low = value.lower()
    if "javascript:" in low or "data:" in low or "expression(" in low or "@import" in low:
        return False
    # url(...) nur auf Stellen in derselben Datei (#maske), nie nach außen.
    return all(m.group(2).strip().startswith("#") for m in URL_REF.finditer(value))


def _clean_style(value: str) -> str:
    keep = []
    for decl in value.split(";"):
        if ":" not in decl:
            continue
        prop, val = (x.strip() for x in decl.split(":", 1))
        if prop.lower() in ALLOWED_STYLE and _safe_value(val):
            keep.append(f"{prop.lower()}:{val}")
    return ";".join(keep)


def sanitize_svg(data: bytes) -> bytes:
    """Bereinigte SVG oder IconError. Entfernt alles, was nicht zum Zeichnen gehört."""
    if b"<!ENTITY" in data.upper() or re.search(rb"<!DOCTYPE[^>]*\[", data, re.I):
        raise IconError("SVG with DOCTYPE entities is not allowed")
    data = DOCTYPE.sub(b"", data)
    try:
        root = ET.fromstring(data)
    except ET.ParseError as err:
        raise IconError(f"not a valid SVG file ({err})") from err
    if _local(root.tag) != "svg" or _ns(root.tag) not in ("", SVG_NS):
        raise IconError("not an SVG file")

    removed: list[str] = []

    def walk(el: ET.Element) -> None:
        for child in list(el):
            tag = _local(child.tag) if isinstance(child.tag, str) else ""
            if not tag or tag not in ALLOWED_TAGS or _ns(child.tag) not in ("", SVG_NS):
                removed.append(tag or "?")
                el.remove(child)
                continue
            walk(child)
        _clean_attrs(el, removed)
        # Text gehört nur in <title>/<desc>; sonst Leerraum.
        if _local(el.tag) not in ("title", "desc"):
            el.text = None
        el.tail = None

    walk(root)
    if not any(_local(c.tag) not in ("title", "desc") for c in root.iter() if c is not root):
        raise IconError("SVG contains nothing to draw")
    if removed:
        _LOGGER.debug("Casora: removed from uploaded SVG: %s", sorted(set(removed)))

    for el in root.iter():
        el.tag = f"{{{SVG_NS}}}{_local(el.tag)}"
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", XLINK_NS)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8", xml_declaration=False)


def _clean_attrs(el: ET.Element, removed: list[str]) -> None:
    for key in list(el.attrib):
        name, ns = _local(key), _ns(key)
        value = el.attrib[key]
        drop = False
        if ns == XLINK_NS and name == "href":
            # xlink:href → href (gleiches Verhalten, ein Namensraum weniger).
            del el.attrib[key]
            if value.strip().startswith("#"):
                el.attrib["href"] = value.strip()
            else:
                removed.append("@xlink:href")
            continue
        if ns or name.lower().startswith("on") or name not in ALLOWED_ATTRS:
            drop = True
        elif name == "href" and not value.strip().startswith("#"):
            drop = True
        elif name == "style":
            cleaned = _clean_style(value)
            if cleaned:
                el.attrib[key] = cleaned
            else:
                drop = True
        elif not _safe_value(value):
            drop = True
        if drop:
            removed.append("@" + name)
            del el.attrib[key]


def check_png(data: bytes) -> None:
    """PNG mit Transparenz (Alphakanal oder tRNS), sonst IconError."""
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise IconError("not a PNG file")
    width, height = struct.unpack(">II", data[16:24])
    if not width or not height or max(width, height) > MAX_PNG_SIDE:
        raise IconError(f"PNG must be at most {MAX_PNG_SIDE} × {MAX_PNG_SIDE} pixels")
    color_type = data[25]
    if color_type in (4, 6):
        return
    pos = 8
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        if kind == b"tRNS":
            return
        if kind in (b"IDAT", b"IEND"):
            break
        pos += 12 + length
    raise IconError("PNG needs a transparent background")


def safe_stem(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename or ""))[0].lower()
    stem = stem.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")[:40].strip("-")
    return stem or "symbol"


def listing(path: str) -> list[dict[str, Any]]:
    if not os.path.isdir(path):
        return []
    out = []
    for entry in sorted(os.listdir(path)):
        if SAFE_FILE.match(entry) and os.path.isfile(os.path.join(path, entry)):
            out.append({"file": entry, "name": os.path.splitext(entry)[0],
                        "url": f"{PUBLIC_BASE}/{entry}"})
    return out


def store(path: str, filename: str, data: bytes) -> dict[str, Any]:
    """Prüft, bereinigt und schreibt eine Datei. Gibt den neuen Eintrag zurück."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in EXTENSIONS:
        raise IconError("file must be .svg or .png")
    if not data:
        raise IconError("no file received")
    if len(data) > MAX_BYTES:
        raise IconError(f"file larger than {MAX_BYTES // 1024} KB")
    if ext == ".svg":
        data = sanitize_svg(data)
    else:
        check_png(data)
    os.makedirs(path, exist_ok=True)
    stem = safe_stem(filename)
    taken = {os.path.splitext(e)[0] for e in os.listdir(path)}
    name, n = stem, 2
    # Nie still überschreiben: ein Symbol kann schon in einem Raum stecken.
    while name in taken:
        name = f"{stem}-{n}"
        n += 1
    target = os.path.join(path, name + ext)
    with open(target, "wb") as fh:
        fh.write(data)
    return {"file": name + ext, "name": name, "url": f"{PUBLIC_BASE}/{name + ext}"}


def remove(path: str, file: str) -> bool:
    if not SAFE_FILE.match(file or ""):
        raise IconError("unknown icon")
    full = os.path.join(path, file)
    if not os.path.isfile(full):
        return False
    os.remove(full)
    return True


async def dashboards_using(hass: HomeAssistant, url: str) -> list[str]:
    """Titel der Dashboards, deren Konfiguration diese Datei nennt."""
    data = hass.data.get("lovelace")
    dashes = getattr(data, "dashboards", None) or {}
    titles: dict[str, str] = {}
    try:
        for item in getattr(data, "dashboards_collection", None).async_items():
            titles[item.get("url_path")] = item.get("title") or item.get("url_path")
    except Exception:  # noqa: BLE001 - nur für hübschere Namen
        pass
    used = []
    for key, dash in dashes.items():
        try:
            cfg = await dash.async_load(False)
        except Exception:  # noqa: BLE001 - leeres oder YAML-Dashboard ohne Datei
            continue
        if cfg and url in json.dumps(cfg, ensure_ascii=False):
            used.append(titles.get(key) or key or "Overview")
    return used


class CasoraRoomIconsView(HomeAssistantView):
    """Eigene Raum-Symbole: GET Liste, POST Upload (Feld file), DELETE ?file=."""

    url = "/api/casora/room_icons"
    name = "api:casora:room_icons"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        icons = await hass.async_add_executor_job(listing, hass.config.path(ICONS_DIR))
        if request.query.get("used"):
            for icon in icons:
                icon["used_by"] = await dashboards_using(hass, icon["url"])
        return self.json({"icons": icons, "max_bytes": MAX_BYTES})

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)
        hass: HomeAssistant = request.app["hass"]
        try:
            reader = await request.multipart()
        except Exception:  # noqa: BLE001
            return self.json_message("expected multipart body", 400)
        filename, payload = "", b""
        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "file":
                filename = part.filename or ""
                # Nicht mehr lesen als erlaubt (+1, damit „zu groß“ erkannt wird).
                payload = bytearray()
                while len(payload) <= MAX_BYTES:
                    chunk = await part.read_chunk()
                    if not chunk:
                        break
                    payload.extend(chunk)
                payload = bytes(payload)
        path = hass.config.path(ICONS_DIR)
        try:
            icon = await hass.async_add_executor_job(store, path, filename, payload)
        except IconError as err:
            return self.json_message(str(err), 400)
        except OSError as err:
            _LOGGER.error("Casora icon upload failed: %s", err)
            return self.json_message(f"could not write file: {err}", 500)
        icons = await hass.async_add_executor_job(listing, path)
        return self.json({"icon": icon, "icons": icons})

    async def delete(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)
        hass: HomeAssistant = request.app["hass"]
        path = hass.config.path(ICONS_DIR)
        try:
            await hass.async_add_executor_job(remove, path, request.query.get("file", ""))
        except IconError as err:
            return self.json_message(str(err), 400)
        icons = await hass.async_add_executor_job(listing, path)
        return self.json({"icons": icons})
