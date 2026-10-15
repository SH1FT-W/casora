"""Raum-Symbole „benutzt von“ – ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/checkup_raum_symbole_titel_test.py

room_icons.dashboards_using nannte die Adresse statt des Titels (las dashboards_collection, das es in
LovelaceData nicht gibt). Erwartet: Titel aus der Dashboard-Konfiguration, sonst die Adresse.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import room_icons  # noqa: E402


class Dash:
    def __init__(self, config, cfg):
        self.config = config
        self._cfg = cfg

    async def async_load(self, force):
        if self._cfg is None:
            raise FileNotFoundError
        return self._cfg


ICON = "/local/casora/rooms/icons/sofa.svg"
dashes = {
    "mein-haus": Dash({"title": "Mein Haus", "url_path": "mein-haus"}, {"views": [{"icon": ICON}]}),
    "ohne-titel": Dash({"url_path": "ohne-titel"}, {"views": [{"icon": ICON}]}),
    "leer": Dash({"title": "Leer"}, None),
    "anders": Dash({"title": "Anders"}, {"views": []}),
}
hass = SimpleNamespace(data={"lovelace": SimpleNamespace(dashboards=dashes)})
used = asyncio.run(room_icons.dashboards_using(hass, [ICON]))
ok = sorted(used[ICON]) == ["Mein Haus", "ohne-titel"]
print(("ok   " if ok else "FAIL ") + "Titel statt Adresse" + ("" if ok else f"  {used}"))
sys.exit(0 if ok else 1)
