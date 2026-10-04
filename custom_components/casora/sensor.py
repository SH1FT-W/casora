"""Ergebnis-Sensoren der Casora-KI (gleiche Attribute wie die früheren Template-Sensoren).

Die Sensoren hören auf dieselben Events (casora_*_result) und heißen wie bisher
(sensor.casora_energie_coach …), damit Dashboard und Popups unverändert bleiben.
Laufen alte Casora-Pakete noch, hören die Sensoren zusätzlich auf deren Events.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .ki import FEATURES, LEGACY, LEGACY_UPDATE_EVENTS, OPT_PLAN_UPDATE


def _cut(value: Any, n: int) -> str:
    s = "" if value is None else str(value)
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _list(value: Any, n: int) -> list:
    return list(value or [])[:n] if isinstance(value, (list, tuple)) else []


NAMES = {
    "energie": ("Energie-Coach", "mdi:lightning-bolt-circle"),
    "heizung": ("Heizungs-Coach", "mdi:radiator"),
    "lueftung": ("Lüftungs-Coach", "mdi:weather-windy"),
    "rezept": ("Rezept der Woche", "mdi:chef-hat"),
    "kamera": ("Kamera KI", "mdi:cctv"),
    "pflanzen": ("Pflanzen KI", "mdi:sprout-outline"),
    "update": ("Update KI-Analyse", "mdi:robot-outline"),
    "aquarium": ("Aquarium KI", "mdi:fishbowl-outline"),
    "ebike": ("E-Bike KI", "mdi:bicycle-electric"),
}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([KiSensor(key, entry) for key in FEATURES])

    rk = hass.data[DOMAIN]["raumklima"]

    @callback
    def _vent() -> None:
        if rk.vent_enabled and rk.rooms:
            async_add_entities([VentSensor(rk)])

    # Erst suchen, wenn HA läuft – dann gibt es alle Zustände.
    rk.when_ready(_vent)


class VentSensor(SensorEntity):
    """Lüften: Anzahl Räume, die jetzt gelüftet bzw. geschlossen werden sollen."""

    _attr_should_poll = False
    _attr_unique_id = f"{DOMAIN}_lueften"
    _attr_has_entity_name = True
    _attr_translation_key = "lueften"
    _attr_icon = "mdi:window-open-variant"

    def __init__(self, rk) -> None:
        self.rk = rk
        self.entity_id = "sensor.casora_lueften"

    async def async_added_to_hass(self) -> None:
        self.rk.listeners.append(self.async_write_ha_state)
        self.async_on_remove(lambda: self.rk.listeners.remove(self.async_write_ha_state))

    @property
    def native_value(self) -> int:
        return self.rk.vent["count"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        v = self.rk.vent
        return {"aussen": v["aussen"], "rooms": v["rooms"], "alerts": v["alerts"]}


class KiSensor(RestoreEntity, SensorEntity):
    """Hält das letzte KI-Ergebnis einer Funktion."""

    _attr_should_poll = False

    def __init__(self, key: str, entry: ConfigEntry | None = None) -> None:
        self.key = key
        # Update-Check: Zeitplan als Attribut (zeitplan: off/daily/manual). Bei „off“ zeigt
        # das Update-Popup keine KI-Zeilen und sperrt keine Updates.
        self._plan = (entry.options.get(OPT_PLAN_UPDATE) if entry else None) or "off"
        obj = FEATURES[key]["object"]
        name, icon = NAMES[key]
        self._attr_unique_id = f"{DOMAIN}_{key}"
        # Name aus translations/<sprache>.json (entity.sensor.<key>), deutsch = NAMES.
        self._attr_has_entity_name = True
        self._attr_translation_key = key
        self._attr_icon = icon
        self.entity_id = f"sensor.{obj}"
        self._attrs: dict[str, Any] = {}
        self._state: Any = None
        if key != "rezept":
            self._attr_device_class = SensorDeviceClass.TIMESTAMP

    @property
    def native_value(self):
        return self._state

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if self.key == "update":
            return {**self._attrs, "zeitplan": self._plan}
        return self._attrs

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # War der Name beim Anlegen belegt (z. B. vom alten Template-Sensor), ist er aber
        # inzwischen frei: auf sensor.casora_… zurückbenennen, das Dashboard erwartet ihn.
        want = "sensor." + FEATURES[self.key]["object"]
        reg = er.async_get(self.hass)
        if self.entity_id != want and not reg.async_get(want) and self.hass.states.get(want) is None:
            reg.async_update_entity(self.entity_id, new_entity_id=want)
            return
        last = await self.async_get_last_state()
        if last:
            self._attrs = {k: v for k, v in last.attributes.items()
                           if k not in ("friendly_name", "icon", "device_class")}
            if self.key == "rezept":
                self._state = last.state if last.state not in ("unknown", "unavailable") else None
            else:
                self._state = dt_util.parse_datetime(last.state) if last.state not in ("unknown", "unavailable") else None
        # Eigene Events und – solange alte Casora-Pakete laufen – deren Events.
        events = {FEATURES[self.key]["event"], LEGACY[self.key][1]}
        if self.key == "update":
            events |= {"casora_update_ai_prune", "casora_update_ai_ack"} | set(LEGACY_UPDATE_EVENTS)
        for ev in events:
            self.async_on_remove(self.hass.bus.async_listen(ev, self._event))

    @callback
    def _event(self, event: Event) -> None:
        getattr(self, "_on_" + {"energie": "coach", "heizung": "coach", "lueftung": "coach"}.get(self.key, self.key))(event)
        self.async_write_ha_state()

    # Coaches (Energie, Heizung, Lüftung)
    def _on_coach(self, event: Event) -> None:
        e = event.data
        r = e.get("result") or {}
        a = dict(self._attrs)
        a["status"] = e.get("status", "done")
        if r:
            a["fazit"] = _cut(r.get("fazit"), 300)
            a["erkenntnisse"] = _list(r.get("erkenntnisse"), 5)
            a["tipps"] = _list(r.get("tipps"), 4)
            if self.key == "energie":
                a["ersparnis_eur"] = r.get("ersparnis_eur")
            else:
                a["zustand"] = r.get("zustand", "")
            if self.key == "lueftung":
                rooms = []
                for z in r.get("raeume") or []:
                    p = str(z).split("|")
                    if len(p) >= 3:
                        rooms.append({"n": p[0].strip(), "zustand": p[1].strip().lower(),
                                      "fazit": _cut(p[2].strip(), 240),
                                      "tipp": _cut(p[3].strip(), 240) if len(p) > 3 else ""})
                a["raeume"] = rooms
            a["erstellt"] = dt_util.now().isoformat()
        if e.get("error"):
            a["fehler"] = _cut(e.get("error"), 200)
        elif r:
            a.pop("fehler", None)
        self._attrs = a
        self._state = dt_util.now()

    def _on_rezept(self, event: Event) -> None:
        e = event.data
        r = e.get("result") or {}
        a = dict(self._attrs)
        a["status"] = e.get("status", "done")
        if r:
            self._state = _cut(r.get("name") or self._state, 120)
            a["minuten"] = r.get("minutes")
            a["link"] = r.get("link", "")
            a["warum"] = _cut(r.get("reason"), 300)
            a["zutaten"] = _list(r.get("ingredients"), 10)
            a["erstellt"] = dt_util.now().isoformat()
        self._attrs = a

    def _keyed(self, attr: str, item_id: str, item: dict | None) -> None:
        old = [it for it in (self._attrs.get(attr) or []) if it.get("id") != item_id]
        if item:
            old.append(item)
        self._attrs = {**self._attrs, attr: old}
        self._state = dt_util.now()

    def _on_kamera(self, event: Event) -> None:
        e = event.data
        cid = e.get("entity_id", "")
        if not cid:
            return
        r = e.get("result") or {}
        self._keyed("kameras", cid, {
            "id": cid, "status": e.get("status", "done"),
            "text": _cut(r.get("beschreibung"), 400) if r else "",
            "alert": bool(r.get("auffaellig")) if r else False,
            "at": dt_util.now().isoformat(),
        })

    def _on_pflanzen(self, event: Event) -> None:
        e = event.data
        pid = e.get("plant", "")
        if not pid:
            return
        r = e.get("result") or {}
        self._keyed("pflanzen", pid, {
            "id": pid, "status": e.get("status", "done"),
            "zustand": r.get("zustand", "") if r else "",
            "fazit": _cut(r.get("fazit"), 300) if r else "",
            "punkte": _list(r.get("punkte"), 5) if r else [],
            "tipps": _list(r.get("tipps"), 4) if r else [],
            "at": dt_util.now().isoformat(),
        })

    def _on_aquarium(self, event: Event) -> None:
        """Je Becken (Temperaturfühler als Schlüssel) die letzte Einschätzung."""
        e = event.data
        tid = e.get("temp") or e.get("id") or e.get("entity_id") or ""
        if not tid:
            return
        r = e.get("result") or {}
        self._keyed("becken", tid, {
            "id": tid, "status": e.get("status", "done"),
            "zustand": r.get("zustand", "") if r else "",
            "fazit": _cut(r.get("fazit"), 300) if r else "",
            "punkte": _list(r.get("punkte"), 5) if r else [],
            "tipps": _list(r.get("tipps"), 4) if r else [],
            "at": dt_util.now().isoformat(),
        })

    def _on_ebike(self, event: Event) -> None:
        e = event.data
        r = e.get("result") or {}
        a = dict(self._attrs)
        a["status"] = e.get("status", "done")
        if r:
            a["zustand"] = r.get("zustand", "")
            a["fazit"] = _cut(r.get("fazit"), 300)
            a["punkte"] = _list(r.get("punkte"), 5)
            a["tipps"] = _list(r.get("tipps"), 4)
            a["erstellt"] = dt_util.now().isoformat()
            a.pop("fehler", None)
        if e.get("error"):
            a["fehler"] = _cut(e.get("error"), 200)
        self._attrs = a
        self._state = dt_util.now()

    def _on_update(self, event: Event) -> None:
        """Wie der frühere Template-Sensor: Einträge fallen raus, sobald das Update
        installiert ist oder eine neuere Version erscheint; ack gibt „Aktualisieren“ frei."""
        e = event.data
        # Art aus dem Namensende – gilt für eigene und alte Casora-Events gleichermaßen.
        et = event.event_type.rsplit("_ai_", 1)[-1]
        eid = e.get("entity_id", "")
        out = []
        for it in self._attrs.get("analysen") or []:
            st = self.hass.states.get(it.get("id", ""))
            if not st or st.state != "on" or str(st.attributes.get("latest_version")) != str(it.get("to")):
                continue
            if it.get("id") == eid and et == "ack":
                out.append({**it, "ack": True, "ack_at": dt_util.now().isoformat()})
            elif it.get("id") != eid or et != "result":
                out.append(it)
        if eid and et == "result":
            r = e.get("result") or {}
            out.append({
                "id": eid, "name": e.get("name", eid), "from": str(e.get("from", "")), "to": str(e.get("version", "")),
                "status": e.get("status", "done"), "level": r.get("level", "unknown"),
                "headline": _cut(r.get("headline"), 90), "summary": _cut(r.get("summary"), 600),
                "affects": _list(r.get("affects"), 6), "todo": _list(r.get("todo"), 6),
                "source": str(r.get("source", "") or ""), "error": _cut(e.get("error"), 200),
                "ack": False, "checked": dt_util.now().isoformat(),
            })
        self._attrs = {**self._attrs, "analysen": out}
        self._state = dt_util.now()
