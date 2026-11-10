"""Registry values the test house writes for a fixture entity. No HA import: unit test in dev/unit/.

The fixture says "hidden" (bool) and "display_precision" (int). The registry keeps hidden_by (user or
integration) and options.sensor (the user's display_precision and the integration's suggested one).
The user's values always win; the mock only changes what it owns.
"""
from __future__ import annotations

from typing import Mapping

INTEGRATION = "integration"
USER = "user"


def hidden_by_for(hidden: bool, current: str | None) -> str | None:
    """hidden_by the mock sets. A user's hiding always stays; the mock un-hides only what it hid itself."""
    if current == USER:
        return USER
    return INTEGRATION if hidden else None


def sensor_options_for(current: Mapping | None, precision: int | None) -> dict | None:
    """options.sensor with the suggested precision set to `precision` (None removes it).

    The user's display_precision and other keys stay. None when nothing is left: the registry then
    drops the sensor options.
    """
    opts = dict(current or {})
    opts.pop("suggested_display_precision", None)
    if precision is not None:
        opts["suggested_display_precision"] = precision
    return opts or None
