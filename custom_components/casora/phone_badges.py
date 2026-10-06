"""Raum-Badges am Handy wie im Raum-Kopf am Desktop/Tablet (05.10.2026).

Die Raumseite am Handy (casora_mobile_sensor_chips, Reihe rooms_row) zeichnet seit 1.0.9
dieselbe Badge-Reihe wie casora_room am Desktop. Die Einstellungen dazu stehen nur im
Desktop-Dashboard (Variablen der casora_room-Karte je Raum). Früher kopierte das Studio
beim Speichern einen Auszug davon in room_chips des Handy-Layouts – nie gespeicherte oder aus
Hemma umgezogene Dashboards hatten deshalb am Handy nur Klima und Licht.

Jetzt fragt das Handy die Variablen zur Laufzeit hier ab (WebSocket, jeder angemeldete Nutzer,
nur lesen – dieselben Daten liefert lovelace/config ohnehin, nur ohne die 2 MB Vorlagen):

  casora/phone_room_badges {url_path: "<handy-dashboard>"}
    → {"desktop": "<desktop-url>" | None,
       "rooms": {"room_<schlüssel>": {"name": "Küche", "path": "kueche", "vars": {...}}}}

Der Schlüssel ist der Filterwert der Raumseite (wie phoneRoomKeys im Studio), die Zuordnung
Raum ↔ Handy-Abschnitt wie linkPair im Studio: Name, dann Pfad, dann gemeinsame Kacheln.

Reines Python ohne HA-Importe im Kern (unit-testbar), die WebSocket-Anbindung unten.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

ROOM = "casora_room"
MOBILE_SHELL = "casora_mobile_bg"
MOBILE_HEADER = "casora_mobile_header"
SMART_ROW = "custom:casora-smart-row"
FILTER_OVERLAY = "custom:casora-filter-overlay"
CUSTOM_TEMPLATE = "casora_custom"

# Was die Badge-Reihe nicht braucht (Benachrichtigungen, Bilder, Wetter, Szenen …), bleibt weg –
# die Antwort soll klein bleiben.
_SKIP_PREFIX = ("notify_", "notification_", "casora_notify", "image", "weather_", "scene_",
                "room_photo", "font")
_SKIP_KEYS = {"scenes", "show_assist", "show_notifications", "show_now_playing_header"}


def _js_lower(s: Any) -> str:
    return str(s if s is not None else "").strip().lower()


def room_key_of(name: Any) -> str:
    """roomKeyOf im Studio: "room_" + Name klein, nur a-z0-9."""
    return "room_" + re.sub(r"[^a-z0-9]+", "", _js_lower(name))


def slug(s: Any) -> str:
    """slug() im Studio (Pfad eines Raums aus seinem ersten Namen)."""
    v = _js_lower(s)
    v = v.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    v = "".join(ch for ch in unicodedata.normalize("NFD", v) if not unicodedata.combining(ch))
    v = re.sub(r"[^a-z0-9]+", "-", v).strip("-")
    return v or "room"


_FAV = re.compile(r"^(favorites|favoriten)$", re.I)


def _is_fav(sec: dict) -> bool:
    fav = (sec.get("variables") or {}).get("favorites")
    return fav is True or (fav is not False and bool(_FAV.match(str(sec.get("name") or "").strip())))


def _stable(x: Any) -> str:
    return json.dumps(x, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def tile_key(t: Any) -> str:
    """tileTwinKey im Studio (Art + Entität, nie die Stelle)."""
    if not isinstance(t, dict):
        return _stable(None)
    if t.get("template") == CUSTOM_TEMPLATE:
        card = (t.get("custom_fields") or {}).get("card") or {}
        return _stable([t.get("template"), t.get("name") or "", card.get("type") or "", card.get("entity") or ""])
    if t.get("type") == "conditional" and isinstance(t.get("card"), dict):
        return _stable(["conditional", tile_key(t["card"])])
    return _stable([t.get("template") or t.get("type"), t.get("entity") or ""])


def badge_vars(variables: dict) -> dict:
    """Die Raum-Variablen, die die Badge-Reihe liest."""
    out = {}
    for k, v in (variables or {}).items():
        if k in _SKIP_KEYS or k.startswith(_SKIP_PREFIX):
            continue
        if v is None or v == "" or v == []:
            continue
        out[k] = v
    return out


def desktop_rooms(cfg: dict) -> list[dict]:
    """Räume eines Desktop-Dashboards: je Ansicht die casora_room-Karte (extractConfig)."""
    out = []
    for v in (cfg or {}).get("views") or []:
        cards = (v or {}).get("cards") or []
        if len(cards) < 3:
            continue
        hero, row = cards[0] or {}, cards[2] or {}
        out.append({
            "name": hero.get("name"),
            "path": v.get("path"),
            "is_room": hero.get("template") == ROOM,
            "variables": hero.get("variables") or {},
            "tiles": row.get("cards") or [],
        })
    return out


def is_mobile(cfg: dict) -> bool:
    try:
        return any((c or {}).get("template") == MOBILE_SHELL for c in cfg["views"][0]["cards"])
    except (KeyError, IndexError, TypeError):
        return False


def phone_sections(cfg: dict) -> tuple[list[dict], dict[str, str]]:
    """Abschnitte des Handy-Layouts (Kopf + Reihe) und Filter-Schlüssel je Raumname."""
    try:
        kids = cfg["views"][0]["cards"][1].get("cards") or []
    except (KeyError, IndexError, TypeError, AttributeError):
        return [], {}
    secs: list[dict] = []
    keys: dict[str, str] = {}
    i = 0
    while i < len(kids):
        c = kids[i] if isinstance(kids[i], dict) else {}
        nxt = kids[i + 1] if i + 1 < len(kids) and isinstance(kids[i + 1], dict) else None
        if c.get("template") == MOBILE_HEADER and nxt and nxt.get("type") == SMART_ROW:
            hv = c.get("variables") or {}
            name = c.get("name")
            if isinstance(name, str) and _FAV.match(name.strip()) and not hv.get("favorites"):
                name = "Favorites"
            secs.append({"name": name, "variables": hv, "tiles": nxt.get("cards") or []})
            i += 2
            continue
        room = c.get("room")
        if c.get("type") == FILTER_OVERLAY and room is not None \
                and not re.match(r"^(scenes|szenen)$", str(room).strip(), re.I):
            keys[str(room).strip()] = c.get("filter_category") or room_key_of(room)
        i += 1
    return secs, keys


def link_rooms(rooms: list[dict], secs: list[dict]) -> list[dict]:
    """linkPair im Studio: Übersicht ↔ Favoriten, dann Name, Pfad, gemeinsame Kacheln."""
    used: set[int] = set()
    links = []
    for i, r in enumerate(rooms):
        overview = r.get("path") == "home" or i == 0
        at = -1
        if overview:
            at = next((n for n, s in enumerate(secs) if n not in used and _is_fav(s)), -1)
        if at < 0:
            at = next((n for n, s in enumerate(secs)
                       if n not in used and _js_lower(s.get("name")) == _js_lower(r.get("name"))), -1)
        if at >= 0:
            used.add(at)
        links.append({"room": i, "section": None if at < 0 else at, "overview": overview})
    for lk in links:
        if lk["section"] is not None or lk["overview"]:
            continue
        path = rooms[lk["room"]].get("path")
        at = next((n for n, s in enumerate(secs)
                   if n not in used and not _is_fav(s) and path and slug(s.get("name")) == path), -1)
        if at >= 0:
            used.add(at)
            lk["section"] = at
    for lk in links:
        if lk["section"] is not None or lk["overview"]:
            continue
        mine = {tile_key(t) for t in rooms[lk["room"]].get("tiles") or [] if t}
        best, most = -1, 0
        for n, s in enumerate(secs):
            if n in used or _is_fav(s):
                continue
            shared = sum(1 for t in s.get("tiles") or [] if t and tile_key(t) in mine)
            if shared > most:
                most, best = shared, n
        if best >= 0:
            used.add(best)
            lk["section"] = best
    return links


def desktop_url_of(mobile_url: str) -> str:
    """Gegenstück zu mobilePathOf im Studio: <stamm>-mobile → <stamm>."""
    return re.sub(r"[-_]mobile$", "", str(mobile_url or ""), flags=re.I)


def room_badges(desktop_cfg: dict, mobile_cfg: dict) -> dict[str, dict]:
    """Filter-Schlüssel der Raumseite → Name, Pfad und Badge-Variablen des Desktop-Raums."""
    rooms = desktop_rooms(desktop_cfg)
    if not rooms or not any(r["is_room"] for r in rooms):
        return {}
    secs, keys = phone_sections(mobile_cfg)
    out: dict[str, dict] = {}
    for lk in link_rooms(rooms, secs):
        if lk["overview"] or lk["section"] is None:
            continue
        room, sec = rooms[lk["room"]], secs[lk["section"]]
        if not room["is_room"] or not sec.get("name"):
            continue
        name = str(sec["name"]).strip()
        key = keys.get(name) or room_key_of(sec["name"])
        out[key] = {"name": room.get("name") or sec["name"], "path": room.get("path"),
                    "vars": badge_vars(room["variables"])}
    return out


# ─── WebSocket ────────────────────────────────────────────────────────────────

async def _load(hass, url_path: str, admin: bool = True) -> dict | None:
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    data = hass.data.get(LOVELACE_DATA)
    dash = (data.dashboards if data else {}).get(url_path)
    if dash is None:
        return None
    if not admin and (getattr(dash, "config", None) or {}).get("require_admin"):
        return None  # Admin-Dashboard: Nicht-Admins bekommen nichts daraus
    try:
        cfg = await dash.async_load(False)
    except Exception:  # noqa: BLE001 – leer oder kaputt: nichts zu holen
        return None
    return cfg if isinstance(cfg, dict) else None


async def async_room_badges(hass, mobile_url: str, admin: bool = True) -> dict:
    empty = {"desktop": None, "rooms": {}}
    if not mobile_url or not re.search(r"[-_]mobile$", mobile_url, re.I):
        return empty
    mobile = await _load(hass, mobile_url, admin)
    if not mobile or not is_mobile(mobile):
        return empty
    desk_url = desktop_url_of(mobile_url)
    desktop = await _load(hass, desk_url, admin)
    if not desktop or is_mobile(desktop):
        return empty
    return {"desktop": desk_url, "rooms": room_badges(desktop, mobile)}


def async_setup_phone_badges(hass) -> None:
    import voluptuous as vol

    from homeassistant.components import websocket_api

    from .const import DOMAIN

    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("phone_badges_ws"):
        return

    @websocket_api.websocket_command({
        vol.Required("type"): "casora/phone_room_badges",
        vol.Required("url_path"): str,
    })
    @websocket_api.async_response
    async def ws_room_badges(hass, connection, msg) -> None:
        connection.send_result(msg["id"], await async_room_badges(hass, msg["url_path"], connection.user.is_admin))

    websocket_api.async_register_command(hass, ws_room_badges)
    dom["phone_badges_ws"] = True
