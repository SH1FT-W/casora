"""A translation copied unchanged from English or German is reported (tools/i18ncheck.py).

    python3 dev/unit/i18n_same_text_test.py

Builds small translation tables in a temp folder and runs check_language for "nl" on them: a
copied sentence of 3 or more words is flagged in each group (dashboard phrases, Studio, dashboard
keys, Home Assistant setup), a 2-word copy is not, an allowlisted name is not, and HA's own
[%key:…%] references are not. Then runs the same check on the real tables: no copied text is left.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import i18ncheck  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def write(root, rel, data):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)


def same_text_hits(errors):
    return [e for e in errors if "same as the" in e]


tmp = tempfile.mkdtemp(prefix="i18n-same-text-")
TR = os.path.join(tmp, "translations")
SRC = os.path.join(TR, "dashboard")

# Dashboard phrases: keys are German, values English (en) or the translation.
write(SRC, "phrases/de.json", {"exact": {}, "patterns": []})
write(SRC, "phrases/en.json", {"exact": {
    "Fenster offen lassen?": "Leave window open?",
    "Zwei Wörter": "Two words",
    "Bosch Smart System": "Bosch Smart System",
    "Mehr Licht an": "Turn more light on",
    "Heizung läuft weiter": "Heating keeps running",
}, "patterns": [["^(\\d+) Türen offen$", "{1} doors and windows open"]]})
write(SRC, "phrases/nl.json", {"exact": {
    "Fenster offen lassen?": "Raam open laten?",
    "Zwei Wörter": "Two words",
    "Bosch Smart System": "Bosch Smart System",
    "Mehr Licht an": "Turn more light on",
    "Heizung läuft weiter": "Heizung läuft weiter",
}, "patterns": [["^(\\d+) Türen offen$", "{1} doors and windows open"]]})

# Studio: keys are English, the German table gives the translation.
write(TR, "panel/de.json", {"exact": {
    "Turn more light on": "Mehr Licht an",
    "Bosch Smart System": "Bosch Smart System",
}, "patterns": [["^(\\d+) Doors and windows open$", "{1} Türen und Fenster offen"]]})
write(TR, "panel/en.json", {"exact": {}})
write(TR, "panel/nl.json", {"exact": {
    "Turn more light on": "Turn more light on",
    "Bosch Smart System": "Bosch Smart System",
}, "patterns": [["^(\\d+) Doors and windows open$", "{1} Doors and windows open"]]})

# Dashboard keys (flat) and Home Assistant setup (flat, with an HA reference).
write(SRC, "en.json", {"ui.leave": "Leave the house now", "ui.two": "Two words", "ui.state": "[%key:common::state::on%]"})
write(SRC, "de.json", {"ui.leave": "Haus jetzt verlassen", "ui.two": "Zwei Wörter", "ui.state": "[%key:common::state::on%]"})
write(SRC, "nl.json", {"ui.leave": "Leave the house now", "ui.two": "Two words", "ui.state": "[%key:common::state::on%]"})
write(TR, "en.json", {"setup.step": "Enter the access key now"})
write(TR, "de.json", {"setup.step": "Zugangsschlüssel jetzt eingeben"})
write(TR, "nl.json", {"setup.step": "Enter the access key now"})

i18ncheck.SRC = SRC
i18ncheck.TR = TR

errors: list[str] = []
i18ncheck.check_language("nl", errors)
hits = same_text_hits(errors)


def flagged(value):
    return any(value in e for e in hits)


check("phrases: copied English sentence flagged",
      flagged("Turn more light on") and any(e.startswith("phrases/nl.json") and "Turn more light on" in e for e in hits), hits)
check("phrases: copied German sentence flagged (same as the German text)",
      any("Heizung läuft weiter" in e and "German text" in e for e in hits), hits)
check("phrases: pattern replacement copied from English flagged",
      any(e.startswith("phrases/nl.json") and "{1} doors and windows open" in e for e in hits), hits)
check("phrases: 2-word copy not flagged", not flagged("Two words"), hits)
check("phrases: allowlisted name not flagged", not flagged("Bosch Smart System"), hits)
check("phrases: translated text not flagged", not flagged("Raam open laten?"), hits)
check("studio: copied English exact entry flagged",
      any(e.startswith("panel/nl.json") and "Turn more light on" in e for e in hits), hits)
check("studio: allowlisted name not flagged", not any(e.startswith("panel/nl.json") and "Bosch" in e for e in hits), hits)
check("studio: copied English pattern (rendered with {1}) flagged",
      any(e.startswith("panel/nl.json") and "{1} Doors and windows open" in e for e in hits), hits)
check("dashboard keys: copied English sentence flagged",
      any(e.startswith("dashboard/nl.json") and "Leave the house now" in e for e in hits), hits)
check("dashboard keys: 2-word copy not flagged", not any("Two words" in e for e in hits if e.startswith("dashboard/")), hits)
check("home assistant setup: copied English sentence flagged",
      any(e.startswith("translations/nl.json") and "Enter the access key now" in e for e in hits), hits)
check("home assistant setup: [%key:…%] reference not flagged", not any("[%key:" in e for e in hits), hits)
# The real tables: no English or German sentence copied into a further language.
i18ncheck.SRC = os.path.join(i18ncheck.ROOT, "custom_components/casora/translations/dashboard")
i18ncheck.TR = os.path.dirname(i18ncheck.SRC)
real = []
for lang in i18ncheck.languages():
    part = []
    i18ncheck.check_language(lang, part)
    real += same_text_hits(part)
check("real tables: no copied text left", not real, "\n".join(real))

if fails:
    print("\n".join("FAIL " + f for f in fails))
    sys.exit(1)
print("i18n_same_text_test: ok")
