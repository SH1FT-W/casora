"""Fixture calendar replay without a running Home Assistant."""
import importlib.util
from datetime import date, datetime, timezone
from pathlib import Path
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

PATH = Path(__file__).resolve().parents[1] / "casora_mock" / "calendar_replay.py"
spec = importlib.util.spec_from_file_location("calendar_replay", PATH)
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
RULES_PATH = Path(__file__).resolve().parents[1] / "casora_mock" / "registry_rules.py"
rules_spec = importlib.util.spec_from_file_location("registry_rules", RULES_PATH)
rules = importlib.util.module_from_spec(rules_spec)
rules_spec.loader.exec_module(rules)


class CalendarReplayTest(unittest.TestCase):
    def test_repeated_hour_events_sort_by_instant_and_keep_elapsed_duration(self):
        zone = ZoneInfo("Europe/Amsterdam")
        events = [
            {"summary": "later", "start": "2026-10-25T02:10:00+01:00",
             "end": "2026-10-25T02:30:00+01:00"},
            {"summary": "earlier", "start": "2026-10-25T02:50:00+02:00",
             "end": "2026-10-25T02:20:00+01:00"},
        ]
        result = replay.events_for_range(
            events, date(2026, 10, 25), date(2026, 10, 25),
            datetime(2026, 10, 25, tzinfo=timezone.utc),
            datetime(2026, 10, 26, tzinfo=timezone.utc), local_tz=zone)
        self.assertEqual([event["summary"] for event in result], ["earlier", "later"])
        self.assertEqual(result[0]["end"].isoformat(), "2026-10-25T02:20:00+01:00")

    def test_query_in_second_fold_does_not_overlap_first_fold_event(self):
        zone = ZoneInfo("Europe/Amsterdam")
        events = [{"summary": "Naam-ABCDEF", "start": "2026-10-25T02:30:00+02:00",
                   "end": "2026-10-25T02:45:00+02:00"}]
        result = replay.events_for_range(
            events, date(2026, 10, 25), date(2026, 10, 25),
            datetime(2026, 10, 25, 2, 0, tzinfo=zone, fold=1),
            datetime(2026, 10, 25, 3, 0, tzinfo=zone), local_tz=zone)
        self.assertEqual(result, [])

    def test_spring_gap_moves_forward_and_keeps_elapsed_duration(self):
        zone = ZoneInfo("Europe/Amsterdam")
        events = [{"summary": "Naam-ABCDEF", "start": "2026-03-22T02:30:00+01:00",
                   "end": "2026-03-22T03:30:00+01:00"}]
        result = replay.events_for_range(
            events, date(2026, 3, 22), date(2026, 3, 29),
            datetime(2026, 3, 29, tzinfo=timezone.utc),
            datetime(2026, 3, 30, tzinfo=timezone.utc), local_tz=zone)
        self.assertEqual(result[0]["start"].isoformat(), "2026-03-29T03:30:00+02:00")
        self.assertEqual(result[0]["end"].isoformat(), "2026-03-29T04:30:00+02:00")

    def test_replay_preserves_second_occurrence_of_repeated_local_time(self):
        zone = ZoneInfo("Europe/Amsterdam")
        events = [{"summary": "Naam-ABCDEF", "start": "2026-10-25T02:30:00+01:00",
                   "end": "2026-10-25T02:45:00+01:00"}]
        result = replay.events_for_range(
            events, date(2026, 10, 25), date(2026, 10, 25),
            datetime(2026, 10, 25, tzinfo=timezone.utc),
            datetime(2026, 10, 26, tzinfo=timezone.utc), local_tz=zone)
        self.assertEqual(result[0]["start"].isoformat(), "2026-10-25T02:30:00+01:00")
        self.assertEqual(result[0]["end"].isoformat(), "2026-10-25T02:45:00+01:00")

    def test_all_day_overlap_uses_local_midnights_for_utc_query(self):
        events = [{"summary": "Naam-ABCDEF", "start": "2026-11-09", "end": "2026-11-10"}]
        zone = ZoneInfo("Europe/Amsterdam")
        for start, end, expected in [
            (datetime(2026, 11, 8, 23, tzinfo=timezone.utc),
             datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc), True),
            (datetime(2026, 11, 9, 23, tzinfo=timezone.utc),
             datetime(2026, 11, 9, 23, 30, tzinfo=timezone.utc), False),
        ]:
            with self.subTest(start=start):
                result = replay.events_for_range(
                    events, date(2026, 11, 9), date(2026, 11, 9),
                    start, end, local_tz=zone)
                self.assertEqual(bool(result), expected)

    def test_utc_sunday_query_uses_local_monday_for_current_week(self):
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 11, 15, 23, 30, tzinfo=timezone.utc).astimezone(tz)

        entity = {"events": [{"summary": "Naam-ABCDEF", "start": "2026-11-09",
                              "end": "2026-11-10"}]}
        with patch.object(replay, "datetime", Clock):
            result = replay.fixture_events(
                entity, {"calendar_export_date": "2026-11-09"},
                datetime(2026, 11, 15, tzinfo=timezone.utc),
                datetime(2026, 11, 23, tzinfo=timezone.utc),
                local_tz=ZoneInfo("Europe/Amsterdam"))
        self.assertEqual(result[0]["start"], date(2026, 11, 16))

    def test_timed_event_keeps_clock_and_duration_in_another_season(self):
        events = [{"summary": "Naam-ABCDEF", "start": "2026-01-05T09:30:00+01:00",
                   "end": "2026-01-05T10:30:00+01:00"}]
        result = replay.events_for_range(
            events, date(2026, 1, 5), date(2026, 7, 6),
            datetime(2026, 7, 6, tzinfo=timezone.utc),
            datetime(2026, 7, 7, tzinfo=timezone.utc),
            local_tz=ZoneInfo("Europe/Amsterdam"))
        self.assertEqual(result[0]["start"].isoformat(), "2026-07-06T09:30:00+02:00")
        self.assertEqual(result[0]["end"].isoformat(), "2026-07-06T10:30:00+02:00")

    def test_monday_stays_monday_on_every_test_house_weekday(self):
        events = [{"summary": "Naam-ABCDEF", "start": "2026-11-09T09:30:00+01:00",
                   "end": "2026-11-09T10:30:00+01:00"}]
        for day in range(9, 16):
            with self.subTest(today=day):
                result = replay.events_for_range(
                    events, date(2026, 11, 9), date(2026, 11, day),
                    datetime(2026, 11, 8, tzinfo=timezone.utc),
                    datetime(2026, 11, 23, tzinfo=timezone.utc))
                self.assertEqual(result[0]["start"].weekday(), 0)
                self.assertEqual(result[0]["start"].hour, 9)

    def test_missing_events_uses_legacy_calendar_but_empty_is_empty(self):
        start = datetime(2026, 11, 9, tzinfo=timezone.utc)
        end = datetime(2026, 11, 10, tzinfo=timezone.utc)
        fixture = {"calendar_export_date": "2026-11-09"}
        self.assertIsNone(replay.fixture_events({}, fixture, start, end))
        self.assertEqual(replay.fixture_events({"events": []}, fixture, start, end), [])

    def test_events_without_export_date_name_the_missing_key(self):
        start = datetime(2026, 11, 9, tzinfo=timezone.utc)
        end = datetime(2026, 11, 10, tzinfo=timezone.utc)
        entity = {"events": [{"start": "2026-11-09", "end": "2026-11-10", "summary": "Naam vrij"}]}
        with self.assertRaisesRegex(ValueError, "calendar_export_date"):
            replay.fixture_events(entity, {}, start, end)

    def test_all_day_and_midnight_crossing_events_overlap_query(self):
        events = [
            {"summary": "Naam-AAAAAA", "start": "2026-11-09", "end": "2026-11-12"},
            {"summary": "Naam-BBBBBB", "start": "2026-11-09T23:30:00+00:00",
             "end": "2026-11-10T01:15:00+00:00", "description": "Naam-CCCCCC",
             "location": "Naam-DDDDDD"},
        ]
        result = replay.events_for_range(events, date(2026, 11, 9), date(2026, 11, 16),
                                         datetime(2026, 11, 17, tzinfo=timezone.utc),
                                         datetime(2026, 11, 18, tzinfo=timezone.utc))
        self.assertEqual(result[0]["start"], date(2026, 11, 16))
        self.assertEqual(result[0]["end"], date(2026, 11, 19))
        self.assertEqual(result[1]["start"], datetime(2026, 11, 16, 23, 30, tzinfo=timezone.utc))
        self.assertEqual(result[1]["end"], datetime(2026, 11, 17, 1, 15, tzinfo=timezone.utc))
        self.assertEqual(result[1]["description"], "Naam-CCCCCC")
        self.assertEqual(result[1]["location"], "Naam-DDDDDD")

    def test_export_week_aligns_with_current_week_when_today_is_earlier(self):
        events = [{"summary": "Naam-ABCDEF", "start": "2026-11-11", "end": "2026-11-12"}]
        result = replay.events_for_range(events, date(2026, 11, 11), date(2026, 11, 16),
                                         datetime(2026, 11, 16, tzinfo=timezone.utc),
                                         datetime(2026, 11, 23, tzinfo=timezone.utc))
        self.assertEqual(result[0]["start"], date(2026, 11, 18))


class CalendarObjectTest(unittest.TestCase):
    """A calendar from a real export carries registry_platform; its events must still be served."""

    REAL_SHAPE = {"entity_id": "calendar.naam_kalender", "registry_platform": "local_calendar",
                  "unique_id": "naam-kalender-uid",
                  "events": [{"summary": "Naam-ABCDEF", "start": "2026-11-09T09:30:00+01:00",
                              "end": "2026-11-09T10:30:00+01:00"}]}

    def test_replay_serves_events_of_calendar_with_registry_platform(self):
        start = datetime(2026, 11, 8, tzinfo=timezone.utc)
        end = datetime(2026, 11, 23, tzinfo=timezone.utc)
        result = replay.fixture_events(self.REAL_SHAPE, {"calendar_export_date": "2026-11-09"}, start, end,
                                       today=date(2026, 11, 9), local_tz=ZoneInfo("Europe/Amsterdam"))
        self.assertEqual(len(result), 1)

    def test_calendar_with_registry_platform_and_events_gets_own_object(self):
        self.assertTrue(rules.has_own_object(self.REAL_SHAPE, "calendar"))

    def test_calendar_with_own_object_is_registered_under_mock_platform(self):
        self.assertEqual(rules.registry_platform_for(self.REAL_SHAPE, "calendar", "casora_mock"), "casora_mock")

    def test_legacy_calendar_with_registry_platform_keeps_skip(self):
        legacy = {"entity_id": "calendar.naam_alt", "registry_platform": "local_calendar"}
        self.assertFalse(rules.has_own_object(legacy, "calendar"))
        self.assertEqual(rules.registry_platform_for(legacy, "calendar", "casora_mock"), "local_calendar")

    def test_other_domain_with_registry_platform_keeps_skip(self):
        sensor = {"entity_id": "sensor.naam_messwert", "registry_platform": "velair", "events": []}
        self.assertFalse(rules.has_own_object(sensor, "sensor"))
        self.assertEqual(rules.registry_platform_for(sensor, "sensor", "casora_mock"), "velair")

    def test_calendar_without_registry_platform_gets_own_object(self):
        plain = {"entity_id": "calendar.naam_plain", "events": []}
        self.assertTrue(rules.has_own_object(plain, "calendar"))
        self.assertEqual(rules.registry_platform_for(plain, "calendar", "casora_mock"), "casora_mock")

    def test_calendar_with_own_object_gets_no_direct_state_write(self):
        # apply_fixture() runs before the platforms load: a direct write would make HA drop the object
        # ("ID calendar.x is already used"), so the object writes the state itself.
        self.assertFalse(rules.writes_state_directly(self.REAL_SHAPE, "calendar", in_platforms=True))

    def test_other_registry_platform_entity_keeps_direct_state_write(self):
        velair = {"entity_id": "sensor.naam_messwert", "registry_platform": "velair", "state": "1"}
        self.assertTrue(rules.writes_state_directly(velair, "sensor", in_platforms=True))

    def test_entity_outside_platforms_keeps_direct_state_write(self):
        self.assertTrue(rules.writes_state_directly({"entity_id": "sun.naam"}, "sun", in_platforms=False))

    def test_empty_events_calendar_with_registry_platform_gets_own_object(self):
        # "events": [] is a calendar with events (none): it keeps its object and shows no events.
        empty = {"entity_id": "calendar.naam_leer", "registry_platform": "google", "events": []}
        self.assertTrue(rules.has_own_object(empty, "calendar"))
        self.assertEqual(rules.registry_platform_for(empty, "calendar", "casora_mock"), "casora_mock")
        self.assertEqual(replay.fixture_events(empty, {"calendar_export_date": "2026-11-09"},
                                               datetime(2026, 11, 8, tzinfo=timezone.utc),
                                               datetime(2026, 11, 23, tzinfo=timezone.utc)), [])

    def test_stale_entry_under_old_platform_is_removed_and_exported_id_stays(self):
        # A house that loaded the export before still holds calendar.naam_kalender under local_calendar.
        registry = FakeRegistry({"calendar.naam_kalender": "local_calendar"})
        rules.clear_old_platform_entry(registry, self.REAL_SHAPE, "calendar", "casora_mock")
        entity_id = registry.create("calendar", rules.registry_platform_for(self.REAL_SHAPE, "calendar",
                                                                            "casora_mock"), "naam_kalender")
        self.assertEqual(entity_id, "calendar.naam_kalender")
        self.assertEqual(registry.entries, {"calendar.naam_kalender": "casora_mock"})

    def test_entry_already_under_mock_platform_is_kept(self):
        registry = FakeRegistry({"calendar.naam_kalender": "casora_mock"})
        rules.clear_old_platform_entry(registry, self.REAL_SHAPE, "calendar", "casora_mock")
        self.assertEqual(registry.entries, {"calendar.naam_kalender": "casora_mock"})

    def test_legacy_calendar_old_entry_is_kept(self):
        legacy = {"entity_id": "calendar.naam_alt", "registry_platform": "local_calendar"}
        registry = FakeRegistry({"calendar.naam_alt": "local_calendar"})
        rules.clear_old_platform_entry(registry, legacy, "calendar", "casora_mock")
        self.assertEqual(registry.entries, {"calendar.naam_alt": "local_calendar"})

    def test_other_domain_old_entry_is_kept(self):
        sensor = {"entity_id": "sensor.naam_messwert", "registry_platform": "velair", "events": []}
        registry = FakeRegistry({"sensor.naam_messwert": "velair"})
        rules.clear_old_platform_entry(registry, sensor, "sensor", "casora_mock")
        self.assertEqual(registry.entries, {"sensor.naam_messwert": "velair"})


class FakeRegistry:
    """Entity registry without HA: entity_id -> platform. create() suffixes a taken entity_id, as HA does."""

    def __init__(self, entries):
        self.entries = dict(entries)

    def platform_of(self, entity_id):
        return self.entries.get(entity_id)

    def remove(self, entity_id):
        self.entries.pop(entity_id, None)

    def create(self, domain, platform, object_id):
        entity_id, n = f"{domain}.{object_id}", 2
        while entity_id in self.entries:
            entity_id = f"{domain}.{object_id}_{n}"
            n += 1
        self.entries[entity_id] = platform
        return entity_id


class MockCalendarFeaturesTest(unittest.TestCase):
    def test_event_bits_are_cleared_whatever_the_fixture_says(self):
        # CREATE_EVENT 1, DELETE_EVENT 2, UPDATE_EVENT 4: the mock serves none of these services.
        for features in (1, 2, 4, 7):
            with self.subTest(features=features):
                self.assertEqual(replay.served_features(features), 0)

    def test_other_bits_are_kept(self):
        self.assertEqual(replay.served_features(31), 24)
        self.assertEqual(replay.served_features(0), 0)


if __name__ == "__main__":
    unittest.main()
