"""Hemma 1/2 sind seit 1.6.1 keine Casora-Designs mehr (helfer.py) – ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/theme_hemma_umstellung_test.py

Wer „Hemma 2“, „Hemma 1“ (oder die Altnamen „Casora Standard“, „Casora Glass“) als Standard-Theme
hell oder dunkel gespeichert hat, landet beim Start einmal auf „Casora Glas“ (Glas-Look im Casora-Aufbau).
„Hemma“ (Hemmas eigenes Theme) nur, wenn es nicht mehr da ist. Wer so umgestellt wurde, bekommt einmal
einen Hinweis (Benutzerdaten casora_theme_notice). Was die alte Theme-Datei angemeldet hat, verschwindet aus der
Liste und aus der Datei; eigene Themes bleiben.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util.yaml import load_yaml  # noqa: E402

from custom_components.casora import helfer  # noqa: E402
from custom_components.casora.helfer import (  # noqa: E402
    THEME_FILE,
    _load_theme,
    _write_theme_file,
    theme_renames,
    user_theme_rename,
)

FAILS: list[str] = []
L, D = "frontend_default_theme", "frontend_default_dark_theme"


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


# 1. Reine Zuordnung
G = "Casora Glas"
check(theme_renames({L: "Hemma 2", D: "Hemma 1"}, set()) == {L: G, D: G}, "Hemma 2/1 → Casora Glas")
check(theme_renames({L: "Casora Standard", D: "Casora Glass"}, set()) == {L: G, D: G},
      "Altnamen → Casora Glas")
check(theme_renames({L: "Casora Weich"}, set()) == {L: "Casora"}, "Casora Weich → Casora")
check(theme_renames({L: "Casora Nebel", D: "Eigenes"}, set()) == {}, "Nebel und eigenes Theme bleiben")
check(theme_renames({L: "Hemma"}, {"Hemma"}) == {}, "Hemmas Theme noch da → bleibt")
check(theme_renames({L: "Hemma"}, set()) == {L: G}, "Hemmas Theme weg → Casora Glas")
check(theme_renames({L: "Hemma"}, None) == {}, "Theme-Liste unbekannt → „Hemma“ nicht anfassen")

# Profil-Theme (Benutzerdaten „theme“): Hell/Dunkel-Wahl bleibt
check(user_theme_rename({"theme": "Hemma 2", "dark": True}, set()) == {"theme": G, "dark": True},
      "Profil Hemma 2 → Casora Glas, dunkel bleibt")
check(user_theme_rename({"theme": "Casora Nebel"}, set()) is None, "Profil Nebel bleibt")
check(user_theme_rename(None, set()) is None and user_theme_rename("x", set()) is None, "ohne Profil-Theme nichts")

themes = _load_theme()
check("Hemma 2" not in themes and "Hemma 1" not in themes, "keine Hemma-Designs mehr angemeldet")


class Bus:
    def __init__(self):
        self.fired, self.listeners = [], []

    def async_fire(self, ev):
        self.fired.append(ev)

    def async_listen(self, ev, cb):
        self.listeners.append(cb)
        return lambda: None


class UserStore:
    def __init__(self, data):
        self.data = data

    async def async_set_item(self, key, value):
        self.data[key] = value


USERS = {
    "a": UserStore({"theme": {"theme": "Hemma 1", "dark": False}}),
    "b": UserStore({"theme": {"theme": "Eigenes"}}),
    "c": UserStore({}),
    "sys": UserStore({"theme": {"theme": "Hemma 2"}}),
}


async def user_store(_hass, uid):
    return USERS[uid]


import homeassistant.components.frontend.storage as fs  # noqa: E402

fs.async_user_store = user_store


async def start(saved, store_themes, d, data_now):
    calls = []
    tasks = []
    stored = dict(saved)

    class Store:
        async def async_load(self):
            return dict(stored)

    async def call(domain, service, data, blocking=False):
        calls.append((domain, service, dict(data)))
        # wie frontend.set_theme: nur bekannte Themes
        if data["name"] in hass.data["frontend_themes"]:
            key = D if data.get("mode") == "dark" else L
            hass.data[key] = data["name"]
            stored[key] = data["name"]

    async def job(fn, *a):
        return fn(*a)

    hass = SimpleNamespace(
        data={"frontend_themes": store_themes, "frontend_themes_store": Store(), **data_now},
        bus=Bus(), services=SimpleNamespace(async_call=call), config=SimpleNamespace(config_dir=d),
        async_add_executor_job=job, async_create_task=lambda c: tasks.append(asyncio.ensure_future(c)),
        auth=SimpleNamespace(async_get_users=users),
    )
    runtime = {"unsub": []}
    await helfer._setup_theme(hass, runtime)
    await asyncio.gather(*tasks)
    return hass, calls, stored


async def users():
    return [SimpleNamespace(id="a", system_generated=False), SimpleNamespace(id="b", system_generated=False),
            SimpleNamespace(id="c", system_generated=False), SimpleNamespace(id="sys", system_generated=True)]


with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, "configuration.yaml"), "w") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named themes\n")
    os.mkdir(os.path.join(d, "themes"))
    # Alte Theme-Datei (1.6.0): Casora schrieb Hemma 2 und Hemma 1 mit hinein, HA hat sie beim Start geladen.
    old = dict(themes, **{"Hemma 2": {"primary-color": "#111"}, "Hemma 1": {"primary-color": "#222"}})
    _write_theme_file(d, old)
    store = dict(old, Eigenes={"primary-color": "#333"})

    # 2. Hell Hemma 2, dunkel Hemma 1 → beide Casora Glas, dauerhaft gespeichert
    hass, calls, stored = asyncio.run(start({L: "Hemma 2", D: "Hemma 1"}, store, d, {L: "Hemma 2", D: "Hemma 1"}))
    check(stored.get(L) == G and stored.get(D) == G, f"gespeichert: {stored}")
    check(hass.data[L] == G and hass.data[D] == G, "sofort aktiv")
    check(("frontend", "set_theme", {"name": G, "mode": "dark"}) in calls, "dunkel über set_theme")
    check("Hemma 2" not in store and "Hemma 1" not in store, "alte Designs aus der Liste")
    check(store.get("Eigenes") == {"primary-color": "#333"}, "eigenes Theme bleibt")
    check(set(load_yaml(os.path.join(d, "themes", THEME_FILE))) == {"Casora", "Casora Nebel", "Casora Glas"},
          "Theme-Datei ohne Hemma 1/2")
    check("themes_updated" in hass.bus.fired, "Oberfläche bekommt die neue Liste")
    check(USERS["a"].data["theme"] == {"theme": G, "dark": False}, f"Profil umgestellt: {USERS['a'].data}")
    check(USERS["b"].data["theme"] == {"theme": "Eigenes"}, "eigenes Profil-Theme bleibt")
    check(USERS["sys"].data["theme"] == {"theme": "Hemma 2"}, "Systembenutzer unberührt")
    # Hinweis nur für wirklich Umgestellte: a (Profil Hemma 1), c (kein Profil-Theme, sieht das Standard-Theme
    # Hemma 2); b hat ein eigenes Theme und sieht das Standard-Theme nicht, Systembenutzer nie.
    N = helfer.THEME_NOTICE_KEY
    check(USERS["a"].data.get(N) == {"from": "Hemma 1", "to": G}, f"Hinweis a: {USERS['a'].data}")
    check(USERS["c"].data.get(N) == {"from": "Hemma 2", "to": G}, f"Hinweis c: {USERS['c'].data}")
    check(N not in USERS["b"].data and N not in USERS["sys"].data, "kein Hinweis für b und Systembenutzer")
    # Hinweis gelesen (Dashboard löscht ihn) → ein weiterer Start setzt ihn nicht neu
    USERS["a"].data[N] = None
    USERS["c"].data[N] = None

    # 3. Später wählt jemand Nebel: ein weiteres themes_updated stellt nicht zurück
    hass.data[L] = "Casora Nebel"
    for cb in hass.bus.listeners:
        cb(None)
    check(hass.data[L] == "Casora Nebel", "eigene spätere Wahl bleibt")

    # 4. Zweiter Start: nichts mehr umzustellen
    hass2, calls2, _ = asyncio.run(start({L: "Casora", D: "Casora"}, dict(themes), d, {L: "Casora", D: "Casora"}))
    check(not calls2, f"zweiter Start ruft set_theme nicht ({calls2})")
    check(USERS["a"].data.get(N) is None and USERS["c"].data.get(N) is None, "Hinweis kommt nicht wieder")

    # 5. Eigenes Standard-Theme und Nebel bleiben unangetastet
    hass3, calls3, stored3 = asyncio.run(start({L: "Eigenes", D: "Casora Nebel"}, dict(themes, Eigenes={}), d,
                                               {L: "Eigenes", D: "Casora Nebel"}))
    check(not calls3 and stored3 == {L: "Eigenes", D: "Casora Nebel"}, "eigene Wahl bleibt")

print("OK" if not FAILS else f"{len(FAILS)} Fehler")
sys.exit(1 if FAILS else 0)
