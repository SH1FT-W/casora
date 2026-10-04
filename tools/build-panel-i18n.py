#!/usr/bin/env python3
"""Baut die Panel-Übersetzung aus translations/panel/*.json.

    python3 tools/build-panel-i18n.py

Jede Sprachdatei hat die Form {"exact": {englisch: übersetzt}, "patterns":
[[regex, ersetzung], …]}. Schlüssel ist immer der englische Originaltext, wie
er im Panel steht – so bleibt casora-panel.js unverändert und Casora-Updates
lassen sich weiter übernehmen. Ergebnis: panel/casora-panel-i18n.js.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "custom_components/casora/translations/panel")
OUT = os.path.join(ROOT, "custom_components/casora/panel/casora-panel-i18n.js")
RUNTIME = os.path.join(ROOT, "tools/panel-i18n-runtime.js")

tables = {}
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".json"):
        continue
    data = json.load(open(os.path.join(SRC, name), encoding="utf-8"))
    tables[name[:-5]] = {"exact": data.get("exact", {}), "patterns": data.get("patterns", [])}

runtime = open(RUNTIME, encoding="utf-8").read()
out = (
    "// Erzeugt von tools/build-panel-i18n.py – nicht von Hand bearbeiten.\n"
    "// Quelle: custom_components/casora/translations/panel/*.json\n"
    + runtime.replace("/*__TABLES__*/{}", json.dumps(tables, ensure_ascii=False, separators=(",", ":")))
)
open(OUT, "w", encoding="utf-8").write(out)
print(f"{OUT}: {', '.join(f'{k} ({len(v['exact'])})' for k, v in tables.items())}")
