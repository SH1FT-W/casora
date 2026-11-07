"""casora.setup_plan against HA's real registries (issue #131, step 2).

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_setup_plan.py -q

The invented house of test_setup_overview.py. A plan with a valid tile, a renamed lamp, a device already on a
tile, a hub child without anything to operate and an unknown area: the answer previews the valid part, the
admin websocket returns it as the pending plan and clears it; no dashboard is saved.
"""

from __future__ import annotations

import copy

from test_setup_overview import DOMAIN, _house

from homeassistant.core import HomeAssistant


async def test_setup_plan_preview_and_pending(hass: HomeAssistant, hass_ws_client) -> None:
    from custom_components.casora.setup_plan import async_setup_setup_plan  # noqa: PLC0415

    h = await _house(hass)
    before = copy.deepcopy(h.casora)
    await async_setup_setup_plan(hass)
    plan = {"entity_id": "all", "rooms": [
        {"area_id": h.wohnen.id, "devices": [{"device_id": h.thermo.id},
                                             {"device_id": h.loose.id, "name": "Leselicht"},
                                             {"device_id": h.child.id}]},
        {"area_id": h.kueche.id, "devices": [{"device_id": h.lamp.id}, {"device_id": h.robby.id, "tile": "light"}]},
        {"area_id": "gibt_es_nicht", "devices": [{"device_id": h.plug.id}]},
    ]}
    res = await hass.services.async_call(DOMAIN, "setup_plan", plan, blocking=True, return_response=True)

    assert res["dashboard"] == "casora-home" and res["tiles"] == 2 and res["plan_id"]
    assert res["rooms"] == [{"area_id": h.wohnen.id, "area": "Wohnzimmer", "tiles": [
        {"device_id": h.thermo.id, "device": "Heizkörper", "main_entity": h.thermo_e, "tile": "thermostat",
         "name": "Heizkörper"},
        {"device_id": h.loose.id, "device": "Wohnzimmer Stehlampe", "main_entity": h.loose_e, "tile": "light",
         "name": "Leselicht"},
    ]}]
    why = {s["device_id"]: s["reason"] for s in res["skipped"]}
    assert why == {h.child.id: "no_main_entity", h.lamp.id: "already_on_tile", h.robby.id: "tile_does_not_fit",
                   h.plug.id: "unknown_area"}

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "casora/setup_plan/get"})
    got = (await ws.receive_json())["result"]["plan"]
    assert got["plan_id"] == res["plan_id"] and got["dashboard"] == "casora-home" and got["rooms"] == res["rooms"]
    await ws.send_json({"id": 2, "type": "casora/setup_plan/clear", "plan_id": "anderer"})
    assert (await ws.receive_json())["result"] == {"cleared": False}
    await ws.send_json({"id": 3, "type": "casora/setup_plan/clear", "plan_id": res["plan_id"]})
    assert (await ws.receive_json())["result"] == {"cleared": True}
    await ws.send_json({"id": 4, "type": "casora/setup_plan/get"})
    assert (await ws.receive_json())["result"] == {"plan": None}

    # Writes no dashboard.
    assert h.casora == before and all(d.saved == 0 for d in h.dashes.values())
