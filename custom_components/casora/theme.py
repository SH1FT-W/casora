"""Casora's designs, served by the integration itself.

Home Assistant has no public API for an integration to add a theme: frontend themes come from
configuration.yaml only. Casora therefore no longer registers HA themes and no longer writes a theme
file into the config folder. It keeps its designs here and the browser applies them:
scripts/casora-theme.js is loaded on every page (frontend.add_extra_js_url) and sets the variables of
the chosen design on the page root, the way HA applies a theme.

The design is one setting for the whole installation (Studio › Settings › Design), stored in
.storage/casora.theme. "" means "no Casora design" (the user's own HA theme applies), None means
"not chosen yet".

  casora/theme/subscribe ← {"hash"?: str}
      → events {"design": str|None, "names": [...], "hash": str, "theme"?: {...}}
        ("theme" only when the browser does not have that version cached; every signed-in user)
  casora/theme/set       ← {"design": str|None}   (admins; "", None or one of "names")
  casora/theme/get       ← {"name": str} → {"theme": {...}}   (any design, for previews)
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import re
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util.yaml import load_yaml

from .const import DOMAIN, SCRIPTS_DIR, SCRIPTS_URL_BASE

_LOGGER = logging.getLogger(__name__)

_DIR = os.path.dirname(__file__)
STORAGE_KEY = f"{DOMAIN}.theme"
STORAGE_VERSION = 1
THEME_JS = "casora-theme.js"

# Base values in theme.yaml (not a design of its own); the designs are in theme_*.yaml.
THEME_BASE = "Casora Basis"
THEME_GLAS = "Casora Glas"
# Former names: a design saved under one of them maps to today's name.
# "Casora Weich" was Casora until 05.10.2026. The legacy designs Hemma 2 (once "Casora Standard")
# and Hemma 1 (once "Casora Glass") are gone since 1.6.1 - their users get Casora Glas.
THEME_RENAMED = {"Casora Weich": "Casora", "Casora Standard": THEME_GLAS, "Casora Glass": THEME_GLAS,
                 "Hemma 2": THEME_GLAS, "Hemma 1": THEME_GLAS}
# Hemma's own theme was called "Hemma": only mapped when Hemma is gone.
THEME_RENAMED_IF_GONE = {"Hemma": THEME_GLAS}
# One-time notice on the dashboard (user data, casora-core.js): which Hemma look was replaced.
THEME_NOTICE_KEY = "casora_theme_notice"
THEME_NOTICE_FROM = {"Hemma 2": "Hemma 2", "Casora Standard": "Hemma 2", "Hemma 1": "Hemma 1",
                     "Casora Glass": "Hemma 1", "Hemma": "Hemma"}
# Keys of HA's own theme store (frontend), read once for the migration.
DEFAULT_KEYS = ("frontend_default_theme", "frontend_default_dark_theme")
FRONTEND_THEME_STORE = "frontend_theme"


# ── Designs ──────────────────────────────────────────────────────────────────

def _overlay(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _overlay(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_themes() -> dict:
    """All designs, each fully merged (base values + its own differences)."""
    data = load_yaml(os.path.join(_DIR, "theme.yaml")) or {}
    themes: dict = {}
    base = data.get(THEME_BASE)
    if not base:
        return themes
    # casora-theme-base: this look builds on another look (Nebel on Casora) instead of the base
    # values directly, so it is merged afterwards.
    later = []
    for fn in sorted(os.listdir(_DIR)):
        if fn.startswith("theme_") and fn.endswith(".yaml"):
            for name, over in (load_yaml(os.path.join(_DIR, fn)) or {}).items():
                parent = over.get("casora-theme-base") if isinstance(over, dict) else None
                if parent:
                    later.append((name, parent, {k: v for k, v in over.items() if k != "casora-theme-base"}))
                else:
                    themes[name] = _overlay(base, over)
    for name, parent, over in later:
        themes[name] = _overlay(themes.get(parent, base), over)
    # JSON round trip: plain values only (no shared YAML nodes), as the browser gets them.
    return json.loads(json.dumps(themes))


def theme_hash(theme: dict | None) -> str:
    if not theme:
        return ""
    return hashlib.sha1(json.dumps(theme, sort_keys=True).encode()).hexdigest()[:12]


def resolve_name(name: Any, hemma_gone: bool = True) -> str | None:
    """Today's name of a design (old names mapped), or None when it is no Casora name."""
    if not isinstance(name, str) or not name:
        return None
    if name in THEME_RENAMED:
        return THEME_RENAMED[name]
    if name in THEME_RENAMED_IF_GONE:
        return THEME_RENAMED_IF_GONE[name] if hemma_gone else None
    return name if name.startswith("Casora") else None


def migrate_design(saved: dict, names: Any, hemma_gone: bool) -> tuple[str | None, str | None]:
    """(design, notice_from) from HA's former default theme (light first, then dark).

    A Casora theme (also an old name) becomes the design; any other theme keeps the user's own look
    (design ""); nothing saved leaves the choice open (None). notice_from: the Hemma look replaced."""
    picked: str | None = None
    for key in DEFAULT_KEYS:
        v = saved.get(key)
        if not isinstance(v, str) or not v or v == "default":
            continue
        to = resolve_name(v, hemma_gone)
        if to in names:
            notice = THEME_NOTICE_FROM.get(v) if to == THEME_GLAS else None
            return to, notice
        picked = "" if picked is None else picked
    return picked, None


# ── Theme file of earlier versions ───────────────────────────────────────────
# Up to 26.10 Casora kept a copy of its designs in the user's themes folder (themes/casora-themes.yaml,
# when configuration.yaml loads that folder with !include_dir_merge_named). It is no longer written.
# An existing copy is deleted once (legacy_cleanup.py) or when the integration is removed, in both cases
# only when it still carries Casora's own first line.

OLD_THEME_FILE = "casora-themes.yaml"
OLD_THEME_MARKER = "# Von der Casora-Integration geschrieben"
_THEMES_INCLUDE = re.compile(r"^[ \t]+themes:[ \t]*!include_dir_merge_named[ \t]+['\"]?([^'\"\s#]+)", re.M)


def old_theme_file(config_dir: str) -> str | None:
    """Path (relative to the config folder) of the theme file an earlier Casora wrote, or None. Read only."""
    try:
        with open(os.path.join(config_dir, "configuration.yaml"), encoding="utf-8") as f:
            m = _THEMES_INCLUDE.search(f.read())
    except OSError:
        return None
    if not m:
        return None
    path = os.path.normpath(os.path.join(config_dir, m.group(1), OLD_THEME_FILE))
    try:
        with open(path, encoding="utf-8") as f:
            first = f.readline()
    except OSError:
        return None
    return os.path.relpath(path, config_dir) if first.startswith(OLD_THEME_MARKER) else None


def remove_old_theme_file(config_dir: str) -> None:
    """Integration removed: delete Casora's own former theme file (nothing else)."""
    rel = old_theme_file(config_dir)
    if rel:
        with contextlib.suppress(OSError):
            os.remove(os.path.join(config_dir, rel))


# ── Runtime ──────────────────────────────────────────────────────────────────

class _Runtime:
    def __init__(self, hass: HomeAssistant, themes: dict, store: Store, data: dict) -> None:
        self.hass = hass
        self.themes = themes
        self.hashes = {n: theme_hash(t) for n, t in themes.items()}
        self.store = store
        self.data = data
        self.subs: set = set()
        self.js_url: str | None = None

    @property
    def design(self) -> str | None:
        d = self.data.get("design")
        return d if d == "" or d in self.themes else None

    def payload(self, have: str | None) -> dict:
        d = self.design
        h = self.hashes.get(d or "", "")
        out: dict[str, Any] = {"design": d, "names": list(self.themes), "hash": h}
        if d and h != have:
            out["theme"] = self.themes[d]
        return out

    @callback
    def notify(self) -> None:
        for send in list(self.subs):
            try:
                send()
            except Exception:  # noqa: BLE001 - a closed connection must not stop the others
                self.subs.discard(send)


def _rt(hass: HomeAssistant) -> _Runtime | None:
    return hass.data.get(DOMAIN, {}).get("theme_rt")


async def async_set_design(hass: HomeAssistant, design: str | None) -> bool:
    """Set the design for the whole installation ("" = no Casora design, None = not chosen). False when unknown."""
    rt = _rt(hass)
    if rt is None or (design not in ("", None) and design not in rt.themes):
        return False
    if rt.data.get("design") != design:
        rt.data["design"] = design
        await rt.store.async_save(rt.data)
        rt.notify()
    return True


def current_design(hass: HomeAssistant) -> str | None:
    rt = _rt(hass)
    return rt.design if rt else None


async def _write_notices(hass: HomeAssistant, default_from: str | None, hemma_gone: bool) -> None:
    """Tell a user once that their Hemma look is now Casora Glas (casora-core.js shows it).

    Only users who really switch: their own profile theme was a Hemma look, or they have none and the
    default theme was one (default_from)."""
    try:
        from homeassistant.components.frontend.storage import async_user_store
    except ImportError:  # older HA without user data
        return
    for user in await hass.auth.async_get_users():
        if user.system_generated:
            continue
        try:
            store = await async_user_store(hass, user.id)
            old = store.data.get("theme")
            own = old.get("theme") if isinstance(old, dict) else None
            if own in (None, "", "default"):
                frm = default_from
            else:
                frm = THEME_NOTICE_FROM.get(own) if resolve_name(own, hemma_gone) == THEME_GLAS else None
            if frm:
                await store.async_set_item(THEME_NOTICE_KEY, {"from": frm, "to": THEME_GLAS})
        except Exception as err:  # noqa: BLE001 - one user without data does not stop the others
            _LOGGER.debug("Casora: theme notice not saved: %s", err)


async def _migrate(hass: HomeAssistant, names: list[str]) -> dict:
    """First start with this version: take over the design from HA's saved default theme, once.

    Reads HA's frontend theme store (read only, never written) - before this version the Casora designs
    were HA themes and the Studio saved the choice there."""
    saved: dict = {}
    try:
        saved = await Store(hass, 1, FRONTEND_THEME_STORE).async_load() or {}
    except Exception:  # noqa: BLE001 - unreadable: the choice stays open
        saved = {}
    hemma_gone = True
    try:
        from .hemma_cleanup import async_hemma_present

        hemma_gone = not await async_hemma_present(hass)
    except Exception:  # noqa: BLE001
        pass
    design, notice = migrate_design(saved if isinstance(saved, dict) else {}, names, hemma_gone)
    hass.async_create_task(_write_notices(hass, notice, hemma_gone))
    if design is not None:
        _LOGGER.info("Casora: design taken over from the former HA theme: %s", design or "(own theme)")
    return {"design": design, "migrated": True}


# ── WebSocket ────────────────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "casora/theme/subscribe", vol.Optional("hash"): str})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    rt = _rt(hass)
    if rt is None:
        connection.send_error(msg["id"], "not_ready", "Casora is not loaded")
        return
    have = {"hash": msg.get("hash")}

    @callback
    def send() -> None:
        p = rt.payload(have["hash"])
        if "theme" in p:
            have["hash"] = p["hash"]
        connection.send_message(websocket_api.event_message(msg["id"], p))

    rt.subs.add(send)
    connection.subscriptions[msg["id"]] = lambda: rt.subs.discard(send)
    connection.send_result(msg["id"])
    send()


@websocket_api.websocket_command({vol.Required("type"): "casora/theme/set", vol.Required("design"): vol.Any(None, str)})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if not await async_set_design(hass, msg["design"]):
        connection.send_error(msg["id"], "unknown_design", f"Unknown design: {msg['design']}")
        return
    connection.send_result(msg["id"], {"design": msg["design"]})


@websocket_api.websocket_command({vol.Required("type"): "casora/theme/get", vol.Required("name"): str})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    rt = _rt(hass)
    name = resolve_name(msg["name"]) or msg["name"]
    if rt is None or name not in rt.themes:
        connection.send_error(msg["id"], "unknown_design", f"Unknown design: {msg['name']}")
        return
    connection.send_result(msg["id"], {"name": name, "theme": rt.themes[name], "hash": rt.hashes[name]})


# ── Setup ────────────────────────────────────────────────────────────────────

async def async_setup_theme(hass: HomeAssistant) -> None:
    """First thing on load: designs, saved choice, WebSocket commands and the page script."""
    data = hass.data.setdefault(DOMAIN, {})
    if data.get("theme_rt") is None:
        themes = await hass.async_add_executor_job(load_themes)
        store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        saved = await store.async_load()
        if not isinstance(saved, dict) or not saved.get("migrated"):
            saved = await _migrate(hass, list(themes))
            await store.async_save(saved)
        data["theme_rt"] = _Runtime(hass, themes, store, saved)
    if not data.get("theme_ws"):
        websocket_api.async_register_command(hass, ws_subscribe)
        websocket_api.async_register_command(hass, ws_set)
        websocket_api.async_register_command(hass, ws_get)
        data["theme_ws"] = True
    rt = data["theme_rt"]
    if rt.js_url is None:
        path = hass.config.path(SCRIPTS_DIR, THEME_JS)
        try:
            stamp = int(await hass.async_add_executor_job(os.path.getmtime, path))
        except OSError:
            stamp = 0
        rt.js_url = f"{SCRIPTS_URL_BASE}/{THEME_JS}?v={stamp}"
        add_extra_js_url(hass, rt.js_url)


@callback
def async_unload_theme(hass: HomeAssistant) -> None:
    rt = _rt(hass)
    if rt is not None and rt.js_url:
        try:
            remove_extra_js_url(hass, rt.js_url)
        except (KeyError, ValueError):
            pass
        rt.js_url = None
