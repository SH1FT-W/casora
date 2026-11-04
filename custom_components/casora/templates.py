"""Serve the panel's template bundle.

The bundle ships prebuilt in the package (tools/build-templates.py). Nothing is
ever written into the integration folder, and nothing in the config folder is
read to build it.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .card_package import effective_bundle, overlay_path
from .const import DOMAIN

BUNDLE = f"custom_components/{DOMAIN}/panel/casora-templates.json"


def bundle_text(config_dir: str) -> str | None:
    """The template bundle as JSON text, as shipped in the package. Blocking.

    Built by tools/build-templates.py from dashboards/casora/button_card_templates.json. YAML
    copies of the templates in the config folder (the old manual install) are never read: they
    are stale and would replace the shipped templates in the Studio and the startup refresh."""
    return _read_text(os.path.join(config_dir, BUNDLE))


def _read_text(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


class CasoraTemplatesView(HomeAssistantView):
    """The shipped template bundle, with accepted card updates laid over it.

    Read on every request (cheap: ETag/304), so a Save in the Studio always writes
    the bundle that is on disk now, including card updates accepted since.
    """

    url = "/api/casora/templates"
    name = "api:casora:templates"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        def _read() -> str | None:
            body = bundle_text(hass.config.config_dir)
            if body is None:
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
