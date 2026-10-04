"""Eigene Kachelarten (Studio → Kachel → „Als eigene Kachelart anlegen …“).

Eine eigene Kachelart ist eine Vorlage own_<name> im Dashboard, die von einer
Casora-Vorlage erbt (button-card ``template: casora_xyz``) und nur ihre Änderungen
als Überlagerung trägt. Die Überlagerung baut das Studio (casora-panel-kachelart.js);
hier fragt Casora nur die KI, was sich an der Vorlage ändern soll, als Liste kleiner
Änderungen, dieselbe Technik wie beim Umzug (settings._apply_ops).

  casora/ki/tile_type ← {"name", "template", "wish"[, "label", "parents"]}
                      → {"template", "changes", "ops"}                     (nur Admins)

Eigene Vorlagen heißen nie casora_…: template_refresh.py und das Speichern im Studio
lassen sie deshalb unangetastet (refresh_templates: „foreign“).
"""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .settings import _apply_ops, _json_list

PREFIX = "own_"
MAX_CHARS = 60000        # Vorlage, die die KI ändern soll
MAX_PARENT_CHARS = 30000  # geerbte Vorlagen, nur zur Information
MAX_WISH = 600

TILE_TYPE_STRUCTURE = {
    "ops": {"required": True, "selector": {"text": {"multiline": True}},
            "description": "Die Änderungen an der VORLAGE als JSON-Liste"},
    "changes": {"selector": {"text": {"multiple": True}},
                "description": "Was sich geändert hat: kurze, verständliche Sätze für Endnutzer, "
                               "ohne Fachbegriffe, Variablen- oder Entitätsnamen"},
}


def is_own(name: str) -> bool:
    """Eigene Kachelart (nie von Casora geschrieben, nie aufgefrischt)."""
    return isinstance(name, str) and name.startswith(PREFIX)


def _parents_text(parents: dict | None) -> str:
    """Geerbte Vorlagen für die KI, gekürzt, damit die Anfrage bezahlbar bleibt."""
    out, used = [], 0
    for name, tpl in (parents or {}).items():
        if not isinstance(tpl, dict):
            continue
        raw = json.dumps(tpl, ensure_ascii=False)
        if used + len(raw) > MAX_PARENT_CHARS:
            out.append(f"{name}: (zu groß, ausgelassen)")
            continue
        used += len(raw)
        out.append(f"{name}:\n{raw}")
    return "\n\n".join(out)


def tile_type_prompt(name: str, template: dict, wish: str, label: str, parents: dict | None, lang: str) -> str:
    """Anweisung an die KI: eine Casora-Vorlage nach dem Wunsch des Nutzers ändern."""
    chain = [p for p in ([template.get("template")] if isinstance(template.get("template"), str)
                         else template.get("template") or []) if isinstance(p, str)]
    inherited = _parents_text(parents)
    return (
        "Du hilfst in Casora, einem Home-Assistant-Dashboard, eine eigene Kachelart anzulegen. "
        "Kacheln sind custom:button-card-Vorlagen (JSON).\n\n"
        f"Grundlage ist Casoras Vorlage {name}"
        + (f" (sie erbt von {', '.join(chain)})" if chain else "") + ". "
        + (f"Die neue Kachelart heißt „{label}“. " if label else "")
        + "Der Nutzer wünscht sich folgende Änderung:\n"
        f"\"{wish}\"\n\n"
        "Regeln:\n"
        "1. Ändere nur, was der Wunsch verlangt. Alles andere bleibt genau so: Casora liefert für die "
        "Grundlage weiter Updates, und nur deine Änderungen bleiben darüber liegen.\n"
        "2. Ändere nie den Schlüssel template und nie die Variablen, die das Studio je Kachel füllt "
        "(Entitäten, Namen, Symbole der Kachel).\n"
        "3. Neue Styles hängst du als neuen Eintrag ans Ende der passenden Liste an (z. B. styles/card/<Länge "
        "der Liste>, Wert {\"border-radius\": \"8px\"}); bestehende Einträge ersetzt du nicht. Spätere "
        "Einträge gewinnen.\n"
        "4. Was eine geerbte Vorlage festlegt, darfst du in der VORLAGE neu setzen (gleicher Pfad).\n"
        "5. Farben über Casoras Variablen, z. B. var(--casora-color-red, #FF453A), var(--casora-color-green, #30D158), "
        "var(--casora-color-teal, #00C3D0), var(--casora-color-yellow, #FFCC00), var(--casora-color-blue, #0A84FF).\n"
        "6. JavaScript in [[[ ]]] muss gültig bleiben (Variablen: states, entity, user, hass, variables, html, helpers).\n"
        "7. Lässt sich der Wunsch nicht umsetzen: leere Liste [] und unter changes ein Satz, warum.\n\n"
        "Antwort: unter ops nur die Änderungen an der VORLAGE als JSON-Liste: "
        '[{"op": "set", "path": "styles/card/3", "value": …}, {"op": "remove", "path": "…"}]. '
        "path sind die Schlüssel von der Wurzel der VORLAGE, durch / getrennt, Listen mit Index. value ist "
        "der komplette neue Wert an dieser Stelle (bei JavaScript der ganze String). "
        f"Unter changes beschreibst du auf {lang} in höchstens drei kurzen, ganzen Sätzen, was jetzt anders "
        "aussieht oder sich anders verhält, für Endnutzer ohne Technikwissen, ohne Fachbegriffe (kein YAML, "
        "JSON, Template, Variable, CSS, JavaScript, Entität) und ohne Schlüssel- oder Entitätsnamen.\n\n"
        + ("GEERBT (nur zur Information, nicht ändern):\n" + inherited + "\n\n" if inherited else "")
        + "VORLAGE:\n" + json.dumps(template, ensure_ascii=False)
    )


def tile_type_result(template: dict, res: Any) -> tuple[dict, list[str], int]:
    """Antwort der KI anwenden. ValueError, wenn sie nicht passt."""
    ops = _json_list((res or {}).get("ops") if isinstance(res, dict) else None)
    if not isinstance(ops, list):
        raise ValueError("Die KI hat keine gültigen Änderungen geliefert")
    # Die Erbfolge bestimmt Casora, nicht die KI.
    ops = [o for o in ops if not (isinstance(o, dict)
                                  and str(o.get("path") or "").strip("/").split("/")[0] == "template")]
    try:
        out = _apply_ops(template, ops)
    except (ValueError, IndexError, KeyError, TypeError, AttributeError) as err:
        raise ValueError(f"Die Änderungen der KI passen nicht zur Vorlage ({err})") from err
    changes = res.get("changes") if isinstance(res, dict) else None
    if isinstance(changes, str):
        changes = [changes]
    notes = [str(c).strip() for c in (changes or []) if str(c).strip()][:6]
    return out, notes, len(ops)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/ki/tile_type",
    vol.Required("name"): str,
    vol.Required("template"): dict,
    vol.Required("wish"): str,
    vol.Optional("label", default=""): str,
    vol.Optional("parents", default={}): dict,
})
@websocket_api.async_response
async def ws_tile_type(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Eigene Kachelart: die Casora-Vorlage nach dem Wunsch des Nutzers ändern lassen."""
    from .ki import ai_models, ask_ai

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_set_up", "Casora ist nicht eingerichtet")
        return
    best = next((m for m in ai_models(hass) if m["ok"]), None)
    if not best:
        connection.send_error(msg["id"], "weak_ai", "Keine ausreichend starke KI eingerichtet")
        return
    wish = " ".join(str(msg["wish"]).split())[:MAX_WISH]
    if not wish:
        connection.send_error(msg["id"], "no_wish", "Was soll anders sein?")
        return
    if len(json.dumps(msg["template"], ensure_ascii=False)) > MAX_CHARS:
        connection.send_error(msg["id"], "too_big", "Die Vorlage ist für die KI zu groß")
        return
    lang = "Deutsch" if (hass.config.language or "").startswith("de") else "English"
    prompt = tile_type_prompt(msg["name"], msg["template"], wish, msg["label"].strip()[:60], msg["parents"], lang)
    try:
        res = await ask_ai(hass, entries[0], "Casora Kachelart: Vorlage anpassen", prompt, TILE_TYPE_STRUCTURE,
                           entity=best["entity_id"])
    except Exception as err:  # noqa: BLE001 (dem Studio als Meldung zeigen)
        connection.send_error(msg["id"], "ai_failed", str(err))
        return
    try:
        tpl, notes, n = tile_type_result(msg["template"], res)
    except ValueError as err:
        connection.send_error(msg["id"], "bad_ops", str(err))
        return
    connection.send_result(msg["id"], {"template": tpl, "changes": notes, "ops": n})


@callback
def async_setup_kachelart(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("kachelart_ws"):
        return
    websocket_api.async_register_command(hass, ws_tile_type)
    hass.data.setdefault(DOMAIN, {})["kachelart_ws"] = True
