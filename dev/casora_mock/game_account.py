"""A made-up game account like HA's Steam integration (state online/offline/…, the running game as attribute).

The game tile (casora_game) reads `game` and the artwork `game_image_main`/`game_image_header`; `entity_picture`
is the account's avatar, as Steam sets it. Pictures are inline SVGs (no network in the test house). Names made up.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import quote

KEY = "testspielkonto"


def _svg(body: str, w: int, h: int) -> str:
    return "data:image/svg+xml;utf8," + quote(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{body}</svg>')


# Cover art: a dusk sky over an island, readable as "a game" without any real title or logo.
ART = _svg(
    '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b5a"/>'
    '<stop offset=".6" stop-color="#e2708a"/><stop offset="1" stop-color="#f6c177"/></linearGradient></defs>'
    '<rect width="460" height="215" fill="url(#s)"/><circle cx="330" cy="120" r="38" fill="#ffe2a8"/>'
    '<path d="M0 170 Q120 120 230 160 T460 150 V215 H0Z" fill="#1d2b4a"/>'
    '<path d="M60 175 L110 110 L160 175Z" fill="#14203a"/><path d="M0 195 H460 V215 H0Z" fill="#0f1830"/>', 460, 215)
AVATAR = _svg('<rect width="64" height="64" rx="12" fill="#3a6ea5"/><circle cx="32" cy="25" r="11" fill="#dfe8f2"/>'
              '<path d="M12 56 Q32 34 52 56Z" fill="#dfe8f2"/>', 64, 64)


def extra(now: datetime) -> dict:
    a = {
        "friendly_name": "Testspielkonto", "steam_id": "76500000000000001", "game": "Inselabenteuer",
        "game_id": "1000001", "game_image_header": ART, "game_image_main": ART, "level": 27,
        "last_online": (now - timedelta(minutes=3)).isoformat(), "entity_picture": AVATAR,
    }
    return {
        "devices": [{"key": KEY, "name": "Testspielkonto", "manufacturer": "Beispiel", "model": "Spielkonto", "area": None}],
        "entities": [{"entity_id": "sensor." + KEY, "state": "online", "attributes": a, "platform": "casora_mock",
                      "device": KEY, "area": None, "original_name": "Testspielkonto", "name": None, "icon": None,
                      "device_class": None, "unit": None, "hidden": False, "translation_key": None,
                      "entity_category": None}],
    }
