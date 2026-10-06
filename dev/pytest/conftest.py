"""pytest mit pytest-homeassistant-custom-component (T-04) – Integrationstests ohne Docker-HA.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest -q

Das Repo-Wurzelverzeichnis steht auf sys.path, damit custom_components.casora gefunden wird.
"""

from __future__ import annotations

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

# Das Plugin bringt ein eigenes Paket „custom_components“ (testing_config) mit, das zuerst
# geladen wird – dort Casoras Ordner mit eintragen.
import custom_components  # noqa: E402

if os.path.join(ROOT, "custom_components") not in list(custom_components.__path__):
    custom_components.__path__.append(os.path.join(ROOT, "custom_components"))


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Eigene Integrationen (custom_components) in jedem Test erlauben."""
    yield
