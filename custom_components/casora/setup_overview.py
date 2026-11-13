"""Service casora.setup_overview: what an external assistant needs to set up Casora (issue #131, step 1).

Read only, response only (SupportsResponse.ONLY), admins only. Any MCP server that can call Home Assistant
services (e.g. ha-mcp) can use it instead of Casora's own AI setup, which needs an ai_task entity. Assigning
devices to areas is Home Assistant's own job (device/entity registry), so this service only reports.

  casora.setup_overview → {
    "rooms": [{"area_id", "name", "floor"}],
    "unassigned_devices": [{"device_id", "name", "suggested_area"?}],
    "devices_without_tile": [{"device_id", "name", "area", "main_entity", "suggested_tile"}],
    "dashboards": [url_path],
  }

"On a tile": an entity of the device (other than a sensor/binary_sensor, which land in a room's lists on their
own), the suggested main entity (appliance tiles show a sensor) or the device id appears anywhere in the views of a
Casora dashboard (dashboard_kinds.dashboard_kind). Like the Studio's device assistant (casora-panel-assist.js
usedEntities/suggest), except that any id-shaped text counts, also inside card JS, so it errs towards "on a tile".
The default dashboard (no url_path) is not read, as in dashboard_kinds.

Suggested tile (suggest_tile): a slim, readable version of the Studio's suggest(), not a copy of it.
  1. Ovens, robot vacuums, 3D printers, washers, dryers, dishwashers and fridges through live_finder (the Python
     twin of the dashboard finder, kept in parity by dev/unit/live_finder_test.py).
  2. A fan named like an air purifier → air_purifier.
  3. Otherwise the first domain of BY_DOMAIN the device has (same order as the Studio).
Limits: no coffee machines, kettles or other Community cards (they need the Studio's finders or are switched on
per install); one tile per device (the Studio makes one per light channel); cameras are skipped only when they
are named like a map or sit on a vacuum/printer (a separate dock device is not checked); the same washer from two
integrations (maker + WashData) may appear twice; devices without any match are not listed. The Studio stays the
reference: it may suggest more, never a type this table names that does not exist
(dev/unit/setup_overview_test.py checks every id against the Studio's tile types).
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.helpers.service import async_register_admin_service

from . import live_finder as lf
from .const import DOMAIN
from .dashboard_kinds import UNREADABLE, async_dashboard_configs, dashboard_kind

SERVICE = "setup_overview"

# Tile type per domain; order = priority when a device has several (as BY_DOMAIN in casora-panel-assist.js).
BY_DOMAIN: list[tuple[str, str]] = [
    ("climate", "thermostat"), ("vacuum", "vacuum"), ("lawn_mower", "casora_lawn_mower"),
    ("alarm_control_panel", "casora_alarm"), ("lock", "lock"), ("cover", "cover"), ("media_player", "media"),
    ("camera", "casora_camera"), ("fan", "fan"), ("humidifier", "humidifier"), ("light", "light"),
]
# live_finder kinds → tile type.
BY_KIND: dict[str, str] = {
    "washer": "casora_washer", "dryer": "casora_dryer", "dishwasher": "casora_dishwasher",
    "vacuum": "vacuum", "printer": "casora_3d_printer",
}
OVEN, FRIDGE, AIR_PURIFIER = "casora_oven", "casora_fridge", "air_purifier"
# Every tile type id this module can answer (checked against the Studio by the unit test).
TILE_IDS = frozenset([t for _, t in BY_DOMAIN] + list(BY_KIND.values()) + [OVEN, FRIDGE, AIR_PURIFIER])

AIR_PURIFIER_NAME = re.compile(r"luftrein|purifier|air ?clean", re.I)
MAP_NAME = re.compile(r"(^|_)(map|maps|karte|karten)(_|$)|karte(_\d+)?$")
# Devices behind a hub only count when they have something to operate (as VIA_DOMAINS in the Studio).
VIA_DOMAINS = frozenset(("light", "cover", "lock", "climate", "fan", "humidifier", "media_player", "vacuum",
                         "lawn_mower"))
ENTITY_ID = re.compile(r"\b[a-z_]+\.[a-z0-9_]+\b")
DEVICE_ID = re.compile(r"\b[0-9a-f]{32}\b")


def _norm(s: Any) -> str:
    s = str(s or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return s


def collect_refs(cfg: Any) -> set[str]:
    """Entity and device ids mentioned in a dashboard's views (templates left out)."""
    refs: set[str] = set()

    def walk(o: Any) -> None:
        if isinstance(o, str):
            refs.update(ENTITY_ID.findall(o))
            refs.update(DEVICE_ID.findall(o))
        elif isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            for k, v in o.items():
                if k != "button_card_templates":
                    walk(v)

    walk(cfg.get("views") if isinstance(cfg, dict) else None)
    return refs


def _main_by_key(ents: list[lf.Ent], keys: Any, domain: str | None = None) -> str | None:
    for k in keys:
        for e in ents:
            if e.key == k and (domain is None or e.domain == domain):
                return e.entity_id
    return None


def suggest_tile(name: str, ents: list[lf.Ent], states, model: str = "",
                 washdata_type: str | None = None, hidden: frozenset[str] = frozenset()) -> tuple[str, str] | None:
    """(tile type id, main entity) for one device, or None.

    ents: the device's enabled entities with a state. The appliance finders see all of them (also hidden ones and
    ones with a category, as the Studio's finders do); the domain step only visible ones without a category.
    washdata_type: WashData's device type ("other"/"generic" = air fryer, bread maker: no washer).
    """
    if lf.is_oven(ents, states):
        main = _main_by_key(ents, lf.OVEN_FIELDS["state"][0], "sensor") or _main_by_key(ents, lf.OVEN_FIELDS["temp"][0])
        if main:
            return OVEN, main
    found = lf.classify("", ents, states, model, washdata_type)
    if found and found.kind in BY_KIND and found.fields.get("state"):
        return BY_KIND[found.kind], found.fields["state"]
    src = lf.fridge_source(ents) if not found else None
    if src:
        tables = next(s for s in lf.FRIDGE_SOURCES if s["id"] == src)
        main = (_main_by_key(ents, list(tables["temps"]) + list(tables["sets"]))
                or next((e.entity_id for e in ents if e.domain == "climate"), None)
                or _main_by_key(ents, list(tables["doors"])))
        if main:
            return FRIDGE, main
    visible = [e for e in ents if not e.category and e.entity_id not in hidden]
    if AIR_PURIFIER_NAME.search(name or ""):
        fan = next((e for e in visible if e.domain == "fan"), None)
        if fan:
            return AIR_PURIFIER, fan.entity_id
    vac_or_printer = any(e.domain == "vacuum" for e in ents) or lf.is_printer(ents)
    for dom, tile in BY_DOMAIN:
        for e in visible:
            if e.domain != dom:
                continue
            if dom == "camera" and (vac_or_printer or MAP_NAME.search(e.entity_id.partition(".")[2])
                                    or MAP_NAME.search(e.key or "")):
                continue
            return tile, e.entity_id
    return None


def _suggest_area(name: str, ent_areas: list[str], areas: dict[str, str]) -> str | None:
    """An area for a device without one: the area most of its entities have, else an area named in its name."""
    if ent_areas:
        return Counter(ent_areas).most_common(1)[0][0]
    n = _norm(name)
    hits = [(len(an), aid) for aid, an in ((a, _norm(nm)) for a, nm in areas.items())
            if an and re.search(r"(^|[^a-z0-9])" + re.escape(an) + r"($|[^a-z0-9])", n)]
    return max(hits)[1] if hits else None


def entities_by_device(hass: HomeAssistant) -> dict[str, list]:
    """device_id → its enabled registry entries, sorted by entity id."""
    from homeassistant.helpers import entity_registry as er

    by_dev: dict[str, list] = {}
    for e in er.async_get(hass).entities.values():
        if e.device_id and not e.disabled_by:
            by_dev.setdefault(e.device_id, []).append(e)
    for regs in by_dev.values():
        regs.sort(key=lambda e: e.entity_id)
    return by_dev


def device_entities(hass: HomeAssistant, regs: list) -> tuple[list[lf.Ent], frozenset[str], list[lf.Ent]]:
    """(entities with a state, hidden entity ids, visible ones without a category) of one device."""
    ents = [lf.Ent(e.entity_id, e.translation_key, e.platform, e.entity_category, e.icon or e.original_icon)
            for e in regs if hass.states.get(e.entity_id) is not None]
    hidden = frozenset(e.entity_id for e in regs if e.hidden_by)
    return ents, hidden, [e for e in ents if not e.category and e.entity_id not in hidden]


def on_tile(device_id: str, visible: list[lf.Ent], used: set[str]) -> bool:
    """The device or one of its entities (measurements aside) is already on a tile."""
    return device_id in used or any(e.entity_id in used and e.domain not in ("sensor", "binary_sensor")
                                    for e in visible)


def device_suggestion(hass: HomeAssistant, d: Any, name: str, ents: list[lf.Ent],
                      hidden: frozenset[str]) -> tuple[str, str] | None:
    return suggest_tile(name, ents, hass.states.get, f"{d.model or ''} {d.model_id or ''}",
                        lf._washdata_type(hass, d), hidden)


async def async_casora_refs(hass: HomeAssistant) -> dict[str, set[str]]:
    """url_path → ids referenced in its views, for every readable Casora dashboard (sorted by url_path)."""
    out: dict[str, set[str]] = {}
    for url_path, cfg in sorted((await async_dashboard_configs(hass)).items()):
        if cfg is UNREADABLE or dashboard_kind(cfg) == "none":
            continue
        out[url_path] = collect_refs(cfg)
    return out


async def async_setup_overview(hass: HomeAssistant) -> dict[str, Any]:
    """The answer of casora.setup_overview (see module docstring)."""
    from homeassistant.helpers import area_registry as ar, device_registry as dr
    from homeassistant.helpers import floor_registry as fr

    areas_reg, floors = ar.async_get(hass), fr.async_get(hass)
    rooms = []
    area_names: dict[str, str] = {}
    for a in areas_reg.async_list_areas():
        fl = floors.async_get_floor(a.floor_id) if a.floor_id else None
        rooms.append({"area_id": a.id, "name": a.name, "floor": fl.name if fl else None})
        area_names[a.id] = a.name

    refs = await async_casora_refs(hass)
    dashboards = list(refs)
    used: set[str] = set().union(*refs.values()) if refs else set()
    by_dev = entities_by_device(hass)

    unassigned: list[dict] = []
    without_tile: list[dict] = []
    dreg = dr.async_get(hass)
    # Iterated, not used as a mapping (deprecated since HA 2026.10, gone in 2027.9); older HA iterates ids.
    for d in dreg.devices:
        if isinstance(d, str):
            d = dreg.async_get(d)
        if d is None or d.disabled_by or d.entry_type is not None:
            continue
        regs = by_dev.get(d.id, [])
        ents, hidden, visible = device_entities(hass, regs)
        if not visible:
            continue
        name = d.name_by_user or d.name or ""
        if not d.area_id:
            row = {"device_id": d.id, "name": name}
            sug = _suggest_area(name, [e.area_id for e in regs if e.area_id in area_names and not e.entity_category],
                                area_names)
            if sug:
                row["suggested_area"] = area_names[sug]
            unassigned.append(row)
        if d.via_device_id and not any(e.domain in VIA_DOMAINS for e in visible):
            continue
        if on_tile(d.id, visible, used):
            continue
        hit = device_suggestion(hass, d, name, ents, hidden)
        if not hit or hit[1] in used:
            continue
        tile, main = hit
        reg = next((e for e in regs if e.entity_id == main), None)
        area = (reg.area_id if reg and reg.area_id else None) or d.area_id
        without_tile.append({"device_id": d.id, "name": name, "area": area_names.get(area) if area else None,
                             "main_entity": main, "suggested_tile": tile})

    unassigned.sort(key=lambda r: (_norm(r["name"]), r["device_id"]))
    without_tile.sort(key=lambda r: (r["area"] is None, _norm(r["area"]), _norm(r["name"]), r["device_id"]))
    return {"rooms": rooms, "unassigned_devices": unassigned, "devices_without_tile": without_tile,
            "dashboards": sorted(dashboards)}


async def async_setup_setup_overview(hass: HomeAssistant) -> None:
    async def handle(call: ServiceCall) -> ServiceResponse:
        return await async_setup_overview(hass)

    # Admins only: it reads every dashboard, including admin-only ones.
    # Extra data is ignored (some MCP clients always send a target), as for casora.einrichten.
    async_register_admin_service(hass, DOMAIN, SERVICE, handle, vol.Schema({}, extra=vol.ALLOW_EXTRA),
                                 supports_response=SupportsResponse.ONLY)
