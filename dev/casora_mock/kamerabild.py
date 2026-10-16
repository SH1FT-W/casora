"""Kamerabilder der Testhaus-Kameras (Frigate „Testhof“ in frigate.py, Reolink-Testklingel in klingel.py).

Fertige, selbst gezeichnete JPGs unter bilder/<stimmung>/ (Quelle dev/kamerabilder/, neu bauen mit
node dev/kamerabilder/render.mjs), Erkennungsrahmen in bilder/rahmen.json. Stimmung nach der Sonne:
  tag        Sonne über dem Horizont → Kameralook bei Tag
  daemmerung Sonne knapp darunter (Höhe > −6°) oder bis ca. 1 h nach Untergang bzw. ab 1 h vor Aufgang → Abendlicht
  nacht      sonst → Nachtsicht (IR)
Ohne sun.sun rechnet Astral mit dem Standort von HA, zur Not gilt die Uhrzeit. Testdienst
casora_mock.kamerabild {stimmung: tag|daemmerung|nacht|auto} legt sie fest (auto = wieder nach der Sonne).
Pillow (im HA-Image) setzt nur Größe, Zeitstempel und Erkennungsrahmen; ohne Pillow kommt das JPG unverändert.
"""
from __future__ import annotations

import io
import json
import os
from datetime import datetime, timedelta

STIMMUNGEN = ("tag", "daemmerung", "nacht")
_DIR = os.path.join(os.path.dirname(__file__), "bilder")
_FEST: dict = {"stimmung": None}
_ROH: dict = {}
_CACHE: dict = {}


def _aus_hoehe(elev: float) -> str:
    # −9° ≈ eine Stunde nach Untergang bzw. vor Aufgang (Mitteleuropa)
    return "tag" if elev > -0.833 else ("daemmerung" if elev > -9 else "nacht")


def stimmung(hass, when: datetime | None = None) -> str:
    """Stimmung jetzt (sun.sun) oder zu einem früheren Zeitpunkt (Schnappschuss einer Erkennung)."""
    from homeassistant.util import dt as dt_util
    if _FEST["stimmung"] in STIMMUNGEN:
        return _FEST["stimmung"]
    now = dt_util.utcnow()
    sun = hass.states.get("sun.sun") if when is None else None
    if sun is not None:
        if sun.state == "above_horizon":
            return "tag"
        elev = sun.attributes.get("elevation")
        if isinstance(elev, (int, float)) and elev > -6:
            return "daemmerung"
        rise = dt_util.parse_datetime(str(sun.attributes.get("next_rising") or ""))
        sett = dt_util.parse_datetime(str(sun.attributes.get("next_setting") or ""))
        if rise and rise - now <= timedelta(hours=1):
            return "daemmerung"
        if sett and now - (sett - timedelta(days=1)) <= timedelta(hours=1):
            return "daemmerung"
        return "nacht"
    try:
        from astral.sun import elevation
        from homeassistant.helpers.sun import get_astral_observer
        return _aus_hoehe(elevation(get_astral_observer(hass), when or now))
    except Exception:  # noqa: BLE001
        h = dt_util.as_local(when or now).hour
        return "tag" if 7 <= h < 19 else ("daemmerung" if h in (6, 19, 20) else "nacht")


def _roh(st: str, name: str) -> bytes | None:
    key = (st, name)
    if key not in _ROH:
        try:
            with open(os.path.join(_DIR, st, name + ".jpg"), "rb") as f:
                _ROH[key] = f.read()
        except OSError:
            _ROH[key] = None
    return _ROH[key]


def _rahmen() -> dict:
    if "rahmen" not in _ROH:
        try:
            with open(os.path.join(_DIR, "rahmen.json"), encoding="utf-8") as f:
                _ROH["rahmen"] = json.load(f)
        except (OSError, ValueError):
            _ROH["rahmen"] = {}
    return _ROH["rahmen"]


def bild(st: str, szene: str, name: str, w: int, h: int, stamp: str = "", label: str | None = None,
         rahmen_von: str | None = None, seed: int = 1) -> bytes | None:
    """JPG der Szene (hof/tuer) in Größe w×h; mit label einen Erkennungsrahmen um rahmen_von (sonst label).
    Läuft im Executor. None nur, wenn das JPG fehlt (dann zeigt der Mock das Platzhalterbild)."""
    raw = _roh(st, name)
    if raw is None:
        return None
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return raw
    key = (st, name, w, h, stamp, label, rahmen_von, seed)
    if key in _CACHE:
        return _CACHE[key]
    if len(_CACHE) > 64:
        _CACHE.clear()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    sx, sy = w / im.width, h / im.height
    if (im.width, im.height) != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    bx = _rahmen().get(st, {}).get(szene, {}).get(rahmen_von or label or "")
    if label and bx:
        x0, y0, x1, y1 = bx[0] * sx, bx[1] * sy, bx[2] * sx, bx[3] * sy
        d.rectangle((x0, y0, x1, y1), outline=(255, 210, 0), width=max(2, w // 320))
        tag = f"{label} {70 + (seed * 37) % 26}%"
        d.rectangle((x0, y0 - h * .05, x0 + len(tag) * w * .012, y0), fill=(255, 210, 0))
        d.text((x0 + 4, y0 - h * .045), tag, fill=(0, 0, 0))
    if stamp:
        d.text((w * .015, h * .02), stamp, fill=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    _CACHE[key] = buf.getvalue()
    return _CACHE[key]


def setup(hass, mock) -> None:
    import voluptuous as vol

    async def festlegen(call) -> None:
        st = call.data.get("stimmung", "auto")
        _FEST["stimmung"] = st if st in STIMMUNGEN else None
        # Live-Bilder sofort neu holen lassen (Kachel lädt bei geändertem Zustand/Zugriffstoken nach).
        _CACHE.clear()

    hass.services.async_register("casora_mock", "kamerabild", festlegen,
                                 schema=vol.Schema({vol.Optional("stimmung", default="auto"): vol.In([*STIMMUNGEN, "auto"])}))
