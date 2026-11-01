"""Export and import a Casora dashboard as one file (Studio → ⋯ → Export / Import from file).

The file (casora-<name>-<date>.casora) is a ZIP archive:

  manifest.json   {"format": 1, "kind": "casora-dashboard", "casora": "<version>", "exported": "<iso>",
                   "title", "url_path", "mobile_url", "rooms", "tiles", "photos", "settings"}
  dashboard.json  the desktop dashboard as stored by HA (templates included, so own templates travel)
  mobile.json     the phone layout (optional)
  settings.json   Casora settings that belong to the dashboard (optional, SHARE_SECTIONS only)
  photos/<file>   own room and vehicle photos the dashboard points to (optional)

No access tokens, passwords or HA secrets: the dashboard and the chosen settings only, with keys that
look like credentials removed and signed photo URLs reduced to the photo's name.

Import is two steps: the file is uploaded (POST /api/casora/share/import, admins only), checked and
held in memory for STAGE_TTL; the Studio shows a preview and the entities missing in this home. Then
casora/share/apply writes it into a dashboard the Studio created (new) or into an existing one
(replace): the state before is kept under Rewind first, so nothing is lost.

  GET  /api/casora/share/export?url_path=…[&mobile_url=…][&photos=1][&settings=1] → the file
  POST /api/casora/share/import   multipart "file" → preview (see _preview)
  casora/share/apply ← {"token", "url_path", "mobile_url"?, "mode": "new"|"replace", "mapping"?,
                        "photos"?, "settings"?} → {"url_path", "photos", "mapped"}

The core below is plain Python without HA imports (dev/unit/share_test.py).
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import re
import secrets
import time
import zipfile
from typing import Any

FORMAT = 1
KIND = "casora-dashboard"
EXTENSION = ".casora"
# Casora settings that describe the home shown on the dashboard. Not: notify (push recipients and
# place names), umzug/basis/welcome/community (state of this Studio, not of the dashboard).
SHARE_SECTIONS = ("waste", "calendars", "scenes", "contacts", "security", "media", "night_entity", "ebike")
TEMPLATES = "button_card_templates"
STAGE_TTL = 30 * 60
# Limits for a file read on import (a ZIP can unpack to much more than it weighs).
MAX_ENTRIES = 400
MAX_UNPACKED = 96 * 1024 * 1024
MAX_PHOTO = 16 * 1024 * 1024
PHOTO_EXT = (".jpg", ".jpeg", ".png", ".webp")
PHOTO_FILE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,80}\.(?:jpe?g|png|webp)$")
NIGHT = "-night"
# Keys whose values are credentials in any card we know of; dropped on export.
SECRET_KEY = re.compile(r"(?:^|_)(?:token|access_token|password|passwd|secret|api_?key|auth|authorization)$", re.I)
# Same addresses as casoraPhotoUrl (scripts/casora-core.js).
OLD_PHOTO = re.compile(
    r"^(?:https?://[^/]+)?/(?:casora_assets/rooms|local/casora/rooms|local/hemma/rooms|api/casora/photo)/([^?#]+)", re.I)
USERINFO = re.compile(r"([a-z][a-z0-9+.-]*://)[^/@\s:]+:[^/@\s]*@", re.I)
# Keys whose plain values ("kueche") name a photo (room card image/image_night, phone wallpaper …).
PHOTO_KEY = re.compile(r"image|photo|picture|background|wallpaper|(?:^|_)bg(?:_|$)", re.I)
AUTH_SIG = re.compile(r"([?&])authSig=[^&#]*&?")

# Domains whose IDs are entities (services like light.turn_on sit under SERVICE_KEYS and are skipped).
ENTITY_DOMAINS = frozenset((
    "air_quality", "alarm_control_panel", "automation", "binary_sensor", "button", "calendar", "camera",
    "climate", "counter", "cover", "date", "datetime", "device_tracker", "event", "fan", "group",
    "humidifier", "image", "input_boolean", "input_button", "input_datetime", "input_number",
    "input_select", "input_text", "lawn_mower", "light", "lock", "media_player", "number", "person",
    "plant", "remote", "scene", "schedule", "script", "select", "sensor", "siren", "sun", "switch",
    "text", "time", "timer", "todo", "update", "vacuum", "valve", "water_heater", "weather", "zone",
))
ENTITY_ID = re.compile(r"^([a-z_]+)\.([a-z0-9_]+)$")
SERVICE_KEYS = frozenset(("service", "action", "perform_action", "type", "template", "icon", "navigation_path",
                          "url_path", "url"))


class ShareError(Exception):
    """File rejected on import; code is what the Studio translates."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# ─── Walking configs ──────────────────────────────────────────────────────────

def _map_strings(obj: Any, fn, key: str | None = None) -> Any:
    """Copy of obj with fn(value, key) applied to every string (dict keys stay)."""
    if isinstance(obj, dict):
        return {k: _map_strings(v, fn, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_map_strings(v, fn, key) for v in obj]
    if isinstance(obj, str):
        return fn(obj, key)
    return obj


def _strings(obj: Any, key: str | None = None):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _strings(v, k)
    elif isinstance(obj, list):
        for v in obj:
            yield from _strings(v, key)
    elif isinstance(obj, str):
        yield obj, key


def scrub(obj: Any) -> Any:
    """Without credential-like keys and without login signatures in URLs."""
    if isinstance(obj, dict):
        return {k: scrub(v) for k, v in obj.items() if not (isinstance(k, str) and SECRET_KEY.search(k))}
    if isinstance(obj, list):
        return [scrub(v) for v in obj]
    if isinstance(obj, str):
        if "authSig=" in obj:
            obj = AUTH_SIG.sub(lambda m: m.group(1) if m.group(0).endswith("&") else "", obj).rstrip("?&")
        if "@" in obj and "://" in obj:
            obj = USERINFO.sub(r"\1", obj)  # rtsp://user:password@host → rtsp://host
    return obj


def without_templates(cfg: dict | None) -> dict:
    return {k: v for k, v in (cfg or {}).items() if k != TEMPLATES}


# ─── Photos ───────────────────────────────────────────────────────────────────

def photo_stem(ref: Any) -> str:
    """'kueche' | 'kueche-night.jpg' | '/api/casora/photo/kueche.jpg?v=3' → 'kueche' / 'kueche-night'."""
    s = str(ref if ref is not None else "").strip()
    if not s or len(s) > 300:
        return ""
    m = OLD_PHOTO.match(s)
    if m:
        s = m.group(1)
    elif "/" in s or ":" in s:
        return ""
    s = re.sub(r"\.(jpe?g|png|webp)$", "", s, flags=re.I)
    return s if re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,80}", s) else ""


def photo_bases(cfgs: list[Any]) -> set[str]:
    """Day photo names (without -night) the configs point to; demo photos ship with Casora."""
    out: set[str] = set()
    for cfg in cfgs:
        for s, _key in _strings(without_templates(cfg) if isinstance(cfg, dict) else cfg):
            stem = photo_stem(s)
            if not stem or stem.endswith("-demo") or stem.endswith("-demo" + NIGHT):
                continue
            out.add(stem[: -len(NIGHT)] if stem.endswith(NIGHT) else stem)
    return out


def rename_photos(obj: Any, renames: dict[str, str]) -> Any:
    """Point photo references at new names ({old base: new base}), day and night."""
    if not renames:
        return obj

    def fn(s: str, key):
        # Only photo values: a room path "kueche" is no photo, even if a photo has that name.
        if not (OLD_PHOTO.match(s) or re.search(r"\.(jpe?g|png|webp)$", s, re.I)
                or (isinstance(key, str) and PHOTO_KEY.search(key))):
            return s
        stem = photo_stem(s)
        if not stem:
            return s
        night = stem.endswith(NIGHT)
        base = stem[: -len(NIGHT)] if night else stem
        if base not in renames:
            return s
        return renames[base] + (NIGHT if night else "")
    return _map_strings(obj, fn)


# ─── Entities ─────────────────────────────────────────────────────────────────

def entity_refs(cfgs: list[Any]) -> list[str]:
    """Entity IDs the dashboard (without templates) and settings use, sorted."""
    out: set[str] = set()
    for cfg in cfgs:
        if cfg is None:
            continue
        for s, key in _strings(without_templates(cfg) if isinstance(cfg, dict) else cfg):
            if key in SERVICE_KEYS:
                continue
            m = ENTITY_ID.match(s)
            if m and m.group(1) in ENTITY_DOMAINS:
                out.add(s)
    return sorted(out)


def apply_mapping(obj: Any, mapping: dict[str, str]) -> Any:
    """Replace entity IDs ({old: new}); whole values and inside longer texts (custom card code)."""
    pairs = {o: n for o, n in (mapping or {}).items()
             if isinstance(o, str) and isinstance(n, str) and o != n and ENTITY_ID.match(o) and ENTITY_ID.match(n)
             and o.split(".")[0] == n.split(".")[0]}
    if not pairs:
        return obj
    pattern = re.compile(r"(?<![\w.])(" + "|".join(re.escape(o) for o in sorted(pairs, key=len, reverse=True))
                         + r")(?![\w])")

    def fn(s: str, key):
        if key in SERVICE_KEYS:
            return s
        if s in pairs:
            return pairs[s]
        return pattern.sub(lambda m: pairs[m.group(1)], s) if "." in s else s
    return _map_strings(obj, fn)


# ─── Links between dashboards ─────────────────────────────────────────────────

def move_links(cfg: Any, moves: list[tuple[str, str]]) -> Any:
    """'/old/kueche' → '/new/kueche' (like _copyDashboard in the Studio), templates included."""
    text = json.dumps(cfg, ensure_ascii=False)
    for old, new in moves:
        if old and new and old != new:
            # Not inside another address: "/api/casora/photo" stays when the old dashboard is "casora".
            text = re.sub(r"(?<![\w.\-/])/" + re.escape(old) + r"(?=[/\"'?#\\`])", lambda _m, n=new: "/" + n, text)
    return json.loads(text)


# ─── Summary ──────────────────────────────────────────────────────────────────

def _room_name(view: dict) -> str:
    cards = view.get("cards") or []
    first = cards[0] if cards and isinstance(cards[0], dict) else {}
    if first.get("template") == "casora_room" and isinstance(first.get("name"), str) and "[[[" not in first["name"]:
        return first["name"]
    return str(view.get("title") or view.get("path") or "")


def rooms_of(cfg: dict | None) -> list[str]:
    return [n for n in (_room_name(v) for v in (cfg or {}).get("views") or [] if isinstance(v, dict)) if n]


def tiles_of(cfg: dict | None) -> int:
    """Button-card tiles in the views, without the room cards."""
    n = 0

    def walk(o: Any) -> None:
        nonlocal n
        if isinstance(o, dict):
            if o.get("type") == "custom:button-card":
                tpl = o.get("template")
                tpl = tpl[0] if isinstance(tpl, list) and tpl else tpl
                if tpl != "casora_room":
                    n += 1
                return
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk((cfg or {}).get("views") or [])
    return n


# ─── Export ───────────────────────────────────────────────────────────────────

def file_name(title: str, day: str) -> str:
    """casora-<name>-<YYYY-MM-DD>.casora with a plain ASCII name."""
    import unicodedata

    s = str(title or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "dashboard"
    return f"casora-{s}-{day}{EXTENSION}"


def build_export(*, title: str, url_path: str, mobile_url: str | None, config: dict, mobile: dict | None,
                 settings: dict | None, photos: dict[str, bytes] | None, version: str, exported: str) -> bytes:
    """The export file. photos: file name → bytes (already chosen by the caller)."""
    if not isinstance(config, dict) or not isinstance(config.get("views"), list):
        raise ShareError("broken", "dashboard has no views")
    cfg = scrub(config)
    mob = scrub(mobile) if isinstance(mobile, dict) else None
    sets = {k: scrub(v) for k, v in (settings or {}).items() if k in SHARE_SECTIONS and v not in (None, "", [], {})}
    names = sorted(n for n in (photos or {}) if PHOTO_FILE.match(n))
    manifest = {
        "format": FORMAT, "kind": KIND, "casora": version, "exported": exported,
        "title": title, "url_path": url_path, "mobile_url": mobile_url if mob is not None else None,
        "rooms": rooms_of(cfg), "tiles": tiles_of(cfg), "phone": mob is not None,
        "photos": names, "settings": sorted(sets),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
        z.writestr("dashboard.json", json.dumps(cfg, ensure_ascii=False, separators=(",", ":")))
        if mob is not None:
            z.writestr("mobile.json", json.dumps(mob, ensure_ascii=False, separators=(",", ":")))
        if sets:
            z.writestr("settings.json", json.dumps(sets, ensure_ascii=False, indent=1))
        for n in names:
            # Photos are JPEG already: storing them compressed again only costs time.
            z.writestr(zipfile.ZipInfo("photos/" + n, date_time=(2026, 1, 1, 0, 0, 0)), photos[n],
                       compress_type=zipfile.ZIP_STORED)
    return buf.getvalue()


# ─── Import ───────────────────────────────────────────────────────────────────

def _json(z: zipfile.ZipFile, name: str, what: str) -> Any:
    try:
        return json.loads(z.read(name).decode("utf-8"))
    except KeyError:
        raise ShareError("broken", f"{name} missing") from None
    except (ValueError, UnicodeDecodeError):
        raise ShareError("broken", f"{what} is not readable") from None


def _is_dashboard(cfg: Any) -> bool:
    return isinstance(cfg, dict) and isinstance(cfg.get("views"), list) and all(isinstance(v, dict) for v in cfg["views"])


def read_file(data: bytes) -> dict:
    """Check an export file and unpack it.

    → {"manifest", "config", "mobile", "settings", "photos": {file: bytes}}; ShareError otherwise:
      not_casora (no Casora export at all), newer_format (made by a newer Casora), broken (damaged).
    """
    if not data:
        raise ShareError("empty", "no file received")
    if not data.startswith(b"PK"):
        raise ShareError("not_casora", "not a Casora export file")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        infos = z.infolist()
    except (zipfile.BadZipFile, OSError, ValueError):
        raise ShareError("broken", "the file is damaged") from None
    if len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_UNPACKED:
        raise ShareError("broken", "the file is too large when unpacked")
    names = {i.filename for i in infos}
    if "manifest.json" not in names:
        raise ShareError("not_casora", "not a Casora export file")
    try:
        with z:
            manifest = _json(z, "manifest.json", "manifest")
            if not isinstance(manifest, dict) or manifest.get("kind") != KIND:
                raise ShareError("not_casora", "not a Casora export file")
            fmt = manifest.get("format")
            if isinstance(fmt, bool) or not isinstance(fmt, int) or fmt < 1:
                raise ShareError("broken", "unknown format")
            if fmt > FORMAT:
                raise ShareError("newer_format", f"format {fmt} needs a newer Casora")
            config = _json(z, "dashboard.json", "dashboard")
            if not _is_dashboard(config):
                raise ShareError("broken", "dashboard has no views")
            mobile = _json(z, "mobile.json", "phone layout") if "mobile.json" in names else None
            if mobile is not None and not _is_dashboard(mobile):
                raise ShareError("broken", "phone layout has no views")
            settings = _json(z, "settings.json", "settings") if "settings.json" in names else {}
            if not isinstance(settings, dict):
                raise ShareError("broken", "settings are not readable")
            settings = {k: v for k, v in settings.items() if k in SHARE_SECTIONS}
            photos: dict[str, bytes] = {}
            for info in infos:
                if not info.filename.startswith("photos/") or info.is_dir():
                    continue
                name = info.filename[len("photos/"):]
                if not PHOTO_FILE.match(name) or info.file_size > MAX_PHOTO:
                    continue  # never a path outside, never a giant
                photos[name] = z.read(info)
    except zipfile.BadZipFile:
        raise ShareError("broken", "the file is damaged") from None
    return {"manifest": manifest, "config": scrub(config), "mobile": scrub(mobile) if mobile else None,
            "settings": scrub(settings), "photos": photos}


def preview(staged: dict, known: set[str] | frozenset[str]) -> dict:
    """What the Studio shows before importing. known: entity IDs that exist in this home."""
    m = staged["manifest"]
    cfg, mob, sets = staged["config"], staged["mobile"], staged["settings"]
    refs = entity_refs([cfg, mob, sets])
    missing = [e for e in refs if e not in known]
    photo_names = sorted(staged["photos"])
    return {
        "title": str(m.get("title") or "Casora")[:80],
        "casora": str(m.get("casora") or ""),
        "exported": str(m.get("exported") or ""),
        "rooms": rooms_of(cfg),
        "tiles": tiles_of(cfg),
        "phone": mob is not None,
        "phone_tiles": tiles_of(mob) if mob else 0,
        "photos": len({n.rsplit(".", 1)[0].removesuffix(NIGHT) for n in photo_names}),
        "settings": sorted(sets),
        "entities": len(refs),
        "missing": missing,
    }


def photo_plan(photos: dict[str, bytes], existing: dict[str, bytes | None],
               known: dict[str, str] | None = None) -> tuple[dict[str, bytes], dict[str, str]]:
    """Which photo files to write and which names change.

    existing: file name → bytes of a photo with that name already in this home (None = none). A
    name already taken by another photo gets a new random tail; the same photo is not written twice.
    → ({file name: bytes to write}, {old base: new base}).
    """
    bases: dict[str, dict[str, tuple[str, bytes]]] = {}
    for name, data in photos.items():
        stem, ext = name.rsplit(".", 1)
        night = stem.endswith(NIGHT)
        base = stem[: -len(NIGHT)] if night else stem
        bases.setdefault(base, {})["night" if night else "day"] = (ext, data)
    write: dict[str, bytes] = {}
    renames: dict[str, str] = {}
    for base, slots in sorted(bases.items()):
        clash = False
        for slot, (ext, data) in slots.items():
            have = existing.get(base + (NIGHT if slot == "night" else "") + "." + ext)
            if have is not None and hashlib.sha1(have).digest() != hashlib.sha1(data).digest():
                clash = True
        target = base
        if clash:
            # The same photos are already here under another name (an earlier import): use those.
            same = _known_base(slots, known or {})
            if same:
                renames[base] = same
                continue
            target = re.sub(r"-[0-9a-f]{12}$", "", base)[:51] + "-" + secrets.token_hex(6)
            renames[base] = target
        for slot, (ext, data) in slots.items():
            name = target + (NIGHT if slot == "night" else "") + "." + ext
            if not clash and existing.get(name) is not None:
                continue  # same photo is already here
            write[name] = data
    return write, renames


def _sha(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _known_base(slots: dict, known: dict[str, str]) -> str | None:
    """known: content hash → file name of photos in this home. The base all slots exist under, or None."""
    day = slots.get("day")
    if not day or _sha(day[1]) not in known:
        return None
    stem = known[_sha(day[1])].rsplit(".", 1)[0]
    if stem.endswith(NIGHT):
        return None
    night = slots.get("night")
    if night and known.get(_sha(night[1]), "").rsplit(".", 1)[0] != stem + NIGHT:
        return None
    return stem


def prepare(staged: dict, *, url_path: str, mobile_url: str | None, mapping: dict[str, str] | None,
            renames: dict[str, str] | None, with_settings: bool) -> dict:
    """Configs to save: links moved to the new address, entities mapped, photos renamed."""
    m = staged["manifest"]
    moves = [(str(m.get("url_path") or ""), url_path)]
    if m.get("mobile_url") and mobile_url:
        moves.append((str(m["mobile_url"]), mobile_url))
    # Longest first: '/casora-mobile' before '/casora'.
    moves.sort(key=lambda p: len(p[0]), reverse=True)

    def fix(cfg):
        if cfg is None:
            return None
        out = move_links(copy.deepcopy(cfg), moves)
        out = apply_mapping(out, mapping or {})
        return rename_photos(out, renames or {})
    return {
        "config": fix(staged["config"]),
        "mobile": fix(staged["mobile"]) if mobile_url else None,
        "settings": rename_photos(apply_mapping(copy.deepcopy(staged["settings"]), mapping or {}), renames or {})
        if with_settings else None,
    }


# ─── Staging (between upload and apply) ───────────────────────────────────────

def stage(store: dict, staged: dict, now: float | None = None) -> str:
    now = time.monotonic() if now is None else now
    for tok in [t for t, v in store.items() if v["at"] + STAGE_TTL < now]:
        store.pop(tok, None)
    # One file at a time is plenty; an older upload is dropped.
    while len(store) >= 3:
        store.pop(min(store, key=lambda t: store[t]["at"]))
    token = secrets.token_urlsafe(16)
    store[token] = {"at": now, "data": staged}
    return token


def staged_of(store: dict, token: str, now: float | None = None) -> dict | None:
    now = time.monotonic() if now is None else now
    hit = store.get(token)
    if not hit or hit["at"] + STAGE_TTL < now:
        store.pop(token, None)
        return None
    return hit["data"]


# ─── Home Assistant ───────────────────────────────────────────────────────────

_STAGE = "share_stage"


def _photo_files(config_dir: str, bases: set[str]) -> dict[str, bytes]:
    """Own photo files (day and night) for these names. Blocking.

    The folders are listed once: the candidates are every plain value of the dashboard, and a stat
    per candidate and extension is slow on some file systems."""
    import os

    from .images import EXTENSIONS, LEGACY_ROOMS_DIR, ROOMS_DIR

    found: dict[str, str] = {}
    for folder in (ROOMS_DIR, LEGACY_ROOMS_DIR):  # own folder first, like photo_file
        base_dir = os.path.join(config_dir, folder)
        try:
            names = sorted(os.listdir(base_dir))
        except OSError:
            continue
        for name in names:
            stem, ext = os.path.splitext(name)
            if ext.lower() in EXTENSIONS and stem not in found and os.path.isfile(os.path.join(base_dir, name)):
                found[stem] = os.path.join(base_dir, name)
    out: dict[str, bytes] = {}
    for base in sorted(bases):
        for stem in (base, base + NIGHT):
            path = found.get(stem)
            if path and PHOTO_FILE.match(os.path.basename(path)):
                with open(path, "rb") as fh:
                    out[os.path.basename(path)] = fh.read()
    return out


def _existing_photos(config_dir: str, names: list[str]) -> dict[str, bytes | None]:
    from .images import photo_file

    out: dict[str, bytes | None] = {}
    for n in names:
        path = photo_file(config_dir, n)
        if path:
            with open(path, "rb") as fh:
                out[n] = fh.read()
        else:
            out[n] = None
    return out


def _own_photo_hashes(config_dir: str) -> dict[str, str]:
    """Content hash → file name of the own photos (to find a photo imported before)."""
    import os

    from .const import PHOTOS_DIR

    folder = os.path.join(config_dir, PHOTOS_DIR)
    out: dict[str, str] = {}
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        return out
    for name in names:
        if not PHOTO_FILE.match(name):
            continue
        try:
            with open(os.path.join(folder, name), "rb") as fh:
                out.setdefault(_sha(fh.read()), name)
        except OSError:
            continue
    return out


def _write_photos(config_dir: str, files: dict[str, bytes]) -> None:
    import os

    from .const import PHOTOS_DIR

    folder = os.path.join(config_dir, PHOTOS_DIR)
    os.makedirs(folder, exist_ok=True)
    for name, data in files.items():
        if not PHOTO_FILE.match(name):
            continue
        target = os.path.join(folder, name)
        tmp = target + ".part"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, target)


def _known_entities(hass) -> set[str]:
    from homeassistant.helpers import entity_registry as er

    known = set(hass.states.async_entity_ids())
    known.update(e.entity_id for e in er.async_get(hass).entities.values())
    return known


def _http_views():
    from aiohttp import web
    from homeassistant.components.http import HomeAssistantView
    from homeassistant.util import dt as dt_util

    from .const import DOMAIN, VERSION
    from .settings import async_load_settings
    from .versions import _load

    class CasoraShareExportView(HomeAssistantView):
        """The export file of one dashboard (admins)."""

        url = "/api/casora/share/export"
        name = "api:casora:share:export"
        requires_auth = True

        async def get(self, request: web.Request) -> web.Response:
            if not request["hass_user"].is_admin:
                return self.json_message("admin required", web.HTTPUnauthorized.status_code)
            hass = request.app["hass"]
            q = request.query
            url_path = q.get("url_path") or ""
            config = await _load(hass, url_path)
            if not isinstance(config, dict):
                return self.json({"code": "not_found", "message": "dashboard not found"}, status_code=404)
            mobile_url = q.get("mobile_url") or None
            mobile = await _load(hass, mobile_url) if mobile_url else None
            settings = (await async_load_settings(hass) or {}) if q.get("settings") == "1" else {}
            photos: dict[str, bytes] = {}
            if q.get("photos") == "1":
                bases = photo_bases([config, mobile, settings])
                photos = await hass.async_add_executor_job(_photo_files, hass.config.config_dir, bases)
            title = q.get("title") or url_path
            now = dt_util.now()
            try:
                body = await hass.async_add_executor_job(lambda: build_export(
                    title=title, url_path=url_path, mobile_url=mobile_url, config=config, mobile=mobile,
                    settings=settings, photos=photos, version=VERSION, exported=now.isoformat(timespec="seconds")))
            except ShareError as err:
                return self.json({"code": err.code, "message": str(err)}, status_code=400)
            name = file_name(title, now.strftime("%Y-%m-%d"))
            return web.Response(body=body, content_type="application/zip", headers={
                "Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store",
                "X-Casora-File": name})

    class CasoraShareImportView(HomeAssistantView):
        """Check an export file and hold it for casora/share/apply (admins)."""

        url = "/api/casora/share/import"
        name = "api:casora:share:import"
        requires_auth = True

        async def post(self, request: web.Request) -> web.Response:
            if not request["hass_user"].is_admin:
                return self.json_message("admin required", web.HTTPUnauthorized.status_code)
            hass = request.app["hass"]
            payload = b""
            try:
                reader = await request.multipart()
                while True:
                    part = await reader.next()
                    if part is None:
                        break
                    if part.name == "file":
                        payload = await part.read(decode=False)
            except ValueError:
                return self.json({"code": "too_large", "message": "file too large"}, status_code=413)
            except Exception:  # noqa: BLE001 – not multipart
                return self.json({"code": "empty", "message": "expected multipart body"}, status_code=400)
            try:
                staged = await hass.async_add_executor_job(read_file, bytes(payload))
            except ShareError as err:
                return self.json({"code": err.code, "message": str(err)}, status_code=400)
            token = stage(hass.data.setdefault(DOMAIN, {}).setdefault(_STAGE, {}), staged)
            return self.json({"token": token, **preview(staged, _known_entities(hass))})

    return CasoraShareExportView, CasoraShareImportView


async def _apply(hass, msg: dict) -> dict:
    import os

    from homeassistant.util import dt as dt_util

    from .const import DOMAIN
    from .settings import SECTIONS, _store as settings_store
    from .template_refresh import _read_bundle
    from .template_print import home_vars_of, refresh_dashboard
    from .versions import _dashboard, _snap

    staged = staged_of(hass.data.setdefault(DOMAIN, {}).setdefault(_STAGE, {}), msg["token"])
    if staged is None:
        raise ShareError("expired", "the file is no longer here, choose it again")
    url_path, mobile_url = msg["url_path"], msg.get("mobile_url") or None
    if staged["mobile"] is None:
        mobile_url = None
    dash = _dashboard(hass, url_path)
    mob_dash = _dashboard(hass, mobile_url) if mobile_url else None
    replace = msg["mode"] == "replace"
    if not replace:
        # A new dashboard must be empty: "new" never overwrites what someone built.
        for d in (dash, mob_dash):
            if d is None:
                continue
            try:
                have = await d.async_load(False)
            except Exception:  # noqa: BLE001 – empty dashboards raise ConfigNotFound
                have = None
            if isinstance(have, dict) and any((v or {}).get("cards") for v in have.get("views") or []):
                raise ShareError("not_empty", "the new dashboard is not empty")

    write: dict[str, bytes] = {}
    renames: dict[str, str] = {}
    if msg.get("photos") and staged["photos"]:
        existing = await hass.async_add_executor_job(_existing_photos, hass.config.config_dir, sorted(staged["photos"]))
        known = await hass.async_add_executor_job(_own_photo_hashes, hass.config.config_dir)
        write, renames = photo_plan(staged["photos"], existing, known)
    out = prepare(staged, url_path=url_path, mobile_url=mobile_url, mapping=msg.get("mapping") or {},
                  renames=renames, with_settings=bool(msg.get("settings")) and bool(staged["settings"]))

    # Templates as this Casora ships them; own templates of the file stay (refresh_dashboard keeps them).
    got = await hass.async_add_executor_job(_read_bundle, hass.config.config_dir)
    cfg, mob = out["config"], out["mobile"]
    if got is not None:
        bundle = got[0]
        new_cfg, _r = await hass.async_add_executor_job(lambda: refresh_dashboard(cfg, bundle))
        cfg = new_cfg or cfg
        if mob is not None:
            home = home_vars_of(cfg)
            new_mob, _r = await hass.async_add_executor_job(
                lambda: refresh_dashboard(mob, bundle, mobile=True, home_vars=home))
            mob = new_mob or mob

    if replace:
        # The state that gets replaced, kept under Rewind first.
        await _snap(hass, url_path, mobile_url, {"kind": "save", "summary": ""})
    if write:
        await hass.async_add_executor_job(_write_photos, hass.config.config_dir, write)
    if out["settings"]:
        store = settings_store(hass)
        cur = await store.async_load() or {}
        folder = hass.config.path("casora_sicherungen")
        path = os.path.join(folder, f"import_{dt_util.now().strftime('%Y-%m-%d_%H%M%S')}_settings.json")

        def _backup() -> None:
            os.makedirs(folder, exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(cur, fh, ensure_ascii=False, indent=1)
        await hass.async_add_executor_job(_backup)
        merged = {**cur, **{k: v for k, v in out["settings"].items() if k in SECTIONS}}
        await store.async_save({k: v for k, v in merged.items() if v not in (None, "", [], {})})
    await dash.async_save(cfg)
    if mob_dash is not None and mob is not None:
        await mob_dash.async_save(mob)
    await _snap(hass, url_path, mobile_url, {"kind": "save", "summary": json.dumps({"origin": "imported"})})
    return {"url_path": url_path, "mobile_url": mobile_url, "photos": len(write), "renamed": len(renames),
            "mapped": len([1 for o, n in (msg.get("mapping") or {}).items() if n and n != o])}


def async_setup_share(hass) -> None:
    import voluptuous as vol

    from homeassistant.components import websocket_api

    from .const import DOMAIN

    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("share_setup"):
        return
    # Views live as long as HA's web server (outside hass.data[DOMAIN], like the other Casora views).
    if not hass.data.get(f"{DOMAIN}_share_views"):
        for view in _http_views():
            hass.http.register_view(view())
        hass.data[f"{DOMAIN}_share_views"] = True

    @websocket_api.require_admin
    @websocket_api.websocket_command({
        vol.Required("type"): "casora/share/apply",
        vol.Required("token"): str,
        vol.Required("url_path"): str,
        vol.Optional("mobile_url"): vol.Any(str, None),
        vol.Required("mode"): vol.In(["new", "replace"]),
        vol.Optional("mapping"): {str: vol.Any(str, None)},
        vol.Optional("photos", default=True): bool,
        vol.Optional("settings", default=False): bool,
    })
    @websocket_api.async_response
    async def ws_apply(hass, connection, msg) -> None:
        try:
            result = await _apply(hass, msg)
        except ShareError as err:
            connection.send_error(msg["id"], err.code, str(err))
            return
        except ValueError as err:  # dashboard not found
            connection.send_error(msg["id"], "not_found", str(err))
            return
        connection.send_result(msg["id"], result)

    websocket_api.async_register_command(hass, ws_apply)
    dom["share_setup"] = True
