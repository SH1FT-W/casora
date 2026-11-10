"""Issue 168: chargers near the car (charging.py). The answer of Open Charge Map's /v3/poi becomes the list for
the car popup: only chargers in use that anyone may drive to, nearest first, with AC / DC / HPC and "free".

  uv run --python 3.14 --with homeassistant python dev/unit/charging_parse_test.py

The entries are invented, in the layout of a real answer (compact=false, verbose=false): imported entries have
no operator, no usage type and no cost, and some plugs have no current type.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import charging  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


LAT, LNG = 50.0, 8.0


def poi(title, dlat, conns, **kw):
    p = {"ID": abs(hash(title)) % 100000, "StatusTypeID": 50,
         "AddressInfo": {"Title": title, "AddressLine1": "Teststraße 1", "Town": "Musterstadt",
                         "Latitude": LAT + dlat, "Longitude": LNG},
         "Connections": conns}
    p.update(kw)
    return p


def conn(kw, cur=None, qty=None, status=50):
    c = {"ConnectionTypeID": 25, "StatusTypeID": status, "PowerKW": kw}
    if cur is not None:
        c["CurrentTypeID"] = cur
    if qty is not None:
        c["Quantity"] = qty
    return c


DATA = [
    poi("Autohof Schnelllader", 0.05, [conn(300, 30, 4), conn(22, 20, 2)], NumberOfPoints=6,
        OperatorInfo={"ID": 1, "Title": "Testladenetz"}, UsageTypeID=4, UsageCost="0,59 €/kWh"),
    poi("Rathaus", 0.01, [conn(11, 20), conn(11, 20)], OperatorInfo={"ID": 45, "Title": "(Business Owner at Location)"},
        UsageTypeID=1, UsageCost="Free"),
    poi("Möbelhaus", 0.02, [conn(50)], UsageCost="0"),                      # no current type: 50 kW is DC
    poi("Importiert ohne Angaben", 0.03, [conn(22), conn(None)]),             # as imported from a register
    poi("Stillgelegt", 0.005, [conn(22, 20)], StatusTypeID=200),
    poi("Geplant", 0.006, [conn(150, 30)], StatusTypeID=150),
    poi("Firmenhof", 0.004, [conn(22, 20)], UsageTypeID=2),                  # private, restricted access
    poi("Nur defekte Stecker", 0.007, [conn(22, 20, status=100)]),
    poi("Zu weit", 0.5, [conn(22, 20)]),
    {"ID": 9, "StatusTypeID": 50, "AddressInfo": {"Title": "Ohne Lage"}, "Connections": [conn(22, 20)]},
    "kaputt",
]

out = charging.parse_pois(DATA, LAT, LNG, 10.0)
names = [s["n"] for s in out]
check("only chargers in use, public, in the radius, with a place: " + str(names),
      names == ["Rathaus", "Möbelhaus", "Importiert ohne Angaben", "Autohof Schnelllader"])
by = {s["n"]: s for s in out}
check("nearest first with the distance in km", [s["d"] for s in out] == sorted(s["d"] for s in out) and by["Rathaus"]["d"] == 1.1)
hpc = by["Autohof Schnelllader"]
check("HPC: DC from 150 kW, AC plug next to it counted too",
      (hpc["hpc"], hpc["dc"], hpc["ac"], hpc["kw"], hpc["points"]) == (True, True, True, 300.0, 6))
check("operator named, not free at a price", hpc["op"] == "Testladenetz" and hpc["free"] is False)
r = by["Rathaus"]
check("AC only, free by its cost text, placeholder operator dropped",
      (r["ac"], r["dc"], r["hpc"], r["free"], r["op"], r["kw"]) == (True, False, False, True, "", 11.0))
m = by["Möbelhaus"]
check("no current type: 50 kW counts as DC, not HPC; cost 0 is free", (m["dc"], m["ac"], m["hpc"], m["free"]) == (True, False, False, True))
i = by["Importiert ohne Angaben"]
check("imported entry: AC by its power, plugs unknown, not free",
      (i["ac"], i["dc"], i["points"], i["free"], i["kw"]) == (True, False, None, False, 22.0))
check("place rounded to 4 places, address line", r["lat"] == 50.01 and r["a"] == "Teststraße 1, Musterstadt")

check("free: words and zero amounts", all(charging.is_free(x) for x in ("Free", "kostenlos", "0", "0,00 €", "0.00 EUR/kWh", "Gratis für Kunden")))
check("not free: prices, empty, negations", not any(charging.is_free(x) for x in ("0,49 €/kWh", "", None, "nicht kostenlos", "10", "not free")))
check("radius clamped", (charging.clamp_radius(0), charging.clamp_radius(999), charging.clamp_radius("x")) == (1.0, 50.0, 10.0))
try:
    charging.parse_pois({"error": "x"}, LAT, LNG)
    check("an answer that is no list is an error", False)
except charging.ChargingError as err:
    check("an answer that is no list is an error", err.code == "bad_answer")

print()
print("FAILED: %d" % len(fails) if fails else "all ok")
sys.exit(1 if fails else 0)
