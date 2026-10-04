"""settings.read_umzug_phones ohne HA: Handy-Layouts aus den Umzugs-Sicherungen lesen.

  uv run --python 3.14 --with homeassistant python dev/unit/umzug_sicherung_test.py

Das Studio holt daraus einmalig die Kachelgrößen am Handy für Dashboards, die vor 1.0.3
umgezogen sind. Prüft: je Quelle die neueste Sicherung, nur mit Handy-Layout, ohne
button_card_templates, Filter nach Quelle, kaputte Dateien und fremde Dateien werden übersprungen.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora.settings import read_umzug_phones  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


mobile = {"button_card_templates": {"hemma_x": {"variables": {"size": "small"}}},
          "views": [{"path": "home", "cards": [{"type": "custom:button-card", "variables": {"size": "large"}}]}]}
with tempfile.TemporaryDirectory() as folder:
    def put(name, data):
        with open(os.path.join(folder, name), "w", encoding="utf-8") as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))

    put("umzug_2026-10-03_101500_dashboard-hemma.json", {"url_path": "dashboard-hemma", "title": "Alt", "config": {}, "mobile": mobile})
    put("umzug_2026-10-03_120000_dashboard-hemma.json", {"url_path": "dashboard-hemma", "title": "Neu", "config": {}, "mobile": mobile})
    put("umzug_2026-10-02_090000_ohne-handy.json", {"url_path": "ohne-handy", "config": {}, "mobile": None})
    put("umzug_2026-10-01_090000_kaputt.json", "{nicht json")
    put("umstellen_2026-10-01_090000.json", {"url_path": "x", "mobile": mobile})
    put("umzug_2026-09-30_080000_zweites.json", {"url_path": "zweites", "config": {}, "mobile": mobile})

    out = read_umzug_phones(folder)
    check("je Quelle eine, nur mit Handy " + repr([b["url_path"] for b in out]),
          [b["url_path"] for b in out] == ["dashboard-hemma", "zweites"])
    check("die neueste", out[0]["title"] == "Neu" and out[0]["time"] == "2026-10-03_120000")
    check("ohne button_card_templates", "button_card_templates" not in out[0]["mobile"] and out[0]["mobile"]["views"])
    check("Filter nach Quelle", [b["url_path"] for b in read_umzug_phones(folder, ["zweites"])] == ["zweites"])
    check("Grenze", len(read_umzug_phones(folder, None, 1)) == 1)
check("fehlender Ordner: leer", read_umzug_phones("/nicht/vorhanden") == [])

sys.exit(1 if fails else 0)
