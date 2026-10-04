"""Eigene Schriften für Casora: hochladen, auflisten, CSS dazu erzeugen.

Gekaufte Schriften (z. B. Gilroy) darf Casora nicht mitliefern. Wer eine Lizenz
hat, lädt die Dateien im Studio hoch; sie landen in config/www/casora/fonts/,
und Casora schreibt dort casora-fonts.css mit einem @font-face je Datei.
Schnitt und Kursiv liest es aus dem Dateinamen (Gilroy-SemiBoldItalic.woff2).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

FONTS_DIR = "www/casora/fonts"
PUBLIC_BASE = "/local/casora/fonts"
CSS_NAME = "casora-fonts.css"
INDEX_NAME = "casora-fonts.json"
EXTENSIONS = {".woff2": "woff2", ".woff": "woff", ".ttf": "truetype", ".otf": "opentype"}
MAX_BYTES = 5 * 1024 * 1024
MAX_FILES = 24

# Längste zuerst: „ExtraBold“ darf nicht als „Bold“ erkannt werden.
WEIGHTS = (
    ("extralight", 200), ("ultralight", 200), ("semibold", 600), ("demibold", 600),
    ("extrabold", 800), ("ultrabold", 800), ("hairline", 100), ("regular", 400),
    ("medium", 500), ("normal", 400), ("light", 300), ("black", 900), ("heavy", 900),
    ("thin", 100), ("book", 400), ("bold", 700),
)
SAFE_FAMILY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,47}$")


def weight_of(filename: str) -> tuple[int, bool]:
    """Schnitt (100–900) und Kursiv aus dem Dateinamen."""
    stem = os.path.splitext(os.path.basename(filename))[0].lower().replace(" ", "").replace("_", "").replace("-", "")
    italic = "italic" in stem or "oblique" in stem
    for word, weight in WEIGHTS:
        if word in stem:
            return weight, italic
    return 400, italic


def _safe_file(filename: str) -> str:
    stem, ext = os.path.splitext(os.path.basename(filename))
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-")[:64] or "font"
    return stem + ext.lower()


def _dir(hass: HomeAssistant) -> str:
    return hass.config.path(FONTS_DIR)


def _read_index(path: str) -> dict[str, list[str]]:
    try:
        with open(os.path.join(path, INDEX_NAME), encoding="utf-8") as fh:
            data = json.load(fh)
        return {str(k): [str(x) for x in v] for k, v in data.items() if isinstance(v, list)}
    except (OSError, ValueError):
        return {}


def _write_css(path: str, index: dict[str, list[str]]) -> None:
    blocks = []
    for family, files in sorted(index.items()):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext not in EXTENSIONS or not os.path.isfile(os.path.join(path, name)):
                continue
            weight, italic = weight_of(name)
            blocks.append(
                "@font-face {\n"
                f"  font-family: '{family}';\n"
                f"  src: url('{PUBLIC_BASE}/{name}') format('{EXTENSIONS[ext]}');\n"
                f"  font-weight: {weight};\n"
                f"  font-style: {'italic' if italic else 'normal'};\n"
                "  font-display: swap;\n"
                "}\n"
            )
    head = "/* Erzeugt von Casora (Studio → Eigene Schrift) – wird bei jedem Upload neu geschrieben. */\n"
    with open(os.path.join(path, CSS_NAME), "w", encoding="utf-8") as fh:
        fh.write(head + "\n".join(blocks))
    with open(os.path.join(path, INDEX_NAME), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)


def _listing(path: str) -> list[dict[str, Any]]:
    index = _read_index(path)
    out = []
    for family, files in sorted(index.items()):
        present = [f for f in files if os.path.isfile(os.path.join(path, f))]
        if present:
            out.append({"family": family, "files": present,
                        "weights": sorted({weight_of(f)[0] for f in present})})
    return out


class CasoraFontsView(HomeAssistantView):
    """Eigene Schriften auflisten (GET), hochladen (POST), entfernen (DELETE ?family=)."""

    url = "/api/casora/fonts"
    name = "api:casora:fonts"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        fonts = await hass.async_add_executor_job(_listing, _dir(hass))
        return self.json({"fonts": fonts, "css": f"{PUBLIC_BASE}/{CSS_NAME}"})

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)
        hass: HomeAssistant = request.app["hass"]
        try:
            reader = await request.multipart()
        except Exception:  # noqa: BLE001
            return self.json_message("expected multipart body", 400)

        family = ""
        files: list[tuple[str, bytes]] = []
        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "family":
                family = (await part.text()).strip()
            elif part.name == "file":
                name = part.filename or ""
                data = await part.read(decode=False)
                if os.path.splitext(name)[1].lower() not in EXTENSIONS:
                    return self.json_message(f"{name}: only .woff2, .woff, .ttf or .otf", 400)
                if len(data) > MAX_BYTES:
                    return self.json_message(f"{name}: larger than {MAX_BYTES // (1024 * 1024)} MB", 400)
                files.append((_safe_file(name), data))

        if not files:
            return self.json_message("no file received", 400)
        if len(files) > MAX_FILES:
            return self.json_message(f"at most {MAX_FILES} files at once", 400)
        if not family:
            # „Gilroy-Bold.woff2“ → „Gilroy“
            family = re.split(r"[-_ ]", os.path.splitext(files[0][0])[0])[0]
        if not SAFE_FAMILY.match(family):
            return self.json_message("font name: letters, digits, spaces, - and _ only", 400)

        path = _dir(hass)

        def _write() -> list[dict[str, Any]]:
            os.makedirs(path, exist_ok=True)
            index = _read_index(path)
            have = index.setdefault(family, [])
            for name, data in files:
                with open(os.path.join(path, name), "wb") as fh:
                    fh.write(data)
                if name not in have:
                    have.append(name)
            _write_css(path, index)
            return _listing(path)

        try:
            fonts = await hass.async_add_executor_job(_write)
        except OSError as err:
            _LOGGER.error("Casora font upload failed: %s", err)
            return self.json_message(f"could not write file: {err}", 500)
        return self.json({"family": family, "fonts": fonts, "css": f"{PUBLIC_BASE}/{CSS_NAME}"})

    async def delete(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("admin required", web.HTTPUnauthorized.status_code)
        hass: HomeAssistant = request.app["hass"]
        family = request.query.get("family", "")
        path = _dir(hass)

        def _remove() -> list[dict[str, Any]]:
            index = _read_index(path)
            for name in index.pop(family, []):
                try:
                    os.remove(os.path.join(path, name))
                except OSError:
                    pass
            if os.path.isdir(path):
                _write_css(path, index)
            return _listing(path)

        fonts = await hass.async_add_executor_job(_remove)
        return self.json({"fonts": fonts})
