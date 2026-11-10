"""Charging (issue 168): public chargers near the car for the car popup, data from Open Charge Map.

Casora asks Open Charge Map only with the user's own key (Studio › Settings) and only when a popup asks for the
list: no polling. An answer is kept per place for CACHE seconds, real requests are at least MIN_GAP seconds apart.
The key lives only in .storage/casora.charging, goes in a header (never in the address), never to the browser and
never into the log. Search centre: the car's place when it is known and away from home, else Home.

Open Charge Map has no live availability and hardly any prices: a charger is "free" only where its usage cost says
so. Data: Open Charge Map and its data providers, CC BY 4.0 (the popup names the source).

WebSocket:
  casora/charging/get  (admin) → {key_set, radius, radius_max, status}
  casora/charging/set  (admin) ← {key?: str ("" = remove), radius?: km}
  casora/charging/test (admin) ← {key?: str} → {ok, count, message}
  casora/charging/list (any user) ← {device_id?: str} → {ready, origin, radius, updated, stations: […], error}
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .tanken import AWAY_KM, km_between, scrub, valid_key

_LOGGER = logging.getLogger(__name__)

API_URL = "https://api.openchargemap.io/v3/poi/"
# Test house (dev/casora_mock): address of a fake API instead of Open Charge Map, never set in real use.
DATA_API_OVERRIDE = "casora_charging_api"
STORE_KEY = f"{DOMAIN}.charging"
RADIUS_DEFAULT = 10.0
RADIUS_MAX = 50.0
MAX_RESULTS = 80
CACHE = 1800                      # an answer for a place stays this long
MIN_GAP = 10                      # seconds between two real requests
SLOT_STALE = 6 * 3600
HPC_KW = 150.0                    # high power charging from here on
DC_GUESS_KW = 43.0                # no current type given: more than the strongest AC plug means DC
# StatusType ids that are not in use (reference data: not operational, planned, removed).
DEAD_STATUS = {100, 150, 200, 210}
# UsageType ids nobody can just drive to: restricted access, privately owned with notice.
PRIVATE_USAGE = {2, 3}
FREE_RE = re.compile(r"\b(free|kostenlos|gratis|gratuit|gratuito|kosteloos)\b", re.I)
ZERO_RE = re.compile(r"^\s*0+([.,]0+)?\s*(€|eur|euro|\$|usd|£|gbp|chf|kr|nok|sek|dkk|pln|zł)?\s*(/\s*kwh)?\s*$", re.I)


class ChargingError(Exception):
    """Request failed; code for the Studio, message without the key."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code


# ── Helpers without HA ──────────────────────────────────────────────────────

def clamp_radius(value: Any) -> float:
    try:
        r = float(value)
    except (TypeError, ValueError):
        return RADIUS_DEFAULT
    if r != r:
        return RADIUS_DEFAULT
    return round(max(1.0, min(RADIUS_MAX, r)), 1)


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if v == v and v > 0 else None


def is_free(cost: Any) -> bool:
    """Usage cost as people type it: "Free", "kostenlos", "0", "0,00 €/kWh"."""
    s = str(cost or "").strip()
    if not s:
        return False
    if ZERO_RE.match(s):
        return True
    return bool(FREE_RE.search(s)) and not re.search(r"\b(not|nicht|kein|no)\b", s, re.I)


def current_of(conn: dict[str, Any]) -> str | None:
    """"ac", "dc" or None for one connection: the current type, else guessed from the power."""
    cur = conn.get("CurrentTypeID")
    if cur == 30:
        return "dc"
    if cur in (10, 20):
        return "ac"
    kw = _num(conn.get("PowerKW"))
    if kw is None:
        return None
    return "dc" if kw > DC_GUESS_KW else "ac"


def parse_pois(data: Any, lat0: float, lng0: float, radius: float | None = None) -> list[dict[str, Any]]:
    """Answer of /v3/poi → chargers in use, nearest first.

    One entry: n name, op operator, a address line, lat/lng (4 places ≈ 10 m), d km, kw strongest plug,
    ac/dc/hpc whether it has such a plug, points number of plugs (None unknown), free.
    """
    if not isinstance(data, list):
        raise ChargingError("bad_answer", "Unerwartete Antwort")
    out = []
    for p in data:
        if not isinstance(p, dict):
            continue
        if p.get("StatusTypeID") in DEAD_STATUS or p.get("UsageTypeID") in PRIVATE_USAGE:
            continue
        adr = p.get("AddressInfo") if isinstance(p.get("AddressInfo"), dict) else {}
        try:
            lat, lng = float(adr["Latitude"]), float(adr["Longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        d = round(km_between(lat0, lng0, lat, lng), 1)
        if radius is not None and d > radius + 0.05:
            continue
        kw = None
        kinds = {"ac": False, "dc": False, "hpc": False}
        plugs = 0
        for c in p.get("Connections") or []:
            if not isinstance(c, dict) or c.get("StatusTypeID") in DEAD_STATUS:
                continue
            q = c.get("Quantity")
            plugs += int(q) if isinstance(q, int) and not isinstance(q, bool) and q > 0 else 1
            ckw = _num(c.get("PowerKW"))
            if ckw is not None and (kw is None or ckw > kw):
                kw = ckw
            cur = current_of(c)
            if cur:
                kinds[cur] = True
            if cur == "dc" and ckw is not None and ckw >= HPC_KW:
                kinds["hpc"] = True
        if not plugs:
            continue
        n = p.get("NumberOfPoints")
        op = p.get("OperatorInfo") if isinstance(p.get("OperatorInfo"), dict) else {}
        op_name = str(op.get("Title") or "").strip()
        # Open Charge Map's placeholders ("(Unknown Operator)", "(Business Owner at Location)") are no operator.
        if op_name.startswith("("):
            op_name = ""
        town = str(adr.get("Town") or "").strip()
        line = str(adr.get("AddressLine1") or "").strip()
        out.append({
            "n": str(adr.get("Title") or "").strip() or line or op_name,
            "op": op_name,
            "a": ", ".join(x for x in (line, town) if x),
            "lat": round(lat, 4), "lng": round(lng, 4), "d": d,
            "kw": round(kw, 1) if kw is not None else None,
            **kinds,
            "points": int(n) if isinstance(n, int) and not isinstance(n, bool) and n > 0 else None,
            "free": is_free(p.get("UsageCost")),
        })
    out.sort(key=lambda s: (s["d"], s["n"]))
    return out


# ── Management ──────────────────────────────────────────────────────────────

class Charging:
    def __init__(self, hass: HomeAssistant, now: Callable[[], float] | None = None) -> None:
        self.hass = hass
        self._now = now or time.time
        self._store: Store = Store(hass, 1, STORE_KEY)
        self.cfg: dict[str, Any] = {"key": None, "radius": RADIUS_DEFAULT}
        # One slot per search centre: {lat, lng, rad, raw, at, used}.
        self.slots: list[dict[str, Any]] = []
        self.status: dict[str, Any] = {"at": None, "ok": None, "error": None, "count": None}
        self._last_request = 0.0
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.cfg.update({k: data[k] for k in ("key", "radius") if k in data})
        self.cfg["radius"] = clamp_radius(self.cfg.get("radius"))

    async def _save(self) -> None:
        await self._store.async_save(dict(self.cfg))

    @property
    def ready(self) -> bool:
        return valid_key(self.cfg.get("key"))

    def origin(self, device_id: str | None) -> tuple[str, float, float]:
        """The car's place when its tracker is away from home, else Home."""
        home = (float(self.hass.config.latitude), float(self.hass.config.longitude))
        if device_id:
            reg = er.async_get(self.hass)
            for e in er.async_entries_for_device(reg, device_id):
                if e.domain != "device_tracker" or e.disabled_by:
                    continue
                st = self.hass.states.get(e.entity_id)
                if st is None or st.state == "home":
                    continue
                try:
                    lat, lng = float(st.attributes["latitude"]), float(st.attributes["longitude"])
                except (KeyError, TypeError, ValueError):
                    continue
                if km_between(home[0], home[1], lat, lng) > AWAY_KM:
                    return "car", lat, lng
        return "home", home[0], home[1]

    async def _fetch(self, key: str, lat: float, lng: float, rad: float) -> list[dict[str, Any]]:
        url = self.hass.data.get(DATA_API_OVERRIDE) or API_URL
        params = {"output": "json", "latitude": f"{lat:.5f}", "longitude": f"{lng:.5f}",
                  "distance": f"{min(rad, RADIUS_MAX):g}", "distanceunit": "KM", "maxresults": str(MAX_RESULTS),
                  "compact": "false", "verbose": "false"}
        try:
            async with asyncio.timeout(25):
                resp = await async_get_clientsession(self.hass).get(
                    url, params=params, headers={"X-API-Key": key.strip()})
                if resp.status in (401, 403):
                    raise ChargingError("key", "Schlüssel abgelehnt")
                if resp.status == 429:
                    raise ChargingError("limit", "Zu viele Abfragen")
                if resp.status >= 400:
                    raise ChargingError("http", f"HTTP {resp.status}")
                data = await resp.json(content_type=None)
        except ChargingError:
            raise
        except (asyncio.TimeoutError, TimeoutError) as err:
            raise ChargingError("timeout", "Open Charge Map antwortet nicht") from err
        except Exception as err:  # noqa: BLE001 – message without anything from the request
            raise ChargingError("net", f"Verbindung fehlgeschlagen ({type(err).__name__})") from err
        return parse_pois(data, lat, lng, rad)

    def _slot_for(self, lat: float, lng: float, rad: float) -> dict[str, Any]:
        now = self._now()
        self.slots = [s for s in self.slots if now - s["used"] < SLOT_STALE]
        tol = max(1.0, rad * 0.1)
        for s in self.slots:
            if s["rad"] == rad and km_between(s["lat"], s["lng"], lat, lng) <= tol:
                s["used"] = now
                return s
        s = {"lat": lat, "lng": lng, "rad": rad, "raw": None, "at": 0.0, "used": now}
        self.slots.append(s)
        return s

    async def async_list(self, device_id: str | None) -> dict[str, Any]:
        """The chargers around the car for a popup: from the cache, else one request."""
        rad = self.cfg["radius"]
        base = {"ready": self.ready, "radius": rad, "origin": None, "updated": None, "stations": [], "error": None}
        if not self.ready:
            return base
        kind, lat, lng = self.origin(device_id)
        base["origin"] = kind
        async with self._lock:
            slot = self._slot_for(lat, lng, rad)
            now = self._now()
            if slot["raw"] is None or now - slot["at"] >= CACHE:
                if now - self._last_request < MIN_GAP:
                    if slot["raw"] is None:
                        return {**base, "error": "wait"}
                else:
                    await self._request(slot)
            if slot["raw"] is None:
                return {**base, "error": self.status.get("code") or "net"}
            return {**base, "updated": slot.get("iso"), "stations": slot["raw"]}

    async def _request(self, slot: dict[str, Any]) -> None:
        key = str(self.cfg.get("key") or "")
        now = self._now()
        self._last_request = now
        try:
            slot["raw"] = await self._fetch(key, slot["lat"], slot["lng"], slot["rad"])
            slot["at"] = now
            slot["iso"] = dt_util.utcnow().isoformat()
            self.status = {"at": slot["iso"], "ok": True, "error": None, "count": len(slot["raw"])}
        except ChargingError as err:
            self.status = {"at": dt_util.utcnow().isoformat(), "ok": False, "error": err.message, "code": err.code,
                           "count": None}
            _LOGGER.warning("Casora charging: request failed: %s", scrub(err.message, key))

    async def async_test(self, key: str | None) -> dict[str, Any]:
        """Test request from the Studio around Home, with the typed key or the stored one."""
        stored = str(self.cfg.get("key") or "")
        key = (key or "").strip() or stored
        if not valid_key(key):
            return {"ok": False, "code": "format", "message": "Der Schlüssel hat nicht das richtige Format."}
        now = self._now()
        if now - self._last_request < MIN_GAP:
            return {"ok": False, "code": "wait", "message": "Gerade erst abgefragt. Bitte gleich noch einmal.",
                    "wait": int(MIN_GAP - (now - self._last_request)) + 1}
        self._last_request = now
        rad = self.cfg["radius"]
        home = (float(self.hass.config.latitude), float(self.hass.config.longitude))
        try:
            raw = await self._fetch(key, home[0], home[1], rad)
        except ChargingError as err:
            return {"ok": False, "code": err.code, "message": scrub(err.message, key)}
        if key == stored:
            slot = self._slot_for(home[0], home[1], rad)
            slot.update(raw=raw, at=now, iso=dt_util.utcnow().isoformat())
        return {"ok": True, "count": len(raw), "radius": rad,
                "nearest": raw[0]["d"] if raw else None}

    def payload(self) -> dict[str, Any]:
        return {"key_set": self.ready, "radius": self.cfg["radius"], "radius_max": RADIUS_MAX,
                "status": dict(self.status)}

    async def async_set(self, msg: dict[str, Any]) -> None:
        if "key" in msg:
            k = (msg.get("key") or "").strip()
            if k and not valid_key(k):
                raise ChargingError("format", "Der Schlüssel hat nicht das richtige Format.")
            if (k or None) != self.cfg.get("key"):
                self.cfg["key"] = k or None
                self.slots = []
                self.status = {"at": None, "ok": None, "error": None, "count": None}
        if "radius" in msg:
            rad = clamp_radius(msg["radius"])
            if rad != self.cfg["radius"]:
                self.cfg["radius"] = rad
                self.slots = []
        await self._save()


# ── WebSocket ───────────────────────────────────────────────────────────────

def _ch(hass: HomeAssistant) -> Charging | None:
    return hass.data.get(DOMAIN, {}).get("charging")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/charging/get"})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    ch = _ch(hass)
    if ch is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], ch.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/charging/set",
    vol.Optional("key"): vol.Any(None, str),
    vol.Optional("radius"): vol.Any(int, float),
})
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    ch = _ch(hass)
    if ch is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    try:
        await ch.async_set(msg)
    except ChargingError as err:
        connection.send_error(msg["id"], "invalid_format", err.message)
        return
    connection.send_result(msg["id"], ch.payload())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/charging/test",
    vol.Optional("key"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    ch = _ch(hass)
    if ch is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], await ch.async_test(msg.get("key")))


@websocket_api.websocket_command({
    vol.Required("type"): "casora/charging/list",
    vol.Optional("device_id"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    ch = _ch(hass)
    if ch is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], await ch.async_list(msg.get("device_id")))


async def async_setup_charging(hass: HomeAssistant) -> Charging:
    ch = Charging(hass)
    await ch.async_load()
    hass.data.setdefault(DOMAIN, {})["charging"] = ch
    if not hass.data[DOMAIN].get("charging_ws"):
        for cmd in (ws_get, ws_set, ws_test, ws_list):
            websocket_api.async_register_command(hass, cmd)
        hass.data[DOMAIN]["charging_ws"] = True
    return ch
