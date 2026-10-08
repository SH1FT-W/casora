"""HACS-artige Update-Entität für Casora im Testhaus – nur auf Wunsch.

Liegt im Mock-Ordner eine Datei hacs_casora.json ({"installed": "v1.1.1", "latest": "v1.1.2",
"install_s": 3, "fail": false}), gibt es update.casora_update wie HACS' Eintrag für das
Casora-Repo (release_url zeigt auf das Repo, Funktionen wie HACS: Installieren, bestimmte
Version, Fortschritt, Versionshinweise). update.install setzt in_progress, wartet install_s
Sekunden und meldet dann die neue Version als installiert (Neustart-Hinweis wie HACS).
Casora selbst hält Casora nur für HACS-verwaltet, wenn auch .storage/hacs.repositories das Repo
als installiert führt – das legt der Test neben die Konfiguration. Ohne Datei: nichts.
"""
from __future__ import annotations

REPO = "SH1FT-W/casora"
EID = "update.casora_update"


def extra(cfg: dict) -> dict:
    inst, latest = str(cfg.get("installed") or "v1.0.0"), str(cfg.get("latest") or cfg.get("installed") or "v1.0.0")
    a = {"friendly_name": "Casora Update", "auto_update": False, "installed_version": inst, "latest_version": latest,
         "in_progress": False, "release_summary": None, "release_url": f"https://github.com/{REPO}/releases/{latest}",
         "skipped_version": None, "title": None, "supported_features": 23,
         "mock_install_s": float(cfg.get("install_s", 3)), "mock_install_fail": bool(cfg.get("fail"))}
    ent = {"entity_id": EID, "state": "on" if inst != latest else "off", "attributes": a, "platform": "casora_mock",
           "device": None, "area": None, "original_name": "Update", "name": None, "icon": None,
           "device_class": None, "unit": None, "hidden": False, "translation_key": None, "entity_category": "config"}
    return {"entities": [ent]}
