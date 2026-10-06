"""Zeitreise: benannte und angeheftete Stände (versions._Store.label, _trim) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/versionen_anheften_test.py

Erwartet: Ein Name lässt sich setzen und wieder entfernen; angeheftete Stände zählen nicht
zu den KEEP Ständen und überstehen jedes Aufräumen samt Datei; höchstens PIN_MAX angeheftet.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import versions  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


root = tempfile.mkdtemp()
s = versions._Store(root, "d")
first = s.add("d", None, {"views": [{"title": "0"}]}, None, {"kind": "save"})
s.label(first, "Vor dem Umbau", True)
e = s.index()[0]
check("Name und Stecknadel stehen im Index", e.get("name") == "Vor dem Umbau" and e.get("pinned") is True, e)

for i in range(1, versions.KEEP + 6):
    s.add("d", None, {"views": [{"title": str(i)}]}, None, {"kind": "save"})
ids = [v["id"] for v in s.index()]
check("Angehefteter Stand übersteht das Aufräumen", first in ids, len(ids))
check("Datei des angehefteten Stands bleibt", os.path.exists(os.path.join(s.dir, first + ".json")))
check("Daneben bleiben genau KEEP lose Stände", len(ids) == versions.KEEP + 1, len(ids))
check("Angehefteter Stand lässt sich weiter lesen", s.get(first)["config"]["views"][0]["title"] == "0")

s.label(first, "", None)
e = next(v for v in s.index() if v["id"] == first)
check("Leerer Name entfernt den Namen, Stecknadel bleibt", "name" not in e and e.get("pinned") is True, e)
s.label(first, None, False)
s.add("d", None, {"views": [{"title": "neu"}]}, None, {"kind": "save"})
check("Gelöst wird er wieder normal aufgeräumt", first not in [v["id"] for v in s.index()])

for v in s.index()[: versions.PIN_MAX]:
    s.label(v["id"], None, True)
try:
    s.label(s.index()[versions.PIN_MAX]["id"], None, True)
    over = False
except OverflowError:
    over = True
check("Mehr als PIN_MAX angeheftete werden abgelehnt", over)
try:
    s.label("19990101-000000-000000", "x", None)
    nf = False
except ValueError:
    nf = True
check("Unbekannter Stand meldet Fehler", nf)
check("Index bleibt gültiges JSON", isinstance(json.load(open(s.index_path)).get("versions"), list))

if fails:
    print(f"FAIL versionen_anheften ({len(fails)})")
    sys.exit(1)
print("PASS versionen_anheften")
