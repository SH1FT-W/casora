"""Vorlagen nach Update auffrischen (template_print.py) – ohne HA, ohne pytest.

  uv run --python 3.14 python dev/unit/vorlagen_auto_test.py [ALT_BUNDLE.json] [DASHBOARD ...]

1. Prüfsummen: Python (template_print.py) und Studio (casora-panel.js, per node)
   rechnen über dashboards/casora/button_card_templates.json, das Panel-Bundle und
   Grenzfälle (Umlaute, Emoji, Steuerzeichen, Zahlen) dieselben Werte.
2. refresh_templates() (Studio-Modus) liefert dasselbe wie refreshTemplates().
3. refresh_dashboard(): ein Dashboard „mit altem Bundle gespeichert“ (ALT_BUNDLE, z. B.
   `git show <alt>:custom_components/casora/panel/casora-templates.json`) wird auf das
   heutige Bundle gebracht; eine vom Nutzer geänderte Vorlage bleibt, Routen und
   Szenen des Dashboards bleiben, die Ansichten bleiben, das Studio sieht danach
   nichts mehr zu tun. DASHBOARD = Kopie einer .storage/lovelace.<name>-Datei (oder
   deren config); ein Name, der auf _mobile/-mobile endet, gilt als Handy-Layout
   des davor genannten. Ohne Argumente: ein kleines Beispiel-Dashboard.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location(
    "template_print", os.path.join(ROOT, "custom_components/casora/template_print.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

FAILS: list[str] = []


def check(ok: bool, msg: str) -> None:
    if not ok:
        FAILS.append(msg)
        print("  FEHLER:", msg)


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def cfg_of(doc: dict) -> dict:
    return doc.get("data", {}).get("config", doc) if "data" in doc else doc


def run_js(payload: dict) -> dict:
    with tempfile.TemporaryDirectory() as d:
        inp, outp = os.path.join(d, "in.json"), os.path.join(d, "out.json")
        with open(inp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)  # ensure_ascii: einzelne Surrogate bleiben erhalten
        subprocess.run(["node", os.path.join(ROOT, "dev/unit/vorlagen_print_js.mjs"), inp, outp], check=True)
        return load(outp)


EDGE = [
    None, True, False, 0, -0.0, 1, -7, 100.0, 0.1, 0.5, 1.5, -2.25, 1e-7, 1e-6, 0.000123, 1e21, 1.5e21,
    123456789012345680000.0, 5e-324, 1.7976931348623157e308, 12345678.9, 2 ** 53 + 2,
    "", "ä ö ü ß Küche", "😀 Emoji", "tab\tnl\ncr\r\b\f", "\x00\x1f\x7f", "quote \" back \\ slash",
    "  ", "\ud800 einzeln", {"b": 1, "a": [1, {"z": None, "ä": "x"}], "￿": 1, "😀": 2, "Z": 3, "10": 1, "9": 2},
    [[], {}, [None]],
]

# ─── Beispiel-Dashboard, falls keins angegeben ist ──────────────────────────

def sample_dashboard(bundle: dict, url: str) -> dict:
    rooms = [("home", "Home"), ("bad", "Bad")]
    routes = [{"url": f"/{url}/{p}", "label": n, "icon": "mdi:home-variant"} for p, n in rooms]
    routes.append({"label": "Szenen", "icon": "mdi:palette", "menu": "scenes"})
    views = [{"type": "custom:grid-layout", "path": p, "title": n, "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": n,
         "variables": {"scenes": ["scene.x"], "scene_order": ["scene.x"]} if p == "home" else {}},
        {"type": "vertical-stack", "cards": [{"type": "custom:casora-nav", "routes": copy.deepcopy(routes)}]},
        {"type": "custom:casora-smart-row", "cards": []}]} for p, n in rooms]
    return {"views": views, "button_card_templates": copy.deepcopy(bundle)}


def as_saved_by(cfg: dict, bundle: dict, mobile: bool, home_vars: dict | None) -> dict:
    """So, wie das Studio das Dashboard mit `bundle` gespeichert hätte."""
    out = copy.deepcopy(cfg)
    tpl = copy.deepcopy(bundle)
    names = list(tpl)
    if not mobile:
        routes = tp.first_routes(out.get("views"))
        if routes is not None:
            tp.retarget(tpl, names, routes)
        home_vars = tp.home_vars_of(out) if home_vars is None else home_vars
    tp.apply_scene_pick(tpl, names, home_vars)
    out["button_card_templates"] = tpl
    out[tp.FINGERPRINT_KEY] = tp.fingerprint_of(bundle)
    return out


def main() -> int:
    args = sys.argv[1:]
    new = load(os.path.join(ROOT, "custom_components/casora/panel/casora-templates.json"))["templates"]
    src = load(os.path.join(ROOT, "dashboards/casora/button_card_templates.json"))
    old = load(args[0])["templates"] if args else None
    if old is None:
        # Ohne altes Bundle: eines erfinden, in dem jede zweite Vorlage anders war.
        old = copy.deepcopy(new)
        for i, k in enumerate(sorted(old)):
            if i % 2 == 0 and isinstance(old[k], dict):
                old[k].setdefault("variables", {})["casora_alt"] = i
        old.pop(sorted(old)[1])
    dash_paths = args[1:]

    # ── 1. Prüfsummen ──
    print("1) Prüfsummen Python ↔ Studio")
    payload_prints = {}
    for label, group in (("src", src), ("new", new), ("old", old)):
        for k, v in group.items():
            payload_prints[f"{label}:{k}"] = v
    whole = EDGE + [new[k] for k in list(new)[:40]]

    # ── 3. vorbereiten (Ergebnisse gehen mit in denselben node-Lauf) ──
    dashboards: list[tuple[str, dict, bool]] = []
    if dash_paths:
        for p in dash_paths:
            name = os.path.basename(p)
            dashboards.append((name, cfg_of(load(p)), name.endswith(("_mobile", "-mobile"))))
    else:
        dashboards.append(("beispiel", sample_dashboard(old, "mein-dash"), False))

    refresh_cases = []
    scenarios = []
    desk_home = None
    for name, cfg, mobile in dashboards:
        for k, v in (cfg.get("button_card_templates") or {}).items():
            payload_prints[f"{name}:{k}"] = v
        if not mobile:
            desk_home = tp.home_vars_of(cfg)
        saved = as_saved_by(cfg, old, mobile, desk_home if mobile else None)
        # Eine Vorlage hat der Nutzer geändert, eine ist ohne Fingerabdruck, eine gehört ihm.
        keys = [k for k in sorted(old) if k in new and tp.template_print(old[k], k) != tp.template_print(new[k], k)
                and isinstance(saved["button_card_templates"][k], dict)]
        edited, unknown = keys[0], keys[1]
        saved["button_card_templates"][edited].setdefault("variables", {})["meine_aenderung"] = 1
        saved["button_card_templates"][unknown]["styles"] = {"card": ["color: red"]}
        del saved[tp.FINGERPRINT_KEY][unknown]
        saved["button_card_templates"]["meine_vorlage"] = {"variables": {"x": 1}}
        refresh_cases.append({"current": saved["button_card_templates"], "bundle": new,
                              "prior": saved[tp.FINGERPRINT_KEY]})
        out, res = tp.refresh_dashboard(saved, new, mobile=mobile, home_vars=desk_home if mobile else None)
        scenarios.append((name, mobile, saved, out, res, edited, unknown))
        if out is not None:
            refresh_cases.append({"current": out["button_card_templates"], "bundle": new,
                                  "prior": out[tp.FINGERPRINT_KEY]})
        # Das echte Dashboard, so wie es jetzt ist, gegen das heutige Bundle.
        refresh_cases.append({"current": cfg.get("button_card_templates") or {}, "bundle": new,
                              "prior": cfg.get(tp.FINGERPRINT_KEY) or {}})

    js = run_js({"prints": payload_prints, "whole": whole, "refresh": refresh_cases})

    py_prints = tp.fingerprint_of(payload_prints)
    diff = [k for k in payload_prints if py_prints[k] != js["prints"][k]]
    check(not diff, f"{len(diff)} Prüfsummen weichen ab: {diff[:5]}")
    for i, x in enumerate(whole):
        if tp.stable(x) != js["stable"][i]:
            check(False, f"stable({x!r}) = {tp.stable(x)!r}, Studio {js['stable'][i]!r}")
        elif tp.hash_str(tp.stable(x)) != js["whole"][i]:
            check(False, f"hashStr({x!r}) weicht ab")
    print(f"   {len(payload_prints)} Vorlagen + {len(whole)} Werte verglichen")

    # ── 2. refreshTemplates ──
    print("2) refresh_templates ↔ refreshTemplates")
    for i, case in enumerate(refresh_cases):
        py = tp.refresh_templates(copy.deepcopy(case["current"]), case["bundle"], case["prior"])
        jr = js["refresh"][i]
        for key in ("prints", "adopted", "mine", "redeclared", "unknown", "updated", "added", "kept",
                    "removed", "foreign", "orphan"):
            check(py[key] == jr[key], f"Fall {i}: {key} weicht ab ({str(py[key])[:80]} / {str(jr[key])[:80]})")
        check(tp.stable(py["templates"]) == tp.stable(jr["templates"]), f"Fall {i}: Vorlagen weichen ab")
    print(f"   {len(refresh_cases)} Fälle verglichen")

    # ── 3. refresh_dashboard ──
    print("3) Dashboard nach Update auffrischen")
    ci = 0
    for name, mobile, saved, out, res, edited, unknown in scenarios:
        ci += 1  # Fall „saved“ im Studio-Modus
        print(f"   {name}: {res['updated']} erneuert, {res['added']} neu, eigene: {res['mine']}, "
              f"ohne Fingerabdruck: {res['unknown']}, Routen: {res.get('rewritten', 0)}")
        check(out is not None, f"{name}: nichts erneuert")
        if out is None:
            ci += 1
            continue
        t_old, t_new = saved["button_card_templates"], out["button_card_templates"]
        check(out["views"] == saved["views"], f"{name}: Ansichten verändert")
        check({k: v for k, v in out.items() if k not in ("button_card_templates", tp.FINGERPRINT_KEY)}
              == {k: v for k, v in saved.items() if k not in ("button_card_templates", tp.FINGERPRINT_KEY)},
              f"{name}: Rest des Dashboards verändert")
        check(t_new[edited] == t_old[edited], f"{name}: geänderte Vorlage {edited} überschrieben")
        check(t_new[unknown] == t_old[unknown], f"{name}: Vorlage ohne Fingerabdruck {unknown} überschrieben")
        check(t_new["meine_vorlage"] == t_old["meine_vorlage"], f"{name}: eigene Vorlage verändert")
        check(edited in res["mine"] and unknown in res["unknown"], f"{name}: Einordnung falsch")
        wrong = [k for k in new if k not in (edited, unknown)
                 and tp.template_print(t_new[k], k) != tp.template_print(new[k], k)]
        check(not wrong, f"{name}: nicht erneuert: {wrong[:5]}")
        fp = out[tp.FINGERPRINT_KEY]
        check(fp.get(edited) == saved[tp.FINGERPRINT_KEY][edited], f"{name}: Fingerabdruck der eigenen Vorlage verloren")
        check(all(fp.get(k) == tp.template_print(new[k], k) for k in new if k not in (edited, unknown)),
              f"{name}: Fingerabdruck nicht der neue")
        if not mobile:
            want = tp.first_routes(saved["views"])
            got = []
            tp._each(t_new, lambda o: got.append(o["routes"]) if isinstance(o.get("routes"), list) else None)
            check(bool(got) and all(r == want for r in got), f"{name}: Routen nicht die des Dashboards")
        row = t_new.get("casora_scene_row", {}).get("variables", {})
        old_row = t_old.get("casora_scene_row", {}).get("variables", {})
        check({k: row.get(k) for k in tp.SCENE_KEYS} == {k: old_row.get(k) for k in tp.SCENE_KEYS},
              f"{name}: Szenenwahl nicht übernommen")
        again, _ = tp.refresh_dashboard(out, new, mobile=mobile)
        check(again is None, f"{name}: zweiter Lauf ändert noch etwas")
        # Das Studio sieht danach nichts mehr zu tun (bis auf die Vorlage ohne Fingerabdruck).
        jr = js["refresh"][ci]
        ci += 1
        check(jr["updated"] == 0 and jr["added"] == 0, f"{name}: Studio würde noch {jr['updated']} erneuern")
        check(jr["mine"] == [edited] and jr["unknown"] == [unknown],
              f"{name}: Studio sieht eigene {jr['mine']} / unbekannte {jr['unknown']}")
        ci += 1  # echtes Dashboard gegen heutiges Bundle (nur in Teil 2 verglichen)

    print("OK" if not FAILS else f"{len(FAILS)} Fehler")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
