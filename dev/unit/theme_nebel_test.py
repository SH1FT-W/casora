"""Casora Nebel (theme_nebel.yaml) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/theme_nebel_test.py

Nebel baut auf Casora (Weich) auf: alles außer Farben kommt von dort, die Datei ist
aktuell zu theme_weich.yaml, und nach dem Zusammensetzen ist kein warmer Ton übrig
(außer dem Licht selbst im Licht-Popup).
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora.helfer import _load_theme  # noqa: E402

spec = importlib.util.spec_from_file_location("nebel", os.path.join(ROOT, "tools/build-nebel-theme.py"))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


themes = _load_theme()
neb, weich = themes.get("Casora Nebel"), themes.get("Casora")
check(neb is not None and weich is not None, "Casora und Casora Nebel geladen")
if neb and weich:
    check("casora-theme-base" not in neb, "Steuerschlüssel casora-theme-base landet nicht im Theme")
    check(neb.get("casora-popup-layout") == weich.get("casora-popup-layout") == "soft", "Nebel erbt den Weich-Aufbau")
    check(neb.get("primary-color") == gen.PETROL, "Akzent Petrol")
    check(set(neb["modes"]) == {"light", "dark"}, "Nebel hat Hell und Dunkel")
    warm = []
    for sect, vals in [("top", neb)] + list(neb["modes"].items()):
        for k, v in vals.items():
            if k != "modes" and k not in gen.KEEP and isinstance(v, str) and gen.recolor(v) != v:
                warm.append(f"{sect}.{k}")
    check(not warm, f"keine warmen Reste: {warm[:5]}")
    # Signalfarben bleiben
    for k in ("casora-color-yellow", "casora-color-orange", "casora-color-red", "state-light-on-color"):
        check(neb.get(k) == weich.get(k), f"Signalfarbe {k} unverändert")

r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/build-nebel-theme.py"), "--check"], capture_output=True, text=True)
check(r.returncode == 0, "theme_nebel.yaml passt zu theme_weich.yaml: " + r.stdout.strip())

print("OK" if not FAILS else f"{len(FAILS)} Fehler")
sys.exit(1 if FAILS else 0)
