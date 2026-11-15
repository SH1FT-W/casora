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


def clear_old_platform_entry(registry, entity: Mapping, domain: str, default: str) -> None:
    """Remove the entry under another platform that owns the entity_id of an entity the mock now gives an object.

    A house that loaded the export before holds (calendar, <integration>, uid) and owns the exported entity_id.
    Removing that entry frees the id, so the mock's entry keeps the exported entity_id. Only entities with a
    registry_platform and their own object are touched; the registry is any object with platform_of(entity_id)
    and remove(entity_id).
    """
    if not entity.get("registry_platform") or not has_own_object(entity, domain):
        return
    current = registry.platform_of(entity["entity_id"])
    if current is not None and current != default:
        registry.remove(entity["entity_id"])


def writes_state_directly(entity: Mapping, domain: str, in_platforms: bool) -> bool:
    """Whether apply_fixture() writes the state itself, because no entity object will.

    Outside the platforms there is no object. Inside them the object writes it, except an entity registered
    under another integration without an own object (Velair's sensors). apply_fixture() runs before the
    platforms load, so a direct write of an entity that gets an object makes HA drop that object.
    """
    if not in_platforms:
        return True
    return bool(entity.get("registry_platform")) and not has_own_object(entity, domain)
