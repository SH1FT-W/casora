"""Tanken (1.2): Tankstellen in der Nähe für das Auto-Popup, Daten von Tankerkönig (CC BY 4.0).

Zwei Wege:
  • Variante 1 – die Home-Assistant-Integration „tankerkoenig“ ist eingerichtet: Casora liest deren
    Preis-Sensoren (Plattform tankerkoenig, Attribut fuel_type) und fragt selbst nichts ab.
  • Variante 2 – eigener Schlüssel (Studio › Einstellungen › Tanken): Casora holt list.php selbst,
    Umkreis höchstens 25 km, höchstens eine Abfrage je 5 Minuten (auch über Neustarts), je Standort
    etwa alle 10 Minuten mit Zufallsversatz. Der Schlüssel liegt nur in .storage/casora.tanken, geht
    nie an den Browser und steht nie im Log.

Je Auto (Gerät mit Tankfüllstand) ein Kraftstoff; je Auto/Kraftstoff ein Sensor „günstigster Preis“
(sensor.casora_tanken_<auto>_<kraftstoff>, Verlauf im Recorder). Die Tageskurve kommt aus eigenen
Messwerten (stündliche Mittel der letzten 14 Tage, .storage/casora.tanken_verlauf); bis genug
Tage gesammelt sind (MIN_DAYS), meldet der Sensor learn_days_left > 0 – das Popup zeigt dann einen
Hinweis statt einer Empfehlung. Umkreis: Standort des Autos, wenn bekannt und unterwegs, sonst Zuhause.

WebSocket (nur Admins):
  casora/tanken/get  → {source, key_set, radius, cars:[…], integration:{stations}, status:{…}}
  casora/tanken/set  ← {key?: str ("" = entfernen), radius?: km, cars?: {device_id: e5|e10|diesel|off}}
  casora/tanken/test ← {key?: str} → {ok, count, cheapest, message}
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import re
import time
from datetime import datetime, timedelta
from typing import Any, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import CoreState, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

API_URL = "https://creativecommons.tankerkoenig.de/json/list.php"
# Testhaus (dev/casora_mock): Adresse einer Fake-API statt Tankerkönig – nie im echten Betrieb gesetzt.
DATA_API_OVERRIDE = "casora_tanken_api"
STORE_KEY = f"{DOMAIN}.tanken"
HIST_KEY = f"{DOMAIN}.tanken_verlauf"
FUELS = ("e5", "e10", "diesel")
FUEL_LABEL = {"e5": "Super E5", "e10": "Super E10", "diesel": "Diesel"}
RADIUS_DEFAULT = 5.0
RADIUS_MAX = 25.0                 # Tankerkönig: höchstens 25 km
MIN_INTERVAL = 300                # Tankerkönig (Smart Home): höchstens 1 Abfrage je 5 Minuten
TARGET_INTERVAL = 600             # je Standort etwa alle 10 Minuten
JITTER = 120                      # Zufallsversatz je Standort (s)
TICK = 60
TEST_GAP = 30                     # Test-Abruf mit neuem Schlüssel höchstens alle 30 Sekunden
HIST_DAYS = 14
MIN_DAYS = 7                      # ab so vielen Tagen mit Messwerten gibt es eine Empfehlung
AWAY_KM = 1.5                     # Auto weiter weg als das = unterwegs
SLOT_STALE = 3600                 # Standort ohne Auto seit 1 h: vergessen
KEY_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

# Auto = Gerät mit Tankfüllstand (wie window._casoraCar, Rolle „tankfullstand“); Diesel, wenn es
# eine AdBlue-/SCR-Reichweite hat.
FUEL_KEYS = {"fuel_level_current_level", "fuel_level", "remaining_fuel_percent", "fuel_percentage"}
FUEL_ENDS = ("tankfullstand", "fuel_level_current_level", "fuel_level", "remaining_fuel_percent",
             "fuel_percentage", "fuel_level_percentage", "tank_level")
DIESEL_KEYS = {"scr_range", "adblue_range"}
DIESEL_ENDS = ("scr_reichweite", "scr_range", "adblue_range", "adblue_reichweite")
HELPER_PLATFORMS = {"utility_meter", "statistics", "derivative", "integration", "template", "filter",
                    "min_max", "threshold", "trend", "history_stats"}


class TankenError(Exception):
    """Abruf fehlgeschlagen; code für das Studio, message ohne Schlüssel."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code


# ── Hilfen ohne HA ──────────────────────────────────────────────────────────

def valid_key(key: Any) -> bool:
    return isinstance(key, str) and bool(KEY_RE.match(key.strip()))


def clamp_radius(value: Any) -> float:
    try:
        r = float(value)
    except (TypeError, ValueError):
        return RADIUS_DEFAULT
    if r != r:
        return RADIUS_DEFAULT
    return round(max(1.0, min(RADIUS_MAX, r)), 1)


def km_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def offset_km(lat0: float, lng0: float, lat: float, lng: float) -> tuple[float, float]:
    """Lage relativ zum Standort in km (Osten, Norden) – für die Punktkarte ohne Kartendienst."""
    x = (lng - lng0) * 111.32 * math.cos(math.radians(lat0))
    y = (lat - lat0) * 110.57
    return round(x, 2), round(y, 2)


def scrub(text: Any, key: str | None) -> str:
    s = str(text or "")
    if key:
        s = s.replace(key, "***")
    # Sicherheitshalber jede UUID-artige Zeichenkette (Schlüssel) unkenntlich machen.
    return re.sub(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", "***", s)


def add_sample(hist: dict[str, list[float]], when: datetime, price: float) -> None:
    """Messwert in den Stundenbehälter (Ortszeit) legen: {"2026-10-08T14": [summe, anzahl]}."""
    k = dt_util.as_local(when).strftime("%Y-%m-%dT%H")
    b = hist.setdefault(k, [0.0, 0])
    b[0] = round(b[0] + float(price), 4)
    b[1] = int(b[1]) + 1


def prune_hist(hist: dict[str, list[float]], now: datetime) -> None:
    cut = (dt_util.as_local(now) - timedelta(days=HIST_DAYS + 1)).strftime("%Y-%m-%dT%H")
    for k in [k for k in hist if k < cut]:
        hist.pop(k, None)


def typical_day(hist: dict[str, list[float]], now: datetime) -> dict[str, Any]:
    """Stündliche Mittel der letzten 14 Tage, Tief/Hoch, Tage mit Messwerten, Resttage der Lernphase."""
    cut = (dt_util.as_local(now) - timedelta(days=HIST_DAYS)).strftime("%Y-%m-%dT%H")
    per_hour: list[list[float]] = [[] for _ in range(24)]
    days: set[str] = set()
    for k, (s, n) in hist.items():
        if k < cut or not n:
            continue
        per_hour[int(k[11:13])].append(s / n)
        days.add(k[:10])
    typ = [round(sum(v) / len(v), 3) if v else None for v in per_hour]
    vals = [v for v in typ if v is not None]
    return {
        "typical": typ,
        "low": min(vals) if vals else None,
        "high": max(vals) if vals else None,
        "days": len(days),
        "learn_days_left": max(0, MIN_DAYS - len(days)),
    }


def parse_list(data: Any) -> list[dict[str, Any]]:
    """Antwort von list.php (type=all) → Stationen mit Preisen je Kraftstoff."""
    if not isinstance(data, dict):
        raise TankenError("bad_answer", "Unerwartete Antwort")
    if not data.get("ok"):
        raise TankenError("api", str(data.get("message") or "Tankerkönig meldet einen Fehler"))
    out = []
    for s in data.get("stations") or []:
        if not isinstance(s, dict):
            continue
        try:
            lat, lng = float(s["lat"]), float(s["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        prices = {}
        for f in FUELS:
            v = s.get(f)
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
                prices[f] = round(float(v), 3)
        out.append({"name": str(s.get("name") or "").strip(), "brand": str(s.get("brand") or "").strip(),
                    "lat": lat, "lng": lng, "open": bool(s.get("isOpen", True)), "prices": prices})
    return out


def stations_for(raw: list[dict[str, Any]], fuel: str, lat0: float | None, lng0: float | None,
                 radius: float | None) -> list[dict[str, Any]]:
    """Stationen für einen Kraftstoff, relativ zum Standort; günstigste offene zuerst."""
    out = []
    for s in raw:
        p = s.get("prices", {}).get(fuel)
        if p is None:
            continue
        d = x = y = None
        if lat0 is not None and s.get("lat") is not None:
            d = round(km_between(lat0, lng0, s["lat"], s["lng"]), 1)
            x, y = offset_km(lat0, lng0, s["lat"], s["lng"])
            if radius is not None and d > radius + 0.05:
                continue
        out.append({"n": s.get("name") or s.get("brand") or "", "b": s.get("brand") or "", "p": p,
                    "o": bool(s.get("open", True)), "d": d, "x": x, "y": y,
                    # Echte Lage für die HA-Karte im Popup (4 Stellen ≈ 10 m).
                    "lat": round(s["lat"], 4) if s.get("lat") is not None else None,
                    "lng": round(s["lng"], 4) if s.get("lng") is not None else None})
    out.sort(key=lambda s: (not s["o"], s["p"], s["d"] if s["d"] is not None else 999))
    return out


# ── Verwaltung ──────────────────────────────────────────────────────────────

class Tanken:
    def __init__(self, hass: HomeAssistant, now: Callable[[], float] | None = None,
                 rnd: random.Random | None = None) -> None:
        self.hass = hass
        self._now = now or time.time
        self._rnd = rnd or random.Random()
        self._store: Store = Store(hass, 1, STORE_KEY)
        self._hstore: Store = Store(hass, 1, HIST_KEY)
        self.cfg: dict[str, Any] = {"key": None, "radius": RADIUS_DEFAULT, "cars": {}, "last_request": 0.0}
        self.hist: dict[str, dict[str, list[float]]] = {}
        # Standorte (Variante 2): je Slot Mittelpunkt, Rohdaten, Abrufzeit, nächster Termin.
        self.slots: list[dict[str, Any]] = []
        self.status: dict[str, Any] = {"at": None, "ok": None, "error": None, "count": None}
        self.sensors: dict[str, TankenSensor] = {}
        self._add: Callable | None = None
        self._unsubs: list[Callable] = []
        self._busy = False
        self._last_sample: dict[str, float] = {}
        self._last_test: float = 0.0

    # Laden/Speichern
    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.cfg.update({k: data[k] for k in ("key", "radius", "cars", "last_request") if k in data})
        self.cfg["radius"] = clamp_radius(self.cfg.get("radius"))
        self.hist = (await self._hstore.async_load() or {}).get("hist", {})

    async def _save(self) -> None:
        await self._store.async_save(dict(self.cfg))

    def _save_hist(self) -> None:
        self._hstore.async_delay_save(lambda: {"hist": self.hist}, 120)

    # Quelle
    def integration_entities(self) -> list[str]:
        reg = er.async_get(self.hass)
        return sorted(e.entity_id for e in reg.entities.values()
                      if e.platform == "tankerkoenig" and e.domain == "sensor" and not e.disabled_by)

    @property
    def source(self) -> str | None:
        if self.integration_entities():
            return "integration"
        return "key" if valid_key(self.cfg.get("key")) else None

    # Autos
    def cars(self) -> list[dict[str, Any]]:
        reg = er.async_get(self.hass)
        devs = dr.async_get(self.hass)
        found: dict[str, dict[str, Any]] = {}
        for e in reg.entities.values():
            if not e.device_id or e.disabled_by or e.platform in HELPER_PLATFORMS:
                continue
            obj = e.entity_id.split(".", 1)[1]
            tk = e.translation_key or ""
            car = found.setdefault(e.device_id, {"fuel": False, "diesel": False, "tracker": None})
            if e.domain == "sensor" and (tk in FUEL_KEYS or any(obj == x or obj.endswith("_" + x) for x in FUEL_ENDS)):
                car["fuel"] = True
            if e.domain == "sensor" and (tk in DIESEL_KEYS or any(obj == x or obj.endswith("_" + x) for x in DIESEL_ENDS)):
                car["diesel"] = True
            if e.domain == "device_tracker":
                car["tracker"] = e.entity_id
        out = []
        for dev_id, c in found.items():
            if not c["fuel"]:
                continue
            dev = devs.async_get(dev_id)
            name = (dev.name_by_user or dev.name) if dev else None
            auto = "diesel" if c["diesel"] else "e10"
            fuel = (self.cfg.get("cars") or {}).get(dev_id, {}).get("fuel") or auto
            out.append({"device_id": dev_id, "name": name or "Auto", "fuel": fuel, "fuel_auto": auto,
                        "tracker": c["tracker"]})
        out.sort(key=lambda c: c["name"].lower())
        return out

    def wanted(self) -> list[dict[str, Any]]:
        """Autos mit Kraftstoff (nicht „aus“), nur wenn eine Quelle eingerichtet ist."""
        if not self.source:
            return []
        return [c for c in self.cars() if c["fuel"] in FUELS]

    def origin(self, car: dict[str, Any]) -> tuple[str, float, float]:
        home = (float(self.hass.config.latitude), float(self.hass.config.longitude))
        tid = car.get("tracker")
        st = self.hass.states.get(tid) if tid else None
        if st is not None and st.state != "home":
            try:
                lat, lng = float(st.attributes["latitude"]), float(st.attributes["longitude"])
            except (KeyError, TypeError, ValueError):
                lat = lng = None
            if lat is not None and km_between(home[0], home[1], lat, lng) > AWAY_KM:
                return "car", lat, lng
        return "home", home[0], home[1]

    # Abruf
    async def _fetch(self, key: str, lat: float, lng: float, rad: float) -> list[dict[str, Any]]:
        url = self.hass.data.get(DATA_API_OVERRIDE) or API_URL
        params = {"lat": f"{lat:.5f}", "lng": f"{lng:.5f}", "rad": f"{min(rad, RADIUS_MAX):g}",
                  "sort": "dist", "type": "all", "apikey": key.strip()}
        try:
            async with asyncio.timeout(20):
                resp = await async_get_clientsession(self.hass).get(url, params=params)
                if resp.status == 401 or resp.status == 403:
                    raise TankenError("key", "Schlüssel abgelehnt")
                if resp.status >= 400:
                    raise TankenError("http", f"HTTP {resp.status}")
                data = await resp.json(content_type=None)
        except TankenError:
            raise
        except (asyncio.TimeoutError, TimeoutError) as err:
            raise TankenError("timeout", "Tankerkönig antwortet nicht") from err
        except Exception as err:  # noqa: BLE001 – Meldung ohne URL (dort stünde der Schlüssel)
            raise TankenError("net", f"Verbindung fehlgeschlagen ({type(err).__name__})") from err
        try:
            return parse_list(data)
        except TankenError as err:
            if err.code == "api" and re.search(r"apikey|key", err.message, re.I):
                raise TankenError("key", scrub(err.message, key)) from None
            raise TankenError(err.code, scrub(err.message, key)) from None

    def _slot_for(self, lat: float, lng: float, rad: float) -> dict[str, Any]:
        tol = max(1.0, rad * 0.2)
        for s in self.slots:
            if s["rad"] == rad and km_between(s["lat"], s["lng"], lat, lng) <= tol:
                return s
        s = {"lat": lat, "lng": lng, "rad": rad, "raw": None, "at": 0.0, "due": 0.0, "used": self._now()}
        self.slots.append(s)
        return s

    def may_request(self) -> bool:
        return self._now() - float(self.cfg.get("last_request") or 0) >= MIN_INTERVAL

    async def async_tick(self, *_: Any) -> None:
        """Einmal je Minute: höchstens eine Abfrage (fälligster Standort), dann Sensoren nachziehen."""
        if self._busy:
            return
        self._busy = True
        try:
            if self.source == "key":
                now = self._now()
                rad = self.cfg["radius"]
                for car in self.wanted():
                    _kind, lat, lng = self.origin(car)
                    self._slot_for(lat, lng, rad)["used"] = now
                self.slots = [s for s in self.slots if now - s["used"] < SLOT_STALE]
                due = sorted((s for s in self.slots if now >= s["due"]), key=lambda s: s["due"])
                if due and self.may_request():
                    await self._request(due[0])
            self.refresh()
        finally:
            self._busy = False

    async def _request(self, slot: dict[str, Any]) -> None:
        key = str(self.cfg.get("key") or "")
        now = self._now()
        self.cfg["last_request"] = now
        await self._save()
        try:
            slot["raw"] = await self._fetch(key, slot["lat"], slot["lng"], slot["rad"])
            slot["at"] = now
            self.status = {"at": dt_util.utcnow().isoformat(), "ok": True, "error": None, "count": len(slot["raw"])}
        except TankenError as err:
            self.status = {"at": dt_util.utcnow().isoformat(), "ok": False, "error": err.message, "code": err.code,
                           "count": None}
            _LOGGER.warning("Casora Tanken: Abruf fehlgeschlagen: %s", scrub(err.message, key))
        slot["due"] = now + TARGET_INTERVAL + self._rnd.uniform(0, JITTER)

    async def async_test(self, key: str | None) -> dict[str, Any]:
        """Test-Abruf aus dem Studio: mit neuem Schlüssel echt (höchstens einmal je Minute), mit dem
        gespeicherten innerhalb von 5 Minuten aus dem letzten Ergebnis."""
        stored = str(self.cfg.get("key") or "")
        key = (key or "").strip() or stored
        if not valid_key(key):
            return {"ok": False, "code": "format", "message": "Der Schlüssel hat nicht das richtige Format."}
        now = self._now()
        home = (float(self.hass.config.latitude), float(self.hass.config.longitude))
        rad = self.cfg["radius"]
        slot = self._slot_for(home[0], home[1], rad)
        if key == stored and not self.may_request():
            if slot["raw"] is not None:
                return self._test_result(slot["raw"], cached=True)
            return {"ok": False, "code": "wait",
                    "message": "Gerade erst abgefragt. Tankerkönig erlaubt eine Abfrage je 5 Minuten.",
                    "wait": int(MIN_INTERVAL - (now - float(self.cfg.get("last_request") or 0)))}
        if key != stored and now - self._last_test < TEST_GAP:
            return {"ok": False, "code": "wait", "message": "Gerade erst abgefragt. Bitte gleich noch einmal.",
                    "wait": int(TEST_GAP - (now - self._last_test))}
        self._last_test = now
        if key == stored:
            self.cfg["last_request"] = now
            await self._save()
        try:
            raw = await self._fetch(key, home[0], home[1], rad)
        except TankenError as err:
            return {"ok": False, "code": err.code, "message": scrub(err.message, key)}
        if key == stored:
            slot.update(raw=raw, at=now, due=now + TARGET_INTERVAL + self._rnd.uniform(0, JITTER))
            self.refresh()
        return self._test_result(raw)

    def _test_result(self, raw: list[dict[str, Any]], cached: bool = False) -> dict[str, Any]:
        fuels = {c["fuel"] for c in self.wanted()} or {"e10"}
        best = {}
        for f in sorted(fuels):
            st = stations_for(raw, f, None, None, None)
            if st:
                best[f] = st[0]["p"]
        return {"ok": True, "count": len(raw), "cheapest": best, "cached": cached, "radius": self.cfg["radius"]}

    # Variante 1: Sensoren der Tankerkönig-Integration
    def _integration_raw(self) -> list[dict[str, Any]]:
        reg = er.async_get(self.hass)
        opened: dict[str, bool] = {}
        for e in reg.entities.values():
            if e.platform == "tankerkoenig" and e.domain == "binary_sensor" and e.device_id:
                st = self.hass.states.get(e.entity_id)
                if st is not None and st.state in ("on", "off"):
                    opened[e.device_id] = st.state == "on"
        by_dev: dict[str, dict[str, Any]] = {}
        for eid in self.integration_entities():
            st = self.hass.states.get(eid)
            ent = reg.async_get(eid)
            if st is None or ent is None:
                continue
            a = st.attributes
            fuel = str(a.get("fuel_type") or "").lower()
            try:
                price = round(float(st.state), 3)
            except (TypeError, ValueError):
                continue
            if fuel not in FUELS:
                continue
            k = ent.device_id or eid
            s = by_dev.setdefault(k, {"name": str(a.get("station_name") or a.get("friendly_name") or "").strip(),
                                      "brand": str(a.get("brand") or "").strip(),
                                      "lat": a.get("latitude"), "lng": a.get("longitude"),
                                      "open": opened.get(ent.device_id, True), "prices": {}})
            s["prices"][fuel] = price
        for s in by_dev.values():
            try:
                s["lat"], s["lng"] = float(s["lat"]), float(s["lng"])
            except (TypeError, ValueError):
                s["lat"] = s["lng"] = None
        return list(by_dev.values())

    # Sensorwerte
    def data_for(self, car: dict[str, Any]) -> dict[str, Any]:
        src = self.source
        kind, lat, lng = self.origin(car)
        fuel = car["fuel"]
        if src == "integration":
            raw, at, radius = self._integration_raw(), dt_util.utcnow().isoformat(), None
        else:
            radius = self.cfg["radius"]
            slot = next((s for s in self.slots if s["rad"] == radius
                         and km_between(s["lat"], s["lng"], lat, lng) <= max(1.0, radius * 0.2)), None)
            raw = slot["raw"] if slot and slot["raw"] is not None else None
            at = datetime.fromtimestamp(slot["at"], dt_util.UTC).isoformat() if raw is not None else None
        stations = stations_for(raw or [], fuel, lat, lng, radius)
        open_ = [s for s in stations if s["o"]]
        price = open_[0]["p"] if open_ else None
        key = f"{car['device_id']}_{fuel}"
        hist = self.hist.setdefault(key, {})
        now = dt_util.utcnow()
        # Höchstens ein Messwert je 10 Minuten und Sensor (die Tageskurve soll nicht von der Taktung abhängen).
        if price is not None and self._now() - self._last_sample.get(key, 0) >= TARGET_INTERVAL - 30:
            self._last_sample[key] = self._now()
            add_sample(hist, now, price)
            prune_hist(hist, now)
            self._save_hist()
        out = {"price": price, "stations": stations[:25], "count": len(stations), "origin": kind,
               # Mittelpunkt der Karte (Zuhause bzw. Auto), grob gerundet.
               "center": [round(lat, 3), round(lng, 3)] if lat is not None and lng is not None else None,
               "radius_km": radius, "updated": at, "source": src,
               "error": self.status.get("error") if src == "key" and not self.status.get("ok") else None}
        out.update(typical_day(hist, now))
        return out

    # Sensoren
    @callback
    def attach(self, add: Callable) -> None:
        self._add = add
        self.sync_entities()

    @callback
    def sync_entities(self) -> None:
        if self._add is None:
            return
        want = {f"{DOMAIN}_tanken_{c['device_id']}_{c['fuel']}": c for c in self.wanted()}
        new = []
        for uid, car in want.items():
            if uid not in self.sensors:
                self.sensors[uid] = TankenSensor(self, uid, car)
                new.append(self.sensors[uid])
            else:
                self.sensors[uid].car = car
        if new:
            self._add(new)
        reg = er.async_get(self.hass)
        for uid in [u for u in self.sensors if u not in want]:
            sen = self.sensors.pop(uid)
            eid = reg.async_get_entity_id("sensor", DOMAIN, uid) or sen.entity_id
            if eid and reg.async_get(eid):
                reg.async_remove(eid)
        # Reste früherer Einrichtungen (anderer Kraftstoff, Auto weg) aus dem Register räumen.
        for e in list(reg.entities.values()):
            if e.platform == DOMAIN and e.domain == "sensor" and str(e.unique_id).startswith(f"{DOMAIN}_tanken_") \
                    and e.unique_id not in want:
                reg.async_remove(e.entity_id)

    @callback
    def refresh(self) -> None:
        for s in list(self.sensors.values()):
            if s.hass is not None:
                s.update_data()
                s.async_write_ha_state()

    # Start/Stopp
    @callback
    def start(self) -> None:
        def _go(*_: Any) -> None:
            self._unsubs.append(async_track_time_interval(self.hass, self.async_tick, timedelta(seconds=TICK)))
            # Erster Abruf mit Zufallsversatz (nicht alle Häuser zur selben Sekunde).
            self._unsubs.append(async_call_later(self.hass, self._rnd.uniform(5, 60), self.async_tick))

        if self.hass.state is CoreState.running:
            _go()
        else:
            from homeassistant.const import EVENT_HOMEASSISTANT_STARTED

            self._unsubs.append(self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _go))

    @callback
    def stop(self) -> None:
        while self._unsubs:
            try:
                self._unsubs.pop()()
            except Exception:  # noqa: BLE001
                pass

    # Studio
    def payload(self) -> dict[str, Any]:
        integ = self._integration_raw() if self.integration_entities() else []
        cars = self.cars()
        reg = er.async_get(self.hass)
        for c in cars:
            uid = f"{DOMAIN}_tanken_{c['device_id']}_{c['fuel']}"
            c["sensor"] = reg.async_get_entity_id("sensor", DOMAIN, uid) if self.source else None
            c.pop("tracker", None)
        return {
            "source": self.source,
            "key_set": valid_key(self.cfg.get("key")),
            "radius": self.cfg["radius"],
            "radius_max": RADIUS_MAX,
            "cars": cars,
            "integration": {"stations": len(integ),
                            "names": sorted({s["name"] for s in integ if s["name"]})[:12]},
            "status": dict(self.status),
        }

    async def async_set(self, msg: dict[str, Any]) -> None:
        changed_key = False
        if "key" in msg:
            k = (msg.get("key") or "").strip()
            if k and not valid_key(k):
                raise TankenError("format", "Der Schlüssel hat nicht das richtige Format.")
            if (k or None) != self.cfg.get("key"):
                self.cfg["key"] = k or None
                changed_key = True
        if "radius" in msg:
            self.cfg["radius"] = clamp_radius(msg["radius"])
        if isinstance(msg.get("cars"), dict):
            cars = dict(self.cfg.get("cars") or {})
            for dev, fuel in msg["cars"].items():
                if fuel in (*FUELS, "off"):
                    cars[str(dev)] = {"fuel": fuel}
            self.cfg["cars"] = cars
        if changed_key:
            # Neuer Schlüssel: alte Daten verwerfen, der nächste Takt fragt (Pause gilt je Schlüssel).
            self.slots = []
            self.cfg["last_request"] = 0.0
            self.status = {"at": None, "ok": None, "error": None, "count": None}
        await self._save()
        self.sync_entities()
        self.refresh()


class TankenSensor(SensorEntity):
    """Günstigster offener Preis je Auto und Kraftstoff (Verlauf im Recorder)."""

    _attr_should_poll = False
    _attr_has_entity_name = False
    _attr_icon = "mdi:gas-station"
    _attr_native_unit_of_measurement = "€/L"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 3
    # Liste und Tageskurve ändern sich bei jedem Abruf – nicht in die Datenbank.
    _unrecorded_attributes = frozenset({"stations", "typical", "low", "high", "days", "learn_days_left",
                                        "updated", "count", "error", "origin", "radius_km", "source",
                                        "center"})

    def __init__(self, tk: Tanken, uid: str, car: dict[str, Any]) -> None:
        self.tk = tk
        self.car = car
        self._attr_unique_id = uid
        self._attr_name = f"{car['name']} günstigster Preis {FUEL_LABEL[car['fuel']]}"
        self.entity_id = f"sensor.casora_tanken_{slugify(car['name'])}_{car['fuel']}"
        self._data: dict[str, Any] = {}

    def update_data(self) -> None:
        self._data = self.tk.data_for(self.car)

    async def async_added_to_hass(self) -> None:
        self.update_data()

    @property
    def native_value(self) -> float | None:
        return self._data.get("price")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        d = self._data
        return {"car_device_id": self.car["device_id"], "car_name": self.car["name"], "fuel": self.car["fuel"],
                **{k: d.get(k) for k in ("source", "origin", "center", "radius_km", "updated", "count", "stations",
                                         "typical", "low", "high", "days", "learn_days_left", "error")}}


# ── WebSocket ───────────────────────────────────────────────────────────────

def _tk(hass: HomeAssistant) -> Tanken | None:
    return hass.data.get(DOMAIN, {}).get("tanken")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/tanken/get"})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    tk = _tk(hass)
    if tk is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], tk.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/tanken/set",
    vol.Optional("key"): vol.Any(None, str),
    vol.Optional("radius"): vol.Any(int, float),
    vol.Optional("cars"): {str: vol.In([*FUELS, "off"])},
})
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    tk = _tk(hass)
    if tk is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    try:
        await tk.async_set(msg)
    except TankenError as err:
        connection.send_error(msg["id"], "invalid_format", err.message)
        return
    connection.send_result(msg["id"], tk.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/tanken/test",
    vol.Optional("key"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    tk = _tk(hass)
    if tk is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], await tk.async_test(msg.get("key")))


async def async_setup_tanken(hass: HomeAssistant) -> Tanken:
    tk = Tanken(hass)
    await tk.async_load()
    hass.data.setdefault(DOMAIN, {})["tanken"] = tk
    if not hass.data[DOMAIN].get("tanken_ws"):
        websocket_api.async_register_command(hass, ws_get)
        websocket_api.async_register_command(hass, ws_set)
        websocket_api.async_register_command(hass, ws_test)
        hass.data[DOMAIN]["tanken_ws"] = True
    tk.start()
    return tk
