"""Early fetch of the dashboard's core scripts (Ladezeit stage 3.2).

scripts/casora-preload.js is loaded on every page (frontend.add_extra_js_url, like casora-theme.js) and
announces casora-i18n.js, casora-core.js and the module loader as <link rel="modulepreload">, with exactly
the URLs of their Lovelace resources. The browser fetches and compiles them in parallel to HA's frontend;
the Lovelace resource still runs them, and one URL is one module, so nothing runs twice. Only when Casora
keeps the resources itself (storage mode): in yaml mode the user's URLs may differ, a preload would be
a second download.
"""

from __future__ import annotations

import os
from urllib.parse import quote

from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, I18N_SCRIPT, LOCAL_LOADER, SCRIPTS_URL_BASE

PRELOAD_JS = "casora-preload.js"
# What the first picture of a dashboard waits for, in this order.
PRELOADED = (I18N_SCRIPT, "casora-core.js", LOCAL_LOADER)
KEY = "preload_url"


def preload_url(stamp: int, resource_urls: dict[str, str]) -> str | None:
    """URL of the preload script for these resource URLs (name → URL), None when none is preloaded."""
    urls = [resource_urls[n] for n in PRELOADED if resource_urls.get(n)]
    if not urls:
        return None
    return f"{SCRIPTS_URL_BASE}/{PRELOAD_JS}?v={stamp}&u=" + quote(",".join(urls), safe="/:?=,")


async def async_set_preload(hass: HomeAssistant, scripts_dir: str, resource_urls: dict[str, str] | None) -> None:
    """Register the preload for these resource URLs (None: none) and drop a former one."""
    url = None
    if resource_urls:
        try:
            stamp = int(await hass.async_add_executor_job(os.path.getmtime, os.path.join(scripts_dir, PRELOAD_JS)))
        except OSError:
            stamp = None
        url = preload_url(stamp, resource_urls) if stamp is not None else None
    data = hass.data.setdefault(DOMAIN, {})
    old = data.get(KEY)
    if old == url:
        return
    async_unload_preload(hass)
    if url:
        add_extra_js_url(hass, url)
        data[KEY] = url


@callback
def async_unload_preload(hass: HomeAssistant) -> None:
    old = hass.data.get(DOMAIN, {}).pop(KEY, None)
    if old:
        try:
            remove_extra_js_url(hass, old)
        except (KeyError, ValueError):
            pass
