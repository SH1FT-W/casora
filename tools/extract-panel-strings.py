#!/usr/bin/env python3
"""Sammelt sichtbare englische UI-Texte aus panel/casora-panel.js.

    python3 tools/extract-panel-strings.py > /tmp/panel-strings.json

Kandidaten: Text zwischen Tags in String-Literalen, textContent/innerText/
title/placeholder/aria-label-Zuweisungen und typische Objekt-Felder (label,
title, helper, hint, description, why …). Ergebnis ist eine Liste; die
Übersetzung pflegt man in translations/panel/de.json.
"""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "custom_components/casora/panel/casora-panel.js"), encoding="utf-8").read()
found = set()
def add(s):
    s = s.strip()
    if len(s) < 2 or not re.search(r"[A-Za-z]{2}", s): return
    if re.fullmatch(r"[a-z0-9_.:/#\-]+", s): return          # ids, keys, pfade
    if re.search(r"^(mdi|hass|ha-|--|var\(|https?:|/|\.)", s): return
    if "${" in s or "=>" in s or ";" in s and len(s) > 40: return
    found.add(s)
for m in re.finditer(r">([^<>\n'\"`]{2,120})<", src): add(m.group(1))
for m in re.finditer(r"(?:textContent|innerText|title|placeholder|ariaLabel|label)\s*=\s*([\"'])((?:(?!\1).){2,200})\1", src): add(m.group(2))
for m in re.finditer(r"\b(?:label|title|helper|hint|description|why|text|placeholder|empty|confirm|subtitle|caption|tooltip|note)\s*:\s*([\"'])((?:(?!\1).){2,300})\1", src): add(m.group(2))
for m in re.finditer(r"(?:title|placeholder|aria-label)=\\?[\"']([^\"'\\]{2,120})\\?[\"']", src): add(m.group(1))
out = sorted(found, key=str.lower)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
print(f"\n{len(out)} Texte", file=sys.stderr)
