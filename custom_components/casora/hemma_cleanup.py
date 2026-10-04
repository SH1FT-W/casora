"""Hemma entfernen und eigene Dateien übernehmen (Studio → Einstellungen → Hemma, Umzug).

Casora ist aus Hemma entstanden. Wer umgezogen ist, hat oft noch die alte Integration
(Domain „hemma“, meist per HACS aus willsanderson/Hemma), ihre Skript-Ressourcen
(/hemma_scripts/…, /local/hemma/scripts/…), die alten Dashboards und seine eigenen
Fotos und Symbole unter www/hemma. Beides läuft nebeneinander, bis man Hemma entfernt.

  casora/hemma/status              → was von Hemma da ist (Integration, HACS, Ressourcen,
                                     Dashboards, www/hemma und ob es noch gebraucht wird,
                                     Hemmas Helfer-Paket, Theme, Eigenes mit „hemma“ im Namen)
  casora/hemma/remove              ← {remove_dashboards?: [url_path], keep_files?: bool}
                                     → {ok, steps: [...], backup, restart_required}
  casora/hemma/move_files          ← {dashboards?: [url_path]}
                                     → Kopie www/hemma → www/casora, Verweise in den
                                       genannten (Casora-)Dashboards umgeschrieben
  casora/hemma/verify              → {due: false} oder einmal nach dem Neustart, der auf
                                     „Hemma entfernen“ folgt: {due: true, ok, leftovers: [...],
                                     backup, remove_dashboards, keep_files}

Merker in .storage/casora.hemma_removal: Entfernen schreibt removed_at, die Sicherung, die
gewählten Dashboards und eine Kennung dieses HA-Laufs (boot). Erst wenn HA danach neu
gestartet ist (andere Kennung), prüft verify einmal, ob Hemma wirklich weg ist, und setzt
verified – auf jedem Gerät erscheint das Ergebnis so nur einmal.

Alles nur für Admins. Entfernen sichert vorher nach /config/casora_sicherungen/
hemma_entfernt_<Zeit>.zip; jeder Schritt meldet sein Ergebnis einzeln, ein Fehler wird
nie verschluckt. www/hemma bleibt, solange ein Dashboard noch darauf zeigt oder eine
Datei dort nicht in www/casora liegt (Casora liest es sonst weiter als Rückfalllösung).

Was weggeräumt wird, richtet sich nach der Herkunft, nicht nach dem Namen: Hemmas
Helfer-Paket (hemma_package.py, feste Liste aus allen Hemma-Versionen), sein Theme
(themes/hemma, nur Themes namens „Hemma…“) und seine Schrift-Ressource. Eigene
Automationen, Pakete oder Sensoren mit „hemma“ im Namen bleiben und werden im Dialog
nur genannt. Werte der Hemma-Helfer gehen vorher auf die Casora-Helfer über, solange
dort noch der Ausgangswert steht.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import logging
import os
import re
import shutil
import uuid
import zipfile
from types import SimpleNamespace
from typing import Any
from urllib.parse import unquote

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.yaml import load_yaml

from . import hemma_package as pkg
from .const import ASSETS_DIR, ASSETS_URL_BASE, DOMAIN
from .helfer import _collection
from .settings import async_load_settings

_LOGGER = logging.getLogger(__name__)

HEMMA_DOMAIN = "hemma"
HEMMA_DIR = f"custom_components/{HEMMA_DOMAIN}"
# HACS-Pakete, die Hemma sind (Kleinschreibung).
HACS_NAMES = ("willsanderson/hemma",)
# Hemmas Skripte und seine Schrift (Casora bringt eigene Schriften mit).
HEMMA_RESOURCE_PREFIXES = ("/hemma_scripts/", "/local/hemma/scripts/", "/local/hemma/fonts/")
THEMES_HEMMA = "themes/hemma"
CASORA_DEFAULT_THEME = "Casora Weich"
# Hemma-Helfer, deren Wert Casora übernimmt (wie carryHelpers im Umzug, casora-panel-umzug.js).
CARRY = ("input_boolean.dashboard_redirect", "input_boolean.motion_badges", "input_boolean.now_playing_minimized",
         "input_text.now_playing_pinned", "input_select.thermostat_mode", "input_number.thermostat_target_temperature",
         "input_datetime.notifications_read")
WWW_HEMMA = "www/hemma"
WWW_CASORA = "www/casora"
LOCAL_HEMMA = "/local/hemma/"
LOCAL_CASORA = "/local/casora/"
# Hemmas eigene Skripte – Casora liefert seine selbst aus, die werden nicht übernommen.
SKIP_DIRS = ("scripts",)
BACKUP_DIR = "casora_sicherungen"
REF = re.compile(r"/local/hemma/([^\"'?#()\s\\]*)")
# Kennung dieses HA-Laufs: das Modul wird nur beim Start geladen, nicht beim Neuladen
# der Integration – eine andere Kennung heißt „seit dem Entfernen neu gestartet“.
BOOT = uuid.uuid4().hex
STORE_KEY = f"{DOMAIN}.hemma_removal"


# Hemmas eigene Skripte aus allen Versionen (www/hemma/scripts, später custom_components/hemma/
# scripts). Alles andere unter Hemmas Skript-Adressen hat der Nutzer selbst dazugelegt.
HEMMA_SCRIPT_NAMES = frozenset({
    "hemma-core.js", "hemma-i18n.js", "hemma-icons.js", "hemma-redirect.js", "hemma-swipe-card.js",
    "hemma-smart-row.js", "hemma-local.js", "hemma-kompat.js", "hemma-notify-local.js", "casora-local.js",
    "layout-card-modified.js", "layout-offsets.js", "smart-row.js", "swipe-card-patch.js", "filter-overlay.js",
    "navbar-popup-caret.js", "navbar-scroll.js", "navbar-sidebar-offset.js",
})
HEMMA_SCRIPT_BASES = ("/hemma_scripts/", "/local/hemma/scripts/")
# Eigene Erweiterungen neben Hemma (z. B. www/hemma-local/…): gehören immer dem Nutzer.
OWN_MODULE_PREFIXES = ("/local/hemma-local/", "/local/hemma_local/", "/hemma_local/", "/hemma-local/")
OWN_MODULE_DIR = "www/hemma-local"
_OWN_LOCAL = re.compile(r"^/local/hemma[^/]*/.+\.m?js$", re.IGNORECASE)


# ── Erkennen ──────────────────────────────────────────────────────────────────
def _url_path(url: str) -> str:
    return str(url or "").partition("?")[0].partition("#")[0]


def is_own_module(url: str) -> bool:
    """Eigenes Modul des Nutzers (als Ressource geladen), auch wenn es unter einer Hemma-Adresse liegt:
    /local/hemma-local/…, /hemma_local/…, ein Skript in Hemmas Skript-Ordner, das Hemma nie
    mitgebracht hat, oder sonst ein JavaScript unter /local/hemma…/ außer Hemmas Skripten und Schrift."""
    p = _url_path(url)
    if p.startswith(OWN_MODULE_PREFIXES):
        return True
    for base in HEMMA_SCRIPT_BASES:
        if p.startswith(base):
            rest = p[len(base):]
            # Unterordner (local/01-basis.js …) lädt Hemmas eigener Lader – nie eine Ressource des Nutzers.
            return bool(rest) and "/" not in rest and rest not in HEMMA_SCRIPT_NAMES
    if p.startswith("/local/hemma/fonts/"):
        return False
    return bool(_OWN_LOCAL.match(p))


def is_hemma_resource(url: str) -> bool:
    return str(url or "").startswith(HEMMA_RESOURCE_PREFIXES) and not is_own_module(url)


def own_module_home(config_dir: str, url: str) -> str | None:
    """Neue Adresse für ein eigenes Modul, das nur Hemmas Integration ausliefert (/hemma_scripts/…).

    Ohne Hemma gibt es die Adresse nicht mehr. Liegt die Datei in www/hemma/scripts, lädt sie
    /local/hemma/scripts/…; liegt sie in Hemmas Integrationsordner (geht mit Hemma weg), wird sie
    nach www/hemma-local kopiert (überschreibt nie). None: Adresse bleibt (oder Datei nicht da)."""
    p = _url_path(url)
    if not p.startswith("/hemma_scripts/") or not is_own_module(url):
        return None
    name = p[len("/hemma_scripts/"):]
    query = str(url)[len(p):]
    if os.path.isfile(os.path.join(config_dir, WWW_HEMMA, "scripts", name)):
        return "/local/hemma/scripts/" + name + query
    src = os.path.join(config_dir, HEMMA_DIR, "scripts", name)
    if not os.path.isfile(src):
        return None
    dst = os.path.join(config_dir, OWN_MODULE_DIR, name)
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        elif _hash(dst) != _hash(src):
            return None  # gleichnamige andere Datei: nichts überschreiben, Adresse bleibt
    except OSError:
        return None
    return "/local/hemma-local/" + name + query


async def async_keep_own_modules(hass: HomeAssistant, res, items: list[dict]) -> list[dict]:
    """Eigene Module unter /hemma_scripts/ auf eine Adresse umstellen, die ohne Hemma weiter lädt.
    Liefert [{url, to}] für jede umgestellte Ressource."""
    moved: list[dict] = []
    if res is None or not hasattr(res, "async_update_item"):
        return moved
    for i in items:
        url = str(i.get("url", ""))
        to = await hass.async_add_executor_job(own_module_home, hass.config.config_dir, url)
        if not to or to == url:
            continue
        try:
            await res.async_update_item(i["id"], {"url": to})
            moved.append({"url": url, "to": to})
        except Exception:  # noqa: BLE001 – dann bleibt sie, wie sie ist
            _LOGGER.exception("Casora: eigenes Modul %s nicht umgestellt", url)
    return moved


def _hemma_dir(config_dir: str) -> str:
    return os.path.join(config_dir, HEMMA_DIR)


def hemma_entries(hass: HomeAssistant) -> list:
    try:
        return list(hass.config_entries.async_entries(HEMMA_DOMAIN))
    except Exception:  # noqa: BLE001 - nur Erkennung
        return []


async def async_hemma_present(hass: HomeAssistant) -> bool:
    """Hemma installiert (Ordner) oder eingerichtet (Config-Eintrag)?"""
    if hemma_entries(hass):
        return True
    return await hass.async_add_executor_job(os.path.isdir, _hemma_dir(hass.config.config_dir))


def _hacs_from_storage(config_dir: str) -> dict | None:
    path = os.path.join(config_dir, ".storage", "hacs.repositories")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh).get("data", {})
    except (OSError, ValueError, AttributeError):
        return None
    for rid, repo in (data or {}).items():
        if not isinstance(repo, dict):
            continue
        name = str(repo.get("full_name", "")).lower()
        if (name in HACS_NAMES or repo.get("domain") == HEMMA_DOMAIN) and repo.get("installed"):
            return {"id": str(repo.get("id") or rid), "full_name": repo.get("full_name"), "source": "storage"}
    return None


def hacs_repo(hass: HomeAssistant, config_dir: str) -> dict | None:
    """Hemma als HACS-Paket: {id, full_name, source} oder None."""
    hacs = hass.data.get("hacs")
    repos = getattr(getattr(hacs, "repositories", None), "list_all", None)
    if repos is not None:
        try:
            for repo in list(repos):
                d = getattr(repo, "data", None)
                name = str(getattr(d, "full_name", "")).lower()
                if (name in HACS_NAMES or getattr(d, "domain", None) == HEMMA_DOMAIN) and getattr(d, "installed", False):
                    return {"id": str(getattr(d, "id", "")), "full_name": getattr(d, "full_name", None), "source": "hacs"}
            return None
        except Exception:  # noqa: BLE001 - dann die gespeicherte Liste
            pass
    return _hacs_from_storage(config_dir)


def _resources(hass: HomeAssistant):
    """Lovelace-Ressourcen: (Sammlung, beschreibbar) oder (None, False)."""
    try:
        data = hass.data.get("lovelace")
        res = getattr(data, "resources", None)
        if res is None and isinstance(data, dict):
            res = data.get("resources")
        if res is None or not hasattr(res, "async_items"):
            return None, False
        return res, hasattr(res, "async_delete_item")
    except Exception:  # noqa: BLE001
        return None, False


async def _resource_items(hass: HomeAssistant) -> tuple[list[dict], bool]:
    res, writable = _resources(hass)
    if res is None:
        return [], False
    try:
        if writable and not getattr(res, "loaded", False):
            await res.async_load()
            res.loaded = True
        return [dict(i) for i in res.async_items()], writable
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Casora: Ressourcenliste nicht lesbar")
        return [], writable


def _dashboards(hass: HomeAssistant) -> dict:
    """Dashboards nach Adresse; das Standard-Dashboard (None) heißt hier „lovelace“."""
    data = hass.data.get("lovelace")
    return {(k or "lovelace"): v for k, v in (getattr(data, "dashboards", None) or {}).items()}


async def _load(dash) -> Any:
    try:
        return await dash.async_load(False)
    except Exception:  # noqa: BLE001 - leeres oder ungültiges Dashboard
        return None


def is_hemma_config(cfg: Any) -> bool:
    if not isinstance(cfg, dict):
        return False
    text = json.dumps(cfg.get("views", []), ensure_ascii=False)
    return '"hemma_room"' in text or "hemma_template_fingerprint" in cfg


def count_refs(cfg: Any) -> int:
    return len(REF.findall(json.dumps(cfg, ensure_ascii=False))) if cfg else 0


def _moved(settings: dict | None) -> dict[str, str]:
    """Umzug: Hemma-Dashboard → Casora-Dashboard (Einstellungen umzug.done)."""
    out = {}
    for x in ((settings or {}).get("umzug") or {}).get("done") or []:
        if isinstance(x, dict) and x.get("src"):
            out[x["src"]] = x.get("target") or ""
        elif isinstance(x, str):
            out[x] = ""
    return out


async def _scan_dashboards(hass: HomeAssistant, settings: dict | None) -> tuple[list[dict], dict[str, int], dict]:
    """(Hemma-Dashboards, /local/hemma-Verweise je Dashboard, geladene Konfigurationen)."""
    moved = _moved(settings)
    boards = _dashboards(hass)
    configs: dict = {}
    refs: dict[str, int] = {}
    hemma: list[dict] = []
    for key, dash in boards.items():
        cfg = await _load(dash)
        configs[key] = cfg
        n = count_refs(cfg)
        if n:
            refs[key] = n
    for key, dash in boards.items():
        if key.endswith("-mobile") and key[: -len("-mobile")] in configs:
            continue  # gehört zum Desktop-Dashboard
        if not is_hemma_config(configs.get(key)):
            continue
        item = getattr(dash, "config", None) or {}
        mobile = key + "-mobile" if (key + "-mobile") in configs else None
        target = moved.get(key)
        if target and target not in configs:
            target = None  # Casora-Dashboard gelöscht: gilt nicht mehr als umgezogen
            moved.pop(key, None)
        hemma.append({
            "url_path": key,
            "id": item.get("id"),
            "title": item.get("title") or key,
            "mode": getattr(dash, "mode", None) or "storage",
            "mobile": mobile,
            "moved_to": (target or True) if key in moved else None,
        })
    return hemma, refs, configs


# ── Dateien (www/hemma → www/casora) ─────────────────────────────────────────
def _hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def user_files(config_dir: str) -> list[str]:
    """Eigene Dateien unter www/hemma (relativ, ohne scripts/ und versteckte Dateien)."""
    base = os.path.join(config_dir, WWW_HEMMA)
    out: list[str] = []
    if not os.path.isdir(base):
        return out
    for root, dirs, files in os.walk(base):
        rel_root = os.path.relpath(root, base)
        if rel_root == ".":
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        else:
            dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.startswith("."):
                continue
            rel = os.path.normpath(os.path.join(rel_root, f)).replace(os.sep, "/")
            out.append(rel)
    return sorted(out)


# Pfade unter www/hemma, die Automationen, Skripte oder Pakete selbst benutzen (Schreibziel von
# camera.snapshot, downloader, shell_command …): /config/www/hemma/snapshots/{{ cam }}.jpg.
WRITE_REF = re.compile(r"(?:/config/)?www/hemma/([^\s\"'`,;()\[\]]*)")
WRITE_FILES = ("configuration.yaml", "automations.yaml", "scripts.yaml", "scenes.yaml")
WRITE_DIRS = ("packages",)
_TEMPLATE_START = re.compile(r"[{%$<*]")


def _write_prefix(rel: str) -> str:
    """Pfad aus einer Konfigurationsdatei → geschützter Teil: Datei, Ordner („…/“) oder „“ (alles)."""
    cut = _TEMPLATE_START.search(rel)
    if cut:  # Vorlage im Pfad: der Ordner davor
        rel = rel[: cut.start()]
        return rel[: rel.rfind("/") + 1]
    rel = rel.rstrip(".")
    last = rel.rsplit("/", 1)[-1]
    if rel and not rel.endswith("/") and "." not in last:
        rel += "/"  # Ordner ohne Schrägstrich am Ende
    return rel


def write_targets(config_dir: str) -> dict[str, list[str]]:
    """Was Automationen/Skripte/Pakete unter www/hemma benutzen: {Teilpfad: [Datei, …]}.
    Nur lesen. Diese Pfade bleiben beim Umzug, wie sie sind (nichts kopieren, nichts umschreiben)."""
    files: list[str] = [f for f in WRITE_FILES if os.path.isfile(os.path.join(config_dir, f))]
    for d in WRITE_DIRS:
        base = os.path.join(config_dir, d)
        if not os.path.isdir(base):
            continue
        for root, dirs, names in os.walk(base):
            dirs[:] = [x for x in dirs if not x.startswith(".")]
            files += [os.path.relpath(os.path.join(root, n), config_dir).replace(os.sep, "/")
                      for n in names if n.endswith((".yaml", ".yml"))]
    out: dict[str, list[str]] = {}
    for rel in sorted(files):
        path = os.path.join(config_dir, rel)
        try:
            if os.path.getsize(path) > 5 * 1024 * 1024:
                continue
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        for m in WRITE_REF.finditer(text):
            out.setdefault(_write_prefix(m.group(1)), [])
            if rel not in out[_write_prefix(m.group(1))]:
                out[_write_prefix(m.group(1))].append(rel)
    return out


def is_write_target(rel: str, targets: dict[str, list[str]] | None) -> bool:
    for p in targets or {}:
        if p == "" or rel == p or (p.endswith("/") and rel.startswith(p)):
            return True
    return False


def plan_files(config_dir: str, shipped_dir: str, targets: dict[str, list[str]] | None = None) -> dict[str, str]:
    """Je Datei: copy (fehlt in www/casora), same (liegt dort gleich), shipped (gleich
    der mitgelieferten Casora-Datei), conflict (dort mit anderem Inhalt), write (eine
    Automation benutzt den Pfad – bleibt in www/hemma, wird nicht kopiert)."""
    src_base = os.path.join(config_dir, WWW_HEMMA)
    dst_base = os.path.join(config_dir, WWW_CASORA)
    if targets is None:
        targets = write_targets(config_dir)
    plan: dict[str, str] = {}
    for rel in user_files(config_dir):
        if is_write_target(rel, targets):
            plan[rel] = "write"
            continue
        src = os.path.join(src_base, rel)
        dst = os.path.join(dst_base, rel)
        ship = os.path.join(shipped_dir, rel)
        h = None
        if os.path.isfile(ship):
            h = _hash(src)
            if h == _hash(ship):
                plan[rel] = "shipped"
                continue
        if os.path.isfile(dst):
            plan[rel] = "same" if (h or _hash(src)) == _hash(dst) else "conflict"
        else:
            plan[rel] = "copy"
    return plan


def mapping_for(plan: dict[str, str]) -> dict[str, str]:
    """/local/hemma/<rel> → neue Adresse, nur wo der Inhalt dort gleich ist."""
    out: dict[str, str] = {}
    for rel, what in plan.items():
        if what in ("copy", "same"):
            out[rel] = LOCAL_CASORA + rel
        elif what == "shipped":
            out[rel] = ASSETS_URL_BASE + "/" + rel
    # Ordner, deren Dateien alle nach www/casora gehen (z. B. '/local/hemma/rooms/' + name).
    dirs: dict[str, set] = {}
    for rel, what in plan.items():
        parts = rel.split("/")
        for i in range(1, len(parts)):
            dirs.setdefault("/".join(parts[:i]) + "/", set()).add(what)
    for d, kinds in dirs.items():
        if kinds <= {"copy", "same"}:
            out[d] = LOCAL_CASORA + d
        elif kinds == {"shipped"}:
            out[d] = ASSETS_URL_BASE + "/" + d
    return out


def copy_files(config_dir: str, shipped_dir: str) -> dict:
    """Kopiert (überschreibt nie) und liefert Zählung + Zuordnung."""
    targets = write_targets(config_dir)
    plan = plan_files(config_dir, shipped_dir, targets)
    src_base = os.path.join(config_dir, WWW_HEMMA)
    dst_base = os.path.join(config_dir, WWW_CASORA)
    copied, failed = [], []
    for rel, what in plan.items():
        if what != "copy":
            continue
        dst = os.path.join(dst_base, rel)
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst):  # inzwischen entstanden: nie überschreiben
                plan[rel] = "conflict" if _hash(dst) != _hash(os.path.join(src_base, rel)) else "same"
                continue
            shutil.copy2(os.path.join(src_base, rel), dst)
            copied.append(rel)
        except OSError as err:
            failed.append({"file": rel, "error": str(err)})
            plan[rel] = "failed"
    mapping = mapping_for(plan)
    rooms = sum(1 for rel, what in plan.items() if what in ("copy", "same") and rel.startswith("rooms/")
                and not os.path.splitext(rel)[0].endswith("-night"))
    return {
        "copied": copied,
        "existing": sorted(r for r, w in plan.items() if w == "same"),
        "shipped": sorted(r for r, w in plan.items() if w == "shipped"),
        "conflicts": sorted(r for r, w in plan.items() if w == "conflict"),
        "failed": failed,
        "rooms": rooms,
        "mapping": {LOCAL_HEMMA + k: v for k, v in mapping.items()},
        # Bleibt in www/hemma: eine Automation (Skript, Paket) benutzt den Pfad.
        "write_kept": [{"path": WWW_HEMMA + "/" + p, "sources": src} for p, src in sorted(targets.items())],
    }


def files_complete(config_dir: str, shipped_dir: str) -> bool:
    """Jede eigene Datei aus www/hemma liegt gleich in www/casora (oder ist Casoras eigene)."""
    return all(w in ("same", "shipped") for w in plan_files(config_dir, shipped_dir).values())


def rewrite_refs(cfg: Any, mapping: dict[str, str]) -> tuple[Any, int]:
    """/local/hemma/… → neue Adresse, wo die Zuordnung sie kennt (?v=… bleibt)."""
    if not cfg:
        return cfg, 0
    rel_map = {k[len(LOCAL_HEMMA):] if k.startswith(LOCAL_HEMMA) else k: v for k, v in mapping.items()}
    n = 0

    def sub(m: re.Match) -> str:
        nonlocal n
        rel = m.group(1)
        new = rel_map.get(rel) or rel_map.get(unquote(rel))
        if not new:
            return m.group(0)
        n += 1
        return new

    text = REF.sub(sub, json.dumps(cfg, ensure_ascii=False))
    return (json.loads(text) if n else cfg), n


# ── Hilfen ────────────────────────────────────────────────────────────────────
class _Conn:
    """Stellvertreter-Verbindung, um einen fremden WebSocket-Befehl direkt aufzurufen."""

    def __init__(self) -> None:
        self.user = SimpleNamespace(is_admin=True, id="casora")
        self.result: Any = None
        self.error: str | None = None
        self.context = lambda msg: None

    def send_result(self, mid, result=None) -> None:
        self.result = result

    def send_error(self, mid, code, message=None, *a, **k) -> None:
        self.error = f"{code}: {message}" if message else str(code)

    def send_message(self, msg) -> None:
        if isinstance(msg, (bytes, str)):
            try:
                msg = json.loads(msg)
            except ValueError:
                return
        if isinstance(msg, dict) and msg.get("success") is False:
            err = msg.get("error") or {}
            self.error = f"{err.get('code')}: {err.get('message')}"
        elif isinstance(msg, dict):
            self.result = msg.get("result")

    def async_handle_exception(self, msg, err) -> None:
        self.error = str(err) or type(err).__name__


async def call_ws(hass: HomeAssistant, command: str, payload: dict) -> Any:
    """Einen registrierten WebSocket-Befehl (HACS, Lovelace) direkt ausführen.

    Ohne die Dekoratoren (require_admin, async_response) – die eigenen Befehle hier sind
    schon nur für Admins – damit das Ergebnis abgewartet werden kann.
    """
    handlers = hass.data.get("websocket_api") or {}
    if command not in handlers:
        raise LookupError(f"{command} not available")
    handler = handlers[command][0]
    raw = inspect.unwrap(handler)
    conn = _Conn()
    out = raw(hass, conn, {"id": 1, "type": command, **payload})
    if inspect.isawaitable(out):
        await out
    if conn.error:
        raise RuntimeError(conn.error)
    return conn.result


def _write_backup(path: str, config_dir: str, dashboards: dict, resources: list, entries: list, with_www: bool,
                  extra: list[str] | None = None, helpers: dict | None = None) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    n = 0
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for sub in [HEMMA_DIR] + ([WWW_HEMMA] if with_www else []):
            base = os.path.join(config_dir, sub)
            if not os.path.isdir(base):
                continue
            for root, dirs, files in os.walk(base):
                dirs[:] = [d for d in dirs if d != "__pycache__"]
                for f in files:
                    full = os.path.join(root, f)
                    zf.write(full, os.path.relpath(full, config_dir))
                    n += 1
        for url, cfg in dashboards.items():
            zf.writestr(f"dashboards/{url}.json", json.dumps(cfg, ensure_ascii=False, indent=1))
            n += 1
        for rel in extra or []:  # Paketdateien (Original) und Theme-Dateien
            full = os.path.join(config_dir, rel)
            if os.path.isfile(full):
                zf.write(full, rel)
                n += 1
        if helpers:
            zf.writestr("helpers.json", json.dumps(helpers, ensure_ascii=False, indent=1, default=str))
        zf.writestr("resources.json", json.dumps(resources, ensure_ascii=False, indent=1))
        zf.writestr("config_entries.json", json.dumps(entries, ensure_ascii=False, indent=1, default=str))
    return n


# ── Hemmas Paket, Theme und Eigenes mit „hemma“ im Namen ─────────────────────
def _theme_files(config_dir: str) -> list[str]:
    """Theme-Dateien unter themes/hemma, die nur Themes namens „Hemma…“ enthalten."""
    base = os.path.join(config_dir, THEMES_HEMMA)
    out = []
    if not os.path.isdir(base):
        return out
    for root, _dirs, files in os.walk(base):
        for f in files:
            if not f.endswith((".yaml", ".yml")):
                continue
            path = os.path.join(root, f)
            try:
                names = list((load_yaml(path) or {}).keys())
            except Exception:  # noqa: BLE001 – unlesbar: nicht anfassen
                continue
            if names and all(str(n).lower().startswith("hemma") for n in names):
                out.append(os.path.relpath(path, config_dir).replace(os.sep, "/"))
    return sorted(out)


def _storage_helpers(hass: HomeAssistant) -> list[tuple[str, str]]:
    """Hemma-Paket-Helfer, die als UI-Helfer (.storage) angelegt sind."""
    out = []
    for dom in pkg.HELPER_DOMAINS:
        coll = _collection(hass, dom)
        for key in (getattr(coll, "data", None) or {}):
            if key in pkg.PKG_KEYS[dom]:
                out.append((dom, key))
    return out


def _registry_targets(hass: HomeAssistant, items: list[dict]) -> list[str]:
    """Registry-Einträge der YAML-Teile aus Hemmas Paket (Herkunft über unique_id)."""
    reg = er.async_get(hass)
    wanted = {(p, k) for p, k in pkg.entity_ids(items)}
    return sorted(e.entity_id for e in list(reg.entities.values()) if (e.platform, str(e.unique_id)) in wanted)


def _own_named(hass: HomeAssistant, removed: set[str], package_files: list[str], deleted_files: set[str]) -> dict:
    """Was „hemma“ im Namen trägt, aber nicht von Hemma stammt – bleibt, wird nur genannt."""
    reg = er.async_get(hass)
    ents = sorted(e.entity_id for e in list(reg.entities.values())
                  if "hemma" in e.entity_id and e.entity_id not in removed and e.platform != HEMMA_DOMAIN)
    files = [f for f in package_files if "hemma" in f.lower() and f not in deleted_files]
    return {"entities": ents, "files": files}


async def _extras(hass: HomeAssistant) -> dict:
    config_dir = hass.config.config_dir

    def _fs() -> dict:
        return {"package": pkg.scan(config_dir), "themes": _theme_files(config_dir),
                "package_files": pkg.package_files(config_dir)}

    fs = await hass.async_add_executor_job(_fs)
    items = [it for p in fs["package"] if not p["error"] for it in p["items"]]
    yaml_ents = _registry_targets(hass, items)
    storage = _storage_helpers(hass)
    removed = set(yaml_ents) | {f"{d}.{k}" for d, k in storage}
    gone_files = {p["file"] for p in fs["package"] if p["delete"]}
    return {
        "package": fs["package"],
        "package_entities": yaml_ents,
        "storage_helpers": [f"{d}.{k}" for d, k in storage],
        "themes": fs["themes"],
        "own": _own_named(hass, removed, fs["package_files"], gone_files),
    }


def _untouched(hass: HomeAssistant, entity_id: str, spec: dict) -> bool:
    """Steht der Casora-Helfer noch auf seinem Ausgangswert (also nie selbst gesetzt)?"""
    st = hass.states.get(entity_id)
    if st is None:
        return False
    dom, key = entity_id.split(".", 1)
    conf = (spec.get(dom) or {}).get(key) or {}
    if "initial" in conf:
        init = conf["initial"]
        init = ("on" if init else "off") if isinstance(init, bool) else str(init)
        return st.state == init
    if dom == "input_number":
        try:
            return float(st.state) == float(st.attributes.get("min"))
        except (TypeError, ValueError):
            return False
    return False


async def _carry_values(hass: HomeAssistant) -> list[str]:
    """Werte der Hemma-Helfer auf die Casora-Helfer übertragen, bevor die Hemma-Helfer gehen.
    Nur, wo Casora noch den Ausgangswert hat (der Umzug hat es dann noch nicht getan) –
    Glocke „gelesen“: der spätere Zeitpunkt gewinnt."""
    done = []
    try:
        spec = await hass.async_add_executor_job(load_yaml, os.path.join(os.path.dirname(__file__), "helfer.yaml")) or {}
    except Exception:  # noqa: BLE001
        spec = {}
    for k in CARRY:
        dom, name = k.split(".", 1)
        src, dst = hass.states.get(f"{dom}.hemma_{name}"), hass.states.get(f"{dom}.casora_{name}")
        if not src or not dst or src.state in ("unknown", "unavailable", "") or src.state == dst.state:
            continue
        v, eid = src.state, dst.entity_id
        try:
            if dom == "input_datetime":
                if dst.state not in ("unknown", "unavailable", "") and dst.state >= v:
                    continue
                await hass.services.async_call(dom, "set_datetime", {"entity_id": eid, "datetime": v}, blocking=True)
            elif not _untouched(hass, eid, spec):
                continue
            elif dom == "input_boolean":
                await hass.services.async_call(dom, "turn_on" if v == "on" else "turn_off", {"entity_id": eid}, blocking=True)
            elif dom == "input_select":
                if v not in (dst.attributes.get("options") or []):
                    continue
                await hass.services.async_call(dom, "select_option", {"entity_id": eid, "option": v}, blocking=True)
            elif dom == "input_number":
                await hass.services.async_call(dom, "set_value", {"entity_id": eid, "value": float(v)}, blocking=True)
            elif dom == "input_text":
                await hass.services.async_call(dom, "set_value", {"entity_id": eid, "value": v}, blocking=True)
            done.append(eid)
        except Exception:  # noqa: BLE001 – ein Helfer, der nicht passt, hält nichts auf
            _LOGGER.debug("Casora: Wert von %s nicht übernommen", k, exc_info=True)
    return done


# ── Status ────────────────────────────────────────────────────────────────────
async def async_status(hass: HomeAssistant) -> dict:
    config_dir = hass.config.config_dir
    shipped = hass.config.path(ASSETS_DIR)
    settings = await async_load_settings(hass)
    entries = hemma_entries(hass)
    items, writable = await _resource_items(hass)
    hemma_res = [i for i in items if is_hemma_resource(i.get("url"))]
    own_res = [str(i.get("url")) for i in items if is_own_module(i.get("url"))]
    other_local = [str(i.get("url")) for i in items
                   if str(i.get("url", "")).startswith(LOCAL_HEMMA) and not is_hemma_resource(i.get("url"))]
    boards, refs, _ = await _scan_dashboards(hass, settings)

    def _fs() -> dict:
        targets = write_targets(config_dir)
        plan = plan_files(config_dir, shipped, targets)
        return {
            "installed": os.path.isdir(_hemma_dir(config_dir)),
            "hacs": hacs_repo(hass, config_dir),
            "www_hemma": os.path.isdir(os.path.join(config_dir, WWW_HEMMA)),
            "complete": all(w in ("same", "shipped") for w in plan.values()),
            "plan": plan,
            "targets": targets,
        }

    fs = await hass.async_add_executor_job(_fs)
    plan = fs["plan"]
    extras = await _extras(hass)
    return {
        "installed": fs["installed"] or bool(entries),
        # Hemma ist weg, aber Teile davon noch da (Paket-Helfer, Theme, www/hemma, Ressourcen).
        "leftovers": bool(extras["package"] or extras["storage_helpers"] or extras["themes"] or fs["www_hemma"]
                          or hemma_res),
        "package": [{"file": p["file"], "delete": p["delete"], "error": p["error"],
                     "items": [f'{i["domain"]}.{i["key"]}' for i in p["items"]]} for p in extras["package"]],
        "storage_helpers": extras["storage_helpers"],
        "themes": extras["themes"],
        # Eigene Module (Ressourcen) bleiben registriert – im Dialog unter „Bleibt“.
        "own": {**extras["own"], "resources": own_res},
        "folder": fs["installed"],
        "entries": [{"entry_id": e.entry_id, "title": e.title, "state": str(getattr(e, "state", ""))} for e in entries],
        "hacs": bool(fs["hacs"]),
        "hacs_repo": fs["hacs"],
        "resources": [str(i.get("url")) for i in hemma_res],
        "resources_writable": writable,
        "dashboards": boards,
        "files": {
            "www_hemma": fs["www_hemma"],
            "complete": fs["complete"],
            "to_copy": sum(1 for w in plan.values() if w == "copy"),
            "conflicts": sorted(r for r, w in plan.items() if w == "conflict"),
            # Dashboards, die noch auf /local/hemma/ zeigen, und andere Ressourcen dort.
            "refs": refs,
            "resource_refs": other_local,
            # Pfade, die eine Automation benutzt: bleiben in www/hemma.
            "write_targets": [{"path": WWW_HEMMA + "/" + p, "sources": src} for p, src in sorted(fs["targets"].items())],
        },
    }


def www_deletable(complete: bool, refs: dict[str, int], removed: set[str], resource_refs: list) -> bool:
    """www/hemma darf weg: alles liegt in www/casora und nichts Bleibendes zeigt darauf."""
    return complete and not resource_refs and not any(n and url not in removed for url, n in refs.items())


# ── Entfernen ─────────────────────────────────────────────────────────────────
async def async_remove(hass: HomeAssistant, remove_dashboards: list[str] | None, keep_files: bool = True) -> dict:
    config_dir = hass.config.config_dir
    shipped = hass.config.path(ASSETS_DIR)
    settings = await async_load_settings(hass)
    steps: list[dict] = []
    boards, refs, configs = await _scan_dashboards(hass, settings)
    by_url = {b["url_path"]: b for b in boards}
    if remove_dashboards is None:
        remove_dashboards = [b["url_path"] for b in boards if b["moved_to"]]
    chosen = [by_url[u] for u in remove_dashboards if u in by_url]
    removed_urls = set()
    for b in chosen:
        removed_urls.add(b["url_path"])
        if b["mobile"]:
            removed_urls.add(b["mobile"])
    items, writable = await _resource_items(hass)
    hemma_res = [i for i in items if is_hemma_resource(i.get("url"))]
    other_local = [str(i.get("url")) for i in items
                   if str(i.get("url", "")).startswith(LOCAL_HEMMA) and not is_hemma_resource(i.get("url"))]
    complete = await hass.async_add_executor_job(files_complete, config_dir, shipped)
    unused = not other_local and not any(n and url not in removed_urls for url, n in refs.items())
    if not keep_files and unused and not complete:
        # Ohne Umzug (z. B. „Neu beginnen“) liegen eigene Fotos/Symbole noch nicht in www/casora:
        # erst kopieren (überschreibt nie), dann darf www/hemma weg. Abweichende gleichnamige
        # Dateien in www/casora halten www/hemma weiter fest.
        await hass.async_add_executor_job(copy_files, config_dir, shipped)
        complete = await hass.async_add_executor_job(files_complete, config_dir, shipped)
    delete_www = not keep_files and www_deletable(complete, refs, removed_urls, other_local)
    entries = hemma_entries(hass)
    hacs = await hass.async_add_executor_job(hacs_repo, hass, config_dir)
    extras = await _extras(hass)
    storage_cfg = {}
    for eid in extras["storage_helpers"]:
        dom, key = eid.split(".", 1)
        coll = _collection(hass, dom)
        storage_cfg[eid] = dict(((getattr(coll, "data", None) or {}).get(key)) or {})
    extra_files = [p["file"] for p in extras["package"] if not p["error"]] + extras["themes"]

    # a) Sicherung – ohne sie passiert nichts.
    stamp = dt_util.now().strftime("%Y-%m-%d_%H%M%S")
    backup = os.path.join(config_dir, BACKUP_DIR, f"hemma_entfernt_{stamp}.zip")
    n = 2
    while await hass.async_add_executor_job(os.path.exists, backup):  # zweimal in einer Sekunde
        backup = os.path.join(config_dir, BACKUP_DIR, f"hemma_entfernt_{stamp}_{n}.zip")
        n += 1
    dash_cfgs = {}
    for b in boards:
        for u in (b["url_path"], b["mobile"]):
            if u and configs.get(u) is not None:
                dash_cfgs[u] = configs[u]
    entry_dump = [{"entry_id": e.entry_id, "title": e.title, "data": dict(getattr(e, "data", {}) or {}),
                   "options": dict(getattr(e, "options", {}) or {})} for e in entries]
    try:
        n = await hass.async_add_executor_job(_write_backup, backup, config_dir, dash_cfgs, hemma_res, entry_dump, delete_www,
                                              extra_files, storage_cfg)
        steps.append({"step": "backup", "ok": True, "path": backup, "files": n})
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Casora: Hemma-Sicherung fehlgeschlagen")
        steps.append({"step": "backup", "ok": False, "error": str(err)})
        return {"ok": False, "steps": steps, "backup": None, "restart_required": False}

    # b) Ressourcen. Eigene Module des Nutzers bleiben registriert; die nur über Hemmas Adresse
    #    (/hemma_scripts/…) ladbaren bekommen vorher eine, die ohne Hemma weiter lädt.
    own_res = [i for i in items if is_own_module(i.get("url"))]
    own_moved = await async_keep_own_modules(hass, _resources(hass)[0], own_res) if writable else []
    if not hemma_res:
        steps.append({"step": "resources", "ok": True, "removed": [], "manual": []})
    elif not writable:
        steps.append({"step": "resources", "ok": False, "removed": [], "error": "yaml",
                      "manual": [str(i.get("url")) for i in hemma_res]})
    else:
        res, _ = _resources(hass)
        done, errs = [], []
        for i in hemma_res:
            try:
                await res.async_delete_item(i["id"])
                done.append(str(i.get("url")))
            except Exception as err:  # noqa: BLE001
                errs.append(f"{i.get('url')}: {err}")
        steps.append({"step": "resources", "ok": not errs, "removed": done, "error": "; ".join(errs) or None})

    # c) Config-Einträge
    done, errs = [], []
    for e in entries:
        try:
            await hass.config_entries.async_remove(e.entry_id)
            done.append(e.title or e.entry_id)
        except Exception as err:  # noqa: BLE001
            errs.append(f"{e.title or e.entry_id}: {err}")
    steps.append({"step": "entries", "ok": not errs, "removed": done, "error": "; ".join(errs) or None})

    # d) Integration: über HACS (sonst installiert HACS sie wieder) oder Ordner löschen.
    folder = _hemma_dir(config_dir)
    if hacs:
        try:
            try:
                await call_ws(hass, "hacs/repository/remove", {"repository": hacs["id"]})
            except LookupError:
                repo = hass.data["hacs"].repositories.get_by_id(hacs["id"])
                await repo.uninstall()
            steps.append({"step": "integration", "ok": True, "via": "hacs", "repository": hacs.get("full_name")})
        except Exception as err:  # noqa: BLE001
            steps.append({"step": "integration", "ok": False, "via": "hacs", "error": str(err) or type(err).__name__})
    elif await hass.async_add_executor_job(os.path.isdir, folder):
        try:
            await hass.async_add_executor_job(shutil.rmtree, folder)
            steps.append({"step": "integration", "ok": True, "via": "folder"})
        except Exception as err:  # noqa: BLE001
            steps.append({"step": "integration", "ok": False, "via": "folder", "error": str(err)})
    else:
        steps.append({"step": "integration", "ok": True, "via": "none"})

    # e) Dashboards (nur UI-Modus)
    done, errs, manual = [], [], []
    for b in chosen:
        if b["mode"] != "storage":
            manual.append(b["url_path"])
            continue
        for u in (b["url_path"], b["mobile"]):
            if not u:
                continue
            dash = _dashboards(hass).get(u)
            did = (getattr(dash, "config", None) or {}).get("id") if dash else None
            if not did:
                errs.append(f"{u}: not found")
                continue
            try:
                await call_ws(hass, "lovelace/dashboards/delete", {"dashboard_id": did})
                done.append(u)
            except Exception as err:  # noqa: BLE001
                errs.append(f"{u}: {err}")
    steps.append({"step": "dashboards", "ok": not errs and not manual, "removed": done,
                  "manual": manual, "error": "; ".join(errs) or None})

    # f) Hemmas Helfer-Paket: Werte übernehmen, dann YAML-Teile, ihre Registry-Einträge und
    #    UI-Helfer gleicher Herkunft entfernen. Eigenes (auch mit „hemma“ im Namen) bleibt.
    carried = await _carry_values(hass)
    removed_items, errs, manual = [], [], []
    try:
        applied = await hass.async_add_executor_job(pkg.apply, config_dir)
    except Exception as err:  # noqa: BLE001
        applied = []
        errs.append(str(err))
    for p in applied:
        if p["ok"]:
            removed_items += [f'{i["domain"]}.{i["key"]}' for i in p["items"]]
        else:
            manual.append(p["file"])
    reg = er.async_get(hass)
    ok_items = [i for p in applied if p["ok"] for i in p["items"]]
    for eid in _registry_targets(hass, ok_items):
        try:
            reg.async_remove(eid)
        except Exception as err:  # noqa: BLE001
            errs.append(f"{eid}: {err}")
    for eid in extras["storage_helpers"]:
        dom, key = eid.split(".", 1)
        try:
            await _collection(hass, dom).async_delete_item(key)
            removed_items.append(eid)
        except Exception as err:  # noqa: BLE001
            errs.append(f"{eid}: {err}")
    steps.append({"step": "helpers", "ok": not errs and not manual, "removed": sorted(set(removed_items)),
                  "files": [p["file"] for p in applied if p["ok"]],
                  "deleted_files": [p["file"] for p in applied if p["ok"] and p["delete"]],
                  "carried": carried, "manual": manual, "error": "; ".join(errs) or None})

    # g) Theme „Hemma“ (themes/hemma). War es Standard, übernimmt Casora Weich.
    if extras["themes"]:
        errs = []

        def _rm_themes() -> None:
            for rel in extras["themes"]:
                os.remove(os.path.join(config_dir, rel))
            base = os.path.join(config_dir, THEMES_HEMMA)
            for root, dirs, files in os.walk(base, topdown=False):
                if not os.listdir(root):
                    os.rmdir(root)

        try:
            await hass.async_add_executor_job(_rm_themes)
        except OSError as err:
            errs.append(str(err))
        for key, mode in (("frontend_default_theme", None), ("frontend_default_dark_theme", "dark")):
            cur = hass.data.get(key)
            if cur and str(cur).lower().startswith("hemma"):
                data = {"name": CASORA_DEFAULT_THEME, **({"mode": mode} if mode else {})}
                try:
                    await hass.services.async_call("frontend", "set_theme", data, blocking=True)
                except Exception as err:  # noqa: BLE001
                    errs.append(str(err))
        try:
            await hass.services.async_call("frontend", "reload_themes", {}, blocking=True)
        except Exception:  # noqa: BLE001 – spätestens der Neustart lädt neu
            pass
        steps.append({"step": "theme", "ok": not errs, "removed": extras["themes"], "error": "; ".join(errs) or None})

    # h) www/hemma – bleibt, außer ausdrücklich gewünscht und nichts braucht es mehr.
    www = os.path.join(config_dir, WWW_HEMMA)
    if keep_files:
        steps.append({"step": "files", "ok": True, "kept": True})
    elif not delete_www:
        steps.append({"step": "files", "ok": False, "kept": True, "error": "still_needed"})
    else:
        try:
            if await hass.async_add_executor_job(os.path.isdir, www):
                await hass.async_add_executor_job(shutil.rmtree, www)
            steps.append({"step": "files", "ok": True, "kept": False})
        except Exception as err:  # noqa: BLE001
            steps.append({"step": "files", "ok": False, "kept": True, "error": str(err)})

    steps.append({"step": "own", "ok": True, **extras["own"],
                  "resources": [str(i.get("url")) for i in own_res], "moved": own_moved})
    ok = all(s["ok"] for s in steps)
    _LOGGER.info("Casora: Hemma entfernt (ok=%s), Sicherung %s", ok, backup)
    # Merker für die Bestätigung nach dem Neustart (casora/hemma/verify).
    try:
        await _removal_store(hass).async_save({
            "removed_at": dt_util.now().isoformat(timespec="seconds"),
            "boot": BOOT,
            "backup": os.path.relpath(backup, config_dir).replace(os.sep, "/"),
            "remove_dashboards": [b["url_path"] for b in chosen],
            "keep_files": keep_files,
            "verified": False,
        })
    except Exception:  # noqa: BLE001 – ohne Merker eben keine Bestätigung
        _LOGGER.exception("Casora: Merker für Hemma-Bestätigung nicht gespeichert")
    return {"ok": ok, "steps": steps, "backup": backup, "restart_required": True}


# ── Nach dem Neustart: ist Hemma wirklich weg? ────────────────────────────────
def _removal_store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "hemma_removal_store" not in data:
        data["hemma_removal_store"] = Store(hass, 1, STORE_KEY)
    return data["hemma_removal_store"]


async def async_leftovers(hass: HomeAssistant, rec: dict | None = None) -> list[dict]:
    """Was von Hemma nach dem Entfernen noch da ist – je Art {kind, items}.

    Gezählt wird nur, was „Hemma entfernen“ selbst wegräumt (Status wie im Dialog):
    Dashboards nur die damals gewählten oder umgezogenen, www/hemma nur, wenn es
    mit gehen sollte und nichts es mehr braucht. Eigenes mit „hemma“ im Namen nie."""
    rec = rec or {}
    st = await async_status(hass)
    out: list[dict] = []
    if HEMMA_DOMAIN in (getattr(hass.config, "components", None) or ()):
        out.append({"kind": "loaded", "items": []})
    if st["entries"]:
        out.append({"kind": "entries", "items": [e["title"] or e["entry_id"] for e in st["entries"]]})
    if st["hacs"]:
        out.append({"kind": "hacs", "items": [(st["hacs_repo"] or {}).get("full_name") or "Hemma"]})
    elif st["folder"]:
        out.append({"kind": "folder", "items": []})  # der Titel nennt den Ordner schon
    if st["resources"]:
        out.append({"kind": "resources", "items": st["resources"]})
    wanted = set(rec.get("remove_dashboards") or [])
    boards = [b for b in st["dashboards"] if b["mode"] == "storage" and (b["url_path"] in wanted or b["moved_to"])]
    if boards:
        out.append({"kind": "dashboards", "items": [b["title"] for b in boards],
                    "url_paths": [b["url_path"] for b in boards]})
    helpers = sorted({i for p in st["package"] if not p["error"] for i in p["items"]} | set(st["storage_helpers"]))
    if helpers:
        out.append({"kind": "helpers", "items": helpers})
    manual = [p["file"] for p in st["package"] if p["error"]]
    if manual:
        out.append({"kind": "helpers_manual", "items": manual})
    if st["themes"]:
        out.append({"kind": "themes", "items": st["themes"]})
    f = st["files"]
    gone = {u for b in boards for u in (b["url_path"], b["mobile"]) if u}
    if (rec.get("keep_files") is False and f["www_hemma"]
            and www_deletable(f["complete"], f["refs"], gone, f["resource_refs"])):
        out.append({"kind": "files", "items": [WWW_HEMMA]})
    return out


async def async_verify(hass: HomeAssistant) -> dict:
    """Einmal nach dem Neustart, der auf „Hemma entfernen“ folgt: Ergebnis der Prüfung.
    Sonst {due: False} – nie entfernt, schon bestätigt oder noch nicht neu gestartet."""
    store = _removal_store(hass)
    rec = await store.async_load()
    if not isinstance(rec, dict) or not rec.get("removed_at") or rec.get("verified"):
        return {"due": False}
    if rec.get("boot") == BOOT:
        return {"due": False, "restart_pending": True}
    left = await async_leftovers(hass, rec)
    rec.update(verified=True, verified_at=dt_util.now().isoformat(timespec="seconds"), ok=not left,
               leftovers=[x["kind"] for x in left])
    await store.async_save(rec)
    dash = next((x["url_paths"] for x in left if x["kind"] == "dashboards"), [])
    return {"due": True, "ok": not left, "leftovers": [{k: v for k, v in x.items() if k != "url_paths"} for x in left],
            "backup": rec.get("backup"), "removed_at": rec.get("removed_at"),
            "remove_dashboards": dash, "keep_files": rec.get("keep_files", True)}


async def async_move_files(hass: HomeAssistant, dashboards: list[str] | None) -> dict:
    """www/hemma → www/casora kopieren und Verweise in den genannten Dashboards umschreiben."""
    config_dir = hass.config.config_dir
    result = await hass.async_add_executor_job(copy_files, config_dir, hass.config.path(ASSETS_DIR))
    rewritten: dict[str, int] = {}
    errors: list[str] = []
    boards = _dashboards(hass)
    urls: list[str] = []
    for u in dashboards or []:
        urls += [u, u + "-mobile"]
    for u in urls:
        dash = boards.get(u)
        if dash is None or getattr(dash, "mode", "storage") != "storage":
            continue
        cfg = await _load(dash)
        if is_hemma_config(cfg):
            continue  # das Original bleibt, wie es ist
        new, n = rewrite_refs(cfg, result["mapping"])
        if not n:
            continue
        try:
            await dash.async_save(new)
            rewritten[u] = n
        except Exception as err:  # noqa: BLE001
            errors.append(f"{u}: {err}")
    result["rewritten"] = rewritten
    result["errors"] = errors
    return result


# ── WebSocket ─────────────────────────────────────────────────────────────────
@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/hemma/status"})
@websocket_api.async_response
async def ws_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        connection.send_result(msg["id"], await async_status(hass))
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Casora: Hemma-Status")
        connection.send_error(msg["id"], "status_failed", str(err))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/hemma/remove",
    vol.Optional("remove_dashboards"): [str],
    vol.Optional("keep_files", default=True): bool,
})
@websocket_api.async_response
async def ws_remove(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        connection.send_result(msg["id"], await async_remove(hass, msg.get("remove_dashboards"), msg["keep_files"]))
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Casora: Hemma entfernen")
        connection.send_error(msg["id"], "remove_failed", str(err))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/hemma/move_files",
    vol.Optional("dashboards"): [str],
})
@websocket_api.async_response
async def ws_move_files(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        connection.send_result(msg["id"], await async_move_files(hass, msg.get("dashboards")))
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Casora: Dateien übernehmen")
        connection.send_error(msg["id"], "move_failed", str(err))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/hemma/verify"})
@websocket_api.async_response
async def ws_verify(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        connection.send_result(msg["id"], await async_verify(hass))
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Casora: Hemma-Bestätigung")
        connection.send_error(msg["id"], "verify_failed", str(err))


_ROOM_TPL = re.compile(r"""template:\s*['"]?([a-z][a-z0-9]*)_room\b""")


def _yaml_room_prefix(config_dir: str, filename: str) -> str | None:
    """Präfix der Raumkarte („hemma“ oder ein eigener …) in einer YAML-Dashboard-Datei, die HA nicht lesen
    konnte (z. B. fehlende !include-Datei). Nur lesen, nur Dateien unter /config."""
    base = os.path.realpath(config_dir)
    path = os.path.realpath(os.path.join(base, filename))
    if not path.startswith(base + os.sep) or not path.lower().endswith((".yaml", ".yml")):
        return None
    if not os.path.isfile(path) or os.path.getsize(path) > 5 * 1024 * 1024:
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    count: dict[str, int] = {}
    for m in _ROOM_TPL.finditer(text):
        if m.group(1) != "casora":
            count[m.group(1)] = count.get(m.group(1), 0) + 1
    return max(count, key=count.get) if count else None


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/hemma/yaml_probe",
    vol.Required("filename"): str,
})
@websocket_api.async_response
async def ws_yaml_probe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Umzugsassistent: Ist ein unlesbares YAML-Dashboard ein Hemma-Dashboard (auch umbenannt)?"""
    try:
        prefix = await hass.async_add_executor_job(_yaml_room_prefix, hass.config.config_dir, msg["filename"])
        connection.send_result(msg["id"], {"prefix": prefix})
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "probe_failed", str(err))


def async_setup_hemma_cleanup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_yaml_probe)
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_remove)
    websocket_api.async_register_command(hass, ws_move_files)
    websocket_api.async_register_command(hass, ws_verify)
