"""Casora's designs served by the integration (theme.py), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/theme_served_test.py

HACS review (hacs/default#12143): Casora must not write a theme file into the config folder and must not
put its designs into HA's theme registry. The designs come from the integration over the WebSocket and
scripts/casora-theme.js applies them. Covers: merged designs, the one-time takeover of the former HA default
theme (old names, Hemma looks with notice, own theme), the subscription payload (theme only when the browser
lacks that version), setting the design, the page script registration and the former theme file
(found by its marker, deleted only on removal and only when it is Casora's).
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import theme  # noqa: E402

FAILS: list[str] = []
L, D = "frontend_default_theme", "frontend_default_dark_theme"
G = "Casora Glas"


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FAIL:", msg)


# 1. Designs
themes = theme.load_themes()
check(list(themes) == ["Casora", "Casora Glas", "Casora Nebel"], f"designs: {list(themes)}")
check(all(set(t["modes"]) == {"light", "dark"} for t in themes.values()), "every design has light and dark")
check(themes["Casora"].get("uix-theme") == "Casora" and themes[G].get("uix-theme") == G, "uix-theme names the design")
check("casora-theme-base" not in themes["Casora Nebel"], "control key not in the design")
check(theme.theme_hash(themes["Casora"]) == theme.theme_hash(dict(themes["Casora"])), "hash is stable")
check(theme.theme_hash(themes["Casora"]) != theme.theme_hash(themes[G]), "hash differs per design")

# 2. Takeover of HA's former default theme
names = list(themes)
M = theme.migrate_design
check(M({L: "Casora Nebel"}, names, True) == ("Casora Nebel", None), "Nebel stays Nebel")
check(M({L: "Casora Weich"}, names, True) == ("Casora", None), "old name Casora Weich → Casora")
check(M({L: "Hemma 2", D: "Hemma 1"}, names, True) == (G, "Hemma 2"), "Hemma 2 → Casora Glas with notice")
check(M({L: "Casora Glass"}, names, True) == (G, "Hemma 1"), "Casora Glass (Hemma 1) → Casora Glas")
check(M({L: "Hemma"}, names, True) == (G, "Hemma"), "Hemma's theme, Hemma gone → Casora Glas")
check(M({L: "Hemma"}, names, False) == ("", None), "Hemma's theme while Hemma is there: own theme")
check(M({L: "Moonbeam"}, names, True) == ("", None), "own theme kept (no Casora design)")
check(M({L: "Moonbeam", D: "Casora"}, names, True) == ("Casora", None), "Casora as dark default counts")
check(M({L: "default"}, names, True) == (None, None) and M({}, names, True) == (None, None), "nothing saved: open")
check(M({L: "Casora Basis"}, names, True) == ("", None), "base values are no design")


class FakeStore:
    saved: dict = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return FakeStore.saved.get(self.key)

    async def async_save(self, data):
        FakeStore.saved[self.key] = dict(data)


class UserStore:
    def __init__(self, data):
        self.data = data

    async def async_set_item(self, key, value):
        self.data[key] = value


USERS = {
    "a": UserStore({"theme": {"theme": "Hemma 1", "dark": False}}),
    "b": UserStore({"theme": {"theme": "Moonbeam"}}),
    "c": UserStore({}),
    "sys": UserStore({}),
}


async def user_store(_hass, uid):
    return USERS[uid]


async def users():
    return [SimpleNamespace(id="a", system_generated=False), SimpleNamespace(id="b", system_generated=False),
            SimpleNamespace(id="c", system_generated=False), SimpleNamespace(id="sys", system_generated=True)]


import homeassistant.components.frontend.storage as fs  # noqa: E402

fs.async_user_store = user_store

extra: list[str] = []
registered: list[str] = []


def make_hass(d):
    tasks = []

    async def job(fn, *a):
        return fn(*a)

    hass = SimpleNamespace(
        data={}, config=SimpleNamespace(config_dir=d, path=lambda *p: os.path.join(d, *p)),
        async_add_executor_job=job, async_create_task=lambda c: tasks.append(asyncio.ensure_future(c)),
        auth=SimpleNamespace(async_get_users=users),
    )
    return hass, tasks


async def hemma_absent(_hass):
    return False


import custom_components.casora.hemma_cleanup as hc  # noqa: E402

hc.async_hemma_present = hemma_absent
theme.Store = FakeStore
theme.add_extra_js_url = lambda hass, url: extra.append(url)
theme.remove_extra_js_url = lambda hass, url: extra.remove(url)
theme.websocket_api.async_register_command = lambda hass, cmd: registered.append(cmd)


async def setup(d):
    hass, tasks = make_hass(d)
    await theme.async_setup_theme(hass)
    await asyncio.gather(*tasks)
    return hass


with tempfile.TemporaryDirectory() as d:
    # 3. First start after the update: HA's store still names the former Casora theme.
    FakeStore.saved = {"frontend_theme": {L: "Hemma 2", D: "Hemma 2"}}
    hass = asyncio.run(setup(d))
    check(FakeStore.saved["casora.theme"] == {"design": G, "migrated": True}, f"taken over: {FakeStore.saved}")
    check(FakeStore.saved["frontend_theme"] == {L: "Hemma 2", D: "Hemma 2"}, "HA's theme store is only read")
    N = theme.THEME_NOTICE_KEY
    check(USERS["a"].data.get(N) == {"from": "Hemma 1", "to": G}, f"notice a: {USERS['a'].data}")
    check(USERS["c"].data.get(N) == {"from": "Hemma 2", "to": G}, f"notice c: {USERS['c'].data}")
    check(N not in USERS["b"].data and N not in USERS["sys"].data, "no notice for own theme / system user")
    check(len(extra) == 1 and extra[0].startswith("/casora_scripts/casora-theme.js?v="), f"page script: {extra}")
    check(len(registered) == 3, "three WebSocket commands")

    # 4. Payload: theme only when the browser does not have it
    rt = hass.data["casora"]["theme_rt"]
    p = rt.payload(None)
    check(p["design"] == G and p["theme"] == themes[G] and p["names"] == names, "first payload carries the design")
    check("theme" not in rt.payload(p["hash"]), "cached version: no theme sent again")

    # 5. Setting the design: saved, every subscriber hears it; unknown names refused
    sent = []
    rt.subs.add(lambda: sent.append(rt.payload(None)["design"]))
    check(asyncio.run(theme.async_set_design(hass, "Casora Nebel")) is True, "Nebel accepted")
    check(FakeStore.saved["casora.theme"]["design"] == "Casora Nebel" and sent == ["Casora Nebel"], "saved and sent")
    check(asyncio.run(theme.async_set_design(hass, "Moonbeam")) is False, "unknown design refused")
    check(asyncio.run(theme.async_set_design(hass, "")) is True and rt.payload(None)["design"] == "", "\"\" = own theme")
    check("theme" not in rt.payload(None), "no design, no theme")
    theme.async_unload_theme(hass)
    check(extra == [], "unload removes the page script")

    # 6. Second start: nothing taken over again (the choice stays)
    FakeStore.saved["frontend_theme"] = {L: "Casora"}
    USERS["a"].data[N] = None
    hass2 = asyncio.run(setup(d))
    check(hass2.data["casora"]["theme_rt"].design == "", "later choice stays")
    check(USERS["a"].data.get(N) is None, "notice not written twice")

    # 7. Former theme file: found by its marker, deleted only when it is Casora's
    with open(os.path.join(d, "configuration.yaml"), "w") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named themes\n")
    os.mkdir(os.path.join(d, "themes"))
    path = os.path.join(d, "themes", theme.OLD_THEME_FILE)
    check(theme.old_theme_file(d) is None, "no file, nothing found")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# My own themes\nMine: {}\n")
    check(theme.old_theme_file(d) is None, "a file of the user's own is not Casora's")
    theme.remove_old_theme_file(d)
    check(os.path.exists(path), "the user's own file stays")
    with open(path, "w", encoding="utf-8") as f:
        f.write(theme.OLD_THEME_MARKER + " und bei jedem Start aktualisiert – nicht bearbeiten.\nCasora: {}\n")
    check(theme.old_theme_file(d) == os.path.join("themes", theme.OLD_THEME_FILE), "Casora's file found")
    theme.remove_old_theme_file(d)
    check(not os.path.exists(path), "removal of the integration deletes Casora's file")

print("OK" if not FAILS else f"{len(FAILS)} failures")
sys.exit(1 if FAILS else 0)
