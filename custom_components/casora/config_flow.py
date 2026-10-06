"""Config flow für Casora."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow

from .const import DOMAIN, PANEL_TITLE
from .options import PLAN_KEYS, OptionsError, build_options, options_schema


class CasoraConfigFlow(ConfigFlow, domain=DOMAIN):
    """Single-instance flow that just adds the panel."""

    VERSION = 1
    # 2 (1.0.3): KI-Zeitpläne je Funktion statt ki_auto. Neue Einträge starten ohne
    # Zeitpläne (alles aus); ältere übernimmt async_migrate_entry (__init__.py).
    MINOR_VERSION = 2

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is None:
            return self.async_show_form(step_id="user")

        return self.async_create_entry(title=PANEL_TITLE, data={})

    @staticmethod
    def async_get_options_flow(entry):
        return CasoraOptionsFlow()


class CasoraOptionsFlow(OptionsFlow):
    """KI-Einstellungen (KI, Außensensoren, Strompreis, Hinweise, Zeitpläne), Lüften-Push.

    Dasselbe Schema nutzt das Studio unter „Einstellungen“ (options.py).
    """

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            # Wie das Studio: leere Felder nicht speichern (dann gilt die automatische Wahl),
            # eigene Zeiten der Zeitpläne prüfen.
            try:
                return self.async_create_entry(
                    data=build_options(self.hass, dict(self.config_entry.options), user_input))
            except OptionsError as err:
                # „Ungültige Zeit“ nur unter einem Zeitplan-Feld, sonst „Ungültige Eingabe“.
                errors[err.path or "base"] = "invalid_plan" if err.path in PLAN_KEYS else "invalid"
        schema = options_schema(self.hass, user_input or self.config_entry.options)
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
