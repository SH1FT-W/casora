"""Nach einem Casora-Update die Dashboards auf die neuen Vorlagen bringen.

Früher bekam ein Dashboard verbesserte Vorlagen erst, wenn jemand im Studio
speicherte. Jetzt passiert das beim Start von HA, sobald das Vorlagen-Bundle
(panel/casora-templates.json, samt angenommener Karten-Updates aus
/config/casora_updates/templates.json) ein anderes ist als beim letzten Durchlauf –
bzw. sofort nach dem Annehmen eines Karten-Updates (card_updates.py):

  - nur Casora-Dashboards (mit casora_template_fingerprint),
  - nur Vorlagen, die laut Fingerabdruck unverändert von Casora stammen
    (template_print.refresh_templates, auto=True – selbe Regeln und Prüfsummen
    wie refreshTemplates() im Studio); geänderte bleiben, wie sie sind,
  - Routen und Szenenwahl des Dashboards bleiben (wie retargetRoutes/applyScenePick),
  - vorher und nachher ein Stand unter „Versionen“, Desktop und Handy-Layout zusammen,
  - je Dashboard einmal je Bundle (.storage/casora.template_refresh).

Das Studio zeigt beim nächsten Öffnen einen Hinweis (casora/templates/auto_notice).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .card_package import effective_templates, read_overlay
from .const import DOMAIN, VERSION
from .template_print import FINGERPRINT_KEY, home_vars_of, refresh_dashboard
from .templates import BUNDLE

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.template_refresh"
STORAGE_VERSION = 1
SUMMARY = json.dumps({"origin": "update", "added": [], "removed": [], "changed": [],
                      "general": False, "phone": False})
# Nur in den Test-HAs (erkennbar an der Mock-Integration): von Hand erweiterte
# Vergleichs-Dashboards, in die auch das Update nichts hineinschreibt.
LOCKED = re.compile(r"^dashboard-hemma(-mobile)?$")
TEST_MARKER = "custom_components/casora_mock"
MOBILE_SHELL = "casora_mobile_bg"


def _store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "template_refresh_store" not in data:
        data["template_refresh_store"] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    return data["template_refresh_store"]


def _is_mobile(cfg: dict) -> bool:
    try:
        return any((c or {}).get("template") == MOBILE_SHELL for c in cfg["views"][0]["cards"])
    except (KeyError, IndexError, TypeError):
        return False


def _read_bundle(config_dir: str) -> tuple[dict, str] | None:
    try:
        with open(os.path.join(config_dir, BUNDLE), encoding="utf-8") as fh:
            templates = json.load(fh).get("templates")
    except (OSError, ValueError):
        return None
    if not isinstance(templates, dict) or not templates:
        return None
    # Mit angenommenen Karten-Updates (card_package.py): ändert sich die Überlagerung,
    # ändert sich die Prüfsumme – und die Dashboards werden neu aufgefrischt.
    templates, _active = effective_templates(templates, read_overlay(config_dir))
    raw = json.dumps(templates, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return templates, hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def _casora_dashboards(hass: HomeAssistant) -> dict[str, tuple[Any, dict]]:
    """url_path → (Dashboard-Objekt, Konfiguration) aller Casora-Dashboards im UI-Modus."""
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    data = hass.data.get(LOVELACE_DATA)
    out: dict[str, tuple[Any, dict]] = {}
    for url_path, dash in list((data.dashboards if data else {}).items()):
        if not url_path or getattr(dash, "mode", None) != "storage" or not hasattr(dash, "async_save"):
            continue
        try:
            cfg = await dash.async_load(False)
        except Exception:  # noqa: BLE001 – leer oder kaputt: kein Casora-Dashboard
            continue
        if isinstance(cfg, dict) and isinstance(cfg.get(FINGERPRINT_KEY), dict):
            out[url_path] = (dash, cfg)
    return out


async def async_refresh_dashboards(hass: HomeAssistant) -> int:
    """Alle Casora-Dashboards auffrischen, die das aktuelle Bundle noch nicht gesehen haben."""
    from .versions import _snap

    got = await hass.async_add_executor_job(_read_bundle, hass.config.config_dir)
    if got is None:
        _LOGGER.debug("Casora: kein Vorlagen-Bundle, nichts aufzufrischen")
        return 0
    bundle, digest = got
    test_ha = await hass.async_add_executor_job(os.path.isdir, hass.config.path(TEST_MARKER))
    store = _store(hass)
    data = await store.async_load() or {}
    applied: dict = data.get("applied") or {}

    dashes = await _casora_dashboards(hass)
    # Paare: Desktop + <url>-mobile gemeinsam, das Handy-Layout übernimmt die Szenenwahl des Desktops.
    groups: list[tuple[str | None, str | None]] = []
    done: set[str] = set()
    for url, (_d, cfg) in dashes.items():
        if url in done or _is_mobile(cfg):
            continue
        mob = url + "-mobile"
        pair = mob if mob in dashes and _is_mobile(dashes[mob][1]) else None
        groups.append((url, pair))
        done.update(x for x in (url, pair) if x)
    groups += [(None, url) for url in dashes if url not in done]

    changed_names: list[str] = []
    for desk, mob in groups:
        urls = [u for u in (desk, mob) if u]
        if all(applied.get(u) == digest for u in urls):
            continue
        if test_ha and any(LOCKED.match(u) for u in urls):
            _LOGGER.debug("Casora: %s ist gesperrt, Vorlagen bleiben", ", ".join(urls))
            for u in urls:
                applied[u] = digest
            continue
        home = home_vars_of(dashes[desk][1]) if desk else None
        results: dict[str, tuple[dict | None, dict]] = {}
        try:
            for u in urls:
                if applied.get(u) == digest:
                    continue
                cfg = dashes[u][1]
                mobile = u == mob
                results[u] = await hass.async_add_executor_job(
                    lambda c=cfg, m=mobile: refresh_dashboard(c, bundle, mobile=m, home_vars=home if m else None))
        except Exception:  # noqa: BLE001 – ein kaputtes Dashboard darf den Start nicht aufhalten
            _LOGGER.exception("Casora: Vorlagen für %s nicht aufgefrischt", ", ".join(urls))
            continue
        todo = {u: r for u, r in results.items() if r[0] is not None}
        for u, (_cfg, res) in results.items():
            if res.get("skipped"):
                _LOGGER.warning("Casora: %s – Vorlagen nicht aufgefrischt (%s)", u, res["skipped"])
        if todo:
            head = desk or mob
            mobile_url = mob if desk else None
            try:
                # Der Stand davor – so lässt sich das Update im Studio unter „Versionen“ zurückholen.
                await _snap(hass, head, mobile_url, {"kind": "initial"})
                for u, (new_cfg, _res) in todo.items():
                    await dashes[u][0].async_save(new_cfg)
                await _snap(hass, head, mobile_url, {"kind": "save", "summary": SUMMARY})
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Casora: Vorlagen für %s nicht gespeichert", ", ".join(urls))
                continue
            for u, (_cfg, res) in todo.items():
                _LOGGER.info(
                    "Casora: Dashboard %s auf die neuen Vorlagen gebracht (%d erneuert, %d neu, "
                    "%d selbst geänderte belassen%s)", u, res["updated"], res["added"], res["kept"],
                    f", {len(res['unknown'])} ohne Fingerabdruck belassen" if res["unknown"] else "")
            changed_names.append(head)
        for u in urls:
            applied[u] = digest

    data["applied"] = {u: d for u, d in applied.items() if u in dashes}
    if changed_names:
        prev = data.get("notice") or {}
        names = list(dict.fromkeys((prev.get("dashboards") or []) + changed_names))
        data["notice"] = {"count": len(names), "dashboards": names, "version": VERSION,
                          "ts": dt_util.now().isoformat()}
    await store.async_save(data)
    return len(changed_names)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/templates/auto_notice",
    vol.Optional("ack", default=False): bool,
})
@websocket_api.async_response
async def ws_notice(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Hinweis fürs Studio: {"notice": {count, dashboards, version, ts} | None}; ack löscht ihn."""
    store = _store(hass)
    data = await store.async_load() or {}
    notice = data.get("notice")
    if msg["ack"] and notice:
        data.pop("notice", None)
        await store.async_save(data)
    connection.send_result(msg["id"], {"notice": notice})


@callback
def async_setup_template_refresh(hass: HomeAssistant) -> None:
    dom = hass.data.setdefault(DOMAIN, {})
    if not dom.get("template_refresh_ws"):
        websocket_api.async_register_command(hass, ws_notice)
        dom["template_refresh_ws"] = True
    if dom.get("template_refresh_started"):
        return
    dom["template_refresh_started"] = True

    async def _run(_hass: HomeAssistant) -> None:
        try:
            await async_refresh_dashboards(hass)
        except Exception:  # noqa: BLE001 – nie den Start stören
            _LOGGER.exception("Casora: Auffrischen der Dashboard-Vorlagen fehlgeschlagen")

    async_at_started(hass, _run)
