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
