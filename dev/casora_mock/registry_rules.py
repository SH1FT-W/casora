"""Registry values the test house writes for a fixture entity. No HA import: unit test in dev/unit/.

The fixture says "hidden" (bool) and "display_precision" (int). The registry keeps hidden_by (user or
integration) and options.sensor (the user's display_precision and the integration's suggested one).
The user's values always win; the mock only changes what it owns.
"""
from __future__ import annotations

from typing import Mapping

INTEGRATION = "integration"
USER = "user"


def hidden_by_for(entity: Mapping, current: str | None) -> str | None:
    """hidden_by the mock sets for a fixture entity, given the registry's current hidden_by.

    "hidden": true hides it as integration; "hidden": false un-hides it, but only what the integration
    hid. A fixture entity without the key leaves the registry alone. A user's hiding always stays.
    """
    if "hidden" not in entity:
        return current
    if entity["hidden"]:
        return USER if current == USER else INTEGRATION
    return None if current == INTEGRATION else current


def sensor_options_for(entity: Mapping, current: Mapping | None) -> dict | None:
    """options.sensor with the suggested precision from the fixture's "display_precision".

    A missing key removes the suggested value. The user's display_precision and other keys stay. None when
    nothing is left: the registry then drops the sensor options.
    """
    opts = dict(current or {})
    opts.pop("suggested_display_precision", None)
    precision = entity.get("display_precision")
    if precision is not None:
        opts["suggested_display_precision"] = precision
    return opts or None


def has_own_object(entity: Mapping, domain: str) -> bool:
    """Whether setup_domain() gives the fixture entity its own entity object.

    An entity registered under another integration (registry_platform, velair.py) has none: its state is
    written directly. The exception is a calendar with "events": the replay serves its events through its
    object, and the calendar websocket and REST reads need one. Every other entity keeps the skip.
    """
    if not entity.get("registry_platform"):
        return True
    return domain == "calendar" and "events" in entity


def registry_platform_for(entity: Mapping, domain: str, default: str) -> str:
    """Platform the registry entry is written under.

    HA files an entity object under the config entry's platform (default), so an object needs its registry
    entry under that platform too: otherwise HA creates a second entry and the entity_id gets a suffix
    (calendar.x_2). Entities without an object keep their registry_platform.
    """
    if has_own_object(entity, domain):
        return default
    return entity["registry_platform"]
