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


class CalendarReplayTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
