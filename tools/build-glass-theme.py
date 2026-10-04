#!/usr/bin/env python3
"""Baut custom_components/casora/theme_glass.yaml – „Casora Glass“.

Quelle ist Hemmas Glass-Theme aus Hemma 1.4.1 (themes/hemma/hemma_glass.yaml, MIT,
Will Sanderson). Übernommen wird nur, was Glass gegenüber dem normalen 1.4.1-Theme
ändert, übertragen auf die Namen von Hemma 2 / Casora. Die Integration legt die
Datei beim Laden über das Casora-Theme (helfer.py) – Glass erbt also jede
Änderung am Haupt-Theme und überschreibt nur seine eigenen Werte.

    python3 tools/build-glass-theme.py <hemma_glass-1.4.1.yaml> <hemma-1.4.1.yaml>
"""
import os
import sys
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "custom_components/casora/theme.yaml")
OUT = os.path.join(ROOT, "custom_components/casora/theme_glass.yaml")

# 1.x-CSS-Blöcke würden das Hemma-2-Layout überschreiben – die behält Glass vom Haupt-Theme.
SKIP = {"card-mod-root-yaml", "uix-view-background", "mdc-dialog-scrim-color@top"}
NAME_KEYS = ("card-mod-theme", "uix-theme")
# Hemma-1-Variablen, die es in Hemma 2 nicht mehr gibt → ihr Gegenstück.
MAP = {
    "hemma-popup-tile-background": ["casora-popup-tiles-fill"],
    "ha-dialog-background": ["casora-dialog-bg"],
    # Hemma 2 legt aktive Kacheln als helle Tönung über die Kachel (::after), nicht als Hintergrund.
    "hemma-entity-background-active": ["casora-entity-active-tint"],
    "hemma-entity-background-active-mobile": ["casora-entity-active-tint-mobile"],
}
# Werte, auf die übernommene Glass-Werte verweisen (dialog-box-shadow: var(--casora-dialog-shadow)).
KEEP_REFERENCED = {"hemma-dialog-shadow"}

# Casoras eigene Glas-Abstimmung (28.09.2026): Kacheln so klar wie die Navbar-Pille –
# gleiche Unschärfe, helles Glas statt dunklem, kein Glanzverlauf.
REFINE = {
    "top": {"ha-card-backdrop-filter": "blur(12px) saturate(1.4)"},
    "light": {"casora-entity-background": "rgba(255,255,255,0.08)", "casora-entity-active-tint": "rgba(255,255,255,0.22)",
              "casora-entity-active-tint-mobile": "rgba(255,255,255,0.22)",
              "casora-card-specular-start": "transparent", "casora-card-specular-mid": "transparent", "casora-card-specular-end": "transparent"},
    "dark": {"casora-entity-background": "rgba(255,255,255,0.08)", "casora-entity-active-tint": "rgba(255,255,255,0.22)",
             "casora-entity-active-tint-mobile": "rgba(255,255,255,0.22)",
             "casora-card-specular-start": "transparent", "casora-card-specular-mid": "transparent", "casora-card-specular-end": "transparent"},
}

ren = lambda s: s.replace("hemma", "casora").replace("Hemma", "Casora").strip() if isinstance(s, str) else s


def main(glass_path, hemma_path):
    g = yaml.safe_load(open(glass_path, encoding="utf-8"))["Hemma Glass"]
    h = yaml.safe_load(open(hemma_path, encoding="utf-8"))["Hemma"]
    c = yaml.safe_load(open(BASE, encoding="utf-8"))["Casora Standard"]
    out = {}
    for sect in ["top"] + list(g.get("modes", {})):
        gs = {k: v for k, v in g.items() if k != "modes"} if sect == "top" else g["modes"][sect]
        hs = {k: v for k, v in h.items() if k != "modes"} if sect == "top" else h.get("modes", {}).get(sect, {})
        base = {k: v for k, v in c.items() if k != "modes"} if sect == "top" else c["modes"].get(sect, {})
        res = {}
        for k, v in gs.items():
            if hs.get(k) == v or k in SKIP or f"{k}@{sect}" in SKIP:
                continue
            if k in NAME_KEYS:
                res[k] = "Casora Glass"
                continue
            nk = ren(k)
            if nk in base or k in KEEP_REFERENCED:
                res[nk] = ren(v)
            for target in MAP.get(k, []):
                if target in base:
                    res[target] = ren(v)
        res.update(REFINE.get(sect, {}))
        if res:
            out[sect] = res
    top = out.pop("top", {})
    doc = dict(top)
    if out:
        doc["modes"] = out
    head = ("# Casora Glass – erzeugt von tools/build-glass-theme.py, nicht von Hand bearbeiten.\n"
            "# Nur die Abweichungen vom Casora-Theme; helfer.py legt sie beim Laden darüber.\n"
            "# Herkunft: Hemma 1.4.1 hemma_glass.yaml (MIT, Will Sanderson), auf Hemma 2 übertragen.\n")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(head)
        yaml.safe_dump({"Casora Glass": doc}, f, allow_unicode=True, sort_keys=False, width=1000)
    n = len(top) + sum(len(v) for v in out.values())
    print(f"{OUT}: {n} Werte")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
