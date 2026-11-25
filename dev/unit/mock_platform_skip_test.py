"""The platform skip of the test integration's startup (dev/casora_mock/skip.txt) without HA.

  python3 dev/unit/mock_platform_skip_test.py

A line "platform:<name>" in skip.txt tells the mock startup to create no entity of that registry
platform under the mock config entry - on the first start and on a second one - while the other
registry platforms (hassio, music_assistant, openweathermap) and the mock's own entities stay.
Without skip.txt (and with plain entity ids in it) startup behaves exactly as before.

Seam: async_setup_entry with a fake hass; the mock runs from a copy of dev/casora_mock with a
neutral fixture, so the shared fixture of the workspace is never read. Neutral names only.
"""

from __future__ import annotations

import asyncio
import datetime
import importlib.util
import json
import re
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
MOCK = ROOT / "dev" / "casora_mock"

# The neutral fixture: one entity per registry platform, plus one of the mock's own.
ENTITIES = [
    {"entity_id": "sensor.test_example_value", "registry_platform": "example_integration",
     "unique_id": "ex-value", "state": "7", "attributes": {}},
    {"entity_id": "button.test_example_refresh", "registry_platform": "example_integration",
     "unique_id": "ex-btn", "state": "unknown", "attributes": {}},
    {"entity_id": "sensor.test_system_disk", "registry_platform": "hassio",
     "unique_id": "hassio-disk", "state": "42", "attributes": {"unit_of_measurement": "%"}},
    {"entity_id": "sensor.test_music_title", "registry_platform": "music_assistant",
     "unique_id": "ma-title", "state": "Test Song", "attributes": {}},
    {"entity_id": "weather.test_weather_home", "registry_platform": "openweathermap",
     "unique_id": "ow-home", "state": "sunny", "attributes": {}},
    {"entity_id": "light.test_lamp", "state": "on", "attributes": {}},
]
OTHER_PLATFORMS = ("hassio", "music_assistant", "openweathermap")
AFFECTED = re.compile(r"^(casora_mock(\..*)?|homeassistant(\..*)?|voluptuous|aiohttp)$")


class FakeEntities:
    """The entity registry: startup's creations land in .created."""

    def __init__(self):
        self.created = []

    def async_get_or_create(self, domain, platform, unique_id, **kw):
        self.created.append(SimpleNamespace(domain=domain, platform=platform, unique_id=unique_id,
                                            config_entry=kw.get("config_entry")))
        return SimpleNamespace(entity_id=f"{domain}.{kw.get('suggested_object_id') or unique_id}",
                               area_id=None, icon=None, name=None, hidden_by=None, options={})

    def async_update_entity(self, entity_id, **kw):
        pass

    def async_update_entity_options(self, entity_id, key, value):
        pass


class FakeHass:
    """The part of hass the mock's startup touches, without a Home Assistant."""

    def __init__(self, tmp: Path, registry: FakeEntities):
        self.data = {}
        self.forwarded = []
        self.registry = registry
        self.states = SimpleNamespace(async_set=lambda *a, **k: None, get=lambda eid: None,
                                      is_state=lambda eid, state: False)
        self.services = SimpleNamespace(async_register=lambda *a, **k: None, has_service=lambda d, s: False)
        self.config = SimpleNamespace(components=[], path=lambda name: str(tmp / name))
        self.config_entries = SimpleNamespace(
            async_forward_entry_setups=self._forward, async_entries=lambda domain: [])
        self.http = SimpleNamespace(register_view=lambda view: None, server_port=None)

    async def _forward(self, entry, platforms):
        self.forwarded.extend(platforms)

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)

    async def async_add_import_executor_job(self, fn, *args):
        return {}  # no entity classes: the fake forwards nothing to platforms


def _module(name: str, **attrs) -> types.ModuleType:
    mod = types.ModuleType(name)
    mod.__path__ = []  # a package: "from <name> import <sub>" finds the submodule in sys.modules
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


def ha_stubs() -> None:
    """Puts minimal homeassistant and voluptuous stand-ins into sys.modules (entity.py and __init__.py imports)."""
    ha = _module("homeassistant")
    helpers = _module("homeassistant.helpers")
    components = _module("homeassistant.components")
    ha.helpers, ha.components = helpers, components

    class Vol:
        ALLOW_EXTRA = "allow_extra"

        @staticmethod
        def Schema(schema, **_kw):
            return schema

        @staticmethod
        def Required(name, **_kw):
            return name

        @staticmethod
        def In(values):
            return ("In", values)

    _module("voluptuous", Schema=Vol.Schema, Required=Vol.Required, In=Vol.In, ALLOW_EXTRA=Vol.ALLOW_EXTRA)
    _module("homeassistant.core", Event=object, HomeAssistant=object, ServiceCall=object,
            callback=lambda fn: fn)
    _module("homeassistant.config_entries", SOURCE_IMPORT="import", ConfigEntry=object)
    base_schema = SimpleNamespace(extend=lambda schema, **kwargs: schema)
    _module("homeassistant.components.websocket_api",
            BASE_COMMAND_MESSAGE_SCHEMA=base_schema, async_register_command=lambda *a, **k: None)
    now = lambda: datetime.datetime.now(datetime.timezone.utc)  # noqa: E731
    _module("homeassistant.util")
    _module("homeassistant.util.dt", utcnow=now, as_local=lambda value: value,
            utc_from_timestamp=datetime.datetime.fromtimestamp)
    sys.modules["homeassistant.util"].dt = sys.modules["homeassistant.util.dt"]

    _module("homeassistant.helpers.area_registry",
            async_get=lambda hass: SimpleNamespace(async_get_or_create=lambda name: SimpleNamespace(id=f"area-{name}")))
    _module("homeassistant.helpers.device_registry",
            async_get=lambda hass: SimpleNamespace(
                async_get_or_create=lambda **kw: SimpleNamespace(id=f"dev-{kw.get('identifiers')}", area_id=None),
                async_update_device=lambda dev_id, **kw: None),
            DeviceInfo=object)
    _module("homeassistant.helpers.entity_registry", async_get=lambda hass: hass.registry,
            RegistryEntryHider=lambda value: value)
    _module("homeassistant.helpers.entity", Entity=object)
    _module("homeassistant.helpers.event",
            async_track_state_change_event=lambda *a, **k: lambda: None,
            async_track_time_change=lambda *a, **k: lambda: None,
            async_call_later=lambda hass, delay, action: lambda: None)


def load_mock(tmp: Path, skip: str | None):
    """Copies dev/casora_mock into tmp (code only), writes the neutral fixture and skip.txt, imports the
    package from there and returns it. The setup side-effect modules are stubbed out."""
    shutil.copytree(MOCK, tmp / "casora_mock", ignore=shutil.ignore_patterns(
        "__pycache__", "fixture.json", "scenarios*.json", "settings.json", "hacs_casora.json",
        "stress.json", "bilder", "translations"))
    fixture = {"areas": [], "devices": [], "entities": [dict(e) for e in ENTITIES]}
    (tmp / "casora_mock" / "fixture.json").write_text(json.dumps(fixture), encoding="utf-8")
    if skip is not None:
        (tmp / "casora_mock" / "skip.txt").write_text(skip, encoding="utf-8")
    ha_stubs()
    # Must match the setup modules in dev/casora_mock/__init__.py (a new one there needs a stub here).
    for name in ("frigate", "klingel", "kamerabild", "coffee", "dishwasher", "live", "velair", "smart_heating"):
        sys.modules[f"casora_mock.{name}"] = types.ModuleType(f"casora_mock.{name}")
        sys.modules[f"casora_mock.{name}"].setup = lambda hass, mock: None
    spec = importlib.util.spec_from_file_location(
        "casora_mock", tmp / "casora_mock" / "__init__.py",
        submodule_search_locations=[str(tmp / "casora_mock")])
    module = importlib.util.module_from_spec(spec)
    sys.modules["casora_mock"] = module
    spec.loader.exec_module(module)
    # The startup builds the full house; this test only wants the neutral fixture, so compose does nothing.
    module.compose = lambda *args: None
    return module


def start(mock_module, hass: FakeHass):
    """One startup of the mock, as Home Assistant would call it."""
    entry = SimpleNamespace(entry_id="mock-entry", async_on_unload=lambda fn: None)
    asyncio.run(mock_module.async_setup_entry(hass, entry))


class PlatformSkipTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self._saved = {name: mod for name, mod in sys.modules.items() if AFFECTED.match(name)}
        for name in self._saved:
            sys.modules.pop(name)
        self.addCleanup(self._restore_modules)
        self.registry = FakeEntities()
        self.hass = FakeHass(self.tmp, self.registry)

    def _restore_modules(self):
        for name in [name for name in sys.modules if AFFECTED.match(name)]:
            sys.modules.pop(name)
        sys.modules.update(self._saved)

    def world(self, skip: str | None):
        """Loads the mock once with the given skip.txt and starts it; returns the loaded module."""
        mock = load_mock(self.tmp, skip)
        start(mock, self.hass)
        return mock

    def platforms(self):
        return {created.platform for created in self.registry.created}

    def test_skipped_platform_is_never_created(self):
        self.world("platform:example_integration\n")
        self.assertNotIn("example_integration", self.platforms())

    def test_skipped_platform_stays_away_on_a_second_start(self):
        mock = self.world("platform:example_integration\n")
        self.assertEqual([c for c in self.registry.created if c.platform == "example_integration"], [])
        second_registry = FakeEntities()  # a restart begins with an empty registry
        second = FakeHass(self.tmp, second_registry)
        start(mock, second)
        self.assertNotIn("example_integration", {c.platform for c in second_registry.created})
        for platform in OTHER_PLATFORMS:
            self.assertIn(platform, {c.platform for c in second_registry.created})

    def test_other_registry_platforms_are_still_created(self):
        self.world("platform:example_integration\n")
        for platform in OTHER_PLATFORMS:
            self.assertIn(platform, self.platforms())

    def test_the_mocks_own_entities_are_still_created(self):
        self.world("platform:example_integration\n")
        own = [c for c in self.registry.created if c.platform == "casora_mock"]
        self.assertTrue(any(c.domain == "light" for c in own))

    def test_without_skip_txt_every_platform_is_created_as_before(self):
        self.world(None)
        self.assertIn("example_integration", self.platforms())
        for platform in OTHER_PLATFORMS:
            self.assertIn(platform, self.platforms())

    def test_entity_ids_in_skip_txt_still_skip_only_those_entities(self):
        self.world("sensor.test_example_value\n")
        creations = {(c.platform, c.unique_id) for c in self.registry.created}
        self.assertNotIn(("example_integration", "ex-value"), creations)
        self.assertIn(("example_integration", "ex-btn"), creations)
        for platform in OTHER_PLATFORMS:
            self.assertIn(platform, self.platforms())


if __name__ == "__main__":
    unittest.main()
