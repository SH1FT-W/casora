"""casora/hemma/verify ohne laufendes HA: Bestätigung nach dem Neustart.

  uv run --python 3.14 --with homeassistant python dev/unit/hemma_verify_test.py

Prüft: nie entfernt → nichts; Entfernen schreibt den Merker; im selben HA-Lauf noch
nichts (Neustart fehlt); nach dem Neustart einmal das Ergebnis (Erfolg bzw. Reste je
Art), danach nie wieder; nur gewählte/umgezogene Dashboards und www/hemma nur, wenn
es mitgehen sollte, zählen als Rest; „Rest entfernen“ setzt den Merker neu.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import hemma_cleanup as hc  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


def write(path, data="x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(data)


class Store:
    def __init__(self):
        self.data = None
        self.saves = 0

    async def async_load(self):
        return None if self.data is None else dict(self.data)

    async def async_save(self, data):
        self.data = dict(data)
        self.saves += 1


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


class Dash:
    def __init__(self, url, cfg):
        self.mode = "storage"
        self.config = {"id": "id_" + url, "url_path": url, "title": url.title()}
        self.cfg = cfg

    async def async_load(self, force):
        return self.cfg


class Entries:
    def __init__(self, entries):
        self.entries = entries

    def async_entries(self, domain):
        return [e for e in self.entries if e.domain == domain]

    async def async_remove(self, entry_id):
        self.entries = [e for e in self.entries if e.entry_id != entry_id]


SETTINGS = {"umzug": {"done": [{"src": "hemma-home", "target": "casora-home"}]}}
HEMMA_CFG = {"views": [{"cards": [{"template": "hemma_room"}]}]}
STORE = Store()


async def fake_settings(hass):
    return SETTINGS


hc.async_load_settings = fake_settings
hc._removal_store = lambda hass: STORE
hc._collection = lambda hass, dom: None
hc.er = SimpleNamespace(async_get=lambda hass: SimpleNamespace(entities={}, async_remove=lambda eid: None))


def make_hass(tmp, resources, dashboards, entries, components=()):
    async def exe(fn, *a):
        return fn(*a)

    lov = SimpleNamespace(resources=resources, dashboards=dashboards)

    async def dash_delete(hass, conn, msg):
        url = next(u for u, d in list(lov.dashboards.items()) if d.config["id"] == msg["dashboard_id"])
        lov.dashboards.pop(url)
        conn.send_result(msg["id"])

    def wrapped(fn):
        def outer(hass, conn, msg):
            raise AssertionError("Dekorierte Fassung darf nicht laufen")
        outer.__wrapped__ = fn
        return outer

    async def svc(*a, **k):
        pass

    return SimpleNamespace(
        states=SimpleNamespace(get=lambda eid: None),
        services=SimpleNamespace(async_call=svc),
        data={"lovelace": lov, "websocket_api": {"lovelace/dashboards/delete": (wrapped(dash_delete), None)}},
        config=SimpleNamespace(config_dir=tmp, path=lambda *p: os.path.join(tmp, *p), components=set(components)),
        config_entries=Entries(entries),
        async_add_executor_job=exe,
    )


def entry(eid):
    return SimpleNamespace(entry_id=eid, domain="hemma", title="Hemma " + eid, data={}, options={})


def restart():
    """Neuer HA-Lauf: andere Kennung."""
    hc.BOOT = hc.BOOT + "x"


async def main():
    # ── Nie entfernt: kein Fenster ───────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        hass = make_hass(tmp, Resources([]), {}, [])
        check("nie entfernt → nicht fällig", await hc.async_verify(hass) == {"due": False})

    # ── Erfolg ───────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        write(os.path.join(tmp, "custom_components/hemma/__init__.py"))
        res = Resources(["/hemma_scripts/hemma-notify-local.js", "/local/eigenes.js"])
        dashes = {"hemma-home": Dash("hemma-home", HEMMA_CFG), "hemma-alt": Dash("hemma-alt", HEMMA_CFG),
                  "casora-home": Dash("casora-home", {"views": []})}
        hass = make_hass(tmp, res, dashes, [entry("e1")], components={"hemma", "casora"})
        out = await hc.async_remove(hass, ["hemma-home"], keep_files=True)
        rec = STORE.data or {}
        check("Entfernen schreibt Merker", bool(rec.get("removed_at")) and rec.get("boot") == hc.BOOT
              and rec.get("verified") is False and rec.get("remove_dashboards") == ["hemma-home"]
              and rec.get("keep_files") is True and rec.get("backup", "").startswith("casora_sicherungen/hemma_entfernt_"))
        check("Entfernen ok", out["ok"])
        v = await hc.async_verify(hass)
        check("selber HA-Lauf → noch nicht fällig", v == {"due": False, "restart_pending": True} and STORE.data["verified"] is False)
        restart()
        hass.config.components.discard("hemma")
        v = await hc.async_verify(hass)
        check("nach Neustart: fällig und ok", v["due"] and v["ok"] and v["leftovers"] == [])
        check("Sicherungspfad im Ergebnis", v["backup"] == rec["backup"])
        check("nicht gewähltes, nicht umgezogenes Dashboard ist kein Rest", "hemma-alt" in hass.data["lovelace"].dashboards)
        check("Merker: verified + ok", STORE.data["verified"] is True and STORE.data["ok"] is True)
        check("zweiter Aufruf → nicht mehr fällig", await hc.async_verify(hass) == {"due": False})

    # ── Reste ────────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        write(os.path.join(tmp, "www/hemma/rooms/kueche.jpg"))
        write(os.path.join(tmp, "www/casora/rooms/kueche.jpg"))
        res = Resources([])
        dashes = {"hemma-home": Dash("hemma-home", HEMMA_CFG), "hemma-alt": Dash("hemma-alt", HEMMA_CFG),
                  "casora-home": Dash("casora-home", {"views": []})}
        hass = make_hass(tmp, res, dashes, [])
        STORE.data = {"removed_at": "2026-10-03T10:00:00+02:00", "boot": "alt", "backup": "casora_sicherungen/x.zip",
                      "remove_dashboards": [], "keep_files": False, "verified": False}
        # Nach dem Neustart wieder da: Ordner, Ressource, Eintrag, noch geladen, Theme.
        write(os.path.join(tmp, "custom_components/hemma/manifest.json"), "{}")
        write(os.path.join(tmp, "themes/hemma/hemma.yaml"), "Hemma:\n  primary-color: red\n")
        res.items.append({"id": "9", "url": "/local/hemma/scripts/hemma-notify-local.js", "type": "module"})
        hass.config_entries.entries.append(entry("e2"))
        hass.config.components.add("hemma")
        v = await hc.async_verify(hass)
        kinds = [x["kind"] for x in v["leftovers"]]
        check("Reste: fällig, nicht ok", v["due"] and not v["ok"])
        check("Reste je Art", kinds == ["loaded", "entries", "folder", "resources", "dashboards", "themes", "files"])
        check("umgezogenes Dashboard zählt, anderes nicht", v["remove_dashboards"] == ["hemma-home"]
              and next(x for x in v["leftovers"] if x["kind"] == "dashboards")["items"] == ["Hemma-Home"])
        check("keep_files aus dem Merker", v["keep_files"] is False)
        check("Merker: Reste notiert", STORE.data["verified"] and STORE.data["leftovers"] == kinds)
        check("danach nicht mehr fällig", (await hc.async_verify(hass))["due"] is False)
        # „Rest entfernen“ = dasselbe Entfernen → neuer Merker, nach dem nächsten Neustart wieder geprüft.
        out = await hc.async_remove(hass, v["remove_dashboards"], keep_files=v["keep_files"])
        check("Rest entfernen: Merker neu", STORE.data["verified"] is False and STORE.data["boot"] == hc.BOOT)
        restart()
        hass.config.components.discard("hemma")
        v = await hc.async_verify(hass)
        check("Rest entfernen ok", out["ok"])
        check("nach zweitem Neustart: alles weg", v["due"] and v["ok"])
        check("www/hemma gelöscht", not os.path.isdir(os.path.join(tmp, "www/hemma")))

    # ── www/hemma behalten gewollt → kein Rest ───────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        write(os.path.join(tmp, "www/hemma/rooms/kueche.jpg"))
        write(os.path.join(tmp, "www/casora/rooms/kueche.jpg"))
        hass = make_hass(tmp, Resources([]), {}, [])
        STORE.data = {"removed_at": "x", "boot": "alt", "keep_files": True, "verified": False}
        v = await hc.async_verify(hass)
        check("www/hemma behalten: kein Rest", v["ok"] and v["leftovers"] == [])


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
