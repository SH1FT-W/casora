"""Test helpers from Home Assistant's test package, whichever one is installed.

HA 2026.11+: pytest-homeassistant (version = HA version, run pytest with -p no:respx).
Up to HA 2026.10: pytest-homeassistant-custom-component (discontinued 03.11.2026, last release pins 2026.10.4).
"""

from __future__ import annotations

try:
    from pytest_homeassistant.common import MockConfigEntry
except ImportError:  # HA 2026.10 and older
    from pytest_homeassistant_custom_component.common import MockConfigEntry

__all__ = ["MockConfigEntry"]
