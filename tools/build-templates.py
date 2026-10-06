#!/usr/bin/env python3
"""Legt Casoras eigene Kartenvorlagen über das Vorlagen-Paket des Panels.

    python3 tools/build-templates.py

Quelle: dashboards/casora/button_card_templates.json – Casoras Karten (Drucker,
Aquarium, Auto, Wäsche …) und die angepassten, deutschen Fassungen der
Casora-Vorlagen. Gleichnamige Vorlagen im Paket werden ersetzt, neue ergänzt.
Mehrfach ausführen ist unschädlich. Ohne diesen Schritt bekämen neue und
importierte Dashboards nur die englischen Original-Vorlagen – Casora-Kacheln
wären dort kaputt.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dashboards/casora/button_card_templates.json")
OUT = os.path.join(ROOT, "custom_components/casora/panel/casora-templates.json")

overlay = json.load(open(SRC, encoding="utf-8"))

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from template_checks import fixed_ids  # noqa: E402
from phone_room_badges import derive as derive_phone_room  # noqa: E402

# Raumseite am Handy = Raum-Kopf am Desktop: casora_mobile_sensor_chips folgt casora_room
# (tools/phone_room_badges.py) – auch in der Quelle, damit beide nie auseinanderlaufen.
if derive_phone_room(overlay):
    with open(SRC, "w", encoding="utf-8") as fh:
        json.dump(overlay, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("casora_mobile_sensor_chips aus casora_room nachgezogen")

bundle = json.load(open(OUT, encoding="utf-8"))
personal = fixed_ids(overlay) + fixed_ids({k: v for k, v in bundle["templates"].items() if k not in overlay})
if personal:
    raise SystemExit("Feste Entitäten in Vorlagen (auf null/[] setzen oder über den Finder lösen):\n  "
                     + "\n  ".join(personal))
tpl = bundle["templates"]
# Aus Casora entfernt (Plex 27.09.2026, Altlasten 01.10.2026) – auch aus dem Paket nehmen.
REMOVED = ("casora_badge_plex", "casora_plex_recently_added", "casora_popup_plex", "casora_popup_recently_added",
           # Altlasten (01.10.2026): Kontakt (alt) → casora_popup_contacts; Aquarien-Übersicht und
           # Aquarium-Licht → casora_popup_aquarium_tank (die Kacheln casora_aquarium/_light leiten um);
           # Saugroboter/Geschirrspüler (alt, ohne Kachel) → _casoraVac in casora_vacuum, casora_popup_dishwasher.
           "casora_popup_contact", "casora_popup_aquarium", "casora_popup_aquarium_light",
           "casora_popup_vacuum", "casora_popup_geschirrspueler")
for name in REMOVED:
    tpl.pop(name, None)
added = [k for k in overlay if k not in tpl]
changed = [k for k in overlay if k in tpl and tpl[k] != overlay[k]]
tpl.update(overlay)
tmp = OUT + ".tmp"
with open(tmp, "w", encoding="utf-8") as fh:
    json.dump(bundle, fh, ensure_ascii=False, separators=(",", ":"))
os.replace(tmp, OUT)
print(f"{len(tpl)} Vorlagen: {len(added)} neu, {len(changed)} ersetzt")


# Namensliste für die Umstellung Hemma → Casora (Import, Dienst casora.umstellen,.
# Übergangsschicht): welche Entitäten Casora gehören und deshalb mit umbenannt
# werden. Alles andere mit „hemma“ im Namen (eigene Pakete) bleibt unangetastet.
import re as _re
pkg = open(os.path.join(ROOT, "custom_components/casora/helfer.yaml"), encoding="utf-8").read()
eigene = sorted(set(_re.findall(r"^  (casora_\w+):", pkg, _re.M)))
ki = open(os.path.join(ROOT, "custom_components/casora/ki.py"), encoding="utf-8").read()
eigene += sorted(set(_re.findall(r'"object": "(casora_\w+)"', ki)))
ziel = os.path.join(ROOT, "custom_components/casora/panel/umbenennung.json")
with open(ziel, "w", encoding="utf-8") as fh:
    json.dump({"eigene": eigene, "praefixe": ["casora_motion_"]}, fh, ensure_ascii=False, indent=1)
print(f"umbenennung.json: {len(eigene)} eigene Entitäten")
