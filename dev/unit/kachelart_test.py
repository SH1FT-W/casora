"""Eigene Kachelart (kachelart.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/kachelart_test.py

1. Die KI-Antwort (Op-Liste) wird auf die Vorlage angewandt; Änderungen an „template“
   (der Erbfolge) verwirft Casora, kaputte Pfade werden abgelehnt.
2. Der Prompt enthält Wunsch, Name, Vorlage und geerbte Vorlagen (gekürzt).
3. Die Test-KI (dev/casora_mock) liefert eine gültige, sichtbare Änderung am Ende von styles.
4. Auffrischen nach einem Update (template_refresh → refresh_dashboard) lässt own_-Vorlagen
   unberührt, frischt aber ihre Casora-Grundlage auf.
"""

from __future__ import annotations

import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "dev"))

from custom_components.casora import kachelart, template_print as tp  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


with open(os.path.join(ROOT, "custom_components/casora/panel/casora-templates.json"), encoding="utf-8") as fh:
    BUNDLE = json.load(fh)["templates"]
BASE = BUNDLE["casora_camera"]

# 1. Antwort anwenden
n_name = len(BASE.get("styles", {}).get("name", []))
red = {"color": "var(--casora-color-red, #FF453A)"}
res = {"ops": json.dumps([{"op": "set", "path": f"styles/name/{n_name}", "value": red},
                          {"op": "set", "path": "template", "value": "casora_light"}]),
       "changes": "Der Name ist rot."}
out, notes, n = kachelart.tile_type_result(BASE, res)
check(out["styles"]["name"][-1] == red, "Stil angehängt")
check(out["template"] == BASE["template"], "template bleibt (Erbfolge bestimmt Casora)")
check(notes == ["Der Name ist rot."] and n == 1, "Hinweise und Anzahl")
check(BASE["styles"]["name"][-1] != red, "Vorlage selbst unverändert")
for bad in ({"ops": "kein json"}, {"ops": json.dumps([{"op": "set", "path": "styles/name/99/x", "value": 1}])},
            {"ops": json.dumps([{"op": "wipe", "path": "a"}])}):
    try:
        kachelart.tile_type_result(BASE, bad)
        check(False, f"abgelehnt: {bad}")
    except ValueError:
        pass

# 2. Prompt
parents = {k: BUNDLE[k] for k in BASE["template"] if k in BUNDLE}
prompt = kachelart.tile_type_prompt("casora_camera", BASE, "Name rot", "Kamera rot", parents, "Deutsch")
check('"Name rot"' in prompt and "„Kamera rot“" in prompt, "Wunsch und Name im Prompt")
check(prompt.rstrip().endswith(json.dumps(BASE, ensure_ascii=False)), "Vorlage am Ende")
check("GEERBT" in prompt and "casora_entity" in prompt, "geerbte Vorlagen zur Information")
check(len(prompt) < len(json.dumps(BASE)) + kachelart.MAX_PARENT_CHARS + 6000, "geerbte Vorlagen gekürzt")
check(kachelart.is_own("own_x") and not kachelart.is_own("casora_camera"), "is_own")

# 3. Test-KI
try:
    # Nur die Antwortlogik der Test-KI: HAs ai_task/conversation als Attrappe (sonst fehlt hassil).
    import types as _types
    for _m, _names in (("homeassistant.components.ai_task", ("AITaskEntity", "AITaskEntityFeature", "GenDataTask", "GenDataTaskResult")),
                       ("homeassistant.components.conversation", ("ChatLog",))):
        _mod = _types.ModuleType(_m)
        for _n in _names:
            setattr(_mod, _n, type(_n, (), {"GENERATE_DATA": 1, "SUPPORT_ATTACHMENTS": 2}))
        sys.modules[_m] = _mod
    import importlib.util as _iu
    _spec = _iu.spec_from_file_location("mock_ai_task", os.path.join(ROOT, "dev/casora_mock/ai_task.py"))
    mock = _iu.module_from_spec(_spec)
    _spec.loader.exec_module(mock)
    for wish, key in (("Der Name soll rot sein", "name"), ("eckiger", "card"), ("irgendwas", "card")):
        p = kachelart.tile_type_prompt("casora_camera", BASE, wish, "", {}, "Deutsch")
        ans = mock._canned("Casora Kachelart: Vorlage anpassen", p)
        o2, nt, _n = kachelart.tile_type_result(BASE, ans)
        check(len(o2["styles"][key]) == len(BASE["styles"].get(key, [])) + 1 and nt, f"Test-KI: {wish}")
except ImportError as err:  # ohne HA-Komponenten
    print("Test-KI übersprungen:", err)

# 4. Auffrischen nach Update
own = {"template": "casora_camera", "styles": {"name": [red]},
       "variables": {"casora_tile": {"label": "Kamera rot", "base": "casora_camera", "wishes": []}}}
old_cam = copy.deepcopy(BASE)
old_cam["styles"]["card"] = old_cam["styles"].get("card", [])[:-1] or [{"padding": "1px"}]
old_bundle = {**BUNDLE, "casora_camera": old_cam}
cfg = {"views": [{"cards": [{"type": "custom:button-card", "template": "own_kamera_rot", "entity": "camera.x"}]}],
       "button_card_templates": {**copy.deepcopy(old_bundle), "own_kamera_rot": copy.deepcopy(own)},
       tp.FINGERPRINT_KEY: tp.fingerprint_of(old_bundle)}
new_cfg, r = tp.refresh_dashboard(cfg, BUNDLE, mobile=True)
check(new_cfg is not None, "Auffrischen hatte etwas zu tun")
if new_cfg:
    check(new_cfg["button_card_templates"]["own_kamera_rot"] == own, "eigene Vorlage unverändert")
    check(new_cfg["button_card_templates"]["casora_camera"] == BUNDLE["casora_camera"], "Grundlage aufgefrischt")
    check("own_kamera_rot" not in new_cfg[tp.FINGERPRINT_KEY], "kein Fingerabdruck für eigene Vorlage")
    check(new_cfg["views"] == cfg["views"], "Ansichten unverändert")
check("own_kamera_rot" in r["foreign"], "als eigene Vorlage erkannt")
# Studio-Modus (Speichern) ebenso.
r2 = tp.refresh_templates(cfg["button_card_templates"], BUNDLE, cfg[tp.FINGERPRINT_KEY])
check(r2["templates"]["own_kamera_rot"] == own, "Speichern: eigene Vorlage unverändert")

if FAILS:
    print(f"{len(FAILS)} Fehler")
    sys.exit(1)
print("ok kachelart_test")
