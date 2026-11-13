"""casora.notify_hidden: the bell's list of removed messages, shared by all users (Hemma round #11d).

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_notify_hidden.py -q

A non-admin user writes the list, a second connection gets it pushed; values are cleaned (no strings, no NaN,
nothing older than 30 days that "all" covers) and the list survives a reload from the store.
"""

from __future__ import annotations

import time

from homeassistant.core import HomeAssistant


async def test_shared_list_push_and_clean(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token) -> None:
    from custom_components.casora.notify_hidden import async_setup_notify_hidden, clean  # noqa: PLC0415

    await async_setup_notify_hidden(hass)
    now = time.time() * 1000
    watcher = await hass_ws_client(hass)
    await watcher.send_json({"id": 1, "type": "casora/notify_hidden/subscribe"})
    assert (await watcher.receive_json())["success"]
    assert (await watcher.receive_json())["event"] == {"all": 0.0, "rows": {}}

    # A user without admin rights removes for everyone.
    child = await hass_ws_client(hass, hass_read_only_access_token)
    rows = {"lock.door@1": now - 1000, "bad": "x", "old": now - 40 * 86400e3, "": now}
    await child.send_json({"id": 1, "type": "casora/notify_hidden/set", "all": now - 50 * 86400e3, "rows": rows})
    res = await child.receive_json()
    assert res["success"], res
    assert res["result"]["rows"] == {"lock.door@1": now - 1000, "old": now - 40 * 86400e3}
    assert (await watcher.receive_json())["event"]["rows"] == res["result"]["rows"]

    # "all" covers an old row: it goes.
    assert clean(now, {"old": now - 40 * 86400e3, "new": now - 1}, now) == {"all": now, "rows": {"new": now - 1}}
    assert clean(float("nan"), {"x": True}, now) == {"all": 0.0, "rows": {}}

    # Reload: the store keeps it.
    lst = hass.data["casora"]["notify_hidden"]
    await lst.store.async_save(lst.data)
    again = await async_setup_notify_hidden(hass)
    assert again.data["rows"] == res["result"]["rows"]
