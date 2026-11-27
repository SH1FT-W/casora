"""French addresses the user with "tu", like the German "du" (#248).

Two strings slipped into "vous" ("Touchez les pièces", "Redémarrez Home Assistant et réessayez."). This checks the
translation sources and the files built from them for the pronoun "vous"/"votre"/"vos" and for imperatives in the
"vous" form (a verb ending in -ez at the start of a sentence).

  python3 dev/unit/fr_tutoiement_test.py
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "custom_components", "casora")
FILES = [
    "translations/dashboard/phrases/fr.json",
    "translations/panel/fr.json",
    "scripts/i18n/fr.json",
    "panel/i18n/fr.json",
]
PRONOUN = re.compile(r"\b(vous|votre|vos)\b", re.I)
# "Touchez …", "… . Redémarrez …", "… et réessayez." – an -ez verb opening a sentence or joined by "et".
IMPERATIVE = re.compile(r"(?:^|[.!?:]\s+|\bet\s+)([A-Za-zÀ-ÿ’']+ez)\b")
NOT_VERBS = {"assez", "chez"}


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def main():
    bad = []
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for s in strings(data):
            if PRONOUN.search(s) or any(m.group(1).lower() not in NOT_VERBS for m in IMPERATIVE.finditer(s)):
                bad.append(f"{rel}: {s}")
    if bad:
        print("✗ French uses \"vous\" instead of \"tu\":")
        for b in bad:
            print("   " + b)
        sys.exit(1)
    print(f"  ok     French uses \"tu\" throughout ({len(FILES)} files)")
    print("alles ok")


if __name__ == "__main__":
    main()
