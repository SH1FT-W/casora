"""Versionen der Casora-Dashboards (Studio → „Versionen“).

Bei jedem Speichern im Studio hält die Integration den Stand vorher und nachher
fest, Desktop und Handy-Layout zusammen. Ein Stand besteht aus der Konfiguration
ohne Vorlagen (klein) und einer Liste Vorlagenname → Prüfsumme; die Vorlagen
selbst (je ~2 MB, fast immer gleich) liegen nur einmal im Ordner blobs/.

  /config/casora_versionen/<dashboard>/index.json   Liste der Stände, neueste zuerst
  /config/casora_versionen/<dashboard>/<id>.json    ein Stand
  /config/casora_versionen/blobs/<hash>.json        eine Vorlage

Liegt unter /config, damit jedes HA-Backup die Versionen mitnimmt.

WebSocket (nur Admins):
  casora/versions/snap    ← {"url_path", "mobile_url"?, "kind"?, "summary"?} → {"id"|None, "added"}
  casora/versions/list    ← {"url_path"} → {"versions": [{id, ts, kind, summary, rooms, from, current}]}
  casora/versions/get     ← {"url_path", "version"} → {"config", "mobile"}
  casora/versions/restore ← {"url_path", "version"} → {"id"}
  casora/versions/label   ← {"url_path", "version", "name"?, "pinned"?} → {"ok"}

Benannte Stände tragen „name“, angeheftete „pinned“: Angeheftete zählen nicht zu den
KEEP Ständen und werden beim Aufräumen nie gelöscht (höchstens PIN_MAX je Dashboard).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .const import DOMAIN

FOLDER = "casora_versionen"
KEEP = 30
PIN_MAX = 20
NAME_MAX = 80
# Zusammenfassung (JSON aus dem Studio): abgeschnitten wäre sie unlesbar und fiele ganz weg.
SUMMARY_MAX = 4000
TPL = "button_card_templates"
# Speichern und Aufräumen laufen im Executor, teils gleichzeitig (Start + Studio): nacheinander,
# sonst löscht das Aufräumen eine Vorlage, die ein anderer Stand gerade wiederverwendet.
_LOCK = threading.Lock()


def _digest(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _slug(url_path: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", url_path.lower()).strip("-") or "dashboard"


def _dashboard(hass: HomeAssistant, url_path: str):
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    data = hass.data.get(LOVELACE_DATA)
    dash = data.dashboards.get(url_path) if data else None
    if dash is None:
        raise ValueError(f"dashboard {url_path} not found")
    return dash


async def _load(hass: HomeAssistant, url_path: str | None) -> dict | None:
    if not url_path:
        return None
    try:
        return await _dashboard(hass, url_path).async_load(False)
    except Exception:  # noqa: BLE001 – leeres oder fehlendes Dashboard hat keinen Stand
        return None


class _Store:
    """Dateizugriff; alle Methoden laufen im Executor."""

    def __init__(self, root: str, url_path: str) -> None:
        self.root = root
        self.dir = os.path.join(root, _slug(url_path))
        self.blobs = os.path.join(root, "blobs")
        self.index_path = os.path.join(self.dir, "index.json")

    def index(self) -> list[dict]:
        try:
            with open(self.index_path, encoding="utf-8") as fh:
                return json.load(fh).get("versions", [])
        except (OSError, ValueError):
            return []

    def _write_json(self, path: str, data: Any) -> None:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)

    def _split(self, cfg: dict | None) -> tuple[dict | None, dict]:
        """Konfiguration ohne Vorlagen + Name → Prüfsumme; Vorlagen landen in blobs/."""
        if cfg is None:
            return None, {}
        refs = {}
        for name, tpl in (cfg.get(TPL) or {}).items():
            h = _digest(tpl)
            path = os.path.join(self.blobs, h + ".json")
            if not os.path.exists(path):
                self._write_json(path, tpl)
            refs[name] = h
        return {k: v for k, v in cfg.items() if k != TPL}, refs

    def _join(self, cfg: dict | None, refs: dict) -> dict | None:
        if cfg is None:
            return None
        out = dict(cfg)
        if refs:
            tpls = {}
            for name, h in refs.items():
                with open(os.path.join(self.blobs, h + ".json"), encoding="utf-8") as fh:
                    tpls[name] = json.load(fh)
            out[TPL] = tpls
        return out

    def add(self, url_path: str, mobile_url: str | None, cfg: dict, mobile: dict | None,
            meta: dict) -> str | None:
        with _LOCK:
            return self._add(url_path, mobile_url, cfg, mobile, meta)

    def _add(self, url_path: str, mobile_url: str | None, cfg: dict, mobile: dict | None,
             meta: dict) -> str | None:
        os.makedirs(self.dir, exist_ok=True)
        os.makedirs(self.blobs, exist_ok=True)
        versions = self.index()
        h = _digest([cfg, mobile])
        if versions and versions[0].get("hash") == h:
            return None
        if meta.get("kind") == "initial" and versions:
            # Nicht der allererste Stand, aber neu: jemand hat außerhalb des Studios geändert.
            meta = {**meta, "kind": "outside"}
        now = dt_util.now()
        vid = now.strftime("%Y%m%d-%H%M%S-%f")
        c, crefs = self._split(cfg)
        m, mrefs = self._split(mobile)
        self._write_json(os.path.join(self.dir, vid + ".json"), {
            "url_path": url_path, "mobile_url": mobile_url,
            "config": c, "templates": crefs, "mobile": m, "mobile_templates": mrefs,
        })
        versions.insert(0, {"id": vid, "ts": now.isoformat(), "hash": h, "mobile_url": mobile_url,
                            "rooms": _rooms(cfg), **meta})
        versions, dropped = _trim(versions)
        for old in dropped:
            try:
                os.remove(os.path.join(self.dir, old["id"] + ".json"))
            except OSError:
                pass
        self._write_json(self.index_path, {"url_path": url_path, "versions": versions})
        if dropped or len(versions) >= KEEP:
            self._gc()
        return vid

    def label(self, vid: str, name: str | None, pinned: bool | None) -> None:
        """Namen setzen (leer = entfernen) und/oder anheften bzw. lösen."""
        with _LOCK:
            data = {}
            try:
                with open(self.index_path, encoding="utf-8") as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                pass
            versions = data.get("versions", [])
            entry = next((v for v in versions if v.get("id") == vid), None)
            if entry is None:
                raise ValueError("not found")
            if name is not None:
                name = name.strip()[:NAME_MAX]
                if name:
                    entry["name"] = name
                else:
                    entry.pop("name", None)
            if pinned is not None:
                if pinned and not entry.get("pinned") and sum(1 for v in versions if v.get("pinned")) >= PIN_MAX:
                    raise OverflowError("too many pinned")
                if pinned:
                    entry["pinned"] = True
                else:
                    entry.pop("pinned", None)
            data["versions"] = versions
            self._write_json(self.index_path, data)

    def get(self, vid: str) -> dict:
        if not re.fullmatch(r"[0-9-]+", vid):
            raise ValueError("bad id")
        with open(os.path.join(self.dir, vid + ".json"), encoding="utf-8") as fh:
            v = json.load(fh)
        return {
            "config": self._join(v.get("config"), v.get("templates") or {}),
            "mobile": self._join(v.get("mobile"), v.get("mobile_templates") or {}),
            "mobile_url": v.get("mobile_url"),
        }

    def _gc(self) -> None:
        """Vorlagen löschen, auf die kein Stand irgendeines Dashboards mehr zeigt."""
        used: set[str] = set()
        for entry in os.scandir(self.root):
            if not entry.is_dir() or entry.name == "blobs":
                continue
            for f in os.scandir(entry.path):
                if not f.name.endswith(".json") or f.name == "index.json":
                    continue
                try:
                    with open(f.path, encoding="utf-8") as fh:
                        v = json.load(fh)
                except (OSError, ValueError):
                    continue
                used.update((v.get("templates") or {}).values())
                used.update((v.get("mobile_templates") or {}).values())
        for f in os.scandir(self.blobs):
            if f.name.endswith(".json") and f.name[:-5] not in used:
                try:
                    os.remove(f.path)
                except OSError:
                    pass


def _trim(versions: list[dict]) -> tuple[list[dict], list[dict]]:
    """Die neuesten KEEP nicht angehefteten Stände behalten, angeheftete immer."""
    keep, dropped, loose = [], [], 0
    for v in versions:
        if v.get("pinned"):
            keep.append(v)
        elif loose < KEEP:
            keep.append(v)
            loose += 1
        else:
            dropped.append(v)
    return keep, dropped


def _rooms(cfg: dict | None) -> list[str]:
    out = []
    for v in (cfg or {}).get("views") or []:
        name = v.get("title") or v.get("path")
        if name:
            out.append(str(name))
    return out


async def _snap(hass: HomeAssistant, url_path: str, mobile_url: str | None, meta: dict) -> str | None:
    cfg = await _load(hass, url_path)
    if cfg is None:
        return None
    mobile = await _load(hass, mobile_url)
    store = _Store(hass.config.path(FOLDER), url_path)
    return await hass.async_add_executor_job(store.add, url_path, mobile_url, cfg, mobile, meta)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/versions/snap",
    vol.Required("url_path"): str,
    vol.Optional("mobile_url"): vol.Any(str, None),
    vol.Optional("kind", default="save"): vol.In(["save", "initial"]),
    vol.Optional("summary", default=""): str,
})
@websocket_api.async_response
async def ws_snap(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    vid = await _snap(hass, msg["url_path"], msg.get("mobile_url"),
                      {"kind": msg["kind"], "summary": msg["summary"][:SUMMARY_MAX]})
    connection.send_result(msg["id"], {"id": vid, "added": vid is not None})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/versions/list",
    vol.Required("url_path"): str,
})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _Store(hass.config.path(FOLDER), msg["url_path"])
    versions = await hass.async_add_executor_job(store.index)
    out = [{k: v.get(k) for k in ("id", "ts", "kind", "summary", "rooms", "from", "name", "pinned")} for v in versions]
    # Ist der neueste Stand genau das, was gerade gespeichert ist?
    if versions:
        cfg = await _load(hass, msg["url_path"])
        mobile = await _load(hass, versions[0].get("mobile_url"))
        out[0]["current"] = cfg is not None and _digest([cfg, mobile]) == versions[0].get("hash")
    connection.send_result(msg["id"], {"versions": out})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/versions/get",
    vol.Required("url_path"): str,
    vol.Required("version"): str,
})
@websocket_api.async_response
async def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _Store(hass.config.path(FOLDER), msg["url_path"])
    try:
        v = await hass.async_add_executor_job(store.get, msg["version"])
    except (OSError, ValueError) as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"config": v["config"], "mobile": v["mobile"]})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/versions/restore",
    vol.Required("url_path"): str,
    vol.Required("version"): str,
})
@websocket_api.async_response
async def ws_restore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    url_path = msg["url_path"]
    store = _Store(hass.config.path(FOLDER), url_path)
    try:
        v = await hass.async_add_executor_job(store.get, msg["version"])
        entry = next((x for x in await hass.async_add_executor_job(store.index)
                      if x["id"] == msg["version"]), {})
        mobile_url = v.get("mobile_url")
        # Den Stand, der gleich überschrieben wird, zuerst festhalten – so lässt sich
        # auch das Zurückholen wieder rückgängig machen.
        await _snap(hass, url_path, mobile_url, {"kind": "save", "summary": ""})
        await _dashboard(hass, url_path).async_save(v["config"])
        if mobile_url and v.get("mobile") is not None:
            await _dashboard(hass, mobile_url).async_save(v["mobile"])
        vid = await _snap(hass, url_path, mobile_url, {"kind": "restore", "from": entry.get("ts")})
    except Exception as err:  # noqa: BLE001 – dem Studio als Meldung zeigen
        connection.send_error(msg["id"], "restore_failed", str(err))
        return
    connection.send_result(msg["id"], {"id": vid})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/versions/label",
    vol.Required("url_path"): str,
    vol.Required("version"): str,
    vol.Optional("name"): vol.Any(str, None),
    vol.Optional("pinned"): bool,
})
@websocket_api.async_response
async def ws_label(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    store = _Store(hass.config.path(FOLDER), msg["url_path"])
    name = msg.get("name")
    try:
        await hass.async_add_executor_job(store.label, msg["version"],
                                          "" if "name" in msg and name is None else name, msg.get("pinned"))
    except OverflowError:
        connection.send_error(msg["id"], "too_many", f"at most {PIN_MAX} pinned versions")
        return
    except (OSError, ValueError) as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@callback
def async_setup_versions(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("versions_ws"):
        return
    for cmd in (ws_snap, ws_list, ws_get, ws_restore, ws_label):
        websocket_api.async_register_command(hass, cmd)
    hass.data.setdefault(DOMAIN, {})["versions_ws"] = True
