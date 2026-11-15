"""Replay calendar state through HA's calendar getters and Casora's greeting."""
import asyncio
import json
from datetime import timedelta
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

try:
    from homeassistant.util import dt as dt_util
    from dev.casora_mock.entity import build_classes
except ModuleNotFoundError as exc:
    if exc.name != "homeassistant":
        raise
    dt_util = None


@unittest.skipIf(dt_util is None, "Home Assistant is not installed")
class CalendarStateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calendar_class = build_classes(None)["calendar"]

    def calendar(self, events, attrs=None):
        eid = "calendar.mock"
        entity = {"entity_id": eid}
        if events is not None:
            entity["events"] = events
        mock = SimpleNamespace(
            entities={eid: entity},
            store={eid: ("on", attrs or {})},
            fixture={"calendar_export_date": dt_util.now().date().isoformat()},
        )
        return self.calendar_class(mock, eid)

    def event(self, start, end, uid="event-1", summary="Naam-cccccc"):
        return {"start": start.isoformat(), "end": end.isoformat(), "uid": uid, "summary": summary}

    def served(self, calendar):
        # Entity._async_write_ha_state merges these in this order.
        return {"state": calendar.state, "attributes": {
            **(calendar.state_attributes or {}), **calendar.extra_state_attributes}}

    def test_replayed_api_event_supplies_greeting_state_and_filter_decision(self):
        now = dt_util.now().replace(microsecond=0)
        start = now + timedelta(hours=2)
        event = self.event(start, start + timedelta(hours=1))
        meta = {"entries": ["Naam-aaaaaa"], "events": {
            "event-1": {"title": "Naam-cccccc", "matches": ["Naam-aaaaaa"]}},
            "message": {"title": "Naam-old", "matches": []}}
        calendar = self.calendar([event], {"start_time": "Naam-start", "end_time": "Naam-end",
                                           "message": "Naam-old", "casora_filter_match": meta})
        api = asyncio.run(calendar.async_get_events(None, now, start + timedelta(hours=2)))
        state = self.served(calendar)
        self.assertEqual(api[0].summary, state["attributes"]["message"])
        self.assertEqual(state["attributes"]["start_time"], api[0].start_datetime_local.strftime("%Y-%m-%d %H:%M:%S"))
        self.assertEqual(state["attributes"]["casora_filter_match"]["message"], meta["events"]["event-1"])
        script = """
const fs = require('fs'), vm = require('vm');
const [state, now] = JSON.parse(fs.readFileSync(0, 'utf8'));
const window = { addEventListener() {}, casoraSettings: () => ({}) };
const ctx = vm.createContext({window, document: {querySelector: () => null}, console, setTimeout});
const filter = 'custom_components/casora/scripts/local/06a-kalender-filter.js';
if (fs.existsSync(filter)) vm.runInContext(fs.readFileSync(filter, 'utf8'), ctx);
vm.runInContext(fs.readFileSync('custom_components/casora/scripts/local/00-finder.js', 'utf8'), ctx);
const hass = {states: {'calendar.mock': state}};
const result = window.casoraHomeNext(hass, {casora_greeting_next: true}, new Date(now));
if (!result.includes('Naam-cccccc')) throw Error('missing greeting: ' + result);
if (window.casoraCalendarAllows) {
  window.casoraSettings = () => ({calendar_filter: 'Naam-aaaaaa'});
  if (window.casoraHomeNext(hass, {casora_greeting_next: true}, new Date(now)) !== '') throw Error('filter ignored');
  state.attributes.casora_filter_match.message.matches = [];
  if (!window.casoraHomeNext(hass, {casora_greeting_next: true}, new Date(now)).includes('Naam-cccccc')) throw Error('negative ignored');
  delete state.attributes.casora_filter_match.message;
  window.casoraSettings = () => ({calendar_filter: 'cccc'});
  if (window.casoraHomeNext(hass, {casora_greeting_next: true}, new Date(now)) !== '') throw Error('fallback ignored');
}
"""
        subprocess.run(["node", "-e", script], input=json.dumps([state, now.isoformat()]),
                       text=True, cwd=ROOT, check=True)

    def test_empty_replay_drops_old_calendar_fields_and_message_decision(self):
        calendar = self.calendar([], {"message": "Naam-old", "start_time": "Naam-start",
                                      "casora_filter_match": {"entries": [], "events": {},
                                                              "message": {"title": "Naam-old", "matches": []}}})
        state = self.served(calendar)
        self.assertEqual(state["state"], "off")
        self.assertNotIn("message", state["attributes"])
        self.assertNotIn("start_time", state["attributes"])
        self.assertNotIn("message", state["attributes"]["casora_filter_match"])

    def test_legacy_calendar_keeps_snapshot(self):
        calendar = self.calendar(None, {"message": "Naam-old", "start_time": "Naam-start"})
        self.assertEqual(self.served(calendar), {"state": "on", "attributes": {
            "message": "Naam-old", "start_time": "Naam-start"}})

    def test_running_multiday_all_day_event_precedes_future_event(self):
        now = dt_util.now()
        day = now.date()
        all_day = self.event(day - timedelta(days=1), day + timedelta(days=2), "day", "Naam-day")
        future = self.event(now + timedelta(hours=1), now + timedelta(hours=2))
        calendar = self.calendar([future, all_day], {"all_day": False})
        state = self.served(calendar)
        self.assertEqual(state["state"], "on")
        self.assertEqual(state["attributes"]["message"], "Naam-day")
        self.assertTrue(state["attributes"]["all_day"])
        self.assertTrue(calendar.should_poll)

    def test_event_selection_refreshes_after_event_end(self):
        from unittest.mock import patch
        now = dt_util.now().replace(microsecond=0)
        first = self.event(now + timedelta(minutes=1), now + timedelta(minutes=2), "first", "Naam-first")
        second = self.event(now + timedelta(minutes=3), now + timedelta(minutes=4), "second", "Naam-second")
        calendar = self.calendar([first, second])
        with patch.object(dt_util, "now", return_value=now):
            self.assertEqual(self.served(calendar)["attributes"]["message"], "Naam-first")
        with patch.object(dt_util, "now", return_value=now + timedelta(minutes=2, seconds=1)):
            self.assertEqual(self.served(calendar)["attributes"]["message"], "Naam-second")

    def test_duplicate_uid_or_wrong_title_does_not_bind_decision(self):
        now = dt_util.now().replace(microsecond=0)
        start = now + timedelta(hours=1)
        first = self.event(start, start + timedelta(minutes=20))
        second = self.event(start + timedelta(hours=1), start + timedelta(hours=2))
        decision = {"title": "Naam-cccccc", "matches": ["Naam-aaaaaa"]}
        for events, value in [([first, second], decision),
                              ([first], {"title": "Naam-other", "matches": []})]:
            with self.subTest(events=events, value=value):
                calendar = self.calendar(events, {"casora_filter_match": {
                    "entries": ["Naam-aaaaaa"], "events": {"event-1": value},
                    "message": decision}})
                self.assertNotIn("message", self.served(calendar)["attributes"]["casora_filter_match"])


if __name__ == "__main__":
    unittest.main()
