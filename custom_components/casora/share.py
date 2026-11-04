"""Export and import a Casora dashboard as one file (Studio → ⋯ → Export / Import from file).

The file (casora-<name>-<date>.casora) is a ZIP archive:

  manifest.json   {"format": 1, "kind": "casora-dashboard", "casora": "<version>", "exported": "<iso>",
                   "title", "url_path", "mobile_url", "rooms", "tiles", "photos", "icons", "settings"}
  dashboard.json  the desktop dashboard's views (no button_card_templates, no template fingerprint)
  mobile.json     the phone layout (optional)
  settings.json   Casora settings that belong to the dashboard (optional, SHARE_SECTIONS only)
  photos/<file>   own room and vehicle photos the dashboard points to (optional)
  icons/<file>    own room symbols (/api/casora/room_icons) the dashboard points to (optional)

No access tokens, passwords or HA secrets: the dashboard and the chosen settings only, with keys that
look like credentials removed and signed photo URLs reduced to the photo's name.

No code either (strip_code): a file is data. Export and import both leave out button_card_templates, the
template fingerprint, top-level keys other than KEEP_TOP, every value button-card or casora-nav would
run as JavaScript (`[[[ … ]]]`), HTML tags (button-card draws text as HTML), javascript: links and custom
cards other than CUSTOM_CARDS / casora-* (strip_code). The few expressions the Studio itself writes into a dashboard are rebuilt
from Casora's own text (casora_code), never copied from the file. On import the dashboard gets the
templates this Casora ships, with a fingerprint computed from what is written (ship_templates).

Import is two steps: the file is uploaded (POST /api/casora/share/import, admins only), checked and
held in memory for STAGE_TTL; the Studio shows a preview and the entities missing in this home. Then
casora/share/apply writes it into a dashboard the Studio created (new) or into an existing one
(replace): the state before is kept under Rewind first, so nothing is lost.

  GET  /api/casora/share/export?url_path=…[&mobile_url=…][&photos=1][&settings=1] → the file
  POST /api/casora/share/import   multipart "file" → preview (see _preview)
  casora/share/apply ← {"token", "url_path", "mobile_url"?, "mode": "new"|"replace", "mapping"?,
                        "photos"?, "settings"?} → {"url_path", "photos", "icons", "mapped"}

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
# Own room symbols (room_icons.py): file names as room_icons.SAFE_FILE, referenced by their public path.
ICON_BASE = "/local/casora/icons/eigene/"
ICON_FILE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}\.(?:svg|png)$")
ICON_REF = re.compile(r"/local/casora/icons/eigene/([a-z0-9][a-z0-9-]{0,47}\.(?:svg|png))(?![a-z0-9.-])")
MAX_ICON = 200 * 1024

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


# ─── Code ─────────────────────────────────────────────────────────────────────

# button-card, casora-nav and kiosk-mode run a string shaped like [[[ … ]]] as JavaScript. Any string with
# either marker is dropped, so no two harmless-looking halves can be joined into one later.
CODE = re.compile(r"\[\[\[|\]\]\]")
# Top-level keys of a Casora dashboard that travel; everything else (templates of any card, the
# fingerprint, other plugins' settings) stays behind.
KEEP_TOP = ("title", "views", "kiosk_mode")
# Studio-written expressions (casora-panel.js SCENE_BADGE_EXPR and the motion badge of retargetRoutes);
# dev/unit/share_test.py checks they match the Studio's text.
SCENE_BADGE_EXPR = ("[[[ const ids = window.casoraNavScenes ? window.casoraNavScenes(hass, variables.scene_exclude) : [];"
                    " const o = variables.scene_order || []; const at = (x) => { const i = o.indexOf(x); return i < 0 ? 999 : i; };"
                    " return ids.slice().sort((a, b) => at(a) - at(b)); ]]]")
_MOTION_HEAD = "[[[ const b = states['input_boolean.casora_motion_badges']; if (b && b.state !== 'on') return false; const s = states['"
_MOTION_TAIL = "']; return !!s && s.state === 'on'; ]]]"
MOTION_BADGE = re.compile("^" + re.escape(_MOTION_HEAD) + r"([a-z_]+\.[a-z0-9_]+)" + re.escape(_MOTION_TAIL) + "$")


def motion_badge(entity_id: str) -> str:
    """The nav badge expression the Studio writes for a room with a motion sensor."""
    return _MOTION_HEAD + entity_id + _MOTION_TAIL


# button-card draws name, label, state, custom_fields and tooltip as HTML (lit unsafeHTML): a tag in a file's
# text could carry an event handler. Only the content of HA's own markdown card (sanitised by HA) may hold HTML.
HTML_TAG = re.compile(r"<[A-Za-z!/?]")
_URL_JUNK = re.compile(r"[\x00-\x20\x7f]+")
# Custom cards a Casora dashboard uses. Any other custom card stays behind: it may run its own kind of code
# (config-template-card's ${…}, apexcharts' EVAL:, …) and would run in this home, where it may be installed.
CUSTOM_CARDS = frozenset(("button-card", "grid-layout", "layout-card", "vertical-layout", "horizontal-layout",
                          "masonry-layout", "layout-break", "auto-entities", "mushroom-title-card"))


def casora_code(value: str, key: Any, place: str) -> str | None:
    """Casora's own expression for a value the Studio writes as code, rebuilt from Casora's text; else None.

    place: "room_vars" (variables of a casora_room card) or "badge" (a nav route's badge); elsewhere None.
    scene_entities: the home room's scene badge (older Studios wrote other texts; all mean "the scenes of the
    navigation"). show: a route's motion badge, only in the exact form with a plain entity ID.
    """
    if key == "scene_entities" and place == "room_vars":
        return SCENE_BADGE_EXPR
    if key == "show" and place == "badge":
        m = MOTION_BADGE.match(value)
        if m and ENTITY_ID.match(m.group(1)):
            return motion_badge(m.group(1))
    return None


# Jinja: auto-entities builds card configs from a filter template at runtime (past every check here).
JINJA = re.compile(r"\{\{|\{%")
# Values the Studio and the templates put into generated code as entity IDs (retargetRoutes: motion_entity,
# popup helpers …). A real entity ID never holds any of QUOTE_ETC.
ENTITY_KEY = re.compile(r"(?:^|_)(?:entity|entities|entity_id|helper|sensor)(?:_[0-9]+)?$")
QUOTE_ETC = re.compile(r"['\"`\\;(){}<>]")
ENTITY_START = re.compile(r"^\s*([a-z_]+)\.")
# ${…}: auto-entities with eval_js, config-template-card and others run it as a JS template literal.
TEMPLATE_LIT = re.compile(r"\$\{")
ACTION_KEYS = ("service", "action", "perform_action", "command")
# Where a dict is a card (a markdown card there is HA's own, which sanitises its content). Not: a key of
# custom_fields or variables that merely is called "type" (button-card draws those fields as HTML).
CARD_SLOTS = ("cards", "card", "popup_extra_cards")
MARKDOWN = "markdown card"


def is_code(s: str, key: Any = None, card_type: Any = None) -> bool:
    """A string that could run as code in a dashboard (CODE, HTML_TAG, JINJA, a bent entity ID) or as a link.

    card_type MARKDOWN: s is a value of HA's markdown card in a card position (HTML and Jinja allowed there).
    """
    if CODE.search(s):
        return True
    markdown = card_type == MARKDOWN and key == "content"
    if (HTML_TAG.search(s) or JINJA.search(s) or TEMPLATE_LIT.search(s)) and not markdown:
        return True
    if QUOTE_ETC.search(s) and not markdown and ((isinstance(key, str) and ENTITY_KEY.search(key))
                                                 or (ENTITY_START.match(s) and ENTITY_START.match(s).group(1) in ENTITY_DOMAINS)):
        return True
    low = _URL_JUNK.sub("", s).lower()
    if low.startswith("data:") and not (low.startswith("data:image/") and isinstance(key, str)
                                        and (PHOTO_KEY.search(key) or "icon" in key)):
        return True
    if key == "layout_type" and foreign_card({"type": s}):
        return True
    if key in ACTION_KEYS and low.endswith("javascript"):
        return True  # browser_mod.javascript, also as browser_mod's bare "javascript" service
    return low.startswith(("javascript:", "vbscript:")) or low in ("browser_mod.javascript", "eval_js")


def foreign_card(o: Any) -> bool:
    """A card (or anything typed custom:…) that is not one of CUSTOM_CARDS or Casora's own elements."""
    t = o.get("type") if isinstance(o, dict) else None
    if not isinstance(t, str) or not _URL_JUNK.sub("", t).lower().startswith("custom:"):
        return False
    name = t[len("custom:"):] if t.startswith("custom:") else ""
    return not (name in CUSTOM_CARDS or re.fullmatch(r"casora-[a-z0-9-]+", name))


def _is_room(o: dict) -> bool:
    tpl = o.get("template")
    return tpl == "casora_room" or (isinstance(tpl, list) and "casora_room" in tpl)


def strip_code(obj: Any, dropped: list | None = None) -> Any:
    """Copy of obj without anything that could run as code (is_code, foreign_card); dropped collects what went.

    Dict entries with such a value (or key) are removed, list items too; Casora's own expressions are
    rebuilt in their place (casora_code). Iterative, so a deeply nested file cannot exhaust the stack.
    """
    def drop(what) -> None:
        if dropped is not None:
            dropped.append(what)

    out_root: list = [None]
    stack: list = [(obj, None, out_root, 0, None, "")]
    while stack:
        o, key, parent, slot, card_type, place = stack.pop()
        if isinstance(o, dict):
            new: dict = {}
            parent[slot] = new
            own_type = o.get("type") if isinstance(o.get("type"), str) else None
            if own_type == "markdown" and key in CARD_SLOTS:
                own_type = MARKDOWN
            for k, v in o.items():
                if isinstance(k, str) and is_code(k):
                    drop(k)
                    continue
                if isinstance(v, str):
                    if is_code(v, k, own_type):
                        mine = casora_code(v, k, place)
                        if mine is not None:
                            new[k] = mine
                        if mine != v:
                            drop(k)
                        continue
                    new[k] = v
                elif isinstance(v, (dict, list)):
                    if foreign_card(v):
                        drop(k)
                        continue
                    sub = ("room_vars" if k == "variables" and _is_room(o) else "badge" if k == "badge" else "")
                    new[k] = None
                    stack.append((v, k, new, k, own_type, sub))
                else:
                    new[k] = v
        elif isinstance(o, list):
            items: list = []
            parent[slot] = items
            for v in o:
                if (isinstance(v, str) and is_code(v, key, card_type)) or foreign_card(v):
                    drop(key)
                    continue
                items.append(None)
                if isinstance(v, (dict, list)):
                    stack.append((v, key, items, len(items) - 1, card_type, ""))
                else:
                    items[-1] = v
        elif isinstance(o, str) and is_code(o, key, card_type):
            drop(key)
            parent[slot] = None
        elif foreign_card(o):
            drop(key)
            parent[slot] = None
        else:
            parent[slot] = o
    return out_root[0]


def own_bases(templates: Any, shipped: set[str] | frozenset[str]) -> dict[str, str]:
    """Own tile types (own_<name>, casora-panel-kachelart.js) → the shipped Casora template they extend."""
    if not isinstance(templates, dict):
        return {}

    def base_of(name: str) -> str | None:
        tpl = templates.get(name)
        tile = tpl.get("variables", {}).get("casora_tile") if isinstance(tpl, dict) and isinstance(
            tpl.get("variables"), dict) else None
        base = tile.get("base") if isinstance(tile, dict) else None
        return base if isinstance(base, str) else None

    out: dict[str, str] = {}
    for name in templates:
        if name in shipped:
            continue
        cur, seen = name, set()
        while isinstance(cur, str) and cur not in shipped and cur not in seen and len(seen) < 8:
            seen.add(cur)  # an own type may extend another own type
            cur = base_of(cur)
        if isinstance(cur, str) and cur in shipped:
            out[name] = cur
    return out


def _retarget_tiles(obj: Any, bases: dict[str, str]) -> Any:
    """Cards on an own tile type point at its Casora base instead (the own template does not travel)."""
    if not bases:
        return obj
    stack = [obj]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            tpl = o.get("template")
            if isinstance(tpl, str) and tpl in bases:
                o["template"] = bases[tpl]
            elif isinstance(tpl, list):
                o["template"] = [bases.get(t, t) if isinstance(t, str) else t for t in tpl]
            stack.extend(v for v in o.values() if isinstance(v, (dict, list)))
        elif isinstance(o, list):
            stack.extend(v for v in o if isinstance(v, (dict, list)))
    return obj


def clean_dashboard(cfg: Any, shipped: set[str] | frozenset[str] | None) -> tuple[Any, dict]:
    """A dashboard as it may travel: KEEP_TOP keys only, no templates, no code.

    shipped: names of the templates this Casora ships (None: unknown, own tile types are not retargeted).
    → (clean config, {"templates": own templates left out, "code": values with code left out}).
    """
    if not isinstance(cfg, dict):
        return cfg, {"templates": [], "code": 0}
    templates = cfg.get(TEMPLATES) if isinstance(cfg.get(TEMPLATES), dict) else {}
    ship = shipped or frozenset()
    own = sorted(k for k in templates if k not in ship) if shipped is not None else sorted(templates)
    dropped: list = []
    out = strip_code({k: v for k, v in cfg.items() if k in KEEP_TOP}, dropped)  # a fresh copy
    _retarget_tiles(out, own_bases(templates, ship) if shipped is not None else {})
    return out, {"templates": own, "code": len(dropped)}


def too_deep(obj: Any, limit: int) -> bool:
    """More than limit levels of nesting (a dashboard has about 15); checked without recursion."""
    stack = [(obj, 1)]
    while stack:
        o, n = stack.pop()
        if n > limit:
            return True
        if isinstance(o, dict):
            stack.extend((v, n + 1) for v in o.values() if isinstance(v, (dict, list)))
        elif isinstance(o, list):
            stack.extend((v, n + 1) for v in o if isinstance(v, (dict, list)))
    return False


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


# ─── Own room symbols ─────────────────────────────────────────────────────────

def icon_names(cfgs: list[Any]) -> set[str]:
    """File names of the own room symbols the configs point to."""
    out: set[str] = set()
    for cfg in cfgs:
        for s, _key in _strings(without_templates(cfg) if isinstance(cfg, dict) else cfg):
            if ICON_BASE in s:
                out.update(m.group(1) for m in ICON_REF.finditer(s))
    return out


def icon_plan(icons: dict[str, bytes], existing: dict[str, bytes]) -> tuple[dict[str, bytes], dict[str, str]]:
    """Which symbol files to write and which names change.

    existing: file name → bytes of every own symbol in this home. The same symbol (same bytes) is never
    written twice, also under another name; a name taken by another symbol gets the next free „-2“, „-3“
    (as an upload in room_icons.store). → ({file name: bytes to write}, {old file: new file}).
    """
    by_hash = {}
    for name in sorted(existing):
        by_hash.setdefault(_sha(existing[name]), name)
    taken = {n.rsplit(".", 1)[0] for n in existing}
    write: dict[str, bytes] = {}
    renames: dict[str, str] = {}
    for name, data in sorted(icons.items()):
        same = by_hash.get(_sha(data))
        if same:
            if same != name:
                renames[name] = same
            continue
        stem, ext = name.rsplit(".", 1)
        target, n = stem, 2
        while target in taken:
            target = f"{re.sub(r'-[0-9]+$', '', stem)[:44]}-{n}"
            n += 1
        taken.add(target)
        by_hash[_sha(data)] = target + "." + ext
        write[target + "." + ext] = data
        if target != stem:
            renames[name] = target + "." + ext
    return write, renames


def rename_icons(obj: Any, renames: dict[str, str]) -> Any:
    """Point symbol paths at new file names ({old file: new file})."""
    if not renames:
        return obj

    def fn(s: str, _key):
        if ICON_BASE not in s:
            return s
        return ICON_REF.sub(lambda m: ICON_BASE + renames.get(m.group(1), m.group(1)), s)
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
                 settings: dict | None, photos: dict[str, bytes] | None, version: str, exported: str,
                 icons: dict[str, bytes] | None = None, shipped: set[str] | frozenset[str] | None = None) -> bytes:
    """The export file. photos / icons: file name → bytes (already chosen by the caller).

    shipped: names of the templates this Casora ships; tiles on an own tile type then point at its base.
    The file never carries templates or code (clean_dashboard): what the import would drop stays out.
    """
    if not isinstance(config, dict) or not isinstance(config.get("views"), list):
        raise ShareError("broken", "dashboard has no views")
    cfg = scrub(clean_dashboard(config, shipped)[0])
    mob = scrub(clean_dashboard(mobile, shipped)[0]) if isinstance(mobile, dict) else None
    sets = {k: scrub(v) for k, v in strip_code({k: v for k, v in (settings or {}).items()
                                                  if k in SHARE_SECTIONS}).items()
            if v not in (None, "", [], {})}
    names = sorted(n for n in (photos or {}) if PHOTO_FILE.match(n))
    icon_files = sorted(n for n in (icons or {}) if ICON_FILE.match(n))
    manifest = {
        "format": FORMAT, "kind": KIND, "casora": version, "exported": exported,
        "title": title, "url_path": url_path, "mobile_url": mobile_url if mob is not None else None,
        "rooms": rooms_of(cfg), "tiles": tiles_of(cfg), "phone": mob is not None,
        "photos": names, "icons": icon_files, "settings": sorted(sets),
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
        for n in icon_files:
            z.writestr(zipfile.ZipInfo("icons/" + n, date_time=(2026, 1, 1, 0, 0, 0)), icons[n],
                       compress_type=zipfile.ZIP_DEFLATED)
    return buf.getvalue()


# ─── Import ───────────────────────────────────────────────────────────────────

MAX_DEPTH = 100


def _json(z: zipfile.ZipFile, name: str, what: str) -> Any:
    try:
        out = json.loads(z.read(name).decode("utf-8"))
    except KeyError:
        raise ShareError("broken", f"{name} missing") from None
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise ShareError("broken", f"{what} is not readable") from None
    if too_deep(out, MAX_DEPTH):
        raise ShareError("broken", f"{what} is nested too deeply")
    return out


def _is_dashboard(cfg: Any) -> bool:
    return isinstance(cfg, dict) and isinstance(cfg.get("views"), list) and all(
        isinstance(v, dict) and isinstance(v.get("cards", []), list) for v in cfg["views"])


def read_file(data: bytes, shipped: set[str] | frozenset[str] | None = None) -> dict:
    """Check an export file and unpack it, without any templates or code from it (clean_dashboard).

    shipped: names of the templates this Casora ships (own templates are counted against it).
    → {"manifest", "config", "mobile", "settings", "photos": {file: bytes}, "icons": {file: bytes},
       "left_out": {"templates": n, "code": n}};
      ShareError otherwise:
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
            icons: dict[str, bytes] = {}
            for info in infos:
                if not info.filename.startswith("icons/") or info.is_dir():
                    continue
                name = info.filename[len("icons/"):]
                if not ICON_FILE.match(name) or info.file_size > MAX_ICON:
                    continue  # checked again (SVG cleaned, PNG checked) before it is written
                icons[name] = z.read(info)
    except zipfile.BadZipFile:
        raise ShareError("broken", "the file is damaged") from None
    config, left = clean_dashboard(config, shipped)
    own, code = set(left["templates"]), left["code"]
    if mobile is not None:
        mobile, left = clean_dashboard(mobile, shipped)
        own.update(left["templates"])  # the phone layout carries the same templates: each name once
        code += left["code"]
    dropped: list = []
    # A section left empty would replace the receiver's own one with nothing: it stays out instead.
    settings = {k: v for k, v in strip_code(settings, dropped).items() if v not in (None, "", [], {})}
    code += len(dropped)
    return {"manifest": manifest, "config": scrub(config), "mobile": scrub(mobile) if mobile else None,
            "settings": scrub(settings), "photos": photos, "icons": icons,
            "left_out": {"templates": len(own), "code": code}}


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
        "icons": len(staged.get("icons") or {}),
        "settings": sorted(sets),
        "entities": len(refs),
        "missing": missing,
        # Never taken over: own templates and values with code (the tiles use this Casora's templates).
        "left_out": dict(staged.get("left_out") or {"templates": 0, "code": 0}),
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
            renames: dict[str, str] | None, with_settings: bool, icon_renames: dict[str, str] | None = None) -> dict:
    """Configs to save: links moved to the new address, entities mapped, photos and symbols renamed."""
    m = staged["manifest"]
    def path(p) -> str:
        # The file's dashboard address goes into a regex over JSON text: only a plain address counts.
        return p if isinstance(p, str) and re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,99}", p) else ""

    moves = [(path(m.get("url_path")), url_path)]
    if path(m.get("mobile_url")) and mobile_url:
        moves.append((path(m["mobile_url"]), mobile_url))
    # Longest first: '/casora-mobile' before '/casora'.
    moves.sort(key=lambda p: len(p[0]), reverse=True)

    def fix(cfg):
        if cfg is None:
            return None
        out = clean_dashboard(cfg, None)[0]  # again, whatever staged holds: templates and code never pass
        out = move_links(out, moves)
        out = apply_mapping(out, mapping or {})
        return strip_code(rename_icons(rename_photos(out, renames or {}), icon_renames or {}))
    return {
        "config": fix(staged["config"]),
        "mobile": fix(staged["mobile"]) if mobile_url else None,
        "settings": strip_code(rename_icons(rename_photos(apply_mapping(strip_code(staged["settings"]), mapping or {}),
                                                          renames or {}), icon_renames or {}))
        if with_settings else None,
    }


def ship_templates(cfg: dict, mob: dict | None, bundle: dict) -> tuple[dict, dict | None]:
    """The imported dashboard(s) with exactly the templates this Casora ships, as a fresh Casora dashboard.

    Whatever templates or fingerprint cfg/mob still hold are replaced; the fingerprint is computed from
    what is written, so nothing from the file can mark a template as „changed by the user“.
    Routes and scene choice come from the (clean) views, as refresh_dashboard does after an update.
    """
    from .template_print import FINGERPRINT_KEY, fingerprint_of, home_vars_of, refresh_dashboard

    def one(c: dict, **kw) -> dict:
        base = {k: v for k, v in c.items() if k not in (TEMPLATES, FINGERPRINT_KEY)}
        new, _r = refresh_dashboard(base, bundle, **kw)
        if new is None:
            # No navigation routes in the views to point the templates at: the templates as shipped.
            new = copy.deepcopy(base)
            new[TEMPLATES] = copy.deepcopy(bundle)
            new[FINGERPRINT_KEY] = fingerprint_of(new[TEMPLATES])
        return new

    out = one(cfg)
    return out, (one(mob, mobile=True, home_vars=home_vars_of(out)) if mob is not None else None)


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


def _icon_files(config_dir: str, names: set[str]) -> dict[str, bytes]:
    """Own symbol files with these names (export) or all of them (names empty → import check). Blocking."""
    import os

    from .room_icons import ICONS_DIR

    folder = os.path.join(config_dir, ICONS_DIR)
    out: dict[str, bytes] = {}
    try:
        files = sorted(os.listdir(folder))
    except OSError:
        return out
    for name in files:
        if not ICON_FILE.match(name) or (names and name not in names):
            continue
        try:
            with open(os.path.join(folder, name), "rb") as fh:
                out[name] = fh.read()
        except OSError:
            continue
    return out


def _clean_icons(icons: dict[str, bytes]) -> dict[str, bytes]:
    """Symbols from a file, checked like an upload: SVG rewritten, PNG with transparency; others dropped."""
    from .room_icons import IconError, check_png, sanitize_svg

    out: dict[str, bytes] = {}
    for name, data in icons.items():
        try:
            if name.endswith(".svg"):
                out[name] = sanitize_svg(data)
            else:
                check_png(data)
                out[name] = data
        except IconError:
            continue
    return out


def _write_icons(config_dir: str, files: dict[str, bytes]) -> None:
    import os

    from .room_icons import ICONS_DIR

    folder = os.path.join(config_dir, ICONS_DIR)
    os.makedirs(folder, exist_ok=True)
    for name, data in files.items():
        if not ICON_FILE.match(name):
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


async def _shipped(hass) -> frozenset[str] | None:
    """Names of the templates this Casora ships (with accepted card updates), None if unreadable."""
    from .template_refresh import _read_bundle

    got = await hass.async_add_executor_job(_read_bundle, hass.config.config_dir)
    return frozenset(got[0]) if got is not None else None


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
            # Own room symbols always travel: without them the rooms show an empty symbol.
            wanted = icon_names([config, mobile, settings])
            icons = await hass.async_add_executor_job(_icon_files, hass.config.config_dir, wanted) if wanted else {}
            title = q.get("title") or url_path
            now = dt_util.now()
            shipped = await _shipped(hass)
            try:
                body = await hass.async_add_executor_job(lambda: build_export(
                    title=title, url_path=url_path, mobile_url=mobile_url, config=config, mobile=mobile,
                    settings=settings, photos=photos, version=VERSION, exported=now.isoformat(timespec="seconds"),
                    icons=icons, shipped=shipped))
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
            shipped = await _shipped(hass)
            try:
                staged = await hass.async_add_executor_job(read_file, bytes(payload), shipped)
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
    icon_write: dict[str, bytes] = {}
    icon_renames: dict[str, str] = {}
    if staged.get("icons"):
        clean = await hass.async_add_executor_job(_clean_icons, staged["icons"])
        have = await hass.async_add_executor_job(_icon_files, hass.config.config_dir, set())
        icon_write, icon_renames = icon_plan(clean, have)
    out = prepare(staged, url_path=url_path, mobile_url=mobile_url, mapping=msg.get("mapping") or {},
                  renames=renames, with_settings=bool(msg.get("settings")) and bool(staged["settings"]),
                  icon_renames=icon_renames)

    # Only the templates this Casora ships, never the file's (prepare already left them out).
    got = await hass.async_add_executor_job(_read_bundle, hass.config.config_dir)
    if got is None:
        raise ShareError("no_templates", "Casora's templates could not be read")
    cfg, mob = await hass.async_add_executor_job(ship_templates, out["config"], out["mobile"], got[0])

    if replace:
        # The state that gets replaced, kept under Rewind first.
        await _snap(hass, url_path, mobile_url, {"kind": "save", "summary": ""})
    if write:
        await hass.async_add_executor_job(_write_photos, hass.config.config_dir, write)
    if icon_write:
        await hass.async_add_executor_job(_write_icons, hass.config.config_dir, icon_write)
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
            "icons": len(icon_write),
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
