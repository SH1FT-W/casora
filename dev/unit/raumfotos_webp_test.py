"""WebP-Fassungen der Raumfotos (assets.webp_variant) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/raumfotos_webp_test.py

Prüft: WebP entsteht (Desktop gleiche Größe, Handy höchstens PHONE_EDGE breit), zweiter Abruf
nutzt die abgelegte Datei, ein ersetztes Foto bekommt eine neue Fassung und die alte fliegt
raus, das Original bleibt unverändert, ein kaputtes Bild liefert None (dann gilt das Original).
"""

from __future__ import annotations

import os
import random
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from PIL import Image  # noqa: E402

from custom_components.casora import assets as A  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


def photo(path, size=(1672, 941), seed=1):
    # Rauschen statt Einfarbig, damit JPEG nicht schon winzig ist.
    rnd = random.Random(seed)
    img = Image.new("RGB", size)
    img.putdata([(rnd.randrange(256), rnd.randrange(256), 120) for _ in range(size[0] * size[1])])
    img.save(path, "JPEG", quality=85)


with tempfile.TemporaryDirectory() as d:
    src, cache = os.path.join(d, "wohnen.jpg"), os.path.join(d, "cache")
    photo(src)
    before = open(src, "rb").read()
    desk = A.webp_variant(src, cache, False)
    phone = A.webp_variant(src, cache, True)
    check("Desktop-Fassung entsteht", desk is not None and desk.endswith(".webp"), desk)
    check("Handy-Fassung entsteht", phone is not None and phone != desk, phone)
    with Image.open(desk) as im:
        check("Desktop gleiche Größe", im.size == (1672, 941), im.size)
        check("Desktop ist WebP", im.format == "WEBP", im.format)
    with Image.open(phone) as im:
        check("Handy höchstens PHONE_EDGE breit", im.size[0] == A.PHONE_EDGE, im.size)
    check("WebP kleiner als Original", os.path.getsize(desk) < len(before))
    m = os.path.getmtime(desk)
    check("zweiter Abruf nutzt die Datei", A.webp_variant(src, cache, False) == desk and os.path.getmtime(desk) == m)
    time.sleep(0.01)
    photo(src, seed=2)
    desk2 = A.webp_variant(src, cache, False)
    check("ersetztes Foto: neue Fassung", desk2 is not None and desk2 != desk, desk2)
    check("alte Fassung entfernt", not os.path.exists(desk))
    check("Handy-Fassung des alten Fotos bleibt bis zum Handy-Abruf", os.path.exists(phone))
    check("Original unverändert (nur Inhalt von photo())", open(src, "rb").read()[:3] == b"\xff\xd8\xff")
    bad = os.path.join(d, "kaputt.jpg")
    with open(bad, "wb") as h:
        h.write(b"\xff\xd8\xffkein bild")
    check("kaputtes Bild -> None", A.webp_variant(bad, cache, False) is None)
    marks = [f for f in os.listdir(cache) if os.path.getsize(os.path.join(cache, f)) == 0]
    check("kaputtes Bild: Fehlschlag gemerkt (leere Datei)", len(marks) == 1, marks)
    opened = []
    real_open = Image.open
    Image.open = lambda *a, **k: opened.append(a) or real_open(*a, **k)
    try:
        check("zweiter Abruf: None ohne neuen Versuch", A.webp_variant(bad, cache, False) is None and not opened, opened)
    finally:
        Image.open = real_open
    check("fehlende Datei -> None", A.webp_variant(os.path.join(d, "fehlt.jpg"), cache, False) is None)

print("FEHLER:", fails) if fails else print("alle ok")
sys.exit(1 if fails else 0)
