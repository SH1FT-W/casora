"""Umzug-Fertigbildschirm „N Raumfotos übernommen“: zählt nur Fotos, die das neue Dashboard nutzt.

  uv run --python 3.14 --with homeassistant python dev/unit/umzug_raumfotos_zahl_test.py

Umzug-Prüfung 10.10.2026 (umzug-07): Haus mit 5 Räumen, aber 13 Tagesfotos in www/hemma/rooms
→ „13 Raumfotos übernommen“. Gezählt wurden alle Dateien im Ordner statt der Räume.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import hemma_cleanup as H  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


files = []
for n in ["kuche", "bad", "flur", "buro", "hwr", "alt1", "alt2", "alt3", "alt4", "alt5", "alt6", "alt7", "alt8"]:
    files += [f"rooms/{n}.jpg", f"rooms/{n}-night.jpg"]
files += ["icons/x.svg"]
rooms = [{"title": t, "path": t, "variables": {"image": t, "image_night": t + "-night"}}
         for t in ["kuche", "bad", "flur", "buro", "hwr"]]
desk = {"views": [{"title": "Home", "variables": {"image": "home-demo"}}] + rooms}
mob = {"views": [{"cards": [{"variables": {"image": "kuche"}}]}]}

check("13 Tagfotos ohne Dashboard: 13", H.room_photo_count(files, []) == 13, H.room_photo_count(files, []))
n = H.room_photo_count(files, [desk, mob])
check("5 Räume mit Foto im Dashboard: 5", n == 5, n)
check("Nachtfotos zählen nicht extra", H.room_photo_count(["rooms/a.jpg", "rooms/a-night.jpg"],
                                                           [{"variables": {"image": "a"}}]) == 1)
check("Demo-Foto (nicht kopiert) zählt nicht", H.room_photo_count(files, [{"variables": {"image": "home-demo"}}]) == 0)

print("PASS" if not fails else f"FAIL ({fails})")
sys.exit(1 if fails else 0)
