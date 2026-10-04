"""Karten-Updates (card_package.py, card_updates.py) ohne echtes HA.

  uv run --python 3.14 python dev/unit/karten_updates_test.py

1. Paketprüfung: gutes Paket, falsche Prüfsumme, zu neue min_casora, unbekannte und
   fremde Vorlagen, Skript-Module, manipulierte Vorlage werden abgelehnt.
2. Überlagerungsregel: gilt nur, solange die ausgelieferte Vorlage die Basis ist;
   nach einem kompletten Update gilt die ausgelieferte, prune räumt auf.
3. Effektives Bundle: /api/casora/templates und template_refresh lesen die Überlagerung.
4. Ablauf mit GitHub- und Lovelace-Attrappen: Releases lesen, Annehmen schreibt die
   Überlagerung, frischt das Dashboard sofort auf (Stand vorher/nachher), zweimal
   annehmen geht nicht, „auto“ nimmt beim Prüfen an, kaputte Pakete werden angezeigt,
   nicht angenommen.
5. tools/build-card-update.py baut aus einer echten Vorlagen-Änderung seit dem
   letzten Release ein Paket, das Casora annimmt (in einem Temp-Ordner).
"""

from __future__ import annotations

import asyncio
import copy
import datetime
import hashlib
import importlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PKG = os.path.join(ROOT, "custom_components/casora")

# HA-Attrappen wie in vorlagen_auto_ha_test.py (bringt Store, Lovelace, Hass mit).
spec = importlib.util.spec_from_file_location("vaht", os.path.join(ROOT, "dev/unit/vorlagen_auto_ha_test.py"))
vaht = importlib.util.module_from_spec(spec)
sys.modules["vaht"] = vaht
spec.loader.exec_module(vaht)
stub, FakeStore, Dash, Hass, vat, tp, tr = vaht.stub, vaht.FakeStore, vaht.Dash, vaht.Hass, vaht.vat, vaht.tp, vaht.tr


class Response:
    def __init__(self, body=None, status=200, text=None, content_type=None, headers=None):
        self.body, self.status, self.text = body, status, text


stub("aiohttp.web", Response=Response)
stub("homeassistant.components.update", UpdateEntity=object,
     UpdateEntityFeature=types.SimpleNamespace(INSTALL=1, RELEASE_NOTES=2))
for n in ("homeassistant.config_entries", "homeassistant.helpers.issue_registry",
          "homeassistant.helpers.entity_platform"):
    stub(n)
stub("homeassistant.helpers.event", async_track_time_interval=lambda hass, cb, iv: (lambda: None))


class FakeResp:
    def __init__(self, status, payload):
        self.status, self.payload = status, payload
        self.headers = {}
        outer = self

        class _Content:
            async def read(self, n=-1):
                return outer.payload if n < 0 else outer.payload[:n]

        self.content = _Content()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    async def json(self, content_type=None):
        return json.loads(self.payload)

    async def read(self):
        return self.payload


class FakeGitHub:
    """/releases und Asset-Downloads aus dem Speicher; zählt Downloads."""

    def __init__(self):
        self.releases: list = []
        self.assets: dict = {}
        self.downloads = 0
        self.headers: list = []

    def add(self, tag: str, raw: bytes, digest: bool = True):
        aid = len(self.assets) + 1
        url = f"https://api.github.com/assets/{aid}"
        self.assets[url] = raw
        self.releases.insert(0, {"tag_name": tag, "draft": False, "prerelease": False,
                                 "html_url": f"https://github.com/x/releases/{tag}", "assets": [{
                                     "id": aid, "name": tag + ".json", "url": url, "size": len(raw),
                                     "updated_at": "t", **({"digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                                                           if digest else {})}]})

    def get(self, url, params=None, headers=None, timeout=None):
        self.headers.append(headers or {})
        if url.split("?")[0].endswith("/releases"):
            return FakeResp(200, json.dumps(self.releases).encode())
        self.downloads += 1
        # update_source.py lädt Anhänge über /repos/…/releases/assets/<id>
        return FakeResp(200, self.assets["https://api.github.com/assets/" + url.rsplit("/", 1)[1]])


GH = FakeGitHub()
stub("homeassistant.helpers.aiohttp_client", async_get_clientsession=lambda hass: GH)

cp = importlib.import_module("casora.card_package")
cu_mod = importlib.import_module("casora.card_updates")
templates_mod = importlib.import_module("casora.templates")

FAILS: list = []


def check(ok, msg):
    if not ok:
        FAILS.append(msg)
        print("  FEHLER:", msg)


def make_pkg(pid: str, changes: dict, shipped: dict, min_casora: str = "0.1.0", published: str | None = None) -> dict:
    items = [{"kind": "template", "name": k, "notes": f"Fix für {k}", "base": cp.template_hash(shipped[k]),
              "hash": cp.template_hash(v), "body": v} for k, v in changes.items()]
    return {"format": 1, "id": pid, "published": published or "2026-09-30T10:00:00+00:00",
            "min_casora": min_casora, "notes_md": "Test", "items": items, "sha256": cp.items_sha256(items)}


def fixed(t: dict, mark: str) -> dict:
    t = copy.deepcopy(t)
    t.setdefault("variables", {})["casora_fix"] = mark
    return t


def rejects(pkg, shipped, version="0.4.0") -> str | None:
    try:
        cp.verify_package(pkg, installed_version=version, shipped=shipped)
    except cp.PackageError as err:
        return str(err)
    return None


def part1(shipped: dict) -> None:
    print("1) Paketprüfung")
    k = "casora_waschmaschine"
    good = make_pkg("karten-test-1", {k: fixed(shipped[k], "a")}, shipped)
    check(rejects(good, shipped) is None, "gutes Paket abgelehnt")
    bad = copy.deepcopy(good)
    bad["items"][0]["notes"] = "anders"
    check("Prüfsumme" in (rejects(bad, shipped) or ""), "falsche sha256 angenommen")
    check("Benötigt" in (rejects(make_pkg("karten-t", {k: fixed(shipped[k], "a")}, shipped, "9.0.0"), shipped) or ""),
          "zu neue min_casora angenommen")
    unk = copy.deepcopy(good)
    unk["items"][0]["name"] = "casora_gibt_es_nicht"
    unk["sha256"] = cp.items_sha256(unk["items"])
    check("Unbekannte Vorlage" in (rejects(unk, shipped) or ""), "unbekannte Vorlage angenommen")
    foreign = {**shipped, "meine_karte": {}}
    fp = make_pkg("karten-t", {"meine_karte": {"x": 1}}, foreign)
    check("Unbekannte Vorlage" in (rejects(fp, foreign) or ""), "Nicht-casora-Vorlage angenommen")
    mod = copy.deepcopy(good)
    mod["items"][0]["kind"] = "module"
    mod["sha256"] = cp.items_sha256(mod["items"])
    check("nicht unterstützt" in (rejects(mod, shipped) or ""), "Skript-Modul angenommen")
    tam = copy.deepcopy(good)
    tam["items"][0]["body"]["variables"]["casora_fix"] = "böse"
    tam["sha256"] = cp.items_sha256(tam["items"])
    check("Prüfsumme der Vorlage" in (rejects(tam, shipped) or ""), "manipulierte Vorlage angenommen")
    check("ID" in (rejects({**good, "id": "v9.9.9"}, shipped) or ""), "falsche ID angenommen")


def part2(shipped: dict) -> None:
    print("2) Überlagerungsregel")
    k, k2 = "casora_waschmaschine", "casora_trockner"
    pkg = make_pkg("karten-a", {k: fixed(shipped[k], "a"), k2: fixed(shipped[k2], "a")}, shipped)
    ov, taken, skipped = cp.merge_package({}, pkg, shipped)
    check(taken == [k, k2] and not skipped, f"übernommen: {taken} {skipped}")
    eff, active = cp.effective_templates(shipped, ov)
    check(eff[k]["variables"]["casora_fix"] == "a" and sorted(active) == [k2, k], "Überlagerung wirkt nicht")
    # Späteres Paket gewinnt, ein älteres danach überschreibt nicht.
    later = make_pkg("karten-b", {k: fixed(shipped[k], "b")}, shipped, published="2026-10-01T00:00:00+00:00")
    ov2, taken2, _ = cp.merge_package(ov, later, shipped)
    check(taken2 == [k], "späteres Paket nicht übernommen")
    older = make_pkg("karten-c", {k: fixed(shipped[k], "c")}, shipped, published="2026-09-01T00:00:00+00:00")
    check(cp.package_states(older, shipped, ov2)[0]["state"] == "ersetzt", "älteres Paket nicht als ersetzt erkannt")
    check(cp.package_states(later, shipped, ov2)[0]["state"] == "aktuell", "angenommenes Paket nicht aktuell")
    # Komplettes Update: k2 bringt genau den Fix mit, k ist anders weiterentwickelt.
    new_shipped = {**shipped, k2: fixed(shipped[k2], "a"), k: fixed(shipped[k], "release")}
    eff, active = cp.effective_templates(new_shipped, ov2)
    check(not active and eff[k]["variables"]["casora_fix"] == "release", "ausgelieferte Fassung gewinnt nicht")
    check(cp.package_states(pkg, new_shipped, ov2)[1]["state"] == "aktuell", "enthaltener Fix nicht als aktuell erkannt")
    check(cp.package_states(pkg, new_shipped, ov2)[0]["state"] == "veraltet", "überholter Fix nicht als veraltet erkannt")
    pruned, gone = cp.prune_overlay(ov2, new_shipped)
    check(sorted(gone) == sorted([k, k2]) and not pruned["templates"], f"prune: {gone}")


def part3(tmp: str, bundle: dict) -> None:
    print("3) Effektives Bundle (Studio-Route + Auffrischen)")
    shipped = bundle["templates"]
    k = "casora_waschmaschine"
    got0 = tr._read_bundle(tmp)
    pkg = make_pkg("karten-a", {k: fixed(shipped[k], "a")}, shipped)
    ov, _t, _s = cp.merge_package({}, pkg, shipped)
    cp.write_overlay(tmp, ov)
    got1 = tr._read_bundle(tmp)
    check(got1[0][k]["variables"]["casora_fix"] == "a", "template_refresh liest die Überlagerung nicht")
    check(got0[1] != got1[1], "Prüfsumme ändert sich nicht mit der Überlagerung")
    hass = Hass(tmp, {})
    req = {"hass": hass}
    view = templates_mod.CasoraTemplatesView()
    res = asyncio.run(view.get(types.SimpleNamespace(app=req)))
    served = json.loads(res.body.decode("utf-8"))
    check(served["templates"][k]["variables"]["casora_fix"] == "a", "/api/casora/templates ohne Überlagerung")
    check(served.get("scaffold") == bundle.get("scaffold"), "Gerüst des Bundles verloren")
    os.remove(cp.overlay_path(tmp))


def part4(tmp: str, bundle: dict) -> None:
    print("4) Ablauf: prüfen, annehmen, auffrischen, auto")
    shipped = bundle["templates"]
    k, k2 = "casora_waschmaschine", "casora_trockner"
    desk = vat.as_saved_by(vat.sample_dashboard(shipped, "haus"), shipped, False, None)
    dashes = {"haus": Dash(desk), "fremd": Dash({"views": [{"cards": []}]})}
    hass = Hass(tmp, dashes)
    FakeStore.saved.clear()
    vaht.SNAPS.clear()
    # Erster Start: Bundle bekannt machen (sonst frischt das Annehmen „wegen neuem Bundle“ auf).
    asyncio.run(tr.async_refresh_dashboards(hass))
    check(dashes["haus"].saves == 0, "Start mit unverändertem Bundle hat gespeichert")

    good = make_pkg("karten-2026-09-30-1", {k: fixed(shipped[k], "a")}, shipped)
    GH.add(good["id"], json.dumps(good).encode())
    bad = make_pkg("karten-2026-09-30-2", {k2: fixed(shipped[k2], "x")}, shipped)
    bad["sha256"] = "0" * 64
    GH.add(bad["id"], json.dumps(bad).encode())
    GH.add("karten-2026-09-30-3", b"{kaputt", digest=False)
    GH.releases.append({"tag_name": "v0.5.0", "assets": []})  # komplettes Release: nicht beachten

    cu_mod.async_setup_card_updates(hass)
    cu = hass.data["casora"]["card_updates"]
    ws = {}

    class Conn:
        def send_result(self, mid, res):
            ws[mid] = ("ok", res)

        def send_error(self, mid, code, text):
            ws[mid] = ("err", code, text)

    asyncio.run(cu_mod.ws_list(hass, Conn(), {"id": 1, "refresh": True}))
    kind, ovw = ws[1]
    check(GH.headers and "Authorization" not in GH.headers[0] and GH.headers[0].get("User-Agent", "").startswith("Casora/"),
          f"anonym mit User-Agent erwartet: {GH.headers[:1]}")
    ids = {p["id"]: p for p in ovw["available"]}
    check(set(ids) == {good["id"], bad["id"], "karten-2026-09-30-3"}, f"verfügbar: {sorted(ids)}")
    check(ids[good["id"]]["applicable"] and ids[good["id"]]["items"] == [
        {"name": k, "notes": f"Fix für {k}", "state": "neu"}], f"gutes Paket: {ids[good['id']]}")
    check(not ids[bad["id"]]["applicable"] and "Prüfsumme" in ids[bad["id"]]["reason"], "kaputte sha angeboten")
    check(not ids["karten-2026-09-30-3"]["applicable"], "kaputtes JSON angeboten")
    check(ovw["enabled"] and ovw["auto"] is False and ovw["applied"] == [] and ovw["active"] == [], f"Übersicht: {ovw}")

    asyncio.run(cu_mod.ws_apply(hass, Conn(), {"id": bad["id"]}))
    check(ws[bad["id"]][0] == "err", "kaputtes Paket angenommen")
    asyncio.run(cu_mod.ws_apply(hass, Conn(), {"id": good["id"]}))
    res = ws[good["id"]]
    check(res[0] == "ok" and res[1] == {"id": good["id"], "applied": [k], "skipped": [], "dashboards": 1},
          f"Annehmen: {res}")
    t = dashes["haus"].cfg["button_card_templates"]
    check(t[k]["variables"].get("casora_fix") == "a", "Dashboard hat den Fix nicht")
    check(t[k2] == desk["button_card_templates"][k2], "andere Vorlage verändert")
    check(dashes["haus"].cfg[tp.FINGERPRINT_KEY][k] == tp.template_print(t[k], k), "Fingerabdruck nicht nachgeführt")
    check(dashes["fremd"].saves == 0, "fremdes Dashboard angefasst")
    check([s[2] for s in vaht.SNAPS] == ["initial", "save"], f"Stände: {vaht.SNAPS}")
    check(os.path.exists(cp.overlay_path(tmp)), "Überlagerung nicht geschrieben")
    asyncio.run(cu_mod.ws_apply(hass, Conn(), {"id": good["id"]}))
    check(ws[good["id"]][0] == "err", "zweimal angenommen")

    asyncio.run(cu_mod.ws_list(hass, Conn(), {"id": 2, "refresh": False}))
    ovw = ws[2][1]
    check([a["id"] for a in ovw["applied"]] == [good["id"]] and ovw["applied"][0]["dashboards"] == 1,
          f"Verlauf: {ovw['applied']}")
    check(good["id"] not in {p["id"] for p in ovw["available"]} and ovw["active"] == [k], "Übersicht nach Annehmen")

    print("   auto")
    asyncio.run(cu_mod.ws_settings(hass, Conn(), {"id": 3, "auto": True}))
    check(ws[3][1] == {"auto": True}, "auto nicht gesetzt")
    later = make_pkg("karten-2026-10-01-1", {k2: fixed(shipped[k2], "auto")}, shipped,
                     published="2026-10-01T00:00:00+00:00")
    GH.add(later["id"], json.dumps(later).encode())
    n_dl = GH.downloads
    asyncio.run(cu.async_check())
    check(GH.downloads == n_dl + 1, f"schon geladene Pakete erneut geladen ({GH.downloads - n_dl})")
    t = dashes["haus"].cfg["button_card_templates"]
    check(t[k2]["variables"].get("casora_fix") == "auto" and t[k]["variables"].get("casora_fix") == "a",
          "auto hat nicht angenommen")
    check(dashes["haus"].saves == 2, f"Speichern: {dashes['haus'].saves}")

    print("   komplettes Update enthält den Fix → Überlagerung wird aufgeräumt")
    new_bundle = copy.deepcopy(bundle)
    new_bundle["templates"][k] = fixed(shipped[k], "a")
    new_bundle["templates"][k2] = fixed(shipped[k2], "release")
    with open(os.path.join(tmp, templates_mod.BUNDLE), "w", encoding="utf-8") as fh:
        json.dump(new_bundle, fh)
    asyncio.run(cu.async_prune())
    check(cp.read_overlay(tmp)["templates"] == {}, "Überlagerung nicht aufgeräumt")
    asyncio.run(tr.async_refresh_dashboards(hass))
    t = dashes["haus"].cfg["button_card_templates"]
    check(t[k2]["variables"].get("casora_fix") == "release", "ausgelieferte Fassung kommt nicht an")
    asyncio.run(cu_mod.ws_list(hass, Conn(), {"id": 4, "refresh": False}))
    check(not [p for p in ws[4][1]["available"] if p["applicable"]], "enthaltene Pakete noch angeboten")


def part5(tmp: str) -> None:
    print("5) tools/build-card-update.py mit echter Änderung seit dem letzten Release")
    tags = subprocess.run(["git", "-C", ROOT, "tag", "-l", "v*", "--sort=-v:refname"],
                          capture_output=True, text=True).stdout.split()
    if not tags:
        print("   übersprungen: kein Release-Tag")
        return
    old = json.loads(subprocess.run(["git", "-C", ROOT, "show", f"{tags[0]}:custom_components/casora/panel/casora-templates.json"],
                                    capture_output=True, text=True, check=True).stdout)["templates"]
    new = vat.load(os.path.join(ROOT, "dashboards/casora/button_card_templates.json"))
    changed = sorted(k for k in new if k in old and cp.template_hash(new[k]) != cp.template_hash(old[k]))
    if not changed:
        print("   übersprungen: keine Vorlage seit", tags[0], "geändert")
        return
    name = "casora_waschmaschine" if "casora_waschmaschine" in changed else changed[0]
    out = os.path.join(tmp, "pakete")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/build-card-update.py"), "--ref", tags[0],
                        "--only", name, "--note", f"{name}=Test", "--out", out, "--probe"],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    check(r.returncode == 0, f"Werkzeug: {r.stderr or r.stdout}")
    files = [f for f in os.listdir(out) if f.endswith(".json")] if os.path.isdir(out) else []
    check(len(files) == 1 and "Probebau" in r.stdout and "gh release" not in r.stdout, f"Paket fehlt oder Befehl im Probebau: {files}")
    if not files:
        return
    pkg = vat.load(os.path.join(out, files[0]))
    check(rejects(pkg, old, tags[0].lstrip("v")) is None, "Casora lehnt das gebaute Paket ab")
    ov, taken, _s = cp.merge_package({}, pkg, old)
    eff, _a = cp.effective_templates(old, ov)
    check(taken == [name] and eff[name] == new[name], "Paket bringt nicht die neue Fassung")
    print(f"   {files[0]}: {name}")


def main() -> int:
    bundle = vat.load(os.path.join(PKG, "panel/casora-templates.json"))
    shipped = bundle["templates"]
    part1(shipped)
    part2(shipped)
    tmp = tempfile.mkdtemp()
    try:
        os.makedirs(os.path.join(tmp, "custom_components/casora/panel"))
        shutil.copy(os.path.join(PKG, "panel/casora-templates.json"), os.path.join(tmp, templates_mod.BUNDLE))
        part3(tmp, bundle)
        part4(tmp, bundle)
        part5(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("OK" if not FAILS else f"{len(FAILS)} Fehler")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
