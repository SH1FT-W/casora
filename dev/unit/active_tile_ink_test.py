"""Error text on an active tile reads on its light plate, light and dark.

  uv run --python 3.14 --with pyyaml python dev/unit/active_tile_ink_test.py

User test 07.11.2026: in the dark design the active tile stays a light sand plate, but a failed 3D printer wrote
„Fehlgeschlagen“ in --casora-color-red-text, which dark mode sets to the light red for dark rows (#F08A7E): 1,7 : 1.
Error text on active tiles uses --casora-entity-state-active-bad; this checks the token reaches 4,5 : 1 (WCAG AA,
design-regeln §11) on the active plate in every theme mode, and that the tiles colouring error text use it.
"""

from __future__ import annotations

import json
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FAILS: list[str] = []


def rgba(value: str):
    value = value.strip().strip('"')
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", value)
    if m:
        h = m.group(1)
        return [int(h[i:i + 2], 16) for i in (0, 2, 4)] + [1.0]
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)", value)
    if m:
        return [float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4) or 1)]
    return None


def resolve(name: str, mode: dict, base: dict, depth: int = 0):
    value = mode.get(name, base.get(name))
    if value is None or depth > 8:
        return None
    m = re.fullmatch(r"var\(--([\w-]+)(?:,.*)?\)", str(value).strip())
    return resolve(m.group(1), mode, base, depth + 1) if m else rgba(str(value))


def over(fg, bg):
    a = fg[3]
    return [fg[i] * a + bg[i] * (1 - a) for i in range(3)] + [1.0]


def lum(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


with open(os.path.join(ROOT, "custom_components/casora/theme_weich.yaml"), encoding="utf-8") as f:
    theme = yaml.safe_load(f)["Casora"]
base = {k: v for k, v in theme.items() if k != "modes"}
for mode_name, mode in (theme.get("modes") or {}).items():
    ink = resolve("casora-entity-state-active-bad", mode, base)
    tint = resolve("casora-entity-active-tint", mode, base)
    card = resolve("casora-entity-background", mode, base)
    if not ink or not tint or not card:
        FAILS.append(f"{mode_name}: token missing (bad={ink}, tint={tint}, card={card})")
        continue
    # Worst case behind the tile: black (dark photo) and white (bright photo) – the plate is the active tint laid
    # over the translucent inactive card.
    for behind in ([0, 0, 0, 1.0], [255, 255, 255, 1.0]):
        plate = over(tint, over(card, behind))
        r = ratio(over(ink, plate), plate)
        if r < 4.5:
            FAILS.append(f"{mode_name}: error text on the active plate {r:.2f} : 1 < 4.5 (behind {behind[:3]})")

with open(os.path.join(ROOT, "dashboards/casora/button_card_templates.json"), encoding="utf-8") as f:
    tpl = json.load(f)
for name, path in (("casora_3d_printer", ("state", 0, "styles", "state", 0, "color")),
                   ("casora_alarm", ("state", 0, "styles", "state", 0, "color")),
                   ("casora_football", ("extra_styles",))):
    node = tpl.get(name)
    for key in path:
        node = node[key] if node is not None else None
    if not isinstance(node, str) or "--casora-entity-state-active-bad" not in node:
        FAILS.append(f"{name}: error text on the active tile does not use --casora-entity-state-active-bad")

for fail in FAILS:
    print("FEHLER:", fail)
if FAILS:
    sys.exit(1)
print("active_tile_ink: ok")
