"""Adding the integration ends on a hint where to go next (V21, newcomer round 14.11.2026).

  python3 dev/unit/config_flow_studio_hint_test.py

HA's success dialog only said "Configuration created for Casora Studio." The flow passes no description, so
HA's frontend shows `config.create_entry.default` from the integration's translations: every language has it,
names the sidebar entry "Casora Studio" and keeps the other config texts.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TR = os.path.join(ROOT, "custom_components/casora/translations")
fails = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else "  " + repr(info)[:300]))
    if not cond:
        fails.append(name)


files = sorted(glob.glob(os.path.join(TR, "*.json")))
check("translations found", len(files) >= 9, files)
for path in files:
    lang = os.path.basename(path)[:-5]
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f).get("config", {})
    text = (cfg.get("create_entry") or {}).get("default", "")
    check(lang + ": create_entry.default names Casora Studio", "Casora Studio" in text, text)
    check(lang + ": still has the user step", bool((cfg.get("step") or {}).get("user")), cfg)

with open(os.path.join(ROOT, "custom_components/casora/config_flow.py"), encoding="utf-8") as f:
    flow = f.read()
m = re.search(r"return self\.async_create_entry\(title=PANEL_TITLE, data=\{\}\)", flow)
check("the flow sets no own description (HA then shows 'default')", bool(m))

if fails:
    print("FAIL config_flow_studio_hint_test: " + ", ".join(fails))
    sys.exit(1)
print("ok config_flow_studio_hint_test")
