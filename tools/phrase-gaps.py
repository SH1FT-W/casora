#!/usr/bin/env python3
"""Deutsche Textstücke im Dashboard-Code, die phrases/en.json noch nicht übersetzt.

    python3 tools/phrase-gaps.py            # Liste der Lücken
    python3 tools/phrase-gaps.py --json     # als JSON (für Nachbearbeitung)

Liest String-Literale aus den Kachel-Vorlagen (panel/casora-templates.json) und den
Dashboard-Skripten (scripts/local/*.js, casora-core.js) und prüft sie wie die
Laufzeit: exakter Eintrag, sonst Muster, sonst Teile zwischen „ · “. Stücke aus
zusammengesetzten Texten ('alle ' + n + ' Wochen') tauchen als Bruchstück auf –
die brauchen ein Muster für den fertigen Text, nicht einen Eintrag fürs Stück.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CC = os.path.join(ROOT, "custom_components/casora")
PHRASES = os.path.join(CC, "translations/dashboard/phrases/en.json")
SOURCES = [os.path.join(CC, "scripts/casora-core.js")] + sorted(
    os.path.join(CC, "scripts/local", f) for f in os.listdir(os.path.join(CC, "scripts/local")) if f.endswith(".js"))

GERMAN = re.compile(r"[äöüÄÖÜß]|\b(und|oder|nicht|kein|keine|jetzt|heute|gestern|morgen|seit|noch|vor|läuft|Uhr|Tage?|"
                    r"Woche|Wochen|Fenster|Licht|Akku|fällig|Fehler|Alle|Zuletzt|Raum|Gerät|Aus|An|Offen|Bereit|Fertig|"
                    r"Pausiert|Verbrauch|Leistung|Gesamt|Restzeit|Programm|Letzte|Nächste|Keine?|Nichts|gerade|eben|bis|"
                    r"Min\.|Std\.|Tippen|Öffnen|Schließen|Weiter|Zurück|Neu|Starten|Aktiv|Inaktiv|Sicher|Warm|Kalt|"
                    r"Heizen|Kühlen|Lüften|Laden|Entladen|Zuhause|Abwesend|Stunden|Minuten|Sekunden|Jahr|Monat|"
                    r"Schalter|Sensor|Steckdose|Drucker|Wäsche|Trockner|Spüler|Tür|Schloss|Verriegelt|Entriegelt)\b")
LIT = re.compile(r"'((?:[^'\\\n]|\\.){2,200})'|\"((?:[^\"\\\n]|\\.){2,200})\"|`((?:[^`\\]|\\.){2,300})`")
# Zweiter Test: Wörter, die das englische Systemwörterbuch nicht kennt („Durchgang“).
try:
    with open("/usr/share/dict/words", encoding="utf-8") as _fh:
        ENGLISH = {w.strip().lower() for w in _fh}
except OSError:
    ENGLISH = set()
ENGLISH |= {"ok", "wifi", "wlan", "app", "apps", "online", "offline", "status", "min", "kwh", "ppm", "pm", "co", "uv",
            "hpa", "mbit", "rgb", "led", "usb", "tv", "ams", "pla", "petg", "pei", "eco", "auto", "bypass"}
TEXTLIKE = re.compile(r"^[A-Za-zÄÖÜäöüß0-9 .,:;·–\-!?()/%°²³₂„“”'…+&]+$")


def german(part: str) -> bool:
    if GERMAN.search(part):
        return True
    if not ENGLISH or not TEXTLIKE.match(part) or not re.search(r"[A-Za-z]{3}", part):
        return False
    words = [w.lower() for w in re.findall(r"[A-Za-zÄÖÜäöüß]{4,}", part)]
    return bool(words) and any(w not in ENGLISH and w.rstrip("s") not in ENGLISH for w in words)


CODEISH = re.compile(r"^[a-z_$][\w.\-/#:%]*$|^[\w.\-/#:%]*[_./#:%][\w.\-/#:%]*$|[{};=]|=>|\bfunction\b|\breturn\b|^mdi:|^\.|\$\{|^<|>$|\bvar\(--|[\w-]\(|^[+),:?|\-]|[(,]$| \+ |%[0-9A-F]{2}|\b(px|ms|deg|fr|vh|vw|dvh)\b|^[a-z]+(-[a-z]+)+\b|^casora[ :-]|\b(the|is|was|has|not|got|with|and)\b")


def literals(js: str):
    for m in LIT.finditer(js):
        s = next(g for g in m.groups() if g is not None)
        s = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)
        s = s.replace("\\'", "'").replace('\\"', '"').replace("\\n", " ")
        # HTML-Reste: nur Text zwischen den Tags
        for part in re.split(r"<[^>]*>", s):
            core = part.strip()
            if len(core) >= 2 and german(core) and not CODEISH.search(core):
                yield core


def js_sources():
    for p in SOURCES:
        with open(p, encoding="utf-8") as fh:
            yield os.path.relpath(p, ROOT), fh.read()
    with open(os.path.join(CC, "panel/casora-templates.json"), encoding="utf-8") as fh:
        tpl = json.load(fh)["templates"]

    def strings(node):
        if isinstance(node, str):
            yield node
        elif isinstance(node, dict):
            for v in node.values():
                yield from strings(v)
        elif isinstance(node, list):
            for v in node:
                yield from strings(v)

    for name, body in tpl.items():
        yield "tpl:" + name, "\n".join(strings(body))


def translator():
    with open(PHRASES, encoding="utf-8") as fh:
        t = json.load(fh)
    exact = t["exact"]
    pats = []
    for p, rep, *_ in t["patterns"]:
        try:
            pats.append((re.compile(p), rep))
        except re.error:
            pass

    def one(core, depth=0):
        if core in exact:
            return exact[core]
        if depth > 2:
            return None
        for rx, rep in pats:
            if rx.search(core):
                return rep
        return None

    def ok(core):
        core = core.replace(" ", " ").replace(" ", " ")
        if one(core) is not None:
            return True
        if " · " in core:
            return all(one(p.strip()) is not None or not GERMAN.search(p) for p in core.split(" · "))
        return False

    return ok


def main() -> int:
    ok = translator()
    gaps: dict[str, set] = {}
    for where, js in js_sources():
        for s in literals(js):
            # Bruchstück ('Fertig gegen ' + t): mit Platzhaltern so testen, wie es angezeigt wird.
            tries = [s] + [a + s + b for a in ("", "5 ", "Alex ") for b in ("", " 5", " 14:30", " Alex")]
            if not any(ok(x) for x in tries):
                gaps.setdefault(s, set()).add(where)
    if "--json" in sys.argv:
        print(json.dumps({k: sorted(v) for k, v in sorted(gaps.items())}, ensure_ascii=False, indent=1))
    else:
        for k in sorted(gaps):
            print(f"{k}\t{', '.join(sorted(gaps[k]))[:90]}")
        print(f"— {len(gaps)} Lücke(n)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
