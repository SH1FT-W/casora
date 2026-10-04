"""Voraussetzungen, die Casora selbst einrichtet: Helfer, Skripte, Automatik, Theme.

Früher musste man packages/casora_helpers.yaml und themes/casora/ von Hand
kopieren und configuration.yaml anpassen. Jetzt:

  • Helfer (input_boolean/text/select/number/datetime) – als normale UI-Helfer
    über die Speicher-Sammlung der jeweiligen Integration, genau wie beim
    Anlegen unter Einstellungen → Helfer.
  • Skripte – als Einträge in scripts.yaml (dort legt auch der Skript-Editor
    sie ab), danach script.reload. Karten rufen sie per script.turn_on auf.
  • Automatik (Neustart-Knöpfe zurücksetzen, Medienzeile aufklappen) – hier
    in Python, ohne Automationen.
  • Themes „Casora …“ – direkt bei der Oberfläche angemeldet, auch nach „Themes
    neu laden“, und als Kopie im Theme-Ordner (falls configuration.yaml ihn per
    !include_dir_merge_named lädt), damit sie schon beim HA-Start bereitstehen.

Was es schon gibt (z. B. aus einem alten Paket), bleibt unangetastet.
Der Dienst casora.einrichten wiederholt das Ganze und meldet, was fehlt.
"""

from __future__ import annotations

import inspect
import logging
import os
import re
from typing import Any

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_STATE_CHANGED, UnitOfTemperature
from homeassistant.core import CoreState, Event, HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later
from homeassistant.util.yaml import dump, load_yaml

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

HELPER_DOMAINS = ("input_boolean", "input_text", "input_select", "input_number", "input_datetime")
THEME_NAMES = ("Casora Standard",)
# Frühere Namen desselben Themes: ein so gespeichertes Standard-Theme wird einmal umgestellt.
THEME_RENAMED = {"Casora": "Casora Standard"}
EXPANDED_ROW = "input_select.casora_expanded_row"
RESTART_DONE = ("input_boolean.casora_restart_done_1", "input_boolean.casora_restart_done_2")
PLAYING = ("playing", "buffering")

_DIR = os.path.dirname(__file__)


def _read(name: str) -> Any:
    return load_yaml(os.path.join(_DIR, name))


def _collection(hass: HomeAssistant, domain: str):
    """Speicher-Sammlung eines Helfer-Typs – über den Websocket-Befehl, den auch
    der Helfer-Dialog benutzt (<domain>/create). None, wenn nicht erreichbar."""
    try:
        handler = hass.data["websocket_api"][f"{domain}/create"][0]
        return inspect.unwrap(handler).__self__.storage_collection
    except Exception:  # noqa: BLE001 – Aufbau kann sich mit HA-Versionen ändern
        return None


def _exists(hass: HomeAssistant, entity_id: str) -> bool:
    return hass.states.get(entity_id) is not None or er.async_get(hass).async_get(entity_id) is not None


def _adapt(hass: HomeAssistant, domain: str, key: str, conf: dict) -> dict:
    conf = dict(conf)
    if key == "casora_thermostat_target_temperature" and hass.config.units.temperature_unit == UnitOfTemperature.CELSIUS:
        conf.update(min=15, max=30, step=0.5, unit_of_measurement=UnitOfTemperature.CELSIUS)
    if domain == "input_text":
        conf.setdefault("max", 255)
    if domain == "input_boolean" and "initial" in conf:
        conf["initial"] = bool(conf["initial"])
    return conf


async def _add_options(coll, key: str, wanted: list[str]) -> None:
    """Fehlende Optionen an eine gespeicherte Auswahlliste anhängen (YAML-Listen bleiben unberührt)."""
    if coll is None:
        return
    item = (getattr(coll, "data", None) or {}).get(key)
    if not item:
        return
    have = list(item.get("options") or [])
    missing = [o for o in wanted if o not in have]
    if not missing:
        return
    try:
        await coll.async_update_item(key, {**{k: v for k, v in item.items() if k != "id"}, "options": have + missing})
        _LOGGER.info("Casora: input_select.%s um %s ergänzt", key, ", ".join(missing))
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Casora: Optionen für input_select.%s konnten nicht ergänzt werden", key)


async def _ensure_helpers(hass: HomeAssistant, spec: dict) -> tuple[list[str], list[str]]:
    created, failed = [], []
    for domain in HELPER_DOMAINS:
        items = spec.get(domain) or {}
        coll = None
        for key, conf in items.items():
            entity_id = f"{domain}.{key}"
            if _exists(hass, entity_id):
                # Auswahllisten, die Casora früher angelegt hat, bekommen neue Optionen nachgetragen
                # (z. B. „scenes“ für die Szenen-Badge) – eigene Zusätze bleiben erhalten.
                if domain == "input_select" and conf.get("options"):
                    coll = coll or _collection(hass, domain)
                    await _add_options(coll, key, list(conf["options"]))
                continue
            coll = coll or _collection(hass, domain)
            if coll is None:
                failed.append(entity_id)
                continue
            conf = _adapt(hass, domain, key, conf)
            try:
                # Die ID entsteht aus dem Namen – erst mit dem Schlüssel anlegen,
                # dann den lesbaren Namen setzen (die entity_id bleibt).
                item = await coll.async_create_item({**conf, "name": key})
                item_id = item["id"] if isinstance(item, dict) else getattr(item, "id", key)
                await coll.async_update_item(item_id, {**conf, "name": conf.get("name", key)})
                created.append(entity_id)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Casora: Helfer %s konnte nicht angelegt werden", entity_id)
                failed.append(entity_id)
    return created, failed


def _scripts_file_ok(config_dir: str) -> bool:
    """Lädt configuration.yaml die scripts.yaml? (Standard bei neuen Installationen)"""
    try:
        with open(os.path.join(config_dir, "configuration.yaml"), encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return False
    return re.search(r"^script:\s*!include\s+scripts\.yaml\s*$", text, re.M) is not None


def _append_scripts(config_dir: str, scripts: dict) -> None:
    """Hängt Skripte an scripts.yaml an – ohne den Rest neu zu schreiben, damit
    Kommentare und !secret-Verweise des Nutzers erhalten bleiben."""
    path = os.path.join(config_dir, "scripts.yaml")
    try:
        with open(path, encoding="utf-8") as f:
            old = f.read()
    except FileNotFoundError:
        old = ""
    if old.strip() in ("", "{}"):
        old = ""
    elif not old.endswith("\n"):
        old += "\n"
    body = old + ("\n" if old else "") + dump(scripts)
    tmp = path + ".casora.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, path)


async def _ensure_scripts(hass: HomeAssistant, spec: dict) -> tuple[list[str], list[str]]:
    wanted = spec.get("script") or {}
    missing = {k: v for k, v in wanted.items() if not _exists(hass, f"script.{k}")}
    if not missing:
        return [], []
    ids = [f"script.{k}" for k in missing]
    if not await hass.async_add_executor_job(_scripts_file_ok, hass.config.config_dir):
        return [], ids
    await hass.async_add_executor_job(_append_scripts, hass.config.config_dir, missing)
    await hass.services.async_call("script", "reload", blocking=True)
    return ids, [i for i in ids if hass.states.get(i) is None]


# ── Theme ────────────────────────────────────────────────────────────────────

def _overlay(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _overlay(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def _load_theme() -> dict:
    data = load_yaml(os.path.join(_DIR, "theme.yaml"))
    themes = {n: data[n] for n in THEME_NAMES if n in data}
    # Weitere Looks: nur ihre Abweichungen liegen in theme_<name>.yaml, der Rest kommt vom Casora-Theme.
    base = themes.get(THEME_NAMES[0])
    if not base:
        return themes
    for fn in sorted(os.listdir(_DIR)):
        if fn.startswith("theme_") and fn.endswith(".yaml"):
            for name, over in (load_yaml(os.path.join(_DIR, fn)) or {}).items():
                themes[name] = _overlay(base, over)
    return themes


@callback
def _inject_theme(hass: HomeAssistant, themes: dict) -> bool:
    store = hass.data.get("frontend_themes")
    if store is None:
        return False
    added = False
    for name, theme in themes.items():
        # Auch ersetzen: die Kopie im Theme-Ordner (unten) kann von einer älteren Version stammen.
        if store.get(name) != theme:
            store[name] = theme
            added = True
    return added


# Kopie im Theme-Ordner: HA lädt ihn schon beim Start der Oberfläche, lange bevor Casora
# selbst geladen ist. Sonst zeichnet das Dashboard nach einem Neustart kurz ohne Casora-Theme.
THEME_FILE = "casora-themes.yaml"
_THEMES_INCLUDE = re.compile(r"^[ \t]+themes:[ \t]*!include_dir_merge_named[ \t]+['\"]?([^'\"\s#]+)", re.M)


def _themes_dir(config_dir: str) -> str | None:
    """Ordner aus „frontend: themes: !include_dir_merge_named <ordner>“, sonst None.
    configuration.yaml wird nur gelesen, nie geändert."""
    try:
        with open(os.path.join(config_dir, "configuration.yaml"), encoding="utf-8") as f:
            m = _THEMES_INCLUDE.search(f.read())
    except OSError:
        return None
    if not m:
        return None
    path = os.path.normpath(os.path.join(config_dir, m.group(1)))
    return path if os.path.isdir(path) else None


def _theme_file_body(themes: dict) -> str:
    import json

    # JSON-Runde: keine YAML-Anker für geteilte Teile (Modi), nur schlichte Werte.
    plain = json.loads(json.dumps(themes))
    return ("# Von der Casora-Integration geschrieben und bei jedem Start aktualisiert – nicht bearbeiten.\n"
            "# Damit kennt Home Assistant Casoras Themes schon beim Start. Löschen ist unschädlich.\n"
            + dump(plain))


def _write_theme_file(config_dir: str, themes: dict) -> str | None:
    folder = _themes_dir(config_dir)
    if not folder:
        return None
    path = os.path.join(folder, THEME_FILE)
    body = _theme_file_body(themes)
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == body:
                return path
    except OSError:
        pass
    tmp = path + ".casora.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, path)
    return path


def remove_theme_file(config_dir: str) -> None:
    folder = _themes_dir(config_dir)
    if folder:
        try:
            os.remove(os.path.join(folder, THEME_FILE))
        except OSError:
            pass


DEFAULT_KEYS = ("frontend_default_theme", "frontend_default_dark_theme")


async def _setup_theme(hass: HomeAssistant, runtime: dict) -> None:
    themes = await hass.async_add_executor_job(_load_theme)
    if not themes:
        return
    # Beim Start kennt die Oberfläche Casora noch nicht und fällt vom gespeicherten
    # Standard-Theme auf „default“ zurück – den gespeicherten Wert wiederherstellen.
    saved: dict = {}
    store = hass.data.get("frontend_themes_store")
    if store is not None:
        try:
            saved = await store.async_load() or {}
        except Exception:  # noqa: BLE001
            saved = {}
    last = {k: saved.get(k) for k in DEFAULT_KEYS}
    renamed = {k: THEME_RENAMED[v] for k, v in last.items() if v in THEME_RENAMED}
    last.update(renamed)

    @callback
    def _apply() -> bool:
        if not _inject_theme(hass, themes):
            return False
        for k in DEFAULT_KEYS:
            if last.get(k) in themes and hass.data.get(k) in (None, "default"):
                hass.data[k] = last[k]
        return True

    if _apply():
        hass.bus.async_fire("themes_updated")
    # Umbenennung dauerhaft speichern (frontend.set_theme schreibt den Store).
    for key, name in renamed.items():
        data = {"name": name}
        if key == "frontend_default_dark_theme":
            data["mode"] = "dark"
        try:
            await hass.services.async_call("frontend", "set_theme", data, blocking=True)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Casora: Theme %s nicht umgestellt: %s", name, err)

    @callback
    def _updated(_event: Event) -> None:
        # „Themes neu laden“ ersetzt die Liste – Casora wieder dazulegen.
        if _apply():
            hass.bus.async_fire("themes_updated")
        else:
            last.update({k: hass.data.get(k) for k in DEFAULT_KEYS})

    runtime["unsub"].append(hass.bus.async_listen("themes_updated", _updated))

    try:
        await hass.async_add_executor_job(_write_theme_file, hass.config.config_dir, themes)
    except Exception as err:  # noqa: BLE001 – ohne Kopie greift nur der Weg oben
        _LOGGER.debug("Casora: Theme-Datei nicht geschrieben: %s", err)


# ── Automatik (früher Automationen im Paket) ─────────────────────────────────

def _legacy_automation(hass: HomeAssistant, unique_id: str) -> bool:
    return er.async_get(hass).async_get_entity_id("automation", "automation", unique_id) is not None


def _any_playing(hass: HomeAssistant) -> bool:
    return any(s.state in PLAYING for s in hass.states.async_all("media_player"))


@callback
def _setup_automatik(hass: HomeAssistant, runtime: dict) -> None:
    unsub = runtime["unsub"]
    clear_done = not (_legacy_automation(hass, "casora_auto_clear_restart_done_1")
                      or _legacy_automation(hass, "casora_auto_clear_restart_done_2"))
    expand = not _legacy_automation(hass, "casora_auto_expand_media_row")
    state = {"playing": _any_playing(hass)}

    def _expand() -> None:
        row = hass.states.get(EXPANDED_ROW)
        if row and row.state == "none" and "media" in (row.attributes.get("options") or []):
            hass.async_create_task(hass.services.async_call(
                "input_select", "select_option", {"entity_id": EXPANDED_ROW, "option": "media"}))

    @callback
    def _changed(event: Event) -> None:
        eid = event.data["entity_id"]
        new = event.data.get("new_state")
        if clear_done and eid in RESTART_DONE and new and new.state == "on":
            # Nach 3 s zurück – wie die frühere Automation.
            unsub.append(async_call_later(hass, 3, lambda _now, e=eid: hass.async_create_task(
                hass.services.async_call("input_boolean", "turn_off", {"entity_id": e}))))
        elif expand and eid.startswith("media_player."):
            now = _any_playing(hass)
            if now and not state["playing"]:
                _expand()
            state["playing"] = now

    unsub.append(hass.bus.async_listen(EVENT_STATE_CHANGED, _changed))
    if expand and state["playing"]:
        _expand()


# ── Einstieg ─────────────────────────────────────────────────────────────────

async def async_einrichten(hass: HomeAssistant) -> dict[str, Any]:
    spec = await hass.async_add_executor_job(_read, "helfer.yaml")
    h_new, h_fail = await _ensure_helpers(hass, spec)
    s_new, s_fail = await _ensure_scripts(hass, spec)
    result = {"angelegt": h_new + s_new, "fehlt": h_fail + s_fail}
    if result["angelegt"]:
        _LOGGER.info("Casora: %d Helfer/Skripte angelegt: %s", len(result["angelegt"]), ", ".join(result["angelegt"]))
    if result["fehlt"]:
        _LOGGER.warning(
            "Casora: konnte nicht anlegen: %s. Skripte brauchen „script: !include scripts.yaml“ "
            "in configuration.yaml (Standard bei neuen Installationen).", ", ".join(result["fehlt"]))
        hass.async_create_task(hass.services.async_call("persistent_notification", "create", {
            "notification_id": "casora_einrichten",
            "title": "Casora",
            "message": "Diese Helfer oder Skripte konnte Casora nicht selbst anlegen:\n\n"
                       + "\n".join(f"- `{i}`" for i in result["fehlt"])
                       + "\n\nSkripte brauchen `script: !include scripts.yaml` in configuration.yaml.",
        }))
    return result


async def async_setup_theme(hass: HomeAssistant) -> None:
    """Als Erstes beim Laden: Themes anmelden, bevor irgendetwas anderes wartet."""
    runtime = hass.data.setdefault(DOMAIN, {}).setdefault("helfer", {"unsub": []})
    if runtime.get("theme"):
        return
    runtime["theme"] = True
    try:
        await _setup_theme(hass, runtime)
    except Exception:  # noqa: BLE001 – darf das Laden nie verhindern
        _LOGGER.exception("Casora: Theme nicht angemeldet")


async def async_setup_helfer(hass: HomeAssistant) -> None:
    """Beim Laden der Integration; einmal pro HA-Lauf."""
    runtime = hass.data.setdefault(DOMAIN, {}).setdefault("helfer", {"unsub": []})

    async def _run(_event: Event | None = None) -> None:
        if _event is not None and waiting:
            runtime["unsub"].remove(waiting.pop())
        try:
            await async_einrichten(hass)
        except Exception:  # noqa: BLE001 – darf das Laden nie verhindern
            _LOGGER.exception("Casora: Einrichtung fehlgeschlagen")
        _setup_automatik(hass, runtime)

    await async_setup_theme(hass)
    # Helfer/Skripte erst, wenn HA läuft: dann sind alle YAML-Pakete geladen und
    # nichts wird doppelt angelegt.
    waiting: list = []
    if hass.state is CoreState.running:
        await _run()
    else:
        waiting.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _run))
        runtime["unsub"].append(waiting[0])

    async def _service(call: ServiceCall) -> dict[str, Any]:
        return await async_einrichten(hass)

    if not hass.services.has_service(DOMAIN, "einrichten"):
        hass.services.async_register(DOMAIN, "einrichten", _service, supports_response=SupportsResponse.OPTIONAL)


@callback
def async_unload_helfer(hass: HomeAssistant) -> None:
    runtime = hass.data.get(DOMAIN, {}).pop("helfer", None)
    for u in (runtime or {}).get("unsub", []):
        try:
            u()
        except Exception:  # noqa: BLE001 – schon abgelaufen
            pass
