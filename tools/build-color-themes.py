#!/usr/bin/env python3
"""Builds the colour designs that are Casora in another colour world: theme_salbei.yaml („Casora Salbei“),
theme_marine.yaml („Casora Marine“), theme_daemmerung.yaml („Casora Dämmerung“) and theme_farbe.yaml („Casora Farbe“).

Like Casora Nebel (tools/build-nebel-theme.py, whose colour reader this uses) each file holds only what differs from
theme_weich.yaml; theme.py lays it over the finished Casora design (casora-theme-base). When Casora changes, rebuild:

    python3 tools/build-color-themes.py          # writes the files
    python3 tools/build-color-themes.py --check  # only checks that they are current

Recoloured are the warm tones of Casora (hue 10–50°): the muted ones (linen, sand, brown-grey, warm shadows) take
the design's neutral, the stronger ones (clay) its accent. Signal colours (light yellow, heating orange, alarm red …)
are stronger still and stay. Unlike Nebel the neutral keeps much of its colour, so the design shows on every surface.
"""
import colorsys
import importlib.util
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CC = os.path.join(ROOT, "custom_components/casora")
spec = importlib.util.spec_from_file_location("nebel", os.path.join(ROOT, "tools/build-nebel-theme.py"))
nebel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nebel)
BASE = nebel.BASE


def rgba(hexc, a):
    n = int(hexc[1:], 16)
    return "rgba(%d,%d,%d,%s)" % (n >> 16 & 255, n >> 8 & 255, n & 255, a)


def fix(acc, ink, state, acc_dark, ink_dark, switch_dark, neutral):
    """The accent set by hand: active navigation, tiles that are on, switches, main buttons (as Nebel's FIX)."""
    return {
        "top": {"primary-color": acc, "casora-color-neutral": neutral,
                "casora-np-progress": f"var(--casora-soft-media-play, {acc})"},
        "light": {"casora-ton-ink": ink, "casora-lps-switch-on": acc,
                  "casora-entity-state-active": rgba(state, 0.96), "casora-entity-state-active-color": rgba(state, 0.96),
                  "casora-nav-active-fill": rgba(acc, 0.22), "casora-mnav-pill-ink": "var(--casora-ton-ink)",
                  "casora-mnav-press-fill": rgba(acc, 0.24), "casora-lps-chip-on": rgba(acc, 0.16),
                  "button-card-box-shadow-active": "0 2px 4px rgba(40,50,60,0.06), 0 18px 40px -14px " + rgba(state, 0.38),
                  "button-card-box-shadow-active-mobile": "0 10px 24px -12px " + rgba(state, 0.36),
                  "casora-soft-media-play-shadow": "0 14px 30px -12px " + rgba(state, 0.50)},
        "dark": {"primary-color": acc_dark, "casora-ton-ink": ink_dark, "casora-lps-switch-on": switch_dark,
                 "casora-entity-state-active": rgba(state, 0.96), "casora-entity-state-active-color": rgba(state, 0.96),
                 "casora-nav-active-fill": rgba(acc_dark, 0.32), "casora-mnav-pill-ink": "var(--casora-ton-ink)",
                 "casora-mnav-press-fill": rgba(acc_dark, 0.36), "casora-lps-chip-on": rgba(acc_dark, 0.28)},
    }


# neutral(l) → (hue°, saturation factor, lightness shift) for a muted warm tone of lightness l, or None to keep it.
# accent: (hue°, saturation) for the clay tones.
DESIGNS = [
    {"file": "theme_salbei.yaml", "name": "Casora Salbei",
     "what": "Salbeigrüne Flächen, Waldgrün als Akzent.",
     "neutral": lambda l: (112, 0.62, -0.035) if l > 0.5 else (140, 1.5, -0.012),
     "accent": (152, 0.34),
     "fix": fix("#3F7A5C", "#2F6549", "#2E6248", "#7FC29F", "#A8D8BE", "#4F9072", "#B7C6B4")},
    {"file": "theme_marine.yaml", "name": "Casora Marine",
     "what": "Warmer Sand mit Marineblau; dunkel Nachtblau mit Sandgold.",
     # The light tones stay Casora's sand; the dark ones (text by day, surfaces by night) turn navy.
     "neutral": lambda l: None if l > 0.5 else (222, 2.7, -0.012),
     "accent": (218, 0.49),
     "fix": fix("#2B4A7F", "#243F6E", "#1F3A6E", "#E8C27A", "#EFD49C", "#C9A45C", "#C9BFAE")},
    {"file": "theme_daemmerung.yaml", "name": "Casora Dämmerung",
     "what": "Graues Flieder mit Koralle als Akzent.",
     "neutral": lambda l: (258, 0.7, -0.02) if l > 0.5 else (256, 1.6, -0.01),
     "accent": (12, 0.64),
     "fix": fix("#D9694F", "#B4513A", "#A8482F", "#F08A6E", "#F6B19C", "#D9694F", "#C2BDD0")},
    {"file": "theme_farbe.yaml", "name": "Casora Farbe",
     "what": "Eingeschaltete Kacheln in der Farbe ihres Geräts, weicher Farbverlauf statt Leinen.",
     "neutral": lambda l: (16, 1.3, 0.0) if l > 0.5 else (300, 1.5, -0.012),
     "accent": (348, 0.60),
     "fix": fix("#D9506B", "#B03A55", "#A8344F", "#FF8FA3", "#FFC2CD", "#D9607A", "#D8C4C0"),
     # Tiles that are on take their device tone as the fill (the templates mix it in by this share), text on them white.
     "extra": {"top": {"casora-tile-tone-share": "100%", "casora-tile-tone-ink": "#FFFFFF", "casora-tile-tone-ink-2": "rgba(255,255,255,0.86)"},
               "light": {"hero-wash": "linear-gradient(90deg, rgba(255,222,196,0.80) 0%, rgba(255,190,180,0.40) 38%, rgba(230,180,225,0) 62%), "
                                      "linear-gradient(0deg, rgba(250,228,226,0.92) 0%, rgba(240,205,225,0.32) 34%, rgba(240,205,225,0) 55%)"},
               "dark": {"hero-wash": "linear-gradient(90deg, rgba(70,32,60,0.74) 0%, rgba(60,32,84,0.34) 38%, rgba(40,36,84,0) 62%), "
                                     "linear-gradient(0deg, rgba(36,24,44,0.92) 0%, rgba(40,28,60,0.32) 34%, rgba(40,28,60,0) 55%)"}}},
]


def conv_for(design):
    def conv(r, g, b):
        chroma = max(r, g, b) - min(r, g, b)
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if chroma == 0 or not 10 <= h * 360 <= 50:
            return None
        if chroma < 60:
            to = design["neutral"](l)
            if to is None:
                return None
            h2, s2, l2 = to[0] / 360, min(1.0, s * to[1]), max(0.0, min(1.0, l + to[2]))
        elif chroma <= 110:
            h2, s2, l2 = design["accent"][0] / 360, design["accent"][1], l
        else:
            return None
        rr, gg, bb = colorsys.hls_to_rgb(h2, l2, s2)
        return round(rr * 255), round(gg * 255), round(bb * 255)
    return conv


def build(design):
    nebel.conv = conv_for(design)
    weich = yaml.safe_load(open(nebel.SRC, encoding="utf-8"))[BASE]
    sects = {"top": {k: v for k, v in weich.items() if k != "modes"}}
    sects.update(weich.get("modes", {}))
    out = {}
    for sect, vals in sects.items():
        res = {}
        for k, v in vals.items():
            nv = v if k in nebel.KEEP else nebel.recolor(v)
            if nv != v:
                res[k] = nv
        for k, v in {**design["fix"].get(sect, {}), **design.get("extra", {}).get(sect, {})}.items():
            if vals.get(k) != v:
                res[k] = v
        out[sect] = res
    doc = {"casora-theme-base": BASE}
    doc.update(out.pop("top"))
    doc["modes"] = {m: v for m, v in out.items() if v}
    head = ("# %s – erzeugt von tools/build-color-themes.py, nicht von Hand bearbeiten.\n"
            "# %s Nur die Abweichungen von Casora\n"
            "# (theme_weich.yaml); theme.py legt sie beim Laden über das fertige Casora-Design.\n" % (design["name"], design["what"]))
    return head + yaml.safe_dump({design["name"]: doc}, allow_unicode=True, sort_keys=False, width=1000)


def main():
    bad = 0
    for d in DESIGNS:
        path, body = os.path.join(CC, d["file"]), build(d)
        if "--check" in sys.argv:
            cur = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
            if cur != body:
                print(f"{d['file']} ist nicht aktuell: python3 tools/build-color-themes.py")
                bad = 1
            else:
                print(f"{d['file']} aktuell")
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"{path}: {body.count(chr(10))} Zeilen")
    sys.exit(bad)


if __name__ == "__main__":
    main()
