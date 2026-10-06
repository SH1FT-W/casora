"""Update-Entität und Installation robust (update.py) ohne HA-Kern und ohne Netz.

  uv run --python 3.14 --with homeassistant python dev/unit/update_robust_test.py

B-PY-01: nach „Installieren“ und Neuladen der Integration (Optionen geändert) bietet die neu
          angelegte Entität dieselbe Version nicht noch einmal an.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import tempfile
import zipfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import update  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def make_zip(version: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        root = "OWNER-casora-abc123/"
        zf.writestr(root + "custom_components/casora/manifest.json", json.dumps({"version": version}))
        zf.writestr(root + "custom_components/casora/neu.py", "x = 1\n")
    return buf.getvalue()


class Hass:
    def __init__(self, cfg: str):
        self.data = {}
        self.config = SimpleNamespace(path=lambda *p: os.path.join(cfg, *p), config_dir=cfg, language="en")

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


REL = {"tag_name": "v9.0.1", "draft": False, "prerelease": False, "body": "- **New:** x",
       "html_url": "https://github.com/OWNER/casora/releases/tag/v9.0.1", "assets": []}


async def main():
    tmp = tempfile.mkdtemp()
    hass = Hass(tmp)

    async def _rels(h):
        return [REL]

    async def _dl(h, tag):
        return make_zip("9.0.1")

    async def _rec(*a):
        return None

    update.fetch_releases = _rels
    update.download_release = _dl
    update.async_record_install = _rec
    update.ir = SimpleNamespace(async_create_issue=lambda *a, **k: None,
                                IssueSeverity=SimpleNamespace(WARNING="warning"))
    target = hass.config.path("custom_components", "casora")
    os.makedirs(target)
    with open(os.path.join(target, "manifest.json"), "w") as fh:
        json.dump({"version": update.VERSION}, fh)

    # ── B-PY-01 ─────────────────────────────────────────────────────────
    ent = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
    ent.async_write_ha_state = lambda: None
    await ent.async_update()
    check("vorher: 9.0.1 angeboten", ent.latest_version == "9.0.1" and ent.installed_version == update.VERSION)
    await ent.async_install(None, False)
    # Optionen geändert → Integration neu geladen → neue Entität, hass.data bleibt.
    ent2 = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
    check("B-PY-01: neue Entität kennt die installierte Version sofort",
          ent2.installed_version == "9.0.1" and ent2.latest_version == "9.0.1", f"{ent2.installed_version}")
    await ent2.async_update()
    check("B-PY-01: nach Prüfung kein erneutes Angebot", ent2.latest_version == ent2.installed_version == "9.0.1",
          f"{ent2.installed_version} → {ent2.latest_version}")


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
