"""Eigene Schriften (fonts.py) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/schriften_test.py

B-PY-12: gleiche Dateinamen in zwei Familien überschreiben sich nicht, Entfernen einer Familie
lässt die Datei der anderen stehen.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import fonts  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


class Part:
    def __init__(self, name, value=b"", filename=None):
        self.name, self.filename, self.value = name, filename, value

    async def text(self):
        return self.value.decode()

    async def read(self, decode=False):
        return self.value


class Reader:
    def __init__(self, parts):
        self.parts = list(parts)

    async def next(self):
        return self.parts.pop(0) if self.parts else None


class Req(dict):
    def __init__(self, hass, parts=(), query=None):
        super().__init__(hass_user=SimpleNamespace(is_admin=True))
        self.app = {"hass": hass}
        self._parts = parts
        self.query = query or {}

    async def multipart(self):
        return Reader(self._parts)


class Hass:
    def __init__(self, cfg):
        self.config = SimpleNamespace(path=lambda *p: os.path.join(cfg, *p))

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


async def main():
    hass = Hass(tempfile.mkdtemp())
    view = fonts.CasoraFontsView()
    path = fonts._dir(hass)
    await view.post(Req(hass, [Part("family", b"Marke"), Part("file", b"MARKE", "Regular.woff2")]))
    await view.post(Req(hass, [Part("family", b"Titel"), Part("file", b"TITEL", "Regular.woff2")]))
    with open(os.path.join(path, "Regular.woff2"), "rb") as fh:
        check("B-PY-12: Datei von „Marke“ nicht überschrieben", fh.read() == b"MARKE")
    with open(os.path.join(path, fonts.INDEX_NAME)) as fh:
        idx = json.load(fh)
    other = [n for n in idx.get("Titel", [])]
    check("B-PY-12: „Titel“ bekommt eigenen Dateinamen", other == ["Titel__Regular.woff2"], repr(idx))
    css = open(os.path.join(path, fonts.CSS_NAME)).read()
    check("B-PY-12: CSS nennt beide Dateien, Schnitt 400", "Titel__Regular.woff2" in css and "/Regular.woff2" in css
          and css.count("font-weight: 400") == 2, css)
    await view.delete(Req(hass, query={"family": "Titel"}))
    check("B-PY-12: Entfernen von „Titel“ lässt „Marke“ stehen", os.path.isfile(os.path.join(path, "Regular.woff2")))
    # Gleiche Datei in einer Familie erneut hochladen: weiter ohne Präfix (ersetzt sich selbst).
    await view.post(Req(hass, [Part("family", b"Marke"), Part("file", b"MARKE2", "Regular.woff2")]))
    with open(os.path.join(path, fonts.INDEX_NAME)) as fh:
        check("B-PY-12: eigene Familie ersetzt ihre Datei", json.load(fh) == {"Marke": ["Regular.woff2"]})


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
