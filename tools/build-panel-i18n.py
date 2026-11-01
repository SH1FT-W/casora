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
OUT_LANG = os.path.join(ROOT, "custom_components/casora/panel/i18n")
INLINE = "en"

tables = {}
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".json"):
        continue
    data = json.load(open(os.path.join(SRC, name), encoding="utf-8"))
    tables[name[:-5]] = {"exact": data.get("exact", {}), "patterns": data.get("patterns", [])}

# English (the Studio's own language, a few entries) stays inline; every other language is its own file,
# fetched by the runtime only when that language is shown (served as /casora_panel/i18n/<lang>.json).
inline = {k: v for k, v in tables.items() if k == INLINE}
avail = sorted(k for k in tables if k != INLINE)
runtime = open(RUNTIME, encoding="utf-8").read()
for marker in ("/*__TABLES__*/{}", "/*__AVAIL__*/[]", "/*__SELF__*/null"):
    assert marker in runtime, marker
out = (
    "// Erzeugt von tools/build-panel-i18n.py – nicht von Hand bearbeiten.\n"
    "// Quelle: custom_components/casora/translations/panel/*.json\n"
    + runtime.replace("/*__TABLES__*/{}", json.dumps(inline, ensure_ascii=False, separators=(",", ":")))
    .replace("/*__AVAIL__*/[]", json.dumps(avail))
    .replace("/*__SELF__*/null", "import.meta.url")
)
open(OUT, "w", encoding="utf-8").write(out)
os.makedirs(OUT_LANG, exist_ok=True)
for name in os.listdir(OUT_LANG):
    if name.endswith(".json") and name[:-5] not in avail:
        os.remove(os.path.join(OUT_LANG, name))
for k in avail:
    text = json.dumps(tables[k], ensure_ascii=False, separators=(",", ":"))
    path = os.path.join(OUT_LANG, k + ".json")
    try:
        # Unchanged files keep their time stamp (part of the Studio's ?v=).
        if open(path, encoding="utf-8").read() == text:
            continue
    except OSError:
        pass
    open(path, "w", encoding="utf-8").write(text)
print(f"{OUT}: {', '.join(f'{k} ({len(v['exact'])})' for k, v in tables.items())}")
