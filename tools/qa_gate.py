#!/usr/bin/env python3
"""Prüft, ob das Qualitäts-Gate (dev/qa/gate.sh) für den aktuellen Commit grün ist.

Gebraucht von tools/release.sh und tools/build-card-update.py:
  - Arbeitsstand sauber (keine geänderten Dateien unter Versionskontrolle),
  - .qa/gate-<HEAD>.json vorhanden, alle Schritte ok,
  - vollständiger Lauf: nicht --quick, nicht --only/--no-switch, nicht auf geändertem Stand,
  - Umfang: ein volles Gate gilt immer. Ein Patch-Gate (nur die betroffenen Tests, dev/qa/gate.sh
    --patch) gilt für ein Release X.Y.Z nur mit Z>0 und nur, wenn sein Bezug ein grünes volles Gate
    eines Vorfahren von HEAD ist. Ein nachgeholtes Gate (--nachholen) hat den Umfang seines Vorlaufs.

    python3 tools/qa_gate.py                   # Rückgabe 0 = grün, sonst 1 mit Begründung
    python3 tools/qa_gate.py --version 1.2.1   # für dieses Release (Patch-Gate nur bei Z>0)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], check=True, capture_output=True, text=True).stdout.strip()


def _load(path: str) -> dict | None:
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _is_ancestor(commit: str) -> bool:
    return subprocess.run(["git", "-C", ROOT, "merge-base", "--is-ancestor", commit, "HEAD"],
                          capture_output=True).returncode == 0


def gate_files() -> list[str]:
    """Gate-Ergebnisse aller Arbeitskopien (Haupt-Checkout und Worktrees) – ein Patch-Gate in einem neuen
    Worktree darf sich auf das volle Gate des letzten Releases aus einem anderen Worktree beziehen."""
    roots = [ROOT]
    try:
        out = _git("worktree", "list", "--porcelain")
        roots += [l[9:] for l in out.splitlines() if l.startswith("worktree ")]
    except subprocess.CalledProcessError:
        pass
    files = []
    for r in dict.fromkeys(os.path.realpath(x) for x in roots):
        d = os.path.join(r, ".qa")
        if os.path.isdir(d):
            files += [os.path.join(d, f) for f in os.listdir(d) if f.startswith("gate-") and f.endswith(".json")]
    return files


def full_green(doc: dict | None) -> bool:
    return bool(doc and doc.get("ok") and doc.get("umfang", "voll") == "voll"
                and not (doc.get("quick") or doc.get("partial") or doc.get("dirty")))


def last_full_green() -> str:
    """Commit des jüngsten grünen vollen Gates, das Vorfahre von HEAD ist (oder "")."""
    best = None
    for f in gate_files():
        d = _load(f)
        if not full_green(d) or not _is_ancestor(d.get("commit", "")):
            continue
        if best is None or d.get("timestamp", "") > best[0]:
            best = (d.get("timestamp", ""), d["commit"])
    return best[1] if best else ""


def gate_status(require_clean: bool = True, version: str | None = None) -> tuple[bool, str]:
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
    umfang = doc.get("umfang", "voll")
    extra = ""
    if doc.get("nachgeholt"):
        n = doc["nachgeholt"]
        extra += f", nachgeholt auf {str(n.get('von'))[:12]} ({len(n.get('neu_gelaufen', []))} neu, {n.get('uebernommen')} übernommen)"
    if doc.get("wackler"):
        extra += f", {len(doc['wackler'])} Wackler"
    if umfang == "patch":
        if version is not None:
            parts = version.split(".")
            if len(parts) != 3 or parts[2] == "0":
                return False, (f"Gate für {head[:12]} ist ein Patch-Gate – ein Release {version} (X.Y.0) braucht das "
                               "volle Gate: dev/qa/gate.sh --voll")
        basis = doc.get("basis") or ""
        bdoc = None
        for f in gate_files() if basis else []:
            if os.path.basename(f) == f"gate-{basis}.json" and full_green(_load(f)):
                bdoc = _load(f)
        if not full_green(bdoc):
            return False, f"Patch-Gate für {head[:12]}: Bezug {basis[:12] or '?'} ist kein grünes volles Gate – dev/qa/gate.sh --voll"
        if not _is_ancestor(basis):
            return False, f"Patch-Gate für {head[:12]}: Bezug {basis[:12]} ist kein Vorfahre von HEAD"
        extra += f", Patch-Gate auf vollem Gate {basis[:12]}"
    elif umfang != "voll":
        return False, f"Gate für {head[:12]} hat unbekannten Umfang „{umfang}“"
    return True, f"Gate grün: {rel} ({doc.get('timestamp')}, {len(doc.get('steps', []))} Schritte{extra})"


if __name__ == "__main__":
    if "--letztes-volles" in sys.argv[1:]:   # für dev/qa/gate.sh --patch
        print(last_full_green())
        sys.exit(0)
    ver = sys.argv[sys.argv.index("--version") + 1] if "--version" in sys.argv[1:-1] else None
    ok, msg = gate_status(version=ver)
    print(msg)
    sys.exit(0 if ok else 1)
