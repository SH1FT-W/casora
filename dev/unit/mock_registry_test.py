"""Registry values of the test house's entities (dev/casora_mock/registry_rules.py) without HA.

  python3 dev/unit/mock_registry_test.py

1. "hidden" in the fixture: hidden_by INTEGRATION; a user's hiding always stays; the mock un-hides only what it hid.
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


def hidden_for(entity: dict, current: str | None) -> str | None:
    """hidden_by for a fixture entity, as build_registry reads the "hidden" key (missing = not hidden)."""
    return rules.hidden_by_for(bool(entity.get("hidden")), current)


class HiddenByTest(unittest.TestCase):
    def test_fixture_hidden_becomes_integration(self):
        self.assertEqual(hidden_for({"hidden": True}, None), "integration")

    def test_fixture_hidden_stays_integration(self):
        self.assertEqual(hidden_for({"hidden": True}, "integration"), "integration")

    def test_visible_fixture_entity_stays_visible(self):
        self.assertIsNone(hidden_for({"hidden": False}, None))
        self.assertIsNone(hidden_for({}, None), "missing key counts as not hidden")

    def test_unhides_what_the_mock_hid(self):
        self.assertIsNone(hidden_for({"hidden": False}, "integration"))
        self.assertIsNone(hidden_for({}, "integration"))

    def test_user_hidden_stays_hidden_when_fixture_not_hidden(self):
        self.assertEqual(hidden_for({"hidden": False}, "user"), "user")
        self.assertEqual(hidden_for({}, "user"), "user")

    def test_user_hidden_stays_hidden_when_fixture_hidden(self):
        self.assertEqual(hidden_for({"hidden": True}, "user"), "user")


class SensorOptionsTest(unittest.TestCase):
    def test_suggested_precision_written_when_registry_has_none(self):
        self.assertEqual(rules.sensor_options_for(None, 1), {"suggested_display_precision": 1})

    def test_user_display_precision_is_kept(self):
        self.assertEqual(rules.sensor_options_for({"display_precision": 2}, 1),
                         {"display_precision": 2, "suggested_display_precision": 1})

    def test_user_display_precision_is_never_overwritten(self):
        current = {"display_precision": 2, "suggested_display_precision": 0}
        self.assertEqual(rules.sensor_options_for(current, 1),
                         {"display_precision": 2, "suggested_display_precision": 1})

    def test_missing_key_clears_only_the_suggested_value(self):
        current = {"display_precision": 2, "suggested_display_precision": 1}
        self.assertEqual(rules.sensor_options_for(current, None), {"display_precision": 2})

    def test_missing_key_without_user_value_leaves_no_sensor_options(self):
        self.assertIsNone(rules.sensor_options_for({"suggested_display_precision": 1}, None))
        self.assertIsNone(rules.sensor_options_for(None, None))

    def test_other_sensor_options_are_kept(self):
        current = {"custom_unit_of_measurement": "kWh", "suggested_display_precision": 1}
        self.assertEqual(rules.sensor_options_for(current, None), {"custom_unit_of_measurement": "kWh"})

    def test_current_dict_is_not_changed(self):
        current = {"display_precision": 2, "suggested_display_precision": 1}
        rules.sensor_options_for(current, 3)
        self.assertEqual(current, {"display_precision": 2, "suggested_display_precision": 1})


if __name__ == "__main__":
    unittest.main()
