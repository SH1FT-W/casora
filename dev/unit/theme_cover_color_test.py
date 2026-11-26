"""HA's own cover dialog in Casora's colours (Prüfrunde w04-01).

  uv run --python 3.14 --with pyyaml python dev/unit/theme_cover_color_test.py

HA's cover more-info dialog (redesigned in frontend 20261125.0) colours an open cover with
--state-cover-active-color: purple until 2026.11, blue (#2196f3) from 2026.12. Casora's designs set it
(and the open/opening/closing variants) to the tone of Casora's own blinds tile and popup
(--casora-popup-primary-color), in every design, merged as theme.py load_themes merges them.
"""

from __future__ import annotations

import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, "custom_components", "casora")
KEYS = ("state-cover-active-color", "state-cover-open-color", "state-cover-opening-color", "state-cover-closing-color")


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def overlay(base, over):
    out = dict(base)
    for k, v in over.items():
        out[k] = overlay(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


base = load(os.path.join(DIR, "theme.yaml"))["Casora Basis"]
themes, later = {}, []
for path in sorted(glob.glob(os.path.join(DIR, "theme_*.yaml"))):
    for name, over in load(path).items():
        parent = over.get("casora-theme-base")
        if parent:
            later.append((name, parent, {k: v for k, v in over.items() if k != "casora-theme-base"}))
        else:
            themes[name] = overlay(base, over)
for name, parent, over in later:
    themes[name] = overlay(themes.get(parent, base), over)

FAILS = []
if not themes:
    FAILS.append("no designs found")
for name, theme in themes.items():
    for mode in ("light", "dark"):
        vals = dict(theme)
        vals.update(((theme.get("modes") or {}).get(mode)) or {})
        for k in KEYS:
            v = str(vals.get(k) or "")
            if "--casora-popup-primary-color" not in v:
                FAILS.append(f"{name} ({mode}): {k} = {v!r}")

for fail in FAILS:
    print("FEHLER:", fail)
if FAILS:
    sys.exit(1)
print(f"theme_cover_color: ok ({len(themes)} designs)")
