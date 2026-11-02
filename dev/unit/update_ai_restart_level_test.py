"""AI update check: a restart after installing is never "action" on its own (ki/update.yaml).

  uv run --python 3.14 --with pyyaml python dev/unit/update_ai_restart_level_test.py

Reported 02.11.2026: an integration update whose release notes only said "restart Home Assistant after
updating" was marked "Handeln" and locked until confirmed. Every integration update needs a restart, and
Casora shows it itself ("Wartet auf Neustart"). The prompt listed "Neustart" as a reason for "action".
"""

import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
doc = yaml.safe_load(open(os.path.join(ROOT, "custom_components", "casora", "ki", "update.yaml"), encoding="utf-8"))


def strings(x):
    if isinstance(x, dict):
        for v in x.values():
            yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)
    elif isinstance(x, str):
        yield x


prompt = next(s for s in strings(doc) if "BEWERTUNG (level)" in s)
action = re.search(r"- action:([^\n]*)", prompt).group(1)
bad = 0


def check(name, ok):
    global bad
    print(("ok   " if ok else "FAIL ") + name)
    bad += not ok


check("action does not list a restart as a reason", "Neustart" not in action)
check("prompt says a restart alone is info", re.search(r"neu starten.{0,40}ergibt info", prompt, re.S) is not None)
check("restart does not go into todo", "nicht in ''todo''" in prompt or "nicht in 'todo'" in prompt)
sys.exit(1 if bad else 0)
