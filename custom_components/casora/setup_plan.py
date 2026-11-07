"""Service casora.setup_plan: an external assistant proposes tiles, the Studio applies them (issue #131, step 2).

Response only (SupportsResponse.ONLY), admins only. It writes no dashboard: it checks the proposal against the
same data as casora.setup_overview, answers with a preview and keeps the valid part as the pending plan (one at
a time, in Casora's own store). The Studio shows the pending plan as a suggestion; applying it goes through the
device assistant (casora-panel-assist.js), so the tiles are an ordinary unsaved change the user saves.

  casora.setup_plan {
    "dashboard"?: url_path (default: the only Casora dashboard, else the first by url_path),
    "rooms": [{"area_id", "devices": [{"device_id", "name"? (tile name), "tile"? (tile type)}]}],
  } → {
    "plan_id" (None when nothing is valid; then no plan is pending), "dashboard",
    "rooms": [{"area_id", "area", "tiles": [{"device_id", "device", "main_entity", "tile", "name"}]}],
    "skipped": [{"device_id", "area_id", "reason", "detail"}],
    "tiles", "next",
  }

Reasons: unknown_area, unknown_device, duplicate (the device already got a tile earlier in the plan), entity_in_plan (another device of the plan brings the same main entity), already_on_tile (on a tile
of that dashboard, rule as in setup_overview.on_tile), no_main_entity (nothing Casora can put on a tile; service
devices, disabled devices and devices without visible entities too), unknown_tile (not in PLAN_TILES),
tile_does_not_fit (the device has no entity for that tile type).

Main entity: without "tile" the suggestion of setup_overview.suggest_tile. With "tile": the suggestion when the
type is the same (washer and dryer count as the same, WashData calls both washer_state), else for a tile in
TILE_DOMAIN the first visible entity of its domain (cameras named like a map left out); appliance tiles only
through the suggestion (they need the finders' main entity). One tile per device: a lamp with two channels gets
one tile here, the device assistant would offer two.

Websocket (admins): casora/setup_plan/get → {"plan": pending plan or None}; casora/setup_plan/clear (optional
plan_id: only that plan) → {"cleared": bool}.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import live_finder as lf
from . import setup_overview as so
from .const import DOMAIN

SERVICE = "setup_plan"
STORE_KEY = "casora.setup_plan"

# Tile types an assistant may name, with the domain of their main entity (Studio TILE_TYPES domains).
TILE_DOMAIN: dict[str, str] = {
    "light": "light", "thermostat": "climate", "fbh": "climate", "media": "media_player", "fan": "fan",
    "air_purifier": "fan", "cover": "cover", "lock": "lock", "vacuum": "vacuum", "humidifier": "humidifier",
    "casora_camera": "camera", "casora_alarm": "alarm_control_panel", "casora_lawn_mower": "lawn_mower",
    "casora_switch": "switch",
}
# Appliance tiles: only when setup_overview suggests them for the device (main entity from the finders).
APPLIANCE = frozenset(("casora_washer", "casora_dryer", "casora_dishwasher", "casora_oven", "casora_fridge",
                       "casora_3d_printer"))
LAUNDRY = frozenset(("casora_washer", "casora_dryer"))
PLAN_TILES = frozenset(TILE_DOMAIN) | APPLIANCE

DETAIL = {
    "unknown_area": "No Home Assistant area with this area_id.",
    "unknown_device": "No device with this device_id.",
    "duplicate": "The device already has a tile earlier in this plan.",
    "already_on_tile": "The device is already on a tile of this dashboard.",
    "entity_in_plan": "Another device in this plan already brings the same entity. Pick another tile type or leave it out.",
    "no_main_entity": "The device has nothing Casora can put on a tile.",
    "unknown_tile": "Unknown tile type. Leave tile out for Casora's suggestion.",
    "tile_does_not_fit": "The device has no entity for this tile type. Leave tile out for Casora's suggestion.",
}
NEXT = ("Nothing is changed yet. Open the Casora Studio: it shows this suggestion, the user checks it in the "
        "device assistant, adds the tiles and saves.")

_TEXT = vol.All(cv.string, vol.Length(max=120))
SCHEMA = vol.Schema({
    vol.Optional("dashboard"): cv.string,
    vol.Required("rooms"): vol.All(cv.ensure_list, [vol.Schema({
        vol.Required("area_id"): cv.string,
        vol.Optional("devices", default=list): vol.All(cv.ensure_list, [vol.Schema({
            vol.Required("device_id"): cv.string,
            vol.Optional("name"): _TEXT,
            vol.Optional("tile"): cv.string,
        }, extra=vol.ALLOW_EXTRA)]),
    }, extra=vol.ALLOW_EXTRA)]),
}, extra=vol.ALLOW_EXTRA)  # extra data is ignored (some MCP clients always send a target), as for setup_overview


@dataclass
class Dev:
    """What the plan needs of one device (registry and states already read)."""

    name: str
    visible: list[lf.Ent] = field(default_factory=list)
    suggestion: tuple[str, str] | None = None
    usable: bool = True  # False: service device, disabled, hub child without anything to operate


def main_entity(tile: str | None, dev: Dev) -> tuple[str, str] | str:
    """(tile, main entity) for a device, or the reason it cannot get that tile."""
    if not dev.usable:
        return "no_main_entity"
    sug = dev.suggestion
    if not tile:
        return sug if sug else "no_main_entity"
    if tile not in PLAN_TILES:
        return "unknown_tile"
    if sug and (sug[0] == tile or (sug[0] in LAUNDRY and tile in LAUNDRY)):
        return tile, sug[1]
    dom = TILE_DOMAIN.get(tile)
    if dom:
        for e in dev.visible:
            if e.domain != dom:
                continue
            if dom == "camera" and (so.MAP_NAME.search(e.entity_id.partition(".")[2]) or so.MAP_NAME.search(e.key or "")):
                continue
            return tile, e.entity_id
    return "tile_does_not_fit"


def make_plan(rooms_in: list[dict], areas: dict[str, str], devs: dict[str, Dev],
              used: set[str]) -> tuple[list[dict], list[dict]]:
    """(rooms with tiles, skipped) for a proposal; pure, so it can be tested without HA."""
    rooms: list[dict] = []
    skipped: list[dict] = []
    seen: set[str] = set()
    taken: set[str] = set()  # main entities in this plan

    def skip(dev_id: str, area_id: str, reason: str) -> None:
        skipped.append({"device_id": dev_id, "area_id": area_id, "reason": reason, "detail": DETAIL[reason]})

    for r in rooms_in:
        area_id = r["area_id"]
        tiles: list[dict] = []
        for item in r.get("devices") or []:
            dev_id = item["device_id"]
            if area_id not in areas:
                skip(dev_id, area_id, "unknown_area")
                continue
            dev = devs.get(dev_id)
            if dev is None:
                skip(dev_id, area_id, "unknown_device")
                continue
            if dev_id in seen:
                skip(dev_id, area_id, "duplicate")
                continue
            if dev.usable and so.on_tile(dev_id, dev.visible, used):
                skip(dev_id, area_id, "already_on_tile")
                continue
            hit = main_entity(item.get("tile"), dev)
            if isinstance(hit, str):
                skip(dev_id, area_id, hit)
                continue
            tile, main = hit
            if main in used:
                skip(dev_id, area_id, "already_on_tile")
                continue
            if main in taken:  # another device of this plan already brings that entity
                skip(dev_id, area_id, "entity_in_plan")
                continue
            taken.add(main)
            seen.add(dev_id)
            name = str(item.get("name") or "").strip() or dev.name
            tiles.append({"device_id": dev_id, "device": dev.name, "main_entity": main, "tile": tile, "name": name})
        if not tiles:
            continue
        same = next((x for x in rooms if x["area_id"] == area_id), None)  # the same area twice: one room
        if same:
            same["tiles"].extend(tiles)
        else:
            rooms.append({"area_id": area_id, "area": areas[area_id], "tiles": tiles})
    return rooms, skipped


def _store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "setup_plan_store" not in data:
        data["setup_plan_store"] = Store(hass, 1, STORE_KEY)
    return data["setup_plan_store"]


async def async_pending(hass: HomeAssistant) -> dict | None:
    saved = await _store(hass).async_load()
    return saved.get("plan") if isinstance(saved, dict) else None


async def async_set_pending(hass: HomeAssistant, plan: dict | None) -> None:
    await _store(hass).async_save({"plan": plan})


async def _devices(hass: HomeAssistant, wanted: set[str]) -> dict[str, Dev]:
    from homeassistant.helpers import device_registry as dr

    by_dev = so.entities_by_device(hass)
    out: dict[str, Dev] = {}
    reg = dr.async_get(hass)
    # Only the devices the plan names: the tile suggestion is not cheap, a house has hundreds of devices.
    for d in (reg.async_get(x) for x in wanted):
        if d is None:
            continue
        name = d.name_by_user or d.name or ""
        ents, hidden, visible = so.device_entities(hass, by_dev.get(d.id, []))
        usable = (not d.disabled_by and d.entry_type is None and bool(visible)
                  and not (d.via_device_id and not any(e.domain in so.VIA_DOMAINS for e in visible)))
        out[d.id] = Dev(name, visible, so.device_suggestion(hass, d, name, ents, hidden) if usable else None, usable)
    return out


async def async_setup_plan(hass: HomeAssistant, data: dict) -> dict[str, Any]:
    """The answer of casora.setup_plan (see module docstring); stores the valid part as the pending plan."""
    from homeassistant.helpers import area_registry as ar

    refs = await so.async_casora_refs(hass)
    if not refs:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="setup_plan_no_dashboard")
    dashboard = data.get("dashboard") or next(iter(refs))
    if dashboard not in refs:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="setup_plan_not_casora",
            translation_placeholders={"dashboard": dashboard, "dashboards": ", ".join(refs)})
    areas = {a.id: a.name for a in ar.async_get(hass).async_list_areas()}
    wanted = {str(i.get("device_id")) for r in data["rooms"] for i in (r.get("devices") or [])}
    rooms, skipped = make_plan(data["rooms"], areas, await _devices(hass, wanted), refs[dashboard])
    n = sum(len(r["tiles"]) for r in rooms)
    plan_id = uuid.uuid4().hex if n else None
    # The latest proposal replaces the pending one, also when nothing of it is valid.
    await async_set_pending(hass, {"plan_id": plan_id, "created": dt_util.utcnow().isoformat(),
                                   "dashboard": dashboard, "rooms": rooms} if n else None)
    return {"plan_id": plan_id, "dashboard": dashboard, "rooms": rooms, "skipped": skipped, "tiles": n,
            "next": NEXT if n else "Nothing to add, so no suggestion is pending. See skipped."}


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/setup_plan/get"})
@websocket_api.async_response
async def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    connection.send_result(msg["id"], {"plan": await async_pending(hass)})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/setup_plan/clear", vol.Optional("plan_id"): str})
@websocket_api.async_response
async def ws_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    plan = await async_pending(hass)
    hit = bool(plan) and (not msg.get("plan_id") or plan.get("plan_id") == msg["plan_id"])
    if hit:
        await async_set_pending(hass, None)
    connection.send_result(msg["id"], {"cleared": hit})


@callback
def _register_ws(hass: HomeAssistant) -> None:
    if hass.data.setdefault(DOMAIN, {}).get("setup_plan_ws"):
        return
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_clear)
    hass.data[DOMAIN]["setup_plan_ws"] = True


async def async_setup_setup_plan(hass: HomeAssistant) -> None:
    async def handle(call: ServiceCall) -> ServiceResponse:
        return await async_setup_plan(hass, dict(call.data))

    # Admins only: it reads every dashboard, like setup_overview.
    async_register_admin_service(hass, DOMAIN, SERVICE, handle, SCHEMA, supports_response=SupportsResponse.ONLY)
    _register_ws(hass)
