"""Waste put out (issue #211): one list for every device, so a phone and a tablet both hide the waste tile.

Tapping the waste tile's icon on the pickup day (or the evening before) confirms "put out"; the tile then hides until
the next pickup. The frontend keys each confirmation by pickup ("2026-11-20|restmüll"), so it expires by itself when
the next pickup comes up. Stored: {"rows": {key: ms}} - the time of the confirmation. Any signed-in user may change it
(it is a household note, like the bell's shared list); rows older than 7 days are dropped, the list is pushed to every
open dashboard.
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

STORE_KEY = "casora_waste_out"
SIGNAL = "casora_waste_out_changed"
KEEP_MS = 7 * 86400 * 1000
MAX_ROWS = 200
MAX_KEY = 200


def clean(rows: Any, now_ms: float | None = None) -> dict:
    """The list as stored: short string keys, positive times, nothing older than 7 days, at most 200 rows."""
    now_ms = time.time() * 1000 if now_ms is None else now_ms
    out: dict[str, float] = {}
    if isinstance(rows, dict):
        for k, v in rows.items():
            if not isinstance(k, str) or not k or len(k) > MAX_KEY or isinstance(v, bool):
                continue
            try:
                t = float(v)
            except (TypeError, ValueError):
                continue
            if t != t or t <= 0 or t < now_ms - KEEP_MS:  # NaN, empty, too old
                continue
            out[k] = t
    if len(out) > MAX_ROWS:
        out = dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True)[:MAX_ROWS])
    return {"rows": out}


class WasteOut:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        # One Store per HA run: after a reload the new list reads a still pending (delayed) save from it.
        dom = hass.data.setdefault(DOMAIN, {})
        if "waste_out_store" not in dom:
            dom["waste_out_store"] = Store(hass, 1, STORE_KEY)
        self.store: Store = dom["waste_out_store"]
        self.data: dict = {"rows": {}}

    async def async_load(self) -> None:
        got = await self.store.async_load()
        if isinstance(got, dict):
            self.data = clean(got.get("rows"))

    @callback
    def set(self, key: str, out: bool, now_ms: float | None = None) -> dict:
        """Mark one pickup as put out (out=True) or take the mark back; only this key changes."""
        now_ms = time.time() * 1000 if now_ms is None else now_ms
        rows = dict(self.data.get("rows") or {})
        if out:
            rows[key] = now_ms
        else:
            rows.pop(key, None)
        self.data = clean(rows, now_ms)
        self.store.async_delay_save(lambda: self.data, 2)
        async_dispatcher_send(self.hass, SIGNAL, self.data)
        return self.data


def _list(hass: HomeAssistant) -> WasteOut | None:
    return hass.data.get(DOMAIN, {}).get("waste_out")


@websocket_api.websocket_command({
    vol.Required("type"): "casora/waste_out/set",
    vol.Required("key"): vol.All(str, vol.Length(min=1, max=MAX_KEY)),
    vol.Required("out"): bool,
})
@callback
def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    lst = _list(hass)
    if lst is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], lst.set(msg["key"], msg["out"]))


@websocket_api.websocket_command({vol.Required("type"): "casora/waste_out/subscribe"})
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


async def async_setup_waste_out(hass: HomeAssistant) -> WasteOut:
    lst = WasteOut(hass)
    await lst.async_load()
    hass.data.setdefault(DOMAIN, {})["waste_out"] = lst
    if not hass.data[DOMAIN].get("waste_out_ws"):
        for cmd in (ws_set, ws_subscribe):
            websocket_api.async_register_command(hass, cmd)
        hass.data[DOMAIN]["waste_out_ws"] = True
    return lst
