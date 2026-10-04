"""template_refresh.py ohne echtes HA: HA-Module als Attrappen, Dashboards im Speicher.

  uv run --python 3.14 python dev/unit/vorlagen_auto_ha_test.py [ALT_BUNDLE.json] [DESKTOP] [MOBILE]

Prüft den Ablauf beim Start: Paar Desktop + Handy wird gemeinsam aufgefrischt, davor
und danach ein Stand (versions._snap), Hinweis fürs Studio, zweiter Start ändert
nichts, gesperrte und fremde Dashboards bleiben unangetastet, neues Bundle → neuer Lauf.
Ohne Argumente: kleines Beispiel-Dashboard (siehe vorlagen_auto_test.py).
"""

from __future__ import annotations

import asyncio
import copy
import datetime
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PKG = os.path.join(ROOT, "custom_components/casora")


class Dummy:
    """Steht für jedes HA-Objekt; als Dekorator gibt es die Funktion unverändert zurück."""

    def __call__(self, *a, **k):
        if len(a) == 1 and callable(a[0]) and not k:
            return a[0]
        return Dummy()

    def __getattr__(self, name):
        return Dummy()


class StubModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return Dummy()


def stub(name: str, **attrs) -> types.ModuleType:
    mod = sys.modules.get(name) or StubModule(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    parent, _, child = name.rpartition(".")
    if parent:
        setattr(stub(parent), child, mod)
    return mod


class FakeStore:
    saved: dict = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return copy.deepcopy(FakeStore.saved.get(self.key))

    async def async_save(self, data):
        FakeStore.saved[self.key] = copy.deepcopy(data)


for n in ("voluptuous", "aiohttp", "aiohttp.web", "homeassistant", "homeassistant.components",
          "homeassistant.components.websocket_api", "homeassistant.components.http",
          "homeassistant.core", "homeassistant.helpers", "homeassistant.helpers.start",
          "homeassistant.util", "homeassistant.util.yaml", "homeassistant.components.lovelace"):
    stub(n)
STARTED: list = []
stub("homeassistant.helpers.start", async_at_started=lambda hass, cb: STARTED.append(cb))
stub("homeassistant.helpers.storage", Store=FakeStore)
stub("homeassistant.util.dt", now=lambda: datetime.datetime.now(datetime.timezone.utc))
stub("homeassistant.components.lovelace.const", LOVELACE_DATA="lovelace_data")
stub("homeassistant.core", callback=lambda f: f, HomeAssistant=object)
stub("homeassistant.components.http", HomeAssistantView=object)

pkg = types.ModuleType("casora")
pkg.__path__ = [PKG]
sys.modules["casora"] = pkg
tr = importlib.import_module("casora.template_refresh")
versions = importlib.import_module("casora.versions")
tp = importlib.import_module("casora.template_print")

spec = importlib.util.spec_from_file_location("vat", os.path.join(ROOT, "dev/unit/vorlagen_auto_test.py"))
vat = importlib.util.module_from_spec(spec)
sys.modules["vat"] = vat
spec.loader.exec_module(vat)

SNAPS: list = []


async def fake_snap(hass, url_path, mobile_url, meta):
    SNAPS.append((url_path, mobile_url, meta["kind"], meta.get("summary", "")))
    return "v"


versions._snap = fake_snap


class Dash:
    mode = "storage"

    def __init__(self, cfg):
        self.cfg = cfg
        self.saves = 0

    async def async_load(self, force):
        return self.cfg

    async def async_save(self, cfg):
        self.cfg = cfg
        self.saves += 1


class Hass:
    def __init__(self, config_dir, dashes):
        self.data = {"lovelace_data": types.SimpleNamespace(dashboards=dashes)}
        self.config = types.SimpleNamespace(config_dir=config_dir, path=lambda *p: os.path.join(config_dir, *p))

    async def async_add_executor_job(self, fn, *a):
        return fn(*a)


FAILS: list = []


def check(ok, msg):
    if not ok:
        FAILS.append(msg)
        print("  FEHLER:", msg)


def main() -> int:
    args = sys.argv[1:]
    new_bundle = vat.load(os.path.join(PKG, "panel/casora-templates.json"))
    new = new_bundle["templates"]
    if args:
        old = vat.load(args[0])["templates"]
    else:
        old = copy.deepcopy(new)
        for i, k in enumerate(sorted(old)):
            if i % 3 == 0 and isinstance(old[k], dict):
                old[k].setdefault("variables", {})["casora_alt"] = i
    if len(args) >= 3:
        desk = vat.cfg_of(vat.load(args[1]))
        mob = vat.cfg_of(vat.load(args[2]))
    else:
        desk = vat.sample_dashboard(old, "haus")
        mob = None
    desk_saved = vat.as_saved_by(desk, old, False, None)
    edited = next(k for k in sorted(old) if k in new and tp.template_print(old[k], k) != tp.template_print(new[k], k))
    desk_saved["button_card_templates"][edited].setdefault("variables", {})["meine_aenderung"] = 1
    dashes = {"haus": Dash(desk_saved)}
    if mob is not None:
        dashes["haus-mobile"] = Dash(vat.as_saved_by(mob, old, True, tp.home_vars_of(desk)))
    # Gesperrt (von Hand erweitert) und ein fremdes Dashboard.
    dashes["dashboard-hemma"] = Dash(copy.deepcopy(desk_saved))
    dashes["fremd"] = Dash({"views": [{"cards": []}]})
    before = {u: copy.deepcopy(d.cfg) for u, d in dashes.items()}

    tmp = tempfile.mkdtemp()
    try:
        os.makedirs(os.path.join(tmp, "custom_components/casora/panel"))
        bundle_path = os.path.join(tmp, "custom_components/casora/panel/casora-templates.json")
        shutil.copy(os.path.join(PKG, "panel/casora-templates.json"), bundle_path)
        # Test-HA: nur dort greift die Sperre für dashboard-hemma.
        os.makedirs(os.path.join(tmp, tr.TEST_MARKER))
        hass = Hass(tmp, dashes)
        tr.async_setup_template_refresh(hass)
        check(len(STARTED) == 1, "kein Start-Rückruf angemeldet")

        print("1) erster Start nach Update")
        asyncio.run(STARTED[0](hass))
        check(dashes["haus"].saves == 1, "Desktop nicht gespeichert")
        if mob is not None:
            check(dashes["haus-mobile"].saves == 1, "Handy-Layout nicht gespeichert")
        check(dashes["dashboard-hemma"].saves == 0, "gesperrtes Dashboard angefasst")
        check(dashes["fremd"].saves == 0, "fremdes Dashboard angefasst")
        want_mob = "haus-mobile" if mob is not None else None
        check(SNAPS == [("haus", want_mob, "initial", ""), ("haus", want_mob, "save", tr.SUMMARY)],
              f"Stände falsch: {SNAPS}")
        t = dashes["haus"].cfg["button_card_templates"]
        check(t[edited] == desk_saved["button_card_templates"][edited], "geänderte Vorlage überschrieben")
        check(dashes["haus"].cfg["views"] == before["haus"]["views"], "Ansichten verändert")
        store = FakeStore.saved[tr.STORAGE_KEY]
        check(store.get("notice", {}).get("count") == 1 and store["notice"]["dashboards"] == ["haus"],
              f"Hinweis falsch: {store.get('notice')}")
        check(set(store["applied"]) == set(dashes) - {"fremd"}, f"applied: {sorted(store['applied'])}")
        print("   gespeichert:", {u: d.saves for u, d in dashes.items()}, "Stände:", len(SNAPS))

        print("2) zweiter Start, selbes Bundle")
        SNAPS.clear()
        n = asyncio.run(tr.async_refresh_dashboards(hass))
        check(n == 0 and not SNAPS and dashes["haus"].saves == 1, "zweiter Lauf hat etwas getan")

        print("3) Studio holt den Hinweis ab")
        got = []

        class Conn:
            def send_result(self, mid, res):
                got.append(res)

        asyncio.run(tr.ws_notice(hass, Conn(), {"id": 1, "ack": True}))
        asyncio.run(tr.ws_notice(hass, Conn(), {"id": 2, "ack": False}))
        check(got[0]["notice"]["count"] == 1 and got[1]["notice"] is None, f"Hinweis: {got}")

        print("4) neues Bundle → neuer Lauf")
        k2 = next(k for k in sorted(new) if k != edited and isinstance(new[k], dict))
        nb = copy.deepcopy(new_bundle)
        nb["templates"][k2].setdefault("variables", {})["casora_neu"] = 1
        with open(bundle_path, "w", encoding="utf-8") as fh:
            json.dump(nb, fh)
        SNAPS.clear()
        n = asyncio.run(tr.async_refresh_dashboards(hass))
        check(n == 1 and dashes["haus"].saves == 2, "neues Bundle nicht übernommen")
        check(dashes["haus"].cfg["button_card_templates"][k2]["variables"].get("casora_neu") == 1,
              "neue Vorlage fehlt")
        check(dashes["haus"].cfg["button_card_templates"][edited]
              == desk_saved["button_card_templates"][edited], "geänderte Vorlage beim 2. Update überschrieben")

        print("5) echtes HA (ohne Mock): dashboard-hemma wird normal aufgefrischt")
        shutil.rmtree(os.path.join(tmp, tr.TEST_MARKER))
        nb["templates"][k2]["variables"]["casora_neu"] = 2
        with open(bundle_path, "w", encoding="utf-8") as fh:
            json.dump(nb, fh)
        asyncio.run(tr.async_refresh_dashboards(hass))
        check(dashes["dashboard-hemma"].saves == 1, "dashboard-hemma außerhalb der Test-HAs gesperrt")
        check(dashes["fremd"].saves == 0, "fremdes Dashboard angefasst")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("OK" if not FAILS else f"{len(FAILS)} Fehler")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
