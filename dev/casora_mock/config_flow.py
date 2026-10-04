"""Einziger Eintrag für die Test-Integration – wird per YAML-Import angelegt."""
from homeassistant import config_entries

from . import DOMAIN


class CasoraMockFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_import(self, _data=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="Casora Mock", data={})

    async def async_step_user(self, _data=None):
        return await self.async_step_import()
