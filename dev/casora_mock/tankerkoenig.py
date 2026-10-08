"""Fake-Tankerkönig für das Testhaus (Tanken im Auto-Popup, Casora 1.2).

Beantwortet /api/casora_mock/tankerkoenig/list.php wie list.php (type=all) mit erfundenen Stationen
rund um den angefragten Standort. Casora fragt im Testhaus nur hier (hass.data["casora_tanken_api"]),
nie bei Tankerkönig. Schlüssel: jede UUID gilt, außer 00000000-0000-0000-0000-000000000000
(„falscher Schlüssel“ zum Testen der Fehlermeldung).
"""

from __future__ import annotations

import math
import re

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

PATH = "/api/casora_mock/tankerkoenig/list.php"
BAD_KEY = "00000000-0000-0000-0000-000000000000"
KEY_RE = re.compile(r"^[0-9a-fA-F-]{36}$")

# Erfunden: Name, Marke, Lage (km Ost, km Nord), Grundpreis E10, offen
STATIONS = [
    ("Freie Tankstelle Mühlweg", "Freie", 1.9, 2.0, 1.689, True),
    ("Autohof Nord", "JET", 2.4, 3.9, 1.699, True),
    ("Tankpunkt Südring", "Tankpunkt", -0.4, -1.1, 1.719, True),
    ("Stadttankstelle Gartenstraße", "ARAL", -0.7, 0.5, 1.739, True),
    ("Tankhof Lindenallee", "Tankhof", -3.0, -1.6, 1.749, False),
    ("Bahnhof-Tankstelle", "Bahnhof", 1.2, -1.7, 1.769, True),
    # Marken mit Zusätzen wie bei Tankerkönig (Logo-Abgleich, 1.2)
    ("Pludra Musterstadt", "Pludra Musterstadt", 0.8, 1.4, 1.709, True),
    ("Q1 Am Kanal", "Q1", -1.6, 2.2, 1.729, True),
    ("Schonhoff Mineralöle Süd", "Schonhoff Mineralöle", 0.3, -2.6, 1.759, True),
    ("Wiro Tankcenter", "Wiro", 2.9, -0.8, 1.779, False),
    ("Shell Ringstraße", "Shell", -2.2, 0.9, 1.789, True),
]


def answer(lat: float, lng: float, rad: float, hour: int) -> dict:
    # Tagesverlauf wie üblich: morgens teuer, abends günstiger.
    shift = 0.06 if 6 <= hour < 10 else 0.03 if 10 <= hour < 17 else -0.02 if 18 <= hour < 23 else 0.01
    out = []
    for i, (name, brand, x, y, e10, is_open) in enumerate(STATIONS):
        d = math.hypot(x, y)
        if d > rad:
            continue
        p = round(e10 + shift, 3)
        out.append({"id": f"mock-{i}", "name": name, "brand": brand, "street": "Teststraße", "houseNumber": str(i + 1),
                    "postCode": 12345, "place": "Testort", "dist": round(d, 1),
                    "lat": round(lat + y / 110.57, 6), "lng": round(lng + x / (111.32 * math.cos(math.radians(lat))), 6),
                    "e5": round(p + 0.06, 3), "e10": p, "diesel": round(p - 0.07, 3), "isOpen": is_open})
    return {"ok": True, "license": "CC BY 4.0 -  https://creativecommons.tankerkoenig.de", "data": "MTS-K",
            "status": "ok", "stations": out}


class FakeTankerkoenigView(HomeAssistantView):
    url = PATH
    name = "api:casora_mock:tankerkoenig"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        q = request.query
        key = q.get("apikey", "")
        if not KEY_RE.match(key) or key == BAD_KEY:
            return self.json({"ok": False, "status": "error",
                              "message": "apikey nicht angegeben, falsch, oder im falschen Format"})
        try:
            lat, lng, rad = float(q["lat"]), float(q["lng"]), float(q.get("rad", 5))
        except (KeyError, ValueError):
            return self.json({"ok": False, "status": "error", "message": "parameter error"})
        if rad > 25:
            return self.json({"ok": False, "status": "error", "message": "rad too big"})
        return self.json(answer(lat, lng, rad, dt_util.now().hour))


def setup(hass: HomeAssistant) -> None:
    hass.http.register_view(FakeTankerkoenigView())
    hass.data["casora_tanken_api"] = f"http://127.0.0.1:{hass.http.server_port or 8123}{PATH}"
