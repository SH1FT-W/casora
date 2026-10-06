"""Auslieferung gepackt + Cache (scripts_view.py, templates.py, assets.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/auslieferung_test.py

Skripte/Studio: Pfad-Schutz („../“), gzip nur wenn angenommen, langer Cache nur bei passendem
?v= (auch „Version.Stempel“ fürs Studio), ETag → 304, unbekannte Endung 404.
Vorlagen: gepackt, ETag, 304, private/no-cache. Assets: Cache-Control für mitgelieferte und eigene
Dateien, Raumfoto als WebP nur, wenn der Browser es annimmt.
"""

from __future__ import annotations

import asyncio
import gzip
import os
import sys
import tempfile
from types import SimpleNamespace
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from aiohttp import web  # noqa: E402
from aiohttp.test_utils import make_mocked_request  # noqa: E402

from custom_components.casora import assets as A  # noqa: E402
from custom_components.casora import scripts_view as SV  # noqa: E402
from custom_components.casora import templates as T  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


async def _job(fn, *a):
    return fn(*a)


def hass_for(config_dir):
    return SimpleNamespace(async_add_executor_job=_job, config=SimpleNamespace(
        config_dir=config_dir, path=lambda *p: os.path.join(config_dir, *p)))


def req(path, hass, **headers):
    app = web.Application()
    app["hass"] = hass
    return make_mocked_request("GET", path, headers=headers, app=app)


async def main():
    with tempfile.TemporaryDirectory() as d:
        base = os.path.join(d, "panel")
        os.makedirs(base)
        body = b"export const x = 1;\n" * 500
        with open(os.path.join(base, "a.js"), "wb") as h:
            h.write(body)
        stamp = int(os.path.getmtime(os.path.join(base, "a.js")))
        hass = hass_for(d)
        check("_under: ../ abgewiesen", SV._under(base, "../geheim.js") is None)
        check("_under: Unterordner ok", SV._under(base, "x/a.js") == os.path.join(base, "x", "a.js"))
        for View, label in ((SV.CasoraScriptsView, "Skripte"), (SV.CasoraPanelView, "Studio")):
            v = View(base)
            r = await v.get(req(f"/x/a.js?v={stamp}", hass, **{"Accept-Encoding": "gzip, br"}), "a.js")
            check(f"{label}: gzip", r.headers.get("Content-Encoding") == "gzip" and gzip.decompress(r.body) == body)
            check(f"{label}: ?v=Stempel → langer Cache", "immutable" in r.headers["Cache-Control"], r.headers["Cache-Control"])
            r2 = await v.get(req(f"/x/a.js?v=1.0.11.{stamp}", hass), "a.js")
            check(f"{label}: ?v=Version.Stempel → langer Cache, ungepackt ohne Accept-Encoding",
                  "immutable" in r2.headers["Cache-Control"] and r2.body == body and "Content-Encoding" not in r2.headers)
            r3 = await v.get(req(f"/x/a.js?v={stamp - 100}", hass), "a.js")
            check(f"{label}: alter Stempel → no-cache", r3.headers["Cache-Control"] == "no-cache", r3.headers["Cache-Control"])
            r4 = await v.get(req("/x/a.js", hass, **{"If-None-Match": r.headers["ETag"]}), "a.js")
            check(f"{label}: ETag → 304", r4.status == 304)
            for p in ("../a.js", "a.exe", "fehlt.js"):
                check(f"{label}: {p} → 404", (await v.get(req("/x/" + p, hass), p)).status == 404)

        # Vorlagen
        out = os.path.join(d, T.BUNDLE)
        os.makedirs(os.path.dirname(out))
        with open(out, "w", encoding="utf-8") as h:
            h.write('{"templates":{"a":{}}}' * 50)
        tv = T.CasoraTemplatesView()
        with mock.patch.object(T, "rebuild_if_stale", lambda _d: False):
            r = await tv.get(req("/api/casora/templates", hass, **{"Accept-Encoding": "gzip"}))
            check("Vorlagen: gepackt", r.headers.get("Content-Encoding") == "gzip" and len(r.body) < os.path.getsize(out))
            check("Vorlagen: immer nachfragen (private, no-cache)", r.headers["Cache-Control"] == "private, no-cache")
            r2 = await tv.get(req("/api/casora/templates", hass, **{"If-None-Match": r.headers["ETag"]}))
            check("Vorlagen: unverändert → 304", r2.status == 304)
            with open(out, "a", encoding="utf-8") as h:
                h.write(" ")
            r3 = await tv.get(req("/api/casora/templates", hass, **{"If-None-Match": r.headers["ETag"]}))
            check("Vorlagen: geändert → 200 mit neuem ETag", r3.status == 200 and r3.headers["ETag"] != r.headers["ETag"])

        # Assets
        shipped = os.path.join(d, "assets")
        os.makedirs(os.path.join(shipped, "rooms"))
        os.makedirs(os.path.join(d, "www/casora/rooms"))
        from PIL import Image  # noqa: PLC0415
        import random  # noqa: PLC0415

        rnd = random.Random(3)
        img = Image.new("RGB", (400, 300))
        img.putdata([(rnd.randrange(256), 90, rnd.randrange(256)) for _ in range(400 * 300)])
        img.save(os.path.join(shipped, "rooms/wohnen-demo.jpg"), quality=90)
        img.save(os.path.join(d, "www/casora/rooms/eigen.jpg"), quality=90)
        with open(os.path.join(shipped, "x.svg"), "w") as h:
            h.write("<svg/>")
        av = A.CasoraAssetsView(shipped)
        r = await av.get(req("/casora_assets/x.svg", hass), "x.svg")
        check("Assets: mitgeliefert → 1 Tag Cache", r.headers.get("Cache-Control") == A._SHIPPED_CC, dict(r.headers))
        r = await av.get(req("/casora_assets/rooms/eigen.jpg", hass, Accept="image/jpeg"), "rooms/eigen.jpg")
        check("Assets: eigenes Foto → no-cache, JPEG ohne WebP-Annahme",
              r.headers.get("Cache-Control") == "no-cache" and str(r._path).endswith(".jpg"), str(r._path))
        r = await av.get(req("/casora_assets/rooms/wohnen-demo.jpg", hass, Accept="image/avif,image/webp,*/*"), "rooms/wohnen-demo.jpg")
        check("Assets: Raumfoto als WebP, wenn angenommen", str(r._path).endswith("-d.webp") and "Accept" in r.headers.get("Vary", ""), str(r._path))
        r = await av.get(req("/casora_assets/rooms/wohnen-demo.jpg", hass, Accept="image/webp",
                             **{"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"}), "rooms/wohnen-demo.jpg")
        check("Assets: Handy bekommt eigene Fassung", str(r._path).endswith("-p.webp"), str(r._path))
        check("Assets: ../ → 404", (await av.get(req("/casora_assets/../x", hass), "../x")).status == 404)


asyncio.run(main())
print("FEHLER:", fails) if fails else print("alle ok")
sys.exit(1 if fails else 0)
