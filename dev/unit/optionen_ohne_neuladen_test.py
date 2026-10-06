"""Studio → Einstellungen → Lüften: Speichern lädt Casora nicht neu und wirft nicht aus dem Studio.

  python3 dev/unit/optionen_ohne_neuladen_test.py

Nutzertest: „Speichern“ im Lüften-Blatt landete auf einem anderen Dashboard – der Update-Listener
lud die Integration neu, und async_unload_entry entfernte dabei die Studio-Seite. Geprüft (ohne HA,
per ast aus __init__.py): nur Lüften-Empfänger/-Personen geändert → kein Neuladen; alles andere lädt
neu; beim Neuladen bleibt die Seite registriert.
"""

from __future__ import annotations

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = open(os.path.join(ROOT, "custom_components/casora/__init__.py"), encoding="utf-8").read()
tree = ast.parse(SRC)
ns: dict = {}
for node in tree.body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "LIVE_OPTIONS" for t in node.targets):
        exec(compile(ast.Module([node], []), "init", "exec"), ns)
    if isinstance(node, ast.FunctionDef) and node.name == "live_only":
        exec(compile(ast.Module([node], []), "init", "exec"), ns)
live_only = ns["live_only"]

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


check("Empfänger entfernt: kein Neuladen", live_only({"lueften_push": ["notify.a"]}, {}))
check("Personen geändert: kein Neuladen", live_only({"lueften_push": ["notify.a"]}, {"lueften_push": ["notify.a"], "lueften_personen": ["person.x"]}))
check("KI-Option geändert: Neuladen", not live_only({}, {"ai_entity": "ai.x"}))
check("gemischt: Neuladen", not live_only({}, {"lueften_push": ["notify.a"], "ai_entity": "ai.x"}))
check("nichts geändert: wie bisher (Neuladen)", not live_only({"a": 1}, {"a": 1}))
check("Entladen beim Neuladen behält die Studio-Seite",
      'if not hass.data.get(DOMAIN, {}).get("reloading"):\n        async_remove_panel(hass, PANEL_URL' in SRC)
check("lueften_push liest Optionen zur Laufzeit",
      "self.entry.options.get(OPT_VENT_NOTIFY)" in open(os.path.join(ROOT, "custom_components/casora/lueften_push.py"), encoding="utf-8").read())

sys.exit(1 if fails else 0)
