"""Stand des Dashboard-Codes für den Hinweis „Casora wurde aktualisiert“ (1.0.5).

Beim Start trägt die Integration die Skripte als Lovelace-Ressourcen ein; der Lader
casora-local.js bekommt ?v=<jüngste Änderung aller Casora-Skripte> (__init__.py).
Ein geöffnetes Dashboard kennt den Stempel, mit dem es geladen wurde, und fragt hier
nach dem aktuellen (casora-core.js, casoraUpdateCheck). Weicht er ab, liegt neuer
Code bereit und der Browser zeigt „Neu laden“.

WebSocket (jeder angemeldete Nutzer, nur lesen):
  casora/version → {"version": "1.0.5", "stamp": "1759600000" | None}
  stamp None: Ressourcen im yaml-Modus (von Hand gepflegt) – dann kein Hinweis.
"""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, VERSION

KEY = "frontend_stamp"


@callback
def set_frontend_stamp(hass: HomeAssistant, stamp: int | None) -> None:
    hass.data.setdefault(DOMAIN, {})[KEY] = str(stamp) if stamp else None


def frontend_info(hass: HomeAssistant) -> dict:
    return {"version": VERSION, "stamp": hass.data.get(DOMAIN, {}).get(KEY)}


@websocket_api.websocket_command({vol.Required("type"): "casora/version"})
@callback
def ws_version(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    connection.send_result(msg["id"], frontend_info(hass))


@callback
def async_setup_frontend_version(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("frontend_version_ws"):
        return
    websocket_api.async_register_command(hass, ws_version)
    hass.data.setdefault(DOMAIN, {})["frontend_version_ws"] = True
