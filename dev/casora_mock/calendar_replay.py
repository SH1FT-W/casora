"""Replay calendar fixture events relative to the current week."""
from datetime import date, datetime, time, timedelta, timezone


def fixture_events(entity, fixture, start, end, today=None, local_tz=None):
    """Return None for a legacy calendar, otherwise its replayed events."""
    if "events" not in entity:
        return None
    if not entity["events"]:
        return []
    return events_for_range(entity["events"], date.fromisoformat(fixture["calendar_export_date"]),
                            today or datetime.now(local_tz or start.tzinfo).date(), start, end, local_tz)


def events_for_range(events, export_date, today, start, end, local_tz=None):
    """Return fixture events shifted by whole weeks and overlapping the range."""
    shift = timedelta(days=(today - export_date).days - today.weekday() + export_date.weekday())
    result = []
    for event in events:
        item = dict(event)
        for key in ("start", "end"):
            value = item[key]
            item[key] = (datetime.fromisoformat(value) if "T" in value else date.fromisoformat(value)) + shift
        if local_tz is not None and isinstance(item["start"], datetime):
            duration = (item["end"].astimezone(timezone.utc)
                        - item["start"].astimezone(timezone.utc))
            original_offset = item["start"].utcoffset()
            first = item["start"].replace(tzinfo=local_tz, fold=0)
            second = first.replace(fold=1)
            # Round-trip through UTC: a nonexistent spring time moves forward.
            normalized = first.astimezone(timezone.utc).astimezone(local_tz)
            if normalized.replace(tzinfo=None) != first.replace(tzinfo=None):
                item["start"] = normalized
            elif second.utcoffset() != first.utcoffset() and second.utcoffset() == original_offset:
                item["start"] = second
            else:
                item["start"] = first
            item["end"] = (item["start"].astimezone(timezone.utc) + duration).astimezone(local_tz)
        def instant(value):
            if not isinstance(value, datetime):
                value = datetime.combine(value, time.min, local_tz or start.tzinfo)
            return value.astimezone(timezone.utc)
        if instant(item["start"]) < instant(end) and instant(item["end"]) > instant(start):
            result.append(item)
    return sorted(result, key=lambda event: instant(event["start"]))
