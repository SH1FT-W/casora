"""Mealie as a source of the recipe tile (mealie_plan.py, issue #140), without a running HA.

  "$(tools/ha-venv.sh install)/bin/python" dev/unit/mealie_plan_test.py
  uv run --python 3.14 --with homeassistant python dev/unit/mealie_plan_test.py

@ha-venv: the gate runs this file with the Python of tools/ha-venv.sh.

A fake hass answers mealie.get_mealplan / mealie.get_recipe in the shapes of HA's own snapshots
(tests/components/mealie/snapshots/test_services.ambr: dataclasses as dicts, dates as date objects, entry_type as
an enum). Checks: 7 days from today in the order of a day, dinner first for the featured dish, the next planned day
when today is empty, a note without recipe, times and servings read from Mealie's fields, the recipe's
description/ingredients/steps, no Mealie, Mealie not loaded, Mealie failing, the cache, signed image URLs and the
image view refusing recipes outside the plan.
"""

from __future__ import annotations

import asyncio
import enum
import os
import sys
from datetime import date, timedelta
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.config_entries import ConfigEntryState  # noqa: E402

from custom_components.casora import mealie_plan as M  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


class EntryType(enum.StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SIDE = "side"


TODAY = date(2026, 11, 7)


def recipe(name, rid, **kw):
    r = {"categories": [], "description": "Kurz.", "image": "AiIo", "name": name, "recipe_id": rid,
         "slug": name.lower().replace(" ", "-"), "recipe_servings": None, "recipe_yield": None,
         "recipe_yield_quantity": None, "tags": [], "total_time": None, "total_time_seconds": None,
         "prep_time": None, "prep_time_seconds": None, "perform_time": None, "perform_time_seconds": None}
    r.update(kw)
    return r


RID_A = "c5f00a93-71a2-4e48-900f-d9ad0bb9de93"
RID_B = "5b055066-d57d-4fd0-8dfd-a2c2f07b36f1"
RID_C = "e360a0cc-18b0-4a84-a91b-8aa59e2451c9"
PLAN = [
    {"description": None, "entry_type": EntryType.BREAKFAST, "mealplan_date": TODAY, "mealplan_id": 1, "title": None,
     "recipe": recipe("Porridge", RID_C, total_time="10 Minutes", recipe_yield="1 serving")},
    {"description": None, "entry_type": EntryType.DINNER, "mealplan_date": TODAY, "mealplan_id": 2, "title": None,
     "recipe": recipe("Pumpkin soup", RID_A, total_time="1 Hour 35 Minutes", recipe_servings=4.0,
                      tags=[{"name": "Vegetarian", "slug": "vegetarian", "tag_id": "x"}, {"name": "Autumn"}])},
    {"description": None, "entry_type": EntryType.LUNCH, "mealplan_date": TODAY, "mealplan_id": 3, "title": None,
     "recipe": recipe("Salad", RID_B, prep_time="15 Minutes", perform_time="5 Minutes", recipe_yield="2 servings", image=None)},
    {"description": "What is left", "entry_type": EntryType.DINNER, "mealplan_date": TODAY + timedelta(days=2),
     "mealplan_id": 4, "title": "Leftovers", "recipe": None},
    # Outside the week: ignored.
    {"description": None, "entry_type": EntryType.DINNER, "mealplan_date": TODAY + timedelta(days=7), "mealplan_id": 5,
     "title": None, "recipe": recipe("Later", RID_B)},
]
RECIPE = recipe("Pumpkin soup", RID_A, description="A " * 600, ingredients=[
    {"display": "1 pumpkin", "note": "1 pumpkin", "title": None, "food": None, "unit": None},
    {"display": "250 millilitre Water", "note": "", "title": "For the broth", "food": {"name": "Water"}, "unit": {"name": "millilitre"}},
    {"display": "", "note": "", "title": None},
], instructions=[{"title": None, "text": "Cut."}, {"title": "Cook", "text": "Simmer 20 minutes."}, {"title": None, "text": ""}])


class FakeServices:
    def __init__(self, plan=PLAN, fail=None):
        self.plan, self.fail, self.calls = plan, fail, []

    async def async_call(self, domain, service, data, blocking=False, return_response=False):
        self.calls.append((domain, service, dict(data), blocking, return_response))
        if self.fail == service:
            raise RuntimeError("Mealie unreachable")
        if service == "get_mealplan":
            s, e = date.fromisoformat(data["start_date"]), date.fromisoformat(data["end_date"])
            return {"mealplan": [p for p in self.plan if s <= p["mealplan_date"] <= e]}
        if service == "get_recipe":
            return {"recipe": RECIPE}
        raise AssertionError(service)


def fake_hass(entries, services):
    return SimpleNamespace(data={}, services=services,
                           config_entries=SimpleNamespace(async_entries=lambda d: entries if d == "mealie" else []))


ENTRY = SimpleNamespace(entry_id="e1", state=ConfigEntryState.LOADED, data={"host": "http://mealie.lan:9000", "api_token": "x"})
M.dt_util = SimpleNamespace(now=lambda: SimpleNamespace(date=lambda: TODAY))
M.sign_photo_url = lambda hass, url, rt, base=None: url + "&authSig=" + str(rt) if url.startswith(base + "/") else url


async def main():
    # Pure helpers.
    check("minutes: text with hours", M.minutes(None, "1 Hour 35 Minutes") == 95)
    check("minutes: seconds first", M.minutes(2400, "1 Hour") == 40)
    check("minutes: ISO", M.minutes(None, "PT40M") == 40 and M.minutes(None, "PT1H") == 60)
    check("minutes: German/short", M.minutes(None, "30 min") == 30 and M.minutes(None, "1,5 Std.") == 90)
    check("minutes: unreadable", M.minutes(None, "overnight") is None and M.minutes(None, "") is None)
    check("servings: number", M.servings({"recipe_servings": 4.0}) == (4, None))
    check("servings: yield text with number", M.servings({"recipe_yield": "6 servings"}) == (6, None))
    check("servings: other yield text kept", M.servings({"recipe_yield": "1 loaf"}) == (None, "1 loaf"))
    check("recipe_minutes: prep + perform", M.recipe_minutes({"prep_time": "15 Minutes", "perform_time": "5 Minutes"}) == (20, None))

    # The whole flow.
    sv = FakeServices()
    hass = fake_hass([ENTRY], sv)
    data = await M.async_plan(hass)
    check("state ok", data["state"] == "ok", data["state"])
    check("7 days from today", [d["date"] for d in data["days"]] == [(TODAY + timedelta(days=i)).isoformat() for i in range(7)])
    today = data["days"][0]["meals"]
    check("meals in the order of a day", [m["type"] for m in today] == ["breakfast", "lunch", "dinner"], [m["type"] for m in today])
    check("plan asked for today … +6", sv.calls[0][:2] == ("mealie", "get_mealplan")
          and sv.calls[0][2] == {"config_entry_id": "e1", "start_date": "2026-11-07", "end_date": "2026-11-13"}
          and sv.calls[0][3] and sv.calls[0][4], sv.calls[0])
    f = data["featured"]
    check("featured: dinner first", f["name"] == "Pumpkin soup" and f["type"] == "dinner" and f["date"] == "2026-11-07")
    check("featured: time, servings, tags", f["minutes"] == 95 and f["servings"] == 4 and f["tags"] == ["Vegetarian", "Autumn"], f)
    check("recipe fetched by slug", sv.calls[1][1] == "get_recipe" and sv.calls[1][2]["recipe_id"] == "pumpkin-soup", sv.calls[1])
    det = f.get("detail") or {}
    check("detail: description shortened", det.get("description", "").endswith(" …") and len(det["description"]) <= M.MAX_DESC + 2)
    check("detail: ingredients with section title, empty dropped",
          det.get("ingredients") == [{"text": "1 pumpkin"}, {"title": "For the broth"}, {"text": "250 millilitre Water"}], det.get("ingredients"))
    check("detail: steps without empty ones", det.get("steps") == [{"title": None, "text": "Cut."}, {"title": "Cook", "text": "Simmer 20 minutes."}])
    salad = today[1]
    check("lunch: prep + perform time, yield", salad["minutes"] == 20 and salad["servings"] == 2 and not salad["has_image"])
    note = data["days"][2]["meals"][0]
    check("note without recipe", note == {"type": "dinner", "note": True, "name": "Leftovers", "text": "What is left"}, note)
    check("outside the week ignored", all(m.get("name") != "Later" for d in data["days"] for m in d["meals"]))

    # Signed images: only meals with an image, the key as ?v=.
    out = M.with_images(hass, data, "rt1")
    img = out["featured"].get("image")
    check("featured image signed", img == f"/api/casora/mealie/image/{RID_A}?v=AiIo&authSig=rt1", img)
    check("no image without one", "image" not in out["days"][0]["meals"][1])
    check("image key not sent", all("image_key" not in m and "has_image" not in m for d in out["days"] for m in d["meals"]))

    # Cache: the second call within five minutes does not ask Mealie again; refresh does.
    n = len(sv.calls)
    await M.async_plan(hass)
    check("cached", len(sv.calls) == n)
    await M.async_plan(hass, refresh=True)
    check("refresh asks again", len(sv.calls) == n + 2)

    # Today empty: the next planned day.
    sv2 = FakeServices(plan=[p for p in PLAN if p["mealplan_date"] != TODAY])
    d2 = await M.async_plan(fake_hass([ENTRY], sv2))
    check("next planned day when today is empty", d2["featured"]["date"] == "2026-11-09" and d2["featured"]["note"], d2["featured"])
    check("no recipe asked for a note", [c[1] for c in sv2.calls] == ["get_mealplan"])

    # Nothing planned.
    d3 = await M.async_plan(fake_hass([ENTRY], FakeServices(plan=[])))
    check("nothing planned", d3["state"] == "ok" and d3["featured"] is None and all(not d["meals"] for d in d3["days"]))

    # No Mealie, Mealie not loaded, Mealie failing, recipe failing.
    sv4 = FakeServices()
    d4 = await M.async_plan(fake_hass([], sv4))
    check("no mealie", d4["state"] == "none" and not sv4.calls)
    off = SimpleNamespace(entry_id="e2", state=ConfigEntryState.SETUP_RETRY, data={})
    d5 = await M.async_plan(fake_hass([off], FakeServices()))
    check("mealie not loaded", d5["state"] == "unavailable")
    d6 = await M.async_plan(fake_hass([ENTRY], FakeServices(fail="get_mealplan")))
    check("mealie failing", d6["state"] == "unavailable" and d6["featured"] is None)
    d7 = await M.async_plan(fake_hass([ENTRY], FakeServices(fail="get_recipe")))
    check("recipe failing: plan without detail", d7["state"] == "ok" and d7["featured"]["name"] == "Pumpkin soup" and "detail" not in d7["featured"])

    # Image view: recipes outside the plan and malformed ids are refused before anything is fetched.
    view = M.CasoraMealieImageView()
    req = SimpleNamespace(app={"hass": hass}, query={})
    r1 = await view.get(req, "5b055066-d57d-4fd0-8dfd-a2c2f07b36ff")
    check("image: recipe outside the plan refused", r1.status == 404)
    r2 = await view.get(req, "../../etc/passwd")
    check("image: malformed id refused", r2.status == 404)
    check("view needs login", view.requires_auth is True)


asyncio.run(main())
print("ok mealie_plan" if not fails else f"{fails} FEHLER")
sys.exit(1 if fails else 0)
