"""Setup never writes into the user's config folder (helfer.py, theme.py), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/no_config_writes_test.py

HACS review (hacs/default#12143): Casora appended scripts to scripts.yaml and wrote themes/casora-themes.yaml
on every start. Now the setup of designs, helpers and automatic behaviour runs with open/replace/remove
watched: nothing may be opened for writing, replaced or removed in the config folder, even when
configuration.yaml loads scripts.yaml and a themes folder. Leftovers of earlier versions (the four scripts,
the theme file) only raise a repair notice. The setup notice names missing helpers and goes away once all exist.
"""

from __future__ import annotations

import asyncio
import builtins
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.core import CoreState  # noqa: E402

from custom_components.casora import helfer, theme  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FAIL:", msg)


class FakeStore:
    saved: dict = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return FakeStore.saved.get(self.key)

    async def async_save(self, data):
        FakeStore.saved[self.key] = dict(data)


theme.Store = FakeStore
theme.add_extra_js_url = lambda hass, url: None
theme.websocket_api.async_register_command = lambda hass, cmd: None
helfer._legacy_automation = lambda *a: False
helfer._any_playing = lambda h: False
helfer.async_register_admin_service = lambda *a, **k: None
issues: dict = {}
helfer.ir = SimpleNamespace(
    async_create_issue=lambda hass, dom, iid, **k: issues.__setitem__(iid, k),
    async_delete_issue=lambda hass, dom, iid: issues.pop(iid, None),
    IssueSeverity=SimpleNamespace(WARNING="warning"),
)


async def no_hemma(_h):
    return False


import custom_components.casora.hemma_cleanup as hc  # noqa: E402

hc.async_hemma_present = no_hemma


def make_hass(d, states):
    calls, tasks = [], []

    async def job(fn, *a):
        return fn(*a)

    async def async_call(domain, service, data=None, blocking=False, **_k):
        calls.append((domain, service, data))

    async def users():
        return []

    hass = SimpleNamespace(
        data={}, state=CoreState.running,
        config=SimpleNamespace(config_dir=d, path=lambda *p: os.path.join(d, *p),
                               units=SimpleNamespace(temperature_unit="°C")),
        states=SimpleNamespace(get=lambda e: states.get(e)),
        services=SimpleNamespace(async_call=async_call, has_service=lambda *a: False),
        bus=SimpleNamespace(async_listen=lambda *a: (lambda: None), async_listen_once=lambda *a: (lambda: None)),
        auth=SimpleNamespace(async_get_users=users),
        async_add_executor_job=job, async_create_task=lambda c: tasks.append(asyncio.ensure_future(c)),
    )
    return hass, calls, tasks


helfer.er = SimpleNamespace(async_get=lambda h: SimpleNamespace(async_get=lambda e: None))


def watched(d):
    """Patch open/os.replace/os.remove/os.rename; return the list of writes under d."""
    writes = []
    real = builtins.open, os.replace, os.remove, os.rename, os.unlink
    root = os.path.realpath(d)

    def inside(p):
        try:
            return os.path.realpath(os.fspath(p)).startswith(root)
        except TypeError:
            return False

    def fake_open(file, mode="r", *a, **k):
        if inside(file) and any(c in mode for c in "wax+"):
            writes.append(("open", os.path.relpath(file, d), mode))
        return real[0](file, mode, *a, **k)

    def guard(name, fn):
        def wrapped(*a, **k):
            if any(inside(x) for x in a[:2]):
                writes.append((name, os.path.relpath(a[0], d)))
                return None
            return fn(*a, **k)
        return wrapped

    builtins.open = fake_open
    os.replace, os.remove, os.rename, os.unlink = (guard("replace", real[1]), guard("remove", real[2]),
                                                   guard("rename", real[3]), guard("unlink", real[4]))
    return writes, real


def restore(real):
    builtins.open, os.replace, os.remove, os.rename, os.unlink = real


async def setup(hass, tasks):
    await theme.async_setup_theme(hass)
    await helfer.async_setup_helfer(hass)
    await asyncio.gather(*tasks)


with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, "configuration.yaml"), "w", encoding="utf-8") as f:
        f.write("default_config:\nscript: !include scripts.yaml\nfrontend:\n  themes: !include_dir_merge_named themes\n")
    with open(os.path.join(d, "scripts.yaml"), "w", encoding="utf-8") as f:
        f.write("# mine\nfoo:\n  sequence: []\n")
    os.mkdir(os.path.join(d, "themes"))
    before = {p: open(os.path.join(d, p), encoding="utf-8").read() for p in ("configuration.yaml", "scripts.yaml")}

    # 1. Fresh install: nothing written, nothing to report
    FakeStore.saved = {}
    hass, calls, tasks = make_hass(d, {})
    writes, real = watched(d)
    try:
        asyncio.run(setup(hass, tasks))
    finally:
        restore(real)
    check(not writes, f"no writes in the config folder: {writes}")
    check(os.listdir(os.path.join(d, "themes")) == [], "no theme file")
    check(all(open(os.path.join(d, p), encoding="utf-8").read() == t for p, t in before.items()),
          "configuration.yaml and scripts.yaml unchanged")
    check(not issues, f"fresh install: no repair notice ({issues})")
    created = [c for c in calls if c[0] == "persistent_notification" and c[1] == "create"]
    check(created and "Helfer" in created[0][2]["message"] and "scripts.yaml" not in created[0][2]["message"],
          "notice names the missing helpers only")
    check(FakeStore.saved.get("casora.theme") == {"design": None, "migrated": True}, "design not chosen yet")

    # 2. Update from a version that wrote both: they stay, a repair notice names them
    with open(os.path.join(d, "themes", theme.OLD_THEME_FILE), "w", encoding="utf-8") as f:
        f.write(theme.OLD_THEME_MARKER + " und bei jedem Start aktualisiert – nicht bearbeiten.\nCasora: {}\n")
    loaded = SimpleNamespace(state="off", attributes={})
    # A registry entry whose YAML is gone only shows up as a restored placeholder: not a leftover.
    gone = SimpleNamespace(state="unavailable", attributes={"restored": True})
    states = {"script.casora_light_smart_toggle": loaded, "script.casora_restart_toggle": loaded,
              "script.casora_actions_overlay_toggle": gone}
    FakeStore.saved = {"frontend_theme": {"frontend_default_theme": "Casora"}}
    hass, calls, tasks = make_hass(d, states)
    writes, real = watched(d)
    try:
        asyncio.run(setup(hass, tasks))
    finally:
        restore(real)
    check(not writes, f"update: no writes either ({writes})")
    check(os.path.exists(os.path.join(d, "themes", theme.OLD_THEME_FILE)), "old theme file left alone")
    s = issues.get("leftover_scripts", {})
    check(s.get("translation_placeholders", {}).get("scripts") == "script.casora_light_smart_toggle, script.casora_restart_toggle",
          f"scripts named: {s}")
    t = issues.get("leftover_theme_file", {})
    check(t.get("translation_placeholders", {}).get("path") == os.path.join("themes", theme.OLD_THEME_FILE), f"file named: {t}")
    check(FakeStore.saved["casora.theme"]["design"] == "Casora", "design taken over from HA's default theme")

    # 3. Leftovers gone: the notices go too
    os.remove(os.path.join(d, "themes", theme.OLD_THEME_FILE))
    hass, calls, tasks = make_hass(d, {})
    asyncio.run(helfer.async_check_leftovers(hass))
    check(not issues, f"notices removed ({issues})")


# 4. Setup notice: dismissed once all helpers exist
async def einrichten(result):
    hass, calls, tasks = make_hass(tempfile.gettempdir(), {})
    real = helfer._ensure_helpers

    async def fake(_h, _s):
        return result

    helfer._ensure_helpers = fake
    try:
        res = await helfer.async_einrichten(hass)
    finally:
        helfer._ensure_helpers = real
    await asyncio.gather(*tasks)
    return res, [c for c in calls if c[0] == "persistent_notification"]


res, calls = asyncio.run(einrichten(([], [])))
check(calls == [("persistent_notification", "dismiss", {"notification_id": "casora_einrichten"})], f"dismissed: {calls}")
res, calls = asyncio.run(einrichten(([], ["input_text.casora_x"])))
check(calls[0][1] == "create" and "input_text.casora_x" in calls[0][2]["message"], f"named: {calls}")
check(res == {"angelegt": [], "fehlt": ["input_text.casora_x"]}, "service response")

# 5. No code path left that writes scripts.yaml or a theme file
src = open(os.path.join(ROOT, "custom_components/casora/helfer.py"), encoding="utf-8").read()
check("scripts.yaml\")" not in src and "_append_scripts" not in src and "script.reload" not in src
      and '"script", "reload"' not in src, "helfer.py has no scripts.yaml writer")
tsrc = open(os.path.join(ROOT, "custom_components/casora/theme.py"), encoding="utf-8").read()
check('"frontend_themes"' not in tsrc and "themes_updated" not in tsrc and "set_theme" not in tsrc,
      "theme.py neither touches HA's theme registry nor its default theme")

print("OK" if not FAILS else f"{len(FAILS)} failures")
sys.exit(1 if FAILS else 0)
