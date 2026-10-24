"""Casora ↔ öffentliche GitHub-API (update_source.py, update.py, updates.py) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/update_github_test.py

Ein aiohttp-Testserver spielt GitHubs REST-API (/repos/OWNER/casora/…); Casora bekommt
eine Session dorthin untergeschoben. Geprüft: anonym (kein Authorization, aber User-Agent),
Release-Liste, ETag → 304 ohne neuen Inhalt, Update-Entität (nur prüfen und melden, lädt
nichts herunter), Studio-Liste,
404 = still „keine Updates“ (kein Fehler, keine Warnung im Log), 403/429-Ratelimit =
„später erneut“ und bis zur Freigabe keine weitere Anfrage, HACS-Erkennung.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sys
import tempfile
import time
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from aiohttp import web  # noqa: E402
import aiohttp  # noqa: E402

from custom_components.casora import update, update_source, updates  # noqa: E402
from custom_components.casora.release_notes import latest_casora  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


PKG_GOOD = json.dumps({"id": "karten-2026-10-01", "format": 1, "items": []}).encode()
PKG_BAD = json.dumps({"id": "karten-2026-10-02", "format": 1, "items": []}).encode()
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
    {"tag_name": "v99.0.1", "draft": False, "prerelease": False, "body": "- **New:** public\n\n<details><summary>Deutsch</summary>\n\n- **Neu:** öffentlich\n\n</details>\n",
     "published_at": "2026-10-03T00:00:00Z", "html_url": "https://github.com/OWNER/casora/releases/tag/v99.0.1",
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


async def main():
    app = web.Application()
    app.router.add_get("/repos/OWNER/casora/releases", gh_releases)
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
                                                                             "karten-leer", "v99.0.1"])
        check("latest_casora = v99.0.1 (Karten-Releases zählen nicht)", (latest_casora(rels) or {}).get("tag_name") == "v99.0.1")
        check("anonym: kein Authorization", all(s["auth"] is None for s in SEEN), repr(SEEN[-1]))
        check("User-Agent Casora/<Version>", SEEN[-1]["ua"] == f"Casora/{update.VERSION}", SEEN[-1]["ua"])
        n = len(SEEN)
        rels2 = await update_source.fetch_releases(hass)
        check("ETag: zweiter Abruf fragt mit If-None-Match, 304 → gleicher Inhalt",
              SEEN[n]["inm"] == ETAG and rels2 == rels)

        # ── Studio-Liste (updates.py) ───────────────────────────────────
        items, err = await updates._remote(hass, force=True)
        check("Studio: Einträge mit GitHub-Adresse", err is None and items[0]["version"] == "99.0.1"
              and str(items[0]["url"]).startswith("https://github.com/"), repr(items[:1]))
        check("Studio englisch: nur der englische Teil", items[0]["notes_md"] == "- **New:** public"
              and items[0]["notes_lang"] == "en", repr(items[0]["notes_md"]))
        items_de, _ = await updates._remote(hass, force=False, lang="de")
        check("Studio deutsch: Deutsch-Block (aus dem Zwischenspeicher)", items_de[0]["notes_md"] == "- **Neu:** öffentlich"
              and items_de[0]["notes_lang"] == "de", repr(items_de[0]["notes_md"]))

        # ── Update-Entität: prüfen und melden ───────────────────────────
        ent = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
        ent.async_write_ha_state = lambda: None
        await ent.async_update()
        check("Entität: neueste Version 99.0.1 mit Link", ent.latest_version == "99.0.1"
              and str(ent.release_url).endswith("/v99.0.1") and hass.data["casora"][update.DATA_LAST_ERROR] is None,
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
        check("Entität lädt nichts herunter (nur die Release-Liste)",
              all(x["path"].endswith("/releases") for x in SEEN), repr({x["path"] for x in SEEN}))

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
        check("403-Limit: während der Pause keine Anfrage", len(SEEN) == n, len(SEEN) - n)
        check("403-Limit: Entität meldet rate_limited", hrl.data["casora"][update.DATA_LAST_ERROR] == "rate_limited")
        check("403-Limit: Studio meldet rate_limited", err == "rate_limited")
        loud = [r for r in log.items if r.levelno >= logging.WARNING]
        check("403-Limit: keine Warnung/Fehler im Log", not loud, repr([r.getMessage() for r in loud]))
        hrl.data["casora"][update_source._PAUSE] = 0  # Freigabe erreicht
        MODE["now"] = "ok"
        check("nach der Freigabe wieder Abrufe", (latest_casora(await update_source.fetch_releases(hrl)) or {}).get("tag_name")
              == "v99.0.1")

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
        # HACS keys the repository's device and update entity by the GitHub id (public registries,
        # no HACS storage file read).
        devices, entities = set(), {}
        real_reg = update.dr, update.er
        update.dr = SimpleNamespace(async_get=lambda h: SimpleNamespace(
            devices={i: SimpleNamespace(identifiers={i}) for i in devices}))
        update.er = SimpleNamespace(async_get=lambda h: SimpleNamespace(
            async_get_entity_id=lambda dom, plat, uid: entities.get((dom, plat, uid)),
            async_remove=lambda eid: None, entities={}))
        try:
            hh = Hass(tempfile.mkdtemp())
            added = []
            await update.async_setup_entry(hh, SimpleNamespace(entry_id="e6", options={}), lambda ents, **k: added.extend(ents))
            check("ohne HACS: eigene Update-Entität", len(added) == 1 and hh.data["casora"][update.DATA_HACS] is False)
            devices.add(("hacs", "123"))  # another repository
            check("anderes HACS-Paket → selbst prüfen", update.hacs_repo_id(hh) is None)
            devices.add(("hacs", update.UPDATE_REPO_ID))
            added.clear()
            await update.async_setup_entry(hh, SimpleNamespace(entry_id="e6", options={}), lambda ents, **k: added.extend(ents))
            check("mit HACS (Gerät): keine zweite Update-Entität", added == [] and hh.data["casora"][update.DATA_HACS] is True)
            devices.clear()
            entities[("update", "hacs", update.UPDATE_REPO_ID)] = "update.casora_update"
            check("mit HACS (nur Update-Entität) erkannt", update.hacs_repo_id(hh) == update.UPDATE_REPO_ID)
            check("keine HACS-Datei gelesen", not os.path.exists(hh.config.path(".storage")))
        finally:
            update.dr, update.er = real_reg
    finally:
        await session.close()
        await runner.cleanup()


asyncio.run(main())
print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER"))
sys.exit(1 if fails else 0)
