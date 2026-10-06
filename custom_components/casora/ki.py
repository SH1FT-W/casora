"""Casora-KI: Coaches, Kamera-/Pflanzen-/Aquarium-Doktor, Rad-Check, Update-Analyse, Rezept der Woche.

Früher lagen diese Funktionen als Skripte, Automationen und Template-Sensoren in
eigener Konfiguration (packages/casora_*.yaml) – mit festen Entitäten.
Hier findet Casora die Daten selbst:

  • Energie-Coach  – Netz, Solar, Einspeisung und Verbraucher aus den
                     Energie-Einstellungen von Home Assistant
  • Heizungs-Coach – alle Thermostate je Bereich, Heizdauer und „Heizen bei
                     offenem Fenster“ aus dem Verlauf
  • Lüftungs-Coach – Feuchte, CO₂ und Fensterkontakte je Bereich
  • Aquarium-Doktor – Wassertemperatur, Technik, Licht und Lecksensor eines
                     Beckens (die Entitäten nennt die Aquarium-Kachel beim Aufruf)
  • Rad-Check      – Akku, Kilometer, Service und Fahrten des E-Bikes (die
                     Entitäten nennt das E-Bike-Popup beim Aufruf)
  • Kamera, Pflanzen, Updates, Rezept – Abläufe in ki/*.yaml

Die KI ist die Standard-KI aus Einstellungen → KI-Aufgaben (oder die in den
Casora-Optionen gewählte). Ergebnisse gehen wie bisher als Events
(casora_*_result) an die Ergebnis-Sensoren; das Dashboard bleibt unverändert.

Gibt es die alten Template-Sensoren noch (eigene Pakete), bleibt Casora für
diese Funktion passiv: keine eigenen Sensoren, keine Zeitpläne – die Dienste
stehen trotzdem bereit und füttern dieselben Sensoren.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta
from functools import partial
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Context, HomeAssistant, ServiceCall, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.script import Script, async_validate_actions_config
from homeassistant.util import dt as dt_util
from homeassistant.util.yaml import load_yaml

from .const import DOMAIN, UPDATE_REPO, VERSION
from .release_notes import notes_for_ai
from .update_source import fetch_releases

_LOGGER = logging.getLogger(__name__)

# Funktion → Ergebnis-Sensor (object_id), Event, Dienst
FEATURES: dict[str, dict[str, str]] = {
    "energie": {"object": "casora_energie_coach", "event": "casora_energy_coach_result", "service": "energie_coach"},
    "heizung": {"object": "casora_heizungs_coach", "event": "casora_heating_coach_result", "service": "heizungs_coach"},
    "lueftung": {"object": "casora_lueftungs_coach", "event": "casora_vent_coach_result", "service": "lueftungs_coach"},
    "rezept": {"object": "casora_rezept_der_woche", "event": "casora_recipe_result", "service": "rezept_neu"},
    "kamera": {"object": "casora_kamera_ki", "event": "casora_cam_ai_result", "service": "kamera_beschreiben"},
    "pflanzen": {"object": "casora_pflanzen_ki", "event": "casora_plant_ai_result", "service": "pflanzen_doktor"},
    "update": {"object": "casora_update_ki_analyse", "event": "casora_update_ai_result", "service": "update_pruefen"},
    "aquarium": {"object": "casora_aquarium_ki", "event": "casora_aquarium_ai_result", "service": "aquarium_doktor"},
    "ebike": {"object": "casora_ebike_ki", "event": "casora_ebike_ai_result", "service": "ebike_check"},
}

# Frühere Template-Sensoren aus eigenen Casora-Paketen (unique_id) und ihre Events.
# Gibt es sie noch, laufen deren Automationen – Casora plant dann nichts selbst,
# hört aber auf ihre Events, damit die Casora-Sensoren aktuell bleiben.
LEGACY: dict[str, tuple[str, str]] = {
    "energie": ("hemma_energie_coach", "hemma_energy_coach_result"),
    "heizung": ("hemma_heizungs_coach", "hemma_heating_coach_result"),
    "lueftung": ("hemma_lueftungs_coach", "hemma_vent_coach_result"),
    "rezept": ("hemma_rezept_der_woche", "hemma_recipe_result"),
    "kamera": ("hemma_kamera_ki", "hemma_cam_ai_result"),
    "pflanzen": ("hemma_pflanzen_ki", "hemma_plant_ai_result"),
    "update": ("hemma_update_ki_analyse", "hemma_update_ai_result"),
    "aquarium": ("hemma_aquarium_ki", "hemma_aquarium_ai_result"),
    "ebike": ("hemma_ebike_ki", "hemma_ebike_ai_result"),
}
LEGACY_UPDATE_EVENTS = ("hemma_update_ai_prune", "hemma_update_ai_ack")

SEQUENCES = ("kamera", "pflanzen", "update", "rezept")
NO_AI = "Keine KI eingerichtet (Einstellungen → KI-Aufgaben)"
OUTDOOR = re.compile(r"outdoor|aussen|außen|outside|draussen|draußen", re.I)
WINDOW_CLASSES = {"window", "door", "garage_door", "opening"}
WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

# Optionen (Casora → Konfigurieren)
OPT_AI = "ai_task_entity"
OPT_AI_WEB = "ai_task_web_entity"
OPT_OUT_T = "outdoor_temperature"
OPT_OUT_RH = "outdoor_humidity"
OPT_PRICE = "price_kwh"
OPT_NOTES = "ki_hinweise"
# Zielliste für „Zutaten auf die Einkaufsliste“ (Rezept der Woche); leer = Cookidoo, sonst erste Liste.
OPT_RECIPE_LIST = "rezept_liste"
# Bis 1.0.2: ein Schalter für alle Zeitpläne (Standard an). Wird beim Start in die
# Zeitpläne je Funktion übernommen (migrate_options) und danach nicht mehr gespeichert.
OPT_AUTO = "ki_auto"

# ── KI-Zeitpläne (1.0.3) ───────────────────────────────────────────────────────
# Je Funktion eine Option: fehlt sie, läuft nichts automatisch (Neuinstallation: kein
# KI-Aufruf ohne Zustimmung). Werte: "auto" = bisheriger Termin, "sun 18:00" = eigener
# Wochentag und Uhrzeit, "18:00" = täglich. Die Knöpfe in den Popups gehen immer.
# Update-Check: "daily" (einmal am Tag), "manual" (nur auf Knopfdruck); fehlt = aus
# (auch keine KI-Zeilen im Update-Popup).
PLAN_OPTS: dict[str, str] = {
    "energie": "ki_plan_energie",
    "heizung": "ki_plan_heizung",
    "lueftung": "ki_plan_lueftung",
    "rezept": "ki_plan_rezept",
}
OPT_PLAN_UPDATE = "ki_plan_update"
# Bisherige Termine: (Wochentag Mo=0, Stunde, Minute)
PLAN_AUTO: dict[str, tuple[int, int, int]] = {
    "energie": (6, 18, 0),    # Sonntag 18 Uhr
    "heizung": (0, 7, 0),     # Montag 7 Uhr (nur in der Heizsaison)
    "lueftung": (5, 10, 0),   # Samstag 10 Uhr
    "rezept": (0, 6, 0),      # Montag 6 Uhr
}
UPDATE_DAILY = (6, 17)        # täglicher Update-Check um 6:17 Uhr
UPDATE_PLANS = ("daily", "manual")
PLAN_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_PLAN_RE = re.compile(r"^(?:(mon|tue|wed|thu|fri|sat|sun)\s+)?([01]?\d|2[0-3]):([0-5]\d)$")


def parse_plan(key: str, value: Any) -> tuple[int | None, int, int] | None:
    """Termin einer Funktion: (Wochentag oder None = täglich, Stunde, Minute); None = aus.

    Unbekannte Werte gelten als aus – lieber kein Lauf als ein ungewollter KI-Aufruf.
    """
    if value in (None, "", "off"):
        return None
    if value == "auto":
        return PLAN_AUTO.get(key)
    m = _PLAN_RE.match(str(value).strip().lower())
    if not m:
        return None
    day = PLAN_DAYS.index(m.group(1)) if m.group(1) else None
    return day, int(m.group(2)), int(m.group(3))


def valid_plan(value: Any) -> bool:
    """Gültiger Wert für eine Zeitplan-Option (aus, auto, eigene Zeit)."""
    return value in (None, "", "off", "auto") or bool(_PLAN_RE.match(str(value).strip().lower()))


def next_run(spec: tuple[int | None, int, int] | None, now: datetime) -> datetime | None:
    """Nächster Lauf nach `now` (lokale Zeit) – für Tests und Anzeigen."""
    if spec is None:
        return None
    day, hour, minute = spec
    cand = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if day is None:
        return cand if cand > now else cand + timedelta(days=1)
    cand += timedelta(days=(day - now.weekday()) % 7)
    return cand if cand > now else cand + timedelta(days=7)


def migrate_options(options: dict[str, Any]) -> dict[str, Any]:
    """ki_auto (bis 1.0.2) → Zeitpläne je Funktion; bestehende Installationen behalten ihr Verhalten.

    ki_auto an (oder nie gesetzt, das war der Standard): alle bisherigen Termine, Update-Check
    täglich statt stündlich. ki_auto aus: nichts automatisch, Update-Check nur auf Knopfdruck
    (die Knöpfe im Update-Popup gab es auch da schon).
    """
    out = dict(options)
    auto = out.pop(OPT_AUTO, True)
    if auto is not False:
        for opt in PLAN_OPTS.values():
            out.setdefault(opt, "auto")
        out.setdefault(OPT_PLAN_UPDATE, "daily")
    else:
        out.setdefault(OPT_PLAN_UPDATE, "manual")
    return out


# Antwortsprache der KI = Sprache von Home Assistant (wie settings.py beim Umzug).
_LANG_NAMES = {
    "de": "Deutsch", "en": "Englisch (English)", "fr": "Französisch (français)", "nl": "Niederländisch (Nederlands)",
    "it": "Italienisch (italiano)", "es": "Spanisch (español)", "pt": "Portugiesisch (português)",
    "da": "Dänisch (dansk)", "sv": "Schwedisch (svenska)", "nb": "Norwegisch (norsk)", "no": "Norwegisch (norsk)",
    "fi": "Finnisch (suomi)", "pl": "Polnisch (polski)", "cs": "Tschechisch (čeština)", "hu": "Ungarisch (magyar)",
    "tr": "Türkisch (Türkçe)", "el": "Griechisch (ελληνικά)", "ru": "Russisch (русский)", "uk": "Ukrainisch (українська)",
    "ja": "Japanisch (日本語)", "zh": "Chinesisch (中文)", "ko": "Koreanisch (한국어)",
}


def answer_language(hass: HomeAssistant) -> str:
    """Sprache für „Antworte auf …“: aus hass.config.language, sonst Deutsch."""
    code = str(getattr(getattr(hass, "config", None), "language", "") or "de").lower()
    return _LANG_NAMES.get(code) or _LANG_NAMES.get(code.split("-")[0]) or f"der Sprache „{code}“"


# ── Hilfen ──────────────────────────────────────────────────────────────────

def is_external(hass: HomeAssistant, key: str) -> bool:
    """Alter Template-Sensor aus eigenen Paketen vorhanden → Casora bleibt passiv."""
    reg = er.async_get(hass)
    return reg.async_get_entity_id("sensor", "template", LEGACY[key][0]) is not None


def ai_entity(hass: HomeAssistant, entry: ConfigEntry, web: bool = False) -> str | None:
    """Gewählte KI, sonst die Standard-KI aus Einstellungen → KI-Aufgaben."""
    opts = entry.options
    ent = (opts.get(OPT_AI_WEB) if web else None) or opts.get(OPT_AI)
    if not ent:
        try:
            from homeassistant.components.ai_task.const import DATA_PREFERENCES

            ent = hass.data[DATA_PREFERENCES].gen_data_entity_id
        except Exception:  # noqa: BLE001 – ai_task nicht geladen
            ent = None
    if not ent:
        ids = sorted(hass.states.async_entity_ids("ai_task"))
        ent = ids[0] if ids else None
    return ent


def _area_id(hass: HomeAssistant, entity_id: str) -> str | None:
    ent = er.async_get(hass).async_get(entity_id)
    if not ent:
        return None
    if ent.area_id:
        return ent.area_id
    if ent.device_id:
        dev = dr.async_get(hass).async_get(ent.device_id)
        return dev.area_id if dev else None
    return None


def _area_name(hass: HomeAssistant, area_id: str | None) -> str | None:
    area = ar.async_get(hass).async_get_area(area_id) if area_id else None
    return area.name if area else None


def _name(hass: HomeAssistant, entity_id: str) -> str:
    st = hass.states.get(entity_id)
    return (st and st.attributes.get("friendly_name")) or entity_id


def _dc(hass: HomeAssistant, entity_id: str) -> str | None:
    st = hass.states.get(entity_id)
    return st.attributes.get("device_class") if st else None


def _num(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "?"
    return f"{value:.{digits}f}".replace(".", ",")


def _is_vehicle(hass: HomeAssistant, entity_id: str) -> bool:
    """Fahrzeuge haben einen device_tracker – deren Außentemperatur zählt nicht."""
    ent = er.async_get(hass).async_get(entity_id)
    if not ent or not ent.device_id:
        return False
    return any(e.domain == "device_tracker" for e in er.async_entries_for_device(er.async_get(hass), ent.device_id))


def _outdoor(hass: HomeAssistant, entry: ConfigEntry, device_class: str, option: str) -> str | None:
    if entry.options.get(option):
        return entry.options[option]
    hits = []
    for st in hass.states.async_all("sensor"):
        if st.attributes.get("device_class") != device_class or st.state in ("unknown", "unavailable"):
            continue
        area = _area_name(hass, _area_id(hass, st.entity_id)) or ""
        text = f"{st.entity_id} {st.attributes.get('friendly_name', '')} {area}"
        if OUTDOOR.search(text) and not _is_vehicle(hass, st.entity_id):
            hits.append(st.entity_id)
    hits.sort(key=lambda e: (0 if "weather" in e or "wetter" in e else 1, e))
    return hits[0] if hits else None


def _notes(entry: ConfigEntry) -> str:
    text = (entry.options.get(OPT_NOTES) or "").strip()
    return f"\n\nHinweise des Haushalts (beachten): {text}" if text else ""


def _local(ts: Any) -> datetime:
    if isinstance(ts, (int, float)):
        return dt_util.as_local(dt_util.utc_from_timestamp(ts))
    if isinstance(ts, str):
        return dt_util.as_local(dt_util.parse_datetime(ts))
    return dt_util.as_local(ts)


async def _stats(hass: HomeAssistant, ids, start: datetime, period: str, types: set[str], units=None) -> dict:
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.statistics import statistics_during_period

    ids = {i for i in ids if i}
    if not ids:
        return {}
    return await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, None, ids, period, units, types
    )


async def _history(hass: HomeAssistant, ids, start: datetime, attrs: bool = False) -> dict:
    from homeassistant.components.recorder import get_instance, history

    ids = [i for i in ids if i]
    if not ids:
        return {}
    return await get_instance(hass).async_add_executor_job(
        partial(
            history.get_significant_states, hass, start, None, ids,
            include_start_time_state=True, significant_changes_only=False,
            minimal_response=False, no_attributes=not attrs,
        )
    )


def _intervals(states, start: datetime, pred) -> list[tuple[datetime, datetime]]:
    """Zeiträume, in denen pred(state) zutrifft (auf [start, jetzt] begrenzt)."""
    now = dt_util.utcnow()
    out: list[tuple[datetime, datetime]] = []
    states = list(states or [])
    for i, st in enumerate(states):
        if not pred(st):
            continue
        a = max(st.last_changed, start)
        b = states[i + 1].last_changed if i + 1 < len(states) else now
        if b > a:
            out.append((a, b))
    return out


def _hours(iv) -> float:
    return sum((b - a).total_seconds() for a, b in iv) / 3600


def _overlap(xs, ys) -> float:
    total = 0.0
    for a1, b1 in xs:
        for a2, b2 in ys:
            a, b = max(a1, a2), min(b1, b2)
            if b > a:
                total += (b - a).total_seconds()
    return total / 3600


def _entities_in_area(hass: HomeAssistant, area_id: str, domain: str, classes: set[str]) -> list[str]:
    return sorted(
        st.entity_id for st in hass.states.async_all(domain)
        if st.attributes.get("device_class") in classes and _area_id(hass, st.entity_id) == area_id
        and st.state not in ("unknown", "unavailable")
    )


# ── Modell hinter einer KI-Aufgabe ────────────────────────────────────────────
# Anspruchsvolle Aufgaben (Vorlagen beim Umzug zusammenführen) laufen nur mit einem
# starken Modell. HA speichert das Modell im Unterzugang der Integration (chat_model);
# ohne eigene Wahl gilt die Empfehlung der Integration (RECOMMENDED_CHAT_MODEL).
# Mindestens: Claude Sonnet 4.5 / jede Opus- oder Fable-Fassung, GPT-5, Gemini 2.5 Pro.
# Neuere Versionen zählen automatisch mit.
_INTEGRATION_CONST = {
    "anthropic": "homeassistant.components.anthropic.const",
    "openai_conversation": "homeassistant.components.openai_conversation.const",
    "google_generative_ai_conversation": "homeassistant.components.google_generative_ai_conversation.const",
}


def _ver(text: str) -> float:
    parts = re.findall(r"\d+", text)[:2]
    if not parts:
        return 0.0
    major = int(parts[0])
    minor = int(parts[1]) if len(parts) > 1 and len(parts[1]) < 3 else 0  # kein Datum (20250514) als Nebenversion
    return major + minor / 10


def model_rank(domain: str, model: str | None) -> tuple[int, str]:
    """(Rang, Anzeigename). Rang 0 = zu schwach oder unbekannt; höher = stärker."""
    m = (model or "").lower()
    if domain == "casora_mock":
        return 1, "Casora Test-KI"
    if "claude" in m or domain == "anthropic":
        fam = next((f for f in ("opus", "fable", "sonnet", "haiku") if f in m), "")
        rest = m.replace("claude", "").replace(fam, "")
        v = _ver(rest)
        name = "Claude " + fam.capitalize() + (" " + (f"{v:g}") if v else "")
        if fam == "fable" or (fam == "opus" and (v >= 4 or not v)):  # Fable: jede Fassung
            return 300 + int(v * 10), name
        if fam == "sonnet" and v >= 4.5:
            return 200 + int(v * 10), name
        return 0, name.strip() or model or "Claude"
    if m.startswith("gpt") or domain == "openai_conversation":
        v = _ver(m)
        name = (model or "ChatGPT").replace("gpt", "GPT")
        if v >= 5 and not re.search(r"mini|nano", m):
            return 150 + int(v * 10), name
        return 0, name
    if "gemini" in m or domain == "google_generative_ai_conversation":
        v = _ver(m)
        base = (model or "gemini").rsplit("/", 1)[-1]  # Google liefert „models/gemini-…“
        name = " ".join(w if w[:1].isdigit() else w.capitalize() for w in base.split("-"))
        if "pro" in m and v >= 2.5:
            return 100 + int(v * 10), name
        return 0, name
    return 0, model or domain


def ai_models(hass: HomeAssistant) -> list[dict]:
    """Alle KI-Aufgaben mit Modell und Rang, stärkste zuerst."""
    import importlib

    reg = er.async_get(hass)
    out = []
    for eid in sorted(hass.states.async_entity_ids("ai_task")):
        ent = reg.async_get(eid)
        domain = ent.platform if ent else ""
        model = None
        if ent and ent.config_entry_id:
            ce = hass.config_entries.async_get_entry(ent.config_entry_id)
            sub = ce.subentries.get(ent.config_subentry_id) if ce and ent.config_subentry_id else None
            data = dict(sub.data) if sub else dict(ce.options) if ce else {}
            model = data.get("chat_model")
            if not model and domain in _INTEGRATION_CONST:
                try:
                    const = importlib.import_module(_INTEGRATION_CONST[domain])
                except ImportError:
                    const = None
                # OpenAI/Google: RECOMMENDED_CHAT_MODEL; Anthropic: DEFAULT["chat_model"]
                model = getattr(const, "RECOMMENDED_CHAT_MODEL", None) or (
                    getattr(const, "DEFAULT", None) or {}).get("chat_model")
        rank, label = model_rank(domain, model)
        st = hass.states.get(eid)
        out.append({"entity_id": eid, "name": (st.attributes.get("friendly_name") if st else None) or eid,
                    "model": model, "label": label, "rank": rank, "ok": rank > 0})
    out.sort(key=lambda x: -_preference(x["model"], x["rank"]))
    return out


def _preference(model: str | None, rank: int) -> int:
    """Reihenfolge der Wahl: ausreichende Sonnet-Modelle vor stärkeren (teureren) wie Opus.

    Für Casoras KI-Aufgaben (Unterschiede finden, Räume sortieren) reicht Sonnet und ist
    günstiger und schneller. Wer Opus will, stellt seine KI-Aufgabe selbst darauf um."""
    if rank <= 0:
        return rank
    return rank + (1000 if "sonnet" in str(model or "").lower() else 0)


# ── Starke KI anlegen („Casora KI“) ───────────────────────────────────────────
# Ist keine KI-Aufgabe stark genug, legt Casora in derselben Integration eine eigene an –
# mit dem stärksten Modell, das der Anbieter gerade anbietet. Die bestehende KI-Aufgabe
# bleibt unverändert (andere Automationen nutzen sie weiter mit ihrem Modell).
_NOT_CHAT = re.compile(r"codex|audio|realtime|image|search|tts|transcribe|embed|moderation|instruct|live|computer")
_OPENAI_PRO = re.compile(r"-pro(-|$)")  # GPT-…-Pro: nur über die Responses-API und sehr teuer
CASORA_AI_TITLE = "Casora KI"


async def _provider_models(hass: HomeAssistant, entry: ConfigEntry) -> list[str]:
    """Modell-IDs, die der Anbieter gerade anbietet (leer, wenn er nicht antwortet)."""
    rt = getattr(entry, "runtime_data", None)
    try:
        if entry.domain == "anthropic":
            return [m.id for m in (getattr(rt, "data", None) or [])]
        if entry.domain == "openai_conversation":
            page = await rt.models.list()
            return [m.id for m in getattr(page, "data", [])]
        if entry.domain == "google_generative_ai_conversation":
            pager = await rt.aio.models.list(config={"query_base": True})
            return [m.name async for m in pager]
    except Exception:  # noqa: BLE001 – Anbieter nicht erreichbar: dann kein Vorschlag
        _LOGGER.debug("Casora: Modelle von %s nicht lesbar", entry.domain, exc_info=True)
    return []


async def ai_upgrade_options(hass: HomeAssistant) -> list[dict]:
    """Je eingerichteter KI-Integration das stärkste ausreichende Modell."""
    out = []
    for domain in _INTEGRATION_CONST:
        for entry in hass.config_entries.async_loaded_entries(domain):
            ids = [m for m in await _provider_models(hass, entry) if not _NOT_CHAT.search(m.split("/")[-1])
                   and not (domain == "openai_conversation" and _OPENAI_PRO.search(m))]
            ranked = sorted(((model_rank(domain, m), m) for m in ids), key=lambda x: -_preference(x[1], x[0][0]))
            best = next(((r, m) for r, m in ranked if r[0] > 0), None)
            if best:
                out.append({"entry_id": entry.entry_id, "domain": domain, "provider": entry.title,
                            "model": best[1], "label": best[0][1]})
    return out


async def ai_upgrade_apply(hass: HomeAssistant, entry_id: str, model: str) -> str | None:
    """Legt „Casora KI“ mit diesem Modell an; gibt die neue ai_task-Entität zurück."""
    import asyncio
    from types import MappingProxyType

    from homeassistant.config_entries import ConfigSubentry

    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry or entry.domain not in _INTEGRATION_CONST:
        raise ValueError("Unbekannte KI-Integration")
    data = {"recommended": False, "chat_model": model, "max_tokens": 32000}
    existing = next((s for s in entry.subentries.values()
                     if s.subentry_type == "ai_task_data" and s.title == CASORA_AI_TITLE), None)
    if existing:
        hass.config_entries.async_update_subentry(entry, existing, data=dict(existing.data) | data)
        sub_id = existing.subentry_id
    else:
        sub = ConfigSubentry(data=MappingProxyType(data), subentry_type="ai_task_data",
                             title=CASORA_AI_TITLE, unique_id=None)
        hass.config_entries.async_add_subentry(entry, sub)
        sub_id = sub.subentry_id
    # Die Integration lädt sich nach der Änderung neu; auf die neue Entität warten.
    reg = er.async_get(hass)
    for _ in range(60):
        await asyncio.sleep(0.5)
        hit = next((e.entity_id for e in reg.entities.values()
                    if e.config_subentry_id == sub_id and e.domain == "ai_task"), None)
        if hit and hass.states.get(hit):
            return hit
    return None


async def ask_ai(hass: HomeAssistant, entry: ConfigEntry, task: str, instructions: str,
                 structure: dict, web: bool = False, attachments: list | None = None,
                 entity: str | None = None) -> dict | None:
    ent = entity or ai_entity(hass, entry, web)
    if not ent:
        raise ValueError(NO_AI)
    data: dict[str, Any] = {"entity_id": ent, "task_name": task, "instructions": instructions, "structure": structure}
    if attachments:
        data["attachments"] = attachments
    resp = await hass.services.async_call("ai_task", "generate_data", data, blocking=True, return_response=True)
    result = (resp or {}).get("data")
    return result if isinstance(result, dict) else None


COACH_STRUCTURE = {
    "zustand": {"required": True, "selector": {"select": {"options": ["gut", "beobachten", "handeln"]}}},
    "fazit": {"required": True, "selector": {"text": {}}},
    "erkenntnisse": {"selector": {"text": {"multiple": True}}},
    "tipps": {"selector": {"text": {"multiple": True}}},
}


# ── Energie-Coach ─────────────────────────────────────────────────────────────

async def energy_context(hass: HomeAssistant, entry: ConfigEntry) -> tuple[str | None, str]:
    try:
        from homeassistant.components.energy.data import async_get_manager

        prefs = (await async_get_manager(hass)).data or {}
    except Exception:  # noqa: BLE001
        prefs = {}
    grid_in, grid_out, solar, battery = [], [], [], False
    price = _num(entry.options.get(OPT_PRICE))
    for src in prefs.get("energy_sources", []):
        kind = src.get("type")
        if kind == "grid":
            for f in src.get("flow_from", []):
                if f.get("stat_energy_from"):
                    grid_in.append(f["stat_energy_from"])
                if price is None:
                    price = _num(f.get("number_energy_price"))
            grid_out += [f["stat_energy_to"] for f in src.get("flow_to", []) if f.get("stat_energy_to")]
            if src.get("stat_energy_from"):  # Format ab HA 2026.x: eine Quelle je Anschluss
                grid_in.append(src["stat_energy_from"])
                if price is None:
                    price = _num(src.get("number_energy_price"))
            if src.get("stat_energy_to"):
                grid_out.append(src["stat_energy_to"])
        elif kind == "solar" and src.get("stat_energy_from"):
            solar.append(src["stat_energy_from"])
        elif kind == "battery":
            battery = True
    devices = [
        (d.get("name") or _name(hass, d["stat_consumption"]), d["stat_consumption"])
        for d in prefs.get("device_consumption", []) if d.get("stat_consumption")
    ]
    if not grid_in:
        return None, "Im Energie-Dashboard ist kein Netzbezug eingerichtet."
    start = dt_util.start_of_local_day() - timedelta(days=7)
    st = await _stats(hass, grid_in + grid_out + solar + [d[1] for d in devices], start, "hour",
                      {"change"}, {"energy": "kWh"})

    hours: dict[datetime, dict[str, float]] = {}

    def add(ids, key):
        for sid in ids:
            for row in st.get(sid, []):
                h = hours.setdefault(_local(row["start"]), {})
                h[key] = h.get(key, 0.0) + (row.get("change") or 0.0)

    add(grid_in, "netz")
    add(grid_out, "einsp")
    add(solar, "solar")
    for name, sid in devices:
        add([sid], "g:" + name)

    days: dict[str, dict[str, float]] = {}
    lines = []
    for ts in sorted(hours):
        h = hours[ts]
        d = days.setdefault(ts.strftime("%d.%m."), {})
        for k in ("netz", "solar", "einsp"):
            d[k] = d.get(k, 0.0) + h.get(k, 0.0)
        running = [f"{k[2:]} {_fmt(v, 2)} kWh" for k, v in h.items() if k.startswith("g:") and v > 0.05]
        if running:
            lines.append(f"- {WEEKDAYS[ts.weekday()]} {ts.strftime('%d.%m. %H')} Uhr: {', '.join(running)}; "
                         f"Netzbezug {_fmt(h.get('netz', 0), 2)} kWh, Solar {_fmt(h.get('solar', 0), 2)} kWh")
    text = (
        f"Strompreis: {_fmt(price, 2) if price is not None else 'unbekannt (rechne mit 0,35)'} €/kWh."
        f"{' Solaranlage vorhanden.' if solar else ' Keine Solaranlage im Energie-Dashboard.'}"
        f"{' Batteriespeicher vorhanden.' if battery else ''}\n"
        "Tagessummen (kWh): " + "; ".join(
            f"{day} Netz {_fmt(v.get('netz'))} / Solar {_fmt(v.get('solar'))} / Einsp. {_fmt(v.get('einsp'))}"
            for day, v in days.items())
        + "\n\nStunden mit laufenden Geräten:\n" + ("\n".join(lines) if lines else (
            "- keine Verbraucher im Energie-Dashboard eingetragen" if not devices
            else "- keine Stunde mit nennenswertem Verbrauch der eingetragenen Geräte ("
            + ", ".join(n for n, _ in devices) + ")"))
    )
    return text, ""


async def run_energy(hass: HomeAssistant, entry: ConfigEntry) -> None:
    ev = FEATURES["energie"]["event"]
    hass.bus.async_fire(ev, {"status": "running"})
    try:
        ctx, err = await energy_context(hass, entry)
        if not ctx:
            raise ValueError(err)
        structure = {k: v for k, v in COACH_STRUCTURE.items() if k != "zustand"}
        structure["ersparnis_eur"] = {"required": True, "selector": {"number": {}}}
        data = await ask_ai(hass, entry, "Casora Energie-Coach",
            "Du bist ein Energieberater für einen Haushalt. Werte die letzte Woche aus und gib konkrete "
            "Spartipps. Antworte auf " + answer_language(hass) + ", knapp, mit Zahlen.\n\n" + ctx + _notes(entry) + "\n\n"
            "Schwerpunkt: Liefen große Geräte bei Netzbezug, obwohl an anderen Tagen/Stunden Solar-Überschuss "
            "(Einspeisung) da war? Rechne grob aus, was eine Verschiebung in Solar-Stunden gespart hätte "
            "(kWh × Strompreis). Ohne Solaranlage: günstigere Nutzung, Grundlast, auffällige Verbraucher. "
            "Keine erfundenen Werte.\n\nfazit: ein Satz zur Woche. erkenntnisse: 2–4 Beobachtungen. "
            "tipps: 1–3 konkrete Tipps. ersparnis_eur: geschätzte mögliche Ersparnis pro Woche in Euro "
            "(Zahl, 0 wenn keine).", structure)
        if not data:
            raise ValueError("Keine Antwort der KI")
        hass.bus.async_fire(ev, {"status": "done", "result": data})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Energie-Coach: %s", err)
        hass.bus.async_fire(ev, {"status": "error", "error": str(err)})


# ── Heizungs-Coach ────────────────────────────────────────────────────────────

def heating_rooms(hass: HomeAssistant) -> list[dict]:
    """Thermostate je Bereich (Gruppen ausgenommen) mit Temperatur- und Fenstersensoren."""
    reg = er.async_get(hass)
    devs = dr.async_get(hass)
    rooms = []
    for st in sorted(hass.states.async_all("climate"), key=lambda s: s.entity_id):
        if st.attributes.get("member_entities") or st.state == "unavailable":
            continue
        if "heat" not in (st.attributes.get("hvac_modes") or []) and st.state != "heat":
            continue
        ent = reg.async_get(st.entity_id)
        aid = _area_id(hass, st.entity_id)
        dev = devs.async_get(ent.device_id) if ent and ent.device_id else None
        # Temperatursensor fürs 7-Tage-Profil: gleicher Hersteller im Bereich, sonst irgendeiner.
        temps = [t for t in (_entities_in_area(hass, aid, "sensor", {"temperature"}) if aid else [])
                 if not OUTDOOR.search(t)]

        def maker(eid):
            e = reg.async_get(eid)
            d = devs.async_get(e.device_id) if e and e.device_id else None
            return d.manufacturer if d else None

        temps.sort(key=lambda t: 0 if dev and maker(t) == dev.manufacturer else 1)
        cfh = None
        if ent and ent.device_id:
            cfh = next((e.entity_id for e in er.async_entries_for_device(reg, ent.device_id)
                        if e.translation_key == "call_for_heat" and e.domain == "binary_sensor"), None)
        rooms.append({
            "id": st.entity_id,
            "n": _area_name(hass, aid) or st.attributes.get("friendly_name") or st.entity_id,
            "t": temps[0] if temps else None,
            "cfh": cfh,
            "win": _entities_in_area(hass, aid, "binary_sensor", WINDOW_CLASSES) if aid else [],
        })
    # Mehrere Regler im selben Bereich (Raumregler + Heizkörper): Gerätenamen anhängen.
    seen: dict[str, int] = {}
    for r in rooms:
        seen[r["n"]] = seen.get(r["n"], 0) + 1
    for r in rooms:
        if seen[r["n"]] > 1:
            r["n"] = f"{r['n']} ({_name(hass, r['id'])})"
    return rooms


async def heating_hours(hass: HomeAssistant, rooms: list[dict], days: int = 7) -> dict[str, tuple[float, float]]:
    """Je Thermostat: (Heizstunden, davon bei offenem Fenster/Tür)."""
    start = dt_util.utcnow() - timedelta(days=days)
    ids = [r["cfh"] for r in rooms if r["cfh"]] + [w for r in rooms for w in r["win"]]
    plain = await _history(hass, ids, start)
    withattrs = await _history(hass, [r["id"] for r in rooms if not r["cfh"]], start, attrs=True)
    out = {}
    for r in rooms:
        if r["cfh"]:
            heat = _intervals(plain.get(r["cfh"]), start, lambda s: s.state == "on")
        else:
            heat = _intervals(withattrs.get(r["id"]), start, lambda s: s.attributes.get("hvac_action") == "heating")
        wins = [iv for w in r["win"] for iv in _intervals(plain.get(w), start, lambda s: s.state == "on")]
        out[r["id"]] = (_hours(heat), _overlap(heat, wins))
    return out


def _temp_unit(hass: HomeAssistant) -> str:
    """Temperatur-Einheit von Home Assistant (°C oder °F) – die Werte kommen schon darin."""
    return str(getattr(getattr(hass.config, "units", None), "temperature_unit", None) or "°C")


async def heating_context(hass: HomeAssistant, entry: ConfigEntry) -> tuple[str | None, float]:
    rooms = heating_rooms(hass)
    if not rooms:
        return None, 0.0
    hrs = await heating_hours(hass, rooms)
    outdoor = _outdoor(hass, entry, "temperature", OPT_OUT_T)
    start = dt_util.start_of_local_day() - timedelta(days=7)
    st = await _stats(hass, [outdoor] + [r["t"] for r in rooms], start, "day", {"mean", "min", "max"})

    def series(sid):
        return "; ".join(
            f"{_local(r['start']).strftime('%d.%m.')} {_fmt(r.get('mean'))}/{_fmt(r.get('min'))}/{_fmt(r.get('max'))}"
            for r in st.get(sid, []) if r.get("mean") is not None)

    tu = _temp_unit(hass)
    lines = []
    for r in rooms:
        c = hass.states.get(r["id"])
        h, w = hrs.get(r["id"], (0.0, 0.0))
        cur = hass.states.get(r["t"]).state if r["t"] and hass.states.get(r["t"]) else c.attributes.get("current_temperature")
        line = (f"- {r['n']}: Modus {c.state}, Soll {c.attributes.get('temperature')} {tu}, Ist {cur} {tu}, "
                f"Heizdauer 7 Tage {_fmt(h)} h")
        if r["win"]:
            line += f", davon bei offenem Fenster/Tür {_fmt(w)} h"
        if r["t"]:
            line += f"; Raumtemperatur je Tag Ø/min/max: {series(r['t']) or 'keine Statistik'}"
        lines.append(line)
    total = sum(v[0] for v in hrs.values())
    text = (f"Heute: {dt_util.now().strftime('%d.%m.%Y')}. Heizung mit Regler je Raum.\n"
            f"Außentemperatur je Tag (Ø/min/max {tu}): {series(outdoor) if outdoor else 'kein Außensensor'}\n"
            "Räume:\n" + "\n".join(lines))
    return text, total


async def run_heating(hass: HomeAssistant, entry: ConfigEntry, only_season: bool = False) -> None:
    ev = FEATURES["heizung"]["event"]
    try:
        ctx, total = await heating_context(hass, entry)
        if only_season and total < 1:
            return
        hass.bus.async_fire(ev, {"status": "running"})
        if not ctx:
            raise ValueError("Keine Thermostate gefunden")
        data = await ask_ai(hass, entry, "Casora Heizungs-Coach",
            "Du bist ein Heizungs- und Energieberater. Werte die letzte Woche der Heizung aus und gib konkrete "
            "Tipps. Antworte auf " + answer_language(hass) + ", knapp, mit Zahlen.\n\n" + ctx + _notes(entry) + "\n\n"
            "Achte auf: Räume, die ihr Soll nicht erreichen oder sehr lange heizen; Heizen bei offenem Fenster/Tür; "
            "Räume, die deutlich wärmer sind als nötig; Zusammenhang mit der Außentemperatur; Fußbodenheizungen "
            "sind träge (kurze Absenkungen bringen wenig). Wurde kaum geheizt, sag das kurz und gib keine "
            "erfundenen Tipps.\n\nzustand: gut, beobachten oder handeln. fazit: ein Satz. erkenntnisse: 2–4 "
            "Beobachtungen mit Zahlen. tipps: 0–3 konkrete Tipps.", COACH_STRUCTURE)
        if not data:
            raise ValueError("Keine Antwort der KI")
        hass.bus.async_fire(ev, {"status": "done", "result": data})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Heizungs-Coach: %s", err)
        hass.bus.async_fire(ev, {"status": "error", "error": str(err)})


# ── Lüftungs-Coach ────────────────────────────────────────────────────────────

def vent_rooms(hass: HomeAssistant) -> list[dict]:
    """Bereiche mit Feuchtesensor (keine Pflanzen, nicht draußen) + CO₂ + Fenster."""
    reg = er.async_get(hass)
    plant_devices = {e.device_id for e in reg.entities.values() if e.domain == "plant" and e.device_id}
    by_area: dict[str, dict] = {}
    for st in sorted(hass.states.async_all("sensor"), key=lambda s: s.entity_id):
        dc = st.attributes.get("device_class")
        if dc not in ("humidity", "carbon_dioxide") or st.state in ("unknown", "unavailable"):
            continue
        ent = reg.async_get(st.entity_id)
        if ent and ent.device_id in plant_devices:
            continue
        aid = _area_id(hass, st.entity_id)
        name = _area_name(hass, aid)
        if not aid or OUTDOOR.search(f"{st.entity_id} {name}"):
            continue
        room = by_area.setdefault(aid, {"n": name, "rh": None, "co2": None, "win": []})
        key = "rh" if dc == "humidity" else "co2"
        if not room[key]:
            room[key] = st.entity_id
    rooms = [r for r in by_area.values() if r["rh"]]
    for aid, r in by_area.items():
        r["win"] = _entities_in_area(hass, aid, "binary_sensor", WINDOW_CLASSES)
    return sorted(rooms, key=lambda r: r["n"])


async def vent_context(hass: HomeAssistant, entry: ConfigEntry) -> tuple[str | None, list[str]]:
    rooms = vent_rooms(hass)
    if not rooms:
        return None, []
    out_t = _outdoor(hass, entry, "temperature", OPT_OUT_T)
    out_rh = _outdoor(hass, entry, "humidity", OPT_OUT_RH)
    start7 = dt_util.utcnow() - timedelta(days=7)
    st = await _stats(hass, [out_t, out_rh] + [r["rh"] for r in rooms] + [r["co2"] for r in rooms],
                      start7, "hour", {"mean", "max"})
    hist = await _history(hass, [w for r in rooms for w in r["win"]], start7)

    def vals(sid, key):
        return [x[key] for x in st.get(sid, []) if isinstance(x.get(key), (int, float))]

    def avg(xs):
        return sum(xs) / len(xs) if xs else None

    to, ro = vals(out_t, "mean"), vals(out_rh, "mean")
    tu = _temp_unit(hass)
    lines = []
    for r in rooms:
        hm, hx = vals(r["rh"], "mean"), vals(r["rh"], "max")
        line = (f"- {r['n']}: Feuchte Ø {_fmt(avg(hm), 0)} %, max {_fmt(max(hx) if hx else None, 0)} %, "
                f"Stunden ≥65 %: {sum(1 for x in hm if x >= 65)}, ≥70 %: {sum(1 for x in hm if x >= 70)}")
        if r["co2"]:
            rows = st.get(r["co2"], [])
            cm = [x["mean"] for x in rows if isinstance(x.get("mean"), (int, float))]
            cx = [x["max"] for x in rows if isinstance(x.get("max"), (int, float))]
            night = [x["mean"] for x in rows if isinstance(x.get("mean"), (int, float))
                     and (_local(x["start"]).hour >= 22 or _local(x["start"]).hour < 7)]
            line += (f"; CO₂ Ø {_fmt(avg(cm), 0)} ppm, max {_fmt(max(cx) if cx else None, 0)} ppm, "
                     f"Stunden ≥1000: {sum(1 for x in cm if x >= 1000)}, ≥1400: {sum(1 for x in cm if x >= 1400)}, "
                     f"nachts (22–7 Uhr) Ø {_fmt(avg(night), 0)} ppm")
        if r["win"]:
            open_h = sum(_hours(_intervals(hist.get(w), start7, lambda s: s.state == "on")) for w in r["win"])
            line += f"; Fenster/Tür offen in 7 Tagen: {_fmt(open_h)} h"
        lines.append(line)
    now_t = hass.states.get(out_t).state if out_t and hass.states.get(out_t) else "?"
    now_rh = hass.states.get(out_rh).state if out_rh and hass.states.get(out_rh) else "?"
    text = (f"Heute: {dt_util.now().strftime('%d.%m.%Y')}. Auswertung der letzten 7 Tage (Stundenwerte).\n"
            f"Außen: Temperatur Ø {_fmt(avg(to))} {tu} (min {_fmt(min(to) if to else None)}, max {_fmt(max(to) if to else None)}), "
            f"rel. Feuchte Ø {_fmt(avg(ro), 0)} %. Jetzt: {now_t} {tu}, {now_rh} %.\n"
            "Räume:\n" + "\n".join(lines))
    return text, [r["n"] for r in rooms]


async def run_vent(hass: HomeAssistant, entry: ConfigEntry) -> None:
    ev = FEATURES["lueftung"]["event"]
    hass.bus.async_fire(ev, {"status": "running"})
    try:
        ctx, names = await vent_context(hass, entry)
        if not ctx:
            raise ValueError("Keine Feuchtesensoren in Bereichen gefunden")
        structure = dict(COACH_STRUCTURE)
        structure["raeume"] = {"required": True, "selector": {"text": {"multiple": True}}}
        data = await ask_ai(hass, entry, "Casora Lüftungs-Coach",
            "Du bist ein Experte für Raumklima und Schimmelvermeidung. Werte die letzte Woche aus und gib konkrete "
            "Lüftungstipps für dieses Zuhause. Antworte auf " + answer_language(hass) + ", knapp, mit Zahlen und Raumnamen.\n\n"
            + ctx + _notes(entry) + "\n\n"
            "Achte auf: Räume mit vielen Stunden über 65–70 % Feuchte (Schimmelrisiko, besonders Bad nach dem "
            "Duschen), CO₂-Spitzen (vor allem nachts im Schlafzimmer), ob Lüften bei der Außenfeuchte überhaupt "
            "hilft (absolute Feuchte), zu lange offene Fenster bei kühler Außenluft. Keine erfundenen Werte; wenn "
            "alles im grünen Bereich ist, sag das kurz.\n\n"
            "zustand: gut, beobachten oder handeln. fazit: ein Satz. erkenntnisse: 2–4 Beobachtungen mit Zahlen. "
            "tipps: 0–3 konkrete Tipps (wann, wo, wie lange lüften).\n\n"
            f"raeume: für JEDEN der {len(names)} Räume aus der Liste oben ({', '.join(names)}) genau eine Zeile im "
            "Format 'Raum | zustand | Fazit | Tipp'. Raum exakt wie oben geschrieben; zustand gut, beobachten oder "
            "handeln; Fazit ein Satz mit den wichtigsten Zahlen dieses Raums; Tipp ein konkreter Satz für diesen "
            "Raum oder leer, wenn nichts zu tun ist. Keine Pipe-Zeichen im Text selbst.", structure)
        if not data:
            raise ValueError("Keine Antwort der KI")
        hass.bus.async_fire(ev, {"status": "done", "result": data})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Lüftungs-Coach: %s", err)
        hass.bus.async_fire(ev, {"status": "error", "error": str(err)})


# ── Aquarium-Doktor ───────────────────────────────────────────────────────────
# Die Aquarium-Kachel kennt ihre Entitäten (aus den Einstellungen der Kachel) und gibt sie
# beim Aufruf mit: Temperaturfühler, Technik (mit Leistungssensor), Licht, Lecksensor, Akkus.

DOCTOR_STRUCTURE = {
    "zustand": {"required": True, "selector": {"select": {"options": ["gut", "beobachten", "handeln"]}}},
    "fazit": {"required": True, "selector": {"text": {}}},
    "punkte": {"selector": {"text": {"multiple": True}}},
    "tipps": {"selector": {"text": {"multiple": True}}},
}
_BAD = ("unknown", "unavailable", "")


def _state_text(hass: HomeAssistant, entity_id: str | None) -> str | None:
    """Zustand mit Einheit, None ohne brauchbaren Wert."""
    st = hass.states.get(entity_id) if entity_id else None
    if not st or st.state in _BAD:
        return None
    unit = st.attributes.get("unit_of_measurement")
    return f"{st.state} {unit}".strip() if unit else st.state


async def aquarium_context(hass: HomeAssistant, data: dict) -> str:
    temp = data["temp"]
    name = data.get("name") or _name(hass, temp)
    devices = [d for d in (data.get("devices") or []) if isinstance(d, dict) and d.get("entity")]
    light, leak, status = data.get("light") or None, data.get("leak") or None, data.get("status") or None
    batteries = [(b, lbl) for b, lbl in ((data.get("leak_battery"), "Akku Lecksensor"),
                                         (data.get("temp_battery"), "Akku Temperaturfühler")) if b]
    start7 = dt_util.utcnow() - timedelta(days=7)
    days = await _stats(hass, [temp], dt_util.start_of_local_day() - timedelta(days=7), "day", {"mean", "min", "max"})
    hours = await _stats(hass, [temp], dt_util.utcnow() - timedelta(hours=24), "hour", {"mean"})
    hist = await _history(hass, [d["entity"] for d in devices] + [e for e in (light, leak) if e], start7)

    def hours_in(eid: str, state: str) -> float:
        return _hours(_intervals(hist.get(eid), start7, lambda s: s.state == state))

    lines = [f"Becken: {name}", f"Heute: {dt_util.now().strftime('%d.%m.%Y %H:%M')}",
             f"Wassertemperatur jetzt: {_state_text(hass, temp) or 'unbekannt'}"]
    if _state_text(hass, status):
        lines.append(f"Temperaturstatus: {_state_text(hass, status)}")
    daily = "; ".join(
        f"{_local(r['start']).strftime('%d.%m.')} {_fmt(r.get('mean'), 2)}/{_fmt(r.get('min'), 2)}/{_fmt(r.get('max'), 2)}"
        for r in days.get(temp, []) if r.get("mean") is not None)
    tu = (getattr(hass.states.get(temp), "attributes", {}) or {}).get("unit_of_measurement") or _temp_unit(hass)
    lines.append(f"Wassertemperatur je Tag Ø/min/max ({tu}): {daily or 'keine Statistik'}")
    hourly = ", ".join(f"{_local(r['start']).strftime('%H')} Uhr {_fmt(r.get('mean'), 2)}"
                       for r in hours.get(temp, []) if r.get("mean") is not None)
    if hourly:
        lines.append(f"Stundenmittel der letzten 24 h ({tu}): {hourly}")
    if devices:
        lines.append("Technik:")
        for d in devices:
            st = hass.states.get(d["entity"])
            line = f"- {d.get('label') or _name(hass, d['entity'])}: {st.state if st else 'fehlt'}"
            power = _state_text(hass, d.get("power"))
            if power:
                line += f", Leistung jetzt {power}"
            if hist.get(d["entity"]):
                line += (f"; in 7 Tagen aus {_fmt(hours_in(d['entity'], 'off'))} h, "
                         f"nicht erreichbar {_fmt(hours_in(d['entity'], 'unavailable'))} h")
            lines.append(line)
    if light:
        st = hass.states.get(light)
        bri = st.attributes.get("brightness") if st else None
        line = f"Beckenlicht: {st.state if st else 'fehlt'}"
        if st and st.state == "on" and isinstance(bri, (int, float)):
            line += f" ({round(bri / 2.55)} %)"
        if hist.get(light):
            on_h = hours_in(light, "on")
            line += f"; an in 7 Tagen {_fmt(on_h)} h (≈ {_fmt(on_h / 7)} h pro Tag)"
        lines.append(line)
    if leak:
        st = hass.states.get(leak)
        now = "Wasser erkannt" if st and st.state == "on" else "trocken" if st and st.state == "off" else "unbekannt"
        wet = sum(1 for s in hist.get(leak, []) if s.state == "on")
        lines.append(f"Lecksensor: {now}; Wassermeldungen in 7 Tagen: {wet}")
    for b, lbl in batteries:
        if _state_text(hass, b):
            lines.append(f"{lbl}: {_state_text(hass, b)}")
    return "\n".join(lines)


async def run_aquarium(hass: HomeAssistant, entry: ConfigEntry, data: dict) -> None:
    ev = FEATURES["aquarium"]["event"]
    key = {"temp": data["temp"]}
    hass.bus.async_fire(ev, {**key, "status": "running"})
    try:
        ctx = await aquarium_context(hass, data)
        result = await ask_ai(hass, entry, f"Casora Aquarium-Doktor {data.get('name') or ''}".strip(),
            "Du bist ein erfahrener Aquarianer. Prüfe die Daten dieses Aquariums der letzten 7 Tage und sag, ob "
            "alles passt. Antworte auf " + answer_language(hass) + ", knapp, mit Zahlen.\n\n" + ctx + _notes(entry) + "\n\n"
            "Achte auf: Temperaturschwankungen und -spitzen (Tag/Nacht, Heizer, Kühlung), Technik, die aus, "
            "nicht erreichbar oder ohne Strom war (Pumpe, Heizer, Filter, Abschäumer …), die Lichtdauer pro Tag, "
            "Wassermeldungen des Lecksensors und schwache Akkus. Ob Süß- oder Meerwasser, ergibt sich aus Name "
            "und Technik; ist es unklar, bewerte vorsichtig. Keine erfundenen Werte; wenn alles passt, sag das "
            "kurz.\n\nzustand: gut, beobachten oder handeln. fazit: ein Satz. punkte: 2–4 Beobachtungen mit "
            "Zahlen. tipps: 0–3 konkrete Tipps.", DOCTOR_STRUCTURE)
        if not result:
            raise ValueError("Keine Antwort der KI")
        hass.bus.async_fire(ev, {**key, "status": "done", "result": result})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Aquarium-Doktor: %s", err)
        hass.bus.async_fire(ev, {**key, "status": "error", "error": str(err)})


# ── Rad-Check (E-Bike) ────────────────────────────────────────────────────────
# Das E-Bike-Popup findet die Entitäten des Rads (Integration Bosch eBike, Bosch Smart System;
# kein Live-Akkustand) und gibt sie beim Aufruf mit; hier werden nur ihre aktuellen Werte gelesen.

_EBIKE_SKIP = ("button.", "image.", "camera.", "update.", "event.", "device_tracker.", "select.", "text.")
_EBIKE_MAX = 80


def ebike_context(hass: HomeAssistant, entities: list[str], name: str | None = None) -> str | None:
    rows = []
    for eid in sorted(set(entities or [])):
        if eid.startswith(_EBIKE_SKIP):
            continue
        val = _state_text(hass, eid)
        if val is None:
            continue
        if eid.startswith("binary_sensor."):
            val = {"on": "ja", "off": "nein"}.get(val, val)
        rows.append(f"- {_name(hass, eid)}: {val}")
        if len(rows) >= _EBIKE_MAX:
            break
    if not rows:
        return None
    now = dt_util.now()
    return (f"Rad: {name or 'E-Bike'}\nHeute: {now.strftime('%d.%m.%Y')}\n"
            "Werte des Rads:\n" + "\n".join(rows))


async def run_ebike(hass: HomeAssistant, entry: ConfigEntry, data: dict) -> None:
    ev = FEATURES["ebike"]["event"]
    hass.bus.async_fire(ev, {"status": "running"})
    try:
        ctx = ebike_context(hass, data.get("entities") or [], data.get("name"))
        if not ctx:
            raise ValueError("Keine Werte des E-Bikes gefunden")
        result = await ask_ai(hass, entry, "Casora Rad-Check",
            "Du bist ein erfahrener E-Bike-Mechaniker. Prüfe den Zustand dieses E-Bikes und gib konkrete Hinweise. "
            "Antworte auf " + answer_language(hass) + ", knapp, mit Zahlen.\n\n" + ctx + _notes(entry) + "\n\n"
            "Achte auf: fälligen Service (Tage und Kilometer), Verschleißteile nach Kilometerstand (Kette, "
            "Bremsbeläge, Reifen; übliche Wechselintervalle als Richtwert), Akku-Pflege (Ladezyklen, Ladeenergie, "
            "Akku-Gesundheit, Lagerung passend zur Jahreszeit), lange Standzeit seit der letzten Fahrt und eine "
            "Diebstahlmeldung. Keine erfundenen Werte; was nicht in den Daten steht, nur als allgemeinen Hinweis.\n\n"
            "zustand: gut, beobachten oder handeln. fazit: ein Satz. punkte: 2–4 Beobachtungen mit Zahlen. "
            "tipps: 0–3 konkrete Tipps.", DOCTOR_STRUCTURE)
        if not result:
            raise ValueError("Keine Antwort der KI")
        hass.bus.async_fire(ev, {"status": "done", "result": result})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Rad-Check: %s", err)
        hass.bus.async_fire(ev, {"status": "error", "error": str(err)})


# ── Abläufe aus ki/*.yaml ─────────────────────────────────────────────────────

async def _load_sequences(hass: HomeAssistant) -> dict[str, list]:
    base = os.path.join(os.path.dirname(__file__), "ki")
    out = {}
    for name in SEQUENCES:
        raw = await hass.async_add_executor_job(load_yaml, os.path.join(base, name + ".yaml"))
        out[name] = await async_validate_actions_config(hass, cv.SCRIPT_SCHEMA(raw))
    return out


def _cookidoo(hass: HomeAssistant, key: str) -> str | None:
    reg = er.async_get(hass)
    return next((e.entity_id for e in reg.entities.values()
                 if e.platform == "cookidoo" and e.translation_key == key), None)


def recipe_list(hass: HomeAssistant, entry: ConfigEntry) -> str | None:
    """Einkaufsliste für die Zutaten: Casora-Option, sonst Cookidoo „Zusätzliche Käufe“, sonst erste To-do-Liste."""
    chosen = entry.options.get(OPT_RECIPE_LIST)
    if chosen and hass.states.get(chosen):
        return chosen
    return _cookidoo(hass, "additional_item_list") or next(iter(sorted(hass.states.async_entity_ids("todo"))), None)


def _sensor_of(hass: HomeAssistant, key: str) -> str | None:
    """Entität des Ergebnis-Sensors (Casoras eigener oder der alte aus dem Paket)."""
    reg = er.async_get(hass)
    return reg.async_get_entity_id("sensor", DOMAIN, f"{DOMAIN}_{key}") or reg.async_get_entity_id("sensor", "template", LEGACY[key][0])


class KiRunner:
    """Dienste und Zeitpläne der KI-Funktionen."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.seq: dict[str, list] = {}
        self.scripts: dict[str, Script] = {}
        self.unsub: list = []

    async def async_setup(self) -> None:
        hass = self.hass
        try:
            self.seq = await _load_sequences(hass)
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("KI-Abläufe konnten nicht geladen werden: %s", err)
        for name, seq in self.seq.items():
            self.scripts[name] = Script(hass, seq, f"Casora {name}", DOMAIN,
                                        script_mode="parallel", max_runs=10, logger=_LOGGER)

        entity = vol.Schema({vol.Required("entity_id"): cv.entity_id})
        maybe = vol.Schema({vol.Optional("entity_id", default=""): vol.Any(cv.entity_id, "")})
        plant = vol.Schema({vol.Required("plant"): cv.entity_id})
        season = vol.Schema({vol.Optional("nur_heizsaison", default=False): cv.boolean})
        opt_ent = vol.Any(None, "", cv.entity_id)
        aquarium = vol.Schema({
            vol.Required("temp"): cv.entity_id,
            vol.Optional("name"): vol.Any(None, cv.string),
            vol.Optional("devices", default=list): [vol.Schema({
                vol.Required("entity"): cv.entity_id,
                vol.Optional("label"): vol.Any(None, cv.string),
                vol.Optional("power"): opt_ent,
            }, extra=vol.ALLOW_EXTRA)],
            vol.Optional("light"): opt_ent,
            vol.Optional("leak"): opt_ent,
            vol.Optional("status"): opt_ent,
            vol.Optional("leak_battery"): opt_ent,
            vol.Optional("temp_battery"): opt_ent,
        }, extra=vol.ALLOW_EXTRA)
        ebike = vol.Schema({
            vol.Required("entities"): vol.All(cv.ensure_list, [cv.entity_id]),
            vol.Optional("name"): vol.Any(None, cv.string),
        })
        reg = [
            ("energie_coach", self._energy, None),
            ("heizungs_coach", self._heating, season),
            ("lueftungs_coach", self._vent, None),
            ("kamera_beschreiben", self._camera, entity),
            ("pflanzen_doktor", self._plant, plant),
            ("aquarium_doktor", self._aquarium, aquarium),
            ("ebike_check", self._ebike, ebike),
            ("update_pruefen", self._update, maybe),
            ("update_bestaetigen", self._update_ack, entity),
            ("rezept_neu", self._recipe, None),
            ("rezept_auf_liste", self._recipe_list, None),
        ]
        for name, fn, schema in reg:
            hass.services.async_register(DOMAIN, name, fn, schema=schema)

        self._schedule()

    def _schedule(self) -> None:
        """Zeitpläne aus den Optionen (je Funktion aus, bisheriger Termin oder eigene Zeit)."""
        hass = self.hass
        opts = self.entry.options
        jobs = {
            "energie": lambda: run_energy(hass, self.entry),
            "heizung": lambda: run_heating(hass, self.entry, only_season=True),
            "lueftung": lambda: run_vent(hass, self.entry),
            "rezept": self._run_recipe,
        }
        for key, job in jobs.items():
            spec = parse_plan(key, opts.get(PLAN_OPTS[key]))
            if spec is None or is_external(hass, key):
                continue
            day, hour, minute = spec

            @callback
            def fire(now, day=day, job=job):
                if day is None or dt_util.as_local(now).weekday() == day:
                    hass.async_create_task(job())

            self.unsub.append(async_track_time_change(hass, fire, hour=hour, minute=minute, second=0))
        # Update-Check: höchstens einmal am Tag (bis 1.0.2 stündlich).
        if opts.get(OPT_PLAN_UPDATE) == "daily" and not is_external(hass, "update"):
            @callback
            def daily(now):
                hass.async_create_task(self._run_update(""))

            self.unsub.append(async_track_time_change(hass, daily, hour=UPDATE_DAILY[0], minute=UPDATE_DAILY[1], second=0))

    async def async_unload(self) -> None:
        for u in self.unsub:
            u()
        for name in ("energie_coach", "heizungs_coach", "lueftungs_coach", "kamera_beschreiben",
                     "pflanzen_doktor", "aquarium_doktor", "ebike_check", "update_pruefen", "update_bestaetigen",
                     "rezept_neu", "rezept_auf_liste"):
            self.hass.services.async_remove(DOMAIN, name)

    def _bg(self, coro) -> None:
        self.hass.async_create_background_task(coro, f"{DOMAIN}_ki")

    # Dienste
    async def _energy(self, call: ServiceCall) -> None:
        self._bg(run_energy(self.hass, self.entry))

    async def _heating(self, call: ServiceCall) -> None:
        self._bg(run_heating(self.hass, self.entry, only_season=call.data.get("nur_heizsaison", False)))

    async def _vent(self, call: ServiceCall) -> None:
        self._bg(run_vent(self.hass, self.entry))

    async def _run(self, name: str, variables: dict) -> None:
        script = self.scripts.get(name)
        if not script:
            raise ValueError(f"Ablauf {name} nicht geladen")
        # Antwortsprache wie Home Assistant (ki/*.yaml: „Antworte auf {{ sprache }}“).
        await script.async_run(run_variables={"sprache": answer_language(self.hass), **variables}, context=Context())

    def _no_ai(self, feature: str, key: dict) -> bool:
        """Keine KI eingerichtet: Fehler mit Grund melden, statt die KI-Aufgabe „None“ aufzurufen."""
        if ai_entity(self.hass, self.entry):
            return False
        self.hass.bus.async_fire(FEATURES[feature]["event"], {**key, "status": "error", "error": NO_AI})
        return True

    async def _camera(self, call: ServiceCall) -> None:
        if self._no_ai("kamera", {"entity_id": call.data["entity_id"]}):
            return
        self._bg(self._run("kamera", {"entity_id": call.data["entity_id"], "ai_entity": ai_entity(self.hass, self.entry)}))

    async def _plant(self, call: ServiceCall) -> None:
        if self._no_ai("pflanzen", {"plant": call.data["plant"]}):
            return
        self._bg(self._run("pflanzen", {"plant": call.data["plant"], "ai_entity": ai_entity(self.hass, self.entry)}))

    async def _aquarium(self, call: ServiceCall) -> None:
        self._bg(run_aquarium(self.hass, self.entry, dict(call.data)))

    async def _ebike(self, call: ServiceCall) -> None:
        self._bg(run_ebike(self.hass, self.entry, dict(call.data)))

    async def _run_update(self, request: str) -> None:
        if not ai_entity(self.hass, self.entry, web=True):
            return
        # Casoras eigene Release-Notes gleich mitgeben: die KI kommt per web_fetch nicht
        # verlässlich an GitHubs Release-Seite („Release-Notes nicht abrufbar“).
        try:
            notes = notes_for_ai(await fetch_releases(self.hass), VERSION, self.hass.config.language)
        except Exception as err:  # noqa: BLE001 – dann wie bisher per Web-Abruf
            _LOGGER.debug("Casora: Release-Notes für die Update-Prüfung nicht geladen: %s", err)
            notes = ""
        await self._run("update", {"request": request, "sensor_id": _sensor_of(self.hass, "update") or "",
                                   "ai_web_entity": ai_entity(self.hass, self.entry, web=True),
                                   "casora_repo": UPDATE_REPO, "casora_notes": notes})

    async def _update(self, call: ServiceCall) -> None:
        self._bg(self._run_update(call.data.get("entity_id") or ""))

    async def _update_ack(self, call: ServiceCall) -> None:
        self.hass.bus.async_fire("casora_update_ai_ack", {"entity_id": call.data["entity_id"]})

    async def _run_recipe(self) -> None:
        weather = sorted(self.hass.states.async_entity_ids("weather"))
        await self._run("rezept", {
            "weather_entity": weather[0] if weather else "",
            "idea_sensor": _sensor_of(self.hass, "rezept") or "",
            "cookidoo": _cookidoo(self.hass, "meal_plan") is not None,
            "hinweise": (self.entry.options.get(OPT_NOTES) or "").strip(),
            "ai_web_entity": ai_entity(self.hass, self.entry, web=True),
        })

    async def _recipe(self, call: ServiceCall) -> None:
        self._bg(self._run_recipe())

    async def _recipe_list(self, call: ServiceCall) -> None:
        """Zutaten der Rezeptidee auf die Einkaufsliste (gewählte Liste, sonst Cookidoo, sonst erste Liste)."""
        sensor = _sensor_of(self.hass, "rezept")
        st = self.hass.states.get(sensor) if sensor else None
        items = (st.attributes.get("zutaten") if st else None) or []
        target = recipe_list(self.hass, self.entry)
        if not target:
            raise ValueError("Keine Einkaufsliste gefunden")
        for item in items:
            try:
                await self.hass.services.async_call("todo", "add_item", {"item": str(item)},
                                                    target={"entity_id": target}, blocking=True)
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("Zutat %s nicht übernommen: %s", item, err)
