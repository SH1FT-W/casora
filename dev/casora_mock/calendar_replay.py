"""Replay calendar fixture events relative to the current week."""
from datetime import date, datetime, time, timedelta


def fixture_events(entity, fixture, start, end, today=None):
    """Return None for a legacy calendar, otherwise its replayed events."""
    if "events" not in entity:
        return None
    if not entity["events"]:
        return []
    return events_for_range(entity["events"], date.fromisoformat(fixture["calendar_export_date"]),
                            today or datetime.now(start.tzinfo).date(), start, end)


def events_for_range(events, export_date, today, start, end):
    """Return fixture events shifted by whole weeks and overlapping the range."""
    shift = timedelta(days=(today - export_date).days - today.weekday() + export_date.weekday())
    result = []
    for event in events:
        item = dict(event)
        for key in ("start", "end"):
            value = item[key]
            item[key] = (datetime.fromisoformat(value) if "T" in value else date.fromisoformat(value)) + shift
        def instant(value):
            return value if isinstance(value, datetime) else datetime.combine(value, time.min, start.tzinfo)
        if instant(item["start"]) < end and instant(item["end"]) > start:
            result.append(item)
    return sorted(result, key=lambda event: instant(event["start"]))
