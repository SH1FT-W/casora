"""Release-Gate bei Kalender-Versionen (tools/qa_gate.py).

    python3 dev/unit/qa_gate_patch_test.py

Geprüft: Ein Patch-Gate reicht für ein Release YY.M.N nur mit --patch (bewusster Notfall-Hotfix),
nie von selbst; ein volles Gate reicht immer; ein Patch-Gate ohne grünes volles Bezugs-Gate nie.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import qa_gate as q  # noqa: E402

HEAD, BASIS = "a" * 40, "b" * 40
tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(tmp, ".qa"))
q.ROOT = tmp
q._git = lambda *a: HEAD
q._is_ancestor = lambda c: True
steps = [{"id": "x", "ok": True}]


def write(commit: str, umfang: str) -> str:
    path = os.path.join(tmp, ".qa", f"gate-{commit}.json")
    doc = {"commit": commit, "ok": True, "steps": steps, "umfang": umfang}
    if umfang == "patch":
        doc["basis"] = BASIS
    json.dump(doc, open(path, "w", encoding="utf-8"))
    return path


fails = 0


def check(name: str, got: bool, want: bool) -> None:
    global fails
    if got != want:
        fails += 1
        print(f"FEHLER {name}: {got} statt {want}")
    else:
        print(f"ok {name}")


q.gate_files = lambda: [write(BASIS, "voll"), os.path.join(tmp, ".qa", f"gate-{HEAD}.json")]
write(HEAD, "patch")
check("Patch-Gate, Kalender-Version ohne --patch", q.gate_status(False, "26.10.34")[0], False)
check("Patch-Gate, Kalender-Version mit --patch", q.gate_status(False, "26.10.34", patch_ok=True)[0], True)
check("Patch-Gate, alte X.Y.0 auch mit --patch", q.gate_status(False, "1.7.0", patch_ok=True)[0], False)
write(HEAD, "voll")
check("Volles Gate, Kalender-Version", q.gate_status(False, "26.10.34")[0], True)
q.gate_files = lambda: [os.path.join(tmp, ".qa", f"gate-{HEAD}.json")]
write(HEAD, "patch")
check("Patch-Gate ohne volles Bezugs-Gate, mit --patch", q.gate_status(False, "26.10.34", patch_ok=True)[0], False)
sys.exit(1 if fails else 0)
