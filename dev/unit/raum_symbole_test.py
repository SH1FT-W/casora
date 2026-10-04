"""room_icons.py ohne laufendes HA: eigene Raum-Symbole prüfen, bereinigen, ablegen, löschen.

  uv run --python 3.14 --with homeassistant python dev/unit/raum_symbole_test.py

Prüft: unsichere SVG-Teile fallen weg (script, foreignObject, style, on*-Attribute,
externe href/url(), javascript:), Entitäten werden abgelehnt, die Zeichnung bleibt
erhalten; PNG nur mit Transparenz; Größenlimit; sichere, eindeutige Dateinamen;
Löschen nur bekannter Namen (kein Pfad hinaus).
"""

from __future__ import annotations

import os
import struct
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import room_icons as ri  # noqa: E402

FAILS: list[str] = []


def check(cond: bool, what: str) -> None:
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        FAILS.append(what)


def raises(fn, *args) -> bool:
    try:
        fn(*args)
    except ri.IconError:
        return True
    return False


def png(color_type: int, trns: bool = False, side: int = 4) -> bytes:
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    ihdr = struct.pack(">IIBBBBB", side, side, 8, color_type, 0, 0, 0)
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
    if trns:
        out += chunk(b"tRNS", b"\x00\x00\x00\x00\x00\x00")
    return out + chunk(b"IDAT", zlib.compress(b"\x00" * 16)) + chunk(b"IEND", b"")


EVIL = b"""<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 24 24" onload="alert(1)">
  <script>alert(2)</script>
  <style>@import url(https://evil.example/x.css);</style>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
  <image href="https://evil.example/track.png" width="1" height="1"/>
  <a href="javascript:alert(3)"><path d="M0 0h1v1z"/></a>
  <defs><mask id="m"><rect width="24" height="24" fill="white"/></mask></defs>
  <g mask="url(#m)" style="fill:white;background:url(https://evil.example/y)">
    <path d="M2 2h20v20H2z" fill="url(https://evil.example/z)" onclick="alert(4)"/>
    <circle cx="12" cy="12" r="4" fill-opacity="0.5"/>
  </g>
  <use xlink:href="https://evil.example/s.svg#a"/>
  <use xlink:href="#m"/>
</svg>"""

clean = ri.sanitize_svg(EVIL).decode()
low = clean.lower()
for bad in ("script", "alert", "foreignobject", "<style", "evil.example", "javascript", "onload",
            "onclick", "<image", "<a ", "<!doctype"):
    check(bad not in low, f"SVG bereinigt: kein {bad!r}")
check('d="M2 2h20v20H2z"' in clean, "SVG: Zeichnung bleibt")
check('mask="url(#m)"' in clean, "SVG: interne Maske bleibt")
check('href="#m"' in clean, "SVG: interner Verweis bleibt (als href)")
check("fill:white" in clean, "SVG: harmloses style bleibt")
check('viewBox="0 0 24 24"' in clean, "SVG: viewBox bleibt")
check(clean.count("<svg") == 1 and 'xmlns="http://www.w3.org/2000/svg"' in clean, "SVG: ein Wurzel-svg mit Namensraum")

check(raises(ri.sanitize_svg, b'<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'),
      "SVG mit Entitäten abgelehnt")
check(raises(ri.sanitize_svg, b"<html><body/></html>"), "Kein SVG abgelehnt")
check(raises(ri.sanitize_svg, b"<svg xmlns='http://www.w3.org/2000/svg'><script>x</script></svg>"),
      "SVG ohne Zeichnung abgelehnt")
check(raises(ri.sanitize_svg, b"<svg"), "Kaputtes SVG abgelehnt")

check(not raises(ri.check_png, png(6)), "PNG RGBA angenommen")
check(not raises(ri.check_png, png(2, trns=True)), "PNG mit tRNS angenommen")
check(raises(ri.check_png, png(2)), "PNG ohne Transparenz abgelehnt")
check(raises(ri.check_png, png(6, side=4000)), "Riesiges PNG abgelehnt")
check(raises(ri.check_png, b"GIF89a" + b"\x00" * 40), "Kein PNG abgelehnt")

with tempfile.TemporaryDirectory() as tmp:
    d = os.path.join(tmp, "www", "casora", "icons", "eigene")
    a = ri.store(d, "Mein Sofa (neu).svg", EVIL)
    check(a["file"] == "mein-sofa-neu.svg", "Sicherer Dateiname: " + a["file"])
    check(a["url"] == "/local/casora/icons/eigene/mein-sofa-neu.svg", "URL unter /local/casora/icons/eigene")
    with open(os.path.join(d, a["file"]), encoding="utf-8") as fh:
        check("script" not in fh.read().lower(), "Abgelegte Datei ist die bereinigte")
    b = ri.store(d, "mein-sofa-neu.png", png(6))
    check(b["file"] == "mein-sofa-neu-2.png", "Gleicher Name überschreibt nicht: " + b["file"])
    c = ri.store(d, "../../../Küche.svg", EVIL)
    check(c["file"] == "kueche.svg" and os.path.isfile(os.path.join(d, "kueche.svg")), "Pfad im Namen bleibt im Ordner")
    check(raises(ri.store, d, "x.gif", b"GIF"), "Falsche Endung abgelehnt")
    check(raises(ri.store, d, "x.svg", b"<svg/>" + b" " * (ri.MAX_BYTES + 1)), "Zu groß abgelehnt")
    check(raises(ri.store, d, "x.svg", b""), "Leer abgelehnt")
    names = [i["file"] for i in ri.listing(d)]
    check(names == ["kueche.svg", "mein-sofa-neu-2.png", "mein-sofa-neu.svg"], "Liste: " + ", ".join(names))
    open(os.path.join(d, "fremd.txt"), "w").close()
    check(len(ri.listing(d)) == 3, "Fremde Dateien nicht gelistet")
    check(raises(ri.remove, d, "../fremd.txt"), "Löschen mit Pfad abgelehnt")
    check(raises(ri.remove, d, "fremd.txt"), "Löschen fremder Datei abgelehnt")
    check(ri.remove(d, "kueche.svg") and not os.path.exists(os.path.join(d, "kueche.svg")), "Löschen klappt")
    check(ri.remove(d, "kueche.svg") is False, "Doppelt löschen: nichts passiert")
    check(ri.listing(os.path.join(tmp, "fehlt")) == [], "Ohne Ordner: leere Liste")

print()
print(f"{len(FAILS)} Fehler" if FAILS else "alles grün")
sys.exit(1 if FAILS else 0)
