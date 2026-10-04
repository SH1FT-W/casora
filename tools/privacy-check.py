#!/usr/bin/env python3
"""Prüft, ob Persönliches im Repo landet (vor jedem Commit, siehe dev/install-hooks.sh).

Verboten: Heimordner-Pfade (/Users/<name>, /home/<name>) und alles aus den privaten,
nicht eingecheckten Listen – die Liste selbst darf ja nicht ins Repo:
  dev/privat-woerter.txt          ein Wort je Zeile (Namen, Orte …)
  dev/demo/privat.json            Ersetzungen fürs Demo-Haus („ersetzen“: [[wort, …]])
  dev/casora_mock/fixture.json    Entitäts-IDs des eigenen Hauses
Aufruf: python3 tools/privacy-check.py [--staged]   (Rückgabe 1 bei Funden)
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
GENERIC = re.compile(r"\.(casora|hemma)_|^sun\.sun$|^sensor\.(time|date)$|^weather\.home$|^zone\.home$|"
                     r"home_assistant_(core|operating|supervisor)|^alarm_control_panel\.alarmo$|^update\.hacs|"
                     r"^sensor\.air_quality$")
HOME = re.compile(r"/(Users|home)/(?!runner\b|user\b|<)[A-Za-z][\w.-]+/")
# Konten und Dienste: echte Mail-Adressen (außer noreply/Beispiel), Apple-Relay, Cloudflare-Worker/-Konto.
ACCOUNT = re.compile(r"\b[A-Za-z0-9._%+-]+@(?!\d+x\.|example\.(com|org)\b|users\.noreply\.github\.com\b|anthropic\.com\b)"
                     r"[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b"
                     r"|privaterelay\.appleid|\.workers\.dev\b|\b(account_id|kv_namespace_id)\b\s*[:=]")
SKIP = (".woff2", ".woff", ".ttf", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".gif", ".zip")


def private_terms():
    words = set()
    p = "dev/privat-woerter.txt"
    if os.path.exists(p):
        words |= {w.strip() for w in open(p, encoding="utf-8") if w.strip() and not w.startswith("#")}
    p = "dev/demo/privat.json"
    if os.path.exists(p):
        words |= {a for a, _ in json.load(open(p, encoding="utf-8")).get("ersetzen", []) if len(a) > 3}
    ids = set()
    p = "dev/casora_mock/fixture.json"
    if os.path.exists(p):
        ids = {e["entity_id"] for e in json.load(open(p, encoding="utf-8"))["entities"]
               if not GENERIC.search(e["entity_id"])}
    return words, ids


def files(staged):
    cmd = ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"] if staged else ["git", "ls-files"]
    return [f for f in subprocess.run(cmd, capture_output=True, text=True).stdout.split() if not f.endswith(SKIP)]


def main():
    staged = "--staged" in sys.argv
    words, ids = private_terms()
    word_re = re.compile("|".join(re.escape(w) for w in sorted(words, key=len, reverse=True))) if words else None
    tok = re.compile(r"\b[a-z_]+\.[a-z0-9_]+\b")
    hits = []
    for f in files(staged):
        if f == "tools/privacy-check.py":
            continue
        try:
            text = (subprocess.run(["git", "show", ":" + f], capture_output=True, text=True, errors="ignore").stdout
                    if staged else open(f, encoding="utf-8", errors="ignore").read())
        except OSError:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            found = [m.group(0) for m in HOME.finditer(line)] + [m.group(0) for m in ACCOUNT.finditer(line)]
            if word_re:
                found += [m.group(0) for m in word_re.finditer(line)]
            if ids:
                found += [t for t in tok.findall(line) if t in ids]
            if found:
                hits.append(f"{f}:{n}: {', '.join(sorted(set(found)))}")
    if hits:
        print("Persönliches gefunden – bitte entfernen (tools/privacy-check.py):")
        print("\n".join(hits[:50]))
        if len(hits) > 50:
            print(f"… und {len(hits) - 50} weitere")
        return 1
    print(f"privacy-check: ok ({len(words)} Wörter, {len(ids)} IDs geprüft)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
