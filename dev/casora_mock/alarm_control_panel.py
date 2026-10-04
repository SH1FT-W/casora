"""Plattform alarm_control_panel der Test-Integration."""
from .entity import setup_domain


async def async_setup_entry(hass, entry, async_add_entities):
    await setup_domain(hass, entry, async_add_entities, "alarm_control_panel")
