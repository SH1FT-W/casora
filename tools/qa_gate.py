#!/usr/bin/env python3
"""Prüft, ob das Qualitäts-Gate (dev/qa/gate.sh) für den aktuellen Commit grün ist.

Gebraucht von tools/release.sh und tools/build-card-update.py:
  - Arbeitsstand sauber (keine geänderten Dateien unter Versionskontrolle),
  - .qa/gate-<HEAD>.json vorhanden, alle Schritte ok,
  - vollständiger Lauf: nicht --quick, nicht --only/--no-switch, nicht auf geändertem Stand.

    python3 tools/qa_gate.py          # Rückgabe 0 = grün, sonst 1 mit Begründung
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], check=True, capture_output=True, text=True).stdout.strip()


def gate_status(require_clean: bool = True) -> tuple[bool, str]:
    """(ok, Text) – Text nennt bei ok die Gate-Datei, sonst den Grund."""
    head = _git("rev-parse", "HEAD")
    if require_clean:
        dirty = subprocess.run(["git", "-C", ROOT, "status", "--porcelain", "--untracked-files=no"],
                               check=True, capture_output=True, text=True).stdout.rstrip()
        if dirty:
            return False, ("Arbeitsstand nicht sauber – erst committen:\n  "
                           + "\n  ".join(dirty.splitlines()[:10]))
    path = os.path.join(ROOT, ".qa", f"gate-{head}.json")
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        return False, f"Kein Gate-Ergebnis für {head[:12]} ({rel}) – dev/qa/gate.sh ausführen"
    try:
        doc = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError) as e:
        return False, f"{rel} unlesbar: {e}"
    if doc.get("commit") != head:
        return False, f"{rel} gehört zu {str(doc.get('commit'))[:12]}, nicht zu {head[:12]}"
    bad = [s["id"] for s in doc.get("steps", []) if not s.get("ok")]
    if bad or not doc.get("ok"):
        return False, f"Gate für {head[:12]} ist ROT: " + (", ".join(bad) or "keine Schritte")
    if doc.get("quick") or doc.get("partial"):
        return False, (f"Gate für {head[:12]} war nur ein Teillauf ("
                       + ", ".join(k for k in ("quick", "partial") if doc.get(k))
                       + ") – vollständig ausführen: dev/qa/gate.sh")
    if doc.get("dirty"):
        return False, f"Gate für {head[:12]} lief auf einem geänderten Arbeitsstand – nach dem Commit neu ausführen"
    return True, f"Gate grün: {rel} ({doc.get('timestamp')}, {len(doc.get('steps', []))} Schritte)"


if __name__ == "__main__":
    ok, msg = gate_status()
    print(msg)
    sys.exit(0 if ok else 1)
