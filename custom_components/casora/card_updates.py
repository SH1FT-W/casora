"""Karten-Updates (Stufe 1): Fehlerbehebungen für bestehende Karten ohne Casora-Release.

Quelle: GitHub-Releases von UPDATE_REPO mit Tag „karten-…“ (komplette Casora-Releases
heißen „vX.Y.Z“); das Paket hängt als JSON an (Format: card_package.py). Geholt wird
anonym über GitHubs öffentliche API, wie die Casora-Updates (update_source.py), alle
6 Stunden und auf Anfrage. Nichts davon wird im Server ausgeführt: angenommene
Vorlagen landen als Daten in /config/casora_updates/templates.json und wirken über
das effektive Vorlagen-Bundle (Studio: /api/casora/templates, Auffrischen:
template_refresh.py). Nach dem Annehmen werden alle Casora-Dashboards sofort
aufgefrischt – mit Stand unter „Versionen“, ohne Neustart.

WebSocket (nur Admins):
  casora/card_updates/list     ← {"refresh"?: bool}  → Übersicht (siehe _overview)
  casora/card_updates/apply    ← {"id"}             → {"id", "applied": [..], "skipped": [{name, state}], "dashboards": n}
  casora/card_updates/settings ← {"auto"?: bool}    → {"auto"}
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from datetime import timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .card_package import (
    MAX_PACKAGE_BYTES,
    PackageError,
    merge_package,
    package_states,
    prune_overlay,
    read_overlay,
    verify_package,
    write_overlay,
    effective_templates,
)
from .const import DOMAIN, VERSION
from .update_source import (
    UpdateSourceError,
    download_card,
    error_code,
    error_text,
    fetch_card_releases,
)
from .templates import BUNDLE

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.card_updates"
STORAGE_VERSION = 1
CHECK_INTERVAL = timedelta(hours=6)
TAG_PREFIX = "karten-"
KEEP_HISTORY = 50


def _read_shipped(config_dir: str, cache: dict) -> dict:
    """Ausgelieferte Vorlagen (panel/casora-templates.json), gemerkt je Änderungszeit."""
    path = os.path.join(config_dir, BUNDLE)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return {}
    if cache.get("mtime") != mtime:
        try:
            with open(path, encoding="utf-8") as fh:
                cache["templates"] = json.load(fh).get("templates") or {}
        except (OSError, ValueError):
            cache["templates"] = {}
        cache["mtime"] = mtime
    return cache["templates"]


class CardUpdates:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict | None = None
        self._shipped_cache: dict = {}
        self._lock = asyncio.Lock()
        self._unsub = None

    # ── Zustand ────────────────────────────────────────────────────────────
    async def _load(self) -> dict:
        if self._data is None:
            data = await self._store.async_load() or {}
            data.setdefault("auto", False)
            data.setdefault("applied", [])
            data.setdefault("packages", {})
            data.setdefault("rejected", {})
            self._data = data
        return self._data

    async def _save(self) -> None:
        await self._store.async_save(self._data)

    async def _shipped(self) -> dict:
        return await self.hass.async_add_executor_job(
            _read_shipped, self.hass.config.config_dir, self._shipped_cache)

    async def _overlay(self) -> dict:
        return await self.hass.async_add_executor_job(read_overlay, self.hass.config.config_dir)

    # ── Abruf (GitHub) ──────────────────────────────────────────────────────
    async def _fetch(self, shipped: dict) -> None:
        """Karten-Releases lesen, neue Pakete laden und prüfen. Fehler → Ausnahme."""
        data = await self._load()
        packages: dict = {}
        rejected: dict = {}
        for rel in await fetch_card_releases(self.hass, TAG_PREFIX):
            tag = rel["tag"]
            asset = rel["package"]
            meta = {"url": rel.get("url")}
            if asset is None:
                rejected[tag] = {**meta, "reason": "Release ohne Paket-Datei"}
                continue
            stamp = asset["stamp"]
            old = data["packages"].get(tag)
            if old and old.get("_asset") == stamp:
                packages[tag] = old
                continue
            old = data["rejected"].get(tag)
            if old and old.get("_asset") == stamp:
                rejected[tag] = old
                continue
            try:
                if asset["size"] > MAX_PACKAGE_BYTES:
                    raise PackageError("Paket zu groß")
                try:
                    raw = await download_card(self.hass, asset, MAX_PACKAGE_BYTES)
                except UpdateSourceError as err:
                    if err.code == "too_large":
                        raise PackageError("Paket zu groß") from err
                    # Anhang gelöscht/gesperrt: nur dieses Release ablehnen, die übrigen weiter prüfen.
                    if err.code in ("not_found", "forbidden"):
                        raise PackageError("Paket-Datei nicht abrufbar") from err
                    raise
                sha = asset.get("sha256") or ""
                if sha and sha != hashlib.sha256(raw).hexdigest():
                    raise PackageError("Datei-Prüfsumme des Release-Anhangs stimmt nicht")
                try:
                    pkg = json.loads(raw.decode("utf-8"))
                except ValueError as err:
                    raise PackageError("Paket ist kein gültiges JSON") from err
                if not isinstance(pkg, dict) or pkg.get("id") != tag:
                    raise PackageError("Paket-ID passt nicht zum Release-Tag")
            except PackageError as err:
                rejected[tag] = {**meta, "reason": str(err), "_asset": stamp}
                continue
            packages[tag] = {**pkg, "_asset": stamp, "_url": rel.get("url")}
        data["packages"] = packages
        data["rejected"] = rejected

    async def async_check(self) -> None:
        """Nach Karten-Updates sehen; bei „auto“ Neues gleich annehmen."""
        data = await self._load()
        shipped = await self._shipped()
        try:
            await self._fetch(shipped)
            data["error"] = None
        except Exception as err:  # noqa: BLE001 – offline oder GitHub-Limit: später wieder
            _LOGGER.debug("Casora: Karten-Updates nicht abrufbar: %s", err)
            data["error"] = error_text(error_code(err))
        data["checked"] = dt_util.now().isoformat()
        await self._save()
        if data.get("auto"):
            ov = await self._list_available(shipped, await self._overlay())
            for pkg in sorted((p for p in ov if p["applicable"]), key=lambda p: str(p.get("published") or "")):
                try:
                    await self.async_apply(pkg["id"])
                except PackageError as err:
                    _LOGGER.warning("Casora: Karten-Update %s nicht angenommen: %s", pkg["id"], err)

    # ── Übersicht ──────────────────────────────────────────────────────────
    async def _list_available(self, shipped: dict, overlay: dict) -> list[dict]:
        data = await self._load()
        done = {a["id"] for a in data["applied"]}
        out: list[dict] = []
        for pid, pkg in data["packages"].items():
            if pid in done:
                continue
            reason = None
            try:
                verify_package(pkg, installed_version=VERSION, shipped=shipped)
                items = package_states(pkg, shipped, overlay)
                if not any(i["state"] == "neu" for i in items):
                    continue  # schon enthalten (neueres Casora) oder überholt – nichts anzubieten
            except PackageError as err:
                reason = str(err)
                items = [{"name": str(i.get("name")), "notes": str(i.get("notes") or ""), "state": "ungueltig"}
                         for i in pkg.get("items") or [] if isinstance(i, dict)]
            out.append({"id": pid, "published": pkg.get("published"), "notes_md": str(pkg.get("notes_md") or ""),
                        "min_casora": pkg.get("min_casora"), "url": pkg.get("_url"),
                        "applicable": reason is None, "reason": reason, "items": items})
        for pid, rej in data["rejected"].items():
            if pid not in done:
                out.append({"id": pid, "published": None, "notes_md": "", "min_casora": None, "url": rej.get("url"),
                            "applicable": False, "reason": rej.get("reason"), "items": []})
        out.sort(key=lambda p: (str(p.get("published") or ""), p["id"]), reverse=True)
        return out

    async def async_overview(self) -> dict:
        data = await self._load()
        shipped = await self._shipped()
        overlay = await self._overlay()
        _eff, active = effective_templates(shipped, overlay)
        return {
            "enabled": True,
            "auto": bool(data.get("auto")),
            "checked": data.get("checked"),
            "error": data.get("error"),
            "installed": VERSION,
            "available": await self._list_available(shipped, overlay),
            "applied": list(reversed(data["applied"])),
            "active": sorted(active),
        }

    # ── Annehmen ───────────────────────────────────────────────────────────
    async def async_apply(self, pid: str) -> dict:
        from .template_refresh import async_refresh_dashboards

        async with self._lock:
            data = await self._load()
            if any(a["id"] == pid for a in data["applied"]):
                raise PackageError("Dieses Karten-Update ist schon angenommen")
            pkg = data["packages"].get(pid)
            if pkg is None:
                raise PackageError("Karten-Update nicht gefunden – bitte erneut nach Updates suchen")
            shipped = await self._shipped()
            verify_package(pkg, installed_version=VERSION, shipped=shipped)
            overlay = await self._overlay()
            new, taken, skipped = merge_package(overlay, pkg, shipped)
            if not taken:
                raise PackageError("Nichts zu übernehmen – alle Karten sind schon aktuell")
            await self.hass.async_add_executor_job(write_overlay, self.hass.config.config_dir, new)
            entry = {"id": pid, "published": pkg.get("published"), "applied_at": dt_util.now().isoformat(),
                     "notes_md": str(pkg.get("notes_md") or ""),
                     "items": [{"name": i["name"], "notes": str(i.get("notes") or "")}
                               for i in pkg["items"] if i["name"] in taken],
                     "skipped": skipped, "dashboards": 0}
            data["applied"] = (data["applied"] + [entry])[-KEEP_HISTORY:]
            await self._save()
            _LOGGER.info("Casora: Karten-Update %s angenommen (%s)", pid, ", ".join(taken))
            try:
                n = await async_refresh_dashboards(self.hass)
            except Exception:  # noqa: BLE001 – Vorlagen sind angenommen; Studio-Speichern holt es nach
                _LOGGER.exception("Casora: Dashboards nach Karten-Update %s nicht aufgefrischt", pid)
                n = 0
            entry["dashboards"] = n
            await self._save()
            return {"id": pid, "applied": taken, "skipped": skipped, "dashboards": n}

    async def async_set_auto(self, auto: bool) -> bool:
        data = await self._load()
        data["auto"] = bool(auto)
        await self._save()
        return data["auto"]

    async def async_prune(self) -> None:
        """Einträge wegräumen, die ein komplettes Casora-Update überholt hat."""
        shipped = await self._shipped()
        if not shipped:
            return
        overlay = await self._overlay()
        if not overlay["templates"]:
            return
        new, gone = prune_overlay(overlay, shipped)
        if gone:
            await self.hass.async_add_executor_job(write_overlay, self.hass.config.config_dir, new)
            _LOGGER.info("Casora: Karten-Updates in der installierten Version enthalten: %s", ", ".join(gone))


# ── WebSocket ─────────────────────────────────────────────────────────────

def _cu(hass: HomeAssistant) -> CardUpdates:
    return hass.data[DOMAIN]["card_updates"]


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/card_updates/list",
    vol.Optional("refresh", default=False): bool,
})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    cu = _cu(hass)
    if msg["refresh"]:
        await cu.async_check()
    connection.send_result(msg["id"], await cu.async_overview())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/card_updates/apply",
    vol.Required("id"): str,
})
@websocket_api.async_response
async def ws_apply(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        res = await _cu(hass).async_apply(msg["id"])
    except PackageError as err:
        connection.send_error(msg["id"], "rejected", str(err))
        return
    connection.send_result(msg["id"], res)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/card_updates/settings",
    vol.Optional("auto"): bool,
})
@websocket_api.async_response
async def ws_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    cu = _cu(hass)
    if "auto" in msg:
        auto = await cu.async_set_auto(msg["auto"])
    else:
        auto = bool((await cu._load()).get("auto"))
    connection.send_result(msg["id"], {"auto": auto})


@callback
def async_setup_card_updates(hass: HomeAssistant) -> None:
    """Beim Einrichten des Eintrags."""
    dom = hass.data.setdefault(DOMAIN, {})
    cu: CardUpdates | None = dom.get("card_updates")
    if cu is None:
        cu = dom["card_updates"] = CardUpdates(hass)
        for cmd in (ws_list, ws_apply, ws_settings):
            websocket_api.async_register_command(hass, cmd)
    if cu._unsub:
        cu._unsub()

    async def _tick(_now=None) -> None:
        try:
            await cu.async_check()
        except Exception:  # noqa: BLE001 – nie den Betrieb stören
            _LOGGER.exception("Casora: Prüfung auf Karten-Updates fehlgeschlagen")

    async def _start(_hass: HomeAssistant) -> None:
        try:
            await cu.async_prune()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Casora: Karten-Updates nicht aufgeräumt")
        await _tick()

    cu._unsub = async_track_time_interval(hass, _tick, CHECK_INTERVAL)
    async_at_started(hass, _start)


@callback
def async_unload_card_updates(hass: HomeAssistant) -> None:
    cu: CardUpdates | None = hass.data.get(DOMAIN, {}).get("card_updates")
    if cu and cu._unsub:
        cu._unsub()
        cu._unsub = None
