"""One-time removal of what earlier versions left in the config folder (legacy_cleanup.py), without a running HA.

  ~/.cache/ha-venv/2026.10.1/bin/python dev/unit/legacy_cleanup_test.py

Owner request: the repair notices for the old scripts and the old theme file should not ask the user to clean up;
Casora removes its own leftovers once and then tells. HACS review (hacs/default#12143, point 3): no editing of
the user's YAML, nothing written on every start. Covers: fingerprints of the scripts exactly as Casora wrote
them (dev/unit/legacy_scripts.yaml) match, an edited one does not; the theme file goes only with Casora's
marker; the whole run happens once (store); in-use scripts stay in a repair notice; the notification lists
only what really happened, in the installation's language; the old repair notices go away.
"""

from __future__ import annotations

import asyncio
import copy
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util.yaml import load_yaml  # noqa: E402

from custom_components.casora import legacy_cleanup as lc  # noqa: E402
from custom_components.casora import theme  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FAIL:", msg)


OLD = load_yaml(os.path.join(ROOT, "dev/unit/legacy_scripts.yaml"))

# 1. Fingerprints: what Casora wrote matches, any change to alias or sequence does not
check(sorted(OLD) == sorted(lc.OBJECT_IDS), f"fixture has the four former scripts: {sorted(OLD)}")
for oid, conf in OLD.items():
    plain = copy.deepcopy(dict(conf))
    check(lc.matches(oid, plain), f"{oid}: Casora's own version matches")
    desc = dict(plain, description="mine")
    check(lc.matches(oid, desc), f"{oid}: a changed description still counts as Casora's")
    alias = dict(plain, alias="My toggle")
    check(not lc.matches(oid, alias), f"{oid}: changed alias does not match")
    seq = dict(plain, sequence=[*plain["sequence"], {"delay": {"seconds": 1}}])
    check(not lc.matches(oid, seq), f"{oid}: changed sequence does not match")
check(not lc.matches("casora_light_smart_toggle", OLD["casora_restart_toggle"]), "fingerprint is per script")
check(not lc.matches("other", OLD["casora_restart_toggle"]) and not lc.matches("casora_restart_toggle", None),
      "unknown id / no config: no match")

# 2. Notification texts
title, msg = lc.notification_text({"removed": list(lc.OBJECT_IDS), "theme": {"path": "themes/casora-themes.yaml", "removed": True}}, "de")
check(title == "Casora hat aufgeräumt" and msg.startswith(
    "Casora hat alte Einträge entfernt: 4 Skripte aus früheren Versionen und die Datei `themes/casora-themes.yaml`. "
    "Casora braucht sie nicht mehr."), f"de, both: {msg!r}")
_, msg = lc.notification_text({"removed": ["casora_restart_toggle"]}, "de")
check("1 Skript aus einer früheren Version." in msg and "Datei" not in msg and "Behalten" not in msg, f"de, one script only: {msg!r}")
_, msg = lc.notification_text({"theme": {"path": "themes/casora-themes.yaml", "removed": True}}, "en-GB")
check(msg.startswith("Casora removed old entries: the file `themes/casora-themes.yaml`. Casora no longer needs them.")
      and "script" not in msg, f"en, theme only: {msg!r}")
_, msg = lc.notification_text({"removed": ["casora_light_smart_toggle", "casora_restart_toggle"],
                               "kept": {"casora_actions_overlay_toggle": {"reason": "in_use", "by": ["automation.mine"]},
                                        "casora_thermostat_overlay_toggle": {"reason": "edited"}}}, "de")
check("2 Skripte" in msg and "Behalten hat Casora:" in msg
      and "`script.casora_actions_overlay_toggle`: wird noch verwendet (von `automation.mine`)" in msg
      and "`script.casora_thermostat_overlay_toggle`: wurde von dir geändert" in msg, f"de, kept with reasons: {msg!r}")
_, msg = lc.notification_text({"kept": {"casora_restart_toggle": {"reason": "not_in_scripts_yaml"}}}, "en")
check("removed" not in msg.split("\n")[0] and "is not in scripts.yaml" in msg, f"en, nothing removed: {msg!r}")
_, msg = lc.notification_text({"theme": {"path": "themes/casora-themes.yaml", "removed": False}}, "de")
check("ließ sich nicht löschen" in msg and "entfernt" not in msg, f"de, theme file not removable: {msg!r}")
check(lc.notification_text({}, "de") is None and lc.notification_text({"removed": [], "kept": {}}, "de") is None, "nothing: no text")
keys = set(lc.TEXT["de"])
for lang in ("en", "es", "fr", "it", "nl", "pl", "pt"):
    check(set(lc.TEXT[lang]) == keys, f"{lang}: same text keys as de")
    t = lc.notification_text({"removed": list(lc.OBJECT_IDS), "theme": {"path": "x", "removed": True},
                              "kept": {"casora_restart_toggle": {"reason": r} for r in lc.REASONS[:1]}}, lang)
    check(t and "4" in t[1] and "`x`" in t[1], f"{lang}: text renders")
_, msg = lc.notification_text({"removed": ["casora_restart_toggle"]}, "xx")
check(msg.startswith("Casora removed old entries"), "unknown language: English")


# 3. Theme file: only with Casora's marker
def config_dir(d, marker=True):
    with open(os.path.join(d, "configuration.yaml"), "w", encoding="utf-8") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named themes\n")
    os.makedirs(os.path.join(d, "themes"), exist_ok=True)
    first = theme.OLD_THEME_MARKER + " und bei jedem Start aktualisiert – nicht bearbeiten.\n" if marker else "# my themes\n"
    with open(os.path.join(d, "themes", theme.OLD_THEME_FILE), "w", encoding="utf-8") as f:
        f.write(first + "Casora: {}\n")


with tempfile.TemporaryDirectory() as d:
    config_dir(d, marker=False)
    check(lc.remove_own_theme_file(d) == (None, False) and os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)),
          "file without the marker stays")
    config_dir(d, marker=True)
    check(lc.remove_own_theme_file(d) == (os.path.join("themes", theme.OLD_THEME_FILE), True)
          and not os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)), "file with the marker removed")
    check(lc.remove_own_theme_file(d) == (None, False), "nothing left: nothing to do")


# 4. The run: fake HA
class FakeStore:
    saved: dict = {}
    saves = 0

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        v = FakeStore.saved.get(self.key)
        return copy.deepcopy(v) if v is not None else None

    async def async_save(self, data):
        FakeStore.saves += 1
        FakeStore.saved[self.key] = copy.deepcopy(data)


issues: dict = {}
notes: list = []
js: list = []
lc.Store = FakeStore
lc.websocket_api = SimpleNamespace(async_register_command=lambda hass, cmd: None)
lc.ir = SimpleNamespace(
    async_create_issue=lambda hass, dom, iid, **k: issues.__setitem__(iid, k),
    async_delete_issue=lambda hass, dom, iid: issues.pop(iid, None),
    IssueSeverity=SimpleNamespace(WARNING="warning"),
)
lc.persistent_notification = SimpleNamespace(
    async_create=lambda hass, message, title=None, notification_id=None: notes.append((notification_id, title, message)))
lc.add_extra_js_url = lambda hass, url: js.append(url)
lc.remove_extra_js_url = lambda hass, url: js.remove(url)


def make_hass(d, states, language="de"):
    calls = []

    async def job(fn, *a):
        return fn(*a)

    async def async_call(domain, service, data=None, blocking=False, **_k):
        calls.append((domain, service))

    hass = SimpleNamespace(
        data={},
        config=SimpleNamespace(config_dir=d, path=lambda *p: os.path.join(d, *p), language=language),
        states=SimpleNamespace(get=lambda e: states.get(e)),
        services=SimpleNamespace(async_call=async_call, has_service=lambda dom, s: (dom, s) == ("frontend", "reload_themes")),
        async_add_executor_job=job,
    )
    return hass, calls


loaded = SimpleNamespace(state="off", attributes={})
restored = SimpleNamespace(state="unavailable", attributes={"restored": True})

with tempfile.TemporaryDirectory() as d:
    config_dir(d)
    states = {f"script.{o}": loaded for o in lc.OBJECT_IDS}
    states["script.casora_actions_overlay_toggle"] = restored
    FakeStore.saved = {}
    issues.update({"leftover_scripts": {}, "leftover_theme_file": {}})
    hass, calls = make_hass(d, states)

    # 4a. First start: theme file removed and themes reloaded; scripts wait for an admin browser
    asyncio.run(lc.async_run(hass))
    rt = lc._rt(hass)
    check(not os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)), "theme file removed at setup")
    check(("frontend", "reload_themes") in calls, f"themes reloaded: {calls}")
    check("leftover_scripts" not in issues and "leftover_theme_file" not in issues, f"old repair notices gone: {issues}")
    check(sorted(rt.pending) == ["casora_light_smart_toggle", "casora_restart_toggle", "casora_thermostat_overlay_toggle"],
          f"pending: loaded scripts only, not the restored placeholder ({rt.pending})")
    check(len(js) == 1 and js[0].startswith("/casora_scripts/casora-legacy-cleanup.js?v="), f"browser module loaded: {js}")
    check(not notes, "no notification yet while scripts wait (one notice for everything)")
    check(FakeStore.saved[lc.STORAGE_KEY]["theme"] == {"path": os.path.join("themes", theme.OLD_THEME_FILE), "removed": True},
          "theme result stored")

    # 4b. The browser claims the run; a second browser gets nothing meanwhile
    sent = []
    conn = SimpleNamespace(user=SimpleNamespace(is_admin=True), send_result=lambda i, r: sent.append(r),
                           send_error=lambda *a: sent.append(("error", a)))
    lc.ws_scripts(hass, conn, {"id": 1, "type": "casora/legacy/scripts"})
    lc.ws_scripts(hass, conn, {"id": 2, "type": "casora/legacy/scripts"})
    check(len(sent[0]["pending"]) == 3 and sent[1] == {"pending": []}, f"claimed once: {sent}")
    configs = {"casora_light_smart_toggle": dict(OLD["casora_light_smart_toggle"]),
               "casora_thermostat_overlay_toggle": dict(OLD["casora_thermostat_overlay_toggle"], alias="Mine")}
    lc.ws_match(hass, conn, {"id": 3, "configs": configs})
    check(sent[2] == {"match": ["casora_light_smart_toggle"]}, f"match: only the unchanged one ({sent[2]})")

    # 4c. Report: removed one, kept one in use and one edited
    asyncio.run(lc.async_record(hass, rt, ["casora_light_smart_toggle", "casora_unknown"], {
        "casora_restart_toggle": {"reason": "in_use", "by": ["automation.mine"]},
        "casora_thermostat_overlay_toggle": {"reason": "edited"},
    }))
    states.pop("script.casora_light_smart_toggle")
    check(rt.pending == [] and js == [], f"nothing pending, module off ({rt.pending}, {js})")
    check(len(notes) == 1 and notes[0][0] == lc.NOTIFICATION_ID, f"one notification: {notes}")
    msg = notes[0][2]
    check("1 Skript aus einer früheren Version und die Datei `themes/casora-themes.yaml`" in msg
          and "`script.casora_light_smart_toggle`" in msg and "wird noch verwendet (von `automation.mine`)" in msg
          and "wurde von dir geändert" in msg and "casora_unknown" not in msg, f"notification text: {msg!r}")
    kept = issues.get(lc.ISSUE_KEPT, {})
    check(kept.get("translation_placeholders", {}).get("scripts") == "script.casora_thermostat_overlay_toggle, script.casora_restart_toggle"
          and kept.get("is_fixable") is False and kept.get("severity") == "warning", f"kept scripts in a repair notice: {kept}")

    # 4d. Next start: nothing runs again, nothing is written, the repair notice stays while they exist
    saves = FakeStore.saves
    config_dir(d)  # even if the file came back (backup), it is not touched again
    hass2, calls2 = make_hass(d, states)
    asyncio.run(lc.async_run(hass2))
    check(FakeStore.saves == saves, "second start: store not written")
    check(os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)) and not calls2, "second start: theme file not touched")
    check(lc._rt(hass2).pending == [] and js == [] and len(notes) == 1, "second start: nothing pending, no new notification")
    check(lc.ISSUE_KEPT in issues, "kept scripts still listed")
    states.pop("script.casora_restart_toggle")
    states.pop("script.casora_thermostat_overlay_toggle")
    asyncio.run(lc.async_run(make_hass(d, states)[0]))
    check(lc.ISSUE_KEPT not in issues, "user deleted the kept scripts: repair notice gone")

# 5. Only the theme file (no scripts): told right away, in the installation's language
with tempfile.TemporaryDirectory() as d:
    config_dir(d)
    FakeStore.saved, notes[:] = {}, []
    hass, calls = make_hass(d, {}, language="en")
    asyncio.run(lc.async_run(hass))
    check(js == [] and len(notes) == 1 and notes[0][2].startswith("Casora removed old entries: the file"), f"theme only: {notes}")
    # Fresh install: nothing found, nothing stored, nothing told
    FakeStore.saved, notes[:], FakeStore.saves = {}, [], 0
    asyncio.run(lc.async_run(make_hass(d, {})[0]))
    check(FakeStore.saves == 0 and not notes and not issues, f"fresh install: no store write, no notice ({issues})")

# 6. A file that is not Casora's stays, and nothing is said about it
with tempfile.TemporaryDirectory() as d:
    config_dir(d, marker=False)
    FakeStore.saved, notes[:] = {}, []
    hass, calls = make_hass(d, {})
    asyncio.run(lc.async_run(hass))
    check(os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)) and not notes and not calls, "foreign file untouched")

print("OK" if not FAILS else f"{len(FAILS)} failures")
sys.exit(1 if FAILS else 0)
