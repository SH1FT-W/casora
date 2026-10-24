"""Casora uses no other integration's internals (static scan of custom_components/casora/*.py, no HA needed).

  python3 dev/unit/no_foreign_internals_test.py

HACS review (hacs/default#12143, point 5) objected to Casora using other integrations' objects. This scan
fails on any of:

  1. hass.data[...] / .get / .setdefault / .pop / `in hass.data` with a key Casora does not own
     (own: DOMAIN, or a literal/constant starting with "casora").
  2. `.runtime_data` (another integration's config entry data; Casora keeps none of its own there).
  3. Imports of underscore names from homeassistant, or of submodules of another component
     (`from homeassistant.components.<x>.<sub> import ...`), except the allowlist below.
  4. `inspect.unwrap`, `__self__`, `__wrapped__` (reaching into decorated handlers), assignments to attributes
     of imported homeassistant modules (monkeypatching).
  5. Another integration's storage: Store(..., key) with a key not owned by Casora, or a ".storage" path.

What remains is in ALLOWED, each with its reason; the same list is in docs/ha-annahmen.md ("Fremde Interna").
Anything new fails until it is either replaced by a public API or added there with a reason.
"""

from __future__ import annotations

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PKG = os.path.join(ROOT, "custom_components", "casora")

# (file, finding) -> reason. A finding is the text the scan reports for that line.
ALLOWED = {
    # http's documented helper for signed URLs (core integrations such as media_source use it the same way).
    ("images.py", "import homeassistant.components.http.auth.async_sign_path"):
        "http's public signing helper; room photos are served with auth and signed URLs (review point 1)",
    # Recorder: the documented API for statistics/history (get_instance + statistics/history modules).
    ("ki.py", "import homeassistant.components.recorder.statistics.statistics_during_period"):
        "recorder's documented statistics API, read only",
    ("ki.py", "import homeassistant.components.recorder.history"):
        "recorder's documented history API, read only",
    # Energy preferences: no websocket from Python; async_get_manager is the energy integration's accessor
    # (used by core's analytics too). Read only, never written.
    ("ki.py", "import homeassistant.components.energy.data.async_get_manager"):
        "energy prefs, read only (core analytics reads them the same way)",
    ("settings.py", "import homeassistant.components.energy.data.async_get_manager"):
        "energy prefs, read only",
    ("raumklima.py", "import homeassistant.components.energy.data.async_get_manager"):
        "energy prefs, read only",
    # Lovelace has no public Python API for dashboards and resources; only its websocket commands, which need
    # a browser connection. Casora reads/writes dashboards at start (template refresh after an update), for
    # its phone badges (non-admins too) and keeps its script resources registered. Accessed defensively,
    # read through LovelaceData's dashboards/resources only.
    ("__init__.py", "hass.data.get('lovelace')"):
        "Lovelace resources: register/repoint/remove Casora's script resources (no public Python API)",
    ("live_activity.py", "hass.data.get('lovelace')"):
        "Lovelace dashboards, read only: find the phone dashboard as tap target (no public Python API)",
    ("room_icons.py", "hass.data.get('lovelace')"):
        "Lovelace dashboards, read only: which dashboards use an icon, admins only (no public Python API)",
    ("phone_badges.py", "import homeassistant.components.lovelace.const.LOVELACE_DATA"):
        "Lovelace dashboards, read only: phone room badges/partner data for every user (no public Python API)",
    ("phone_badges.py", "hass.data.get(LOVELACE_DATA)"):
        "as above",
    ("template_refresh.py", "import homeassistant.components.lovelace.const.LOVELACE_DATA"):
        "Lovelace dashboards: refresh Casora's own unchanged templates after an update, at start (no browser)",
    ("template_refresh.py", "hass.data.get(LOVELACE_DATA)"):
        "as above",
    ("umstellen.py", "import homeassistant.components.lovelace.const.LOVELACE_DATA"):
        "Lovelace dashboards: admin service casora.umstellen (Hemma -> Casora names), with backup",
    ("umstellen.py", "hass.data[LOVELACE_DATA]"):
        "as above",
    ("versions.py", "import homeassistant.components.lovelace.const.LOVELACE_DATA"):
        "Lovelace dashboards: Studio versions (snapshot/restore) of Casora dashboards, admins only",
    ("versions.py", "hass.data.get(LOVELACE_DATA)"):
        "as above",
    ("hemma_cleanup.py", "hass.data.get('lovelace')"):
        "Lovelace dashboards/resources: removing the predecessor Hemma (admin action in the Studio)",
    # UI helpers: HA offers no Python API to create storage helpers; Casora uses the collection behind
    # <domain>/create (what Settings > Helpers uses), found via the registered websocket handler.
    ("helfer.py", "hass.data['websocket_api']"):
        "UI helpers: create Casora's helpers at start (no public Python API for storage helpers)",
    ("helfer.py", "inspect.unwrap"):
        "as above (handler -> its storage collection)",
    ("helfer.py", "__self__"):
        "as above",
    # Removing Hemma (admin action): HACS and Lovelace commands are called directly so the result can be awaited.
    ("hemma_cleanup.py", "hass.data.get('websocket_api')"):
        "Hemma removal: run hacs/repository/remove and lovelace/dashboards/delete directly (call_ws)",
    ("hemma_cleanup.py", "inspect.unwrap"):
        "as above",
    ("hemma_cleanup.py", "hass.data.get('hacs')"):
        "Hemma removal: fallback uninstall when HACS' websocket command is missing",
    ("hemma_cleanup.py", "hass.data['hacs']"):
        "as above",
    ("hemma_cleanup.py", "hass.data.get(key)"):
        "Hemma removal: was Hemma's theme HA's default theme (frontend_default_theme / _dark_theme)?",
    # One-time migration of the design choice from the HA theme era (Casora <= 26.10.59): reads HA's saved
    # default theme once and leaves each user a one-time notice in their frontend user data. Remove with the
    # migration (theme._migrate / _write_notices) once every install has run it.
    ("theme.py", "import homeassistant.components.frontend.storage.async_user_store"):
        "one-time theme migration (per-user notice), remove with the migration",
    ("theme.py", "Store key FRONTEND_THEME_STORE"):
        "one-time theme migration: reads HA's saved default theme once, never writes it",
}

OWN_PREFIX = "casora"
# Names that are submodules of a component when imported with `from homeassistant.components.<x> import ...`.
SUBMODULES = {"history", "statistics", "const", "data", "storage", "auth", "dashboard", "resources", "websocket"}
fails: list[str] = []
seen_allowed: set = set()


def report(fname: str, line: int, finding: str) -> None:
    key = (fname, finding)
    if key in ALLOWED:
        seen_allowed.add(key)
        return
    fails.append(f"{fname}:{line}: {finding}")


def consts(tree: ast.Module) -> dict[str, str]:
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    out[t.id] = node.value.value
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.JoinedStr):
            first = node.value.values[0] if node.value.values else None
            if isinstance(first, ast.FormattedValue) and isinstance(first.value, ast.Name) and first.value.id == "DOMAIN":
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        out[t.id] = OWN_PREFIX + "<f>"
    return out


def own_key(node: ast.AST, names: dict[str, str]) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.startswith(OWN_PREFIX)
    if isinstance(node, ast.Name):
        if node.id == "DOMAIN":
            return True
        return names.get(node.id, "").startswith(OWN_PREFIX)
    if isinstance(node, ast.JoinedStr) and node.values:
        first = node.values[0]
        if isinstance(first, ast.FormattedValue) and isinstance(first.value, ast.Name) and first.value.id == "DOMAIN":
            return True
        return isinstance(first, ast.Constant) and str(first.value).startswith(OWN_PREFIX)
    return False


def is_hass_data(node: ast.AST) -> bool:
    """hass.data / self.hass.data / request.app["hass"].data ..."""
    if not (isinstance(node, ast.Attribute) and node.attr == "data"):
        return False
    base = node.value
    if isinstance(base, ast.Name):
        return base.id in ("hass", "_hass", "h")
    if isinstance(base, ast.Attribute):
        return base.attr in ("hass", "_hass")
    return isinstance(base, ast.Subscript)


def text(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:  # noqa: BLE001
        return type(node).__name__


def scan(fname: str, src: str) -> None:
    tree = ast.parse(src)
    names = consts(tree)
    ha_modules: set[str] = set()
    for node in ast.walk(tree):
        # 1. hass.data with foreign keys
        if isinstance(node, ast.Subscript) and is_hass_data(node.value):
            if not own_key(node.slice, names):
                report(fname, node.lineno, f"hass.data[{text(node.slice)}]")
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and is_hass_data(node.func.value)
                and node.func.attr in ("get", "setdefault", "pop")):
            if not node.args or not own_key(node.args[0], names):
                report(fname, node.lineno, f"hass.data.{node.func.attr}({text(node.args[0]) if node.args else ''})")
        if isinstance(node, ast.Compare) and any(is_hass_data(c) for c in node.comparators):
            if not own_key(node.left, names):
                report(fname, node.lineno, f"{text(node.left)} in hass.data")
        # 2. runtime_data
        if isinstance(node, ast.Attribute) and node.attr == "runtime_data":
            report(fname, node.lineno, "runtime_data")
        # 3. imports
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("homeassistant"):
            parts = node.module.split(".")
            for alias in node.names:
                if alias.name.startswith("_") or any(p.startswith("_") for p in parts):
                    report(fname, node.lineno, f"private import {node.module}.{alias.name}")
                elif parts[:2] == ["homeassistant", "components"] and len(parts) > 3:
                    report(fname, node.lineno, f"import {node.module}.{alias.name}")
                elif parts[:2] == ["homeassistant", "components"] and len(parts) == 3 and alias.name in SUBMODULES:
                    # `from homeassistant.components.recorder import history` imports a submodule
                    report(fname, node.lineno, f"import {node.module}.{alias.name}")
                if parts[0] == "homeassistant" and len(parts) <= 3 and alias.name[:1].islower():
                    ha_modules.add(alias.asname or alias.name)
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("homeassistant") and any(p.startswith("_") for p in alias.name.split(".")):
                    report(fname, node.lineno, f"private import {alias.name}")
        # 4. reaching into handlers
        if isinstance(node, ast.Attribute) and node.attr in ("__self__", "__wrapped__"):
            report(fname, node.lineno, node.attr)
        if (isinstance(node, ast.Attribute) and node.attr == "unwrap" and isinstance(node.value, ast.Name)
                and node.value.id == "inspect"):
            report(fname, node.lineno, "inspect.unwrap")
        # 5. foreign storage
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Store" and len(node.args) >= 3:
            if not own_key(node.args[2], names):
                report(fname, node.lineno, f"Store key {text(node.args[2])}")
        if isinstance(node, ast.Call):
            args = node.args
            for i, a in enumerate(args):
                if isinstance(a, ast.Constant) and a.value == ".storage" and not any(own_key(x, names) for x in args[i + 1:]):
                    report(fname, node.lineno, f'path ".storage" {text(node)}')
    # 4b. monkeypatching imported HA modules
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id in ha_modules:
                    report(fname, node.lineno, f"assignment to {text(t)}")


for name in sorted(os.listdir(PKG)):
    if name.endswith(".py"):
        with open(os.path.join(PKG, name), encoding="utf-8") as fh:
            scan(name, fh.read())

# The scanner itself: it must catch what it is meant to catch.
probe: list[str] = []
saved = fails[:]
fails.clear()
scan("probe.py", '''
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.helpers.storage import Store
import inspect
def f(hass, entry):
    a = hass.data["lovelace"]
    b = hass.data.get(LOVELACE_DATA)
    c = hass.data.get("hacs")
    d = entry.runtime_data
    e = inspect.unwrap(x).__self__
    s = Store(hass, 1, "hacs.repositories")
    ok = hass.data.setdefault(DOMAIN, {})
    ok2 = hass.data.get("casora_x")
    p = os.path.join(d, ".storage", "hacs.repositories")
    own = os.path.join(d, ".storage", "casora.x")
''')
probe, fails[:] = fails[:], saved
want = ["hass.data['lovelace']", "hass.data.get(LOVELACE_DATA)", "hass.data.get('hacs')", "runtime_data",
        "inspect.unwrap", "__self__", "Store key 'hacs.repositories'", "import homeassistant.components.lovelace.const",
        "'hacs.repositories')"]
missing = [w for w in want if not any(w in p for p in probe)]
if missing or any("casora_x" in p or "DOMAIN" in p or "casora.x" in p for p in probe):
    fails.append(f"scanner self-check: missing {missing}, got {probe}")

stale = sorted(set(ALLOWED) - seen_allowed)
if stale:
    fails.append(f"allowlist entries that no longer match (remove them): {stale}")

for f in fails:
    print("FAIL", f)
print(f"{len(seen_allowed)} allowed with reason" + ("" if fails else ", ALLES OK"))
sys.exit(1 if fails else 0)
