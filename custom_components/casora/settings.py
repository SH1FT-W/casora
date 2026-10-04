"""Persönliche Einstellungen (Studio → „Persönliches“), gespeichert in .storage/casora.settings.

Früher /config/www/casora/einstellungen.js (window.CASORA_SETTINGS). Die Datei gilt
weiter, solange hier nichts gespeichert ist; das Studio übernimmt sie beim ersten
Öffnen der Seite. Abruf über den angemeldeten WebSocket – anders als /local ist das
nicht ohne Anmeldung lesbar.

  casora/settings/get  → {"settings": {...}, "stored": bool, "price_kwh": float|None,
                          "price_source": "option"|"energy"|None, "price_entity": str|None,
                          "energy_price_kwh": float|None, "energy_price_entity": str|None}
                         (jeder angemeldete Nutzer; Strompreis für Kosten in Geräte-Popups: Casora-Option,
                          sonst Netzbezug aus HAs Energie-Dashboard, bei einer Preis-Entität deren ID)
  casora/settings/set  ← {"settings": {...}}                    (nur Admins)
  casora/backup/dashboard ← {"name", "url_path"[, "mobile_url_path", "title"] | "data"} → {"path"}       (nur Admins)
  casora/backup/umzug_phones ← {["sources"]} → {"backups": [{file, url_path, title, time, mobile}]}  (nur Admins, nur lesen)
  casora/ki/merge_template ← {"name", "mine", "casora"} → {"template", "changes"}  (nur Admins)
  casora/ki/adapt_card ← {"card", "context"} → {"card", "changes"}  (nur Admins)
  casora/ki/models     → {"best": {...}|None, "all": [...]}      (nur Admins)
  casora/ki/basis      ← {"rooms", "loose"} → {"rooms"}          (nur Admins)
  casora/ki/upgrade    ← {} → {"options"} | {"entry_id", "model"} → {"entity_id", "best"}  (nur Admins)
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_KEY = f"{DOMAIN}.settings"
STORAGE_VERSION = 1
# Nur diese Bereiche kennt Casora; Unbekanntes wird nicht gespeichert.
SECTIONS = ("waste", "calendars", "notify", "scenes", "contacts", "media", "night_entity", "ebike", "umzug", "basis", "welcome")


def _store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "settings_store" not in data:
        data["settings_store"] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    return data["settings_store"]


async def async_load_settings(hass: HomeAssistant) -> dict[str, Any] | None:
    return await _store(hass).async_load()


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


def entity_price(hass: HomeAssistant, entity_id: str) -> float | None:
    """Zustand einer Preis-Entität in €/kWh (€/MWh und €/Wh werden umgerechnet)."""
    st = hass.states.get(entity_id)
    if st is None:
        return None
    n = _num(st.state)
    if n is None:
        return None
    unit = str((st.attributes or {}).get("unit_of_measurement") or "").replace(" ", "").lower()
    if unit.endswith("/mwh"):
        n = n / 1000
    elif unit.endswith("/wh"):
        n = n * 1000
    return round(n, 6)


def grid_price(prefs: dict | None) -> tuple[float | None, str | None]:
    """Erster Netzbezugs-Preis aus HAs Energie-Einstellungen: (fester Preis, Preis-Entität).

    Ab HA 2026.x steht der Preis direkt an der Netzquelle (type grid, entity_energy_price /
    number_energy_price); ältere Einstellungen haben ihn je Tarif unter flow_from. Bei mehreren
    Netzquellen oder Tarifen gilt der erste mit Preis.
    """
    for src in (prefs or {}).get("energy_sources") or []:
        if not isinstance(src, dict) or src.get("type") != "grid":
            continue
        for tarif in [src] + [x for x in (src.get("flow_from") or []) if isinstance(x, dict)]:
            ent = tarif.get("entity_energy_price")
            if isinstance(ent, str) and ent:
                return None, ent
            num = _num(tarif.get("number_energy_price"))
            if num is not None:
                return num, None
    return None, None


async def energy_price(hass: HomeAssistant) -> tuple[float | None, str | None]:
    """Preis aus dem Energie-Dashboard (fester Wert oder aktueller Zustand der Preis-Entität)."""
    try:
        from homeassistant.components.energy.data import async_get_manager

        manager = await async_get_manager(hass)
    except Exception:  # noqa: BLE001 – ohne Energie-Dashboard eben kein Preis
        return None, None
    num, ent = grid_price(getattr(manager, "data", None))
    if ent:
        return entity_price(hass, ent), ent
    return num, None


async def price_info(hass: HomeAssistant) -> dict[str, Any]:
    """Strompreis für Kosten in Geräte-Popups: Casora-Option vor HA-Energie, sonst keiner.

    price_kwh/price_source/price_entity gelten; energy_* zeigt das Studio als Hinweis,
    wenn das Feld leer ist.
    """
    entries = hass.config_entries.async_entries(DOMAIN)
    opt = entries[0].options.get("price_kwh") if entries else None
    opt = _num(opt) if isinstance(opt, (int, float)) else None
    e_num, e_ent = await energy_price(hass)
    out = {"energy_price_kwh": e_num, "energy_price_entity": e_ent}
    if opt is not None:
        out.update(price_kwh=opt, price_source="option", price_entity=None)
    elif e_num is not None or e_ent:
        out.update(price_kwh=e_num, price_source="energy", price_entity=e_ent)
    else:
        out.update(price_kwh=None, price_source=None, price_entity=None)
    return out


@websocket_api.websocket_command({vol.Required("type"): "casora/settings/get"})
@websocket_api.async_response
async def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    data = await async_load_settings(hass)
    connection.send_result(msg["id"], {"settings": data or {}, "stored": data is not None,
                                       **(await price_info(hass))})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/settings/set",
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    clean = {k: v for k, v in msg["settings"].items() if k in SECTIONS and v not in (None, "", [], {})}
    await _store(hass).async_save(clean)
    connection.send_result(msg["id"], {"settings": clean, "stored": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/backup/dashboard",
    vol.Required("name"): str,
    vol.Optional("data"): dict,
    vol.Optional("url_path"): str,
    vol.Optional("mobile_url_path"): str,
    vol.Optional("title"): str,
})
@websocket_api.async_response
async def ws_backup(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Sicherung eines Dashboards vor dem Umzug: /config/casora_sicherungen/umzug_<zeit>_<name>.json.

    Mit url_path liest HA das Dashboard selbst: große Dashboards (Desktop + Handy über 4 MB)
    passen nicht in eine WebSocket-Nachricht – HA trennte dann die Verbindung."""
    import json
    import os
    import re

    from homeassistant.util import dt as dt_util

    from .versions import _load

    data = msg.get("data")
    if msg.get("url_path"):
        config = await _load(hass, msg["url_path"])
        if config is None and data is None:
            connection.send_error(msg["id"], "not_found", f"dashboard {msg['url_path']} not found")
            return
        if config is not None:
            data = {"url_path": msg["url_path"], "title": msg.get("title") or msg["url_path"], "config": config,
                    "mobile": await _load(hass, msg.get("mobile_url_path"))}
    if data is None:
        connection.send_error(msg["id"], "invalid_format", "url_path or data required")
        return

    name = re.sub(r"[^a-z0-9_-]+", "-", msg["name"].lower()).strip("-") or "dashboard"
    folder = hass.config.path("casora_sicherungen")
    path = os.path.join(folder, f"umzug_{dt_util.now().strftime('%Y-%m-%d_%H%M%S')}_{name}.json")

    def _write() -> None:
        os.makedirs(folder, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)

    await hass.async_add_executor_job(_write)
    connection.send_result(msg["id"], {"path": os.path.relpath(path, hass.config.config_dir)})


UMZUG_FILE = r"^umzug_(\d{4}-\d{2}-\d{2}_\d{6})_(.+)\.json$"


def read_umzug_phones(folder: str, sources: list[str] | None = None, limit: int = 8) -> list[dict[str, Any]]:
    """Handy-Layouts aus den Umzugs-Sicherungen, je Quell-Dashboard die neueste.

    Nur die Ansichten (ohne button_card_templates): das Studio braucht daraus die Kachelgrößen
    („Size on phone“), die ältere Umzüge nicht an die Raum-Kacheln übertragen hatten.
    """
    import json
    import os
    import re

    try:
        names = sorted(os.listdir(folder), reverse=True)
    except OSError:
        return []
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for name in names:
        m = re.match(UMZUG_FILE, name)
        if not m or len(out) >= limit:
            continue
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        mobile = data.get("mobile") if isinstance(data, dict) else None
        url = str(data.get("url_path") or m.group(2)) if isinstance(data, dict) else m.group(2)
        if not isinstance(mobile, dict) or not isinstance(mobile.get("views"), list) or url in seen:
            continue
        if sources and url not in sources:
            continue
        seen.add(url)
        out.append({"file": name, "url_path": url, "title": data.get("title") or url, "time": m.group(1),
                    "mobile": {k: v for k, v in mobile.items() if k != "button_card_templates"}})
    return out


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/backup/umzug_phones",
    vol.Optional("sources"): [str],
})
@websocket_api.async_response
async def ws_umzug_phones(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Handy-Layouts der Umzugs-Sicherungen (nur lesen) → {"backups": [{file, url_path, title, time, mobile}]}."""
    folder = hass.config.path("casora_sicherungen")
    backups = await hass.async_add_executor_job(read_umzug_phones, folder, msg.get("sources"))
    connection.send_result(msg["id"], {"backups": backups})


def _json_obj(value: Any) -> Any:
    """JSON-Objekt aus einer KI-Antwort – auch mit ```-Zaun oder Text davor/danach."""
    import json

    raw = str(value or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    try:
        return json.loads(raw)
    except ValueError:
        # Text vor/nach dem Objekt (z. B. „Hier die Vorlage:“) – nur das äußere {…} nehmen.
        start, end = raw.find("{"), raw.rfind("}")
        try:
            return json.loads(raw[start:end + 1]) if 0 <= start < end else None
        except ValueError:
            return None


MERGE_STRUCTURE = {
    "ops": {"required": True, "selector": {"text": {"multiline": True}},
            "description": "Die Änderungen an der CASORA-FASSUNG als JSON-Liste"},
    "changes": {"selector": {"text": {"multiple": True}},
                "description": "Übernommene persönliche Änderungen: kurze, verständliche Sätze für Endnutzer, "
                               "ohne Fachbegriffe, Variablen- oder Entitätsnamen"},
}


def _json_list(value: Any) -> Any:
    """JSON-Liste aus einer KI-Antwort – auch mit ```-Zaun oder Text davor/danach."""
    import json

    raw = str(value or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    try:
        return json.loads(raw)
    except ValueError:
        start, end = raw.find("["), raw.rfind("]")
        try:
            return json.loads(raw[start:end + 1]) if 0 <= start < end else None
        except ValueError:
            return None


def _apply_ops(base: dict, ops: list) -> dict:
    """Änderungen der KI auf Casoras Vorlage anwenden: {"op": "set"|"remove", "path": "a/b/0", "value": …}."""
    import copy

    out = copy.deepcopy(base)
    for op in ops:
        if not isinstance(op, dict) or op.get("op") not in ("set", "remove"):
            raise ValueError("Unbekannte Änderung")
        parts = [p for p in str(op.get("path") or "").strip("/").split("/") if p != ""]
        if not parts:
            raise ValueError("Änderung ohne Pfad")
        node = out
        for key in parts[:-1]:
            if isinstance(node, list):
                node = node[int(key)]
            else:
                if not isinstance(node.get(key), (dict, list)):
                    node[key] = {}
                node = node[key]
        last = parts[-1]
        if op["op"] == "remove":
            if isinstance(node, list):
                node.pop(int(last))
            else:
                node.pop(last, None)
        elif isinstance(node, list):
            idx = int(last)
            if idx == len(node):
                node.append(op.get("value"))
            else:
                node[idx] = op.get("value")
        else:
            node[last] = op.get("value")
    return out


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/ki/merge_template",
    vol.Required("name"): str,
    vol.Required("mine"): dict,
    vol.Required("casora"): dict,
})
@websocket_api.async_response
async def ws_merge_template(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Umzug: persönliche Änderungen einer alten Hemma-Vorlage in Casoras aktuelle Fassung übertragen."""
    import json

    from .ki import ai_models, ask_ai

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_set_up", "Casora ist nicht eingerichtet")
        return
    # Nur mit einem starken Modell – ein halb kaputter Umzug ist schlimmer als keiner.
    best = next((m for m in ai_models(hass) if m["ok"]), None)
    if not best:
        connection.send_error(msg["id"], "weak_ai", "Keine ausreichend starke KI eingerichtet")
        return
    lang = "Deutsch" if (hass.config.language or "").startswith("de") else "English"
    instructions = (
        "Du hilfst beim Umzug eines Home-Assistant-Dashboards von Hemma nach Casora. Casora ist die "
        "Weiterentwicklung von Hemma; die Vorlagen sind custom:button-card-Templates (JSON).\n\n"
        f"Vorlage: {msg['name']}\n\n"
        "MEINE FASSUNG ist eine ältere Hemma-Fassung, die der Nutzer persönlich angepasst hat. "
        "CASORA-FASSUNG ist die aktuelle Fassung von Casora. Unterschiede zwischen beiden sind teils "
        "Casoras Weiterentwicklung (neue Technik, umbenannte Variablen --hemma-… → --casora-…, "
        "window.hemma… → window.casora…, hemma_… → casora_…) und teils persönliche Änderungen des Nutzers "
        "(eigene Icons, Farben, Texte, Entitäten, zusätzliche Felder, geänderte Logik oder Styles).\n\n"
        "Aufgabe: Nimm die CASORA-FASSUNG als Grundlage und baue NUR die persönlichen Änderungen aus MEINER "
        "FASSUNG ein, angepasst an Casoras Namen und Aufbau. Casoras Neuerungen bleiben erhalten. Übernimm "
        "nichts, was nur eine ältere Hemma-Fassung ist. JavaScript in [[[ ]]] muss gültig bleiben.\n\n"
        "Gib NICHT die ganze Vorlage zurück, sondern unter ops nur die Änderungen an der CASORA-FASSUNG als "
        'JSON-Liste: [{"op": "set", "path": "variables/icon", "value": …}, {"op": "remove", "path": "…"}]. '
        "path sind die Schlüssel von der Wurzel der CASORA-FASSUNG, durch / getrennt, Listen mit Index "
        "(z. B. styles/card/0). value ist der komplette neue Wert an dieser Stelle (bei JavaScript der ganze "
        "String). Ändere möglichst tief und klein. Keine persönlichen Änderungen: leere Liste []. "
        f"Beschreibe unter changes auf {lang} in höchstens vier kurzen, ganzen Sätzen, welche persönlichen "
        "Änderungen du übernommen hast – für Endnutzer ohne Technikwissen, so wie man es einem Freund "
        "erzählt (z. B. „Das Symbol der Kachel bleibt deine Glühbirne.“ oder „Im Popup bleibt deine "
        "Helligkeitsleiste.“). Keine Fachbegriffe (kein YAML, JSON, Template, Variable, CSS, JavaScript, "
        "Entität), keine Variablen-, Schlüssel- oder Entitätsnamen (nichts wie light.xyz oder icon_color). "
        f"Nenne Dinge mit ihrem Alltagsnamen auf {lang} (z. B. Licht, Jalousie, Kamera). "
        "Nichts übernommen: leere Liste.\n\n"
        "MEINE FASSUNG:\n" + json.dumps(msg["mine"], ensure_ascii=False)
        + "\n\nCASORA-FASSUNG:\n" + json.dumps(msg["casora"], ensure_ascii=False)
    )
    try:
        res = await ask_ai(hass, entries[0], "Casora Umzug: Vorlage anpassen", instructions, MERGE_STRUCTURE,
                           entity=best["entity_id"])
    except Exception as err:  # noqa: BLE001 – dem Studio als Meldung zeigen
        connection.send_error(msg["id"], "ai_failed", str(err))
        return
    ops = _json_list((res or {}).get("ops"))
    if not isinstance(ops, list):
        connection.send_error(msg["id"], "bad_json", "Die KI hat keine gültigen Änderungen geliefert")
        return
    try:
        tpl = _apply_ops(msg["casora"], ops)
    except (ValueError, IndexError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "bad_ops", f"Die Änderungen der KI passen nicht zur Vorlage ({err})")
        return
    changes = (res or {}).get("changes") or []
    if isinstance(changes, str):
        changes = [changes]
    connection.send_result(msg["id"], {"template": tpl, "changes": [str(c) for c in changes][:8], "ops": len(ops)})


ADAPT_STRUCTURE = {
    "card": {"required": True, "selector": {"text": {"multiline": True}},
             "description": "Die angepasste Karte als JSON-Objekt"},
    "changes": {"selector": {"text": {"multiple": True}},
                "description": "Kurze Liste der Änderungen"},
}
ADAPT_MAX_CHARS = 40000
_ENTITY_ID = r"\b(?:alarm_control_panel|automation|binary_sensor|button|calendar|camera|climate|counter|cover|" \
    r"device_tracker|event|fan|humidifier|image|input_boolean|input_button|input_datetime|input_number|" \
    r"input_select|input_text|lawn_mower|light|lock|media_player|number|person|plant|remote|scene|script|" \
    r"select|sensor|siren|sun|switch|text|timer|todo|update|vacuum|valve|water_heater|weather|zone)\.[a-z0-9_]+\b"


def _entity_ids(card: Any) -> set[str]:
    """Alle Entitäten, die in einer Karte vorkommen (auch in Texten und JavaScript)."""
    import json
    import re

    return set(re.findall(_ENTITY_ID, json.dumps(card, ensure_ascii=False)))


def adapt_card_prompt(card: dict, context: dict, lang: str) -> str:
    """Anweisung an die KI: eine eingefügte Lovelace-Karte an Casoras Popup-Stil anpassen."""
    import json

    ctx = {k: str(v)[:120] for k, v in (context or {}).items()
           if k in ("tile_type", "tile_name", "entity", "room", "popup") and v not in (None, "")}
    return (
        "Du passt eine Home-Assistant-Lovelace-Karte an Casora an. Casora ist ein Dashboard aus "
        "custom:button-card-Vorlagen mit Glas-Optik (dunkle, halbtransparente Flächen, weiße Schrift). "
        "Die Karte steht im Popup einer Kachel, UNTER dem Inhalt des Popups.\n\n"
        + ("Kachel: " + json.dumps(ctx, ensure_ascii=False) + "\n\n" if ctx else "")
        + "Regeln:\n"
        "1. Die Funktion bleibt: dieselben Entitäten, Aktionen (tap_action, Dienste), Bedingungen und Daten. "
        "Nichts dazuerfinden, keine Entität entfernen oder umbenennen.\n"
        "2. Das Popup legt jede Karte schon auf eine Glasfläche (ha-card-Hintergrund, Rundung, Schatten "
        "kommen von Casora). Entferne daher eigene Hintergründe, Rahmen, Schatten und Rundungen der äußeren "
        "Karte sowie fest eingestellte Farben, die dazu nicht passen (z. B. weiße/helle Flächen, schwarze "
        "Schrift, grelle Hex-Farben).\n"
        "3. Farben und Maße nur über Casoras CSS-Variablen: Text var(--casora-popup-tiles-text-primary, #fff), "
        "Nebentext var(--casora-popup-tiles-text-secondary, rgba(255,255,255,0.56)), Flächen "
        "var(--casora-popup-row-fill, rgba(255,255,255,0.10)), Rundung var(--casora-popup-row-radius, 20px), "
        "gut var(--casora-popup-ui-good, #30D158), Warnung var(--casora-popup-ui-warn, #FF9F0A), "
        "Fehler var(--casora-popup-ui-bad, #FF453A), Akzent/Aktion var(--casora-popup-ui-action, #00C3D0), "
        "Trennlinie var(--casora-popup-ui-divider, rgba(255,255,255,0.08)). "
        "Schrift var(--primary-font-family, system-ui); Abschnittsüberschriften 15px, Gewicht 600.\n"
        "4. Eigene Styles in custom:button-card über styles:, sonst über card_mod: {style: …} "
        "(Casora versteht card_mod-Syntax). JavaScript in [[[ ]]] muss gültig bleiben.\n"
        "5. Beschriftungen, Titel (title, name, header) und Einheiten-Texte IMMER auf " + lang + " übersetzen "
        "bzw. neu formulieren, kurz und klar – auch wenn sie schon gesetzt sind. Nur Entitäts-IDs nicht "
        "übersetzen.\n"
        "6. Ist die Karte nur eine einfache Kachel für EINE Entität (tile, button, entity oder eine schlichte "
        "custom:button-card), darfst du sie in eine custom:button-card mit der passenden Casora-Vorlage "
        "umwandeln: template: casora_light (light), casora_switch (switch/input_boolean), casora_cover (cover), "
        "casora_fan (fan), casora_lock (lock), casora_thermostat (climate), casora_media (media_player), "
        "casora_vacuum (vacuum), sonst casora_entity. Dann nur entity, name und nötige variables setzen, "
        "keine eigenen Styles. Alles andere bleibt beim bisherigen Kartentyp.\n"
        "7. Ist schon alles passend, gib die Karte unverändert zurück.\n\n"
        "Antwort: unter card die komplette angepasste Karte als JSON-Objekt (mit type). Unter changes in "
        f"wenigen kurzen Punkten auf {lang}, was du geändert hast (leer, wenn nichts).\n\n"
        "KARTE:\n" + json.dumps(card, ensure_ascii=False)
    )


def adapt_card_result(card: dict, res: Any, lang: str) -> tuple[dict, list[str]]:
    """Antwort der KI prüfen: gültige Karte mit type, verlorene Entitäten als Hinweis. ValueError sonst."""
    raw = (res or {}).get("card") if isinstance(res, dict) else None
    out = raw if isinstance(raw, dict) else _json_obj(raw)
    # Manche Modelle packen die Karte noch einmal ein: {"card": {...}}.
    if isinstance(out, dict) and "type" not in out and isinstance(out.get("card"), dict):
        out = out["card"]
    if not isinstance(out, dict) or not isinstance(out.get("type"), str) or not out["type"].strip():
        raise ValueError("Die KI hat keine gültige Karte geliefert")
    changes = res.get("changes") if isinstance(res, dict) else None
    if isinstance(changes, str):
        changes = [changes]
    notes = [str(c).strip() for c in (changes or []) if str(c).strip()][:8]
    lost = sorted(_entity_ids(card) - _entity_ids(out))
    if lost:
        head = "Nicht mehr enthalten" if lang == "Deutsch" else "No longer included"
        notes.insert(0, f"⚠ {head}: {', '.join(lost[:6])}")
    return out, notes


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/ki/adapt_card",
    vol.Required("card"): dict,
    vol.Optional("context", default={}): dict,
})
@websocket_api.async_response
async def ws_adapt_card(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Studio → Kachel → Popup: eine eingefügte Karte an Casoras Stil anpassen (Funktion bleibt)."""
    import json

    from .ki import ai_models, ask_ai

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_set_up", "Casora ist nicht eingerichtet")
        return
    best = next((m for m in ai_models(hass) if m["ok"]), None)
    if not best:
        connection.send_error(msg["id"], "weak_ai", "Keine ausreichend starke KI eingerichtet")
        return
    card = msg["card"]
    if not isinstance(card.get("type"), str):
        connection.send_error(msg["id"], "bad_card", "Eine Karte braucht type")
        return
    if len(json.dumps(card, ensure_ascii=False)) > ADAPT_MAX_CHARS:
        connection.send_error(msg["id"], "too_big", "Die Karte ist für die KI zu groß")
        return
    lang = "Deutsch" if (hass.config.language or "").startswith("de") else "English"
    try:
        res = await ask_ai(hass, entries[0], "Casora: Karte anpassen", adapt_card_prompt(card, msg["context"], lang),
                           ADAPT_STRUCTURE, entity=best["entity_id"])
    except Exception as err:  # noqa: BLE001 – dem Studio als Meldung zeigen
        connection.send_error(msg["id"], "ai_failed", str(err))
        return
    try:
        out, notes = adapt_card_result(card, res, lang)
    except ValueError as err:
        connection.send_error(msg["id"], "bad_json", str(err))
        return
    connection.send_result(msg["id"], {"card": out, "changes": notes})


BASIS_STRUCTURE = {
    "plan": {"required": True, "selector": {"text": {"multiline": True}},
             "description": "Die Räume mit ihren Kacheln als JSON-Objekt"},
}


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/ki/basis",
    vol.Required("rooms"): list,
    vol.Optional("loose", default=[]): list,
})
@websocket_api.async_response
async def ws_basis(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Neues Dashboard: die automatisch gefüllten Räume von einer KI verfeinern lassen."""
    import json

    from .ki import ai_models, ask_ai

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_set_up", "Casora ist nicht eingerichtet")
        return
    best = next((m for m in ai_models(hass) if m["ok"]), None)
    if not best:
        connection.send_error(msg["id"], "weak_ai", "Keine ausreichend starke KI eingerichtet")
        return
    lang = "Deutsch" if (hass.config.language or "").startswith("de") else "English"
    instructions = (
        "Du richtest ein Home-Assistant-Dashboard (Casora) ein. Jeder Raum ist eine Seite mit Kacheln. "
        "Casora hat die Räume schon automatisch gefüllt (RÄUME). GERÄTE OHNE RAUM hatten in Home Assistant "
        "keinen Bereich.\n\n"
        "Aufgabe:\n"
        "1. Ordne Geräte ohne Raum dem wahrscheinlich richtigen Raum zu (nach Name). Passt keiner, lass sie weg.\n"
        "2. Gib jeder Kachel einen kurzen, klaren Namen auf " + lang + " (max. 3 Wörter, ohne den Raumnamen, "
        "z. B. „Deckenlicht“ statt „Hue color lamp 2“). Gruppen-Kacheln (mehrere entities) behalten ihren Namen.\n"
        "3. Setze on=false für Kacheln, die man auf einem Dashboard nicht bedienen will "
        "(z. B. Test- oder Hilfsgeräte).\n"
        "4. Behalte die Reihenfolge der Räume. In einem Raum: Licht, Heizung, Luft, Jalousien, Medien, Geräte, Rest.\n"
        "Home ist die Startseite mit Favoriten – dort nichts dazunehmen.\n"
        "Nur keys aus den Listen verwenden, nichts erfinden.\n\n"
        'Antwort als JSON-Objekt: {"rooms": [{"name": "<Raum genau wie in RÄUME>", '
        '"tiles": [{"key": "<key>", "name": "<Name>", "on": true}]}]}\n\n'
        "RÄUME:\n" + json.dumps(msg["rooms"], ensure_ascii=False)
        + "\n\nGERÄTE OHNE RAUM:\n" + json.dumps(msg["loose"], ensure_ascii=False)
    )
    try:
        res = await ask_ai(hass, entries[0], "Casora Einrichtung: Räume füllen", instructions, BASIS_STRUCTURE,
                           entity=best["entity_id"])
    except Exception as err:  # noqa: BLE001 – dem Studio als Meldung zeigen
        connection.send_error(msg["id"], "ai_failed", str(err))
        return
    plan = _json_obj((res or {}).get("plan"))
    if not isinstance(plan, dict) or not isinstance(plan.get("rooms"), list):
        connection.send_error(msg["id"], "bad_json", "Die KI hat keinen gültigen Plan geliefert")
        return
    connection.send_result(msg["id"], {"rooms": plan["rooms"]})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "casora/ki/models"})
@callback
def ws_ai_models(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Welche KI Casora für anspruchsvolle Aufgaben nähme (die stärkste ausreichende) und alle übrigen."""
    from .ki import ai_models

    models = ai_models(hass)
    connection.send_result(msg["id"], {"best": next((m for m in models if m["ok"]), None), "all": models})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "casora/ki/upgrade",
    vol.Optional("entry_id"): str,
    vol.Optional("model"): str,
})
@websocket_api.async_response
async def ws_ai_upgrade(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Ohne entry_id: welche starke KI Casora anlegen könnte. Mit entry_id + model: anlegen."""
    from .ki import ai_models, ai_upgrade_apply, ai_upgrade_options

    if "entry_id" not in msg:
        connection.send_result(msg["id"], {"options": await ai_upgrade_options(hass)})
        return
    try:
        ent = await ai_upgrade_apply(hass, msg["entry_id"], msg.get("model") or "")
    except Exception as err:  # noqa: BLE001 – dem Studio als Meldung zeigen
        connection.send_error(msg["id"], "upgrade_failed", str(err))
        return
    models = ai_models(hass)
    connection.send_result(msg["id"], {"entity_id": ent, "best": next((m for m in models if m["ok"]), None)})


@callback
def async_setup_settings(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("settings_ws"):
        return
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_set)
    websocket_api.async_register_command(hass, ws_backup)
    websocket_api.async_register_command(hass, ws_umzug_phones)
    websocket_api.async_register_command(hass, ws_merge_template)
    websocket_api.async_register_command(hass, ws_adapt_card)
    websocket_api.async_register_command(hass, ws_ai_models)
    websocket_api.async_register_command(hass, ws_basis)
    websocket_api.async_register_command(hass, ws_ai_upgrade)
    hass.data.setdefault(DOMAIN, {})["settings_ws"] = True
