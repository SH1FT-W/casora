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
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("share", os.path.join(ROOT, "custom_components/casora/share.py"))
sh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sh)

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
    "some_card_conf": {"api_key": "SECRET", "access_token": "SECRET", "label": "kept"},
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
check('"label":"kept"' in text, "other keys stay")
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
