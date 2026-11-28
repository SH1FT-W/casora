"""The wall tablet's idle hints say how the two settings work together (#256).

"Return to Home when idle" waits while a popup is open; only "Close popups when idle" gets past it. The hints
said neither, so a tablet that stayed on an open popup read as a broken setting. Checks the English hints in the
Studio and that every Studio language translates both.

  python3 dev/unit/idle_hints_test.py
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "custom_components", "casora")
with open(os.path.join(ROOT, "panel", "casora-panel.js"), encoding="utf-8") as f:
    PANEL = f.read()


def hint(key):
    m = re.search(r'key: "' + key + r'"[^}]*?hint: "([^"]*)"', PANEL, re.S)
    return m.group(1) if m else ""


home, close = hint("casora_idle_home"), hint("casora_idle_close")
fails = []
if not re.search(r"\bwaits?\b.*\bpopup\b", home, re.I):
    fails.append(f"casora_idle_home hint does not say it waits while a popup is open: {home!r}")
if "Return to Home when idle" not in close:
    fails.append(f"casora_idle_close hint does not name \"Return to Home when idle\": {close!r}")
tr_dir = os.path.join(ROOT, "translations", "panel")
for name in sorted(os.listdir(tr_dir)):
    if not name.endswith(".json") or name == "en.json":
        continue
    with open(os.path.join(tr_dir, name), encoding="utf-8") as f:
        text = f.read()
    data = json.loads(text)
    flat = {}

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, str):
                    flat[k] = v
                else:
                    walk(v)

    walk(data)
    for h in (home, close):
        if h and not flat.get(h):
            fails.append(f"{name}: no translation for {h!r}")
if fails:
    for x in fails:
        print("✗ " + x)
    sys.exit(1)
print("  ok     idle hints name the popup rule, translated in every language")
print("alles ok")
