#!/usr/bin/env python3
"""Fingerabdrücke aller Original-Vorlagen aus allen Hemma-Versionen (Git-Verlauf bis v2.1.2).

    python3 tools/build-hemma-originals.py

Liest jede Fassung jeder Datei unter dashboards/templates/button_cards (alle Commits,
die zu v2.1.2 geführt haben) und schreibt panel/hemma-originals.json:
{"hemma_camera": ["k3j9x…", …], …}. Der Umzugsassistent erkennt daran, ob ein Nutzer
eine Hemma-Vorlage verändert hat. Gehasht wird mit derselben Funktion wie im Studio
(stable + FNV-1a, siehe tools/hash-templates.mjs), damit Build und Laufzeit übereinstimmen.
"""
import datetime
import json
import os
import subprocess
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "custom_components/casora/panel/hemma-originals.json")
TIP = "v2.1.2"
DIR = "dashboards/templates/button_cards"
SKIP = "new popups (untested)"


def git(*args, binary=False):
    r = subprocess.run(["git", "-C", ROOT, *args], capture_output=True)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


class Loader(yaml.SafeLoader):
    pass


# Vorlagen enthalten keine Includes; unbekannte Tags trotzdem nicht abbrechen lassen.
Loader.add_multi_constructor("!", lambda loader, suffix, node: None)


def default(o):
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()
    return str(o)


def main():
    blobs = set()
    for c in git("rev-list", TIP).split():
        for line in git("ls-tree", "-r", c, "--", DIR).splitlines():
            meta, path = line.split("\t", 1)
            if path.endswith(".yaml") and SKIP not in path:
                blobs.add(meta.split()[2])
    defs = {}
    for b in sorted(blobs):
        try:
            doc = yaml.load(git("cat-file", "-p", b, binary=True).decode("utf-8", "replace"), Loader=Loader)
        except yaml.YAMLError:
            continue
        if not isinstance(doc, dict):
            continue
        for name, body in doc.items():
            if isinstance(name, str) and isinstance(body, dict):
                defs.setdefault(name, set()).add(json.dumps(body, ensure_ascii=False, default=default, sort_keys=True))
    payload = [{"name": n, "bodies": sorted(v)} for n, v in sorted(defs.items())]
    r = subprocess.run(["node", os.path.join(ROOT, "tools/hash-templates.mjs")], input=json.dumps(payload),
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr)
    prints = json.loads(r.stdout)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"_quelle": f"Hemma bis {TIP}, {len(blobs)} Dateifassungen", "templates": prints},
                  fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    total = sum(len(v) for v in prints.values())
    print(f"{len(prints)} Vorlagen, {total} Original-Fassungen → {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
