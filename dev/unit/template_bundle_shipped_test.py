"""The template bundle always comes from the package, never from YAML copies in the config folder.

  uv run --python 3.14 --with homeassistant python dev/unit/template_bundle_shipped_test.py

bundle_text used to rebuild the bundle in memory from dashboards/casora/casora.yaml.example plus
dashboards/templates/button_cards whenever both sat in the config folder and were newer than the
shipped casora-templates.json. That is exactly what the old manual install told people to copy, so
stale YAML templates (with fallbacks long fixed in the real source) replaced the shipped ones in the
Studio and in the startup template refresh. Regression test: such copies must be ignored.
"""

from __future__ import annotations

import os
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import templates as T  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


def write(path, text, mtime=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    if mtime is not None:
        os.utime(path, (mtime, mtime))


DESKTOP = """button_card_templates: !include_dir_merge_named {tree}
views:
  - path: home
    type: custom:grid-layout
    layout: {{}}
    cards:
      - type: custom:button-card
      - type: custom:button-card
      - type: custom:button-card
"""

MOBILE = """views:
  - type: custom:grid-layout
    layout: {}
    cards:
      - type: custom:button-card
      - type: custom:casora-smart-row
        cards: []
"""

with tempfile.TemporaryDirectory() as d:
    shipped = '{"version":"1","templates":{"shipped_tpl":{}},"scaffold":{"nav":{}},"mobile":{}}'
    old = time.time() - 3600
    write(os.path.join(d, "custom_components/casora/panel/casora-templates.json"), shipped, old)
    tree = os.path.join(d, "dashboards/templates/button_cards")
    write(os.path.join(tree, "cards/stale.yaml"), "stale_yaml_tpl:\n  name: old\n")
    write(os.path.join(d, "dashboards/casora/casora.yaml.example"), DESKTOP.format(tree=tree))
    write(os.path.join(d, "dashboards/casora/casora_mobile.yaml.example"), MOBILE)

    text = T.bundle_text(d)
    check("shipped bundle served although newer YAML copies sit in the config folder", text == shipped,
          (text or "")[:120])
    check("no template from the YAML copies", "stale_yaml_tpl" not in (text or ""))

with tempfile.TemporaryDirectory() as d:
    check("no shipped bundle → None", T.bundle_text(d) is None)

print("FEHLER: %d" % fails if fails else "alles ok")
sys.exit(1 if fails else 0)
