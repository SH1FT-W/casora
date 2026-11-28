"""Dutch Studio texts name a popup "venster", one word for one thing (#257).

About 119 strings said "venster", 14 "pop-up" and 6 "popup". Checks the Dutch Studio translations (source and
built file) for "pop-up"/"popup" in any form, also inside compounds such as "klimaatpop-up".

  python3 dev/unit/nl_venster_test.py
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "custom_components", "casora")
FILES = ["translations/panel/nl.json", "panel/i18n/nl.json"]
POPUP = re.compile(r"pop-?ups?", re.I)


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        # A pattern pair [English regex, Dutch text]: only the Dutch side counts.
        if len(node) == 2 and isinstance(node[0], str) and node[0].startswith("^"):
            yield from strings(node[1])
            return
        for v in node:
            yield from strings(v)


bad = []
for rel in FILES:
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        data = json.load(f)
    bad += [f"{rel}: {s}" for s in strings(data) if POPUP.search(s)]
if bad:
    print('✗ Dutch says "pop-up"/"popup" instead of "venster":')
    for b in bad:
        print("   " + b[:160])
    sys.exit(1)
print('  ok     Dutch Studio texts say "venster" throughout')
print("alles ok")
