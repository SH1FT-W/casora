"""Ausgemusterte casora_-Vorlagen nach dem automatischen Auffrischen (template_print.py) – ohne HA.

  uv run --python 3.14 --with homeassistant python dev/unit/checkup_vorlagen_ausgemustert_test.py

Das Auffrischen nach einem Update (auto) lässt eine ausgemusterte, unveränderte casora_-Vorlage
stehen. Ihr Fingerabdruck muss dabei bleiben – sonst erkennt das nächste Speichern im Studio
sie nicht mehr als „removed“ und sie bleibt für immer als „orphan“ liegen.
"""

from __future__ import annotations

import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location(
    "template_print", os.path.join(ROOT, "custom_components/casora/template_print.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


old_a = {"styles": {"card": [{"color": "red"}]}}
new_a = {"styles": {"card": [{"color": "blue"}]}}
gone = {"styles": {"card": [{"padding": "4px"}]}}
mine = {"styles": {"card": [{"padding": "9px"}]}}  # vom Nutzer geändert
cfg = {
    "views": [{"cards": []}],
    "button_card_templates": {"casora_a": old_a, "casora_alt": gone, "casora_eigen_alt": mine},
    tp.FINGERPRINT_KEY: {"casora_a": tp.template_print(old_a, "casora_a"),
                         "casora_alt": tp.template_print(gone, "casora_alt"),
                         "casora_eigen_alt": tp.template_print({"x": 1}, "casora_eigen_alt")},
}
bundle = {"casora_a": new_a}

new, r = tp.refresh_dashboard(cfg, bundle)
check("auto: aufgefrischt", new is not None and new["button_card_templates"]["casora_a"] == new_a, r)
fp = (new or {}).get(tp.FINGERPRINT_KEY, {})
check("auto: ausgemusterte Vorlage bleibt stehen", "casora_alt" in (new or {}).get("button_card_templates", {}))
check("auto: ihr Fingerabdruck bleibt", fp.get("casora_alt") == tp.template_print(gone, "casora_alt"), fp)
check("auto: geänderte ohne Fingerabdruck wie bisher", "casora_eigen_alt" not in fp, fp)

# Danach speichert das Studio (auto=False): die unveränderte ausgemusterte geht, die geänderte bleibt.
r2 = tp.refresh_templates(new["button_card_templates"], bundle, fp, auto=False)
check("Studio: als removed erkannt", r2["removed"] == ["casora_alt"], r2["removed"])
check("Studio: geänderte bleibt (orphan)", r2["orphan"] == ["casora_eigen_alt"], r2["orphan"])

print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
