"""Assumptions about Home Assistant, checked against the installed homeassistant package (no running HA).

  "$(tools/ha-venv.sh install)/bin/python" dev/unit/ha_annahmen_test.py     # gate's standard HA version
  dev/qa/ha-annahmen.sh [stable] [beta] [<version>]                          # newest stable + beta
  uv run --python 3.14 --with homeassistant python dev/unit/ha_annahmen_test.py   # CI (newest HA release)

@ha-venv: the gate runs this file with the Python of tools/ha-venv.sh (its standard HA version), not via uv.

Every test names the Casora code that relies on the behaviour ("Casora:"). A red test means: HA changed
that behaviour, look at the named place before users do (issue #25: HA 2026.10 made every device_tracker
diagnostic and the pet field stayed empty). The list with the reasoning is docs/ha-annahmen.md.
Tests that need the frontend package (hass_frontend) are skipped without it; ha-annahmen.sh installs it.
"""

from __future__ import annotations

import asyncio
import glob
import inspect
import json
import logging
import os
import re
import sys
import tempfile
import unittest
import warnings
from datetime import timedelta
from types import MappingProxyType

warnings.simplefilter("ignore")
try:
    import homeassistant  # noqa: F401
except ImportError:
    print("ha_annahmen_test: homeassistant is not installed - run it with the Python of tools/ha-venv.sh")
    sys.exit(2)

from homeassistant import bootstrap, config_entries, loader
from homeassistant.const import EntityCategory, __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_platform
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import label_registry as lr
from homeassistant.helpers.device_registry import DeviceInfo

import homeassistant.components  # noqa: E402

COMPONENTS = os.path.dirname(homeassistant.components.__file__)
logging.basicConfig(level=logging.CRITICAL)


# ── Small real HA: registries, one config entry, entities added through a real EntityPlatform ──────────────
def _entry(domain: str) -> config_entries.ConfigEntry:
    """A config entry; the constructor's required keyword arguments change between versions."""
    vals = {"domain": domain, "title": domain, "data": {}, "options": {}, "source": "user", "version": 1,
            "minor_version": 1, "unique_id": None, "discovery_keys": MappingProxyType({}), "subentries_data": None}
    sig = inspect.signature(config_entries.ConfigEntry)
    return config_entries.ConfigEntry(**{n: vals.get(n) for n, p in sig.parameters.items()
                                         if p.kind == p.KEYWORD_ONLY and p.default is inspect.Parameter.empty})


class HATest(unittest.IsolatedAsyncioTestCase):
    PLATFORM = "tractive"

    async def asyncSetUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self._dir.name)
        loader.async_setup(self.hass)
        self.hass.config_entries = config_entries.ConfigEntries(self.hass, {})
        await bootstrap.async_load_base_functionality(self.hass)
        self.entry = _entry(self.PLATFORM)
        self.hass.config_entries._entries[self.entry.entry_id] = self.entry
        self.dev = dr.async_get(self.hass).async_get_or_create(
            config_entry_id=self.entry.entry_id, identifiers={(self.PLATFORM, "hw")}, name="Tracker ABC")

    async def asyncTearDown(self) -> None:
        await self.hass.async_stop(force=True)
        self._dir.cleanup()

    async def add(self, domain: str, entity):
        p = entity_platform.EntityPlatform(hass=self.hass, logger=logging.getLogger(__name__), domain=domain,
                                           platform_name=self.PLATFORM, platform=None,
                                           scan_interval=timedelta(seconds=30), entity_namespace=None)
        p.config_entry = self.entry
        await p.async_add_entities([entity])
        return self.hass.states.get(entity.entity_id), er.async_get(self.hass).async_get(entity.entity_id)

    def display(self) -> dict:
        """hass.entities as the frontend receives it: the real config/entity_registry/list_for_display answer."""
        from homeassistant.components.config.entity_registry import websocket_list_entities_for_display
        sent = []

        class Conn:
            def send_message(self, msg):
                sent.append(msg)

        fn = getattr(websocket_list_entities_for_display, "__wrapped__", websocket_list_entities_for_display)
        fn(self.hass, Conn(), {"id": 1, "type": "config/entity_registry/list_for_display"})
        res = json.loads(sent[0])["result"]
        return {e["ei"]: e for e in res["entities"]} | {"__categories__": res["entity_categories"]}

    def on_device(self):
        return DeviceInfo(identifiers={(self.PLATFORM, "hw")})


def tracker_cls():
    from homeassistant.components.device_tracker import TrackerEntity

    class Tracker(TrackerEntity):
        _attr_has_entity_name = True
        _attr_name = None
        _attr_unique_id = "tracker"
        _attr_latitude = 52.5
        _attr_longitude = 13.4
    return Tracker


def sensor_cls(**kw):
    from homeassistant.components.sensor import SensorEntity
    return type("Sensor", (SensorEntity,), {"_attr_has_entity_name": True, "_attr_native_value": 21.4,
                                            "_attr_unique_id": kw.get("_attr_unique_id", "s1"), **kw})


# ── Entity categories ───────────────────────────────────────────────────────────────────────────────────────
class Categories(HATest):
    async def test_device_tracker_is_diagnostic(self):
        """Every device_tracker is diagnostic (BaseTrackerEntity; already so in 2026.9.4).

        Casora: panel/casora-panel.js listCategory() ignores the category of device_trackers only, so pet
        trackers stay in the device lists (issue #25); dev/casora_mock inherits it from TrackerEntity.
        Red: HA changed the default - listCategory() and the test house may need adjusting."""
        T = tracker_cls()
        T._attr_device_info = self.on_device()
        _, entry = await self.add("device_tracker", T())
        self.assertEqual(entry.entity_category, EntityCategory.DIAGNOSTIC)
        from homeassistant.components.device_tracker import ScannerEntity
        self.assertEqual(type("Scanner", (ScannerEntity,), {})().entity_category, EntityCategory.DIAGNOSTIC)

    async def test_sensor_has_no_default_category(self):
        """Sensors and binary sensors have no category of their own.

        Casora: room/device lists (panel/casora-panel-basis.js, casora-panel-b-plus.js, scripts/casora-core.js
        power sensors, raumklima.py) drop every entity with a category. Red: HA now categorises plain sensors,
        those lists would empty out."""
        S = sensor_cls(_attr_name="Battery", _attr_device_info=self.on_device())
        _, entry = await self.add("sensor", S())
        self.assertIsNone(entry.entity_category)
        from homeassistant.components.binary_sensor import BinarySensorEntity
        B = type("Binary", (BinarySensorEntity,), {"_attr_has_entity_name": True, "_attr_name": "Door",
                                                    "_attr_unique_id": "b1", "_attr_device_info": self.on_device()})
        _, entry = await self.add("binary_sensor", B())
        self.assertIsNone(entry.entity_category)

    async def test_update_default_category(self):
        """Update entities: config with INSTALL, else diagnostic, unless the integration sets one.

        Casora: the Studio's room/device suggestions (casora-panel-basis.js) never offer update entities because
        of this; dev/casora_mock's update entities inherit it from UpdateEntity. Red: check those lists."""
        from homeassistant.components.update import UpdateEntity, UpdateEntityFeature

        class U(UpdateEntity):
            _attr_unique_id = "u1"
            _attr_name = "Firmware"
            _attr_installed_version = "1"
            _attr_latest_version = "2"
            _attr_supported_features = UpdateEntityFeature.INSTALL
        self.assertEqual(U().entity_category, EntityCategory.CONFIG)
        U._attr_supported_features = UpdateEntityFeature(0)
        self.assertEqual(U().entity_category, EntityCategory.DIAGNOSTIC)


# ── hass.entities (entity registry display list) ───────────────────────────────────────────────────────────
class RegistryDisplay(HATest):
    async def test_display_fields(self):
        """config/entity_registry/list_for_display carries the fields Casora reads from hass.entities.

        Wire keys: ei, pl, di, ai, tk, ec (index into entity_categories), hb, en, dp, lb, ic.
        Casora: entity_category/hidden in casora-panel-basis.js (room lists), casora-panel.js listCategory(),
        scripts/casora-core.js; translation_key/platform in scripts/local/00-finder.js (casoraDevice, byKey,
        casoraLaundryFind), 26-haustier.js, 24-klingel.js; area_id/device_id everywhere (rooms);
        display_precision in dashboards/casora/button_card_templates.json. Red: a key was renamed or dropped."""
        area = ar.async_get(self.hass).async_get_or_create("Kitchen")
        label = lr.async_get(self.hass).async_create("Test")
        S = sensor_cls(_attr_name="Battery", _attr_translation_key="battery_level", _attr_device_info=self.on_device(),
                       _attr_entity_category=EntityCategory.DIAGNOSTIC)
        _, entry = await self.add("sensor", S())
        er.async_get(self.hass).async_update_entity(
            entry.entity_id, hidden_by=er.RegistryEntryHider.USER, area_id=area.id, labels={label.label_id},
            icon="mdi:battery")
        er.async_get(self.hass).async_update_entity_options(entry.entity_id, "sensor", {"display_precision": 2})
        d = self.display()
        e = d[entry.entity_id]
        self.assertEqual(e["pl"], self.PLATFORM)
        self.assertEqual(e["di"], self.dev.id)
        self.assertEqual(e["ai"], area.id)
        self.assertEqual(e["tk"], "battery_level")
        self.assertEqual(d["__categories__"][str(e["ec"])], "diagnostic")
        self.assertIs(e["hb"], True)
        self.assertEqual(e["lb"], [label.label_id])
        self.assertEqual(e["ic"], "mdi:battery")
        self.assertEqual(e["dp"], 2)
        self.assertEqual(e["en"], "Battery")

    async def test_disabled_entities_not_listed(self):
        """Disabled entities are missing from hass.entities.

        Casora: checks like `e.disabled_by` on hass.entities (casora-panel-basis.js) are only a safety net;
        Python code (tanken.py, raumklima.py) filters disabled_by on the registry itself. Red: disabled entities
        appear in hass.entities, check that they are filtered everywhere."""
        S = sensor_cls(_attr_name="Battery", _attr_device_info=self.on_device())
        _, entry = await self.add("sensor", S())
        er.async_get(self.hass).async_update_entity(entry.entity_id, disabled_by=er.RegistryEntryDisabler.USER)
        self.assertNotIn(entry.entity_id, self.display())

    async def test_name_is_entity_part_only(self):
        """hass.entities[id].name is the entity's own name part: user name, else its name without the device.

        Casora: "registry name first" in casora-panel-b-ux.js (device list), casora-panel-types.js,
        casora-panel-b-plus.js (scene dialog), casora-panel-b-mehr.js (search). Red: names change in the Studio."""
        S = sensor_cls(_attr_name="Battery", _attr_device_info=self.on_device())
        _, entry = await self.add("sensor", S())
        self.assertEqual(self.display()[entry.entity_id]["en"], "Battery")
        er.async_get(self.hass).async_update_entity(entry.entity_id, name="Bello Akku")
        self.assertEqual(self.display()[entry.entity_id]["en"], "Bello Akku")

    async def test_unnamed_tracker_has_no_name(self):
        """A tracker named after its device (has_entity_name, name None) has no name in hass.entities.

        Casora: panel/casora-panel.js petName() takes hass.entities[id].name as the user's own name for the
        pet, else the pet device. Red: HA fills in a name, the pet field would show "Tracker <id>"."""
        T = tracker_cls()
        T._attr_device_info = self.on_device()
        _, entry = await self.add("device_tracker", T())
        self.assertNotIn("en", self.display()[entry.entity_id])

    async def test_temperature_default_display_precision(self):
        """A temperature sensor in °C without a suggested precision gets display_precision 1 from HA.

        Casora: number formatting in the card templates (display_precision in button_card_templates.json) and
        the test house (it does not set native units, so no dp there). Red: values may show more/fewer digits."""
        S = sensor_cls(_attr_name="Temperature", _attr_device_class="temperature",
                       _attr_native_unit_of_measurement="°C", _attr_device_info=self.on_device())
        _, entry = await self.add("sensor", S())
        self.assertEqual(self.display()[entry.entity_id].get("dp"), 1)


# ── friendly_name ───────────────────────────────────────────────────────────────────────────────────────────
class FriendlyName(HATest):
    async def test_device_name_in_front(self):
        """friendly_name = device name (name_by_user first) + " " + entity name; device name alone without one.

        Casora: scripts/local/00-finder.js wasteLabel() strips the device name in front of bin sensors (issue #27,
        Waste Collection Schedule), many popups strip the device name from row labels. Red: labels double up
        or lose words."""
        S = sensor_cls(_attr_name="Battery", _attr_device_info=self.on_device())
        ent = S()
        st, _ = await self.add("sensor", ent)
        self.assertEqual(st.attributes["friendly_name"], "Tracker ABC Battery")
        T = tracker_cls()
        T._attr_device_info = self.on_device()
        st2, _ = await self.add("device_tracker", T())
        self.assertEqual(st2.attributes["friendly_name"], "Tracker ABC")
        dr.async_get(self.hass).async_update_device(self.dev.id, name_by_user="Collar")
        await self.hass.async_block_till_done()
        ent.async_write_ha_state()
        self.assertEqual(self.hass.states.get(st.entity_id).attributes["friendly_name"], "Collar Battery")

    async def test_user_name_without_device(self):
        """An entity name the user gave stands alone, without the device in front.

        Casora: wasteLabel() (00-finder.js) leaves such names as they are. Red: user names get the device back."""
        S = sensor_cls(_attr_name="Battery", _attr_device_info=self.on_device())
        st, entry = await self.add("sensor", S())
        er.async_get(self.hass).async_update_entity(entry.entity_id, name="Paper bin")
        await self.hass.async_block_till_done()
        self.assertEqual(self.hass.states.get(st.entity_id).attributes["friendly_name"], "Paper bin")

    async def test_legacy_name_gets_device_prefix(self):
        """Entities without has_entity_name on a device: friendly_name = device + own name, unless the name
        already starts with the device name (HA 2026.10 naming); hass.entities name is without the device.

        Casora: same places as above, and dev/casora_mock (all its entities are legacy-named, the fixture's
        friendly names already start with the device name). Red: friendly names in the test house change."""
        S = sensor_cls(_attr_has_entity_name=False, _attr_name="Temp", _attr_device_info=self.on_device())
        st, entry = await self.add("sensor", S())
        self.assertEqual(st.attributes["friendly_name"], "Tracker ABC Temp")
        S2 = sensor_cls(_attr_unique_id="s2", _attr_has_entity_name=False, _attr_name="Tracker ABC Humidity",
                        _attr_device_info=self.on_device())
        st2, entry2 = await self.add("sensor", S2())
        self.assertEqual(st2.attributes["friendly_name"], "Tracker ABC Humidity")
        self.assertEqual(self.display()[entry2.entity_id]["en"], "Humidity")


# ── Foreign core integrations: translation keys Casora looks for ────────────────────────────────────────────
# (platform, domain or "*", keys, Casora place). Matched against strings.json "entity" of the integration,
# else as a quoted string in its Python source (some keys have no translation, e.g. La Marzocco "main").
KEYS = [
    ("tractive", "sensor", ["tracker_state", "activity_time", "rest_time", "daily_goal", "minutes_day_sleep",
                            "minutes_night_sleep"], "scripts/local/26-haustier.js P.find (KEYS)"),
    ("tractive", "binary_sensor", ["tracker_power_saving"], "26-haustier.js P.find"),
    ("tractive", "switch", ["live_tracking", "tracker_buzzer", "tracker_led"], "26-haustier.js P.find"),
    ("reolink", "camera", ["main", "sub", "snapshots_main", "snapshots_sub"],
     "scripts/casora-core.js casoraCamStill, 24-klingel.js liveCam, casora-panel-b-ux.js bellCam"),
    ("reolink", "binary_sensor", ["visitor", "person", "vehicle", "pet", "animal", "package", "face"],
     "24-klingel.js KL.find, casora-panel-types.js (visitor)"),
    ("reolink", "select", ["play_quick_reply_message", "auto_quick_reply_message", "doorbell_led", "day_night_mode"],
     "24-klingel.js KL.find"),
    ("reolink", "number", ["volume", "volume_speak", "volume_doorbell", "auto_quick_reply_time"], "24-klingel.js KL.find"),
    ("reolink", "switch", ["doorbell_button_sound", "record_audio", "privacy_mode", "ir_lights"], "24-klingel.js KL.find"),
    ("reolink", "light", ["status_led"], "24-klingel.js KL.find"),
    ("reolink", "siren", ["siren"], "24-klingel.js KL.find"),
    ("reolink", "sensor", ["wifi_signal", "day_night_state"], "24-klingel.js KL.find"),
    ("roborock", "sensor", ["status", "current_room", "clean_percent", "cleaning_area", "cleaning_time", "vacuum_error",
                            "dock_error", "last_clean_start", "last_clean_end", "total_cleaning_count",
                            "total_cleaning_time", "total_cleaning_area", "mop_drying_remaining_time",
                            "main_brush_time_left", "side_brush_time_left", "filter_time_left", "sensor_time_left",
                            "strainer_time_left"],
     "00-finder.js casoraDevice.vacuumFields (02-devices.js V.resolve, casora-panel.js find.vac), live_finder.py VACUUM_FIELDS"),
    ("roborock", "*", ["dnd_switch", "dnd_start_time", "dnd_end_time", "cleaning_mode", "mop_intensity", "mop_mode",
                       "dust_collection_mode", "selected_map", "volume", "water_shortage", "dirty_box_full",
                       "clean_box_empty", "mop_attached", "water_box_attached", "reset_main_brush_consumable",
                       "reset_side_brush_consumable", "reset_air_filter_consumable", "reset_sensor_consumable"],
     "00-finder.js vacuumFields/vacuumMap, 02-devices.js V.resolve"),
    ("ecovacs", "sensor", ["stats_area", "stats_time", "error", "total_stats_area", "total_stats_time", "total_stats_cleanings"],
     "00-finder.js casoraDevice.vacuumFields (fallback keys), live_finder.py VACUUM_FIELDS"),
    ("home_connect", "*", ["operation_state", "program_progress", "program_finish_time", "door", "active_program",
                           "selected_program", "pause_program", "resume_program", "stop_program",
                           "bean_amount", "coffee_temperature", "fill_quantity"],
     "00-finder.js casoraLaundryFind.SOURCES (fields + dish for _casoraDish), live_finder.py, 25-coffee.js"),
    ("home_connect", "select", ["active_program", "selected_program"], "00-finder.js SOURCES home_connect.dish"),
    ("home_connect", "button", ["stop_program"], "00-finder.js SOURCES home_connect.dish"),
    ("home_connect", "number", ["start_in_relative"], "00-finder.js SOURCES home_connect.dish startIn (issue #77)"),
    ("home_connect", "switch", ["power", "extra_dry", "half_load", "vario_speed_plus", "silence_on_demand", "hygiene_plus",
                                "intensiv_zone"], "00-finder.js SOURCES home_connect.dish (power_sw, options, issue #77)"),
    ("home_connect", "binary_sensor", ["remote_start"], "00-finder.js SOURCES home_connect.dish remoteStart"),
    ("home_connect", "sensor", ["salt_nearly_empty", "salt_lack", "program_blocked_salt_lack", "rinse_aid_nearly_empty",
                                "rinse_aid_lack", "smart_filter_cleaning_reminder", "machine_care_reminder",
                                "machine_care_and_filter_cleaning_reminder",
                                "machine_care_and_low_maintenance_filter_cleaning_reminder"],
     "00-finder.js SOURCES home_connect.dish (refills/care, 02-devices.js D.fill/onEv: present = due)"),
    ("miele", "*", ["status", "program_id", "program_phase", "drying_step", "remaining_time", "finish", "elapsed_time",
                    "start", "energy_consumption", "spin_speed", "twin_dos_1_level", "pause", "stop",
                    "salt_level", "rinse_aid_level", "power_disk_level"],
     "00-finder.js casoraLaundryFind.SOURCES (also dish), live_finder.py"),
    ("miele", "button", ["start", "stop"], "00-finder.js casoraLaundryFind.SOURCES miele.dish (dishwasher start/stop)"),
    ("smartthings", "*", ["washer_machine_state", "dryer_machine_state", "washer_job_state", "dryer_job_state",
                          "washer_mode", "dryer_mode", "completion_time", "pause", "resume", "stop"],
     "00-finder.js casoraLaundryFind.SOURCES, live_finder.py"),
    ("lg_thinq", "*", ["current_state", "cycle_count", "remain", "total", "running"],
     "00-finder.js casoraLaundryFind.SOURCES, live_finder.py"),
    ("whirlpool", "*", ["washer_state", "dryer_state", "end_time"], "00-finder.js casoraLaundryFind.SOURCES, live_finder.py"),
    ("cookidoo", "*", ["meal_plan", "ingredient_list", "additional_item_list"], "03-popups.js _casoraRecipe, ki.py"),
    ("backup", "sensor", ["last_successful_automatic_backup", "next_scheduled_automatic_backup",
                          "last_attempted_automatic_backup", "backup_manager_state"], "03-popups.js (backup row)"),
    ("proximity", "sensor", ["dist_to_zone", "dir_of_travel"], "15-person.js"),
    ("unifi", "*", ["device_state", "wlan_clients", "wan_latency", "device_clients", "wlan_control"], "00-finder.js network"),
    ("lamarzocco", "*", ["brew_active", "start_backflush", "total_coffees_made", "main", "water_tank"], "25-coffee.js K.roles"),
    ("home_connect", "*", ["power", "remote_start", "water_tank_empty", "bean_container_empty", "drip_tray_full",
                           "keep_milk_tank_cool", "descaling_in_10_cups", "calc_n_clean_in10cups", "device_should_be_descaled",
                           "device_descaling_overdue", "coffee_counter", "powder_coffee_counter", "hot_water_cups_counter",
                           "frothy_milk_counter", "ristretto_espresso_counter", "coffee_and_milk_counter"],
     "25-coffee.js K.roles (coffee maker: power, remote start, warnings, counters)"),
]


def _component_keys(platform: str) -> tuple[dict, str]:
    base = os.path.join(COMPONENTS, platform)
    with open(os.path.join(base, "strings.json"), encoding="utf-8") as f:
        ent = json.load(f).get("entity", {})
    src = ""
    for p in glob.glob(os.path.join(base, "*.py")):
        with open(p, encoding="utf-8") as f:
            src += f.read()
    return ent, src


class ForeignKeys(unittest.TestCase):
    def test_translation_keys_exist(self):
        """Translation keys of core integrations that Casora finds entities by (never by entity_id or name).

        Red: the integration renamed or dropped a key - the named Casora place no longer finds the entity."""
        missing = []
        for platform, domain, keys, where in KEYS:
            if not os.path.isdir(os.path.join(COMPONENTS, platform)):
                missing.append(f"{platform}: integration missing ({where})")
                continue
            ent, src = _component_keys(platform)
            for k in keys:
                in_strings = (k in ent.get(domain, {})) if domain != "*" else any(k in v for v in ent.values())
                if not in_strings and not re.search(r"""['"]%s['"]""" % re.escape(k), src):
                    missing.append(f"{platform} {domain} {k} ({where})")
        self.assertEqual(missing, [], "translation keys missing:\n  " + "\n  ".join(missing))

    def test_home_connect_start_selected_program(self):
        """Home Connect (HA core) has no start button for a dishwasher: Casora starts the selected program with the
        action home_connect.start_selected_program (device_id, optional b_s_h_common_option_start_in_relative in
        seconds); the program options stay those set on the selected program. The event sensors report
        present / confirmed / off. Casora: 02-devices.js _casoraDish.startSvc/go (issue #77), D.fill/onEv.
        Red: the action or its field was renamed (start falls back to the active_program select) or the event
        states changed (refill rows wrong)."""
        base = os.path.join(COMPONENTS, "home_connect")
        with open(os.path.join(base, "services.yaml"), encoding="utf-8") as f:
            yml = f.read()
        block = yml.split("start_selected_program:", 1)
        self.assertEqual(len(block), 2, "start_selected_program missing in services.yaml")
        self.assertIn("device_id:", block[1])
        self.assertIn("b_s_h_common_option_start_in_relative:", block[1])
        with open(os.path.join(base, "sensor.py"), encoding="utf-8") as f:
            self.assertIn('EVENT_OPTIONS = ["confirmed", "off", "present"]', f.read())
        with open(os.path.join(base, "number.py"), encoding="utf-8") as f:
            self.assertIn("translation_key=\"start_in_relative\"", f.read())

    def test_tractive_layout(self):
        """Tractive: hardware device "Tracker <id>" (device translation "tracker"), the pet device hangs on it via
        via_device. Casora: casora-panel.js isPetTracker()/petName(), 26-haustier.js P.find (looks behind
        via_device_id). Red: Tractive rebuilt its devices, check where the pet name and the sensors sit."""
        with open(os.path.join(COMPONENTS, "tractive", "strings.json"), encoding="utf-8") as f:
            dev = json.load(f).get("device", {})
        self.assertIn("tracker", dev)
        self.assertIn("{id}", dev["tracker"].get("name", ""))
        with open(os.path.join(COMPONENTS, "tractive", "entity.py"), encoding="utf-8") as f:
            self.assertIn("via_device", f.read())

    def test_status_leds_are_config(self):
        """The status LEDs of cameras and access points are lights with the config category: Reolink status_led,
        UniFi led_control.

        Casora: panel/casora-panel-basis.js plan() leaves them out by the category (casoraAssist.suggest drops every
        categorised entity); the name rule isStatusLed only catches those without one. Red: they lost the category -
        "Start fresh" would put a camera's LED in the room unless its ID ends in status_led."""
        for platform, key in (("reolink", "status_led"), ("unifi", "led_control")):
            with open(os.path.join(COMPONENTS, platform, "light.py"), encoding="utf-8") as f:
                src = f.read()
            blocks = re.findall(r"translation_key=\"%s\",(.*?)\)" % key, src, re.S)
            self.assertTrue(blocks, f"{platform} light {key} not found")
            for b in blocks:
                self.assertIn("entity_category=EntityCategory.CONFIG", b, f"{platform} {key}")


# ── Frontend: how hass.entities is built from the display list ──────────────────────────────────────────────
class Frontend(unittest.TestCase):
    def test_hass_entities_mapping(self):
        """The frontend maps the display list onto hass.entities field names Casora uses.

        Casora: everything reading hass.entities (entity_category, hidden, name, translation_key, platform,
        device_id, area_id, display_precision). Red: the frontend renamed a field."""
        try:
            import hass_frontend
        except ImportError:
            self.skipTest("hass_frontend not installed")
        root = os.path.join(os.path.dirname(hass_frontend.__file__), "frontend_latest")
        found = None
        for p in sorted(glob.glob(os.path.join(root, "app.*.js"))) + sorted(glob.glob(os.path.join(root, "*.js"))):
            with open(p, encoding="utf-8", errors="ignore") as f:
                m = re.search(r"\{entity_id:(\w+)\.ei,[^{}]*\}", f.read())
            if m:
                # entity_category:void 0!==a.ec?e.entity_categories[a.ec]:void 0 - the first a.<key> counts
                found = {k: a or b for k, a, b in re.findall(r"(\w+):(?:void 0!==\w+\.(\w+)|\w+\.(\w+))", m.group(0))}
                break
        self.assertIsNotNone(found, "mapping {entity_id:x.ei, ...} not found in the frontend")
        want = {"entity_id": "ei", "device_id": "di", "area_id": "ai", "translation_key": "tk", "platform": "pl",
                "entity_category": "ec", "name": "en", "hidden": "hb", "display_precision": "dp"}
        self.assertEqual({k: found.get(k) for k in want}, want)


class WeatherAttributes(unittest.TestCase):
    """Weather popup (#56). Casora: scripts/local/00-finder.js casoraDevice.weatherSources reads the felt temperature
    and the extra values from the weather entity's state attributes by these names, with the units in
    temperature_unit/wind_speed_unit; the felt curve is the attribute's history (casora-chart, attribute series)."""

    def test_attribute_names(self):
        from homeassistant.components.weather import const
        want = {"ATTR_WEATHER_APPARENT_TEMPERATURE": "apparent_temperature", "ATTR_WEATHER_DEW_POINT": "dew_point",
                "ATTR_WEATHER_WIND_GUST_SPEED": "wind_gust_speed", "ATTR_WEATHER_CLOUD_COVERAGE": "cloud_coverage",
                "ATTR_WEATHER_UV_INDEX": "uv_index", "ATTR_WEATHER_TEMPERATURE": "temperature",
                "ATTR_WEATHER_TEMPERATURE_UNIT": "temperature_unit", "ATTR_WEATHER_WIND_SPEED_UNIT": "wind_speed_unit"}
        self.assertEqual({k: getattr(const, k, None) for k in want}, want)

    def test_entity_offers_apparent_temperature(self):
        from homeassistant.components.weather import WeatherEntity
        self.assertTrue(hasattr(WeatherEntity, "native_apparent_temperature"))
        self.assertTrue(hasattr(WeatherEntity, "native_wind_gust_speed"))


class EnergyPrefs(unittest.TestCase):
    """Energy settings (#44). Casora: scripts/local/00-finder.js casoraEnergyHouse takes the house from
    energy/get_prefs: grid, solar and battery sources carry their power sensor in stat_rate (power_config for grid
    and battery), and HA writes the sensor to use into stat_rate (also its own template sensor for an inverted or a
    two sensor power_config). Legacy grid format power: [{ stat_rate }] is still read."""

    def test_source_types(self):
        import typing
        from homeassistant.components.energy import data
        keys = lambda t: set(typing.get_type_hints(t))  # noqa: E731
        self.assertLessEqual({"stat_rate", "power_config"}, keys(data.GridSourceType))
        self.assertIn("stat_rate", keys(data.SolarSourceType))
        self.assertLessEqual({"stat_rate", "power_config"}, keys(data.BatterySourceType))
        self.assertLessEqual({"stat_rate", "stat_rate_inverted", "stat_rate_from", "stat_rate_to"}, keys(data.PowerConfig))
        self.assertLessEqual({"stat_rate", "power_config"}, keys(data.GridPowerSourceType))

    def test_schemas_and_stat_rate(self):
        from homeassistant.components.energy import data
        grid = data.GRID_SOURCE_SCHEMA({
            "type": "grid", "stat_energy_from": "sensor.bezug", "stat_energy_to": None,
            "stat_cost": None, "entity_energy_price": None, "number_energy_price": None,
            "stat_compensation": None, "entity_energy_price_export": None, "number_energy_price_export": None,
            "power_config": {"stat_rate_inverted": "sensor.zaehler_leistung"}, "cost_adjustment_day": 0,
        })
        self.assertEqual(grid["power_config"], {"stat_rate_inverted": "sensor.zaehler_leistung"})
        solar = data.SOLAR_SOURCE_SCHEMA({"type": "solar", "stat_energy_from": "sensor.ertrag", "stat_rate": "sensor.pv_leistung"})
        self.assertEqual(solar["stat_rate"], "sensor.pv_leistung")
        battery = data.BATTERY_SOURCE_SCHEMA({
            "type": "battery", "stat_energy_from": "sensor.aus", "stat_energy_to": "sensor.ein",
            "power_config": {"stat_rate_from": "sensor.entladen", "stat_rate_to": "sensor.laden"},
        })
        self.assertIn("stat_rate_from", battery["power_config"])
        gen = lambda kind, cfg: f"sensor.generated_{kind}_power"  # noqa: E731
        mgr = data.EnergyManager.__new__(data.EnergyManager)
        self.assertEqual(mgr._process_grid_power(dict(grid), gen)["stat_rate"], "sensor.generated_grid_power")
        self.assertEqual(mgr._process_grid_power({**grid, "power_config": {"stat_rate": "sensor.netz"}}, gen)["stat_rate"], "sensor.netz")
        self.assertEqual(mgr._process_battery_power(dict(battery), gen)["stat_rate"], "sensor.generated_battery_power")


if __name__ == "__main__":
    print(f"HA {HA_VERSION}", flush=True)
    ok = unittest.main(verbosity=2, exit=False).result.wasSuccessful()
    sys.stdout.flush()
    sys.stderr.flush()
    # Plain exit can crash in HA's threads at interpreter shutdown (exit code 139); the result is known here.
    os._exit(0 if ok else 1)
