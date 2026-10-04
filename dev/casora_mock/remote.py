"""Plattform remote der Test-Integration."""
from .entity import setup_domain


async def async_setup_entry(hass, entry, async_add_entities):
    await setup_domain(hass, entry, async_add_entities, "remote")
