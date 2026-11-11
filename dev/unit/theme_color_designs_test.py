"""The colour designs Casora Salbei, Marine, Dämmerung and Farbe (tools/build-color-themes.py): Casora in another colour
world. Each file is current, builds on Casora, keeps Casora's build and signal colours, has light and dark, and
really differs from Casora and from the others.

  uv run --python 3.14 --with pyyaml python dev/unit/theme_color_designs_test.py
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CC = os.path.join(ROOT, "custom_components/casora")
FAILS = []


def check(cond, name):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        FAILS.append(name)


spec = importlib.util.spec_from_file_location("color", os.path.join(ROOT, "tools/build-color-themes.py"))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
weich = yaml.safe_load(open(os.path.join(CC, "theme_weich.yaml"), encoding="utf-8"))["Casora"]


def eff(doc, mode, key):
    v = {k: x for k, x in weich.items() if k != "modes"}
    v.update(weich["modes"][mode])
    v.update({k: x for k, x in doc.items() if k != "modes"})
    v.update(doc.get("modes", {}).get(mode, {}))
    return v.get(key)


seen = {}
for d in gen.DESIGNS:
    doc = yaml.safe_load(open(os.path.join(CC, d["file"]), encoding="utf-8"))
    check(list(doc) == [d["name"]], f"{d['file']}: one design named {d['name']}")
    t = doc[d["name"]]
    check(t.get("casora-theme-base") == "Casora", f"{d['name']} builds on Casora")
    check("casora-popup-layout" not in t and "casora-r-surface" not in t, f"{d['name']} keeps Casora's build (layout, corners)")
    check(set(t["modes"]) == {"light", "dark"}, f"{d['name']} has light and dark")
    check(t.get("primary-color") == d["fix"]["top"]["primary-color"], f"{d['name']}: its accent")
    for k in ("casora-color-yellow", "casora-color-orange", "casora-color-red", "state-light-on-color"):
        check(k not in t and all(k not in t["modes"][m] for m in t["modes"]), f"{d['name']}: signal colour {k} unchanged")
    for mode in ("light", "dark"):
        sig = tuple(eff(t, mode, k) for k in ("primary-background-color", "primary-text-color", "primary-color"))
        check(sig != tuple(weich["modes"][mode].get(k, weich.get(k)) for k in ("primary-background-color", "primary-text-color", "primary-color")),
              f"{d['name']} {mode}: differs from Casora")
        check(sig not in seen.values(), f"{d['name']} {mode}: differs from the other designs")
        seen[(d["name"], mode)] = sig

r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/build-color-themes.py"), "--check"], capture_output=True, text=True)
check(r.returncode == 0, "the files match theme_weich.yaml: " + r.stdout.strip().replace("\n", " · "))

# Casora Farbe: tiles that are on take their device tone as the fill. The templates mix the tone in by
# --casora-tile-tone-share (default 0% = today's light plate), and only Farbe sets that share.
for d in gen.DESIGNS:
    t = yaml.safe_load(open(os.path.join(CC, d["file"]), encoding="utf-8"))[d["name"]]
    check((t.get("casora-tile-tone-share") == "100%") == (d["name"] == "Casora Farbe"), f"{d['name']}: tone fill only in Farbe")
for f in ("theme_weich.yaml", "theme_nebel.yaml", "theme_glas.yaml"):
    p = os.path.join(CC, f)
    check(not os.path.exists(p) or "casora-tile-tone-share" not in open(p, encoding="utf-8").read(), f"{f} does not set the tone share")
tpl = open(os.path.join(ROOT, "dashboards/casora/button_card_templates.json"), encoding="utf-8").read()
mix = "color-mix(in srgb, var(--casora-icon-color-current, var(--casora-color-teal, #4E9E95)) var(--casora-tile-tone-share, 0%), var(--casora-entity-active-tint-current, rgba(255,255,255,0.94)))"
check(tpl.count(mix) == 33, f"every active tile state mixes its tone into the fill ({tpl.count(mix)})")
check('"--casora-entity-overlay-tint": "var(--casora-entity-active-tint-current' not in tpl, "no active state left without the mix")
check(tpl.count("var(--casora-tile-tone-share, 0%)") == tpl.count("var(--casora-tile-tone-share"), "the share always defaults to 0%")

print("OK" if not FAILS else f"{len(FAILS)} Fehler")
sys.exit(1 if FAILS else 0)
