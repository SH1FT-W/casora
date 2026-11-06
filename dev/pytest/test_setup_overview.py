"""casora.setup_overview against HA's real registries (issue #131, step 1).

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_setup_overview.py -q

Invented house: two areas on a floor, a lamp already on a Casora tile, a thermostat and a robot vacuum without
a tile, a lamp without an area (named after a room), a hub child without anything to operate, a service device.
The service answers only (SupportsResponse.ONLY) and changes nothing.
"""

from __future__ import annotations

import copy
from types import SimpleNamespace

from ha_common import MockConfigEntry

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr

DOMAIN = "casora"


class Dash:
    def __init__(self, cfg):
        self.cfg = cfg
        self.saved = 0

    async def async_load(self, force):
        if self.cfg is None:
            raise ValueError("no config")
        return self.cfg

    async def async_save(self, cfg):  # never called by a read-only service
        self.saved += 1


async def _house(hass: HomeAssistant):
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    floor = fr.async_get(hass).async_create("Erdgeschoss")
    areas = ar.async_get(hass)
    kueche = areas.async_create("Küche", floor_id=floor.floor_id)
    wohnen = areas.async_create("Wohnzimmer")
    devs, ents = dr.async_get(hass), er.async_get(hass)

    def device(name, area=None, **kw):
        d = devs.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", name)}, name=name, **kw)
        if area:
            d = devs.async_update_device(d.id, area_id=area)
        return d

    def entity(domain, uid, dev, state="on", **kw):
        e = ents.async_get_or_create(domain, "test", uid, device_id=dev.id, suggested_object_id=uid, **kw)
        hass.states.async_set(e.entity_id, state)
        return e.entity_id

    lamp = device("Deckenlampe", kueche.id)
    lamp_e = entity("light", "deckenlampe", lamp)
    entity("sensor", "deckenlampe_power", lamp, "3")
    thermo = device("Heizkörper", wohnen.id)
    thermo_e = entity("climate", "heizkoerper", thermo, "heat")
    entity("sensor", "heizkoerper_battery", thermo, "80", entity_category=er.EntityCategory.DIAGNOSTIC)
    robby = device("Robby", kueche.id)
    entity("vacuum", "robby", robby, "docked")
    entity("camera", "robby_map", robby, "idle")
    loose = device("Wohnzimmer Stehlampe")
    loose_e = entity("light", "stehlampe", loose)
    plug = device("Steckdose 3")
    entity("switch", "steckdose_3", plug)
    hub = device("Bridge", kueche.id)
    child = device("Bewegungsmelder", wohnen.id, via_device_id=hub.id)
    entity("binary_sensor", "bewegung", child)
    svc = device("Wetterdienst", entry_type=dr.DeviceEntryType.SERVICE)
    entity("light", "wetter_licht", svc)
    entity("sensor", "bridge_status", hub, "ok", entity_category=er.EntityCategory.DIAGNOSTIC)
    printer = device("Drucker", kueche.id)
    printer_e = entity("sensor", "drucker_status", printer, "idle", translation_key="print_status")
    entity("light", "drucker_licht", printer)
    casora = {"button_card_templates": {"casora_light": {"variables": {"x": thermo_e}}},
              "views": [{"cards": [{"template": "casora_room", "variables": {"name": "Küche"}},
                                   {"template": "casora_light", "entity": lamp_e},
                                   {"template": "casora_3d_printer", "entity": printer_e}]}]}
    other = {"views": [{"cards": [{"type": "tile", "entity": loose_e}]}]}
    dashes = {"casora-home": Dash(casora), "karte": Dash(other), "neu": Dash(None)}
    hass.data[LOVELACE_DATA] = SimpleNamespace(dashboards=dashes)
    return SimpleNamespace(kueche=kueche, wohnen=wohnen, lamp=lamp, thermo=thermo, thermo_e=thermo_e, robby=robby,
                           printer=printer, loose=loose, loose_e=loose_e, plug=plug, child=child, dashes=dashes, casora=casora)


async def test_setup_overview_answer(hass: HomeAssistant) -> None:
    from custom_components.casora.setup_overview import async_setup_setup_overview  # noqa: PLC0415

    h = await _house(hass)
    before = copy.deepcopy(h.casora)
    await async_setup_setup_overview(hass)
    res = await hass.services.async_call(DOMAIN, "setup_overview", {"entity_id": "all"}, blocking=True, return_response=True)

    assert res["dashboards"] == ["casora-home"]
    assert {"area_id": h.kueche.id, "name": "Küche", "floor": "Erdgeschoss"} in res["rooms"]
    assert {"area_id": h.wohnen.id, "name": "Wohnzimmer", "floor": None} in res["rooms"]

    unassigned = {r["device_id"]: r for r in res["unassigned_devices"]}
    assert unassigned[h.loose.id] == {"device_id": h.loose.id, "name": "Wohnzimmer Stehlampe", "suggested_area": "Wohnzimmer"}
    assert unassigned[h.plug.id] == {"device_id": h.plug.id, "name": "Steckdose 3"}
    assert len(unassigned) == 2  # service device and devices with an area are not listed

    tiles = {r["device_id"]: r for r in res["devices_without_tile"]}
    # The lamp is on a Casora tile; the thermostat only appears in a template, that is no tile.
    assert h.lamp.id not in tiles
    # An appliance tile shows a sensor: the printer on its tile is not listed again.
    assert h.printer.id not in tiles
    assert tiles[h.thermo.id] == {"device_id": h.thermo.id, "name": "Heizkörper", "area": "Wohnzimmer",
                                  "main_entity": h.thermo_e, "suggested_tile": "thermostat"}
    assert tiles[h.robby.id]["suggested_tile"] == "vacuum"
    # On a non-Casora dashboard only: still without a Casora tile.
    assert tiles[h.loose.id]["suggested_tile"] == "light" and tiles[h.loose.id]["area"] is None
    assert h.child.id not in tiles and h.plug.id not in tiles  # nothing to operate / no Casora tile type
    assert set(tiles) == {h.thermo.id, h.robby.id, h.loose.id}

    # Read only.
    assert h.casora == before and all(d.saved == 0 for d in h.dashes.values())


async def test_setup_overview_without_dashboards(hass: HomeAssistant) -> None:
    from custom_components.casora.setup_overview import async_setup_overview  # noqa: PLC0415

    res = await async_setup_overview(hass)
    assert res == {"rooms": res["rooms"], "unassigned_devices": [], "devices_without_tile": [], "dashboards": []}
