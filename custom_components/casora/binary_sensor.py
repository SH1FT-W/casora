"""Hinweise von Casora: Lüften und Solar-Tipp (Rechnung in raumklima.py)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .raumklima import Delayed, Raumklima


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    rk: Raumklima = hass.data[DOMAIN]["raumklima"]

    @callback
    def _add() -> None:
        ents: list[BinarySensorEntity] = []
        if rk.vent_enabled and rk.rooms:
            ents.append(VentHint(rk))
        if rk.solar_enabled and rk.solar:
            ents.append(SolarTip(rk))
        if ents:
            async_add_entities(ents)

    rk.when_ready(_add)


class _Base(BinarySensorEntity):
    _attr_should_poll = False

    def __init__(self, rk: Raumklima, on: timedelta, off: timedelta) -> None:
        self.rk = rk
        self.delay = Delayed(rk.hass, on, off, self._changed)

    @callback
    def _changed(self) -> None:
        if self.hass:
            self.async_write_ha_state()

    def raw(self) -> bool:
        raise NotImplementedError

    @callback
    def _tick(self) -> None:
        self.delay.feed(self.raw())
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        # Nach einem Neustart sofort den echten Stand zeigen statt 10 Min. zu warten.
        self.delay.state = self.raw()
        self.rk.listeners.append(self._tick)
        self.async_on_remove(lambda: self.rk.listeners.remove(self._tick))
        self.async_on_remove(self.delay._clear)

    @property
    def is_on(self) -> bool:
        return self.delay.state


class VentHint(_Base):
    """An, solange ein Raum gelüftet oder ein Fenster geschlossen werden sollte."""

    _attr_unique_id = f"{DOMAIN}_lueften_hinweis"
    _attr_has_entity_name = True
    _attr_translation_key = "lueften_hinweis"
    _attr_icon = "mdi:window-open-variant"

    def __init__(self, rk: Raumklima) -> None:
        super().__init__(rk, timedelta(minutes=5), timedelta(minutes=2))
        self.entity_id = "binary_sensor.casora_lueften_hinweis"

    def raw(self) -> bool:
        return self.rk.vent["count"] > 0


class SolarTip(_Base):
    """An, wenn genug Sonnenstrom übrig ist, um ein großes Gerät laufen zu lassen."""

    _attr_unique_id = f"{DOMAIN}_solar_tipp"
    _attr_has_entity_name = True
    _attr_translation_key = "solar_tipp"
    _attr_icon = "mdi:solar-power-variant"

    def __init__(self, rk: Raumklima) -> None:
        super().__init__(rk, timedelta(minutes=10), timedelta(minutes=10))
        self.entity_id = "binary_sensor.casora_solar_tipp"

    def raw(self) -> bool:
        return bool(self.rk.solar_state["raw"])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        s = self.rk.solar_state
        return {"frei_w": s["frei_w"], "akku": s["akku"]}
