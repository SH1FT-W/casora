"""Raumfotos (images.py) ohne laufendes HA: Bildart, Ablage als JPEG, Namen.

  uv run --python 3.14 --with homeassistant python dev/unit/raumfotos_test.py

Prüft: Bildart am Inhalt (Endung egal), PNG/WebP landen als <name>.jpg (das Dashboard lädt
nur .jpg), große Fotos werden auf 2560 px verkleinert, ältere Endung fliegt raus, ein Nachtfoto
für einen neuen Namen wird auch Tagbild, HEIC ohne pillow-heif gibt Code „heic“, keine
Bilddatei Code „type“, Namen mit Umlaut/Leerzeichen werden zum Dateinamen.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from PIL import Image  # noqa: E402

from custom_components.casora import images as I  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


def img(fmt, size=(800, 600), mode="RGB"):
    out = io.BytesIO()
    Image.new(mode, size, (10, 120, 200) if mode == "RGB" else (10, 120, 200, 128)).save(out, fmt)
    return out.getvalue()


jpg, png, webp = img("JPEG"), img("PNG", mode="RGBA"), img("WEBP")
heic = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + b"\x00" * 64

check("JPEG erkannt", I.sniff(jpg) == "jpeg")
check("PNG erkannt", I.sniff(png) == "png")
check("WebP erkannt", I.sniff(webp) == "webp")
check("HEIC erkannt", I.sniff(heic) == "heic")
check("Text ist kein Bild", I.sniff(b"hello world") is None)

check("Name mit Umlaut/Leerzeichen", I.clean_name(" Wohn Zimmer Küche ") == "wohn-zimmer-kueche", I.clean_name(" Wohn Zimmer Küche "))
check("Name mit Akzent", I.clean_name("Café") == "cafe")

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, "wohnen.png"), "wb") as h:
        h.write(png)
    w = I.store(d, "wohnen", png, False)
    check("PNG als .jpg abgelegt", [os.path.basename(x) for x in w] == ["wohnen.jpg"], w)
    check("ältere .png entfernt", not os.path.exists(os.path.join(d, "wohnen.png")))
    with open(w[0], "rb") as h:
        check("Inhalt ist JPEG", I.sniff(h.read()) == "jpeg")

    big = img("JPEG", size=(6000, 4000))
    I.store(d, "gross", big, False)
    with Image.open(os.path.join(d, "gross.jpg")) as g:
        check("großes Foto auf 2560 px verkleinert", max(g.size) == 2560, g.size)

    w = I.store(d, "nacht", webp, True)
    names = sorted(os.path.basename(x) for x in w)
    check("Nachtfoto für neuen Namen auch als Tagbild", names == ["nacht-night.jpg", "nacht.jpg"], names)
    w = I.store(d, "nacht", jpg, True)
    check("weiteres Nachtfoto ersetzt nur die Nacht", [os.path.basename(x) for x in w] == ["nacht-night.jpg"], w)

    listed = {i["name"]: i for i in I._scan(d)}
    check("Liste mit ?v= (Cache)", "?v=" in (listed.get("wohnen") or {}).get("day", ""), listed.get("wohnen"))
    check("Liste hat Tag und Nacht", bool(listed.get("nacht", {}).get("night")))

    try:
        import pillow_heif  # noqa: F401
        has_heif = True
    except ImportError:
        has_heif = False
    if not has_heif:
        try:
            I.store(d, "iphone", heic, False)
            check("HEIC ohne pillow-heif abgelehnt", False)
        except I.UploadError as err:
            check("HEIC ohne pillow-heif: Code heic", err.code == "heic", err.code)
    try:
        I.store(d, "text", b"hello world", False)
        check("Textdatei abgelehnt", False)
    except I.UploadError as err:
        check("Textdatei: Code type", err.code == "type", err.code)

print("FAIL" if fails else "PASS", "raumfotos_test")
sys.exit(1 if fails else 0)
