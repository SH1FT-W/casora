"""Kamerabilder der Testhaus-Kameras (dev/casora_mock/kamerabild.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant --with pillow python dev/unit/kamerabild_test.py

1. Stimmung nach sun.sun: über dem Horizont Tag; knapp darunter, 1 h vor Aufgang bzw. nach Untergang
   Dämmerung; sonst Nacht. Ohne sun.sun nach Sonnenstand (Astral) bzw. Uhrzeit; der Testdienst legt sie fest.
2. Jedes Bild gibt es je Stimmung (JPG); Pillow setzt Größe, Rahmen und Zeitstempel; ohne Datei None.
"""

from __future__ import annotations

import io
import os
import sys
from datetime import timedelta
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "dev"))

from homeassistant.util import dt as dt_util  # noqa: E402

from casora_mock import kamerabild as K  # noqa: E402

now = dt_util.utcnow()


def hass_mit(state=None, **attrs):
    st = SimpleNamespace(state=state, attributes=attrs) if state else None
    return SimpleNamespace(states=SimpleNamespace(get=lambda eid: st if eid == "sun.sun" else None))


iso = lambda d: (now + d).isoformat()  # noqa: E731
far = timedelta(hours=8)
assert K.stimmung(hass_mit("above_horizon", elevation=20)) == "tag"
assert K.stimmung(hass_mit("below_horizon", elevation=-3, next_rising=iso(far), next_setting=iso(far))) == "daemmerung"
assert K.stimmung(hass_mit("below_horizon", elevation=-12, next_rising=iso(timedelta(minutes=40)), next_setting=iso(far))) == "daemmerung", "1 h vor Aufgang"
assert K.stimmung(hass_mit("below_horizon", elevation=-12, next_rising=iso(far),
                           next_setting=iso(timedelta(days=1, minutes=-30)))) == "daemmerung", "bis 1 h nach Untergang"
assert K.stimmung(hass_mit("below_horizon", elevation=-40, next_rising=iso(far), next_setting=iso(timedelta(hours=20)))) == "nacht"
assert K._aus_hoehe(10) == "tag" and K._aus_hoehe(-5) == "daemmerung" and K._aus_hoehe(-20) == "nacht"
# Früherer Zeitpunkt ohne Standort: Rückfall auf die Uhrzeit (liefert immer eine der drei Stimmungen).
assert K.stimmung(hass_mit(), now - timedelta(hours=30)) in K.STIMMUNGEN
K._FEST["stimmung"] = "nacht"
assert K.stimmung(hass_mit("above_horizon", elevation=30)) == "nacht", "Testdienst legt fest"
K._FEST["stimmung"] = None

from PIL import Image  # noqa: E402

for st in K.STIMMUNGEN:
    for szene, name, w, h in (("hof", "hof", 1280, 720), ("hof", "hof_person", 1280, 720), ("hof", "hof_cat", 1280, 720),
                              ("tuer", "tuer", 1280, 960), ("tuer", "tuer_person", 1280, 960)):
        raw = K._roh(st, name)
        assert raw and raw[:2] == b"\xff\xd8", f"{st}/{name}.jpg fehlt"
        assert Image.open(io.BytesIO(raw)).size == (w, h), f"{st}/{name}: Größe"
    for label in ("car", "person", "cat"):
        assert K._rahmen()[st]["hof"][label], f"Rahmen {st}/{label}"
    klein = K.bild(st, "hof", "hof_person", 320, 180, "16.10.2026 12:00:00", "person", seed=5)
    assert Image.open(io.BytesIO(klein)).size == (320, 180)
    assert K.bild(st, "hof", "gibtsnicht", 320, 180) is None, "ohne Datei → Platzhalter"
print("ok kamerabild_test")
