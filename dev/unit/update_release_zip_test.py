"""Release package casora.zip for the own update entity (update.py, update_source.py) without HA core.

  ~/.cache/ha-venv/<version>/bin/python dev/unit/update_release_zip_test.py

- stage_zip accepts both layouts: casora.zip (files at the zip root) and GitHub's repo archive
  ("<owner>-<repo>-<sha>/custom_components/casora/…"); path traversal is refused in both.
- download_release prefers the casora.zip asset when the release lists it, falls back to the
  repo archive when it is missing or its download fails, and does not fall back on the rate limit.
- tools/build-release-zip.py builds the root layout from a commit, byte-identical on rebuild.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import update, update_source  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def zip_of(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    return buf.getvalue()


PACKAGE = zip_of({"manifest.json": json.dumps({"version": "99.0.2"}), "panel/a.js": "// pkg\n"})
ARCHIVE = zip_of({"OWNER-casora-abc123/README.md": "x",
                  "OWNER-casora-abc123/custom_components/casora/manifest.json": json.dumps({"version": "99.0.1"}),
                  "OWNER-casora-abc123/custom_components/casora/panel/a.js": "// repo\n"})


def stage(data: bytes) -> tuple[str | None, str]:
    """Stage data into a fresh config dir → (version or error, staged dir)."""
    cfg = tempfile.mkdtemp()
    target = os.path.join(cfg, "custom_components", "casora")
    os.makedirs(target)
    with open(os.path.join(target, "manifest.json"), "w") as fh:
        json.dump({"version": "0.5.0"}, fh)
    staged = os.path.join(cfg, "casora_update_neu")
    try:
        update.stage_zip(data, target, os.path.join(cfg, "backups"), "old", staged)
    except RuntimeError as err:
        return f"error: {err}", staged
    with open(os.path.join(staged, "manifest.json")) as fh:
        return json.load(fh)["version"], staged


def test_layouts():
    ver, staged = stage(PACKAGE)
    check("package layout (files at root) staged", ver == "99.0.2"
          and open(os.path.join(staged, "panel", "a.js")).read() == "// pkg\n", ver)
    ver, staged = stage(ARCHIVE)
    check("repo archive layout staged", ver == "99.0.1" and not os.path.exists(os.path.join(staged, "README.md"))
          and open(os.path.join(staged, "panel", "a.js")).read() == "// repo\n", ver)
    ver, _ = stage(zip_of({"README.md": "x"}))
    check("zip without manifest refused", str(ver).startswith("error"), ver)
    ver, _ = stage(zip_of({"manifest.json": "{}", "../evil.py": "x"}))
    check("path traversal refused (package)", ver == "error: Ungültiger Pfad im Release", ver)
    ver, _ = stage(zip_of({"r/custom_components/casora/manifest.json": "{}",
                           "r/custom_components/casora/../../../evil.py": "x"}))
    check("path traversal refused (archive)", ver == "error: Ungültiger Pfad im Release", ver)
    ver, _ = stage(zip_of({"manifest.json": "{}", "/abs.py": "x"}))
    check("absolute path refused", ver == "error: Ungültiger Pfad im Release", ver)


REL_WITH = {"tag_name": "v99.0.2", "assets": [{"id": 7, "name": "other.zip"}, {"id": 42, "name": "casora.zip"}]}
REL_WITHOUT = {"tag_name": "v99.0.1", "assets": []}


async def test_download():
    calls: list[tuple[str, str]] = []
    mode = {"asset": "ok"}

    async def fake_get(hass, path, *, accept="application/vnd.github+json", timeout=20, raw=False, max_bytes=None):
        calls.append((path, accept))
        if path.startswith("/releases/assets/"):
            if mode["asset"] == "ok":
                return PACKAGE
            raise update_source.UpdateSourceError(mode["asset"])
        if path.startswith("/zipball/"):
            return ARCHIVE
        raise AssertionError(path)

    update_source._get = fake_get
    hass = object()

    data = await update_source.download_release(hass, "v99.0.2", REL_WITH)
    check("asset listed → casora.zip via /releases/assets/<id>", data == PACKAGE
          and calls == [("/releases/assets/42", "application/octet-stream")], repr(calls))

    calls.clear()
    data = await update_source.download_release(hass, "v99.0.1", REL_WITHOUT)
    check("no asset → repo archive", data == ARCHIVE and [c[0] for c in calls] == ["/zipball/v99.0.1"], repr(calls))

    calls.clear()
    data = await update_source.download_release(hass, "v99.0.1")
    check("no release info (old callers) → repo archive", data == ARCHIVE and len(calls) == 1, repr(calls))

    calls.clear()
    mode["asset"] = "not_found"
    data = await update_source.download_release(hass, "v99.0.2", REL_WITH)
    check("asset download fails → falls back to repo archive", data == ARCHIVE
          and [c[0] for c in calls] == ["/releases/assets/42", "/zipball/v99.0.2"], repr(calls))

    calls.clear()
    mode["asset"] = "rate_limited"
    try:
        await update_source.download_release(hass, "v99.0.2", REL_WITH)
        check("rate limit → no fallback request", False)
    except update_source.UpdateSourceError as err:
        check("rate limit → no fallback request", err.code == "rate_limited" and len(calls) == 1, repr(calls))


def test_build_script():
    out = tempfile.mkdtemp()
    a, b = os.path.join(out, "a", "casora.zip"), os.path.join(out, "b", "casora.zip")
    for path in (a, b):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build-release-zip.py"), path],
                       check=True, capture_output=True, text=True)
    with zipfile.ZipFile(a) as zf:
        names = zf.namelist()
    check("build-release-zip: manifest.json at the root, no folder prefix",
          "manifest.json" in names and not any(n.startswith(("casora/", "custom_components/")) for n in names),
          repr(names[:3]))
    check("build-release-zip: deterministic", open(a, "rb").read() == open(b, "rb").read())
    check("build-release-zip: result passes stage_zip", stage(open(a, "rb").read())[0] not in (None,)
          and not str(stage(open(a, "rb").read())[0]).startswith("error"))


async def main():
    test_layouts()
    await test_download()
    test_build_script()


asyncio.run(main())
if fails:
    print(f"\n{len(fails)} failed")
    sys.exit(1)
print("\nall ok")
