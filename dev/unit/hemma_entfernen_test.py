"""hemma_cleanup.py ohne laufendes HA: Status, Entfernen, Dateien übernehmen.

  uv run --python 3.14 --with homeassistant python dev/unit/hemma_entfernen_test.py

hass, Lovelace (Ressourcen, Dashboards), Config-Einträge und die WebSocket-Befehle von
HACS und Lovelace sind Attrappen; alles Dateisystem in einem temporären Ordner.
Prüft: Status erkennt Hemma, Sicherung (Zip), Ressourcen/Einträge/Dashboards entfernt,
Ordner gelöscht ohne HACS bzw. HACS-Befehl mit HACS, www/hemma bleibt (und wird nur
gelöscht, wenn nichts mehr darauf zeigt), YAML-Modus gemeldet, Kopieren ohne
Überschreiben mit Hash-Abgleich, Verweise umschreiben, und _sync_script_resources
lässt /hemma_scripts/ stehen, solange Hemma installiert ist. Dazu Hemmas Helfer-Paket
(nur Hemmas Teil raus, Eigenes bleibt, Registry-Einträge weg), Theme und das Kopieren
nach www/casora vor dem Löschen, wenn nie umgezogen wurde.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import zipfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import custom_components.casora as casora_init  # noqa: E402
from custom_components.casora import hemma_cleanup as hc  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data if isinstance(data, bytes) else data.encode())


class Resources:
    def __init__(self, urls):
        self.items = [{"id": str(i), "url": u, "type": "module"} for i, u in enumerate(urls)]
        self.loaded = True

    async def async_load(self):
        pass

    def async_items(self):
        return list(self.items)

    async def async_delete_item(self, rid):
        self.items = [i for i in self.items if i["id"] != rid]

    async def async_update_item(self, rid, data):
        for i in self.items:
            if i["id"] == rid:
                i.update(data)

    async def async_create_item(self, data):
        self.items.append({"id": str(len(self.items) + 100), "url": data["url"], "type": data["res_type"]})


class YamlResources:
    def __init__(self, urls):
        self.items = [{"id": str(i), "url": u} for i, u in enumerate(urls)]

    def async_items(self):
        return list(self.items)


class Dash:
    def __init__(self, url, cfg, mode="storage"):
        self.mode = mode
        self.config = {"id": "id_" + url, "url_path": url, "title": url.title()}
        self.cfg = cfg
        self.saved = None

    async def async_load(self, force):
        return self.cfg

    async def async_save(self, cfg):
        self.cfg = cfg
        self.saved = cfg


class Entries:
    def __init__(self, entries):
        self.entries = entries
        self.removed = []

    def async_entries(self, domain):
        return [e for e in self.entries if e.domain == domain]

    async def async_remove(self, entry_id):
        self.removed.append(entry_id)
        self.entries = [e for e in self.entries if e.entry_id != entry_id]


def make_hass(tmp, resources, dashboards, entries, hacs_installed=False):
    async def exe(fn, *a):
        return fn(*a)

    lov = SimpleNamespace(resources=resources, dashboards=dashboards)
    calls = []

    async def dash_delete(hass, conn, msg):
        url = next(u for u, d in list(lov.dashboards.items()) if d.config["id"] == msg["dashboard_id"])
        lov.dashboards.pop(url)
        calls.append(("dash_delete", url))
        conn.send_result(msg["id"])

    async def hacs_remove(hass, conn, msg):
        calls.append(("hacs_remove", msg["repository"]))
        import shutil
        shutil.rmtree(os.path.join(tmp, "custom_components/hemma"))
        conn.send_message({"id": msg["id"], "type": "result", "success": True, "result": {}})

    def wrapped(fn):
        # wie require_admin/async_response: functools.wraps setzt __wrapped__
        def outer(hass, conn, msg):
            raise AssertionError("Dekorierte Fassung darf nicht laufen")
        outer.__wrapped__ = fn
        return outer

    data = {"lovelace": lov, "websocket_api": {"lovelace/dashboards/delete": (wrapped(dash_delete), None)}}
    if hacs_installed:
        data["websocket_api"]["hacs/repository/remove"] = (wrapped(hacs_remove), None)
        repo = SimpleNamespace(data=SimpleNamespace(full_name="willsanderson/Hemma", installed=True, id="123", domain="hemma"))
        data["hacs"] = SimpleNamespace(repositories=SimpleNamespace(list_all=[repo]))
    async def svc(domain, service, data=None, blocking=False):
        calls.append(("service", domain, service, dict(data or {})))

    hass = SimpleNamespace(
        states=SimpleNamespace(get=lambda eid: STATES.get(eid)),
        services=SimpleNamespace(async_call=svc),
        data=data,
        config=SimpleNamespace(config_dir=tmp, path=lambda *p: os.path.join(tmp, *p)),
        config_entries=Entries(entries),
        async_add_executor_job=exe,
    )
    return hass, calls


SETTINGS = {"umzug": {"done": [{"src": "hemma-home", "target": "casora-home"}]}}


async def fake_settings(hass):
    return SETTINGS


hc.async_load_settings = fake_settings


class FakeReg:
    def __init__(self):
        self.entities = {}
        self.removed = []

    def add(self, eid, platform, uid):
        self.entities[eid] = SimpleNamespace(entity_id=eid, platform=platform, unique_id=uid)

    def async_remove(self, eid):
        self.removed.append(eid)
        self.entities.pop(eid, None)


REG = FakeReg()
STATES = {}
hc.er = SimpleNamespace(async_get=lambda hass: REG)
hc._collection = lambda hass, dom: None


class _Store:  # Merker für casora/hemma/verify (eigener Test: hemma_verify_test.py)
    async def async_save(self, data):
        pass


hc._removal_store = lambda hass: _Store()

PKG = """# packages/hemma_helpers.yaml – Hemma, dazu eigene Einträge
input_boolean:
  hemma_motion_badges:
    name: Motion Badges
    initial: on
  meine_lampe_hemma:
    name: Eigene
script:
  hemma_restart_toggle:
    sequence: []
template:
  - sensor:
      - name: Plex
        unique_id: plex_recently_added_count
        state: "0"
      - name: Eigener
        unique_id: hemma_eigener_sensor
        state: "1"
automation:
  - alias: "Hemma - Auto clear restart done state 1"
    id: hemma_auto_clear_restart_done_1
    trigger: []
    action: []
rest_command:
  x:
    url: !secret mein_url
"""

HEMMA_CFG = {"views": [{"cards": [{"template": "hemma_room", "variables": {"image": "/local/hemma/rooms/kueche.jpg?v=2"}}]}]}
SHIPPED_ICON = b"<svg>casora</svg>"


def setup_tmp(tmp):
    write(os.path.join(tmp, "custom_components/hemma/__init__.py"), "# hemma")
    write(os.path.join(tmp, "custom_components/hemma/manifest.json"), "{}")
    write(os.path.join(tmp, "www/hemma/rooms/kueche.jpg"), b"kueche")
    write(os.path.join(tmp, "www/hemma/rooms/kueche-night.jpg"), b"kueche-nacht")
    write(os.path.join(tmp, "www/hemma/rooms/bad.jpg"), b"bad-hemma")
    write(os.path.join(tmp, "www/hemma/icons/home.svg"), SHIPPED_ICON)
    write(os.path.join(tmp, "www/hemma/scripts/hemma-notify-local.js"), "js")
    write(os.path.join(tmp, "www/casora/rooms/bad.jpg"), b"bad-hemma")  # schon da, gleich
    write(os.path.join(tmp, "custom_components/casora/assets/icons/home.svg"), SHIPPED_ICON)


def entry(eid, domain="hemma"):
    return SimpleNamespace(entry_id=eid, domain=domain, title="Hemma " + eid, data={}, options={})


async def main():
    # ── Kopieren: ohne Überschreiben, Hash-Abgleich ──────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, "www/hemma/rooms/flur.jpg"), b"flur-hemma")
        write(os.path.join(tmp, "www/casora/rooms/flur.jpg"), b"flur-casora")  # anders: Konflikt
        shipped = os.path.join(tmp, "custom_components/casora/assets")
        check("noch nicht vollständig", not hc.files_complete(tmp, shipped))
        r = hc.copy_files(tmp, shipped)
        check("kopiert: Küche + Nachtbild", sorted(r["copied"]) == ["rooms/kueche-night.jpg", "rooms/kueche.jpg"])
        check("gleiche Datei nicht kopiert", r["existing"] == ["rooms/bad.jpg"])
        check("mitgelieferte Datei übersprungen", r["shipped"] == ["icons/home.svg"]
              and not os.path.exists(os.path.join(tmp, "www/casora/icons/home.svg")))
        check("Konflikt nicht überschrieben", r["conflicts"] == ["rooms/flur.jpg"]
              and open(os.path.join(tmp, "www/casora/rooms/flur.jpg"), "rb").read() == b"flur-casora")
        check("scripts/ nicht übernommen", not os.path.exists(os.path.join(tmp, "www/casora/scripts")))
        check("Raumfotos gezählt (ohne Nacht, mit vorhandenem)", r["rooms"] == 2)
        m = r["mapping"]
        check("Zuordnung", m.get("/local/hemma/rooms/kueche.jpg") == "/local/casora/rooms/kueche.jpg"
              and m.get("/local/hemma/icons/home.svg") == "/casora_assets/icons/home.svg"
              and "/local/hemma/rooms/flur.jpg" not in m and "/local/hemma/rooms/" not in m
              and m.get("/local/hemma/icons/") == "/casora_assets/icons/")
        cfg = {"views": [{"cards": [{"variables": {"image": "/local/hemma/rooms/kueche.jpg?v=3",
                                                    "image_night": "/local/hemma/rooms/kueche-night.jpg",
                                                    "other": "/local/hemma/rooms/flur.jpg",
                                                    "icon": "url('/local/hemma/icons/home.svg')"}}]}]}
        new, n = hc.rewrite_refs(cfg, m)
        v = new["views"][0]["cards"][0]["variables"]
        check("Verweise umgeschrieben (?v bleibt)", n == 3 and v["image"] == "/local/casora/rooms/kueche.jpg?v=3"
              and v["image_night"] == "/local/casora/rooms/kueche-night.jpg"
              and v["icon"] == "url('/casora_assets/icons/home.svg')")
        check("Konflikt-Verweis bleibt", v["other"] == "/local/hemma/rooms/flur.jpg")
        check("Original unverändert", cfg["views"][0]["cards"][0]["variables"]["image"].startswith("/local/hemma/"))
        r2 = hc.copy_files(tmp, shipped)
        check("zweiter Lauf kopiert nichts", r2["copied"] == [] and len(r2["existing"]) == 3)

    # ── Status + Entfernen ohne HACS ─────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        res = Resources(["/hemma_scripts/hemma-notify-local.js?v=1", "/local/hemma/scripts/smart-row.js",
                         "/casora_scripts/casora-local.js?v=1", "/hacsfiles/button-card/button-card.js",
                         "/local/hemma-local/beispiel.js?v=2"])
        casora_cfg = {"views": [{"cards": [{"template": "casora_room",
                                             "variables": {"image": "/local/hemma/rooms/kueche.jpg"}}]}]}
        dashes = {
            "hemma-home": Dash("hemma-home", HEMMA_CFG),
            "hemma-home-mobile": Dash("hemma-home-mobile", HEMMA_CFG),
            "hemma-alt": Dash("hemma-alt", HEMMA_CFG),
            "casora-home": Dash("casora-home", casora_cfg),
        }
        hass, calls = make_hass(tmp, res, dashes, [entry("e1"), entry("c1", "casora")])
        check("Hemma vorhanden", await hc.async_hemma_present(hass))
        st = await hc.async_status(hass)
        check("Status: installiert, kein HACS", st["installed"] and st["folder"] and not st["hacs"])
        check("Status: Einträge", [e["entry_id"] for e in st["entries"]] == ["e1"])
        check("Status: Ressourcen", st["resources"] == ["/hemma_scripts/hemma-notify-local.js?v=1", "/local/hemma/scripts/smart-row.js"])
        check("Status: eigenes Modul bleibt (Liste „Bleibt“)", st["own"]["resources"] == ["/local/hemma-local/beispiel.js?v=2"])
        byu = {d["url_path"]: d for d in st["dashboards"]}
        check("Status: Dashboards (Handy gehört dazu)", sorted(byu) == ["hemma-alt", "hemma-home"]
              and byu["hemma-home"]["mobile"] == "hemma-home-mobile")
        check("Status: umgezogen", byu["hemma-home"]["moved_to"] == "casora-home" and not byu["hemma-alt"]["moved_to"])
        check("Status: Dateien noch nicht vollständig", st["files"]["www_hemma"] and not st["files"]["complete"]
              and st["files"]["refs"].get("casora-home") == 1)

        # Dateien übernehmen und das Casora-Dashboard umschreiben (Original bleibt).
        mv = await hc.async_move_files(hass, ["casora-home", "hemma-home"])
        check("move_files: Casora-Dashboard umgeschrieben", mv["rewritten"] == {"casora-home": 1}
              and dashes["casora-home"].cfg["views"][0]["cards"][0]["variables"]["image"] == "/local/casora/rooms/kueche.jpg")
        check("move_files: Hemma-Dashboard unberührt", dashes["hemma-home"].saved is None)
        st = await hc.async_status(hass)
        check("Status: danach vollständig", st["files"]["complete"] and "casora-home" not in st["files"]["refs"])
        check("Löschen blockiert, solange hemma-alt bleibt",
              not hc.www_deletable(True, st["files"]["refs"], {"hemma-home", "hemma-home-mobile"}, []))

        # Standard: nur umgezogene Dashboards, www/hemma bleibt.
        out = await hc.async_remove(hass, None, keep_files=True)
        steps = {s["step"]: s for s in out["steps"]}
        check("Entfernen ok " + json.dumps(out["steps"], default=str)[:300], out["ok"] and out["restart_required"])
        zf = zipfile.ZipFile(out["backup"])
        names = zf.namelist()
        check("Sicherung: Integration + Dashboards", "custom_components/hemma/__init__.py" in names
              and "dashboards/hemma-home.json" in names and "dashboards/hemma-home-mobile.json" in names
              and "resources.json" in names and not any(n.startswith("www/") for n in names))
        check("Sicherung in casora_sicherungen", os.path.dirname(out["backup"]) == os.path.join(tmp, "casora_sicherungen"))
        check("Ressourcen entfernt, andere (auch eigenes Modul) bleiben", [i["url"] for i in res.items] == [
            "/casora_scripts/casora-local.js?v=1", "/hacsfiles/button-card/button-card.js", "/local/hemma-local/beispiel.js?v=2"])
        check("Schritt „Bleibt“ nennt das eigene Modul",
              steps["own"]["resources"] == ["/local/hemma-local/beispiel.js?v=2"])
        check("Config-Eintrag entfernt (nur hemma)", hass.config_entries.removed == ["e1"])
        check("Ordner gelöscht (ohne HACS)", steps["integration"]["via"] == "folder"
              and not os.path.exists(os.path.join(tmp, "custom_components/hemma"))
              and os.path.isdir(os.path.join(tmp, "custom_components/casora")))
        check("nur umgezogenes Dashboard (+Handy) gelöscht", sorted(dashes) == ["casora-home", "hemma-alt"]
              and ("dash_delete", "hemma-home-mobile") in calls)
        check("www/hemma bleibt", os.path.isdir(os.path.join(tmp, "www/hemma/rooms")) and steps["files"]["kept"])
        check("Hemma danach nicht mehr vorhanden", not await hc.async_hemma_present(hass))

        # Löschen gewünscht, aber hemma-alt zeigt noch darauf → bleibt, als Fehler gemeldet.
        out = await hc.async_remove(hass, [], keep_files=False)
        f = {s["step"]: s for s in out["steps"]}["files"]
        check("www/hemma bleibt, wenn noch gebraucht", f["error"] == "still_needed" and os.path.isdir(os.path.join(tmp, "www/hemma")))
        # hemma-alt mit entfernen → darf weg, Sicherung enthält www/hemma.
        out = await hc.async_remove(hass, ["hemma-alt"], keep_files=False)
        f = {s["step"]: s for s in out["steps"]}["files"]
        names = zipfile.ZipFile(out["backup"]).namelist()
        check("www/hemma gelöscht, in Sicherung", f["ok"] and not f["kept"] and not os.path.exists(os.path.join(tmp, "www/hemma"))
              and "www/hemma/rooms/kueche.jpg" in names)
        check("www/casora unberührt", os.path.isfile(os.path.join(tmp, "www/casora/rooms/kueche.jpg")))

    # ── Hemmas Paket, Theme, www/hemma ohne Umzug ────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, "packages/hemma_helpers.yaml"), PKG)
        write(os.path.join(tmp, "packages/hemma_energie.yaml"), "input_boolean:\n  hemma_eigen:\n    name: x\n")
        write(os.path.join(tmp, "themes/hemma/hemma.yaml"), "Hemma:\n  primary-color: red\n")
        res = Resources(["/local/hemma/fonts/hanken-grotesk.css", "/casora_scripts/casora-local.js?v=1"])
        REG.add("input_boolean.hemma_motion_badges", "input_boolean", "hemma_motion_badges")
        REG.add("input_boolean.meine_lampe_hemma", "input_boolean", "meine_lampe_hemma")
        REG.add("sensor.plex", "template", "plex_recently_added_count")
        REG.add("sensor.eigener", "template", "hemma_eigener_sensor")
        REG.add("automation.hemma_auto_clear_restart_done_state_1", "automation", "hemma_auto_clear_restart_done_1")
        REG.add("input_boolean.hemma_eigen", "input_boolean", "hemma_eigen")
        hass, calls = make_hass(tmp, res, {"hemma-alt": Dash("hemma-alt", HEMMA_CFG)}, [entry("e1")])
        st = await hc.async_status(hass)
        pk = {p["file"]: p for p in st["package"]}
        check("Status: Paket erkannt (nur Hemmas Teil)", list(pk) == ["packages/hemma_helpers.yaml"]
              and sorted(pk["packages/hemma_helpers.yaml"]["items"]) == ["automation.hemma_auto_clear_restart_done_1",
              "input_boolean.hemma_motion_badges", "script.hemma_restart_toggle", "template.plex_recently_added_count"]
              and not pk["packages/hemma_helpers.yaml"]["delete"])
        check("Status: Theme + Eigenes", st["themes"] == ["themes/hemma/hemma.yaml"]
              and "packages/hemma_energie.yaml" in st["own"]["files"] and "input_boolean.hemma_eigen" in st["own"]["entities"]
              and "input_boolean.hemma_motion_badges" not in st["own"]["entities"])
        check("Schrift-Ressource zählt zu Hemma", st["resources"] == ["/local/hemma/fonts/hanken-grotesk.css"])
        out = await hc.async_remove(hass, ["hemma-alt"], keep_files=False)
        steps = {s["step"]: s for s in out["steps"]}
        text = open(os.path.join(tmp, "packages/hemma_helpers.yaml")).read()
        check("Paket: Hemma-Teile raus, Eigenes + !secret bleibt", steps["helpers"]["ok"] and "hemma_motion_badges" not in text
              and "plex_recently_added_count" not in text and "hemma_restart_toggle" not in text and "hemma_auto_clear" not in text
              and "meine_lampe_hemma" in text and "hemma_eigener_sensor" in text and "!secret mein_url" in text)
        check("Eigenes Paket unberührt", os.path.isfile(os.path.join(tmp, "packages/hemma_energie.yaml")))
        check("Registry: nur Hemmas Einträge entfernt", sorted(REG.removed) == ["automation.hemma_auto_clear_restart_done_state_1",
              "input_boolean.hemma_motion_badges", "sensor.plex"])
        check("Theme entfernt", steps["theme"]["ok"] and not os.path.exists(os.path.join(tmp, "themes/hemma")))
        names = zipfile.ZipFile(out["backup"]).namelist()
        check("Sicherung: Paket-Original + Theme", "packages/hemma_helpers.yaml" in names and "themes/hemma/hemma.yaml" in names)
        check("ohne Umzug: erst nach www/casora kopiert, dann www/hemma gelöscht", steps["files"]["ok"]
              and not os.path.exists(os.path.join(tmp, "www/hemma"))
              and open(os.path.join(tmp, "www/casora/rooms/kueche.jpg"), "rb").read() == b"kueche")
        # Nur-Hemma-Paket: Datei verschwindet ganz.
        write(os.path.join(tmp, "packages/hemma_helpers.yaml"), "input_boolean:\n  hemma_motion_badges:\n    name: x\n")
        hass, calls = make_hass(tmp, Resources([]), {}, [])
        out = await hc.async_remove(hass, [], keep_files=True)
        check("reines Hemma-Paket gelöscht", not os.path.exists(os.path.join(tmp, "packages/hemma_helpers.yaml")))

    # ── HACS + YAML-Ressourcen ───────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        res = YamlResources(["/hemma_scripts/hemma-core.js"])
        dashes = {"hemma-y": Dash("hemma-y", HEMMA_CFG, mode="yaml")}
        hass, calls = make_hass(tmp, res, dashes, [entry("e1")], hacs_installed=True)
        st = await hc.async_status(hass)
        check("Status: HACS erkannt", st["hacs"] and st["hacs_repo"]["id"] == "123" and not st["resources_writable"])
        out = await hc.async_remove(hass, ["hemma-y"], keep_files=True)
        steps = {s["step"]: s for s in out["steps"]}
        check("HACS-Befehl statt Ordner löschen", ("hacs_remove", "123") in calls and steps["integration"]["via"] == "hacs"
              and steps["integration"]["ok"])
        check("YAML-Ressourcen gemeldet", not steps["resources"]["ok"] and steps["resources"]["manual"] == ["/hemma_scripts/hemma-core.js"])
        check("YAML-Dashboard gemeldet, nicht gelöscht", steps["dashboards"]["manual"] == ["hemma-y"] and "hemma-y" in dashes)
        check("Gesamt nicht ok (manuelle Schritte)", out["ok"] is False and out["restart_required"])

    # HACS nur in .storage (HACS läuft nicht): erkannt, Entfernen meldet Fehler statt Ordner zu löschen.
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, ".storage/hacs.repositories"), json.dumps(
            {"data": {"123": {"full_name": "willsanderson/Hemma", "installed": True, "id": "123"}}}))
        hass, calls = make_hass(tmp, Resources([]), {}, [])
        check("HACS aus .storage", hc.hacs_repo(hass, tmp) == {"id": "123", "full_name": "willsanderson/Hemma", "source": "storage"})
        out = await hc.async_remove(hass, [], keep_files=True)
        i = {s["step"]: s for s in out["steps"]}["integration"]
        check("ohne laufendes HACS: Fehler, Ordner bleibt", not i["ok"] and os.path.isdir(os.path.join(tmp, "custom_components/hemma")))

    # Sicherung scheitert → nichts weiter.
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, "casora_sicherungen"), "Datei statt Ordner")
        res = Resources(["/hemma_scripts/hemma-core.js"])
        hass, calls = make_hass(tmp, res, {}, [entry("e1")])
        out = await hc.async_remove(hass, [], keep_files=True)
        check("ohne Sicherung kein Schritt", not out["ok"] and len(out["steps"]) == 1 and len(res.items) == 1
              and hass.config_entries.removed == [])

    # ── Eigene Module: erkannt, nie entfernt, ohne Hemma auf ladbare Adresse ──
    check("eigenes Modul: hemma-local", hc.is_own_module("/local/hemma-local/beispiel.js?v=3"))
    check("eigenes Modul: hemma_local", hc.is_own_module("/hemma_local/beispiel.js"))
    check("eigenes Modul: in Hemmas Skript-Ordner, nicht von Hemma", hc.is_own_module("/hemma_scripts/mein-modul.js?v=1")
          and hc.is_own_module("/local/hemma/scripts/mein-modul.js"))
    check("eigenes Modul: sonst JS unter www/hemma…", hc.is_own_module("/local/hemma/eigenes/kachel.js")
          and hc.is_own_module("/local/hemma2/x.mjs"))
    check("Hemmas Skripte sind keine eigenen", not hc.is_own_module("/hemma_scripts/hemma-core.js?v=1")
          and not hc.is_own_module("/local/hemma/scripts/smart-row.js") and not hc.is_own_module("/hemma_scripts/local/01-basis.js")
          and not hc.is_own_module("/local/hemma/fonts/x.css") and not hc.is_own_module("/hacsfiles/button-card/button-card.js"))
    check("is_hemma_resource ohne eigene", hc.is_hemma_resource("/hemma_scripts/hemma-core.js")
          and not hc.is_hemma_resource("/hemma_scripts/mein-modul.js"))
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, "custom_components/hemma/scripts/mein-modul.js"), "window._hemmaMein = {};")
        write(os.path.join(tmp, "www/hemma/scripts/zweites.js"), "window._hemmaZwei = {};")
        res = Resources(["/hemma_scripts/hemma-core.js", "/hemma_scripts/mein-modul.js?v=1", "/hemma_scripts/zweites.js",
                         "/local/hemma-local/beispiel.js"])
        hass, calls = make_hass(tmp, res, {}, [entry("e1")])
        out = await hc.async_remove(hass, [], keep_files=True)
        urls = [i["url"] for i in res.items]
        own = {s["step"]: s for s in out["steps"]}["own"]
        check("Entfernen: Hemmas Skript weg, eigene bleiben registriert " + json.dumps(urls),
              "/hemma_scripts/hemma-core.js" not in urls and "/local/hemma-local/beispiel.js" in urls
              and "/local/hemma-local/mein-modul.js?v=1" in urls and "/local/hemma/scripts/zweites.js" in urls)
        check("Entfernen: Modul aus Hemmas Ordner nach www/hemma-local kopiert",
              open(os.path.join(tmp, "www/hemma-local/mein-modul.js")).read() == "window._hemmaMein = {};"
              and not os.path.exists(os.path.join(tmp, "custom_components/hemma")))
        check("Entfernen: „Bleibt“ nennt die Module", len(own["resources"]) == 3 and len(own["moved"]) == 2)

    # ── Pfade, die Automationen benutzen, bleiben in www/hemma ───────────────
    with tempfile.TemporaryDirectory() as tmp:
        setup_tmp(tmp)
        write(os.path.join(tmp, "www/hemma/snapshots/kamera_beispiel.jpg"), b"bild")
        write(os.path.join(tmp, "www/hemma/eigen/plan.png"), b"plan")
        write(os.path.join(tmp, "automations.yaml"),
              "- id: '1'\n  alias: Standbild\n  actions:\n  - action: camera.snapshot\n    target:\n      entity_id: camera.beispiel\n"
              "    data:\n      filename: /config/www/hemma/snapshots/{{ trigger.entity_id.split('.')[1] }}.jpg\n")
        write(os.path.join(tmp, "packages/plan.yaml"), "shell_command:\n  plan: cp /tmp/p.png /config/www/hemma/eigen/plan.png\n")
        t = hc.write_targets(tmp)
        check("Schreibziele: Ordner aus Vorlage, Datei aus Paket", t == {"snapshots/": ["automations.yaml"], "eigen/plan.png": ["packages/plan.yaml"]})
        shipped = os.path.join(tmp, "custom_components/casora/assets")
        r = hc.copy_files(tmp, shipped)
        check("Schreibziele nicht kopiert", not os.path.exists(os.path.join(tmp, "www/casora/snapshots"))
              and not os.path.exists(os.path.join(tmp, "www/casora/eigen/plan.png"))
              and "rooms/kueche.jpg" in r["copied"])
        check("Schreibziele gemeldet", [x["path"] for x in r["write_kept"]] == ["www/hemma/eigen/plan.png", "www/hemma/snapshots/"]
              and r["write_kept"][1]["sources"] == ["automations.yaml"])
        cfg = {"views": [{"cards": [{"variables": {"snapshot_path": "/local/hemma/snapshots/kamera_beispiel.jpg",
                                                    "image": "/local/hemma/rooms/kueche.jpg"}}]}]}
        new, n = hc.rewrite_refs(cfg, r["mapping"])
        v = new["views"][0]["cards"][0]["variables"]
        check("Pfad mit Schreib-Automation bleibt, Foto umgeschrieben", n == 1
              and v["snapshot_path"] == "/local/hemma/snapshots/kamera_beispiel.jpg" and v["image"] == "/local/casora/rooms/kueche.jpg")
        check("www/hemma gilt nicht als vollständig (bleibt)", not hc.files_complete(tmp, shipped))
        hass, _ = make_hass(tmp, Resources([]), {}, [])
        st = await hc.async_status(hass)
        check("Status nennt Schreibziele", [x["path"] for x in st["files"]["write_targets"]] == ["www/hemma/eigen/plan.png", "www/hemma/snapshots/"])
    check("Schreibziel-Teilpfade", hc._write_prefix("snapshots") == "snapshots/" and hc._write_prefix("{{ x }}.jpg") == ""
          and hc._write_prefix("a/b/c.jpg") == "a/b/c.jpg" and hc._write_prefix("a/{% if %}") == "a/")

    # ── __init__: /hemma_scripts/ bleiben, solange Hemma installiert ist ────
    with tempfile.TemporaryDirectory() as tmp:
        scripts = os.path.join(tmp, "scripts")
        write(os.path.join(scripts, "casora-local.js"), "js")
        for keep in (True, False):
            res = Resources(["/hemma_scripts/hemma-notify-local.js?v=1", "/local/hemma/scripts/hemma-notify-local.js",
                             "/local/hemma-local/beispiel.js"])
            hass, _ = make_hass(tmp, res, {}, [])
            await casora_init._sync_script_resources(hass, scripts, keep_hemma=keep)
            urls = [i["url"] for i in res.items]
            hemma_left = [u for u in urls if "hemma" in u and "hemma-local" not in u]
            if keep:
                check("Hemma installiert: Ressourcen bleiben", len(hemma_left) == 2)
            else:
                check("ohne Hemma: Ressourcen entfernt", hemma_left == [])
            check("eigenes Modul bleibt (keep=%s)" % keep, "/local/hemma-local/beispiel.js" in urls)
            check("Casora-Ressource eingetragen (keep=%s)" % keep, any(u.startswith("/casora_scripts/casora-local.js?v=") for u in urls))


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
