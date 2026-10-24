"""Hemma entfernen: wann www/hemma bleibt (hemma_cleanup.py, hemma_package.py) – ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/checkup_hemma_www_test.py

Prüft:
1. Ein eigenes Modul unter /hemma_scripts/ wird auf /local/hemma/scripts/ umgestellt –
   www/hemma darf dann nicht gelöscht werden (sonst ist die Datei weg). Ebenso fremde
   Skripte in scripts/ und versteckte Dateien; .DS_Store hält nichts fest.
2. Nur tatsächlich gelöschte Dashboards geben www/hemma frei: ein YAML-Dashboard oder
   eines, dessen Löschen scheitert, zeigt weiter darauf.
3. /local/hemma/ in YAML (auch in per !include_dir_… eingebundenen Ordnern) hält www/hemma fest.
5. Hemmas Paket: scheitert eine Datei, sind die schon erledigten trotzdem gemeldet.
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
from custom_components.casora import hemma_package as pkg  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def write(path, data="x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(data)


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


class Dash:
    def __init__(self, url, cfg, mode="storage", did=True):
        self.mode = mode
        self.config = {"id": ("id_" + url) if did else None, "url_path": url, "title": url}
        self.cfg = cfg

    async def async_load(self, force):
        return self.cfg


def make_hass(tmp, resources, dashboards):
    async def exe(fn, *a):
        return fn(*a)

    lov = SimpleNamespace(resources=resources, dashboards=dashboards)

    async def dash_delete(hass, conn, msg):
        url = next(u for u, d in list(lov.dashboards.items()) if d.config["id"] == msg["dashboard_id"])
        lov.dashboards.pop(url)
        conn.send_result(msg["id"])

    def wrapped(fn):
        def outer(*a):
            raise AssertionError("Dekorierte Fassung darf nicht laufen")
        outer.__wrapped__ = fn
        return outer

    async def svc(*a, **k):
        pass

    return SimpleNamespace(
        states=SimpleNamespace(get=lambda eid: None),
        services=SimpleNamespace(async_call=svc),
        data={"lovelace": lov, "websocket_api": {"lovelace/dashboards/delete": (wrapped(dash_delete), None)}},
        config=SimpleNamespace(config_dir=tmp, path=lambda *p: os.path.join(tmp, *p)),
        config_entries=SimpleNamespace(async_entries=lambda d: [], async_remove=None),
        async_add_executor_job=exe,
    )


async def _settings(hass):
    return {}


class _Store:
    async def async_save(self, data):
        pass


hc.async_load_settings = _settings
hc.er = SimpleNamespace(async_get=lambda hass: SimpleNamespace(entities={}))
hc._collection = lambda hass, dom: None
hc._removal_store = lambda hass: _Store()

HEMMA_CFG = {"views": [{"cards": [{"template": "hemma_room", "variables": {"image": "/local/hemma/rooms/kueche.jpg"}}]}]}


def base(tmp):
    """Hemma mit einem Raumfoto, das schon gleich in www/casora liegt (Umzug erledigt)."""
    write(os.path.join(tmp, "custom_components/hemma/__init__.py"), "# hemma")
    write(os.path.join(tmp, "www/hemma/rooms/kueche.jpg"), "kueche")
    write(os.path.join(tmp, "casora_photos/kueche.jpg"), "kueche")
    write(os.path.join(tmp, "www/hemma/scripts/hemma-core.js"), "js")
    os.makedirs(os.path.join(tmp, "custom_components/casora/assets"), exist_ok=True)


def step(out, name):
    return next(s for s in out["steps"] if s["step"] == name)


async def main():
    www = "www/hemma"

    # ── 1. eigenes Modul /hemma_scripts/eigen.js → /local/hemma/scripts/eigen.js ──
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        write(os.path.join(tmp, "www/hemma/scripts/eigen.js"), "mein modul")
        res = Resources(["/hemma_scripts/hemma-core.js", "/hemma_scripts/eigen.js"])
        hass = make_hass(tmp, res, {})
        out = await hc.async_remove(hass, [], keep_files=False)
        f = step(out, "files")
        check("1: Modul umgestellt", [i["url"] for i in res.items] == ["/local/hemma/scripts/eigen.js"], res.items)
        check("1: www/hemma bleibt", f["kept"] and f.get("error") == "still_needed", f)
        check("1: Moduldatei noch da", os.path.isfile(os.path.join(tmp, www, "scripts/eigen.js")))

    # Fremdes Skript in scripts/ ohne Ressource, versteckte Datei – je für sich.
    for rel, name in (("scripts/notiz.js", "fremdes Skript"), (".eigen/geheim.txt", "versteckter Ordner"),
                      ("rooms/.notiz", "versteckte Datei")):
        with tempfile.TemporaryDirectory() as tmp:
            base(tmp)
            write(os.path.join(tmp, www, rel), "eigen")
            check(f"1: {name} gemeldet", hc.extra_files(tmp) == [rel], hc.extra_files(tmp))
            out = await hc.async_remove(make_hass(tmp, Resources([]), {}), [], keep_files=False)
            check(f"1: {name} hält www/hemma", os.path.isfile(os.path.join(tmp, www, rel)) and step(out, "files")["kept"])

    # Gegenprobe: nur Hemmas Skripte (auch Unterordner) und .DS_Store – www/hemma geht.
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        write(os.path.join(tmp, www, "scripts/local/01-basis.js"), "js")
        write(os.path.join(tmp, www, ".DS_Store"), "")
        check("1: nichts Eigenes", hc.extra_files(tmp) == [], hc.extra_files(tmp))
        out = await hc.async_remove(make_hass(tmp, Resources([]), {}), [], keep_files=False)
        check("1: www/hemma gelöscht", not os.path.isdir(os.path.join(tmp, www)) and not step(out, "files")["kept"],
              step(out, "files"))

    # ── 2. nur tatsächlich gelöschte Dashboards zählen ──
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        dashes = {"hemma-y": Dash("hemma-y", HEMMA_CFG, mode="yaml")}
        out = await hc.async_remove(make_hass(tmp, Resources([]), dashes), ["hemma-y"], keep_files=False)
        check("2: YAML-Dashboard → www/hemma bleibt", os.path.isdir(os.path.join(tmp, www))
              and step(out, "files").get("error") == "still_needed", step(out, "files"))
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        dashes = {"hemma-a": Dash("hemma-a", HEMMA_CFG, did=False)}
        out = await hc.async_remove(make_hass(tmp, Resources([]), dashes), ["hemma-a"], keep_files=False)
        check("2: Löschen gescheitert", not step(out, "dashboards")["ok"], step(out, "dashboards"))
        check("2: … www/hemma bleibt", os.path.isdir(os.path.join(tmp, www))
              and step(out, "files").get("error") == "still_needed", step(out, "files"))
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        dashes = {"hemma-a": Dash("hemma-a", HEMMA_CFG)}
        out = await hc.async_remove(make_hass(tmp, Resources([]), dashes), ["hemma-a"], keep_files=False)
        check("2: gelöscht → www/hemma geht", "hemma-a" not in dashes and not os.path.isdir(os.path.join(tmp, www)),
              step(out, "files"))

    # ── 3. /local/hemma/ in YAML, auch aus eingebundenen Ordnern ──
    with tempfile.TemporaryDirectory() as tmp:
        base(tmp)
        write(os.path.join(tmp, "configuration.yaml"),
              "automation manual: !include_dir_merge_list meine_automationen/\nscript: !include skripte/alle.yaml\n")
        write(os.path.join(tmp, "meine_automationen/licht.yaml"), "- action: notify.x\n  data:\n    data:\n"
              "      image: /local/hemma/rooms/kueche.jpg?v=1\n")
        write(os.path.join(tmp, "skripte/alle.yaml"), "a:\n  sequence:\n    - action: camera.snapshot\n"
              "      data:\n        filename: /config/www/hemma/snap/\n")
        t = hc.write_targets(tmp)
        check("3: /local/hemma/ aus Include-Ordner", t.get("rooms/kueche.jpg") == ["meine_automationen/licht.yaml"], t)
        check("3: www/hemma aus !include-Datei", t.get("snap/") == ["skripte/alle.yaml"], t)
        out = await hc.async_remove(make_hass(tmp, Resources([]), {}), [], keep_files=False)
        check("3: www/hemma bleibt", os.path.isfile(os.path.join(tmp, www, "rooms/kueche.jpg")), step(out, "files"))
        st = await hc.async_status(make_hass(tmp, Resources([]), {}))
        check("3: Status nennt es", any(x["path"] == "www/hemma/rooms/kueche.jpg" for x in st["files"]["write_targets"]))

    # ── 5. Paket: Schreibfehler bei einer Datei ──
    with tempfile.TemporaryDirectory() as tmp:
        write(os.path.join(tmp, "packages/a.yaml"), "input_boolean:\n  hemma_motion_badges:\n    name: A\n")
        write(os.path.join(tmp, "packages/b.yaml"), "input_boolean:\n  hemma_motion_badges:\n    name: B\n"
              "  meine_lampe:\n    name: Eigen\n")
        real = pkg.os.replace

        def broken(src, dst):
            raise OSError("schreibgeschützt")

        pkg.os.replace = broken
        try:
            out = {p["file"]: p for p in pkg.apply(tmp)}
        finally:
            pkg.os.replace = real
        check("5: erste Datei erledigt", out.get("packages/a.yaml", {}).get("ok") is True
              and not os.path.exists(os.path.join(tmp, "packages/a.yaml")), out)
        check("5: zweite gemeldet", out.get("packages/b.yaml", {}).get("ok") is False
              and out["packages/b.yaml"].get("io") and "schreibgeschützt" in out["packages/b.yaml"]["error"], out)


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER: {fails}"))
sys.exit(1 if fails else 0)
