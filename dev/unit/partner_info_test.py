"""casora/partner_info (Leistung 1.3): Auszug aus dem Partner-Dashboard statt der ganzen Konfiguration.
confirm_of muss dasselbe liefern wie fromCfg in casora-core.js, scenes_of wie _sceneCfg (04-navigation.js).

    python3 dev/unit/partner_info_test.py
"""
import importlib.util
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("pb", os.path.join(ROOT, "custom_components/casora/phone_badges.py"))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

cfg = {
    "button_card_templates": {"casora_scene_row": {"variables": {"scenes": ["scene.a"], "scene_order": ["scene.a"]}},
                              "x": {"variables": {"confirm_toggle": True}, "entity": "lock.vorlage"}},
    "views": [{"cards": [
        {"entity": "lock.haustuer", "name": "Haustür", "variables": {"confirm_toggle": True}},
        {"type": "conditional", "card": {"entity": "switch.pumpe", "variables": {"confirm_toggle": True}}},
        {"entity": "cover.alle", "name": "Jalousien", "variables": {"confirm_toggle": True, "covers": ["cover.b", "cover.a"]}},
        {"entity": "light.decke", "variables": {}},
        {"entity": "[[[ return 'x' ]]]", "variables": {"confirm_toggle": True}},
    ]}],
}
got = pb.confirm_of(cfg)
assert got["ids"] == ["lock.haustuer", "switch.pumpe", "cover.alle", "cover.b", "cover.a"], got
assert got["names"] == {"lock.haustuer": "Haustür", "cover.alle": "Jalousien", "cover.a,cover.b": "Jalousien"}, got
assert pb.scenes_of(cfg) == {"scenes": ["scene.a"], "scene_exclude": None, "scene_order": ["scene.a"]}
# Startseiten-Variablen haben Vorrang
cfg2 = json.loads(json.dumps(cfg)); cfg2["views"][0]["cards"].insert(0, {"variables": {"scenes": ["scene.z"]}})
assert pb.scenes_of(cfg2)["scenes"] == ["scene.z"]

# Gleich wie fromCfg (casora-core.js) – Block ausschneiden und in Node laufen lassen.
core = open(os.path.join(ROOT, "custom_components/casora/scripts/casora-core.js"), encoding="utf-8").read()
i = core.index("  var fromCfg = function (cfg) {")
j = core.index("  var EMPTY = ", i)
js = core[i:j] + "\nprocess.stdout.write(JSON.stringify(fromCfg(JSON.parse(require('fs').readFileSync(0, 'utf8')))));"
for c in (cfg, cfg2):
    r = subprocess.run(["node", "-e", js], input=json.dumps(c), text=True, capture_output=True)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == pb.confirm_of(c), (r.stdout, pb.confirm_of(c))
print("ok partner_info")
