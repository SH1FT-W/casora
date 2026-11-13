"""Mealie as a source of the recipe tile and popup (issue #140).

Only Home Assistant's own ``mealie`` integration and its public actions are used: ``mealie.get_mealplan``
(today … +6 days) and ``mealie.get_recipe`` for the featured dish, both with ``return_response``. The answer is
shaped into a small JSON for the dashboard and kept for a few minutes.

  casora/mealie/plan [refresh] → {"state": "ok" | "none" | "unavailable", "today", "days": [{date, meals}],
                                  "featured": meal + {"date", "detail"} | None}

The recipe image comes through CasoraMealieImageView: Mealie usually runs over plain http on the LAN while the
dashboard is https, so the browser could not load Mealie's own address. The view fetches Mealie's public media
URL (``/api/media/recipes/<id>/images/min-original.webp``) from the host in the mealie config entry, only for
recipes of the current plan; the dashboard gets signed URLs (images.sign_photo_url).
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime, timedelta
from typing import Any

import voluptuous as vol
from aiohttp import ClientError, web

from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .images import sign_photo_url

_LOGGER = logging.getLogger(__name__)

MEALIE = "mealie"
IMAGE_URL_BASE = "/api/casora/mealie/image"
DAYS = 7
CACHE_TTL = 300   # a fresh plan every five minutes at most
ERROR_TTL = 60    # Mealie unreachable: ask again after a minute
# Meal types as the mealie calendars name them (translation_key), in the order of a day.
TYPES = ("breakfast", "lunch", "dinner", "side", "dessert", "snack", "drink")
# Today's dish when several are planned: dinner first, else lunch, else breakfast, else the first other one.
MAIN = ("dinner", "lunch", "breakfast")
MAX_DESC = 700
MAX_INGREDIENTS = 80
MAX_STEPS = 40
MAX_IMAGE = 4 * 1024 * 1024
RECIPE_ID = re.compile(r"^[0-9a-fA-F-]{32,36}$")
# Only raster images are passed on (never SVG/HTML from the Mealie host under HA's origin).
IMAGE_TYPES = frozenset(("image/webp", "image/jpeg", "image/png", "image/gif", "image/avif"))
_CACHE = "mealie_plan"


# ── Shaping (pure, tested in dev/unit/mealie_plan_test.py) ────────────────────────────────────────────────


def _val(x: Any) -> Any:
    """Enum → its value (entry_type is a StrEnum in the response)."""
    return getattr(x, "value", x)


def _text(x: Any) -> str | None:
    t = str(x).strip() if x is not None else ""
    return t or None


def minutes(seconds: Any, text: Any) -> int | None:
    """Minutes from Mealie's time fields: the seconds if given, else the text ("1 Hour 35 Minutes", "PT40M", "40 min")."""
    try:
        if seconds is not None and float(seconds) > 0:
            return max(1, round(float(seconds) / 60))
    except (TypeError, ValueError):
        pass
    t = str(text or "").strip().lower()
    if not t:
        return None
    iso = re.fullmatch(r"p?t?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", t.replace(" ", ""))
    if iso and any(iso.groups()) and t.startswith(("p", "t")):
        return int(iso.group(1) or 0) * 60 + int(iso.group(2) or 0) or None
    h = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:h\b|hours?|hrs?|std|stunden?)", t)
    m = re.search(r"(\d+)\s*(?:m\b|min|minutes?|minuten?)", t)
    if not h and not m:
        bare = re.fullmatch(r"(\d+)", t)
        return int(bare.group(1)) if bare else None
    total = (float(h.group(1).replace(",", ".")) * 60 if h else 0) + (int(m.group(1)) if m else 0)
    return round(total) or None


def recipe_minutes(r: dict) -> tuple[int | None, str | None]:
    """(minutes, raw text) – total time, else preparation + cooking; the text when it cannot be read as time."""
    total = minutes(r.get("total_time_seconds"), r.get("total_time"))
    if total:
        return total, None
    parts = [minutes(r.get(f"{k}_seconds"), r.get(k)) for k in ("prep_time", "perform_time")]
    if any(parts):
        return sum(p or 0 for p in parts), None
    return None, _text(r.get("total_time"))


def servings(r: dict) -> tuple[float | None, str | None]:
    """(number of servings, yield text) – recipe_servings, else the number in the yield ("2 servings")."""
    for k in ("recipe_servings", "recipe_yield_quantity"):
        try:
            n = float(r.get(k) or 0)
        except (TypeError, ValueError):
            n = 0
        if n > 0:
            return (int(n) if n == int(n) else n), None
    y = _text(r.get("recipe_yield"))
    if not y:
        return None, None
    m = re.fullmatch(r"(\d+)\s*(?:servings?|portions?|portionen|personen|persons?|people)?", y.lower())
    if m:
        return int(m.group(1)), None
    return None, y


def shape_meal(item: dict) -> dict:
    """One meal plan entry; a note without recipe keeps its title and text."""
    r = item.get("recipe") if isinstance(item.get("recipe"), dict) else None
    out: dict[str, Any] = {"type": _val(item.get("entry_type")) or "dinner"}
    if not r:
        out.update({"note": True, "name": _text(item.get("title")), "text": _text(item.get("description"))})
        return out
    mins, mtext = recipe_minutes(r)
    serv, ytext = servings(r)
    out.update({
        "note": False, "name": _text(r.get("name")), "recipe_id": _text(r.get("recipe_id")), "slug": _text(r.get("slug")),
        "minutes": mins, "time_text": mtext, "servings": serv, "yield_text": ytext,
        "tags": [t["name"] for t in (r.get("tags") or []) if isinstance(t, dict) and _text(t.get("name"))],
        "has_image": bool(r.get("image")), "image_key": _text(r.get("image")),
    })
    return out


def _day(x: Any) -> date | None:
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, date):
        return x
    try:
        return date.fromisoformat(str(x)[:10])
    except ValueError:
        return None


def shape_plan(items: list, start: date, days: int = DAYS) -> list[dict]:
    """The days start … start+days-1, each with its meals in the order of a day."""
    by: dict[date, list] = {start + timedelta(days=i): [] for i in range(days)}
    for it in items or []:
        if not isinstance(it, dict):
            continue
        d = _day(it.get("mealplan_date"))
        if d in by:
            by[d].append(shape_meal(it))
    rank = {t: i for i, t in enumerate(TYPES)}
    return [{"date": d.isoformat(), "meals": sorted(m, key=lambda x: rank.get(x["type"], len(TYPES)))}
            for d, m in sorted(by.items())]


def main_meal(meals: list[dict]) -> dict | None:
    """The day's dish: dinner, else lunch, else breakfast, else the first; a recipe before a note of the same type."""
    if not meals:
        return None
    order = {t: i for i, t in enumerate(MAIN)}
    return sorted(meals, key=lambda m: (order.get(m["type"], len(MAIN)), m.get("note", False)))[0]


def featured(days: list[dict]) -> dict | None:
    """Today's dish, else the next planned one within the week."""
    for d in days:
        m = main_meal(d["meals"])
        if m:
            return {**m, "date": d["date"]}
    return None


def shape_recipe(r: dict) -> dict:
    """Description, ingredient lines (with section titles) and steps of one recipe."""
    desc = _text(r.get("description")) or ""
    if len(desc) > MAX_DESC:
        desc = desc[:MAX_DESC].rsplit(" ", 1)[0].rstrip(" ,.;:") + " …"
    ing: list[dict] = []
    for i in (r.get("ingredients") or [])[:MAX_INGREDIENTS]:
        if not isinstance(i, dict):
            continue
        if _text(i.get("title")):
            ing.append({"title": _text(i.get("title"))})
        t = _text(i.get("display")) or _text(i.get("note")) or _text(i.get("original_text"))
        if t:
            ing.append({"text": t})
    steps = [{"title": _text(s.get("title")), "text": _text(s.get("text"))}
             for s in (r.get("instructions") or [])[:MAX_STEPS] if isinstance(s, dict) and _text(s.get("text"))]
    return {"description": desc or None, "ingredients": ing, "steps": steps}


# ── Mealie ────────────────────────────────────────────────────────────────────────────────────────────────


def mealie_entry(hass: HomeAssistant):
    """(entry, state): the first mealie config entry, preferring a loaded one; state "none" without any."""
    entries = hass.config_entries.async_entries(MEALIE)
    if not entries:
        return None, "none"
    loaded = [e for e in entries if e.state is ConfigEntryState.LOADED]
    return (loaded[0], "ok") if loaded else (entries[0], "unavailable")


async def _call(hass: HomeAssistant, service: str, data: dict) -> dict:
    res = await hass.services.async_call(MEALIE, service, data, blocking=True, return_response=True)
    return res if isinstance(res, dict) else {}


async def async_fetch(hass: HomeAssistant, entry_id: str, today: date) -> dict:
    """Plan of the week and the featured recipe, shaped (raises when Mealie does not answer)."""
    res = await _call(hass, "get_mealplan", {"config_entry_id": entry_id, "start_date": today.isoformat(),
                                             "end_date": (today + timedelta(days=DAYS - 1)).isoformat()})
    days = shape_plan(res.get("mealplan") or [], today)
    feat = featured(days)
    if feat and not feat.get("note") and (feat.get("slug") or feat.get("recipe_id")):
        try:
            rec = await _call(hass, "get_recipe", {"config_entry_id": entry_id,
                                                   "recipe_id": feat.get("slug") or feat["recipe_id"]})
            if isinstance(rec.get("recipe"), dict):
                feat["detail"] = shape_recipe(rec["recipe"])
        except Exception as err:  # noqa: BLE001 - the plan still shows without the recipe's details
            _LOGGER.debug("Casora: mealie.get_recipe failed: %s", err)
    return {"state": "ok", "today": today.isoformat(), "days": days, "featured": feat}


async def async_plan(hass: HomeAssistant, refresh: bool = False) -> dict:
    """The shaped plan, kept CACHE_TTL seconds (errors ERROR_TTL) per entry and day."""
    entry, state = mealie_entry(hass)
    today = dt_util.now().date()
    if entry is None or state != "ok":
        return {"state": state, "today": today.isoformat(), "days": [], "featured": None}
    cache = hass.data.setdefault(DOMAIN, {}).setdefault(_CACHE, {})
    key = (entry.entry_id, today.isoformat())
    hit = cache.get("plan")
    now = time.monotonic()
    if not refresh and hit and hit[0] == key and now < hit[1]:
        return hit[2]
    try:
        data = await async_fetch(hass, entry.entry_id, today)
        ttl = CACHE_TTL
    except Exception as err:  # noqa: BLE001 - Mealie down or the action missing: say so, ask again soon
        _LOGGER.debug("Casora: mealie.get_mealplan failed: %s", err)
        data = {"state": "unavailable", "today": today.isoformat(), "days": [], "featured": None}
        ttl = ERROR_TTL
    cache["plan"] = (key, now + ttl, data)
    # Recipes the image view may fetch: only those of the current plan.
    cache["recipes"] = {m["recipe_id"] for d in data["days"] for m in d["meals"] if m.get("recipe_id")}
    return data


def with_images(hass: HomeAssistant, data: dict, refresh_token_id: str | None) -> dict:
    """A copy with a signed image URL on each recipe meal that has an image (image_key dropped)."""

    def meal(m: dict) -> dict:
        out = {k: v for k, v in m.items() if k not in ("has_image", "image_key")}
        if m.get("has_image") and m.get("recipe_id"):
            url = f"{IMAGE_URL_BASE}/{m['recipe_id']}?v={m.get('image_key') or ''}"
            out["image"] = sign_photo_url(hass, url, refresh_token_id, base=IMAGE_URL_BASE)
        return out

    out = dict(data)
    out["days"] = [{**d, "meals": [meal(m) for m in d["meals"]]} for d in data.get("days") or []]
    if data.get("featured"):
        out["featured"] = meal(data["featured"])
    return out


@websocket_api.websocket_command({vol.Required("type"): "casora/mealie/plan", vol.Optional("refresh"): bool})
@websocket_api.async_response
async def ws_plan(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    data = await async_plan(hass, bool(msg.get("refresh")))
    connection.send_result(msg["id"], with_images(hass, data, connection.refresh_token_id))


class CasoraMealieImageView(HomeAssistantView):
    """A recipe image from Mealie, through HA (login or signed URL), for recipes of the current plan only."""

    url = IMAGE_URL_BASE + "/{recipe_id}"
    name = "api:casora:mealie_image"
    requires_auth = True

    async def get(self, request: web.Request, recipe_id: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        known = hass.data.get(DOMAIN, {}).get(_CACHE, {}).get("recipes") or set()
        if not RECIPE_ID.match(recipe_id) or recipe_id not in known:
            return web.Response(status=404, text="not found")
        entry, state = mealie_entry(hass)
        host = str((entry.data.get("host") if entry else "") or "").rstrip("/")
        if state != "ok" or not host.startswith(("http://", "https://")):
            return web.Response(status=404, text="not found")
        session = async_get_clientsession(hass, verify_ssl=bool(entry.data.get("verify_ssl", True)))
        try:
            async with session.get(f"{host}/api/media/recipes/{recipe_id}/images/min-original.webp",
                                   timeout=10, allow_redirects=False) as resp:
                ctype = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
                if resp.status != 200 or ctype not in IMAGE_TYPES:
                    return web.Response(status=404, text="not found")
                body = await resp.content.read(MAX_IMAGE + 1)
        except (ClientError, TimeoutError) as err:
            _LOGGER.debug("Casora: Mealie image failed: %s", err)
            return web.Response(status=502, text="mealie unavailable")
        if len(body) > MAX_IMAGE:
            return web.Response(status=404, text="too large")
        # ?v= is Mealie's image key: it changes with a new image, so a day in the private cache is safe.
        return web.Response(body=body, content_type=ctype, headers={
            "Cache-Control": "private, max-age=86400" if "v" in request.query else "private, no-cache",
            "X-Content-Type-Options": "nosniff"})


@callback
def async_setup_mealie_plan(hass: HomeAssistant) -> None:
    dom = hass.data.setdefault(DOMAIN, {})
    if dom.get("mealie_plan_ws"):
        return
    websocket_api.async_register_command(hass, ws_plan)
    dom["mealie_plan_ws"] = True
