"""Optionen der Integration (Casora → Konfigurieren) – auch im Studio unter „Einstellungen“.

Das Schema steht nur hier: HAs Optionen-Dialog (config_flow.py) und die Studio-Seite
prüfen mit denselben Selektoren. Speichern geht wie beim Dialog über
async_update_entry – der Update-Listener in __init__.py lädt die Integration dann neu.

Optionen des früheren Update-Servers (update_key/update_server/update_token) gibt es nicht
mehr: sie werden weder gezeigt noch angenommen, sondern still weggelassen. Ebenso ki_auto
(bis 1.0.2): seit 1.0.3 hat jede KI-Funktion einen eigenen Zeitplan (ki_plan_*, siehe ki.py),
ki_auto wird beim Start einmal übernommen (async_migrate_entry in __init__.py).

WebSocket (nur Admins):
  casora/options/get ← {} →
    {entry_id, options: {…}, notify_services: [notify.…],
     auto: {ai_task_entity, ai_task_web_entity, outdoor_temperature, outdoor_humidity, rezept_liste}}
  casora/options/set ← {options: {…}} → wie get + {changed}
    options ersetzt alle Optionen (wie der Dialog; leere Felder fallen weg). Nur
    beta_updates (Studio → Updates) bleibt, wenn es fehlt.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from .const import DOMAIN
from .ki import (OPT_AI, OPT_AI_WEB, OPT_AUTO, OPT_NOTES, OPT_OUT_RH, OPT_OUT_T, OPT_PLAN_UPDATE, OPT_PRICE,
                 OPT_RECIPE_LIST,
                 PLAN_OPTS, UPDATE_PLANS, valid_plan)
from .lueften_push import OPT_VENT_NOTIFY, OPT_VENT_PERSONS, notify_services
from .update_push import OPT_UPDATE_PUSH
from .update_source import LEGACY_OPTIONS, OPT_BETA


def options_schema(hass: HomeAssistant, options: dict[str, Any]) -> vol.Schema:
    """Schema der Optionen; `options` liefert die Vorschläge."""

    def sug(key):
        return {"suggested_value": options.get(key)} if options.get(key) not in (None, "") else {}

    def plan(key):
        # Aus / bisheriger Termin; eine eigene Zeit („sun 18:00“) steht als eigener Eintrag
        # dabei und lässt sich im Dialog auch eintippen (geprüft von check_plans).
        cur = options.get(key)
        opts = ["off", "auto"] + ([cur] if cur not in (None, "", "off", "auto") else [])
        return selector.SelectSelector(selector.SelectSelectorConfig(
            options=opts, custom_value=True, translation_key="ki_plan",
            mode=selector.SelectSelectorMode.DROPDOWN))

    return vol.Schema({
        vol.Optional(OPT_AI, description=sug(OPT_AI)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="ai_task")),
        vol.Optional(OPT_AI_WEB, description=sug(OPT_AI_WEB)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="ai_task")),
        vol.Optional(OPT_OUT_T, description=sug(OPT_OUT_T)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="temperature")),
        vol.Optional(OPT_OUT_RH, description=sug(OPT_OUT_RH)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="humidity")),
        vol.Optional(OPT_PRICE, description=sug(OPT_PRICE)): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0, max=2, step=0.01, unit_of_measurement="€/kWh",
                                          mode=selector.NumberSelectorMode.BOX)),
        vol.Optional(OPT_NOTES, description=sug(OPT_NOTES)): selector.TextSelector(
            selector.TextSelectorConfig(multiline=True)),
        vol.Optional(OPT_RECIPE_LIST, description=sug(OPT_RECIPE_LIST)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="todo")),
        **{vol.Optional(opt, description=sug(opt)): plan(opt) for opt in PLAN_OPTS.values()},
        vol.Optional(OPT_PLAN_UPDATE, description=sug(OPT_PLAN_UPDATE)): selector.SelectSelector(
            selector.SelectSelectorConfig(options=["off", *UPDATE_PLANS], translation_key="ki_plan_update",
                                          mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Optional(OPT_VENT_NOTIFY, description=sug(OPT_VENT_NOTIFY)): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[f"notify.{s}" for s in notify_services(hass)],
                multiple=True, custom_value=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Optional(OPT_VENT_PERSONS, description=sug(OPT_VENT_PERSONS)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="person", multiple=True)),
        # Push bei neuen Casora-Versionen (update_push.py): leer = aus.
        vol.Optional(OPT_UPDATE_PUSH, description=sug(OPT_UPDATE_PUSH)): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[f"notify.{s}" for s in notify_services(hass)],
                multiple=True, custom_value=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        # Beta-Versionen (Studio → Updates): Vorabversionen als Update anbieten. Standard aus.
        vol.Optional(OPT_BETA, default=options.get(OPT_BETA, False)): selector.BooleanSelector(),
    })


def clean_options(data: dict[str, Any]) -> dict[str, Any]:
    """Leere Felder nicht speichern – dann gilt die automatische Wahl. Alte Optionen fallen weg.

    Zeitpläne: „aus“ ist der Standard und wird nicht gespeichert. Beta-Versionen aus (Standard) ebenso.
    """
    return {k: v for k, v in data.items()
            if v not in (None, "", []) and k not in LEGACY_OPTIONS and k != OPT_AUTO
            and not (k in PLAN_KEYS and v == "off") and not (k == OPT_BETA and v is False)}


PLAN_KEYS = (*PLAN_OPTS.values(), OPT_PLAN_UPDATE)


def check_plans(data: dict[str, Any]) -> str | None:
    """Erste Zeitplan-Option mit ungültiger eigener Zeit (sonst None)."""
    return next((k for k in PLAN_OPTS.values() if not valid_plan(data.get(k))), None)


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _auto(hass: HomeAssistant) -> dict[str, str | None]:
    """Was Casora bei leerem Feld selbst wählt (für die Platzhalter im Studio)."""
    from .ki import _outdoor, ai_entity, recipe_list

    empty = SimpleNamespace(options={})
    out: dict[str, str | None] = {}
    for key, fn in ((OPT_AI, lambda: ai_entity(hass, empty)),
                    (OPT_AI_WEB, lambda: ai_entity(hass, empty, web=True)),
                    (OPT_OUT_T, lambda: _outdoor(hass, empty, "temperature", OPT_OUT_T)),
                    (OPT_OUT_RH, lambda: _outdoor(hass, empty, "humidity", OPT_OUT_RH)),
                    (OPT_RECIPE_LIST, lambda: recipe_list(hass, empty))):
        try:
            out[key] = fn()
        except Exception:  # noqa: BLE001 – nur ein Hinweis, darf nie scheitern
            out[key] = None
    return out


def options_payload(hass: HomeAssistant, entry) -> dict[str, Any]:
    return {
        "entry_id": entry.entry_id,
        "options": {k: v for k, v in entry.options.items() if k not in LEGACY_OPTIONS},
        "notify_services": [f"notify.{s}" for s in notify_services(hass)],
        "auto": _auto(hass),
    }


class OptionsError(ValueError):
    """Ungültige Eingabe; `path` nennt das Feld (falls bekannt)."""

    def __init__(self, message: str, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path


def build_options(hass: HomeAssistant, current: dict[str, Any], submitted: dict[str, Any]) -> dict[str, Any]:
    """Neue Optionen aus der Eingabe des Studios – geprüft mit dem Schema des Dialogs."""
    # Leere Felder schickt HAs Dialog gar nicht erst – hier genauso, sonst lehnt der Selektor "" ab.
    # Alte Update-Optionen (etwa aus einem noch offenen älteren Studio) fallen still weg.
    data = clean_options(submitted)
    # Der Beta-Schalter steht unter Updates, nicht auf der Einstellungen-Seite: schickt die
    # (oder ein älteres Studio) ihn nicht mit, bleibt er, wie er ist.
    # „Aus“ muss bis zur Prüfung bleiben, sonst setzt der Standard (bisheriger Wert) es wieder an.
    if OPT_BETA in submitted:
        data[OPT_BETA] = False if submitted[OPT_BETA] in (None, "") else submitted[OPT_BETA]
        if not isinstance(data[OPT_BETA], bool):  # BooleanSelector nähme auch „ja“ an
            raise OptionsError("beta_updates must be true or false", OPT_BETA)
    elif OPT_BETA in current:
        data[OPT_BETA] = current[OPT_BETA]
    try:
        valid = options_schema(hass, current)(data)
    except vol.Invalid as err:
        path = str(err.path[0]) if getattr(err, "path", None) else None
        raise OptionsError(str(err), path) from err
    bad = check_plans(valid)
    if bad:
        raise OptionsError(f"Invalid schedule for {bad}: {valid[bad]!r} (off, auto, \"sun 18:00\" or \"18:00\")", bad)
    # Eigene Zeit einheitlich speichern: „Sun 6:00“ → „sun 06:00“.
    for k in PLAN_OPTS.values():
        if valid.get(k) not in (None, "", "off", "auto"):
            day, _, hm = str(valid[k]).strip().lower().rpartition(" ")
            h, m = hm.split(":")
            valid[k] = (day.strip() + " " if day.strip() else "") + f"{int(h):02d}:{m}"
    return clean_options(valid)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/options/get"})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    connection.send_result(msg["id"], options_payload(hass, entry))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/options/set",
    vol.Required("options"): dict,
    # Früher Casora-Schlüssel/GitHub-Token – wird noch angenommen, aber nicht mehr gelesen.
    vol.Optional("token"): vol.Any(None, str),
    vol.Optional("key"): vol.Any(None, str),
})
@callback
def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Casora is not set up")
        return
    try:
        new = build_options(hass, dict(entry.options), msg["options"])
    except OptionsError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    # Wie der Optionen-Dialog: der Update-Listener lädt die Integration neu.
    changed = hass.config_entries.async_update_entry(entry, options=new)
    connection.send_result(msg["id"], {**options_payload(hass, entry), "changed": bool(changed)})


@callback
def async_setup_options(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("options_ws"):
        return
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_set)
    hass.data.setdefault(DOMAIN, {})["options_ws"] = True
