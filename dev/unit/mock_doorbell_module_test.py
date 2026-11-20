"""The made-up binary-sensor doorbell of the mock house (dev/casora_mock/binklingel.py) without HA.

  python3 dev/unit/mock_doorbell_module_test.py

Covers what the haus.py snapshot cannot see: the door-scene picture flag of the camera entity (a
placeholder picture would mask the camera alert in a hand check) and the test service
casora_mock.binklingel_druecken (press on, then off after "dauer" seconds, klingel.py's pattern).
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location(
    "mock_binklingel", os.path.join(ROOT, "dev", "casora_mock", "binklingel.py"))
binklingel = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(binklingel)


def entities() -> dict:
    return {e["entity_id"]: e for e in binklingel.extra(None)["entities"]}


class ExtraTest(unittest.TestCase):
    def test_camera_carries_the_door_picture_flag(self):
        # entity.py MCamera: without a flag the camera shows the placeholder and the tile says
        # "Kein Bild", which masks the camera alert a hand check looks for.
        self.assertIs(entities()[binklingel.CAM].get("tuer"), True)

    def test_button_is_a_doorbell_binary_sensor_on_the_camera_device(self):
        ents = entities()
        bell, cam = ents[binklingel.BELL], ents[binklingel.CAM]
        self.assertEqual(bell["device_class"], "doorbell")
        self.assertEqual(bell["attributes"]["device_class"], "doorbell")
        self.assertIsNone(bell["translation_key"], "no Reolink visitor key: not a community doorbell")
        self.assertEqual(bell["device"], cam["device"], "button sits on the camera device")
        self.assertEqual(bell["state"], "off")
        self.assertIsNone(bell["area"])

    def test_reolink_style_device(self):
        dev = binklingel.extra(None)["devices"][0]
        self.assertEqual(dev["key"], binklingel.DEV)
        self.assertEqual(dev["manufacturer"], "Reolink")
        self.assertIsNone(dev["area"])


class _Services:
    def __init__(self):
        self.registered = {}

    def async_register(self, domain, service, fn):
        self.registered[(domain, service)] = fn


class _Hass:
    def __init__(self):
        self.services = _Services()


class _Mock:
    def __init__(self):
        self.calls = []

    def set(self, eid, state, **attrs):
        self.calls.append((eid, state))


class RingServiceTest(unittest.TestCase):
    """setup() registers casora_mock.binklingel_druecken: on now, off after "dauer" seconds."""

    def setUp(self):
        import asyncio

        self.asyncio = asyncio
        self.timers = []
        event = types.ModuleType("homeassistant.helpers.event")
        event.async_call_later = lambda hass, delay, action: self.timers.append((delay, action))
        helpers = types.ModuleType("homeassistant.helpers")
        helpers.event = event
        ha = types.ModuleType("homeassistant")
        ha.helpers = helpers
        self._patched = [("homeassistant", ha), ("homeassistant.helpers", helpers),
                         ("homeassistant.helpers.event", event)]
        self._saved = [(name, sys.modules.get(name)) for name, _ in self._patched]
        sys.modules.update(self._patched)
        self.hass, self.mock = _Hass(), _Mock()
        binklingel.setup(self.hass, self.mock)

    def tearDown(self):
        for name, mod in self._saved:
            if mod is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = mod

    def test_service_is_registered(self):
        self.assertIn(("casora_mock", "binklingel_druecken"), self.hass.services.registered)

    def test_press_turns_the_button_on_then_off(self):
        press = self.hass.services.registered[("casora_mock", "binklingel_druecken")]
        self.asyncio.run(press(SimpleNamespace(data={})))
        self.assertEqual(self.mock.calls, [(binklingel.BELL, "on")])
        (delay, release), = self.timers
        self.assertEqual(delay, 2, "default press length like klingel.py")
        self.asyncio.run(release(None))
        self.assertEqual(self.mock.calls, [(binklingel.BELL, "on"), (binklingel.BELL, "off")])

    def test_press_length_can_be_given(self):
        press = self.hass.services.registered[("casora_mock", "binklingel_druecken")]
        self.asyncio.run(press(SimpleNamespace(data={"dauer": 5})))
        (delay, _release), = self.timers
        self.assertEqual(delay, 5)


if __name__ == "__main__":
    unittest.main()
