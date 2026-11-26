"""Assist shows the matching Casora popup (wow/assist-popups).

A question in Assist ("Wo ist es gerade am wärmsten?", "Zeig mir die Kamera an der Tür") gets HA's spoken answer and,
in Casora's Assist chat, the matching popup: a room's climate, the lights of a room or the house, a device's energy,
a camera, the weather, security or a room page.

Two ways in, one target:
  * plain HA Assist (no LLM): sentence triggers of the conversation integration (German and English), registered
    through HA's public trigger helper (the same way an automation's "sentence" trigger is). They answer with a
    sentence and remember the target.
  * LLM conversation agents: an LLM API "Casora" with one tool, casora_show (select it in the agent's options).
Either way the target is kept per user for a short time; Casora's chat fetches it right after its own Assist run
(websocket casora/assist/take) and opens the popup only when the open dashboard shows that thing.

Limits (the sentences act on all of HA's Assist, satellites included):
  * the sentences are registered only while a Casora dashboard shows the Assist button and has the Studio switch
    "Assist shows the matching popup" on (re-read on every dashboard save); none of them is a sentence HA's own
    intents understand, so HA's answers stay HA's.
  * answers and the LLM tool only see entities exposed to Assist and, per user, what Casora's "Who sees this?"
    shows that user (a request without a user, from a satellite, sees no limited entity).

Target: {"view": climate|lights|energy|camera|weather|security|room, "area_id"?, "area"?, "entity_id"?}.
The matching logic below works on plain dicts (snapshot()), so dev/unit/assist_show_test.py runs without HA.
"""

from __future__ import annotations

import logging
import re
import time
import unicodedata
from typing import Any

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

VIEWS = ("climate", "lights", "energy", "camera", "weather", "security", "room")
TTL = 30.0          # seconds a target waits for the chat to fetch it
API_ID = "casora"

# Sentence triggers (hassil templates: [optional], (a|b), {wildcard}). Both languages in one list: a trigger has no
# language, the answer follows the language of the request.
SENTENCES: dict[str, list[str]] = {
    "climate_warm": [
        "wo ist es [gerade|jetzt|im moment] am wärmsten",
        "welcher raum ist [gerade|jetzt] am wärmsten",
        "where is it [the] warmest [right now|now]",
        "which room is [the] warmest [right now|now]",
    ],
    "climate_cold": [
        "wo ist es [gerade|jetzt|im moment] am kältesten",
        "welcher raum ist [gerade|jetzt] am kältesten",
        "where is it [the] coldest [right now|now]",
        "which room is [the] coldest [right now|now]",
    ],
    "climate_area": [
        "zeig [mir] das (raumklima|klima) (im|in der|in|vom) {area}",
        "show [me] the climate (in|of) [the] {area}",
    ],
    # One trigger for the house and a room: HA runs every trigger whose sentence matches, and "lichter im haus" fits
    # "{area}" too. resolve("lights") tells the house words (HOUSE) from a room.
    "lights": [
        "zeig [mir] alle lichter",
        "zeig [mir] [alle|die] lichter (im|in der|in) {area}",
        "show [me] all [the] lights",
        "show [me] [all] [the] lights in [the] {area}",
    ],
    "energy": [
        "was hat (der|die|das) {name} (diese woche|heute|diesen monat) verbraucht",
        "wie viel (strom|energie) hat (der|die|das) {name} (diese woche|heute|diesen monat) verbraucht",
        "zeig [mir] den verbrauch (vom|von der|von) {name}",
        "how much (energy|power|electricity) did [the] {name} use (this week|today|this month)",
        "what did [the] {name} use (this week|today|this month)",
        "show [me] the (energy|consumption) of [the] {name}",
    ],
    "camera": [
        "zeig [mir] die kamera (an der|am|an|im|in der|vor der|vorm|vom) {name}",
        "zeig [mir] die {name} kamera",
        "zeig [mir] die {name}kamera",
        "show [me] the camera (at|in|on|by) [the] {name}",
        "show [me] the {name} camera",
    ],
    # Only sentences HA's own intents do not understand: "show me the weather" is HassGetWeather, its answer stays
    # HA's (the chat opens the weather popup from that answer, 52-assist-show.js X.fromHa).
    "weather": [
        "zeig [mir] das wetter",
    ],
    "security": [
        "zeig [mir] die sicherheit",
        "ist alles (zu|abgeschlossen|sicher)",
        "show [me] [the] security",
        "is everything (closed|locked|secure)",
    ],
    "room": [
        "(zeig [mir]|öffne) den raum {area}",
        "(show [me]|open) the room {area}",
    ],
}

OUTDOOR = re.compile(r"(aussen|garten|balkon|terrasse|outdoor|outside|garden|balcony|terrace|patio|draussen)")
ARTICLES = {"der", "die", "das", "dem", "den", "des", "im", "in", "am", "an", "vom", "von", "the", "a", "an", "my",
            "mein", "meine", "meinem", "meiner", "unser", "unsere"}
# "Lights in the house": every light, not a room (unless a room is called exactly that).
HOUSE = {"haus", "ganzen haus", "ganze haus", "wohnung", "ganzen wohnung", "ganze wohnung", "house", "whole house",
         "home", "the house", "the whole house", "flat", "apartment"}
# A room's temperature: values outside this range are fridges, freezers, printer nozzles, boilers, not the room.
ROOM_RANGE_C = (8.0, 40.0)
PERIODS = {"heute": "day", "today": "day", "diese woche": "week", "this week": "week",
           "diesen monat": "month", "this month": "month"}


# ── Text ──────────────────────────────────────────────────────────────────────

def fold(text: Any) -> str:
    """Lower case without accents; ä/ö/ü/ß as a/o/u/ss, punctuation as spaces."""
    s = str(text or "").lower().replace("ß", "ss")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def _words(text: Any) -> list[str]:
    return [w for w in fold(text).split() if w not in ARTICLES]


def _score(query: str, names: list[str]) -> int:
    """How well a spoken name fits: 3 same, 2 every word found as a word start, 1 a part of a word, 0 none."""
    q = _words(query)
    if not q:
        return 0
    best = 0
    for n in names:
        w = _words(n)
        if not w:
            continue
        if w == q:
            return 3
        joined = " ".join(w)
        if all(any(x.startswith(t) for x in w) for t in q):
            best = max(best, 2)
        elif all(t in joined.replace(" ", "") for t in q):
            best = max(best, 1)
    return best


def match_area(query: str, areas: list[dict]) -> dict | None:
    """The area a spoken room name means (name or alias), best fit first; None when nothing fits."""
    ranked = sorted(((a, _score(query, [a.get("name", "")] + list(a.get("aliases") or []))) for a in areas),
                    key=lambda x: -x[1])
    return ranked[0][0] if ranked and ranked[0][1] > 0 else None


def match_entity(query: str, ents: list[dict], areas: list[dict], pred=None) -> dict | None:
    """The entity a spoken name means, among those pred accepts: by its name, else by its area's name."""
    pool = [e for e in ents if pred is None or pred(e)]
    area_name = {a["id"]: a.get("name", "") for a in areas}
    best, best_s = None, 0
    for e in pool:
        s = _score(query, [e.get("name", ""), e.get("device", "")]) * 2
        if s < 6:
            s = max(s, _score(query, [area_name.get(e.get("area_id"), "")]) * 2 - 1)
        if s > best_s:
            best, best_s = e, s
    return best


# ── Numbers and words ─────────────────────────────────────────────────────────

def _de(lang: str | None) -> bool:
    return str(lang or "de").lower().startswith("de")


def _num(value: float, lang: str | None, digits: int = 1) -> str:
    s = f"{value:.{digits}f}"
    if digits and s.endswith("0" * digits):
        s = s[: -(digits + 1)]
    return s.replace(".", ",") if _de(lang) else s


def _float(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


WEATHER_WORDS = {
    "clear-night": ("klar", "clear"), "cloudy": ("bewölkt", "cloudy"), "fog": ("neblig", "foggy"),
    "hail": ("Hagel", "hail"), "lightning": ("Gewitter", "thunderstorms"),
    "lightning-rainy": ("Gewitter mit Regen", "thunderstorms and rain"), "partlycloudy": ("teils bewölkt", "partly cloudy"),
    "pouring": ("starker Regen", "heavy rain"), "rainy": ("Regen", "rain"), "snowy": ("Schnee", "snow"),
    "snowy-rainy": ("Schneeregen", "sleet"), "sunny": ("sonnig", "sunny"), "windy": ("windig", "windy"),
    "windy-variant": ("windig und bewölkt", "windy and cloudy"), "exceptional": ("Unwetter", "severe weather"),
}


# ── Resolving a request ───────────────────────────────────────────────────────

def _celsius(value: float, unit: Any) -> float:
    return (value - 32) * 5 / 9 if str(unit or "").strip().upper().endswith("F") else value


def _median(vals: list[float]) -> float:
    v = sorted(vals)
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def room_temps(snap: dict) -> dict[str, dict]:
    """area_id → {"value", "unit", "entity_id"}: the temperature of each indoor room.

    A thermostat's current_temperature first (climate entities measure the room); without one the median of the
    room's temperature sensors that read like a room (ROOM_RANGE_C), so a fridge, freezer, printer nozzle, aquarium
    or boiler in the same area neither wins "warmest/coldest" nor pulls the room's value.
    """
    names = {a["id"]: a.get("name", "") for a in snap["areas"]}
    lo, hi = ROOM_RANGE_C
    found: dict[str, dict[str, list[dict]]] = {}
    for e in snap["entities"]:
        area = e.get("area_id")
        if not area or e.get("category") or e.get("hidden") or OUTDOOR.search(fold(names.get(area, ""))):
            continue
        if e.get("domain") == "climate":
            v, kind = _float((e.get("attributes") or {}).get("current_temperature")), "climate"
        elif e.get("domain") == "sensor" and e.get("device_class") == "temperature":
            v, kind = _float(e.get("state")), "sensor"
        else:
            continue
        if v is None or not lo <= _celsius(v, e.get("unit")) <= hi:
            continue
        found.setdefault(area, {}).setdefault(kind, []).append({**e, "value": v})
    out: dict[str, dict] = {}
    for area, kinds in found.items():
        rows = kinds.get("climate") or kinds["sensor"]
        mid = _median([r["value"] for r in rows])
        near = min(rows, key=lambda r: abs(r["value"] - mid))
        out[area] = {"value": mid, "unit": near.get("unit") or "°C", "entity_id": near["entity_id"]}
    return out


def resolve(kind: str, slots: dict, snap: dict, lang: str | None) -> tuple[str, dict | None]:
    """(spoken answer, target or None) for one recognised request. snap: snapshot() of the house."""
    de = _de(lang)
    areas, ents = snap["areas"], snap["entities"]
    area_of = {a["id"]: a for a in areas}

    if kind in ("climate_warm", "climate_cold"):
        temps = room_temps(snap)
        if not temps:
            return ("Ich finde keine Temperatursensoren in deinen Räumen." if de
                    else "I can't find any temperature sensors in your rooms."), None
        pick = (max if kind == "climate_warm" else min)(temps, key=lambda k: temps[k]["value"])
        room = temps[pick]
        name = area_of[pick]["name"]
        value = _num(room["value"], lang) + " " + room["unit"]
        if de:
            word = "wärmsten" if kind == "climate_warm" else "kältesten"
            speech = f"Am {word} ist es gerade im Raum {name} mit {value}."
        else:
            word = "warmest" if kind == "climate_warm" else "coldest"
            speech = f"The {word} room right now is {name} at {value}."
        return speech, {"view": "climate", "area_id": pick, "area": name, "entity_id": room["entity_id"]}

    if kind == "lights":
        # "Lichter im Haus" is the house, unless a room has exactly that name.
        said = fold(slots.get("area", ""))
        exact = said and any(fold(x) == said for a in areas for x in [a.get("name", "")] + list(a.get("aliases") or []))
        if not said or (said in {fold(w) for w in HOUSE} and not exact):
            kind = "lights_all"
        else:
            kind = "lights_area"

    if kind in ("climate_area", "lights_area", "room"):
        area = match_area(slots.get("area", ""), areas)
        if not area:
            said = slots.get("area", "")
            return (f"Ich kenne keinen Raum „{said}“." if de else f"I don't know a room called “{said}”."), None
        name = area["name"]
        if kind == "room":
            return (f"Hier ist {name}." if de else f"Here is {name}."), {"view": "room", "area_id": area["id"], "area": name}
        if kind == "climate_area":
            t = room_temps(snap).get(area["id"])
            if t:
                v = _num(t["value"], lang) + " " + t["unit"]
                speech = f"Im Raum {name} sind es {v}." if de else f"It is {v} in {name}."
            else:
                speech = f"Hier ist das Raumklima von {name}." if de else f"Here is the climate of {name}."
            target = {"view": "climate", "area_id": area["id"], "area": name}
            if t:
                target["entity_id"] = t["entity_id"]
            return speech, target
        lights = [e for e in ents if e.get("domain") == "light" and e.get("area_id") == area["id"] and not e.get("hidden")]
        on = sum(1 for e in lights if e.get("state") == "on")
        if not lights:
            return (f"Im Raum {name} finde ich keine Lichter." if de else f"I can't find any lights in {name}."), None
        speech = (f"Im Raum {name} sind {on} von {len(lights)} Lichtern an." if de
                  else f"{on} of {len(lights)} lights are on in {name}.")
        return speech, {"view": "lights", "area_id": area["id"], "area": name}

    if kind == "lights_all":
        lights = [e for e in ents if e.get("domain") == "light" and not e.get("hidden")]
        on = sum(1 for e in lights if e.get("state") == "on")
        return (f"{on} von {len(lights)} Lichtern sind an." if de else f"{on} of {len(lights)} lights are on."), {"view": "lights"}

    if kind == "camera":
        cam = match_entity(slots.get("name", ""), ents, areas, lambda e: e.get("domain") == "camera")
        if not cam:
            said = slots.get("name", "")
            return (f"Ich finde keine Kamera „{said}“." if de else f"I can't find a camera “{said}”."), None
        return (f"Hier ist die Kamera {cam['name']}." if de else f"Here is the {cam['name']} camera."), \
            {"view": "camera", "entity_id": cam["entity_id"]}

    if kind == "energy":
        is_energy = lambda e: e.get("domain") == "sensor" and e.get("device_class") == "energy"  # noqa: E731
        hit = match_entity(slots.get("name", ""), ents, areas, is_energy)
        if not hit:
            # The device by any of its entities ("Waschmaschine" names the device, its sensor "… Energie").
            dev = match_entity(slots.get("name", ""), ents, areas, lambda e: bool(e.get("device_id")))
            if dev:
                hit = next((e for e in ents if is_energy(e) and e.get("device_id") == dev["device_id"]), None)
        if not hit:
            said = slots.get("name", "")
            return (f"Ich finde keinen Verbrauch für „{said}“." if de else f"I can't find the energy use of “{said}”."), None
        label = hit.get("device") or hit["name"]
        used = slots.get("_used")
        period = slots.get("_period") or "week"
        when_de = {"day": "heute", "week": "diese Woche", "month": "diesen Monat"}[period]
        when_en = {"day": "today", "week": "this week", "month": "this month"}[period]
        if used is not None:
            v = _num(used, lang, 2 if used < 10 else 1) + " kWh"
            speech = f"{label} hat {when_de} {v} verbraucht." if de else f"{label} used {v} {when_en}."
        else:
            speech = f"Hier ist der Verbrauch von {label}." if de else f"Here is the energy use of {label}."
        return speech, {"view": "energy", "entity_id": hit["entity_id"], "period": period}

    if kind == "weather":
        w = next((e for e in ents if e.get("domain") == "weather"), None)
        if not w:
            return ("Ich finde keine Wetter-Entität." if de else "I can't find a weather entity."), None
        word = WEATHER_WORDS.get(str(w.get("state")), (str(w.get("state")), str(w.get("state"))))[0 if de else 1]
        t = _float((w.get("attributes") or {}).get("temperature"))
        unit = (w.get("attributes") or {}).get("temperature_unit") or "°C"
        if t is None:
            speech = f"Draußen: {word}." if de else f"Outside: {word}."
        else:
            speech = f"Draußen sind es {_num(t, lang)} {unit}, {word}." if de else f"It is {_num(t, lang)} {unit} outside, {word}."
        return speech, {"view": "weather", "entity_id": w["entity_id"]}

    if kind == "security":
        opening = {"door", "window", "garage_door", "opening"}
        open_ = [e for e in ents if e.get("domain") == "binary_sensor" and e.get("device_class") in opening
                 and e.get("state") == "on" and not e.get("hidden") and not e.get("category")]
        unlocked = [e for e in ents if e.get("domain") == "lock" and e.get("state") in ("unlocked", "open")]
        bad = open_ + unlocked
        if not bad:
            speech = "Alles ist zu." if de else "Everything is closed."
        else:
            names = ", ".join(e["name"] for e in bad[:4]) + (" …" if len(bad) > 4 else "")
            speech = (f"{len(bad)} offen: {names}." if de else f"{len(bad)} open: {names}.")
        return speech, {"view": "security"}

    return ("Das kann ich nicht zeigen." if de else "I can't show that."), None


def kind_for_tool(args: dict) -> tuple[str, dict]:
    """casora_show's arguments → (kind, slots) for resolve()."""
    view = str(args.get("view") or "")
    area = str(args.get("area") or "").strip()
    name = str(args.get("name") or "").strip()
    if view == "climate":
        if area:
            return "climate_area", {"area": area}
        return ("climate_cold" if str(args.get("extreme") or "") == "coldest" else "climate_warm"), {}
    if view == "lights":
        return ("lights", {"area": area}) if area else ("lights_all", {})
    if view == "room":
        return "room", {"area": area}
    if view in ("camera", "energy"):
        return view, {"name": name or area, "_period": args.get("period") if args.get("period") in ("day", "week", "month") else None}
    return view, {}


# ── HA side ───────────────────────────────────────────────────────────────────

def sees(entity_id: str, user_id: str | None, users: dict[str, set] | None) -> bool:
    """Casora's "Who sees this?" of a tile (casora_entity_users): no list = everyone; a request without a user (a
    voice satellite) does not get what is limited to some users."""
    allowed = (users or {}).get(entity_id)
    return not allowed or (user_id is not None and user_id in allowed)


def dashboards_state(configs: list) -> tuple[bool, dict[str, set]]:
    """(wanted, users) from Casora's dashboards (dashboard_kinds.dashboard_kind wide/mobile).

    wanted: some Casora dashboard shows the Assist button and has "Assist shows the matching popup" on (Home's room
    card or the phone's title card, like 52-assist-show.js X.enabled). users: entity → user ids that see its tile,
    from every room's casora_entity_users; an entity listed on several dashboards is seen only by users on all lists.
    """
    from .dashboard_kinds import dashboard_kind

    wanted = False
    users: dict[str, set] = {}
    for cfg in configs:
        if dashboard_kind(cfg) not in ("wide", "mobile"):
            continue
        off = False

        def walk(o: Any, depth: int) -> None:
            nonlocal off
            if depth > 12:
                return
            if isinstance(o, list):
                for x in o:
                    walk(x, depth + 1)
                return
            if not isinstance(o, dict):
                return
            tpl = o.get("template")
            tpls = tpl if isinstance(tpl, list) else [tpl]
            var = o.get("variables") if isinstance(o.get("variables"), dict) else {}
            if any(t in ("casora_room", "casora_mobile_weather") for t in tpls):
                if var.get("assist_popups") is False or var.get("show_assist") is False:
                    off = True
            eu = var.get("casora_entity_users")
            if isinstance(eu, dict):
                for eid, ids in eu.items():
                    if isinstance(ids, list) and ids:
                        ids = {str(i) for i in ids}
                        users[eid] = (users[eid] & ids) if eid in users else ids
            for k in ("views", "cards", "card", "sections"):
                if k in o:
                    walk(o[k], depth + 1)

        walk(cfg, 0)
        wanted = wanted or not off
    return wanted, users


def snapshot(hass, user_id: str | None = None) -> dict:
    """Areas and the entities Assist may talk about, as plain dicts (state, registry area, device, category).

    Only entities exposed to Assist (Settings > Voice assistants > Expose; HA's own intents see no others, and an
    LLM gets nothing else) and, for this user, not hidden by Casora's "Who sees this?".
    """
    from homeassistant.helpers import area_registry as ar
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import entity_registry as er

    try:
        from homeassistant.components.homeassistant import async_should_expose
    except ImportError:  # HA moved it: tell nothing rather than everything
        async_should_expose = None

    def exposed(entity_id: str) -> bool:
        if async_should_expose is None:
            return False
        try:
            return bool(async_should_expose(hass, "conversation", entity_id))
        except Exception:  # noqa: BLE001 - exposure unknown: not exposed
            return False

    users = hass.data.get(DOMAIN, {}).get("assist_users") or {}
    areg, dreg, ereg = ar.async_get(hass), dr.async_get(hass), er.async_get(hass)
    areas = [{"id": a.id, "name": a.name, "aliases": sorted(a.aliases or [])} for a in areg.async_list_areas()]
    ents = []
    for st in hass.states.async_all():
        if not sees(st.entity_id, user_id, users) or not exposed(st.entity_id):
            continue
        ent = ereg.async_get(st.entity_id)
        dev = dreg.async_get(ent.device_id) if ent and ent.device_id else None
        unit = st.attributes.get("unit_of_measurement")
        attrs: dict = {}
        if st.domain == "weather":
            attrs = {k: st.attributes.get(k) for k in ("temperature", "temperature_unit")}
        elif st.domain == "climate":
            attrs = {"current_temperature": st.attributes.get("current_temperature")}
            unit = hass.config.units.temperature_unit
        ents.append({
            "entity_id": st.entity_id, "domain": st.domain, "state": st.state,
            "name": st.attributes.get("friendly_name") or st.entity_id,
            "device_class": st.attributes.get("device_class"),
            "unit": unit,
            "attributes": attrs,
            "area_id": (ent.area_id if ent and ent.area_id else (dev.area_id if dev else None)),
            "device_id": ent.device_id if ent else None,
            "device": (dev.name_by_user or dev.name) if dev else "",
            "category": str(ent.entity_category) if ent and ent.entity_category else None,
            "hidden": bool(ent and ent.hidden_by),
        })
    return {"areas": areas, "entities": ents}


async def _energy_used(hass, entity_id: str, period: str) -> float | None:
    """kWh the energy sensor counted since the start of today / this week / this month (recorder statistics)."""
    from datetime import timedelta

    from homeassistant.util import dt as dt_util

    from .ki import _stats

    now = dt_util.now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start -= timedelta(days=start.weekday())
    elif period == "month":
        start = start.replace(day=1)
    try:
        rows = await _stats(hass, [entity_id], dt_util.as_utc(start), "hour", {"change"}, {"energy": "kWh"})
    except Exception:  # noqa: BLE001 - no recorder or no statistics: the answer goes without a number
        return None
    vals = [r.get("change") for r in (rows or {}).get(entity_id, []) if isinstance(r.get("change"), (int, float))]
    return round(sum(max(0.0, v) for v in vals), 3) if vals else None


class Pending:
    """The last target per user, until the chat fetches it or TTL passes."""

    def __init__(self) -> None:
        self.rows: dict[str, tuple[float, dict]] = {}

    def put(self, user_id: str | None, target: dict | None) -> None:
        if user_id and target:
            self.rows[user_id] = (time.monotonic(), target)

    def take(self, user_id: str | None) -> dict | None:
        row = self.rows.pop(user_id or "", None)
        if not row or time.monotonic() - row[0] > TTL:
            return None
        return row[1]


def _pending(hass) -> Pending:
    data = hass.data.setdefault(DOMAIN, {})
    if not isinstance(data.get("assist_pending"), Pending):
        data["assist_pending"] = Pending()
    return data["assist_pending"]


async def async_answer(hass, kind: str, slots: dict, lang: str | None, user_id: str | None) -> tuple[str, dict | None]:
    """Resolve a request, remember its target for the user's chat and return (speech, target)."""
    slots = dict(slots or {})
    if kind == "energy":
        said = fold(slots.get("_said", ""))
        slots.setdefault("_period", next((p for w, p in PERIODS.items() if fold(w) in said), None))
    snap = snapshot(hass, user_id)
    speech, target = resolve(kind, slots, snap, lang)
    if target and target["view"] == "energy":
        used = await _energy_used(hass, target["entity_id"], target.get("period") or "week")
        if used is not None:
            slots["_used"] = used
            speech, target = resolve(kind, slots, snap, lang)
    _pending(hass).put(user_id, target)
    return speech, target


async def _async_setup_triggers(hass):
    """Sentence triggers for HA's own Assist agent; returns the remove callback or None."""
    from homeassistant.helpers.script import ScriptRunResult
    from homeassistant.helpers.trigger import async_initialize_triggers, async_validate_trigger_config

    conf = [{"platform": "conversation", "id": kind, "command": sentences} for kind, sentences in SENTENCES.items()]
    conf = await async_validate_trigger_config(hass, conf)

    async def action(run_variables: dict, context=None):
        trig = run_variables.get("trigger") or {}
        user_input = trig.get("user_input") or {}
        ctx = user_input.get("context") or {}
        slots = {k: v for k, v in (trig.get("slots") or {}).items() if isinstance(v, str)}
        slots["_said"] = trig.get("sentence") or ""
        speech, _target = await async_answer(hass, str(trig.get("id")), slots, user_input.get("language"),
                                             ctx.get("user_id"))
        return ScriptRunResult(conversation_response=speech, service_response=None, variables={})

    return await async_initialize_triggers(hass, conf, action, DOMAIN, "Casora Assist", lambda lvl, msg, **kw: _LOGGER.log(lvl, msg))


def _api(hass):
    """The LLM API "Casora" with its one tool casora_show, or None when this HA has no LLM helper."""
    try:
        from homeassistant.helpers import llm
    except ImportError:
        return None
    if not hasattr(llm, "async_register_api"):
        return None
    try:
        import probatio as schema
    except ImportError:  # HA before 2026.11
        import voluptuous as schema

    class ShowTool(llm.Tool):
        name = "casora_show"
        description = (
            "Show the matching Casora popup on the user's dashboard and get a short answer: the climate of a room "
            "(or the warmest/coldest room), the lights of a room or of the whole house, the energy use of a device, "
            "a camera, the weather, security (open doors and windows) or a room page. Call it whenever the user "
            "asks to see or show one of these, also after switching something."
        )
        parameters = schema.Schema({
            schema.Required("view"): schema.In(list(VIEWS)),
            schema.Optional("area"): str,
            schema.Optional("name"): str,
            schema.Optional("extreme"): schema.In(["warmest", "coldest"]),
            schema.Optional("period"): schema.In(["day", "week", "month"]),
        })

        async def async_call(self, hass_, tool_input, llm_context):
            kind, slots = kind_for_tool(tool_input.tool_args or {})
            ctx = llm_context.context
            speech, target = await async_answer(hass_, kind, slots, llm_context.language,
                                                getattr(ctx, "user_id", None) if ctx else None)
            return {"answer": speech, "shown": bool(target)}

    class CasoraAPI(llm.API):
        async def async_get_api_instance(self, llm_context):
            return llm.APIInstance(
                api=self,
                api_prompt=("When the user asks to see something in their home (a room's climate, lights, a device's "
                            "energy use, a camera, the weather, security, a room), call casora_show; say its answer."),
                llm_context=llm_context,
                tools=[ShowTool()],
            )

    return llm, CasoraAPI(hass=hass, id=API_ID, name="Casora")


def _register_ws(hass) -> None:
    import voluptuous as vol

    from homeassistant.components import websocket_api
    from homeassistant.core import callback

    @websocket_api.websocket_command({vol.Required("type"): "casora/assist/take"})
    @callback
    def ws_take(hass_, connection, msg) -> None:
        user = connection.user
        connection.send_result(msg["id"], {"target": _pending(hass_).take(user.id if user else None)})

    websocket_api.async_register_command(hass, ws_take)


async def _async_dashboards(hass) -> tuple[bool, dict[str, set]]:
    """dashboards_state() of every dashboard Lovelace knows; (False, {}) when they cannot be read."""
    from .dashboard_kinds import UNREADABLE, async_dashboard_configs

    try:
        configs = await async_dashboard_configs(hass)
    except Exception:  # noqa: BLE001 - no Lovelace data: no sentences
        _LOGGER.debug("Casora Assist: dashboards not readable", exc_info=True)
        return False, {}
    return dashboards_state([c for c in configs.values() if c is not UNREADABLE])


class _Runtime:
    """What async_setup_assist_show set up: the sentence triggers follow the dashboards' switch."""

    def __init__(self, hass) -> None:
        self.hass = hass
        self.removes: list = []         # LLM API, event listeners
        self.triggers = None            # remove callback of the sentence triggers while they are registered
        self.closed = False
        self._lock = None

    async def async_refresh(self) -> None:
        """Read the dashboards; register or remove the sentences to match (only while conversation is loaded)."""
        import asyncio

        if self._lock is None:
            self._lock = asyncio.Lock()
        async with self._lock:
            if self.closed:
                return
            wanted, users = await _async_dashboards(self.hass)
            self.hass.data.setdefault(DOMAIN, {})["assist_users"] = users
            wanted = wanted and "conversation" in self.hass.config.components
            if wanted and self.triggers is None:
                try:
                    self.triggers = await _async_setup_triggers(self.hass)
                except Exception:  # noqa: BLE001 - Assist without Casora's sentences, nothing else changes
                    _LOGGER.warning("Casora's Assist sentences could not be registered", exc_info=True)
            elif not wanted and self.triggers is not None:
                rm, self.triggers = self.triggers, None
                rm()

    def close(self) -> None:
        self.closed = True
        for rm in self.removes + ([self.triggers] if self.triggers else []):
            try:
                rm()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("remove failed", exc_info=True)
        self.removes, self.triggers = [], None


async def async_setup_assist_show(hass, entry) -> None:
    """Chat websocket, LLM API "Casora" and the sentence triggers. Never stops Casora's setup: anything HA changed
    under it only costs this feature (a warning in the log)."""
    try:
        await _async_setup(hass)
    except Exception:  # noqa: BLE001
        _LOGGER.warning("Casora: Assist shows the matching popup is not available", exc_info=True)


async def _async_setup(hass) -> None:
    from homeassistant.const import EVENT_COMPONENT_LOADED
    from homeassistant.core import callback
    from homeassistant.helpers.start import async_at_started

    data = hass.data.setdefault(DOMAIN, {})
    _pending(hass)
    if not data.get("assist_ws"):
        _register_ws(hass)
        data["assist_ws"] = True
    old = data.pop("assist_rt", None)
    if isinstance(old, _Runtime):
        old.close()
    rt = data["assist_rt"] = _Runtime(hass)

    # The LLM API only acts where a user picked "Casora" in an LLM agent's options.
    try:
        api = _api(hass)
        if api:
            llm, inst = api
            rt.removes.append(llm.async_register_api(hass, inst))
    except Exception:  # noqa: BLE001 - an API of that id already there, or HA's llm helper changed
        _LOGGER.debug("Casora LLM API not registered", exc_info=True)

    @callback
    def changed(event=None) -> None:
        # A dashboard saved (the Studio switch, a new Casora dashboard), conversation loaded later, HA started.
        if event is not None and event.event_type == EVENT_COMPONENT_LOADED \
                and event.data.get("component") != "conversation":
            return
        hass.async_create_task(rt.async_refresh())

    rt.removes.append(hass.bus.async_listen("lovelace_updated", changed))
    rt.removes.append(hass.bus.async_listen(EVENT_COMPONENT_LOADED, changed))
    if not hass.is_running:
        rt.removes.append(async_at_started(hass, lambda _hass: changed()))
    await rt.async_refresh()


def async_unload_assist_show(hass) -> None:
    """Remove the sentence triggers and the LLM API (the websocket stays until the restart)."""
    data = hass.data.get(DOMAIN, {})
    rt = data.pop("assist_rt", None)
    if isinstance(rt, _Runtime):
        rt.close()
    data.pop("assist_pending", None)
    data.pop("assist_users", None)
