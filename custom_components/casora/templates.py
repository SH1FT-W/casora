"""Build the panel's template bundle from the dashboard template tree.

The bundle is a derived artifact. Shipping it prebuilt means it can drift from
the templates it was built from, and a Save then writes stale templates into the
dashboard. Rebuilding it here keeps the two in step no matter who edited what.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import tempfile

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.util.yaml import load_yaml

from .card_package import effective_bundle, overlay_path
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SOURCE = "dashboards/casora/casora.yaml.example"
SOURCE_MOBILE = "dashboards/casora/casora_mobile.yaml.example"
TEMPLATE_DIR = "dashboards/templates/button_cards"
BUNDLE = f"custom_components/{DOMAIN}/panel/casora-templates.json"


EXCLUDE_DIRS = ("new popups (untested)",)


def _excluded(path: str) -> bool:
    return any(("/%s/" % d) in path or path.endswith("/%s" % d) for d in EXCLUDE_DIRS)


def _newest_mtime(*paths: str) -> float:
    newest = 0.0
    for path in paths:
        if os.path.isfile(path):
            newest = max(newest, os.path.getmtime(path))
            continue
        for dirpath, _dirnames, filenames in os.walk(path):
            if _excluded(dirpath):
                continue
            for name in filenames:
                if name.endswith(".yaml"):
                    newest = max(newest, os.path.getmtime(os.path.join(dirpath, name)))
    return newest


def _excluded_keys(config_dir: str) -> set[str]:
    """The top-level template names defined under an excluded directory."""
    names: set[str] = set()
    tree = os.path.join(config_dir, "templates", "button_cards")
    for dirname in EXCLUDE_DIRS:
        root = os.path.join(tree, dirname)
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for fname in filenames:
                if not fname.endswith(".yaml"):
                    continue
                try:
                    doc = load_yaml(os.path.join(dirpath, fname))
                except Exception:  # a broken draft must not stop a rebuild
                    continue
                if isinstance(doc, dict):
                    names.update(doc)
    return names


def _build(source: str, mobile_source: str) -> dict:
    cfg = load_yaml(source)

    templates = cfg.get("button_card_templates")
    if not templates:
        raise ValueError(f"no button_card_templates in {source}")

    for name in _excluded_keys(os.path.dirname(os.path.dirname(source))):
        templates.pop(name, None)

    home = next((v for v in cfg.get("views", []) if v.get("path") == "home"), None)
    if home is None:
        raise ValueError(f"no view with path 'home' in {source}")

    cards = home.get("cards") or []
    if len(cards) < 3:
        raise ValueError(f"home view has {len(cards)} cards, expected at least 3")

    return {
        "version": "1",
        "templates": templates,
        # The nav card is the scaffold's, not the user's dashboard.
        "scaffold": {
            "view_type": home["type"],
            "layout": home["layout"],
            "nav": cards[1],
        },
        "mobile": _mobile_scaffold(mobile_source),
    }


def _mobile_scaffold(source: str) -> dict | None:
    """The phone layout's pieces. Only the pieces: which child is chrome and
    which is a section is knowledge the panel holds next to its extractor, and
    duplicating that rule here is how the two would drift."""
    if not os.path.exists(source):
        return None
    cfg = load_yaml(source)
    views = cfg.get("views") or []
    if not views:
        return None
    view = views[0]
    cards = view.get("cards") or []
    if len(cards) < 2 or (cards[1] or {}).get("type") != "custom:casora-smart-row":
        return None
    return {
        "view_type": view["type"],
        "layout": view["layout"],
        "shell": cards[0],
        "row": {k: v for k, v in cards[1].items() if k != "cards"},
        "children": cards[1].get("cards") or [],
        "extras": {k: v for k, v in cfg.items()
                   if k not in ("views", "button_card_templates")},
    }


def _bundle_is_whole(out: str) -> bool:
    """Whether the bundle on disk carries everything this builder emits."""
    try:
        with open(out, encoding="utf-8") as handle:
            bundle = json.load(handle)
    except (OSError, ValueError):
        return False
    if not bundle.get("templates") or not bundle.get("scaffold"):
        return False
    if bundle.get("mobile") is None:
        _LOGGER.info("Casora: bundle has no phone scaffold, rebuilding")
        return False
    return True


def rebuild_if_stale(config_dir: str) -> bool:
    """Regenerate the bundle when a template is newer than it. Blocking."""
    source = os.path.join(config_dir, SOURCE)
    tree = os.path.join(config_dir, TEMPLATE_DIR)
    out = os.path.join(config_dir, BUNDLE)

    if not os.path.exists(source) or not os.path.isdir(tree):
        _LOGGER.debug("Casora: no template source, keeping the shipped bundle")
        return False

    newest = _newest_mtime(source, os.path.join(config_dir, SOURCE_MOBILE), tree)
    try:
        current = os.path.getmtime(out)
    except OSError:
        current = 0.0

    # An mtime check alone trusts whoever wrote the bundle last to have finished.
    if current >= newest and _bundle_is_whole(out):
        return False

    try:
        bundle = _build(source, os.path.join(config_dir, SOURCE_MOBILE))
    except Exception:
        # A half-written template must not take the panel down with it.
        _LOGGER.exception("Casora: could not rebuild the template bundle")
        return False

    # Eigener Zwischenname je Lauf: zwei gleichzeitige Abrufe (zwei Studio-Tabs) schrieben
    # sonst in dieselbe .tmp-Datei.
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(out) + ".", suffix=".tmp", dir=os.path.dirname(out))
    os.chmod(tmp, 0o644)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(bundle, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, out)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise

    _LOGGER.info("Casora: rebuilt the template bundle (%d templates)", len(bundle["templates"]))
    return True


class CasoraTemplatesView(HomeAssistantView):
    """The template bundle, rebuilt on the way out.

    It used to be a static file, so rebuild_if_stale ran only at setup. Editing
    a template and hitting Save in the panel then wrote the PREVIOUS bundle and
    still reported "refreshed 79 template(s)" - the edit was simply absent, with
    nothing to say so. Rebuilding here means a Save always writes what is on
    disk, and the reload-before-save step stops existing.
    """

    url = "/api/casora/templates"
    name = "api:casora:templates"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        out = os.path.join(hass.config.config_dir, BUNDLE)

        def _read() -> str | None:
            rebuild_if_stale(hass.config.config_dir)
            try:
                with open(out, encoding="utf-8") as handle:
                    body = handle.read()
            except OSError:
                return None
            # Angenommene Karten-Updates darüberlegen (card_package.py) – das Studio
            # speichert so dieselben Vorlagen, die auch das Auffrischen schreibt.
            if not os.path.exists(overlay_path(hass.config.config_dir)):
                return body
            try:
                bundle, active = effective_bundle(json.loads(body), hass.config.config_dir)
            except ValueError:
                return body
            return json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) if active else body

        body = await hass.async_add_executor_job(_read)
        if body is None:
            return web.Response(status=404, text="no template bundle")
        # Never behind: der Browser fragt jedes Mal nach (no-cache), bekommt aber bei
        # unverändertem Inhalt nur „304“ statt 2,4 MB – und sonst gepackt (~0,5 MB).
        raw = body.encode("utf-8")
        etag = '"' + hashlib.sha1(raw).hexdigest()[:20] + '"'
        headers = {"Cache-Control": "private, no-cache", "ETag": etag, "Vary": "Accept-Encoding"}
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=304, headers=headers)
        if "gzip" not in request.headers.get("Accept-Encoding", "").lower():
            return web.Response(body=raw, content_type="application/json", headers=headers)
        packed = self._packed.get(etag)
        if packed is None:
            packed = await hass.async_add_executor_job(lambda: gzip.compress(raw, 6, mtime=0))
            self._packed = {etag: packed}
        headers["Content-Encoding"] = "gzip"
        return web.Response(body=packed, content_type="application/json", headers=headers)

    _packed: dict[str, bytes] = {}
