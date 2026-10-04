"""Casora ↔ öffentliche GitHub-API (update_source.py, update.py, updates.py, card_updates.py) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/update_github_test.py

Ein aiohttp-Testserver spielt GitHubs REST-API (/repos/OWNER/casora/…); Casora bekommt
eine Session dorthin untergeschoben. Geprüft: anonym (kein Authorization, aber User-Agent),
Release-Liste, ETag → 304 ohne neuen Inhalt, Update-Entität (prüfen + installieren mit
Sicherung), Studio-Liste, Karten-Updates (Paket, Prüfsumme, fehlende Datei),
404 = still „keine Updates“ (kein Fehler, keine Warnung im Log), 403/429-Ratelimit =
„später erneut“ und bis zur Freigabe keine weitere Anfrage, HACS-Erkennung.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import sys
import tempfile
import time
import zipfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from aiohttp import web  # noqa: E402
import aiohttp  # noqa: E402

from custom_components.casora import card_updates, update, update_source, updates  # noqa: E402
from custom_components.casora.release_notes import latest_casora  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def make_zip(version: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        root = "OWNER-casora-abc123/"
        zf.writestr(root + "README.md", "x")
        zf.writestr(root + "custom_components/casora/manifest.json", json.dumps({"version": version}))
        zf.writestr(root + "custom_components/casora/__init__.py", "# neu\n")
    return buf.getvalue()


PKG_GOOD = json.dumps({"id": "karten-2026-10-01", "format": 1, "items": []}).encode()
PKG_BAD = json.dumps({"id": "karten-2026-10-02", "format": 1, "items": []}).encode()
ASSETS = {"11": PKG_GOOD, "12": PKG_BAD}
RELEASES = [
    {"tag_name": "karten-2026-10-02", "draft": False, "prerelease": False, "body": "",
     "html_url": "https://github.com/OWNER/casora/releases/tag/karten-2026-10-02",
     "assets": [{"id": 12, "name": "karten-2026-10-02.json", "size": len(PKG_BAD), "updated_at": "b",
                 "digest": "sha256:" + "0" * 64}]},
    {"tag_name": "karten-2026-10-01", "draft": False, "prerelease": False, "body": "",
     "html_url": "https://github.com/OWNER/casora/releases/tag/karten-2026-10-01",
     "assets": [{"id": 11, "name": "karten-2026-10-01.json", "size": len(PKG_GOOD), "updated_at": "a",
                 "digest": "sha256:" + hashlib.sha256(PKG_GOOD).hexdigest()}]},
    {"tag_name": "karten-leer", "draft": False, "prerelease": False, "body": "", "assets": []},
    {"tag_name": "v9.0.1", "draft": False, "prerelease": False, "body": "- **New:** public\n\n<details><summary>Deutsch</summary>\n\n- **Neu:** öffentlich\n\n</details>\n",
     "published_at": "2026-10-03T00:00:00Z", "html_url": "https://github.com/OWNER/casora/releases/tag/v9.0.1",
     "assets": []},
    {"tag_name": "v0.5.0", "draft": False, "prerelease": False, "body": "", "published_at": "2026-09-29T00:00:00Z",
     "html_url": "https://github.com/OWNER/casora/releases/tag/v0.5.0", "assets": []},
]
ETAG = '"rel-1"'

# Was der Server gerade spielt: "ok" | "404" | "403" (Limit) | "403plain" | "429"
MODE = {"now": "ok"}
SEEN: list[dict] = []


def guard(request):
    SEEN.append({"path": request.path, "auth": request.headers.get("Authorization"),
                 "ua": request.headers.get("User-Agent", ""), "inm": request.headers.get("If-None-Match"),
                 "accept": request.headers.get("Accept")})
    m = MODE["now"]
    if m == "404":
        raise web.HTTPNotFound(text='{"message":"Not Found"}', content_type="application/json")
    if m == "403":
        raise web.HTTPForbidden(text='{"message":"API rate limit exceeded for 127.0.0.1."}', content_type="application/json",
                                headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": str(int(time.time()) + 600)})
    if m == "403plain":
        raise web.HTTPForbidden(text='{"message":"Resource not accessible"}', content_type="application/json")
    if m == "429":
        raise web.HTTPTooManyRequests(text="{}", content_type="application/json", headers={"Retry-After": "120"})


async def gh_releases(request):
    guard(request)
    if request.headers.get("If-None-Match") == ETAG:
        return web.Response(status=304)
    return web.json_response(RELEASES, headers={"ETag": ETAG})


async def gh_zip(request):
    guard(request)
    if request.match_info["tag"] != "v9.0.1":
        raise web.HTTPNotFound()
    return web.Response(body=make_zip("9.0.1"), content_type="application/zip")


async def gh_asset(request):
    guard(request)
    if request.headers.get("Accept") != "application/octet-stream":
        return web.json_response({"id": request.match_info["id"]})  # wie GitHub: sonst nur Metadaten
    return web.Response(body=ASSETS[request.match_info["id"]], content_type="application/octet-stream")


class Hass:
    def __init__(self, cfg: str):
        self.data = {}
        self.config = SimpleNamespace(path=lambda *p: os.path.join(cfg, *p), config_dir=cfg, language="en")
        self.states = SimpleNamespace(get=lambda eid: None)

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


class Records(logging.Handler):
    def __init__(self):
        super().__init__(logging.DEBUG)
        self.items: list[logging.LogRecord] = []

    def emit(self, record):
        self.items.append(record)


def card_checker(hass) -> card_updates.CardUpdates:
    cu = object.__new__(card_updates.CardUpdates)
    cu.hass = hass
    cu._data = {"auto": False, "applied": [], "packages": {}, "rejected": {}}

    async def _noop(*a, **k):
        return {}

    cu._save = _noop
    cu._shipped = _noop
    return cu


async def main():
    app = web.Application()
    app.router.add_get("/repos/OWNER/casora/releases", gh_releases)
    app.router.add_get("/repos/OWNER/casora/zipball/{tag}", gh_zip)
    app.router.add_get("/repos/OWNER/casora/releases/assets/{id}", gh_asset)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]

    session = aiohttp.ClientSession()
    update_source.async_get_clientsession = lambda hass: session
    update_source.GITHUB_API = f"http://127.0.0.1:{port}/repos/OWNER/casora"
    tmp = tempfile.mkdtemp()
    hass = Hass(tmp)
    log = Records()
    logging.getLogger("custom_components.casora").addHandler(log)
    logging.getLogger("custom_components.casora").setLevel(logging.DEBUG)
    try:
        # ── Erfolg: Releases, anonym ─────────────────────────────────────
        rels = await update_source.fetch_releases(hass)
        check("Releases in GitHub-Form", [r["tag_name"] for r in rels][:4] == ["karten-2026-10-02", "karten-2026-10-01",
                                                                             "karten-leer", "v9.0.1"])
        check("latest_casora = v9.0.1 (Karten-Releases zählen nicht)", (latest_casora(rels) or {}).get("tag_name") == "v9.0.1")
        check("anonym: kein Authorization", all(s["auth"] is None for s in SEEN), repr(SEEN[-1]))
        check("User-Agent Casora/<Version>", SEEN[-1]["ua"] == f"Casora/{update.VERSION}", SEEN[-1]["ua"])
        n = len(SEEN)
        rels2 = await update_source.fetch_releases(hass)
        check("ETag: zweiter Abruf fragt mit If-None-Match, 304 → gleicher Inhalt",
              SEEN[n]["inm"] == ETAG and rels2 == rels)

        # ── Studio-Liste (updates.py) ───────────────────────────────────
        items, err = await updates._remote(hass, force=True)
        check("Studio: Einträge mit GitHub-Adresse", err is None and items[0]["version"] == "9.0.1"
              and str(items[0]["url"]).startswith("https://github.com/"), repr(items[:1]))
        check("Studio englisch: nur der englische Teil", items[0]["notes_md"] == "- **New:** public"
              and items[0]["notes_lang"] == "en", repr(items[0]["notes_md"]))
        items_de, _ = await updates._remote(hass, force=False, lang="de")
        check("Studio deutsch: Deutsch-Block (aus dem Zwischenspeicher)", items_de[0]["notes_md"] == "- **Neu:** öffentlich"
              and items_de[0]["notes_lang"] == "de", repr(items_de[0]["notes_md"]))

        # ── Update-Entität: prüfen + installieren ───────────────────────
        ent = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
        ent.async_write_ha_state = lambda: None
        await ent.async_update()
        check("Entität: neueste Version 9.0.1 mit Link", ent.latest_version == "9.0.1"
              and str(ent.release_url).endswith("/v9.0.1") and hass.data["casora"][update.DATA_LAST_ERROR] is None,
              f"{ent.latest_version} {ent.release_url}")
        check("Entität englisch: Kurzfassung und Hinweise ohne Deutsch-Block",
              ent.release_summary == "New" and "Neu" not in (await ent.async_release_notes() or ""),
              repr(ent.release_summary))
        hass.config.language = "de"
        await ent.async_update()
        check("Entität deutsch (HA-Sprache): Deutsch-Block",
              ent.release_summary == "Neu" and (await ent.async_release_notes() or "").startswith("- **Neu:**"),
              repr(ent.release_summary))
        hass.config.language = "en"
        await ent.async_update()
        issues = []
        update.ir = SimpleNamespace(async_create_issue=lambda *a, **k: issues.append(k),
                                    IssueSeverity=SimpleNamespace(WARNING="warning"))

        async def _rec(hass_, v, prev):
            hass_.data.setdefault("installs", []).append(v)

        update.async_record_install = _rec
        target = hass.config.path("custom_components", "casora")
        os.makedirs(os.path.join(target, "panel"))
        with open(os.path.join(target, "manifest.json"), "w") as fh:
            json.dump({"version": "0.5.0"}, fh)
        with open(os.path.join(target, "panel", "casora-studio.js"), "w") as fh:
            fh.write("// lader\n")
        await ent.async_install(None, False)
        with open(os.path.join(target, "manifest.json")) as fh:
            check("Installiert aus dem zipball", json.load(fh)["version"] == "9.0.1")
        check("zipball anonym geladen", SEEN[-1]["path"].endswith("/zipball/v9.0.1") and SEEN[-1]["auth"] is None)
        backups = os.listdir(hass.config.path("casora_sicherungen"))
        check("Alte Fassung gesichert", len(backups) == 1 and backups[0].endswith(".zip"), repr(backups))
        check("Neustart-Hinweis", issues and issues[0]["translation_placeholders"] == {"version": "9.0.1"})

        # ── Karten-Updates ───────────────────────────────────────────────
        cu = card_checker(hass)
        await cu._fetch({})
        d = cu._data
        check("Karten: gutes Paket geladen", "karten-2026-10-01" in d["packages"]
              and d["packages"]["karten-2026-10-01"]["_asset"] == "11:a", repr(list(d["packages"])))
        check("Karten: Anhang als octet-stream", any(s["path"].endswith("/assets/11") and s["accept"] == "application/octet-stream"
                                                     for s in SEEN))
        check("Karten: falsche Prüfsumme abgelehnt", "Prüfsumme" in d["rejected"].get("karten-2026-10-02", {}).get("reason", ""))
        check("Karten: ohne Paket-Datei abgelehnt", d["rejected"].get("karten-leer", {}).get("reason") == "Release ohne Paket-Datei")

        # ── 404: Repo (noch) nicht öffentlich → still keine Updates ───────
        MODE["now"] = "404"
        hass404 = Hass(tempfile.mkdtemp())
        log.items.clear()
        check("404: fetch_releases → []", await update_source.fetch_releases(hass404) == [])
        items, err = await updates._remote(hass404, force=True)
        check("404: Studio ohne Fehler", err is None and items == [], repr((items, err)))
        ent404 = update.CasoraUpdate(hass404, SimpleNamespace(entry_id="e4", options={}))
        await ent404.async_update()
        check("404: Entität ohne Fehler, nichts Neues", hass404.data["casora"][update.DATA_LAST_ERROR] is None
              and ent404.latest_version == ent404.installed_version)
        cu404 = card_checker(hass404)
        await cu404.async_check()
        check("404: Karten-Updates ohne Fehler", cu404._data.get("error") is None and cu404._data["packages"] == {})
        loud = [r for r in log.items if r.levelno >= logging.WARNING]
        check("404: keine Warnung/Fehler im Log", not loud, repr([r.getMessage() for r in loud]))

        # ── 403-Ratelimit: später erneut, bis zur Freigabe keine Anfrage ──
        MODE["now"] = "403"
        hrl = Hass(tempfile.mkdtemp())
        log.items.clear()
        try:
            await update_source.fetch_releases(hrl)
            check("403-Limit → rate_limited", False)
        except update_source.UpdateSourceError as err:
            check("403-Limit → rate_limited", err.code == "rate_limited", err.code)
        paused = hrl.data["casora"].get(update_source._PAUSE, 0)
        check("403-Limit: Pause bis X-RateLimit-Reset", 500 < paused - time.time() <= 600, paused - time.time())
        n = len(SEEN)
        entrl = update.CasoraUpdate(hrl, SimpleNamespace(entry_id="e5", options={}))
        await entrl.async_update()
        items, err = await updates._remote(hrl, force=True)
        curl = card_checker(hrl)
        await curl.async_check()
        check("403-Limit: während der Pause keine Anfrage", len(SEEN) == n, len(SEEN) - n)
        check("403-Limit: Entität meldet rate_limited", hrl.data["casora"][update.DATA_LAST_ERROR] == "rate_limited")
        check("403-Limit: Studio meldet rate_limited", err == "rate_limited")
        check("403-Limit: Karten „später erneut“", curl._data.get("error") == "Zu viele Anfragen – später erneut",
              repr(curl._data.get("error")))
        loud = [r for r in log.items if r.levelno >= logging.WARNING]
        check("403-Limit: keine Warnung/Fehler im Log", not loud, repr([r.getMessage() for r in loud]))
        hrl.data["casora"][update_source._PAUSE] = 0  # Freigabe erreicht
        MODE["now"] = "ok"
        check("nach der Freigabe wieder Abrufe", (latest_casora(await update_source.fetch_releases(hrl)) or {}).get("tag_name")
              == "v9.0.1")

        # ── 429 mit Retry-After, 403 ohne Limit ──────────────────────────
        MODE["now"] = "429"
        h429 = Hass(tempfile.mkdtemp())
        try:
            await update_source.fetch_releases(h429)
            check("429 → rate_limited", False)
        except update_source.UpdateSourceError as err:
            check("429 → rate_limited", err.code == "rate_limited")
        check("429: Pause aus Retry-After", 100 < h429.data["casora"][update_source._PAUSE] - time.time() <= 120)
        MODE["now"] = "403plain"
        h403 = Hass(tempfile.mkdtemp())
        try:
            await update_source.fetch_releases(h403)
            check("403 ohne Limit → forbidden, keine Pause", False)
        except update_source.UpdateSourceError as err:
            check("403 ohne Limit → forbidden, keine Pause", err.code == "forbidden"
                  and not h403.data["casora"].get(update_source._PAUSE))
        MODE["now"] = "ok"

        # ── HACS verwaltet Casora → keine eigene Update-Entität ──────────
        hh = Hass(tempfile.mkdtemp())
        added = []
        await update.async_setup_entry(hh, SimpleNamespace(entry_id="e6", options={}), lambda ents, **k: added.extend(ents))
        check("ohne HACS: eigene Update-Entität", len(added) == 1 and hh.data["casora"][update.DATA_HACS] is False)
        os.makedirs(hh.config.path(".storage"))
        with open(hh.config.path(".storage", "hacs.repositories"), "w") as fh:
            json.dump({"version": 1, "key": "hacs.repositories", "data": {
                "1": {"full_name": "someone/other", "installed": True},
                "2": {"full_name": update_source.UPDATE_REPO.lower(), "installed": True}}}, fh)
        added.clear()
        await update.async_setup_entry(hh, SimpleNamespace(entry_id="e6", options={}), lambda ents, **k: added.extend(ents))
        check("mit HACS: keine zweite Update-Entität", added == [] and hh.data["casora"][update.DATA_HACS] is True)
        with open(hh.config.path(".storage", "hacs.repositories"), "w") as fh:
            json.dump({"data": {"2": {"full_name": update_source.UPDATE_REPO, "installed": False}}}, fh)
        check("HACS kennt Casora, aber nicht installiert → selbst prüfen",
              update._read_hacs(hh.config.path(".storage", "hacs.repositories")) is False)
        with open(hh.config.path(".storage", "hacs.repositories"), "w") as fh:
            fh.write("{kaputt")
        check("kaputte HACS-Datei → selbst prüfen", update._read_hacs(hh.config.path(".storage", "hacs.repositories")) is False)
    finally:
        await session.close()
        await runner.cleanup()


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER"))
sys.exit(1 if fails else 0)
