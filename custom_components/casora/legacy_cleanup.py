"""Removes what earlier Casora versions left in the config folder, once, and then only tells.

Up to 26.10.59 Casora appended four scripts to scripts.yaml and kept a copy of its designs in
themes/casora-themes.yaml (HACS review hacs/default#12143, point 3). Casora needs neither any more.

  • Theme file: deleted once at setup, only when its first line is Casora's own marker
    (theme.old_theme_file), then frontend.reload_themes.
  • Scripts: there is no Python API to delete a UI script, so the browser of an admin does it through
    HA's own script config API (the one the script editor uses, DELETE /api/config/script/config/<id>).
    scripts/casora-legacy-cleanup.js is loaded on every page only while there is something to do. It
    asks here which scripts are left, keeps every script something still uses (search/related, the
    configs of automations and scripts, dashboards), lets this module compare the rest with what Casora
    wrote (fingerprint of alias + sequence, user-edited scripts stay), deletes the matching ones and
    reports back.
  • One persistent notification says what was removed and what was kept and why. Kept scripts stay in a
    repair notice (kept_scripts) while they exist.

The result is stored in .storage/casora.legacy_cleanup: nothing runs twice and nothing is written on
later starts.

  casora/legacy/scripts  → {"pending": [object_id, ...]}        (admins; claims the run for 2 minutes)
  casora/legacy/match    ← {"configs": {object_id: config}} → {"match": [object_id, ...]}
  casora/legacy/report   ← {"removed": [...], "kept": {object_id: {"reason": str, "by"?: [str]}}}
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import persistent_notification, websocket_api
from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store

from .actions import FORMER_SCRIPTS
from .const import DOMAIN, SCRIPTS_DIR, SCRIPTS_URL_BASE
from .theme import old_theme_file

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.legacy_cleanup"
STORAGE_VERSION = 1
JS = "casora-legacy-cleanup.js"
NOTIFICATION_ID = "casora_legacy_cleanup"
ISSUE_KEPT = "kept_scripts"
# Repair notices of 26.10.60b1 and earlier, replaced by this module.
OLD_ISSUES = ("leftover_scripts", "leftover_theme_file")
CLAIM_SECONDS = 120

# object_id -> fingerprint of the script exactly as Casora wrote it (dev/unit/legacy_scripts.yaml).
FINGERPRINTS = {
    "casora_restart_toggle": "0a95d1a7d1b55716",
    "casora_light_smart_toggle": "4cc1d99f1441a211",
    "casora_thermostat_overlay_toggle": "99ef3752965ea5f1",
    "casora_actions_overlay_toggle": "5c1bf523292b5335",
}
OBJECT_IDS = tuple(e.split(".", 1)[1] for e in FORMER_SCRIPTS)
REASONS = ("in_use", "edited", "not_in_scripts_yaml", "failed")


def fingerprint(config: Any) -> str:
    """Short hash of a script's alias and sequence (what decides whether the user changed it)."""
    if not isinstance(config, dict):
        return ""
    text = json.dumps({"alias": config.get("alias"), "sequence": config.get("sequence")},
                      sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def matches(object_id: str, config: Any) -> bool:
    return object_id in FINGERPRINTS and fingerprint(config) == FINGERPRINTS[object_id]


def remove_own_theme_file(config_dir: str) -> tuple[str | None, bool]:
    """(path relative to the config folder, removed) of Casora's own former theme file; (None, False) without one.

    The one place Casora deletes something in the config folder at setup: once (the store remembers it),
    and only a file whose first line is Casora's marker."""
    rel = old_theme_file(config_dir)
    if not rel:
        return None, False
    try:
        os.remove(os.path.join(config_dir, rel))
    except OSError:
        _LOGGER.warning("Casora: could not remove %s", rel, exc_info=True)
        return rel, False
    return rel, True


# ── Texts (persistent notification; the repair notice is in translations/*.json) ──

TEXT: dict[str, dict[str, str]] = {
    "de": {
        "title": "Casora hat aufgeräumt",
        "intro": "Casora hat alte Einträge entfernt:",
        "scripts": "{n} Skripte aus früheren Versionen",
        "script": "1 Skript aus einer früheren Version",
        "file": "die Datei {path}",
        "end": "Casora braucht sie nicht mehr.",
        "kept": "Behalten hat Casora:",
        "file_failed": "Die Datei {path} ließ sich nicht löschen. Casora braucht sie nicht mehr, du kannst sie selbst löschen.",
        "in_use": "wird noch verwendet",
        "edited": "wurde von dir geändert",
        "not_in_scripts_yaml": "steht nicht in scripts.yaml",
        "failed": "ließ sich nicht löschen",
        "by": "von",
        "and": "und",
    },
    "en": {
        "title": "Casora cleaned up",
        "intro": "Casora removed old entries:",
        "scripts": "{n} scripts from earlier versions",
        "script": "1 script from an earlier version",
        "file": "the file {path}",
        "end": "Casora no longer needs them.",
        "kept": "Casora kept:",
        "file_failed": "The file {path} could not be deleted. Casora no longer needs it, you can delete it yourself.",
        "in_use": "is still in use",
        "edited": "was changed by you",
        "not_in_scripts_yaml": "is not in scripts.yaml",
        "failed": "could not be deleted",
        "by": "by",
        "and": "and",
    },
    "es": {
        "title": "Casora ha hecho limpieza",
        "intro": "Casora ha eliminado entradas antiguas:",
        "scripts": "{n} scripts de versiones anteriores",
        "script": "1 script de una versión anterior",
        "file": "el archivo {path}",
        "end": "Casora ya no los necesita.",
        "kept": "Casora ha conservado:",
        "file_failed": "No se pudo eliminar el archivo {path}. Casora ya no lo necesita, puedes eliminarlo tú.",
        "in_use": "aún se usa",
        "edited": "lo has modificado tú",
        "not_in_scripts_yaml": "no está en scripts.yaml",
        "failed": "no se pudo eliminar",
        "by": "en",
        "and": "y",
    },
    "fr": {
        "title": "Casora a fait le ménage",
        "intro": "Casora a supprimé d'anciennes entrées :",
        "scripts": "{n} scripts de versions précédentes",
        "script": "1 script d'une version précédente",
        "file": "le fichier {path}",
        "end": "Casora n'en a plus besoin.",
        "kept": "Casora a conservé :",
        "file_failed": "Le fichier {path} n'a pas pu être supprimé. Casora n'en a plus besoin, tu peux le supprimer toi-même.",
        "in_use": "est encore utilisé",
        "edited": "a été modifié par toi",
        "not_in_scripts_yaml": "n'est pas dans scripts.yaml",
        "failed": "n'a pas pu être supprimé",
        "by": "par",
        "and": "et",
    },
    "it": {
        "title": "Casora ha fatto pulizia",
        "intro": "Casora ha rimosso voci vecchie:",
        "scripts": "{n} script di versioni precedenti",
        "script": "1 script di una versione precedente",
        "file": "il file {path}",
        "end": "Casora non ne ha più bisogno.",
        "kept": "Casora ha mantenuto:",
        "file_failed": "Non è stato possibile eliminare il file {path}. Casora non ne ha più bisogno, puoi eliminarlo tu.",
        "in_use": "è ancora in uso",
        "edited": "è stato modificato da te",
        "not_in_scripts_yaml": "non è in scripts.yaml",
        "failed": "non è stato possibile eliminarlo",
        "by": "da",
        "and": "e",
    },
    "nl": {
        "title": "Casora heeft opgeruimd",
        "intro": "Casora heeft oude onderdelen verwijderd:",
        "scripts": "{n} scripts uit eerdere versies",
        "script": "1 script uit een eerdere versie",
        "file": "het bestand {path}",
        "end": "Casora heeft ze niet meer nodig.",
        "kept": "Casora heeft behouden:",
        "file_failed": "Het bestand {path} kon niet worden verwijderd. Casora heeft het niet meer nodig, je kunt het zelf verwijderen.",
        "in_use": "wordt nog gebruikt",
        "edited": "is door jou gewijzigd",
        "not_in_scripts_yaml": "staat niet in scripts.yaml",
        "failed": "kon niet worden verwijderd",
        "by": "door",
        "and": "en",
    },
    "pl": {
        "title": "Casora posprzątała",
        "intro": "Casora usunęła stare wpisy:",
        "scripts": "skrypty z wcześniejszych wersji: {n}",
        "script": "1 skrypt z wcześniejszej wersji",
        "file": "plik {path}",
        "end": "Casora już ich nie potrzebuje.",
        "kept": "Casora zachowała:",
        "file_failed": "Nie udało się usunąć pliku {path}. Casora już go nie potrzebuje, możesz usunąć go samodzielnie.",
        "in_use": "jest nadal używany",
        "edited": "został przez Ciebie zmieniony",
        "not_in_scripts_yaml": "nie znajduje się w scripts.yaml",
        "failed": "nie udało się go usunąć",
        "by": "przez",
        "and": "i",
    },
    "pt": {
        "title": "O Casora fez uma limpeza",
        "intro": "O Casora removeu entradas antigas:",
        "scripts": "{n} scripts de versões anteriores",
        "script": "1 script de uma versão anterior",
        "file": "o ficheiro {path}",
        "end": "O Casora já não precisa deles.",
        "kept": "O Casora manteve:",
        "file_failed": "Não foi possível apagar o ficheiro {path}. O Casora já não precisa dele, podes apagá-lo tu.",
        "in_use": "ainda está em uso",
        "edited": "foi alterado por ti",
        "not_in_scripts_yaml": "não está em scripts.yaml",
        "failed": "não foi possível apagá-lo",
        "by": "por",
        "and": "e",
    },
}


def _lang(language: Any) -> dict[str, str]:
    return TEXT.get(str(language or "")[:2], TEXT["en"])


def notification_text(news: dict, language: Any) -> tuple[str, str] | None:
    """(title, message) for what happened, or None when there is nothing to tell.

    news: {"theme": {"path": str, "removed": bool}?, "removed": [object_id], "kept": {object_id: {...}}}"""
    t = _lang(language)
    removed = list(news.get("removed") or [])
    kept = dict(news.get("kept") or {})
    theme = news.get("theme") or None
    parts = []
    if removed:
        parts.append(t["script"] if len(removed) == 1 else t["scripts"].format(n=len(removed)))
    if theme and theme.get("removed"):
        parts.append(t["file"].format(path=f"`{theme['path']}`"))
    lines = []
    if parts:
        joined = parts[0] if len(parts) == 1 else f"{parts[0]} {t['and']} {parts[1]}"
        lines.append(f"{t['intro']} {joined}. {t['end']}")
    if removed:
        lines.append("\n".join(f"- `script.{o}`" for o in removed))
    if kept:
        rows = []
        for o, info in kept.items():
            reason = t.get(str((info or {}).get("reason")), t["failed"])
            by = [str(b) for b in (info or {}).get("by") or []][:5]
            rows.append(f"- `script.{o}`: {reason}" + (f" ({t['by']} " + ", ".join(f"`{b}`" for b in by) + ")" if by else ""))
        lines.append(t["kept"] + "\n" + "\n".join(rows))
    if theme and not theme.get("removed"):
        lines.append(t["file_failed"].format(path=f"`{theme['path']}`"))
    if not lines:
        return None
    return t["title"], "\n\n".join(lines)


# ── Runtime ──────────────────────────────────────────────────────────────────

class _Cleanup:
    def __init__(self, hass: HomeAssistant, store: Store, data: dict) -> None:
        self.hass = hass
        self.store = store
        self.data = data
        self.pending: list[str] = []
        self.claimed = 0.0
        self.js_url: str | None = None

    @property
    def handled(self) -> set[str]:
        s = self.data.get("scripts") or {}
        return set(s.get("removed") or []) | set((s.get("kept") or {}).keys())

    async def save(self) -> None:
        await self.store.async_save(self.data)


def _rt(hass: HomeAssistant) -> _Cleanup | None:
    return hass.data.get(DOMAIN, {}).get("legacy_rt")


def _loaded_scripts(hass: HomeAssistant) -> list[str]:
    """Former Casora scripts HA really loaded (a registry entry without its YAML is a restored placeholder)."""
    out = []
    for oid in OBJECT_IDS:
        s = hass.states.get(f"script.{oid}")
        if s is not None and not (getattr(s, "attributes", None) or {}).get("restored"):
            out.append(oid)
    return out


@callback
def _update_kept_issue(hass: HomeAssistant, rt: _Cleanup) -> None:
    kept = (rt.data.get("scripts") or {}).get("kept") or {}
    still = [o for o in _loaded_scripts(hass) if o in kept]
    if still:
        ir.async_create_issue(hass, DOMAIN, ISSUE_KEPT, is_fixable=False, is_persistent=False,
                              severity=ir.IssueSeverity.WARNING, translation_key=ISSUE_KEPT,
                              translation_placeholders={"scripts": ", ".join(f"script.{o}" for o in still)})
    else:
        ir.async_delete_issue(hass, DOMAIN, ISSUE_KEPT)


async def _tell(hass: HomeAssistant, rt: _Cleanup) -> None:
    """Show what is new, once, when no script cleanup is waiting for a browser any more."""
    news = rt.data.get("news") or {}
    if rt.pending or not news:
        return
    text = notification_text(news, hass.config.language)
    rt.data["news"] = {}
    await rt.save()
    if text:
        persistent_notification.async_create(hass, text[1], title=text[0], notification_id=NOTIFICATION_ID)


async def _js(hass: HomeAssistant, rt: _Cleanup, on: bool) -> None:
    """The browser module on every page while scripts wait for an admin browser, else off."""
    if on and rt.js_url is None:
        try:
            stamp = int(await hass.async_add_executor_job(os.path.getmtime, hass.config.path(SCRIPTS_DIR, JS)))
        except OSError:
            stamp = 0
        rt.js_url = f"{SCRIPTS_URL_BASE}/{JS}?v={stamp}"
        add_extra_js_url(hass, rt.js_url)
    elif not on and rt.js_url is not None:
        with contextlib.suppress(KeyError, ValueError):
            remove_extra_js_url(hass, rt.js_url)
        rt.js_url = None


async def async_run(hass: HomeAssistant) -> None:
    """Once HA runs (scripts are loaded): theme file now, scripts through the next admin browser."""
    data = hass.data.setdefault(DOMAIN, {})
    rt = data.get("legacy_rt")
    if rt is None:
        store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        saved = await store.async_load()
        rt = data["legacy_rt"] = _Cleanup(hass, store, saved if isinstance(saved, dict) else {})
    if not data.get("legacy_ws"):
        websocket_api.async_register_command(hass, ws_scripts)
        websocket_api.async_register_command(hass, ws_match)
        websocket_api.async_register_command(hass, ws_report)
        data["legacy_ws"] = True
    for issue in OLD_ISSUES:
        ir.async_delete_issue(hass, DOMAIN, issue)

    if "theme" not in rt.data:
        try:
            rel, removed = await hass.async_add_executor_job(remove_own_theme_file, hass.config.config_dir)
        except Exception:  # noqa: BLE001 - only housekeeping
            rel, removed = None, False
        if rel:
            rt.data["theme"] = {"path": rel, "removed": removed}
            rt.data.setdefault("news", {})["theme"] = rt.data["theme"]
            await rt.save()
            _LOGGER.info("Casora: former theme file %s %s", rel, "removed" if removed else "not removed")
            if removed and hass.services.has_service("frontend", "reload_themes"):
                try:
                    await hass.services.async_call("frontend", "reload_themes", blocking=True)
                except Exception:  # noqa: BLE001 - HA reloads them on its next start anyway
                    _LOGGER.debug("Casora: reload_themes failed", exc_info=True)

    rt.pending = [o for o in _loaded_scripts(hass) if o not in rt.handled]
    await _js(hass, rt, bool(rt.pending))
    _update_kept_issue(hass, rt)
    await _tell(hass, rt)


@callback
def async_unload(hass: HomeAssistant) -> None:
    rt = hass.data.get(DOMAIN, {}).pop("legacy_rt", None)
    if rt is not None and rt.js_url is not None:
        with contextlib.suppress(KeyError, ValueError):
            remove_extra_js_url(hass, rt.js_url)


# ── WebSocket ────────────────────────────────────────────────────────────────

_ID = vol.In(OBJECT_IDS)


@websocket_api.websocket_command({vol.Required("type"): "casora/legacy/scripts"})
@websocket_api.require_admin
@callback
def ws_scripts(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    rt = _rt(hass)
    now = time.monotonic()
    if rt is None or not rt.pending or now - rt.claimed < CLAIM_SECONDS:
        # Nothing to do, or another admin browser is at it right now.
        connection.send_result(msg["id"], {"pending": []})
        return
    rt.claimed = now
    connection.send_result(msg["id"], {"pending": list(rt.pending)})


@websocket_api.websocket_command({
    vol.Required("type"): "casora/legacy/match",
    vol.Required("configs"): {_ID: dict},
})
@websocket_api.require_admin
@callback
def ws_match(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    connection.send_result(msg["id"], {"match": [o for o, c in msg["configs"].items() if matches(o, c)]})


@websocket_api.websocket_command({
    vol.Required("type"): "casora/legacy/report",
    vol.Required("removed"): [_ID],
    vol.Required("kept"): {_ID: vol.Schema({vol.Required("reason"): vol.In(REASONS),
                                            vol.Optional("by"): [vol.All(str, vol.Length(max=255))]})},
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_report(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    rt = _rt(hass)
    if rt is None:
        connection.send_error(msg["id"], "not_ready", "Casora is not loaded")
        return
    await async_record(hass, rt, list(msg["removed"]), dict(msg["kept"]))
    connection.send_result(msg["id"], {"ok": True})


async def async_record(hass: HomeAssistant, rt: _Cleanup, removed: list[str], kept: dict) -> None:
    removed = [o for o in dict.fromkeys(removed) if o in rt.pending]
    kept = {o: {k: v for k, v in (i or {}).items() if k in ("reason", "by")}
            for o, i in kept.items() if o in rt.pending and o not in removed}
    s = rt.data.setdefault("scripts", {"removed": [], "kept": {}})
    s["removed"] = sorted(set(s.get("removed") or []) | set(removed))
    s.setdefault("kept", {}).update(kept)
    news = rt.data.setdefault("news", {})
    news["removed"] = list(dict.fromkeys([*(news.get("removed") or []), *removed]))
    news["kept"] = {**(news.get("kept") or {}), **kept}
    rt.pending = [o for o in rt.pending if o not in removed and o not in kept]
    rt.claimed = 0.0
    await rt.save()
    if removed:
        _LOGGER.info("Casora: former scripts removed: %s", ", ".join(removed))
    await _js(hass, rt, bool(rt.pending))
    _update_kept_issue(hass, rt)
    await _tell(hass, rt)
