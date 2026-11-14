"""HA diagnostics download of the Casora entry (diagnostics.py), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/diagnostics_test.py

V27a (14.11.2026). Checks: versions, counts and switches are in it; nothing personal is (entity ids, names, areas,
zone names, dashboard addresses/titles, calendar and event titles, keys, tokens, URLs, coordinates, error texts),
even where such values sit under Casora's own keys; the list of named integrations equals the Studio's.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from collections import Counter
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import diagnostics as dg  # noqa: E402
from custom_components.casora.const import DOMAIN, VERSION  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


# Personal-looking values planted everywhere; none may show up in the result.
SECRETS = [
    "sensor.test_waste_bio", "calendar.familie_mueller", "Familie Müller", "Tante Erna", "Büro Hauptstraße", "media_player.test_speaker_one",
    "person.anna", "binary_sensor.terrassentur", "dashboard-anna", "Annas Handy", "Wohnzimmer Anna", "wohnzimmer_anna",
    "sk-TESTKEY123", "00000000-1111-2222-3333-444444444444", "https://anna.duckdns.org", "48.1371", "11.5754",
    "Zahnarzt Dr. Huber", "ai_task.openai_anna", "anna@example.org", "light.kinderzimmer_lena",
]

SETTINGS = {
    "waste": {"sensors": {"sensor.test_waste_bio": "Bio"}, "calendar": "calendar.familie_mueller", "duty_months": [1, 4]},
    "calendars": [{"entity": "calendar.familie_mueller", "name": "Familie Müller", "color": "#ff0000"}],
    "notify": {"zone_phrases": {"Tante Erna": "bei Tante Erna", "Büro Hauptstraße": "im Büro"}, "mail": "anna@example.org",
               "contact_merged": {"binary_sensor.terrassentur": ["a", "b"]}},
    "media": {"players": {"media_player.test_speaker_one": {"name": "Annas Handy"}}},
    "night_entity": "light.kinderzimmer_lena",
    "unknown_section": {"x": "Zahnarzt Dr. Huber"},
}
OPTIONS = {
    "ai_task_entity": "ai_task.openai_anna", "lueften_push": True, "lueften_personen": ["person.anna"],
    "price_kwh": 0.32, "ki_plan_update": "manual", "update_push": False, "ki_hinweise": "Zahnarzt Dr. Huber",
    "outdoor_temperature": "sensor.test_waste_bio", "Tante Erna": "x", "beta_updates": True,
}
CFG_CASORA = {
    "title": "Wohnzimmer Anna",
    "button_card_templates": {"casora_room": {}, "mein_anna_template": {}},
    "views": [
        {"title": "Wohnzimmer Anna", "path": "wohnzimmer_anna", "cards": [
            {"type": "custom:button-card", "template": "casora_room", "entity": "light.kinderzimmer_lena",
             "name": "Annas Handy"},
            {"type": "vertical-stack", "cards": [
                {"type": "custom:button-card", "template": ["casora_light", "mein_anna_template"],
                 "entity": "light.kinderzimmer_lena"},
                {"type": "map", "entities": ["person.anna"], "default_zoom": 48.1371},
                {"type": "custom:Annas Handy"},
            ]},
        ]},
        {"title": "Büro Hauptstraße", "cards": [{"type": "calendar", "entities": ["calendar.familie_mueller"]}]},
    ],
}
CFG_MOBILE = {"views": [{"cards": [{"type": "custom:button-card", "template": "casora_mobile_bg"}]}]}
CFG_OTHER = {"title": "Familie Müller", "views": [{"cards": [{"type": "markdown", "content": "Zahnarzt Dr. Huber"}]}]}


class Entry(SimpleNamespace):
    pass


async def run() -> dict:
    entries = [Entry(domain=d) for d in ("casora", "frigate", "frigate", "tankerkoenig", "my_secret_anna_integration",
                                         "openai_conversation", "marketplace")]
    hass = SimpleNamespace(
        data={DOMAIN: {
            "update_last_check": "2026-11-14T10:00:00+00:00", "update_last_error": "rate_limited",
            "tanken": SimpleNamespace(status={"ok": False, "error": "Key sk-TESTKEY123 invalid", "code": "apikey",
                                              "at": "2026-11-14T09:00:00+00:00", "count": None}),
            "charging": SimpleNamespace(status={"ok": False, "error": "https://anna.duckdns.org down",
                                                "code": "https://anna.duckdns.org", "at": None, "count": None}),
            "ki": object(),
        }},
        config=SimpleNamespace(config_dir=ROOT, language="de"),
        config_entries=SimpleNamespace(async_entries=lambda domain=None: entries),
    )

    async def executor(fn, *a):
        return fn(*a)

    hass.async_add_executor_job = executor

    async def configs(_hass):
        return {"dashboard-anna": CFG_CASORA, "anna-handy": CFG_MOBILE, "familie": CFG_OTHER,
                "kaputt": dg.UNREADABLE}

    async def settings(_hass):
        return SETTINGS

    dg.async_dashboard_configs = configs
    dg.async_load_settings = settings
    dg.ar = SimpleNamespace(async_get=lambda _h: SimpleNamespace(areas={"wohnzimmer_anna": 1, "buero": 2}))
    entry = SimpleNamespace(version=1, minor_version=2, state="loaded", options=OPTIONS, entry_id="x")
    return await dg.async_get_config_entry_diagnostics(hass, entry)


res = asyncio.run(run())
text = json.dumps(res, ensure_ascii=False)
print(json.dumps(res, ensure_ascii=False, indent=1)[:2500])

leaked = [s for s in SECRETS if s.lower() in text.lower()]
check(not leaked, f"nothing personal in it {leaked}")
check(res["casora_version"] == VERSION and res["ha_version"], "versions")
opts = res["entry"]["options"]
check(opts.get("lueften_push") is True and opts.get("update_push") is False and opts.get("beta_updates") is True,
      "switches stay")
check(opts.get("ki_plan_update") == "manual", "fixed word stays")
check(opts.get("ai_task_entity") == "set" and opts.get("lueften_personen") == {"count": 1}, "ids only as set/count")
check("Tante Erna" not in opts, "odd option key left out")
st = res["settings"]
check(st.get("stored") is True and st.get("calendars") == {"count": 1} and st.get("night_entity") == "set",
      "settings: sections counted")
check("unknown_section" not in st, "settings: only known sections")
d = res["dashboards"]
check(len(d["casora"]) == 2 and d["other"] == 1 and d["unreadable"] == 1, f"dashboards counted {d}")
wide = next((x for x in d["casora"] if x["kind"] == "wide"), {})
check(wide.get("views") == 2 and wide.get("tiles", {}).get("casora_room") == 1
      and wide.get("tiles", {}).get("casora_light") == 1, f"tiles counted {wide.get('tiles')}")
check(wide.get("own_templates") == 1 and "mein_anna_template" not in text, "own templates only counted")
check(res["integrations"]["known"] == {"frigate": 2, "marketplace": 1, "tankerkoenig": 1}
      and res["integrations"]["other_count"] == 2, f"integrations {res['integrations']}")
check(res["area_count"] == 2, "areas counted")
check(["calendar", 1] in wide.get("card_types", []), "card types counted")
check(res["checks"]["update"]["last_error"] == "rate_limited", "update error code")
check(res["checks"]["tanken"]["code"] == "apikey" and res["checks"]["tanken"]["ok"] is False, "tanken error code")
check(res["checks"]["charging"]["code"] == "set", "free text as error code: only set")
check("ki" in res["running"], "running modules")

# Same named integrations as the Studio's diagnostics.
with open(os.path.join(ROOT, "custom_components/casora/panel/casora-panel-diagnostics.js"), encoding="utf-8") as fh:
    js = fh.read()
m = re.search(r"const KNOWN_PLATFORMS = \[(.*?)\];", js, re.S)
js_list = re.findall(r'"([a-z0-9_]+)"', m.group(1)) if m else []
check(js_list and list(dg.KNOWN_PLATFORMS) == js_list, "KNOWN_PLATFORMS equal to the Studio's")
check(Counter(dg.KNOWN_PLATFORMS) == Counter(set(dg.KNOWN_PLATFORMS)), "no duplicates")

print("\n" + ("diagnostics: alles ok" if not FAILS else f"{len(FAILS)} FEHLER: {FAILS}"))
sys.exit(1 if FAILS else 0)
