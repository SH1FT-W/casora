"""Private room photos (images.py, assets.py) without a running HA (HACS review, hacs/default#12143).

  ~/.cache/ha-venv/2026.10.1/bin/python dev/unit/photos_private_test.py
  uv run --python 3.14 --with homeassistant python dev/unit/photos_private_test.py

Checks: views that serve user photos need auth (public assets view never serves rooms/ from the
user's folders), the photo view only serves plain image names from the private folder (then Hemma's),
the one-time move www/casora/rooms -> casora_photos (names and mtime kept, clash renamed, idempotent,
empty folders removed, www/casora kept when other files are in it), and signing: URL path + ?v= in
the claims, bound to the refresh token, reused while fresh, other URLs untouched.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import jwt  # noqa: E402
from aiohttp import web  # noqa: E402
from aiohttp.test_utils import make_mocked_request  # noqa: E402
from homeassistant.components.http.auth import DATA_SIGN_SECRET, SIGN_QUERY_PARAM  # noqa: E402

from custom_components.casora import assets as A  # noqa: E402
from custom_components.casora import images as I  # noqa: E402
from custom_components.casora.const import PHOTO_URL_BASE, PHOTOS_DIR  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)


async def _job(fn, *a):
    return fn(*a)


def hass_for(config_dir):
    return SimpleNamespace(data={}, async_add_executor_job=_job, config=SimpleNamespace(
        config_dir=config_dir, path=lambda *p: os.path.join(config_dir, *p)))


def req(path, hass, **headers):
    app = web.Application()
    app["hass"] = hass
    return make_mocked_request("GET", path, headers=headers, app=app)


# ── Auth flags ───────────────────────────────────────────────────────────────
check("photo view needs auth", I.CasoraPhotoView.requires_auth is True)
check("photo view under /api (auth middleware, authSig)", I.CasoraPhotoView.url == PHOTO_URL_BASE + "/{name}"
      and PHOTO_URL_BASE.startswith("/api/"))
check("image list/upload needs auth", I.CasoraImagesView.requires_auth is True)
check("private folder outside www", not PHOTOS_DIR.startswith("www") and I.ROOMS_DIR == PHOTOS_DIR)


async def main():
    # ── Public assets: rooms/ only shipped ───────────────────────────────────
    with tempfile.TemporaryDirectory() as d:
        shipped = os.path.join(d, "assets")
        write(os.path.join(shipped, "rooms/home-demo.jpg"), b"\xff\xd8\xffdemo")
        write(os.path.join(d, "www/casora/rooms/kueche.jpg"), b"\xff\xd8\xffown")
        write(os.path.join(d, "www/hemma/rooms/flur.jpg"), b"\xff\xd8\xffhemma")
        hass = hass_for(d)
        av = A.CasoraAssetsView(shipped)
        check("public: shipped demo photo", (await av.get(req("/casora_assets/rooms/home-demo.jpg", hass), "rooms/home-demo.jpg")).status == 200)
        for p in ("rooms/kueche.jpg", "rooms/flur.jpg", "./rooms/kueche.jpg", "x/../rooms/flur.jpg", "ROOMS/kueche.jpg"):
            r = await av.get(req("/casora_assets/" + p, hass), p)
            check(f"public: no user photo for {p}", r.status == 404, r.status)

    # ── Photo view ───────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as d:
        write(os.path.join(d, PHOTOS_DIR, "kueche-3fa9c2d1e0b4.jpg"), b"\xff\xd8\xffown")
        write(os.path.join(d, "www/hemma/rooms/flur.jpg"), b"\xff\xd8\xffhemma")
        write(os.path.join(d, PHOTOS_DIR, "notes.txt"), b"text")
        write(os.path.join(d, "secret.jpg"), b"\xff\xd8\xffsecret")
        check("file: own photo", I.photo_file(d, "kueche-3fa9c2d1e0b4.jpg") == os.path.join(d, PHOTOS_DIR, "kueche-3fa9c2d1e0b4.jpg"))
        check("file: Hemma photo as fallback", I.photo_file(d, "flur.jpg") == os.path.join(d, "www/hemma/rooms/flur.jpg"))
        for bad in ("../secret.jpg", "..%2Fsecret.jpg", "notes.txt", ".hidden.jpg", "", "a/b.jpg", "a\\b.jpg"):
            check(f"file: refused {bad!r}", I.photo_file(d, bad) is None)
        hass = hass_for(d)
        pv = I.CasoraPhotoView()
        r = await pv.get(req(PHOTO_URL_BASE + "/kueche-3fa9c2d1e0b4.jpg?v=1", hass, Accept="image/jpeg"), "kueche-3fa9c2d1e0b4.jpg")
        check("view: photo served, private cache", isinstance(r, web.FileResponse)
              and r.headers.get("Cache-Control") == "private, max-age=86400", dict(r.headers))
        r = await pv.get(req(PHOTO_URL_BASE + "/kueche-3fa9c2d1e0b4.jpg", hass), "kueche-3fa9c2d1e0b4.jpg")
        check("view: without ?v= revalidate", r.headers.get("Cache-Control") == "private, no-cache")
        r = await pv.get(req(PHOTO_URL_BASE + "/fehlt.jpg", hass), "fehlt.jpg")
        check("view: unknown → 404", r.status == 404)
        listed = {i["name"]: i for i in I._all_images(hass)}
        check("list: own photo under the private route", listed["kueche-3fa9c2d1e0b4"]["day"].startswith(PHOTO_URL_BASE + "/kueche-3fa9c2d1e0b4.jpg?v="))
        check("list: Hemma photo under the private route", listed["flur"]["day"].startswith(PHOTO_URL_BASE + "/flur.jpg"))

    # ── Migration ────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as d:
        old = os.path.join(d, "www/casora/rooms")
        new = os.path.join(d, PHOTOS_DIR)
        write(os.path.join(old, "kueche.jpg"), b"kueche")
        write(os.path.join(old, "kueche-night.jpg"), b"kueche-nacht")
        write(os.path.join(old, "bad.jpg"), b"bad")
        write(os.path.join(old, "flur.jpg"), b"flur-alt")
        write(os.path.join(old, "upload.jpg.part"), b"half")
        write(os.path.join(new, "bad.jpg"), b"bad")          # same content already there
        write(os.path.join(new, "flur.jpg"), b"flur-neu")    # different: name clash
        os.utime(os.path.join(old, "kueche.jpg"), (1700000000, 1700000000))
        write(os.path.join(d, "www/casora/icons/eigene/sofa.svg"), b"<svg/>")
        res = I.migrate_old_rooms(d)
        check("move: photos moved", sorted(res["moved"]) == ["flur.jpg", "kueche-night.jpg", "kueche.jpg"], res)
        check("move: same file not duplicated", res["same"] == ["bad.jpg"])
        check("move: clash kept both", res["renamed"] == [["flur.jpg", "flur-www.jpg"]]
              and open(os.path.join(new, "flur.jpg"), "rb").read() == b"flur-neu"
              and open(os.path.join(new, "flur-www.jpg"), "rb").read() == b"flur-alt", res["renamed"])
        check("move: names and content kept", open(os.path.join(new, "kueche-night.jpg"), "rb").read() == b"kueche-nacht")
        check("move: mtime kept (?v= stays)", int(os.path.getmtime(os.path.join(new, "kueche.jpg"))) == 1700000000)
        check("move: old rooms folder gone", not os.path.exists(old) and res["removed_dir"])
        check("move: www/casora stays (icons in it)", os.path.isfile(os.path.join(d, "www/casora/icons/eigene/sofa.svg")))
        again = I.migrate_old_rooms(d)
        check("move: second run does nothing", again["moved"] == [] and again["same"] == [] and not again["failed"])
    with tempfile.TemporaryDirectory() as d:
        write(os.path.join(d, "www/casora/rooms/a.jpg"), b"a")
        I.migrate_old_rooms(d)
        check("move: empty www/casora removed", not os.path.exists(os.path.join(d, "www/casora"))
              and os.path.isdir(os.path.join(d, "www")) and os.path.isfile(os.path.join(d, PHOTOS_DIR, "a.jpg")))
        check("move: nothing to do without the folder", I.migrate_old_rooms(d)["moved"] == [])
        hass = hass_for(d)
        write(os.path.join(d, "www/casora/rooms/b.jpg"), b"b")
        res = await I.async_migrate_rooms(hass)
        check("setup step moves too", res["moved"] == ["b.jpg"])

    # ── Signing ──────────────────────────────────────────────────────────────
    hass = SimpleNamespace(data={})
    url = PHOTO_URL_BASE + "/kueche.jpg?v=1700000000"
    now = time.time()
    signed = I.sign_photo_url(hass, url, "token-a", now=now)
    path, _, query = signed.partition("?")
    params = dict(p.split("=", 1) for p in query.split("&"))
    claims = jwt.decode(params[SIGN_QUERY_PARAM], hass.data[DATA_SIGN_SECRET], algorithms=["HS256"])
    check("sign: same path", path == PHOTO_URL_BASE + "/kueche.jpg")
    check("sign: claims path + ?v= (what the middleware compares)", claims["path"] == path and claims["params"] == [["v", "1700000000"]], claims)
    check("sign: bound to the refresh token", claims["iss"] == "token-a")
    check("sign: valid a day", 86000 < claims["exp"] - claims["iat"] <= 86400, claims["exp"] - claims["iat"])
    check("sign: reused while fresh", I.sign_photo_url(hass, url, "token-a", now=now + 3600) == signed)
    check("sign: other login gets its own", I.sign_photo_url(hass, url, "token-b", now=now) != signed)
    I.sign_photo_url(hass, url, "token-a", now=now + 13 * 3600)
    exp = hass.data["casora"]["photo_sigs"][("token-a", url)][1]
    check("sign: renewed with less than 12 h left", exp == now + 13 * 3600 + 86400, exp - now)
    for other in ("/casora_assets/rooms/home-demo.jpg", None, "", "/local/casora/rooms/x.jpg"):
        check(f"sign: {other!r} unchanged", I.sign_photo_url(hass, other, "token-a") == other)
    imgs = [{"name": "kueche", "day": url, "night": PHOTO_URL_BASE + "/kueche-night.jpg?v=1"},
            {"name": "home-demo", "day": "/casora_assets/rooms/home-demo.jpg", "night": None}]
    m = I.signed_map(hass, imgs, "token-a")
    check("map: own day + night, no shipped", sorted(m) == ["kueche", "kueche-night"] and SIGN_QUERY_PARAM in m["kueche"], m)
    lst = I.sign_listing(hass, imgs, "token-a")
    check("listing: own signed, shipped as is", SIGN_QUERY_PARAM in lst[0]["day"] and lst[1]["day"] == "/casora_assets/rooms/home-demo.jpg")


asyncio.run(main())
print("FEHLER:", fails) if fails else print("alle ok")
sys.exit(1 if fails else 0)
