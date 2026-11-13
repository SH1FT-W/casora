"""Messages removed from the bell for all users (Studio: Notifications › "Removed for all users").

Off (default), each HA user's bell keeps its own list in HA's user data (frontend/set_user_data). On, the bell
reads and writes this one list instead: {"all": ms, "rows": {key: ms}} - a message stays removed up to that time,
"all" is "Remove all". Any signed-in user may change it (the dashboard owner chose to share it); the list is small,
pruned after 30 days and pushed to every open bell.
"""

from __future__ import annotations

import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORE_KEY = "casora_notify_hidden"
SIGNAL = "casora_notify_hidden_changed"
KEEP_MS = 30 * 86400 * 1000
MAX_ROWS = 2000
MAX_KEY = 300


def clean(all_ms: Any, rows: Any, now_ms: float | None = None) -> dict:
    """The list as stored: numbers only, short keys, nothing older than 30 days (unless "all" covers it anyway)."""
    now_ms = time.time() * 1000 if now_ms is None else now_ms
    try:
        a = float(all_ms or 0)
    except (TypeError, ValueError):
        a = 0.0
    if a != a or a < 0:  # NaN
        a = 0.0
    out: dict[str, float] = {}
    if isinstance(rows, dict):
        for k, v in rows.items():
            if not isinstance(k, str) or not k or len(k) > MAX_KEY or isinstance(v, bool):
                continue
            try:
                t = float(v)
            except (TypeError, ValueError):
                continue
            if t != t or t <= 0 or (t < now_ms - KEEP_MS and t <= a):
                continue
            out[k] = t
    if len(out) > MAX_ROWS:
        out = dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True)[:MAX_ROWS])
    return {"all": a, "rows": out}


class HiddenList:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store = Store(hass, 1, STORE_KEY)
        self.data: dict = {"all": 0.0, "rows": {}}

    async def async_load(self) -> None:
        got = await self.store.async_load()
        if isinstance(got, dict):
            self.data = clean(got.get("all"), got.get("rows"))

    @callback
    def set(self, all_ms: Any, rows: Any) -> dict:
        self.data = clean(all_ms, rows)
        self.store.async_delay_save(lambda: self.data, 2)
        async_dispatcher_send(self.hass, SIGNAL, self.data)
        return self.data


def _list(hass: HomeAssistant) -> HiddenList | None:
    return hass.data.get(DOMAIN, {}).get("notify_hidden")


@websocket_api.websocket_command({
    vol.Required("type"): "casora/notify_hidden/set",
    vol.Optional("all"): vol.Any(None, int, float),
    vol.Optional("rows"): vol.Any(None, dict),
})
@callback
def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    lst = _list(hass)
    if lst is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], lst.set(msg.get("all"), msg.get("rows")))


@websocket_api.websocket_command({vol.Required("type"): "casora/notify_hidden/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The list now and after every change."""
    lst = _list(hass)
    if lst is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return

    @callback
    def changed(data: dict) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], data))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL, changed)
    connection.send_result(msg["id"])
    changed(lst.data)


async def async_setup_notify_hidden(hass: HomeAssistant) -> HiddenList:
    lst = HiddenList(hass)
    await lst.async_load()
    hass.data.setdefault(DOMAIN, {})["notify_hidden"] = lst
    if not hass.data[DOMAIN].get("notify_hidden_ws"):
        for cmd in (ws_set, ws_subscribe):
            websocket_api.async_register_command(hass, cmd)
        hass.data[DOMAIN]["notify_hidden_ws"] = True
    return lst
