"""Casora's own actions for the dashboard cards (former scripts in scripts.yaml).

Up to 26.10 Casora appended four scripts to the user's scripts.yaml. They are services of the
integration now, so nothing has to exist in the config folder:

  casora.light_smart_toggle        (script.casora_light_smart_toggle)
  casora.thermostat_overlay_toggle (script.casora_thermostat_overlay_toggle)
  casora.actions_overlay_toggle    (script.casora_actions_overlay_toggle)
  casora.restart_toggle            (script.casora_restart_toggle)

Same behaviour as the scripts, including their modes: the light toggle is queued (at most 5 waiting),
the overlay toggles drop taps for 400 ms after one ran (mode single + delay), the restart toggle drops
taps while one runs. Every call keeps the caller's context, so HA's permission checks apply as before.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

LIGHT_TOGGLE = "light_smart_toggle"
THERMOSTAT_TOGGLE = "thermostat_overlay_toggle"
ACTIONS_TOGGLE = "actions_overlay_toggle"
RESTART_TOGGLE = "restart_toggle"
SERVICES = (LIGHT_TOGGLE, THERMOSTAT_TOGGLE, ACTIONS_TOGGLE, RESTART_TOGGLE)
# The scripts these services replace (helfer.py names leftovers in a repair notice).
FORMER_SCRIPTS = tuple(f"script.casora_{s}" for s in SERVICES)

THERMOSTAT_OVERLAY = ("input_boolean.casora_thermostat_overlay", "input_text.casora_thermostat_active_entity")
ACTIONS_OVERLAY = ("input_boolean.casora_actions_overlay", "input_text.casora_actions_active_entity")
OVERLAY_COOLDOWN = 0.4
LIGHT_QUEUE_MAX = 5


def _domain(domain: str):
    def check(value: Any) -> str:
        value = cv.entity_id(value)
        if not value.startswith(domain + "."):
            raise vol.Invalid(f"expected a {domain} entity")
        return value
    return check


LIGHT_SCHEMA = vol.Schema({vol.Required("light_entity"): _domain("light")})
THERMOSTAT_SCHEMA = vol.Schema({vol.Required("thermostat_entity_id"): vol.All(cv.string, vol.Length(max=255))})
ACTIONS_SCHEMA = vol.Schema({vol.Required("actions_entity_id"): vol.All(cv.string, vol.Length(max=255))})
RESTART_SCHEMA = vol.Schema({
    vol.Required("button_entity"): _domain("button"),
    vol.Required("helper_entity"): _domain("input_boolean"),
    vol.Optional("done_entity"): vol.Any(None, "", _domain("input_boolean")),
})


def restore_scene_id(light_entity: str) -> str:
    """Scene that remembers which lamps were on (same id as the former script)."""
    return "casora_restore_" + light_entity.replace(".", "_")


class Actions:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._light_lock = asyncio.Lock()
        self._light_waiting = 0
        self._overlay_until: dict[str, float] = {}
        self._restart_busy = False

    async def _call(self, call: ServiceCall, domain: str, service: str, data: dict) -> None:
        await self.hass.services.async_call(domain, service, data, blocking=True, context=call.context)

    def _on(self, entity_id: str) -> bool:
        st = self.hass.states.get(entity_id)
        return st is not None and st.state == "on"

    async def light_toggle(self, call: ServiceCall) -> None:
        """On: remember the lamps that are on (group members one by one), then off. Off: restore, else on."""
        if self._light_waiting >= LIGHT_QUEUE_MAX:
            _LOGGER.warning("Casora: %s dropped, %d calls already waiting", LIGHT_TOGGLE, LIGHT_QUEUE_MAX)
            return
        self._light_waiting += 1
        try:
            async with self._light_lock:
                await self._light_toggle(call, call.data["light_entity"])
        finally:
            self._light_waiting -= 1

    async def _light_toggle(self, call: ServiceCall, light: str) -> None:
        scene_id = restore_scene_id(light)
        st = self.hass.states.get(light)
        if st is not None and st.state == "on":
            members = st.attributes.get("entity_id")
            snap = list(members) if isinstance(members, (list, tuple)) and members else [light]
            await self._call(call, "scene", "create", {"scene_id": scene_id, "snapshot_entities": snap})
            try:
                await self._call(call, "light", "turn_off", {"entity_id": light})
            except HomeAssistantError as err:  # the script had continue_on_error here
                _LOGGER.warning("Casora: %s could not be turned off: %s", light, err)
            return
        if self.hass.states.get(f"scene.{scene_id}") is not None:
            await self._call(call, "scene", "turn_on", {"entity_id": f"scene.{scene_id}"})
        else:
            await self._call(call, "light", "turn_on", {"entity_id": light})

    async def _overlay(self, call: ServiceCall, name: str, entities: tuple[str, str], key: str) -> None:
        """Tap a card: open its controls; same card again: close; another card: switch to it."""
        now = time.monotonic()
        if now < self._overlay_until.get(name, 0):
            return
        self._overlay_until[name] = float("inf")
        boolean, text = entities
        try:
            cur = self.hass.states.get(text)
            if self._on(boolean) and cur is not None and cur.state == key:
                await self._call(call, "input_boolean", "turn_off", {"entity_id": boolean})
            else:
                await self._call(call, "input_text", "set_value", {"entity_id": text, "value": key})
                await self._call(call, "input_boolean", "turn_on", {"entity_id": boolean})
        finally:
            self._overlay_until[name] = time.monotonic() + OVERLAY_COOLDOWN

    async def thermostat_toggle(self, call: ServiceCall) -> None:
        await self._overlay(call, THERMOSTAT_TOGGLE, THERMOSTAT_OVERLAY, call.data["thermostat_entity_id"])

    async def actions_toggle(self, call: ServiceCall) -> None:
        await self._overlay(call, ACTIONS_TOGGLE, ACTIONS_OVERLAY, call.data["actions_entity_id"])

    async def restart_toggle(self, call: ServiceCall) -> None:
        """First tap: confirm mode. Second tap: press the button, show "done". Tap on "done": dismiss."""
        if self._restart_busy:
            return
        self._restart_busy = True
        try:
            button, helper = call.data["button_entity"], call.data["helper_entity"]
            done = call.data.get("done_entity") or ""
            if done and self._on(done):
                await self._call(call, "input_boolean", "turn_off", {"entity_id": done})
            elif self._on(helper):
                await self._call(call, "button", "press", {"entity_id": button})
                if done:
                    await self._call(call, "input_boolean", "turn_on", {"entity_id": done})
                await self._call(call, "input_boolean", "turn_off", {"entity_id": helper})
            else:
                await self._call(call, "input_boolean", "turn_on", {"entity_id": helper})
        finally:
            self._restart_busy = False


def async_setup_actions(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, LIGHT_TOGGLE):
        return
    a = Actions(hass)
    hass.services.async_register(DOMAIN, LIGHT_TOGGLE, a.light_toggle, LIGHT_SCHEMA)
    hass.services.async_register(DOMAIN, THERMOSTAT_TOGGLE, a.thermostat_toggle, THERMOSTAT_SCHEMA)
    hass.services.async_register(DOMAIN, ACTIONS_TOGGLE, a.actions_toggle, ACTIONS_SCHEMA)
    hass.services.async_register(DOMAIN, RESTART_TOGGLE, a.restart_toggle, RESTART_SCHEMA)
