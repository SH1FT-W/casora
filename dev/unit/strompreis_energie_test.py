"""Strompreis für Geräte-Popups: Casora-Option, sonst Netzbezug aus HAs Energie-Dashboard.

  uv run --python 3.14 --with homeassistant python dev/unit/strompreis_energie_test.py

Ohne laufendes HA: hass, Config-Eintrag und Energie-Manager sind Attrappen. Prüft die
Reihenfolge (Option vor Energie, sonst nichts), das Format ab HA 2026.x (Preis direkt an der
Netzquelle) und das ältere (flow_from je Tarif), den ersten Tarif bei mehreren, eine
Preis-Entität (Zustand, €/MWh umgerechnet, ID für das Frontend) und casora/settings/get.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import homeassistant.components.energy.data as energy_data  # noqa: E402

from custom_components.casora import settings  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


class States:
    def __init__(self, items):
        self.items = items

    def get(self, eid):
        return self.items.get(eid)


def st(state, unit=None):
    return SimpleNamespace(state=state, attributes={"unit_of_measurement": unit} if unit else {})


def make_hass(options, prefs, states=None):
    entry = SimpleNamespace(options=options)
    return SimpleNamespace(
        data={},
        states=States(states or {}),
        config_entries=SimpleNamespace(async_entries=lambda d: [entry]),
    ), prefs


PREFS = {"current": None}


async def fake_manager(hass):
    if PREFS["current"] is Exception:
        raise RuntimeError("energy kaputt")
    return SimpleNamespace(data=PREFS["current"])


energy_data.async_get_manager = fake_manager


def info(options, prefs, states=None):
    hass, PREFS["current"] = make_hass(options, prefs, states)
    return asyncio.run(settings.price_info(hass))


NEW = {"energy_sources": [
    {"type": "solar", "stat_energy_from": "sensor.pv"},
    {"type": "grid", "stat_energy_from": "sensor.netz", "entity_energy_price": None, "number_energy_price": 0.36},
    {"type": "grid", "stat_energy_from": "sensor.netz2", "entity_energy_price": None, "number_energy_price": 0.5},
]}
OLD = {"energy_sources": [{"type": "grid", "flow_from": [
    {"stat_energy_from": "sensor.ht", "entity_energy_price": None, "number_energy_price": None},
    {"stat_energy_from": "sensor.nt", "entity_energy_price": None, "number_energy_price": 0.28},
    {"stat_energy_from": "sensor.x", "entity_energy_price": None, "number_energy_price": 0.4},
], "flow_to": []}]}
ENT = {"energy_sources": [{"type": "grid", "stat_energy_from": "sensor.netz",
                           "entity_energy_price": "sensor.boersenpreis", "number_energy_price": None}]}

# 1) Option geht vor
r = info({"price_kwh": 0.31}, NEW)
check("Option vor Energie", r["price_kwh"] == 0.31 and r["price_source"] == "option" and r["price_entity"] is None)
check("Energie-Preis trotzdem als Hinweis", r["energy_price_kwh"] == 0.36)

# 2) Format ab 2026.x: erste Netzquelle mit Preis
r = info({}, NEW)
check("Neues Format: fester Preis der ersten Netzquelle", r["price_kwh"] == 0.36 and r["price_source"] == "energy")

# 3) Altes Format: erster Tarif mit Preis
r = info({}, OLD)
check("Altes Format flow_from: erster Tarif mit Preis", r["price_kwh"] == 0.28 and r["price_source"] == "energy")

# 4) Preis-Entität: Zustand, ID fürs Frontend; €/MWh umgerechnet
r = info({}, ENT, {"sensor.boersenpreis": st("0.2412", "€/kWh")})
check("Preis-Entität: Zustand", r["price_kwh"] == 0.2412 and r["price_entity"] == "sensor.boersenpreis"
      and r["price_source"] == "energy" and r["energy_price_entity"] == "sensor.boersenpreis")
r = info({}, ENT, {"sensor.boersenpreis": st("241.2", "EUR/MWh")})
check("Preis-Entität in €/MWh umgerechnet", abs(r["price_kwh"] - 0.2412) < 1e-9)
r = info({}, ENT, {"sensor.boersenpreis": st("unavailable")})
check("Preis-Entität ohne Zustand: Quelle bleibt, Wert None",
      r["price_kwh"] is None and r["price_entity"] == "sensor.boersenpreis" and r["price_source"] == "energy")

# 5) Nichts eingerichtet / kaputt / Unsinn
check("Ohne Energie-Preis: nichts", info({}, {"energy_sources": [{"type": "grid", "stat_energy_from": "sensor.n"}]})
      == {"energy_price_kwh": None, "energy_price_entity": None, "price_kwh": None, "price_source": None, "price_entity": None})
check("Energie leer", info({}, None)["price_source"] is None)
check("Energie-Manager wirft: nichts", info({}, Exception)["price_source"] is None)
check("Option als Text zählt nicht", info({"price_kwh": "0.3"}, None)["price_source"] is None)
check("Option True zählt nicht", info({"price_kwh": True}, NEW)["price_source"] == "energy")
check("grid_price ignoriert Müll", settings.grid_price({"energy_sources": [None, "x", {"type": "grid", "flow_from": ["y"]}]}) == (None, None))


# 6) casora/settings/get liefert die Felder mit
class Conn:
    def __init__(self):
        self.results = []

    def send_result(self, mid, result):
        self.results.append(result)


async def no_settings(hass):
    return None

settings.async_load_settings = no_settings
hass, PREFS["current"] = make_hass({}, NEW)
conn = Conn()
handler = getattr(settings.ws_get, "__wrapped__", settings.ws_get)
asyncio.run(handler(hass, conn, {"id": 1, "type": "casora/settings/get"}))
got = conn.results[-1] if conn.results else None
check("settings/get: price_kwh und price_source", bool(got) and got["price_kwh"] == 0.36 and got["price_source"] == "energy"
      and got["stored"] is False and got["settings"] == {})

print("strompreis_energie: " + ("ok" if not fails else f"{len(fails)} Fehler"))
sys.exit(1 if fails else 0)
