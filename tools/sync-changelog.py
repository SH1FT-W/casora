#!/usr/bin/env python3
"""Kopiert CHANGELOG.md (englisch, die Quelle) und CHANGELOG.de.md (deutsch) in die Integration
(custom_components/casora/).

Das Release-Archiv bringt nur custom_components/casora mit; Studio → „Updates“ und der
Update-Eintrag in HA lesen von dort die Versionshinweise in der Sprache der Oberfläche
(Deutsch → CHANGELOG.de.md, sonst CHANGELOG.md), wenn GitHub nicht erreichbar ist oder die
Version noch nicht auf GitHub steht. Vor jedem Release nach dem Nachtragen beider Dateien:

    python3 tools/sync-changelog.py          # kopieren
    python3 tools/sync-changelog.py --check  # nur prüfen (CI), Rückgabe 1 wenn veraltet

Beide Male wird auch geprüft, dass beide Dateien dieselben Versionsüberschriften haben
(„## 1.0.3 – 04.10.2026“, gleiche Reihenfolge, gleiches Datum).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ("CHANGELOG.md", "CHANGELOG.de.md")


def read(path):
    try:
        return open(path, encoding="utf-8").read()
    except OSError:
        return None


def headings(text):
    """Versionsüberschriften außerhalb von Codeblöcken: [„1.0.3 – 04.10.2026“, …]."""
    out, fence = [], False
    for line in (text or "").splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
        m = None if fence else re.match(r"^##(?!#)\s+(\[?\d+\.\d+.*?)\s*$", line)
        if m:
            out.append(m.group(1))
    return out


def main():
    check = "--check" in sys.argv
    bad = False
    texts = {}
    for name in FILES:
        src = read(os.path.join(ROOT, name))
        if src is None:
            print(f"{name} fehlt")
            bad = True
            continue
        texts[name] = src
        dst_path = os.path.join(ROOT, "custom_components/casora", name)
        if read(dst_path) == src:
            print(f"{name}: schon aktuell")
        elif check:
            print(f"custom_components/casora/{name} ist veraltet – python3 tools/sync-changelog.py ausführen")
            bad = True
        else:
            open(dst_path, "w", encoding="utf-8").write(src)
            print(f"custom_components/casora/{name} aktualisiert")

    if len(texts) == len(FILES):
        en, de = (headings(texts[n]) for n in FILES)
        if en != de:
            bad = True
            print("CHANGELOG.md und CHANGELOG.de.md haben nicht dieselben Versionsüberschriften:")
            for h in en:
                if h not in de:
                    print(f"  nur englisch: ## {h}")
            for h in de:
                if h not in en:
                    print(f"  nur deutsch:  ## {h}")
            if sorted(en) == sorted(de):
                print("  (gleiche Überschriften, andere Reihenfolge)")
        else:
            print(f"Versionsüberschriften gleich ({len(en)})")

    if bad:
        sys.exit(1)
    if check:
        print("CHANGELOG aktuell")


if __name__ == "__main__":
    main()
