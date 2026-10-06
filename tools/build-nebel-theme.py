#!/usr/bin/env python3
"""Baut custom_components/casora/theme_nebel.yaml – „Casora Nebel“.

Nebel ist Casora (Weich) in kühl: gleicher Aufbau, aber kühles Hellgrau mit leichtem
Blaustich statt Leinen/Sand und Petrol-Blau statt Ton als Akzent. Die Datei enthält
nur, was sich gegenüber theme_weich.yaml ändert; helfer.py legt sie beim Laden über
das fertige Casora-Theme (casora-theme-base). Ändert sich Weich, hier neu bauen:

    python3 tools/build-nebel-theme.py          # schreibt die Datei
    python3 tools/build-nebel-theme.py --check  # nur prüfen, ob sie aktuell ist

Umgefärbt werden nur warme Töne (Farbton 10–50°): gedämpfte (Leinen, Sand, Braungrau,
warme Schatten) werden kühles Grau, kräftigere (Ton/Terrakotta) werden Petrol.
Signalfarben (Licht gelb, Heizung orange, Alarm rot …) sind kräftiger und bleiben.
"""
import colorsys
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CC = os.path.join(ROOT, "custom_components/casora")
SRC = os.path.join(CC, "theme_weich.yaml")
OUT = os.path.join(CC, "theme_nebel.yaml")
NAME, BASE = "Casora Nebel", "Casora"

NEUTRAL_HUE, NEUTRAL_SAT = 212, 0.55   # Grau mit Blaustich: Sättigung × 0,55
ACCENT_HUE, ACCENT_SAT = 205, 0.42     # Petrol

# Licht-Popup: Helligkeitsregler und Farbtemperatur-Punkte zeigen das Licht selbst –
# die bleiben warm wie in Weich (auch wenn ihre hellen Gelbtöne als „gedämpft“ gelten).
KEEP = {"casora-lps-fill", "casora-lps-fill-ink", "casora-lps-dot-warm", "casora-lps-dot-neutral",
        "casora-lps-ring-halo", "casora-lps-ring-shadow", "casora-soft-slider-ink",
        "state-light-on-color", "casora-temp-gradient"}

# Von Hand: Akzent sichtbar machen (aktive Navigation, eingeschaltete Kacheln, Schalter,
# Hauptknöpfe) und etwas straffere Ecken. Alles andere folgt der Umfärbung.
PETROL = "#3F7491"
FIX = {
    "top": {
        "primary-color": PETROL,
        "casora-color-neutral": "#B9C2CB",
        "ha-card-border-radius": "26px",
        "casora-tile-radius-phone": "24px",
        "casora-scene-tile-radius": "24px",
        "casora-hero-title-weight": 700,
        "hero-title-letter-spacing-desktop": "-2px",
        "casora-np-progress": f"var(--casora-soft-media-play, {PETROL})",
    },
    "light": {
        "casora-ton-ink": "#2F6584",
        "casora-lps-switch-on": PETROL,
        "casora-entity-state-active": "rgba(46,98,128,0.96)",
        "casora-entity-state-active-color": "rgba(46,98,128,0.96)",
        # Aktiver Raum (Raumleiste, Handy-Navbar) und gewählte Chips: Petrol-Hauch statt Grau
        "casora-nav-active-fill": "rgba(63,116,145,0.22)",
        "casora-mnav-pill-ink": "var(--casora-ton-ink)",
        "casora-mnav-press-fill": "rgba(63,116,145,0.24)",
        "casora-lps-chip-on": "rgba(63,116,145,0.16)",
        # Eingeschaltete Kacheln: kühles Weiß mit leichtem Petrol-Schein
        "button-card-box-shadow-active": "0 2px 4px rgba(40,60,80,0.06), 0 18px 40px -14px rgba(46,98,128,0.38)",
        "button-card-box-shadow-active-mobile": "0 10px 24px -12px rgba(46,98,128,0.36)",
        "casora-soft-media-play-shadow": "0 14px 30px -12px rgba(46,98,128,0.50)",
    },
    "dark": {
        "primary-color": "#5E97B8",
        "casora-ton-ink": "#8DBAD3",
        "casora-lps-switch-on": "#4E89AA",
        "casora-entity-state-active": "rgba(36,86,114,0.96)",
        "casora-entity-state-active-color": "rgba(36,86,114,0.96)",
        "casora-nav-active-fill": "rgba(94,151,184,0.32)",
        "casora-mnav-pill-ink": "var(--casora-ton-ink)",
        "casora-mnav-press-fill": "rgba(94,151,184,0.36)",
        "casora-lps-chip-on": "rgba(94,151,184,0.28)",
    },
}

COL = re.compile(r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b"
                 r"|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)")


def conv(r, g, b):
    chroma = max(r, g, b) - min(r, g, b)
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if chroma == 0 or not 10 <= h * 360 <= 50:
        return None
    if chroma < 60:          # Leinen, Sand, Braungrau, warme Schatten
        h2, s2 = NEUTRAL_HUE / 360, min(1, s * NEUTRAL_SAT)
    elif chroma <= 110:      # Ton/Terrakotta
        h2, s2 = ACCENT_HUE / 360, ACCENT_SAT
    else:                    # Signalfarbe
        return None
    rr, gg, bb = colorsys.hls_to_rgb(h2, l, s2)
    return round(rr * 255), round(gg * 255), round(bb * 255)


def recolor(val):
    if not isinstance(val, str):
        return val

    def sub(m):
        if m.group(1):
            hx = m.group(1)
            if len(hx) == 3:
                hx = "".join(c * 2 for c in hx)
            n = conv(int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16))
            return m.group(0) if not n else "#%02X%02X%02X%s" % (*n, hx[6:8].upper())
        n = conv(int(m.group(2)), int(m.group(3)), int(m.group(4)))
        if not n:
            return m.group(0)
        if m.group(5):
            return f"rgba({n[0]},{n[1]},{n[2]},{m.group(5)})"
        return f"rgb({n[0]},{n[1]},{n[2]})"

    return COL.sub(sub, val)


def build():
    weich = yaml.safe_load(open(SRC, encoding="utf-8"))[BASE]
    sects = {"top": {k: v for k, v in weich.items() if k != "modes"}}
    sects.update(weich.get("modes", {}))
    out = {}
    for sect, vals in sects.items():
        res = {}
        for k, v in vals.items():
            nv = v if k in KEEP else recolor(v)
            if nv != v:
                res[k] = nv
        for k, v in FIX.get(sect, {}).items():
            if vals.get(k) != v:
                res[k] = v
        out[sect] = res
    doc = {"casora-theme-base": BASE}
    doc.update(out.pop("top"))
    doc["modes"] = {m: v for m, v in out.items() if v}
    head = ("# Casora Nebel – erzeugt von tools/build-nebel-theme.py, nicht von Hand bearbeiten.\n"
            "# Kühles Hellgrau mit Blaustich, Petrol als Akzent. Nur die Abweichungen von Casora\n"
            "# (theme_weich.yaml); helfer.py legt sie beim Laden über das fertige Casora-Theme.\n")
    return head + yaml.safe_dump({NAME: doc}, allow_unicode=True, sort_keys=False, width=1000)


def main():
    body = build()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != body:
            print("theme_nebel.yaml ist nicht aktuell: python3 tools/build-nebel-theme.py")
            sys.exit(1)
        print("theme_nebel.yaml aktuell")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"{OUT}: {body.count(chr(10))} Zeilen")


if __name__ == "__main__":
    main()
