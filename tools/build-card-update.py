#!/usr/bin/env python3
"""Baut ein Karten-Update (Vorlagen-Fixes ohne Casora-Release) – veröffentlicht nichts.

    python3 tools/build-card-update.py [--ref v0.4.0] [--note NAME=TEXT ...] [--notes-file F]
                                       [--notes-md-file F] [--only NAME ...] [--out DIR] [--list]

Vergleicht dashboards/casora/button_card_templates.json (Arbeitsstand) mit dem
ausgelieferten Vorlagen-Bundle des letzten Releases (--ref, Standard: jüngster
v*-Tag; Datei custom_components/casora/panel/casora-templates.json in diesem Stand)
und packt die geänderten casora_*-Vorlagen in ein Paket (Format: card_package.py).
Neue Vorlagen kommen nicht hinein (neue Kacheln brauchen ein Release).

Notizen je Vorlage (deutsch, erscheinen in Casora Studio → Updates):
  --note casora_waschmaschine="Restzeit springt nicht mehr"
  --notes-file notizen.txt     Zeilen „name: text“ oder JSON {"name": "text"}
Fehlende Notizen werden abgefragt (ohne Terminal: Abbruch). Der Paket-Text (notes_md)
kommt aus --notes-md-file oder wird aus den Notizen zusammengesetzt.

Am Ende steht der gh-Befehl zum Veröffentlichen – ausgeführt wird er nicht.
Gebaut wird nur mit grünem Qualitäts-Gate für HEAD (dev/qa/gate.sh, sauberer Stand);
--probe baut ohne Gate zum Testen, dann ohne Veröffentlichungsbefehl.
WICHTIG: immer mit --latest=false, sonst hielte die Casora-Update-Prüfung
(/releases/latest) das Karten-Update für eine neue Casora-Version.
"""

from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CC = os.path.join(ROOT, "custom_components/casora")
BUNDLE_REL = "custom_components/casora/panel/casora-templates.json"
SRC = os.path.join(ROOT, "dashboards/casora/button_card_templates.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from template_checks import fixed_ids  # noqa: E402
from qa_gate import gate_status  # noqa: E402


def _load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cp = _load_module("card_package", os.path.join(CC, "card_package.py"))
UPDATE_REPO = _load_module("casora_const", os.path.join(CC, "const.py")).UPDATE_REPO


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], check=True, capture_output=True, text=True).stdout


def last_release_tag() -> str:
    tags = [t for t in git("tag", "-l", "v*", "--sort=-v:refname").split() if re.match(r"^v\d+\.\d+\.\d+$", t)]
    if not tags:
        raise SystemExit("Kein Release-Tag v*.*.* gefunden – bitte --ref oder --base angeben")
    return tags[0]


def templates_of(doc: dict) -> dict:
    return doc["templates"] if isinstance(doc.get("templates"), dict) else doc


def template_refs(o, out: set) -> set:
    """Alle Vorlagen, auf die ein Body verweist (template: name bzw. [namen])."""
    if isinstance(o, dict):
        t = o.get("template")
        if isinstance(t, str):
            out.add(t)
        elif isinstance(t, list):
            out.update(x for x in t if isinstance(x, str))
        for v in o.values():
            template_refs(v, out)
    elif isinstance(o, list):
        for v in o:
            template_refs(v, out)
    return out


def read_notes(path: str | None, pairs: list[str]) -> dict:
    notes: dict = {}
    if path:
        text = open(path, encoding="utf-8").read()
        try:
            notes.update(json.loads(text))
        except ValueError:
            for line in text.splitlines():
                if ":" in line and not line.lstrip().startswith("#"):
                    k, _, v = line.partition(":")
                    notes[k.strip()] = v.strip()
    for p in pairs:
        k, sep, v = p.partition("=")
        if not sep:
            raise SystemExit(f"--note erwartet NAME=TEXT, nicht {p!r}")
        notes[k.strip()] = v.strip()
    return notes


def next_id(out_dir: str, day: str) -> str:
    used = set(git("tag", "-l", f"karten-{day}-*").split())
    if os.path.isdir(out_dir):
        used |= {f[:-5] for f in os.listdir(out_dir) if f.startswith(f"karten-{day}-") and f.endswith(".json")}
    n = 1 + max((int(m.group(1)) for u in used if (m := re.match(rf"^karten-{day}-(\d+)$", u))), default=0)
    return f"karten-{day}-{n}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Karten-Update bauen (veröffentlicht nichts)")
    ap.add_argument("--ref", help="Release-Stand zum Vergleich (Standard: jüngster v*-Tag)")
    ap.add_argument("--base", help="statt --ref: Bundle-Datei (casora-templates.json) als Vergleich")
    ap.add_argument("--templates", default=SRC, help="neue Vorlagen (Standard: dashboards/casora/button_card_templates.json)")
    ap.add_argument("--min-casora", help="kleinste Casora-Version (Standard: Version von --ref)")
    ap.add_argument("--only", nargs="+", metavar="NAME", help="nur diese Vorlagen")
    ap.add_argument("--note", action="append", default=[], metavar="NAME=TEXT")
    ap.add_argument("--notes-file")
    ap.add_argument("--notes-md-file", help="Paket-Text (Markdown, deutsch)")
    ap.add_argument("--id", help="Paket-ID (Standard: karten-JJJJ-MM-TT-N)")
    ap.add_argument("--out", default=os.getcwd(), help="Zielordner (Standard: aktueller Ordner)")
    ap.add_argument("--list", action="store_true", help="nur geänderte Vorlagen zeigen")
    ap.add_argument("--probe", action="store_true",
                    help="Probebau ohne Gate (Tests): Paket entsteht, aber ohne Veröffentlichungsbefehl")
    a = ap.parse_args()

    if a.base:
        base = templates_of(json.load(open(a.base, encoding="utf-8")))
        ref = None
        min_casora = a.min_casora
        if not min_casora:
            raise SystemExit("Mit --base bitte --min-casora angeben")
    else:
        ref = a.ref or last_release_tag()
        base = templates_of(json.loads(git("show", f"{ref}:{BUNDLE_REL}")))
        min_casora = a.min_casora or ref.lstrip("v")
    new = templates_of(json.load(open(a.templates, encoding="utf-8")))

    changed = sorted(k for k in new if k.startswith("casora_") and k in base
                     and cp.template_hash(new[k]) != cp.template_hash(base[k]))
    added = sorted(k for k in new if k.startswith("casora_") and k not in base)
    if a.only:
        unknown = [n for n in a.only if n not in changed]
        if unknown:
            raise SystemExit("Nicht geändert oder unbekannt: " + ", ".join(unknown))
        changed = [n for n in changed if n in a.only]

    print(f"Vergleich: {ref or a.base} → {os.path.relpath(a.templates, ROOT)}")
    print(f"Geändert ({len(changed)}): " + (", ".join(changed) or "–"))
    if added:
        print(f"Neu, NICHT im Paket (neue Kacheln brauchen ein Release): {', '.join(added)}")
    if ref:
        scripts = git("diff", "--name-only", ref, "--", "custom_components/casora/scripts").split()
        if scripts:
            print("Achtung: Skripte seit " + ref + " geändert (" + ", ".join(os.path.basename(s) for s in scripts)
                  + ") – brauchen die Vorlagen das, ist ein Release nötig; Karten-Updates tauschen keine Skripte.")
    if a.list or not changed:
        return 0

    # Karten-Updates gehen ohne Release an alle – nur mit grünem Gate für HEAD (dev/qa/gate.sh).
    gate_ok, gate_msg = (True, "Probebau – Gate nicht geprüft") if a.probe else gate_status()
    if not gate_ok:
        raise SystemExit("Kein Karten-Update ohne grünes Qualitäts-Gate:\n" + gate_msg)
    print(gate_msg)

    bodies = {k: new[k] for k in changed}
    personal = fixed_ids(bodies)
    if personal:
        raise SystemExit("Feste Entitäten in Vorlagen (auf null/[] setzen oder über den Finder lösen):\n  "
                         + "\n  ".join(personal))
    missing_refs = sorted(r for r in set().union(*(template_refs(b, set()) for b in bodies.values()))
                          if r.startswith("casora_") and r not in base)
    if missing_refs:
        raise SystemExit("Die Vorlagen verweisen auf Vorlagen, die es im Release nicht gibt: "
                         + ", ".join(missing_refs) + " – das geht nur mit einem Release.")

    notes = read_notes(a.notes_file, a.note)
    for k in changed:
        if notes.get(k):
            continue
        if not sys.stdin.isatty():
            raise SystemExit(f"Notiz für {k} fehlt (--note {k}=… oder --notes-file)")
        notes[k] = input(f"Was ändert sich an {k}? ").strip()
        if not notes[k]:
            raise SystemExit(f"Ohne Notiz für {k} kein Paket")

    items = [{"kind": "template", "name": k, "notes": notes[k], "base": cp.template_hash(base[k]),
              "hash": cp.template_hash(new[k]), "body": new[k]} for k in changed]
    if a.notes_md_file:
        notes_md = open(a.notes_md_file, encoding="utf-8").read().strip()
    else:
        notes_md = "\n".join(f"- **{k}**: {notes[k]}" for k in changed)
    now = datetime.datetime.now(datetime.timezone.utc)
    os.makedirs(a.out, exist_ok=True)
    pid = a.id or next_id(a.out, now.strftime("%Y-%m-%d"))
    pkg = {"format": cp.FORMAT, "id": pid, "published": now.replace(microsecond=0).isoformat(),
           "min_casora": min_casora, "notes_md": notes_md, "items": items, "sha256": cp.items_sha256(items)}
    # Gegenprobe mit derselben Prüfung wie in Casora.
    cp.verify_package(pkg, installed_version=min_casora, shipped=base)

    path = os.path.join(a.out, pid + ".json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(pkg, fh, ensure_ascii=False, separators=(",", ":"))
    md = os.path.join(a.out, pid + ".md")
    with open(md, "w", encoding="utf-8") as fh:
        fh.write(notes_md + "\n")
    size = os.path.getsize(path)
    if size > cp.MAX_PACKAGE_BYTES:
        raise SystemExit(f"Paket zu groß ({size} Bytes, erlaubt {cp.MAX_PACKAGE_BYTES})")

    print(f"\nPaket: {path} ({size // 1024} KB, {len(items)} Vorlage(n), ab Casora {min_casora})")
    print(f"sha256: {pkg['sha256']}")
    if a.probe:
        print("\nProbebau – nicht zum Veröffentlichen (ohne Gate gebaut).")
        return 0
    print("\nVeröffentlichen (prüfen, dann selbst ausführen):")
    print(f"  gh release create {pid} {path} --repo {UPDATE_REPO} --title {pid} "
          f"--notes-file {md} --latest=false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
