"""Diagnostics download for the Casora entry (Settings → Devices & services → Casora → ⋮ → Download diagnostics).

For bug reports: versions, which features are switched on, how big the setup is, which known integrations are
there, and the last errors of Casora's own checks. Like the Studio's "Copy diagnostics" (casora-panel-diagnostics.js)
nothing personal goes in: no entity ids, names, areas, dashboard addresses or titles, calendar or event titles,
keys, tokens, URLs or coordinates. Values are summarised (a switch stays true/false, a word from a fixed set stays,
everything else becomes a count or "set"), and async_redact_data with TO_REDACT runs over the result as a second net.
Test: dev/unit/diagnostics_test.py.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import MAJOR_VERSION, MINOR_VERSION, PATCH_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers.storage import STORAGE_DIR

from .const import DOMAIN, VERSION
from .dashboard_kinds import UNREADABLE, async_dashboard_configs, dashboard_kind
from .settings import SECTIONS, async_load_settings
from .stores import STORE_KEYS
from .templates import BUNDLE

# Keys that never leave as they are, wherever they sit (second net after the summaries below).
TO_REDACT = {
    "entity_id", "entity_ids", "device_id", "area_id", "area", "areas", "name", "names", "title", "url", "url_path",
    "path", "host", "token", "access_token", "api_key", "key", "password", "username", "email", "mail",
    "latitude", "longitude", "lat", "lng", "lon", "location", "message", "summary", "description", "calendar",
    "person", "persons", "unique_id",
}

# Integrations Casora's tiles and finders know by name: the same list as KNOWN_PLATFORMS in
# panel/casora-panel-diagnostics.js (dev/unit/diagnostics_test.py keeps both equal). Others are only counted.
KNOWN_PLATFORMS = (
    "casora", "casora_mock", "pulse", "tractive", "frigate", "reolink", "waste_collection_schedule", "teamtracker",
    "tankerkoenig", "roborock", "powercalc", "mobile_app", "group", "min_max",
    "home_connect", "home_connect_alt", "homeconnect_ws", "miele", "smartthings", "lg_thinq", "ha_washdata", "tumble",
    "whirlpool", "hon", "electrolux_status", "electrolux", "smartthinq_sensors", "candy", "haier",
    "delonghi_primadonna", "delonghi_coffee", "delonghi_coffeelink", "jura", "melitta_barista", "lamarzocco",
    "bambu_lab", "dwd_weather_warnings", "nina", "husqvarna_automower", "gardena_bluetooth",
    "unifi", "udr7", "fritz", "tplink_omada", "tplink_deco", "asuswrt", "netgear", "mikrotik", "eero",
)
# Integrations Casora works with besides the tiles' finders (AI, energy, the store it is installed from).
RELATED = ("ai_task", "energy", "hacs", "marketplace", "mealie", "button_card", "card_mod", "kiosk_mode", "browser_mod")

# An option value that is a word of this shape is a choice from a fixed list (e.g. "manual", "daily").
_WORD = re.compile(r"^[a-z][a-z_]{0,23}$")
_CARD_TYPE = re.compile(r"^(custom:)?[a-z0-9][a-z0-9_-]{0,40}$")
_ERROR_CODE = re.compile(r"^[a-z0-9_.-]{1,40}$", re.I)


def summarize(value: Any) -> Any:
    """A value without its content: switches and fixed words stay, the rest becomes a count or "set"."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, str):
        return value if _WORD.match(value) else ("set" if value else "")
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, (list, tuple, set, dict)):
        return {"count": len(value)}
    return "set"


def summarize_options(options: dict) -> dict[str, Any]:
    """Options of the entry: the keys are Casora's own (config_flow/options), the values summarised."""
    return {k: summarize(v) for k, v in sorted(options.items()) if isinstance(k, str) and _WORD.match(k)}


def summarize_settings(settings: Any) -> dict[str, Any]:
    """casora.settings: per known section only whether it is set and how many entries it has.

    The keys inside a section can be entity ids or zone names (notify.zone_phrases), so none are listed.
    """
    if not isinstance(settings, dict):
        return {"stored": False}
    out: dict[str, Any] = {"stored": True}
    for sec in SECTIONS:
        v = settings.get(sec)
        if v in (None, "", [], {}):
            continue
        out[sec] = {"count": len(v)} if isinstance(v, (dict, list)) else "set"
    return out


def _walk_cards(node: Any, templates: Counter, types: Counter, known: set[str]) -> None:
    if isinstance(node, list):
        for x in node:
            _walk_cards(x, templates, types, known)
        return
    if not isinstance(node, dict):
        return
    tpl = node.get("template")
    for t in (tpl if isinstance(tpl, list) else [tpl]):
        if isinstance(t, str) and t in known:
            templates[t] += 1
    typ = node.get("type")
    if isinstance(typ, str) and _CARD_TYPE.match(typ):
        types[typ] += 1
    for k in ("cards", "card", "sections", "custom_fields", "badges"):
        if k in node:
            _walk_cards(node[k], templates, types, known)


def summarize_dashboards(configs: dict[str, Any], known: set[str]) -> dict[str, Any]:
    """Casora dashboards (by kind) with views and tiles counted; other dashboards only counted.

    No url_path or title: both are chosen by the user.
    """
    casora: list[dict[str, Any]] = []
    other = unreadable = 0
    for cfg in configs.values():
        if cfg is UNREADABLE:
            unreadable += 1
            continue
        kind = dashboard_kind(cfg)
        if kind == "none":
            other += 1
            continue
        templates: Counter = Counter()
        types: Counter = Counter()
        views = cfg.get("views") if isinstance(cfg.get("views"), list) else []
        for v in views:
            if isinstance(v, dict):
                _walk_cards([v.get("cards"), v.get("sections"), v.get("badges")], templates, types, known)
        own_tpl = cfg.get("button_card_templates") if isinstance(cfg.get("button_card_templates"), dict) else {}
        casora.append({
            "kind": kind,
            "views": len(views),
            "cards": sum(types.values()),
            "tiles": dict(sorted(templates.items())),
            # Pairs, not a dict: card types like "calendar" or "entity" are also keys TO_REDACT catches.
            "card_types": sorted([t, n] for t, n in types.items()),
            "templates_in_dashboard": len(own_tpl),
            "own_templates": len([t for t in own_tpl if t not in known]),
        })
    return {"casora": casora, "other": other, "unreadable": unreadable}


def summarize_integrations(domains: Counter) -> dict[str, Any]:
    """Config entries per known domain (by name), all others only as a number."""
    named = set(KNOWN_PLATFORMS) | set(RELATED)
    return {
        "known": {d: n for d, n in sorted(domains.items()) if d in named},
        "other_count": len([d for d in domains if d not in named]),
    }


def _error(code: Any) -> Any:
    """An error code of Casora's checks; free text (it can name a host or a key) only as "set"."""
    if code in (None, ""):
        return None
    return code if isinstance(code, str) and _ERROR_CODE.match(code) else "set"


def _status(obj: Any) -> dict[str, Any] | None:
    st = getattr(obj, "status", None)
    if not isinstance(st, dict):
        return None
    return {"ok": st.get("ok"), "code": _error(st.get("code")), "at": st.get("at"), "count": st.get("count")}


def _template_names(config_dir: str) -> set[str]:
    try:
        with open(os.path.join(config_dir, BUNDLE), encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return set()
    tpl = data.get("templates") if isinstance(data, dict) else None
    return set(tpl) if isinstance(tpl, dict) else set()


def _store_files(config_dir: str) -> list[str]:
    return [k for k in STORE_KEYS if os.path.isfile(os.path.join(config_dir, STORAGE_DIR, k))]


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """Diagnostics of the Casora entry, without personal data."""
    from .update import DATA_LAST_CHECK, DATA_LAST_ERROR  # noqa: PLC0415 - update pulls in the platform

    data = hass.data.get(DOMAIN, {})
    known = await hass.async_add_executor_job(_template_names, hass.config.config_dir)
    files = await hass.async_add_executor_job(_store_files, hass.config.config_dir)
    try:
        configs = await async_dashboard_configs(hass)
    except Exception:  # noqa: BLE001 - diagnostics must come even without Lovelace
        configs = {}
    domains = Counter(e.domain for e in hass.config_entries.async_entries() if e.domain != DOMAIN)
    result = {
        "casora_version": VERSION,
        "ha_version": f"{MAJOR_VERSION}.{MINOR_VERSION}.{PATCH_VERSION}",
        "language": str(hass.config.language or "")[:5],
        "entry": {"version": entry.version, "minor_version": entry.minor_version, "state": str(entry.state),
                  "options": summarize_options(dict(entry.options))},
        "settings": summarize_settings(await async_load_settings(hass)),
        "store_files": files,
        "area_count": len(ar.async_get(hass).areas),
        "dashboards": summarize_dashboards(configs, known),
        "integrations": summarize_integrations(domains),
        "running": sorted(k for k in ("ki", "raumklima", "media_pause", "timers", "tanken", "charging",
                                      "notify_hidden", "waste_out", "live", "update_push") if data.get(k) is not None),
        "checks": {
            "update": {"last_check": data.get(DATA_LAST_CHECK), "last_error": _error(data.get(DATA_LAST_ERROR))},
            "tanken": _status(data.get("tanken")),
            "charging": _status(data.get("charging")),
        },
    }
    return async_redact_data(result, TO_REDACT)
