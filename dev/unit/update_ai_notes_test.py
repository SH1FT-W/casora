"""AI update check gets release notes for every update, fetched server-side (update_notes.py, ki.py).

  uv run --python 3.14 --with homeassistant python dev/unit/update_ai_notes_test.py
  (or "$(tools/ha-venv.sh install)/bin/python" dev/unit/update_ai_notes_test.py)

@ha-venv: needs the real homeassistant package (update's DATA_COMPONENT, UpdateEntityFeature).

Before: only Casora's own update got notes; the AI had to web_fetch all others, could not, and answered
"unknown" for every update. Invented updates here, a local aiohttp server plays GitHub's API and a
maker's changelog page:
- app/add-on with its own full changelog (UpdateEntity.async_release_notes) → only the new versions
- HACS-like repo with a github.com release_url → GitHub API, all releases after the installed one
- firmware with a changelog page as release_url → page text from the new version down
- firmware with only release_summary → the summary
- nothing at all → empty, and ki/update.yaml tells the AI to judge from the version jump
- large pages are read beyond the first chunk; pages without the version, binary and JSON are no notes
- GitHub rate limit: summary only, retried later; results are cached per entity + version (no second
  request); which updates get notes follows the
  "todo" rule of ki/update.yaml
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import aiohttp  # noqa: E402
import jinja2  # noqa: E402
import yaml  # noqa: E402
from aiohttp import web  # noqa: E402
from homeassistant.components.update import DATA_COMPONENT  # noqa: E402

from custom_components.casora import ki, update_notes, update_source  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


GH = [
    {"tag_name": "v2.0.0", "body": "- **Breaking:** option `size` removed", "draft": False},
    {"tag_name": "v1.9.0", "body": "- New colour picker", "draft": False},
    {"tag_name": "v1.8.0", "body": "- INSTALLED VERSION TEXT", "draft": False},
    {"tag_name": "v1.7.0", "body": "- older", "draft": False},
    {"tag_name": "v2.1.0", "body": "- draft", "draft": True},
]
PAGE = """<html><head><style>.x{}</style><script>var a=1;</script></head><body><nav>Menu</nav>
<h2>1.7.6</h2><ul><li>Fix: relay state after reboot</li></ul>
<h2>1.7.5</h2><ul><li>OLD PAGE ENTRY</li></ul></body></html>"""
ADDON_LOG = "# Changelog\n\n## 3.2.0\n- Config option `port` renamed to `listen_port`\n\n## 3.1.1\n- Fix\n\n## 3.1.0\n- ADDON OLD\n"
BIG = ("<html><body>" + "<p>filler line about other things</p>" * 20000
       + "<h2>5.0.1</h2><ul><li>Late entry fix</li></ul><h2>5.0.0</h2><p>old</p></body></html>")
SOFT = "<html><body><nav>Menu</nav><p>We use cookies. Accept all?</p></body></html>"
HITS = {"gh": 0, "page": 0}
GH_MODE = {"now": "ok"}


class Ent:
    def __init__(self, features, notes=None):
        self.supported_features = features
        self.available = True
        self._notes = notes

    async def async_release_notes(self):
        return self._notes


class Comp:
    def __init__(self, ents):
        self.ents = ents

    def get_entity(self, eid):
        return self.ents.get(eid)


def st(eid, frm, to, url=None, summary=None, state="on"):
    return SimpleNamespace(entity_id=eid, state=state, attributes={
        "installed_version": frm, "latest_version": to, "release_url": url, "release_summary": summary,
        "friendly_name": eid})


class States:
    def __init__(self, items):
        self.items = {s.entity_id: s for s in items}

    def get(self, eid):
        return self.items.get(eid)

    def async_all(self, domain=None):
        return [s for s in self.items.values() if domain is None or s.entity_id.startswith(domain + ".")]


async def main():
    async def gh(request):
        HITS["gh"] += 1
        if GH_MODE["now"] == "limit":
            return web.json_response({"message": "API rate limit exceeded"}, status=429, headers={"Retry-After": "1"})
        return web.json_response(GH)

    async def other(request):
        name = request.match_info["name"]
        if name == "big":
            return web.Response(text=BIG, content_type="text/html")
        if name == "soft":
            return web.Response(text=SOFT, content_type="text/html")
        if name == "nohead":
            return web.Response(text="<html><head><title>x</title><body><nav>Menu<h2>7.1.0</h2><ul><li>Fixes pairing</li></ul>",
                                content_type="text/html")
        if name == "charset":
            return web.Response(body="<h2>7.1.0</h2><p>Unusual charset ok</p>".encode(),
                                headers={"Content-Type": "text/html; charset=utf8mb4"})
        if name == "bin":
            return web.Response(body=b"\x00\x01 9.9.9 \xff", content_type="application/octet-stream")
        return web.Response(text='{"version": "9.9.9"}', content_type="application/json")

    async def page(request):
        HITS["page"] += 1
        return web.Response(text=PAGE, content_type="text/html")

    app = web.Application()
    app.router.add_get("/repos/acme/widget-card/releases", gh)
    app.router.add_get("/changelog", page)
    app.router.add_get("/repos/acme/limited/releases", gh)
    app.router.add_get("/p/{name}", other)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    session = aiohttp.ClientSession()
    update_source.async_get_clientsession = lambda hass: session
    update_notes.async_get_clientsession = lambda hass: session
    update_source.GITHUB_REPOS = f"http://127.0.0.1:{port}/repos/"

    states = States([
        st("update.addon_x", "3.1.0", "3.2.0"),
        st("update.widget_card", "v1.8.0", "v2.0.0", url="https://github.com/acme/widget-card/releases/tag/v2.0.0"),
        st("update.lamp_firmware", "1.7.5", "1.7.6", url=f"http://127.0.0.1:{port}/changelog"),
        st("update.sensor_fw", "4352", "4353", summary="Improves <b>battery</b> life"),
        st("update.plain_fw", "1.0", "1.1"),
        st("update.big_page", "5.0.0", "5.0.1", url=f"http://127.0.0.1:{port}/p/big"),
        st("update.soft_page", "2.0", "2.1", url=f"http://127.0.0.1:{port}/p/soft"),
        st("update.nohead_page", "7.0.0", "7.1.0", url=f"http://127.0.0.1:{port}/p/nohead"),
        st("update.charset_page", "7.0.0", "7.1.0", url=f"http://127.0.0.1:{port}/p/charset", summary="Sum"),
        st("update.bin_page", "9.9.8", "9.9.9", url=f"http://127.0.0.1:{port}/p/bin"),
        st("update.json_page", "9.9.8", "9.9.9", url=f"http://127.0.0.1:{port}/p/json"),
        st("update.limited", "v1.8.0", "v2.0.0", url="https://github.com/acme/limited/releases/tag/v2.0.0",
           summary="Short summary"),
        st("sensor.casora_update_ki_analyse", "", ""),
    ])
    async def executor(fn, *args):
        return fn(*args)
    hass = SimpleNamespace(states=states, config=SimpleNamespace(language="en"), async_add_executor_job=executor,
                           data={DATA_COMPONENT: Comp({"update.addon_x": Ent(29, ADDON_LOG),
                                                       "update.widget_card": Ent(7, None)})})
    runs: list[dict] = []
    r = ki.KiRunner.__new__(ki.KiRunner)
    r.hass, r.entry = hass, SimpleNamespace(options={})
    r._no_ai = lambda *a, **k: False

    async def fake_run(name, variables):
        runs.append(variables)
    r._run = fake_run
    ki._sensor_of = lambda hass, key: "sensor.casora_update_ki_analyse"
    ki.ai_entity = lambda *a, **k: "ai_task.test"

    async def notes_of(eid):
        await r._run_update(eid)
        return ((runs[-1].get("release_notes") or {}).get(eid) or {})

    try:
        n = await notes_of("update.addon_x")
        t = n.get("text", "")
        check("app: entity's own changelog passed to the AI", "listen_port" in t and "3.1.1" in t, repr(n))
        check("app: older versions cut off", "ADDON OLD" not in t, t)

        n = await notes_of("update.widget_card")
        t = n.get("text", "")
        check("GitHub repo: releases after the installed one", "size` removed" in t and "colour picker" in t, repr(n))
        check("GitHub repo: installed, older and draft releases left out",
              "INSTALLED VERSION" not in t and "older" not in t and "draft" not in t, t)
        check("GitHub repo: source named", "acme/widget-card" in n.get("source", ""), repr(n))

        n = await notes_of("update.lamp_firmware")
        t = n.get("text", "")
        check("changelog page: text of the new version", "relay state after reboot" in t, repr(n))
        check("changelog page: no markup/script, older entry cut", "<" not in t and "var a" not in t
              and "OLD PAGE ENTRY" not in t, t)

        n = await notes_of("update.sensor_fw")
        check("only release_summary: summary as notes", n.get("text") == "Improves battery life", repr(n))

        n = await notes_of("update.plain_fw")
        check("nothing obtainable: empty text", n.get("text", "x") == "", repr(n))

        before = dict(HITS)
        await notes_of("update.widget_card")
        await notes_of("update.lamp_firmware")
        check("cache: no second request for the same version", HITS == before, f"{before} -> {HITS}")

        n = await notes_of("update.big_page")
        check("large page: read beyond the first chunk", "Late entry fix" in n.get("text", ""), repr(n)[:200])
        n = await notes_of("update.soft_page")
        check("page without the version (menu, cookies) is no release note", n.get("text", "x") == "", repr(n))
        n = await notes_of("update.nohead_page")
        check("page without </head> and with an unclosed <nav> still read", "Fixes pairing" in n.get("text", ""), repr(n))
        n = await notes_of("update.charset_page")
        check("unknown charset: decoded as UTF-8, summary kept", "Unusual charset ok" in n.get("text", "")
              and n.get("text", "").startswith("Sum"), repr(n))
        n = await notes_of("update.bin_page")
        check("binary page ignored", n.get("text", "x") == "", repr(n))
        n = await notes_of("update.json_page")
        check("JSON page ignored", n.get("text", "x") == "", repr(n))

        GH_MODE["now"] = "limit"
        n = await notes_of("update.limited")
        check("GitHub limit: summary only, marked partial", n.get("text") == "Short summary" and n.get("partial"), repr(n))
        # the 429 paused GitHub requests: lift the pause and let the cache entry age
        hass.data.get("casora", {}).pop("gh_paused_until", None)
        GH_MODE["now"] = "ok"
        key = "update.limited|v1.8.0|v2.0.0"
        c = hass.data["casora"]["update_ai_notes"]
        c[key] = (c[key][0] - update_notes.NEGATIVE_TTL_S - 1, c[key][1])
        n = await notes_of("update.limited")
        check("partial result is fetched again later", "size` removed" in n.get("text", "") and not n.get("partial"), repr(n))
        check("summary + GitHub: newest release kept whole", n.get("text", "").startswith("Short summary")
              and n.get("text", "").rstrip().endswith("option `size` removed"), repr(n))

        # The instructions in ki/update.yaml read the entity's notes (and take the "no notes" branch otherwise).
        with open(os.path.join(ROOT, "custom_components/casora/ki/update.yaml"), encoding="utf-8") as fh:
            seq = yaml.safe_load(fh)
        rep = next(s["repeat"]["sequence"] for s in seq if "repeat" in s)
        check("update.yaml: no notes variable (HA would parse JSON-like notes)",
              not any("notizen" in (s.get("variables") or {}) for s in rep))
        env = jinja2.Environment()
        notes = {"update.lamp_firmware": {"text": '{"a": 1} relay state', "source": "x"}}
        tpl = next(s for s in rep if s.get("action") == "casora.ai_generate")["data"]["instructions"]
        out = env.from_string(tpl).render(release_notes=notes, eid="update.lamp_firmware")
        check("update.yaml: instructions carry the entity's notes", '{"a": 1} relay state' in out
              and "Werte sie aus" in out, out[:400])
        out = env.from_string(tpl).render(release_notes={}, eid="update.lamp_firmware")
        check("update.yaml: without notes the version-jump branch", "keine gefunden" in out and "Versionssprung" in out)
        instr = tpl
        check("update.yaml: without notes judge by version jump, no plain unknown",
              "Versionssprung" in instr and "unknown: nur wenn" in instr, instr[-800:])

        # Which updates get notes: same rule as update.yaml's todo.
        now = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
        sts = [st("update.a", "1", "2"), st("update.b", "1", "2"), st("update.c", "1", "2"),
               st("update.d", "1", "2"), st("update.e", "1", "2", state="off")]
        ana = [{"id": "update.a", "to": "2", "status": "done", "checked": (now - timedelta(days=3)).isoformat()},
               {"id": "update.b", "to": "1.5", "status": "done", "checked": now.isoformat()},
               {"id": "update.c", "to": "2", "status": "error", "checked": (now - timedelta(hours=7)).isoformat()}]
        check("todo: done skipped, new version/old error again, max 3",
              update_notes.todo_entities(sts, ana, "", now) == ["update.b", "update.c", "update.d"],
              update_notes.todo_entities(sts, ana, "", now))
        check("todo: requested one only if on", update_notes.todo_entities(sts, ana, "update.e", now) == []
              and update_notes.todo_entities(sts, ana, "update.a", now) == ["update.a"])
    finally:
        await session.close()
        await runner.cleanup()


# Pure helpers
check("github_repo: tag URL", update_notes.github_repo("https://github.com/o/r/releases/tag/v1") == "o/r")
check("github_repo: HACS style URL", update_notes.github_repo("https://github.com/o/r-x/releases/1.0") == "o/r-x")
check("github_repo: .git suffix", update_notes.github_repo("https://github.com/o/r.git/releases") == "o/r")
check("html_text: unclosed tags stay linear", (lambda t0: (update_notes.html_text("<script" * 50000 + "<nav>x" * 50000),
      __import__("time").time() - t0)[1] < 5)(__import__("time").time()))
check("github_repo: blob is no release", update_notes.github_repo("https://github.com/o/r/blob/main/x.md") is None)
check("raw_url: blob → raw", update_notes.raw_url("https://github.com/o/r/blob/master/fw/notes.md")
      == "https://raw.githubusercontent.com/o/r/master/fw/notes.md")
check("window: HA blog post from the incompatible changes",
      update_notes.window("Intro\nBackward-incompatible changes\nX removed", "1", "2").startswith("Backward"))
check("window: unknown version → beginning", update_notes.window("abc", "1", "9") == "abc")
check("pick_github: odd tags → at least the new version's release",
      update_notes.pick_github([{"tag_name": "release-B", "body": "b"}], "release-A", "release-B") == "## release-B\nb")

asyncio.run(main())
print("\n" + ("ALL OK" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
