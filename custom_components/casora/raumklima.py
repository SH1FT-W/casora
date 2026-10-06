"""Raumklima und Solar-Tipp – ohne feste Entitäten.

Lüften (sensor.casora_lueften + binary_sensor.casora_lueften_hinweis)
  Bewertet jeden Bereich mit Feuchte- oder CO₂-Sensor: CO₂ (≥1000 bald, ≥1400
  jetzt), relative Feuchte (≥60 bald, ≥65 jetzt – nur wenn die Außenluft absolut
  trockener ist, Magnus-Formel), VOC in ppb (≥660 / ≥2200). Außenluft mit
  PM2.5 ≥ 35 µg/m³ → nicht lüften. Räume mit Fensterkontakt bekommen einen
  Stoßlüften-Timer (Dauer nach Außentemperatur); „Fenster schließen“, wenn die
  Zeit um ist und es draußen < 12 °C hat oder im Raum geheizt wird.
  Status je Raum: ok · bald · jetzt · feucht · draussen · lueftet · schliessen.

Solar-Tipp (binary_sensor.casora_solar_tipp)
  An, wenn genug Sonnenstrom übrig ist, um ein großes Gerät praktisch gratis
  laufen zu lassen: Akku ≥ 90 % und ≥ 500 W übrig oder ≥ 1200 W übrig, je
  10 Min. Verzögerung gegen Wolken-Flackern. Quellen: Leistungssensoren aus den
  Energie-Einstellungen (Solar, Netz, Akku), sonst Solarleistung/Hausbedarf
  eines Solarspeichers (z. B. Anker Solix).

Gibt es die früheren Template-Sensoren aus eigenen Paketen noch, legt Casora die
jeweilige Funktion nicht an – das Dashboard nimmt dann die alten.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import timedelta
from statistics import median
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, UnitOfPower
from homeassistant.core import CoreState, Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .ki import OPT_OUT_RH, OPT_OUT_T, OUTDOOR, _area_id, _outdoor

_LOGGER = logging.getLogger(__name__)

LEGACY_VENT = "hemma_lueften"
LEGACY_SOLAR = "hemma_solar_uberschuss"
BAD = ("unknown", "unavailable", "")
WINDOW = {"window", "opening"}
PATIO = re.compile(r"terrass|balkon|patio|veranda|garten|balcony|terrace|garden", re.I)
PV_KEYS = ("solarbank_input_power", "input_power", "solar_power", "pv_power", "photovoltaics_power")
HOME_KEYS = ("home_load_power", "house_load_power", "home_consumption_power", "load_power")
SOC_KEYS = ("state_of_charge", "battery_soc", "soc")
REFRESH = timedelta(minutes=15)
TICK = timedelta(seconds=60)


def _legacy(hass: HomeAssistant, domain: str, unique_id: str) -> bool:
    return er.async_get(hass).async_get_entity_id(domain, "template", unique_id) is not None


def _num(hass: HomeAssistant, entity_id: str | None) -> float | None:
    st = hass.states.get(entity_id) if entity_id else None
    if not st or st.state in BAD:
        return None
    try:
        v = float(st.state)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def _med(hass: HomeAssistant, ids: list[str]) -> float | None:
    vals = [v for v in (_num(hass, i) for i in ids) if v is not None]
    return median(vals) if vals else None


def _watt(hass: HomeAssistant, entity_id: str | None) -> float | None:
    v = _num(hass, entity_id)
    if v is None:
        return None
    unit = (hass.states.get(entity_id).attributes.get("unit_of_measurement") or "").strip()
    return v * 1000 if unit == UnitOfPower.KILO_WATT else v / 1000 if unit == "mW" else v


def _abs_humidity(rh: float | None, t: float | None) -> float | None:
    if rh is None or t is None:
        return None
    return 216.7 * (rh / 100 * 6.112 * math.exp(17.62 * t / (243.12 + t))) / (273.15 + t)


def _dur(minutes: int) -> str:
    return f"{minutes} Min." if minutes < 60 else f"{minutes // 60} Std. {minutes % 60} Min."


# ── Lüften ───────────────────────────────────────────────────────────────────

def find_rooms(hass: HomeAssistant) -> list[dict]:
    """Bereiche mit Feuchte- oder CO₂-Sensor, samt Temperatur, VOC, Fenster, Heizung."""
    reg = er.async_get(hass)
    areas = ar.async_get(hass)
    plants = {e.device_id for e in reg.entities.values() if e.domain == "plant" and e.device_id}
    rooms: dict[str, dict] = {}

    def room(aid: str) -> dict | None:
        area = areas.async_get_area(aid)
        if not area or OUTDOOR.search(area.name):
            return None
        return rooms.setdefault(aid, {"k": aid, "n": area.name, "rh": [], "t": [], "co2": [], "voc": [],
                                      "w": [], "heat": []})

    for st in hass.states.async_all(("sensor", "binary_sensor", "climate")):
        ent = reg.async_get(st.entity_id)
        if ent and (ent.entity_category or ent.disabled_by or ent.hidden_by):
            continue
        if ent and ent.device_id in plants:
            continue
        aid = _area_id(hass, st.entity_id)
        if not aid:
            continue
        dc = st.attributes.get("device_class")
        unit = st.attributes.get("unit_of_measurement")
        key = None
        if st.domain == "sensor":
            if OUTDOOR.search(f"{st.entity_id} {st.attributes.get('friendly_name', '')}"):
                continue
            key = {"humidity": "rh", "temperature": "t", "carbon_dioxide": "co2"}.get(dc)
            if dc == "volatile_organic_compounds_parts" and unit == "ppb":
                key = "voc"
        elif st.domain == "binary_sensor":
            name = f"{st.entity_id} {st.attributes.get('friendly_name', '')}"
            if dc in WINDOW or (dc == "door" and PATIO.search(name)):
                key = "w"
        elif st.domain == "climate":
            key = "heat"
        if key and (r := room(aid)) is not None:
            r[key].append(st.entity_id)
    out = [r for r in rooms.values() if r["rh"] or r["co2"]]
    return sorted(out, key=lambda r: r["n"])


def _open_since(hass: HomeAssistant, st) -> Any:
    """Seit wann ist das Fenster offen? last_changed beginnt nach einem Neustart von vorn –
    Casora merkt sich „offen seit“ über Neustarts (media_pause.contacts), das gilt dann."""
    pause = (hass.data.get(DOMAIN) or {}).get("media_pause")
    since = ((getattr(pause, "contacts", None) or {}).get(st.entity_id) or {}).get("since")
    when = dt_util.parse_datetime(since) if since else None
    return when if when is not None and when < st.last_changed else st.last_changed


def evaluate_rooms(hass: HomeAssistant, rooms: list[dict], out_t: str | None, out_rh: str | None,
                   out_pm: str | None) -> tuple[dict, list[dict], list[str]]:
    to, rho, pm = _num(hass, out_t), _num(hass, out_rh), _num(hass, out_pm)
    aho = _abs_humidity(rho, to)
    target = 5 if to is None or to < 5 else 10 if to < 10 else 15 if to < 15 else 20 if to < 20 else 30
    now = dt_util.utcnow()
    result = []
    for r in rooms:
        rh, t = _med(hass, r["rh"]), _med(hass, r["t"])
        co2 = _med(hass, r["co2"])
        voc = _med(hass, r["voc"])
        ahi = _abs_humidity(rh, t)
        dry = aho is not None and ahi is not None and aho < ahi - 0.5
        c_l = 2 if co2 is not None and co2 >= 1400 else 1 if co2 is not None and co2 >= 1000 else 0
        v_l = 2 if voc is not None and voc >= 2200 else 1 if voc is not None and voc >= 660 else 0
        h_l = 2 if rh is not None and rh >= 65 else 1 if rh is not None and rh >= 60 else 0
        need = max(c_l, v_l, h_l if dry else 0)
        open_ws = [hass.states.get(w) for w in r["w"]]
        open_ws = [s for s in open_ws if s and s.state == "on"]
        wo = bool(open_ws)
        om = int(round((now - min(_open_since(hass, s) for s in open_ws)).total_seconds() / 60)) if wo else None
        heizt = any((hass.states.get(c) and hass.states.get(c).attributes.get("hvac_action") == "heating")
                    for c in r["heat"])
        close = wo and om >= target and ((to is not None and to < 12) or heizt)
        why = []
        if c_l:
            why.append(f"CO₂ {int(co2)} ppm")
        if h_l and (dry or h_l == 2):
            why.append(f"Feuchte {round(rh)} %")
        if v_l:
            why.append(f"VOC {int(voc)} ppb")
        if close:
            st, g = "schliessen", f"Fenster seit {_dur(om)} offen"
        elif wo:
            st = "lueftet"
            g = f"Fenster offen · noch {target - om} Min." if om < target else f"Fenster offen seit {_dur(om)}"
        elif need > 0 and pm is not None and pm >= 35:
            st, g = "draussen", f"Außenluft belastet (PM2.5 {int(pm)})"
        elif need == 2:
            st, g = "jetzt", " · ".join(why)
        elif need == 1:
            st, g = "bald", " · ".join(why)
        elif h_l == 2:
            # „draußen feuchter“ nur, wenn Außenwerte das auch sagen.
            st, g = "feucht", f"Feuchte {round(rh)} % · " + ("draußen feuchter" if aho is not None
                                                             else "Außenwerte fehlen")
        else:
            st, g = "ok", ""
        result.append({
            "k": r["k"], "n": r["n"], "status": st, "grund": g,
            "rh": round(rh) if rh is not None else None, "t": round(t, 1) if t is not None else None,
            "co2": int(co2) if co2 is not None else None, "voc": int(voc) if voc is not None else None,
            "ah": round(ahi, 1) if ahi is not None else None,
            "fenster": wo if r["w"] else None, "offen_min": om, "ziel_min": target,
            "heizt": heizt, "co2_krit": co2 is not None and co2 >= 2500,
        })
    aussen = {"t": to, "rh": rho, "ah": round(aho, 1) if aho is not None else None, "pm25": pm}
    alerts = [f"{r['k']}|{r['status']}" for r in result if r["status"] in ("jetzt", "schliessen")]
    alerts += [f"{r['k']}|co2krit" for r in result if r["co2_krit"]]
    return aussen, result, alerts


def _outdoor_pm(hass: HomeAssistant) -> str | None:
    hits = []
    for st in hass.states.async_all("sensor"):
        if st.attributes.get("device_class") != "pm25" or st.state in BAD:
            continue
        text = f"{st.entity_id} {st.attributes.get('friendly_name', '')}"
        aid = _area_id(hass, st.entity_id)
        area = ar.async_get(hass).async_get_area(aid) if aid else None
        if OUTDOOR.search(text) or re.search(r"wetter|weather", text, re.I) or (area and OUTDOOR.search(area.name)):
            hits.append(st.entity_id)
    return sorted(hits)[0] if hits else None


# ── Solar ────────────────────────────────────────────────────────────────────

async def _energy_prefs(hass: HomeAssistant) -> dict:
    try:
        from homeassistant.components.energy.data import async_get_manager

        return (await async_get_manager(hass)).data or {}
    except Exception:  # noqa: BLE001 – Energie nicht eingerichtet
        return {}


def find_solar(hass: HomeAssistant, prefs: dict) -> dict | None:
    """Quellen für „übriger Sonnenstrom“: {pv, home} oder {grid, battery} (+ soc)."""
    srcs = prefs.get("energy_sources") or []
    pv = [s["stat_rate"] for s in srcs if s.get("type") == "solar" and s.get("stat_rate")]
    grid = [s["stat_rate"] for s in srcs if s.get("type") == "grid" and s.get("stat_rate")]
    for s in srcs:
        if s.get("type") == "grid":
            grid += [p["stat_rate"] for p in (s.get("power") or []) if p.get("stat_rate")]
    bat = [s["stat_rate"] for s in srcs if s.get("type") == "battery" and s.get("stat_rate")]
    soc = next((s["stat_soc"] for s in srcs if s.get("type") == "battery" and s.get("stat_soc")), None)
    if pv and grid:
        return {"mode": "energy", "pv": pv, "grid": grid, "battery": bat, "soc": soc}

    # Kein Leistungssensor in den Energie-Einstellungen: Solarspeicher suchen.
    reg = er.async_get(hass)
    by_key: dict[str, list] = {}
    for e in reg.entities.values():
        if e.domain == "sensor" and e.translation_key and not e.disabled_by:
            by_key.setdefault(e.translation_key, []).append(e)

    def first(keys, platform=None, device=None):
        # Gleiches Gerät zuerst (System-Werte gehören zusammen), dann gleiche Integration.
        for k in keys:
            hits = [e for e in sorted(by_key.get(k, []), key=lambda x: x.entity_id)
                    if (not platform or e.platform == platform) and hass.states.get(e.entity_id) is not None]
            if hits:
                return next((e for e in hits if device and e.device_id == device), hits[0])
        return None

    pv_e = first(PV_KEYS)
    if not pv_e:
        return None
    home_e = first(HOME_KEYS, pv_e.platform, pv_e.device_id)
    if not home_e:
        return None
    soc_e = first(SOC_KEYS, pv_e.platform)
    if soc is None and soc_e:
        soc = soc_e.entity_id
    return {"mode": "device", "pv": [pv_e.entity_id], "home": home_e.entity_id, "soc": soc}


def solar_free(hass: HomeAssistant, src: dict) -> tuple[float | None, float | None]:
    """Übrige Leistung in W (Solar minus Hausbedarf) und Akkustand in %."""
    soc = _num(hass, src.get("soc"))
    if src["mode"] == "energy":
        grid = [_watt(hass, g) for g in src["grid"]]
        if any(g is None for g in grid):
            return None, soc
        bat = [w for w in (_watt(hass, b) for b in src.get("battery") or []) if w is not None]
        # Netz positiv = Bezug, Akku positiv = Entladen → übrig = Einspeisung + Laden.
        return -(sum(grid) + sum(bat)), soc
    pv = [_watt(hass, p) for p in src["pv"]]
    home = _watt(hass, src["home"])
    if any(p is None for p in pv) or home is None:
        return None, soc
    return sum(pv) - home, soc


# ── Laufzeit ─────────────────────────────────────────────────────────────────

class Raumklima:
    """Sucht Quellen, rechnet jede Minute und schaltet Hinweise verzögert."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.rooms: list[dict] = []
        self.solar: dict | None = None
        self.vent: dict[str, Any] = {"count": 0, "aussen": {}, "rooms": [], "alerts": []}
        self.solar_state: dict[str, Any] = {"raw": False, "frei_w": 0, "akku": None}
        self.listeners: list[Callable[[], None]] = []
        self._unsub: list[Callable[[], None]] = []
        self.vent_enabled = False
        self.solar_enabled = False
        self.started = False
        self._ready: list[Callable[[], None]] = []

    def when_ready(self, cb: Callable[[], None]) -> None:
        """cb läuft, sobald die Quellen gesucht sind (sofort, wenn schon geschehen)."""
        if self.started:
            cb()
        else:
            self._ready.append(cb)

    async def async_find(self) -> None:
        self.rooms = find_rooms(self.hass) if self.vent_enabled else []
        self.solar = find_solar(self.hass, await _energy_prefs(self.hass)) if self.solar_enabled else None
        self._out = (_outdoor(self.hass, self.entry, "temperature", OPT_OUT_T),
                     _outdoor(self.hass, self.entry, "humidity", OPT_OUT_RH),
                     _outdoor_pm(self.hass))

    @callback
    def compute(self, *_: Any) -> None:
        if self.vent_enabled:
            aussen, rooms, alerts = evaluate_rooms(self.hass, self.rooms, *self._out)
            self.vent = {"count": sum(1 for r in rooms if r["status"] in ("jetzt", "schliessen")),
                         "aussen": aussen, "rooms": rooms, "alerts": alerts}
        if self.solar_enabled and self.solar:
            free, soc = solar_free(self.hass, self.solar)
            raw = free is not None and ((soc is not None and soc >= 90 and free >= 500) or free >= 1200)
            self.solar_state = {"raw": raw, "frei_w": max(int(round((free or 0) / 10) * 10), 0),
                                "akku": int(soc) if soc is not None else None}
        for cb in list(self.listeners):
            cb()

    async def async_start(self) -> None:
        self.vent_enabled = not _legacy(self.hass, "sensor", LEGACY_VENT)
        self.solar_enabled = not _legacy(self.hass, "binary_sensor", LEGACY_SOLAR)
        await self.async_find()
        self.compute()
        self._unsub.append(async_track_time_interval(self.hass, self.compute, TICK))
        self._unsub.append(async_track_time_interval(self.hass, self._refind, REFRESH))
        self.started = True
        for cb in self._ready:
            cb()
        self._ready.clear()

    async def _refind(self, *_: Any) -> None:
        await self.async_find()

    def stop(self) -> None:
        for u in self._unsub:
            u()
        self._unsub.clear()


class Delayed:
    """Schaltet erst, wenn der Rohwert eine Weile gleich bleibt (wie delay_on/off)."""

    def __init__(self, hass: HomeAssistant, on: timedelta, off: timedelta, changed: Callable[[], None]) -> None:
        self.hass, self.on, self.off, self.changed = hass, on, off, changed
        self.state = False
        self._pending: bool | None = None
        self._cancel: Callable[[], None] | None = None

    def feed(self, raw: bool) -> None:
        if raw == self.state:
            self._clear()
            return
        if self._pending == raw:
            return
        self._clear()
        self._pending = raw

        @callback
        def _fire(_now: Any) -> None:
            self._cancel = None
            self._pending = None
            self.state = raw
            self.changed()

        self._cancel = async_call_later(self.hass, self.on if raw else self.off, _fire)

    def _clear(self) -> None:
        if self._cancel:
            self._cancel()
        self._cancel = None
        self._pending = None


@callback
def async_start(hass: HomeAssistant, entry: ConfigEntry) -> Raumklima:
    """Startet sofort oder, beim Hochfahren, sobald HA läuft (dann gibt es alle Zustände)."""
    rk = Raumklima(hass, entry)
    if hass.state is CoreState.running:
        entry.async_create_background_task(hass, rk.async_start(), "casora_raumklima")
        return rk

    @callback
    def _go(_event: Event) -> None:
        rk._unsub.remove(unsub)
        entry.async_create_background_task(hass, rk.async_start(), "casora_raumklima")

    unsub = hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _go)
    rk._unsub.append(unsub)
    return rk
