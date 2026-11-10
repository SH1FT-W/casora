"""Registry values of the test house's entities (dev/casora_mock/registry_rules.py) without HA.

  python3 dev/unit/mock_registry_test.py

1. "hidden" in the fixture: hidden_by INTEGRATION; a user's hiding always stays; "hidden": false un-hides only
   what the integration hid; a fixture entity without the key leaves the registry alone.
2. "display_precision" in the fixture: options.sensor.suggested_display_precision; the user's display_precision
   stays; a missing key clears only the suggested value.
"""

from __future__ import annotations

import importlib.util
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location(
    "mock_registry_rules", os.path.join(ROOT, "dev", "casora_mock", "registry_rules.py"))
rules = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rules)
_haus_spec = importlib.util.spec_from_file_location(
    "mock_haus", os.path.join(ROOT, "dev", "casora_mock", "haus.py"))
haus = importlib.util.module_from_spec(_haus_spec)
_haus_spec.loader.exec_module(haus)


class HiddenByTest(unittest.TestCase):
    def test_fixture_hidden_becomes_integration(self):
        self.assertEqual(rules.hidden_by_for({"hidden": True}, None), "integration")

    def test_fixture_hidden_stays_integration(self):
        self.assertEqual(rules.hidden_by_for({"hidden": True}, "integration"), "integration")

    def test_fixture_not_hidden_leaves_visible_entity_visible(self):
        self.assertIsNone(rules.hidden_by_for({"hidden": False}, None))

    def test_fixture_not_hidden_unhides_what_the_integration_hid(self):
        self.assertIsNone(rules.hidden_by_for({"hidden": False}, "integration"))

    def test_user_hidden_stays_hidden_when_fixture_not_hidden(self):
        self.assertEqual(rules.hidden_by_for({"hidden": False}, "user"), "user")

    def test_user_hidden_stays_hidden_when_fixture_hidden(self):
        self.assertEqual(rules.hidden_by_for({"hidden": True}, "user"), "user")

    def test_missing_key_keeps_integration_hiding_from_ha(self):
        # HA hides some entities as integration itself (entity_registry_visible_default=False); a fixture
        # without the key (the maintainer's) must not un-hide them on every start.
        self.assertEqual(rules.hidden_by_for({}, "integration"), "integration")

    def test_missing_key_keeps_user_hiding(self):
        self.assertEqual(rules.hidden_by_for({}, "user"), "user")

    def test_missing_key_on_visible_entity_stays_visible(self):
        self.assertIsNone(rules.hidden_by_for({}, None))


class SensorOptionsTest(unittest.TestCase):
    def test_suggested_precision_written_when_registry_has_none(self):
        self.assertEqual(rules.sensor_options_for({"display_precision": 1}, None),
                         {"suggested_display_precision": 1})

    def test_user_display_precision_is_kept(self):
        self.assertEqual(rules.sensor_options_for({"display_precision": 1}, {"display_precision": 2}),
                         {"display_precision": 2, "suggested_display_precision": 1})

    def test_user_display_precision_is_never_overwritten(self):
        current = {"display_precision": 2, "suggested_display_precision": 0}
        self.assertEqual(rules.sensor_options_for({"display_precision": 1}, current),
                         {"display_precision": 2, "suggested_display_precision": 1})

    def test_missing_key_clears_only_the_suggested_value(self):
        current = {"display_precision": 2, "suggested_display_precision": 1}
        self.assertEqual(rules.sensor_options_for({}, current), {"display_precision": 2})

    def test_missing_key_without_user_value_leaves_no_sensor_options(self):
        self.assertIsNone(rules.sensor_options_for({}, {"suggested_display_precision": 1}))
        self.assertIsNone(rules.sensor_options_for({}, None))

    def test_other_sensor_options_are_kept(self):
        current = {"custom_unit_of_measurement": "kWh", "suggested_display_precision": 1}
        self.assertEqual(rules.sensor_options_for({}, current), {"custom_unit_of_measurement": "kWh"})

    def test_current_dict_is_not_changed(self):
        current = {"display_precision": 2, "suggested_display_precision": 1}
        rules.sensor_options_for({"display_precision": 3}, current)
        self.assertEqual(current, {"display_precision": 2, "suggested_display_precision": 1})


class SnapshotHiddenTest(unittest.TestCase):
    """haus.py snapshot() is hass.entities as the frontend gets it: "hidden" follows the fixture."""

    def hidden_in_snapshot(self, entity: dict) -> bool:
        fixture = {"areas": [], "devices": [], "entities": [dict(entity, entity_id="sensor.test", state="1")]}
        return haus.snapshot(fixture)["entities"]["sensor.test"]["hidden"]

    def test_fixture_hidden_true_is_hidden(self):
        self.assertIs(self.hidden_in_snapshot({"hidden": True}), True)

    def test_fixture_hidden_false_is_visible(self):
        self.assertIs(self.hidden_in_snapshot({"hidden": False}), False)

    def test_missing_key_is_visible(self):
        self.assertIs(self.hidden_in_snapshot({}), False)


if __name__ == "__main__":
    unittest.main()
