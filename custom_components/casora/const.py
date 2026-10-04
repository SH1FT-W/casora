"""Konstanten der Casora-Integration (Fork von Hemma)."""

import json
from pathlib import Path

DOMAIN = "casora"
# Casoras öffentliches Repo – Updates und Karten-Updates kommen anonym aus dessen
# Releases (update_source.py).
UPDATE_REPO = "SH1FT-W/casora"

# manifest.json is the single source of truth: HACS reads it.
VERSION = json.loads(
    (Path(__file__).parent / "manifest.json").read_text(encoding="utf-8")
)["version"]

URL_BASE = "/casora_panel"

SCRIPTS_URL_BASE = "/casora_scripts"
SCRIPTS_DIR = f"custom_components/{DOMAIN}/scripts"

# Order matters: casora-core defines what the others build on, and casora-i18n
# wants to be in place before core flushes its waiter queue.
SHARED_SCRIPTS = (
    "casora-i18n.js",
    "casora-core.js",
    "casora-icons.js",
    "casora-redirect.js",
    "layout-offsets.js",
    "layout-card-modified.js",
    "smart-row.js",
    "filter-overlay.js",
    # Casora: eigene Karte und eigene Erweiterungen (Lader für scripts/local/)
    "casora-swipe-card.js",
    "casora-local.js",
    # Übergang: alte Namen für nicht umgestellte Dashboards
    "casora-kompat.js",
)

# Lader, dessen ?v= aus der jüngsten Änderung seiner Module berechnet wird.
LOCAL_LOADER = "casora-local.js"
LOCAL_MODULES_DIR = "local"

# Frühere Ressourcen aus www/, die jetzt die Integration ausliefert und die
# sonst doppelt laden würden – werden beim Start entfernt.
LEGACY_RESOURCES = ("/local/hemma/scripts/hemma-notify-local.js",)
# Ressourcen aus Hemma bzw. Casora ≤ 0.1 (alte Adresse /hemma_scripts): werden entfernt.
LEGACY_SCRIPT_BASES = ("/hemma_scripts/",)

ASSETS_URL_BASE = "/casora_assets"
ASSETS_DIR = f"custom_components/{DOMAIN}/assets"
USER_ASSETS_DIR = "www/casora"
# Frühere Ablage (Casora): füllt Lücken, wenn www/casora eine Datei nicht hat.
LEGACY_USER_ASSETS_DIR = "www/hemma"

# The panel keeps the url it was given in 2.0.5; only its title changed.
PANEL_URL = "casora-studio"
PANEL_TITLE = "Casora Studio"
PANEL_ICON = "mdi:view-dashboard-edit"

# Registered at /casora before the rename, so setup removes the old one.
LEGACY_PANEL_URL = "hemma"
