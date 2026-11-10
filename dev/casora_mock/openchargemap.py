"""Fake Open Charge Map for the test house (chargers near the car, issue 168).

Answers /api/casora_mock/openchargemap/poi like /v3/poi (compact=false, verbose=false) with invented chargers around
the asked place. In the test house Casora asks only here (hass.data["casora_charging_api"]), never Open Charge Map.
Key (header X-API-Key): any UUID counts, except 00000000-0000-0000-0000-000000000000 ("wrong key").
"""

from __future__ import annotations

import math
import re

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

PATH = "/api/casora_mock/openchargemap/poi"
BAD_KEY = "00000000-0000-0000-0000-000000000000"
KEY_RE = re.compile(r"^[0-9a-fA-F-]{36}$")

# Invented: name, operator, place (km east, km north), plugs [(kW, current type id or None, quantity)], usage cost,
# number of points, status type id. Imported entries come without operator, cost and number of points.
CHARGERS = [
    ("Rathausplatz", "Stadtwerke Musterstadt", 0.3, 0.2, [(22, 20, 2)], None, 2, 50),
    ("Möbelhaus Nordpark", None, -0.9, 0.7, [(22, 20, 4)], "Free", 4, 50),
    ("Parkhaus Am Markt", "Stadtwerke Musterstadt", 0.6, -0.9, [(11, 20, 6)], "0,45 €/kWh", 6, 50),
    ("Schnellladepark Autohof Nord", "Testladenetz", 2.4, 3.9, [(300, 30, 8), (22, 20, 2)], "0,59 €/kWh", 10, 50),
    ("Supermarkt Lindenallee", None, -1.6, -1.2, [(50, 30, 1), (22, 20, 2)], "kostenlos", 3, 50),
    ("Bahnhof Ostseite", "Testladenetz", 1.9, -0.4, [(150, 30, 2)], None, 2, 50),
    ("Teststraße 14", None, -0.2, 1.8, [(22, None, None), (22, None, None)], None, None, 50),
    ("Hotel Zur Post", "(Business Owner at Location)", 3.1, -2.2, [(11, 20, 1)], "0", 1, 50),
    ("Gewerbepark Süd", "Testladenetz", -2.8, -3.4, [(75, 30, 2)], "0,55 €/kWh", 2, 50),
    ("Alte Molkerei", None, 0.9, 2.6, [(3.7, 10, 1)], None, 1, 50),
    ("Tankstelle am Ring (stillgelegt)", "Testladenetz", 0.4, 0.5, [(50, 30, 1)], None, 1, 200),
    ("Firmenhof Mustermann", None, 0.1, -0.3, [(22, 20, 2)], None, 2, 50),
]
PRIVATE = {"Firmenhof Mustermann"}


def answer(lat: float, lng: float, rad: float, limit: int) -> list:
    out = []
    for i, (name, op, x, y, plugs, cost, points, status) in enumerate(CHARGERS):
        d = math.hypot(x, y)
        if d > rad:
            continue
        p = {
            "ID": 900000 + i, "UUID": f"00000000-0000-4000-8000-{i:012d}", "StatusTypeID": status,
            "DataProviderID": 1, "DataQualityLevel": 1,
            "AddressInfo": {"ID": 800000 + i, "Title": name, "AddressLine1": f"Teststraße {i + 1}", "Town": "Musterstadt",
                            "Postcode": "12345", "CountryID": 87,
                            "Latitude": round(lat + y / 110.57, 6),
                            "Longitude": round(lng + x / (111.32 * math.cos(math.radians(lat))), 6),
                            "Distance": round(d, 3), "DistanceUnit": 2},
            "Connections": [],
        }
        for n, (kw, cur, qty) in enumerate(plugs):
            c = {"ID": 700000 + i * 10 + n, "ConnectionTypeID": 33 if cur == 30 else 25, "StatusTypeID": status,
                 "LevelID": 3 if kw >= 40 else 2, "PowerKW": kw}
            if cur is not None:
                c["CurrentTypeID"] = cur
            if qty is not None:
                c["Quantity"] = qty
            p["Connections"].append(c)
        if op:
            p["OperatorID"] = 45 if op.startswith("(") else 3000 + i
            p["OperatorInfo"] = {"ID": p["OperatorID"], "Title": op}
            if not op.startswith("("):
                p["OperatorInfo"]["WebsiteURL"] = "https://www." + re.sub(r"[^a-z]", "", op.lower()) + ".example/"
        if cost is not None:
            p["UsageCost"] = cost
        if points is not None:
            p["NumberOfPoints"] = points
        p["UsageTypeID"] = 2 if name in PRIVATE else 1
        out.append((d, p))
    out.sort(key=lambda t: t[0])
    return [p for _d, p in out[:limit]]


class FakeOpenChargeMapView(HomeAssistantView):
    url = PATH
    name = "api:casora_mock:openchargemap"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        key = request.headers.get("X-API-Key", "")
        if not key:
            return web.Response(status=403, text="You must specify an API key using the key query parameter or x-api-key header.")
        if not KEY_RE.match(key) or key == BAD_KEY:
            return web.Response(status=403, text="Invalid API key.")
        q = request.query
        try:
            lat, lng = float(q["latitude"]), float(q["longitude"])
            rad, limit = float(q.get("distance", 10)), int(q.get("maxresults", 100))
        except (KeyError, ValueError):
            return web.Response(status=400, text="parameter error")
        return self.json(answer(lat, lng, rad, limit))


def setup(hass: HomeAssistant) -> None:
    hass.http.register_view(FakeOpenChargeMapView())
    hass.data["casora_charging_api"] = f"http://127.0.0.1:{hass.http.server_port or 8123}{PATH}"
