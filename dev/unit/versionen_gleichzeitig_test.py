"""Versionen: zwei gleichzeitige Speichervorgänge (versions._Store.add) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/versionen_gleichzeitig_test.py

B-PY-11: Dashboard X speichert einen Stand mit einer Vorlage, die schon in blobs/ liegt
(nur noch vom ältesten Stand von Y benutzt). Während X schreibt, erreicht Y 30 Stände und räumt
auf – die Vorlage darf dabei nicht verschwinden, sonst scheitert „Wiederherstellen“ von X.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import versions  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


root = tempfile.mkdtemp()
TPL = {"casora_x": {"variables": {"a": 1}}}
y = versions._Store(root, "y")
# Ältester Stand von Y nutzt die Vorlage, alle späteren nicht.
y.add("y", None, {"views": [], versions.TPL: TPL}, None, {"kind": "save"})
for i in range(1, versions.KEEP):
    y.add("y", None, {"views": [{"title": str(i)}]}, None, {"kind": "save"})

x = versions._Store(root, "x")
gc_done = threading.Event()
real_write = x._write_json


def slow_write(path, data):
    # X hat die Vorlage schon als vorhanden erkannt und schreibt jetzt seinen Stand – Y räumt dazwischen auf.
    if path.startswith(x.dir) and path.endswith(".json") and not path.endswith("index.json"):
        gc_done.wait(0.5)
    real_write(path, data)


x._write_json = slow_write
tx = threading.Thread(target=lambda: x.add("x", None, {"views": [], versions.TPL: TPL}, None, {"kind": "save"}))
tx.start()
threading.Event().wait(0.05)
ty = threading.Thread(target=lambda: (y.add("y", None, {"views": [{"title": "neu"}]}, None, {"kind": "save"}),
                                      gc_done.set()))
ty.start()
tx.join()
ty.join()

vid = x.index()[0]["id"]
try:
    got = x.get(vid)
    ok = got["config"][versions.TPL] == TPL
except OSError as err:
    ok, got = False, err
check("B-PY-11: Stand von X lässt sich wiederherstellen", ok, repr(got))

print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
