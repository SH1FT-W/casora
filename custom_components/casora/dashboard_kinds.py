"""Which dashboards are Casora dashboards, answered on the server (Ladezeit stage 1).

The Studio used to fetch every storage dashboard's whole configuration (2-3 MB each, with all
button-card templates) only to see whether it is a Casora dashboard - 14 dashboards were 28 MB of
JSON on a cold start. HA has the configurations in memory; this reads them there and sends back
only the answer.

WebSocket (admins only, read only):
  casora/dashboards/kinds → {"dashboards": {url_path: {"kind": "wide"|"mobile"|"none"|None,
                                                       "players": [media_player ids]}}}
  kind None: the configuration could not be read (never saved, broken) - the Studio treats it
  as before ("not sure", checked again later). Same rules as the Studio's _isCasoraDash and
  dashboardPlayers (casora-panel.js, casora-panel-personal.js).
"""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

MOBILE_SHELL = "casora_mobile_bg"
ROOM = "casora_room"
PLAYER_TEMPLATES = ("casora_room", "casora_mobile_now_playing", "casora_now_playing")


def dashboard_kind(cfg: Any) -> str:
    """'mobile' (phone shell in the first view), 'wide' (a view starting with a room card) or 'none'."""
    if not isinstance(cfg, dict):
        return "none"
    views = cfg.get("views") if isinstance(cfg.get("views"), list) else []
    first = views[0] if views and isinstance(views[0], dict) else {}
    cards = first.get("cards") if isinstance(first.get("cards"), list) else []
    if any(isinstance(c, dict) and c.get("template") == MOBILE_SHELL for c in cards):
        return "mobile"
    for v in views:
        vc = v.get("cards") if isinstance(v, dict) and isinstance(v.get("cards"), list) else []
        if vc and isinstance(vc[0], dict) and vc[0].get("template") == ROOM:
            return "wide"
    return "none"


def dashboard_players(cfg: Any) -> list[str]:
    """media_player_1…10 of room cards and phone playback, in order of appearance (no state check here)."""
    out: list[str] = []
    views = cfg.get("views") if isinstance(cfg, dict) else None
    # Like the Studio: only dashboards that show a room card or the phone playback at all.
    try:
        text = json.dumps(views or [], ensure_ascii=False)
    except (TypeError, ValueError):
        return out
    if '"casora_room"' not in text and '"casora_mobile_now_playing"' not in text:
        return out

    def walk(o: Any) -> None:
        if isinstance(o, list):
            for x in o:
                walk(x)
            return
        if not isinstance(o, dict):
            return
        tpl = o.get("template")
        tpls = tpl if isinstance(tpl, list) else [tpl]
        var = o.get("variables")
        if isinstance(var, dict) and any(t in PLAYER_TEMPLATES for t in tpls):
            for i in range(1, 11):
                v = var.get(f"media_player_{i}")
                if isinstance(v, str) and v.startswith("media_player.") and v not in out:
                    out.append(v)
        for k, v in o.items():
            if k != "button_card_templates":
                walk(v)

    walk(views or [])
    return out


async def async_dashboard_kinds(hass: HomeAssistant) -> dict[str, dict]:
    """url_path → {kind, players} for every dashboard Lovelace knows (storage and yaml)."""
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    data = hass.data.get(LOVELACE_DATA)
    out: dict[str, dict] = {}
    for url_path, dash in list((data.dashboards if data else {}).items()):
        if not url_path:
            continue
        try:
            cfg = await dash.async_load(False)
        except Exception:  # noqa: BLE001 - never saved or broken: "not sure", like a failed lovelace/config
            out[url_path] = {"kind": None, "players": []}
            continue
        out[url_path] = {"kind": dashboard_kind(cfg), "players": dashboard_players(cfg)}
    return out


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/dashboards/kinds"})
@websocket_api.async_response
async def ws_kinds(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    connection.send_result(msg["id"], {"dashboards": await async_dashboard_kinds(hass)})


@callback
def async_setup_dashboard_kinds(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("dashboard_kinds_ws"):
        return
    websocket_api.async_register_command(hass, ws_kinds)
    hass.data.setdefault(DOMAIN, {})["dashboard_kinds_ws"] = True
