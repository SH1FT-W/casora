"""Casora's update entity only reports (update.py) – no installer of its own (hacs/default#12143).

  ~/.cache/ha-venv/2026.10.1/bin/python dev/unit/update_report_only_test.py
  uv run --python 3.14 --with homeassistant python dev/unit/update_report_only_test.py

- The entity offers RELEASE_NOTES only, no INSTALL, and defines no async_install.
- update.py / update_source.py / updates.py contain no install code (zip, swap, stop listener,
  repair issue, download of release files).
- Setup, a check and the release notes leave custom_components untouched; setup only removes the
  former self-updater's leftovers outside custom_components (staging area, install history).
- B-PY-16: the entity is added without waiting for GitHub, the first check runs in the background.
- HA rejects update.install for an explicitly named entity without INSTALL; the updates popup
  therefore only installs entities with supported_features & 1.
"""

from __future__ import annotations

import ast
import asyncio
import hashlib
import json
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.components import update as ha_update  # noqa: E402
from homeassistant.components.update import UpdateEntityFeature  # noqa: E402

from custom_components.casora import update  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


class Hass:
    def __init__(self, cfg: str):
        self.data = {}
        self.config = SimpleNamespace(path=lambda *p: os.path.join(cfg, *p), config_dir=cfg, language="en")
        self.states = SimpleNamespace(get=lambda eid: None)
        self.bus = SimpleNamespace(async_listen_once=lambda *a, **k: fails.append("stop listener registered"))

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


REL = {"tag_name": "v99.0.1", "draft": False, "prerelease": False, "body": "- **New:** x",
       "html_url": "https://github.com/OWNER/casora/releases/tag/v99.0.1", "assets": []}


def tree(path: str) -> dict[str, str]:
    out = {}
    for dirpath, dirs, files in os.walk(path):
        dirs.sort()
        out[os.path.relpath(dirpath, path) + "/"] = ""
        for name in sorted(files):
            full = os.path.join(dirpath, name)
            with open(full, "rb") as fh:
                out[os.path.relpath(full, path)] = hashlib.sha256(fh.read()).hexdigest()
    return out


def static_checks() -> None:
    ent = update.CasoraUpdate(Hass(tempfile.mkdtemp()), SimpleNamespace(entry_id="e0", options={}))
    feats = ent.supported_features
    check("entity: RELEASE_NOTES only", feats == UpdateEntityFeature.RELEASE_NOTES, repr(feats))
    check("entity: no INSTALL", not (feats & UpdateEntityFeature.INSTALL))
    check("entity: no async_install / async_install_with_progress",
          "async_install" not in vars(update.CasoraUpdate) and "async_install_with_progress" not in vars(update.CasoraUpdate))

    banned_names = {"stage_zip", "swap_in", "install_zip", "_swap_on_stop", "download_release", "release_asset",
                    "async_record_install", "zip_source_prefix", "EVENT_HOMEASSISTANT_STOP", "async_create_issue"}
    banned_modules = {"zipfile", "tempfile", "io"}
    for mod in ("update.py", "update_source.py", "updates.py"):
        path = os.path.join(ROOT, "custom_components", "casora", mod)
        src = open(path, encoding="utf-8").read()
        tree_ = ast.parse(src)
        names = {n.id for n in ast.walk(tree_) if isinstance(n, ast.Name)} | {
            n.attr for n in ast.walk(tree_) if isinstance(n, ast.Attribute)} | {
            n.name for n in ast.walk(tree_) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        imported = {a.name.split(".")[0] for n in ast.walk(tree_) if isinstance(n, ast.Import) for a in n.names}
        check(f"{mod}: no install helpers", not (names & banned_names), sorted(names & banned_names))
        check(f"{mod}: no zip/tempfile/io", not (imported & banned_modules), sorted(imported & banned_modules))
        check(f"{mod}: no zipball or asset download", "/zipball/" not in src and "releases/assets" not in src)
        # Files are only opened for reading (CHANGELOG, HACS list).
        writes = [n.lineno for n in ast.walk(tree_) if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "open"
                  and any(isinstance(a, ast.Constant) and isinstance(a.value, str) and set(a.value) & set("wax+")
                          for a in n.args[1:] + [k.value for k in n.keywords if k.arg == "mode"])]
        check(f"{mod}: open() only for reading", not writes, writes)
        check(f"{mod}: no os.replace / copytree", "os.replace" not in src and "copytree" not in src)

    # HA: update.install needs INSTALL and fails for an explicitly named entity without it.
    src = ""
    for name in ("__init__.py", "services.py"):
        try:
            src += open(os.path.join(os.path.dirname(ha_update.__file__), name), encoding="utf-8").read()
        except OSError:
            pass
    check("HA: update.install requires INSTALL", "SERVICE_INSTALL" in src and "[UpdateEntityFeature.INSTALL]" in src)
    tpl = json.load(open(os.path.join(ROOT, "dashboards", "casora", "button_card_templates.json"), encoding="utf-8"))
    content = tpl["casora_popup_updates"]["tap_action"]["casora_popup"]["content"]
    check("popup: Update All only with INSTALL (supported_features & 1)",
          "(a.supported_features & 1) && !(window._casoraUpdAiBlocked" in content)


HACS_DEVICES: set = set()
# HACS keys the repository's device by its GitHub id; the registries are HA's public API.
update.dr = SimpleNamespace(async_get=lambda h: SimpleNamespace(
    devices={i: SimpleNamespace(identifiers={i}) for i in HACS_DEVICES}))
update.er = SimpleNamespace(async_get=lambda h: SimpleNamespace(
    async_get_entity_id=lambda *a: None, async_remove=lambda eid: None, entities={}))


async def runtime_checks() -> None:
    tmp = tempfile.mkdtemp()
    hass = Hass(tmp)

    async def _rels(h):
        return [REL]

    update.fetch_releases = _rels
    target = hass.config.path("custom_components", "casora")
    os.makedirs(os.path.join(target, "panel"))
    with open(os.path.join(target, "manifest.json"), "w") as fh:
        json.dump({"version": update.VERSION}, fh)
    with open(os.path.join(target, "panel", "casora-studio.js"), "w") as fh:
        fh.write("// loader\n")
    # Leftovers of the former self-updater.
    os.makedirs(hass.config.path(update.LEGACY_STAGE_DIR, "panel"))
    os.makedirs(hass.config.path(".storage"))
    with open(hass.config.path(".storage", update.LEGACY_HISTORY_FILE), "w") as fh:
        json.dump({"data": {"installs": []}}, fh)
    before = tree(hass.config.path("custom_components"))

    added: list = []
    await update.async_setup_entry(hass, SimpleNamespace(entry_id="e1", options={}),
                                   lambda ents, **k: added.append((ents, k)))
    check("setup: own entity without HACS", len(added) == 1 and len(added[0][0]) == 1)
    check("B-PY-16: no update_before_add", added and added[0][1] == {}, repr(added))
    check("setup: staging leftover removed", not os.path.exists(hass.config.path(update.LEGACY_STAGE_DIR)))
    check("setup: install history removed", not os.path.exists(hass.config.path(".storage", update.LEGACY_HISTORY_FILE)))

    ent = added[0][0][0]
    ent.async_write_ha_state = lambda: None
    tasks = []
    hass.async_create_background_task = lambda coro, name: tasks.append(asyncio.ensure_future(coro))
    await ent.async_added_to_hass()
    check("B-PY-16: first check as background task", len(tasks) == 1)
    await asyncio.gather(*tasks)
    check("reports 99.0.1 with link", ent.latest_version == "99.0.1" and ent.installed_version == update.VERSION
          and str(ent.release_url).endswith("/v99.0.1"), f"{ent.installed_version} → {ent.latest_version}")
    notes = await ent.async_release_notes()
    check("release notes", bool(notes) and "New" in notes, repr(notes))
    await ent.async_update()
    check("second check: still only reported", ent.latest_version == "99.0.1" and ent.installed_version == update.VERSION)
    check("custom_components untouched", tree(hass.config.path("custom_components")) == before)
    check("no backups written", not os.path.exists(hass.config.path("casora_sicherungen")))

    # With HACS: no own entity (HACS reports), detection unchanged.
    hh = Hass(tempfile.mkdtemp())
    HACS_DEVICES.add(("hacs", update.UPDATE_REPO_ID))
    added.clear()
    await update.async_setup_entry(hh, SimpleNamespace(entry_id="e2", options={}), lambda ents, **k: added.append(ents))
    check("with HACS: no own update entity", added == [] and hh.data["casora"][update.DATA_HACS] is True)
    check("with HACS: repo id kept for the HACS page", hh.data["casora"][update.DATA_HACS_ID] == update.UPDATE_REPO_ID)


static_checks()
asyncio.run(runtime_checks())
# Old version zips of the self-updater: all but the newest go, dashboard backups stay.
with tempfile.TemporaryDirectory() as _d:
    _b = os.path.join(_d, "casora_sicherungen"); os.makedirs(_b)
    _names = ["casora_26.10.40_2026-10-18_101010.zip", "casora_26.10.58_2026-10-23_202020.zip",
              "casora_26.10.58b1_2026-10-22_111111.zip", "umzug_2026-10-20_120000_home.json", "casora_notes.zip"]
    for _i, _n in enumerate(_names):
        _p = os.path.join(_b, _n); open(_p, "w").close(); os.utime(_p, (1_000_000 + _i, 1_000_000 + _i))
    os.utime(os.path.join(_b, "casora_26.10.58_2026-10-23_202020.zip"), (2_000_000, 2_000_000))
    update._remove_legacy_leftovers(_d)
    _left = sorted(os.listdir(_b))
    check("Versionssicherungen: nur die neueste bleibt, andere Dateien unberührt",
          _left == ["casora_26.10.58_2026-10-23_202020.zip", "casora_notes.zip", "umzug_2026-10-20_120000_home.json"], _left)
    check("Versionssicherungen: fehlender Ordner ist kein Fehler", update._prune_version_backups(os.path.join(_d, "nichts")) == [])

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
